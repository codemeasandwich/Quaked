"""Replay the three reviewed GPT joint patches, without overwriting an asset.

Usage: /usr/bin/python3 city4_8-joint-restoration.py /absolute/new-output.png
Inputs and authority are pinned in city4_8-joint-patches.json. This preserves
the full photographic base outside three narrow bands; it does not reproduce
native pixel stairs. Final coarse colour fitting is a separate CLI receipt.
"""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
record = json.loads((Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / 'city4_8-joint-patches.json').read_text())
output = Path(sys.argv[1])
if output.exists() or output.suffix.lower() != '.png':
    raise ValueError('Provide a new lossless PNG output path')
inputs = []
for field, digest in [('base', 'baseSha256'), ('jointDonor', 'donorSha256')]:
    path = ROOT / record[field]
    if hashlib.sha256(path.read_bytes()).hexdigest() != record[digest]:
        raise ValueError('Pinned input changed: ' + str(path))
    inputs.append(np.asarray(Image.open(path).convert('RGB').resize(
        (512, 512), Image.Resampling.LANCZOS), dtype=float))
base, donor = inputs
result = base.copy()
mask = np.zeros((512, 512))
for patch in record['patches512']:
    x, y0, y1 = (patch[key] for key in ('x', 'y0', 'y1'))
    xs = np.arange(x - 6, x + 7)
    donor_xs = xs + patch.get('donorX', x) - x
    weight = np.clip((6 - np.abs(xs - x)) / 3, 0, 1)
    weight = weight * weight * (3 - 2 * weight)
    shoulders = xs[[0, 1, -2, -1]]
    donor_shoulders = donor_xs[[0, 1, -2, -1]]
    delta = np.mean(base[y0:y1][:, shoulders] - donor[y0:y1][:, donor_shoulders], axis=(0, 1))
    result[y0:y1, xs] = base[y0:y1, xs] * (1 - weight[None, :, None]) + np.clip(
        donor[y0:y1, donor_xs] + delta, 0, 255) * weight[None, :, None]
    mask[y0:y1, xs] = np.maximum(mask[y0:y1, xs], weight)
result = np.round(result).clip(0, 255).astype('uint8')
assert np.array_equal(result[mask == 0], base.astype('uint8')[mask == 0])
Image.fromarray(result).save(output)
if hashlib.sha256(output.read_bytes()).hexdigest() != record['outputSha256']:
    raise AssertionError('Output does not reproduce the reviewed donor')
print('Reproduced exact reviewed donor:', output)
