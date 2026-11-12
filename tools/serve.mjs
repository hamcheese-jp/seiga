// 開発用の簡易サーバー:  node tools/serve.mjs  →  http://localhost:5173
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = +process.env.PORT || 5173;
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg', '.vrm': 'model/gltf-binary', '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  // 立ち絵撮影ツール(tools/portrait.html)からの保存: assets/portraits/ の下だけ書き込める
  if (req.method === 'POST' && req.url.startsWith('/__save?f=')) {
    const rel = decodeURIComponent(req.url.slice(10)), f = path.join(root, rel);
    if (!/^(assets\/portraits\/[\w-]+\.(webp|png)|assets\/sfx\/[\w-]+\.wav)$/.test(rel) || !f.startsWith(root)) { res.writeHead(403); return res.end(); }
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.concat(chunks)); res.writeHead(200); res.end('ok'); });
    return;
  }
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
}).listen(port, () => console.log('http://localhost:' + port));
