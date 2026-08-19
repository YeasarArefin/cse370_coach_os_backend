const crypto = require("crypto");
const db = require("../db");

// Get attendance for a batch on a specific date
const getAttendanceByBatch = async (req, res) => {
  const { batchId } = req.params;
  let { date } = req.query;

  if (!batchId) {
    return res.status(400).json({
      message: "Batch ID is required",
    });
  }

  // Default to today's date if not provided
  if (!date) {
    date = new Date().toISOString().split("T")[0];
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

    const batchName = batches[0].name;

    // 2. Fetch all students in this batch using batch_students with WHERE joins
    const [students] = await db.execute(
      `SELECT 
        s.student_id,
        s.user_id,
        u.name AS student_name,
        u.email AS student_email,
        s.phone,
        s.status AS student_status
      FROM students s, users u, batch_students bs
      WHERE s.user_id = u.user_id 
        AND s.student_id = bs.student_id 
        AND bs.batch_id = ?
      ORDER BY u.name ASC`,
      [batchId]
    );

    // 3. Fetch attendance records for this batch and date
    const [attendanceRecords] = await db.execute(
      "SELECT attendance_id, student_id, batch_id, date, status FROM attendance WHERE batch_id = ? AND date = ?",
      [batchId, date]
    );

    // Create a lookup map for attendance by student_id
    const attendanceMap = new Map();
    attendanceRecords.forEach((record) => {
      attendanceMap.set(record.student_id, {
        attendance_id: record.attendance_id,
        status: record.status,
      });
    });

    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let unmarkedCount = 0;

    // Merge student list with their attendance status
    const studentAttendanceList = students.map((student) => {
      const att = attendanceMap.get(student.student_id);
      const status = att ? att.status : null;

      if (status === "present") presentCount++;
      else if (status === "absent") absentCount++;
      else if (status === "late") lateCount++;
      else unmarkedCount++;

      return {
        student_id: student.student_id,
        user_id: student.user_id,
        student_name: student.student_name,
        student_email: student.student_email,
        phone: student.phone,
        attendance_id: att ? att.attendance_id : null,
        status: status,
      };
    });

    return res.status(200).json({
      batch_id: batchId,
      batch_name: batchName,
      date: date,
      summary: {
        total_students: students.length,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        unmarked: unmarkedCount,
      },
      students: studentAttendanceList,
    });
  } catch (error) {
    console.error("Get attendance error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching attendance",
    });
  }
};

// Mark attendance (supports batch array of records or single record)
const markAttendance = async (req, res) => {
  const { batch_id, date, records, student_id, status } = req.body;

  if (!batch_id) {
    return res.status(400).json({
      message: "Batch ID is required",
    });
  }

  const targetDate = date || new Date().toISOString().split("T")[0];

  try {
    // 1. Verify batch exists
    const [batches] = await db.execute(
      "SELECT batch_id FROM batches WHERE batch_id = ?",
      [batch_id]
    );

    if (batches.length === 0) {
      return res.status(404).json({
        message: "Batch not found",
      });
    }

    // Build the list of records to process
    let itemsToProcess = [];

    if (Array.isArray(records) && records.length > 0) {
      itemsToProcess = records;
    } else if (student_id && status) {
      itemsToProcess = [{ student_id, status }];
    } else {
      return res.status(400).json({
        message: "Attendance records or (student_id and status) are required",
      });
    }

    const validStatuses = ["present", "absent", "late"];
    let savedCount = 0;

    for (const item of itemsToProcess) {
      if (!item.student_id || !item.status) continue;

      const normalizedStatus = item.status.toLowerCase().trim();
      if (!validStatuses.includes(normalizedStatus)) {
        continue;
      }

      const attendanceId = crypto.randomUUID();

      // Insert or update on duplicate (student_id, date)
      await db.execute(
        `INSERT INTO attendance (attendance_id, student_id, batch_id, date, status) 
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status)`,
        [attendanceId, item.student_id, batch_id, targetDate, normalizedStatus]
      );

      savedCount++;
    }

    return res.status(200).json({
      message: "Attendance recorded successfully",
      batch_id,
      date: targetDate,
      saved_count: savedCount,
    });
  } catch (error) {
    console.error("Mark attendance error:", error);
    return res.status(500).json({
      message: "Internal server error while recording attendance",
    });
  }
};

module.exports = {
  getAttendanceByBatch,
  markAttendance,
};
