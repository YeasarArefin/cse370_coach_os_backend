const express = require("express");
const router = express.Router();
const {
  getLeaderboardByBatch,
  getGlobalLeaderboard,
} = require("../controllers/leaderboardController");

// GET /api/leaderboard -> Global leaderboard
router.get("/", getGlobalLeaderboard);

// GET /api/leaderboard/:batchId -> Leaderboard for a specific batch
router.get("/:batchId", getLeaderboardByBatch);

module.exports = router;
