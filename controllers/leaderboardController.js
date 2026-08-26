const db = require("../db");

// 1. Get leaderboard by batch ID (or overall if batchId is 'all')
const getLeaderboardByBatch = async (req, res) => {
  const { batchId } = req.params;

  try {
    // A. If batchId is 'all' or not specific, return global leaderboard across all batches
    if (!batchId || batchId === "all") {
      return getGlobalLeaderboard(req, res);
    }

    // B. Verify batch exists
    const [batches] = await db.execute(
      "SELECT batch_id, name, description FROM batches WHERE batch_id = ?",
      [batchId]
    );

    if (batches.length === 0) {
      return res.status(404).json({
        message: "Batch not found",
      });
    }

    const batch = batches[0];

    // C. Fetch all students enrolled in this batch using WHERE join
    const [students] = await db.execute(
      `SELECT 
        s.student_id,
        s.user_id,
        u.name AS student_name,
        u.email AS student_email,
        s.phone
      FROM students s, users u, batch_students bs
      WHERE s.user_id = u.user_id
        AND s.student_id = bs.student_id
        AND bs.batch_id = ?
      ORDER BY u.name ASC`,
      [batchId]
    );

    // D. Fetch all exams in this batch
    const [exams] = await db.execute(
      "SELECT exam_id, title, total_marks, exam_date FROM exams WHERE batch_id = ?",
      [batchId]
    );

    // E. Fetch all results recorded for exams in this batch using WHERE join
    const [results] = await db.execute(
      `SELECT 
        r.result_id,
        r.exam_id,
        r.student_id,
        r.marks_obtained,
        e.title AS exam_title,
        e.total_marks
      FROM results r, exams e
      WHERE r.exam_id = e.exam_id
        AND e.batch_id = ?`,
      [batchId]
    );

    // Map results by student_id
    const studentResultsMap = new Map();
    results.forEach((r) => {
      if (!studentResultsMap.has(r.student_id)) {
        studentResultsMap.set(r.student_id, []);
      }
      studentResultsMap.get(r.student_id).push(r);
    });

    // F. Calculate performance aggregates for each student
    const studentStats = students.map((s) => {
      const studentResults = studentResultsMap.get(s.student_id) || [];
      const examsAttended = studentResults.length;

      const totalMarksObtained = studentResults.reduce(
        (sum, r) => sum + Number(r.marks_obtained || 0),
        0
      );

      const totalPossibleMarks = studentResults.reduce(
        (sum, r) => sum + Number(r.total_marks || 0),
        0
      );

      const averageMarks =
        examsAttended > 0
          ? Number((totalMarksObtained / examsAttended).toFixed(2))
          : 0;

      const percentage =
        totalPossibleMarks > 0
          ? Number(((totalMarksObtained / totalPossibleMarks) * 100).toFixed(2))
          : 0;

      return {
        student_id: s.student_id,
        student_name: s.student_name,
        student_email: s.student_email,
        phone: s.phone,
        exams_attended: examsAttended,
        total_exams_in_batch: exams.length,
        total_marks: totalMarksObtained,
        total_possible_marks: totalPossibleMarks,
        average_marks: averageMarks,
        percentage: percentage,
        exam_breakdown: studentResults.map((r) => ({
          exam_id: r.exam_id,
          exam_title: r.exam_title,
          marks_obtained: Number(r.marks_obtained),
          total_marks: Number(r.total_marks),
        })),
      };
    });

    // G. Rank students: highest percentage / average marks first, then total marks
    studentStats.sort((a, b) => {
      if (b.percentage !== a.percentage) {
        return b.percentage - a.percentage;
      }
      if (b.total_marks !== a.total_marks) {
        return b.total_marks - a.total_marks;
      }
      return a.student_name.localeCompare(b.student_name);
    });

    // Assign rank with tie-handling
    let currentRank = 1;
    const leaderboard = studentStats.map((student, index) => {
      if (index > 0) {
        const prev = studentStats[index - 1];
        if (
          prev.percentage === student.percentage &&
          prev.total_marks === student.total_marks
        ) {
          student.rank = prev.rank;
        } else {
          student.rank = index + 1;
        }
      } else {
        student.rank = 1;
      }
      return student;
    });

    return res.status(200).json({
      batch_id: batch.batch_id,
      batch_name: batch.name,
      total_students: students.length,
      total_exams: exams.length,
      leaderboard,
    });
  } catch (error) {
    console.error("Get leaderboard by batch error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching batch leaderboard",
    });
  }
};

// 2. Get global leaderboard across all batches
const getGlobalLeaderboard = async (req, res) => {
  try {
    // A. Fetch all active students using WHERE join
    const [students] = await db.execute(
      `SELECT 
        s.student_id,
        s.user_id,
        u.name AS student_name,
        u.email AS student_email,
        s.phone
      FROM students s, users u
      WHERE s.user_id = u.user_id
      ORDER BY u.name ASC`
    );

    // B. Fetch batch enrollments for students using WHERE join
    const [batchEnrollments] = await db.execute(
      `SELECT 
        bs.student_id,
        b.batch_id,
        b.name AS batch_name
      FROM batch_students bs, batches b
      WHERE bs.batch_id = b.batch_id`
    );

    const studentBatchesMap = new Map();
    batchEnrollments.forEach((be) => {
      if (!studentBatchesMap.has(be.student_id)) {
        studentBatchesMap.set(be.student_id, []);
      }
      studentBatchesMap.get(be.student_id).push(be.batch_name);
    });

    // C. Fetch all results with exam total_marks using WHERE join
    const [results] = await db.execute(
      `SELECT 
        r.result_id,
        r.exam_id,
        r.student_id,
        r.marks_obtained,
        e.title AS exam_title,
        e.total_marks,
        b.name AS batch_name
      FROM results r, exams e, batches b
      WHERE r.exam_id = e.exam_id
        AND e.batch_id = b.batch_id`
    );

    const [allExams] = await db.execute("SELECT exam_id FROM exams");

    // Group results by student_id
    const studentResultsMap = new Map();
    results.forEach((r) => {
      if (!studentResultsMap.has(r.student_id)) {
        studentResultsMap.set(r.student_id, []);
      }
      studentResultsMap.get(r.student_id).push(r);
    });

    // D. Build aggregate statistics
    const studentStats = students.map((s) => {
      const studentResults = studentResultsMap.get(s.student_id) || [];
      const studentBatches = studentBatchesMap.get(s.student_id) || [];
      const examsAttended = studentResults.length;

      const totalMarksObtained = studentResults.reduce(
        (sum, r) => sum + Number(r.marks_obtained || 0),
        0
      );

      const totalPossibleMarks = studentResults.reduce(
        (sum, r) => sum + Number(r.total_marks || 0),
        0
      );

      const averageMarks =
        examsAttended > 0
          ? Number((totalMarksObtained / examsAttended).toFixed(2))
          : 0;

      const percentage =
        totalPossibleMarks > 0
          ? Number(((totalMarksObtained / totalPossibleMarks) * 100).toFixed(2))
          : 0;

      return {
        student_id: s.student_id,
        student_name: s.student_name,
        student_email: s.student_email,
        phone: s.phone,
        batches: studentBatches,
        batch_name: studentBatches.join(", ") || "Unassigned",
        exams_attended: examsAttended,
        total_marks: totalMarksObtained,
        total_possible_marks: totalPossibleMarks,
        average_marks: averageMarks,
        percentage: percentage,
      };
    });

    // E. Sort and rank
    studentStats.sort((a, b) => {
      if (b.percentage !== a.percentage) {
        return b.percentage - a.percentage;
      }
      if (b.total_marks !== a.total_marks) {
        return b.total_marks - a.total_marks;
      }
      return a.student_name.localeCompare(b.student_name);
    });

    const leaderboard = studentStats.map((student, index) => {
      if (index > 0) {
        const prev = studentStats[index - 1];
        if (
          prev.percentage === student.percentage &&
          prev.total_marks === student.total_marks
        ) {
          student.rank = prev.rank;
        } else {
          student.rank = index + 1;
        }
      } else {
        student.rank = 1;
      }
      return student;
    });

    return res.status(200).json({
      batch_id: "all",
      batch_name: "All Batches (Global)",
      total_students: students.length,
      total_exams: allExams.length,
      leaderboard,
    });
  } catch (error) {
    console.error("Get global leaderboard error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching global leaderboard",
    });
  }
};

module.exports = {
  getLeaderboardByBatch,
  getGlobalLeaderboard,
};
