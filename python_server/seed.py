import pymysql
import sys
import io
from werkzeug.security import generate_password_hash
from db import get_db_connection

# Force UTF-8 output encoding for Windows console compatibility
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

first_names = [
    'Aarav', 'Ananya', 'Rohan', 'Priya', 'Aditya', 'Sneha', 'Vikram', 'Kavya', 'Rahul', 'Neha',
    'Siddharth', 'Pooja', 'Karan', 'Divya', 'Varun', 'Riya', 'Arjun', 'Shreya', 'Manish', 'Ishita',
    'Deepak', 'Meera', 'Tarun', 'Anushka', 'Yash', 'Tanvi', 'Abhishek', 'Swati', 'Nikhil', 'Simran',
    'Gautam', 'Kriti', 'Pranav', 'Nisha', 'Rishabh', 'Bhavna', 'Akash', 'Shruti', 'Harsh', 'Radhika'
]

last_names = [
    'Sharma', 'Verma', 'Patel', 'Rao', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Singh', 'Kumar',
    'Joshi', 'Deshmukh', 'Chowdhury', 'Banerjee', 'Mehta', 'Shah', 'Kulkarni', 'Bhat', 'Pillai', 'Menon'
]

departments = [
    'Computer Science & Engineering',
    'Information Technology',
    'Electronics & Communication Engineering',
    'Electrical & Electronics Engineering',
    'Data Science & AI'
]

cities = ['Hyderabad', 'Bengaluru', 'Chennai', 'Mumbai', 'Pune', 'Delhi NCR', 'Kolkata', 'Ahmedabad']

def seed_database():
    print("Starting ClassBeacon Python Seeding Script...")
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Standard hashes
        admin_pass_hash = generate_password_hash('AdminPassword123!')
        staff_pass_hash = generate_password_hash('StaffPassword123!')
        student_pass_hash = generate_password_hash('Password123!')

        # 1. Seed Admin
        cursor.execute("""
            INSERT INTO users 
            (user_id, email, password_hash, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
            ON DUPLICATE KEY UPDATE 
            password_hash=VALUES(password_hash),
            full_name=VALUES(full_name)
        """, (
            'ADMIN001',
            'admin@classbeacon.edu',
            admin_pass_hash,
            'System Administrator',
            'admin',
            '+1 555-0100',
            'Administration',
            2024,
            '1985-05-15',
            'Main Campus, Admin Block, Suite 101',
            'BCN-ADMIN-001'
        ))
        print("[SUCCESS] Admin user created (ADMIN001 / admin@classbeacon.edu / AdminPassword123!)")

        # 2. Seed 3 Staff
        staff_members = [
            ('STAFF001', 'staff1@classbeacon.edu', 'Dr. Alan Turing', 'Computer Science & Engineering', 2021, '1982-06-23', 'BCN-STAFF-001'),
            ('STAFF002', 'staff2@classbeacon.edu', 'Prof. Ada Lovelace', 'Information Technology', 2022, '1988-12-10', 'BCN-STAFF-002'),
            ('STAFF003', 'staff3@classbeacon.edu', 'Dr. Grace Hopper', 'Data Science & AI', 2020, '1984-09-09', 'BCN-STAFF-003')
        ]

        for s in staff_members:
            cursor.execute("""
                INSERT INTO users 
                (user_id, email, password_hash, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active)
                VALUES (%s, %s, %s, %s, 'staff', %s, %s, %s, %s, %s, %s, 1)
                ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)
            """, (
                s[0], s[1], staff_pass_hash, s[2], f"+1 555-010{s[0][-1]}", s[3], s[4], s[5], f"Faculty Quarter #{s[0][-1]}, Campus", s[6]
            ))
        print("[SUCCESS] 3 Staff accounts created (STAFF001 - STAFF003)")

        # 3. Seed 120 Students
        student_count = 0
        for i in range(1, 121):
            pad_num = f"{i:03d}"
            user_id = f"STU2026{pad_num}"
            email = f"student{pad_num}@classbeacon.edu"
            fn = first_names[(i - 1) % len(first_names)]
            ln = last_names[(i - 1) % len(last_names)]
            full_name = f"{fn} {ln}"
            dept = departments[(i - 1) % len(departments)]
            city = cities[(i - 1) % len(cities)]
            join_year = 2023 + (i % 3)
            dob_year = join_year - 18
            dob_month = f"{(i % 12) + 1:02d}"
            dob_day = f"{(i % 28) + 1:02d}"
            dob = f"{dob_year}-{dob_month}-{dob_day}"
            phone = f"+91 98765 {10000 + i:05d}"
            address = f"#{100 + i}, Tech Park Road, {city}"
            beacon_uuid = f"BCN-2026-{pad_num}"

            cursor.execute("""
                INSERT INTO users 
                (user_id, email, password_hash, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active)
                VALUES (%s, %s, %s, %s, 'student', %s, %s, %s, %s, %s, %s, 1)
                ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)
            """, (
                user_id, email, student_pass_hash, full_name, phone, dept, join_year, dob, address, beacon_uuid
            ))
            student_count += 1
        print(f"[SUCCESS] {student_count} Student accounts created (STU2026001 - STU2026120)")

        # Fetch STAFF001 internal id
        cursor.execute("SELECT id FROM users WHERE user_id = 'STAFF001'")
        staff1_id = cursor.fetchone()['id']

        # 4. Seed Section
        cursor.execute("""
            INSERT INTO sections (section_code, name, owner_id)
            VALUES ('CS301-SEC-A', 'CS-301 Data Structures & Algorithms', %s)
            ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
        """, (staff1_id,))
        section_id = cursor.lastrowid or 1

        cursor.execute("""
            INSERT INTO section_staff (section_id, staff_id)
            VALUES (%s, %s) ON DUPLICATE KEY UPDATE staff_id=staff_id
        """, (section_id, staff1_id))

        # Enroll 120 students in section
        cursor.execute("SELECT id FROM users WHERE role = 'student'")
        all_students = cursor.fetchall()
        for s in all_students:
            cursor.execute("""
                INSERT INTO enrollments (section_id, student_id)
                VALUES (%s, %s) ON DUPLICATE KEY UPDATE student_id=student_id
            """, (section_id, s['id']))
        print(f"[SUCCESS] Section CS-301 created with {len(all_students)} students enrolled")

        # 5. Seed Video & Assignment
        cursor.execute("""
            INSERT INTO videos (title, source_url, duration_sec, owner_id)
            VALUES ('Lecture 1: Introduction to Binary Search Trees', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 300, %s)
            ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
        """, (staff1_id,))
        video_id = cursor.lastrowid or 1

        cursor.execute("""
            INSERT INTO assignments (section_id, video_id, title, source_url, duration_sec, completion_threshold, created_by)
            VALUES (%s, %s, 'Intro to BST Lecture', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 300, 0.8, %s)
            ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
        """, (section_id, video_id, staff1_id))
        print("[SUCCESS] Sample Video and Assignment seeded for Section CS-301")

        print("\n==================================================")
        print(" PYTHON DATABASE SEEDING COMPLETED SUCCESSFULLY!")
        print("==================================================\n")
    finally:
        conn.close()

if __name__ == '__main__':
    seed_database()
