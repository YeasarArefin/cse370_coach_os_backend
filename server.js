require("dotenv").config();
const express = require("express");
const cors = require("cors");
const healthRoute = require("./routes/healthRoute");
const authRoute = require("./routes/authRoute");
const studentRoute = require("./routes/studentRoute");
const batchRoute = require("./routes/batchRoute");
const attendanceRoute = require("./routes/attendanceRoute");
const noticeRoute = require("./routes/noticeRoute");
const assignmentRoute = require("./routes/assignmentRoute");
const examRoute = require("./routes/examRoute");
const resultRoute = require("./routes/resultRoute");
const feeRoute = require("./routes/feeRoute");
const leaderboardRoute = require("./routes/leaderboardRoute");
const dashboardRoute = require("./routes/dashboardRoute");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/health", healthRoute);
app.use("/api/auth", authRoute);
app.use("/api/students", studentRoute);
app.use("/api/batches", batchRoute);
app.use("/api/attendance", attendanceRoute);
app.use("/api/notices", noticeRoute);
app.use("/api/assignments", assignmentRoute);
app.use("/api/exams", examRoute);
app.use("/api/results", resultRoute);
app.use("/api/fees", feeRoute);
app.use("/api/leaderboard", leaderboardRoute);
app.use("/api/dashboard", dashboardRoute);





const { checkAndSendMonthlyReminders } = require("./controllers/feeController");

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Automatically check & send monthly fee reminders on startup
  setTimeout(() => {
    checkAndSendMonthlyReminders();
  }, 5000);

  // Periodic 24-hour routine to automatically process admission-based monthly fee reminders
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    checkAndSendMonthlyReminders();
  }, TWENTY_FOUR_HOURS);
});

