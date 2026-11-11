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
export const VRM_KEYS = [...HEROES.map((h) => h.id), 'enemyOfficer', 'boss1', 'boss2', 'boss3', 'boss4', 'boss5'];
const avail = {};
let _probe = null;
export function probeVrm() {
  if (!_probe) _probe = Promise.all(VRM_KEYS.map((id) => VRM_FILES[id] ? (avail[id] = true)
    : fetch('vrm/' + id + '.vrm', { method: 'HEAD' }).then((r) => { avail[id] = r.ok; }).catch(() => { avail[id] = false; })));
  return _probe;
}

export const hasVrm = (id) => !!(id && fileFor(id));
function fetchBuf(id) {
  const f = fileFor(id);
  if (!f) return Promise.resolve(null);
  if (!bufs.has(f)) bufs.set(f, fetch(f).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
  return bufs.get(f);
}
// 合戦前などに先読み
export const preloadVrm = (ids) => probeVrm().then(() => Promise.all(ids.filter(hasVrm).map(fetchBuf)));

export async function loadVrm(id) {
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
    this.vrm.update(dt);
    // 武器: 向きは元リグの手、位置はVRMの手
    const root = this.model.root;
    root.updateMatrixWorld(true);
    this._place(this.wR, 'rightHand', J.handR, Q.handR, rig, false);
    if (this.model.dual) this._place(this.wL, 'leftHand', J.handL, Q.handL, rig, true);
  }
  _place(g, bone, procHand, q, rig, left) {
    const root = this.model.root, node = this.N[bone];
    if (!node) return;
    node.getWorldPosition(_w);              // VRMの手(ワールド)
    procHand.getWorldPosition(_v);          // 元リグの手(ワールド)
    _v.sub(_w).negate();                    // ずれ
    if (left) { rig.wBaseL.add(_v); rig.wTipL.add(_v); } else { rig.wBase.add(_v); rig.wTip.add(_v); }
    g.position.copy(root.worldToLocal(_w.clone()));
    g.quaternion.copy(q);
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
