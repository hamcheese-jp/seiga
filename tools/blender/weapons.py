# 武器を一から作って GLB に書き出す。 blender -b --python tools/blender/weapons.py -- sword 出力先.glb
# 置き方はゲームの決まりに合わせる: 柄が下・刃先が上(BlenderのZ=glTFのY)、刃の幅がX方向
import bpy, bmesh, math, sys
import numpy as np
from mathutils import Vector

def image(name, px, color=True):
    h, w = px.shape[:2]
    im = bpy.data.images.new(name, w, h, alpha=False)
    if not color: im.colorspace_settings.name = 'Non-Color'
    rgba = np.dstack([px, np.ones((h, w, 1))]).astype(np.float32) if px.shape[2] == 3 else px.astype(np.float32)
    im.pixels = rgba[::-1].ravel(); im.pack()
    return im

def normal_from_height(hgt, s):
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * s; dy = (np.roll(hgt, 1, 0) - np.roll(hgt, -1, 0)) * s
    n = np.dstack([-dx, -dy, np.ones_like(hgt)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5

def mat(name, color=(1, 1, 1), rough=0.5, metal=0.0, tex=None, nrm=None, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = tex; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if nrm:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = nrm; nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = 1.0
    return m

class Builder:
    def __init__(self, name):
        self.bm = bmesh.new(); self.uv = self.bm.loops.layers.uv.new('UVMap'); self.mats = []; self.name = name
    def slot(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)
    def loft(self, rings, m, uvs=None, cap_start=True, cap_end=True, smooth=True, vspan=(0, 1), sharp=()):
        """輪(頂点の並び)を順につないで筒にする。uvs[k] は輪の頂点 k の横位置(0..1)"""
        bm = self.bm; si = self.slot(m); n = len(rings[0])
        vr = [[bm.verts.new(p) for p in r] for r in rings]
        us = uvs or [k / n for k in range(n + 1)]
        for i in range(len(vr) - 1):
            v0 = vspan[0] + (vspan[1] - vspan[0]) * i / (len(vr) - 1); v1 = vspan[0] + (vspan[1] - vspan[0]) * (i + 1) / (len(vr) - 1)
            for k in range(n):
                k2 = (k + 1) % n
                f = bm.faces.new([vr[i][k], vr[i][k2], vr[i + 1][k2], vr[i + 1][k]]); f.material_index = si; f.smooth = smooth and k not in sharp
                for l, (u, v) in zip(f.loops, ((us[k], v0), (us[k + 1], v0), (us[k + 1], v1), (us[k], v1))): l[self.uv].uv = (u, v)
        for ring, on, flip in ((vr[0], cap_start, True), (vr[-1], cap_end, False)):
            if on:
                f = bm.faces.new(ring[::-1] if flip else ring); f.material_index = si
                for l in f.loops: l[self.uv].uv = (0.5, 0.5)
    def ring(self, z, rx, ry=None, n=20, cx=0.0, cy=0.0, rot=0.0):
        ry = rx if ry is None else ry
        return [Vector((cx + rx * math.cos(rot + math.tau * k / n), cy + ry * math.sin(rot + math.tau * k / n), z)) for k in range(n)]
    def lathe(self, profile, m, n=20, ry_k=1.0, **kw):
        """(高さ, 半径) の並びを回して壺や輪を作る"""
        self.loft([self.ring(z, r, r * ry_k, n) for z, r in profile], m, **kw)
    def finish(self):
        me = bpy.data.meshes.new(self.name); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for m in self.mats: me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me); bpy.context.scene.collection.objects.link(ob)
        return ob

def blade_textures(seed=2):
    """刀身: 刃文(刃ぎわの白い波)と鎬の筋。U=棟→刃、V=根元→切先"""
    w, h = 64, 512
    rng = np.random.default_rng(seed)
    u = np.linspace(0, 1, w)[None, :]; v = np.linspace(0, 1, h)[:, None]
    wave = 0.78 + 0.035 * np.sin(v * 70) + 0.02 * np.sin(v * 173 + 1) + 0.012 * np.sin(v * 311 + 2)
    ham = np.clip((u - wave) / 0.03, 0, 1)                       # 刃文より刃側が白く冴える
    grain = 0.03 * np.sin(v * 900 + 6 * np.sin(u * 9)) * (1 - ham)
    base = 0.50 + grain + 0.34 * ham + 0.05 * np.clip((0.4 - u) / 0.4, 0, 1)
    col = np.dstack([base * 0.97, base * 0.99, base * 1.03])
    return image('blade_col', np.clip(col, 0, 1) * np.ones((h, w, 3)))

def wrap_textures():
    """柄巻き: 紅の組紐が菱形に交差し、すき間から白い鮫皮がのぞく"""
    w, h = 128, 512
    y, x = np.mgrid[0:h, 0:w]; u = x / w; v = y / h
    nu, nv = 2, 13                                                 # 菱の数(周方向, 縦)
    a = (u * nu + v * nv) % 1.0; b = (u * nu - v * nv) % 1.0
    da = np.abs(a - 0.5) * 2; db = np.abs(b - 0.5) * 2             # 0=帯の中心
    band_a = da < 0.72; band_b = db < 0.72
    over = ((np.floor(u * nu + v * nv) + np.floor(u * nu - v * nv)) % 2 == 0)
    cord = band_a | band_b
    top_a = band_a & (~band_b | over)
    hgt = np.where(cord, 0.6 + 0.4 * np.cos(np.where(top_a, da, db) * math.pi / 1.44), 0.0)
    hgt += np.where(cord, 0.06 * np.sin((np.where(top_a, a, b)) * 60 + (u + v) * 400), 0.05 * np.sin(u * 700) * np.sin(v * 2800))
    red = np.array([0.36, 0.035, 0.03]); skin = np.array([0.78, 0.74, 0.66])
    shade = (0.55 + 0.45 * np.clip(hgt, 0, 1))[..., None]
    col = np.where(cord[..., None], red[None, None, :] * shade, skin[None, None, :] * (0.8 + 0.2 * np.sin(u * 700)[..., None] * np.sin(v * 2800)[..., None]))
    return image('wrap_col', np.clip(col, 0, 1)), image('wrap_nrm', normal_from_height(hgt, 5.0), color=False)

def sword():
    """大太刀: 全長1.36m。下端から 0.136m が握りの中心(DEF.sword.grip=0.1)"""
    B = Builder('sword')
    steel = mat('blade', rough=0.16, metal=0.9, tex=blade_textures())
    wc, wn = wrap_textures()
    wrap = mat('tsuka', rough=0.7, tex=wc, nrm=wn)
    gold = mat('gold', (0.78, 0.55, 0.2), 0.28, 0.9)
    iron = mat('iron', (0.045, 0.045, 0.05), 0.42, 0.75)
    red = mat('lacquer', (0.4, 0.03, 0.03), 0.3, 0.2)
    z0, zt = 0.0, 0.30                                             # 柄の下端 / 鍔の位置
    # 柄頭 → 柄 → 縁金
    B.lathe([(z0, 0.014), (z0 + 0.004, 0.0225), (z0 + 0.03, 0.0235), (z0 + 0.034, 0.0225)], gold, n=20, ry_k=0.72)
    B.lathe([(z0 + 0.034, 0.021), (z0 + 0.1, 0.0198), (z0 + 0.2, 0.02), (zt - 0.03, 0.0215)], wrap, n=20, ry_k=0.7, cap_start=False, cap_end=False)
    B.lathe([(zt - 0.03, 0.0228), (zt - 0.007, 0.0235), (zt - 0.005, 0.023)], gold, n=20, ry_k=0.72)
    # 鍔: 木瓜形(四つの丸みを持つ)。縁は金
    def tsuba_ring(z, r):
        return [Vector((r * (1 + 0.09 * math.cos(4 * (math.tau * k / 40))) * math.cos(math.tau * k / 40), r * 0.86 * (1 + 0.09 * math.cos(4 * (math.tau * k / 40))) * math.sin(math.tau * k / 40), z)) for k in range(40)]
    B.loft([tsuba_ring(zt - 0.005, 0.02), tsuba_ring(zt - 0.005, 0.06), tsuba_ring(zt - 0.003, 0.064)], iron, cap_start=False, cap_end=False)
    B.loft([tsuba_ring(zt - 0.003, 0.064), tsuba_ring(zt + 0.003, 0.064)], gold, cap_start=False, cap_end=False)
    B.loft([tsuba_ring(zt + 0.003, 0.064), tsuba_ring(zt + 0.005, 0.06), tsuba_ring(zt + 0.005, 0.02)], iron, cap_start=False, cap_end=False)
    # はばき(刀身の根元を締める金具)
    def section(z, w, t, back, ridge=0.38):
        """刀身の断面。X+ が刃。棟から鎬で一番厚く、刃へ向かって薄くなる"""
        xb = back; xe = back + w; xs = back + w * ridge
        return [Vector((xe, 0, z)), Vector((xs, t / 2, z)), Vector((xb + w * 0.02, t * 0.36, z)), Vector((xb, 0, z)), Vector((xb + w * 0.02, -t * 0.36, z)), Vector((xs, -t / 2, z))]
    uvs = [1.0, 0.38, 0.03, 0.0, 0.03, 0.38, 1.0]
    B.loft([section(zt + 0.004, 0.064, 0.017, -0.03), section(zt + 0.04, 0.062, 0.016, -0.029)], gold, cap_start=True, cap_end=True, smooth=False)
    # 刀身: ゆるい反り(棟側へ)。切先は棟へ向かって絞る
    zb, ztip = zt + 0.04, 1.36; N = 40; rings = []
    for i in range(N + 1):
        s = i / N; z = zb + (ztip - zb) * s
        sori = -0.055 * (s ** 1.8)                                 # 反り
        tipk = max(0.0, (s - 0.94) / 0.06)                         # 切先の絞り
        w = (0.058 - 0.012 * s) * (1 - tipk ** 1.6) + 0.0004
        t = (0.014 - 0.004 * s) * (1 - 0.7 * tipk)
        rings.append(section(z, w, t, -0.027 + sori))
    B.loft(rings, steel, uvs=uvs, cap_start=False, cap_end=True, smooth=False)
    return B.finish()

MAKERS = {'sword': sword}

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    ob = MAKERS[args[0]]()
    for o in bpy.data.objects: o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=args[1], export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_image_format='JPEG', export_jpeg_quality=85)
    print('SAVED', args[1], len(ob.data.vertices))
