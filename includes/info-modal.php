<div class="modal" id="modal" hidden>
    <div class="modal-back" data-close></div>
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="mTitle">
        <div class="modal-h">
            <h3 id="mTitle">ℹ INFO MESIN &amp; TOPIC</h3>
            <button class="pxbtn xs" data-close aria-label="Tutup">✕</button>
        </div>

        <div class="tabs" role="tablist">
            <button class="tab active" data-tab="t-mesin">MESIN</button>
            <button class="tab" data-tab="t-topic">MQTT TOPIC</button>
            <button class="tab" data-tab="t-status">STATUS</button>
            <button class="tab" data-tab="t-robot">ROBOT ARM</button>
        </div>

        <section class="tabpane active" id="t-mesin">
            <dl class="kv">
                <dt>Nama</dt><dd><?= e($cfg['machine']) ?></dd>
                <dt>Controller</dt><dd>ESP32 + GRBL (via MQTT)</dd>
                <dt>Broker</dt><dd><?= e($cfg['mqtt']['host']) ?></dd>
                <dt>Sumbu X/Y/Z</dt><dd>Twin mengikuti <code>MPos</code> (posisi aktual mesin) dari topic <code>status</code></dd>
                <dt>Posisi awal</dt><dd>Setelah START pahat berjalan ke <b>tengah PCB</b>, lalu bergerak sesuai koordinat. Titik nol kerja (WPos 0,0) = tengah PCB (tanda silang merah)</dd>
                <dt>WPos</dt><dd>Posisi relatif titik nol kerja; ditampilkan di kartu POSISI</dd>
                <dt>Spindle</dt><dd>RUN bila status <code>Run</code> atau MPos/WPos berubah. RPM dari <code>FS:</code>/<code>S:</code> bila ada, selain itu nominal <?= e((string)$cfg['spindle']['rpm_nominal']) ?> rpm (EST)</dd>
                <dt>Jalur PCB</dt><dd>Tergambar di papan 3D mengikuti pergerakan pahat</dd>
            </dl>
        </section>

        <section class="tabpane" id="t-topic">
            <table class="tbl">
                <thead><tr><th>Topic</th><th>Arah</th><th>Isi</th></tr></thead>
                <tbody>
                <?php
                $rows = [
                    ['status',   'ESP → Web', 'Run,MPos:x,y,z,WPos:x,y,z,…'],
                    ['online',   'ESP → Web', 'online / offline'],
                ];
                foreach ($rows as [$k, $dir, $desc]): ?>
                    <tr>
                        <td><button class="copy" data-copy="<?= e($cfg['topics'][$k]) ?>" data-tip="Klik untuk salin"><?= e($cfg['topics'][$k]) ?></button></td>
                        <td><?= e($dir) ?></td>
                        <td><?= e($desc) ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </section>

        <section class="tabpane" id="t-status">
            <ul class="legend">
                <li><i class="sw s-idle"></i><b>IDLE</b> mesin siaga</li>
                <li><i class="sw s-run"></i><b>RUN</b> sedang bekerja (spindle berputar, RPM tampil)</li>
                <li><i class="sw s-hold"></i><b>HOLD</b> / PAUSE ditahan</li>
                <li><i class="sw s-alarm"></i><b>ALARM</b> / DOOR / ERROR butuh UNLOCK/RESET</li>
                <li><i class="sw s-home"></i><b>HOME / JOG / CHECK</b> mode lain GRBL</li>
            </ul>
        </section>

        <section class="tabpane" id="t-robot">
            <p style="margin:0 0 8px">Base topic: <button class="copy" data-copy="<?= e($cfg['robot']['base']) ?>"><?= e($cfg['robot']['base']) ?></button></p>
            <table class="tbl">
                <thead><tr><th>Sub-topic</th><th>Arah</th><th>Isi</th></tr></thead>
                <tbody>
                <?php foreach ([
                    ['status/online', 'ESP → Web', 'online / offline'],
                    ['status/mode',   'ESP → Web', 'IDLE / AUTO / APP / MEMORY'],
                    ['status/pos',    'ESP → Web', 'base,shoulder,elbow,gripper'],
                    ['status/log',    'ESP → Web', 'teks kejadian'],
                    ['cmd/mode',      'Web → ESP', 'AUTO / IDLE / APP'],
                    ['cmd/stop',      'Web → ESP', 'apa saja → IDLE'],
                    ['cmd/slider/{base,shoulder,elbow,gripper}', 'Web → ESP', 'angka (mode APP)'],
                    ['cmd/speed',     'Web → ESP', '1..10'],
                    ['cmd/memory/barang', 'Web → ESP', 'A / B'],
                    ['cmd/memory/jeda',   'Web → ESP', 'ms'],
                ] as [$k, $dir, $desc]): ?>
                    <tr><td><code><?= e($k) ?></code></td><td><?= e($dir) ?></td><td><?= e($desc) ?></td></tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </section>
    </div>
</div>
