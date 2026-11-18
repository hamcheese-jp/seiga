// 雑兵システム: 数百体をインスタンス描画し、簡易AI・物理・やられ演出を一括処理する
import * as THREE from 'three';
import { GFX, patchMat } from './gfx.js';
import { soldierGeos } from './models.js';
import { clamp, rnd, angDamp } from './util.js';
import { FX } from './fx.js';
import { makeSoldierMesh, setAnim } from './vat.js';

export const ST = { FREE: 0, ATK: 1, HIT: 2, AIR: 3, DOWN: 4, GETUP: 5, DEAD: 6 };
// 雑兵の職業: 0刀兵 1槍兵 2弓兵 3術兵 4重装兵(大槌)。w=持つ武器(soldier*.bin の武器番号)、shot=飛び道具
export const SJOB = [
  { n: '刀兵', w: 1, reach: 1.6 },
  { n: '槍兵', w: 2, reach: 2.3 },
  { n: '弓兵', w: 3, reach: 11, shot: 'arrow', hp: 0.8, dmg: 0.9 },
  { n: '術兵', w: 4, reach: 9.5, shot: 'fire', hp: 0.7, dmg: 1.3 },
  { n: '重装兵', w: 5, reach: 1.9, hp: 2.2, dmg: 1.6, spd: 0.72, scale: 1.14 },
];
const pickJob = () => { const r = Math.random(); return r < 0.4 ? 0 : r < 0.64 ? 1 : r < 0.8 ? 2 : r < 0.9 ? 4 : 3; };
const lin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const TINT = [lin('#2b5fd9'), lin('#c8261f')], CAPT = [[0.5, 1.0, 2.6], [2.6, 0.9, 0.25]];
const HALF_PI = Math.PI / 2;

export class Horde {
  constructor(B, cap) {
    this.B = B; this.cap = cap; this.list = []; this.n = 0; this.gen = 1;
    const G = soldierGeos();
    this.mat = patchMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 }), 0.7, true);
    this.meshes = [];
    const mk = (geo) => {
      const m = new THREE.InstancedMesh(geo, this.mat, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.castShadow = true; m.count = 0; GFX.scene.add(m); this.meshes.push(m);
      return m;
    };
    // 焼き付け済みの動き付きキャラがあればそれを使う(無ければ従来の簡易兵)
    this.vat = makeSoldierMesh(cap, 0);
    this.vat2 = makeSoldierMesh(cap, 1);
    if (this.vat) { GFX.scene.add(this.vat); this.meshes.push(this.vat); if (this.vat2) { GFX.scene.add(this.vat2); this.meshes.push(this.vat2); } }
    else { this.mTorso = mk(G.torso); this.mHead = mk(G.head); this.mArmL = mk(G.armL); this.mSword = mk(G.armSword); this.mSpear = mk(G.armSpear); this.mLegL = mk(G.leg); this.mLegR = mk(G.leg); }
    // 影マップ無効時の丸影
    this.blob = null;
    if (!GFX.q.shadow) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
      const g = c.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      const geo = new THREE.PlaneGeometry(1.5, 1.5); geo.rotateX(-HALF_PI);
      this.blobTex = new THREE.CanvasTexture(cv);
      this.blob = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false }), cap + 24);
      this.blob.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.blob.frustumCulled = false; this.blob.count = 0; this.blob.renderOrder = 1; GFX.scene.add(this.blob);
    }
    // 空間グリッド
    this.cell = 2.2; this.gx = 200; this.gn = Math.ceil(this.gx * 2 / this.cell);
    this.head = new Int16Array(this.gn * this.gn); this.next = new Int16Array(cap);
  }

  spawn(team, type, x, z, o = {}) {
    if (this.n >= this.cap) return null;
    let s = this.list[this.n]; if (!s) { s = {}; this.list[this.n] = s; }
    this.n++;
    if (!o.captain) type = o.job ?? pickJob();
    const J = SJOB[type] || SJOB[0];
    s.gen = this.gen++; s.team = team; s.type = type; s.x = x; s.z = z; s.y = 0; s.yo = 0; s.vx = s.vz = s.vy = 0; s.yaw = o.yaw ?? rnd(6.28);
    s.cap = !!o.captain; s.scale = s.cap ? 1.34 : (0.93 + rnd(0.15)) * (J.scale || 1);
    s.maxHp = s.hp = (o.hp || 40) * (s.cap ? 1 : J.hp || 1); s.dmg = (o.dmg || 10) * (s.cap ? 1 : J.dmg || 1); s.spd = ((s.cap ? 3.5 : 3.8) + rnd(0.9)) * (J.spd || 1); s.reach = J.reach * (s.cap ? 1.2 : 1); s.shot = s.cap ? null : J.shot || null;
    s.st = ST.FREE; s.t = 0; s.ph = rnd(6.28); s.cd = 0.4 + rnd(2.2); s.think = rnd(0.5); s.tgt = null; s.tgen = 0;
    s.sq = o.squad || null; s.ox = o.ox ?? 0; s.oz = o.oz ?? 0; s.base = o.base || null;
    s.flash = 0; s.pitch = 0; s.spin = 0; s.stun = 0; s.slow = 0; s.burn = 0; s.burnT = 0; s.burnDmg = 0; s.burnSrc = null;
    s.alive = true; s.isFighter = false; s.rad = 0.42 * s.scale; s.tok = false; s.exp = o.exp || 1; s.mv = 0; s.arm = 0; s.rm = false; s.landed = false;
    s.aggro = o.aggro ?? 12; s.hitDone = false;
    return s;
  }

  rebuild() {
    this.head.fill(-1);
    const L = this.list, g = this.gn, c = this.cell, gx = this.gx;
    for (let i = 0; i < this.n; i++) {
      const s = L[i]; if (s.st === ST.DEAD) continue;
      const cx = clamp(((s.x + gx) / c) | 0, 0, g - 1), cz = clamp(((s.z + gx) / c) | 0, 0, g - 1), k = cz * g + cx;
      this.next[i] = this.head[k]; this.head[k] = i;
    }
  }
  forEachIn(x, z, r, fn) {
    const g = this.gn, c = this.cell, gx = this.gx, L = this.list;
    const x0 = clamp(((x - r + gx) / c) | 0, 0, g - 1), x1 = clamp(((x + r + gx) / c) | 0, 0, g - 1);
    const z0 = clamp(((z - r + gx) / c) | 0, 0, g - 1), z1 = clamp(((z + r + gx) / c) | 0, 0, g - 1);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      let i = this.head[cz * g + cx];
      while (i >= 0) { fn(L[i]); i = this.next[i]; }
    }
  }
  countNear(x, z, r, team) { let n = 0; const r2 = r * r; this.forEachIn(x, z, r, (s) => { if (s.team === team && s.st !== ST.DEAD) { const dx = s.x - x, dz = s.z - z; if (dx * dx + dz * dz < r2) n++; } }); return n; }

  // ダメージ適用。倒したら true
  damage(s, dmg, kx, kz, lift, src, dot) {
    if (s.st === ST.DEAD) return false;
    s.hp -= dmg; s.flash = 1; s.tok = false;
    if (s.hp <= 0) {
      s.st = ST.DEAD; s.alive = false; s.landed = false; s.t = 0;
      const k = dot ? 0.3 : 1.35;
      s.vx = kx * k + rnd(-1.2, 1.2); s.vz = kz * k + rnd(-1.2, 1.2); s.vy = Math.max(lift, 4.2 + rnd(3));
      s.spin = (rnd() < 0.5 ? -1 : 1) * (5 + rnd(7));
      this.B.onSoldierKO(s, src);
      return true;
    }
    if (s.cap && lift < 6) { if (s.st !== ST.AIR && s.st !== ST.DOWN) { s.st = ST.HIT; s.t = 0.22; s.vx = kx * 0.25; s.vz = kz * 0.25; } return false; }
    if (lift > 0) { s.st = ST.AIR; s.vy = lift * (s.cap ? 0.6 : 1); s.vx = kx; s.vz = kz; s.spin = rnd(-6, 6); s.landed = false; }
    else if (s.st === ST.AIR) { s.vy = Math.max(s.vy, 2.6); s.vx = kx * 0.6; s.vz = kz * 0.6; }
    else if (s.st === ST.DOWN || s.st === ST.GETUP) { s.st = ST.DOWN; s.vx = kx * 0.5; s.vz = kz * 0.5; s.t = Math.max(s.t, 0.5); }
    else { s.st = ST.HIT; s.t = 0.35; s.vx = kx; s.vz = kz; }
    return false;
  }

  _pick(s) {
    const B = this.B; let best = null, bd = s.aggro * s.aggro;
    const F = B.fighters;
    for (let i = 0; i < F.length; i++) {
      const f = F[i]; if (f.team === s.team || !f.alive || f.hidden) continue;
      const dx = f.x - s.x, dz = f.z - s.z, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = f; }
    }
    let sb = null, sd = best ? Math.min(bd, 36) : 56;
    this.forEachIn(s.x, s.z, Math.sqrt(sd), (o) => {
      if (o.team === s.team || o.st === ST.DEAD) return;
      const dx = o.x - s.x, dz = o.z - s.z, d2 = dx * dx + dz * dz; if (d2 < sd) { sd = d2; sb = o; }
    });
    let t = sb && (!best || sd < bd * 0.5) ? sb : best;
    if (t && s.sq) { const a = s.sq, lx = t.x - a.x, lz = t.z - a.z, le = a.leash || 24; if (lx * lx + lz * lz > le * le) t = null; }
    s.tgt = t; s.tgen = t && !t.isFighter ? t.gen : 0;
  }

  update(dt) {
    const B = this.B, L = this.list, stage = B.stage, n = this.n;
    let used = 0; for (let i = 0; i < n; i++) if (L[i].tok) used++;
    let tokens = B.diff.tokens - used;
    const cdMul = B.diff.cd;
    for (let i = 0; i < n; i++) {
      const s = L[i];
      if (s.flash > 0) s.flash -= dt * 5;
      if (s.st !== ST.DEAD) {
        if (s.burn > 0) { s.burn -= dt; s.burnT -= dt; if (s.burnT <= 0) { s.burnT = 0.5; FX.spark(s.x, s.y + 1.1, s.z, 4.5, 1.6, 0.3, 3, 1.5); this.damage(s, s.burnDmg, 0, 0, 0, s.burnSrc, true); } }
        if (s.slow > 0) s.slow -= dt;
      }
      let moved = false;
      switch (s.st) {
        case ST.FREE: {
          if (s.stun > 0) { s.stun -= dt; s.mv = 0; s.pitch = Math.sin(B.time * 9 + i) * 0.12; break; }
          s.pitch = 0;
          s.think -= dt;
          if (s.think <= 0) { s.think = 0.3 + rnd(0.35); this._pick(s); }
          const t = s.tgt; let tx, tz, range = 0, has = false;
          if (t && t.alive && (t.isFighter ? !t.hidden : t.gen === s.tgen)) { tx = t.x; tz = t.z; range = s.reach + t.rad; has = true; }
          else { s.tgt = null; const a = s.sq; if (a) { tx = a.x + s.ox; tz = a.z + s.oz; } else { tx = s.x; tz = s.z; } }
          const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
          let sp = 0;
          if (has) {
            const ty = Math.atan2(dx, dz);
            if (d > range) { sp = s.spd; s.yaw = angDamp(s.yaw, ty, 8, dt); }
            else {
              s.yaw = angDamp(s.yaw, ty, 10, dt); s.cd -= dt;
              if (s.cd <= 0) {
                if (t === B.player) { if (tokens > 0) { tokens--; s.tok = true; s.st = ST.ATK; s.t = 0; s.hitDone = false; } else s.cd = 0.3 + rnd(0.7); }
                else { s.st = ST.ATK; s.t = 0; s.hitDone = false; }
              }
            }
          } else if (d > 1.0) { sp = s.spd * (d > 14 ? 1.3 : 0.75); s.yaw = angDamp(s.yaw, Math.atan2(dx, dz), 7, dt); }
          if (s.slow > 0) sp *= 0.4;
          s.mv = sp;
          if (sp > 0) { s.x += Math.sin(s.yaw) * sp * dt; s.z += Math.cos(s.yaw) * sp * dt; s.ph += dt * sp * 2.7; moved = true; }
          break;
        }
        case ST.ATK: {
          s.t += dt * (s.slow > 0 ? 0.5 : 1); s.mv = 0;
          const wind = s.cap ? 0.6 : 0.5;
          if (s.t < wind) s.arm = -2.7 * Math.min(1, s.t / (wind * 0.7));
          else if (s.t < wind + 0.14) {
            s.arm = -2.7 + 2.5 * ((s.t - wind) / 0.14);
            if (!s.hitDone && s.shot) { s.hitDone = true; this._shoot(s); }
            if (!s.hitDone) {
              s.hitDone = true;
              const t = s.tgt;
              if (t && t.alive && (t.isFighter || t.gen === s.tgen)) {
                const dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz) || 1;
                if (d < s.reach + t.rad + 0.7) {
                  const kx = dx / d, kz = dz / d, dm = s.dmg * B.soldierMul(s.team);
                  if (t.isFighter) t.takeHit(dm, kx * 2.5, kz * 2.5, 0, s, s.cap ? 1 : 0);
                  else { this.damage(t, dm * (t.cap ? 0.25 : 0.8), kx * 2.5, kz * 2.5, 0, s); if (B.nearCam(s.x, s.z, 30)) FX.spark(t.x, 1.1, t.z, 2.5, 2.2, 1.6, 3, 2.5); }
                }
              }
            }
          } else if (s.t < wind + 0.5) s.arm = -0.2 * (1 - (s.t - wind - 0.14) / 0.36);
          else { s.st = ST.FREE; s.arm = 0; s.tok = false; s.cd = (1.3 + rnd(1.8)) * cdMul; }
          break;
        }
        case ST.HIT: {
          s.t -= dt; s.x += s.vx * dt; s.z += s.vz * dt; const k = Math.exp(-7 * dt); s.vx *= k; s.vz *= k; moved = true;
          s.pitch = -0.4 * clamp(s.t / 0.35, 0, 1); s.mv = 0; s.arm = 0;
          if (s.t <= 0) { s.st = ST.FREE; s.pitch = 0; }
          break;
        }
        case ST.AIR: case ST.DEAD: {
          if (!s.landed) {
            s.vy -= 26 * dt; s.y += s.vy * dt; s.x += s.vx * dt; s.z += s.vz * dt; s.pitch += s.spin * dt; moved = true;
            if (s.y <= 0 && s.vy < 0) {
              s.y = 0; s.landed = true; s.t = 0;
              s.pitch = Math.sin(s.pitch) > 0 ? HALF_PI : -HALF_PI;
              if (B.nearCam(s.x, s.z, 40)) FX.dust(s.x, s.z, 2);
              if (s.st === ST.AIR) { s.st = ST.DOWN; s.t = 0.7 + rnd(0.6); }
            }
          } else {
            s.t += dt; s.yo = -0.68 * Math.min(1, s.t / 0.08) - Math.max(0, s.t - 0.8) * 1.6;
            const k = Math.exp(-6 * dt); s.x += s.vx * dt * 0.3; s.z += s.vz * dt * 0.3; s.vx *= k; s.vz *= k;
            if (s.t > 1.35) s.rm = true;
          }
          break;
        }
        case ST.DOWN: {
          s.t -= dt; s.yo = Math.max(-0.68, s.yo - dt * 9); s.mv = 0;
          const k = Math.exp(-6 * dt); s.x += s.vx * dt; s.z += s.vz * dt; s.vx *= k; s.vz *= k; moved = true;
          if (s.t <= 0) { s.st = ST.GETUP; s.t = 0.42; }
          break;
        }
        case ST.GETUP: {
          s.t -= dt; const u = clamp(s.t / 0.42, 0, 1);
          s.pitch = (s.pitch > 0 ? 1 : -1) * HALF_PI * u; s.yo = -0.68 * u;
          if (s.t <= 0) { s.st = ST.FREE; s.pitch = 0; s.yo = 0; s.cd = Math.max(s.cd, 0.6); }
          break;
        }
      }
      if (moved && s.st !== ST.DEAD) {
        // 密集回避
        if (s.st !== ST.AIR) {
          const g = this.gn, c = this.cell, gx = this.gx;
          const cx = clamp(((s.x + gx) / c) | 0, 1, g - 2), cz = clamp(((s.z + gx) / c) | 0, 1, g - 2);
          for (let zz = cz - 1; zz <= cz + 1; zz++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
            let j = this.head[zz * g + xx];
            while (j >= 0) {
              const o = L[j]; j = this.next[j];
              if (o === s || o.st === ST.AIR || o.st === ST.DEAD) continue;
              const dx = s.x - o.x, dz = s.z - o.z, d2 = dx * dx + dz * dz, mn = s.rad + o.rad + 0.18;
              if (d2 < mn * mn && d2 > 1e-5) { const d = Math.sqrt(d2), p = (mn - d) / d * 0.35; s.x += dx * p; s.z += dz * p; }
            }
          }
          const F = B.fighters;
          for (let j = 0; j < F.length; j++) {
            const f = F[j]; if (!f.alive || f.ghost) continue;
            const dx = s.x - f.x, dz = s.z - f.z, d2 = dx * dx + dz * dz, mn = s.rad + f.rad + 0.12;
            if (d2 < mn * mn && d2 > 1e-5) { const d = Math.sqrt(d2), p = (mn - d) / d; s.x += dx * p; s.z += dz * p; }
          }
        }
        if (stage.constrain(s, 0.4) && s.st === ST.AIR) { s.vx *= -0.3; s.vz *= -0.3; }
      } else if (moved) stage.constrain(s, 0.4);
    }
    this._shots(dt);
    // 除去(末尾と入れ替え)
    for (let i = this.n - 1; i >= 0; i--) if (L[i].rm) { const last = L[this.n - 1]; L[this.n - 1] = L[i]; L[i] = last; this.n--; }
    this._write();
  }

  // 雑兵の飛び道具: 狙った相手の方へ真っすぐ飛び、最初に当たった敵(武将・雑兵)で止まる
  _shoot(s) {
    const B = this.B, t = s.tgt; if (!t || !t.alive) return;
    const yaw = Math.atan2(t.x - s.x, t.z - s.z) + rnd(-0.06, 0.06), sp = s.shot === 'arrow' ? 26 : 16;
    const o = { s, team: s.team, x: s.x + Math.sin(yaw) * 0.6, z: s.z + Math.cos(yaw) * 0.6, vx: Math.sin(yaw) * sp, vz: Math.cos(yaw) * sp, life: s.reach / sp + 0.25, kind: s.shot, fxi: null, dmg: s.dmg * B.soldierMul(s.team) * (s.shot === 'fire' ? 1.2 : 1) };
    if (B.nearCam(o.x, o.z, 45)) {
      if (o.kind === 'arrow') o.fxi = FX.arrow(o.x, 1.3, o.z, yaw, 0.85, 99);
      else { const c = s.team === 1 ? [3.2, 1.0, 0.3] : [0.6, 1.4, 3.2]; o.fxi = FX.shell(o.x, 1.2, o.z, c, 0.35, 0.35, 99, 1.6); }
    }
    (this.shots || (this.shots = [])).push(o);
  }
  _shots(dt) {
    const S = this.shots; if (!S || !S.length) return;
    const B = this.B;
    for (let i = S.length - 1; i >= 0; i--) {
      const o = S[i]; o.life -= dt; o.x += o.vx * dt; o.z += o.vz * dt;
      if (o.fxi && !o.fxi.dead) { o.fxi.mesh.position.x = o.x; o.fxi.mesh.position.z = o.z; }
      let hit = null;
      for (const f of B.fighters) { if (f.team === o.team || !f.alive || f.ghost) continue; const dx = f.x - o.x, dz = f.z - o.z, r = f.rad + 0.35; if (dx * dx + dz * dz < r * r) { hit = f; break; } }
      if (!hit) this.forEachIn(o.x, o.z, 1, (t) => { if (!hit && t.team !== o.team && t.st !== ST.DEAD) { const dx = t.x - o.x, dz = t.z - o.z, r = t.rad + 0.3; if (dx * dx + dz * dz < r * r) hit = t; } });
      if (hit) {
        const l = Math.hypot(o.vx, o.vz) || 1, kx = o.vx / l, kz = o.vz / l;
        if (hit.isFighter) hit.takeHit(o.dmg, kx * 2, kz * 2, 0, o.s, 0);
        else this.damage(hit, o.dmg * 0.8, kx * 2, kz * 2, 0, o.s);
        if (B.nearCam(o.x, o.z, 35)) FX.spark(o.x, 1.1, o.z, 2.5, 2.0, 1.4, 4, 3);
        o.life = 0;
      }
      if (o.life <= 0 || B.stage.sdf(o.x, o.z) > 0.8) { FX.kill(o.fxi); S[i] = S[S.length - 1]; S.pop(); }
    }
  }

  _write() {
    if (this.vat) return this._writeVat();
    const L = this.list, n = this.n, B = this.B;
    const aT = this.mTorso.instanceMatrix.array, aH = this.mHead.instanceMatrix.array, aL = this.mArmL.instanceMatrix.array, aS = this.mSword.instanceMatrix.array, aP = this.mSpear.instanceMatrix.array, aLL = this.mLegL.instanceMatrix.array, aLR = this.mLegR.instanceMatrix.array;
    const cT = this.mTorso.instanceColor.array, cH = this.mHead.instanceColor.array, cL = this.mArmL.instanceColor.array, cS = this.mSword.instanceColor.array, cP = this.mSpear.instanceColor.array, cLL = this.mLegL.instanceColor.array, cLR = this.mLegR.instanceColor.array;
    const bl = this.blob ? this.blob.instanceMatrix.array : null;
    let ns = 0, np = 0, nb = 0;
    let Xx, Xy, Xz, Yx, Yy, Yz, Zx, Zy, Zz, tx, ty, tz;
    const part = (arr, o, px, py, pz, a) => {
      const ca = Math.cos(a), sa = Math.sin(a);
      arr[o] = Xx; arr[o + 1] = Xy; arr[o + 2] = Xz; arr[o + 3] = 0;
      arr[o + 4] = Yx * ca + Zx * sa; arr[o + 5] = Yy * ca + Zy * sa; arr[o + 6] = Yz * ca + Zz * sa; arr[o + 7] = 0;
      arr[o + 8] = Zx * ca - Yx * sa; arr[o + 9] = Zy * ca - Yy * sa; arr[o + 10] = Zz * ca - Yz * sa; arr[o + 11] = 0;
      arr[o + 12] = tx + Xx * px + Yx * py + Zx * pz; arr[o + 13] = ty + Xy * px + Yy * py + Zy * pz; arr[o + 14] = tz + Xz * px + Yz * py + Zz * pz; arr[o + 15] = 1;
    };
    const time = B.time;
    for (let i = 0; i < n; i++) {
      const s = L[i], sc = s.scale, cy = Math.cos(s.yaw), sy = Math.sin(s.yaw), cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
      Xx = cy * sc; Xy = 0; Xz = -sy * sc;
      Yx = sy * sp * sc; Yy = cp * sc; Yz = cy * sp * sc;
      Zx = sy * cp * sc; Zy = -sp * sc; Zz = cy * cp * sc;
      tx = s.x; ty = s.y + s.yo; tz = s.z;
      const st = s.st, tumble = st >= ST.AIR;
      if (tumble) { ty += 0.9 * sc; tx -= Yx * 0.9; ty -= Yy * 0.9; tz -= Yz * 0.9; }
      let lg = 0, al = 0, ar = -0.3 + s.arm;
      if (tumble) { lg = 0.5; al = -2.3; ar = -2.0; }
      else if (st === ST.HIT) { al = -1.3; ar = -1.1; lg = 0.2; }
      else if (s.mv > 0.1) { const sw = Math.sin(s.ph) * 0.75 * Math.min(1, s.mv / 4); lg = sw; al = -sw * 0.7; ar += sw * 0.2; }
      else { al = Math.sin(time * 1.6 + i) * 0.06; }
      const o = i * 16;
      part(aT, o, 0, 0, 0, 0); part(aH, o, 0, 1.4, 0, 0); part(aL, o, 0.27, 1.32, 0, al);
      part(aLL, o, 0.1, 0.8, 0, lg); part(aLR, o, -0.1, 0.8, 0, -lg);
      // 色
      const tc = s.cap ? CAPT[s.team] : TINT[s.team];
      let r = tc[0], g = tc[1], b = tc[2];
      if (s.slow > 0) { r = r * 0.4 + 0.25; g = g * 0.4 + 0.5; b = b * 0.4 + 0.9; }
      if (s.burn > 0) { const k = 0.5 + 0.5 * Math.sin(time * 14 + i); r += 0.7 * k; g += 0.18 * k; }
      if (s.flash > 0) { const f = s.flash * 1.3; r += f; g += f; b += f; }
      const c3 = i * 3;
      cT[c3] = cH[c3] = cL[c3] = cLL[c3] = cLR[c3] = r; cT[c3 + 1] = cH[c3 + 1] = cL[c3 + 1] = cLL[c3 + 1] = cLR[c3 + 1] = g; cT[c3 + 2] = cH[c3 + 2] = cL[c3 + 2] = cLL[c3 + 2] = cLR[c3 + 2] = b;
      if (s.type === 1) { part(aP, np * 16, -0.27, 1.32, 0, ar); cP[np * 3] = r; cP[np * 3 + 1] = g; cP[np * 3 + 2] = b; np++; }
      else { part(aS, ns * 16, -0.27, 1.32, 0, ar); cS[ns * 3] = r; cS[ns * 3 + 1] = g; cS[ns * 3 + 2] = b; ns++; }
      if (bl && s.yo > -0.9) { const k = nb * 16, bs = sc * Math.max(0.4, 1 - s.y * 0.12); bl[k] = bs; bl[k + 1] = 0; bl[k + 2] = 0; bl[k + 3] = 0; bl[k + 4] = 0; bl[k + 5] = 1; bl[k + 6] = 0; bl[k + 7] = 0; bl[k + 8] = 0; bl[k + 9] = 0; bl[k + 10] = bs; bl[k + 11] = 0; bl[k + 12] = s.x; bl[k + 13] = 0.04; bl[k + 14] = s.z; bl[k + 15] = 1; nb++; }
    }
    if (bl) {
      for (const f of B.fighters) { if (!f.alive || f.hidden) continue; const k = nb * 16, bs = f.rad * 2.4; bl[k] = bs; bl[k + 1] = 0; bl[k + 2] = 0; bl[k + 3] = 0; bl[k + 4] = 0; bl[k + 5] = 1; bl[k + 6] = 0; bl[k + 7] = 0; bl[k + 8] = 0; bl[k + 9] = 0; bl[k + 10] = bs; bl[k + 11] = 0; bl[k + 12] = f.x; bl[k + 13] = 0.045; bl[k + 14] = f.z; bl[k + 15] = 1; nb++; }
      this.blob.count = nb; this.blob.instanceMatrix.needsUpdate = true;
    }
    for (const m of [this.mTorso, this.mHead, this.mArmL, this.mLegL, this.mLegR]) { m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    this.mSword.count = ns; this.mSword.instanceMatrix.needsUpdate = true; this.mSword.instanceColor.needsUpdate = true;
    this.mSpear.count = np; this.mSpear.instanceMatrix.needsUpdate = true; this.mSpear.instanceColor.needsUpdate = true;
  }

  // 動き付きキャラ版の書き込み
  // 動き付きキャラ版の書き込み(味方=忍者 / 敵=兵士 の2メッシュに振り分け)
  _writeVat() {
    const L = this.list, n = this.n, B = this.B, time = B.time;
    const meshes = [this.vat, this.vat2 || this.vat];
    const bl = this.blob ? this.blob.instanceMatrix.array : null;
    const cnt = [0, 0];
    let nb = 0;
    for (let i = 0; i < n; i++) {
      const s = L[i], st = s.st, sc = s.scale;
      const mi = s.team === 1 && this.vat2 ? 1 : 0, m = meshes[mi], j = cnt[mi]++;
      const M = m.instanceMatrix.array, C = m.instanceColor.array, A = m.userData.anim.array, clips = m.userData.clips;
      let clip = 'idle', u = time * 0.24 + i * 0.37, pitch = 0, yo = 0, tumble = false;
      const wpn = (SJOB[s.type] || SJOB[0]).w;
      if (st === ST.FREE) {
        if (s.stun > 0) { clip = 'hit'; u = 0.45; }
        else if (s.mv > 0.1) { clip = 'walk'; u = s.ph / 6.2832; }
      } else if (st === ST.ATK) {
        const wind = s.cap ? 0.6 : 0.5; clip = 'atk';
        u = s.t < wind ? (s.t / wind) * 0.6 : 0.6 + Math.min(1, (s.t - wind) / 0.5) * 0.4;
      } else if (st === ST.HIT) { clip = 'hit'; u = 1 - Math.max(0, s.t) / 0.35; }
      else if (st === ST.AIR || (st === ST.DEAD && !s.landed)) { clip = 'hit'; u = 0.5; pitch = s.pitch; tumble = true; }
      else if (st === ST.DOWN) { clip = 'die'; u = 1; }
      else if (st === ST.DEAD) { clip = 'die'; u = 1; yo = Math.min(0, s.yo + 0.68); }
      else if (st === ST.GETUP) { clip = 'die'; u = Math.max(0, s.t) / 0.42; }
      setAnim(A, j * 4, clips, clip, u, wpn);
      const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const Xx = cy * sc, Xz = -sy * sc, Yx = sy * sp * sc, Yy = cp * sc, Yz = cy * sp * sc, Zx = sy * cp * sc, Zy = -sp * sc, Zz = cy * cp * sc;
      let tx = s.x, ty = s.y + yo, tz = s.z;
      if (tumble) { ty += 0.9 * sc; tx -= Yx * 0.9; ty -= Yy * 0.9; tz -= Yz * 0.9; }
      const o = j * 16;
      M[o] = Xx; M[o + 1] = 0; M[o + 2] = Xz; M[o + 3] = 0; M[o + 4] = Yx; M[o + 5] = Yy; M[o + 6] = Yz; M[o + 7] = 0;
      M[o + 8] = Zx; M[o + 9] = Zy; M[o + 10] = Zz; M[o + 11] = 0; M[o + 12] = tx; M[o + 13] = ty; M[o + 14] = tz; M[o + 15] = 1;
      const tc = s.cap ? CAPT[s.team] : TINT[s.team];
      let r = tc[0], g = tc[1], b = tc[2];
      if (s.slow > 0) { r = r * 0.4 + 0.25; g = g * 0.4 + 0.5; b = b * 0.4 + 0.9; }
      if (s.burn > 0) { const k = 0.5 + 0.5 * Math.sin(time * 14 + i); r += 0.7 * k; g += 0.18 * k; }
      if (s.flash > 0) { const f = s.flash * 1.3; r += f; g += f; b += f; }
      C[j * 3] = r; C[j * 3 + 1] = g; C[j * 3 + 2] = b;
      if (bl && s.yo > -0.9) { const k = nb * 16, bs = sc * Math.max(0.4, 1 - s.y * 0.12); bl[k] = bs; bl[k + 1] = 0; bl[k + 2] = 0; bl[k + 3] = 0; bl[k + 4] = 0; bl[k + 5] = 1; bl[k + 6] = 0; bl[k + 7] = 0; bl[k + 8] = 0; bl[k + 9] = 0; bl[k + 10] = bs; bl[k + 11] = 0; bl[k + 12] = s.x; bl[k + 13] = 0.04; bl[k + 14] = s.z; bl[k + 15] = 1; nb++; }
    }
    if (bl) {
      for (const f of B.fighters) { if (!f.alive || f.hidden) continue; const k = nb * 16, bs = f.rad * 2.4; bl[k] = bs; bl[k + 1] = 0; bl[k + 2] = 0; bl[k + 3] = 0; bl[k + 4] = 0; bl[k + 5] = 1; bl[k + 6] = 0; bl[k + 7] = 0; bl[k + 8] = 0; bl[k + 9] = 0; bl[k + 10] = bs; bl[k + 11] = 0; bl[k + 12] = f.x; bl[k + 13] = 0.045; bl[k + 14] = f.z; bl[k + 15] = 1; nb++; }
      this.blob.count = nb; this.blob.instanceMatrix.needsUpdate = true;
    }
    meshes[0].count = cnt[0]; if (this.vat2) meshes[1].count = cnt[1];
    for (const m of this.vat2 ? meshes : [meshes[0]]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.userData.anim.needsUpdate = true; }
  }

  dispose() {
    if (this.vat) { this.vat.userData.vat.dispose(); this.vat.customDepthMaterial.dispose(); }
    if (this.vat2) { this.vat2.userData.vat.dispose(); this.vat2.customDepthMaterial.dispose(); }
    for (const m of this.meshes) { GFX.scene.remove(m); m.geometry.dispose(); m.dispose(); }
    this.mat.dispose();
    if (this.blob) { GFX.scene.remove(this.blob); this.blob.geometry.dispose(); this.blob.material.dispose(); this.blobTex.dispose(); this.blob.dispose(); }
  }
}
