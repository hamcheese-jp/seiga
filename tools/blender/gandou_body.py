# ガンドウの体を作り直す: 頭を大きく、筋骨隆々に、ツンツン頭を作り込む(VRMの形そのものを変える)
#   blender -b --python tools/blender/gandou_body.py -- 入力.vrm 出力.vrm [頭の倍率] [筋肉の倍率]
# 骨の名前と構成(VRM humanoid)はそのまま。髪の毛束は頭の骨に付けるので、動きにそのまま付いてくる
import bpy, bmesh, sys, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0], args[1]
HEAD_K = float(args[2]) if len(args) > 2 else 1.18
MUSCLE_K = float(args[3]) if len(args) > 3 else 1.0

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.vrm(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
J = lambda n, s=None: f'J_Bip_{s.upper()}_{n}' if s else f'J_Bip_C_{n}'
bones = arm.data.bones
head_bone = bones[J('Head')]
H = arm.matrix_world @ head_bone.head_local                       # 頭の付け根(首との境)
under_head = {b.name for b in bones if b == head_bone or head_bone in b.parent_recursive}
print('HEAD', H, len(under_head))

def bone_seg(name):
    b = bones[name]; return arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local

# 筋肉: [骨, 盛る量(m), 前だけ盛るか, 盛る範囲(骨の付け根→先の割合)]
MUSCLES = [
    (J('UpperArm', 'l'), 0.022, None, (0.1, 0.95)), (J('UpperArm', 'r'), 0.022, None, (0.1, 0.95)),   # 二の腕(力こぶ)
    (J('LowerArm', 'l'), 0.014, None, (0.0, 0.7)), (J('LowerArm', 'r'), 0.014, None, (0.0, 0.7)),      # 前腕
    (J('Shoulder', 'l'), 0.02, None, (0.3, 1.2)), (J('Shoulder', 'r'), 0.02, None, (0.3, 1.2)),        # 肩(三角筋)
    (J('UpperChest'), 0.03, 'front', (-0.3, 1.0)),                                                      # 胸板
    (J('Chest'), 0.018, 'front', (0.0, 1.0)),                                                           # 腹筋
    (J('UpperChest'), 0.02, 'back', (-0.2, 1.0)),                                                       # 背中(広背筋)
    (J('Neck'), 0.016, None, (-0.3, 0.6)),                                                              # 首(僧帽筋)
    (J('UpperLeg', 'l'), 0.022, None, (0.05, 0.9)), (J('UpperLeg', 'r'), 0.022, None, (0.05, 0.9)),    # 太もも
    (J('LowerLeg', 'l'), 0.015, 'back', (0.05, 0.6)), (J('LowerLeg', 'r'), 0.015, 'back', (0.05, 0.6)),  # ふくらはぎ
]

def edit_mesh(ob):
    me = ob.data
    if me.shape_keys:                                                 # 表情(シェイプキー)も同じだけ動かす
        keys = list(me.shape_keys.key_blocks)
    else:
        keys = None
    gi = {g.index: g.name for g in ob.vertex_groups}
    me.calc_normals_split() if hasattr(me, 'calc_normals_split') else None
    nrm = [v.normal.copy() for v in me.vertices]
    mw = ob.matrix_world; mwi = mw.inverted(); n3 = mw.to_3x3()
    segs = {b: bone_seg(b) for b, *_ in MUSCLES}
    deltas = []
    for v in me.vertices:
        wts = {gi[g.group]: g.weight for g in v.groups if g.group in gi and g.weight > 0}
        tot = sum(wts.values()) or 1.0
        p = mw @ v.co
        # 頭: 頭の骨にかかる重みのぶんだけ、首の付け根を中心に拡大(首は徐々に)
        wh = sum(w for n, w in wts.items() if n in under_head) / tot
        d = (p - H) * ((HEAD_K - 1) * wh)
        # 筋肉: 法線方向へ、骨の途中ほど大きく盛る
        n = (n3 @ nrm[v.index]).normalized()
        for b, amp, side, (t0, t1) in MUSCLES:
            w = wts.get(b, 0) / tot
            if w <= 0: continue
            a, c = segs[b]; ax = c - a; L2 = ax.length_squared or 1e-6
            t = (p - a).dot(ax) / L2; u = (t - t0) / max(1e-3, t1 - t0)
            if u <= 0 or u >= 1: continue
            prof = math.sin(math.pi * u) ** 0.8
            # 押し出す向きは骨の軸から外向き(肌と服が同じ向きに動くので、すき間が開かない)
            rad = p - (a + ax * max(0.0, min(1.0, t))); rad = rad.normalized() if rad.length > 1e-5 else n
            if side == 'front': prof *= max(0.0, -rad.y) ** 0.7        # Blender では -Y が正面
            elif side == 'back': prof *= max(0.0, rad.y) ** 0.7
            d += rad * (amp * MUSCLE_K * prof * w)
        deltas.append(mwi.to_3x3() @ d)
    if keys:
        for kb in keys:
            for i, dl in enumerate(deltas): kb.data[i].co = kb.data[i].co + dl
    for i, dl in enumerate(deltas): me.vertices[i].co = me.vertices[i].co + dl
    me.update()

for ob in meshes: edit_mesh(ob)

# 骨: 頭より下流(目・髪の揺れ骨)を同じ倍率で拡大した位置へ移す
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
Hl = arm.matrix_world.inverted() @ H
for eb in arm.data.edit_bones:
    if eb.name in under_head:
        eb.head = Hl + (eb.head - Hl) * HEAD_K
        eb.tail = Hl + (eb.tail - Hl) * HEAD_K
bpy.ops.object.mode_set(mode='OBJECT')

# ツンツン頭: 頭頂から横・後ろまで、太い毛束を後ろ上へ逆立てる(髪の材質を使い、頭の骨に付ける)
from mathutils import kdtree
hair = max((o for o in meshes if any('HAIR' in m.name for m in o.data.materials)), key=lambda o: len(o.data.vertices))
hmat = next(m for m in hair.data.materials if 'HAIR' in m.name)
hw = hair.matrix_world; hv = [hw @ v.co for v in hair.data.vertices]
huv = [None] * len(hv); uvl = hair.data.uv_layers.active.data
for poly in hair.data.polygons:
    for li in poly.loop_indices:
        vi = hair.data.loops[li].vertex_index
        if huv[vi] is None: huv[vi] = tuple(uvl[li].uv)
# 毛束の色: 髪のテクスチャのうち一番暗い所(地毛の色)を使う
import numpy as np
img = next((nd.image for nd in hmat.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image), None)
dark_uv = (0.5, 0.5)
if img:
    W_, H_ = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(H_, W_, -1)
    lum = []
    for u in huv:
        if u is None: continue
        x = int((u[0] % 1) * (W_ - 1)); y = int((u[1] % 1) * (H_ - 1)); c = px[y, x]
        lum.append((float(c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) if c[3] > 0.5 else 9.0, u))
    lum.sort(); dark_uv = lum[len(lum) // 20][1]
print('DARK_UV', dark_uv)
kd = kdtree.KDTree(len(hv))
for i, p in enumerate(hv): kd.insert(p, i)
kd.balance()
xs = [p.x for p in hv]; zs = [p.z for p in hv]; ys = [p.y for p in hv]
top = max(zs); r = (max(xs) - min(xs)) * 0.34
C = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2 + r * 0.15, top - r * 1.05))   # 頭の丸みの中心(少し後ろ)
bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
n = 0
for el, cnt, ln, wd in ((80, 4, 1.0, 0.46), (62, 7, 1.0, 0.44), (44, 9, 0.92, 0.42), (26, 10, 0.8, 0.4), (8, 9, 0.64, 0.36), (-10, 7, 0.5, 0.32)):
    for i in range(cnt):
        az = math.tau * i / cnt + el * 0.07
        if el < 60 and math.cos(az) > 0.2: continue                        # 額より下の前側には生やさない(顔を隠さない)
        e = math.radians(el)
        d = Vector((math.sin(az) * math.cos(e), -math.cos(az) * math.cos(e), math.sin(e)))   # -Y が前
        out = (d * 1.0 + Vector((0, 0.55, 0.55))).normalized()                              # 後ろ上へ流す
        base = C + d * r * 0.86
        L = r * ln * (0.8 + ((n * 37) % 10) / 22) * 1.3; n += 1
        tip = base + out * L
        side = out.cross(Vector((0, 0, 1)))
        side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
        up2 = side.cross(out).normalized()
        col_uv = dark_uv
        ring = [bm.verts.new(base + (side * math.cos(a) + up2 * math.sin(a) * 0.5) * r * wd) for a in (0, math.tau / 3, 2 * math.tau / 3)]
        t = bm.verts.new(tip)
        for k in range(3):
            f = bm.faces.new([ring[k], ring[(k + 1) % 3], t]); f.smooth = True
            for l in f.loops: l[uv].uv = col_uv
        f = bm.faces.new(ring[::-1])
        for l in f.loops: l[uv].uv = col_uv
bm.normal_update()
me = bpy.data.meshes.new('spikes'); bm.to_mesh(me); bm.free()
sp = bpy.data.objects.new('spikes', me); hair.users_collection[0].objects.link(sp)
# 毛束は髪の材質の複製(名前に spike)。細い毛束は全体がふちとして光るので、ふちの光とつやを切る
smat = hmat.copy(); smat.name = hmat.name.replace('HAIR', 'HAIR_spike')
try:
    mt = smat.vrm_addon_extension.mtoon1.extensions.vrmc_materials_mtoon
    mt.parametric_rim_color_factor = (0.0, 0.0, 0.0); mt.matcap_factor = (0.0, 0.0, 0.0); mt.rim_lighting_mix_factor = 0.0
except Exception as e: print('MTOON', e)
me.materials.append(smat)
sp.vertex_groups.new(name=J('Head')).add(list(range(len(me.vertices))), 1.0, 'REPLACE')
sp.parent = arm; md = sp.modifiers.new('Armature', 'ARMATURE'); md.object = arm
# 髪のオブジェクトにまとめる(描画回数を増やさない)
sp.matrix_world = hair.matrix_world.copy() @ hair.matrix_world.inverted() @ sp.matrix_world
with bpy.context.temp_override(object=hair, active_object=hair, selected_objects=[hair, sp], selected_editable_objects=[hair, sp]):
    bpy.ops.object.join()
print('SPIKES', n)

for o in bpy.data.objects: o.select_set(False)
r = bpy.ops.export_scene.vrm(filepath=OUT, armature_object_name=arm.name, ignore_warning=True)
print('EXPORT', r)
