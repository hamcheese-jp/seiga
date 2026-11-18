// 英語版のデータと辞書(英語モードのときだけ使う)
//   データ(名前・説明・章・物語)は読み込み時に英語へ差し替え、画面の決まり文句は辞書と型(正規表現)で置き換える
import { EN, addDict, addPats, addWords, T } from './i18n.js';
import { ELEMENTS, HEROES, STAR_LABELS, OFFICER_NAMES, ALLY_NAMES, DIFFS, STAGES, ENDLESS, RARITY, WEAPON_NAMES, TRAITS, WEAPON_TYPE_NAMES, APT, JOBS, ACHIEVEMENTS, ARMOR_SLOT_TAB, ARMOR_SLOT_NAMES, ARMOR_SETS } from './data.js';
import { CAST, STORY } from './story.js';
import { MS } from './moves.js';
import { SJOB } from './horde.js';

// ---------- 固有名 ----------
const NAMES = {
  レイガ: 'Reiga', セツナ: 'Setsuna', ライカ: 'Raika', ガンドウ: 'Gandou', フウカ: 'Fuuka', ヨミ: 'Yomi', ミコト: 'Mikoto',
  バルガ: 'Barga', ザハル: 'Zahar', ヴォルグ: 'Volg', イグナス: 'Ignas', ゼノヴァ: 'Zenova',
  ドルガ: 'Dorga', ベイル: 'Beil', カザン: 'Kazan', ゴウラ: 'Goura', ザイード: 'Zaid', ムゲン: 'Mugen', バルド: 'Bald', ジオル: 'Jiol', ラゴウ: 'Ragou', ヘイガン: 'Heigan',
  ウルガ: 'Urga', ダイモン: 'Daimon', ゼクス: 'Zex', ボルグ: 'Borg', ガイエン: 'Gaien', シグロ: 'Shiguro', ハザク: 'Hazak', ロウガ: 'Rouga',
  カイセイ: 'Kaisei', ホクト: 'Hokuto', アマギ: 'Amagi', ミナト: 'Minato', セイラン: 'Seiran', トウマ: 'Touma',
};
const TITLES = {
  焔牙の剣士: 'Flamefang Swordsman', 氷華の槍姫: 'Frostbloom Lancer', 迅雷の双刃: 'Thunderclap Twinblades', 砕地の豪傑: 'Earthbreaker',
  翠嵐の舞姫: 'Jade Storm Dancer', 冥月の死神: 'Reaper of the Dark Moon', 鉄壁の猛将: 'Ironwall General', 砂塵の蠍: 'Scorpion of the Sands',
  氷狼将: 'Frost Wolf General', 炎獄将: 'Inferno General', 覇星帝: 'Tyrant Star Emperor', '蒼星軍 軍師': 'Azure Star Strategist',
  帝国将校: 'Imperial Officer', 覇星帝国軍: 'Tyrant Star Empire', 弓の将: 'Archer Captain', 魔導の将: 'Mage Captain', '覇星帝国 皇帝': 'Emperor of the Tyrant Star',
};
const WTYPE = { 大太刀: 'Odachi', 長槍: 'Spear', 双剣: 'Twin Blades', 大槌: 'War Hammer', 双扇: 'Twin Fans', 大鎌: 'Scythe', 大戦斧: 'Battle Axe', 長弓: 'Longbow', 宝杖: 'Staff', 毒双剣: 'Venom Blades', 氷狼槍: 'Frost Wolf Spear', 獄炎杖: 'Hellfire Staff', 覇星鎌: 'Tyrant Scythe' };
const STAGE_N = { 第一章: 'Chapter 1', 第二章: 'Chapter 2', 第三章: 'Chapter 3', 第四章: 'Chapter 4', 終章: 'Final Chapter', 特別: 'Special' };
const STAGE_NAME = {
  翠嵐平原の戦い: 'Battle of the Jade Plains', 紅砂峡谷の戦い: 'Battle of Crimson Sand Canyon', 霜牙雪原の戦い: 'Battle of the Frostfang Snowfield',
  焔獄火山の戦い: 'Battle of Inferno Volcano', 星墜つる帝城: 'The Falling Star Citadel', 星海の試練: 'Trial of the Star Sea',
};
const BASES = {
  蒼星軍本拠: 'Azure HQ', 西の野営地: 'West Camp', 東の野営地: 'East Camp', 西砦: 'West Fort', 東砦: 'East Fort', 北西の兵糧庫: 'NW Supply Depot', 北東の兵糧庫: 'NE Supply Depot', 帝国軍本拠: 'Imperial HQ',
  西の岩場: 'West Rocks', 南の岩場: 'South Rocks', 中央関門: 'Central Gate', 北西の砦: 'NW Fort', 南東の砦: 'SE Fort', 北の物見台: 'North Watchtower', 砂賊の根城: 'Bandit Lair',
  南西の野営地: 'SW Camp', 南東の野営地: 'SE Camp', 氷湖の砦: 'Ice Lake Fort', 西の氷壁: 'West Ice Wall', 東の氷壁: 'East Ice Wall', 北西の狼砦: 'NW Wolf Fort', 北東の狼砦: 'NE Wolf Fort', 氷狼軍本拠: 'Frost Wolf HQ',
  左翼の野営地: 'Left Wing Camp', 中央の野営地: 'Center Camp', 右翼の野営地: 'Right Wing Camp', 西の溶鉱炉: 'West Furnace', 中央工廠: 'Central Arsenal', 東の溶鉱炉: 'East Furnace', 北西の火口砦: 'NW Crater Fort', 北東の火口砦: 'NE Crater Fort', 炎獄の玉座: 'Inferno Throne',
  西の外郭: 'West Outer Wall', 東の外郭: 'East Outer Wall', 中央広場: 'Central Plaza', 西の櫓: 'West Tower', 東の櫓: 'East Tower', 西の兵舎: 'West Barracks', 東の兵舎: 'East Barracks', 内門: 'Inner Gate', 覇星の玉座: 'Tyrant Throne',
};
const SPECIALS = {
  紅蓮旋牙: 'Crimson Whirlfang', 氷華絶槍: 'Frostbloom Lance', 千雷乱舞: 'Thousand Thunders', 大地崩壊: 'Earthshatter', 神風乱舞: 'Divine Gale Dance', 冥府葬送: 'Underworld Requiem',
  鉄壁轟断: 'Ironwall Cleave', 砂塵千刃: 'Sandstorm Blades', 氷狼牙陣: 'Frost Wolf Fangs', 覇星墜天: 'Tyrant Starfall', 天穿流星: 'Skypiercer Meteor', 灼天星落: 'Searing Starfall', 獄炎噴火: 'Hellfire Eruption',
};
const SOLDIERS = { 刀兵: 'Swordsman', 槍兵: 'Spearman', 弓兵: 'Archer', 術兵: 'Mage', 重装兵: 'Heavy' };

if (EN) {
  // ---------- データの差し替え ----------
  const E2 = { fire: ['Fire', 'Burn: damage over time'], ice: ['Ice', 'Freeze: slows enemies'], thunder: ['Thunder', 'Shock: chains to nearby foes'], earth: ['Earth', 'Crush: stuns enemies'], wind: ['Wind', 'Gale: launches enemies high'], dark: ['Dark', 'Soul Drain: absorbs HP'] };
  for (const k in E2) [ELEMENTS[k].n, ELEMENTS[k].d] = E2[k];
  const DESC = {
    reiga: 'An all-rounder strong in attack and defense. Cuts through enemy lines with flaming slashes.',
    setsuna: 'Keeps enemies at bay with long reach. Her icy spear arts freeze wide areas.',
    raika: 'Overwhelming speed and number of hits. Races across the battlefield like lightning.',
    gandou: 'Unmatched in raw power. Never flinches mid-attack and smashes foes along with the earth itself.',
    fuuka: 'A ranged fighter who fires blades of wind. Gathers enemies with her dance and blows them all away.',
    yomi: 'Reaps wide areas with her great scythe and drains life from the wounds she inflicts.',
    barga: 'A fierce general of the Tyrant Star Empire. Borrow his ironclad body and crushing axe from the memory etched in the Star Fang.',
    zahar: 'Chief of the sand bandits. Fights with sandstorm blade combos and ambushes from behind.',
    volg: 'A general who hunted the northern snowfields. His ice fangs race along the ground and never let prey escape.',
    ignas: 'Lord of Inferno Volcano. An avatar of destruction who splits the earth and spews lava.',
    zenova: 'Emperor of the Tyrant Star Empire. Wields orbs of darkness and teleportation. The strongest Star Memory.',
  };
  for (const h of HEROES) { h.name = NAMES[h.name] || h.name; h.title = TITLES[h.title] || h.title; h.wname = WTYPE[h.wname] || h.wname; if (DESC[h.id]) h.desc = DESC[h.id]; }
  STAR_LABELS.splice(0, 4, 'Power', 'Range', 'Speed', 'Toughness');
  OFFICER_NAMES.forEach((n, i) => { OFFICER_NAMES[i] = NAMES[n] || n; });
  ALLY_NAMES.forEach((n, i) => { ALLY_NAMES[i] = NAMES[n] || n; });
  ['Easy', 'Normal', 'Hard', 'Asura', 'Purgatory'].forEach((n, i) => { DIFFS[i].n = n; });
  const INTRO = {
    s1: 'The vanguard of the Tyrant Star Empire invades the border plains. The Azure Star army sorties to meet them.',
    s2: 'To cut the enemy supply line, the Azure army heads into a canyon dyed by the setting sun. Hidden in the dust lurks Zahar, the bandit chief allied with the Empire.',
    s3: 'The frozen northern snowfields. Volg, the Frost Wolf General, uses the ice lake fort to encircle the Azure army.',
    s4: 'A volcanic region home to the imperial arsenal. Ignas\'s lava legions surge in from three directions.',
    s5: 'The night of the final battle. In the depths of the star-strewn citadel, the Tyrant Star Emperor Zenova awaits.',
    endless: 'Endless waves of enemies. Fight until you fall and compete for the most KOs.',
  };
  const SAY = {
    軍師ミコト: 'Strategist Mikoto', 斥候: 'Scout',
    '敵の砦を三つ落とせば、本拠を守る結界が解けます。まずは拠点の制圧を!': 'Take three enemy forts and the barrier guarding their HQ will fall. Capture the outposts first!',
    '敵の増援部隊が中央から迫っています!': 'Enemy reinforcements are closing in from the center!',
    'あと一つです! 敵の動きが慌ただしくなってきました。': 'Just one more! The enemy is starting to panic.',
    '峡谷は道が狭い分、敵も密集します。まとめて薙ぎ払ってください!': 'The canyon paths are narrow, so the enemy will bunch up. Sweep them away together!',
    'クク…背後ががら空きだぞ、蒼星軍。': 'Heh... your back is wide open, Azure army.',
    '敵の第二部隊が出撃しました!': 'The enemy\'s second unit has sortied!',
    '中央の氷湖の砦を押さえれば、どの戦線にもすぐ駆けつけられます。': 'Hold the Ice Lake Fort in the center and you can reach any front quickly.',
    '群れで狩れ。獲物は弱ったところから喰らうものだ。': 'Hunt as a pack. Devour the prey where it is weakest.',
    '東からも敵の別働隊です!': 'Another enemy unit from the east!',
    '敵は三方から同時に攻めてきます。本拠を落とされぬよう、戦況図に注意を!': 'The enemy attacks from three sides at once. Watch the map so our HQ doesn\'t fall!',
    '灰になるまで焼き尽くせ!': 'Burn them until nothing but ash remains!',
    '敵の決死隊が本拠を目指しています!': 'An enemy suicide squad is heading for our HQ!',
    'これが最後の戦いです。五つの拠点を落とし、玉座への道を開いてください!': 'This is the final battle. Take five outposts and open the path to the throne!',
    '星は墜ちる定め。貴様らもまた、我が覇道の礎となれ。': 'Stars are destined to fall. You too shall become the foundation of my conquest.',
    '帝国親衛隊が出撃! 本拠が狙われています!': 'The Imperial Guard has sortied! Our HQ is the target!',
    '敵の総攻撃です!': 'The enemy is launching an all-out attack!',
    '敵は四方の門から無限に湧きます。どこまで戦えるか…ご武運を!': 'Enemies will pour endlessly from all four gates. See how far you can go... good luck!',
    敵の増援部隊の将を倒せ: 'Defeat the reinforcement commander', 奇襲部隊の将を倒せ: 'Defeat the ambush commander', 西から迫る狩猟隊を倒せ: 'Defeat the hunting party from the west',
    中央突破を図る敵将を倒せ: 'Defeat the officer breaking through the center', 親衛隊長を倒せ: 'Defeat the Guard Captain',
  };
  for (const st of [...STAGES, ENDLESS]) {
    st.no = STAGE_N[st.no] || st.no; st.name = STAGE_NAME[st.name] || st.name; if (INTRO[st.id]) st.intro = INTRO[st.id];
    for (const b of st.bases) b.name = BASES[b.name] || b.name;
    for (const o of st.officers) { if (o.name) o.name = NAMES[o.name] || o.name; if (o.title) o.title = TITLES[o.title] || o.title; }
    for (const e of st.events) { if (e.say) e.say = [SAY[e.say[0]] || NAMES[e.say[0]] || e.say[0], SAY[e.say[1]] || e.say[1]]; if (e.mission) e.mission = SAY[e.mission] || e.mission; }
  }
  [['Common', 'Rank 1'], ['Fine', 'Rank 2'], ['Superb', 'Rank 3'], ['Treasure', 'Rank 4'], ['Masterpiece', 'Rank 5'], ['Relic', 'Rank 6']].forEach(([n, s], i) => { RARITY[i + 1].n = n; RARITY[i + 1].star = s; });
  Object.assign(WEAPON_NAMES, {
    sword: ['Iron Katana', 'Copper Edge', 'Dawn Blade', 'Crimson Fang', 'Divine Blade Tenen', 'Relic: Sunwheel'],
    spear: ['Plain Spear', 'Frostpillar', 'Ice Rain', 'Snow Blossom', 'Divine Spear Hakko', 'Relic: Moonfrost'],
    twin: ['Twin Shortblades', 'Violet Spark', 'Thundercutter', 'Narukami', 'Divine Blades Hekireki', 'Relic: Heaven\'s Thunder'],
    hammer: ['Wooden Mallet', 'Rockcrusher', 'Earthquake', 'Adamant', 'Divine Hammer Gaia', 'Relic: Kunlun'],
    fan: ['Dancing Fan', 'Blue Gale', 'Swift Wind', 'Jade Storm', 'Divine Fan Amatsukaze', 'Relic: Phoenix'],
    scythe: ['Sickle', 'Dusk Scythe', 'Haze', 'Road to Yomi', 'Divine Scythe Dark Moon', 'Relic: Eternal Night'],
    axe: ['Hatchet', 'Rocksplitter', 'Mountainfall', 'Ironwall', 'Divine Axe Thunderroar', 'Relic: Titan'],
    bow: ['Short Bow', 'Hawk Feather', 'Shooting Star', 'Skypiercer', 'Divine Bow Sunshot', 'Relic: Amenomakago'],
    staff: ['Oak Staff', 'Flame Orb', 'Stargazer', 'Searing Sky', 'Divine Staff Banshou', 'Relic: Nyoi'],
  });
  const TR = {
    atk: ['Might', 'ATK +{v}%'], hp: ['Vitality', 'HP +{v}%'], def: ['Guard', 'DEF +{v}%'], spd: ['Swiftness', 'Move speed +{v}%'], aspd: ['Haste', 'Attack speed +{v}%'],
    range: ['Reach', 'Attack range +{v}%'], sp: ['Focus', 'Special gauge gain +{v}%'], rage: ['Fighting Spirit', 'Awakening gauge gain +{v}%'], crit: ['Critical', 'Crit rate +{v}%'],
    steal: ['Lifesteal', 'Heal {v}% of damage dealt'], elem: ['Element', 'Element effect +{v}%'], charge: ['Heavy Blow', 'Charge attack +{v}%'], musou: ['Mastery', 'Special power +{v}%'],
    exp: ['Learning', 'EXP gained +{v}%'], gold: ['Fortune', 'Gold gained +{v}%'], luck: ['Luck', 'Weapon quality +{v}%'], regen: ['Regen', 'Regenerate {v}% HP per second'],
  };
  for (const k in TR) [TRAITS[k].n, TRAITS[k].d] = TR[k];
  for (const k in WEAPON_TYPE_NAMES) WEAPON_TYPE_NAMES[k] = WTYPE[WEAPON_TYPE_NAMES[k]] || WEAPON_TYPE_NAMES[k];
  APT[2].n = 'Expert'; APT[1].n = 'Capable'; APT[0].n = 'Unskilled'; APT['-1'].n = 'Inept';
  const JB = {
    kenshi: ['Swordsman', 'A warrior who has mastered the odachi. Handles most blades.'],
    souhei: ['Lancer', 'A master of polearms who fights with reach.'],
    shinobi: ['Shinobi', 'A nimble dual-wielder, also good with ranged weapons.'],
    goushi: ['Warrior', 'A powerhouse who crushes foes with hammers and axes. Heavy armor is no burden.'],
    maihime: ['Dancer', 'Fights as if dancing. Suits fans and light garb.'],
    shinigami: ['Reaper', 'A dark warrior who reaps lives with a scythe and wields cursed staves.'],
    kyuhei: ['Archer', 'Shoots from afar and nimbly evades when approached.'],
    madou: ['Mage', 'Fires magic bolts from a staff. Heavy armor hinders movement.'],
    samurai: ['Samurai', 'Combines sword and shinobi arts. Handles twin blades and bows too.'],
    musha: ['Warlord', 'Clad in heavy armor, swings both odachi and hammer.'],
    ryukishi: ['Dragoon', 'Breaks the battlefield with polearms and heavy armor.'],
    kariudo: ['Hunter', 'Sharp at any range, switching between bow and twin blades.'],
    miko: ['Shrine Maiden', 'Draws out the power of the stars through dance and prayer.'],
    jujutsu: ['Hexer', 'Spreads curses with scythe and staff.'],
    naginata: ['Naginata Master', 'Swings polearms as if dancing.'],
    shokei: ['Executioner', 'Cuts foes down in one stroke with scythe and great axe.'],
    kensei: ['Sword Saint', 'One who has mastered the way of the sword. Wields any weapon.'],
    haou: ['Overlord', 'Rules the land with heavy arms and armor.'],
    tenryu: ['Sky Dragon General', 'A dragon general who pierces the heavens with polearms.'],
    tenkyu: ['Heavenly Archer', 'A master archer who can pierce the sky itself.'],
    daikenja: ['Archsage', 'The pinnacle of magic who knows every law of the stars.'],
    meiou: ['Lord of the Underworld', 'Commands the scythe and curses of the underworld.'],
  };
  for (const k in JB) if (JOBS[k]) [JOBS[k].n, JOBS[k].d] = JB[k];
  const AC = {
    first: ['First Victory', 'Win a battle for the first time'], ko500: ['500 Slain', 'Defeat 500 enemies in one battle'], ko1000: ['One Against a Thousand', 'Defeat 1000 enemies in one battle'],
    ko2000: ['Unstoppable', 'Defeat 2000 enemies in one battle'], tot10k: ['Battlefield Demon', 'Defeat 10,000 enemies in total'], tot100k: ['Avatar of Carnage', 'Defeat 100,000 enemies in total'],
    combo300: ['Combo Artist', 'Reach a 300-hit combo'], combo1000: ['Thousand Hits', 'Reach a 1000-hit combo'], off50: ['Officer Slayer', 'Defeat 50 officers in total'],
    srank: ['Total Victory', 'Earn an S rank'], clearAll: ['Dawn of the Azure Star', 'Clear every chapter'], srankAll: ['Undefeated', 'Earn an S rank in every chapter'],
    chaos: ['Path of Asura', 'Clear a chapter on Asura or higher'], hell: ['Purgatory Conquered', 'Clear the final chapter on Purgatory'], heroes: ['Six Stars United', 'Unlock every Star Fang wielder'],
    lv30: ['Veteran Wielder', 'Raise a wielder to Lv30'], lv60: ['Star Fang Expert', 'Raise a wielder to Lv60'], lv99: ['Star Fang Pinnacle', 'Raise a wielder to Lv99'],
    rar5: ['Keeper of Masterpieces', 'Obtain a Rank 5 weapon'], rar6: ['Relic Heir', 'Obtain a relic'], forge10: ['Master Smith', 'Upgrade a weapon to +10'],
    perfect: ['Perfect Dodge Master', 'Perform 30 Perfect Dodges in total'], nodmg: ['Flawless Victory', 'Win taking 10% damage or less'],
    end10: ['Battle-Hardened', 'Reach wave 10 in the Trial of the Star Sea'], end25: ['Immortal', 'Reach wave 25 in the Trial of the Star Sea'], rich: ['Tycoon', 'Hold 50,000 gold'],
  };
  for (const a of ACHIEVEMENTS) if (AC[a.id]) [a.n, a.d] = AC[a.id];
  Object.assign(ARMOR_SLOT_TAB, { head: 'Head', body: 'Body', arms: 'Arms', legs: 'Legs', shield: 'Shield' });
  Object.assign(ARMOR_SLOT_NAMES, { head: 'Headband', body: 'Cuirass', arms: 'Gauntlets', legs: 'Greaves', shield: 'Shield' });
  const AS = { guren: ['Crimson', 'Red lacquer with gold trim. Light and easy to move in.'], kurogane: ['Black Iron', 'Heavy tempered steel covering shoulders and elbows.'], souten: ['Azure Sky', 'Light blue-and-silver armor with pointed pauldrons and a crest.'], ougon: ['Golden', 'The heaviest gold-and-black armor with a horned helm and five-layer pauldrons.'] };
  for (const k in AS) [ARMOR_SETS[k].n, ARMOR_SETS[k].d] = AS[k];
  for (const k in CAST) { CAST[k].n = NAMES[CAST[k].n] || CAST[k].n; CAST[k].t = TITLES[CAST[k].t] || CAST[k].t; }
  for (const k in MS) if (MS[k] && MS[k].spName) MS[k].spName = SPECIALS[MS[k].spName] || MS[k].spName;
  for (const s of SJOB) s.n = SOLDIERS[s.n] || s.n;

  // ---------- 物語 ----------
  const ST = {
    s1: {
      pre: ['Chapter 1: Battle of the Jade Plains',
        'Azure Star Calendar 720, spring. The great army of the Tyrant Star Empire appeared on the Jade Plains at the border.',
        'The imperial vanguard numbers about twenty thousand. Leading them is Barga, the Ironwall General.',
        'The enemy HQ is protected by a stargazer\'s barrier. Take the three surrounding forts and it should fall.',
        { reiga: 'Three, then. I\'ll cut through them all. Mikoto, I leave my back to you.', setsuna: 'Understood. They will not set one foot on Azure Star soil.', raika: 'Three? Easy. With my legs it\'ll be over before breakfast!', gandou: 'Gahaha! Faster to smash the forts flat!', fuuka: 'Okay! I\'ll ride the wind and wrap it up in no time!', yomi: '...Three forts. Got it. I\'ll reap them all.' },
        'Azure brats. As if the likes of you could break this iron wall!',
        'They\'ll push with numbers. Don\'t get surrounded—take the outposts one by one!'],
      post: [null,
        'Ngh... This iron wall... felled by a single warrior...',
        'But remember this... His Majesty\'s "Tyrant Star" has already awakened...!',
        'Tyrant Star...? The legend of a seventh star is just a fairy tale...',
        'And... just now, Barga\'s star power flowed into your Star Fangs. A Star Fang etches the fighting style of those it defeats as a "Star Memory."',
        'By tracing those memories, you should even be able to borrow the power of enemy generals.',
        'Hah, that was a fine fight! I\'m Gandou. The Empire burned my village.',
        'Let me swing this hammer for you. I\'ve got a debt to settle with the Empire!',
        { reiga: 'Glad to have you. I\'ll count on the power of the earth fang.', setsuna: 'Welcome, Sir Gandou. Let us fight together.', raika: 'You\'re huge! With you around, we\'re worth a hundred men!', gandou: '...Aye. From today, I swing for the Azure Star.', fuuka: 'Wow, you look strong! Nice to meet you, Gandou!', yomi: '...Nice to meet you. Big guy.' },
        'Gandou, the Earthbreaker, joined the party.'],
    },
    s2: {
      pre: ['Chapter 2: Battle of Crimson Sand Canyon',
        'The imperial supplies pass through the Crimson Sand Canyon to the south. Running it is a bandit chief allied with the Empire.',
        'Zahar, the Scorpion of the Sands. A dangerous foe who excels at ambushes and traps.',
        'And... there are rumors that a dancer bearing the wind Star Fang is held captive in the bandit lair.',
        'Heh heh... Star Fang wielders coming to me on their own? His Majesty will pay a fine price for you.',
        { reiga: 'A scoundrel who sells people. No mercy.', setsuna: 'We will surely rescue the captive.', raika: 'Traps or whatever—I\'ll just run past before they spring!', gandou: 'Crafty scorpion. I\'ll stomp you flat!', fuuka: 'I can sense him... he\'s close. This time I won\'t let him get away!', yomi: '...I hate scorpions. They\'re poisonous.' }],
      post: [null,
        'Tch... this isn\'t worth it... That bastard emperor never said Star Fang wielders were this strong...',
        'Ah...! You came to save me!? Thank you!',
        'I\'m Fuuka! I\'ve been held captive all this time because I carry the wind Star Fang.',
        'The Empire is trying to gather all six Star Fangs. I couldn\'t find out what for, though...',
        'All six...? Surely not... the Tyrant Star ritual...',
        'Let me repay you! I want my wind to blow together with yours!',
        'Fuuka, the Jade Storm Dancer, joined the party.'],
    },
    s3: {
      pre: ['Chapter 3: Battle of the Frostfang Snowfield',
        'The Frostfang Snowfield in the north. Wolf howls echo from beyond the blizzard.',
        'Volg, the Frost Wolf General... a cruel commander who hunts even fleeing villagers. He\'s encircling us from the Ice Lake Fort.',
        'I smell prey. The smell of a Star Fang... Hunt as a pack. Let none escape.',
        '...Volg. Him, I will never forgive.',
        'You\'re... one of the Empire\'s black-robed agents? Why are you here...?',
        'I\'m Yomi. I\'m no longer the Empire\'s blade. ...I\'ll lend a hand until I reap him.',
        { reiga: 'If our goal is the same, let\'s fight together for now.', setsuna: '...Very well. I will trust your word.', raika: 'The enemy of my enemy, huh? Sure, I\'m in!', gandou: 'You look capable. I\'ll trust you with my back!', fuuka: 'Your name is Yomi? Let\'s do our best together!', yomi: '...Let\'s go. We\'re the hunters now.' }],
      post: [null,
        'Impossible... I, the hunter... hunted...?',
        '...It\'s over. Everyone from the village. I avenged you.',
        'I\'ll tell you Zenova\'s goal. ...He\'ll feed the six Star Fangs to the Tyrant Star and bring the stars in the sky crashing down to earth.',
        'Wherever a star falls, everything burns. Only the Empire will remain. That is the "Starfall."',
        'No... he means to burn an entire nation with the stars...!',
        '...So I\'ll stop him. I\'m coming too.',
        'Yomi, the Reaper of the Dark Moon, joined the party.'],
    },
    s4: {
      pre: ['Chapter 4: Battle of Inferno Volcano',
        'Inferno Volcano, the heart of the Empire. In its furnaces, weapons to devour Star Fangs are forged day and night.',
        'The arsenal is guarded by Ignas, the Inferno General. Take it, and the Empire loses the vessel for the "Starfall."',
        'Hahaha! Welcome, Star Fangs! Melt! Burn! Turn to ash! I\'ll toss you all into the furnace together!',
        { reiga: 'Don\'t think flames can burn me. In the name of the Flamefang, this ends here.', setsuna: 'This heat... but my ice will not melt.', raika: 'Hot! Let\'s wrap this up and go somewhere cool!', gandou: 'I\'ll smash you, lava and all!', fuuka: 'So hot! But I\'ll blow it all away with my wind!', yomi: '...Fire can\'t light up the darkness.' },
        'They\'re coming from three sides! Watch the map so our HQ doesn\'t fall!'],
      post: [null,
        'Gwaaah...! The flames... my flames are going out...!',
        'But... it\'s too late... The vessel has been carried to the citadel... Tonight, the stars will fall...!',
        'Tonight... the "Night of Convergence" when seven stars align...! The ritual is tonight!',
        'Everyone, let\'s hurry to the citadel. This... will be our final battle.'],
    },
    s5: {
      pre: ['Final Chapter: The Falling Star Citadel',
        'The Night of Convergence. In the sky above the citadel, an ominous red seventh star was shining.',
        'Welcome, bearers of the Star Fangs. Have you come to offer yourselves to my Tyrant Star?',
        'Stars are destined to fall. Weak nations and weak people alike shall vanish as the foundation of my conquest.',
        'Take the five outposts and the path to the throne will open. Everyone... good luck!',
        { reiga: 'I won\'t let your star fall. With this flame, I\'ll sever your conquest itself!', setsuna: 'The stars are not meant to burn people. On the pride of the Azure Star, I will stop you!', raika: 'Starfall or whatever—I\'ll knock you down faster than lightning!', gandou: 'For every village burned, I\'ll put it all into this blow! Prepare yourself!', fuuka: 'I won\'t give everyone\'s sky to the likes of you!', yomi: '...Tyrant Star Emperor. I\'ve come to reap your star.' }],
      post: [null,
        'Impossible... the six stars... reject my Tyrant Star...?',
        '...I see. So the stars... choose their people...',
        'The red star shattered and returned to the night sky as particles of light.',
        'The star... is returning to the sky. It\'s over, isn\'t it...',
        { reiga: 'Yeah. ...Let\'s go home, Mikoto. Everyone\'s waiting.', setsuna: 'Yes. From now on, let us use this power only to protect.', raika: 'Heh, we did it! I\'m starving! Let\'s go home and feast!', gandou: 'Gahaha! Now we can finally rebuild the burned villages!', fuuka: 'Yay! Look, the stars are so pretty!', yomi: '...Yeah. Pretty. ...I\'m glad I could see them with everyone.' },
        'The six Star Fangs slept once more in the earth, and peace returned to the land of the Azure Star.',
        'The people praised the six Star Fang wielders and called them—"SEIGA, Fangs of the Azure Star."',
        '— THE END —   (Test your skills further in the Trial of the Star Sea and higher difficulties!)'],
    },
  };
  for (const sid in ST) for (const part of ['pre', 'post']) {
    const sc = STORY[sid] && STORY[sid][part], en = ST[sid][part]; if (!sc || !en) continue;
    if (en[0]) sc.title = en[0];
    sc.lines.forEach((ln, i) => { const v = en[i + 1]; if (v) ln.t = v; });
  }
}

// ---------- 画面の文字(辞書) ----------
addWords({ ...NAMES, ...TITLES, ...WTYPE, ...STAGE_N, ...STAGE_NAME, ...BASES, ...SPECIALS, ...SOLDIERS, 星海の試練: 'Trial of the Star Sea', 蒼星軍: 'Azure army', 紅軍: 'Crimson', 蒼軍: 'Azure', 金: 'G' });
addDict({
  // タイトル・共通
  '画面をタップして開始': 'Tap to Start', '← 戻る': '← Back', '戻る': 'Back', 'やめる': 'Cancel', '実行': 'OK', '閉じる': 'Close', 'リセット': 'Reset', '完 了': 'Done',
  '蒼星のセイガ': 'SEIGA', '蒼星': 'SEIGA', 'セイガ': '', 'の': '', '読み込み中…': 'Loading…', '出撃準備中': 'Preparing for battle', '📲 アプリとして追加': '📲 Install App', 'アプリとして追加': 'Install App',
  'ホーム画面に追加しました': 'Added to home screen', 'Chromeで開き直す': 'Reopen in Chrome',
  手を振る: 'Wave', おじぎ: 'Bow', バンザイ: 'Cheer', 拍手: 'Clap', 踊る: 'Dance', 座る: 'Sit', 笑う: 'Laugh', ありがとう: 'Thanks', 力こぶ: 'Flex', しょんぼり: 'Sad', アクション: 'Actions',
  '星牙使い': 'Wielder','星牙使い選択': 'Choose Wielder', '(Lvが上がると増加)': '(increases with level)', '店': 'Shop', '防': 'DEF', '星海の試練': 'Trial of the Star Sea', '日本語': '日本語',
  '例: ガンドウの大槌が気持ちいい! 対戦の人数がもっと集まってほしい': 'e.g. Gandou\'s hammer feels great! I wish more people played versus',
  剛力: 'Might', 堅守: 'Guard', 疾風: 'Swiftness', 神速: 'Haste', 大振: 'Reach', 練気: 'Focus', 闘魂: 'Fighting Spirit', 吸生: 'Lifesteal', 豪撃: 'Heavy Blow', 極意: 'Mastery', 学習: 'Learning', 蓄財: 'Fortune', 幸運: 'Luck', 活丹: 'Regen',
  'ボタン配置を初期状態に戻しました': 'Button layout reset', 'ランダム対戦にはクラウド連携が必要です': 'Random match requires cloud sync', '保護中の武器は素材にできません': 'Locked weapons can\'t be used as material',
  '合成に失敗…武器が砕け散った': 'Fusion failed… the weapon shattered', '持ち物がいっぱいです。売却してから買ってください': 'Your inventory is full. Sell something first',
  '画質を変更しました(兵の数などは次の戦いから反映)': 'Quality changed (troop counts apply from the next battle)', '装備中の武器は素材にできません': 'Equipped weapons can\'t be used as material',
  '部屋との接続が切れました': 'Lost connection to the room', '金が足りません': 'Not enough gold',
  // ホーム(町)
  '今日の目標': 'Daily Goals', '道具屋': 'Shop', '武器・防具を買う': 'Buy weapons & armor', '鍛冶屋': 'Smithy', '武器・防具の装備と強化': 'Equip & upgrade gear', '道場': 'Dojo', '職業・転職': 'Classes', '詰所': 'Barracks', '武将を入れ替える': 'Change hero',
  '酒場': 'Tavern', 'オンラインで協力・対戦': 'Online co-op & versus', '語り部': 'Storyteller', '物語をふり返る': 'Replay the story', '高札': 'Notice Board', '称号・ランキング': 'Titles & rankings', '宿': 'Inn', '設定・データの保存': 'Settings & save data',
  '出陣の門': 'Battle Gate', '世界地図へ': 'To world map', '世界地図へ出る': 'Go to the world map', '拠点の町': 'Home Town', '町へ戻る': 'Return to town', '制圧済み': 'Conquered', '未踏の戦場': 'Unexplored', '？？？(前の章をクリア)': '??? (clear the previous chapter)',
  '出撃する': 'Sortie', '果てなき戦い': 'Endless battle', '第一章クリアで解放': 'Unlocked by clearing Chapter 1', 'タップで入る': 'Tap to enter', 'J / Enter で入る': 'Press J / Enter to enter',
  '戦場の旗へ歩いて出撃 ／ 赤い門で町へ戻る': 'Walk to a battle flag to sortie / red gate returns to town', '建物に近づいて入る ／ 南の赤い門から世界地図へ': 'Walk up to a building to enter / south red gate leads to the world map',
  '左でスティック・右で視点': 'Left: move stick / Right: camera', 'WASD で歩く・ドラッグで視点': 'WASD to walk / drag to look',
  // 出撃・武将選択
  '出撃': 'Sortie', '出 撃': 'SORTIE', '星牙使い選択へ': 'Choose a wielder', '前の章をクリアで解放': 'Clear the previous chapter to unlock', '未クリア': 'Not cleared', '武器変更': 'Change weapon',
  '基本能力': 'Base stats', '体力': 'HP', '攻撃': 'ATK', '防御': 'DEF', '速さ': 'Speed', '攻撃速度': 'Atk speed', '職業': 'Class', '移動': 'Move', '重さ': 'Weight', '熟練': 'Mastery', '種類': 'Type', '強化': 'Upgrade', '合成': 'Fusion', '部位': 'Slot',
  // 装備
  '装備': 'Equipment', '装備中': 'Equipped', '売却': 'Sell', '保護': 'Lock', '保護解除': 'Unlock', '特性なし': 'No traits', '外す': 'Remove', '防具なし': 'No armor', '武器': 'Weapon', '鎧': 'Armor', 'NEW': 'NEW',
  '★2以下を一括売却': 'Sell all Rank 2 and below', 'この部位の防具をまだ持っていません。': 'You don\'t have any armor for this slot yet.',
  '敵将を倒すと武器を落とします。難易度が高いほど良質に。': 'Officers drop weapons when defeated. Higher difficulty means better quality.',
  'どの武器も装備できます。適性(◎○△×)は職業で決まり、不得手な武器ほど攻撃と攻撃速度が下がります。重い武器ほど動きが遅くなります。技は武器の種類で決まります。': 'Any weapon can be equipped. Aptitude (◎○△×) depends on class; the less suited the weapon, the lower your ATK and attack speed. Heavier weapons slow you down. Moves depend on the weapon type.',
  '素材にする武器を左の一覧から選んでください(素材は成否にかかわらず消えます)。': 'Choose a material weapon from the list on the left (the material is consumed whether it succeeds or not).',
  '失敗すると合成値が1下がるか、武器そのものが消えます。': 'On failure, the fusion value drops by 1 or the weapon itself is destroyed.',
  '同じ種類の武器だけ素材にできます': 'Only weapons of the same type can be used as material',
  '素材の武器は必ず消えます。': 'The material weapon is always consumed.',
  '防具は合戦に勝つと手に入ります。部位ごとに違う鎧を組み合わせられ、着けた鎧は姿にも表れます。': 'Armor is earned by winning battles. You can mix sets per slot, and what you wear shows on your character.',
  '鎧のセットごとの適性(◎○△×)は職業で決まり、防御が増減します。': 'Aptitude (◎○△×) for each armor set depends on class and changes your DEF.',
  // 店
  '売り切れ': 'Sold out', '品ぞろえは毎日入れ替わります(ランク4まで。ランク5・6は合戦で敵将が落とします)。': 'Stock changes daily (up to Rank 4; Ranks 5–6 drop from officers in battle).',
  '買った品は「装備」画面で装備できます。武器・鎧の適性は職業で決まります。': 'Equip purchases on the Equipment screen. Weapon and armor aptitude depends on class.',
  // 職業
  'いまの職業': 'Current class', '未解放': 'Locked', '解放の条件': 'Requirements', '能力の傾向': 'Stat bonuses', '武器の熟練': 'Weapon mastery', '鎧の熟練': 'Armor mastery',
  '◎得意 ○扱える △不慣れ ×苦手。不得手な武器ほど攻撃と攻撃速度が下がり、不得手な鎧ほど防御が下がります。': '◎ Expert ○ Capable △ Unskilled × Inept. Unsuited weapons lower ATK and attack speed; unsuited armor lowers DEF.',
  '合戦で、いまの職業・持っている武器・着ている鎧の熟練が上がります。職業のレベルで能力が伸び、武器・鎧の熟練はLv10・20で適性が1段ずつ良くなります。': 'Battles raise mastery of your current class, weapon and armor. Class level boosts stats; weapon and armor mastery improve aptitude one step at Lv10 and Lv20.',
  '1次職2つを最大にすると2次職、2次職2つを最大にすると3次職に転職できます。技は武器の種類で決まります。': 'Max two Tier 1 classes to unlock a Tier 2 class, and two Tier 2 classes for Tier 3. Moves depend on the weapon type.',
  '間合い': 'Reach', '会心': 'Crit', '吸収': 'Drain', '属性': 'Element', '溜め': 'Charge',
  // オンライン
  'オンライン': 'Online', 'ランダム対戦': 'Random Match', '対戦相手を探しています…': 'Looking for opponents…', '協力の部屋を作る': 'Create co-op room', '対戦の部屋を作る': 'Create versus room',
  'ランダム対戦(知らない人と)': 'Random match (with strangers)', 'CPUと4対4': '4v4 vs CPU', '部屋に入る': 'Join room', '部屋番号': 'Room code', '部屋を出る': 'Leave room', '退出させる': 'Kick',
  '4対4 対戦': '4v4 Versus', '部屋に接続しています…': 'Connecting to room…', '部屋に参加しました': 'Joined the room', '接続が切れました': 'Disconnected', '準備中…': 'Preparing…',
  'つながりませんでした。番号を確かめてもう一度お試しください': 'Could not connect. Check the code and try again', '自分の星牙使い': 'Your wielder', '章と難易度は部屋を作った人が決めます。': 'The host chooses the chapter and difficulty.',
  '部屋を作った人の出撃を待っています': 'Waiting for the host to start', '紅軍': 'Crimson', '蒼軍': 'Azure', '[紅軍] ': '[Crimson] ', '[蒼軍] ': '[Azure] ',
  '部屋を作った人に出る6文字の部屋番号を、ほかの人が入力して参加します。通信は端末どうしの直接接続で、料金はかかりません。': 'The host gets a 6-letter room code; others enter it to join. Devices connect directly to each other—free of charge.',
  '※ 回線によってはつながらない場合があります(Wi-Fi同士がおすすめ)。': '* Some networks may fail to connect (Wi-Fi on both sides is recommended).',
  '5分間で倒した数を競います(星牙使い10点・隊長3点・兵1点・拠点5点・本拠20点)。人数が足りない枠はCPUの星牙使いが入ります。': 'Compete for KOs over 5 minutes (wielder 10 pts, captain 3, soldier 1, outpost 5, HQ 20). Empty slots are filled by CPU wielders.',
  'LINEで送る': 'Send via LINE', 'Xで募集': 'Post on X', 'ほかのアプリで送る': 'Share via app', 'URLをコピー': 'Copy URL', '招待URLをコピーしました': 'Invite URL copied',
  '6文字の部屋番号を入力してください': 'Enter the 6-letter room code', 'その部屋は見つかりませんでした': 'Room not found', 'その部屋は満員か、すでに出撃しています': 'The room is full or already in battle', '部屋から退出しました': 'You left the room',
  // 物語・称号・ランキング
  '物語': 'Story', 'オープニング': 'Opening', '星牙と覇星帝の物語のはじまり': 'Where the tale of the Star Fangs begins', '出撃前の物語': 'Before the battle', '決着の後の物語': 'After the battle', 'まだ見ていない物語': 'Not yet seen', '？？？': '???',
  '称号': 'Titles', '累計撃破数': 'Total KOs', '戦闘回数 / 勝利': 'Battles / Wins', '最多撃破(1回の戦い)': 'Most KOs (one battle)', '最大連撃': 'Max combo', '撃破した敵将': 'Officers defeated', '見切り回数': 'Perfect dodges', '総プレイ時間': 'Total play time',
  'ランキング': 'Rankings', '今週の撃破数': 'This Week\'s KOs', '取得できませんでした。通信状況と連携URLを確認してください。': 'Couldn\'t load. Check your connection and the sync URL.', 'まだ記録がありません。最初の記録を刻もう!': 'No records yet. Be the first!',
  'ランキングはスプレッドシート連携を設定すると利用できます。': 'Rankings are available once spreadsheet sync is set up.',
  // 今日の目標
  '今日の目標(毎日0時に入れ替わり)': 'Daily Goals (reset at midnight JST)', 'ログインボーナス(毎日1回・7日で1周)': 'Login Bonus (once a day, 7-day cycle)', '連続で遊ぶほど増えます。1日空くと1日目に戻ります。': 'Grows the more days in a row you play. Missing a day resets it to Day 1.',
  '今週の撃破数ランキング': 'Weekly KO Ranking', '今週の番付を見る': 'View this week\'s ranking', '今日の目標をすべて達成': 'All daily goals complete', 'オンライン(協力・対戦・CPU戦)で1回遊ぶ': 'Play 1 online match (co-op, versus or vs CPU)',
  // 設定
  '設定': 'Settings', 'プレイヤー名(ランキング用)': 'Player name (for rankings)', '画質': 'Quality', '自動': 'Auto', '低(軽量)': 'Low (light)', '中': 'Medium', '高': 'High', '最高': 'Ultra',
  'BGM音量': 'Music volume', '効果音音量': 'SFX volume', '視点感度': 'Camera sensitivity', '視点の自動追従': 'Auto camera', 'ボタン大きさ': 'Button size', 'ボタン配置': 'Button layout', '画面上で編集': 'Edit on screen', '振動': 'Vibration', 'FPS表示': 'Show FPS',
  'スプレッドシート連携(クラウド保存)': 'Spreadsheet sync (cloud save)', '連携URL': 'Sync URL', '状態': 'Status', '連携中': 'Connected', '未設定': 'Not set', '引き継ぎコード': 'Transfer code', 'コピー': 'Copy', '今すぐ': 'Now', 'クラウドへ保存': 'Save to cloud', 'データ復元': 'Restore data', '読み込む': 'Load',
  '引き継ぎコードを入力': 'Enter transfer code', '感想・要望を送る': 'Send feedback', '送信する': 'Send', '操作方法': 'Controls', 'タッチ': 'Touch', 'キーボード': 'Keyboard', 'ゲームパッド': 'Gamepad', 'セーブデータを初期化': 'Reset save data', '言語 / Language': 'Language',
  '引き継ぎコードは合言葉を兼ねています。他人に教えないでください(知られるとデータを上書きされます)。セーブデータは常にこの端末に保存されます。Google Apps Script のURLを設定すると、Googleスプレッドシートにも自動保存され、別の端末へ引き継ぎ・ランキング参加ができます(設定手順は README.md)。': 'The transfer code doubles as a password. Don\'t share it (others could overwrite your data). Your save is always stored on this device; with a Google Apps Script URL it also syncs to a spreadsheet so you can transfer devices and join rankings.',
  '遊んだ感想、不具合、「ここを直してほしい」などを開発者に送れます(返信はできません)。個人情報は書かないでください。': 'Send impressions, bugs or requests to the developer (no replies). Please don\'t include personal information.',
  '感想を入力してください': 'Please enter your feedback', '送信中…': 'Sending…', 'ありがとうございます! 感想を送りました': 'Thank you! Feedback sent', '送信できませんでした。時間をおいて試してください': 'Couldn\'t send. Please try again later',
  '画面左をドラッグで移動 / 右のボタンで攻撃・回避 / 何もない所をドラッグで視点回転': 'Drag on the left to move / right buttons to attack and dodge / drag empty space to rotate the camera',
  'WASD 移動 / J 攻撃 / K チャージ / L・Space 回避 / I 奥義 / U 覚醒 / ←→ 視点 / P 一時停止': 'WASD move / J attack / K charge / L or Space dodge / I Special / U Awaken / ←→ camera / P pause',
  '左スティック移動 / □攻撃 △チャージ ✕回避 ○奥義 R1覚醒': 'Left stick move / □ attack △ charge ✕ dodge ○ Special R1 Awaken',
  'すべてのセーブデータを消去します。よろしいですか?': 'This will erase all save data. Are you sure?', 'データを初期化しました': 'Save data reset', 'スプレッドシート連携を有効にしました': 'Spreadsheet sync enabled', 'クラウドへ保存中…': 'Saving to cloud…', '引き継ぎコードをコピーしました': 'Transfer code copied',
  // 一時停止・結果
  '一時停止': 'Paused', '再開': 'Resume', '撤退する(戦いを中断)': 'Retreat (quit battle)', '連打 or 押しっぱなしで連続攻撃': 'Tap or hold for combos', '通常攻撃の途中で押すと派生技': 'Press mid-combo for a follow-up move',
  '直前回避で「見切り」発動': 'Dodge at the last moment for a Perfect Dodge', 'ゲージ満タンで発動(無敵)': 'Use at full gauge (invincible)', 'ゲージ満タンで一定時間強化': 'Power up for a while at full gauge',
  'チャージ': 'Charge', '回避': 'Dodge', '奥義': 'Special', '覚醒': 'Awaken', '勝 利': 'VICTORY', '敗 北': 'DEFEAT', '戦闘終了': 'Battle Over', '撃破数': 'KOs', '戦闘時間': 'Time', '倒した敵将': 'Officers defeated', '制圧拠点': 'Outposts taken', '特命': 'Missions', '見切り': 'Perfect dodges',
  '獲得経験値': 'EXP gained', '獲得金': 'Gold gained', '新記録!': 'New record!', '新たな技を習得した!': 'Learned a new move!', '✦ 神器を授かった! ✦': '✦ You received a Relic! ✦', '入手した武器': 'Weapons obtained', '入手した防具': 'Armor obtained',
  '拠点へ戻る': 'Back to town', 'もう一度': 'Play again', '撃破': 'KOs', '連撃': 'Combo', '戦況': 'Morale',
  // 合戦
  '拠点制圧': 'Outpost Captured', '拠点陥落': 'Outpost Lost', '本拠が陥落した…': 'Our HQ has fallen…', '結界消滅': 'Barrier Down', '敵将軍を倒せ!': 'Defeat the enemy general!', '結界が消えました! 今こそ敵の本拠へ!': 'The barrier is gone! Now, to the enemy HQ!',
  '結界に阻まれた! 拠点を制圧して結界を解こう': 'Blocked by the barrier! Capture outposts to break it', '会心!': 'Critical!', '武器を入手!': 'Weapon obtained!', '星牙使い 撃破': 'Wielder Defeated', '倒されました! 8秒後に本拠から復帰します。': 'You were defeated! Respawning at HQ in 8 seconds.',
  '力尽きた…': 'Fallen…', '敵将軍 撃破': 'General Defeated', '敵将 撃破': 'Officer Defeated', '特命達成': 'Mission Complete', '無念…ここは退く!': 'Curses... I must retreat!', '見切り!': 'Perfect Dodge!', 'まだだ…まだ終わらぬ!': 'Not yet... it\'s not over yet!',
  '激昂': 'Enraged', '特命失敗…': 'Mission Failed…', '猛将': 'Fierce General', '強敵が現れました!': 'A powerful enemy appeared!', '強敵襲来': 'Strong Foe Approaches', '引き分け': 'Draw', '紅軍の勝利': 'Crimson Wins', '勝利': 'Victory', '敗北': 'Defeat',
  '限界まで戦え': 'Fight to your limit', '敵将軍を倒せ': 'Defeat the enemy general', '待たせたな、戦線に復帰する!': 'Sorry to keep you waiting—I\'m back in the fight!', '待たせた、戦線に戻る!': 'I\'m back on the front!',
  'よくぞここまで来た。だが、ここが貴様の墓場だ。': 'You\'ve done well to come this far. But this is where you\'ll be buried.', 'ホストとの接続が切れました': 'Lost connection to the host', '蒼軍が本拠を制圧': 'Azure captured the HQ', '紅軍が本拠を制圧': 'Crimson captured the HQ',
  'ぬうう…小癪な! 本気で叩き潰してくれるわ!': 'Grr... insolent! I\'ll crush you for real!', 'ククク…ここからが蠍の毒の回りどころよ。': 'Heh heh... now the scorpion\'s venom starts to spread.', '血の匂いだ…狼は手負いの時こそ牙を剥く!': 'The smell of blood... a wolf bares its fangs most when wounded!',
  '燃えろ! すべて灰になれ!': 'Burn! Let everything turn to ash!', '見事だ。ならば覇星の真の力、その身に刻め。': 'Splendid. Then etch the true power of the Tyrant Star into your body.',
  '覚醒終了': 'Awakening ended', '不屈! 体力が回復した': 'Indomitable! HP restored', '戦いの開始に失敗しました': 'Failed to start the battle', '案内': 'Guide',
  'スマホを横向きにすると、広い画面で戦えます': 'Turn your phone sideways for a wider view', '画面の左側をドラッグで移動、「攻撃」は押しっぱなしで連続攻撃': 'Drag on the left side to move; hold "Attack" for combos',
  '攻撃の途中で「チャージ」を押すと、強力な派生技が出ます': 'Press "Charge" mid-combo for a powerful follow-up', 'ゲージが満タンになったら「奥義」で周りの敵を一掃!': 'When the gauge is full, use "Special" to wipe out nearby foes!', '敵の攻撃は「回避」で。当たる直前ならば「見切り」が発動': 'Use "Dodge" against attacks. Right before impact, it becomes a Perfect Dodge',
  'WASDで移動、J(押しっぱなし)で連続攻撃': 'WASD to move, hold J for combos', '攻撃の途中でKを押すと、強力な派生技が出ます': 'Press K mid-combo for a powerful follow-up', 'ゲージが満タンになったら I で奥義、U で覚醒!': 'At full gauge, press I for Special and U to Awaken!', 'Space で回避。当たる直前ならば「見切り」が発動': 'Space to dodge. Right before impact, it becomes a Perfect Dodge',
  'クラウドの最新データを読み込みました': 'Loaded the latest cloud data', '引き継ぎコードを入力してください': 'Please enter a transfer code', 'クラウドから読み込み中…': 'Loading from cloud…', 'データが見つかりませんでした': 'No data found', 'データを復元しました': 'Data restored',
  '保存中…': 'Saving…', '通信エラー(端末内には保存済み)': 'Connection error (saved on this device)', '名もなき星牙使い': 'Nameless Wielder',
  // ロード画面のヒント
  '通常攻撃の途中でチャージ攻撃を押すと、段数に応じた強力な技に派生します。': 'Press Charge during a combo to branch into a powerful move based on the combo step.',
  '敵将の武器が赤く光ったら強攻撃の合図。回避でかわそう。': 'When an officer\'s weapon glows red, a heavy attack is coming. Dodge it!',
  '攻撃が当たる直前に回避すると「見切り」が発動し、奥義ゲージが大きく溜まります。': 'Dodging right before a hit triggers a Perfect Dodge and greatly fills your Special gauge.',
  '敵拠点は兵を倒し続けると守備隊長が出現。守備隊長を倒せば制圧できます。': 'Keep defeating soldiers at an enemy outpost and its captain appears. Defeat the captain to capture it.',
  '拠点を制圧すると体力が回復し、味方の士気が上がります。': 'Capturing an outpost restores HP and boosts allied morale.',
  '覚醒中は攻撃力・攻撃速度が上がり、怯まなくなります。覚醒中の奥義は「真・奥義」に強化。': 'While Awakened, ATK and attack speed rise and you won\'t flinch. Specials become True Specials.',
  '武器には特性が付きます。強化で攻撃力を上げ、自分好みの一振りを探しましょう。': 'Weapons come with traits. Upgrade their ATK and find the blade that suits you.',
  '高難易度ほど良い武器が手に入りやすくなります。': 'Higher difficulties make better weapons more likely.', '攻撃ボタンは押しっぱなしでも連続攻撃できます。': 'You can hold the attack button for continuous attacks.',
  // 物語画面・オープニング
  'スキップ ▶▶': 'Skip ▶▶',
  '遥か昔——天より、六つの星が墜ちた。': 'Long ago—six stars fell from the heavens.',
  '星は大地に牙を立て、選ばれし者にその力を宿した。<br>人はそれを——<b>「星牙」</b>と呼ぶ。': 'The stars sank their fangs into the earth and granted their power to the chosen.<br>People call them—<b>"Star Fangs."</b>',
  'そして今——<b class="red">七つ目の星</b>を名乗る男が現れた。': 'And now—a man calling himself <b class="red">the seventh star</b> has appeared.',
  '「六つの星牙を喰らい、この空ごと大地を墜とす。<br>それが我が覇道だ」': '"I shall devour the six Star Fangs and bring this sky crashing down upon the earth.<br>That is my conquest."',
  '帝国の四将が、蒼星の国へと牙を剥く。': 'The Empire\'s four generals bare their fangs at the land of the Azure Star.',
  'だが——星は、まだ人を見捨ててはいなかった。': 'But—the stars had not yet abandoned humanity.',
  '星読みの軍師ミコトのもと、六人の星牙使いが立ち上がる。': 'Under the stargazing strategist Mikoto, six Star Fang wielders rise up.',
  '蒼き星の国を守る、六つの牙。<br>人は彼らを——<b>「蒼星のセイガ」</b>と呼ぶ。': 'Six fangs that guard the land of the Azure Star.<br>People call them—<b>"SEIGA."</b>',
  '<div class="op-logo">蒼星<small>の</small>セイガ</div><div class="op-logo-s">一騎当千の戦いが、いま始まる</div>': '<div class="op-logo">SEIGA</div><div class="op-logo-s">The battle of one against a thousand begins</div>',
  '炎': 'Fire', '氷': 'Ice', '雷': 'Thunder', '地': 'Earth', '風': 'Wind', '闇': 'Dark',
  '覇星帝ゼノヴァ': 'Tyrant Star Emperor Zenova',
});
const num = (s) => s;
addPats([
  [/^(.+?)　(.+)$/, (_, a, b) => T(a) + '  ' + T(b)],
  // ランクと強化
  [/^攻撃\+(\d+)$/, (_, n) => 'ATK +' + n],
  [/^防御\+(\d+)$/, (_, n) => 'DEF +' + n],
  [/^得意: (.+)$/, (_, w) => 'Best with: ' + T(w)],
  [/^条件: (.+)$/, (_, w) => 'Requires: ' + T(w)],
  [/^Lv(\d+)\(次まで (\d+)\)$/,(_, l, n) => 'Lv' + l + ' (next: ' + n + ')'],
  [/^ランク(\d)$/, (_, n) => `Rank ${n}`],
  [/^第(\d+)波$/, (_, n) => `Wave ${n}`],
  [/^第(\d+)波 — 生き残れ$/, (_, n) => `Wave ${n} — Survive`],
  [/^(\d+)次職$/, (_, n) => `Tier ${n}`],
  [/^(\d+)次職 (.*)$/, (_, n, r) => `Tier ${n} ${T(r)}`],
  [/^(\d+)日目$/, (_, n) => `Day ${n}`],
  [/^推奨Lv (\d+)$/, (_, n) => `Rec. Lv ${n}`],
  [/^推奨Lv\s*$/, () => 'Rec. Lv '],
  [/^\(選択中の星牙使い Lv(\d+)\) \/ 難易度\s*$/, (_, n) => `(selected wielder Lv${n}) / Difficulty `],
  [/^— 報酬 ×([\d.]+)$/, (_, n) => `— Rewards ×${n}`],
  [/^最高評価 (\S+) \/ 最多撃破 (\d+)人 \/ 最速 (.+)$/, (_, r, k, t) => `Best rank ${r} / Most KOs ${k} / Fastest ${t}`],
  [/^目標: 敵拠点を(\d+)つ制圧して結界を解き、敵将軍を倒せ。$/, (_, n) => `Goal: capture ${n} enemy outposts to break the barrier, then defeat the enemy general.`],
  [/^敵拠点を制圧し結界を解け\((\d+)\/(\d+)\)$/, (_, a, b) => `Capture outposts to break the barrier (${a}/${b})`],
  [/^敵将軍「(.+)」を倒せ$/, (_, n) => `Defeat the enemy general ${T(n)}`],
  [/^蒼軍 (\d+) − (\d+) 紅軍 ／ 残り (.+) ／ 倒して得点を稼げ$/, (_, a, b, t) => `Azure ${a} − ${b} Crimson / ${t} left / Score by defeating foes`],
  [/^(.+)の守備隊長が出てきました! 倒せば制圧です!$/, (_, n) => `The captain of ${T(n)} has appeared! Defeat them to capture it!`],
  [/^(.+)の守備隊長が最後の守りについています!$/, (_, n) => `The captain of ${T(n)} is making a last stand!`],
  [/^(.+)が敵の攻撃を受けています!$/, (_, n) => `${T(n)} is under attack!`],
  [/^(.+)さんとの通信が途絶えました。$/, (_, n) => `Lost connection with ${n}.`],
  [/^(.+)さんが倒れました! 10秒後に本拠から復帰します。$/, (_, n) => `${n} went down! Respawning at HQ in 10 seconds.`],
  [/^味方が敵将(.+)を撃破しました!$/, (_, n) => `An ally defeated officer ${T(n)}!`],
  [/^真・奥義——(.+)!$/, (_, n) => `True Special — ${T(n)}!`],
  [/^奥義——(.+)!$/, (_, n) => `Special — ${T(n)}!`],
  [/^(.+) の攻撃が激しくなった$/, (_, n) => `${T(n)}'s attacks grow fiercer`],
  [/^(.+) — 守備隊長出現!$/, (_, n) => `${T(n)} — Captain appeared!`],
  [/^(.+)\(結界\)$/, (_, n) => `${T(n)} (barrier)`],
  [/^特命: (.+)\(残り(\d+)秒\)$/, (_, m, s) => `Mission: ${T(m)} (${s}s left)`],
  [/^特命: (.+)$/, (_, m) => `Mission: ${T(m)}`],
  [/^ログインボーナス (\d+)日目 \+([\d,]+)金$/, (_, d, g) => `Login bonus Day ${d}: +${g} G`],
  [/^\+([\d,]+)金$/, (_, g) => `+${g} G`],
  [/^([\d,]+)金$/, (_, g) => `${g} G`],
  [/^今日の目標 $/, () => 'Daily Goals '],
  [/^敵を([\d,]+)人倒す$/, (_, n) => `Defeat ${n} enemies`],
  [/^合戦に(\d+)回勝つ$/, (_, n) => `Win ${n} battle${n > 1 ? 's' : ''}`],
  [/^(\d+)連撃を出す$/, (_, n) => `Reach a ${n}-hit combo`],
  [/^敵将を(\d+)人倒す$/, (_, n) => `Defeat ${n} officers`],
  [/^見切りを(\d+)回決める$/, (_, n) => `Land ${n} Perfect Dodges`],
  [/^星海の試練で第(\d+)波に到達$/, (_, n) => `Reach wave ${n} in the Trial of the Star Sea`],
  [/^3つすべて達成で、さらに \+(\d+)金$/, (_, g) => `Complete all 3 for an extra +${g} G`],
  [/^今週の撃破数$/, () => 'KOs this week'],
  [/^人 ／ 集計終了まで(.+)\(毎週月曜0時にリセット\)$/, (_, t) => ` / ${T(t)} left (resets every Monday 0:00 JST)`],
  [/^あと(\d+)日$/, (_, n) => `${n} day${n > 1 ? 's' : ''}`],
  [/^あと(\d+)時間$/, (_, n) => `${n} hour${n > 1 ? 's' : ''}`],
  [/^今週\(月曜0時〜\)の合計撃破数で競います。集計終了まで(.+)。$/, (_, t) => `Compete on total KOs this week (from Monday 0:00 JST). Ends in ${T(t)}.`],
  [/^今日の目標達成: (.+) \(\+(\d+)金\)$/, (_, t, g) => `Daily goal complete: ${T(t)} (+${g} G)`],
  [/^称号獲得: (.+?)( \(\+(\d+)金\))?$/, (_, n, _2, g) => `Title earned: ${T(n)}${g ? ` (+${g} G)` : ''}`],
  [/^新たな星牙使い「(.+)」が参戦!$/, (_, n) => `New wielder ${T(n)} joins!`],
  [/^星の記憶「(.+)」の力が使えるようになった!$/, (_, n) => `The Star Memory of ${T(n)} can now be used!`],
  [/^熟練度アップ: (.+)$/, (_, s) => `Mastery up: ${s.split(' / ').map((x) => T(x)).join(' / ')}`],
  [/^職業「(.+)」 Lv(\d+)(\(最大\))?$/, (_, n, l, m) => `Class ${T(n)} Lv${l}${m ? ' (max)' : ''}`],
  [/^(.+)の鎧の熟練 Lv(\d+)(\(最大\))?$/, (_, n, l, m) => `${T(n)} armor mastery Lv${l}${m ? ' (max)' : ''}`],
  [/^(.+)の熟練 Lv(\d+)(\(最大\))?$/, (_, n, l, m) => `${T(n)} mastery Lv${l}${m ? ' (max)' : ''}`],
  [/^Lv(\d+)\(最大\)$/, (_, l) => `Lv${l} (max)`],
  [/^攻\+(\d+)$/, (_, n) => `ATK +${n}`],
  [/^防\+(\d+)$/, (_, n) => `DEF +${n}`],
  [/^\(攻撃\+(\d+)\)$/, (_, n) => `(ATK +${n})`],
  [/^通常攻撃 (\d+)段 \/ チャージ技 (\d+)種(.*)$/, (_, a, b, r) => `Normal combo ${a} hits / ${b} charge moves${T(r)}`],
  [/^(.+)属性 — (.+)$/, (_, e, d) => `${T(e)} element — ${T(d)}`],
  [/^強化 (.+)$/, (_, r) => `Upgrade ${T(r)}`],
  [/^売却 \+(\d+)$/, (_, n) => `Sell +${n}`],
  [/^売却(.*)$/, (_, r) => `Sell${T(r)}`],
  [/^合成(.*)$/, (_, r) => `Fusion${T(r)}`],
  [/^合成: (.+)$/, (_, r) => `Fusion: ${T(r)}`],
  [/^武器錬成 (\d+)金$/, (_, n) => `Weapon Forge ${n} G`],
  [/^特性(\d+)$/, (_, n) => `Traits ${n}`],
  [/^攻撃(.)(\d+)% 特性(.)(\d+)%$/, (_, s1, a, s2, b) => `ATK ${s1}${a}% Traits ${s2}${b}%`],
  [/^適性(.)(.+?)( 防御(.+))?$/, (_, m, n, _3, d) => `Aptitude ${m} ${T(n)}${d ? ` DEF ${d}` : ''}`],
  [/^(.+)が持つと$/, (_, n) => `When ${T(n)} wields it`],
  [/^(.+)の防御$/, (_, n) => `${T(n)}'s DEF`],
  [/^うち防具$/, () => 'From armor'],
  [/^いまの(.+)$/, (_, n) => `${T(n)} now`],
  [/^(.+)のいまの職業: (.+) (Lv.+)$/, (_, h, j, l) => `${T(h)}'s current class: ${T(j)} ${T(l)}`],
  [/^◎得意 ○扱える △不慣れ ×苦手\(職業「(.+)」\) ●=装備中の種類\((.+) (\d+)本 \/ 全武器 (\d+)\/150\)$/, (_, j, t, n, a) => `◎ Expert ○ Capable △ Unskilled × Inept (class: ${T(j)}) ● = equipped type (${T(t)} ${n} / all weapons ${a}/150)`],
  [/^(.+) (\d+)個\(全防具 (\d+)\/120\)$/, (_, s, n, a) => `${T(s)} ${n} pcs (all armor ${a}/120)`],
  [/^友だちと最大(\d+)人で共闘 ／ 最大4対4で対戦$/, (_, n) => `Team up with up to ${n} friends / Versus up to 4v4`],
  [/^ランダム対戦の相手を待っています\((\d+)\/8人\)…\s*$/, (_, n) => `Waiting for random match players (${n}/8)… `],
  [/^秒後に出撃します\(空きはCPU\)$/, () => 's until sortie (empty slots are CPU)'],
  [/^仲間にこの番号か、下の招待URLを送ってください。参加を待っています…$/, () => 'Send this code or the invite URL below to your friends. Waiting for players…'],
  [/^ ／ あと(\d+)人参加できます$/, (_, n) => ` / ${n} more can join`],
  [/^(対戦|協力)の部屋\((\d+)\/(\d+)\)(.*)$/, (_, k, a, b, r) => `${k === '対戦' ? 'Versus' : 'Co-op'} room (${a}/${b})${r ? ' / Destroy the HQ or win on points after 5 minutes' : ''}`],
  [/^章と難易度\(部屋を作った人が決めます\)$/, () => 'Chapter & difficulty (host decides)'],
  [/^成功率 (.+)$/, (_, r) => `Success rate ${r}`],
  [/^失敗した時: 合成値 −1\((.+)\)または\s*$/, (_, r) => `On failure: fusion value −1 (${r}) or `],
  [/^武器が消失\((.+)\)$/, (_, r) => `weapon destroyed (${r})`],
  [/^「(.+)」で合成しますか\?$/, (_, n) => `Fuse with "${T(n)}"?`],
  [/^(\d+)人$/, (_, n) => `${n}`],
  [/^最高 (\d+)人撃破$/, (_, n) => `Best: ${n} KOs`],
  [/^音楽:魔王魂\(CC BY 4\.0\)「ネオロック82」ほか ／ ver (.+)$/, (_, v) => `Music: Maoudamashii (CC BY 4.0) "Neo Rock 82" and more / ver ${v}`],
  [/^『蒼星のセイガ』で一緒に(戦|対戦)おう! 部屋番号 (\w+)$/, (_, k, c) => `Join me in SEIGA${k === '対戦' ? ' for a versus match' : ''}! Room code ${c}`],
  [/^保存済み (.+)$/, (_, t) => `Saved ${t}`],
  [/^保存失敗: (.*)$/, (_, e) => `Save failed: ${e}`],
  [/^起動に失敗しました: (.*)$/, (_, e) => `Failed to start: ${e}`],
  [/^キャラクターを読み込み中… (\d+)%$/, (_, p) => `Loading character… ${p}%`],
  [/^町にいる人: (\d+)人$/, (_, n) => `In town: ${n}`],
  [/^買う ([\d,]+)金$/, (_, g) => `Buy ${g} G`],
  [/^難易度 (.+)$/,(_, d) => `Difficulty ${T(d)}`],
  [/^「(.+)」に「(.+)」を合成します。$/, (_, a, b) => `Fuse "${T(b)}" into "${T(a)}".`],
  [/^費用 ([\d,]+)金 ／\s*$/, (_, c) => `Cost ${c} G / `],
  [/^(.+)は「(.+)」に転職しました$/, (_, h, j) => `${T(h)} changed class to ${T(j)}`],
  [/^(ランク\d) (.+) を錬成した!$/, (_, r, w) => `Forged ${T(r)} ${T(w)}!`],
  [/^(\d+)本を売却\(\+([\d,]+)金\)$/, (_, n, g) => `Sold ${n} weapons (+${g} G)`],
  [/^(.+) に鍛え上げた!$/, (_, w) => `Upgraded to ${T(w)}!`],
  [/^合成に失敗… (.+)$/, (_, w) => `Fusion failed… ${T(w)}`],
  [/^合成成功! (.+?)( ／ 特性「(.+)」を継承)?$/, (_, w, _2, t) => `Fusion succeeded! ${T(w)}${t ? ` / inherited trait ${T(t)}` : ''}`],
  [/^金が足りません\(([\d,]+)金\)$/, (_, c) => `Not enough gold (${c} G)`],
  [/^(.+)の(.+)$/, (_, a, b) => `${T(a)} ${T(b)}`],
]);
void num;
