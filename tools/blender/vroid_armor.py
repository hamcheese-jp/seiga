# VRoidキャラ用の着せ替え鎧: vrm/<キャラ>.vrm の体の表面から、頭・胴・腕・足の部品を別々のファイル(.arm)に書き出す
#   blender -b --python tools/blender/vroid_armor.py -- reiga [セット名...]
# 出力: assets/armor/<キャラ>/<セット>_<部位>.arm (ゲーム側で同じ名前の骨に結び付けて着せる)
import bpy, bmesh, sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import armor as A
from mathutils import Vector
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

def J(n, s=None): return f'J_Bip_{s.upper()}_{n}' if s else f'J_Bip_C_{n}'
TORSO = [J('Hips'), J('Spine'), J('Chest'), J('UpperChest'), J('Shoulder', 'l'), J('Shoulder', 'r')]
ARMS = [J(n, s) for s in 'lr' for n in ('UpperArm', 'LowerArm')]

# 鎧のセット: 色と重さ(heavy=1 で肩当てを増やし、肘当てを足す)
SETS = {
    'guren': dict(plate=(0.55, 0.045, 0.035), dark=(0.07, 0.07, 0.085), trim=(0.9, 0.64, 0.2), cloth=(0.6, 0.05, 0.04), heavy=0),
    'kurogane': dict(plate=(0.11, 0.115, 0.14), dark=(0.3, 0.31, 0.35), trim=(0.62, 0.65, 0.72), cloth=(0.08, 0.1, 0.28), heavy=1),
    # 蒼天: 青と銀の軽装。尖った肩当てと、額の立て物
    'souten': dict(plate=(0.1, 0.27, 0.68), dark=(0.62, 0.66, 0.74), trim=(0.88, 0.9, 0.96), cloth=(0.85, 0.87, 0.93), heavy=0, point=1, crest='fin'),
    # 黄金: 金と黒の最重装。五枚重ねの大肩当て、角付きの額当て、大盾
    'ougon': dict(plate=(0.82, 0.57, 0.13), dark=(0.055, 0.05, 0.05), trim=(0.97, 0.86, 0.5), cloth=(0.36, 0.03, 0.03), heavy=2, crest='horn'),
}

def spike(name, mat, bone, base, tip, r, coll, flat=1.0):
    """角・立て物: base から tip へ伸びる円錐(flat<1 で薄い板状)"""
    bm = bmesh.new(); n = 10
    ax = (tip - base); ln = ax.length; ax.normalize()
    u = ax.cross(Vector((0, 1, 0)));  u = u.normalized() if u.length > 1e-4 else Vector((1, 0, 0)); v = ax.cross(u)
    ring = [bm.verts.new(base + u * (r * math.cos(math.tau * i / n)) + v * (r * flat * math.sin(math.tau * i / n))) for i in range(n)]
    top = bm.verts.new(tip)
    for i in range(n): f = bm.faces.new([ring[i], ring[(i + 1) % n], top]); f.smooth = True
    bm.faces.new(ring[::-1])
    bm.normal_update()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    me.materials.append(mat); me.uv_layers.new(name='UVMap')
    ob.vertex_groups.new(name=bone).add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    return ob

def band(name, mat, trim, bone, c, rx, ry, z, h, coll, plate_w=0.5):
    """額当て: 頭を一周する帯と、額の金属板"""
    bm = bmesh.new(); n = 28; rows = []
    for dz in (-h / 2, h / 2):
        rows.append([bm.verts.new(Vector((c.x + rx * math.sin(math.tau * i / n), c.y - ry * math.cos(math.tau * i / n), z + dz - 0.012 * math.cos(math.tau * i / n)))) for i in range(n)])
    for i in range(n):
        f = bm.faces.new([rows[0][i], rows[0][(i + 1) % n], rows[1][(i + 1) % n], rows[1][i]]); f.smooth = True
    pr = []; angs = [plate_w * (t / 4 - 1) for t in range(9)]
    for dz in (-h * 0.95, h * 0.95):
        pr.append([bm.verts.new(Vector((c.x + rx * 1.06 * math.sin(a), c.y - ry * 1.06 * math.cos(a), z + dz * (1 - 0.35 * abs(a) / plate_w) - 0.012 * math.cos(a)))) for a in angs])
    for i in range(8):
        f = bm.faces.new([pr[0][i], pr[0][i + 1], pr[1][i + 1], pr[1][i]]); f.smooth = True; f.material_index = 1
    bm.normal_update()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    me.materials.append(mat); me.materials.append(trim)
    md = ob.modifiers.new('solid', 'SOLIDIFY'); md.thickness = 0.005; md.offset = 1.0
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=md.name)
    me.uv_layers.new(name='UVMap')
    ob.vertex_groups.new(name=bone).add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    return ob

def export_arm(ob, path):
    """軽い独自形式(.arm)で書き出す: [JSONの長さ u32][JSON][バイナリ]。座標はglTFと同じ Y上・Z手前"""
    import json, struct
    import numpy as np
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free(); me.update()
    nv = len(me.vertices)
    pos = np.array([(v.co.x, v.co.z, -v.co.y) for v in me.vertices], np.float32)
    nrm = np.array([(v.normal.x, v.normal.z, -v.normal.y) for v in me.vertices], np.float32)
    names = []; ji = np.zeros((nv, 4), np.uint8); jw = np.zeros((nv, 4), np.float32)
    for v in me.vertices:
        gs = sorted(((g.weight, ob.vertex_groups[g.group].name) for g in v.groups if g.weight > 0), reverse=True)[:4]
        for k, (w, n) in enumerate(gs):
            if n not in names: names.append(n)
            ji[v.index, k] = names.index(n); jw[v.index, k] = w
    jw /= np.maximum(jw.sum(1, keepdims=True), 1e-6)
    mats, groups, idx = [], [], []
    for mi, m in enumerate(me.materials):
        tris = [list(p.vertices) for p in me.polygons if p.material_index == mi]
        if not tris: continue
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        groups.append({'mat': len(mats), 'start': len(idx), 'count': len(tris) * 3})
        mats.append({'name': m.name.split('.')[0], 'color': [round(c, 4) for c in b.inputs['Base Color'].default_value[:3]], 'rough': round(b.inputs['Roughness'].default_value, 3), 'metal': round(b.inputs['Metallic'].default_value, 3)})
        for t in tris: idx += t
    blob = pos.tobytes() + np.clip(np.round(nrm * 127), -127, 127).astype(np.int8).tobytes() + b'\0' * ((-nv * 3) % 4)
    blob += ji.tobytes() + np.round(jw * 255).astype(np.uint8).tobytes() + np.array(idx, np.uint16 if nv < 65536 else np.uint32).tobytes()
    js = json.dumps({'v': 1, 'nv': nv, 'ni': len(idx), 'bones': names, 'mats': mats, 'groups': groups}, separators=(',', ':')).encode('utf8')
    js += b' ' * ((-len(js)) % 4)
    with open(path, 'wb') as f: f.write(struct.pack('<I', len(js)) + js + blob)

def build(hero, set_id):
    S = SETS[set_id]
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.vrm(filepath=os.path.join(ROOT, 'vrm', hero + '.vrm'))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    body = bpy.data.objects['Body']; face = bpy.data.objects['Face']
    coll = body.users_collection[0]
    B = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
    skin = [i for i, m in enumerate(body.data.materials) if 'SKIN' in m.name]
    plate = A.material('plate', S['plate'], 0.35, 0.3); dark = A.material('dark', S['dark'], 0.4, 0.5)
    trim = A.material('trim', S['trim'], 0.3, 0.7); cloth = A.material('cloth', S['cloth'], 0.8)
    leather = A.material('leather', (0.1, 0.06, 0.04), 0.6)
    lx = 1 if B[J('UpperArm', 'l')].x > 0 else -1                 # 左が +X か
    sh, el, wr = (Vector((abs(B[J(n, 'l')].x), B[J(n, 'l')].y, B[J(n, 'l')].z)) for n in ('UpperArm', 'LowerArm', 'Hand'))
    kn, an = B[J('LowerLeg', 'l')], B[J('Foot', 'l')]
    waist = B[J('Spine')].z + 0.03; neck = B[J('Neck')]; hv = S['heavy']
    P = dict(slots=skin, min_w=0.9)
    PB = dict(slots=[i for i, m in enumerate(body.data.materials) if 'HAIR' not in m.name], min_w=0.9)   # 胴は服の上から覆う
    main = plate if hv else dark
    out = {}
    # ── 胴: 胸当て・肩当て・帯・草摺
    cy = B[J('Chest')].y
    o = [A.wrap(body, arm, 'cuirass', main, cy, waist + 0.02, neck.z - 0.025, offset=0.012, xmax=sh.x - 0.035, rings=22, segs=44, thick=0.006, trim=trim, coll=coll),
         A.wrap(body, arm, 'belt', leather, cy, waist - 0.03, waist + 0.035, offset=0.02, rings=3, segs=40, thick=0.006, trim=trim, coll=coll)]
    # 胸の飾り金具: 胸当ての一番前に出ている所へ付ける
    cu = o[0]; cz = B[J('UpperChest')].z + 0.02
    front = [v.co for v in cu.data.vertices if abs(v.co.x) < 0.035 and abs(v.co.z - cz) < 0.04]
    if front:
        fy = min(v.y for v in front)
        o.append(A.shell('emblem', trim, J('UpperChest'), Vector((0, fy + 0.004, cz)), 0.04 + 0.008 * hv, scale=(1, 1, 0.45), rot=(math.pi / 2, 0, 0), cap=0.5, thick=0.003, coll=coll))
        o.append(A.shell('emblem_gem', cloth, J('UpperChest'), Vector((0, fy - 0.006, cz)), 0.018, scale=(1, 1, 0.8), rot=(math.pi / 2, 0, 0), cap=0.5, thick=0.002, coll=coll))
    pt = S.get('point', 0)
    for s in 'lr':
        sx = lx if s == 'l' else -lx
        p = Vector((sx * sh.x, sh.y, sh.z)); k = 1.0 + 0.16 * hv
        for i, (dx, dz, r, tilt) in enumerate(((-0.01, 0.035, 0.1, 0.2), (0.05, 0.012, 0.094, 0.7), (0.1, -0.02, 0.086, 1.05), (0.14, -0.05, 0.078, 1.3))[:3 + hv]):
            o.append(A.shell(f'pauldron_{s}{i}', plate, J('UpperArm', s) if i else J('Shoulder', s), p + Vector((sx * dx, 0.005, dz)), r * k,
                             scale=(1.3, 0.95, 0.5) if pt else (1.0, 1.08, 0.6), rot=(0, sx * (tilt - 0.35 * pt), 0), cap=0.5 - 0.05 * i, trim=trim, coll=coll))
        if pt: o.append(spike('pauldron_tip_' + s, trim, J('Shoulder', s), p + Vector((sx * 0.02, 0, 0.07)), p + Vector((sx * 0.2, 0.01, 0.16)), 0.028, coll, flat=0.5))
    hz = waist - 0.02; hipw = abs(B[J('UpperLeg', 'l')].x) + 0.085
    def hang(name, ang, bone, mat, ln, wd):
        a = math.radians(ang); nn = Vector((-math.sin(a), -math.cos(a), 0))
        base = Vector((-math.sin(a) * hipw, -math.cos(a) * hipw * 0.72 + B[J('Hips')].y, hz))
        pts = [(base + nn * (0.006 * t) + Vector((0, 0, -ln * t / 5)), (nn + Vector((0, 0, 0.22))).normalized()) for t in range(6)]
        bw = [(bone, 0.6), (J('Hips'), 0.4)] if bone != J('Hips') else [(bone, 1.0)]
        o.append(A.plate(name, mat, bw, pts, wd, trim=trim, coll=coll))
    for ang in (48, 100, 148):
        hang(f'tasset_l{ang}', -ang * lx, J('UpperLeg', 'l'), plate, 0.26 + 0.04 * hv, [0.11, 0.12, 0.125, 0.125, 0.12, 0.105])
        hang(f'tasset_r{ang}', ang * lx, J('UpperLeg', 'r'), plate, 0.26 + 0.04 * hv, [0.11, 0.12, 0.125, 0.125, 0.12, 0.105])
    hang('tabard_f', 0, J('Hips'), cloth, 0.42, [0.15, 0.145, 0.14, 0.135, 0.13, 0.1])
    hang('tabard_b', 180, J('Hips'), cloth, 0.46, [0.18, 0.18, 0.175, 0.17, 0.16, 0.13])
    out['body'] = o
    # ── 腕: 籠手(重装は肘当ても)
    o = []
    for s in 'lr':
        sx = lx if s == 'l' else -lx
        o.append(A.piece(body, arm, 'bracer_' + s, [J('LowerArm', s), J('UpperArm', s), J('Hand', s)], main, offset=0.013, smooth=4, thick=0.005, rigid=J('LowerArm', s), trim=trim,
                         planes=[(Vector((sx * (el.x + 0.03), 0, 0)), -X * sx), (Vector((sx * (wr.x - 0.012), 0, 0)), X * sx)], **P))
        if hv: o.append(A.shell('elbow_' + s, plate, J('LowerArm', s), Vector((sx * el.x, el.y + 0.03, el.z)), 0.055, scale=(1.1, 0.7, 1), rot=(-1.4, 0, 0), cap=0.42, trim=trim, coll=coll))
    out['arms'] = o
    # ── 足: 脛当てと膝当て
    o = []
    for s in 'lr':
        sx = lx if s == 'l' else -lx
        k = Vector((sx * abs(kn.x), kn.y, kn.z))
        o.append(A.piece(body, arm, 'greave_' + s, [J('LowerLeg', s), J('UpperLeg', s), J('Foot', s)], main, offset=0.018, smooth=5, thick=0.005, rigid=J('LowerLeg', s), trim=trim,
                         planes=[(Vector((0, 0, kn.z - 0.04)), Z), (Vector((0, 0, an.z + 0.13)), -Z)], **P))
        o.append(A.shell('knee_' + s, plate, J('LowerLeg', s), k + Vector((0, -0.03, 0.0)), 0.064 + 0.008 * hv, scale=(1, 0.7, 1.2), rot=(1.35, 0, 0), cap=0.42, trim=trim, coll=coll))
    out['legs'] = o
    # ── 頭: 額当て
    fb = [face.matrix_world @ Vector(c) for c in face.bound_box]
    fx = [v.x for v in fb]; fy = [v.y for v in fb]; fz = [v.z for v in fb]
    c = Vector(((min(fx) + max(fx)) / 2, (min(fy) + max(fy)) / 2 + 0.01, 0))
    hrx, hry, hz2 = (max(fx) - min(fx)) / 2 * 0.9 + 0.006, (max(fy) - min(fy)) / 2 + 0.022, max(fz) - 0.062
    out['head'] = [band('band', cloth, plate if hv else trim, J('Head'), c, hrx, hry, hz2, 0.022, coll)]
    fc = Vector((c.x, c.y - hry * 1.06, hz2 - 0.012))                 # 額の正面
    if S.get('crest') == 'fin':      # 立て物: 額から上へ伸びる一枚の飾り
        out['head'].append(spike('crest', trim, J('Head'), fc + Vector((0, 0, 0.01)), fc + Vector((0, 0.03, 0.17)), 0.03, coll, flat=0.22))
    elif S.get('crest') == 'horn':   # 角: 左右へ跳ね上がる二本
        for sx in (-1, 1):
            out['head'].append(spike(f'horn{sx}', trim, J('Head'), fc + Vector((sx * 0.04, 0.012, 0.005)), fc + Vector((sx * 0.13, 0.05, 0.17)), 0.017, coll))
    # ── 盾: 左の前腕の外側に付ける(紅蓮=丸盾、黒鉄=縦長の大盾)
    sxl = lx; mid = Vector((sxl * (el.x + wr.x) / 2, el.y, el.z + 0.055))
    sc = (1.45 + 0.15 * hv, 0.95 + 0.08 * hv, 0.22) if hv else ((1.25, 0.8, 0.24) if pt else (1.0, 1.0, 0.25))
    out['shield'] = [A.shell('shield', plate, J('LowerArm', 'l'), mid, 0.2 if hv else 0.19, scale=sc, cap=0.5, segs=28, rings=6, thick=0.008, trim=trim, coll=coll),
                     A.shell('boss', trim, J('LowerArm', 'l'), mid + Vector((0, 0, 0.03)), 0.05, scale=(1, 1, 0.7), cap=0.5, thick=0.004, coll=coll)]
    # 部位ごとに一つにまとめて書き出す
    d = os.path.join(ROOT, 'assets', 'armor', hero); os.makedirs(d, exist_ok=True)
    for slot, objs in out.items():
        ob = A.join(objs, f'{set_id}_{slot}', arm)
        path = os.path.join(d, f'{set_id}_{slot}.arm')
        export_arm(ob, path)
        print('SAVED', path, len(ob.data.vertices), os.path.getsize(path))
        bpy.data.objects.remove(ob, do_unlink=True)

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    for sid in (args[1:] or list(SETS)): build(args[0], sid)
