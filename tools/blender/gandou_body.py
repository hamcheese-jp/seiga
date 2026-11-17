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

# 短いツンツン頭: 元の長い髪(Hair)は外し、頭の形に沿って刈り込んだ地毛をかぶせ、上と少し前へ立つ短い毛束を一面に生やす
#   横と後ろは短く(刈り上げ)、頭頂ほど長い。髪の材質の一番暗い色を使い、頭の骨に付ける
import random
import numpy as np
from mathutils.bvhtree import BVHTree
rng = random.Random(7)
hair = max((o for o in meshes if any('HAIR' in m.name for m in o.data.materials)), key=lambda o: len(o.data.vertices))
hmat = next(m for m in hair.data.materials if 'HAIR' in m.name)
hb_img = next((nd.image for nd in hmat.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image), None)
# 毛束の色: 髪のテクスチャのうち一番暗い所(地毛の色)
dark_uv = (0.5, 0.5)
if hb_img:
    W_, H_ = hb_img.size; px = np.array(hb_img.pixels[:], dtype=np.float32).reshape(H_, W_, -1)
    uvl = hair.data.uv_layers.active.data; lum = []
    for li in range(0, len(uvl), 7):
        u = uvl[li].uv; x = int((u[0] % 1) * (W_ - 1)); y = int((u[1] % 1) * (H_ - 1)); c = px[y, x]
        if c[3] > 0.5: lum.append((float(c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11), (u[0], u[1])))
    lum.sort(); dark_uv = lum[len(lum) // 25][1]
print('DARK_UV', dark_uv)
bpy.data.objects.remove(hair, do_unlink=True); meshes.remove(hair)

# 頭皮: 体と顔のうち頭の骨に付いた面で当たり判定を作る(拡大後の形)
verts, polys = [], []
for ob in meshes:
    me = ob.data; gi = {g.index: g.name for g in ob.vertex_groups}; mw = ob.matrix_world
    headv = [sum(g.weight for g in v.groups if gi.get(g.group) in under_head) > 0.5 for v in me.vertices]
    base = len(verts); verts += [mw @ v.co for v in me.vertices]
    polys += [[base + i for i in p.vertices] for p in me.polygons if all(headv[i] for i in p.vertices)]
bvh = BVHTree.FromPolygons(verts, polys)
hv = [verts[i] for p in polys for i in p]
xs = [p.x for p in hv]; ys = [p.y for p in hv]; zs = [p.z for p in hv]
top = max(zs); depth = max(ys) - min(ys)
C = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2 + depth * 0.06, top - depth * 0.5))   # 頭蓋の中心(少し後ろ)
R = depth * 0.5
print('HEAD', C, R, top)

def scalp(d):
    """中心から d の向きの頭皮の点と法線(外から内へ線を飛ばす)"""
    o = C + d * R * 2.5; hit = bvh.ray_cast(o, -d, R * 3)
    if hit[0] is None: return None, None
    n = hit[1] if hit[1].dot(d) > 0 else -hit[1]
    return hit[0], n.normalized()

def hairline(az):
    """生え際の高さ(中心からの仰角°)。az=0 が正面、±90 が横、180 が後ろ"""
    f = math.cos(math.radians(az))                                         # 1=正面, -1=後ろ
    s = abs(math.sin(math.radians(az)))
    if f >= 0: return 14 * f - 14 * s * (1 - f)                            # 額・こめかみ・耳の上
    return -14 * (1 + f) - 38 * (-f)                                      # 後ろは襟足まで下げる

def dir_of(az, el):
    a, e = math.radians(az), math.radians(el)
    return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))   # -Y が正面

bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
def face(vs):
    f = bm.faces.new(vs); f.smooth = True
    for l in f.loops: l[uv].uv = dark_uv
    return f

# 地毛(刈り込み): 頭皮から 6mm 浮かせた殻。生え際の所は頭皮に沿わせて薄くする
NA, NE = 72, 26
grid = {}
for i in range(NA):
    az = 360 * i / NA - 180
    hl = hairline(az)
    for j in range(NE + 1):
        el = hl + (90 - hl) * j / NE
        p, n = scalp(dir_of(az, el))
        if p is None: continue
        th = 0.004 + 0.004 * min(1, j / 3)
        grid[(i, j)] = bm.verts.new(p + n * th)
for i in range(NA):
    for j in range(NE):
        q = [grid.get(k) for k in ((i, j), ((i + 1) % NA, j), ((i + 1) % NA, j + 1), (i, j + 1))]
        if all(q) and len(set(q)) == 4: face(q)

# 毛束: 頭頂ほど長く、横・後ろは短い。根元は頭皮に沿い、先は上と少し前・外へ
n_sp = 0
UP = Vector((0, 0, 1)); FWD = Vector((0, -1, 0))
el_step = 5.0
el = -30.0
while el < 89:
    ring = max(1, int(round(360 * math.cos(math.radians(el)) / 11)))
    for k in range(ring):
        az = 360 * (k + rng.random() * 0.6) / ring - 180 + el * 1.7
        az = (az + 180) % 360 - 180
        hl = hairline(az); f = math.cos(math.radians(az))
        if el < hl + (1.5 if f > 0.5 else 4): continue                   # 額の生え際ぎりぎりからも生やす(一直線に見せない)
        d = dir_of(az, el); p, n = scalp(d)
        if p is None: continue
        h = (el - hl) / max(1, 90 - hl)        # h: 生え際0 → 頭頂1
        # 長さ: 横と後ろの下の方は短く刈り込み、頭頂・前の上ほど長い
        L = R * (0.16 + 0.36 * h ** 1.1) * (1.0 + 0.3 * max(0, f)) * (0.8 + 0.4 * rng.random())
        if h < 0.22 and f < 0.4: L *= 0.45                                  # 横・後ろの下は刈り込み
        # 向き: 法線と真上を混ぜ、前の方は少し前へ
        out = (n * (0.9 - 0.35 * h) + UP * (0.35 + 0.5 * h) + FWD * max(0, f) * (0.3 * (0.4 + h) + 0.55 * max(0, 1 - h * 3))).normalized()
        out = (out + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.2, 0.4))) * 0.16).normalized()
        wd = R * (0.13 + 0.07 * h) * (0.85 + 0.3 * rng.random())
        base = p - n * 0.004
        side = out.cross(n if abs(out.dot(n)) < 0.97 else FWD)
        side = side.normalized(); up2 = side.cross(out).normalized()
        ring4 = [bm.verts.new(base + (side * math.cos(t) + up2 * math.sin(t) * 0.55) * wd) for t in (0, math.pi / 2, math.pi, 3 * math.pi / 2)]
        tip = bm.verts.new(base + out * L)
        for q in range(4): face([ring4[q], ring4[(q + 1) % 4], tip])
        face(ring4[::-1]); n_sp += 1
    el += el_step
bm.normal_update()
me = bpy.data.meshes.new('hair_spikes'); bm.to_mesh(me); bm.free()
sp = bpy.data.objects.new('hair_spikes', me); bpy.context.scene.collection.objects.link(sp)
# 材質は髪の複製(名前に spike)。ふちの光とつやを切る
smat = hmat.copy(); smat.name = hmat.name.replace('HAIR', 'HAIR_spike')
try:
    mt = smat.vrm_addon_extension.mtoon1.extensions.vrmc_materials_mtoon
    mt.parametric_rim_color_factor = (0.0, 0.0, 0.0); mt.matcap_factor = (0.0, 0.0, 0.0); mt.rim_lighting_mix_factor = 0.0
except Exception as e: print('MTOON', e)
me.materials.append(smat)
sp.vertex_groups.new(name=J('Head')).add(list(range(len(me.vertices))), 1.0, 'REPLACE')
sp.parent = arm; md = sp.modifiers.new('Armature', 'ARMATURE'); md.object = arm
# 体のメッシュにまとめる(描画回数を増やさない)
body = next(o for o in meshes if o.name == 'Body')
with bpy.context.temp_override(object=body, active_object=body, selected_objects=[body, sp], selected_editable_objects=[body, sp]):
    bpy.ops.object.join()
print('SPIKES', n_sp)


for o in bpy.data.objects: o.select_set(False)
r = bpy.ops.export_scene.vrm(filepath=OUT, armature_object_name=arm.name, ignore_warning=True)
print('EXPORT', r)
