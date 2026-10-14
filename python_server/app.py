import os
import json
import datetime
import jwt
from functools import wraps
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

from db import execute_query, execute_insert, execute_update

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

JWT_SECRET = os.environ.get('JWT_SECRET', 'classbeacon_production_secure_jwt_secret_key_2026_unified')

if not os.environ.get('JWT_SECRET'):
    print('[SECURITY WARNING] JWT_SECRET is not set in environment variables! Using default fallback secret.')

# Rate limiting storage for logins: IP -> list of timestamps
_login_rate_limits = {}
MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 900  # 15 minutes

def is_login_rate_limited(ip_address):
    now = datetime.datetime.now().timestamp()
    attempts = _login_rate_limits.get(ip_address, [])
    attempts = [t for t in attempts if now - t < LOGIN_WINDOW_SECONDS]
    _login_rate_limits[ip_address] = attempts
    return len(attempts) >= MAX_LOGIN_ATTEMPTS

def record_failed_login(ip_address):
    now = datetime.datetime.now().timestamp()
    attempts = _login_rate_limits.get(ip_address, [])
    attempts.append(now)
    _login_rate_limits[ip_address] = attempts

def clear_login_attempts(ip_address):
    _login_rate_limits.pop(ip_address, None)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == 'bearer':
                token = parts[1]
        
        if not token:
            return jsonify({'error': 'Token is missing!'}), 401
        
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            # VULN-03 Revocation Check: Verify user is still active in database
            user_rows = execute_query(
                "SELECT id, user_id, email, role, full_name, active FROM users WHERE id = %s",
                (payload.get('id'),)
            )
            if not user_rows:
                return jsonify({'error': 'User account no longer exists.'}), 401
            
            db_user = user_rows[0]
            if not db_user.get('active'):
                return jsonify({'error': 'Account has been suspended or deactivated. Access revoked immediately.'}), 403

            current_user = {
                **payload,
                'role': db_user['role'],
                'active': db_user['active']
            }
        except Exception:
            return jsonify({'error': 'Token is invalid or expired!'}), 403
            
        return f(current_user, *args, **kwargs)
    return decorated

def role_required(roles):
    def decorator(f):
        @wraps(f)
        def decorated(current_user, *args, **kwargs):
            if current_user.get('role') not in roles:
                return jsonify({'error': 'Access denied for your role'}), 403
            return f(current_user, *args, **kwargs)
        return decorated
    return decorator

# -----------------------------------------------------------------------------
# PAGE ROUTES (Vanilla HTML / CSS / JS Frontend)
# -----------------------------------------------------------------------------
@app.route('/')
@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/admin')
def admin_page():
    return render_template('admin.html')

@app.route('/staff')
def staff_page():
    return render_template('staff.html')

@app.route('/student')
def student_page():
    return render_template('student.html')

@app.route('/lesson/<int:assignment_id>')
def lesson_page(assignment_id):
    return render_template('lesson.html', assignment_id=assignment_id)

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'backend': 'Python Flask', 'time': datetime.datetime.now(datetime.timezone.utc).isoformat()})

# -----------------------------------------------------------------------------
# AUTHENTICATION API ENDPOINTS
# -----------------------------------------------------------------------------
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    ip = request.remote_addr or 'unknown'
    if is_login_rate_limited(ip):
        return jsonify({'error': 'Too many failed login attempts. Please try again in 15 minutes.'}), 429

    data = request.get_json() or {}
    login_id = data.get('login') or data.get('userIdOrEmail') or data.get('email')
    password = data.get('password')

    if not login_id or not password:
        return jsonify({'error': 'User ID / Email and password are required.'}), 400

    users = execute_query("SELECT * FROM users WHERE (email = %s OR user_id = %s) AND active = 1", (login_id, login_id))
    if not users or not check_password_hash(users[0]['password_hash'], password):
        record_failed_login(ip)
        return jsonify({'error': 'Invalid User ID/Email or password.'}), 401

    clear_login_attempts(ip)
    user = users[0]

    token_payload = {
        'id': user['id'],
        'user_id': user['user_id'],
        'email': user['email'],
        'role': user['role'],
        'full_name': user['full_name'],
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=12)
    }

    token = jwt.encode(token_payload, JWT_SECRET, algorithm='HS256')

    user_data = {
        'id': user['id'],
        'user_id': user['user_id'],
        'email': user['email'],
        'full_name': user['full_name'],
        'role': user['role'],
        'phone': user['phone'],
        'department': user['department'],
        'year_of_join': user['year_of_join'],
        'date_of_birth': str(user['date_of_birth']) if user['date_of_birth'] else None,
        'address': user['address'],
        'beacon_uuid': user['beacon_uuid']
    }

    return jsonify({'token': token, 'user': user_data})

@app.route('/api/auth/me', methods=['GET'])
@token_required
def api_me(current_user):
    users = execute_query(
        "SELECT id, user_id, email, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active FROM users WHERE id = %s",
        (current_user['id'],)
    )
    if not users:
        return jsonify({'error': 'User profile not found.'}), 404
    
    user = users[0]
    if user['date_of_birth']:
        user['date_of_birth'] = str(user['date_of_birth'])

    return jsonify({'user': user})

@app.route('/api/auth/change-password', methods=['POST'])
@token_required
def api_change_password(current_user):
    data = request.get_json() or {}
    prev_pass = data.get('previousPassword') or data.get('currentPassword')
    new_pass = data.get('newPassword')

    if not prev_pass or not new_pass:
        return jsonify({'error': 'Previous password and new password are required.'}), 400

    if len(new_pass) < 6:
        return jsonify({'error': 'New password must be at least 6 characters long.'}), 400

    users = execute_query("SELECT password_hash FROM users WHERE id = %s", (current_user['id'],))
    if not users:
        return jsonify({'error': 'User not found.'}), 404

    current_hash = users[0]['password_hash']
    if not check_password_hash(current_hash, prev_pass):
        return jsonify({'error': 'Previous password does not match.'}), 400

    new_hash = generate_password_hash(new_pass)
    execute_update("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, current_user['id']))

    return jsonify({'message': 'Password updated successfully.'})

# -----------------------------------------------------------------------------
# ADMIN API ENDPOINTS (Manage Accounts & College Admission Profiles)
# -----------------------------------------------------------------------------
@app.route('/api/admin/users', methods=['GET'])
@token_required
@role_required(['admin'])
def api_admin_get_users(current_user):
    role = request.args.get('role')
    department = request.args.get('department')

    sql = "SELECT id, user_id, email, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active, created_at FROM users WHERE 1=1"
    args = []

    if role:
        sql += " AND role = %s"
        args.append(role)
    if department:
        sql += " AND department = %s"
        args.append(department)

    sql += " ORDER BY role ASC, id DESC"
    users = execute_query(sql, tuple(args))

    for u in users:
        if u.get('date_of_birth'):
            u['date_of_birth'] = str(u['date_of_birth'])
        if u.get('created_at'):
            u['created_at'] = str(u['created_at'])

    return jsonify({'users': users})

@app.route('/api/admin/users', methods=['POST'])
@token_required
@role_required(['admin'])
def api_admin_create_user(current_user):
    data = request.get_json() or {}
    user_id = data.get('user_id') or data.get('userId')
    email = data.get('email')
    password = data.get('password')
    full_name = data.get('full_name') or data.get('fullName')
    role = data.get('role')
    phone = data.get('phone')
    department = data.get('department')
    year_of_join = data.get('year_of_join') or data.get('yearOfJoin')
    date_of_birth = data.get('date_of_birth') or data.get('dateOfBirth')
    address = data.get('address')
    beacon_uuid = data.get('beacon_uuid') or data.get('beaconUuid')

    if not user_id or not email or not password or not full_name or not role:
        return jsonify({'error': 'User ID, Email, Password, Full Name, and Role are required.'}), 400

    existing = execute_query("SELECT id FROM users WHERE user_id = %s OR email = %s", (user_id, email))
    if existing:
        return jsonify({'error': 'User ID or Email already exists.'}), 400

    password_hash = generate_password_hash(password)

    new_id = execute_insert("""
        INSERT INTO users (user_id, email, password_hash, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
    """, (
        user_id, email, password_hash, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid
    ))

    return jsonify({'message': 'Account created successfully.', 'id': new_id}), 201

# -----------------------------------------------------------------------------
# STAFF & ACADEMIC ENDPOINTS
# -----------------------------------------------------------------------------
@app.route('/api/sections', methods=['GET'])
@token_required
def api_get_sections(current_user):
    if current_user['role'] == 'staff':
        sections = execute_query("""
            SELECT s.* FROM sections s
            JOIN users u ON s.owner_id = u.id
            WHERE s.owner_id = %s OR s.id IN (SELECT section_id FROM section_staff WHERE staff_id = %s)
        """, (current_user['id'], current_user['id']))
    else:
        sections = execute_query("SELECT * FROM sections")
    return jsonify(sections)

@app.route('/api/sections', methods=['POST'])
@token_required
@role_required(['staff', 'admin'])
def api_create_section(current_user):
    data = request.get_json() or {}
    name = data.get('name')
    section_code = data.get('sectionCode') or f"SEC-{datetime.datetime.now().microsecond}"

    if not name:
        return jsonify({'error': 'Section name is required'}), 400

    sec_id = execute_insert(
        "INSERT INTO sections (section_code, name, owner_id) VALUES (%s, %s, %s)",
        (section_code, name, current_user['id'])
    )
    return jsonify({'id': sec_id, 'name': name, 'section_code': section_code}), 201

@app.route('/api/sections/<int:section_id>/enroll', methods=['POST'])
@token_required
@role_required(['staff', 'admin'])
def api_enroll_student(current_user, section_id):
    data = request.get_json() or {}
    student_id_str = data.get('studentId')

    student = execute_query("SELECT id FROM users WHERE user_id = %s AND role = 'student'", (student_id_str,))
    if not student:
        return jsonify({'error': 'Student not found with that Roll Number.'}), 404

    execute_insert("INSERT INTO enrollments (section_id, student_id) VALUES (%s, %s) ON DUPLICATE KEY UPDATE student_id=student_id",
                   (section_id, student[0]['id']))
    return jsonify({'message': 'Student enrolled successfully'})

@app.route('/api/sections/<int:section_id>/students', methods=['GET'])
@token_required
@role_required(['staff', 'admin'])
def api_get_section_students(current_user, section_id):
    if current_user['role'] == 'staff':
        # Verify staff is assigned to or owns this section
        assigned = execute_query(
            "SELECT id FROM sections WHERE id = %s AND (owner_id = %s OR id IN (SELECT section_id FROM section_staff WHERE staff_id = %s))",
            (section_id, current_user['id'], current_user['id'])
        )
        if not assigned:
            return jsonify({'error': 'Unauthorized: You are not assigned to this section.'}), 403

    students = execute_query("""
        SELECT u.id, u.user_id, u.full_name, u.email, u.department, u.year_of_join
        FROM enrollments e
        JOIN users u ON e.student_id = u.id
        WHERE e.section_id = %s
        ORDER BY u.user_id ASC
    """, (section_id,))
    return jsonify(students)

@app.route('/api/videos', methods=['GET'])
@token_required
def api_get_videos(current_user):
    videos = execute_query("SELECT * FROM videos ORDER BY id DESC")
    return jsonify(videos)

@app.route('/api/videos', methods=['POST'])
@token_required
@role_required(['staff', 'admin'])
def api_create_video(current_user):
    data = request.get_json() or {}
    title = data.get('title')
    source_url = data.get('sourceUrl')
    duration_sec = data.get('durationSec', 300)

    if not title or not source_url:
        return jsonify({'error': 'Title and sourceUrl are required'}), 400

    vid_id = execute_insert(
        "INSERT INTO videos (title, source_url, duration_sec, owner_id) VALUES (%s, %s, %s, %s)",
        (title, source_url, duration_sec, current_user['id'])
    )
    return jsonify({'id': vid_id, 'title': title}), 201

@app.route('/api/assignments', methods=['POST'])
@token_required
@role_required(['staff', 'admin'])
def api_create_assignment(current_user):
    data = request.get_json() or {}
    section_id = data.get('sectionId')
    video_id = data.get('videoId')
    title = data.get('title')
    source_url = data.get('sourceUrl')
    duration_sec = data.get('durationSec', 300)
    threshold = data.get('completionThreshold', 0.8)

    assign_id = execute_insert("""
        INSERT INTO assignments (section_id, video_id, title, source_url, duration_sec, completion_threshold, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (section_id, video_id, title, source_url, duration_sec, threshold, current_user['id']))

    return jsonify({'id': assign_id, 'title': title}), 201

@app.route('/api/assignments/section/<int:section_id>', methods=['GET'])
@token_required
def api_get_assignments_by_section(current_user, section_id):
    assignments = execute_query("SELECT * FROM assignments WHERE section_id = %s ORDER BY id DESC", (section_id,))
    return jsonify(assignments)

@app.route('/api/assignments/student', methods=['GET'])
@token_required
def api_get_student_assignments(current_user):
    assignments = execute_query("""
        SELECT a.*, s.name as section_name FROM assignments a
        JOIN enrollments e ON a.section_id = e.section_id
        JOIN sections s ON a.section_id = s.id
        WHERE e.student_id = %s
        ORDER BY a.id DESC
    """, (current_user['id'],))
    return jsonify(assignments)

@app.route('/api/assignments/<int:assignment_id>', methods=['GET'])
@token_required
def api_get_assignment_detail(current_user, assignment_id):
    assignments = execute_query("SELECT * FROM assignments WHERE id = %s", (assignment_id,))
    if not assignments:
        return jsonify({'error': 'Assignment not found'}), 404
    return jsonify(assignments[0])

# -----------------------------------------------------------------------------
# PROGRESS HEARTBEAT & MONITORING AGENT ENDPOINTS
# -----------------------------------------------------------------------------
@app.route('/api/progress/beat', methods=['POST'])
@token_required
def api_progress_beat(current_user):
    data = request.get_json() or {}
    assignment_id = data.get('assignmentId')
    section_id = data.get('sectionId')
    chunk_index = str(data.get('chunkIndex', 0))
    duration_sec = data.get('durationSec', 300)
    tab_active = data.get('tabActive', True)

    existing = execute_query(
        "SELECT * FROM progress WHERE student_id = %s AND assignment_id = %s",
        (current_user['id'], assignment_id)
    )

    if existing:
        prog = existing[0]
        chunks = json.loads(prog['chunks_json'] or '{}')
        if tab_active:
            chunks[chunk_index] = True
        
        played_chunks = len(chunks)
        played_sec = played_chunks * prog['chunk_sec']
        required_sec = prog['threshold'] * prog['duration_sec']
        
        completed_at = prog['completed_at']
        if not completed_at and played_sec >= required_sec:
            completed_at = datetime.datetime.now()

        execute_update("""
            UPDATE progress 
            SET chunks_json = %s, last_beat_at = NOW(), completed_at = %s
            WHERE id = %s
        """, (json.dumps(chunks), completed_at, prog['id']))
    else:
        chunks = {chunk_index: True} if tab_active else {}
        total_chunks = max(1, int(duration_sec / 5))
        execute_insert("""
            INSERT INTO progress (assignment_id, student_id, section_id, duration_sec, chunk_sec, total_chunks, max_rate, threshold, chunks_json, last_beat_at)
            VALUES (%s, %s, %s, %s, 5, %s, 1.5, 0.8, %s, NOW())
        """, (assignment_id, current_user['id'], section_id, duration_sec, total_chunks, json.dumps(chunks)))

    return jsonify({'success': True})

@app.route('/api/staff/monitoring/<int:section_id>', methods=['GET'])
@token_required
@role_required(['staff', 'admin'])
def api_staff_monitoring(current_user, section_id):
    if current_user['role'] == 'staff':
        # Verify staff assignment to section
        assigned = execute_query(
            "SELECT id FROM sections WHERE id = %s AND (owner_id = %s OR id IN (SELECT section_id FROM section_staff WHERE staff_id = %s))",
            (section_id, current_user['id'], current_user['id'])
        )
        if not assigned:
            return jsonify({'error': 'Unauthorized: You are not assigned to this section.'}), 403

    # Fetch all students in section (excluding sensitive PII like DOB, phone, address)
    students = execute_query("""
        SELECT u.id, u.user_id, u.full_name, u.email, u.department, u.year_of_join
        FROM enrollments e
        JOIN users u ON e.student_id = u.id
        WHERE e.section_id = %s
        ORDER BY u.user_id ASC
    """, (section_id,))

    assignments = execute_query("SELECT id, title, duration_sec, completion_threshold FROM assignments WHERE section_id = %s", (section_id,))

    monitoring_data = []

    for s in students:
        student_reports = []
        for a in assignments:
            prog_rows = execute_query("SELECT * FROM progress WHERE student_id = %s AND assignment_id = %s", (s['id'], a['id']))
            if prog_rows:
                p = prog_rows[0]
                chunks = json.loads(p['chunks_json'] or '{}')
                watched_sec = len(chunks) * p['chunk_sec']
                total_sec = p['duration_sec'] or a['duration_sec']
                watched_percent = round((watched_sec / max(1, total_sec)) * 100, 1)
                completed = p['completed_at'] is not None
                last_beat = str(p['last_beat_at']) if p['last_beat_at'] else 'N/A'

                status_badge = "🟢 Highly Attentive" if watched_percent > 80 else ("🟡 Partial Watching" if watched_percent > 20 else "🔴 Low Attention")
            else:
                watched_sec = 0
                total_sec = a['duration_sec']
                watched_percent = 0.0
                completed = False
                last_beat = "Not Started"
                status_badge = "🔴 Unwatched"

            student_reports.append({
                'assignment_id': a['id'],
                'assignment_title': a['title'],
                'watched_sec': watched_sec,
                'total_sec': total_sec,
                'watched_percent': min(100.0, watched_percent),
                'completed': completed,
                'status_badge': status_badge,
                'last_beat': last_beat
            })

        s['assignments_report'] = student_reports
        monitoring_data.append(s)

    return jsonify(monitoring_data)

if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1')
    port = int(os.environ.get('PORT', 5000))
    print(f"ClassBeacon Python Server starting on http://localhost:{port} (debug={debug_mode})")
    app.run(host='0.0.0.0', port=port, debug=debug_mode)

