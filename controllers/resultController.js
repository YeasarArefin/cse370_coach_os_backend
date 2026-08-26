const crypto = require("crypto");
const db = require("../db");

// Helper: Calculate and update rankings for all students in an exam
const calculateRanks = async (examId) => {
  const [allResults] = await db.execute(
    "SELECT result_id, marks_obtained FROM results WHERE exam_id = ? ORDER BY marks_obtained DESC, created_at ASC",
    [examId]
  );

  let currentRank = 1;
  for (let i = 0; i < allResults.length; i++) {
    if (
      i > 0 &&
      Number(allResults[i].marks_obtained) <
        Number(allResults[i - 1].marks_obtained)
    ) {
      currentRank = i + 1;
    }
    await db.execute("UPDATE results SET `rank` = ? WHERE result_id = ?", [
      currentRank,
      allResults[i].result_id,
    ]);
  }
};

// Get results for a specific exam with student details & ranking
const getResultsByExam = async (req, res) => {
  const { examId } = req.params;

  if (!examId) {
    return res.status(400).json({
      message: "Exam ID is required",
    });
  }

  try {
    // 1. Verify exam exists and retrieve batch information
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
        AND e.exam_id = ?`,
      [examId]
    );

    if (exams.length === 0) {
      return res.status(404).json({
        message: "Exam not found",
      });
    }

    const exam = exams[0];

    // 2. Fetch all enrolled students in the exam's batch using WHERE joins
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
      [exam.batch_id]
    );

    // 3. Fetch all recorded results for this exam
    const [results] = await db.execute(
      `SELECT 
        r.result_id,
        r.exam_id,
        r.student_id,
        u.name AS student_name,
        u.email AS student_email,
        r.marks_obtained,
        r.rank,
        r.created_at
      FROM results r, students s, users u
      WHERE r.student_id = s.student_id
        AND s.user_id = u.user_id
        AND r.exam_id = ?
      ORDER BY r.rank ASC, r.marks_obtained DESC`,
      [examId]
    );

    // 4. Map results by student_id
    const resultMap = new Map();
    results.forEach((r) => {
      resultMap.set(r.student_id, r);
    });

    const studentList = students.map((s) => {
      const recorded = resultMap.get(s.student_id);
      return {
        student_id: s.student_id,
        user_id: s.user_id,
        student_name: s.student_name,
        student_email: s.student_email,
        phone: s.phone,
        result_id: recorded ? recorded.result_id : null,
        marks_obtained: recorded ? Number(recorded.marks_obtained) : null,
        rank: recorded ? recorded.rank : null,
        is_marked: !!recorded,
      };
    });

    const numericResults = results.map((r) => Number(r.marks_obtained));

    return res.status(200).json({
      exam_id: exam.exam_id,
      batch_id: exam.batch_id,
      batch_name: exam.batch_name,
      title: exam.title,
      exam_date: exam.exam_date,
      total_marks: exam.total_marks,
      summary: {
        total_students: students.length,
        marked_count: results.length,
        unmarked_count: Math.max(0, students.length - results.length),
        average_marks:
          numericResults.length > 0
            ? Number(
                (
                  numericResults.reduce((a, b) => a + b, 0) /
                  numericResults.length
                ).toFixed(2)
              )
            : null,
        highest_marks:
          numericResults.length > 0 ? Math.max(...numericResults) : null,
        lowest_marks:
          numericResults.length > 0 ? Math.min(...numericResults) : null,
      },
      students: studentList,
      results: results,
    });
  } catch (error) {
    console.error("Get results error:", error);
    return res.status(500).json({
      message: "Internal server error while fetching results",
    });
  }
};

// Record/save marks for a single student or multiple students in an exam
const createResult = async (req, res) => {
  const { exam_id, student_id, marks_obtained, records } = req.body;

  if (!exam_id) {
    return res.status(400).json({
      message: "Exam ID is required",
    });
  }

  try {
    // 1. Verify exam exists
    const [exams] = await db.execute(
      "SELECT exam_id, batch_id, total_marks FROM exams WHERE exam_id = ?",
      [exam_id]
    );

    if (exams.length === 0) {
      return res.status(404).json({
        message: "Specified exam not found",
      });
    }

    const totalMarks = Number(exams[0].total_marks);

    // Case A: Bulk save records array
    if (Array.isArray(records) && records.length > 0) {
      for (const item of records) {
        if (
          !item.student_id ||
          item.marks_obtained === undefined ||
          item.marks_obtained === null ||
          item.marks_obtained === ""
        ) {
          continue;
        }

        const numericMarks = Number(item.marks_obtained);
        if (isNaN(numericMarks) || numericMarks < 0 || numericMarks > totalMarks) {
          continue;
        }

        const [existing] = await db.execute(
          "SELECT result_id FROM results WHERE exam_id = ? AND student_id = ?",
          [exam_id, item.student_id]
        );

        if (existing.length > 0) {
          await db.execute(
            "UPDATE results SET marks_obtained = ? WHERE result_id = ?",
            [numericMarks, existing[0].result_id]
          );
        } else {
          await db.execute(
            "INSERT INTO results (result_id, exam_id, student_id, marks_obtained) VALUES (?, ?, ?, ?)",
            [crypto.randomUUID(), exam_id, item.student_id, numericMarks]
          );
        }
      }

      // Recalculate rankings
      await calculateRanks(exam_id);

      return res.status(201).json({
        exam_id,
        saved_count: records.length,
        message: "Exam marks saved and rankings calculated successfully",
      });
    }

    // Case B: Single student result
    if (
      !student_id ||
      marks_obtained === undefined ||
      marks_obtained === null ||
      marks_obtained === ""
    ) {
      return res.status(400).json({
        message: "Student ID and marks obtained are required",
      });
    }

    const numericMarks = Number(marks_obtained);
    if (isNaN(numericMarks) || numericMarks < 0 || numericMarks > totalMarks) {
      return res.status(400).json({
        message: `Marks obtained must be a valid number between 0 and total marks (${totalMarks})`,
      });
    }

    // Verify student exists
    const [students] = await db.execute(
      "SELECT student_id FROM students WHERE student_id = ?",
      [student_id]
    );

    if (students.length === 0) {
      return res.status(404).json({
        message: "Specified student not found",
      });
    }

    const [existing] = await db.execute(
      "SELECT result_id FROM results WHERE exam_id = ? AND student_id = ?",
      [exam_id, student_id]
    );

    let resultId;
    if (existing.length > 0) {
      resultId = existing[0].result_id;
      await db.execute(
        "UPDATE results SET marks_obtained = ? WHERE result_id = ?",
        [numericMarks, resultId]
      );
    } else {
      resultId = crypto.randomUUID();
      await db.execute(
        "INSERT INTO results (result_id, exam_id, student_id, marks_obtained) VALUES (?, ?, ?, ?)",
        [resultId, exam_id, student_id, numericMarks]
      );
    }

    // Recalculate rankings
    await calculateRanks(exam_id);

    // Retrieve updated result with rank
    const [saved] = await db.execute(
      "SELECT result_id, exam_id, student_id, marks_obtained, `rank` FROM results WHERE result_id = ?",
      [resultId]
    );

    return res.status(201).json({
      ...saved[0],
      message: "Result recorded and ranking calculated successfully",
    });
  } catch (error) {
    console.error("Create result error:", error);
    return res.status(500).json({
      message: "Internal server error while saving result",
    });
  }
};

// Update an existing result record
const updateResult = async (req, res) => {
  const { id } = req.params;
  const { marks_obtained } = req.body;

  if (!id) {
    return res.status(400).json({
      message: "Result ID is required",
    });
  }

  if (
    marks_obtained === undefined ||
    marks_obtained === null ||
    marks_obtained === ""
  ) {
    return res.status(400).json({
      message: "Marks obtained is required",
    });
  }

  try {
    // 1. Verify result exists and retrieve total_marks from exam
    const [results] = await db.execute(
      `SELECT r.result_id, r.exam_id, r.student_id, e.total_marks
       FROM results r, exams e
       WHERE r.exam_id = e.exam_id
         AND r.result_id = ?`,
      [id]
    );

    if (results.length === 0) {
      return res.status(404).json({
        message: "Result not found",
      });
    }

    const totalMarks = Number(results[0].total_marks);
    const numericMarks = Number(marks_obtained);

    if (isNaN(numericMarks) || numericMarks < 0 || numericMarks > totalMarks) {
      return res.status(400).json({
        message: `Marks obtained must be a valid number between 0 and total marks (${totalMarks})`,
      });
    }

    // 2. Update result
    await db.execute(
      "UPDATE results SET marks_obtained = ? WHERE result_id = ?",
      [numericMarks, id]
    );

    // 3. Recalculate rankings
    await calculateRanks(results[0].exam_id);

    // 4. Retrieve updated result with student details and new rank
    const [updated] = await db.execute(
      `SELECT 
        r.result_id,
        r.exam_id,
        r.student_id,
        u.name AS student_name,
        u.email AS student_email,
        r.marks_obtained,
        r.rank
      FROM results r, students s, users u
      WHERE r.student_id = s.student_id
        AND s.user_id = u.user_id
        AND r.result_id = ?`,
      [id]
    );

    return res.status(200).json({
      ...updated[0],
      message: "Result updated and ranking recalculated successfully",
    });
  } catch (error) {
    console.error("Update result error:", error);
    return res.status(500).json({
      message: "Internal server error while updating result",
    });
  }
};

module.exports = {
  getResultsByExam,
  createResult,
  updateResult,
};
