#!/usr/bin/env python3
"""Remove the dark border the upscaler leaves round a texture.

    python3 fix_edges.py wall-sheets/manifest.json wall-sheets newer/textures

A texture repeats across a surface, so a dark line at its edge shows as a gap in a grid.
For every texture in newer/textures the outermost rows and columns are compared with the
same rows of the original texture (enlarged); the ones that are much darker than they
should be are cut away and the rest is scaled back to full size.
"""
import json, os, sys
import numpy as np
from PIL import Image

def lines_to_cut(new, ref, maxk):
    """how many leading lines (from the edge) are far darker than the original's"""
    k = 0
    for i in range(maxk):
        n = new[i].mean(); r = ref[i].mean()
        if r < 12 or n >= 0.62 * r: break
        k += 1
    return k

def fix(path, orig):
    im = Image.open(path).convert('RGB'); W, H = im.size
    a = np.asarray(im.convert('L'), dtype=float)
    ref = np.asarray(orig.resize((W, H), Image.LANCZOS).convert('L'), dtype=float)
    maxk = max(4, int(min(W, H) * 0.05))
    top = lines_to_cut(a, ref, maxk); bottom = lines_to_cut(a[::-1], ref[::-1], maxk)
    left = lines_to_cut(a.T, ref.T, maxk); right = lines_to_cut(a.T[::-1], ref.T[::-1], maxk)
    if top + bottom + left + right == 0: return None
    # one extra line: the blend between the dark border and the picture
    l, t, r, b = (left + 1 if left else 0), (top + 1 if top else 0), (right + 1 if right else 0), (bottom + 1 if bottom else 0)
    im.crop((l, t, W - r, H - b)).resize((W, H), Image.LANCZOS).save(path, quality=92)
    return (left, top, right, bottom)

def main(manifest, sheets, textures):
    m = json.load(open(manifest))
    sheet_cache = {}
    for f in sorted(os.listdir(textures)):
        if not f.endswith('.webp'): continue
        name = f[:-5]
        key = '+' + name[2:] if name.startswith('p_') else name
        t = m['textures'].get(key)
        if t is None: continue
        if t['sheet'] not in sheet_cache: sheet_cache[t['sheet']] = Image.open(os.path.join(sheets, t['sheet'])).convert('RGB')
        orig = sheet_cache[t['sheet']].crop((t['x'], t['y'], t['x'] + t['w'], t['y'] + t['h']))
        cut = fix(os.path.join(textures, f), orig)
        if cut is not None: print(f, 'cut (l,t,r,b)', cut)

if __name__ == '__main__':
    main(*sys.argv[1:4])
