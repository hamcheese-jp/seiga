// 技データ: 武器の軌道キー(az=方位, el=仰角)と攻撃判定を生成する小さなDSL
import { clamp } from './util.js';

const DEF_HIT = { shape: 'arc', r: 2.6, ang: 75, fwd: 0, dmg: 1, kb: 3, lift: 0, shake: 0.05, stop: 0.018 };
const HK = ['shape', 'r', 'ang', 'fwd', 'len', 'w', 'back', 'dmg', 'kb', 'lift', 'stun', 'el', 'fx', 'shake', 'stop', 'heavy', 'proj', 'pull', 'snd'];
function hitOf(t, o) { const h = { ...DEF_HIT, t }; for (const k of HK) if (o[k] !== undefined) h[k] = o[k]; return h; }
// 飛び道具
const P = (t, proj, o = {}) => ({ ...DEF_HIT, t, shape: 'proj', kb: 5, proj: { kind: 'crescent', speed: 26, life: 0.5, r: 1.3, yaw: 0, ...proj }, ...o });
// 吸い寄せ
const PULL = (t, r, dur, fwd = 0, force = 14) => ({ t, shape: 'pull', r, dur, fwd, force, dmg: 0, kb: 0, lift: 0, shake: 0, stop: 0 });
const FXO = (t, fx, r = 3, fwd = 0) => ({ t, shape: 'fx', fx, r, fwd, dmg: 0, kb: 0, lift: 0, shake: 0, stop: 0 });

function finish(keys, dur, chainAt, hits, o, mv, trail, sfx) {
  if (o.extra) for (const x of o.extra) hits.push(x);
  hits.sort((a, b) => a.t - b.t);
  return { keys, dur, chainAt, hits, mv, trail: o.noTrail ? [] : trail, sfx, turns: o.turnsAt || [] };
}

// 斬撃(from→to へ武器を振る)
function slash(o) {
  const w = o.wind ?? 0.1, h = o.hit ?? 0.1, rc = o.rec ?? 0.22;
  const [a0, e0] = o.from, [a1, e1] = o.to, s0 = o.spin0 ?? 0, s1 = o.spin1 ?? s0;
  const k0 = { t: w, e: 'out', az: a0, el: e0, bend: o.bend0 ?? 78, wr: o.wr0 ?? -20, tw: o.tw0 ?? clamp(a0 * 0.42, -55, 55), lean: o.lean0 ?? 3, side: 0,
    crouch: o.crouch0 ?? 0.06, stance: 0.55, y: o.y0 ?? 0, spin: s0, flip: o.flip0 ?? 0, head: 0 };
  const k1 = { t: w + h, e: 'in', az: a1, el: e1, bend: o.bend1 ?? 16, wr: o.wr1 ?? 52, tw: o.tw1 ?? clamp(a1 * 0.42, -55, 55), lean: o.lean1 ?? 14,
    crouch: o.crouch1 ?? 0.12, stance: o.stance1 ?? 1, y: o.y1 ?? 0, spin: s1, flip: o.flip1 ?? o.flip0 ?? 0 };
  const k2 = { t: w + h + rc * 0.55, e: 'out', az: a1 + (a1 - a0) * 0.07, el: e1 + (e1 - e0) * 0.05, bend: 32, wr: (o.wr1 ?? 52) + 14, lean: (o.lean1 ?? 14) * 0.6,
    crouch: 0.08, stance: 0.8, y: 0, spin: s1, flip: o.flip2 ?? k1.flip };
  if (o.L) {
    const [b0, f0] = o.L.from, [b1, f1] = o.L.to;
    k0.azL = b0; k0.elL = f0; k0.bendL = 78; k0.wrL = -20; k1.azL = b1; k1.elL = f1; k1.bendL = 16; k1.wrL = 52; k2.azL = b1 + (b1 - b0) * 0.07; k2.elL = f1; k2.bendL = 32; k2.wrL = 66;
  } else { k0.azL = 58; k0.elL = -28; k0.bendL = 72; k1.azL = 112; k1.elL = -36; k1.bendL = 38; k2.azL = 100; k2.elL = -45; k2.bendL = 45; }
  const hits = o.noHit ? [] : [hitOf(w + h * 0.55, o)];
  return finish([k0, k1, k2], w + h + rc, w + h + rc * (o.chain ?? 0.28), hits, o, o.mv ? [[w * 0.4, w + h, o.mv]] : [], [[w * 0.7, w + h + 0.07]], [[w * 0.8, o.sfx || 'swing']]);
}

// 突き
function thrust(o) {
  const w = o.wind ?? 0.12, h = o.hit ?? 0.07, rc = o.rec ?? 0.2, ev = o.elv ?? 0, az = o.az ?? -4, s0 = o.spin0 ?? 0;
  const keys = [
    { t: w, e: 'out', az: -42, el: ev - 6, bend: 128, wr: 6, tw: -44, lean: 0, side: 0, crouch: 0.08, stance: 0.5, y: 0, spin: s0, flip: 0, head: 0, azL: 35, elL: -15, bendL: 70, wrL: 6 },
    { t: w + h, e: 'in', az, el: ev, bend: 4, wr: 2, tw: 36, lean: 20, crouch: 0.16, stance: 1, spin: s0, azL: 105, elL: -40, bendL: 35 },
    { t: w + h + rc * 0.55, e: 'out', az: az - 3, el: ev, bend: 28, wr: 6, tw: 24, lean: 12, crouch: 0.1, stance: 0.8, spin: s0 },
  ];
  if (o.dual) { keys[0].azL = 42; keys[0].elL = ev - 6; keys[0].bendL = 128; keys[1].azL = 6; keys[1].elL = ev; keys[1].bendL = 4; keys[1].wrL = 2; keys[2].azL = 8; keys[2].elL = ev; keys[2].bendL = 28; keys[0].tw = 0; keys[1].tw = 0; keys[2].tw = 0; }
  const hits = o.noHit ? [] : [hitOf(w + h * 0.6, { shape: 'line', len: 4.2, w: 0.9, kb: 4, ...o })];
  return finish(keys, w + h + rc, w + h + rc * (o.chain ?? 0.28), hits, o, o.mv ? [[w * 0.5, w + h, o.mv]] : [], [[w * 0.8, w + h + 0.05]], [[w * 0.8, o.sfx || 'swing']]);
}

// 回転斬り
function spin(o) {
  const w = o.wind ?? 0.1, h = o.hit ?? 0.28, rc = o.rec ?? 0.24, turns = o.turns ?? 1, dir = o.dir ?? 1, ev = o.elv ?? -6;
  const n = o.n ?? Math.max(2, Math.round(turns * 2)), s0 = o.spin0 ?? 0, s1 = s0 + 360 * turns * dir;
  const keys = [
    { t: w, e: 'out', az: -95 * dir, el: ev, bend: 28, wr: 28, tw: -28 * dir, lean: 4, side: 0, crouch: 0.16, stance: 0.5, y: 0, spin: s0 - 35 * dir, flip: 0, head: 0, azL: 95 * dir, elL: -12, bendL: 30, wrL: 28 },
    { t: w + h, e: 'lin', az: -80 * dir, el: ev, bend: 8, wr: 46, tw: 18 * dir, lean: 8, crouch: 0.2, stance: 0.6, spin: s1, y: o.y1 ?? 0, azL: 100 * dir, elL: -14, bendL: 12, wrL: 46 },
    { t: w + h + rc * 0.5, e: 'out', az: -45 * dir, el: -30, bend: 40, wr: 60, tw: 10 * dir, lean: 6, crouch: 0.08, stance: 0.7, spin: s1, y: 0 },
  ];
  const hits = [];
  if (!o.noHit) for (let i = 0; i < n; i++) hits.push(hitOf(w + h * (i + 0.5) / n, { shape: 'circle', r: 3.0, fwd: 0, kb: 4, ...o }));
  return finish(keys, w + h + rc, w + h + rc * (o.chain ?? 0.3), hits, o, o.mv ? [[w, w + h, o.mv]] : [], [[w * 0.6, w + h + 0.06]], [[w, o.sfx || 'swingH']]);
}

// 跳躍叩きつけ
function smash(o) {
  const up = o.up ?? 0.22, dn = o.down ?? 0.12, rc = o.rec ?? 0.36, j = o.jump ?? 1.2, s0 = o.spin0 ?? 0;
  const keys = [
    { t: up, e: 'out', az: -8, el: 122, bend: 42, wr: 20, tw: -10, lean: -8, side: 0, crouch: j > 0.1 ? 0 : 0.1, stance: 0.3, y: j, spin: s0, flip: 0, head: 0, azL: 20, elL: 100, bendL: 50, wrL: 20 },
    { t: up + dn, e: 'in', az: -3, el: -42, bend: 10, wr: 40, tw: 6, lean: 34, crouch: 0.42, stance: 0.9, y: 0, spin: s0, azL: o.dual ? 3 : 60, elL: o.dual ? -42 : -50, bendL: o.dual ? 10 : 40, wrL: 40 },
    { t: up + dn + rc * 0.6, e: 'out', az: -3, el: -40, bend: 20, wr: 45, lean: 22, crouch: 0.3, stance: 0.8, y: 0, spin: s0 },
  ];
  const hits = o.noHit ? [] : [hitOf(up + dn, { shape: 'circle', r: 3.4, fwd: 1.6, kb: 7, lift: 6, shake: 0.5, stop: 0.07, heavy: true, fx: 'quake', ...o })];
  return finish(keys, up + dn + rc, up + dn + rc * (o.chain ?? 0.5), hits, o, o.mv ? [[0, up + dn, o.mv]] : [], [[up * 0.8, up + dn + 0.06]], [[up, 'swingH']]);
}

// 突進
function dash(o) {
  const w = o.wind ?? 0.1, h = o.hit ?? 0.16, rc = o.rec ?? 0.24, dist = o.dist ?? 6, s0 = o.spin0 ?? 0, n = o.n ?? 1;
  const keys = [
    { t: w, e: 'out', az: -125, el: -18, bend: 60, wr: 5, tw: -34, lean: 16, side: 0, crouch: 0.4, stance: 0.8, y: 0, spin: s0, flip: 0, head: 0, azL: o.dual ? 125 : 50, elL: -18, bendL: 60, wrL: 5 },
    { t: w + h, e: 'in', az: 25, el: -4, bend: 10, wr: 62, tw: 32, lean: 30, crouch: 0.3, stance: 1, spin: s0, azL: o.dual ? -25 : 115, elL: -8, bendL: 12, wrL: 62 },
    { t: w + h + rc * 0.5, e: 'out', az: 35, el: -10, bend: 30, wr: 70, tw: 20, lean: 14, crouch: 0.15, stance: 0.8, spin: s0 },
  ];
  const hits = [];
  if (!o.noHit) for (let i = 0; i < n; i++) hits.push(hitOf(w + h * (i + 0.6) / n, { shape: 'line', len: 2.6, back: dist / n + 0.6, w: 1.3, kb: 5, fx: 'line', ...o }));
  const m = finish(keys, w + h + rc, w + h + rc * (o.chain ?? 0.35), hits, o, [[w, w + h, dist / h]], [[w * 0.8, w + h + 0.06]], [[w, o.sfx || 'dodge']]);
  m.ghost = true;
  return m;
}

// 構え・溜め
function hold(dur, pose = {}, o = {}) {
  return finish([{ t: dur, e: 'out', az: -40, el: 40, bend: 60, wr: 30, azL: 40, elL: 40, bendL: 60, tw: 0, lean: -6, side: 0, crouch: 0.2, stance: 0.6, y: 0, flip: 0, head: 0, ...pose }], dur, dur, [], o, [], [], o.sfx ? [[0, o.sfx]] : []);
}

// 複数の技を連結(前の技の後隙をキャンセルして繋ぐ)
function seq(...ms) {
  const out = { keys: [], hits: [], mv: [], trail: [], sfx: [], turns: [], dur: 0, chainAt: 0 };
  let t0 = 0, so = 0;
  ms.forEach((m, i) => {
    const last = i === ms.length - 1, cut = last ? Infinity : (m.cut ?? m.chainAt);
    let ls = so;
    for (const k of m.keys) {
      if (k.t > cut + 1e-6) continue;
      const nk = { ...k, t: k.t + t0 };
      if (k.spin !== undefined) { nk.spin = k.spin + so; ls = nk.spin; }
      out.keys.push(nk);
    }
    for (const h of m.hits) out.hits.push({ ...h, t: h.t + t0 });
    for (const s of m.mv) out.mv.push([s[0] + t0, s[1] + t0, s[2]]);
    for (const s of m.trail) out.trail.push([s[0] + t0, s[1] + t0]);
    for (const s of m.sfx) out.sfx.push([s[0] + t0, s[1]]);
    for (const s of m.turns || []) out.turns.push([s[0] + t0, s[1]]);
    if (m.ghost) out.ghost = true;
    if (m.vanish) out.vanish = [m.vanish[0] + t0, m.vanish[1] + t0];
    if (m.warp !== undefined) out.warp = m.warp + t0;
    out.dur = t0 + m.dur; out.chainAt = t0 + m.chainAt;
    t0 += last ? m.dur : cut; so = ls;
  });
  return out;
}
const X = (m, props) => Object.assign(m, props);
const turnAt = (m, deg) => { m.turns = [[0, deg]]; return m; };
const rep = (n, f) => { const a = []; for (let i = 0; i < n; i++) a.push(f(i)); return a; };

export const MS = {};

// ================= レイガ(大太刀・炎) =================
MS.reiga = {
  spName: '紅蓮旋牙',
  n: [
    slash({ from: [-115, 12], to: [95, -12], r: 2.7, ang: 80, kb: 2.5, mv: 3.5 }),
    slash({ from: [112, 6], to: [-100, -8], r: 2.7, ang: 80, kb: 2.5, mv: 3.5, wind: 0.09 }),
    slash({ from: [-65, 82], to: [48, -46], r: 2.8, ang: 70, dmg: 1.15, mv: 3.5 }),
    slash({ from: [62, -56], to: [-38, 86], r: 2.8, ang: 70, dmg: 1.2, lift: 2.5, mv: 3 }),
    spin({ r: 3.0, dmg: 0.7, kb: 4, mv: 3 }),
    slash({ from: [-10, 122], to: [-2, -42], wind: 0.16, rec: 0.3, r: 3.1, ang: 60, dmg: 1.9, kb: 7, heavy: true, shake: 0.22, stop: 0.05, sfx: 'swingH', crouch1: 0.3, lean1: 28, mv: 4, fx: 'ring' }),
  ],
  c: [
    X(thrust({ wind: 0.16, hit: 0.12, rec: 0.26, len: 5.4, w: 1.25, dmg: 1.8, kb: 7, el: 1, fx: 'line', mv: 15, shake: 0.15, stop: 0.04 }), { ghost: true }),
    slash({ from: [-35, -72], to: [12, 108], wind: 0.12, rec: 0.3, r: 2.9, ang: 70, dmg: 1.6, kb: 1, lift: 9.5, el: 1, fx: 'burst', y1: 0.35, shake: 0.15, stop: 0.04, sfx: 'swingH' }),
    seq(slash({ from: [-100, 20], to: [80, -10], wind: 0.06, hit: 0.07, rec: 0.1, r: 2.8, dmg: 0.6, kb: 0.5, mv: 2 }), slash({ from: [100, 0], to: [-80, 10], wind: 0.05, hit: 0.07, rec: 0.1, r: 2.8, dmg: 0.6, kb: 0.5, mv: 2 }),
      slash({ from: [-90, 50], to: [70, -30], wind: 0.05, hit: 0.07, rec: 0.1, r: 2.8, dmg: 0.6, kb: 0.5, mv: 2 }), slash({ from: [80, -40], to: [-60, 60], wind: 0.06, hit: 0.08, rec: 0.3, r: 3.0, dmg: 1.3, kb: 4, stun: 2.2, el: 1, fx: 'burst', shake: 0.15, stop: 0.04 })),
    spin({ wind: 0.14, hit: 0.26, rec: 0.32, r: 4.3, dmg: 1.25, kb: 10, lift: 3, el: 1, fx: 'ring', shake: 0.3, stop: 0.04 }),
    smash({ jump: 1.0, r: 4.2, fwd: 2, dmg: 2.8, kb: 3, lift: 10, el: 1, fx: ['quake', 'pillar'], shake: 0.6, stop: 0.08 }),
    seq(spin({ turns: 2, hit: 0.42, n: 4, r: 3.6, dmg: 0.9, kb: 2, el: 1, mv: 4 }), smash({ jump: 1.6, up: 0.24, r: 5.2, fwd: 1.5, dmg: 3.6, kb: 9, lift: 9, el: 1, fx: ['quake', 'nova'], shake: 0.9, stop: 0.1 })),
  ],
  sp: X(seq(hold(0.22), spin({ turns: 3, hit: 0.72, n: 7, r: 4.0, dmg: 0.85, kb: 1.5, el: 1, mv: 5, fx: 'burst' }), spin({ turns: 2, hit: 0.46, n: 5, r: 4.3, dmg: 0.95, kb: 2, lift: 4, el: 1, mv: 5, fx: 'burst' }),
    smash({ jump: 2.0, up: 0.3, r: 6.6, fwd: 1, dmg: 5, kb: 10, lift: 11, el: 1, fx: ['quake', 'pillar', 'nova'], shake: 1.2, stop: 0.14 })), { steer: 3.2 }),
};

// ================= セツナ(長槍・氷) =================
MS.setsuna = {
  spName: '氷華絶槍',
  n: [
    thrust({ len: 4.4, w: 1.0, mv: 3 }),
    thrust({ wind: 0.09, elv: 8, len: 4.4, w: 1.0, mv: 3 }),
    slash({ from: [-110, 0], to: [100, -5], r: 3.5, ang: 85, dmg: 1.1, mv: 2.5, wr0: 10, wr1: 30 }),
    slash({ from: [110, 0], to: [-100, 0], r: 3.5, ang: 85, dmg: 1.1, mv: 2.5, wr0: 10, wr1: 30 }),
    seq(...rep(3, (i) => thrust({ wind: 0.07, hit: 0.05, rec: i === 2 ? 0.22 : 0.07, elv: -6 + i * 8, len: 4.6, w: 1.1, dmg: 0.6, kb: i === 2 ? 5 : 1, mv: 2.5 }))),
    spin({ r: 3.9, dmg: 0.85, kb: 6, hit: 0.3, wind: 0.12 }),
  ],
  c: [
    X(thrust({ wind: 0.2, hit: 0.12, rec: 0.3, len: 7.5, w: 1.4, dmg: 2.0, kb: 7, el: 1, fx: 'line', mv: 8, shake: 0.18, stop: 0.04 }), { ghost: true }),
    slash({ from: [-20, -75], to: [5, 100], wind: 0.12, rec: 0.3, r: 3.3, ang: 70, dmg: 1.6, kb: 1, lift: 9.5, el: 1, fx: 'burst', wr0: 0, wr1: 20, shake: 0.15, stop: 0.04, sfx: 'swingH' }),
    seq(...rep(6, (i) => thrust({ wind: 0.055, hit: 0.045, rec: 0.06, elv: [-8, 6, -2, 10, -6, 2][i], len: 4.8, w: 1.3, dmg: 0.5, kb: 0.3, mv: 1.5 })),
      thrust({ wind: 0.12, hit: 0.07, rec: 0.3, len: 5.5, w: 1.5, dmg: 1.4, kb: 6, stun: 2.5, el: 1, fx: 'line', shake: 0.2, stop: 0.05 })),
    slash({ from: [-115, 5], to: [105, -5], wind: 0.16, hit: 0.12, rec: 0.32, r: 4.2, ang: 90, dmg: 2.0, kb: 9, lift: 2, el: 1, fx: 'wave', wr0: 10, wr1: 30, shake: 0.3, stop: 0.05, sfx: 'swingH',
      extra: [P(0.24, { speed: 22, life: 0.4, r: 2.4 }, { dmg: 1.0, kb: 8, el: 1 })] }),
    smash({ jump: 1.5, r: 4.6, fwd: 2.4, dmg: 2.8, kb: 3, lift: 10, el: 1, fx: ['quake', 'pillar'], shake: 0.6, stop: 0.08 }),
    seq(spin({ turns: 3, hit: 0.6, n: 6, r: 3.9, dmg: 0.8, kb: 1.5, el: 1, mv: 6 }), X(thrust({ wind: 0.14, hit: 0.1, rec: 0.36, len: 8, w: 1.8, dmg: 3.2, kb: 10, lift: 4, el: 1, fx: ['line', 'nova'], mv: 10, shake: 0.8, stop: 0.1 }), { ghost: true })),
  ],
  sp: X(seq(hold(0.2), ...rep(10, (i) => thrust({ wind: 0.05, hit: 0.045, rec: 0.05, elv: [-8, 8, 0, 12, -4, 6, -10, 4, 10, 0][i], len: 6.2, w: 2.0, dmg: 0.7, kb: 0.3, el: 1, mv: 2.5, fx: i % 3 === 0 ? 'burst' : undefined })),
    smash({ jump: 2.2, up: 0.3, r: 7, fwd: 2.5, dmg: 5.2, kb: 6, lift: 11, el: 1, fx: ['quake', 'pillar', 'nova'], shake: 1.2, stop: 0.14 })), { steer: 2.6 }),
};

// ================= ライカ(双剣・雷) =================
const rIdle = { from: [-60, -30], to: [-70, -42] }, lIdle = { from: [60, -30], to: [70, -42] };
MS.raika = {
  spName: '千雷乱舞',
  n: [
    slash({ from: [-110, 10], to: [90, -10], L: lIdle, wind: 0.07, hit: 0.07, rec: 0.17, r: 2.3, ang: 80, dmg: 0.75, kb: 1.5, mv: 4 }),
    slash({ ...rIdle, L: { from: [110, 10], to: [-90, -10] }, wind: 0.06, hit: 0.07, rec: 0.17, r: 2.3, ang: 80, dmg: 0.75, kb: 1.5, mv: 4 }),
    slash({ from: [-100, 45], to: [60, -30], L: { from: [100, 45], to: [-60, -30] }, wind: 0.07, hit: 0.08, rec: 0.18, r: 2.4, ang: 75, dmg: 1.0, kb: 2, mv: 4 }),
    spin({ wind: 0.06, hit: 0.2, rec: 0.18, n: 3, r: 2.6, dmg: 0.5, kb: 1.5, mv: 4 }),
    slash({ from: [-50, -60], to: [-20, 95], L: { from: [50, -60], to: [20, 95] }, wind: 0.07, hit: 0.08, rec: 0.2, r: 2.5, ang: 75, dmg: 1.05, kb: 1.5, lift: 3, mv: 3.5 }),
    slash({ from: [-20, 120], to: [-10, -40], L: { from: [20, 120], to: [10, -40] }, wind: 0.14, hit: 0.1, rec: 0.28, r: 2.9, ang: 70, dmg: 1.8, kb: 7, y0: 0.9, flip0: 180, flip1: 360, flip2: 360, mv: 6, heavy: true, shake: 0.2, stop: 0.05, sfx: 'swingH', fx: 'ring' }),
  ],
  c: [
    dash({ dual: true, dist: 8, hit: 0.14, dmg: 1.6, kb: 4, el: 1, shake: 0.12, stop: 0.03 }),
    slash({ from: [-45, -70], to: [-12, 108], L: { from: [45, -70], to: [12, 108] }, wind: 0.1, rec: 0.3, r: 2.7, ang: 75, dmg: 1.5, kb: 1, lift: 10, el: 1, fx: 'burst', y1: 0.5, shake: 0.15, stop: 0.04 }),
    seq(spin({ turns: 3, wind: 0.07, hit: 0.5, n: 8, r: 2.8, dmg: 0.42, kb: 0.4, mv: 3 }), slash({ from: [-100, 30], to: [70, -20], L: { from: [100, 30], to: [-70, -20] }, wind: 0.06, hit: 0.08, rec: 0.28, r: 3, dmg: 1.2, kb: 5, stun: 2.2, el: 1, fx: 'burst', shake: 0.15, stop: 0.04 })),
    slash({ from: [-105, 40], to: [65, -30], L: { from: [105, 40], to: [-65, -30] }, wind: 0.13, hit: 0.09, rec: 0.3, r: 3.2, ang: 80, dmg: 1.4, kb: 9, el: 1, shake: 0.25, stop: 0.05, sfx: 'swingH',
      extra: [P(0.18, { speed: 28, life: 0.42, r: 1.5, yaw: -16 }, { dmg: 1.1, kb: 9, el: 1 }), P(0.18, { speed: 28, life: 0.42, r: 1.5, yaw: 16 }, { dmg: 1.1, kb: 9, el: 1 })] }),
    smash({ dual: true, jump: 1.9, up: 0.24, r: 4.3, fwd: 3, dmg: 3.0, kb: 3, lift: 9.5, el: 1, fx: ['pillar', 'ring'], shake: 0.6, stop: 0.08, mv: 7 }),
    seq(dash({ dual: true, dist: 6, hit: 0.11, rec: 0.1, dmg: 1.0, kb: 1, el: 1 }), turnAt(dash({ dual: true, dist: 6, wind: 0.05, hit: 0.11, rec: 0.1, dmg: 1.0, kb: 1, el: 1 }), 150),
      turnAt(dash({ dual: true, dist: 6, wind: 0.05, hit: 0.11, rec: 0.1, dmg: 1.0, kb: 1, el: 1 }), -150), turnAt(spin({ wind: 0.06, hit: 0.24, rec: 0.3, n: 3, r: 4.4, dmg: 1.1, kb: 9, lift: 5, el: 1, fx: ['pillar', 'nova'], shake: 0.7, stop: 0.08 }), 150)),
  ],
  sp: X(seq(hold(0.18), ...rep(8, (i) => turnAt(dash({ dual: true, dist: 6.5, wind: 0.04, hit: 0.1, rec: 0.08, w: 2.4, dmg: 0.9, kb: 0.5, el: 1, fx: ['line', 'pillar'] }), i === 0 ? 0 : (i % 2 ? 140 : -140))),
    smash({ dual: true, jump: 2.4, up: 0.28, r: 7, fwd: 0.5, dmg: 5, kb: 9, lift: 11, el: 1, fx: ['pillar', 'nova', 'quake'], shake: 1.2, stop: 0.14 })), { steer: 0 }),
};

// ================= ガンドウ(大槌・地) =================
MS.gandou = {
  spName: '大地崩壊',
  n: [
    slash({ from: [-115, 15], to: [95, -15], wind: 0.18, hit: 0.13, rec: 0.3, r: 3.2, ang: 85, dmg: 1.5, kb: 5, mv: 2.5, sfx: 'swingH', shake: 0.12, stop: 0.035, wr0: 0, wr1: 35 }),
    slash({ from: [112, 10], to: [-100, -12], wind: 0.16, hit: 0.13, rec: 0.3, r: 3.2, ang: 85, dmg: 1.5, kb: 5, mv: 2.5, sfx: 'swingH', shake: 0.12, stop: 0.035, wr0: 0, wr1: 35 }),
    smash({ jump: 0, up: 0.2, down: 0.11, rec: 0.3, r: 3.0, fwd: 1.8, dmg: 1.9, kb: 5, lift: 3, shake: 0.35, stop: 0.05, chain: 0.4 }),
    slash({ from: [-30, -75], to: [5, 105], wind: 0.18, hit: 0.12, rec: 0.3, r: 3.1, ang: 70, dmg: 1.7, kb: 2, lift: 6, sfx: 'swingH', shake: 0.15, stop: 0.04, wr0: 0, wr1: 30 }),
    spin({ wind: 0.16, hit: 0.34, rec: 0.3, r: 3.7, dmg: 1.0, kb: 7, mv: 2, shake: 0.15 }),
    smash({ jump: 1.2, r: 4.5, fwd: 1.8, dmg: 3.2, kb: 9, lift: 6, shake: 0.75, stop: 0.09, mv: 4 }),
  ],
  c: [
    X(dash({ dist: 6.5, wind: 0.16, hit: 0.24, rec: 0.3, w: 1.7, dmg: 2.0, kb: 11, lift: 2, shake: 0.3, stop: 0.05, sfx: 'swingH' }), { ghost: false }),
    slash({ from: [-30, -78], to: [8, 112], wind: 0.18, hit: 0.12, rec: 0.34, r: 3.3, ang: 75, dmg: 2.2, kb: 1, lift: 11, el: 1, fx: 'burst', shake: 0.3, stop: 0.06, sfx: 'swingH', wr0: 0, wr1: 30 }),
    smash({ jump: 0, up: 0.26, r: 4.6, fwd: 1.5, dmg: 1.8, kb: 2, lift: 0, stun: 3, el: 1, shake: 0.6, stop: 0.07 }),
    spin({ turns: 3, wind: 0.16, hit: 0.9, rec: 0.36, n: 6, r: 4.1, dmg: 1.15, kb: 9, lift: 2, mv: 3.2, shake: 0.2, stop: 0.03 }),
    smash({ jump: 1.8, up: 0.3, r: 5.3, fwd: 2, dmg: 3.3, kb: 4, lift: 11, el: 1, fx: ['quake', 'pillar'], shake: 0.9, stop: 0.1, mv: 5 }),
    seq(smash({ jump: 0.6, up: 0.2, rec: 0.2, r: 3.8, fwd: 2, dmg: 2.0, kb: 2, lift: 5, shake: 0.5, mv: 3, chain: 0.3 }), smash({ jump: 0.8, up: 0.2, rec: 0.2, r: 4.6, fwd: 2.4, dmg: 2.5, kb: 2, lift: 6, el: 1, shake: 0.7, mv: 3, chain: 0.3 }),
      smash({ jump: 1.8, up: 0.3, r: 6.2, fwd: 2.4, dmg: 4.2, kb: 10, lift: 10, el: 1, fx: ['quake', 'pillar', 'nova'], shake: 1.1, stop: 0.12, mv: 3 })),
  ],
  sp: X(seq(hold(0.24), smash({ jump: 1.0, up: 0.2, rec: 0.16, r: 5, fwd: 1.5, dmg: 1.8, kb: 1, lift: 5, el: 1, shake: 0.6, mv: 3, chain: 0.3 }), smash({ jump: 1.2, up: 0.2, rec: 0.16, r: 5.8, fwd: 1.5, dmg: 2.0, kb: 1, lift: 6, el: 1, shake: 0.7, mv: 3, chain: 0.3 }),
    smash({ jump: 1.4, up: 0.2, rec: 0.16, r: 6.6, fwd: 1.5, dmg: 2.2, kb: 1, lift: 7, el: 1, fx: ['quake', 'pillar'], shake: 0.8, mv: 3, chain: 0.3 }),
    smash({ jump: 2.6, up: 0.36, r: 8.5, fwd: 1, dmg: 5.5, kb: 11, lift: 11, el: 1, fx: ['quake', 'pillar', 'nova'], shake: 1.4, stop: 0.16 })), { steer: 2.4 }),
};

// ================= フウカ(双扇・風) =================
const blade = (t, yaw = 0, o = {}) => { const { proj, ...rest } = o; return P(t, { speed: 26, life: 0.5, r: 1.35, yaw, ...(proj || {}) }, { dmg: 0.8, kb: 4, ...rest }); };
MS.fuuka = {
  spName: '神風乱舞',
  n: [
    slash({ from: [-110, 10], to: [80, -10], L: lIdle, wind: 0.08, hit: 0.08, rec: 0.2, r: 2.1, ang: 80, dmg: 0.5, kb: 1.5, extra: [blade(0.13)] }),
    slash({ ...rIdle, L: { from: [110, 10], to: [-80, -10] }, wind: 0.07, hit: 0.08, rec: 0.2, r: 2.1, ang: 80, dmg: 0.5, kb: 1.5, extra: [blade(0.12)] }),
    slash({ from: [-100, 40], to: [50, -25], L: { from: [100, 40], to: [-50, -25] }, wind: 0.08, hit: 0.09, rec: 0.22, r: 2.2, ang: 80, dmg: 0.6, kb: 2, extra: [blade(0.14, -12), blade(0.14, 12)] }),
    spin({ wind: 0.07, hit: 0.22, rec: 0.22, n: 2, r: 2.4, dmg: 0.5, kb: 2, extra: [blade(0.2, -24), blade(0.2, 0), blade(0.2, 24)] }),
    slash({ from: [-50, -55], to: [-15, 95], L: { from: [50, -55], to: [15, 95] }, wind: 0.09, hit: 0.09, rec: 0.24, r: 2.3, ang: 75, dmg: 0.7, kb: 1, lift: 3, extra: [blade(0.15, 0, { dmg: 1.2, lift: 4, proj: { r: 1.9, speed: 22 } })] }),
    spin({ turns: 2, wind: 0.09, hit: 0.4, rec: 0.3, n: 4, r: 2.6, dmg: 0.5, kb: 3, extra: rep(8, (i) => blade(0.14 + i * 0.045, i * 45, { dmg: 1.0, kb: 6 })) }),
  ],
  c: [
    slash({ from: [-90, 30], to: [40, 0], L: { from: [90, 30], to: [-40, 0] }, wind: 0.16, hit: 0.1, rec: 0.3, noHit: true, sfx: 'wind',
      extra: [P(0.22, { kind: 'tornado', speed: 7, life: 2.4, r: 2.5, tick: 0.3 }, { dmg: 0.7, kb: 0, lift: 5, el: 1 })] }),
    slash({ from: [-40, -70], to: [-10, 105], L: { from: [40, -70], to: [10, 105] }, wind: 0.12, rec: 0.3, r: 2.4, ang: 60, dmg: 0.5, kb: 0, lift: 4, sfx: 'wind',
      extra: [{ ...DEF_HIT, t: 0.2, shape: 'circle', fwd: 4.2, r: 3.5, dmg: 1.6, kb: 0, lift: 11, el: 1, fx: 'pillar', shake: 0.2, stop: 0.03 }] }),
    seq(...rep(6, (i) => slash({ from: i % 2 ? [-60, -30] : [-100, 20], to: i % 2 ? [-70, -42] : [70, -10], L: i % 2 ? { from: [100, 20], to: [-70, -10] } : lIdle, wind: 0.05, hit: 0.06, rec: i === 5 ? 0.3 : 0.06, noHit: true,
      extra: [blade(0.08, [-8, 8, -4, 4, -10, 0][i], { dmg: i === 5 ? 1.3 : 0.7, stun: i === 5 ? 2.2 : undefined, el: i === 5 ? 1 : undefined })] }))),
    slash({ from: [-115, 10], to: [100, -5], L: { from: [115, 10], to: [-100, -5] }, wind: 0.16, hit: 0.11, rec: 0.34, r: 8, ang: 46, dmg: 2.2, kb: 13, lift: 2.5, el: 1, fx: 'wave', shake: 0.3, stop: 0.05, sfx: 'wind' }),
    seq(hold(0.5, { az: -30, el: 70, azL: 30, elL: 70, bend: 30, bendL: 30 }, { sfx: 'wind', extra: [PULL(0.05, 7.5, 0.75, 6)] }),
      slash({ from: [-30, 110], to: [-10, -30], L: { from: [30, 110], to: [10, -30] }, wind: 0.14, hit: 0.1, rec: 0.36, noHit: true, sfx: 'swingH',
        extra: [{ ...DEF_HIT, t: 0.2, shape: 'circle', fwd: 6, r: 5.2, dmg: 3.0, kb: 4, lift: 11, el: 1, fx: ['pillar', 'nova'], shake: 0.7, stop: 0.08 }] })),
    seq(spin({ turns: 3, wind: 0.09, hit: 0.62, n: 6, r: 2.8, dmg: 0.5, kb: 1.5, mv: 3, extra: rep(12, (i) => blade(0.12 + i * 0.05, i * 30, { dmg: 0.9, kb: 5 })) }),
      slash({ from: [-115, 10], to: [100, -5], L: { from: [115, 10], to: [-100, -5] }, wind: 0.12, hit: 0.1, rec: 0.36, r: 9, ang: 55, dmg: 3.0, kb: 14, lift: 4, el: 1, fx: ['wave', 'nova'], shake: 0.7, stop: 0.08, sfx: 'wind' })),
  ],
  sp: X(seq(hold(0.2, {}, { extra: [PULL(0.05, 10, 1.9, 0, 16)] }), spin({ turns: 5, wind: 0.06, hit: 1.5, n: 11, r: 5.4, dmg: 0.7, kb: 0, lift: 4.5, el: 1, fx: 'burst', extra: [FXO(0.1, 'tornado', 5), ...rep(10, (i) => blade(0.2 + i * 0.13, i * 77, { dmg: 0.8 }))] }),
    slash({ from: [-30, 115], to: [-10, -35], L: { from: [30, 115], to: [10, -35] }, wind: 0.16, hit: 0.1, rec: 0.4, noHit: true, sfx: 'swingH',
      extra: [{ ...DEF_HIT, t: 0.22, shape: 'circle', fwd: 0, r: 8.5, dmg: 5, kb: 12, lift: 12, el: 1, fx: ['pillar', 'nova', 'ring'], shake: 1.2, stop: 0.14 }] })), { steer: 2.5, spMove: 3 }),
};

// ================= ヨミ(大鎌・闇) =================
MS.yomi = {
  spName: '冥府葬送',
  n: [
    slash({ from: [-118, 12], to: [100, -10], wind: 0.13, hit: 0.12, rec: 0.26, r: 3.4, ang: 95, dmg: 1.15, kb: 2.5, mv: 3, wr0: 10, wr1: 40 }),
    slash({ from: [115, 8], to: [-105, -8], wind: 0.12, hit: 0.12, rec: 0.26, r: 3.4, ang: 95, dmg: 1.15, kb: 2.5, mv: 3, wr0: 10, wr1: 40 }),
    slash({ from: [-20, 116], to: [8, -36], wind: 0.14, hit: 0.11, rec: 0.26, r: 3.4, ang: 70, dmg: 1.35, kb: -3, mv: 2, wr0: 10, wr1: 50, crouch1: 0.25 }),
    slash({ from: [55, -58], to: [-35, 88], wind: 0.13, hit: 0.11, rec: 0.26, r: 3.4, ang: 80, dmg: 1.3, kb: 1, lift: 3.5, mv: 2.5, wr0: 10, wr1: 40 }),
    spin({ wind: 0.12, hit: 0.3, rec: 0.26, r: 3.8, dmg: 0.8, kb: 4, mv: 2.5 }),
    spin({ turns: 2, wind: 0.12, hit: 0.46, rec: 0.3, n: 4, r: 4.1, dmg: 0.75, kb: 8, mv: 3, shake: 0.12 }),
  ],
  c: [
    seq(X(dash({ dist: 7.5, wind: 0.1, hit: 0.07, rec: 0.02, noHit: true, sfx: 'dark' }), { cut: 0.18, vanish: [0.1, 0.17] }),
      turnAt(slash({ from: [-120, 20], to: [110, -10], wind: 0.07, hit: 0.11, rec: 0.3, r: 3.7, ang: 180, dmg: 2.0, kb: 6, el: 1, fx: 'ring', shake: 0.2, stop: 0.05, sfx: 'swingH', wr0: 10, wr1: 40 }), 180)),
    slash({ from: [-30, -75], to: [5, 108], wind: 0.14, rec: 0.3, r: 3.5, ang: 80, dmg: 1.7, kb: 0, lift: 10, el: 1, fx: 'burst', shake: 0.18, stop: 0.04, sfx: 'swingH', wr0: 10, wr1: 40 }),
    slash({ from: [-110, 20], to: [60, 0], wind: 0.16, hit: 0.1, rec: 0.34, r: 3.2, ang: 80, dmg: 0.8, kb: 1, sfx: 'swingH', wr0: 10, wr1: 40,
      extra: [P(0.22, { kind: 'disc', speed: 11, life: 1.3, r: 2.3, tick: 0.2 }, { dmg: 0.55, kb: 0.5, el: 1, stun: 1.2 })] }),
    slash({ from: [-118, 12], to: [105, -8], wind: 0.17, hit: 0.12, rec: 0.34, r: 7.2, ang: 52, dmg: 2.3, kb: 11, lift: 2, el: 1, fx: 'wave', shake: 0.3, stop: 0.05, sfx: 'swingH', wr0: 10, wr1: 40 }),
    seq(hold(0.5, { az: -20, el: 80, bend: 40 }, { sfx: 'dark', extra: [PULL(0.05, 7.5, 0.75, 0)] }), smash({ jump: 0.4, up: 0.16, r: 5.6, fwd: 0.5, dmg: 3.2, kb: 5, lift: 10, el: 1, fx: ['pillar', 'nova'], shake: 0.8, stop: 0.09 })),
    seq(spin({ turns: 3, wind: 0.12, hit: 0.66, n: 6, r: 4.3, dmg: 0.95, kb: -1.5, el: 1, mv: 3 }),
      slash({ from: [-30, 120], to: [20, -40], wind: 0.15, hit: 0.11, rec: 0.4, r: 6.2, ang: 120, dmg: 3.6, kb: 10, lift: 5, el: 1, fx: ['wave', 'nova'], shake: 0.9, stop: 0.1, sfx: 'swingH', wr0: 10, wr1: 50, crouch1: 0.3 })),
  ],
  sp: X(seq(hold(0.24, { az: -20, el: 85, bend: 40 }, { extra: [PULL(0.05, 10.5, 1.5, 0, 18)] }), spin({ turns: 4, wind: 0.08, hit: 1.1, n: 8, r: 5.2, dmg: 0.8, kb: -2, el: 1, fx: 'burst' }),
    slash({ from: [-40, 125], to: [30, -40], wind: 0.2, hit: 0.12, rec: 0.44, noHit: true, sfx: 'swingH', wr0: 10, wr1: 50, crouch1: 0.3, y0: 1.2,
      extra: [{ ...DEF_HIT, t: 0.27, shape: 'circle', fwd: 0, r: 8.8, dmg: 5.6, kb: 10, lift: 10, el: 1, fx: ['wave', 'nova', 'pillar'], shake: 1.2, stop: 0.15 }] })), { steer: 2.4, spMove: 2 }),
};

// ================= 敵将・味方将(AI用) =================
const burst = () => X(seq(hold(0.32, { az: -30, el: 60, azL: 30, elL: 60, crouch: 0.3 }), spin({ wind: 0.04, hit: 0.18, rec: 0.3, n: 1, r: 4.6, dmg: 0.9, kb: 10, lift: 5, fx: 'ring', shake: 0.3 })), { armor: true, tele: 1 });
MS.off_sword = {
  m: {
    n0: slash({ from: [-115, 12], to: [95, -12], wind: 0.26, rec: 0.26, r: 2.8, ang: 80, kb: 3, mv: 3.5 }),
    n1: slash({ from: [112, 6], to: [-100, -8], wind: 0.16, rec: 0.26, r: 2.8, ang: 80, kb: 3, mv: 3.5 }),
    n2: slash({ from: [-65, 82], to: [48, -46], wind: 0.18, rec: 0.4, r: 2.9, ang: 70, dmg: 1.3, kb: 6, mv: 3.5 }),
    heavy: X(slash({ from: [-10, 122], to: [-2, -42], wind: 0.62, rec: 0.5, r: 3.4, ang: 65, dmg: 2.2, kb: 8, lift: 6, heavy: true, shake: 0.3, sfx: 'swingH', crouch1: 0.3, lean1: 28, mv: 5, fx: 'ring' }), { tele: 1, armor: true }),
    dash: X(thrust({ wind: 0.5, hit: 0.16, rec: 0.5, len: 5.5, w: 1.3, dmg: 1.8, kb: 8, mv: 20, fx: 'line', shake: 0.2 }), { tele: 1, ghost: true }),
    burst: burst(),
  },
  plans: [{ seq: ['n0', 'n1', 'n2'], max: 3.3, w: 5 }, { seq: ['n0', 'n1'], max: 3.3, w: 3 }, { seq: ['heavy'], max: 4, w: 2 }, { seq: ['dash'], min: 4.5, max: 10, w: 3 }],
};
MS.off_spear = {
  m: {
    n0: thrust({ wind: 0.28, rec: 0.26, len: 4.6, w: 1.0, mv: 3 }),
    n1: thrust({ wind: 0.16, rec: 0.26, elv: 6, len: 4.6, w: 1.0, mv: 3 }),
    n2: slash({ from: [-110, 0], to: [100, -5], wind: 0.2, rec: 0.42, r: 3.6, ang: 85, dmg: 1.3, kb: 6, mv: 2.5, wr0: 10, wr1: 30 }),
    heavy: X(spin({ wind: 0.6, hit: 0.3, rec: 0.5, r: 4.3, dmg: 1.1, kb: 9, lift: 5, heavy: true, shake: 0.3, fx: 'ring' }), { tele: 1, armor: true }),
    dash: X(thrust({ wind: 0.55, hit: 0.14, rec: 0.5, len: 7.5, w: 1.3, dmg: 2.0, kb: 9, mv: 14, fx: 'line', shake: 0.2 }), { tele: 1, ghost: true }),
    burst: burst(),
  },
  plans: [{ seq: ['n0', 'n1', 'n2'], max: 4, w: 5 }, { seq: ['n0', 'n2'], max: 4, w: 3 }, { seq: ['heavy'], max: 4.2, w: 2 }, { seq: ['dash'], min: 5, max: 11, w: 3 }],
};
MS.off_axe = {
  m: {
    n0: slash({ from: [-115, 15], to: [95, -15], wind: 0.34, hit: 0.13, rec: 0.34, r: 3.2, ang: 85, dmg: 1.3, kb: 5, mv: 2.5, sfx: 'swingH', wr0: 0, wr1: 35 }),
    n1: slash({ from: [112, 10], to: [-100, -12], wind: 0.22, hit: 0.13, rec: 0.44, r: 3.2, ang: 85, dmg: 1.4, kb: 6, mv: 2.5, sfx: 'swingH', wr0: 0, wr1: 35 }),
    heavy: X(smash({ jump: 1.4, up: 0.62, rec: 0.6, r: 4.6, fwd: 1.8, dmg: 2.4, kb: 9, lift: 7, shake: 0.7, mv: 4 }), { tele: 1, armor: true }),
    dash: X(dash({ dist: 7, wind: 0.5, hit: 0.26, rec: 0.5, w: 1.7, dmg: 1.9, kb: 11, lift: 3, shake: 0.3, sfx: 'swingH' }), { tele: 1, armor: true, ghost: false }),
    burst: burst(),
  },
  plans: [{ seq: ['n0', 'n1'], max: 3.6, w: 5 }, { seq: ['heavy'], max: 5, w: 3 }, { seq: ['dash'], min: 4.5, max: 10, w: 3 }],
};

// ---- ボス ----
const nova = (r, dmg, wind = 0.85) => X(seq(hold(wind, { az: -30, el: 70, azL: 30, elL: 70, crouch: 0.3 }, { sfx: 'tele' }), smash({ jump: 0, up: 0.1, r, fwd: 0, dmg, kb: 10, lift: 8, fx: ['quake', 'nova', 'pillar'], shake: 1.0, el: 1 })), { tele: 2, armor: true });
MS.boss_axe = {
  m: { ...MS.off_axe.m,
    n0: slash({ from: [-115, 15], to: [95, -15], wind: 0.3, hit: 0.13, rec: 0.3, r: 3.6, ang: 90, dmg: 1.3, kb: 5, mv: 3, sfx: 'swingH', wr0: 0, wr1: 35 }),
    n1: slash({ from: [112, 10], to: [-100, -12], wind: 0.2, hit: 0.13, rec: 0.3, r: 3.6, ang: 90, dmg: 1.4, kb: 6, mv: 3, sfx: 'swingH', wr0: 0, wr1: 35 }),
    n2: X(smash({ jump: 0.5, up: 0.3, rec: 0.5, r: 4.2, fwd: 2, dmg: 2.0, kb: 8, lift: 6, shake: 0.6 }), { armor: true }),
    nova: nova(7.5, 2.6),
    rush: X(seq(dash({ dist: 8, wind: 0.5, hit: 0.24, rec: 0.2, w: 1.9, dmg: 1.8, kb: 10, lift: 3, shake: 0.3 }), spin({ wind: 0.1, hit: 0.3, rec: 0.5, r: 4.4, dmg: 1.2, kb: 9, lift: 4, fx: 'ring', shake: 0.3 })), { tele: 1, armor: true, ghost: false }),
    burst: burst(),
  },
  plans: [{ seq: ['n0', 'n1', 'n2'], max: 4, w: 5 }, { seq: ['heavy'], max: 5.5, w: 2 }, { seq: ['rush'], min: 4, max: 12, w: 3 }, { seq: ['nova'], max: 7, w: 2, p2: true }],
};
MS.boss_twin = {
  m: {
    n0: slash({ from: [-110, 10], to: [90, -10], L: lIdle, wind: 0.2, hit: 0.07, rec: 0.14, r: 2.6, ang: 80, dmg: 0.8, kb: 1.5, mv: 5 }),
    n1: slash({ ...rIdle, L: { from: [110, 10], to: [-90, -10] }, wind: 0.08, hit: 0.07, rec: 0.14, r: 2.6, ang: 80, dmg: 0.8, kb: 1.5, mv: 5 }),
    n2: slash({ from: [-100, 45], to: [60, -30], L: { from: [100, 45], to: [-60, -30] }, wind: 0.09, hit: 0.08, rec: 0.16, r: 2.7, ang: 75, dmg: 0.9, kb: 2, mv: 5 }),
    n3: spin({ wind: 0.08, hit: 0.22, rec: 0.4, n: 3, r: 3.0, dmg: 0.6, kb: 7, mv: 4 }),
    dash: X(seq(dash({ dual: true, dist: 9, wind: 0.42, hit: 0.14, rec: 0.12, dmg: 1.5, kb: 4 }), turnAt(dash({ dual: true, dist: 9, wind: 0.16, hit: 0.14, rec: 0.4, dmg: 1.5, kb: 8, lift: 4 }), 172)), { tele: 1 }),
    storm: X(seq(hold(0.6, { az: -90, el: 20, azL: 90, elL: 20 }, { sfx: 'tele' }), spin({ turns: 3, wind: 0.06, hit: 0.7, rec: 0.5, n: 7, r: 3.6, dmg: 0.6, kb: 2, mv: 6,
      extra: rep(6, (i) => P(0.15 + i * 0.1, { kind: 'tornado', speed: 9, life: 1.6, r: 1.8, tick: 0.35, yaw: i * 60 }, { dmg: 0.7, kb: 2, lift: 4 })) })), { tele: 2, armor: true, steer: 2 }),
    burst: burst(),
  },
  plans: [{ seq: ['n0', 'n1', 'n2', 'n3'], max: 3.4, w: 5 }, { seq: ['n0', 'n1'], max: 3.4, w: 2 }, { seq: ['dash'], min: 4, max: 13, w: 4 }, { seq: ['storm'], max: 9, w: 2, p2: true }],
};
MS.boss_spear = {
  m: {
    n0: thrust({ wind: 0.26, rec: 0.2, len: 5.2, w: 1.1, mv: 4 }),
    n1: thrust({ wind: 0.12, rec: 0.2, elv: 6, len: 5.2, w: 1.1, mv: 4 }),
    n2: slash({ from: [-110, 0], to: [100, -5], wind: 0.16, rec: 0.4, r: 4.0, ang: 90, dmg: 1.3, kb: 7, mv: 3, wr0: 10, wr1: 30 }),
    heavy: X(spin({ turns: 2, wind: 0.55, hit: 0.5, rec: 0.5, n: 4, r: 4.6, dmg: 0.9, kb: 8, lift: 5, mv: 4, shake: 0.3, fx: 'ring' }), { tele: 1, armor: true, steer: 1.5 }),
    dash: X(thrust({ wind: 0.5, hit: 0.16, rec: 0.5, len: 9, w: 1.5, dmg: 2.1, kb: 9, mv: 20, fx: 'line', shake: 0.2 }), { tele: 1, ghost: true }),
    spikes: X(seq(hold(0.7, { az: -10, el: 100, bend: 30 }, { sfx: 'tele' }), smash({ jump: 0, up: 0.1, rec: 0.7, r: 3.2, fwd: 3, dmg: 1.8, kb: 3, lift: 8, el: 1, fx: ['pillar'], shake: 0.5,
      extra: rep(4, (i) => ({ ...DEF_HIT, t: 0.3 + i * 0.14, shape: 'circle', fwd: 6.5 + i * 3.5, r: 3.2, dmg: 1.8, kb: 3, lift: 8, el: 1, fx: 'pillar', shake: 0.4 })) })), { tele: 2, armor: true }),
    burst: burst(),
  },
  plans: [{ seq: ['n0', 'n1', 'n2'], max: 4.6, w: 5 }, { seq: ['heavy'], max: 5, w: 2 }, { seq: ['dash'], min: 5, max: 13, w: 3 }, { seq: ['spikes'], min: 3, max: 18, w: 3, p2: true }],
};
MS.boss_hammer = {
  m: {
    n0: slash({ from: [-115, 15], to: [95, -15], wind: 0.32, hit: 0.13, rec: 0.3, r: 3.8, ang: 90, dmg: 1.4, kb: 6, mv: 3, sfx: 'swingH', wr0: 0, wr1: 35 }),
    n1: slash({ from: [112, 10], to: [-100, -12], wind: 0.2, hit: 0.13, rec: 0.3, r: 3.8, ang: 90, dmg: 1.4, kb: 6, mv: 3, sfx: 'swingH', wr0: 0, wr1: 35 }),
    n2: X(smash({ jump: 0.8, up: 0.32, rec: 0.5, r: 4.6, fwd: 2, dmg: 2.2, kb: 8, lift: 7, el: 1, fx: ['quake', 'pillar'], shake: 0.7 }), { armor: true }),
    heavy: X(spin({ turns: 3, wind: 0.6, hit: 0.9, rec: 0.6, n: 6, r: 4.4, dmg: 1.0, kb: 9, lift: 3, mv: 4.5, shake: 0.25 }), { tele: 1, armor: true, steer: 1.8 }),
    erupt: X(seq(hold(0.75, { az: -10, el: 110, bend: 30 }, { sfx: 'tele' }), smash({ jump: 0, up: 0.1, rec: 0.8, r: 4, fwd: 2, dmg: 2.0, kb: 4, lift: 8, el: 1, fx: ['quake', 'pillar'], shake: 0.8,
      extra: rep(6, (i) => ({ ...DEF_HIT, t: 0.34 + i * 0.12, shape: 'circle', fwd: 5 + (i >> 1) * 4.5, side: (i % 2 ? 1 : -1) * (2 + (i >> 1) * 1.5), r: 3.4, dmg: 1.8, kb: 3, lift: 8, el: 1, fx: 'pillar', shake: 0.4 })) })), { tele: 2, armor: true }),
    nova: nova(8.5, 2.8),
    burst: burst(),
  },
  plans: [{ seq: ['n0', 'n1', 'n2'], max: 4.2, w: 5 }, { seq: ['heavy'], max: 6, w: 2 }, { seq: ['erupt'], min: 3, max: 18, w: 3 }, { seq: ['nova'], max: 8, w: 2, p2: true }],
};
MS.boss_final = {
  m: {
    n0: slash({ from: [-118, 12], to: [100, -10], wind: 0.26, hit: 0.11, rec: 0.2, r: 4.0, ang: 95, dmg: 1.2, kb: 3, mv: 4, wr0: 10, wr1: 40 }),
    n1: slash({ from: [115, 8], to: [-105, -8], wind: 0.13, hit: 0.11, rec: 0.2, r: 4.0, ang: 95, dmg: 1.2, kb: 3, mv: 4, wr0: 10, wr1: 40 }),
    n2: slash({ from: [-20, 116], to: [8, -36], wind: 0.15, hit: 0.11, rec: 0.24, r: 4.0, ang: 75, dmg: 1.4, kb: -3, mv: 3, wr0: 10, wr1: 50 }),
    n3: spin({ turns: 2, wind: 0.12, hit: 0.44, rec: 0.44, n: 4, r: 4.4, dmg: 0.8, kb: 8, lift: 3, mv: 3, shake: 0.15 }),
    warp: X(seq(X(dash({ dist: 0.1, wind: 0.45, hit: 0.07, rec: 0.02, noHit: true, sfx: 'dark' }), { cut: 0.53, vanish: [0.42, 0.52], warp: 0.47 }),
      slash({ from: [-120, 20], to: [110, -10], wind: 0.2, hit: 0.11, rec: 0.36, r: 4.2, ang: 130, dmg: 1.9, kb: 8, lift: 4, el: 1, fx: 'ring', shake: 0.25, sfx: 'swingH', wr0: 10, wr1: 40 })), { tele: 1 }),
    orbs: X(seq(hold(0.7, { az: -20, el: 85, bend: 40 }, { sfx: 'tele' }), slash({ from: [-110, 60], to: [80, 0], wind: 0.1, hit: 0.12, rec: 0.6, noHit: true, sfx: 'dark',
      extra: rep(10, (i) => P(0.14 + (i % 2) * 0.16, { kind: 'orb', speed: 12, life: 2.0, r: 1.3, yaw: i * 36 }, { dmg: 1.2, kb: 5, lift: 3, el: 1 })) })), { tele: 2, armor: true }),
    reap: X(seq(hold(0.6, { az: -30, el: 120, bend: 40 }, { sfx: 'tele', extra: [PULL(0.1, 11, 0.6, 0, 12)] }), slash({ from: [-40, 125], to: [30, -40], wind: 0.14, hit: 0.12, rec: 0.6, r: 7, ang: 180, dmg: 2.6, kb: 11, lift: 7, el: 1, fx: ['wave', 'nova'], shake: 0.9, sfx: 'swingH', wr0: 10, wr1: 50, crouch1: 0.3 })), { tele: 2, armor: true }),
    nova: nova(9.5, 3.0, 0.95),
    burst: burst(),
  },
  plans: [{ seq: ['n0', 'n1', 'n2', 'n3'], max: 4.4, w: 5 }, { seq: ['n0', 'n1'], max: 4.4, w: 2 }, { seq: ['warp'], min: 3, max: 20, w: 4 }, { seq: ['orbs'], min: 2, max: 20, w: 3 }, { seq: ['reap'], max: 9, w: 2, p2: true }, { seq: ['nova'], max: 9, w: 2, p2: true }],
};

// ================= 帝国の将(プレイヤー用) =================
// 星牙使いの技を土台に、ボスの大技をチャージ技に組み込む
const pl = (mv) => { const o = { ...mv, armor: true }; delete o.tele; return o; };
const B1 = MS.boss_axe.m, B2 = MS.boss_twin.m, B3 = MS.boss_spear.m, B4 = MS.boss_hammer.m, B5 = MS.boss_final.m;
MS.p_barga = { spName: '鉄壁轟断',
  n: [B1.n0, B1.n1, MS.gandou.n[2], MS.gandou.n[3], MS.gandou.n[4], pl(B1.n2)],
  c: [pl(B1.rush), MS.gandou.c[1], MS.gandou.c[2], MS.gandou.c[3], pl(B1.nova), MS.gandou.c[5]], sp: MS.gandou.sp };
MS.p_zahar = { spName: '砂塵千刃',
  n: [B2.n0, B2.n1, B2.n2, B2.n3, MS.raika.n[4], MS.raika.n[5]],
  c: [pl(B2.dash), MS.raika.c[1], MS.raika.c[2], MS.raika.c[3], MS.raika.c[4], pl(B2.storm)], sp: MS.raika.sp };
MS.p_volg = { spName: '氷狼牙陣',
  n: [B3.n0, B3.n1, B3.n2, MS.setsuna.n[3], MS.setsuna.n[4], MS.setsuna.n[5]],
  c: [pl(B3.dash), MS.setsuna.c[1], MS.setsuna.c[2], pl(B3.heavy), pl(B3.spikes), MS.setsuna.c[5]], sp: MS.setsuna.sp };
MS.p_ignas = { spName: '獄炎噴火',
  n: [B4.n0, B4.n1, pl(B4.n2), MS.gandou.n[3], MS.gandou.n[4], MS.gandou.n[5]],
  c: [MS.gandou.c[0], MS.gandou.c[1], pl(B4.erupt), pl(B4.heavy), MS.gandou.c[4], pl(B4.nova)], sp: MS.gandou.sp };
MS.p_zenova = { spName: '覇星墜天',
  n: [B5.n0, B5.n1, B5.n2, B5.n3, MS.yomi.n[4], MS.yomi.n[5]],
  c: [pl(B5.warp), MS.yomi.c[1], pl(B5.orbs), MS.yomi.c[3], pl(B5.reap), MS.yomi.c[5]], sp: MS.yomi.sp };
