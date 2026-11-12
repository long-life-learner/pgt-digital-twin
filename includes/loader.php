<div class="boot" id="boot" role="status" aria-live="polite">
    <div class="boot-inner">
        <div class="boot-stage" aria-hidden="true">
            <div class="boot-gantry"><i class="bit"></i></div>
            <div class="boot-pcb"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
            <div class="boot-chips"><i></i><i></i><i></i><i></i><i></i></div>
        </div>

        <h2 class="boot-title"><?= htmlspecialchars($cfg['app_name'], ENT_QUOTES) ?></h2>
        <p class="boot-sub">DIGITAL TWIN &amp; MONITORING</p>

        <div class="boot-bar" aria-hidden="true">
            <span id="bootBar"></span>
        </div>
        <div class="boot-pct" id="bootPct">0%</div>

        <ul class="boot-steps" id="bootSteps">
            <li data-s="assets"><i></i> Memuat aset &amp; font</li>
            <li data-s="three"><i></i> Memuat engine 3D</li>
            <li data-s="world"><i></i> Membangun dunia pixel</li>
            <li data-s="log"><i></i> Mengambil riwayat event</li>
            <li data-s="mqtt"><i></i> Menghubungkan MQTT</li>
        </ul>

        <button class="pxbtn start" id="btnStart" hidden>▶ PRESS START</button>
        <p class="boot-tip" id="bootTip">TIP: spindle dianggap RUN saat status Run atau MPos/WPos berubah.</p>
    </div>
</div>
