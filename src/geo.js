// ジオメトリ生成ヘルパー(頂点カラー付きプリミティブ+結合)
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// 頂点カラーとチーム色マスクを設定
export function col(geo, color, mask = 0) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3), m = new Float32Array(n);
  if (Array.isArray(color)) _c.setRGB(color[0], color[1], color[2]); else _c.set(color);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; m[i] = mask; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.setAttribute('tintMask', new THREE.BufferAttribute(m, 1));
  return geo;
}

// 配置(回転は Y→X→Z の順)
export function at(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy, sz) {
  if (sy === undefined) { sy = sx; sz = sx; }
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

export function merge(list) {
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(vc * 3), N = new Float32Array(vc * 3), C = new Float32Array(vc * 3), M = new Float32Array(vc);
  const I = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, m = g.attributes.tintMask, cnt = p.count;
    P.set(p.array.subarray(0, cnt * 3), vo * 3);
    if (n) N.set(n.array.subarray(0, cnt * 3), vo * 3);
    if (c) C.set(c.array.subarray(0, cnt * 3), vo * 3); else C.fill(1, vo * 3, (vo + cnt) * 3);
    if (m) M.set(m.array.subarray(0, cnt), vo);
    if (g.index) { const ia = g.index.array; for (let i = 0; i < ia.length; i++) I[io++] = ia[i] + vo; }
    else for (let i = 0; i < cnt; i++) I[io++] = vo + i;
    vo += cnt;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setAttribute('tintMask', new THREE.BufferAttribute(M, 1));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  return out;
}

export const box = (w, h, d, c, mk = 0) => col(new THREE.BoxGeometry(w, h, d), c, mk);
export const sph = (r, c, ws = 10, hs = 8, mk = 0, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => col(new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl), c, mk);
export const cyl = (rt, rb, h, c, seg = 8, mk = 0, open = false) => col(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), c, mk);
export const cone = (r, h, c, seg = 8, mk = 0) => col(new THREE.ConeGeometry(r, h, seg), c, mk);
export const caps = (r, len, c, rs = 8, cs = 3, mk = 0) => col(new THREE.CapsuleGeometry(r, len, cs, rs), c, mk);
export const torus = (R, r, c, rs = 6, ts = 14, arc = Math.PI * 2, mk = 0) => col(new THREE.TorusGeometry(R, r, rs, ts, arc), c, mk);
export const ico = (r, c, detail = 1, mk = 0) => col(new THREE.IcosahedronGeometry(r, detail), c, mk);
export const lathe = (pts, c, seg = 10, mk = 0) => col(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg), c, mk);

// 2Dシェイプ押し出し(pts: [[x,y],...])
export function extrude(pts, depth, c, mk = 0) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -depth / 2);
  return col(g, c, mk);
}

// 面ごとに法線を割る(岩など)+頂点ゆらぎ
export function facet(geo, jitter = 0, seedFn = Math.random) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (jitter > 0) {
    const p = g.attributes.position, map = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = Math.round(p.getX(i) * 100) + ',' + Math.round(p.getY(i) * 100) + ',' + Math.round(p.getZ(i) * 100);
      let o = map.get(k);
      if (!o) { o = [(seedFn() - 0.5) * jitter, (seedFn() - 0.5) * jitter, (seedFn() - 0.5) * jitter]; map.set(k, o); }
      p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
    }
  }
  g.computeVertexNormals();
  return g;
}
