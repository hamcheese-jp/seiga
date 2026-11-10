// セーブデータ: 端末内(localStorage)に常時保存し、設定すれば Googleスプレッドシートへ同期する
import { HEROES, START_HEROES, starterWeapon, ACHIEVEMENTS, expNeed, MAX_LV, UNLOCKS, HERO } from './data.js';
import { CLOUD_URL } from './config.js';

const KEY = 'seiga_save_v1';
const genId = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('').replace(/(.{4})(?=.)/g, '$1-'); };

export function newSave() {
  return {
    v: 1, id: genId(), name: '名もなき武将', gold: 500, heroes: {}, weapons: [], stages: {}, unlockedHeroes: START_HEROES.slice(), ach: {},
    stats: { totalKO: 0, battles: 0, wins: 0, maxKO: 0, maxCombo: 0, officers: 0, perfect: 0, flawless: 0, playTime: 0 },
    endless: { ko: 0, wave: 0 },
    settings: { quality: 'auto', bgm: 0.6, sfx: 0.8, camSens: 1, autoCam: true, vibe: true, fps: false, cloudUrl: '' },
    last: { hero: 'reiga', stage: 's1', diff: 1 }, t: 0,
  };
}
function fix(s) {
  const d = newSave();
  for (const k in d) if (s[k] === undefined) s[k] = d[k];
  for (const k in d.stats) if (s.stats[k] === undefined) s.stats[k] = d.stats[k];
  for (const k in d.settings) if (s.settings[k] === undefined) s.settings[k] = d.settings[k];
  for (const h of HEROES) {
    if (!s.heroes[h.id]) s.heroes[h.id] = { lv: 1, exp: 0, weapon: null };
    const hs = s.heroes[h.id];
    if (!s.weapons.some((w) => w.uid === hs.weapon)) {
      let w = s.weapons.find((x) => x.type === h.wtype);
      if (!w) { w = starterWeapon(h.wtype); s.weapons.push(w); }
      hs.weapon = w.uid;
    }
  }
  if (!HERO[s.last.hero] || !s.unlockedHeroes.includes(s.last.hero)) s.last.hero = s.unlockedHeroes[0];
  return s;
}

export const Save = {
  data: null, _timer: 0, cloudState: '',
  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (_) { /* 壊れていたら新規 */ }
    this.data = fix(s && s.v === 1 ? s : newSave());
    return this.data;
  },
  persist(cloud = true) {
    this.data.t = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (_) { /* 容量超過などは無視 */ }
    if (cloud && Cloud.enabled()) { clearTimeout(this._timer); this._timer = setTimeout(() => Cloud.push(), 3500); }
  },
  reset() { const keep = this.data.settings; this.data = fix(newSave()); this.data.settings = keep; this.persist(false); },
  replace(obj) { const set = this.data.settings; this.data = fix(obj); this.data.settings.cloudUrl = set.cloudUrl; this.persist(false); },

  // 経験値加算。レベルアップ情報を返す
  addExp(heroId, exp) {
    const h = this.data.heroes[heroId], from = h.lv;
    h.exp += exp;
    while (h.lv < MAX_LV && h.exp >= expNeed(h.lv)) { h.exp -= expNeed(h.lv); h.lv++; }
    if (h.lv >= MAX_LV) h.exp = 0;
    return { from, to: h.lv };
  },
  // 実績チェック。新規達成の一覧を返す
  checkAch() {
    const S = this.data, got = [];
    for (const a of ACHIEVEMENTS) { if (S.ach[a.id]) continue; let ok = false; try { ok = a.t(S); } catch (_) { ok = false; } if (ok) { S.ach[a.id] = 1; S.gold += a.gold; got.push(a); } }
    return got;
  },
  // 合戦結果を反映
  applyResult(r) {
    const S = this.data, out = { lv: null, unlock: null, ach: [], best: false };
    S.stats.battles++; S.stats.totalKO += r.ko; S.stats.maxKO = Math.max(S.stats.maxKO, r.ko); S.stats.maxCombo = Math.max(S.stats.maxCombo, r.maxCombo);
    S.stats.officers += r.offKO; S.stats.perfect += r.perfect; S.stats.playTime += Math.round(r.time);
    S.gold += r.gold; out.lv = this.addExp(r.heroId, r.exp);
    for (const w of r.loot) S.weapons.push(w);
    if (S.weapons.length > 150) {   // 上限超過分は価値の低い物から自動売却
      const eq = new Set(Object.values(S.heroes).map((h) => h.weapon));
      const cand = S.weapons.filter((w) => !eq.has(w.uid) && !w.lock).sort((a, b) => a.rar - b.rar || a.atk - b.atk);
      while (S.weapons.length > 150 && cand.length) { const w = cand.shift(); S.weapons.splice(S.weapons.indexOf(w), 1); S.gold += 30 * w.rar * w.rar; }
    }
    if (r.endless) {
      if (r.ko > S.endless.ko) { S.endless.ko = r.ko; out.best = true; }
      S.endless.wave = Math.max(S.endless.wave, r.wave);
    } else if (r.win) {
      S.stats.wins++; if (r.hpRate <= 0.1) S.stats.flawless++;
      const st = S.stages[r.stage.id] || (S.stages[r.stage.id] = {}), cur = st[r.diff.id] || (st[r.diff.id] = { clear: 0, rank: 'C', ko: 0, time: 99999 });
      const order = 'CBAS';
      cur.clear++; if (order.indexOf(r.rank) > order.indexOf(cur.rank) || cur.clear === 1) cur.rank = r.rank;
      if (r.ko > cur.ko) { cur.ko = r.ko; out.best = true; }
      cur.time = Math.min(cur.time, Math.round(r.time));
      const u = UNLOCKS[r.stage.id];
      if (u && !S.unlockedHeroes.includes(u)) { S.unlockedHeroes.push(u); out.unlock = HERO[u]; }
    }
    out.ach = this.checkAch();
    this.persist();
    return out;
  },
  stageCleared(id) { const st = this.data.stages[id]; return !!st && Object.values(st).some((r) => r.clear > 0); },
};

// ---- Googleスプレッドシート連携(Apps Script ウェブアプリ) ----
export const Cloud = {
  url() { return ((Save.data && Save.data.settings.cloudUrl) || CLOUD_URL || '').trim(); },
  enabled() { return /^https:\/\/script\.google\.com\/(a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/.test(this.url()); },
  async _post(body) {
    const r = await fetch(this.url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
    return r.json();
  },
  async _get(q) { const r = await fetch(this.url() + '?' + new URLSearchParams(q), { redirect: 'follow' }); return r.json(); },
  async push() {
    if (!this.enabled()) return false;
    const S = Save.data;
    try {
      Save.cloudState = '保存中…';
      const lv = Math.max(...Object.values(S.heroes).map((h) => h.lv));
      const res = await this._post({ action: 'save', id: S.id, name: S.name, level: lv, totalKO: S.stats.totalKO, gold: S.gold, weapons: S.weapons.length, data: JSON.stringify(S) });
      Save.cloudState = res.ok ? '保存済み ' + new Date().toLocaleTimeString() : '保存失敗: ' + (res.error || '');
      return !!res.ok;
    } catch (e) { Save.cloudState = '通信エラー(端末内には保存済み)'; return false; }
  },
  // id のデータを取得(なければ null)
  async pull(id) {
    if (!this.enabled()) return null;
    try {
      const res = await this._get({ action: 'load', id: id || Save.data.id });
      if (!res.ok || !res.data) return null;
      const obj = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      return obj && obj.v === 1 ? obj : null;
    } catch (e) { return null; }
  },
  async score(board, row) {
    if (!this.enabled()) return;
    try { await this._post({ action: 'score', board, id: Save.data.id, name: Save.data.name, ...row }); } catch (e) { /* 失敗しても続行 */ }
  },
  async ranking(board) {
    if (!this.enabled()) return null;
    try { const res = await this._get({ action: 'rank', board, n: 30 }); return res.ok ? res.rows : null; } catch (e) { return null; }
  },
};
