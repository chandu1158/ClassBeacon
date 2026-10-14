import express from 'express';
import { query } from '../db/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { canAccessSection } from './sectionRoutes.js';

const router = express.Router();
router.use(authenticateToken);

// GET /api/assignments/section/:sectionId
// Staff or Admin gets assignments in a section (with access check)
router.get('/section/:sectionId', async (req, res) => {
  const sectionId = req.params.sectionId;
  try {
    const hasAccess = await canAccessSection(req.user, sectionId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to view assignments in this section.' });
    }

    const assignments = await query(
      `SELECT * FROM assignments WHERE section_id = ? ORDER BY id DESC`,
      [sectionId]
    );

    const formatted = assignments.map((a) => ({
      ...a,
      policy: {
        sequential: Boolean(a.policy_sequential),
        pauseOnHidden: Boolean(a.policy_pause_hidden),
        hiddenAlertSec: a.policy_hidden_alert_sec || 60,
        maxRate: a.policy_max_rate || 1.5,
      },
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Fetch assignments error:', err);
    res.status(500).json({ error: 'Failed to fetch assignments.' });
  }
});

// GET /api/assignments/student (Student gets all enrolled section published assignments)
router.get('/student', requireRole(['student']), async (req, res) => {
  try {
    const assignments = await query(
      `SELECT a.*, s.name as section_name, s.section_code
       FROM enrollments e
       JOIN assignments a ON e.section_id = a.section_id
       JOIN sections s ON a.section_id = s.id
       WHERE e.student_id = ? AND a.status = 'published'
       ORDER BY a.id DESC`,
      [req.user.id]
    );

    const formatted = assignments.map((a) => {
      const durationSec = Number(a.duration_sec || 0);
      const reqMins = a.required_watch_minutes !== null && a.required_watch_minutes !== undefined
        ? Number(a.required_watch_minutes)
        : Math.max(1, Math.ceil((durationSec * (a.completion_threshold || 0.8)) / 60));
      return {
        ...a,
        required_watch_minutes: reqMins,
        policy: {
          sequential: Boolean(a.policy_sequential),
          pauseOnHidden: Boolean(a.policy_pause_hidden),
          hiddenAlertSec: a.policy_hidden_alert_sec || 60,
          maxRate: a.policy_max_rate || 1.5,
        },
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('Fetch student assignments error:', err);
    res.status(500).json({ error: 'Failed to fetch student assignments.' });
  }
});

// GET /api/assignments/:id (Get single assignment by ID with policy)
router.get('/:id', async (req, res) => {
  try {
    const rows = await query(
      `SELECT a.*, s.name as section_name, s.section_code
       FROM assignments a
       JOIN sections s ON a.section_id = s.id
       WHERE a.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }

    const a = rows[0];
    const hasAccess = await canAccessSection(req.user, a.section_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to access this assignment.' });
    }

    res.json({
      ...a,
      policy: {
        sequential: a.policy_sequential !== 0,
        pauseOnHidden: a.policy_pause_hidden !== 0,
        hiddenAlertSec: a.policy_hidden_alert_sec || 60,
        maxRate: a.policy_max_rate || 1.5,
      },
    });
  } catch (err) {
    console.error('Fetch assignment error:', err);
    res.status(500).json({ error: 'Failed to fetch assignment.' });
  }
});

// POST /api/assignments (Staff creates assignment with mandatory watch time in minutes and draft/published status)
router.post('/', requireRole(['staff', 'admin']), async (req, res) => {
  const {
    section_id,
    sectionId,
    video_id,
    videoId,
    title,
    source_url,
    sourceUrl,
    duration_sec,
    durationSec,
    required_watch_minutes,
    requiredWatchMinutes,
    completion_threshold,
    completionThreshold,
    policy_sequential,
    policySequential,
    policy_pause_hidden,
    policyPauseHidden,
    policy_hidden_alert_sec,
    policyHiddenAlertSec,
    policy_max_rate,
    policyMaxRate,
    status,
    due_at,
  } = req.body;

  const targetSectionId = section_id || sectionId;
  const targetVideoId = video_id || videoId || 0;
  const targetTitle = (title || '').trim();
  const targetUrl = (source_url || sourceUrl || '').trim();
  const targetDuration = Number(duration_sec || durationSec || 0);

  if (!targetSectionId || !targetTitle || !targetUrl || !targetDuration || targetDuration <= 0) {
    return res.status(400).json({ error: 'Section ID, title, valid source URL, and duration (> 0) are required.' });
  }

  // Calculate or validate required_watch_minutes
  const totalVideoMinutes = Math.max(1, Math.ceil(targetDuration / 60));
  let finalWatchMinutes;
  let finalThreshold;

  const inputMinutes = required_watch_minutes !== undefined ? required_watch_minutes : requiredWatchMinutes;
  if (inputMinutes !== undefined && inputMinutes !== null && inputMinutes !== '') {
    const parsedMinutes = Number(inputMinutes);
    if (isNaN(parsedMinutes) || parsedMinutes <= 0) {
      return res.status(400).json({ error: 'Mandatory watch time must be a positive integer greater than zero.' });
    }
    if (parsedMinutes > totalVideoMinutes) {
      return res.status(400).json({
        error: `Mandatory watch time (${parsedMinutes} mins) cannot exceed video total duration (${totalVideoMinutes} mins).`,
      });
    }
    finalWatchMinutes = Math.round(parsedMinutes);
    finalThreshold = Math.min(1.0, (finalWatchMinutes * 60) / targetDuration);
  } else {
    // If not passed, use completionThreshold or 0.8
    const rawThresh = completion_threshold !== undefined ? completion_threshold : (completionThreshold !== undefined ? completionThreshold : 0.8);
    finalThreshold = Math.min(1.0, Math.max(0.1, Number(rawThresh)));
    finalWatchMinutes = Math.max(1, Math.ceil((targetDuration * finalThreshold) / 60));
  }

  const assignmentStatus = status === 'draft' ? 'draft' : 'published';

  try {
    const hasAccess = await canAccessSection(req.user, targetSectionId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You cannot create assignments for a section you are not assigned to.' });
    }

    // Default policy_sequential to 1 (enforce no skipping by default)
    const seqPolicy = policy_sequential !== undefined ? (policy_sequential ? 1 : 0) : (policySequential !== undefined ? (policySequential ? 1 : 0) : 1);
    const pauseHidden = policy_pause_hidden !== undefined ? (policy_pause_hidden ? 1 : 0) : (policyPauseHidden !== undefined ? (policyPauseHidden ? 1 : 0) : 1);
    const hiddenAlert = policy_hidden_alert_sec || policyHiddenAlertSec || 60;
    const maxRate = policy_max_rate || policyMaxRate || 1.5;

    const result = await query(
      `INSERT INTO assignments (
        section_id, video_id, title, source_url, duration_sec, required_watch_minutes,
        completion_threshold, policy_sequential, policy_pause_hidden,
        policy_hidden_alert_sec, policy_max_rate, status, due_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(targetSectionId),
        Number(targetVideoId),
        targetTitle,
        targetUrl,
        targetDuration,
        finalWatchMinutes,
        finalThreshold,
        seqPolicy,
        pauseHidden,
        Number(hiddenAlert),
        Number(maxRate),
        assignmentStatus,
        due_at || null,
        req.user.id,
      ]
    );

    res.status(201).json({
      id: result.insertId,
      message: assignmentStatus === 'published' ? 'Assignment published successfully to section students.' : 'Assignment saved as draft.',
      status: assignmentStatus,
      required_watch_minutes: finalWatchMinutes,
      completion_threshold: finalThreshold,
      policy: {
        sequential: Boolean(seqPolicy),
        pauseOnHidden: Boolean(pauseHidden),
        hiddenAlertSec: hiddenAlert,
        maxRate,
      },
    });
  } catch (err) {
    console.error('Create assignment error:', err);
    res.status(500).json({ error: 'Failed to create assignment: ' + err.message });
  }
});

// PUT /api/assignments/:id (Staff updates assignment parameters)
router.put('/:id', requireRole(['staff', 'admin']), async (req, res) => {
  const { id } = req.params;
  const {
    title,
    required_watch_minutes,
    requiredWatchMinutes,
    status,
    policy_sequential,
    policySequential,
  } = req.body;

  try {
    const rows = await query('SELECT * FROM assignments WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }
    const current = rows[0];

    const hasAccess = await canAccessSection(req.user, current.section_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You cannot modify assignments for this section.' });
    }

    const newTitle = title !== undefined ? String(title).trim() : current.title;
    let newMinutes = current.required_watch_minutes;
    let newThreshold = current.completion_threshold;

    const inputMins = required_watch_minutes !== undefined ? required_watch_minutes : requiredWatchMinutes;
    if (inputMins !== undefined && inputMins !== null) {
      const parsed = Number(inputMins);
      const totalMins = Math.max(1, Math.ceil(current.duration_sec / 60));
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'Mandatory watch time must be a positive integer greater than zero.' });
      }
      if (parsed > totalMins) {
        return res.status(400).json({
          error: `Mandatory watch time (${parsed} mins) cannot exceed video total duration (${totalMins} mins).`,
        });
      }
      newMinutes = Math.round(parsed);
      newThreshold = Math.min(1.0, (newMinutes * 60) / current.duration_sec);
    }

    const newStatus = status ? (['draft', 'published'].includes(status) ? status : current.status) : current.status;
    const newSeq = policy_sequential !== undefined ? (policy_sequential ? 1 : 0) : (policySequential !== undefined ? (policySequential ? 1 : 0) : current.policy_sequential);

    await query(
      `UPDATE assignments 
       SET title = ?, required_watch_minutes = ?, completion_threshold = ?, status = ?, policy_sequential = ?
       WHERE id = ?`,
      [newTitle, newMinutes, newThreshold, newStatus, newSeq, id]
    );

    res.json({
      success: true,
      message: 'Assignment updated successfully.',
      assignment: {
        id: Number(id),
        title: newTitle,
        required_watch_minutes: newMinutes,
        completion_threshold: newThreshold,
        status: newStatus,
        policy_sequential: Boolean(newSeq),
      },
    });
  } catch (err) {
    console.error('Update assignment error:', err);
    res.status(500).json({ error: 'Failed to update assignment: ' + err.message });
  }
});

// DELETE /api/assignments/:id (Staff deletes assignment)
router.delete('/:id', requireRole(['staff', 'admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await query('SELECT section_id FROM assignments WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }
    const hasAccess = await canAccessSection(req.user, rows[0].section_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    await query('DELETE FROM assignments WHERE id = ?', [id]);
    res.json({ success: true, message: 'Assignment deleted successfully.' });
  } catch (err) {
    console.error('Delete assignment error:', err);
    res.status(500).json({ error: 'Failed to delete assignment.' });
  }
});

export default router;
