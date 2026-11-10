// 描画基盤: レンダラー / HDRポストプロセス(ブルーム・トーンマップ) / 空 / ライト / 画質管理
import * as THREE from 'three';
import { clamp } from './util.js';

export const QUALITY = {
  low:   { pr: 1.0, msaa: 0, bloomLv: 3, shadow: 0,    soft: false, soldiers: 110, fx: 0.5,  sky: 2, scatter: 0.35 },
  mid:   { pr: 1.5, msaa: 2, bloomLv: 4, shadow: 1024, soft: false, soldiers: 150, fx: 0.75, sky: 3, scatter: 0.6 },
  high:  { pr: 2.0, msaa: 4, bloomLv: 5, shadow: 2048, soft: true,  soldiers: 220, fx: 1.0,  sky: 4, scatter: 1.0 },
  ultra: { pr: 3.0, msaa: 4, bloomLv: 5, shadow: 4096, soft: true,  soldiers: 300, fx: 1.25, sky: 5, scatter: 1.3 },
};

const fsTri = new THREE.BufferGeometry();
fsTri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
fsTri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const pass = (frag, uniforms, opts = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...opts });

const F_PRE = `uniform sampler2D tSrc; uniform float uTh; varying vec2 vUv;
void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float br = max(c.r, max(c.g, c.b));
  float knee = uTh * 0.5; float soft = clamp(br - uTh + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
  float k = max(soft, br - uTh) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * k, vec3(10.0)), 1.0); }`;
const F_DOWN = `uniform sampler2D tSrc; uniform vec2 uHalf; varying vec2 vUv;
void main(){ vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv - uHalf).rgb; s += texture2D(tSrc, vUv + uHalf).rgb;
  s += texture2D(tSrc, vUv + vec2(uHalf.x, -uHalf.y)).rgb; s += texture2D(tSrc, vUv - vec2(uHalf.x, -uHalf.y)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0); }`;
const F_UP = `uniform sampler2D tSrc; uniform vec2 uHalf; varying vec2 vUv;
void main(){ vec2 h = uHalf; vec3 s = texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0; s += texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb * 2.0; s += texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0; s += texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0, 1.0); }`;
const F_FINAL = `uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float uBloom, uExposure, uVig, uFlash, uSat, uRadial, uDesat; uniform vec3 uTint, uFlashCol; varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUv; vec3 col;
  if (uRadial > 0.001) { vec2 d = (uv - 0.5) * uRadial;
    col = (texture2D(tScene, uv).rgb + texture2D(tScene, uv - d * 0.33).rgb + texture2D(tScene, uv - d * 0.66).rgb + texture2D(tScene, uv - d).rgb) * 0.25;
  } else col = texture2D(tScene, uv).rgb;
  col += texture2D(tBloom, uv).rgb * uBloom;
  col *= uExposure;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat * (1.0 - uDesat)) * uTint;
  col = aces(col);
  vec2 q = uv - 0.5; col *= 1.0 - dot(q, q) * uVig;
  col = mix(col, uFlashCol, uFlash);
  col = pow(col, vec3(0.4545));
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(col + (n - 0.5) / 255.0, 1.0); }`;

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = `uniform vec3 uTop, uHor, uBot, uSunDir, uSunCol, uCloud; uniform float uCover, uStars, uTime, uEnv, uMoon; varying vec3 vDir;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
  col = mix(col, uBot, smoothstep(0.02, -0.3, h));
  float sd = max(dot(d, uSunDir), 0.0);
  float disc = mix(smoothstep(0.9993, 0.9997, sd), smoothstep(0.9975, 0.9982, sd), uMoon);
  vec3 sun = uSunCol * (disc * mix(26.0, 5.0, uMoon) * (1.0 - uEnv * 0.9) + pow(sd, 160.0) * 1.1 + pow(sd, 10.0) * 0.2);
  col += sun * smoothstep(-0.05, 0.02, h);
  if (h > 0.0) {
    vec2 p = d.xz / (h + 0.18) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
    float n = fbm(p);
    float c = smoothstep(uCover, uCover + 0.32, n) * smoothstep(0.0, 0.2, h);
    vec3 cc = uCloud * (0.72 + 0.5 * smoothstep(0.25, 0.9, n)) + uSunCol * pow(sd, 5.0) * 0.35;
    if (uStars > 0.0) { vec2 sp = d.xz / (h + 0.45) * 70.0; vec2 ci = floor(sp); float st = hash(ci);
      float r = length(fract(sp) - 0.5); float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 50.0);
      col += vec3(1.0, 0.95, 0.88) * step(0.965, st) * smoothstep(0.22, 0.0, r) * uStars * tw * smoothstep(0.0, 0.3, h) * 4.0; }
    col = mix(col, cc, c * 0.9);
  }
  gl_FragColor = vec4(col, 1.0); }`;

export const GFX = {
  renderer: null, scene: null, camera: null, canvas: null,
  uRim: { value: new THREE.Color(0.2, 0.25, 0.35) },
  uTime: { value: 0 },
  q: QUALITY.mid, qName: 'mid', scale: 1, hdr: true,
  shakeAmt: 0, flash: 0, radial: 0, desat: 0, hfov: 78,
  sunDir: new THREE.Vector3(0.4, 0.7, -0.4).normalize(),
  _ft: 1 / 60, _acc: 0, _s4: 1 / 60, _best: 0.05, w: 1, h: 1, rw: 1, rh: 1,
  isMobile: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)),

  init(canvas, qName) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.setClearColor(0x000000, 1);
    const gl = r.getContext();
    this.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 1200);
    this.camera.position.set(0, 5, -10);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 180; sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.05;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.sun, this.sun.target, this.hemi);

    // 空
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      defines: { OCT: 4 },
      uniforms: {
        uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
        uSunDir: { value: this.sunDir }, uSunCol: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() },
        uCover: { value: 0.5 }, uStars: { value: 0 }, uTime: this.uTime, uEnv: { value: 0 }, uMoon: { value: 0 },
      },
    });
    const skyGeo = new THREE.SphereGeometry(400, 24, 14);
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -100;
    this.scene.add(this.sky);
    this.envScene = new THREE.Scene();
    const es = new THREE.Mesh(skyGeo, this.skyMat); es.frustumCulled = false; this.envScene.add(es);
    this.pmrem = new THREE.PMREMGenerator(r);

    // ポストプロセス
    this.fsScene = new THREE.Scene();
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(fsTri, null); this.quad.frustumCulled = false; this.fsScene.add(this.quad);
    this.mPre = pass(F_PRE, { tSrc: { value: null }, uTh: { value: 1.0 } });
    this.mDown = pass(F_DOWN, { tSrc: { value: null }, uHalf: { value: new THREE.Vector2() } });
    this.mUp = pass(F_UP, { tSrc: { value: null }, uHalf: { value: new THREE.Vector2() } },
      { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    this.mFinal = pass(F_FINAL, {
      tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.75 }, uExposure: { value: 1 }, uVig: { value: 0.55 },
      uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uSat: { value: 1.08 }, uRadial: { value: 0 }, uDesat: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) },
    });

    this.setQuality(qName);
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setTimeout(() => location.reload(), 500); });
  },

  setQuality(name) {
    if (name === 'auto' || !QUALITY[name]) name = this.isMobile ? 'mid' : 'high';
    this.qName = name; this.q = QUALITY[name];
    const r = this.renderer, q = this.q;
    r.shadowMap.enabled = q.shadow > 0;
    r.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.sun.castShadow = q.shadow > 0;
    if (q.shadow > 0) {
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.skyMat.defines.OCT = q.sky; this.skyMat.needsUpdate = true;
    this.scale = 1;
    this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    this.resize();
  },

  resize() {
    const w = this.w = Math.max(1, innerWidth), h = this.h = Math.max(1, innerHeight);
    const pr = Math.min(devicePixelRatio || 1, this.q.pr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    const asp = w / h;
    this.camera.aspect = asp;
    // 縦画面でも横方向の視野を確保
    const hf = this.hfov * Math.PI / 180;
    this.camera.fov = clamp(2 * Math.atan(Math.tan(hf / 2) / asp) * 180 / Math.PI, 28, 88);
    this.camera.updateProjectionMatrix();
    this._alloc();
  },

  _alloc() {
    const pr = this.renderer.getPixelRatio();
    const rw = Math.max(2, Math.round(this.w * pr * this.scale)), rh = Math.max(2, Math.round(this.h * pr * this.scale));
    if (rw === this.rw && rh === this.rh && this.rtScene && this.rtScene.samples === this.q.msaa && this.bl.length === this.q.bloomLv) return;
    this.rw = rw; this.rh = rh;
    if (this.rtScene) { this.rtScene.dispose(); this.bl.forEach((t) => t.dispose()); }
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rtScene = new THREE.WebGLRenderTarget(rw, rh, { type, samples: this.q.msaa, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.bl = [];
    let bw = rw >> 1, bh = rh >> 1;
    if (this.qName === 'low') { bw >>= 1; bh >>= 1; }
    for (let i = 0; i < this.q.bloomLv; i++) {
      this.bl.push(new THREE.WebGLRenderTarget(Math.max(2, bw), Math.max(2, bh), { type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }));
      bw >>= 1; bh >>= 1;
    }
    this.mPre.uniforms.uTh.value = this.hdr ? 1.12 : 0.82;
  },

  // ステージの雰囲気(空・光・霧・色調)を適用
  applyTheme(th) {
    const u = this.skyMat.uniforms;
    u.uTop.value.set(th.sky.top); u.uHor.value.set(th.sky.hor); u.uBot.value.set(th.sky.bot);
    u.uSunCol.value.set(th.sky.sun); u.uCloud.value.set(th.sky.cloud);
    u.uCover.value = th.sky.cover; u.uStars.value = th.sky.stars || 0; u.uMoon.value = th.sky.moon ? 1 : 0;
    this.sunDir.set(th.sunDir[0], th.sunDir[1], th.sunDir[2]).normalize();
    this.sun.color.set(th.sunCol); this.sun.intensity = th.sunI;
    this.hemi.color.set(th.hemi[0]); this.hemi.groundColor.set(th.hemi[1]); this.hemi.intensity = th.hemi[2];
    this.scene.fog = new THREE.Fog(new THREE.Color(th.fog[0]), th.fog[1], th.fog[2]);
    this.uRim.value.set(th.rim).multiplyScalar(th.rimI ?? 0.5);
    const f = this.mFinal.uniforms;
    f.uExposure.value = th.exposure ?? 1; f.uSat.value = th.sat ?? 1.08; f.uBloom.value = th.bloom ?? 0.75;
    f.uTint.value.setRGB(...(th.tint || [1, 1, 1]));
    if (this.envRT) this.envRT.dispose();
    u.uEnv.value = 1;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    u.uEnv.value = 0;
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = th.env ?? 0.5;
    this.updateSun(0, 0, 0);
  },

  updateSun(x, y, z) {
    // シャドウのちらつき防止にテクセル単位でスナップ
    const s = this.q.shadow > 0 ? 68 / this.q.shadow * 4 : 1;
    x = Math.round(x / s) * s; z = Math.round(z / s) * s;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + this.sunDir.x * 80, this.sunDir.y * 80, z + this.sunDir.z * 80);
    this.sun.target.updateMatrixWorld();
  },

  setFov(hfovDeg) { if (this.hfov === hfovDeg) return; this.hfov = hfovDeg; this.resize(); },
  shake(a) { this.shakeAmt = Math.min(1.6, Math.max(this.shakeAmt, a)); },
  doFlash(a = 0.6, color) { this.flash = Math.max(this.flash, a); if (color) this.mFinal.uniforms.uFlashCol.value.set(color); else this.mFinal.uniforms.uFlashCol.value.setRGB(1, 1, 1); },

  // フレーム時間から内部解像度を自動調整
  perf(dt) {
    // 端末の描画間隔(60Hz/30Hz制限など)を推定し、それより遅れている時だけ解像度を下げる
    this._s4 += (dt - this._s4) * 0.3;
    if (this._s4 > 0.004 && this._s4 < this._best) this._best = this._s4;
    this._best = Math.min(0.05, this._best * (1 + dt * 0.004));
    this._ft += (dt - this._ft) * 0.06;
    this._acc += dt;
    if (this._acc < 1.0) return;
    this._acc = 0;
    const target = Math.max(this._best, 1 / 61);
    let s = this.scale;
    if (this._ft > target * 1.25) s -= 0.1; else if (this._ft < target * 1.1 && s < 1) s += 0.05;
    s = clamp(s, 0.5, 1);
    if (Math.abs(s - this.scale) > 0.01) { this.scale = s; this._alloc(); }
  },
  get fps() { return 1 / this._ft; },

  render(dt) {
    const r = this.renderer;
    this.uTime.value += dt;
    // 画面揺れ
    if (this.shakeAmt > 0.002) {
      const a = this.shakeAmt;
      this.camera.position.x += (Math.random() - 0.5) * a; this.camera.position.y += (Math.random() - 0.5) * a; this.camera.position.z += (Math.random() - 0.5) * a;
      this.shakeAmt *= Math.exp(-9 * dt);
    }
    this.flash *= Math.exp(-7 * dt); this.radial *= Math.exp(-5 * dt);
    const f = this.mFinal.uniforms;
    f.uFlash.value = this.flash; f.uRadial.value = this.radial; f.uDesat.value = this.desat;

    r.setRenderTarget(this.rtScene);
    r.render(this.scene, this.camera);

    const bl = this.bl, n = bl.length;
    this.quad.material = this.mPre; this.mPre.uniforms.tSrc.value = this.rtScene.texture;
    r.setRenderTarget(bl[0]); r.render(this.fsScene, this.fsCam);
    this.quad.material = this.mDown;
    for (let i = 1; i < n; i++) {
      this.mDown.uniforms.tSrc.value = bl[i - 1].texture; this.mDown.uniforms.uHalf.value.set(0.5 / bl[i].width, 0.5 / bl[i].height);
      r.setRenderTarget(bl[i]); r.render(this.fsScene, this.fsCam);
    }
    r.autoClear = false;
    this.quad.material = this.mUp;
    for (let i = n - 1; i > 0; i--) {
      this.mUp.uniforms.tSrc.value = bl[i].texture; this.mUp.uniforms.uHalf.value.set(0.5 / bl[i - 1].width, 0.5 / bl[i - 1].height);
      r.setRenderTarget(bl[i - 1]); r.render(this.fsScene, this.fsCam);
    }
    r.autoClear = true;
    this.quad.material = this.mFinal;
    f.tScene.value = this.rtScene.texture; f.tBloom.value = bl[0].texture;
    r.setRenderTarget(null); r.render(this.fsScene, this.fsCam);
  },

  // ワールド座標→画面座標(px)。背面なら null
  toScreen(v, out) {
    out.copy(v).project(this.camera);
    if (out.z > 1) return null;
    out.x = (out.x * 0.5 + 0.5) * this.w; out.y = (-out.y * 0.5 + 0.5) * this.h;
    return out;
  },
};

// リムライト(輪郭光)を標準マテリアルへ注入。tint=true で雑兵用チーム色マスクも有効化
export function patchMat(mat, rim = 0.8, tint = false) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = GFX.uRim;
    if (tint) {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float tintMask;')
        .replace('#include <color_vertex>', `vColor = vec3(1.0);
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.xyz *= mix(vec3(1.0), instanceColor.xyz, tintMask);
#endif`);
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float rimF = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0); totalEmissiveRadiance += uRim * (rimF * rimF * rimF) * ${rim.toFixed(2)}; }`);
  };
  mat.customProgramCacheKey = () => 'rim' + rim.toFixed(2) + (tint ? 't' : '');
  return mat;
}
