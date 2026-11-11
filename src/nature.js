// 背景の木・岩・草花(Quaternius Stylized Nature MegaKit / CC0)をアニメ調の陰影で読み込む
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

const NAMES = ['CommonTree_1', 'CommonTree_3', 'Pine_1', 'Pine_3', 'DeadTree_1', 'DeadTree_3', 'TwistedTree_1', 'TwistedTree_3',
  'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3', 'Bush_Common', 'Flower_3_Group'];
let lib = null, loading = null;

// 3段階の陰影(セル調)
let _grad = null;
export function toonGradient() {
  if (_grad) return _grad;
  _grad = new THREE.DataTexture(new Uint8Array([125, 125, 125, 255, 195, 195, 195, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter; _grad.needsUpdate = true;
  return _grad;
}
function toToon(m) {
  const cut = m.alphaTest > 0 || m.transparent || (m.userData && m.userData.alphaMode === 'MASK');
  // 遠くで葉が消えないよう、切り抜きテクスチャはミップマップを使わない
  if (cut && m.map) { m.map.generateMipmaps = false; m.map.minFilter = THREE.LinearFilter; m.map.needsUpdate = true; }
  return new THREE.MeshToonMaterial({ map: m.map || null, color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1), gradientMap: toonGradient(),
    alphaTest: cut ? 0.35 : 0, side: cut ? THREE.DoubleSide : THREE.FrontSide });
}
function extract(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene), parts = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
    for (const a of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(a)) geo.deleteAttribute(a);
    parts.push({ geo, mat: toToon(o.material), leaf: /leaf|leaves|flower/i.test(o.material.name || '') });
  });
  return { parts, h: Math.max(0.01, box.max.y - box.min.y), minY: box.min.y };
}

export function preloadNature() {
  if (!loading) {
    const loader = new GLTFLoader();
    loading = Promise.all(NAMES.map((n) => loader.loadAsync('assets/nature/' + n + '.gltf').then((g) => [n, g]).catch(() => [n, null])))
      .then((arr) => { lib = {}; for (const [n, g] of arr) if (g) lib[n] = extract(g.scene); return lib; });
  }
  return loading;
}
export const natureLib = () => lib;

// ステージごとの植生(名前・数・高さ・葉の色)
export const NATURE_SETS = {
  plains: { trees: [['CommonTree_1', 110, 6, 10], ['CommonTree_3', 80, 5, 8], ['Pine_1', 70, 7, 12], ['Bush_Common', 90, 1.2, 2, '#7fc85a']], rocks: '#ffffff', flowers: 260 },
  desert: { trees: [['DeadTree_1', 40, 4, 7], ['DeadTree_3', 30, 3, 6]], rocks: '#e8a070', flowers: 0 },
  snow: { trees: [['Pine_1', 140, 7, 13], ['Pine_3', 110, 6, 11]], leaf: '#dfeef5', rocks: '#ffffff', flowers: 0 },
  volcano: { trees: [['DeadTree_1', 60, 4, 8], ['DeadTree_3', 50, 3, 7]], bark: '#3a2a26', rocks: '#8a7a74', flowers: 0 },
  castle: { trees: [['TwistedTree_1', 90, 5, 8], ['TwistedTree_3', 70, 5, 8], ['Bush_Common', 60, 1.2, 2, '#ffb8d8']], leaf: '#ffa8cf', rocks: '#dfe2f0', flowers: 120 },
};
