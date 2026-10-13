"""Finish photographic limestone boundaries with existing reviewed operations.

Default mode applies smooth paired opposite-edge colour offsets. Optional
offset-repair mode blends GPT-authored detail into feathered boundary bands.
Both preserve the central three quarters in each dimension exactly. These
owner-authorized operations do not constitute automatic visual acceptance.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from finish_quiet_edges import finish
from finish_realistic_edges import compose


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--offset-repair', type=Path,
                        help='GPT repair of a half-width/half-height cyclic offset; blend only the boundary cross')
    args = parser.parse_args()
    assert not args.output.exists() and not args.output.with_suffix('.json').exists()
    pixels = np.asarray(Image.open(args.input).convert('RGB'))
    if args.offset_repair:
        repair = np.asarray(Image.open(args.offset_repair).convert('RGB').resize(
            (pixels.shape[1], pixels.shape[0]), Image.Resampling.LANCZOS), dtype=float)
        corrected, allowed = compose(pixels, repair, 'xy')
        clipping = 0.0
    else:
        corrected, allowed, clipping = finish(pixels, 'xy')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(corrected).save(args.output)
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    receipt = dict(source=str(args.input), sourceSha256=sha(args.input),
                   output=str(args.output), outputSha256=sha(args.output),
                   axes='xy', bandFraction=1 / 8, unchangedInterior=True,
                   spatialResampling=False, clippingFraction=clipping,
                   allowedPixelFraction=float(allowed.mean()),
                   implementation=str(Path(__file__).with_name('finish_quiet_edges.py')),
                   implementationSha256=sha(Path(__file__).with_name('finish_quiet_edges.py')),
                   toolSha256=sha(Path(__file__)),
                   qualification='Authoring seam correction; decoded Q92 visual and public checks remain separate.')
    if args.offset_repair:
        implementation = Path(__file__).with_name('finish_realistic_edges.py')
        receipt.update(generatedRepair=str(args.offset_repair), generatedRepairSha256=sha(args.offset_repair),
                       implementation=str(implementation), implementationSha256=sha(implementation),
                       coreFraction=12 / 512, outerHalfWidthFraction=64 / 512,
                       method='GPT cyclic-offset repair confined to feathered boundary cross')
    args.output.with_suffix('.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
