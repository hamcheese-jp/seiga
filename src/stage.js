// 戦場生成: 地形(歩行領域のSDFから丘陵を生成) / 地面テクスチャ / 樹木・岩 / 拠点 / 経路探索
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { THEMES } from './data.js';
import { clamp, smooth, makeNoise, mulberry } from './util.js';
import { box, cyl, cone, ico, sph, at, merge, facet } from './geo.js';

const PI = Math.PI;
const hexBytes = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const TEAM_COL = ['#2f6bff', '#e0352e'];
const TEAM_HDR = [[0.25, 0.8, 3.0], [3.0, 0.45, 0.25]];

function tileTex(cols, seed, style) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S), d = img.data, n = makeNoise(seed);
  const [c0, c1, c2] = cols.map(hexBytes);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S * 8, v = y / S * 8;
    const a = n.fbm(u, v, 4, 8), b = n.fbm(u * 4 + 11.3, v * 4 + 5.7, 3, 32);
    const t = clamp((a - 0.5) * 2.4 + 0.5, 0, 1);
    let k = clamp((0.5 - b) * 2.4, 0, 1) * 0.75;
    if (style === 'rock') { const r = 1 - Math.abs(n.fbm(u * 1.5 + 3, v * 1.5 + 9, 3, 12) * 2 - 1); k = Math.max(k, smooth(0.84, 0.97, r) * 0.9); }
    const i = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) { let val = c0[c] + (c1[c] - c0[c]) * t; val += (c2[c] - val) * k; d[i + c] = val; }
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

let _emblem = null;
function emblemTex() {
  if (_emblem) return _emblem;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128);
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, 0, 128, 10); c.fillRect(0, 118, 128, 10);
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 34, 0, PI * 2); c.stroke();
  c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, r = i % 2 ? 11 : 26; c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  c.fill();
  _emblem = new THREE.CanvasTexture(cv); _emblem.colorSpace = THREE.SRGBColorSpace;
  return _emblem;
}

function treeGeo(kind) {
  const tr = (c, r0 = 0.2, r1 = 0.36, h = 2.6) => at(cyl(r0, r1, h, c, 6), 0, h / 2, 0);
  switch (kind) {
    case 'broad': return merge([tr('#5a3d28'), at(ico(1.75, '#3f7d2a', 1), 0, 3.7, 0), at(ico(1.3, '#52943a', 1), 1.0, 3.0, 0.4), at(ico(1.25, '#33691f', 1), -0.85, 3.2, -0.5), at(ico(1.0, '#4a8a30', 1), 0.1, 4.6, 0.3)]);
    case 'pine': return merge([tr('#4a3222', 0.16, 0.3, 2.2), at(cone(1.65, 2.5, '#2c5a2a', 7), 0, 2.7, 0), at(cone(1.28, 2.1, '#34682f', 7), 0, 4.0, 0), at(cone(0.86, 1.8, '#3d7636', 7), 0, 5.2, 0)]);
    case 'snowpine': return merge([tr('#3e2c20', 0.16, 0.3, 2.2), at(cone(1.65, 2.5, '#35584a', 7), 0, 2.7, 0), at(cone(1.28, 2.1, '#3d6453', 7), 0, 4.0, 0), at(cone(0.86, 1.8, '#467060', 7), 0, 5.2, 0),
      at(cone(1.2, 1.3, '#eef4fa', 7), 0, 3.35, 0), at(cone(0.95, 1.1, '#f4f8fc', 7), 0, 4.55, 0), at(cone(0.6, 1.0, '#ffffff', 7), 0, 5.65, 0)]);
    case 'sakura': return merge([tr('#3a2a2a'), at(ico(1.75, '#ff9ec6', 1), 0, 3.7, 0), at(ico(1.3, '#ffbcd8', 1), 1.0, 3.0, 0.4), at(ico(1.25, '#f486b8', 1), -0.85, 3.2, -0.5), at(ico(1.0, '#ffd0e4', 1), 0.1, 4.6, 0.3)]);
    case 'dead': return merge([tr('#4c3a2e', 0.1, 0.3, 3.4), at(cyl(0.05, 0.1, 1.6, '#4c3a2e', 5), 0.5, 2.9, 0, 0, 0, -0.9), at(cyl(0.04, 0.09, 1.3, '#4c3a2e', 5), -0.4, 2.4, 0.2, 0.3, 0, 0.8), at(cyl(0.03, 0.07, 1.0, '#4c3a2e', 5), 0.1, 3.6, -0.3, -0.6, 0, 0.2)]);
    case 'burnt': return merge([tr('#191311', 0.1, 0.32, 3.2), at(cyl(0.05, 0.1, 1.5, '#191311', 5), 0.5, 2.7, 0, 0, 0, -0.9), at(cyl(0.04, 0.09, 1.2, '#191311', 5), -0.4, 2.2, 0.2, 0.3, 0, 0.8)]);
    case 'mesa': return facet(merge([at(cyl(1.5, 2.1, 3.2, '#9a5236', 7), 0, 1.6, 0), at(cyl(1.15, 1.45, 2.4, '#b0643f', 7), 0.15, 4.2, 0.1), at(cyl(0.8, 1.1, 1.6, '#8c482e', 6), -0.1, 6.0, 0)]), 0.5, mulberry(5));
  }
  return tr('#5a3d28');
}

export class Stage {
  constructor(def) {
    this.def = def; this.theme = THEMES[def.theme]; this.size = def.size; this.W = def.size + 190;
    this.nodes = def.nodes.map(([x, z, r]) => ({ x, z, r }));
    this.links = def.links.map(([a, b, w]) => {
      const A = this.nodes[a], B = this.nodes[b], dx = B.x - A.x, dz = B.z - A.z;
      return { a, b, w, ax: A.x, az: A.z, dx, dz, il2: 1 / (dx * dx + dz * dz), len: Math.hypot(dx, dz) };
    });
    let seed = 7; for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    this.rng = mulberry(seed); this.noise = makeNoise(seed);
    this.group = new THREE.Group();
    this.bases = []; this.flames = []; this.disposables = []; this.obst = [];
    this._terrain(); this._props(); this._bases(); this._nav();
    GFX.scene.add(this.group);
  }

  sdf(x, z) {
    let d = 1e9; const N = this.nodes, L = this.links;
    for (let i = 0; i < N.length; i++) { const n = N[i], dx = x - n.x, dz = z - n.z, v = Math.sqrt(dx * dx + dz * dz) - n.r; if (v < d) d = v; }
    for (let i = 0; i < L.length; i++) {
      const l = L[i]; let t = ((x - l.ax) * l.dx + (z - l.az) * l.dz) * l.il2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = l.ax + l.dx * t - x, pz = l.az + l.dz * t - z, v = Math.sqrt(px * px + pz * pz) - l.w; if (v < d) d = v;
    }
    return d;
  }
  // 歩行領域の外なら最寄りの境界へ押し戻す(陣幕などの障害物も避ける)
  constrain(e, rad = 0.45) {
    const O = this.obst;
    for (let i = 0; i < O.length; i++) {
      const g = O[i]; if (Math.abs(e.x - g.x) > g.R || Math.abs(e.z - g.z) > g.R) continue;
      for (let j = 0; j < g.list.length; j++) {
        const o = g.list[j], dx = e.x - o.x, dz = e.z - o.z, mn = o.r + rad, d2 = dx * dx + dz * dz;
        if (d2 < mn * mn && d2 > 1e-6) {
          // 押し戻し+わずかに横へ逃がす(真正面からぶつかっても引っかからない)
          const d = Math.sqrt(d2), k = mn / d, slip = (mn - d) * 0.35;
          e.x = o.x + dx * k - dz / d * slip; e.z = o.z + dz * k + dx / d * slip;
        }
      }
      break;
    }
    return this._region(e, rad);
  }
  _region(e, rad) {
    const x = e.x, z = e.z, N = this.nodes, L = this.links;
    let best = 1e9, cx = 0, cz = 0, cr = 0;
    for (let i = 0; i < N.length; i++) {
      const n = N[i], dx = x - n.x, dz = z - n.z, v = Math.sqrt(dx * dx + dz * dz) - n.r;
      if (v + rad <= 0) return false;
      if (v < best) { best = v; cx = n.x; cz = n.z; cr = n.r; }
    }
    for (let i = 0; i < L.length; i++) {
      const l = L[i]; let t = ((x - l.ax) * l.dx + (z - l.az) * l.dz) * l.il2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = l.ax + l.dx * t, qz = l.az + l.dz * t, px = qx - x, pz = qz - z, v = Math.sqrt(px * px + pz * pz) - l.w;
      if (v + rad <= 0) return false;
      if (v < best) { best = v; cx = qx; cz = qz; cr = l.w; }
    }
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1, k = Math.max(0, cr - rad) / d;
    e.x = cx + dx * k; e.z = cz + dz * k;
    return true;
  }
  _h(x, z, d) {
    if (d <= 1.2) return 0;
    const n = this.noise, t = smooth(1.2, 15, d), far = smooth(12, 95, d);
    return t * (3.0 + 7.5 * n.fbm(x * 0.045 + 31, z * 0.045 + 17, 3)) + far * (20 + 36 * n.fbm(x * 0.012 + 7, z * 0.012 + 3, 3));
  }
  heightAt(x, z) {
    const N = this.NT, W = this.W, fx = clamp((x / W + 0.5) * N, 0, N - 1.001), fz = clamp((z / W + 0.5) * N, 0, N - 1.001);
    const ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz, H = this.H, s = N + 1, i = iz * s + ix;
    return (H[i] * (1 - u) + H[i + 1] * u) * (1 - v) + (H[i + s] * (1 - u) + H[i + s + 1] * u) * v;
  }

  _terrain() {
    const th = this.theme, W = this.W, NT = this.NT = GFX.qName === 'low' ? 150 : GFX.qName === 'mid' ? 180 : 230, s = NT + 1;
    const pos = new Float32Array(s * s * 3), H = this.H = new Float32Array(s * s);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const x = (i / NT - 0.5) * W, z = (j / NT - 0.5) * W, h = this._h(x, z, this.sdf(x, z)), k = j * s + i;
      H[k] = h; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    }
    const idx = new Uint32Array(NT * NT * 6); let o = 0;
    for (let j = 0; j < NT; j++) for (let i = 0; i < NT; i++) { const a = j * s + i, b = a + 1, c = a + s, d = c + 1; idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();

    // マスク: R=土の道 G=岩肌 B=溶岩 A=明暗むら
    const M = 256, md = new Uint8Array(M * M * 4), n = this.noise, baseNodes = new Set(this.def.bases.map((b) => b.n));
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = ((i + 0.5) / M - 0.5) * W, z = ((j + 0.5) / M - 0.5) * W, d = this.sdf(x, z);
      let dirt = 0;
      for (const l of this.links) {
        let t = ((x - l.ax) * l.dx + (z - l.az) * l.dz) * l.il2; t = clamp(t, 0, 1);
        const dd = Math.hypot(l.ax + l.dx * t - x, l.az + l.dz * t - z); dirt = Math.max(dirt, smooth(l.w * 0.8, l.w * 0.25, dd));
      }
      this.nodes.forEach((nd, ni) => { if (baseNodes.has(ni)) dirt = Math.max(dirt, smooth(nd.r * 0.95, nd.r * 0.45, Math.hypot(x - nd.x, z - nd.z))); });
      dirt *= 0.45 + 0.75 * n.fbm(x * 0.09, z * 0.09, 3);
      const e = 1.6, hx = this._h(x + e, z, this.sdf(x + e, z)) - this._h(x - e, z, this.sdf(x - e, z)), hz = this._h(x, z + e, this.sdf(x, z + e)) - this._h(x, z - e, this.sdf(x, z - e));
      const slope = Math.hypot(hx, hz) / (2 * e), rock = smooth(0.42, 1.0, slope + (n.fbm(x * 0.06 + 9, z * 0.06, 2) - 0.5) * 0.3);
      let lava = 0;
      if (th.lava) { const v = 1 - Math.abs(n.fbm(x * 0.035 + 40, z * 0.035 + 60, 3) * 2 - 1); lava = smooth(0.8, 0.93, v) * smooth(2.5, 7, d); }
      const k = (j * M + i) * 4;
      md[k] = clamp(dirt, 0, 1) * 255; md[k + 1] = rock * 255; md[k + 2] = lava * 255; md[k + 3] = clamp(0.25 + 0.75 * n.fbm(x * 0.022 + 5, z * 0.022 + 8, 3), 0, 1) * 255;
    }
    const mask = new THREE.DataTexture(md, M, M, THREE.RGBAFormat);
    mask.minFilter = mask.magFilter = THREE.LinearFilter; mask.needsUpdate = true;
    const tA = tileTex(th.ground[0], 11, 'grass'), tB = tileTex(th.ground[1], 23, 'dirt'), tC = tileTex(th.ground[2], 37, 'rock');
    this.disposables.push(mask, tA, tB, tC);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uMask: { value: mask }, uTA: { value: tA }, uTB: { value: tB }, uTC: { value: tC }, uW: { value: W }, uLava: { value: new THREE.Color(5.0, 1.3, 0.2) }, uTime: GFX.uTime });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vTuv; varying vec2 vMuv; uniform float uW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTuv = position.xz; vMuv = position.xz / uW + 0.5;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vTuv; varying vec2 vMuv; uniform sampler2D uMask, uTA, uTB, uTC; uniform vec3 uLava; uniform float uTime;')
        .replace('#include <map_fragment>', `vec4 msk = texture2D(uMask, vMuv);
vec3 gA = mix(texture2D(uTA, vTuv * 0.17).rgb, texture2D(uTA, vTuv * 0.041 + 0.37).rgb, 0.45);
vec3 gB = texture2D(uTB, vTuv * 0.13).rgb; vec3 gC = texture2D(uTC, vTuv * 0.07).rgb;
vec3 gCol = mix(gA, gB, msk.r); gCol = mix(gCol, gC, msk.g); gCol *= 0.72 + 0.56 * msk.a;
diffuseColor.rgb *= gCol;`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uLava * msk.b * (0.65 + 0.35 * sin(uTime * 1.7 + vTuv.x * 0.4 + vTuv.y * 0.3));');
    };
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true;
    this.group.add(mesh); this.terrain = mesh;
  }

  _props() {
    const th = this.theme, r = this.rng, W = this.W, sc = GFX.q.scatter;
    const stdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const dummy = new THREE.Object3D();
    const place = (geo, count, test, sMin, sMax, shadow = true, mat = stdMat) => {
      const im = new THREE.InstancedMesh(geo, mat, count); let n = 0, tries = 0;
      while (n < count && tries++ < count * 30) {
        const x = (r() - 0.5) * W * 0.96, z = (r() - 0.5) * W * 0.96, d = this.sdf(x, z);
        if (!test(d, x, z)) continue;
        const s = sMin + r() * (sMax - sMin);
        dummy.position.set(x, this.heightAt(x, z) - 0.15 * s, z); dummy.rotation.set((r() - 0.5) * 0.1, r() * 6.28, (r() - 0.5) * 0.1); dummy.scale.set(s, s * (0.85 + r() * 0.35), s);
        dummy.updateMatrix(); im.setMatrixAt(n++, dummy.matrix);
      }
      im.count = n; im.castShadow = shadow; im.receiveShadow = !shadow; im.instanceMatrix.needsUpdate = true;
      this.group.add(im);
      return im;
    };
    const kinds = th.trees || [];
    kinds.forEach((k) => {
      const big = k === 'mesa';
      place(treeGeo(k), Math.round((big ? 70 : 300 / kinds.length) * sc), (d) => d > (big ? 5 : 3) && d < 85 && r() < 1.1 - d / 95, big ? 1.0 : 0.8, big ? 2.6 : 1.7);
    });
    const rockCol = th.ground[2][0];
    place(facet(ico(1, rockCol, 1), 0.5, mulberry(3)), Math.round(110 * sc), (d) => d > 1.6 && d < 40, 0.6, 2.6);
    // 地表の小物(歩行領域内)
    if (th.scatter) {
      const tuft = this.def.theme === 'snow' ? at(sph(0.3, '#f4f8fc', 6, 4), 0, 0, 0, 0, 0, 0, 1.4, 0.4, 1.2)
        : this.def.theme === 'desert' || this.def.theme === 'volcano' ? facet(ico(0.22, th.scatter, 0), 0.1, mulberry(9))
        : merge([at(cone(0.07, 0.42, th.scatter, 4), 0, 0.2, 0), at(cone(0.06, 0.34, th.scatter, 4), 0.1, 0.16, 0.04, 0, 0, -0.4), at(cone(0.06, 0.36, th.scatter, 4), -0.09, 0.17, -0.03, 0.3, 0, 0.4), at(cone(0.05, 0.3, th.scatter, 4), 0.02, 0.14, 0.1, 0.5, 0, 0)]);
      place(tuft, Math.round(1400 * sc), (d) => d < -0.8 && d > -40, 0.7, 1.7, false);
    }
    this.disposables.push(stdMat);
  }

  _bases() {
    const neutral = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
    const flameMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.disposables.push(neutral, flameMat);
    const r = this.rng;
    this.def.bases.forEach((bd, bi) => {
      const nd = this.nodes[bd.n], g = new THREE.Group(); g.position.set(nd.x, 0, nd.z);
      const R = Math.min(nd.r - 1, 16), N = [], T = [], ob = [];
      // 柵(道の方向は開ける)
      const gaps = this.links.filter((l) => l.a === bd.n || l.b === bd.n).map((l) => { const o = this.nodes[l.a === bd.n ? l.b : l.a]; return Math.atan2(o.x - nd.x, o.z - nd.z); });
      for (let a = 0; a < PI * 2; a += 0.3) {
        if (gaps.some((ga) => Math.abs(Math.atan2(Math.sin(a - ga), Math.cos(a - ga))) < 0.55)) continue;
        const x = Math.sin(a) * (R + 0.6), z = Math.cos(a) * (R + 0.6);
        N.push(at(cyl(0.09, 0.11, 2.6, '#6b4a30', 5), x, 1.0, z, 0.55, a, 0), at(cyl(0.09, 0.11, 2.6, '#5d4029', 5), x, 1.0, z, -0.55, a, 0), at(cyl(0.07, 0.07, 3.0, '#7a5638', 5), x, 0.9, z, 0, a, PI / 2));
        N.push(at(cone(0.1, 0.3, '#3a2a1e', 5), x + Math.sin(a) * 0.68, 2.2, z + Math.cos(a) * 0.68, 0.55, a, 0));
      }
      // 天幕・物資・篝火
      const nt = bd.main ? 5 : 3;
      for (let i = 0; i < nt; i++) {
        let a = (i + 0.5 + (r() - 0.5) * 0.5) / nt * 6.28;
        for (let k = 0; k < 8 && gaps.some((ga) => Math.abs(Math.atan2(Math.sin(a - ga), Math.cos(a - ga))) < 0.5); k++) a += 0.3;   // 出入口は塞がない
        const d = R * (0.68 + r() * 0.12), x = Math.sin(a) * d, z = Math.cos(a) * d;
        T.push(at(cone(1.95, 1.8, '#f2ecdf', 8), x, 1.8, z), at(cyl(1.9, 1.9, 0.9, '#d9d0bd', 8, 0, true), x, 0.45, z));
        N.push(at(cyl(0.07, 0.07, 0.6, '#5d4029', 5), x, 2.9, z));
        ob.push({ x: nd.x + x, z: nd.z + z, r: 1.95 });
        const tx = Math.cos(a), tz = -Math.sin(a);
        N.push(at(box(0.9, 0.7, 0.9, '#7a5a3a'), x + tx * 2.6, 0.35, z + tz * 2.6, 0, r() * 3, 0), at(box(0.7, 0.6, 0.7, '#6a4c30'), x + tx * 3.3, 0.3, z + tz * 3.3, 0, r() * 3, 0), at(cyl(0.38, 0.38, 0.9, '#5d4029', 8), x - tx * 2.6, 0.45, z - tz * 2.6));
        ob.push({ x: nd.x + x + tx * 2.9, z: nd.z + z + tz * 2.9, r: 0.9 }, { x: nd.x + x - tx * 2.6, z: nd.z + z - tz * 2.6, r: 0.6 });
      }
      const nb = bd.main ? 4 : 2;
      for (let i = 0; i < nb; i++) {
        const a = i / nb * 6.28 + 0.6, x = Math.sin(a) * R * 0.32, z = Math.cos(a) * R * 0.32;
        N.push(at(cyl(0.06, 0.06, 1.3, '#2a2422', 5), x, 0.65, z), at(cyl(0.42, 0.22, 0.3, '#3a3432', 8), x, 1.4, z));
        const fl = new THREE.Mesh(merge([at(cone(0.3, 0.9, [5.5, 1.9, 0.3], 6), 0, 0.4, 0), at(sph(0.26, [6, 3.2, 0.8], 6, 5), 0, 0.05, 0)]), flameMat);
        fl.position.set(x, 1.6, z); g.add(fl); this.flames.push(fl); ob.push({ x: nd.x + x, z: nd.z + z, r: 0.5 });
      }
      // 旗
      const poles = bd.main ? [[0, 0, 9], [-2.4, 0.6, 7], [2.4, 0.6, 7]] : [[0, 0, 7.5]];
      const teamMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, color: TEAM_COL[bd.t] });
      const flagMat = new THREE.MeshStandardMaterial({ map: emblemTex(), roughness: 0.75, side: THREE.DoubleSide, color: TEAM_COL[bd.t] });
      flagMat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = GFX.uTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat fw = uv.x; transformed.z += sin(uv.x * 7.0 - uTime * 5.5 + uv.y * 2.0 + position.y) * 0.26 * fw; transformed.y -= fw * fw * 0.18;');
      };
      for (const [px, pz, ph] of poles) {
        N.push(at(cyl(0.08, 0.12, ph, '#4a3626', 6), px, ph / 2, pz), at(sph(0.16, '#d9a23a', 8, 6), px, ph + 0.1, pz));
        ob.push({ x: nd.x + px, z: nd.z + pz, r: 0.35 });
        const fg = new THREE.PlaneGeometry(2.6, 1.7, 10, 4); fg.translate(1.3, 0, 0);
        const fm = new THREE.Mesh(fg, flagMat); fm.position.set(px + 0.05, ph - 1.0, pz); fm.castShadow = true; g.add(fm);
      }
      this.disposables.push(teamMat, flagMat);
      const nm = new THREE.Mesh(merge(N), neutral); nm.castShadow = true; nm.receiveShadow = true; g.add(nm);
      if (T.length) { const tm = new THREE.Mesh(merge(T), teamMat); tm.castShadow = true; g.add(tm); }
      // 領域リング
      const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...TEAM_HDR[bd.t]), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.3, R, 72), ringMat); ring.rotation.x = -PI / 2; ring.position.y = 0.07; g.add(ring);
      this.disposables.push(ringMat);
      this.group.add(g);
      const cur = new THREE.Color(TEAM_COL[bd.t]);
      this.bases.push({ g, R, x: nd.x, z: nd.z, teamMat, flagMat, ringMat, cur, team: bd.t, pulse: 0 });
      this.obst.push({ x: nd.x, z: nd.z, R: R + 3, list: ob });
    });
  }
  setBaseOwner(i, team) { const b = this.bases[i]; b.team = team; b.pulse = 1; }

  _nav() {
    const n = this.nodes.length; this.adj = Array.from({ length: n }, () => []);
    for (const l of this.links) { this.adj[l.a].push([l.b, l.len]); this.adj[l.b].push([l.a, l.len]); }
  }
  nearestNode(x, z) { let b = 0, bd = 1e9; this.nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z) - n.r; if (d < bd) { bd = d; b = i; } }); return b; }
  // ノード a→b の最短経路(ノード番号の配列)
  path(a, b) {
    const n = this.nodes.length, dist = new Array(n).fill(1e9), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
    dist[a] = 0;
    for (let k = 0; k < n; k++) {
      let u = -1, bd = 1e9; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0 || u === b) break; done[u] = true;
      for (const [v, w] of this.adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    const out = []; let c = b; while (c >= 0) { out.unshift(c); c = prev[c]; }
    return out[0] === a ? out : [a];
  }

  // ミニマップ用の静的画像
  drawMap(size) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const c = cv.getContext('2d'), s = size / (this.size * 1.02), o = size / 2;
    const X = (x) => o - x * s, Y = (z) => o - z * s;
    c.lineCap = 'round'; c.strokeStyle = c.fillStyle = '#ffffff';
    for (const l of this.links) { c.lineWidth = l.w * 2 * s; c.beginPath(); c.moveTo(X(l.ax), Y(l.az)); c.lineTo(X(l.ax + l.dx), Y(l.az + l.dz)); c.stroke(); }
    for (const n of this.nodes) { c.beginPath(); c.arc(X(n.x), Y(n.z), n.r * s, 0, PI * 2); c.fill(); }
    return { cv, s, o };
  }

  update(dt) {
    const t = GFX.uTime.value;
    for (let i = 0; i < this.flames.length; i++) { const f = this.flames[i]; f.scale.set(1 + Math.sin(t * 11 + i * 2) * 0.12, 1 + Math.sin(t * 14 + i) * 0.22, 1 + Math.cos(t * 9 + i) * 0.12); }
    for (const b of this.bases) {
      const target = _c.set(TEAM_COL[b.team]);
      b.cur.lerp(target, 1 - Math.exp(-4 * dt));
      b.teamMat.color.copy(b.cur); b.flagMat.color.copy(b.cur);
      b.pulse = Math.max(0, b.pulse - dt * 0.7);
      const h = TEAM_HDR[b.team], k = 1 + b.pulse * 3;
      b.ringMat.color.setRGB(h[0] * k, h[1] * k, h[2] * k); b.ringMat.opacity = 0.38 + 0.14 * Math.sin(t * 2.5) + b.pulse * 0.4;
    }
  }

  dispose() {
    GFX.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    for (const d of this.disposables) d.dispose();
  }
}
const _c = new THREE.Color();
