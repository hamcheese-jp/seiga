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

async function synth(text, speaker, p = {}, shout = false) {
  const q = await (await fetch(`${API}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, { method: 'POST' })).json();
  q.speedScale = (p.speed || 1) * (shout ? 1.08 : 1.0);
  q.pitchScale = p.pitch || 0;
  q.intonationScale = (p.intonation || 1) * (shout ? 1.35 : 1.1);
  q.volumeScale = shout ? 1.25 : 1.1;
  q.prePhonemeLength = 0.02; q.postPhonemeLength = 0.06;
  q.outputSamplingRate = 24000; q.outputStereo = false;
  const r = await fetch(`${API}/synthesis?speaker=${speaker}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
  if (!r.ok) throw new Error('synthesis ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
const jobs = [];
const put = (file, text, speaker, p, shout) => jobs.push({ file, text, speaker, p, shout });

// キャラの戦闘ボイス
const SHOUT = new Set(['atk', 'heavy', 'sp', 'awake', 'hurt', 'dead']);
const index = { chars: {}, say: [] };
for (const [id, v] of Object.entries(VOICES)) {
  index.chars[id] = {};
  for (const [k, val] of Object.entries(v.lines)) {
    const arr = Array.isArray(val) ? val : [val];
    index.chars[id][k] = arr.length;
    arr.forEach((t, i) => put(`${id}/${k}${i}.wav`, t, SHOUT.has(k) ? v.h : v.s, v.p, SHOUT.has(k)));
  }
}
// 合戦中の通信
const says = new Map();
for (const st of [...STAGES, ENDLESS]) for (const e of st.events || []) if (e.say && SAY_VOICE[e.say[0]]) says.set(vkey(e.say[1]), [e.say[0], e.say[1]]);
says.set(vkey('結界が消えました! 今こそ敵の本拠へ!'), ['軍師ミコト', '結界が消えました! 今こそ敵の本拠へ!']);
says.set(vkey('強敵が現れました!'), ['斥候', '強敵が現れました!']);
for (const t of Object.values(SAY_GENERIC)) says.set(vkey(t), ['斥候', t]);
for (const [k, [who, t]] of says) { put(`say/${k}.wav`, t, SAY_VOICE[who].s, SAY_VOICE[who].p, false); index.say.push(k); }

let made = 0, bytes = 0;
for (const j of jobs) {
  const f = path.join(out, j.file);
  if (!force && fs.existsSync(f)) { bytes += fs.statSync(f).size; continue; }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const wav = await synth(j.text, j.speaker, j.p, j.shout);
  fs.writeFileSync(f, wav); made++; bytes += wav.length;
  process.stdout.write(`\r${made} 件作成…`);
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index));
console.log(`\n完了: ${jobs.length} 件(新規 ${made})/ 合計 ${(bytes / 1048576).toFixed(1)}MB`);
