import express from 'express';
import pool, { query } from '../db/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { canAccessSection } from './sectionRoutes.js';

const router = express.Router();

// Start session (Student)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const { assignmentId, assignment_id, sectionId, section_id } = req.body;
    const targetAssignmentId = assignmentId || assignment_id;
    const targetSectionId = sectionId || section_id;

    if (!targetAssignmentId || !targetSectionId) {
      return res.status(400).json({ error: 'Assignment ID and Section ID are required.' });
    }

    const sessionUuid = `SESS_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const [result] = await pool.query(
      `INSERT INTO sessions (session_uuid, student_id, assignment_id, section_id, status, started_at, last_event_at, event_count)
       VALUES (?, ?, ?, ?, 'active', NOW(), NOW(), 0)`,
      [sessionUuid, studentId, Number(targetAssignmentId), Number(targetSectionId)]
    );

    res.status(201).json({
      id: result.insertId,
      session_uuid: sessionUuid,
      student_id: studentId,
      assignment_id: Number(targetAssignmentId),
      section_id: Number(targetSectionId),
      status: 'active',
      started_at: new Date(),
    });
  } catch (err) {
    console.error('Error starting session:', err);
    res.status(500).json({ error: 'Failed to start session: ' + err.message });
  }
});

export const ALLOWED_EVENT_TYPES = new Set([
  'face_absent',
  'looking_away',
  'multiple_faces',
  'second_device',
  'tab_switch',
  'fullscreen_exit',
  'audio_detected',
  'book_detected',
  'phone_detected',
  'head_pose_anomaly',
  'low_light',
  'session_interrupted',
  'session_completed',
  'session_start',
  'heartbeat',
  'proctor_alert',
  'play',
  'pause',
  'seek',
  'rate_change',
  'video_ended'
]);

// Update session status (e.g. completed, interrupted, abandoned)
router.put('/:sessionId/status', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { status, reason } = req.body;

    const [sessRows] = await pool.query('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    if (sessRows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const session = sessRows[0];

    // VULN-04 IDOR Protection: verify user ownership or staff access
    if (req.user.role === 'student' && session.student_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this session.' });
    }
    if (req.user.role === 'staff') {
      const allowed = await canAccessSection(req.user.id, session.section_id);
      if (!allowed) {
        return res.status(403).json({ error: 'Unauthorized: You are not assigned to this section.' });
      }
    }

    const validStatuses = ['active', 'completed', 'abandoned', 'interrupted'];
    const newStatus = validStatuses.includes(status) ? status : 'completed';

    await pool.query(
      'UPDATE sessions SET status = ?, last_event_at = NOW() WHERE id = ?',
      [newStatus, sessionId]
    );

    // If status is interrupted, also record an interruption event
    if (newStatus === 'interrupted') {
      await pool.query(
        `INSERT INTO events (session_id, type, seq, client_at, details_json, server_at)
         VALUES (?, 'session_interrupted', 0, ?, ?, NOW())`,
        [sessionId, Date.now(), JSON.stringify({ reason: typeof reason === 'string' ? reason.slice(0, 255) : 'Student closed player before completing video.' })]
      );
    }

    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error('Error updating session status:', err);
    res.status(500).json({ error: 'Failed to update session status' });
  }
});

// Post session event
router.post('/:sessionId/events', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { type, seq, details } = req.body;

    if (!type || !ALLOWED_EVENT_TYPES.has(type)) {
      return res.status(400).json({ error: 'Invalid or disallowed event type.' });
    }

    const [sessRows] = await pool.query('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    if (sessRows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessRows[0];
    if (session.student_id !== req.user.id && req.user.role === 'student') {
      return res.status(403).json({ error: 'Unauthorized session event' });
    }

    await pool.query(
      `INSERT INTO events (session_id, type, seq, client_at, details_json, server_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [sessionId, type, Number(seq) || 0, Date.now(), JSON.stringify(details && typeof details === 'object' ? details : {})]
    );

    await pool.query(
      `UPDATE sessions SET last_event_at = NOW(), event_count = event_count + 1 WHERE id = ?`,
      [sessionId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error logging session event:', err);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

// POST /api/sessions/:sessionId/snapshots - Capture AI monitoring evidence snapshot
router.post('/:sessionId/snapshots', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { event_type, confidence, snapshot_data, details } = req.body;

    if (!snapshot_data || !event_type) {
      return res.status(400).json({ error: 'Snapshot data and event type are required.' });
    }

    // VULN-08: Validate event_type against whitelist to prevent stored XSS
    if (!ALLOWED_EVENT_TYPES.has(event_type)) {
      return res.status(400).json({ error: 'Invalid or disallowed monitoring event type.' });
    }

    const [sessRows] = await pool.query('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    if (sessRows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const session = sessRows[0];
    if (session.student_id !== req.user.id && req.user.role === 'student') {
      return res.status(403).json({ error: 'Unauthorized snapshot submission.' });
    }

    const confScore = confidence ? Number(confidence) : 0.0;
    const safeDetails = details && typeof details === 'object' ? details : {};
    const detailsJson = JSON.stringify(safeDetails);

    const [result] = await pool.query(
      `INSERT INTO monitoring_snapshots (session_id, student_id, section_id, assignment_id, event_type, confidence, snapshot_data, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        session.id,
        session.student_id,
        session.section_id,
        session.assignment_id,
        event_type,
        confScore,
        snapshot_data,
        detailsJson,
      ]
    );

    // Also register in events timeline
    await pool.query(
      `INSERT INTO events (session_id, type, seq, client_at, details_json, server_at)
       VALUES (?, ?, 0, ?, ?, NOW())`,
      [session.id, event_type, Date.now(), JSON.stringify({ confidence: confScore, snapshot_id: result.insertId, ...safeDetails })]
    );

    await pool.query(
      `UPDATE sessions SET last_event_at = NOW(), event_count = event_count + 1 WHERE id = ?`,
      [session.id]
    );

    res.status(201).json({
      success: true,
      snapshot_id: result.insertId,
      message: 'Evidence snapshot captured and recorded.'
    });
  } catch (err) {
    console.error('Error saving snapshot:', err);
    res.status(500).json({ error: 'Failed to record snapshot: ' + err.message });
  }
});

// GET /api/sessions/snapshots/section/:sectionId - Get all monitoring snapshots for a section (Teacher/Admin with strict section access)
router.get('/snapshots/section/:sectionId', authenticateToken, requireRole(['staff', 'admin']), async (req, res) => {
  try {
    const { sectionId } = req.params;
    const hasAccess = await canAccessSection(req.user, sectionId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to view snapshots in this section.' });
    }

    const [rows] = await pool.query(
      `SELECT ms.id, ms.session_id, ms.student_id, ms.section_id, ms.assignment_id, ms.event_type, ms.confidence,
              ms.snapshot_data, ms.details_json, ms.created_at,
              u.full_name as student_name, u.user_id as roll_number, u.email as student_email,
              a.title as assignment_title
       FROM monitoring_snapshots ms
       JOIN users u ON ms.student_id = u.id
       JOIN assignments a ON ms.assignment_id = a.id
       WHERE ms.section_id = ?
       ORDER BY ms.created_at DESC`,
      [sectionId]
    );

    res.json(rows);
  } catch (err) {
    console.error('Error fetching section snapshots:', err);
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

// GET /api/sessions/overview/section/:sectionId - Comprehensive Student Video Monitoring & Completion Overview
router.get('/overview/section/:sectionId', authenticateToken, requireRole(['staff', 'admin']), async (req, res) => {
  try {
    const { sectionId } = req.params;
    const hasAccess = await canAccessSection(req.user, sectionId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to view monitoring data in this section.' });
    }

    // 1. Fetch all students enrolled in this section
    const [students] = await pool.query(
      `SELECT u.id as student_id, u.user_id as roll_number, u.full_name, u.email, u.department
       FROM enrollments e
       JOIN users u ON e.student_id = u.id
       WHERE e.section_id = ?
       ORDER BY u.full_name ASC`,
      [sectionId]
    );

    // 2. Fetch assignments for this section
    const [assignments] = await pool.query(
      `SELECT a.id as assignment_id, a.title as assignment_title, a.duration_sec, a.completion_threshold
       FROM assignments a
       WHERE a.section_id = ?
       ORDER BY a.id DESC`,
      [sectionId]
    );

    // 3. Fetch progress records for this section
    const [progressList] = await pool.query(
      `SELECT p.assignment_id, p.student_id, p.duration_sec, p.chunk_sec, p.total_chunks,
              p.chunks_json, p.completed_at, p.last_beat_at
       FROM progress p
       WHERE p.section_id = ?`,
      [sectionId]
    );

    // 4. Fetch latest sessions for this section
    const [sessions] = await pool.query(
      `SELECT s.id as session_id, s.student_id, s.assignment_id, s.status, s.started_at, s.last_event_at, s.event_count
       FROM sessions s
       WHERE s.section_id = ?
       ORDER BY s.started_at DESC`,
      [sectionId]
    );

    // 5. Fetch snapshot summary counts and all snapshots per student-assignment
    const [snapshotRows] = await pool.query(
      `SELECT ms.id, ms.student_id, ms.assignment_id, ms.event_type, ms.confidence, ms.created_at, ms.snapshot_data, ms.details_json
       FROM monitoring_snapshots ms
       WHERE ms.section_id = ?
       ORDER BY ms.created_at DESC`,
      [sectionId]
    );

    // Compile per-student overview
    const overview = [];

    for (const st of students) {
      // Find assignments
      if (assignments.length === 0) {
        overview.push({
          student_id: st.student_id,
          roll_number: st.roll_number,
          full_name: st.full_name,
          email: st.email,
          assignment_id: null,
          assignment_title: 'No assignments published',
          watched_sec: 0,
          duration_sec: 0,
          watched_percent: 0,
          status: 'Not Started',
          session_id: null,
          last_active: null,
          attention_events: { face_absent: 0, looking_away: 0, multiple_faces: 0, second_device: 0, total: 0 },
          latest_snapshot: null,
        });
        continue;
      }

      for (const ass of assignments) {
        const prog = progressList.find((p) => p.student_id === st.student_id && p.assignment_id === ass.assignment_id);
        const sess = sessions.find((s) => s.student_id === st.student_id && s.assignment_id === ass.assignment_id);
        const studentSnaps = snapshotRows.filter((sn) => sn.student_id === st.student_id && sn.assignment_id === ass.assignment_id);

        let watchedSec = 0;
        let watchedPercent = 0;
        let isCompleted = false;

        if (prog) {
          const chunks = JSON.parse(prog.chunks_json || '{}');
          const chunkCount = Object.keys(chunks).length;
          watchedSec = chunkCount * (prog.chunk_sec || 5);
          const dur = prog.duration_sec || ass.duration_sec || 300;
          watchedPercent = Math.min(100, Math.round((watchedSec / dur) * 100));
          const reqSec = (ass.completion_threshold || 0.8) * dur;
          isCompleted = Boolean(prog.completed_at) || watchedSec >= reqSec;
        }

        // Determine playback status: 'Not Started', 'In Progress', 'Completed', 'Interrupted'
        let status = 'Not Started';
        if (isCompleted) {
          status = 'Completed';
        } else if (sess) {
          if (sess.status === 'interrupted' || sess.status === 'abandoned') {
            status = 'Interrupted';
          } else if (watchedSec > 0 || sess.event_count > 0) {
            status = 'In Progress';
          } else {
            status = 'In Progress';
          }
        } else if (watchedSec > 0) {
          status = 'In Progress';
        }

        const counts = {
          face_absent: studentSnaps.filter((s) => s.event_type === 'face_absent').length,
          looking_away: studentSnaps.filter((s) => s.event_type === 'looking_away').length,
          multiple_faces: studentSnaps.filter((s) => s.event_type === 'multiple_faces').length,
          second_device: studentSnaps.filter((s) => s.event_type === 'second_device').length,
          total: studentSnaps.length,
        };

        const latestSnap = studentSnaps.length > 0 ? studentSnaps[0] : null;
        const formattedSnapshots = studentSnaps.map((sn) => ({
          id: sn.id,
          event_type: sn.event_type,
          confidence: sn.confidence,
          created_at: sn.created_at,
          snapshot_data: sn.snapshot_data,
          details: sn.details_json ? (typeof sn.details_json === 'string' ? JSON.parse(sn.details_json) : sn.details_json) : null,
        }));

        overview.push({
          student_id: st.student_id,
          roll_number: st.roll_number,
          full_name: st.full_name,
          email: st.email,
          assignment_id: ass.assignment_id,
          assignment_title: ass.assignment_title,
          watched_sec: watchedSec,
          duration_sec: ass.duration_sec,
          watched_percent: watchedPercent,
          status,
          session_id: sess ? sess.session_id : null,
          last_active: sess ? sess.last_event_at : (prog ? prog.last_beat_at : null),
          attention_events: counts,
          latest_snapshot: latestSnap ? {
            event_type: latestSnap.event_type,
            confidence: latestSnap.confidence,
            created_at: latestSnap.created_at,
            snapshot_data: latestSnap.snapshot_data,
          } : null,
          snapshots: formattedSnapshots,
        });
      }
    }

    res.json(overview);
  } catch (err) {
    console.error('Error generating monitoring overview:', err);
    res.status(500).json({ error: 'Failed to generate monitoring overview: ' + err.message });
  }
});

// Get sessions for a section (Staff / Admin with access check)
router.get('/section/:sectionId', authenticateToken, requireRole(['staff', 'admin']), async (req, res) => {
  try {
    const { sectionId } = req.params;
    const hasAccess = await canAccessSection(req.user, sectionId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to view sessions in this section.' });
    }

    const [rows] = await pool.query(
      `SELECT s.*, u.full_name as student_name, u.user_id as roll_number, a.title as assignment_title
       FROM sessions s
       JOIN users u ON s.student_id = u.id
       JOIN assignments a ON s.assignment_id = a.id
       WHERE s.section_id = ?
       ORDER BY s.started_at DESC`,
      [sectionId]
    );

    res.json(rows);
  } catch (err) {
    console.error('Error fetching section sessions:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

export default router;
