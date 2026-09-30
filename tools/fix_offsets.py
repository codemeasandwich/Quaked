#!/usr/bin/env python3
"""Move upscaled textures back onto the original's layout.

    python3 tools/fix_offsets.py [--dry] [name ...]     (run from the repo root; needs wall-sheets/)

An upscaler can shift a picture by a few texels, and a brush edge or a panel that was lined up with the
original then looks slightly off. This compares each texture (blurred, at 4x the original size) with
the original it replaces, finds how far it moved, and moves it back (bicubic; tiling textures wrap round,
the rest repeat their edge). Only clear cases are touched: the match must be good and much better than at
no shift. Crates, ammo and item pictures are left out (they are fitted by hand). Run
tools/craft_normals.py on the ones changed afterwards.
"""
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'texture_sheets'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageFilter
from _match_orig import orig
from align_frames import shifted

S = 4; W = 4 * S
SKIP = ('crate', 'nail', 'key', 'exit', 'box', 'ammo', 'armor', 'backpack', 'suit', 'health', 'med', 'wenter', 'enter')
NOWRAP = ('door', 'adoor', 'window', 'slip', 'light', 'tlight', 'switch', 'mswtch', 'plat', 'carch', 'altarb')

def prep(im, w, h, rs):
    g = im.convert('L').resize((w * S, h * S), rs).filter(ImageFilter.GaussianBlur(S * 0.8))
    a = np.asarray(g, dtype=np.float32); return (a - a.mean()) / (a.std() + 1e-6)

def measure(n, fn):
    o = orig[n]; w, h = o.size; im = Image.open(fn).convert('RGB')
    a = prep(o, w, h, Image.BICUBIC); b = prep(im, w, h, Image.LANCZOS)
    t = np.fft.irfft2(np.fft.rfft2(a) * np.conj(np.fft.rfft2(b)), s=a.shape) / a.size
    H, Wd = t.shape; best = (-9, 0, 0)
    for dy in range(-W, W + 1):
        for dx in range(-W, W + 1):
            if t[dy % H, dx % Wd] > best[0]: best = (t[dy % H, dx % Wd], dx, dy)
    v, dx, dy = best
    pk = lambda m, c, p: 0.5 * (m - p) / (m - 2 * c + p + 1e-9)
    sx = dx + pk(t[dy % H, (dx - 1) % Wd], v, t[dy % H, (dx + 1) % Wd]); sy = dy + pk(t[(dy - 1) % H, dx % Wd], v, t[(dy + 1) % H, dx % Wd])
    return float(v), float(t[0, 0]), sx / S, sy / S, im

def main(args):
    dry = '--dry' in args; args = [a for a in args if a != '--dry']
    p = 'newer/textures/index.json'; idx = json.load(open(p)); tex = idx['textures']; done = []
    for n, f in tex.items():
        if n not in orig or n.startswith('+') or (args and n not in args): continue
        if not args and n.startswith(SKIP): continue
        fn = 'newer/textures/' + f
        v, z, dx, dy, im = measure(n, fn)
        if not args and not (v >= 0.5 and v - z >= 0.08 and max(abs(dx), abs(dy)) >= 0.6): continue
        print('%-10s moved by (%.2f, %.2f) texels   match %.2f (was %.2f)' % (n, dx, dy, v, z))
        if dry: continue
        a = np.asarray(im, dtype=np.float32); k = a.shape[1] / orig[n].size[0]   # pixels per texel
        pad = int(abs(max(dx, dy, key=abs)) * k) + 8
        wrap = not n.startswith(NOWRAP)
        ap = np.pad(a, ((pad, pad), (pad, pad), (0, 0)), 'wrap' if wrap else 'edge')
        out = shifted(ap, dx * k, dy * k)[pad:-pad, pad:-pad]
        Image.fromarray(out.astype(np.uint8)).save(fn, quality=92, method=6); done.append(n)
    if done:
        idx['version'] = int(idx['version']) + 1; json.dump(idx, open(p, 'w'), indent=1)
        print('python3 tools/craft_normals.py ' + ' '.join(done))
    print(len(done), 'moved')

if __name__ == '__main__':
    main(sys.argv[1:])
