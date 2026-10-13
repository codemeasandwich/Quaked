"""Reconcile tonal crop joins in four smooth photographic metal materials.

These surfaces have continuous horizontal geometry. Unlike the earlier wood
and stone repairs, they need no new detail: a smooth, paired colour correction
removes the boundary tone jump without moving or blurring surface features.
The owner authorized deterministic edge finishing. Inputs are retained; outputs
are authoring candidates requiring separate Q92 encoding and visual review.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

SOURCE = Path(__file__).resolve().parent
CANDIDATES = SOURCE.parents[3] / 'newer/textures/candidates-2026-10-12'
CONFIG = [('TF_Metal_02', 'xy'), ('metal1_2c', 'x'), ('TF_Metal4_6a', 'x'), ('cable1_1', 'x')]


def smooth_line(line, sigma):
    frequency = np.fft.fftfreq(len(line))
    kernel = np.exp(-2 * np.pi ** 2 * sigma ** 2 * frequency ** 2)
    return np.fft.ifft(np.fft.fft(line, axis=0) * kernel[:, None], axis=0).real


def finish(pixels, axes):
    result = pixels.astype(float)
    h, w = result.shape[:2]
    allowed = np.zeros((h, w), dtype=bool)
    for axis in axes:
        vertical = axis == 'y'
        image = result.transpose(1, 0, 2) if vertical else result
        along, across = image.shape[:2]
        band = across // 8
        distance = np.arange(across, dtype=float)
        t = np.clip(distance / band, 0, 1)
        fade = 1 - t * t * (3 - 2 * t)
        # Equal/opposite correction preserves each line's mean before clipping.
        # Only low-frequency boundary colour is corrected; no spatial resampling.
        delta = smooth_line(image[:, 0] - image[:, -1], max(1, along / 128))
        image += .5 * delta[:, None, :] * (fade[::-1] - fade)[None, :, None]
        band_mask = np.broadcast_to((fade > 0) | (fade[::-1] > 0), (along, across))
        allowed |= band_mask.T if vertical else band_mask
    output = np.rint(np.clip(result, 0, 255)).astype('uint8')
    assert np.array_equal(output[~allowed], pixels[~allowed])
    return output, allowed, float(np.mean((result < 0) | (result > 255)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=CANDIDATES)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    for name, axes in CONFIG:
        source = CANDIDATES / f'{name}-quiet-4x.png'
        output = args.output_dir / f'{name}-quiet-seam-v2-4x.png'
        assert not output.exists() and not output.with_suffix('.json').exists()
        with Image.open(source) as image:
            pixels = np.asarray(image.convert('RGB'))
        repaired, allowed, clipping = finish(pixels, axes)
        Image.fromarray(repaired).save(output)
        receipt = dict(name=name, axes=axes, source=str(source), sourceSha256=sha(source),
                       output=str(output), outputSha256=sha(output), toolSha256=sha(Path(__file__)),
                       dimensions=list(Image.fromarray(repaired).size), bandFraction=1 / 8,
                       unchangedInterior=True, spatialResampling=False, clippingFraction=clipping,
                       allowedPixelFraction=float(allowed.mean()),
                       qualification='Smooth paired boundary-colour correction only; visual/Q92/renderer review separate')
        output.with_suffix('.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(name, receipt['dimensions'], 'clipping', clipping)


if __name__ == '__main__':
    main()
