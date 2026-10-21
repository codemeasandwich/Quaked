"""Independent frozen rtex388 native/RGB/float/direct-map/CLI/preview replay.

Author checks are sealed custody inputs, never the oracle or an ART decision.
"""
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
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
DOC = Path(__file__).resolve().parent
SOURCE_DOC = DOC.parent
BASE = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-11-rtex388'
OUT = DOC/'actual-v1.json'
PREVIEW = DOC/'preview-v1.json'
watched = {}
sha = lambda data: hashlib.sha256(data).hexdigest()


def read(value):
    value = Path(value)
    value = (value if value.is_absolute() else ROOT/value).resolve()
    data = value.read_bytes()
    assert value not in watched or watched[value] == data, 'Changed input '+str(value)
    watched[value] = data
    return data


def load(value):
    return json.loads(read(value))


def witness(value):
    value = Path(value)
    value = (value if value.is_absolute() else ROOT/value).resolve()
    data = read(value)
    return {'file': str(value.relative_to(ROOT)) if ROOT in value.parents else str(value), 'sha256': sha(data), 'bytes': len(data)}


def image(value):
    return Image.open(io.BytesIO(read(value))).convert('RGB')


def write(name, report):
    target = DOC/name
    with target.open('x') as file:
        file.write(json.dumps(report, indent=2)+'\n')
    return witness(target)


def oracle_functions(file, names, context):
    module = ast.parse(read(file))
    functions = ast.Module(body=[row for row in module.body if isinstance(row, ast.FunctionDef) and row.name in names], type_ignores=[])
    assert {row.name for row in functions.body} == set(names)
    exec(compile(functions, str(file), 'exec'), context)


def archive_sha(value):
    h = hashlib.sha256()
    with open(value, 'rb') as file:
        for chunk in iter(lambda: file.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()


def save(name, im):
    target = DOC/name
    assert not target.exists()
    im.save(target, 'PNG')
    return witness(target)


def main():
    assert not OUT.exists() and not PREVIEW.exists()
    report = {'schemaVersion': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'scope': 'Independent actual native/source/master/direct10map and public CLI replay for one frozen rtex388 candidate; ART separate', 'verdict': 'HOLD'}
    temporary = None
    try:
        freeze_path = SOURCE_DOC/'CANDIDATE_FREEZE.json'
        freeze = load(freeze_path)
        assert sha(read(freeze_path)) == '0fa5f47f6e7aedcd2b7dd3e0b185905f571c97a79135d8fc602ae831b144596b'
        assert len(freeze['files']) == 80
        for row in freeze['files']:
            assert sha(read(row['file'])) == row['sha256']
        descriptor = load(BASE/'batch.json')
        item, = descriptor['items']
        journal, = load(BASE/'selection.json')['items']
        mp = ROOT/item['masterPackage']
        tp = ROOT/item['tierReceipt']
        m, receipt = load(mp), load(tp)
        identity = item['nativeIdentity']['id']
        assert identity == journal['id'] == 'ddf78c81cf519fbda0afc975b11b42f42949e3f9297a2e8f8dc3310c183b8d24'
        assert sha(read(BASE/'batch.json')) == 'c6507e71abfc3c3d10613f571bb07942a1d8daf2159793487dd4a71796b9d6ef'
        assert sha(read(mp)) == item['masterPackageSha256'] == 'ad714db9bf3a153daae1ce0cbd3b5da25ddb2d571f438fe4a5b25641d7bea9cf'
        assert sha(read(tp)) == item['tierReceiptSha256'] == '5e7dda481d9dd9f387aa0f3614df386bacd999fed7b4102a846e34a6f6bb89e2'
        assert item['generationCount'] == journal['generationCount'] == m['generationCount'] == 1
        assert journal['generationState'] == 'generated-retained' and journal['profile'] == 'wood'
        assert descriptor['counts'] == {'nativeBindings': 1, 'newGenerations': 1, 'newMasterPackages': 1, 'newMapFiles': 10, 'mapReferences': 10}
        assert (descriptor['quality'], descriptor['method'], descriptor['lossless']) == (92, 6, False)
        for role in ('original', 'generated', 'prompt'):
            row = m['inputs'][role]
            assert sha(read(row['file'])) == row['sha256'] == journal[role+'Sha256'] == item[role+'Sha256']
            assert Path(row['file']).resolve() == (ROOT/item[role]).resolve()
        for row in m['tools'].values():
            assert sha(read(row['file'])) == row['sha256']
        assert receipt['tools']['deriverSha256'] == sha(read(ROOT/'tools/texture_sheets/derive_texture_tiers.py'))
        assert receipt['tools']['normalMathSha256'] == sha(read(ROOT/'tools/craft_normals.py'))
        assert read(m['inputs']['generated']['file']) == read(journal['builtInOutput'])
        original, raw = image(item['original']), image(item['generated'])
        assert original.size == (64, 64) and raw.size == (1254, 1254)
        assert m['masterDimensions'] == [512, 512] and m['canonicalMasterFactor'] == 8

        native_proof = load(SOURCE_DOC/'native-and-peer-proof.json')
        inventory = load(SOURCE_DOC/'native-audit/inventory.json')
        plan = load(SOURCE_DOC/'root-plan-review.json')
        assert native_proof['targetNativeIdentity'] == plan['nativeIdentity'] == identity
        assert native_proof['allFourMipBytesEqual'] and native_proof['ordinaryFlagsEqual']
        archives = {row['path']: row for row in inventory['archives']}
        selected_sources = {row['source'] for variant in native_proof['variants'] for row in variant['provenance']}
        palette_file = '/Users/bri/quaked/Hexen 2/data1/pak0.pak'
        selected_sources.add(palette_file)
        archive_before, directories = {}, {}
        for file in sorted(selected_sources):
            archive_before[file] = archive_sha(file)
            assert archive_before[file] == archives[file]['sha256'] and Path(file).stat().st_size == archives[file]['bytes']
            with open(file, 'rb') as source:
                magic, offset, count = struct.unpack('<4sII', source.read(12))
                assert magic == b'PACK' and count % 64 == 0
                source.seek(offset)
                table = source.read(count)
            assert len(table) == count
            directory = {}
            for index in range(0, count, 64):
                name = table[index:index+56].split(b'\0')[0].decode('ascii').lower()
                directory.setdefault(name, []).append(struct.unpack_from('<II', table, index+56))
            directories[file] = directory

        def member(file, name):
            entries = directories[file][name]
            assert len(entries) == 1, 'Ambiguous selected native member'
            offset, size = entries[0]
            with open(file, 'rb') as source:
                source.seek(offset)
                data = source.read(size)
            assert len(data) == size
            return data, offset

        palette, _ = member(palette_file, 'gfx/palette.lmp')
        assert len(palette) == 768 and sha(palette) == item['nativeIdentity']['paletteSha256']
        common, occurrences = None, []
        for variant in native_proof['variants']:
            keys = set()
            for row in variant['provenance']:
                key = (row['source'], row['map'], row['slot'])
                assert key not in keys
                keys.add(key)
                bsp, offset = member(row['source'], row['map'])
                assert offset == row['memberOffset'] and sha(bsp) == row['bspSha256'] and struct.unpack_from('<i', bsp)[0] == 29
                lumps = [struct.unpack_from('<II', bsp, 4+i*8) for i in range(15)]
                begin, length = lumps[2]
                assert 0 <= row['slot'] < struct.unpack_from('<i', bsp, begin)[0]
                at = begin+struct.unpack_from('<i', bsp, begin+4+4*row['slot'])[0]
                assert bsp[at:at+16].split(b'\0')[0].decode('ascii') == variant['name']
                assert struct.unpack_from('<II', bsp, at+16) == (64, 64)
                mips = []
                for level in range(4):
                    relative = struct.unpack_from('<I', bsp, at+24+level*4)[0]
                    size = (64 >> level)**2
                    assert relative >= 40 and at+relative+size <= begin+length
                    mips.append(bsp[at+relative:at+relative+size])
                assert [sha(data) for data in mips] == row['fourMipSHA256'] == variant['fourMipSHA256']
                if common is None:
                    common = mips
                assert mips == common
                ti, n = lumps[6]
                fo, size_f = lumps[7]
                assert n % 40 == 0 and size_f % 20 == 0
                texinfos = {i: struct.unpack_from('<i', bsp, ti+i*40+36)[0] for i in range(n//40)
                            if struct.unpack_from('<i', bsp, ti+i*40+32)[0] == row['slot']}
                assert set(texinfos.values()) == {0} and set(row['ordinaryTexinfoFlags']) == {0}
                faces = sum(struct.unpack_from('<H', bsp, fo+i*20+10)[0] in texinfos for i in range(size_f//20))
                assert faces == row['faces']
                occurrences.append({'nativeIdentity': variant['nativeIdentity'], 'name': variant['name'], 'source': row['source'], 'map': row['map'], 'slot': row['slot'], 'faces': faces, 'fourMipSHA256': [sha(data) for data in mips], 'ordinaryFlags': [0]})
            assert len(keys) == variant['uniquePathMapSlotCount']
            assert sha(read(variant['original']['file'])) == variant['original']['sha256'] == item['originalSha256']
        rgba = np.c_[np.frombuffer(palette, dtype='uint8').reshape(256, 3)[np.frombuffer(common[0], dtype='uint8')], np.full(4096, 255, dtype='uint8')].reshape(64, 64, 4)
        assert rgba.tobytes() == original.convert('RGBA').tobytes()
        assert sha(rgba.tobytes()) == item['nativeIdentity']['rgbaSha256'] and sha(common[0]) == item['nativeIdentity']['indexedPixelSha256']

        reg = m['registration']
        assert (reg['method'], reg['factor'], reg['colorStrength'], reg['fieldSigma'], reg['axis'], reg['verticalLandmarks'], reg['edgeAnchor']) == ('photographic', 8, .65, .75, None, None, False)
        donor = np.asarray(raw.resize((512, 512), Image.Resampling.LANCZOS), dtype=float)
        native = np.asarray(original, dtype=float)
        delta = native.reshape(32, 2, 32, 2, 3).mean((1, 3))-donor.reshape(32, 16, 32, 16, 3).mean((1, 3))
        frequencies = np.fft.fftfreq(32)[:, None]**2+np.fft.fftfreq(32)[None, :]**2
        field = np.fft.ifft2(np.fft.fft2(delta, axes=(0, 1))*np.exp(-2*np.pi**2*.75**2*frequencies)[:, :, None], axes=(0, 1)).real
        channels = [np.asarray(Image.fromarray(np.tile(field[:, :, c], (3, 3)).astype('float32'), 'F').resize((1536, 1536), Image.Resampling.BICUBIC))[512:1024, 512:1024] for c in range(3)]
        rgb = np.rint(np.clip(donor+np.stack(channels, axis=2)*.65, 0, 255)).astype('uint8')
        png = io.BytesIO();Image.fromarray(rgb).save(png, 'PNG')
        assert png.getvalue() == read(mp.parent/'color.png') and sha(png.getvalue()) == m['color']['sha256']
        craft_context = {'np': np, 'math': math}
        oracle_functions(ROOT/'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py', {'blur', 'unit', 'extreme', 'smooth', 'craft64'}, craft_context)
        scalar = craft_context['craft64'](rgb, m['height']['profile']).astype('float32')
        npy = io.BytesIO();np.save(npy, scalar, allow_pickle=False)
        assert npy.getvalue() == read(mp.parent/'height.npy') and sha(npy.getvalue()) == m['height']['sha256']
        assert scalar.shape == (512, 512) and np.isfinite(scalar).all() and 0 <= scalar.min() <= scalar.max() <= 1
        tier_context = {'np': np, 'Image': Image, 'io': io}
        oracle_functions(ROOT/'tests/hexen2_texture_tiers_test.py', {'q92', 'periodic_rgb', 'float_box', 'cyclic_normals', 'vp8_only'}, tier_context)
        material = {'name': item['name'], 'edition': item['edition'], 'nativeIdentity': identity,
                    'masterPackage': witness(mp), 'tierReceipt': witness(tp), 'color': witness(mp.parent/'color.png'), 'height': witness(mp.parent/'height.npy'),
                    'retainedRaw': witness(item['generated']), 'exactPrompt': witness(item['prompt']), 'rawBuiltinBytesExact': True, 'masterRGBIndependentBytesExact': True, 'floatHeightIndependentBytesExact': True, 'tiers': []}
        art_evidence = []
        for name, factor in [('Mid', 4), ('High', 8)]:
            tier = receipt['tiers'][name]
            size = (64*factor, 64*factor)
            assert tier['factor'] == factor and tier['dimensions'] == list(size)
            h = tier_context['float_box'](scalar, size)
            normal = tier_context['cyclic_normals'](h, receipt['strength'], receipt['cap'])
            packed = np.rint(np.clip(normal*.5+.5, 0, 1)*255).astype('uint8')
            raws = {'diffuse': tier_context['periodic_rgb'](Image.fromarray(rgb), size), 'height': Image.fromarray(np.rint(h*255).astype('uint8'))}
            raws.update({role: Image.fromarray(packed[:, :, c]) for c, role in enumerate(('normalX', 'normalY', 'normalZ'))})
            decoded, maps = {}, []
            for role in raws:
                recorded = tier['outputs'][role]
                actual_file = tp.parent/recorded['file']
                data = read(actual_file)
                assert data == tier_context['q92'](raws[role]) and sha(data) == recorded['sha256']
                assert (recorded['quality'], recorded['method'], recorded['lossless']) == (92, 6, False)
                tier_context['vp8_only'](data)
                decoded[role] = image(actual_file)
                assert decoded[role].size == size and str(actual_file.relative_to(ROOT)) == item['tiers'][name]['files'][role]
                maps.append({'role': role, **witness(actual_file)})
            distances = []
            for divisor in (2, 4):
                dims = (64//divisor, 64//divisor)
                error = np.abs(np.asarray(original.resize(dims, Image.Resampling.BOX), dtype=float)-np.asarray(decoded['diffuse'].resize(dims, Image.Resampling.BOX), dtype=float))
                result = {'divisor': divisor, 'dimensions': list(dims), 'meanAbsoluteError': float(error.mean()), 'maximum': float(error.max())}
                assert result in tier['distanceChecks']
                distances.append(result)
                panel = Image.new('RGB', (dims[0]*2, dims[1]));panel.paste(original.resize(dims, Image.Resampling.BOX), (0, 0));panel.paste(decoded['diffuse'].resize(dims, Image.Resampling.BOX), (dims[0], 0))
                art_evidence.append(save(name.lower()+'-BOX'+str(dims[0])+'.png', panel))
            drgb = np.asarray(decoded['diffuse']);n = len(drgb);span = n//4
            art_evidence += [save(name.lower()+'-repeat.png', Image.fromarray(np.tile(drgb, (2, 2, 1)))),
                            save(name.lower()+'-X-full.png', Image.fromarray(np.concatenate([drgb[:, -span:], drgb[:, :span]], axis=1))),
                            save(name.lower()+'-Y-full.png', Image.fromarray(np.concatenate([drgb[-span:], drgb[:span]], axis=0))),
                            save(name.lower()+'-corner.png', Image.fromarray(np.roll(np.roll(drgb, span, axis=0), span, axis=1)[:span*2, :span*2]))]
            vec = np.stack([np.asarray(decoded[role], float)[:, :, 0] for role in ('normalX', 'normalY', 'normalZ')], axis=2)/127.5-1
            vec /= np.maximum(np.linalg.norm(vec, axis=2, keepdims=True), 1e-12)
            panel = Image.new('RGB', (n*2, n*2));panel.paste(decoded['height'], (0, 0));panel.paste(Image.fromarray(np.rint(np.clip((vec*.5+.5)*255, 0, 255)).astype('uint8')), (n, 0))
            for index, direction in enumerate(((.6, .3, .75), (-.6, -.3, .75))):
                light = np.array(direction);light /= np.linalg.norm(light)
                neutral = np.rint(np.clip((.35+.65*np.maximum(0, np.einsum('ijk,k->ij', vec, light)))*255, 0, 255)).astype('uint8')
                panel.paste(Image.fromarray(neutral).convert('RGB'), (index*n, n))
            art_evidence.append(save(name.lower()+'-height-XYZ-neutral-lights.png', panel))
            material['tiers'].append({'tier': name, 'dimensions': list(size), 'allFiveDirectQ92Method6BytesExact': True, 'maps': maps, 'distanceChecks': distances})

        commands, preview_rows = [], []
        with tempfile.TemporaryDirectory(prefix='quaked-rtex388-independent-', dir='/private/tmp') as work:
            temporary = Path(work)
            def run(args):
                argv = ['/usr/bin/python3', *map(str, args)]
                process = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, timeout=120)
                commands.append({'command': argv, 'exitCode': process.returncode, 'stdout': process.stdout, 'stderr': process.stderr})
                assert process.returncode == 0, process.stderr
            run([ROOT/'tools/texture_sheets/prepare_texture_master.py', '--original', ROOT/item['original'], '--generated', ROOT/item['generated'], '--prompt', ROOT/item['prompt'], '--name', 'rtex388', '--edition', 'base', '--profile', 'wood', '--color-strength', '.65', '--field-sigma', '.75', '--output', temporary/'master'])
            for file in ('color.png', 'height.npy', 'master.json'):
                assert (temporary/'master'/file).read_bytes() == read(mp.parent/file)
            run([ROOT/'tools/texture_sheets/derive_texture_tiers.py', '--original', ROOT/item['original'], '--master', mp.parent/'color.png', '--height-master', mp.parent/'height.npy', '--output', temporary/'tiers'])
            for tier in receipt['tiers'].values():
                for row in tier['outputs'].values():
                    assert (temporary/'tiers'/row['file']).read_bytes() == read(tp.parent/row['file'])
            assert (temporary/'tiers/manifest.json').read_bytes() == read(tp)
            run([ROOT/'tools/texture_sheets/build_texture_batch_review.py', '--batch', BASE/'batch.json', '--paths-root', ROOT, '--output', temporary/'review'])
            assert (temporary/'review/index.html').read_bytes() == read(BASE/'review/index.html')
            for name in ('mid-review', 'mid-relief', 'high-review', 'high-relief'):
                file = BASE/'review'/('rtex388-'+name+'.jpg')
                replay = temporary/'review'/file.name
                a, b = np.asarray(image(file)), np.asarray(Image.open(replay).convert('RGB'))
                assert a.shape == b.shape
                if name.endswith('review'):
                    boxes = {'title': (0, 0, 1400, 32), 'native': (12, 32, 524, 544), 'diffuse': (540, 32, 1052, 544), 'detail': (1068, 32, 1324, 288), 'repeat': (12, 570, 524, 1082), 'half-label': (540, 570, 1400, 595), 'half-native': (540, 595, 636, 691), 'half-enhanced': (646, 595, 742, 691), 'quarter-label': (540, 805, 1400, 830), 'quarter-native': (540, 830, 588, 878), 'quarter-enhanced': (598, 830, 646, 878)}
                else:
                    boxes = {'top-labels': (0, 0, 1200, 30), 'bottom-labels': (0, 550, 1200, 580), 'height': (10, 30, 522, 542), 'XYZ': (610, 30, 1122, 542), 'light-A': (10, 580, 522, 1092), 'light-B': (610, 580, 1122, 1092)}
                # Mid relief is displayed at its actual 256, not enlarged to512.
                if name == 'mid-relief':
                    for key in ('height', 'XYZ', 'light-A', 'light-B'):
                        x, y, _, _ = boxes[key];boxes[key] = (x, y, x+256, y+256)
                occupied = np.zeros(a.shape[:2], dtype=bool);panels = []
                for label, (x0, y0, x1, y1) in boxes.items():
                    assert not occupied[y0:y1, x0:x1].any()
                    assert np.array_equal(a[y0:y1, x0:x1], b[y0:y1, x0:x1]), file.name+' '+label
                    occupied[y0:y1, x0:x1] = True
                    panels.append({'panel': label, 'rectangle': [x0, y0, x1, y1], 'decodedRGBSHA256': sha(a[y0:y1, x0:x1].tobytes()), 'exactReplay': True})
                changed = np.any(a != b, axis=2);padding = np.zeros_like(changed);padding[-16:, -40:] = True
                assert not np.any(padding & occupied) and not np.any(changed & ~padding)
                preview_rows.append({**witness(file), 'fullJPEGBytesExact': read(file) == replay.read_bytes(), 'panels': panels, 'changedPixels': int(changed.sum()), 'knownEmptyTailPaddingOnly': True})
        assert not temporary.exists()
        assert all(file.read_bytes() == data for file, data in watched.items())
        assert all(archive_sha(file) == digest for file, digest in archive_before.items())
        preview_report = {'schemaVersion': 1, 'verdict': 'PASS actual review CLI, all decoded content/labels and HTML exact; full JPEG equality recorded individually', 'descriptor': witness(BASE/'batch.json'), 'masterPackage': witness(mp), 'tierReceipt': witness(tp), 'reviewProducer': witness(ROOT/'tools/texture_sheets/build_texture_batch_review.py'), 'HTML': witness(BASE/'review/index.html'), 'HTMLBytesExact': True, 'all4JPEGBytesExact': all(row['fullJPEGBytesExact'] for row in preview_rows), 'files': preview_rows, 'publicCLI': commands[-1], 'ownedTemporaryReplayRemoved': True, 'limits': 'Preview provenance, not browser interaction/ART/runtime acceptance; any permitted JPEG variance confined to proven unused40x16tail, never content or labels'}
        preview_witness = write('preview-v1.json', preview_report)
        report.update(verdict='PASS independent native/source/master/direct10map math and actual prepare/derive/review CLI replay; ART remains separate',
                      materials=[material], freeze=witness(freeze_path), frozenInputCount=80,
                      freshNativeOccurrences=occurrences, physicalSlotCounts={variant['name']: len(variant['provenance']) for variant in native_proof['variants']},
                      peerScope='rtex080 exact source equivalence freshly checked, own Low retained; enhanced/art reuse is conditional on primary candidate ART acceptance, no peer binding created',
                      declaredRetainedGenerations=1, newGenerations=0, physicalMasters=1, physicalMaps=10, nativeBindings=1,
                      publicCLIReplay=commands, publicCLIAllMasterMapsAndManifestBytesExact=True,
                      preview=preview_witness, diagnosticEvidence=art_evidence,
                      codec={'Python': __import__('sys').version, 'Pillow': PIL.__version__, 'NumPy': np.__version__},
                      archiveInputsStable=archive_before, inputsStable=True,
                      cleanup={'ownedReplay': str(temporary), 'removed': True}, verifier=witness(__file__))
        report['inputs'] = [witness(file) for file in sorted(watched)]
    except Exception as error:
        report.update(verdict='HOLD technical verification failure', error=repr(error), cleanup={'ownedReplay': str(temporary) if temporary else None, 'removed': temporary is None or not temporary.exists()})
        raise
    finally:
        report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        write('actual-v1.json', report)
        print(json.dumps({'file': str(OUT.relative_to(ROOT)), 'sha256': sha(OUT.read_bytes()), 'verdict': report['verdict']}))


if __name__ == '__main__':
    main()
