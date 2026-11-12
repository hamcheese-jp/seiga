// メニュー背景: 祭壇に立つ武将の3D表示(武将選択・武器庫のプレビュー兼用)
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { Stage } from './stage.js';
import { THEMES, HERO, ELEMENTS, calcStats } from './data.js';
import { buildHero, disposeModel } from './models.js';
import { loadVrm, VrmBody } from './vrmchar.js';
import { Rig } from './rig.js';
import { MS } from './moves.js';
import { FX, Trail } from './fx.js';
import { Save } from './save.js';
import { damp, rnd, pick } from './util.js';

const LOBBY_DEF = { id: 'lobby', theme: 'lobby', size: 150, nodes: [[0, 0, 30]], links: [], bases: [] };

export class Lobby {
  constructor() {
    GFX.setFov(54);
    GFX.applyTheme(THEMES.lobby);
    this.stage = new Stage(LOBBY_DEF);
    FX.init(); FX.clear();
    const g = this.group = new THREE.Group();
    this.stone = new THREE.MeshStandardMaterial({ color: '#7c84ac', roughness: 0.6, metalness: 0.2 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.7, 0.5, 56), this.stone); base.position.y = 0.25; base.receiveShadow = true; g.add(base);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 7.0, 0.22, 56), this.stone); step.position.y = 0.11; step.receiveShadow = true; g.add(step);
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.4, 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(4.55, 4.75, 72).rotateX(-Math.PI / 2), this.ringMat); this.ring.position.y = 0.515; g.add(this.ring);
    this.ring2 = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.68, 6).rotateX(-Math.PI / 2), this.ringMat); this.ring2.position.y = 0.515; g.add(this.ring2);
    this.ring3 = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.36, 3).rotateX(-Math.PI / 2), this.ringMat); this.ring3.position.y = 0.515; g.add(this.ring3);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.52, p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 3.4 + (i % 2) * 1.2, 8), this.stone);
      p.position.set(Math.sin(a) * 8.2, 1.7 + (i % 2) * 0.6, Math.cos(a) * 8.2 - 1.5); p.castShadow = true; g.add(p);
    }
    GFX.scene.add(g);
    this.model = null; this.rig = null; this.heroId = null; this.t = 0; this.frame = 'title'; this.ox = 0; this.oy = 1.5; this.dist = 5; this.showT = 2.5; this.move = null;
    this.trails = null; this.ti = 0; this.trailOn = false;
    this._cam(0, true);
  }
  setHero(id, force) {
    if (this.heroId === id && !force) return;
    this._drop();
    const h = HERO[id], st = calcStats(Save.data, id), E = ELEMENTS[h.elem];
    this.heroId = id; this.col = E.glow;
    this.model = buildHero({ ...h.look, pal: { ...h.look.pal, glow: E.glow } }, h.wtype, st.tier);
    this.model.root.position.set(0, 0.5, 0); GFX.scene.add(this.model.root);
    this.rig = new Rig(this.model); this.ms = MS[HERO[id].ms || id]; this.move = null; this.showT = 1.6;
    {
      // 読み込みが終わるまでキャラは隠し、「読み込み中」を表示
      const model = this.model; model.root.visible = false; this._loading(true);
      const done = () => { if (this.model !== model) return; model.root.visible = true; this._loading(false); FX.shell(0, 1.5, 0, this.col, 0.6, 2.4, 0.35, 0.5); };
      loadVrm(HERO[id].vrm || id).then((vrm) => { if (vrm && this.model === model) new VrmBody(model, vrm); done(); }).catch((e) => { console.warn(e); done(); });
    }
    this.trails = [new Trail(E.glow), new Trail(E.glow)]; this.trailsL = this.model.dual ? [new Trail(E.glow), new Trail(E.glow)] : null;
    this.ringMat.color.setRGB(E.glow[0] * 0.3, E.glow[1] * 0.3, E.glow[2] * 0.3);
    FX.shell(0, 1.5, 0, E.glow, 0.6, 2.6, 0.4, 0.45); FX.ring(0, 0, E.glow, 1, 4.6, 0.6, 0.56, 0.7); FX.embers(0, 0.6, 0, E.glow[0] * 0.6, E.glow[1] * 0.6, E.glow[2] * 0.6, 22, 1.0, 4, 0.08, 1.2);
  }
  _loading(on) {
    let e = document.getElementById('vrm-loading');
    if (!e) { e = document.createElement('div'); e.id = 'vrm-loading'; e.innerHTML = '<i></i>読み込み中…'; document.body.appendChild(e); }
    e.classList.toggle('on', on);
  }
  _drop() {
    if (!this.model) return;
    for (const t of this.trails) t.dispose(); if (this.trailsL) for (const t of this.trailsL) t.dispose();
    disposeModel(this.model); this.model = null; this.rig = null;
  }
  setFrame(name) { this.frame = name; }
  _cam(dt, snap) {
    const cam = GFX.camera, port = cam.aspect < 1, f = this.frame;
    let ox = 0, oy = 1.45, d = port ? 3.8 : 4.9;
    if (f === 'home') { ox = port ? 0 : -1.5; oy = port ? 0.9 : 1.45; d = port ? 4.0 : 4.9; }
    else if (f === 'hero' || f === 'armory') { ox = port ? 0 : 1.45; oy = port ? 0.35 : 1.4; d = port ? 3.9 : 4.6; }
    else if (f === 'title') { d = port ? 4.6 : 6.4; oy = port ? 1.5 : 1.95; }
    else if (f === 'stage' || f === 'ach' || f === 'rank' || f === 'settings' || f === 'result') { d = port ? 5 : 6.6; oy = 1.6; }
    const k = snap ? 1 : 1 - Math.exp(-4 * dt);
    this.ox += (ox - this.ox) * k; this.oy += (oy - this.oy) * k; this.dist += (d - this.dist) * k;
    const a = Math.sin(this.t * 0.22) * 0.28 + 0.12;
    cam.position.set(this.ox + Math.sin(a) * this.dist, 1.75 + Math.sin(this.t * 0.31) * 0.12, Math.cos(a) * this.dist);
    cam.lookAt(this.ox, this.oy, 0);
  }
  update(dt) {
    this.t += dt;
    this.stage.update(dt);
    this.ring2.rotation.y += dt * 0.35; this.ring3.rotation.y -= dt * 0.22;
    if (this.rig) {
      // ときどき技を披露
      if (this.move) {
        this.rig.mt += dt;
        const t = this.rig.mt, m = this.move; let on = false;
        for (const s of m.trail) if (t >= s[0] && t <= s[1]) { on = true; break; }
        if (on && !this.trailOn) { this.ti ^= 1; this.trails[this.ti].n = 0; if (this.trailsL) this.trailsL[this.ti].n = 0; }
        this.trailOn = on;
        if (t >= m.dur) { this.rig.stop(); this.move = null; this.trailOn = false; this.showT = 2.2 + rnd(2.5); }
      } else {
        this.showT -= dt;
        if (this.showT <= 0 && this.frame !== 'title') { const ms = this.ms; this.move = pick([ms.n[0], ms.n[1], ms.n[2], ms.n[3], ms.c[1], ms.c[3]]); this.rig.play(this.move); }
      }
      this.rig.update(dt);
      if (this.trailOn) { this.trails[this.ti].push(this.rig.wBase, this.rig.wTip, this.t); if (this.trailsL) this.trailsL[this.ti].push(this.rig.wBaseL, this.rig.wTipL, this.t); }
      this.trails[0].update(this.t); this.trails[1].update(this.t);
      if (this.trailsL) { this.trailsL[0].update(this.t); this.trailsL[1].update(this.t); }
      if (Math.random() < dt * 9) { const a = rnd(6.283), c = this.col; FX.glowP.add(Math.cos(a) * 4.65, 0.55, Math.sin(a) * 4.65, 0, rnd(0.5, 1.6), 0, rnd(0.8, 1.6), rnd(0.06, 0.12), 0.02, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 0.9, 0, 0); }
    }
    FX.weather('firefly', 0, 1.5, 0, dt);
    FX.update(dt);
    this._cam(dt);
    GFX.updateSun(0, 0, 0);
  }
  dispose() {
    this._loading(false);
    this._drop(); this.stage.dispose(); FX.clear();
    GFX.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.stone.dispose(); this.ringMat.dispose();
  }
}
