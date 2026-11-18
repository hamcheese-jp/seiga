// 歩き回れる場所: 拠点の町(Town)と世界地図(WorldMap)。選んだ武将を歩かせ、建物や戦場に近づくと入れる
//   メニュー画面の代わり。町の中から店・装備・職業・出撃(世界地図)などへ入る
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { Stage } from './stage.js';
import { THEMES, HERO, ELEMENTS, STAGES, calcStats } from './data.js';
import { buildHero, disposeModel } from './models.js';
import { loadVrm, VrmBody } from './vrmchar.js';
import { setArmor } from './armor.js';
import { Rig } from './rig.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { T } from './i18n.js';
import { Save } from './save.js';
import { box, cyl, cone, at, merge } from './geo.js';
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
    loadVrm(h.vrm || id).then((vrm) => { if (this.model !== model) return; if (vrm) { new VrmBody(model, vrm); setArmor(vrm, h.vrm || id, st.armor); } model.root.visible = true; FX.shell(this.p.x, 1.5, this.p.z, this.col, 0.6, 2.2, 0.35, 0.45); })
      .catch((e) => { console.warn(e); model.root.visible = true; });
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
      this.rig.speed = sp; this.rig.update(dt);   // VRM の体は rig.update の中で合わせる
    }
    // 入口の案内
    let near = null, best = 1e9;
    if (walking) for (const s of this.spots) { const d = Math.hypot(P.x - s.x, P.z - s.z); if (d < s.r && d < best) { best = d; near = s; } }
    if (near !== this.near) { this.near = near; if (near) this.promptEl.innerHTML = `<b>${near.name}</b><small>${near.sub || ''}</small><i>${Input.usedTouch ? 'タップで入る' : 'J / Enter で入る'}</i>`; }
    this.promptEl.classList.toggle('on', !!near);
    if (near && Input.consume('a', 0.3)) this.enter(near);
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
    this.promptEl.classList.remove('on');
    this._drop(); this.stage.dispose(); FX.clear();
    GFX.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose(); for (const t of this.texs) t.dispose(); if (this.vm) this.vm.dispose();
  }
}

// ================= 拠点の町 =================
// 広場を囲む建物: [名前, 説明, 角度(度), 色, 入った時の動作]
export class Town extends Field {
  constructor(ui) {
    super({ id: 'town', theme: 'plains', size: 130, nodes: [[0, 0, 34], [0, -46, 9]], links: [[0, 1, 9]], bases: [] }, 'plains');
    this.ui = ui;
    const B = [
      ['道具屋', '武器・防具を買う', 30, '#6a4630', () => ui.show('shop')],
      ['鍛冶屋', '武器・防具の装備と強化', 75, '#4c4c58', () => { ui.armMode = 'weapon'; ui.act('go', 'armory'); }],
      ['道場', '職業・転職', 120, '#5a3a2a', () => { ui.armMode = 'job'; ui.act('go', 'armory'); }],
      ['詰所', '武将を入れ替える', 165, '#3e4a5a', () => { ui.heroBack = 'home'; ui.show('hero'); }],
      ['酒場', 'オンラインで協力・対戦', 210, '#6a3a3a', () => ui.act('go', 'coop')],
      ['語り部', '物語をふり返る', 255, '#4a3a5a', () => ui.act('go', 'story')],
      ['高札', '称号・ランキング', 300, '#5a5a3a', () => ui.act('go', 'ach')],
      ['宿', '設定・データの保存', 335, '#3a5a4a', () => ui.act('go', 'settings')],
    ];
    const R = 24;
    for (const [name, sub, deg, wall, act] of B) {
      const a = deg * PI / 180, x = Math.sin(a) * R, z = Math.cos(a) * R, ry = a + PI;   // 正面を広場の中心へ
      const y = this.stage.heightAt(x, z);
      if (name === '高札') {
        const m = this.mesh([at(box(3.6, 2.2, 0.2, '#7a5a3a'), 0, 2.4, 0), at(cyl(0.12, 0.14, 3.5, '#4a3222', 6), -1.6, 1.75, 0), at(cyl(0.12, 0.14, 3.5, '#4a3222', 6), 1.6, 1.75, 0), at(box(4.2, 0.25, 0.6, '#3a2a1a'), 0, 3.6, 0)]);
        m.position.set(x, y, z); m.rotation.y = ry;
        this.solids.push({ x, z, r: 1.6 });
      } else {
        // 建物: 白壁と柱、瓦屋根(四角錐)、入口ののれん
        const g = [
          at(box(7, 3.4, 5.2, '#e8e0d0'), 0, 1.7, 0), at(box(7.3, 0.4, 5.5, wall), 0, 0.2, 0),
          ...[-3.4, 3.4].flatMap((px) => [-2.5, 2.5].map((pz) => at(box(0.3, 3.5, 0.3, '#4a3020'), px, 1.75, pz))),
          at(cone(5.6, 2.4, '#3a3a44', 4), 0, 4.6, 0, 0, PI / 4, 0, 1.25, 1, 0.95),
          at(box(2.0, 2.4, 0.12, '#24180f'), 0, 1.2, 2.62), at(box(2.4, 0.9, 0.06, wall), 0, 2.1, 2.7),
        ];
        const m = this.mesh(g); m.position.set(x, y, z); m.rotation.y = ry;
        this.solids.push({ x, z, r: 3.6 });
      }
      // 看板と入口
      const fx = x + Math.sin(ry) * 4.2, fz = z + Math.cos(ry) * 4.2;
      this.label([name, sub], x + Math.sin(ry) * 3.2, y + 4.4, z + Math.cos(ry) * 3.2, 3.4);
      this.spots.push({ x: fx, z: fz, r: 3.2, name, sub, act });
      // 提灯
      const lx = fx + Math.cos(ry) * 1.8, lz = fz - Math.sin(ry) * 1.8;
      this.mesh([at(cyl(0.05, 0.06, 2.2, '#3a2a1a', 5), 0, 1.1, 0), at(cyl(0.28, 0.28, 0.5, '#ffd27a', 10), 0, 2.4, 0)]).position.set(lx, this.stage.heightAt(lx, lz), lz);
    }
    // 出陣の門(南): 鳥居のような大門。くぐると世界地図へ
    const gz = -34, gy = this.stage.heightAt(0, gz);
    this.mesh([at(cyl(0.45, 0.5, 7, '#a8321e', 10), -4, 3.5, 0), at(cyl(0.45, 0.5, 7, '#a8321e', 10), 4, 3.5, 0), at(box(11, 0.7, 1.0, '#a8321e'), 0, 6.4, 0), at(box(12.4, 0.5, 1.4, '#2a1a14'), 0, 7.1, 0), at(box(9, 0.45, 0.6, '#a8321e'), 0, 5.2, 0)]).position.set(0, gy, gz);
    this.label(['出陣の門', '世界地図へ'], 0, gy + 8.4, gz, 4);
    this.spots.push({ x: 0, z: gz - 1, r: 4, name: '出陣の門', sub: '世界地図へ出る', act: () => ui.app.toField('map') });
    this.solids.push({ x: -4, z: gz, r: 0.6 }, { x: 4, z: gz, r: 0.6 });
    // 広場の中央: 星の祭壇
    this.mesh([at(cyl(3, 3.4, 0.5, '#8088aa', 32), 0, 0.25, 0), at(cyl(0.6, 0.8, 2.6, '#9aa2c4', 8), 0, 1.6, 0), at(cyl(0.4, 0.4, 0.4, '#ffe08a', 8), 0, 3.1, 0)]).position.set(0, this.stage.heightAt(0, 0), 0);
    this.solids.push({ x: 0, z: 0, r: 3.2 });
    this.p.x = 0; this.p.z = -10; this.p.yaw = 0; this.cam.yaw = 0;
  }
  onUpdate(dt) { FX.weather('petal', this.p.x, 1.5, this.p.z, dt); }
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
