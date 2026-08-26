const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db");

// Get all students (optionally filter by batch_id)
const getStudents = async (req, res) => {
  const { batch_id } = req.query;

  try {
    let query = `
      SELECT 
        s.student_id,
        s.user_id,
        u.name,
        u.email,
        s.admission_date,
        s.phone,
        s.address,
        s.status,
        u.created_at
      FROM students s, users u
      WHERE s.user_id = u.user_id
    `;
    const params = [];

    if (batch_id) {
      query = `
        SELECT 
          s.student_id,
          s.user_id,
          u.name,
          u.email,
          s.admission_date,
          s.phone,
          s.address,
          s.status,
          u.created_at
        FROM students s, users u, batch_students bs
        WHERE s.user_id = u.user_id
          AND s.student_id = bs.student_id
          AND bs.batch_id = ?
      `;
      params.push(batch_id);
    }

    query += " ORDER BY u.created_at DESC";

    const [students] = await db.execute(query, params);

    // Fetch all batch enrollments for students using WHERE joins
    const [allEnrollments] = await db.execute(
      `SELECT 
        bs.student_id,
        b.batch_id,
        b.name AS batch_name,
        b.fee AS batch_fee
      FROM batch_students bs, batches b
      WHERE bs.batch_id = b.batch_id`
    );

    // Group batches by student_id
    const enrollmentMap = new Map();
    for (const item of allEnrollments) {
      if (!enrollmentMap.has(item.student_id)) {
        enrollmentMap.set(item.student_id, []);
      }
      enrollmentMap.get(item.student_id).push({
        batch_id: item.batch_id,
        name: item.batch_name,
        fee: Number(item.batch_fee || 0),
      });
    }

    // Attach batch list, combined batch names, and auto-calculated total fee to student object
    const result = students.map((s) => {
      const studentBatches = enrollmentMap.get(s.student_id) || [];
      const batchNames = studentBatches.map((b) => b.name).join(", ");
      const primaryBatchId =
        studentBatches.length > 0 ? studentBatches[0].batch_id : null;
      const totalFee = studentBatches.reduce(
        (sum, b) => sum + Number(b.fee || 0),
        0
      );

      return {
        ...s,
        batch_id: primaryBatchId,
        batch_name: batchNames || "Unassigned",
        batches: studentBatches,
        total_fee: totalFee,
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get students error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching students",
    });
  }
};

// Create a new student account
const createStudent = async (req, res) => {
  const {
    name,
    email,
    password,
    batch_id,
    phone = null,
    address = null,
    admission_date = null,
    status = "active",
  } = req.body;

  if (!name || !email || !password || !batch_id) {
    return res.status(400).json({
      message: "Name, email, password, and batch_id are required",
    });
  }

  try {
    // Check if email is already in use
    const [existingUsers] = await db.execute(
      "SELECT user_id FROM users WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    // Check if batch exists
    const [existingBatches] = await db.execute(
      "SELECT batch_id FROM batches WHERE batch_id = ?",
      [batch_id]
    );

    if (existingBatches.length === 0) {
      return res.status(404).json({
        message: "Specified batch not found",
      });
    }

    // Hash password & generate IDs
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    const studentId = crypto.randomUUID();
    const batchStudentId = crypto.randomUUID();

    // 1. Insert user record with role 'student'
    await db.execute(
      "INSERT INTO users (user_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
      [userId, name, email, hashedPassword, "student"]
    );

    // 2. Insert student record
    await db.execute(
      "INSERT INTO students (student_id, user_id, batch_id, admission_date, phone, address, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [studentId, userId, batch_id, admission_date, phone, address, status]
    );

    // 3. Insert initial enrollment relation into batch_students
    await db.execute(
      "INSERT INTO batch_students (id, batch_id, student_id) VALUES (?, ?, ?)",
      [batchStudentId, batch_id, studentId]
    );

    return res.status(201).json({
      student_id: studentId,
      user_id: userId,
      name,
      email,
      batch_id,
      admission_date,
      phone,
      address,
      status,
      message: "Student created successfully",
    });
  } catch (error) {
    console.error("Create student error:", error);
    return res.status(500).json({
      message: "Internal server error while creating student",
    });
  }
};

// Update an existing student profile
const updateStudent = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    email,
    batch_id,
    phone,
    address,
    admission_date,
    status,
  } = req.body;

  if (!id) {
    return res.status(400).json({
      message: "Student ID is required",
    });
  }

  try {
    // Check if student exists
    const [students] = await db.execute(
      "SELECT student_id, user_id FROM students WHERE student_id = ?",
      [id]
    );

    if (students.length === 0) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    const userId = students[0].user_id;

    // If email is provided, check if another user already has it
    if (email) {
      const [emailCheck] = await db.execute(
        "SELECT user_id FROM users WHERE email = ? AND user_id != ?",
        [email, userId]
      );

      if (emailCheck.length > 0) {
        return res.status(409).json({
          message: "Email is already in use by another user",
        });
      }
    }

    // Update users table if name or email provided
    if (name || email) {
      const [currentUser] = await db.execute(
        "SELECT name, email FROM users WHERE user_id = ?",
        [userId]
      );
      const updatedName = name || currentUser[0].name;
      const updatedEmail = email || currentUser[0].email;

      await db.execute(
        "UPDATE users SET name = ?, email = ? WHERE user_id = ?",
        [updatedName, updatedEmail, userId]
      );
    }

    // Update students table
    const [currentStudent] = await db.execute(
      "SELECT phone, address, admission_date, status FROM students WHERE student_id = ?",
      [id]
    );
    const updatedPhone = phone !== undefined ? phone : currentStudent[0].phone;
    const updatedAddress = address !== undefined ? address : currentStudent[0].address;
    const updatedAdmissionDate = admission_date !== undefined ? admission_date : currentStudent[0].admission_date;
    const updatedStatus = status || currentStudent[0].status;

    await db.execute(
      "UPDATE students SET phone = ?, address = ?, admission_date = ?, status = ? WHERE student_id = ?",
      [updatedPhone, updatedAddress, updatedAdmissionDate, updatedStatus, id]
    );

    // If a batch_id was specified, ensure it is added to batch_students without removing other batches
    if (batch_id) {
      const [existingEnrollment] = await db.execute(
        "SELECT id FROM batch_students WHERE batch_id = ? AND student_id = ?",
        [batch_id, id]
      );

      if (existingEnrollment.length === 0) {
        await db.execute(
          "INSERT INTO batch_students (id, batch_id, student_id) VALUES (?, ?, ?)",
          [crypto.randomUUID(), batch_id, id]
        );
      }
    }

    return res.status(200).json({
      student_id: id,
      user_id: userId,
      name,
      email,
      phone: updatedPhone,
      address: updatedAddress,
      admission_date: updatedAdmissionDate,
      status: updatedStatus,
      message: "Student updated successfully",
    });
  } catch (error) {
    console.error("Update student error:", error);
    return res.status(500).json({
      message: "Internal server error while updating student",
    });
  }
};

// Delete a student (cascades to students and batch_students)
const deleteStudent = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      message: "Student ID is required",
    });
  }

  try {
    const [students] = await db.execute(
      "SELECT student_id, user_id FROM students WHERE student_id = ?",
      [id]
    );

    if (students.length === 0) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    const userId = students[0].user_id;

    // Deleting from users cascades to students and batch_students
    await db.execute("DELETE FROM users WHERE user_id = ?", [userId]);

    return res.status(200).json({
      message: "Student deleted successfully",
    });
  } catch (error) {
    console.error("Delete student error:", error);
    return res.status(500).json({
      message: "Internal server error while deleting student",
    });
  }
};

module.exports = {
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
};
