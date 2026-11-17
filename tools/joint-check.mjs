// 関節・握りの自動点検: 全技を少しずつ再生し、手の向き・めり込み・関節の不自然さを数える
//   ブラウザのコンソール(tools/view.html を開いた状態)で:
//   const m = await import('/tools/joint-check.mjs'); await m.check(['reiga', 'gandou'])
// 結果: 武将ごとの「問題のあった割合」と、ひどい順の技の一覧
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '../vendor/three-vrm.module.min.js';
import { buildHero } from '../src/models.js';
import { Rig } from '../src/rig.js';
import { MS } from '../src/moves.js';
import { HERO, ELEMENTS } from '../src/data.js';
import { VrmBody } from '../src/vrmchar.js';
import { heroPose } from '../src/poses.js';
import { preloadWeapons } from '../src/weaponglb.js';

const V = () => new THREE.Vector3();
const deg = (a, b) => THREE.MathUtils.radToDeg(a.angleTo(b));

export const LIMIT = { axisDeg: 25, gapCm: 4, wristDeg: 75, elbowDeg: 155, kneeBackCm: 2, torsoCm: 6 };

export async function check(ids = ['reiga', 'setsuna', 'raika', 'gandou', 'fuuka', 'yomi'], opt = {}) {
  await preloadWeapons();
  const out = {};
  for (const id of ids) {
    const h = HERO[id], E = ELEMENTS[h.elem];
    const loader = new GLTFLoader(); loader.register((p) => new VRMLoaderPlugin(p));
    const gltf = await loader.loadAsync('/vrm/' + (h.vrm || id) + '.vrm'); const vrm = gltf.userData.vrm;
    if (vrm.meta && vrm.meta.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
    const model = buildHero({ ...h.look, pal: { ...h.look.pal, glow: E.glow } }, h.wtype, 2);
    const rig = new Rig(model), vb = new VrmBody(model, vrm);
    const n = (b) => vb.vrm.humanoid.getNormalizedBoneNode(b);
    const P = (b) => n(b).getWorldPosition(V());
    const Qw = (b) => n(b).getWorldQuaternion(new THREE.Quaternion());
    const cm = 100 / (vb.k * model.root.scale.x || 1);          // ワールド長 → VRM 実寸 cm
    const stats = {}, worst = {};
    const add = (key, bad, val, mv) => {
      const s = stats[key] || (stats[key] = { n: 0, bad: 0, max: 0 }); s.n++; if (bad) { s.bad++; (worst[mv] || (worst[mv] = {}))[key] = Math.max((worst[mv] || {})[key] || 0, +val.toFixed(1)); } s.max = Math.max(s.max, val);
    };
    const sample = (mv) => {
      model.root.updateMatrixWorld(true);
      const shaftR = V().set(0, 1, 0).applyQuaternion(vb.wR.getWorldQuaternion(new THREE.Quaternion())).normalize();
      // 右手: 拳の穴の向き(手のローカル Z)と柄の向き
      add('右手の向きのずれ°', false, 0, mv);
      const zR = V().set(0, 0, 1).applyQuaternion(Qw('rightHand'));
      const aR = Math.min(deg(zR, shaftR), deg(zR.negate(), shaftR)); add('右手の向きのずれ°', aR > LIMIT.axisDeg, aR, mv);
      // 左手(両手持ち): 拳の中心と柄の距離、穴の向き
      if (model.two && !rig.oneHand) add('左手を柄から離している', (vb._lw ?? 1) < 0.5, (vb._lw ?? 1) < 0.5 ? 1 : 0, mv);
      if (model.two && !rig.oneHand && (vb._lw ?? 1) > 0.9) {   // 手を離している間は数えない
        const F = vb._fistCenter(true, V()), O = vb.wR.getWorldPosition(V());
        const d = F.clone().sub(O); const gap = d.addScaledVector(shaftR, -d.dot(shaftR)).length() * cm;
        add('左手と柄の距離cm', gap > LIMIT.gapCm, gap, mv);
        const zL = V().set(0, 0, 1).applyQuaternion(Qw('leftHand'));
        const aL = Math.min(deg(zL, shaftR), deg(zL.negate(), shaftR)); add('左手の向きのずれ°', aL > LIMIT.axisDeg, aL, mv);
      }
      if (model.dual) {
        const shaftL = V().set(0, 1, 0).applyQuaternion(vb.wL.getWorldQuaternion(new THREE.Quaternion())).normalize();
        const zL = V().set(0, 0, 1).applyQuaternion(Qw('leftHand'));
        const aL = Math.min(deg(zL, shaftL), deg(zL.negate(), shaftL)); add('左手の向きのずれ°', aL > LIMIT.axisDeg, aL, mv);
      }
      for (const [s, sx] of [['left', 1], ['right', -1]]) {
        const S = P(s + 'UpperArm'), El = P(s + 'LowerArm'), Wr = P(s + 'Hand');
        // 手首: 前腕の向きと指の向き
        const fore = Wr.clone().sub(El).normalize(), fing = V().set(sx, 0, 0).applyQuaternion(Qw(s + 'Hand'));
        const w = deg(fore, fing); add('手首の折れ°', w > LIMIT.wristDeg, w, mv);
        // 肘: 上腕と前腕のなす角(180-…で曲げ角)
        const bend = 180 - deg(El.clone().sub(S).negate(), Wr.clone().sub(El).negate().negate()) ;
        const flex = deg(S.clone().sub(El), Wr.clone().sub(El)); const fold = 180 - flex;
        add('肘の曲げ°', fold > LIMIT.elbowDeg, fold, mv);
        // 膝: 腰→足首の線より膝が後ろへ出ていないか(逆ひざ)
        const Hp = P(s + 'UpperLeg'), Kn = P(s + 'LowerLeg'), An = P(s + 'Foot');
        const ax = An.clone().sub(Hp), t = Kn.clone().sub(Hp).dot(ax) / ax.lengthSq(), off = Kn.clone().sub(Hp.clone().addScaledVector(ax, t));
        const fwd = V().set(0, 0, 1).applyQuaternion(Qw('hips'));
        const back = -off.dot(fwd) * cm; add('膝の逆曲がりcm', back > LIMIT.kneeBackCm, Math.max(0, back), mv);
        // 腕と胴: 肘・手首が胴の芯に近すぎないか
        const hip = P('hips'), top = P('neck'), axT = top.clone().sub(hip);
        const near = (p) => { const k = THREE.MathUtils.clamp(p.clone().sub(hip).dot(axT) / axT.lengthSq(), 0, 1); return p.distanceTo(hip.clone().addScaledVector(axT, k)) * cm; };
        const shoulderR = near(S);                                   // 肩の芯からの距離 ≒ 胴の半径
        const depth = Math.max(0, shoulderR * 0.62 - Math.min(near(El), near(Wr)));
        add('腕の胴へのめり込みcm', depth > LIMIT.torsoCm, depth, mv);
      }
    };
    for (let i = 0; i < 60; i++) { rig.update(1 / 60); vb.sync(1 / 60, rig); }
    sample('待機');
    const ms = MS[h.ms || id];
    const list = [...ms.n.map((m, i) => ['通常' + (i + 1), m]), ...ms.c.map((m, i) => ['チャージ' + (i + 1), m]), ['奥義', ms.sp]];
    for (const [name, mv] of list) {
      rig.play(mv); rig.mt = 0;
      for (let t = 0, k = 0; t < mv.dur; t += 1 / 120, k++) { rig.mt += 1 / 120; rig.update(1 / 120); vb.sync(1 / 120, rig); if (k % 4 === 0) sample(name); }
      rig.stop(); for (let i = 0; i < 20; i++) { rig.update(1 / 60); vb.sync(1 / 60, rig); }
    }
    const HP = heroPose(id);
    if (HP) { rig.customPose = HP.p; rig.setMode('pose'); for (let i = 0; i < 150; i++) { rig.update(1 / 60); vb.sync(1 / 60, rig); } sample('決めポーズ'); }
    rig.customPose = null; rig.setMode('loco'); rig.speed = 7.6; for (let i = 0; i < 120; i++) { rig.update(1 / 60); vb.sync(1 / 60, rig); if (i % 6 === 0) sample('走り'); }
    const sum = {}; for (const [k, s] of Object.entries(stats)) sum[k] = { 問題の割合: Math.round(s.bad / s.n * 100) + '%', 最大: +s.max.toFixed(1) };
    out[id] = { 項目: sum, 問題のあった技: worst };
    VRMUtils.deepDispose(vrm.scene);
    if (opt.onEach) opt.onEach(id, out[id]);
  }
  return out;
}
