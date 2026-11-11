// 合戦の進行管理: 拠点・増援・攻撃判定・飛び道具・戦況・勝敗・カメラ
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { Stage } from './stage.js';
import { Horde, ST } from './horde.js';
import { Fighter } from './fighter.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { HERO, HEROES, ELEMENTS, LOOKS, OFFICER_NAMES, DIFFS, THEMES, calcStats, rollWeapon } from './data.js';
import { MS } from './moves.js';
import { clamp, rnd, pick, damp, angWrap, lerp, D2R, ease } from './util.js';

const PI = Math.PI;
const BOSS_ELEM = { boss1: 'earth', boss2: 'wind', boss3: 'ice', boss4: 'fire', boss5: 'dark' };
const MS_WT = { off_sword: 'sword', off_spear: 'spear', off_axe: 'axe' };
const BOSS_LINES = { boss1: 'ぬうう…小癪な! 本気で叩き潰してくれるわ!', boss2: 'ククク…ここからが蠍の毒の回りどころよ。', boss3: '血の匂いだ…狼は手負いの時こそ牙を剥く!', boss4: '燃えろ! すべて灰になれ!', boss5: '見事だ。ならば覇星の真の力、その身に刻め。' };

class Base {
  constructor(B, bd, i) {
    this.B = B; this.i = i; this.node = bd.n; const nd = B.stage.nodes[bd.n];
    this.x = nd.x; this.z = nd.z; this.R = B.stage.bases[i].R; this.team = bd.t; this.orig = bd.t; this.name = bd.name; this.main = !!bd.main;
    this.max = bd.troops; this.troops = bd.troops; this.alive = 0; this.captain = null; this.spawnT = rnd(1); this.leash = this.R + 9; this.warnT = 0; this.capAnn = false;
  }
  update(dt) {
    const B = this.B; this.spawnT -= dt; if (this.warnT > 0) this.warnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 0.7;
    const near = B.nearPlayer(this.x, this.z, 80), want = Math.max(3, Math.round((near ? (this.main ? 24 : 19) : 4) * B.pop));
    if (this.troops > 0) {
      if (this.alive < want) { const n = Math.min(4, this.troops, want - this.alive); for (let k = 0; k < n; k++) if (this._spawn(false)) this.troops--; }
    } else if (!this.captain && this.alive <= 2 && !(this.main && this.team === 1)) {
      if (this._spawn(true) && near) { B.ui.say('伝令', this.team === 1 ? `${this.name}の兵長が出てきました! 討てば制圧です!` : `${this.name}の兵長が最後の守りについています!`); if (this.team === 1) Audio.sfx('tele'); }
    }
  }
  _spawn(captain) {
    const B = this.B, a = rnd(6.283), d = this.R * rnd(0.2, 0.72), st = captain ? B.capStats(this.team) : B.solStats(this.team);
    const s = B.horde.spawn(this.team, captain ? 0 : (rnd() < 0.35 ? 1 : 0), this.x + Math.sin(a) * d, this.z + Math.cos(a) * d, { ...st, captain, squad: this, base: this, ox: Math.sin(a) * d, oz: Math.cos(a) * d });
    if (!s) return false;
    this.alive++; if (captain) this.captain = s;
    if (B.nearCam(s.x, s.z, 45)) FX.dust(s.x, s.z, 2, 0.8);
    return true;
  }
  onDead(s, src) {
    this.alive = Math.max(0, this.alive - 1);
    if (s === this.captain) { this.captain = null; this.B.captureBase(this, 1 - s.team, src); }
    else if (this.team === 0 && this.warnT <= 0 && src && src.team === 1 && this.troops < this.max * 0.6) { this.warnT = 30; this.B.ui.say('伝令', `${this.name}が敵の攻撃を受けています!`); }
  }
}

export class Battle {
  constructor(cfg) {
    this.cfg = cfg; this.def = cfg.stage; this.diff = DIFFS[cfg.diff]; this.save = cfg.save; this.ui = cfg.ui; this.endless = !!this.def.endless;
    this.theme = THEMES[this.def.theme];
    GFX.setFov(78);
    GFX.applyTheme(this.theme);
    this.stage = new Stage(this.def);
    FX.init(); FX.clear();
    this.pop = GFX.q.soldiers / 220;
    this.horde = new Horde(this, GFX.q.soldiers);
    this.fighters = []; this.proj = []; this.pickups = []; this.pulls = []; this.squads = []; this.respawn = [];
    this.time = 0; this.rt = 0; this.state = 'intro'; this.stateT = 0;
    this.ko = 0; this.combo = 0; this.comboT = 0; this.maxCombo = 0; this.morale = 0; this.dmgTaken = 0; this.offKO = 0; this.capEnemy = 0; this.missionsDone = 0; this.perfect = 0; this.koMile = 0;
    this.exp = 0; this.gold = 0; this.loot = []; this.hitStop = 0; this.slowT = 0; this.slowScale = 1; this.spCam = 0; this.mission = null; this.focus = null; this.focusT = 0; this.curBase = null;
    this.wave = 0; this.waveT = 3; this.waveE = 40; this.waveA = 55; this.ordT = 5; this.sealMsgT = 0; this.bossBgm = false; this.ended = false;

    const hero = HERO[cfg.heroId], S = calcStats(this.save, hero.id);
    this.lv = this.endless ? Math.max(1, S.lv - 1) : this.def.lv;
    this.power = this.lv * 2.2 + this.diff.pow;
    this._scale();
    const sn = this.stage.nodes[this.def.start];
    this.player = this._add({ player: true, hero: true, heroId: hero.id, team: 0, name: hero.name, look: hero.look, wtype: hero.wtype, tier: S.tier, ms: hero.id, elem: hero.elem,
      hp: S.hp, atk: S.atk, def: S.def, spd: S.spd, aspd: S.aspd, stats: S, heavy: hero.heavy, x: sn.x + (this.endless ? 0 : 1.6), z: sn.z - (this.endless ? 0 : 5), yaw: 0 });
    this.bases = this.def.bases.map((bd, i) => new Base(this, bd, i));
    this.sealed = this.def.sealNeed > 0; this.boss = null;
    const names = OFFICER_NAMES.slice().sort(() => Math.random() - 0.5); let ni = 0;
    const allies = HEROES.filter((h) => h.id !== hero.id).sort(() => Math.random() - 0.5);
    for (const od of this.def.officers) {
      const nd = this.stage.nodes[od.n]; let f;
      if (od.ally !== undefined) this._allyHero(allies[od.ally], nd.x + rnd(-3, 3), nd.z + 3);
      else this._enemyOfficer(od, od.name || names[ni++ % names.length]);
    }
    for (const f of this.fighters) if (f.ai && f.role === 'attack') this._assign(f);
    // 結界
    if (this.boss && this.sealed) {
      this.boss.sealed = true;
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: GFX.uTime, uA: { value: 1 } }, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float uTime; uniform float uA; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float band = smoothstep(0.9, 1.0, fract(vP.y * 0.9 - uTime * 0.35)); float hex = smoothstep(0.93, 1.0, abs(sin(atan(vP.x, vP.z) * 12.0)) ); vec3 c = vec3(1.5, 0.16, 0.1) * (f * f * 1.1 + 0.05 + band * 0.3 + hex * 0.12); gl_FragColor = vec4(c * uA, 1.0); }',
      });
      this.dome = new THREE.Mesh(new THREE.SphereGeometry(7.2, 36, 14, 0, PI * 2, 0, PI / 2), mat);
      this.dome.position.set(this.boss.x, 0, this.boss.z); this.dome.renderOrder = 22; GFX.scene.add(this.dome);
      this.sealPos = { x: this.boss.x, z: this.boss.z };
    }
    // 開幕の激突
    if (this.def.clash) {
      const [an, en, mn] = this.def.clash, m = this.stage.nodes[mn];
      this._march(0, an, { x: m.x, z: m.z - 4 }, Math.round(12 * this.pop)); this._march(1, en, { x: m.x, z: m.z + 4 }, Math.round(18 * this.pop));
    }
    this.events = (this.def.events || []).map((e) => ({ ...e, done: false }));
    const p = this.player;
    this.cam = { yaw: 0, pitch: 0.4, p: 0.4, dist: 9.6, baseDist: 9.6, tx: p.x, ty: 1.5, tz: p.z, manualT: -9 };
    this.ui.minimapInit(this.stage);
    this.ui.stageCard(this.def, this.diff);
    this._objective();
    Audio.bgm(this.theme.bgm); Audio.intensity = 0.4;
    this.horde.rebuild(); this.horde.update(0.016);
    this._camera(0.016);
  }

  _scale(mul = 1) {
    const lv = this.lv, d = this.diff, g = (k) => 1 + lv * k;
    this.E = { sHp: 34 * g(0.11) * d.hp * mul, sDmg: 16 * g(0.075) * d.dmg * mul, cHp: 380 * g(0.12) * d.hp * mul, cDmg: 34 * g(0.075) * d.dmg * mul,
      oHp: 1700 * g(0.13) * d.hp * mul, oAtk: 50 * g(0.075) * d.dmg * mul, oDef: 25 + lv * 1.2, sExp: 3 * g(0.2) * Math.sqrt(mul), oExp: 160 * g(0.22) * Math.sqrt(mul) };
    this.A = { sHp: 40 * g(0.11), sDmg: 9 * g(0.075), cHp: 320 * g(0.12), cDmg: 24 * g(0.075), oHp: 1500 * g(0.13), oAtk: 34 * g(0.075), oDef: 30 + lv * 1.2 };
  }
  solStats(team) { return team === 1 ? { hp: this.E.sHp, dmg: this.E.sDmg, exp: this.E.sExp } : { hp: this.A.sHp, dmg: this.A.sDmg, exp: 0 }; }
  capStats(team) { return team === 1 ? { hp: this.E.cHp, dmg: this.E.cDmg, exp: this.E.sExp * 6 } : { hp: this.A.cHp, dmg: this.A.cDmg, exp: 0 }; }
  soldierMul(team) { return clamp(team === 0 ? 1 + this.morale / 333 : 1 - this.morale / 333, 0.7, 1.3); }
  nearCam(x, z, r) { const p = this.player, dx = x - p.x, dz = z - p.z; return dx * dx + dz * dz < r * r; }
  nearPlayer(x, z, r) { return this.nearCam(x, z, r); }
  // 振動(タッチ端末のみ・設定でオフ可)
  _vibe(ms) { if (this.save.settings.vibe && Input.usedTouch && navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) { /* 非対応端末は無視 */ } } }

  _add(o) { const f = new Fighter(this, o); this.fighters.push(f); return f; }
  _allyHero(h, x, z) {
    const A = this.A;
    const f = this._add({ hero: true, heroId: h.id, team: 0, name: h.name, look: h.look, wtype: h.wtype, tier: 1, ms: h.id, elem: h.elem, hp: A.oHp * h.base.hp / 1000, atk: A.oAtk * h.base.atk / 34, def: A.oDef, spd: h.base.spd * 0.78, aspd: h.base.aspd, heavy: h.heavy, x, z, yaw: 0 });
    f.role = 'attack'; this._squad(f, Math.round(6 * this.pop));
    return f;
  }
  _enemyOfficer(od, name, mul = 1) {
    const nd = this.stage.nodes[od.n], E = this.E; let f;
    if (od.boss) {
      f = this._add({ team: 1, boss: true, vrmKey: od.look, name, title: od.title, look: LOOKS[od.look], wtype: od.wtype, tier: 2, ms: od.ms, elem: BOSS_ELEM[od.look], hp: E.oHp * od.hp * mul, atk: E.oAtk * 1.25 * mul, def: E.oDef * 1.2, spd: 5.6, exp: E.oExp * 4,
        x: nd.x, z: nd.z + (this.endless ? 0 : 3), yaw: PI });
      f.lookId = od.look; f.role = this.endless ? 'hunt' : 'boss'; if (!this.endless) this.boss = f;
    } else {
      f = this._add({ team: 1, vrmKey: 'enemyOfficer', name, look: LOOKS.enemyOfficer, wtype: od.wtype || MS_WT[od.ms], tier: 1, ms: od.ms, hp: E.oHp * (od.hp || 1) * mul, atk: E.oAtk * mul, def: E.oDef, spd: 5.2, exp: E.oExp * (od.hp || 1),
        x: nd.x + rnd(-2, 2), z: nd.z + rnd(-2, 2), yaw: PI });
      f.role = od.order === 'attack' ? 'attack' : od.order === 'hunt' ? 'hunt' : 'hold';
      f.homeBase = this.bases.find((b) => b.node === od.n) || null;
    }
    if (f.role === 'hunt') { f.ai.aggro = 400; }
    this._squad(f, Math.round((od.squad || 6) * this.pop));
    return f;
  }
  _squad(f, n) {
    for (let k = 0; k < n; k++) {
      const a = rnd(6.283), d = rnd(1.5, 4.5);
      this.horde.spawn(f.team, rnd() < 0.35 ? 1 : 0, f.x + Math.sin(a) * d, f.z + Math.cos(a) * d, { ...this.solStats(f.team), squad: f, ox: Math.sin(a) * d, oz: Math.cos(a) * d, aggro: 13 });
    }
  }
  _march(team, fromNode, goal, n) {
    const st = this.stage, nd = st.nodes[fromNode];
    const path = st.path(fromNode, st.nearestNode(goal.x, goal.z)).map((i) => ({ x: st.nodes[i].x, z: st.nodes[i].z })); path.push({ x: goal.x, z: goal.z });
    const M = { x: nd.x, z: nd.z, team, path, pi: Math.min(1, path.length - 1), n: 0, leash: 17, goal, arrived: false };
    for (let k = 0; k < n; k++) {
      const a = rnd(6.283), d = rnd(1, 5.5);
      const s = this.horde.spawn(team, rnd() < 0.35 ? 1 : 0, nd.x + Math.sin(a) * d, nd.z + Math.cos(a) * d, { ...this.solStats(team), squad: M, ox: Math.sin(a) * d, oz: Math.cos(a) * d, aggro: 13 });
      if (s) M.n++;
    }
    if (M.n > 0) this.squads.push(M);
    return M;
  }
  _pathLen(a, b) { const st = this.stage, p = st.path(a, b); let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(st.nodes[p[i]].x - st.nodes[p[i - 1]].x, st.nodes[p[i]].z - st.nodes[p[i - 1]].z); return l; }
  _nearestBase(fromNode, pred) { let best = null, bd = 1e9; for (const b of this.bases) { if (!pred(b)) continue; const l = this._pathLen(fromNode, b.node); if (l < bd) { bd = l; best = b; } } return best; }
  // 武将に攻撃目標を割り当て
  _assign(f) {
    const from = this.stage.nearestNode(f.x, f.z);
    const b = this._nearestBase(from, (b) => b.team !== f.team && !(b.main && f.team === 0 && this.sealed));
    if (b) f.setOrder({ type: 'attack', x: b.x + rnd(-3, 3), z: b.z + rnd(-3, 3), base: b });
    else f.setOrder({ type: 'hold', x: f.x, z: f.z });
  }
  onOfficerArrive(f) { const o = f.ai.order; f.setOrder({ type: 'hold', x: o.x, z: o.z, base: o.base }); }
  _orders() {
    for (const f of this.fighters) {
      if (!f.ai || !f.alive || f.role === 'boss' || f.role === 'hunt') continue;
      if (f.role === 'hold' && f.homeBase && f.homeBase.team !== f.team) f.role = 'attack';
      if (f.role === 'attack') { const o = f.ai.order; if (!o.base || o.base.team === f.team) this._assign(f); }
    }
  }
  _objective() {
    if (this.endless) this.ui.objective(`第${Math.max(1, this.wave)}波 — 生き残れ`);
    else if (this.sealed) this.ui.objective(`敵拠点を制圧し結界を解け(${this.capEnemy}/${this.def.sealNeed})`);
    else this.ui.objective(`敵総大将「${this.boss.name}」を討て`);
  }

  captureBase(base, team, src) {
    base.team = team; base.troops = Math.round(base.max * 0.55); base.captain = null; base.alive = 0;
    const L = this.horde.list;
    for (let i = 0; i < this.horde.n; i++) { const s = L[i]; if (s.base === base) { if (s.team === team && s.alive) base.alive++; else s.base = null; } }
    this.stage.setBaseOwner(base.i, team);
    this.morale = clamp(this.morale + (team === 0 ? 8 : -8), -100, 100);
    const c = team === 0 ? [0.4, 1.2, 4] : [4, 0.6, 0.3];
    if (this.nearCam(base.x, base.z, 90)) { FX.pillar(base.x, base.z, c, 3, 28, 1.5); FX.ring(base.x, base.z, c, 2, base.R * 1.3, 0.9, 0.2, 1.3); }
    this.capEnemy = this.bases.filter((b) => b.orig === 1 && b.team === 0 && !b.main).length;
    if (team === 0) {
      Audio.sfx('capture'); this.ui.banner('拠点制圧', base.name, 'good');
      const p = this.player;
      if (p.alive && (src === p || this.nearPlayer(base.x, base.z, base.R + 8))) { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.15); p.sp = Math.min(100, p.sp + 25); this.gold += 120; FX.embers(p.x, 0.5, p.z, 0.6, 3.5, 1.2, 14, 0.6, 4); }
      if (this.sealed && this.capEnemy >= this.def.sealNeed) this._unseal();
    } else {
      Audio.sfx('warn'); this.ui.banner('拠点陥落', base.name, 'bad');
      if (base.main) { this._lose('本陣が陥落した…'); return; }
    }
    this._objective(); this._orders();
  }
  _unseal() {
    this.sealed = false; if (this.boss) this.boss.sealed = false;
    if (this.dome) { FX.nova(this.sealPos.x, this.sealPos.z, 9, [3.5, 0.5, 0.3]); GFX.scene.remove(this.dome); this.dome.geometry.dispose(); this.dome.material.dispose(); this.dome = null; }
    Audio.sfx('explode'); this.ui.banner('結界消滅', '敵総大将を討て!', 'gold');
    this.ui.say('軍師ミコト', '結界が消えました! 今こそ敵本陣へ!');
  }
  sealBlock(f, src) {
    if (this.rt - this.sealMsgT < 2.5) return;
    this.sealMsgT = this.rt;
    FX.shell(f.x, 1.2, f.z, [3.2, 0.4, 0.3], 1.5, 3, 0.3); Audio.sfx('deny');
    if (src === this.player) this.ui.toast('結界に阻まれた! 拠点を制圧して結界を解こう');
  }

  // ---------- 攻撃判定 ----------
  findTarget(f, range, cone) {
    let best = null, bs = 1e9; const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw), cc = Math.cos(cone);
    const consider = (t, w) => {
      const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz);
      if (d > range || d < 0.01) return;
      if (d > 1.5 && (dx * fx + dz * fz) / d < cc) return;
      const s = d * w; if (s < bs) { bs = s; best = t; }
    };
    for (const o of this.fighters) if (o.team !== f.team && o.alive && !o.hidden && !o.sealed) consider(o, 0.45);
    this.horde.forEachIn(f.x, f.z, range, (s) => { if (s.team !== f.team && s.alive) consider(s, 1); });
    return best;
  }

  doHit(att, h, m) {
    const yaw = att.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rm = att.rangeMul;
    if (h.shape === 'proj') { this._spawnProj(att, h); return; }
    const R = (h.r || 0) * rm;
    let cx = att.x + fx * (h.fwd || 0) * rm, cz = att.z + fz * (h.fwd || 0) * rm;
    if (h.side) { cx -= fz * h.side; cz += fx * h.side; }
    if (h.shape === 'pull') { this.pulls.push({ x: cx, z: cz, r: R, t: h.dur, force: h.force, team: att.team, att, c: att.col }); if (this.nearCam(cx, cz, 50)) { FX.ring(cx, cz, att.col, R, R * 0.15, h.dur, 0.2, 0.8); Audio.sfx(att.elem ? ELEMENTS[att.elem].sfx : 'wind', 0.7); } return; }
    if (h.shape === 'fx') { this._hitFx(att, h, cx, cz, R, fx, fz); return; }
    const ctx = this._ctx(att, h);
    const shape = h.shape, cosA = Math.cos((h.ang || 75) * D2R), len = (h.len || 0) * rm, back = h.back || 0, w = h.w || 1;
    const test = (t) => {
      const dx = t.x - att.x, dz = t.z - att.z, tr = t.rad;
      if (shape === 'arc') {
        const d = Math.hypot(dx, dz); if (d > R + tr) return false;
        if (d > 1.2 && (dx * fx + dz * fz) / d < cosA) return false;
        const k = d || 1; ctx.kx = fx * 0.55 + dx / k * 0.45; ctx.kz = fz * 0.55 + dz / k * 0.45; return true;
      }
      if (shape === 'circle') {
        const ex = t.x - cx, ez = t.z - cz, d = Math.hypot(ex, ez); if (d > R + tr) return false;
        if (d > 0.3) { ctx.kx = ex / d; ctx.kz = ez / d; } else { ctx.kx = fx; ctx.kz = fz; } return true;
      }
      const p = dx * fx + dz * fz, q = Math.abs(dx * fz - dz * fx);
      if (p < -back - tr || p > len + tr || q > w + tr) return false;
      ctx.kx = fx; ctx.kz = fz; return true;
    };
    const qx = shape === 'circle' ? cx : att.x, qz = shape === 'circle' ? cz : att.z, qr = shape === 'line' ? Math.max(len, back) + 1.5 : R + 1.5;
    this.horde.forEachIn(qx, qz, qr, (s) => { if (s.team !== att.team && s.st !== ST.DEAD && test(s)) this._strike(att, h, s, ctx); });
    for (const f of this.fighters) if (f.team !== att.team && f.alive && f !== att && test(f)) this._strike(att, h, f, ctx);
    this._after(att, h, ctx);
    let ex = cx, ez = cz;
    if (shape === 'arc') { ex = att.x + fx * R * 0.55; ez = att.z + fz * R * 0.55; }
    this._hitFx(att, h, ex, ez, shape === 'line' ? Math.max(2.5, w * 2) : R, fx, fz, len, back);
  }
  _ctx(att, h) {
    const S = att.S; let base = att.atk * h.dmg;
    if (att.awake > 0) base *= 1.3;
    if (S) { if (att.state === 'sp') base *= S.musou * (att.awake > 0 ? 1.35 : 1); else if (att.kind === 'c') base *= S.charge; }
    else if (att.team === 0) base *= 0.3;
    if (att.team === 0 && !att.isPlayer) base *= this.soldierMul(0);
    return { base, hits: 0, kills: 0, off: false, dealt: 0, kx: 0, kz: 0, fxN: 0, crit: false };
  }
  // 1体への命中処理
  _strike(att, h, t, ctx) {
    const S = att.S, el = h.el ? att.elem : null, em = S ? S.elem : 1;
    let dmg = ctx.base * (0.9 + Math.random() * 0.2), lift = h.lift || 0;
    if (S && Math.random() * 100 < S.crit) { dmg *= 1.8; ctx.crit = true; }
    if (el === 'wind' && lift > 0) lift += 2.5 * em;
    const kb = h.kb, kx = ctx.kx * kb, kz = ctx.kz * kb;
    ctx.hits++; ctx.dealt += dmg;
    const near = this.nearCam(t.x, t.z, 55);
    if (t.isFighter) {
      ctx.off = true;
      const ok = t.takeHit(dmg, kx, kz, lift, att, h.heavy ? 2 : 1);
      if (ok) {
        if (h.stun && !t.boss) t.stun = Math.max(t.stun, h.stun * 0.6);
        if (el === 'fire') { t.burn = 3; t.burnDmg = ctx.base * 0.06 * em * 100 / (100 + t.def); }
        else if (el === 'ice') t.slowT = Math.max(t.slowT, t.boss ? 2 : 3.5 * em);
        else if (el === 'earth' && !t.boss && !t.isPlayer) t.stun = Math.max(t.stun, 1.0 * em);
        if (near) FX.hit(t.x, t.y + 1.2, t.z, att.col, h.heavy ? 1.6 : 1.0);
      }
    } else {
      if (h.stun) t.stun = Math.max(t.stun, h.stun);
      if (el === 'fire') { t.burn = 3; t.burnT = 0.5; t.burnDmg = ctx.base * 0.14 * em; t.burnSrc = att; }
      else if (el === 'ice') t.slow = 4 * em;
      else if (el === 'earth') t.stun = Math.max(t.stun, 1.6 * em);
      if (t.cap && !att.isPlayer) dmg *= 0.35;
      if (this.horde.damage(t, dmg, kx, kz, lift, att)) ctx.kills++;
      if (near && ctx.fxN < 5) { ctx.fxN++; FX.hit(t.x, t.y + 1.1, t.z, att.col, h.heavy ? 1.3 : 0.6); }
    }
  }
  _after(att, h, ctx) {
    if (ctx.hits <= 0) return;
    const isP = att.isPlayer, near = isP || this.nearCam(att.x, att.z, 30);
    if (isP) {
      const S = att.S;
      this.combo += ctx.hits; this.comboT = 2.8; if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      if (att.state !== 'sp') att.sp = Math.min(100, att.sp + ctx.hits * 0.6 * S.spGain + (ctx.off ? 1.5 : 0));
      if (att.awake <= 0) att.rage = Math.min(100, att.rage + ctx.hits * 0.38 * S.rageGain);
      let heal = S.steal > 0 ? ctx.dealt * S.steal / 100 : 0;
      if (h.el && att.elem === 'dark') heal += ctx.dealt * 0.025 * S.elem;
      if (heal > 0) att.hp = Math.min(att.maxHp, att.hp + Math.min(heal, att.maxHp * 0.04));
      this.hitStop = Math.max(this.hitStop, (h.stop || 0) * (ctx.off ? 1.7 : 1));
      GFX.shake((h.shake || 0) + (ctx.crit ? 0.08 : 0));
      if (h.heavy) this._vibe(18);
      if (ctx.crit) this.ui.pop('会心!');
    } else if (near && h.shake) GFX.shake(h.shake * 0.4);
    if (near) {
      Audio.sfx(h.heavy ? 'hitH' : 'hit', isP ? Math.min(1, 0.55 + ctx.hits * 0.08) : 0.45);
      if (h.el && att.elem === 'thunder' && ctx.hits > 0) this._chain(att, ctx);
    }
  }
  // 雷: 周囲の敵へ連鎖
  _chain(att, ctx) {
    let n = 0; const dmg = ctx.base * 0.35 * (att.S ? att.S.elem : 1);
    this.horde.forEachIn(att.x, att.z, 9, (s) => {
      if (n >= 3 || s.team === att.team || !s.alive || Math.random() > 0.3) return;
      n++; FX.bolt(s.x, s.z, att.col, 10, 1.8); if (this.horde.damage(s, dmg, 0, 0, 3, att)) ctx.kills++;
    });
    if (n) Audio.sfx('thunder', 0.5);
  }
  _hitFx(att, h, cx, cz, R, fx, fz, len = 0, back = 0) {
    const f = h.fx; if (!f || !this.nearCam(cx, cz, 70)) return;
    const list = Array.isArray(f) ? f : [f], c = att.col, el = att.elem || 'fire', isP = att.isPlayer;
    for (const k of list) {
      if (k === 'ring') FX.ring(cx, cz, c, R * 0.25, R * 1.05, 0.36);
      else if (k === 'burst') { if (this.rt - (att._bfx || -9) > 0.2) { att._bfx = this.rt; FX.burst(el, cx, cz, R, c); } }
      else if (k === 'pillar') { FX.elemPillar(el, cx, cz, R, c); Audio.sfx(ELEMENTS[el].sfx, isP ? 1 : 0.6); }
      else if (k === 'quake') { FX.quake(cx, cz, R, [c[0] * 0.4 + 0.6, c[1] * 0.4 + 0.5, c[2] * 0.4 + 0.4]); Audio.sfx('quake', isP ? 1 : 0.6); }
      else if (k === 'nova') { FX.nova(cx, cz, R, c); Audio.sfx('explode', isP ? 1 : 0.7); if (isP) GFX.doFlash(0.22); }
      else if (k === 'wave') { FX.wave(att.x + fx, att.z + fz, att.yaw, R, c); Audio.sfx(ELEMENTS[el].sfx, isP ? 0.9 : 0.5); }
      else if (k === 'line') FX.line(att.x - fx * back, att.z - fz * back, att.x + fx * len, att.z + fz * len, c);
      else if (k === 'tornado') FX.tornado(cx, cz, c, R, 9, 1.7);
    }
  }

  // ---------- 飛び道具・吸い寄せ・アイテム ----------
  _spawnProj(att, h) {
    const p = h.proj, yaw = att.yaw + (p.yaw || 0) * D2R, c = att.col, r = p.r * att.rangeMul;
    const o = { att, h, kind: p.kind, x: att.x + Math.sin(yaw) * 0.9, z: att.z + Math.cos(yaw) * 0.9, yaw, vx: Math.sin(yaw) * p.speed, vz: Math.cos(yaw) * p.speed, r, life: p.life, max: p.life, tick: p.tick || 0, tickT: 0, hit: p.tick ? null : new Set(), ctx: this._ctx(att, h), fxi: null, fxi2: null, spin: 0 };
    if (p.kind === 'crescent') o.fxi = FX.crescent(o.x, 1.0, o.z, yaw, c, r * 1.2, 99, 0, 1.1);
    else if (p.kind === 'tornado') o.fxi = FX.tornado(o.x, o.z, c, r * 0.9, 7.5, p.life);
    else if (p.kind === 'orb') o.fxi = FX.shell(o.x, 1.2, o.z, c, r * 0.75, r * 0.75, 99, 1.6);
    else if (p.kind === 'disc') { o.fxi = FX.crescent(o.x, 1.0, o.z, yaw, c, r, 99, 0, 1.2); o.fxi2 = FX.crescent(o.x, 1.0, o.z, yaw + PI, c, r, 99, 0, 1.2); }
    this.proj.push(o);
    if (att.isPlayer || this.nearCam(o.x, o.z, 30)) Audio.sfx(p.kind === 'tornado' ? 'wind' : 'swing', 0.8);
  }
  _updateProj(dt) {
    const P = this.proj;
    for (let i = P.length - 1; i >= 0; i--) {
      const o = P[i]; o.life -= dt; o.x += o.vx * dt; o.z += o.vz * dt;
      if (this.stage.sdf(o.x, o.z) > 0.8) o.life = 0;
      const c = o.att.col;
      if (o.fxi && !o.fxi.dead) { o.fxi.mesh.position.x = o.x; o.fxi.mesh.position.z = o.z; if (o.kind === 'disc') { o.spin += dt * 22; o.fxi.mesh.rotation.y = o.spin; if (o.fxi2) { o.fxi2.mesh.position.x = o.x; o.fxi2.mesh.position.z = o.z; o.fxi2.mesh.rotation.y = o.spin + PI; } } }
      if (Math.random() < dt * 40) FX.glowP.add(o.x + rnd(-o.r, o.r) * 0.6, rnd(0.5, 1.6), o.z + rnd(-o.r, o.r) * 0.6, 0, rnd(0, 1), 0, 0.3, 0.3, 0.05, c[0], c[1], c[2], 0.8);
      let doTest = true;
      if (o.tick) { o.tickT -= dt; doTest = o.tickT <= 0; if (doTest) o.tickT = o.tick; }
      if (doTest) {
        const ctx = o.ctx, att = o.att, h = o.h, l = Math.hypot(o.vx, o.vz) || 1; ctx.hits = 0; ctx.fxN = 0; ctx.off = false; ctx.dealt = 0;
        const hitOne = (t) => {
          const dx = t.x - o.x, dz = t.z - o.z, rr = o.r + t.rad; if (dx * dx + dz * dz > rr * rr) return;
          if (o.hit) { const key = t.isFighter ? t : t.gen; if (o.hit.has(key)) return; o.hit.add(key); }
          ctx.kx = o.vx / l; ctx.kz = o.vz / l; this._strike(att, h, t, ctx);
        };
        this.horde.forEachIn(o.x, o.z, o.r + 1, (s) => { if (s.team !== att.team && s.st !== ST.DEAD) hitOne(s); });
        for (const f of this.fighters) if (f.team !== att.team && f.alive) hitOne(f);
        this._after(att, h, ctx);
      }
      if (o.life <= 0) { FX.kill(o.fxi); FX.kill(o.fxi2); if (this.nearCam(o.x, o.z, 50)) FX.spark(o.x, 1, o.z, c[0], c[1], c[2], 6, 5); P[i] = P[P.length - 1]; P.pop(); }
    }
  }
  _updatePulls(dt) {
    for (let i = this.pulls.length - 1; i >= 0; i--) {
      const q = this.pulls[i]; q.t -= dt;
      this.horde.forEachIn(q.x, q.z, q.r, (s) => {
        if (s.team === q.team || s.st === ST.DEAD) return;
        const dx = q.x - s.x, dz = q.z - s.z, d = Math.hypot(dx, dz);
        if (d > q.r || d < 1.2) return;
        const k = q.force * dt / d; s.x += dx * k; s.z += dz * k;
        if (s.st === ST.FREE || s.st === ST.ATK) { s.st = ST.HIT; s.t = 0.25; s.vx = s.vz = 0; s.tok = false; }
      });
      for (const f of this.fighters) {
        if (f.team === q.team || !f.alive || f.sealed) continue;
        const dx = q.x - f.x, dz = q.z - f.z, d = Math.hypot(dx, dz);
        if (d < q.r && d > 1.5) { const k = q.force * (f.boss ? 0.25 : f.isPlayer ? 0.45 : 0.5) * dt / d; f.x += dx * k; f.z += dz * k; }
      }
      if (Math.random() < dt * 60 && this.nearCam(q.x, q.z, 50)) { const a = rnd(6.283), r = q.r * rnd(0.5, 1); FX.glowP.add(q.x + Math.cos(a) * r, rnd(0.3, 2), q.z + Math.sin(a) * r, -Math.cos(a) * r * 2.2, 0.5, -Math.sin(a) * r * 2.2, 0.4, 0.35, 0.08, q.c[0], q.c[1], q.c[2], 0.9); }
      if (q.t <= 0) { this.pulls[i] = this.pulls[this.pulls.length - 1]; this.pulls.pop(); }
    }
  }
  drop(kind, x, z, val) {
    if (this.pickups.length > 40) return;
    const col = kind === 'hp' ? [0.5, 3.2, 0.9] : kind === 'sp' ? [3.4, 2.8, 0.4] : kind === 'gold' ? [3.2, 2.2, 0.3] : [3.0, 1.0, 3.6];
    const a = rnd(6.283), o = { kind, x: x + Math.cos(a) * 0.8, z: z + Math.sin(a) * 0.8, t: 0, val, col, fxi: null };
    this.stage.constrain(o, 0.6);
    o.fxi = FX.shell(o.x, 0.8, o.z, col, kind === 'weapon' ? 0.5 : 0.34, kind === 'weapon' ? 0.5 : 0.34, 60, kind === 'weapon' ? 2.2 : 1.6);
    this.pickups.push(o);
  }
  _updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const o = this.pickups[i]; o.t += dt;
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
      if (p.alive && d < 4.2 && d > 0.01) { const k = Math.min(1, 14 * dt / d); o.x += dx * k; o.z += dz * k; }
      if (o.fxi && !o.fxi.dead) o.fxi.mesh.position.set(o.x, 0.8 + Math.sin(o.t * 3) * 0.15, o.z);
      if (o.kind === 'weapon' && Math.random() < dt * 14) FX.glowP.add(o.x, 0.8, o.z, rnd(-0.3, 0.3), rnd(2, 5), rnd(-0.3, 0.3), 0.7, 0.22, 0.04, o.col[0], o.col[1], o.col[2], 1);
      if (p.alive && d < 1.3) {
        if (o.kind === 'hp') { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * o.val / 100); FX.embers(p.x, 0.4, p.z, 0.5, 3.4, 1.0, 12, 0.5, 4); Audio.sfx('pickup'); }
        else if (o.kind === 'sp') { p.sp = Math.min(100, p.sp + o.val); Audio.sfx('pickup'); }
        else if (o.kind === 'gold') { this.gold += o.val; Audio.sfx('pickup'); }
        else { this.loot.push(o.val); Audio.sfx('treasure'); this.ui.toast('武器を入手!'); }
        o.t = 999;
      }
      if (o.t > 45) { FX.kill(o.fxi); this.pickups[i] = this.pickups[this.pickups.length - 1]; this.pickups.pop(); }
    }
  }
  _lootWeapon(minRar = 1) {
    const heroes = this.save.unlockedHeroes, hid = Math.random() < 0.75 ? this.player.heroId : pick(heroes);
    return rollWeapon(HERO[hid].wtype, this.power + this.wave * 1.5, this.player.S.luck, minRar);
  }

  // ---------- 各種イベント ----------
  onSoldierKO(s, src) {
    if (s.base) s.base.onDead(s, src); else if (s.sq && s.sq.n !== undefined && s.sq.path) s.sq.n--;
    if (src !== this.player) return;
    this.ko++; this.exp += s.exp; const p = this.player;
    if (p.state !== 'sp') p.sp = Math.min(100, p.sp + 0.5 * p.S.spGain);
    if (p.awake <= 0) p.rage = Math.min(100, p.rage + 0.45 * p.S.rageGain);
    if (s.cap) { this.drop('hp', s.x, s.z, 18); this.gold += 40; if (Math.random() < 0.12) this.drop('weapon', s.x, s.z, this._lootWeapon()); }
    else { const r = Math.random(); if (r < 0.022) this.drop('hp', s.x, s.z, 8); else if (r < 0.036) this.drop('sp', s.x, s.z, 18); else if (r < 0.05) this.drop('gold', s.x, s.z, 25); }
    const mile = this.ko >= 1000 ? Math.floor(this.ko / 500) * 500 : this.ko >= 100 ? Math.floor(this.ko / 100) * 100 : 0;
    if (mile > this.koMile) { this.koMile = mile; this.ui.koBanner(mile); this.morale = clamp(this.morale + 2, -100, 100); Audio.sfx('levelup'); }
  }
  onFighterDamaged(f, d, src, power) {
    if (f.isPlayer) {
      this.dmgTaken += d; this.ui.hurt(); GFX.shake(power > 0 ? 0.3 : 0.1); Audio.sfx('hurt', power > 0 ? 1 : 0.5);
      if (power > 0) this.hitStop = Math.max(this.hitStop, 0.03);
      this._vibe(power > 0 ? 40 : 12);
      this.combo = Math.floor(this.combo * (power > 0 ? 0.5 : 1));
    }
  }
  onFighterDead(f, src) {
    const byP = src === this.player, near = this.nearCam(f.x, f.z, 60);
    if (f.isPlayer) { this._lose('討ち死に…'); return; }
    if (near) { FX.nova(f.x, f.z, 3.5, f.col); Audio.sfx('explode', 0.8); GFX.shake(0.4); }
    if (f.team === 1) {
      this.morale = clamp(this.morale + (f.boss ? 30 : 5), -100, 100);
      if (byP) {
        this.offKO++; this.exp += f.expVal; this.gold += f.boss ? 600 : 150;
        this.slowT = f.boss ? 1.6 : 0.55; this.slowScale = 0.22; GFX.doFlash(0.35);
        this.ui.banner(f.boss ? '敵総大将 撃破' : '敵将 討ち取ったり', (f.title ? f.title + ' ' : '') + f.name, 'gold');
        this.drop('hp', f.x, f.z, 30);
        if (Math.random() < (f.boss ? 1 : 0.5)) this.drop('weapon', f.x, f.z, this._lootWeapon(f.boss ? 2 : 1));
        if (this.mission && this.mission.target === f) { this.missionsDone++; this.gold += 300; this.morale = clamp(this.morale + 10, -100, 100); this.ui.banner('戦功達成', this.mission.title, 'good'); this.mission = null; this.ui.mission(null); }
      } else { this.ui.say('伝令', `味方が敵将${f.name}を討ち取りました!`); if (this.mission && this.mission.target === f) { this.mission = null; this.ui.mission(null); } }
      if (f === this.boss) this._win();
    } else {
      this.morale = clamp(this.morale - 6, -100, 100);
      this.ui.say(f.name, '無念…ここは退く!'); Audio.sfx('warn');
      if (f.isHero) this.respawn.push({ id: f.heroId, t: 50 });
    }
  }
  onSpecial(f) {
    const near = f.isPlayer || this.nearCam(f.x, f.z, 40);
    if (near) { Audio.sfx('special'); FX.nova(f.x, f.z, 3, f.col); }
    if (f.isPlayer) {
      this.spCam = 1.1; this.slowT = 0.32; this.slowScale = 0.12; GFX.radial = 0.6; GFX.doFlash(0.3, ELEMENTS[f.elem].css);
      this.ui.cutin((f.awake > 0 ? '真・' : '') + f.ms.spName, f.name, ELEMENTS[f.elem].css);
    } else if (near) this.ui.say(f.name, `奥義——${f.ms.spName}!`);
  }
  onAwaken(f) {
    Audio.sfx('awaken'); GFX.doFlash(0.45, ELEMENTS[f.elem].css); GFX.radial = 0.8; GFX.shake(0.7); this.slowT = 0.3; this.slowScale = 0.15;
    this.ui.cutin('覚醒', f.name, ELEMENTS[f.elem].css);
    this.doHit(f, { shape: 'circle', r: 6.5, fwd: 0, dmg: 1.2, kb: 9, lift: 6, shake: 0.5, stop: 0.06, fx: ['nova', 'ring'], heavy: true }, null);
  }
  onPerfectDodge(f, src) {
    this.perfect++; Audio.sfx('perfect'); this.slowT = 0.45; this.slowScale = 0.25; GFX.radial = 0.5; GFX.doFlash(0.2, '#bfe9ff');
    f.sp = Math.min(100, f.sp + 22); if (f.awake <= 0) f.rage = Math.min(100, f.rage + 10); f.inv = Math.max(f.inv, 0.6);
    this.ui.pop('見切り!');
    for (const o of this.fighters) if (o.team !== f.team && o.alive && !o.boss && this.nearCam(o.x, o.z, 8)) o.stun = Math.max(o.stun, 1.3);
    if (src && src.alive && src.boss) src.stag += 3;
  }
  onBossPhase2(f) {
    if (this.bossBgm) Audio.bgm('rage');
    this.ui.say(f.name, BOSS_LINES[f.lookId] || 'まだだ…まだ終わらぬ!'); this.ui.banner('激昂', f.name + ' の攻撃が激しくなった', 'bad');
    FX.nova(f.x, f.z, 6, [4, 0.5, 0.3]); GFX.shake(0.8); Audio.sfx('awaken');
  }

  _spawnOfficer(sp, mul = 1) {
    const names = OFFICER_NAMES.filter((n) => !this.fighters.some((f) => f.name === n && f.alive));
    const f = this._enemyOfficer({ ...sp, order: sp.order || 'attack' }, pick(names.length ? names : OFFICER_NAMES), mul);
    if (f.role === 'attack') this._assign(f);
    return f;
  }
  _events(dt) {
    for (const e of this.events) {
      if (e.done) continue;
      if (e.at !== undefined ? this.time < e.at : this.capEnemy < e.cap) continue;
      e.done = true;
      if (e.say) this.ui.say(e.say[0], e.say[1]);
      if (e.spawn && this.fighters.length < 14) {
        const f = this._spawnOfficer(e.spawn); Audio.sfx('warn');
        if (e.mission) { this.mission = { title: e.mission, target: f, t: 160 }; this.ui.mission(e.mission); }
      }
    }
    if (this.mission) { this.mission.t -= dt; if (this.mission.t <= 0) { this.ui.toast('戦功失敗…'); this.mission = null; this.ui.mission(null); } }
  }
  _waves(dt) {
    const cap = this.horde.cap;
    this.waveE -= dt;
    if (this.waveE <= 0) {
      this.waveE = (26 + rnd(14)) * (0.75 + this.diff.cd * 0.35);
      const own = this.bases.filter((b) => b.team === 1);
      if (own.length && this.horde.n < cap - 16) { const from = pick(own), tg = this._nearestBase(from.node, (b) => b.team === 0); if (tg) this._march(1, from.node, tg, Math.round(11 * this.pop)); }
    }
    this.waveA -= dt;
    if (this.waveA <= 0) {
      this.waveA = 46 + rnd(16);
      const own = this.bases.filter((b) => b.team === 0);
      if (own.length && this.horde.n < cap - 24) { const from = pick(own), tg = this._nearestBase(from.node, (b) => b.team === 1 && !(b.main && this.sealed)); if (tg) this._march(0, from.node, tg, Math.round(7 * this.pop)); }
    }
  }
  _updateSquads(dt) {
    for (let i = this.squads.length - 1; i >= 0; i--) {
      const M = this.squads[i];
      if (M.n <= 0) { this.squads[i] = this.squads[this.squads.length - 1]; this.squads.pop(); continue; }
      if (M.arrived) {
        const b = M.goal.team !== undefined ? M.goal : null;
        if (b && b.team === M.team) {    // 自軍拠点に到着 → 守備隊に合流
          const L = this.horde.list;
          for (let k = 0; k < this.horde.n; k++) { const s = L[k]; if (s.sq === M && s.alive) { s.sq = b; s.base = b; b.alive++; const a = rnd(6.283), d = b.R * rnd(0.2, 0.7); s.ox = Math.sin(a) * d; s.oz = Math.cos(a) * d; } }
          M.n = 0;
        }
        continue;
      }
      const wp = M.path[M.pi], dx = wp.x - M.x, dz = wp.z - M.z, d = Math.hypot(dx, dz);
      if (d < 2) { M.pi++; if (M.pi >= M.path.length) M.arrived = true; }
      else { const v = 2.8 * dt / d; M.x += dx * v; M.z += dz * v; }
    }
  }
  _endless(dt) {
    let alive = 0; const L = this.horde.list;
    for (let i = 0; i < this.horde.n; i++) if (L[i].team === 1 && L[i].alive) alive++;
    const officers = this.fighters.filter((f) => f.team === 1 && f.alive).length;
    this.waveT -= dt;
    if ((alive < 6 * this.pop && officers === 0 && this.waveT < 30) || this.waveT <= 0) {
      this.wave++; this.waveT = 34;
      const w = this.wave, mul = 1 + (w - 1) * 0.14; this._scale(mul);
      const n = Math.min(this.horde.cap - this.horde.n - 4, Math.round((26 + w * 3) * this.pop));
      for (let k = 0; k < n; k++) {
        const g = this.stage.nodes[1 + (k % 4)], a = rnd(6.283), d = rnd(0, 7);
        this.horde.spawn(1, rnd() < 0.35 ? 1 : 0, g.x + Math.sin(a) * d, g.z + Math.cos(a) * d, { ...this.solStats(1), squad: this.player, ox: Math.sin(a) * 3, oz: Math.cos(a) * 3, aggro: 300 });
      }
      if (w % 5 === 0) { const b = pick([['boss1', 'boss_axe', 'axe'], ['boss2', 'boss_twin', 'twin'], ['boss3', 'boss_spear', 'spear'], ['boss4', 'boss_hammer', 'hammer'], ['boss5', 'boss_final', 'scythe']]);
        this._enemyOfficer({ n: 1 + ((w / 5) | 0) % 4, boss: true, look: b[0], ms: b[1], wtype: b[2], hp: 2.2, title: '猛将', squad: 6 }, pick(OFFICER_NAMES)); Audio.sfx('warn'); this.ui.say('伝令', '強敵が現れました!'); }
      else if (w % 2 === 0) this._spawnOfficer({ n: 1 + (w % 4), ms: pick(['off_sword', 'off_spear', 'off_axe']), order: 'hunt', squad: 5 }, 1);
      this.ui.banner(`第${w}波`, w % 5 === 0 ? '強敵襲来' : '', w % 5 === 0 ? 'bad' : 'gold'); Audio.sfx('drum');
      const p = this.player; if (w > 1) { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.08); this.gold += 40 + w * 10; }
      if (w % 3 === 0) this.drop('hp', rnd(-8, 8), rnd(-8, 8), 25);
      this._objective();
    }
  }

  _win() {
    if (this.ended) return; this.ended = true; this.state = 'win'; this.stateT = 0;
    Audio.stopBgm(); Audio.sfx('win'); this.ui.banner('勝利', 'VICTORY', 'gold'); Input.clear();
  }
  _lose(msg) {
    if (this.ended) return; this.ended = true; this.state = 'lose'; this.stateT = 0; this.slowT = 2.2; this.slowScale = 0.25;
    Audio.stopBgm(); Audio.sfx('lose'); this.ui.banner(this.endless ? '戦闘終了' : '敗北', msg, 'bad'); Input.clear();
  }
  result(win) {
    const S = this.player.S, d = this.def, t = this.time, rew = this.diff.rew;
    let rank = '-';
    if (win && !this.endless) {
      const pts = Math.min(35, this.ko / d.koGoal * 35) + (t <= d.par ? 25 : Math.max(0, 25 - (t - d.par) / d.par * 50)) + clamp(1 - this.dmgTaken / this.player.maxHp / 2.5, 0, 1) * 15
        + Math.min(10, this.missionsDone * 10) + Math.min(10, this.maxCombo / 300 * 10) + Math.min(5, this.capEnemy);
      rank = pts >= 82 ? 'S' : pts >= 66 ? 'A' : pts >= 48 ? 'B' : 'C';
    }
    const lvk = 1 + this.lv * 0.3;
    const exp = Math.round((this.exp * (win || this.endless ? 1 : 0.6) + (win ? 320 * lvk : 0)) * S.exp * rew);
    const gold = Math.round((this.gold + this.ko * 0.6 + (win ? 260 * (1 + this.lv * 0.15) : 0)) * S.gold * rew);
    const loot = this.loot.slice();
    if (win) loot.push(this._lootWeapon(rank === 'S' ? 3 : rank === 'A' ? 2 : 1));
    if (this.endless) for (let i = 0; i < Math.floor(this.wave / 5); i++) loot.push(this._lootWeapon(2));
    let relic = false;
    if (win && d.id === 's5' && (this.diff.id === 'chaos' || this.diff.id === 'hell') && rank === 'S') {
      const wt = HERO[this.player.heroId].wtype;
      if (!this.save.weapons.some((w) => w.type === wt && w.rar === 6)) { loot.push(rollWeapon(wt, this.power + 20, 0, 6, 6)); relic = true; }
    }
    return { win, endless: this.endless, stage: d, diff: this.diff, heroId: this.player.heroId, rank, time: t, ko: this.ko, maxCombo: this.maxCombo, dmgTaken: this.dmgTaken, hpRate: this.dmgTaken / this.player.maxHp,
      offKO: this.offKO, caps: this.capEnemy, missions: this.missionsDone, perfect: this.perfect, wave: this.wave, exp, gold, loot, relic };
  }

  // ---------- メインループ ----------
  update(dtR) {
    this.rt += dtR; this.stateT += dtR;
    let ts = 1;
    if (this.hitStop > 0) { this.hitStop -= dtR; ts = 0.05; }
    else if (this.slowT > 0) { this.slowT -= dtR; ts = this.slowScale; }
    const dt = Math.min(dtR, 0.05) * ts, play = this.state === 'play';
    if (this.state === 'intro' && this.stateT > 2.9) { this.state = 'play'; Input.clear(); this.ui.banner('出陣', this.endless ? '限界まで戦え' : '敵総大将を討て', 'gold'); Audio.sfx('drum'); }
    if ((this.state === 'win' && this.stateT > 4.2) || (this.state === 'lose' && this.stateT > 3.6)) { if (!this.sent) { this.sent = true; this.cfg.onEnd(this.result(this.state === 'win')); } }
    if (play) this.time += dt;
    this.horde.rebuild();
    const F = this.fighters;
    for (let i = 0; i < F.length; i++) F[i].update(dt);
    // 武将同士の押し合い
    for (let i = 0; i < F.length; i++) {
      const a = F[i]; if (!a.alive || a.ghost) continue;
      for (let j = i + 1; j < F.length; j++) {
        const b = F[j]; if (!b.alive || b.ghost) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, mn = a.rad + b.rad + 0.15;
        if (d2 < mn * mn && d2 > 1e-5) { const d = Math.sqrt(d2), p = (mn - d) / d * 0.5, wa = a.boss ? 0.2 : 1, wb = b.boss ? 0.2 : 1; a.x -= dx * p * wa; a.z -= dz * p * wa; b.x += dx * p * wb; b.z += dz * p * wb; }
      }
    }
    if (this.sealed && this.sealPos) {
      const sp = this.sealPos;
      for (const f of F) { if (f.team !== 0 || !f.alive) continue; const dx = f.x - sp.x, dz = f.z - sp.z, d = Math.hypot(dx, dz); if (d < 7.6) { const k = 7.6 / (d || 1); f.x = sp.x + dx * k; f.z = sp.z + dz * k; if (f.isPlayer) this.sealBlock(this.boss, f); } }
      const b = this.boss; if (b && b.alive) { const dx = b.x - sp.x, dz = b.z - sp.z; if (dx * dx + dz * dz > 9) { b.x = sp.x; b.z = sp.z; } }
    }
    this._updateProj(dt); this._updatePulls(dt); this._updatePickups(dt);
    if (play) {
      if (this.endless) this._endless(dt);
      else { for (const b of this.bases) b.update(dt); this._waves(dt); this.ordT -= dt; if (this.ordT <= 0) { this.ordT = 6; this._orders(); } }
      this._updateSquads(dt); this._events(dt);
      for (let i = this.respawn.length - 1; i >= 0; i--) {     // 撤退した味方武将の復帰
        const r = this.respawn[i]; r.t -= dt; if (r.t > 0) continue;
        this.respawn.splice(i, 1);
        const main = this.bases.find((b) => b.main && b.team === 0);
        if (main) { const f = this._allyHero(HERO[r.id], main.x + rnd(-3, 3), main.z + 4); this._assign(f); this.ui.say(f.name, '待たせたな、戦線に復帰する!'); }
      }
      if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
      // 注目対象(近くの敵将)
      this.focusT -= dt;
      if (this.focusT <= 0) {
        this.focusT = 0.25; let best = null, bd = 22 * 22; const p = this.player;
        for (const f of F) { if (f.team === 0 || !f.alive) continue; const dx = f.x - p.x, dz = f.z - p.z, d2 = (dx * dx + dz * dz) * (f.boss ? 0.5 : 1); if (d2 < bd) { bd = d2; best = f; } }
        this.focus = best;
        this.curBase = null; for (const b of this.bases) { const dx = b.x - p.x, dz = b.z - p.z; if (dx * dx + dz * dz < (b.R + 2) * (b.R + 2)) { this.curBase = b; break; } }
        if (best && best.boss && !best.sealed && !this.bossBgm) { this.bossBgm = true; Audio.bgm('boss'); this.ui.say(best.name, 'よくぞここまで来た。だが、ここが貴様の墓場だ。'); }
        Audio.intensity = clamp(0.35 + this.combo / 160 + (this.bossBgm ? 0.35 : 0) + (this.player.awake > 0 ? 0.3 : 0), 0, 1);
      }
    }
    this.horde.update(dt);
    for (let i = F.length - 1; i >= 0; i--) if (F[i].gone) { F[i].dispose(); F.splice(i, 1); }
    this.stage.update(dt);
    const p = this.player;
    FX.weather(this.theme.weather, p.x, 1.5, p.z, dtR);
    FX.update(dt);
    this._camera(dtR);
    GFX.updateSun(p.x, 0, p.z);
    GFX.desat = damp(GFX.desat, this.state === 'lose' ? 0.85 : 0, 3, dtR);
    this.ui.hud(this);
  }

  _camera(dtR) {
    const c = this.cam, p = this.player, cam = GFX.camera, set = this.save.settings;
    c.baseDist = cam.aspect < 1 ? 12.5 : 9.8;
    if (this.state === 'intro') {
      const u = ease.io(clamp(this.stateT / 2.8, 0, 1));
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), back = c.baseDist * Math.cos(c.pitch);
      const ex = p.x - fx * back, ey = 1.5 + c.baseDist * Math.sin(c.pitch), ez = p.z - fz * back;
      const sx = p.x + 26, sy = 62, sz = p.z + 30, a = this.stateT * 0.25;
      cam.position.set(lerp(sx * Math.cos(a) , ex, u), lerp(sy, ey, u), lerp(sz, ez, u));
      cam.lookAt(lerp(0, p.x + fx * 2.2, u), lerp(0, 1.85, u), lerp(p.z + 70, p.z + fz * 2.2, u));
      c.tx = p.x; c.tz = p.z; c.dist = c.baseDist; c.p = c.pitch;
      return;
    }
    const sens = set.camSens || 1;
    if (Input.camDX || Input.camDY) { c.yaw -= Input.camDX * 0.0055 * sens; c.pitch = clamp(c.pitch + Input.camDY * 0.0035 * sens, 0.14, 1.0); c.manualT = this.rt; }
    else if (set.autoCam !== false && this.rt - c.manualT > 1.3 && p.state === 'idle') {
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > 2.5) { const d = angWrap(p.yaw - c.yaw); if (Math.abs(d) < 2.4) c.yaw += d * Math.min(1, dtR * 1.15); }
    }
    let dist = c.baseDist, pitch = c.pitch, tx = p.x, tz = p.z, ty = p.y * 0.5 + 1.5;
    if (this.spCam > 0) { this.spCam -= dtR; const k = Math.min(1, this.spCam / 0.35); dist = lerp(dist, 6.3, k); pitch = lerp(pitch, 0.2, k); c.yaw += dtR * 1.2 * k; }
    if (this.state === 'win' && this.boss) { c.yaw += dtR * 0.45; dist = 8; pitch = 0.3; }
    if (this.state === 'lose') { c.yaw += dtR * 0.2; dist = 7.5; }
    c.dist = damp(c.dist, dist, 6, dtR); c.p = damp(c.p, pitch, 9, dtR);
    c.tx = damp(c.tx, tx, 14, dtR); c.tz = damp(c.tz, tz, 14, dtR); c.ty = damp(c.ty, ty, 10, dtR);
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), back = c.dist * Math.cos(c.p);
    const cx = c.tx - fx * back, cz = c.tz - fz * back; let cy = c.ty + c.dist * Math.sin(c.p);
    // 丘に視線が遮られないよう、地形に合わせてカメラを持ち上げる
    for (let s = 0.3; s <= 1.001; s += 0.175) {
      const need = c.ty + (this.stage.heightAt(c.tx + (cx - c.tx) * s, c.tz + (cz - c.tz) * s) + 0.7 - c.ty) / s;
      if (need > cy) cy = need;
    }
    c.cy = c.cy === undefined ? cy : (cy > c.cy ? damp(c.cy, cy, 18, dtR) : damp(c.cy, cy, 4, dtR));
    cam.position.set(cx, c.cy, cz); cam.lookAt(c.tx + fx * 2.2, c.ty + 0.35, c.tz + fz * 2.2);
  }

  dispose() {
    for (const f of this.fighters) f.dispose();
    this.horde.dispose(); this.stage.dispose(); FX.clear();
    if (this.dome) { GFX.scene.remove(this.dome); this.dome.geometry.dispose(); this.dome.material.dispose(); }
    GFX.desat = 0;
  }
}
