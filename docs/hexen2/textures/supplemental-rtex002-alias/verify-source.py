"""Bounded native alias proof; no generation, acceptance or registration."""
import datetime
import hashlib
import json
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
DOCS = Path(__file__).resolve().parent
INVENTORY = DOCS / 'native-audit/inventory.json'
CATALOG = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json'
OUTPUT = DOCS / 'source-proof.json'
ALIAS = '591fbcbbc7a7b501c8f7467ad10c983ddc17f4f580be036132847322c8a43b5a'
TARGET = '84bb278bdd9451b619a5de58d58a32fa07e9ce0cdc40b785070f3324e79181d3'
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text())


def archive_hash(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    assert not OUTPUT.exists(), 'Preserve prior evidence'
    inventory, catalog = load(INVENTORY), load(CATALOG)
    natives = {v['id']: v for v in inventory['variants']}
    a, b = natives[ALIAS], natives[TARGET]
    target = next(v for v in catalog['materials'] if v['id'] == TARGET)
    assert not any(v['id'] == ALIAS for v in catalog['materials'])
    for key in ('width', 'height', 'category', 'paletteSha256', 'indexedPixelSha256', 'rgbaSha256'):
        assert a[key] == b[key], key
    assert a['category'] == 'ordinary' and (a['width'], a['height']) == (64, 64)
    original = Path(a['selectedOriginal']['path'])
    low = ROOT / target['Low']['original']
    assert sha(original.read_bytes()) == a['selectedOriginal']['sha256']
    assert sha(low.read_bytes()) == target['Low']['sha256']
    assert original.read_bytes() == low.read_bytes()
    files = [Path(__file__), INVENTORY, CATALOG, original, low]
    for key in ('masterPackage', 'tierReceipt'):
        p = ROOT / target[key]
        assert sha(p.read_bytes()) == target[key + 'Sha256']
        files.append(p)
    for file, digest in target['reviews'].items():
        p = ROOT / file
        assert sha(p.read_bytes()) == digest
        files.append(p)
    for tier in target['tiers'].values():
        for output in tier['outputs'].values():
            p = ROOT / output['file']
            assert sha(p.read_bytes()) == output['sha256']
            files.append(p)
    before = {p: sha(p.read_bytes()) for p in files}
    directories = {}
    for rec in inventory['archives']:
        path = Path(rec['path'])
        assert archive_hash(path) == rec['sha256']
        with path.open('rb') as f:
            magic, offset, size = struct.unpack('<4sII', f.read(12))
            assert magic == b'PACK' and size % 64 == 0
            f.seek(offset)
            table = f.read(size)
        directories[str(path)] = {
            table[i:i + 56].split(b'\0')[0].decode('ascii').lower(): struct.unpack_from('<II', table, i + 56)
            for i in range(0, size, 64)
        }

    def member(source, name):
        offset, size = directories[source][name]
        with open(source, 'rb') as f:
            f.seek(offset)
            data = f.read(size)
        assert len(data) == size
        return data, offset

    palette, _ = member('/Users/bri/quaked/Hexen 2/data1/pak0.pak', 'gfx/palette.lmp')
    assert len(palette) == 768 and sha(palette) == a['paletteSha256']

    def occurrences(v):
        seen, rows, baseline = set(), [], None
        for rec in v['provenance']:
            key = (rec['source'], rec['map'], rec['slot'])
            if key in seen:
                continue
            seen.add(key)
            bsp, member_offset = member(rec['source'], rec['map'])
            assert member_offset == rec['memberOffset'] and sha(bsp) == rec['bspSha256']
            assert struct.unpack_from('<i', bsp)[0] == 29
            tx, length = struct.unpack_from('<II', bsp, 20)
            offset = struct.unpack_from('<i', bsp, tx + 4 + rec['slot'] * 4)[0]
            assert offset >= 0
            at = tx + offset
            assert bsp[at:at + 16].split(b'\0')[0].decode('ascii') == v['name']
            w, h = struct.unpack_from('<II', bsp, at + 16)
            assert (w, h) == (v['width'], v['height'])
            mips = []
            for m in range(4):
                start = struct.unpack_from('<I', bsp, at + 24 + m * 4)[0]
                n = (w >> m) * (h >> m)
                assert start >= 40 and at + start + n <= tx + length
                mips.append(bsp[at + start:at + start + n])
            if baseline is None:
                baseline = mips
            assert mips == baseline, 'Native identity has inconsistent lower mips'
            assert sha(mips[0]) == v['indexedPixelSha256']
            rgba = b''.join(palette[p * 3:p * 3 + 3] + b'\xff' for p in mips[0])
            assert sha(rgba) == v['rgbaSha256']
            ti, n = struct.unpack_from('<II', bsp, 4 + 6 * 8)
            assert n % 40 == 0
            flags = {struct.unpack_from('<i', bsp, p + 36)[0] for p in range(ti, ti + n, 40)
                     if struct.unpack_from('<i', bsp, p + 32)[0] == rec['slot']}
            assert not flags or flags == {0}, 'Nonordinary texinfo semantics'
            rows.append(dict(rec, ordinaryTexinfoFlags=sorted(flags), fourMipSHA256=[sha(m) for m in mips]))
        assert baseline
        return baseline, rows

    ma, ra = occurrences(a)
    mb, rb = occurrences(b)
    equal = ma == mb
    assert Image.open(original).convert('RGBA').tobytes() == b''.join(
        palette[p * 3:p * 3 + 3] + b'\xff' for p in ma[0])
    assert all(sha(p.read_bytes()) == digest for p, digest in before.items())
    assert all(archive_hash(Path(rec['path'])) == rec['sha256'] for rec in inventory['archives'])
    report = {
        'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'verdict': 'PASS exact native alias source candidate' if equal else 'NO_ALIAS lower mip mismatch',
        'nativeID': ALIAS, 'name': a['name'], 'targetID': TARGET, 'targetName': b['name'],
        'fourMipBytesEqual': equal, 'candidateProvenance': ra, 'targetProvenance': rb,
        'LowPNGBytesIdentical': True, 'original': str(original.relative_to(ROOT)),
        'targetMaster': target['masterPackage'], 'targetTierReceipt': target['tierReceipt'],
        'sealedTargetReviews': target['reviews'],
        'inputs': {str(p.relative_to(ROOT)): digest for p, digest in before.items()},
        'archiveInputs': inventory['archives'], 'inputsAndArchivesStable': True,
        'newGenerations': 0, 'newMasterPackages': 0, 'newMapFiles': 0, 'bindingsCreated': 0,
        'limits': ['Source and existing sealed package custody only; independent alias reuse review required before registration.',
                   'No new art, codec, runtime, owner or release acceptance. Native Low identity and provenance remain distinct.']
    }
    with OUTPUT.open('x') as f:
        f.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'verdict': report['verdict'], 'receipt': str(OUTPUT.relative_to(ROOT)),
                      'sha256': sha(OUTPUT.read_bytes()), 'uniqueOccurrences': len(ra) + len(rb)}))


if __name__ == '__main__':
    main()
