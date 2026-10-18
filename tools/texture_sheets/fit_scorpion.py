#!/usr/bin/env python3
"""Extract the two supplied Centroid body atlases and fit native scor.mdl UVs.

The top-left body pieces are sampled directly; rendered references and detached
head panels are excluded. Native pixels survive only on the two small red joint
islands absent from the supplied art. Model geometry and source files are read-only.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from resource_paths import resource_path
import argparse
import hashlib
import json
import struct
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from fit_vore import member
from fit_skin import spread
from fit_enforcer import detail, register
from update_head_skins import uv_footprint
from update_enemy_heights import height_for

MODEL_SHA = '13f3baa6760b38c1a7ba30eea9b581754dd87eeb1875248ce6feb1d1efb3582f'
SOURCES = [
    ('aa0f86eb-168c-4ed4-b4c4-df318d5b0ed6.jpeg', '57f7de4fe54c77e1e7cc18817272ef35aee137ef3537ace7243cd079cfa0c7a0'),
    ('4d36fc39-968f-460d-934d-6690cc5f663c.jpeg', '57a880a9fa982fe6144cf553224270ddb19dc62997ea4c70ded434d5db9ae681'),
]
FACTOR = 5
# Native UV components are disjoint. Boxes include half-texel edge padding.
PARTS = [
    ('outer limb', [5, 9, 124, 355], [2, 1, 40, 110], (1, 2)),
    ('inner limb', [98, 14, 216, 362], [30, 3, 68, 111], (3, 4)),
    ('torso', [207, 19, 500, 366], [62, 5, 152, 112], (5, 6)),
    ('tail', [7, 355, 509, 484], [1, 108, 153, 154], (9, 10)),
    ('thin limb', [254, 452, 405, 479], [70, 143, 124, 152], (11, 12)),
]
# Source anatomy masks exclude neighbouring pieces inside overlapping crop boxes.
# Dark detail inside the polygon stays artwork, not a brightness-derived hole.
POLYGONS = {
    'torso': [(230,20),(468,20),(495,99),(499,240),(480,286),(454,324),
              (365,365),(328,359),(254,328),(219,291),(208,244),(215,96)],
    'tail': [(8,355),(69,358),(121,369),(202,376),(355,380),(509,408),
             (507,420),(354,450),(203,460),(125,473),(65,483),(8,484)],
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def build(pack, palette_pack, source_root, out):
    data = member(pack, 'progs/scor.mdl')
    if sha(data) != MODEL_SHA:
        raise ValueError('Native model differs from the measured Centroid layout')
    if struct.unpack_from('<6i', data, 48) != (1, 308, 156, 235, 422, 41):
        raise ValueError('Unexpected native layout')
    palette = np.frombuffer(member(palette_pack, 'gfx/palette.lmp'), np.uint8).reshape(256, 3)
    native = Image.fromarray(palette[np.frombuffer(data, np.uint8, 308*156, 88).reshape(156, 308)])
    images = []
    for name, digest in SOURCES:
        path = source_root / name
        if sha(path.read_bytes()) != digest:
            raise ValueError('Source changed: ' + name)
        image = Image.open(path).convert('RGB')
        if image.size != (1024, 888):
            raise ValueError('Unexpected supplied dimensions')
        images.append(image)
    width, height = 308*FACTOR, 156*FACTOR
    footprint = uv_footprint(data, FACTOR)
    labels, count = ndimage.label(footprint)
    if count != 12:
        raise ValueError('Native UV island topology changed')
    canvas = np.zeros((height, width, 3), np.uint8)
    coverage = np.zeros((height, width), bool)
    reference = detail(native.resize((width, height), Image.Resampling.BICUBIC), 6)
    parts = []
    for side, source in enumerate(images):
        for name, source_box, native_box, ids in PARTS:
            surface = labels == ids[side]
            crop = source.crop(source_box)
            pixels = np.asarray(crop)
            bg = np.array([14, 15, 19] if side == 0 else [12, 16, 19])
            foreground = np.max(np.abs(pixels.astype(float)-bg), axis=2) > 10
            foreground = ndimage.binary_fill_holes(ndimage.binary_closing(foreground, iterations=2))
            if name in POLYGONS:
                mask = Image.new('L', crop.size)
                ImageDraw.Draw(mask).polygon([(x-source_box[0],y-source_box[1]) for x,y in POLYGONS[name]],fill=255)
                foreground &= np.asarray(mask) > 0
            # Carry supplied colour across the dark JPEG border before filtering.
            pixels, _ = spread(pixels, foreground, 24)
            box = [(v + (154*side if i%2 == 0 else 0))*FACTOR for i, v in enumerate(native_box)]
            placed, before, after = register(detail(crop, 4), reference, surface, box, width, height)
            registration = 'native-detail correlation'
            if side == 1 and name in ('torso', 'tail'):
                # The back is intentionally redrawn: ribs became armour plates.
                # A low correlation cannot establish internal landmark alignment.
                # Use the measured complete-island extent instead of a false peak.
                placed = box
                registration = 'measured silhouette bounds; redrawn internal pattern'
            # Bounds remain local to the identified anatomy; registration can move
            # each edge by at most the existing helper's 30 output-pixel limit.
            l, t, r, b = placed
            fitted = np.asarray(Image.fromarray(pixels).resize((r-l, b-t), Image.Resampling.LANCZOS))
            seed = np.asarray(Image.fromarray((foreground*255).astype(np.uint8)).resize((r-l, b-t), Image.Resampling.NEAREST)) > 0
            local = np.zeros_like(canvas); valid = np.zeros_like(coverage)
            cl, ct, cr, cb = max(0,l), max(0,t), min(width,r), min(height,b)
            local[ct:cb,cl:cr] = fitted[ct-t:cb-t,cl-l:cr-l]
            valid[ct:cb,cl:cr] = seed[ct-t:cb-t,cl-l:cr-l]
            local, reached = spread(local, valid, 28)
            if np.any(surface & ~reached):
                raise ValueError('Supplied colour does not cover ' + name + ' side ' + str(side))
            # Only this UV component and a short filter border receive its art.
            region = ndimage.binary_dilation(surface, iterations=4) & reached
            region &= ~footprint | surface
            canvas[region] = local[region]
            coverage |= region
            parts.append(dict(name=name, side=side, sourceBox=source_box, initialBox=box,
                              fittedBox=placed, registration=registration, detailBefore=before, detailAfter=after,
                              surfacePixels=int(surface.sum()), carriedPixels=int((surface & ~valid).sum())))
    # Missing source anatomy is deliberately preserved, never invented. This is
    # persistent joint geometry across poses, not an assumed muzzle flash.
    kept = (labels == 7) | (labels == 8)
    retained = ndimage.binary_dilation(kept, iterations=4) & (~footprint | kept)
    original = np.asarray(native.resize((width, height), Image.Resampling.NEAREST))
    canvas[retained] = original[retained]
    coverage |= retained
    if np.any(footprint & ~coverage):
        raise ValueError('Uncovered model surface')
    out.mkdir(parents=True, exist_ok=True)
    image = Image.fromarray(canvas)
    image.save(out/'diffuse.png')
    height_for(image, out/'height.webp', 'scor/custom')
    report = dict(schema=1, model='progs/scor.mdl', nativeModelSha256=MODEL_SHA,
                  sources=[dict(source=n, sourceSha256=h) for n,h in SOURCES],
                  dimensions=[width,height], factor=FACTOR, skin=0, poses=41,
                  parts=parts, surfacePixels=int(footprint.sum()),
                  nativeKept=dict(reason='Two persistent red joint islands absent from supplied sheets',
                                  surfacePixels=int(kept.sum()), pixelsInFile=int(retained.sum())),
                  excluded='Right rendered references and lower detached-head panels; h_scourg unchanged',
                  reuse=['fit_enforcer.register','fit_skin.spread','uv_footprint','height_for'],
                  files={name:sha((out/name).read_bytes()) for name in ['diffuse.png','height.webp']})
    (out/'SOURCE.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack', type=Path, default=ROOT/'resources/hipnotic/pak0.pak')
    parser.add_argument('--palette-pack', type=Path, default=ROOT/'resources/id1/pak0.pak')
    parser.add_argument('--source-root', type=Path, default=ROOT)
    parser.add_argument('--out', type=Path, default=resource_path(ROOT, 'newer/enemies/scor/custom'))
    args = parser.parse_args()
    build(args.pack, args.palette_pack, args.source_root, args.out)
