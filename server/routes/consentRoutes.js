import express from 'express';
import pool from '../db/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Check consent status for current user
router.get('/check', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const { noticeVersion = '1.0.0' } = req.query;

    const [rows] = await pool.query(
      'SELECT * FROM consents WHERE student_id = ? AND notice_version = ?',
      [studentId, noticeVersion]
    );

    res.json({
      accepted: rows.length > 0,
      consent: rows[0] || null
    });
  } catch (err) {
    console.error('Error checking consent:', err);
    res.status(500).json({ error: 'Failed to check consent status' });
  }
});

// Accept consent
router.post('/accept', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const { noticeVersion = '1.0.0' } = req.body;

    const [existing] = await pool.query(
      'SELECT * FROM consents WHERE student_id = ? AND notice_version = ?',
      [studentId, noticeVersion]
    );

    if (existing.length === 0) {
      await pool.query(
        'INSERT INTO consents (student_id, notice_version, accepted_at) VALUES (?, ?, NOW())',
        [studentId, noticeVersion]
      );
    }

    res.json({ success: true, noticeVersion });
  } catch (err) {
    console.error('Error accepting consent:', err);
    res.status(500).json({ error: 'Failed to accept consent' });
  }
});

export default router;
