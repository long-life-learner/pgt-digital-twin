/* Perkakas dasar: material toon pixel, helper mesh, tabrakan (grid spasial) */
import * as THREE from 'three';
export { THREE };
export const PI = Math.PI;
export const clamp = THREE.MathUtils.clamp;
export const damp = THREE.MathUtils.damp;
export const lerp = THREE.MathUtils.lerp;
export const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const wrapPi = (a) => { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; };

const grad = new THREE.DataTexture(new Uint8Array([95, 150, 215, 255]), 4, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const cache = new Map();
export const M = (hex) => { if (!cache.has(hex)) cache.set(hex, new THREE.MeshToonMaterial({ color: hex, gradientMap: grad })); return cache.get(hex); };
export const Mx = (hex, extra = {}) => new THREE.MeshToonMaterial({ color: hex, gradientMap: grad, ...extra });   // material unik (bisa diubah)
export const glow = (hex) => new THREE.MeshBasicMaterial({ color: hex });
export const toonTex = (map) => new THREE.MeshToonMaterial({ map, gradientMap: grad });

export function bx(parent, [w, h, d], [x, y, z], mat, shadow) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'number' ? M(mat) : mat);
    m.position.set(x, y, z);
    m.castShadow = shadow ?? Math.max(w, h, d) >= 0.9; m.receiveShadow = true;
    parent.add(m); return m;
}
export function cy(parent, rt, rb, h, [x, y, z], mat, rot = null, seg = 8, shadow) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof mat === 'number' ? M(mat) : mat);
    m.position.set(x, y, z); if (rot) m.rotation.set(...rot);
    m.castShadow = shadow ?? Math.max(rt, rb, h / 2) >= 0.45; m.receiveShadow = true;
    parent.add(m); return m;
}
export const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent && parent.add(g); return g; };

export function pixTex(canvas, { repeat = null, mip = false } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
    t.generateMipmaps = mip; t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
}

/* papan nama pixel (sprite) */
export function tagSprite(text, { color = '#ffffff', bg = '#000000b0', size = 22 } = {}) {
    const c = document.createElement('canvas'); const g = c.getContext('2d');
    g.font = `${size}px VT, monospace`; const w = Math.ceil(g.measureText(text).width) + 14;
    c.width = w; c.height = size + 10;
    g.font = `${size}px VT, monospace`; g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 7, c.height / 2 + 1);
    const t = pixTex(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
    const k = 0.0115; s.scale.set(c.width * k, c.height * k, 1);
    return s;
}
export function signMesh(parent, text, w, h, [x, y, z], ry = 0, bg = '#1b3a57', fg = '#fff') {
    const c = document.createElement('canvas'); c.width = 128; c.height = Math.max(16, Math.round(128 * h / w));
    const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = fg; g.font = `bold ${Math.floor(c.height * 0.55)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: pixTex(c) }));
    m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}

/* ---------------- tabrakan: grid spasial ---------------- */
const CELL = 10, grid = new Map();
const key = (i, j) => (i + 200) * 1000 + (j + 200);
function reg(o, x0, x1, z0, z1) {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
        for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
            const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o);
        }
    return o;
}
export const setCol = (o, on) => { if (o) o.dead = !on; };
export const addBox = (x0, x1, z0, z1) => reg({ t: 0, x0, x1, z0, z1 }, x0, x1, z0, z1);
export const addBoxC = (cx, cz, w, d) => addBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2);
export const addCircle = (x, z, r) => reg({ t: 1, x, z, r }, x - r, x + r, z - r, z + r);
export const dynBlock = [];               // penghalang dinamis {x,z,r,on}
export const blockedAt = (x, z, r = 0.3) => { const q = { x, z }; return resolve(q, r); };
export function resolve(p, r, ig = 0) {            // p: {x,z}  -> mutasi; return true jika menabrak
    let hit = false;
    const i0 = Math.floor((p.x - r) / CELL), i1 = Math.floor((p.x + r) / CELL), j0 = Math.floor((p.z - r) / CELL), j1 = Math.floor((p.z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const list = grid.get(key(i, j)); if (!list) continue;
        for (const o of list) {
            if (o.w && (ig & 1)) continue;
            if (o.t === 0) {
                const nx = clamp(p.x, o.x0, o.x1), nz = clamp(p.z, o.z0, o.z1);
                const dx = p.x - nx, dz = p.z - nz, d = Math.hypot(dx, dz);
                if (d < r) {
                    hit = true;
                    if (d > 1e-4) { p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
                    else {
                        const l = p.x - o.x0, rr = o.x1 - p.x, t = p.z - o.z0, b = o.z1 - p.z, m = Math.min(l, rr, t, b);
                        if (m === l) p.x = o.x0 - r; else if (m === rr) p.x = o.x1 + r; else if (m === t) p.z = o.z0 - r; else p.z = o.z1 + r;
                    }
                }
            } else {
                const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), rr = r + o.r;
                if (d < rr) { hit = true; if (d > 1e-4) { p.x += dx / d * (rr - d); p.z += dz / d * (rr - d); } else p.x += rr; }
            }
        }
    }
    for (const o of dynBlock) {
        if (!o.on) continue;
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), rr = r + o.r;
        if (d < rr) { hit = true; if (d > 1e-4) { p.x += dx / d * (rr - d); p.z += dz / d * (rr - d); } else p.x += rr; }
    }
    return hit;
}
