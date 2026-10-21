"""Independent source/master-only rtex336 replay. No semantic relief acceptance."""
import ast
import datetime
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import subprocess
import tempfile

import numpy as np
import PIL
from PIL import Image, features

ROOT = Path(__file__).resolve().parents[6]
DOC = Path(__file__).resolve().parent
BASE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-14-rtex336'
SOURCE_DOC = DOC.parent
OUT = DOC / 'source-master-proof-v1.json'
IDENTITY = '6879799910e3c79bcc11e600e8975856fff356eedc1d04b5764b451a6653fae8'
PACKAGE_SHA = 'e88a937fbb06d21fa31a8c06cf73ca4be47c9c05e6fb7fa1efd2a6ece3a9251c'
watched = {}
sha = lambda value: hashlib.sha256(value).hexdigest()


def read(path):
    path = Path(path)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    data = path.read_bytes()
    assert path not in watched or watched[path] == data, 'Input changed between observations'
    watched[path] = data
    return data


def load(path):
    return json.loads(read(path))


def witness(path):
    path = Path(path)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    data = read(path)
    return {'file': str(path.relative_to(ROOT)) if ROOT in path.parents else str(path),
            'sha256': sha(data), 'bytes': len(data)}


def archive_hash(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    assert not OUT.exists(), 'Preserve sealed evidence'
    report = {'schemaVersion': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'scope': 'Independent rtex336 native/source/master-only exact RGB, full-float scalar and actual public CLI replay; semantic relief, tiers and ART remain unaccepted',
              'materials': [], 'verdict': 'HOLD'}
    temporary = None
    try:
        package = BASE / 'masters/rtex336-initial/master.json'
        m = load(package)
        assert sha(read(package)) == PACKAGE_SHA
        item, = load(BASE / 'selection.json')['items']
        selected, = load(BASE / 'native-selection.json')['items']
        inventory = load(ROOT / 'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json')
        native, = [row for row in inventory['variants'] if row['id'] == IDENTITY]
        native_proof = load(SOURCE_DOC / 'native-proof.json')
        native_proof['uniquePAKSlotOccurrences'] = native_proof['provenance']
        plan = load(SOURCE_DOC / 'root-plan-review.json')
        hold = load(SOURCE_DOC / 'initial-relief-hold.json')
        assert native_proof['verdict'].startswith('PASS') and plan['verdict'].startswith('PASS')
        assert native_proof['nativeIdentity'] == plan['nativeIdentity'] == item['id'] == selected['id'] == IDENTITY
        assert hold['verdict'].startswith('HOLD') and hold['masterPackage']['sha256'] == PACKAGE_SHA
        for proof in (native_proof, plan):
            proof_inputs = proof['inputs']
            pairs = proof_inputs.items() if isinstance(proof_inputs, dict) else [(row['file'], row['sha256']) for row in proof_inputs]
            for path, digest in pairs:
                assert sha(read(path)) == digest
        assert m['name'] == item['name'] == native['name'] == 'rtex336'
        assert m['edition'] == item['edition'] == 'base'
        assert m['generationCount'] == item['generationCount'] == 1
        assert item['generationState'] == 'generated-retained' and item['generationIssuedAt'] < item['generatedAt']
        assert m['nativeDimensions'] == item['nativeDimensions'] == [64, 128]
        assert m['generatedDimensions'] == item['generatedDimensions'] == [887, 1774]
        assert m['masterDimensions'] == [512, 1024] and m['canonicalMasterFactor'] == 8
        assert 'masterRevision' not in m and 'authoringPolicy' not in m['height']
        assert set(m['inputs']) == {'original', 'generated', 'prompt'}
        for group in ('inputs', 'tools'):
            for row in m[group].values():
                assert sha(read(row['file'])) == row['sha256']
        for role in ('original', 'generated', 'prompt'):
            assert m['inputs'][role]['sha256'] == item[role + 'Sha256']
            assert Path(m['inputs'][role]['file']).resolve() == (ROOT / item[role]).resolve()
        assert m['inputs']['original']['sha256'] == selected['selectedOriginal']['sha256'] == native_proof['original']['sha256']
        original = Image.open(io.BytesIO(read(m['inputs']['original']['file']))).convert('RGB')
        raw_bytes = read(m['inputs']['generated']['file'])
        assert raw_bytes == read(item['builtInOutput'])
        raw = Image.open(io.BytesIO(raw_bytes))
        assert original.size == (64, 128) and raw.size == (887, 1774) and raw.mode == 'RGB'
        assert sha(original.convert('RGBA').tobytes()) == native['rgbaSha256'] == native_proof['rgbaSha256']

        # Fresh physical native checks. Repeated effective profiles are not extra slots.
        archives = {row['path']: row for row in inventory['archives']}
        palette_archive = '/Users/bri/quaked/Hexen 2/data1/pak0.pak'
        paths = sorted({row['source'] for row in native_proof['uniquePAKSlotOccurrences']} | {palette_archive})
        directories, archive_before = {}, {}
        for path in paths:
            archive_before[path] = archive_hash(path)
            assert archive_before[path] == archives[path]['sha256']
            assert Path(path).stat().st_size == archives[path]['bytes']
            with open(path, 'rb') as file:
                magic, offset, size = struct.unpack('<4sII', file.read(12))
                assert magic == b'PACK' and size % 64 == 0
                file.seek(offset)
                table = file.read(size)
            assert len(table) == size
            directory, duplicates = {}, []
            for index in range(0, size, 64):
                name = table[index:index+56].split(b'\0')[0].decode('ascii').lower()
                entry = struct.unpack_from('<II', table, index+56)
                if name in directory:
                    first_offset, first_size = directory[name]
                    duplicate_offset, duplicate_size = entry
                    with open(path, 'rb') as file:
                        file.seek(first_offset)
                        first = file.read(first_size)
                        file.seek(duplicate_offset)
                        duplicate = file.read(duplicate_size)
                    assert first_size == duplicate_size and len(first) == first_size and first == duplicate
                    duplicates.append({'name': name, 'firstOffset': first_offset,
                                       'duplicateOffset': duplicate_offset, 'bytes': duplicate_size,
                                       'sha256': sha(duplicate), 'resolution': 'identical bytes; first native directory entry retained'})
                else:
                    directory[name] = entry
            assert duplicates == archives[path]['duplicates']
            directories[path] = directory

        def member(path, name):
            offset, size = directories[path][name]
            with open(path, 'rb') as file:
                file.seek(offset)
                data = file.read(size)
            assert len(data) == size
            return data, offset

        palette, _ = member(palette_archive, 'gfx/palette.lmp')
        assert len(palette) == 768 and sha(palette) == native['paletteSha256'] == native_proof['paletteSha256']
        physical, physical_keys, content_faces = [], set(), {}
        for row in native_proof['uniquePAKSlotOccurrences']:
            key = (row['source'], row['map'], row['slot'])
            assert key not in physical_keys
            physical_keys.add(key)
            bsp, offset = member(row['source'], row['map'])
            assert offset == row['memberOffset'] and sha(bsp) == row['bspSha256']
            assert struct.unpack_from('<i', bsp)[0] == 29
            lumps = [struct.unpack_from('<II', bsp, 4+i*8) for i in range(15)]
            start, size = lumps[2]
            assert 0 <= row['slot'] < struct.unpack_from('<i', bsp, start)[0]
            at = start + struct.unpack_from('<i', bsp, start+4+row['slot']*4)[0]
            assert bsp[at:at+16].split(b'\0')[0] == b'rtex336'
            assert struct.unpack_from('<II', bsp, at+16) == (64, 128)
            mips = []
            for level in range(4):
                mip_offset = struct.unpack_from('<I', bsp, at+24+level*4)[0]
                pixels = (64 >> level) * (128 >> level)
                assert mip_offset >= 40 and at+mip_offset+pixels <= start+size
                mips.append(bsp[at+mip_offset:at+mip_offset+pixels])
            assert [sha(data) for data in mips] == row['fourMipSHA256'] == native_proof['fourMipSHA256']
            assert sha(mips[0]) == native['indexedPixelSha256']
            tex_start, tex_size = lumps[6]
            face_start, face_size = lumps[7]
            assert tex_size % 40 == 0 and face_size % 20 == 0
            texinfos = {i: struct.unpack_from('<i', bsp, tex_start+i*40+36)[0]
                        for i in range(tex_size//40)
                        if struct.unpack_from('<i', bsp, tex_start+i*40+32)[0] == row['slot']}
            assert set(texinfos.values()) <= {0} and set(texinfos.values()) == set(row['ordinaryTexinfoFlags'])
            faces = sum(struct.unpack_from('<H', bsp, face_start+i*20+10)[0] in texinfos
                        for i in range(face_size//20))
            assert faces == row['faces']
            content_key = (archives[row['source']]['sha256'], row['map'], row['slot'])
            assert content_key not in content_faces or content_faces[content_key] == faces
            content_faces[content_key] = faces
            physical.append({'source': row['source'], 'map': row['map'], 'slot': row['slot'], 'faces': faces,
                             'bspSha256': sha(bsp), 'fourMipSHA256': [sha(data) for data in mips], 'ordinaryFlags': sorted(set(texinfos.values()))})
        assert physical_keys == {(row['source'], row['map'], row['slot']) for row in selected['provenance']}
        rgba = np.c_[np.frombuffer(palette, dtype='uint8').reshape(256, 3)[np.frombuffer(mips[0], dtype='uint8')],
                     np.full(8192, 255, dtype='uint8')].reshape(128, 64, 4)
        assert rgba.tobytes() == original.convert('RGBA').tobytes()

        # Independent photographic .65/.75 reconstruction, no producer imports.
        reg = m['registration']
        assert (reg['method'], reg['factor'], reg['comparisonDivisor'], reg['colorStrength'], reg['fieldSigma']) == ('photographic', 8, 2, .65, .75)
        assert reg['axis'] is None and reg['verticalLandmarks'] is None and not reg['edgeAnchor']
        donor = np.asarray(raw.resize((512, 1024), Image.Resampling.LANCZOS), dtype=float)
        native_rgb = np.asarray(original, dtype=float)
        delta = native_rgb.reshape(64, 2, 32, 2, 3).mean((1, 3)) - donor.reshape(64, 16, 32, 16, 3).mean((1, 3))
        frequency = np.fft.fftfreq(64)[:, None]**2 + np.fft.fftfreq(32)[None, :]**2
        field = np.fft.ifft2(np.fft.fft2(delta, axes=(0, 1))*np.exp(-2*np.pi*np.pi*.75*.75*frequency)[:, :, None], axes=(0, 1)).real
        channels = []
        for channel in range(3):
            tiled = np.tile(field[:, :, channel], (3, 3)).astype('float32')
            scaled = Image.fromarray(tiled, 'F').resize((1536, 3072), Image.Resampling.BICUBIC)
            channels.append(np.asarray(scaled)[1024:2048, 512:1024])
        rgb = np.rint(np.clip(donor + np.stack(channels, axis=2)*.65, 0, 255)).astype('uint8')
        color_bytes, height_bytes = read(package.parent/'color.png'), read(package.parent/'height.npy')
        buffer = io.BytesIO()
        Image.fromarray(rgb, 'RGB').save(buffer, 'PNG')
        assert buffer.getvalue() == color_bytes and sha(color_bytes) == m['color']['sha256']
        oracle = ROOT/'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py'
        definitions = ast.parse(read(oracle))
        names = {'blur', 'unit', 'extreme', 'smooth', 'craft64'}
        functions = ast.Module(body=[node for node in definitions.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[])
        context = {'np': np, 'math': math}
        exec(compile(functions, str(oracle), 'exec'), context)
        scalar = context['craft64'](rgb, m['height']['profile']).astype('float32')
        buffer = io.BytesIO()
        np.save(buffer, scalar, allow_pickle=False)
        assert buffer.getvalue() == height_bytes and sha(height_bytes) == m['height']['sha256']
        assert np.isfinite(scalar).all() and scalar.shape == (1024, 512) and 0 <= scalar.min() <= scalar.max() <= 1

        # Exercise the unchanged public producer into a new isolated output.
        with tempfile.TemporaryDirectory(prefix='quaked-rtex336-source-master-', dir='/private/tmp') as work:
            temporary = Path(work)
            command = ['/usr/bin/python3', str(ROOT/'tools/texture_sheets/prepare_texture_master.py')]
            for role, row in m['inputs'].items():
                command += ['--'+role, row['file']]
            command += ['--name', 'rtex336', '--edition', 'base', '--profile', 'stone', '--color-strength', '.65', '--field-sigma', '.75', '--output', str(temporary/'master')]
            run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=120)
            report['publicCLI'] = {'command': command, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr}
            assert run.returncode == 0, run.stderr
            assert (temporary/'master/color.png').read_bytes() == color_bytes
            assert (temporary/'master/height.npy').read_bytes() == height_bytes
            assert (temporary/'master/master.json').read_bytes() == read(package)
            report['publicCLI']['allThreeFilesByteExact'] = True
        assert not temporary.exists()
        assert all(path.read_bytes() == data for path, data in watched.items())
        assert all(archive_hash(path) == digest for path, digest in archive_before.items())
        report.update(verdict='PASS source/master-only exact photographic RGB, float scalar and public CLI replay; ordinary tonal relief remains HOLD',
                      materials=[{'nativeIdentity': IDENTITY, 'name': 'rtex336', 'edition': 'base',
                                  'masterPackage': witness(package), 'masterColor': witness(package.parent/'color.png'),
                                  'masterHeight': witness(package.parent/'height.npy'), 'currentReliefArtAccepted': False}],
                      nativePhysicalOccurrences=physical, nativePathFaceCount=sum(row['faces'] for row in physical),
                      nativeUniqueContentFaceCount=sum(content_faces.values()), nativeUniqueContentSlotCount=len(content_faces),
                      effectiveProfileFacesAreNotExtraNativeFaces=True,
                      independentMath={'RGBPNGBytesExact': True, 'floatNPYBytesExact': True,
                                       'scalarDtype': str(scalar.dtype), 'uniqueSamples': int(np.unique(scalar).size)},
                      sourceObservations='Viewed actual64x128 native and887x1774 photographic raw; recognisable grey-brown porous masonry with uneven courses/offsets/blue-grey mineral marks. This is not final material/edge/relief ART acceptance.',
                      reliefBoundary='Initial tonal scalar has correct lower contacts but oversized cragging and pigmentation-driven body macrorelief, and remains HOLD. This proof does not approve a semantic recipe, ordinary relief, tiers, runtime or owner acceptance.',
                      generationBoundary='One declared retained journal source, built-in output bytes exact; not a provider-side invocation audit.',
                      codec={'Python': __import__('sys').version, 'Pillow': PIL.__version__, 'NumPy': np.__version__, 'WebP': features.version('webp')},
                      archiveInputsStable=archive_before, inputsStable=True,
                      sourceAdaptation={'priorBoundedVerifier': witness(ROOT/'docs/hexen2/textures/parallel-2026-10-20/stream-10-rtex441/independent-source-master/verify.py'),
                                        'notes': 'Base portrait64x128 proof with14path/10content slots; photographic rectangular field and four rectangular native mips reconstructed explicitly. This run repeats actual source/RGB/float/CLI checks; no prior verdict copied.'},
                      cleanup={'ownedReplay': str(temporary), 'removed': True}, verifier=witness(__file__))
        report['inputs'] = [witness(path) for path in sorted(watched)]
    except Exception as error:
        report.update(verdict='HOLD source/master verification failure', error=repr(error),
                      cleanup={'ownedReplay': str(temporary) if temporary else None,
                               'removed': temporary is None or not temporary.exists()})
        raise
    finally:
        report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with OUT.open('x') as file:
            file.write(json.dumps(report, indent=2)+'\n')
        print(json.dumps({'file': str(OUT.relative_to(ROOT)), 'sha256': sha(OUT.read_bytes()), 'verdict': report['verdict']}))


if __name__ == '__main__':
    main()
