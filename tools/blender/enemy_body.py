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
        beard=dict(len=1.0, top=0.02, burn=0.03), legs=0.72, jowl=0.22, eyes=0.6, wrinkles=True, brows=dict(th=0.011), hair='topknot',
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
if P.get('wrinkles') and eyes:
    ex = eye_x
    for j, dz in enumerate((0.03, 0.042, 0.054)):                                   # 額
        w = 0.045 - 0.006 * j
        strip([(t * w, eye_top + dz - 0.006 * (t * t)) for t in [i / 8 * 2 - 1 for i in range(9)]], 0.0016)
    for sx in (-1, 1):
        strip([(sx * (0.03 + t * (ex - 0.03)), eye_top - 0.034 - 0.003 * math.sin(math.pi * t)) for t in [i / 5 for i in range(6)]], 0.0007)   # 目の下(たるみ)
        for k2 in (0, 1):                                                           # 目尻
            strip([(sx * (ex + 0.004 + t * 0.014), eye_top - 0.014 - k2 * 0.009 - t * (0.004 + k2 * 0.006)) for t in [i / 3 for i in range(4)]], 0.0012)
        strip([(sx * (0.017 + t * 0.022), mouth_z + 0.034 - t * 0.04) for t in [i / 6 for i in range(7)]], 0.0016)   # ほうれい線

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

for o in bpy.data.objects: o.select_set(False)
r = bpy.ops.export_scene.vrm(filepath=OUT, armature_object_name=arm.name, ignore_warning=True)
print('EXPORT', r)
