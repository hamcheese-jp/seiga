// 着せ替え鎧: assets/armor/<キャラ>/<セット>_<部位>.arm を読み、VRMの骨に結び付けて着せる
// ファイルは tools/blender/vroid_armor.py が各キャラの体の表面から作る(体に沿って曲がる)
import * as THREE from 'three';

export const ARMOR_SLOTS = ['head', 'body', 'arms', 'legs'];
const cache = new Map();
const ST = new WeakMap();   // VRMごとの状態(骨の表・着ている鎧・指定)
const st = (vrm) => ST.get(vrm) || (ST.set(vrm, {}), ST.get(vrm));

// アニメ調の陰影(3段階)
let _grad = null;
function gradient() {
  if (!_grad) {
    _grad = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    _grad.minFilter = _grad.magFilter = THREE.NearestFilter; _grad.needsUpdate = true;
  }
  return _grad;
}

function parse(buf) {
  const dv = new DataView(buf), jl = dv.getUint32(0, true);
  const J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
  let o = 4 + jl; const nv = J.nv;
  const pos = new Float32Array(buf.slice(o, o + nv * 12)); o += nv * 12;
  const nrm = new Int8Array(buf.slice(o, o + nv * 3)); o += nv * 3 + ((4 - (nv * 3) % 4) % 4);
  const ji = new Uint8Array(buf.slice(o, o + nv * 4)); o += nv * 4;
  const jw = new Uint8Array(buf.slice(o, o + nv * 4)); o += nv * 4;
  const idx = nv < 65536 ? new Uint16Array(buf.slice(o, o + J.ni * 2)) : new Uint32Array(buf.slice(o, o + J.ni * 4));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(ji), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(jw, 4, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  J.groups.forEach((gr, i) => g.addGroup(gr.start, gr.count, i));
  const mats = J.groups.map((gr) => {
    const m = J.mats[gr.mat], c = new THREE.Color().setRGB(m.color[0], m.color[1], m.color[2], THREE.LinearSRGBColorSpace);
    // 金属は少し明るく・自己発光でつやを補う(環境マップなしでも沈まないように)
    const mat = new THREE.MeshToonMaterial({ color: c, gradientMap: gradient(), side: THREE.DoubleSide });
    if (m.metal > 0.2) { mat.emissive = c.clone().multiplyScalar(0.06); }
    return mat;
  });
  return { geometry: g, mats, bones: J.bones };
}

export function loadArmor(hero, set, slot) {
  const url = `assets/armor/${hero}/${set}_${slot}.arm`;
  if (!cache.has(url)) cache.set(url, fetch(new URL('../' + url, import.meta.url)).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? parse(b) : null)).catch(() => null));
  return cache.get(url);
}

// VRMの体から、骨の名前 → 骨と基準姿勢の逆行列 を集める(今のポーズに関係なく正しく結び付けられる)
function boneTable(vrm) {
  if (st(vrm).boneTable) return st(vrm).boneTable;
  const tab = new Map(); let host = null;
  vrm.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (!host || /body/i.test(o.name)) host = o;
    o.skeleton.bones.forEach((b, i) => { if (!tab.has(b.name)) tab.set(b.name, { bone: b, inv: o.skeleton.boneInverses[i] }); });
  });
  return (st(vrm).boneTable = { tab, host });
}

// equip = { head: 'guren', body: 'kurogane', ... }(無い部位は何も着ない)。着ている鎧と違う部位だけ入れ替える
export async function wearArmor(vrm, hero, equip) {
  const { tab, host } = boneTable(vrm); if (!host) return;
  const worn = st(vrm).armor || (st(vrm).armor = {});
  await Promise.all(ARMOR_SLOTS.map(async (slot) => {
    const set = (equip && equip[slot]) || null, cur = worn[slot];
    if (cur && cur.set === set) return;
    if (cur) { cur.mesh.parent && cur.mesh.parent.remove(cur.mesh); cur.mesh.skeleton.dispose(); delete worn[slot]; }
    if (!set) return;
    const A = await loadArmor(hero, set, slot); if (!A) return;
    if (worn[slot] || ((st(vrm).armorWant || {})[slot] || null) !== set) return;   // 読み込み中に別の指定が来た
    const fb = tab.get('J_Bip_C_Hips') || tab.values().next().value;
    const ent = A.bones.map((n) => tab.get(n) || tab.get(n.replace(/[ .]/g, '_')) || fb);
    const mesh = new THREE.SkinnedMesh(A.geometry, A.mats);
    mesh.name = 'armor_' + slot; mesh.castShadow = true; mesh.frustumCulled = false;
    host.parent.add(mesh); mesh.matrix.copy(host.matrix); mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.bind(new THREE.Skeleton(ent.map((e) => e.bone), ent.map((e) => e.inv.clone())), host.bindMatrix);
    worn[slot] = { set, mesh };
  }));
}
export function setArmor(vrm, hero, equip) { st(vrm).armorWant = { ...(equip || {}) }; return wearArmor(vrm, hero, st(vrm).armorWant); }
