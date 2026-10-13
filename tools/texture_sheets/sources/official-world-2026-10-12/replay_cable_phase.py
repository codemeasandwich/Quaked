"""Replay the recorded photographic cable ridge fit without regenerating art.

The two GPT drafts had ten visible crests. The recorded native landmarks fit
eleven crests using monotonic vertical sampling and cyclic reuse of the same
photographed donor. Horizontal material detail is never resampled. This is
authoring provenance, not a texture registration or visual acceptance step.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    assert not args.output.exists(), 'Preserve previous authoring artifacts'
    source = Path(__file__).resolve().parent
    record = json.loads((source / 'cable1_1-phase-v3.json').read_text())
    donor_path = source / 'cable1_1-generated-realistic-v1.png'
    assert hashlib.sha256(donor_path.read_bytes()).hexdigest() == record['donorSha256']
    original = np.asarray(Image.open(donor_path).convert('RGB'), dtype=float)
    h, w = original.shape[:2]
    targets = np.asarray(record['originalCrestNativeY'], dtype=float)
    donors = np.asarray(record['measuredDonorCrestNativeY'], dtype=float)
    assert targets[0] == 0 and targets[-1] == 64 and np.all(np.diff(targets) > 0)
    assert targets.shape == donors.shape and np.all(np.diff(donors) > 0)
    position = np.interp(np.arange(h) * 64 / h, targets, donors) * h / 64
    lo = np.floor(position).astype(int)
    fraction = (position - lo)[:, None, None]
    pixels = np.round(original[lo % h] * (1 - fraction) + original[(lo + 1) % h] * fraction).astype('uint8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels).save(args.output)
    assert hashlib.sha256(args.output.read_bytes()).hexdigest() == record['outputSha256']
    print(json.dumps({'exactReplay': True, 'dimensions': [w, h], 'output': str(args.output)}))


if __name__ == '__main__':
    main()
