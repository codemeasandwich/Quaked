"""Planning-only correct-owner source crops and exact proposed continuation counts."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

J = Path(__file__).resolve().parent
R = J.parents[6]
D = J.parent / 'diagnostic-v2'
source = R / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-11-rtex388/masters/rtex388-v1/color.png'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
relative = lambda p: str(p.relative_to(R))
assert sha(source) == '2faa2ec6b26ba7e0700b18101bb5c1a64a865541274562f8ebc895e7aced90ea'
im = Image.open(source).convert('RGB')
result = json.loads((D / 'runs/actual-v1/result.json').read_text())
assert all(sha(R / path) == digest for path, digest in result['firstInputHashes'].items())
# Signed chart coordinates; no paths are searched or composited.
branches = [
    {'id':'pp-X', 'kind':'X', 'quadrant':[1,1], 'bridge':[25,42], 'start':[25,43], 'end':[26,80], 'states':[24,48]},
    {'id':'pp-Y', 'kind':'Y', 'quadrant':[1,1], 'bridge':[25,41], 'start':[26,41], 'end':[80,46], 'states':[24,48]},
    {'id':'mp-X', 'kind':'X', 'quadrant':[-1,1], 'bridge':[-40,38], 'start':[-40,39], 'end':[-39,80], 'states':[-48,-24]},
    {'id':'mp-Y', 'kind':'Y', 'quadrant':[-1,1], 'bridge':[-40,38], 'start':[-41,38], 'end':[-80,45], 'states':[24,48]},
    {'id':'pm-X', 'kind':'X', 'quadrant':[1,-1], 'bridge':[31,-46], 'start':[31,-47], 'end':[30,-80], 'states':[24,48]},
    {'id':'pm-Y', 'kind':'Y', 'quadrant':[1,-1], 'bridge':[31,-46], 'start':[32,-46], 'end':[80,-32], 'states':[-48,-24]},
    {'id':'mm-X', 'kind':'X', 'quadrant':[-1,-1], 'bridge':[-35,-34], 'start':[-35,-35], 'end':[-45,-80], 'states':[-48,-24]},
    {'id':'mm-Y', 'kind':'Y', 'quadrant':[-1,-1], 'bridge':[-35,-34], 'start':[-36,-34], 'end':[-80,-42], 'states':[-48,-24]},
]
records = []
for branch in branches:
    coordinate = 1 if branch['kind'] == 'X' else 0
    delta = branch['end'][coordinate] - branch['start'][coordinate]
    step = 1 if delta >= 0 else -1
    progress = np.arange(branch['start'][coordinate], branch['end'][coordinate] + step, step)
    states = np.arange(branch['states'][0], branch['states'][1] + 1)
    p, v = np.meshgrid(progress, states, indexing='ij')
    u, w = (v, p) if branch['kind'] == 'X' else (p, v)
    a = np.stack((u % 512, w % 512), axis=2)
    b = np.stack((384 + u, w % 512), axis=2) if branch['kind'] == 'X' else np.stack((u % 512, 128 + w), axis=2)
    assert np.all((a >= 1) & (a <= 510)) and np.all((b >= 1) & (b <= 510))
    rows = len(progress)
    assert len(states) == 25
    boxes = []
    for owner in (a, b):
        points = owner.reshape(-1,2)
        boxes.append([int(points[:,0].min()), int(points[:,1].min()), int(points[:,0].max())+1, int(points[:,1].max())+1])
    display_boxes = [[max(0,x0-8), max(0,y0-8), min(512,x1+8), min(512,y1+8)] for x0,y0,x1,y1 in boxes]
    crops = [im.crop(tuple(box)) for box in display_boxes]
    height = max(crop.height for crop in crops) * 4
    sheet = Image.new('RGB', (800, height+88), (25,27,30))
    draw = ImageDraw.Draw(sheet)
    draw.text((4,4), branch['id']+' proposed P/'+branch['kind']+' corridor; no search/path/composite', fill='white')
    draw.text((4,23), 'Parent source '+str(display_boxes[0]), fill='white')
    draw.text((404,23), branch['kind']+' source '+str(display_boxes[1]), fill='white')
    draw.text((4,42), 'Unmodified separate crops, NEAREST 4x; 8px context is inspection only, never support.', fill='white')
    for index, crop in enumerate(crops):
        sheet.paste(crop.resize((crop.width*4,crop.height*4), Image.Resampling.NEAREST), (4+400*index,64))
    path = J / (branch['id']+'-correct-owner-source-crops.png')
    sheet.save(path)
    record = {**branch, 'progressRowsInclusive':rows, 'latticeStatesProposed':int(rows*25), 'progressStep':step,
              'ownerA':'P', 'ownerB':branch['kind'], 'sourceDomainBoxes':boxes, 'displayContextBoxes':display_boxes,
              'cost':'unchanged approved RGB/gradient cost, now comparing correct P/'+branch['kind']+' owners',
              'view':{'file':relative(path),'sha256':sha(path)}}
    records.append(record)
assert sum(row['latticeStatesProposed'] for row in records) == 8725
assert all(sha(R / path) == digest for path, digest in result['firstInputHashes'].items())
output = {'state':'PLAN ONLY: exact fixed proposed branches and unmodified source corridor inspection, no DP or composite',
          'candidate':'C2', 'allCapRanksFixed':1, 'branches':records, 'proposedAdditionalLatticeStates':8725,
          'alreadyUsedStates':844800, 'proposedCumulativeUpperBound':853525, 'remainingAfterProposedRun':146475,
          'currentNewStatesActuallySpent':0, 'currentRemainingStates':155200,
          'source':{'file':relative(source),'sha256':sha(source)},
          'sourceResult':{'file':relative(D/'runs/actual-v1/result.json'),'sha256':sha(D/'runs/actual-v1/result.json')},
          'script':{'file':relative(Path(__file__)),'sha256':sha(Path(__file__))}}
path = J / 'correct-owner-corridors-plan-v1.json'
with path.open('x') as file:
    json.dump(output,file,indent=2)
    file.write('\n')
print(json.dumps({'proposedStates':8725,'actualNewStates':0,'manifestSha256':sha(path)}))
