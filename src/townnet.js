// 町で他のプレイヤーと会う(PeerJS・サーバー代なし)
//   町の部屋(seiga-town-v1-1〜6)に最初に入った人が「世話役」になり、全員の位置を集めて配る。
//   世話役が抜けたら、残った人が入り直して新しい世話役が決まる。1部屋12人まで、満員なら次の部屋へ。
import { Net } from './net.js';
import { HERO } from './data.js';
import { EMOTE } from './emotes.js';

const PREFIX = 'seiga-town-v1-', ROOMS = 6, CAP = 12, RATE = 0.25, INFO_RATE = 2, STALE = 6;
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] };
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 16);
const num = (v, lim) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);

export const TownNet = {
  on: false, peer: null, host: false, hostConn: null, conns: new Map(), room: 1,
  others: new Map(),   // id → { n 名前, h 武将, x, z, r 向き, m 速さ, t 最後に届いた時刻 }
  getMe: null, _t: 0, _ti: 0, _retry: null, now: 0,

  start(getMe) { this.getMe = getMe; if (this.on) return; this.on = true; this._join(1); },
  stop() { this.on = false; clearTimeout(this._retry); this._close(); this.others.clear(); },
  count() { return this.others.size + (this.on && this.peer ? 1 : 0); },
  _close() { try { if (this.peer) this.peer.destroy(); } catch (_) { /* noop */ } this.peer = null; this.hostConn = null; this.conns.clear(); this.host = false; },
  _later(fn, ms) { clearTimeout(this._retry); this._retry = setTimeout(() => { if (this.on) fn(); }, ms); },

  // 町の部屋に入る(世話役がいなければ自分がなる)
  async _join(n) {
    if (!this.on) return;
    if (n > ROOMS) { this._later(() => this._join(1), 30000); return; }
    let Peer; try { Peer = await Net.lib(); } catch (_) { this._later(() => this._join(n), 15000); return; }
    this._close(); this.room = n; this.others.clear();
    const p = this.peer = new Peer(undefined, { config: ICE });
    p.on('open', () => {
      if (this.peer !== p) return;
      const c = p.connect(PREFIX + n, { reliable: true });
      c.on('open', () => { if (this.peer !== p) return; this.hostConn = c; this._sendInfo(); });
      c.on('data', (d) => this._fromHost(d, n));
      c.on('close', () => { if (this.peer === p && this.on) this._later(() => this._join(1), 800 + Math.random() * 1800); });
      c.on('error', () => {});
    });
    p.on('error', (e) => {
      if (this.peer !== p) return;
      if (e.type === 'peer-unavailable') this._becomeHost(n);
      else this._later(() => this._join(n), 8000);
    });
  },
  async _becomeHost(n) {
    const Peer = await Net.lib();
    this._close(); this.room = n; this.host = true;
    const p = this.peer = new Peer(PREFIX + n, { config: ICE });
    p.on('error', (e) => {
      if (this.peer !== p) return;
      // ほぼ同時に別の人が世話役になった → その人の部屋に入る
      if (e.type === 'unavailable-id') this._later(() => this._join(n), 300 + Math.random() * 900);
      else this._later(() => this._join(n), 8000);
    });
    p.on('connection', (c) => {
      if (this.conns.size >= CAP - 1) { c.on('open', () => { try { c.send({ t: 'full' }); } catch (_) { /* noop */ } setTimeout(() => c.close(), 300); }); return; }
      const id = c.peer;
      c.on('open', () => { this.conns.set(id, c); });
      c.on('data', (d) => this._fromGuest(d, id));
      c.on('close', () => { this.conns.delete(id); this.others.delete(id); });
      c.on('error', () => {});
    });
  },
  // 世話役 ← 参加者
  _fromGuest(d, id) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'e') { const o = this.others.get(id); if (!o || !EMOTE[d.k] || this.now - (o.eAt || -9) < 0.8) return; o.e = d.k; o.eAt = this.now; o.eN = (o.eN || 0) + 1; for (const [cid, c] of this.conns) if (cid !== id) try { c.send({ t: 'e', id, k: d.k }); } catch (_) { /* noop */ } return; }
    const o = this.others.get(id) || { n: '', h: 'reiga', x: 0, z: 0, r: 0, m: 0 };
    if (d.t === 'info') { o.n = cleanName(d.n); o.h = HERO[d.h] ? d.h : 'reiga'; }
    else if (d.t === 's' && Array.isArray(d.s)) { o.x = num(d.s[0], 200); o.z = num(d.s[1], 200); o.r = num(d.s[2], 10); o.m = num(d.s[3], 20); }
    else return;
    o.t = this.now; this.others.set(id, o);
  },
  // 参加者 ← 世話役
  _fromHost(d, n) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'full') { this._join(n + 1); return; }
    const me = this.peer && this.peer.id;
    if (d.t === 'e') { const o = this.others.get(d.id); if (o && EMOTE[d.k] && d.id !== me) { o.e = d.k; o.eN = (o.eN || 0) + 1; } return; }
    if (d.t === 'all' && Array.isArray(d.l)) {
      for (const e of d.l.slice(0, CAP)) {
        if (!Array.isArray(e) || e[0] === me || typeof e[0] !== 'string') continue;
        const o = this.others.get(e[0]) || { n: '', h: 'reiga' };
        o.x = num(e[1], 200); o.z = num(e[2], 200); o.r = num(e[3], 10); o.m = num(e[4], 20); o.t = this.now;
        this.others.set(e[0], o);
      }
    } else if (d.t === 'info' && Array.isArray(d.l)) {
      for (const e of d.l.slice(0, CAP)) {
        if (!Array.isArray(e) || e[0] === me || typeof e[0] !== 'string') continue;
        const o = this.others.get(e[0]) || { x: 0, z: 0, r: 0, m: 0, t: this.now };
        o.n = cleanName(e[1]); o.h = HERO[e[2]] ? e[2] : 'reiga'; this.others.set(e[0], o);
      }
    }
  },
  // 自分のアクションを町の人へ
  emote(k) {
    if (!this.on || !this.peer || !EMOTE[k]) return;
    if (this.host) { const id = this.peer.id; for (const c of this.conns.values()) try { c.send({ t: 'e', id, k }); } catch (_) { /* noop */ } }
    else if (this.hostConn) try { this.hostConn.send({ t: 'e', k }); } catch (_) { /* noop */ }
  },
  _sendInfo() { const m = this.getMe && this.getMe(); if (m && this.hostConn) try { this.hostConn.send({ t: 'info', n: cleanName(m.n), h: m.h }); } catch (_) { /* noop */ } },
  // 毎フレーム: 一定間隔で位置を送る・配る。古い人を消す
  update(dt) {
    if (!this.on) return;
    this.now += dt; this._t += dt; this._ti += dt;
    for (const [id, o] of this.others) if (this.now - (o.t || 0) > STALE) this.others.delete(id);
    if (this._t < RATE) return; this._t = 0;
    const m = this.getMe && this.getMe(); if (!m || !this.peer) return;
    const s = [Math.round(m.x * 10) / 10, Math.round(m.z * 10) / 10, Math.round(m.r * 100) / 100, Math.round(m.m * 10) / 10];
    if (this.host) {
      const me = this.peer.id, all = [[me, ...s]];
      for (const [id, o] of this.others) all.push([id, o.x, o.z, o.r, o.m]);
      const pkt = { t: 'all', l: all };
      let info = null;
      if (this._ti > INFO_RATE) { this._ti = 0; info = { t: 'info', l: [[me, cleanName(m.n), m.h], ...[...this.others].map(([id, o]) => [id, o.n, o.h])] }; }
      for (const c of this.conns.values()) { try { c.send(pkt); if (info) c.send(info); } catch (_) { /* noop */ } }
    } else if (this.hostConn) {
      try { this.hostConn.send({ t: 's', s }); } catch (_) { /* noop */ }
      if (this._ti > INFO_RATE * 2) { this._ti = 0; this._sendInfo(); }
    }
  },
};
