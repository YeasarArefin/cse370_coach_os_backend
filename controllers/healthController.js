const db = require("../db");
const { sendNoticeEmail } = require("../utils/mailer");

const getHealth = async (req, res) => {
  try {
    await db.query("SELECT 1");

    return res.status(200).json({
      status: "ok",
      database: "connected",
      message: "Server is healthy",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      database: "disconnected",
      message: error.message,
    });
  }
};

const testEmail = async (req, res) => {
  const targetEmail = req.query.to || process.env.SMTP_USER;

  if (!targetEmail) {
    return res.status(400).json({
      success: false,
      message: "Please provide a recipient email as ?to=your_email@gmail.com",
    });
  }

  try {
    const result = await sendNoticeEmail({
      to: targetEmail,
      title: "CoachOS Render Email Test",
      content: "If you are reading this email, your Render.com SMTP setup is working perfectly!",
      batchName: "System Diagnostics",
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: `Test email sent successfully to ${targetEmail}`,
        details: result,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to send test email",
        error: result.error,
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Exception occurred during email test",
      error: err.message,
    });
  }
};

module.exports = {
  getHealth,
  testEmail,
};

