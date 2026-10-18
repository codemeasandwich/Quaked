"""Install only the eight hash-reviewed photographic stone/trim counterparts.

Run from the authoring checkout, with --destination set to the isolated lane.
The scoped independent art aggregation must bind all forty selected map hashes.
Existing destination files are immutable; index/trial predecessors are retained.
Public PAK/renderer, GPU, pack and publication qualification remain separate.
"""
import argparse
import hashlib
import json
from pathlib import Path

SOURCE = Path('tools/texture_sheets/sources/official-world-2026-10-17')
CANDIDATES = Path('newer/textures/candidates-2026-10-17')
NAMES = ('br_trim1_1', 'br_trim1_2', 'wstone_17_JM', 'wstone_11_JM',
         'wstone_13_JM', 'TF_Metal3_04', 'TF_Stone_03', 'metal5_83_JM')
BEFORE_INDEX = '0541eece8abaa369339ff2209387025b2c2045e03960294f720859511822268a'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def dump(value):
    return (json.dumps(value, indent=2) + '\n').encode()

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--destination', type=Path, required=True)
    p.add_argument('--review', type=Path, required=True)
    a = p.parse_args()
    root = Path.cwd()
    dest = a.destination.resolve()
    assert dest != root
    manifest_path = SOURCE/'stone-trims-eight-finish-v3.json'
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    assert set(e['name'] for e in manifest['entries']) == set(NAMES)
    review_bytes = a.review.read_bytes()
    receipt = json.loads(review_bytes)
    assert receipt['overallArtResult'] == 'PASS' and not receipt.get('holds')
    assert receipt['materials'] == 8 and receipt['mapHashes'] == 40
    assert receipt['manifest'] == {'file': str(manifest_path), 'sha256': sha(manifest_bytes)}
    approved = {e['name']: e for e in receipt['results']}
    assert set(approved) == set(NAMES)
    approved_hashes = set()
    for e in manifest['entries']:
        record = approved[e['name']]
        assert record['result'] == 'PASS' and record['mapCustody'] == e['outputs']
        support = record['supportingReceipt']
        assert sha(Path(support['file']).read_bytes()) == support['sha256']
        approved_hashes.update(v['sha256'] for v in record['mapCustody'].values())
    reviews = [{'file': str(a.review), 'sha256': sha(review_bytes)}]
    selected = {v['sha256'] for e in manifest['entries'] for v in e['outputs'].values()}
    assert len(selected) == 40 and selected <= approved_hashes
    index_path = Path('newer/textures/index.json')
    trial_path = Path('newer/textures/candidates-2026-10-12/trial.json')
    index_bytes = (dest/index_path).read_bytes()
    assert sha(index_bytes) == BEFORE_INDEX
    index = json.loads(index_bytes)
    trial_bytes = (dest/trial_path).read_bytes()
    trial = json.loads(trial_bytes)
    original_index = json.loads(index_bytes)
    entries, previews, writes = [], {}, {}
    for e in manifest['entries']:
        name = e['name']
        native = json.loads((SOURCE/f'native-{name}.json').read_text())
        enc = json.loads(Path(e['encoded']).read_text())
        key = native['key']
        assert name == native['name'] == enc['name']
        assert not index['ordinaryVariants'].get(name, {}).get(key)
        assert name not in trial
        assert enc['factor'] == 4 and enc['quality'] == 92 and enc['lossless'] is False
        assert sha(Path(e['original']).read_bytes()) == enc['originalSha256']
        outputs = enc['outputs']
        runtime = {}
        for role, out in outputs.items():
            raw = Path(out['file']).read_bytes()
            assert sha(raw) == out['sha256'] == e['outputs'][role]['sha256']
            assert out['dimensions'] == [native['width']*4, native['height']*4]
            assert out['quality'] == 92 and out['lossless'] is False
            filename = f'official/{name}-{key.split(":")[1]}-4x-q92-{role}.webp'
            runtime[role] = filename
            writes[Path('newer/textures')/filename] = raw
        channels = {axis: runtime['normal'+axis.upper()] for axis in 'xyz'}
        binding = {'file': runtime['diffuse'], 'normal': {'file': runtime['height'],
                   'normalChannels': channels, 'strength': enc['profile']['strength'],
                   'cap': enc['profile']['cap']}}
        index['ordinaryVariants'].setdefault(name, {})[key] = binding
        hashes = {axis: outputs['normal'+axis.upper()]['sha256'] for axis in 'xyz'}
        entry = {'name': name, 'key': key, 'source': native, 'previousBinding': None,
                 'binding': binding, 'sourceFile': e['original'],
                 'sourceFileSha256': enc['originalSha256'],
                 'diffuseSha256': outputs['diffuse']['sha256'],
                 'heightSha256': outputs['height']['sha256'], 'normalChannelSha256': hashes,
                 'encodingReceipt': e['encoded'],
                 'candidate': str(Path(outputs['diffuse']['file']).relative_to('newer/textures')),
                 'candidateSha256': outputs['diffuse']['sha256'],
                 'factor': 4, 'quality': 92, 'lossless': False}
        entries.append(entry)
        spec = {'file': entry['candidate'],
                'height': str(Path(outputs['height']['file']).relative_to('newer/textures')),
                'normalChannels': {axis: str(Path(outputs['normal'+axis.upper()]['file']).relative_to('newer/textures')) for axis in 'xyz'},
                'strength': enc['profile']['strength'], 'cap': enc['profile']['cap'],
                'width': native['width']*4, 'heightPixels': native['height']*4,
                'original': e['original'], 'originalSha256': enc['originalSha256'],
                'nativeKey': key, 'factor': 4, 'quality': 92, 'lossless': False,
                'diffuseSha256': entry['diffuseSha256'], 'heightSha256': entry['heightSha256'],
                'normalChannelSha256': hashes, 'method': 'source-fitted-photographic'}
        trial[name] = spec
        previews[name] = spec
    # Confirm the only semantic index differences are these eight keys and version.
    index['version'] = 2026101811
    check = json.loads(json.dumps(index))
    check['version'] = original_index['version']
    for e in entries:
        del check['ordinaryVariants'][e['name']][e['key']]
        if e['name'] not in original_index['ordinaryVariants']:
            del check['ordinaryVariants'][e['name']]
    assert check == original_index
    # Cohort-specific source, rejected drafts and receipts remain auditable.
    for base in (SOURCE, CANDIDATES):
        for path in base.rglob('*'):
            if not path.is_file() or '__pycache__' in path.parts:
                continue
            rel = path.relative_to(base)
            if (any(n in str(rel) for n in NAMES)
                or any(s in str(rel).lower() for s in ('stone-trim', 'stone_trim', 'brick_phase', 'registered_columns', 'brick-solid', 'brick-layered', 'compose_solid_brick'))):
                writes[path] = path.read_bytes()
    writes[SOURCE/'stone-trims-index-before.json'] = index_bytes
    writes[SOURCE/'stone-trims-trial-before.json'] = trial_bytes
    writes[CANDIDATES/'stone-trims-trial.json'] = dump(previews)
    after_index, after_trial = dump(index), dump(trial)
    registration = {'qualification': 'Eight exact independently approved photographic variants; public/GPU/pack/publication qualification pending.',
                    'beforeIndexSha256': sha(index_bytes), 'afterIndexSha256': sha(after_index),
                    'entries': entries, 'beforeTrialFile': str(SOURCE/'stone-trims-trial-before.json'),
                    'beforeTrialSha256': sha(trial_bytes), 'afterTrialSha256': sha(after_trial),
                    'independentArtReviews': reviews}
    writes[SOURCE/'stone-trims-eight-registration.json'] = dump(registration)
    # Complete preflight before writing any destination bytes.
    for path, raw in writes.items():
        if (dest/path).exists():
            assert (dest/path).read_bytes() == raw, f'Existing destination differs: {path}'
    for path, raw in writes.items():
        target = dest/path
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
    (dest/index_path).write_bytes(after_index)
    (dest/trial_path).write_bytes(after_trial)
    print(json.dumps({'installedMaterials': len(entries), 'runtimeMaps': 40,
                      'copiedFiles': len(writes), 'indexSha256': sha(after_index)}))

if __name__ == '__main__':
    main()
