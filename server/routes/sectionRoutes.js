import express from 'express';
import { query } from '../db/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken);

// Helper function to verify section access
export async function canAccessSection(user, sectionId) {
  if (user.role === 'admin') return true;
  if (user.role === 'staff') {
    const rows = await query(
      `SELECT s.id FROM sections s
       LEFT JOIN section_staff ss ON s.id = ss.section_id
       WHERE s.id = ? AND (s.owner_id = ? OR ss.staff_id = ?)`,
      [sectionId, user.id, user.id]
    );
    return rows.length > 0;
  }
  if (user.role === 'student') {
    const rows = await query(
      `SELECT id FROM enrollments WHERE section_id = ? AND student_id = ?`,
      [sectionId, user.id]
    );
    return rows.length > 0;
  }
  return false;
}

// GET /api/sections
// Admin: all sections with staff and student counts
// Staff: ONLY sections assigned to this staff member
// Student: ONLY enrolled sections
router.get('/', async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const sections = await query(
        `SELECT s.*, u.full_name as owner_name, u.email as owner_email,
                COUNT(DISTINCT e.id) as student_count
         FROM sections s
         LEFT JOIN users u ON s.owner_id = u.id
         LEFT JOIN enrollments e ON s.id = e.section_id
         GROUP BY s.id
         ORDER BY s.id DESC`
      );

      // Fetch assigned staff for each section
      for (const sec of sections) {
        const staffList = await query(
          `SELECT u.id, u.user_id, u.full_name, u.email, u.department
           FROM section_staff ss
           JOIN users u ON ss.staff_id = u.id
           WHERE ss.section_id = ?`,
          [sec.id]
        );
        sec.staff = staffList;
      }

      return res.json(sections);
    } else if (req.user.role === 'staff') {
      // Teachers ONLY see sections assigned to them
      const sections = await query(
        `SELECT DISTINCT s.*, u.full_name as owner_name, u.email as owner_email,
                COUNT(DISTINCT e.id) as student_count
         FROM sections s
         LEFT JOIN users u ON s.owner_id = u.id
         LEFT JOIN section_staff ss ON s.id = ss.section_id
         LEFT JOIN enrollments e ON s.id = e.section_id
         WHERE s.owner_id = ? OR ss.staff_id = ?
         GROUP BY s.id
         ORDER BY s.id DESC`,
        [req.user.id, req.user.id]
      );

      return res.json(sections);
    } else {
      // Students see only their enrolled sections
      const sections = await query(
        `SELECT s.*, u.full_name as owner_name, u.email as owner_email
         FROM enrollments e
         JOIN sections s ON e.section_id = s.id
         LEFT JOIN users u ON s.owner_id = u.id
         WHERE e.student_id = ?
         ORDER BY s.id DESC`,
        [req.user.id]
      );
      return res.json(sections);
    }
  } catch (err) {
    console.error('Fetch sections error:', err);
    res.status(500).json({ error: 'Failed to fetch sections.' });
  }
});

// GET /api/sections/:id (Single section details with access check)
router.get('/:id', async (req, res) => {
  try {
    const hasAccess = await canAccessSection(req.user, req.params.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to view this section.' });
    }

    const sections = await query(
      `SELECT s.*, u.full_name as owner_name, u.email as owner_email,
              COUNT(DISTINCT e.id) as student_count
       FROM sections s
       LEFT JOIN users u ON s.owner_id = u.id
       LEFT JOIN enrollments e ON s.id = e.section_id
       WHERE s.id = ?
       GROUP BY s.id`,
      [req.params.id]
    );

    if (sections.length === 0) {
      return res.status(404).json({ error: 'Section not found.' });
    }

    const sec = sections[0];
    const staffList = await query(
      `SELECT u.id, u.user_id, u.full_name, u.email, u.department
       FROM section_staff ss
       JOIN users u ON ss.staff_id = u.id
       WHERE ss.section_id = ?`,
      [sec.id]
    );
    sec.staff = staffList;

    res.json(sec);
  } catch (err) {
    console.error('Get section error:', err);
    res.status(500).json({ error: 'Failed to fetch section details.' });
  }
});

// POST /api/sections (Admin only creates section)
router.post('/', requireRole(['admin']), async (req, res) => {
  const { name, section_code, sectionCode, owner_id, ownerId, staff_ids, staffIds } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Section name is required.' });
  }

  const code = (section_code || sectionCode || `SEC-${Date.now().toString().slice(-6)}`).trim();
  const assignedOwnerId = (req.user.role === 'admin' && (owner_id || ownerId)) ? Number(owner_id || ownerId) : req.user.id;

  try {
    const result = await query(
      `INSERT INTO sections (section_code, name, owner_id) VALUES (?, ?, ?)`,
      [code, name.trim(), assignedOwnerId]
    );
    const newSectionId = result.insertId;

    // Add owner to section_staff
    await query(
      `INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`,
      [newSectionId, assignedOwnerId]
    );

    // If extra staff IDs provided (by Admin)
    const extraStaff = staff_ids || staffIds || [];
    if (Array.isArray(extraStaff)) {
      for (const sid of extraStaff) {
        if (Number(sid) && Number(sid) !== assignedOwnerId) {
          await query(
            `INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`,
            [newSectionId, Number(sid)]
          );
        }
      }
    }

    res.status(201).json({
      id: newSectionId,
      section_code: code,
      name: name.trim(),
      owner_id: assignedOwnerId,
      message: 'Section created successfully.'
    });
  } catch (err) {
    console.error('Create section error:', err);
    res.status(500).json({ error: err.message || 'Failed to create section.' });
  }
});

// PUT /api/sections/:id (Admin update section details & assigned teachers)
router.put('/:id', requireRole(['admin']), async (req, res) => {
  const { name, section_code, sectionCode, owner_id, ownerId, staff_ids, staffIds } = req.body;
  const sectionId = req.params.id;

  try {
    const [existing] = await query('SELECT * FROM sections WHERE id = ?', [sectionId]);
    if (!existing) {
      return res.status(404).json({ error: 'Section not found.' });
    }

    const updatedName = (name !== undefined ? name : existing.name).trim();
    const updatedCode = (section_code || sectionCode || existing.section_code).trim();
    const updatedOwner = owner_id || ownerId || existing.owner_id;

    await query(
      `UPDATE sections SET name = ?, section_code = ?, owner_id = ? WHERE id = ?`,
      [updatedName, updatedCode, Number(updatedOwner), sectionId]
    );

    // If staff_ids provided, sync section_staff table
    const newStaffList = staff_ids || staffIds;
    if (Array.isArray(newStaffList)) {
      await query(`DELETE FROM section_staff WHERE section_id = ?`, [sectionId]);
      // Always include owner
      await query(`INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`, [sectionId, Number(updatedOwner)]);
      for (const sid of newStaffList) {
        if (Number(sid)) {
          await query(`INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`, [sectionId, Number(sid)]);
        }
      }
    }

    res.json({ message: 'Section updated successfully.' });
  } catch (err) {
    console.error('Update section error:', err);
    res.status(500).json({ error: 'Failed to update section.' });
  }
});

// DELETE /api/sections/:id (Admin delete section)
router.delete('/:id', requireRole(['admin']), async (req, res) => {
  try {
    await query('DELETE FROM sections WHERE id = ?', [req.params.id]);
    res.json({ message: 'Section deleted successfully.' });
  } catch (err) {
    console.error('Delete section error:', err);
    res.status(500).json({ error: 'Failed to delete section.' });
  }
});

// GET /api/sections/:id/students or /api/sections/:id/enrollments
// Strict access control: Teachers CANNOT view students outside their assigned section!
const getSectionStudentsHandler = async (req, res) => {
  const sectionId = req.params.id;
  try {
    const hasAccess = await canAccessSection(req.user, sectionId);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied. You do not have permission to view students in this section.'
      });
    }

    const students = await query(
      `SELECT e.id as enrollment_id, u.id as student_id, u.id, u.user_id, u.user_id as roll_number,
              u.full_name, u.email, u.phone, u.department, u.year_of_join, u.beacon_uuid, e.created_at as enrolled_at
       FROM enrollments e
       JOIN users u ON e.student_id = u.id
       WHERE e.section_id = ?
       ORDER BY u.user_id ASC`,
      [sectionId]
    );

    // Return direct array for compatibility with apps
    res.json(students);
  } catch (err) {
    console.error('Fetch section students error:', err);
    res.status(500).json({ error: 'Failed to fetch enrolled students.' });
  }
};

router.get('/:id/students', getSectionStudentsHandler);
router.get('/:id/enrollments', getSectionStudentsHandler);

// POST /api/sections/:id/enroll or /api/sections/:id/enrollments
// Admin or Assigned Staff enroll a student into section
const enrollStudentHandler = async (req, res) => {
  const sectionId = req.params.id;
  const { student_user_id, studentId, student_id, roll_number } = req.body;
  const identifier = student_user_id || studentId || student_id || roll_number;

  if (!identifier) {
    return res.status(400).json({ error: 'Student ID, Roll Number, or Email is required.' });
  }

  try {
    const hasAccess = await canAccessSection(req.user, sectionId);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied. You do not have permission to manage enrollments for this section.'
      });
    }

    const students = await query(
      `SELECT id, user_id, full_name, email FROM users
       WHERE (user_id = ? OR email = ? OR id = ?) AND role = 'student'`,
      [identifier, identifier, isNaN(identifier) ? -1 : Number(identifier)]
    );

    if (students.length === 0) {
      return res.status(404).json({ error: `Student '${identifier}' not found.` });
    }

    const student = students[0];
    await query(
      `INSERT IGNORE INTO enrollments (section_id, student_id) VALUES (?, ?)`,
      [sectionId, student.id]
    );

    res.status(201).json({
      message: `Student ${student.full_name} (${student.user_id}) enrolled successfully.`,
      student_id: student.id,
      user_id: student.user_id,
      full_name: student.full_name
    });
  } catch (err) {
    console.error('Enroll student error:', err);
    res.status(500).json({ error: 'Failed to enroll student.' });
  }
};

router.post('/:id/enroll', requireRole(['admin']), enrollStudentHandler);
router.post('/:id/enrollments', requireRole(['admin']), enrollStudentHandler);
router.post('/:id/students', requireRole(['admin']), enrollStudentHandler);

// DELETE /api/sections/:id/enrollments/:studentId (Admin only removes student from section)
router.delete('/:id/enrollments/:studentId', requireRole(['admin']), async (req, res) => {
  const sectionId = req.params.id;
  const studentId = req.params.studentId;

  try {
    await query(
      `DELETE FROM enrollments WHERE section_id = ? AND student_id = ?`,
      [sectionId, studentId]
    );

    res.json({ message: 'Enrollment removed successfully.' });
  } catch (err) {
    console.error('Remove enrollment error:', err);
    res.status(500).json({ error: 'Failed to remove enrollment.' });
  }
});
router.delete('/:id/students/:studentId', requireRole(['admin']), async (req, res) => {
  const sectionId = req.params.id;
  const studentId = req.params.studentId;

  try {
    const hasAccess = await canAccessSection(req.user, sectionId);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied. You do not have permission to remove students from this section.'
      });
    }

    await query(
      `DELETE FROM enrollments WHERE section_id = ? AND student_id = ?`,
      [sectionId, studentId]
    );

    res.json({ message: 'Enrollment removed successfully.' });
  } catch (err) {
    console.error('Remove enrollment error:', err);
    res.status(500).json({ error: 'Failed to remove enrollment.' });
  }
});

// POST /api/sections/:id/teachers (Admin assign teacher to section)
router.post('/:id/teachers', requireRole(['admin']), async (req, res) => {
  const sectionId = req.params.id;
  const { teacher_id, teacherId, staff_id, staffId } = req.body;
  const targetStaffId = teacher_id || teacherId || staff_id || staffId;

  if (!targetStaffId) {
    return res.status(400).json({ error: 'Teacher / Staff ID is required.' });
  }

  try {
    const staffRows = await query(
      `SELECT id, user_id, full_name, email FROM users WHERE (id = ? OR user_id = ? OR email = ?) AND role = 'staff'`,
      [isNaN(targetStaffId) ? -1 : Number(targetStaffId), targetStaffId, targetStaffId]
    );

    if (staffRows.length === 0) {
      return res.status(404).json({ error: 'Teacher / Staff member not found.' });
    }

    const staffMember = staffRows[0];
    await query(
      `INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`,
      [sectionId, staffMember.id]
    );

    res.status(201).json({
      message: `Teacher ${staffMember.full_name} assigned to section successfully.`,
      teacher: staffMember
    });
  } catch (err) {
    console.error('Assign teacher error:', err);
    res.status(500).json({ error: 'Failed to assign teacher.' });
  }
});

// DELETE /api/sections/:id/teachers/:staffId (Admin unassign teacher from section)
router.delete('/:id/teachers/:staffId', requireRole(['admin']), async (req, res) => {
  const { id: sectionId, staffId } = req.params;
  try {
    await query(`DELETE FROM section_staff WHERE section_id = ? AND staff_id = ?`, [sectionId, staffId]);
    res.json({ message: 'Teacher unassigned from section.' });
  } catch (err) {
    console.error('Unassign teacher error:', err);
    res.status(500).json({ error: 'Failed to unassign teacher.' });
  }
});

// POST /api/sections/auto-divide
// Feature: Assign 60 students for each teacher and divide students Section-Wise!
router.post('/auto-divide', requireRole(['admin']), async (req, res) => {
  const batchSize = Math.max(1, Number(req.body.batch_size || req.body.batchSize) || 60);

  try {
    // 1. Fetch all active teachers (staff)
    const teachers = await query(
      `SELECT id, user_id, full_name, email, department FROM users WHERE role = 'staff' AND active = 1 ORDER BY id ASC`
    );

    if (teachers.length === 0) {
      return res.status(400).json({ error: 'No active staff / teachers found to assign.' });
    }

    // 2. Fetch all active students
    const students = await query(
      `SELECT id, user_id, full_name, email, department FROM users WHERE role = 'student' AND active = 1 ORDER BY user_id ASC`
    );

    if (students.length === 0) {
      return res.status(400).json({ error: 'No students found to divide.' });
    }

    const totalStudents = students.length;
    const numSections = Math.ceil(totalStudents / batchSize);
    const sectionNames = ['Section A', 'Section B', 'Section C', 'Section D', 'Section E', 'Section F', 'Section G', 'Section H'];

    const summary = [];

    // Destructive reset protection: default to safe false, require explicit confirmation
    const resetRequested = req.body.reset === true;
    const resetConfirmed = req.body.confirm_reset === 'CONFIRM_RESET_ALL_ENROLLMENTS';

    if (resetRequested && !resetConfirmed) {
      return res.status(400).json({
        error: 'Destructive operation blocked: To wipe all existing student enrollments during auto-division, you must explicitly provide confirm_reset: "CONFIRM_RESET_ALL_ENROLLMENTS".'
      });
    }

    if (resetRequested && resetConfirmed) {
      await query('DELETE FROM enrollments');
    }

    for (let i = 0; i < numSections; i++) {
      const sectionLetter = sectionNames[i] || `Section ${String.fromCharCode(65 + i)}`;
      const assignedTeacher = teachers[i % teachers.length];
      const sectionCode = `SEC-${String.fromCharCode(65 + i)}-${batchSize}`;
      const sectionName = `${sectionLetter} (${assignedTeacher.full_name})`;

      // Create or update section
      const [existingSec] = await query('SELECT id FROM sections WHERE section_code = ?', [sectionCode]);
      let secId;

      if (existingSec) {
        secId = existingSec.id;
        await query(
          'UPDATE sections SET name = ?, owner_id = ? WHERE id = ?',
          [sectionName, assignedTeacher.id, secId]
        );
      } else {
        const secRes = await query(
          'INSERT INTO sections (section_code, name, owner_id) VALUES (?, ?, ?)',
          [sectionCode, sectionName, assignedTeacher.id]
        );
        secId = secRes.insertId;
      }

      // Assign teacher in section_staff
      await query(
        'INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)',
        [secId, assignedTeacher.id]
      );

      // Slice students for this section (e.g. 0 to 60, 60 to 120)
      const sectionStudents = students.slice(i * batchSize, (i + 1) * batchSize);
      for (const s of sectionStudents) {
        await query(
          'INSERT IGNORE INTO enrollments (section_id, student_id) VALUES (?, ?)',
          [secId, s.id]
        );
      }

      summary.push({
        sectionId: secId,
        sectionCode,
        sectionName,
        teacher: assignedTeacher.full_name,
        teacherUserId: assignedTeacher.user_id,
        studentCount: sectionStudents.length,
        studentRange: sectionStudents.length > 0 ? `${sectionStudents[0].user_id} - ${sectionStudents[sectionStudents.length - 1].user_id}` : 'None'
      });
    }

    res.json({
      message: `Successfully divided ${totalStudents} students section-wise (${batchSize} members per teacher)!`,
      batchSize,
      totalStudents,
      sectionsCreated: numSections,
      allocationSummary: summary
    });
  } catch (err) {
    console.error('Auto divide error:', err);
    res.status(500).json({ error: 'Failed to divide students section-wise: ' + err.message });
  }
});

export default router;
