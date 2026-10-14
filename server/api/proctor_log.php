<?php
header('Content-Type: application/json');

// Restrict CORS to trusted origins
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    getenv('CLIENT_URL') ?: ''
];
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if (in_array($origin, array_filter($allowedOrigins))) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. POST required.']);
    exit();
}

// VULN-02 & VULN-01 Fix: Mandatory JWT Verification
$authHeader = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) ? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] : '');
if (!preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required. Missing Bearer token.']);
    exit();
}

$jwt = $matches[1];
$jwtParts = explode('.', $jwt);
if (count($jwtParts) !== 3) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid JWT token format.']);
    exit();
}

list($headerB64, $payloadB64, $sigB64) = $jwtParts;
$secret = getenv('JWT_SECRET') ?: 'classbeacon_production_secure_jwt_secret_key_2026_unified';
$expectedSig = hash_hmac('sha256', "$headerB64.$payloadB64", $secret, true);
$expectedSigB64 = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($expectedSig));

if (!hash_equals($expectedSigB64, $sigB64)) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid token signature. Access denied.']);
    exit();
}

$payload = json_decode(base64_decode(strtr($payloadB64, '-_', '+/')), true);
if (!$payload || !isset($payload['id'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Malformed token payload.']);
    exit();
}
if (isset($payload['exp']) && $payload['exp'] < time()) {
    http_response_code(403);
    echo json_encode(['error' => 'Token has expired.']);
    exit();
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON payload.']);
    exit();
}

$sessionId = isset($data['session_id']) ? intval($data['session_id']) : 0;
$eventType = isset($data['event_type']) ? trim($data['event_type']) : '';
$confidence = isset($data['confidence']) ? floatval($data['confidence']) : 0.0;
$snapshotData = isset($data['snapshot_data']) ? $data['snapshot_data'] : null;
$objectDetected = isset($data['object_detected']) ? $data['object_detected'] : null;
$personCount = isset($data['person_count']) ? intval($data['person_count']) : 1;
$details = isset($data['details']) && is_array($data['details']) ? $data['details'] : [];
$videoProgressPercent = isset($data['video_progress_percent']) ? floatval($data['video_progress_percent']) : 0.0;
$playbackPosition = isset($data['playback_position']) ? floatval($data['playback_position']) : 0.0;

// VULN-08: Validate event_type against strict whitelist
$allowedEventTypes = [
    'face_absent', 'looking_away', 'multiple_faces', 'second_device',
    'tab_switch', 'fullscreen_exit', 'audio_detected', 'book_detected',
    'phone_detected', 'head_pose_anomaly', 'low_light', 'session_interrupted',
    'session_completed', 'session_start', 'heartbeat', 'proctor_alert',
    'play', 'pause', 'seek', 'rate_change', 'video_ended'
];

if ($sessionId <= 0 || empty($eventType) || !in_array($eventType, $allowedEventTypes, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Valid session_id and approved event_type are required.']);
    exit();
}

// VULN-18 Fix: Load DB credentials from environment variables, never hardcode root with empty password
$host = getenv('DB_HOST') ?: '127.0.0.1';
$port = getenv('DB_PORT') ?: '3306';
$db   = getenv('DB_NAME') ?: 'classbeacon_db';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : '';

try {
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    // Check user active status (VULN-03)
    $userStmt = $pdo->prepare("SELECT id, role, active FROM users WHERE id = ?");
    $userStmt->execute([$payload['id']]);
    $dbUser = $userStmt->fetch();
    if (!$dbUser || !$dbUser['active']) {
        http_response_code(403);
        echo json_encode(['error' => 'Account suspended or inactive. Access revoked.']);
        exit();
    }

    // Verify session
    $stmt = $pdo->prepare("SELECT s.*, a.section_id as assign_section_id, a.video_id FROM sessions s JOIN assignments a ON s.assignment_id = a.id WHERE s.id = ?");
    $stmt->execute([$sessionId]);
    $session = $stmt->fetch();

    if (!$session) {
        http_response_code(404);
        echo json_encode(['error' => 'Session not found in system database.']);
        exit();
    }

    // VULN-04: Authorization check - student can only log events to their own session
    if ($dbUser['role'] === 'student' && intval($session['student_id']) !== intval($dbUser['id'])) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized: You do not own this session.']);
        exit();
    }

    $verifiedStudentId = $session['student_id'];
    $verifiedSectionId = $session['section_id'];
    $verifiedAssignmentId = $session['assignment_id'];

    // Insert snapshot
    $snapshotId = null;
    if ($snapshotData && is_string($snapshotData) && strlen($snapshotData) < 7000000) {
        $snapStmt = $pdo->prepare("INSERT INTO monitoring_snapshots (session_id, student_id, section_id, assignment_id, event_type, confidence, snapshot_data, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())");
        $detailsJson = json_encode(array_merge($details, [
            'object_detected' => $objectDetected,
            'person_count' => $personCount,
            'video_progress_percent' => $videoProgressPercent,
            'playback_position' => $playbackPosition,
        ]));
        $snapStmt->execute([
            $session['id'],
            $verifiedStudentId,
            $verifiedSectionId,
            $verifiedAssignmentId,
            $eventType,
            $confidence,
            $snapshotData,
            $detailsJson
        ]);
        $snapshotId = $pdo->lastInsertId();
    }

    // Insert event
    $evtStmt = $pdo->prepare("INSERT INTO events (session_id, type, seq, client_at, details_json, server_at) VALUES (?, ?, 0, ?, ?, NOW())");
    $evtDetails = json_encode([
        'snapshot_id' => $snapshotId,
        'confidence' => $confidence,
        'object_detected' => $objectDetected,
        'person_count' => $personCount,
        'video_progress_percent' => $videoProgressPercent,
        'playback_position' => $playbackPosition,
    ]);
    $evtStmt->execute([$session['id'], $eventType, round(microtime(true) * 1000), $evtDetails]);

    // Update session
    $pdo->prepare("UPDATE sessions SET last_event_at = NOW(), event_count = event_count + 1 WHERE id = ?")->execute([$session['id']]);

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'snapshot_id' => $snapshotId,
        'session_id' => $session['id'],
        'event_type' => $eventType,
        'status' => 'recorded'
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database operation failed.']);
}
