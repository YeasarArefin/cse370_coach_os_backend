const express = require("express");
const {
  getAttendanceByBatch,
  markAttendance,
} = require("../controllers/attendanceController");

const router = express.Router();

router.get("/:batchId", getAttendanceByBatch);
router.post("/", markAttendance);

module.exports = router;
