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
        # split joined pictures: the expected widths decide how many tiles each run holds
        total = sum(t['w'] for _, t in exp)
        if len(cols) > len(exp):
            sys.exit(f'row at y={y0}: found {len(cols)} tiles, expected {len(exp)}: needs a manual look')
        # assign tiles to runs in order, by width proportion
        span = sum(c1 - c0 for c0, c1 in cols)
        pos = 0; assign = []
        for c0, c1 in cols:
            share = (c1 - c0) / span * total
            k = []; acc = 0
            while pos < len(exp) and (not k or acc + exp[pos][1]['w'] / 2 <= share):
                k.append(exp[pos]); acc += exp[pos][1]['w']; pos += 1
            assign.append(((c0, c1), k))
        if pos < len(exp): assign[-1][1].extend(exp[pos:])
        for (c0, c1), k in assign:
            ys = np.where((a[y0:y1, c0:c1] > DARK).sum(axis=1) > max(2, (c1 - c0) // 20))[0]
            top, bot = y0 + int(ys.min()), y0 + int(ys.max()) + 1
            kw = sum(t['w'] for _, t in k); x = c0
            for n, t in k:
                w = (c1 - c0) * t['w'] / kw
                got[n] = im.crop((round(x), top, round(x + w), bot)).resize((t['w'] * factor, t['h'] * factor), Image.LANCZOS)
                x += w
    check = Image.new('RGB', (W * factor, H * factor))
    for n, t in tiles:
        if n in got:
            got[n].save(os.path.join(out, n.replace('*', 'star_') + '.png'))
            check.paste(got[n], (t['x'] * factor, t['y'] * factor))
    check.save(os.path.join(out, sheet.replace('.png', '') + '_check.png'))
    print('cut', len(got), 'of', len(tiles))

if __name__ == '__main__':
    main(*sys.argv[1:5], *(int(x) for x in sys.argv[5:6]))
