"""Inspect mixed decoded scene joins; never author or replace a texture."""
from pathlib import Path
from itertools import product
import hashlib
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[6]
OUT = Path(__file__).resolve().parent
LIB = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018/art-variants'
KEYS = ['woodland-bridge', 'woodland-abbey-ruin', 'forest-stone-shrine']
LABELS = ['B', 'A', 'S']
sha = lambda data: hashlib.sha256(data).hexdigest()
inputs, outputs, shared = [], [], []

def save(image, name):
    path = OUT / name
    assert not path.exists()
    with path.open('xb') as file:
        image.save(file, 'PNG')
    outputs.append({'file': str(path.relative_to(ROOT)), 'sha256': sha(path.read_bytes())})

for tier in ['mid', 'high']:
    images, data = [], []
    for key in KEYS:
        folder = LIB / key / 'tiers/final-v1'
        file = folder / f'{tier}-diffuse.webp'
        raw = file.read_bytes()
        with Image.open(file) as image:
            assert image.format == 'WEBP'
            images.append(image.convert('RGB'))
        inputs.append({'file': str(file.relative_to(ROOT)), 'sha256': sha(raw)})
        data.append({role: sha((folder / f'{tier}-{role}.webp').read_bytes())
                     for role in ['height', 'normalX', 'normalY', 'normalZ']})
    assert data[0] == data[1] == data[2]
    shared.append({'tier': tier, 'allThreeDataMapSetsByteIdentical': True, 'hashes': data[0]})
    width, height = images[0].size
    assert all(image.size == (width, height) for image in images)
    n = 16 if tier == 'mid' else 32
    halves = [(0, height)] if tier == 'mid' else [(0, height//2), (height//2, height)]
    for part, (start, end) in enumerate(halves):
        contact = Image.new('RGB', (9*2*n, end-start+20), (28, 29, 30))
        draw = ImageDraw.Draw(contact)
        for col, (left, right) in enumerate(product(range(3), repeat=2)):
            x = col*2*n
            draw.text((x+2, 2), LABELS[left]+LABELS[right], fill='white')
            contact.paste(images[left].crop((width-n, start, width, end)), (x, 20))
            contact.paste(images[right].crop((0, start, n, end)), (x+n, 20))
        save(contact, f'{tier}-X-part{part}.png')
    contact = Image.new('RGB', (width, 9*(2*n+20)), (28, 29, 30))
    draw = ImageDraw.Draw(contact)
    for row, (above, below) in enumerate(product(range(3), repeat=2)):
        y = row*(2*n+20)
        draw.text((2, y+2), LABELS[above]+LABELS[below], fill='white')
        contact.paste(images[above].crop((0, height-n, width, height)), (0, y+20))
        contact.paste(images[below].crop((0, 0, width, n)), (0, y+20+n))
    save(contact, f'{tier}-Y.png')
    n = 16
    cell = 2*n+20
    contact = Image.new('RGB', (9*cell, 9*cell), (28, 29, 30))
    draw = ImageDraw.Draw(contact)
    for index, (a, b, c, d) in enumerate(product(range(3), repeat=4)):
        x, y = (index%9)*cell, (index//9)*cell
        draw.text((x+1, y+1), ''.join(LABELS[k] for k in [a, b, c, d]), fill='white')
        for k, box, target in [
            (a, (width-n, height-n, width, height), (x, y+20)),
            (b, (0, height-n, n, height), (x+n, y+20)),
            (c, (width-n, 0, width, n), (x, y+20+n)),
            (d, (0, 0, n, n), (x+n, y+20+n))]:
            contact.paste(images[k].crop(box), target)
    save(contact, f'{tier}-corners81.png')

for item in inputs:
    assert sha((ROOT / item['file']).read_bytes()) == item['sha256']
record = {'schemaVersion': 1, 'scope': 'Actual decoded diffuse mixed joins, not source authoring or runtime acceptance',
          'labels': dict(zip(LABELS, KEYS)), 'inputs': inputs, 'outputs': outputs,
          'dataMaps': shared, 'pairsPerAxisPerTier': 9, 'fourWayCornersPerTier': 81,
          'pixelPolicy': 'Literal decoded RGB crops pasted without resampling; labels outside source pixels. High full X is split into two exact halves for viewing.'}
with (OUT / 'manifest.json').open('x') as file:
    file.write(json.dumps(record, indent=2)+'\n')
print(json.dumps({'contacts': len(outputs), 'inputs': len(inputs), 'sharedDataMapsExact': True}))
