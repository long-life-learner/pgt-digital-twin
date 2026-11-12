<?php
declare(strict_types=1);
$cfg = require __DIR__ . '/config.php';

// Hanya bagian yang aman untuk browser (tanpa password).
$clientCfg = [
    'app'      => $cfg['app_name'],
    'machine'  => $cfg['machine'],
    'mqtt'     => [
        'host'    => $cfg['mqtt']['host'],
        'wsPort'  => $cfg['mqtt']['ws_port'],
        'wssPort' => $cfg['mqtt']['wss_port'],
        'path'    => $cfg['mqtt']['path'],
        'user'    => $cfg['mqtt']['username'],
        'pass'    => $cfg['mqtt']['password'],
    ],
    'topics'   => $cfg['topics'],
    'twin'     => [
        'scale'      => $cfg['twin']['scale'],
        'invert'     => $cfg['twin']['invert'],
        'origin'     => $cfg['twin']['origin'] ?? ['x' => 'center', 'y' => 'center'],
        'startCenter'=> (bool)($cfg['twin']['start_center'] ?? true),
        'centerSpeed'=> (float)($cfg['twin']['center_speed'] ?? 140),
        'staleAfter' => $cfg['twin']['stale_after_s'],
    ],
    'spindle'  => [
        'rpmNominal'  => $cfg['spindle']['rpm_nominal'],
        'rpmMax'      => $cfg['spindle']['rpm_max'],
        'moveTimeout' => $cfg['spindle']['move_timeout_ms'],
    ],
];

$v = (string)@filemtime(__FILE__); // cache-buster sederhana
function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

?>
<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($cfg['app_name']) ?> — Monitoring &amp; Digital Twin</title>
    <link rel="preload" href="assets/fonts/press-start-2p-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="assets/css/style.css?v=<?= $v ?>">
    <script type="importmap">
    { "imports": {
        "three": "./assets/vendor/three/three.module.min.js",
        "three/addons/": "./assets/vendor/three/addons/"
    } }
    </script>
</head>
<body class="booting">

<?php include __DIR__ . '/includes/loader.php'; ?>

<div class="crt" aria-hidden="true"></div>

<main class="app" id="app">

    <!-- ============ HEADER ============ -->
    <header class="hud top">
        <div class="brand">
            <span class="logo-px" aria-hidden="true"></span>
            <div>
                <h1><?= e($cfg['app_name']) ?></h1>
                <small><?= e($cfg['machine']) ?></small>
            </div>
        </div>

        <div class="leds">
            <div class="led-wrap" title="Koneksi MQTT broker">
                <i class="led" id="ledMqtt"></i><span>MQTT <b id="txtMqtt">---</b></span>
            </div>
            <div class="led-wrap" title="Status mesin (topic online)">
                <i class="led" id="ledEsp"></i><span>ESP <b id="txtEsp">---</b></span>
            </div>
            <div class="sync" title="Waktu sejak data terakhir">
                <svg viewBox="0 0 20 20" class="sync-ico" id="syncIco" shape-rendering="crispEdges"><path d="M4 2h12v2h-2v3h-2v2h-1v2h1v2h2v3h2v2H4v-2h2v-3h2v-2h1V9H8V7H6V4H4z" fill="currentColor"/></svg>
                <span id="syncTxt">MENUNGGU DATA</span>
                <span class="bar"><i id="syncBar"></i></span>
            </div>
        </div>

        <div class="tools">
            <span class="clock" id="clock">--:--:--</span>
            <button class="pxbtn sm" id="btnDemo"  data-tip="Simulasi data">🎮 DEMO</button>
            <button class="pxbtn sm" id="btnSound" data-tip="Suara">🔇</button>
            <button class="pxbtn sm" id="btnInfo"  data-tip="Info &amp; topic">ℹ INFO</button>
        </div>
    </header>

    <!-- ============ KIRI: KARTU MONITOR ============ -->
    <aside class="col left">
        <article class="card tilt" data-k="spindle" id="cardSpindle" data-state="off">
            <div class="card-h"><span class="ico">🌀</span> SPINDLE RPM <small id="rpmSrc">---</small></div>
            <div class="big">
                <span id="vRpm">0</span><em>rpm</em>
                <span class="spin" id="spinIco" aria-hidden="true"><i></i><i></i></span>
            </div>
            <div class="meter"><i id="mRpm"></i></div>
            <div class="foot" id="rpmFoot">Spindle OFF — menunggu RUN</div>
            <i class="glare"></i>
        </article>

        <article class="card tilt" data-k="status" id="cardStatus" data-state="idle">
            <div class="card-h"><span class="ico">⚡</span> STATUS</div>
            <div class="big status"><span id="vStatus">---</span></div>
            <div class="sprite" id="stateSprite" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
            <div class="foot" id="statusFoot">Belum ada data</div>
            <i class="glare"></i>
        </article>

        <article class="card tilt" data-k="uptime">
            <div class="card-h"><span class="ico">⏱</span> SESI</div>
            <div class="mini-grid">
                <div><small>PESAN</small><b id="vMsgs">0</b></div>
                <div><small>RATA/DTK</small><b id="vRate">0.0</b></div>
                <div><small>RPM MAX</small><b id="vPeak">0</b></div>
                <div><small>SPINDLE ON</small><b id="vRun">00:00</b></div>
            </div>
            <i class="glare"></i>
        </article>
    </aside>

    <!-- ============ TENGAH: DIGITAL TWIN ============ -->
    <section class="stage" id="stage">
        <div class="stage-frame">
            <canvas id="twin" aria-label="Digital twin mesin CNC PCB"></canvas>

            <div class="stage-tag"><i class="blink-dot"></i> DIGITAL TWIN</div>
            <div class="cam-btns">
                <button class="pxbtn xs" data-cam="iso"   data-tip="Pandangan isometrik">ISO</button>
                <button class="pxbtn xs" data-cam="front" data-tip="Depan">FRONT</button>
                <button class="pxbtn xs" data-cam="top"   data-tip="Atas">TOP</button>
                <button class="pxbtn xs" id="btnAuto" data-tip="Putar otomatis">⟳</button>
                <button class="pxbtn xs" id="btnCenter" data-tip="Pahat ke tengah PCB">⌖</button>
                <button class="pxbtn xs" id="btnClearPcb" data-tip="Bersihkan jalur PCB">🧹</button>
                <button class="pxbtn xs" id="btnFull" data-tip="Layar penuh">⛶</button>
            </div>

            <div class="twin-hud" id="twinHud">
                <span>X <b id="hX">---</b></span>
                <span>Y <b id="hY">---</b></span>
                <span>Z <b id="hZ">---</b></span>
                <span>SPINDLE <b id="hR">OFF</b></span>
            </div>

            <div class="banner" id="banner" hidden></div>
            <div class="waiting" id="waiting"><div class="hourglass"><i></i><i></i><i></i><i></i><i></i></div><p>MENUNGGU DATA MESIN<span class="dots"></span></p></div>
        </div>

        <div class="chart-card">
            <div class="card-h"><span class="ico">📈</span> RIWAYAT SPINDLE RPM <small id="chartInfo">— rpm</small></div>
            <canvas id="chart" height="90"></canvas>
        </div>
    </section>

    <!-- ============ KANAN: KONTROL + LOG ============ -->
    <aside class="col right">
        <article class="card" id="cardPos">
            <div class="card-h"><span class="ico">📍</span> POSISI <small>mm</small></div>
            <table class="pos">
                <thead><tr><th></th><th>X</th><th>Y</th><th>Z</th></tr></thead>
                <tbody>
                    <tr><th data-tip="Posisi aktual mesin">MPos</th><td id="mX">---</td><td id="mY">---</td><td id="mZ">---</td></tr>
                    <tr><th data-tip="Relatif terhadap titik nol kerja">WPos</th><td id="wX">---</td><td id="wY">---</td><td id="wZ">---</td></tr>
                </tbody>
            </table>
            <div class="foot" id="posFoot">Belum ada MPos / WPos</div>
        </article>

        <article class="card log-card">
            <div class="card-h"><span class="ico">🗒</span> EVENT LOG
                <button class="pxbtn xs" id="btnClearLog" data-tip="Hapus log">✕</button>
            </div>
            <ul class="log" id="log"></ul>
        </article>
    </aside>

    <!-- ============ BAWAH (mobile) ============ -->
    <footer class="hud bottom">
        <span>© CNC-PCB PIXEL LAB</span>
        <span id="footMsg">Seret untuk memutar kamera · scroll untuk zoom</span>
    </footer>
</main>

<?php include __DIR__ . '/includes/info-modal.php'; ?>

<div class="toasts" id="toasts" aria-live="polite"></div>

<script>window.CNC_CONFIG = <?= json_encode($clientCfg, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<script src="assets/vendor/mqtt.min.js?v=1"></script>
<script type="module" src="assets/js/app.js?v=<?= $v ?>"></script>
<noscript><p style="color:#fff;padding:2rem">Situs ini memerlukan JavaScript.</p></noscript>
</body>
</html>
