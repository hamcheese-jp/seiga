// オンライン協力プレイ(最大4人): PeerJS(WebRTC)で端末どうしを直接つなぐ。サーバー代は不要
//   ホスト(部屋を作った側)がゲーム全体を動かし、参加側は操作を送って、届いた状態を描くだけ
import * as THREE from 'three';
import { MS } from './moves.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Voice } from './voice.js';
import { ST } from './horde.js';
import { clamp, damp, angDamp } from './util.js';
import { Input } from './input.js';

const PREFIX = 'seiga-coop-v1-';
export const MAX_PLAYERS = 4;   // 協力プレイの人数(ホストを含む)
export const MAX_PVP = 8;       // 対戦(4対4)の人数
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] };

// ---- 技に通し番号を付ける(相手側で同じ技を再生するため) ----
const MOVE_ID = new Map(), MOVE_BY = {};
for (const [set, ms] of Object.entries(MS)) {
  const reg = (m, id) => { if (m && typeof m === 'object' && !MOVE_ID.has(m)) { MOVE_ID.set(m, id); MOVE_BY[id] = m; } };
  (ms.n || []).forEach((m, i) => reg(m, `${set}.n${i}`)); (ms.c || []).forEach((m, i) => reg(m, `${set}.c${i}`));
  reg(ms.sp, `${set}.sp`); for (const k in ms.m || {}) reg(ms.m[k], `${set}.m.${k}`);
}

// ================= 接続 =================
export const Net = {
  peer: null, conn: null, conns: new Map(), slot: 0, locked: false, max: MAX_PLAYERS, mode: 'coop', role: null, code: '', status: '', handlers: {}, onStatus: null,
  async lib() {
    if (!(window.Peer || window.peerjs)) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/peerjs.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    return window.Peer || window.peerjs.Peer;
  },
  _set(s, info) { this.status = s; if (this.onStatus) this.onStatus(s, info); },
  async host(mode = 'coop') {
    this.close(); const Peer = await this.lib();
    this.mode = mode === 'pvp' ? 'pvp' : 'coop'; this.max = this.mode === 'pvp' ? MAX_PVP : MAX_PLAYERS;
    this.role = 'host'; { const a = new Uint8Array(6); crypto.getRandomValues(a); this.code = Array.from(a, (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join(''); }
    this.peer = new Peer(PREFIX + this.code, { config: ICE });
    this.peer.on('open', () => this._set('wait'));
    this.peer.on('error', (e) => { if (e.type === 'unavailable-id') return this.host(this.mode); this._set('error', e.type); });
    this.peer.on('connection', (c) => {
      // 満員・出撃後は断る
      let slot = 0; for (let i = 1; i < this.max; i++) if (!this.conns.has(i)) { slot = i; break; }
      if (!slot || this.locked) { c.on('open', () => { try { c.send({ t: 'full' }); } catch (_) { /* noop */ } setTimeout(() => c.close(), 400); }); return; }
      this.conns.set(slot, c);
      c.on('open', () => { c.send({ t: 'welcome', slot }); this._set('connected'); });
      c.on('data', (d) => this._recv(d, slot));
      c.on('close', () => { if (this.conns.get(slot) === c) this.conns.delete(slot); this._recv({ t: 'leave' }, slot); this._set(this.conns.size ? 'connected' : 'wait'); });
      c.on('error', () => {});
    });
  },
  // 受信: 種類が文字列で、登録済みの処理があるものだけ通す
  _recv(d, slot) { if (!d || typeof d !== 'object' || typeof d.t !== 'string') return; const h = this.handlers[d.t]; if (h) { try { h(d, slot); } catch (e) { console.warn('net', d.t, e); } } },
  async join(code) {
    this.close(); const Peer = await this.lib();
    this.role = 'guest'; this.code = String(code).toUpperCase();
    this.peer = new Peer(undefined, { config: ICE });
    this.peer.on('open', () => { this._set('connecting'); this._bind(this.peer.connect(PREFIX + this.code, { reliable: true })); });
    this.peer.on('error', (e) => this._set('error', e.type === 'peer-unavailable' ? 'nocode' : e.type));
  },
  _bind(c) {
    this.conn = c;
    c.on('open', () => this._set('connected'));
    c.on('data', (d) => { if (d && d.t === 'welcome') this.slot = d.slot | 0; if (d && d.t === 'full') { this._set('error', 'full'); return; } this._recv(d, 0); });
    c.on('close', () => { this.conn = null; this._set('closed'); });
    c.on('error', () => {});
  },
  on(t, fn) { this.handlers[t] = fn; },
  // ホストは全員へ、参加側はホストへ送る
  send(o) {
    if (this.role === 'host') { for (const c of this.conns.values()) if (c.open) { try { c.send(o); } catch (_) { /* 切断中 */ } } return; }
    if (this.conn && this.conn.open) { try { this.conn.send(o); } catch (_) { /* 切断中 */ } }
  },
  sendTo(slot, o) { const c = this.conns.get(slot); if (c && c.open) { try { c.send(o); } catch (_) { /* noop */ } } },
  get connected() { return this.role === 'host' ? [...this.conns.values()].some((c) => c.open) : !!(this.conn && this.conn.open); },
  get count() { return this.role === 'host' ? 1 + [...this.conns.values()].filter((c) => c.open).length : 0; },
  close() {
    try { if (this.conn) this.conn.close(); } catch (_) { /* noop */ }
    for (const c of this.conns.values()) { try { c.close(); } catch (_) { /* noop */ } }
    try { if (this.peer) this.peer.destroy(); } catch (_) { /* noop */ }
    this.conn = null; this.conns = new Map(); this.peer = null; this.role = null; this.slot = 0; this.locked = false;
  },
};

// ================= ホスト側: 2人目の星牙使いの操作 =================
export class RemoteInput {
  constructor() { this.mx = 0; this.my = 0; this.cy = 0; this.held = { a: false, c: false, d: false, s: false, r: false }; this._press = { a: -9, c: -9, d: -9, s: -9, r: -9 }; this.now = 0; this._swipe = null; }
  // 届いた操作は型と範囲を確かめてから使う
  apply(d) {
    const n = (v, a, b) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : 0);
    this.mx = n(d.mx, -1, 1); this.my = n(d.my, -1, 1); this.cy = n(d.cy, -100, 100); this.held.a = d.ha === true;
    if (typeof d.p === 'string') for (const k of d.p.slice(0, 12)) if (k in this._press) this._press[k] = this.now;
    if (d.sw && typeof d.sw === 'object') { const sw = {}; for (const k in d.sw) { const v = d.sw[k]; if (typeof v === 'number' && Number.isFinite(v)) sw[k] = clamp(v, -1e4, 1e4); else if (typeof v === 'string') sw[k] = v.slice(0, 8); } this._swipe = sw; }
  }
  consume(k, buf = 0.22) { if (this.now - this._press[k] <= buf + 0.12) { this._press[k] = -9; return true; } return false; }
  takeSwipe() { const s = this._swipe; this._swipe = null; return s; }
}

// 参加者から届いた星牙使いの情報を、ありえる範囲に収める(改造した端末による不正対策)
export function sanitizeMember(d, HERO) {
  if (!d || typeof d !== 'object') return null;
  const h = HERO[d.hero]; if (!h) return null;
  const b = h.base, s = d.stats && typeof d.stats === 'object' ? d.stats : {};
  const n = (v, a, mx, def) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, mx) : def);
  const S = {
    lv: n(s.lv, 1, 99, 1) | 0, tier: n(s.tier, 0, 2, 0) | 0, weapon: null,
    hp: n(s.hp, 1, b.hp * 8, b.hp), atk: n(s.atk, 1, b.atk * 12, b.atk), def: n(s.def, 0, b.def * 8 + 50, b.def),
    spd: n(s.spd, 0.1, b.spd * 1.6, b.spd), aspd: n(s.aspd, 0.1, b.aspd * 1.6, b.aspd), range: n(s.range, 0.5, 1.6, 1),
    spGain: n(s.spGain, 0, 2.5, 1), rageGain: n(s.rageGain, 0, 2.5, 1), crit: n(s.crit, 0, 60, 5), steal: n(s.steal, 0, 30, 0),
    elem: n(s.elem, 0, 2.5, 1), charge: n(s.charge, 0, 2.5, 1), musou: n(s.musou, 0, 2.5, 1), exp: 1, gold: 1, luck: n(s.luck, 0, 50, 0), regen: n(s.regen, 0, 20, 0),
    maxN: n(s.maxN, 1, 8, 3) | 0, maxC: n(s.maxC, 0, 8, 1) | 0,
  };
  const name = String(d.name || h.name).replace(/[<>&"'`]/g, '').slice(0, 16) || h.name;
  return { hero: h.id, name, stats: S, slot: d.slot | 0, team: d.team === 1 ? 1 : 0 };
}

// 送る時に余計な参照を外した生成情報
const SPAWN_KEYS = ['team', 'hero', 'heroId', 'vrmKey', 'name', 'title', 'look', 'wtype', 'tier', 'ms', 'elem', 'hp', 'boss'];
export function spawnInfo(o) { const r = {}; for (const k of SPAWN_KEYS) if (o[k] !== undefined) r[k] = o[k]; return r; }

const RIG_MODES = ['loco', 'hit', 'air', 'down', 'getup', 'dodge', 'dead', 'stun', 'victory', 'cast', 'pose'];
const STATES = ['idle', 'atk', 'sp', 'dodge', 'hit', 'air', 'down', 'getup', 'cast', 'dead'];

// ホストの合戦に取り付ける: 状態の送信・演出の記録
export class NetHost {
  constructor(B) {
    this.B = B; this.ev = []; this.sendT = 0; this.sent = new Set(); this.rec = [];
    // 演出・効果音・画面表示を記録して相手にも送る
    const FXN = ['spark', 'hit', 'ring', 'shell', 'pillar', 'tornado', 'bolt', 'spikes', 'crescent', 'crack', 'quake', 'burst', 'elemPillar', 'nova', 'line', 'wave', 'dust', 'smoke'];
    for (const n of FXN) this._wrap(FX, n, 'fx');
    this._wrap(Audio, 'sfx', 'sfx');
    this._wrap(Voice, 'play', 'vp', (a) => [a[0], a[1]]);
    for (const n of ['banner', 'say', 'cutin', 'koBanner', 'pop', 'objective', 'mission', 'stageCard']) this._wrap(B.ui, n, 'ui');
    Net.on('in', (d, slot) => { const p = this.B.remoteOf(slot); if (p && p.inp) p.inp.apply(d); });
    Net.on('leave', (d, slot) => this.B.onMemberLeave(slot));
    // 読み込みが遅れて出現の知らせを取りこぼした参加者へ、もう一度送る
    Net.on('need', (d) => { if (!Array.isArray(d.ids)) return; for (const id of d.ids.slice(0, 60)) { const f = this.B.fighters.find((x) => x.netId === id); if (f) this.ev.unshift(['spawn', f.netId, f.netSpawn]); } });
  }
  _wrap(obj, name, kind, map) {
    const orig = obj[name], self = this;
    if (!orig || orig.__net) return;
    const w = function (...a) { if (self.ev.length < 90) self.ev.push([kind, name, map ? map(a) : a.map((x) => (x && typeof x === 'object' && !Array.isArray(x) ? (x.id ? x.id : null) : x))]); return orig.apply(this, a); };
    w.__net = true; obj[name] = w; this.rec.push([obj, name, orig]);
  }
  dispose() { for (const [o, n, f] of this.rec) o[n] = f; this.rec = []; Net.handlers.in = null; Net.handlers.leave = null; Net.handlers.need = null; }
  event(...e) { this.ev.push(e); }
  tick(dt) {
    const B = this.B;
    for (const r of B.remotes) if (r.inp) r.inp.now += dt;
    this.sendT -= dt; if (this.sendT > 0 || !Net.connected) return;
    this.sendT = 1 / 15;
    // 新しく出てきた武将を知らせる
    for (const f of B.fighters) if (!this.sent.has(f.netId)) { this.sent.add(f.netId); this.ev.unshift(['spawn', f.netId, f.netSpawn]); }
    const F = B.fighters.map((f) => [f.netId, +f.x.toFixed(2), +f.y.toFixed(2), +f.z.toFixed(2), +f.yaw.toFixed(3), Math.round(f.hp), Math.round(f.maxHp),
      STATES.indexOf(f.state), f.move ? MOVE_ID.get(f.move) || '' : '', +(f.mt || 0).toFixed(3), RIG_MODES.indexOf(f.rig.mode), +f.vx.toFixed(2), +f.vz.toFixed(2),
      (f.alive ? 1 : 0) | (f.hidden ? 2 : 0) | (f.flashT > 0 ? 4 : 0) | (f.teleT > 0 ? 8 : 0) | (f.awake > 0 ? 16 : 0) | (f.slowT > 0 ? 32 : 0) | (f.gone ? 64 : 0),
      Math.round(f.sp || 0), Math.round(f.rage || 0)]);
    // 雑兵: 1体 8要素の整数配列
    const H = B.horde, n = H.n, S = new Int16Array(n * 8);
    for (let i = 0; i < n; i++) {
      const s = H.list[i], o = i * 8;
      S[o] = Math.round(s.x * 50); S[o + 1] = Math.round(s.z * 50); S[o + 2] = Math.round((s.y + s.yo) * 100);
      S[o + 3] = Math.round(((s.yaw % 6.2832) + 6.2832) % 6.2832 * 1000); S[o + 4] = Math.round(s.pitch * 1000);
      S[o + 5] = s.st | (s.team << 3) | (s.type << 4) | (s.cap ? 32 : 0) | (s.landed ? 64 : 0) | (s.slow > 0 ? 128 : 0) | (s.burn > 0 ? 256 : 0) | (s.stun > 0 ? 512 : 0) | (s.flash > 0.3 ? 1024 : 0);
      S[o + 6] = Math.round(clamp(s.t, -1, 30) * 1000); S[o + 7] = Math.round(s.mv * 100) | (Math.round((s.ph % 6.2832) * 4) << 11);
    }
    const G = { time: B.time, state: B.state, ko: B.ko, combo: B.combo, morale: B.morale, sealed: B.sealed,
      mission: B.mission ? { title: B.mission.title, t: B.mission.t, target: B.mission.target ? B.mission.target.netId : 0 } : null,
      bases: B.bases.map((b) => [b.team, b.troops, b.alive, b.captain ? 1 : 0]), wave: B.wave, score: B.pvp ? B.score : undefined };
    Net.send({ t: 'snap', F, S: S.buffer, n, G, ev: this.ev.splice(0, 90), you: Object.fromEntries(B.remotes.map((r) => [r.netSlot, r.netId])) });
  }
}

// ================= 参加側: 届いた状態で合戦を描く =================
export class NetGuest {
  constructor(B) {
    this.B = B; this.map = new Map(); this.snap = null; this.inT = 0; this.ended = false; this.pend = '';
    // 押したボタンを取りこぼさず送るため、押した瞬間を記録する
    this._origPress = Input.press; const self = this;
    Input.press = function (k) { if ('acdsr'.includes(k)) self.pend += k; return self._origPress.call(Input, k); };
    this.evq = [];
    Net.on('snap', (d) => { if (d.ev && d.ev.length) this.evq.push(...d.ev); if (this.evq.length > 600) this.evq.splice(0, this.evq.length - 600); this.snap = d; this.fresh = true; });
    Net.on('end', (d) => { this.endData = d; });
  }
  dispose() { Net.handlers.snap = null; Net.handlers.end = null; Input.press = this._origPress; }
  // 自分の操作をホストへ
  sendInput(dt) {
    this.inT -= dt; if (this.inT > 0 && !this.pend) return;
    this.inT = 1 / 30;
    const sw = Input._swipe ? Input.takeSwipe() : null;
    Net.send({ t: 'in', mx: +Input.mx.toFixed(2), my: +Input.my.toFixed(2), cy: +this.B.cam.yaw.toFixed(3), ha: Input.held.a, p: this.pend, sw });
    this.pend = '';
  }
  apply(dt) {
    const B = this.B, d = this.snap;
    if (!d) return;
    if (this.fresh) {
      this.fresh = false;
      // 出現・演出
      this.you = d.you && typeof d.you === 'object' ? d.you[Net.slot] || 0 : d.you;
      const q = this.evq; this.evq = [];
      for (const e of q) if (e[0] === 'spawn' || !this.lagging) this._event(e);
      // 武将
      const seen = new Set();
      for (const a of d.F) {
        const [id] = a; seen.add(id);
        let f = this.map.get(id);
        if (!f && id === this.you) { f = B.player; f.netId = id; this.map.set(id, f); }
        if (!f) { (this.miss || (this.miss = new Set())).add(id); continue; }
        f.net = a;
      }
      for (const [id, f] of this.map) if (!seen.has(id) && f !== B.player) { f.gone = true; this.map.delete(id); }
      if (this.miss && this.miss.size && (!this.needT || B.rt - this.needT > 1)) { this.needT = B.rt; Net.send({ t: 'need', ids: [...this.miss].slice(0, 60) }); this.miss.clear(); }
      // 雑兵
      const S = new Int16Array(d.S), H = B.horde;
      H.n = d.n;
      for (let i = 0; i < d.n; i++) {
        let s = H.list[i]; if (!s) { s = { x: 0, z: 0, y: 0, yo: 0, scale: 1, ph: 0 }; H.list[i] = s; }
        const o = i * 8, fl = S[o + 5];
        const nx = S[o] / 50, nz = S[o + 1] / 50;
        if (s.__g !== 1 || Math.abs(nx - s.x) > 4 || Math.abs(nz - s.z) > 4) { s.x = nx; s.z = nz; }
        s.tx = nx; s.tz = nz; s.__g = 1;
        s.y = Math.max(0, S[o + 2] / 100); s.yo = Math.min(0, S[o + 2] / 100); s.yaw = S[o + 3] / 1000; s.pitch = S[o + 4] / 1000;
        s.st = fl & 7; s.team = (fl >> 3) & 1; s.type = (fl >> 4) & 1; s.cap = !!(fl & 32); s.landed = !!(fl & 64); s.slow = fl & 128 ? 1 : 0; s.burn = fl & 256 ? 1 : 0; s.stun = fl & 512 ? 1 : 0;
        if (fl & 1024) s.flash = 1;
        s.t = S[o + 6] / 1000; s.mv = (S[o + 7] & 2047) / 100; s.ph = (S[o + 7] >> 11) / 4; s.scale = s.cap ? 1.34 : 1.0; s.alive = s.st !== ST.DEAD;
      }
      // 合戦全体
      const G = d.G;
      B.time = G.time; B.ko = G.ko; B.combo = G.combo; B.morale = G.morale; B.wave = G.wave;
      if (G.sealed !== B.sealed) { B.sealed = G.sealed; if (!G.sealed && B.dome) { GFX_remove(B); } }
      B.mission = G.mission ? { title: G.mission.title, t: G.mission.t, target: this.map.get(G.mission.target) || null } : null;
      G.bases.forEach((v, i) => { const b = B.bases[i]; if (!b) return; b.team = v[0]; b.troops = v[1]; b.alive = v[2]; b.captain = v[3] ? {} : null; });
      if (G.state !== B.state && (G.state === 'play' || G.state === 'win' || G.state === 'lose')) { B.state = G.state; B.stateT = 0; }
    }
    // 雑兵を目標位置へなめらかに
    const H = B.horde;
    for (let i = 0; i < H.n; i++) { const s = H.list[i]; if (s.tx !== undefined) { s.x = damp(s.x, s.tx, 12, dt); s.z = damp(s.z, s.tz, 12, dt); } if (s.flash > 0) s.flash -= dt * 5; }
    // 武将を目標へ
    for (const f of B.fighters) if (f.net) netFighter(f, dt);
  }
  _event(e) {
    const B = this.B, [kind, name, args] = e;
    if (kind === 'spawn') {
      const id = name, info = args;
      if (this.map.has(id)) return;
      if (id === this.you) { B.player.netId = id; this.map.set(id, B.player); return; }
      const f = B._add({ ...info, x: 0, z: 0, puppet: true });
      f.netId = id; f.ai = null; this.map.set(id, f);
      return;
    }
    try {
      if (kind === 'fx' && FX[name]) FX[name](...args);
      else if (kind === 'sfx') Audio.sfx(...args);
      else if (kind === 'vp') Voice.play(args[0], args[1], { force: true });
      else if (kind === 'ui' && B.ui[name]) { if (name === 'stageCard') return; B.ui[name](...args); }
      else if (kind === 'hurt') { if (name === undefined || name === Net.slot) { B.ui.hurt(); Audio.sfx('hurt'); } }
    } catch (_) { /* 演出の失敗は無視 */ }
  }
}
function GFX_remove(B) { if (B.dome) { B.dome.visible = false; } }

// 相手側の武将: 届いた状態に合わせて位置・動きを再現
const _v = new THREE.Vector3();
function netFighter(f, dt) {
  const a = f.net;
  const [, x, y, z, yaw, hp, maxHp, st, mid, mt, rm, vx, vz, fl, sp, rage] = a;
  const far = Math.abs(x - f.x) + Math.abs(z - f.z) > 5;
  f.x = far ? x : damp(f.x, x, 14, dt); f.z = far ? z : damp(f.z, z, 14, dt); f.y = damp(f.y, y, 16, dt);
  f.yaw = angDamp(f.yaw, yaw, 18, dt);
  f.hp = hp; f.maxHp = maxHp; f.vx = vx; f.vz = vz; f.sp = sp; f.rage = rage;
  f.alive = !!(fl & 1); f.hidden = !!(fl & 2); f.flashT = fl & 4 ? 0.1 : 0; f.teleT = fl & 8 ? 0.1 : 0; f.awake = fl & 16 ? 1 : 0; f.slowT = fl & 32 ? 0.1 : 0;
  const state = STATES[st] || 'idle'; f.state = state;
  const mv = mid ? MOVE_BY[mid] : null;
  if (mv !== f.move) {
    f.move = mv;
    if (mv) { f.rig.play(mv); f.mt = mt; f.sfxI = 0; } else { f.rig.stop(); f.trailOn = false; }
  }
  if (mv) {
    f.mt = Math.abs(f.mt - mt) > 0.15 ? mt : f.mt + dt; f.rig.mt = f.mt;
    // 効果音・剣の軌跡は手元で再現
    const SF = mv.sfx || [];
    while (f.sfxI < SF.length && SF[f.sfxI][0] <= f.mt) { if (f.B.nearCam(f.x, f.z, 28)) Audio.sfx(SF[f.sfxI][1], 0.7); f.sfxI++; }
    let on = false; for (const w of mv.trail || []) if (f.mt >= w[0] && f.mt <= w[1]) { on = true; break; }
    if (on && !f.trailOn) { f.ti ^= 1; f.trails[f.ti].n = 0; if (f.trailsL) f.trailsL[f.ti].n = 0; }
    f.trailOn = on;
  }
  f.rig.setMode(RIG_MODES[rm] || 'loco');
  if (f.alive && f.st) { f.st = 0; f.model.root.scale.setScalar(f.model.scale); }
  if (!f.alive && state === 'dead') {
    f.st = (f.st || 0) + dt;
    if (f.st > 2.4) { const s = Math.max(0.001, 1 - (f.st - 2.4) / 0.5) * f.model.scale; f.model.root.scale.setScalar(s); }
  }
  if (fl & 64) f.gone = true;
  f._syncRig(dt);
  if (f.tag && Math.abs(f.hp / f.maxHp - f.tagHp) > 0.012) f._drawTag();
}
export { MOVE_ID, MOVE_BY };
