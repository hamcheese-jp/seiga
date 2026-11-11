// サウンド: WebAudioによる効果音シンセ+自動生成BGM(音声ファイル不要で軽量)
import { mulberry, clamp } from './util.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [0, 3, 5, 7, 10];
const SONGS = {
  title:   { bpm: 88,  root: 50, prog: [0, 0, 8, 10, 0, 0, 5, 7], calm: true, seed: 7 },
  plains:  { bpm: 150, root: 45, prog: [0, 0, 8, 10, 0, 0, 8, 7], seed: 21 },
  desert:  { bpm: 144, root: 47, prog: [0, 10, 8, 10, 0, 10, 5, 7], seed: 33 },
  snow:    { bpm: 138, root: 43, prog: [0, 8, 3, 10, 0, 8, 5, 7], seed: 45 },
  volcano: { bpm: 160, root: 44, prog: [0, 0, 10, 8, 0, 0, 3, 7], seed: 57 },
  castle:  { bpm: 166, root: 42, prog: [0, 8, 10, 0, 5, 8, 10, 7], seed: 69 },
  boss:    { bpm: 172, root: 41, prog: [0, 10, 8, 7, 0, 10, 8, 7], seed: 81 },
  result:  { bpm: 104, root: 48, prog: [8, 10, 0, 0, 8, 10, 0, 0], calm: true, seed: 93 },
};

// 場面 → 曲ファイル(bgm/*.mp3)
const BGM_FILES = { title: 'title', plains: 'battle', desert: 'battle3', snow: 'battle4', volcano: 'battle2', castle: 'castle', boss: 'boss', rage: 'rage', result: 'result' };

export const Audio = {
  ctx: null, vol: { bgm: 0.6, sfx: 0.8 }, intensity: 0.4,
  _song: null, _songName: '', _step: 0, _next: 0, _timer: 0, _last: {},

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createDynamicsCompressor();
    this.master.threshold.value = -14; this.master.ratio.value = 6; this.master.attack.value = 0.003; this.master.release.value = 0.2;
    this.out = c.createGain(); this.out.gain.value = 0.9;
    this.master.connect(this.out).connect(c.destination);
    this.sfxG = c.createGain(); this.bgmG = c.createGain();
    this.sfxG.connect(this.master); this.bgmG.connect(this.master);
    // 残響(簡易ディレイ)
    this.dly = c.createDelay(0.6); this.dly.delayTime.value = 0.27;
    const fb = c.createGain(); fb.gain.value = 0.3;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    this.dly.connect(lp).connect(fb).connect(this.dly); lp.connect(this.bgmG);
    // ノイズバッファ
    const len = c.sampleRate * 1.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nbuf = buf;
    this.setVol();
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) this.ctx.suspend(); else this.ctx.resume(); });
  },
  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVol(bgm, sfx) {
    if (bgm !== undefined) this.vol.bgm = bgm; if (sfx !== undefined) this.vol.sfx = sfx;
    if (!this.ctx) return;
    this.sfxG.gain.value = this.vol.sfx * 0.9; this.bgmG.gain.value = this.vol.bgm * 0.5;
  },

  // ---- 基本発音 ----
  _tone(type, f0, f1, dur, v, dest, t, atk = 0.004) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + atk + dur + 0.03);
  },
  _noise(dur, v, ftype, f0, f1, q, dest, t, atk = 0.003) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nbuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = ftype; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dur);
    s.connect(f).connect(g).connect(dest); s.start(t, Math.random() * 0.4, dur + atk + 0.05);
  },

  // ---- 効果音 ----
  sfx(name, p = 1) {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const now = c.currentTime, last = this._last[name] || 0;
    if (now - last < 0.035) return;
    this._last[name] = now;
    const d = this.sfxG, t = now, r = 0.92 + Math.random() * 0.16;
    switch (name) {
      case 'swing': this._noise(0.13, 0.22 * p, 'bandpass', 700 * r, 2600 * r, 1.2, d, t, 0.02); break;
      case 'swingH': this._noise(0.22, 0.3, 'bandpass', 300 * r, 1500 * r, 1.0, d, t, 0.04); break;
      case 'hit': this._noise(0.07, 0.42 * p, 'lowpass', 2600 * r, 500, 0.7, d, t); this._tone('sine', 170 * r, 60, 0.09, 0.4 * p, d, t); this._noise(0.05, 0.16 * p, 'highpass', 4200, 6000, 0.7, d, t); break;
      case 'hitH': this._noise(0.16, 0.6, 'lowpass', 2200 * r, 240, 0.7, d, t); this._tone('sine', 120 * r, 38, 0.22, 0.7, d, t); this._tone('square', 90, 40, 0.1, 0.12, d, t); break;
      case 'ko': this._tone('sine', 240 * r, 70, 0.14, 0.3, d, t); this._noise(0.1, 0.25, 'bandpass', 1400, 500, 1, d, t); break;
      case 'explode': this._noise(0.6, 0.75, 'lowpass', 1400, 70, 0.6, d, t); this._tone('sine', 95, 28, 0.5, 0.8, d, t); break;
      case 'quake': this._noise(0.5, 0.6, 'lowpass', 500, 50, 0.8, d, t); this._tone('sine', 70, 26, 0.45, 0.85, d, t); break;
      case 'fire': this._noise(0.5, 0.45, 'bandpass', 500, 2400, 0.6, d, t, 0.05); this._noise(0.35, 0.3, 'lowpass', 900, 200, 0.6, d, t + 0.05); break;
      case 'ice': this._noise(0.25, 0.3, 'highpass', 3500, 7000, 2, d, t); this._tone('sine', 2300 * r, 3300, 0.2, 0.14, d, t); this._tone('sine', 3100 * r, 1900, 0.25, 0.1, d, t + 0.04); break;
      case 'thunder': this._noise(0.08, 0.6, 'highpass', 2500, 800, 0.8, d, t); this._noise(0.55, 0.5, 'lowpass', 1800, 90, 0.6, d, t + 0.02); this._tone('sawtooth', 160, 40, 0.3, 0.2, d, t); break;
      case 'wind': this._noise(0.5, 0.36, 'bandpass', 400, 1800 * r, 0.9, d, t, 0.12); break;
      case 'dark': this._tone('sawtooth', 110, 45, 0.5, 0.25, d, t, 0.03); this._noise(0.45, 0.25, 'bandpass', 300, 900, 2, d, t, 0.05); break;
      case 'special': this._tone('sawtooth', 180, 900, 0.5, 0.2, d, t, 0.02); this._tone('sine', 360, 1800, 0.5, 0.22, d, t, 0.02); this._noise(0.6, 0.3, 'bandpass', 600, 5000, 1.2, d, t, 0.2); break;
      case 'awaken': this._tone('sawtooth', 80, 320, 0.7, 0.3, d, t, 0.05); this._tone('sine', 220, 1320, 0.8, 0.25, d, t, 0.05); this._noise(0.9, 0.35, 'lowpass', 300, 4000, 0.8, d, t, 0.3); break;
      case 'tele': this._tone('sine', 1760, 2200, 0.22, 0.2, d, t); this._tone('sine', 2640, 3300, 0.18, 0.1, d, t); break;
      case 'dodge': this._noise(0.18, 0.25, 'bandpass', 1200, 400, 0.8, d, t, 0.02); break;
      case 'perfect': this._tone('sine', 1320, 1320, 0.5, 0.25, d, t); this._tone('sine', 1980, 1980, 0.6, 0.18, d, t + 0.05); this._tone('sine', 2640, 2640, 0.7, 0.12, d, t + 0.1); break;
      case 'hurt': this._noise(0.12, 0.5, 'lowpass', 1500, 300, 0.7, d, t); this._tone('square', 150 * r, 70, 0.14, 0.2, d, t); break;
      case 'pickup': this._tone('sine', 880, 880, 0.1, 0.2, d, t); this._tone('sine', 1320, 1320, 0.16, 0.2, d, t + 0.07); break;
      case 'treasure': [660, 880, 1100, 1320].forEach((f, i) => this._tone('triangle', f, f, 0.2, 0.2, d, t + i * 0.06)); break;
      case 'ready': this._tone('sine', 1047, 1047, 0.1, 0.2, d, t); this._tone('sine', 1568, 1568, 0.2, 0.2, d, t + 0.08); break;
      case 'ready2': this._tone('sine', 784, 784, 0.1, 0.2, d, t); this._tone('sine', 1175, 1175, 0.2, 0.2, d, t + 0.08); break;
      case 'ui': this._tone('triangle', 660, 660, 0.06, 0.18, d, t); break;
      case 'ok': this._tone('triangle', 660, 660, 0.07, 0.2, d, t); this._tone('triangle', 990, 990, 0.12, 0.2, d, t + 0.06); break;
      case 'back': this._tone('triangle', 520, 390, 0.1, 0.18, d, t); break;
      case 'deny': this._tone('square', 160, 150, 0.12, 0.12, d, t); break;
      case 'warn': this._tone('square', 740, 740, 0.12, 0.12, d, t); this._tone('square', 560, 560, 0.16, 0.12, d, t + 0.16); break;
      case 'capture': [0, 4, 7, 12].forEach((s, i) => { const f = mtof(64 + s); this._tone('triangle', f, f, 0.3, 0.22, d, t + i * 0.09); this._tone('sine', f * 2, f * 2, 0.3, 0.08, d, t + i * 0.09); }); break;
      case 'levelup': [0, 4, 7, 12, 16].forEach((s, i) => { const f = mtof(67 + s); this._tone('triangle', f, f, 0.26, 0.2, d, t + i * 0.07); }); break;
      case 'win': [[0, 0], [4, 0.14], [7, 0.28], [12, 0.42], [16, 0.7], [19, 0.7], [24, 0.7]].forEach(([s, o]) => { const f = mtof(60 + s); this._tone('triangle', f, f, 0.55, 0.2, d, t + o); this._tone('sawtooth', f, f, 0.5, 0.05, d, t + o); }); break;
      case 'lose': [[7, 0], [3, 0.3], [0, 0.6], [-5, 0.95]].forEach(([s, o]) => { const f = mtof(55 + s); this._tone('triangle', f, f, 0.6, 0.22, d, t + o, 0.03); }); break;
      case 'drum': this._tone('sine', 110, 48, 0.35, 0.8, d, t); this._noise(0.1, 0.3, 'lowpass', 600, 150, 0.7, d, t); break;
      case 'step': this._noise(0.04, 0.05, 'lowpass', 700, 300, 0.7, d, t); break;
    }
  },

  // ---- BGM ----
  bgm(name) {
    if (this._songName === name) return;
    this._songName = name;
    // 曲ファイルがある場面はそれを再生(音楽:魔王魂 / CC BY 4.0)
    if (BGM_FILES[name]) { this._song = null; this._playFile(BGM_FILES[name]); return; }
    this._fadeFile();
    const def = SONGS[name];
    if (!def) { this._song = null; return; }
    // メロディ自動生成(8小節 = 128ステップ)
    const r = mulberry(def.seed);
    const scale = []; for (let o = 0; o < 3; o++) for (const s of PENTA) scale.push(o * 12 + s);
    const rhythms = def.calm
      ? ['x.......x...x...', 'x...x.......x.x.', 'x.....x.x.......', 'x...x...x...x...']
      : ['x..x..x.x..x.x..', 'x.x.x..xx.x...x.', 'x...x.x.x..x..x.', 'xx.x..x.x...x.x.', 'x..x.xx.x.x.x...'];
    const mk = (base) => {
      const out = new Array(32).fill(-1); let idx = base;
      for (let b = 0; b < 2; b++) {
        const rh = rhythms[(r() * rhythms.length) | 0];
        for (let s = 0; s < 16; s++) if (rh[s] === 'x') {
          idx += [-2, -1, -1, 0, 1, 1, 2][(r() * 7) | 0];
          idx = clamp(idx, 3, 11);
          out[b * 16 + s] = scale[idx];
        }
      }
      return out;
    };
    const A = mk(6), A2 = A.slice(); for (let i = 24; i < 32; i++) if (A2[i] >= 0) A2[i] = scale[clamp(scale.indexOf(A2[i]) + 1, 0, scale.length - 1)];
    const B = mk(8);
    this._song = { def, mel: [...A, ...A2, ...B, ...A2], stepDur: 60 / def.bpm / 4 };
    this._step = 0;
    if (this.ctx) this._next = this.ctx.currentTime + 0.08;
    if (!this._timer) this._timer = setInterval(() => this._sched(), 28);
  },
  stopBgm() { this._songName = ''; this._song = null; this._fadeFile(); },

  _playFile(file) {
    this.init();
    const c = this.ctx; if (!c) return;
    if (!this._el) {
      this._el = document.createElement('audio'); this._el.loop = true; this._el.preload = 'auto';
      this._elG = c.createGain(); this._elG.gain.value = 0;
      c.createMediaElementSource(this._el).connect(this._elG).connect(this.bgmG);
    }
    const el = this._el, g = this._elG.gain, t = c.currentTime, token = (this._fileTok = (this._fileTok || 0) + 1);
    const start = () => {
      if (token !== this._fileTok) return;
      el.src = 'bgm/' + file + '.mp3'; el.currentTime = 0;
      const p = el.play(); if (p && p.catch) p.catch(() => {});
      const n = c.currentTime; g.cancelScheduledValues(n); g.setValueAtTime(0, n); g.linearRampToValueAtTime(1.5, n + 0.6);
    };
    if (!el.paused && el.src) { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.45); setTimeout(start, 470); }
    else start();
  },
  _fadeFile() {
    if (!this._el || this._el.paused) return;
    const c = this.ctx, g = this._elG.gain, t = c.currentTime, el = this._el, token = (this._fileTok = (this._fileTok || 0) + 1);
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => { if (token === this._fileTok) el.pause(); }, 650);
  },

  _sched() {
    const c = this.ctx, S = this._song;
    if (!c || !S || c.state !== 'running') return;
    if (this._next < c.currentTime - 0.3) this._next = c.currentTime + 0.05;
    while (this._next < c.currentTime + 0.14) { this._playStep(this._step, this._next); this._next += S.stepDur; this._step = (this._step + 1) % 128; }
  },
  _playStep(step, t) {
    const S = this._song, def = S.def, g = this.bgmG, bar = step >> 4, s = step & 15, I = this.intensity, sd = S.stepDur;
    const ch = def.prog[bar], major = ch === 3 || ch === 8 || ch === 10, rootM = def.root + ch;
    if (def.calm) {
      // 穏やかな曲: パッド+琴風アルペジオ
      if (s === 0) [0, major ? 4 : 3, 7, 12].forEach((iv) => this._pad(mtof(rootM + 12 + iv), sd * 17, 0.045, t));
      if (s % 4 === 0) this._pluck(mtof(rootM + 12 + [0, 7, 12, major ? 16 : 15][(s >> 2) & 3]), 0.5, 0.1, t, true);
      const m = S.mel[step]; if (m >= 0) this._pluck(mtof(def.root + 12 + m), 0.7, 0.16, t, true);
      if (s === 0 && bar % 2 === 0) { this._tone('sine', 90, 50, 0.5, 0.3, g, t); }
      return;
    }
    // 太鼓・ドラム
    if (s === 0 || s === 8 || (s === 10 && bar % 2 === 1) || (I > 0.6 && s === 6)) { this._tone('sine', 150, 46, 0.14, 0.5, g, t); this._noise(0.03, 0.12, 'lowpass', 900, 200, 0.7, g, t); }
    if (s === 4 || s === 12) { this._noise(0.11, 0.2, 'highpass', 1700, 1500, 0.7, g, t); this._tone('triangle', 230, 150, 0.07, 0.14, g, t); }
    if (s % 2 === 0 || I > 0.55) this._noise(0.025, s % 4 === 2 ? 0.07 : 0.045, 'highpass', 7500, 7500, 0.7, g, t);
    if (bar % 4 === 3 && s >= 12) this._tone('sine', 120 - (s - 12) * 9, 50, 0.2, 0.42, g, t);     // フィル
    if (I > 0.75 && (s === 3 || s === 11)) this._tone('sine', 100, 52, 0.18, 0.3, g, t);
    // ベース(疾走リズム)
    if ('x..xx.x.x..xx.x.'[s] === 'x') this._bass(mtof(rootM - (s === 12 ? 0 : 12) + (s === 14 ? 7 : 0)), sd * 1.7, 0.2, t);
    // コード
    if (s === 0) [0, major ? 4 : 3, 7].forEach((iv) => this._pad(mtof(rootM + 12 + iv), sd * 16.5, 0.03, t));
    // 旋律
    const m = S.mel[step];
    if (m >= 0) { const f = mtof(def.root + 12 + m); this._pluck(f, 0.32, 0.15, t, false); if (I > 0.5) this._lead(f * 2, sd * 2.2, 0.03, t); }
    // アルペジオ(高揚時)
    if (I > 0.65 && s % 2 === 1) { const af = mtof(rootM + 24 + [0, major ? 4 : 3, 7, 12][(s >> 1) & 3]); this._tone('square', af, af, sd * 0.9, 0.02, g, t); }
  },
  _pluck(f, dur, v, t, wet) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.003;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(Math.min(9000, f * 6), t); fl.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.2), t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.35;
    o.connect(fl); o2.connect(g2).connect(fl); fl.connect(g); g.connect(this.bgmG); if (wet) g.connect(this.dly); else { const w = c.createGain(); w.gain.value = 0.3; g.connect(w).connect(this.dly); }
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  },
  _lead(f, dur, v, t) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = 2400;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(fl).connect(g).connect(this.bgmG); o.start(t); o.stop(t + dur + 0.05);
  },
  _bass(f, dur, v, t) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(700, t); fl.frequency.exponentialRampToValueAtTime(220, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); o2.connect(fl); fl.connect(g).connect(this.bgmG); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  },
  _pad(f, dur, v, t) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.006;
    fl.type = 'lowpass'; fl.frequency.value = 1300;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.25); g.gain.setValueAtTime(v, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); o2.connect(fl); fl.connect(g).connect(this.bgmG); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  },
};
