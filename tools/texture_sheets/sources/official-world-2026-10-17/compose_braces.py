"""Confine new GPT crossbrace artwork to source-positioned brace bands.

The approved photographic base supplies unchanged plank interiors and vertical
wrap. Existing paired edge-colour correction reconciles the brace's x-wrap,
then a narrow feather incorporates its physical edge shading. No material
detail is synthesized. Output remains an authoring candidate until reviewed.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image

IMPLEMENTATION = Path(__file__).parent.parent / 'official-world-2026-10-12/finish_quiet_edges.py'
spec = importlib.util.spec_from_file_location('reviewed_quiet_edges', IMPLEMENTATION)
edges = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edges)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, required=True)
    parser.add_argument('--donor', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--layout', choices=['one', 'two'], required=True)
    args = parser.parse_args()
    assert not args.output.exists() and not args.output.with_suffix('.json').exists()
    base = np.asarray(Image.open(args.base).convert('RGB'))
    donor = np.asarray(Image.open(args.donor).convert('RGB'))
    assert base.shape == donor.shape == (512, 512, 3)
    donor, _, clipping = edges.finish(donor, 'x')
    bands = [(192, 320)] if args.layout == 'one' else [(64, 128), (384, 448)]
    yy = np.arange(512) + .5
    weight = np.zeros(512)
    for top, bottom in bands:
        distance = np.maximum(top - yy, yy - bottom)
        t = np.clip(distance / 8, 0, 1)
        weight = np.maximum(weight, 1 - t * t * (3 - 2 * t))
    output = np.rint(base * (1 - weight[:, None, None]) + donor * weight[:, None, None]).astype('uint8')
    assert np.array_equal(output[weight == 0], base[weight == 0])
    Image.fromarray(output).save(args.output)
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    receipt = dict(base=str(args.base), baseSha256=sha(args.base), donor=str(args.donor),
                   donorSha256=sha(args.donor), output=str(args.output), outputSha256=sha(args.output),
                   dimensions=[512, 512], braceBands=bands, featherPixels=8,
                   donorEdgeAxes='x', donorClippingFraction=clipping,
                   protectedPixelCount=int(np.sum(weight == 0) * 512),
                   unchangedOutsideBands=True,
                   implementation=str(IMPLEMENTATION.resolve().relative_to(Path.cwd().resolve())),
                   implementationSha256=sha(IMPLEMENTATION), toolSha256=sha(Path(__file__)),
                   qualification='Source-positioned brace composition; encoded visual/source/renderer qualification separate.')
    with args.output.with_suffix('.json').open('x') as f:
        f.write(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
