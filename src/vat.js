// 雑兵の頂点アニメーション(焼き付け済みの動きを数百体まとめて再生)
// データ: assets/soldier.bin(tools/bake-soldier.mjs で Quaternius CC0 キャラから生成)
import * as THREE from 'three';
import { patchMat } from './gfx.js';

let _data = [null, null], _loading = null;
export function preloadSoldier() {
  if (!_loading) _loading = Promise.all(['assets/soldier.bin', 'assets/soldier2.bin'].map((url, i) =>
    fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (_data[i] = b ? parse(b) : null)).catch(() => null)));
  return _loading;
}
export const soldierData = (team = 0) => _data[team] || _data[0];

function parse(buf) {
  const hl = new Uint32Array(buf, 0, 1)[0];
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  let o = 4 + hl;
  const idx = head.idx32 ? new Uint32Array(buf.slice(o, o + head.idxCount * 4)) : new Uint16Array(buf.slice(o, o + head.idxCount * 2));
  o += idx.byteLength; o += idx.byteLength % 4;
  const vc = new Uint8Array(buf.slice(o, o + head.V * 4)); o += head.V * 4;
  const tex = new Uint32Array(buf.slice(o, o + head.W * head.H * 4));
  return { head, idx, vc, tex };
}

const VAT_DECL = `
uniform highp usampler2D uVat; uniform vec3 uVMin; uniform vec3 uVMax; uniform int uVN; uniform int uVW;
attribute vec4 aAnim; attribute float aWid;
vec3 vatPos(int f) {
  int t = f * uVN + gl_VertexID;
  uint w = texelFetch(uVat, ivec2(t % uVW, t / uVW), 0).r;
  vec3 q = vec3(float(w & 1023u), float((w >> 10u) & 1023u), float((w >> 20u) & 1023u)) / 1023.0;
  return uVMin + q * (uVMax - uVMin);
}`;
const VAT_POS = `
vec3 transformed = mix(vatPos(int(aAnim.x)), vatPos(int(aAnim.y)), aAnim.z);
if (aWid > 0.5 && abs(aWid - aAnim.w) > 0.5) transformed = vec3(0.0, 0.8, 0.0);`;

// 共有のジオメトリと材質を作る
export function makeSoldierMesh(cap, team = 0) {
  const d = soldierData(team); if (!d) return null;
  const h = d.head, V = h.V;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
  const col = new Float32Array(V * 3), mask = new Float32Array(V), wid = new Float32Array(V);
  for (let i = 0; i < V; i++) {
    const a = d.vc[i * 4 + 3];
    col[i * 3] = Math.pow(d.vc[i * 4] / 255, 2.2); col[i * 3 + 1] = Math.pow(d.vc[i * 4 + 1] / 255, 2.2); col[i * 3 + 2] = Math.pow(d.vc[i * 4 + 2] / 255, 2.2);
    mask[i] = a & 1; wid[i] = a >> 1;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('tintMask', new THREE.BufferAttribute(mask, 1));
  geo.setAttribute('aWid', new THREE.BufferAttribute(wid, 1));
  geo.setIndex(new THREE.BufferAttribute(d.idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
  const vat = new THREE.DataTexture(d.tex, h.W, h.H, THREE.RedIntegerFormat, THREE.UnsignedIntType);
  vat.internalFormat = 'R32UI'; vat.minFilter = vat.magFilter = THREE.NearestFilter; vat.needsUpdate = true;
  const U = { uVat: { value: vat }, uVMin: { value: new THREE.Vector3(...h.min) }, uVMax: { value: new THREE.Vector3(...h.max) }, uVN: { value: V }, uVW: { value: h.W } };
  const patchV = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + VAT_DECL).replace('#include <begin_vertex>', VAT_POS);
  };
  const mat = patchMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0, flatShading: true }), 0.55, true);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => { prev(sh); patchV(sh); };
  mat.customProgramCacheKey = () => 'vatSoldier' + team;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = patchV; depth.customProgramCacheKey = () => 'vatDepth' + team;
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.customDepthMaterial = depth;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); anim.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAnim', anim);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.count = 0;
  mesh.userData.anim = anim; mesh.userData.clips = h.clips; mesh.userData.vat = vat;
  return mesh;
}

// クリップ名と進行度(0〜1)から [frameA, frameB, blend] を書き込む
export function setAnim(arr, o, clips, name, u, weapon) {
  const c = clips[name], start = c[0], n = c[1], loop = c[3];
  let f;
  if (loop) { u = u - Math.floor(u); f = u * n; } else { u = u < 0 ? 0 : u > 1 ? 1 : u; f = u * (n - 1); }
  const a = Math.floor(f), b = loop ? (a + 1) % n : Math.min(a + 1, n - 1);
  arr[o] = start + a; arr[o + 1] = start + b; arr[o + 2] = f - a; arr[o + 3] = weapon;
}
