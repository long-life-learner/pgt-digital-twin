/* Kendaraan: mobil, motor, ekskavator (alat berat) — depan = +Z */
import { THREE, PI, M, bx, cy, grp, glow, clamp } from './kit.js';

function wheel(parent, x, y, z, r, w, steer = false) {
    const st = grp(parent, x, y, z), roll = grp(st, 0, 0, 0);
    cy(roll, r, r, w, [0, 0, 0], 0x15171f, [0, 0, PI / 2], 10, false);
    cy(roll, r * 0.5, r * 0.5, w + 0.02, [0, 0, 0], 0xb9c3da, [0, 0, PI / 2], 6, false);
    return { st, roll, steer };
}

export function buildCar(color = 0xd9344a) {
    const root = new THREE.Group();
    const body = grp(root, 0, 0, 0);
    bx(body, [1.85, 0.55, 4.1], [0, 0.62, 0], color);
    bx(body, [1.7, 0.18, 1.2], [0, 0.98, 1.25], color);                 // kap mesin
    bx(body, [1.6, 0.62, 2.0], [0, 1.2, -0.3], color);                   // kabin
    bx(body, [1.62, 0.44, 0.08], [0, 1.22, 0.68], 0x9fd8ff, false);      // kaca depan
    bx(body, [1.62, 0.44, 0.08], [0, 1.22, -1.28], 0x9fd8ff, false);
    for (const s of [-1, 1]) bx(body, [0.06, 0.4, 1.7], [s * 0.82, 1.22, -0.3], 0x9fd8ff, false);
    bx(body, [1.88, 0.14, 4.14], [0, 0.34, 0], 0x22252f, false);
    bx(root, [0.5, 0.12, 0.04], [0, 0.55, 2.07], 0xf0f0f0, false);
    const hl = [-0.6, 0.6].map(x => bx(root, [0.4, 0.2, 0.06], [x, 0.78, 2.06], glow(0x6b6f55), false));
    const tl = [-0.62, 0.62].map(x => bx(root, [0.42, 0.18, 0.06], [x, 0.78, -2.06], glow(0x5a1020), false));
    const wheels = [wheel(root, -0.95, 0.38, 1.3, 0.38, 0.28, true), wheel(root, 0.95, 0.38, 1.3, 0.38, 0.28, true), wheel(root, -0.95, 0.38, -1.3, 0.38, 0.28), wheel(root, 0.95, 0.38, -1.3, 0.38, 0.28)];
    root.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return {
        kind: 'car', name: 'Mobil', root, wheels, radius: 1.5, maxSpeed: 19, accel: 9, turn: 1.7, hlPos: [0, 0.9, 2.1],
        setLights(on) { hl.forEach(m => m.material.color.setHex(on ? 0xfff6c0 : 0x6b6f55)); },
        setBrake(b) { tl.forEach(m => m.material.color.setHex(b ? 0xff3050 : 0x5a1020)); },
        seat: [0, 0, 0],
    };
}

export function buildMotor(color = 0x2f9e6e) {
    const root = new THREE.Group();
    const body = grp(root, 0, 0, 0);
    bx(body, [0.34, 0.4, 1.1], [0, 0.6, -0.05], color);
    bx(body, [0.4, 0.14, 0.7], [0, 0.88, -0.35], 0x1b1b24, false);        // jok
    bx(body, [0.3, 0.5, 0.18], [0, 0.55, 0.62], color);                   // leg shield
    bx(body, [0.14, 0.5, 0.14], [0, 0.65, 0.78], 0x6f7a96, false);
    const bar = grp(body, 0, 1.02, 0.72); bx(bar, [0.8, 0.06, 0.08], [0, 0, 0], 0x1b1b24, false);
    bx(bar, [0.18, 0.16, 0.14], [0, 0.04, 0.06], 0xdfe6f5, false);
    const hl = bx(bar, [0.16, 0.12, 0.05], [0, 0.0, 0.14], glow(0x6b6f55), false);
    const tl = bx(body, [0.2, 0.08, 0.05], [0, 0.78, -0.62], glow(0x5a1020), false);
    const wheels = [wheel(root, 0, 0.3, 0.78, 0.3, 0.14, true), wheel(root, 0, 0.3, -0.68, 0.3, 0.14)];
    bx(root, [0.28, 0.06, 0.2], [0, 0.4, 0.78], color, false);
    root.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return {
        kind: 'motor', name: 'Motor', root, wheels, radius: 0.7, maxSpeed: 22, accel: 12, turn: 2.4, hlPos: [0, 1.0, 0.9], rider: [0, 0.86, -0.25], lean: true, body,
        setLights(on) { hl.material.color.setHex(on ? 0xfff6c0 : 0x6b6f55); },
        setBrake(b) { tl.material.color.setHex(b ? 0xff3050 : 0x5a1020); },
    };
}

export function buildExcavator() {
    const root = new THREE.Group();
    const yel = 0xf2b705, dk = 0x2b2f3c;
    for (const s of [-1, 1]) { bx(root, [0.85, 0.75, 3.6], [s * 1.25, 0.4, 0], dk); for (let i = -4; i <= 4; i++) bx(root, [0.9, 0.08, 0.3], [s * 1.25, 0.08, i * 0.4], 0x555b70, false); }
    bx(root, [2.0, 0.4, 2.6], [0, 0.55, 0], 0x555b70);
    const cab = grp(root, 0, 0.75, 0);
    bx(cab, [2.4, 0.5, 3.0], [0, 0.25, -0.1], yel);
    bx(cab, [1.5, 1.4, 1.5], [-0.35, 1.2, -0.45], yel);
    bx(cab, [1.52, 0.8, 0.06], [-0.35, 1.35, 0.32], 0x9fd8ff, false);
    bx(cab, [0.06, 0.8, 1.2], [-1.12, 1.35, -0.45], 0x9fd8ff, false);
    bx(cab, [2.4, 0.9, 0.9], [0, 0.7, -1.5], 0x38404f);                    // counterweight
    cy(cab, 0.12, 0.12, 0.7, [0.7, 1.2, -1.2], 0x777, null, 6);
    const beacon = bx(cab, [0.2, 0.16, 0.2], [-0.9, 2.0, -0.45], glow(0x553300), false);
    const boom = grp(cab, 0.7, 0.55, 0.9);
    bx(boom, [0.5, 0.5, 3.6], [0, 0, 1.7], yel);
    bx(boom, [0.3, 0.3, 0.2], [0, 0.3, 0.2], 0x777, false);
    const stick = grp(boom, 0, 0, 3.5);
    bx(stick, [0.36, 0.36, 2.6], [0, 0, 1.2], yel);
    const bucket = grp(stick, 0, 0, 2.5);
    bx(bucket, [0.9, 0.12, 0.8], [0, -0.1, 0.35], 0x6f7a96); bx(bucket, [0.9, 0.5, 0.12], [0, 0.12, 0.1], 0x6f7a96);
    for (const s of [-1, 1]) bx(bucket, [0.08, 0.5, 0.8], [s * 0.45, 0.12, 0.35], 0x6f7a96);
    bx(bucket, [0.8, 0.12, 0.18], [0, -0.18, 0.8], 0xdfe6f5, false);
    const hl = bx(cab, [0.3, 0.12, 0.06], [0.9, 1.85, 0.3], glow(0x6b6f55), false);
    root.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return {
        kind: 'excavator', name: 'Ekskavator', root, wheels: [], radius: 2.2, maxSpeed: 4.5, accel: 3, turn: 0.9, hlPos: [0.9, 2.6, 0.5],
        cab, boom, stick, bucket, beacon, dig: 0, digging: false,
        setLights(on) { hl.material.color.setHex(on ? 0xfff6c0 : 0x6b6f55); },
        setBrake() { },
    };
}
