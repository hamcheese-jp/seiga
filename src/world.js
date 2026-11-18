// 歩き回れる場所: 拠点の町(Town)と世界地図(WorldMap)。選んだ武将を歩かせ、建物や戦場に近づくと入れる
//   メニュー画面の代わり。町の中から店・装備・職業・出撃(世界地図)などへ入る
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { Stage } from './stage.js';
import { THEMES, HERO, ELEMENTS, STAGES, calcStats, ARMOR_SETS, ARMOR_SLOT_KEYS } from './data.js';
import { buildHero, disposeModel } from './models.js';
import { loadVrm, VrmBody, vrmProgress } from './vrmchar.js';
import { setArmor } from './armor.js';
import { Rig } from './rig.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { T } from './i18n.js';
import { Save } from './save.js';
import { TownNet } from './townnet.js';
import { EMOTE } from './emotes.js';
import { box, cyl, cone, at, merge, ico, torus, sph, lathe } from './geo.js';
import { clamp, damp } from './util.js';

const PI = Math.PI;
const vmat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });

// 看板の文字(キャンバスに描いて板やスプライトに貼る)
function labelTex(lines, w = 512, h = 160, bg = 'rgba(20,14,10,0.82)', fg = '#ffe9b8') {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
  c.fillStyle = bg; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 18); c.fill();
  c.strokeStyle = 'rgba(255,210,120,0.8)'; c.lineWidth = 5; c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const [a, b] = (Array.isArray(lines) ? lines : [lines]).map((x) => T(x));
  c.fillStyle = fg; let fs = b ? 62 : 74; c.font = `bold ${fs}px serif`; while (c.measureText(a).width > w - 40 && fs > 24) { fs -= 2; c.font = `bold ${fs}px serif`; }   // 長い名前は幅に合わせて縮める
  c.fillText(a, w / 2, b ? h * 0.38 : h / 2);
  if (b) { c.fillStyle = '#d8c8a8'; c.font = '36px sans-serif'; c.fillText(b, w / 2, h * 0.76); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// 頭の上の名前(自分は金、ほかの人は白)
function nameSprite(name, me) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const c = cv.getContext('2d');
  c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 10; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(name, 256, 50);
  c.fillStyle = me ? '#ffd76a' : '#ffffff'; c.fillText(name, 256, 50);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, depthTest: false, transparent: true }));
  s.scale.set(2.6, 2.6 * 96 / 512, 1); s.renderOrder = 40; return s;
}
// 頭の上の絵文字(アクション中)
function emojiSprite(e) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath(); c.arc(64, 60, 52, 0, 7); c.fill(); c.beginPath(); c.moveTo(52, 104); c.lineTo(64, 124); c.lineTo(76, 104); c.fill();
  c.font = '64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, 64, 62);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, depthTest: false, transparent: true }));
  s.scale.set(1.1, 1.1, 1); s.renderOrder = 41; return s;
}
const freeSprite = (s) => { if (!s) return; if (s.parent) s.parent.remove(s); s.material.map.dispose(); s.material.dispose(); };
function labelSprite(lines, scale = 3.2) {
  const m = new THREE.SpriteMaterial({ map: labelTex(lines), depthWrite: false, transparent: true });
  const s = new THREE.Sprite(m); s.scale.set(scale, scale * 160 / 512, 1); s.renderOrder = 30; return s;
}

// 歩き回れる場所の共通部分
class Field {
  constructor(def, theme) {
    GFX.setFov(56);
    GFX.applyTheme(THEMES[theme] || THEMES.plains);
    this.stage = new Stage(def);
    FX.init(); FX.clear();
    this.group = new THREE.Group(); GFX.scene.add(this.group);
    this.mats = []; this.texs = [];
    this.spots = [];        // 入口: { x, z, r, name, sub, act }
    this.solids = [];       // 建物の当たり: { x, z, r }
    this.p = { x: 0, z: 0, y: 0, yaw: 0, vx: 0, vz: 0 };
    this.cam = { yaw: 0, pitch: 0.42, dist: 7.5, x: 0, y: 1.5, z: 0 };
    this.frame = 'home'; this.t = 0; this.near = null;
    this._prompt();
  }
  // 入口に近づいた時の案内(押すと入る)
  _prompt() {
    let e = document.getElementById('field-prompt');
    if (!e) {
      e = document.createElement('button'); e.id = 'field-prompt'; e.type = 'button';
      e.addEventListener('click', (ev) => { ev.stopPropagation(); const f = window.__app && window.__app.field; if (f && f.near) f.enter(f.near); });
      document.body.appendChild(e);
    }
    this.promptEl = e;
  }
  add(mesh) { this.group.add(mesh); return mesh; }
  mesh(list, mat) { const m = new THREE.Mesh(merge(list), mat || this.vm || (this.vm = vmat())); m.castShadow = true; m.receiveShadow = true; this.group.add(m); return m; }
  label(lines, x, y, z, scale) { const s = labelSprite(lines, scale); s.position.set(x, y, z); this.texs.push(s.material.map); this.mats.push(s.material); this.group.add(s); return s; }
  setHero(id, force) {
    if (this.heroId === id && !force) return;
    this._drop();
    const h = HERO[id], st = calcStats(Save.data, id), E = ELEMENTS[h.elem];
    this.heroId = id; this.col = E.glow;
    const model = this.model = buildHero({ ...h.look, pal: { ...h.look.pal, glow: E.glow } }, st.wtype, st.tier);
    GFX.scene.add(model.root); model.root.visible = false;
    this.rig = new Rig(model);
    this.loading = id;
    loadVrm(h.vrm || id).then((vrm) => { if (this.model !== model) return; if (vrm) { new VrmBody(model, vrm); setArmor(vrm, h.vrm || id, st.armor); } model.root.visible = true; this.loading = null; FX.shell(this.p.x, 1.5, this.p.z, this.col, 0.6, 2.2, 0.35, 0.45); })
      .catch((e) => { console.warn(e); model.root.visible = true; this.loading = null; });
  }
  // 読み込み中の表示(重いキャラのデータを待つ間)
  _loadingUi() {
    let e = document.getElementById('field-loading');
    if (this.loading && this.frame !== 'scene') {
      if (!e) { e = document.createElement('div'); e.id = 'field-loading'; document.body.appendChild(e); }
      e.textContent = T(`キャラクターを読み込み中… ${Math.round(vrmProgress(this.loading) * 100)}%`); e.classList.add('on');
    } else if (e) e.classList.remove('on');
  }
  // アクションを始める(自分)
  emote(k) { if (!EMOTE[k] || !this.model) return false; this.emo = { k, t: 0 }; return true; }
  // アクションの進行(自分・ほかの人で共通)。o.emo = { k, t }
  _emoteStep(o, rig, speed, dt, x, y, z, heroId) {
    if (!rig) return;
    const E = o.emo && EMOTE[o.emo.k];
    if (E && (speed > 1.2 && o.emo.t > 0.25 || o.emo.t > E.dur)) o.emo = null;
    // アクション中は武器をしまう
    const wm = rig.model && rig.model.wMeshes, show = !(o.emo && E);
    if (wm && wm._shown !== show) { wm._shown = show; for (const m of [...wm.R, ...wm.L]) m.visible = show; }
    if (o.emo && E) {
      o.emo.t += dt; rig.customPose = { ...E.pose(o.emo.t), free: true }; rig.setMode('pose');
      if (!o.bubble || o.bubbleK !== E.k) { freeSprite(o.bubble); o.bubble = emojiSprite(E.e); o.bubbleK = E.k; this.group.add(o.bubble); }
      o.bubble.position.set(x, y + 2.35 * ((HERO[heroId] && HERO[heroId].look.scale) || 1) + 0.9, z);
    } else {
      if (rig.mode === 'pose') { rig.customPose = null; rig.setMode('loco'); }
      if (o.bubble) { freeSprite(o.bubble); o.bubble = null; o.bubbleK = null; }
    }
  }
  _drop() { if (this.model) { disposeModel(this.model); this.model = null; this.rig = null; } }
  setFrame(name) { this.frame = name; }
  // 入る(各画面を開く)。歩くのを止めて、その場で画面を重ねる
  enter(s) { if (!s || this.frame !== 'home') return; this.p.vx = this.p.vz = 0; s.act(); }
  update(dt) {
    this.t += dt; this.stage.update(dt);
    const P = this.p, walking = this.frame === 'home';
    // 移動: スティック・WASD をカメラの向きに合わせる
    let ix = 0, iz = 0;
    if (walking) { ix = Input.mx; iz = Input.my; if (Input.camDX || Input.camDY) { this.cam.yaw -= Input.camDX * 0.006; this.cam.pitch = clamp(this.cam.pitch + Input.camDY * 0.004, 0.12, 1.0); } }
    const m = Math.hypot(ix, iz), spd = this.walkSpd || 7.2;
    const fx = Math.sin(this.cam.yaw), fz = Math.cos(this.cam.yaw);
    // カメラから見た右方向は (-fz, fx)。右入力で画面の右へ進む
    const wx = (-ix * fz + iz * fx) * spd, wz = (ix * fx + iz * fz) * spd;
    P.vx = damp(P.vx, m > 0.05 ? wx : 0, 10, dt); P.vz = damp(P.vz, m > 0.05 ? wz : 0, 10, dt);
    P.x += P.vx * dt; P.z += P.vz * dt;
    const sp = Math.hypot(P.vx, P.vz);
    if (sp > 0.3) { const ty = Math.atan2(P.vx, P.vz); let d = ty - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); P.yaw += d * Math.min(1, dt * 12); }
    for (const o of this.solids) { const dx = P.x - o.x, dz = P.z - o.z, d = Math.hypot(dx, dz), mn = o.r + 0.45; if (d < mn && d > 1e-4) { P.x = o.x + dx / d * mn; P.z = o.z + dz / d * mn; } }
    this.stage.constrain(P, 0.45);
    P.y = this.stage.heightAt(P.x, P.z);
    if (this.model) {
      const r = this.model.root; r.position.set(P.x, P.y, P.z); r.rotation.y = P.yaw;
      this._emoteStep(this, this.rig, sp, dt, P.x, P.y, P.z, this.heroId);
      this.rig.speed = sp; this.rig.update(dt);   // VRM の体は rig.update の中で合わせる
    }
    // 入口の案内
    let near = null, best = 1e9;
    if (walking) for (const s of this.spots) { const d = Math.hypot(P.x - s.x, P.z - s.z); if (d < s.r && d < best) { best = d; near = s; } }
    if (near !== this.near) { this.near = near; if (near) this.promptEl.innerHTML = `<b>${near.name}</b><small>${near.sub || ''}</small><i>${Input.usedTouch ? 'タップで入る' : 'J / Enter で入る'}</i>`; }
    this.promptEl.classList.toggle('on', !!near);
    if (near && Input.consume('a', 0.3)) this.enter(near);
    this._loadingUi();
    this.onUpdate && this.onUpdate(dt);
    FX.update(dt);
    this._camera(dt);
    GFX.updateSun(P.x, 0, P.z);
  }
  _camera(dt) {
    const C = this.cam, P = this.p, cam = GFX.camera, port = cam.aspect < 1;
    let dist = (port ? 9 : 7.5) * (this.camK || 1), pitch = this.camPitch ?? C.pitch, tx = P.x, ty = P.y + 1.4, tz = P.z, yaw = C.yaw;
    if (this.frame === 'title') { yaw = C.yaw + this.t * 0.05; dist = 22; pitch = 0.55; }
    else if (this.frame !== 'home') {
      // 画面を開いている間: 武将の正面に寄る(装備のプレビュー)
      yaw = P.yaw + PI + (port ? 0 : 0.5); dist = port ? 4.2 : 4.6; pitch = 0.12; ty = P.y + (port ? 0.7 : 1.2);
      if (!port) { tx += Math.cos(yaw) * 1.3; tz -= Math.sin(yaw) * 1.3; }
    }
    if (this.camAhead && this.frame === 'home') { tx += Math.sin(yaw) * this.camAhead; tz += Math.cos(yaw) * this.camAhead; ty += 1.5; }   // 進む先を見る
    const k = 1 - Math.exp(-6 * dt);
    C.x += (tx - C.x) * k; C.y += (ty - C.y) * k; C.z += (tz - C.z) * k;
    C.d = C.d === undefined ? dist : C.d + (dist - C.d) * k; C.p = C.p === undefined ? pitch : C.p + (pitch - C.p) * k;
    let dy = yaw - (C.y2 ?? yaw); dy = Math.atan2(Math.sin(dy), Math.cos(dy)); C.y2 = (C.y2 ?? yaw) + dy * k;
    const back = C.d * Math.cos(C.p);
    let cy = C.y + C.d * Math.sin(C.p);
    const cx = C.x - Math.sin(C.y2) * back, cz = C.z - Math.cos(C.y2) * back;
    cy = Math.max(cy, this.stage.heightAt(cx, cz) + 0.6);
    cam.position.set(cx, cy, cz); cam.lookAt(C.x, C.y, C.z);
  }
  dispose() {
    this.promptEl.classList.remove('on'); this.loading = null; this._loadingUi();
    if (this.onDispose) this.onDispose();
    this._drop(); this.stage.dispose(); FX.clear();
    GFX.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose(); for (const t of this.texs) t.dispose(); if (this.vm) this.vm.dispose();
  }
}

// ---- 町の建物: 店ごとに形と色を変える。{ g: 部品, r: 当たりの半径, h: 看板の高さ } ----
const door = (w, h, z, c = '#24180f') => at(box(w, h, 0.12, c), 0, h / 2, z);
const roof4 = (w, h, y, c, sx = 1.25, sz = 0.95) => at(cone(w, h, c, 4), 0, y, 0, 0, PI / 4, 0, sx, 1, sz);
function houseParts(kind, wall) {
  switch (kind) {
    case 'shop': {   // 道具屋: 木の店構え、赤白の日よけ、木箱と樽
      const g = [at(box(7, 3.2, 5, '#c8a678'), 0, 1.6, 0), at(box(7.3, 0.35, 5.3, '#6a4630'), 0, 0.18, 0), roof4(5.4, 2.0, 4.2, '#7a4a2a'), door(2.2, 2.4, 2.56)];
      for (let i = 0; i < 7; i++) g.push(at(box(1.0, 0.08, 1.8, i % 2 ? '#f2e6c8' : '#d84a3a'), -3 + i, 2.9, 3.2, 0.35));
      g.push(at(box(0.9, 0.9, 0.9, '#a07a4a'), -2.8, 0.45, 3.4), at(box(0.7, 0.7, 0.7, '#8a6438'), -2.7, 1.25, 3.3), at(cyl(0.45, 0.45, 1.0, '#7a5030', 10), 2.9, 0.5, 3.3), at(cyl(0.45, 0.45, 1.0, '#6a4428', 10), 2.0, 0.5, 3.6));
      return { g, r: 3.8, h: 4.6 };
    }
    case 'smith': {  // 鍛冶屋: 石造り、煙突と炉の火、金床
      return { g: [at(box(7, 3.2, 5, '#6c6c74'), 0, 1.6, 0), at(box(7.3, 0.4, 5.3, '#3a3a40'), 0, 0.2, 0), roof4(5.4, 1.8, 4.1, '#24242a'), door(2.0, 2.4, 2.56, '#1a1410'),
        at(box(1.1, 5.2, 1.1, '#55555c'), 2.4, 2.6, -1.4), at(cyl(0.45, 0.45, 0.4, '#ff7a2a', 8), 2.4, 5.3, -1.4), at(box(1.6, 0.9, 0.2, '#ff5a1e'), 2.3, 1.0, 2.58),
        at(box(1.0, 0.35, 0.5, '#2a2a30'), -2.6, 0.9, 3.4), at(box(0.4, 0.7, 0.4, '#3a3a40'), -2.6, 0.35, 3.4)], r: 3.8, h: 4.4 };
    }
    case 'dojo': {   // 道場: 低い基壇の上の広い堂、二重の屋根、白い扁額
      return { g: [at(box(9.2, 0.6, 6.6, '#5a4030'), 0, 0.3, 0), at(box(8, 3.0, 5.6, '#f0eadc'), 0, 2.1, 0),
        ...[-3.8, -1.3, 1.3, 3.8].map((px) => at(box(0.35, 3.2, 0.35, '#7a2a1e'), px, 2.1, 2.85)),
        roof4(7.2, 1.7, 4.4, '#2e2e38', 1.35, 1.0), roof4(4.6, 1.5, 5.7, '#2e2e38', 1.3, 1.0), at(box(2.4, 0.8, 0.12, '#f8f4e8'), 0, 3.2, 2.9), at(box(2.6, 1.0, 0.08, '#3a2418'), 0, 3.2, 2.86), door(2.6, 2.2, 2.82, '#3a2418')], r: 4.6, h: 5.8 };
    }
    case 'guard': {  // 詰所: 石の砦、胸壁と青い旗
      const g = [at(box(6.6, 4.4, 6, '#8a8578'), 0, 2.2, 0), at(box(7, 0.5, 6.4, '#5c584e'), 0, 4.45, 0), door(2.2, 2.8, 3.06, '#2a2420'),
        at(box(1.0, 2.6, 0.06, '#2a5ab8'), -2.2, 2.9, 3.05), at(box(1.0, 2.6, 0.06, '#2a5ab8'), 2.2, 2.9, 3.05), at(box(0.5, 0.5, 0.07, '#e8eef8'), -2.2, 3.5, 3.09), at(box(0.5, 0.5, 0.07, '#e8eef8'), 2.2, 3.5, 3.09)];
      for (let i = -3; i <= 3; i += 1.5) for (const z of [-3, 3]) g.push(at(box(0.8, 0.7, 0.6, '#8a8578'), i, 5.0, z));
      return { g, r: 4.0, h: 6.4 };
    }
    case 'tavern': { // 酒場: 二階建ての木造、赤い提灯の列
      const g = [at(box(7.6, 5.4, 5.4, '#9a5a3a'), 0, 2.7, 0), at(box(7.9, 0.3, 5.7, '#5a3420'), 0, 2.8, 0), roof4(5.8, 2.2, 6.5, '#6a1e1a'), door(2.4, 2.4, 2.76, '#2a160c'),
        at(box(5.6, 0.9, 0.1, '#ffd98a'), 0, 4.2, 2.72)];
      for (let i = -3; i <= 3; i += 1.5) g.push(at(cyl(0.28, 0.28, 0.6, '#e8402a', 8), i, 3.2, 2.95));
      return { g, r: 4.0, h: 7.4 };
    }
    case 'story': {  // 語り部: 星模様の天幕
      return { g: [at(cyl(3.6, 3.6, 2.6, '#4a3a6a', 14), 0, 1.3, 0), at(cone(4.3, 2.8, '#2a1e48', 14), 0, 4.0, 0), at(ico(0.45, '#ffd76a', 0), 0, 5.6, 0),
        at(box(1.6, 2.2, 0.15, '#1a1230'), 0, 1.1, 3.55), ...[0, 1, 2, 3, 4, 5].map((i) => at(ico(0.18, '#ffe9a8', 0), Math.sin(i + 0.6) * 3.62, 1.6 + (i % 2) * 0.6, Math.cos(i + 0.6) * 3.62))], r: 3.9, h: 6.2 };
    }
    case 'inn': {    // 宿: 大きな二階建て、緑の屋根、灯りのともった窓と縁側
      const g = [at(box(8.6, 5.6, 5.6, '#ece4d4'), 0, 2.8, 0), at(box(8.9, 0.4, 5.9, '#2e5a3e'), 0, 0.2, 0), roof4(7.0, 2.4, 6.8, '#2e5a3e', 1.3, 0.95),
        at(box(8.6, 0.25, 1.4, '#5a3a24'), 0, 2.9, 3.3), at(box(8.6, 0.6, 0.1, '#5a3a24'), 0, 3.3, 4.0), door(2.2, 2.4, 2.86, '#2a1a10')];
      for (const px of [-3, -1, 1, 3]) g.push(at(box(1.0, 0.9, 0.08, '#ffd98a'), px, 4.4, 2.84));
      for (const px of [-3, 3]) g.push(at(box(1.0, 0.9, 0.08, '#ffd98a'), px, 1.6, 2.84));
      return { g, r: 4.4, h: 8.0 };
    }
    default:
      return { g: [at(box(7, 3.4, 5.2, '#e8e0d0'), 0, 1.7, 0), at(box(7.3, 0.4, 5.5, wall), 0, 0.2, 0), roof4(5.6, 2.4, 4.6, '#3a3a44'), door(2.0, 2.4, 2.62)], r: 3.6, h: 4.4 };
  }
}

// ================= 拠点の町 =================
// 広場を囲む建物: [名前, 説明, 角度(度), 色, 入った時の動作]
export class Town extends Field {
  constructor(ui) {
    super({ id: 'town', theme: 'plains', size: 230, nodes: [[0, 0, 72], [0, -86, 11]], links: [[0, 1, 11]], bases: [] }, 'plains');
    this.walkSpd = 9;
    this.ui = ui;
    const B = [
      ['道具屋', '武器・防具を買う', 30, '#6a4630', () => ui.show('shop'), 'shop'],
      ['鍛冶屋', '武器・防具の装備と強化', 75, '#4c4c58', () => { ui.armMode = 'weapon'; ui.act('go', 'armory'); }, 'smith'],
      ['道場', '職業・転職', 120, '#5a3a2a', () => { ui.armMode = 'job'; ui.act('go', 'armory'); }, 'dojo'],
      ['詰所', '武将を入れ替える', 165, '#3e4a5a', () => { ui.heroBack = 'home'; ui.show('hero'); }, 'guard'],
      ['酒場', 'オンラインで協力・対戦', 210, '#6a3a3a', () => ui.act('go', 'coop'), 'tavern'],
      ['語り部', '物語をふり返る', 255, '#4a3a5a', () => ui.act('go', 'story'), 'story'],
      ['高札', '称号・ランキング', 300, '#5a5a3a', () => ui.act('go', 'ach')],
      ['宿', '設定・データの保存', 335, '#3a5a4a', () => ui.act('go', 'settings'), 'inn'],
    ];
    const R = 52;
    for (const [name, sub, deg, wall, act, kind] of B) {
      const a = deg * PI / 180, x = Math.sin(a) * R, z = Math.cos(a) * R, ry = a + PI;   // 正面を広場の中心へ
      const y = this.stage.heightAt(x, z);
      if (name === '高札') {
        const m = this.mesh([at(box(3.6, 2.2, 0.2, '#7a5a3a'), 0, 2.4, 0), at(cyl(0.12, 0.14, 3.5, '#4a3222', 6), -1.6, 1.75, 0), at(cyl(0.12, 0.14, 3.5, '#4a3222', 6), 1.6, 1.75, 0), at(box(4.2, 0.25, 0.6, '#3a2a1a'), 0, 3.6, 0)]);
        m.position.set(x, y, z); m.rotation.y = ry;
        this.solids.push({ x, z, r: 1.6 });
      } else {
        // 建物: 店ごとに形と色が違う
        const H = houseParts(kind, wall); this._lh = H.h;
        const m = this.mesh(H.g); m.position.set(x, y, z); m.rotation.y = ry;
        this.solids.push({ x, z, r: H.r });
      }
      // 看板と入口
      const fx = x + Math.sin(ry) * 5.0, fz = z + Math.cos(ry) * 5.0;
      this.label([name, sub], x + Math.sin(ry) * 3.4, y + (name === '高札' ? 4.4 : this._lh || 4.4), z + Math.cos(ry) * 3.4, 3.4);
      this.spots.push({ x: fx, z: fz, r: 3.2, name, sub, act });
      // 提灯
      const lx = fx + Math.cos(ry) * 1.8, lz = fz - Math.sin(ry) * 1.8;
      this.mesh([at(cyl(0.05, 0.06, 2.2, '#3a2a1a', 5), 0, 1.1, 0), at(cyl(0.28, 0.28, 0.5, '#ffd27a', 10), 0, 2.4, 0)]).position.set(lx, this.stage.heightAt(lx, lz), lz);
    }
    // 出陣の門(南): 鳥居のような大門。くぐると世界地図へ
    const gz = -72, gy = this.stage.heightAt(0, gz);
    this.mesh([at(cyl(0.45, 0.5, 7, '#a8321e', 10), -4, 3.5, 0), at(cyl(0.45, 0.5, 7, '#a8321e', 10), 4, 3.5, 0), at(box(11, 0.7, 1.0, '#a8321e'), 0, 6.4, 0), at(box(12.4, 0.5, 1.4, '#2a1a14'), 0, 7.1, 0), at(box(9, 0.45, 0.6, '#a8321e'), 0, 5.2, 0)]).position.set(0, gy, gz);
    this.label(['出陣の門', '世界地図へ'], 0, gy + 8.4, gz, 4);
    this.spots.push({ x: 0, z: gz - 1, r: 4, name: '出陣の門', sub: '世界地図へ出る', act: () => ui.app.toField('map') });
    this.solids.push({ x: -4, z: gz, r: 0.6 }, { x: 4, z: gz, r: 0.6 });
    // 広場の中央: 三段の噴水
    this._fountain();
    this._plaza();
    this.ghosts = new Map(); this.myName = null;
    this.onDispose = () => { TownNet.stop(); for (const g of this.ghosts.values()) this._dropGhost(g); this.ghosts.clear(); freeSprite(this.myName); };
    this.p.x = 0; this.p.z = -14; this.p.yaw = 0; this.cam.yaw = 0;
  }
  // 噴水: 石の水盤(下・中・上の三段)。上から噴き上がった水が、縁からあふれて下の段へ落ちる
  _fountain() {
    const y = this.stage.heightAt(0, 0), stone = '#b0a792', dark = '#8f8672';
    const g = [
      at(lathe([[0, 0], [6.6, 0], [6.9, 0.15], [6.9, 0.95], [6.5, 1.0], [6.3, 0.95], [6.3, 0.3], [0, 0.3]], stone, 56), 0, 0, 0),
      at(cyl(0.9, 1.25, 1.6, dark, 16), 0, 1.1, 0),
      at(lathe([[0, 0], [1.2, 0.05], [2.7, 0.25], [3.1, 0.65], [3.05, 0.75], [2.85, 0.72], [2.45, 0.35], [0, 0.35]], stone, 40), 0, 1.75, 0),
      at(cyl(0.32, 0.48, 1.6, dark, 12), 0, 2.9, 0),
      at(lathe([[0, 0], [0.6, 0.05], [1.2, 0.3], [1.4, 0.55], [1.35, 0.62], [1.2, 0.6], [1.0, 0.3], [0, 0.3]], stone, 32), 0, 3.6, 0),
      at(cyl(0.12, 0.18, 0.5, dark, 8), 0, 4.35, 0),
    ];
    this.mesh(g).position.set(0, y, 0);
    this.solids.push({ x: 0, z: 0, r: 7.0 });
    // 水面(ゆらめく)
    const wmat = () => { const m = new THREE.MeshStandardMaterial({ color: '#4f9ed8', emissive: '#1a4a7a', emissiveIntensity: 0.25, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.82 }); this.mats.push(m); return m; };
    this.water = [[6.3, 0.85], [2.85, 2.38], [1.22, 4.1]].map(([rad, wy]) => { const m = new THREE.Mesh(new THREE.CircleGeometry(rad, 48), wmat()); m.rotation.x = -PI / 2; m.position.set(0, y + wy, 0); this.group.add(m); return m; });
    // 縁から流れ落ちる水の膜
    const sheet = (rad, top, bot) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad + 0.18, top - bot, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#cfe8ff', roughness: 0.1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })); this.mats.push(m.material); m.position.set(0, y + (top + bot) / 2, 0); this.group.add(m); return m; };
    this.sheets = [sheet(1.42, 4.15, 2.4), sheet(3.12, 2.45, 0.86)];
    // しぶき(粒): 0 = 中央から噴き上がる, 1 = 上の段からこぼれる, 2 = 中の段からこぼれる
    const N = 1100, pos = new Float32Array(N * 3), P = this.fp = { n: N, pos, v: new Float32Array(N * 3), k: new Uint8Array(N), y };
    for (let i = 0; i < N; i++) { P.k[i] = i < 420 ? 0 : i < 700 ? 1 : 2; this._sprayReset(i, true); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dc = document.createElement('canvas'); dc.width = dc.height = 32; const dx = dc.getContext('2d'), gr = dx.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(230,245,255,0.8)'); gr.addColorStop(1, 'rgba(230,245,255,0)'); dx.fillStyle = gr; dx.fillRect(0, 0, 32, 32);
    const dt = new THREE.CanvasTexture(dc); this.texs.push(dt);
    const pm = new THREE.PointsMaterial({ color: '#eef8ff', map: dt, size: 0.2, transparent: true, opacity: 0.9, depthWrite: false });
    this.mats.push(pm); this.spray = new THREE.Points(geo, pm); this.spray.frustumCulled = false; this.group.add(this.spray);
  }
  // 粒を出し直す
  _sprayReset(i, init) {
    const P = this.fp, o = i * 3, a = Math.random() * PI * 2, k = P.k[i];
    if (k === 0) { const sp = 0.25 + Math.random() * 0.55; P.pos[o] = Math.cos(a) * 0.05; P.pos[o + 1] = P.y + 4.6; P.pos[o + 2] = Math.sin(a) * 0.05; P.v[o] = Math.cos(a) * sp; P.v[o + 1] = 3.8 + Math.random() * 1.4; P.v[o + 2] = Math.sin(a) * sp; }
    else { const rad = k === 1 ? 1.4 : 3.1, h = k === 1 ? 4.15 : 2.42, sp = 0.35 + Math.random() * 0.35; P.pos[o] = Math.cos(a) * rad; P.pos[o + 1] = P.y + h; P.pos[o + 2] = Math.sin(a) * rad; P.v[o] = Math.cos(a) * sp; P.v[o + 1] = -Math.random() * 0.3; P.v[o + 2] = Math.sin(a) * sp; }
    if (init) { const t = Math.random() * 1.2; P.pos[o] += P.v[o] * t; P.pos[o + 1] += P.v[o + 1] * t - 4.9 * t * t; P.pos[o + 2] += P.v[o + 2] * t; P.v[o + 1] -= 9.8 * t; }
  }
  _fountainUpdate(dt) {
    const P = this.fp; if (!P) return;
    const floor = [P.y + 4.1, P.y + 2.38, P.y + 0.85];
    for (let i = 0; i < P.n; i++) {
      const o = i * 3; P.v[o + 1] -= 9.8 * dt;
      P.pos[o] += P.v[o] * dt; P.pos[o + 1] += P.v[o + 1] * dt; P.pos[o + 2] += P.v[o + 2] * dt;
      if (P.pos[o + 1] < floor[P.k[i]] && P.v[o + 1] < 0) this._sprayReset(i);
    }
    this.spray.geometry.attributes.position.needsUpdate = true;
    // 水面と水の膜を少し揺らす
    const t = this.t;
    this.water.forEach((w, j) => { w.material.emissiveIntensity = 0.22 + 0.08 * Math.sin(t * 3.1 + j * 1.7); w.position.y += Math.sin(t * 2.3 + j) * 0.0006; });
    this.sheets.forEach((m, j) => { m.material.opacity = 0.26 + 0.08 * Math.sin(t * 7 + j * 2); m.rotation.y += dt * 0.3; });
  }
  // 広場の飾り: 石畳の輪・並木・ベンチ・灯籠
  _plaza() {
    const y0 = (x, z) => this.stage.heightAt(x, z);
    // 石畳(広場いっぱい)と、模様の輪
    for (const [r0, r1, col, dy] of [[0, 40, '#b3a993', 0.03], [9.3, 10.7, '#8f8672', 0.05], [21.4, 22.6, '#8f8672', 0.05], [35.2, 36.8, '#8f8672', 0.05], [39.2, 40.4, '#7a7262', 0.05]]) {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 }));
      m.rotation.x = -PI / 2; m.position.y = y0(0, 0) + dy; m.receiveShadow = true; this.mats.push(m.material); this.group.add(m);
    }
    // 市場の屋台(赤・青・黄の日よけ)と花壇
    const AW = ['#d84a3a', '#3a6ad8', '#e8b83a', '#3aa86a', '#c85ad8', '#e87a3a'];
    for (let i = 0; i < 6; i++) {
      const a = (i + 0.5) / 6 * PI * 2 + 0.26, x = Math.sin(a) * 26, z = Math.cos(a) * 26;
      if (Math.abs(Math.atan2(Math.sin(a - PI), Math.cos(a - PI))) < 0.45) continue;
      const m = this.mesh([at(box(3.2, 1.0, 1.4, '#8a6438'), 0, 0.5, 0), ...[-1.4, 1.4].flatMap((px) => [-0.6, 0.6].map((pz) => at(cyl(0.07, 0.07, 2.4, '#5a3a24', 5), px, 1.2, pz))),
        at(box(3.6, 0.12, 2.0, AW[i]), 0, 2.45, 0, 0.18), at(box(0.5, 0.35, 0.5, '#e8d06a'), -0.8, 1.17, 0), at(sph(0.25, '#d84a3a', 8, 6), 0.4, 1.2, 0.1), at(sph(0.25, '#f2a03a', 8, 6), 0.9, 1.2, -0.1)]);
      m.position.set(x, y0(x, z), z); m.rotation.y = a + PI; this.solids.push({ x, z, r: 1.8 });
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * PI * 2, x = Math.sin(a) * 10, z = Math.cos(a) * 10;
      if (Math.abs(Math.atan2(Math.sin(a - PI), Math.cos(a - PI))) < 0.3) continue;
      const fl = ['#ff7aa8', '#ffd76a', '#ffffff', '#b07aff'][i % 4];
      this.mesh([at(cyl(1.2, 1.3, 0.5, '#8a8272', 10), 0, 0.25, 0), at(cyl(1.05, 1.05, 0.1, '#4a7a2e', 10), 0, 0.52, 0), ...[0, 1, 2, 3, 4].map((k) => at(sph(0.22, fl, 6, 4), Math.sin(k * 1.3) * 0.6, 0.7, Math.cos(k * 1.3) * 0.6))]).position.set(x, y0(x, z), z);
      this.solids.push({ x, z, r: 1.3 });
    }
    for (let i = 0; i < 16; i++) {
      const a = (i + 0.5) / 16 * PI * 2; if (Math.abs(Math.atan2(Math.sin(a - PI), Math.cos(a - PI))) < 0.3) continue;   // 門への道はあける
      const x = Math.sin(a) * 30, z = Math.cos(a) * 30, y = y0(x, z);
      if (i % 2) { this.mesh([at(cyl(0.25, 0.35, 2.6, '#5a3a24', 6), 0, 1.3, 0), at(cone(1.9, 3.4, '#3f7a2e', 7), 0, 3.6, 0), at(cone(1.4, 2.6, '#4f9036', 7), 0, 5.0, 0)]).position.set(x, y, z); this.solids.push({ x, z, r: 0.6 }); }
      else { const m = this.mesh([at(box(2.4, 0.18, 0.7, '#7a5636'), 0, 0.55, 0), at(box(0.18, 0.5, 0.6, '#4a3222'), -1, 0.25, 0), at(box(0.18, 0.5, 0.6, '#4a3222'), 1, 0.25, 0)]); m.position.set(x, y, z); m.rotation.y = a; }
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * PI * 2 + PI / 8, x = Math.sin(a) * 16, z = Math.cos(a) * 16;
      this.mesh([at(cyl(0.35, 0.45, 0.5, '#8a8478', 6), 0, 0.25, 0), at(cyl(0.12, 0.12, 1.4, '#8a8478', 6), 0, 1.2, 0), at(box(0.8, 0.7, 0.8, '#ffd27a'), 0, 2.2, 0), at(cone(0.75, 0.5, '#5a5448', 4), 0, 2.8, 0, 0, PI / 4, 0)]).position.set(x, y0(x, z), z);
      this.solids.push({ x, z, r: 0.5 });
    }
  }
  // ---- ほかのプレイヤー(町で同時に遊んでいる人) ----
  _me() {
    const S = Save.data, st = calcStats(S, this.heroId || 'reiga');
    return { n: S.name, h: this.heroId || 'reiga', a: st.armor, x: this.p.x, z: this.p.z, r: this.p.yaw, m: Math.hypot(this.p.vx, this.p.vz) };
  }
  _ghost(id, o) {
    const h = HERO[o.h] || HERO.reiga, model = buildHero({ ...h.look }, h.wtype, 0);
    GFX.scene.add(model.root); model.root.visible = false; model.root.position.set(o.x, this.stage.heightAt(o.x, o.z), o.z);
    const g = { id, h: o.h, model, rig: new Rig(model), x: o.x, z: o.z, r: o.r || 0, name: null, nameTxt: '' };
    loadVrm(h.vrm || h.id).then((vrm) => { if (g.dead) return; if (vrm) { new VrmBody(model, vrm); setArmor(vrm, h.vrm || h.id, ARMOR_SLOT_KEYS.reduce((m, k) => (m[k] = (o.a && ARMOR_SETS[o.a[k]] ? o.a[k] : 'guren'), m), {})); } model.root.visible = true; }).catch(() => { model.root.visible = true; });
    return g;
  }
  _dropGhost(g) { g.dead = true; freeSprite(g.name); freeSprite(g.bubble); disposeModel(g.model); }
  _ghosts(dt) {
    const others = TownNet.others, P = this.p, MAXG = 8;
    // 近い人から最大8人だけ描く(スマホの負担を抑える)
    const want = [...others].map(([id, o]) => [id, o, Math.hypot(o.x - P.x, o.z - P.z)]).sort((a, b) => a[2] - b[2]).slice(0, MAXG);
    const keep = new Set(want.map((w) => w[0]));
    for (const [id, g] of this.ghosts) if (!keep.has(id) || (others.get(id) && others.get(id).h !== g.h)) { this._dropGhost(g); this.ghosts.delete(id); }
    for (const [id, o] of want) {
      let g = this.ghosts.get(id); if (!g) { g = this._ghost(id, o); this.ghosts.set(id, g); }
      const k = Math.min(1, dt * 8); g.x += (o.x - g.x) * k; g.z += (o.z - g.z) * k;
      let d = (o.r || 0) - g.r; d = Math.atan2(Math.sin(d), Math.cos(d)); g.r += d * Math.min(1, dt * 10);
      const y = this.stage.heightAt(g.x, g.z), r = g.model.root; r.position.set(g.x, y, g.z); r.rotation.y = g.r;
      if (o.eN && o.eN !== g.eN) { g.eN = o.eN; g.emo = { k: o.e, t: 0 }; }
      this._emoteStep(g, g.rig, o.m || 0, dt, g.x, y, g.z, o.h);
      g.rig.speed = o.m || 0; g.rig.update(dt);
      const nm = T(o.n || '星牙使い');
      if (nm !== g.nameTxt) { freeSprite(g.name); g.name = nameSprite(nm, false); g.nameTxt = nm; this.group.add(g.name); }
      g.name.position.set(g.x, y + 2.35 * ((HERO[o.h] && HERO[o.h].look.scale) || 1), g.z);
    }
  }
  onUpdate(dt) {
    FX.weather('petal', this.p.x, 1.5, this.p.z, dt);
    this._fountainUpdate(dt);
    // 町を歩いている間だけ、ほかのプレイヤーとつながる
    if (this.frame === 'home' && !TownNet.on) TownNet.start(() => this._me());
    TownNet.update(dt);
    this._ghosts(dt);
    // 自分の名前
    const nm = T(Save.data.name);
    if (!this.myName || this.myName.userData.t !== nm) { freeSprite(this.myName); this.myName = nameSprite(nm, true); this.myName.userData.t = nm; this.group.add(this.myName); }
    this.myName.visible = !!(this.model && this.model.root.visible) && this.frame === 'home';
    this.myName.position.set(this.p.x, this.p.y + 2.35 * ((HERO[this.heroId] && HERO[this.heroId].look.scale) || 1), this.p.z);
    const cnt = document.getElementById('town-count'); if (cnt) cnt.textContent = TownNet.on && TownNet.peer ? T(`町にいる人: ${TownNet.count()}人`) : '';
  }
}

// ================= 世界地図 =================
// 町と各章の戦場を道でつないだ大地。戦場の旗に近づくと、その章に出撃できる
const MAP_POS = [[0, -10], [-40, 40], [30, 85], [-30, 135], [40, 180], [0, 230], [-60, 270]];   // 町 → 第一章 … 第五章 → 星海の試練
export class WorldMap extends Field {
  constructor(ui) {
    const nodes = MAP_POS.map(([x, z], i) => [x, z, i === 0 ? 14 : 12]);
    const links = MAP_POS.slice(1).map((_, i) => [i, i + 1, 7]);
    super({ id: 'worldmap', theme: 'plains', size: 360, nodes, links, bases: [] }, 'plains');
    this.ui = ui; this.walkSpd = 11; this.camK = 1.6; this.camPitch = 0.34; this.camAhead = 4;   // 地図は高い所から広く見渡す
    const S = Save.data;
    // 町へ戻る門
    const [tx, tz] = MAP_POS[0];
    this.label(['拠点の町', '町へ戻る'], tx, this.stage.heightAt(tx, tz) + 3.4, tz - 4, 4);
    this.mesh([at(cyl(0.4, 0.45, 5, '#a8321e', 8), -3, 2.5, 0), at(cyl(0.4, 0.45, 5, '#a8321e', 8), 3, 2.5, 0), at(box(8, 0.5, 0.8, '#a8321e'), 0, 4.6, 0)]).position.set(tx, this.stage.heightAt(tx, tz), tz - 4);
    this.spots.push({ x: tx, z: tz - 4, r: 4, name: '拠点の町', sub: '町へ戻る', act: () => ui.app.toField('town') });
    // 各章の戦場
    STAGES.forEach((st, i) => {
      const [x, z] = MAP_POS[i + 1] || [i * 30, i * 40]; const y = this.stage.heightAt(x, z), open = ui.stageOpen(i), cleared = Save.stageCleared(st.id);
      const flag = open ? (cleared ? '#3a6aff' : '#e0352e') : '#666';
      this.mesh([at(cyl(0.12, 0.14, 7, '#3a2a1a', 6), 0, 3.5, 0), at(box(2.4, 1.6, 0.06, flag), 1.2, 6.0, 0), at(cyl(2.4, 2.8, 0.3, open ? '#a89060' : '#555', 20), 0, 0.15, 0)]).position.set(x, y, z);
      this.label(open ? [st.no + '　' + st.name, cleared ? '制圧済み' : '未踏の戦場'] : [st.no, '？？？(前の章をクリア)'], x, y + 3.6, z, 5);
      this.solids.push({ x, z, r: 0.5 });
      if (open) this.spots.push({ x, z, r: 4.5, name: st.no + '　' + st.name, sub: '出撃する', act: () => { ui.sel.stage = st.id; ui.show('stage'); } });
    });
    // 星海の試練(第一章クリアで解放)
    const [ex, ez] = MAP_POS[STAGES.length + 1] || MAP_POS[MAP_POS.length - 1], ey = this.stage.heightAt(ex, ez), eo = Save.stageCleared('s1');
    this.mesh([at(cyl(1.2, 1.6, 0.6, '#4a5a9a', 16), 0, 0.3, 0), at(cyl(0.3, 0.5, 6, '#8aa0ff', 8), 0, 3.4, 0)]).position.set(ex, ey, ez);
    this.label(['星海の試練', eo ? `最高 ${S.endless.ko}人撃破` : '第一章クリアで解放'], ex, ey + 3.6, ez, 4.6);
    if (eo) this.spots.push({ x: ex, z: ez, r: 4.5, name: '星海の試練', sub: '果てなき戦い', act: () => ui.act('go', 'endless') });
    this.solids.push({ x: ex, z: ez, r: 1.6 });
    this.p.x = tx; this.p.z = tz + 4; this.cam.yaw = 0;
  }
  onUpdate(dt) { FX.weather('firefly', this.p.x, 1.5, this.p.z, dt); }
}
