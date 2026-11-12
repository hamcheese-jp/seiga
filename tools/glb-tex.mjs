// GLB の画像を縮小して JPEG にする(武器モデルを軽くする用)
//   node tools/glb-tex.mjs 入力.glb 出力.glb [最大px=512] [JPEG品質=82]
// 画像の縮小は Windows の PowerShell(System.Drawing)を使います。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const [inFile, outFile] = process.argv.slice(2), maxPx = +(process.argv[4] || 512), q = +(process.argv[5] || 82);
if (!inFile || !outFile) { console.log('使い方: node tools/glb-tex.mjs in.glb out.glb [最大px] [品質]'); process.exit(1); }
const src = fs.readFileSync(inFile);
if (src.toString('ascii', 0, 4) !== 'glTF') throw new Error('GLB ではありません');
const jsonLen = src.readUInt32LE(12);
const json = JSON.parse(src.toString('utf8', 20, 20 + jsonLen));
const binStart = 20 + jsonLen + 8, bin = src.subarray(binStart, binStart + src.readUInt32LE(20 + jsonLen));
const views = json.bufferViews.map((v) => Buffer.from(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glbtex-'));
const jobs = [];
(json.images || []).forEach((im, i) => {
  if (im.bufferView === undefined) return;
  const inF = path.join(tmp, `i${i}.bin`), outF = path.join(tmp, `o${i}.jpg`);
  fs.writeFileSync(inF, views[im.bufferView]);
  jobs.push({ i, im, inF, outF, before: views[im.bufferView].length });
});
const ps = ['Add-Type -AssemblyName System.Drawing',
  `$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }`,
  `$ep=New-Object System.Drawing.Imaging.EncoderParameters 1; $ep.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]${q})`];
for (const j of jobs) ps.push(`$s=[System.Drawing.Image]::FromFile('${j.inF}'); $k=[Math]::Min([double]1, [double]${maxPx}/[Math]::Max($s.Width,$s.Height)); $w=[Math]::Max(1,[int]($s.Width*$k)); $h=[Math]::Max(1,[int]($s.Height*$k)); $b=New-Object System.Drawing.Bitmap $w,$h,([System.Drawing.Imaging.PixelFormat]::Format24bppRgb); $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $g.DrawImage($s,0,0,$w,$h); $b.Save('${j.outF}',$enc,$ep); $g.Dispose(); $b.Dispose(); $s.Dispose()`);
const psFile = path.join(tmp, 'resize.ps1');
fs.writeFileSync(psFile, ps.join('\r\n'));
execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile], { stdio: 'inherit' });
for (const j of jobs) { views[j.im.bufferView] = fs.readFileSync(j.outF); j.im.mimeType = 'image/jpeg'; console.log(`image ${j.i}: ${Math.round(j.before / 1024)}KB -> ${Math.round(views[j.im.bufferView].length / 1024)}KB`); }

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
fs.writeFileSync(outFile, out);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${outFile}: ${Math.round(src.length / 1024)}KB -> ${Math.round(out.length / 1024)}KB`);
