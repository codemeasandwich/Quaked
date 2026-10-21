"""Independent actual rtex018 layered scalar and public-wrapper replay only."""
import argparse
import datetime
import hashlib
import io
import json
import math
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[6]
DOC = Path(__file__).resolve().parent
SOURCE_DOC = DOC.parent
BASE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018/art-variants/woodland-bridge'
PLAN = SOURCE_DOC / 'baseline-layered-plan-v2'
ID = '7e009202100d48cda293f836a437e30d54c8d5a28ab7d190892a9c3683e397b6'
watched = {}
sha = lambda b: hashlib.sha256(b).hexdigest()


def read(path):
    path = Path(path)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    value = path.read_bytes()
    assert path not in watched or watched[path] == value, 'Input changed'
    watched[path] = value
    return value


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
    output = DOC / 'proof-v1.json'
    assert not output.exists(), 'Preserve attempts'
    report = {'schemaVersion': 1, 'reviewer': '/root/texture_06_mtex470',
              'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'scope': 'Actual unchanged-RGB 49-pane layered float reconstruction and public CLI replay; physical ART and tiers remain separate',
              'verdict': 'HOLD', 'materials': []}
    temporary = None
    try:
        package = BASE / 'masters/layered-v1/master.json'
        master = load(package)
        assert sha(read(package)) == args.package_sha
        recipe_path = PLAN / 'layered-recipe-v2.json'
        recipe = load(recipe_path)
        assert sha(read(recipe_path)) == '38cc5cde96a901032e12f27d2627b496ba156da2ead50261b159ad4e1f7f8179'
        refs(recipe['sourceVerification'])
        source_proof = load(recipe['sourceVerification']['file'])
        assert source_proof['verdict'].startswith('PASS')
        assert source_proof['immutableSelectedSource']['file'].endswith('woodland-bridge/source-selections/s1.json')
        assert source_proof['modelCalls'] == {'originalGeneration': 1, 'edits': 3, 'total': 4}
        assert source_proof['selectedSourceAncestryCalls'] == {'originalGeneration': 1, 'edits': 1, 'total': 2}
        for row in source_proof['inputs']:
            refs(row)
        refs(source_proof['immutableSelectedSource'])
        baseline_path = ROOT / recipe['sourceMasterPackage']
        baseline = load(baseline_path)
        assert sha(read(baseline_path)) == recipe['sourceMasterPackageSha256']
        row, = source_proof['materials']
        assert row['nativeIdentity'] == ID == recipe['nativeIdentity']
        assert row['masterPackage'] == witness(baseline_path)
        assert row['name'] == master['name'] == recipe['name'] == 'rtex018'
        assert row['edition'] == master['edition'] == recipe['edition'] == 'base'
        plan_review_path = SOURCE_DOC / 'independent-baseline-physical-plan-v1/final49-layered-plan-v2-review.json'
        assert load(plan_review_path)['verdict'].startswith('PASS')
        approval = load(PLAN / 'root-layered-trial-approval.json')
        refs(approval)
        refs(master['inputs'])
        refs(master['tools'])
        assert master['generationCount'] == 1  # local one-input metadata
        assert master['nativeDimensions'] == [64, 256] and master['masterDimensions'] == [512, 2048]
        assert master['height']['authoringPolicy'] == 'layered-veneer'
        assert master['height']['dtype'] == 'float32' and master['height']['quantizedTo8Bit'] is False
        assert master['masterRevision']['replacesUnqualifiedPackageSha256'] == sha(read(baseline_path))
        assert master['masterRevision']['previousHeightSha256'] == baseline['height']['sha256']
        assert master['masterRevision']['RGBUnchanged'] and master['masterRevision']['notAnotherGeneration']
        assert master['layeredRelief']['recipe'] == recipe
        assert master['layeredRelief']['recipeSha256'] == sha(read(recipe_path))
        color_bytes = read(package.parent / 'color.png')
        assert color_bytes == read(baseline_path.parent / 'color.png')
        assert sha(color_bytes) == master['color']['sha256'] == recipe['authoringDiffuseSha256']
        layering = recipe['layering']
        assert [layering[k] for k in ('facingHeight', 'brickHeight', 'chipFloor', 'microAmplitude', 'bevelPixels')] == [.52, .5, .505, 0, .5]
        assert layering['referenceSize'] == [64, 256] and len(layering['brickRegions']) == 49
        # Independently rasterize the actual native-coordinate regions, including torus copies.
        mask_image = Image.new('L', (512, 2048))
        draw = ImageDraw.Draw(mask_image)
        for region in layering['brickRegions']:
            for dy in (-2048, 0, 2048):
                for dx in (-512, 0, 512):
                    draw.polygon([(x * 8 + dx, y * 8 + dy) for x, y in region['polygon']], fill=255)
        mask = np.asarray(mask_image, dtype=float) / 255
        assert int(np.count_nonzero(mask)) == 596458
        assert np.array_equal(np.rint(mask * 255).astype('uint8'), np.asarray(Image.open(PLAN / 'final49-pane-mask.png')))
        assert not any((mask[0].any(), mask[-1].any(), mask[:, 0].any(), mask[:, -1].any()))
        sigma = layering['bevelPixels'] * math.sqrt(mask.size) / 256
        assert sigma == master['layeredRelief']['bevelSigmaMasterPixels'] == 2
        freq = np.fft.fftfreq(2048)[:, None] ** 2 + np.fft.rfftfreq(512)[None, :] ** 2
        blurred = np.fft.irfft2(np.fft.rfft2(mask) * np.exp(-2 * np.pi ** 2 * sigma ** 2 * freq), s=mask.shape)
        facing = .52 - (.52 - .505) * np.minimum(blurred * 2, 1)
        # microAmplitude is exactly zero: pigment/craft detail contributes no scalar architecture.
        height = np.where(mask > .5, .5, facing).astype('float32')
        buffer = io.BytesIO()
        np.save(buffer, height, allow_pickle=False)
        height_bytes = read(package.parent / 'height.npy')
        assert buffer.getvalue() == height_bytes and sha(height_bytes) == master['height']['sha256']
        assert np.isfinite(height).all() and height.shape == (2048, 512)
        assert np.unique(height[mask > .5]).tolist() == [.5]
        assert height[mask > .5].max() < height[mask <= .5].min()
        seal = load(PLAN / 'PLAN_SEAL.json')
        refs(seal)
        samples = []
        for item in seal['sourceClassifiedSamples']:
            x, y = item['masterXY']
            assert bool(mask[y, x]) == item['expectedPane']
            samples.append({'role': item['role'], 'masterXY': [x, y],
                            'sourceClassifiedPane': item['expectedPane'], 'actualHeight': float(height[y, x]),
                            'samplingScope': 'Point value; nearby interface patches may be mixed.'})
        native_proof = load(SOURCE_DOC / 'independent-baseline-source-master-v1/native-current-v2.json')
        archives = native_proof['archivesStable']
        assert all(archive_sha(path) == digest for path, digest in archives.items())
        with tempfile.TemporaryDirectory(prefix='quaked-rtex018-layered-replay-', dir='/private/tmp') as work:
            temporary = Path(work)
            command = ['/usr/bin/python3', str(ROOT / 'tools/texture_sheets/prepare_layered_texture_master.py'),
                       '--recipe', str(recipe_path), '--output', str(temporary / 'master')]
            run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=180)
            report['publicCLI'] = {'command': command, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr}
            assert run.returncode == 0, run.stderr
            for name in ('color.png', 'height.npy', 'master.json'):
                assert (temporary / 'master' / name).read_bytes() == read(package.parent / name), name
            report['publicCLI']['allThreeFilesByteExact'] = True
        assert not temporary.exists()
        assert all(path.read_bytes() == data for path, data in watched.items())
        assert all(archive_sha(path) == digest for path, digest in archives.items())
        report.update(verdict='PASS actual source-bound layered RGB/float and public CLI replay; actual physical ART and tiers remain unqualified',
                      materials=[{'nativeIdentity': ID, 'name': 'rtex018', 'edition': 'base', 'artVariantID': 'woodland-bridge',
                                  'masterPackage': witness(package), 'masterColor': witness(package.parent / 'color.png'),
                                  'masterHeight': witness(package.parent / 'height.npy'), 'currentReliefArtAccepted': False}],
                      independentMath={'RGBUnchanged': True, 'floatNPYBytesExact': True, 'panePixels': 596458,
                                       'sigmaMasterPixels': sigma, 'paneHeight': .5,
                                       'facingRange': [float(height[mask <= .5].min()), float(height[mask <= .5].max())]},
                      sourceClassifiedPointHeights=samples,
                      modelCalls=source_proof['modelCalls'], selectedSourceAncestryCalls=source_proof['selectedSourceAncestryCalls'],
                      immutableSelection=source_proof['immutableSelectedSource'],
                      qualificationBoundary='Actual geometry labels were independently planned; mathematical separation is not physical ART. Inspect actual height/XYZ/opposed lights and contacts before tiers. No decoded map, runtime, registration, owner, Git or release acceptance.',
                      inputsStable=True, archivesStable=archives,
                      cleanup={'privateReplay': str(temporary), 'removed': True}, verifier=witness(__file__))
        report['inputs'] = [witness(path) for path in sorted(watched)]
    except Exception as error:
        report.update(verdict='HOLD layered verifier attempt failed', error=repr(error),
                      cleanup={'privateReplay': str(temporary) if temporary else None, 'removed': temporary is None or not temporary.exists()})
        raise
    finally:
        report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with output.open('x') as file:
            file.write(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'file': str(output.relative_to(ROOT)), 'sha256': sha(output.read_bytes()), 'verdict': report['verdict']}))


if __name__ == '__main__':
    main()
