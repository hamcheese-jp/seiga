// 入力: タッチ(仮想スティック+ボタン+視点ドラッグ) / キーボード / マウス / ゲームパッド
const KEYMAP = {
  KeyJ: 'a', KeyZ: 'a', Enter: 'a',
  KeyK: 'c', KeyX: 'c',
  KeyL: 'd', KeyC: 'd', Space: 'd', ShiftLeft: 'd',
  KeyI: 's', KeyV: 's',
  KeyU: 'r', KeyB: 'r',
};
const PADMAP = { 2: 'a', 3: 'c', 0: 'd', 1: 's', 5: 'r', 4: 'r' };

export const Input = {
  mx: 0, my: 0, camDX: 0, camDY: 0,
  held: { a: false, c: false, d: false, s: false, r: false },
  _press: { a: -9, c: -9, d: -9, s: -9, r: -9, pause: -9 },
  _keys: {}, _pad: {}, now: 0, active: false, usedTouch: false,
  _stickId: null, _camId: null, _sx: 0, _sy: 0, _lx: 0, _ly: 0, _tx: 0, _ty: 0,

  init() {
    const layer = document.getElementById('touch');
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) { this.usedTouch = true; document.body.classList.add('touch'); }
    const R = 58;
    const down = (e) => {
      if (!this.active || e.target.closest('.btn')) return;
      e.preventDefault();
      const touch = e.pointerType !== 'mouse';
      if (touch && !this.usedTouch) { this.usedTouch = true; document.body.classList.add('touch'); }
      if (touch && e.clientX < innerWidth * 0.42 && this._stickId === null) {
        this._stickId = e.pointerId; this._sx = e.clientX; this._sy = e.clientY;
        stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.classList.add('on');
        knob.style.transform = 'translate(-50%,-50%)';
      } else if (this._camId === null) {
        this._camId = e.pointerId; this._lx = e.clientX; this._ly = e.clientY;
        // スワイプ(素早い一振り=回避)かカメラ操作かを見極めるまで、視点移動は保留する
        this._c0x = e.clientX; this._c0y = e.clientY; this._c0t = performance.now(); this._cCommit = false; this._cpx = 0; this._cpy = 0;
      }
      try { layer.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    };
    const move = (e) => {
      if (e.pointerId === this._stickId) {
        let dx = e.clientX - this._sx, dy = e.clientY - this._sy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this._tx = dx / R; this._ty = -dy / R;
      } else if (e.pointerId === this._camId) {
        const dx = e.clientX - this._lx, dy = e.clientY - this._ly;
        this._lx = e.clientX; this._ly = e.clientY;
        if (this._cCommit) { this.camDX += dx; this.camDY += dy; }
        else {
          this._cpx += dx; this._cpy += dy;
          if (performance.now() - this._c0t > 240 || Math.hypot(e.clientX - this._c0x, e.clientY - this._c0y) > 130) { this._cCommit = true; this.camDX += this._cpx; this.camDY += this._cpy; }
        }
      }
    };
    const up = (e) => {
      if (e.pointerId === this._stickId) { this._stickId = null; this._tx = this._ty = 0; stick.classList.remove('on'); stick.style.left = ''; stick.style.top = ''; knob.style.transform = 'translate(-50%,-50%)'; }
      if (e.pointerId === this._camId) {
        if (!this._cCommit && this.active) {
          // 短く素早い一振り → スワイプ回避
          const dt = performance.now() - this._c0t, dx = e.clientX - this._c0x, dy = e.clientY - this._c0y, d = Math.hypot(dx, dy);
          if (dt < 300 && d >= 26) { this._swipe = { x: dx / d, y: -dy / d }; this.press('d'); }
        }
        this._camId = null;
      }
    };
    layer.addEventListener('pointerdown', down);
    layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', up);
    layer.addEventListener('pointercancel', up);
    layer.addEventListener('contextmenu', (e) => e.preventDefault());

    for (const b of layer.querySelectorAll('.btn')) {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!this.active) return;
        this.usedTouch = e.pointerType !== 'mouse' || this.usedTouch;
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
        this.press(k); b.classList.add('on');
      });
      const rel = () => { this.release(k); b.classList.remove('on'); };
      b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('lostpointercapture', rel);
    }

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this._keys[e.code] = true;
      const k = KEYMAP[e.code];
      if (k && this.active) { this.press(k); e.preventDefault(); }
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.active) this.press('pause');
    });
    addEventListener('keyup', (e) => { this._keys[e.code] = false; const k = KEYMAP[e.code]; if (k) this.release(k); });
    addEventListener('blur', () => { this._keys = {}; for (const k in this.held) this.held[k] = false; this._tx = this._ty = 0; });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  },

  press(k) { this._press[k] = this.now; if (k in this.held) this.held[k] = true; },
  release(k) { if (k in this.held) this.held[k] = false; },
  // 直近 buf 秒以内に押されていれば true(押下を消費)
  consume(k, buf = 0.22) { if (this.now - this._press[k] <= buf) { this._press[k] = -9; return true; } return false; },
  // スワイプ方向(スティック座標系)を1回だけ取り出す
  takeSwipe() { const s = this._swipe; this._swipe = null; return s; },
  clear() { for (const k in this._press) this._press[k] = -9; for (const k in this.held) this.held[k] = false; this.camDX = this.camDY = 0; this._swipe = null; },

  update(dtReal) {
    this.now += dtReal;
    const K = this._keys;
    let x = this._tx, y = this._ty;
    if (K.KeyA) x -= 1; if (K.KeyD) x += 1; if (K.KeyW) y += 1; if (K.KeyS) y -= 1;
    if (K.ArrowLeft) this.camDX -= 420 * dtReal; if (K.ArrowRight) this.camDX += 420 * dtReal;
    if (K.ArrowUp) this.camDY -= 200 * dtReal; if (K.ArrowDown) this.camDY += 200 * dtReal;
    // ゲームパッド
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes;
      if (Math.abs(ax[0]) > 0.18 || Math.abs(ax[1]) > 0.18) { x += ax[0]; y -= ax[1]; }
      if (ax.length > 3) {
        if (Math.abs(ax[2]) > 0.18) this.camDX += ax[2] * 520 * dtReal;
        if (Math.abs(ax[3]) > 0.18) this.camDY += ax[3] * 260 * dtReal;
      }
      for (const bi in PADMAP) {
        const on = gp.buttons[bi] && gp.buttons[bi].pressed, key = PADMAP[bi], id = 'p' + bi;
        if (on && !this._pad[id]) { if (this.active) this.press(key); }
        else if (!on && this._pad[id]) this.release(key);
        this._pad[id] = on;
      }
      const st = gp.buttons[9] && gp.buttons[9].pressed;
      if (st && !this._pad.st && this.active) this.press('pause');
      this._pad.st = st;
      break;
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    if (l < 0.14) { x = 0; y = 0; }
    this.mx = x; this.my = y;
  },
  endFrame() { this.camDX = 0; this.camDY = 0; },
};
