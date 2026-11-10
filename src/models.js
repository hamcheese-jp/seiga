// キャラクターモデル(すべてコード生成): 武将リグ / 武器 / 雑兵パーツ
import * as THREE from 'three';
import { box, sph, cyl, cone, caps, torus, at, merge, extrude, col } from './geo.js';
import { patchMat } from './gfx.js';

const PI = Math.PI, TAU = PI * 2;

// 武器種ごとの構え(度)
export const RESTS = {
  sword:  { az: -32, el: -56, bend: 55, wr: 108, azL: 30, elL: -66, bendL: 45, wrL: 100 },
  spear:  { az: -30, el: -52, bend: 50, wr: 115, azL: 30, elL: -60, bendL: 50, wrL: 100 },
  twin:   { az: -38, el: -58, bend: 60, wr: 95,  azL: 38, elL: -58, bendL: 60, wrL: 95 },
  hammer: { az: -28, el: -55, bend: 55, wr: 120, azL: 30, elL: -60, bendL: 50, wrL: 100 },
  axe:    { az: -28, el: -55, bend: 55, wr: 120, azL: 30, elL: -60, bendL: 50, wrL: 100 },
  fan:    { az: -42, el: -52, bend: 70, wr: 100, azL: 42, elL: -52, bendL: 70, wrL: 100 },
  scythe: { az: -30, el: -52, bend: 50, wr: 125, azL: 30, elL: -60, bendL: 50, wrL: 100 },
};
const REST_COMMON = { tw: 0, lean: 2, side: 0, crouch: 0, stance: 0.1, y: 0, spin: 0, flip: 0, head: 0 };

class Builder {
  constructor() { this.parts = {}; }
  add(joint, kind, geo) { const k = joint + '|' + kind; (this.parts[k] || (this.parts[k] = [])).push(geo); return this; }
  build(J, M) {
    for (const k in this.parts) {
      const [j, kind] = k.split('|');
      const mesh = new THREE.Mesh(merge(this.parts[k]), M[kind]);
      mesh.castShadow = true;
      J[j].add(mesh);
    }
  }
}

function skeleton(L) {
  const J = {};
  const g = (name, parent, x, y, z) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); J[name] = o; return o; };
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); J.root = root; J.body = body;
  const sw = L.sw, hw = 0.1 * (0.85 + L.bulk * 0.15);
  g('hips', body, 0, 0.98, 0);
  g('spine', J.hips, 0, 0.05, 0);
  g('chest', J.spine, 0, 0.2, 0);
  g('head', J.chest, 0, 0.36, 0);
  g('armL', J.chest, sw, 0.27, 0); g('foreL', J.armL, 0, -0.29, 0); g('handL', J.foreL, 0, -0.28, 0);
  g('armR', J.chest, -sw, 0.27, 0); g('foreR', J.armR, 0, -0.29, 0); g('handR', J.foreR, 0, -0.28, 0);
  g('legL', J.hips, hw, -0.03, 0); g('shinL', J.legL, 0, -0.44, 0);
  g('legR', J.hips, -hw, -0.03, 0); g('shinR', J.legR, 0, -0.44, 0);
  return J;
}

// 揺れもの(マント・髪・布)チェーンを作る
function chain(J, dang, parent, name, x, y, z, yaw, n, segLen, mk, opt = {}) {
  let p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = yaw; J[parent].add(p);
  const segs = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Group(); s.position.set(0, i === 0 ? 0 : -segLen, 0); p.add(s);
    const key = name + i; J[key] = s; segs.push(s); mk(i, key); p = s;
  }
  dang.push({ segs, rest: opt.rest || segs.map((_, i) => (i === 0 ? 0.25 : 0.06)), sign: opt.sign || 1, k: opt.k ?? 0.9, amp: opt.amp ?? 0.08, freq: opt.freq ?? 3.2, phase: Math.random() * 6, back: opt.back ?? 1 });
}

function buildWeapon(type, tier, P) {
  const steel = ['#aab3c0', '#cfd8e6', '#eef2ff'][tier], gold = tier === 0 ? '#8a7350' : P.gold;
  const gs = [0.4, 0.75, 1.25][tier], glow = [P.glow[0] * gs, P.glow[1] * gs, P.glow[2] * gs];
  const parts = [], add = (k, g) => parts.push({ k, g });
  const flat = (g, s) => at(g, 0, 0, 0, 0, 0, 0, s, 1, 1);
  let tip, base, two = false, dual = false, grip = [0, -0.4, 0];
  if (type === 'sword') {
    const len = 1.12 + tier * 0.07, w = 0.075 + tier * 0.008;
    add('c', at(cyl(0.021, 0.023, 0.3, '#2a1a14', 8), 0, 0, 0));
    add('m', at(sph(0.032, gold, 8, 6), 0, -0.165, 0));
    add('m', at(box(0.04, 0.026, 0.17 + tier * 0.04, gold), 0, 0.165, 0));
    add('m', at(box(0.02, len * 0.84, w, steel), 0, 0.18 + len * 0.42, 0));
    add('m', at(flat(at(cone(w * 0.5, len * 0.18, steel, 4), 0, 0, 0, 0, PI / 4, 0), 0.38), 0, 0.18 + len * 0.93, 0, 0, 0, 0, 1, 1, 1.42));
    add('g', at(box(0.026, len * 0.86, 0.014, glow), 0, 0.2 + len * 0.43, w * 0.5));
    if (tier > 0) add('g', at(sph(0.022, glow, 6, 5), 0, 0.165, 0));
    tip = [0, 0.18 + len, 0]; base = [0, 0.3, 0];
  } else if (type === 'spear') {
    add('c', at(cyl(0.02, 0.021, 2.2, '#4a2e20', 8), 0, 0.35, 0));
    add('m', at(cone(0.03, 0.12, steel, 6), 0, -0.8, 0, PI, 0, 0));
    add('m', at(cyl(0.036, 0.03, 0.13, gold, 8), 0, 1.44, 0));
    add('m', at(flat(at(cone(0.085, 0.52 + tier * 0.05, steel, 4), 0, 0, 0, 0, PI / 4, 0), 0.3), 0, 1.76 + tier * 0.025, 0));
    add('m', at(flat(at(cone(0.085, 0.12, steel, 4), 0, 0, 0, PI, PI / 4, 0), 0.3), 0, 1.44, 0));
    if (tier > 0) for (const s of [1, -1]) add('m', at(flat(at(cone(0.04, 0.26, steel, 4), 0, 0, 0, 0, PI / 4, 0), 0.4), 0, 1.6, s * 0.1, s * 0.9, 0, 0));
    add('c', at(cone(0.06, 0.2, P.c1, 8), 0, 1.33, 0, PI, 0, 0));
    add('g', at(box(0.012, 0.44, 0.012, glow), 0, 1.74, 0.045)); add('g', at(box(0.012, 0.44, 0.012, glow), 0, 1.74, -0.045));
    add('g', at(sph(0.028, glow, 6, 5), 0, 1.45, 0.035));
    tip = [0, 2.02 + tier * 0.05, 0]; base = [0, 1.42, 0]; two = true; grip = [0, 0.5, 0];
  } else if (type === 'twin') {
    const len = 0.66 + tier * 0.05;
    add('c', at(cyl(0.02, 0.02, 0.2, '#1c1a22', 8), 0, 0, 0));
    add('m', at(box(0.036, 0.022, 0.11, gold), 0, 0.105, 0));
    add('m', at(box(0.016, len * 0.85, 0.062, steel), 0, 0.115 + len * 0.425, 0));
    add('m', at(flat(at(cone(0.031, len * 0.17, steel, 4), 0, 0, 0, 0, PI / 4, 0), 0.36), 0, 0.115 + len * 0.93, 0, 0, 0, 0, 1, 1, 1.42));
    add('g', at(box(0.02, len * 0.85, 0.012, glow), 0, 0.12 + len * 0.42, 0.031));
    tip = [0, 0.115 + len, 0]; base = [0, 0.18, 0]; dual = true;
  } else if (type === 'hammer') {
    const hs = 1 + tier * 0.1;
    add('c', at(cyl(0.028, 0.03, 1.75, '#3d2a1e', 8), 0, 0.45, 0));
    add('m', at(cyl(0.04, 0.04, 0.08, gold, 8), 0, -0.42, 0));
    add('m', at(box(0.3 * hs, 0.34 * hs, 0.58 * hs, P.metal), 0, 1.34, 0));
    for (const s of [1, -1]) { add('m', at(box(0.33 * hs, 0.37 * hs, 0.07, gold), 0, 1.34, s * 0.21 * hs)); add('m', at(box(0.24 * hs, 0.28 * hs, 0.04, steel), 0, 1.34, s * 0.3 * hs)); }
    add('m', at(cone(0.06, 0.16, gold, 6), 0, 1.34 + 0.25 * hs, 0));
    add('g', at(box(0.312 * hs, 0.14, 0.14, glow), 0, 1.34, 0));
    tip = [0, 1.5, 0.12]; base = [0, 0.9, 0]; two = true; grip = [0, 0.5, 0];
  } else if (type === 'axe') {
    add('c', at(cyl(0.026, 0.028, 1.9, '#2e221c', 8), 0, 0.45, 0));
    add('m', at(extrude([[0.02, 0.95], [0.4, 0.82], [0.52, 1.02], [0.54, 1.22], [0.5, 1.42], [0.38, 1.62], [0.02, 1.48]], 0.03, steel), 0, 0, 0, 0, -PI / 2, 0));
    add('m', at(extrude([[0.0, 1.1], [0.24, 1.22], [0.0, 1.34]], 0.03, steel), 0, 0, 0, 0, PI / 2, 0));
    add('m', at(cyl(0.05, 0.05, 0.6, gold, 8), 0, 1.22, 0));
    add('m', at(cone(0.045, 0.22, steel, 6), 0, 1.62, 0));
    add('g', at(box(0.034, 0.5, 0.02, glow), 0, 1.22, 0.3));
    tip = [0, 1.25, 0.54]; base = [0, 0.95, 0]; two = true; grip = [0, 0.5, 0];
  } else if (type === 'fan') {
    const R = 0.56 + tier * 0.05, pts = [[0, 0]];
    for (let i = 0; i <= 10; i++) { const a = (32 + i * 11.6) * PI / 180; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
    add('c', at(extrude(pts, 0.012, P.c1), 0, 0, 0, 0, -PI / 2, 0));
    const inner = [[0, 0]]; for (let i = 0; i <= 10; i++) { const a = (32 + i * 11.6) * PI / 180; inner.push([Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55]); }
    add('c', at(extrude(inner, 0.016, P.c2), 0, 0, 0, 0, -PI / 2, 0));
    for (let i = 0; i <= 5; i++) { const a = (32 + i * 23.2) * PI / 180; add('m', at(box(0.02, R, 0.012, gold), 0, Math.sin(a) * R * 0.5, Math.cos(a) * R * 0.5, -(a - PI / 2), 0, 0)); }
    add('g', at(torus(R, 0.013, glow, 4, 14, 116 * PI / 180), 0, 0, 0, 0, -PI / 2, 32 * PI / 180));
    add('m', at(sph(0.03, gold, 6, 5), 0, 0, 0));
    tip = [0, R, 0]; base = [0, 0.12, 0]; dual = true;
  } else if (type === 'scythe') {
    add('c', at(cyl(0.022, 0.026, 2.15, '#1b1620', 8), 0, 0.45, 0));
    add('m', at(cone(0.03, 0.12, steel, 6), 0, -0.68, 0, PI, 0, 0));
    const pts = [], bs = 1 + tier * 0.08;
    for (let i = 0; i <= 8; i++) { const a = (96 - i * 10) * PI / 180; pts.push([Math.cos(a) * 0.9 * bs, 0.55 + Math.sin(a) * 0.9 * bs]); }
    pts.push([0.99 * bs, 0.55 + 0.08 * bs]);
    for (let i = 8; i >= 0; i--) { const a = (98 - i * 10.5) * PI / 180; pts.push([Math.cos(a) * 0.72 * bs, 0.6 + Math.sin(a) * 0.74 * bs]); }
    add('m', at(extrude(pts, 0.022, steel), 0, 0, 0, 0, -PI / 2, 0));
    add('m', at(cyl(0.045, 0.04, 0.2, gold, 8), 0, 1.42, 0));
    add('m', at(cone(0.035, 0.2, gold, 6), 0, 1.62, 0));
    for (let i = 1; i <= 7; i++) { const a = (96 - i * 10) * PI / 180; add('g', at(sph(0.02, glow, 5, 4), 0, 0.575 + Math.sin(a) * 0.81 * bs, Math.cos(a) * 0.81 * bs)); }
    add('g', at(sph(0.035, glow, 6, 5), 0, 1.42, 0.05));
    tip = [0, 0.63, 0.97 * bs]; base = [0, 1.46, 0]; two = true; grip = [0, 0.5, 0];
  }
  return { parts, tip, base, two, dual, grip };
}

function hairAndGear(B, L, P, J, dang, G) {
  const h = P.hair, hy = 0.135, add = (k, g) => B.add('head', k, g);
  const top = () => add('c', at(sph(0.134, h, 12, 6, 0, 0, TAU, 0, 1.15), 0, hy + 0.012, -0.004, 0, 0, 0, 0.97, 1.06, 1.03));
  const back = (len = 2.3) => add('c', at(sph(0.138, h, 10, 8, 0, PI, PI, 0, len), 0, hy + 0.008, -0.004, 0, 0, 0, 0.97, 1.06, 1.03));
  const bangs = (n = 5, len = 0.085) => {
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1) - 0.5) * 2, a = u * 1.0;
      add('c', at(cone(0.036, len * (1 - 0.2 * Math.abs(u) + (i % 2) * 0.18), h, 5), Math.sin(a) * 0.117, hy + 0.078 - Math.abs(u) * 0.022, Math.cos(a) * 0.117, PI + 0.22, a, u * 0.25));
    }
  };
  const sides = (len = 0.16) => { for (const s of [1, -1]) add('c', at(caps(0.03, len, h, 6, 2), s * 0.118, hy - 0.02, 0.03, 0.1, 0, s * 0.1)); };
  const tail = (x, y, z, n, r0, seg, rest, opt) => chain(J, dang, 'head', 'hair' + dang.length + '_', x, y, z, 0, n, seg, (i, key) => {
    const r = r0 * (1 - i / (n + 0.6));
    B.add(key, 'c', at(caps(r, seg * 0.8, h, 6, 2), 0, -seg * 0.5, 0, 0, 0, 0, opt && opt.flat ? 2.2 : 1, 1, 1));
  }, { rest, k: 0.7, amp: 0.12, freq: 3.6, ...(opt || {}) });

  switch (L.hair) {
    case 'spiky': {
      top(); back(2.2); bangs(5, 0.09);
      const sp = [[0, 0.27, -0.01, -0.45, 0], [0.075, 0.25, -0.02, -0.55, 0.6], [-0.075, 0.25, -0.02, -0.55, -0.6], [0, 0.22, -0.1, -1.15, 0], [0.095, 0.19, -0.08, -1.05, 0.9],
        [-0.095, 0.19, -0.08, -1.05, -0.9], [0, 0.13, -0.14, -1.7, 0], [0.06, 0.26, 0.045, 0.25, 0.4], [-0.06, 0.26, 0.045, 0.25, -0.4], [0.11, 0.12, -0.09, -1.5, 1.1], [-0.11, 0.12, -0.09, -1.5, -1.1]];
      for (const [x, y, z, rx, ry] of sp) add('c', at(cone(0.052, 0.18, h, 5), x, y, z, rx, ry, 0));
      break;
    }
    case 'pony': top(); back(2.1); bangs(5, 0.1); sides(0.2); add('c', at(sph(0.05, h, 8, 6), 0, 0.24, -0.11)); tail(0, 0.24, -0.13, 5, 0.055, 0.17, [1.0, 0.25, 0.15, 0.1, 0.1]); break;
    case 'long': top(); back(2.4); bangs(6, 0.1); sides(0.24); tail(0, 0.1, -0.115, 3, 0.07, 0.21, [0.12, 0.06, 0.05], { flat: true, k: 0.5 }); break;
    case 'twin': top(); back(2.2); bangs(5, 0.095); sides(0.14);
      for (const s of [1, -1]) { add('c', at(sph(0.045, h, 8, 6), s * 0.125, 0.2, -0.04)); tail(s * 0.14, 0.2, -0.05, 4, 0.05, 0.17, [0.35, 0.12, 0.1, 0.08]); }
      break;
    case 'bob': top(); back(2.35); bangs(6, 0.095); sides(0.17); break;
    case 'short': top(); back(2.1); bangs(5, 0.07); break;
    case 'bald': break;
    default: top(); back(2.1);
  }
  if (L.beard) { add('c', at(sph(0.1, h, 8, 6, 0, 0.1 * PI, 0.8 * PI, 1.75, 0.9), 0, hy + 0.005, 0.012, 0, 0, 0, 1, 1.25, 1)); add('c', at(cone(0.06, 0.13, h, 6), 0, hy - 0.16, 0.085, PI - 0.25, 0, 0)); }

  const gear = L.gear || '';
  if (gear.includes('band')) {
    add('c', at(torus(0.129, 0.015, P.c1, 6, 16), 0, hy + 0.048, 0, PI / 2, 0, 0));
    add('c', at(sph(0.028, P.c1, 6, 5), 0, hy + 0.045, -0.135));
    for (const s of [1, -1]) chain(J, dang, 'head', 'rib' + s + '_', s * 0.02, hy + 0.04, -0.14, s * 0.3, 3, 0.15, (i, key) => B.add(key, 'c', at(box(0.045, 0.15, 0.008, P.c1), 0, -0.075, 0)), { rest: [0.7, 0.15, 0.1], k: 0.9, amp: 0.2, freq: 5 });
  }
  if (gear.includes('kabuto')) {
    add('m', at(sph(0.148, P.metal, 12, 6, 0, 0, TAU, 0, 1.42), 0, hy + 0.02, 0, 0, 0, 0, 1, 1.05, 1.05));
    add('m', at(box(0.21, 0.014, 0.09, P.metal), 0, hy + 0.052, 0.135, 0.3, 0, 0));
    add('c', at(sph(0.19, P.c1, 12, 3, 0, 0.72 * PI, 1.56 * PI, 1.3, 0.75), 0, hy + 0.03, -0.005));
    add('m', at(torus(0.1, 0.013, P.gold, 5, 12, PI), 0, hy + 0.2, 0.125, -0.15, 0, PI));
    add('m', at(sph(0.02, P.gold, 6, 5), 0, hy + 0.1, 0.15));
  }
  if (gear.includes('horn')) {
    if (!gear.includes('kabuto')) add('m', at(sph(0.142, P.metal, 12, 5, 0, 0, TAU, 0, 1.05), 0, hy + 0.02, 0, 0, 0, 0, 1, 1.03, 1.03));
    const big = gear.includes('hornbig') ? 1.6 : 1;
    for (const s of [1, -1]) {
      add('c', at(cone(0.04 * big, 0.2 * big, '#e9dcc2', 6), s * 0.13, hy + 0.13, 0, 0, 0, -s * 0.95));
      add('c', at(cone(0.028 * big, 0.14 * big, '#e9dcc2', 6), s * (0.2 + 0.07 * big), hy + 0.24 + 0.05 * big, 0, 0, 0, -s * 0.25));
    }
  }
  if (gear.includes('tiara')) {
    add('m', at(torus(0.122, 0.011, P.gold, 5, 14, PI), 0, hy + 0.062, 0, PI / 2, 0, 0));
    add('g', at(sph(0.02, G, 6, 5), 0, hy + 0.075, 0.122));
    add('m', at(cone(0.016, 0.06, P.gold, 4), 0, hy + 0.11, 0.118));
  }
  if (gear.includes('flower')) {
    for (let i = 0; i < 5; i++) { const a = i * TAU / 5; add('c', at(sph(0.026, P.c3, 6, 5), 0.118 + 0.01, hy + 0.09 + Math.sin(a) * 0.035, 0.05 + Math.cos(a) * 0.035, 0, 0, 0, 0.5, 1, 1)); }
    add('g', at(sph(0.018, G, 6, 5), 0.135, hy + 0.09, 0.05));
  }
  if (gear.includes('mask')) add('c', at(sph(0.132, P.c2, 10, 5, 0, 0.13 * PI, 0.74 * PI, 1.68, 0.95), 0, hy + 0.002, 0.004, 0, 0, 0, 0.97, 1.08, 1.02));
  if (gear.includes('hood')) {
    add('c', at(sph(0.152, P.c1, 12, 8, 0, 0.82 * PI, 1.36 * PI, 0, 2.15), 0, hy + 0.012, -0.012, 0, 0, 0, 1, 1.06, 1.05));
    add('c', at(sph(0.153, P.c1, 10, 4, 0, 0, TAU, 0, 0.95), 0, hy + 0.014, 0.004, 0, 0, 0, 1, 1.06, 1.05));
  }
  if (gear.includes('crown')) {
    add('m', at(cyl(0.1, 0.092, 0.05, P.gold, 10, 0, true), 0, hy + 0.125, 0));
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; add('m', at(cone(0.02, 0.07, P.gold, 4), Math.sin(a) * 0.095, hy + 0.18, Math.cos(a) * 0.095)); }
    add('g', at(sph(0.022, G, 6, 5), 0, hy + 0.13, 0.1));
  }
  if (gear.includes('demon')) for (const s of [1, -1]) { add('c', at(cone(0.022, 0.12, '#2a1830', 5), s * 0.075, hy + 0.14, 0.06, 0.5, 0, -s * 0.35)); add('g', at(sph(0.013, G, 5, 4), s * 0.098, hy + 0.2, 0.09)); }
}

// 武将モデル生成。look: 見た目定義 / wtype: 武器種 / tier: 武器の格(0-2)
export function buildHero(look, wtype, tier = 0) {
  const L = Object.assign({ scale: 1, sw: 0.25, bulk: 1, fem: false, hair: 'short', gear: '', cape: '', pauldron: 1, tasset: 'plate', tails: 0, arms: 'sleeve', beard: false, fur: false }, look);
  const P = Object.assign({ skin: '#f0c8a0', hair: '#2a1a14', c1: '#a02020', c2: '#22202a', c3: '#d8a43c', metal: '#70788a', gold: '#e2b24a', glow: [3, 1, 0.3], eye: '#2a1810', boot: '#2a2420' }, L.pal);
  const bk = L.bulk, sw = L.sw;
  const J = skeleton(L), B = new Builder(), dang = [];
  const M = {
    c: patchMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }), 0.55),
    m: patchMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.6 }), 0.4),
    g: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };

  // 腰・胴(デフォルメ寄りの太めの体型)
  const og = [P.glow[0] * 0.32, P.glow[1] * 0.32, P.glow[2] * 0.32];
  B.add('hips', 'c', at(caps(0.136 * bk, 0.1, P.c2, 8, 3), 0, -0.02, 0, 0, 0, PI / 2, 1, 1, 0.88));
  B.add('hips', 'c', at(cyl(0.172 * bk, 0.18 * bk, 0.075, P.c3, 12), 0, 0.06, 0, 0, 0, 0, 1, 1, 0.84));
  B.add('hips', 'm', at(box(0.09, 0.072, 0.03, P.gold), 0, 0.06, 0.148 * bk));
  B.add('spine', 'c', at(caps(0.142 * bk, 0.1, P.c1, 10, 3), 0, 0.1, 0, 0, 0, 0, 1.14, 1, 0.82));
  B.add('chest', 'c', at(caps(0.16 * bk, 0.1, P.c1, 10, 4), 0, 0.14, 0, 0, 0, 0, L.fem ? 1.1 : 1.28, 1, 0.84));
  B.add('chest', 'c', at(cyl(0.052, 0.06, 0.1, P.skin, 8), 0, 0.33, 0));
  for (const s of [1, -1]) B.add('chest', 'c', at(sph(0.098 * bk, L.arms === 'bare' ? P.skin : P.c1, 8, 6), s * sw, 0.27, 0));
  B.add('chest', 'm', at(sph(0.174 * bk, P.metal, 12, 6, 0, 0, PI, 0.4, 1.45), 0, 0.16, 0.024, 0, 0, 0, L.fem ? 1.05 : 1.22, 1, 0.84));
  B.add('chest', 'm', at(sph(0.176 * bk, P.gold, 12, 2, 0, 0, PI, 1.72, 0.16), 0, 0.16, 0.026, 0, 0, 0, L.fem ? 1.05 : 1.22, 1, 0.84));
  B.add('chest', 'm', at(box(0.06, 0.06, 0.02, P.gold), 0, 0.2, 0.15 * bk, 0, 0, PI / 4));
  B.add('chest', 'g', at(sph(0.02, og, 6, 5), 0, 0.2, 0.162 * bk));
  B.add('chest', 'c', at(torus(0.088, 0.026, P.c3, 6, 12), 0, 0.305, 0, PI / 2, 0, 0));
  if (L.fur) B.add('chest', 'c', at(torus(0.18 * bk, 0.075, '#d9cdb8', 6, 12), 0, 0.29, -0.01, PI / 2, 0, 0, 1.25, 0.9, 1));

  // 頭部(大きめ)
  J.head.scale.setScalar(L.headScale || 1.2);
  B.add('head', 'c', at(sph(0.125, P.skin, 14, 10), 0, 0.135, 0, 0, 0, 0, 0.96, 1.06, 1.0));
  for (const s of [1, -1]) {
    B.add('head', 'c', at(sph(0.027, P.eye, 8, 6), s * 0.05, 0.14, 0.103, 0, 0, 0, 1, L.fem ? 1.5 : 1.2, 0.5));
    B.add('head', 'c', at(sph(0.009, '#ffffff', 5, 4), s * 0.058, 0.153, 0.117));
    B.add('head', 'c', at(box(0.056, 0.012, 0.012, P.hair), s * 0.05, 0.19, 0.109, 0, 0, -s * (L.fem ? 0.1 : 0.28)));
  }
  B.add('head', 'c', at(sph(0.012, P.skin, 6, 5), 0, 0.118, 0.124));
  hairAndGear(B, L, P, J, dang, og);

  // 腕
  for (const [s, A, F] of [[1, 'armL', 'foreL'], [-1, 'armR', 'foreR']]) {
    const sl = L.arms === 'bare' ? P.skin : P.c1, hand = L.arms === 'bare' ? P.skin : P.c2;
    B.add(A, 'c', at(caps(0.074 * bk, 0.15, sl, 8, 3), 0, -0.145, 0));
    B.add(A, 'c', at(sph(0.07 * bk, sl, 8, 6), 0, -0.29, 0));
    B.add(F, 'c', at(caps(0.064 * bk, 0.13, hand, 8, 3), 0, -0.125, 0));
    B.add(F, 'm', at(cyl(0.079 * bk, 0.069 * bk, 0.15, P.metal, 8), 0, -0.15, 0));
    B.add(F, 'm', at(cyl(0.082 * bk, 0.082 * bk, 0.025, P.gold, 8), 0, -0.08, 0));
    B.add(F, 'c', at(sph(0.066 * bk, hand, 8, 6), 0, -0.295, 0, 0, 0, 0, 0.9, 1.1, 1));
    if (L.pauldron > 0) {
      const ps = bk * (L.pauldron === 2 ? 1.4 : 1.12);
      B.add(A, 'm', at(sph(0.118 * ps, P.metal, 10, 5, 0, 0, TAU, 0, 1.5), s * 0.03, 0.01, 0, 0, 0, -s * 0.4, 1.1, 0.85, 1.15));
      B.add(A, 'm', at(sph(0.13 * ps, P.gold, 10, 3, 0, 0, TAU, 1.25, 0.32), s * 0.03, 0.01, 0, 0, 0, -s * 0.4, 1.1, 0.85, 1.15));
      if (L.pauldron === 2) B.add(A, 'm', at(cone(0.04, 0.16, P.gold, 6), s * 0.11, 0.11, 0, 0, 0, -s * 0.8));
    }
  }

  // 脚
  for (const [s, T, S] of [[1, 'legL', 'shinL'], [-1, 'legR', 'shinR']]) {
    B.add(T, 'c', at(caps(0.1 * bk, 0.22, P.c2, 8, 3), 0, -0.21, 0));
    B.add(T, 'c', at(sph(0.086 * bk, P.c2, 8, 6), 0, -0.44, 0));
    B.add(S, 'c', at(caps(0.08 * bk, 0.24, P.boot, 8, 3), 0, -0.2, 0));
    B.add(S, 'm', at(cyl(0.093 * bk, 0.077 * bk, 0.25, P.metal, 8), 0, -0.2, 0.004));
    B.add(S, 'm', at(sph(0.076 * bk, P.gold, 8, 5), 0, -0.035, 0.046, 0, 0, 0, 1, 1, 0.7));
    B.add(S, 'c', at(caps(0.07 * bk, 0.15, P.boot, 8, 3), 0, -0.44, 0.062, PI / 2, 0, 0));
  }

  // 腰鎧
  if (L.tasset === 'plate') {
    for (const a of [0.62, -0.62, 1.62, -1.62, PI]) {
      // 曲面の板(平面だと反射で白飛びするため)
      B.add('hips', 'm', at(col(new THREE.CylinderGeometry(0.185 * bk, 0.235 * bk, 0.22, 5, 1, true, a - 0.42, 0.84), P.metal), 0, -0.09, 0, 0, 0, 0, 1, 1, 0.84));
      B.add('hips', 'm', at(col(new THREE.CylinderGeometry(0.24 * bk, 0.24 * bk, 0.028, 5, 1, true, a - 0.44, 0.88), P.gold), 0, -0.2, 0, 0, 0, 0, 1, 1, 0.84));
    }
  }
  // 垂れ布
  const tailAng = { 0: [], 1: [PI], 2: [2.45, -2.45], 3: [2.2, -2.2, PI], 4: [1.35, -1.35, 2.6, -2.6], 5: [0.5, -0.5, 1.7, -1.7, PI] }[L.tails] || [];
  tailAng.forEach((a, i) => {
    const backness = 0.5 - 0.5 * Math.cos(a), len = L.tailLen || 0.3;
    chain(J, dang, 'hips', 'tail' + i + '_', Math.sin(a) * 0.166 * bk, 0.0, Math.cos(a) * 0.138 * bk, a, 2, len, (j, key) => {
      B.add(key, 'c', at(box(0.23 * bk + j * 0.035, len, 0.014, P.c1), 0, -len / 2, 0));
      if (j === 1) B.add(key, 'c', at(box(0.27 * bk, 0.034, 0.018, P.c3), 0, -len + 0.017, 0));
    }, { rest: [0.2, 0.05], sign: -1, k: 0.25 + 0.6 * backness, amp: 0.05, freq: 2.6, back: backness });
  });
  // マント・スカーフ
  if (L.cape === 'long' || L.cape === 'short') {
    const n = L.cape === 'long' ? 4 : 2, sl = 0.3;
    chain(J, dang, 'chest', 'cape', 0, 0.3, -0.138 * bk, 0, n, sl, (i, key) => {
      B.add(key, 'c', at(box(0.5 * bk + i * 0.08, sl, 0.014, P.cape || P.c1), 0, -sl / 2, 0));
      if (i === n - 1) B.add(key, 'c', at(box(0.5 * bk + i * 0.08 + 0.02, 0.04, 0.018, P.c3), 0, -sl + 0.02, 0));
    }, { rest: [0.3, 0.07, 0.05, 0.05], k: 1.0, amp: 0.07, freq: 2.4 });
    for (const s of [1, -1]) B.add('chest', 'm', at(sph(0.034, P.gold, 6, 5), s * 0.15 * bk, 0.3, -0.07));
  } else if (L.cape === 'scarf') {
    B.add('chest', 'c', at(torus(0.095, 0.045, P.cape || P.c1, 6, 12), 0, 0.325, 0, PI / 2, 0, 0, 1, 1, 1.1));
    for (const s of [1, -1]) chain(J, dang, 'chest', 'scarf' + s + '_', s * 0.05, 0.31, -0.1, s * 0.22, 4, 0.21, (i, key) => {
      B.add(key, 'c', at(box(0.1 - i * 0.009, 0.21, 0.012, P.cape || P.c1), 0, -0.105, 0));
    }, { rest: [0.75, 0.2, 0.12, 0.1], k: 1.1, amp: 0.2, freq: 4.4 });
  }

  // 武器
  const W = buildWeapon(wtype, tier, P);
  const wb = {}; for (const p of W.parts) (wb[p.k] || (wb[p.k] = [])).push(p.g);
  const wMeshes = [];
  for (const k in wb) {
    const geo = merge(wb[k]);
    const m = new THREE.Mesh(geo, M[k]); m.castShadow = true; J.handR.add(m); wMeshes.push(m);
    if (W.dual) { const m2 = new THREE.Mesh(geo, M[k]); m2.castShadow = true; J.handL.add(m2); wMeshes.push(m2); }
  }
  B.build(J, M);
  J.root.scale.setScalar(L.scale);

  return {
    root: J.root, J, M, dang, scale: L.scale, wtype, two: W.two, dual: W.dual,
    tip: new THREE.Vector3(...W.tip), base: new THREE.Vector3(...W.base), grip: new THREE.Vector3(...W.grip),
    rest: { ...RESTS[wtype], ...REST_COMMON }, height: 1.95 * L.scale, glow: P.glow,
    restTan: W.two ? new THREE.Vector3(0.75, 0, 0.66).normalize() : new THREE.Vector3(0, 0, 1),
  };
}

export function disposeModel(model) {
  model.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  for (const k in model.M) model.M[k].dispose();
  if (model.root.parent) model.root.parent.remove(model.root);
}

// ---- 雑兵(インスタンス描画用パーツ。原点は各関節) ----
export function soldierGeos() {
  const skin = '#e2b48c', dark = '#262220', steel = '#aeb7c2', wood = '#5d412b', W = '#ffffff', wrap = '#d6c9ae';
  const torso = merge([
    at(caps(0.2, 0.3, W, 8, 2, 1), 0, 1.1, 0, 0, 0, 0, 1.18, 1, 0.84),
    at(cyl(0.21, 0.3, 0.26, W, 8, 1), 0, 0.84, 0, 0, 0, 0, 1.12, 1, 0.86),
    at(sph(0.214, steel, 10, 4, 0, 0, TAU, 0.6, 1.1), 0, 1.13, 0, 0, 0, 0, 1.17, 0.95, 0.87),
    at(cyl(0.226, 0.226, 0.075, dark, 8), 0, 0.95, 0, 0, 0, 0, 1.14, 1, 0.86),
    at(sph(0.105, steel, 6, 4), 0.29, 1.33, 0, 0, 0, 0, 1, 0.7, 1), at(sph(0.105, steel, 6, 4), -0.29, 1.33, 0, 0, 0, 0, 1, 0.7, 1),
    at(cyl(0.075, 0.085, 0.1, skin, 6), 0, 1.4, 0),
  ]);
  const head = merge([
    at(sph(0.14, skin, 9, 7), 0, 0.1, 0),
    at(cone(0.29, 0.17, W, 9, 1), 0, 0.245, 0),
    at(cyl(0.292, 0.292, 0.024, dark, 9), 0, 0.162, 0),
    at(cyl(0.035, 0.035, 0.035, steel, 6), 0, 0.33, 0),
    at(box(0.05, 0.036, 0.03, dark), 0.056, 0.105, 0.126), at(box(0.05, 0.036, 0.03, dark), -0.056, 0.105, 0.126),
  ]);
  const arm = () => [at(caps(0.068, 0.28, W, 6, 2, 1), 0, -0.19, 0), at(cyl(0.076, 0.07, 0.14, dark, 6), 0, -0.35, 0), at(sph(0.066, skin, 6, 4), 0, -0.46, 0)];
  const armL = merge(arm());
  const armSword = merge([...arm(),
    at(box(0.022, 0.065, 0.78, steel), 0, -0.36, 0.4, -0.35, 0, 0),
    at(box(0.03, 0.12, 0.03, dark), 0, -0.47, 0.03, -0.35, 0, 0)]);
  const armSpear = merge([...arm(),
    at(cyl(0.018, 0.018, 2.2, wood, 5), 0, -0.4, 0.45, PI / 2 - 0.2, 0, 0),
    at(cone(0.045, 0.3, steel, 5), 0, -0.4 + Math.sin(0.2) * 1.25, 0.45 + Math.cos(0.2) * 1.25, PI / 2 - 0.2, 0, 0)]);
  const leg = merge([at(caps(0.088, 0.24, dark, 6, 2), 0, -0.2, 0), at(caps(0.076, 0.22, wrap, 6, 2), 0, -0.54, 0), at(caps(0.07, 0.11, dark, 6, 2), 0, -0.735, 0.056, PI / 2, 0, 0)]);
  return { torso, head, armL, armSword, armSpear, leg };
}
