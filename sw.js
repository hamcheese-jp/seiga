// サービスワーカー: 全ファイルをキャッシュしてオフラインでも遊べるようにする
// ※ ゲームを更新したら CACHE の番号を上げてください(古いキャッシュが破棄されます)
const CACHE = 'seiga-v1.8.0';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'vendor/three.module.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'src/main.js', 'src/config.js', 'src/util.js', 'src/geo.js', 'src/gfx.js', 'src/input.js', 'src/audio.js', 'src/models.js', 'src/rig.js',
  'src/data.js', 'src/moves.js', 'src/stage.js', 'src/horde.js', 'src/fx.js', 'src/fighter.js', 'src/battle.js', 'src/ui.js', 'src/save.js', 'src/lobby.js', 'src/install.js', 'src/vrmchar.js', 'src/vat.js', 'src/nature.js', 'src/story.js', 'src/voice.js', 'src/voicedata.js', 'src/net.js', 'assets/sfx/cloth1.wav','assets/sfx/cloth2.wav','assets/sfx/cloth3.wav','assets/sfx/drawKnife1.wav','assets/sfx/drawKnife2.wav','assets/sfx/knifeSlice.wav','assets/sfx/knifeSlice2.wav','assets/sfx/metalH0.wav','assets/sfx/metalH1.wav','assets/sfx/metalH2.wav','assets/sfx/metalH3.wav','assets/sfx/metalM0.wav','assets/sfx/metalM1.wav','assets/sfx/plateH0.wav','assets/sfx/plateH1.wav','assets/sfx/plateH2.wav','assets/sfx/punchH0.wav','assets/sfx/punchH1.wav','assets/sfx/punchH2.wav','assets/sfx/punchH3.wav','assets/sfx/punchM0.wav','assets/sfx/punchM1.wav','assets/sfx/punchM2.wav','assets/sfx/punchM3.wav','assets/sfx/softH0.wav','assets/sfx/softH1.wav','assets/sfx/softH2.wav','assets/sfx/step0.wav','assets/sfx/step1.wav','assets/sfx/step2.wav', 'src/weaponglb.js', 'assets/weapons/sword.glb', 'assets/weapons/spear.glb', 'assets/weapons/twin.glb', 'assets/weapons/hammer.glb', 'vendor/peerjs.min.js', 'assets/soldier.bin', 'assets/soldier2.bin', 'vendor/three-vrm.module.min.js', 'vendor/addons/loaders/GLTFLoader.js', 'vendor/addons/utils/BufferGeometryUtils.js',
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
