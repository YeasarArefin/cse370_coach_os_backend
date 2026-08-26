const express = require("express");
const {
  getFeeStatus,
  getUnpaidStudents,
  getRecentPayments,
  getStudentPayments,
  createPayment,
  updatePayment,
  deletePayment,
  getDueFeeReminders,
  sendFeeReminders,
  getReminderHistory,
} = require("../controllers/feeController");

const router = express.Router();

// Fee status & reporting routes
router.get("/", getFeeStatus);
router.get("/status", getFeeStatus);
router.get("/unpaid", getUnpaidStudents);
router.get("/recent", getRecentPayments);
router.get("/reminders/due", getDueFeeReminders);
router.get("/reminders/history", getReminderHistory);
router.get("/students/:studentId", getStudentPayments);

// Reminder sending route
router.post("/reminders/send", sendFeeReminders);

// Payment mutation routes
router.post("/payments", createPayment);
router.post("/", createPayment);
router.put("/payments/:id", updatePayment);
router.put("/:id", updatePayment);
router.delete("/payments/:id", deletePayment);
router.delete("/:id", deletePayment);

module.exports = router;
