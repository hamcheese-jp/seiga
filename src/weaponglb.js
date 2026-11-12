// AI生成の3D武器(Meshy / CC BY 4.0)を読み込み、手に持てる向き・大きさにそろえる
// 元データは縦向き(柄が下・刃先が上)、幅がX方向。ゲーム内の武器は
// 「柄の中心が原点・刃先が+Y・刃の幅が+Z」なので、それに合わせる。
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

// len: 全長(m) / grip: 下端から柄の中心までの割合 / trail: 軌跡を描く範囲(刃先側の割合)
const DEF = {
  sword: { len: 1.36, grip: 0.1, trail: 0.3 },
  twin: { len: 1.0, grip: 0.1, trail: 0.3 },
  spear: { len: 2.9, grip: 0.3, trail: 0.7 },
  hammer: { len: 2.0, grip: 0.2, trail: 0.62 },
};
const lib = {};
let loading = null;

export function preloadWeapons() {
  if (!loading) {
    const L = new GLTFLoader();
    loading = Promise.all(Object.keys(DEF).map((k) => L.loadAsync(new URL(`../assets/weapons/${k}.glb`, import.meta.url).href)
      .then((g) => { lib[k] = prep(g.scene, DEF[k]); })
      .catch((e) => console.warn('武器モデルを読み込めませんでした:', k, e))));
  }
  return loading;
}
export const hasWeaponGlb = (type) => !!lib[type];

function prep(scene, d) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene), h = Math.max(0.01, box.max.y - box.min.y), k = d.len / h;
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.shared = true; } });
  const top = (1 - d.grip) * d.len;
  return {
    scene, d, top,
    // 外側で 縮尺→回転 をかけ、内側で中心と柄の位置をずらす
    off: new THREE.Vector3(-(box.min.x + box.max.x) / 2, -(box.min.y + h * d.grip), -(box.min.z + box.max.z) / 2),
    k, mats: new Map(),
  };
}

// レア度と属性色で光り方を変えた材質(同じ組み合わせは使い回す)
function tierMat(W, src, tier, glow) {
  const key = src.uuid + '|' + tier + '|' + glow.join(',');
  let m = W.mats.get(key);
  if (m) return m;
  m = src.clone();
  const g = new THREE.Color(glow[0], glow[1], glow[2]);
  // 金属感が強すぎると暗く沈むので抑え、レア度が上がるほど属性色でほんのり光らせる
  if (m.metalness !== undefined) m.metalness = Math.min(m.metalness ?? 1, 0.55);
  m.envMapIntensity = 0.6;
  if (tier >= 1) {
    m.emissive = new THREE.Color(1, 1, 1).lerp(g, 0.45).multiplyScalar(tier === 1 ? 0.12 : 0.28);
    m.emissiveMap = src.map || null;
    m.emissiveIntensity = 1;
  }
  if (tier >= 2 && m.roughness !== undefined) m.roughness = Math.max(0.15, (m.roughness ?? 0.5) * 0.7);
  W.mats.set(key, m);
  return m;
}

// 手に持たせる武器(Group)と、軌跡用の刃先・根元の位置を返す。未読み込みなら null
export function weaponGlb(type, tier, glow) {
  const W = lib[type];
  if (!W) return null;
  const s = 1 + tier * 0.05;
  const make = () => {
    const outer = new THREE.Group(), inner = W.scene.clone(true);
    inner.position.copy(W.off);
    inner.traverse((o) => { if (o.isMesh) { o.material = tierMat(W, o.material, tier, glow); o.castShadow = true; o.userData.shared = true; } });
    outer.add(inner);
    outer.scale.setScalar(W.k * s);
    outer.rotation.y = -Math.PI / 2;
    outer.castShadow = true;
    return outer;
  };
  const top = W.top * s;
  return { make, tip: [0, top * 0.97, 0], base: [0, top * W.d.trail, 0] };
}
