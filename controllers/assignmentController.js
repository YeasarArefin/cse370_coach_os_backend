const crypto = require("crypto");
const db = require("../db");

// Get all assignments for a specific batch
const getAssignmentsByBatch = async (req, res) => {
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

    // 2. Fetch assignments with WHERE clause join
    const [assignments] = await db.execute(
      `SELECT 
        a.assignment_id,
        a.batch_id,
        b.name AS batch_name,
        a.title,
        a.description,
        a.deadline,
        a.created_at
      FROM assignments a, batches b
      WHERE a.batch_id = b.batch_id
        AND a.batch_id = ?
      ORDER BY a.created_at DESC`,
      [batchId]
    );

    return res.status(200).json(assignments);
  } catch (error) {
    console.error("Get assignments error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching assignments",
    });
  }
};

// Create a new assignment for a batch
const createAssignment = async (req, res) => {
  const { batch_id, title, description, deadline } = req.body;

  if (!batch_id || !title) {
    return res.status(400).json({
      message: "Batch ID and title are required",
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

    // 2. Insert assignment using raw SQL
    const assignmentId = crypto.randomUUID();
    await db.execute(
      "INSERT INTO assignments (assignment_id, batch_id, title, description, deadline) VALUES (?, ?, ?, ?, ?)",
      [
        assignmentId,
        batch_id,
        title,
        description || null,
        deadline || null,
      ]
    );

    return res.status(201).json({
      assignment_id: assignmentId,
      batch_id,
      batch_name: batches[0].name,
      title,
      description: description || null,
      deadline: deadline || null,
      message: "Assignment created successfully",
    });
  } catch (error) {
    console.error("Create assignment error:", error);
    return res.status(500).json({
      message: "Internal server error while creating assignment",
    });
  }
};

// Update an existing assignment
const updateAssignment = async (req, res) => {
  const { id } = req.params;
  const { title, description, deadline, batch_id } = req.body;

  if (!id) {
    return res.status(400).json({
      message: "Assignment ID is required",
    });
  }

  try {
    // 1. Check if assignment exists
    const [assignments] = await db.execute(
      "SELECT assignment_id, batch_id, title, description, deadline FROM assignments WHERE assignment_id = ?",
      [id]
    );

    if (assignments.length === 0) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    const currentAssignment = assignments[0];
    let targetBatchId = currentAssignment.batch_id;

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

    const updatedTitle = title !== undefined ? title : currentAssignment.title;
    const updatedDescription =
      description !== undefined ? description : currentAssignment.description;
    const updatedDeadline =
      deadline !== undefined ? deadline : currentAssignment.deadline;

    // 3. Update assignment record
    await db.execute(
      "UPDATE assignments SET batch_id = ?, title = ?, description = ?, deadline = ? WHERE assignment_id = ?",
      [targetBatchId, updatedTitle, updatedDescription, updatedDeadline, id]
    );

    return res.status(200).json({
      assignment_id: id,
      batch_id: targetBatchId,
      title: updatedTitle,
      description: updatedDescription,
      deadline: updatedDeadline,
      message: "Assignment updated successfully",
    });
  } catch (error) {
    console.error("Update assignment error:", error);
    return res.status(500).json({
      message: "Internal server error while updating assignment",
    });
  }
};

// Delete an assignment
const deleteAssignment = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      message: "Assignment ID is required",
    });
  }

  try {
    const [assignments] = await db.execute(
      "SELECT assignment_id FROM assignments WHERE assignment_id = ?",
      [id]
    );

    if (assignments.length === 0) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    await db.execute("DELETE FROM assignments WHERE assignment_id = ?", [id]);

    return res.status(200).json({
      message: "Assignment deleted successfully",
    });
  } catch (error) {
    console.error("Delete assignment error:", error);
    return res.status(500).json({
      message: "Internal server error while deleting assignment",
    });
  }
};

module.exports = {
  getAssignmentsByBatch,
  createAssignment,
  updateAssignment,
  deleteAssignment,
};
