"""Make twelve uninstalled Q92 maps from retained pre-4x tech masters.

The twelve current Q95 files are custody witnesses, never encoding inputs.
Resize the retained larger masters with the recorded Lanczos recipe, preserve
their RGB height values, and reuse the established pure Q92 encoder. No binding,
normal profile or original file is changed. Partial drafts are preserved on an
I/O failure; inspect them and use a fresh output root rather than overwriting.
"""
from pathlib import Path
from io import BytesIO
import argparse
import hashlib
import importlib.util
import json
import sys
import PIL
from PIL import Image, features


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(value, message):
    if not value:
        raise ValueError(message)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-root', type=Path, required=True)
    p.add_argument('--output-root', type=Path, required=True)
    args = p.parse_args()
    root, output = args.source_root.resolve(), args.output_root.resolve()
    base = Path('tools/texture_sheets/sources/official-world-2026-10-17')
    plan_path = Path(__file__).parent / 'verification/legacy-tech-twelve-q92-plan.json'
    plan_bytes = plan_path.read_bytes()
    plan = json.loads(plan_bytes)
    index_bytes = (root / 'newer/textures/index.json').read_bytes()
    require(sha(index_bytes) == plan['indexSha256'], 'Source catalogue changed since planning')
    index = json.loads(index_bytes)
    require(len(plan['maps']) == 12 and len(plan['bindings']) == 6, 'Exact six-pair scope')
    names = {'tech04_3', 'tech07_2', 'tech08_1', 'tech09_3', 'tech10_3', 'tech11_2'}
    require({b['name'] for b in plan['bindings']} == names, 'Exact planned names')
    receipt_path = output / base / 'legacy-tech-twelve-q92-v1.json'
    targets = [receipt_path] + [output / m[k] for m in plan['maps']
                              for k in ('proposedMaster', 'proposedRuntimeFile')]
    for target in targets:
        target.resolve().relative_to(output)
        require(not target.exists(), 'Refuse overwriting ' + str(target))
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    encoder_path = root / 'tools/texture_sheets/finish_runtime_skin.py'
    spec = importlib.util.spec_from_file_location('retained_tech_encoder', encoder_path)
    encoder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(encoder)
    pending, custody = [], []
    for row in plan['maps']:
        require(row['name'] in names and row['role'] in ('diffuse', 'height'), 'Planned role')
        for field, digest in [('retainedPre4xFile', 'retainedPre4xSha256'),
                              ('predecessorFile', 'predecessorSha256')]:
            path = root / row[field]
            require(sha(path.read_bytes()) == row[digest], 'Input changed: ' + row[field])
            custody.append((path, row[digest]))
        with Image.open(root / row['retainedPre4xFile']) as image:
            require(list(image.size) == row['retainedPre4xDimensions'], 'Master size')
            require(image.mode == row['retainedPre4xMode'] == 'RGB', 'Retain RGB scalar semantics')
            fitted = image.resize(tuple(row['proposedMasterDimensions']), Image.Resampling.LANCZOS)
        require(sha(fitted.tobytes()) == row['proposedMasterDecodedRgbSha256'], 'Recorded exact resample pixels')
        pending.append((row, fitted))
    bindings = []
    for b in plan['bindings']:
        require({'file': index['textures'][b['name']], 'normal': index['normals'][b['name']]} == b['previous'], 'Previous descriptor')
        require(index['sources'][b['name']] == b['sourceAllowlist'], 'Source guard')
        require({**b['proposedCurrent']['normal'], 'file': b['previous']['normal']['file']} == b['previous']['normal'], 'Only height filename changes')
        bindings.append({k: b[k] for k in ('name', 'nativeKey', 'nativeDimensions', 'sourcePixelSha256', 'target', 'sourceAllowlist', 'previous')})
        bindings[-1]['current'] = b['proposedCurrent']
    maps = []
    for row, fitted in pending:
        master, runtime = output / row['proposedMaster'], output / row['proposedRuntimeFile']
        master.parent.mkdir(parents=True, exist_ok=True)
        runtime.parent.mkdir(parents=True, exist_ok=True)
        with master.open('xb') as stream:
            fitted.save(stream, 'PNG')
        data, encoded = encoder.encoded(master, row['proposedMasterDimensions'])
        with runtime.open('xb') as stream:
            stream.write(data)
        maps.append(dict(name=row['name'], role=row['role'],
            retainedPre4xFile=row['retainedPre4xFile'], retainedPre4xSha256=row['retainedPre4xSha256'],
            predecessor=row['predecessorFile'], predecessorSha256=row['predecessorSha256'],
            master=row['proposedMaster'], masterDecodedRgbSha256=row['proposedMasterDecodedRgbSha256'],
            file=row['proposedRuntimeFile'], dimensions=row['proposedMasterDimensions'], **encoded))
    for path, digest in custody:
        require(sha(path.read_bytes()) == digest, 'Original changed during authoring')
    report = dict(schemaVersion=1, factor=4, quality=92, lossless=False, method=6,
        qualification='Uninstalled direct-source format derivatives; not new photographic artworks or selected runtime bindings.',
        planSha256=sha(plan_bytes), indexBeforeSha256=sha(index_bytes),
        encoder='tools/texture_sheets/finish_runtime_skin.py::encoded', encoderSha256=sha(encoder_path.read_bytes()),
        authoringToolSha256=sha(Path(__file__).read_bytes()), python=sys.version,
        pillow=PIL.__version__, webp=features.version('webp'), maps=maps, bindings=bindings)
    with receipt_path.open('x') as stream:
        stream.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps(dict(receipt=str(receipt_path), maps=len(maps), bindings=len(bindings), installed=False)))


if __name__ == '__main__':
    main()
