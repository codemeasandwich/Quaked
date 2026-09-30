#!/usr/bin/env python3
"""Cut upscaled sheets back into one PNG per texture.

    python3 slice_sheets.py manifest.json upscaled_dir out_dir

upscaled_dir holds the upscaled sheets under the same file names as the originals.
The upscale factor is worked out from each sheet's size, so any whole factor
(2x, 4x ...) works, but the sheet's shape must not change (no cropping, no padding).
"""
import json, os, sys
from PIL import Image

def main(manifest, src, out):
    m = json.load(open(manifest)); os.makedirs(out, exist_ok=True)
    cache = {}
    for name, t in m['textures'].items():
        fn = t['sheet']
        if fn not in cache:
            p = os.path.join(src, fn)
            if not os.path.exists(p): cache[fn] = None
            else: cache[fn] = Image.open(p).convert('RGB')
        im = cache[fn]
        if im is None: continue
        W, H = m['sheets'][fn]; sx = im.width / W; sy = im.height / H
        box = (round(t['x'] * sx), round(t['y'] * sy), round((t['x'] + t['w']) * sx), round((t['y'] + t['h']) * sy))
        safe = name.replace('*', 'star_')
        im.crop(box).save(os.path.join(out, safe + '.png'))
    print('done', sum(1 for v in cache.values() if v is not None), 'sheets')

if __name__ == '__main__':
    main(*sys.argv[1:4])
