// 毎日の目標・ログインボーナス・週間番付(日付は日本時間で切り替え)
import { Save } from './save.js';

const pad = (n) => String(n).padStart(2, '0');
const jst = (t = Date.now()) => new Date(t + 9 * 3600e3);
export const dayKey = (t) => { const d = jst(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
// 週は月曜はじまり(ISO週番号)。番付の名前に使う: wk_2026w47
export function weekKey(t) {
  const d = jst(t), u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const wd = u.getUTCDay() || 7; u.setUTCDate(u.getUTCDate() + 4 - wd);
  const y = u.getUTCFullYear(), w = Math.ceil(((u - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `wk_${y}w${pad(w)}`;
}
// 週の終わり(次の月曜0時・日本時間)までの残り
export function weekLeft() {
  const d = jst(), wd = d.getUTCDay() || 7;
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 8 - wd);
  const h = Math.max(0, Math.floor((end - d.getTime()) / 3600e3));
  return h >= 24 ? `あと${Math.floor(h / 24)}日` : `あと${h}時間`;
}

// 目標の種類。n は日替わりで選ぶ目標値、g は報酬の金
const KINDS = {
  ko: { t: (n) => `敵を${n}人倒す`, ns: [300, 500, 800], g: 400, v: (r) => r.ko || 0 },
  win: { t: (n) => `合戦に${n}回勝つ`, ns: [1, 2, 3], g: 400, v: (r) => (r.win && !r.endless ? 1 : 0) },
  combo: { t: (n) => `${n}連撃を出す`, ns: [50, 80, 120], g: 400, v: (r) => r.maxCombo || 0, max: true },
  officer: { t: (n) => `敵将を${n}人倒す`, ns: [3, 5, 8], g: 400, v: (r) => r.offKO || 0 },
  perfect: { t: (n) => `見切りを${n}回決める`, ns: [2, 4, 6], g: 500, v: (r) => r.perfect || 0 },
  online: { t: () => 'オンライン(協力・対戦・CPU戦)で1回遊ぶ', ns: [1], g: 500, v: (r) => (r.coop || r.pvp ? 1 : 0) },
  wave: { t: (n) => `星海の試練で第${n}波に到達`, ns: [3, 5], g: 500, v: (r) => (r.endless ? r.wave || 0 : 0), max: true },
};
const ALL_BONUS = 800;
const LOGIN = [200, 300, 400, 500, 600, 800, 1500];   // 7日で1周

// 日付から決まる乱数(全員が同じ日に同じ目標になる)
function rng(seed) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; }
function makeMissions(day) {
  const r = rng(day), keys = Object.keys(KINDS), out = [];
  while (out.length < 3) { const k = keys[(r() * keys.length) | 0]; if (out.some((m) => m.k === k)) continue; const ns = KINDS[k].ns; out.push({ k, n: ns[(r() * ns.length) | 0], p: 0, c: 0 }); }
  return out;
}

export const Daily = {
  // 日付が変わっていたら目標を作り直す
  ensure() {
    const S = Save.data, day = dayKey();
    if (!S.daily || S.daily.day !== day) S.daily = { day, list: makeMissions(day), all: 0 };
    return S.daily;
  },
  // 起動時(タイトルから入った時)のログインボーナス。初回のみ金額を返す
  login() {
    const S = Save.data, day = dayKey(), L = S.login || (S.login = { day: '', streak: 0 });
    this.ensure();
    if (L.day === day) return null;
    const yest = dayKey(Date.now() - 864e5);
    L.streak = L.day === yest ? (L.streak % 7) + 1 : 1; L.day = day;
    const gold = LOGIN[L.streak - 1]; S.gold += gold; Save.persist(false);
    return { gold, streak: L.streak };
  },
  // 合戦の結果を目標に反映。新しく達成したもの(報酬つき)を返す
  apply(r) {
    const S = Save.data, D = this.ensure(), got = [];
    for (const m of D.list) {
      if (m.c) continue;
      const K = KINDS[m.k], v = K.v(r);
      m.p = K.max ? Math.max(m.p, v) : m.p + v;
      if (m.p >= m.n) { m.p = m.n; m.c = 1; S.gold += K.g; got.push({ t: K.t(m.n), g: K.g }); }
    }
    if (!D.all && D.list.every((m) => m.c)) { D.all = 1; S.gold += ALL_BONUS; got.push({ t: '今日の目標をすべて達成', g: ALL_BONUS }); }
    // 週間番付用: 今週の累計撃破数
    const wk = weekKey(), W = S.week && S.week.k === wk ? S.week : (S.week = { k: wk, ko: 0, time: 0 });
    W.ko += r.ko || 0; W.time += Math.round(r.time || 0);
    return got;
  },
  list() { return this.ensure().list.map((m) => ({ ...m, t: KINDS[m.k].t(m.n), g: KINDS[m.k].g })); },
  done() { return this.ensure().list.filter((m) => m.c).length; },
  allBonus: ALL_BONUS, loginTable: LOGIN,
};
