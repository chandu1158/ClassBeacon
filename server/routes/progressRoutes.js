import express from 'express';
import pool from '../db/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET or initialize progress for an assignment
router.get('/:assignmentId', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const { assignmentId } = req.params;

    const [rows] = await pool.query(
      'SELECT * FROM progress WHERE student_id = ? AND assignment_id = ?',
      [studentId, assignmentId]
    );

    if (rows.length > 0) {
      const prog = rows[0];
      prog.chunks = JSON.parse(prog.chunks_json || '{}');
      return res.json(prog);
    }

    // Fetch assignment info to populate chunk specs
    const [assignRows] = await pool.query('SELECT duration_sec, completion_threshold, section_id FROM assignments WHERE id = ?', [assignmentId]);
    if (assignRows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const durationSec = assignRows[0].duration_sec || 300;
    const chunkSec = 5;
    const totalChunks = Math.ceil(durationSec / chunkSec);
    const sectionId = assignRows[0].section_id;

    const [result] = await pool.query(
      `INSERT INTO progress (student_id, assignment_id, section_id, duration_sec, chunk_sec, total_chunks, max_rate, threshold, chunks_json, last_beat_at)
       VALUES (?, ?, ?, ?, ?, ?, 1.5, ?, '{}', NOW())`,
      [studentId, assignmentId, sectionId, durationSec, chunkSec, totalChunks, assignRows[0].completion_threshold || 0.8]
    );

    res.json({
      id: result.insertId,
      student_id: studentId,
      assignment_id: assignmentId,
      duration_sec: durationSec,
      chunk_sec: chunkSec,
      total_chunks: totalChunks,
      max_rate: 1.5,
      threshold: assignRows[0].completion_threshold || 0.8,
      chunks: {},
      completed_at: null,
    });
  } catch (err) {
    console.error('Error fetching progress:', err);
    res.status(500).json({ error: 'Failed to fetch progress: ' + err.message });
  }
});

// Update progress beat (chunks array) with server-side validation against fabricated completion
router.post('/beat', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const { assignmentId, chunks } = req.body;

    if (!chunks || typeof chunks !== 'object') {
      return res.status(400).json({ error: 'Valid chunks object is required.' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM progress WHERE student_id = ? AND assignment_id = ?',
      [studentId, assignmentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Progress document not found' });
    }

    const currentProg = rows[0];
    const existingChunks = JSON.parse(currentProg.chunks_json || '{}');
    const existingCount = Object.keys(existingChunks).length;

    // Validate chunk indices are within [0, total_chunks)
    const validIncomingChunks = {};
    for (const [k, v] of Object.entries(chunks)) {
      const idx = Number(k);
      if (!isNaN(idx) && idx >= 0 && idx < currentProg.total_chunks && v === true) {
        validIncomingChunks[idx] = true;
      }
    }

    const updatedChunks = { ...existingChunks, ...validIncomingChunks };
    const newPlayedChunkCount = Object.keys(updatedChunks).length;
    const addedChunkCount = newPlayedChunkCount - existingCount;

    // Security check: rate limiting of newly submitted chunks based on elapsed real time (enforced on ALL beats)
    if (addedChunkCount > 0) {
      const lastBeatMs = currentProg.last_beat_at ? new Date(currentProg.last_beat_at).getTime() : Date.now();
      const nowMs = Date.now();
      const elapsedSec = Math.max(1, (nowMs - lastBeatMs) / 1000);
      const newlyReportedSec = addedChunkCount * currentProg.chunk_sec;
      const maxAllowedSec = elapsedSec * (currentProg.max_rate || 1.5) + (currentProg.chunk_sec * 3); // grace margin of 3 chunks

      // VULN-12 Fix: Never allow a student to fake completion on the first beat
      if (newlyReportedSec > maxAllowedSec) {
        return res.status(429).json({
          error: 'Rate of watched progress exceeds allowable playback speed. Fabricated completion rejected.',
          details: { newlyReportedSec, maxAllowedSec, elapsedSec }
        });
      }
    }

    const playedSec = newPlayedChunkCount * currentProg.chunk_sec;
    const requiredSec = currentProg.threshold * currentProg.duration_sec;

    let completedAt = currentProg.completed_at;
    if (!completedAt && playedSec >= requiredSec) {
      completedAt = new Date();
    }

    await pool.query(
      `UPDATE progress 
       SET chunks_json = ?, last_beat_at = NOW(), completed_at = ? 
       WHERE id = ?`,
      [JSON.stringify(updatedChunks), completedAt, currentProg.id]
    );

    res.json({
      success: true,
      chunks: updatedChunks,
      playedSec,
      completedAt,
    });
  } catch (err) {
    console.error('Error updating progress beat:', err);
    res.status(500).json({ error: 'Failed to update progress: ' + err.message });
  }
});

export default router;
