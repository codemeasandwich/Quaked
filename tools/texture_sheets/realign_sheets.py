#!/usr/bin/env python3
"""Cut an upscaled sheet back into textures when the upscaler has moved the tiles.

    python3 realign_sheets.py manifest.json sheet_name upscaled_image out_dir [factor]

Instead of trusting the original positions, it finds the tiles in the upscaled image
(they are separated by black), matches them to the manifest's tiles row by row, and
resizes each to texture size * factor (default 4).  Where the upscaler has joined two
neighbouring tiles into one picture, the picture is split in proportion to their widths.
Writes one PNG per texture and <sheet>_check.png, the original layout rebuilt from the cuts.
"""
import json, os, sys
import numpy as np
from PIL import Image

DARK = 25

def runs(v, th, gap):
    idx = np.where(v > th)[0]; out = []
    if len(idx) == 0: return out
    s = p = idx[0]
    for i in idx[1:]:
        if i - p > gap: out.append((int(s), int(p) + 1)); s = i
        p = i
    out.append((int(s), int(p) + 1)); return out

def trim_bleed(a, left, right, top, bot, t):
    """Some upscalers fill the gap between two tiles with a strip of texture that belongs to no tile,
    and it ends up on one side of the cut. When a cut is wider than the tile's shape allows, find
    the picture in it: its left edge is the sharpest rise in brightness near the start of the cut,
    its right edge the sharpest drop after that. Returns the new (left, right)."""
    want = (bot - top) * t['w'] / t['h']
    if right - left < want * 1.04: return left, right
    prof = a[top:bot, int(left):int(right)].astype(float).mean(axis=0)
    n = len(prof)
    rise = prof[3:] - prof[:-3]
    hi0 = min(n - 4, int(want * 0.25))
    L = int(np.argmax(rise[:hi0])) + 1 if hi0 > 3 and rise[:hi0].max() > 12 else 0
    lo = L + int(want * 0.75); hi = min(n - 4, L + int(want * 1.25))
    if hi <= lo: return left + L, right
    drop = prof[lo:hi] - prof[lo + 3:hi + 3]
    return left + L, left + lo + int(np.argmax(drop)) + 2

def main(manifest, sheet, image, out, factor=4):
    m = json.load(open(manifest)); os.makedirs(out, exist_ok=True)
    im = Image.open(image).convert('RGB'); a = np.asarray(im).max(axis=2)
    tiles = sorted(((n, t) for n, t in m['textures'].items() if t['sheet'] == sheet), key=lambda kv: (kv[1]['y'], kv[1]['x']))
    # expected rows: tiles whose tops are within 8 px of the row's first
    exp_rows = []
    for n, t in tiles:
        if exp_rows and abs(exp_rows[-1][0][1]['y'] - t['y']) <= 8: exp_rows[-1].append((n, t))
        else: exp_rows.append([(n, t)])
    W, H = m['sheets'][sheet]; scale = im.width / W
    gap_v = max(3, int(scale * 1.5)); gap_h = max(6, int(scale * 2))
    rows = runs((a > DARK).sum(axis=1), max(10, im.width // 30), gap_v)
    if len(rows) != len(exp_rows):
        sys.exit(f'found {len(rows)} rows of tiles, expected {len(exp_rows)}: this sheet needs a manual look')
    got = {}
    for (y0, y1), exp in zip(rows, exp_rows):
        cols = runs((a[y0:y1] > DARK).sum(axis=0), 10, gap_h)
        if len(cols) > len(exp):
            sys.exit(f'row at y={y0}: found {len(cols)} tiles, expected {len(exp)}: needs a manual look')
        # which run holds which tiles: by where each tile sits along the row
        xmin = min(t['x'] for _, t in exp); xmax = max(t['x'] + t['w'] for _, t in exp)
        img0, img1 = cols[0][0], cols[-1][1]
        def where( x ): return img0 + ( x - xmin ) / ( xmax - xmin ) * ( img1 - img0 )
        groups = [[] for _ in cols]
        for n, t in exp:
            cx = where( t['x'] + t['w'] / 2 )
            k = min( range( len( cols ) ), key=lambda i: 0 if cols[i][0] <= cx <= cols[i][1] else min( abs( cx - cols[i][0] ), abs( cx - cols[i][1] ) ) )
            groups[k].append( ( n, t ) )
        for ( c0, c1 ), k in zip( cols, groups ):
            if not k: continue
            ys = np.where((a[y0:y1, c0:c1] > DARK).sum(axis=1) > max(2, (c1 - c0) // 20))[0]
            top, bot = y0 + int(ys.min()), y0 + int(ys.max()) + 1
            if len({t['h'] for _, t in exp}) == 1: top, bot = y0, y1
            # tiles joined into one picture are cut where the gaps between them were
            gx0 = min(t['x'] for _, t in k); gx1 = max(t['x'] + t['w'] for _, t in k)
            def at( x ): return c0 + ( x - gx0 ) / ( gx1 - gx0 ) * ( c1 - c0 )
            for i, ( n, t ) in enumerate( k ):
                left = c0 if i == 0 else at( ( k[i - 1][1]['x'] + k[i - 1][1]['w'] + t['x'] ) / 2 )
                right = c1 if i == len( k ) - 1 else at( ( t['x'] + t['w'] + k[i + 1][1]['x'] ) / 2 )
                left, right = trim_bleed(a, left, right, top, bot, t)
                # a tile is as tall as its width says: anything below is the gap to the tall tiles beside it
                bot = min(bot, top + round((right - left) * t['h'] / t['w'] * 1.08))
                got[n] = im.crop((round(left), top, round(right), bot)).resize((t['w'] * factor, t['h'] * factor), Image.LANCZOS)
    check = Image.new('RGB', (W * factor, H * factor))
    for n, t in tiles:
        if n in got:
            got[n].save(os.path.join(out, n.replace('*', 'star_') + '.png'))
            check.paste(got[n], (t['x'] * factor, t['y'] * factor))
    check.save(os.path.join(out, sheet.replace('.png', '') + '_check.png'))
    print('cut', len(got), 'of', len(tiles))

if __name__ == '__main__':
    main(*sys.argv[1:5], *(int(x) for x in sys.argv[5:6]))
