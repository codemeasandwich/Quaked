"""Bounded independent rtex018 final direct-map/public-preview proof; ART separate."""
import argparse
import ast
import datetime
import hashlib
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[6]
DOC = Path(__file__).resolve().parent
SOURCE_DOC = DOC.parent
BASE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018/art-variants/woodland-bridge'
ID = '7e009202100d48cda293f836a437e30d54c8d5a28ab7d190892a9c3683e397b6'
watched = {}
sha = lambda data: hashlib.sha256(data).hexdigest()


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
            assert sha(read(value['file'])) == value['sha256']
        for item in value.values():
            refs(item)
    elif isinstance(value, list):
        for item in value:
            refs(item)


def image(path):
    return Image.open(io.BytesIO(read(path))).convert('RGB')


def archive_sha(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as file:
        for data in iter(lambda: file.read(1048576), b''):
            digest.update(data)
    return digest.hexdigest()


class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images, self.scripts = [], []

    def handle_starttag(self, tag, attributes):
        if tag == 'img':
            self.images.append(dict(attributes))
        if tag == 'script':
            self.scripts.append(dict(attributes))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--freeze', type=Path, required=True)
    parser.add_argument('--freeze-sha', required=True)
    args = parser.parse_args()
    output = DOC / 'verified-v1'
    output.mkdir(exist_ok=False)
    decoded_dir = SOURCE_DOC / 'baseline-decoded-review-v1'
    report = {'schemaVersion': 1, 'reviewer': '/root/texture_06_mtex470',
              'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'scope': 'Observed rtex018 selection custody/direct10-map float-normal-codec/public CLI/rectangle HTML-preview proof; actual final ART and full author-freeze admission separate',
              'verdict': 'HOLD', 'materials': []}
    temporary = None
    try:
        freeze_path = args.freeze.resolve()
        assert SOURCE_DOC in freeze_path.parents
        freeze = load(freeze_path)
        assert sha(read(freeze_path)) == args.freeze_sha
        frozen = freeze['frozenInputs']
        assert isinstance(frozen, dict) and frozen
        for path, digest in frozen.items():
            assert sha(read(path)) == digest, path
        source_path = SOURCE_DOC / 'independent-baseline-layered-master-v2/proof-v1.json'
        source = load(source_path)
        assert sha(read(source_path)) == '9e679ca0a4182d4a9a078af663f4deac90383fbca3fe58af7b5279a9f24c168b'
        assert source['verdict'].startswith('PASS')
        for row in source['inputs']:
            refs(row)
        physical_path = SOURCE_DOC / 'independent-baseline-layered-master-v2/physical-PASS-v1.json'
        assert sha(read(physical_path)) == 'cd1c50c5e542156ca2eee3d93067ad83ade09dee3853c989d763b17b18000255'
        assert load(physical_path)['verdict'].startswith('PASS')
        assert source['modelCalls'] == {'originalGeneration': 1, 'edits': 3, 'total': 4}
        assert source['selectedSourceAncestryCalls'] == {'originalGeneration': 1, 'edits': 1, 'total': 2}
        refs(source['immutableSelection'])
        selected = load(source['immutableSelection']['file'])
        batch_path = BASE / 'batch-final-v1.json'
        batch = load(batch_path)
        assert sha(read(batch_path)) == '6e07206b153cae10388d5a8f0431ce9fcc9ba0427feb471abaf849102a7019ac'
        assert batch['schemaVersion'] == 2 and batch['defaultTier'] == 'Mid'
        assert batch['tierFactors'] == {'Mid': 4, 'High': 8}
        assert (batch['quality'], batch['method'], batch['lossless']) == (92, 6, False)
        item, = batch['items']
        assert item['nativeIdentity']['id'] == ID and item['name'] == 'rtex018' and item['edition'] == 'base'
        package = ROOT / item['masterPackage']
        tiers_path = ROOT / item['tierReceipt']
        master, tiers = load(package), load(tiers_path)
        assert sha(read(package)) == item['masterPackageSha256'] == 'e2c9998965b28a588e3fab8a7c97e601a97b8c2eb4ef0d94f0a403ddd382a582'
        assert sha(read(tiers_path)) == item['tierReceiptSha256'] == '780eb8af2ccfa8bcb1e597266170cdfdb22f57bfdd099c320cfeceef149e36d4'
        assert source['materials'][0]['masterPackage'] == witness(package)
        assert master['generationCount'] == 1 and master['height']['authoringPolicy'] == 'layered-veneer'
        assert (tiers['strength'], tiers['cap']) == (.3, .5)
        for role in ('original', 'generated', 'prompt'):
            assert item[role] == selected[role]['file']
            assert item[role + 'Sha256'] == selected[role]['sha256'] == master['inputs'][role]['sha256']
        original = image(item['original'])
        rgb = image(package.parent / 'color.png')
        scalar = np.load(io.BytesIO(read(package.parent / 'height.npy')), allow_pickle=False)
        assert original.size == (64, 256) and rgb.size == (512, 2048)
        assert scalar.shape == (2048, 512) and scalar.dtype == np.float32
        assert sha(read(package.parent / 'height.npy')) == 'e899c58d8faac4c077c0dda9441e3a8e448462ee5a9540f36b5b66b4321ba754'
        oracle_path = ROOT / 'tests/hexen2_texture_tiers_test.py'
        names = {'q92', 'periodic_rgb', 'float_box', 'cyclic_normals', 'vp8_only'}
        definitions = ast.parse(read(oracle_path))
        functions = ast.Module(body=[node for node in definitions.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[])
        oracle = {'np': np, 'Image': Image, 'io': io}
        exec(compile(functions, str(oracle_path), 'exec'), oracle)
        roles = ('diffuse', 'height', 'normalX', 'normalY', 'normalZ')
        reports, diagnostic_views, tier_views = [], [], {}
        def decoded_witness(name, im):
            path = decoded_dir / name
            buffer = io.BytesIO()
            im.save(buffer, 'PNG')
            assert buffer.getvalue() == read(path), 'Actual decoded witness differs: ' + name
            diagnostic_views.append({**witness(path), 'dimensions': list(im.size),
                                     'independentlyReconstructedPNGBytesExact': True})
        for tier, factor in [('Mid', 4), ('High', 8)]:
            width, height = 64 * factor, 256 * factor
            size = (width, height)
            row = tiers['tiers'][tier]
            assert row['factor'] == factor and row['dimensions'] == list(size)
            field = oracle['float_box'](scalar, size)
            normals = oracle['cyclic_normals'](field, .3, .5)
            packed = np.rint(np.clip(normals * .5 + .5, 0, 1) * 255).astype('uint8')
            ims = {'diffuse': oracle['periodic_rgb'](rgb, size),
                   'height': Image.fromarray(np.rint(field * 255).astype('uint8'))}
            ims.update({role: Image.fromarray(packed[:, :, channel]) for channel, role in enumerate(roles[2:])})
            decoded, maps = {}, []
            for role, im in ims.items():
                record = row['outputs'][role]
                path = tiers_path.parent / record['file']
                data = read(path)
                assert data == oracle['q92'](im) and sha(data) == record['sha256']
                assert (record['quality'], record['method'], record['lossless']) == (92, 6, False)
                assert record['sourceMaster'] == ('master' if role == 'diffuse' else 'heightMaster')
                assert record['bytes'] == len(data) and record['dimensions'] == list(size)
                oracle['vp8_only'](data)
                decoded[role] = image(path)
                assert decoded[role].size == size and str(path.relative_to(ROOT)) == item['tiers'][tier]['files'][role]
                maps.append({**witness(path), 'role': role, 'directMasterQ92Method6BytesExact': True})
            colors = np.asarray(decoded['diffuse'])
            vector = np.stack([np.asarray(decoded[role], float)[:, :, 0] for role in roles[2:]], 2) / 127.5 - 1
            vector /= np.maximum(np.linalg.norm(vector, axis=2, keepdims=True), 1e-12)
            xyz = Image.fromarray(np.rint(np.clip(vector * .5 + .5, 0, 1) * 255).astype('uint8'))
            views = {'RGB': decoded['diffuse'], 'height': decoded['height'], 'XYZ': xyz}
            for label, sign in [('A', -1), ('B', 1)]:
                direction = np.array([sign * .55, sign * .55, .63])
                direction /= np.linalg.norm(direction)
                gain = .35 + .65 * np.clip(vector @ direction, 0, 1)
                views['neutral-' + label] = Image.fromarray(np.rint(gain * 180).astype('uint8')).convert('RGB')
                views['textured-' + label] = Image.fromarray(np.rint(np.clip(colors * gain[:, :, None], 0, 255)).astype('uint8'))
            span = width // 8
            tier_views[tier] = views
            for name, im in views.items():
                decoded_witness(tier + '-' + name + '-full.png', im)
                array = np.asarray(im)
                decoded_witness(tier + '-' + name + '-Xjoin-1to1.png', Image.fromarray(np.concatenate((array[:, -span:], array[:, :span]), 1)))
                decoded_witness(tier + '-' + name + '-Yjoin-1to1.png', Image.fromarray(np.concatenate((array[-span:], array[:span]), 0)))
                corner = np.concatenate((np.concatenate((array[-span:, -span:], array[-span:, :span]), 1),
                                         np.concatenate((array[:span, -span:], array[:span, :span]), 1)), 0)
                decoded_witness(tier + '-' + name + '-corner-1to1.png', Image.fromarray(corner))
                if name in ('RGB', 'XYZ', 'neutral-A'):
                    decoded_witness(tier + '-' + name + '-repeat-1to1.png', Image.fromarray(np.tile(array, (2, 2, 1))))
            distances = []
            for divisor in (2, 4):
                dims = (64 // divisor, 256 // divisor)
                a = original.resize(dims, Image.Resampling.BOX)
                b = decoded['diffuse'].resize(dims, Image.Resampling.BOX)
                error = np.abs(np.asarray(a, float) - np.asarray(b, float))
                entry = {'divisor': divisor, 'dimensions': list(dims), 'meanAbsoluteError': float(error.mean()), 'maximum': float(error.max())}
                assert entry in row['distanceChecks']
                distances.append(entry)
            reports.append({'tier': tier, 'factor': factor, 'dimensions': list(size), 'maps': maps,
                            'allFiveDirectRGBFloatUVNormalAndCodecBytesExact': True, 'distanceChecks': distances})
        for divisor in (2, 4):
            dims = (64 // divisor, 256 // divisor)
            panel = Image.new('RGB', (dims[0] * 3, dims[1]))
            for index, im in enumerate((original, tier_views['Mid']['RGB'], tier_views['High']['RGB'])):
                panel.paste(im.resize(dims, Image.Resampling.BOX), (dims[0] * index, 0))
            decoded_witness('native-Mid-High-BOX' + str(dims[0]) + '.png', panel)
        central = Image.new('RGB', (512, 310), (28, 30, 33))
        draw = ImageDraw.Draw(central)
        for index, (tier, factor) in enumerate((('Mid', 4), ('High', 8))):
            for column, role in enumerate(('RGB', 'height', 'neutral-A', 'neutral-B')):
                im = tier_views[tier][role]
                box = tuple(int(v * factor / 8) for v in (192, 192, 320, 320))
                draw.text((column * 128, index * 155 + 2), tier + ' ' + role, fill='white')
                central.paste(im.crop(box), (column * 128, index * 155 + 22))
        decoded_witness('actual-central-petal-both-tiers-1to1.png', central)
        assert len(diagnostic_views) == 65
        review = BASE / 'review/final-v1'
        html_bytes = read(review / 'index.html')
        html_parser = Parser()
        html_parser.feed(html_bytes.decode())
        assert not html_parser.scripts and len(html_parser.images) == 4
        assert {r['src'] for r in html_parser.images} == {f'rtex018-{tier}-{role}.jpg' for tier in ('mid', 'high') for role in ('review', 'relief')}
        assert b'Mid (default) [256, 1024]' in html_bytes and b'High [512, 2048]' in html_bytes
        commands, previews = [], []
        with tempfile.TemporaryDirectory(prefix='quaked-rtex018-final-public-', dir='/private/tmp') as work:
            temporary = Path(work)
            def run(arguments):
                argv = ['/usr/bin/python3', *map(str, arguments)]
                result = subprocess.run(argv, cwd=ROOT, env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'), capture_output=True, text=True, timeout=180)
                commands.append({'command': argv, 'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
                assert result.returncode == 0, result.stderr
            run([ROOT / 'tools/texture_sheets/derive_texture_tiers.py', '--original', ROOT / item['original'],
                 '--master', package.parent / 'color.png', '--height-master', package.parent / 'height.npy', '--output', temporary / 'tiers'])
            for row in tiers['tiers'].values():
                for record in row['outputs'].values():
                    assert (temporary / 'tiers' / record['file']).read_bytes() == read(tiers_path.parent / record['file'])
            assert (temporary / 'tiers/manifest.json').read_bytes() == read(tiers_path)
            run([ROOT / 'tools/texture_sheets/build_texture_batch_review.py', '--batch', batch_path, '--paths-root', ROOT, '--output', temporary / 'review'])
            assert (temporary / 'review/index.html').read_bytes() == html_bytes
            for tier in ('mid', 'high'):
                for role in ('review', 'relief'):
                    name = f'rtex018-{tier}-{role}.jpg'
                    a = np.asarray(image(review / name))
                    b = np.asarray(Image.open(temporary / 'review' / name).convert('RGB'))
                    assert a.shape == b.shape
                    if role == 'review':
                        assert a.shape == (1234, 1400, 3)
                        boxes = {'title': [0,0,1400,32], 'native': [12,32,140,544], 'diffuse': [540,32,668,544], 'detail': [1068,32,1324,288],
                                 'repeat': [12,570,524,1082], 'half-label': [540,570,1400,595], 'half-native': [540,595,636,979], 'half-enhanced': [646,595,742,979],
                                 'quarter-label': [540,997,1400,1022], 'quarter-native': [540,1022,588,1214], 'quarter-enhanced': [598,1022,646,1214]}
                    else:
                        assert a.shape == (1100, 1200, 3)
                        boxes = {'top-labels': [0,0,1200,30], 'bottom-labels': [0,550,1200,580], 'height': [10,30,138,542],
                                 'XYZ': [610,30,738,542], 'light-A': [10,580,138,1092], 'light-B': [610,580,738,1092]}
                    occupied = np.zeros(a.shape[:2], bool)
                    panels = []
                    for label, (x0,y0,x1,y1) in boxes.items():
                        assert not occupied[y0:y1,x0:x1].any()
                        assert np.array_equal(a[y0:y1,x0:x1], b[y0:y1,x0:x1]), name + ' ' + label
                        occupied[y0:y1,x0:x1] = True
                        panels.append({'label': label, 'rectangle': [x0,y0,x1,y1], 'decodedRGBSHA256': sha(a[y0:y1,x0:x1].tobytes()), 'exact': True})
                    changed = np.any(a != b, 2)
                    tail = np.zeros_like(changed)
                    tail[-16:, -40:] = True
                    assert not np.any(tail & occupied) and not np.any(changed & ~tail)
                    previews.append({**witness(review / name), 'fullJPEGBytesExact': read(review / name) == (temporary / 'review' / name).read_bytes(),
                                     'changedPixels': int(changed.sum()), 'panels': panels, 'onlyUnusedTailMayDiffer': True})
        assert not temporary.exists()
        assert sum(len(r['panels']) for r in previews) == 34
        assert all(path.read_bytes() == data for path, data in watched.items())
        assert all(archive_sha(path) == digest for path, digest in source['archivesStable'].items())
        report.update(verdict='PASS observed source custody, direct10-map float/UV-normal/codec, real public CLI and all34 rectangular preview panels; actual final ART separate',
                      materials=[{'nativeIdentity': ID, 'name': 'rtex018', 'edition': 'base', 'artVariantID': 'woodland-bridge',
                                  'masterPackage': witness(package), 'tierReceipt': witness(tiers_path), 'tiers': reports}],
                      modelCalls=source['modelCalls'], selectedSourceAncestryCalls=source['selectedSourceAncestryCalls'],
                      sourceMathPublicProof=witness(source_path), sourceProofCarry='Previously actually executed source/RGB/float/public wrapper proofs carried through all current exact inputs and archives; no primary-only journal equality substituted.',
                      preTierPhysical=witness(physical_path), batch=witness(batch_path), freeze=witness(freeze_path),
                      frozenInputCount=len(frozen), frozenInputsStable=True, publicCLIReplay=commands,
                      freezeBoundary=freeze.get('kind', 'Author candidate freeze; see exact sealed record'),
                      HTML=witness(review / 'index.html'), HTMLBytesExact=True, HTMLImages=4, scripts=0,
                      previewFiles=previews, all34PanelsExact=True, all4JPEGBytesExact=all(x['fullJPEGBytesExact'] for x in previews),
                      decodedDiagnosticViews=diagnostic_views, allTenMapsAndManifestBytesExact=True,
                      privateReplay={'path': str(temporary), 'removed': True}, inputsStable=True,
                      limits=['Offline technical proof only; reviewer actual decoded material/physical/distance/tiling ART remains separate.',
                              'JPEG allowance is confined to proven unused40x16tail; all label/content pixels and WebP map bytes must be exact.',
                              'No live browser/game/GPU, catalog, owner, Git, CI or release acceptance.'],
                      verifier=witness(__file__), newModelCalls=0, candidateMutations=0)
        report['inputs'] = [witness(path) for path in sorted(watched)]
    except Exception as error:
        report.update(verdict='HOLD final technical verification attempt failed', error=repr(error),
                      privateReplay={'path': str(temporary) if temporary else None, 'removed': temporary is None or not temporary.exists()})
        raise
    finally:
        report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        result_path = output / 'actual-v1.json'
        with result_path.open('x') as file:
            file.write(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'file': str(result_path.relative_to(ROOT)), 'sha256': sha(result_path.read_bytes()), 'verdict': report['verdict']}))


if __name__ == '__main__':
    main()
