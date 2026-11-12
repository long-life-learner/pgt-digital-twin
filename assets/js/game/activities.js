/* Aktivitas bersama (pemain & NPC memakai kode yang sama): MEMANCING dan PERKEMAHAN (tenda dibangun beranimasi, api unggun) */
import { THREE, PI, M, bx, cy, grp, glow, clamp, dynBlock, addCircle } from './kit.js';

const rand = (a, b) => a + Math.random() * (b - a);
export const FISH = [
    { n: 'Ikan Mas', ic: '🐟', v: 7, w: 5 }, { n: 'Nila', ic: '🐟', v: 5, w: 6 }, { n: 'Lele', ic: '🐟', v: 4, w: 5 },
    { n: 'Gurame', ic: '🐠', v: 10, w: 2 }, { n: 'Sepatu bekas', ic: '👟', v: 0, w: 1 },
];
const pickFish = () => { let r = Math.random() * FISH.reduce((a, f) => a + f.w, 0); for (const f of FISH) { r -= f.w; if (r <= 0) return f; } return FISH[0]; };

/* =====================================================================
   MEMANCING — mesin status: cast → wait → bite → reel → show → (ulang)
   actor: { x, z, yaw, rig }   spot: { x, z, yaw, tx, tz, y, user }
   env:   { scene, emit(x,y,z,opts), emote(kind,x,y,z), sfx(name), whistle() -> detik }
   ===================================================================== */
export class Fishing {
    constructor(env, actor, spot, { auto = false, whistle = false, max = 99, onCatch = null, onMiss = null } = {}) {
        this.env = env; this.a = actor; this.spot = spot; this.auto = auto; this.whistle = whistle; this.max = max; this.onCatch = onCatch; this.onMiss = onMiss;
        spot.user = actor; this.state = 'cast'; this.t = 0; this.caught = 0; this.done = false; this.wT = 0; this.waitFor = 0; this.fish = null; this.pose = { mode: 'cast', phase: 0 };
        this.bob = new THREE.Vector3(spot.tx, 0.15, spot.tz); this.from = new THREE.Vector3(); this.launched = false; this.reelFrom = new THREE.Vector3();
        // joran di tangan kanan: ruas bambu + ujung
        const rig = actor.rig; this.rod = grp(rig.hand, 0, 0, 0); this.rod.rotation.x = -0.75;
        bx(this.rod, [0.045, 2.0, 0.045], [0, -1.0, 0], 0x8a6a3a, false); bx(this.rod, [0.07, 0.22, 0.07], [0, -0.1, 0], 0x333845, false);
        this.tip = grp(this.rod, 0, -2.0, 0);
        this.bobber = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); { const cap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.07, 0.15), new THREE.MeshBasicMaterial({ color: 0xffffff })); cap.position.set(0, 0.08, 0); this.bobber.add(cap); }
        env.scene.add(this.bobber); this.bobber.visible = false;
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff })); this.line.frustumCulled = false; env.scene.add(this.line); this.line.visible = false;
        this.fishM = grp(env.scene); bx(this.fishM, [0.1, 0.16, 0.34], [0, 0, 0], 0xff9a3c, false); bx(this.fishM, [0.04, 0.2, 0.1], [0, 0, -0.22], 0xffb060, false); this.fishM.visible = false;
        this._v = new THREE.Vector3();
    }
    get label() { return { cast: 'Melempar kail…', wait: this.whistle ? 'Menunggu ikan… (bersiul) [E] berhenti' : 'Menunggu ikan…', bite: 'IKAN MAKAN UMPAN! [E] TARIK!', reel: 'Menarik…', show: 'Dapat!' }[this.state]; }
    press() { if (this.state === 'bite') { this.enter('reel'); return true; } if (this.state === 'wait' || this.state === 'cast') { this.stop(); return true; } return false; }
    enter(s) { this.state = s; this.t = 0; if (s === 'wait') { this.waitFor = rand(this.auto ? 4 : 5, this.auto ? 9 : 10); this.wT = 0.8; } if (s === 'bite') { this.bT = this.auto ? rand(0.5, 1.0) : 1.9; this.env.emote('excl', this.a.x, 2.4, this.a.z); this.env.sfx('bite'); } if (s === 'reel') { this.reelFrom.copy(this.bob); this.fish = pickFish(); } }
    stop() { this.done = true; this.spot.user = null; this.rod.parent && this.rod.parent.remove(this.rod); this.env.scene.remove(this.bobber, this.line, this.fishM); this.line.geometry.dispose(); this.bobber.material.dispose(); }
    /** @returns {{mode:string, phase:number}} */
    update(dt, t) {
        if (this.done) return this.pose;
        const a = this.a, E = this.env, tip = this.tip.getWorldPosition(this._v);
        this.t += dt;
        if (this.state === 'cast') {
            const T0 = 1.1; this.pose = { mode: 'cast', phase: this.t / T0 };
            if (this.t > 0.6 && !this.launched) { this.launched = true; this.from.copy(tip); E.sfx('whoosh'); }
            this.bobber.visible = this.line.visible = this.launched;
            if (this.launched) {
                const u = clamp((this.t - 0.6) / 0.55, 0, 1); this.bob.set(this.from.x + (this.spot.tx - this.from.x) * u, this.from.y + (0.15 - this.from.y) * u + Math.sin(u * PI) * 2.4, this.from.z + (this.spot.tz - this.from.z) * u);
                if (u >= 1 && this.t < 0.6 + 0.55 + dt * 1.5) { for (let i = 0; i < 6; i++) E.emit(this.spot.tx, 0.2, this.spot.tz, { color: 0xcfeeff, size: 0.1, vy: 1.8, g: 6, life: 0.7, spread: 1.2 }); E.sfx('splash'); }
            }
            if (this.t >= T0) { this.bob.set(this.spot.tx, 0.15, this.spot.tz); this.enter('wait'); }
        } else if (this.state === 'wait') {
            this.pose = { mode: 'fish', phase: 0 }; this.bob.set(this.spot.tx, 0.15 + Math.sin(t * 2.2) * 0.025, this.spot.tz);
            this.wT -= dt;
            if (this.wT <= 0) {                                              // siulan karakter saat menunggu ikan
                if (this.whistle) { const d = E.whistle(); this.wT = (d || 2) + rand(1.2, 2.6); E.emote('note', a.x, 2.35, a.z); } else { this.wT = rand(3, 6); if (Math.random() < 0.5) E.emote('note', a.x, 2.35, a.z); }
            }
            if (this.t >= this.waitFor) this.enter('bite');
        } else if (this.state === 'bite') {
            this.pose = { mode: 'fish', phase: 0 }; this.bob.set(this.spot.tx, 0.15 - Math.abs(Math.sin(t * 14)) * 0.1, this.spot.tz);
            if (Math.random() < dt * 14) E.emit(this.spot.tx, 0.2, this.spot.tz, { color: 0xcfeeff, size: 0.08, vy: 1.4, g: 6, life: 0.5, spread: 0.6 });
            if (this.auto && this.t > this.bT) this.enter('reel');
            else if (!this.auto && this.t > this.bT) { E.emote('steam', a.x, 2.2, a.z); this.onMiss && this.onMiss(); this.enter('wait'); }
        } else if (this.state === 'reel') {
            const T0 = 1.5; this.pose = { mode: 'reel', phase: 0 }; const u = clamp(this.t / T0, 0, 1);
            this.bob.set(this.reelFrom.x + (tip.x - this.reelFrom.x) * u * u, 0.15 + Math.sin(u * PI) * 0.6 + (tip.y - 0.15) * u * u, this.reelFrom.z + (tip.z - this.reelFrom.z) * u * u);
            if (Math.random() < dt * 18) E.emit(this.bob.x, 0.2, this.bob.z, { color: 0xcfeeff, size: 0.09, vy: 1.2, g: 6, life: 0.5, spread: 0.5 });
            if (this.t >= T0) { this.caught++; this.enter('show'); E.sfx(this.fish.v ? 'ok' : 'bad'); E.emote(this.fish.v ? 'star' : 'steam', a.x, 2.3, a.z); this.onCatch && this.onCatch(this.fish); }
        } else if (this.state === 'show') {
            this.pose = { mode: 'wave', phase: 0 }; this.bobber.visible = false; this.fishM.visible = true; this.fishM.position.set(tip.x, tip.y - 0.15 + Math.sin(t * 8) * 0.04, tip.z); this.fishM.rotation.y = a.yaw;
            this.line.visible = false;
            if (this.t > 1.6) { this.fishM.visible = false; if (this.caught >= this.max) { this.stop(); return this.pose; } this.launched = false; this.enter('cast'); }
        }
        if (this.line.visible && !this.done) {
            const p = this.line.geometry.attributes.position; p.setXYZ(0, tip.x, tip.y, tip.z); p.setXYZ(1, this.bob.x, this.bob.y, this.bob.z); p.needsUpdate = true;
            this.bobber.position.copy(this.bob);
        }
        return this.pose;
    }
}

/* =====================================================================
   PERKEMAHAN — tenda voxel A-frame yang dibangun bertahap, api unggun
   camp: { id, tent:{x,z}, fire:{x,z}, yaw, state:'empty'|'built', prog:0..1, owner, lit }
   ===================================================================== */
export function initCamps(scene, camps) {
    const CV = M(0x2f86d6), CV2 = M(0xf2b705);
    camps.forEach((c, i) => {
        const g = grp(scene, c.tent.x, 0, c.tent.z); g.rotation.y = c.yaw; const col = [0x2f86d6, 0xe8453c, 0x35a76a][i % 3];
        const cvm = M(col), cvm2 = M(0xe8e0c8);
        const sheet = bx(g, [3.2, 0.03, 3.0], [0, 0.06, 0], 0x8a7a50, false);
        const stakes = [[-1.6, -1.5], [1.6, -1.5], [-1.6, 1.5], [1.6, 1.5]].map(([x, z]) => bx(g, [0.07, 0.34, 0.07], [x, 0.17, z], 0xcfd3dc, false));
        const poles = [-1.45, 1.45].map(z => bx(g, [0.08, 1.75, 0.08], [0, 0.875, z], 0x6a4526, false));
        const ridge = bx(g, [0.08, 0.08, 3.0], [0, 1.74, 0], 0x6a4526, false);
        const cv = grp(g, 0, 1.72, 0);
        const ang = Math.atan2(1.72, 1.5), L = Math.hypot(1.5, 1.72);
        const pl = bx(cv, [L, 0.07, 3.0], [-0.75, -0.86, 0], cvm, true); pl.rotation.z = ang;
        const pr = bx(cv, [L, 0.07, 3.0], [0.75, -0.86, 0], cvm, true); pr.rotation.z = -ang;
        const back = []; for (let k = 0; k < 6; k++) back.push(bx(cv, [3.0 - k * 0.5, 0.28, 0.06], [0, -1.62 + k * 0.28 + 0.14, -1.5], cvm2, false));
        const door = bx(cv, [1.0, 1.25, 0.06], [0, -1.1, 1.52], 0x14161f, false);
        const flagPole = bx(g, [0.05, 1.0, 0.05], [0, 2.2, -1.4], 0xdddddd, false); const flag = bx(g, [0.5, 0.3, 0.04], [0.28, 2.5, -1.4], 0xe8453c, false);
        const bag = bx(g, [0.8, 0.12, 1.5], [-0.5, 0.12, 0.1], 0xe0457b, false);
        const parts = { g, sheet, stakes, poles, ridge, cv, door, flag, flagPole, bag };
        g.visible = false;
        // api unggun
        const fg = grp(scene, c.fire.x, 0, c.fire.z);
        const flames = [0, 1, 2, 3].map(k => { const f = bx(fg, [0.3 - k * 0.04, 0.5, 0.3 - k * 0.04], [(k - 1.5) * 0.12, 0.35, ((k * 7) % 3 - 1) * 0.1], k % 2 ? 0xffb020 : 0xff5a1a, false); f.material = new THREE.MeshBasicMaterial({ color: k % 2 ? 0xffc030 : 0xff6a20 }); return f; });
        const logs = [0, 1].map(k => bx(fg, [0.9, 0.14, 0.16], [0, 0.12, 0], 0x4a2f1a, false)); logs[0].rotation.y = 0.6; logs[1].rotation.y = -0.6;
        fg.visible = true; flames.forEach(f => { f.visible = false; });
        c.parts = parts; c.flames = flames; c.fireG = fg; c.block = { x: c.tent.x, z: c.tent.z, r: 1.7, on: false }; dynBlock.push(c.block); c.burn = 0; c.sleeper = null; c.pack = false;
        c.setProg = (p) => {
            c.prog = clamp(p, 0, 1); g.visible = c.prog > 0.001; const s01 = (a, b) => clamp((c.prog - a) / (b - a), 0, 1);
            sheet.scale.set(s01(0, 0.12), 1, s01(0, 0.12));
            stakes.forEach((s, k) => { const u = s01(0.04 + k * 0.03, 0.14 + k * 0.03); s.scale.set(u, u, u); s.position.y = 0.17 * u; });
            poles.forEach((s, k) => { const u = s01(0.2 + k * 0.1, 0.4 + k * 0.1); s.scale.y = Math.max(0.001, u); s.position.y = 0.875 * u; });
            const r = s01(0.42, 0.5); ridge.scale.z = Math.max(0.001, r); ridge.visible = r > 0;
            const cvS = s01(0.5, 0.88); cv.scale.set(Math.max(0.001, cvS), Math.max(0.001, cvS), 1); cv.visible = cvS > 0.01;
            const fl = s01(0.9, 1); flag.scale.set(fl || 0.001, fl || 0.001, fl || 0.001); flagPole.scale.y = fl || 0.001; bag.visible = fl > 0.5; door.visible = fl > 0.1;
            c.block.on = c.prog > 0.6;
        };
        c.setProg(0);
    });
    const fireL = new THREE.PointLight(0xff9a3c, 0, 18, 1.4); scene.add(fireL);
    return {
        update(dt, t, emit, px, pz, night) {
            let best = null, bd = 1e9;
            camps.forEach((c) => {
                if (c.lit) { c.burn -= dt; if (c.burn <= 0) c.lit = false; }
                c.flames.forEach((f, k) => { f.visible = c.lit; if (c.lit) { const s = 0.7 + Math.sin(t * 9 + k * 2) * 0.3 + Math.random() * 0.1; f.scale.set(s, 0.6 + s * 0.6, s); f.position.y = 0.2 + 0.22 * (0.6 + s * 0.6); } });
                if (c.lit && Math.random() < dt * 5) emit(c.fire.x + (Math.random() - 0.5) * 0.3, 0.9, c.fire.z + (Math.random() - 0.5) * 0.3, { color: Math.random() < 0.4 ? 0xffb030 : 0x9aa0aa, size: 0.1 + Math.random() * 0.06, vy: 1.3, life: 1.3, spread: 0.3 });
                const d = Math.hypot(c.fire.x - px, c.fire.z - pz); if (c.lit && d < bd) { bd = d; best = c; }
                if (c.parts.flag.scale.x > 0.01) c.parts.flag.rotation.y = Math.sin(t * 4 + c.tent.z) * 0.35;
            });
            fireL.intensity = best ? (0.55 + night * 0.7) * 22 * (0.85 + Math.sin(t * 17) * 0.1 + Math.random() * 0.05) : 0;
            if (best) fireL.position.set(best.fire.x, 1.3, best.fire.z);
        },
    };
}
