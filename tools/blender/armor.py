# 服と鎧: 体の表面を写し取り、外へ押し出して厚みを付ける(体に沿うので関節と一緒に曲がる)
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix

TORSO = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r']
FINGERS = [f'{f}_0{i}' for f in ('thumb', 'index', 'middle', 'ring', 'pinky') for i in (1, 2, 3)]
def side(names, s): return [n + '_' + s for n in names]

def noise_normal(name, kind, size=256, seed=3):
    """繰り返し使える凹凸の絵(法線マップ)を作る: cloth=織り目 leather=しぼ metal=槌目"""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size] / size
    if kind == 'cloth':
        h = 0.5 * np.sin(x * math.tau * 48) * np.sin(y * math.tau * 48) + 0.25 * np.sin((x + y) * math.tau * 24)
    else:
        f = np.fft.fft2(rng.standard_normal((size, size)))
        k = np.hypot(*np.meshgrid(np.fft.fftfreq(size), np.fft.fftfreq(size)))
        band = np.exp(-((k - (0.09 if kind == 'leather' else 0.03)) / (0.05 if kind == 'leather' else 0.02)) ** 2)
        h = np.real(np.fft.ifft2(f * band)); h /= np.abs(h).max()
        if kind == 'leather': h = -np.abs(h) * 1.5
    s = 2.2 if kind != 'metal' else 1.2
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * s; dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * s
    n = np.dstack([-dx, -dy, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    px = np.dstack([n * 0.5 + 0.5, np.ones_like(h)]).astype(np.float32)
    im = bpy.data.images.new(name, size, size, alpha=False); im.colorspace_settings.name = 'Non-Color'
    im.pixels = px.ravel(); im.pack()
    return im

_nimg = {}
def material(name, color, rough, metal=0.0, bump=None, scale=14.0, strength=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if bump:
        if bump not in _nimg: _nimg[bump] = noise_normal('n_' + bump, bump)
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = _nimg[bump]
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale, 1)
        uv = nt.nodes.new('ShaderNodeUVMap')
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = strength
        nt.links.new(uv.outputs['UV'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], tex.inputs['Vector'])
        nt.links.new(tex.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    m.use_backface_culling = False
    return m

def _weights(obj, groups, arm):
    bones = {g.index for g in obj.vertex_groups if g.name in arm.data.bones}
    idx = {obj.vertex_groups[g].index for g in groups if g in obj.vertex_groups}
    return [sum(g.weight for g in v.groups if g.group in idx) / max(1e-6, sum(g.weight for g in v.groups if g.group in bones)) for v in obj.data.vertices]

def piece(body, arm, name, groups, mat, planes=(), offset=0.01, smooth=0, thick=0.0, rigid=None, trim=None, trim_w=0.012, min_w=0.5, hull_z=None, slots=None):
    """体の groups の領域を写し取って服や鎧の部品にする。planes=[(点, 法線)] は法線側を切り落とす。slots=使う材質番号(肌だけ等)"""
    ob = body.copy(); ob.data = body.data.copy(); ob.name = name
    body.users_collection[0].objects.link(ob)
    if ob.data.shape_keys: ob.shape_key_clear()
    slot_of = [p.material_index for p in ob.data.polygons]
    ob.data.materials.clear(); ob.data.materials.append(mat)      # 面の材質番号を振る前に入れ替える(後で消すと番号が0に戻る)
    if trim: ob.data.materials.append(trim)
    w = _weights(ob, groups, arm)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if min(w[v.index] for v in f.verts) < min_w or (slots is not None and slot_of[f.index] not in slots)], context='FACES')
    for f in bm.faces: f.material_index = 0
    for co, no in planes:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_outer=True)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    if hull_z is not None:                               # 足先は凸包でまとめて靴の形にする(足指を消す)
        low = [v for v in bm.verts if v.co.z < hull_z]
        r = bmesh.ops.convex_hull(bm, input=low)
        dead = [g for g in r["geom_interior"] + r["geom_unused"] + r["geom_holes"] if g.is_valid]
        bmesh.ops.delete(bm, geom=[g for g in dead if isinstance(g, bmesh.types.BMFace)], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    for v in bm.verts: v.co += v.normal * offset
    if smooth:
        inner = [v for v in bm.verts if not v.is_boundary]
        for _ in range(smooth): bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        bm.normal_update()
        for v in inner: v.co += v.normal * offset * 0.25      # 均すと縮むぶんを戻す
    ntrim = 0
    if trim:
        r = bmesh.ops.inset_region(bm, faces=bm.faces[:], thickness=trim_w, depth=0.0, use_boundary=True, use_even_offset=True)
        for f in r['faces']: f.material_index = 1; ntrim += 1
        bm.normal_update()
        for v in {v for f in r['faces'] for v in f.verts}: v.co += v.normal * 0.0025
    for f in bm.faces: f.smooth = True
    bm.to_mesh(ob.data); bm.free()
    if thick:
        md = ob.modifiers.new('solid', 'SOLIDIFY'); md.thickness = thick; md.offset = 1.0; md.use_rim = True
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.object.modifier_apply(modifier=md.name)
    if rigid:
        for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)
        ob.vertex_groups.new(name=rigid).add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    return ob

def hide_body(body, arm, groups, planes=(), min_w=0.5):
    """服の下に隠れる体の面を消す(はみ出し防止と軽量化)。planes は「残す側」を法線で指定"""
    w = _weights(body, groups, arm)
    kill = []
    for p in body.data.polygons:
        if min(w[v] for v in p.vertices) < min_w: continue
        c = p.center
        if all((c - co).dot(no) < -0.004 for co, no in planes): kill.append(p.index)
    ks = set(kill)
    sk = body.data.shape_keys
    bm = bmesh.new(); bm.from_mesh(body.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index in ks], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data); bm.free()
    return len(kill)

def shell(name, mat, bone, center, radius, scale=(1, 1, 1), rot=(0, 0, 0), cap=0.5, segs=20, rings=8, thick=0.004, trim=None, coll=None, arm=None):
    """球を切った椀形の板(肩当て・膝当て)。cap=0.5 で半球"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings * 2, radius=radius)
    zc = radius * math.cos(math.pi * cap)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, zc), plane_no=(0, 0, -1), clear_outer=True)
    if trim:
        edge = [f for f in bm.faces if min(v.co.z for v in f.verts) < zc + radius * 0.14]
        for f in edge: f.material_index = 1
    for f in bm.faces: f.smooth = True
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    me.materials.append(mat)
    if trim: me.materials.append(trim)
    M = Matrix.Translation(center) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Diagonal((*scale, 1))
    me.transform(M)
    md = ob.modifiers.new('solid', 'SOLIDIFY'); md.thickness = thick; md.offset = 1.0
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=md.name)
    me.uv_layers.new(name='UVMap')
    ob.vertex_groups.new(name=bone).add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    return ob

def plate(name, mat, bones, pts, width, thick=0.005, bulge=0.012, trim=None, coll=None, segs=8):
    """帯状の板(草摺・垂れ・スカーフの尾)。pts は上から下への中心線、bones は [(骨, 重み)]"""
    bm = bmesh.new(); rows = []
    for i, (p, n) in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)][0] - pts[max(i - 1, 0)][0]).normalized()
        sd = t.cross(n).normalized(); wv = width[i] if isinstance(width, (list, tuple)) else width
        row = []
        for k in range(segs + 1):
            u = k / segs * 2 - 1
            row.append(bm.verts.new(p + sd * (u * wv / 2) + n * (bulge * (1 - u * u))))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for k in range(segs):
            f = bm.faces.new([a[k], a[k + 1], b[k + 1], b[k]]); f.smooth = True
            if trim and (k in (0, segs - 1) or b is rows[-1]): f.material_index = 1
    bm.normal_update()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    me.materials.append(mat)
    if trim: me.materials.append(trim)
    md = ob.modifiers.new('solid', 'SOLIDIFY'); md.thickness = thick; md.offset = 1.0
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=md.name)
    me.uv_layers.new(name='UVMap')
    n = len(me.vertices)
    if callable(bones):
        for v in me.vertices:
            for bname, wgt in bones(v.co):
                (ob.vertex_groups.get(bname) or ob.vertex_groups.new(name=bname)).add([v.index], wgt, 'REPLACE')
    else:
        for bname, wgt in bones: ob.vertex_groups.new(name=bname).add(list(range(n)), wgt, 'REPLACE')
    return ob

def join(objs, name, arm):
    """部品を一つにまとめて骨に付ける(描画回数を減らす)"""
    objs = [o for o in objs if o]
    with bpy.context.temp_override(object=objs[0], active_object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    ob = objs[0]; ob.name = name
    for m in list(ob.modifiers): ob.modifiers.remove(m)
    ob.parent = arm; md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm
    return ob

def wrap(body, arm, name, mat, cy, z0, z1, offset=0.012, xmax=None, rings=14, segs=36, thick=0.005, trim=None, skip=('HAIR',), blur=2, coll=None):
    """服ごと外側から包む胴当て: 高さごとに周囲から中心へ光線を当て、一番外の面に沿う筒を作る。
    xmax を超える横方向は切り落として腕の通る穴にする。重みは近くの体の頂点から写す"""
    from mathutils import bvhtree, kdtree
    me = body.data
    ok = {i for i, m in enumerate(me.materials) if not any(k in m.name for k in skip)}
    mw = body.matrix_world
    vs = [mw @ v.co for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons if p.material_index in ok]
    tree = bvhtree.BVHTree.FromPolygons(vs, polys)
    R = np.zeros((rings + 1, segs))
    for i in range(rings + 1):
        z = z0 + (z1 - z0) * i / rings
        for k in range(segs):
            a = math.tau * k / segs; d = Vector((math.sin(a), -math.cos(a), 0))
            hit = tree.ray_cast(Vector((0, cy, z)) + d * 0.7, -d, 0.7)
            R[i, k] = (0.7 - hit[3]) if hit[0] is not None else 0.0
    R[R <= 0] = np.median(R[R > 0])
    if xmax is not None:                      # 腕に当たった光線は肩口で止める
        for k in range(segs):
            sn = abs(math.sin(math.tau * k / segs))
            if sn > 1e-3: R[:, k] = np.minimum(R[:, k], (xmax + 0.02) / sn)
    for _ in range(blur):                      # 襟や結び目の凹凸を均す(内側へは入れない)
        S = (R + np.roll(R, 1, 1) + np.roll(R, -1, 1)) / 3
        S[1:-1] = (S[1:-1] + S[:-2] + S[2:]) / 3
        R = np.maximum(R, S)
    bm = bmesh.new(); grid = []; cut = set()
    for i in range(rings + 1):
        z = z0 + (z1 - z0) * i / rings; row = []
        for k in range(segs):
            a = math.tau * k / segs; r = R[i, k] + offset
            p = Vector((math.sin(a) * r, cy - math.cos(a) * r, z))
            v = bm.verts.new(p)
            if xmax is not None and abs(p.x) > xmax: cut.add(v)
            row.append(v)
        grid.append(row)
    edge = set()
    for i in range(rings):
        for k in range(segs):
            q = [grid[i][k], grid[i][(k + 1) % segs], grid[i + 1][(k + 1) % segs], grid[i + 1][k]]
            if all(v in cut for v in q): continue
            f = bm.faces.new(q); f.smooth = True
    for v in cut: v.co.x = math.copysign(xmax, v.co.x)        # 腕の穴の切り口をまっすぐにそろえる(階段状にしない)
    bm.normal_update()
    if trim:
        for f in bm.faces:
            if any(e.is_boundary for e in f.edges): f.material_index = 1
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    m2 = bpy.data.meshes.new(name); bm.to_mesh(m2); bm.free()
    ob = bpy.data.objects.new(name, m2); (coll or body.users_collection[0]).objects.link(ob)
    m2.materials.append(mat)
    if trim: m2.materials.append(trim)
    m2.uv_layers.new(name='UVMap')
    if thick:
        md = ob.modifiers.new('solid', 'SOLIDIFY'); md.thickness = thick; md.offset = 1.0
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.object.modifier_apply(modifier=md.name)
    bones = {g.index: g.name for g in body.vertex_groups if g.name in arm.data.bones}
    kd = kdtree.KDTree(len(vs))
    for i, p in enumerate(vs): kd.insert(p, i)
    kd.balance()
    for v in m2.vertices:
        acc = {}
        near = kd.find_n(v.co, 4)
        for _, i, dist in near:
            w = 1.0 / (dist + 1e-4)
            for g in me.vertices[i].groups:
                if g.group in bones: acc[bones[g.group]] = acc.get(bones[g.group], 0) + g.weight * w
        s = sum(acc.values()) or 1.0
        for n, w in acc.items():
            if w / s > 0.02: (ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)).add([v.index], w / s, 'REPLACE')
    return ob
