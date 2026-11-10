// エフェクト: パーティクル / 武器の軌跡 / 衝撃波・属性演出(すべてプール管理で軽量)
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { rnd, clamp } from './util.js';

const PI = Math.PI;
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthWrite: false, transparent: true, fog: false, toneMapped: false };

class Pool {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.ml = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.gr = new Float32Array(max); this.dr = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', (this.aPos = new THREE.BufferAttribute(this.pos, 3)).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', (this.aCol = new THREE.BufferAttribute(this.col, 4)).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', (this.aSize = new THREE.BufferAttribute(this.size, 1)).setUsage(THREE.DynamicDrawUsage));
    this.uPx = { value: 600 };
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uPx: this.uPx },
      vertexShader: 'attribute vec4 aCol; attribute float aSize; varying vec4 vCol; uniform float uPx; void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(aSize * uPx / max(0.1, -mv.z), 240.0); }',
      fragmentShader: additive
        ? 'varying vec4 vCol; void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.25, 0.0, dot(q, q)); gl_FragColor = vec4(vCol.rgb * (vCol.a * a * a), 1.0); }'
        : 'varying vec4 vCol; void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.25, 0.02, dot(q, q)); gl_FragColor = vec4(vCol.rgb, vCol.a * a); }',
      ...(additive ? ADD : { transparent: true, depthWrite: false, fog: false, toneMapped: false }),
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 30 : 25;
  }
  add(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a = 1, grav = 0, drag = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z; this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = this.ml[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.gr[i] = grav; this.dr[i] = drag; this.a0[i] = a;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a; this.size[i] = s0;
  }
  update(dt) {
    let n = this.n; const { pos, vel, life, ml, s0, s1, gr, dr, a0, col, size } = this;
    for (let i = 0; i < n; i++) {
      const l = life[i] - dt;
      if (l <= 0) {
        n--;
        if (i < n) {
          const a = i * 3, b = n * 3, c = i * 4, d = n * 4;
          pos[a] = pos[b]; pos[a + 1] = pos[b + 1]; pos[a + 2] = pos[b + 2]; vel[a] = vel[b]; vel[a + 1] = vel[b + 1]; vel[a + 2] = vel[b + 2];
          col[c] = col[d]; col[c + 1] = col[d + 1]; col[c + 2] = col[d + 2]; col[c + 3] = col[d + 3];
          life[i] = life[n]; ml[i] = ml[n]; s0[i] = s0[n]; s1[i] = s1[n]; gr[i] = gr[n]; dr[i] = dr[n]; a0[i] = a0[n]; size[i] = size[n];
          i--;
        }
        continue;
      }
      life[i] = l;
      const i3 = i * 3, u = l / ml[i], k = dr[i] > 0 ? Math.exp(-dr[i] * dt) : 1;
      vel[i3 + 1] -= gr[i] * dt; vel[i3] *= k; vel[i3 + 1] *= k; vel[i3 + 2] *= k;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.03 && gr[i] > 0) { pos[i3 + 1] = 0.03; vel[i3 + 1] *= -0.35; }
      size[i] = s1[i] + (s0[i] - s1[i]) * u;
      col[i * 4 + 3] = a0[i] * Math.min(1, u * 2.5) * Math.min(1, (1 - u) * 12);
    }
    this.n = n; this.geo.setDrawRange(0, n);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

// 武器の軌跡(リボン)
const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _vt = new THREE.Vector3();
export class Trail {
  constructor(col, life = 0.2) {
    const max = this.max = 44; this.life = life; this.n = 0; this.d = new Float32Array(max * 7);
    this.pos = new Float32Array(max * 6); this.uv = new Float32Array(max * 4);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', (this.aPos = new THREE.BufferAttribute(this.pos, 3)).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', (this.aUv = new THREE.BufferAttribute(this.uv, 2)).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint16Array((max - 1) * 6);
    for (let i = 0; i < max - 1; i++) { const a = i * 2, o = i * 6; idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = a + 2; idx[o + 3] = a + 1; idx[o + 4] = a + 3; idx[o + 5] = a + 2; }
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(col[0], col[1], col[2]) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uCol; varying vec2 vUv; void main(){ float f = pow(clamp(1.0 - vUv.x, 0.0, 1.0), 1.8); float v = clamp(vUv.y, 0.0, 1.0); float e = 0.03 + 0.97 * v * v * v; gl_FragColor = vec4(uCol * (f * e * 0.42) + vec3(1.0) * (f * pow(v, 18.0) * 0.4), 1.0); }',
      side: THREE.DoubleSide, ...ADD,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 28;
    FX.group.add(this.mesh);
  }
  setColor(c) { this.mat.uniforms.uCol.value.setRGB(c[0], c[1], c[2]); }
  _put(bx, by, bz, tx, ty, tz, time) {
    if (this.n >= this.max) { this.d.copyWithin(0, 7); this.n--; }
    const o = this.n++ * 7, d = this.d;
    d[o] = bx; d[o + 1] = by; d[o + 2] = bz; d[o + 3] = tx; d[o + 4] = ty; d[o + 5] = tz; d[o + 6] = time;
  }
  // 新しいサンプルを追加(前回との間を弧で補間)
  push(b, t, now) {
    if (this.n > 0) {
      const o = (this.n - 1) * 7, d = this.d, pb = [d[o], d[o + 1], d[o + 2]], pt0 = d[o + 6];
      _v0.set(d[o + 3] - d[o], d[o + 4] - d[o + 1], d[o + 5] - d[o + 2]); _v1.copy(t).sub(b);
      const l0 = _v0.length(), l1 = _v1.length();
      if (l0 > 1e-4 && l1 > 1e-4) {
        const ang = _v0.angleTo(_v1), steps = Math.min(7, Math.floor(ang / 0.16));
        for (let k = 1; k <= steps; k++) {
          const s = k / (steps + 1);
          _vt.copy(_v0).multiplyScalar(1 / l0).lerp(_v1.clone().multiplyScalar(1 / l1), s).normalize().multiplyScalar(l0 + (l1 - l0) * s);
          const bx = pb[0] + (b.x - pb[0]) * s, by = pb[1] + (b.y - pb[1]) * s, bz = pb[2] + (b.z - pb[2]) * s;
          this._put(bx, by, bz, bx + _vt.x, by + _vt.y, bz + _vt.z, pt0 + (now - pt0) * s);
        }
      }
    }
    this._put(b.x, b.y, b.z, t.x, t.y, t.z, now);
  }
  update(now) {
    const d = this.d; let drop = 0;
    while (drop < this.n && now - d[drop * 7 + 6] > this.life) drop++;
    if (drop > 0) { d.copyWithin(0, drop * 7, this.n * 7); this.n -= drop; }
    const n = this.n, pos = this.pos, uv = this.uv;
    for (let i = 0; i < n; i++) {
      const o = i * 7, p = i * 6, q = i * 4, u = clamp((now - d[o + 6]) / this.life, 0, 1);
      pos[p] = d[o]; pos[p + 1] = d[o + 1]; pos[p + 2] = d[o + 2]; pos[p + 3] = d[o + 3]; pos[p + 4] = d[o + 4]; pos[p + 5] = d[o + 5];
      uv[q] = u; uv[q + 1] = 0; uv[q + 2] = u; uv[q + 3] = 1;
    }
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
    this.aPos.needsUpdate = true; this.aUv.needsUpdate = true;
  }
  dispose() { FX.group.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

const VS_UV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const U = () => ({ uCol: { value: new THREE.Color(1, 1, 1) }, uA: { value: 1 }, uTime: GFX.uTime });
const sm = (vs, fs, extra = {}) => () => new THREE.ShaderMaterial({ uniforms: U(), vertexShader: vs, fragmentShader: 'uniform vec3 uCol; uniform float uA; uniform float uTime;\n' + fs, side: THREE.DoubleSide, ...ADD, ...extra });

function boltTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, 256, 256); c.lineCap = 'round'; c.lineJoin = 'round';
  for (let k = 0; k < 4; k++) {
    const cx = k * 64 + 32, pts = [[cx, 0]]; let x = cx;
    for (let y = 16; y <= 256; y += 16) { x = clamp(x + rnd(-13, 13), k * 64 + 10, k * 64 + 54); if (y === 256) x = cx; pts.push([x, y]); }
    for (const [w, a] of [[9, 0.25], [4, 0.6], [1.6, 1]]) { c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = w; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); }
    c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,255,255,0.7)';
    for (let j = 0; j < 3; j++) { const p = pts[2 + j * 4]; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(clamp(p[0] + rnd(-20, 20), k * 64 + 4, k * 64 + 60), p[1] + rnd(14, 30)); c.stroke(); }
  }
  return new THREE.CanvasTexture(cv);
}
function crackTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  const g = c.createRadialGradient(128, 128, 4, 128, 128, 120); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.5, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256); c.lineCap = 'round';
  for (let i = 0; i < 13; i++) {
    let a = i / 13 * PI * 2 + rnd(-0.2, 0.2), x = 128, y = 128, w = 4.5; const len = rnd(60, 118);
    c.strokeStyle = 'rgba(0,0,0,0.9)';
    for (let d = 0; d < len; d += 12) { a += rnd(-0.45, 0.45); const nx = x + Math.cos(a) * 12, ny = y + Math.sin(a) * 12; c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke(); x = nx; y = ny; w *= 0.84; }
  }
  return new THREE.CanvasTexture(cv);
}

const POOLS = {};
const items = [];
function getMesh(kind) { const p = POOLS[kind]; let m = p.free.pop(); if (!m) { m = p.make(); FX.group.add(m); } m.visible = true; return m; }
function add(kind, dur, upd, data) {
  if (items.length > 170) { const it = { dead: true, mesh: { position: new THREE.Vector3(), rotation: new THREE.Euler(), scale: new THREE.Vector3() } }; return it; }
  const it = { kind, mesh: getMesh(kind), t: 0, dur, upd, dead: false, ...data };
  items.push(it); upd(it, 0);
  return it;
}
const setU = (m, col, a) => { const u = m.material.uniforms; u.uCol.value.setRGB(col[0], col[1], col[2]); u.uA.value = a; };

export const FX = {
  group: null, glowP: null, smokeP: null, mul: 1, time: 0, _wAcc: 0,

  init() {
    if (this.group) return;
    this.group = new THREE.Group(); GFX.scene.add(this.group);
    this.mul = GFX.q.fx;
    this.glowP = new Pool(Math.round(2600 * this.mul), true); this.smokeP = new Pool(Math.round(520 * this.mul), false);
    this.group.add(this.smokeP.points, this.glowP.points);
    const mk = (geo, matF, order = 26) => ({ free: [], make: () => { const m = new THREE.Mesh(geo, matF()); m.frustumCulled = false; m.renderOrder = order; return m; } });
    POOLS.ring = mk(new THREE.RingGeometry(0.7, 1, 48).rotateX(-PI / 2), sm('varying float vR; void main(){ vR = length(position.xz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      'varying float vR; void main(){ float a = smoothstep(0.7, 0.9, vR) * smoothstep(1.0, 0.94, vR); gl_FragColor = vec4(uCol * (a * uA), 1.0); }'));
    POOLS.shell = mk(new THREE.SphereGeometry(1, 20, 12), sm('varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      'varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uCol * ((f * f * f * 1.1 + 0.012) * uA), 1.0); }', { side: THREE.FrontSide }));
    POOLS.pillar = mk(new THREE.CylinderGeometry(1, 0.8, 1, 20, 1, true).translate(0, 0.5, 0), sm(VS_UV,
      'varying vec2 vUv; void main(){ float n = 0.5 + 0.5 * sin(vUv.x * 25.13 + sin(vUv.y * 9.0 - uTime * 7.0) * 1.6); float a = pow(1.0 - vUv.y, 1.25) * (0.35 + 0.95 * n); gl_FragColor = vec4(uCol * (a * uA), 1.0); }'));
    POOLS.tornado = mk(new THREE.CylinderGeometry(1, 0.3, 1, 18, 4, true).translate(0, 0.5, 0), sm(VS_UV,
      'varying vec2 vUv; void main(){ float s = 0.5 + 0.5 * sin(vUv.x * 18.85 + vUv.y * 9.0 - uTime * 16.0); float a = smoothstep(0.35, 0.9, s) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.7, vUv.y); gl_FragColor = vec4(uCol * (a * uA), 1.0); }'));
    POOLS.crescent = mk(new THREE.RingGeometry(0.72, 1, 20, 1, PI / 2 - 0.95, 1.9).rotateX(PI / 2), sm('varying float vR; varying float vA; void main(){ vR = (length(position.xz) - 0.72) / 0.28; vA = atan(position.x, position.z) / 0.95; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      'varying float vR; varying float vA; void main(){ float a = clamp(vR * vR * (1.0 - vA * vA), 0.0, 1.0); gl_FragColor = vec4(uCol * (a * uA) + vec3(1.0) * (pow(vR, 8.0) * (1.0 - vA * vA) * uA * 0.6), 1.0); }'));
    const bt = boltTex();
    const bg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), bg2 = bg.clone().rotateY(PI / 2);
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.Float32BufferAttribute([...bg.attributes.position.array, ...bg2.attributes.position.array], 3));
    bgeo.setAttribute('uv', new THREE.Float32BufferAttribute([...bg.attributes.uv.array, ...bg.attributes.uv.array], 2));
    bgeo.setIndex([...bg.index.array, ...Array.from(bg.index.array).map((i) => i + 4)]);
    POOLS.bolt = mk(bgeo, () => { const m = sm(VS_UV, 'uniform sampler2D uTex; uniform float uOff; varying vec2 vUv; void main(){ vec3 t = texture2D(uTex, vec2(vUv.x * 0.25 + uOff, vUv.y)).rgb; gl_FragColor = vec4((uCol * t + t * t * 2.0) * uA, 1.0); }')(); m.uniforms.uTex = { value: bt }; m.uniforms.uOff = { value: 0 }; return m; });
    const ct = crackTex();
    POOLS.crack = mk(new THREE.PlaneGeometry(2, 2).rotateX(-PI / 2), () => new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, opacity: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 5);
    const sg = new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0);
    const smats = {
      ice: new THREE.MeshStandardMaterial({ color: '#c8ecff', emissive: new THREE.Color(0.12, 0.5, 1.1), roughness: 0.15, metalness: 0.1, flatShading: true }),
      rock: new THREE.MeshStandardMaterial({ color: '#77624c', emissive: new THREE.Color(0.25, 0.1, 0.0), roughness: 0.95, flatShading: true }),
      dark: new THREE.MeshStandardMaterial({ color: '#2a1038', emissive: new THREE.Color(1.0, 0.12, 1.5), roughness: 0.3, flatShading: true }),
    };
    this.smats = smats;
    POOLS.spike = { free: [], make: () => { const m = new THREE.Mesh(sg, smats.ice); m.castShadow = true; return m; } };
  },

  clear() {
    for (const it of items) { if (it.dead) continue; it.mesh.visible = false; POOLS[it.kind].free.push(it.mesh); }
    items.length = 0;
    if (this.glowP) { this.glowP.n = 0; this.smokeP.n = 0; }
  },

  update(dt) {
    this.time += dt;
    const px = GFX.rh / (2 * Math.tan(GFX.camera.fov * PI / 360));
    this.glowP.uPx.value = px; this.smokeP.uPx.value = px;
    this.glowP.update(dt); this.smokeP.update(dt);
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]; it.t += dt;
      const u = it.t / it.dur;
      if (u >= 1 || it.dead) { it.dead = true; it.mesh.visible = false; POOLS[it.kind].free.push(it.mesh); items[i] = items[items.length - 1]; items.pop(); }
      else it.upd(it, u);
    }
  },
  kill(it) { if (it) it.dead = true; },

  // ---- パーティクル ----
  spark(x, y, z, r, g, b, n = 6, speed = 6, size = 0.2, life = 0.36, grav = 12) {
    n = Math.max(1, Math.round(n * this.mul));
    for (let i = 0; i < n; i++) {
      const a = rnd(6.283), e = rnd(-0.6, 1.2), s = speed * rnd(0.35, 1.0), ce = Math.cos(e);
      this.glowP.add(x, y, z, Math.cos(a) * ce * s, Math.sin(e) * s, Math.sin(a) * ce * s, life * rnd(0.6, 1.2), size * rnd(0.6, 1.3), size * 0.2, r, g, b, 1, grav, 1.5);
    }
  },
  glow(x, y, z, r, g, b, size = 2, life = 0.14, a = 1) { this.glowP.add(x, y, z, 0, 0, 0, life, size, size * 1.6, r, g, b, a, 0, 0); },
  embers(x, y, z, r, g, b, n = 6, spread = 1, up = 3, size = 0.16, life = 0.9) {
    n = Math.max(1, Math.round(n * this.mul));
    for (let i = 0; i < n; i++) this.glowP.add(x + rnd(-spread, spread), y + rnd(0, 0.6), z + rnd(-spread, spread), rnd(-0.8, 0.8), up * rnd(0.5, 1.3), rnd(-0.8, 0.8), life * rnd(0.6, 1.3), size * rnd(0.6, 1.4), size * 0.3, r, g, b, 1, -1.5, 0.6);
  },
  dust(x, z, n = 4, sc = 1, col = 0.62) {
    n = Math.max(1, Math.round(n * this.mul));
    for (let i = 0; i < n; i++) { const a = rnd(6.283), s = rnd(0.5, 2.6) * sc; this.smokeP.add(x + Math.cos(a) * 0.3 * sc, 0.25, z + Math.sin(a) * 0.3 * sc, Math.cos(a) * s, rnd(0.4, 1.6), Math.sin(a) * s, rnd(0.5, 1.0), 0.6 * sc, 2.2 * sc, col, col * 0.93, col * 0.82, 0.3, -0.3, 2.2); }
  },
  smoke(x, y, z, n, r, g, b, sc = 1, a = 0.35) {
    n = Math.max(1, Math.round(n * this.mul));
    for (let i = 0; i < n; i++) this.smokeP.add(x + rnd(-0.5, 0.5) * sc, y, z + rnd(-0.5, 0.5) * sc, rnd(-0.6, 0.6), rnd(0.6, 2.2), rnd(-0.6, 0.6), rnd(0.6, 1.3), 0.8 * sc, 2.6 * sc, r, g, b, a, -0.4, 1.2);
  },
  // 被弾エフェクト
  hit(x, y, z, c, power = 1) {
    this.spark(x, y, z, c[0], c[1], c[2], 4 + power * 4, 5 + power * 4, 0.2 + power * 0.06, 0.32);
    this.spark(x, y, z, 3, 2.6, 2, 2 + power * 2, 7 + power * 3, 0.13, 0.22);
    this.glow(x, y, z, c[0] * 0.3 + 0.3, c[1] * 0.3 + 0.3, c[2] * 0.3 + 0.3, 0.9 + power * 0.5, 0.08);
  },

  // ---- メッシュ系 ----
  ring(x, z, c, r0, r1, dur = 0.4, y = 0.12, a = 1) {
    return add('ring', dur, (it, u) => { const e = 1 - (1 - u) * (1 - u), r = it.r0 + (it.r1 - it.r0) * e; it.mesh.scale.set(r, 1, r); setU(it.mesh, it.c, it.a * (1 - u) * (1 - u)); }, { r0, r1, c, a }).mesh.position.set(x, y, z);
  },
  shell(x, y, z, c, r0, r1, dur = 0.35, a = 1) {
    const it = add('shell', dur, (it, u) => { const e = 1 - Math.pow(1 - u, 3), r = it.r0 + (it.r1 - it.r0) * e; it.mesh.scale.setScalar(r); setU(it.mesh, it.c, it.a * (1 - u)); }, { r0, r1, c, a });
    it.mesh.position.set(x, y, z); return it;
  },
  pillar(x, z, c, r, h, dur = 0.6, a = 1) {
    add('pillar', dur, (it, u) => { const e = Math.min(1, u * 5), k = it.r * (0.6 + 0.4 * e) * (1 - u * 0.3); it.mesh.scale.set(k, it.h * e, k); setU(it.mesh, it.c, it.a * Math.min(1, (1 - u) * 2.2)); }, { r, h, c, a }).mesh.position.set(x, 0.02, z);
  },
  tornado(x, z, c, r, h, dur = 1) {
    const it = add('tornado', dur, (it, u) => { const e = Math.min(1, u * 6) * Math.min(1, (1 - u) * 5); it.mesh.scale.set(it.r * (0.7 + 0.3 * e), it.h * (0.4 + 0.6 * e), it.r * (0.7 + 0.3 * e)); setU(it.mesh, it.c, e); }, { r, h, c });
    it.mesh.position.set(x, 0, z); return it;
  },
  bolt(x, z, c, h = 16, w = 3.2) {
    const it = add('bolt', 0.2, (it, u) => { setU(it.mesh, it.c, (u < 0.5 ? 1 : (1 - u) * 2) * (Math.random() < 0.25 ? 0.4 : 1)); }, { c });
    if (it.dead) return;
    it.mesh.position.set(x, 0, z); it.mesh.scale.set(w, h, w); it.mesh.rotation.y = rnd(PI); it.mesh.material.uniforms.uOff.value = ((Math.random() * 4) | 0) * 0.25;
    this.glow(x, 1, z, c[0], c[1], c[2], 7, 0.16); this.spark(x, 0.4, z, c[0], c[1], c[2], 10, 9, 0.22, 0.4);
  },
  spikes(x, z, kind, n, r, h = 2.6, dur = 0.9) {
    n = Math.max(3, Math.round(n * Math.min(1, this.mul + 0.25)));
    for (let i = 0; i < n; i++) {
      const a = rnd(6.283), d = Math.sqrt(Math.random()) * r, hh = h * rnd(0.5, 1.15) * (1 - d / (r * 1.6));
      const it = add('spike', dur * rnd(0.85, 1.15), (it, u) => { const e = u < 0.12 ? u / 0.12 : u > 0.75 ? (1 - u) / 0.25 : 1; it.mesh.scale.set(it.w, Math.max(0.001, it.hh * (1 - Math.pow(1 - e, 3))), it.w); }, { hh, w: hh * rnd(0.22, 0.34) });
      if (it.dead) continue;
      it.mesh.material = this.smats[kind] || this.smats.ice;
      it.mesh.position.set(x + Math.cos(a) * d, -0.05, z + Math.sin(a) * d); it.mesh.rotation.set(Math.sin(a) * -0.3 * (d / r), rnd(6), Math.cos(a) * 0.3 * (d / r));
    }
  },
  crescent(x, y, z, yaw, c, r, dur = 0.3, grow = 0, a = 1) {
    const it = add('crescent', dur, (it, u) => { const k = it.r * (1 + it.grow * u); it.mesh.scale.set(k, 1, k); setU(it.mesh, it.c, it.a * (it.fade ? Math.min(1, (1 - u) * 3) : 1)); }, { r, c, grow, a, fade: dur < 50 });
    it.mesh.position.set(x, y, z); it.mesh.rotation.y = yaw; return it;
  },
  crack(x, z, r, dur = 3.5) {
    const it = add('crack', dur, (it, u) => { it.mesh.material.opacity = Math.min(1, (1 - u) * 2.5); }, {});
    if (it.dead) return;
    it.mesh.position.set(x, 0.05, z); it.mesh.scale.set(r, 1, r); it.mesh.rotation.y = rnd(6.28);
  },

  // ---- 属性演出 ----
  quake(x, z, r, c) {
    this.crack(x, z, r * 1.15); this.ring(x, z, c || [1.6, 1.3, 1.0], r * 0.25, r * 1.15, 0.38); this.dust(x, z, 9, r * 0.42);
    for (let i = 0; i < 6 * this.mul; i++) { const a = rnd(6.283), s = rnd(3, 8); this.smokeP.add(x + Math.cos(a) * r * 0.4, 0.2, z + Math.sin(a) * r * 0.4, Math.cos(a) * s * 0.4, s, Math.sin(a) * s * 0.4, rnd(0.5, 0.9), 0.35, 0.2, 0.3, 0.26, 0.2, 0.9, 20, 0.5); }
  },
  burst(el, x, z, r, c) {
    this.shell(x, 1.0, z, c, r * 0.2, r * 0.7, 0.28, 0.6); this.spark(x, 1, z, c[0], c[1], c[2], 12, 9, 0.2, 0.45);
    if (el === 'fire') this.embers(x, 0.3, z, c[0], c[1], c[2], 10, r * 0.4, 5);
    else if (el === 'ice') this.spikes(x, z, 'ice', 4, r * 0.5, 1.5, 0.6);
    else if (el === 'thunder') this.bolt(x, z, c, 9, 2.2);
    else if (el === 'earth') this.dust(x, z, 6, r * 0.35);
    else if (el === 'wind') this.ring(x, z, c, r * 0.2, r * 0.9, 0.3, 1.0, 0.7);
    else if (el === 'dark') this.smoke(x, 0.6, z, 5, 0.25, 0.05, 0.4, r * 0.3, 0.5);
  },
  elemPillar(el, x, z, r, c) {
    this.ring(x, z, c, r * 0.2, r * 1.05, 0.45);
    if (el === 'fire') { this.pillar(x, z, c, r * 0.72, 9, 0.75); this.pillar(x, z, [c[0], c[1] * 1.8, c[2] * 2], r * 0.4, 12, 0.6); this.embers(x, 0.5, z, c[0], c[1], c[2], 26, r * 0.6, 9, 0.2, 1.1); this.glow(x, 2, z, c[0], c[1], c[2], r * 2.6, 0.25); }
    else if (el === 'ice') { this.spikes(x, z, 'ice', 16, r * 0.92, 4.2, 1.2); this.spark(x, 1.5, z, c[0], c[1], c[2], 22, 11, 0.2, 0.6, 6); this.shell(x, 1, z, c, r * 0.3, r, 0.4, 0.8); }
    else if (el === 'thunder') { this.bolt(x, z, c, 20, 4.5); for (let i = 0; i < 3; i++) { const a = rnd(6.28); this.bolt(x + Math.cos(a) * r * 0.55, z + Math.sin(a) * r * 0.55, c, 15, 2.6); } this.pillar(x, z, c, r * 0.45, 14, 0.3); }
    else if (el === 'earth') { this.spikes(x, z, 'rock', 13, r * 0.9, 3.4, 1.1); this.dust(x, z, 12, r * 0.45); }
    else if (el === 'wind') { this.tornado(x, z, c, r * 0.8, 9, 0.85); this.embers(x, 0.5, z, c[0], c[1], c[2], 22, r * 0.5, 10, 0.16, 0.8); this.dust(x, z, 6, r * 0.4, 0.8); }
    else { this.pillar(x, z, c, r * 0.7, 8, 0.8); this.spikes(x, z, 'dark', 10, r * 0.85, 3.2, 1.0); this.smoke(x, 0.8, z, 8, 0.22, 0.04, 0.36, r * 0.35, 0.55); this.embers(x, 0.4, z, c[0], c[1], c[2], 16, r * 0.6, 6); }
  },
  nova(x, z, r, c) {
    this.shell(x, 1.2, z, c, r * 0.15, r * 1.1, 0.5, 1.4); this.ring(x, z, c, r * 0.1, r * 1.35, 0.55, 0.15, 1.4); this.ring(x, z, [2.5, 2.5, 2.5], r * 0.1, r * 0.9, 0.35, 0.3, 0.8);
    this.spark(x, 1.2, z, c[0], c[1], c[2], 34, 16, 0.3, 0.7); this.glow(x, 1.5, z, c[0], c[1], c[2], r * 3.2, 0.28);
  },
  line(x0, z0, x1, z1, c) {
    const n = Math.max(3, Math.round(Math.hypot(x1 - x0, z1 - z0) * 1.3 * this.mul));
    for (let i = 0; i <= n; i++) { const s = i / n, x = x0 + (x1 - x0) * s, z = z0 + (z1 - z0) * s; this.glowP.add(x, rnd(0.6, 1.5), z, rnd(-1, 1), rnd(-0.5, 1.5), rnd(-1, 1), rnd(0.25, 0.5), rnd(0.5, 1.0), 0.1, c[0], c[1], c[2], 0.9, 0, 1); }
    this.ring(x1, z1, c, 0.6, 2.6, 0.3);
  },
  wave(x, z, yaw, r, c) {
    const it = this.crescent(x, 1.0, z, yaw, c, r * 0.3, 0.32, 2.6, 1.2); it.mesh.position.y = 1.0;
    const it2 = this.crescent(x, 0.5, z, yaw, [c[0] * 0.6 + 1, c[1] * 0.6 + 1, c[2] * 0.6 + 1], r * 0.25, 0.26, 2.4, 0.7); it2.mesh.position.y = 0.5;
    this.dust(x + Math.sin(yaw) * r * 0.4, z + Math.cos(yaw) * r * 0.4, 5, r * 0.25, 0.75);
  },
  // 覚醒・溜めのオーラ
  aura(x, y, z, c, n = 2, rad = 0.7) { for (let i = 0; i < n; i++) { const a = rnd(6.283); this.glowP.add(x + Math.cos(a) * rad, y + rnd(0, 0.5), z + Math.sin(a) * rad, 0, rnd(1.5, 4), 0, rnd(0.35, 0.7), rnd(0.2, 0.4), 0.05, c[0], c[1], c[2], 0.9, 0, 0); } },

  // 天候(カメラ周辺に漂う粒子)
  weather(kind, cx, cy, cz, dt) {
    this._wAcc += dt;
    const rates = { petal: 14, dust: 7, snow: 70, ember: 24, firefly: 7 }, rate = (rates[kind] || 0) * this.mul;
    let n = Math.floor(this._wAcc * rate); if (n <= 0) return; this._wAcc -= n / rate; if (n > 12) n = 12;
    for (let i = 0; i < n; i++) {
      const x = cx + rnd(-30, 30), z = cz + rnd(-30, 30);
      if (kind === 'petal') this.smokeP.add(x, cy + rnd(-2, 9), z, rnd(1.5, 3.5), rnd(-1.2, -0.3), rnd(-1, 1), rnd(4, 7), 0.13, 0.13, 1.0, 0.82, 0.88, 0.85, 0, 0);
      else if (kind === 'snow') this.smokeP.add(x, cy + rnd(2, 12), z, rnd(-1.2, 0.4), rnd(-3.2, -1.8), rnd(-0.6, 0.6), rnd(3, 5), 0.1, 0.1, 1, 1, 1, 0.9, 0, 0);
      else if (kind === 'dust') this.smokeP.add(x, rnd(0.3, 3), z, rnd(4, 8), rnd(-0.2, 0.5), rnd(-1.5, 1.5), rnd(2.5, 4.5), 2.5, 5.5, 0.85, 0.62, 0.42, 0.1, 0, 0);
      else if (kind === 'ember') this.glowP.add(x, rnd(0, 4), z, rnd(-0.8, 0.8), rnd(1, 3.2), rnd(-0.8, 0.8), rnd(2.5, 5), rnd(0.07, 0.15), 0.03, 4, 1.2, 0.2, 1, -0.2, 0.2);
      else if (kind === 'firefly') this.glowP.add(x, rnd(0.6, 4), z, rnd(-0.6, 0.6), rnd(-0.2, 0.4), rnd(-0.6, 0.6), rnd(3, 6), rnd(0.09, 0.16), 0.05, 1.6, 2.6, 0.9, 1, 0, 0);
    }
  },
};
