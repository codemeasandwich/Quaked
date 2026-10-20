#!/usr/bin/env python3
"""Falsify a shared photographic edge guide without authoring a guide/height."""
from pathlib import Path
import hashlib
import json
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
SOURCE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008/relief/ttex054-guide-draft-v2/coating-hypothesis-and-edge-measurements.json'


def main():
    source = json.loads(SOURCE.read_text())
    profiles = source['goldAndDarkSourceProfiles']
    if len(profiles) != 4:
        raise ValueError('Expected the four actual previously measured spans')
    raw = np.array([row['sourceRowMedianLuminance'] for row in profiles])
    if raw.shape != (4,31) or not np.isfinite(raw).all() or (raw <= 0).any():
        raise ValueError('Invalid source profiles')
    # Each exposure scalar is fixed by its whole core, never fitted per row.
    normalized = raw / np.median(raw[:,8:17], axis=1)[:,None]
    rows = []
    for index, source_profile in enumerate(profiles):
        guide = np.median(np.delete(normalized,index,axis=0),axis=0)
        ratio = normalized[index]/guide
        rows.append(dict(label=source_profile['label'],ratioMinMax=[float(ratio.min()),float(ratio.max())],
            rms=float(np.sqrt(np.mean((ratio-1)**2))),
            topRimRatio=float(np.median(ratio[7:10])),bottomRimRatio=float(np.median(ratio[18:21])),
            aboveRatio=float(np.median(ratio[:6])),belowRatio=float(np.median(ratio[23:29]))))
    report = dict(schemaVersion=1,
        scope='Pre-wrapper falsification of ONE shared horizontal edge profile: four held-out actual source strokes, per-stroke single exposure ratio allowed for diagnostic only.',
        status='HOLD: shared profile does not transfer without spatial nuisance fitting',
        source=str(SOURCE.relative_to(ROOT)),sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        method='Leave one out: normalize each entire 31-row profile by its core-gold median, guide=median other three; ratio=withheld/guide. No per-row fit of withheld source.',
        results=rows,
        meaning='Ratio deviations are source-dependent nuisance residual, not authored height; changing relief amplitude cannot establish guide correctness.')
    (HERE/'shared-profile-falsification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(measuredProfiles=len(rows),ratioRms=[row['rms'] for row in rows])))


if __name__ == '__main__':
    main()
