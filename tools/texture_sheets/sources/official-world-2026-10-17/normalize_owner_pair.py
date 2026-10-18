"""Make versioned WebP92 derivatives of two retained owner material pairs.

This authoring step never installs a binding, resizes artwork, recrafts height,
or overwrites its sources. The existing runtime derives matching normals from
the decoded scalar using each unchanged strength/cap. Review and installation
are separate from producing these four files.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import sys


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--output-root', type=Path, required=True)
    args = parser.parse_args()
    root, output = args.source_root.resolve(), args.output_root.resolve()
    destination = output / 'tools/texture_sheets/sources/official-world-2026-10-17/owner-q92-first-tranche-v2.json'
    assert not destination.exists(), 'Refuse overwriting migration receipt'
    # Validate/create the receipt location before creating any map outputs.
    # This also supports an empty scratch output root for independent replay.
    destination.parent.mkdir(parents=True, exist_ok=True)
    source = root / 'tools/texture_sheets/finish_runtime_skin.py'
    spec = importlib.util.spec_from_file_location('owner_pair_encoder', source)
    encoder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(encoder)
    plan_path = Path(__file__).parent / 'verification/legacy-owner-q92-first-tranche-plan.json'
    plan = json.loads(plan_path.read_text())['firstTranche']
    index_bytes = (root / 'newer/textures/index.json').read_bytes()
    index = json.loads(index_bytes)
    expected = {row['file']: row for row in plan['currentFiles']}
    report = dict(schemaVersion=1, factor=4, quality=92, lossless=False,
                  method=6, qualification='Uninstalled owner-art format derivatives; no new generated artwork.',
                  indexBeforeSha256=sha(index_bytes), encoder='tools/texture_sheets/finish_runtime_skin.py::encoded',
                  encoderSha256=sha(source.read_bytes()),
                  authoringScriptSha256=sha(Path(__file__).read_bytes()),
                  planSha256=sha(plan_path.read_bytes()), python=sys.version,
                  maps=[], bindings=[])
    pending = []
    for donor, key in [('city5_3', '837ce7b57349da7f'), ('wizmet1_3', '006f4d1505d7fbd7')]:
        pair = {}
        for role, old in [('diffuse', 'newer/textures/' + donor + '.webp'),
                          ('height', 'newer/textures/normals/' + donor + '.webp')]:
            witness = expected[old]
            assert sha((root / old).read_bytes()) == witness['sha256'], old
            new = f'newer/textures/official/owner-{donor}-{key}-v1-4x-q92-{role}.webp'
            data, receipt = encoder.encoded(root / old, [256, 256])
            assert b'VP8 ' in data and b'VP8L' not in data, new
            assert not (output / new).exists(), 'Refuse overwriting ' + new
            pending.append((output / new, data))
            report['maps'].append(dict(role=role, donor=donor, predecessor=old,
                                       file=new, dimensions=[256, 256], **receipt))
            pair[role] = new.removeprefix('newer/textures/')
        for binding in plan['bindings']:
            name = binding['name']
            if index['textures'][name] != donor + '.webp':
                continue
            previous = dict(file=index['textures'][name], normal=index['normals'][name])
            assert previous['normal'] == binding['normal']
            current = dict(file=pair['diffuse'], normal={**previous['normal'], 'file': pair['height']})
            report['bindings'].append(dict(name=name, nativeKey=binding['nativeKey'],
                                           sourcePixelSha256=binding['sourcePixelSha256'],
                                           previous=previous, current=current,
                                           sourceAllowlist=index['sources'][name]))
    assert len(pending) == 4 and len(report['bindings']) == 4
    for path, data in pending:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    destination.write_text(json.dumps(report, indent=2) + '\n')
    for old, witness in expected.items():
        assert sha((root / old).read_bytes()) == witness['sha256'], 'Source changed: ' + old
    print(json.dumps(dict(receipt=str(destination), maps=4, bindings=4, installed=False)))


if __name__ == '__main__':
    main()
