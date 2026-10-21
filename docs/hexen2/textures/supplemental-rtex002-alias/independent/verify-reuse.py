"""Fresh native equivalence and exact accepted-map/preview custody for one alias.

No producer math replay, generation, map encoding, registration or build occurs.
"""
import datetime
import hashlib
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[5]
DOC = Path(__file__).resolve().parent
SOURCE = DOC.parent / 'source-proof.json'
OUT = DOC / 'technical-reuse-v1.json'
CATALOG = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json'
CID = '591fbcbbc7a7b501c8f7467ad10c983ddc17f4f580be036132847322c8a43b5a'
TID = '84bb278bdd9451b619a5de58d58a32fa07e9ce0cdc40b785070f3324e79181d3'
sha = lambda data: hashlib.sha256(data).hexdigest()
watched = {}
historical = []


def path(value):
    value = Path(value)
    return value if value.is_absolute() else ROOT / value


def read(value):
    value = path(value).resolve()
    data = value.read_bytes()
    assert value not in watched or watched[value] == data, 'Changed input: ' + str(value)
    watched[value] = data
    return data


def load(value):
    return json.loads(read(value))


def witness(value):
    value = path(value).resolve()
    data = read(value)
    return {'file': str(value.relative_to(ROOT)) if ROOT in value.parents else str(value),
            'sha256': sha(data), 'bytes': len(data)}


def seal(value, expected):
    if path(value).resolve() == CATALOG:
        historical.append({'file': str(value), 'historicalSHA256': expected,
                           'scope': 'Historical whole-catalog snapshot; current target row is independently checked, catalog count may change'})
    else:
        assert sha(read(value)) == expected, 'Seal mismatch: ' + str(value)


def image(value):
    return Image.open(io.BytesIO(read(value))).convert('RGB')


def archive_hash(value):
    digest = hashlib.sha256()
    with open(value, 'rb') as file:
        for chunk in iter(lambda: file.read(1024*1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def save(name, im):
    target = DOC / name
    assert not target.exists()
    im.save(target, 'PNG')
    return witness(target)


def main():
    assert not OUT.exists(), 'Preserve sealed evidence'
    report = {'schemaVersion': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'scope': 'rtex002 exact-content reuse of accepted ttex012; fresh native equality, current package/map and preview custody only, ART decision separate',
              'verdict': 'HOLD'}
    try:
        source = load(SOURCE)
        assert sha(read(SOURCE)) == '4634a651fe3cec9fbe56c47fb33a01f9a58f99950a8a00cb86c2729e328600e0'
        assert source['nativeID'] == CID and source['targetID'] == TID and source['verdict'].startswith('PASS')
        for file, digest in source['inputs'].items():
            seal(file, digest)
        catalog = json.loads(CATALOG.read_bytes())
        target, = [row for row in catalog['materials'] if row['id'] == TID]
        target_row_bytes = json.dumps(target, sort_keys=True).encode()
        assert target['name'] == 'ttex012' and target['Low']['unchanged']
        assert target['masterPackage'] == source['targetMaster'] and target['tierReceipt'] == source['targetTierReceipt']
        master_file, receipt_file = target['masterPackage'], target['tierReceipt']
        seal(master_file, target['masterPackageSha256'])
        seal(receipt_file, target['tierReceiptSha256'])
        master, receipt = load(master_file), load(receipt_file)
        assert master['generationCount'] == 1 and master['masterDimensions'] == [512, 512]
        for row in master['inputs'].values():
            seal(row['file'], row['sha256'])
        for row in master['tools'].values():
            seal(row['file'], row['sha256'])
        for role in ('color', 'height'):
            seal(str(path(master_file).parent/master[role]['file']), master[role]['sha256'])
        scalar = np.load(io.BytesIO(read(path(master_file).parent/master['height']['file'])), allow_pickle=False)
        assert scalar.dtype == np.float32 and scalar.shape == (512, 512) and np.isfinite(scalar).all()
        assert np.unique(scalar).size == master['height']['uniqueSamples']
        own_low, target_low = read(source['original']), read(target['Low']['original'])
        assert own_low == target_low and sha(own_low) == target['Low']['sha256']
        native_im = image(source['original'])
        assert native_im.size == (64, 64)

        # Fresh archive/physical native parsing, not a copied equality verdict.
        archives = {row['path']: row for row in source['archiveInputs']}
        archive_before, directories = {}, {}
        for file, info in archives.items():
            archive_before[file] = archive_hash(file)
            assert archive_before[file] == info['sha256'] and Path(file).stat().st_size == info['bytes']
            with open(file, 'rb') as stream:
                magic, offset, size = struct.unpack('<4sII', stream.read(12))
                assert magic == b'PACK' and size % 64 == 0
                stream.seek(offset)
                table = stream.read(size)
            assert len(table) == size
            directory = {}
            for index in range(0, size, 64):
                name = table[index:index+56].split(b'\0')[0].decode('ascii').lower()
                directory.setdefault(name, []).append(struct.unpack_from('<II', table, index+56))
            directories[file] = directory

        def member(file, name):
            entries = directories[file][name]
            # Selected palette and BSP members must be individually unambiguous.
            assert len(entries) == 1
            offset, size = entries[0]
            with open(file, 'rb') as stream:
                stream.seek(offset)
                data = stream.read(size)
            assert len(data) == size
            return data, offset

        palette, _ = member('/Users/bri/quaked/Hexen 2/data1/pak0.pak', 'gfx/palette.lmp')
        assert len(palette) == 768 and sha(palette) == target['nativeIdentity']['paletteSha256']
        common, native_records = None, []
        for kind, rows, native_name in [('candidate', source['candidateProvenance'], 'rtex002'),
                                        ('target', source['targetProvenance'], 'ttex012')]:
            keys = set()
            for row in rows:
                key = (row['source'], row['map'], row['slot'])
                assert key not in keys
                keys.add(key)
                bsp, offset = member(row['source'], row['map'])
                assert offset == row['memberOffset'] and sha(bsp) == row['bspSha256']
                assert struct.unpack_from('<i', bsp)[0] == 29
                lumps = [struct.unpack_from('<II', bsp, 4+i*8) for i in range(15)]
                begin, length = lumps[2]
                assert 0 <= row['slot'] < struct.unpack_from('<i', bsp, begin)[0]
                at = begin + struct.unpack_from('<i', bsp, begin+4+4*row['slot'])[0]
                assert bsp[at:at+16].split(b'\0')[0].decode('ascii') == native_name
                assert struct.unpack_from('<II', bsp, at+16) == (64, 64)
                mips = []
                for level in range(4):
                    relative = struct.unpack_from('<I', bsp, at+24+4*level)[0]
                    size = (64 >> level)**2
                    assert relative >= 40 and at+relative+size <= begin+length
                    mips.append(bsp[at+relative:at+relative+size])
                assert [sha(data) for data in mips] == row['fourMipSHA256']
                if common is None:
                    common = mips
                assert common == mips
                t, size = lumps[6]
                f, size_f = lumps[7]
                assert size % 40 == 0 and size_f % 20 == 0
                texinfos = {i: struct.unpack_from('<i', bsp, t+i*40+36)[0] for i in range(size//40)
                            if struct.unpack_from('<i', bsp, t+i*40+32)[0] == row['slot']}
                assert set(texinfos.values()) == {0} and row['ordinaryTexinfoFlags'] == [0]
                count = sum(struct.unpack_from('<H', bsp, f+i*20+10)[0] in texinfos for i in range(size_f//20))
                assert count == row['faces']
                native_records.append({'role': kind, 'map': row['map'], 'slot': row['slot'], 'source': row['source'],
                                       'faces': count, 'bspSha256': sha(bsp), 'fourMipSHA256': [sha(data) for data in mips], 'ordinaryFlags': [0]})
        assert len(native_records) == 11
        rgba = np.c_[np.frombuffer(palette, dtype='uint8').reshape(256, 3)[np.frombuffer(common[0], dtype='uint8')], np.full(4096, 255, dtype='uint8')].reshape(64, 64, 4)
        assert rgba.tobytes() == native_im.convert('RGBA').tobytes()
        assert sha(common[0]) == target['nativeIdentity']['indexedPixelSha256']
        assert sha(rgba.tobytes()) == target['nativeIdentity']['rgbaSha256']

        proofs = {}
        for file, digest in source['sealedTargetReviews'].items():
            seal(file, digest)
            proof = load(file)
            assert proof['verdict'].startswith('PASS')
            proofs[Path(file).name] = proof
        actual = proofs['batch-008-second-pair-public-actual.json']
        art = proofs['batch-008-second-pair-art-review.json']
        preview = proofs['batch-008-second-pair-public-preview.json']
        actual_row, = [row for row in actual['materials'] if row['name'] == 'ttex012']
        art_row, = [row for row in art['materials'] if row['name'] == 'ttex012']
        assert actual_row['masterPackage']['sha256'] == art_row['masterPackageSha256'] == target['masterPackageSha256']
        assert actual_row['tierReceipt']['sha256'] == art_row['tierReceiptSha256'] == target['tierReceiptSha256']
        assert art_row['verdict'].startswith('PASS') and art_row['nativeID'] == TID
        for proof in (actual, preview):
            for row in proof['inputs']:
                seal(row['file'], row['sha256'])
            seal(proof['verifier']['file'], proof['verifier']['sha256'])
        panel_checks = []
        for row in preview['reviewCLIReplay']['files']:
            if Path(row['file']).name.startswith('ttex012-'):
                jpeg = image(row['file'])
                for panel in row['contentPanels']:
                    observed = sha(jpeg.crop(tuple(panel['rectangle'])).tobytes())
                    assert observed == panel['decodedRGBSHA256']
                    panel_checks.append({'file': row['file'], 'panel': panel['panel'], 'decodedRGBSHA256': observed})
        assert panel_checks and preview['all8JPEGBytesExact']
        evidence = []
        for name, factor in [('Mid', 4), ('High', 8)]:
            tier, stored = target['tiers'][name], receipt['tiers'][name]
            actual_tier, = [row for row in actual_row['tiers'] if row['tier'] == name]
            decoded = {}
            for role, row in tier['outputs'].items():
                seal(row['file'], row['sha256'])
                assert row['sha256'] == art_row['tiers'][name]['maps'][role]['sha256'] == stored['outputs'][role]['sha256']
                assert any(item['role'] == role and item['sha256'] == row['sha256'] for item in actual_tier['maps'])
                assert (stored['outputs'][role]['quality'], stored['outputs'][role]['method'], stored['outputs'][role]['lossless']) == (92, 6, False)
                decoded[role] = image(row['file'])
                assert decoded[role].size == (64*factor, 64*factor)
            rgb = np.asarray(decoded['diffuse'])
            size = len(rgb)
            span = size//4
            label = name.lower()
            evidence.append(save(label+'-repeat.png', Image.fromarray(np.tile(rgb, (2, 2, 1)))))
            evidence.append(save(label+'-xjoin.png', Image.fromarray(np.concatenate([rgb[:, -span:], rgb[:, :span]], axis=1))))
            evidence.append(save(label+'-yjoin.png', Image.fromarray(np.concatenate([rgb[-span:], rgb[:span]], axis=0))))
            evidence.append(save(label+'-corner.png', Image.fromarray(np.roll(np.roll(rgb, span, axis=0), span, axis=1)[:span*2, :span*2])))
            vector = np.stack([np.asarray(decoded[role], dtype=float)[:, :, 0] for role in ('normalX', 'normalY', 'normalZ')], axis=2)/127.5-1
            vector /= np.maximum(np.linalg.norm(vector, axis=2, keepdims=True), 1e-12)
            panel = Image.new('RGB', (size*2, size*2))
            panel.paste(decoded['height'], (0, 0))
            normal_rgb = np.rint(np.clip((vector*.5+.5)*255, 0, 255)).astype('uint8')
            panel.paste(Image.fromarray(normal_rgb), (size, 0))
            for index, direction in enumerate(((.6, .3, .75), (-.6, -.3, .75))):
                light = np.asarray(direction); light /= np.linalg.norm(light)
                shade = .35+.65*np.maximum(0, np.einsum('ijk,k->ij', vector, light))
                lit = np.rint(np.clip(rgb.astype(float)*shade[:, :, None], 0, 255)).astype('uint8')
                panel.paste(Image.fromarray(lit), (index*size, size))
            evidence.append(save(label+'-relief.png', panel))
            for divisor in (2, 4):
                dim = 64//divisor
                distance = Image.new('RGB', (dim*2, dim))
                distance.paste(native_im.resize((dim, dim), Image.Resampling.BOX), (0, 0))
                distance.paste(decoded['diffuse'].resize((dim, dim), Image.Resampling.BOX), (dim, 0))
                evidence.append(save(label+'-distance-'+str(divisor)+'.png', distance))
        # The shared catalog may grow; only this accepted target row is invariant.
        current, = [row for row in json.loads(CATALOG.read_bytes())['materials'] if row['id'] == TID]
        assert json.dumps(current, sort_keys=True).encode() == target_row_bytes
        assert all(file.read_bytes() == data for file, data in watched.items())
        assert all(archive_hash(file) == digest for file, digest in archive_before.items())
        report.update(verdict='PASS fresh actual-source identity and exact accepted target/map/preview custody; ART reuse verdict separate',
                      candidate={'name': 'rtex002', 'nativeIdentity': CID, 'Low': witness(source['original'])},
                      acceptedTarget={'name': 'ttex012', 'nativeIdentity': TID, 'masterPackage': witness(master_file), 'tierReceipt': witness(receipt_file),
                                      'catalogRowSHA256': sha(target_row_bytes), 'currentCatalogCountObservedOnly': len(catalog['materials']), 'row': target},
                      actualSource={'verdict': 'PASS fresh all4mip/palette/index/RGBA/ordinaryflag checks across11 physical slots; own Low bytes equal target',
                                    'physicalOccurrences': native_records, 'fourMipSHA256': [sha(data) for data in common], 'archiveInputsStable': archive_before},
                      previewReuse={'verdict': 'PASS exact sealed target JPEG bytes, decoded content/label panel hashes, target maps/package/source bindings',
                                    'panelsChecked': len(panel_checks), 'panels': panel_checks, 'limits': 'Historical ttex012 labels remain target labels; no historical preview relabeling or new JPEG replay/encoding claimed'},
                      historicalCatalogBindings=historical, sealedTargetReviews=source['sealedTargetReviews'],
                      diagnosticEvidence=evidence, newGenerations=0, newMasters=0, newMapFiles=0,
                      newProducerMathOrCodecReplay=False, inputsStable=True,
                      verifier=witness(__file__))
        report['inputs'] = [witness(file) for file in sorted(watched)]
    except Exception as error:
        report.update(verdict='HOLD', error=repr(error))
        raise
    finally:
        report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with OUT.open('x') as file:
            file.write(json.dumps(report, indent=2)+'\n')
        print(json.dumps({'file': str(OUT.relative_to(ROOT)), 'sha256': sha(OUT.read_bytes()), 'verdict': report['verdict']}))


if __name__ == '__main__':
    main()
