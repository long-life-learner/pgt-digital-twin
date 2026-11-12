/* Dunia luas: rumah pemain, kota (toko yang bisa dimasuki), taman + air mancur, konstruksi,
   pertanian, danau + pantai + dermaga + perkemahan, hutan, gunung.
   Semua benda lewat REGISTRI TAPAK (claim) supaya tidak ada yang menimpa jalan / benda lain. */
import { THREE, PI, M, Mx, bx, cy, grp, glow, pixTex, toonTex, signMesh, rng, addBox, addBoxC, addCircle, clamp } from './kit.js';
import { buildShops } from './shops.js';
import { buildCar, buildMotor } from './vehicles.js';

export const WORLD_HALF = 128;

export function buildWorld(scene) {
    const world = grp(scene);
    const R = rng(20261107);
    const map = { rects: [], dots: [], labels: [], circles: [] };
    const spots = { switches: [], chairs: [], sofa: [], benches: [], lamps: {}, npcHome: {}, vehicles: {}, interiors: [], fish: [], camps: [], poi: [], seats: [] };
    const mats = { win: glow(0x3a4c70), street: glow(0x555a6a), houseWin: glow(0x2a3550) };
    const anims = [];                                   // fungsi animasi per-frame: (t, dt, night)

    /* =====================================================
       REGISTRI TAPAK
       layer 0 = jalan · 1 = alas datar (jalan setapak, plaza, pasir) · 2 = bangunan/benda besar · 3 = benda kecil (tiang, bangku, pot)
       Tabrakan dianggap salah bila: (layer ≥2 vs apa pun) atau (layer 3 vs jalan/layer 2/3), kecuali satu grup.
       ===================================================== */
    const claims = [], problems = [];
    const hit = (a, b) => a.x0 < b.x1 - 0.01 && a.x1 > b.x0 + 0.01 && a.z0 < b.z1 - 0.01 && a.z1 > b.z0 + 0.01;
    const bad = (a, b) => {
        if (a.group === b.group) return false;
        const lo = Math.min(a.layer, b.layer), hi = Math.max(a.layer, b.layer);
        if (hi <= 1) return false;                       // datar vs datar
        if (hi === 3 && lo === 1) return false;          // benda kecil di atas alas datar
        return true;
    };
    const mk = (name, cx, cz, w, d, layer, group) => ({ name, layer, group: group || name, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
    const canPlace = (cx, cz, w, d, layer = 3, group = '_') => { const c = mk('?', cx, cz, w, d, layer, group); return !claims.some(o => hit(c, o) && bad(c, o)); };
    const claim = (name, cx, cz, w, d, layer = 2, group = name) => {
        const c = mk(name, cx, cz, w, d, layer, group);
        for (const o of claims) if (hit(c, o) && bad(c, o)) problems.push(`${name} bertabrakan dengan ${o.name}`);
        claims.push(c); return c;
    };
    const free = (x, z, m = 2.5) => !claims.some(c => x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m);
    const mrect = (x, z, w, d, c) => map.rects.push({ x, z, w, d, c });
    const noTree = () => { };                           // kompatibilitas lama (pohon kini memakai free())

    /* ---------- tanah ---------- */
    {
        const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
        g.fillStyle = '#4d8a46'; g.fillRect(0, 0, 64, 64);
        const shades = ['#559451', '#468040', '#5a9a55', '#3f7a3b'];
        for (let i = 0; i < 380; i++) { g.fillStyle = shades[(R() * shades.length) | 0]; g.fillRect((R() * 64) | 0, (R() * 64) | 0, 1 + (R() < 0.3), 1); }
        for (let i = 0; i < 14; i++) { g.fillStyle = '#6bb061'; const x = (R() * 62) | 0, y = (R() * 62) | 0; g.fillRect(x, y, 1, 2); g.fillRect(x + 2, y + 1, 1, 2); }
        const t = pixTex(c, { repeat: [175, 175], mip: true });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshToonMaterial({ map: t }));
        ground.rotation.x = -PI / 2; ground.receiveShadow = true; world.add(ground);
    }

    /* ---------- jalan ---------- */
    const ROADS = [{ x: 0, z: 10, w: 260, d: 8 }, { x: 60, z: 0, w: 8, d: 260 }, { x: 0, z: -60, w: 260, d: 8 }, { x: -50, z: 0, w: 8, d: 260 }];
    spots.roads = ROADS;
    const roadM = M(0x3d4150), dashM = M(0xf1e9b8), curbM = M(0x9aa1b5);
    const dashPos = [];
    for (const r of ROADS) {
        claim(`jalan(${r.x},${r.z})`, r.x, r.z, r.w, r.d, 0, 'road');
        bx(world, [r.w, 0.04, r.d], [r.x, 0.02, r.z], roadM, false).receiveShadow = true;
        if (r.w > r.d) { bx(world, [r.w, 0.05, 0.25], [r.x, 0.025, r.z + r.d / 2 + 0.12], curbM, false); bx(world, [r.w, 0.05, 0.25], [r.x, 0.025, r.z - r.d / 2 - 0.12], curbM, false); for (let x = -125; x < 125; x += 4) dashPos.push([x, r.z, 0]); }
        else { bx(world, [0.25, 0.05, r.d], [r.x - r.w / 2 - 0.12, 0.025, r.z], curbM, false); bx(world, [0.25, 0.05, r.d], [r.x + r.w / 2 + 0.12, 0.025, r.z], curbM, false); for (let z = -125; z < 125; z += 4) dashPos.push([r.x, z, 1]); }
        mrect(r.x, r.z, r.w, r.d, '#4a4f62'); map.rects[map.rects.length - 1].road = true;
    }
    {
        const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.03, 1), dashM, dashPos.length);
        const m4 = new THREE.Matrix4();
        dashPos.forEach(([x, z, v], i) => { m4.compose(new THREE.Vector3(x, 0.05, z), new THREE.Quaternion(), new THREE.Vector3(v ? 0.18 : 1.8, 1, v ? 1.8 : 0.18)); dm.setMatrixAt(i, m4); });
        world.add(dm);
    }
    /** alas datar (trotoar / jalan masuk / setapak) */
    const slab = (name, cx, cz, w, d, color = 0xb5b8c2, group = name, layer = 1, mcol = '#8a8d98') => {
        claim(name, cx, cz, w, d, layer, group); bx(world, [w, 0.03, d], [cx, 0.02, cz], M(color), false); mrect(cx, cz, w, d, mcol);
    };

    /* ---------- bangku ---------- */
    const bench = (x, z, yaw = 0, color = 0x8a5a33, group = 'bangku') => {
        const g = grp(world, x, 0, z); g.rotation.y = yaw;
        bx(g, [1.6, 0.1, 0.5], [0, 0.5, 0], color, false); bx(g, [1.6, 0.5, 0.08], [0, 0.8, -0.22], color, false);
        for (const s of [-1, 1]) bx(g, [0.1, 0.5, 0.45], [s * 0.7, 0.25, 0], 0x333845, false);
        const along = Math.abs(Math.cos(yaw)) > 0.5; const w = along ? 1.7 : 0.6, d = along ? 0.6 : 1.7;
        claim(`bangku(${x.toFixed(0)},${z.toFixed(0)})`, x, z, w, d, 3, group);
        addBoxC(x, z, w, d);
        const s = { x, z, yaw, y: 0.5, name: 'Bangku' }; spots.benches.push(s); return s;
    };

    /* ---------- tiang lampu jalan (benar-benar menerangi) ---------- */
    const LAMPS = [];                                   // {x,z,y,hx,hz}
    const lampPost = (x, z, tx, tz, group = 'tiang', h = 5.4) => {
        // lengan menghadap titik (tx,tz) (biasanya tengah jalan)
        let dx = tx - x, dz = tz - z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const g = grp(world, x, 0, z); g.rotation.y = Math.atan2(-dz, dx);
        bx(g, [0.28, 0.2, 0.28], [0, 0.1, 0], 0x2b2f3c, false);
        bx(g, [0.14, h, 0.14], [0, h / 2, 0], 0x394057, false);
        bx(g, [1.3, 0.12, 0.12], [0.6, h, 0], 0x394057, false);
        bx(g, [0.55, 0.14, 0.36], [1.2, h - 0.08, 0], mats.street, false);
        addCircle(x, z, 0.25);
        LAMPS.push({ x, z, y: h - 0.2, hx: x + dx * 1.2, hz: z + dz * 1.2 });
    };
    /** along='x': tiang di sisi jalan mendatar (lengan menghadap z=roadC); along='z': jalan menurun (lengan menghadap x=roadC) */
    const tryLamp = (x, z, along, roadC, group = 'tiang') => {
        for (const s of [0, 3, -3, 6, -6, 9, -9, 12, -12]) {
            const px = x + (along === 'x' ? s : 0), pz = z + (along === 'z' ? s : 0);
            if (Math.abs(px) > 124 || Math.abs(pz) > 124) continue;
            if (!canPlace(px, pz, 0.7, 0.7, 3, group)) continue;
            claim(`tiang(${px.toFixed(0)},${pz.toFixed(0)})`, px, pz, 0.7, 0.7, 3, group);
            lampPost(px, pz, along === 'x' ? px : roadC, along === 'x' ? roadC : pz, group); return true;
        }
        return false;
    };


    /* =====================================================
       RUMAH PEMAIN (interior lengkap)
       ===================================================== */
    const HC = { x: 0, z: -14 }, HW = 18, HD = 14, WH = 3.4;
    const house = { inside: (x, z) => x > -8.8 && x < 8.8 && z > -20.8 && z < -7.2, roof: grp(world), wallMat: Mx(0xefe3c8), x0: -9, x1: 9, z0: -21, z1: -7 };
    spots.house = house;
    {
        // lantai kayu
        const c = document.createElement('canvas'); c.width = 32; c.height = 32; const g = c.getContext('2d');
        g.fillStyle = '#b07a46'; g.fillRect(0, 0, 32, 32);
        for (let y = 0; y < 32; y += 4) { g.fillStyle = y % 8 ? '#a56f3c' : '#bb844e'; g.fillRect(0, y, 32, 3); g.fillStyle = '#7d5230'; g.fillRect(0, y + 3, 32, 1); g.fillRect((y * 7) % 32, y, 1, 3); }
        const floor = new THREE.Mesh(new THREE.BoxGeometry(HW, 0.08, HD), toonTex(pixTex(c, { repeat: [HW / 2, HD / 2] })));
        floor.position.set(HC.x, 0.04, HC.z); floor.receiveShadow = true; world.add(floor);
        const WM = house.wallMat;
        const wall = (w, d, x, z, y = WH / 2, h = WH) => { bx(world, [w, h, d], [x, y, z], WM, true); addBoxC(x, z, w, d); };
        wall(HW + 0.4, 0.4, 0, -21);                      // utara
        wall(0.4, HD + 0.4, -9, -14); wall(0.4, HD + 0.4, 9, -14);
        wall(7.9, 0.4, -5.2, -7); wall(7.9, 0.4, 5.2, -7); // selatan (pintu x -1.2..1.2)
        bx(world, [2.4, 0.9, 0.4], [0, WH - 0.45, -7], WM, false);
        bx(world, [0.3, WH, 0.3], [-1.35, WH / 2, -7], 0x7a4f2a, false); bx(world, [0.3, WH, 0.3], [1.35, WH / 2, -7], 0x7a4f2a, false);
        // jendela
        for (const [x, z, ry] of [[-5, -21, 0], [5, -21, 0], [-9, -11, PI / 2], [9, -16, PI / 2], [9, -9.5, PI / 2], [-6, -7, 0]]) {
            const w = bx(world, [ry ? 0.5 : 2.2, 1.3, ry ? 2.2 : 0.5], [x, 1.9, z], mats.houseWin, false);
            bx(world, [ry ? 0.55 : 2.4, 0.12, ry ? 2.4 : 0.55], [x, 2.6, z], 0x7a4f2a, false); bx(world, [ry ? 0.55 : 2.4, 0.12, ry ? 2.4 : 0.55], [x, 1.2, z], 0x7a4f2a, false);
        }
        // atap bertingkat (disembunyikan saat di dalam)
        const rf = house.roof, RM = M(0x9c3d33);
        bx(rf, [HW + 1.2, 0.5, HD + 1.2], [HC.x, WH + 0.25, HC.z], RM, true);
        bx(rf, [HW - 0.8, 0.6, HD - 0.8], [HC.x, WH + 0.8, HC.z], RM, true);
        bx(rf, [HW - 3.6, 0.6, HD - 3.6], [HC.x, WH + 1.4, HC.z], RM, true);
        bx(rf, [HW - 7, 0.6, HD - 7], [HC.x, WH + 2.0, HC.z], RM, true);
        bx(rf, [1.0, 1.8, 1.0], [5.5, WH + 1.9, HC.z - 2], 0x8a8f9e, true);
        // teras
        bx(world, [8, 0.12, 3], [0, 0.06, -5.5], M(0xc9c3b3), false); bx(world, [0.3, WH, 0.3], [-3.5, WH / 2, -4.2], 0x7a4f2a); bx(world, [0.3, WH, 0.3], [3.5, WH / 2, -4.2], 0x7a4f2a);
        bx(world, [8.4, 0.3, 3.2], [0, WH + 0.1, -5.5], RM, true); addCircle(-3.5, -4.2, 0.2); addCircle(3.5, -4.2, 0.2);
        signMesh(world, 'RUMAHKU', 2.6, 0.5, [0, WH - 0.9, -7.3], 0, '#7a4f2a', '#ffd84a');
        map.rects.push({ x: 0, z: -14, w: 18, d: 14, c: '#c95a4a' });
        map.labels.push({ x: 0, z: -23, t: 'RUMAH & CNC' });
        claim('rumah', 0, -14, 18.6, 14.6, 2, 'rumah'); claim('rumah-teras', 0, -5.5, 8.6, 3.4, 2, 'rumah');
        claim('rumah-taman', 0, -2.4, 18, 3.4, 1, 'rumah'); mrect(0, -2.4, 18, 3.4, '#5a9a55');
    }

    slab('setapak-rumah', 0, -0.25, 2.8, 13.5, 0xc9b48a, 'rumah', 1, '#a8946a');
    /* perabot (satu helper: mesh + tabrakan) */
    const furn = (w, h, d, x, z, color, { y0 = 0, col = true, parent = world } = {}) => { const m = bx(parent, [w, h, d], [x, y0 + h / 2, z], color); if (col) addBoxC(x, z, w, d); return m; };
    const lampInit = (id, name, x, y, z, color = 0xffd9a0) => {
        const light = new THREE.PointLight(color, 0, 13, 1.4); light.position.set(x, y, z); world.add(light);
        const L = { id, name, light, mats: [], on: false, maxI: 22 }; spots.lamps[id] = L; return L;
    };
    // ---- dapur ----
    furn(0.9, 1.9, 0.8, -5.2, -20.4, 0xdfe6f2);                                  // kulkas
    bx(world, [0.06, 0.5, 0.04], [-4.8, 1.3, -19.98], 0x6f7a96, false);
    furn(1.8, 0.95, 0.7, -3.6, -20.5, 0xcaa77a); bx(world, [0.7, 0.05, 0.45], [-3.9, 0.97, -20.5], 0x9fb4c8, false); cy(world, 0.04, 0.04, 0.3, [-3.9, 1.1, -20.7], 0xaab, null, 6);
    furn(1.0, 0.95, 0.7, -1.9, -20.5, 0xb8bcc8);                                  // kompor
    for (const [dx, dz] of [[-0.2, -0.12], [0.2, -0.12], [-0.2, 0.15], [0.2, 0.15]]) cy(world, 0.14, 0.14, 0.03, [-1.9 + dx, 0.97, -20.5 + dz], 0x20222c, null, 8, false);
    furn(1.4, 0.95, 0.7, -0.2, -20.5, 0xcaa77a);
    bx(world, [3.6, 0.7, 0.4], [-2.7, 2.2, -20.7], 0xcaa77a, false);              // lemari gantung
    const lK = lampInit('dapur', 'Lampu Dapur', -3.5, 3.0, -17.5);
    { const m = glow(0x554f40); bx(world, [0.9, 0.1, 0.9], [-3.5, WH - 0.05, -17.5], m, false); lK.mats.push([m, 0xfff0c0, 0x554f40]); }
    spots.fridge = { x: -5.2, z: -19.3 }; spots.sink = { x: -3.9, z: -19.7 }; spots.stove = { x: -1.9, z: -19.7 };
    // ---- mandi & cuci ----
    { const g = grp(world, -7.9, 0, -19.9);
      bx(g, [1.8, 0.08, 1.8], [0, 0.04, 0], 0x9fd8e8, false);
      bx(g, [0.08, 2.3, 1.8], [0.9, 1.2, 0], 0x9fd8ff, false).material = new THREE.MeshToonMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35 });
      bx(g, [1.8, 2.3, 0.08], [0, 1.2, 0.9], 0x9fd8ff, false).material = new THREE.MeshToonMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35 });
      cy(g, 0.15, 0.15, 0.06, [-0.5, 2.3, -0.7], 0xc0c8d8, null, 8, false); bx(g, [0.05, 0.5, 0.05], [-0.5, 2.05, -0.78], 0xc0c8d8, false);
      addBoxC(-7.9, -19.9, 1.8, 1.8); spots.shower = { x: -7.3, z: -18.7 }; }
    furn(0.9, 1.0, 0.9, -8.3, -15.2, 0xf2f4fa); cy(world, 0.3, 0.3, 0.05, [-7.84, 0.6, -15.2], 0x38404f, [0, 0, PI / 2], 10, false);
    bx(world, [0.5, 0.06, 0.3], [-8.3, 1.03, -15.5], 0x4ee1ff, false);
    spots.washer = { x: -7.5, z: -15.2 };
    { const hamper = furn(0.7, 0.7, 0.7, -8.4, -13.2, 0xc9a56a); bx(world, [0.6, 0.1, 0.6], [-8.4, 0.72, -13.2], 0xe8d9a8, false); spots.hamper = { x: -7.6, z: -13.2 }; }
    furn(0.8, 2.2, 1.7, -8.4, -9.8, 0x8a5a33); bx(world, [0.05, 1.8, 0.04], [-7.98, 1.1, -9.8], 0x5a3a1c, false);
    spots.wardrobe = { x: -7.4, z: -9.8 };
    // ---- makan ----
    furn(2.0, 0.85, 1.2, -4.5, -12, 0xc9a56a, { col: true }); bx(world, [0.4, 0.05, 0.4], [-4.5, 0.88, -12], 0xe8e0d0, false);
    bx(world, [0.15, 0.2, 0.15], [-4.0, 0.95, -12.1], 0xd9344a, false); cy(world, 0.1, 0.08, 0.14, [-5.0, 0.93, -11.9], 0xffffff, null, 8, false);
    const chair = (x, z, yaw, color = 0x8a5a33) => { const g = grp(world, x, 0, z); g.rotation.y = yaw; bx(g, [0.5, 0.08, 0.5], [0, 0.5, 0], color, false); bx(g, [0.5, 0.55, 0.08], [0, 0.82, -0.22], color, false); for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, [0.06, 0.5, 0.06], [sx * 0.2, 0.25, sz * 0.2], 0x5a3a1c, false); addCircle(x, z, 0.28); spots.chairs.push({ x, z, yaw, y: 0.5, name: 'Kursi' }); return g; };
    chair(-4.9, -13.4, 0); chair(-4.0, -10.6, PI);
    spots.table = { x: -4.5, z: -12 };
    // ---- ruang tamu ----
    { const g = grp(world, 3.6, 0, -11.5); g.rotation.y = PI / 2;                 // sofa menghadap +x (TV)
      bx(g, [2.6, 0.5, 1.0], [0, 0.3, 0], 0x4a6fb5); bx(g, [2.6, 0.6, 0.25], [0, 0.75, -0.4], 0x3d5c98); for (const s of [-1, 1]) bx(g, [0.25, 0.55, 1.0], [s * 1.3, 0.5, 0], 0x3d5c98);
      bx(g, [0.8, 0.1, 0.8], [-0.6, 0.6, 0.05], 0x6f93d9, false); bx(g, [0.8, 0.1, 0.8], [0.6, 0.6, 0.05], 0x6f93d9, false);
      addBoxC(3.4, -11.5, 1.3, 2.7); spots.sofa.push({ x: 3.75, z: -11.5, yaw: PI / 2, y: 0.55, name: 'Sofa' }); }
    furn(1.0, 0.45, 1.5, 5.7, -11.5, 0x8a5a33); bx(world, [0.35, 0.03, 0.25], [5.7, 0.47, -11.9], 0x1b1f2a, false);
    spots.tablet = { x: 5.7, z: -11.2 };
    { const tab = bx(world, [0.3, 0.03, 0.22], [5.7, 0.48, -11.2], glow(0x4ee1ff), false); spots.tabletMesh = tab; }
    { const tvg = grp(world, 8.55, 0, -11.5); tvg.rotation.y = -PI / 2;
      furn(0.5, 0.5, 2.0, 8.6, -11.5, 0x6a4a2a);
      bx(tvg, [2.0, 1.2, 0.12], [0, 1.35, 0], 0x14161e, false);
      const sc = document.createElement('canvas'); sc.width = 64; sc.height = 36; const sctx = sc.getContext('2d'); const stex = pixTex(sc);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 1.05), new THREE.MeshBasicMaterial({ map: stex })); scr.position.set(0, 1.35, 0.07); tvg.add(scr);
      sctx.fillStyle = '#05070c'; sctx.fillRect(0, 0, 64, 36); stex.needsUpdate = true;
      spots.tv = { x: 7.4, z: -11.5, ctx: sctx, tex: stex, on: false }; }
    const lL = lampInit('tamu', 'Lampu Ruang Tamu', 5.5, 3.0, -11);
    { const m = glow(0x554f40); bx(world, [1.1, 0.1, 1.1], [5.5, WH - 0.05, -11], m, false); lL.mats.push([m, 0xfff0c0, 0x554f40]); }
    { const m = glow(0x554f40); cy(world, 0.05, 0.05, 1.6, [7.7, 0.8, -8.6], 0x394057, null, 6, false); bx(world, [0.5, 0.4, 0.5], [7.7, 1.75, -8.6], m, false); lL.mats.push([m, 0xfff0c0, 0x554f40]); addCircle(7.7, -8.6, 0.3); }
    // karpet
    bx(world, [3.2, 0.02, 2.4], [5.0, 0.09, -11.5], 0xa84a6a, false);
    // ---- kamar / kantor ----
    { const g = grp(world, 6.4, 0, -19.5);
      bx(g, [2.1, 0.45, 2.5], [0, 0.35, 0], 0x6a4a2a); bx(g, [2.0, 0.22, 2.3], [0, 0.68, 0], 0xf0f0f5); bx(g, [2.0, 0.24, 1.4], [0, 0.8, 0.45], 0x35d0c0, false);
      bx(g, [1.9, 0.12, 0.45], [0, 0.88, -0.9], 0xffffff, false); bx(g, [2.1, 1.1, 0.12], [0, 0.9, -1.3], 0x6a4a2a);
      addBoxC(6.4, -19.5, 2.1, 2.5); spots.bed = { x: 6.4, z: -17.6 }; spots.bedTop = { x: 6.4, z: -19.6, y: 0.9 }; }
    furn(0.6, 0.55, 0.6, 4.4, -20.5, 0x8a5a33);
    { spots.phone = { x: 4.4, z: -20.0 }; spots.phoneMesh = bx(world, [0.14, 0.02, 0.26], [4.4, 0.57, -20.5], glow(0x35d0c0), false); }
    const lB = lampInit('kamar', 'Lampu Tidur', 4.1, 1.5, -20.5, 0xffc880);
    { const m = glow(0x554f40); cy(world, 0.12, 0.2, 0.3, [4.1, 0.75, -20.6], m, null, 8, false); lB.mats.push([m, 0xfff0c0, 0x554f40]); }
    furn(2.2, 0.8, 0.9, 1.3, -20.4, 0xc9a56a);
    bx(world, [0.7, 0.04, 0.5], [1.3, 0.82, -20.35], 0x2b2f3c, false);
    const lap = grp(world, 1.3, 0.84, -20.45); const lapScreen = bx(lap, [0.7, 0.45, 0.03], [0, 0.26, -0.18], glow(0x103a60), false); lapScreen.rotation.x = -0.25; spots.laptopScreen = lapScreen;
    bx(world, [0.6, 0.6, 0.06], [-0.2, 1.4, -20.9], 0x14161e, false);
    spots.laptop = { x: 1.3, z: -19.6 };
    chair(1.3, -19.1, PI, 0x2b2f3c); spots.chairs[spots.chairs.length - 1].desk = true; spots.chairs[spots.chairs.length - 1].name = 'Kursi Meja Kerja';
    // rak buku & tanaman
    furn(0.4, 2.0, 1.6, 8.6, -16.8, 0x7a4f2a); for (let i = 0; i < 4; i++) bx(world, [0.3, 0.3, 1.4], [8.45, 0.45 + i * 0.45, -16.8], [0xd9344a, 0x4ee1ff, 0xf2b705, 0x5dff8a][i], false);
    cy(world, 0.25, 0.2, 0.4, [-2.6, 0.2, -8.4], 0xb06a3c, null, 8, false); bx(world, [0.4, 0.6, 0.4], [-2.6, 0.7, -8.4], 0x2f9e4a, false); addCircle(-2.6, -8.4, 0.3);
    // saklar
    const sw = (id, label, x, z) => { bx(world, [0.14, 0.22, 0.05], [x, 1.3, z - 0.22], 0xf5f5f5, false); spots.switches.push({ id, label, x, z: z - 0.5 }); };
    sw('dapur', 'Saklar Lampu Dapur', -3.6, -7.2); sw('tamu', 'Saklar Lampu Ruang Tamu', 3.6, -7.2);
    // teras: lampu
    const lT = lampInit('teras', 'Lampu Teras', 0, 3.0, -5.5, 0xffe0a0); lT.maxI = 18;
    { const m = glow(0x554f40); bx(world, [0.6, 0.12, 0.6], [0, WH - 0.1, -5.5], m, false); lT.mats.push([m, 0xfff0c0, 0x554f40]); }
    sw('teras', 'Saklar Lampu Teras', 2.0, -7.2);
    spots.switches.push({ id: 'kamar', label: 'Lampu Tidur', x: 4.1, z: -19.8 });
    bench(5.4, -5.3, 0, 0x8a5a33, 'rumah'); bench(-5.4, -5.3, 0, 0xa8754a, 'rumah');
    spots.catSpots = { bed: { x: 6.2, z: -18.6 }, sofa: { x: 3.4, z: -10.7 }, cushion: { x: -1.5, z: -16 }, rug: { x: 5.2, z: -9.8 } };
    bx(world, [0.9, 0.12, 0.9], [-1.5, 0.12, -16], 0xe07a9a, false);
    // mailbox + taman depan
    claim('kotak-pos', -2.8, -2.2, 0.6, 0.5, 3, 'rumah'); addCircle(-2.8, -2.2, 0.3);
    bx(world, [0.08, 1.0, 0.08], [-2.8, 0.5, -2.2], 0x5a3a1c, false); bx(world, [0.5, 0.3, 0.35], [-2.8, 1.1, -2.2], 0xd9344a, false);
    spots.herb = []; // tanaman dekoratif depan rumah
    for (let i = 0; i < 16; i++) { const fx = -8 + R() * 16, fz = -4.5 + R() * 3; if (Math.abs(fx) < 2.4 || Math.hypot(fx + 2.8, fz + 2.2) < 1) continue; bx(world, [0.2, 0.3, 0.2], [fx, 0.15, fz], [0xff6fa5, 0xffd84a, 0xffffff, 0xb48cff][i % 4], false); }


    /* =====================================================
       GARASI (jalan masuk + garasi satu kesatuan, tidak mengganggu jalan raya)
       ===================================================== */
    {
        const GM = M(0xcfd3dc);
        claim('garasi', 22, -14.1, 11.2, 12.8, 2, 'garasi');
        slab('jalan-masuk', 22, -1, 10, 14, 0xb5b8c2, 'garasi', 2, '#8a8d98');            // z -8 .. 6 (berhenti tepat di tepi jalan)
        bx(world, [10.8, 0.05, 12.4], [22, 0.03, -14], M(0x9a9ea8), false);
        bx(world, [10.6, 3.4, 0.4], [22, 1.7, -20.2], GM); addBoxC(22, -20.2, 10.6, 0.4);
        bx(world, [0.4, 3.4, 12.4], [16.8, 1.7, -14], GM); addBoxC(16.8, -14, 0.4, 12.4);
        bx(world, [0.4, 3.4, 12.4], [27.2, 1.7, -14], GM); addBoxC(27.2, -14, 0.4, 12.4);
        const gRoof = grp(world); spots.garageRoof = gRoof;
        bx(gRoof, [11.4, 0.5, 13.2], [22, 3.65, -14], M(0x5b6176), true); bx(gRoof, [9.6, 0.5, 11.6], [22, 4.15, -14], M(0x5b6176), true);
        bx(world, [10.6, 0.7, 0.4], [22, 3.0, -8], GM, false);
        signMesh(world, 'GARASI', 3.2, 0.5, [22, 3.0, -7.75], 0, '#2b2f3c', '#ffd84a');
        for (let i = 0; i < 4; i++) bx(world, [0.12, 0.8, 0.12], [18 + i * 0.5, 0.4, -19.9], 0xd9344a, false);
        bx(world, [1.6, 0.6, 0.6], [26.2, 0.3, -19.4], 0x394057); addBoxC(26.2, -19.4, 1.6, 0.6);
        mrect(22, -14, 10.8, 12.4, '#5b6176');
        spots.vehicles.car = { x: 23.8, z: -14.5, yaw: 0 }; spots.vehicles.motor = { x: 19.2, z: -14.5, yaw: 0.08 };
    }

    /* =====================================================
       KOTA — toko yang bisa dimasuki (lihat shops.js)
       ===================================================== */
    const T = spots.town = {};
    const lightSources = [];
    const claimShop = (name, kind, cx, cz, w, d, o = {}) => { const sw = o.rot && Math.abs(Math.sin(o.rot)) > 0.5; return claim(name, cx, cz, sw ? d : w, sw ? w : d, kind === 'solid' || o.block ? 2 : 1, name); };
    const SH = buildShops({ world, spots, claim: claimShop, lightSources, mats, buildCar, buildMotor, nightOn: () => false });
    const SELL = { madura: 'madi', kafe: 'rina', bengkel: 'budi', mart: 'tika', balai: 'lurah' };
    SH.shopsList.forEach((b) => {
        const pid = SELL[b.id], cn = spots.counters.find(c => c.id === pid), ls = lightSources.find(l => b.inside(l.x, l.z));
        spots.interiors.push({ ...b, pid, seller: spots.posts[pid], serve: cn ? { x: cn.x, z: cn.z } : b.door, hours24: b.id === 'madura' || b.id === 'mart', light: ls ? { x: ls.x, y: ls.y, z: ls.z } : { x: b.x, y: 3.4, z: b.z }, lampMats: [] });
    });
    const dr = (id) => spots.shops[id].door; T.warung = dr('madura'); T.kafe = dr('kafe'); T.bengkel = dr('bengkel'); T.balai = dr('balai'); T.mart = dr('mart');
    map.labels.push({ x: 40, z: -2, t: 'W.MADURA' }, { x: 76, z: -2, t: 'KAFE' }, { x: 96, z: -3, t: 'BENGKEL' }, { x: 118, z: -2, t: 'BALAI' }, { x: 40, z: 22, t: 'MINIMART' });

    /* rumah warga (hanya tampak luar), semua pintu menghadap jalan terdekat */
    const decoDoors = [];
    const deco = (id, x, z, w, d, wall, roof, rot = 0) => {
        const g = grp(world, x, 0, z); g.rotation.y = rot; const h = 4.2, sw = Math.abs(Math.sin(rot)) > 0.5;
        const cs = Math.cos(rot), sn = Math.sin(rot), l2w = (lx, lz) => ({ x: x + lx * cs + lz * sn, z: z - lx * sn + lz * cs });
        bx(g, [w, h, d], [0, h / 2, 0], wall); bx(g, [w + 0.8, 0.5, d + 0.8], [0, h + 0.25, 0], roof); bx(g, [w - 0.8, 0.5, d - 0.8], [0, h + 0.75, 0], roof); bx(g, [Math.max(1, w - 2.6), 0.5, Math.max(1, d - 2.6)], [0, h + 1.25, 0], roof);
        bx(g, [1.5, 2.5, 0.12], [0, 1.25, d / 2 + 0.04], 0x4a3322, false);
        for (const wx of [-w / 3, w / 3]) bx(g, [1.4, 1.2, 0.1], [wx, 2.3, d / 2 + 0.04], mats.win, false);
        for (const s of [-1, 1]) bx(g, [0.1, 1.2, 1.4], [s * (w / 2 + 0.04), 2.3, 0], mats.win, false);
        claim(id, x, z, (sw ? d : w) + 0.6, (sw ? w : d) + 0.6, 2, id); addBoxC(x, z, sw ? d : w, sw ? w : d);
        const pc = l2w(0, d / 2 + 2); slab(`${id}-trotoar`, pc.x, pc.z, sw ? 4 : w, sw ? w : 4, 0xcfc7b0, id, 2, '#a8a08a');
        mrect(x, z, sw ? d : w, sw ? w : d, '#' + roof.toString(16).padStart(6, '0'));
        const door = l2w(0, d / 2 + 2.6); decoDoors.push({ id, x: door.x, z: door.z }); return g;
    };
    // barisan utara jalan z=10 (pintu menghadap selatan) : tepi depan z=2
    deco('rumah-A', -27, -2, 10, 8, 0xd9e8c0, 0x4a7a3a);
    /* barisan selatan jalan z=10 (pintu menghadap utara) : tepi depan z=18 */
    deco('rumah-C', -27, 22, 10, 8, 0xf0d0b0, 0x8a3a2a, PI); deco('rumah-D', -10, 22, 9, 8, 0xcfd9f4, 0x3a4a8a, PI);
    deco('rumah-E', 76, 22, 9, 8, 0xf0c9c9, 0x9c3d33, PI); deco('rumah-F', 96, 22, 9, 8, 0xc9d9f0, 0x2f4a7a, PI); deco('rumah-G', 116, 22, 9, 8, 0xf0e0a0, 0xb86a2a, PI);
    /* di timur jalan x=60 (menghadap barat, rot -PI/2) dan barat jalan x=60 (menghadap timur, rot PI/2) */
    deco('rumah-H', 72, -30, 9, 8, 0xf4e3b0, 0x8a3a3a, -PI / 2); deco('rumah-I', 72, -46, 9, 8, 0xd0e8f0, 0x3a5a8a, -PI / 2);
    deco('rumah-J', 48, -30, 9, 8, 0xe8d0f0, 0x6a3a8a, PI / 2); deco('rumah-K', 48, -44, 9, 8, 0xd0f0e8, 0x2f7a6a, PI / 2);
    /* di selatan jalan z=-60 (menghadap utara = -z, rot PI) */
    deco('rumah-L', 30, -48, 9, 8, 0xf0d0d0, 0x7a3a5a, PI); deco('rumah-M', 14, -48, 9, 8, 0xd0f0d8, 0x3a7a5a, PI);
    deco('rumah-N', -30, -48, 9, 8, 0xf4ecc8, 0x7a5a2a, PI); deco('rumah-O', -14, -48, 9, 8, 0xc8e4f4, 0x2a5a7a, PI);

    /* =====================================================
       TAMAN + AIR MANCUR BERANIMASI
       ===================================================== */
    const PZ = { x: 88, z: 48 };
    {
        const { x: px, z: pz } = PZ;
        slab('taman', px, pz, 26, 20, 0xd4cdb8, 'taman', 1, '#a8a08a');
        claim('air-mancur', px, pz, 7, 7, 2, 'taman');
        cy(world, 2.9, 3.1, 0.7, [px, 0.35, pz], M(0x9aa1b5), null, 14);
        const wt = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshBasicMaterial({ color: 0x3aa0e8, transparent: true, opacity: 0.92 })); wt.rotation.x = -PI / 2; wt.position.set(px, 0.72, pz); world.add(wt); spots.waterMat = wt.material;
        const rim = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.05, 24), M(0xb9c0d0)); rim.rotation.x = -PI / 2; rim.position.set(px, 0.73, pz); world.add(rim);
        cy(world, 0.34, 0.5, 1.9, [px, 1.6, pz], M(0x9aa1b5), null, 8); cy(world, 1.15, 0.28, 0.34, [px, 2.45, pz], M(0xaab1c5), null, 10); cy(world, 0.18, 0.28, 0.5, [px, 2.85, pz], M(0x9aa1b5), null, 6);
        addCircle(px, pz, 3.2);
        spots.fountain = { x: px, z: pz + 4.0 }; spots.fountainC = { x: px, z: pz };
        bench(px - 8, pz, PI / 2, 0x8a5a33, 'taman'); bench(px + 8, pz, -PI / 2, 0x8a5a33, 'taman'); bench(px, pz - 7, 0, 0x8a5a33, 'taman'); bench(px, pz + 7, PI, 0x8a5a33, 'taman');
        for (const [dx, dz] of [[-11.5, -8.5], [11.5, -8.5], [-11.5, 8.5], [11.5, 8.5]]) { claim(`tiang-taman${dx}${dz}`, px + dx, pz + dz, 0.7, 0.7, 3, 'taman'); lampPost(px + dx, pz + dz, px, pz, 'taman'); }
        for (let i = 0; i < 14; i++) { const a = i / 14 * 2 * PI; bx(world, [0.3, 0.3, 0.3], [px + Math.cos(a) * 5.0, 0.15, pz + Math.sin(a) * 5.0], [0xff6fa5, 0xffd84a, 0xffffff][i % 3], false); }
        map.labels.push({ x: px, z: pz - 12, t: 'TAMAN' });
        /* partikel air: 12 pancuran × 9 butir + 1 pancuran tengah */
        const NJ = 12, NP = 9, tot = NJ * NP + 14;
        const jets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.9 }), tot);
        jets.frustumCulled = false; world.add(jets);
        const rings = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); r.rotation.x = -PI / 2; r.position.set(px, 0.76, pz); world.add(r); return r; });
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
        const T0 = 1.1, Y0 = 2.9, VY = 3.4, G = 9, VR = 1.7;
        anims.push((t) => {
            let n = 0;
            for (let j = 0; j < NJ; j++) {
                const a = j / NJ * 2 * PI;
                for (let k = 0; k < NP; k++) {
                    const u = ((t / T0) + k / NP) % 1, tt = u * T0, r = 0.5 + VR * tt, y = Y0 + VY * tt - 0.5 * G * tt * tt;
                    v3.set(px + Math.cos(a) * r, Math.max(0.74, y), pz + Math.sin(a) * r); m4.compose(v3, q, sc.setScalar(0.7 + (1 - u) * 0.5)); jets.setMatrixAt(n++, m4);
                }
            }
            for (let k = 0; k < 14; k++) {                                           // pancuran tengah
                const u = ((t / 1.5) + k / 14) % 1, tt = u * 1.5, y = Y0 + 0.3 + 5.2 * tt - 0.5 * G * tt * tt, wob = Math.sin(t * 6 + k) * 0.05;
                v3.set(px + wob, Math.max(0.74, y), pz + wob); m4.compose(v3, q, sc.setScalar(0.8)); jets.setMatrixAt(n++, m4);
            }
            jets.instanceMatrix.needsUpdate = true;
            rings.forEach((r, i) => { const u = ((t * 0.55) + i / 3) % 1; r.scale.setScalar(0.4 + u * 2.4); r.material.opacity = (1 - u) * 0.5; });
            wt.material.color.setHex(Math.floor(t * 2) % 2 ? 0x3aa0e8 : 0x4ab4f4);
        });
    }

    /* =====================================================
       KONSTRUKSI (pagar penuh, gerbang di utara, jalan masuk dari jalan raya)
       ===================================================== */
    {
        const cx = -92, cz = 52, FW = 44, FD = 36, fx0 = cx - FW / 2, fx1 = cx + FW / 2, fz0 = cz - FD / 2, fz1 = cz + FD / 2;
        claim('konstruksi', cx, cz, FW + 1, FD + 1, 2, 'proyek');
        bx(world, [FW, 0.04, FD], [cx, 0.02, cz], M(0x8a7a5a), false); mrect(cx, cz, FW, FD, '#8a7a5a');
        slab('jalan-proyek', cx, (14 + fz0) / 2, 6, fz0 - 14, 0x9a8a6a, 'proyek', 1, '#8a7a5a');
        const fence = (x, z, w, d) => { bx(world, [w, 1.4, d], [x, 0.7, z], 0xf2b705, false); addBoxC(x, z, Math.max(w, 0.3), Math.max(d, 0.3)); };
        const gate = 6;
        fence((fx0 + cx - gate / 2) / 2, fz0, cx - gate / 2 - fx0, 0.2); fence((fx1 + cx + gate / 2) / 2, fz0, fx1 - cx - gate / 2, 0.2);
        fence(cx, fz1, FW, 0.2); fence(fx0, cz, 0.2, FD); fence(fx1, cz, 0.2, FD);
        signMesh(world, 'PROYEK', 3, 0.7, [cx + gate / 2 + 1.5, 2.6, fz0 - 0.15], PI, '#f2b705', '#2b2f3c'); bx(world, [0.2, 2.6, 0.2], [cx + gate / 2 + 1.5, 1.3, fz0 - 0.1], 0x555b70, false);
        bx(world, [6, 2.6, 2.4], [cx - 14, 1.3, cz - 8], 0x3a7ac2); addBoxC(cx - 14, cz - 8, 6, 2.4); bx(world, [6, 2.6, 2.4], [cx - 14, 1.3, cz - 5], 0xd9344a); addBoxC(cx - 14, cz - 5, 6, 2.4);
        bx(world, [4, 2.6, 2.6], [cx + 15, 1.3, cz - 8], 0xe8e0d0); addBoxC(cx + 15, cz - 8, 4, 2.6);
        for (const [x, z, s] of [[cx + 8, cz + 8, 3], [cx + 1, cz + 11, 2.4]]) { const m = new THREE.Mesh(new THREE.ConeGeometry(s, s * 0.8, 6), M(0xd8c080)); m.position.set(x, s * 0.4, z); m.castShadow = true; world.add(m); addCircle(x, z, s * 0.8); }
        for (const [x, z] of [[cx - 4, fz0 + 2], [cx + 4, fz0 + 2], [cx - 4, fz0 + 6], [cx + 4, fz0 + 6]]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 6), M(0xff7a00)); m.position.set(x, 0.35, z); world.add(m); }
        const cr = grp(world, cx - 4, 0, cz - 12); bx(cr, [0.8, 16, 0.8], [0, 8, 0], 0xf2b705); bx(cr, [14, 0.7, 0.7], [3, 16, 0], 0xf2b705); bx(cr, [2, 1.2, 1.2], [-4.5, 15.7, 0], 0x555b70); bx(cr, [0.1, 3, 0.1], [8, 14.4, 0], 0x222222, false); bx(cr, [1.2, 0.6, 1.2], [8, 12.7, 0], 0xff7a00, false); addCircle(cx - 4, cz - 12, 1.2);
        const dirt = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.4, 7), M(0x7a5a3a)); dirt.position.set(cx + 8, 1.2, cz + 2); dirt.castShadow = true; world.add(dirt); spots.dirt = dirt; addCircle(cx + 8, cz + 2, 3.2);
        spots.vehicles.excavator = { x: cx - 2, z: cz + 3, yaw: PI / 2 - 0.2 };
        for (const [lx, lz] of [[cx - 18, fz0 + 3], [cx + 18, fz0 + 3], [cx - 18, fz1 - 3], [cx + 18, fz1 - 3]]) { claim(`tiang-proyek${lx}${lz}`, lx, lz, 0.7, 0.7, 3, 'proyek'); lampPost(lx, lz, cx, cz, 'proyek'); }
        T.site = { x: cx, z: cz }; map.labels.push({ x: cx, z: fz0 - 4, t: 'KONSTRUKSI' });
        spots.siteGate = { x: cx, z: fz0 + 2.5 };
    }

    /* =====================================================
       PERTANIAN (ladang berpagar + lumbung) & PADANG TERNAK
       ===================================================== */
    {
        const fx = -90, fz = -92, FW = 54, FD = 26, x0 = fx - FW / 2, x1 = fx + FW / 2, z0 = fz - FD / 2, z1 = fz + FD / 2;
        claim('ladang', fx, fz, FW + 1, FD + 1, 2, 'ladang'); mrect(fx, fz, FW, FD, '#4d8a46');
        const crop = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), M(0x58b04a), 3 * 14 * 4);
        const m4 = new THREE.Matrix4(); let n = 0; const col = new THREE.Color();
        for (let p = 0; p < 3; p++) {
            const px = fx + (p - 1) * 17, pz = fz;
            bx(world, [14, 0.06, 20], [px, 0.04, pz], M(0x6b4a2f), false); mrect(px, pz, 14, 20, '#6b4a2f');
            for (let r = 0; r < 14; r++) for (let k = 0; k < 4; k++) { if (n >= crop.count) break; m4.makeTranslation(px - 6 + r * 0.95, 0.4, pz - 7.5 + k * 5 + (R() - 0.5) * 0.4); crop.setMatrixAt(n, m4); crop.setColorAt(n, col.setHex([0x58b04a, 0x6bc45a, 0x4a9a3e, 0xe0c040][(R() * 4) | 0])); n++; }
        }
        world.add(crop);
        const rail = (x, z, w, d) => { bx(world, [w, 0.12, d], [x, 1.0, z], 0x8a5a33, false); addBoxC(x, z, Math.max(w, 0.25), Math.max(d, 0.25)); };
        const post = (x, z) => bx(world, [0.15, 1.2, 0.15], [x, 0.6, z], 0x8a5a33, false);
        const ring = (xa, xb, za, zb, gapSide = null, gapC = 0, gapW = 5) => {      // pagar kayu mengelilingi, dengan celah gerbang
            const seg = (ax, az, bxx, bz) => { const w = Math.abs(bxx - ax), d = Math.abs(bz - az); rail((ax + bxx) / 2, (az + bz) / 2, w || 0.1, d || 0.1); for (let t = 0; t <= Math.max(w, d); t += 3) post(ax + (w ? t : 0), az + (d ? t : 0)); };
            seg(xa, za, xb, za); seg(xa, zb, xb, zb);
            if (gapSide === 'E') { seg(xa, za, xa, zb); seg(xb, za, xb, gapC - gapW / 2); seg(xb, gapC + gapW / 2, xb, zb); } else { seg(xa, za, xa, zb); seg(xb, za, xb, zb); }
        };
        ring(x0, x1, z0, z1, 'E', fz);
        spots.farmGate = { x: x1 + 3, z: fz }; spots.farmRect = { x0, x1, z0, z1 };
        slab('jalan-ladang', (x1 + -54) / 2, fz, -54 - x1, 4, 0xc9b48a, 'ladang', 1, '#a8946a');
        deco('lumbung', -75, -73, 14, 10, 0xb8352f, 0x5a2a20);
        map.labels.push({ x: fx, z: z0 - 3, t: 'LADANG' });
        const sc = grp(world, fx + 2, 0, z1 - 2.5); bx(sc, [0.1, 1.8, 0.1], [0, 0.9, 0], 0x7a4f2a, false); bx(sc, [1.4, 0.1, 0.1], [0, 1.4, 0], 0x7a4f2a, false); bx(sc, [0.4, 0.4, 0.4], [0, 1.9, 0], 0xe8d9a8, false); bx(sc, [0.6, 0.1, 0.6], [0, 2.15, 0], 0xb8852f, false); addCircle(fx + 2, z1 - 2.5, 0.3);
        // padang ternak
        const px0 = -118, px1 = -74, pz0 = -122, pz1 = -108, pcz = (pz0 + pz1) / 2;
        claim('padang', (px0 + px1) / 2, pcz, px1 - px0 + 1, pz1 - pz0 + 1, 2, 'padang'); mrect((px0 + px1) / 2, pcz, px1 - px0, pz1 - pz0, '#5a9a45');
        ring(px0, px1, pz0, pz1, 'E', pcz);
        slab('jalan-padang', (px1 + -54) / 2, pcz, -54 - px1, 4, 0xc9b48a, 'padang', 1, '#a8946a');
        spots.pasture = { x0: px0 + 1.5, x1: px1 - 1.5, z0: pz0 + 1.5, z1: pz1 - 1.5 }; spots.pastureGate = { x: px1 + 3, z: pcz };
        // palung & jerami
        bx(world, [3, 0.5, 0.8], [px0 + 8, 0.25, pz1 - 2], 0x8a5a33); addBoxC(px0 + 8, pz1 - 2, 3, 0.8); bx(world, [1.6, 1.2, 1.6], [px1 - 6, 0.6, pz0 + 2], 0xd8c060); addBoxC(px1 - 6, pz0 + 2, 1.6, 1.6);
        map.labels.push({ x: (px0 + px1) / 2, z: pz0 - 3, t: 'PADANG' });
        spots.farmPos = { x: x1 + 4, z: fz };
    }

    /* =====================================================
       DANAU + PANTAI + DERMAGA + PERKEMAHAN
       ===================================================== */
    {
        const sandC = { x: 100, z: -98 }, SW = 50, SD = 32;
        const WC = { x: 105, z: -101 }, WW = 34, WD = 18;
        claim('danau', sandC.x, sandC.z, SW, SD, 1, 'danau');
        bx(world, [SW, 0.03, SD], [sandC.x, 0.02, sandC.z], M(0xe2d29a), false); mrect(sandC.x, sandC.z, SW, SD, '#e2d29a');
        bx(world, [WW + 2.6, 0.03, WD + 2.6], [WC.x, 0.035, WC.z], M(0xb9a570), false);                            // pasir basah
        // air (bidang beranimasi)
        const wc = document.createElement('canvas'); wc.width = wc.height = 32; const g2 = wc.getContext('2d');
        g2.fillStyle = '#2f86d6'; g2.fillRect(0, 0, 32, 32);
        for (let i = 0; i < 26; i++) { g2.fillStyle = ['#3c97e6', '#2877c4', '#5ab0f4'][i % 3]; g2.fillRect((R() * 30) | 0, (R() * 31) | 0, 2 + (R() * 4 | 0), 1); }
        const wtex = pixTex(wc, { repeat: [WW / 3, WD / 3] });
        const wmat = new THREE.MeshToonMaterial({ map: wtex, transparent: true, opacity: 0.86 });
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(WW, WD), wmat); wm.rotation.x = -PI / 2; wm.position.set(WC.x, 0.13, WC.z); wm.receiveShadow = true; world.add(wm); spots.lake = wm;
        mrect(WC.x, WC.z, WW, WD, '#2f86d6');
        // tabrakan air: tiga kotak, menyisakan koridor dermaga
        const wx0 = WC.x - WW / 2, wx1 = WC.x + WW / 2, wz0 = WC.z - WD / 2, wz1 = WC.z + WD / 2, D0 = 103.8, D1 = 106.2, dockEnd = -100.8;
        const abox = (xa, xb, za, zb) => addBoxC((xa + xb) / 2, (za + zb) / 2, xb - xa, zb - za);
        abox(wx0, D0, wz0, wz1); abox(D1, wx1, wz0, wz1); abox(D0, D1, wz0, dockEnd);
        spots.waterRect = { x0: wx0 + 0.6, x1: wx1 - 0.6, z0: wz0 + 0.6, z1: wz1 - 0.6 };
        // dermaga (bagian di atas air lebih tinggi)
        const dockZ0 = -88.6, dockLen = dockZ0 - dockEnd, dockCz = (dockZ0 + dockEnd) / 2;
        bx(world, [D1 - D0, 0.16, dockLen], [(D0 + D1) / 2, 0.22, dockCz], 0x8a5a33, false);
        for (let i = 0; i < Math.floor(dockLen / 0.6); i++) bx(world, [D1 - D0 + 0.1, 0.04, 0.5], [(D0 + D1) / 2, 0.32, dockZ0 - 0.3 - i * 0.6], i % 2 ? 0x9a6a3c : 0x7a4f2a, false);
        for (let z = dockZ0 - 0.5; z > dockEnd; z -= 2.4) for (const s of [D0, D1]) { bx(world, [0.2, 1.0, 0.2], [s, 0.5, z], 0x5a3a1c, false); }
        bx(world, [0.1, 0.1, dockLen - 0.4], [D0, 0.95, dockCz], 0x5a3a1c, false); bx(world, [0.1, 0.1, dockLen - 0.4], [D1, 0.95, dockCz], 0x5a3a1c, false);
        spots.dock = { x0: D0, x1: D1, z0: dockEnd, z1: dockZ0, y: 0.33 };
        mrect((D0 + D1) / 2, dockCz, D1 - D0, dockLen, '#8a5a33');
        // titik memancing: pose menghadap air (yaw: menghadap (sin,cos)); target lempar (tx,tz)
        const F = spots.fish;
        F.push({ id: 'd1', kind: 'dermaga', x: 104.7, z: -100.2, yaw: PI, tx: 104.2, tz: -106.2, y: 0.33 }, { id: 'd2', kind: 'dermaga', x: 105.4, z: -100.2, yaw: PI, tx: 106.2, tz: -107, y: 0.33 });
        F.push({ id: 'd3', kind: 'dermaga', x: 104.4, z: -95.5, yaw: -PI / 2, tx: 98.5, tz: -95.0, y: 0.33 }, { id: 'd4', kind: 'dermaga', x: 105.6, z: -95.5, yaw: PI / 2, tx: 112, tz: -96, y: 0.33 });
        for (const sx of [92, 96, 111, 115, 119]) F.push({ id: 's' + sx, kind: 'pantai', x: sx, z: -90.75, yaw: PI, tx: sx + 0.5, tz: -97, y: 0 });
        F.forEach(f => { f.user = null; });
        // jalan dari jalan raya
        slab('jalan-danau', 100, -73, 3.4, 18, 0xc9b48a, 'danau', 1, '#a8946a');
        // pantai: payung, kursi berjemur, palem
        const umb = (x, z, c) => { const g = grp(world, x, 0, z); bx(g, [0.1, 2.3, 0.1], [0, 1.15, 0], 0xdddddd, false); const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 8), M(c)); cone.position.y = 2.5; cone.castShadow = true; g.add(cone); bx(g, [1.7, 0.3, 0.7], [0.6, 0.15, 1.0], 0xffffff, false); bx(g, [0.7, 0.4, 0.7], [0.6, 0.35, 1.7], c, false); addCircle(x, z, 0.4); claim(`payung(${x},${z})`, x, z, 2.2, 3, 3, 'danau'); };
        umb(86, -85.5, 0xe8453c); umb(92, -85.5, 0xf2b705); umb(112, -85.5, 0x35a7d9); umb(118, -85.5, 0xff8fb1);
        const palm = (x, z) => { const g = grp(world, x, 0, z); for (let i = 0; i < 5; i++) bx(g, [0.35 - i * 0.02, 0.9, 0.35 - i * 0.02], [i * 0.07, 0.45 + i * 0.9, 0], 0x8a6a40, false); for (let k = 0; k < 6; k++) { const l = bx(g, [0.35, 0.1, 2.2], [0, 4.6, 0], 0x3f9a4a, false); l.geometry.translate(0, 0, 1.1); l.rotation.y = k * PI / 3; l.rotation.x = -0.4; } addCircle(x, z, 0.35); claim(`palem(${x},${z})`, x, z, 1, 1, 3, 'danau'); };
        for (const [x, z] of [[78.5, -84.5], [122.5, -84.5], [123, -112], [78, -113], [87, -113]]) palm(x, z);
        // perkemahan: 3 petak (tenda dibangun oleh pemain/NPC) menghadap ke danau
        const campZs = [-92, -100, -108];
        campZs.forEach((cz, i) => {
            const tent = { x: 79.5, z: cz }, fire = { x: 84.6, z: cz };
            // alas tanah + cincin batu api unggun + batang kayu
            bx(world, [4.4, 0.02, 3.4], [tent.x, 0.045, tent.z], M(0xc9b27a), false);
            for (let a = 0; a < 8; a++) { const t = a / 8 * 2 * PI; bx(world, [0.3, 0.2, 0.3], [fire.x + Math.cos(t) * 0.7, 0.1, fire.z + Math.sin(t) * 0.7], 0x888d99, false); }
            bx(world, [1.1, 0.03, 1.1], [fire.x, 0.05, fire.z], 0x2b2b30, false); addCircle(fire.x, fire.z, 0.85);
            const seats = [{ x: fire.x, z: fire.z - 1.7, yaw: 0, y: 0.35, name: 'Batang kayu' }, { x: fire.x, z: fire.z + 1.7, yaw: PI, y: 0.35, name: 'Batang kayu' }, { x: fire.x + 1.7, z: fire.z, yaw: -PI / 2, y: 0.35, name: 'Batang kayu' }];
            seats.forEach(s => { const alongX = s.yaw === 0 || s.yaw === PI; bx(world, alongX ? [1.2, 0.4, 0.4] : [0.4, 0.4, 1.2], [s.x, 0.2, s.z], 0x6a4526, false); addCircle(s.x, s.z, 0.35); });
            spots.camps.push({ id: 'k' + i, tent, fire, seats, yaw: PI / 2, state: 'empty', prog: 0, owner: null, lit: false });
        });
        claim('perkemahan', 81, -100, 12, 24, 1, 'danau');
        signMesh(world, 'PERKEMAHAN', 3.6, 0.6, [76.5, 2.2, -86.5], 0, '#2f6a3a', '#ffffff'); bx(world, [0.15, 2.2, 0.15], [76.5, 1.1, -86.5], 0x6a4526, false); addCircle(76.5, -86.5, 0.25);
        for (const [lx, lz, tx, tz] of [[97.4, -77, 100, -77], [102.6, -69, 100, -69], [87.5, -88, 84, -96], [87.5, -112, 84, -104]]) { claim(`tiang-danau${lx}${lz}`, lx, lz, 0.7, 0.7, 3, 'danau'); lampPost(lx, lz, tx, tz, 'danau'); }
        map.labels.push({ x: sandC.x, z: WC.z, t: 'DANAU' }, { x: 80, z: -112, t: 'KEMAH' });
        spots.waterZone = { x0: sandC.x - SW / 2, x1: sandC.x + SW / 2, z0: sandC.z - SD / 2, z1: sandC.z + SD / 2 };
        spots.dockAnim = null;
        // riak & kilau air
        const spark = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.02, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), 40); spark.frustumCulled = false; world.add(spark);
        const sp = Array.from({ length: 40 }, () => ({ x: WC.x + (R() - 0.5) * (WW - 1), z: WC.z + (R() - 0.5) * (WD - 1), ph: R() * 6.28, sp: 0.6 + R() * 1.4 }));
        const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        anims.push((t) => {
            wtex.offset.set((t * 0.02) % 1, Math.sin(t * 0.3) * 0.02); wmat.opacity = 0.84 + Math.sin(t * 1.3) * 0.03;
            sp.forEach((s, i) => { const k = Math.max(0, Math.sin(t * s.sp + s.ph)); v3.set(s.x, 0.15, s.z); m4.compose(v3, q, sc.set(k, 1, k)); spark.setMatrixAt(i, m4); }); spark.instanceMatrix.needsUpdate = true;
        });
    }

    /* ---------- lampu jalan sepanjang jalan (di LUAR badan jalan; lengan menjulur ke atas jalan) ---------- */
    for (const r of ROADS) {
        const horiz = r.w > r.d; let i = 0;
        for (let t = -120; t <= 120; t += 20, i++) {
            const side = i % 2 ? 1 : -1, off = (horiz ? r.d : r.w) / 2 + 1.9;
            if (horiz) { if (Math.abs(t - 60) < 6.5 || Math.abs(t + 50) < 6.5) continue; tryLamp(t, r.z + side * off, 'x', r.z); }
            else { if (Math.abs(t - 10) < 6.5 || Math.abs(t + 60) < 6.5) continue; tryLamp(r.x + side * off, t, 'z', r.x); }
        }
    }

    /* =====================================================
       POHON, SEMAK, BUNGA — hanya di tempat kosong (memakai registri tapak)
       ===================================================== */
    {
        const N = 1000, trunk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 1.4, 0.4), M(0x6a4526), N);
        const f1 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 2.8, 4), M(0x2f7a45), N), f2 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.2, 4), M(0x38905a), N);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(); let n = 0;
        for (let i = 0; i < 9000 && n < N; i++) {
            const x = (R() * 2 - 1) * 132, z = (R() * 2 - 1) * 132;
            const edge = Math.max(Math.abs(x), Math.abs(z)); const dens = edge > 112 ? 1 : edge > 80 ? 0.5 : 0.25;
            if (R() > dens || !free(x, z, 2.5)) continue;
            const s = 0.8 + R() * 0.9; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6);
            m4.compose(new THREE.Vector3(x, 0.7 * s, z), q, new THREE.Vector3(s, s, s)); trunk.setMatrixAt(n, m4);
            m4.compose(new THREE.Vector3(x, 2.6 * s, z), q, new THREE.Vector3(s, s, s)); f1.setMatrixAt(n, m4); f1.setColorAt(n, col.setHex([0x2f7a45, 0x2a6e3f, 0x3a8a4f, 0x4a9a3a][(R() * 4) | 0]));
            m4.compose(new THREE.Vector3(x, 4.0 * s, z), q, new THREE.Vector3(s, s, s)); f2.setMatrixAt(n, m4); f2.setColorAt(n, col.setHex([0x38905a, 0x2f8050, 0x4aa060][(R() * 3) | 0]));
            addCircle(x, z, 0.55 * s); if (n % 2 === 0) map.dots.push([x, z]); n++;
        }
        trunk.count = f1.count = f2.count = n;
        [trunk, f1, f2].forEach(m => { m.castShadow = true; m.receiveShadow = true; world.add(m); });
        const B = 280, bush = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.8, 1), M(0x3f9a4a), B), fl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), M(0xffffff), 420);
        let nb = 0, nf = 0;
        for (let i = 0; i < 5000 && (nb < B || nf < 420); i++) {
            const x = (R() * 2 - 1) * 128, z = (R() * 2 - 1) * 128; if (!free(x, z, 1.6)) continue;
            if (nb < B && R() < 0.3) { const s = 0.6 + R() * 0.8; m4.compose(new THREE.Vector3(x, 0.4 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); bush.setMatrixAt(nb, m4); bush.setColorAt(nb, col.setHex([0x3f9a4a, 0x4aa85a, 0x35863f][(R() * 3) | 0])); if (s > 1) addCircle(x, z, 0.45 * s); nb++; }
            else if (nf < 420) { m4.makeTranslation(x, 0.15, z); fl.setMatrixAt(nf, m4); fl.setColorAt(nf, col.setHex([0xff6fa5, 0xffd84a, 0xffffff, 0xb48cff, 0xff9a3c][(R() * 5) | 0])); nf++; }
        }
        bush.count = nb; fl.count = nf; bush.castShadow = true; world.add(bush, fl);
    }

    /* ---------- gunung, bukit, awan, bintang ---------- */
    const mtnCols = [0x5d7384, 0x687a90, 0x506680, 0x566b60, 0x6b7f8f];
    for (let i = 0; i < 46; i++) {
        const a = i / 46 * PI * 2 + R() * 0.1, h = 45 + R() * 70, r = 28 + R() * 30; let rad = 175 + R() * 80;
        while (Math.max(Math.abs(Math.cos(a) * rad), Math.abs(Math.sin(a) * rad)) - r * 0.9 < 140) rad += 6;   // jangan menutupi area bermain
        const g = grp(world, Math.cos(a) * rad, 0, Math.sin(a) * rad);
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), M(mtnCols[i % 5])); c.position.y = h / 2; c.rotation.y = R() * 3; g.add(c);
        if (h > 70) { const s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, h * 0.38, 6), M(0xf2f6fb)); s.position.y = h * 0.81; s.rotation.y = c.rotation.y; g.add(s); }
    }
    for (let i = 0; i < 26; i++) {
        const a = i / 26 * PI * 2 + R(), h = 12 + R() * 14, r = 18 + R() * 12; let rad = 148 + R() * 20;
        while (Math.max(Math.abs(Math.cos(a) * rad), Math.abs(Math.sin(a) * rad)) - r * 0.9 < 138) rad += 4;   // di luar tepi dunia (bukan di atas danau/ladang)
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), M(0x4a8040)); c.position.set(Math.cos(a) * rad, h / 2, Math.sin(a) * rad); world.add(c);
    }
    const clouds = [];
    for (let i = 0; i < 14; i++) {
        const c = grp(world, (R() * 2 - 1) * 200, 55 + R() * 25, (R() * 2 - 1) * 200);
        const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
        for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(8 + R() * 6, 3 + R() * 2, 5 + R() * 4), cm); b.position.set(k * 6 - 9, R() * 2, R() * 3); c.add(b); }
        c.userData.mat = cm; clouds.push(c);
    }
    let stars;
    { const n = 260, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = R() * PI * 2, e = 0.15 + R() * 1.2, r = 400; pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0, fog: false })); stars.frustumCulled = false; scene.add(stars); }

    /* =====================================================
       TITIK LAHIR NPC, tujuan jalan-jalan, rumah
       ===================================================== */
    const dd = (id) => decoDoors.find(d => d.id === id);
    spots.npcHome = {
        madi: spots.posts.madi, rina: spots.posts.rina, budi: spots.posts.budi, tika: spots.posts.tika, lurah: spots.posts.lurah,
        ujang: { x: spots.farmGate.x + 3, z: spots.farmGate.z + 2 }, asep: { x: -92, z: 38 }, dina: dd('rumah-A'), joko: { x: 100, z: -78 }, sinta: { x: PZ.x - 6, z: PZ.z + 3 }, agus: dd('rumah-C'), maya: dd('rumah-D'),
    };
    spots.homes = { dina: dd('rumah-A'), agus: dd('rumah-C'), maya: dd('rumah-D'), ujang: dd('lumbung'), asep: dd('rumah-E'), joko: dd('rumah-F'), sinta: dd('rumah-G') };
    spots.stroll = [
        { name: 'taman', x: PZ.x - 5, z: PZ.z + 6 }, { name: 'taman', x: PZ.x + 5, z: PZ.z + 6 }, { name: 'taman', x: PZ.x, z: PZ.z + 8.5 },
        { name: 'trotoar', x: 55, z: 4 }, { name: 'trotoar', x: 5, z: 4.5 }, { name: 'trotoar', x: -30, z: 4.5 }, { name: 'trotoar', x: 105, z: 16 }, { name: 'trotoar', x: 25, z: 16 },
        { name: 'pantai', x: 90, z: -84 }, { name: 'pantai', x: 115, z: -84 }, { name: 'pantai', x: 100, z: -79 },
        { name: 'kebun', x: spots.farmGate.x + 1, z: spots.farmGate.z }, { name: 'rumah', x: 0, z: -3.5 },
    ];
    map.vehicleSpawns = spots.vehicles;
    spots.camps.forEach(c => { spots.poi.push({ kind: 'camp', ...c.tent }); });

    /* =====================================================
       CAHAYA LAMPU JALAN: kolam cahaya di tanah + kerucut cahaya + PointLight yang mengikuti pemain
       ===================================================== */
    const lampFx = (() => {
        const nL = LAMPS.length;
        const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
        const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32); gr.addColorStop(0, 'rgba(255,236,170,1)'); gr.addColorStop(0.45, 'rgba(255,214,120,0.55)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(c);
        const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), nL);
        const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(2.7, 5.2, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), nL);
        pool.frustumCulled = cone.frustumCulled = false; pool.renderOrder = 3; cone.renderOrder = 3;
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
        LAMPS.forEach((L, i) => { v3.set(L.hx, 0.1, L.hz); m4.compose(v3, q, s3.set(15, 1, 15)); pool.setMatrixAt(i, m4); v3.set(L.hx, L.y - 2.6, L.hz); m4.compose(v3, q, s3.set(1, 1, 1)); cone.setMatrixAt(i, m4); });
        world.add(pool, cone);
        const NP = 5, lights = Array.from({ length: NP }, () => { const l = new THREE.PointLight(0xffd890, 0, 24, 1.3); scene.add(l); return l; });
        const shopL = new THREE.PointLight(0xfff0c8, 0, 16, 1.2); scene.add(shopL);
        const idx = new Array(nL);
        return {
            update(px, pz, night, insideB) {
                pool.material.opacity = night * 0.9; cone.material.opacity = night * 0.07;
                // lampu terdekat → PointLight sungguhan
                for (let i = 0; i < nL; i++) idx[i] = i;
                const d2 = (i) => (LAMPS[i].hx - px) ** 2 + (LAMPS[i].hz - pz) ** 2;
                idx.sort((a, b) => d2(a) - d2(b));
                for (let k = 0; k < NP; k++) { const L = LAMPS[idx[k]]; lights[k].position.set(L.hx, L.y - 0.3, L.hz); lights[k].intensity = night * 85; }
                // cahaya interior toko terdekat
                let best = null, bd = 1e9;
                for (const B of spots.interiors) { const d = Math.hypot(B.x - px, B.z - pz); if (d < bd) { bd = d; best = B; } }
                const lit = best && (insideB === best || (night > 0.4 && bd < 24));
                if (best) { shopL.position.set(best.light.x, best.light.y, best.light.z); shopL.intensity = insideB === best ? 26 : lit ? 14 : 0; }
                for (const B of spots.interiors) { const on = insideB === B || night > 0.4 || B.hours24 && night > 0.2; B.lampMats.forEach(m => m.color.setHex(on ? 0xfff0c0 : 0x554f40)); }
            },
        };
    })();

    const dockR = spots.dock;
    const groundY = (x, z) => (x > dockR.x0 - 0.1 && x < dockR.x1 + 0.1 && z > dockR.z0 && z < dockR.z1 + 0.4 ? dockR.y : 0);
    const animate = (t, dt) => anims.forEach(f => f(t, dt));
    spots.lakeRect = spots.waterRect; spots.penRect = spots.pasture;          // dipakai modul hewan
    return { world, spots, mats, map, clouds, stars, house, free, problems, claims, lights: lampFx.update, groundY, animate, LAMPS, decoDoors };
}
