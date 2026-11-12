// 手続き型アニメーション: 武器の軌道(方位az/仰角el)から全身のポーズを毎フレーム合成する
import * as THREE from 'three';
import { clamp, damp, ease, D2R, PI } from './util.js';

export const PARAMS = ['az', 'el', 'bend', 'wr', 'azL', 'elL', 'bendL', 'wrL', 'tw', 'lean', 'side', 'crouch', 'stance', 'y', 'spin', 'flip', 'head'];
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _x = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
const _z = new THREE.Vector3(), _ny = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _e = new THREE.Vector3(), _pole = new THREE.Vector3();
const _qc = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const _mat = new THREE.Matrix4();
const FWD = new THREE.Vector3(0, 0, 1);
const wrap180 = (a) => { a = a % 360; if (a > 180) a -= 360; else if (a < -180) a += 360; return a; };

function basisQ(out, X, dir) {
  _ny.copy(dir).negate(); _z.crossVectors(X, _ny);
  _mat.makeBasis(X, _ny, _z); out.setFromRotationMatrix(_mat);
}
function dirOf(az, el, out) { const a = az * D2R, e = el * D2R, ce = Math.cos(e); return out.set(Math.sin(a) * ce, Math.sin(e), Math.cos(a) * ce); }

// 技データのキーを全パラメータ埋めに展開
export function prepMove(m, rest) {
  if (m.dk) return m;
  const dk = []; let prev = rest;
  for (const k of m.keys) {
    const d = { t: k.t, e: k.e || 'io' };
    for (const p of PARAMS) d[p] = k[p] !== undefined ? k[p] : prev[p];
    dk.push(d); prev = d;
  }
  m.dk = dk;
  return m;
}
function evalMove(m, snap, t, out) {
  const K = m.dk, n = K.length;
  let i = 0; while (i < n && K[i].t <= t) i++;
  if (i >= n) { const b = K[n - 1]; for (const k of PARAMS) out[k] = b[k]; return; }
  const a = i === 0 ? snap : K[i - 1], b = K[i], t0 = i === 0 ? 0 : a.t;
  const u = ease[b.e](clamp((t - t0) / Math.max(1e-4, b.t - t0), 0, 1));
  for (const k of PARAMS) out[k] = a[k] + (b[k] - a[k]) * u;
}

export class Rig {
  constructor(model) {
    this.model = model; this.J = model.J; this.root = model.root; this.rest = model.rest;
    this.p = { ...this.rest }; this.tp = { ...this.rest }; this.tp2 = { ...this.rest }; this.snap = { ...this.rest };
    this.move = null; this.mt = 0; this.mode = 'loco'; this.modeT = 0;
    this.speed = 0; this.phase = Math.random() * 6; this.t = Math.random() * 10;
    this.tanR = new THREE.Vector3(0, 0, 1); this.tanL = new THREE.Vector3(0, 0, 1);
    this.legs = { tl: 0, kl: 0, tr: 0, kr: 0 };
    this.whirl = 0; this._ls = 0; this._flash = -1;
    this.wBase = new THREE.Vector3(); this.wTip = new THREE.Vector3(); this.wBaseL = new THREE.Vector3(); this.wTipL = new THREE.Vector3();
    this.update(0.016);
  }
  play(move) {
    prepMove(move, this.rest);
    const p = this.p;
    p.spin = wrap180(p.spin); p.flip = wrap180(p.flip);
    this.move = move; this.mt = 0; Object.assign(this.snap, p);
  }
  stop() {
    this.move = null;
    const p = this.p;
    p.spin = wrap180(p.spin); p.flip = wrap180(p.flip); p.az = wrap180(p.az); p.azL = wrap180(p.azL);
  }
  setMode(m) { if (this.mode !== m) { this.mode = m; this.modeT = 0; } }
  setFlash(r, g, b) {
    const k = r + g * 7 + b * 49;
    if (k === this._flash) return;
    this._flash = k;
    this.model.M.c.emissive.setRGB(r, g, b); this.model.M.m.emissive.setRGB(r, g, b);
    if (this.model.vbody) this.model.vbody.flash(r, g, b);
  }

  update(dt) {
    const J = this.J, p = this.p, tp = this.tp, R = this.rest, two = this.model.two;
    this.t += dt; this.modeT += dt;
    const sp = this.speed, run = clamp(sp / 6.5, 0, 1.25);
    let rate = 14, armRate = 16, useTan = false;
    const mode = this.mode;
    if (this.move) {
      evalMove(this.move, this.snap, this.mt, tp);
      evalMove(this.move, this.snap, this.mt + 0.012, this.tp2);
      rate = 44; armRate = 50; useTan = true;
    } else {
      for (const k of PARAMS) tp[k] = R[k];
      if (mode === 'loco') {
        this.phase += dt * (3.2 + sp * 1.35);
        const s = Math.sin(this.phase), br = Math.sin(this.t * 1.8) * (1 - Math.min(1, run));
        tp.lean = R.lean + run * 13 + br * 0.8; tp.tw = s * 7 * run;
        tp.y = -0.02 * run + Math.abs(Math.cos(this.phase)) * 0.05 * run;
        tp.el = R.el + s * 7 * run + br * 1.5; tp.stance = R.stance * (1 - Math.min(1, run));
        if (!two) { tp.elL = R.elL - s * 30 * run + 8 * run + br; tp.azL = R.azL - 10 * run; tp.bendL = R.bendL + 28 * run; }
        // 立ち止まっている時は武器ごとの「構え」へ(走り出すと元の姿勢に戻る)
        const I = this.model.idle;
        if (I) { const w = 1 - clamp(run * 1.6, 0, 1); for (const k in I) tp[k] += (I[k] + (k === 'el' || k === 'elL' ? br * 1.5 : 0) - tp[k]) * w; }
      } else if (mode === 'hit') { tp.lean = -22; tp.tw = 20; tp.el = -22; tp.az = -72; tp.bend = 80; tp.elL = -22; tp.azL = 72; tp.head = -12; tp.stance = 0.35; rate = 30; armRate = 30; }
      else if (mode === 'air') { tp.flip = -105; tp.el = 12; tp.az = -80; tp.elL = 12; tp.azL = 80; tp.bend = 30; tp.bendL = 30; rate = 9; }
      else if (mode === 'down') { tp.flip = -90; tp.y = 0.14; tp.el = -8; tp.az = -78; tp.elL = -8; tp.azL = 78; tp.bend = 15; tp.bendL = 15; rate = 16; }
      else if (mode === 'getup') { const u = clamp(this.modeT / 0.45, 0, 1); tp.crouch = 0.7 * (1 - u); tp.lean = 30 * (1 - u); rate = 12; }
      else if (mode === 'dodge') { tp.crouch = 0.8; tp.lean = 40; tp.el = -28; tp.az = -142; tp.elL = -28; tp.azL = 142; tp.bend = 20; tp.bendL = 20; tp.stance = 0.9; rate = 32; armRate = 32; }
      else if (mode === 'dead') { tp.flip = -90; tp.y = 0.12; tp.el = -5; tp.az = -85; tp.elL = -5; tp.azL = 85; tp.bend = 10; tp.bendL = 10; rate = 4.5; }
      else if (mode === 'stun') { tp.lean = 14; tp.side = Math.sin(this.t * 5) * 8; tp.el = -78; tp.elL = -78; tp.head = Math.sin(this.t * 4) * 15; rate = 10; }
      else if (mode === 'victory') { tp.el = 76; tp.az = -14; tp.bend = 12; tp.wr = 12; tp.lean = -6; tp.elL = -48; tp.azL = 52; tp.stance = 0.3; rate = 7; }
      else if (mode === 'cast') { tp.el = 58; tp.az = -34; tp.elL = 58; tp.azL = 34; tp.bend = 35; tp.bendL = 35; tp.lean = -10; tp.crouch = 0.12; tp.stance = 0.5; tp.wr = 40; rate = 16; }
      else if (mode === 'pose' && this.customPose) { Object.assign(tp, this.customPose); rate = 20; armRate = 20; }
      else if (mode === 'pose') { tp.el = -30; tp.az = -50; tp.bend = 60; tp.wr = 70; tp.tw = -18; tp.stance = 0.55; tp.elL = -45; tp.azL = 55; rate = 6; }
    }
    const a = 1 - Math.exp(-rate * dt);
    for (const k of PARAMS) p[k] += (tp[k] - p[k]) * a;

    // 体幹
    const body = J.body, flip = p.flip * D2R;
    body.rotation.set(flip, p.spin * D2R, p.side * D2R, 'YXZ');
    if (this.move && Math.abs(flip) > 0.01) {
      // 技中の宙返りは体の中心を軸に回す
      const sf = 0.95 * Math.sin(flip), sy = p.spin * D2R;
      body.position.set(-sf * Math.sin(sy), p.y + 0.95 * (1 - Math.cos(flip)), -sf * Math.cos(sy));
    } else body.position.set(0, p.y, 0);
    const lean = p.lean * D2R, tw = p.tw * D2R, drop = p.crouch * 0.3 + p.stance * 0.06;
    J.hips.position.y = 0.98 - drop;
    J.hips.rotation.set(lean * 0.45, tw * 0.25, 0, 'YXZ');
    J.spine.rotation.set(lean * 0.3, tw * 0.35, 0, 'YXZ');
    J.chest.rotation.set(lean * 0.25, tw * 0.4, 0, 'YXZ');
    J.head.rotation.set(-lean * 0.55, -tw * 0.55 + p.head * D2R, 0, 'YXZ');

    // 脚
    let tl, kl, tr, kr, splay = 0.05;
    const sq = Math.acos(clamp(1 - drop / 0.88, -1, 1));
    if (!this.move && mode === 'loco' && run > 0.05) {
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      tl = -s * 0.95 * run - 0.12 * run; kl = (0.3 + 1.15 * Math.max(0, c)) * run;
      tr = s * 0.95 * run - 0.12 * run; kr = (0.3 + 1.15 * Math.max(0, -c)) * run;
    } else if (!this.move && (mode === 'air' || mode === 'down' || mode === 'dead')) { tl = -0.35; kl = 0.6; tr = 0.1; kr = 0.3; }
    else { const st = p.stance; tl = -0.55 * st - sq; kl = 0.5 * st + sq * 2; tr = 0.5 * st - sq * 0.55; kr = 0.35 * st + sq * 1.35; splay = 0.05 + 0.1 * st; }
    const la = 1 - Math.exp(-(this.move ? 30 : 18) * dt), g = this.legs;
    g.tl += (tl - g.tl) * la; g.kl += (kl - g.kl) * la; g.tr += (tr - g.tr) * la; g.kr += (kr - g.kr) * la;
    J.legL.rotation.set(g.tl, 0, splay); J.shinL.rotation.x = g.kl;
    J.legR.rotation.set(g.tr, 0, -splay); J.shinR.rotation.x = g.kr;

    // 腕(武器の向きから逆算)
    _qc.copy(J.hips.quaternion).multiply(J.spine.quaternion).multiply(J.chest.quaternion);
    _qi.copy(_qc).invert();
    if (useTan) {
      dirOf(this.tp2.az, this.tp2.el, _v1); dirOf(tp.az, tp.el, _v2); _v1.sub(_v2);
      if (_v1.lengthSq() > 4e-7) this.tanR.copy(_v1).normalize();
      dirOf(this.tp2.azL, this.tp2.elL, _v1); dirOf(tp.azL, tp.elL, _v2); _v1.sub(_v2);
      if (_v1.lengthSq() > 4e-7) this.tanL.copy(_v1).normalize();
    } else { this.tanR.copy(this.model.restTan); this.tanL.copy(FWD); }
    this._aim(J.armR, J.foreR, p.az, p.el, p.bend * D2R, this.tanR, armRate, dt);
    J.handR.rotation.x = PI - p.wr * D2R;
    if (two) {
      this.root.updateMatrixWorld(true);
      _v1.copy(this.model.grip); J.handR.localToWorld(_v1); J.chest.worldToLocal(_v1);
      this._ik(J.armL, J.foreL, _v1);
    } else {
      this._aim(J.armL, J.foreL, p.azL, p.elL, p.bendL * D2R, this.tanL, armRate, dt);
      J.handL.rotation.x = PI - p.wrL * D2R;
    }

    // 揺れもの
    const sn = p.spin + p.tw, wv = Math.abs(sn - this._ls) / Math.max(dt, 1e-3); this._ls = sn;
    this.whirl = damp(this.whirl, clamp(wv / 420, 0, 1.3), 8, dt);
    const fl = clamp(run + this.whirl + (mode === 'air' ? 0.5 : 0), 0, 1.6);
    for (const d of this.model.dang) {
      const segs = d.segs;
      for (let i = 0; i < segs.length; i++) {
        const w = Math.sin(this.t * d.freq + i * 0.9 + d.phase) * d.amp * (0.5 + fl);
        segs[i].rotation.x = d.sign * (d.rest[i] + (i === 0 ? fl * d.k : fl * d.k * 0.3) + w);
      }
    }

    // 武器の先端・根元(軌跡用)
    this.root.updateMatrixWorld(true);
    J.handR.localToWorld(this.wBase.copy(this.model.base)); J.handR.localToWorld(this.wTip.copy(this.model.tip));
    if (this.model.dual) { J.handL.localToWorld(this.wBaseL.copy(this.model.base)); J.handL.localToWorld(this.wTipL.copy(this.model.tip)); }
    if (this.model.vbody) this.model.vbody.sync(dt, this);
  }

  _aim(arm, fore, az, el, bend, tan, k, dt) {
    dirOf(az, el, _d).applyQuaternion(_qi);
    _t.copy(tan).applyQuaternion(_qi);
    _t.addScaledVector(_d, -_t.dot(_d));
    if (_t.lengthSq() < 1e-6) { _t.set(0, 0, 1).addScaledVector(_d, -_d.z); if (_t.lengthSq() < 1e-6) _t.set(0, 1, 0); }
    _t.normalize();
    _x.crossVectors(_d, _t).negate();
    const h = bend * 0.5, ch = Math.cos(h), sh = Math.sin(h);
    _u.copy(_d).multiplyScalar(ch).addScaledVector(_t, -sh);
    _f.copy(_d).multiplyScalar(ch).addScaledVector(_t, sh);
    basisQ(_qa, _x, _u); basisQ(_qb, _x, _f);
    _qb.premultiply(_qt.copy(_qa).invert());
    const al = 1 - Math.exp(-k * dt);
    arm.quaternion.slerp(_qa, al); fore.quaternion.slerp(_qb, al);
  }

  // 2ボーンIK(両手持ちの左手を武器の柄へ)
  _ik(arm, fore, T) {
    const l1 = 0.29, l2 = 0.3, S = arm.position;
    _d.copy(T).sub(S);
    const dist = clamp(_d.length(), 0.1, l1 + l2 - 0.004);
    _d.normalize();
    const A = Math.acos(clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1));
    _pole.set(0.45, -0.75, -0.5);
    _x.crossVectors(_d, _pole); if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0); _x.normalize();
    _t.crossVectors(_x, _d);
    _u.copy(_d).multiplyScalar(Math.cos(A)).addScaledVector(_t, Math.sin(A)).normalize();
    _e.copy(S).addScaledVector(_u, l1);
    _f.copy(S).addScaledVector(_d, dist).sub(_e).normalize();
    basisQ(_qa, _x, _u); basisQ(_qb, _x, _f);
    _qb.premultiply(_qt.copy(_qa).invert());
    arm.quaternion.copy(_qa); fore.quaternion.copy(_qb);
  }
}
