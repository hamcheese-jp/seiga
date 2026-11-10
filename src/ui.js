// 画面UI: 合戦HUD・演出テロップ・各メニュー画面(DOM)
import { Save, Cloud } from './save.js';
import { HEROES, HERO, ELEMENTS, STAGES, ENDLESS, STAGE, DIFFS, RARITY, RAR_MAXLV, traitText, weaponName, weaponAtk, forgeCost, sellPrice, GACHA_COST, rollWeapon, calcStats, expNeed,
  ACHIEVEMENTS, STAR_LABELS, UNLOCKS, GAME_TITLE, GAME_SUB, MAX_LV, maxNormals, maxCharges } from './data.js';
import { VERSION } from './config.js';
import { Install } from './install.js';
import { Audio } from './audio.js';
import { GFX } from './gfx.js';
import { $, el, fmtTime, clamp } from './util.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SCREENS = ['title', 'home', 'stage', 'hero', 'armory', 'ach', 'rank', 'settings', 'result', 'pause', 'load'];
const TIPS = ['通常攻撃の途中でチャージ攻撃を押すと、段数に応じた強力な技に派生します。', '敵将の武器が赤く光ったら強攻撃の合図。回避でかわそう。', '攻撃が当たる直前に回避すると「見切り」が発動し、奥義ゲージが大きく溜まります。',
  '敵拠点は兵を倒し続けると兵長が出現。兵長を倒せば制圧できます。', '拠点を制圧すると体力が回復し、味方の士気が上がります。', '覚醒中は攻撃力・攻撃速度が上がり、怯まなくなります。覚醒中の奥義は「真・奥義」に強化。',
  '武器には特性が付きます。鍛錬で攻撃力を上げ、自分好みの一振りを探しましょう。', '高難易度ほど良い武器が手に入りやすくなります。', '攻撃ボタンは押しっぱなしでも連続攻撃できます。'];

export const UI = {
  app: null, cur: '', sel: { hero: 'reiga', stage: 's1', diff: 1 }, armHero: null, armSel: null, rankBoard: null, lastResult: null,
  _f: 0, _bq: [], _bBusy: false, _ko: -1, _combo: -1, _hpT: -1, _says: [], map: null,

  init(app) {
    this.app = app;
    const m = $('#menus');
    for (const s of SCREENS) m.appendChild(el('div', 'screen', '')).id = 's-' + s;
    m.addEventListener('click', (e) => { const t = e.target.closest('[data-a]'); if (t) { e.preventDefault(); this.act(t.dataset.a, t.dataset.v, t); } });
    m.addEventListener('input', (e) => { const t = e.target; if (t.dataset && t.dataset.s) this.setting(t.dataset.s, t); });
    m.addEventListener('change', (e) => { const t = e.target; if (t.dataset && t.dataset.s) this.setting(t.dataset.s, t, true); });
    $('#btn-pause').addEventListener('click', () => this.app.pause());
    this.E = {};
    for (const id of ['hp-fill', 'hp-text', 'sp-fill', 'rg-fill', 'pl-name', 'pl-lv', 'obj', 'mor-a', 'timer', 'mission', 'ko-n', 'combo', 'combo-n', 'h-target', 'tg-name', 'tg-fill', 'h-base', 'bs-name', 'bs-fill', 'h-say', 'h-fps', 'banner', 'cutin', 'card', 'kob', 'pops', 'toast', 'hurt']) this.E[id] = document.getElementById(id);
    this.mctx = $('#minimap').getContext('2d');
    this.bS = $('.b-s'); this.bR = $('.b-r');
    Install.onChange(() => { if (this.cur === 'title' || this.cur === 'home') this.show(this.cur); });
    const S = Save.data; this.sel = { ...S.last };
  },

  // ================= 画面切替 =================
  show(name) {
    for (const s of SCREENS) $('#s-' + s).classList.toggle('on', s === name);
    this.cur = name;
    if (name && this['r_' + name]) this['r_' + name]();
    $('#hud').classList.toggle('hide', name !== '' && name !== 'pause');
    $('#touch').classList.toggle('hide', name !== '');
    if (this.app.onScreen) this.app.onScreen(name);
  },
  html(name, h, dim) { const s = $('#s-' + name); s.innerHTML = h; s.classList.toggle('dim', !!dim); },
  fade(on) { $('#fade').classList.toggle('on', on); },
  head(title, back, extra = '') { return `<div class="head"><button class="back" data-a="go" data-v="${back}">← 戻る</button><div class="ttl">${title}</div><div class="sp"></div>${extra}<div class="goldv">${Save.data.gold.toLocaleString()}</div></div>`; },

  act(a, v, t) {
    const S = Save.data, sel = this.sel;
    Audio.resume();
    switch (a) {
      case 'start': Audio.sfx('ok'); Audio.bgm('title'); this.show('home'); this.app.cloudSync(); break;
      case 'go': Audio.sfx(v === 'home' || v === 'stage' ? 'back' : 'ui'); if (v === 'endless') { sel.stage = 'endless'; v = 'hero'; } if (v === 'armory') { this.armHero = sel.hero; this.armSel = null; } this.show(v); break;
      case 'stage': Audio.sfx('ui'); sel.stage = v; this.r_stage(); break;
      case 'diff': Audio.sfx('ui'); sel.diff = +v; this.r_stage(); break;
      case 'tohero': Audio.sfx('ok'); this.show('hero'); break;
      case 'hero': Audio.sfx('ui'); sel.hero = v; this.app.lobbyHero(v); this.r_hero(); break;
      case 'sortie': if (!S.unlockedHeroes.includes(sel.hero)) { Audio.sfx('deny'); break; } Audio.sfx('ok'); S.last = { ...sel }; Save.persist(false); this.app.startBattle(sel); break;
      case 'ahero': Audio.sfx('ui'); this.armHero = v; this.armSel = null; this.app.lobbyHero(v); this.r_armory(); break;
      case 'wsel': Audio.sfx('ui'); this.armSel = v; this.r_armory(); break;
      case 'equip': { Audio.sfx('ok'); S.heroes[this.armHero].weapon = this.armSel; Save.persist(); this.app.lobbyHero(this.armHero, true); this.r_armory(); break; }
      case 'forge': { const w = S.weapons.find((x) => x.uid === this.armSel), c = forgeCost(w);
        if (S.gold < c || w.lv >= RAR_MAXLV[w.rar]) { Audio.sfx('deny'); break; }
        S.gold -= c; w.lv++; Audio.sfx('levelup'); this.toast(`${weaponName(w)} に鍛え上げた!`); Save.checkAch().forEach((x) => this.toast(`実績達成: ${x.n}`)); Save.persist(); this.r_armory(); break; }
      case 'sell': { const w = S.weapons.find((x) => x.uid === this.armSel);
        if (!w || Object.values(S.heroes).some((h) => h.weapon === w.uid)) { Audio.sfx('deny'); break; }
        S.gold += sellPrice(w); S.weapons.splice(S.weapons.indexOf(w), 1); this.armSel = null; Audio.sfx('pickup'); Save.persist(); this.r_armory(); break; }
      case 'sellall': { const eq = new Set(Object.values(S.heroes).map((h) => h.weapon)), wt = HERO[this.armHero].wtype; let g = 0, n = 0;
        for (let i = S.weapons.length - 1; i >= 0; i--) { const w = S.weapons[i]; if (w.type === wt && w.rar <= +v && !eq.has(w.uid) && !w.lock && w.lv === 0) { g += sellPrice(w); S.weapons.splice(i, 1); n++; } }
        if (n) { S.gold += g; Audio.sfx('pickup'); this.toast(`${n}本を売却(+${g}金)`); Save.persist(); } else Audio.sfx('deny'); this.armSel = null; this.r_armory(); break; }
      case 'lock': { const w = S.weapons.find((x) => x.uid === this.armSel); if (w) { w.lock = !w.lock; Audio.sfx('ui'); Save.persist(false); this.r_armory(); } break; }
      case 'gacha': {
        if (S.gold < GACHA_COST) { Audio.sfx('deny'); this.toast('金が足りません'); break; }
        S.gold -= GACHA_COST; const w = rollWeapon(HERO[this.armHero].wtype, this.gachaPower(), 20, 2); S.weapons.push(w); this.armSel = w.uid;
        Audio.sfx(w.rar >= 4 ? 'capture' : 'treasure'); this.toast(`${RARITY[w.rar].star} ${weaponName(w)} を錬成した!`); Save.checkAch().forEach((x) => this.toast(`実績達成: ${x.n}`)); Save.persist(); this.r_armory(); break; }
      case 'board': Audio.sfx('ui'); this.rankBoard = v; this.r_rank(); break;
      case 'again': Audio.sfx('ok'); this.app.startBattle(sel); break;
      case 'resume': Audio.sfx('ui'); this.app.resume(); break;
      case 'retire': Audio.sfx('back'); this.app.retire(); break;
      case 'csave': Cloud.push().then(() => { this.toast(Save.cloudState); if (this.cur === 'settings') this.r_settings(); }); this.toast('クラウドへ保存中…'); break;
      case 'cload': this.app.cloudRestore($('#restore-id') ? $('#restore-id').value.trim() : ''); break;
      case 'copyid': if (navigator.clipboard) navigator.clipboard.writeText(S.id).then(() => this.toast('引き継ぎコードをコピーしました')); break;
      case 'reset': this.confirm('すべてのセーブデータを消去します。よろしいですか?', () => { Save.reset(); this.sel = { ...Save.data.last }; this.app.lobbyHero(this.sel.hero); this.toast('データを初期化しました'); this.show('home'); }); break;
      case 'mok': { const f = this._mok; this.closeModal(); if (f) f(); break; }
      case 'mno': this.closeModal(); break;
      case 'install': this.install(); break;
    }
  },
  confirm(msg, ok) {
    this._mok = ok;
    const d = el('div', 'modal', `<div class="panel"><p style="font-size:14px">${msg}</p><div class="row" style="justify-content:center;margin-top:12px"><button class="sbtn" data-a="mno">やめる</button><button class="pbtn" data-a="mok">実行</button></div></div>`);
    d.id = 'modal'; $('#menus').appendChild(d);
  },
  closeModal() { const m = $('#modal'); if (m) m.remove(); this._mok = null; },
  setting(k, t, done) {
    const set = Save.data.settings;
    if (k === 'name') { Save.data.name = t.value.slice(0, 12) || '名もなき武将'; if (done) Save.persist(); return; }
    if (k === 'cloudUrl') { set.cloudUrl = t.value.trim(); if (done) { Save.persist(false); this.r_settings(); if (Cloud.enabled()) this.toast('スプレッドシート連携を有効にしました'); } return; }
    if (t.type === 'checkbox') set[k] = t.checked; else if (t.type === 'range') set[k] = +t.value; else set[k] = t.value;
    if (k === 'bgm' || k === 'sfx') Audio.setVol(set.bgm, set.sfx);
    if (k === 'quality' && done) { GFX.setQuality(set.quality); this.toast('画質を変更しました(兵数などは次の合戦から反映)'); }
    if (k === 'fps') this.E['h-fps'].textContent = '';
    if (done) Save.persist(false);
  },
  stageOpen(i) { return i === 0 || Save.stageCleared(STAGES[i - 1].id); },
  diffOpen(i) {
    if (i <= 2) return true;
    if (i === 3) return STAGES.every((s) => Save.stageCleared(s.id));
    const s5 = Save.data.stages.s5; return !!(s5 && s5.chaos && s5.chaos.clear);
  },
  gachaPower() { let p = 6; STAGES.forEach((s) => { const st = Save.data.stages[s.id]; if (st) for (const d of DIFFS) if (st[d.id] && st[d.id].clear) p = Math.max(p, s.lv * 2.2 + d.pow + 6); }); return p; },

  // ================= アプリとして追加 =================
  installBtn(cls) { return Install.installed() ? '' : `<button class="inst ${cls}" data-a="install">📲 アプリとして追加</button>`; },
  async install() {
    Audio.sfx('ui');
    if (Install.canPrompt()) { if (await Install.prompt()) this.toast('ホーム画面に追加しました'); return; }
    let body;
    if (Install.inApp && Install.isAndroid) {
      body = `<p>今はLINEなどの<b>アプリ内ブラウザ</b>で開いているため、ホーム画面に追加できません。</p>
        <p><a class="pbtn" style="display:inline-block;text-decoration:none" href="${Install.chromeUrl()}">Chromeで開き直す</a></p>
        <p class="note">開けない場合は、右上の「︙」→「ブラウザで開く」を選んでください。</p>`;
    } else if (Install.inApp) {
      body = `<p>今はLINEなどの<b>アプリ内ブラウザ</b>で開いています。</p><p>右下(または右上)のメニューから「<b>Safariで開く</b>」を選び、Safariでもう一度このボタンを押してください。</p>`;
    } else if (Install.isIOS) {
      body = `<p>Safariの下にある <b>共有ボタン(□に↑)</b> を押し、<b>「ホーム画面に追加」</b> を選んでください。</p><p class="note">ChromeなどSafari以外で開いている場合は、Safariで開き直してください。</p>`;
    } else if (Install.isAndroid) {
      body = `<p>Chromeの右上 <b>「︙」</b> を押し、<b>「アプリをインストール」</b> または <b>「ホーム画面に追加」</b> を選んでください。</p>
        <p class="note">項目が無いときは、少し待ってからページを再読み込みしてください。Chrome以外のブラウザでは追加できない場合があります。</p>`;
    } else {
      body = `<p>アドレスバー右端の <b>インストールのアイコン</b> を押してください。</p><p class="note">スマホでは公開URLをChrome(Android)かSafari(iPhone)で開いてください。</p>`;
    }
    const d = el('div', 'modal', `<div class="panel"><h3>アプリとして追加</h3>${body}<div class="row" style="justify-content:center;margin-top:10px"><button class="sbtn" data-a="mno">閉じる</button></div></div>`);
    d.id = 'modal'; this.closeModal(); $('#menus').appendChild(d);
  },

  // ================= 各画面 =================
  r_title() {
    this.html('title', `<div class="logo">${GAME_TITLE}</div><div class="logo-sub">${GAME_SUB}</div><div class="tap">画面をタップして開始</div><div class="ver">ver ${VERSION}</div>${this.installBtn('inst-title')}`);
    $('#s-title').dataset.a = 'start';
  },
  r_home() {
    const S = Save.data, h = HERO[this.sel.hero];
    this.html('home', `<div class="head"><div class="who">${esc(S.name)}</div><div class="sp"></div>${this.installBtn('inst-home')}<div class="goldv">${S.gold.toLocaleString()}</div></div>
      <div class="home-menu">
        <button class="mbtn main" data-a="go" data-v="stage">出陣<small>章を選んで合戦へ</small></button>
        <button class="mbtn" ${Save.stageCleared('s1') ? 'data-a="go" data-v="endless"' : 'style="opacity:.45"'}>無限戦場<small>${Save.stageCleared('s1') ? `最高 ${S.endless.ko}人撃破 / 第${S.endless.wave}波` : '第一章クリアで解放'}</small></button>
        <button class="mbtn" data-a="go" data-v="armory">武器庫<small>装備・鍛錬・錬成</small></button>
        <button class="mbtn" data-a="go" data-v="ach">実績<small>${Object.keys(S.ach).length} / ${ACHIEVEMENTS.length} 達成</small></button>
        <button class="mbtn" data-a="go" data-v="rank">番付<small>全国ランキング</small></button>
        <button class="mbtn" data-a="go" data-v="settings">設定<small>画質・音量・データ保存</small></button>
      </div>`);
    this.app.lobbyHero(h.id);
  },
  r_stage() {
    const S = Save.data, sel = this.sel;
    if (sel.stage === 'endless' || !STAGE[sel.stage]) sel.stage = 's1';
    if (!this.diffOpen(sel.diff)) sel.diff = 1;
    const cur = STAGE[sel.stage], d = DIFFS[sel.diff], rec = (S.stages[cur.id] || {})[d.id];
    const lv = S.heroes[sel.hero].lv;
    this.html('stage', `${this.head('出陣', 'home')}
      <div class="tabs">${DIFFS.map((x, i) => `<button class="tab ${i === sel.diff ? 'on' : ''} ${this.diffOpen(i) ? '' : 'lock'}" ${this.diffOpen(i) ? `data-a="diff" data-v="${i}"` : ''} style="color:${x.col}">${x.n}</button>`).join('')}</div>
      <div class="cols"><div class="l scroll">${STAGES.map((s, i) => {
        const open = this.stageOpen(i), r = (S.stages[s.id] || {})[d.id];
        return `<div class="card ${s.id === cur.id ? 'on' : ''} ${open ? '' : 'lock'}" ${open ? `data-a="stage" data-v="${s.id}"` : ''}>${r && r.clear ? `<span class="rank ${r.rank}">${r.rank}</span>` : ''}<div class="a"><span class="no">${s.no}</span>${open ? s.name : '？？？'}</div><div class="b">${open ? `推奨Lv ${s.lv}` : '前の章をクリアで解放'}</div></div>`;
      }).join('')}</div>
      <div class="r"><div class="panel scroll" style="flex:1"><h3>${cur.name}</h3><p>${cur.intro}</p>
        <p>推奨Lv <b style="color:${lv >= cur.lv ? '#9dff9d' : '#ff8a6a'}">${cur.lv}</b>(選択中の武将 Lv${lv}) / 難易度 <b style="color:${d.col}">${d.n}</b> — 報酬 ×${d.rew}</p>
        <p class="dim-t">${rec && rec.clear ? `最高評価 ${rec.rank} / 最多撃破 ${rec.ko}人 / 最速 ${fmtTime(rec.time)}` : '未クリア'}</p>
        <p class="dim-t">目標: 敵拠点を${cur.sealNeed}つ制圧して結界を解き、総大将を討て。</p></div>
        <div class="row" style="justify-content:flex-end"><button class="pbtn" data-a="tohero">武将選択へ</button></div></div></div>`);
  },
  r_hero() {
    const S = Save.data, sel = this.sel;
    const h = HERO[sel.hero], hs = S.heroes[h.id], st = calcStats(S, h.id), E = ELEMENTS[h.elem], w = st.weapon, open = S.unlockedHeroes.includes(h.id);
    const need = Object.entries(UNLOCKS).find(([, v]) => v === h.id);
    const info = sel.stage === 'endless' ? ENDLESS.name : `${STAGE[sel.stage].name} / ${DIFFS[sel.diff].n}`;
    this.html('hero', `${this.head('武将選択', sel.stage === 'endless' ? 'home' : 'stage', `<div class="dim-t" style="font-size:12px;text-shadow:0 1px 3px #000">${info}</div>`)}
      <div class="cols hero"><div class="l"><div class="heroes">${HEROES.map((x) => { const u = S.unlockedHeroes.includes(x.id);
        return `<div class="hsel ${x.id === h.id ? 'on' : ''} ${u ? '' : 'lock'}" style="--ec:${ELEMENTS[x.elem].css}" data-a="hero" data-v="${x.id}"><b>${x.name}</b><i>${u ? 'Lv' + S.heroes[x.id].lv : '未解放'}</i></div>`; }).join('')}</div></div>
      <div class="r"><div class="panel scroll" style="flex:1">
        <div class="htitle">${h.title}</div><div class="hname">${h.name}<span class="elem" style="background:${E.css}">${E.n}</span></div>
        <p>${h.desc}</p>
        <div class="stars">${STAR_LABELS.map((l, i) => `<span>${l}</span><span>${'★'.repeat(h.stars[i])}${'☆'.repeat(5 - h.stars[i])}</span>`).join('')}</div>
        ${open ? `<div class="stat"><span>Lv<b>${hs.lv}</b></span><span>体力<b>${st.hp}</b></span><span>攻撃<b>${st.atk}</b></span><span>防御<b>${st.def}</b></span></div>
        <div class="expbar"><i style="width:${hs.lv >= MAX_LV ? 100 : hs.exp / expNeed(hs.lv) * 100}%"></i></div>
        <p>${h.wname}: <b style="color:${RARITY[w.rar].col}">${weaponName(w)}</b>(攻撃+${weaponAtk(w)})</p>
        <p class="dim-t">通常攻撃 ${maxNormals(hs.lv)}段 / チャージ技 ${maxCharges(hs.lv)}種${hs.lv < 10 ? '(Lvが上がると増加)' : ''}</p>` : `<p style="color:#ffb08a">${need ? STAGE[need[0]].no + '「' + STAGE[need[0]].name + '」クリアで解放' : '未解放'}</p>`}
        <p class="dim-t">${E.n}属性 — ${E.d}</p></div>
        <div class="row"><button class="sbtn" data-a="go" data-v="armory" ${open ? '' : 'disabled'}>武器変更</button><div style="flex:1"></div><button class="pbtn" data-a="sortie" ${open ? '' : 'disabled'}>出 陣</button></div></div></div>`);
  },
  r_armory() {
    const S = Save.data; if (!this.armHero || !S.unlockedHeroes.includes(this.armHero)) this.armHero = S.unlockedHeroes.includes(this.sel.hero) ? this.sel.hero : S.unlockedHeroes[0];
    const h = HERO[this.armHero], hs = S.heroes[h.id];
    const list = S.weapons.filter((w) => w.type === h.wtype).sort((a, b) => b.rar - a.rar || weaponAtk(b) - weaponAtk(a));
    const cur = list.find((w) => w.uid === this.armSel) || list.find((w) => w.uid === hs.weapon) || list[0];
    this.armSel = cur.uid; if (cur.isNew) { cur.isNew = false; }
    const eq = cur.uid === hs.weapon, mx = RAR_MAXLV[cur.rar], cost = forgeCost(cur), R = RARITY[cur.rar];
    this.html('armory', `${this.head('武器庫', 'home')}
      <div class="tabs">${HEROES.filter((x) => S.unlockedHeroes.includes(x.id)).map((x) => `<button class="tab ${x.id === h.id ? 'on' : ''}" data-a="ahero" data-v="${x.id}">${x.name}</button>`).join('')}</div>
      <div class="cols"><div class="l scroll">${list.map((w) => `<div class="card wcard ${w.uid === cur.uid ? 'on' : ''}" style="border-left-color:${RARITY[w.rar].col}" data-a="wsel" data-v="${w.uid}"><div class="n"><div class="a" style="color:${RARITY[w.rar].col}">${weaponName(w)}${w.uid === hs.weapon ? '<span class="eq">装備中</span>' : ''}${w.isNew ? '<span class="new">NEW</span>' : ''}${w.lock ? ' 🔒' : ''}</div><div class="b">${RARITY[w.rar].star}　特性${w.traits.length}</div></div><div class="atk">攻+${weaponAtk(w)}</div></div>`).join('')}
        <p class="note">${h.wname} ${list.length}本(全武器 ${S.weapons.length}/150)</p></div>
      <div class="r"><div class="panel scroll" style="flex:1">
        <div class="dim-t" style="color:${R.col}">${R.star}　${R.n}</div><h3 style="color:${R.col}">${weaponName(cur)}</h3>
        <div class="stat"><span>攻撃<b>+${weaponAtk(cur)}</b></span><span>鍛錬<b>${cur.lv}/${mx}</b></span></div>
        ${cur.traits.length ? cur.traits.map((t) => `<div class="trait"><b>${traitName(t.k)}</b>${traitText(t)}</div>`).join('') : '<p class="dim-t">特性なし</p>'}
        <p class="note">合戦で敵将を倒すと武器を落とします。難易度が高いほど良質に。</p></div>
        <div class="row"><button class="sbtn" data-a="equip" ${eq ? 'disabled' : ''}>${eq ? '装備中' : '装備'}</button>
          <button class="sbtn" data-a="forge" ${cur.lv >= mx || S.gold < cost ? 'disabled' : ''}>鍛錬 ${cur.lv >= mx ? '(最大)' : cost + '金'}</button>
          <button class="sbtn" data-a="sell" ${eq ? 'disabled' : ''}>売却 +${sellPrice(cur)}</button>
          <button class="sbtn" data-a="lock">${cur.lock ? '保護解除' : '保護'}</button></div>
        <div class="row"><button class="pbtn" style="font-size:14px;padding:8px 14px" data-a="gacha" ${S.gold < GACHA_COST ? 'disabled' : ''}>武器錬成 ${GACHA_COST}金</button><button class="sbtn" data-a="sellall" data-v="2">★2以下を一括売却</button></div></div></div>`);
  },
  r_ach() {
    const S = Save.data;
    this.html('ach', `${this.head('実績', 'home')}<div class="scroll" style="flex:1"><div style="max-width:720px;margin:0 auto">${ACHIEVEMENTS.map((a) => `<div class="card ach ${S.ach[a.id] ? 'done on' : ''}"><div class="mk">${S.ach[a.id] ? '✓' : ''}</div><div><div class="a">${a.n}</div><div class="b">${a.d}</div></div><div class="g">${a.gold ? '+' + a.gold.toLocaleString() + '金' : ''}</div></div>`).join('')}
      <div class="panel" style="margin-top:8px"><div class="rs"><span>累計撃破数</span><b>${S.stats.totalKO.toLocaleString()}</b><span>合戦回数 / 勝利</span><b>${S.stats.battles} / ${S.stats.wins}</b><span>最多撃破(1合戦)</span><b>${S.stats.maxKO}</b><span>最大連撃</span><b>${S.stats.maxCombo}</b><span>撃破した敵将</span><b>${S.stats.officers}</b><span>見切り回数</span><b>${S.stats.perfect}</b><span>総プレイ時間</span><b>${fmtTime(S.stats.playTime)}</b></div></div></div></div>`, true);
  },
  r_rank() {
    const S = Save.data; if (!this.rankBoard) this.rankBoard = 'endless';
    const [sid, did] = this.rankBoard.split('_');
    const boards = `<div class="tabs"><button class="tab ${sid === 'endless' ? 'on' : ''}" data-a="board" data-v="endless">無限戦場</button>${STAGES.map((s) => `<button class="tab ${s.id === sid ? 'on' : ''}" data-a="board" data-v="${s.id}_${did || 'normal'}">${s.no}</button>`).join('')}</div>
      ${sid !== 'endless' ? `<div class="tabs">${DIFFS.map((d) => `<button class="tab ${d.id === did ? 'on' : ''}" data-a="board" data-v="${sid}_${d.id}" style="color:${d.col}">${d.n}</button>`).join('')}</div>` : ''}`;
    const body = Cloud.enabled() ? '<div id="rk-list" class="panel scroll" style="flex:1"><p>読み込み中…</p></div>'
      : '<div class="panel"><p>番付(ランキング)はスプレッドシート連携を設定すると利用できます。</p><p class="note">「設定」→「スプレッドシート連携」に Google Apps Script のURLを入力してください。手順は同梱の README.md にあります。</p></div>';
    this.html('rank', `${this.head('番付', 'home')}${boards}${body}`, true);
    if (!Cloud.enabled()) return;
    const board = this.rankBoard;
    Cloud.ranking(board).then((rows) => {
      const box = $('#rk-list'); if (!box || this.rankBoard !== board) return;
      if (!rows) { box.innerHTML = '<p>取得できませんでした。通信状況と連携URLを確認してください。</p>'; return; }
      if (!rows.length) { box.innerHTML = '<p>まだ記録がありません。最初の記録を刻もう!</p>'; return; }
      box.innerHTML = rows.map((r, i) => `<div class="rk"><b>${i + 1}</b><span>${esc(r.name)} <span class="dim-t">(${esc(HERO[r.hero] ? HERO[r.hero].name : '')})</span></span><span>${Number(r.ko) || 0}人</span><b>${Number(r.score) || 0}</b></div>`).join('');
    });
  },
  r_settings() {
    const S = Save.data, s = S.settings, on = Cloud.enabled();
    this.html('settings', `${this.head('設定', 'home')}<div class="scroll" style="flex:1"><div class="panel set" style="max-width:720px;margin:0 auto">
      <label>武将名(番付用)</label><input type="text" maxlength="12" value="${esc(S.name)}" data-s="name">
      <label>画質</label><select data-s="quality">${[['auto', '自動'], ['low', '低(軽量)'], ['mid', '中'], ['high', '高'], ['ultra', '最高']].map(([v, n]) => `<option value="${v}" ${s.quality === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <label>BGM音量</label><input type="range" min="0" max="1" step="0.05" value="${s.bgm}" data-s="bgm">
      <label>効果音音量</label><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-s="sfx">
      <label>視点感度</label><input type="range" min="0.4" max="2" step="0.1" value="${s.camSens}" data-s="camSens">
      <label>視点の自動追従</label><input type="checkbox" ${s.autoCam ? 'checked' : ''} data-s="autoCam" style="justify-self:start;width:22px;height:22px">
      <label>振動</label><input type="checkbox" ${s.vibe ? 'checked' : ''} data-s="vibe" style="justify-self:start;width:22px;height:22px">
      <label>FPS表示</label><input type="checkbox" ${s.fps ? 'checked' : ''} data-s="fps" style="justify-self:start;width:22px;height:22px">
      <h3 class="full" style="margin-top:8px">スプレッドシート連携(クラウド保存)</h3>
      <p class="full note">セーブデータは常にこの端末に保存されます。Google Apps Script のURLを設定すると、Googleスプレッドシートにも自動保存され、別の端末へ引き継ぎ・番付参加ができます(設定手順は README.md)。</p>
      <label>連携URL</label><input type="text" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(s.cloudUrl)}" data-s="cloudUrl">
      <label>状態</label><div>${on ? '<b style="color:#9dff9d">連携中</b> ' + esc(Save.cloudState) : '<span class="dim-t">未設定</span>'}</div>
      <label>引き継ぎコード</label><div class="row"><span class="code">${S.id}</span><button class="sbtn" data-a="copyid">コピー</button></div>
      ${on ? `<label>今すぐ</label><div class="row"><button class="sbtn" data-a="csave">クラウドへ保存</button></div>
      <label>データ復元</label><div class="row"><input type="text" id="restore-id" placeholder="引き継ぎコードを入力" style="flex:1;min-width:8em"><button class="sbtn" data-a="cload">読み込む</button></div>` : ''}
      <h3 class="full" style="margin-top:8px">操作方法</h3>
      <div class="full keys"><b>タッチ</b><span>画面左をドラッグで移動 / 右のボタンで攻撃・回避 / 何もない所をドラッグで視点回転</span><b>キーボード</b><span>WASD 移動 / J 攻撃 / K チャージ / L・Space 回避 / I 奥義 / U 覚醒 / ←→ 視点 / P 一時停止</span><b>ゲームパッド</b><span>左スティック移動 / □攻撃 △チャージ ✕回避 ○奥義 R1覚醒</span></div>
      <div class="full row" style="justify-content:flex-end;margin-top:10px"><button class="sbtn" data-a="reset" style="border-color:#ff6a5a;color:#ffb0a0">セーブデータを初期化</button></div>
    </div></div>`, true);
  },
  r_pause() {
    this.html('pause', `<div class="panel"><div class="ttl" style="border:0;text-align:center">一時停止</div>
      <button class="pbtn" data-a="resume">再開</button>
      <div class="keys" style="text-align:left"><b>攻撃</b><span>連打 or 押しっぱなしで連続攻撃</span><b>チャージ</b><span>通常攻撃の途中で押すと派生技</span><b>回避</b><span>直前回避で「見切り」発動</span><b>奥義</b><span>ゲージ満タンで発動(無敵)</span><b>覚醒</b><span>ゲージ満タンで一定時間強化</span></div>
      <button class="sbtn" data-a="retire">退却する(合戦を中断)</button></div>`, true);
  },
  r_load() { this.html('load', `<div class="boot-logo" style="font-size:clamp(28px,8vmin,54px)">出陣準備中</div><div class="tip">${TIPS[(Math.random() * TIPS.length) | 0]}</div>`); },
  r_result() {
    const r = this.lastResult, o = r.out, S = Save.data, hs = S.heroes[r.heroId], h = HERO[r.heroId];
    const title = r.endless ? '戦闘終了' : r.win ? '勝 利' : '敗 北';
    this.html('result', `<div class="res-t ${r.win || r.endless ? '' : 'lose'}">${title}</div>
      <div class="res-body"><div class="panel scroll">
        ${r.win && !r.endless ? `<div class="bigrank ${r.rank}">${r.rank}</div>` : ''}
        <div class="rs"><span>${r.stage.name}</span><b style="color:${r.diff.col}">${r.endless ? '第' + r.wave + '波' : r.diff.n}</b>
          <span>撃破数</span><b>${r.ko}${o.best ? ' <span class="lvup">新記録!</span>' : ''}</b><span>戦闘時間</span><b>${fmtTime(r.time)}</b><span>最大連撃</span><b>${r.maxCombo}</b>
          <span>討ち取った敵将</span><b>${r.offKO}</b>${r.endless ? '' : `<span>制圧拠点</span><b>${r.caps}</b><span>戦功</span><b>${r.missions}</b>`}<span>見切り</span><b>${r.perfect}</b></div></div>
      <div class="panel scroll">
        <div class="rs"><span>獲得経験値</span><b>+${r.exp.toLocaleString()}</b><span>獲得金</span><b>+${r.gold.toLocaleString()}</b>
          <span>${h.name}</span><b>Lv${o.lv.from}${o.lv.to > o.lv.from ? ` → <span class="lvup">Lv${o.lv.to}!</span>` : ''}</b></div>
        <div class="expbar"><i style="width:${hs.lv >= MAX_LV ? 100 : hs.exp / expNeed(hs.lv) * 100}%"></i></div>
        ${maxNormals(o.lv.to) > maxNormals(o.lv.from) || maxCharges(o.lv.to) > maxCharges(o.lv.from) ? '<p class="lvup">新たな技を習得した!</p>' : ''}
        ${o.unlock ? `<p class="lvup">新武将「${o.unlock.name}」が参戦!</p>` : ''}
        ${r.relic ? '<p style="color:#ff5a7a;font-weight:700">✦ 神器を授かった! ✦</p>' : ''}
        ${o.ach.map((a) => `<p style="color:var(--gold)">実績達成: ${a.n}${a.gold ? ' (+' + a.gold + '金)' : ''}</p>`).join('')}
        ${r.loot.length ? '<h3 style="margin-top:6px;font-size:14px">入手した武器</h3>' + r.loot.map((w) => `<div class="trait" style="border-color:${RARITY[w.rar].col}"><b style="color:${RARITY[w.rar].col}">${RARITY[w.rar].star}</b>${weaponName(w)} <span class="dim-t">攻+${w.atk}</span></div>`).join('') : ''}
      </div></div>
      <div class="row" style="flex:none"><button class="sbtn" data-a="go" data-v="home">拠点へ戻る</button><button class="pbtn" data-a="again">もう一度</button></div>`, true);
  },

  // ================= 合戦HUD =================
  hudStart(B) {
    const p = B.player, E = this.E;
    E['pl-name'].textContent = p.name; E['pl-lv'].textContent = 'Lv' + p.S.lv;
    this._ko = -1; this._combo = -1; this._hpT = -1; this._f = 0; this._bq.length = 0; this._bBusy = false;
    E['h-say'].innerHTML = ''; E['mission'].classList.add('hide'); E['h-target'].classList.add('hide'); E['h-base'].classList.add('hide');
  },
  minimapInit(stage) { this.map = stage.drawMap(280); },
  hud(B) {
    const E = this.E, p = B.player, f = ++this._f;
    const hp = clamp(p.hp / p.maxHp, 0, 1);
    E['hp-fill'].style.transform = `scaleX(${hp})`;
    if (f % 6 === 0) { const t = Math.ceil(p.hp); if (t !== this._hpT) { this._hpT = t; E['hp-text'].textContent = t; E['hp-fill'].parentNode.classList.toggle('low', hp < 0.3); } }
    E['sp-fill'].style.transform = `scaleX(${p.sp / 100})`; E['rg-fill'].style.transform = `scaleX(${p.rage / 100})`;
    if (f % 5 === 0) {
      const spF = p.sp >= 100, rgF = p.rage >= 100 && p.awake <= 0;
      E['sp-fill'].parentNode.classList.toggle('full', spF); E['rg-fill'].parentNode.classList.toggle('full', rgF);
      this.bS.classList.toggle('ready', spF); this.bR.classList.toggle('ready', rgF); this.bR.classList.toggle('awake', p.awake > 0);
      E['mor-a'].style.width = (50 + B.morale / 2) + '%';
      const tg = B.focus;
      if (tg && tg.alive) { E['h-target'].classList.remove('hide'); E['h-target'].classList.toggle('boss', tg.boss); E['tg-name'].textContent = (tg.title ? tg.title + ' ' : '') + tg.name + (tg.sealed ? '(結界)' : ''); E['tg-fill'].style.transform = `scaleX(${clamp(tg.hp / tg.maxHp, 0, 1)})`; }
      else E['h-target'].classList.add('hide');
      const b = B.curBase;
      if (b) { E['h-base'].classList.remove('hide'); E['h-base'].classList.toggle('ally', b.team === 0); E['bs-name'].textContent = b.name + (b.captain ? ' — 兵長出現!' : ''); E['bs-fill'].style.transform = `scaleX(${clamp((b.troops + b.alive) / (b.max + 8), 0, 1)})`; }
      else E['h-base'].classList.add('hide');
    }
    if (B.ko !== this._ko) { this._ko = B.ko; const e = E['ko-n']; e.textContent = B.ko; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
    if (B.combo !== this._combo) {
      this._combo = B.combo; const c = E['combo'];
      if (B.combo >= 5) { c.classList.remove('hide'); const e = E['combo-n']; e.textContent = B.combo; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); } else c.classList.add('hide');
    }
    if (f % 20 === 0) { E['timer'].textContent = fmtTime(B.time); if (B.mission) E['mission'].textContent = `戦功: ${B.mission.title}(残り${Math.ceil(B.mission.t)}秒)`; if (Save.data.settings.fps) E['h-fps'].textContent = `${GFX.fps.toFixed(0)}fps ×${GFX.scale.toFixed(2)} 兵${B.horde.n}`; }
    if (f % 4 === 0) this._drawMap(B);
    // 発言の寿命
    for (let i = this._says.length - 1; i >= 0; i--) { const s = this._says[i]; s.t -= 1 / 60; if (s.t < 0.6) s.e.classList.add('out'); if (s.t <= 0) { s.e.remove(); this._says.splice(i, 1); } }
  },
  _drawMap(B) {
    const c = this.mctx, m = this.map, S = 280; if (!m) return;
    c.clearRect(0, 0, S, S);
    c.globalAlpha = 0.34; c.drawImage(m.cv, 0, 0); c.globalAlpha = 1;
    const X = (x) => m.o - x * m.s, Y = (z) => m.o - z * m.s, t = B.rt;
    for (const b of B.bases) {
      const x = X(b.x), y = Y(b.z), r = b.main ? 13 : 9;
      c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
      c.fillStyle = b.team === 0 ? '#3f8cff' : '#ff4a3a'; c.fillRect(-r / 2, -r / 2, r, r);
      c.lineWidth = 2; c.strokeStyle = b.captain ? '#ffe27a' : '#fff'; c.strokeRect(-r / 2, -r / 2, r, r); c.restore();
    }
    for (const f of B.fighters) {
      if (!f.alive || f.isPlayer) continue;
      const x = X(f.x), y = Y(f.z);
      c.beginPath(); c.arc(x, y, f.boss ? 7 : 4.5, 0, 6.283); c.fillStyle = f.team === 0 ? '#9ad6ff' : f.boss ? '#ffd24a' : '#ff8a6a'; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = '#000'; c.stroke();
      if (f.boss && !f.sealed) { c.beginPath(); c.arc(x, y, 9 + (t * 14) % 14, 0, 6.283); c.strokeStyle = 'rgba(255,210,74,.7)'; c.lineWidth = 2; c.stroke(); }
    }
    if (B.mission && B.mission.target.alive) { const f = B.mission.target; c.beginPath(); c.arc(X(f.x), Y(f.z), 8 + (t * 12) % 10, 0, 6.283); c.strokeStyle = '#ffe27a'; c.lineWidth = 2; c.stroke(); }
    const p = B.player, px = X(p.x), py = Y(p.z), dx = -Math.sin(p.yaw), dy = -Math.cos(p.yaw);
    c.beginPath(); c.moveTo(px + dx * 11, py + dy * 11); c.lineTo(px - dx * 6 - dy * 7, py - dy * 6 + dx * 7); c.lineTo(px - dx * 2, py - dy * 2); c.lineTo(px - dx * 6 + dy * 7, py - dy * 6 - dx * 7); c.closePath();
    c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#1a2a6a'; c.stroke();
  },

  // ---- テロップ類 ----
  stageCard(def, diff) { const e = this.E.card; e.innerHTML = `<div><div class="no">${def.no}</div><div class="ln"></div><div class="nm">${def.name}</div><div class="ln"></div><div class="df" style="color:${diff.col}">難易度 ${diff.n}</div></div>`; this._anim(e); },
  _anim(e) { e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); },
  banner(t, s = '', kind = 'gold') { this._bq.push([t, s, kind]); if (this._bq.length > 3) this._bq.splice(0, this._bq.length - 3); if (!this._bBusy) this._nextBanner(); },
  _nextBanner() {
    const b = this._bq.shift(); if (!b) { this._bBusy = false; return; }
    this._bBusy = true; const e = this.E.banner;
    e.className = b[2]; e.innerHTML = `<div class="t">${esc(b[0])}</div>${b[1] ? `<div class="s">${esc(b[1])}</div>` : ''}`; this._anim(e);
    setTimeout(() => this._nextBanner(), 1700);
  },
  cutin(text, sub, col) { const e = this.E.cutin; e.style.setProperty('--c', col); e.innerHTML = `<div class="h">${esc(sub)}</div><div class="n">${esc(text)}</div>`; this._anim(e); },
  koBanner(n) { const e = this.E.kob; e.textContent = `${n}人撃破!`; this._anim(e); },
  pop(text) { const e = el('div', 'pop', esc(text)); e.style.left = ((Math.random() - 0.5) * 80) + 'px'; this.E.pops.appendChild(e); setTimeout(() => e.remove(), 950); },
  toast(text) { const e = this.E.toast; e.textContent = text; e.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => e.classList.remove('show'), 2400); },
  say(name, text) {
    const e = el('div', 'say', `<b>${esc(name)}</b>${esc(text)}`); this.E['h-say'].appendChild(e); this._says.push({ e, t: 6.5 });
    while (this._says.length > 3) { const s = this._says.shift(); s.e.remove(); }
  },
  objective(text) { this.E.obj.textContent = text; },
  mission(title) { const e = this.E.mission; if (title) { e.classList.remove('hide'); e.textContent = '戦功: ' + title; } else e.classList.add('hide'); },
  hurt() { this._anim(this.E.hurt); },
  // 合戦を抜けるとき、残っているテロップ類を消す
  clearFx() {
    for (const k of ['banner', 'cutin', 'card', 'kob', 'hurt']) this.E[k].classList.remove('show');
    this.E.pops.innerHTML = ''; this._bq.length = 0;
    this.bS.classList.remove('ready'); this.bR.classList.remove('ready', 'awake');
  },
};
const TN = { atk: '剛力', hp: '体力', def: '堅守', spd: '疾風', aspd: '神速', range: '大振', sp: '練気', rage: '闘魂', crit: '会心', steal: '吸生', elem: '属性', charge: '豪撃', musou: '極意', exp: '学習', gold: '蓄財', luck: '幸運', regen: '活丹' };
function traitName(k) { return TN[k] || k; }
