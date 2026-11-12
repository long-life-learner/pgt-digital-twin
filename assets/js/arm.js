/* ===================================================================
   ROBOT ARM — UI, state, MQTT (robotarm/…) dan simulator firmware (DEMO)
   Dipanggil dari app.js:  const arm = initArm(ctx)
   =================================================================== */
export function initArm(ctx) {
    const { CFG, $, $$, toast, sfx, hms, pad, clamp, getClient } = ctx;
    const R = CFG.robot;
    const BASE = R.base;
    const T = (sub) => `${BASE}/${sub}`;
    const AXN = ['base', 'shoulder', 'elbow', 'gripper'];
    const SMIN = R.sMin, SMAX = R.sMax;

    const A = {
        online: null, mode: null, pos: R.sHome.slice(), appTgt: R.sHome.slice(),
        lastMsgAt: 0, msgs: 0, moved: 0, fase: '-', arah: 'A>B', speed: 5, jeda: 2000, demo: false, sw: false,
        autoBusy: false, lastLog: '', shown: false, hasPos: false,
        autoChainMemory: false, autoChainTimer: 0,
    };
    let twin = null, twinLoading = null;

    /* ---------------- util tampilan ---------------- */
    const logEl = $('#aLog');
    function addLog(type, msg) {
        const li = document.createElement('li');
        li.innerHTML = `<time>${hms()}</time><span class="t-${type}"></span>`; li.lastChild.textContent = msg;
        logEl.prepend(li); while (logEl.children.length > 80) logEl.lastChild.remove();
    }
    $('#aClearLog').addEventListener('click', () => { logEl.innerHTML = ''; toast('Log robot dihapus'); });
    $('#aBaseTopic').textContent = BASE + '/…';
    $('#aCmdTopic').textContent = '→ ' + BASE + '/cmd';

    const MODE_FOOT = { IDLE: 'Standby di posisi HOME', AUTO: 'Sensor mencari barang, lalu memori otomatis (A↔B)', APP: 'Gerak manual lewat slider', MEMORY: 'Program memori berjalan (via AUTO)' };
    function paintMode() {
        const m = A.mode, card = $('#aCardMode');
        $('#aMode').textContent = m || '---';
        card.dataset.state = m ? m.toLowerCase() : 'off';
        $('#aModeFoot').textContent = m ? MODE_FOOT[m] || '' : 'Belum ada data';
        $$('[data-amode]').forEach(b => b.classList.toggle('on', b.dataset.amode === m));
        const app = m === 'APP';
        $$('#aSliders input').forEach(i => { i.disabled = !app; });
        $('#aSliderNote').textContent = app ? 'aktif — geser untuk menggerakkan' : 'hanya mode APP';
        $$('[data-abarang]').forEach(b => { b.disabled = m === 'MEMORY'; });
        banner();
    }
    function banner() {
        const b = $('#aBanner'); let msg = '', cls = '';
        if (A.online === false) { msg = 'ROBOT OFFLINE'; cls = 'alarm'; }
        else if (A.mode === 'APP') msg = '🎚 MODE MANUAL';
        if (!msg) { b.hidden = true; return; }
        if (b.textContent !== msg) { b.hidden = false; b.className = 'banner ' + cls; b.textContent = msg; }
    }
    const pct = (i, v) => clamp((v - SMIN[i]) / (SMAX[i] - SMIN[i]) * 100, 0, 100);
    function paintPos(vals) {
        $$('#aAxes li').forEach(li => {
            const i = +li.dataset.ax, v = Math.round(vals[i]);
            const b = $('b', li); if (b.textContent !== String(v)) { b.textContent = v; b.classList.remove('num-pop'); void b.offsetWidth; b.classList.add('num-pop'); }
            $('.meter i', li).style.width = pct(i, v) + '%';
        });
        $('#hB').textContent = Math.round(vals[0]); $('#hS').textContent = Math.round(vals[1]); $('#hE').textContent = Math.round(vals[2]); $('#hG').textContent = Math.round(vals[3]);
    }
    const POSE = { A1: [400, 340], A2: [424, 340], B1: [136, 372], B2: [50, 374] };
    function poseLabel(p) {
        if (p[1] >= 480) return Math.abs(p[0] - 335) < 18 ? 'HOME' : 'ANGKAT';
        let best = '', bd = 1e9; for (const [k, v] of Object.entries(POSE)) { const d = Math.abs(p[0] - v[0]) + Math.abs(p[1] - v[1]) * 0.5; if (d < bd) { bd = d; best = k; } }
        return bd < 70 ? 'TURUN → ' + best : 'BERGERAK';
    }
    function lcdLines() {
        const on = A.online;
        const l0 = on ? 'MQTT: CONNECTED' : (A.demo ? 'MQTT: CONNECTED' : 'MQTT: MENUNGGU');
        const m = A.mode; let l1 = '';
        if (!m) l1 = 'Initializing...';
        else if (m === 'IDLE') l1 = 'IDLE-Robot Siap';
        else if (m === 'AUTO') l1 = A.autoBusy ? 'AUTO: memindah' : 'AUTO: cari objek';
        else if (m === 'MEMORY') l1 = `MEM F${A.fase === '-' ? 0 : A.fase} ${A.arah === 'B>A' ? 'B>A' : 'A>B'}`;
        else l1 = `B${Math.round(A.appTgt[0])} S${Math.round(A.appTgt[1])} E${Math.round(A.appTgt[2])}`;
        return [l0, l1];
    }
    function paintLcd() {
        const [a, b] = lcdLines(); const el = $('#aLcd');
        el.classList.toggle('off', !A.online && !A.demo);
        el.children[0].textContent = a; el.children[1].textContent = b;
        twin?.setLcd(a, b);
        const cur = A.mode === 'APP' ? A.appTgt : A.pos;
        $('#aStep').textContent = A.mode ? `${A.mode} · ${poseLabel(cur)}` : '—';
    }
    const twinPos = () => (A.mode === 'APP' ? A.appTgt : A.pos);
    function pushTwin(snap = false) { twin?.setPos(twinPos(), snap); paintPos(twinPos()); }

    /* ---------------- pesan masuk (MQTT atau simulator) ---------------- */
    const touch = () => { A.lastMsgAt = Date.now(); A.msgs++; $('#aWaiting').classList.add('hide'); twin?.setHasData(true); };
    function handle(sub, raw) {
        const p = String(raw).trim();
        touch();
        if (sub === 'status/online') {
            const on = ['online', '1', 'true', 'on'].includes(p.toLowerCase());
            const ch = A.online !== on; A.online = on; twin?.setOnline(on);
            $('#aLedEsp').className = 'led ' + (on ? 'ok' : 'bad'); $('#aTxtEsp').textContent = on ? 'ONLINE' : 'OFFLINE';
            if (ch) { addLog('online', `Robot ${on ? 'ONLINE' : 'OFFLINE'}`); toast(`Robot ${on ? 'online' : 'offline'}`, on ? 'good' : 'warn'); on ? sfx.ok() : sfx.bad(); }
            banner(); paintLcd();
        } else if (sub === 'status/mode') {
            const m = p.toUpperCase(); if (!MODE_FOOT[m]) return;
            const ch = A.mode !== m; A.mode = m; twin?.setMode(m);
            if (m === 'APP') { A.appTgt = A.pos.slice(); A.appFresh = true; syncSliders(); }
            if (m !== 'AUTO') A.autoBusy = false;
            if (ch) { addLog('mode', `Mode → ${m}`); sfx.click(); }
            // Jika robot masuk AUTO dan flag chain aktif, otomatis pindah ke MEMORY setelah home
            if (m === 'AUTO' && A.autoChainMemory) {
                A.autoChainMemory = false;
                clearTimeout(A.autoChainTimer);
                A.autoChainTimer = setTimeout(() => {
                    addLog('system', 'AUTO home selesai → beralih ke MEMORY');
                    if (send('cmd/mode', 'MEMORY')) {
                        $('#aCmdFoot').textContent = `✔ MEMORY diaktifkan ${hms()}`;
                    }
                }, 1200);
            }
            paintMode(); pushTwin(); paintLcd();
        } else if (sub === 'status/pos') {
            const v = p.split(',').map(Number); if (v.length < 4 || v.some(n => !Number.isFinite(n))) return;
            A.pos = v; A.hasPos = true;
            if (A.mode === 'APP' && A.appFresh) { A.appTgt = v.slice(); syncSliders(); pushTwin(); }
            else if (A.mode !== 'APP') pushTwin();
            paintLcd();
        } else if (sub === 'status/log') {
            addLog('pos', p); parseLog(p);
        }
    }
    function parseLog(t) {
        let m;
        if (/AUTO: barang terdeteksi/i.test(t)) { A.autoBusy = true; twin?.ensureAt('A1'); }
        else if ((m = /barang dipindah ke-(\d+)/i.exec(t))) { A.moved = +m[1]; A.autoBusy = false; $('#aMoved').textContent = A.moved; sfx.ok(); }
        else if ((m = /MEMORY: Barang (\d) (A\d|B\d) -> (A\d|B\d)/i.exec(t))) { twin?.ensureAt(m[2].toUpperCase(), +m[1] - 1); }
        else if ((m = /MEMORY: Barang \d (A->B|B->A) selesai/i.exec(t))) { A.moved++; $('#aMoved').textContent = A.moved; }
        else if ((m = /MEMORY: fase (\d+) selesai\. Berikutnya (A->B|B->A)/i.exec(t))) { A.fase = +m[1]; A.arah = m[2].replace('->', '>'); $('#aPhase').textContent = `${A.fase} ${A.arah}`; }
        else if ((m = /Kecepatan = (\d+)/i.exec(t))) { A.speed = +m[1]; $('#aSpeedV').textContent = A.speed; $('#aSpeed').value = A.speed; $('#aSpeedTxt').textContent = A.speed; }
        else if ((m = /Jeda antar fase = (\d+)/i.exec(t))) { A.jeda = +m[1]; $('#aJeda').value = A.jeda; $('#aJedaTxt').textContent = A.jeda; }
        else if (/Barang ditandai di A/i.test(t)) twin?.resetObjects();
        else if (/Barang ditandai di B/i.test(t)) { twin?.ensureAt('B1', 0); twin?.ensureAt('B2', 1); }
        else if (/Ditolak/i.test(t)) toast(t, 'warn', 3500);
        paintLcd();
    }

    /* ---------------- perintah keluar ---------------- */
    function send(sub, payload, label) {
        if (A.demo) { addLog('cmd', `[DEMO] ${sub} ${payload}`); sim.cmd(sub, String(payload)); return true; }
        const c = getClient();
        if (!c || !c.connected) { toast('MQTT belum terhubung', 'bad'); sfx.bad(); return false; }
        c.publish(T(sub), String(payload), { qos: 0 });
        if (label !== false) addLog('cmd', `${sub} ← ${payload}`);
        return true;
    }

    /* Tombol AUTO: jalankan AUTO dulu (home ke tengah), lalu otomatis masuk MEMORY */
    $$('[data-amode]').forEach(b => b.addEventListener('click', () => {
        const targetMode = b.dataset.amode;
        if (targetMode === 'AUTO') {
            A.autoChainMemory = true;
            clearTimeout(A.autoChainTimer);
            addLog('system', 'AUTO ditekan → HOME dulu, lalu MEMORY otomatis');
        } else {
            A.autoChainMemory = false;
            clearTimeout(A.autoChainTimer);
        }
        if (send('cmd/mode', targetMode)) {
            const label = targetMode === 'AUTO' ? 'AUTO → MEMORY (otomatis)' : targetMode;
            $('#aCmdFoot').textContent = `✔ ${label} terkirim ${hms()}`;
            sfx.ok();
        }
    }));
    $('#aStop').addEventListener('click', () => {
        A.autoChainMemory = false; clearTimeout(A.autoChainTimer);
        if (send('cmd/stop', 'X')) { $('#aCmdFoot').textContent = `⏹ STOP terkirim ${hms()}`; toast('STOP → IDLE', 'warn'); }
    });
    $$('[data-abarang]').forEach(b => b.addEventListener('click', () => { if (send('cmd/memory/barang', b.dataset.abarang)) toast(`Barang ditandai di ${b.dataset.abarang}`, 'good'); }));

    // slider sumbu (mode APP) — kirim ber-throttle 70 ms
    const sl = $$('#aSliders input');
    sl.forEach((inp) => {
        const i = +inp.dataset.sl; inp.min = SMIN[i]; inp.max = SMAX[i]; inp.step = 1; inp.value = R.sHome[i];
        let last = 0, timer = 0;
        const fire = () => { last = performance.now(); send(`cmd/slider/${AXN[i]}`, inp.value, false); };
        inp.addEventListener('input', () => {
            $('b', inp.parentElement).textContent = inp.value; A.appTgt[i] = +inp.value; A.appFresh = false;
            pushTwin(); paintLcd();
            const wait = 70 - (performance.now() - last); clearTimeout(timer);
            if (wait <= 0) fire(); else timer = setTimeout(fire, wait);
        });
        inp.addEventListener('change', () => { clearTimeout(timer); fire(); });
    });
    function syncSliders() { sl.forEach((inp) => { const i = +inp.dataset.sl; inp.value = A.appTgt[i]; $('b', inp.parentElement).textContent = Math.round(A.appTgt[i]); }); }
    syncSliders();

    const spd = $('#aSpeed'), jed = $('#aJeda');
    let spdT = 0, jedT = 0;
    spd.addEventListener('input', () => { $('#aSpeedTxt').textContent = spd.value; clearTimeout(spdT); spdT = setTimeout(() => { A.speed = +spd.value; $('#aSpeedV').textContent = A.speed; send('cmd/speed', spd.value); }, 150); });
    jed.addEventListener('input', () => { $('#aJedaTxt').textContent = jed.value; clearTimeout(jedT); jedT = setTimeout(() => { A.jeda = +jed.value; send('cmd/memory/jeda', jed.value); }, 200); });

    /* ---------------- kamera / layar penuh ---------------- */
    $$('[data-acam]').forEach(b => b.addEventListener('click', () => twin?.cam(b.dataset.acam)));
    $('#aBtnAuto').addEventListener('click', (e) => { const on = twin?.autoRotate(!twin.isAutoRotate); e.currentTarget.classList.toggle('on', !!on); });
    $('#aBtnFull').addEventListener('click', async () => { const el = $('#armStage .stage-frame'); try { document.fullscreenElement ? await document.exitFullscreen() : await el.requestFullscreen(); } catch { /* abaikan */ } });

    /* ---------------- stale / sinkron ---------------- */
    const syncBox = $('#aSync');
    setInterval(() => {
        const age = A.lastMsgAt ? (Date.now() - A.lastMsgAt) / 1000 : Infinity, lim = R.staleAfter;
        if (!isFinite(age)) { syncBox.classList.add('is-waiting'); syncBox.classList.remove('stale'); $('#aSyncTxt').textContent = 'MENUNGGU DATA'; $('#aSyncBar').style.width = '0%'; }
        else {
            syncBox.classList.remove('is-waiting'); const stale = age > lim && !A.demo; syncBox.classList.toggle('stale', stale);
            $('#aSyncTxt').textContent = stale ? `BASI ${Math.floor(age)}s` : `LIVE ${Math.floor(age)}s`; $('#aSyncBar').style.width = clamp(age / lim * 100, 4, 100) + '%';
            if (age > lim * 3 && !A.demo) $('#aWaiting').classList.remove('hide');
        }
        $('#aMsgs').textContent = A.msgs;
    }, 300);

    /* ===================================================================
       SIMULATOR FIRMWARE (DEMO) — meniru logika sketch .ino
       =================================================================== */
    const sim = (() => {
        const TT = { A1: { putar: 335, base: 400, sh: 340, el: 135 }, A2: { putar: 424, base: 424, sh: 340, el: 135 }, B1: { putar: 138, base: 136, sh: 372, el: 133 }, B2: { putar: 60, base: 50, sh: 374, el: 133 } };
        const HOME = [335, 495, 126, 490], GRIP_T = 490, GRIP_MEM = 510, PEGANG = 555;
        const PL_MIN = [50, 280, 110, 443], PL_MAX = [550, 550, 350, 600];
        const g2p = (v) => Math.round(443 + (clamp(v, 138, 300) - 138) / (300 - 138) * (600 - 443));
        const p2g = (p) => Math.round(138 + (clamp(p, 443, 600) - 443) / (600 - 443) * (300 - 138));
        const S = { on: false, mode: 'IDLE', cur: HOME.slice(), tgt: HOME.slice(), seq: [], idx: 0, ph: 'none', mFrom: [], mTo: [], t0: 0, dur: 0, pauseUntil: 0, speed: 5, jeda: 2000, running: false,
            autoPhase: 'tunggu', detect: 0, cool: 0, moved: 0, barang: [{ diB: false, g: 565, gB: 565 }, { diB: false, g: 565, gB: 565 }], arah: false, memB: 0, fase: 0, tMem: 0, lastSent: [], tPos: 0, timer: 0, tDetect: 0,
            systemOn: true /* saklar sistem di DEMO selalu ON */ };

        const out = (sub, v) => handle(sub, v);
        const log = (s) => out('status/log', s);
        const tambah = (nama, b, s, e, g, lv, jeda) => S.seq.push({ nama, t: [b, s, e, g], lv, jeda });
        const home = (gb) => { tambah('HOME angkat', -1, 495, -1, -1, 5, 100); tambah('HOME tengah', 335, -1, 126, gb, 5, 300); };
        const pindah = (dari, ke, gb, gp) => {
            S.seq = [];
            tambah('angkat', -1, 495, -1, -1, 5, 100); tambah('putar asal', dari.putar, -1, -1, gb, 5, 100); tambah('turun asal', dari.base, dari.sh, dari.el, -1, 4, 300);
            tambah('jepit', -1, -1, -1, gp, 3, 500); tambah('angkat', -1, 495, -1, -1, 5, 100); tambah('putar tujuan', ke.putar, -1, -1, -1, 5, 100);
            tambah('turun tujuan', ke.base, ke.sh, ke.el, -1, 4, 300); tambah('lepas', -1, -1, -1, gb, 3, 500); home(gb);
        };
        const run = () => { S.idx = 0; S.ph = 'next'; S.running = true; };
        const stopSeq = () => { S.memMove = false; S.running = false; S.seq = []; S.idx = 0; S.ph = 'none'; };
        const sendPos = () => { S.lastSent = S.cur.slice(); out('status/pos', [Math.round(S.cur[0]), Math.round(S.cur[1]), Math.round(S.cur[2]), p2g(S.cur[3])].join(',')); };

        const finishSeq = () => {
            if (S.mode === 'AUTO') { if (S.autoPhase === 'pindah') { S.moved++; log(`AUTO: barang dipindah ke-${S.moved}`); S.cool = performance.now() + 2000; } S.autoPhase = 'tunggu'; S.detect = 0; S.tDetect = performance.now() + 3500 + Math.random() * 2500; }
            else if (S.mode === 'MEMORY' && S.memMove && S.memB < 2 && S.barang[S.memB].diB === S.arah) { S.memMove = false; S.barang[S.memB].diB = !S.arah; log(`MEMORY: Barang ${S.memB + 1} ${S.arah ? 'B->A' : 'A->B'} selesai`); S.memB++; }
            sendPos();
        };
        const begin = (i) => {
            const s = S.seq[i]; let maxD = 0; S.mFrom = S.cur.slice();
            S.mTo = s.t.map((v, k) => (v < 0 ? S.cur[k] : clamp(v, PL_MIN[k], PL_MAX[k])));
            for (let k = 0; k < 4; k++) maxD = Math.max(maxD, Math.abs(S.mTo[k] - S.mFrom[k]));
            if (maxD === 0) return false;
            const lv = clamp(Math.min(s.lv, S.speed), 1, 10); S.dur = Math.max(0.01, maxD / (lv * 40)) * 1000; S.t0 = performance.now(); S.ph = 'move'; return true;
        };
        const setMode = (m) => {
            stopSeq(); S.mode = m; S.detect = 0;
            if (m === 'IDLE') { home(GRIP_T); run(); }
            else if (m === 'AUTO') { S.moved = 0; S.autoPhase = 'homing'; home(GRIP_T); run(); }
            else if (m === 'MEMORY') { S.memB = 0; S.tMem = 0; home(GRIP_MEM); run(); }
            else { S.tgt = S.cur.slice(); }
            log('MODE: ' + m); out('status/mode', m); sendPos();
        };
        const stepSeq = (now) => {
            if (!S.running) return;
            if (S.ph === 'pause') { if (now < S.pauseUntil) return; S.idx++; S.ph = 'next'; }
            if (S.ph === 'next') { while (S.idx < S.seq.length && !begin(S.idx)) S.idx++; if (S.idx >= S.seq.length) { S.running = false; finishSeq(); return; } }
            if (S.ph === 'move') {
                const f = clamp((now - S.t0) / S.dur, 0, 1);
                for (let k = 0; k < 4; k++) S.cur[k] = S.mFrom[k] + (S.mTo[k] - S.mFrom[k]) * f;
                if (f >= 1) { S.ph = 'pause'; S.pauseUntil = now + S.seq[S.idx].jeda; }
            }
        };
        const memLoop = (now) => {
            if (S.mode !== 'MEMORY' || S.running || now < S.tMem) return;
            while (S.memB < 2 && S.barang[S.memB].diB !== S.arah) { log(`MEMORY: Barang ${S.memB + 1} sudah di tujuan, dilewati`); S.memB++; }
            if (S.memB >= 2) { S.fase++; S.arah = !S.arah; S.memB = 0; S.tMem = now + S.jeda; log(`MEMORY: fase ${S.fase} selesai. Berikutnya ${S.arah ? 'B->A' : 'A->B'}`); return; }
            const i = S.memB, ks = S.arah ? ['B1', 'B2'] : ['A1', 'A2'], kt = S.arah ? ['A1', 'A2'] : ['B1', 'B2'];
            log(`MEMORY: Barang ${i + 1} ${ks[i]} -> ${kt[i]}`);
            pindah(TT[ks[i]], TT[kt[i]], GRIP_MEM, S.arah ? S.barang[i].gB : S.barang[i].g); S.memMove = true; run();
        };
        const autoLoop = (now) => {
            if (S.mode !== 'AUTO' || S.running || S.autoPhase !== 'tunggu' || now < S.cool) return;
            if (now >= S.tDetect) { log('AUTO: barang terdeteksi -> B1'); pindah(TT.A1, TT.B1, GRIP_T, PEGANG); S.autoPhase = 'pindah'; run(); }
        };
        const appLoop = (dt) => {
            if (S.mode !== 'APP') return;
            for (let k = 0; k < 4; k++) { const d = S.tgt[k] - S.cur[k], st = 300 * dt; S.cur[k] += Math.abs(d) <= st ? d : Math.sign(d) * st; }
        };
        let tl = performance.now();
        const tick = () => {
            const now = performance.now(), dt = (now - tl) / 1000; tl = now;
            stepSeq(now); memLoop(now); autoLoop(now); appLoop(dt);
            if (S.mode !== 'APP' && now - S.tPos >= 300) { S.tPos = now; if (S.cur.some((v, k) => Math.round(v) !== Math.round(S.lastSent[k] ?? -1))) sendPos(); }
        };
        return {
            start() {
                Object.assign(S, { cur: HOME.slice(), tgt: HOME.slice(), speed: 5, jeda: 2000, moved: 0, fase: 0, arah: false, memB: 0, barang: [{ diB: false, g: 565, gB: 565 }, { diB: false, g: 565, gB: 565 }] });
                S.on = true; out('status/online', 'online'); setMode('IDLE');
                clearInterval(S.timer); S.timer = setInterval(tick, 30);
            },
            stop() { clearInterval(S.timer); S.on = false; stopSeq(); },
            /* Saklar sistem di DEMO: ON = robot aktif, OFF = robot idle paksa */
            sw(v) {
                S.systemOn = v;
                if (!S.on) return;
                if (!v) {
                    log('Saklar sistem OFF -> Semua operasi dihentikan');
                    setMode('IDLE');
                } else {
                    log('Saklar sistem ON -> Robot aktif, siap menerima perintah');
                }
            },
            cmd(sub, p) {
                const u = p.toUpperCase();
                if (sub === 'cmd/stop') { return setMode('IDLE'); }
                if (sub === 'cmd/mode') {
                    if (u === 'IDLE') return setMode('IDLE');
                    // Tolak jika saklar sistem OFF (kecuali IDLE/STOP)
                    if (!S.systemOn) return log('Ditolak: Saklar sistem OFF. Nyalakan D25 untuk mengaktifkan robot.');
                    if (u === 'AUTO') return setMode('AUTO');
                    if (u === 'APP') return setMode('APP');
                    if (u === 'MEMORY') return setMode('MEMORY');
                } else if (sub.startsWith('cmd/slider/')) {
                    if (S.mode !== 'APP') return; const k = AXN.indexOf(sub.slice(11)); if (k < 0) return;
                    S.tgt[k] = k === 3 ? g2p(+u) : clamp(+u, PL_MIN[k], PL_MAX[k]);
                } else if (sub === 'cmd/speed') { S.speed = clamp(parseInt(u) || 5, 1, 10); log('Kecepatan = ' + S.speed); }
                else if (sub === 'cmd/memory/jeda') { S.jeda = clamp(parseInt(u) || 0, 0, 60000); log('Jeda antar fase = ' + S.jeda + ' ms'); }
                else if (sub === 'cmd/memory/barang') {
                    if (S.mode === 'MEMORY') return log('Ditolak: MEMORY sedang aktif.');
                    if (u === 'A' || u === 'B') { const b = u === 'B'; S.barang.forEach(x => { x.diB = b; }); S.arah = b; log(b ? 'Barang ditandai di B. Fase berikutnya B->A' : 'Barang ditandai di A. Fase berikutnya A->B'); }
                }
            },
        };
    })();

    function setDemo(on) {
        if (on === A.demo) return;
        A.demo = on; $('#aBtnDemo').classList.toggle('on', on); $('#aBtnSwitch').disabled = !on;
        if (on) {
            A.online = null; A.mode = null; A.moved = 0; A.fase = '-'; A.arah = 'A>B'; $('#aMoved').textContent = 0; $('#aPhase').textContent = '-';
            twin?.resetObjects(); twin?.setSwitch(false); A.sw = false; $('#aBtnSwitch').classList.remove('on');
            addLog('system', 'Mode DEMO aktif (simulasi firmware)'); toast('DEMO robot: data simulasi', 'warn'); sim.start();
        } else {
            sim.stop(); addLog('system', 'Mode DEMO nonaktif'); toast('DEMO dimatikan');
            A.lastMsgAt = 0; A.online = null; A.mode = null; twin?.setMode('OFF'); twin?.setOnline(false); twin?.setHasData(false); twin?.setSwitch(false);
            $('#aLedEsp').className = 'led'; $('#aTxtEsp').textContent = '---'; paintMode(); paintLcd(); banner();
        }
    }
    $('#aBtnDemo').addEventListener('click', () => { sfx.click(); setDemo(!A.demo); });
    /* Saklar sistem di DEMO: ON/OFF sistem robot */
    $('#aBtnSwitch').addEventListener('click', (e) => {
        A.sw = !A.sw;
        e.currentTarget.classList.toggle('on', A.sw);
        twin?.setSwitch(A.sw);
        sim.sw(A.sw);
        sfx.click();
        const statusTxt = A.sw ? '🟢 Sistem ON' : '🔴 Sistem OFF';
        addLog('system', `Saklar sistem: ${A.sw ? 'ON' : 'OFF'}`);
        $('#aCmdFoot').textContent = statusTxt;
    });

    /* ---------------- 3D: dibuat saat tab dibuka pertama kali ---------------- */
    async function ensureTwin() {
        if (twin) return twin;
        twinLoading ??= (async () => {
            const mod = await import('./arm3d.js');
            twin = await mod.createArmTwin($('#arm3d'), { baseSign: R.baseSign });
            window.ARM3D = { twin, A, sim };
            twin.setMode(A.mode || 'OFF'); twin.setOnline(!!A.online); twin.setHasData(!!A.lastMsgAt);
            if (A.hasPos || A.demo) pushTwin(true); else twin.setPos(R.sHome, true);
            paintLcd(); twin.setPos(twinPos(), true);
            return twin;
        })();
        try { return await twinLoading; } catch (e) { console.error(e); toast('Twin robot gagal dimuat (WebGL?)', 'bad', 5000); twinLoading = null; return null; }
    }

    paintMode(); paintLcd(); paintPos(R.sHome);
    return {
        owns: (topic) => topic.startsWith(BASE + '/'),
        onMessage: (topic, payload) => handle(topic.slice(BASE.length + 1), payload),
        onConnect(client) {
            client.subscribe(T('status/#'), { qos: 0 }, (err) => addLog('system', err ? 'Gagal subscribe status robot' : `Subscribe ${BASE}/status/#`));
        },
        async show(v) {
            A.shown = v;
            if (v) { const t = await ensureTwin(); t?.pause(false); requestAnimationFrame(() => t?.resize()); }
            else twin?.pause(true);
        },
        get twin() { return twin; },
        state: A,
    };
}
