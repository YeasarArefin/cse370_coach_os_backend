const express = require("express");
const {
  getResultsByExam,
  createResult,
  updateResult,
} = require("../controllers/resultController");

const router = express.Router();

router.get("/:examId", getResultsByExam);
router.post("/", createResult);
router.put("/:id", updateResult);

module.exports = router;
