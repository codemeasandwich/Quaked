"""Stage the owner's exact4x glass standard through the existing region pipeline.

prepare -> baseline.mjs -> apply_regions.py --review STAGE/reviews.json -> finish
finish creates a complete validation root. Installation is a separate reviewed step.
Native references, reviewed apertures and original runtime files are never changed.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TEXTURES = ROOT / 'newer/textures'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
TOOL_SHA = sha(Path(__file__))
read = lambda p: json.loads(p.read_text())
write = lambda p, value: p.write_text(json.dumps(value, indent=2) + '\n')
METADATA = ['newer/textures/index.json', 'newer/textures/glass/region-review.json',
            'newer/textures/glass/region-proof.json', 'newer/textures/glass/provenance.json',
            'tools/glass_materials/regions.json']


def resize_normals(image, target):
    """Linear vector components, existing Quaked convention, no premultiplication."""
    vector = np.asarray(image.convert('RGB'), dtype=np.float64) / 127.5 - 1
    resized = np.stack([np.asarray(Image.fromarray(vector[:, :, c].astype('float32'), 'F').resize(
        target, Image.Resampling.LANCZOS), dtype=float) for c in range(3)], axis=2)
    length = np.linalg.norm(resized, axis=2, keepdims=True)
    resized = np.divide(resized, length, out=np.zeros_like(resized), where=length > 1e-8)
    resized[length[:, :, 0] <= 1e-8] = [0, 0, 1]
    assert np.isfinite(resized).all()
    return Image.fromarray(np.round(np.clip(resized * .5 + .5, 0, 1) * 255).astype('uint8'))


def prepare(stage):
    if stage.exists():
        raise ValueError('Use a new staging directory; existing evidence is retained')
    stage.mkdir(parents=True)
    (stage / 'assets').mkdir()
    (stage / 'before').mkdir()
    snapshots = {}
    for name in METADATA:
        path = ROOT / name
        target = stage / 'before' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(path.read_bytes())
        snapshots[name] = sha(path)
    index = read(TEXTURES / 'index.json')
    rows = read(TEXTURES / 'glass/region-review.json')
    reviews = read(ROOT / 'tools/glass_materials/regions.json')
    source_files = {entry[field]: sha(TEXTURES / entry[field])
                    for variants in index['glass'].values() for entry in variants.values()
                    for field in ['file', 'normalFile', 'heightFile', 'glossFile', 'nativeFile']}
    changed, derivatives, catalog, records = [], {}, {}, []
    for old in rows:
        key = old['name'] + '|' + old['nativeRGBAKey']
        spec = reviews[key]
        entry = index['glass'][old['name']][old['nativeRGBAKey']]
        native = Image.open(TEXTURES / entry['nativeFile'])
        dimensions = tuple(map(int, old['nativeRGBAKey'].split(':')[0].split('x')))
        assert native.size == dimensions == (old['width'], old['height'])
        target = (dimensions[0] * 4, dimensions[1] * 4)
        source = TEXTURES / entry['file']
        assert sha(source) == spec['sourceDiffuseSha256']
        for field in ['shapes', 'glass', 'sourceDiffuseSha256']:
            assert spec[field] == old['regionReview'][field]
        if Image.open(source).size == target:
            continue
        current = copy.deepcopy(old)
        current['sizeMigration'] = dict(factor=4, previousDiffuseSha256=sha(source),
                                       previousReviewSha256=hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest())
        prior_files = {}
        new_entry = copy.deepcopy(entry)
        authored = 'authored donor' in old['method']
        for role, field in [('diffuse', 'file'), ('normal', 'normalFile'), ('height', 'heightFile'), ('gloss', 'glossFile')]:
            prior = TEXTURES / entry[field]
            prior_files[role] = dict(file=entry[field], sha256=sha(prior), dimensions=list(Image.open(prior).size))
            assert tuple(prior_files[role]['dimensions']) == Image.open(source).size
            name = Path(entry[field]).name.replace('-' + role + '.png', '-4x-' + role + '.png')
            assert name != Path(entry[field]).name
            output = stage / 'assets' / name
            with Image.open(prior) as image:
                if role == 'diffuse':
                    result = image.convert('RGB').resize(target, Image.Resampling.LANCZOS)
                elif authored and role == 'normal':
                    result = resize_normals(image, target)
                elif authored:
                    # Gloss R is sheen only; apply_regions rerasterizes semantic G.
                    scalar = image.convert('RGB').getchannel('R') if role == 'gloss' else image.convert('L')
                    result = scalar.resize(target, Image.Resampling.LANCZOS)
                else:
                    # Existing compositor regenerates all three generated companions.
                    continue
                result.save(output)
            current['outputs'][role] = dict(file='glass/' + name, sha256=sha(output))
            new_entry[field] = 'glass/' + name
        # Generated companion filenames are required even before composition writes them.
        for role, field in [('normal', 'normalFile'), ('height', 'heightFile'), ('gloss', 'glossFile')]:
            name = Path(entry[field]).name.replace('-' + role + '.png', '-4x-' + role + '.png')
            new_entry[field] = 'glass/' + name
            current['outputs'][role]['file'] = 'glass/' + name
        derivative = copy.deepcopy(spec)
        derivative['sourceDiffuseSha256'] = current['outputs']['diffuse']['sha256']
        derivative['sizeMigration'] = current['sizeMigration']
        current['regionReview'] = {**copy.deepcopy(old['regionReview']), **derivative}
        derivatives[key] = derivative
        changed.append(current)
        catalog.setdefault(old['name'], {})[old['nativeRGBAKey']] = new_entry
        records.append(dict(reviewId=old['reviewId'], name=old['name'], nativeKey=old['nativeRGBAKey'],
                            nativeFile=entry['nativeFile'], nativeSha256=sha(TEXTURES / entry['nativeFile']),
                            target=list(target), previousBinding=entry, previousFiles=prior_files,
                            previousReview=spec, currentReview=derivative, authored=authored))
    # No source drift during staging, including unrelated metadata owned by this operation.
    for name, digest in snapshots.items():
        assert sha(ROOT / name) == digest, name
    for name, digest in source_files.items():
        assert sha(TEXTURES / name) == digest, name
    write(stage / 'catalog.json', catalog)
    write(stage / 'reviews.json', derivatives)
    write(stage / 'provenance.json', dict(variants=changed))
    write(stage / 'migration.json', dict(schemaVersion=1, factor=4,
          authority='Owner13October: all high-resolution textures sized4x native dimensions',
          toolSha256=TOOL_SHA, snapshots=snapshots, sourceFiles=source_files, records=records))
    print(json.dumps(dict(changed=len(changed), authored=sum(r['authored'] for r in records), unchanged=len(rows)-len(changed))))


def finish(stage):
    migration = read(stage / 'migration.json')
    def unchanged_sources():
        for name, digest in migration['snapshots'].items():
            assert sha(ROOT / name) == digest, 'Metadata changed during staging: ' + name
            assert sha(stage / 'before' / name) == digest, 'Pinned metadata snapshot changed: ' + name
        for name, digest in migration['sourceFiles'].items():
            assert sha(TEXTURES / name) == digest, 'Source changed during staging: ' + name
    unchanged_sources()
    rows = read(stage / 'before/newer/textures/glass/region-review.json')
    old_proofs = read(stage / 'before/newer/textures/glass/region-proof.json')
    changes = read(stage / 'provenance.json')['variants']
    proofs = read(stage / 'region-proof.json')
    catalog = read(stage / 'catalog.json')
    staged_reviews = read(stage / 'reviews.json')
    by_id = {v['reviewId']: v for v in changes}
    new_proofs = {}
    for record in migration['records']:
        row = by_id[record['reviewId']]
        proof = next(p for p in proofs if p['name'] == record['name'] and p['key'] == record['nativeKey'])
        key = record['name'] + '|' + record['nativeKey']
        assert staged_reviews[key] == record['currentReview'], 'Staged review changed: ' + key
        assert proof['review'] == record['currentReview'], 'Composed proof used different reviewed regions: ' + key
        for field in ['shapes', 'glass']:
            assert record['currentReview'][field] == record['previousReview'][field], 'Review semantics changed: ' + key
        assert row['name'] == record['name'] and row['nativeRGBAKey'] == record['nativeKey']
        old_row = next(v for v in rows if v['reviewId'] == record['reviewId'])
        assert row['method'] == old_row['method'], 'Authored/generated method changed: ' + key
        assert row['nativeFile'] == record['nativeFile'], 'Native reference changed: ' + key
        assert row['outputs']['diffuse']['sha256'] == record['currentReview']['sourceDiffuseSha256']
        for role in ['diffuse', 'normal', 'height', 'gloss']:
            f = row['outputs'][role]
            path = stage / 'assets' / Path(f['file']).name
            assert sha(path) == f['sha256']
            assert Image.open(path).size == tuple(record['target'])
        row['regionReview'] = {**record['currentReview'], 'reviewId': record['reviewId']}
        proof.update(reviewId=record['reviewId'], outputs={k: row['outputs'][k] for k in ['normal', 'height', 'gloss']})
        new_proofs[record['reviewId']] = proof
        record['currentBinding'] = catalog[record['name']][record['nativeKey']]
        record['currentFiles'] = row['outputs']
    complete_rows = [by_id.get(r['reviewId'], r) for r in rows]
    complete_proofs = [new_proofs.get(p['reviewId'], p) for p in old_proofs]
    validation = stage / 'validation'
    if validation.exists():
        raise ValueError('Validation output already exists; retain prior evidence')
    (validation / 'glass').mkdir(parents=True)
    index = read(stage / 'before/newer/textures/index.json')
    for name, variants in catalog.items():
        index['glass'][name].update(variants)
    write(validation / 'index.json', index)
    for row in complete_rows:
        entry = index['glass'][row['name']][row['nativeRGBAKey']]
        for field in ['file', 'normalFile', 'heightFile', 'glossFile', 'nativeFile']:
            file = entry[field]
            staged = stage / 'assets' / Path(file).name
            source = staged if staged.exists() else TEXTURES / file
            shutil.copyfile(source, validation / file)
    write(validation / 'glass/region-review.json', complete_rows)
    write(validation / 'glass/region-proof.json', complete_proofs)
    unchanged_sources()
    migration['finishToolSha256'] = TOOL_SHA
    write(stage / 'migration.json', migration)
    print('Complete130-entry validation root:', validation)


def install(stage, verification):
    """Install new files after independent validation; preserve unrelated index work."""
    migration = read(stage / 'migration.json')
    validation = stage / 'validation'
    checked = read(verification)
    assert checked.get('schemaVersion') == 2 and checked.get('completed') is True
    assert checked['completedChecks'] == ['canonical-materials', 'reviewed-apertures']
    assert checked['testSha256'] == sha(ROOT / 'tests/glass_region_assets_test.js')
    for file, field in [('index.json', 'indexSha256'), ('glass/region-review.json', 'reviewSha256'),
                        ('glass/region-proof.json', 'proofSha256')]:
        assert sha(validation / file) == checked[field], 'Validated metadata changed: ' + file
    assert len(checked['materials']) == 130
    checked_rows = {r['reviewId']: r for r in checked['materials']}
    assert len(checked_rows) == 130
    stage_rows = read(validation / 'glass/region-review.json')
    stage_proofs = read(validation / 'glass/region-proof.json')
    for row, proof in zip(stage_rows, stage_proofs):
        tested = checked_rows[row['reviewId']]
        assert proof['reviewId'] == row['reviewId']
        assert tested['name'] == row['name'] and tested['nativeKey'] == row['nativeRGBAKey']
        assert tested['factor'] == 4 and tested['canonicalOutsideExact']
        assert tested['assembledSHA256'] == proof['assembledNormalSha256']
    for name, digest in migration['snapshots'].items():
        assert sha(stage / 'before' / name) == digest
        if name != 'newer/textures/index.json':
            assert sha(ROOT / name) == digest, 'Live metadata changed: ' + name
    for name, digest in migration['sourceFiles'].items():
        assert sha(TEXTURES / name) == digest, 'Live source changed: ' + name
    index_path = TEXTURES / 'index.json'
    current_bytes = index_path.read_bytes()
    index = json.loads(current_bytes)
    before = read(stage / 'before/newer/textures/index.json')
    assert index['glass'] == before['glass'], 'Live glass catalogue changed'
    staged_index = read(validation / 'index.json')
    changes = {(r['name'], r['nativeKey']): r for r in migration['records']}
    assert len(changes) == len(migration['records']), 'Duplicate migration identity'
    before_glass = {(name, key): entry for name, variants in before['glass'].items() for key, entry in variants.items()}
    after_glass = {(name, key): entry for name, variants in staged_index['glass'].items() for key, entry in variants.items()}
    delta = {key for key in before_glass.keys() | after_glass.keys()
             if before_glass.get(key) != after_glass.get(key)}
    assert set(changes) == delta, 'Migration does not cover the exact validated catalogue delta'
    new_rows = {(r['name'], r['nativeRGBAKey']): r for r in stage_rows}
    regions = read(ROOT / 'tools/glass_materials/regions.json')
    provenance = read(TEXTURES / 'glass/provenance.json')
    files = {}
    for (name, key), record in changes.items():
        validated_row = new_rows[(name, key)]
        validated_binding = staged_index['glass'][name][key]
        assert record['currentFiles'] == validated_row['outputs'], 'Migration differs from validated image metadata'
        assert record['currentBinding'] == validated_binding, 'Migration differs from validated catalogue binding'
        for role, field in [('diffuse', 'file'), ('normal', 'normalFile'), ('height', 'heightFile'), ('gloss', 'glossFile')]:
            f = validated_row['outputs'][role]
            assert f['file'] == validated_binding[field]
            source, destination = validation / f['file'], TEXTURES / f['file']
            assert sha(source) == f['sha256']
            assert not destination.exists(), 'Never overwrite an existing runtime file'
            files[destination] = (source, f['sha256'])
        index['glass'][name][key] = validated_binding
        validated_review = {k: v for k, v in validated_row['regionReview'].items() if k != 'reviewId'}
        assert record['currentReview'] == validated_review, 'Migration differs from validated regions'
        for field in ['shapes', 'glass']:
            assert validated_review[field] == regions[name + '|' + key][field], 'Reviewed semantics changed'
        regions[name + '|' + key] = validated_review
    for row in provenance['variants']:
        key = (row['name'], row['nativeRGBAKey'])
        if key in changes:
            fresh = new_rows[key]
            assert row['method'] == fresh['method']
            for field in ['outputs', 'assembledNormalSha256', 'sizeMigration', 'regionReview']:
                row[field] = fresh[field]
    assert isinstance(index['version'], int)
    index['version'] = max(index['version'] + 1, 2026101302)
    text = current_bytes.decode()
    at = text.index('"glass":') + len('"glass":')
    while text[at].isspace():
        at += 1
    _, end = json.JSONDecoder().raw_decode(text, at)
    text = text[:at] + json.dumps(index['glass'], indent=1) + text[end:]
    text = text.replace('"version": ' + str(json.loads(current_bytes)['version']),
                        '"version": ' + str(index['version']), 1)
    assert json.loads(text) == index
    archive = ROOT / 'tools/texture_sheets/sources/official-world-2026-10-12/glass-fourfold-record'
    assert not archive.exists(), 'Installation record already exists'
    archive.mkdir()
    shutil.copytree(stage / 'before', archive / 'before')
    shutil.copyfile(verification, archive / 'independent-assets.json')
    (archive / 'index-at-install.json').write_bytes(current_bytes)
    write(archive / 'migration.json', migration)
    pending = {
        TEXTURES / 'glass/region-review.json': (validation / 'glass/region-review.json').read_bytes(),
        TEXTURES / 'glass/region-proof.json': (validation / 'glass/region-proof.json').read_bytes(),
        TEXTURES / 'glass/provenance.json': (json.dumps(provenance, indent=2) + '\n').encode(),
        ROOT / 'tools/glass_materials/regions.json': (json.dumps(regions, indent=2) + '\n').encode(),
    }
    # New unreferenced images are safe to copy before the catalogue switch.
    for destination, (source, expected_digest) in files.items():
        with source.open('rb') as incoming, destination.open('xb') as outgoing:
            shutil.copyfileobj(incoming, outgoing)
        assert sha(destination) == expected_digest
    assert index_path.read_bytes() == current_bytes, 'Concurrent catalogue change; no switch made'
    originals = {p: p.read_bytes() for p in pending}
    for path in pending:
        assert sha(path) == migration['snapshots'][str(path.relative_to(ROOT))]
    pending[index_path] = text.encode()
    originals[index_path] = current_bytes
    temporary, published = {}, []
    def atomic_file(path, content):
        stream = tempfile.NamedTemporaryFile(dir=path.parent, prefix='.fourfold-', delete=False)
        temporary_path = Path(stream.name)
        try:
            with stream:
                stream.write(content)
        except BaseException:
            temporary_path.unlink(missing_ok=True)
            raise
        return temporary_path
    try:
        # Prepare every full file before replacing any live metadata. Atomic
        # renames cannot leave a truncated live JSON file on a write failure.
        for path, content in pending.items():
            temporary[path] = atomic_file(path, content)
        for path in originals:
            assert path.read_bytes() == originals[path], 'Concurrent metadata change: ' + str(path)
        for path in pending:
            if path == index_path:
                continue
            temporary[path].replace(path)
            published.append(path)
        assert index_path.read_bytes() == current_bytes, 'Concurrent catalogue change; no switch made'
        temporary[index_path].replace(index_path)
        published.append(index_path)
    except BaseException:
        for path in reversed(published):
            if path.read_bytes() == pending[path]:
                atomic_file(path, originals[path]).replace(path)
        raise
    finally:
        for path in temporary.values():
            path.unlink(missing_ok=True)
    write(archive / 'installation.json', dict(indexSha256=sha(index_path), factor=4,
          changedVariants=len(changes), newImageFiles=len(files), preservedOldImageFiles=True,
          sharedNormalBakePublication='Pending coordinated integration; runtime normal generation verified separately',
          installToolSha256=TOOL_SHA, verificationSha256=sha(verification)))
    print('Installed', len(changes), 'glass variants;', len(files), 'new files;', sha(index_path))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['prepare', 'finish', 'install'])
    parser.add_argument('--stage', type=Path, required=True)
    parser.add_argument('--verified-receipt', type=Path)
    args = parser.parse_args()
    if args.phase == 'install':
        if not args.verified_receipt:
            parser.error('install requires --verified-receipt from independent asset verification')
        install(args.stage, args.verified_receipt)
    else:
        (prepare if args.phase == 'prepare' else finish)(args.stage)
