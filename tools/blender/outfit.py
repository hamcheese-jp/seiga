# 袴と広袖: VRoid の素体(脚・腕がタイツ模様のまま)に、本物の服を着せる
#   袴: 腰から太ももは裾へ向けてふくらみ、膝から下は脚絆のように細く絞る(脛当てをその上に着けられる)
#   広袖: 二の腕はゆったり、前腕は細く絞る(籠手をその上に着けられる)
# 体の表面までの距離を測って作るので、太った体・筋肉の体にも沿う。骨に重みを付けて一緒に動かす
import bpy, bmesh, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def J(n, s=None): return f'J_Bip_{s.upper()}_{n}' if s else f'J_Bip_C_{n}'

def _neutral_uv(mat, ob):
    """材質のテクスチャで一番明るく色の薄い所の UV(そこへ色を掛けて無地にする)"""
    img = next((nd.image for nd in mat.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image), None) if mat.node_tree else None
    if not img: return (0.5, 0.5)
    W, H = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, -1)
    best, buv = -9, (0.5, 0.5)
    uvl = ob.data.uv_layers.active.data; idx = [i for i, m in enumerate(ob.data.materials) if m == mat]
    for p in ob.data.polygons:
        if p.material_index not in idx: continue
        for li in p.loop_indices[:1]:
            u = uvl[li].uv; x = int((u[0] % 1) * (W - 1)); y = int((u[1] % 1) * (H - 1)); c = px[y, x]
            if c[3] < 0.9: continue
            sc = float(c[0] + c[1] + c[2]) - 3 * float(max(c[0], c[1], c[2]) - min(c[0], c[1], c[2]))
            if sc > best: best, buv = sc, (u[0], u[1])
    return buv

def _cloth_mat(body, name, color):
    src = next(m for m in body.data.materials if 'CLOTH' in m.name)
    m = src.copy(); m.name = src.name.replace('CLOTH', 'CLOTH_' + name)
    try:
        e = m.vrm_addon_extension.mtoon1
        e.pbr_metallic_roughness.base_color_factor = (*color, 1.0)
        e.extensions.vrmc_materials_mtoon.shade_color_factor = tuple(c * 0.62 for c in color)
        e.extensions.vrmc_materials_mtoon.matcap_factor = (0.0, 0.0, 0.0)
        for tex in (e.pbr_metallic_roughness.base_color_texture, e.extensions.vrmc_materials_mtoon.shade_multiply_texture):
            try: tex.index.source = None
            except Exception as ex2: print('NOTEX', ex2)
    except Exception as ex: print('CLOTHMAT', ex)
    return m, _neutral_uv(src, body)

def _limb_bvh(body, arm, bone_names):
    """指定の骨に主に付いた肌の面だけで当たり判定を作る(隣の脚や胴に当たらないように)"""
    me = body.data; gi = {g.index: g.name for g in body.vertex_groups}; mw = body.matrix_world
    skin = {i for i, m in enumerate(me.materials) if 'HAIR' not in m.name}   # 肌でもボディスーツ(服)でも、髪以外の表面で測る
    own = []
    for v in me.vertices:
        tot = sum(g.weight for g in v.groups) or 1
        own.append(sum(g.weight for g in v.groups if gi.get(g.group) in bone_names) / tot > 0.5)
    verts = [mw @ v.co for v in me.vertices]
    polys = [list(p.vertices) for p in me.polygons if p.material_index in skin and all(own[i] for i in p.vertices)]
    return BVHTree.FromPolygons(verts, polys)

def _tube(bm, uvl, uvc, rings, segs, wts_out, groups):
    """rings: [(中心, 軸, 外向きの基準, 半径の関数(角度→r), [(骨, 重み)...])]"""
    rows = []
    for c, ax, ref, rf, bw in rings:
        side = ax.cross(ref).normalized(); up = ref.normalized()
        row = []
        for i in range(segs):
            a = math.tau * i / segs; d = (up * math.cos(a) + side * math.sin(a)).normalized()
            v = bm.verts.new(c + d * rf(a, d)); row.append(v); wts_out.append(bw)
        rows.append(row)
    for j in range(len(rows) - 1):
        for i in range(segs):
            f = bm.faces.new([rows[j][i], rows[j][(i + 1) % segs], rows[j + 1][(i + 1) % segs], rows[j + 1][i]]); f.smooth = True
            for l in f.loops: l[uvl].uv = uvc
    return rows

def add_outfit(arm, body, hakama=(0.18, 0.16, 0.2), sleeve=(0.75, 0.72, 0.68), hem=0.1, sode=0.03, legs=True, arms=True):
    """body(VRoid の Body メッシュ)に袴と広袖を足して一つにまとめる"""
    B = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
    T = {b.name: arm.matrix_world @ b.tail_local for b in arm.data.bones}
    out = []
    def ray_r(bvh, c, d, fallback):
        h = bvh.ray_cast(c + d * 0.4, -d, 0.6)
        if h[0] is None: return fallback
        return max(0.01, min((h[0] - c).dot(d), fallback * 1.5))   # 装具などで極端に太くならないよう上限を付ける
    for kind, color, on in (('hakama', hakama, legs), ('sleeve', sleeve, arms)):
        if not on: continue
        mat, uvc = _cloth_mat(body, kind, color)
        bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); wts = []
        for s in 'lr':
            if kind == 'hakama':
                hip, knee, ank = B[J('UpperLeg', s)], B[J('LowerLeg', s)], B[J('Foot', s)]
                bvh = _limb_bvh(body, arm, {J('UpperLeg', s), J('LowerLeg', s), J('Hips')})
                waist = B[J('Spine')].z + 0.02; mid = Vector((hip.x * 0.45, hip.y, waist))
                pts = []
                # 腰(体の中心寄り)→股→膝→足首の少し上。t は 0=腰 … 1=足首
                for k in range(19):
                    t = k / 18
                    if t < 0.15: u = t / 0.15; c = mid.lerp(hip, u); ax = (hip - mid).normalized() if (hip - mid).length > 1e-4 else Vector((0, 0, -1))
                    elif t < 0.6: u = (t - 0.15) / 0.45; c = hip.lerp(knee, u); ax = (knee - hip).normalized()
                    else: u = (t - 0.6) / 0.4; c = knee.lerp(ank + Vector((0, 0, 0.06)), u); ax = (ank - knee).normalized()
                    ax = Vector((0, 0, -1)) if t < 0.15 else ax
                    # ふくらみ: 太ももから膝で最大、膝から下は脚絆(細く)
                    if t < 0.6: off = 0.018 + hem * min(1.0, (t + 0.08) / 0.66)
                    elif t < 0.68: off = 0.02 + hem * (1 - (t - 0.6) / 0.08) ** 2
                    else: off = 0.008
                    if t < 0.15: bw = [(J('Hips'), 1.0)]
                    elif t < 0.52: bw = [(J('UpperLeg', s), 1.0)]
                    elif t < 0.66: w = (t - 0.52) / 0.14; bw = [(J('UpperLeg', s), 1 - w), (J('LowerLeg', s), w)]
                    else: bw = [(J('LowerLeg', s), 1.0)]
                    fb = 0.07 + 0.03 * (1 - t)
                    pl = 0.12 * off if t < 0.62 else 0.0                                       # ひだ(角度ごとに少し出入り)
                    rf = (lambda c, off, fb, pl: (lambda a, d: ray_r(bvh, c, d, fb) + off + pl * math.cos(a * 10)))(c.copy(), off, fb, pl)
                    pts.append((c.copy(), ax, Vector((0, -1, 0)), rf, bw))
                _tube(bm, uvl, uvc, pts, 20, wts, None)
            else:
                sh, el, wr = B[J('UpperArm', s)], B[J('LowerArm', s)], B[J('Hand', s)]
                bvh = _limb_bvh(body, arm, {J('UpperArm', s), J('LowerArm', s)})
                pts = []
                for k in range(15):
                    t = k / 14
                    if t < 0.5: u = t / 0.5; c = sh.lerp(el, u); ax = (el - sh).normalized()
                    else: u = (t - 0.5) / 0.5; c = el.lerp(wr - (wr - el) * 0.06, u); ax = (wr - el).normalized()
                    # 二の腕はゆったり(下側に垂れる)、前腕は細く
                    if t < 0.5: off = 0.014 + sode * min(1.0, 0.5 + t)
                    elif t < 0.6: off = 0.012 + sode * 0.4 * (1 - (t - 0.5) / 0.1)
                    else: off = 0.006
                    if t < 0.4: bw = [(J('UpperArm', s), 1.0)]
                    elif t < 0.6: w = (t - 0.4) / 0.2; bw = [(J('UpperArm', s), 1 - w), (J('LowerArm', s), w)]
                    else: bw = [(J('LowerArm', s), 1.0)]
                    down = Vector((0, 0, -1))
                    rf = (lambda c, off: (lambda a, d: ray_r(bvh, c, d, 0.055) + off * (1.0 + 0.6 * max(0.0, d.dot(down)))))(c.copy(), off)
                    pts.append((c.copy(), ax, Vector((0, -1, 0)), rf, bw))
                _tube(bm, uvl, uvc, pts, 16, wts, None)
        bm.normal_update()
        me = bpy.data.meshes.new(kind); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(kind, me); bpy.context.scene.collection.objects.link(ob)
        me.materials.append(mat)
        for i, bw in enumerate(wts):
            for bn, w in bw:
                g = ob.vertex_groups.get(bn) or ob.vertex_groups.new(name=bn); g.add([i], w, 'REPLACE')
        ob.parent = arm; md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm
        # 表裏どちらからも見えるように、面の向きを外向きにそろえる
        bm2 = bmesh.new(); bm2.from_mesh(me); bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces[:]); bm2.to_mesh(me); bm2.free()
        out.append(ob)
    if out:
        with bpy.context.temp_override(object=body, active_object=body, selected_objects=[body, *out], selected_editable_objects=[body, *out]):
            bpy.ops.object.join()
    print('OUTFIT', [o for o in ('hakama', 'sleeve')])
