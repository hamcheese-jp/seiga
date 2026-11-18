// 言語の切り替え(日本語 / English)
//   言語は「設定」で選べる。未設定ならブラウザの言語で決める(日本語以外は英語)。URL の ?lang=en / ?lang=ja でも切り替え可
//   英語のときは、画面の日本語を辞書(src/i18n_en.js)で置き換える。データ(名前・説明・物語)は読み込み時に英語へ差し替える
const KEY = 'seiga_lang';
function detect() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'ja') { localStorage.setItem(KEY, q); return q; }
    const s = localStorage.getItem(KEY);
    if (s === 'en' || s === 'ja') return s;
  } catch (_) { /* noop */ }
  return /^ja\b/i.test(navigator.language || 'ja') ? 'ja' : 'en';
}
export const LANG = detect();
export const EN = LANG === 'en';
export function setLang(l) { try { localStorage.setItem(KEY, l); } catch (_) { /* noop */ } location.reload(); }

const JA = /[ぁ-んァ-ヶ一-龠々〆ー]/;
const DICT = new Map();   // 文字列そのまま → 英語
const PATS = [];          // [正規表現, 置き換え(関数 or 文字列)]
const WORDS = [];         // 文中の語の置き換え(長い語から)
export function addDict(o) { for (const k in o) DICT.set(k, o[k]); }
export function addPats(list) { PATS.push(...list); }
export function addWords(o) { for (const k in o) WORDS.push([k, o[k]]); WORDS.sort((a, b) => b[0].length - a[0].length); }

// 日本語の文字列を英語にする(英語モードでなければそのまま)
export function T(s) {
  if (!EN || s == null) return s;
  s = String(s);
  if (!JA.test(s)) return s;
  const k = s.trim();
  if (DICT.has(k)) return s.replace(k, DICT.get(k));
  for (const [re, rep] of PATS) {
    const m = k.match(re);
    if (m) return s.replace(k, typeof rep === 'function' ? rep(...m) : k.replace(re, rep));
  }
  let out = k;
  for (const [a, b] of WORDS) if (out.includes(a)) out = out.split(a).join(b);
  if (out !== k) {
    // 語の置き換えで残った助詞などを整える
    out = out.replace(/\s*の\s*/g, ' ').replace(/\s{2,}/g, ' ');
    return s.replace(k, out);
  }
  if (Miss.on) Miss.add(k);
  return s;
}
// 訳のない日本語を集める(開発用: ?lang=en&miss=1 で window.__miss に溜まる)
export const Miss = { on: false, set: new Set(), add(k) { this.set.add(k); } };

// 画面の文字を見張って英語に置き換える
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const DONE = new WeakMap();   // 置き換えた後の文字(同じ文字を何度も置き換えて止まらなくならないように)
function fixText(c) {
  const v = c.nodeValue;
  if (!v || !JA.test(v) || DONE.get(c) === v) return;
  const t = T(v); DONE.set(c, t);
  if (t !== v) c.nodeValue = t;
}
const DONE_A = new WeakMap();
function fixAttrs(e) {
  if (!e.getAttribute) return;
  let m = DONE_A.get(e);
  for (const a of ATTRS) {
    const v = e.getAttribute(a);
    if (!v || !JA.test(v) || (m && m[a] === v)) continue;
    const t = T(v); if (!m) DONE_A.set(e, (m = {})); m[a] = t;
    if (t !== v) e.setAttribute(a, t);
  }
}
function fixNode(n) {
  if (n.nodeType === 3) { fixText(n); return; }
  if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
  fixAttrs(n);
  if ((n.tagName === 'INPUT' || n.tagName === 'BUTTON') && n.type !== 'text' && n.value && JA.test(n.value)) n.value = T(n.value);
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let c = w.nextNode();
  while (c) {
    if (c.nodeType === 3) fixText(c);
    else fixAttrs(c);
    c = w.nextNode();
  }
}
export function startDomTranslate() {
  if (!EN) return;
  document.documentElement.lang = 'en';
  try { if (/[?&]miss=1/.test(location.search)) { Miss.on = true; window.__miss = Miss.set; } } catch (_) { /* noop */ }
  fixNode(document.body);
  if (document.title && JA.test(document.title)) document.title = T(document.title);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') fixNode(m.target);
      else if (m.type === 'attributes') fixNode(m.target);
      else for (const n of m.addedNodes) fixNode(n);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
