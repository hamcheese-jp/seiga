/**
 * 星牙戦記 — Googleスプレッドシート連携(セーブデータ保存・番付)
 *
 * 設定手順(詳細は README.md):
 *  1. Googleスプレッドシートを新規作成
 *  2. メニュー「拡張機能」→「Apps Script」を開き、このファイルの内容を貼り付けて保存
 *  3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *     実行ユーザー: 自分 / アクセスできるユーザー: 全員
 *  4. 発行された URL(…/exec)を、ゲームの src/config.js の CLOUD_URL か、ゲーム内「設定」に貼り付け
 *
 * シート「saves」にセーブデータ、「ranking」に番付が自動で作られます。
 */
const SHEET_SAVE = 'saves';
const SHEET_RANK = 'ranking';
const SAVE_HEAD = ['id', 'name', 'updated', 'level', 'totalKO', 'gold', 'weapons', 'chunks', 'data1', 'data2', 'data3', 'data4', 'data5', 'data6'];
const RANK_HEAD = ['board', 'id', 'name', 'hero', 'score', 'ko', 'time', 'rank', 'date'];
const CHUNK = 45000;   // 1セルの文字数上限(5万)に収まるよう分割

// 初回だけエディタで実行: 権限を承認し、シートを用意する
function setup() {
  sheet_(SHEET_SAVE, SAVE_HEAD);
  sheet_(SHEET_RANK, RANK_HEAD);
  const def = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('シート1');
  if (def && SpreadsheetApp.getActiveSpreadsheet().getSheets().length > 1) SpreadsheetApp.getActiveSpreadsheet().deleteSheet(def);
  Logger.log('準備完了');
}

function sheet_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
// 数式として解釈されないよう無害化
function clean_(s, n) { return String(s == null ? '' : s).replace(/^[=+\-@]/, "'$&").slice(0, n); }
function validId_(id) { return /^[a-z0-9-]{8,40}$/.test(String(id || '')); }
function findRow_(sh, id) {
  const n = sh.getLastRow();
  if (n < 2) return -1;
  const vals = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(id)) return i + 2;
  return -1;
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'load') return out_(load_(p.id));
    if (p.action === 'rank') return out_(rank_(String(p.board || ''), Math.min(100, Number(p.n) || 30)));
    return out_({ ok: true, msg: 'SEIGA cloud is running' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      if (b.action === 'save') return out_(save_(b));
      if (b.action === 'score') return out_(score_(b));
      return out_({ ok: false, error: 'unknown action' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

// セーブ: id ごとに1行(同じ id は上書き)
function save_(b) {
  if (!validId_(b.id)) return { ok: false, error: 'bad id' };
  const data = String(b.data || '');
  if (data.length > CHUNK * 6) return { ok: false, error: 'too large' };
  const sh = sheet_(SHEET_SAVE, SAVE_HEAD);
  const chunks = [];
  for (let i = 0; i < data.length; i += CHUNK) chunks.push('#' + data.slice(i, i + CHUNK));
  const row = [b.id, clean_(b.name, 20), new Date().toISOString(), Number(b.level) || 1, Number(b.totalKO) || 0, Number(b.gold) || 0, Number(b.weapons) || 0, chunks.length];
  for (let i = 0; i < 6; i++) row.push(chunks[i] || '');
  let r = findRow_(sh, b.id);
  if (r < 0) r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, row.length).setValues([row]);
  return { ok: true };
}

function load_(id) {
  if (!validId_(id)) return { ok: false, error: 'bad id' };
  const sh = sheet_(SHEET_SAVE, SAVE_HEAD);
  const r = findRow_(sh, id);
  if (r < 0) return { ok: true, data: null };
  const v = sh.getRange(r, 8, 1, 7).getValues()[0];
  const n = Number(v[0]) || 0;
  let data = '';
  for (let i = 1; i <= n; i++) data += String(v[i]).slice(1);
  return { ok: true, data: data };
}

// 番付: 盤(章_難易度 / endless)ごとに、各プレイヤーの最高記録だけを残す
function score_(b) {
  if (!validId_(b.id)) return { ok: false, error: 'bad id' };
  const board = String(b.board || '');
  if (!/^[a-z0-9_]{2,24}$/.test(board)) return { ok: false, error: 'bad board' };
  const sh = sheet_(SHEET_RANK, RANK_HEAD);
  const n = sh.getLastRow();
  const score = Number(b.score) || 0;
  let r = -1;
  if (n >= 2) {
    const vals = sh.getRange(2, 1, n - 1, 5).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (vals[i][0] === board && String(vals[i][1]) === String(b.id)) {
        if (Number(vals[i][4]) >= score) return { ok: true, best: false };
        r = i + 2;
        break;
      }
    }
  }
  const row = [board, b.id, clean_(b.name, 20), clean_(b.hero, 16), score, Number(b.ko) || 0, Number(b.time) || 0, clean_(b.rank, 12), new Date().toISOString()];
  if (r < 0) r = n + 1;
  sh.getRange(r, 1, 1, row.length).setValues([row]);
  return { ok: true, best: true };
}

function rank_(board, n) {
  const sh = sheet_(SHEET_RANK, RANK_HEAD);
  const last = sh.getLastRow();
  if (last < 2) return { ok: true, rows: [] };
  const rows = sh.getRange(2, 1, last - 1, 9).getValues()
    .filter(function (v) { return v[0] === board; })
    .sort(function (a, b) { return b[4] - a[4]; })
    .slice(0, n)
    .map(function (v) { return { name: String(v[2]).replace(/^'/, ''), hero: v[3], score: v[4], ko: v[5], time: v[6], rank: v[7] }; });
  return { ok: true, rows: rows };
}
