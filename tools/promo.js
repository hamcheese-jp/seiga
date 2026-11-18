// 9:16 の紹介動画を作る(ゲームの画面を1コマずつ進めて縦長に描き、WebCodecs で mp4 に書き出す)
//   使い方: dev サーバーでゲームを開き、開発者ツール等から
//     const m = await import('/tools/promo.js'); await m.makePromo();
//   → dev/promo/seiga_promo.mp4 に保存(tools/serve.mjs の /__save 経由)
//   音楽: 魔王魂(CC BY 4.0)/ 効果音: Kenney(CC0)
import { Muxer, ArrayBufferTarget } from './lib/mp4-muxer.mjs';
import { GFX } from '../src/gfx.js';
import { Audio } from '../src/audio.js';
import { UI } from '../src/ui.js';
import { HERO, ELEMENTS } from '../src/data.js';

const W = 1080, H = 1920, FPS = 30, SR = 48000;
const SEG = { title: 3.2, heroes: 6.6, battle: 13, feat: 5, end: 3.2 };
const T0 = { title: 0 }; { let t = 0; for (const k of Object.keys(SEG)) { T0[k] = t; t += SEG[k]; } T0.total = t; }
const HEROES = ['reiga', 'setsuna', 'raika', 'gandou', 'fuuka', 'yomi'];
const FONT = '"Yu Mincho","YuMincho","Hiragino Mincho ProN","Noto Serif JP",serif';
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const log = (s) => { console.log('[promo]', s); window.__promoLog = (window.__promoLog || '') + s + '\n'; };

async function img(url) { const r = await fetch(url); return createImageBitmap(await r.blob()); }

// ---- 文字(縁取り付き) ----
function text(g, s, x, y, size, col = '#fff', opt = {}) {
  g.save();
  g.font = `${opt.weight || 900} ${size}px ${FONT}`; g.textAlign = opt.align || 'center'; g.textBaseline = 'middle';
  g.globalAlpha = opt.alpha ?? 1;
  if (opt.glow) { g.shadowColor = opt.glow; g.shadowBlur = size * 0.5; }
  g.lineJoin = 'round'; g.lineWidth = size * 0.14; g.strokeStyle = opt.stroke || 'rgba(0,0,0,0.85)'; g.strokeText(s, x, y);
  g.shadowBlur = 0; g.fillStyle = col; g.fillText(s, x, y);
  g.restore();
}
function vtext(g, s, x, y, size, col, opt = {}) { [...s].forEach((c, i) => text(g, c, x, y + i * size * 1.02, size, col, opt)); }

// ---- 星空 ----
const STARS = Array.from({ length: 260 }, () => [Math.random() * W, Math.random() * H, Math.random() * 2.4 + 0.4, Math.random() * 6]);
function stars(g, t) {
  g.fillStyle = '#05060f'; g.fillRect(0, 0, W, H);
  const gr = g.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, H * 0.7); gr.addColorStop(0, 'rgba(40,60,140,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (const [x, y, r, p] of STARS) { g.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.6 + p)); g.fillStyle = '#dfe8ff'; g.beginPath(); g.arc(x, (y + t * 14) % H, r, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}

// ---- 1: タイトル ----
function drawTitle(g, t, logo) {
  stars(g, t);
  // 赤い星が近づく
  const k = ease(t / 2.2), r = 30 + 260 * k;
  const gr = g.createRadialGradient(W / 2, H * 0.32, 0, W / 2, H * 0.32, r * 2.2);
  gr.addColorStop(0, 'rgba(255,240,230,1)'); gr.addColorStop(0.18, 'rgba(255,80,60,0.95)'); gr.addColorStop(0.5, 'rgba(160,10,30,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  text(g, '空に、七つ目の星が現れた——', W / 2, H * 0.58, 56, '#ffd9cf', { alpha: Math.min(1, t * 1.5) * (t < 2.3 ? 1 : Math.max(0, 1 - (t - 2.3) * 3)) });
  if (t > 2.1) logo(g, t - 2.1);
}
// ロゴ
function drawLogo(g, a, y = H * 0.44, s = 1) {
  const k = ease(a * 2);
  text(g, '蒼星のセイガ', W / 2, y, 150 * s * (1.25 - 0.25 * k), '#f6e7b8', { alpha: Math.min(1, a * 3), glow: '#5aa0ff', stroke: '#1a1030' });
  text(g, 'SEIGA — Fangs of the Azure Star', W / 2, y + 120 * s, 40 * s, '#bcd2ff', { alpha: Math.min(1, a * 2), weight: 600 });
}

// ---- 2: 星牙使いのカットイン ----
function drawHero(g, t, id, im) {
  const h = HERO[id], E = ELEMENTS[h.elem], col = E.css || '#ff6a3a';
  // 背景: 属性色のグラデーションと集中線
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#07070d'); gr.addColorStop(0.5, col); gr.addColorStop(1, '#07070d');
  g.fillStyle = gr; g.globalAlpha = 0.55; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  g.save(); g.translate(W / 2, H * 0.45);
  for (let i = 0; i < 70; i++) { const a = i / 70 * Math.PI * 2 + i * 0.37, l = 900 + ((i * 97) % 500); g.strokeStyle = 'rgba(255,255,255,' + (0.05 + ((i * 13) % 10) / 90) + ')'; g.lineWidth = 2 + (i % 4); g.beginPath(); g.moveTo(Math.cos(a) * 260, Math.sin(a) * 260); g.lineTo(Math.cos(a) * l * 1.6, Math.sin(a) * l * 1.6); g.stroke(); }
  g.restore();
  // 属性の大きな漢字
  const kan = E.n || '星';
  text(g, kan, W * 0.72, H * 0.3, 520, 'rgba(255,255,255,0.10)', { stroke: 'rgba(0,0,0,0)', weight: 900 });
  // 決めポーズ(少しずつ寄る)
  const z = 1.18 + t * 0.12, sw = W * z, sh = sw * (im.height / im.width), dx = (W - sw) / 2 + (1 - ease(t * 3)) * -220;
  g.drawImage(im, dx, H * 0.47 - sh / 2, sw, sh);
  // 名前(縦書き)と二つ名
  const a = ease(t * 3);
  vtext(g, h.name, W * 0.86, H * 0.55, 130, '#ffffff', { alpha: a, glow: col });
  text(g, h.title || '', W * 0.86 - 10, H * 0.53 - 110, 44, '#ffe9a8', { alpha: a });
}

// ---- 4: 特徴 ----
const FEATS = [['一騎当千', '大軍をひとりで薙ぎ払え'], ['最大4人で協力', '友だちと部屋番号ですぐ共闘'], ['4対4の対戦', '知らない人ともランダム対戦'], ['武器の強化と合成', '自分だけの一振りを鍛え上げる']];
function drawFeat(g, t, bg) {
  g.drawImage(bg, 0, 0, W, H); g.fillStyle = 'rgba(5,8,20,0.62)'; g.fillRect(0, 0, W, H);
  FEATS.forEach(([a, b], i) => {
    const k = ease((t - i * 0.55) * 2.5), y = H * 0.25 + i * 300;
    if (k <= 0) return;
    g.save(); g.globalAlpha = k; g.fillStyle = 'rgba(255,210,120,0.16)'; g.fillRect(90 - (1 - k) * 200, y - 95, W - 180, 190); g.restore();
    text(g, a, W / 2 - (1 - k) * 200, y - 28, 86, '#ffe3a0', { alpha: k, glow: '#ff9a3a' });
    text(g, b, W / 2 - (1 - k) * 200, y + 52, 44, '#e8eeff', { alpha: k, weight: 700 });
  });
}
// ---- 5: 締め ----
function drawEnd(g, t, bg) {
  g.drawImage(bg, 0, 0, W, H); g.fillStyle = `rgba(4,6,16,${0.6 + 0.25 * ease(t)})`; g.fillRect(0, 0, W, H);
  drawLogo(g, t, H * 0.38);
  const a = ease((t - 0.5) * 2);
  text(g, 'ブラウザで今すぐ無料プレイ', W / 2, H * 0.58, 70, '#ffffff', { alpha: a, glow: '#5aa0ff' });
  text(g, 'hamcheese-jp.github.io/seiga', W / 2, H * 0.65, 50, '#9fd0ff', { alpha: a, weight: 700 });
  text(g, 'スマホ・PC対応 ／ インストール不要', W / 2, H * 0.71, 40, '#d8e2ff', { alpha: a, weight: 600 });
  text(g, '音楽:魔王魂 ／ 効果音:Kenney', W / 2, H * 0.95, 30, 'rgba(255,255,255,0.6)', { alpha: a, weight: 500, stroke: 'rgba(0,0,0,0.4)' });
}

// ---- 戦闘: プレイヤーを台本どおりに動かす ----
function scriptInput(p) {
  const inp = { mx: 0, my: 0, cy: 0, held: { a: false, c: false, d: false, s: false, r: false }, q: {}, consume(k) { if (this.q[k]) { this.q[k] = 0; return true; } return false; }, takeSwipe() { return null; } };
  p.inp = inp; return inp;
}

export async function makePromo({ hero = 'reiga', stage = 's1', save = 'dev/promo/seiga_promo.mp4', mbps = 12 } = {}) {
  const App = UI.app;
  log('準備中');
  // 画像
  const acts = {}; for (const id of HEROES) acts[id] = await img(`/assets/portraits/${id}_act.webp`);
  // ゲームの描画を縦長 1080x1920 に固定し、自前でコマを進める
  window.requestAnimationFrame = () => 0;
  Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => W });
  Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => H });
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => 1 });
  GFX.q.pr = 1; GFX.resize();
  App.pause = () => {};
  // 効果音の記録(あとで音声トラックに並べる)
  const sfxLog = []; let clock = 0;
  const origSfx = Audio.sfx.bind(Audio); Audio.sfx = (n, p = 1) => { sfxLog.push([clock, n, p]); return origSfx(n, p); };
  Audio.resume();
  // 戦闘を始める
  UI.sel.hero = hero;
  App.startBattle({ ...UI.sel, stage, hero, diff: 0 });
  await new Promise((r) => { const iv = setInterval(() => { if (App.battle) { clearInterval(iv); r(); } }, 200); });
  const B = App.battle, p = B.player; p.maxHp = p.hp = 1e7;
  const inp = scriptInput(p); p.remote = true;   // 操作は台本から(向きは世界座標で指定)
  // 近くの敵兵を探す
  const nearestFoe = () => { let best = null, bd = 1e9; const L = B.horde.list; for (let i = 0; i < B.horde.n; i++) { const s = L[i]; if (!s.alive || s.team === 0) continue; const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; best = s; } } return best ? { s: best, d: Math.sqrt(bd) } : null; };
  let tms = performance.now();
  const step = (n = 1) => { for (let i = 0; i < n; i++) { tms += 1000 / FPS; App.loop(tms); } };
  step(240);   // 開幕の演出を飛ばして兵がぶつかり合うところまで
  { const f = nearestFoe(); if (f) { const dx = f.s.x - p.x, dz = f.s.z - p.z, l = Math.hypot(dx, dz) || 1; p.x = f.s.x - dx / l * 5; p.z = f.s.z - dz / l * 5; } }   // 敵の群れの手前へ
  log('戦闘準備完了 KO=' + B.ko);

  // 出力
  const comp = new OffscreenCanvas(W, H), g = comp.getContext('2d');
  const chunks = { v: 0, a: 0 };
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: FPS }, audio: { codec: 'aac', sampleRate: SR, numberOfChannels: 2 }, fastStart: 'in-memory' });
  const venc = new VideoEncoder({ output: (c, m) => { muxer.addVideoChunk(c, m); chunks.v++; }, error: (e) => log('映像エラー ' + e.message) });
  venc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: mbps * 1e6, framerate: FPS });
  const canvas3d = GFX.renderer.domElement;
  const lastGame = new OffscreenCanvas(W, H), lg = lastGame.getContext('2d');
  const N = Math.round(T0.total * FPS);
  let koStart = B.ko;
  for (let i = 0; i < N; i++) {
    const t = i / FPS; clock = t;
    g.globalAlpha = 1; g.shadowBlur = 0;
    if (t < T0.heroes) drawTitle(g, t, (gg, a) => drawLogo(gg, a));
    else if (t < T0.battle) { const u = t - T0.heroes, k = Math.floor(u / (SEG.heroes / HEROES.length)), id = HEROES[Math.min(HEROES.length - 1, k)]; stars(g, t); drawHero(g, u - k * (SEG.heroes / HEROES.length), id, acts[id]); }
    else if (t < T0.feat) {
      const u = t - T0.battle;
      // 台本: 前進しながら連撃、途中で奥義と覚醒
      { const f = nearestFoe(); if (f && f.d > 2.0) { const dx = f.s.x - p.x, dz = f.s.z - p.z, l = Math.hypot(dx, dz); inp.mx = -dx / l; inp.my = dz / l; } else { inp.mx = inp.my = 0; } }
      { const f = nearestFoe(); const near = f && f.d < 3.8; inp.held.a = near; if (near && i % 9 === 0) inp.q.c = 1; }
      if (Math.abs(u - 4.5) < 0.02) { p.sp = 100; inp.q.s = 1; }
      if (Math.abs(u - 8.6) < 0.02) { p.rage = 100; inp.q.r = 1; }
      if (Math.abs(u - 10.4) < 0.02) { p.sp = 100; inp.q.s = 1; }
      step(1);
      g.drawImage(canvas3d, 0, 0, W, H);
      lg.drawImage(canvas3d, 0, 0, W, H);
      // 見出しと撃破数
      const cap = u < 4 ? '大軍を、ひとりで薙ぎ払え' : u < 8.4 ? '奥義で戦場を一掃' : '覚醒——限界を超えろ';
      const cu = u < 4 ? u : u < 8.4 ? u - 4 : u - 8.4;
      text(g, cap, W / 2, H * 0.12, 68, '#fff3d0', { alpha: Math.min(1, cu * 3), glow: '#ff7a2a' });
      const ko = B.ko - koStart;
      text(g, `${ko}`, W - 70, H * 0.82, 140, '#ffd56a', { align: 'right', glow: '#ff5a1a' });
      text(g, '人撃破', W - 70, H * 0.82 + 100, 52, '#ffffff', { align: 'right' });
    } else if (t < T0.end) drawFeat(g, t - T0.feat, lastGame);
    else drawEnd(g, t - T0.end, lastGame);
    // 区切りの白フラッシュ
    for (const k of ['heroes', 'battle', 'feat', 'end']) { const d = t - T0[k]; if (d >= 0 && d < 0.18) { g.fillStyle = `rgba(255,255,255,${0.7 * (1 - d / 0.18)})`; g.fillRect(0, 0, W, H); } }
    // 描画先から毎コマ画像を取り出して渡す(そのまま渡すと最初のコマが使い回されることがある)
    const bmp = await createImageBitmap(comp);
    const vf = new VideoFrame(bmp, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / FPS) }); bmp.close();
    venc.encode(vf, { keyFrame: i % (FPS * 2) === 0 }); vf.close();
    if (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    if (i % 60 === 0) log(`コマ ${i}/${N} 戦闘時間 ${B.time.toFixed(1)} 撃破 ${B.ko} 状態 ${B.state} mode ${App.mode}`);
  }
  await venc.flush();
  log('映像 完了 ' + chunks.v + ' コマ / 撃破 ' + (B.ko - koStart));

  // ---- 音声: BGM + 戦闘中の効果音(録音素材) ----
  const oc = new OfflineAudioContext(2, Math.ceil(T0.total * SR), SR);
  const dec = async (u) => oc.decodeAudioData(await (await fetch(u)).arrayBuffer());
  const bgmT = await dec('/bgm/title.mp3'), bgmB = await dec('/bgm/battle.mp3');
  const play = (buf, at, gain, off = 0, dur, fadeIn = 0.3, fadeOut = 0.6) => {
    const s = oc.createBufferSource(), gn = oc.createGain(); s.buffer = buf; s.connect(gn).connect(oc.destination);
    const end = at + (dur ?? buf.duration - off);
    gn.gain.setValueAtTime(0, at); gn.gain.linearRampToValueAtTime(gain, at + fadeIn); gn.gain.setValueAtTime(gain, Math.max(at + fadeIn, end - fadeOut)); gn.gain.linearRampToValueAtTime(0, end);
    s.start(at, off, dur ?? undefined);
  };
  play(bgmT, 0, 0.55, 0, T0.battle + 0.4, 0.2, 0.5);
  play(bgmB, T0.battle, 0.5, 0, T0.total - T0.battle, 0.15, 1.2);
  const sm = {}; for (const n of ['punchM0', 'punchM1', 'punchH0', 'punchH1', 'plateH0', 'metalH0', 'metalH1', 'knifeSlice', 'knifeSlice2', 'softH0', 'drawKnife1', 'cloth1']) sm[n] = await dec('/assets/sfx/' + n + '.wav');
  const pick = (...a) => sm[a[(Math.random() * a.length) | 0]];
  const MAP = { hit: () => [pick('knifeSlice', 'knifeSlice2'), pick('punchM0', 'punchM1')], hitH: () => [pick('punchH0', 'punchH1'), sm.plateH0], clash: () => [pick('metalH0', 'metalH1')], ko: () => [pick('punchH0', 'punchH1'), sm.softH0], special: () => [sm.drawKnife1], dodge: () => [sm.cloth1] };
  let lastAt = {};
  for (const [at, n] of sfxLog) {
    if (!MAP[n] || at < T0.battle || at > T0.feat) continue;
    if (at - (lastAt[n] || -1) < 0.07) continue; lastAt[n] = at;
    for (const b of MAP[n]()) { const s = oc.createBufferSource(), gn = oc.createGain(); s.buffer = b; s.playbackRate.value = 0.92 + Math.random() * 0.16; gn.gain.value = n === 'hit' ? 0.32 : 0.45; s.connect(gn).connect(oc.destination); s.start(at); }
  }
  // 場面転換の衝撃音
  for (const k of ['heroes', 'battle', 'feat', 'end']) { const s = oc.createBufferSource(), gn = oc.createGain(); s.buffer = sm.punchH0; gn.gain.value = 0.6; s.connect(gn).connect(oc.destination); s.start(T0[k]); }
  for (let k = 0; k < HEROES.length; k++) { const s = oc.createBufferSource(), gn = oc.createGain(); s.buffer = sm.knifeSlice; gn.gain.value = 0.35; s.connect(gn).connect(oc.destination); s.start(T0.heroes + k * SEG.heroes / HEROES.length); }
  const ab = await oc.startRendering();
  log('音声 合成完了');
  const aenc = new AudioEncoder({ output: (c, m) => { muxer.addAudioChunk(c, m); chunks.a++; }, error: (e) => log('音声エラー ' + e.message) });
  aenc.configure({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 192000 });
  const L = ab.getChannelData(0), R = ab.getChannelData(1), F = 1024;
  for (let o = 0; o < ab.length; o += F) {
    const n = Math.min(F, ab.length - o), data = new Float32Array(n * 2); data.set(L.subarray(o, o + n), 0); data.set(R.subarray(o, o + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(o / SR * 1e6), data });
    aenc.encode(ad); ad.close();
  }
  await aenc.flush();
  muxer.finalize();
  const buf = muxer.target.buffer;
  log(`書き出し ${Math.round(buf.byteLength / 1024 / 1024 * 10) / 10}MB 映像${chunks.v} 音声${chunks.a}`);
  const res = await fetch('/__save?f=' + encodeURIComponent(save), { method: 'POST', body: buf });
  log('保存 ' + (res.ok ? 'OK' : 'NG ' + res.status));
  return { size: buf.byteLength, frames: chunks.v };
}
