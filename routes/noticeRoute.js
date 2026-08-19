const express = require("express");
const {
  getNotices,
  createNotice,
  deleteNotice,
} = require("../controllers/noticeController");

const router = express.Router();

router.get("/", getNotices);
router.post("/", createNotice);
router.delete("/:id", deleteNotice);

module.exports = router;
