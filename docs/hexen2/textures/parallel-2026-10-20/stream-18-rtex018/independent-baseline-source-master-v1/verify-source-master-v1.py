"""Bounded rtex018 selection-aware source/master proof, not physical ART."""
import argparse
import ast
import datetime
import hashlib
import io
import json
import math
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
DOC = Path(__file__).resolve().parent
SOURCE_DOC = DOC.parent
BASE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018'
VARIANT = BASE / 'art-variants/woodland-bridge'
ID = '7e009202100d48cda293f836a437e30d54c8d5a28ab7d190892a9c3683e397b6'
watched = {}
sha = lambda b: hashlib.sha256(b).hexdigest()


def read(path):
    path = Path(path)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    data = path.read_bytes()
    assert path not in watched or watched[path] == data, 'Input changed'
    watched[path] = data
    return data


def load(path):
    return json.loads(read(path))


def witness(path):
    path = Path(path)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    return {'file': str(path.relative_to(ROOT)) if ROOT in path.parents else str(path),
            'sha256': sha(read(path))}


def refs(value):
    if isinstance(value, dict):
        if 'file' in value and 'sha256' in value:
            assert sha(read(value['file'])) == value['sha256'], value['file']
        for item in value.values():
            refs(item)
    elif isinstance(value, list):
        for item in value:
            refs(item)


def archive_sha(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as file:
        for chunk in iter(lambda: file.read(1048576), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-sha', required=True)
    args = parser.parse_args()
    output = DOC / 'source-master-proof-v1.json'
    assert not output.exists(), 'Preserve attempts'
    package = VARIANT / 'masters/initial-v1/master.json'
    report = {'schemaVersion': 1, 'reviewer': '/root/texture_06_mtex470',
              'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'scope': 'Selection-aware actual source chain, independent RGB/full-float and public prepare replay only; physical relief and tiers unqualified',
              'verdict': 'HOLD', 'materials': []}
    temporary = None
    try:
        master = load(package)
        assert sha(read(package)) == args.package_sha
        selection_path = VARIANT / 'source-selections/s1.json'
        selection_bytes = read(selection_path)
        selected = load(selection_path)
        proposal = SOURCE_DOC / 'baseline-master-plan-v1/proposed-source-selection-v2.json'
        assert selection_bytes == read(proposal)
        preparation_approval = load(SOURCE_DOC / 'baseline-master-plan-v1/root-preparation-approval-v2.json')
        # Its historical pointer observation is not an immutable proof input.
        for role, value in preparation_approval.items():
            if role != 'activePointer':
                refs(value)
        planning_review = load(SOURCE_DOC / 'independent-baseline-plan-v1/exact-plan-review-v2.json')
        assert planning_review['verdict'].startswith('PASS')
        pointer = json.loads((VARIANT / 'active-source.json').read_bytes())
        assert pointer == {'schemaVersion': 1, 'selection': witness(selection_path)}
        refs(selected)
        assert selected['nativeIdentity'] == ID and selected['artVariantID'] == 'woodland-bridge'
        assert selected['modelCalls'] == {'originalGeneration': 1, 'edits': 3, 'total': 4}
        assert selected['selectedSourceAncestryCalls'] == {'originalGeneration': 1, 'edits': 1, 'total': 2}
        assert selected['supersedesSelection'] is None
        assert len(selected['issuedRevisions']) == len(selected['retainedRevisions']) == 4
        issued = [load(row['file']) for row in selected['issuedRevisions']]
        retained = [load(row['file']) for row in selected['retainedRevisions']]
        for i, (issue, returned) in enumerate(zip(issued, retained)):
            refs(issue)
            refs(returned)
            assert returned['issued'] == selected['issuedRevisions'][i]
            raw = returned.get('returned', returned.get('retained'))
            tool = returned.get('actualToolOutput', returned.get('actualToolReportedOutput'))
            assert read(tool) == read(raw['file'])
            image = Image.open(io.BytesIO(read(raw['file'])))
            assert image.mode == 'RGB' and image.format == 'PNG'
            if i == 0:
                assert issue['originalGenerationCalls'] == 1 and issue['editCalls'] == 0
            elif i == 1:
                assert issue['parent'] == retained[0]['returned']
                assert issue['native'] == selected['original'] and issue['prompt'] == selected['prompt']
                assert issue['primaryJournal'] == selected['primaryJournal']
                assert issue['previousEditRevisions'] == []
                assert issue['originalGenerationCalls'] == issue['editCalls'] == 1
                assert issue['totalModelCalls'] == 2
            else:
                assert issue['parent'] == retained[1]['returned']
                assert issue['original'] == selected['original'] and issue['primaryJournal'] == selected['primaryJournal']
                assert issue['modelCalls']['originalGeneration'] == 1
                assert issue['modelCalls']['edits'] == i and issue['modelCalls']['total'] == i + 1
                assert issue['modelCalls'] == returned['modelCalls']
                assert issue['priorIssuedRevisions'] == selected['issuedRevisions'][1:i]
                assert issue['priorRetainedRevisions'] == selected['retainedRevisions'][1:i]
        assert [row['issuedAt'] for row in issued] == sorted(row['issuedAt'] for row in issued)
        journal = load(selected['primaryJournal']['file'])
        primary, = journal['items']
        assert primary['id'] == ID and primary['generationCount'] == 1
        assert primary['generatedSha256'] == retained[0]['returned']['sha256']
        assert selected['generated']['sha256'] != primary['generatedSha256']
        registration = load(selected['registration']['receipt']['file'])
        recipe = load(selected['registration']['recipe']['file'])
        refs(registration)
        assert registration['parent'] == retained[1]['returned'] == selected['registration']['parentReturnedCanvas']
        assert registration['output']['sha256'] == selected['generated']['sha256']
        assert recipe['cropXYXYHalfOpen'] == [100, 0, 624, 2172]
        raw = Image.open(io.BytesIO(read(registration['parent']['file'])))
        assert raw.size == (724, 2172)
        source = raw.crop((100, 0, 624, 2172)).resize((512, 2048), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        source.save(buffer, 'PNG')
        assert buffer.getvalue() == read(selected['generated']['file'])
        assert source.mode == 'RGB' and list(source.size) == selected['generated']['dimensions'] == [512, 2048]
        assert master['name'] == 'rtex018' and master['edition'] == 'base'
        assert master['generationCount'] == 1  # local one-input metadata, not model-call total
        assert master['nativeDimensions'] == [64, 256]
        assert master['generatedDimensions'] == master['masterDimensions'] == [512, 2048]
        assert master['canonicalMasterFactor'] == 8 and 'masterRevision' not in master
        assert set(master['inputs']) == {'original', 'generated', 'prompt'}
        refs(master['inputs'])
        refs(master['tools'])
        for role in ('original', 'generated', 'prompt'):
            assert master['inputs'][role]['sha256'] == selected[role]['sha256']
            assert Path(master['inputs'][role]['file']).resolve() == (ROOT / selected[role]['file']).resolve()
        original = Image.open(io.BytesIO(read(selected['original']['file'])))
        assert original.mode == 'RGBA' and original.size == (64, 256)
        profile = {'bands': [.3, 1, 1, .6], 'groove': 1.2, 'bump': .2, 'glow': .6, 'strength': .3, 'cap': .5}
        assert master['height']['profile'] == profile
        reg = master['registration']
        assert (reg['method'], reg['factor'], reg['comparisonDivisor'], reg['colorStrength'], reg['fieldSigma']) == ('photographic', 8, 2, .65, .75)
        assert reg['axis'] is None and reg['verticalLandmarks'] is None and not reg['edgeAnchor']
        # Rectangular independent Fourier colour-field reconstruction, no producer import.
        donor = np.asarray(source, dtype=float)
        native = np.asarray(original.convert('RGB'), dtype=float)
        delta = native.reshape(128, 2, 32, 2, 3).mean((1, 3)) - donor.reshape(128, 16, 32, 16, 3).mean((1, 3))
        frequency = np.fft.fftfreq(128)[:, None] ** 2 + np.fft.fftfreq(32)[None, :] ** 2
        field = np.fft.ifft2(np.fft.fft2(delta, axes=(0, 1)) * np.exp(-2 * np.pi ** 2 * .75 ** 2 * frequency)[:, :, None], axes=(0, 1)).real
        channels = []
        for channel in range(3):
            tiled = np.tile(field[:, :, channel], (3, 3)).astype('float32')
            scaled = Image.fromarray(tiled, 'F').resize((1536, 6144), Image.Resampling.BICUBIC)
            channels.append(np.asarray(scaled)[2048:4096, 512:1024])
        rgb = np.rint(np.clip(donor + np.stack(channels, axis=2) * .65, 0, 255)).astype('uint8')
        color_bytes, height_bytes = read(package.parent / 'color.png'), read(package.parent / 'height.npy')
        buffer = io.BytesIO()
        Image.fromarray(rgb, 'RGB').save(buffer, 'PNG')
        assert buffer.getvalue() == color_bytes and sha(color_bytes) == master['color']['sha256']
        oracle = ROOT / 'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py'
        definitions = ast.parse(read(oracle))
        names = {'blur', 'unit', 'extreme', 'smooth', 'craft64'}
        functions = ast.Module(body=[node for node in definitions.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[])
        context = {'np': np, 'math': math}
        exec(compile(functions, str(oracle), 'exec'), context)
        scalar = context['craft64'](rgb, profile).astype('float32')
        buffer = io.BytesIO()
        np.save(buffer, scalar, allow_pickle=False)
        assert buffer.getvalue() == height_bytes and sha(height_bytes) == master['height']['sha256']
        assert scalar.shape == (2048, 512) and np.isfinite(scalar).all() and 0 <= scalar.min() <= scalar.max() <= 1
        native_proof = load(DOC / 'native-current-v2.json')
        assert native_proof['verdict'].startswith('PASS') and native_proof['nativeIdentity'] == ID
        assert native_proof['original'] == witness(selected['original']['file'])
        for row in native_proof['inputs']:
            refs(row)
        archives = native_proof['archivesStable']
        assert all(archive_sha(path) == digest for path, digest in archives.items())
        with tempfile.TemporaryDirectory(prefix='quaked-rtex018-baseline-replay-', dir='/private/tmp') as work:
            temporary = Path(work)
            command = ['/usr/bin/python3', str(ROOT / 'tools/texture_sheets/prepare_texture_master.py')]
            for role, row in master['inputs'].items():
                command += ['--' + role, row['file']]
            command += ['--name', 'rtex018', '--edition', 'base', '--profile', 'window02_1', '--color-strength', '.65', '--field-sigma', '.75', '--strength', '.3', '--cap', '.5', '--output', str(temporary / 'master')]
            run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=180)
            report['publicCLI'] = {'command': command, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr}
            assert run.returncode == 0, run.stderr
            for name in ('color.png', 'height.npy', 'master.json'):
                assert (temporary / 'master' / name).read_bytes() == read(package.parent / name), name
            report['publicCLI']['allThreeFilesByteExact'] = True
        assert not temporary.exists()
        assert all(path.read_bytes() == data for path, data in watched.items())
        assert all(archive_sha(path) == digest for path, digest in archives.items())
        report.update(verdict='PASS selection-aware source/master-only exact RGB, full-float scalar and actual public CLI replay; physical relief/tier ART unqualified',
                      materials=[{'nativeIdentity': ID, 'name': 'rtex018', 'edition': 'base', 'artVariantID': 'woodland-bridge',
                                  'masterPackage': witness(package), 'masterColor': witness(package.parent / 'color.png'), 'masterHeight': witness(package.parent / 'height.npy'),
                                  'currentReliefArtAccepted': False}],
                      immutableSelectedSource=witness(selection_path), modelCalls=selected['modelCalls'], selectedSourceAncestryCalls=selected['selectedSourceAncestryCalls'],
                      mutablePointerBoundary='Current pointer observed selecting s1; pointer bytes are deliberately not an immutable proof input. Root approval historical activePointer observation is not recursively revalidated for future selections.',
                      independentMath={'rectangularRGBPNGBytesExact': True, 'fullFloatNPYBytesExact': True, 'shape': list(scalar.shape), 'uniqueSamples': int(np.unique(scalar).size)},
                      nativeEvidence={'proof': witness(DOC / 'native-current-v2.json'), 'scope': 'Fresh13path/10content all-four-mip/flags native proof carried through exact input and current archive custody; not reparsed a second time here.'},
                      qualificationBoundary='Source/master reproduction only; scene pigment must not be physical terrain. No actual physical/tier/codec/repeat/runtime/registration/owner acceptance inferred.',
                      generationBoundary='Actual journal/revision/tool-return bytes and chronology verified, not a provider-side invocation audit.',
                      inputBytesStable=True, archiveBytesStable=archives,
                      cleanup={'privateReplay': str(temporary), 'removed': True}, verifier=witness(__file__))
        report['inputs'] = [witness(path) for path in sorted(watched)]
    except Exception as error:
        report.update(verdict='HOLD source/master verifier attempt failed', error=repr(error),
                      cleanup={'privateReplay': str(temporary) if temporary else None, 'removed': temporary is None or not temporary.exists()})
        raise
    finally:
        report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with output.open('x') as file:
            file.write(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'file': str(output.relative_to(ROOT)), 'sha256': sha(output.read_bytes()), 'verdict': report['verdict']}))


if __name__ == '__main__':
    main()
