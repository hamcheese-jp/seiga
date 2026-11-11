// 武将(プレイヤー / 味方将 / 敵将 / ボス): 状態機械・技の実行・被弾・AI
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { buildHero, disposeModel } from './models.js';
import { hasVrm, loadVrm, VrmBody } from './vrmchar.js';
import { Rig } from './rig.js';
import { MS } from './moves.js';
import { ELEMENTS } from './data.js';
import { FX, Trail } from './fx.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { clamp, rnd, angTo, angDamp, damp, D2R } from './util.js';

export const AWAKE_DUR = 18;
const TEAM_GLOW = [[0.5, 1.4, 3.6], [3.6, 0.7, 0.4]];

export class Fighter {
  constructor(B, o) {
    this.B = B; this.isFighter = true; this.team = o.team; this.isPlayer = !!o.player; this.name = o.name; this.title = o.title || '';
    this.boss = !!o.boss; this.isHero = !!o.hero; this.heroId = o.heroId || null;
    this.elem = o.elem || null; this.col = this.elem ? ELEMENTS[this.elem].glow : TEAM_GLOW[o.team];
    const look = { ...o.look, pal: { ...o.look.pal, glow: o.look.pal.glow || this.col } };
    this.model = buildHero(look, o.wtype, o.tier || 0); this.rig = new Rig(this.model);
    GFX.scene.add(this.model.root);
    // VRoidのキャラがあれば読み込んで差し替える(読み込み中は今の姿で表示)
    const vk = o.heroId || o.vrmKey;
    if (vk && hasVrm(vk)) loadVrm(vk).then((vrm) => { if (!vrm) return; if (this.disposed) { vrm.scene.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); return; } new VrmBody(this.model, vrm); }).catch((e) => console.warn(e));
    this.ms = MS[o.ms];
    this.x = o.x; this.z = o.z; this.y = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.yaw = o.yaw || 0;
    this.rad = 0.5 * this.model.scale; this.alive = true; this.hidden = false; this.ghost = false; this.gone = false; this.sealed = false;
    this.maxHp = this.hp = o.hp; this.atk = o.atk; this.def = o.def; this.spd = o.spd; this.aspd = o.aspd || 1;
    this.S = o.stats || null; this.rangeMul = this.S ? this.S.range : 1; this.heavy = !!o.heavy; this.expVal = o.exp || 0; this.gutsUsed = false;
    this.state = 'idle'; this.st = 0; this.move = null; this.mt = 0; this.hitI = 0; this.sfxI = 0; this.turnI = 0; this.kind = ''; this.chain = 0;
    this.inv = 0; this.armorT = 0; this.sp = 0; this.rage = 0; this.awake = 0; this.flashT = 0; this.teleT = 0; this.stun = 0; this.slowT = 0; this.burn = 0; this.burnT = 0; this.burnDmg = 0; this.burnSrc = null;
    this.dodgeCd = 0; this.lastPerfect = -9; this.airHits = 0; this.hitDur = 0.3; this.faceYaw = null; this.enraged = false; this.lastHitBy = null;
    this.in = { x: 0, z: 0, mag: 0 };
    this.trails = [new Trail(this.col), new Trail(this.col)]; this.trailsL = this.model.dual ? [new Trail(this.col), new Trail(this.col)] : null;
    this.ti = 0; this.trailOn = false;
    this.stag = 0; this.stagMax = this.boss ? 12 : 7; this.wantBurst = false;
    this.ai = null;
    if (!this.isPlayer) {
      this.ai = { think: rnd(0.3), target: null, tgen: 0, cd: 1 + rnd(1.5), plan: null, pi: 0, order: o.order || { type: 'hold', x: o.x, z: o.z }, path: null, pathI: 0,
        strafe: rnd() < 0.5 ? 1 : -1, range: 2.3 * this.model.scale, aggro: o.boss ? 26 : 17, p2: false, spT: 30 + rnd(30), home: { x: o.x, z: o.z } };
      if (this.ms.plans) this.plans = this.ms.plans;
      else {
        const n = this.ms.n, c = this.ms.c, reach = (n[0].hits[0].r || n[0].hits[0].len || 2.6) * 1.05;
        this.plans = [{ seq: [n[0], n[1], n[2], c[3]], max: reach, w: 4 }, { seq: [n[0], n[1], c[2]], max: reach, w: 3 }, { seq: [n[0], n[1], n[2], n[3]], max: reach, w: 3 }, { seq: [n[0], c[1]], max: reach, w: 2 }, { seq: [c[0]], min: 3.5, max: 9, w: 3 }];
      }
      this._makeTag();
    }
    this._syncRig(0.016);
  }

  // ---------- 名札 ----------
  _makeTag() {
    const cv = this.tagCv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    this.tagTex = new THREE.CanvasTexture(cv); this.tagTex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, transparent: true, depthWrite: false, fog: false, sizeAttenuation: false }));
    this.tag.scale.set(0.2, 0.05, 1); this.tag.renderOrder = 40; GFX.scene.add(this.tag);
    this.tagHp = -1; this._drawTag();
  }
  _drawTag() {
    const c = this.tagCv.getContext('2d'), f = clamp(this.hp / this.maxHp, 0, 1); this.tagHp = f;
    c.clearRect(0, 0, 256, 64);
    c.font = '900 26px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(this.name, 128, 22);
    c.fillStyle = this.boss ? '#ffd76a' : this.team === 0 ? '#bfe0ff' : '#ffc9c0'; c.fillText(this.name, 128, 22);
    c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(38, 44, 180, 12);
    c.fillStyle = this.team === 0 ? '#4aa8ff' : this.boss ? '#ff4a6a' : '#ff6a3a'; c.fillRect(40, 46, 176 * f, 8);
    this.tagTex.needsUpdate = true;
  }

  // ---------- 毎フレーム ----------
  update(dt) {
    const B = this.B;
    if (this.state === 'dead') {
      this.st += dt; const k = Math.exp(-6 * dt); this.vx *= k; this.vz *= k; this.x += this.vx * dt; this.z += this.vz * dt; B.stage.constrain(this, this.rad);
      if (this.st > 2.4) { const s = Math.max(0.001, 1 - (this.st - 2.4) / 0.5) * this.model.scale; this.model.root.scale.setScalar(s); if (this.st > 2.9) this.gone = true; }
      this._syncRig(dt); return;
    }
    if (this.inv > 0) this.inv -= dt; if (this.armorT > 0) this.armorT -= dt; if (this.flashT > 0) this.flashT -= dt; if (this.teleT > 0) this.teleT -= dt;
    if (this.dodgeCd > 0) this.dodgeCd -= dt; if (this.slowT > 0) this.slowT -= dt;
    if (this.awake > 0) {
      this.awake -= dt; this.rage = Math.max(0, 100 * this.awake / AWAKE_DUR); this.sp = Math.min(100, this.sp + 5 * dt);
      if (Math.random() < dt * 40) FX.aura(this.x, this.y + 0.2, this.z, this.col, 1, 0.6);
      if (this.awake <= 0) { this.rage = 0; if (this.isPlayer) B.ui.toast('覚醒終了'); }
    }
    if (this.enraged && Math.random() < dt * 30) FX.aura(this.x, this.y + 0.2, this.z, [3.5, 0.4, 0.3], 1, 0.7);
    if (this.burn > 0) { this.burn -= dt; this.burnT -= dt; if (this.burnT <= 0) { this.burnT = 0.5; FX.embers(this.x, 1, this.z, 4.5, 1.5, 0.3, 4, 0.3, 3); this.hp -= this.burnDmg; if (this.hp <= 0) { this.hp = 1; } if (this.tag) this._drawTag(); } }
    if (this.S && this.S.regen > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.S.regen / 100 * dt);

    if (this.isPlayer) this._control(); else this._ai(dt);
    this._state(dt);
    this._physics(dt);
    this._syncRig(dt);
  }

  _control() {
    const B = this.B, I = this.in, cy = B.cam.yaw, mx = Input.mx, my = Input.my, ml = Math.hypot(mx, my);
    if (ml > 0.01 && B.state === 'play') { const fx = Math.sin(cy), fz = Math.cos(cy); I.x = fx * my - fz * mx; I.z = fz * my + fx * mx; I.mag = Math.min(1, ml); }
    else { I.x = I.z = I.mag = 0; }
  }

  _state(dt) {
    const I = this.in;
    switch (this.state) {
      case 'idle': {
        if (this.stun > 0) { this.stun -= dt; this.vx = damp(this.vx, 0, 10, dt); this.vz = damp(this.vz, 0, 10, dt); this.rig.setMode('stun'); break; }
        this.rig.setMode(this.B.state === 'win' && this.isPlayer ? 'victory' : 'loco');
        const sp = this.spd * (this.slowT > 0 ? 0.6 : 1) * (this.awake > 0 ? 1.12 : 1);
        this.vx = damp(this.vx, I.x * sp, 14, dt); this.vz = damp(this.vz, I.z * sp, 14, dt);
        if (this.faceYaw !== null) this.yaw = angDamp(this.yaw, this.faceYaw, 10, dt);
        else if (I.mag > 0.05) this.yaw = angDamp(this.yaw, Math.atan2(I.x, I.z), 14, dt);
        if (this.isPlayer && this.B.state === 'play') this._playerActions();
        break;
      }
      case 'atk': case 'sp': this._updateMove(dt); break;
      case 'dodge': {
        this.st += dt; const u = this.st / 0.36, v = 15.5 * Math.pow(Math.max(0, 1 - u), 0.55);
        this.vx = this.dvx * v; this.vz = this.dvz * v;
        if (Math.random() < dt * 50) FX.glow(this.x, 1, this.z, this.col[0] * 0.4, this.col[1] * 0.4, this.col[2] * 0.4, 1.2, 0.18, 0.7);
        if (this.st > 0.2 && this.isPlayer && (Input.consume('a', 0.2) || Input.consume('c', 0.01))) { this.dodgeCd = 0.2; this.startAttack('n', 0); break; }
        if (u >= 1) { this.dodgeCd = 0.22; this._toIdle(); }
        break;
      }
      case 'hit': this.st += dt; if (this.st > this.hitDur) this._toIdle(); break;
      case 'air': this.st += dt; break;
      case 'down': this.st += dt; if (this.st > (this.isPlayer ? 0.45 : 0.6)) { this.state = 'getup'; this.st = 0; this.rig.setMode('getup'); this.armorT = Math.max(this.armorT, 0.9); } break;
      case 'getup': this.st += dt; if (this.st > 0.42) this._toIdle(); break;
      case 'cast': this.st += dt; if (this.st > 0.65) this._toIdle(); break;
    }
  }
  _toIdle() { this.state = 'idle'; this.st = 0; this.airHits = 0; this.rig.setMode('loco'); }

  _playerActions() {
    if (Input.consume('s')) { if (this.sp >= 100) return this.startSpecial(); Audio.sfx('deny'); }
    if (Input.consume('r')) { if (this.rage >= 100 && this.awake <= 0) return this.startAwaken(); Audio.sfx('deny'); }
    if (this.dodgeCd <= 0 && Input.consume('d')) return this.startDodge();
    if (Input.consume('c')) return this.startAttack('c', 0);
    if (Input.consume('a') || Input.held.a) return this.startAttack('n', 0);
  }

  // 攻撃開始時の向き: スティック優先、なければ近くの敵へ自動補正
  _aim() {
    const I = this.in;
    if (I.mag > 0.25) { this.yaw = Math.atan2(I.x, I.z); return; }
    const t = this.B.findTarget(this, 8, 2.2);
    if (t) this.yaw = Math.atan2(t.x - this.x, t.z - this.z);
  }
  startAttack(kind, idx) {
    const list = kind === 'n' ? this.ms.n : this.ms.c;
    this.kind = kind; this.chain = idx; this._aim();
    this._startMove(list[idx], 'atk');
  }
  _startMove(m, state) {
    this.state = state; this.move = m; this.mt = 0; this.hitI = 0; this.sfxI = 0; this.turnI = 0; this.st = 0;
    this.rig.play(m); this.trailOn = false; this.ghost = !!m.ghost; this.faceYaw = null;
    if (m.tele) {
      this.teleT = m.dk[0].t + 0.1;
      if (this.B.nearCam(this.x, this.z, 45)) { Audio.sfx('tele'); FX.glow(this.x, 1.6, this.z, 4, 0.5, 0.3, 3.2, 0.3); }
      if (m.tele > 1) { const h = m.hits[m.hits.length - 1]; if (h && h.r) FX.ring(this.x + Math.sin(this.yaw) * (h.fwd || 0), this.z + Math.cos(this.yaw) * (h.fwd || 0), [3.2, 0.35, 0.2], h.r * 0.92, h.r, Math.max(0.3, h.t), 0.1, 0.9); }
    }
  }
  _endMove() {
    const wasSp = this.state === 'sp';
    this.rig.stop(); this.move = null; this.trailOn = false; this.ghost = false;
    if (this.hidden) { this.hidden = false; }
    if (wasSp) this.inv = Math.max(this.inv, 0.5);
    if (this.ai) { const a = this.ai; a.plan = null; a.cd = this.isHero ? rnd(0.4, 1.1) : rnd(0.9, 2.3) * this.B.diff.cd * (this.boss ? 0.85 : 1) * (a.p2 ? 0.6 : 1); }
    this._toIdle();
  }
  _interrupt() {
    if (!this.move) return;
    this.rig.stop(); this.move = null; this.trailOn = false; this.ghost = false; this.hidden = false;
    if (this.ai) { this.ai.plan = null; this.ai.cd = Math.max(this.ai.cd, 0.4); }
  }

  _updateMove(dt) {
    const m = this.move, B = this.B, I = this.in;
    const sp = this.aspd * (this.awake > 0 ? 1.18 : 1) * (this.enraged ? 1.15 : 1) * (this.slowT > 0 ? 0.72 : 1);
    const prev = this.mt; this.mt += dt * sp; const t = this.mt; this.rig.mt = t;
    const T = m.turns;
    while (this.turnI < T.length && T[this.turnI][0] <= t) { this.yaw += T[this.turnI][1] * D2R; this.turnI++; }
    if (I.mag > 0.2) { const rate = m.steer !== undefined ? m.steer : (t < m.dk[0].t ? 8 : 1.3); if (rate > 0) this.yaw = angTo(this.yaw, Math.atan2(I.x, I.z), rate * dt); }
    else if (this.ai && this.ai.target && m.steer) { const tg = this.ai.target; this.yaw = angTo(this.yaw, Math.atan2(tg.x - this.x, tg.z - this.z), m.steer * dt); }
    let v = 0; const MV = m.mv;
    for (let i = 0; i < MV.length; i++) if (t >= MV[i][0] && t < MV[i][1]) { v = MV[i][2] * sp; break; }
    this.vx = Math.sin(this.yaw) * v; this.vz = Math.cos(this.yaw) * v;
    if (m.spMove && I.mag > 0.2) { this.vx += I.x * m.spMove; this.vz += I.z * m.spMove; }
    if (m.vanish) { const h = t >= m.vanish[0] && t < m.vanish[1]; if (h !== this.hidden) { this.hidden = h; FX.smoke(this.x, 1, this.z, 5, 0.2, 0.05, 0.3, 0.8, 0.6); } }
    if (m.warp !== undefined && prev < m.warp && t >= m.warp && this.ai && this.ai.target) {
      const tg = this.ai.target, a = tg.yaw !== undefined ? tg.yaw : 0;
      this.x = tg.x - Math.sin(a) * 2.6; this.z = tg.z - Math.cos(a) * 2.6; B.stage.constrain(this, this.rad); this.yaw = Math.atan2(tg.x - this.x, tg.z - this.z);
    }
    const SF = m.sfx;
    while (this.sfxI < SF.length && SF[this.sfxI][0] <= t) { if (this.isPlayer || B.nearCam(this.x, this.z, 28)) Audio.sfx(SF[this.sfxI][1], this.isPlayer ? 1 : 0.6); this.sfxI++; }
    let on = false; const TR = m.trail;
    for (let i = 0; i < TR.length; i++) if (t >= TR[i][0] && t <= TR[i][1]) { on = true; break; }
    if (on && !this.trailOn) { this.ti ^= 1; this.trails[this.ti].n = 0; if (this.trailsL) this.trailsL[this.ti].n = 0; }
    this.trailOn = on;
    const H = m.hits;
    while (this.hitI < H.length && H[this.hitI].t <= t) { B.doHit(this, H[this.hitI], m); this.hitI++; if (this.move !== m) return; }

    if (this.isPlayer) {
      if (this.state === 'atk') {
        if (this.dodgeCd <= 0 && Input.consume('d', 0.15)) { this._interrupt(); return this.startDodge(); }
        if (this.sp >= 100 && Input.consume('s', 0.15)) { this._interrupt(); return this.startSpecial(); }
        if (t >= m.chainAt && this.kind === 'n') {
          if (Input.consume('c', 0.35)) { const ci = this.chain + 1; if (ci < this.S.maxC) return this.startAttack('c', ci); }
          else if (Input.consume('a', 0.35) || Input.held.a) { const ni = this.chain + 1; if (ni < this.S.maxN) return this.startAttack('n', ni); }
        }
      }
    } else if (t >= m.chainAt && this.ai.plan && this.ai.pi < this.ai.plan.seq.length - 1) {
      const a = this.ai, tg = a.target;
      if (tg && tg.alive) {
        const dx = tg.x - this.x, dz = tg.z - this.z;
        if (dx * dx + dz * dz < 49) { a.pi++; this.yaw = angTo(this.yaw, Math.atan2(dx, dz), 1.6); this._startMove(this._planMove(a.plan, a.pi), 'atk'); return; }
      }
    }
    if (t >= m.dur) this._endMove();
  }
  _planMove(plan, i) { const e = plan.seq[i]; return typeof e === 'string' ? this.ms.m[e] : e; }

  startDodge() {
    const I = this.in; let dx, dz;
    if (I.mag > 0.2) { dx = I.x / I.mag; dz = I.z / I.mag; this.yaw = Math.atan2(dx, dz); }
    else { dx = -Math.sin(this.yaw); dz = -Math.cos(this.yaw); }
    this.state = 'dodge'; this.st = 0; this.dvx = dx; this.dvz = dz; this.inv = Math.max(this.inv, 0.3);
    this.rig.setMode('dodge'); Audio.sfx('dodge'); FX.dust(this.x, this.z, 3, 0.8);
  }
  startSpecial() {
    this.sp = 0; this._aim();
    this._startMove(this.ms.sp, 'sp');
    this.B.onSpecial(this);
  }
  startAwaken() {
    this.awake = AWAKE_DUR; this.rage = 100; this.state = 'cast'; this.st = 0; this.rig.setMode('cast'); this.inv = 0.9; this.vx = this.vz = 0;
    this.B.onAwaken(this);
  }

  // ---------- 被弾 ----------
  takeHit(dmg, kx, kz, lift, src, power = 0) {
    const B = this.B;
    if (!this.alive || this.state === 'dead') return false;
    if (this.sealed) { B.sealBlock(this, src); return false; }
    if (this.inv > 0 || this.state === 'sp' || this.hidden) {
      if (this.isPlayer && this.state === 'dodge' && this.st < 0.25 && src && src.isFighter && B.time - this.lastPerfect > 1.2) { this.lastPerfect = B.time; B.onPerfectDodge(this, src); }
      return false;
    }
    let d = dmg * 100 / (100 + this.def);
    if (this.awake > 0) d *= 0.7;
    this.hp -= d; this.flashT = 0.12; if (src && src.isFighter) this.lastHitBy = src;
    B.onFighterDamaged(this, d, src, power);
    if (this.hp <= 0) {
      if (this.isPlayer && !this.gutsUsed && B.diff.id === 'easy') { this.gutsUsed = true; this.hp = this.maxHp * 0.25; this.inv = 2; B.ui.toast('不屈! 体力が回復した'); }
      else { this.die(src, kx, kz); return true; }
    }
    if (this.tag) this._drawTag();
    const armored = this.awake > 0 || this.armorT > 0 || this.state === 'cast' || this.state === 'getup' || (this.move && (this.move.armor || this.heavy)) || (this.enraged && this.move);
    if (!this.isPlayer) { this.stag += power > 1 ? 2 : 1; if (this.stag >= this.stagMax) { this.stag = 0; this.wantBurst = true; } }
    if (armored) { this.vx += kx * 0.15; this.vz += kz * 0.15; return true; }
    if (lift > 0 && power > 0) {
      this._interrupt(); this.airHits++;
      this.state = 'air'; this.st = 0; this.vy = lift * (this.boss ? 0.55 : 0.8) / (1 + this.airHits * 0.12); this.vx = kx * 0.8; this.vz = kz * 0.8; this.rig.setMode('air');
    } else if (this.state === 'air') { this.airHits++; this.vy = Math.max(this.vy, 3.2 - this.airHits * 0.45); this.vx = kx * 0.4; this.vz = kz * 0.4; }
    else if (this.state === 'down') { this.vx = kx * 0.3; this.vz = kz * 0.3; }
    else if (power > 0 || this.state === 'idle' || this.state === 'hit') {
      this._interrupt(); this.state = 'hit'; this.st = 0; this.hitDur = power > 0 ? 0.3 : 0.15; this.vx = kx * 0.6; this.vz = kz * 0.6; this.rig.setMode('hit');
    }
    return true;
  }
  die(src, kx = 0, kz = 0) {
    this.alive = false; this.hp = 0; this._interrupt(); this.state = 'dead'; this.st = 0; this.rig.setMode('dead'); this.vx = kx * 0.5; this.vz = kz * 0.5; this.awake = 0;
    if (this.tag) this.tag.visible = false;
    this.B.onFighterDead(this, src);
  }

  _physics(dt) {
    const B = this.B;
    if (this.state === 'air') {
      this.vy -= 30 * dt; this.y += this.vy * dt;
      if (this.y <= 0 && this.vy < 0) { this.y = 0; this.vy = 0; this.state = 'down'; this.st = 0; this.rig.setMode('down'); if (B.nearCam(this.x, this.z, 40)) FX.dust(this.x, this.z, 5, 1.2); if (this.isPlayer) this.inv = 1.5; }
    }
    this.x += this.vx * dt; this.z += this.vz * dt;
    const s = this.state;
    if (s === 'hit' || s === 'down' || s === 'getup' || s === 'cast') { const k = Math.exp(-8 * dt); this.vx *= k; this.vz *= k; }
    B.stage.constrain(this, this.rad);
  }

  _syncRig(dt) {
    const B = this.B, r = this.model.root;
    r.position.set(this.x, this.y, this.z); r.rotation.y = this.yaw;
    const near = this.isPlayer || B.nearCam(this.x, this.z, 80);
    r.visible = near && !this.hidden;
    if (near) {
      this.rig.speed = this.state === 'idle' ? Math.hypot(this.vx, this.vz) : 0;
      this.rig.update(dt);
      const now = B.time;
      if (this.trailOn) { this.trails[this.ti].push(this.rig.wBase, this.rig.wTip, now); if (this.trailsL) this.trailsL[this.ti].push(this.rig.wBaseL, this.rig.wTipL, now); }
      this.trails[0].update(now); this.trails[1].update(now);
      if (this.trailsL) { this.trailsL[0].update(now); this.trailsL[1].update(now); }
      // 発光(被弾=白 / 予兆=赤 / 覚醒=属性色)
      if (this.flashT > 0) this.rig.setFlash(0.5, 0.5, 0.5);
      else if (this.teleT > 0) { const k = 0.5 + 0.5 * Math.sin(B.time * 30); this.rig.setFlash(1.4 * k, 0.1 * k, 0.05 * k); }
      else if (this.awake > 0) this.rig.setFlash(this.col[0] * 0.035, this.col[1] * 0.035, this.col[2] * 0.035);
      else if (this.slowT > 0) this.rig.setFlash(0.05, 0.2, 0.5);
      else this.rig.setFlash(0, 0, 0);
    }
    if (this.tag) {
      this.tag.visible = near && this.alive && !this.hidden && B.nearCam(this.x, this.z, 55);
      if (this.tag.visible) { this.tag.position.set(this.x, this.y + this.model.height + 0.75, this.z); if (Math.abs(this.hp / this.maxHp - this.tagHp) > 0.012) this._drawTag(); }
    }
  }

  // ---------- AI ----------
  setOrder(o) { this.ai.order = o; this.ai.path = null; }
  _goto(x, z, dt) {
    const a = this.ai, B = this.B, st = B.stage;
    if (!a.path || a.gx !== x || a.gz !== z) {
      a.gx = x; a.gz = z;
      const na = st.nearestNode(this.x, this.z), nb = st.nearestNode(x, z);
      a.path = st.path(na, nb).map((i) => ({ x: st.nodes[i].x, z: st.nodes[i].z })); a.path.push({ x, z });
      const n0 = st.nodes[na], inside = Math.hypot(n0.x - this.x, n0.z - this.z) < n0.r + 1;
      a.pathI = inside ? Math.min(1, a.path.length - 1) : 0;
    }
    const wp = a.path[a.pathI], dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz);
    if (d < 3.5 && a.pathI < a.path.length - 1) { a.pathI++; return false; }
    if (d < 1.5) return true;
    this.in.x = dx / d * 0.8; this.in.z = dz / d * 0.8; this.in.mag = 0.8;
    return false;
  }
  _aiPick() {
    const a = this.ai, B = this.B; let best = null, bd = a.aggro * a.aggro;
    for (const f of B.fighters) {
      if (f.team === this.team || !f.alive || f.hidden || f.sealed) continue;
      const dx = f.x - this.x, dz = f.z - this.z; let d2 = dx * dx + dz * dz;
      if (f === this.lastHitBy) d2 *= 0.5;
      if (d2 < bd) { bd = d2; best = f; }
    }
    if (!best) {
      let sd = 100;
      B.horde.forEachIn(this.x, this.z, 10, (s) => { if (s.team === this.team || !s.alive) return; const dx = s.x - this.x, dz = s.z - this.z, d2 = dx * dx + dz * dz; if (d2 < sd) { sd = d2; best = s; } });
    }
    a.target = best; a.tgen = best && !best.isFighter ? best.gen : 0;
  }
  _choosePlan(d, vsFighter) {
    const a = this.ai; let tot = 0; const ok = [];
    for (const p of this.plans) {
      if (d < (p.min || 0) || d > (p.max || 99)) continue;
      if (p.p2 && !a.p2) continue;
      if (!vsFighter && (p.min || p.p2)) continue;
      ok.push(p); tot += p.w;
    }
    if (!ok.length) return null;
    let r = Math.random() * tot;
    for (const p of ok) { r -= p.w; if (r <= 0) return p; }
    return ok[0];
  }
  _ai(dt) {
    const a = this.ai, B = this.B, I = this.in;
    I.x = I.z = I.mag = 0; this.faceYaw = null;
    if (this.state !== 'idle' || this.stun > 0 || B.state !== 'play') return;
    if (this.sealed) { const p = B.player, dx = p.x - this.x, dz = p.z - this.z; if (dx * dx + dz * dz < 900) this.faceYaw = Math.atan2(dx, dz); return; }
    if (this.boss && !a.p2 && this.hp < this.maxHp * 0.5) { a.p2 = true; this.enraged = true; this.armorT = 2; this.wantBurst = true; B.onBossPhase2(this); }
    if (this.wantBurst && this.ms.m && this.ms.m.burst) { this.wantBurst = false; this.armorT = Math.max(this.armorT, 1.3); this._startMove(this.ms.m.burst, 'atk'); return; }
    this.wantBurst = false;
    a.think -= dt; if (a.think <= 0) { a.think = 0.25 + rnd(0.2); this._aiPick(); }
    a.cd -= dt;
    const t = a.target;
    if (t && t.alive && (t.isFighter ? !t.hidden : t.gen === a.tgen)) {
      const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz) || 0.01, ty = Math.atan2(dx, dz);
      if (this.isHero && t.isFighter) { a.spT -= dt; if (a.spT <= 0 && d < 6) { a.spT = 45 + rnd(40); this.yaw = ty; this._startMove(this.ms.sp, 'sp'); B.onSpecial(this); return; } }
      if (a.cd <= 0) {
        const plan = this._choosePlan(d, t.isFighter);
        if (plan) { this.yaw = ty; a.plan = plan; a.pi = 0; this._startMove(this._planMove(plan, 0), 'atk'); return; }
      }
      const want = t.isFighter ? a.range : 1.9;
      if (d > want + 0.6) { I.x = dx / d; I.z = dz / d; I.mag = 1; }
      else if (t.isFighter) {
        if (d < want - 1.3) { I.x = -dx / d * 0.5; I.z = -dz / d * 0.5; I.mag = 0.5; }
        else { I.x = dz / d * a.strafe * 0.4; I.z = -dx / d * a.strafe * 0.4; I.mag = 0.4; if (Math.random() < dt * 0.5) a.strafe *= -1; }
        this.faceYaw = ty;
      } else this.faceYaw = ty;
      return;
    }
    a.target = null;
    const o = a.order;
    if (o.type === 'attack') { if (this._goto(o.x, o.z, dt)) this.B.onOfficerArrive(this); }
    else if (o.type === 'hold') { const dx = o.x - this.x, dz = o.z - this.z; if (dx * dx + dz * dz > 16) this._goto(o.x, o.z, dt); }
  }

  dispose() {
    this.disposed = true;
    for (const t of this.trails) t.dispose(); if (this.trailsL) for (const t of this.trailsL) t.dispose();
    if (this.tag) { GFX.scene.remove(this.tag); this.tag.material.dispose(); this.tagTex.dispose(); }
    disposeModel(this.model);
  }
}
