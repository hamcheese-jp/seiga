// 町で使うアクション(エモート): 押すと自分のキャラが動き、頭の上に絵文字が出る。町にいるほかの人にも届く
//   pose(t): 経過秒 t のときのリグの姿勢(src/poses.js と同じパラメータ)。face は VRM の表情
import * as THREE from 'three';
const S = Math.sin;
// 頭の上に出す絵文字の吹き出し
export function emojiSprite(e) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath(); c.arc(64, 60, 52, 0, 7); c.fill(); c.beginPath(); c.moveTo(52, 104); c.lineTo(64, 124); c.lineTo(76, 104); c.fill();
  c.font = '64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, 64, 62);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, depthTest: false, transparent: true }));
  s.scale.set(1.1, 1.1, 1); s.renderOrder = 41; return s;
}
export const freeEmoji = (s) => { if (!s) return; if (s.parent) s.parent.remove(s); s.material.map.dispose(); s.material.dispose(); };
export const EMOTES = [
  { k: 'wave', n: '手を振る', e: '👋', dur: 2.4, pose: (t) => ({ az: -10, el: -70, bend: 10, azL: 25 + S(t * 11) * 22, elL: 128, bendL: 45, wrL: 0, head: -8, face: { happy: 0.8 } }) },
  { k: 'bow', n: 'おじぎ', e: '🙇', dur: 2.2, pose: (t) => { const u = Math.min(1, t / 0.4) * Math.min(1, (2.2 - t) / 0.4); return { az: -6, el: -78, bend: 8, azL: 6, elL: -78, bendL: 8, lean: 72 * u, head: 28 * u, face: { relaxed: 0.6 } }; } },
  { k: 'cheer', n: 'バンザイ', e: '🙌', dur: 2.4, pose: (t) => ({ az: -18, el: 150, bend: 12, azL: 18, elL: 150, bendL: 12, crouch: 0.15 + 0.15 * Math.abs(S(t * 7)), lean: -6, head: -15, face: { happy: 1 } }) },
  { k: 'clap', n: '拍手', e: '👏', dur: 2.4, pose: (t) => ({ az: -8 - 14 * Math.abs(S(t * 13)), el: 22, bend: 95, azL: 8 + 14 * Math.abs(S(t * 13)), elL: 22, bendL: 95, head: -5, face: { happy: 0.9 } }) },
  { k: 'dance', n: '踊る', e: '💃', dur: 3.2, pose: (t) => ({ az: -60 + S(t * 6) * 30, el: 60 + S(t * 6) * 40, bend: 40, azL: 60 + S(t * 6 + 3) * 30, elL: 60 + S(t * 6 + 3) * 40, bendL: 40, tw: S(t * 3) * 25, side: S(t * 6) * 10, crouch: 0.2 + 0.15 * Math.abs(S(t * 6)), stance: 0.5, head: S(t * 6) * 15, face: { happy: 1 } }) },
  { k: 'sit', n: '座る', e: '🪑', dur: 6, pose: () => ({ az: -30, el: -55, bend: 60, azL: 30, elL: -55, bendL: 60, crouch: 1, lean: 12, stance: 0.4, face: { relaxed: 0.8 } }) },
  { k: 'laugh', n: '笑う', e: '😆', dur: 2.4, pose: (t) => ({ az: -40, el: -30, bend: 100, azL: 40, elL: -30, bendL: 100, lean: -12 + S(t * 14) * 5, head: -20 + S(t * 14) * 6, face: { happy: 1, aa: 0.6 } }) },
  { k: 'thanks', n: 'ありがとう', e: '🙏', dur: 2.4, pose: (t) => { const u = Math.min(1, t / 0.4); return { az: -22, el: 25, bend: 125, azL: 22, elL: 25, bendL: 125, lean: 18 * u, head: 14 * u, face: { happy: 0.6, relaxed: 0.5 } }; } },
  { k: 'flex', n: '力こぶ', e: '💪', dur: 2.4, pose: (t) => ({ az: -85, el: 85, bend: 125, azL: 85, elL: 85, bendL: 125, crouch: 0.25, stance: 0.8, lean: -4 + S(t * 8) * 3, face: { angry: 0.3, happy: 0.5 } }) },
  { k: 'sad', n: 'しょんぼり', e: '😢', dur: 2.8, pose: (t) => ({ az: -4, el: -82, bend: 6, azL: 4, elL: -82, bendL: 6, lean: 38, head: 42 + S(t * 2) * 4, crouch: 0.35, face: { sad: 1 } }) },
];
export const EMOTE = Object.fromEntries(EMOTES.map((e) => [e.k, e]));
