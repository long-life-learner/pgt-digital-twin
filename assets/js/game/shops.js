/* Lima toko yang bisa dimasuki: Warung Madura, Kafe Pixel, Bengkel Budi, Minimart, Balai Desa.
   Konvensi lokal: pintu = +z. Dinding = Mx unik (wallMat), atap = Group terpisah (rf). */
import { THREE, PI, M, Mx, bx, cy, grp, glow, signMesh, pixTex, rng, addBoxC, addCircle } from './kit.js';

export function buildShops(ctx) {
    const { world, spots, claim, lightSources, mats, buildCar, buildMotor } = ctx;
    const R = rng(4242);
    spots.posts = spots.posts || {}; spots.counters = spots.counters || []; spots.chairs = spots.chairs || [];
    spots.tables = spots.tables || {}; spots.shops = spots.shops || {};
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const glassM = Mx(0xb8e6ff, { transparent: true, opacity: 0.35 });
    const lampM = glow(0xfff2cc);
    const pick = (a) => a[(R() * a.length) | 0];
    const enclosures = [], shopsList = [];
    const SNACK = [0xe74c3c, 0xf1c40f, 0xe67e22, 0x27ae60, 0x3498db, 0xd35400, 0xf5f0e0, 0x9b59b6];
    const DRINK = [0xe74c3c, 0x2ecc71, 0xf39c12, 0x3498db, 0xecf0f1, 0x8e5a3c, 0xff6fa5];

    function Shop(id, title, cx, cz, w, d, rot, h, o) {
        const { wall, floor, roofC, trim, dw, dh, zone = [dw, 3] } = o;
        const g = grp(world, cx, 0, cz); g.rotation.y = rot;
        const c = Math.cos(rot), s = Math.sin(rot), swap = Math.abs(s) > 0.5;
        const W = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
        const col = (x, z, a, b) => { const [X, Z] = W(x, z); addBoxC(X, Z, swap ? b : a, swap ? a : b); };
        const circ = (x, z, r) => { const [X, Z] = W(x, z); addCircle(X, Z, r); };
        const wm = Mx(wall), rf = grp(g);
        const S = { g, rf, wm, W, col, circ, w, d, h, id, title };
        bx(g, [w, 0.08, d], [0, 0.04, 0], floor, false);
        const wl = (a, b, x, z, y0 = 0, hh = h) => { bx(g, [a, hh, b], [x, y0 + hh / 2, z], wm, true); if (y0 === 0) col(x, z, a, b); };
        wl(w + 0.4, 0.4, 0, -d / 2); wl(0.4, d, -w / 2, 0); wl(0.4, d, w / 2, 0);
        const sl = w / 2 + 0.2 - dw / 2, sx = (w / 2 + 0.2 + dw / 2) / 2;
        wl(sl, 0.4, -sx, d / 2); wl(sl, 0.4, sx, d / 2); wl(dw, 0.4, 0, d / 2, dh, h - dh);
        for (const k of [-1, 1]) bx(g, [0.22, dh, 0.5], [k * (dw / 2 + 0.11), dh / 2, d / 2], trim, false);
        bx(g, [w + 0.5, 0.2, 0.55], [0, h - 0.1, d / 2], trim, false);
        // atap bertingkat
        bx(rf, [w + 1.2, 0.4, d + 1.2], [0, h + 0.2, 0], roofC, true);
        bx(rf, [w - 0.8, 0.5, d - 0.8], [0, h + 0.65, 0], roofC, true);
        bx(rf, [w - 3.2, 0.5, d - 3.2], [0, h + 1.15, 0], roofC, true);
        // jendela
        S.win = (x, z, ax, ww, y = 1.9, hh = 1.2) => {
            const f = ax === 'x';
            bx(g, f ? [ww, hh, 0.5] : [0.5, hh, ww], [x, y, z], mats.win, false);
            bx(g, f ? [ww + 0.2, 0.1, 0.56] : [0.56, 0.1, ww + 0.2], [x, y - hh / 2 - 0.05, z], trim, false);
            bx(g, f ? [0.06, hh, 0.56] : [0.56, hh, 0.06], [x, y, z], trim, false);
        };
        S.sign = (text, sw, sh, y, bg, fg, x = 0) => signMesh(g, text, sw, sh, [x, y, d / 2 + 0.21], 0, bg, fg);
        S.panel = (x, z, a = 1.6, b = 0.8) => bx(rf, [a, 0.06, b], [x, h - 0.04, z], lampM, false);
        S.light = (x, y, z) => { const [X, Z] = W(x, z); lightSources.push({ x: X, y, z: Z, color: 0xfff0c8, I: 18, dist: 11, on: () => ctx.nightOn() }); };
        S.post = (pid, x, z, ly = 0) => { const [X, Z] = W(x, z); spots.posts[pid] = { x: X, z: Z, yaw: rot + ly }; };
        S.cnt = (pid, x, z) => { const [X, Z] = W(x, z); spots.counters.push({ id: pid, x: X, z: Z, r: 1.9 }); };
        S.seat = (x, z, ly, name, venue) => { const [X, Z] = W(x, z); spots.chairs.push({ x: X, z: Z, yaw: rot + ly, y: 0.5, name, venue }); };
        // prop kotak + tabrakan
        S.P = (a, b, e, x, z, color, { y0 = 0, c: cc = true } = {}) => { const m = bx(g, [a, b, e], [x, y0 + b / 2, z], color); if (cc) col(x, z, a, e); return m; };
        S.counter = (x, z, len, dep, body, top) => { S.P(len, 1.0, dep, x, z, body); bx(g, [len + 0.2, 0.06, dep + 0.2], [x, 1.03, z], top, false); };
        S.plant = (x, z) => { cy(g, 0.22, 0.17, 0.35, [x, 0.18, z], 0xb5563c); bx(g, [0.4, 0.55, 0.4], [x, 0.62, z], 0x3a9a4a, false); bx(g, [0.26, 0.4, 0.26], [x, 1.05, z], 0x56b85e, false); circ(x, z, 0.3); };
        // barang kecil (InstancedMesh)
        const it = []; S.it = it;
        S.G = (x, y, z, a, b, e, color) => it.push([x, y, z, a, b, e, color]);
        S.chair = (x, z, ly, color, name, venue) => {
            const sn = Math.sin(ly), cs = Math.cos(ly), sw = Math.abs(sn) > 0.5;
            S.G(x, 0.45, z, 0.42, 0.06, 0.42, color); S.G(x, 0.22, z, 0.1, 0.44, 0.1, 0x3a3f4e);
            S.G(x - 0.2 * sn, 0.72, z - 0.2 * cs, sw ? 0.06 : 0.42, 0.48, sw ? 0.42 : 0.06, color);
            S.seat(x, z, ly, name, venue);
        };
        S.flush = (list = it, mat = M(0xffffff)) => {
            if (!list.length) return null;
            const m = new THREE.InstancedMesh(unit, mat, list.length), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), cc = new THREE.Color();
            list.forEach(([x, y, z, a, b, e, col2], i) => { mx.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(a, b, e)); m.setMatrixAt(i, mx); m.setColorAt(i, cc.setHex(col2)); });
            m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
            m.frustumCulled = false; m.receiveShadow = true; g.add(m); return m;
        };
        // rak berisi barang
        S.shelf = (x, z, len, dep, hgt, tiers, pal, { both = false, frame = 0xb98a52 } = {}) => {
            const step = (hgt - 0.1) / tiers, idd = Math.min(0.3, dep / 2 - 0.06);
            bx(g, [len, hgt, 0.05], [x, hgt / 2, both ? z : z - dep / 2 + 0.025], frame, false);
            for (let t = 0; t <= tiers; t++) bx(g, [len, 0.05, dep], [x, 0.08 + t * step, z], frame, false);
            for (const k of [-1, 1]) bx(g, [0.05, hgt, dep], [x + k * len / 2, hgt / 2, z], frame, false);
            col(x, z, len, dep);
            for (const sd of both ? [1, -1] : [1]) {
                const zc = both ? z + sd * (dep / 2 - 0.04 - idd / 2) : z - dep / 2 + 0.04 + idd / 2;
                for (let t = 0; t < tiers; t++) {
                    for (let xx = -len / 2 + 0.12; xx < len / 2 - 0.12;) {
                        const ww = 0.14 + R() * 0.08, gh = Math.min(step - 0.08, 0.16 + R() * 0.2);
                        S.G(x + xx + ww / 2, 0.08 + t * step + 0.025 + gh / 2, zc, ww, gh, idd, pick(pal));
                        xx += ww + 0.03;
                    }
                }
            }
        };
        // finalisasi: daftar & registri tapak
        S.done = (name) => {
            claim(`toko-${id}`, 'solid', cx, cz, w + 0.4, d + 0.4, { rot });
            const [zx, zz] = W(0, d / 2 + 0.2 + zone[1] / 2);
            claim(`pintu-${id}`, 'flat', zx, zz, zone[0], zone[1], { rot, block: true });
            S.flush();
            const hx = (swap ? d : w) / 2, hz = (swap ? w : d) / 2;
            const inside = (x, z) => Math.abs(x - cx) < hx - 0.2 && Math.abs(z - cz) < hz - 0.2;
            const [dx, dz] = W(0, d / 2 + 0.7);
            spots.shops[id] = { x: cx, z: cz, door: { x: dx, z: dz }, inside };
            enclosures.push({ name, inside, roof: rf, wallMat: wm });
            shopsList.push({ id, name, rot, x: cx, z: cz, door: { x: dx, z: dz }, inside, roof: rf, wallMat: wm });
        };
        S.awning = (wid, dep, y, c1, c2) => {
            const n = Math.round(wid / 1.1), sw = wid / n, t = 0.15;
            for (let i = 0; i < n; i++) {
                const x = -wid / 2 + sw * (i + 0.5), cc = i % 2 ? c1 : c2;
                bx(g, [sw, 0.07, dep], [x, y, d / 2 + 0.2 + dep / 2], cc, false).rotation.x = t;
                bx(g, [sw, 0.26, 0.05], [x, y - Math.sin(t) * dep / 2 - 0.1, d / 2 + 0.2 + Math.cos(t) * dep / 2 * 2 * 0.5 + dep / 2 * (1 - Math.cos(t)) * 0 + dep / 2], cc, false);
            }
        };
        return S;
    }

    /* ================= 1. WARUNG MADURA ================= */
    {
        const S = Shop('madura', 'Warung Madura', 40, -2, 10, 8, 0, 4, { wall: 0xf3e3a6, floor: 0xb9b2a0, roofC: 0x1c4fb8, trim: 0x1c4fb8, dw: 3.4, dh: 2.9 });
        const { g, G } = S;
        // rolling shutter di atas pintu + papan nama
        bx(g, [3.6, 0.5, 0.35], [0, 2.65, 4.38], 0x8f97a8, false);
        for (const y of [2.5, 2.65, 2.8]) bx(g, [3.6, 0.03, 0.02], [0, y, 4.57], 0x5b6275, false);
        S.sign('WARUNG MADURA', 4.6, 0.75, 3.5, '#1c4fb8', '#ffe03a');
        S.sign('BUKA 24 JAM', 2.2, 0.4, 2.7, '#ffe03a', '#1c4fb8', 3.5);
        bx(g, [10.4, 0.2, 0.5], [0, 3.9, 4.0], 0xffd23a, false);
        S.win(-3.5, 4, 'x', 2.0); S.win(-5, -1, 'z', 2.0); S.win(5, 2.9, 'z', 1.6);
        // meja kasir + etalase kaca
        S.counter(-1.6, -0.3, 6.2, 1.0, 0xcfa56a, 0xe8cf9a);
        bx(g, [2.0, 0.5, 0.7], [-3.6, 1.31, -0.3], glassM, false); bx(g, [2.0, 0.05, 0.7], [-3.6, 1.08, -0.3], 0xd0d4dc, false);
        for (let i = 0; i < 8; i++) G(-4.4 + i * 0.22, 1.19, -0.3, 0.18, 0.2, 0.18, pick(SNACK));
        for (const x of [-0.3, 0.3]) for (let k = 0; k < 4; k++) G(x, 1.085 + k * 0.055, -0.3, 0.32, 0.05, 0.32, 0xd9c9a0);   // tray telur
        bx(g, [0.9, 1.1, 0.05], [0.9, 1.6, -0.65], 0x333845, false);                                                     // rak sachet gantung
        for (let r = 0; r < 6; r++) for (let k = 0; k < 5; k++) G(0.54 + k * 0.18, 1.2 + r * 0.17, -0.61, 0.12, 0.15, 0.02, pick(SNACK));
        for (let k = 0; k < 8; k++) G(-4.6 + k * 0.4, 2.7 + (k % 2) * 0.1, 3.7, 0.14, 0.25, 0.02, pick(SNACK));          // sachet digantung
        cy(g, 0.22, 0.22, 0.06, [-3.2, 0.5, -1.4], 0xc0392b, null, 8, false); cy(g, 0.05, 0.05, 0.5, [-3.2, 0.25, -1.4], 0x555b70, null, 6, false);   // bangku kecil
        // rak belakang penuh
        S.shelf(0, -3.5, 9.2, 0.5, 2.4, 5, SNACK);
        // freezer es krim / minuman (glow biru)
        S.P(0.9, 0.9, 2.0, 4.3, -1.4, 0xe8eef2);
        bx(g, [0.7, 0.04, 1.8], [4.3, 0.92, -1.4], glow(0x5fb8ff), false);
        signMesh(g, 'ES KRIM', 1.4, 0.5, [4.77, 2.0, -1.4], -PI / 2, '#2b6fd6', '#fff');
        // galon biru + LPG hijau 3 kg
        for (const [x, z] of [[4.35, 2.0], [4.35, 2.7], [3.8, 2.0], [3.8, 2.7]]) { cy(g, 0.19, 0.19, 0.45, [x, 0.23, z], 0x2b6fd6, null, 10, false); cy(g, 0.1, 0.1, 0.1, [x, 0.5, z], 0x9fd8ff, null, 8, false); }
        for (const [x, z] of [[4.35, 3.3], [3.85, 3.3], [4.1, 3.0]]) { cy(g, 0.16, 0.16, 0.5, [x, 0.25, z], 0x3aa05a, null, 10, false); cy(g, 0.06, 0.06, 0.1, [x, 0.55, z], 0x333845, null, 6, false); }
        S.col(4.1, 2.35, 1.2, 1.1); S.col(4.1, 3.2, 1.2, 0.8);
        // karung beras
        for (const [x, y, z] of [[-4.3, 0.15, 2.4], [-4.3, 0.15, 3.3], [-4.3, 0.45, 2.85]]) bx(g, [0.6, 0.3, 0.8], [x, y, z], y > 0.3 ? 0xc9b27a : 0xeee4c8, false);
        S.col(-4.3, 2.85, 0.7, 1.8);
        // bangku luar
        bx(g, [1.5, 0.08, 0.45], [-3.8, 0.5, 4.75], 0x8a5a33, false); bx(g, [1.5, 0.4, 0.06], [-3.8, 0.75, 4.55], 0x8a5a33, false);
        for (const k of [-1, 1]) bx(g, [0.08, 0.46, 0.4], [-3.8 + k * 0.65, 0.23, 4.75], 0x333845, false);
        { const [bx2, bz2] = S.W(-3.8, 4.75); claim('bangku-madura', 'solid', bx2, bz2, 1.7, 0.7, { rot: 0 }); }
        S.col(-3.8, 4.75, 1.6, 0.5); S.seat(-4.2, 4.75, 0, 'Bangku Warung', 'madura'); S.seat(-3.4, 4.75, 0, 'Bangku Warung', 'madura');
        S.panel(-1, 0.8, 1.8, 0.25); S.panel(2, -1.5, 1.8, 0.25);
        S.light(-1.5, 3.7, 0.5); S.light(2, 3.7, -1.5);
        S.post('madi', -1.8, -1.2); S.cnt('madi', -1.8, 0.9);
        S.done('Warung Madura');
    }

    /* ================= 2. KAFE PIXEL ================= */
    {
        const S = Shop('kafe', 'Kafe Pixel', 76, -2, 12, 8, 0, 4, { wall: 0xe0b48f, floor: 0x9c7a55, roofC: 0x5a3a2a, trim: 0x3a2418, dw: 3.4, dh: 2.9 });
        const { g, G } = S;
        S.sign('KAFE PIXEL', 4.4, 0.7, 3.6, '#3a2418', '#ffcf5a');
        S.awning(11, 2.4, 2.95, 0xd9344a, 0xf4f0e6);
        S.win(-4.2, 4, 'x', 2.6); S.win(4.2, 4, 'x', 2.6); S.win(-6, 0, 'z', 2.2); S.win(6, -1, 'z', 2.2);
        // konter barista
        S.counter(-3.3, -2.4, 4.6, 0.8, 0x7a4f2a, 0xc9a36b);
        bx(g, [0.7, 0.45, 0.5], [-2.0, 1.285, -2.4], 0x9aa3b5, false); bx(g, [0.7, 0.1, 0.5], [-2.0, 1.56, -2.4], 0x2b2f3c, false);
        for (const x of [-2.2, -1.8]) { bx(g, [0.08, 0.12, 0.08], [x, 1.2, -2.12], 0x555b70, false); G(x, 1.12, -2.0, 0.1, 0.1, 0.1, 0xffffff); }
        bx(g, [1.3, 0.45, 0.6], [-4.4, 1.3, -2.4], glassM, false); bx(g, [1.3, 0.05, 0.6], [-4.4, 1.08, -2.4], 0xd0d4dc, false);   // etalase kue
        for (let i = 0; i < 4; i++) cy(g, 0.17, 0.17, 0.15, [-4.8 + i * 0.32, 1.16, -2.4], pick([0xf6a6c1, 0x6b3a22, 0xf4e3b2, 0xd9344a]), null, 8, false);
        bx(g, [0.4, 0.25, 0.3], [-2.9, 1.18, -2.3], 0x333845, false); bx(g, [0.25, 0.14, 0.02], [-2.9, 1.34, -2.18], glow(0x6dff9a), false);   // kasir
        S.shelf(-3.4, -3.6, 4.6, 0.4, 2.2, 3, [0xffffff, 0xe9dcc8, 0xc0392b, 0x3498db], { frame: 0x5a3a22 });
        // papan menu kapur
        {
            const cv = document.createElement('canvas'); cv.width = 128; cv.height = 70; const x2 = cv.getContext('2d');
            x2.fillStyle = '#26332e'; x2.fillRect(0, 0, 128, 70); x2.fillStyle = '#f2efe0'; x2.textBaseline = 'top';
            ['MENU', 'KOPI SUSU 15K', 'LATTE      22K', 'ES TEH      8K', 'ROTI BAKAR 18K'].forEach((t, i) => { x2.font = 'bold 10px monospace'; x2.textAlign = i ? 'left' : 'center'; x2.fillText(t, i ? 14 : 64, 4 + i * 12.5); });
            bx(g, [2.72, 1.52, 0.05], [3.0, 2.2, -3.78], 0x7a4f2a, false);
            const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), new THREE.MeshBasicMaterial({ map: pixTex(cv) })); m.position.set(3.0, 2.2, -3.74); g.add(m);
        }
        // meja bulat + kursi
        const tb = (x, z, ax, venue = 'kafe') => {
            cy(g, 0.45, 0.45, 0.05, [x, 0.75, z], 0xc9a36b, null, 12, false); cy(g, 0.06, 0.06, 0.72, [x, 0.36, z], 0x3a3f4e, null, 6, false); cy(g, 0.25, 0.25, 0.04, [x, 0.02, z], 0x3a3f4e, null, 8, false);
            S.circ(x, z, 0.5); const [X, Z] = S.W(x, z); (spots.tables.kafe = spots.tables.kafe || []).push({ x: X, z: Z });
            if (ax === 'x') { S.chair(x - 0.75, z, PI / 2, 0x9a6a3d, 'Kursi Kafe', venue); S.chair(x + 0.75, z, -PI / 2, 0x9a6a3d, 'Kursi Kafe', venue); }
            else { S.chair(x, z - 0.75, 0, 0x9a6a3d, 'Kursi Kafe', venue); S.chair(x, z + 0.75, PI, 0x9a6a3d, 'Kursi Kafe', venue); }
        };
        tb(2.4, -2.5, 'x'); tb(4.8, -2.5, 'x'); tb(-3.0, 1.8, 'x'); tb(-5.0, 0.3, 'z');
        // sudut sofa
        const sg = grp(g, 5.2, 0, 1.6); sg.rotation.y = -PI / 2;
        bx(sg, [2.0, 0.4, 0.9], [0, 0.2, 0], 0x3f6fa8); bx(sg, [2.0, 0.5, 0.25], [0, 0.65, -0.33], 0x3f6fa8);
        for (const k of [-1, 1]) { bx(sg, [0.2, 0.3, 0.9], [k * 0.9, 0.5, 0], 0x35608f, false); bx(sg, [0.8, 0.12, 0.6], [k * 0.4, 0.46, 0.08], 0x5b8ccc, false); }
        S.col(5.2, 1.6, 0.9, 2.0); S.seat(5.2, 1.1, -PI / 2, 'Kursi Kafe', 'kafe'); S.seat(5.2, 2.1, -PI / 2, 'Kursi Kafe', 'kafe');
        S.P(0.7, 0.35, 0.7, 3.9, 1.6, 0xc9a36b);
        S.plant(-5.3, 3.2); S.plant(5.3, -0.8);
        // lampu gantung (glow) + lampu hias
        for (const [x, z] of [[2.4, -2.5], [4.8, -2.5], [-3.0, 1.8], [-5.0, 0.3]]) { bx(S.rf, [0.03, 0.9, 0.03], [x, 3.55, z], 0x222222, false); cy(S.rf, 0.12, 0.25, 0.18, [x, 3.0, z], glow(0xffcf7a), null, 8, false); }
        const sl = []; for (let i = 0; i < 23; i++) sl.push([-5.6 + i * 0.5, 3.4 + (i % 2) * 0.12, -3.72, 0.1, 0.1, 0.1, pick([0xffd98a, 0xff9ab0, 0x9ad8ff])]);
        S.flush(sl, glow(0xffffff));
        S.panel(0, 0.5, 1.4, 0.5);
        S.light(0, 3.7, 0.5); S.light(-3.3, 3.7, -1.8); S.light(4, 3.7, 1.5);
        S.post('rina', -3.3, -3.1); S.cnt('rina', -3.3, -1.2);
        // meja luar (di bawah tenda), di luar zona pintu
        for (const x of [-4.0, 4.0]) {
            const [X, Z] = S.W(x, 6.0); claim(`meja-luar-${x}`, 'solid', X, Z, 1.2, 2.2, { rot: 0 });
            tb(x, 6.0, 'z');
        }
        for (const x of [-2.4, 2.4]) { const [X, Z] = S.W(x, 4.7); claim(`pot-kafe-${x}`, 'solid', X, Z, 0.7, 0.7, { rot: 0 }); S.plant(x, 4.7); }
        S.done('Kafe Pixel');
    }

    /* ================= 3. BENGKEL BUDI ================= */
    {
        const S = Shop('bengkel', 'Bengkel Budi', 96, -3, 14, 10, 0, 5, { wall: 0x8d97aa, floor: 0x6d727f, roofC: 0x3a4052, trim: 0xf2b705, dw: 6, dh: 3.4, zone: [8, 3.8] });
        const { g, G } = S;
        bx(g, [6.2, 0.3, 0.4], [0, 3.3, 5.3], 0x555b70, false);
        S.sign('BENGKEL BUDI', 6.4, 0.9, 4.45, '#f2b705', '#1b1d24');
        S.sign('OLI', 1.6, 0.9, 3.3, '#c0392b', '#ffffff', 5.3);
        S.win(-5.2, 5, 'x', 2.0, 2.2); S.win(-7, 0, 'z', 2.4, 2.8, 1.0); S.win(7, 0, 'z', 2.4, 2.8, 1.0); S.win(-5.2, -5, 'x', 2.0, 2.8, 1.0); S.win(5.2, -5, 'x', 2.0, 2.8, 1.0);
        // garis lantai kuning
        for (const [x, z, a, b] of [[-3.5, -3.2, 5.4, 0.1], [-3.5, 1.2, 5.4, 0.1], [-6.2, -1, 0.1, 4.4], [-0.8, -1, 0.1, 4.4], [0, 3.5, 0.1, 3]]) bx(g, [a, 0.02, b], [x, 0.09, z], 0xf2b705, false);
        // mobil di lift 2-tiang
        const car = buildCar(0x2f6fd6); car.root.position.set(-3.5, 1.5, -1.0); car.root.rotation.y = PI / 2; g.add(car.root);
        for (const z of [-2.4, 0.4]) {
            bx(g, [0.3, 3.2, 0.3], [-3.5, 1.6, z], 0xf2b705); bx(g, [0.8, 0.06, 0.6], [-3.5, 0.03, z], 0x2b2f3c, false);
            bx(g, [2.4, 0.14, 0.18], [-3.5, 1.68, z], 0x555b70, false);
            for (const x of [-4.5, -2.5]) bx(g, [0.3, 0.1, 0.3], [x, 1.72, z + (z < -1 ? 0.5 : -0.5)], 0x2b2f3c, false);
            S.circ(-3.5, z, 0.3);
        }
        bx(g, [0.2, 0.18, 2.9], [-3.5, 3.4, -1.0], 0xf2b705, false);
        S.col(-3.5, -1.0, 4.2, 2.0);
        // motor di dudukan
        bx(g, [1.2, 0.45, 0.35], [3.8, 0.225, -1.5], 0x555b70, false);
        const mo = buildMotor(0xd9344a); mo.root.position.set(3.8, 0.45, -1.5); mo.root.rotation.y = PI / 2; g.add(mo.root);
        S.col(3.8, -1.5, 1.9, 0.7);
        // meja kerja + ragum + dinding perkakas
        S.P(4.0, 0.9, 0.8, 3.2, -4.4, 0x7a5a3a); bx(g, [4.1, 0.08, 0.9], [3.2, 0.94, -4.4], 0xb08a5a, false);
        bx(g, [0.2, 0.25, 0.3], [1.9, 1.1, -4.2], 0x2a2f3c, false); bx(g, [0.06, 0.18, 0.3], [1.9, 1.15, -4.04], 0xc0392b, false);
        bx(g, [6.8, 1.2, 0.06], [2.0, 1.9, -4.75], 0x3b4152, false);
        for (let i = 0; i < 40; i++) G(-1.2 + (i % 20) * 0.34 + R() * 0.1, 1.55 + (i < 20 ? 0.35 : -0.05) , -4.7, 0.06, 0.28 + R() * 0.15, 0.03, pick([0xb8bfcc, 0xd9a441, 0xc0392b, 0x555b70]));
        // kabinet / troli perkakas (tempat Budi berdiri di depannya)
        S.P(1.2, 0.9, 0.6, 0.8, -2.5, 0xc0392b);
        // rak suku cadang
        S.shelf(-3.5, -4.55, 2.6, 0.5, 2.2, 4, [0x2b5fb8, 0xf2b705, 0xc0392b, 0xb8bfcc, 0x27ae60], { frame: 0x555b70 });
        // ban, drum oli, kompresor
        for (const [x, z, n] of [[6.2, -4.3, 4], [6.2, -3.4, 3]]) { for (let k = 0; k < n; k++) cy(g, 0.38, 0.38, 0.22, [x, 0.19 + k * 0.22, z], 0x1b1d24, null, 10, false); S.circ(x, z, 0.4); }
        for (const [x, z, c2] of [[-6.3, -4.2, 0x2b5fb8], [-5.6, -4.4, 0xc0392b], [-6.3, -3.4, 0x2b5fb8]]) { cy(g, 0.3, 0.3, 0.9, [x, 0.45, z], c2, null, 10); cy(g, 0.31, 0.31, 0.05, [x, 0.65, z], 0x2b2f3c, null, 10, false); S.circ(x, z, 0.32); }
        cy(g, 0.28, 0.28, 1.0, [6.1, 0.6, 2.6], 0xc0392b, [PI / 2, 0, 0], 10); bx(g, [0.3, 0.25, 0.3], [6.1, 1.0, 2.6], 0x2b2f3c, false);
        for (const z of [2.2, 3.0]) bx(g, [0.06, 0.3, 0.06], [6.1, 0.15, z], 0x2b2f3c, false);
        S.col(6.1, 2.6, 0.7, 1.1);
        S.panel(-2, 0, 2.4, 0.4); S.panel(2.5, 0, 2.4, 0.4);
        S.light(-3, 4.5, 0); S.light(2.5, 4.5, 0); S.light(0.8, 4.5, -1.2);
        S.post('budi', 0.8, -1.5); S.cnt('budi', 0.8, 0.4);
        S.done('Bengkel Budi');
        // halaman depan: mobil kuning + motor parkir (dekor, bertabrakan)
        const pc = buildCar(0xf2b705); pc.root.position.set(87.5, 0, 4); pc.root.rotation.y = PI / 2; world.add(pc.root);
        claim('mobil-bengkel', 'solid', 87.5, 4, 4.3, 2.1, { rot: 0 }); addBoxC(87.5, 4, 4.1, 1.9);
        const pm = buildMotor(0x2f9e6e); pm.root.position.set(104.5, 0, 4); pm.root.rotation.y = -PI / 2; world.add(pm.root);
        claim('motor-bengkel', 'solid', 104.5, 4, 1.9, 0.8, { rot: 0 }); addBoxC(104.5, 4, 1.7, 0.6);
    }

    /* ================= 4. MINIMART (rot PI: pintu menghadap -z) ================= */
    {
        const S = Shop('mart', 'Minimart', 40, 22, 10, 8, PI, 4, { wall: 0xe8eef2, floor: 0xcfd6df, roofC: 0x2a6fd6, trim: 0xd9344a, dw: 3.2, dh: 2.9 });
        const { g, G } = S;
        S.sign('MINIMART', 4.6, 0.8, 3.5, '#d9344a', '#ffffff');
        bx(g, [10.4, 0.18, 0.5], [0, 3.88, 4.0], 0x2a6fd6, false);
        S.win(-3.5, 4, 'x', 2.4); S.win(3.5, 4, 'x', 2.4); S.win(-5, 2, 'z', 1.8); S.win(5, 3, 'z', 1.2);
        bx(g, [2.8, 0.03, 1.0], [0, 0.1, 3.2], 0x2a2f3c, false);
        // lemari pendingin dinding (glow)
        S.P(5.2, 0.2, 0.8, -2, -3.4, 0xdde3ea); bx(g, [5.2, 0.2, 0.8], [-2, 2.2, -3.4], 0xdde3ea, false);
        for (const k of [-1, 1]) bx(g, [0.1, 2.0, 0.8], [-2 + k * 2.55, 1.1, -3.4], 0xdde3ea, false);
        bx(g, [5.0, 1.9, 0.05], [-2, 1.15, -3.75], glow(0x7fd8ff), false);
        for (let t = 0; t < 4; t++) {
            const y = 0.45 + t * 0.5; bx(g, [5.0, 0.04, 0.7], [-2, y, -3.45], 0xdde3ea, false);
            for (let x = -4.4; x < 0.4; x += 0.17) { G(x, y + 0.16, -3.55, 0.08, 0.28, 0.08, pick(DRINK)); G(x + 0.05, y + 0.16, -3.3, 0.08, 0.28, 0.08, pick(DRINK)); }
        }
        S.col(-2, -3.4, 5.2, 0.8);
        for (const x of [-4.1, -3.05, -2, -0.95, 0.1]) bx(g, [1.0, 1.9, 0.03], [x, 1.15, -2.98], glassM, false);
        // freezer
        for (const z of [-2.4, -0.8]) { S.P(0.9, 0.9, 1.4, 4.2, z, 0xf2f6f8); bx(g, [0.7, 0.04, 1.2], [4.2, 0.92, z], glow(0xbfe9ff), false); }
        signMesh(g, 'PROMO', 1.4, 0.5, [4.77, 2.6, -1.6], -PI / 2, '#d9344a', '#ffe03a');
        signMesh(g, 'DISKON', 1.4, 0.5, [-4.77, 2.4, 0.2], PI / 2, '#f2b705', '#c0392b');
        // gondola
        S.shelf(-1.4, 0.3, 4.2, 0.9, 1.5, 4, SNACK, { both: true, frame: 0xcfd6df });
        S.shelf(-1.4, -1.5, 4.2, 0.9, 1.5, 4, [...SNACK, ...DRINK], { both: true, frame: 0xcfd6df });
        for (const z of [0.3, -1.5]) bx(g, [4.3, 0.2, 0.2], [-1.4, 1.65, z], 0xd9344a, false);
        // kasir
        S.counter(3.2, 1.5, 2.8, 0.7, 0xf2f6f8, 0x555b70);
        bx(g, [0.4, 0.25, 0.35], [3.9, 1.18, 1.5], 0x2b2f3c, false); bx(g, [0.25, 0.14, 0.02], [3.9, 1.3, 1.31], glow(0x6dff9a), false);
        for (let k = 0; k < 3; k++) bx(g, [0.42, 0.14, 0.32], [2.2, 1.13 + k * 0.14, 1.5], 0xd9344a, false);        // tumpukan keranjang
        for (let k = 0; k < 6; k++) G(2.9 + k * 0.1, 1.1, 1.35, 0.08, 0.1, 0.08, pick(SNACK));
        // panel lampu langit-langit terang + tanda kasir
        for (const [x, z] of [[-3, -1], [0, -1], [-3, 2], [0.5, 2.4]]) S.panel(x, z);
        signMesh(S.rf, 'KASIR', 1.2, 0.4, [3.2, 3.2, 1.5], PI, '#2a6fd6', '#fff');
        S.light(-1.5, 3.7, -0.6); S.light(3.2, 3.7, 1.2);
        S.post('tika', 3.2, 0.4, 0); S.cnt('tika', 3.2, 2.4);
        S.done('Minimart');
    }

    /* ================= 5. BALAI DESA ================= */
    {
        const S = Shop('balai', 'Balai Desa', 118, -3, 12, 8, 0, 4.4, { wall: 0xe6dcc0, floor: 0xb7ad94, roofC: 0x7a3a2a, trim: 0x1f6b45, dw: 3.4, dh: 3.0 });
        const { g, G } = S;
        S.sign('BALAI DESA', 4.6, 0.8, 3.7, '#1f6b45', '#ffe9a0');
        S.win(-4.2, 4, 'x', 2.4); S.win(4.2, 4, 'x', 2.4); S.win(-6, 2.2, 'z', 2.0); S.win(6, 1.2, 'z', 2.4); S.win(6, -2.4, 'z', 1.4);
        // meja kepala desa + podium
        S.P(3.2, 1.0, 0.9, 0, -2.5, 0x6b4423); bx(g, [3.4, 0.06, 1.1], [0, 1.03, -2.5], 0x8a5a33, false);
        bx(g, [3.0, 0.5, 0.02], [0, 0.55, -2.04], 0xd9a520, false); bx(g, [0.5, 0.12, 0.2], [-0.8, 1.12, -2.2], 0xf0e8d0, false);
        bx(g, [0.04, 0.3, 0.04], [0.8, 1.2, -2.2], 0x333845, false);
        // bendera merah putih
        bx(g, [0.4, 0.1, 0.4], [-3.0, 0.05, -3.4], 0x555b70, false); cy(g, 0.05, 0.05, 3.6, [-3.0, 1.8, -3.4], 0xb8bfcc, null, 6, false); cy(g, 0.09, 0.09, 0.1, [-3.0, 3.65, -3.4], 0xd9a520, null, 6, false);
        bx(g, [1.1, 0.35, 0.03], [-2.42, 3.4, -3.4], 0xd9223a, false); bx(g, [1.1, 0.35, 0.03], [-2.42, 3.05, -3.4], 0xf6f6f6, false); S.circ(-3.0, -3.4, 0.3);
        // foto & lambang
        bx(g, [0.5, 0.5, 0.03], [0, 3.2, -3.77], 0xd9a520, false); bx(g, [0.2, 0.26, 0.03], [0, 3.2, -3.74], 0xd9223a, false);
        for (const x of [-1.0, 1.0]) {
            bx(g, [0.64, 0.84, 0.04], [x, 3.2, -3.78], 0x5a3a22, false); bx(g, [0.52, 0.72, 0.03], [x, 3.2, -3.75], 0xd8c9a8, false);
            bx(g, [0.18, 0.2, 0.03], [x, 3.28, -3.72], 0xc99a6b, false); bx(g, [0.2, 0.08, 0.03], [x, 3.4, -3.72], 0x1b1b24, false); bx(g, [0.4, 0.3, 0.03], [x, 3.0, -3.72], x < 0 ? 0xf6f6f6 : 0x2b3f6b, false);
        }
        // jam dinding
        cy(g, 0.28, 0.28, 0.05, [3.6, 3.2, -3.74], 0x5a3a22, [PI / 2, 0, 0], 12, false); cy(g, 0.24, 0.24, 0.06, [3.6, 3.2, -3.72], 0xf6f6f6, [PI / 2, 0, 0], 12, false);
        bx(g, [0.03, 0.2, 0.02], [3.6, 3.28, -3.68], 0x222222, false); bx(g, [0.15, 0.03, 0.02], [3.66, 3.2, -3.68], 0x222222, false);
        // papan pengumuman
        bx(g, [0.06, 1.2, 1.8], [-5.76, 1.9, -1.3], 0x6b4423, false); bx(g, [0.04, 1.0, 1.6], [-5.72, 1.9, -1.3], 0xc99a5b, false);
        for (let i = 0; i < 6; i++) G(-5.68, 1.55 + Math.floor(i / 3) * 0.45, -1.8 + (i % 3) * 0.5, 0.03, 0.3, 0.25, pick([0xffffff, 0xfff2a0, 0xbfe0ff]));
        // lemari arsip
        S.P(1.6, 1.9, 0.5, 4.8, -3.55, 0x7a5a3a); for (const k of [-1, 1]) bx(g, [0.7, 1.5, 0.03], [4.8 + k * 0.4, 1.0, -3.28], glassM, false);
        // bangku berderet (instanced), menghadap meja depan (-z)
        for (const z of [-0.8, 0.5, 1.8]) for (const x of [-4.6, -2.9, 2.9, 4.6]) {
            G(x, 0.46, z, 1.5, 0.08, 0.45, 0x8a5a33); G(x, 0.21, z, 1.3, 0.42, 0.28, 0x5a3a22); S.col(x, z, 1.5, 0.45);
            S.seat(x - 0.4, z, PI, 'Bangku Balai', 'balai'); S.seat(x + 0.4, z, PI, 'Bangku Balai', 'balai');
        }
        S.panel(0, 0.5, 2.4, 0.4); S.panel(0, -2.2, 2.4, 0.4);
        S.light(0, 4.0, 0.5); S.light(0, 4.0, -2.2);
        S.post('lurah', 0, -3.3); S.cnt('lurah', 0, -1.1);
        S.done('Balai Desa');
    }

    return { enclosures, shopsList };
}
