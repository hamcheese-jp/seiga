// 起動とメインループ・画面遷移
import { GFX } from './gfx.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Save, Cloud } from './save.js';
import { UI } from './ui.js';
import { Lobby } from './lobby.js';
import { Battle } from './battle.js';
import { STAGE, HEROES, HERO } from './data.js';
import { preloadVrm, probeVrm, VRM_KEYS } from './vrmchar.js';
import { preloadSoldier } from './vat.js';
import { preloadNature } from './nature.js';
import { Story, STORY } from './story.js';
import { Voice, VOICES } from './voice.js';
import { BOSS_VOICE } from './voicedata.js';

const App = {
  mode: 'menu', battle: null, lobby: null, paused: false, last: 0, busy: false,

  init() {
    Save.load();
    const s = Save.data.settings;
    GFX.init(document.getElementById('gl'), s.quality);
    Audio.vol.bgm = s.bgm; Audio.vol.sfx = s.sfx; Audio.vol.voice = s.voice;
    Input.init();
    UI.init(this);
    probeVrm(); Voice.init();
    this.lobby = new Lobby(); this.lobby.setHero(UI.sel.hero);
    UI.show('title');
    const boot = document.getElementById('boot');
    boot.classList.add('out'); setTimeout(() => boot.remove(), 700);
    requestAnimationFrame((t) => this.loop(t));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
  },

  loop(t) {
    requestAnimationFrame((x) => this.loop(x));
    const dt = Math.min(0.1, Math.max(0.001, (t - this.last) / 1000 || 0.016)); this.last = t;
    Input.update(dt);
    if (this.mode === 'battle' && this.battle) {
      if (!this.paused) { if (Input.consume('pause', 0.3)) this.pause(); else this.battle.update(dt); }
    } else if (this.lobby) this.lobby.update(dt);
    if (!this.paused) GFX.perf(dt);
    GFX.render(this.paused ? 0 : dt);
    Input.endFrame();
  },

  lobbyHero(id, force) { if (this.lobby) this.lobby.setHero(id, force); },
  onScreen(name) {
    if (this.lobby) this.lobby.setFrame(name);
    Input.active = name === '';
    if (name === 'home' && this.mode === 'menu') Audio.bgm('title');
  },

  startBattle(sel) {
    if (this.busy) return; this.busy = true;
    UI.fade(true);
    setTimeout(() => {
      UI.show('load'); UI.fade(false);
      setTimeout(async () => {
        // VRMは自分の武将・敵将・その章のボスだけ先読み(味方武将などは合戦中に順次読み込む)
        const st = STAGE[sel.stage] || {}, need = [(HERO[sel.hero] && HERO[sel.hero].vrm) || sel.hero, 'enemyOfficer', ...(st.officers || []).filter((o) => o.boss && o.look).map((o) => o.look)].filter((k) => VRM_KEYS.includes(k) || /^boss/.test(k));
        Audio.resume(); Voice.preload([sel.hero, 'officer', ...(st.officers || []).filter((o) => o.boss && o.look).map((o) => BOSS_VOICE[o.look])], (st.events || []).filter((e) => e.say).map((e) => e.say[1]));
        await Promise.race([Promise.all([preloadVrm(need), preloadSoldier(), preloadNature()]), new Promise((r) => setTimeout(r, 15000))]);
        try {
          if (this.battle) { this.battle.dispose(); this.battle = null; }
          if (this.lobby) { this.lobby.dispose(); this.lobby = null; }
          this.battle = new Battle({ stage: STAGE[sel.stage], heroId: sel.hero, diff: sel.diff, save: Save.data, ui: UI, onEnd: (r) => this.endBattle(r) });
          UI.hudStart(this.battle);
          this.mode = 'battle'; this.paused = false;
          UI.show('');
        } catch (e) { console.error(e); UI.toast('戦いの開始に失敗しました'); try { this.toMenu('home'); } catch (e2) { console.error(e2); } }
        this.busy = false;
      }, 120);
    }, 380);
  },
  endBattle(r) {
    r.out = Save.applyResult(r); UI.lastResult = r;
    if (Cloud.enabled()) {
      if (r.endless) Cloud.score('endless', { hero: r.heroId, ko: r.ko, time: Math.round(r.time), rank: '第' + r.wave + '波', score: r.ko + r.wave * 100 });
      else if (r.win) Cloud.score(r.stage.id + '_' + r.diff.id, { hero: r.heroId, ko: r.ko, time: Math.round(r.time), rank: r.rank, score: Math.round(r.ko * 10 + r.maxCombo * 2 + Math.max(0, r.stage.par * 2 - r.time) * 5) });
    }
    UI.fade(true);
    // 初めて章を制した時は、決着の物語を挟んでから結果画面へ
    const sc = !r.endless && r.win && STORY[r.stage.id], k = r.stage.id + '.post', S = Save.data;
    const post = sc && sc.post && !S.story[k];
    setTimeout(() => {
      if (post) { this.toMenu('scene'); UI.fade(false); Audio.bgm('title'); Story.play(sc.post, r.heroId, () => { S.story[k] = 1; Save.persist(false); UI.show('result'); Audio.bgm('result'); }); return; }
      this.toMenu('result'); UI.fade(false); Audio.bgm('result');
    }, 420);
  },
  toMenu(screen) {
    if (this.battle) { this.battle.dispose(); this.battle = null; }
    this.mode = 'menu'; this.paused = false;
    UI.clearFx();
    if (!this.lobby) { this.lobby = new Lobby(); this.lobby.setHero(UI.sel.hero); }
    UI.show(screen);
  },
  pause() {
    if (this.mode !== 'battle' || this.paused || !this.battle || this.battle.state !== 'play') return;
    this.paused = true; Input.clear(); UI.show('pause');
    if (Audio.ctx) Audio.ctx.suspend();
  },
  resume() { this.paused = false; UI.show(''); Audio.resume(); },
  retire() {
    this.paused = false; Audio.resume(); UI.fade(true);
    setTimeout(() => { this.toMenu('home'); UI.fade(false); }, 360);
  },

  // 起動時: クラウドに新しいデータがあれば取り込み、無ければ送信
  async cloudSync() {
    if (!Cloud.enabled()) return;
    const remote = await Cloud.pull();
    if (remote && remote.t > Save.data.t + 2000) { Save.replace(remote); UI.sel = { ...Save.data.last }; UI.toast('クラウドの最新データを読み込みました'); if (UI.cur === 'home') UI.show('home'); }
    else Cloud.push();
  },
  async cloudRestore(id) {
    if (!id) { UI.toast('引き継ぎコードを入力してください'); return; }
    UI.toast('クラウドから読み込み中…');
    const remote = await Cloud.pull(id);
    if (!remote) { UI.toast('データが見つかりませんでした'); return; }
    Save.replace(remote); UI.sel = { ...Save.data.last };
    this.lobbyHero(UI.sel.hero, true);
    UI.toast('データを復元しました'); UI.show('home');
  },
};

window.__app = App;
try { App.init(); } catch (e) {
  console.error(e);
  const m = document.querySelector('.boot-msg'); if (m) m.textContent = '起動に失敗しました: ' + e.message;
}
