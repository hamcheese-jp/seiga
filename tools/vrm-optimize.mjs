// VRMを軽くする: 大きいテクスチャを縮小し、サムネイル画像を最小化して詰め直す
//   node tools/vrm-optimize.mjs vrm/reiga.vrm [最大px=1024]
// 画像の縮小は Windows の PowerShell(System.Drawing)を使います。元ファイルは .orig.vrm として残します。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const file = process.argv[2], maxPx = +(process.argv[3] || 1024);
if (!file) { console.log('使い方: node tools/vrm-optimize.mjs vrm/xxx.vrm [最大px]'); process.exit(1); }
const src = fs.readFileSync(file);
if (src.toString('ascii', 0, 4) !== 'glTF') throw new Error('glTF/VRM ではありません');
const jsonLen = src.readUInt32LE(12);
const json = JSON.parse(src.toString('utf8', 20, 20 + jsonLen));
const binStart = 20 + jsonLen + 8, bin = src.subarray(binStart, binStart + src.readUInt32LE(20 + jsonLen));
const views = json.bufferViews.map((v) => Buffer.from(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmopt-'));
const vrm = (json.extensions || {}).VRMC_vrm || (json.extensions || {}).VRM || {};
const thumb = vrm.meta && (vrm.meta.thumbnailImage ?? vrm.meta.texture);
const jobs = [];
(json.images || []).forEach((im, i) => {
  if (im.bufferView === undefined || !/png|jpeg/.test(im.mimeType || '')) return;
  const b = views[im.bufferView];
  const w = im.mimeType === 'image/png' ? b.readUInt32BE(16) : 0, h = im.mimeType === 'image/png' ? b.readUInt32BE(20) : 0;
  const isThumb = i === thumb || /thumbnail/i.test(im.name || '');
  const target = isThumb ? 64 : maxPx;
  if (Math.max(w, h) <= target) return;
  const inF = path.join(tmp, `i${i}.png`), outF = path.join(tmp, `o${i}.png`);
  fs.writeFileSync(inF, b);
  const k = target / Math.max(w, h);
  jobs.push({ i, view: im.bufferView, inF, outF, w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), before: b.length });
});
if (jobs.length) {
  const ps = ['Add-Type -AssemblyName System.Drawing'];
  for (const j of jobs) ps.push(`$s=[System.Drawing.Image]::FromFile('${j.inF}'); $b=New-Object System.Drawing.Bitmap ${j.w},${j.h},([System.Drawing.Imaging.PixelFormat]::Format32bppArgb); $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $g.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy; $g.DrawImage($s,0,0,${j.w},${j.h}); $b.Save('${j.outF}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose(); $s.Dispose()`);
  const psFile = path.join(tmp, 'resize.ps1');
  fs.writeFileSync(psFile, ps.join('\r\n'));
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile], { stdio: 'inherit' });
  for (const j of jobs) { views[j.view] = fs.readFileSync(j.outF); console.log(`image ${j.i}: ${Math.round(j.before / 1024)}KB -> ${Math.round(views[j.view].length / 1024)}KB (${j.w}x${j.h})`); }
}
// 詰め直し(各ビューを4バイト境界に揃える)
let off = 0; const parts = [];
json.bufferViews.forEach((v, i) => { const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; } v.byteOffset = off; v.byteLength = views[i].length; parts.push(views[i]); off += views[i].length; });
const padEnd = (4 - (off % 4)) % 4; if (padEnd) { parts.push(Buffer.alloc(padEnd)); off += padEnd; }
json.buffers[0].byteLength = off;
let js = Buffer.from(JSON.stringify(json)); const jp = (4 - (js.length % 4)) % 4; js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]);
const newBin = Buffer.concat(parts);
const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + newBin.length, 8);
const cj = Buffer.alloc(8); cj.writeUInt32LE(js.length, 0); cj.write('JSON', 4);
const cb = Buffer.alloc(8); cb.writeUInt32LE(newBin.length, 0); cb.writeUInt32LE(0x004E4942, 4);
const out = Buffer.concat([head, cj, js, cb, newBin]);
const orig = file.replace(/\.vrm$/i, '.orig.vrm');
if (!fs.existsSync(orig)) fs.copyFileSync(file, orig);
fs.writeFileSync(file, out);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${file}: ${Math.round(src.length / 1048576 * 10) / 10}MB -> ${Math.round(out.length / 1048576 * 10) / 10}MB(元ファイル: ${orig})`);
