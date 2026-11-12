<?php
declare(strict_types=1);
$v = (string)@filemtime(__FILE__);
?>
<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>Pixel Life — Dunia Pixel &amp; CNC Lab</title>
    <link rel="preload" href="assets/fonts/press-start-2p-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="assets/css/style.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/game.css?v=<?= $v ?>">
    <script type="importmap">
    { "imports": { "three": "./assets/vendor/three/three.module.min.js", "three/addons/": "./assets/vendor/three/addons/" } }
    </script>
</head>
<body class="booting game">

<!-- ============ LOADING ============ -->
<div class="boot" id="boot" role="status">
    <div class="boot-inner">
        <div class="boot-stage" aria-hidden="true">
            <div class="boot-gantry"><i class="bit"></i></div>
            <div class="boot-pcb"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
            <div class="boot-chips"><i></i><i></i><i></i><i></i><i></i></div>
        </div>
        <h2 class="boot-title">PIXEL LIFE</h2>
        <p class="boot-sub">DESA PIXEL · RUMAH · CNC LAB</p>
        <div class="boot-bar"><span id="bootBar"></span></div>
        <div class="boot-pct" id="bootPct">0%</div>
        <ul class="boot-steps" id="bootSteps">
            <li data-s="assets"><i></i> Memuat font &amp; aset</li>
            <li data-s="world"><i></i> Membangun dunia luas</li>
            <li data-s="actors"><i></i> Memanggil warga, kucing &amp; kendaraan</li>
            <li data-s="save"><i></i> Memuat progres</li>
        </ul>
        <button class="pxbtn start" id="btnStart" hidden>▶ PRESS START</button>
        <p class="boot-tip" id="bootTip"></p>
    </div>
</div>

<canvas id="gc"></canvas>

<!-- ============ HUD ============ -->
<div class="g-hud">
    <div class="hud-tl" id="bars">
        <div class="bar" data-k="hunger"><span>🍛 LAPAR</span><div><i></i></div></div>
        <div class="bar" data-k="thirst"><span>💧 HAUS</span><div><i></i></div></div>
        <div class="bar" data-k="energy"><span>⚡ ENERGI</span><div><i></i></div></div>
        <div class="bar" data-k="clean"><span>🚿 BERSIH</span><div><i></i></div></div>
        <div class="bar" data-k="happy"><span>😊 SENANG</span><div><i></i></div></div>
        <div class="coins">🪙 <b id="coins">0</b></div>
    </div>

    <div class="hud-tr">
        <div class="clockbox"><span id="sunIco">☀</span> <b id="clock">09:00</b> <small id="dayTxt">HARI 1</small></div>
        <div class="map-row">
            <div class="mini-wrap" id="btnOpenMap" data-tip="Klik untuk buka Peta (M)">
                <canvas id="mini" width="150" height="150"></canvas>
                <span class="mini-tag">🗺 PETA (M)</span>
            </div>
            <button class="gadget-dock-btn" id="btnGadget" data-tip="Tablet Gadget: CNC &amp; Robot Arm (T)">
                <span class="g-icon">📱</span>
                <span class="g-lbl">GADGET<br>TABLET</span>
                <span class="g-badge">CNC·ARM</span>
            </button>
        </div>
        <div class="tbtns">
            <button class="pxbtn xs" id="btnOpenMap2" data-tip="Buka Peta Besar (M)">🗺 PETA</button>
            <button class="pxbtn xs highlight" id="btnOpenTablet2" data-tip="Buka Tablet Gadget (T)">📱 GADGET</button>
            <a class="pxbtn xs" href="index.php" target="_blank" data-tip="Buka dashboard CNC di tab baru">🖥</a>
            <button class="pxbtn xs" id="btnHelp" data-tip="Bantuan (H)">?</button>
            <button class="pxbtn xs" id="btnCam" data-tip="Ganti kamera (V / 1-5)">🎥</button>
            <button class="pxbtn xs" id="btnSnd" data-tip="Suara">🔊</button>
            <button class="pxbtn xs" id="btnPx" data-tip="Ukuran pixel">PX 3</button>
        </div>
    </div>

    <div class="hud-bl"><div id="inv"></div></div>
    <div class="hud-br" id="speedo" hidden>0 km/j</div>
    <div class="prompt" id="prompt" hidden></div>
    <div class="progress" id="progress" hidden><span id="progLabel"></span><div><i id="progFill"></i></div></div>
</div>

<!-- ============ DIALOG ============ -->
<div class="dialog" id="dialog" hidden>
    <div class="d-who" id="dWho"></div>
    <div class="d-txt" id="dTxt"></div>
    <div class="d-ch" id="dChoices"></div>
</div>

<!-- ============ HP ============ -->
<div class="ov" id="phone" hidden>
    <div class="ov-back" data-ovclose></div>
    <div class="phone">
        <div class="ph-top"><span id="phClock">09:00</span><b id="phTitle">Beranda</b><button class="pxbtn xs" data-ovclose>✕</button></div>
        <div class="ph-body" id="phBody"></div>
        <div class="ph-nav"><button class="pxbtn xs" id="phHome">◉ BERANDA</button></div>
    </div>
</div>

<!-- ============ TABLET ============ -->
<div class="ov" id="tablet" hidden>
    <div class="ov-back" data-ovclose></div>
    <div class="tablet">
        <div class="tb-top"><b>📱 TABLET</b><div class="tabs2">
            <button data-tab2="map">PETA</button><button data-tab2="quest">MISI</button><button data-tab2="status">STATUS</button><button data-tab2="cnc">CNC</button>
        </div><button class="pxbtn xs" data-ovclose>✕</button></div>
        <div class="tb-body" id="tabBody"></div>
    </div>
</div>

<!-- ============ PETA BESAR ============ -->
<div class="ov" id="mapModal" hidden>
    <div class="ov-back" data-ovclose></div>
    <div class="map-modal">
        <div class="tb-top">
            <b>🗺 PETA DUNIA PIXEL</b>
            <button class="pxbtn xs" data-ovclose>✕ TUTUP (Esc)</button>
        </div>
        <div class="map-modal-body">
            <canvas id="bigMap" width="520" height="520"></canvas>
            <div class="map-legend">
                <span><b style="background:#ffd84a"></b> Kamu (Player)</span>
                <span><b style="background:#4ee1ff"></b> Warga (NPC)</span>
                <span><b style="background:#ff9a3c"></b> Kucing</span>
                <span><b style="background:#ff4d6d"></b> Kendaraan</span>
                <span><b style="background:#e8d9a8"></b> Ternak</span>
            </div>
            <p class="hint">Rumah &amp; CNC Lab (Tengah) · Toko &amp; Kafe (Timur) · Ladang (Utara) · Danau &amp; Kemah (Selatan)</p>
        </div>
    </div>
</div>

<!-- ============ GADGET TABLET → CNC & ROBOT ARM ============ -->
<div class="ov tablet-ov" id="tabletGadget" hidden>
    <div class="tablet-device">
        <div class="tab-bar">
            <div class="tab-bar-title">
                <span>📱 TABLET GADGET</span>
                <small>CNC PCB &amp; ROBOT ARM LAB</small>
            </div>
            <div class="tab-bar-btns">
                <button class="pxbtn xs" id="tabOpacity" data-tip="Alihkan transparansi layar tablet">👁 TRANSPARAN</button>
                <button class="pxbtn xs" id="tabReload" data-tip="Muat ulang dashboard">⟳ REFRESH</button>
                <button class="pxbtn xs" data-ovclose>✕ TUTUP TABLET (Esc)</button>
            </div>
        </div>
        <div class="tab-screen">
            <div class="tab-load" id="tabLoad"><div class="hourglass"><i></i><i></i><i></i><i></i><i></i></div><p>MEMBUKA GADGET TABLET…</p></div>
            <iframe id="tabFrame" title="Tablet Gadget CNC &amp; Robot Arm" allow="fullscreen"></iframe>
        </div>
        <div class="tab-notch"><i class="notch-cam"></i><i class="notch-mic"></i></div>
    </div>
</div>

<!-- ============ LAPTOP → DASHBOARD CNC ============ -->
<div class="ov laptop-ov" id="laptop" hidden>
    <div class="laptop">
        <div class="lap-bar"><span>💻 LAPTOP — Dashboard CNC PCB</span><button class="pxbtn xs" data-ovclose>✕ TUTUP LAPTOP (Esc)</button></div>
        <div class="lap-screen">
            <div class="lap-load" id="lapLoad"><div class="hourglass"><i></i><i></i><i></i><i></i><i></i></div><p>MEMBUKA DASHBOARD…</p></div>
            <iframe id="lapFrame" title="Dashboard CNC" allow="fullscreen"></iframe>
        </div>
        <div class="lap-base"></div>
    </div>
</div>

<!-- ============ BANTUAN ============ -->
<div class="ov" id="help" hidden>
    <div class="ov-back" data-ovclose></div>
    <div class="helpbox">
        <div class="tb-top"><b>? BANTUAN</b><button class="pxbtn xs" data-ovclose>✕</button></div>
        <div class="help-grid">
            <div><h4>Gerak & Kamera</h4><p><kbd>W A S D</kbd> / panah jalan · <kbd>Shift</kbd> lari<br>Seret mouse putar kamera · scroll zoom<br><kbd>V</kbd> ganti kamera: <kbd>1</kbd> belakang · <kbd>2</kbd> depan · <kbd>3</kbd> mata karakter (FPV) · <kbd>4</kbd> atas · <kbd>5</kbd> isometrik</p></div>
            <div><h4>Aksi</h4><p><kbd>E</kbd> interaksi (masak, cuci, duduk, bicara, elus kucing…)<br><kbd>M</kbd> buka peta · <kbd>T</kbd> tablet gadget (CNC &amp; ARM)<br><kbd>P</kbd> handphone · <kbd>F</kbd> makan · <kbd>G</kbd> minum</p></div>
            <div><h4>Kendaraan</h4><p>Dekati mobil / motor / ekskavator lalu <kbd>E</kbd><br><kbd>W/S</kbd> gas · <kbd>A/D</kbd> belok · <kbd>Spasi</kbd> rem (ekskavator: gali) · <kbd>Q/R</kbd> putar kabin · <kbd>L</kbd> lampu</p></div>
            <div><h4>Memancing & Kemah</h4><p>Di dermaga / tepi pantai tekan <kbd>E</kbd> → pancing; tekan <kbd>E</kbd> saat ikan menyambar. Karakter bersiul saat menunggu (<kbd>Esc</kbd> berhenti).<br>Petak kemah (barat danau): <kbd>E</kbd> → dirikan tenda, nyalakan api unggun, bakar ikan, tidur.</p></div>
            <div><h4>Laptop</h4><p>Duduk di meja kerja (kamar kanan-belakang), tekan <kbd>E</kbd> pada laptop → dashboard monitoring &amp; digital twin CNC.</p></div>
            <div><h4>Tujuan</h4><p>Jaga lapar, haus, energi, kebersihan. Selesaikan misi NPC di Tablet → Misi. Ajak Abu &amp; Jemoy jalan-jalan.</p></div>
        </div>
        <button class="pxbtn sm danger-b" id="btnReset">🗑 MULAI BARU</button>
    </div>
</div>

<div class="fade" id="fade"></div><div class="flash" id="flash"></div>
<div class="toasts" id="toasts"></div>

<!-- kontrol sentuh -->
<div class="touch" aria-hidden="true">
    <div class="joy" id="joy"><i id="joyKnob"></i></div>
    <div class="tbts"><button class="pxbtn" id="tE">E</button><button class="pxbtn sm" id="tM">🗺</button><button class="pxbtn sm" id="tT">📱</button><button class="pxbtn sm" id="tP">💬</button><button class="pxbtn sm" id="tC">🎥</button><button class="pxbtn sm" id="tR">LARI</button></div>
</div>

<script type="module" src="assets/js/game/main.js?v=<?= $v ?>"></script>
<noscript><p style="color:#fff;padding:2rem">Game memerlukan JavaScript.</p></noscript>
</body>
</html>
