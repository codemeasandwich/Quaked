"""Apply the owner's 13 October four-times runtime standard, preserving sources.

Run once from any directory. Writes new files and a hash-bound migration ledger;
never overwrites old pictures, height fields or historical registration receipts.
The existing index's pixel selectors and recipe strengths/caps remain unchanged.
"""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(ROOT / 'tools'))
from craft_normals import craft, profile_for, save_height

TEXTURES = ROOT / 'newer/textures'
LEDGER = HERE / 'four-times-standard.json'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
if LEDGER.exists():
    raise ValueError('Migration already recorded; do not replay over current work')
index_path = TEXTURES / 'index.json'
index_bytes = index_path.read_bytes()
index = json.loads(index_bytes)
trial_path = TEXTURES / 'candidates-2026-10-12/trial.json'
trial_bytes = trial_path.read_bytes()
trials = json.loads(trial_bytes)
inventory = json.loads((HERE / 'inventory-current.json').read_text())
records, outputs = [], {}
fields = ['file', 'height', 'width', 'heightPixels', 'diffuseSha256', 'heightSha256']
for alias, spec in trials.items():
    original = ROOT / spec['original']
    assert sha(original) == spec['originalSha256']
    with Image.open(original) as image:
        native = image.convert('RGBA')
    rgba_hash = hashlib.sha256(native.tobytes()).hexdigest()
    name = spec.get('name', alias)
    source = next(v for v in inventory['variants']
                  if v['name'] == name and v['pixelSha256'] == rgba_hash)
    key = source['key']
    target = (native.width * 4, native.height * 4)
    old_diffuse, old_height = TEXTURES / spec['file'], TEXTURES / spec['height']
    assert sha(old_diffuse) == spec['diffuseSha256']
    assert sha(old_height) == spec['heightSha256']
    diffuse = old_diffuse.with_name(old_diffuse.stem + '-4x.png')
    height = diffuse.with_name(diffuse.stem + '-height.webp')
    assert not diffuse.exists() and not height.exists()
    with Image.open(old_diffuse) as image:
        assert image.size == (native.width * 8, native.height * 8)
        resized = image.convert('RGB').resize(target, Image.Resampling.LANCZOS)
    resized.save(diffuse)
    profile = profile_for(name).copy()
    profile.update(strength=spec['strength'], cap=spec['cap'])
    height_field, _ = craft(np.asarray(resized, dtype=float) / 255, profile)
    save_height(height, height_field)
    previous = {field: spec[field] for field in fields}
    spec.update(file=str(diffuse.relative_to(TEXTURES)),
                height=str(height.relative_to(TEXTURES)), width=target[0],
                heightPixels=target[1], diffuseSha256=sha(diffuse),
                heightSha256=sha(height), factor=4, nativeKey=key)
    records.append(dict(alias=alias, nativeKey=key,
                        original=spec['original'], originalSha256=sha(original),
                        targetDimensions=list(target), previous=previous,
                        current={field: spec[field] for field in fields},
                        heightProfile=profile))
    outputs[alias] = spec

historical = ['current-registration-inputs.json', 'expansion-registration.json',
              'masonry-registration.json']
bindings, runtime_files = [], {}
for filename in historical:
    entries = json.loads((HERE / filename).read_text())['entries']
    for entry in entries:
        if filename == historical[0] and entry['kind'] != 'generated-photographic':
            continue
        name, key = entry['name'], entry['key']
        if filename == historical[0]:
            old = dict(file=index['textures'][name], normal=index['normals'][name])
            alias = name
        else:
            old = index['ordinaryVariants'][name][key]
            alias = entry.get('candidateName', entry['alias'])
        spec = outputs[alias]
        assert spec['nativeKey'] == key
        previous = dict(binding=old,
                        diffuseSha256=sha(TEXTURES / old['file']),
                        heightSha256=sha(TEXTURES / old['normal']['file']))
        pair = (old['file'], old['normal']['file'])
        if pair not in runtime_files:
            diffuse = (TEXTURES / old['file']).with_name(Path(old['file']).stem + '-4x.webp')
            height = (TEXTURES / old['normal']['file']).with_name(Path(old['normal']['file']).stem + '-4x.webp')
            assert not diffuse.exists() and not height.exists()
            with Image.open(TEXTURES / spec['file']) as image:
                image.save(diffuse, 'WEBP', lossless=True, method=6)
                with Image.open(diffuse) as decoded:
                    assert decoded.convert('RGBA').tobytes() == image.convert('RGBA').tobytes()
            height.write_bytes((TEXTURES / spec['height']).read_bytes())
            runtime_files[pair] = (diffuse, height)
        diffuse, height = runtime_files[pair]
        current_binding = dict(file=str(diffuse.relative_to(TEXTURES)),
                               normal={**old['normal'], 'file': str(height.relative_to(TEXTURES))})
        current = dict(binding=current_binding, diffuseSha256=sha(diffuse),
                       heightSha256=sha(height), candidate=spec['file'],
                       candidateSha256=spec['diffuseSha256'])
        bindings.append(dict(name=name, nativeKey=key, previous=previous, current=current))
        if filename == historical[0]:
            index['textures'][name] = current_binding['file']
            index['normals'][name] = current_binding['normal']
        else:
            index['ordinaryVariants'][name][key] = current_binding

assert len(records) == 16 and len(bindings) == 14 and len(runtime_files) == 12
index['version'] = 2026101301
# Preserve formatting, selectors and all unrelated entries.
text = index_bytes.decode().replace('"version": 2026101203', '"version": 2026101301', 1)
for binding in bindings:
    for before, after in [(binding['previous']['binding']['file'], binding['current']['binding']['file']),
                          (binding['previous']['binding']['normal']['file'], binding['current']['binding']['normal']['file'])]:
        text = text.replace(json.dumps(before), json.dumps(after))
assert json.loads(text) == index
assert index_path.read_bytes() == index_bytes and trial_path.read_bytes() == trial_bytes
ledger = dict(schemaVersion=1, factor=4,
              authority='Owner13October: all high-resolution textures must be four times each native dimension',
              method='LANCZOS from reviewed8x photographic candidates; regenerate material-aware height fields at4x; lossless runtime diffuse',
              historicalInputs=[dict(file=str((HERE / f).relative_to(ROOT)), sha256=sha(HERE / f)) for f in historical],
              beforeIndexSha256=hashlib.sha256(index_bytes).hexdigest(),
              afterIndexSha256=hashlib.sha256(text.encode()).hexdigest(),
              heightToolSha256=sha(ROOT / 'tools/craft_normals.py'),
              migrationToolSha256=sha(Path(__file__)), bindings=bindings, trials=records)
index_path.write_text(text)
trial_path.write_text(json.dumps(trials, indent=2) + '\n')
LEDGER.write_text(json.dumps(ledger, indent=2) + '\n')
print(json.dumps(dict(trials=len(records), bindings=len(bindings), artworks=len(runtime_files),
                      indexSha256=ledger['afterIndexSha256'])))
