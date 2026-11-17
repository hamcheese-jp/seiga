# 武将(VRoid のまま使う味方)に袴と広袖を着せた VRM を作る
#   blender -b --python tools/blender/hero_outfit.py -- 入力.vrm 出力.vrm キャラ
import bpy, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from outfit import add_outfit

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, HERO = args[0], args[1], args[2]
# 袴の色・袖の色・裾のふくらみ・袖のゆとり(各キャラの衣装の色に合わせる)
COLORS = {
    'raika':   dict(hakama=(0.05, 0.045, 0.1), sleeve=(0.07, 0.065, 0.12), hem=0.07),
    'gandou':  dict(hakama=(0.16, 0.12, 0.08), sleeve=(0.2, 0.15, 0.1), hem=0.12, sode=0.04),

}
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.vrm(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
body = bpy.data.objects['Body']
add_outfit(arm, body, **COLORS.get(HERO, {}))
for o in bpy.data.objects: o.select_set(False)
print('EXPORT', bpy.ops.export_scene.vrm(filepath=OUT, armature_object_name=arm.name, ignore_warning=True))
