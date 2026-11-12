/* ===================================================================
   DIGITAL TWIN — lengan robot 4 sumbu (ESP32 + PCA9685), gaya pixel voxel
   Satuan dunia: 1 unit ≈ 1 kotak voxel. Sudut sendi dihitung dari PULSA servo
   dengan konstanta kalibrasi di blok CAL (sesuaikan bila lengan fisik berbeda).
   =================================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PS = 3;                                   // 1 pixel-art = 3 pixel layar
const { clamp, damp, degToRad: D2R } = THREE.MathUtils;
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

/* ---------- kalibrasi pulsa → sudut (PCA9685 50 Hz: ±0.439°/pulsa) ---------- */
export const CAL = {
    degPerPulse: 0.45,
    baseHome: 335, shoulderHome: 495, elbowHome: 126,
    shoulderAngleHome: 20,                       // sudut lengan atas dari vertikal saat HOME (°)
    elbowBend: 90,                               // tekukan lengan bawah relatif saat elbow=HOME (°)
elbowSign: -1,
    L1: 3.2, L2: 2.3, LG: 0.7,                   // panjang lengan atas, lengan bawah, jepitan
    gripOpenPulse: 443, gripClosePulse: 600,
};
/* Pose "turun" tiap titik — disalin dari sketch (pulsa) */
export const POSES = {
    A1: { base: 400, shoulder: 340, elbow: 135 },
    A2: { base: 424, shoulder: 340, elbow: 135 },
    B1: { base: 136, shoulder: 372, elbow: 133 },
    B2: { base: 50, shoulder: 374, elbow: 133 },
};
const OBJ = 0.38;                                // sisi kubus barang

export async function createArmTwin(canvas, { baseSign = 1 } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
    const HALF_H = 7.6;

    {   // langit pixel bertingkat
        const bands = ['#0a0f24', '#0d1430', '#111a3d', '#162149', '#1c2956', '#233264', '#2c3b75', '#374585'];
        const c = document.createElement('canvas'); c.width = 4; c.height = bands.length;
        const g = c.getContext('2d'); bands.forEach((b, i) => { g.fillStyle = b; g.fillRect(0, i, 4, 1); });
        const t = new THREE.CanvasTexture(c);
        t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
        scene.background = t;
    }

    const grad = new THREE.DataTexture(new Uint8Array([70, 130, 200, 255]), 4, 1, THREE.RedFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
    const matCache = new Map();
    const M = (hex) => { if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshToonMaterial({ color: hex, gradientMap: grad })); return matCache.get(hex); };
    const glow = (hex) => new THREE.MeshBasicMaterial({ color: hex });
    const pixTex = (c) => { const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; };

    scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a2f55, 1.35));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    sun.position.set(7, 14, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
    sun.shadow.bias = -0.0008; scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6fa8ff, 0.8); rim.position.set(-9, 5, -7); scene.add(rim);

    const world = new THREE.Group(); scene.add(world);
    const bx = (parent, [w, h, d], [x, y, z], mat, shadow = true) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'number' ? M(mat) : mat);
        m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
    };
    const cy = (parent, rt, rb, h, [x, y, z], mat, rot = null, seg = 8) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof mat === 'number' ? M(mat) : mat);
        m.position.set(x, y, z); if (rot) m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    const C = { metal: 0xb9c3da, metalD: 0x6f7a96, metalL: 0xe4ebfa, black: 0x171c30, blackS: 0x2a3250, blue: 0x2f7bff, rubber: 0x1d2033, box: 0x4d587f };

    /* ---------- kinematika maju (FK) dari pulsa ---------- */
    const dp = D2R(CAL.degPerPulse), LF = CAL.L2 + CAL.LG;
    const aOf = (ps) => D2R(CAL.shoulderAngleHome) + (CAL.shoulderHome - ps) * dp;     // lengan atas dari vertikal (maju +)
    const phiOf = (pe) => D2R(CAL.elbowBend) + CAL.elbowSign * (pe - CAL.elbowHome) * dp;               // tekukan lengan bawah
    const yawOf = (pb) => baseSign * (pb - CAL.baseHome) * dp;
    const fk = (pb, ps, pe, H) => {
        const a = aOf(ps), f = a + phiOf(pe);
        const r = CAL.L1 * Math.sin(a) + LF * Math.sin(f), y = H + CAL.L1 * Math.cos(a) + LF * Math.cos(f), yaw = yawOf(pb);
        return { x: r * Math.sin(yaw), y, z: r * Math.cos(yaw), r };
    };
    // tinggi bahu H: ujung jepit di titik A1 menyentuh bagian tengah barang di atas meja
    const H = (OBJ / 2) - fk(POSES.A1.base, POSES.A1.shoulder, POSES.A1.elbow, 0).y;

    /* ---------- lantai / meja ---------- */
    await nextFrame();
    {
        const chk = document.createElement('canvas'); chk.width = chk.height = 2;
        const g = chk.getContext('2d'); g.fillStyle = '#2a3566'; g.fillRect(0, 0, 2, 2); g.fillStyle = '#323f78'; g.fillRect(0, 0, 1, 1); g.fillRect(1, 1, 1, 1);
        const t = pixTex(chk); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(18, 13);
        const side = M(0x1c2347), top = new THREE.MeshToonMaterial({ map: t, gradientMap: grad });
        const slab = new THREE.Mesh(new THREE.BoxGeometry(18, 0.6, 13), [side, side, top, side, side, side]); slab.position.y = -0.3; slab.receiveShadow = true; world.add(slab);
        bx(world, [16.4, 0.6, 11.4], [0, -0.9, 0], 0x182040, false);
        bx(world, [12, 0.7, 8.4], [0, -1.55, 0], 0x12182f, false);
        bx(world, [7, 0.8, 4.8], [0, -2.3, 0], 0x0e1326, false);
        for (const [w, d, x, z] of [[18, 0.14, 0, 6.5], [18, 0.14, 0, -6.5], [0.14, 13, 9, 0], [0.14, 13, -9, 0]]) bx(world, [w, 0.06, d], [x, 0.03, z], 0xe6b800, false);
    }

    /* ---------- titik A1 A2 B1 B2 (posisi dari FK pose turun) ---------- */
    const pads = {};
    const padTex = (txt, col) => {
        const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
        g.fillStyle = col; g.fillRect(0, 0, 16, 16); g.fillStyle = '#0006'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16);
        g.fillStyle = '#fff'; g.font = 'bold 7px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 8, 9); return pixTex(c);
    };
    for (const [id, pose] of Object.entries(POSES)) {
        const tip = fk(pose.base, pose.shoulder, pose.elbow, H);
        const top = Math.max(0, tip.y - OBJ / 2);                     // permukaan alas barang
        const isB = id[0] === 'B', col = isB ? '#c2571a' : '#1a8f5a';
        const g = grp(world, tip.x, 0, tip.z);
        if (top > 0.02) {                                              // rak B (lebih tinggi)
            bx(g, [0.74, top, 0.74], [0, top / 2, 0], 0x4d587f);
            bx(g, [0.12, top, 0.12], [0.34, top / 2, 0.34], 0x6f7a96, false);
        }
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.62), [M(0x111), M(0x111), new THREE.MeshToonMaterial({ map: padTex(id, col), gradientMap: grad }), M(0x111), M(0x111), M(0x111)]);
        plate.position.y = top + 0.025; plate.receiveShadow = true; g.add(plate);
        pads[id] = { id, x: tip.x, z: tip.z, top: top + 0.05, obj: -1 };
    }

    /* ---------- robot ---------- */
    const baseG = grp(world, 0, 0, 0);
    bx(baseG, [3.4, 0.3, 3.4], [0, 0.15, 0], C.blackS);
    bx(baseG, [3.0, 0.1, 3.0], [0, 0.35, 0], C.metalD);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { cy(baseG, 0.13, 0.13, 0.12, [sx * 1.45, 0.34, sz * 1.45], C.metalL, null, 6); }
    const hs = H - 0.4;                                                               // tinggi bahu di dalam yawG (yawG = 0.4 di atas meja)
    const yawG = grp(baseG, 0, 0.4, 0);
    cy(yawG, 0.95, 1.05, 0.35, [0, 0.17, 0], C.metal, null, 10);
    cy(yawG, 0.7, 0.7, 0.15, [0, 0.42, 0], C.metalD, null, 10);
    bx(yawG, [1.1, 0.6, 1.1], [0, 0.75, 0], C.blue);                                  // servo base
    bx(yawG, [0.9, hs - 1.55, 0.7], [0, 1.05 + (hs - 1.55) / 2, 0], C.metal);          // tiang
    for (const sx of [-1, 1]) bx(yawG, [0.18, 0.95, 0.95], [sx * 0.58, hs, 0], C.metalL);   // pelat bahu
    bx(yawG, [0.55, 0.55, 0.45], [0.95, hs, 0], C.blue);                               // servo bahu
    cy(yawG, 0.28, 0.28, 0.3, [-0.7, hs, 0], C.metalD, [0, 0, Math.PI / 2], 8);

    const shG = grp(yawG, 0, hs, 0);
    cy(shG, 0.34, 0.34, 0.9, [0, 0, 0], C.metalL, [0, 0, Math.PI / 2], 8);
    bx(shG, [0.52, CAL.L1, 0.36], [0, CAL.L1 / 2, 0], C.metal);
    bx(shG, [0.6, 0.18, 0.5], [0, 0.55, 0], C.metalD);
    bx(shG, [0.6, 0.18, 0.5], [0, CAL.L1 - 0.5, 0], C.metalD);
    bx(shG, [0.42, 0.42, 0.62], [0, 1.4, 0.0], C.box);
    const elG = grp(shG, 0, CAL.L1, 0);
    cy(elG, 0.3, 0.3, 0.85, [0, 0, 0], C.metalL, [0, 0, Math.PI / 2], 8);
    bx(elG, [0.5, 0.45, 0.45], [0.5, 0.0, 0], C.blue);
    bx(elG, [0.4, CAL.L2, 0.3], [0, CAL.L2 / 2, 0], C.metal);
    bx(elG, [0.46, 0.16, 0.36], [0, 0.55, 0], C.metalD);
    const grG = grp(elG, 0, CAL.L2, 0);
    bx(grG, [0.95, 0.22, 0.42], [0, 0.11, 0], C.metalD);
    bx(grG, [0.55, 0.3, 0.4], [0, 0.0, 0], C.blue);
    const jawL = bx(grG, [0.14, CAL.LG - 0.15, 0.34], [-0.5, 0.22 + (CAL.LG - 0.15) / 2, 0], C.metalL);
    const jawR = bx(grG, [0.14, CAL.LG - 0.15, 0.34], [0.5, 0.22 + (CAL.LG - 0.15) / 2, 0], C.metalL);
    const jawL2 = bx(jawL, [0.1, 0.12, 0.34], [0, (CAL.LG - 0.15) / 2 - 0.06, 0], 0xff9a3c, false);
    const jawR2 = bx(jawR, [0.1, 0.12, 0.34], [0, (CAL.LG - 0.15) / 2 - 0.06, 0], 0xff9a3c, false);
    const tipN = new THREE.Object3D(); tipN.position.set(0, CAL.LG + 0.1, 0); grG.add(tipN);   // ujung jepit (pusat barang)

    /* ---------- kotak elektronik + LCD + saklar + lampu ---------- */
    const boxG = grp(world, -4.6, 0, 3.4); boxG.rotation.y = 0.42;
    bx(boxG, [3.0, 1.5, 1.5], [0, 0.75, 0], 0x2a3250);
    bx(boxG, [3.1, 0.12, 1.6], [0, 1.5, 0], 0x3b4a8f);
    const lcdC = document.createElement('canvas'); lcdC.width = 128; lcdC.height = 36; const lg = lcdC.getContext('2d');
    const lcdT = pixTex(lcdC);
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.68), new THREE.MeshBasicMaterial({ map: lcdT })); lcd.position.set(0, 0.95, 0.76); boxG.add(lcd);
    bx(boxG, [2.46, 0.84, 0.05], [0, 0.95, 0.74], 0x0a0e1d, false);
    // LED merah (belum terhubung) / kuning (terhubung) — seperti D27 / D26
    const ledR = bx(boxG, [0.22, 0.22, 0.22], [-1.1, 0.35, 0.78], glow(0xff4d6d), false);
    const ledY = bx(boxG, [0.22, 0.22, 0.22], [-0.7, 0.35, 0.78], glow(0x5a4a10), false);
    // saklar D25
    bx(boxG, [0.5, 0.2, 0.4], [1.0, 0.35, 0.78], 0x171c30);
    const lever = bx(boxG, [0.1, 0.4, 0.1], [1.0, 0.5, 0.82], C.metalL, false); lever.geometry.translate(0, 0.15, 0); lever.position.y = 0.4;
    // menara lampu status
    const tower = grp(boxG, 1.1, 1.56, -0.3);
    cy(tower, 0.1, 0.1, 0.7, [0, 0.35, 0], C.metalD, null, 6);
    const bulb = bx(tower, [0.34, 0.34, 0.34], [0, 0.86, 0], glow(0x333a55), false);
    const bulbLight = new THREE.PointLight(0x4ee1ff, 0, 4, 2); bulbLight.position.set(0, 0.9, 0); tower.add(bulbLight);

    /* ---------- sensor VL53L0X di A1 + sinar ---------- */
    const sensG = grp(world, 0, 0, 0); let beam;
    {
        const a = pads.A1, ang = Math.atan2(a.x, a.z), rr = Math.hypot(a.x, a.z) + 1.5;
        sensG.position.set(Math.sin(ang) * rr, 0, Math.cos(ang) * rr); sensG.rotation.y = ang;
        bx(sensG, [0.5, 0.2, 0.5], [0, 0.1, 0], C.blackS); cy(sensG, 0.07, 0.07, 1.3, [0, 0.85, 0], C.metalD, null, 6);
        bx(sensG, [0.34, 0.26, 0.2], [0, 1.6, 0], 0x1a3a8f); bx(sensG, [0.12, 0.12, 0.05], [0, 1.6, -0.12], glow(0xff4d6d), false);
        const st = new THREE.Vector3(sensG.position.x, 1.6, sensG.position.z), en = new THREE.Vector3(a.x, 0.25, a.z);
        const dir = en.clone().sub(st), len = dir.length();
        beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.14, len, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x4ee1ff, transparent: true, opacity: 0.5, depthWrite: false }));
        beam.position.copy(st).addScaledVector(dir, 0.5); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); beam.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
        world.add(beam);
    }

    /* ---------- barang ---------- */
    const objs = [0xff9a3c, 0x5dff8a].map((col, i) => {
        const m = bx(world, [OBJ, OBJ, OBJ], [0, 0, 0], col);
        bx(m, [OBJ * 0.5, 0.04, OBJ * 0.5], [0, OBJ / 2 + 0.005, 0], 0xffffff, false);
        return { m, pad: null, held: false, ty: 0, pop: 0, i };
    });
    const placeAt = (o, padId, instant = true) => {
        const p = pads[padId]; if (!p) return;
        if (o.pad && pads[o.pad].obj === o.i) pads[o.pad].obj = -1;
        const prev = pads[padId].obj; if (prev >= 0 && prev !== o.i) { objs[prev].pad = null; }
        o.pad = padId; o.held = false; p.obj = o.i;
        o.m.position.set(p.x, p.top + OBJ / 2, p.z); o.ty = p.top + OBJ / 2; o.pop = instant ? 0.35 : 0;
    };
    placeAt(objs[0], 'A1'); placeAt(objs[1], 'A2');
    let heldObj = null;

    /* ---------- kamera ---------- */
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.1; controls.enablePan = false;
    controls.minZoom = 0.7; controls.maxZoom = 3; controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.target.set(0, 1.9, 0);
    const PRE = {
        iso: { pos: new THREE.Vector3(9, 8, 10), target: new THREE.Vector3(-1.2, 1.2, 0.6), zoom: 1 },
        front: { pos: new THREE.Vector3(0.01, 3.4, 14), target: new THREE.Vector3(-1.0, 2.4, 0), zoom: 1.0 },
        top: { pos: new THREE.Vector3(0.01, 20, 0.02), target: new THREE.Vector3(-1.0, 0, 0.5), zoom: 1.0 },
    };
    let tween = null;
    const applyPreset = (name, instant = false) => {
        const p = PRE[name]; if (!p) return;
        if (instant) { camera.position.copy(p.pos); controls.target.copy(p.target); camera.zoom = p.zoom; camera.updateProjectionMatrix(); controls.update(); tween = null; }
        else tween = p;
    };
    controls.addEventListener('start', () => { tween = null; });
    applyPreset('iso', true);

    const resize = () => {
        const w = canvas.clientWidth || canvas.parentElement.clientWidth, h = canvas.clientHeight || canvas.parentElement.clientHeight;
        if (!w || !h) return;
        renderer.setSize(Math.ceil(w / PS), Math.ceil(h / PS), false);
        const a = w / h; camera.left = -HALF_H * a; camera.right = HALF_H * a; camera.top = HALF_H; camera.bottom = -HALF_H; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement); resize();

    /* ---------- state ---------- */
    const S = { tgt: [CAL.baseHome, CAL.shoulderHome, CAL.elbowHome, 490], cur: [CAL.baseHome, CAL.shoulderHome, CAL.elbowHome, 490], mode: 'OFF', online: false, sw: false, lcd: ['ROBOT ARM SYS', 'Initializing...'], lcdKey: '', hasData: false, rate: 14 };
    const sliderToPulse = (g) => Math.round(CAL.gripOpenPulse + (clamp(g, 138, 300) - 138) / (300 - 138) * (CAL.gripClosePulse - CAL.gripOpenPulse));
    const tmp = new THREE.Vector3();

    const drawLcd = () => {
        const key = S.lcd.join('|') + S.online + S.mode; if (key === S.lcdKey) return; S.lcdKey = key;
        const on = S.online || S.hasData;
        lg.fillStyle = on ? '#3f8a3a' : '#1a2a1a'; lg.fillRect(0, 0, 128, 36);
        lg.fillStyle = on ? '#0b2a0b' : '#1d3a1d'; lg.font = 'bold 12px monospace'; lg.textBaseline = 'top';
        lg.fillText(S.lcd[0].padEnd(16).slice(0, 16), 2, 3); lg.fillText(S.lcd[1].padEnd(16).slice(0, 16), 2, 19);
        lcdT.needsUpdate = true;
    };

    let running = true, raf = 0, last = performance.now(), tAcc = 0;
    const clock = new THREE.Clock();
    const animate = () => {
        raf = requestAnimationFrame(animate);
        if (!running) return;
        const dt = Math.min(clock.getDelta(), 0.05), t = (tAcc += dt);

        // pulsa halus menuju target (pesan datang tiap ~300 ms)
        const k = 1 - Math.exp(-dt * S.rate);
        for (let i = 0; i < 4; i++) S.cur[i] += (S.tgt[i] - S.cur[i]) * k;
        const [pb, ps, pe, pg] = S.cur;
        yawG.rotation.y = yawOf(pb); shG.rotation.x = aOf(ps); elG.rotation.x = phiOf(pe);
        const open = 1 - clamp((pg - CAL.gripOpenPulse) / (CAL.gripClosePulse - CAL.gripOpenPulse), 0, 1);
        let gap = 0.1 + open * 1.0;
        if (heldObj) gap = Math.max(gap, OBJ + 0.02);
        jawL.position.x = -(gap / 2 + 0.07); jawR.position.x = gap / 2 + 0.07;

        // ambil / lepas barang
        world.updateMatrixWorld(true);
        tipN.getWorldPosition(tmp);
        if (!heldObj && pg >= 525) {
            let best = null, bd = 0.6;
            for (const o of objs) { const d = o.m.position.distanceTo(tmp); if (d < bd) { bd = d; best = o; } }
            if (best) { heldObj = best; best.held = true; if (best.pad && pads[best.pad].obj === best.i) pads[best.pad].obj = -1; best.pad = null; }
        } else if (heldObj && pg < 515) {
            let bp = null, bd = 0.75;
            for (const p of Object.values(pads)) { const d = Math.hypot(p.x - tmp.x, p.z - tmp.z); if (d < bd && p.obj < 0) { bd = d; bp = p; } }
            heldObj.held = false;
            if (bp) { heldObj.pad = bp.id; bp.obj = heldObj.i; heldObj.ty = bp.top + OBJ / 2; heldObj.m.position.x = bp.x; heldObj.m.position.z = bp.z; }
            else heldObj.ty = OBJ / 2;
            heldObj = null;
        }
        for (const o of objs) {
            if (o.held) { o.m.position.copy(tmp); o.m.rotation.y = yawG.rotation.y; }
            else {
                o.m.position.y = damp(o.m.position.y, o.ty, 14, dt);
                if (o.pop > 0) { o.pop -= dt; o.m.scale.setScalar(1 + Math.sin(clamp(o.pop / 0.35, 0, 1) * Math.PI) * 0.35); } else o.m.scale.setScalar(1);
            }
        }

        // sensor: sinar merah bila ada barang di A1
        const aObj = pads.A1.obj >= 0;
        beam.material.color.setHex(aObj ? 0xff4d6d : 0x4ee1ff);
        beam.material.opacity = S.mode === 'AUTO' ? 0.35 + Math.sin(t * 6) * 0.2 : 0.12;

        // LED & menara lampu
        const link = S.online;
        ledR.material.color.setHex(link ? 0x3a1018 : 0xff4d6d); ledY.material.color.setHex(link ? 0xffd84a : 0x5a4a10);
        const mc = !link && !S.hasData ? 0xff4d6d : ({ IDLE: 0x4ee1ff, AUTO: 0x5dff8a, APP: 0xffd84a, MEMORY: 0xb48cff })[S.mode] ?? 0x333a55;
        bulb.material.color.setHex(Math.floor(t * 3) % 2 === 0 || S.mode === 'IDLE' ? mc : 0x333a55);
        bulbLight.color.setHex(mc); bulbLight.intensity = 6;
        lever.rotation.z = damp(lever.rotation.z, S.sw ? -0.6 : 0.6, 14, dt);

        world.position.y = Math.sin(t * 0.8) * 0.03;
        if (tween) {
            camera.position.x = damp(camera.position.x, tween.pos.x, 5, dt); camera.position.y = damp(camera.position.y, tween.pos.y, 5, dt); camera.position.z = damp(camera.position.z, tween.pos.z, 5, dt);
            controls.target.x = damp(controls.target.x, tween.target.x, 5, dt); controls.target.y = damp(controls.target.y, tween.target.y, 5, dt); controls.target.z = damp(controls.target.z, tween.target.z, 5, dt);
            camera.zoom = damp(camera.zoom, tween.zoom, 5, dt); camera.updateProjectionMatrix();
            if (camera.position.distanceTo(tween.pos) < 0.02) tween = null;
        }
        controls.update();
        drawLcd();
        renderer.render(scene, camera);
    };
    resize(); drawLcd(); renderer.render(scene, camera); animate();

    return {
        /** pos dalam skala slider sketch: [base, shoulder, elbow, gripper(138..300)] */
        setPos(a, snap = false) {
            S.tgt = [a[0], a[1], a[2], sliderToPulse(a[3])];
            if (snap) S.cur = S.tgt.slice();
            S.hasData = true;
        },
        setRate(r) { S.rate = r; },
        setMode(m) { S.mode = m; },
        setOnline(v) { S.online = !!v; },
        setSwitch(v) { S.sw = !!v; },
        setLcd(l1, l2) { S.lcd = [l1, l2]; },
        setHasData(v) { S.hasData = !!v; },
        /** pastikan ada barang di titik (dipakai saat log "barang terdeteksi" / fase memory) */
        ensureAt(padId, preferIdx = -1) {
            const p = pads[padId]; if (!p || p.obj >= 0) return;
            let o = preferIdx >= 0 ? objs[preferIdx] : null;
            if (!o || o.held) o = objs.find(x => !x.held && x.pad && x.pad[0] !== padId[0]) || objs.find(x => !x.held);
            if (o && !o.held) placeAt(o, padId);
        },
        resetObjects() { if (heldObj) { heldObj.held = false; heldObj = null; } pads.A1.obj = pads.A2.obj = pads.B1.obj = pads.B2.obj = -1; placeAt(objs[0], 'A1'); placeAt(objs[1], 'A2'); },
        padOf: (i) => objs[i].pad,
        get holding() { return !!heldObj; },
        cam: applyPreset,
        autoRotate(v) { controls.autoRotate = !!v; return controls.autoRotate; },
        get isAutoRotate() { return controls.autoRotate; },
        pause(v) { running = !v; if (!v) clock.getDelta(); },
        resize,
        debug: { fk: (b, s, e) => fk(b, s, e, H), H, pads, tip: () => { tipN.getWorldPosition(tmp); return tmp.toArray(); }, camera, scene },
        dispose() { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); },
    };
}
