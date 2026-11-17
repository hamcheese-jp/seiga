# レイガ(焔牙の剣士): 20代半ば、引き締まった体、精悍な顔
import bpy, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import human, hair
out = sys.argv[sys.argv.index('--') + 1]
human.clear_scene()
macro = {"gender": 1.0, "age": 0.47, "muscle": 0.8, "weight": 0.4, "height": 0.62, "proportions": 0.9, "cupsize": 0.5, "firmness": 0.5,
         "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}}
targets = {
    'head-fat-decr': 0.3, 'head-age-decr': 0.5, 'head-invertedtriangular': 0.25, 'head-scale-horiz-decr': 0.15, 'head-scale-vert-decr': 0.15,
    'lr-cheek-bones-incr': 0.2, 'lr-cheek-volume-decr': 0.2,
    'chin-prominent-incr': 0.25, 'chin-bones-incr': 0.5, 'chin-width-decr': 0.15,
    'lr-eye-scale-incr': 0.45, 'lr-eye-bag-decr': 0.7, 'lr-eye-corner2-up': 0.5, 'lr-eye-eyefold-angle-up': 0.4, 'lr-eye-trans-in': 0.2,
    'eyebrows-angle-up': 0.45, 'eyebrows-trans-down': 0.25, 'eyebrows-trans-backward': 0.6, 'forehead-trans-forward': 0.25, 'lr-eye-push1-out': 0.3, 'lr-eye-push2-out': 0.3,
    'nose-scale-horiz-decr': 0.3, 'nose-nostrils-width-decr': 0.2, 'nose-point-width-decr': 0.3, 'nose-greek-incr': 0.2, 'nose-scale-vert-decr': 0.15,
    'mouth-scale-horiz-decr': 0.35, 'mouth-upperlip-volume-decr': 0.3, 'mouth-lowerlip-ext-up': 1.0, 'mouth-upperlip-ext-down': 1.0, 'mouth-lowerlip-middle-up': 1.0, 'mouth-upperlip-middle-down': 1.0, 'mouth-lowerlip-height-decr': 0.5, 'mouth-scale-vert-decr': 0.3,
    'neck-scale-horiz-incr': 0.2,
}
bm, arm, parts = human.make_human(macro, targets, 'young_caucasian_male', eyebrows=os.environ.get('BROW', 'eyebrow009'), hair=None)
parts['hair'] = hair.make_hair(bm, arm)
human.tint(bm, (0.95, 0.86, 0.8)); human.tint(parts['eyebrows'], (0.35, 0.25, 0.2))
import glob
eye_png = glob.glob(os.path.join(os.path.dirname(human.asset('eyes', 'low-poly', '.mhclo')), '..', 'materials', os.environ.get('EYE', 'brownlight') + '_eye.png'))[0]
for n in parts['eyes'].data.materials[0].node_tree.nodes:
    if n.type == 'TEX_IMAGE': n.image = bpy.data.images.load(eye_png, check_existing=True)
m = bm.modifiers.new('sub', 'SUBSURF'); m.levels = 1; m.render_levels = 1
print('DIM', [round(v, 3) for v in bm.dimensions], {k: len(o.data.vertices) for k, o in parts.items()})
bpy.ops.wm.save_as_mainfile(filepath=out + '.blend')
human.render_views(out, height=bm.dimensions[2], shots=os.environ.get('SHOTS', 'face,face34,bust').split(','))
