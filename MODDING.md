# 星牙戦記 拡張ガイド — 武将・武器・ステージ・曲の増やし方

このゲームはデータ定義を書き足すだけで要素を増やせる構成になっています。
ファイルを編集したら、`sw.js` 先頭の `CACHE` の番号を上げてからGitHubへアップロードしてください。

---

## 1. キャラの見た目を差し替える(コード編集不要)

VRoid Studio で作ったモデルを `vrm/` フォルダに置くだけで、その武将の見た目が差し替わります。

| ファイル名 | 誰 |
|---|---|
| `vrm/reiga.vrm` など武将ID | 味方武将(下の表のID) |
| `vrm/enemyOfficer.vrm` | 一般の敵将(全員共通) |
| `vrm/boss1.vrm` 〜 `boss5.vrm` | 各章のボス |

- VRM 1.0 / 0.x どちらでも読み込めます。容量はテクスチャ1024px・ポリゴン削減がおすすめ(1体2〜8MB)
- ファイルが無いキャラは自動で手作りモデル表示になります(設定ファイルの編集は不要)

## 2. 新しい武将を追加する

### 手順A: 既存の技セットを使い回す(最短・データ1件)

[src/data.js](src/data.js) の `HEROES` 配列に1件追加します。

```js
{ id: 'homura', name: 'ホムラ', title: '紅蓮の剣鬼', wtype: 'sword', wname: '大太刀', elem: 'fire',
  ms: 'reiga',                       // ← 技セットをレイガから借りる(省略すると id と同名のセットを探す)
  desc: '説明文。',
  base: { hp: 1000, atk: 36, def: 26, spd: 7.8, aspd: 1.05 }, stars: [4, 3, 4, 2],
  look: { scale: 1.0, sw: 0.26, bulk: 1.0, hair: 'pony', gear: 'band', cape: 'scarf',
    pauldron: 1, tasset: 'plate', tails: 2,
    pal: { skin: '#f0c8a0', hair: '#1a1a2a', c1: '#d84a20', c2: '#2c2a3a', c3: '#f2c24a',
      metal: '#8c94a8', gold: '#e8b84e', eye: '#3a1208', cape: '#e85a2a' } } },
```

- `id` は半角英字。`vrm/<id>.vrm` を置けばVRoidキャラになります
- `wtype` は既存の6種(sword / spear / twin / hammer / fan / scythe)から選ぶと武器・錬成までそのまま動きます
- 最初から使えるようにするには `data.js` の `START_HEROES` に id を追加。章クリアで解放にする場合は `UNLOCKS` に `s2: 'homura'` のように追記
- `look` の主な値 — hair: spiky/pony/long/twin/bob/short/bald、gear: band/kabuto/horn/tiara/flower/mask/hood/crown/demon(空白区切りで複数可)、cape: long/short/scarf、tails: 腰の垂れ布の枚数(0〜5)

### 手順B: 専用の技セットも作る

[src/moves.js](src/moves.js) の最後に `MS.homura = { spName: '奥義名', n: [...6個], c: [...6個], sp: ... };` を追加します。
既存の武将のブロックを丸ごとコピーして数値をいじるのが簡単です。技は部品の組み合わせで書けます:

| 部品 | 動き | 主な引数 |
|---|---|---|
| `slash({from:[方位,仰角], to:[方位,仰角]})` | 斬撃 | r=半径, ang=角度, dmg, kb=吹き飛ばし, lift=打ち上げ |
| `thrust({len, w})` | 突き | elv=仰角, dmg, kb |
| `spin({turns})` | 回転斬り | r, n=ヒット数 |
| `smash({jump})` | 跳躍叩きつけ | r, fwd, lift |
| `dash({dist})` | 突進 | n=ヒット数 |
| `seq(a, b, …)` | 技の連結 | — |

`el: 1` を付けると属性(炎上・凍結など)が乗り、`fx: 'pillar'` などで演出が出ます。

## 3. 新しい武器種を追加する

4ファイルに1ブロックずつ追加します(既存の `sword` の行をコピーして改変)。

1. [src/models.js](src/models.js) `RESTS` — 構えの角度
2. [src/models.js](src/models.js) `buildWeapon()` — 見た目(box/cyl/cone などの組み合わせ)。`two: true` で両手持ち、`dual: true` で二刀流
3. [src/data.js](src/data.js) `WEAPON_NAMES` — レア度1〜6の武器名6個
4. [src/moves.js](src/moves.js) — その武器を使う武将の技セット

これだけで、ドロップ・錬成・鍛錬・売却・スプレッドシート保存まで自動で対応します。

## 4. 新しいステージを追加する

[src/data.js](src/data.js) の `STAGES` 配列に1件追加します。

- `nodes: [[x, z, 半径], …]` が広場、`links: [[a, b, 道幅], …]` がそれらを結ぶ道
- `bases` が拠点(`t: 0`=味方 / `1`=敵、`main: true`=本陣)
- `theme` は plains / desert / snow / volcano / castle の5種。新しい雰囲気は `THEMES` に追加(空・光・霧・地面色・天候・BGMを指定)
- 背景の植生は [src/nature.js](src/nature.js) の `NATURE_SETS` にテーマ名で追加

## 5. BGM・効果音を追加する

1. mp3 を `bgm/` に入れる(魔王魂ならループ版 `maou_loop_…` 推奨)
2. [src/audio.js](src/audio.js) の `BGM_FILES` で「場面名: ファイル名」を書き換える
3. 出典の表記が必要な曲は README のクレジットに追記

ファイルを置かない場面は、従来どおり自動作曲(`SONGS`)が流れます。

## 6. 雑兵のモデルを変える

雑兵は、動きを焼き付けた `assets/soldier.bin`(味方)/ `soldier2.bin`(敵)を数百体まとめて描画しています。

```bash
node tools/bake-soldier.mjs <キャラ.fbx> assets/soldier.bin
```

- Quaternius の Ultimate Animated Character Pack(CC0)の他キャラ(Knight_Male.fbx など)がそのまま使えます
- 必要な動き: Idle / Walk / Punch / RecieveHit / Defeat(同パックは全キャラ共通で入っています)
- 色は `tools/bake-soldier.mjs` 内の `PAL` で指定。`['#ffffff', 1]` にした部位が軍の色(青/赤)に染まります
- 実行には作業フォルダに `node_modules/three`(v0.170)が必要です: `npm i three@0.170.0`

## 7. 物語・オープニングを編集する

- 台詞は [src/story.js](src/story.js) の `STORY` に章ごと(`pre` = 出陣前 / `post` = 勝利後)に書きます
  - `{ c: 'mikoto', t: '台詞' }` … キャラの台詞(`f: 'b'` で表情差分)/ `c` を省くとナレーション
  - `{ c: '@', t: { reiga: '…', setsuna: '…' } }` … 選んだ武将ごとに台詞を書き分け
- 登場人物の名前・肩書き・色は `CAST`。オープニングの流れは `Story.opening()` の中にあります
- 立ち絵は `assets/portraits/<キャラ>.webp`(差分 `_b`、全身 `_full`)。VRMを差し替えたら撮り直します:

```bash
node tools/serve.mjs
```
→ http://localhost:5173/tools/portrait.html を開くと全員分を自動で撮影・保存(`?only=reiga` で1人だけ)。
キャラの表情・照明は `tools/portrait.html` の `LIST` で調整できます。ミコトの元モデルは `dev/mikoto.vrm`(VRoid: `mikoto.vroid`)。

## 8. その他

- **武器の特性**: `data.js` の `TRAITS` に追加(効果の実装は `calcStats` と `battle.js` を検索)
- **実績**: `data.js` の `ACHIEVEMENTS` に追加。`t: (S) => 条件` を書くだけ
- **難易度**: `data.js` の `DIFFS`
- **画質段階**: `src/gfx.js` の `QUALITY`

## 動作確認のしかた

```bash
node tools/serve.mjs
```

で http://localhost:5173 を開いてテストします。URLに `?vrmtest` を付けると、全キャラが開発用サンプルVRM(dev/sample.vrm)で表示されます。

## VRMを軽くする

VRoid から書き出したVRMは10〜20MBになりがちです。次のコマンドで大きいテクスチャを縮小できます(元ファイルは `.orig.vrm` として残ります)。

```bash
node tools/vrm-optimize.mjs vrm/reiga.vrm 1024
```
