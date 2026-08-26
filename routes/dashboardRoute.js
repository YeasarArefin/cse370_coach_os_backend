const express = require("express");
const { getDashboardSummary } = require("../controllers/dashboardController");

const router = express.Router();

// GET /api/dashboard -> Summary data
router.get("/", getDashboardSummary);
router.get("/summary", getDashboardSummary);

module.exports = router;
