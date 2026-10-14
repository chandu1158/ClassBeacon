import express from 'express';
import pool from '../db/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Create review
router.post('/', authenticateToken, requireRole(['staff', 'admin']), async (req, res) => {
  try {
    const reviewedBy = req.user.user_id;
    const { sessionId, sectionId, notes, outcome } = req.body;

    const [result] = await pool.query(
      `INSERT INTO reviews (session_id, section_id, notes, outcome, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [sessionId, sectionId, notes || '', outcome || 'resolved', reviewedBy]
    );

    res.status(201).json({ id: result.insertId, outcome });
  } catch (err) {
    console.error('Error submitting review:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

export default router;
