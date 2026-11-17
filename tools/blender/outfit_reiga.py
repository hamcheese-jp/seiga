# レイガの装束: 黒の肌着、炭色のズボン、革の長靴と手袋、黒鉄の胴・籠手・脛当て、紅漆の肩当てと草摺、赤い襟巻きと前垂れ
import bpy, math
from mathutils import Vector
import armor as A
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

def dress(body, arm):
    B = {b.name: b.head_local.copy() for b in arm.data.bones}
    coll = body.users_collection[0]
    cloth = A.material('cloth_black', (0.022, 0.022, 0.027), 0.85, bump='cloth', scale=30)
    pants = A.material('cloth_charcoal', (0.06, 0.056, 0.065), 0.8, bump='cloth', scale=26)
    leather = A.material('leather', (0.07, 0.042, 0.03), 0.55, bump='leather', scale=28, strength=0.6)
    lacquer = A.material('lacquer_red', (0.36, 0.028, 0.025), 0.3, 0.3, bump='metal', scale=5, strength=0.15)
    steel = A.material('steel_black', (0.085, 0.09, 0.105), 0.36, 0.65, bump='metal', scale=5, strength=0.25)
    gold = A.material('gold', (0.72, 0.5, 0.17), 0.32, 0.7)
    red = A.material('cloth_red', (0.42, 0.03, 0.028), 0.78, bump='cloth', scale=24)

    sh, el, wr = B['upperarm_l'], B['lowerarm_l'], B['hand_l']
    kn, an = B['calf_l'], B['foot_l']
    waist = B['spine_01'].z + 0.02; neck = B['neck_01']
    R = lambda v: Vector((-v.x, v.y, v.z))
    arms = A.side(['upperarm', 'lowerarm'], 'l') + A.side(['upperarm', 'lowerarm'], 'r')
    legs = A.side(['thigh', 'calf'], 'l') + A.side(['thigh', 'calf'], 'r')
    out = []
    out.append(A.piece(body, arm, 'shirt', A.TORSO + arms + ['neck_01', 'hand_l', 'hand_r'], cloth, offset=0.004, smooth=1, min_w=0.9,
                       planes=[(Vector((wr.x - 0.01, 0, 0)), X), (Vector((-wr.x + 0.01, 0, 0)), -X), (Vector((0, 0, waist - 0.05)), -Z), (Vector((0, 0, neck.z + 0.025)), Z)]))
    out.append(A.piece(body, arm, 'pants', A.TORSO + legs + ['foot_l', 'foot_r'], pants, offset=0.016, smooth=10, min_w=0.9,
                       planes=[(Vector((0, 0, waist + 0.01)), Z), (Vector((0, 0, an.z + 0.12)), -Z)]))
    for s in ('l', 'r'):
        sx = 1 if s == 'l' else -1
        M = (lambda v: v) if s == 'l' else R
        out.append(A.piece(body, arm, 'boot_' + s, ['calf_' + s, 'foot_' + s, 'ball_' + s], leather, offset=0.012, smooth=3, thick=0.0,
                           planes=[(Vector((0, 0, an.z + 0.25)), Z)], min_w=0.9, hull_z=an.z + 0.02))
        out.append(A.piece(body, arm, 'glove_' + s, ['hand_' + s] + A.side(A.FINGERS, s) + ['lowerarm_' + s], leather, offset=0.0025, min_w=0.9,
                           planes=[(M(Vector((wr.x - 0.05, 0, 0))), -X * sx)]))
        out.append(A.piece(body, arm, 'bracer_' + s, ['lowerarm_' + s, 'upperarm_' + s, 'hand_' + s], steel, offset=0.011, smooth=4, thick=0.004, rigid='lowerarm_' + s, trim=gold, min_w=0.9,
                           planes=[(M(Vector((el.x + 0.035, 0, 0))), -X * sx), (M(Vector((wr.x - 0.012, 0, 0))), X * sx)]))
        out.append(A.piece(body, arm, 'greave_' + s, ['calf_' + s, 'thigh_' + s, 'foot_' + s], steel, offset=0.017, smooth=5, thick=0.004, rigid='calf_' + s, trim=gold, min_w=0.9,
                           planes=[(Vector((0, 0, kn.z - 0.045)), Z), (Vector((0, 0, an.z + 0.16)), -Z)]))
        k = M(kn)
        out.append(A.shell('knee_' + s, steel, 'calf_' + s, k + Vector((0, -0.022, 0.0)), 0.066, scale=(1, 0.7, 1.2), rot=(1.35, 0, 0), cap=0.42, trim=gold, coll=coll))
        p = M(sh)
        for i, (dx, dz, r, tilt) in enumerate(((-0.01, 0.04, 0.115, 0.2), (0.06, 0.012, 0.108, 0.7), (0.115, -0.025, 0.098, 1.05), (0.16, -0.06, 0.088, 1.3))):
            out.append(A.shell(f'pauldron_{s}{i}', lacquer, 'upperarm_' + s if i else 'clavicle_' + s, p + Vector((sx * dx, 0.005, dz)), r,
                               scale=(1.0, 1.08, 0.6), rot=(0, sx * tilt, 0), cap=0.5 - 0.05 * i, trim=gold, coll=coll))
    out.append(A.piece(body, arm, 'cuirass', A.TORSO + arms + ['neck_01'], steel, offset=0.02, smooth=14, thick=0.005, trim=gold, trim_w=0.014, min_w=0.9,
                       planes=[(Vector((0, 0, waist + 0.03)), -Z), (Vector((sh.x - 0.035, 0, 0)), X), (Vector((-sh.x + 0.035, 0, 0)), -X), (Vector((0, 0, neck.z - 0.03)), Z)]))
    out.append(A.piece(body, arm, 'belt', A.TORSO, leather, offset=0.027, smooth=12, thick=0.006, trim=gold, trim_w=0.006, min_w=0.9,
                       planes=[(Vector((0, 0, waist + 0.05)), Z), (Vector((0, 0, waist - 0.02)), -Z)]))
    hz = waist - 0.01
    def hang(name, ang, bone, mat, ln, wd, trim=gold, rx=0.19, ry=0.14):
        a = math.radians(ang); n = Vector((-math.sin(a), -math.cos(a), 0))
        base = Vector((-math.sin(a) * rx, -math.cos(a) * ry + 0.012, hz))
        pts = [(base + n * (0.006 * t) + Vector((0, 0, -ln * t / 5)), (n + Vector((0, 0, 0.22))).normalized()) for t in range(6)]
        bw = [(bone, 0.6), ('pelvis', 0.4)] if bone != 'pelvis' else [('pelvis', 1.0)]
        out.append(A.plate(name, mat, bw, pts, wd, trim=trim, coll=coll))
    for ang in (48, 100, 148):          # 脚の外側を守る紅漆の板(左右3枚ずつ)
        hang(f'tasset_l{ang}', -ang, 'thigh_l', lacquer, 0.3, [0.125, 0.135, 0.14, 0.14, 0.135, 0.12])
        hang(f'tasset_r{ang}', ang, 'thigh_r', lacquer, 0.3, [0.125, 0.135, 0.14, 0.14, 0.135, 0.12])
    hang('tabard_f', 0, 'pelvis', red, 0.46, [0.17, 0.165, 0.16, 0.155, 0.15, 0.12], rx=0.2, ry=0.155)   # 前垂れ
    hang('tabard_b', 180, 'pelvis', red, 0.5, [0.2, 0.2, 0.195, 0.19, 0.18, 0.15], rx=0.2, ry=0.15)
    out.append(A.piece(body, arm, 'scarf', A.TORSO + ['neck_01', 'head'] + arms, red, offset=0.024, smooth=16, thick=0.01, min_w=0.9,
                       planes=[(Vector((0, 0, neck.z + 0.04)), Z), (Vector((0, 0, neck.z - 0.055)), -Z), (Vector((sh.x - 0.06, 0, 0)), X), (Vector((-sh.x + 0.06, 0, 0)), -X)]))
    for sx in (-1, 1):
        top = Vector((sx * 0.045, neck.y + 0.1, neck.z - 0.01))
        pts = [(top + Vector((sx * (0.012 * t + 0.012 * math.sin(t * 1.3)), 0.03 * t ** 0.6 + 0.012 * math.sin(t * 1.7 + sx), -0.1 * t)), Vector((sx * 0.25, 1, 0.12)).normalized()) for t in range(8)]
        def w(co, z0=top.z):
            t = min(1.0, max(0.0, (z0 - co.z) / 0.6))
            return [('spine_03', 1 - t), ('spine_01', t)] if t > 0.001 else [('spine_03', 1.0)]
        out.append(A.plate(f'scarf_tail{sx}', red, w, pts, [0.06, 0.07, 0.072, 0.07, 0.066, 0.06, 0.05, 0.03], thick=0.003, bulge=0.004, coll=coll))
    n = A.hide_body(body, arm, A.TORSO + arms + legs + ['hand_l', 'hand_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'] + A.side(A.FINGERS, 'l') + A.side(A.FINGERS, 'r'), min_w=0.75)
    print('HIDDEN', n)
    return A.join(out, 'outfit', arm)
