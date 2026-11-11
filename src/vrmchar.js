// VRoid(VRM)キャラクター: 読み込みと、手続き型リグの動きをVRMの骨へ写す(リターゲット)
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '../vendor/three-vrm.module.min.js';
import { VRM_FILES } from './config.js';
import { HEROES } from './data.js';

// ?vrmtest を付けて開くと、全武将を開発用サンプル(dev/sample.vrm)で表示
const TEST = new URLSearchParams(location.search).has('vrmtest');
const fileFor = (id) => (TEST ? 'dev/sample.vrm' : (VRM_FILES[id] || (avail[id] ? 'vrm/' + id + '.vrm' : null)));
const bufs = new Map();

// VRMを置けるキャラの一覧(vrm/<キー>.vrm を置くだけで差し替わる)
export const VRM_KEYS = [...HEROES.filter((h) => !h.vrm).map((h) => h.id), 'enemyOfficer', 'boss1', 'boss2', 'boss3', 'boss4', 'boss5'];
const avail = {};
const HERO_VRM = Object.fromEntries(HEROES.filter((h) => h.vrm).map((h) => [h.id, h.vrm]));
let _probe = null;
export function probeVrm() {
  if (!_probe) _probe = Promise.all(VRM_KEYS.map((id) => VRM_FILES[id] ? (avail[id] = true)
    : fetch('vrm/' + id + '.vrm', { method: 'HEAD' }).then((r) => { avail[id] = r.ok; }).catch(() => { avail[id] = false; })));
  return _probe;
}

export const hasVrm = (id) => !!(id && fileFor(HERO_VRM[id] || id));
function fetchBuf(id) {
  const f = fileFor(id);
  if (!f) return Promise.resolve(null);
  if (!bufs.has(f)) bufs.set(f, fetch(f).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
  return bufs.get(f);
}
// 合戦前などに先読み
export const preloadVrm = (ids) => probeVrm().then(() => Promise.all(ids.map((i) => HERO_VRM[i] || i).filter(hasVrm).map(fetchBuf)));

export async function loadVrm(id) {
  if (HERO_VRM[id]) id = HERO_VRM[id];
  await probeVrm();
  const buf = await fetchBuf(id);
  if (!buf) return null;
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(buf.slice(0), '');
  const vrm = gltf.userData.vrm;
  if (!vrm) return null;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
  if (vrm.meta && vrm.meta.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return vrm;
}

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _f = new THREE.Vector3(), _g = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _m = new THREE.Matrix4();
const _hq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion();
const CL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);   // 左腕: +X → 下向き
const CR = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);    // 右腕: -X → 下向き
const ID = new THREE.Quaternion();

// [VRMの骨, 親の骨(候補を順に), 元リグの関節, 補正]
const MAP = [
  ['hips', [], 'hips', ID],
  ['spine', ['hips'], 'spine', ID],
  ['chest', ['spine'], 'chest', ID],
  ['upperChest', ['chest'], 'chest', ID],
  ['neck', ['upperChest', 'chest'], 'chest', ID],
  ['head', ['neck', 'upperChest', 'chest'], 'head', ID],
  ['leftShoulder', ['upperChest', 'chest'], 'chest', ID],
  ['leftUpperArm', ['leftShoulder', 'upperChest', 'chest'], 'armL', CL],
  ['leftLowerArm', ['leftUpperArm'], 'foreL', CL],
  ['leftHand', ['leftLowerArm'], 'foreL', CL],
  ['rightShoulder', ['upperChest', 'chest'], 'chest', ID],
  ['rightUpperArm', ['rightShoulder', 'upperChest', 'chest'], 'armR', CR],
  ['rightLowerArm', ['rightUpperArm'], 'foreR', CR],
  ['rightHand', ['rightLowerArm'], 'foreR', CR],
  ['leftUpperLeg', ['hips'], 'legL', ID],
  ['leftLowerLeg', ['leftUpperLeg'], 'shinL', ID],
  ['leftFoot', ['leftLowerLeg'], 'shinL', ID],
  ['rightUpperLeg', ['hips'], 'legR', ID],
  ['rightLowerLeg', ['rightUpperLeg'], 'shinR', ID],
  ['rightFoot', ['rightLowerLeg'], 'shinR', ID],
];
// 元リグの関節 → 親関節
const PARENT = { hips: 'body', spine: 'hips', chest: 'spine', head: 'chest', armL: 'chest', foreL: 'armL', handL: 'foreL', armR: 'chest', foreR: 'armR', handR: 'foreR', legL: 'hips', shinL: 'legL', legR: 'hips', shinR: 'legR' };
const ORDER = ['hips', 'spine', 'chest', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'legL', 'shinL', 'legR', 'shinR'];

export class VrmBody {
  constructor(model, vrm) {
    this.model = model; this.vrm = vrm;
    const J = model.J, h = vrm.humanoid;
    // 手作りの体は隠し、武器だけ残す
    for (const k of ORDER) for (const c of J[k].children) if (c.isMesh) c.visible = false;
    for (const k of Object.keys(J)) if (!ORDER.includes(k) && k !== 'root' && k !== 'body') J[k].traverse((o) => { if (o.isMesh) o.visible = false; });
    this.wR = new THREE.Group(); this.wL = new THREE.Group();
    for (const m of model.wMeshes.R) { m.visible = true; this.wR.add(m); }
    for (const m of model.wMeshes.L) { m.visible = true; this.wL.add(m); }
    model.root.add(this.wR, this.wL);
    // 大きさ: 腰の高さを元リグ(0.98)に合わせる
    vrm.scene.updateMatrixWorld(true);
    this.N = {};
    for (const [b] of MAP) this.N[b] = h.getNormalizedBoneNode(b);
    const hipH = this.N.hips.getWorldPosition(_p).y || 1;
    this.k = 0.98 / hipH;
    vrm.scene.scale.setScalar(this.k);
    model.root.add(vrm.scene);
    this.hipRest = this.N.hips.position.clone();
    this.Q = {}; for (const k of ORDER) this.Q[k] = new THREE.Quaternion();
    this.D = {};
    // 発光(被弾など)用に元の色を控える
    this.mats = [];
    vrm.scene.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.emissive && !this.mats.some((x) => x.m === m)) this.mats.push({ m, c: m.emissive.clone() }); });
    this._fl = -1;
    this._fist();
    if (model.armor) this._armor(model.armor, model.pal || {});
    model.vbody = this;
  }

  sync(dt, rig) {
    const J = this.model.J, Q = this.Q, N = this.N;
    // 元リグの各関節の向き(root基準)
    for (const k of ORDER) { const p = PARENT[k]; Q[k].copy(p === 'body' ? J.body.quaternion : Q[p]).multiply(J[k].quaternion); }
    // VRMの骨へ: 親から順に local = 親^-1 * 目標
    const D = this.D;
    for (const [b, parents, j, c] of MAP) {
      const node = N[b]; if (!node) continue;
      const want = (D[b] || (D[b] = new THREE.Quaternion())).copy(Q[j]).multiply(c);
      let par = null; for (const pb of parents) if (N[pb]) { par = D[pb]; break; }
      if (par) node.quaternion.copy(_q.copy(par).invert().multiply(want)); else node.quaternion.copy(want);
    }
    // 腰の位置(跳躍・しゃがみ・宙返り)
    _p.copy(J.hips.position).applyQuaternion(J.body.quaternion).add(J.body.position);
    N.hips.position.copy(this.hipRest).addScaledVector(_p.sub(_v.set(0, 0.98, 0)), 1 / this.k);
    // 手首: 握った拳の穴(柄の通り道)が武器の向きにそろうよう、手の向きを決める
    const root = this.model.root;
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(_rq);
    this._grip('rightHand', 'rightLowerArm', Q.handR, false);
    if (this.model.dual || this.model.two) this._grip('leftHand', 'leftLowerArm', this.model.dual ? Q.handL : Q.handR, true);
    this.vrm.update(dt);
    // 武器: 向きは元リグの手、位置はVRMの拳の中
    root.updateMatrixWorld(true);
    this._place(this.wR, 'rightHand', J.handR, Q.handR, rig, false);
    if (this.model.dual) this._place(this.wL, 'leftHand', J.handL, Q.handL, rig, true);
  }
  _grip(bone, lower, q, left) {
    const hand = this.N[bone], arm = this.vrm.humanoid.getNormalizedBoneNode(lower);
    if (!hand || !arm) return;
    hand.getWorldPosition(_w); arm.getWorldPosition(_v);
    const f = _f.copy(_w).sub(_v).normalize();                  // 前腕の向き
    const g = _g.set(0, 1, 0).applyQuaternion(q).applyQuaternion(_rq).normalize();   // 武器の柄の向き
    const d = f.dot(g); if (Math.abs(d) > 0.96) return;
    f.addScaledVector(g, -d).normalize();                       // 指の向き(柄と直交)
    const xw = left ? f : _x.copy(f).negate();                  // 手のローカルX(右手は指が -X)
    const yw = _y.crossVectors(g, xw).normalize();
    _m.makeBasis(xw, yw, g);
    _hq.setFromRotationMatrix(_m);
    hand.parent.getWorldQuaternion(_pq);
    hand.quaternion.copy(_pq.invert().multiply(_hq));
  }
  _place(g, bone, procHand, q, rig, left) {
    const root = this.model.root, node = this.N[bone];
    if (!node) return;
    // 拳の中心 = 手首から指の付け根の方へ少し進んだ所
    const mid = this.vrm.humanoid.getNormalizedBoneNode(left ? 'leftMiddleProximal' : 'rightMiddleProximal');
    node.getWorldPosition(_w);
    if (mid) { mid.getWorldPosition(_v); _w.lerp(_v, 0.62); node.getWorldQuaternion(_hq); _w.addScaledVector(_y.set(0, -1, 0).applyQuaternion(_hq), 0.018 * this.k * this.model.root.scale.x); }
    procHand.getWorldPosition(_v);          // 元リグの手(ワールド)
    _v.sub(_w).negate();                    // ずれ(剣の軌跡を合わせる)
    if (left) { rig.wBaseL.add(_v); rig.wTipL.add(_v); } else { rig.wBase.add(_v); rig.wTip.add(_v); }
    g.position.copy(root.worldToLocal(_w.clone()));
    g.quaternion.copy(q);
  }
  // 鎧(肩当て・籠手・腰帯・すね当て)をVRMの骨に取り付ける。kind: 'heavy' / 'light'
  _armor(kind, pal) {
    const h = this.vrm.humanoid, raw = (n) => h.getRawBoneNode(n), nb = (n) => h.getNormalizedBoneNode(n);
    const root = this.model.root; root.updateMatrixWorld(true);
    // 位置はキャラ基準(model.root のローカル座標)で考える
    const P = (n) => { const o = nb(n); return o ? root.worldToLocal(o.getWorldPosition(new THREE.Vector3())) : null; };
    const metal = new THREE.MeshStandardMaterial({ color: pal.metal || '#7a8090', roughness: 0.38, metalness: 0.55 });
    const gold = new THREE.MeshStandardMaterial({ color: pal.gold || '#d8a84a', roughness: 0.3, metalness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: pal.c2 || '#2a2420', roughness: 0.7, metalness: 0.1 });
    this.armorMats = [metal, gold, dark];
    const put = (bone, geo, mat, pos, rot, scl) => {
      const b = raw(bone); if (!b) return;
      const m = new THREE.Mesh(geo, mat); m.castShadow = true;
      m.position.copy(pos); if (rot) m.rotation.copy(rot); if (scl) m.scale.copy(scl);
      root.add(m); m.updateMatrixWorld(true); b.attach(m);
    };
    const heavy = kind === 'heavy';
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? 1 : -1, cap = (x) => side + x;
      const sh = P(cap('UpperArm')), el = P(cap('LowerArm')), wr = P(cap('Hand'));
      if (!sh || !el || !wr) continue;
      const aL = sh.distanceTo(el), fL = el.distanceTo(wr);
      // 肩当て(重装は両肩に二段、軽装は左肩だけ)
      if (heavy || side === 'left') {
        const r = aL * (heavy ? 0.46 : 0.38);
        const dome = new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        put(cap('UpperArm'), dome, metal, sh.clone().add(new THREE.Vector3(s * aL * 0.12, r * 0.12, 0)), new THREE.Euler(0, 0, -s * 0.42), new THREE.Vector3(1.05, 0.72, 1.0));
        put(cap('UpperArm'), new THREE.TorusGeometry(r * 0.98, r * 0.07, 6, 20), gold, sh.clone().add(new THREE.Vector3(s * aL * 0.12, r * 0.12, 0)), new THREE.Euler(Math.PI / 2, -s * 0.42, 0), new THREE.Vector3(1.05, 1.0, 1));
        if (heavy) put(cap('UpperArm'), new THREE.SphereGeometry(r * 0.9, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), metal, sh.clone().add(new THREE.Vector3(s * aL * 0.38, -r * 0.18, 0)), new THREE.Euler(0, 0, -s * 0.7), new THREE.Vector3(0.9, 0.6, 0.95));
      }
      // 籠手
      const mid = el.clone().lerp(wr, 0.6), br = fL * (heavy ? 0.2 : 0.16);
      put(cap('LowerArm'), new THREE.CylinderGeometry(br, br * 0.82, fL * 0.62, 12), metal, mid, new THREE.Euler(0, 0, Math.PI / 2));
      put(cap('LowerArm'), new THREE.TorusGeometry(br * 1.02, br * 0.12, 6, 14), gold, el.clone().lerp(wr, 0.32), new THREE.Euler(0, Math.PI / 2, 0));
      // すね当て(重装のみ)
      if (heavy) {
        const kn = P(cap('LowerLeg')), an = P(cap('Foot'));
        if (kn && an) {
          const lL = kn.distanceTo(an), g = kn.clone().lerp(an, 0.42);
          put(cap('LowerLeg'), new THREE.CylinderGeometry(lL * 0.17, lL * 0.13, lL * 0.6, 12), metal, g.add(new THREE.Vector3(0, 0, lL * 0.03)));
          put(cap('LowerLeg'), new THREE.SphereGeometry(lL * 0.13, 10, 8), gold, kn.clone().add(new THREE.Vector3(0, 0, lL * 0.1)));
        }
      }
    }
    // 腰帯とバックル
    const hp = P('hips'), lu = P('leftUpperLeg'), ru = P('rightUpperLeg');
    if (hp && lu && ru) {
      const w = lu.distanceTo(ru), y = (hp.y + lu.y) / 2 + w * 0.15;
      put('hips', new THREE.CylinderGeometry(w * 1.02, w * 1.08, w * 0.32, 20, 1, true), dark, new THREE.Vector3(hp.x, y, hp.z), null, new THREE.Vector3(1, 1, 0.78));
      put('hips', new THREE.BoxGeometry(w * 0.55, w * 0.42, w * 0.1), gold, new THREE.Vector3(hp.x, y, hp.z + w * 0.8));
      if (heavy) for (const sx of [-1, 1]) put('hips', new THREE.BoxGeometry(w * 0.7, w * 0.9, w * 0.08), metal, new THREE.Vector3(hp.x + sx * w * 0.85, y - w * 0.55, hp.z + w * 0.15), new THREE.Euler(0, sx * 0.5, sx * 0.18));
    }
  }
  // 指を握りこむ(武器を持つ手)
  _fist() {
    const h = this.vrm.humanoid;
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      for (const fg of ['Index', 'Middle', 'Ring', 'Little']) {
        const curl = { Index: 1.0, Middle: 1.15, Ring: 1.25, Little: 1.3 }[fg];
        for (const [part, k] of [['Proximal', 1], ['Intermediate', 1.25], ['Distal', 0.8]]) {
          const n = h.getNormalizedBoneNode(side + fg + part); if (n) n.rotation.set(0, 0, s * curl * k * (part === 'Proximal' ? 0.9 : 1));
        }
      }
      const t1 = h.getNormalizedBoneNode(side + 'ThumbMetacarpal') || h.getNormalizedBoneNode(side + 'ThumbProximal');
      const t2 = h.getNormalizedBoneNode(side + 'ThumbProximal'), t3 = h.getNormalizedBoneNode(side + 'ThumbDistal');
      if (t1) t1.rotation.set(0, s * 0.45, s * 0.35);
      if (t2 && t2 !== t1) t2.rotation.set(0, s * 0.6, 0);
      if (t3) t3.rotation.set(0, s * 0.7, 0);
    }
  }
  // 輪郭光と陰影で印象づける: 味方は属性色のふち取り、敵は赤い逆光と暗い陰(lv 2=ボス)
  rim(col, lv) {
    const enemy = lv > 0;
    this.vrm.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (m.parametricRimColorFactor) {
          if (enemy) m.parametricRimColorFactor.setRGB(lv > 1 ? 1.8 : 1.1, 0.06, lv > 1 ? 0.12 : 0.03);
          else m.parametricRimColorFactor.setRGB(col[0] * 0.18, col[1] * 0.18, col[2] * 0.18);
          m.parametricRimFresnelPowerFactor = enemy ? (lv > 1 ? 2.0 : 2.8) : 4;
          m.parametricRimLiftFactor = enemy ? 0.06 : 0;
        }
        if (enemy && m.shadeColorFactor) m.shadeColorFactor.multiplyScalar(lv > 1 ? 0.5 : 0.68);
        if (enemy && m.color) m.color.multiplyScalar(lv > 1 ? 0.78 : 0.88);
      }
    });
  }
  flash(r, g, b) {
    const k = r + g * 7 + b * 49; if (k === this._fl) return; this._fl = k;
    for (const { m, c } of this.mats) { if (r || g || b) m.emissive.setRGB(c.r + r, c.g + g, c.b + b); else m.emissive.copy(c); }
  }
  dispose() { VRMUtils.deepDispose(this.vrm.scene); }
}
