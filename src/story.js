// 物語: オープニングムービーと、各章の前後の会話シーン
//   立ち絵は assets/portraits/<キャラ>.webp(_b = 表情差分 / _full = 全身 / _act = 技の決めポーズ)。tools/portrait.html・tools/pose.html でVRMから撮影
//   会話の書き方: { c: キャラ, t: 台詞 } / c: '@' は選んだ武将(t を武将IDごとに書き分けられる) / f: 'b' で表情差分 / c 省略でナレーション
import { Audio } from './audio.js';
import { HERO } from './data.js';

const IMG = (id, v = '') => `assets/portraits/${id}${v}.webp`;

export const CAST = {
  mikoto: { n: 'ミコト', t: '蒼星軍 軍師', col: '#b79cff' },
  reiga: { n: 'レイガ', t: '焔牙の剣士', col: '#ff7a3a' },
  setsuna: { n: 'セツナ', t: '氷華の槍姫', col: '#7fd8ff' },
  raika: { n: 'ライカ', t: '迅雷の双刃', col: '#c9a2ff' },
  gandou: { n: 'ガンドウ', t: '砕地の豪傑', col: '#ffb347' },
  fuuka: { n: 'フウカ', t: '翠嵐の舞姫', col: '#7dffb2' },
  yomi: { n: 'ヨミ', t: '冥月の死神', col: '#c05cff' },
  enemyOfficer: { n: '帝国将校', t: '覇星帝国軍', col: '#ff5a4a', foe: true },
  boss1: { n: 'バルガ', t: '鉄壁の猛将', col: '#ff5a4a', foe: true },
  boss2: { n: 'ザハル', t: '砂塵の蠍', col: '#ff5a4a', foe: true },
  boss3: { n: 'ヴォルグ', t: '氷狼将', col: '#ff5a4a', foe: true },
  boss4: { n: 'イグナス', t: '炎獄将', col: '#ff5a4a', foe: true },
  boss5: { n: 'ゼノヴァ', t: '覇星帝', col: '#e05cff', foe: true },
};

// ================= 物語本文 =================
export const STORY = {
  s1: {
    pre: { bg: 'plains', title: '第一章 翠嵐平原の戦い', lines: [
      { t: '蒼星暦七百二十年、春。国境の翠嵐平原に、覇星帝国の大軍が姿を現した。' },
      { c: 'mikoto', t: '帝国の先鋒、およそ二万。率いるのは「鉄壁の猛将」バルガです。' },
      { c: 'mikoto', t: '敵の本拠は星読みの結界に守られています。周りの砦を三つ落とせば、結界は解けるはず。' },
      { c: '@', t: {
        reiga: '三つだな。まとめて斬り開く。ミコト、背中は任せた。',
        setsuna: '承知しました。蒼星の地を、一歩たりとも踏ませはしません。',
        raika: '三つ? 余裕だって。オレの足なら朝飯前に終わるぜ!',
        gandou: 'がはは! 砦ごと叩き潰せば早かろう!',
        fuuka: 'はーい! 風に乗って、ぱぱっと片付けちゃうね!',
        yomi: '……砦を三つ。了解。全部、刈る。',
      } },
      { c: 'boss1', t: '蒼星の小童どもが。この鉄壁、貴様らごときに破れるものか!' },
      { c: 'mikoto', f: 'b', t: '敵は数で押してきます。囲まれないよう、拠点を確実に!' },
    ] },
    post: { bg: 'plains', lines: [
      { c: 'boss1', f: 'b', t: 'ぐ……ぬう……。この鉄壁が、たった一騎に……。' },
      { c: 'boss1', t: 'だが覚えておけ……陛下の「覇星」は、もう目を覚ましておる……!' },
      { c: 'mikoto', f: 'b', t: '覇星……? 七つ目の星の伝承は、ただのおとぎ話のはず……。' },
      { c: 'mikoto', t: 'それに……今、バルガの星の力が、皆さんの星牙に流れ込みました。星牙は、打ち倒した者の戦い方を「星の記憶」として刻むのです。' },
      { c: 'mikoto', t: '星の記憶をたどれば、敵将の力さえ借りて戦えるはずです。' },
      { c: 'gandou', t: 'おう、見事な戦いぶりだったな! 俺はガンドウ。帝国に村を焼かれた者だ。' },
      { c: 'gandou', f: 'b', t: 'この大槌、あんたらのために振るわせてくれ。帝国の奴らには借りがある!' },
      { c: '@', t: {
        reiga: '心強い。地の星牙の力、頼りにしている。',
        setsuna: '歓迎いたします、ガンドウ殿。共に戦いましょう。',
        raika: 'でっけえ! アンタがいれば百人力だな!',
        gandou: '……うむ。今日からは、蒼星のために振るう。',
        fuuka: 'わぁ、強そう! よろしくね、ガンドウさん!',
        yomi: '……よろしく。大きい人。',
      } },
      { t: '「砕地の豪傑」ガンドウが仲間に加わった。' },
    ] },
  },
  s2: {
    pre: { bg: 'desert', title: '第二章 紅砂峡谷の戦い', lines: [
      { t: '帝国軍の補給は、南の紅砂峡谷を通っている。そこを仕切るのは、帝国と手を組んだ砂賊の頭目だった。' },
      { c: 'mikoto', t: '「砂塵の蠍」ザハル。奇襲と罠を得意とする、油断ならない相手です。' },
      { c: 'mikoto', t: 'それに……砂賊の根城に、風の星牙を宿した踊り子が囚われているという噂も。' },
      { c: 'boss2', t: 'クク……星牙使いがわざわざ来てくれるとはな。皇帝陛下が高く買ってくださるぜ。' },
      { c: '@', t: {
        reiga: '人を売り物にする外道か。容赦はしない。',
        setsuna: '囚われの方を、必ずお救いします。',
        raika: '罠だろうが何だろうが、踏む前に駆け抜けるだけだ!',
        gandou: '小賢しい蠍め。踏みつぶしてくれる!',
        fuuka: 'あの人の気配……近いよ。今度こそ、逃がさない!',
        yomi: '……蠍は、嫌い。毒があるから。',
      } },
    ] },
    post: { bg: 'desert', lines: [
      { c: 'boss2', f: 'b', t: 'チッ……割に合わねえ……。覇星帝の野郎、星牙使いがこれほどとは言ってなかったぞ……。' },
      { c: 'fuuka', f: 'b', t: 'あっ……! 助けに来てくれたの!? ありがとう!' },
      { c: 'fuuka', t: 'あたし、フウカ! 風の星牙を持ってるせいで、ずっと捕まってたんだ。' },
      { c: 'fuuka', t: '帝国はね、六つの星牙を全部集めようとしてるの。何に使うのかまでは分からなかったけど……。' },
      { c: 'mikoto', f: 'b', t: '六つすべてを……? まさか、覇星の儀を……。' },
      { c: 'fuuka', t: '恩返しさせて! あたしの風、あなたたちと一緒に吹かせたいな!' },
      { t: '「翠嵐の舞姫」フウカが仲間に加わった。' },
    ] },
  },
  s3: {
    pre: { bg: 'snow', title: '第三章 霜牙雪原の戦い', lines: [
      { t: '北の霜牙雪原。吹雪の向こうから、狼の遠吠えが響く。' },
      { c: 'mikoto', t: '氷狼将ヴォルグ……逃げる村人まで狩る、残忍な将です。氷湖の砦を拠点に、包囲網を敷いています。' },
      { c: 'boss3', t: '獲物の匂いがするな。星牙の匂いだ。……群れで狩れ。一匹も逃がすな。' },
      { c: 'yomi', t: '……ヴォルグ。あいつだけは、許さない。' },
      { c: 'mikoto', f: 'b', t: 'あなたは……帝国の黒衣? どうしてここに……。' },
      { c: 'yomi', t: 'わたしは、ヨミ。もう帝国の刃じゃない。……あいつを刈るまで、手を貸す。' },
      { c: '@', t: {
        reiga: '目的が同じなら、今は共に戦おう。',
        setsuna: '……分かりました。その言葉、信じます。',
        raika: '敵の敵は味方ってやつか。いいぜ、乗った!',
        gandou: '腕は確かそうだな。背中は預けたぞ!',
        fuuka: 'ヨミちゃんって言うんだ! 一緒にがんばろ!',
        yomi: '……行こう。狩るのは、こっち。',
      } },
    ] },
    post: { bg: 'snow', lines: [
      { c: 'boss3', f: 'b', t: '馬鹿な……狩る側の俺が……狩られる、だと……。' },
      { c: 'yomi', f: 'b', t: '……終わった。村のみんな。仇は、とったよ。' },
      { c: 'yomi', t: '覇星帝ゼノヴァの目的、教える。……六つの星牙を覇星に喰わせて、空の星を大地に墜とす。' },
      { c: 'yomi', t: '星が墜ちた地は、すべて焼ける。残るのは、帝国だけ。それが「星墜とし」。' },
      { c: 'mikoto', f: 'b', t: 'そんな……国ひとつを、星で焼き払うつもりなのですか……!' },
      { c: 'yomi', t: '……だから、止める。わたしも、行く。' },
      { t: '「冥月の死神」ヨミが仲間に加わった。' },
    ] },
  },
  s4: {
    pre: { bg: 'volcano', title: '第四章 焔獄火山の戦い', lines: [
      { t: '帝国の心臓部、焔獄火山。溶鉱炉では、星牙を喰らうための兵器が昼夜を問わず鍛えられている。' },
      { c: 'mikoto', t: '工廠を守るのは炎獄将イグナス。ここを落とせば、帝国は「星墜とし」の器を失います。' },
      { c: 'boss4', t: 'ハハハ! よく来た、星牙ども! 溶けろ、焼けろ、灰になれ! 全部まとめて炉にくべてやる!' },
      { c: '@', t: {
        reiga: '炎で俺を焼けると思うな。焔牙の名にかけて、ここで終わらせる。',
        setsuna: 'この熱気……ですが、私の氷は溶けません。',
        raika: '熱っ! さっさと片付けて涼しいとこ行こうぜ!',
        gandou: '溶岩ごと叩き割ってくれるわ!',
        fuuka: 'あっつーい! でも風で吹き飛ばしちゃうもんね!',
        yomi: '……炎は、闇を照らせない。',
      } },
      { c: 'mikoto', f: 'b', t: '敵は三方から来ます! 本拠を落とされないよう、戦況図をよく見て!' },
    ] },
    post: { bg: 'volcano', lines: [
      { c: 'boss4', f: 'b', t: 'ぐああ……! 炎が……俺の炎が、消える……!' },
      { c: 'boss4', t: 'だが……もう遅い……。器は、帝城へ運ばれた……。今宵、星は墜ちる……!' },
      { c: 'mikoto', f: 'b', t: '今宵……七つの星が重なる「星合の夜」……! 儀式は今夜です!' },
      { c: 'mikoto', t: '皆さん、帝城へ急ぎましょう。これが……最後の戦いになります。' },
    ] },
  },
  s5: {
    pre: { bg: 'castle', title: '終章 星墜つる帝城', lines: [
      { t: '星合の夜。帝城の空に、赤い七つ目の星が不気味に輝いていた。' },
      { c: 'boss5', t: 'よく来たな、星牙の担い手たちよ。自ら我が覇星の贄となりに来たか。' },
      { c: 'boss5', f: 'b', t: '星は墜ちる定め。弱き国も、弱き者も、我が覇道の礎となって消えるがいい。' },
      { c: 'mikoto', t: '五つの拠点を落とせば、玉座への道が開けます。皆さん……どうか、ご武運を!' },
      { c: '@', t: {
        reiga: 'お前の星は墜とさせない。この焔で、覇道ごと断ち切る!',
        setsuna: '星は人を焼くためのものではありません。蒼星の誇りにかけて、あなたを止めます!',
        raika: '星墜としだかなんだか知らねえが、雷より速く叩き落としてやるよ!',
        gandou: '焼かれた村の分まで、この一撃に込める! 覚悟せい!',
        fuuka: 'みんなの空を、あなたなんかに渡さない!',
        yomi: '……覇星帝。あなたの星を、刈りに来た。',
      } },
    ] },
    post: { bg: 'castle', lines: [
      { c: 'boss5', f: 'b', t: '馬鹿な……六つの星が……我が覇星を、拒む……だと……?' },
      { c: 'boss5', t: '……そうか。星は……人を選ぶのか……。' },
      { t: '赤い星は砕け、光の粒となって夜空へ還っていった。' },
      { c: 'mikoto', f: 'b', t: '星が……空に還っていきます。終わったのですね……。' },
      { c: '@', t: {
        reiga: 'ああ。……帰ろう、ミコト。みんなが待ってる。',
        setsuna: 'ええ。これからは、この力を守るためだけに使いましょう。',
        raika: 'へへっ、やったな! 腹減ったー! 帰って宴だ宴!',
        gandou: 'がはは! 焼かれた村も、今度こそ建て直せるな!',
        fuuka: 'やったぁ! 見て、星がすっごく綺麗!',
        yomi: '……うん。綺麗。……みんなと見られて、よかった。',
      } },
      { t: '六つの星牙は再び大地に眠り、蒼星の国に平和が戻った。' },
      { t: '人々は六人の星牙使いを讃え、こう呼んだ——「蒼星のセイガ」と。' },
      { t: '— 完 —   (星海の試練や高難易度で、さらなる腕試しを!)' },
    ] },
  },
};

// ================= 会話シーンの再生 =================
const BG = {
  plains: 'radial-gradient(120% 90% at 50% 110%, #3c6a34 0%, #1d3524 45%, #0c1424 100%)',
  desert: 'radial-gradient(120% 90% at 50% 110%, #b5582a 0%, #5a2618 45%, #1a0c14 100%)',
  snow: 'radial-gradient(120% 90% at 50% 110%, #6f9cc4 0%, #24425e 45%, #0a1322 100%)',
  volcano: 'radial-gradient(120% 90% at 50% 110%, #c43a14 0%, #4a1010 45%, #120608 100%)',
  castle: 'radial-gradient(120% 90% at 50% 110%, #4a2a72 0%, #1c1238 45%, #06060f 100%)',
};
const pre = (urls) => Promise.race([Promise.all(urls.map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = () => r(); i.src = u; }))), new Promise((r) => setTimeout(r, 6000))]);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const Story = {
  busy: false,
  // 章の前後の会話。hero = 選んだ武将ID
  async play(scene, hero, done) {
    if (!scene || this.busy) { if (done) done(); return; }
    this.busy = true;
    // 帝国の将で遊んでいる時も、物語の主人公は星牙使い(レイガ)
    if (!hero || !CAST[hero] || (HERO[hero] && HERO[hero].foe)) hero = 'reiga';
    const who = (c) => (c === '@' ? hero : c);
    const ids = [...new Set(scene.lines.filter((l) => l.c).map((l) => who(l.c) + (l.f === 'b' ? '_b' : '')))];
    const root = document.createElement('div'); root.id = 'story';
    root.style.setProperty('--bg', BG[scene.bg] || BG.castle);
    root.innerHTML = `<div class="st-bg"></div><div class="st-stars"></div><div class="st-l"></div><div class="st-r"></div>
      <div class="st-box"><div class="st-name"></div><div class="st-text"></div><div class="st-next">▼</div></div>
      <button class="st-skip">スキップ ▶▶</button>${scene.title ? `<div class="st-title"><span>${esc(scene.title)}</span></div>` : ''}`;
    document.body.appendChild(root);
    await pre(ids.map((k) => IMG(k.replace('_b', ''), k.endsWith('_b') ? '_b' : '')));
    requestAnimationFrame(() => root.classList.add('on'));
    const L = root.querySelector('.st-l'), R = root.querySelector('.st-r'), nm = root.querySelector('.st-name'), tx = root.querySelector('.st-text');
    let i = -1, typing = null, full = '', side = { L: null, R: null };
    const finish = () => {
      if (!this.busy) return;
      this.busy = false; clearInterval(typing);
      root.classList.remove('on'); root.classList.add('off');
      setTimeout(() => root.remove(), 450);
      if (done) done();
    };
    const show = () => {
      i++;
      if (i >= scene.lines.length) { finish(); return; }
      const ln = scene.lines[i], c = ln.c ? who(ln.c) : null, info = c ? (CAST[c] || HERO[c] || { n: c }) : null;
      let t = ln.t; if (t && typeof t === 'object') t = t[hero] || t.default || Object.values(t)[0];
      root.classList.toggle('narr', !c);
      if (c) {
        // 敵は右・味方は左。話している人を明るく
        const s = info.foe ? 'R' : (c === 'mikoto' && side.L && side.L !== 'mikoto' ? 'R' : 'L');
        const box = s === 'L' ? L : R, key = c + (ln.f === 'b' ? '_b' : '');
        if (box.dataset.k !== key) {
          const fresh = box.dataset.c !== c;
          box.dataset.k = key; box.dataset.c = c;
          box.innerHTML = `<img src="${IMG(c, ln.f === 'b' ? '_b' : '')}" alt="">`;
          box.classList.toggle('foe', !!info.foe);
          if (fresh) { box.classList.remove('in'); void box.offsetWidth; box.classList.add('in'); }
        }
        side[s] = c;
        L.classList.toggle('talk', s === 'L'); R.classList.toggle('talk', s === 'R');
        nm.innerHTML = `<b style="color:${info.col || '#f3cf6d'}">${esc(info.n)}</b><small>${esc(info.t || info.title || '')}</small>`;
        if (info.foe) Audio.sfx('dark'); else Audio.sfx('ui');
      } else { nm.innerHTML = ''; L.classList.remove('talk'); R.classList.remove('talk'); }
      full = t; let n = 0; tx.textContent = '';
      clearInterval(typing);
      typing = setInterval(() => { n += 2; tx.textContent = full.slice(0, n); if (n >= full.length) { clearInterval(typing); typing = null; } }, 30);
    };
    root.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); Audio.resume();
      if (e.target.closest('.st-skip')) { Audio.sfx('back'); finish(); return; }
      if (typing) { clearInterval(typing); typing = null; tx.textContent = full; return; }
      show();
    });
    setTimeout(show, scene.title ? 1500 : 350);
  },

  // ================= オープニングムービー =================
  async opening(done) {
    if (this.busy) { if (done) done(); return; }
    this.busy = true;
    const heroes = ['reiga', 'setsuna', 'raika', 'gandou', 'fuuka', 'yomi'];
    const root = document.createElement('div'); root.id = 'op';
    root.innerHTML = `<canvas class="op-cv"></canvas><div class="op-stage"></div><div class="op-bar t"></div><div class="op-bar b"></div><div class="op-sub"></div><button class="st-skip">スキップ ▶▶</button>`;
    document.body.appendChild(root);
    const urls = [...heroes.map((h) => IMG(h, '_act')), IMG('zenova', '_act'), IMG('boss5', '_full'), IMG('boss5', '_b'), IMG('mikoto', '_full'), ...[1, 2, 3, 4].map((n) => IMG('boss' + n, '_b'))];
    await pre(urls);
    requestAnimationFrame(() => root.classList.add('on'));
    Audio.bgm('boss');
    const cv = root.querySelector('.op-cv'), ctx = cv.getContext('2d'), stage = root.querySelector('.op-stage'), sub = root.querySelector('.op-sub');
    const fit = () => { cv.width = innerWidth * Math.min(2, devicePixelRatio); cv.height = innerHeight * Math.min(2, devicePixelRatio); };
    fit(); addEventListener('resize', fit);
    // 星空・流星・光の粒
    const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, p: Math.random() * 6 }));
    let meteors = [], sparks = [], tint = [0, 0, 0], tintA = 0, redStar = 0, flash = 0, t0 = performance.now(), alive = true;
    const ELC = { reiga: [255, 110, 40], setsuna: [110, 210, 255], raika: [190, 140, 255], gandou: [255, 180, 70], fuuka: [110, 255, 170], yomi: [200, 90, 255] };
    const draw = (now) => {
      if (!alive) return;
      requestAnimationFrame(draw);
      const W = cv.width, H = cv.height, t = (now - t0) / 1000;
      ctx.fillStyle = '#03040b'; ctx.fillRect(0, 0, W, H);
      if (tintA > 0) { const g = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.8); g.addColorStop(0, `rgba(${tint},${tintA})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
      for (const s of stars) { ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + s.p)); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * (W / 1200 + 0.6), 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (redStar > 0) {
        const x = W * 0.5, y = H * 0.3, r = Math.min(W, H) * (0.05 + redStar * 0.08) * (1 + Math.sin(t * 3) * 0.04);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4); g.addColorStop(0, `rgba(255,240,240,${redStar})`); g.addColorStop(0.12, `rgba(255,60,60,${redStar})`); g.addColorStop(0.4, `rgba(160,0,40,${redStar * 0.5})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = 'lighter';
      meteors = meteors.filter((m) => {
        m.t += 1 / 60; const k = m.t / m.d; if (k >= 1) { for (let j = 0; j < 40; j++) sparks.push({ x: m.x1 * W, y: m.y1 * H, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.9) * 10, l: 1, c: m.c }); flash = Math.max(flash, 0.35); return false; }
        const x = (m.x0 + (m.x1 - m.x0) * k) * W, y = (m.y0 + (m.y1 - m.y0) * k) * H, tx = x - (m.x1 - m.x0) * W * 0.25, ty = y - (m.y1 - m.y0) * H * 0.25;
        const g = ctx.createLinearGradient(tx, ty, x, y); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgb(${m.c})`);
        ctx.strokeStyle = g; ctx.lineWidth = 6 * (W / 1200 + 0.5); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 5 * (W / 1200 + 0.5), 0, 7); ctx.fill();
        return true;
      });
      sparks = sparks.filter((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.l -= 0.02; if (p.l <= 0) return false; ctx.fillStyle = `rgba(${p.c},${p.l})`; ctx.fillRect(p.x, p.y, 3, 3); return true; });
      ctx.globalCompositeOperation = 'source-over';
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - 0.03); }
    };
    requestAnimationFrame(draw);

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let skip = false;
    const say = (html, cls = '') => { sub.className = 'op-sub ' + cls; sub.innerHTML = html; void sub.offsetWidth; sub.classList.add('in'); };
    const clear = () => { sub.classList.remove('in'); stage.innerHTML = ''; };
    const put = (html) => { stage.innerHTML = html; return stage.firstElementChild; };
    const end = () => {
      if (!alive) return; alive = false; skip = true;
      removeEventListener('resize', fit);
      root.classList.add('off'); setTimeout(() => root.remove(), 700);
      this.busy = false; if (done) done();
    };
    root.querySelector('.st-skip').addEventListener('pointerdown', (e) => { e.stopPropagation(); Audio.sfx('back'); end(); });
    const step = async (ms) => { if (!skip) await wait(ms); return skip; };

    // --- 1. 星の時代 ---
    if (await step(900)) return;
    say('遥か昔——天より、六つの星が墜ちた。');
    if (await step(3200)) return;
    const c6 = Object.values(ELC);
    c6.forEach((c, k) => setTimeout(() => meteors.push({ x0: 0.1 + Math.random() * 0.8, y0: -0.1, x1: 0.12 + k * 0.15, y1: 0.75 + Math.random() * 0.1, t: 0, d: 0.9, c: c.join(',') }), k * 260));
    if (await step(1800)) return;
    say('星は大地に牙を立て、選ばれし者にその力を宿した。<br>人はそれを——<b>「星牙」</b>と呼ぶ。');
    if (await step(4200)) return;
    // --- 2. 覇星帝 ---
    clear(); tint = [120, 0, 30]; tintA = 0;
    for (let k = 0; k < 30; k++) { if (skip) return; redStar = k / 30; tintA = k / 30 * 0.5; await wait(40); }
    say('そして今——<b class="red">七つ目の星</b>を名乗る男が現れた。');
    if (await step(2600)) return;
    put(`<div class="op-boss act"><img src="${IMG('zenova', '_act')}" alt=""><div class="op-name"><small>覇星帝国 皇帝</small>覇星帝ゼノヴァ</div></div>`);
    Audio.sfx('dark');
    if (await step(2600)) return;
    say('「六つの星牙を喰らい、この空ごと大地を墜とす。<br>それが我が覇道だ」', 'quote');
    if (await step(3600)) return;
    // --- 3. 四将 ---
    clear(); redStar = 0.4;
    put(`<div class="op-four">${[['boss1', 'バルガ', '鉄壁の猛将'], ['boss2', 'ザハル', '砂塵の蠍'], ['boss3', 'ヴォルグ', '氷狼将'], ['boss4', 'イグナス', '炎獄将']].map(([id, n, tt], k) => `<div style="--d:${k * 0.18}s"><img src="${IMG(id, '_b')}" alt=""><span><small>${tt}</small>${n}</span></div>`).join('')}</div>`);
    say('帝国の四将が、蒼星の国へと牙を剥く。');
    Audio.sfx('warn');
    if (await step(3800)) return;
    // --- 4. 星牙の担い手たち ---
    clear(); redStar = 0; tintA = 0;
    say('だが——星は、まだ人を見捨ててはいなかった。');
    if (await step(2400)) return;
    sub.classList.remove('in');
    const KAN = { reiga: '炎', setsuna: '氷', raika: '雷', gandou: '地', fuuka: '風', yomi: '闇' };
    const SFX = { reiga: 'fire', setsuna: 'ice', raika: 'thunder', gandou: 'quake', fuuka: 'wind', yomi: 'dark' };
    for (const [k, h] of heroes.entries()) {
      const c = ELC[h], info = CAST[h];
      tint = c; tintA = 0.35;
      put(`<div class="op-hero ${k % 2 ? 'r' : ''}" style="--c:rgb(${c})"><div class="op-speed"></div><div class="op-kan">${KAN[h]}</div><div class="op-slash"></div><img src="${IMG(h, '_act')}" alt=""><div class="op-name"><small>${info.t}</small>${info.n}</div></div>`);
      flash = 0.5; Audio.sfx(SFX[h]);
      if (await step(1700)) return;
    }
    // --- 5. 軍師 ---
    clear(); tint = [120, 90, 220]; tintA = 0.3;
    put(`<div class="op-boss ally"><img src="${IMG('mikoto', '_full')}" alt=""><div class="op-name"><small>蒼星軍 軍師</small>ミコト</div></div>`);
    say('星読みの軍師ミコトのもと、六人の星牙使いが立ち上がる。');
    if (await step(3400)) return;
    clear(); tint = [90, 140, 255]; tintA = 0.3;
    say('蒼き星の国を守る、六つの牙。<br>人は彼らを——<b>「蒼星のセイガ」</b>と呼ぶ。');
    if (await step(3600)) return;
    // --- 6. 集結 → タイトル ---
    clear(); tint = [255, 200, 110]; tintA = 0.25;
    put(`<div class="op-all">${heroes.map((h, k) => `<img src="${IMG(h, '_act')}" style="--d:${k * 0.1}s" alt="">`).join('')}</div>`);
    say('', '');
    if (await step(1600)) return;
    flash = 0.9; Audio.sfx('special');
    root.classList.add('logo');
    say('<div class="op-logo">蒼星<small>の</small>セイガ</div><div class="op-logo-s">一騎当千の戦いが、いま始まる</div>', 'logo');
    if (await step(4800)) return;
    end();
  },
};
