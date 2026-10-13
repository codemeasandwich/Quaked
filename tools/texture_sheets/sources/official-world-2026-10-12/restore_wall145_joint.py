"""Match wall14_5's real wrap mortar to its photographed middle mortar.

Both are the same physical course joint. Borrow the existing middle band with
a half-width phase shift: this preserves the alternating upper/lower T-junctions.
Only the horizontal boundary band changes; no synthetic detail or noise is added.
The retained v2 authoring master is never overwritten. Encoding and independent
visual/public review are separate from this owner-authorized finishing step.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from finish_realistic_edges import smooth


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    assert not args.output.exists() and not args.output.with_suffix('.json').exists()
    original = np.asarray(Image.open(args.input).convert('RGB'))
    h, w = original.shape[:2]
    assert (w, h) == (256, 256)
    distance = np.minimum(np.arange(h), h - np.arange(h))
    weight = 1 - smooth((distance - 4) / 12)
    donor = np.roll(original, (h // 2, w // 2), axis=(0, 1))
    output = np.rint(original * (1 - weight[:, None, None]) +
                     donor * weight[:, None, None]).astype('uint8')
    assert np.array_equal(output[weight == 0], original[weight == 0])
    Image.fromarray(output).save(args.output)
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    receipt = dict(source=str(args.input), sourceSha256=sha(args.input),
                   output=str(args.output), outputSha256=sha(args.output),
                   toolSha256=sha(Path(__file__)), dimensions=[w, h],
                   donorJointY=128, donorHorizontalPhase=128,
                   wrapCorePixels=4, wrapOuterPixels=16,
                   protectedRows=[16, 240], protectedPixels=int((weight == 0).sum() * w),
                   changedPixelFraction=float(np.any(output != original, axis=2).mean()),
                   qualification='Real mortar copied at matching running-bond phase; visual and encoded-map checks remain required.')
    args.output.with_suffix('.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
