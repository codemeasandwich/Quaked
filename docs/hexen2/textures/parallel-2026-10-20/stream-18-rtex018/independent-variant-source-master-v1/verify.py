"""Selection-aware two-variant source/master reproduction, never physical ART."""
from pathlib import Path
import ast
import datetime
import hashlib
import io
import json
import math
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
DOC = Path(__file__).resolve().parent
STREAM = DOC.parent
BASE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018'
ID = '7e009202100d48cda293f836a437e30d54c8d5a28ab7d190892a9c3683e397b6'
PACKAGES = {'woodland-abbey-ruin': '039466e7af1765c9b488a99f5526e097d52f56da7e10ae1aa6be971c69ba9db9',
            'forest-stone-shrine': 'ba3ef70824407373a1eaabb009557a38ce7adaa1915d85475c2ade1617dec298'}
watched = {}
sha = lambda b: hashlib.sha256(b).hexdigest()


def read(path):
    path = Path(path)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    data = path.read_bytes()
    assert path not in watched or watched[path] == data, str(path)
    watched[path] = data
    return data


def load(path):
    return json.loads(read(path))


def witness(path):
    path = Path(path)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    return {'file': str(path.relative_to(ROOT)) if ROOT in path.parents else str(path), 'sha256': sha(read(path))}


def refs(value):
    if isinstance(value, dict):
        if 'file' in value and 'sha256' in value:
            assert sha(read(value['file'])) == value['sha256'], value['file']
        for v in value.values():
            refs(v)
    elif isinstance(value, list):
        for v in value:
            refs(v)


def archive_sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1048576), b''):
            h.update(b)
    return h.hexdigest()


def main():
    output = DOC / 'source-master-proof-v1.json'
    assert not output.exists()
    report = {'schemaVersion': 1, 'reviewer': '/root/repair_skill_forward_check',
              'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'verdict': 'HOLD',
              'scope': 'Two selection-aware actual source/RGB/full-float/public prepare replays only; physical relief/tier ART unqualified',
              'materials': [], 'publicCLI': [], 'cleanup': []}
    try:
        reference = STREAM / 'independent-baseline-source-master-v1/verify-source-master-v1.py'
        report['baselineVerifierReference'] = witness(reference)
        native_path = STREAM / 'independent-baseline-source-master-v1/native-current-v2.json'
        native_proof = load(native_path)
        assert native_proof['nativeIdentity'] == ID
        refs(native_proof['inputs'])
        archives = native_proof['archivesStable']
        assert all(archive_sha(p) == h for p, h in archives.items())
        oracle = ROOT / 'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py'
        definitions = ast.parse(read(oracle))
        names = {'blur', 'unit', 'extreme', 'smooth', 'craft64'}
        functions = ast.Module(body=[n for n in definitions.body if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[])
        context = {'np': np, 'math': math}
        exec(compile(functions, str(oracle), 'exec'), context)
        report['independentScalarOracle'] = witness(oracle)
        for key, package_sha in PACKAGES.items():
            variant = BASE / 'art-variants' / key
            package = variant / 'masters/initial-v1/master.json'
            master = load(package)
            assert sha(read(package)) == package_sha
            selection_path = variant / 'source-selections/s1.json'
            selection_bytes = read(selection_path)
            selected = load(selection_path)
            assert selection_bytes == read(STREAM / 'variant-canonical-preparation-v1' / (key + '-proposed-selection.json'))
            # Observe the mutable pointer, deliberately do not pin it as immutable custody.
            assert json.loads((variant / 'active-source.json').read_bytes()) == {'schemaVersion': 1, 'selection': witness(selection_path)}
            refs(selected)
            assert selected['nativeIdentity'] == ID and selected['artVariantID'] == key
            assert selected['modelCalls'] == {'originalGeneration': 1, 'edits': 3, 'total': 4}
            assert selected['selectedSourceAncestryCalls'] == {'originalGeneration': 1, 'edits': 2, 'total': 3}
            assert selected['supersedesSelection'] is None
            issued = [load(x['file']) for x in selected['issuedRevisions']]
            retained = [load(x['file']) for x in selected['retainedRevisions']]
            assert len(issued) == len(retained) == 4
            for i, (issue, returned) in enumerate(zip(issued, retained)):
                refs(issue)
                refs(returned)
                assert returned['issued'] == selected['issuedRevisions'][i]
                raw = returned.get('returned', returned.get('retained'))
                tool = returned.get('actualToolOutput', returned.get('actualToolReportedOutput'))
                assert read(tool) == read(raw['file'])
                if i == 0:
                    assert issue['originalGenerationCalls'] == 1 and issue['editCalls'] == 0
                elif i == 1:
                    assert issue['parent'] == retained[0]['returned'] and issue['native'] == selected['original']
                    assert issue['originalGenerationCalls'] == issue['editCalls'] == 1 and issue['totalModelCalls'] == 2
                else:
                    assert issue['parent'] == retained[1]['returned'] and issue['original'] == selected['original']
                    assert issue['modelCalls'] == returned['modelCalls']
                    assert issue['modelCalls']['edits'] == i and issue['modelCalls']['total'] == i + 1
                    assert issue['priorIssuedRevisions'] == selected['issuedRevisions'][1:i]
                    assert issue['priorRetainedRevisions'] == selected['retainedRevisions'][1:i]
            assert [x['issuedAt'] for x in issued] == sorted(x['issuedAt'] for x in issued)
            selected_index = 2 if key == 'woodland-abbey-ruin' else 3
            assert issued[selected_index]['prompt'] == selected['prompt']
            assert selected['registration']['parentReturnedCanvas'] == retained[selected_index]['retained'] or (
                selected['registration']['parentReturnedCanvas']['file'] == retained[selected_index]['retained']['file'] and
                selected['registration']['parentReturnedCanvas']['sha256'] == retained[selected_index]['retained']['sha256'])
            journal = load(selected['primaryJournal']['file'])['items'][0]
            assert journal['id'] == ID and journal['generationCount'] == 1
            assert journal['generatedSha256'] == retained[0]['returned']['sha256'] != selected['generated']['sha256']
            raw = Image.open(io.BytesIO(read(selected['registration']['parentReturnedCanvas']['file'])))
            assert raw.size == (724, 2171) and raw.mode == 'RGB'
            core = np.asarray(raw)[:, 100:624].copy()
            source = Image.fromarray(core, 'RGB').resize((512, 2048), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            source.save(buffer, 'PNG')
            assert buffer.getvalue() == read(selected['generated']['file'])
            registration = load(selected['registration']['receipt']['file'])
            assert registration['input'] == selected['registration']['parentReturnedCanvas']
            assert registration['cropXYXYHalfOpen'] == [100, 0, 624, 2171]
            assert registration['output']['sha256'] == selected['generated']['sha256']
            assert master['name'] == 'rtex018' and master['edition'] == 'base' and master['generationCount'] == 1
            assert master['nativeDimensions'] == [64, 256] and master['masterDimensions'] == master['generatedDimensions'] == [512, 2048]
            assert set(master['inputs']) == {'original', 'generated', 'prompt'}
            refs(master['inputs'])
            refs(master['tools'])
            for role in ('original', 'generated', 'prompt'):
                assert master['inputs'][role]['sha256'] == selected[role]['sha256']
                assert Path(master['inputs'][role]['file']).resolve() == (ROOT / selected[role]['file']).resolve()
            assert native_proof['original'] == witness(selected['original']['file'])
            profile = {'bands': [.3, 1, 1, .6], 'groove': 1.2, 'bump': .2, 'glow': .6, 'strength': .3, 'cap': .5}
            assert master['height']['profile'] == profile
            reg = master['registration']
            assert (reg['method'], reg['factor'], reg['comparisonDivisor'], reg['colorStrength'], reg['fieldSigma']) == ('photographic', 8, 2, .65, .75)
            assert reg['axis'] is None and reg['verticalLandmarks'] is None and not reg['edgeAnchor']
            donor = np.asarray(source, dtype=float)
            original = Image.open(io.BytesIO(read(selected['original']['file']))).convert('RGB')
            native = np.asarray(original, dtype=float)
            delta = native.reshape(128, 2, 32, 2, 3).mean((1, 3)) - donor.reshape(128, 16, 32, 16, 3).mean((1, 3))
            frequency = np.fft.fftfreq(128)[:, None] ** 2 + np.fft.fftfreq(32)[None, :] ** 2
            field = np.fft.ifft2(np.fft.fft2(delta, axes=(0, 1)) * np.exp(-2 * np.pi ** 2 * .75 ** 2 * frequency)[:, :, None], axes=(0, 1)).real
            channels = []
            for channel in range(3):
                tiled = np.tile(field[:, :, channel], (3, 3)).astype('float32')
                scaled = Image.fromarray(tiled, 'F').resize((1536, 6144), Image.Resampling.BICUBIC)
                channels.append(np.asarray(scaled)[2048:4096, 512:1024])
            rgb = np.rint(np.clip(donor + np.stack(channels, axis=2) * .65, 0, 255)).astype('uint8')
            buffer = io.BytesIO()
            Image.fromarray(rgb, 'RGB').save(buffer, 'PNG')
            assert buffer.getvalue() == read(package.parent / 'color.png')
            scalar = context['craft64'](rgb, profile).astype('float32')
            buffer = io.BytesIO()
            np.save(buffer, scalar, allow_pickle=False)
            assert buffer.getvalue() == read(package.parent / 'height.npy')
            assert scalar.shape == (2048, 512) and np.isfinite(scalar).all() and 0 <= scalar.min() <= scalar.max() <= 1
            actual = load(STREAM / 'variant-canonical-preparation-v1' / (key + '-actual.json'))
            refs(actual)
            assert actual['exitCode'] == 0 and not read(actual['stderr']['file'])
            command = list(actual['argv'])
            with tempfile.TemporaryDirectory(prefix='quaked-rtex018-' + key + '-replay-', dir='/private/tmp') as work:
                temporary = Path(work)
                command[command.index('--output') + 1] = str(temporary / 'master')
                run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=180,
                                     env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
                cli = {'artVariantID': key, 'argv': command, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr}
                report['publicCLI'].append(cli)
                assert run.returncode == 0, run.stderr
                for name in ('color.png', 'height.npy', 'master.json'):
                    assert (temporary / 'master' / name).read_bytes() == read(package.parent / name), name
                cli['allThreeFilesByteExact'] = True
            assert not temporary.exists()
            report['cleanup'].append({'privateReplay': str(temporary), 'removed': True})
            report['materials'].append({'nativeIdentity': ID, 'name': 'rtex018', 'edition': 'base', 'artVariantID': key,
                'masterPackage': witness(package), 'masterColor': witness(package.parent / 'color.png'), 'masterHeight': witness(package.parent / 'height.npy'),
                'immutableSelectedSource': witness(selection_path), 'modelCalls': selected['modelCalls'], 'selectedSourceAncestryCalls': selected['selectedSourceAncestryCalls'],
                'independentMath': {'rectangularRGBPNGBytesExact': True, 'fullFloatNPYBytesExact': True, 'uniqueSamples': int(np.unique(scalar).size)},
                'currentReliefArtAccepted': False})
        assert all(p.read_bytes() == b for p, b in watched.items())
        assert all(archive_sha(p) == h for p, h in archives.items())
        report.update(verdict='PASS selection-aware two-source/master-only independent RGB/full-float and unchanged public CLI three-file replays; physical relief/tier ART unqualified',
            nativeEvidence={'proof': witness(native_path), 'scope': 'Prior fresh13path/10content all-four-mip proof retained; same original/current input bytes and four archive hashes revalidated, not another native parse.'},
            archiveBytesStable=archives, inputBytesStable=True, mutablePointerBoundary='Observed s1 current pointers; deliberately not immutable proof inputs.',
            qualificationBoundary='Source/master reproduction only; physical scalar remains provisional HOLD, zero tiers and no runtime acceptance.',
            generationBoundary='Family4 chronological issue/return/tool-copy bindings; selected ancestry3. No provider-side invocation audit.', verifier=witness(__file__))
        report['inputs'] = [witness(p) for p in sorted(watched)]
    except Exception as error:
        report.update(verdict='HOLD verifier attempt failed; preserve evidence', error=repr(error))
        raise
    finally:
        report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with output.open('x') as file:
            file.write(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'proof': str(output.relative_to(ROOT)), 'sha256': sha(output.read_bytes()), 'verdict': report['verdict']}))


if __name__ == '__main__':
    main()
