#!/usr/bin/env python3
"""Line up the frames of the animated textures (+0name, +1name, ...) so the picture does not wobble.

    python3 tools/align_frames.py [--dry] [family ...]

Each frame of an animated texture was cut out of the upscaled sheet on its own, so the frames can sit
a few pixels (sometimes a fraction of one) off from each other. Flipping between them, a still bezel or
frame then jitters. For every family this finds how far each frame has moved relative to the first, using
only the parts of the picture that stay the same from frame to frame (the bezel, the background), and
shifts the frame back (bicubic, edge pixels repeated). The normal maps are made again afterwards
(tools/craft_normals.py), because they are made from these pictures.
"""
import json, os, sys
import numpy as np
from PIL import Image

TEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'newer', 'textures')

def grad(a):
    gx = np.zeros_like(a); gy = np.zeros_like(a)
    gx[:, 1:-1] = a[:, 2:] - a[:, :-2]; gy[1:-1] = a[2:] - a[:-2]
    return gx, gy

def xcorr_shift(ref, img, mask):
    """How far img must be moved to sit on ref (dx, dy in pixels), from the gradients inside mask."""
    rx, ry = grad(ref); ix, iy = grad(img)
    w = mask.astype(np.float32)
    tot = 0
    for r, i in ((rx, ix), (ry, iy)):
        A = np.fft.rfft2(r * w); B = np.fft.rfft2(i * w)
        tot = tot + np.fft.irfft2(A * np.conj(B), s=ref.shape)
    y, x = np.unravel_index(np.argmax(tot), tot.shape); h, wd = tot.shape
    def peak(m, c, p):
        return 0.5 * ( m - p ) / ( m - 2 * c + p + 1e-9 )
    dx = x + peak(tot[y, (x - 1) % wd], tot[y, x], tot[y, (x + 1) % wd])
    dy = y + peak(tot[(y - 1) % h, x], tot[y, x], tot[(y + 1) % h, x])
    if dx > wd / 2: dx -= wd
    if dy > h / 2: dy -= h
    return float(dx), float(dy)

def shifted(a, dx, dy):
    """a moved by (dx, dy): bicubic, edge pixels repeated (a is h x w x 3 floats)."""
    h, w = a.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    sx = np.clip(xs - dx, 0, w - 1); sy = np.clip(ys - dy, 0, h - 1)
    x0 = np.floor(sx).astype(int); y0 = np.floor(sy).astype(int); fx = (sx - x0)[..., None]; fy = (sy - y0)[..., None]
    def cubic(t, p0, p1, p2, p3):
        return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
    rows = []
    for k in (-1, 0, 1, 2):
        yy = np.clip(y0 + k, 0, h - 1)
        cols = [a[yy, np.clip(x0 + m, 0, w - 1)] for m in (-1, 0, 1, 2)]
        rows.append(cubic(fx, *cols))
    return np.clip(cubic(fy, *rows), 0, 255)

def align_family(names, index, dry=False):
    imgs = [np.asarray(Image.open(os.path.join(TEX, index[n])).convert('RGB'), dtype=np.float32) for n in names]
    if len({i.shape for i in imgs}) != 1: return None
    lum = [i @ np.array([0.299, 0.587, 0.114], np.float32) for i in imgs]
    shifts = [(0.0, 0.0)] * len(imgs)
    for _ in range(3):
        moved = [shifted(i, -dx, -dy) @ np.array([0.299, 0.587, 0.114], np.float32) if (dx or dy) else l
                 for i, l, (dx, dy) in zip(imgs, lum, shifts)]
        med = np.median(np.stack(moved), axis=0)
        # the parts that stay the same from frame to frame
        diff = np.max(np.stack([np.abs(m - med) for m in moved]), axis=0)
        mask = diff < 18
        # (and with some detail in them)
        gx, gy = grad(med); mask &= np.hypot(gx, gy) > 6
        if mask.sum() < 400: return None
        shifts = [xcorr_shift(moved[0], l, mask) if k else (0.0, 0.0) for k, l in enumerate(lum)]
        shifts = [(-a, -b) if False else (a, b) for a, b in shifts]
    return shifts, imgs

def main(args):
    dry = '--dry' in args; args = [a for a in args if a != '--dry']
    p = os.path.join(TEX, 'index.json'); idx = json.load(open(p)); tex = idx['textures']
    fams = {}
    for n in tex:
        if n.startswith('+') and len(n) > 2: fams.setdefault(n[2:], []).append(n)
    changed = 0
    for fam, names in sorted(fams.items()):
        if args and fam not in args: continue
        names = sorted(names, key=lambda n: (n[1].isalpha(), n[1]))
        if len(names) < 2: continue
        r = align_family(names, tex)
        if r is None: print(fam, 'skipped (different sizes, or nothing still to line up on)'); continue
        shifts, imgs = r
        print(fam, [(n, round(dx, 2), round(dy, 2)) for n, (dx, dy) in zip(names, shifts)])
        if dry: continue
        for n, (dx, dy), im in zip(names, shifts, imgs):
            if abs(dx) < 0.5 and abs(dy) < 0.5: continue  # less than half a pixel is not seen
            out = shifted(im, -dx, -dy)   # the frame moves back by how far it was off
            Image.fromarray(out.astype(np.uint8)).save(os.path.join(TEX, tex[n]), quality=92, method=6)
            changed += 1
    if not dry and changed:
        idx['version'] = int(idx['version']) + 1; json.dump(idx, open(p, 'w'), indent=1)
    print(changed, 'frames moved')

if __name__ == '__main__':
    main(sys.argv[1:])
