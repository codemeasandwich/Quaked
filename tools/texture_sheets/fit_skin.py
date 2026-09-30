#!/usr/bin/env python3
"""Put an upscaler's redrawn skin back on the model's UV layout, part by part.

    python3 fit_skin.py original.png upscaled.png out.png <factor> parts.json

When the upscaler has redrawn the picture rather than just enlarging it, the pieces of the skin
(the body's front and back, the straps, ...) are no longer where the model expects them. parts.json
lists, per piece, the box it has in the upscaled picture and the box it must have in the original
(both [left, top, right, bottom]); each piece is resized into place over the original skin enlarged
by <factor>, its edge colours are carried a few pixels outward (so the model never shows the black
around a piece), and whatever is not listed (a gun, a flame) stays the original's.
"""
import json, sys
import numpy as np
from PIL import Image

def spread(arr, mask, n):
    arr = arr.astype(np.float32); mask = mask.copy()
    for _ in range(n):
        acc = np.zeros_like(arr); cnt = np.zeros(mask.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0: continue
                m = np.roll(np.roll(mask, dy, 0), dx, 1); a = np.roll(np.roll(arr, dy, 0), dx, 1)
                acc += a * m[..., None]; cnt += m
        new = (~mask) & (cnt > 0)
        arr[new] = acc[new] / cnt[new][..., None]; mask |= new
    return arr.astype(np.uint8), mask

def main(orig, new, out, factor, parts, dark=16, bleed=10):
    o = Image.open(orig).convert('RGB'); W, H = o.width * factor, o.height * factor
    canvas = np.asarray(o.resize((W, H), Image.LANCZOS)).copy()
    n = Image.open(new).convert('RGB')
    for p in parts:
        sl, st, sr, sb = p['src']; dl, dt, dr, db = [v * factor for v in p['dst']]
        sx = (dr - dl) / (sr - sl); sy = (db - dt) / (sb - st)
        m = bleed  # margin, in canvas pixels
        mx, my = m / sx, m / sy
        crop = n.crop((round(sl - mx), round(st - my), round(sr + mx), round(sb + my)))
        tw, th = round(dr - dl + 2 * m), round(db - dt + 2 * m)
        piece = np.asarray(crop.resize((tw, th), Image.LANCZOS))
        inner = piece.max(2) > dark
        # the piece's own pixels only; then carry the colours outward
        piece, mask = spread(piece, inner, m)
        x0, y0 = round(dl - m), round(dt - m)
        for y in range(th):
            cy = y0 + y
            if not 0 <= cy < H: continue
            xs = np.arange(tw); cx = x0 + xs; ok = (cx >= 0) & (cx < W) & mask[y]
            canvas[cy, cx[ok]] = piece[y, xs[ok]]
    Image.fromarray(canvas).save(out, quality=92, method=6) if out.endswith('.webp') else Image.fromarray(canvas).save(out)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), json.load(open(sys.argv[5])))
