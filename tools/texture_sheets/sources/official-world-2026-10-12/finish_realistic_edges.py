"""Reproduce the six reviewed photographic boundary-repair candidates.

The owner approved deterministic layout/edge finishing. GPT supplies the new
photographic seam detail in cyclically offset references; this script confines
that detail to the affected boundaries. It never registers assets or declares
visual acceptance. Originals, rejected versions and unmodified interiors remain
available. Run with --output-dir to independently replay into a separate folder.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[3]
CANDIDATES = ROOT / 'newer/textures/candidates-2026-10-12'
CONFIG = [
    ('TF_Wood01', 'y', 0), ('TF_Wood01c', 'y', 0),
    ('TF_Stone_01', 'x', 4), ('TF_Stone3', 'x', 8),
    ('TF_Cliff2', 'xy', 0), ('TF_Cliff2b', 'x', 0),
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def compose(master, repair, axes, courses=0, transition=False, top_source=None):
    h, w = master.shape[:2]
    shift = (0 if transition else h // 2, w // 2)
    shifted = np.roll(master, shift, axis=(0, 1)).astype(float)
    yy, xx = np.mgrid[:h, :w]
    mx = 1 - smooth((np.abs(xx + .5 - w / 2) - w * 12 / 512) / (w * 52 / 512))
    my = 1 - smooth((np.abs(yy + .5 - h / 2) - h * 12 / 512) / (h * 52 / 512))
    mask = np.maximum(mx if 'x' in axes else 0, my if 'y' in axes else 0)
    if courses:
        # Only odd-numbered courses have a continuous stone face at this cut.
        # Even-numbered courses have a real central joint: preserve it exactly.
        course_height = h // courses
        within = (yy + .5) % course_height
        edge_distance = np.minimum(within, course_height - within)
        mask *= ((yy // course_height) % 2 == 0) * smooth((edge_distance - 3) / 5)
    pixels = np.rint(np.clip(shifted * (1 - mask[..., None]) + repair * mask[..., None], 0, 255)).astype('uint8')
    assert np.array_equal(pixels[mask == 0], shifted.astype('uint8')[mask == 0])
    pixels = np.roll(pixels, tuple(-v for v in shift), axis=(0, 1))
    allowed = np.roll(mask > 0, tuple(-v for v in shift), axis=(0, 1))
    if transition:
        assert top_source is not None and top_source.shape == master.shape
        # This source deliberately transitions downward. Share the bare cliff's
        # top edge, then feather into the earth transition; never wrap bottom to top.
        weight = 1 - smooth((np.arange(h) + .5 - h / 16) / (h / 16))
        pixels = np.rint(pixels * (1 - weight[:, None, None]) + top_source * weight[:, None, None]).astype('uint8')
        allowed |= weight[:, None] > 0
    assert np.array_equal(pixels[~allowed], master[~allowed])
    return pixels, allowed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=CANDIDATES)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    outputs = {}
    for name, axes, courses in CONFIG:
        master_path = CANDIDATES / f'{name}-realistic-4x.png'
        repair_path = SOURCE / f'{name}-offset-repair-v1.png'
        output = args.output_dir / f'{name}-realistic-seam-v2-4x.png'
        record = output.with_suffix('.json')
        assert not output.exists() and not record.exists(), 'Preserve earlier attempts'
        with Image.open(master_path) as image:
            master = np.asarray(image.convert('RGB'))
        h, w = master.shape[:2]
        with Image.open(repair_path) as image:
            repair = np.asarray(image.convert('RGB').resize((w, h), Image.Resampling.LANCZOS), dtype=float)
        transition = name == 'TF_Cliff2b'
        pixels, allowed = compose(master, repair, axes, courses, transition, outputs.get('TF_Cliff2'))
        Image.fromarray(pixels).save(output)
        outputs[name] = pixels
        receipt = dict(qualification='Authoring seam candidate; Q92 and independent visual/renderer review required',
                       name=name, dimensions=[w, h], axes=axes, courses=courses,
                       master=str(master_path), masterSha256=sha(master_path),
                       generatedRepair=str(repair_path), generatedRepairSha256=sha(repair_path),
                       toolSha256=sha(Path(__file__)), output=str(output), outputSha256=sha(output),
                       changedPixelFraction=float(np.any(pixels != master, axis=2).mean()),
                       allowedPixelFraction=float(allowed.mean()), outsideBandUnchanged=True,
                       coreFraction=12 / 512, outerHalfWidthFraction=64 / 512,
                       topSource='TF_Cliff2-realistic-seam-v2-4x.png' if transition else None,
                       verticalTransitionPreserved=transition)
        record.write_text(json.dumps(receipt, indent=2) + '\n')
        print(name, [w, h], receipt['changedPixelFraction'])


if __name__ == '__main__':
    main()
