# ClassBeacon — Full Project Functionality & Data Storage Reference

## 1. Executive Summary & Purpose

**ClassBeacon** is an intelligent, secure, anti-cheat video-learning and proctoring platform developed for academic institutions. It bridges the gap between asynchronous video lectures and verified student engagement through:
- **Tamper-resistant playback tracking** (5-second quantised blocks, sequential gating, interval merging).
- **In-browser AI vision proctoring** (real-time face presence, gaze shift, and smartphone/second device detection via webcam).
- **Institutional management** (Admin, Faculty/Staff, and Student portals).

---

## 2. Where the Data is Stored (Folder & Disk Locations)

The data in ClassBeacon is organized across physical filesystem directories and database storage:

```
c:\ClassBeacon\
├── server\
│   └── db\
│       ├── schema.sql           <-- Table definitions & structure for MySQL
│       ├── initDb.js            <-- Database creation & table init runner
│       └── db.js                <-- Connection pool to MySQL (port 3306)
├── python_server\
│   ├── db.py                    <-- Python PyMySQL connection layer
│   └── seed.py                  <-- Demo records (students, staff, sections)
├── apps\web\
│   └── src\
│       ├── assets\              <-- UI assets, logos, and icons
│       └── lib\
│           └── api.ts           <-- Connects to http://localhost:5000/api
├── docs\                        <-- Architecture & deployment guides
└── .emulator-data\              <-- Local Firebase emulator storage (when used)
```

### Physical Storage Locations on Windows:

| Storage Type | Physical Folder Path on Disk | What is Stored |
|---|---|---|
| **Primary MySQL DB (XAMPP)** | `C:\xampp\mysql\data\classbeacon_db\` | Tables (`.ibd` and `.frm` files) storing users, sections, enrollments, assignments, sessions, events, snapshots, progress, and reports. |
| **Standard MySQL (if installed independently)** | `C:\ProgramData\MySQL\MySQL Server 8.x\Data\classbeacon_db\` | Same MySQL database tables if not using XAMPP. |
| **Database Schema & Init Files** | `c:\ClassBeacon\server\db\schema.sql` | The SQL commands that define the 13 relational tables and keys. |
| **Seeded Initial Data** | `c:\ClassBeacon\server\seed.js` | Initial test users (Admin, Staff, Students) and sample assignments. |
| **Client Browser LocalStorage** | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Local Storage\leveldb\` | JWT auth token (`cb_token`) and cached user profile in the student/staff browser. |
| **AI Evidence Snapshots** | Inside MySQL `monitoring_snapshots` table (stored as Base64 strings) | Photographic evidence frames captured by the webcam when violations occur. |

---

## 3. Database Schema Overview (13 Relational Tables)

1. **`users`**: Administrative, faculty, and student profiles (roll number, email, bcrypt password hash, department, year of joining, Beacon UUID).
2. **`sections`**: Academic class groupings (e.g., *CSE-A*, *ECE-B*).
3. **`section_staff`**: Junction table mapping instructors to sections.
4. **`enrollments`**: Junction table mapping student enrollments to sections.
5. **`videos`**: Master lecture video library records (source URL, duration).
6. **`assignments`**: Section-scoped lecture assignments with anti-cheat enforcement policies.
7. **`sessions`**: Live playback session instances with status (`active`, `completed`, `interrupted`).
8. **`events`**: Timestamped telemetry records (`play`, `pause`, `seek_attempt`, `tab_hidden`, `offline`).
9. **`monitoring_snapshots`**: Visual evidence photos taken by the AI proctor when rules are broken.
10. **`progress`**: 5-second chunk coverage maps (JSON) and unique watched time.
11. **`reports`**: Student-submitted technical issue tickets.
12. **`reviews`**: Faculty resolution notes and case status for flagged sessions.
13. **`section_links`**: Shared study links and virtual meeting URLs posted by instructors.

---

## 4. Key Role Functionality

### 1. Administrator Portal (`/admin`)
- **User Provisioning**: Create and edit staff and student accounts with full college metadata and Beacon tracking IDs.
- **Section Management**: Create sections, assign teachers, and view rosters.
- **Auto-Division**: Automatically distribute registered students evenly across available sections.

### 2. Faculty / Staff Portal (`/staff` & `/staff/reports`)
- **Video & Assignment Authoring**: Add videos and publish assignments with sequential enforcement, pause-on-hidden, and watch threshold policies.
- **Real-Time Proctor Monitoring**: View enrolled students' live progress, current watch percentage, and attention flags.
- **Snapshot Evidence Review**: Examine webcam snapshots captured when an attention anomaly occurs.
- **Session Timelines**: Inspect exact play/pause/hidden/seek events.
- **Reporting & CSV Export**: Export audit logs safely escaped against formula injection attacks.

### 3. Student Portal (`/student` & `/student/lesson/:id`)
- **Lesson Player**: Custom HTML5 video player that prevents forward scrubbing and pauses automatically if the student switches tabs.
- **AI Webcam HUD**: Real-time bounding box feedback detecting face absence, looking away, or phone use.
- **Technical Issue Reporting**: In-player button to submit immediate context for any interruption.
- **Privacy Notice & Consent**: Transparent disclosure of recorded telemetry before any proctoring session begins.

---

## 5. Startup Commands

To start the entire stack (Database check + Express API + React Frontend):
```bash
npm start
```
- **Web App**: http://localhost:5173
- **Backend API**: http://localhost:5000/api
