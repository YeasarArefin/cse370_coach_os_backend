const crypto = require("crypto");
const db = require("../db");

// Helper: Format default month string (e.g. "August 2026")
const getDefaultMonth = () => {
  const date = new Date();
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
};

// 1. Get student fee / payment status for a specific month (and optional batch filter)
const getFeeStatus = async (req, res) => {
  let { month, batch_id } = req.query;

  if (!month || month.trim() === "") {
    month = getDefaultMonth();
  }

  try {
    // A. Fetch students (filtered by batch if provided)
    let studentQuery = `
      SELECT 
        s.student_id,
        s.user_id,
        u.name AS student_name,
        u.email AS student_email,
        s.phone,
        s.admission_date,
        s.status AS student_status
      FROM students s, users u
      WHERE s.user_id = u.user_id
    `;
    const studentParams = [];

    if (batch_id) {
      studentQuery = `
        SELECT 
          s.student_id,
          s.user_id,
          u.name AS student_name,
          u.email AS student_email,
          s.phone,
          s.admission_date,
          s.status AS student_status
        FROM students s, users u, batch_students bs
        WHERE s.user_id = u.user_id
          AND s.student_id = bs.student_id
          AND bs.batch_id = ?
      `;
      studentParams.push(batch_id);
    }

    studentQuery += " ORDER BY u.name ASC";
    const [students] = await db.execute(studentQuery, studentParams);

    // B. Fetch batch enrollments for students using WHERE join
    const [batchEnrollments] = await db.execute(
      `SELECT 
        bs.student_id,
        b.batch_id,
        b.name AS batch_name,
        b.fee AS batch_fee
      FROM batch_students bs, batches b
      WHERE bs.batch_id = b.batch_id`
    );

    const studentBatchesMap = new Map();
    batchEnrollments.forEach((be) => {
      if (!studentBatchesMap.has(be.student_id)) {
        studentBatchesMap.set(be.student_id, []);
      }
      studentBatchesMap.get(be.student_id).push({
        batch_id: be.batch_id,
        name: be.batch_name,
        fee: Number(be.batch_fee || 0),
      });
    });

    // C. Fetch all payment records for this month
    const [payments] = await db.execute(
      `SELECT 
        p.payment_id,
        p.student_id,
        p.amount,
        p.payment_date,
        p.month,
        p.status,
        p.created_at
      FROM payments p
      WHERE p.month = ?`,
      [month]
    );

    // Map payments by student_id
    const paymentMap = new Map();
    payments.forEach((p) => {
      paymentMap.set(p.student_id, p);
    });

    // D. Build student fee status list with auto-calculated expected batch fees
    let totalCollected = 0;
    let totalExpected = 0;
    let paidCount = 0;

    const studentList = students.map((s) => {
      const payment = paymentMap.get(s.student_id);
      const isPaid = payment && payment.status === "paid";
      const batchesList = studentBatchesMap.get(s.student_id) || [];
      const expectedFee = batchesList.reduce(
        (sum, b) => sum + Number(b.fee || 0),
        0
      );

      totalExpected += expectedFee;

      if (isPaid) {
        paidCount++;
        totalCollected += Number(payment.amount || 0);
      }

      return {
        student_id: s.student_id,
        user_id: s.user_id,
        student_name: s.student_name,
        student_email: s.student_email,
        phone: s.phone,
        batches: batchesList,
        batch_name: batchesList.map((b) => b.name).join(", ") || "Unassigned",
        student_status: s.student_status,
        expected_fee: expectedFee,
        payment_id: payment ? payment.payment_id : null,
        amount: payment ? Number(payment.amount) : null,
        payment_date: payment ? payment.payment_date : null,
        month: month,
        status: isPaid ? "paid" : "unpaid",
      };
    });

    return res.status(200).json({
      month,
      batch_id: batch_id || null,
      summary: {
        total_students: students.length,
        paid_count: paidCount,
        unpaid_count: students.length - paidCount,
        total_expected: totalExpected,
        total_collected: totalCollected,
      },
      students: studentList,
      payments: payments,
    });
  } catch (error) {
    console.error("Get fee status error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching fee status",
    });
  }
};

// 2. Get students who have NOT paid fees for a specified month
const getUnpaidStudents = async (req, res) => {
  let { month, batch_id } = req.query;

  if (!month || month.trim() === "") {
    month = getDefaultMonth();
  }

  try {
    let query = `
      SELECT 
        s.student_id,
        s.user_id,
        u.name AS student_name,
        u.email AS student_email,
        s.phone,
        s.admission_date,
        s.status AS student_status
      FROM students s, users u
      WHERE s.user_id = u.user_id
    `;
    const params = [];

    if (batch_id) {
      query = `
        SELECT 
          s.student_id,
          s.user_id,
          u.name AS student_name,
          u.email AS student_email,
          s.phone,
          s.admission_date,
          s.status AS student_status
        FROM students s, users u, batch_students bs
        WHERE s.user_id = u.user_id
          AND s.student_id = bs.student_id
          AND bs.batch_id = ?
      `;
      params.push(batch_id);
    }

    query += " ORDER BY u.name ASC";
    const [allStudents] = await db.execute(query, params);

    // Fetch payments for this month with status 'paid'
    const [paidRecords] = await db.execute(
      "SELECT student_id FROM payments WHERE month = ? AND status = 'paid'",
      [month]
    );

    const paidSet = new Set(paidRecords.map((p) => p.student_id));

    // Fetch batch memberships with fee
    const [batchEnrollments] = await db.execute(
      `SELECT 
        bs.student_id,
        b.batch_id,
        b.name AS batch_name,
        b.fee AS batch_fee
      FROM batch_students bs, batches b
      WHERE bs.batch_id = b.batch_id`
    );

    const studentBatchesMap = new Map();
    batchEnrollments.forEach((be) => {
      if (!studentBatchesMap.has(be.student_id)) {
        studentBatchesMap.set(be.student_id, []);
      }
      studentBatchesMap.get(be.student_id).push({
        batch_id: be.batch_id,
        name: be.batch_name,
        fee: Number(be.batch_fee || 0),
      });
    });

    const unpaidStudents = allStudents
      .filter((s) => !paidSet.has(s.student_id))
      .map((s) => {
        const batchesList = studentBatchesMap.get(s.student_id) || [];
        const expectedFee = batchesList.reduce(
          (sum, b) => sum + Number(b.fee || 0),
          0
        );
        return {
          ...s,
          batch_name: batchesList.map((b) => b.name).join(", ") || "Unassigned",
          batches: batchesList,
          expected_fee: expectedFee,
          month,
          status: "unpaid",
        };
      });

    return res.status(200).json({
      month,
      unpaid_count: unpaidStudents.length,
      students: unpaidStudents,
    });
  } catch (error) {
    console.error("Get unpaid students error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching unpaid students",
    });
  }
};

// 3. Get recently paid students / recent payment history
const getRecentPayments = async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  try {
    const [payments] = await db.execute(
      `SELECT 
        p.payment_id,
        p.student_id,
        u.name AS student_name,
        u.email AS student_email,
        p.amount,
        p.payment_date,
        p.month,
        p.status,
        p.created_at
      FROM payments p, students s, users u
      WHERE p.student_id = s.student_id
        AND s.user_id = u.user_id
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT ${limit}`
    );

    return res.status(200).json(payments);
  } catch (error) {
    console.error("Get recent payments error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching recent payments",
    });
  }
};

// 4. Get payment history for a specific student
const getStudentPayments = async (req, res) => {
  const { studentId } = req.params;

  if (!studentId) {
    return res.status(400).json({
      message: "Student ID is required",
    });
  }

  try {
    const [payments] = await db.execute(
      `SELECT 
        p.payment_id,
        p.student_id,
        p.amount,
        p.payment_date,
        p.month,
        p.status,
        p.created_at
      FROM payments p
      WHERE p.student_id = ?
      ORDER BY p.payment_date DESC, p.created_at DESC`,
      [studentId]
    );

    return res.status(200).json(payments);
  } catch (error) {
    console.error("Get student payments error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching student payments",
    });
  }
};

// 5. Record a new payment
const createPayment = async (req, res) => {
  const {
    student_id,
    amount,
    payment_date,
    month,
    status = "paid",
  } = req.body;

  if (!student_id || amount === undefined || amount === null || !month) {
    return res.status(400).json({
      message: "Student ID, amount, and month are required",
    });
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({
      message: "Amount must be a positive number",
    });
  }

  const paymentDate = payment_date || new Date().toISOString().split("T")[0];

  try {
    // 1. Verify student exists
    const [students] = await db.execute(
      `SELECT s.student_id, u.name, u.email 
       FROM students s, users u 
       WHERE s.user_id = u.user_id 
         AND s.student_id = ?`,
      [student_id]
    );

    if (students.length === 0) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    const student = students[0];

    // 2. Insert payment record
    const paymentId = crypto.randomUUID();
    await db.execute(
      "INSERT INTO payments (payment_id, student_id, amount, payment_date, month, status) VALUES (?, ?, ?, ?, ?, ?)",
      [paymentId, student_id, numericAmount, paymentDate, month, status]
    );

    return res.status(201).json({
      payment_id: paymentId,
      student_id,
      student_name: student.name,
      student_email: student.email,
      amount: numericAmount,
      payment_date: paymentDate,
      month,
      status,
      message: "Payment recorded successfully",
    });
  } catch (error) {
    console.error("Create payment error:", error);
    return res.status(500).json({
      message: "Internal server error while recording payment",
    });
  }
};

// 6. Update an existing payment record
const updatePayment = async (req, res) => {
  const { id } = req.params;
  const { amount, payment_date, month, status, student_id } = req.body;

  if (!id) {
    return res.status(400).json({
      message: "Payment ID is required",
    });
  }

  try {
    // 1. Verify payment exists
    const [payments] = await db.execute(
      "SELECT payment_id, student_id, amount, payment_date, month, status FROM payments WHERE payment_id = ?",
      [id]
    );

    if (payments.length === 0) {
      return res.status(404).json({
        message: "Payment record not found",
      });
    }

    const currentPayment = payments[0];
    let targetStudentId = currentPayment.student_id;

    if (student_id) {
      const [students] = await db.execute(
        "SELECT student_id FROM students WHERE student_id = ?",
        [student_id]
      );
      if (students.length === 0) {
        return res.status(404).json({
          message: "Specified student not found",
        });
      }
      targetStudentId = student_id;
    }

    let updatedAmount = currentPayment.amount;
    if (amount !== undefined && amount !== null && amount !== "") {
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({
          message: "Amount must be a positive number",
        });
      }
      updatedAmount = parsedAmount;
    }

    const updatedPaymentDate =
      payment_date !== undefined ? payment_date : currentPayment.payment_date;
    const updatedMonth = month !== undefined ? month : currentPayment.month;
    const updatedStatus = status !== undefined ? status : currentPayment.status;

    // 2. Update payment
    await db.execute(
      "UPDATE payments SET student_id = ?, amount = ?, payment_date = ?, month = ?, status = ? WHERE payment_id = ?",
      [
        targetStudentId,
        updatedAmount,
        updatedPaymentDate,
        updatedMonth,
        updatedStatus,
        id,
      ]
    );

    return res.status(200).json({
      payment_id: id,
      student_id: targetStudentId,
      amount: updatedAmount,
      payment_date: updatedPaymentDate,
      month: updatedMonth,
      status: updatedStatus,
      message: "Payment updated successfully",
    });
  } catch (error) {
    console.error("Update payment error:", error);
    return res.status(500).json({
      message: "Internal server error while updating payment",
    });
  }
};

// 7. Delete a payment record
const deletePayment = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      message: "Payment ID is required",
    });
  }

  try {
    const [payments] = await db.execute(
      "SELECT payment_id FROM payments WHERE payment_id = ?",
      [id]
    );

    if (payments.length === 0) {
      return res.status(404).json({
        message: "Payment record not found",
      });
    }

    await db.execute("DELETE FROM payments WHERE payment_id = ?", [id]);

    return res.status(200).json({
      message: "Payment deleted successfully",
    });
  } catch (error) {
    console.error("Delete payment error:", error);
    return res.status(500).json({
      message: "Internal server error while deleting payment",
    });
  }
};

// 8. Get students whose monthly payment is due based on their admission date
const getDueFeeReminders = async (req, res) => {
  let { month } = req.query;
  if (!month || month.trim() === "") {
    month = getDefaultMonth();
  }

  try {
    // Fetch active students using WHERE join
    const [students] = await db.execute(
      `SELECT 
        s.student_id,
        s.user_id,
        u.name AS student_name,
        u.email AS student_email,
        s.phone,
        s.admission_date,
        s.status AS student_status
      FROM students s, users u
      WHERE s.user_id = u.user_id 
        AND s.status = 'active'
      ORDER BY u.name ASC`
    );

    // Fetch batch enrollments with fee using WHERE join
    const [batchEnrollments] = await db.execute(
      `SELECT 
        bs.student_id,
        b.batch_id,
        b.name AS batch_name,
        b.fee AS batch_fee
      FROM batch_students bs, batches b
      WHERE bs.batch_id = b.batch_id`
    );

    const studentBatchesMap = new Map();
    batchEnrollments.forEach((be) => {
      if (!studentBatchesMap.has(be.student_id)) {
        studentBatchesMap.set(be.student_id, []);
      }
      studentBatchesMap.get(be.student_id).push({
        batch_id: be.batch_id,
        name: be.batch_name,
        fee: Number(be.batch_fee || 0),
      });
    });

    // Fetch paid payments for this month
    const [paidRecords] = await db.execute(
      "SELECT student_id FROM payments WHERE month = ? AND status = 'paid'",
      [month]
    );
    const paidSet = new Set(paidRecords.map((p) => p.student_id));

    const today = new Date();
    const currentDay = today.getDate();

    // Filter unpaid students and compute due date based on admission date
    const dueStudents = students
      .filter((s) => !paidSet.has(s.student_id))
      .map((s) => {
        const batches = studentBatchesMap.get(s.student_id) || [];
        const expectedFee = batches.reduce(
          (sum, b) => sum + Number(b.fee || 0),
          0
        );

        // Determine billing cycle day from admission date (e.g. 15th of the month)
        let billingDay = 1;
        let admissionDateStr = null;
        if (s.admission_date) {
          const admDate = new Date(s.admission_date);
          if (!isNaN(admDate.getTime())) {
            billingDay = admDate.getDate();
            admissionDateStr = admDate.toISOString().split("T")[0];
          }
        }

        // Due date format string for display (e.g. "August 15, 2026")
        const dueDate = `${month.split(" ")[0]} ${billingDay}, ${
          month.split(" ")[1] || today.getFullYear()
        }`;

        const isOverdue = currentDay >= billingDay;
        const daysDifference = currentDay - billingDay;

        return {
          student_id: s.student_id,
          student_name: s.student_name,
          student_email: s.student_email,
          phone: s.phone,
          admission_date: admissionDateStr,
          billing_day: billingDay,
          due_date: dueDate,
          is_overdue: isOverdue,
          days_overdue: isOverdue ? daysDifference : 0,
          month,
          expected_fee: expectedFee,
          batches,
          batch_names: batches.map((b) => b.name).join(", ") || "Unassigned",
        };
      });

    return res.status(200).json({
      month,
      total_due_students: dueStudents.length,
      students: dueStudents,
    });
  } catch (error) {
    console.error("Get due fee reminders error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching due fee reminders",
    });
  }
};

// 9. Send monthly fee reminder emails to due students
const sendFeeReminders = async (req, res) => {
  let { student_ids, month } = req.body;
  if (!month || month.trim() === "") {
    month = getDefaultMonth();
  }

  try {
    // 1. Fetch active students
    const [students] = await db.execute(
      `SELECT 
        s.student_id,
        s.user_id,
        u.name AS student_name,
        u.email AS student_email,
        s.admission_date
      FROM students s, users u
      WHERE s.user_id = u.user_id 
        AND s.status = 'active'`
    );

    // 2. Fetch batch enrollments with fee
    const [batchEnrollments] = await db.execute(
      `SELECT 
        bs.student_id,
        b.batch_id,
        b.name AS batch_name,
        b.fee AS batch_fee
      FROM batch_students bs, batches b
      WHERE bs.batch_id = b.batch_id`
    );

    const studentBatchesMap = new Map();
    batchEnrollments.forEach((be) => {
      if (!studentBatchesMap.has(be.student_id)) {
        studentBatchesMap.set(be.student_id, []);
      }
      studentBatchesMap.get(be.student_id).push({
        name: be.batch_name,
        fee: Number(be.batch_fee || 0),
      });
    });

    // 3. Fetch paid payments for this month
    const [paidRecords] = await db.execute(
      "SELECT student_id FROM payments WHERE month = ? AND status = 'paid'",
      [month]
    );
    const paidSet = new Set(paidRecords.map((p) => p.student_id));

    // Target students: filtered by student_ids if provided, and unpaid for the month
    const targetStudentIdSet = student_ids ? new Set(student_ids) : null;
    const candidates = students.filter((s) => {
      if (paidSet.has(s.student_id)) return false;
      if (targetStudentIdSet && !targetStudentIdSet.has(s.student_id)) return false;
      return true;
    });

    if (candidates.length === 0) {
      return res.status(200).json({
        message: "No unpaid students requiring reminders for this month",
        sent_count: 0,
        failed_count: 0,
        results: [],
      });
    }

    const { sendFeeReminderEmail } = require("../utils/mailer");
    const results = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const student of candidates) {
      const batches = studentBatchesMap.get(student.student_id) || [];
      const expectedFee = batches.reduce(
        (sum, b) => sum + Number(b.fee || 0),
        0
      );
      const batchNames = batches.map((b) => b.name).join(", ") || "General Tuition";

      let billingDay = 1;
      if (student.admission_date) {
        const admDate = new Date(student.admission_date);
        if (!isNaN(admDate.getTime())) {
          billingDay = admDate.getDate();
        }
      }

      const dueDate = `${month.split(" ")[0]} ${billingDay}, ${
        month.split(" ")[1] || new Date().getFullYear()
      }`;

      const emailRes = await sendFeeReminderEmail({
        to: student.student_email,
        studentName: student.student_name,
        month,
        amount: expectedFee,
        dueDate,
        batchNames,
      });

      const reminderId = crypto.randomUUID();
      const status = emailRes.success ? "sent" : "failed";

      try {
        await db.execute(
          "INSERT INTO reminder_history (reminder_id, student_id, month, amount, due_date, status) VALUES (?, ?, ?, ?, ?, ?)",
          [reminderId, student.student_id, month, expectedFee, dueDate, status]
        );
      } catch (logErr) {
        console.error("Failed to log reminder history:", logErr.message);
      }

      if (emailRes.success) {
        sentCount++;
        results.push({
          reminder_id: reminderId,
          student_id: student.student_id,
          student_name: student.student_name,
          email: student.student_email,
          status: "sent",
          messageId: emailRes.messageId,
        });
      } else {
        failedCount++;
        results.push({
          reminder_id: reminderId,
          student_id: student.student_id,
          student_name: student.student_name,
          email: student.student_email,
          status: "failed",
          error: emailRes.error,
        });
      }
    }

    return res.status(200).json({
      message: `Fee reminders processed: ${sentCount} sent, ${failedCount} failed`,
      month,
      sent_count: sentCount,
      failed_count: failedCount,
      results,
    });
  } catch (error) {
    console.error("Send fee reminders error:", error);
    return res.status(500).json({
      message: "Internal server error while sending fee reminders",
    });
  }
};

// 10. Automated monthly background routine to check and send reminders
const checkAndSendMonthlyReminders = async () => {
  try {
    const month = getDefaultMonth();
    console.log(`[Fee Reminder Auto-Routine] Running check for ${month}...`);

    const [students] = await db.execute(
      `SELECT 
        s.student_id,
        u.name AS student_name,
        u.email AS student_email,
        s.admission_date
      FROM students s, users u
      WHERE s.user_id = u.user_id 
        AND s.status = 'active'`
    );

    const [paidRecords] = await db.execute(
      "SELECT student_id FROM payments WHERE month = ? AND status = 'paid'",
      [month]
    );
    const paidSet = new Set(paidRecords.map((p) => p.student_id));

    const [batchEnrollments] = await db.execute(
      `SELECT 
        bs.student_id,
        b.name AS batch_name,
        b.fee AS batch_fee
      FROM batch_students bs, batches b
      WHERE bs.batch_id = b.batch_id`
    );

    const studentBatchesMap = new Map();
    batchEnrollments.forEach((be) => {
      if (!studentBatchesMap.has(be.student_id)) {
        studentBatchesMap.set(be.student_id, []);
      }
      studentBatchesMap.get(be.student_id).push({
        name: be.batch_name,
        fee: Number(be.batch_fee || 0),
      });
    });

    const today = new Date();
    const currentDay = today.getDate();
    const { sendFeeReminderEmail } = require("../utils/mailer");

    let sent = 0;
    for (const student of students) {
      if (paidSet.has(student.student_id)) continue;

      let billingDay = 1;
      if (student.admission_date) {
        const admDate = new Date(student.admission_date);
        if (!isNaN(admDate.getTime())) {
          billingDay = admDate.getDate();
        }
      }

      // Send reminder if today is on or after the admission billing day
      if (currentDay >= billingDay) {
        const batches = studentBatchesMap.get(student.student_id) || [];
        const expectedFee = batches.reduce((sum, b) => sum + Number(b.fee || 0), 0);
        const batchNames = batches.map((b) => b.name).join(", ") || "General Tuition";
        const dueDate = `${month.split(" ")[0]} ${billingDay}, ${today.getFullYear()}`;

        const emailRes = await sendFeeReminderEmail({
          to: student.student_email,
          studentName: student.student_name,
          month,
          amount: expectedFee,
          dueDate,
          batchNames,
        });

        const reminderId = crypto.randomUUID();
        const status = emailRes.success ? "sent" : "failed";
        try {
          await db.execute(
            "INSERT INTO reminder_history (reminder_id, student_id, month, amount, due_date, status) VALUES (?, ?, ?, ?, ?, ?)",
            [reminderId, student.student_id, month, expectedFee, dueDate, status]
          );
        } catch (e) {}

        sent++;
      }
    }

    console.log(`[Fee Reminder Auto-Routine] Automated reminders sent: ${sent}`);
  } catch (error) {
    console.error("[Fee Reminder Auto-Routine] Error:", error.message);
  }
};

// 11. Get reminder history list
const getReminderHistory = async (req, res) => {
  try {
    const [history] = await db.execute(
      `SELECT 
        rh.reminder_id,
        rh.student_id,
        rh.month,
        rh.amount,
        rh.due_date,
        rh.sent_at,
        rh.status,
        u.name AS student_name,
        u.email AS student_email,
        s.phone,
        s.admission_date
      FROM reminder_history rh, students s, users u
      WHERE rh.student_id = s.student_id
        AND s.user_id = u.user_id
      ORDER BY rh.sent_at DESC`
    );

    return res.status(200).json(history);
  } catch (error) {
    console.error("Get reminder history error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching reminder history",
    });
  }
};

module.exports = {
  getFeeStatus,
  getUnpaidStudents,
  getRecentPayments,
  getStudentPayments,
  createPayment,
  updatePayment,
  deletePayment,
  getDueFeeReminders,
  sendFeeReminders,
  checkAndSendMonthlyReminders,
  getReminderHistory,
};
