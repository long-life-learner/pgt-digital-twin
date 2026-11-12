/* ===================================================================
   DIGITAL TWIN — mesin CNC PCB bergaya pixel (Three.js)
   Geometri diadaptasi dari cnc-machine.js (satuan mm, skala 0.01),
   dirender pada resolusi rendah + upscale "nearest" => tampilan pixel.
   =================================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PS = 3;                       // 1 pixel-art = 3 pixel layar
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

export async function createTwin(canvas, {
    onProgress = () => {}, scale = 1, invert = {}, origin = {},
    startCenter = true,          // true: setelah START pahat berjalan ke tengah PCB dulu, baru mengikuti koordinat
    centerSpeed = 140,           // kecepatan gerak menuju tengah (mm/detik)
    onPhase = () => {},          // dipanggil saat fase berubah: 'center' (menuju tengah) / 'track' (ikut koordinat)
    onLimit = () => {},          // dipanggil saat ada sumbu yang di luar jangkauan model, mis. ['X','Z']
} = {}) {
    // ---------- renderer ----------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;   // bayangan keras = blocky

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
    const HALF_H = 7.2;

    // ---------- langit pixel bertingkat ----------
    {
        const bands = ['#0a0f24', '#0d1430', '#111a3d', '#162149', '#1c2956', '#233264', '#2c3b75', '#374585'];
        const c = document.createElement('canvas'); c.width = 4; c.height = bands.length;
        const g = c.getContext('2d');
        bands.forEach((b, i) => { g.fillStyle = b; g.fillRect(0, i, 4, 1); });
        const t = new THREE.CanvasTexture(c);
        t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
        scene.background = t;
    }

    // ---------- material toon (3-4 tingkat bayangan) ----------
    const grad = new THREE.DataTexture(new Uint8Array([70, 130, 200, 255]), 4, 1, THREE.RedFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
    const matCache = new Map();
    const M = (hex) => {
        if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshToonMaterial({ color: hex, gradientMap: grad }));
        return matCache.get(hex);
    };
    const glow = (hex) => new THREE.MeshBasicMaterial({ color: hex });

    // ---------- cahaya ----------
    scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a2f55, 1.35));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    sun.position.set(9, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6fa8ff, 0.8);
    rim.position.set(-10, 6, -8);
    scene.add(rim);

    // ---------- dunia (skala 0.01 : 1 unit = 100 mm) ----------
    const world = new THREE.Group();
    world.scale.setScalar(0.01);
    scene.add(world);

    const bx = (parent, [w, h, d], [x, y, z], mat, shadow = true) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'number' ? M(mat) : mat);
        m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true;
        parent.add(m); return m;
    };
    const cy = (parent, rt, rb, h, [x, y, z], mat, rot = null, seg = 8) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof mat === 'number' ? M(mat) : mat);
        m.position.set(x, y, z); if (rot) m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true;
        parent.add(m); return m;
    };
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    const pixTex = (c) => {
        const t = new THREE.CanvasTexture(c);
        t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
        return t;
    };

    const C = {
        metal: 0xb9c3da, metalD: 0x6f7a96, metalL: 0xe4ebfa, slot: 0x313857, black: 0x171c30, blackS: 0x2a3250,
        blue: 0x2f7bff, rubber: 0x1d2033, box: 0x4d587f, copper: 0xf0b34a,
    };

    // ============ PULAU / LANTAI ============
    await nextFrame();
    {
        const chk = document.createElement('canvas'); chk.width = chk.height = 2;
        const g = chk.getContext('2d');
        g.fillStyle = '#2a3566'; g.fillRect(0, 0, 2, 2);
        g.fillStyle = '#323f78'; g.fillRect(0, 0, 1, 1); g.fillRect(1, 1, 1, 1);
        const t = pixTex(chk); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(19, 13);
        const side = M(0x1c2347);
        const top = new THREE.MeshToonMaterial({ map: t, gradientMap: grad });
        const slab = new THREE.Mesh(new THREE.BoxGeometry(1900, 30, 1300), [side, side, top, side, side, side]);
        slab.position.y = -15; slab.receiveShadow = true; world.add(slab);
        bx(world, [1700, 60, 1120], [0, -60, 0], 0x182040, false);
        bx(world, [1300, 70, 820], [0, -125, 0], 0x12182f, false);
        bx(world, [760, 80, 460], [0, -200, 0], 0x0e1326, false);
        bx(world, [320, 80, 200], [0, -280, 0], 0x0a0e1d, false);
        // pinggir kuning (garis keselamatan)
        for (const [w, d, x, z] of [[1900, 14, 0, 650], [1900, 14, 0, -650], [14, 1300, 950, 0], [14, 1300, -950, 0]])
            bx(world, [w, 6, d], [x, 3, z], 0xe6b800, false);
    }
    onProgress(0.15);
    await nextFrame();

    // ============ MESIN ============
    const machine = grp(world, 0, 0, 0);

    // --- rangka ---
    for (const z of [-330, 330]) bx(machine, [1080, 40, 40], [0, 35, z], C.metal);
    for (const x of [-520, 520]) bx(machine, [40, 40, 620], [x, 35, 0], C.metal);
    for (const x of [-230, 230]) bx(machine, [30, 30, 620], [x, 35, 0], C.metalD);
    for (const x of [-500, 500]) for (const z of [-305, 305]) {
        cy(machine, 17, 17, 22, [x, 10, z], C.rubber, null, 8);
        cy(machine, 8, 8, 18, [x, 27, z], C.metalD, null, 6);
        bx(machine, [58, 7, 58], [x, 59, z], C.metalD);
    }
    for (const x of [-100, 520]) {
        bx(machine, [35, 35, 620], [x, 160, 0], C.metal);
        cy(machine, 9, 9, 570, [x, 190, 0], C.metalL, [Math.PI / 2, 0, 0], 8);
    }
    for (const x of [-70, 490]) {
        bx(machine, [30, 30, 470], [x, 92, 0], C.metalD);
        for (const z of [-190, 190]) bx(machine, [56, 45, 12], [x, 125, z], C.metalD);
    }

    // --- meja kerja + PCB ---
    // BED = base plate. Seluruh meja + PCB + tanda titik nol ada di grup ini dan digeser maju-mundur (sumbu Y).
    const bed = grp(machine, 0, 0, 0);
    const table = grp(bed, 210, 145, 0);
    bx(table, [630, 16, 500], [0, -12, 0], C.metalD);
    bx(table, [610, 12, 470], [0, 0, 0], C.metal);
    for (let i = 0; i < 8; i++) {
        const z = -202 + i * 58;
        bx(table, [600, 32, 32], [0, 18, z], C.metal);
        bx(table, [590, 3, 4], [0, 35, z], C.slot, false);
    }
    for (const x of [-255, 255]) for (const z of [-175, 175]) bx(table, [72, 35, 58], [x, -27, z], C.blackS);

    // papan PCB: tekstur kanvas (jalur tembaga digerus mengikuti pahat)
    const PW = 320, PD = 160;
    const pcbCv = document.createElement('canvas'); pcbCv.width = 96; pcbCv.height = 48;
    const pg = pcbCv.getContext('2d');
    const pcbTex = pixTex(pcbCv);
    const drawPcbBase = () => {
        pg.fillStyle = '#c98f2e'; pg.fillRect(0, 0, 96, 48);                  // tembaga
        pg.fillStyle = '#d9a444';
        for (let y = 0; y < 48; y += 2) for (let x = (y / 2) % 2; x < 96; x += 2) pg.fillRect(x, y, 1, 1);
        pg.fillStyle = '#0b5a34'; pg.fillRect(0, 0, 96, 2); pg.fillRect(0, 46, 96, 2); pg.fillRect(0, 0, 2, 48); pg.fillRect(94, 0, 2, 48); // tepi
        pg.fillStyle = '#16314f';
        for (const [x, y] of [[5, 5], [89, 5], [5, 41], [89, 41]]) pg.fillRect(x - 1, y - 1, 3, 3);  // lubang mounting
    };
    drawPcbBase(); pcbTex.needsUpdate = true;
    const pcbSide = M(0x0b5a34);
    const pcbTopMat = new THREE.MeshToonMaterial({ map: pcbTex, gradientMap: grad });
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(PW, 4, PD), [pcbSide, pcbSide, pcbTopMat, pcbSide, pcbSide, pcbSide]);
    pcb.position.set(210, 181.5, 150); pcb.castShadow = true; pcb.receiveShadow = true; bed.add(pcb);
    const PCB_TOP = 183.5;
    let cutCount = 0;
    const clearPcb = () => { drawPcbBase(); pcbTex.needsUpdate = true; cutCount = 0; };

    // penanda titik nol kerja (WPos 0,0) di atas PCB: tanda silang merah-kuning
    const zeroMark = grp(bed, 0, PCB_TOP + 1, 0);
    bx(zeroMark, [30, 1.5, 4], [0, 0, 0], glow(0xff4d6d), false);
    bx(zeroMark, [4, 1.5, 30], [0, 0, 0], glow(0xff4d6d), false);
    bx(zeroMark, [8, 2.2, 8], [0, 0, 0], glow(0xffd84a), false);
    zeroMark.visible = false;

    // --- kotak kontrol + layar hidup ---
    const control = grp(machine, -300, 63, 0);
    bx(control, [420, 250, 380], [0, 125, 0], C.box);
    bx(control, [355, 205, 14], [0, 145, 196], C.metalD);
    bx(control, [355, 9, 16], [0, 38, 197], C.blackS);
    bx(control, [420, 12, 12], [0, 6, 196], C.blackS);
    bx(control, [8, 80, 95], [214, 105, 40], C.metalD);
    cy(control, 9, 9, 5, [220, 135, 55], C.blue, [0, 0, Math.PI / 2], 8);
    cy(control, 7, 7, 5, [220, 105, 55], C.metalL, [0, 0, Math.PI / 2], 8);
    const scrCv = document.createElement('canvas'); scrCv.width = 108; scrCv.height = 58;
    const sg = scrCv.getContext('2d');
    const scrTex = pixTex(scrCv);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(326, 176), new THREE.MeshBasicMaterial({ map: scrTex }));
    screen.position.set(0, 145, 204); control.add(screen);

    // --- menara lampu sinyal (andon) ---
    const tower = grp(machine, -165, 313, -130);
    cy(tower, 6, 6, 60, [0, 30, 0], C.metalD, null, 6);
    const lamps = {};
    [['red', 0xff4d6d, 70], ['yellow', 0xffd84a, 108], ['green', 0x5dff8a, 146]].forEach(([k, col, y]) => {
        const m = glow(0x222233);
        const mesh = bx(tower, [38, 34, 38], [0, y, 0], m, false);
        lamps[k] = { m, col };
    });
    bx(tower, [42, 6, 42], [0, 168, 0], C.blackS, false);

    // --- gantry ---
    const gantry = grp(machine, 210, 0, 0);          // gantry DIAM (tidak bergerak di sumbu Y)
    for (const x of [-310, 310]) {
        bx(gantry, [78, 300, 50], [x, 315, 0], C.metalD);
        bx(gantry, [42, 275, 42], [x, 315, 0], C.metal);
        bx(gantry, [110, 24, 100], [x, 178, 0], C.blackS);
    }
    bx(gantry, [700, 48, 48], [0, 475, 0], C.metal);
    bx(gantry, [700, 35, 35], [0, 390, -18], C.metalD);
    cy(gantry, 10, 10, 640, [0, 445, 34], C.metalL, [0, 0, Math.PI / 2], 8);
    cy(gantry, 10, 10, 640, [0, 405, 34], C.metalL, [0, 0, Math.PI / 2], 8);
    bx(gantry, [650, 22, 22], [0, 365, 45], C.metal);
    for (const x of [-350, 350]) bx(gantry, [28, 130, 90], [x, 425, 5], C.metalD);
    bx(gantry, [78, 78, 70], [365, 455, 0], C.black);
    cy(gantry, 13, 13, 24, [365, 455, 47], C.metalD, [Math.PI / 2, 0, 0], 8);
    cy(gantry, 15, 15, 34, [365, 455, 76], C.blue, [Math.PI / 2, 0, 0], 8);

    const xCar = grp(gantry, 0, 0, 0);
    bx(xCar, [150, 170, 28], [0, 430, -2], C.metalD);
    bx(xCar, [130, 155, 28], [0, 430, 48], C.blackS);
    for (const y of [405, 445]) bx(xCar, [72, 22, 35], [0, y, 22], C.black);
    bx(xCar, [78, 74, 70], [0, 535, 15], C.black);
    cy(xCar, 30, 30, 28, [0, 586, 15], C.black, null, 8);

    const zSlide = grp(xCar, 0, 120, 0);
    bx(zSlide, [94, 185, 34], [0, 325, 76], C.metalD);
    bx(zSlide, [72, 165, 12], [0, 325, 96], C.blackS);
    cy(zSlide, 43, 48, 132, [0, 305, 145], C.black, null, 10);
    cy(zSlide, 38, 38, 25, [0, 385, 145], C.blackS, null, 10);
    cy(zSlide, 48, 48, 18, [0, 345, 145], C.metalD, null, 10);
    cy(zSlide, 23, 30, 42, [0, 218, 145], C.metalL, null, 8);
    cy(zSlide, 11, 15, 25, [0, 185, 145], C.metalD, null, 8);
    const bit = grp(zSlide, 0, 150, 145);
    cy(bit, 2.4, 1.2, 44, [0, 0, 0], C.metalL, null, 6);
    // pahat: "kepala" berwarna agar putarannya terlihat
    const bitFin = bx(bit, [8, 12, 3], [0, 8, 0], C.copper, false);
    bit.userData.tipOffset = new THREE.Vector3(0, -22, 0);

    onProgress(0.55);
    await nextFrame();

    // ============ PROP: awan, bintang, maskot, partikel ============
    const clouds = [];
    for (let i = 0; i < 7; i++) {
        const c = grp(world, -2600 + i * 880, 1100 + (i % 3) * 260, -1700 + (i % 4) * 330);
        const col = 0x6f7cc0 + (i % 2) * 0x0a0a0a;
        bx(c, [260, 60, 90], [0, 0, 0], col, false);
        bx(c, [170, 70, 90], [-50, 50, 0], col, false);
        bx(c, [120, 50, 90], [70, 40, 0], col, false);
        clouds.push(c);
    }
    {
        const n = 140, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 6000; pos[i * 3 + 1] = 1400 + Math.random() * 1800; pos[i * 3 + 2] = -2600 + Math.random() * 1800;
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false }));
        stars.frustumCulled = false; world.add(stars);
        world.userData.stars = stars;
    }

    // maskot "PIX" robot kecil
    const mascot = grp(world, -690, 0, 430);
    const mBodyMat = M(0x35d0c0);
    const mBody = bx(mascot, [90, 80, 70], [0, 75, 0], mBodyMat);
    bx(mascot, [20, 30, 20], [-22, 15, 0], C.blackS); bx(mascot, [20, 30, 20], [22, 15, 0], C.blackS);
    const mEyes = bx(mascot, [16, 16, 4], [-18, 85, 36], 0x0a0f1e, false); const mEyes2 = bx(mascot, [16, 16, 4], [18, 85, 36], 0x0a0f1e, false);
    bx(mascot, [6, 26, 6], [0, 130, 0], C.metalD); const bulb = bx(mascot, [16, 16, 16], [0, 148, 0], glow(0x5dff8a), false);
    bx(mascot, [18, 50, 18], [-58, 75, 0], 0x25a89b); bx(mascot, [18, 50, 18], [58, 75, 0], 0x25a89b);
    const mouth = bx(mascot, [30, 6, 4], [0, 62, 36], 0x0a0f1e, false);

    // partikel serpihan
    const chips = [];
    const chipGeo = new THREE.BoxGeometry(7, 7, 7);
    for (let i = 0; i < 28; i++) {
        const m = new THREE.Mesh(chipGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? 0xf0b34a : 0x5dff8a }));
        m.visible = false; world.add(m);
        chips.push({ m, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    let chipIdx = 0;
    const emit = (p) => {
        const c = chips[chipIdx++ % chips.length];
        c.m.position.copy(p); c.life = 0.55 + Math.random() * 0.4;
        c.vx = (Math.random() - 0.5) * 260; c.vy = 160 + Math.random() * 220; c.vz = (Math.random() - 0.5) * 260;
        c.m.visible = true;
    };

    onProgress(0.8);
    await nextFrame();

    // ============ KAMERA & KONTROL ============
    const PRESETS = {
        iso:   { pos: [13, 10.5, 13],   target: [0.3, 2.3, 0.9], zoom: 1 },
        front: { pos: [0.3, 4.2, 22],   target: [0.3, 2.6, 0.9], zoom: 1.1 },
        top:   { pos: [0.3, 24, 1.0],   target: [0.3, 1.5, 0.9], zoom: 1.15 },
    };
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.09;
    controls.enablePan = false; controls.minZoom = 0.55; controls.maxZoom = 3.2;
    controls.maxPolarAngle = Math.PI * 0.49; controls.autoRotateSpeed = 1.2;
    let tween = null;
    const applyPreset = (name, instant = false) => {
        const p = PRESETS[name]; if (!p) return;
        const to = { pos: new THREE.Vector3(...p.pos), target: new THREE.Vector3(...p.target), zoom: p.zoom };
        if (instant) { camera.position.copy(to.pos); controls.target.copy(to.target); camera.zoom = to.zoom; camera.updateProjectionMatrix(); controls.update(); }
        else tween = to;
    };
    controls.addEventListener('start', () => { tween = null; });
    applyPreset('iso', true);

    const resize = () => {
        const w = canvas.clientWidth || canvas.parentElement.clientWidth, h = canvas.clientHeight || canvas.parentElement.clientHeight;
        if (!w || !h) return;
        renderer.setSize(Math.ceil(w / PS), Math.ceil(h / PS), false);
        const a = w / h;
        camera.left = -HALF_H * a; camera.right = HALF_H * a; camera.top = HALF_H; camera.bottom = -HALF_H;
        camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement); resize();

    // ============ STATE ============
    const S = { mpos: null, wpos: null, status: 'idle', online: null, hasData: false, rpm: 0, rpmMax: 12000, spindleOn: false, text: '' };
    let xNow = 0, bedNow = 0, zNow = 120, spin = 0, lastScr = '', tScr = 0, shake = 0;

    // ---- pemetaan koordinat mesin -> model (1 mm = 1 mm model, dikali `scale`) ----
    //  X : carriage spindle (xCar) geser kiri-kanan sepanjang gantry      (X+ = ke kanan)
    //  Y : BASE PLATE (meja + PCB) maju-mundur; gantry & spindle diam     (Y+ = pahat relatif ke belakang
    //      => meja bergerak ke DEPAN / ke arah operator)
    //  Z : slide spindle motor naik-turun                                 (Z+ = naik, Z=0 => ujung pahat menyentuh PCB)
    // Titik nol kerja saat data pertama masuk (kalibrasi) = titik (origin.x, origin.y) mm dari pojok kiri-depan PCB.
    // Default origin = 'center' => WPos 0,0 berada di TENGAH PCB, jadi koordinat negatif pun tetap jatuh di atas papan.
    // Urutan gerak: HOME (menunggu START) -> menuju TENGAH PCB -> mengikuti koordinat.
    const GX = 210, TIP_Z = 145, TIP_DY = 128;            // x gantry, offset z pahat terhadap gantry, tinggi ujung pahat di zSlide
    const PCB_X0 = 50, PCB_FRONT = 230;                    // pojok kiri-depan PCB (koordinat mesin pada posisi meja = 0)
    const GANTRY_Z = 0;                                    // gantry tetap di sini => ujung pahat selalu di z = GANTRY_Z + TIP_Z
    const TIP_WORLD_Z = GANTRY_Z + TIP_Z;
    const SX = invert.x ? -1 : 1, SY = invert.y ? -1 : 1, SZ = invert.z ? -1 : 1;
    const ori = (v, mid) => (v === undefined || v === null || v === 'center' || v === 'tengah') ? mid : (+v || 0);
    const OX = ori(origin.x, PW / 2), OY = ori(origin.y, PD / 2);   // letak titik nol kerja pada PCB (mm dari kiri / dari depan)
    gantry.position.z = GANTRY_Z;
    let cal = null;                                        // MPos - WPos saat kalibrasi
    const wco = () => (S.mpos && S.wpos) ? S.mpos.map((v, i) => v - S.wpos[i]) : null;
    const rel = () => S.mpos.map((v, i) => v - cal[i]);    // mm relatif titik nol kerja kalibrasi
    // posisi pahat pada PCB (mm dari pojok kiri-depan PCB) untuk jarak `r` dari titik nol kalibrasi
    const pcbX = (r) => OX + SX * r * scale;
    const pcbY = (r) => OY + SY * r * scale;
    const tmp = new THREE.Vector3(), tip = new THREE.Vector3();

    // ---- posisi sumbu model dari posisi pahat ----
    //  px, py = mm dari pojok kiri-depan PCB ; pz = mm di atas permukaan PCB (negatif = di bawah permukaan)
    //  hasil: x = xCar.position.x, b = bed.position.z, z = zSlide.position.y
    const XLIM = 225, BLIM = 120, ZMIN = 32, ZMAX = 150;   // batas gerak fisik model
    const toAxes = (px, py, pz) => ({
        x: PCB_X0 + px - GX,
        b: py - (PCB_FRONT - TIP_WORLD_Z),
        z: PCB_TOP + pz - TIP_DY,
    });
    const CENTER = toAxes(PW / 2, PD / 2, 64.5);           // pahat di atas tengah PCB, ketinggian aman
    const HOME   = toAxes(0, 0, 94.5);                     // pahat di atas pojok kiri-depan PCB, paling atas

    // ---- fase gerak: 'home' (menunggu) -> 'center' (menuju tengah) -> 'track' (mengikuti koordinat) ----
    let phase = startCenter ? 'home' : 'track', leg = null, limNow = '';
    const go = (p) => { phase = p; onPhase(p); };
    const toCenter = (fromHome = false) => {
        if (!startCenter) { go('track'); return; }
        if (fromHome) { xNow = HOME.x; bedNow = HOME.b; zNow = HOME.z; }
        const from = { x: xNow, b: bedNow, z: zNow };
        const dist = Math.max(Math.abs(CENTER.x - from.x), Math.abs(CENTER.b - from.b), Math.abs(CENTER.z - from.z));
        leg = { t: 0, dur: clamp(dist / Math.max(20, centerSpeed), 0.6, 6), from, to: CENTER };
        go('center');
    };
    if (startCenter) { xNow = HOME.x; bedNow = HOME.b; zNow = HOME.z; }
    else { xNow = CENTER.x; bedNow = CENTER.b; zNow = CENTER.z; }

    const drawScreen = (t) => {
        const st = S.status, on = S.online !== false && (S.online === true || S.hasData);
        const bg = !on ? '#10131c' : st === 'alarm' ? '#3a0f1b' : '#07162a';
        const col = !on ? '#555d78' : ({ run: '#5dff8a', idle: '#4ee1ff', hold: '#ffd84a', alarm: '#ff4d6d', other: '#b48cff' })[st];
        const m = S.mpos, rpm = Math.round(S.rpm / 10) * 10;
        const key = [bg, col, S.text, m ? m.map(v => v.toFixed(1)).join() : '-', rpm, on, Math.floor(t * 2) % 2].join('|');
        if (key === lastScr) return; lastScr = key;
        sg.fillStyle = bg; sg.fillRect(0, 0, 108, 58);
        sg.fillStyle = col; sg.fillRect(0, 0, 108, 8); sg.fillStyle = bg;
        sg.font = 'bold 7px monospace'; sg.textBaseline = 'top'; sg.fillText('CNC 3EB', 3, 0);
        sg.fillStyle = col; sg.font = 'bold 12px monospace';
        sg.fillText(on ? (S.text || 'IDLE').toUpperCase().slice(0, 9) : 'OFFLINE', 4, 10);
        sg.font = 'bold 7px monospace'; sg.fillStyle = '#c9d2ff';
        sg.fillText(m ? 'X' + m[0].toFixed(1) + ' Y' + m[1].toFixed(1) : 'X--- Y---', 4, 24);
        sg.fillText(m ? 'Z' + m[2].toFixed(1) : 'Z---', 4, 33);
        sg.fillText('RPM ' + rpm, 4, 42);
        const f = clamp(S.rpm / (S.rpmMax || 1), 0, 1);
        sg.fillStyle = '#000'; sg.fillRect(4, 51, 100, 4);
        sg.fillStyle = col; sg.fillRect(4, 51, Math.round(100 * f), 4);
        if (on && S.spindleOn && Math.floor(t * 2) % 2) { sg.fillStyle = col; sg.fillRect(96, 14, 8, 8); }
        scrTex.needsUpdate = true;
    };

    // ============ LOOP ============
    const clock = new THREE.Clock();
    let running = true, raf = 0;
    const animate = () => {
        raf = requestAnimationFrame(animate);
        if (!running) return;
        const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
        const st = S.status, active = S.online !== false && (S.online === true || S.hasData);
        const run = active && S.spindleOn;

        // posisi sumbu: (1) HOME = diam, (2) CENTER = gerak terkoordinasi ke tengah PCB, (3) TRACK = mengikuti MPos
        const lim = [];
        if (phase === 'center') {
            leg.t += dt;
            const k = Math.min(1, leg.t / leg.dur), e = k * k * (3 - 2 * k);     // smoothstep: mulai & berhenti halus
            xNow = leg.from.x + (leg.to.x - leg.from.x) * e;
            bedNow = leg.from.b + (leg.to.b - leg.from.b) * e;
            zNow = leg.from.z + (leg.to.z - leg.from.z) * e;
            if (k >= 1) go('track');                                              // sudah di tengah -> ikuti koordinat
        } else if (phase === 'track') {
            let xT = CENTER.x, bT = CENTER.b, zT = CENTER.z;                      // belum ada data => tetap di tengah
            if (S.mpos && cal) {
                const r = rel();
                const a = toAxes(pcbX(r[0]), pcbY(r[1]), SZ * r[2] * scale);
                xT = clamp(a.x, -XLIM, XLIM); bT = clamp(a.b, -BLIM, BLIM); zT = clamp(a.z, ZMIN, ZMAX);
                if (xT !== a.x) lim.push('X'); if (bT !== a.b) lim.push('Y'); if (zT !== a.z) lim.push('Z');
            }
            xNow = damp(xNow, xT, 9, dt); bedNow = damp(bedNow, bT, 9, dt); zNow = damp(zNow, zT, 9, dt);
        }
        xCar.position.x = xNow;      // spindle kiri-kanan
        bed.position.z = bedNow;     // meja + PCB maju-mundur
        zSlide.position.y = zNow;    // spindle naik-turun
        const ls = lim.join('');
        if (ls !== limNow) { limNow = ls; onLimit(lim.slice()); }                 // beri tahu UI bila posisi dipotong batas model

        // penanda titik nol kerja (dari WCO = MPos - WPos); menempel pada PCB, jadi ikut bergerak bersama meja
        const w = wco();
        if (cal && w) {
            zeroMark.visible = true;
            zeroMark.position.x = PCB_X0 + pcbX(w[0] - cal[0]);
            zeroMark.position.z = PCB_FRONT - pcbY(w[1] - cal[1]);
        }

        // pahat berputar sesuai RPM (RPM nominal ~ 38 rad/s visual)
        spin += dt * 46 * clamp(S.rpm / (S.rpmMax || 1), 0, 1);
        bit.rotation.y = spin;

        // gerus PCB (hanya bila spindle RUN dan ujung pahat di bawah permukaan)
        bit.updateWorldMatrix(true, false);
        tip.copy(bit.userData.tipOffset).applyMatrix4(bit.matrixWorld);   // dunia (unit)
        const cutting = run && machine.worldToLocal(tip.clone()).y <= PCB_TOP + 1.5;
        if (cutting) {
            pcb.updateWorldMatrix(true, false);
            const lp = pcb.worldToLocal(tip.clone());                      // lokal pcb (unit dunia -> otomatis)
            const u = lp.x / PW + 0.5, v = lp.z / PD + 0.5;                  // lokal pcb sudah dalam mm
            if (u > 0.03 && u < 0.97 && v > 0.06 && v < 0.94) {
                pg.fillStyle = (cutCount++ % 7) ? '#0a4a2a' : '#082e1b';
                pg.fillRect(Math.floor(u * 96) - 1, Math.floor(v * 48) - 1, 2, 2);
                pcbTex.needsUpdate = true;
            }
            if (Math.random() < 0.6) { const e = tip.clone().divideScalar(0.01); e.y += 6; emit(e); }
        }
        for (const c of chips) {
            if (c.life <= 0) continue;
            c.life -= dt; c.vy -= 700 * dt;
            c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
            if (c.life <= 0 || c.m.position.y < 160) { c.life = 0; c.m.visible = false; }
        }

        // lampu menara
        const blink = (hz) => Math.floor(t * hz * 2) % 2 === 0;
        const L = { red: false, yellow: false, green: false };
        if (!active) { /* semua mati */ }
        else if (st === 'alarm') L.red = blink(3);
        else if (st === 'hold') L.yellow = blink(1.5);
        else if (run) L.green = true;
        else if (st === 'idle') L.green = blink(0.6);
        else L.yellow = true;
        for (const k in lamps) lamps[k].m.color.setHex(L[k] ? lamps[k].col : 0x222233);

        // maskot
        const spd = run ? 7 : st === 'alarm' ? 18 : 2;
        mascot.position.y = run ? Math.abs(Math.sin(t * spd)) * 35 : st === 'alarm' ? 0 : Math.sin(t * spd) * 6 + 6;
        mascot.rotation.z = st === 'alarm' ? Math.sin(t * 40) * 0.08 : 0;
        mBodyMat.color.setHex(!active ? 0x4a5170 : st === 'alarm' ? 0xff4d6d : st === 'hold' ? 0xffd84a : st === 'run' ? 0x5dff8a : 0x35d0c0);
        bulb.material.color.setHex(L.red ? 0xff4d6d : L.yellow ? 0xffd84a : L.green ? 0x5dff8a : 0x333a55);
        const eyeH = !active ? 3 : (Math.floor(t * 0.7) % 5 === 0 && (t * 0.7 % 1) < 0.1 ? 3 : 16);
        mEyes.scale.y = mEyes2.scale.y = eyeH / 16;
        mouth.scale.x = st === 'alarm' ? 0.4 : run ? 1.2 : 1; mouth.position.y = st === 'alarm' ? 58 : 62 + (run ? 2 : 0);

        // dunia hidup
        world.position.y = Math.sin(t * 0.8) * 0.06;
        clouds.forEach((c, i) => { c.position.x += dt * (18 + i * 4); if (c.position.x > 2800) c.position.x = -2800; });
        if (world.userData.stars) world.userData.stars.material.opacity = 1;

        // getar saat alarm
        shake = damp(shake, st === 'alarm' && active ? 1 : 0, 6, dt);
        machine.position.x = Math.sin(t * 60) * 3 * shake;

        // tween kamera
        if (tween) {
            camera.position.x = damp(camera.position.x, tween.pos.x, 5, dt);
            camera.position.y = damp(camera.position.y, tween.pos.y, 5, dt);
            camera.position.z = damp(camera.position.z, tween.pos.z, 5, dt);
            controls.target.x = damp(controls.target.x, tween.target.x, 5, dt);
            controls.target.y = damp(controls.target.y, tween.target.y, 5, dt);
            controls.target.z = damp(controls.target.z, tween.target.z, 5, dt);
            camera.zoom = damp(camera.zoom, tween.zoom, 5, dt); camera.updateProjectionMatrix();
            if (camera.position.distanceTo(tween.pos) < 0.02) tween = null;
        }
        controls.update();

        if (t - tScr > 0.12) { tScr = t; drawScreen(t); }
        renderer.render(scene, camera);
    };

    // render pertama (kompilasi shader) lalu mulai
    resize(); renderer.render(scene, camera);
    animate();
    onProgress(1);

    return {
        set(p) {
            Object.assign(S, p);
            if (!cal && S.mpos) cal = wco() || [0, 0, 0];           // kalibrasi: titik nol kerja saat ini = pojok PCB
        },
        recalibrate() { cal = null; zeroMark.visible = false; if (phase !== 'home') toCenter(false); },   // kalibrasi ulang => menuju tengah lagi
        toCenter,                                                                                         // toCenter(true): mulai dari HOME
        get phase() { return phase; },
        tipOnPcb() {   // diagnostik: posisi ujung pahat di bingkai PCB (mm dari kiri-depan) + tinggi di atas permukaan PCB
            bit.updateWorldMatrix(true, false); pcb.updateWorldMatrix(true, false); machine.updateWorldMatrix(true, false);
            const w = bit.userData.tipOffset.clone().applyMatrix4(bit.matrixWorld);
            const lp = pcb.worldToLocal(w.clone()), ml = machine.worldToLocal(w.clone());
            return { x: lp.x + PW / 2, y: PD / 2 - lp.z, z: ml.y - PCB_TOP };
        },
        clearPcb,
        cam: applyPreset,
        autoRotate(v) { controls.autoRotate = !!v; return controls.autoRotate; },
        get isAutoRotate() { return controls.autoRotate; },
        pause(v) { running = !v; if (!v) clock.getDelta(); },
        resize,
        dispose() { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); },
    };
}
