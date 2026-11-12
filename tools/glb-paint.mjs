// GLB の基本色テクスチャに円を塗る(AI生成テクスチャの不要な模様を消す用)
//   node tools/glb-paint.mjs 入力.glb 出力.glb x,y,半径 [x,y,半径 ...] [--color=r,g,b]
// 座標はテクスチャのピクセル。画像の加工は Windows の PowerShell(System.Drawing)を使います。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2), inFile = args[0], outFile = args[1];
const color = (args.find((a) => a.startsWith('--color=')) || '--color=38,30,26').slice(8).split(',').map(Number);
const circles = args.slice(2).filter((a) => !a.startsWith('--')).map((a) => a.split(',').map(Number));
const src = fs.readFileSync(inFile), n = src.readUInt32LE(12), json = JSON.parse(src.toString('utf8', 20, 20 + n));
const bin = src.subarray(20 + n + 8);
const views = json.bufferViews.map((v) => Buffer.from(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)));
const bc = json.textures[json.materials[0].pbrMetallicRoughness.baseColorTexture.index].source, vi = json.images[bc].bufferView;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glbpaint-')), inF = path.join(tmp, 'in.img'), outF = path.join(tmp, 'out.jpg');
fs.writeFileSync(inF, views[vi]);
const ps = [`Add-Type -AssemblyName System.Drawing`, `$s=[System.Drawing.Image]::FromFile('${inF}'); $b=New-Object System.Drawing.Bitmap $s; $s.Dispose()`,
  `$g=[System.Drawing.Graphics]::FromImage($b); $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias`,
  `$br=New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,${color.join(',')}))`,
  ...circles.map(([x, y, r]) => `$g.FillEllipse($br, ${x - r}, ${y - r}, ${r * 2}, ${r * 2})`),
  `$b.Save('${outF}', [System.Drawing.Imaging.ImageFormat]::Jpeg); $g.Dispose(); $b.Dispose()`];
const psFile = path.join(tmp, 'p.ps1'); fs.writeFileSync(psFile, ps.join('\r\n'));
execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile], { stdio: 'inherit' });
views[vi] = fs.readFileSync(outF); json.images[bc].mimeType = 'image/jpeg';
let off = 0; const parts = [];
json.bufferViews.forEach((v, i) => { const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; } v.byteOffset = off; v.byteLength = views[i].length; parts.push(views[i]); off += views[i].length; });
const pe = (4 - (off % 4)) % 4; if (pe) { parts.push(Buffer.alloc(pe)); off += pe; }
json.buffers[0].byteLength = off;
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const nb = Buffer.concat(parts), h = Buffer.alloc(12); h.write('glTF', 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(28 + js.length + nb.length, 8);
const cj = Buffer.alloc(8); cj.writeUInt32LE(js.length, 0); cj.write('JSON', 4);
const cb = Buffer.alloc(8); cb.writeUInt32LE(nb.length, 0); cb.writeUInt32LE(0x004E4942, 4);
fs.writeFileSync(outFile, Buffer.concat([h, cj, js, cb, nb]));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${outFile}: ${circles.length}か所を塗りました`);
