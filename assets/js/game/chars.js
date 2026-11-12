/* Karakter voxel: manusia (pemain & NPC) dan kucing */
import { THREE, PI, M, bx, cy, grp, glow, clamp, damp } from './kit.js';

export function buildPerson(o = {}) {
    const { shirt = 0x4b7bec, pants = 0x2f3b5a, skin = 0xf1c7a5, hair = 0x3a2a1a, shoe = 0x2a2018, hat = null, long = false, dress = false } = o;
    const root = new THREE.Group();
    const hips = grp(root, 0, 0.85, 0);
    bx(hips, [0.36, 0.2, 0.22], [0, 0, 0], dress ? shirt : pants, false);
    const torso = grp(hips, 0, 0.1, 0);
    bx(torso, [0.42, 0.55, 0.24], [0, 0.28, 0], shirt, false);
    if (dress) bx(torso, [0.5, 0.3, 0.3], [0, -0.05, 0], shirt, false);
    if (o.vest) bx(torso, [0.44, 0.4, 0.26], [0, 0.34, 0], o.vest, false);
    const head = grp(torso, 0, 0.58, 0);
    bx(head, [0.27, 0.27, 0.27], [0, 0.14, 0], skin, false);
    bx(head, [0.29, 0.09, 0.29], [0, 0.29, 0], hair, false);
    bx(head, [0.29, long ? 0.36 : 0.18, 0.07], [0, long ? 0.1 : 0.19, -0.11], hair, false);
    bx(head, [0.04, 0.05, 0.02], [-0.065, 0.16, 0.137], 0x111111, false);
    bx(head, [0.04, 0.05, 0.02], [0.065, 0.16, 0.137], 0x111111, false);
    if (hat) { bx(head, [0.33, 0.07, 0.33], [0, 0.32, 0], hat, false); bx(head, [0.3, 0.1, 0.3], [0, 0.37, 0], hat, false); bx(head, [0.3, 0.02, 0.14], [0, 0.31, 0.2], hat, false); }
    const mkArm = (s) => { const a = grp(torso, s * 0.27, 0.52, 0); bx(a, [0.12, 0.5, 0.12], [0, -0.25, 0], shirt, false); bx(a, [0.1, 0.1, 0.1], [0, -0.55, 0], skin, false); return a; };
    const mkLeg = (s) => { const l = grp(hips, s * 0.1, -0.1, 0); bx(l, [0.15, 0.75, 0.15], [0, -0.38, 0], dress ? skin : pants, false); bx(l, [0.16, 0.08, 0.25], [0, -0.72, 0.05], shoe, false); return l; };
    const P = { ov: null, root, hips, torso, head, lA: mkArm(-1), rA: mkArm(1), lL: mkLeg(-1), rL: mkLeg(1) };
    P.hand = grp(P.rA, 0, -0.55, 0);                  // tempat memegang joran / palu
    /* joran pancing & palu (di tangan kanan) */
    const rod = grp(P.rA, 0, -0.55, 0); rod.visible = false; rod.rotation.x = -0.7;
    bx(rod, [0.035, 2.3, 0.035], [0, -1.15, 0], 0x8a5a33, false); bx(rod, [0.09, 0.1, 0.1], [0, -0.05, 0.02], 0x333845, false); bx(rod, [0.05, 0.05, 0.05], [0, -2.3, 0], 0xff4d6d, false);
    const tip = grp(rod, 0, -2.3, 0); P.rod = rod; P.rodTip = tip; P.holdRod = (on) => { rod.visible = on; };
    const ham = grp(P.rA, 0, -0.58, 0.06); ham.visible = false; bx(ham, [0.05, 0.3, 0.05], [0, -0.1, 0.1], 0x8a5a33, false); bx(ham, [0.16, 0.1, 0.1], [0, 0.07, 0.1], 0x6f7a96, false); P.hammer = ham; P.holdHammer = (on) => { ham.visible = on; };
    /* gadget tablet (dipegang di depan dada saat membuka tablet) */
    const tabProp = grp(torso, 0, 0.26, 0.42); tabProp.visible = false; tabProp.rotation.x = -0.42;
    bx(tabProp, [0.42, 0.018, 0.28], [0, 0, 0], 0x161b2b, false);
    bx(tabProp, [0.424, 0.015, 0.012], [0, 0.002, 0.138], 0x4ee1ff, false);
    bx(tabProp, [0.424, 0.015, 0.012], [0, 0.002, -0.138], 0x4ee1ff, false);
    bx(tabProp, [0.012, 0.015, 0.28], [-0.208, 0.002, 0], 0x4ee1ff, false);
    bx(tabProp, [0.012, 0.015, 0.28], [0.208, 0.002, 0], 0x4ee1ff, false);
    bx(tabProp, [0.38, 0.006, 0.24], [0, 0.011, 0], 0x0c1527, true);
    bx(tabProp, [0.34, 0.004, 0.026], [0, 0.016, -0.09], 0xffd166, true);
    bx(tabProp, [0.15, 0.004, 0.09], [-0.085, 0.016, -0.01], 0x06d6a0, true);
    bx(tabProp, [0.15, 0.004, 0.09], [0.085, 0.016, -0.01], 0xef476f, true);
    bx(tabProp, [0.34, 0.004, 0.022], [0, 0.016, 0.075], 0x4ee1ff, true);
    P.tablet = tabProp; P.holdTablet = (on) => { tabProp.visible = on; };
    P.setFPV = (on) => { head.visible = !on; for (const c of torso.children) if (c.isMesh) c.visible = !on; };
    P.headPos = (v) => head.getWorldPosition(v);
    root.traverse(m => { if (m.isMesh) m.castShadow = true; });

    /* mode: idle walk run sit cook eat drink wash phone drive type sleep dig · fishcast fishwait fishreel hammer pick campsit pay stretch */
    P.pose = (mode, phase, t, dt = 0.016) => {
        const k = 1 - Math.exp(-18 * dt);
        let hy = 0.85, tx = 0, lLx = 0, rLx = 0, lAx = 0, rAx = 0, lAz = 0, rAz = 0, hx = 0, rz = 0, rodX = -0.7;
        const s = Math.sin(phase);
        if (mode === 'walk' || mode === 'run') {
            const A = mode === 'run' ? 1.0 : 0.6;
            lLx = s * A; rLx = -s * A; lAx = -s * A * 0.8; rAx = s * A * 0.8; tx = mode === 'run' ? 0.16 : 0.04; hy += Math.abs(Math.cos(phase)) * 0.03;
        } else if (mode === 'sit') { hy = 0.52; lLx = rLx = -PI / 2; lAx = rAx = -0.5; }
        else if (mode === 'type') { hy = 0.52; lLx = rLx = -PI / 2; lAx = -1.25 + Math.sin(t * 22) * 0.06; rAx = -1.25 + Math.cos(t * 19) * 0.06; tx = 0.12; hx = 0.1; }
        else if (mode === 'cook') { lAx = -1.2 + Math.sin(t * 9) * 0.15; rAx = -1.3 + Math.cos(t * 9) * 0.25; tx = 0.18; hx = 0.2; }
        else if (mode === 'wash') { lAx = -1.0 + Math.sin(t * 10) * 0.3; rAx = -1.0 - Math.sin(t * 10) * 0.3; tx = 0.25; }
        else if (mode === 'eat') { rAx = -2.3 + Math.sin(t * 7) * 0.25; lAx = -0.4; hx = 0.08; }
        else if (mode === 'drink') { rAx = -2.6; rAz = -0.15; hx = -0.35; }
        else if (mode === 'phone') { lAx = -1.1; rAx = -1.25; tx = 0.08; hx = 0.28; }
        else if (mode === 'sitphone') { hy = 0.52; lLx = rLx = -PI / 2; lAx = -1.1; rAx = -1.25; hx = 0.28; }
        else if (mode === 'tablet') {
            tx = 0.08 + Math.sin(t * 2.2) * 0.008;
            hx = 0.40 + Math.sin(t * 1.8) * 0.025;
            lAx = -1.24 + Math.sin(t * 2.2) * 0.012;
            lAz = 0.35;
            rAx = -1.22 + Math.sin(t * 5.5) * 0.035;
            rAz = -0.33 + Math.cos(t * 5.5) * 0.02;
            tabProp.position.y = 0.26 + Math.sin(t * 2.2) * 0.006;
            tabProp.rotation.x = -0.42 + Math.sin(t * 2.2) * 0.015;
        }
        else if (mode === 'sittablet') {
            hy = 0.52; lLx = rLx = -PI / 2;
            tx = 0.08 + Math.sin(t * 2.2) * 0.008;
            hx = 0.40 + Math.sin(t * 1.8) * 0.025;
            lAx = -1.24 + Math.sin(t * 2.2) * 0.012;
            lAz = 0.35;
            rAx = -1.22 + Math.sin(t * 5.5) * 0.035;
            rAz = -0.33 + Math.cos(t * 5.5) * 0.02;
            tabProp.position.y = 0.26 + Math.sin(t * 2.2) * 0.006;
            tabProp.rotation.x = -0.42 + Math.sin(t * 2.2) * 0.015;
        }
        else if (mode === 'drive') { hy = 0.52; lLx = rLx = -1.3; lAx = rAx = -1.15; }
        else if (mode === 'sleep') { hy = 0.2; rz = 0; }
        else if (mode === 'fishcast') { const u = Math.min(1, Math.max(0, phase)); rAx = u < 0.45 ? -2.7 + u * 1.2 : -2.2 + (u - 0.45) * 1.8; lAx = -1.0; tx = u < 0.45 ? -0.25 : 0.2; rodX = u < 0.45 ? -0.2 : -0.7; hx = 0.05; }
        else if (mode === 'fishwait') { rAx = -1.25 + Math.sin(t * 1.3) * 0.04; lAx = -1.0; hx = 0.12; tx = -0.04; rodX = -0.75 + Math.sin(t * 1.1) * 0.05; }
        else if (mode === 'fishreel') { rAx = -1.0 + Math.sin(t * 15) * 0.1; lAx = -0.8 - Math.sin(t * 15) * 0.12; tx = -0.22; hx = 0.05; rodX = -1.15 + Math.sin(t * 9) * 0.08; }
        else if (mode === 'hammer') { hy = 0.5; lLx = rLx = -1.15; tx = 0.5; hx = 0.2; lAx = -1.2; rAx = -1.5 + Math.sin(t * 11) * 0.75; }
        else if (mode === 'pick') { hy = 0.55; lLx = rLx = -1.0; tx = 0.65; hx = 0.1; lAx = -1.3 + Math.sin(t * 5) * 0.2; rAx = -1.4 - Math.sin(t * 5) * 0.2; }
        else if (mode === 'campsit') { hy = 0.52; lLx = rLx = -PI / 2; lAx = -0.7; rAx = -0.7 + Math.sin(t * 2) * 0.05; hx = 0.1; }
        else if (mode === 'pay') { rAx = -1.55; lAx = -0.1; hx = 0.1; }
        else if (mode === 'stretch') { lAx = rAx = -3.0; tx = -0.12; }
        else if (mode === 'wave') { rAx = -2.9 + Math.sin(t * 8) * 0.2; rAz = -0.3; }
        else if (mode === 'talk') { rAx = -0.9 + Math.sin(t * 3.1) * 0.3; lAx = -0.25 + Math.sin(t * 2.3) * 0.12; hx = Math.sin(t * 2.2) * 0.06; tx = 0.03; }
        else if (mode === 'fish') { rAx = -1.15; lAx = -0.95; tx = 0.04; hx = 0.08 + Math.sin(t * 1.3) * 0.04; }
        else if (mode === 'cast') {                                        // phase 0..1: ayun ke belakang lalu lempar
            const p = Math.min(1, Math.max(0, phase));
            const sw = p < 0.45 ? -0.8 + 1.3 * (p / 0.45) : 0.5 - 2.2 * Math.pow((p - 0.45) / 0.55, 0.6);
            rAx = sw; lAx = sw * 0.4 - 0.3; tx = p < 0.45 ? -0.18 * (p / 0.45) : 0.12; hx = 0.05;
        }
        else if (mode === 'reel') { rAx = -1.25 + Math.sin(t * 13) * 0.12; lAx = -1.0 + Math.cos(t * 13) * 0.3; tx = -0.14; hx = -0.05; }
        else if (mode === 'hammer') { hy = 0.5; lLx = rLx = -1.1; tx = 0.45; hx = 0.25; rAx = -1.3 + Math.sin(t * 9) * 0.7; lAx = -0.7; }
        else if (mode === 'pet') { hy = 0.62; lLx = rLx = -1.0; tx = 0.5; hx = 0.2; rAx = -1.2 + Math.sin(t * 5) * 0.3; lAx = -0.6; }
        else if (mode === 'sitfire') { hy = 0.52; lLx = rLx = -PI / 2; lAx = rAx = -0.9; hx = 0.1; }
        else if (mode === 'fish') { lAx = -1.0 + Math.sin(t * 1.3) * 0.02; rAx = -1.15 + Math.sin(t * 1.1) * 0.03; tx = 0.03; hx = Math.sin(t * 0.7) * 0.05; }
        else if (mode === 'whistle') { lAx = -1.0; rAx = -1.15; tx = 0.02; hx = -0.22 + Math.sin(t * 3) * 0.04; }
        else if (mode === 'crouch') { hy = 0.5; lLx = rLx = -1.25; tx = 0.45; hx = 0.2; lAx = -0.8; rAx = -1.0 + Math.sin(t * 5) * 0.15; }
        else if (mode === 'hammer') { hy = 0.5; lLx = rLx = -1.25; tx = 0.5; hx = 0.2; lAx = -0.9; rAx = -1.5 + Math.sin(t * 11) * 0.8; }
        else if (mode === 'lift') { lAx = -2.5 + Math.sin(t * 4) * 0.25; rAx = -2.5 - Math.sin(t * 4) * 0.25; tx = -0.12; hx = -0.2; }
        else if (mode === 'dig') { tx = 0.4; hx = 0.2; lAx = -0.9 + Math.sin(t * 6) * 0.5; rAx = -0.9 + Math.sin(t * 6) * 0.5; }
        else if (mode === 'sleepstand') { hx = 0.5; tx = 0.1; }
        else { /* idle */ lAx = Math.sin(t * 1.6) * 0.03; rAx = -Math.sin(t * 1.6) * 0.03; tx = Math.sin(t * 1.6) * 0.012; hy += Math.sin(t * 1.6) * 0.004; }
        if (P.ov) { const v = P.ov; if (v.rAx !== undefined) rAx = v.rAx; if (v.lAx !== undefined) lAx = v.lAx; if (v.hx !== undefined) hx = v.hx; if (v.tx !== undefined) tx = v.tx; }
        const T = (o, key, v) => { o.rotation[key] += (v - o.rotation[key]) * k; };
        T(P.lL, 'x', lLx); T(P.rL, 'x', rLx); T(P.lA, 'x', lAx); T(P.rA, 'x', rAx); T(P.lA, 'z', lAz); T(P.rA, 'z', rAz);
        T(P.torso, 'x', tx); T(P.head, 'x', hx); T(rod, 'x', rodX); ham.visible = mode === 'hammer'; tabProp.visible = (mode === 'tablet' || mode === 'sittablet');
        hips.position.y += (hy - hips.position.y) * k;
    };
    return P;
}

export function buildCat({ fur = 0x9aa0ab, belly = 0xe8eaf0, scale = 1.6, chubby = 1, stripe = null, nose = 0xffa0b0 } = {}) {
    const root = new THREE.Group();
    const body = grp(root, 0, 0, 0);
    const bw = 0.26 * chubby, bh = 0.24 * chubby;
    bx(body, [bw, bh, 0.5], [0, 0.22 + (bh - 0.24) / 2, 0], fur, false);
    bx(body, [bw * 0.7, 0.04, 0.34], [0, 0.22 + (bh - 0.24) / 2 - bh / 2 + 0.01, 0.02], belly, false);
    if (stripe) for (let i = -1; i <= 1; i++) bx(body, [bw + 0.01, 0.03, 0.05], [0, 0.22 + bh / 2 + 0.003, i * 0.14], stripe, false);
    const head = grp(body, 0, 0.36, 0.3);
    bx(head, [0.26 * (0.9 + chubby * 0.1), 0.22, 0.22], [0, 0, 0], fur, false);
    bx(head, [0.05, 0.08, 0.05], [-0.09, 0.14, 0], fur, false); bx(head, [0.05, 0.08, 0.05], [0.09, 0.14, 0], fur, false);
    bx(head, [0.025, 0.04, 0.02], [-0.06, 0.03, 0.115], 0x1a1a1a, false); bx(head, [0.025, 0.04, 0.02], [0.06, 0.03, 0.115], 0x1a1a1a, false);
    bx(head, [0.04, 0.03, 0.02], [0, -0.02, 0.115], nose, false);
    bx(head, [0.12, 0.06, 0.02], [0, -0.07, 0.108], belly, false);
    if (chubby > 1) { bx(head, [0.05, 0.05, 0.02], [-0.12, -0.03, 0.1], 0xffb6c1, false); bx(head, [0.05, 0.05, 0.02], [0.12, -0.03, 0.1], 0xffb6c1, false); }
    const tail = grp(body, 0, 0.3, -0.26);
    bx(tail, [0.06, 0.06, 0.3], [0, 0.07, -0.13], fur, false); bx(tail, [0.06, 0.06, 0.1], [0, 0.15, -0.28], fur, false);
    const legs = [];
    for (const [x, z] of [[-0.09, 0.17], [0.09, 0.17], [-0.09, -0.17], [0.09, -0.17]]) { const l = grp(body, x * chubby, 0.15, z); bx(l, [0.07, 0.16, 0.07], [0, -0.07, 0], fur, false); legs.push(l); }
    root.scale.setScalar(scale); root.traverse(m => { if (m.isMesh) m.castShadow = true; });
    const C = { root, body, head, tail, legs, scale };
    C.pose = (mode, phase, t, dt = 0.016) => {
        const k = 1 - Math.exp(-14 * dt);
        let by = 0, bs = 1, bz = 0, hx = 0, lg = [0, 0, 0, 0], ts = Math.sin(t * 2) * 0.3, tx = 0.2;
        if (mode === 'walk') { const s = Math.sin(phase); lg = [s, -s, -s, s].map(v => v * 0.7); ts = Math.sin(phase * 0.5) * 0.35; by = Math.abs(Math.cos(phase)) * 0.015; }
        else if (mode === 'sit') { bz = -0.35; hx = -0.2; lg = [0, 0, -1.3, -1.3]; by = -0.02; tx = -0.2; ts = Math.sin(t * 1.4) * 0.5; }
        else if (mode === 'sleep') { bs = 0.78; by = -0.04; hx = 0.6; lg = [-1.4, -1.4, -1.4, -1.4]; ts = 0.9; tx = 0; }
        else if (mode === 'eat') { hx = 0.7 + Math.sin(t * 9) * 0.12; lg = [0, 0, 0, 0]; }
        else if (mode === 'happy') { by = Math.abs(Math.sin(t * 8)) * 0.05; ts = Math.sin(t * 10) * 0.5; hx = -0.15; }
        const T = (o, key, v) => { o.rotation[key] += (v - o.rotation[key]) * k; };
        T(body, 'x', bz); body.scale.y += (bs - body.scale.y) * k; body.position.y += (by - body.position.y) * k;
        T(head, 'x', hx); T(tail, 'y', ts); T(tail, 'x', tx);
        legs.forEach((l, i) => T(l, 'x', lg[i]));
    };
    return C;
}
