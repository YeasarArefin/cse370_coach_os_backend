require("dotenv").config();
const express = require("express");
const cors = require("cors");
const healthRoute = require("./routes/healthRoute");
const authRoute = require("./routes/authRoute");
const studentRoute = require("./routes/studentRoute");
const batchRoute = require("./routes/batchRoute");
const attendanceRoute = require("./routes/attendanceRoute");
const noticeRoute = require("./routes/noticeRoute");

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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
