// アプリとして追加(ホーム画面へのインストール)の案内
const ua = navigator.userAgent;
let deferred = null;
const listeners = [];

addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });

export const Install = {
  isAndroid: /Android/i.test(ua),
  isIOS: /iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)),
  // LINE・Instagram・Facebook・X などのアプリ内ブラウザ(ここからはインストールできない)
  inApp: /\bLine\/|FBAN|FBAV|Instagram|Twitter|KAKAOTALK|; wv\)|YJApp|GSA\//i.test(ua),
  installed() {
    return matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  },
  canPrompt() { return !!deferred; },
  onChange(f) { listeners.push(f); },
  async prompt() {
    if (!deferred) return false;
    const e = deferred; deferred = null;
    e.prompt();
    const r = await e.userChoice.catch(() => null);
    listeners.forEach((f) => f());
    return !!(r && r.outcome === 'accepted');
  },
  // Android のアプリ内ブラウザから Chrome で開き直すリンク
  chromeUrl() {
    const u = location.href.replace(/^https?:\/\//, '');
    return `intent://${u}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href)};end`;
  },
};
