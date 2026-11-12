/* Hewan voxel: anjing, ayam, kambing, sapi, bebek, kelinci + dekor (burung, kupu-kupu, ikan lompat) */
import { THREE, PI, bx, grp, tagSprite, resolve, clamp, wrapPi } from './kit.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sm = (o, k, v, f) => { o.rotation[k] += (v - o.rotation[k]) * f; };

/* ---------------- rig berkaki empat (+z = depan) ---------------- */
function quad(o) {
    const { L, W, H, lh, lw = 0.07, fur, belly = fur, head: hs, hy = H * 0.3, nh = 0, sz = 1 } = o;
    const root = new THREE.Group(), base = lh + H / 2;
    const body = grp(root, 0, base, 0);
    bx(body, [W, H, L], [0, 0, 0], fur, false);
    if (belly !== fur) bx(body, [W * 0.86, H * 0.3, L * 0.8], [0, -H * 0.36, 0], belly, false);
    for (const [x, y, z, w, h, d] of o.spots || []) bx(body, [w, h, d], [x, y, z], o.spotC, false);
    const hg = grp(body, 0, hy, L / 2 - 0.03);
    if (nh > 0) bx(hg, [hs[0] * 0.75, nh + hs[1] * 0.4, hs[2] * 0.6], [0, nh / 2 - hs[1] * 0.1, hs[2] * 0.1], fur, false);
    const hd = grp(hg, 0, nh, 0), hf = hs[2] * 0.9;
    bx(hd, hs, [0, 0, hs[2] * 0.4], fur, false);
    if (o.snout) {
        const [sw, sh, sd] = o.snout, sy = -hs[1] * 0.18;
        bx(hd, [sw, sh, sd], [0, sy, hf + sd / 2 - 0.01], o.snoutC ?? belly, false);
        if (o.nose != null) bx(hd, [sw * 0.5, sh * 0.35, 0.02], [0, sy + sh * 0.2, hf + sd - 0.005], o.nose, false);
    }
    const ey = Math.max(0.02, hs[0] * 0.15);
    for (const sx of [-1, 1]) bx(hd, [ey, ey * 1.2, 0.015], [sx * hs[0] * 0.32, hs[1] * 0.15, hf + 0.003], 0x111111, false);
    const ears = [];
    if (o.ear) {
        const e = o.ear, dn = e.k === 'flop' || e.k === 'side';
        for (const sx of [-1, 1]) {
            const g = grp(hd, sx * e.x, e.y, e.z);
            bx(g, e.s, [0, dn ? -e.s[1] / 2 : e.s[1] / 2, 0], e.c ?? fur, false);
            g.rotation.z = (dn ? sx : -sx) * (e.tilt ?? 0); g.userData.r = g.rotation.z; ears.push(g);
        }
    }
    if (o.horn) for (const sx of [-1, 1]) bx(hd, o.horn.s, [sx * o.horn.x, hs[1] / 2 + o.horn.s[1] / 2 - 0.01, hs[2] * 0.2], o.horn.c, false);
    const tail = grp(body, 0, H * 0.3, -L / 2);
    if (o.tail) bx(tail, [o.tail.w, o.tail.w, o.tail.l], [0, 0, -o.tail.l / 2], o.tail.c ?? fur, false);
    const legs = [];
    for (const [sx, sz2] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        const g = grp(body, sx * (W / 2 - lw / 2 - 0.005), -H / 2, sz2 * (L / 2 - lw * 0.9));
        bx(g, [lw, lh, lw], [0, -lh / 2, 0], o.legC ?? fur, false);
        if (o.hoof) bx(g, [lw * 1.04, lh * 0.15, lw * 1.04], [0, -lh + lh * 0.075, 0], o.hoof, false);
        legs.push(g);
    }
    if (o.extra) o.extra(body, hd);
    root.traverse(m => { if (m.isMesh) m.castShadow = !!o.shadow; });
    const gait = o.gait ?? 0.7, tUp = o.tailUp ?? 0.3, hx0 = o.hx0 ?? 0, gz = o.graze ?? 0.95;
    const pose = (mode, ph, t, dt = 0.016) => {
        const f = 1 - Math.exp(-(mode === 'hop' ? 30 : 12) * dt);
        let by = 0, bz = 0, hx = hx0, ts = Math.sin(t * 2) * 0.15, tx = tUp, lg = [0, 0, 0, 0], ea = 0;
        if (mode === 'walk') { const s = Math.sin(ph); lg = [s, -s, -s, s].map(v => v * gait); by = Math.abs(Math.cos(ph)) * 0.02 * sz; hx += Math.sin(ph * 2) * 0.04; ts = Math.sin(ph * 0.5) * 0.3; }
        else if (mode === 'graze' || mode === 'eat') { hx = gz + Math.sin(t * (mode === 'eat' ? 9 : 3)) * 0.1; if (o.grazeLegs) lg = [0.35, 0.35, 0, 0]; }
        else if (mode === 'sit') { bz = -0.55; by = -lh * 0.45; hx = 0.55; lg = [0.55, 0.55, -1.0, -1.0]; tx = 0.1; ts = Math.sin(t * 1.4) * 0.5; }
        else if (mode === 'sleep' || mode === 'lie') { by = -(lh - 0.03); lg = [-1.4, -1.4, -1.4, -1.4]; tx = 0.1; if (mode === 'sleep') { hx = o.sleepX ?? 0.6; ts = 0.9; } else hx = hx0 + Math.sin(t * 3) * 0.04; }
        else if (mode === 'happy') { by = Math.abs(Math.sin(t * 8)) * 0.06 * sz; ts = Math.sin(t * 12) * 0.6; hx = -0.15; }
        else if (mode === 'freeze') { hx = -0.12; ts = 0; ea = 1; }
        else if (mode === 'hop') { const u = Math.sin(PI * ph); by = u * 0.2 * sz; bz = -0.45 * Math.cos(PI * ph); lg = [-u * 0.7, -u * 0.7, u * 0.9, u * 0.9]; hx = 0.2; }
        else { hx += Math.sin(t * 0.8) * 0.05; }
        sm(body, 'x', bz, f); body.position.y += (base + by - body.position.y) * f;
        sm(hg, 'x', hx, f); sm(tail, 'y', ts, f); sm(tail, 'x', tx, f);
        legs.forEach((l, i) => sm(l, 'x', lg[i], f));
        ears.forEach((g, i) => sm(g, 'x', Math.sin(t * 4 + i * 2.3 + (o.seed || 0)) > 0.97 ? -0.4 : ea ? 0.1 : mode === 'hop' ? 0.35 : 0, f));
    };
    return { root, pose };
}

/* ---------------- rig unggas (ayam & bebek) ---------------- */
function bird(o) {
    const { bw, bh, bl, ly, nk, hw } = o, root = new THREE.Group(), base = ly + bh / 2, s0 = Math.random() * 10;
    const body = grp(root, 0, base, 0);
    bx(body, [bw, bh, bl], [0, 0, 0], o.c, false);
    if (o.c2) bx(body, [bw * 0.9, bh * 0.4, bl * 0.6], [0, -bh * 0.32, 0.02], o.c2, false);
    const tail = grp(body, 0, bh * 0.25, -bl / 2);
    bx(tail, o.tail, [0, o.tail[1] / 2 - 0.01, -o.tail[2] / 2], o.tc ?? o.c, false);
    const wings = [-1, 1].map(sx => { const g = grp(body, sx * bw / 2, bh * 0.2, 0); bx(g, [0.02, bh * 0.8, bl * 0.6], [sx * 0.012, -bh * 0.4, 0], o.wc ?? o.c, false); g.userData.sx = sx; return g; });
    const hg = grp(body, 0, bh * 0.4, bl / 2 - 0.01);
    bx(hg, [0.045, nk + 0.03, 0.05], [0, nk / 2, 0], o.nc ?? o.c, false);
    const hd = grp(hg, 0, nk, 0.015);
    bx(hd, [hw, hw, hw], [0, 0, 0], o.hc ?? o.c, false);
    bx(hd, o.beak, [0, -0.005, hw / 2 + o.beak[2] / 2 - 0.005], o.bc, false);
    for (const sx of [-1, 1]) bx(hd, [0.012, 0.02, 0.02], [sx * (hw / 2 + 0.002), 0.012, 0.015], 0x111111, false);
    if (o.comb) { bx(hd, [0.02, 0.035, 0.05], [0, hw / 2 + 0.012, 0], 0xd22b2b, false); bx(hd, [0.015, 0.03, 0.015], [0, -hw / 2 - 0.008, hw / 2 - 0.01], 0xd22b2b, false); }
    const legs = [-1, 1].map(sx => { const g = grp(root, sx * bw * 0.25, ly, 0); bx(g, [0.02, ly, 0.02], [0, -ly / 2, 0], o.lc, false); bx(g, [0.04, 0.012, 0.05], [0, -ly + 0.006, 0.015], o.lc, false); return g; });
    root.traverse(m => { if (m.isMesh) m.castShadow = false; });
    const pose = (mode, ph, t, dt = 0.016) => {
        const f = 1 - Math.exp(-14 * dt), pk = Math.max(0, Math.sin(t * 5.5 + s0));
        let by = 0, bp = 0, hx = 0, hy = 0, lg = [0, 0], wa = 0, ts = 0, hide = false, roll = 0;
        if (o.water) {
            hide = true; by = -ly + 0.02 + Math.sin(t * 2.2 + s0) * 0.012; roll = Math.sin(t * 1.7 + s0) * 0.04;
            if (mode === 'walk' || mode === 'flee') { hx = Math.sin(ph * 0.5) * 0.05; ts = Math.sin(t * 6) * 0.15; }
            else if (mode === 'graze' || mode === 'eat') { bp = 0.5 + pk * 0.6; hx = 0.3; }
            else if (mode === 'sleep') { hx = 0.7; by -= 0.01; }
            else if (mode === 'happy') { by += Math.abs(Math.sin(t * 9)) * 0.04; wa = 0.8 + Math.sin(t * 25) * 0.3; }
            else hy = Math.sin(t * 0.8 + s0) * 0.4;
        } else if (mode === 'walk') { const s = Math.sin(ph); lg = [s * 0.9, -s * 0.9]; by = Math.abs(Math.cos(ph)) * 0.012; hx = Math.cos(ph) * 0.12; }
        else if (mode === 'flee') { const s = Math.sin(ph); lg = [s, -s]; wa = 0.8 + Math.sin(t * 32) * 0.35; bp = 0.15; by = Math.abs(Math.cos(ph)) * 0.03; }
        else if (mode === 'graze' || mode === 'eat') { bp = 0.3 + pk * 0.5; hx = 0.3 + pk * 0.6; }
        else if (mode === 'sleep') { by = -ly + 0.02; hide = true; hx = 0.5; }
        else if (mode === 'happy') { by = Math.abs(Math.sin(t * 9)) * 0.05; wa = 0.7 + Math.sin(t * 25) * 0.3; }
        else { hy = Math.sin(t * 0.8 + s0) * 0.5 * (Math.sin(t * 0.37 + s0) > 0 ? 1 : 0); ts = Math.sin(t * 1.3) * 0.05; }
        body.position.y += (base + by - body.position.y) * f;
        sm(body, 'x', bp, f); sm(body, 'z', roll, f); sm(hg, 'x', hx, f); sm(hg, 'y', hy, f); sm(tail, 'x', (o.tup ?? 0) + ts, f);
        legs.forEach((l, i) => { sm(l, 'x', lg[i], f); l.visible = !hide; });
        wings.forEach(w => sm(w, 'z', w.userData.sx * wa, f));
    };
    return { root, pose };
}

const chickenRig = (i) => bird({
    bw: 0.15, bh: 0.13, bl: 0.2, ly: 0.08, nk: 0.08, hw: 0.075, c: [0xf4efe2, 0xb5651d, 0xe8e2d0, 0x8a5a3a, 0xf1d9a0][i % 5], c2: 0xffffff,
    tail: [0.03, 0.12, 0.07], tup: -0.3, beak: [0.035, 0.025, 0.04], bc: 0xf0a030, lc: 0xe0a030, comb: true,
});
const duckRig = (male) => bird({
    bw: 0.15, bh: 0.12, bl: 0.26, ly: 0.04, nk: 0.1, hw: 0.08, c: male ? 0x8a7a66 : 0xa8855a, c2: male ? 0xe8e4da : 0xc9a878, hc: male ? 0x2f7a4a : 0xa8855a, nc: male ? 0x2f7a4a : 0xa8855a,
    tail: [0.06, 0.04, 0.06], tup: 0.4, beak: [0.06, 0.02, 0.06], bc: 0xf2c230, lc: 0xf08a20, wc: male ? 0x6f604f : 0x8a6a42, water: true,
});

/* ---------------- dekor: burung, kupu-kupu, ikan ---------------- */
function flyerRig() {
    const root = new THREE.Group(), c = pick([0x6b7a8f, 0x8a6a4a, 0xc9a24a, 0x4a7a6a, 0x9a4a4a]);
    bx(root, [0.1, 0.08, 0.22], [0, 0, 0], c, false); bx(root, [0.08, 0.08, 0.08], [0, 0.03, 0.14], c, false);
    bx(root, [0.02, 0.02, 0.05], [0, 0.01, 0.2], 0xf0a030, false); bx(root, [0.06, 0.015, 0.12], [0, 0.01, -0.16], 0x333344, false);
    bx(root, [0.08, 0.03, 0.12], [0, -0.03, 0.02], 0xe8e4da, false);
    const wings = [-1, 1].map(sx => { const g = grp(root, sx * 0.05, 0.03, 0); bx(g, [0.2, 0.012, 0.1], [sx * 0.1, 0, 0], 0x4a4a58, false); g.userData.sx = sx; return g; });
    root.scale.setScalar(1.7); root.rotation.order = 'YXZ';
    return { root, wings };
}
function butterflyRig() {
    const root = new THREE.Group(), c1 = pick([0xffa21f, 0x5ab3ff, 0xff6fa5, 0xf2e04a, 0xa66bff]), c2 = pick([0xffffff, 0x222233, 0xffe0a0]);
    bx(root, [0.012, 0.012, 0.07], [0, 0, 0], 0x222222, false);
    const wings = [-1, 1].map(sx => { const g = grp(root, sx * 0.006, 0, 0); bx(g, [0.07, 0.004, 0.06], [sx * 0.035, 0, 0.01], c1, false); bx(g, [0.04, 0.004, 0.04], [sx * 0.03, 0, -0.045], c2, false); g.userData.sx = sx; return g; });
    root.scale.setScalar(1.6); root.rotation.order = 'YXZ';
    return { root, wings };
}
function fishRig() {
    const root = new THREE.Group();
    bx(root, [0.07, 0.08, 0.2], [0, 0, 0], 0xbfd3e0, false); bx(root, [0.06, 0.03, 0.18], [0, -0.03, 0], 0xffffff, false);
    bx(root, [0.015, 0.04, 0.08], [0, 0.055, 0], 0x6f94b0, false);
    const tail = grp(root, 0, 0, -0.1); bx(tail, [0.015, 0.09, 0.06], [0, 0, -0.03], 0x6f94b0, false);
    for (const sx of [-1, 1]) bx(root, [0.012, 0.02, 0.02], [sx * 0.037, 0.015, 0.07], 0x111111, false);
    root.scale.setScalar(1.7); root.rotation.order = 'YXZ'; root.visible = false;
    return { root, tail };
}

/* ---------------- konfigurasi per jenis ---------------- */
const CFG = {
    dog: { sp: 1.6, fsp: 4, stride: 5, w: [0.4, 0, 0.25], rest: 'sit', sleeps: true, amb: 0.01, sfx: 'woof', r: 1.8, h: 0.6, says: ['Guk guk! ❤', 'Woof!', 'Hrrh~ ❤'] },
    chicken: { sp: 0.7, fsp: 3.2, stride: 9, w: [0.35, 0.45, 0], sleeps: true, flees: true, amb: 0.03, sfx: 'cluck', r: 1.4, h: 0.35, says: ['Petok petok~', 'Kok kok kok!', 'Kukuruyuk~'] },
    goat: { sp: 0.6, fsp: 2, stride: 6, w: [0.3, 0.4, 0.1], rest: 'lie', sleeps: true, lieKind: 'lie', amb: 0.02, sfx: 'baa', r: 2, h: 0.8, says: ['Mbeee~', 'Mbek mbek!', 'Mbeee~ ❤'] },
    cow: { sp: 0.5, fsp: 2, stride: 4.5, w: [0.25, 0.5, 0.15], rest: 'lie', sleeps: true, lieKind: 'lie', amb: 0.02, sfx: 'moo', r: 2.3, h: 1.3, says: ['Mooo~', 'Mooooo! ❤', 'Moo~'] },
    duck: { sp: 0.35, fsp: 1, stride: 4, w: [0.4, 0.25, 0], sleeps: true, amb: 0.03, sfx: 'quack', r: 2.2, h: 0.3, says: ['Kwek kwek~', 'Kwek!', 'Kwek kwek ❤'] },
    rabbit: { sp: 1.6, fsp: 4.8, stride: 0, w: [0.4, 0.2, 0], flees: true, amb: 0, sfx: 'squeak', r: 1.5, h: 0.3, says: ['*hidung bergerak* ❤', 'Cit cit~', '*mengendus*'] },
};

/* ================================================================== */
export function buildAnimals(ctx) {
    const { scene, spots, free, api } = ctx;
    const S = api.S; S.pets = S.pets || {}; S.follow = S.follow || {};
    const pp = (id) => (S.pets[id] = S.pets[id] || { happy: 0, last: 0 });
    const list = [], decor = [], pen = [];
    let PL = null;
    const shrink = (r, m) => r && { x0: r.x0 + m, x1: r.x1 - m, z0: r.z0 + m, z1: r.z1 - m };
    const lake = shrink(spots.lakeRect, 1.2), penR = shrink(spots.penRect, 1);

    const rp = (a) => {
        if (a.water && PL && Math.random() < 0.5) {
            const r = a.rect, cx = clamp(PL.x, r.x0, r.x1), cz = clamp(PL.z, r.z0, r.z1);
            if (Math.hypot(PL.x - cx, PL.z - cz) < 12) return { x: clamp(cx + rnd(-1.5, 1.5), r.x0, r.x1), z: clamp(cz + rnd(-1.5, 1.5), r.z0, r.z1) };
        }
        for (let i = 0; i < 8; i++) {
            let x, z;
            if (a.rect) { x = rnd(a.rect.x0, a.rect.x1); z = rnd(a.rect.z0, a.rect.z1); }
            else { const an = Math.random() * PI * 2, rr = Math.sqrt(Math.random()) * a.hr; x = a.hx + Math.cos(an) * rr; z = a.hz + Math.sin(an) * rr; }
            if (a.water || free(x, z, 0.5)) return { x, z };
        }
        return { x: a.hx, z: a.hz };
    };

    /* ---- interaksi ---- */
    const hearts = (a) => { for (let i = 0; i < 4; i++) api.emit(a.x + (Math.random() - 0.5) * 0.4, a.h + 0.1 + i * 0.12, a.z, { color: 0xff6fa5, size: 0.14, vy: 0.9, life: 1.2 }); };
    const react = (a, mode, sec) => { a.mode = mode; a.modeT = sec; a.tgt = null; };
    const pet = (a) => { const p = pp(a.id); p.happy = Math.min(100, p.happy + 10); api.clampStat('happy', 3); react(a, 'happy', 2); api.sfx(a.sfx); hearts(a); api.toast(`${a.name}: ${pick(a.says)}`, 'good'); };
    const feed = (a) => {
        if (!api.takeFood()) { api.toast('Butuh makanan', 'bad'); return; }
        const p = pp(a.id); p.happy = Math.min(100, p.happy + 15); api.clampStat('happy', 3); react(a, 'eat', 3);
        api.sfx(a.sfx); api.toast(`${a.name} makan dengan lahap`, 'good');
    };
    const actions = (a) => {
        const acts = [{ label: '🤚 Elus', fn: () => pet(a) }, { label: '🍚 Beri makan', fn: () => feed(a) }];
        const p = pp(a.id);
        if (a.kind === 'dog') acts.push({ label: S.follow.bruno ? '🏠 Suruh tinggal' : '🐾 Ajak ikut', fn: () => { S.follow.bruno = !S.follow.bruno; a.tgt = null; a.timer = 0; api.sfx('woof'); api.toast(S.follow.bruno ? `${a.name} akan mengikutimu` : `${a.name} tinggal di rumah`, 'good'); } });
        else if (a.kind === 'chicken') {
            let off = null;
            if (p.last === S.day) off = 'Belum ada telur hari ini';
            else { if (a.roll.day !== S.day) a.roll = { day: S.day, has: Math.random() < 0.5 }; if (!a.roll.has) off = 'Belum ada telur hari ini'; }
            acts.push({ label: '🥚 Ambil telur', off, fn: () => { p.last = S.day; api.give('telur', 1); api.sfx('cluck'); react(a, 'happy', 1.2); api.toast('+1 telur 🥚', 'good'); } });
        } else if (a.kind === 'cow') acts.push({ label: '🥛 Perah susu', off: p.last === S.day ? 'Sudah diperah hari ini' : null, fn: () => { p.last = S.day; api.give('susu', 1); api.sfx('moo'); react(a, 'happy', 1.5); api.toast('+1 susu 🥛', 'good'); } });
        return acts;
    };

    /* ---- pembuatan ---- */
    function mk(kind, id, name, rig, o) {
        const a = { id, name, kind, rig, root: rig.root, ...CFG[kind], yaw: rnd(0, PI * 2), state: 'idle', timer: rnd(0, 3), phase: rnd(0, 10), tgt: null, mode: null, modeT: 0, hp: 0, pause: 0, roll: { day: -1, has: false }, y0: 0, ...o };
        const s = rp(a); a.x = s.x; a.z = s.z;
        a.actions = () => actions(a);
        pp(id);
        a.root.position.set(a.x, a.y0, a.z); a.root.rotation.y = a.yaw;
        if (o.tagText) { a.tag = tagSprite(o.tagText); a.tag.position.set(0, a.h + 0.35, 0); a.root.add(a.tag); a.tag.visible = false; }
        scene.add(a.root); list.push(a); pp(id).happy;
        return a;
    }
    const home = (x, z, r) => ({ hx: x, hz: z, hr: r });

    // anjing
    mk('dog', 'bruno', 'Bruno', quad({
        L: 0.55, W: 0.2, H: 0.22, lh: 0.22, fur: 0xc9964f, belly: 0xf0dcb0, head: [0.17, 0.17, 0.18], hy: 0.08, nh: 0.06, snout: [0.09, 0.075, 0.09], snoutC: 0xf0dcb0, nose: 0x1a1a1a,
        ear: { k: 'flop', s: [0.05, 0.11, 0.07], x: 0.095, y: 0.07, z: 0.04, c: 0x7a4a22, tilt: 0.5 }, tail: { w: 0.06, l: 0.25 }, tailUp: 0.9, shadow: true,
    }), { ...home(-6, -3, 9), tagText: 'Bruno' });
    // ayam
    for (let i = 0; i < 5; i++) mk('chicken', 'chicken' + (i + 1), 'Ayam', chickenRig(i), home(i < 3 ? -88 : -100, i < 3 ? -24 : -12, i < 3 ? 9 : 7));
    // kambing & sapi
    if (penR) {
        const pc = { hx: (penR.x0 + penR.x1) / 2, hz: (penR.z0 + penR.z1) / 2, rect: penR };
        [[0xece8de, 0x8d6a47], [0x8d6a47, 0xece8de], [0x3a3a40, 0xece8de]].forEach(([c, sp], i) => pen.push(mk('goat', 'goat' + (i + 1), 'Kambing', quad({
            L: 0.6, W: 0.22, H: 0.26, lh: 0.3, lw: 0.06, fur: c, head: [0.13, 0.15, 0.2], hy: 0.1, nh: 0.2, snout: [0.08, 0.08, 0.07], nose: 0x333333, hoof: 0x2a2a2a, grazeLegs: true, graze: 1.1, gait: 0.6,
            spots: [[0, 0.135, 0.1, 0.16, 0.02, 0.2]], spotC: sp, ear: { k: 'side', s: [0.05, 0.1, 0.07], x: 0.075, y: 0.03, z: -0.02, tilt: 1.3 }, horn: { s: [0.03, 0.09, 0.03], x: 0.04, c: 0xb9b3a4 },
            tail: { w: 0.04, l: 0.1 }, tailUp: 0.6, sleepX: 0.1, shadow: true,
            extra: (body, hd) => bx(hd, [0.035, 0.08, 0.035], [0, -0.1, 0.16], 0xdedacd, false),
        }), pc)));
        [['Si Belang', 0xf4f1ea, 0x23201f], ['Bleki', 0x2b2a2c, 0xeeeeee]].forEach(([n, c, sp], i) => pen.push(mk('cow', 'cow' + (i + 1), n, quad({
            L: 1.1, W: 0.46, H: 0.5, lh: 0.55, lw: 0.13, fur: c, head: [0.26, 0.28, 0.3], hy: 0.12, nh: 0.25, snout: [0.2, 0.13, 0.1], snoutC: 0xf2b8b8, hoof: 0x2a2a2a, graze: 1.25, grazeLegs: true, gait: 0.5, hx0: 0.15,
            spots: [[0, 0.255, 0.15, 0.34, 0.02, 0.36], [0.235, 0.05, -0.2, 0.02, 0.2, 0.3], [-0.235, 0, 0.25, 0.02, 0.22, 0.26]], spotC: sp,
            ear: { k: 'side', s: [0.05, 0.13, 0.08], x: 0.15, y: 0.08, z: -0.02, tilt: 1.3 }, horn: { s: [0.04, 0.1, 0.04], x: 0.1, c: 0xe8dcc0 }, tail: { w: 0.04, l: 0.55 }, tailUp: 0.05, sleepX: 0.1, shadow: true,
            extra: (body) => bx(body, [0.14, 0.08, 0.16], [0, -0.27, -0.3], 0xf3b0b0, false),
        }), { ...pc, tagText: n })));
    }
    // bebek
    if (lake) for (let i = 0; i < 5; i++) mk('duck', 'duck' + (i + 1), 'Bebek', duckRig(i % 2 === 0), { hx: (lake.x0 + lake.x1) / 2, hz: (lake.z0 + lake.z1) / 2, hr: 5, rect: lake, water: true, y0: -0.06 });
    // kelinci
    const rabCol = [0xb08860, 0x9a9a9a, 0xf0ece4, 0x7a5a3a];
    [[108, -72, 7], [108, -72, 7], [-12, -3, 5], [-12, -3, 5]].forEach(([x, z, r], i) => mk('rabbit', 'rabbit' + (i + 1), 'Kelinci', quad({
        L: 0.26, W: 0.14, H: 0.14, lh: 0.07, lw: 0.045, fur: rabCol[i], belly: 0xf4f0e8, head: [0.095, 0.09, 0.11], hy: 0.03, snout: [0.05, 0.04, 0.03], nose: 0xffa0b0, seed: i * 7,
        ear: { k: 'long', s: [0.035, 0.11, 0.02], x: 0.03, y: 0.045, z: -0.02, tilt: 0.15 }, tail: { w: 0.06, l: 0.05, c: 0xffffff }, tailUp: 0.5, sz: 0.5,
        extra: (body) => { for (const sx of [-1, 1]) bx(body, [0.04, 0.1, 0.12], [sx * 0.07, -0.01, -0.06], rabCol[i], false); },
    }), home(x, z, r)));

    /* ---- dekor ---- */
    const bhome = [[30, -30], [-30, -30], [82, 46], [-70, -30], [100, -100]];
    for (let i = 0; i < 7; i++) {
        const [hx, hz] = bhome[i % 5], rig = flyerRig(), ph = rnd(0, PI * 2), R = rnd(12, 22), h = rnd(6, 14), w = rnd(0.25, 0.4) * (i % 2 ? 1 : -1), fr = rnd(14, 20);
        scene.add(rig.root); let yaw = 0, roll = 0;
        decor.push({ update(dt, t, P, n) {
            const d = Math.hypot(P.x - hx, P.z - hz), vis = n <= 0.6 && d < 140; if (rig.root.visible !== vis) rig.root.visible = vis; if (!vis) return;
            const u = t * w + ph, s = Math.sign(w), ny = Math.atan2(s * Math.cos(u) * R, s * Math.cos(2 * u) * R), py = h + Math.sin(t * 0.6 + ph) * 1.5;
            rig.root.position.set(hx + Math.sin(u) * R, py, hz + Math.sin(2 * u) * R * 0.5);
            if (dt > 0) roll += (clamp(-wrapPi(ny - yaw) / dt * 0.25, -0.5, 0.5) - roll) * Math.min(1, dt * 4);
            yaw = ny; rig.root.rotation.y = yaw; rig.root.rotation.z = roll;
            const glide = Math.sin(t * 0.4 + ph * 3) > 0.55, fl = glide ? 0.2 : 0.2 + Math.sin(t * fr + ph) * 0.8;
            rig.wings.forEach(g => { g.rotation.z = g.userData.sx * fl; });
        } });
    }
    const khome = [[0, -3], [82, 46], [-88, -24]];
    for (let i = 0; i < 8; i++) {
        const [hx, hz] = khome[i % 3], rig = butterflyRig(), ph = rnd(0, 20), R = rnd(2.5, 5), w = rnd(0.4, 0.8); scene.add(rig.root);
        let px = hx, pz = hz, yaw = 0;
        decor.push({ update(dt, t, P, n) {
            const vis = n <= 0.6 && Math.hypot(P.x - hx, P.z - hz) < 70; if (rig.root.visible !== vis) rig.root.visible = vis; if (!vis) return;
            const u = t * w + ph, x = hx + Math.sin(u) * R + Math.sin(u * 2.3) * R * 0.3, z = hz + Math.cos(u * 0.8) * R, y = 1.5 + Math.sin(u * 1.7) * 0.45 + Math.sin(t * 6 + ph) * 0.05;
            if (Math.hypot(x - px, z - pz) > 0.002) yaw += wrapPi(Math.atan2(x - px, z - pz) - yaw) * Math.min(1, dt * 6);
            px = x; pz = z; rig.root.position.set(x, y, z); rig.root.rotation.y = yaw;
            const fl = Math.sin(t * 26 + ph * 5) * 0.75 + 0.25; rig.wings.forEach(g => { g.rotation.z = g.userData.sx * fl; });
        } });
    }
    if (lake) {
        const fish = fishRig(), jr = shrink(spots.lakeRect, 1.5), er = shrink(spots.lakeRect, 0.5), cx = (lake.x0 + lake.x1) / 2, cz = (lake.z0 + lake.z1) / 2;
        const JT = 0.9, HMAX = 0.7; let wait = rnd(2, 5), u = -1, sx = 0, sz = 0, vx = 0, vz = 0;
        const splash = (x, z) => { for (let i = 0; i < 6; i++) api.emit(x, 0, z, { color: 0xffffff, size: 0.1, vy: rnd(1.5, 3), life: 0.6, g: 9, spread: 0.5 }); };
        scene.add(fish.root);
        decor.push({ update(dt, t, P) {
            if (Math.hypot(P.x - cx, P.z - cz) > 80) { fish.root.visible = false; u = -1; return; }
            if (u < 0) {
                wait -= dt; if (wait > 0) return;
                sx = rnd(jr.x0, jr.x1); sz = rnd(jr.z0, jr.z1); const an = Math.random() * PI * 2, dd = rnd(1.5, 2.6);
                vx = (clamp(sx + Math.cos(an) * dd, er.x0, er.x1) - sx) / JT; vz = (clamp(sz + Math.sin(an) * dd, er.z0, er.z1) - sz) / JT;
                u = 0; fish.root.visible = true; splash(sx, sz); return;
            }
            u += dt / JT;
            if (u >= 1) { splash(sx + vx * JT, sz + vz * JT); u = -1; fish.root.visible = false; wait = rnd(4, 9); return; }
            const vy = 4 * HMAX * (1 - 2 * u) / JT, hs = Math.hypot(vx, vz);
            fish.root.position.set(sx + vx * JT * u, -0.05 + 4 * HMAX * u * (1 - u), sz + vz * JT * u);
            if (hs > 0.01) fish.root.rotation.y = Math.atan2(vx, vz); fish.root.rotation.x = -Math.atan2(vy, Math.max(hs, 0.5));
            fish.tail.rotation.y = Math.sin(t * 30) * 0.5;
        } });
    }

    /* ---- AI hewan darat/bebek ---- */
    function think(a, night01) {
        if (night01 > 0.6 && a.sleeps) { a.state = a.lieKind || 'sleep'; a.tgt = null; a.timer = rnd(6, 12); return; }
        const r = Math.random(), w = a.w;
        if (r < w[0]) { a.tgt = rp(a); a.state = 'walk'; a.timer = rnd(8, 14); }
        else if (r < w[0] + w[1]) { a.state = 'graze'; a.tgt = null; a.timer = rnd(3, 7); }
        else if (a.rest && r < w[0] + w[1] + w[2]) { a.state = a.rest; a.tgt = null; a.timer = rnd(8, 16); }
        else { a.state = 'idle'; a.tgt = null; a.timer = rnd(2, 5); }
    }
    function startFlee(a, P, dx, dz, d) {
        const k = d > 0.01 ? 1 / d : 1, away = a.kind === 'rabbit' ? 6 : 4;
        let x = a.x - dx * k * away, z = a.z - dz * k * away; const hd = Math.hypot(x - a.hx, z - a.hz), lim = a.hr * 1.2;
        if (hd > lim) { x = a.hx + (x - a.hx) / hd * lim; z = a.hz + (z - a.hz) / hd * lim; }
        a.tgt = { x, z }; a.state = 'flee'; a.timer = 2.5; a.hp = 0; a.pause = 0;
        if (a.kind === 'chicken' && Math.random() < 0.3) api.sfx('cluck');
    }
    function tick(a, dt, t, P, night01) {
        let dx = P.x - a.x, dz = P.z - a.z, d = Math.hypot(dx, dz);
        const follow = a.kind === 'dog' && !!S.follow.bruno && !P.veh;
        if (follow && d > 45) { a.x = P.x - 2.5; a.z = P.z - 2.5; const p = { x: a.x, z: a.z }; resolve(p, 0.25); a.x = p.x; a.z = p.z; a.tgt = null; dx = P.x - a.x; dz = P.z - a.z; d = Math.hypot(dx, dz); }
        const vis = d < 90; if (a.root.visible !== vis) a.root.visible = vis;
        if (!vis) return;
        if (a.tag) a.tag.visible = d < 14;
        if (d > 45) return;
        if (a.modeT > 0 && (a.modeT -= dt) <= 0) a.mode = null;
        if (d < 12 && a.amb && Math.random() < dt * a.amb) api.sfx(a.sfx);
        if (!a.mode) {
            if (a.state === 'sleep' && night01 < 0.5) { a.state = 'idle'; a.timer = 0; }
            if (a.flees && a.state !== 'flee' && ((a.kind === 'chicken' && d < 2.2 && P.speed > 3) || (a.kind === 'rabbit' && d < 4 && (P.speed > 1 || d < 2.2)))) startFlee(a, P, dx, dz, d);
            else if (a.kind === 'rabbit' && a.state !== 'flee' && d < 8) { a.state = 'freeze'; a.tgt = null; a.timer = 0.4; }
            else if (follow) {
                if (d > 3.2) { a.state = 'walk'; a.run = d > 8; a.tgt = { x: P.x - dx / d * 1.6, z: P.z - dz / d * 1.6 }; }
                else if (a.state !== 'sit') { a.state = 'sit'; a.tgt = null; }
                a.timer = 0.5;
            } else if ((a.timer -= dt) <= 0) think(a, night01);
        }
        let mv = false, hopping = false;
        if (!a.mode && (a.state === 'walk' || a.state === 'flee') && a.tgt) {
            const tx = a.tgt.x - a.x, tz = a.tgt.z - a.z, td = Math.hypot(tx, tz);
            if (td < 0.25) { a.tgt = null; if (!follow) { a.state = 'idle'; a.timer = rnd(1.5, 4); } }
            else {
                const sp = a.state === 'flee' ? a.fsp : follow ? (a.run ? 5 : 3) : a.sp;
                a.yaw += wrapPi(Math.atan2(tx, tz) - a.yaw) * (1 - Math.exp(-10 * dt));
                let go = true;
                if (a.kind === 'rabbit') {
                    if (a.pause > 0) { a.pause -= dt; go = false; }
                    else { a.hp += dt / 0.34; hopping = true; if (a.hp >= 1) { a.hp = 0; a.pause = a.state === 'flee' ? 0.05 : rnd(0.15, 0.7); } }
                }
                if (go) { const st = Math.min(sp * dt, td); a.x += tx / td * st; a.z += tz / td * st; mv = true; a.phase += sp * dt * a.stride; }
                if (a.rect) { a.x = clamp(a.x, a.rect.x0, a.rect.x1); a.z = clamp(a.z, a.rect.z0, a.rect.z1); }
                else if (!follow) { const hd = Math.hypot(a.x - a.hx, a.z - a.hz), lim = a.hr * 1.35; if (hd > lim) { a.x = a.hx + (a.x - a.hx) / hd * lim; a.z = a.hz + (a.z - a.hz) / hd * lim; } }
                if (!a.water && go) { const p = { x: a.x, z: a.z }; if (resolve(p, 0.25)) { a.x = p.x; a.z = p.z; if (!follow) { a.tgt = null; a.state = 'idle'; a.timer = rnd(0.5, 2); } } }
            }
        }
        let mode;
        if (a.mode) mode = a.mode;
        else if (a.state === 'walk' || a.state === 'flee') mode = a.kind === 'rabbit' ? (hopping && a.pause <= 0 ? 'hop' : 'idle') : !mv ? 'idle' : a.state === 'flee' && a.kind === 'chicken' ? 'flee' : 'walk';
        else mode = a.state;
        a.root.position.set(a.x, a.y0, a.z); a.root.rotation.y = a.yaw;
        a.rig.pose(mode, mode === 'hop' ? a.hp : a.phase, t, dt);
    }

    function update(dt, t, P, night01 = 0, hour = 12) {
        PL = P; dt = Math.min(dt, 0.1);
        for (const a of list) tick(a, dt, t, P, night01);
        if (pen.length && Math.hypot(P.x - pen[0].hx, P.z - pen[0].hz) < 60) {   // saling menjauh di kandang
            for (let i = 0; i < pen.length; i++) for (let j = i + 1; j < pen.length; j++) {
                const a = pen[i], b = pen[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = (a.kind === 'cow' || b.kind === 'cow') ? 1.1 : 0.8;
                if (d < m && d > 1e-4) { const k = (m - d) / 2 * Math.min(1, dt * 3) / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
            }
        }
        for (const e of decor) e.update(dt, t, P, night01, hour);
    }
    return { list, update };
}
