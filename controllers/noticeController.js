const crypto = require("crypto");
const db = require("../db");
const { sendNoticeEmail } = require("../utils/mailer");

// Get all notices (optionally filter by batch_id or include global notices)
const getNotices = async (req, res) => {
  const { batch_id } = req.query;

  try {
    let query = `
      SELECT 
        n.notice_id,
        n.batch_id,
        (SELECT b.name FROM batches b WHERE b.batch_id = n.batch_id) AS batch_name,
        n.title,
        n.content,
        n.created_at
      FROM notices n
    `;
    const params = [];

    if (batch_id) {
      query += " WHERE n.batch_id = ? OR n.batch_id IS NULL";
      params.push(batch_id);
    }

    query += " ORDER BY n.created_at DESC";

    const [notices] = await db.execute(query, params);
    return res.status(200).json(notices);
  } catch (error) {
    console.error("Get notices error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching notices",
    });
  }
};

// Create a new notice (Global or Batch-specific) and notify students via email
const createNotice = async (req, res) => {
  const { title, content, batch_id } = req.body;

  if (!title || !content) {
    return res.status(400).json({
      message: "Title and content are required",
    });
  }

  // Normalize batch_id (treat empty string or undefined as null for global notice)
  const targetBatchId = batch_id && batch_id.trim() !== "" ? batch_id : null;

  try {
    let batchName = null;
    let recipientEmails = [];

    if (targetBatchId) {
      // 1. Verify batch exists
      const [batches] = await db.execute(
        "SELECT batch_id, name FROM batches WHERE batch_id = ?",
        [targetBatchId]
      );

      if (batches.length === 0) {
        return res.status(404).json({
          message: "Specified batch not found",
        });
      }

      batchName = batches[0].name;

      // 2. Fetch all student emails in this batch using WHERE clause joins
      const [students] = await db.execute(
        `SELECT u.email 
         FROM users u, students s, batch_students bs 
         WHERE u.user_id = s.user_id 
           AND s.student_id = bs.student_id 
           AND bs.batch_id = ?`,
        [targetBatchId]
      );

      recipientEmails = students.map((s) => s.email).filter(Boolean);
    } else {
      // Global notice: Fetch all student emails
      const [allStudents] = await db.execute(
        `SELECT u.email 
         FROM users u, students s 
         WHERE u.user_id = s.user_id`
      );

      recipientEmails = allStudents.map((s) => s.email).filter(Boolean);
    }

    // 3. Insert notice record using raw SQL
    const noticeId = crypto.randomUUID();
    await db.execute(
      "INSERT INTO notices (notice_id, batch_id, title, content) VALUES (?, ?, ?, ?)",
      [noticeId, targetBatchId, title, content]
    );

    // 4. Send email notifications asynchronously
    if (recipientEmails.length > 0) {
      sendNoticeEmail({
        to: recipientEmails,
        title,
        content,
        batchName,
      }).catch((err) =>
        console.error("Async notice email sending error:", err)
      );
    }

    return res.status(201).json({
      notice_id: noticeId,
      batch_id: targetBatchId,
      batch_name: batchName,
      title,
      content,
      is_global: !targetBatchId,
      notified_count: recipientEmails.length,
      message: "Notice published successfully and email notifications queued",
    });
  } catch (error) {
    console.error("Create notice error:", error);
    return res.status(500).json({
      message: "Internal server error while creating notice",
    });
  }
};

// Delete a notice
const deleteNotice = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      message: "Notice ID is required",
    });
  }

  try {
    const [notices] = await db.execute(
      "SELECT notice_id FROM notices WHERE notice_id = ?",
      [id]
    );

    if (notices.length === 0) {
      return res.status(404).json({
        message: "Notice not found",
      });
    }

    await db.execute("DELETE FROM notices WHERE notice_id = ?", [id]);

    return res.status(200).json({
      message: "Notice deleted successfully",
    });
  } catch (error) {
    console.error("Delete notice error:", error);
    return res.status(500).json({
      message: "Internal server error while deleting notice",
    });
  }
};

module.exports = {
  getNotices,
  createNotice,
  deleteNotice,
};
