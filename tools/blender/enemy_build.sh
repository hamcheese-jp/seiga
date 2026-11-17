#!/bin/sh
# 敵キャラの体を作り直して、ゲーム用(軽量)と立ち絵用(高画質)の VRM と鎧を作る
#   sh tools/blender/enemy_build.sh boss1 barga
#   元の VRoid 書き出しは vrm/<キー>.src.orig.vrm に残す(無ければ今の <キー>.orig.vrm を写す。git には入れない)
set -e
B="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.3/blender.exe}"
K="$1"; PRESET="$2"
[ -f "vrm/$K.src.orig.vrm" ] || cp "vrm/$K.orig.vrm" "vrm/$K.src.orig.vrm"
TMP=$(mktemp -d)
"$B" -b --python tools/blender/enemy_body.py -- "$(cygpath -w "vrm/$K.src.orig.vrm")" "$(cygpath -w "$TMP/new.vrm")" "$PRESET" > "$TMP/log.txt" 2>&1 || { tail -20 "$TMP/log.txt"; exit 1; }
grep -E "BEARD|EXPORT" "$TMP/log.txt"
cp "$TMP/new.vrm" "vrm/$K.vrm"
node tools/vrm-optimize.mjs "vrm/$K.vrm" | tail -1     # ゲーム用(軽量)。元ファイルは vrm/<キー>.orig.vrm に置かれる
cp "$TMP/new.vrm" "vrm/$K.orig.vrm"                     # 立ち絵用(高画質)
"$B" -b --python tools/blender/vroid_armor.py -- "$K" > "$TMP/armor.txt" 2>&1; grep -c SAVED "$TMP/armor.txt"
