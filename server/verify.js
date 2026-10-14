import pool from './db/db.js';
import bcrypt from 'bcryptjs';

async function verify() {
  console.log('=== SYSTEM VERIFICATION ===\n');

  // 1. Admin
  const [admins] = await pool.query("SELECT * FROM users WHERE user_id = 'admin'");
  console.log('1. Admin verification:');
  console.log('   User ID:', admins[0]?.user_id);
  console.log('   Email:', admins[0]?.email);
  console.log('   Full Name:', admins[0]?.full_name);
  console.log('   Phone:', admins[0]?.phone);
  const adminPassMatch = await bcrypt.compare('Admin@123', admins[0]?.password_hash || '');
  console.log('   Password Admin@123 valid:', adminPassMatch);

  // 2. Staff
  const [staff] = await pool.query("SELECT id, user_id, full_name, email, phone FROM users WHERE role = 'staff' ORDER BY user_id");
  console.log('\n2. Staff verification:');
  for (const s of staff) {
    const [u] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [s.id]);
    const passMatch = await bcrypt.compare('12345', u[0].password_hash);
    const [secStaff] = await pool.query(
      `SELECT s.id, s.name, s.section_code
       FROM section_staff ss
       JOIN sections s ON ss.section_id = s.id
       WHERE ss.staff_id = ?`,
      [s.id]
    );
    const sectionsText = secStaff.map((x) => `${x.name} (${x.section_code})`).join(', ') || 'Unassigned';
    console.log(`   ${s.user_id}: ${s.full_name} | Phone: ${s.phone} | Pass '12345': ${passMatch}`);
    console.log(`      Assigned Sections: ${sectionsText}`);
  }

  // 3. Students
  const [stuCount] = await pool.query("SELECT count(*) as count FROM users WHERE role = 'student'");
  console.log(`\n3. Students verification:`);
  console.log(`   Total Student Count: ${stuCount[0].count}`);
  const [firstStudent] = await pool.query("SELECT * FROM users WHERE user_id = 'STU2026001'");
  const [extraStudent] = await pool.query("SELECT * FROM users WHERE user_id = 'STU2026180'");
  console.log(`   First Student: ${firstStudent[0].user_id} - ${firstStudent[0].full_name} | Phone: ${firstStudent[0].phone}`);
  console.log(`      Password '12345' valid:`, await bcrypt.compare('12345', firstStudent[0].password_hash));
  console.log(`   Last Student:  ${extraStudent[0].user_id} - ${extraStudent[0].full_name} | Phone: ${extraStudent[0].phone}`);
  console.log(`      Password '12345' valid:`, await bcrypt.compare('12345', extraStudent[0].password_hash));

  // 4. Sections & Enrollment Counts
  const [sections] = await pool.query(`
    SELECT s.id, s.section_code, s.name, u.full_name as owner_name
    FROM sections s
    JOIN users u ON s.owner_id = u.id
    ORDER BY s.id
  `);
  console.log(`\n4. Sections & Enrollments:`);
  for (const sec of sections) {
    const [enr] = await pool.query('SELECT count(*) as count FROM enrollments WHERE section_id = ?', [sec.id]);
    console.log(`   [ID: ${sec.id}] ${sec.section_code} | ${sec.name} | Staff: ${sec.owner_name} | Enrolled: ${enr[0].count} students`);
  }

  process.exit(0);
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
