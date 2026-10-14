import pool from './db/db.js';
import bcrypt from 'bcryptjs';

const indianFirstNames = [
  'Aarav', 'Ananya', 'Rohan', 'Priya', 'Aditya', 'Sneha', 'Vikram', 'Kavya', 'Rahul', 'Neha',
  'Siddharth', 'Pooja', 'Karan', 'Divya', 'Varun', 'Riya', 'Arjun', 'Shreya', 'Manish', 'Ishita',
  'Deepak', 'Meera', 'Tarun', 'Anushka', 'Yash', 'Tanvi', 'Abhishek', 'Swati', 'Nikhil', 'Simran',
  'Gautam', 'Kriti', 'Pranav', 'Nisha', 'Rishabh', 'Bhavna', 'Akash', 'Shruti', 'Harsh', 'Radhika',
  'Amit', 'Deepa', 'Suresh', 'Anjali', 'Karthik', 'Sunita', 'Rajesh', 'Vandana', 'Sanjay', 'Meenakshi',
  'Manoj', 'Sandhya', 'Alok', 'Pallavi', 'Vijay', 'Sarita', 'Ajay', 'Asha', 'Sunil', 'Preeti'
];

const indianLastNames = [
  'Sharma', 'Verma', 'Patel', 'Rao', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Singh', 'Kumar',
  'Joshi', 'Deshmukh', 'Chowdhury', 'Banerjee', 'Mehta', 'Shah', 'Kulkarni', 'Bhat', 'Pillai', 'Menon',
  'Agarwal', 'Pandey', 'Mishra', 'Trivedi', 'Saxena', 'Chatterjee', 'Mukherjee', 'Dutta', 'Sengupta', 'Das'
];

const departments = [
  'Computer Science & Engineering',
  'Information Technology',
  'Electronics & Communication Engineering',
  'Electrical & Electronics Engineering',
  'Data Science & AI'
];

const cities = ['Hyderabad', 'Bengaluru', 'Chennai', 'Mumbai', 'Pune', 'Delhi NCR', 'Kolkata', 'Ahmedabad'];

async function updateAllData() {
  console.log('🔄 Updating ClassBeacon Database with Indian details and new sections...');

  try {
    const password12345Hash = await bcrypt.hash('12345', 10);
    const adminPasswordHash = await bcrypt.hash('Admin@123', 10);

    // 1. Update/Set Admin: user_id = 'admin', password = 'Admin@123'
    const [existingAdmin] = await pool.query("SELECT id FROM users WHERE user_id = 'admin' OR user_id = 'ADMIN001' OR role = 'admin'");
    if (existingAdmin.length > 0) {
      await pool.query(`
        UPDATE users SET
          user_id = 'admin',
          email = 'admin@classbeacon.edu',
          password_hash = ?,
          full_name = 'Rajeshwar Verma (System Admin)',
          phone = '+91 98480 12345',
          department = 'Administration',
          address = 'Main Campus, Administrative Block, Room 101, Hyderabad'
        WHERE id = ?
      `, [adminPasswordHash, existingAdmin[0].id]);
      console.log(`✅ Admin updated: user_id: 'admin' / email: 'admin@classbeacon.edu' / pass: 'Admin@123'`);
    } else {
      await pool.query(`
        INSERT INTO users (user_id, email, password_hash, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active)
        VALUES ('admin', 'admin@classbeacon.edu', ?, 'Rajeshwar Verma (System Admin)', 'admin', '+91 98480 12345', 'Administration', 2024, '1985-05-15', 'Main Campus, Administrative Block, Hyderabad', 'BCN-ADMIN-001', 1)
      `, [adminPasswordHash]);
      console.log(`✅ Admin created: user_id: 'admin' / pass: 'Admin@123'`);
    }

    // 2. Update 3 Staff Accounts with Indian names and Indian phone numbers, password 12345
    const staffUpdates = [
      {
        user_id: 'STAFF001',
        email: 'staff1@classbeacon.edu',
        full_name: 'Dr. Rajesh Sharma',
        phone: '+91 98765 43210',
        department: 'Computer Science & Engineering',
        dob: '1982-06-23',
        address: 'Faculty Enclave, Flat 201, Campus Housing, Hyderabad'
      },
      {
        user_id: 'STAFF002',
        email: 'staff2@classbeacon.edu',
        full_name: 'Prof. Priya Patel',
        phone: '+91 98765 43211',
        department: 'Information Technology',
        dob: '1988-12-10',
        address: 'Faculty Enclave, Flat 202, Campus Housing, Hyderabad'
      },
      {
        user_id: 'STAFF003',
        email: 'staff3@classbeacon.edu',
        full_name: 'Dr. Amit Verma',
        phone: '+91 98765 43212',
        department: 'Data Science & AI',
        dob: '1984-09-09',
        address: 'Faculty Enclave, Flat 203, Campus Housing, Hyderabad'
      }
    ];

    for (const st of staffUpdates) {
      await pool.query(`
        UPDATE users SET
          full_name = ?,
          phone = ?,
          department = ?,
          password_hash = ?,
          address = ?
        WHERE user_id = ?
      `, [st.full_name, st.phone, st.department, password12345Hash, st.address, st.user_id]);
      console.log(`✅ Staff updated: ${st.user_id} - ${st.full_name} (${st.phone})`);
    }

    // 3. Update existing 120 Students with Indian names, Indian phones, and password = 12345
    for (let i = 1; i <= 120; i++) {
      const padNum = String(i).padStart(3, '0');
      const userId = `STU2026${padNum}`;
      const fn = indianFirstNames[(i - 1) % indianFirstNames.length];
      const ln = indianLastNames[(i - 1) % indianLastNames.length];
      const fullName = `${fn} ${ln}`;
      const phone = `+91 98765 ${String(10000 + i).padStart(5, '0')}`;
      const city = cities[(i - 1) % cities.length];
      const address = `#${100 + i}, Tech Park Road, ${city}`;

      await pool.query(`
        UPDATE users SET
          full_name = ?,
          phone = ?,
          password_hash = ?,
          address = ?
        WHERE user_id = ?
      `, [fullName, phone, password12345Hash, address, userId]);
    }
    console.log('✅ Updated first 120 students to Indian names, Indian phones, and password 12345');

    // 4. Create extra 60 students (STU2026121 to STU2026180)
    let extraCount = 0;
    for (let i = 121; i <= 180; i++) {
      const padNum = String(i).padStart(3, '0');
      const userId = `STU2026${padNum}`;
      const email = `student${padNum}@classbeacon.edu`;
      const fn = indianFirstNames[(i - 1) % indianFirstNames.length];
      const ln = indianLastNames[(i - 1) % indianLastNames.length];
      const fullName = `${fn} ${ln}`;
      const dept = departments[(i - 1) % departments.length];
      const city = cities[(i - 1) % cities.length];
      const joinYear = 2024;
      const dobYear = 2005;
      const dobMonth = String((i % 12) + 1).padStart(2, '0');
      const dobDay = String((i % 28) + 1).padStart(2, '0');
      const dob = `${dobYear}-${dobMonth}-${dobDay}`;
      const phone = `+91 98765 ${String(10000 + i).padStart(5, '0')}`;
      const address = `#${100 + i}, Gandhi Nagar, ${city}`;
      const beaconUuid = `BCN-2026-${padNum}`;

      await pool.query(`
        INSERT INTO users 
        (user_id, email, password_hash, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active)
        VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE 
          full_name = VALUES(full_name),
          phone = VALUES(phone),
          password_hash = VALUES(password_hash),
          address = VALUES(address)
      `, [userId, email, password12345Hash, fullName, phone, dept, joinYear, dob, address, beaconUuid]);
      extraCount++;
    }
    console.log(`✅ Created extra ${extraCount} students (STU2026121 to STU2026180) with password 12345`);

    // 5. Update Section Names to reflect new Indian Staff Names
    await pool.query(`UPDATE sections SET name = 'Section A (Dr. Rajesh Sharma)' WHERE section_code = 'SEC-A-60'`);
    await pool.query(`UPDATE sections SET name = 'Section B (Prof. Priya Patel)' WHERE section_code = 'SEC-B-60'`);

    // 6. Create new Section for Staff whose class was UNASSIGNED (STAFF003: Dr. Amit Verma)
    const [staff3Rows] = await pool.query("SELECT id FROM users WHERE user_id = 'STAFF003'");
    if (staff3Rows.length > 0) {
      const staff3Id = staff3Rows[0].id;
      const newSecCode = 'SEC-C-60';
      const newSecName = 'Section C (Dr. Amit Verma)';

      let sectionCId;
      const [existingSecC] = await pool.query('SELECT id FROM sections WHERE section_code = ?', [newSecCode]);
      if (existingSecC.length > 0) {
        sectionCId = existingSecC[0].id;
        await pool.query('UPDATE sections SET name = ?, owner_id = ? WHERE id = ?', [newSecName, staff3Id, sectionCId]);
      } else {
        const [insertRes] = await pool.query(`
          INSERT INTO sections (section_code, name, owner_id)
          VALUES (?, ?, ?)
        `, [newSecCode, newSecName, staff3Id]);
        sectionCId = insertRes.insertId;
      }

      // Assign staff3 to section_staff
      await pool.query(`
        INSERT IGNORE INTO section_staff (section_id, staff_id)
        VALUES (?, ?)
      `, [sectionCId, staff3Id]);

      // Enroll extra 60 students (STU2026121 to STU2026180) into this new section!
      const [extraStudents] = await pool.query(`
        SELECT id FROM users WHERE role = 'student' AND user_id >= 'STU2026121' AND user_id <= 'STU2026180'
      `);

      for (const st of extraStudents) {
        await pool.query(`
          INSERT IGNORE INTO enrollments (section_id, student_id)
          VALUES (?, ?)
        `, [sectionCId, st.id]);
      }

      console.log(`✅ Created new section '${newSecName}' (${newSecCode}) assigned to STAFF003 with ${extraStudents.length} students enrolled.`);
    }

    console.log('\n🎉 ALL UPDATES COMPLETED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Update failed:', err);
    process.exit(1);
  }
}

updateAllData();
