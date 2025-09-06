
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/dbconnect");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "mysecret";

// ✅ สมัครสมาชิก
router.post("/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role)
      return res.status(400).json({ message: "กรอกข้อมูลให้ครบ" });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query("INSERT INTO user SET ?", {
      username,
      password: hash,
      role,
    });

    res.json({ message: "สมัครสมาชิกสำเร็จ", userId: result.insertId });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ✅ ล็อกอิน
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: "กรอก username และ password" });

    const [rows] = await pool.query("SELECT * FROM user WHERE username = ?", [
      username,
    ]);
    if (!rows.length) return res.status(401).json({ message: "ไม่พบผู้ใช้งาน" });

    const user = rows[0];
    if (!(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ message: "รหัสผ่านไม่ถูกต้อง" });

    // สร้าง token
    const token = jwt.sign(
      { id: user.user_id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // ตั้งค่า cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 60 * 60 * 1000 // 1 ชั่วโมง
    });

    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      token,
      user: { id: user.user_id, username: user.username, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ✅ ออกจากระบบ
router.post("/logout", (req, res) => {
  res.clearCookie("token").json({ message: "Logged out" });
});


module.exports = router;
