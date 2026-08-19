const express = require("express");
const {
  getBatches,
  getBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
  assignStudentToBatch,
  removeStudentFromBatch,
} = require("../controllers/batchController");

const router = express.Router();

router.get("/", getBatches);
router.get("/:id", getBatchById);
router.post("/", createBatch);
router.put("/:id", updateBatch);
router.delete("/:id", deleteBatch);

// Student Assignment routes
router.post("/:id/students", assignStudentToBatch);
router.delete("/:id/students/:studentId", removeStudentFromBatch);

module.exports = router;
