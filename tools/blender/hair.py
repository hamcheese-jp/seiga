# 毛束(ヘアカード)で髪を一から組む。頭皮の頂点から毛束を生やし、流れと重力で垂らす。
import bpy, math, random
import numpy as np
from mathutils import Vector, kdtree

BODY_VERTS = 13380   # hm08: これより後ろは補助メッシュ

def mixed_coords(bm):
    sk = bm.shape_key_add(name='_mix', from_mix=True)
    co = [d.co.copy() for d in sk.data]
    bm.shape_key_remove(sk)
    return co

def strand_texture(name, base, hi, size=(256, 512), cols=4, seed=1):
    """毛束の絵: 縦の筋と先細りのアルファ。cols 種類を横に並べる"""
    rng = np.random.default_rng(seed)
    w, h = size; cw = w // cols
    img = np.zeros((h, w, 4), np.float32)
    v = np.linspace(0, 1, h)[:, None]           # 0=根元 1=毛先
    for c in range(cols):
        x = np.linspace(-1, 1, cw)[None, :]
        streak = np.zeros((1, cw), np.float32); tone = np.zeros((1, cw), np.float32)
        for _ in range(26):
            cx = rng.uniform(-0.95, 0.95); sw = rng.uniform(0.03, 0.09); g = np.exp(-((x - cx) / sw) ** 2)
            streak = np.maximum(streak, g * rng.uniform(0.75, 1.0)); tone += g * rng.uniform(-0.5, 0.9)
        tip = rng.uniform(0.55, 0.95, (1, cw)); tip = np.convolve(tip[0], np.ones(9) / 9, 'same')[None, :]
        edge = np.clip(1 - np.abs(x) ** 3, 0, 1)
        taper = np.clip((tip - v) / 0.3 + 1, 0, 1) * np.clip(1.25 - np.abs(x) * (0.35 + v * 1.1), 0, 1)
        a = np.clip(streak * 1.6, 0, 1) * edge * taper
        a = np.where(v < 0.3, np.maximum(a, np.clip(edge * 3, 0, 1)), a)   # 根元は詰まっている
        t = np.clip(0.45 + tone * 0.35 + v * 0.15, 0, 1)[..., None]
        col = np.array(base)[None, None, :] * (1 - t) + np.array(hi)[None, None, :] * t
        col = col * (0.55 + 0.45 * np.clip(streak, 0, 1))[..., None]
        img[:, c * cw:(c + 1) * cw, :3] = col; img[:, c * cw:(c + 1) * cw, 3] = a
    img[0:8, 0:8, :3] = np.array(base) * 1.6; img[0:8, 0:8, 3] = 1   # 下地用の塗りつぶし
    im = bpy.data.images.new(name, w, h, alpha=True)
    im.pixels = img[::-1].ravel(); im.pack()
    return im

def make_hair(bm, armature, base=(0.10, 0.06, 0.04), hi=(0.42, 0.30, 0.20), seed=7, style=None):
    st = dict(bang=-0.12, top=0.085, side=0.05, nape=0.035, lift=0.6, gravity=0.3, sweep=0.75, width=0.022, per=3, segs=6, cap=0.004)
    st.update(style or {})
    random.seed(seed)
    co = mixed_coords(bm)
    tmp = bm.data.copy(); tmp.vertices.foreach_set('co', [c for v in co for c in v]); tmp.update()
    nrm = [v.copy() for v in (Vector(n.vector) for n in tmp.vertex_normals)]
    gi = bm.vertex_groups['scalp'].index
    scalp = [v.index for v in bm.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)]
    zs = [co[i].z for i in scalp]; zmax, zmin = max(zs), min(zs)
    top = [co[i] for i in scalp if co[i].z > zmax - 0.012]
    crown = sum(top, Vector()) / len(top) + Vector((0, 0.035, 0))
    headv = [i for i in range(BODY_VERTS) if co[i].z > zmin - 0.09]
    kd = kdtree.KDTree(len(headv))
    for k, i in enumerate(headv): kd.insert(co[i], k)
    kd.balance()
    def push_out(q, margin):
        _, k, _ = kd.find(q); i = headv[k]; d = (q - co[i]).dot(nrm[i])
        return (q + nrm[i] * (margin - d) if d < margin else q), nrm[i]

    verts, faces, uvs = [], [], []
    # 頭皮を覆う下地(地肌が透けないように)
    sset = set(scalp); remap = {}
    for p in tmp.polygons:
        if all(v in sset for v in p.vertices):
            f = []
            for v in p.vertices:
                if v not in remap: remap[v] = len(verts); verts.append(co[v] + nrm[v] * st['cap'])
                f.append(remap[v])
            faces.append(f); uvs.append([(0.012, 0.992)] * len(f))
    N = st['segs']
    for i in scalp:
        for _ in range(st['per']):
            n = nrm[i]
            j = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * 0.007
            p = co[i] + j - n * j.dot(n)
            rad = p - crown; t = rad - n * rad.dot(n)
            if t.length < 0.012: t = Vector((random.uniform(-1, 1), random.uniform(-1, 0.2), 0))
            t.normalize()
            hgt = (p.z - zmin) / (zmax - zmin)                    # 0=襟足 1=頭頂
            front = max(0.0, min(1.0, (crown.y - p.y) / 0.11))    # 前髪ほど 1
            L = (st['nape'] + (st['side'] - st['nape']) * min(1, hgt * 2.2)) if hgt < 0.55 else (st['side'] + (st['top'] - st['side']) * ((hgt - 0.55) / 0.45))
            L *= (1 + st['bang'] * front) * random.uniform(0.78 - 0.3 * front, 1.18)
            sgn = 1.0 if p.x > -0.025 else -1.0                    # 分け目(少し左寄り)から左右へ流す
            t = (t + Vector((st['sweep'] * front * sgn, -0.15 * front, 0))).normalized()
            lift = st['lift'] * (0.25 + 0.75 * hgt) * random.uniform(0.7, 1.2)
            d = (n * lift + t).normalized()
            w0 = st['width'] * random.uniform(0.7, 1.25); tw = random.uniform(-0.5, 0.5)
            col = random.randrange(4); u0, u1 = col / 4 + 0.01, (col + 1) / 4 - 0.01
            q = p - n * 0.004; base_i = len(verts); step = L / N
            for s in range(N + 1):
                qq, sn = push_out(q, 0.004 + 0.012 * (s / N))
                side = d.cross(sn)
                if side.length < 1e-4: side = Vector((1, 0, 0))
                side.normalize(); side = (side * math.cos(tw) + sn * math.sin(tw)).normalized()
                w = w0 * (1 - 0.55 * (s / N) ** 1.5) / 2
                verts += [qq - side * w, qq + side * w]
                if s:
                    b = base_i + (s - 1) * 2
                    faces.append([b, b + 1, b + 3, b + 2])
                    v0, v1 = (s - 1) / N, s / N
                    uvs.append([(u0, 1 - v0), (u1, 1 - v0), (u1, 1 - v1), (u0, 1 - v1)])
                noise = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * 0.1
                d = (d + Vector((0, 0, -st['gravity'])) + t * 0.12 + noise).normalized()
                q = qq + d * step
    bpy.data.meshes.remove(tmp)
    me = bpy.data.meshes.new('hair'); me.from_pydata(verts, [], faces); me.update()
    uv = me.uv_layers.new(name='UVMap')
    k = 0
    for f in uvs:
        for c in f: uv.data[k].uv = c; k += 1
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(bm.name + '.hair', me); bm.users_collection[0].objects.link(ob)
    mat = bpy.data.materials.new('hair'); mat.use_nodes = True; nt = mat.node_tree
    bsdf = next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = strand_texture('hair_strands', base, hi, seed=seed)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.55
    mat.use_backface_culling = False
    try: mat.surface_render_method = 'DITHERED'
    except Exception: pass
    me.materials.append(mat)
    g = ob.vertex_groups.new(name='head'); g.add(list(range(len(verts))), 1.0, 'REPLACE')
    ob.parent = armature; m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = armature
    return ob
