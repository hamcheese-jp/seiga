// 共通ユーティリティ
export const PI = Math.PI, TAU = Math.PI * 2, D2R = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const damp = (cur, target, k, dt) => target + (cur - target) * Math.exp(-k * dt);
export const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const rndi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const angWrap = (a) => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };
export const angTo = (cur, target, maxStep) => { const d = angWrap(target - cur); return Math.abs(d) <= maxStep ? target : cur + Math.sign(d) * maxStep; };
export const angDamp = (cur, target, k, dt) => cur + angWrap(target - cur) * (1 - Math.exp(-k * dt));
export const dist2 = (ax, az, bx, bz) => { const x = ax - bx, z = az - bz; return x * x + z * z; };

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ease = {
  lin: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  io: (t) => t * t * (3 - 2 * t),
  in3: (t) => t * t * t,
  out3: (t) => 1 - Math.pow(1 - t, 3),
  back: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

// 周期対応バリューノイズ
export function makeNoise(seed = 1) {
  const r = mulberry(seed);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) val[i] = r();
  function n2(x, y, per = 256) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % per) + per) % per & 255, x1 = (x0 + 1) % per & 255;
    const y0 = ((yi % per) + per) % per & 255, y1 = (y0 + 1) % per & 255;
    const a = val[p[x0 + p[y0]]], b = val[p[x1 + p[y0]]], c = val[p[x0 + p[y1]]], d = val[p[x1 + p[y1]]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 4, per = 256) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f, Math.min(256, per * f)); n += a; a *= 0.5; f *= 2; }
    return s / n;
  }
  return { n2, fbm };
}

export const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
export function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
