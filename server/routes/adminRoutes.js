import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Admin-only middleware
router.use(authenticateToken, requireRole(['admin']));

// GET /api/admin/users (List all users with section assignment details, NO DUPLICATES)
router.get('/users', async (req, res) => {
  try {
    const { role, department } = req.query;
    let sql = `
      SELECT u.id, u.user_id, u.email, u.full_name, u.role, u.phone, u.department,
             u.year_of_join, u.date_of_birth, u.address, u.beacon_uuid, u.active, u.created_at
      FROM users u
      WHERE 1=1
    `;
    const params = [];

    if (role) {
      sql += ` AND u.role = ?`;
      params.push(role);
    }
    if (department) {
      sql += ` AND u.department = ?`;
      params.push(department);
    }

    sql += ` ORDER BY u.role ASC, u.id ASC`;

    const users = await query(sql, params);

    // Fetch all staff sections cleanly without Cartesian duplicates
    const staffSections = await query(`
      SELECT ss.staff_id, s.id as section_id, s.name as section_name, s.section_code
      FROM section_staff ss
      JOIN sections s ON ss.section_id = s.id
      ORDER BY s.name ASC
    `);

    // Fetch all student enrollments cleanly
    const studentEnrollments = await query(`
      SELECT e.student_id, s.id as section_id, s.name as section_name, s.section_code
      FROM enrollments e
      JOIN sections s ON e.section_id = s.id
      ORDER BY s.name ASC
    `);

    const staffSecMap = {};
    for (const row of staffSections) {
      if (!staffSecMap[row.staff_id]) staffSecMap[row.staff_id] = [];
      if (!staffSecMap[row.staff_id].some(s => s.id === row.section_id)) {
        staffSecMap[row.staff_id].push({
          id: row.section_id,
          name: row.section_name,
          section_code: row.section_code
        });
      }
    }

    const stuSecMap = {};
    for (const row of studentEnrollments) {
      if (!stuSecMap[row.student_id]) stuSecMap[row.student_id] = [];
      if (!stuSecMap[row.student_id].some(s => s.id === row.section_id)) {
        stuSecMap[row.student_id].push({
          id: row.section_id,
          name: row.section_name,
          section_code: row.section_code
        });
      }
    }

    for (const u of users) {
      const assigned = u.role === 'staff' ? (staffSecMap[u.id] || []) : (stuSecMap[u.id] || []);
      u.assigned_sections = assigned;
      if (assigned.length > 0) {
        u.section_id = assigned[0].id;
        u.section_name = assigned.map(s => s.name).join(', ');
        u.section_code = assigned.map(s => s.section_code).join(', ');
      } else {
        u.section_id = null;
        u.section_name = null;
        u.section_code = null;
      }
    }

    res.json({ users });
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ error: 'Failed to fetch user list.' });
  }
});

// GET /api/admin/users/:id (Get single user profile)
router.get('/users/:id', async (req, res) => {
  try {
    const users = await query(
      `SELECT u.id, u.user_id, u.email, u.full_name, u.role, u.phone, u.department,
              u.year_of_join, u.date_of_birth, u.address, u.beacon_uuid, u.active, u.created_at
       FROM users u
       WHERE u.id = ?`,
      [req.params.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const u = users[0];
    let assigned = [];
    if (u.role === 'staff') {
      assigned = await query(
        `SELECT s.id, s.name, s.section_code
         FROM section_staff ss
         JOIN sections s ON ss.section_id = s.id
         WHERE ss.staff_id = ?
         ORDER BY s.name ASC`,
        [u.id]
      );
    } else if (u.role === 'student') {
      assigned = await query(
        `SELECT s.id, s.name, s.section_code
         FROM enrollments e
         JOIN sections s ON e.section_id = s.id
         WHERE e.student_id = ?
         ORDER BY s.name ASC`,
        [u.id]
      );
    }

    u.assigned_sections = assigned;
    if (assigned.length > 0) {
      u.section_id = assigned[0].id;
      u.section_name = assigned.map(s => s.name).join(', ');
      u.section_code = assigned.map(s => s.section_code).join(', ');
    } else {
      u.section_id = null;
      u.section_name = null;
      u.section_code = null;
    }

    res.json({ user: u });
  } catch (err) {
    console.error('Fetch user detail error:', err);
    res.status(500).json({ error: 'Failed to fetch user details.' });
  }
});

// POST /api/admin/users (Admin creates student or staff account with section selection/creation)
router.post('/users', async (req, res) => {
  const {
    user_id,
    email,
    password,
    full_name,
    role,
    phone,
    department,
    year_of_join,
    date_of_birth,
    address,
    beacon_uuid,
    section_id,
    sectionId,
    section_ids,
    new_section_name,
    newSectionName,
    new_section_code,
    newSectionCode,
  } = req.body;

  if (!user_id || !email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'User ID (Roll No / Staff ID), Email, Password, Full Name, and Role are required.' });
  }

  if (!['admin', 'staff', 'student'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin, staff, or student.' });
  }

  try {
    // Check uniqueness
    const existing = await query(`SELECT id FROM users WHERE user_id = ? OR email = ?`, [user_id, email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User ID or Email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (user_id, email, password_hash, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        user_id.trim(),
        email.trim(),
        password_hash,
        full_name.trim(),
        role,
        phone || null,
        department || null,
        year_of_join ? Number(year_of_join) : null,
        date_of_birth || null,
        address || null,
        beacon_uuid || null,
      ]
    );

    const newUserId = result.insertId;
    let targetSectionId = section_id || sectionId;
    let createdSection = null;

    // Handle section creation if new section details provided
    const newSecName = (new_section_name || newSectionName || '').trim();
    if (newSecName) {
      const code = (new_section_code || newSectionCode || `SEC-${Date.now().toString().slice(-6)}`).trim();
      const secOwner = role === 'staff' ? newUserId : req.user.id;
      const secResult = await query(
        `INSERT INTO sections (section_code, name, owner_id) VALUES (?, ?, ?)`,
        [code, newSecName, secOwner]
      );
      targetSectionId = secResult.insertId;
      createdSection = { id: targetSectionId, name: newSecName, section_code: code };

      if (role === 'staff') {
        await query(
          `INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`,
          [targetSectionId, newUserId]
        );
      }
    }

    // Assign section if targetSectionId is present
    if (targetSectionId) {
      targetSectionId = Number(targetSectionId);
      if (role === 'student') {
        await query(
          `INSERT IGNORE INTO enrollments (section_id, student_id) VALUES (?, ?)`,
          [targetSectionId, newUserId]
        );
      } else if (role === 'staff') {
        await query(
          `INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`,
          [targetSectionId, newUserId]
        );
      }
    }

    // If multiple section_ids passed for staff
    if (role === 'staff' && Array.isArray(section_ids)) {
      for (const sId of section_ids) {
        if (Number(sId)) {
          await query(
            `INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`,
            [Number(sId), newUserId]
          );
        }
      }
    }

    res.status(201).json({
      message: 'Account created successfully.',
      user: {
        id: newUserId,
        user_id,
        email,
        full_name,
        role,
        phone,
        department,
        year_of_join,
        date_of_birth,
        address,
        beacon_uuid,
        section_id: targetSectionId || null,
      },
      created_section: createdSection,
    });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: err.message || 'Failed to create user account.' });
  }
});

// PUT /api/admin/users/:id (Admin updates user profile, password, active status, or section assignments)
router.put('/users/:id', async (req, res) => {
  const {
    user_id,
    email,
    password,
    full_name,
    phone,
    department,
    year_of_join,
    date_of_birth,
    address,
    beacon_uuid,
    active,
    section_id,
    sectionId,
    section_ids,
    add_section_id,
    remove_section_id,
    new_section_name,
    new_section_code,
  } = req.body;

  const targetUserId = req.params.id;

  try {
    const [uRows] = await query('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (uRows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const currentUser = uRows[0];

    // Check user_id or email collisions if changing them
    if (user_id && user_id !== currentUser.user_id) {
      const existing = await query('SELECT id FROM users WHERE user_id = ? AND id != ?', [user_id, targetUserId]);
      if (existing.length > 0) {
        return res.status(400).json({ error: `User ID '${user_id}' is already in use by another account.` });
      }
    }
    if (email && email !== currentUser.email) {
      const existing = await query('SELECT id FROM users WHERE email = ? AND id != ?', [email, targetUserId]);
      if (existing.length > 0) {
        return res.status(400).json({ error: `Email '${email}' is already in use by another account.` });
      }
    }

    let passwordHash = currentUser.password_hash;
    if (password && password.trim().length > 0) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    await query(
      `UPDATE users SET
         user_id = COALESCE(?, user_id),
         email = COALESCE(?, email),
         password_hash = ?,
         full_name = COALESCE(?, full_name),
         phone = COALESCE(?, phone),
         department = COALESCE(?, department),
         year_of_join = COALESCE(?, year_of_join),
         date_of_birth = COALESCE(?, date_of_birth),
         address = COALESCE(?, address),
         beacon_uuid = COALESCE(?, beacon_uuid),
         active = COALESCE(?, active)
       WHERE id = ?`,
      [
        user_id ? user_id.trim() : null,
        email ? email.trim() : null,
        passwordHash,
        full_name ? full_name.trim() : null,
        phone ? phone.trim() : null,
        department ? department.trim() : null,
        year_of_join ? Number(year_of_join) : null,
        date_of_birth || null,
        address ? address.trim() : null,
        beacon_uuid ? beacon_uuid.trim() : null,
        active !== undefined ? Number(active) : null,
        targetUserId,
      ]
    );

    // If new section creation requested and assign to this user
    if (new_section_name && new_section_name.trim()) {
      const code = (new_section_code || `SEC-${Date.now().toString().slice(-6)}`).trim();
      const secName = new_section_name.trim();
      const ownerId = currentUser.role === 'staff' ? targetUserId : req.user.id;
      const [secRes] = await query('INSERT INTO sections (section_code, name, owner_id) VALUES (?, ?, ?)', [code, secName, ownerId]);
      const newSecId = secRes.insertId;

      if (currentUser.role === 'staff') {
        await query('INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)', [newSecId, targetUserId]);
      } else if (currentUser.role === 'student') {
        await query('INSERT IGNORE INTO enrollments (section_id, student_id) VALUES (?, ?)', [newSecId, targetUserId]);
      }
    }

    // If array of section_ids provided (e.g. for staff with multiple sections)
    if (Array.isArray(section_ids)) {
      if (currentUser.role === 'staff') {
        await query('DELETE FROM section_staff WHERE staff_id = ?', [targetUserId]);
        for (const sid of section_ids) {
          if (Number(sid)) {
            await query('INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)', [Number(sid), targetUserId]);
          }
        }
      } else if (currentUser.role === 'student') {
        await query('DELETE FROM enrollments WHERE student_id = ?', [targetUserId]);
        for (const sid of section_ids) {
          if (Number(sid)) {
            await query('INSERT IGNORE INTO enrollments (section_id, student_id) VALUES (?, ?)', [Number(sid), targetUserId]);
          }
        }
      }
    }

    // If add_section_id is provided
    if (add_section_id && Number(add_section_id)) {
      const sId = Number(add_section_id);
      if (currentUser.role === 'staff') {
        await query('INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)', [sId, targetUserId]);
      } else if (currentUser.role === 'student') {
        await query('INSERT IGNORE INTO enrollments (section_id, student_id) VALUES (?, ?)', [sId, targetUserId]);
      }
    }

    // If remove_section_id is provided
    if (remove_section_id && Number(remove_section_id)) {
      const sId = Number(remove_section_id);
      if (currentUser.role === 'staff') {
        await query('DELETE FROM section_staff WHERE section_id = ? AND staff_id = ?', [sId, targetUserId]);
      } else if (currentUser.role === 'student') {
        await query('DELETE FROM enrollments WHERE section_id = ? AND student_id = ?', [sId, targetUserId]);
      }
    }

    // If single targetSection provided
    const targetSection = section_id !== undefined ? section_id : sectionId;
    if (targetSection !== undefined && !Array.isArray(section_ids)) {
      if (currentUser.role === 'student') {
        await query('DELETE FROM enrollments WHERE student_id = ?', [targetUserId]);
        if (targetSection) {
          await query('INSERT INTO enrollments (section_id, student_id) VALUES (?, ?)', [Number(targetSection), targetUserId]);
        }
      } else if (currentUser.role === 'staff') {
        if (targetSection) {
          await query('INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)', [Number(targetSection), targetUserId]);
        }
      }
    }

    res.json({ message: 'User profile updated successfully.' });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: err.message || 'Failed to update user profile.' });
  }
});

export default router;
