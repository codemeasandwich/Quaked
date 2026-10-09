#!/usr/bin/env python3
"""Fit the supplied Enforcer sheet onto the actual registered-game progs/enforcer.mdl skin layout.

The supplied sheet (front and back body, the two gun pieces, the pack) is drawn in the native atlas's
proportions, but its pieces are not exactly where the model's UVs expect them: the redrawn bodies are a
little taller than the native ones, so pinning a body's outline to the native outline leaves its belt,
fists and knees two or three texels high on the mesh. Each piece is therefore *registered*: starting from
its outline, the four edges of its destination box are moved to where the fine detail of the supplied art
best agrees with the fine detail of the native skin over the model's UV surface (the native skin is only
the yardstick; none of it is copied). The art's own colours, taken from just inside its anti-aliased edge,
are then carried outward so the mesh never samples the sheet's black.

The supplied sheet has no muzzle flash. The two flash pieces of the model's UV layout keep the native
pixels (enlarged), on an otherwise blank canvas, and that is recorded: an owner decision is flagged in
docs/enemy-skin-enforcer-2026-10-09.md. Nothing else native is in the output.

    /usr/bin/python3 tools/texture_sheets/fit_enforcer.py --source <the supplied JPEG> --pack <owned id1 pak0.pak>
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
SOURCE_SHA = '5046d3115bb3498a3dba44484223d1a9560f981bec8f02365b1961623156edcb'
MODEL_SHA = '01eee88d78a0fe8014b86c57b45c235b59548bccc3436c97d8f59c420e865677'
LAYOUT = (1, 296, 195, 222, 424, 102)  # skins, width, height, vertices, triangles, poses
FACTOR, BLEED, DARK = 5, 14, 4  # (the sheet's background is black to within 5; its darkest art, the boots, is above that)
EDGE = 3        # source pixels of anti-aliased falloff at a piece's edge that are not used as colour
SEARCH = 30     # how far (canvas pixels) each edge of a piece's box may move from its outline fit
FLASH_PAD = 4   # canvas pixels of native flash kept around the flash's UV triangles
KINDS = ['body', 'pack', 'gun', 'barrel']  # by size, a front and a back of each

def native_skin(data, palette):
	width, height = struct.unpack_from('<2i', data, 52)
	if struct.unpack_from('<i', data, 84)[0] != 0: raise ValueError('Unexpected grouped skin')
	return Image.fromarray(palette[np.frombuffer(data, np.uint8, width * height, 88).reshape(height, width)])

def islands(mask, minimum):
	"""Connected pieces of a mask, largest first: (box [l, t, r, b], label mask)."""
	labels, count = ndimage.label(mask)
	out = []
	for i, box in enumerate(ndimage.find_objects(labels), 1):
		piece = labels[box] == i
		if piece.sum() >= minimum: out.append(([box[1].start, box[0].start, box[1].stop, box[0].stop], labels == i))
	return sorted(out, key=lambda item: -item[1].sum())

def detail(rgb, sigma):
	"""Fine detail of a picture: its luminance less a blurred copy."""
	lum = np.asarray(rgb, np.float32) @ np.array([.299, .587, .114], np.float32)
	return lum - ndimage.gaussian_filter(lum, sigma)

def register(source_detail, reference, surface, box, W, H):
	"""Move the edges of box [l, t, r, b] (canvas pixels) to where source_detail, resized into it, agrees best with reference on surface."""
	picture = Image.fromarray(source_detail)
	def score(candidate):
		l, t, r, b = candidate
		if r - l < 8 or b - t < 8: return -2
		cl, ct, cr, cb = max(0, l), max(0, t), min(W, r), min(H, b)
		piece = np.asarray(picture.resize((r - l, b - t), Image.Resampling.BILINEAR))[ct - t:cb - t, cl - l:cr - l]
		where = surface[ct:cb, cl:cr]
		if where.sum() < surface.sum() * .98: return -2  # the piece must still cover its surface
		a, c = piece[where], reference[ct:cb, cl:cr][where]
		a = a - a.mean(); c = c - c.mean(); d = float(np.sqrt((a * a).sum() * (c * c).sum()))
		return float((a * c).sum() / d) if d else -2
	best, value = list(box), score(box); start = value
	# a coarse look at every pair of opposite edges first (top and bottom, then left and right): the agreement has
	# several peaks a few pixels apart, and a walk from the outline can stop on the wrong one
	for first, second in ((1, 3), (0, 2), (1, 3)):
		origin = list(best)
		for da in range(-SEARCH, SEARCH + 1, 3):
			for db in range(-SEARCH, SEARCH + 1, 3):
				trial = list(origin); trial[first] = box[first] + da; trial[second] = box[second] + db
				v = score(trial)
				if v > value + 1e-6: best, value = trial, v
	for step in (4, 2, 1):
		moved = True
		while moved:
			moved = False
			for edge in range(4):
				for delta in (-step, step):
					trial = list(best); trial[edge] += delta
					if abs(trial[edge] - box[edge]) > SEARCH: continue
					v = score(trial)
					if v > value + 1e-6: best, value, moved = trial, v, True
	return best, start, value

def fit(data, palette, source):
	width, height = LAYOUT[1], LAYOUT[2]; W, H = width * FACTOR, height * FACTOR
	native = native_skin(data, palette)
	footprint = uv_footprint(data, FACTOR)
	native_mask = ndimage.binary_fill_holes(np.asarray(native).max(2) > 0)
	source_rgb = np.asarray(source); source_mask = ndimage.binary_fill_holes(ndimage.binary_opening(source_rgb.max(2) > DARK, iterations=2))
	sx, sy = source.width / width, source.height / height
	source_islands = islands(source_mask, 40 * sx * sy)
	# the supplied piece under a native piece: the one covering most of it (none if under half of it has supplied art)
	def inside(mask):
		ys, xs = np.nonzero(mask); py = np.minimum((ys + .5) * sy, source.height - 1).astype(int); px = np.minimum((xs + .5) * sx, source.width - 1).astype(int)
		best = max(source_islands, key=lambda s: s[1][py, px].sum())
		return [best] if best[1][py, px].mean() > .5 else []
	# a piece of the model's own UV layout with no supplied art under it (the two muzzle flashes, which touch the head in the
	# native picture) is cut out of the native pieces first and keeps its native pixels
	flash = np.zeros((H, W), bool); kept = []
	for box, mask in islands(uv_footprint(data, 1), 10):
		if inside(mask): continue
		l, t, r, b = box; native_mask[max(0, t - 2):b + 2, max(0, l - 2):r] = False
		region = np.zeros((H, W), bool); region[t * FACTOR:b * FACTOR, l * FACTOR:r * FACTOR] = True
		flash |= footprint & region
		kept.append(dict(name='muzzle flash: native pixels (the sheet has none)', nativeBox=box, nativeTexels=int(mask.sum())))
	flash_keep = ndimage.binary_dilation(flash, iterations=FLASH_PAD)
	reference = detail(native.resize((W, H), Image.Resampling.BICUBIC), 6)
	source_detail = detail(source, 6 * sx / FACTOR)
	canvas = np.zeros((H, W, 3), np.uint8); direct = np.zeros((H, W), bool); carried_mask = np.zeros((H, W), bool); parts = []
	fits = []
	for order, (box, mask) in enumerate(islands(native_mask, 40)):
		name = ('front ' if box[0] + box[2] < width else 'back ') + KINDS[order // 2]
		match = inside(mask)
		if not match: raise ValueError('A native piece has no supplied art: ' + str(box))
		sbox, smask = match[0]; sl, st, sr, sb = sbox
		# the model surface that belongs to this piece
		region = np.asarray(Image.fromarray((ndimage.binary_dilation(mask, iterations=2) * 255).astype('uint8')).resize((W, H), Image.Resampling.NEAREST)) > 0
		surface = footprint & region & ~flash
		outline = [v * FACTOR for v in box]
		placed, before, after = register(source_detail[st:sb, sl:sr], reference, surface, outline, W, H)
		fits.append((name, sbox, smask, box, outline, placed, before, after, surface))
	for name, sbox, smask, box, outline, placed, before, after, surface in fits:
		sl, st, sr, sb = sbox; dl, dt, dr, db = placed; size = (dr - dl, db - dt)
		pixels = np.asarray(source.crop(sbox).resize(size, Image.Resampling.LANCZOS))
		# colour is only taken from inside the piece's anti-aliased edge; that seed is then carried outward
		seed_source = ndimage.binary_erosion(smask[st:sb, sl:sr], iterations=EDGE)
		seed = np.asarray(Image.fromarray((seed_source * 255).astype('uint8')).resize(size, Image.Resampling.BILINEAR)) > 127
		reach = BLEED + int(np.ceil(EDGE * max(size[0] / (sr - sl), size[1] / (sb - st)))) + 2
		padded = np.pad(pixels, ((reach, reach), (reach, reach), (0, 0)), 'edge'); padded_seed = np.pad(seed, reach, constant_values=False)
		padded, extended = spread(padded, padded_seed, reach)
		x0, y0 = dl - reach, dt - reach
		cl, ct, cr, cb = max(0, x0), max(0, y0), min(W, dr + reach), min(H, db + reach)
		local = extended[ct - y0:cb - y0, cl - x0:cr - x0]; local_seed = padded_seed[ct - y0:cb - y0, cl - x0:cr - x0]
		# another piece's own art is never overwritten by this piece's carried colour
		write = local & (local_seed | ~direct[ct:cb, cl:cr])
		canvas[ct:cb, cl:cr][write] = padded[ct - y0:cb - y0, cl - x0:cr - x0][write]
		direct[ct:cb, cl:cr] |= local_seed; carried_mask[ct:cb, cl:cr] |= local
		outside = surface & ~direct
		far = float(ndimage.distance_transform_edt(~direct)[surface].max()) if surface.any() else 0
		parts.append(dict(name=name, src=sbox, nativeBox=box, outlineBox=outline, fittedBox=placed, edgesMoved=[placed[i] - outline[i] for i in range(4)],
			scale=[round(size[0] / (sr - sl), 4), round(size[1] / (sb - st), 4)], detailAgreementAtOutline=round(before, 4), detailAgreement=round(after, 4),
			surfacePixels=int(surface.sum()), surfaceBeyondArt=int(outside.sum()), surfaceBeyondArtMaxDistance=round(far, 2)))
	# the native flash: its UV triangles always, and a small surround where no supplied art is
	native_up = np.asarray(native.resize((W, H), Image.Resampling.LANCZOS))
	write = flash | (flash_keep & ~direct)
	canvas[write] = native_up[write]
	surface_direct = footprint & direct & ~flash; surface_carried = footprint & ~direct & ~flash
	bare = surface_carried & ~carried_mask
	if bare.any():
		ys, xs = np.nonzero(bare); raise ValueError('Visible UV pixels have no supplied colour: %d, canvas box %s; %s' % (bare.sum(), [xs.min(), ys.min(), xs.max(), ys.max()], json.dumps(parts)))
	for part in parts:
		if part['detailAgreement'] < .35: raise ValueError('A piece does not register with the native layout: ' + part['name'])
		if part['surfaceBeyondArtMaxDistance'] > BLEED: raise ValueError('Model surface lies too far outside the supplied art: ' + part['name'])
	report = dict(parts=parts, nativeKept=kept, units='canvas pixels (native texels x %d) unless a name says native' % FACTOR,
		surface_pixels=int(footprint.sum()), direct_supplied_surface_pixels=int(surface_direct.sum()),
		carried_edge_surface_pixels=int(surface_carried.sum()), native_surface_pixels=int((footprint & flash).sum()),
		native_pixels_in_file=int(write.sum()), flash_surface_pixels_not_native=int((flash & (canvas != native_up).any(2)).sum()))
	return Image.fromarray(canvas), report

def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('--source', type=Path, required=True); parser.add_argument('--pack', type=Path, required=True)
	parser.add_argument('--out', type=Path, default=ROOT / 'newer/enemies/enforcer/custom'); args = parser.parse_args()
	if hashlib.sha256(args.source.read_bytes()).hexdigest() != SOURCE_SHA: raise ValueError('Supplied source changed; review fit recipe')
	data = member(args.pack, 'progs/enforcer.mdl')
	if hashlib.sha256(data).hexdigest() != MODEL_SHA: raise ValueError('Native model differs from this fit recipe')
	if struct.unpack_from('<6i', data, 48) != LAYOUT: raise ValueError('Unexpected native model layout')
	palette = np.frombuffer(member(args.pack, 'gfx/palette.lmp'), np.uint8).reshape(256, 3)
	source = Image.open(args.source).convert('RGB')
	if source.size != (1263, 832): raise ValueError('Unexpected source dimensions')
	result, coverage = fit(data, palette, source)
	args.out.mkdir(parents=True, exist_ok=True); result.save(args.out / 'diffuse.webp', 'WEBP', lossless=True, method=6)
	height_for(result, args.out / 'height.webp', 'enforcer/custom')
	report = dict(schema=1, model='progs/enforcer.mdl', nativeModelSha256=MODEL_SHA, source=args.source.name, sourceSha256=SOURCE_SHA,
		skin=0, skinFrame=0, poses=LAYOUT[5], vertices=LAYOUT[3], triangles=LAYOUT[4], factor=FACTOR, dimensions=list(result.size), bleed=BLEED, edge=EDGE,
		toolchain=dict(python=sys.version.split()[0], pillow=Image.__version__, numpy=np.__version__, scipy=__import__('scipy').__version__),
		fit=coverage, normalProfile=dict(strength=.65, cap=.55), reuse=['fit_skin.spread', 'uv_footprint', 'height_for', 'fit_vore.member'],
		files={p: hashlib.sha256((args.out / p).read_bytes()).hexdigest() for p in ['diffuse.webp', 'height.webp']})
	(args.out / 'SOURCE.json').write_text(json.dumps(report, indent=2) + '\n'); print(json.dumps(report, indent=2))

if __name__ == '__main__': main()
