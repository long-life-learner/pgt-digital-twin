/* =====================================================================
   PIXEL LIFE — game dunia terbuka (Three.js).  Terhubung ke dashboard CNC lewat laptop.
   ===================================================================== */
import { THREE, PI, clamp, damp, lerp, wrapPi, M, bx, grp, glow, tagSprite, pixTex, resolve, addCircle, blockedAt } from './kit.js';
import { buildPerson, buildCat } from './chars.js';
import { buildCar, buildMotor, buildExcavator } from './vehicles.js';
import { buildWorld, WORLD_HALF } from './world.js';
import { Nav, Brain } from './npcai.js';
import { buildAnimals } from './animals.js';
import { Fishing, initCamps } from './activities.js';
import { bgm, whistle } from './bgm.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');
const pick = (a) => a[(Math.random() * a.length) | 0];
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* abaikan */ } } };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

/* ---------------- suara ---------------- */
const audio = (() => {
    let ctx = null, on = store.get('pl-sound', '1') === '1';
    const get = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());
    const beep = (f = 660, d = 0.07, type = 'square', v = 0.04, slide = 0) => {
        if (!on) return; try { const c = get(), o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, c.currentTime); if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, f + slide), c.currentTime + d); g.gain.setValueAtTime(v, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + d); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + d); } catch { /* abaikan */ }
    };
    const noise = (d = 0.25, v = 0.05, f = 1400, type = 'lowpass') => {
        if (!on) return; try { const c = get(), n = Math.floor(c.sampleRate * d), b = c.createBuffer(1, n, c.sampleRate), a = b.getChannelData(0); for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; fl.type = type; fl.frequency.value = f; g.gain.value = v; s.connect(fl).connect(g).connect(c.destination); s.start(); } catch { /* abaikan */ }
    };
    bgm.setMuted(!on);
    const A = {
        beep, noise, get on() { return on; }, set on(v) { on = v; store.set('pl-sound', v ? '1' : '0'); bgm.setMuted(!v); },
        ok: () => { beep(660, 0.07); setTimeout(() => beep(990, 0.1), 70); }, bad: () => beep(180, 0.25, 'sawtooth', 0.05, -80), click: () => beep(520, 0.04),
        meow: () => { beep(700, 0.16, 'triangle', 0.05, 300); setTimeout(() => beep(900, 0.12, 'triangle', 0.04, -200), 120); },
        engine: (sp) => beep(60 + sp * 6, 0.05, 'sawtooth', 0.012),
        get musicOn() { return bgm.enabled; },
        music(v) { bgm.enabled = v; },
        sfx(n) {
            switch (n) {
                case 'ok': A.ok(); break; case 'bad': A.bad(); break; case 'click': A.click(); break;
                case 'bite': beep(320, 0.12, 'sine', 0.08, -160); setTimeout(() => beep(240, 0.1, 'sine', 0.07, -100), 130); break;
                case 'splash': noise(0.35, 0.09, 1900); break; case 'whoosh': noise(0.28, 0.05, 900, 'bandpass'); break;
                case 'woof': beep(230, 0.09, 'square', 0.06, -90); setTimeout(() => beep(200, 0.1, 'square', 0.06, -80), 140); break;
                case 'cluck': beep(900, 0.05, 'square', 0.03); setTimeout(() => beep(760, 0.05, 'square', 0.03), 70); break;
                case 'moo': beep(130, 0.7, 'sawtooth', 0.04, -30); break; case 'baa': beep(420, 0.45, 'sawtooth', 0.035, -70); break;
                case 'quack': beep(520, 0.09, 'square', 0.04, -130); setTimeout(() => beep(480, 0.08, 'square', 0.04, -100), 120); break;
                case 'squeak': beep(1700, 0.05, 'sine', 0.03); break; case 'meow': A.meow(); break;
                case 'hammer': beep(170, 0.06, 'square', 0.06, -90); noise(0.08, 0.05, 2500); break;
                default: A.click();
            }
        },
    };
    return A;
})();

/* ---------------- toast ---------------- */
function toast(t, kind = '', ms = 2400) {
    const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = t; $('#toasts').appendChild(el);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

/* ---------------- loader ---------------- */
const boot = (() => {
    const W = { assets: 15, world: 55, actors: 20, save: 10 }, st = { assets: 0, world: 0, actors: 0, save: 0 };
    const li = (k) => $(`#bootSteps li[data-s="${k}"]`);
    const render = () => { const t = Object.keys(W).reduce((a, k) => a + W[k] * st[k], 0); $('#bootBar').style.width = t + '%'; $('#bootPct').textContent = Math.round(t) + '%'; };
    const tips = ['TIP: tekan E untuk berinteraksi dengan benda, hewan, dan orang.', 'TIP: duduk di kursi meja kerja lalu buka laptop untuk melihat dashboard CNC.', 'TIP: Abu dan Jemoy bisa diajak mengikutimu — elus mereka dulu!', 'TIP: tekan L saat berkendara untuk menyalakan lampu.', 'TIP: ekskavator digali dengan tombol Spasi.', 'TIP: tekan V atau 1–5 untuk ganti kamera — coba 3 untuk pandangan dari mata karakter.', 'TIP: pancing ikan di dermaga danau; karakter akan bersiul saat menunggu.', 'TIP: dirikan tenda di petak kemah dekat danau lalu nyalakan api unggun.'];
    let i = 0; const tt = setInterval(() => { $('#bootTip').textContent = tips[++i % tips.length]; }, 2200); $('#bootTip').textContent = tips[0];
    return {
        start: (k) => { li(k).className = 'doing'; }, prog: (k, f) => { st[k] = clamp(f, 0, 1); render(); }, done: (k, ok = true) => { st[k] = 1; li(k).className = ok ? 'done' : 'fail'; render(); },
        async finish() {
            clearInterval(tt); const btn = $('#btnStart'); btn.hidden = false; let left = 3; btn.textContent = `▶ PRESS START (${left})`;
            await new Promise((res) => { const go = () => { clearInterval(iv); removeEventListener('keydown', kd); btn.removeEventListener('click', go); res(); }; const kd = (e) => { if (e.key === 'Enter' || e.key === ' ') go(); }; const iv = setInterval(() => { left--; btn.textContent = `▶ PRESS START (${left})`; if (left <= 0) go(); }, 1000); btn.addEventListener('click', go); addEventListener('keydown', kd); });
            $('#boot').classList.add('out'); document.body.classList.remove('booting'); setTimeout(() => $('#boot').remove(), 600);
        },
    };
})();

/* =====================================================================
   DATA
   ===================================================================== */
const TIME_RATE = 2;                                   // menit game per detik nyata
const DEFAULT = () => ({
    stats: { hunger: 75, thirst: 75, energy: 90, clean: 85, happy: 70 },
    inv: { bahan: 0, meal: 0, water: 1, bungkus: 0, kopi: 0, clean: 2, dirty: 1, ikan: 0, ikanbakar: 0, telur: 0, susu: 0, kue: 0, jajan: 0 },
    coins: 30, time: 9 * 60, day: 1, lamps: { dapur: false, tamu: false, kamar: false, teras: false }, tv: false, hasTablet: false, photos: 0, flags: {},
    quests: { masak: { s: 'new', p: 0 }, mobil: { s: 'new', p: 0 }, gali: { s: 'new', p: 0 }, kucing: { s: 'new', p: 0, set: [] }, mancing: { s: 'new', p: 0 }, kemah: { s: 'new', p: 0 } },
    pos: null, follow: { abu: false, jemoy: false, bruno: false }, caught: 0, pets: {}, friend: {},
});
let S = DEFAULT();
try { const sv = JSON.parse(store.get('pixlife-v2', 'null')); if (sv && sv.stats) { S = { ...DEFAULT(), ...sv, stats: { ...DEFAULT().stats, ...sv.stats }, inv: { ...DEFAULT().inv, ...sv.inv }, lamps: { ...DEFAULT().lamps, ...sv.lamps }, quests: { ...DEFAULT().quests, ...sv.quests }, follow: { ...DEFAULT().follow, ...(sv.follow || {}) } }; } } catch { /* mulai baru */ }

const QUESTS = {
    masak: { giver: 'Mang Ujang', title: 'Masakan untuk Mang Ujang', desc: 'Masak nasi goreng di dapur rumahmu, lalu serahkan ke Mang Ujang di ladang.', goal: 1, reward: 25 },
    mobil: { giver: 'Pak Budi', title: 'Tes Mobil', desc: 'Kendarai mobilmu sampai depan Bengkel Budi.', goal: 1, reward: 30 },
    gali: { giver: 'Kang Asep', title: 'Gali Tanah', desc: 'Naiki ekskavator di area konstruksi dan gali 5 kali (tekan Spasi).', goal: 5, reward: 40 },
    kucing: { giver: 'Dina', title: 'Sayangi Kucing', desc: 'Elus Abu dan Jemoy, kucing kesayanganmu.', goal: 2, reward: 15 },
    mancing: { giver: 'Joko', title: 'Hobi Memancing', desc: 'Pergi ke dermaga danau (atau tepi pantai), pancing 3 ekor ikan. Tekan E saat ikan makan umpan!', goal: 3, reward: 35 },
    kemah: { giver: 'Sinta', title: 'Dirikan Tenda', desc: 'Bangun tenda sendiri di area perkemahan dekat danau (tekan E di petak kemah).', goal: 1, reward: 40 },
};
const ITEMS = { bahan: ['🥬', 'Bahan masak'], meal: ['🍛', 'Nasi goreng'], bungkus: ['🍱', 'Nasi bungkus'], ikanbakar: ['🍢', 'Ikan bakar'], kue: ['🍰', 'Kue'], jajan: ['🍪', 'Camilan'], water: ['🥤', 'Air botol'], kopi: ['☕', 'Kopi'], susu: ['🥛', 'Susu segar'], ikan: ['🐟', 'Ikan segar'], telur: ['🥚', 'Telur'] };
const EATABLE = ['meal', 'bungkus', 'ikanbakar', 'kue', 'jajan'], DRINKABLE = ['water', 'kopi', 'susu'];

/* =====================================================================
   RENDERER & SCENE
   ===================================================================== */
let PS = +store.get('pl-ps', '3');
const canvas = $('#gc');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x8fc8ff, 70, 240);
const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 800);
const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a5a40, 1.3); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 140 }); sun.shadow.bias = -0.0006; scene.add(sun, sun.target);
const headlight = new THREE.SpotLight(0xfff2c0, 0, 40, 0.55, 0.4, 1.2); scene.add(headlight, headlight.target);
function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(Math.ceil(w / PS), Math.ceil(h / PS), false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(canvas);

/* =====================================================================
   BOOT: bangun dunia
   ===================================================================== */
boot.start('assets'); boot.prog('assets', 0.3);
try { await Promise.race([Promise.all([document.fonts.load('12px PS2P'), document.fonts.load('20px VT')]), sleep(2500)]); } catch { /* lanjut */ }
boot.done('assets');
boot.start('world'); await nextFrame();
const W = buildWorld(scene); boot.prog('world', 0.8); await nextFrame();
const { spots, mats, house } = W;
boot.done('world');

/* ---------------- aktor ---------------- */
boot.start('actors'); await nextFrame();
const hero = buildPerson({ shirt: 0x4b7bec, pants: 0x2f3b5a, hair: 0x2a1a10, hat: null });
scene.add(hero.root);
const P = { x: 0, z: -3.2, yaw: PI, vx: 0, vz: 0, phase: 0, sit: null, veh: null, busy: null, speed: 0, run: false };
if (S.pos && Number.isFinite(S.pos.x)) { P.x = S.pos.x; P.z = S.pos.z; P.yaw = S.pos.yaw || PI; }

/* kendaraan */
const V = [];
const mkVeh = (b, sp) => { const v = Object.assign(b, { x: sp.x, z: sp.z, yaw: sp.yaw, speed: 0, steer: 0, lights: false, occ: false, home: { ...sp } }); scene.add(v.root); V.push(v); return v; };
const car = mkVeh(buildCar(0xd9344a), spots.vehicles.car), motor = mkVeh(buildMotor(0x2f9e6e), spots.vehicles.motor), exca = mkVeh(buildExcavator(), spots.vehicles.excavator);
exca.speedFwd = 0;

/* NPC — setiap warga punya otak sendiri (npcai.js): kebutuhan, jadwal, aktivitas, ngobrol, mancing, camping */
const NPC_DEF = [
    { id: 'madi', name: 'Cak Madi', role: 'Penjaga Warung Madura', shop: 'madura', look: { shirt: 0x2f9e4a, pants: 0x2b2f3c, hair: 0x222222, hat: 0x15151a },
      lines: ['Selamat datang di Warung Madura, buka 24 jam! Mau cari apa, Kak?', 'Kalau malam-malam lapar, ke sini saja. Warung ini tidak pernah tutup.', 'Gas, galon, telur, mie, semua ada. Ikan hasil pancingan juga kubeli.'], small: ['Warung buka 24 jam, rezeki jalan terus.'] },
    { id: 'rina', name: 'Rina', role: 'Barista Kafe Pixel', shop: 'kafe', shift: [8, 22], look: { shirt: 0x35d0c0, pants: 0x2b2f3c, hair: 0x7a3a8a, long: true },
      lines: ['Kopi di sini diseduh pelan-pelan, biar rasanya pas.', 'Duduk saja di kafe, nanti kuantar kuenya.', 'Kamu sudah coba pakai laptop di rumahmu? Katanya ada dashboard mesin CNC.'], small: ['Latte art-ku makin rapi lho.'] },
    { id: 'budi', name: 'Pak Budi', role: 'Mekanik Bengkel', shop: 'bengkel', shift: [7, 17], modes: ['pick', 'idle'], look: { shirt: 0x3a7ac2, pants: 0x2b2f3c, hair: 0x222222, hat: 0xf2b705 },
      lines: ['Mesin itu seperti kucing: kalau dirawat, dia manja.', 'Mobilmu bagus. Jangan lupa lampu dinyalakan kalau malam, tekan L.', 'Di bengkel ini aku merawat motor dan mobil warga sejak lama.'], small: ['Oli bagus bikin mesin awet.'] },
    { id: 'tika', name: 'Mbak Tika', role: 'Kasir Minimart', shop: 'mart', look: { shirt: 0xe8453c, pants: 0x2b2f3c, hair: 0x2a1a10, long: true },
      lines: ['Selamat datang di Minimart! Ada camilan, susu, dan bahan masak.', 'Minimart ini buka 24 jam juga lho.', 'Struk? Tenang, semua serba pixel di sini.'], small: ['Stok camilan baru datang tadi.'] },
    { id: 'lurah', name: 'Pak Lurah', role: 'Kepala Desa', shop: 'balai', shift: [8, 16], fish: 0.5, look: { shirt: 0xe8e0d0, pants: 0x2b2f3c, hair: 0x999999, hat: 0x222222 },
      lines: ['Selamat datang di desa pixel kami. Silakan jelajahi, dunia ini luas.', 'Ada danau & pantai di timur laut, ladang di barat laut, dan proyek di barat.', 'Tidur cukup, makan teratur, dan jangan lupa mandi!'], small: ['Balai desa terbuka untuk semua warga.'] },
    { id: 'ujang', name: 'Mang Ujang', role: 'Petani & Peternak', job: 'farm', look: { shirt: 0x8a9a4a, pants: 0x6a5a3a, hair: 0x555555, hat: 0xe8d28a },
      lines: ['Tanah di sini subur. Tanam apa saja tumbuh.', 'Masakan rumah itu paling enak. Kapan-kapan bawakan aku ya.', 'Ayam, kambing dan sapi sehat-sehat. Telur dan susu boleh diambil di ladang!'], small: ['Sapi-sapiku gemuk-gemuk.'] },
    { id: 'asep', name: 'Kang Asep', role: 'Operator Alat Berat', job: 'exca', look: { shirt: 0xf2b705, pants: 0x2b2f3c, hair: 0x222222, hat: 0xf2b705, vest: 0xff7a00 },
      lines: ['Ekskavator itu pakai tuas: maju-mundur, putar kabin, lalu gali dengan Spasi.', 'Proyek ini bangun jalan baru ke gunung.', 'Hati-hati di area proyek, pakai helm!'], small: ['Tanah hari ini lumayan keras.'] },
    { id: 'dina', name: 'Dina', role: 'Teman', fish: 0.9, camp: 0.9, look: { shirt: 0xff6fa5, pants: 0x3a4a8a, hair: 0x1a1a2a, long: true },
      lines: ['Hai! Kamu sudah kasih makan Abu dan Jemoy hari ini?', 'Aku suka foto-foto pakai HP. Kamu coba aplikasi kamera deh!', 'Sore-sore enaknya camping di danau!'], small: ['Hari ini cerah ya.'] },
    { id: 'joko', name: 'Joko', role: 'Pemancing', fish: 2, camp: 1, look: { shirt: 0x6a8f3a, pants: 0x4a3f2a, hair: 0x2b1d14, hat: 0xd8c080 },
      lines: ['Sabar kuncinya. Lempar kail, bersiul, tunggu ikannya makan umpan.', 'Pas bobber tenggelam, langsung tarik! Tekan E kalau ikan menyambar.', 'Ikan bakar di api unggun itu juara.'], small: ['Dermaga itu spot paling hoki.'] },
    { id: 'sinta', name: 'Sinta', role: 'Wisatawan', camp: 2, fish: 0.5, look: { shirt: 0xb48cff, pants: 0x2f4a7a, hair: 0x3a2a1a, long: true },
      lines: ['Aku suka camping. Tendanya kupasang sendiri lho!', 'Malam-malam duduk di dekat api unggun itu tenang banget.', 'Kamu sudah pernah mendirikan tenda? Coba di petak kemah dekat danau.'], small: ['Bintang di sini kelihatan jelas.'] },
    { id: 'agus', name: 'Agus', role: 'Warga', look: { shirt: 0xd9344a, pants: 0x3a3a44, hair: 0x1a1a1a }, lines: ['Halo! Jalan-jalan sore itu menyenangkan.', 'Air mancur di taman cantik ya.', 'Kalau lapar, Warung Madura buka 24 jam.'], small: ['Aku suka duduk di taman.'] },
    { id: 'maya', name: 'Maya', role: 'Warga', look: { shirt: 0xffd84a, pants: 0x6a3a5a, hair: 0x5a2a1a, long: true }, lines: ['Hai! Pernah main ke kebun? Hewan-hewannya lucu.', 'Aku sering ngopi di Kafe Pixel.', 'Hidup di desa pixel itu damai.'], small: ['Kafe Pixel kuenya enak.'] },
];
for (const d of NPC_DEF) { d.shift = d.shift || [7, 21]; }
const bubbleFor = (root, y = 2.75) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); sp.renderOrder = 8; sp.visible = false; sp.position.y = y; root.add(sp); let tt = 0;
    const wrap = (txt, n = 22) => { const w = txt.split(' '), L = []; let cur = ''; for (const x of w) { if ((cur + ' ' + x).trim().length > n) { L.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); } if (cur) L.push(cur); return L.slice(0, 4); };
    return {
        show(text, dur = 3.2) {
            const L = wrap(text), c = document.createElement('canvas'), g = c.getContext('2d'); g.font = '20px VT, monospace';
            const w = Math.ceil(Math.max(...L.map(l => g.measureText(l).width))) + 18, h = L.length * 20 + 14; c.width = w; c.height = h + 8;
            g.font = '20px VT, monospace'; g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fffbe8'; g.fillRect(2, 2, w - 4, h - 4);
            g.fillStyle = '#000'; g.fillRect(w / 2 - 4, h, 8, 4); g.fillStyle = '#fffbe8'; g.fillRect(w / 2 - 2, h - 2, 4, 4);
            g.fillStyle = '#1a1a2e'; g.textBaseline = 'middle'; L.forEach((l, i) => g.fillText(l, 9, 7 + 10 + i * 20 + 1));
            const t = pixTex(c); if (sp.material.map) sp.material.map.dispose(); sp.material.map = t; sp.material.needsUpdate = true;
            const k = 0.0115; sp.scale.set(c.width * k, c.height * k, 1); sp.center.set(0.5, 0); sp.position.y = y; sp.visible = true; tt = dur;
        },
        update(dt, near) { if (tt > 0) { tt -= dt; if (tt <= 0) sp.visible = false; } if (sp.visible && !near) sp.visible = false; },
    };
};
const NPC = NPC_DEF.map((d) => {
    const m = buildPerson(d.look); const h = spots.npcHome[d.id] || { x: 0, z: 4 }; scene.add(m.root);
    const tag = tagSprite(d.name, { color: '#ffd84a' }); tag.position.y = 2.25; m.root.add(tag);
    const n = { id: d.id, name: d.name, role: d.role, def: d, m, tag, x: h.x, z: h.z, yaw: Math.random() * 6, vis: true, talking: false, bubble: bubbleFor(m.root) };
    n.say = (text, dur) => n.bubble.show(text, dur); m.root.position.set(n.x, 0, n.z); return n;
});

/* kucing */
const mkCat = (name, opt, start) => {
    const c = buildCat(opt); scene.add(c.root); const tag = tagSprite(name, { color: '#ffb6c1' }); tag.position.y = 0.95; c.root.add(tag);
    return { id: name.toLowerCase(), name, c, x: start.x, z: start.z, yaw: 0, state: 'sleep', timer: 5 + Math.random() * 5, path: [], phase: 0, follow: !!S.follow[name.toLowerCase()], happy: 50, mode: 'sleep', fed: 0 };
};
const abu = mkCat('Abu', { fur: 0x8c93a0, belly: 0xdfe3ea, stripe: 0x6b7280, scale: 1.7 }, spots.catSpots.bed);
const jemoy = mkCat('Jemoy', { fur: 0xf0a850, belly: 0xfff0d8, chubby: 1.3, scale: 1.8, stripe: 0xd98a30 }, spots.catSpots.sofa);
const CATS = [abu, jemoy];
CATS.forEach(k => { k.c.root.position.set(k.x, 0, k.z); });
abu.c.root.position.y = 0.9; jemoy.c.root.position.y = 0.55;
boot.done('actors');

/* partikel */
const FX = []; { const g = new THREE.BoxGeometry(1, 1, 1); for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); m.visible = false; scene.add(m); FX.push({ m, life: 0, vx: 0, vy: 0, vz: 0, g: 0, max: 1 }); } }
let fxi = 0;
const emit = (x, y, z, { color = 0xffffff, size = 0.12, vx = 0, vy = 1, vz = 0, life = 0.8, g = 0, spread = 0.4 } = {}) => {
    const f = FX[fxi++ % FX.length]; f.m.position.set(x, y, z); f.m.scale.setScalar(size); f.m.material.color.setHex(color); f.m.material.opacity = 1; f.m.visible = true;
    f.vx = vx + (Math.random() - 0.5) * spread; f.vy = vy; f.vz = vz + (Math.random() - 0.5) * spread; f.life = f.max = life; f.g = g;
};

/* emote (ikon kecil melayang di atas kepala) */
const emoCache = {};
function emoTex(kind) {
    if (emoCache[kind]) return emoCache[kind];
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
    if (kind === 'heart') {
        const rows = ['.XX..XX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...'];
        g.fillStyle = '#ff4d6d'; rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'X') g.fillRect(4 + x, 4 + y, 1, 1); })); g.fillStyle = '#ff9ab0'; g.fillRect(5, 5, 1, 1);
    } else {
        g.font = 'bold 14px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const m = { zzz: ['Z', '#9bb8ff'], note: ['♪', '#ffd84a'], excl: ['!', '#ff9a3c'], star: ['★', '#ffd84a'], steam: ['~', '#dfe6ff'], coin: ['$', '#ffd84a'], soap: ['o', '#9be7ff'] }[kind] || ['?', '#fff'];
        g.fillStyle = m[1]; g.fillText(m[0], 8, 9);
    }
    return (emoCache[kind] = pixTex(c));
}
const EMO = [];
function emote(kind, x, y, z, life = 1.3) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoTex(kind), transparent: true, depthWrite: false }));
    s.scale.set(0.55, 0.55, 1); s.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3); s.renderOrder = 6;
    scene.add(s); EMO.push({ s, life, max: life, vy: 0.9 + Math.random() * 0.4 });
}
function emoteUpdate(dt) {
    for (let i = EMO.length - 1; i >= 0; i--) { const it = EMO[i]; it.life -= dt; it.s.position.y += it.vy * dt; it.s.material.opacity = clamp(it.life / it.max * 1.6, 0, 1); if (it.life <= 0) { scene.remove(it.s); it.s.material.dispose(); EMO.splice(i, 1); } }
}
/* kabar tentang pemain yang jadi bahan obrolan antar-NPC */
const NEWS = { act: null, h: 0, t: 0 };
const news = (act) => { NEWS.act = act; NEWS.h = (S.time / 60) % 24; NEWS.t = performance.now() / 1000; };

/* =====================================================================
   WAKTU, LANGIT, LAMPU
   ===================================================================== */
const SKY = [[0, 0x070b1a], [4.5, 0x0e1535], [6, 0xe58a5a], [7.5, 0x8fc0f5], [12, 0x8cc8ff], [16.5, 0x8fc0f5], [18, 0xf29a5a], [19.5, 0x2a2a62], [21, 0x090d20], [24, 0x070b1a]];
const tc = new THREE.Color(), tc2 = new THREE.Color();
function skyAt(h) { for (let i = 0; i < SKY.length - 1; i++) { const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1]; if (h >= h0 && h <= h1) return tc.setHex(c0).lerp(tc2.setHex(c1), (h - h0) / (h1 - h0)); } return tc.setHex(SKY[0][1]); }
let nightF = 0;
function applyTime(dt) {
    const h = (S.time / 60) % 24;
    const sky = skyAt(h); scene.background = scene.background || new THREE.Color(); scene.background.copy(sky); scene.fog.color.copy(sky);
    const nTarget = h < 5 || h > 20.5 ? 1 : h > 18 ? (h - 18) / 2.5 : h < 6.5 ? 1 - (h - 5) / 1.5 : 0; nightF = damp(nightF, nTarget, 4, dt);
    const isDay = h >= 6 && h < 18, a = isDay ? (h - 6) / 12 * PI : ((h + 6) % 24) / 12 * PI;
    const dir = new THREE.Vector3(Math.cos(a) * 0.7, Math.max(0.15, Math.sin(a)), 0.55).normalize();
    sun.position.set(Math.round(P.x) + dir.x * 70, dir.y * 70, Math.round(P.z) + dir.z * 70); sun.target.position.set(Math.round(P.x), 0, Math.round(P.z));
    sun.intensity = lerp(2.6 * Math.pow(Math.max(0.15, Math.sin(a)), 0.4), 0.45, nightF);
    sun.color.setHex(isDay && (h < 7.5 || h > 16.5) ? 0xffc890 : isDay ? 0xfff2d8 : 0x8fa8ff);
    hemi.intensity = lerp(1.3, 0.42, nightF); hemi.color.setHex(nightF > 0.5 ? 0x6f86d8 : 0xcfe4ff);
    W.stars.material.opacity = nightF;
    mats.street.color.setHex(nightF > 0.45 ? 0xfff0a0 : 0x555a6a);
    mats.win.color.setHex(nightF > 0.45 ? 0xffd070 : 0x6f98c8);
    const anyLamp = Object.values(S.lamps).some(Boolean);
    mats.houseWin.color.setHex(anyLamp && nightF > 0.2 ? 0xffd070 : nightF > 0.45 ? 0x1a2236 : 0x8fc0f0);
    W.clouds.forEach(c => c.userData.mat.color.setHex(nightF > 0.5 ? 0x3a4070 : 0xffffff));
}
const lampList = Object.values(spots.lamps);
function setLamp(id, on, silent) {
    const L = spots.lamps[id]; if (!L) return; L.on = on; S.lamps[id] = on; L.light.intensity = on ? L.maxI : 0;
    L.mats.forEach(([m, onC, offC]) => m.color.setHex(on ? onC : offC));
    if (!silent) { audio.beep(on ? 880 : 440, 0.05); toast(`${L.name}: ${on ? 'NYALA' : 'MATI'}`, on ? 'good' : ''); }
}
for (const id in S.lamps) setLamp(id, !!S.lamps[id], true);
const hourStr = () => { const m = Math.floor(S.time) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };

/* =====================================================================
   UI: dialog, menu, progress
   ===================================================================== */
let ui = null;                                  // 'dialog'|'phone'|'tablet'|'laptop'|'help'
const dlg = { who: $('#dWho'), txt: $('#dTxt'), ch: $('#dChoices'), box: $('#dialog') };
let dlgChoices = [];
function openDialog({ who, text, choices = [] }) {
    ui = 'dialog'; dlg.box.hidden = false; dlg.who.textContent = who || ''; dlg.txt.textContent = text || '';
    dlg.ch.innerHTML = ''; dlgChoices = choices.concat([{ label: 'Tutup', fn: null }]);
    dlgChoices.forEach((c, i) => {
        const b = document.createElement('button'); b.className = 'pxbtn sm ch' + (c.off ? ' off' : ''); b.innerHTML = `<b>${i + 1}</b> ${c.label}`;
        b.addEventListener('click', () => choose(i)); dlg.ch.appendChild(b);
    });
}
function choose(i) { const c = dlgChoices[i]; if (!c) return; if (c.off) { audio.bad(); toast(c.off, 'bad'); return; } audio.click(); closeDialog(); if (c.fn) c.fn(); }
function closeDialog() { if (ui === 'dialog') ui = null; dlg.box.hidden = true; NPC.forEach(n => { n.talking = false; }); }

function doAction({ label, dur, mode, face, onDone, fx }) {
    if (P.busy || ui || P.fish) return; P.busy = { label, dur, t: 0, mode, onDone, fx };
    if (face) P.yaw = Math.atan2(face.x - P.x, face.z - P.z);
    $('#progress').hidden = false; $('#progLabel').textContent = label;
}
function actionUpdate(dt) {
    const a = P.busy; if (!a) return; a.t += dt; $('#progFill').style.width = Math.min(100, a.t / a.dur * 100) + '%';
    if (a.fx) a.fx(dt, a.t);
    if (a.t >= a.dur) { P.busy = null; $('#progress').hidden = true; a.onDone && a.onDone(); }
}
const clampStat = (k, v) => { S.stats[k] = clamp(S.stats[k] + v, 0, 100); };

/* =====================================================================
   AKSI: makan, minum, masak, cuci, duduk, tidur
   ===================================================================== */
function eat(item) {
    const val = { meal: [45, 'Makan nasi goreng. Enak sekali!'], bungkus: [30, 'Makan nasi bungkus.'], ikanbakar: [42, 'Ikan bakar hasil pancingan — nikmat!'], kue: [22, 'Kue manis, enak!'], jajan: [12, 'Ngemil dulu.'] }[item]; if (!val || S.inv[item] <= 0) { toast('Tidak ada makanan', 'bad'); return; }
    doAction({ label: 'Makan…', dur: 3, mode: 'eat', onDone: () => { S.inv[item]--; clampStat('hunger', val[0]); clampStat('happy', 6); toast(val[1], 'good'); audio.ok(); } });
}
function drink(item) {
    const val = { water: [35, 0, 'Segar!'], kopi: [18, 18, 'Kopi hangat bikin melek.'], susu: [30, 8, 'Susu segar, menyehatkan!'], sink: [25, 0, 'Air putih segar.'] }[item]; if (!val) return;
    if (item !== 'sink' && S.inv[item] <= 0) { toast('Tidak ada minuman', 'bad'); return; }
    doAction({ label: 'Minum…', dur: 2, mode: 'drink', onDone: () => { if (item !== 'sink') S.inv[item]--; clampStat('thirst', val[0]); clampStat('energy', val[1]); toast(val[2], 'good'); audio.ok(); } });
}
const quickEat = () => { const k = EATABLE.find(x => S.inv[x] > 0); if (k) eat(k); else toast('Belum punya makanan — masak, memancing, atau beli dulu', 'bad'); };
const quickDrink = () => { const k = DRINKABLE.find(x => S.inv[x] > 0); if (k) drink(k); else toast('Belum punya minuman — ambil dari kulkas', 'bad'); };
function sitOn(spot) {
    if (P.veh || P.sit || P.fish || P.build) return; if (spot.occ && spot.occ !== P) { toast('Sudah ada yang duduk di sini', 'bad'); return; } spot.occ = P; P.sit = spot; P.x = spot.x; P.z = spot.z; P.yaw = spot.yaw; audio.beep(330, 0.05);
}
function standUp() {
    const s = P.sit; if (!s) return; const f = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
    for (const [dx, dz] of [[f.x, f.z], [-f.x, -f.z], [f.z, -f.x], [-f.z, f.x]]) {
        const t = { x: s.x + dx * 0.95, z: s.z + dz * 0.95 }; const c = { ...t }; if (!resolve(c, 0.4)) { P.x = t.x; P.z = t.z; break; }
    }
    s.occ = null; P.sit = null;
}
function sleepAt(kind) {
    const fade = $('#fade'); fade.classList.add('on'); P.busy = { label: 'Tidur…', dur: 99, t: 0 }; $('#progress').hidden = true;
    setTimeout(() => {
        if (kind === 'night') { const h = (S.time / 60) % 24; const add = h < 6 ? (6 - h) * 60 : (30 - h) * 60; S.time += add; if (S.time >= 1440) { S.time -= 1440; S.day++; } S.stats.energy = 100; S.inv.dirty++; clampStat('hunger', -25); clampStat('thirst', -25); toast('Selamat pagi! Hari ke-' + S.day, 'good'); }
        else { S.time += 120; if (S.time >= 1440) { S.time -= 1440; S.day++; } clampStat('energy', 35); clampStat('hunger', -8); toast('Tidur siang 2 jam', 'good'); }
        fade.classList.remove('on'); P.busy = null;
    }, 1400);
}
function addQuestProg(id, n = 1, silent) {
    const q = S.quests[id]; if (q.s !== 'active') return; q.p = Math.min(QUESTS[id].goal, q.p + n);
    if (q.p >= QUESTS[id].goal && id !== 'masak') completeQuest(id);
    else if (!silent) toast(`Misi: ${QUESTS[id].title} (${q.p}/${QUESTS[id].goal})`, 'warn');
}
function completeQuest(id) { const q = S.quests[id]; if (q.s === 'done') return; q.s = 'done'; S.coins += QUESTS[id].reward; audio.ok(); toast(`✔ Misi selesai! +${QUESTS[id].reward} koin`, 'good', 3500); clampStat('happy', 10); }
function startQuest(id) { const q = S.quests[id]; if (q.s === 'new') { q.s = 'active'; toast('Misi baru: ' + QUESTS[id].title, 'warn', 3200); audio.ok(); } }

/* =====================================================================
   NPC & dialog
   ===================================================================== */
const QGIVER = { ujang: 'masak', budi: 'mobil', asep: 'gali', dina: 'kucing', joko: 'mancing', sinta: 'kemah' };
const SHOP = {
    madi: [{ k: 'bahan', p: 5 }, { k: 'bungkus', p: 6 }, { k: 'water', p: 2 }, { k: 'jajan', p: 3 }, { k: 'telur', p: 2 }],
    rina: [{ k: 'kopi', p: 4 }, { k: 'kue', p: 6 }, { k: 'water', p: 2 }],
    tika: [{ k: 'jajan', p: 3 }, { k: 'water', p: 2 }, { k: 'susu', p: 4 }, { k: 'bahan', p: 5 }],
};
const BUY = { madi: { ikan: 6, telur: 3, susu: 5 }, tika: { telur: 3, susu: 5 }, rina: { susu: 5 } };
const ACT_TXT = { work: 'jaga toko', farm: 'merawat ladang', exca: 'mengoperasikan alat berat', eat: 'cari makan', rest: 'duduk istirahat', chat: 'ngobrol dengan warga', wander: 'jalan-jalan', phone: 'main HP', fish: 'memancing', camp: 'mendirikan tenda', campsit: 'santai di api unggun', sleepTent: 'tidur di tenda', pack: 'membongkar tenda', pet: 'bermain dengan hewan', sleepHome: 'pulang untuk tidur', idle: 'santai' };
function shopDialog(n) {
    const buys = SHOP[n.id].map(it => ({ label: `${ITEMS[it.k][0]} ${ITEMS[it.k][1]} — ${it.p}🪙`, off: S.coins < it.p ? 'Koin tidak cukup' : null, fn: () => { S.coins -= it.p; S.inv[it.k]++; audio.ok(); toast(`Beli ${ITEMS[it.k][1]}`, 'good'); if (n.id === 'rina') news('cafe'); shopDialog(n); } }));
    const sells = Object.entries(BUY[n.id] || {}).filter(([k]) => S.inv[k] > 0).map(([k, p]) => ({ label: `Jual ${ITEMS[k][0]} ${ITEMS[k][1]} (${S.inv[k]}) +${p}🪙`, fn: () => { S.inv[k]--; S.coins += p; audio.ok(); toast(`Jual ${ITEMS[k][1]} +${p}🪙`, 'good'); shopDialog(n); } }));
    openDialog({ who: n.name, text: `Koinmu: ${S.coins} 🪙. Mau beli atau jual apa?`, choices: [...buys, ...sells] });
}
function questChoice(n, id) {
    const q = S.quests[id], Q = QUESTS[id];
    if (q.s === 'new') return { label: `Tanya misi`, fn: () => openDialog({ who: n.name, text: Q.desc + ` Hadiah: ${Q.reward} koin.`, choices: [{ label: 'Terima misi', fn: () => startQuest(id) }] }) };
    if (q.s === 'active') {
        if (id === 'masak') return { label: S.inv.meal > 0 ? 'Serahkan nasi goreng' : 'Misi: butuh nasi goreng', off: S.inv.meal > 0 ? null : 'Kamu belum punya nasi goreng', fn: () => { S.inv.meal--; completeQuest('masak'); openDialog({ who: n.name, text: 'Wah, harum sekali! Terima kasih ya.' }); } };
        return { label: `Misi: ${q.p}/${Q.goal}`, fn: () => openDialog({ who: n.name, text: Q.desc + ` (${q.p}/${Q.goal})` }) };
    }
    return null;
}
function talk(n) {
    n.talking = true; const act = n.brain ? n.brain.act : 'idle';
    const choices = [{ label: 'Ngobrol', fn: () => { openDialog({ who: n.name, text: pick(n.def.lines), choices: [{ label: 'Ngobrol lagi', fn: () => talk(n) }] }); clampStat('happy', 2); } }];
    choices.push({ label: 'Lagi apa?', fn: () => openDialog({ who: n.name, text: `Aku lagi ${ACT_TXT[act] || 'santai'}.` + (n.brain && n.brain.lastCatch ? ` Tadi dapat ${n.brain.lastCatch.n}!` : '') + (n.brain && n.brain.needs.hunger < 35 ? ' Perutku lapar nih.' : ''), choices: [{ label: 'Oke', fn: () => talk(n) }] }) });
    if (SHOP[n.id]) choices.push({ label: '🛒 Belanja / Jual', fn: () => shopDialog(n) });
    const qid = QGIVER[n.id]; if (qid) { const c = questChoice(n, qid); if (c) choices.push(c); }
    if (n.id === 'ujang') choices.push({ label: '🥬 Minta sayur', off: S.flags.sayur === S.day ? 'Sudah diambil hari ini' : null, fn: () => { S.flags.sayur = S.day; S.inv.bahan += 2; audio.ok(); toast('Dapat 2 bahan masak', 'good'); } });
    if (n.id === 'lurah') choices.push({ label: 'Info hari ini', fn: () => openDialog({ who: n.name, text: `Hari ke-${S.day}, pukul ${hourStr()}. Koinmu ${S.coins}. Misi selesai: ${Object.values(S.quests).filter(q => q.s === 'done').length}/${Object.keys(QUESTS).length}.` }) });
    if (S.inv.ikan > 0 && n.id !== 'madi') choices.push({ label: '🐟 Beri ikan', fn: () => { S.inv.ikan--; S.friend[n.id] = (S.friend[n.id] || 0) + 1; clampStat('happy', 5); if (n.brain) n.brain.needs.hunger = Math.min(100, n.brain.needs.hunger + 25); audio.ok(); emote('heart', n.x, 2.4, n.z); openDialog({ who: n.name, text: pick(['Wah, ikan segar! Terima kasih banyak!', 'Kamu baik sekali. Nanti kubakar!', 'Mantap! Aku jadi lapar.']) }); } });
    openDialog({ who: `${n.name} · ${n.role}`, text: `"${pick(n.def.lines)}"`, choices });
}

/* =====================================================================
   KUCING
   ===================================================================== */
function petCat(k) {
    clampStat('happy', 5); k.happy = Math.min(100, k.happy + 10); k.mode = 'happy'; k.modeT = 2; audio.meow();
    for (let i = 0; i < 4; i++) emit(k.x + (Math.random() - 0.5) * 0.4, 0.9 + i * 0.12, k.z, { color: 0xff6fa5, size: 0.14, vy: 0.9, life: 1.2 });
    toast(`${k.name}: ${pick(['Meong~ ❤', 'Purrr...', 'Mrrow! ❤', 'Nyaa~'])}`, 'good');
    const q = S.quests.kucing; if (q.s === 'active' && !q.set.includes(k.id)) { q.set.push(k.id); addQuestProg('kucing'); }
}
function feedCat(k) { if (S.inv.bahan <= 0 && S.inv.bungkus <= 0) { toast('Butuh bahan masak / nasi bungkus untuk makanan kucing', 'bad'); return; } if (S.inv.bahan > 0) S.inv.bahan--; else S.inv.bungkus--; k.mode = 'eat'; k.modeT = 3; k.happy = Math.min(100, k.happy + 15); clampStat('happy', 4); toast(`${k.name} makan dengan lahap`, 'good'); audio.beep(500, 0.1, 'triangle'); }
function catPath(k, tx, tz) {
    const ins = (x, z) => house.inside(x, z), a = ins(k.x, k.z), b = ins(tx, tz); k.path = [];
    if (a && !b) k.path.push({ x: 0, z: -9 }, { x: 0, z: -5.5 }); else if (!a && b) k.path.push({ x: 0, z: -5.5 }, { x: 0, z: -9 });
    k.path.push({ x: tx, z: tz });
}
function catUpdate(k, dt, t) {
    const c = k.c; if (k.modeT > 0) { k.modeT -= dt; if (k.modeT <= 0) k.mode = null; }
    let move = false, want = null; const dP = Math.hypot(P.x - k.x, P.z - k.z);
    if (k.mode === 'happy' || k.mode === 'eat') { /* diam */ }
    else if (k.follow && !P.veh) {
        if (dP > 3.2) { if (!k.path.length || Math.hypot(k.path[k.path.length - 1].x - P.x, k.path[k.path.length - 1].z - P.z) > 3) catPath(k, P.x + (k === abu ? -1.2 : 1.2), P.z - 1.2); }
        else if (!k.path.length) { k.state = 'sit'; }
    } else {
        k.timer -= dt;
        if (k.timer <= 0) {
            const r = Math.random();
            if (r < 0.4) { const inH = Math.random() < 0.7; catPath(k, inH ? -7 + Math.random() * 14 : -5 + Math.random() * 14, inH ? -19 + Math.random() * 10 : -4 + Math.random() * 8); k.state = 'walk'; k.timer = 6 + Math.random() * 6; }
            else if (r < 0.7) { k.path = []; k.state = 'sit'; k.timer = 5 + Math.random() * 6; }
            else { const sp = pick([spots.catSpots.bed, spots.catSpots.sofa, spots.catSpots.cushion, spots.catSpots.rug]); catPath(k, sp.x, sp.z); k.state = 'sleep'; k.timer = 14 + Math.random() * 14; }
        }
    }
    if (k.path.length && k.mode !== 'happy' && k.mode !== 'eat') {
        const tg = k.path[0], dx = tg.x - k.x, dz = tg.z - k.z, d = Math.hypot(dx, dz), sp = k.follow ? (dP > 8 ? 5.2 : 3) : 1.6;
        if (d < 0.25) k.path.shift(); else { k.yaw += wrapPi(Math.atan2(dx, dz) - k.yaw) * (1 - Math.exp(-10 * dt)); k.x += dx / d * sp * dt; k.z += dz / d * sp * dt; move = true; k.phase += sp * dt * 5; }
        const p = { x: k.x, z: k.z }; resolve(p, 0.22); k.x = p.x; k.z = p.z;
    } else if (!k.path.length && k.state === 'walk') k.state = 'sit';
    c.root.position.x = k.x; c.root.position.z = k.z; c.root.rotation.y = k.yaw;
    const onFurn = (s) => Math.hypot(k.x - s.x, k.z - s.z) < 1.1;
    const lift = k.state === 'sleep' && !move ? (onFurn(spots.catSpots.bed) ? 0.9 : onFurn(spots.catSpots.sofa) ? 0.55 : onFurn(spots.catSpots.cushion) ? 0.14 : 0) : 0;
    c.root.position.y += (lift - c.root.position.y) * (1 - Math.exp(-8 * dt));
    c.pose(k.mode === 'happy' ? 'happy' : k.mode === 'eat' ? 'eat' : move ? 'walk' : k.state === 'sleep' ? 'sleep' : 'sit', k.phase, t, dt);
    c.root.children[c.root.children.length - 1].visible = dP < 16;
}

/* =====================================================================
   PENYAMBUNGAN: otak NPC, hewan, kemah, memancing
   ===================================================================== */
const hourNow = () => (S.time / 60) % 24, nowSec = () => performance.now() / 1000;
spots.seats = [...spots.benches, ...spots.chairs.filter(c => !house.inside(c.x, c.z))];
const campSeats = spots.camps.flatMap(k => k.seats);
const nav = new Nav();
const campFx = initCamps(scene, spots.camps);
const animals = buildAnimals({
    scene, spots, free: W.free,
    api: { S, emit, clampStat, toast, sfx: (n) => audio.sfx(n), takeFood: () => { for (const k of ['bahan', 'bungkus', 'jajan']) if (S.inv[k] > 0) { S.inv[k]--; return true; } return false; }, give: (k, n) => { S.inv[k] = (S.inv[k] || 0) + n; } },
});
const PETS = [...animals.list, ...CATS];
const fishEnvP = { scene, emit, emote, sfx: (n) => audio.sfx(n), whistle: () => (audio.on ? whistle.play(1) : 2.6) };
const fishEnvN = { scene, emit, emote, sfx: () => { }, whistle: () => 0 };
const brainCtx = {
    nav, seats: spots.seats, spots, camps: spots.camps, pets: PETS, npcs: NPC, P, exca, news: NEWS, fishEnv: fishEnvN, groundY: W.groundY,
    hour: hourNow, time: nowSec, emote, emit, sfx: () => { },
    greetLine: (n) => { const h = hourNow(); return pick([`Halo! Selamat ${h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18.5 ? 'sore' : 'malam'}!`, 'Hai, apa kabar?', ...(n.def.small || [])]); },
    onNpcCatch: (n, fish) => n.say(fish.v ? `Dapat ${fish.n}!` : 'Yah, cuma sepatu bekas…', 3),
    petAnimal: (a) => { a.mode = 'happy'; a.modeT = 2; a.tgt = null; if (Math.hypot(a.x - P.x, a.z - P.z) < 14) audio.sfx(a.sfx || 'meow'); },
};
NPC.forEach(n => { n.brain = new Brain(n, brainCtx); });
const ENC = [{ inside: house.inside, roof: house.roof, wallMat: house.wallMat }, ...spots.interiors.map(b => ({ inside: b.inside, roof: b.roof, wallMat: b.wallMat, b }))];
const wz = spots.waterZone, inWaterZone = (x, z) => x > wz.x0 - 3 && x < wz.x1 + 3 && z > wz.z0 - 3 && z < wz.z1 + 3;
const garageIn = (x, z) => x > 16.4 && x < 27.6 && z > -20.6 && z < -7.5;

/* ---- memancing (pemain) ---- */
function startFish(f) {
    if (P.busy || P.fish || P.build || P.sit || P.veh || f.user || ui) return;
    P.x = f.x; P.z = f.z; P.yaw = f.yaw; P.speed = 0;
    P.fish = new Fishing(fishEnvP, { x: P.x, z: P.z, yaw: P.yaw, rig: hero, y: f.y || 0 }, f, {
        auto: false, whistle: true,
        onCatch: (fish) => { if (fish.v) { S.inv.ikan++; S.caught++; toast(`Dapat ${fish.ic} ${fish.n}!`, 'good'); addQuestProg('mancing'); news('fish'); clampStat('happy', 4); } else toast('Dapat sepatu bekas… 👟', 'bad'); },
        onMiss: () => toast('Ikannya kabur! Tekan E lebih cepat', 'bad'),
    });
    toast('Mulai memancing — karakter bersiul menunggu ikan. [E] saat ikan menyambar!', 'warn', 3800);
}
function stopFish() { if (P.fish) { P.fish.stop(); P.fish = null; } }

/* ---- perkemahan (pemain) ---- */
function startBuild(k, dir) {
    if (P.busy || P.fish || P.build || P.sit || P.veh || ui) return;
    P.build = { k, dir, t: 0, sfx: 0 }; if (dir > 0) k.owner = 'player'; k.state = 'building'; P.speed = 0;
    P.yaw = Math.atan2(k.tent.x - P.x, k.tent.z - P.z); hero.holdHammer(true);
    $('#progress').hidden = false; $('#progLabel').textContent = dir > 0 ? 'Mendirikan tenda…' : 'Membongkar tenda…';
}
function buildUpdate(dt) {
    const b = P.build; if (!b) return; b.t += dt; const T = b.dir > 0 ? 7 : 4.5, u = clamp(b.t / T, 0, 1), k = b.k;
    k.setProg(b.dir > 0 ? u : 1 - u); $('#progFill').style.width = u * 100 + '%';
    b.sfx -= dt; if (b.sfx <= 0) { b.sfx = 0.55; audio.sfx('hammer'); }
    if (Math.random() < dt * 6) emit(k.tent.x + (Math.random() - 0.5) * 2.4, 0.2, k.tent.z + (Math.random() - 0.5) * 2.4, { color: 0xcdb98a, size: 0.12, vy: 1.2, g: 4, life: 0.6, spread: 0.8 });
    if (u >= 1) {
        P.build = null; hero.holdHammer(false); $('#progress').hidden = true;
        if (b.dir > 0) { k.state = 'built'; toast('Tenda berdiri! ⛺', 'good'); emote('star', k.tent.x, 2.6, k.tent.z); audio.ok(); addQuestProg('kemah'); news('camp'); clampStat('happy', 6); }
        else { k.state = 'empty'; k.owner = null; k.lit = false; toast('Tenda dibongkar'); }
    }
}
const campLabel = (k) => (k.state === 'empty' && !k.owner ? 'Petak kemah' : k.state === 'built' && k.owner === 'player' ? 'Tendamu' : null);
const campActs = (k) => {
    if (k.state === 'empty') return [{ label: '⛺ Dirikan tenda (±7 dtk)', fn: () => startBuild(k, 1) }];
    return [{ label: '🛏 Tidur di tenda sampai pagi', fn: () => sleepAt('night') }, { label: '🧺 Bongkar tenda', fn: () => startBuild(k, -1) }];
};
const fireActs = (k) => {
    const a = [];
    if (!k.lit) a.push({ label: '🔥 Nyalakan api unggun', fn: () => { k.lit = true; k.burn = 260; audio.sfx('ok'); toast('Api unggun menyala 🔥', 'good'); } });
    else {
        a.push({ label: '🪵 Tambah kayu', fn: () => { k.burn = Math.max(k.burn, 260); toast('Api membesar'); } });
        a.push({ label: '🍢 Bakar ikan', off: S.inv.ikan > 0 ? null : 'Butuh ikan segar (pancing di dermaga)', fn: () => doAction({ label: 'Membakar ikan…', dur: 4, mode: 'cook', face: k.fire, fx: (dt) => { if (Math.random() < dt * 8) emit(k.fire.x + (Math.random() - 0.5) * 0.4, 1.0, k.fire.z, { color: 0xcfd3dc, size: 0.12, vy: 1, life: 1, spread: 0.3 }); }, onDone: () => { S.inv.ikan--; S.inv.ikanbakar++; toast('Ikan bakar siap! 🍢', 'good'); audio.ok(); } }) });
    }
    return a;
};
/* =====================================================================
   INTERAKTIF
   ===================================================================== */
const IA = [];
const addIA = (o) => { IA.push(o); return o; };
const near = (s, r = 1.3) => ({ x: s.x, z: s.z, r });
const lampOf = (id) => spots.lamps[id];
// kulkas, wastafel, kompor
addIA({ ...near(spots.fridge), label: () => 'Kulkas', actions: () => [{ label: '🥬 Ambil bahan masak', fn: () => { S.inv.bahan = Math.min(9, S.inv.bahan + 1); toast('+1 bahan masak', 'good'); audio.beep(600, 0.05); } }, { label: '🥤 Ambil air minum', fn: () => { S.inv.water = Math.min(9, S.inv.water + 1); toast('+1 air botol', 'good'); audio.beep(600, 0.05); } }] });
addIA({ ...near(spots.sink), label: () => 'Wastafel', actions: () => [{ label: '💧 Minum air', fn: () => drink('sink') }] });
addIA({ ...near(spots.stove), label: () => 'Kompor', actions: () => [{ label: '🍳 Masak nasi goreng', off: S.inv.bahan > 0 ? null : 'Butuh 1 bahan masak (kulkas)', fn: () => doAction({ label: 'Memasak nasi goreng…', dur: 4.5, mode: 'cook', face: { x: spots.stove.x, z: -21 }, fx: (dt, t) => { if (Math.random() < dt * 8) emit(spots.stove.x + (Math.random() - 0.5) * 0.5, 1.1, -20.5, { color: 0xcfd3dc, size: 0.14, vy: 0.9, life: 1.1, spread: 0.3 }); }, onDone: () => { S.inv.bahan--; S.inv.meal++; toast('Nasi goreng siap! 🍛', 'good'); audio.ok(); clampStat('happy', 4); } }) }] });
addIA({ ...near(spots.table, 2.0), label: () => 'Meja makan', actions: () => [{ label: '🍛 Makan nasi goreng', off: S.inv.meal > 0 ? null : 'Tidak punya nasi goreng', fn: () => eat('meal') }, { label: '🍱 Makan nasi bungkus', off: S.inv.bungkus > 0 ? null : 'Tidak punya nasi bungkus', fn: () => eat('bungkus') }, { label: '🥤 Minum air botol', off: S.inv.water > 0 ? null : 'Tidak punya air botol', fn: () => drink('water') }] });
// mesin cuci, lemari, shower
addIA({ ...near(spots.washer), label: () => `Mesin cuci (kotor: ${S.inv.dirty})`, actions: () => [{ label: '🧺 Cuci baju kotor', off: S.inv.dirty > 0 ? null : 'Tidak ada baju kotor', fn: () => doAction({ label: 'Mencuci baju…', dur: 5, mode: 'wash', face: { x: -9, z: spots.washer.z }, fx: (dt) => { if (Math.random() < dt * 6) emit(spots.washer.x - 0.7, 1.1, spots.washer.z, { color: 0xbfe8ff, size: 0.1, vy: 0.8, life: 0.8 }); }, onDone: () => { S.inv.clean += S.inv.dirty; S.inv.dirty = 0; toast('Baju bersih! 👕', 'good'); audio.ok(); } }) }] });
addIA({ ...near(spots.wardrobe), label: () => `Lemari (bersih: ${S.inv.clean})`, actions: () => [{ label: '👕 Ganti baju bersih', off: S.inv.clean > 0 ? null : 'Tidak ada baju bersih — cuci dulu', fn: () => doAction({ label: 'Berganti baju…', dur: 1.8, mode: 'wash', face: { x: -9, z: spots.wardrobe.z }, onDone: () => { S.inv.clean--; S.inv.dirty++; clampStat('clean', 35); clampStat('happy', 4); toast('Rapi dan wangi', 'good'); audio.ok(); } }) }] });
addIA({ ...near(spots.shower), label: () => 'Kamar mandi', actions: () => [{ label: '🚿 Mandi', fn: () => doAction({ label: 'Mandi…', dur: 4, mode: 'wash', fx: (dt) => { if (Math.random() < dt * 14) emit(-8.4, 2.2, -20.5, { color: 0x9fe0ff, size: 0.08, vy: -1.6, life: 0.7, g: 2 }); }, onDone: () => { S.stats.clean = 100; clampStat('happy', 6); toast('Segar! Kebersihan 100%', 'good'); audio.ok(); } }) }] });
// TV, tablet, HP, laptop, tempat tidur
addIA({ ...near(spots.tv, 1.7), label: () => (S.tv ? 'TV (nyala)' : 'TV (mati)'), actions: () => [{ label: S.tv ? '📺 Matikan TV' : '📺 Nyalakan TV', fn: () => { S.tv = !S.tv; audio.beep(S.tv ? 700 : 400, 0.08); toast(S.tv ? 'TV menyala' : 'TV mati'); } }] });
addIA({ ...near(spots.tablet, 1.4), label: () => (S.hasTablet ? 'Tablet' : 'Tablet di meja'), actions: () => [{ label: '📱 Pakai tablet', fn: () => { if (!S.hasTablet) { S.hasTablet = true; toast('Tablet masuk tas — tekan T kapan saja', 'good'); } openTablet(); } }] });
addIA({ ...near(spots.phone, 1.2), label: () => 'Handphone', actions: () => [{ label: '📞 Pakai handphone', fn: () => openPhone() }] });
addIA({ ...near(spots.laptop, 1.4), label: () => 'Laptop', actions: () => [{ label: '💻 Buka laptop (dashboard CNC)', fn: () => openLaptop() }] });
addIA({ ...near(spots.bed, 1.6), label: () => 'Tempat tidur', actions: () => [{ label: '🛏 Tidur sampai pagi', fn: () => sleepAt('night') }, { label: '😴 Tidur siang 2 jam', fn: () => sleepAt('nap') }] });
// saklar
spots.switches.forEach(s => addIA({ x: s.x, z: s.z, r: 1.1, label: () => (lampOf(s.id).on ? 'Matikan ' : 'Nyalakan ') + lampOf(s.id).name.toLowerCase(), actions: () => [{ label: '💡 ' + (lampOf(s.id).on ? 'Matikan' : 'Nyalakan'), fn: () => setLamp(s.id, !lampOf(s.id).on) }] }));
// tempat duduk
[...spots.chairs, ...spots.sofa, ...spots.benches, ...campSeats].forEach(s => addIA({ x: s.x, z: s.z, r: 0.95, label: () => (P.sit || (s.occ && s.occ !== P) ? null : `Duduk (${s.name || 'Bangku'})`), actions: () => [{ label: '🪑 Duduk', fn: () => sitOn(s) }] }));
// air mancur
addIA({ ...near(spots.fountain, 1.8), label: () => 'Air mancur', actions: () => [{ label: '💧 Minum air', fn: () => drink('sink') }] });
// NPC
NPC.forEach(n => addIA({ ref: n, r: 2.0, label: () => (n.vis ? `Bicara: ${n.name}` : null), actions: () => { talk(n); return null; } }));
// kucing
CATS.forEach(k => addIA({ ref: k, r: 1.8, label: () => k.name, actions: () => [{ label: '🤚 Elus', fn: () => petCat(k) }, { label: '🍚 Beri makan', fn: () => feedCat(k) }, { label: k.follow ? '🏠 Suruh tinggal' : '🐾 Ajak ikut', fn: () => { k.follow = !k.follow; S.follow[k.id] = k.follow; k.path = []; toast(k.follow ? `${k.name} akan mengikutimu` : `${k.name} tinggal di rumah`, 'good'); audio.meow(); } }] }));
// hewan, memancing, kemah
animals.list.forEach(a => addIA({ ref: a, r: a.r || 1.8, label: () => a.name, actions: () => a.actions() }));
spots.fish.forEach(f => addIA({ x: f.x, z: f.z, r: 1.15, label: () => (f.user ? null : `Spot memancing (${f.kind})`), actions: () => [{ label: '🎣 Mulai memancing', fn: () => startFish(f) }] }));
spots.camps.forEach(k => {
    addIA({ x: k.tent.x + 2.5, z: k.tent.z, r: 2.4, label: () => campLabel(k), actions: () => campActs(k) });
    addIA({ x: k.fire.x, z: k.fire.z, r: 2.6, label: () => (k.state === 'building' ? null : 'Api unggun'), actions: () => fireActs(k) });
});
// kendaraan
V.forEach(v => addIA({ ref: v, r: v.radius + 1.6, label: () => `Naiki ${v.name}`, actions: () => { enterVeh(v); return null; } }));

function curIA() {
    if (P.sit || P.veh || P.busy || P.fish || P.build || ui) return null; let best = null, bd = 1e9;
    for (const o of IA) { const ox = o.ref ? o.ref.x : o.x, oz = o.ref ? o.ref.z : o.z; const d = Math.hypot(ox - P.x, oz - P.z); if (d <= o.r && d < bd && o.label()) { bd = d; best = o; } }
    return best;
}
function interact() {
    if (ui === 'dialog') return;
    if (P.fish) { if (!P.fish.press()) toast('Sabar… tunggu ikannya', 'warn'); if (P.fish.done) P.fish = null; return; }
    if (P.build) return;
    if (P.veh) { exitVeh(); return; }
    if (P.sit) { const items = [{ label: '🧍 Berdiri', fn: standUp }]; if (P.sit.desk) items.push({ label: '💻 Buka laptop', fn: openLaptop }); items.push({ label: '📱 Pakai HP', fn: openPhone }); if (S.tv && P.sit.name === 'Sofa') items.push({ label: '📺 Nonton TV (+senang)', fn: () => { clampStat('happy', 8); toast('Seru sekali acaranya!'); } }); openDialog({ who: P.sit.name || 'Duduk', text: 'Santai sejenak…', choices: items }); return; }
    const o = curIA(); if (!o) return;
    const acts = o.actions(); if (!acts) return;
    if (acts.length === 1 && !acts[0].off) { acts[0].fn(); return; }
    openDialog({ who: o.label(), text: 'Mau melakukan apa?', choices: acts });
}

/* =====================================================================
   KENDARAAN
   ===================================================================== */
const ease = (x) => x * x * (3 - 2 * x);
const DIG = [[0, -0.35, 0.6, 0.3], [0.28, 0.5, 0.9, 0.2], [0.55, 0.55, 1.5, 1.25], [0.78, -0.45, 1.05, 1.25], [0.92, -0.3, 0.8, -0.3], [1, -0.35, 0.6, 0.3]];
function digPose(v, p) { let i = 0; while (i < DIG.length - 2 && p > DIG[i + 1][0]) i++; const a = DIG[i], b = DIG[i + 1], u = ease(clamp((p - a[0]) / (b[0] - a[0]), 0, 1)); v.boom.rotation.x = lerp(a[1], b[1], u); v.stick.rotation.x = lerp(a[2], b[2], u); v.bucket.rotation.x = lerp(a[3], b[3], u); }
function enterVeh(v) {
    if (P.veh || P.busy || P.fish || P.build) return; if (v.npcBusy) { toast(`${v.npcBusy.name} sedang memakai ${v.name}`, 'bad'); return; } P.veh = v; v.occ = true; P.sit = null; hero.root.visible = v.kind === 'motor'; audio.beep(260, 0.12, 'sawtooth');
    toast(`Naik ${v.name} — W/S gas, A/D belok, Spasi ${v.kind === 'excavator' ? 'gali, Q/R putar kabin' : 'rem'}, L lampu, E turun`, 'warn', 4200);
}
function exitVeh() {
    const v = P.veh; if (!v) return; v.occ = false; v.speed = 0;
    const side = [[1, 0], [-1, 0], [0, -1], [0, 1]];
    const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw), d = v.radius + 0.9;
    for (const [s, f] of side) { const t = { x: v.x + (rx * s + Math.sin(v.yaw) * f) * d, z: v.z + (rz * s + Math.cos(v.yaw) * f) * d }; const c = { ...t }; if (!resolve(c, 0.4)) { P.x = t.x; P.z = t.z; break; } }
    P.veh = null; hero.root.visible = true; headlight.intensity = 0;
}
function vehUpdate(v, dt, keys) {
    const occ = v.occ;
    const thr = occ ? ((keys.w || keys.up ? 1 : 0) - (keys.s || keys.down ? 1 : 0)) : 0, st = occ ? ((keys.a || keys.left ? 1 : 0) - (keys.d || keys.right ? 1 : 0)) : 0, brake = occ && keys.space && v.kind !== 'excavator';
    if (thr) v.speed += thr * v.accel * dt * (thr * v.speed < 0 ? 2.2 : 1); else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 4 * dt);
    if (brake) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 16 * dt);
    v.speed = clamp(v.speed, -v.maxSpeed * 0.35, v.maxSpeed); v.steer = damp(v.steer, st, 8, dt);
    const sf = v.kind === 'excavator' ? 1 : clamp(v.speed / 4, -1, 1);
    v.yaw += v.steer * v.turn * dt * sf;
    if (Math.abs(v.speed) > 0.02) {
        const p = { x: v.x + Math.sin(v.yaw) * v.speed * dt, z: v.z + Math.cos(v.yaw) * v.speed * dt };
        const hit = resolve(p, v.radius); if (hit) { v.speed *= 0.5; if (Math.abs(v.speed) > 3 && occ) audio.beep(120, 0.08, 'sawtooth', 0.06); }
        v.x = clamp(p.x, -WORLD_HALF + 2, WORLD_HALF - 2); v.z = clamp(p.z, -WORLD_HALF + 2, WORLD_HALF - 2);
    }
    v.root.position.set(v.x, 0, v.z); v.root.rotation.y = v.yaw;
    const roll = v.speed * dt / 0.36; v.wheels.forEach(w => { w.roll.rotation.x += roll; if (w.steer) w.st.rotation.y = v.steer * 0.5; });
    if (v.lean) v.body.rotation.z = damp(v.body.rotation.z, -v.steer * clamp(v.speed / 12, -1, 1) * 0.35, 6, dt);
    v.setBrake(brake || (thr * v.speed < 0 && occ));
    if (v.kind === 'excavator') {
        if (occ) { const q = (keys.q ? 1 : 0) - (keys.r ? 1 : 0); v.cab.rotation.y += q * 1.2 * dt; }
        if (occ && keys.space && !v.digging) { v.digging = true; v.dig = 0; }
        if (v.digging) {
            v.dig += dt / 2.4; if (v.dig >= 1) { v.digging = false; v.dig = 0; const site = spots.town.site; if (occ && Math.hypot(v.x - site.x, v.z - site.z) < 30) addQuestProg('gali'); }
            digPose(v, v.dig); if (v.dig > 0.55 && v.dig < 0.7 && Math.random() < 0.6) { const a = v.yaw + v.cab.rotation.y; emit(v.x + Math.sin(a) * 5.5, 0.3, v.z + Math.cos(a) * 5.5, { color: 0x7a5a3a, size: 0.25, vy: 2, g: 6, life: 0.9, spread: 1 }); }
        } else digPose(v, 0);
        v.beacon.material.color.setHex(occ && Math.floor(performance.now() / 300) % 2 ? 0xff9900 : 0x553300);
    }
    if (v.kind === 'car' && occ && S.quests.mobil.s === 'active' && Math.hypot(v.x - spots.town.bengkel.x, v.z - spots.town.bengkel.z) < 7) addQuestProg('mobil');
}

/* =====================================================================
   INPUT
   ===================================================================== */
const keys = {}; const cam = { yaw: 0, pitch: 0.58, dist: 10, tYaw: 0, tDist: 10, lastDrag: -99, fp: 0, fpvOff: 0 };
/* ---- mode kamera: belakang · depan · mata (first-person) · atas · isometrik ---- */
const CAMS = [{ id: 'chase', name: 'Belakang', pitch: 0.58, dist: 10 }, { id: 'front', name: 'Depan', pitch: 0.28, dist: 5.2 }, { id: 'fpv', name: 'Mata (FPV)', pitch: 0.58, dist: 10 }, { id: 'top', name: 'Atas', pitch: 1.38, dist: 26 }, { id: 'iso', name: 'Isometrik', pitch: 0.62, dist: 20 }];
let camMode = store.get('pl-cam', 'chase'); if (!CAMS.some(c => c.id === camMode)) camMode = 'chase';
function setCam(id, say = true) {
    const c = CAMS.find(x => x.id === id); if (!c) return; camMode = id; store.set('pl-cam', id);
    cam.pitch = c.pitch; cam.tDist = c.dist; cam.fp = 0; cam.fpvOff = 0; cam.lastDrag = -99;
    const fy = P.veh ? P.veh.yaw : P.yaw;
    if (id === 'front') cam.tYaw = fy; else if (id === 'chase') cam.tYaw = fy + PI; else if (id === 'iso') cam.tYaw = PI / 4; else if (id === 'top') cam.tYaw = 0; else if (id === 'fpv') cam.yaw = cam.tYaw = fy + PI;
    $('#btnCam').textContent = '🎥 ' + c.name.toUpperCase(); if (say) toast('Kamera: ' + c.name, 'good', 1500);
}
const cycleCam = () => setCam(CAMS[(CAMS.findIndex(c => c.id === camMode) + 1) % CAMS.length].id);
const KM = { w: 'w', a: 'a', s: 's', d: 'd', q: 'q', r: 'r', arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', shift: 'shift', ' ': 'space' };
addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA', 'IFRAME'].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (ui === 'dialog') closeDialog(); else if (!ui && P.fish) stopFish(); else closeOverlays(); return; }
    if (ui === 'dialog' && /^[1-9]$/.test(k)) { choose(+k - 1); e.preventDefault(); return; }
    if (ui && ui !== 'dialog') return;
    if (!ui && !e.repeat && /^[1-5]$/.test(k)) { setCam(CAMS[+k - 1].id); return; }
    if (!ui && !e.repeat && k === 'v') { cycleCam(); return; }
    if (KM[k]) { keys[KM[k]] = true; if (['up', 'down', 'left', 'right', 'space'].includes(KM[k])) e.preventDefault(); }
    if (e.repeat) return;
    if (k === 'e') interact(); else if (k === 'f') quickEat(); else if (k === 'g') quickDrink(); else if (k === 'p') openPhone(); else if (k === 't') openTabletGadget(); else if (k === 'm') openMap();
    else if (k === 'h') openHelp(); else if (k === 'c') { cam.tYaw = P.veh ? P.veh.yaw + PI : P.yaw + PI; }
    else if (k === 'l' && P.veh) { const v = P.veh; v.lights = !v.lights; v.setLights(v.lights); audio.beep(v.lights ? 880 : 440, 0.05); toast('Lampu kendaraan ' + (v.lights ? 'NYALA' : 'MATI')); }
});
addEventListener('keyup', (e) => { const m = KM[e.key.toLowerCase()]; if (m) keys[m] = false; });
let drag = null;
canvas.addEventListener('pointerdown', (e) => { if (ui) return; drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; cam.lastDrag = performance.now() / 1000;
    if (camMode === 'fpv') { if (P.veh) cam.fpvOff = clamp(cam.fpvOff - dx * 0.006, -1.9, 1.9); else { cam.tYaw -= dx * 0.006; cam.yaw = cam.tYaw; } cam.fp = clamp(cam.fp - dy * 0.005, -1.25, 1.2); return; }
    cam.tYaw -= dx * 0.006; cam.yaw = cam.tYaw; cam.pitch = clamp(cam.pitch + dy * 0.005, 0.12, camMode === 'top' ? 1.52 : 1.25);
});
canvas.addEventListener('pointerup', () => { drag = null; }); canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.tDist = clamp(cam.tDist * (1 + e.deltaY * 0.0012), camMode === 'top' || camMode === 'iso' ? 9 : 3, 42); }, { passive: false });
// sentuh: joystick
const joy = { x: 0, y: 0 };
(() => {
    const base = $('#joy'), knob = $('#joyKnob'); if (!base) return; let id = null, cx = 0, cy = 0;
    const set = (e) => { let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy), m = 46; if (d > m) { dx = dx / d * m; dy = dy / d * m; } knob.style.transform = `translate(${dx}px,${dy}px)`; joy.x = dx / m; joy.y = dy / m; };
    base.addEventListener('pointerdown', (e) => { id = e.pointerId; base.setPointerCapture(id); const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; set(e); e.preventDefault(); });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = () => { id = null; joy.x = joy.y = 0; knob.style.transform = ''; }; base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end);
    $('#tE').addEventListener('click', interact); $('#tM')?.addEventListener('click', openMap); $('#tT')?.addEventListener('click', openTabletGadget); $('#tC').addEventListener('click', cycleCam); $('#tP').addEventListener('click', openPhone); $('#tR').addEventListener('pointerdown', () => { keys.shift = !keys.shift; $('#tR').classList.toggle('on', keys.shift); });
})();

/* =====================================================================
   OVERLAY: HP, tablet, laptop, bantuan, peta
   ===================================================================== */
const ovs = { phone: $('#phone'), tablet: $('#tablet'), tabletGadget: $('#tabletGadget'), laptop: $('#laptop'), help: $('#help'), mapModal: $('#mapModal') };
function openOv(name) { if (P.busy || ui) return false; ui = name; if (ovs[name]) ovs[name].hidden = false; keys.w = keys.a = keys.s = keys.d = false; return true; }
let prevCamBeforeTablet = null;
function closeOverlays() {
    for (const k in ovs) if (ovs[k]) ovs[k].hidden = true;
    if (ui && ui !== 'dialog') {
        if (ui === 'laptop') postFrame(false);
        if (ui === 'tabletGadget') {
            postTabFrame(false);
            if (prevCamBeforeTablet) {
                if (prevCamBeforeTablet.mode === 'fpv') setCam('fpv', false);
                else { cam.tYaw = prevCamBeforeTablet.tYaw; cam.pitch = prevCamBeforeTablet.pitch; }
                prevCamBeforeTablet = null;
            }
        }
        ui = null;
    }
}
$$('[data-ovclose]').forEach(b => b.addEventListener('click', closeOverlays));
function openHelp() { openOv('help'); }
const lapFrame = $('#lapFrame'); const postFrame = (v) => { try { lapFrame.contentWindow?.postMessage({ type: 'cnc-visible', v }, '*'); } catch { /* abaikan */ } };
function openLaptop() {
    if (ui === 'dialog') closeDialog();
    if (!P.sit) { const ch = spots.chairs.find(c => c.desk); sitOn(ch); }
    if (!openOv('laptop')) return;
    if (!lapFrame.getAttribute('src')) { lapFrame.src = 'index.php?embed=1'; $('#lapLoad').hidden = false; lapFrame.addEventListener('load', () => { $('#lapLoad').hidden = true; }, { once: true }); } else postFrame(true);
    audio.beep(520, 0.06); setTimeout(() => audio.beep(780, 0.1), 80);
}

// ---- Tablet Gadget (CNC & Robot Arm) ----
const tabFrame = $('#tabFrame');
const postTabFrame = (v) => { try { tabFrame?.contentWindow?.postMessage({ type: 'cnc-visible', v }, '*'); } catch { /* abaikan */ } };
function openTabletGadget() {
    if (ui === 'dialog') closeDialog();
    if (!openOv('tabletGadget')) return;
    prevCamBeforeTablet = { mode: camMode, yaw: cam.yaw, tYaw: cam.tYaw, pitch: cam.pitch };
    if (camMode === 'fpv') setCam('chase', false);
    const fy = P.veh ? P.veh.yaw : P.yaw;
    cam.tYaw = fy + 0.6;
    cam.pitch = 0.28;

    if (!tabFrame.getAttribute('src')) {
        tabFrame.src = 'index.php?embed=1';
        $('#tabLoad').hidden = false;
        tabFrame.addEventListener('load', () => { $('#tabLoad').hidden = true; }, { once: true });
    } else {
        postTabFrame(true);
    }
    audio.beep(520, 0.06); setTimeout(() => audio.beep(880, 0.1), 80);
}
$('#tabOpacity')?.addEventListener('click', () => {
    const dev = $('.tablet-device');
    if (!dev) return;
    dev.classList.toggle('translucent');
    const on = dev.classList.contains('translucent');
    audio.click();
    toast(on ? 'Mode transparan: Karakter terlihat memegang tablet di latar' : 'Mode normal');
});
$('#tabReload')?.addEventListener('click', () => {
    $('#tabLoad').hidden = false;
    tabFrame.src = 'index.php?embed=1&t=' + Date.now();
    tabFrame.addEventListener('load', () => { $('#tabLoad').hidden = true; }, { once: true });
    audio.click();
    toast('Dashboard dimuat ulang');
});

// ---- Peta Besar ----
function openMap() {
    if (ui === 'dialog') closeDialog();
    if (!openOv('mapModal')) return;
    audio.beep(640, 0.05);
    drawBigMap();
}
// ---- HP ----
const phB = $('#phBody'), phT = $('#phTitle'); let phView = 'home', phChat = null; const chatLog = {};
const REPLY = { sari: ['Halo! Mampir ya, ada nasi bungkus.', 'Warung buka terus kok.'], rina: ['Hai! Kopi siap kapan saja ☕', 'Nanti aku buatkan latte pixel.'], budi: ['Siap! Bawa mobilnya ke bengkel ya.', 'Jangan lupa cek lampu.'], ujang: ['Kalau lapar, ambil sayur di ladang.', 'Hati-hati di jalan.'], asep: ['Proyek jalan lancar!', 'Datang saja ke konstruksi.'], dina: ['Hai! Lagi apa? 😊', 'Ayo main ke taman nanti!'], lurah: ['Terima kasih sudah menghubungi.', 'Nikmati hari di desa.'] };
function phoneRender() {
    $('#phClock').textContent = hourStr();
    if (phView === 'home') { phT.textContent = 'Beranda'; phB.innerHTML = `<div class="apps">${[['chat', '💬', 'Chat'], ['cam', '📷', 'Kamera'], ['music', '🎵', 'Musik'], ['home', '🏠', 'Rumah'], ['bank', '🪙', 'Dompet'], ['dash', '🖥', 'CNC']].map(a => `<button class="app" data-app="${a[0]}"><i>${a[1]}</i>${a[2]}</button>`).join('')}</div><p class="hint">Tekan P kapan saja untuk memakai HP.</p>`; }
    else if (phView === 'chat') { phT.textContent = 'Chat'; phB.innerHTML = NPC.map(n => `<button class="row" data-chat="${n.id}"><b>${n.name}</b><small>${n.role}</small></button>`).join(''); }
    else if (phView === 'thread') { const n = NPC.find(x => x.id === phChat); phT.textContent = n.name; const lg = chatLog[phChat] || []; phB.innerHTML = `<div class="thread">${lg.slice(-6).map(m => `<div class="msg ${m.me ? 'me' : ''}">${m.t}</div>`).join('') || '<p class="hint">Mulai percakapan…</p>'}</div><div class="quick">${['Halo!', 'Lagi apa?', 'Ada tugas?'].map(t => `<button class="pxbtn xs" data-say="${t}">${t}</button>`).join('')}</div>`; const th = $('.thread', phB); th.scrollTop = th.scrollHeight; }
    else if (phView === 'cam') { phT.textContent = 'Kamera'; phB.innerHTML = `<div class="viewf"><span>📷</span></div><button class="pxbtn" id="shot">⚪ AMBIL FOTO</button><p class="hint">Foto tersimpan: ${S.photos}</p>`; }
    else if (phView === 'music') { phT.textContent = 'Musik'; phB.innerHTML = `<div class="viewf"><span class="eq">♪♫♪</span></div><button class="pxbtn" id="mtog">${audio.musicOn ? '⏸ HENTIKAN' : '▶ PUTAR'}</button><p class="hint">Lost Saga — ${bgm.name} (volume 25%).</p>`; }
    else if (phView === 'home2') { phT.textContent = 'Rumah Pintar'; phB.innerHTML = lampList.map(L => `<button class="row" data-lamp="${L.id}"><b>💡 ${L.name}</b><small class="${L.on ? 'on' : ''}">${L.on ? 'NYALA' : 'MATI'}</small></button>`).join('') + `<button class="row" data-lamp="__all"><b>🌙 Matikan semua</b><small></small></button>`; }
    else if (phView === 'bank') { phT.textContent = 'Dompet'; phB.innerHTML = `<div class="big-n">🪙 ${S.coins}</div><p class="hint">Dapatkan koin dari misi NPC.</p>`; }
}
function openPhone() { if (!openOv('phone')) return; phView = 'home'; phoneRender(); }
$('#phone').addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return; audio.click();
    if (t.dataset.app) { const a = t.dataset.app; if (a === 'dash') { closeOverlays(); openLaptop(); return; } phView = a === 'home' ? 'home2' : a; }
    else if (t.dataset.chat) { phChat = t.dataset.chat; phView = 'thread'; }
    else if (t.dataset.say) { const n = NPC.find(x => x.id === phChat); (chatLog[phChat] = chatLog[phChat] || []).push({ me: true, t: t.dataset.say }); phoneRender(); setTimeout(() => { const q = QGIVER[n.id]; let r = pick(REPLY[n.id] || n.def.small || ['Halo!']); if (t.dataset.say === 'Ada tugas?') r = q ? `${QUESTS[q].title}: temui aku langsung ya.` : 'Belum ada tugas, nikmati harimu!'; chatLog[phChat].push({ t: r }); audio.beep(900, 0.05); if (ui === 'phone' && phView === 'thread') phoneRender(); }, 900); return; }
    else if (t.id === 'shot') { S.photos++; const f = $('#flash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 160); audio.beep(1200, 0.05); toast('Foto tersimpan 📷', 'good'); clampStat('happy', 2); }
    else if (t.id === 'mtog') audio.music(!audio.musicOn);
    else if (t.dataset.lamp) { if (t.dataset.lamp === '__all') lampList.forEach(L => setLamp(L.id, false, true)); else setLamp(t.dataset.lamp, !lampOf(t.dataset.lamp).on); }
    else if (t.id === 'phHome') phView = 'home'; else return;
    phoneRender();
});
// ---- tablet ----
let tabView = 'map';
function openTablet() { if (!openOv('tablet')) return; tabView = 'map'; tabRender(); }
function tabRender() {
    $$('.tabs2 button').forEach(b => b.classList.toggle('active', b.dataset.tab2 === tabView));
    const b = $('#tabBody');
    if (tabView === 'map') { b.innerHTML = '<canvas id="bigMap" width="420" height="420"></canvas><p class="hint">Kuning: kamu · Cyan: NPC · Oranye: kucing · Merah: kendaraan</p>'; drawBigMap(); }
    else if (tabView === 'quest') { b.innerHTML = Object.entries(QUESTS).map(([id, q]) => { const s = S.quests[id]; const st = { new: '🔒 Belum diambil', active: `▶ Berjalan ${s.p}/${q.goal}`, done: '✔ Selesai' }[s.s]; return `<div class="q ${s.s}"><b>${q.title}</b><small>Pemberi: ${q.giver} · Hadiah ${q.reward}🪙</small><p>${q.desc}</p><em>${st}</em></div>`; }).join(''); }
    else if (tabView === 'status') { b.innerHTML = `<div class="stat-grid">${[['Hari', S.day], ['Waktu', hourStr()], ['Koin', S.coins], ['Foto', S.photos], ['Baju bersih', S.inv.clean], ['Baju kotor', S.inv.dirty]].map(a => `<div><small>${a[0]}</small><b>${a[1]}</b></div>`).join('')}</div><h4>Peliharaan</h4>${CATS.map(k => `<div class="pet"><b>${k.name}</b><span class="bar2"><i style="width:${k.happy}%"></i></span><small>${k.follow ? 'Ikut kamu' : 'Di rumah'}</small></div>`).join('')}`; }
    else if (tabView === 'cnc') { b.innerHTML = `<div class="cncbox"><p>Dashboard monitoring &amp; digital twin mesin CNC PCB.</p><button class="pxbtn" id="tabCnc">🖥 BUKA DASHBOARD</button></div>`; }
}
$('#tablet').addEventListener('click', (e) => { const t = e.target.closest('button'); if (!t) return; if (t.dataset.tab2) { tabView = t.dataset.tab2; audio.click(); tabRender(); } else if (t.id === 'tabCnc') { closeOverlays(); openTabletGadget(); } });
// ---- tombol map & gadget tablet ----
$('#btnOpenMap')?.addEventListener('click', openMap);
$('#btnOpenMap2')?.addEventListener('click', openMap);
$('#mini')?.addEventListener('click', openMap);
$('#btnGadget')?.addEventListener('click', openTabletGadget);
$('#btnOpenTablet2')?.addEventListener('click', openTabletGadget);

// ---- bantuan ----
$('#btnHelp').addEventListener('click', openHelp); $('#btnCam').addEventListener('click', cycleCam);
$('#btnSnd').addEventListener('click', () => { audio.on = !audio.on; $('#btnSnd').textContent = audio.on ? '🔊' : '🔇'; });
$('#btnSnd').textContent = audio.on ? '🔊' : '🔇';
$('#btnPx').addEventListener('click', () => { PS = PS === 3 ? 2 : PS === 2 ? 4 : 3; store.set('pl-ps', PS); $('#btnPx').textContent = 'PX ' + PS; resize(); toast('Ukuran pixel x' + PS); });
$('#btnPx').textContent = 'PX ' + PS;
$('#btnReset').addEventListener('click', () => { if (confirm('Hapus semua progres game dan mulai baru?')) { store.set('pixlife-v2', 'null'); noSave = true; location.reload(); } });
$$('.inv-chip').forEach(() => { });

/* =====================================================================
   PETA
   ===================================================================== */
const MAPPX = 3, MS = 260 * MAPPX;
const mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = MS;
{
    const g = mapBase.getContext('2d'); g.fillStyle = '#3f7a3b'; g.fillRect(0, 0, MS, MS); const tx = (x) => (x + 130) * MAPPX, tz = (z) => (z + 130) * MAPPX;
    g.fillStyle = '#2f6a3a'; W.map.dots.forEach(([x, z]) => g.fillRect(tx(x) - 2, tz(z) - 2, 5, 5));
    W.map.rects.forEach(r => { g.fillStyle = r.c; g.fillRect(tx(r.x - r.w / 2), tz(r.z - r.d / 2), r.w * MAPPX, r.d * MAPPX); });
    g.fillStyle = '#fff'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; W.map.labels.forEach(l => { g.fillStyle = '#000a'; g.fillText(l.t, tx(l.x) + 1, tz(l.z) + 1); g.fillStyle = '#fff'; g.fillText(l.t, tx(l.x), tz(l.z)); });
}
function drawMarkers(g, scale, ox, oz) {
    const dot = (x, z, c, s) => { g.fillStyle = '#000'; g.fillRect((x - ox) * scale - s - 1, (z - oz) * scale - s - 1, s * 2 + 2, s * 2 + 2); g.fillStyle = c; g.fillRect((x - ox) * scale - s, (z - oz) * scale - s, s * 2, s * 2); };
    NPC.forEach(n => n.vis && dot(n.x, n.z, '#4ee1ff', 3)); CATS.forEach(k => dot(k.x, k.z, '#ff9a3c', 3)); animals.list.forEach(a => dot(a.x, a.z, '#e8d9a8', 2)); V.forEach(v => dot(v.x, v.z, '#ff4d6d', 4));
    const px = (P.x - ox) * scale, pz = (P.z - oz) * scale;
    dot(P.x, P.z, '#ffd84a', 5);
    const a = -P.yaw;
    g.fillStyle = '#ff2a2a';
    g.beginPath();
    g.moveTo(px + Math.sin(a) * 9, pz + Math.cos(a) * 9);
    g.lineTo(px + Math.sin(a + 2.5) * 5, pz + Math.cos(a + 2.5) * 5);
    g.lineTo(px + Math.sin(a - 2.5) * 5, pz + Math.cos(a - 2.5) * 5);
    g.closePath();
    g.fill();
}
function drawBigMap() { const c = $('#bigMap'); if (!c) return; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(mapBase, 0, 0, c.width, c.height); drawMarkers(g, c.width / 260, -130, -130); }
const mini = $('#mini'), mg = mini.getContext('2d'); mg.imageSmoothingEnabled = false;
function drawMini() {
    const R = 55, s = mini.width / (R * 2); mg.fillStyle = '#233'; mg.fillRect(0, 0, mini.width, mini.height);
    mg.drawImage(mapBase, (P.x + 130 - R) * MAPPX, (P.z + 130 - R) * MAPPX, R * 2 * MAPPX, R * 2 * MAPPX, 0, 0, mini.width, mini.height);
    drawMarkers(mg, s, P.x - R, P.z - R);
}

/* =====================================================================
   HUD
   ===================================================================== */
const barEls = {}; $$('#bars .bar').forEach(b => { barEls[b.dataset.k] = b; });
function hud() {
    for (const k in S.stats) { const v = S.stats[k], el = barEls[k]; $('i', el).style.width = v + '%'; el.classList.toggle('low', v < 20); }
    $('#coins').textContent = S.coins; $('#clock').textContent = hourStr(); $('#dayTxt').textContent = 'HARI ' + S.day;
    const h = (S.time / 60) % 24; $('#sunIco').textContent = h >= 5.5 && h < 18.5 ? '☀' : '☾';
    $('#inv').innerHTML = Object.entries(ITEMS).filter(([k]) => S.inv[k] > 0).map(([k, [ic, n]]) => `<button class="chip" data-item="${k}" data-tip="${n}${EATABLE.includes(k) ? ' — klik untuk makan' : DRINKABLE.includes(k) ? ' — klik untuk minum' : ''}">${ic}<b>${S.inv[k]}</b></button>`).join('') || '<span class="hint">Tas kosong</span>';
    drawMini();
    if (ui === 'mapModal') drawBigMap();
    const o = curIA();
    let txt = '';
    if (ui) txt = ''; else if (P.veh) txt = P.veh.kind === 'excavator' ? '[W/S] maju/mundur · [A/D] putar · [Q/R] putar kabin · [Spasi] GALI · [L] lampu · [E] turun' : '[W/S] gas · [A/D] belok · [Spasi] rem · [L] lampu · [E] turun'; else if (P.fish) txt = `🎣 ${P.fish.label}  ·  [Esc] berhenti`; else if (P.sit) txt = '[E] menu duduk (berdiri, laptop, HP)'; else if (P.busy || P.build) txt = ''; else if (o) txt = `[E] ${o.label()}`;
    const pr = $('#prompt'); pr.textContent = txt; pr.hidden = !txt;
    if (P.veh) $('#speedo').textContent = Math.round(Math.abs(P.veh.speed) * 3.6) + ' km/j'; $('#speedo').hidden = !P.veh;
}
$('#inv').addEventListener('click', (e) => { const c = e.target.closest('[data-item]'); if (!c) return; const k = c.dataset.item; if (EATABLE.includes(k)) eat(k); else if (DRINKABLE.includes(k)) drink(k); else toast(ITEMS[k][1] + (k === 'ikan' ? ' — bakar di api unggun, atau jual di Warung Madura' : ' — dipakai untuk memasak / pakan hewan')); });

/* =====================================================================
   LOOP
   ===================================================================== */
const clock = new THREE.Clock(); let hudT = 0, saveT = 0, noSave = false, tTV = 0, engT = 0; const camTarget = new THREE.Vector3(), _eye = new THREE.Vector3(); let fpvOn = false, lastLock = 0;
function save() { if (noSave) return; S.pos = { x: P.x, z: P.z, yaw: P.yaw }; store.set('pixlife-v2', JSON.stringify(S)); }
addEventListener('beforeunload', save);

function update(dt, t) {
    S.time += dt * TIME_RATE; if (S.time >= 1440) { S.time -= 1440; S.day++; }
    const hour = (S.time / 60) % 24;
    // kebutuhan
    const moving = P.speed > 0.5, sitting = !!P.sit;
    clampStat('hunger', -0.1 * dt); clampStat('thirst', -0.14 * dt); clampStat('clean', -0.04 * dt);
    clampStat('energy', sitting ? 0.35 * dt : -(0.05 + (moving && P.run ? 0.07 : 0)) * dt);
    const need = (S.stats.hunger + S.stats.thirst + S.stats.energy + S.stats.clean) / 4; clampStat('happy', (need > 55 ? 0.02 : -0.08) * dt);
    if (S.stats.hunger < 1 && Math.random() < dt * 0.1) toast('Kamu sangat lapar! Tekan F untuk makan', 'bad');
    if (S.stats.energy < 1 && Math.random() < dt * 0.1) toast('Kamu kelelahan — duduk atau tidur', 'bad');
    if (S.stats.thirst < 1 && Math.random() < dt * 0.1) toast('Kamu haus! Tekan G untuk minum', 'bad');
    const slow = S.stats.energy < 8 || S.stats.hunger < 5 ? 0.6 : 1;

    // pemain
    let mvx = 0, mvz = 0;
    if (!P.veh && !P.sit && !P.busy && !P.fish && !P.build && !ui) {
        const kf = (keys.w || keys.up ? 1 : 0) - (keys.s || keys.down ? 1 : 0) - joy.y, kr = (keys.d || keys.right ? 1 : 0) - (keys.a || keys.left ? 1 : 0) + joy.x;
        if (kf || kr) { const l = Math.max(1, Math.hypot(kf, kr)), f = kf / l, r = kr / l, sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw); mvx = f * -sy + r * cy; mvz = f * -cy + r * -sy; }
    }
    P.run = !!keys.shift; const sp = (P.run ? 6.2 : 3.4) * slow; let moved = 0;
    if (mvx || mvz) {
        const o = { x: P.x, z: P.z }; const p = { x: P.x + mvx * sp * dt, z: P.z + mvz * sp * dt }; resolve(p, 0.38);
        P.x = clamp(p.x, -WORLD_HALF + 2, WORLD_HALF - 2); P.z = clamp(p.z, -WORLD_HALF + 2, WORLD_HALF - 2); moved = Math.hypot(P.x - o.x, P.z - o.z) / dt;
        if (camMode !== 'fpv') P.yaw += wrapPi(Math.atan2(mvx, mvz) - P.yaw) * (1 - Math.exp(-14 * dt));
    }
    if (P.fish) { const mk = keys.w || keys.a || keys.s || keys.d || keys.up || keys.down || keys.left || keys.right || joy.x || joy.y; if (mk && (P.fish.state === 'wait' || P.fish.state === 'cast')) stopFish(); }
    P.speed = moved; P.phase += moved * dt * 2.6;
    actionUpdate(dt); buildUpdate(dt);
    // kendaraan
    V.forEach(v => vehUpdate(v, dt, keys));
    if (P.veh) {
        const v = P.veh; P.x = v.x; P.z = v.z; P.yaw = v.yaw; P.speed = Math.abs(v.speed);
        engT -= dt; if (engT <= 0 && audio.on) { engT = 0.12; audio.engine(Math.abs(v.speed)); }
        if (v.lights) { const a = v.yaw; const hp = v.hlPos; headlight.position.set(v.x + Math.sin(a) * hp[2] + 0, hp[1], v.z + Math.cos(a) * hp[2]); headlight.target.position.set(v.x + Math.sin(a) * 14, 0, v.z + Math.cos(a) * 14); headlight.intensity = 260; } else headlight.intensity = 0;
        if (v.kind === 'motor') { hero.root.position.set(v.x + Math.sin(v.yaw) * -0.25 + Math.cos(v.yaw) * 0, 0.33, v.z + Math.cos(v.yaw) * -0.25); hero.root.rotation.y = v.yaw; hero.root.rotation.z = v.body.rotation.z * 0.8; }
    }
    // pose pemain
    if (!P.veh) {
        let mode = moved > 0.3 ? (P.run && moved > 4 ? 'run' : 'walk') : 'idle', ph = P.phase;
        if (P.fish) { if (P.fish.done) P.fish = null; else { const fp = P.fish.update(dt, t); mode = fp.mode; ph = fp.phase; } } else if (P.build) mode = 'hammer';
        else if (P.sit) mode = ui === 'laptop' ? 'type' : ui === 'phone' ? 'sitphone' : (ui === 'tablet' || ui === 'tabletGadget') ? 'sittablet' : 'sit'; else if (P.busy && P.busy.mode) mode = P.busy.mode; else if (ui === 'phone') mode = 'phone'; else if (ui === 'tablet' || ui === 'tabletGadget') mode = 'tablet';
        if (camMode === 'fpv' && !P.sit && !P.fish && !P.build && !P.busy && !ui) P.yaw = wrapPi(cam.yaw + PI);
        hero.pose(mode, ph, t, dt);
        const ry = P.sit ? P.sit.y - 0.42 : W.groundY(P.x, P.z); hero.root.position.set(P.x, ry, P.z); hero.root.rotation.y = P.yaw; hero.root.rotation.z = 0;
        if (P.busy && !P.busy.mode) hero.root.visible = false; else hero.root.visible = true;
    } else { hero.pose(P.veh.kind === 'motor' ? 'drive' : 'idle', 0, t, dt); }

    // dunia
    const curE = !P.veh ? ENC.find(e => e.inside(P.x, P.z)) || null : null, inH = !!curE;
    spots.garageRoof.visible = !garageIn(P.x, P.z);
    for (const e of ENC) { const ins = e === curE; e.roof.visible = !ins; const wm = e.wallMat; if (wm.transparent !== ins) { wm.transparent = ins; wm.opacity = ins ? 0.22 : 1; wm.depthWrite = !ins; wm.needsUpdate = true; } }
    applyTime(dt);
    if (NEWS.act && nowSec() - NEWS.t > 220) NEWS.act = null;
    for (const n of NPC) {
        n.brain.update(dt, t); const dP = Math.hypot(P.x - n.x, P.z - n.z);
        if (n.vis) { n.m.pose(n.pose.mode, n.pose.phase, t + n.x, dt); n.m.holdHammer(n.pose.mode === 'hammer'); }
        n.tag.visible = n.vis && dP < 22 && !n.brain.hidden; n.bubble.update(dt, dP < 24 && n.vis);
    }
    CATS.forEach(k => catUpdate(k, dt, t));
    animals.update(dt, t, P, nightF, hour); campFx.update(dt, t, emit, P.x, P.z, nightF); emoteUpdate(dt); W.animate(t, dt); W.lights(P.x, P.z, nightF, curE && curE.b ? curE.b : null);
    bgm.setZone(inWaterZone(P.x, P.z) ? 'water' : 'base');
    W.clouds.forEach(c => { c.position.x += dt * 1.5; if (c.position.x > 220) c.position.x = -220; });
    spots.lake.material.opacity = 0.82 + Math.sin(t) * 0.04;
    tTV -= dt; if (S.tv !== spots.tv.on || (S.tv && tTV <= 0)) { spots.tv.on = S.tv; tTV = 0.25; const c = spots.tv.ctx; if (S.tv) { for (let y = 0; y < 36; y += 6) for (let x = 0; x < 64; x += 8) { c.fillStyle = `hsl(${(x * 6 + y * 9 + t * 120) % 360} 70% ${40 + (y % 12)}%)`; c.fillRect(x, y, 8, 6); } } else { c.fillStyle = '#05070c'; c.fillRect(0, 0, 64, 36); } spots.tv.tex.needsUpdate = true; }
    spots.laptopScreen.material.color.setHex(ui === 'laptop' ? 0x4ee1ff : 0x103a60);
    spots.tabletMesh.visible = !S.hasTablet; spots.phoneMesh.visible = true;
    for (const f of FX) { if (f.life <= 0) continue; f.life -= dt; f.vy -= f.g * dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt; f.m.material.opacity = clamp(f.life / f.max * 1.4, 0, 1); if (f.life <= 0 || f.m.position.y < 0.02) { f.life = 0; f.m.visible = false; } }

    // kamera
    const now = performance.now() / 1000, fpv = camMode === 'fpv', locked = P.veh ? 4 : P.sit ? 1 : P.fish ? 2 : P.build || P.busy ? 3 : 0;
    if (fpv !== fpvOn) { fpvOn = fpv; hero.setFPV(fpv); }
    const wantFov = fpv ? 74 : 50; if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov = damp(camera.fov, wantFov, 8, dt); camera.updateProjectionMatrix(); }
    const faceYaw = P.veh ? P.veh.yaw : P.yaw, gy = P.veh ? 0 : W.groundY(P.x, P.z);
    if (locked !== lastLock) { lastLock = locked; if (fpv) { cam.yaw = cam.tYaw = faceYaw + PI; cam.fpvOff = 0; } }
    if (fpv) {
        if (P.veh) { if (now - cam.lastDrag > 1.5) cam.fpvOff *= Math.exp(-2.5 * dt); cam.yaw = cam.tYaw = P.veh.yaw + PI + (P.veh.kind === 'excavator' ? P.veh.cab.rotation.y : 0) + cam.fpvOff; }
        const ly = cam.yaw + PI, eye = _eye;
        if (P.veh && P.veh.kind !== 'motor') { const v = P.veh, ex = v.kind === 'excavator'; eye.set(v.x + Math.sin(v.yaw) * (ex ? -0.25 : 0.12), ex ? 3.1 : 1.38, v.z + Math.cos(v.yaw) * (ex ? -0.25 : 0.12)); }
        else { hero.root.updateMatrixWorld(true); hero.headPos(eye); eye.y += 0.15; eye.x += Math.sin(ly) * 0.1; eye.z += Math.cos(ly) * 0.1; }
        const cpp = Math.cos(cam.fp); camera.position.copy(eye); camera.lookAt(eye.x + Math.sin(ly) * cpp, eye.y + Math.sin(cam.fp), eye.z + Math.cos(ly) * cpp);
    } else {
        const still = now - cam.lastDrag > 1.8;
        let follow = false;
        if (camMode === 'chase') { follow = !!P.veh && still; if (follow) cam.tYaw = P.veh.yaw + PI + (P.veh.kind === 'excavator' ? 0.5 : 0); }
        else if (camMode === 'front') { if (still && (P.veh || P.speed < 0.3)) { cam.tYaw = faceYaw; follow = true; } }
        const dWant = P.veh ? Math.max(cam.tDist, P.veh.kind === 'excavator' ? 14 : 10) : cam.tDist; cam.dist = damp(cam.dist, inH ? Math.min(dWant, 7) : dWant, 6, dt);
        cam.yaw += wrapPi(cam.tYaw - cam.yaw) * (1 - Math.exp(-(follow ? (camMode === 'front' ? 2.2 : 3) : 14) * dt));
        camTarget.set(P.x, gy + (P.veh ? 1.2 : P.sit ? 1.0 : camMode === 'front' ? 1.25 : 1.4), P.z); const cp = Math.cos(cam.pitch);
        let cd = cam.dist;     // hindari kamera tembus dinding / pohon (kecuali di dalam bangunan, dindingnya transparan)
        if (!inH && !P.sit && (camMode === 'chase' || camMode === 'front')) for (let i = 2; i <= 8; i++) { const f = i / 8, d = cam.dist * f, y = camTarget.y + Math.sin(cam.pitch) * d; if (y > 4.8) break; if (blockedAt(camTarget.x + Math.sin(cam.yaw) * cp * d, camTarget.z + Math.cos(cam.yaw) * cp * d, 0.35)) { cd = Math.max(2.2, cam.dist * (f - 0.125)); break; } }
        cam.eff = damp(cam.eff ?? cd, cd, cd < (cam.eff ?? cd) ? 14 : 4, dt);
        camera.position.set(camTarget.x + Math.sin(cam.yaw) * cp * cam.eff, camTarget.y + Math.sin(cam.pitch) * cam.eff, camTarget.z + Math.cos(cam.yaw) * cp * cam.eff);
        camera.position.y = Math.max(camera.position.y, 0.6); camera.lookAt(camTarget);
    }

    hudT += dt; if (hudT > 0.12) { hudT = 0; hud(); }
    saveT += dt; if (saveT > 8) { saveT = 0; save(); }
}
let last = 0, run = true;
document.addEventListener('visibilitychange', () => { run = !document.hidden; clock.getDelta(); });
function frame() {
    requestAnimationFrame(frame); if (!run) return;
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (ui === 'laptop') return; // dunia dibekukan saat laptop di meja rumah terbuka
    update(dt, t); renderer.render(scene, camera);
}

/* ---------- mulai ---------- */
boot.start('save'); resize(); cam.yaw = cam.tYaw = P.yaw + PI; applyTime(0.1);
if (!S.pos) { cam.yaw = cam.tYaw = 0; }
setCam(camMode, false); if (camMode === 'chase' || camMode === 'front') cam.tYaw = cam.yaw = S.pos ? P.yaw + PI : 0;
renderer.render(scene, camera); boot.done('save'); frame();
window.PIXLIFE = { W, bgm, nav, animals, setCam, startFish, startBuild, fishEnvP, S, P, spots, V, CATS, NPC, setLamp, openLaptop, openTabletGadget, openMap, openPhone, openTablet, camera, scene, interact, enterVeh, exitVeh, car, motor, exca };
await sleep(900); await boot.finish(); resize();
bgm.onChange = (n) => toast('♪ ' + n, '', 2200); bgm.start();         // dimulai dari klik PRESS START (izin autoplay browser)
toast('Selamat datang di Pixel Life! Tekan M untuk Peta, T untuk Tablet Gadget.', 'good', 5000);
