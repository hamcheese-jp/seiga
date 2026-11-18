// 焼き付け済みの雑兵(assets/soldier*.bin)に、新しい武器を書き足す(元のFBXが無くても足せる)
//   node tools/vat-addweapon.mjs assets/soldier2.bin
// 刀(武器番号1)の頂点の動きから、毎コマの右拳の向きと位置を割り出し、弓(3)・杖(4)・大槌(5)をそれに追従させる
// 既に武器番号3以上がある時は、それを外してから付け直す(何度実行しても同じ結果)
import fs from 'node:fs';

const file = process.argv[2];
const buf = fs.readFileSync(file); const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const hl = new Uint32Array(ab, 0, 1)[0], head = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, hl)));
let o = 4 + hl;
const idx0 = head.idx32 ? new Uint32Array(ab.slice(o, o + head.idxCount * 4)) : new Uint16Array(ab.slice(o, o + head.idxCount * 2));
o += idx0.byteLength; o += idx0.byteLength % 4;
const vc0 = new Uint8Array(ab.slice(o, o + head.V * 4)); o += head.V * 4;
const tex0 = new Uint32Array(ab.slice(o, o + head.W * head.H * 4));
const F = head.frames, V0 = head.V, mn = head.min, mx = head.max;
const pos = (f, i) => { const w = tex0[f * V0 + i]; return [0, 1, 2].map((k) => mn[k] + ((w >> (k * 10)) & 1023) / 1023 * (mx[k] - mn[k])); };
const wid = (i) => vc0[i * 4 + 3] >> 1;

// 前回足した武器(3以上)を外す
const keep = []; for (let i = 0; i < V0; i++) if (wid(i) < 3) keep.push(i);
const remap = new Int32Array(V0).fill(-1); keep.forEach((v, j) => (remap[v] = j));
const tris = []; for (let t = 0; t < idx0.length; t += 3) { const a = remap[idx0[t]], b = remap[idx0[t + 1]], c = remap[idx0[t + 2]]; if (a >= 0 && b >= 0 && c >= 0) tris.push(a, b, c); }

// ベクトル
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.sqrt(dot(a, a)), nrm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// 刀と槍の頂点(最初のコマ)から、刀の向き・拳の位置を求める
const sw = keep.filter((i) => wid(i) === 1), sp = keep.filter((i) => wid(i) === 2);
const P0 = (i) => pos(0, i);
let tipI = sw[0], baseI = sw[0], best = 0;
for (const a of sw) for (const b of sw) { const d = len(sub(P0(a), P0(b))); if (d > best) { best = d; tipI = a; baseI = b; } }
let axis = nrm(sub(P0(tipI), P0(baseI)));
// 槍の重心の方へ伸びる側が切っ先(槍は長く前へ出ている)
const spC = sp.reduce((s, i) => add(s, P0(i)), [0, 0, 0]).map((x) => x / sp.length);
if (dot(sub(spC, P0(baseI)), axis) < 0) { [tipI, baseI] = [baseI, tipI]; axis = mul(axis, -1); }
const spMin = Math.min(...sp.map((i) => dot(P0(i), axis)));
const fistAlong = spMin + 0.6;                                  // 槍は拳から 0.6m 後ろまで伸びている(bake-soldier.mjs)
const base0 = P0(baseI), fist0 = add(base0, mul(axis, fistAlong - dot(base0, axis)));
// 刀の幅の向き(軸から一番離れた頂点)
let sideI = sw[0], sd = 0; for (const i of sw) { const r = sub(P0(i), base0), d = len(sub(r, mul(axis, dot(r, axis)))); if (d > sd) { sd = d; sideI = i; } }
const basis = (f) => { const a = pos(f, baseI), t = pos(f, tipI), s = pos(f, sideI); const e1 = nrm(sub(t, a)); let e2 = sub(s, a); e2 = nrm(sub(e2, mul(e1, dot(e2, e1)))); return [a, e1, e2, cross(e1, e2)]; };
const B0 = basis(0);
const toLocal = (p) => { const r = sub(p, B0[0]); return [dot(r, B0[1]), dot(r, B0[2]), dot(r, B0[3])]; };
const fromLocal = (B, l) => add(B[0], add(mul(B[1], l[0]), add(mul(B[2], l[1]), mul(B[3], l[2]))));

// 新しい武器の形(最初のコマのワールド座標で作る)。箱をつないで作る
const up0 = nrm(sub([0, 1, 0], mul(axis, axis[1])));            // 刀の軸に直角で、上に近い向き
const side0 = nrm(cross(axis, up0));
const newV = [], newC = [], newT = [];
function boxSeg(p, q, w1, w2, col, id, mask = 0) {
  const d = nrm(sub(q, p)); let u = cross(d, up0); if (len(u) < 1e-3) u = cross(d, side0); u = mul(nrm(u), w1); const v = mul(nrm(cross(d, u)), w2);
  const b = newV.length;
  for (const e of [p, q]) for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { newV.push(add(e, add(mul(u, su), mul(v, sv)))); newC.push([...col, mask | (id << 1)]); }
  const F6 = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  for (const [a, c, e, g] of F6) newT.push(b + a, b + c, b + e, b + a, b + e, b + g);
}
const P = (along, upv = 0, sidev = 0) => add(fist0, add(mul(axis, along), add(mul(up0, upv), mul(side0, sidev))));
// 3: 長弓(拳で握り、弓幹は上下へ。先は射手の側へ反る)と弦
{ const n = 10, L = 0.62, pts = []; for (let k = 0; k <= n; k++) { const t = k / n * 2 - 1; pts.push(P(-0.13 * t * t + 0.02, L * t)); }
  for (let k = 0; k < n; k++) boxSeg(pts[k], pts[k + 1], 0.016, 0.016, [58, 34, 22], 3);
  boxSeg(pts[0], pts[n], 0.004, 0.004, [230, 225, 210], 3); }
// 4: 杖(長い柄と光る宝珠)
{ boxSeg(P(-0.55), P(1.15), 0.02, 0.02, [70, 46, 30], 4); boxSeg(P(1.12), P(1.18), 0.035, 0.035, [200, 160, 60], 4);
  boxSeg(P(1.18), P(1.36), 0.08, 0.08, [255, 120, 40], 4); }
// 5: 大槌(太い柄と大きな頭)
{ boxSeg(P(-0.35), P(1.0), 0.026, 0.026, [60, 40, 28], 5); boxSeg(P(0.92, -0.22), P(0.92, 0.22), 0.17, 0.17, [80, 82, 90], 5);
  boxSeg(P(0.92, -0.26), P(0.92, -0.22), 0.12, 0.12, [190, 150, 70], 5); boxSeg(P(0.92, 0.22), P(0.92, 0.26), 0.12, 0.12, [190, 150, 70], 5); }

// 全コマの位置を作り直す(新しい頂点は刀と同じ動きで追従させる)
const newL = newV.map(toLocal), V = keep.length + newV.length;
const frames = [];
const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
for (let f = 0; f < F; f++) {
  const Bf = basis(f), Pf = new Float32Array(V * 3);
  keep.forEach((i, j) => Pf.set(pos(f, i), j * 3));
  newL.forEach((l, j) => Pf.set(fromLocal(Bf, l), (keep.length + j) * 3));
  for (let i = 0; i < Pf.length; i++) { const k = i % 3; if (Pf[i] < lo[k]) lo[k] = Pf[i]; if (Pf[i] > hi[k]) hi[k] = Pf[i]; }
  frames.push(Pf);
}
const W = 1024, H = Math.ceil(F * V / W), tex = new Uint32Array(W * H);
frames.forEach((Pf, f) => { for (let i = 0; i < V; i++) { let w = 0; for (let k = 0; k < 3; k++) w |= Math.round((Pf[i * 3 + k] - lo[k]) / (hi[k] - lo[k]) * 1023) << (k * 10); tex[f * V + i] = w >>> 0; } });
const vc = new Uint8Array(V * 4);
keep.forEach((i, j) => vc.set(vc0.subarray(i * 4, i * 4 + 4), j * 4));
newC.forEach((c, j) => vc.set(c, (keep.length + j) * 4));
const allT = [...tris, ...newT.map((t) => t + keep.length)];
const idx = V > 65535 ? new Uint32Array(allT) : new Uint16Array(allT);
const h2 = { ...head, V, idxCount: idx.length, idx32: V > 65535, W, H, min: lo, max: hi, weapons: { 1: 'sword', 2: 'spear', 3: 'bow', 4: 'staff', 5: 'hammer' } };
const hb = Buffer.from(JSON.stringify(h2)), pad = (4 - ((hb.length + 4) % 4)) % 4;
const out = Buffer.concat([Buffer.from(new Uint32Array([hb.length + pad]).buffer), hb, Buffer.alloc(pad, 32), Buffer.from(idx.buffer), Buffer.alloc(idx.byteLength % 4), Buffer.from(vc.buffer), Buffer.from(tex.buffer)]);
fs.writeFileSync(file, out);
console.log(file, 'V', V0, '->', V, 'frames', F, 'bytes', out.length);
