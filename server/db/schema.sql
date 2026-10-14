-- ClassBeacon Local MySQL Database Schema
CREATE DATABASE IF NOT EXISTS classbeacon_db;
USE classbeacon_db;

-- 1. Users Table (Admin, Staff, Students with complete college details)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) UNIQUE NOT NULL COMMENT 'Roll number for students, Staff ID for staff, ADMIN001 for admin',
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('admin', 'staff', 'student') NOT NULL,
  phone VARCHAR(20) NULL,
  department VARCHAR(100) NULL,
  year_of_join INT NULL,
  date_of_birth DATE NULL,
  address TEXT NULL,
  beacon_uuid VARCHAR(100) NULL COMMENT 'Assigned Beacon tracking ID',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Sections Table
CREATE TABLE IF NOT EXISTS sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  section_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  owner_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Section Staff Mapping Table
CREATE TABLE IF NOT EXISTS section_staff (
  section_id INT NOT NULL,
  staff_id INT NOT NULL,
  PRIMARY KEY (section_id, staff_id),
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Enrollments Table
CREATE TABLE IF NOT EXISTS enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  section_id INT NOT NULL,
  student_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_enrollment (section_id, student_id),
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Videos Table (Library snapshots)
CREATE TABLE IF NOT EXISTS videos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  source_url VARCHAR(500) NOT NULL,
  duration_sec INT NOT NULL,
  owner_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Assignments Table
CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  section_id INT NOT NULL,
  video_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  source_url VARCHAR(500) NOT NULL,
  duration_sec INT NOT NULL,
  required_watch_minutes INT NULL DEFAULT NULL,
  completion_threshold DOUBLE NOT NULL DEFAULT 0.8,
  policy_sequential TINYINT(1) NOT NULL DEFAULT 1,
  policy_pause_hidden TINYINT(1) NOT NULL DEFAULT 1,
  policy_hidden_alert_sec INT NOT NULL DEFAULT 60,
  policy_max_rate DOUBLE NOT NULL DEFAULT 1.5,
  due_at DATETIME NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'published',
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_uuid VARCHAR(100) UNIQUE NOT NULL,
  student_id INT NOT NULL,
  assignment_id INT NOT NULL,
  section_id INT NOT NULL,
  status ENUM('active', 'completed', 'abandoned', 'interrupted') NOT NULL DEFAULT 'active',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_event_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  event_count INT NOT NULL DEFAULT 0,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Events Subcollection Table
CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  seq INT NOT NULL,
  client_at BIGINT NOT NULL,
  server_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  details_json JSON NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8b. Monitoring Evidence Snapshots Table
CREATE TABLE IF NOT EXISTS monitoring_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  student_id INT NOT NULL,
  section_id INT NOT NULL,
  assignment_id INT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  confidence DOUBLE NOT NULL DEFAULT 0.0,
  snapshot_data LONGTEXT NOT NULL,
  details_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_section (section_id),
  INDEX idx_student (student_id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Progress Table
CREATE TABLE IF NOT EXISTS progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  section_id INT NOT NULL,
  duration_sec INT NOT NULL,
  chunk_sec INT NOT NULL DEFAULT 5,
  total_chunks INT NOT NULL,
  max_rate DOUBLE NOT NULL DEFAULT 1.5,
  threshold DOUBLE NOT NULL DEFAULT 0.8,
  chunks_json JSON NULL,
  last_beat_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY unique_student_assignment_progress (assignment_id, student_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Reports Table (Student technical issue reports)
CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NULL,
  student_id INT NOT NULL,
  section_id INT NOT NULL,
  assignment_id INT NULL,
  text TEXT NOT NULL,
  status ENUM('pending', 'reviewed', 'resolved') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Reviews Table (Staff review & resolution notes)
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  section_id INT NOT NULL,
  notes TEXT NOT NULL,
  outcome ENUM('resolved', 'needs_follow_up', 'technical_issue') NOT NULL,
  reviewed_by INT NOT NULL,
  reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. Consents Table
CREATE TABLE IF NOT EXISTS consents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  notice_version VARCHAR(20) NOT NULL,
  accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_student_consent (student_id, notice_version),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. Section Links Table (Teacher-specific resource & meeting links)
CREATE TABLE IF NOT EXISTS section_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  section_id INT NOT NULL,
  teacher_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
