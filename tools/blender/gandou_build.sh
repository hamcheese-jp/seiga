#!/bin/sh
# ガンドウの体を作り直して、ゲーム用(軽量)と立ち絵用(高画質)の VRM と鎧を作る
#   sh tools/blender/gandou_build.sh vrm/gandou.src.orig.vrm [頭の倍率=1.18] [筋肉の倍率=1.8]   (元の VRoid 書き出しは vrm/gandou.src.orig.vrm に残してある。git には入れない)
set -e
B="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.3/blender.exe}"
SRC="$1"; HK="${2:-1.18}"; MK="${3:-1.8}"
TMP=$(mktemp -d)
"$B" -b --python tools/blender/gandou_body.py -- "$(cygpath -w "$SRC")" "$(cygpath -w "$TMP/new.vrm")" "$HK" "$MK" > "$TMP/log.txt" 2>&1 || { tail -20 "$TMP/log.txt"; exit 1; }
grep -E "SPIKES|EXPORT" "$TMP/log.txt"
cp "$TMP/new.vrm" vrm/gandou.orig.vrm          # 立ち絵用(高画質)
cp "$TMP/new.vrm" vrm/gandou.vrm
node tools/vrm-optimize.mjs vrm/gandou.vrm | tail -1   # ゲーム用(軽量)
cp "$TMP/new.vrm" vrm/gandou.orig.vrm
"$B" -b --python tools/blender/vroid_armor.py -- gandou > "$TMP/armor.txt" 2>&1; grep -c SAVED "$TMP/armor.txt"
