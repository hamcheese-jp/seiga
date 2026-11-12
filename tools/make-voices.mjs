// 声の生成: VOICEVOX(起動しておく)で src/voicedata.js の台詞を wav にして assets/voice/ へ保存
//   node tools/make-voices.mjs            … 無いものだけ作る
//   node tools/make-voices.mjs --force    … 全部作り直す
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICES, SAY_VOICE, SAY_GENERIC, vkey } from '../src/voicedata.js';
import { STAGES, ENDLESS } from '../src/data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets', 'voice');
const API = 'http://127.0.0.1:50021';
const force = process.argv.includes('--force');

// 台詞の種類ごとの感情づけ(emo: 使う感情スタイル / speed・pitch・into・vol: 話し方 / rise: 語尾へ向けて声を張る量 / pause: 読点の間)
const PROF = {
  atk: { emo: 'fight', speed: 1.14, pitch: 0.05, into: 1.75, vol: 1.35, rise: 0.22 },
  heavy: { emo: 'fight', speed: 1.02, pitch: 0.06, into: 1.85, vol: 1.4, rise: 0.3 },
  sp: { emo: 'hype', speed: 0.96, pitch: 0.05, into: 1.9, vol: 1.4, rise: 0.35, pause: 0.22 },
  awake: { emo: 'hype', speed: 0.98, pitch: 0.06, into: 1.85, vol: 1.4, rise: 0.32, pause: 0.2 },
  hurt: { emo: 'hurt', speed: 1.25, pitch: 0.09, into: 1.9, vol: 1.3, rise: -0.15 },
  dead: { emo: 'dead', speed: 0.85, pitch: 0.02, into: 1.6, vol: 1.2, rise: -0.3 },
  start: { emo: 'fight', speed: 1.05, pitch: 0.03, into: 1.55, vol: 1.25, rise: 0.15 },
  ko: { emo: 'joy', speed: 1.04, pitch: 0.04, into: 1.6, vol: 1.25, rise: 0.12, pause: 0.12 },
  back: { emo: 'joy', speed: 1.05, pitch: 0.03, into: 1.5, vol: 1.2, rise: 0.08, pause: 0.12 },
  retreat: { emo: 'sad', speed: 0.94, pitch: -0.02, into: 1.1, vol: 1.05, rise: -0.12, pause: 0.18 },
  rage: { emo: 'hype', speed: 0.97, pitch: 0.0, into: 1.6, vol: 1.3, rise: 0.2, pause: 0.25 },
  intro: { emo: null, speed: 0.92, pitch: -0.02, into: 1.35, vol: 1.15, rise: 0.05, pause: 0.3 },
  say: { emo: null, speed: 1.06, pitch: 0.02, into: 1.45, vol: 1.15, rise: 0.06, pause: 0.1 },
};
const SHOUT = new Set(['atk', 'heavy', 'sp', 'awake', 'hurt', 'dead', 'rage']);

async function synth(text, speaker, p = {}, kind = 'say') {
  const P = PROF[kind] || PROF.say;
  const q = await (await fetch(`${API}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, { method: 'POST' })).json();
  q.speedScale = (p.speed || 1) * P.speed;
  q.pitchScale = (p.pitch || 0) + P.pitch;
  q.intonationScale = (p.intonation || 1) * P.into;
  q.volumeScale = P.vol;
  q.prePhonemeLength = 0.02; q.postPhonemeLength = 0.08;
  // 語尾(最後のアクセント句)に向けて声を張る/落とす。叫びは最初の音も少し強く
  const ap = q.accent_phrases || [];
  ap.forEach((ph, i) => {
    const last = i === ap.length - 1, n = ph.moras.length;
    ph.moras.forEach((m, j) => {
      if (!(m.pitch > 0)) return;
      const t = n > 1 ? j / (n - 1) : 1;
      if (last) m.pitch += P.rise * (0.4 + 0.6 * t) * 0.5;
      if (SHOUT.has(kind) && i === 0 && j === 0) m.pitch += 0.08;
    });
    // 叫びの最後の母音は少し伸ばす
    if (last && SHOUT.has(kind) && P.rise > 0 && n) { const m = ph.moras[n - 1]; if (m.vowel_length) m.vowel_length *= 1.35; }
    if (ph.pause_mora && P.pause) ph.pause_mora.vowel_length = Math.max(ph.pause_mora.vowel_length || 0, P.pause);
  });
  q.outputSamplingRate = 24000; q.outputStereo = false;
  const r = await fetch(`${API}/synthesis?speaker=${speaker}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
  if (!r.ok) throw new Error('synthesis ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
const jobs = [];
const put = (file, text, speaker, p, kind) => jobs.push({ file, text, speaker, p, kind });

// キャラの戦闘ボイス(感情スタイルがあればそれを使う)
const index = { chars: {}, say: [] };
for (const [id, v] of Object.entries(VOICES)) {
  index.chars[id] = {};
  for (const [k, val] of Object.entries(v.lines)) {
    const arr = Array.isArray(val) ? val : [val];
    index.chars[id][k] = arr.length;
    const emo = (PROF[k] || {}).emo, sp = (v.st && emo && v.st[emo]) || (SHOUT.has(k) ? v.h : v.s);
    arr.forEach((t, i) => put(`${id}/${k}${i}.wav`, t, sp, v.p, k));
  }
}
// 合戦中の通信
const says = new Map();
for (const st of [...STAGES, ENDLESS]) for (const e of st.events || []) if (e.say && SAY_VOICE[e.say[0]]) says.set(vkey(e.say[1]), [e.say[0], e.say[1]]);
says.set(vkey('結界が消えました! 今こそ敵の本拠へ!'), ['軍師ミコト', '結界が消えました! 今こそ敵の本拠へ!']);
says.set(vkey('強敵が現れました!'), ['斥候', '強敵が現れました!']);
for (const t of Object.values(SAY_GENERIC)) says.set(vkey(t), ['斥候', t]);
for (const [k, [who, t]] of says) { put(`say/${k}.wav`, t, SAY_VOICE[who].s, SAY_VOICE[who].p, 'say'); index.say.push(k); }

let made = 0, bytes = 0;
for (const j of jobs) {
  const f = path.join(out, j.file);
  if (!force && fs.existsSync(f)) { bytes += fs.statSync(f).size; continue; }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const wav = await synth(j.text, j.speaker, j.p, j.kind);
  fs.writeFileSync(f, wav); made++; bytes += wav.length;
  process.stdout.write(`\r${made} 件作成…`);
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index));
console.log(`\n完了: ${jobs.length} 件(新規 ${made})/ 合計 ${(bytes / 1048576).toFixed(1)}MB`);
