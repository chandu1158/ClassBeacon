import express from 'express';
import { query } from '../db/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken);

// GET /api/videos
router.get('/', requireRole(['staff', 'admin']), async (req, res) => {
  try {
    const videos = await query(
      `SELECT * FROM videos WHERE owner_id = ? ORDER BY id DESC`,
      [req.user.id]
    );
    res.json(videos);
  } catch (err) {
    console.error('Fetch videos error:', err);
    res.status(500).json({ error: 'Failed to fetch videos.' });
  }
});

// Whitelist of valid YouTube hostnames for SSRF protection
const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

// Helper to safely extract YouTube video ID with strict domain validation
function extractYouTubeId(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return null;
    if (!ALLOWED_YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) return null;

    let videoId = null;
    if (parsed.hostname.toLowerCase() === 'youtu.be') {
      videoId = parsed.pathname.slice(1).split('/')[0];
    } else {
      videoId = parsed.searchParams.get('v');
      if (!videoId && parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/')[2];
      }
    }

    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return videoId;
    }
    return null;
  } catch {
    return null;
  }
}

// POST /api/videos/inspect & GET /api/videos/inspect
async function handleInspectVideo(req, res) {
  const targetUrl = (req.method === 'POST' ? req.body?.url : req.query?.url || '').trim();
  if (!targetUrl) {
    return res.status(400).json({ error: 'Video URL is required.' });
  }

  const ytId = extractYouTubeId(targetUrl);
  if (!ytId) {
    // If not a recognized secure YouTube URL, do NOT fetch anything (SSRF prevention)
    return res.json({
      success: true,
      isYouTube: false,
      durationSec: null,
      title: '',
    });
  }

  try {
    // Strict outbound fetch: hardcoded HTTPS YouTube domain with redirect: 'error'
    const response = await fetch(`https://www.youtube.com/watch?v=${ytId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    const html = await response.text();
    const durMatch = html.match(/"approxDurationMs":"(\d+)"/);
    const titleMatch = html.match(/<title>(.*?)<\/title>/);

    const durationSec = durMatch ? Math.round(Number(durMatch[1]) / 1000) : null;
    const title = titleMatch ? titleMatch[1].replace(/\s*-\s*YouTube\s*$/i, '').trim() : '';

    return res.json({
      success: true,
      isYouTube: true,
      videoId: ytId,
      durationSec,
      title,
    });
  } catch (err) {
    console.warn('YouTube inspect warning:', err.message);
    return res.json({
      success: false,
      isYouTube: true,
      videoId: ytId,
      durationSec: null,
      title: '',
      message: 'Could not automatically fetch YouTube metadata: ' + err.message,
    });
  }
}

router.post('/inspect', requireRole(['staff', 'admin']), handleInspectVideo);
router.get('/inspect', requireRole(['staff', 'admin']), handleInspectVideo);

// POST /api/videos
router.post('/', requireRole(['staff', 'admin']), async (req, res) => {
  const title = (req.body.title || '').trim();
  const sourceUrl = (req.body.source_url || req.body.sourceUrl || '').trim();
  const rawDuration = req.body.duration_sec ?? req.body.durationSec;

  if (!title) {
    return res.status(400).json({ error: 'Video title is required.' });
  }

  if (!sourceUrl || (!sourceUrl.startsWith('https://') && !sourceUrl.startsWith('http://'))) {
    return res.status(400).json({ error: 'A valid HTTPS video source URL is required.' });
  }

  // Duration is optional - default to 300 seconds (5 mins) if not provided or 0
  const parsedDuration = rawDuration ? Number(rawDuration) : 0;
  const durationSec = parsedDuration > 0 ? parsedDuration : 300;

  try {
    const result = await query(
      `INSERT INTO videos (title, source_url, duration_sec, owner_id) VALUES (?, ?, ?, ?)`,
      [title, sourceUrl, durationSec, req.user.id]
    );

    res.status(201).json({
      id: result.insertId,
      title,
      source_url: sourceUrl,
      sourceUrl,
      duration_sec: durationSec,
      durationSec,
      owner_id: req.user.id,
      message: 'Video added to library successfully.'
    });
  } catch (err) {
    console.error('Create video error:', err);
    res.status(500).json({ error: 'Failed to create video.' });
  }
});

// PUT /api/videos/:id
router.put('/:id', requireRole(['staff', 'admin']), async (req, res) => {
  const { id } = req.params;
  const title = (req.body.title || '').trim();
  const rawDuration = req.body.duration_sec ?? req.body.durationSec;

  try {
    const [existing] = await query('SELECT * FROM videos WHERE id = ? AND owner_id = ?', [id, req.user.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Video not found or unauthorized.' });
    }

    const durationSec = rawDuration ? Number(rawDuration) : existing.duration_sec;
    const updatedTitle = title || existing.title;

    await query('UPDATE videos SET title = ?, duration_sec = ? WHERE id = ?', [updatedTitle, durationSec, id]);
    res.json({ success: true, id, title: updatedTitle, duration_sec: durationSec });
  } catch (err) {
    console.error('Update video error:', err);
    res.status(500).json({ error: 'Failed to update video.' });
  }
});

// DELETE /api/videos/:id - Remove video/link from library
router.delete('/:id', requireRole(['staff', 'admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const [existing] = await query('SELECT * FROM videos WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Video not found.' });
    }
    if (req.user.role === 'staff' && existing.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only remove videos you added.' });
    }

    // Clean up any assignments referencing this video first
    await query('DELETE FROM assignments WHERE video_id = ?', [id]);
    await query('DELETE FROM videos WHERE id = ?', [id]);

    res.json({ message: 'Video removed from library successfully.' });
  } catch (err) {
    console.error('Delete video error:', err);
    res.status(500).json({ error: 'Failed to delete video: ' + err.message });
  }
});

export default router;
