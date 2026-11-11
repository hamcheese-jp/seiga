// サービスワーカー: 全ファイルをキャッシュしてオフラインでも遊べるようにする
// ※ ゲームを更新したら CACHE の番号を上げてください(古いキャッシュが破棄されます)
const CACHE = 'seiga-v1.1.2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'vendor/three.module.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'src/main.js', 'src/config.js', 'src/util.js', 'src/geo.js', 'src/gfx.js', 'src/input.js', 'src/audio.js', 'src/models.js', 'src/rig.js',
  'src/data.js', 'src/moves.js', 'src/stage.js', 'src/horde.js', 'src/fx.js', 'src/fighter.js', 'src/battle.js', 'src/ui.js', 'src/save.js', 'src/lobby.js', 'src/install.js', 'src/vrmchar.js', 'src/vat.js', 'src/nature.js', 'assets/soldier.bin', 'assets/soldier2.bin', 'vendor/three-vrm.module.min.js', 'vendor/addons/loaders/GLTFLoader.js', 'vendor/addons/utils/BufferGeometryUtils.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;   // スプレッドシート連携などは素通し
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
