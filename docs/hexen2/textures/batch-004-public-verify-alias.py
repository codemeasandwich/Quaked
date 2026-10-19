"""Read-only explicit native-content alias proof; never infer aliases by name.

Checks every retained BSP occurrence of the two selected identities, every mip,
palette and ordinary texinfo semantics, unchanged Low bytes, and the qualified
shared master/relief package. No texture, tool or Git mutation.
"""
import datetime, hashlib, io, json, pathlib, struct, sys
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-004'
OUT = ROOT / 'docs/hexen2/textures/batch-004-public-alias.json'
assert not OUT.exists(), 'Retain prior evidence'
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text())
def witness(p):
    b = p.read_bytes()
    return {'file': str(p.relative_to(ROOT)), 'sha256': sha(b), 'bytes': len(b)}
report = {'schemaVersion': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'limits': ['Source-content reuse only; no runtime registration, UV/material/drawflag acceptance or game claim.',
                     'Keep each native id/name/edition/map/slot binding; this does not merge game identity.',
                     'Existing single generator output is retained provenance; no independent service invocation audit.']}
try:
    inventory_path = ROOT / 'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json'
    inventory = load(inventory_path)
    selection_path = BASE / 'selection.json'; selection = load(selection_path)
    item = next(i for i in selection['items'] if i['name'] == 'rtex008'); alias = item['contentAliasOf']
    assert item['id'] == '9e8ccce3d8037c703e0cbc472135571bc4fd4d931cd4c61513bacabc9a63a2fb'
    assert alias['id'] == '1e9b3f6a9b333e3e62a9ee57def585bfed779db08b2dfe116d0504b8d208b2d1' and alias['name'] == 'ttex013'
    assert item['generationCount'] == 0
    native = next(v for v in inventory['variants'] if v['id'] == item['id'])
    target = next(v for v in inventory['variants'] if v['id'] == alias['id'])
    for key in ('width', 'height', 'category', 'paletteSha256', 'indexedPixelSha256', 'rgbaSha256'):
        assert native[key] == target[key], key
    assert native['category'] == 'ordinary' and [native['width'], native['height']] == [64, 64]
    assert not any(v['name'].startswith(('*', '!', '+', '{')) or v['name'].lower().startswith('sky') for v in (native, target))
    paths = [pathlib.Path(__file__), inventory_path, selection_path, ROOT / item['original'], ROOT / alias['original'],
             ROOT / alias['masterPackage'], ROOT / alias['tierReceipt']]
    old_proof_path = ROOT / 'docs/hexen2/textures/batch-002-public-actual-v1.json'
    paths.append(old_proof_path); old_proof = load(old_proof_path)
    assert old_proof['verdict'].startswith('PASS') and old_proof['mapCount'] == 80
    old_material = next(m for m in old_proof['materials'] if m['name'] == 'ttex013')
    assert old_material['nativeIdentity'] == alias['id']
    assert sha((ROOT / alias['masterPackage']).read_bytes()) == alias['masterPackageSha256'] == old_material['masterPackage']['sha256']
    assert sha((ROOT / alias['tierReceipt']).read_bytes()) == alias['tierReceiptSha256']
    assert (ROOT / item['original']).read_bytes() == (ROOT / alias['original']).read_bytes()
    for original in (ROOT / item['original'], ROOT / alias['original']):
        rgba = np.asarray(Image.open(original).convert('RGBA'))
        assert rgba.shape == (64, 64, 4) and np.all(rgba[:, :, 3] == 255)
        assert sha(rgba.tobytes()) == native['rgbaSha256']
    directories = {}; archive_proofs = []
    def file_sha(path):
        h = hashlib.sha256()
        with path.open('rb') as f:
            for b in iter(lambda: f.read(1024**2), b''): h.update(b)
        return h.hexdigest()
    for archive in inventory['archives']:
        p = pathlib.Path(archive['path']); assert file_sha(p) == archive['sha256']
        with p.open('rb') as f:
            magic, off, count = struct.unpack('<4sII', f.read(12)); assert magic == b'PACK' and count % 64 == 0
            f.seek(off); table = f.read(count)
        assert len(table) == count
        directory = {}
        for at in range(0, count, 64):
            name = table[at:at+56].split(b'\0')[0].decode('ascii').lower()
            directory.setdefault(name, struct.unpack_from('<II', table, at+56))
        directories[str(p)] = directory; archive_proofs.append(archive)
    def member(source, name):
        offset, count = directories[source][name]
        with open(source, 'rb') as f: f.seek(offset); b = f.read(count)
        assert len(b) == count
        return b, offset
    palette, _ = member('/Users/bri/quaked/Hexen 2/data1/pak0.pak', 'gfx/palette.lmp')
    assert len(palette) == 768 and sha(palette) == native['paletteSha256']
    canonical_mips = None; occurrences = []
    for variant in (native, target):
        seen = set()
        for occurrence in variant['provenance']:
            key = (occurrence['source'], occurrence['map'], occurrence['slot'])
            if key in seen: continue
            seen.add(key)
            bsp, offset = member(occurrence['source'], occurrence['map'])
            assert offset == occurrence['memberOffset'] and sha(bsp) == occurrence['bspSha256']
            assert struct.unpack_from('<i', bsp)[0] == 29
            tex_off, tex_bytes = struct.unpack_from('<II', bsp, 20)
            at = tex_off + struct.unpack_from('<i', bsp, tex_off+4+4*occurrence['slot'])[0]
            assert bsp[at:at+16].split(b'\0')[0].decode('ascii') == variant['name']
            width, height = struct.unpack_from('<II', bsp, at+16); assert (width, height) == (64, 64)
            mips = []
            for level in range(4):
                local = struct.unpack_from('<I', bsp, at+24+4*level)[0]
                size = (width >> level)*(height >> level)
                assert local >= 40 and at+local+size <= tex_off+tex_bytes
                pixels = bsp[at+local:at+local+size]; assert len(pixels) == size
                mips.append(pixels)
            if canonical_mips is None: canonical_mips = mips
            assert mips == canonical_mips, (variant['name'], occurrence, 'Native mip levels differ')
            assert sha(mips[0]) == native['indexedPixelSha256']
            texinfo_off, texinfo_bytes = struct.unpack_from('<II', bsp, 4+6*8)
            assert texinfo_bytes % 40 == 0
            flags = {struct.unpack_from('<i', bsp, t+36)[0] for t in range(texinfo_off, texinfo_off+texinfo_bytes, 40)
                     if struct.unpack_from('<i', bsp, t+32)[0] == occurrence['slot']}
            assert not flags or flags == {0}, (variant['name'], occurrence, flags)
            occurrences.append({'nativeId': variant['id'], 'name': variant['name'], 'source': occurrence['source'], 'map': occurrence['map'],
              'slot': occurrence['slot'], 'bspSha256': occurrence['bspSha256'], 'ordinaryTexinfoFlags': sorted(flags),
              'allFourMipHashes': [sha(b) for b in mips]})
    package_path = ROOT / alias['masterPackage']; package = load(package_path)
    receipt_path = ROOT / alias['tierReceipt']; receipt = load(receipt_path)
    assert package['name'] == 'ttex013' and package['generationCount'] == 1
    assert package['height']['authoredOnce'] is True and package['height']['quantizedTo8Bit'] is False
    input_path = lambda record: pathlib.Path(record['file']) if pathlib.Path(record['file']).is_absolute() else ROOT / record['file']
    for row in package['inputs'].values():
        p = input_path(row); assert sha(p.read_bytes()) == row['sha256']; paths.append(p)
    color_path = package_path.parent / package['color']['file']; height_path = package_path.parent / package['height']['file']
    paths += [color_path, height_path]
    assert sha(color_path.read_bytes()) == package['color']['sha256'] == receipt['inputs']['master']['sha256']
    assert sha(height_path.read_bytes()) == package['height']['sha256'] == receipt['inputs']['heightMaster']['sha256']
    assert receipt['inputs']['original']['sha256'] == sha((ROOT / item['original']).read_bytes())
    color = Image.open(color_path).convert('RGB'); height = np.load(height_path, allow_pickle=False)
    assert color.size == (512, 512) and height.shape == (512, 512) and height.dtype == np.dtype('float32')
    raw = Image.open(input_path(package['inputs']['generated'])).convert('RGB')
    assert raw.width >= 512 and raw.height >= 512
    sys.path[:0] = [str(ROOT / 'tools'), str(ROOT / 'tools/texture_sheets')]
    from craft_normals import craft
    from finish_official_texture import finish
    original = Image.open(ROOT / item['original']).convert('RGB')
    registration = package['registration']; assert registration['verticalLandmarks'] is None
    replay_color, _ = finish(original, raw, factor=8, comparison_divisor=2, method='photographic',
      color_strength=registration['colorStrength'], field_sigma=registration['fieldSigma'])
    assert replay_color.tobytes() == color.tobytes()
    replay_height, _ = craft(np.asarray(color, dtype=float)/255, package['height']['profile'], quantize_height=False)
    assert np.array_equal(replay_height.astype('float32'), height)
    map_files = []
    for tier in receipt['tiers'].values():
        for row in tier['outputs'].values():
            p = receipt_path.parent / row['file']; assert sha(p.read_bytes()) == row['sha256']; paths.append(p); map_files.append(witness(p))
    assert len(map_files) == 10
    assert not (BASE / 'masters/rtex008').exists() and not (BASE / 'tiers/rtex008').exists() and not (BASE / 'generated/rtex008.png').exists()
    assert all(file_sha(pathlib.Path(a['path'])) == a['sha256'] for a in archive_proofs)
    report.update({'verdict': 'PASS explicit rtex008-to-ttex013 native-content alias; one shared master/height and10existingmaps, zero new generation',
      'nativeId': native['id'], 'nativeName': native['name'], 'targetId': target['id'], 'targetName': target['name'],
      'nativeDimensions': [64, 64], 'paletteSha256': sha(palette), 'allFourMipHashes': [sha(b) for b in canonical_mips],
      'occurrencesChecked': occurrences, 'occurrenceCount': len(occurrences), 'LowPNGBytesIdentical': True,
      'opaqueOrdinarySourceSemantics': True, 'masterPackage': witness(package_path), 'tierReceipt': witness(receipt_path),
      'existingQualifiedProof': witness(old_proof_path), 'sharedMasterReplayedAgainstOwnLowExact': True,
      'singleFullPrecisionHeightReplayedExact': True, 'sharedMapFiles': map_files, 'newGenerationCount': 0,
      'newMasterPackages': 0, 'newMapFiles': 0, 'duplicateMasterTierGeneratedPathsAbsent': True,
      'archiveInputsStable': archive_proofs, 'inputs': [witness(p) for p in sorted(set(paths))]})
except Exception as exc:
    report['verdict'] = 'HOLD'; report['error'] = repr(exc); raise
finally:
    report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    OUT.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'proof': str(OUT), 'verdict': report['verdict'], 'sha256': sha(OUT.read_bytes())}))
