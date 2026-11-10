// 雑兵システム: 数百体をインスタンス描画し、簡易AI・物理・やられ演出を一括処理する
import * as THREE from 'three';
import { GFX, patchMat } from './gfx.js';
import { soldierGeos } from './models.js';
import { clamp, rnd, angDamp } from './util.js';
import { FX } from './fx.js';

export const ST = { FREE: 0, ATK: 1, HIT: 2, AIR: 3, DOWN: 4, GETUP: 5, DEAD: 6 };
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
    this.mTorso = mk(G.torso); this.mHead = mk(G.head); this.mArmL = mk(G.armL); this.mSword = mk(G.armSword); this.mSpear = mk(G.armSpear); this.mLegL = mk(G.leg); this.mLegR = mk(G.leg);
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
    s.gen = this.gen++; s.team = team; s.type = type; s.x = x; s.z = z; s.y = 0; s.yo = 0; s.vx = s.vz = s.vy = 0; s.yaw = o.yaw ?? rnd(6.28);
    s.cap = !!o.captain; s.scale = s.cap ? 1.34 : 0.93 + rnd(0.15);
    s.maxHp = s.hp = o.hp || 40; s.dmg = o.dmg || 10; s.spd = (s.cap ? 3.5 : 3.8) + rnd(0.9); s.reach = (type === 1 ? 2.3 : 1.6) * (s.cap ? 1.2 : 1);
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
    // 除去(末尾と入れ替え)
    for (let i = this.n - 1; i >= 0; i--) if (L[i].rm) { const last = L[this.n - 1]; L[this.n - 1] = L[i]; L[i] = last; this.n--; }
    this._write();
  }

  _write() {
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

  dispose() {
    for (const m of this.meshes) { GFX.scene.remove(m); m.geometry.dispose(); m.dispose(); }
    this.mat.dispose();
    if (this.blob) { GFX.scene.remove(this.blob); this.blob.geometry.dispose(); this.blob.material.dispose(); this.blobTex.dispose(); this.blob.dispose(); }
  }
}
