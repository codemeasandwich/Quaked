#!/usr/bin/env python3
"""Read-only ttex054 source measurements; emits diagnostics, never relief.

The old skeleton is only a search aid. Actual one-dimensional chromaticity
profiles determine each straight segment's two crossings independently.
These crossings do not establish complete corner/edge alpha coverage.
"""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
BATCH = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
SOURCE = BATCH / 'masters/ttex054/color.png'


def main():
    rgb = np.asarray(Image.open(SOURCE).convert('RGB'), dtype=np.float64)/255
    chroma = rgb / np.maximum(rgb.sum(axis=2, keepdims=True), 1e-9)
    # Gold and dark observed normalized RGB separate along R-B; no luminance
    # selection or classification of physical wear is performed.
    score = chroma[:,:,0] - chroma[:,:,2]
    hypothesis = json.loads((HERE/'prior-meander-hypothesis.json').read_text())
    rows = []
    draw_image = Image.open(SOURCE).convert('RGB').crop((0,570,512,651)).resize((1536,243))
    draw = ImageDraw.Draw(draw_image)
    for pi, points in enumerate(hypothesis['paths']):
        for si, (a,b) in enumerate(zip(points, points[1:])):
            horizontal = a[1] == b[1]
            length = abs((a[0]-b[0]) if horizontal else (a[1]-b[1]))
            if length < 20:
                continue
            lo, hi = sorted((a[0],b[0]) if horizontal else (a[1],b[1]))
            lo=max(lo+8,0); hi=min(hi-8,512 if horizontal else 1024)
            if hi-lo<5:
                continue
            centre = a[1] if horizontal else a[0]
            coords = np.arange(centre-10,centre+11)
            if coords.min()<0 or coords.max()>=(1024 if horizontal else 512):
                continue
            samples = score[coords,lo:hi] if horizontal else score[lo:hi,coords].T
            profile = np.median(samples,axis=1)
            selected = np.flatnonzero(profile > .28)
            if not len(selected):
                continue
            low=coords[selected.min()]-.5; high=coords[selected.max()]+.5
            label=f'P{pi+1}S{si+1}'
            rows.append(dict(label=label,orientation='horizontal' if horizontal else 'vertical',
                searchCentre=centre,profileSpan=[lo,hi],pixelCentreCoordinates=coords.tolist(),
                medianRedMinusBlueChromaticity=profile.tolist(),threshold=.28,
                crossingsPixelEdges=[float(low),float(high)],
                scope='Median-profile crossings only; roughness, antialiasing and corner alpha unresolved'))
            box=(lo,low,hi,high) if horizontal else (low,lo,high,hi)
            box=(box[0]*3,(box[1]-570)*3,box[2]*3,(box[3]-570)*3)
            draw.rectangle(box,outline='#28ffff',width=1)
            draw.text((box[0]+2,box[1]+2),label,fill='white')
    draw_image.save(HERE/'measured-straight-stroke-spans.png')
    report=dict(schemaVersion=1,status='DIAGNOSTIC ONLY - NOT A COMPLETE GUIDE',
        source=dict(file=str(SOURCE.relative_to(ROOT)),sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest()),
        nativeIdentity='cddf441f348f0a3182edadeeeb9028ece70c2eadbef541955e7197f8213c9752',
        method='Actual median normalized RGB R-B profile at each straight segment; old skeleton restricts search only; no intensity threshold.',
        limitations=['No per-pixel paint alpha or corner trace.',
                    'Threshold is an observed hue separation proxy, not material/depth evidence.',
                    'Gold edge baked illumination cannot be identified uniquely from one RGB photograph.'],
        straightSegments=rows,effects='Diagnostic measurements and overlay only. RGB/height/raw/prompt/producers unchanged.')
    (HERE/'edge-measurements.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(measuredSegments=len(rows),output=str(HERE/'edge-measurements.json'))))


if __name__ == '__main__':
    main()
