const db = require("../db");

/**
 * Get comprehensive dashboard summary data using raw SQL
 */
const getDashboardSummary = async (req, res) => {
  try {
    const currentMonth = new Date().toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });

    // 1. Total Active Students Count
    const [[{ total_students }]] = await db.execute(
      "SELECT COUNT(*) AS total_students FROM students WHERE status = 'active'"
    );

    // 2. Total Batches Count
    const [[{ total_batches }]] = await db.execute(
      "SELECT COUNT(*) AS total_batches FROM batches"
    );

    // 3. Today's Attendance Statistics
    const [attendanceTodayRows] = await db.execute(
      "SELECT status, COUNT(*) AS count FROM attendance WHERE date = CURDATE() GROUP BY status"
    );

    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;

    attendanceTodayRows.forEach((row) => {
      if (row.status === "present") presentCount = Number(row.count);
      if (row.status === "absent") absentCount = Number(row.count);
      if (row.status === "late") lateCount = Number(row.count);
    });

    const totalAttendanceMarked = presentCount + absentCount + lateCount;
    const attendancePercentage =
      totalAttendanceMarked > 0
        ? Number(
            (((presentCount + lateCount) / totalAttendanceMarked) * 100).toFixed(
              1
            )
          )
        : 0;

    // 4. Pending & Collected Fees for Current Month
    // A. Fetch all batch fees for active students
    const [studentBatchRows] = await db.execute(
      `SELECT bs.student_id, b.fee AS batch_fee
      FROM batch_students bs, batches b, students s
      WHERE bs.batch_id = b.batch_id
        AND bs.student_id = s.student_id
        AND s.status = 'active'`
    );

    const studentFeeMap = new Map();
    studentBatchRows.forEach((row) => {
      const current = studentFeeMap.get(row.student_id) || 0;
      studentFeeMap.set(row.student_id, current + Number(row.batch_fee || 0));
    });

    // Sum total expected monthly tuition fees
    let totalExpectedFees = 0;
    studentFeeMap.forEach((fee) => {
      totalExpectedFees += fee;
    });

    // B. Fetch total collected payments for this month
    const [monthPayments] = await db.execute(
      "SELECT student_id, amount FROM payments WHERE month = ? AND status = 'paid'",
      [currentMonth]
    );

    let totalCollectedFees = 0;
    const paidStudentSet = new Set();
    monthPayments.forEach((p) => {
      totalCollectedFees += Number(p.amount || 0);
      paidStudentSet.add(p.student_id);
    });

    const paidCount = paidStudentSet.size;
    const unpaidCount = Math.max(0, Number(total_students) - paidCount);
    const totalPendingFees = Math.max(0, totalExpectedFees - totalCollectedFees);
    const collectionPercentage =
      totalExpectedFees > 0
        ? Number(((totalCollectedFees / totalExpectedFees) * 100).toFixed(1))
        : 0;

    // 5. Upcoming Assignments (deadline >= CURDATE() or recent active)
    const [upcomingAssignments] = await db.execute(
      `SELECT 
        a.assignment_id,
        a.title,
        a.description,
        a.deadline,
        a.batch_id,
        b.name AS batch_name
      FROM assignments a, batches b
      WHERE a.batch_id = b.batch_id
      ORDER BY 
        CASE WHEN a.deadline >= CURDATE() THEN 0 ELSE 1 END,
        a.deadline ASC,
        a.created_at DESC
      LIMIT 5`
    );

    // 6. Upcoming Exams (exam_date >= CURDATE() or recent active)
    const [upcomingExams] = await db.execute(
      `SELECT 
        e.exam_id,
        e.title,
        e.exam_date,
        e.total_marks,
        e.batch_id,
        b.name AS batch_name
      FROM exams e, batches b
      WHERE e.batch_id = b.batch_id
      ORDER BY 
        CASE WHEN e.exam_date >= CURDATE() THEN 0 ELSE 1 END,
        e.exam_date ASC,
        e.created_at DESC
      LIMIT 5`
    );

    // 7. Recent Notices
    const [allBatches] = await db.execute(
      "SELECT batch_id, name FROM batches"
    );
    const batchMap = new Map();
    allBatches.forEach((b) => batchMap.set(b.batch_id, b.name));

    const [recentNoticesRaw] = await db.execute(
      `SELECT 
        notice_id,
        title,
        content,
        created_at,
        batch_id
      FROM notices
      ORDER BY created_at DESC
      LIMIT 5`
    );

    const recentNotices = recentNoticesRaw.map((n) => ({
      notice_id: n.notice_id,
      title: n.title,
      content: n.content,
      created_at: n.created_at,
      batch_id: n.batch_id,
      batch_name: n.batch_id ? batchMap.get(n.batch_id) || "Batch" : "Global Announcement",
    }));

    // 8. Recent Payment Records
    const [recentPayments] = await db.execute(
      `SELECT 
        p.payment_id,
        p.amount,
        p.payment_date,
        p.month,
        p.status,
        u.name AS student_name,
        u.email AS student_email
      FROM payments p, students s, users u
      WHERE p.student_id = s.student_id
        AND s.user_id = u.user_id
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT 5`
    );

    return res.status(200).json({
      summary: {
        total_students: Number(total_students),
        total_batches: Number(total_batches),
        today_attendance: {
          date: new Date().toISOString().split("T")[0],
          total_marked: totalAttendanceMarked,
          present_count: presentCount,
          absent_count: absentCount,
          late_count: lateCount,
          attendance_percentage: attendancePercentage,
        },
        fee_status: {
          month: currentMonth,
          total_expected: totalExpectedFees,
          total_collected: totalCollectedFees,
          total_pending: totalPendingFees,
          unpaid_count: unpaidCount,
          paid_count: paidCount,
          collection_percentage: collectionPercentage,
        },
      },
      upcoming_assignments: upcomingAssignments,
      upcoming_exams: upcomingExams,
      recent_notices: recentNotices,
      recent_payments: recentPayments,
    });
  } catch (error) {
    console.error("Get dashboard summary error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching dashboard summary data",
    });
  }
};

module.exports = {
  getDashboardSummary,
};
