/* ===================================================================
   CNC PIXEL LAB — UI, MQTT, loader, micro-interaction
   =================================================================== */
const CFG = window.CNC_CONFIG;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const store = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* abaikan */ } },
};
const pad = (n) => String(n).padStart(2, '0');
const hms = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/* ------------------------------------------------------------------
   Suara chiptune (opsional)
   ------------------------------------------------------------------ */
const sfx = (() => {
    let ctx = null, on = store.get('cnc-sound', '0') === '1';
    const btn = $('#btnSound');
    const paint = () => { btn.textContent = on ? '🔊' : '🔇'; btn.classList.toggle('on', on); };
    paint();
    const beep = (f = 660, d = 0.07, type = 'square', v = 0.05, slide = 0) => {
        if (!on) return;
        try {
            ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = type; o.frequency.setValueAtTime(f, ctx.currentTime);
            if (slide) o.frequency.linearRampToValueAtTime(f + slide, ctx.currentTime + d);
            g.gain.setValueAtTime(v, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d);
            o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + d);
        } catch { /* abaikan */ }
    };
    btn.addEventListener('click', () => { on = !on; store.set('cnc-sound', on ? '1' : '0'); paint(); beep(880, 0.08); });
    return {
        click: () => beep(520, 0.05), hover: () => beep(1200, 0.02, 'square', 0.015),
        ok: () => { beep(660, 0.07); setTimeout(() => beep(990, 0.1), 70); },
        bad: () => beep(180, 0.25, 'sawtooth', 0.06, -80),
        start: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.12), i * 90)); },
    };
})();

/* ------------------------------------------------------------------
   Toast
   ------------------------------------------------------------------ */
function toast(text, kind = '', ms = 2600) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`; el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

/* ------------------------------------------------------------------
   Event log (+ PHP backend api/log.php)
   ------------------------------------------------------------------ */
const logEl = $('#log');
function addLog(type, msg, { persist = false, time = null } = {}) {
    const li = document.createElement('li');
    const t = time ? hms(new Date(time * 1000)) : hms();
    li.innerHTML = `<time>${t}</time><span class="t-${type}"></span>`;
    li.lastChild.textContent = msg;
    logEl.prepend(li);
    while (logEl.children.length > 80) logEl.lastChild.remove();
    if (persist) {
        fetch('api/log.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, msg }) }).catch(() => {});
    }
}
$('#btnClearLog').addEventListener('click', () => {
    logEl.innerHTML = '';
    fetch('api/log.php?clear=1', { method: 'POST' }).catch(() => {});
    toast('Log dihapus');
});

/* ------------------------------------------------------------------
   Loader / boot
   ------------------------------------------------------------------ */
const boot = (() => {
    const steps = { assets: 0, three: 0, world: 0, log: 0, mqtt: 0 };
    const W = { assets: 15, three: 25, world: 30, log: 10, mqtt: 20 };
    const bar = $('#bootBar'), pct = $('#bootPct');
    const tips = [
        'TIP: spindle dianggap RUN saat status Run atau MPos/WPos berubah.',
        'TIP: seret mouse pada digital twin untuk memutar kamera.',
        'TIP: klik kartu topic di INFO untuk menyalin nama topic.',
        'TIP: tombol DEMO mensimulasikan data jika mesin belum online.',
        'TIP: jalur tembaga di PCB 3D tergerus mengikuti pahat saat RUN.',
        'TIP: setelah START, pahat menuju tengah PCB lalu mengikuti koordinat X Y Z.',
    ];
    let ti = 0;
    $('#bootTip').textContent = tips[0];
    const tipTimer = setInterval(() => { ti = (ti + 1) % tips.length; $('#bootTip').textContent = tips[ti]; }, 2200);
    const li = (k) => $(`#bootSteps li[data-s="${k}"]`);
    const render = () => {
        const total = Object.keys(W).reduce((a, k) => a + W[k] * steps[k], 0);
        bar.style.width = total.toFixed(0) + '%'; pct.textContent = total.toFixed(0) + '%';
    };
    return {
        start(k) { li(k).className = 'doing'; },
        prog(k, f) { steps[k] = clamp(f, 0, 1); render(); },
        done(k, ok = true) { steps[k] = 1; li(k).className = ok ? 'done' : 'fail'; render(); },
        async finish() {
            clearInterval(tipTimer);
            const btn = $('#btnStart');
            btn.hidden = false;
            let left = 3;
            btn.textContent = `▶ PRESS START (${left})`;
            await new Promise((resolve) => {
                const go = () => { clearInterval(iv); window.removeEventListener('keydown', onKey); btn.removeEventListener('click', go); resolve(); };
                const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') go(); };
                const iv = setInterval(() => { left--; btn.textContent = `▶ PRESS START (${left})`; if (left <= 0) go(); }, 1000);
                btn.addEventListener('click', go); window.addEventListener('keydown', onKey);
            });
            sfx.start();
            $('#boot').classList.add('out');
            document.body.classList.remove('booting');
            setTimeout(() => $('#boot').remove(), 600);
        },
    };
})();

/* ------------------------------------------------------------------
   State aplikasi
   ------------------------------------------------------------------ */
const SP = CFG.spindle;
const state = {
    status: '---', statusKind: 'idle', online: null,
    lastMsgAt: 0, msgs: 0, runSec: 0, demo: false,
    stamps: [], hist: [], mqtt: 'off',
    mpos: null, wpos: null, lastMoveAt: 0,     // posisi terakhir & kapan terakhir berubah
    posMoved: false, twinPhase: 'home', twinLimit: [],   // status gerak twin: home / center / track, sumbu di luar jangkauan
    rpmReported: null,                          // RPM dari ESP/GRBL (FS: / S:) bila ada
    spindleOn: false, rpmTarget: 0, rpm: 0, rpmPeak: 0,
};
let twin = null;

const classify = (s) => {
    const t = String(s).toLowerCase();
    if (/alarm|error|estop|door|fault|emerg/.test(t)) return 'alarm';
    if (/run|cycle|busy|milling|cutting/.test(t)) return 'run';
    if (/hold|pause/.test(t)) return 'hold';
    if (/idle|ready|standby/.test(t)) return 'idle';
    return 'other';
};
const textOf = (raw) => {
    const s = String(raw).trim();
    try { const j = JSON.parse(s); if (typeof j === 'string') return j; if (j && typeof j === 'object') return String(j.status ?? j.state ?? j.value ?? s); } catch { /* teks biasa */ }
    return s.replace(/^"|"$/g, '');
};
const popNum = (el) => { el.classList.remove('num-pop'); void el.offsetWidth; el.classList.add('num-pop'); };

const push = () => {   // dipanggil tiap ada pesan
    state.lastMsgAt = Date.now(); state.msgs++; state.stamps.push(state.lastMsgAt);
    $('#waiting').classList.add('hide');
};

/* Parser status GRBL. Contoh yang dikenali:
     Run,MPos:59.196,-13.344,22.600,WPos:33.196,-23.344,-2.400,Ln:0
     <Run|MPos:59.1,-13.3,22.6|WPos:33.1,-23.3,-2.4|FS:500,12000>
     Hold   |   MPos:59.628,-13.344,22.600,WPos:33.628,-23.344,-2.400 (tanpa nama status) */
const NUM = '(-?\\d+(?:\\.\\d+)?)';
const vecRe = (k) => new RegExp(`${k}\\s*:\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}`, 'i');
const RE_MPOS = vecRe('MPos'), RE_WPOS = vecRe('WPos');
const RE_RPM = /(?:FS\s*:\s*[\d.]+\s*,\s*|\bS\s*:\s*|\bRPM\s*:\s*|\bSpindle\s*:\s*)(\d+(?:\.\d+)?)/i;
const FIELD = /^(MPos|WPos|WCO|FS|Ln|Bf|Ov|Pn|S|RPM)$/i;
function parseStatus(txt) {
    const vec = (re) => { const m = txt.match(re); return m ? [+m[1], +m[2], +m[3]] : null; };
    const w = txt.match(/^[\s<]*([A-Za-z]+)/), r = txt.match(RE_RPM);
    return { name: w && !FIELD.test(w[1]) ? w[1] : null, mpos: vec(RE_MPOS), wpos: vec(RE_WPOS), rpm: r ? +r[1] : null };
}
const same3 = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.0005);

function onStatus(raw) {
    const p = parseStatus(textOf(raw)), now = Date.now();

    if (p.name) {                                   // nama status (Idle/Run/Hold/...)
        const kind = classify(p.name), changed = p.name !== state.status;
        state.status = p.name; state.statusKind = kind;
        $('#vStatus').textContent = p.name.toUpperCase(); if (changed) popNum($('#vStatus'));
        $('#cardStatus').dataset.state = kind;
        $('#statusFoot').textContent = ({ idle: 'Mesin siaga', run: 'Sedang bekerja', hold: 'Ditahan (feed hold)', alarm: '⚠ Perlu UNLOCK / RESET', other: 'Mode khusus' })[kind];
        twin?.set({ status: kind, text: p.name });
        banner();
        if (changed) {                              // log hanya saat status BERUBAH (bukan tiap pesan)
            addLog(kind === 'alarm' ? 'alarm' : 'status', `Status → ${p.name}`, { persist: !state.demo });
            if (kind === 'alarm') { sfx.bad(); toast(`ALARM: ${p.name}`, 'bad', 4000); }
            else if (kind === 'run') { sfx.ok(); toast('Mesin mulai RUN', 'good'); }
        }
    }
    if (p.rpm !== null) state.rpmReported = p.rpm;
    if (p.mpos || p.wpos) onPosition(p, now);
    updateSpindle(now);
}

/* MPos = posisi aktual mesin, WPos = posisi relatif titik nol kerja.
   Dua-duanya masuk ke digital twin; perubahan nilainya dipakai untuk mendeteksi spindle RUN. */
function onPosition({ mpos, wpos }, now) {
    let moved = false;
    if (mpos) { if (state.mpos && !same3(mpos, state.mpos)) moved = true; state.mpos = mpos; }
    if (wpos) { if (state.wpos && !same3(wpos, state.wpos)) moved = true; state.wpos = wpos; }
    if (moved) state.lastMoveAt = now;
    ['X', 'Y', 'Z'].forEach((a, i) => {
        if (state.mpos) $(`#m${a}`).textContent = state.mpos[i].toFixed(3);
        if (state.wpos) $(`#w${a}`).textContent = state.wpos[i].toFixed(3);
        if (state.mpos) $(`#h${a}`).textContent = state.mpos[i].toFixed(1);
    });
    state.posMoved = moved; paintPosFoot();
    twin?.set({ mpos: state.mpos, wpos: state.wpos });
}

/* Teks kecil di kartu POSISI: fase twin, gerak/diam, dan peringatan bila posisi dipotong batas model */
function paintPosFoot() {
    const el = $('#posFoot');
    if (state.twinPhase === 'center') { el.textContent = 'Twin menuju titik tengah…'; return; }
    if (!state.mpos && !state.wpos) { el.textContent = 'Belum ada MPos / WPos'; return; }
    let t = state.posMoved ? 'Bergerak' : 'Diam';
    if (state.twinLimit.length) t += ' · ' + state.twinLimit.join('') + ' di luar jangkauan model';
    el.textContent = t;
}

/* Spindle RUN  = status "Run"  ATAU  MPos/WPos berubah dalam moveTimeout ms terakhir.
   Jika ESP mengirim RPM (FS:/S:), nilai itu dipakai & menentukan ON/OFF. Alarm / data basi / offline => OFF. */
function updateSpindle(now = Date.now()) {
    const fresh = state.lastMsgAt && (now - state.lastMsgAt) < CFG.twin.staleAfter * 1000;
    const moving = (now - state.lastMoveAt) < SP.moveTimeout;
    let on;
    if (!fresh || state.online === false || state.statusKind === 'alarm') on = false;
    else if (state.rpmReported !== null) on = state.rpmReported > 0;
    else on = state.statusKind !== 'alarm' && (state.statusKind === 'run' || moving);
    state.spindleOn = on;
    state.rpmTarget = on ? (state.rpmReported ?? SP.rpmNominal) : 0;
}

/* Animasi naik/turun RPM (inersia spindle) + kartu + HUD — 12x per detik */
function tickRpm() {
    const d = state.rpmTarget - state.rpm;
    state.rpm = Math.abs(d) < 40 ? state.rpmTarget : state.rpm + d * (d > 0 ? 0.3 : 0.25);
    state.rpmPeak = Math.max(state.rpmPeak, state.rpm);
    const r = Math.round(state.rpm), on = state.spindleOn, frac = clamp(state.rpm / SP.rpmMax, 0, 1);
    $('#vRpm').textContent = r.toLocaleString('id-ID');
    $('#mRpm').style.width = (frac * 100) + '%';
    $('#hR').textContent = r > 0 ? `${r} RPM` : 'OFF';
    const card = $('#cardSpindle');
    card.dataset.state = on ? 'on' : (r > 0 ? 'down' : 'off');
    card.style.setProperty('--spin-dur', (0.9 - 0.65 * frac).toFixed(2) + 's');
    $('#rpmSrc').textContent = on ? (state.rpmReported !== null ? 'GRBL' : 'EST.') : '---';
    $('#rpmFoot').textContent = on
        ? (state.rpmReported !== null ? 'Spindle ON — RPM dari mesin' : `Spindle ON — estimasi ${SP.rpmNominal.toLocaleString('id-ID')} rpm`)
        : (r > 0 ? 'Spindle melambat…' : 'Spindle OFF — menunggu RUN');
    twin?.set({ rpm: state.rpm, spindleOn: on });
}
setInterval(tickRpm, 80);

function onOnline(raw) {
    const t = textOf(raw).toLowerCase();
    const on = ['online', '1', 'true', 'on'].includes(t);
    const changed = state.online !== on;
    state.online = on;
    $('#ledEsp').className = 'led ' + (on ? 'ok' : 'bad'); $('#txtEsp').textContent = on ? 'ONLINE' : 'OFFLINE';
    twin?.set({ online: on });
    banner();
    if (changed) { addLog('online', `Mesin ${on ? 'ONLINE' : 'OFFLINE'}`, { persist: !state.demo }); toast(`Mesin ${on ? 'online' : 'offline'}`, on ? 'good' : 'warn'); on ? sfx.ok() : sfx.bad(); }
}

function banner() {
    const b = $('#banner');
    let msg = '', cls = '';
    if (state.online === false) { msg = 'MESIN OFFLINE'; cls = 'alarm'; }
    else if (state.statusKind === 'alarm') { msg = '⚠ ' + state.status.toUpperCase(); cls = 'alarm'; }
    else if (state.statusKind === 'hold') { msg = '⏸ HOLD'; }
    if (!msg) { b.hidden = true; return; }
    if (b.textContent !== msg) { b.hidden = false; b.className = 'banner ' + cls; b.textContent = msg; }
}

const handlers = { status: onStatus, online: onOnline };

/* ------------------------------------------------------------------
   MQTT
   ------------------------------------------------------------------ */
let client = null;
const setMqtt = (s) => {
    state.mqtt = s;
    const m = { on: ['ok', 'CONNECTED'], conn: ['warn', 'CONNECTING'], off: ['bad', 'OFFLINE'], err: ['bad', 'ERROR'] }[s] || ['', '---'];
    $('#ledMqtt').className = 'led ' + m[0]; $('#txtMqtt').textContent = m[1];
};
function connectMqtt() {
    return new Promise((resolve) => {
        if (typeof mqtt === 'undefined') { setMqtt('err'); addLog('system', 'Library MQTT tidak termuat'); return resolve(false); }
        const secure = location.protocol === 'https:';
        const m = CFG.mqtt;
        const url = `${secure ? 'wss' : 'ws'}://${m.host}:${secure ? m.wssPort : m.wsPort}${m.path}`;
        setMqtt('conn');
        addLog('system', `Menghubungkan ${url}`);
        const opts = { clientId: 'cncweb_' + Math.random().toString(16).slice(2, 10), clean: true, reconnectPeriod: 2500, connectTimeout: 8000, keepalive: 30 };
        if (m.user) { opts.username = m.user; opts.password = m.pass; }
        let settled = false;
        const finish = (ok) => { if (!settled) { settled = true; resolve(ok); } };
        client = mqtt.connect(url, opts);
        client.on('connect', () => {
            setMqtt('on');
            const subs = ['status', 'online'].map(k => CFG.topics[k]);
            client.subscribe(subs, { qos: 0 }, (err) => {
                if (err) { addLog('system', 'Gagal subscribe'); toast('Gagal subscribe topic', 'bad'); }
                else addLog('system', `Subscribe ${subs.length} topic`);
            });
            toast('MQTT terhubung', 'good'); finish(true);
        });
        client.on('reconnect', () => setMqtt('conn'));
        client.on('close', () => { if (state.mqtt === 'on') addLog('system', 'Koneksi MQTT terputus'); setMqtt('off'); });
        client.on('error', (e) => { setMqtt('err'); addLog('system', 'MQTT error: ' + (e?.message || e)); finish(false); });
        client.on('message', (topic, payload) => {
            if (state.demo) return;
            const key = Object.keys(CFG.topics).find(k => CFG.topics[k] === topic);
            if (!key || !handlers[key]) return;
            push(); handlers[key](payload.toString());
        });
        setTimeout(() => finish(false), 6000);
    });
}

/* ------------------------------------------------------------------
   Demo (simulasi data) — meniru ESP: mengirim string status GRBL berisi MPos/WPos
   ------------------------------------------------------------------ */
const DEMO_WCO = [26, 10, 25];                       // MPos - WPos (sama seperti contoh data)
const DEMO_STEP = 7;                                 // mm per tick
const DEMO_STEPS = (() => {
    // koordinat kerja berpusat di tengah PCB (WPos 0,0 = tengah papan): X -140..140, Y -50..50
    const st = [{ wait: 10, st: 'Idle' }, { go: [-140, -50, 5] }, { go: [-140, -50, -0.3] }];
    for (let r = 0; r < 5; r++) {
        const y = -50 + r * 25, x1 = r % 2 ? -140 : 140;
        st.push({ go: [x1, y, -0.3] });
        if (r === 2) st.push({ wait: 14, st: 'Hold' });
        if (r < 4) st.push({ go: [x1, y + 25, -0.3] });
    }
    st.push({ go: [140, 50, 5] }, { go: [0, 0, 5] }, { wait: 40, st: 'Idle' }, { wait: 22, st: 'Alarm' }, { wait: 14, st: 'Idle' });
    return st;
})();
const demo = { timer: null, i: 0, wait: 0, w: [0, 0, 5], n: 0 };
const f3 = (v) => v.toFixed(3);
function demoLine(name, w) {
    const m = w.map((v, i) => v + DEMO_WCO[i]);
    return `${name},MPos:${m.map(f3).join(',')},WPos:${w.map(f3).join(',')},Ln:0`;
}
function demoTick() {
    const st = DEMO_STEPS[demo.i];
    let line;
    if (st.go) {
        const d = st.go.map((v, i) => v - demo.w[i]), len = Math.hypot(...d);
        if (len <= DEMO_STEP) { demo.w = [...st.go]; demo.i = (demo.i + 1) % DEMO_STEPS.length; }
        else demo.w = demo.w.map((v, i) => v + d[i] / len * DEMO_STEP);
        line = demoLine('Run', demo.w);
    } else {
        if (demo.wait === 0) demo.wait = st.wait;
        line = (st.st === 'Idle') ? demoLine('Idle', demo.w) : st.st;       // Hold/Alarm tanpa koordinat, seperti ESP asli
        if (--demo.wait <= 0) { demo.wait = 0; demo.i = (demo.i + 1) % DEMO_STEPS.length; }
    }
    push(); onStatus(line);
    if (++demo.n % 10 === 1) onOnline('online');
}
function setDemo(on) {
    state.demo = on; $('#btnDemo').classList.toggle('on', on);
    clearInterval(demo.timer);
    twin?.recalibrate();
    state.mpos = state.wpos = null; state.lastMoveAt = 0; state.rpmReported = null;
    if (on) {
        Object.assign(demo, { i: 0, wait: 0, w: [0, 0, 5], n: 0 });
        twin?.clearPcb();
        demo.timer = setInterval(demoTick, 200); demoTick();
        addLog('system', 'Mode DEMO aktif'); toast('DEMO: data simulasi', 'warn');
    } else {
        addLog('system', 'Mode DEMO nonaktif'); toast('DEMO dimatikan');
        state.lastMsgAt = 0; state.online = null; state.status = '---';
        $('#ledEsp').className = 'led'; $('#txtEsp').textContent = '---'; $('#vStatus').textContent = '---';
        twin?.set({ online: null, hasData: false, status: 'idle' }); banner();
    }
}
$('#btnDemo').addEventListener('click', () => { sfx.click(); setDemo(!state.demo); });

/* ------------------------------------------------------------------
   Sync / stale / jam / statistik (loop ringan 4x per detik)
   ------------------------------------------------------------------ */
const syncBox = $('.sync');
setInterval(() => {
    const now = Date.now();
    $('#clock').textContent = hms();
    const age = state.lastMsgAt ? (now - state.lastMsgAt) / 1000 : Infinity;
    const lim = CFG.twin.staleAfter;
    if (!isFinite(age)) {
        syncBox.classList.add('is-waiting'); syncBox.classList.remove('stale');
        $('#syncTxt').textContent = 'MENUNGGU DATA'; $('#syncBar').style.width = '0%';
    } else {
        syncBox.classList.remove('is-waiting');
        syncBox.classList.toggle('stale', age > lim);
        $('#syncTxt').textContent = age > lim ? `BASI ${Math.floor(age)}s` : `LIVE ${age.toFixed(0)}s`;
        $('#syncBar').style.width = clamp(age / lim * 100, 4, 100) + '%';
        if (age > lim * 2.5 && !state.demo) $('#waiting').classList.remove('hide');
    }
    twin?.set({ hasData: age < lim * 2.5 });
    updateSpindle(now);
    // statistik
    state.stamps = state.stamps.filter(t => now - t < 10000);
    $('#vMsgs').textContent = state.msgs; $('#vRate').textContent = (state.stamps.length / 10).toFixed(1);
    $('#vPeak').textContent = Math.round(state.rpmPeak).toLocaleString('id-ID');
    if (state.spindleOn) state.runSec += 0.25;
    $('#vRun').textContent = `${pad(Math.floor(state.runSec / 60))}:${pad(Math.floor(state.runSec % 60))}`;
    $('#chartInfo').textContent = state.hist.length ? `${Math.round(state.rpm)} rpm` : '— rpm';
}, 250);

/* ------------------------------------------------------------------
   Grafik pixel riwayat spindle RPM (1 batang = 0,5 detik)
   ------------------------------------------------------------------ */
const chart = $('#chart'), cg = chart.getContext('2d');
chart.width = 240; chart.height = 45;
function drawChart() {
    cg.fillStyle = '#0a1020'; cg.fillRect(0, 0, 240, 45);
    cg.fillStyle = '#1b2650';
    for (let y = 8; y < 45; y += 11) for (let x = 0; x < 240; x += 4) cg.fillRect(x, y, 2, 1);
    const h = state.hist, n = Math.min(h.length, 60);
    for (let i = 0; i < n; i++) {
        const v = h[h.length - n + i];
        const bh = v > 0 ? Math.max(1, Math.round(clamp(v / SP.rpmMax, 0, 1) * 40)) : 0;
        const x = 240 - (n - i) * 4;
        cg.fillStyle = i === n - 1 ? '#ffd84a' : '#5dff8a';
        cg.fillRect(x, 44 - bh, 3, bh);
        cg.fillStyle = '#ffffff55'; if (bh) cg.fillRect(x, 44 - bh, 3, 1);
    }
}
setInterval(() => {
    if (!state.lastMsgAt) return;                      // belum ada data
    state.hist.push(state.rpm); if (state.hist.length > 120) state.hist.shift();
    drawChart();
}, 500);
drawChart();

/* ------------------------------------------------------------------
   Micro-interaction: tilt card, burst pixel, ripple, tooltip suara
   ------------------------------------------------------------------ */
$$('.tilt').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.transform = `perspective(700px) rotateX(${((0.5 - y) * 8).toFixed(1)}deg) rotateY(${((x - 0.5) * 8).toFixed(1)}deg) translateY(-3px)`;
        card.style.setProperty('--gx', x * 100 + '%'); card.style.setProperty('--gy', y * 100 + '%');
    });
    card.addEventListener('pointerenter', () => sfx.hover());
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
});

const burstStyle = document.createElement('style');
burstStyle.textContent = `.px-burst{position:fixed;width:6px;height:6px;pointer-events:none;z-index:97;animation:burst .5s steps(6) forwards}
@keyframes burst{to{transform:translate(var(--dx),var(--dy));opacity:0}}`;
document.head.appendChild(burstStyle);
function burst(x, y, colors = ['#ffd84a', '#4ee1ff', '#5dff8a', '#ff9a3c']) {
    for (let i = 0; i < 8; i++) {
        const p = document.createElement('i'); p.className = 'px-burst';
        const a = (i / 8) * Math.PI * 2, d = 24 + Math.random() * 22;
        p.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
        document.body.appendChild(p); setTimeout(() => p.remove(), 520);
    }
}
document.addEventListener('pointerdown', (e) => { const b = e.target.closest('.pxbtn, .tab, .copy'); if (b) { burst(e.clientX, e.clientY); sfx.click(); } });
$$('.pxbtn').forEach(b => b.addEventListener('pointerenter', () => sfx.hover()));

/* ------------------------------------------------------------------
   Modal info, tab, copy
   ------------------------------------------------------------------ */
const modal = $('#modal');
const openModal = () => { modal.hidden = false; };
const closeModal = () => { modal.hidden = true; };
$('#btnInfo').addEventListener('click', openModal);
$$('[data-close]', modal).forEach(el => el.addEventListener('click', closeModal));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
$$('.tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
    $$('.tabpane').forEach(p => p.classList.toggle('active', p.id === tab.dataset.tab));
}));
$$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Disalin: ' + b.dataset.copy, 'good'); }
    catch { toast('Gagal menyalin', 'bad'); }
}));

/* ------------------------------------------------------------------
   Kamera digital twin
   ------------------------------------------------------------------ */
$$('[data-cam]').forEach(b => b.addEventListener('click', () => twin?.cam(b.dataset.cam)));
$('#btnClearPcb').addEventListener('click', () => { twin?.clearPcb(); toast('Jalur PCB dibersihkan'); });
$('#btnCenter').addEventListener('click', () => { twin?.toCenter(false); toast('Pahat menuju tengah PCB'); });
$('#btnAuto').addEventListener('click', (e) => { const on = twin?.autoRotate(!twin.isAutoRotate); e.currentTarget.classList.toggle('on', !!on); });
$('#btnFull').addEventListener('click', async () => {
    const el = $('.stage-frame');
    try { document.fullscreenElement ? await document.exitFullscreen() : await el.requestFullscreen(); } catch { /* abaikan */ }
});
document.addEventListener('visibilitychange', () => twin?.pause(document.hidden));

/* ------------------------------------------------------------------
   BOOT SEQUENCE
   ------------------------------------------------------------------ */
(async function main() {
    const t0 = performance.now();
    const minShow = (ms) => sleep(Math.max(0, ms - (performance.now() - t0)));

    // 1. aset & font
    boot.start('assets'); boot.prog('assets', 0.2);
    try { await Promise.race([Promise.all([document.fonts.load('12px PS2P'), document.fonts.load('20px VT')]), sleep(2500)]); } catch { /* lanjut */ }
    boot.prog('assets', 0.8); await sleep(250); boot.done('assets');

    // 2. Three.js
    boot.start('three');
    let mod = null;
    try { mod = await import('./twin.js'); boot.done('three'); }
    catch (e) { console.error(e); boot.done('three', false); toast('Gagal memuat Three.js', 'bad', 5000); }

    // 3. dunia 3D
    boot.start('world');
    if (mod) {
        try {
            twin = await mod.createTwin($('#twin'), {
                onProgress: (f) => boot.prog('world', f), scale: CFG.twin.scale, invert: CFG.twin.invert, origin: CFG.twin.origin,
                startCenter: CFG.twin.startCenter, centerSpeed: CFG.twin.centerSpeed,
                onPhase: (p) => {
                    state.twinPhase = p;
                    if (p === 'center') addLog('system', 'Twin: pahat menuju titik tengah PCB');
                    else if (p === 'track') addLog('system', 'Twin: mengikuti koordinat X Y Z');
                    paintPosFoot();
                },
                onLimit: (axes) => {
                    state.twinLimit = axes; paintPosFoot();
                    if (axes.length) toast(`Di luar jangkauan model: ${axes.join(' ')}`, 'warn', 3200);
                },
            });
            boot.done('world');
        }
        catch (e) { console.error(e); boot.done('world', false); toast('WebGL tidak tersedia / gagal dibuat', 'bad', 6000); }
    } else boot.done('world', false);
    twin?.set({ rpmMax: SP.rpmMax });
    window.CNC3D = { twin, state };

    // 4. riwayat event
    boot.start('log');
    try {
        const r = await fetch('api/log.php?limit=25', { cache: 'no-store' });
        const j = await r.json();
        (j.events || []).forEach(ev => addLog(ev.type, ev.msg, { time: ev.t }));
        boot.done('log');
    } catch { boot.done('log', false); }
    addLog('system', 'Sistem siap');

    // 5. MQTT
    boot.start('mqtt'); boot.prog('mqtt', 0.3);
    const ok = await connectMqtt();
    boot.done('mqtt', ok);
    if (!ok) addLog('system', 'MQTT belum terhubung — mencoba ulang di latar belakang');

    await minShow(2600);
    await boot.finish();
    twin?.resize();
    twin?.toCenter(true);          // mulai dari HOME -> menuju tengah PCB -> mengikuti koordinat
})();
