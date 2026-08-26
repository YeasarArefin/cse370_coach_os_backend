const crypto = require("crypto");
const db = require("../db");

// Get all exams for a specific batch
const getExamsByBatch = async (req, res) => {
  const { batchId } = req.params;

  if (!batchId) {
    return res.status(400).json({
      message: "Batch ID is required",
    });
  }

  try {
    // 1. Verify batch exists
    const [batches] = await db.execute(
      "SELECT batch_id, name FROM batches WHERE batch_id = ?",
      [batchId]
    );

    if (batches.length === 0) {
      return res.status(404).json({
        message: "Batch not found",
      });
    }

    // 2. Fetch exams with WHERE clause join
    const [exams] = await db.execute(
      `SELECT 
        e.exam_id,
        e.batch_id,
        b.name AS batch_name,
        e.title,
        e.exam_date,
        e.total_marks,
        e.created_at
      FROM exams e, batches b
      WHERE e.batch_id = b.batch_id
        AND e.batch_id = ?
      ORDER BY e.exam_date DESC, e.created_at DESC`,
      [batchId]
    );

    return res.status(200).json(exams);
  } catch (error) {
    console.error("Get exams error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching exams",
    });
  }
};

// Create a new exam for a batch
const createExam = async (req, res) => {
  const { batch_id, title, exam_date, total_marks } = req.body;

  if (
    !batch_id ||
    !title ||
    total_marks === undefined ||
    total_marks === null ||
    total_marks === ""
  ) {
    return res.status(400).json({
      message: "Batch ID, title, and total marks are required",
    });
  }

  const numericMarks = Number(total_marks);
  if (isNaN(numericMarks) || numericMarks <= 0) {
    return res.status(400).json({
      message: "Total marks must be a positive number",
    });
  }

  try {
    // 1. Verify batch exists
    const [batches] = await db.execute(
      "SELECT batch_id, name FROM batches WHERE batch_id = ?",
      [batch_id]
    );

    if (batches.length === 0) {
      return res.status(404).json({
        message: "Specified batch not found",
      });
    }

    // 2. Insert exam using raw SQL
    const examId = crypto.randomUUID();
    await db.execute(
      "INSERT INTO exams (exam_id, batch_id, title, exam_date, total_marks) VALUES (?, ?, ?, ?, ?)",
      [examId, batch_id, title, exam_date || null, numericMarks]
    );

    return res.status(201).json({
      exam_id: examId,
      batch_id,
      batch_name: batches[0].name,
      title,
      exam_date: exam_date || null,
      total_marks: numericMarks,
      message: "Exam created successfully",
    });
  } catch (error) {
    console.error("Create exam error:", error);
    return res.status(500).json({
      message: "Internal server error while creating exam",
    });
  }
};

// Update an existing exam
const updateExam = async (req, res) => {
  const { id } = req.params;
  const { batch_id, title, exam_date, total_marks } = req.body;

  if (!id) {
    return res.status(400).json({
      message: "Exam ID is required",
    });
  }

  try {
    // 1. Check if exam exists
    const [exams] = await db.execute(
      "SELECT exam_id, batch_id, title, exam_date, total_marks FROM exams WHERE exam_id = ?",
      [id]
    );

    if (exams.length === 0) {
      return res.status(404).json({
        message: "Exam not found",
      });
    }

    const currentExam = exams[0];
    let targetBatchId = currentExam.batch_id;

    // 2. If changing batch_id, verify new batch exists
    if (batch_id) {
      const [batches] = await db.execute(
        "SELECT batch_id FROM batches WHERE batch_id = ?",
        [batch_id]
      );

      if (batches.length === 0) {
        return res.status(404).json({
          message: "Specified batch not found",
        });
      }
      targetBatchId = batch_id;
    }

    let updatedTotalMarks = currentExam.total_marks;
    if (
      total_marks !== undefined &&
      total_marks !== null &&
      total_marks !== ""
    ) {
      const parsed = Number(total_marks);
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({
          message: "Total marks must be a positive number",
        });
      }
      updatedTotalMarks = parsed;
    }

    const updatedTitle = title !== undefined ? title : currentExam.title;
    const updatedExamDate =
      exam_date !== undefined ? exam_date : currentExam.exam_date;

    // 3. Update exam record
    await db.execute(
      "UPDATE exams SET batch_id = ?, title = ?, exam_date = ?, total_marks = ? WHERE exam_id = ?",
      [targetBatchId, updatedTitle, updatedExamDate, updatedTotalMarks, id]
    );

    return res.status(200).json({
      exam_id: id,
      batch_id: targetBatchId,
      title: updatedTitle,
      exam_date: updatedExamDate,
      total_marks: updatedTotalMarks,
      message: "Exam updated successfully",
    });
  } catch (error) {
    console.error("Update exam error:", error);
    return res.status(500).json({
      message: "Internal server error while updating exam",
    });
  }
};

// Delete an exam
const deleteExam = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      message: "Exam ID is required",
    });
  }

  try {
    const [exams] = await db.execute(
      "SELECT exam_id FROM exams WHERE exam_id = ?",
      [id]
    );

    if (exams.length === 0) {
      return res.status(404).json({
        message: "Exam not found",
      });
    }

    await db.execute("DELETE FROM exams WHERE exam_id = ?", [id]);

    return res.status(200).json({
      message: "Exam deleted successfully",
    });
  } catch (error) {
    console.error("Delete exam error:", error);
    return res.status(500).json({
      message: "Internal server error while deleting exam",
    });
  }
};

module.exports = {
  getExamsByBatch,
  createExam,
  updateExam,
  deleteExam,
};
