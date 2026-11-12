/* BGM: Lost Saga "Boot Camp" (dasar, seluruh dunia) & "Water Park" (danau / pantai).
   - Volume maksimum 25% dari aslinya.
   - Pergantian berurutan: lagu lama fade-out sampai 0 & di-pause, BARU lagu baru dimulai & fade-in → tidak pernah menimpa.
   - Zona punya jeda (dwell) agar tidak berganti-ganti saat berjalan di tepi batas. */
const MAX = 0.25, FADE_OUT = 1.3, FADE_IN = 1.8, DWELL = 0.7;
const SRC = { base: 'assets/audio/bootcamp.mp3', water: 'assets/audio/waterpark.mp3' };
const NAME = { base: 'Lost Saga — Boot Camp', water: 'Lost Saga — Water Park' };
const ease = (x) => x * x * (3 - 2 * x);

class Bgm {
    constructor() {
        this.el = {}; this.active = null; this.target = 'base'; this.zoneReq = 'base'; this.zoneT = 0; this.level = 0;
        this.muted = false; this.enabled = true; this.started = false; this.blocked = false; this.resume = { base: 0, water: 0 }; this.onChange = null; this.last = performance.now();
        for (const k in SRC) { const a = new Audio(); a.src = SRC[k]; a.loop = true; a.preload = 'auto'; a.volume = 0; this.el[k] = a; }
        setInterval(() => this.tick(), 40);
        document.addEventListener('visibilitychange', () => { const a = this.active && this.el[this.active]; if (!a) return; if (document.hidden) a.pause(); else if (this.started) this._play(a); });
    }
    get name() { return this.active ? NAME[this.active] : '—'; }
    start() { this.started = true; if (this.active) this._play(this.el[this.active]); }
    setZone(z) { this.zoneReq = z; }
    setMuted(m) { this.muted = m; }
    toggle() { this.enabled = !this.enabled; return this.enabled; }
    _play(a) {
        let p; try { p = a.play(); } catch { p = null; }
        if (p && p.catch) p.catch(() => { this.blocked = true; const go = () => { removeEventListener('pointerdown', go); removeEventListener('keydown', go); this.blocked = false; const c = this.active && this.el[this.active]; if (c) this._play(c); }; addEventListener('pointerdown', go, { once: true }); addEventListener('keydown', go, { once: true }); });
    }
    tick() {
        const now = performance.now(), dt = Math.min(0.2, (now - this.last) / 1000); this.last = now;
        if (!this.started || document.hidden) return;
        if (this.zoneReq !== this.target) { this.zoneT += dt; if (this.zoneT >= DWELL) { this.target = this.zoneReq; this.zoneT = 0; } } else this.zoneT = 0;
        const want = this.enabled && !this.muted ? this.target : null;
        if (this.active === want) { if (want) this.level = Math.min(1, this.level + dt / FADE_IN); }
        else {
            this.level = Math.max(0, this.level - dt / FADE_OUT);
            if (this.level <= 0) {                                   // hening total → baru ganti lagu
                if (this.active) { const a = this.el[this.active]; this.resume[this.active] = a.currentTime; a.pause(); a.volume = 0; }
                this.active = want;
                if (want) { const a = this.el[want]; try { a.currentTime = want === 'water' ? 0 : this.resume[want]; } catch { /* belum siap */ } a.volume = 0; this._play(a); if (this.onChange) this.onChange(NAME[want]); }
            }
        }
        if (this.active) this.el[this.active].volume = Math.min(MAX, MAX * ease(this.level));
    }
}
export const bgm = new Bgm();

/* ---------- siulan (sintesis WebAudio) ---------- */
const TUNES = [
    [[0, 1], [4, 1], [7, 1.5], [4, 0.5], [2, 1], [5, 1], [9, 2]],
    [[7, 0.5], [9, 0.5], [12, 1.5], [9, 1], [7, 1], [4, 2]],
    [[0, 0.5], [2, 0.5], [4, 1], [0, 1], [4, 0.5], [5, 0.5], [7, 2]],
    [[12, 1], [9, 1], [7, 1], [9, 1], [12, 1.5], [14, 0.5], [12, 2]],
];
let wctx = null;
export const whistle = {
    ctx() { try { wctx = wctx || new (window.AudioContext || window.webkitAudioContext)(); if (wctx.state === 'suspended') wctx.resume(); } catch { wctx = null; } return wctx; },
    /** mainkan satu lagu pendek; return durasi (detik). gain 0..1 */
    play(gain = 1, tune = null) {
        const c = this.ctx(); if (!c || gain <= 0.02) return 2.5;
        const T = tune || TUNES[(Math.random() * TUNES.length) | 0], beat = 0.27, base = 880 * Math.pow(2, (Math.floor(Math.random() * 4) - 2) / 12);
        let t = c.currentTime + 0.05; const t0 = t;
        for (const [semi, beats] of T) {
            const d = beats * beat, f = base * Math.pow(2, semi / 12);
            const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
            lfo.frequency.value = 5.6; lg.gain.value = f * 0.012; lfo.connect(lg).connect(o.frequency);
            const v = 0.07 * gain; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.04); g.gain.setValueAtTime(v, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.98);
            o.connect(g).connect(c.destination); o.start(t); lfo.start(t); o.stop(t + d); lfo.stop(t + d);
            t += d;
        }
        return t - t0 + 0.2;
    },
};
