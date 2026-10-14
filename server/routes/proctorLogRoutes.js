import express from 'express';
import pool from '../db/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { ALLOWED_EVENT_TYPES } from './sessionRoutes.js';

const router = express.Router();

// Middleware to authenticate token or optional fallback
router.use(authenticateToken);

/**
 * POST /api/proctor_log.php and /api/proctor_log
 * Automated Evidence Capture and Proctor Event Logging
 */
router.post('/', async (req, res) => {
  try {
    const {
      session_id,
      event_type,
      confidence,
      object_detected,
      person_count,
      snapshot_data,
      details,
      video_progress_percent,
      playback_position,
    } = req.body;

    if (!session_id || !event_type || !ALLOWED_EVENT_TYPES.has(event_type)) {
      return res.status(400).json({ error: 'Valid session_id and approved event_type are required.' });
    }

    // 1. Strict Server-Side Validation: Never trust student_id or section_id supplied by client
    const [sessRows] = await pool.query(
      `SELECT s.*, a.section_id as assign_section_id, a.video_id
       FROM sessions s
       JOIN assignments a ON s.assignment_id = a.id
       WHERE s.id = ?`,
      [Number(session_id)]
    );

    if (sessRows.length === 0) {
      return res.status(404).json({ error: 'Session not found in system database.' });
    }

    const session = sessRows[0];

    // Ensure session belongs to authenticated student
    if (req.user.role === 'student' && session.student_id !== req.user.id) {
      return res.status(403).json({ error: 'Security violation: Authenticated student does not own this session.' });
    }

    // Use verified database IDs rather than client claims
    const verifiedStudentId = session.student_id;
    const verifiedSectionId = session.section_id;
    const verifiedAssignmentId = session.assignment_id;

    // 2. Validate Snapshot Image Format and Size (Restrict to permitted formats: JPEG/PNG <= 5MB)
    let sanitizedSnapshot = null;
    if (snapshot_data) {
      if (typeof snapshot_data !== 'string') {
        return res.status(400).json({ error: 'Invalid snapshot data type.' });
      }

      const isJpeg = snapshot_data.startsWith('data:image/jpeg;base64,') || snapshot_data.startsWith('data:image/jpg;base64,');
      const isPng = snapshot_data.startsWith('data:image/png;base64,');

      if (!isJpeg && !isPng) {
        return res.status(400).json({ error: 'Invalid image format. Only JPEG and PNG data URLs are permitted.' });
      }

      // 5MB base64 size check (~6.7M characters)
      if (snapshot_data.length > 7 * 1024 * 1024) {
        return res.status(400).json({ error: 'Snapshot image exceeds maximum permitted size of 5MB.' });
      }

      sanitizedSnapshot = snapshot_data;
    }

    const confScore = confidence !== undefined ? Math.min(1.0, Math.max(0.0, Number(confidence))) : 0.0;
    const detailsPayload = {
      ...(typeof details === 'object' && details !== null ? details : {}),
      object_detected: object_detected || null,
      person_count: person_count !== undefined ? Number(person_count) : 1,
      video_progress_percent: video_progress_percent !== undefined ? Number(video_progress_percent) : 0,
      playback_position: playback_position !== undefined ? Number(playback_position) : 0,
    };

    // 3. Insert into monitoring_snapshots if image is provided
    let snapshotId = null;
    if (sanitizedSnapshot) {
      const [snapResult] = await pool.query(
        `INSERT INTO monitoring_snapshots (
          session_id, student_id, section_id, assignment_id,
          event_type, confidence, snapshot_data, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          session.id,
          verifiedStudentId,
          verifiedSectionId,
          verifiedAssignmentId,
          event_type,
          confScore,
          sanitizedSnapshot,
          JSON.stringify(detailsPayload),
        ]
      );
      snapshotId = snapResult.insertId;
    }

    // 4. Record event in events table
    await pool.query(
      `INSERT INTO events (session_id, type, seq, client_at, details_json, server_at)
       VALUES (?, ?, 0, ?, ?, NOW())`,
      [
        session.id,
        event_type,
        Date.now(),
        JSON.stringify({
          snapshot_id: snapshotId,
          confidence: confScore,
          ...detailsPayload,
        }),
      ]
    );

    // 5. Update session heartbeat
    await pool.query(
      `UPDATE sessions SET last_event_at = NOW(), event_count = event_count + 1 WHERE id = ?`,
      [session.id]
    );

    res.status(201).json({
      success: true,
      snapshot_id: snapshotId,
      session_id: session.id,
      event_type,
      status: 'recorded',
      message: 'Proctor event logged and snapshot stored successfully.',
    });
  } catch (err) {
    console.error('Error logging proctor event:', err);
    res.status(500).json({ error: 'Failed to process proctor log: ' + err.message });
  }
});

export default router;
