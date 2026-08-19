const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db");

// Teacher signup
const signup = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      message: "Name, email, and password are required",
    });
  }

  try {
    // Check if user already exists
    const [existingUsers] = await db.execute(
      "SELECT user_id FROM users WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: "An account with this email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    const teacherId = crypto.randomUUID();

    // Insert user
    await db.execute(
      "INSERT INTO users (user_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
      [userId, name, email, hashedPassword, "teacher"]
    );

    // Insert teacher record
    await db.execute(
      "INSERT INTO teachers (teacher_id, user_id) VALUES (?, ?)",
      [teacherId, userId]
    );

    return res.status(201).json({
      id: userId,
      name,
      email,
      role: "teacher",
      message: "Teacher account created successfully",
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({
      message: "Internal server error during signup",
    });
  }
};

// Teacher login
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required",
    });
  }

  try {
    const [users] = await db.execute(
      "SELECT user_id, name, email, password, role FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    return res.status(200).json({
      id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Internal server error during login",
    });
  }
};

module.exports = {
  signup,
  login,
};
