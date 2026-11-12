<?php
/**
 * Log event sederhana berbasis file (data/events.jsonl).
 *   GET  api/log.php?limit=30      -> daftar event terbaru (JSON)
 *   POST api/log.php  {type,msg}   -> simpan event
 *   POST api/log.php?clear=1       -> hapus log
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$file  = __DIR__ . '/../data/events.jsonl';
$MAX   = 500; // maksimal baris disimpan
$types = ['status', 'cmd', 'online', 'system', 'alarm'];

if (!is_dir(dirname($file))) { @mkdir(dirname($file), 0775, true); }

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    if (isset($_GET['clear'])) {
        @file_put_contents($file, '', LOCK_EX);
        echo json_encode(['ok' => true]);
        exit;
    }
    $in   = json_decode(file_get_contents('php://input'), true) ?: [];
    $type = in_array($in['type'] ?? '', $types, true) ? $in['type'] : 'system';
    $msg  = mb_substr(trim((string)($in['msg'] ?? '')), 0, 160);
    if ($msg === '') { http_response_code(400); echo json_encode(['ok' => false]); exit; }

    $row = json_encode(['t' => time(), 'type' => $type, 'msg' => $msg], JSON_UNESCAPED_UNICODE);
    @file_put_contents($file, $row . "\n", FILE_APPEND | LOCK_EX);

    // pangkas bila terlalu panjang
    $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    if (count($lines) > $MAX) {
        @file_put_contents($file, implode("\n", array_slice($lines, -$MAX)) . "\n", LOCK_EX);
    }
    echo json_encode(['ok' => true]);
    exit;
}

$limit = max(1, min(100, (int)($_GET['limit'] ?? 30)));
$lines = is_file($file) ? (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: []) : [];
$rows  = [];
foreach (array_slice($lines, -$limit) as $l) {
    $r = json_decode($l, true);
    if ($r) $rows[] = $r;
}
echo json_encode(['ok' => true, 'events' => $rows], JSON_UNESCAPED_UNICODE);
