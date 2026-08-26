const crypto = require("crypto");
const db = require("../db");

// Get all batches (optionally filter by teacher_id or status)
const getBatches = async (req, res) => {
  const { teacher_id, status } = req.query;

  try {
    let query = `
      SELECT 
        b.batch_id,
        b.teacher_id,
        u.name AS teacher_name,
        u.email AS teacher_email,
        b.name,
        b.description,
        b.fee,
        b.start_date,
        b.status,
        (SELECT COUNT(*) FROM batch_students bs WHERE bs.batch_id = b.batch_id) AS student_count
      FROM batches b, teachers t, users u
      WHERE b.teacher_id = t.teacher_id 
        AND t.user_id = u.user_id
    `;
    const params = [];

    if (teacher_id) {
      query += " AND b.teacher_id = ?";
      params.push(teacher_id);
    }

    if (status) {
      query += " AND b.status = ?";
      params.push(status);
    }

    query += " ORDER BY b.name ASC";

    const [batches] = await db.execute(query, params);
    return res.status(200).json(batches);
  } catch (error) {
    console.error("Get batches error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching batches",
    });
  }
};

// Get a single batch with its enrolled students
const getBatchById = async (req, res) => {
  const { id } = req.params;

  try {
    const [batches] = await db.execute(
      `SELECT 
        b.batch_id,
        b.teacher_id,
        u.name AS teacher_name,
        u.email AS teacher_email,
        b.name,
        b.description,
        b.fee,
        b.start_date,
        b.status,
        (SELECT COUNT(*) FROM batch_students bs WHERE bs.batch_id = b.batch_id) AS student_count
      FROM batches b, teachers t, users u
      WHERE b.teacher_id = t.teacher_id 
        AND t.user_id = u.user_id 
        AND b.batch_id = ?`,
      [id]
    );

    if (batches.length === 0) {
      return res.status(404).json({
        message: "Batch not found",
      });
    }

    const [students] = await db.execute(
      `SELECT 
        s.student_id,
        s.user_id,
        u.name,
        u.email,
        s.phone,
        s.address,
        s.admission_date,
        s.status,
        bs.enrolled_at
      FROM students s, users u, batch_students bs
      WHERE s.user_id = u.user_id 
        AND s.student_id = bs.student_id 
        AND bs.batch_id = ?
      ORDER BY u.name ASC`,
      [id]
    );

    return res.status(200).json({
      ...batches[0],
      students,
    });
  } catch (error) {
    console.error("Get batch by id error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching batch details",
    });
  }
};

// Create a new batch
const createBatch = async (req, res) => {
  const {
    name,
    teacher_id,
    description = null,
    fee = 0,
    start_date = null,
    status = "active",
  } = req.body;

  if (!name) {
    return res.status(400).json({
      message: "Batch name is required",
    });
  }

  const numericFee = Number(fee) >= 0 ? Number(fee) : 0;

  try {
    let assignedTeacherId = teacher_id;

    // If teacher_id is provided, verify teacher exists
    if (assignedTeacherId) {
      const [teachers] = await db.execute(
        "SELECT teacher_id FROM teachers WHERE teacher_id = ?",
        [assignedTeacherId]
      );
      if (teachers.length === 0) {
        return res.status(404).json({
          message: "Specified teacher not found",
        });
      }
    } else {
      // If teacher_id not provided, assign to first available teacher
      const [teachers] = await db.execute("SELECT teacher_id FROM teachers LIMIT 1");
      if (teachers.length > 0) {
        assignedTeacherId = teachers[0].teacher_id;
      }
    }

    if (!assignedTeacherId) {
      return res.status(400).json({
        message: "A teacher must be registered before creating a batch",
      });
    }

    const batchId = crypto.randomUUID();
    await db.execute(
      "INSERT INTO batches (batch_id, teacher_id, name, description, fee, start_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [batchId, assignedTeacherId, name, description, numericFee, start_date, status]
    );

    return res.status(201).json({
      batch_id: batchId,
      teacher_id: assignedTeacherId,
      name,
      description,
      fee: numericFee,
      start_date,
      status,
      message: "Batch created successfully",
    });
  } catch (error) {
    console.error("Create batch error:", error);
    return res.status(500).json({
      message: "Internal server error while creating batch",
    });
  }
};

// Update an existing batch
const updateBatch = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    fee,
    start_date,
    status,
    teacher_id,
  } = req.body;

  if (!id) {
    return res.status(400).json({
      message: "Batch ID is required",
    });
  }

  try {
    const [batches] = await db.execute(
      "SELECT batch_id, teacher_id, name, description, fee, start_date, status FROM batches WHERE batch_id = ?",
      [id]
    );

    if (batches.length === 0) {
      return res.status(404).json({
        message: "Batch not found",
      });
    }

    const currentBatch = batches[0];

    let updatedTeacherId = currentBatch.teacher_id;
    if (teacher_id) {
      const [teachers] = await db.execute(
        "SELECT teacher_id FROM teachers WHERE teacher_id = ?",
        [teacher_id]
      );
      if (teachers.length === 0) {
        return res.status(404).json({
          message: "Specified teacher not found",
        });
      }
      updatedTeacherId = teacher_id;
    }

    const updatedName = name || currentBatch.name;
    const updatedDescription =
      description !== undefined ? description : currentBatch.description;
    const updatedFee =
      fee !== undefined && !isNaN(Number(fee)) && Number(fee) >= 0
        ? Number(fee)
        : Number(currentBatch.fee || 0);
    const updatedStartDate =
      start_date !== undefined ? start_date : currentBatch.start_date;
    const updatedStatus = status || currentBatch.status;

    await db.execute(
      "UPDATE batches SET name = ?, description = ?, fee = ?, start_date = ?, status = ?, teacher_id = ? WHERE batch_id = ?",
      [
        updatedName,
        updatedDescription,
        updatedFee,
        updatedStartDate,
        updatedStatus,
        updatedTeacherId,
        id,
      ]
    );

    return res.status(200).json({
      batch_id: id,
      teacher_id: updatedTeacherId,
      name: updatedName,
      description: updatedDescription,
      fee: updatedFee,
      start_date: updatedStartDate,
      status: updatedStatus,
      message: "Batch updated successfully",
    });
  } catch (error) {
    console.error("Update batch error:", error);
    return res.status(500).json({
      message: "Internal server error while updating batch",
    });
  }
};

// Delete a batch
const deleteBatch = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      message: "Batch ID is required",
    });
  }

  try {
    const [batches] = await db.execute(
      "SELECT batch_id FROM batches WHERE batch_id = ?",
      [id]
    );

    if (batches.length === 0) {
      return res.status(404).json({
        message: "Batch not found",
      });
    }

    // Delete batch (cascades to batch_students)
    await db.execute("DELETE FROM batches WHERE batch_id = ?", [id]);

    return res.status(200).json({
      message: "Batch deleted successfully",
    });
  } catch (error) {
    console.error("Delete batch error:", error);
    return res.status(500).json({
      message: "Internal server error while deleting batch",
    });
  }
};

// Assign existing student to a batch (Multi-batch enrollment via batch_students)
const assignStudentToBatch = async (req, res) => {
  const { id } = req.params;
  const { student_id, student_ids } = req.body;

  try {
    const [batches] = await db.execute(
      "SELECT batch_id FROM batches WHERE batch_id = ?",
      [id]
    );

    if (batches.length === 0) {
      return res.status(404).json({
        message: "Batch not found",
      });
    }

    const targetStudentIds = student_ids || (student_id ? [student_id] : []);

    if (targetStudentIds.length === 0) {
      return res.status(400).json({
        message: "At least one student_id is required",
      });
    }

    let newlyEnrolled = 0;
    for (const sId of targetStudentIds) {
      // Check if student exists
      const [studentCheck] = await db.execute(
        "SELECT student_id FROM students WHERE student_id = ?",
        [sId]
      );
      if (studentCheck.length === 0) continue;

      // Prevent duplicate enrollment in the same batch
      const [existingEnrollment] = await db.execute(
        "SELECT id FROM batch_students WHERE batch_id = ? AND student_id = ?",
        [id, sId]
      );

      if (existingEnrollment.length > 0) {
        continue;
      }

      // Insert new relation only (do NOT update previous batch)
      const relationId = crypto.randomUUID();
      await db.execute(
        "INSERT INTO batch_students (id, batch_id, student_id) VALUES (?, ?, ?)",
        [relationId, id, sId]
      );
      newlyEnrolled++;
    }

    return res.status(200).json({
      message: "Student(s) enrolled in batch successfully",
      enrolled_count: newlyEnrolled,
    });
  } catch (error) {
    console.error("Assign student error:", error);
    return res.status(500).json({
      message: "Internal server error while enrolling student in batch",
    });
  }
};

// Remove student from a batch (Deletes ONLY that batch_students relation)
const removeStudentFromBatch = async (req, res) => {
  const { id, studentId } = req.params;

  try {
    const [enrollment] = await db.execute(
      "SELECT id FROM batch_students WHERE batch_id = ? AND student_id = ?",
      [id, studentId]
    );

    if (enrollment.length === 0) {
      return res.status(404).json({
        message: "Student is not enrolled in this batch",
      });
    }

    // Removing a student deletes ONLY that batch_students record
    await db.execute(
      "DELETE FROM batch_students WHERE batch_id = ? AND student_id = ?",
      [id, studentId]
    );

    return res.status(200).json({
      message: "Student removed from batch successfully",
    });
  } catch (error) {
    console.error("Remove student error:", error);
    return res.status(500).json({
      message: "Internal server error while removing student from batch",
    });
  }
};

module.exports = {
  getBatches,
  getBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
  assignStudentToBatch,
  removeStudentFromBatch,
};
