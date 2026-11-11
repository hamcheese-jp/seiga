// キャラの声と、合戦中の通信の声を鳴らす(音声は assets/voice/、tools/make-voices.mjs で生成)
import { Audio } from './audio.js';
import { VOICES, BOSS_VOICE, SAY_VOICE, SAY_GENERIC, vkey } from './voicedata.js';

const BASE = 'assets/voice/';
let index = null;
const bufs = new Map(), last = {}, playing = {};

function load(file) {
  if (!bufs.has(file)) {
    bufs.set(file, fetch(BASE + file).then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((a) => (a && Audio.ctx ? Audio.ctx.decodeAudioData(a) : null)).catch(() => null));
  }
  return bufs.get(file);
}

export const Voice = {
  init() { if (!index) fetch(BASE + 'index.json').then((r) => (r.ok ? r.json() : null)).then((j) => { index = j; }).catch(() => {}); },
  // 戦うキャラの声を先読み
  preload(ids, sayTexts = []) {
    if (!index || !Audio.ctx) return;
    for (const id of ids) {
      const n = index.chars[id]; if (!n) continue;
      for (const k in n) for (let i = 0; i < n[k]; i++) load(`${id}/${k}${i}.wav`);
    }
    for (const t of sayTexts) { const k = vkey(t); if (index.say.includes(k)) load(`say/${k}.wav`); }
  },
  idFor(f) { return f.heroId || (f.lookId && BOSS_VOICE[f.lookId]) || (f.team === 1 ? 'officer' : null); },
  // kind: atk / heavy / sp / awake / hurt / start / ko / retreat / back / rage / intro / dead
  play(id, kind, { chance = 1, gap = 0.6, vol = 1, force = false } = {}) {
    if (!id || !index || !Audio.ctx) return;
    const n = index.chars[id] && index.chars[id][kind]; if (!n) return;
    const now = Audio.ctx.currentTime;
    if (!force && (Math.random() > chance || now - (last[id] || -9) < gap)) return;
    last[id] = now;
    const file = `${id}/${kind}${(Math.random() * n) | 0}.wav`;
    load(file).then((b) => {
      if (!b) return;
      if (playing[id]) { try { playing[id].stop(); } catch (_) { /* noop */ } }
      playing[id] = Audio.playBuf(b, vol, 1);
    });
  },
  // 合戦中の通信(軍師・伝令など)
  say(name, text, generic) {
    if (!index || !Audio.ctx || !SAY_VOICE[name]) return;
    const k = vkey(generic ? SAY_GENERIC[generic] : text);
    if (!index.say.includes(k)) return;
    load(`say/${k}.wav`).then((b) => {
      if (!b) return;
      if (playing.__say) { try { playing.__say.stop(); } catch (_) { /* noop */ } }
      playing.__say = Audio.playBuf(b, 0.95, 1);
    });
  },
  has(id, kind) { return !!(index && index.chars[id] && index.chars[id][kind]); },
};
export { VOICES };
