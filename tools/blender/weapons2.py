# 大太刀以外の武器(長槍・双剣・大槌・大戦斧・大鎌・双扇)
# 握る位置(右手)が原点、実寸メートル。X=刃の向き(振る方向)、Z=上。weapons.py から読み込む
import bpy, bmesh, math
import numpy as np
from mathutils import Vector
from weapons import Builder, image, mat, wrap_textures, blade_textures

def steel_tex(name='steel_col', seed=4):
    """鋼の地肌: 細い研ぎ目の筋と、わずかな曇り"""
    rng = np.random.default_rng(seed); w, h = 64, 256
    v = np.linspace(0, 1, h)[:, None]; u = np.linspace(0, 1, w)[None, :]
    g = 0.8 + 0.035 * np.sin(v * 60 + 2 * np.sin(u * 7)) + 0.025 * np.sin(u * 13 + v * 21) + 0.01 * rng.standard_normal((h, w))
    return image(name, np.clip(np.dstack([g * 0.96, g * 0.98, g * 1.02]), 0, 1))

def wood_tex(name, base, seed=5):
    """漆塗りの柄: 縦の木目がうっすら透ける"""
    rng = np.random.default_rng(seed); w, h = 64, 256
    v = np.linspace(0, 1, h)[:, None]; u = np.linspace(0, 1, w)[None, :]
    g = 1 + 0.12 * np.sin(u * 60 + 3 * np.sin(v * 9)) + 0.05 * rng.standard_normal((h, w))
    return image(name, np.clip(np.array(base)[None, None, :] * g[..., None], 0, 1))

def tex_mats():
    return dict(
        steel=mat('steel', rough=0.3, metal=0.6, tex=steel_tex()),
        dark=mat('dark_steel', (0.06, 0.065, 0.075), 0.35, 0.85),
        gold=mat('gold', (0.78, 0.55, 0.2), 0.28, 0.9),
        wood=mat('shaft', rough=0.38, tex=wood_tex('shaft_col', (0.16, 0.05, 0.04))),
        black=mat('shaft_black', rough=0.4, tex=wood_tex('shaft_black_col', (0.05, 0.045, 0.05), 6)),
    )

def wrap_mat():
    wc, wn = wrap_textures()
    return mat('tsuka', rough=0.7, tex=wc, nrm=wn)

def outward(P):
    """多角形(X,Z)の各頂点の外向き法線。向き(時計回り/反時計回り)は自動で判定"""
    n = len(P)
    area = sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1] for i in range(n))
    s = 1 if area > 0 else -1; out = []
    for i in range(n):
        a, b, c = P[i - 1], P[i], P[(i + 1) % n]
        e1 = Vector((b[0] - a[0], b[1] - a[1])).normalized(); e2 = Vector((c[0] - b[0], c[1] - b[1])).normalized()
        n1 = Vector((e1.y, -e1.x)) * s; n2 = Vector((e2.y, -e2.x)) * s
        m = n1 + n2; m = m.normalized() if m.length > 1e-6 else n1
        out.append(m / max(0.35, m.dot(n1)))                       # 角でも幅が一定になるよう伸ばす
    return out

def blade(B, P, t, w, m, y0=0.0, uv_s=0.6):
    """刃: 多角形 P(X,Z)を厚さ t の板にし、外周を幅 w で刃先(厚さ0)へ絞る"""
    bm = B.bm; si = B.slot(m); N = outward(P)
    F = [bm.verts.new((x, y0 - t / 2, z)) for x, z in P]; K = [bm.verts.new((x, y0 + t / 2, z)) for x, z in P]
    E = [bm.verts.new((x + nn.x * w, y0, z + nn.y * w)) for (x, z), nn in zip(P, N)]
    def face(vs):
        f = bm.faces.new(vs); f.material_index = si; f.smooth = False
        for l in f.loops: l[B.uv].uv = (l.vert.co.x * uv_s + 0.5, l.vert.co.z * uv_s * 0.5)
        return f
    face(F); face(K[::-1])
    n = len(P)
    for i in range(n):
        j = (i + 1) % n
        face([F[i], E[i], E[j], F[j]]); face([K[j], E[j], E[i], K[i]])

def shaft(B, z0, z1, r0, r1, m, n=14):
    B.lathe([(z0, r0), (z1, r1)], m, n=n)

def band(B, z, r, h, m, n=14):
    B.lathe([(z - h / 2, r * 0.92), (z - h / 2 + h * 0.2, r), (z + h / 2 - h * 0.2, r), (z + h / 2, r * 0.92)], m, n=n)

def cone(B, z0, z1, r, m, n=10):
    B.lathe([(z0, r), (z1, 0.0005)], m, n=n, cap_end=False)

def arc(cx, cz, r, a0, a1, n):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

def stud(B, m, c, d, r=0.026, h=0.06):
    """鋲・棘: c から向き d へ尖る六角錐"""
    bm = B.bm; si = B.slot(m)
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=0.0005, depth=h)
    q = Vector((0, 0, 1)).rotation_difference(d)
    for v in res['verts']: v.co = q @ (v.co + Vector((0, 0, h / 2))) + c
    for f in {f for v in res['verts'] for f in v.link_faces}: f.material_index = si

def spear():
    """十文字槍: 黒漆の長柄、真っ直ぐな穂先と左右に反り上がる鎌刃、赤い房"""
    B = Builder('spear'); M = tex_mats(); wrap = wrap_mat(); red = mat('tassel', (0.5, 0.04, 0.035), 0.8)
    shaft(B, -0.92, 1.42, 0.02, 0.019, M['black'])
    cone(B, -0.92, -1.06, 0.022, M['gold'])                                   # 石突
    B.lathe([(-0.18, 0.0215), (0.62, 0.0215)], wrap, n=14, cap_start=False, cap_end=False)   # 両手で握る所を巻く
    for z in (-0.19, 0.63, 1.0): band(B, z, 0.026, 0.03, M['gold'])
    B.lathe([(1.36, 0.022), (1.42, 0.028), (1.52, 0.026), (1.55, 0.016)], M['gold'], n=14)   # 口金
    B.lathe([(1.30, 0.03), (1.34, 0.05), (1.3, 0.075), (1.18, 0.085), (1.12, 0.0005)], red, n=12, cap_start=False, cap_end=False)   # 房
    blade(B, [(0, 1.54), (0.05, 1.6), (0.062, 1.8), (0.04, 2.04), (0, 2.24), (-0.04, 2.04), (-0.062, 1.8), (-0.05, 1.6)], 0.018, 0.01, M['steel'])
    for s in (1, -1):
        blade(B, [(s * 0.02, 1.6), (s * 0.19, 1.57), (s * 0.34, 1.65), (s * 0.42, 1.84), (s * 0.32, 1.73), (s * 0.18, 1.68), (s * 0.02, 1.7)], 0.016, 0.009, M['steel'])
    return B.finish()

def katana_blade(B, m, zb, ztip, w0, w1, t0, t1, sori, back, n=26):
    rings = []
    for i in range(n + 1):
        s = i / n; z = zb + (ztip - zb) * s; tipk = max(0.0, (s - 0.92) / 0.08)
        w = (w0 + (w1 - w0) * s) * (1 - tipk ** 1.6) + 0.0004; t = (t0 + (t1 - t0) * s) * (1 - 0.7 * tipk); b = back - sori * s ** 1.8
        xs = b + w * 0.38
        rings.append([Vector((b + w, 0, z)), Vector((xs, t / 2, z)), Vector((b + w * 0.02, t * 0.36, z)), Vector((b, 0, z)), Vector((b + w * 0.02, -t * 0.36, z)), Vector((xs, -t / 2, z))])
    B.loft(rings, m, uvs=[1.0, 0.38, 0.03, 0.0, 0.03, 0.38, 1.0], cap_start=False, cap_end=True, smooth=False)

def twin():
    """双剣(忍び刀): 柄巻き、黒い角鍔、わずかに反った片刃"""
    B = Builder('twin'); M = tex_mats(); wrap = wrap_mat()
    st = mat('blade', rough=0.16, metal=0.9, tex=blade_textures(3))
    B.lathe([(-0.13, 0.012), (-0.125, 0.018), (-0.1, 0.019)], M['gold'], n=16, ry_k=0.72)
    B.lathe([(-0.1, 0.017), (0.0, 0.0165), (0.08, 0.017)], wrap, n=16, ry_k=0.7, cap_start=False, cap_end=False)
    B.lathe([(0.08, 0.019), (0.095, 0.02)], M['gold'], n=16, ry_k=0.72)
    sq = lambda z, r: [Vector((r * 1.15 * math.cos(math.tau * k / 4 + math.pi / 4), r * 0.9 * math.sin(math.tau * k / 4 + math.pi / 4), z)) for k in range(4)]
    B.loft([sq(0.095, 0.02), sq(0.095, 0.05), sq(0.103, 0.05), sq(0.103, 0.02)], M['dark'], cap_start=False, cap_end=False, smooth=False)
    B.lathe([(0.103, 0.017), (0.125, 0.016)], M['gold'], n=12, ry_k=0.6)
    katana_blade(B, st, 0.125, 0.84, 0.036, 0.03, 0.009, 0.006, 0.03, -0.017)
    return B.finish()

def hammer():
    """大槌: 八角の鉄の頭、金の帯、打撃面の鋲、頭頂の突起、長い柄"""
    B = Builder('hammer'); M = tex_mats(); wrap = wrap_mat()
    shaft(B, -0.5, 1.2, 0.03, 0.028, M['wood'])
    B.lathe([(-0.1, 0.032), (0.62, 0.032)], wrap, n=16, cap_start=False, cap_end=False)
    B.lathe([(-0.56, 0.03), (-0.54, 0.045), (-0.48, 0.045), (-0.46, 0.032)], M['gold'], n=14)
    for z in (-0.11, 0.63, 0.95, 1.08): band(B, z, 0.037, 0.035, M['gold'])
    zc = 1.36
    def octr(x, hy, hz):
        return [Vector((x, hy * max(-1, min(1, math.cos(math.tau * k / 8 + math.pi / 8) / 0.92)), zc + hz * max(-1, min(1, math.sin(math.tau * k / 8 + math.pi / 8) / 0.92)))) for k in range(8)]
    prof = [(-0.33, 0.13, 0.15), (-0.31, 0.17, 0.19), (-0.27, 0.17, 0.19), (-0.255, 0.16, 0.18), (0.255, 0.16, 0.18), (0.27, 0.17, 0.19), (0.31, 0.17, 0.19), (0.33, 0.13, 0.15)]
    B.loft([octr(*p) for p in prof], M['dark'], smooth=False)
    for x in (-0.29, 0.29, -0.06, 0.06):                               # 打撃面の縁と、中央の帯(金)
        B.loft([octr(x - 0.012, 0.174, 0.194), octr(x + 0.012, 0.174, 0.194)], M['gold'], cap_start=False, cap_end=False, smooth=False)
    B.lathe([(zc + 0.17, 0.05), (zc + 0.21, 0.04), (zc + 0.42, 0.0005)], M['steel'], n=8, cap_end=False)   # 頭頂の突起
    for sx in (1, -1):
        for dy, dz in ((0.08, 0.09), (-0.08, 0.09), (0.08, -0.09), (-0.08, -0.09)):
            stud(B, M['steel'], Vector((sx * 0.33, dy, zc + dz)), Vector((sx, 0, 0)))
    return B.finish()

def axe():
    """大戦斧: 三日月の大刃と背の嘴、頭頂の槍先、黒漆の柄"""
    B = Builder('axe'); M = tex_mats()
    shaft(B, -0.55, 1.62, 0.029, 0.027, M['black'])
    B.lathe([(-0.6, 0.03), (-0.58, 0.044), (-0.53, 0.044), (-0.51, 0.03)], M['gold'], n=14)
    for z in (-0.02, 0.1, 0.22, 0.62): band(B, z, 0.035, 0.03, M['gold'])
    B.lathe([(0.92, 0.045), (0.96, 0.055), (1.48, 0.055), (1.52, 0.045)], M['dark'], n=12)   # 斧頭の取り付け
    blade(B, [(0.04, 0.98)] + arc(0.18, 1.22, 0.47, -62, 62, 12) + [(0.04, 1.46)], 0.03, 0.022, M['steel'])
    blade(B, [(-0.03, 1.3), (-0.3, 1.25), (-0.4, 1.2), (-0.3, 1.16), (-0.03, 1.12)], 0.028, 0.012, M['steel'])
    blade(B, [(0, 1.6), (0.04, 1.66), (0, 1.86), (-0.04, 1.66)], 0.03, 0.01, M['steel'])
    return B.finish()

def scythe():
    """大鎌: 黒い長柄の先から、大きく弧を描いて垂れる刃"""
    B = Builder('scythe'); M = tex_mats(); wrap = wrap_mat()
    shaft(B, -0.82, 1.6, 0.023, 0.026, M['black'])
    cone(B, -0.82, -1.0, 0.026, M['steel'])
    B.lathe([(-0.12, 0.027), (0.62, 0.027)], wrap, n=14, cap_start=False, cap_end=False)
    for z in (-0.13, 0.63, 1.2): band(B, z, 0.033, 0.03, M['gold'])
    B.lathe([(1.4, 0.03), (1.44, 0.042), (1.62, 0.042), (1.66, 0.03)], M['gold'], n=14)       # 刃の付け根
    blade(B, arc(0.0, 0.62, 1.0, 96, 4, 16) + [(1.12, 0.5)] + arc(0.0, 0.7, 0.8, 6, 100, 16), 0.02, 0.016, M['steel'])
    blade(B, [(0, 1.62), (0.035, 1.68), (0, 1.82), (-0.035, 1.68)], 0.022, 0.008, M['steel'])
    return B.finish()

def fan():
    """鉄扇: 鋼の親骨に刃、翠の絹張り、金の要"""
    B = Builder('fan'); M = tex_mats(); bm = B.bm
    silk = mat('silk', (0.08, 0.42, 0.3), 0.6); edge = mat('silk_edge', (0.72, 0.52, 0.18), 0.4, 0.6)
    R, r0, a0, a1, n = 0.6, 0.2, 30, 150, 24
    pt = lambda rr, i, dy: bm.verts.new((rr * math.cos(math.radians(a0 + (a1 - a0) * i / n)), dy * (1 if i % 2 else -1), rr * math.sin(math.radians(a0 + (a1 - a0) * i / n))))
    rows = [[pt(r0, i, 0.007) for i in range(n + 1)], [pt(R * 0.93, i, 0.007) for i in range(n + 1)], [pt(R, i, 0.004) for i in range(n + 1)]]
    for k, m in ((0, silk), (1, edge)):                                 # 絹の面(折り目ごとに前後へずらした蛇腹)と金の縁
        si = B.slot(m)
        for i in range(n):
            f = bm.faces.new([rows[k][i], rows[k][i + 1], rows[k + 1][i + 1], rows[k + 1][i]]); f.material_index = si; f.smooth = False
            for l in f.loops: l[B.uv].uv = (i / n, k * 0.5)
    for i in range(0, n + 1, 2):                                        # 骨: 両端の親骨は太く刃付き
        a = math.radians(a0 + (a1 - a0) * i / n); d = (math.cos(a), math.sin(a)); nr = (-d[1], d[0])
        big = i in (0, n); wd = 0.02 if big else 0.008; L = R + (0.07 if big else 0.0); ext = 0.08 if big else 0.01
        P = [(nr[0] * wd, nr[1] * wd), (d[0] * L + nr[0] * wd * 0.6, d[1] * L + nr[1] * wd * 0.6), (d[0] * (L + ext), d[1] * (L + ext)),
             (d[0] * L - nr[0] * wd * 0.6, d[1] * L - nr[1] * wd * 0.6), (-nr[0] * wd, -nr[1] * wd)]
        blade(B, P, 0.012 if big else 0.006, 0.006 if big else 0.002, M['steel'] if big else M['dark'])
    B.lathe([(-0.025, 0.03), (0.025, 0.03)], M['gold'], n=12)           # 要(かなめ)
    B.lathe([(-0.15, 0.016), (-0.025, 0.02)], M['black'], n=10)         # 持ち手
    return B.finish()

MAKERS = {'spear': spear, 'twin': twin, 'hammer': hammer, 'axe': axe, 'scythe': scythe, 'fan': fan}
