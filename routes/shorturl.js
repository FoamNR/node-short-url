const express = require("express");
const { nanoid } = require("nanoid");
const QRCode = require("qrcode");
const pool = require("../config/dbconnect");
const authenticateToken = require("../middleware/auth");
const { body, validationResult } = require("express-validator");

const router = express.Router();

// สร้าง short URL
router.post("/shorten", 
  authenticateToken,
  [
    body('originalUrl')
      .isURL()
      .withMessage('Please provide a valid URL')
      .notEmpty()
      .withMessage('URL is required')
  ],
  async (req, res) => {
    try {
      // Validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { originalUrl } = req.body;
      
      // ใช้ environment variable สำหรับ base URL
      const baseUrl = process.env.BASE_URL || "http://35.202.71.133:3000";
      const shortId = nanoid(6);
      const shortUrl = `${baseUrl}/${shortId}`;
      
      const qrCode = await QRCode.toDataURL(shortUrl);

      const [result] = await pool.query(
        "INSERT INTO shorturl (original_url, short_url, qr_code, user_id) VALUES (?, ?, ?, ?)",
        [originalUrl, shortUrl, qrCode, req.user.id]
      );

      res.json({
        shorturl_id: result.insertId,
        originalUrl,
        shortUrl,
        qrCode,
        createdBy: req.user.id,
      });
    } catch (err) {
      console.error("Shorten URL error:", err);
      res.status(500).json({ error: "Server error", detail: err.message });
    }
  }
);

//  Redirect
router.get("/:id", async (req, res) => {
  try {
    const baseUrl = process.env.BASE_URL || "http://35.202.71.133:3000";
    const shortUrl = `${baseUrl}/${req.params.id}`;
    
    const [rows] = await pool.query(
      "SELECT shorturl_id, original_url FROM shorturl WHERE short_url = ? LIMIT 1",
      [shortUrl]
    );
    
    if (!rows.length) return res.status(404).send("URL not found");

    const { shorturl_id, original_url } = rows[0];
    
    // บันทึก history
    await pool.query(
      "INSERT INTO history (shorturl_id, accessed_by) VALUES (?, ?)", 
      [shorturl_id, req.ip || req.connection.remoteAddress]
    );

    res.redirect(original_url);
  } catch (err) {
    console.error("Redirect error:", err);
    res.status(500).send("Server error");
  }
});
// ดึงประวัติการเข้าถึงของ short URL ของผู้ใช้
//  ดึงประวัติการเข้าถึง short URL
router.get("/history/:shorturl_id", 
  authenticateToken,
  async (req, res) => {
    try {
      const { shorturl_id } = req.params;
      
      // ตรวจสอบว่า short URL นี้เป็นของ user นี้หรือไม่
      const [urlCheck] = await pool.query(
        "SELECT user_id FROM shorturl WHERE shorturl_id = ?",
        [shorturl_id]
      );
      
      if (!urlCheck.length) {
        return res.status(404).json({ error: "Short URL not found" });
      }
      
      // ตรวจสอบสิทธิ์ (เฉพาะเจ้าของหรือ admin)
      if (urlCheck[0].user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // ดึงประวัติ
      const [history] = await pool.query(
        `SELECT h.history_id, h.access_time, h.accessed_by, s.short_url, s.original_url
         FROM history h
         JOIN shorturl s ON h.shorturl_id = s.shorturl_id
         WHERE h.shorturl_id = ?
         ORDER BY h.access_time DESC`,
        [shorturl_id]
      );
      
      res.json({
        shorturl_id: parseInt(shorturl_id),
        total_visits: history.length,
        history: history
      });
      
    } catch (err) {
      console.error("Get history error:", err);
      res.status(500).json({ error: "Server error", detail: err.message });
    }
  }
);

//  ดึงประวัติทั้งหมดของ user (สำหรับ dashboard)
router.get("/user/history", 
  authenticateToken,
  async (req, res) => {
    try {
      // สำหรับ admin ให้ดูทั้งหมด, สำหรับ user ธรรมดาดูเฉพาะของตัวเอง
      let query = `
        SELECT s.shorturl_id, s.original_url, s.short_url, s.created_at,
               COUNT(h.history_id) as total_visits,
               MAX(h.access_time) as last_accessed
        FROM shorturl s
        LEFT JOIN history h ON s.shorturl_id = h.shorturl_id
      `;
      
      let queryParams = [];
      
      if (req.user.role !== 'admin') {
        query += " WHERE s.user_id = ?";
        queryParams.push(req.user.id);
      }
      
      query += " GROUP BY s.shorturl_id ORDER BY s.created_at DESC";
      
      const [urls] = await pool.query(query, queryParams);
      
      res.json({
        user_id: req.user.id,
        total_urls: urls.length,
        urls: urls
      });
      
    } catch (err) {
      console.error("Get user history error:", err);
      res.status(500).json({ error: "Server error", detail: err.message });
    }
  }
);
router.delete("/:shorturl_id", 
  authenticateToken,
  async (req, res) => {
    try {
      const { shorturl_id } = req.params;

      // ตรวจสอบว่า short URL มีอยู่จริงไหม
      const [urlCheck] = await pool.query(
        "SELECT user_id FROM shorturl WHERE shorturl_id = ?",
        [shorturl_id]
      );

      if (!urlCheck.length) {
        return res.status(404).json({ error: "Short URL not found" });
      }

      // ตรวจสอบสิทธิ์ (เฉพาะเจ้าของหรือ admin)
      if (urlCheck[0].user_id !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }

      // ลบ history ที่เกี่ยวข้องก่อน
      await pool.query("DELETE FROM history WHERE shorturl_id = ?", [shorturl_id]);

      // ลบ shorturl
      await pool.query("DELETE FROM shorturl WHERE shorturl_id = ?", [shorturl_id]);

      res.json({ message: "Short URL deleted successfully", shorturl_id });
    } catch (err) {
      console.error("Delete short URL error:", err);
      res.status(500).json({ error: "Server error", detail: err.message });
    }
  }
);

module.exports = router;