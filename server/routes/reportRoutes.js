import express from 'express';
import pool, { query } from '../db/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { canAccessSection } from './sectionRoutes.js';

const router = express.Router();

// POST /api/reports - Student submits video/interruption issue report to teacher
router.post('/', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const { sessionId, session_id, sectionId, section_id, assignmentId, assignment_id, text } = req.body;

    const targetSectionId = sectionId || section_id;
    const targetAssignmentId = assignmentId || assignment_id;
    const targetSessionId = sessionId || session_id;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Report explanation is required.' });
    }

    if (!targetSectionId) {
      return res.status(400).json({ error: 'Section ID is required to route report to instructor.' });
    }

    // Verify student belongs to section
    if (req.user.role === 'student') {
      const enr = await query('SELECT id FROM enrollments WHERE section_id = ? AND student_id = ?', [targetSectionId, studentId]);
      if (enr.length === 0) {
        return res.status(403).json({ error: 'You are not enrolled in this section.' });
      }
    }

    // If session_id provided, verify it exists in sessions table
    let validSessionId = null;
    if (targetSessionId && !isNaN(targetSessionId)) {
      const sess = await query('SELECT id FROM sessions WHERE id = ?', [Number(targetSessionId)]);
      if (sess.length > 0) {
        validSessionId = Number(targetSessionId);
      }
    }

    const [result] = await pool.query(
      `INSERT INTO reports (session_id, student_id, section_id, assignment_id, text, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        validSessionId,
        studentId,
        Number(targetSectionId),
        targetAssignmentId ? Number(targetAssignmentId) : null,
        text.trim(),
      ]
    );

    res.status(201).json({
      id: result.insertId,
      status: 'pending',
      message: 'Report shared successfully with your teacher / instructor.',
    });
  } catch (err) {
    console.error('Error submitting report:', err);
    res.status(500).json({ error: 'Failed to submit report: ' + err.message });
  }
});

// GET /api/reports/section/:sectionId - List reports for a section (Staff / Admin)
router.get('/section/:sectionId', authenticateToken, requireRole(['staff', 'admin']), async (req, res) => {
  try {
    const { sectionId } = req.params;
    const hasAccess = await canAccessSection(req.user, sectionId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You can only view reports for sections you manage.' });
    }

    const rows = await query(
      `SELECT r.id, r.session_id, r.student_id, r.section_id, r.assignment_id,
              r.text, r.status, r.created_at,
              u.full_name as student_name, u.user_id as roll_number, u.email as student_email,
              a.title as assignment_title
       FROM reports r
       JOIN users u ON r.student_id = u.id
       LEFT JOIN assignments a ON r.assignment_id = a.id
       WHERE r.section_id = ?
       ORDER BY r.created_at DESC`,
      [sectionId]
    );

    res.json(rows);
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).json({ error: 'Failed to fetch reports: ' + err.message });
  }
});

// GET /api/reports/staff - List all reports for all sections belonging to this teacher
router.get('/staff', authenticateToken, requireRole(['staff', 'admin']), async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      rows = await query(
        `SELECT r.id, r.session_id, r.student_id, r.section_id, r.assignment_id,
                r.text, r.status, r.created_at,
                u.full_name as student_name, u.user_id as roll_number, u.email as student_email,
                s.name as section_name, s.section_code,
                a.title as assignment_title
         FROM reports r
         JOIN users u ON r.student_id = u.id
         JOIN sections s ON r.section_id = s.id
         LEFT JOIN assignments a ON r.assignment_id = a.id
         ORDER BY r.created_at DESC`
      );
    } else {
      rows = await query(
        `SELECT r.id, r.session_id, r.student_id, r.section_id, r.assignment_id,
                r.text, r.status, r.created_at,
                u.full_name as student_name, u.user_id as roll_number, u.email as student_email,
                s.name as section_name, s.section_code,
                a.title as assignment_title
         FROM reports r
         JOIN users u ON r.student_id = u.id
         JOIN sections s ON r.section_id = s.id
         LEFT JOIN assignments a ON r.assignment_id = a.id
         WHERE s.owner_id = ? OR s.id IN (SELECT section_id FROM section_staff WHERE staff_id = ?)
         ORDER BY r.created_at DESC`,
        [req.user.id, req.user.id]
      );
    }

    res.json(rows);
  } catch (err) {
    console.error('Error fetching staff reports:', err);
    res.status(500).json({ error: 'Failed to fetch reports: ' + err.message });
  }
});

// GET /api/reports/my - Student views their own submitted reports
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const rows = await query(
      `SELECT r.*, a.title as assignment_title, s.name as section_name
       FROM reports r
       LEFT JOIN assignments a ON r.assignment_id = a.id
       JOIN sections s ON r.section_id = s.id
       WHERE r.student_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    res.json(rows);
  } catch (err) {
    console.error('Error fetching my reports:', err);
    res.status(500).json({ error: 'Failed to fetch reports: ' + err.message });
  }
});

// PUT /api/reports/:id/status - Update report status (Staff / Admin)
router.put('/:id/status', authenticateToken, requireRole(['staff', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'reviewed', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Status must be pending, reviewed, or resolved.' });
    }

    const reportRows = await query('SELECT section_id FROM reports WHERE id = ?', [id]);
    if (reportRows.length === 0) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    // Access control: verify staff manages this section
    const hasAccess = await canAccessSection(req.user, reportRows[0].section_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to review this report.' });
    }

    await pool.query('UPDATE reports SET status = ? WHERE id = ?', [status, id]);
    res.json({ success: true, status });
  } catch (err) {
    console.error('Error updating report status:', err);
    res.status(500).json({ error: 'Failed to update report status' });
  }
});

export default router;
