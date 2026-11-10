// アプリアイコン生成(外部ライブラリ不要):  node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
fs.mkdirSync(out, { recursive: true });

const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function png(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const sat = (v) => Math.max(0, Math.min(1, v));
const sm = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// 図柄: 夜空に三日月の牙と星
function shade(u, v, k) {            // u,v: -1..1 / k: 図柄の縮尺(マスカブル用に小さく)
  const x = u / k, y = v / k, r = Math.hypot(u, v);
  let c = mix([30, 44, 108], [5, 7, 20], sat(r * 0.85));
  c = mix(c, [120, 60, 150], sat(0.5 - Math.hypot(u + 0.3, v - 0.5)) * 0.5);
  // 三日月(牙)
  const d1 = Math.hypot(x + 0.06, y) - 0.62, d2 = Math.hypot(x - 0.2, y + 0.1) - 0.56;
  const moon = sm(0.012, -0.012, d1) * sm(-0.012, 0.012, d2);
  const g = mix([255, 244, 200], [214, 150, 44], sat((y + 0.6) / 1.2));
  c = mix(c, [255, 190, 90], sat(0.16 - Math.abs(d1)) * 2.2 * (1 - moon) * sm(-0.05, 0.1, d2) * 0.5);
  c = mix(c, g, moon);
  // 四芒星
  const sx = x - 0.26, sy = y + 0.12, a = Math.abs(sx), b = Math.abs(sy);
  const star = sm(0.012, -0.012, Math.pow(a, 0.5) + Math.pow(b, 0.5) - 0.62);
  c = mix(c, [255, 255, 255], sat(0.3 - Math.hypot(sx, sy)) * 1.6 * 0.5);
  c = mix(c, [255, 252, 236], star);
  // 斬撃の一閃
  const t = (x * 0.74 - y * 0.67), n = Math.abs(x * 0.67 + y * 0.74 + 0.02);
  const sl = sm(0.022, 0.0, n) * sm(0.95, 0.2, Math.abs(t)) * 0.9;
  c = mix(c, [255, 120, 70], sat(0.09 - n) * 6 * sm(0.95, 0.3, Math.abs(t)) * 0.35);
  c = mix(c, [255, 240, 220], sl);
  return c;
}
function render(size, k, round) {
  const px = Buffer.alloc(size * size * 4), SS = 3;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let r = 0, g = 0, b = 0, al = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = ((i + (sx + 0.5) / SS) / size) * 2 - 1, v = ((j + (sy + 0.5) / SS) / size) * 2 - 1;
      let a = 1;
      if (round) { const q = 0.78, dx = Math.max(Math.abs(u) - q, 0), dy = Math.max(Math.abs(v) - q, 0); a = Math.hypot(dx, dy) <= 1 - q ? 1 : 0; }
      const c = shade(u, v, k); r += c[0] * a; g += c[1] * a; b += c[2] * a; al += a;
    }
    const o = (j * size + i) * 4, n = SS * SS;
    px[o] = al ? r / al : 0; px[o + 1] = al ? g / al : 0; px[o + 2] = al ? b / al : 0; px[o + 3] = al / n * 255;
  }
  return png(size, px);
}

fs.writeFileSync(path.join(out, 'icon-192.png'), render(192, 1, true));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512, 1, true));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), render(512, 0.74, false));
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), render(180, 0.9, false));
console.log('icons written to', out);
