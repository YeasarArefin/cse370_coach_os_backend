const express = require("express");
const {
  getExamsByBatch,
  createExam,
  updateExam,
  deleteExam,
} = require("../controllers/examController");

const router = express.Router();

router.get("/:batchId", getExamsByBatch);
router.post("/", createExam);
router.put("/:id", updateExam);
router.delete("/:id", deleteExam);

module.exports = router;
