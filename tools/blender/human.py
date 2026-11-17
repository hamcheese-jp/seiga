# MPFB(MakeHuman)で人体を作る共通部品。Blender 5.3 + MPFB + VRM Add-on 用。
#   blender -b --python tools/blender/<キャラ>.py -- 出力先
import bpy, os, math
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
from bl_ext.blender_org.mpfb.services.locationservice import LocationService
from bl_ext.blender_org.mpfb.services.assetservice import AssetService

def clear_scene():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)

def asset(sub, name, ext):
    for root in AssetService.get_asset_roots(sub):
        p = os.path.join(root, name, os.path.basename(name) + ext)
        if os.path.exists(p): return p
    raise FileNotFoundError(sub + '/' + name + ext)

def make_human(macro, targets, skin, eyes_mat='brown', eyebrows='eyebrow001', lashes='eyelashes01', hair=None, teeth='teeth_base', rig='game_engine'):
    bm = HumanService.create_human(scale=0.1, macro_detail_dict=macro)
    for name, w in targets.items():
        # 'l-'/'r-' の対は 'lr-' でまとめて書ける
        names = [name.replace('lr-', 'l-', 1), name.replace('lr-', 'r-', 1)] if name.startswith('lr-') else [name]
        for n in names:
            path = TargetService.target_full_path(n)
            if not path: raise FileNotFoundError('target ' + n)
            TargetService.load_target(bm, path, weight=w, name=n)
    HumanService.set_character_skin(asset('skins', skin, '.mhmat'), bm, skin_type='GAMEENGINE', material_instances=False)
    armature = HumanService.add_builtin_rig(bm, rig)
    kw = dict(subdiv_levels=0, material_type='GAMEENGINE')
    parts = {}
    parts['eyes'] = HumanService.add_mhclo_asset(asset('eyes', 'low-poly', '.mhclo'), bm, asset_type='Eyes', **kw)
    parts['eyebrows'] = HumanService.add_mhclo_asset(asset('eyebrows', eyebrows, '.mhclo'), bm, asset_type='Eyebrows', **kw)
    parts['lashes'] = HumanService.add_mhclo_asset(asset('eyelashes', lashes, '.mhclo'), bm, asset_type='Eyelashes', **kw)
    parts['teeth'] = HumanService.add_mhclo_asset(asset('teeth', teeth, '.mhclo'), bm, asset_type='Teeth', **kw)
    if hair: parts['hair'] = HumanService.add_mhclo_asset(asset('hair', hair, '.mhclo'), bm, asset_type='Hair', **kw)
    return bm, armature, parts

def tint(obj, color, mix=1.0):
    # テクスチャの色に指定色を掛ける(髪や眉の色替え)
    for m in obj.data.materials:
        nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        link = next(l for l in nt.links if l.to_node == bsdf and l.to_socket.name == 'Base Color')
        mixn = nt.nodes.new('ShaderNodeMix'); mixn.data_type = 'RGBA'; mixn.blend_type = 'MULTIPLY'; mixn.inputs[0].default_value = mix
        src = link.from_socket; nt.links.remove(link)
        nt.links.new(src, mixn.inputs[6]); mixn.inputs[7].default_value = (*color, 1); nt.links.new(mixn.outputs[2], bsdf.inputs['Base Color'])

def render_views(out_prefix, height=1.8, engine='BLENDER_EEVEE', shots=None):
    sc = bpy.context.scene
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.42, 0.45, 0.5, 1); bg.inputs[1].default_value = 0.45
    t = bpy.data.objects.new('_aim', None); sc.collection.objects.link(t); t.location = (0, 0, height * 0.8)
    for loc, e, size in (((1.6, -2.6, height + 0.6), 90, 1.2), ((-2.4, -1.6, height * 0.7), 30, 2.5), ((0.5, 2.6, height + 0.4), 70, 1.0)):
        l = bpy.data.lights.new('l', 'AREA'); l.energy = e; l.size = size; lo = bpy.data.objects.new('l', l); sc.collection.objects.link(lo)
        lo.location = loc
        c = lo.constraints.new('TRACK_TO'); c.target = t; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    cam.lens = 85; cam.sensor_fit = 'VERTICAL'; cam.sensor_height = 24
    sc.render.engine = engine; sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    h = height
    all_shots = {'front': (0, h * 0.52, h * 1.12, 700, 1000), 'side': (90, h * 0.52, h * 1.12, 700, 1000), 'back': (180, h * 0.52, h * 1.12, 700, 1000),
                 'face': (0, h * 0.93, h * 0.2, 800, 800), 'face34': (38, h * 0.93, h * 0.2, 800, 800), 'bust': (20, h * 0.84, h * 0.45, 800, 800)}
    for name in (shots or all_shots):
        deg, z, span, rx, ry = all_shots[name]
        a = math.radians(deg); d = span / 2 / (12 / 85)   # 縦の画角に span が収まる距離
        co.location = (d * math.sin(a), -d * math.cos(a), z); co.rotation_euler = (math.pi / 2, 0, a)
        sc.render.resolution_x = rx; sc.render.resolution_y = ry
        sc.render.filepath = out_prefix + '_' + name + '.png'; bpy.ops.render.render(write_still=True)
