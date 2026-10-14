import pool from './db/db.js';
import bcrypt from 'bcryptjs';

const firstNames = [
  'Aarav', 'Ananya', 'Rohan', 'Priya', 'Aditya', 'Sneha', 'Vikram', 'Kavya', 'Rahul', 'Neha',
  'Siddharth', 'Pooja', 'Karan', 'Divya', 'Varun', 'Riya', 'Arjun', 'Shreya', 'Manish', 'Ishita',
  'Deepak', 'Meera', 'Tarun', 'Anushka', 'Yash', 'Tanvi', 'Abhishek', 'Swati', 'Nikhil', 'Simran',
  'Gautam', 'Kriti', 'Pranav', 'Nisha', 'Rishabh', 'Bhavna', 'Akash', 'Shruti', 'Harsh', 'Radhika',
  'Amit', 'Deepa', 'Suresh', 'Anjali', 'Karthik', 'Sunita', 'Rajesh', 'Vandana', 'Sanjay', 'Meenakshi'
];

const lastNames = [
  'Sharma', 'Verma', 'Patel', 'Rao', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Singh', 'Kumar',
  'Joshi', 'Deshmukh', 'Chowdhury', 'Banerjee', 'Mehta', 'Shah', 'Kulkarni', 'Bhat', 'Pillai', 'Menon'
];

const departments = [
  'Computer Science & Engineering',
  'Information Technology',
  'Electronics & Communication Engineering',
  'Electrical & Electronics Engineering',
  'Data Science & AI'
];

const cities = ['Hyderabad', 'Bengaluru', 'Chennai', 'Mumbai', 'Pune', 'Delhi NCR', 'Kolkata', 'Ahmedabad'];

async function seedDatabase() {
  console.log('🌱 Starting ClassBeacon Database Seeding...');

  try {
    const passwordHash = await bcrypt.hash('12345', 10);
    const adminPasswordHash = await bcrypt.hash('Admin@123', 10);

    // 1. Seed Admin Account
    await pool.query(`
      INSERT INTO users 
      (user_id, email, password_hash, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true)
      ON DUPLICATE KEY UPDATE 
      password_hash = VALUES(password_hash),
      full_name = VALUES(full_name),
      phone = VALUES(phone),
      department = VALUES(department),
      address = VALUES(address)
    `, [
      'admin',
      'admin@classbeacon.edu',
      adminPasswordHash,
      'Rajeshwar Verma (System Admin)',
      'admin',
      '+91 98480 12345',
      'Administration',
      2024,
      '1985-05-15',
      'Main Campus, Administrative Block, Room 101, Hyderabad',
      'BCN-ADMIN-001'
    ]);
    console.log('✅ Admin user created (admin / admin@classbeacon.edu / Admin@123)');

    // 2. Seed 3 Staff Accounts (Indian Names and Mobile Numbers)
    const staffData = [
      {
        user_id: 'STAFF001',
        email: 'staff1@classbeacon.edu',
        name: 'Dr. Rajesh Sharma',
        phone: '+91 98765 43210',
        dept: 'Computer Science & Engineering',
        year: 2021,
        dob: '1982-06-23',
        address: 'Faculty Enclave, Flat 201, Campus Housing, Hyderabad',
        uuid: 'BCN-STAFF-001'
      },
      {
        user_id: 'STAFF002',
        email: 'staff2@classbeacon.edu',
        name: 'Prof. Priya Patel',
        phone: '+91 98765 43211',
        dept: 'Information Technology',
        year: 2022,
        dob: '1988-12-10',
        address: 'Faculty Enclave, Flat 202, Campus Housing, Hyderabad',
        uuid: 'BCN-STAFF-002'
      },
      {
        user_id: 'STAFF003',
        email: 'staff3@classbeacon.edu',
        name: 'Dr. Amit Verma',
        phone: '+91 98765 43212',
        dept: 'Data Science & AI',
        year: 2020,
        dob: '1984-09-09',
        address: 'Faculty Enclave, Flat 203, Campus Housing, Hyderabad',
        uuid: 'BCN-STAFF-003'
      }
    ];

    for (const staff of staffData) {
      await pool.query(`
        INSERT INTO users 
        (user_id, email, password_hash, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active)
        VALUES (?, ?, ?, ?, 'staff', ?, ?, ?, ?, ?, ?, true)
        ON DUPLICATE KEY UPDATE 
          full_name = VALUES(full_name),
          phone = VALUES(phone),
          password_hash = VALUES(password_hash),
          department = VALUES(department),
          address = VALUES(address)
      `, [
        staff.user_id,
        staff.email,
        passwordHash,
        staff.name,
        staff.phone,
        staff.dept,
        staff.year,
        staff.dob,
        staff.address,
        staff.uuid
      ]);
    }
    console.log('✅ 3 Staff accounts created with Indian details (STAFF001 - STAFF003)');

    // 3. Seed 180 Student Accounts (Indian Names & Mobile Numbers, Password = 12345)
    let studentCount = 0;
    for (let i = 1; i <= 180; i++) {
      const padNum = String(i).padStart(3, '0');
      const userId = `STU2026${padNum}`;
      const email = `student${padNum}@classbeacon.edu`;
      const fn = firstNames[(i - 1) % firstNames.length];
      const ln = lastNames[(i - 1) % lastNames.length];
      const fullName = `${fn} ${ln}`;
      const dept = departments[(i - 1) % departments.length];
      const city = cities[(i - 1) % cities.length];
      const joinYear = 2023 + (i % 3);
      const dobYear = joinYear - 18;
      const dobMonth = String((i % 12) + 1).padStart(2, '0');
      const dobDay = String((i % 28) + 1).padStart(2, '0');
      const dob = `${dobYear}-${dobMonth}-${dobDay}`;
      const phone = `+91 98765 ${String(10000 + i).padStart(5, '0')}`;
      const address = `#${100 + i}, Tech Park Road, ${city}`;
      const beaconUuid = `BCN-2026-${padNum}`;

      await pool.query(`
        INSERT INTO users 
        (user_id, email, password_hash, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active)
        VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, ?, ?, true)
        ON DUPLICATE KEY UPDATE 
          full_name = VALUES(full_name),
          phone = VALUES(phone),
          password_hash = VALUES(password_hash),
          address = VALUES(address)
      `, [
        userId, email, passwordHash, fullName, phone, dept, joinYear, dob, address, beaconUuid
      ]);
      studentCount++;
    }
    console.log(`✅ ${studentCount} Student accounts created (STU2026001 - STU2026180)`);

    // Fetch Staff IDs
    const [staff1Rows] = await pool.query('SELECT id FROM users WHERE user_id = ?', ['STAFF001']);
    const staff1Id = staff1Rows[0].id;
    const [staff2Rows] = await pool.query('SELECT id FROM users WHERE user_id = ?', ['STAFF002']);
    const staff2Id = staff2Rows[0].id;
    const [staff3Rows] = await pool.query('SELECT id FROM users WHERE user_id = ?', ['STAFF003']);
    const staff3Id = staff3Rows[0].id;

    // 4. Seed Sections:
    // Section A (Dr. Rajesh Sharma)
    const [secARes] = await pool.query(`
      INSERT INTO sections (section_code, name, owner_id)
      VALUES ('SEC-A-60', 'Section A (Dr. Rajesh Sharma)', ?)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), name=VALUES(name)
    `, [staff1Id]);
    const secAId = secARes.insertId;
    await pool.query(`INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`, [secAId, staff1Id]);

    // Section B (Prof. Priya Patel)
    const [secBRes] = await pool.query(`
      INSERT INTO sections (section_code, name, owner_id)
      VALUES ('SEC-B-60', 'Section B (Prof. Priya Patel)', ?)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), name=VALUES(name)
    `, [staff2Id]);
    const secBId = secBRes.insertId;
    await pool.query(`INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`, [secBId, staff2Id]);

    // Section C (Dr. Amit Verma)
    const [secCRes] = await pool.query(`
      INSERT INTO sections (section_code, name, owner_id)
      VALUES ('SEC-C-60', 'Section C (Dr. Amit Verma)', ?)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), name=VALUES(name)
    `, [staff3Id]);
    const secCId = secCRes.insertId;
    await pool.query(`INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`, [secCId, staff3Id]);

    // Sample Section CS-301 also taught by Dr. Rajesh Sharma
    const [secResult] = await pool.query(`
      INSERT INTO sections (section_code, name, owner_id)
      VALUES ('CS301-SEC-A', 'CS-301 Data Structures & Algorithms', ?)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [staff1Id]);
    const sectionId = secResult.insertId;
    await pool.query(`INSERT IGNORE INTO section_staff (section_id, staff_id) VALUES (?, ?)`, [sectionId, staff1Id]);

    // Enroll students in batches of 60
    const [students] = await pool.query("SELECT id, user_id FROM users WHERE role = 'student' ORDER BY user_id ASC");
    for (const student of students) {
      const num = parseInt(student.user_id.replace('STU2026', ''), 10);
      let targetSec = secAId;
      if (num > 60 && num <= 120) targetSec = secBId;
      else if (num > 120) targetSec = secCId;

      await pool.query(`
        INSERT INTO enrollments (section_id, student_id)
        VALUES (?, ?) ON DUPLICATE KEY UPDATE student_id=student_id
      `, [targetSec, student.id]);
    }
    console.log(`✅ 180 Students enrolled section-wise (60 per staff)`);

    // 5. Seed Sample Video & Assignment
    const [vidResult] = await pool.query(`
      INSERT INTO videos (title, source_url, duration_sec, owner_id)
      VALUES ('Lecture 1: Introduction to Binary Search Trees', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 300, ?)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [staff1Id]);
    const videoId = vidResult.insertId;

    await pool.query(`
      INSERT INTO assignments (section_id, video_id, title, source_url, duration_sec, completion_threshold, created_by)
      VALUES (?, ?, 'Intro to BST Lecture', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 300, 0.8, ?)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [secAId, videoId, staff1Id]);

    console.log('✅ Sample Video and Assignment seeded');

    console.log('\n==================================================');
    console.log(' 🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('==================================================');
    console.log(' Credentials summary:');
    console.log('   Admin:   admin       / admin@classbeacon.edu   / Admin@123');
    console.log('   Staff:   STAFF001    / staff1@classbeacon.edu  / 12345');
    console.log('   Staff:   STAFF002    / staff2@classbeacon.edu  / 12345');
    console.log('   Staff:   STAFF003    / staff3@classbeacon.edu  / 12345');
    console.log('   Student: STU2026001  / student001@classbeacon.edu / 12345');
    console.log('   (180 Students: STU2026001 to STU2026180, password: 12345)');
    console.log('==================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedDatabase();
