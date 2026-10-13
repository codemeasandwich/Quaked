"""Restore TF_Stone3's native even-course wrap mortar using its own real joint.

The seam-v2 mask preserved a crop edge where courses 2/4/6/8 should have mortar.
Reuse the photographed middle joint of those same courses in a narrow feathered
wrap band. This adds no new material/grain and leaves horizontal mortar intact.
Only the authoring candidate changes; Q92 encoding and visual review follow.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

SOURCE = Path(__file__).resolve().parent
CANDIDATES = SOURCE.parents[3] / 'newer/textures/candidates-2026-10-12'


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=CANDIDATES / 'TF_Stone3-realistic-seam-v3-4x.png')
    args = parser.parse_args()
    master = CANDIDATES / 'TF_Stone3-realistic-seam-v2-4x.png'
    assert not args.output.exists() and not args.output.with_suffix('.json').exists()
    with Image.open(master) as im:
        original = np.asarray(im.convert('RGB'))
    h, w = original.shape[:2]
    assert (w, h) == (512, 512)
    yy, xx = np.mgrid[:h, :w]
    edge_distance = np.minimum(xx, w - xx)
    within = (yy + .5) % (h // 8)
    mortar_distance = np.minimum(within, h // 8 - within)
    mask = (1 - smooth((edge_distance - 2) / 6)) * ((yy // (h // 8)) % 2 == 1) * smooth((mortar_distance - 2) / 2)
    donor = original[:, (np.arange(w) + w // 2) % w]
    pixels = np.rint(original * (1 - mask[..., None]) + donor * mask[..., None]).astype('uint8')
    assert np.array_equal(pixels[mask == 0], original[mask == 0])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels).save(args.output)
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    record = dict(qualification='Unregistered authoring correction; encoded image and visual review required',
                  master=str(master), masterSha256=sha(master), output=str(args.output), outputSha256=sha(args.output),
                  toolSha256=sha(Path(__file__)), restoredCourses=[2, 4, 6, 8], donorJointX=256,
                  wrapCorePixels=2, wrapOuterPixels=8, horizontalMortarProtectedPixels=2,
                  changedPixelFraction=float(np.any(pixels != original, axis=2).mean()), outsideBandUnchanged=True)
    args.output.with_suffix('.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record))


if __name__ == '__main__':
    main()
