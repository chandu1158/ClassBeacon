import express from 'express';
import pool, { query } from '../db/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { canAccessSection } from './sectionRoutes.js';

const router = express.Router();
router.use(authenticateToken);

// GET /api/links
// Staff: view their own created links (or for their sections)
// Student: view only links belonging to their enrolled section(s)
// Admin: view all links
router.get('/', async (req, res) => {
  try {
    if (req.user.role === 'staff') {
      const links = await query(
        `SELECT l.*, s.name as section_name, s.section_code,
                u.full_name as teacher_name, u.email as teacher_email
         FROM section_links l
         JOIN sections s ON l.section_id = s.id
         JOIN users u ON l.teacher_id = u.id
         WHERE l.teacher_id = ?
         ORDER BY l.created_at DESC`,
        [req.user.id]
      );
      return res.json(links);
    } else if (req.user.role === 'student') {
      const links = await query(
        `SELECT l.*, s.name as section_name, s.section_code,
                u.full_name as teacher_name, u.email as teacher_email
         FROM section_links l
         JOIN sections s ON l.section_id = s.id
         JOIN users u ON l.teacher_id = u.id
         WHERE l.section_id IN (SELECT section_id FROM enrollments WHERE student_id = ?)
         ORDER BY l.created_at DESC`,
        [req.user.id]
      );
      return res.json(links);
    } else {
      // Admin
      const links = await query(
        `SELECT l.*, s.name as section_name, s.section_code,
                u.full_name as teacher_name, u.email as teacher_email
         FROM section_links l
         JOIN sections s ON l.section_id = s.id
         JOIN users u ON l.teacher_id = u.id
         ORDER BY l.created_at DESC`
      );
      return res.json(links);
    }
  } catch (err) {
    console.error('Fetch links error:', err);
    res.status(500).json({ error: 'Failed to fetch links: ' + err.message });
  }
});

// GET /api/links/section/:sectionId
// Fetch links for a specific section (with section access validation)
router.get('/section/:sectionId', async (req, res) => {
  const sectionId = req.params.sectionId;
  try {
    const hasAccess = await canAccessSection(req.user, sectionId);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied. You do not have permission to access links in this section.'
      });
    }

    const links = await query(
      `SELECT l.*, s.name as section_name, s.section_code,
              u.full_name as teacher_name, u.email as teacher_email
       FROM section_links l
       JOIN sections s ON l.section_id = s.id
       JOIN users u ON l.teacher_id = u.id
       WHERE l.section_id = ?
       ORDER BY l.created_at DESC`,
      [sectionId]
    );

    res.json(links);
  } catch (err) {
    console.error('Fetch section links error:', err);
    res.status(500).json({ error: 'Failed to fetch section links: ' + err.message });
  }
});

// POST /api/links
// Teacher adds a link - automatically associates with teacher's assigned section
router.post('/', requireRole(['staff', 'admin']), async (req, res) => {
  const { title, url, description, section_id, sectionId } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Link title is required.' });
  }

  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'Valid URL is required.' });
  }

  try {
    let targetSectionId = section_id || sectionId;

    // Automatic Section Mapping:
    // If not provided by teacher, automatically find the section they are assigned to
    if (!targetSectionId) {
      const assignedSections = await query(
        `SELECT DISTINCT s.id, s.name FROM sections s
         LEFT JOIN section_staff ss ON s.id = ss.section_id
         WHERE s.owner_id = ? OR ss.staff_id = ?
         ORDER BY s.id ASC`,
        [req.user.id, req.user.id]
      );

      if (assignedSections.length === 0) {
        return res.status(400).json({
          error: 'No assigned section found for your teacher account. Please ensure an administrator has assigned you to a section.'
        });
      }

      targetSectionId = assignedSections[0].id;
    } else {
      // Validate that the teacher has permission for the specified section
      const hasAccess = await canAccessSection(req.user, targetSectionId);
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied. You are not assigned to this section.'
        });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO section_links (section_id, teacher_id, title, url, description, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [Number(targetSectionId), req.user.id, title.trim(), url.trim(), description ? description.trim() : null]
    );

    const [created] = await query(
      `SELECT l.*, s.name as section_name, s.section_code,
              u.full_name as teacher_name
       FROM section_links l
       JOIN sections s ON l.section_id = s.id
       JOIN users u ON l.teacher_id = u.id
       WHERE l.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      message: 'Link added successfully and mapped to your section.',
      link: created
    });
  } catch (err) {
    console.error('Create link error:', err);
    res.status(500).json({ error: 'Failed to create link: ' + err.message });
  }
});

// PUT /api/links/:id
// Teacher updates a link - Teacher Ownership Validation Enforced!
router.put('/:id', requireRole(['staff', 'admin']), async (req, res) => {
  const linkId = req.params.id;
  const { title, url, description } = req.body;

  try {
    const [existing] = await query('SELECT * FROM section_links WHERE id = ?', [linkId]);
    if (!existing) {
      return res.status(404).json({ error: 'Link not found.' });
    }

    // Teacher Ownership Check:
    // Teachers can ONLY update links THEY created!
    if (req.user.role === 'staff' && existing.teacher_id !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied. You can only edit links that you have created.'
      });
    }

    const updatedTitle = title !== undefined ? title.trim() : existing.title;
    const updatedUrl = url !== undefined ? url.trim() : existing.url;
    const updatedDesc = description !== undefined ? description.trim() : existing.description;

    await pool.query(
      `UPDATE section_links SET title = ?, url = ?, description = ? WHERE id = ?`,
      [updatedTitle, updatedUrl, updatedDesc, linkId]
    );

    const [updated] = await query(
      `SELECT l.*, s.name as section_name, s.section_code,
              u.full_name as teacher_name
       FROM section_links l
       JOIN sections s ON l.section_id = s.id
       JOIN users u ON l.teacher_id = u.id
       WHERE l.id = ?`,
      [linkId]
    );

    res.json({
      message: 'Link updated successfully.',
      link: updated
    });
  } catch (err) {
    console.error('Update link error:', err);
    res.status(500).json({ error: 'Failed to update link: ' + err.message });
  }
});

// DELETE /api/links/:id
// Teacher deletes a link - Teacher Ownership Validation Enforced!
router.delete('/:id', requireRole(['staff', 'admin']), async (req, res) => {
  const linkId = req.params.id;

  try {
    const [existing] = await query('SELECT * FROM section_links WHERE id = ?', [linkId]);
    if (!existing) {
      return res.status(404).json({ error: 'Link not found.' });
    }

    // Teacher Ownership Check:
    // Teachers can ONLY delete links THEY created!
    if (req.user.role === 'staff' && existing.teacher_id !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied. You can only delete links that you have created.'
      });
    }

    await pool.query('DELETE FROM section_links WHERE id = ?', [linkId]);

    res.json({ message: 'Link deleted successfully.' });
  } catch (err) {
    console.error('Delete link error:', err);
    res.status(500).json({ error: 'Failed to delete link: ' + err.message });
  }
});

export default router;
