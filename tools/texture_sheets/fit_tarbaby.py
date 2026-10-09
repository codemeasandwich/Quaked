#!/usr/bin/env python3
"""Fit the supplied Spawn sheet onto the actual registered-game progs/tarbaby.mdl skin layout.

The supplied sheet (front and back, on a blue screen) has the native atlas's proportions and every UV
triangle of the model lies inside its art, but a plain resize of the whole sheet leaves the back (and less
so the front) a few texels off the native layout. Each of the two pieces is therefore registered as the
Enforcer's are (fit_enforcer.register): the edges of its box are moved to where the fine detail of the
supplied art best agrees with the fine detail of the native skin over the model's UV surface. The native
skin is only the yardstick: the canvas is blank and no native pixel enters the output. The blue screen and
its fringe are cut away and the art's own colours carried outward, so no blue can be sampled at a seam.

    /usr/bin/python3 tools/texture_sheets/fit_tarbaby.py --source <the supplied JPEG> --pack <owned id1 pak0.pak>
"""
import argparse, hashlib, json, struct, sys
from pathlib import Path
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
from scipy import ndimage
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from fit_vore import member
from fit_skin import spread
from fit_enforcer import native_skin, islands, detail, register
from update_head_skins import uv_footprint
from update_enemy_heights import height_for
SOURCE_SHA = 'f871111cbd78c3ec7185373875fadfc1ea58133d5b983253984c3b00168e4751'
MODEL_SHA = '9933ee9b251e4c32a22129e2a9cda8cebfd2f317aeb2961a0591a098e9e823ea'
LAYOUT = (1, 304, 194, 130, 256, 61)  # skins, width, height, vertices, triangles, poses
FACTOR, BLEED, BLUE, FRINGE = 5, 24, 60, 3

def blueness(rgb):
	rgb = rgb.astype(np.int16); return rgb[..., 2] - np.maximum(rgb[..., 0], rgb[..., 1])

def fit(data, palette, source):
	width, height = LAYOUT[1], LAYOUT[2]; W, H = width * FACTOR, height * FACTOR
	sx, sy = source.width / W, source.height / H
	# the art: everything that is not the blue screen; colour is only taken from inside its fringe of blended edge pixels
	art = ndimage.binary_fill_holes(blueness(np.asarray(source)) < BLUE)
	footprint = uv_footprint(data, FACTOR)
	reference = detail(native_skin(data, palette).resize((W, H), Image.Resampling.BICUBIC), 6)
	source_detail = detail(source, 6 * sx)
	canvas = np.zeros((H, W, 3), np.uint8); direct = np.zeros((H, W), bool); covered = np.zeros((H, W), bool); parts = []
	pieces = islands(art, 2000)
	if len(pieces) != 2: raise ValueError('Expected a front and a back piece, found %d' % len(pieces))
	for sbox, smask in sorted(pieces, key=lambda item: item[0][0]):
		sl, st, sr, sb = sbox; name = 'front' if sl + sr < source.width else 'back'
		outline = [round(sl / sx), round(st / sy), round(sr / sx), round(sb / sy)]  # where a plain resize of the whole sheet puts it
		surface = footprint.copy()
		if name == 'front': surface[:, W // 2:] = False
		else: surface[:, :W // 2] = False
		placed, before, after = register(source_detail[st:sb, sl:sr], reference, surface, outline, W, H)
		dl, dt, dr, db = placed; size = (dr - dl, db - dt)
		pixels = np.asarray(source.crop(sbox).resize(size, Image.Resampling.LANCZOS))
		seed_source = ndimage.binary_erosion(smask[st:sb, sl:sr], iterations=FRINGE)
		seed = np.asarray(Image.fromarray((seed_source * 255).astype('uint8')).resize(size, Image.Resampling.BILINEAR)) > 127
		reach = BLEED
		padded = np.pad(pixels, ((reach, reach), (reach, reach), (0, 0)), 'edge'); padded_seed = np.pad(seed, reach, constant_values=False)
		padded, extended = spread(padded, padded_seed, reach)
		x0, y0 = dl - reach, dt - reach
		cl, ct, cr, cb = max(0, x0), max(0, y0), min(W, dr + reach), min(H, db + reach)
		local = extended[ct - y0:cb - y0, cl - x0:cr - x0]; local_seed = padded_seed[ct - y0:cb - y0, cl - x0:cr - x0]
		write = local & (local_seed | ~direct[ct:cb, cl:cr])
		canvas[ct:cb, cl:cr][write] = padded[ct - y0:cb - y0, cl - x0:cr - x0][write]
		direct[ct:cb, cl:cr] |= local_seed; covered[ct:cb, cl:cr] |= local
		far = float(ndimage.distance_transform_edt(~direct)[surface].max())
		parts.append(dict(name=name, src=sbox, wholeSheetBox=outline, fittedBox=placed, edgesMoved=[placed[i] - outline[i] for i in range(4)],
			scale=[round(size[0] / (sr - sl), 4), round(size[1] / (sb - st), 4)], detailAgreementAtWholeSheet=round(before, 4), detailAgreement=round(after, 4),
			surfacePixels=int(surface.sum()), surfaceBeyondArt=int((surface & ~direct).sum()), surfaceBeyondArtMaxDistance=round(far, 2)))
	if (footprint & ~covered).any(): raise ValueError('Visible UV pixels have no supplied colour: %d' % int((footprint & ~covered).sum()))
	screen = int(((blueness(canvas) > BLUE) & footprint).sum())
	if screen: raise ValueError('Blue screen pixels on the model surface: %d' % screen)
	for part in parts:
		if part['detailAgreement'] < .35: raise ValueError('A piece does not register with the native layout: ' + part['name'])
		if part['surfaceBeyondArtMaxDistance'] > BLEED / 2: raise ValueError('Model surface lies too far outside the supplied art: ' + part['name'])
	# measured, not assumed: a pixel the supplied art did not write (directly or by carrying its colour) is not from the sheet
	foreign = canvas.any(2) & ~covered
	return Image.fromarray(canvas), dict(parts=parts, units='canvas pixels (native texels x %d)' % FACTOR, surface_pixels=int(footprint.sum()),
		direct_supplied_surface_pixels=int((footprint & direct).sum()), carried_edge_surface_pixels=int((footprint & ~direct & covered).sum()),
		native_surface_pixels=int((footprint & foreign).sum()), native_pixels_in_file=int(foreign.sum()),
		blue_screen_surface_pixels=screen, blue_screen_pixels_in_file=int((blueness(canvas) > BLUE).sum()))

def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('--source', type=Path, required=True); parser.add_argument('--pack', type=Path, required=True)
	parser.add_argument('--out', type=Path, default=ROOT / 'newer/enemies/tarbaby/custom'); args = parser.parse_args()
	if hashlib.sha256(args.source.read_bytes()).hexdigest() != SOURCE_SHA: raise ValueError('Supplied source changed; review fit recipe')
	data = member(args.pack, 'progs/tarbaby.mdl')
	if hashlib.sha256(data).hexdigest() != MODEL_SHA: raise ValueError('Native model differs from this fit recipe')
	if struct.unpack_from('<6i', data, 48) != LAYOUT or struct.unpack_from('<i', data, 84)[0] != 0: raise ValueError('Unexpected native model layout')
	palette = np.frombuffer(member(args.pack, 'gfx/palette.lmp'), np.uint8).reshape(256, 3)
	source = Image.open(args.source).convert('RGB')
	if source.size != (1279, 816): raise ValueError('Unexpected source dimensions')
	result, coverage = fit(data, palette, source)
	args.out.mkdir(parents=True, exist_ok=True); result.save(args.out / 'diffuse.webp', 'WEBP', lossless=True, method=6)
	height_for(result, args.out / 'height.webp', 'tarbaby/custom')
	report = dict(schema=1, model='progs/tarbaby.mdl', nativeModelSha256=MODEL_SHA, source=args.source.name, sourceSha256=SOURCE_SHA,
		skin=0, skinFrame=0, poses=LAYOUT[5], vertices=LAYOUT[3], triangles=LAYOUT[4], factor=FACTOR, dimensions=list(result.size),
		background='blue screen', bleed=BLEED, fringe=FRINGE, toolchain=dict(python=sys.version.split()[0], pillow=Image.__version__, numpy=np.__version__, scipy=__import__('scipy').__version__),
		fit=coverage, normalProfile=dict(strength=.65, cap=.55), reuse=['fit_enforcer.register', 'fit_skin.spread', 'uv_footprint', 'height_for', 'fit_vore.member'],
		files={p: hashlib.sha256((args.out / p).read_bytes()).hexdigest() for p in ['diffuse.webp', 'height.webp']})
	(args.out / 'SOURCE.json').write_text(json.dumps(report, indent=2) + '\n'); print(json.dumps(report, indent=2))

if __name__ == '__main__': main()
