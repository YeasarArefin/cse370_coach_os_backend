const db = require("../db");

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

module.exports = {
  getHealth,
};
