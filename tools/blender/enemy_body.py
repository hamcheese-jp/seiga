# 敵キャラの体と顔を作り変える: VRoid の少年顔から、敵らしい体型・顔・髪型へ(VRMの形そのものを変える)
#   blender -b --python tools/blender/enemy_body.py -- 入力.vrm 出力.vrm 設定名
# 骨の名前と構成(VRM humanoid)はそのまま。ひげ・眉・髷などの付け足しは頭の骨に付ける
import bpy, bmesh, sys, math, random
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, PRESET = args[0], args[1], args[2]
J = lambda n, s=None: f'J_Bip_{s.upper()}_{n}' if s else f'J_Bip_C_{n}'

# 設定: fat=[骨, 盛る量m, 向き(front/back/side/None), 範囲(骨の付け根→先の割合)]、skin=肌の色の掛け率、
#   scowl=眉・目の怒りを基本の顔に焼き込む量、beard/brows/hair=付け足す物
PRESETS = {
    # バルガ: 太った巨漢。腹が大きく前へせり出し、首も腕も脚も太い。赤黒い肌、太い眉と顔一面のひげ、刈り込んだ頭に髷
    'barga': dict(
        fat=[(J('Spine'), 0.15, 'front', (-0.8, 1.8)), (J('Hips'), 0.09, 'front', (-0.2, 1.4)), (J('Chest'), 0.08, 'front', (-0.3, 1.2)),
             (J('Spine'), 0.09, 'side', (-0.6, 1.6)), (J('Chest'), 0.05, 'side', (-0.3, 1.3)), (J('Hips'), 0.025, None, (-0.3, 1.3)), (J('Chest'), 0.04, None, (-0.2, 1.2)),
             (J('UpperChest'), 0.035, None, (-0.2, 1.0)), (J('UpperChest'), 0.03, 'back', (-0.2, 1.0)), (J('Neck'), 0.03, None, (-0.4, 0.8)),
             (J('Shoulder', 'l'), 0.03, None, (0.2, 1.2)), (J('Shoulder', 'r'), 0.03, None, (0.2, 1.2)),
             (J('UpperArm', 'l'), 0.035, None, (0.0, 1.0)), (J('UpperArm', 'r'), 0.035, None, (0.0, 1.0)),
             (J('LowerArm', 'l'), 0.022, None, (0.0, 0.85)), (J('LowerArm', 'r'), 0.022, None, (0.0, 0.85)),
             (J('UpperLeg', 'l'), 0.03, None, (0.05, 1.0)), (J('UpperLeg', 'r'), 0.03, None, (0.05, 1.0)),
             (J('LowerLeg', 'l'), 0.022, None, (0.0, 0.8)), (J('LowerLeg', 'r'), 0.022, None, (0.0, 0.8))],
        skin=(0.86, 0.7, 0.6), shade=(0.66, 0.46, 0.4), parts=(0.32, 0.26, 0.22), scowl=(0.9, 0.35),
        beard=dict(len=1.0, top=0.02, burn=0.03), legs=0.72, jowl=0.22, eyes=0.6, wrinkles=True,
        outfit=dict(hakama=(0.03, 0.022, 0.02), sleeve=(0.07, 0.015, 0.012), hem=0.075, sode=0.035), brows=dict(th=0.011), hair='topknot',
    ),
    # ザハル: 細身の暗殺者。頬のこけた鋭い顔、左目の古傷、口元を覆う布、剃った頭から垂れる蠍の尾の三つ編み
    'zahar': dict(
        fat=[], skin=(0.84, 0.66, 0.52), shade=(0.62, 0.44, 0.36), scowl=(1.0, 0.5), legs=1.06, jowl=-0.08, eyes=0.6,
        brows=dict(th=0.007), hair='shaved', hairtint=(0.18, 0.15, 0.14), parts=(0.1, 0.08, 0.07),
        mask=(0.3, 0.06, 0.05), scar=True, braid=dict(n=11, seg=0.05),
        outfit=dict(hakama=(0.09, 0.06, 0.035), sleeve=(0.05, 0.04, 0.032), hem=0.06, sode=0.025),
    ),
    # ヴォルグ: 北の大男。たくましい体、後ろへなびく白銀のたてがみと白いひげ、頬の青い戦化粧、狼の毛皮の襟巻き
    'volg': dict(
        fat=[(J('UpperChest'), 0.035, None, (-0.2, 1.0)), (J('Chest'), 0.02, 'front', (0.0, 1.0)), (J('Neck'), 0.022, None, (-0.3, 0.7)),
             (J('Shoulder', 'l'), 0.025, None, (0.2, 1.2)), (J('Shoulder', 'r'), 0.025, None, (0.2, 1.2)),
             (J('UpperArm', 'l'), 0.028, None, (0.05, 0.95)), (J('UpperArm', 'r'), 0.028, None, (0.05, 0.95)),
             (J('LowerArm', 'l'), 0.016, None, (0.0, 0.75)), (J('LowerArm', 'r'), 0.016, None, (0.0, 0.75)),
             (J('UpperLeg', 'l'), 0.022, None, (0.05, 0.9)), (J('UpperLeg', 'r'), 0.022, None, (0.05, 0.9))],
        skin=(0.95, 0.9, 0.92), shade=(0.7, 0.66, 0.74), scowl=(0.95, 0.45), jowl=0.06, eyes=0.62, legs=1.04,
        brows=dict(th=0.01), beard=dict(len=0.8, top=0.012, burn=0.035), wrinkles=True, hair='mane', mane=dict(len=1.0),
        parts=(0.82, 0.84, 0.9), parts_flat=True, hairtint=(0.7, 0.72, 0.78), paint=(0.15, 0.35, 0.95), fur=(0.34, 0.31, 0.29),
        outfit=dict(hakama=(0.04, 0.05, 0.09), sleeve=(0.05, 0.06, 0.1), hem=0.07, sode=0.03),
    ),
}
P = PRESETS[PRESET]
rng = random.Random(11)

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.vrm(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
bones = arm.data.bones
head_bone = bones[J('Head')]
under_head = {b.name for b in bones if b == head_bone or head_bone in b.parent_recursive}
def bone_seg(name):
    b = bones[name]; return arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local

def move_verts(ob, deltas):
    """頂点を動かす(表情のシェイプキーも同じだけ動かす)。deltas はワールド座標の移動量"""
    me = ob.data; inv = ob.matrix_world.inverted().to_3x3()
    loc = [inv @ d for d in deltas]
    if me.shape_keys:
        for kb in me.shape_keys.key_blocks:
            for i, dl in enumerate(loc): kb.data[i].co = kb.data[i].co + dl
    for i, dl in enumerate(loc): me.vertices[i].co = me.vertices[i].co + dl
    me.update()

# ── 体型: 骨の軸から外向きに、骨の途中ほど大きく盛る(肌と服が同じ向きに動くので、すき間が開かない)
segs = {b: bone_seg(b) for b, *_ in P['fat']}
for ob in meshes:
    me = ob.data; gi = {g.index: g.name for g in ob.vertex_groups}; mw = ob.matrix_world
    ds = []
    for v in me.vertices:
        wts = {gi[g.group]: g.weight for g in v.groups if g.group in gi and g.weight > 0}
        tot = sum(wts.values()) or 1.0; p = mw @ v.co; d = Vector()
        for b, amp, side, (t0, t1) in P['fat']:
            w = wts.get(b, 0) / tot
            if w <= 0: continue
            a, c = segs[b]; ax = c - a; L2 = ax.length_squared or 1e-6
            t = (p - a).dot(ax) / L2; u = (t - t0) / max(1e-3, t1 - t0)
            if u <= 0 or u >= 1: continue
            prof = math.sin(math.pi * u) ** 0.7
            rad = p - (a + ax * max(0.0, min(1.0, t)))
            if rad.length < 1e-5: continue
            rad.normalize()
            if side == 'front': prof *= max(0.0, -rad.y) ** 0.6            # Blender では -Y が正面
            elif side == 'back': prof *= max(0.0, rad.y) ** 0.7
            elif side == 'side': prof *= abs(rad.x) ** 0.8
            d += rad * (amp * prof * w)
        ds.append(d)
    move_verts(ob, ds)

# ── 短い脚: 股から下を縮める(腰の高さで大きさをそろえるので、胴と頭が相対的に大きくなり、ずんぐりする)
if P.get('legs'):
    k = P['legs']; leg_b = {b.name for b in bones if any(b.name == J('UpperLeg', s) or bones[J('UpperLeg', s)] in b.parent_recursive for s in 'lr')}
    hz = (arm.matrix_world @ bones[J('UpperLeg', 'l')].head_local).z
    for ob in meshes:
        me = ob.data; gi = {g.index: g.name for g in ob.vertex_groups}; mw = ob.matrix_world; ds = []
        for v in me.vertices:
            wts = [(gi[g.group], g.weight) for g in v.groups if g.group in gi and g.weight > 0]; tot = sum(w for _, w in wts) or 1.0
            wl = sum(w for n, w in wts if n in leg_b) / tot; p = mw @ v.co
            ds.append(Vector((0, 0, (hz - p.z) * (1 - k) * wl if p.z < hz + 0.05 else 0.0)))
        move_verts(ob, ds)
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
    hzl = (arm.matrix_world.inverted() @ Vector((0, 0, hz))).z
    for eb in arm.data.edit_bones:
        if eb.name in leg_b:
            for attr in ('head', 'tail'):
                q = getattr(eb, attr).copy(); q.z = hzl - (hzl - q.z) * k; setattr(eb, attr, q)
    bpy.ops.object.mode_set(mode='OBJECT')

# ── 顔: 眉と目の怒りを基本の顔に焼き込む(いつも険しい顔)。他の表情もそこからの差で動く
face = next((o for o in meshes if o.name == 'Face'), None)
if face and face.data.shape_keys and P.get('scowl'):
    kb = face.data.shape_keys.key_blocks; base = kb['Basis']
    parts = [(kb.get('Fcl_BRW_Angry'), P['scowl'][0]), (kb.get('Fcl_EYE_Angry'), P['scowl'][1])]
    mw3 = face.matrix_world.to_3x3()
    ds = []
    for i in range(len(base.data)):
        d = Vector()
        for k, s in parts:
            if k: d += (k.data[i].co - base.data[i].co) * s
        ds.append(mw3 @ d)
    move_verts(face, ds)

# ── 太った顔: 目の下から口・あごを横へ広げる(頬・えら)
if P.get('jowl'):
    fz = [ (o.matrix_world @ v.co).z for o in meshes if o.name == 'Face' for v in o.data.vertices ]
    ztop, zbot = max(fz), min(fz); eye_z = ztop - (ztop - zbot) * 0.42
    for ob in meshes:
        me = ob.data; gi = {g.index: g.name for g in ob.vertex_groups}; mw = ob.matrix_world; ds = []
        for v in me.vertices:
            p = mw @ v.co; wh = sum(g.weight for g in v.groups if gi.get(g.group) in under_head)
            if wh <= 0 or p.z > eye_z or p.z < zbot - 0.03: ds.append(Vector()); continue
            u = (eye_z - p.z) / max(1e-3, eye_z - zbot); k = P['jowl'] * math.sin(math.pi * min(1, u * 0.8)) * min(1, wh)
            ds.append(Vector((p.x * k, 0, 0)))
        move_verts(ob, ds)

# ── 肌の色
def mtoon(m): return m.vrm_addon_extension.mtoon1
for m in bpy.data.materials:
    if 'SKIN' in m.name and 'Outline' not in m.name:
        try:
            e = mtoon(m); e.pbr_metallic_roughness.base_color_factor = (*P['skin'], 1.0)
            e.extensions.vrmc_materials_mtoon.shade_color_factor = P['shade']
        except Exception as ex: print('SKIN', ex)

# ── 頭の形(当たり判定)と、顔の目印(口・目)
verts, polys = [], []
for ob in meshes:
    me = ob.data; gi = {g.index: g.name for g in ob.vertex_groups}; mw = ob.matrix_world
    if ob.name == 'Hair': continue
    headv = [sum(g.weight for g in v.groups if gi.get(g.group) in under_head) > 0.5 for v in me.vertices]
    base = len(verts); verts += [mw @ v.co for v in me.vertices]
    polys += [[base + i for i in p.vertices] for p in me.polygons if all(headv[i] for i in p.vertices)]
bvh = BVHTree.FromPolygons(verts, polys)
hv = [verts[i] for p in polys for i in p]
xs = [p.x for p in hv]; ys = [p.y for p in hv]; zs = [p.z for p in hv]
top = max(zs); depth = max(ys) - min(ys)
C = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2 + depth * 0.06, top - depth * 0.5))
R = depth * 0.5
def mat_pts(ob, key):
    me = ob.data; idx = [i for i, m in enumerate(me.materials) if key in m.name]; s = set()
    for p in me.polygons:
        if p.material_index in idx: s.update(p.vertices)
    return [ob.matrix_world @ me.vertices[i].co for i in s]
eyes = mat_pts(face, 'EyeHighlight') if face else []
fm = mat_pts(face, 'FaceMouth') if face else []
eye_top = max(p.z for p in eyes) if eyes else C.z + 0.02
eye_x = max(abs(p.x) for p in eyes) if eyes else 0.08
mouth_z = (min(p.z for p in fm) + 0.012) if fm else C.z - 0.07
print('HEAD', C, R, 'eye_top', eye_top, 'mouth', mouth_z)
# ── 目を細く小さく(大人の目つき): 目のまわりを、目の中心へ向けて縦に縮める
if P.get('eyes') and face and eyes:
    ec = (max(p.z for p in eyes) + min(p.z for p in eyes)) / 2 - 0.006; k = P['eyes']; me = face.data; mw = face.matrix_world; ds = []
    for v in me.vertices:
        p = mw @ v.co; dz = p.z - ec
        if abs(dz) > 0.04 or not (0.008 < abs(p.x) < eye_x + 0.025) or p.y > C.y: ds.append(Vector()); continue
        fall = max(0.0, 1 - (abs(dz) / 0.04) ** 2) * min(1.0, (eye_x + 0.025 - abs(p.x)) / 0.012)
        ds.append(Vector((0, 0, -dz * (1 - k) * fall)))
    move_verts(face, ds)
    verts, polys = [], []
    for ob in meshes:
        if ob.name == 'Hair': continue
        me = ob.data; gi = {g.index: g.name for g in ob.vertex_groups}; mw = ob.matrix_world
        headv = [sum(g.weight for g in v.groups if gi.get(g.group) in under_head) > 0.5 for v in me.vertices]
        base = len(verts); verts += [mw @ v.co for v in me.vertices]
        polys += [[base + i for i in p.vertices] for p in me.polygons if all(headv[i] for i in p.vertices)]
    bvh = BVHTree.FromPolygons(verts, polys)
    eyes = mat_pts(face, 'EyeHighlight'); eye_top = max(p.z for p in eyes)

def hit_from(o, d):
    h = bvh.ray_cast(o, d, 1.0)
    if h[0] is None: return None, None
    n = h[1] if h[1].dot(d) < 0 else -h[1]
    return h[0], n.normalized()
def scalp(d):
    return hit_from(C + d * R * 2.5, -d)
def dir_of(az, el):
    a, e = math.radians(az), math.radians(el)
    return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))

# 付け足し用の材質: 髪の材質の一番暗い色
hair_ob = next((o for o in meshes if o.name == 'Hair'), None)
hmat = next(m for m in bpy.data.materials if 'HAIR' in m.name and 'Outline' not in m.name)
import numpy as np
img = next((nd.image for nd in hmat.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image), None)
dark_uv = (0.5, 0.5)
if img and hair_ob:
    W_, H_ = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(H_, W_, -1)
    uvl = hair_ob.data.uv_layers.active.data; lum = []
    for li in range(0, len(uvl), 7):
        u = uvl[li].uv; x = int((u[0] % 1) * (W_ - 1)); y = int((u[1] % 1) * (H_ - 1)); c = px[y, x]
        if c[3] > 0.5: lum.append((float(c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11), (u[0], u[1])))
    lum.sort(); dark_uv = lum[len(lum) // 25][1]
smat = hmat.copy(); smat.name = hmat.name.replace('HAIR', 'HAIR_spike')
try:
    mt = mtoon(smat).extensions.vrmc_materials_mtoon
    mt.parametric_rim_color_factor = (0.0, 0.0, 0.0); mt.matcap_factor = (0.0, 0.0, 0.0); mt.rim_lighting_mix_factor = 0.0
    if P.get('parts'): mtoon(smat).pbr_metallic_roughness.base_color_factor = (*P['parts'], 1.0)   # ひげ・眉・髷は濃い色
    if P.get('parts_flat'):   # 白銀のひげなど: 髪のテクスチャを使わず無地にする
        for tex in (mtoon(smat).pbr_metallic_roughness.base_color_texture, mtoon(smat).extensions.vrmc_materials_mtoon.shade_multiply_texture):
            try: tex.index.source = None
            except Exception: pass
        mtoon(smat).extensions.vrmc_materials_mtoon.shade_color_factor = tuple(c * 0.7 for c in P['parts'])
except Exception as e: print('MTOON', e)

bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
def face_of(vs):
    f = bm.faces.new(vs); f.smooth = True
    for l in f.loops: l[uv].uv = dark_uv
    return f
def tuft(base, n, out, L, wd, flat=0.55):
    side = out.cross(n if abs(out.dot(n)) < 0.97 else Vector((0, -1, 0))).normalized(); up2 = side.cross(out).normalized()
    ring = [bm.verts.new(base + (side * math.cos(t) + up2 * math.sin(t) * flat) * wd) for t in (0, math.pi / 2, math.pi, 3 * math.pi / 2)]
    tip = bm.verts.new(base + out * L)
    for q in range(4): face_of([ring[q], ring[(q + 1) % 4], tip])
    face_of(ring[::-1])
def blob(center, rx, ry, rz, seg=10, ring=7):
    """楕円体(髷など)"""
    rows = []
    for j in range(1, ring):
        e = math.pi * j / ring - math.pi / 2
        rows.append([bm.verts.new(center + Vector((rx * math.cos(e) * math.cos(math.tau * i / seg), ry * math.cos(e) * math.sin(math.tau * i / seg), rz * math.sin(e)))) for i in range(seg)])
    bot = bm.verts.new(center + Vector((0, 0, -rz))); tp = bm.verts.new(center + Vector((0, 0, rz)))
    for i in range(seg):
        face_of([rows[0][(i + 1) % seg], rows[0][i], bot]); face_of([rows[-1][i], rows[-1][(i + 1) % seg], tp])
        for j in range(len(rows) - 1): face_of([rows[j][i], rows[j][(i + 1) % seg], rows[j + 1][(i + 1) % seg], rows[j + 1][i]])
DOWN = Vector((0, 0, -1)); FWD = Vector((0, -1, 0)); UP = Vector((0, 0, 1))

# ── ひげ: 口のまわり(口そのものは空ける)・あご・頬の下・もみあげ。下と外へ垂れる毛束を一面に
if P.get('beard'):
    B = P['beard']; n_b = 0
    for el in range(-88, 6, 3):
        ring = max(1, int(round(220 * math.cos(math.radians(el)) / 6)))
        for k in range(ring):
            az = -110 + 220 * (k + rng.random() * 0.7) / ring
            f = math.cos(math.radians(az))
            p, n = scalp(dir_of(az, el))
            if p is None: continue
            # 範囲は高さで決める: 口ひげ(口のすぐ上)より下のあご一帯と、耳の前のもみあげ
            if not (p.z < mouth_z + B['top'] or (abs(az) > 68 and p.z < eye_top - B['burn'])): continue
            if abs(p.x) < 0.03 and mouth_z - 0.016 < p.z < mouth_z + 0.011 and f > 0.5: continue   # 口は空ける
            chin = max(0.0, min(1.0, (mouth_z - 0.01 - p.z) / 0.05))                               # 口より下ほど長く
            L = R * (0.1 + 0.32 * chin + 0.05 * f) * B['len'] * (0.75 + 0.5 * rng.random())
            out = (n * 0.55 + DOWN * (0.7 + 0.4 * chin) + FWD * 0.15 * f).normalized()
            out = (out + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 0.3))) * 0.18).normalized()
            tuft(p - n * 0.003, n, out, L, R * 0.12 * (0.85 + 0.3 * rng.random())); n_b += 1
    print('BEARD', n_b)

# ── 太い眉: 内側を下げて吊り上げた形(怒り眉)。顔の表面に沿わせる
if P.get('brows') and eyes:
    th = P['brows']['th']
    for sx in (-1, 1):
        pts = []
        for t in [i / 6 for i in range(7)]:
            x = sx * (0.016 + (eye_x + 0.006 - 0.016) * t); z = eye_top + 0.006 + 0.016 * t
            p, n = hit_from(Vector((x, C.y - R * 3, z)), FWD * -1)
            if p is not None: pts.append((p, n))
        if len(pts) < 2: continue
        rows = []
        for i, (p, n) in enumerate(pts):
            w = th * (1.0 - 0.45 * i / (len(pts) - 1))
            rows.append([bm.verts.new(p + n * 0.002 + UP * (w * 0.5)), bm.verts.new(p + n * 0.007 + UP * (w * 0.15)), bm.verts.new(p + n * 0.002 - UP * (w * 0.5))])
        for i in range(len(rows) - 1):
            for q in range(2):
                a, b = rows[i][q], rows[i][q + 1]; c, d = rows[i + 1][q + 1], rows[i + 1][q]
                face_of([a, b, c, d] if sx > 0 else [d, c, b, a])

# ── しわ: 額の横じわ・目の下・目尻・ほうれい線(顔の表面に沿わせた細い線)
def strip(pts_xz, th, lift=0.0015):
    pts = []
    for x, z in pts_xz:
        p, n = hit_from(Vector((x, C.y - R * 3, z)), FWD * -1)
        if p is not None: pts.append((p, n))
    if len(pts) < 2: return
    rows = []
    for i, (p, n) in enumerate(pts):
        w = th * (0.4 + 0.6 * math.sin(math.pi * (i + 0.5) / len(pts)))
        rows.append([bm.verts.new(p + n * lift + UP * w), bm.verts.new(p + n * lift - UP * w)])
    for i in range(len(rows) - 1):
        a, b = rows[i]; c, d = rows[i + 1]; face_of([a, b, d, c])
wr_bm = None
if P.get('wrinkles') and eyes:
    bm_main, uv_main = bm, uv; bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')   # しわは別の暗い色にする(白いひげと分ける)
    ex = eye_x
    for j, dz in enumerate((0.03, 0.042, 0.054)):                                   # 額
        w = 0.045 - 0.006 * j
        strip([(t * w, eye_top + dz - 0.006 * (t * t)) for t in [i / 8 * 2 - 1 for i in range(9)]], 0.0016)
    for sx in (-1, 1):
        strip([(sx * (0.03 + t * (ex - 0.03)), eye_top - 0.034 - 0.003 * math.sin(math.pi * t)) for t in [i / 5 for i in range(6)]], 0.0007)   # 目の下(たるみ)
        for k2 in (0, 1):                                                           # 目尻
            strip([(sx * (ex + 0.004 + t * 0.014), eye_top - 0.014 - k2 * 0.009 - t * (0.004 + k2 * 0.006)) for t in [i / 3 for i in range(4)]], 0.0012)
        strip([(sx * (0.017 + t * 0.022), mouth_z + 0.034 - t * 0.04) for t in [i / 6 for i in range(7)]], 0.0016)   # ほうれい線
    wr_bm = bm; bm, uv = bm_main, uv_main

# ── 髪: 元の長い髪を外す。頭皮の地毛(短い髪)は残し、髷を結う
if P.get('hair') and hair_ob:
    meshes = [o for o in meshes if o is not hair_ob]; bpy.data.objects.remove(hair_ob, do_unlink=True)
if P.get('hair') == 'topknot':
    p, n = scalp(dir_of(180, 62))
    if p is not None:
        root = p + n * 0.01
        blob(root + Vector((0, 0.005, 0.022)), R * 0.17, R * 0.2, R * 0.16)          # 根元の束ね
        blob(root + Vector((0, -0.01, 0.058)), R * 0.13, R * 0.34, R * 0.11)         # 髷(前へ倒した棒状)
        for i in range(6):                                                           # 束ねた所から後ろへ跳ねる毛先
            a = math.tau * i / 6
            tuft(root + Vector((math.cos(a) * 0.01, 0.02, 0.03)), Vector((0, 1, 0)), Vector((math.cos(a) * 0.4, 1, 0.5 + 0.2 * math.sin(a))).normalized(), R * 0.35, R * 0.07)

bm.normal_update()
me = bpy.data.meshes.new('enemy_parts'); bm.to_mesh(me); bm.free()
sp = bpy.data.objects.new('enemy_parts', me); bpy.context.scene.collection.objects.link(sp)
me.materials.append(smat)
sp.vertex_groups.new(name=J('Head')).add(list(range(len(me.vertices))), 1.0, 'REPLACE')
sp.parent = arm; md = sp.modifiers.new('Armature', 'ARMATURE'); md.object = arm
body = next(o for o in meshes if o.name == 'Body')
with bpy.context.temp_override(object=body, active_object=body, selected_objects=[body, sp], selected_editable_objects=[body, sp]):
    bpy.ops.object.join()

# ── 色付きの付け足し(覆面・傷・三つ編み): 部品ごとに材質と骨の重みを持たせて体へまとめる
def color_mat(name, color):
    m = hmat.copy(); m.name = hmat.name.replace('HAIR', 'HAIR_' + name)
    try:
        e = mtoon(m); e.pbr_metallic_roughness.base_color_factor = (*color, 1.0)
        mt = e.extensions.vrmc_materials_mtoon; mt.shade_color_factor = tuple(c * 0.6 for c in color)
        mt.parametric_rim_color_factor = (0.0, 0.0, 0.0); mt.matcap_factor = (0.0, 0.0, 0.0); mt.rim_lighting_mix_factor = 0.0
        for tex in (e.pbr_metallic_roughness.base_color_texture, mt.shade_multiply_texture):
            try: tex.index.source = None
            except Exception: pass
    except Exception as ex: print('COLORMAT', ex)
    return m
def attach(bm2, mat, weights):
    """weights: 頂点ごとの [(骨, 重み)] の並び、または骨の名前ひとつ(全部その骨)"""
    bm2.normal_update(); me2 = bpy.data.meshes.new(mat.name); bm2.to_mesh(me2); bm2.free()
    ob2 = bpy.data.objects.new(mat.name, me2); bpy.context.scene.collection.objects.link(ob2); me2.materials.append(mat)
    if isinstance(weights, str): ob2.vertex_groups.new(name=weights).add(list(range(len(me2.vertices))), 1.0, 'REPLACE')
    else:
        for i, bw in enumerate(weights):
            for bn, w in bw: (ob2.vertex_groups.get(bn) or ob2.vertex_groups.new(name=bn)).add([i], w, 'REPLACE')
    ob2.parent = arm; md2 = ob2.modifiers.new('Armature', 'ARMATURE'); md2.object = arm
    with bpy.context.temp_override(object=body, active_object=body, selected_objects=[body, ob2], selected_editable_objects=[body, ob2]):
        bpy.ops.object.join()
def new_bm():
    b = bmesh.new(); return b, b.loops.layers.uv.new('UVMap')

# 覆面: 鼻から下・あご・頬を布で覆う(目は出す)。下の端は首へ垂らす
if P.get('mask') and eyes:
    b2, uv2 = new_bm(); eye_bot = min(p.z for p in eyes) - 0.006; grid = {}
    NA, NE = 40, 30
    for i in range(NA + 1):
        az = -108 + 216 * i / NA
        for j in range(NE + 1):
            el = -88 + 80 * j / NE
            p, n = scalp(dir_of(az, el))
            if p is None: continue
            top = eye_bot - (0.0 if abs(az) < 60 else 0.012)
            if p.z > top: continue
            grid[(i, j)] = (b2.verts.new(p + n * 0.006), p, n)
    for i in range(NA):
        for j in range(NE):
            q = [grid.get(k) for k in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))]
            if all(q):
                f = b2.faces.new([x[0] for x in q[::-1]]); f.smooth = True
                for l in f.loops: l[uv2].uv = (0.5, 0.5)
    # 下の端を首へ垂らす(各列の一番下の点から下へ)
    for i in range(NA + 1):
        js = [j for j in range(NE + 1) if (i, j) in grid]
        if not js: continue
        v, p, n = grid[(i, min(js))]; grid[(i, 'hang')] = b2.verts.new(p + n * 0.012 + Vector((0, 0, -0.05)))
    for i in range(NA):
        a, b = grid.get((i, 'hang')), grid.get((i + 1, 'hang'))
        ja = [j for j in range(NE + 1) if (i, j) in grid]; jb = [j for j in range(NE + 1) if (i + 1, j) in grid]
        if a and b and ja and jb:
            try:
                f = b2.faces.new([grid[(i, min(ja))][0], a, b, grid[(i + 1, min(jb))][0]]); f.smooth = True
                for l in f.loops: l[uv2].uv = (0.5, 0.5)
            except ValueError: pass
    bmesh.ops.recalc_face_normals(b2, faces=b2.faces[:])
    attach(b2, color_mat('mask', P['mask']), J('Head'))

# 傷: 左目を縦に裂く古傷
if P.get('scar') and eyes:
    b2, uv2 = new_bm(); pts = []
    for t in [i / 8 for i in range(9)]:
        x = eye_x * 0.55 + 0.01 * t; z = eye_top + 0.03 - 0.075 * t
        p, n = hit_from(Vector((x, C.y - R * 3, z)), FWD * -1)
        if p is not None: pts.append((p, n))
    rows = []
    for i, (p, n) in enumerate(pts):
        w = 0.0032 * math.sin(math.pi * (i + 0.5) / len(pts)) + 0.0008
        rows.append([b2.verts.new(p + n * 0.0016 + Vector((w, 0, 0))), b2.verts.new(p + n * 0.0016 - Vector((w, 0, 0)))])
    for i in range(len(rows) - 1):
        f = b2.faces.new([rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]])
        for l in f.loops: l[uv2].uv = (0.5, 0.5)
    bmesh.ops.recalc_face_normals(b2, faces=b2.faces[:])
    attach(b2, color_mat('scar', (0.45, 0.12, 0.1)), J('Head'))

# 三つ編み: 後頭部から背中へ垂れる(蠍の尾)。根元は頭、下ほど胸の骨に付けて背中に沿わせる
if P.get('braid'):
    b2, uv2 = new_bm(); W = []
    p0, n0 = scalp(dir_of(180, 5))
    if p0 is not None:
        pos = p0 + n0 * 0.012; d = Vector((0, 0.55, -0.83)).normalized(); n = P['braid'].get('n', 10); seg = P['braid'].get('seg', 0.05)
        for i in range(n):
            r = R * (0.15 - 0.07 * i / n); c = pos + d * seg * 0.5
            w = min(1.0, max(0.0, (i - 1) / 4))
            k0 = len(b2.verts)
            # 編み目: 少しずつねじった楕円の玉
            rows = []
            for jj in range(1, 6):
                e = math.pi * jj / 6 - math.pi / 2
                ring = []
                for kk in range(8):
                    a = math.tau * kk / 8 + i * 0.5
                    side = d.cross(Vector((1, 0, 0))).normalized(); up2 = d.cross(side).normalized()
                    ring.append(b2.verts.new(c + d * (seg * 0.62 * math.sin(e)) + (side * math.cos(a) + up2 * math.sin(a) * 0.8) * r * math.cos(e)))
                rows.append(ring)
            for jj in range(len(rows) - 1):
                for kk in range(8):
                    f = b2.faces.new([rows[jj][kk], rows[jj][(kk + 1) % 8], rows[jj + 1][(kk + 1) % 8], rows[jj + 1][kk]]); f.smooth = True
                    for l in f.loops: l[uv2].uv = dark_uv
            for _ in range(len(b2.verts) - k0): W.append([(J('Head'), 1 - w), (J('UpperChest'), w)] if w > 0 else [(J('Head'), 1.0)])
            pos = pos + d * seg; d = (d + Vector((0, -0.08, -0.12))).normalized()
        # 先の毒針(金)
        k0 = len(b2.verts); bm_save = bm
        tipv = [b2.verts.new(pos + Vector((math.cos(a) * 0.012, math.sin(a) * 0.012, 0))) for a in (0, math.tau / 3, 2 * math.tau / 3)]
        tp = b2.verts.new(pos + Vector((0, 0.05, 0.07)))
        for q in range(3):
            f = b2.faces.new([tipv[q], tipv[(q + 1) % 3], tp])
            for l in f.loops: l[uv2].uv = dark_uv
        for _ in range(len(b2.verts) - k0): W.append([(J('UpperChest'), 1.0)])
        bmesh.ops.recalc_face_normals(b2, faces=b2.faces[:])
        attach(b2, color_mat('braid', P.get('parts', (0.1, 0.08, 0.07))), W)

# たてがみ: 頭頂から後ろへ、長い毛束を背中へ流す(前髪は短く後ろへ撫でつける)
if P.get('hair') == 'mane':
    b2, uv2 = new_bm(); W = []; n_m = 0
    for el in range(-20, 90, 6):
        ring = max(1, int(round(360 * math.cos(math.radians(el)) / 12)))
        for k in range(ring):
            az = 360 * (k + rng.random() * 0.6) / ring - 180
            f = math.cos(math.radians(az)); hl = 18 if f > 0.4 else (-15 if f > -0.3 else -25)
            if el < hl: continue
            p, n = scalp(dir_of(az, el))
            if p is None: continue
            back = max(0.0, -f)
            L = R * (0.35 + 0.9 * back + 0.25 * (el / 90)) * P['mane'].get('len', 1.0) * (0.8 + 0.4 * rng.random())
            out = (n * 0.35 + Vector((0, 0.75, -0.55 - 0.5 * back)) + Vector((0, 0, 0.35)) * (1 - back)).normalized()
            out = (out + Vector((rng.uniform(-1, 1), rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5))) * 0.15).normalized()
            k0 = len(b2.verts)
            side = out.cross(n if abs(out.dot(n)) < 0.97 else Vector((1, 0, 0))).normalized(); up2 = side.cross(out).normalized(); wd = R * 0.14
            base = p - n * 0.004; ringv = [b2.verts.new(base + (side * math.cos(t) + up2 * math.sin(t) * 0.5) * wd) for t in (0, math.pi / 2, math.pi, 3 * math.pi / 2)]
            mid = b2.verts.new(base + out * L * 0.55 + Vector((0, 0.01, -0.03)) * back + side * wd * 0.2); tip = b2.verts.new(base + out * L + Vector((0, 0, -0.06)) * back)
            for q in range(4):
                for fv in ([ringv[q], ringv[(q + 1) % 4], mid], [mid, ringv[(q + 1) % 4], tip]) if False else ([ringv[q], ringv[(q + 1) % 4], mid],):
                    fc = b2.faces.new(fv); fc.smooth = True
                    for l in fc.loops: l[uv2].uv = dark_uv
            try:
                fc = b2.faces.new([mid, tip, ringv[0]]); fc.smooth = True
                for l in fc.loops: l[uv2].uv = dark_uv
            except ValueError: pass
            # 長い後ろ髪は根元が頭、先は胸の骨にも付けて背中に沿わせる
            for vi in range(len(b2.verts) - k0):
                is_tip = vi >= 4
                W.append([(J('Head'), 1.0 - 0.5 * back * is_tip), (J('UpperChest'), 0.5 * back * is_tip)] if back > 0.2 and is_tip else [(J('Head'), 1.0)])
            n_m += 1
    bmesh.ops.recalc_face_normals(b2, faces=b2.faces[:])
    attach(b2, color_mat('mane', P.get('parts', (0.7, 0.7, 0.75))), W)
    print('MANE', n_m)

# 戦化粧: 両頬に青い三本線
if P.get('paint') and eyes:
    b2, uv2 = new_bm()
    for sx in (-1, 1):
        for k in range(3):
            pts = []
            for t in [i / 5 for i in range(6)]:
                x = sx * (0.035 + 0.012 * k + 0.004 * t); z = eye_top - 0.03 - 0.008 * k - 0.035 * t
                p, n = hit_from(Vector((x, C.y - R * 3, z)), FWD * -1)
                if p is not None: pts.append((p, n))
            rows = []
            for i, (p, n) in enumerate(pts):
                w = 0.0024 * (1 - 0.6 * i / max(1, len(pts) - 1))
                rows.append([b2.verts.new(p + n * 0.0015 + Vector((w, 0, 0))), b2.verts.new(p + n * 0.0015 - Vector((w, 0, 0)))])
            for i in range(len(rows) - 1):
                fc = b2.faces.new([rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]])
                for l in fc.loops: l[uv2].uv = (0.5, 0.5)
    bmesh.ops.recalc_face_normals(b2, faces=b2.faces[:])
    attach(b2, color_mat('paint', P['paint']), J('Head'))

# 狼の毛皮の襟巻き: 首の付け根から肩にかけて、外と下へ垂れる毛を一周に生やす
if P.get('fur'):
    bverts, bpolys = [], []
    for ob in [o for o in bpy.data.objects if o.type == 'MESH']:
        me = ob.data; gi = {g.index: g.name for g in ob.vertex_groups}; mw = ob.matrix_world
        keep = {J('UpperChest'), J('Shoulder', 'l'), J('Shoulder', 'r'), J('Neck'), J('Chest')}
        ok = [sum(g.weight for g in v.groups if gi.get(g.group) in keep) > 0.5 for v in me.vertices]
        b0 = len(bverts); bverts += [mw @ v.co for v in me.vertices]
        bpolys += [[b0 + i for i in p.vertices] for p in me.polygons if all(ok[i] for i in p.vertices)]
    tb = BVHTree.FromPolygons(bverts, bpolys)
    nk = arm.matrix_world @ bones[J('Neck')].head_local
    b2, uv2 = new_bm(); W = []
    for zi, dz in enumerate((0.0, -0.035, -0.07)):
        cnt = 46 + zi * 8
        for k in range(cnt):
            a = math.tau * (k + rng.random() * 0.5) / cnt
            d = Vector((math.sin(a), -math.cos(a), 0.0))
            o = Vector((nk.x, nk.y, nk.z + dz)) + d * 0.6
            h = tb.ray_cast(o, -d, 0.6)
            if h[0] is None: continue
            p = h[0]; side = abs(math.sin(a))
            out = (d * 0.7 + Vector((0, 0, -0.55 - 0.3 * zi))).normalized()
            L = (0.045 + 0.04 * side + 0.02 * zi) * (0.8 + 0.4 * rng.random())
            k0 = len(b2.verts); tuft_b = b2
            sd = out.cross(Vector((0, 0, 1))); sd = sd.normalized() if sd.length > 1e-4 else Vector((1, 0, 0)); u2 = sd.cross(out).normalized(); wd = 0.02
            rv = [b2.verts.new(p + (sd * math.cos(t) + u2 * math.sin(t) * 0.5) * wd) for t in (0, math.pi / 2, math.pi, 3 * math.pi / 2)]
            tp = b2.verts.new(p + out * L)
            for q in range(4):
                fc = b2.faces.new([rv[q], rv[(q + 1) % 4], tp]); fc.smooth = True
                for l in fc.loops: l[uv2].uv = (0.5, 0.5)
            bone = J('Shoulder', 'l' if p.x > 0 else 'r') if side > 0.75 else J('UpperChest')
            for _ in range(len(b2.verts) - k0): W.append([(bone, 1.0)])
    bmesh.ops.recalc_face_normals(b2, faces=b2.faces[:])
    attach(b2, color_mat('fur', P['fur']), W)

if wr_bm is not None:
    bmesh.ops.recalc_face_normals(wr_bm, faces=wr_bm.faces[:]); attach(wr_bm, color_mat('wrinkle', P.get('wrinkle', (0.2, 0.12, 0.1))), J('Head'))

# 頭皮の地毛の色(剃った頭の青み・濃い色)
if P.get('hairtint'):
    # 体の中の頭皮(地毛)の材質を、無地の濃い色に差し替える
    stub = color_mat('stubble', P['hairtint'])
    for i, m in enumerate(body.data.materials):
        if m and 'HAIR' in m.name and 'HAIR_' not in m.name and 'CLOTH' not in m.name:   # 付け足しの部品(HAIR_〜)は除く
            body.data.materials[i] = stub; print('HAIRTINT', m.name)

# 脚と腕のタイツ模様を隠す: 袴と広袖(設定の outfit)
if P.get('outfit'):
    import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from outfit import add_outfit
    add_outfit(arm, body, **P['outfit'])

for o in bpy.data.objects: o.select_set(False)
r = bpy.ops.export_scene.vrm(filepath=OUT, armature_object_name=arm.name, ignore_warning=True)
print('EXPORT', r)
