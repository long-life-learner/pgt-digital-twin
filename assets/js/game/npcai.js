/* ===================================================================
   KECERDASAN BUATAN NPC (utility-AI berbasis aturan, tanpa LLM)
   - Nav: grid navigasi + A* (otomatis dari tabrakan dunia) → NPC tidak menembus benda & bisa masuk toko lewat pintu
   - Brain: kebutuhan (lapar, energi, sosial) + jadwal + sifat → memilih aktivitas sendiri:
       kerja · makan/minum · duduk istirahat · ngobrol dengan NPC lain · mancing · camping (bangun tenda, api unggun, tidur)
       jalan-jalan · main HP · elus hewan · pulang tidur · menyapa pemain
   =================================================================== */
import { THREE, PI, clamp, wrapPi, blockedAt, resolve } from './kit.js';
import { Fishing } from './activities.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ease = (u) => u * u * (3 - 2 * u);

/* ------------------------------------------------------------------ NAVIGASI */
export class Nav {
    constructor(half = 126) {
        this.h = half; this.n = half * 2; this.g = new Uint8Array(this.n * this.n);
        for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) this.g[j * this.n + i] = blockedAt(i - half + 0.5, j - half + 0.5, 0.42) ? 1 : 0;
        const N = this.n * this.n; this.gs = new Float32Array(N); this.fs = new Float32Array(N); this.came = new Int32Array(N); this.seen = new Uint32Array(N); this.closed = new Uint32Array(N); this.stamp = 0;
    }
    cell(x, z) { const i = clamp(Math.floor(x + this.h), 0, this.n - 1), j = clamp(Math.floor(z + this.h), 0, this.n - 1); return j * this.n + i; }
    free(x, z) { return this.g[this.cell(x, z)] === 0; }
    snap(x, z) {                                                      // titik bebas terdekat (spiral)
        if (this.free(x, z)) return { x, z };
        for (let r = 1; r < 14; r++) for (let a = 0; a < 16; a++) { const ang = a / 16 * 6.283, px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r; if (this.free(px, pz)) return { x: px, z: pz }; }
        return null;
    }
    los(ax, az, bx, bz) {
        const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.4);
        for (let k = 1; k < n; k++) { const u = k / n; if (!this.free(ax + (bx - ax) * u, az + (bz - az) * u)) return false; }
        return true;
    }
    find(x0, z0, x1, z1) {
        const s0 = this.snap(x0, z0), e0 = this.snap(x1, z1); if (!s0 || !e0) return null;
        const n = this.n, h = this.h, st = ++this.stamp, S = this.cell(s0.x, s0.z), E = this.cell(e0.x, e0.z);
        if (S === E) return [{ x: x1, z: z1 }];
        const ex = E % n, ez = (E / n) | 0, { gs, fs, came, seen, closed, g } = this;
        const heap = []; const less = (a, b) => fs[a] < fs[b];
        const push = (c) => { heap.push(c); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
        const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (; ;) { let l = i * 2 + 1, r = l + 1, m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
        gs[S] = 0; fs[S] = 0; came[S] = -1; seen[S] = st; push(S);
        const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1]; let found = false, it = 0;
        while (heap.length && it++ < 60000) {
            const c = pop(); if (c === E) { found = true; break; } if (closed[c] === st) continue; closed[c] = st;
            const cx = c % n, cz = (c / n) | 0;
            for (let k = 0; k < 8; k++) {
                const nx = cx + DX[k], nz = cz + DZ[k]; if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue; const q = nz * n + nx; if (g[q] || closed[q] === st) continue;
                if (k > 3 && (g[cz * n + nx] || g[nz * n + cx])) continue;                            // jangan memotong sudut
                const ng = gs[c] + (k > 3 ? 1.414 : 1); if (seen[q] !== st || ng < gs[q]) { seen[q] = st; gs[q] = ng; came[q] = c; fs[q] = ng + Math.hypot(nx - ex, nz - ez); push(q); }
            }
        }
        if (!found) return null;
        const cells = []; for (let c = E; c !== -1; c = came[c]) cells.push({ x: (c % n) - h + 0.5, z: ((c / n) | 0) - h + 0.5 }); cells.reverse();
        cells[cells.length - 1] = { x: e0.x, z: e0.z };
        const out = []; let a = { x: s0.x, z: s0.z }, i = 0;                                          // haluskan jalur (string pulling)
        while (i < cells.length) { let j = cells.length - 1; while (j > i && !this.los(a.x, a.z, cells[j].x, cells[j].z)) j--; out.push(cells[j]); a = cells[j]; i = j + 1; }
        return out;
    }
}

/* ------------------------------------------------------------------ DIALOG ANTAR-NPC */
const first = (n) => n.name.replace(/^(Pak|Bu|Mbak|Mang|Kang|Cak) /, '');
const NEWS = { drive: 'naik mobil keliling desa', moto: 'ngebut pakai motor', excavator: 'mengoperasikan ekskavator', fish: 'memancing di dermaga', camp: 'mendirikan tenda di perkemahan', cafe: 'ngopi di kafe', pet: 'mengelus kucing', run: 'berlari ke mana-mana' };
function doing(n) { return { work: 'jaga di tempat kerja', farm: 'merawat ladang', exca: 'mengoperasikan alat berat', eat: 'cari makan', rest: 'istirahat sebentar', chat: 'ngobrol', fish: 'memancing', camp: 'camping', campsit: 'duduk di api unggun', wander: 'jalan-jalan santai', phone: 'main HP', pet: 'main sama hewan', idle: 'santai' }[n.brain.act] || 'santai'; }
function topics(a, b, c) {
    const T = [], h = c.hour(), night = h >= 18.5 || h < 5.5, A = first(a), B = first(b);
    T.push({ w: 1, l: [`Halo ${B}!`, `Eh ${A}. Aku lagi ${doing(b)}. Kamu?`, `Aku lagi ${doing(a)}.`] });
    T.push({ w: 1, l: night ? ['Sudah malam, udaranya dingin juga ya.', 'Iya. Enaknya duduk dekat api unggun.'] : h < 11 ? ['Pagi-pagi udaranya segar ya!', 'Iya, pas buat mulai kerja.'] : ['Cuaca hari ini cerah, ya?', 'Iya, cocok buat jalan-jalan ke danau.'] });
    if (a.brain.needs.hunger < 55) T.push({ w: 2.5, l: ['Perutku keroncongan…', 'Mampir ke Warung Madura saja, buka 24 jam!', 'Boleh, sekalian beli minum.'] });
    T.push({ w: 0.8, l: ['Kamu lihat Abu dan Jemoy tadi?', 'Lihat! Mereka suka tidur di sofa rumah pemain.'] });
    T.push({ w: 0.6, l: ['Ayam, kambing dan sapi di ladang sehat-sehat ya.', 'Mang Ujang rajin merawatnya.'] });
    T.push({ w: 0.6, l: ['Air mancur di taman itu keren, ya.', 'Iya, aku suka duduk di bangku dekat situ.'] });
    if (a.brain.lastCatch) T.push({ w: 2, l: [`Tadi aku dapat ${a.brain.lastCatch.n}!`, 'Wah mantap! Aku juga mau coba di dermaga.'] });
    else T.push({ w: 0.7, l: ['Ada yang mancing di dermaga hari ini?', 'Pasti banyak ikan, airnya jernih.'] });
    if (a.def.fish) T.push({ w: 1.5, l: ['Mancing bareng yuk!', 'Ayo, aku ambil joran.'], inv: 'fish' });
    if (a.def.camp || b.def.camp) T.push({ w: night ? 0.4 : 1.4, l: ['Nanti sore camping di danau, yuk?', 'Boleh! Aku bantu pasang tenda.'], inv: 'camp' });
    if (c.news.act && c.hour() - c.news.h < 6) T.push({ w: 1.6, l: [`Tadi aku lihat si pemain ${NEWS[c.news.act] || 'jalan-jalan'}.`, 'Dia orangnya ramah, ya. Kapan-kapan kita ajak.'] });
    if (a.def.small) T.push({ w: 1.2, l: [pick(a.def.small), 'Setuju banget!'] });
    return T;
}
function dialog(a, b, c) {
    const T = topics(a, b, c); let r = Math.random() * T.reduce((s, t) => s + t.w, 0), t = T[0]; for (const x of T) { r -= x.w; if (r <= 0) { t = x; break; } }
    return { lines: t.l.map((s, i) => [i % 2, s]), inv: t.inv || null };
}

/* ------------------------------------------------------------------ OTAK NPC */
export class Brain {
    constructor(n, c) {
        this.n = n; this.c = c; this.needs = { hunger: rand(45, 90), energy: rand(60, 95), social: rand(25, 80) };
        this.plan = []; this.cur = null; this.act = 'idle'; this.cool = {}; this.hold = null; this.force = null; this.fishing = null; this.seat = null; this.camp = null; this.lastCatch = null; this.rel = {};
        this.greetCd = rand(0, 20); this.greet = 0; this.path = null; this.pi = 0; this.stuck = 0; this.hidden = false; this.age = rand(0, 4);
        n.pose = { mode: 'idle', phase: 0 }; n.y = 0; n.phase = 0; n.sitting = null;
    }
    /* ---------- utilitas ---------- */
    say(text, dur = 3.2) { this.n.say && this.n.say(text, dur); }
    busy() { return !!(this.fishing || this.hidden || this.n.sitting || (this.cur && (this.cur.s === 'converse' || this.cur.s === 'build'))); }
    release() {
        const n = this.n;
        if (this.fishing) { this.fishing.stop(); this.fishing = null; }
        if (n.sitting) { const s = n.sitting; s.occ = null; n.sitting = null; if (s.out) { n.x = s.out.x; n.z = s.out.z; } }
        if (this.hidden) { this.hidden = false; n.vis = true; n.m.root.visible = true; if (this.camp && this.camp.sleeper === n) this.camp.sleeper = null; }
        if (this.exca) { this.exca.npcBusy = null; this.exca = null; n.vis = true; n.m.root.visible = true; }
        if (this.hold) { this.hold = null; }
        this.path = null;
    }
    abort(cool = 0) { if (this.cur && this.cur.s === 'converse' && this.cur.who && this.cur.who.brain.hold && this.cur.who.brain.hold.with === this.n) this.cur.who.brain.hold = null; this.release(); this.plan = []; this.cur = null; if (cool) this.cool[this.act] = this.c.time() + cool; }
    near(x, z, d = 0.95) {                                             // titik berdiri dekat sasaran yang bebas
        for (const [dx, dz] of [[0, d], [0, -d], [d, 0], [-d, 0], [d * 0.7, d * 0.7], [-d * 0.7, d * 0.7], [d * 0.7, -d * 0.7], [-d * 0.7, -d * 0.7]]) if (this.c.nav.free(x + dx, z + dz)) return { x: x + dx, z: z + dz };
        return this.c.nav.snap(x, z) || { x, z };
    }
    seatOut(s) { const f = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) }; for (const [dx, dz] of [[f.x, f.z], [-f.x, -f.z], [f.z, -f.x], [-f.z, f.x]]) { const t = { x: s.x + dx * 1.1, z: s.z + dz * 1.1 }; if (this.c.nav.free(t.x, t.z)) return t; } return this.c.nav.snap(s.x, s.z) || { x: s.x, z: s.z }; }
    freeSeat(from, maxD = 45) {
        let best = null, bd = 1e9;
        for (const s of this.c.seats) { if (s.occ) continue; const d = dist(from, s); if (d < bd && d < maxD) { bd = d; best = s; } }
        return best;
    }
    G(x, z, run = false) { return { s: 'go', x, z, run }; }
    W(d, mode = 'idle', o = {}) { return { s: 'wait', d, mode, ...o }; }

    /* ---------- pemilihan aktivitas (utility AI) ---------- */
    choose() {
        const n = this.n, c = this.c, h = c.hour(), night = h >= 22.5 || h < 5.5, def = n.def, t = c.time(); const sc = [];
        const add = (id, s) => { if (s > 0) sc.push({ id, s: s - ((this.cool[id] || 0) > t ? 0.7 : 0) + rand(0, 0.3) }); };
        const B = def.shop && c.spots.interiors.find(b => b.id === def.shop);
        const onShift = B ? (B.hours24 ? !(h >= 1 && h < 5) : h >= def.shift[0] && h < def.shift[1]) : (def.job ? h >= 7 && h < 17 : false);
        const nd = this.needs;
        if (this.force) { const f = this.force; this.force = null; if (f !== 'chat') return f; }
        if (this.camp && this.camp.state === 'built') {                       // sedang berkemah
            if (h >= 6 && h < 11 || (h >= 11 && h < 16 && Math.random() < 0.5)) return 'pack';
            if (night || h >= 21) return 'sleepTent';
            return 'campsit';
        }
        if (night && !onShift) return 'sleepHome';
        if (onShift) { add(def.job === 'farm' ? 'farm' : def.job === 'exca' ? 'exca' : 'work', 1.35); }
        add('eat', nd.hunger < 55 ? (55 - nd.hunger) / 22 + 0.4 : 0);
        add('rest', nd.energy < 45 ? (45 - nd.energy) / 20 + 0.3 : 0);
        const partner = this.findPartner(B ? 16 : 55); add('chat', partner ? (100 - nd.social) / 55 + 0.25 : 0);
        if (!onShift) { add('wander', 0.65); add('phone', 0.25); }
        else if (B) { add('wander', 0.12); }
        if (def.fish && h >= 6 && h < 19 && c.spots.fish.some(f => !f.user)) add('fish', def.fish * 1.1);
        if (def.camp && h >= 13 && h < 20.5 && c.camps.some(k => !k.owner)) add('camp', def.camp * 1.3);
        if (c.pets.some(a => !a.bird && dist(a, n) < 28)) add('pet', 0.32);
        if (!sc.length) return 'wander';
        sc.sort((a, b) => b.s - a.s); return sc[0].id;
    }
    findPartner(maxD) {
        let best = null, bd = 1e9;
        for (const o of this.c.npcs) { if (o === this.n || !o.vis || o.brain.hold || o.brain.hidden || (o.talking)) continue; const ob = o.brain; if (ob.cur && (ob.cur.s === 'converse' || ob.cur.s === 'build') || ob.fishing && ob.fishing.state !== 'wait') continue; const d = dist(o, this.n); if (d < maxD && d < bd) { bd = d; best = o; } }
        return best;
    }

    /* ---------- menyusun rencana dari aktivitas ---------- */
    make(id) {
        const n = this.n, c = this.c, def = n.def, S = c.spots, P = [], h = c.hour(); this.act = id;
        const B = def.shop && S.interiors.find(b => b.id === def.shop);
        switch (id) {
            case 'work': { if (!B) return this.make('wander'); const s = B.seller, md = def.modes || ['idle', 'phone']; P.push(this.G(s.x, s.z), this.W(rand(14, 28), md[0], { yaw: s.yaw }), this.W(rand(5, 9), md[1], { yaw: s.yaw }), this.W(rand(8, 14), md[0], { yaw: s.yaw })); break; }
            case 'farm': { const r = S.farmRect; for (let k = 0; k < 2; k++) { const x = r.x0 + 3 + Math.random() * (r.x1 - r.x0 - 6), z = r.z0 + 3 + Math.random() * (r.z1 - r.z0 - 6); P.push(this.G(x, z), this.W(rand(9, 15), 'pet', { emote: 'steam' })); } const cow = c.pets.find(a => a.kind === 'cow'); if (cow && Math.random() < 0.5) { const q = this.near(cow.x, cow.z, 1.4); P.push(this.G(q.x, q.z), { s: 'pet', a: cow }); } break; }
            case 'exca': { const ex = c.exca; P.push(this.G(ex.x - 3.2, ex.z + 0.5), { s: 'excavate', n: 3 }); break; }
            case 'eat': {
                const shops = S.interiors.filter(b => b.serve && b.id !== 'balai' && b.id !== 'bengkel'); let best = null, bd = 1e9; for (const b of shops) { const d = dist(b.serve, n) + (b === B ? -30 : 0); if (d < bd) { bd = d; best = b; } }
                if (!best) return this.make('wander');
                if (best === B) { P.push(this.G(B.seller.x, B.seller.z), this.W(6, 'eat', { yaw: B.seller.yaw }), this.W(2.5, 'drink', { yaw: B.seller.yaw }), { s: 'fn', f: () => { nd(this, 'hunger', 65); } }); break; }
                P.push(this.G(best.serve.x, best.serve.z), this.W(2.6, 'idle', { face: best.seller, emote: 'coin' }));
                const seat = this.freeSeat(best.serve, 40);
                if (seat) { seat.occ = n; const o = this.seatOut(seat); seat.out = o; P.push(this.G(o.x, o.z), { s: 'sit', seat }, this.W(6.5, 'eat', { sit: true }), this.W(3, 'drink', { sit: true }), { s: 'stand' }); }
                else P.push(this.W(6.5, 'eat'), this.W(3, 'drink'));
                P.push({ s: 'fn', f: () => nd(this, 'hunger', 65) }); break;
            }
            case 'rest': { const seat = this.freeSeat(n, 40); if (!seat) return this.make('phone'); seat.occ = n; const o = this.seatOut(seat); seat.out = o; P.push(this.G(o.x, o.z), { s: 'sit', seat }, this.W(rand(14, 26), 'sit', { sit: true, chat: true }), { s: 'fn', f: () => nd(this, 'energy', 40) }, { s: 'stand' }); break; }
            case 'chat': { const p = this.findPartner(B ? 16 : 55); if (!p) return this.make('wander'); P.push({ s: 'converse', who: p }); break; }
            case 'wander': {
                if (B) { const d = B.door; P.push(this.G(d.x, d.z), this.W(rand(6, 12), pick(['idle', 'phone', 'talk']), { yaw: B.rot }), this.G(B.seller.x, B.seller.z)); break; }
                const pts = S.stroll.filter(p => dist(p, n) > 6), p = pick(pts.length ? pts : S.stroll); P.push(this.G(p.x + rand(-1.5, 1.5), p.z + rand(-1.5, 1.5)), this.W(rand(4, 10), pick(['idle', 'idle', 'phone']))); if (Math.random() < 0.4) { const q = pick(S.stroll); P.push(this.G(q.x, q.z), this.W(rand(3, 7), 'idle')); } break;
            }
            case 'phone': P.push(this.W(rand(6, 12), 'phone')); break;
            case 'fish': {
                const free = S.fish.filter(f => !f.user); if (!free.length) return this.make('wander');
                free.sort((a, b) => dist(a, n) - dist(b, n) + (Math.random() - 0.5) * 30); const f = free[0]; f.user = n;
                P.push(this.G(f.x, f.z), { s: 'fish', spot: f, max: 2 + ((Math.random() * 3) | 0) }); break;
            }
            case 'camp': {
                const k = c.camps.find(q => !q.owner && q.state === 'empty'); if (!k) return this.make('wander'); k.owner = n; this.camp = k;
                const fr = { x: k.tent.x + 2.6, z: k.tent.z + 0.4 }; P.push(this.G(fr.x, fr.z), { s: 'build', camp: k, dir: 1 }, this.G(k.fire.x, k.fire.z + 1.1), { s: 'light', camp: k }); const sit = k.seats[(Math.random() * k.seats.length) | 0]; sit.occ = n; const o = this.seatOut(sit); sit.out = o; P.push(this.G(o.x, o.z), { s: 'sit', seat: sit }, this.W(rand(14, 24), 'sitfire', { sit: true, chat: true }), { s: 'stand' }); break;
            }
            case 'campsit': { const k = this.camp; const sit = k.seats.find(q => !q.occ) || k.seats[0]; if (sit.occ && sit.occ !== n) return this.make('phone'); sit.occ = n; const o = this.seatOut(sit); sit.out = o; P.push(this.G(k.fire.x, k.fire.z + 1.1), { s: 'light', camp: k }, this.G(o.x, o.z), { s: 'sit', seat: sit }, this.W(rand(14, 24), 'sitfire', { sit: true, chat: true }), { s: 'stand' }); break; }
            case 'sleepTent': { const k = this.camp; P.push(this.G(k.tent.x + 2.4, k.tent.z + 0.2), { s: 'hide', camp: k }, { s: 'sleepUntil', h: 6 }, { s: 'show' }); break; }
            case 'pack': { const k = this.camp; P.push(this.G(k.tent.x + 2.6, k.tent.z + 0.4), { s: 'build', camp: k, dir: -1 }, { s: 'fn', f: () => { k.owner = null; this.camp = null; k.lit = false; } }); break; }
            case 'pet': { const a = c.pets.filter(q => !q.bird && dist(q, n) < 28).sort((p, q) => dist(p, n) - dist(q, n))[0]; if (!a) return this.make('wander'); const q = this.near(a.x, a.z, 1.0); P.push(this.G(q.x, q.z), { s: 'pet', a }); break; }
            case 'sleepHome': { const hm = S.homes[def.id] || (B && { x: B.door.x, z: B.door.z }); if (!hm) { P.push(this.W(20, 'idle')); break; } P.push(this.G(hm.x, hm.z), { s: 'hide' }, { s: 'sleepUntil', h: 5.5 }, { s: 'show' }); break; }
            default: P.push(this.W(5, 'idle'));
        }
        return P;
    }

    /* ---------- eksekusi langkah ---------- */
    stepFace(st, dt) {
        const n = this.n; let ty = null;
        if (st.face) ty = Math.atan2(st.face.x - n.x, st.face.z - n.z); else if (st.yaw !== undefined) ty = st.yaw;
        if (ty !== null) n.yaw += wrapPi(ty - n.yaw) * (1 - Math.exp(-8 * dt));
    }
    run(dt, t) {
        const n = this.n, c = this.c, st = this.cur; let done = false, mode = 'idle';
        switch (st.s) {
            case 'go': {
                if (!st.init) { st.init = true; this.path = c.nav.find(n.x, n.z, st.x, st.z); this.pi = 0; this.stuck = 0; st.tries = 0; if (!this.path) return 'fail'; }
                const wp = this.path[this.pi]; if (!wp) { done = true; break; }
                const dx = wp.x - n.x, dz = wp.z - n.z, d = Math.hypot(dx, dz), sp = st.run ? 2.6 : 1.4;
                if (d < 0.3) { this.pi++; if (this.pi >= this.path.length) done = true; break; }
                n.yaw += wrapPi(Math.atan2(dx, dz) - n.yaw) * (1 - Math.exp(-10 * dt));
                const p = { x: n.x + dx / d * sp * dt, z: n.z + dz / d * sp * dt }; resolve(p, 0.36); const mv = Math.hypot(p.x - n.x, p.z - n.z); n.x = p.x; n.z = p.z;
                this.stuck = mv < sp * dt * 0.25 ? this.stuck + dt : Math.max(0, this.stuck - dt);
                if (this.stuck > 1.4) { this.stuck = 0; if (++st.tries > 2) return 'fail'; this.path = c.nav.find(n.x, n.z, st.x, st.z); this.pi = 0; if (!this.path) return 'fail'; }
                n.phase += mv * 5.2; mode = st.run ? 'run' : 'walk'; n.pose.mode = mode; n.pose.phase = n.phase; return null;
            }
            case 'wait': {
                if (!st.init) { st.init = true; st.t = 0; if (st.emote) c.emote(st.emote, n.x, 2.3, n.z); if (st.chat && Math.random() < 0.5) st.chatAt = rand(3, 8); }
                st.t += dt; this.stepFace(st, dt); mode = st.mode;
                if (st.emote && Math.random() < dt * 0.4) c.emote(st.emote, n.x, 2.3, n.z);
                if (st.mode === 'drink' || st.mode === 'eat') { if (Math.random() < dt * 0.6) c.emote(st.mode === 'eat' ? 'steam' : 'soap', n.x, 2.1, n.z); }
                if (st.chatAt && st.t > st.chatAt) { st.chatAt = 0; const p = this.findPartner(10); if (p && p.brain.cur && !p.brain.cur.sit) { /* ikut ngobrol ringan */ this.say(pick(['Hmm…', 'Enak ya di sini.', 'Santai banget.', 'Mau ngobrol?']), 2.6); } }
                if (st.t >= st.d) done = true; break;
            }
            case 'sit': {
                const s = st.seat; if (!st.init) { st.init = true; st.t = 0; n.sitting = s; s.occ = n; st.from = { x: n.x, z: n.z }; }
                st.t += dt; const u = ease(clamp(st.t / 0.45, 0, 1)); n.x = st.from.x + (s.x - st.from.x) * u; n.z = st.from.z + (s.z - st.from.z) * u; n.yaw += wrapPi(s.yaw - n.yaw) * (1 - Math.exp(-12 * dt));
                mode = 'sit'; if (u >= 1) done = true; break;
            }
            case 'stand': { const s = n.sitting; if (s) { s.occ = null; n.sitting = null; if (s.out) { n.x = s.out.x; n.z = s.out.z; } } done = true; break; }
            case 'fn': st.f(); done = true; break;
            case 'pet': {
                if (!st.init) { st.init = true; st.t = 0; } st.t += dt; n.yaw += wrapPi(Math.atan2(st.a.x - n.x, st.a.z - n.z) - n.yaw) * (1 - Math.exp(-8 * dt)); mode = 'pet';
                if (st.t > 0.8 && !st.did) { st.did = true; c.petAnimal(st.a); c.emote('heart', st.a.x, 1.2, st.a.z); } if (st.t > 3.2) { this.cool.pet = c.time() + 30; done = true; } break;
            }
            case 'fish': {
                if (!st.init) {
                    st.init = true; const f = st.spot; f.user = n; n.x = f.x; n.z = f.z; n.yaw = f.yaw; n.y = f.y || 0;
                    this.fishing = new Fishing(c.fishEnv, { x: n.x, z: n.z, yaw: n.yaw, rig: n.m, get y() { return n.y; } }, f, { auto: true, max: st.max, onCatch: (fish) => { this.lastCatch = fish; c.onNpcCatch && c.onNpcCatch(n, fish); nd(this, 'energy', -3); } });
                }
                const hh = c.hour(); if (hh >= 20 || hh < 5) this.fishing.stop();
                const ps = this.fishing.update(dt, t); if (this.fishing.done) { this.fishing = null; this.cool.fish = c.time() + 60; done = true; break; } n.pose.mode = ps.mode; n.pose.phase = ps.phase; return null;
            }
            case 'build': {
                const k = st.camp; if (!st.init) { st.init = true; st.t = 0; k.state = 'building'; st.from = k.prog; n.yaw = Math.atan2(k.tent.x - n.x, k.tent.z - n.z); }
                st.t += dt; const T = st.dir > 0 ? 7 : 4.5, u = clamp(st.t / T, 0, 1); k.setProg(st.dir > 0 ? u : 1 - u); mode = 'hammer';
                if (Math.random() < dt * 6) c.emit(k.tent.x + (Math.random() - 0.5) * 2.4, 0.2, k.tent.z + (Math.random() - 0.5) * 2.4, { color: 0xcdb98a, size: 0.12, vy: 1.2, g: 4, life: 0.6, spread: 0.8 });
                if (u >= 1) { k.state = st.dir > 0 ? 'built' : 'empty'; if (st.dir > 0) c.emote('star', k.tent.x, 2.6, k.tent.z); done = true; } break;
            }
            case 'light': { const k = st.camp; if (!st.init) { st.init = true; st.t = 0; } st.t += dt; mode = 'pet'; n.yaw = Math.atan2(k.fire.x - n.x, k.fire.z - n.z); if (st.t > 1.8) { if (!k.lit) { k.lit = true; k.burn = 260; c.sfx('ok'); } else k.burn = Math.max(k.burn, 200); done = true; } break; }
            case 'hide': { const k = st.camp; this.hidden = true; n.vis = false; n.m.root.visible = false; n.tag.visible = false; if (k) k.sleeper = n; done = true; break; }
            case 'show': { this.hidden = false; n.vis = true; n.m.root.visible = true; if (this.camp && this.camp.sleeper === n) this.camp.sleeper = null; if (this.camp) { n.x = this.camp.tent.x + 2.7; n.z = this.camp.tent.z + 0.4; } else { const hm = c.spots.homes[n.def.id]; if (hm) { n.x = hm.x; n.z = hm.z; } } done = true; break; }
            case 'sleepUntil': { const hh = c.hour(); if (!st.init) { st.init = true; st.t = 0; } st.t += dt; if (st.t > 8 && hh >= st.h && hh < st.h + 6) { nd(this, 'energy', 100); this.needs.hunger = Math.max(this.needs.hunger, 45); done = true; } mode = 'sleep'; break; }
            case 'excavate': {
                const ex = c.exca; if (!st.init) { st.init = true; st.t = 0; if (ex.occ || ex.npcBusy) return 'fail'; ex.npcBusy = n; this.exca = ex; n.vis = false; n.m.root.visible = false; n.tag.visible = false; st.n = st.n || 3; }
                if (ex.occ) { return 'fail'; }
                if (!ex.digging) { if (st.n > 0) { st.n--; ex.digging = true; ex.dig = 0; } else { ex.npcBusy = null; this.exca = null; n.vis = true; n.m.root.visible = true; n.x = ex.x - 3.4; n.z = ex.z + 0.5; this.cool.exca = c.time() + 40; done = true; } }
                break;
            }
            case 'converse': {
                const p = st.who;
                if (!st.init) {
                    st.init = true; if (!p.vis || p.brain.hold || p.talking) return 'fail'; const d = dialog(n, p, c); st.lines = d.lines; st.inv = d.inv; st.i = 0; st.t = 2.4; st.phase = 'gather';
                    p.brain.hold = { with: n, t: 0 }; p.brain.holdMode = 'idle';
                    const q = this.near(p.x, p.z, 1.5); this.path = c.nav.find(n.x, n.z, q.x, q.z); this.pi = 0; if (!this.path) { p.brain.hold = null; return 'fail'; }
                }
                if (!p.brain.hold || p.brain.hold.with !== n) return 'fail';
                if (st.phase === 'gather') {
                    const wp = this.path[this.pi]; if (!wp || dist(n, p) < 1.9) { st.phase = 'talk'; st.t = 0.2; }
                    else { const dx = wp.x - n.x, dz = wp.z - n.z, d = Math.hypot(dx, dz); if (d < 0.3) this.pi++; else { n.yaw += wrapPi(Math.atan2(dx, dz) - n.yaw) * (1 - Math.exp(-10 * dt)); const q = { x: n.x + dx / d * 1.6 * dt, z: n.z + dz / d * 1.6 * dt }; resolve(q, 0.36); n.phase += Math.hypot(q.x - n.x, q.z - n.z) * 5.2; n.x = q.x; n.z = q.z; n.pose.mode = 'walk'; n.pose.phase = n.phase; } p.brain.hold.t += dt; if (p.brain.hold.t > 25) return 'fail'; return null; }
                }
                n.yaw += wrapPi(Math.atan2(p.x - n.x, p.z - n.z) - n.yaw) * (1 - Math.exp(-8 * dt));
                st.t -= dt;
                if (st.t <= 0) {
                    if (st.i >= st.lines.length) { done = true; break; }
                    const [who, text] = st.lines[st.i++]; const sp = who === 0 ? n : p; sp.brain.say(text, 3); st.spk = sp; st.t = 1.6 + text.length * 0.045;
                    p.brain.holdMode = sp === p ? 'talk' : 'idle'; st.my = sp === n ? 'talk' : 'idle';
                }
                mode = st.my || 'idle'; break;
            }
            default: done = true;
        }
        if (done) { if (st.s === 'converse') this.endConverse(st); n.pose.mode = mode === 'walk' ? 'idle' : n.pose.mode; return 'done'; }
        n.pose.mode = n.sitting && (mode === 'idle') ? 'sit' : (n.sitting && st.sit && mode === 'eat' ? 'eat' : mode); n.pose.phase = n.phase;
        if (n.sitting && (mode === 'eat' || mode === 'drink')) n.pose.mode = mode === 'eat' ? 'eat' : 'drink';
        return null;
    }
    endConverse(st) {
        const n = this.n, p = st.who; p.brain.hold = null; nd(this, 'social', 40); nd(p.brain, 'social', 40); this.rel[p.id] = (this.rel[p.id] || 0) + 1; p.brain.rel[n.id] = (p.brain.rel[n.id] || 0) + 1; this.cool.chat = this.c.time() + 25; p.brain.cool.chat = this.c.time() + 25;
        this.c.emote('heart', n.x, 2.4, n.z); this.c.emote('heart', p.x, 2.4, p.z);
        if (st.inv && Math.random() < 0.8) { this.force = st.inv; p.brain.force = st.inv; if (p.brain.cur) { p.brain.abortSoft = true; } }
    }

    /* ---------- loop utama ---------- */
    update(dt, t) {
        const n = this.n, c = this.c; this.age += dt;
        for (const k in this.needs) this.needs[k] = clamp(this.needs[k] + (k === 'hunger' ? -0.55 : k === 'energy' ? (n.sitting ? 1.2 : -0.3) : -0.4) * dt * (c.hour() >= 22.5 || c.hour() < 5.5 ? 0.3 : 1) * (k === 'social' ? 0.7 : 1), 0, 100);
        const P = c.P, dP = dist(n, P);
        if (n.talking) { n.yaw += wrapPi(Math.atan2(P.x - n.x, P.z - n.z) - n.yaw) * (1 - Math.exp(-8 * dt)); n.pose.mode = n.sitting ? 'sit' : 'talk'; this.place(); return; }
        if (this.hold) {                                                    // sedang diajak ngobrol NPC lain
            const o = this.hold.with; n.yaw += wrapPi(Math.atan2(o.x - n.x, o.z - n.z) - n.yaw) * (1 - Math.exp(-8 * dt)); n.pose.mode = n.sitting ? 'sit' : (this.holdMode || 'idle'); this.place(); return;
        }
        if (this.abortSoft && this.cur) { this.abortSoft = false; if (!this.busyNow()) this.abort(); }
        /* menyapa pemain */
        this.greetCd -= dt;
        if (this.greet > 0) { this.greet -= dt; n.yaw += wrapPi(Math.atan2(P.x - n.x, P.z - n.z) - n.yaw) * (1 - Math.exp(-8 * dt)); n.pose.mode = n.sitting ? 'sit' : 'wave'; this.place(); if (this.greet > 0) return; }
        else if (this.greetCd <= 0 && dP < 5 && n.vis && !this.hidden && !this.fishing && !(this.cur && (this.cur.s === 'converse' || this.cur.s === 'build' || this.cur.s === 'excavate'))) { this.greetCd = rand(60, 100); this.greet = 2.4; this.say(c.greetLine(n)); c.emote('note', n.x, 2.4, n.z); return; }
        /* rencana */
        if (!this.cur) {
            if (!this.plan.length) { const id = this.choose(); const p = this.make(id); if (p) this.plan = p; if (!this.plan.length) this.plan = [this.W(2, 'idle')]; }
            this.cur = this.plan.shift();
        }
        const r = this.run(dt, t);
        if (r === 'done') { this.cur = null; this.path = null; }
        else if (r === 'fail') { const a = this.act; this.abort(25); this.act = a; this.cool[a] = c.time() + 25; this.cur = null; if (this.camp && this.camp.state === 'empty') { this.camp.owner = null; this.camp = null; } }
        this.place();
    }
    busyNow() { return !!(this.fishing && this.fishing.state !== 'wait'); }
    place() {
        const n = this.n, c = this.c; let y = 0;
        if (n.sitting) y = n.sitting.y - 0.42; else if (this.fishing) y = n.y; else y = c.groundY(n.x, n.z);
        n.y = y; n.m.root.position.set(n.x, y, n.z); n.m.root.rotation.y = n.yaw;
    }
}
function nd(b, k, v) { b.needs[k] = clamp(b.needs[k] + v, 0, 100); }
