#!/usr/bin/env python3
"""Fit a supplied enemy skin sheet onto a native model's skin layout, piece by piece, by registration.

The general form of fit_enforcer.py / fit_tarbaby.py, for a sheet drawn in the native atlas's proportions
on a plain background:

1. The sheet's pieces are its connected areas that differ from the background colour (sampled at the
   corners). Each piece starts where a plain resize of the whole sheet puts it.
2. Every pixel of the model's UV surface belongs to the nearest piece; a piece with no surface (art the
   artist drew that no triangle uses, such as a spare weapon) is dropped and recorded.
3. Each piece is registered (fit_enforcer.register): the edges of its box move to where the fine detail of
   the supplied art agrees best with the fine detail of the native skin over the piece's own surface. The
   native skin is only the yardstick: the canvas starts blank and no native pixel is written.
4. Colour is taken from inside each piece's anti-aliased edge and carried outward, so no background colour
   is sampled at a seam. The tool fails if a piece registers badly, leaves surface far outside its art, or
   leaves any surface without supplied colour.

    /usr/bin/python3 tools/texture_sheets/fit_registered.py hknight --source <the supplied JPEG> --pack <owned id1 pak0.pak>

RECIPES names each supported sheet: the model, both digests, the expected layout and sizes.
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
from update_head_skins import uv_footprint
from update_enemy_heights import height_for
from fit_enforcer import native_skin, islands, detail, register

RECIPES = {
	'hknight': dict(model='progs/hknight.mdl', modelSha256='78d0273de6850f92d059fa90969f66ee57435330b3c4954c836a7204bc7a9d5a',
		layout=(1, 308, 154, 250, 452, 166), source='Gemini_Generated_Image_8q8whb8q8whb8q8w.jpeg',
		sourceSha256='b1d2fee5599f855a05081926e9fba84eca0aab84ddc43835a33a04581d23aca8', sourceSize=(1440, 720),
		# The redrawn swords' grips are about half the native grips' width (the blades slightly wider), so no box registers
		# them well or covers the native grip triangles: accepted at these floors, recorded, and named in the doc.
		waivers=[dict(src=[5, 276, 316, 654], minAgreement=.25, maxDistance=20, reason='front sword: drawn grip about half the native width'),
			dict(src=[725, 276, 1037, 655], minAgreement=.25, maxDistance=20, reason='back sword: drawn grip about half the native width')]),
}
FACTOR = 5
BLEED = 24       # canvas pixels the art's colour is carried beyond its edge
EDGE = 3         # source pixels of anti-aliased edge not used as colour
BACKGROUND = 8   # a source pixel this close (max channel difference) to the background colour may be background (its noise: nearly all within 4, at most 6)
MIN_AGREEMENT, MAX_DISTANCE, GATED = .35, 12, 5000  # a piece with more surface pixels than GATED must register at least this well and cover within this distance, unless its recipe waives it
MIN_PIECE = 60   # source pixels: smaller specks are noise

def fit(recipe, data, palette, source):
	width, height = recipe['layout'][1:3]; W, H = width * FACTOR, height * FACTOR
	sx, sy = source.width / W, source.height / H
	rgb = np.asarray(source).astype(np.int16)
	corners = np.concatenate([rgb[:8, :8].reshape(-1, 3), rgb[:8, -8:].reshape(-1, 3), rgb[-8:, :8].reshape(-1, 3), rgb[-8:, -8:].reshape(-1, 3)])
	background = np.median(corners, axis=0)
	# the background is what is connected to the sheet's border and close to its colour (dark armour inside a piece can be close too)
	near = np.abs(rgb - background).max(2) <= BACKGROUND
	labels, _ = ndimage.label(near)
	border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])); border = border[border > 0]
	art = ndimage.binary_fill_holes(~np.isin(labels, border))
	pieces = sorted(islands(art, MIN_PIECE), key=lambda item: (item[0][0], item[0][1]))
	footprint = uv_footprint(data, FACTOR)
	# each surface pixel belongs to the nearest piece, as a plain resize of the whole sheet places them
	placed_labels = np.zeros((H, W), np.int32)
	for n, (sbox, smask) in enumerate(pieces, 1):
		up = np.asarray(Image.fromarray((smask * 255).astype('uint8')).resize((W, H), Image.Resampling.NEAREST)) > 0
		placed_labels[up & (placed_labels == 0)] = n
	_, (iy, ix) = ndimage.distance_transform_edt(placed_labels == 0, return_indices=True)
	owner = placed_labels[iy, ix]
	# off the surface, a pixel belongs to the piece that owns the nearest surface pixel: that piece's colour is what a mip level
	# or a filtered sample at that triangle's edge should see
	_, (fy, fx) = ndimage.distance_transform_edt(~footprint, return_indices=True)
	region = np.where(footprint, owner, owner[fy, fx])
	reference = detail(native_skin(data, palette).resize((W, H), Image.Resampling.BICUBIC), 6)
	source_detail = detail(source, 6 * sx)
	canvas = np.zeros((H, W, 3), np.uint8); direct = np.zeros((H, W), bool); covered = np.zeros((H, W), bool)
	parts, unused = [], []
	for n, (sbox, smask) in enumerate(pieces, 1):
		sl, st, sr, sb = sbox
		surface = footprint & (owner == n)
		outline = [round(sl / sx), round(st / sy), round(sr / sx), round(sb / sy)]
		if surface.sum() < 50:
			unused.append(dict(src=sbox, wholeSheetBox=outline, sourcePixels=int(smask.sum()), surfacePixels=int(surface.sum()))); continue
		placed, before, after = register(source_detail[st:sb, sl:sr], reference, surface, outline, W, H)
		dl, dt, dr, db = placed; size = (dr - dl, db - dt)
		pixels = np.asarray(source.crop(sbox).resize(size, Image.Resampling.LANCZOS))
		own = smask[st:sb, sl:sr]
		seed = np.asarray(Image.fromarray((ndimage.binary_erosion(own, iterations=EDGE) * 255).astype('uint8')).resize(size, Image.Resampling.BILINEAR)) > 127
		padded = np.pad(pixels, ((BLEED, BLEED), (BLEED, BLEED), (0, 0)), 'edge'); padded_seed = np.pad(seed, BLEED, constant_values=False)
		padded, extended = spread(padded, padded_seed, BLEED)
		x0, y0 = dl - BLEED, dt - BLEED
		cl, ct, cr, cb = max(0, x0), max(0, y0), min(W, dr + BLEED), min(H, db + BLEED)
		local = extended[ct - y0:cb - y0, cl - x0:cr - x0]; local_seed = padded_seed[ct - y0:cb - y0, cl - x0:cr - x0]
		# a piece's carried colour never overwrites another piece's art, and only fills its own region (surface and surround)
		mine = region[ct:cb, cl:cr] == n
		write = (local_seed | (local & ~direct[ct:cb, cl:cr] & mine))
		canvas[ct:cb, cl:cr][write] = padded[ct - y0:cb - y0, cl - x0:cr - x0][write]
		direct[ct:cb, cl:cr] |= local_seed; covered[ct:cb, cl:cr] |= write
		own = np.zeros((H, W), bool); own[ct:cb, cl:cr] = local_seed  # (coverage is measured against this piece's own art only)
		far = float(ndimage.distance_transform_edt(~own)[surface].max())
		parts.append(dict(src=sbox, wholeSheetBox=outline, fittedBox=placed, edgesMoved=[placed[i] - outline[i] for i in range(4)],
			scale=[round(size[0] / (sr - sl), 4), round(size[1] / (sb - st), 4)], detailAgreementAtWholeSheet=round(before, 4), detailAgreement=round(after, 4),
			surfacePixels=int(surface.sum()), surfaceBeyondArt=int((surface & ~own).sum()), surfaceBeyondArtMaxDistance=round(far, 2)))
	bare = footprint & ~covered
	if bare.any():
		ys, xs = np.nonzero(bare); owners = np.unique(owner[bare])
		raise ValueError('Visible UV pixels have no supplied colour: %d at native %s, pieces %s; %s' % (bare.sum(), [xs.min() / FACTOR, ys.min() / FACTOR, xs.max() / FACTOR, ys.max() / FACTOR], [pieces[o - 1][0] for o in owners], json.dumps(parts)))
	for part in parts:
		waiver = next((w for w in recipe.get('waivers', []) if w['src'] == part['src']), None)
		if waiver: part['waiver'] = waiver['reason']
		least, furthest = (waiver['minAgreement'], waiver['maxDistance']) if waiver else (MIN_AGREEMENT, MAX_DISTANCE)
		# (a small piece, a horn tip, has little detail to agree on: its placement is held by the coverage limit alone)
		if part['surfacePixels'] > GATED and part['detailAgreement'] < least: raise ValueError('A piece does not register: %s; %s' % (part['src'], json.dumps(parts)))
		if part['surfaceBeyondArtMaxDistance'] > furthest: raise ValueError('Model surface lies too far outside the supplied art: %s; %s' % (part['src'], json.dumps(parts)))
	near_background = (np.abs(canvas.astype(np.int16) - background).max(2) <= BACKGROUND // 2) & footprint
	# anything written that no supplied piece wrote (a canvas seeded from the native skin, say) is counted here
	foreign = canvas.any(2) & ~covered
	return Image.fromarray(canvas), dict(background=[int(v) for v in background], parts=parts, unusedArt=unused,
		units='canvas pixels (native texels x %d)' % FACTOR, surface_pixels=int(footprint.sum()),
		direct_supplied_surface_pixels=int((footprint & direct).sum()), carried_edge_surface_pixels=int((footprint & ~direct & covered).sum()),
		native_surface_pixels=int((footprint & foreign).sum()), native_pixels_in_file=int(foreign.sum()),
		background_coloured_surface_pixels=int(near_background.sum()))

def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument('name', choices=sorted(RECIPES)); parser.add_argument('--source', type=Path, required=True); parser.add_argument('--pack', type=Path, required=True)
	parser.add_argument('--out', type=Path); args = parser.parse_args()
	recipe = RECIPES[args.name]; out = args.out or ROOT / 'newer/enemies' / args.name / 'custom'
	if hashlib.sha256(args.source.read_bytes()).hexdigest() != recipe['sourceSha256']: raise ValueError('Supplied source changed; review fit recipe')
	data = member(args.pack, recipe['model'])
	if hashlib.sha256(data).hexdigest() != recipe['modelSha256']: raise ValueError('Native model differs from this fit recipe')
	if struct.unpack_from('<6i', data, 48) != recipe['layout'] or struct.unpack_from('<i', data, 84)[0] != 0: raise ValueError('Unexpected native model layout')
	palette = np.frombuffer(member(args.pack, 'gfx/palette.lmp'), np.uint8).reshape(256, 3)
	source = Image.open(args.source).convert('RGB')
	if source.size != recipe['sourceSize']: raise ValueError('Unexpected source dimensions')
	result, coverage = fit(recipe, data, palette, source)
	out.mkdir(parents=True, exist_ok=True); result.save(out / 'diffuse.webp', 'WEBP', lossless=True, method=6)
	height_for(result, out / 'height.webp', args.name + '/custom')
	layout = recipe['layout']
	report = dict(schema=1, model=recipe['model'], nativeModelSha256=recipe['modelSha256'], source=args.source.name, sourceSha256=recipe['sourceSha256'],
		skin=0, skinFrame=0, poses=layout[5], vertices=layout[3], triangles=layout[4], factor=FACTOR, dimensions=list(result.size), bleed=BLEED, edge=EDGE,
		toolchain=dict(python=sys.version.split()[0], pillow=Image.__version__, numpy=np.__version__, scipy=__import__('scipy').__version__),
		fit=coverage, normalProfile=dict(strength=.65, cap=.55), tool='tools/texture_sheets/fit_registered.py ' + args.name,
		reuse=['fit_enforcer.register', 'fit_enforcer.detail', 'fit_enforcer.islands', 'fit_enforcer.native_skin', 'fit_skin.spread', 'uv_footprint', 'height_for', 'fit_vore.member'],
		files={p: hashlib.sha256((out / p).read_bytes()).hexdigest() for p in ['diffuse.webp', 'height.webp']})
	(out / 'SOURCE.json').write_text(json.dumps(report, indent=2) + '\n'); print(json.dumps(report, indent=2))

if __name__ == '__main__': main()
