// 雑兵の頂点アニメーションを焼き付ける(Quaternius CC0 キャラ → soldier.bin)
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import fs from 'node:fs';
globalThis.self = globalThis;
const [src, out] = process.argv.slice(2);
const buf = fs.readFileSync(src);
const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
obj.updateMatrixWorld(true);
let m; obj.traverse(o => { if (o.isSkinnedMesh) m = o; });
const S = 1.8 / 310;
const PAL = { Skin: ['#f1c6a0', 0], Main: ['#ffffff', 1], Details: ['#3a3440', 0], Grey: ['#8d939e', 0], Face: ['#1b1418', 0], Clothes: ['#ffffff', 1], Band: ['#c9a14a', 0], Black: ['#26232a', 0], Helmet: ['#ffffff', 1], DarkGreen: ['#3a3f2a', 0] };
const g0 = m.geometry.clone();
const n0 = g0.attributes.position.count;
const col = new Float32Array(n0 * 3), mask = new Float32Array(n0), wid = new Float32Array(n0);
const mats = [].concat(m.material), c = new THREE.Color();
for (const gr of g0.groups) {
  const [hex, mk] = PAL[mats[gr.materialIndex].name] || ['#888888', 0]; c.set(hex);
  for (let i = gr.start; i < gr.start + gr.count; i++) { col.set([c.r, c.g, c.b], i * 3); mask[i] = mk; }
}
g0.setAttribute('color', new THREE.BufferAttribute(col, 3)); g0.setAttribute('mask', new THREE.BufferAttribute(mask, 1)); g0.setAttribute('wid', new THREE.BufferAttribute(wid, 1));
g0.deleteAttribute('normal'); g0.deleteAttribute('uv'); g0.clearGroups();
// 武器(右拳に固定): ワールドのバインド姿勢で作ってメッシュ空間へ
const bones = m.skeleton.bones, fi = bones.findIndex(b => b.name === 'FistR');
const fist = bones[fi].getWorldPosition(new THREE.Vector3());
const inv = new THREE.Matrix4().copy(m.matrixWorld).invert();
const dir = new THREE.Vector3(0, 0.35, 1).normalize();
function weapon(parts, id) {
  const geos = [];
  for (const [geo, hex, along, off] of parts) {
    geo.rotateX(Math.PI / 2);                      // Y軸 → Z軸
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    geo.applyQuaternion(q); geo.translate(fist.x + dir.x * along + off[0], fist.y + dir.y * along + off[1], fist.z + dir.z * along + off[2]);
    geo.applyMatrix4(inv);
    const gg = geo.index ? geo.toNonIndexed() : geo; gg.deleteAttribute('normal'); gg.deleteAttribute('uv');
    const n = gg.attributes.position.count; c.set(hex);
    const cc = new Float32Array(n * 3); for (let i = 0; i < n; i++) cc.set([c.r, c.g, c.b], i * 3);
    gg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); gg.setAttribute('mask', new THREE.BufferAttribute(new Float32Array(n), 1));
    gg.setAttribute('wid', new THREE.BufferAttribute(new Float32Array(n).fill(id), 1));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) { si[i * 4] = fi; sw[i * 4] = 1; }
    gg.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); gg.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geos.push(gg);
  }
  return geos;
}
const U = 1 / S; // メートル → 元単位
const sword = weapon([[new THREE.BoxGeometry(0.035 * U, 0.85 * U, 0.08 * U), '#d8dee8', 0.5 * U, [0, 0, 0]], [new THREE.BoxGeometry(0.05 * U, 0.04 * U, 0.2 * U), '#c9a14a', 0.06 * U, [0, 0, 0]], [new THREE.CylinderGeometry(0.025 * U, 0.025 * U, 0.2 * U, 6), '#3a2418', -0.04 * U, [0, 0, 0]]], 1);
const spear = weapon([[new THREE.CylinderGeometry(0.022 * U, 0.022 * U, 2.1 * U, 6), '#6b4a2e', 0.45 * U, [0, 0, 0]], [new THREE.ConeGeometry(0.06 * U, 0.32 * U, 4), '#d8dee8', 1.6 * U, [0, 0, 0]]], 2);
// 結合(位置のみで重複頂点を統合)
const all = [g0, ...sword, ...spear];
const attrs = ['position', 'skinIndex', 'skinWeight', 'color', 'mask', 'wid'];
let N = 0; for (const g of all) N += g.attributes.position.count;
const big = new THREE.BufferGeometry();
for (const a of attrs) {
  const ref = g0.attributes[a], arr = new (ref.array.constructor)(N * ref.itemSize); let o = 0;
  for (const g of all) { const s = g.attributes[a]; for (let i = 0; i < s.count * ref.itemSize; i++) arr[o + i] = s.array[i]; o += s.count * ref.itemSize; }
  big.setAttribute(a, new THREE.BufferAttribute(arr, ref.itemSize));
}
const geo = mergeVertices(big, 1e-3);
m.geometry = geo;
const V = geo.attributes.position.count, I = geo.index.array;
// クリップ
const CL = [['idle', 'Idle', 16, true], ['walk', 'Walk', 20, true], ['atk', 'Punch', 16, false], ['hit', 'RecieveHit', 10, false], ['die', 'Defeat', 24, false]];
const mixer = new THREE.AnimationMixer(obj);
const frames = [], clips = {}; let fcount = 0;
const v = new THREE.Vector3();
for (const [key, name, n, loop] of CL) {
  const clip = obj.animations.find(a => a.name.endsWith('|' + name));
  mixer.stopAllAction(); const act = mixer.clipAction(clip); act.reset().play();
  clips[key] = [fcount, n, clip.duration, loop];
  for (let f = 0; f < n; f++) {
    const t = loop ? clip.duration * f / n : clip.duration * f / (n - 1);
    mixer.setTime(0); act.time = t; mixer.update(0);
    obj.updateMatrixWorld(true);
    const P = new Float32Array(V * 3);
    for (let i = 0; i < V; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld).multiplyScalar(S); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
    frames.push(P); fcount++;
  }
}
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const P of frames) for (let i = 0; i < P.length; i++) { const k = i % 3; if (P[i] < mn[k]) mn[k] = P[i]; if (P[i] > mx[k]) mx[k] = P[i]; }
const W = 1024, total = fcount * V, H = Math.ceil(total / W);
const tex = new Uint32Array(W * H);
frames.forEach((P, f) => { for (let i = 0; i < V; i++) { let w = 0; for (let k = 0; k < 3; k++) { const q = Math.round((P[i * 3 + k] - mn[k]) / (mx[k] - mn[k]) * 1023); w |= q << (k * 10); } tex[f * V + i] = w >>> 0; } });
const vc = new Uint8Array(V * 4);
for (let i = 0; i < V; i++) { vc[i * 4] = geo.attributes.color.array[i * 3] * 255; vc[i * 4 + 1] = geo.attributes.color.array[i * 3 + 1] * 255; vc[i * 4 + 2] = geo.attributes.color.array[i * 3 + 2] * 255; vc[i * 4 + 3] = geo.attributes.mask.array[i] * 1 + geo.attributes.wid.array[i] * 2; }
const idx = V > 65535 ? new Uint32Array(I) : new Uint16Array(I);
const head = { V, idxCount: idx.length, idx32: V > 65535, W, H, frames: fcount, clips, min: mn, max: mx };
const hb = Buffer.from(JSON.stringify(head)); const pad = (4 - ((hb.length + 4) % 4)) % 4;
const parts = [Buffer.from(new Uint32Array([hb.length + pad]).buffer), hb, Buffer.alloc(pad, 32), Buffer.from(idx.buffer), Buffer.alloc(idx.byteLength % 4), Buffer.from(vc.buffer), Buffer.from(tex.buffer)];
fs.writeFileSync(out, Buffer.concat(parts));
console.log(JSON.stringify({ V, tris: idx.length / 3, frames: fcount, H, bytes: Buffer.concat(parts).length, min: mn.map(x=>x.toFixed(2)), max: mx.map(x=>x.toFixed(2)) }));
