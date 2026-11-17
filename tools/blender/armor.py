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

def piece(body, arm, name, groups, mat, planes=(), offset=0.01, smooth=0, thick=0.0, rigid=None, trim=None, trim_w=0.012, min_w=0.5, hull_z=None):
    """体の groups の領域を写し取って服や鎧の部品にする。planes=[(点, 法線)] は法線側を切り落とす"""
    ob = body.copy(); ob.data = body.data.copy(); ob.name = name
    body.users_collection[0].objects.link(ob)
    if ob.data.shape_keys: ob.shape_key_clear()
    ob.data.materials.clear(); ob.data.materials.append(mat)      # 面の材質番号を振る前に入れ替える(後で消すと番号が0に戻る)
    if trim: ob.data.materials.append(trim)
    w = _weights(ob, groups, arm)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if min(w[v.index] for v in f.verts) < min_w], context='FACES')
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
