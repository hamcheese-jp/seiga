#!/bin/sh
# 武将(VRoid のまま使う味方)に袴と広袖を着せて、ゲーム用(軽量)と立ち絵用(高画質)の VRM と鎧を作る
#   sh tools/blender/hero_build.sh raika
#   元の VRoid 書き出しは vrm/<キー>.src.orig.vrm に残す(無ければ今の <キー>.orig.vrm を写す。git には入れない)
set -e
B="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.3/blender.exe}"
K="$1"
[ -f "vrm/$K.src.orig.vrm" ] || cp "vrm/$K.orig.vrm" "vrm/$K.src.orig.vrm"
TMP=$(mktemp -d)
"$B" -b --python tools/blender/hero_outfit.py -- "$(cygpath -w "vrm/$K.src.orig.vrm")" "$(cygpath -w "$TMP/new.vrm")" "$K" > "$TMP/log.txt" 2>&1 || { tail -20 "$TMP/log.txt"; exit 1; }
grep -E "OUTFIT|EXPORT" "$TMP/log.txt"
cp "$TMP/new.vrm" "vrm/$K.vrm"
node tools/vrm-optimize.mjs "vrm/$K.vrm" | tail -1
cp "$TMP/new.vrm" "vrm/$K.orig.vrm"
"$B" -b --python tools/blender/vroid_armor.py -- "$K" > "$TMP/armor.txt" 2>&1; grep -c SAVED "$TMP/armor.txt"
