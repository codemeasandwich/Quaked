"""Reuse paired boundary-colour finishing with explicit texture-axis semantics.

The previous wrapper always treats both axes as periodic. Some native concrete
textures are vertical transitions; x-only finishing preserves that intention.
This wrapper delegates to the same reviewed implementation and never synthesizes
detail, resamples features, registers assets or declares visual acceptance.
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
implementation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(implementation)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--axes', choices=['x', 'xy'], required=True)
    args = parser.parse_args()
    assert not args.output.exists() and not args.output.with_suffix('.json').exists()
    pixels = np.asarray(Image.open(args.input).convert('RGB'))
    result, allowed, clipping = implementation.finish(pixels, args.axes)
    assert np.array_equal(result[~allowed], pixels[~allowed])
    Image.fromarray(result).save(args.output)
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    record = dict(source=str(args.input), sourceSha256=sha(args.input), output=str(args.output),
                  outputSha256=sha(args.output), axes=args.axes, bandFraction=1/8,
                  unchangedOutsideBands=True, spatialResampling=False,
                  allowedPixelFraction=float(allowed.mean()), clippingFraction=clipping,
                  implementation=str(IMPLEMENTATION), implementationSha256=sha(IMPLEMENTATION),
                  toolSha256=sha(Path(__file__)),
                  qualification='Authoring correction only. x preserves intentional top/bottom transition; visual and renderer checks separate.')
    with args.output.with_suffix('.json').open('x') as f:
        f.write(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record))


if __name__ == '__main__':
    main()
