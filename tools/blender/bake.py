# 仕上げ: 表情をシェイプキーに焼き、補助メッシュを消し、Tポーズを基準姿勢にして VRM 1.0 で書き出す
import bpy, bmesh, os, json, struct
from mathutils import Vector, Matrix, kdtree
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
from bl_ext.blender_org.mpfb.services.locationservice import LocationService
import hair as hairmod

UNIT_DIR = os.path.join(LocationService.get_mpfb_data('targets'), 'expression', 'units', 'caucasian')
L, R = 'left', 'right'
def both(name, w): return {name.replace('*', L): w, name.replace('*', R): w}
EXPRESSIONS = {
    'blink': {**both('eye-*-closure', 1.0)},
    'happy': {'mouth-corner-puller': 0.85, **both('eye-*-slit', 0.45), **both('eyebrows-*-up', 0.2)},
    'angry': {**both('eyebrows-*-down', 1.0), **both('nose-*-elevation', 0.6), 'mouth-compression': 0.5, 'mouth-depression': 0.4, **both('eye-*-slit', 0.3)},
    'sad': {**both('eyebrows-*-inner-up', 1.0), 'mouth-depression': 0.8, **both('eye-*-slit', 0.2)},
    'surprised': {**both('eyebrows-*-up', 1.0), **both('eye-*-opened-up', 1.0), 'mouth-open': 0.45},
    'aa': {'mouth-open': 0.9},
}
BONES = {  # VRM humanoid ← MPFB game_engine リグ
    'hips': 'pelvis', 'spine': 'spine_01', 'chest': 'spine_02', 'upperChest': 'spine_03', 'neck': 'neck_01', 'head': 'head',
    **{s + k: v + '_' + s[0] for s in ('left', 'right') for k, v in {
        'Shoulder': 'clavicle', 'UpperArm': 'upperarm', 'LowerArm': 'lowerarm', 'Hand': 'hand',
        'UpperLeg': 'thigh', 'LowerLeg': 'calf', 'Foot': 'foot', 'Toes': 'ball',
        'ThumbMetacarpal': 'thumb_01', 'ThumbProximal': 'thumb_02', 'ThumbDistal': 'thumb_03',
        **{f.capitalize() + p: f'{f}_0{i}' for f in ('index', 'middle', 'ring') for i, p in ((1, 'Proximal'), (2, 'Intermediate'), (3, 'Distal'))},
        **{'Little' + p: f'pinky_0{i}' for i, p in ((1, 'Proximal'), (2, 'Intermediate'), (3, 'Distal'))}}.items()},
}

def expression_coords(bm):
    """表情ごとの頂点位置(素体の全頂点)。戻り値: (基準, {名前: 位置})"""
    units = sorted({u for e in EXPRESSIONS.values() for u in e})
    for u in units: TargetService.load_target(bm, os.path.join(UNIT_DIR, u + '.target.gz'), weight=0.0, name='u_' + u)
    kb = bm.data.shape_keys.key_blocks
    base = hairmod.mixed_coords(bm); out = {}
    for name, ws in EXPRESSIONS.items():
        for u, w in ws.items(): kb['u_' + u].value = w
        out[name] = hairmod.mixed_coords(bm)
        for u in ws: kb['u_' + u].value = 0.0
    return base, out

def transfer(base, exprs, part, nbody=hairmod.BODY_VERTS):
    """素体の動きを、近くの頂点から眉・まつ毛・歯へ写す"""
    kd = kdtree.KDTree(nbody)
    for i in range(nbody): kd.insert(base[i], i)
    kd.balance()
    pc = [v.co.copy() for v in part.data.vertices]
    near = [kd.find_n(part.matrix_world @ c, 4) for c in pc]
    inv = part.matrix_world.inverted().to_3x3()
    res = {}
    for name, co in exprs.items():
        arr = []; mx = 0.0
        for c, nn in zip(pc, near):
            ws = [1.0 / (d + 1e-5) for _, _, d in nn]; s = sum(ws)
            dl = sum(((co[i] - base[i]) * w for (_, i, _), w in zip(nn, ws)), Vector()) / s
            mx = max(mx, dl.length); arr.append(c + inv @ dl)
        if mx > 1e-4: res[name] = arr
    return pc, res

def strip_helpers(bm):
    """補助メッシュ(関節の目印・服の当たり用)を消し、残した頂点の元番号を返す"""
    gi = bm.vertex_groups['body'].index
    keep = [v.index for v in bm.data.vertices if any(g.group == gi for g in v.groups)]
    ks = set(keep)
    b = bmesh.new(); b.from_mesh(bm.data)
    bmesh.ops.delete(b, geom=[v for v in b.verts if v.index not in ks], context='VERTS')
    b.to_mesh(bm.data); b.free()
    return keep

def t_pose(arm):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    aim = [(n + '_l', Vector((1, 0, 0))) for n in ('upperarm', 'lowerarm', 'hand')] + [(n + '_r', Vector((-1, 0, 0))) for n in ('upperarm', 'lowerarm', 'hand')] \
        + [(n + s, Vector((0, 0, -1))) for s in ('_l', '_r') for n in ('thigh', 'calf')]
    for name, tgt in aim:
        pb = arm.pose.bones[name]
        d = (pb.tail - pb.head).normalized()
        q = d.rotation_difference(tgt).to_matrix().to_4x4()
        pb.matrix = Matrix.Translation(pb.head) @ q @ Matrix.Translation(-pb.head) @ pb.matrix
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode='OBJECT')

def deformed(obj, coords):
    obj.data.vertices.foreach_set('co', [c for v in coords for c in v]); obj.data.update()
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    ev = obj.evaluated_get(dg).data
    assert len(ev.vertices) == len(coords), obj.name
    return [v.co.copy() for v in ev.vertices]

def finish(bm, arm, parts, exprs_for=('eyebrows', 'lashes', 'teeth')):
    base, ex = expression_coords(bm)
    sets = {}                                  # オブジェクト → (基準, {表情: 位置})
    for k in exprs_for:
        if k in parts: sets[parts[k]] = transfer(base, ex, parts[k])
    for k, o in parts.items():
        if o not in sets: sets[o] = ([v.co.copy() for v in o.data.vertices], {})
    bm.shape_key_clear()
    for m in list(bm.modifiers):
        if m.type != 'ARMATURE': bm.modifiers.remove(m)
    keep = strip_helpers(bm)
    sets[bm] = ([base[i] for i in keep], {n: [c[i] for i in keep] for n, c in ex.items()})
    t_pose(arm)
    done = {o: (deformed(o, b), {n: deformed(o, c) for n, c in e.items()}) for o, (b, e) in sets.items()}
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode='OBJECT')
    for o, (b, e) in done.items():
        o.data.vertices.foreach_set('co', [c for v in b for c in v])
        if e:
            o.shape_key_add(name='Basis')
            for n, c in e.items():
                sk = o.shape_key_add(name=n); sk.data.foreach_set('co', [x for v in c for x in v])
        o.data.update()
    return done

def setup_vrm(arm, meshes, name, author='hamcheese-jp'):
    ext = arm.data.vrm_addon_extension
    ext.spec_version = '1.0'
    v = ext.vrm1
    v.meta.vrm_name = name; a = v.meta.authors.add(); a.value = author
    hb = v.humanoid.human_bones
    for vb, bone in BONES.items():
        prop = ''.join('_' + c.lower() if c.isupper() else c for c in vb)
        getattr(hb, prop).node.bone_name = bone
    for n in EXPRESSIONS:
        e = getattr(v.expressions.preset, n)
        for o in meshes:
            if o.data.shape_keys and n in o.data.shape_keys.key_blocks:
                b = e.morph_target_binds.add(); b.node.mesh_object_name = o.name; b.index = n; b.weight = 1.0

def export_vrm(arm, path):
    for o in bpy.data.objects: o.select_set(False)
    r = bpy.ops.export_scene.vrm(filepath=path, armature_object_name=arm.name, ignore_warning=True)
    print('EXPORT', r, os.path.getsize(path) if os.path.exists(path) else None)

def patch_alpha(path, cutout=('hair', 'eyebrow', 'eyelash'), cutoff=0.35):
    """髪・眉・まつ毛は抜き(MASK)、それ以外は不透明にする"""
    d = open(path, 'rb').read()
    jl = struct.unpack_from('<I', d, 12)[0]
    j = json.loads(d[20:20 + jl].decode('utf8')); rest = d[20 + jl:]
    for m in j.get('materials', []):
        if any(k in m.get('name', '').lower() for k in cutout): m['alphaMode'] = 'MASK'; m['alphaCutoff'] = cutoff; m['doubleSided'] = True
        else: m.pop('alphaMode', None); m.pop('alphaCutoff', None)
    js = json.dumps(j, ensure_ascii=False, separators=(',', ':')).encode('utf8'); js += b' ' * (-len(js) % 4)
    out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + len(rest)) + struct.pack('<I', len(js)) + b'JSON' + js + rest
    open(path, 'wb').write(out)
    print('MATERIALS', [(m.get('name'), m.get('alphaMode', 'OPAQUE')) for m in j.get('materials', [])])
