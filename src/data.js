// ゲームデータ: 属性 / 武将 / 難易度 / ステージ / 武器 / 実績
import { clamp, lerp } from './util.js';

export const GAME_TITLE = '星牙戦記';
export const GAME_SUB = 'SEIGA — Star Fang Chronicle';

export const ELEMENTS = {
  fire:    { n: '炎', css: '#ff6a2a', glow: [4.6, 1.3, 0.25], sfx: 'fire',    d: '炎上: 継続ダメージ' },
  ice:     { n: '氷', css: '#6fd8ff', glow: [0.5, 2.1, 4.4],  sfx: 'ice',     d: '凍結: 敵の動きを鈍らせる' },
  thunder: { n: '雷', css: '#c39bff', glow: [2.6, 1.5, 4.8],  sfx: 'thunder', d: '感電: 周囲へ連鎖' },
  earth:   { n: '地', css: '#ffb347', glow: [3.9, 2.1, 0.4],  sfx: 'quake',   d: '粉砕: 敵を気絶させる' },
  wind:    { n: '風', css: '#7dffb2', glow: [0.6, 3.7, 1.7],  sfx: 'wind',    d: '烈風: 敵を高く打ち上げる' },
  dark:    { n: '闇', css: '#c05cff', glow: [3.3, 0.5, 4.5],  sfx: 'dark',    d: '吸魂: 体力を吸収' },
};

export const HEROES = [
  { id: 'reiga', name: 'レイガ', title: '焔牙の剣士', wtype: 'sword', wname: '大太刀', elem: 'fire',
    desc: '攻守に優れた万能型。炎をまとう斬撃で敵陣を切り裂く。',
    base: { hp: 1050, atk: 34, def: 28, spd: 7.6, aspd: 1.0 }, stars: [4, 3, 3, 3],
    look: { scale: 1.0, sw: 0.26, bulk: 1.02, hair: 'spiky', gear: 'band', cape: 'scarf', pauldron: 1, tasset: 'plate', tails: 2,
      pal: { skin: '#f0c8a0', hair: '#5a1c14', c1: '#cc262c', c2: '#2c2a3a', c3: '#d8a43c', metal: '#8c94a8', gold: '#e8b84e', eye: '#3a1208', cape: '#d82a2e' } } },
  { id: 'setsuna', name: 'セツナ', title: '氷華の槍姫', wtype: 'spear', wname: '長槍', elem: 'ice',
    desc: '長い間合いで敵を寄せつけない。氷の槍技は広範囲を凍てつかせる。',
    base: { hp: 950, atk: 32, def: 24, spd: 7.8, aspd: 1.0 }, stars: [3, 5, 3, 2],
    look: { scale: 0.96, sw: 0.225, bulk: 0.9, fem: true, hair: 'pony', gear: 'tiara', cape: '', pauldron: 1, tasset: 'none', tails: 5, tailLen: 0.36,
      pal: { skin: '#f7dfcc', hair: '#dfe9f6', c1: '#e8eff8', c2: '#213c72', c3: '#9fc4f0', metal: '#b4c2d2', gold: '#d9e4f2', eye: '#1f4a8a', boot: '#24345c' } } },
  { id: 'raika', name: 'ライカ', title: '迅雷の双刃', wtype: 'twin', wname: '双剣', elem: 'thunder',
    desc: '圧倒的な手数と機動力。稲妻のごとく戦場を駆け抜ける。',
    base: { hp: 880, atk: 28, def: 20, spd: 8.8, aspd: 1.15 }, stars: [2, 2, 5, 3],
    look: { scale: 0.98, sw: 0.245, bulk: 0.92, hair: 'short', gear: 'mask', cape: 'scarf', pauldron: 0, tasset: 'none', tails: 1, arms: 'bare',
      pal: { skin: '#e6bc96', hair: '#2c2548', c1: '#5c40b8', c2: '#221e30', c3: '#f2d24a', metal: '#6c7288', gold: '#f2d24a', eye: '#6a3fd0', cape: '#7a56e0' } } },
  { id: 'gandou', name: 'ガンドウ', title: '砕地の豪傑', wtype: 'hammer', wname: '大槌', elem: 'earth',
    desc: '一撃の重さは随一。攻撃中は怯まず、大地ごと敵を叩き潰す。',
    base: { hp: 1400, atk: 44, def: 40, spd: 6.6, aspd: 0.9 }, stars: [5, 4, 1, 5], heavy: true,
    look: { scale: 1.2, sw: 0.3, bulk: 1.42, headScale: 1.02, hair: 'bald', beard: true, gear: 'horn', cape: '', pauldron: 2, tasset: 'plate', tails: 1, arms: 'bare', fur: true,
      pal: { skin: '#c89064', hair: '#3b2a1c', c1: '#8a5c30', c2: '#2c2520', c3: '#d38a2c', metal: '#a08a66', gold: '#d9a23a', eye: '#2a1608' } } },
  { id: 'fuuka', name: 'フウカ', title: '翠嵐の舞姫', wtype: 'fan', wname: '双扇', elem: 'wind',
    desc: '風の刃を放つ遠距離型。舞うように敵を寄せ集め、まとめて吹き飛ばす。',
    base: { hp: 820, atk: 30, def: 18, spd: 8.0, aspd: 1.05 }, stars: [3, 5, 4, 1],
    look: { scale: 0.94, sw: 0.22, bulk: 0.88, fem: true, hair: 'twin', gear: 'flower', cape: '', pauldron: 0, tasset: 'none', tails: 4, tailLen: 0.34,
      pal: { skin: '#f8decd', hair: '#1f4a36', c1: '#3fb07c', c2: '#f3efe2', c3: '#ff9ab8', metal: '#d6c48e', gold: '#ecc860', eye: '#1e7a4a', boot: '#3a6a52' } } },
  { id: 'yomi', name: 'ヨミ', title: '冥月の死神', wtype: 'scythe', wname: '大鎌', elem: 'dark',
    desc: '大鎌で広範囲を刈り取る。与えた傷から生命を吸い上げる。',
    base: { hp: 900, atk: 38, def: 22, spd: 7.4, aspd: 0.97 }, stars: [4, 4, 3, 2], steal: 1.0,
    look: { scale: 0.97, sw: 0.225, bulk: 0.9, fem: true, hair: 'long', gear: 'demon', cape: 'long', pauldron: 1, tasset: 'none', tails: 3, tailLen: 0.34,
      pal: { skin: '#eadde0', hair: '#191122', c1: '#4e2270', c2: '#16121e', c3: '#b04cff', metal: '#5a5468', gold: '#9a7ae0', eye: '#b02ad0', cape: '#241634', boot: '#17131c' } } },
];
export const HERO = Object.fromEntries(HEROES.map((h) => [h.id, h]));
export const STAR_LABELS = ['攻撃', '範囲', '速度', '耐久'];

// 敵味方の一般武将・ボスの見た目
export const LOOKS = {
  enemyOfficer: { scale: 1.08, bulk: 1.12, sw: 0.27, headScale: 1.1, hair: 'bald', gear: 'kabuto', cape: 'short', pauldron: 1, tasset: 'plate', tails: 0,
    pal: { skin: '#d9a982', hair: '#1a1210', c1: '#7c1418', c2: '#1c181a', c3: '#b8862a', metal: '#585c6e', gold: '#c9982e', glow: [3.5, 0.5, 0.3], eye: '#200808', cape: '#5c0e12' } },
  allyOfficer: { scale: 1.06, bulk: 1.1, sw: 0.265, headScale: 1.1, hair: 'bald', gear: 'kabuto', cape: 'short', pauldron: 1, tasset: 'plate', tails: 0,
    pal: { skin: '#e2b48c', hair: '#1a1210', c1: '#1e4a9a', c2: '#161a26', c3: '#c8d4e8', metal: '#566078', gold: '#d8e2f2', glow: [0.5, 1.6, 4.0], eye: '#081020', cape: '#16387a' } },
  boss1: { scale: 1.3, bulk: 1.45, sw: 0.31, headScale: 1.0, hair: 'bald', beard: true, gear: 'kabuto horn hornbig', cape: 'long', pauldron: 2, tasset: 'plate', tails: 0,
    pal: { skin: '#c99672', hair: '#281410', c1: '#6a1014', c2: '#181416', c3: '#c08a2a', metal: '#4c4e5c', gold: '#d2a030', glow: [4.5, 0.7, 0.2], eye: '#3a0808', cape: '#4a0a0e' } },
  boss2: { scale: 1.1, bulk: 1.0, sw: 0.255, headScale: 1.1, hair: 'short', gear: 'hood mask', cape: 'scarf', pauldron: 0, tasset: 'none', tails: 3, arms: 'bare',
    pal: { skin: '#b9825a', hair: '#201810', c1: '#8a3a1e', c2: '#2a1c14', c3: '#e8c070', metal: '#6a5a44', gold: '#e8c070', glow: [4.2, 2.4, 0.4], eye: '#2a1408', cape: '#b0562a' } },
  boss3: { scale: 1.22, bulk: 1.25, sw: 0.285, headScale: 1.05, hair: 'long', gear: 'horn', cape: 'long', pauldron: 2, tasset: 'plate', tails: 2, fur: true,
    pal: { skin: '#d8c4b8', hair: '#c8d4e2', c1: '#3a5a86', c2: '#1a2434', c3: '#cfe2f6', metal: '#7a8ea8', gold: '#dbe8f6', glow: [0.6, 2.3, 4.6], eye: '#0c2a4a', cape: '#e8eef6' } },
  boss4: { scale: 1.35, bulk: 1.5, sw: 0.32, headScale: 1.0, hair: 'bald', gear: 'kabuto horn hornbig', cape: 'long', pauldron: 2, tasset: 'plate', tails: 0,
    pal: { skin: '#8a5a48', hair: '#140c0a', c1: '#2a1410', c2: '#120c0a', c3: '#ff6a1e', metal: '#40302a', gold: '#ff7a2a', glow: [5.0, 1.4, 0.2], eye: '#ff4a10', cape: '#3a0e08' } },
  boss5: { scale: 1.28, bulk: 1.2, sw: 0.285, headScale: 1.05, hair: 'long', gear: 'crown demon', cape: 'long', pauldron: 2, tasset: 'plate', tails: 3,
    pal: { skin: '#d8ccd8', hair: '#e8e2f6', c1: '#1a1230', c2: '#0c0a16', c3: '#d8b24a', metal: '#3c3866', gold: '#f2ce5a', glow: [4.6, 0.6, 2.6], eye: '#e01a5a', cape: '#2a0f3c' } },
};
export const OFFICER_NAMES = ['ドルガ', 'ベイル', 'カザン', 'ゴウラ', 'ザイード', 'ムゲン', 'バルド', 'ジオル', 'ラゴウ', 'ヘイガン', 'ウルガ', 'ダイモン', 'ゼクス', 'ボルグ', 'ガイエン', 'シグロ', 'ハザク', 'ロウガ'];
export const ALLY_NAMES = ['カイセイ', 'ホクト', 'アマギ', 'ミナト', 'セイラン', 'トウマ'];

export const DIFFS = [
  { id: 'easy',  n: '易しい', hp: 0.7,  dmg: 0.55, tokens: 2, cd: 1.5,  rew: 0.8, pow: 0,  col: '#7fd4ff' },
  { id: 'normal', n: '普通',  hp: 1.0,  dmg: 1.0,  tokens: 3, cd: 1.0,  rew: 1.0, pow: 8,  col: '#9dff9d' },
  { id: 'hard',  n: '難しい', hp: 1.7,  dmg: 1.6,  tokens: 4, cd: 0.75, rew: 1.5, pow: 22, col: '#ffd76a' },
  { id: 'chaos', n: '修羅',   hp: 3.0,  dmg: 2.5,  tokens: 6, cd: 0.55, rew: 2.4, pow: 40, col: '#ff7a5a' },
  { id: 'hell',  n: '煉獄',   hp: 5.5,  dmg: 4.0,  tokens: 8, cd: 0.42, rew: 4.0, pow: 62, col: '#e05cff' },
];

// ---- ステージの雰囲気 ----
const TH = {
  plains: {
    sky: { top: '#2a6fd0', hor: '#b4daf6', bot: '#d4e6f2', sun: '#fff0cc', cloud: '#ffffff', cover: 0.5 },
    sunDir: [0.62, 0.66, -0.3], sunCol: '#fff3dc', sunI: 3.0, hemi: ['#bcd8ff', '#5a6a3a', 0.95], fog: ['#bcdaf2', 80, 400], rim: '#a8c8ff', rimI: 0.42, env: 0.42, exposure: 1.0,
    ground: [['#3c7626', '#5a9a34', '#2c6020'], ['#7a5e3e', '#987850', '#5c462e'], ['#6f6a64', '#8d8780', '#55504b']],
    trees: ['broad', 'pine'], weather: 'petal', bgm: 'plains', scatter: '#4f8f2c',
  },
  desert: {
    sky: { top: '#3f4a98', hor: '#ffb478', bot: '#ffd2a0', sun: '#ffc27a', cloud: '#ffc8a0', cover: 0.56 },
    sunDir: [-0.7, 0.34, 0.5], sunCol: '#ffdcb4', sunI: 3.0, hemi: ['#ffe2c8', '#8a6044', 1.0], fog: ['#f2bc90', 80, 400], rim: '#ffc890', rimI: 0.5, env: 0.42, exposure: 0.98, sat: 0.98,
    ground: [['#c8a46c', '#dfc088', '#b08c58'], ['#a88454', '#bc9864', '#8e6c42'], ['#a0684a', '#b67c58', '#825038']],
    trees: ['dead', 'mesa'], weather: 'dust', bgm: 'desert', scatter: '#b89466',
  },
  snow: {
    sky: { top: '#5a7aa4', hor: '#dce8f2', bot: '#eef3f8', sun: '#ffffff', cloud: '#f2f6fb', cover: 0.33 },
    sunDir: [0.35, 0.55, -0.6], sunCol: '#eaf2ff', sunI: 2.5, hemi: ['#dce8ff', '#8a96a8', 1.25], fog: ['#dbe6f1', 45, 310], rim: '#cfe4ff', rimI: 0.55, env: 0.5, exposure: 0.95,
    ground: [['#e4ebf3', '#f6faff', '#ccd7e4'], ['#b4bfcc', '#cad4df', '#96a2b0'], ['#77859a', '#95a4b8', '#5b687a']],
    trees: ['snowpine'], weather: 'snow', bgm: 'snow', scatter: '#b9c8d8',
  },
  volcano: {
    sky: { top: '#170e12', hor: '#6e2616', bot: '#3c140e', sun: '#ff7a3a', cloud: '#3a2420', cover: 0.36 },
    sunDir: [0.25, 0.5, 0.72], sunCol: '#ff9c6c', sunI: 2.3, hemi: ['#804c40', '#3c1a10', 0.95], fog: ['#4c1c14', 45, 320], rim: '#ff6a30', rimI: 0.85, env: 0.35, exposure: 1.18,
    ground: [['#2c2624', '#3a3230', '#1f1a18'], ['#4a3428', '#5c4232', '#35251c'], ['#1a1616', '#2a2424', '#100d0d']],
    trees: ['burnt'], weather: 'ember', bgm: 'volcano', lava: true, scatter: '#3a2c28',
  },
  castle: {
    sky: { top: '#0a0f2e', hor: '#2c3c7c', bot: '#1a224a', sun: '#d6e2ff', cloud: '#2a3462', cover: 0.6, stars: 1, moon: true },
    sunDir: [-0.42, 0.62, 0.5], sunCol: '#c0ceff', sunI: 2.4, hemi: ['#6a7cc8', '#262a48', 1.45], fog: ['#1c2652', 55, 340], rim: '#8fa8ff', rimI: 0.85, env: 0.5, exposure: 1.3, sat: 1.12,
    ground: [['#274636', '#365a44', '#1c3428'], ['#565a6a', '#686d7e', '#444854'], ['#383b48', '#4a4e5a', '#2a2c36']],
    trees: ['sakura'], weather: 'firefly', bgm: 'castle', scatter: '#2a4a38',
  },
  lobby: {
    sky: { top: '#1a2264', hor: '#b26ebc', bot: '#3c2c64', sun: '#ffd0a0', cloud: '#7c5ca4', cover: 0.5, stars: 0.8 },
    sunDir: [0.55, 0.5, 0.65], sunCol: '#ffe8d0', sunI: 3.2, hemi: ['#aaaaff', '#3c3664', 1.5], fog: ['#4c3e84', 40, 230], rim: '#b0a0ff', rimI: 0.55, env: 0.7, exposure: 1.25,
    ground: [['#3c3c62', '#505080', '#2c2c4a'], ['#5c5c80', '#6e6e94', '#48486c'], ['#3c3c54', '#4e4e68', '#2c2c40']],
    trees: [], weather: 'firefly', bgm: 'title',
  },
};
export const THEMES = TH;

// ---- ステージ定義 ---- /*troops-scaled*/
// nodes: [x, z, 半径] / links: [a, b, 半幅] / bases: {n: ノード, t: 陣営(0味方,1敵), name, troops, main}
export const STAGES = [
  {
    id: 's1', no: '第一章', name: '翠嵐平原の戦い', lv: 1, theme: 'plains', size: 300, par: 420, koGoal: 400,
    intro: '覇星帝国の先鋒が国境の平原へ侵攻。蒼星軍は迎撃のため出陣する。',
    nodes: [[0, -105, 20], [0, -62, 13], [-62, -40, 15], [62, -40, 15], [0, -5, 22], [-70, 25, 15], [70, 25, 15], [0, 52, 14], [0, 102, 22], [-48, 76, 13], [48, 76, 13]],
    links: [[0, 1, 7], [1, 2, 6], [1, 3, 6], [1, 4, 8], [2, 5, 6], [3, 6, 6], [2, 4, 6], [3, 4, 6], [4, 5, 6], [4, 6, 6], [4, 7, 8], [5, 9, 6], [6, 10, 6], [9, 7, 6], [10, 7, 6], [7, 8, 8]],
    bases: [{ n: 0, t: 0, name: '蒼星軍本陣', troops: 138, main: true }, { n: 2, t: 0, name: '西の陣', troops: 69 }, { n: 3, t: 0, name: '東の陣', troops: 69 },
      { n: 5, t: 1, name: '西砦', troops: 83 }, { n: 6, t: 1, name: '東砦', troops: 83 }, { n: 9, t: 1, name: '北西の兵糧庫', troops: 69 }, { n: 10, t: 1, name: '北東の兵糧庫', troops: 69 },
      { n: 8, t: 1, name: '帝国軍本陣', troops: 161, main: true }],
    sealNeed: 3, start: 0, clash: [1, 7, 4],
    officers: [
      { t: 1, n: 5, ms: 'off_sword', order: 'hold' }, { t: 1, n: 6, ms: 'off_spear', order: 'hold' },
      { t: 1, n: 7, ms: 'off_sword', order: 'attack', squad: 10 },
      { t: 1, n: 8, boss: true, name: 'バルガ', title: '鉄壁の猛将', look: 'boss1', ms: 'boss_axe', wtype: 'axe', hp: 3.2 },
      { t: 0, n: 2, ally: 0, order: 'attack' }, { t: 0, n: 3, ally: 1, order: 'attack' },
    ],
    events: [
      { at: 3, say: ['軍師ミコト', '敵の砦を三つ落とせば、本陣を守る結界が解けます。まずは拠点の制圧を!'] },
      { at: 70, say: ['伝令', '敵の増援部隊が中央から迫っています!'], spawn: { n: 7, ms: 'off_spear', order: 'attack', squad: 10 }, mission: '敵増援の将を討て' },
      { cap: 2, say: ['軍師ミコト', 'あと一つです! 敵の動きが慌ただしくなってきました。'] },
    ],
  },
  {
    id: 's2', no: '第二章', name: '紅砂峡谷の戦い', lv: 7, theme: 'desert', size: 320, par: 480, koGoal: 600,
    intro: '補給路を断つべく、蒼星軍は夕陽に染まる峡谷へ。砂塵の中に盗賊将軍ザハルが潜む。',
    nodes: [[-108, -102, 19], [-68, -58, 12], [-110, -8, 13], [-18, -84, 13], [-24, -24, 16], [28, 12, 14], [-62, 46, 13], [62, -46, 13], [72, 42, 12], [28, 88, 13], [106, 102, 21]],
    links: [[0, 1, 7], [1, 2, 6], [1, 3, 6], [1, 4, 7], [2, 6, 6], [3, 7, 6], [4, 5, 7], [4, 6, 6], [4, 7, 6], [5, 8, 6], [5, 9, 6], [6, 9, 6], [7, 8, 6], [8, 10, 7], [9, 10, 7]],
    bases: [{ n: 0, t: 0, name: '蒼星軍本陣', troops: 138, main: true }, { n: 2, t: 0, name: '西の岩陣', troops: 69 }, { n: 3, t: 0, name: '南の岩陣', troops: 69 },
      { n: 5, t: 1, name: '中央関門', troops: 92 }, { n: 6, t: 1, name: '北西の砦', troops: 78 }, { n: 7, t: 1, name: '南東の砦', troops: 78 }, { n: 9, t: 1, name: '北の物見台', troops: 78 },
      { n: 10, t: 1, name: '砂賊の根城', troops: 161, main: true }],
    sealNeed: 3, start: 0, clash: [1, 5, 4],
    officers: [
      { t: 1, n: 5, ms: 'off_axe', wtype: 'axe', order: 'hold' }, { t: 1, n: 6, ms: 'off_sword', order: 'hold' }, { t: 1, n: 7, ms: 'off_spear', order: 'hold' }, { t: 1, n: 9, ms: 'off_sword', order: 'hold' },
      { t: 1, n: 8, ms: 'off_spear', order: 'attack', squad: 10 },
      { t: 1, n: 10, boss: true, name: 'ザハル', title: '砂塵の蠍', look: 'boss2', ms: 'boss_twin', wtype: 'twin', hp: 3.0 },
      { t: 0, n: 2, ally: 0, order: 'attack' }, { t: 0, n: 3, ally: 1, order: 'attack' },
    ],
    events: [
      { at: 3, say: ['軍師ミコト', '峡谷は道が狭い分、敵も密集します。まとめて薙ぎ払ってください!'] },
      { at: 60, say: ['ザハル', 'クク…背後ががら空きだぞ、蒼星軍。'], spawn: { n: 7, ms: 'off_sword', order: 'attack', squad: 12 }, mission: '奇襲部隊の将を討て' },
      { at: 170, say: ['伝令', '敵の第二陣が出撃しました!'], spawn: { n: 9, ms: 'off_axe', wtype: 'axe', order: 'attack', squad: 12 } },
    ],
  },
  {
    id: 's3', no: '第三章', name: '霜牙雪原の戦い', lv: 14, theme: 'snow', size: 330, par: 520, koGoal: 700,
    intro: '凍てつく北の雪原。氷狼将ヴォルグが氷湖の砦を拠点に、蒼星軍を包囲せんとする。',
    nodes: [[0, -118, 20], [-46, -82, 12], [46, -82, 12], [-92, -46, 14], [92, -46, 14], [-108, 16, 13], [108, 16, 13], [-72, 72, 14], [72, 72, 14], [0, 86, 13], [0, 128, 21], [0, 0, 16]],
    links: [[0, 1, 7], [0, 2, 7], [1, 2, 5], [1, 3, 6], [2, 4, 6], [3, 5, 6], [4, 6, 6], [5, 7, 6], [6, 8, 6], [7, 9, 6], [8, 9, 6], [9, 10, 8], [3, 11, 4.5], [4, 11, 4.5], [11, 9, 4.5]],
    bases: [{ n: 0, t: 0, name: '蒼星軍本陣', troops: 138, main: true }, { n: 3, t: 0, name: '南西の陣', troops: 69 }, { n: 4, t: 0, name: '南東の陣', troops: 69 },
      { n: 11, t: 1, name: '氷湖の砦', troops: 101 }, { n: 5, t: 1, name: '西の氷壁', troops: 83 }, { n: 6, t: 1, name: '東の氷壁', troops: 83 }, { n: 7, t: 1, name: '北西の狼砦', troops: 83 }, { n: 8, t: 1, name: '北東の狼砦', troops: 83 },
      { n: 10, t: 1, name: '氷狼軍本陣', troops: 175, main: true }],
    sealNeed: 4, start: 0, clash: [1, 11, 3],
    officers: [
      { t: 1, n: 11, ms: 'off_axe', wtype: 'axe', order: 'hold', hp: 1.3 }, { t: 1, n: 5, ms: 'off_spear', order: 'hold' }, { t: 1, n: 6, ms: 'off_sword', order: 'hold' },
      { t: 1, n: 7, ms: 'off_sword', order: 'hold' }, { t: 1, n: 8, ms: 'off_spear', order: 'hold' }, { t: 1, n: 9, ms: 'off_axe', wtype: 'axe', order: 'attack', squad: 12 },
      { t: 1, n: 10, boss: true, name: 'ヴォルグ', title: '氷狼将', look: 'boss3', ms: 'boss_spear', wtype: 'spear', hp: 3.4 },
      { t: 0, n: 3, ally: 0, order: 'attack' }, { t: 0, n: 4, ally: 1, order: 'attack' },
    ],
    events: [
      { at: 3, say: ['軍師ミコト', '中央の氷湖の砦を押さえれば、どの戦線にもすぐ駆けつけられます。'] },
      { at: 80, say: ['ヴォルグ', '群れで狩れ。獲物は弱ったところから喰らうものだ。'], spawn: { n: 5, ms: 'off_sword', order: 'attack', squad: 12 }, mission: '西から迫る狩猟隊を討て' },
      { at: 200, say: ['伝令', '東からも敵の別働隊です!'], spawn: { n: 6, ms: 'off_spear', order: 'attack', squad: 12 } },
    ],
  },
  {
    id: 's4', no: '第四章', name: '焔獄火山の戦い', lv: 22, theme: 'volcano', size: 330, par: 560, koGoal: 800,
    intro: '帝国の兵器工廠がある火山地帯。炎獄将イグナスの溶岩兵団が三方から押し寄せる。',
    nodes: [[0, -122, 20], [-72, -76, 13], [0, -70, 14], [72, -76, 13], [-96, -10, 13], [0, -10, 16], [96, -10, 13], [-60, 56, 13], [60, 56, 13], [0, 62, 14], [0, 118, 22]],
    links: [[0, 1, 6], [0, 2, 7], [0, 3, 6], [1, 2, 5], [2, 3, 5], [1, 4, 6], [2, 5, 7], [3, 6, 6], [4, 5, 5], [5, 6, 5], [4, 7, 6], [6, 8, 6], [5, 9, 7], [7, 9, 5], [8, 9, 5], [9, 10, 8]],
    bases: [{ n: 0, t: 0, name: '蒼星軍本陣', troops: 147, main: true }, { n: 1, t: 0, name: '左翼の陣', troops: 69 }, { n: 2, t: 0, name: '中央の陣', troops: 74 }, { n: 3, t: 0, name: '右翼の陣', troops: 69 },
      { n: 4, t: 1, name: '西の溶鉱炉', troops: 92 }, { n: 5, t: 1, name: '中央工廠', troops: 106 }, { n: 6, t: 1, name: '東の溶鉱炉', troops: 92 }, { n: 7, t: 1, name: '北西の火口砦', troops: 87 }, { n: 8, t: 1, name: '北東の火口砦', troops: 87 },
      { n: 10, t: 1, name: '炎獄の玉座', troops: 184, main: true }],
    sealNeed: 4, start: 0, clash: [2, 5, 5],
    officers: [
      { t: 1, n: 4, ms: 'off_axe', wtype: 'axe', order: 'hold' }, { t: 1, n: 5, ms: 'off_sword', order: 'hold', hp: 1.3 }, { t: 1, n: 6, ms: 'off_spear', order: 'hold' },
      { t: 1, n: 7, ms: 'off_spear', order: 'hold' }, { t: 1, n: 8, ms: 'off_axe', wtype: 'axe', order: 'hold' },
      { t: 1, n: 9, ms: 'off_sword', order: 'attack', squad: 12 }, { t: 1, n: 9, ms: 'off_spear', order: 'attack', squad: 12 },
      { t: 1, n: 10, boss: true, name: 'イグナス', title: '炎獄将', look: 'boss4', ms: 'boss_hammer', wtype: 'hammer', hp: 3.8 },
      { t: 0, n: 1, ally: 0, order: 'attack' }, { t: 0, n: 3, ally: 1, order: 'attack' },
    ],
    events: [
      { at: 3, say: ['軍師ミコト', '敵は三方から同時に攻めてきます。本陣を落とされぬよう、戦況図に注意を!'] },
      { at: 90, say: ['イグナス', '灰になるまで焼き尽くせ!'], spawn: { n: 5, ms: 'off_axe', wtype: 'axe', order: 'attack', squad: 14 }, mission: '中央突破を図る敵将を討て' },
      { at: 210, say: ['伝令', '敵の決死隊が本陣を目指しています!'], spawn: { n: 9, ms: 'off_sword', order: 'attack', squad: 14 } },
    ],
  },
  {
    id: 's5', no: '終章', name: '星墜つる帝城', lv: 30, theme: 'castle', size: 340, par: 620, koGoal: 900,
    intro: '決戦の夜。星降る帝城の最奥で、覇星帝ゼノヴァが待ち受ける。',
    nodes: [[0, -128, 20], [0, -82, 14], [-66, -72, 14], [66, -72, 14], [-102, -16, 13], [0, -26, 18], [102, -16, 13], [-62, 36, 14], [62, 36, 14], [0, 46, 14], [0, 86, 12], [0, 128, 23]],
    links: [[0, 1, 8], [1, 2, 6], [1, 3, 6], [1, 5, 7], [2, 4, 6], [3, 6, 6], [2, 5, 5], [3, 5, 5], [4, 5, 5], [5, 6, 5], [4, 7, 6], [6, 8, 6], [5, 9, 7], [7, 9, 5], [8, 9, 5], [9, 10, 7], [10, 11, 8], [7, 10, 5], [8, 10, 5]],
    bases: [{ n: 0, t: 0, name: '蒼星軍本陣', troops: 152, main: true }, { n: 2, t: 0, name: '西の外郭', troops: 74 }, { n: 3, t: 0, name: '東の外郭', troops: 74 },
      { n: 5, t: 1, name: '中央広場', troops: 115 }, { n: 4, t: 1, name: '西の櫓', troops: 92 }, { n: 6, t: 1, name: '東の櫓', troops: 92 }, { n: 7, t: 1, name: '西の兵舎', troops: 97 }, { n: 8, t: 1, name: '東の兵舎', troops: 97 }, { n: 9, t: 1, name: '内門', troops: 106 },
      { n: 11, t: 1, name: '覇星の玉座', troops: 207, main: true }],
    sealNeed: 5, start: 0, clash: [1, 9, 5],
    officers: [
      { t: 1, n: 5, ms: 'off_axe', wtype: 'axe', order: 'hold', hp: 1.3 }, { t: 1, n: 4, ms: 'off_spear', order: 'hold' }, { t: 1, n: 6, ms: 'off_sword', order: 'hold' },
      { t: 1, n: 7, ms: 'off_sword', order: 'hold' }, { t: 1, n: 8, ms: 'off_spear', order: 'hold' }, { t: 1, n: 9, ms: 'off_axe', wtype: 'axe', order: 'hold', hp: 1.4 },
      { t: 1, n: 10, ms: 'off_sword', order: 'attack', squad: 14 }, { t: 1, n: 10, ms: 'off_spear', order: 'attack', squad: 14 },
      { t: 1, n: 11, boss: true, name: 'ゼノヴァ', title: '覇星帝', look: 'boss5', ms: 'boss_final', wtype: 'scythe', hp: 4.6 },
      { t: 0, n: 2, ally: 0, order: 'attack' }, { t: 0, n: 3, ally: 1, order: 'attack' },
    ],
    events: [
      { at: 3, say: ['軍師ミコト', 'これが最後の戦いです。五つの拠点を落とし、玉座への道を開いてください!'] },
      { at: 75, say: ['ゼノヴァ', '星は墜ちる定め。貴様らもまた、我が覇道の礎となれ。'], spawn: { n: 9, ms: 'off_axe', wtype: 'axe', order: 'attack', squad: 14 }, mission: '親衛隊長を討て' },
      { at: 190, say: ['伝令', '帝国親衛隊が出撃! 本陣が狙われています!'], spawn: { n: 10, ms: 'off_sword', order: 'attack', squad: 16 } },
      { at: 320, say: ['伝令', '敵の総攻撃です!'], spawn: { n: 10, ms: 'off_spear', order: 'attack', squad: 16 } },
    ],
  },
];
export const ENDLESS = {
  id: 'endless', no: '特別', name: '無限戦場・千人組手', lv: 1, theme: 'castle', size: 240, par: 9999, koGoal: 9999, endless: true,
  intro: '果てなき敵の波。力尽きるまで戦い、撃破数を競え。',
  nodes: [[0, 0, 52], [0, -78, 11], [78, 0, 11], [0, 78, 11], [-78, 0, 11]],
  links: [[0, 1, 9], [0, 2, 9], [0, 3, 9], [0, 4, 9]],
  bases: [], sealNeed: 0, start: 0, officers: [], events: [{ at: 2, say: ['軍師ミコト', '敵は四方の門から無限に湧きます。どこまで戦えるか…ご武運を!'] }],
};
export const STAGE = Object.fromEntries([...STAGES, ENDLESS].map((s) => [s.id, s]));

// ---- 武器 ----
export const RARITY = [null,
  { n: '並', col: '#b8bcc4', star: '★' }, { n: '良', col: '#7ee08a', star: '★★' }, { n: '逸品', col: '#6ab8ff', star: '★★★' },
  { n: '秘宝', col: '#c98bff', star: '★★★★' }, { n: '至宝', col: '#ffc24a', star: '★★★★★' }, { n: '神器', col: '#ff5a7a', star: '✦神器✦' }];
const RAR_ATK = [0, 0.8, 1.0, 1.25, 1.55, 1.9, 2.5];
export const RAR_MAXLV = [0, 5, 8, 10, 12, 15, 20];
export const WEAPON_NAMES = {
  sword: ['鉄刀', '業物「赤銅」', '名刀「暁」', '宝刀「紅蓮牙」', '神刀「天焔」', '神器「日輪」'],
  spear: ['素槍', '鍛槍「霜柱」', '名槍「氷雨」', '宝槍「雪華」', '神槍「白虹」', '神器「月氷」'],
  twin: ['双小太刀', '双刃「紫電」', '名刃「雷切」', '宝刃「鳴神」', '神刃「霹靂」', '神器「天雷」'],
  hammer: ['木槌', '鉄槌「岩砕」', '名槌「地鳴」', '宝槌「金剛」', '神槌「大地」', '神器「崑崙」'],
  fan: ['舞扇', '鉄扇「青嵐」', '名扇「疾風」', '宝扇「翠嵐」', '神扇「天つ風」', '神器「鳳凰」'],
  scythe: ['草刈鎌', '大鎌「宵闇」', '名鎌「朧」', '宝鎌「黄泉路」', '神鎌「冥月」', '神器「常夜」'],
};
export const TRAITS = {
  atk:    { n: '剛力', d: '攻撃力 +{v}%', min: 4, max: 30 },
  hp:     { n: '体力', d: '体力 +{v}%', min: 6, max: 45 },
  def:    { n: '堅守', d: '防御力 +{v}%', min: 8, max: 60 },
  spd:    { n: '疾風', d: '移動速度 +{v}%', min: 3, max: 18 },
  aspd:   { n: '神速', d: '攻撃速度 +{v}%', min: 3, max: 18 },
  range:  { n: '大振', d: '攻撃範囲 +{v}%', min: 4, max: 24 },
  sp:     { n: '練気', d: '奥義ゲージ増加 +{v}%', min: 10, max: 70 },
  rage:   { n: '闘魂', d: '覚醒ゲージ増加 +{v}%', min: 10, max: 70 },
  crit:   { n: '会心', d: '会心率 +{v}%', min: 4, max: 30 },
  steal:  { n: '吸生', d: '与ダメージの{v}%を回復', min: 0.4, max: 3, dec: 1 },
  elem:   { n: '属性', d: '属性効果 +{v}%', min: 10, max: 80 },
  charge: { n: '豪撃', d: 'チャージ攻撃 +{v}%', min: 6, max: 45 },
  musou:  { n: '極意', d: '奥義威力 +{v}%', min: 6, max: 50 },
  exp:    { n: '学習', d: '獲得経験値 +{v}%', min: 10, max: 80 },
  gold:   { n: '蓄財', d: '獲得金 +{v}%', min: 10, max: 100 },
  luck:   { n: '幸運', d: '武器の質 +{v}%', min: 8, max: 60 },
  regen:  { n: '活丹', d: '毎秒 体力{v}%回復', min: 0.2, max: 1.2, dec: 1 },
};
const TRAIT_KEYS = Object.keys(TRAITS);
export const traitText = (t) => TRAITS[t.k].d.replace('{v}', t.v);
export const weaponName = (w) => WEAPON_NAMES[w.type][w.rar - 1] + (w.lv > 0 ? ' +' + w.lv : '');
export const weaponAtk = (w) => Math.round(w.atk * (1 + 0.05 * w.lv));
export const weaponTier = (w) => (!w ? 0 : w.rar >= 5 ? 2 : w.rar >= 3 ? 1 : 0);
export const forgeCost = (w) => 80 * (w.lv + 1) * w.rar * w.rar;
export const sellPrice = (w) => Math.round(40 * w.rar * w.rar * (1 + w.lv * 0.5) + w.atk);
export const GACHA_COST = 1500;

let _uid = 0;
export function rollWeapon(type, power, luck = 0, minRar = 1, fixedRar = 0) {
  const p = clamp(power / 100, 0, 1), l = 1 + luck / 100;
  const w = [62 - 45 * p, 30, (8 + 30 * p) * l, (1.5 + 18 * p) * l, (0.2 + 6 * p * p) * l];
  let rar = fixedRar;
  if (!rar) {
    let tot = 0; for (const x of w) tot += x;
    let r = Math.random() * tot; rar = 1;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { rar = i + 1; break; } }
    rar = Math.max(rar, minRar);
  }
  const atk = Math.round((10 + power * 1.5) * RAR_ATK[rar] * (0.92 + Math.random() * 0.16));
  const nTr = [0, Math.random() < 0.4 ? 1 : 0, 1, 2, 3, 4, 5][rar];
  const keys = TRAIT_KEYS.slice(), traits = [];
  for (let i = 0; i < nTr; i++) {
    const k = keys.splice((Math.random() * keys.length) | 0, 1)[0], T = TRAITS[k];
    const q = clamp((0.15 + 0.6 * clamp(power / 110, 0, 1)) * (0.6 + 0.6 * Math.random()) + (rar - 3) * 0.07, 0.05, 1);
    const v = lerp(T.min, T.max, q);
    traits.push({ k, v: T.dec ? Math.round(v * 10) / 10 : Math.round(v) });
  }
  return { uid: 'w' + Date.now().toString(36) + (_uid++).toString(36) + ((Math.random() * 1296) | 0).toString(36), type, rar, lv: 0, atk, traits, isNew: true };
}
export const starterWeapon = (type) => ({ uid: 'w0_' + type, type, rar: 1, lv: 0, atk: 10, traits: [] });

// ---- 成長 ----
export const MAX_LV = 99;
export const expNeed = (lv) => Math.round(80 + 40 * lv + 6 * lv * lv);
export const maxNormals = (lv) => (lv >= 7 ? 6 : lv >= 3 ? 5 : 4);
export const maxCharges = (lv) => (lv >= 10 ? 6 : lv >= 5 ? 5 : 4);

// セーブデータから武将の最終能力値を算出
export function calcStats(save, heroId) {
  const h = HERO[heroId], hs = save.heroes[heroId] || { lv: 1 }, lv = hs.lv;
  const w = save.weapons.find((x) => x.uid === hs.weapon) || null;
  const tr = {}; for (const k of TRAIT_KEYS) tr[k] = 0;
  if (w) for (const t of w.traits) tr[t.k] += t.v;
  const b = h.base;
  return {
    lv, weapon: w, tier: weaponTier(w),
    hp: Math.round(b.hp * (1 + 0.045 * (lv - 1)) * (1 + tr.hp / 100)),
    atk: Math.round((b.atk + 2.4 * (lv - 1) * (b.atk / 34) + (w ? weaponAtk(w) : 0)) * (1 + tr.atk / 100)),
    def: Math.round((b.def + 1.0 * (lv - 1)) * (1 + tr.def / 100)),
    spd: b.spd * (1 + tr.spd / 100), aspd: b.aspd * (1 + tr.aspd / 100), range: 1 + tr.range / 100,
    spGain: 1 + tr.sp / 100, rageGain: 1 + tr.rage / 100, crit: 5 + tr.crit, steal: (h.steal || 0) + tr.steal,
    elem: 1 + tr.elem / 100, charge: 1 + tr.charge / 100, musou: 1 + tr.musou / 100,
    exp: 1 + tr.exp / 100, gold: 1 + tr.gold / 100, luck: tr.luck, regen: tr.regen,
    maxN: maxNormals(lv), maxC: maxCharges(lv),
  };
}

// ---- 実績 ----
export const ACHIEVEMENTS = [
  { id: 'first', n: '初陣', d: 'はじめて合戦に勝利する', gold: 300, t: (S) => S.stats.wins >= 1 },
  { id: 'ko500', n: '五百人斬り', d: '一度の合戦で500人撃破', gold: 500, t: (S) => S.stats.maxKO >= 500 },
  { id: 'ko1000', n: '一騎当千', d: '一度の合戦で1000人撃破', gold: 1500, t: (S) => S.stats.maxKO >= 1000 },
  { id: 'ko2000', n: '万夫不当', d: '一度の合戦で2000人撃破', gold: 5000, t: (S) => S.stats.maxKO >= 2000 },
  { id: 'tot10k', n: '戦場の鬼', d: '累計10,000人撃破', gold: 2000, t: (S) => S.stats.totalKO >= 10000 },
  { id: 'tot100k', n: '修羅の化身', d: '累計100,000人撃破', gold: 20000, t: (S) => S.stats.totalKO >= 100000 },
  { id: 'combo300', n: '連撃の使い手', d: '300連撃を達成', gold: 600, t: (S) => S.stats.maxCombo >= 300 },
  { id: 'combo1000', n: '千連撃', d: '1000連撃を達成', gold: 3000, t: (S) => S.stats.maxCombo >= 1000 },
  { id: 'off50', n: '将星墜とし', d: '敵将を累計50人撃破', gold: 1500, t: (S) => S.stats.officers >= 50 },
  { id: 'srank', n: '完全勝利', d: 'Sランクを獲得する', gold: 800, t: (S) => Object.values(S.stages).some((d) => Object.values(d).some((r) => r.rank === 'S')) },
  { id: 'clearAll', n: '天下泰平', d: '全ての章をクリア', gold: 3000, t: (S) => STAGES.every((s) => S.stages[s.id] && Object.values(S.stages[s.id]).some((r) => r.clear)) },
  { id: 'srankAll', n: '常勝無敗', d: '全ての章でSランク', gold: 8000, t: (S) => STAGES.every((s) => S.stages[s.id] && Object.values(S.stages[s.id]).some((r) => r.rank === 'S')) },
  { id: 'chaos', n: '修羅の道', d: '難易度「修羅」以上でクリア', gold: 4000, t: (S) => Object.values(S.stages).some((d) => (d.chaos && d.chaos.clear) || (d.hell && d.hell.clear)) },
  { id: 'hell', n: '煉獄踏破', d: '難易度「煉獄」で終章をクリア', gold: 30000, t: (S) => !!(S.stages.s5 && S.stages.s5.hell && S.stages.s5.hell.clear) },
  { id: 'heroes', n: '六星集結', d: '全ての武将を解放', gold: 2000, t: (S) => S.unlockedHeroes.length >= HEROES.length },
  { id: 'lv30', n: '歴戦の将', d: '武将をLv30にする', gold: 1500, t: (S) => Object.values(S.heroes).some((h) => h.lv >= 30) },
  { id: 'lv60', n: '名将', d: '武将をLv60にする', gold: 6000, t: (S) => Object.values(S.heroes).some((h) => h.lv >= 60) },
  { id: 'lv99', n: '武の極致', d: '武将をLv99にする', gold: 30000, t: (S) => Object.values(S.heroes).some((h) => h.lv >= 99) },
  { id: 'rar5', n: '至宝の主', d: '★5の武器を入手', gold: 3000, t: (S) => S.weapons.some((w) => w.rar >= 5) },
  { id: 'rar6', n: '神器の継承者', d: '神器を入手', gold: 10000, t: (S) => S.weapons.some((w) => w.rar >= 6) },
  { id: 'forge10', n: '鍛冶の極み', d: '武器を+10まで鍛える', gold: 3000, t: (S) => S.weapons.some((w) => w.lv >= 10) },
  { id: 'perfect', n: '見切りの達人', d: '見切り(直前回避)を累計30回', gold: 1500, t: (S) => S.stats.perfect >= 30 },
  { id: 'nodmg', n: '無傷の勝利', d: '被ダメージ1割以下で勝利', gold: 2500, t: (S) => S.stats.flawless >= 1 },
  { id: 'end10', n: '百戦錬磨', d: '無限戦場で第10波に到達', gold: 2000, t: (S) => S.endless.wave >= 10 },
  { id: 'end25', n: '不死身', d: '無限戦場で第25波に到達', gold: 12000, t: (S) => S.endless.wave >= 25 },
  { id: 'rich', n: '大富豪', d: '所持金50,000を達成', gold: 0, t: (S) => S.gold >= 50000 },
];

// 武将の解放条件(章クリア)
export const UNLOCKS = { s1: 'gandou', s2: 'fuuka', s3: 'yomi' };
export const START_HEROES = ['reiga', 'setsuna', 'raika'];
