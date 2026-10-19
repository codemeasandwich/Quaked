"""Read-only native texture-source coverage audit, not a runtime asset parser.

Checks the exact four retained PAK identities, resolves native archive override
order per profile, and reads model skin sections. Sprite/WAD/LMP counts are
source-file counts, explicitly not flattened texture/frame coverage.
"""
import collections, datetime, hashlib, json, pathlib, struct, sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
INV = ROOT / 'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json'
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs/hexen2/textures/batch-002-public-scope-audit.json'
assert not OUT.exists(), 'Retain prior evidence'
sha = lambda b: hashlib.sha256(b).hexdigest()
inv = json.loads(INV.read_text())
archives, entries = [], {}
for archive in inv['archives']:
    p = pathlib.Path(archive['path'])
    assert p.is_file() and not p.is_symlink()
    digest = hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(block)
        assert digest.hexdigest() == archive['sha256']
        f.seek(0)
        magic, offset, length = struct.unpack('<4sII', f.read(12))
        assert magic == b'PACK' and length % 64 == 0
        f.seek(offset)
        table = f.read(length)
    assert len(table) == length
    directory = {}
    for at in range(0, length, 64):
        name = table[at:at + 56].split(b'\0')[0].decode('ascii').lower()
        off, size = struct.unpack_from('<II', table, at + 56)
        assert off >= 12 and size <= 128 * 1024**2 and off + size <= p.stat().st_size
        row = {'source': str(p), 'member': name, 'offset': off, 'bytes': size}
        if name in directory:
            old = directory[name]
            with p.open('rb') as f:
                f.seek(old['offset']); a = f.read(old['bytes'])
                f.seek(off); b = f.read(size)
            assert a == b, 'Conflicting duplicate native member'
        else:
            directory[name] = row
    archives.append(archive)
    entries[str(p)] = directory

def payload(row):
    with open(row['source'], 'rb') as f:
        f.seek(row['offset']); b = f.read(row['bytes'])
    assert len(b) == row['bytes']
    return b

def skin_section(b):
    magic, version = struct.unpack_from('<4sI', b)
    assert (magic, version) in ((b'IDPO', 6), (b'RAPO', 50))
    count, w, h = struct.unpack_from('<III', b, 48)
    assert 0 < count <= 4096 and 0 < w <= 4096 and 0 < h <= 4096
    at = 84 if magic == b'IDPO' else 88
    skins = []
    for slot in range(count):
        kind = struct.unpack_from('<I', b, at)[0]; at += 4
        assert kind in (0, 1)
        frames = 1
        if kind:
            frames = struct.unpack_from('<I', b, at)[0]; at += 4
            assert 0 < frames <= 4096
            at += 4 * frames
        assert at + frames * w * h <= len(b)
        samples = [sha(b[at + frame * w * h:at + (frame + 1) * w * h]) for frame in range(frames)]
        at += frames * w * h
        skins.append({'slot': slot, 'kind': 'group' if kind else 'single', 'frames': frames, 'indexedSha256': samples})
    return {'format': magic.decode(), 'version': version, 'dimensions': [w, h], 'skinSlots': count,
            'skinImages': sum(s['frames'] for s in skins), 'skinDataEnd': at, 'skins': skins}

profiles = []
for profile in inv['profiles']:
    effective = {}
    for root in profile['roots']:
        for archive in archives:
            if pathlib.Path(archive['path']).parent == pathlib.Path(root):
                effective.update(entries[archive['path']])
    model_rows, sprite_rows, wad_rows, gfx_rows = [], [], [], []
    for name, row in sorted(effective.items()):
        if name.endswith('.mdl'):
            b = payload(row)
            model_rows.append({**row, 'sha256': sha(b), **skin_section(b)})
        elif name.endswith('.spr'):
            b = payload(row)
            magic, version = struct.unpack_from('<4sI', b)
            assert magic == b'IDSP' and version == 1
            width, height, frame_groups = struct.unpack_from('<III', b, 16)
            sprite_rows.append({**row, 'sha256': sha(b), 'format': 'IDSP', 'version': version,
                                'maxDimensions': [width, height], 'topLevelFrameSlots': frame_groups})
        elif name.endswith('.wad'):
            b = payload(row)
            magic, count, table = struct.unpack_from('<4sII', b)
            assert magic in (b'WAD2', b'WAD3') and count <= 65536 and table + count * 32 <= len(b)
            lumps = []
            for at in range(table, table + count * 32, 32):
                pos, disk_size, size, kind, compression = struct.unpack_from('<IIIBB', b, at)
                assert pos + disk_size <= len(b)
                lumps.append({'name': b[at + 16:at + 32].split(b'\0')[0].decode('ascii'),
                              'type': kind, 'compression': compression, 'bytes': size})
            wad_rows.append({**row, 'sha256': sha(b), 'format': magic.decode(), 'lumps': lumps})
        elif name.startswith('gfx/') and name.endswith('.lmp'):
            gfx_rows.append(row)
    # Loose native sources are explicitly enumerated, never assumed absent.
    loose = []
    for root in profile['roots']:
        for subtree in ('models', 'gfx', 'maps'):
            p = pathlib.Path(root) / subtree
            if p.exists():
                for file in p.rglob('*'):
                    assert not file.is_symlink(), 'Loose symlink requires separate audit'
                    if file.is_file() and file.suffix.lower() in ('.mdl', '.spr', '.wad', '.lmp', '.bsp'):
                        loose.append(str(file))
    assert not loose, 'Loose native texture overrides need full mount treatment'
    profiles.append({'profile': profile['id'], 'roots': profile['roots'],
      'summary': {'models': len(model_rows), 'modelFormats': dict(collections.Counter(x['format'] for x in model_rows)),
                  'skinSlots': sum(x['skinSlots'] for x in model_rows), 'skinImagesIncludingGroups': sum(x['skinImages'] for x in model_rows),
                  'sprites': len(sprite_rows), 'spriteTopLevelFrameSlots': sum(x['topLevelFrameSlots'] for x in sprite_rows),
                  'wadFiles': len(wad_rows), 'wadLumps': sum(len(x['lumps']) for x in wad_rows), 'gfxLmpFiles': len(gfx_rows)},
      'models': model_rows, 'sprites': sprite_rows, 'wads': wad_rows, 'gfxLmp': gfx_rows, 'looseRelevantOverrides': loose})

report = {'schemaVersion': 1, 'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'verdict': 'PASS bounded source-scope audit; world inventory is not all-texture coverage',
 'worldInventory': {'file': str(INV.relative_to(ROOT)), 'sha256': sha(INV.read_bytes()), 'summary': inv['summary']},
 'archives': archives, 'profiles': profiles,
 'requiredQueues': ['Ordinary BSP miptex', 'Animated BSP sequences as complete families', 'Sky and liquid special materials',
                    'IDPO6 and RAPO50 model skin slots and grouped skins with native UV/seam/tint identity',
                    'IDSP1 sprite single/group frames with transparency and native origins',
                    'WAD image/font lumps and gfx LMP pictures/fonts/masks classified before enhancement'],
 'limits': ['No source images extracted or changed; no generation, tier authoring, codec, art, or runtime acceptance.',
            'Model skin sections are bounded and hashed; geometry, skin UV registration, palette/tint and transparency semantics are not parsed or qualified.',
            'Sprite and WAD counts retain source slots/lumps; they are not a flattened unique texture inventory or rendering verification.',
            'gfx LMP includes palette/colormap/non-image data; classification is required before assigning texture counts.',
            'Duplicate expansion installations are separate profiles with identical archive bytes; do not sum both as new unique work.',
            'Utility markers must retain intended semantics and may require unchanged Low only rather than decorative enhancement.']}
OUT.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'receipt': str(OUT), 'sha256': sha(OUT.read_bytes()), 'profiles': [{k: p[k] for k in ('profile', 'summary')} for p in profiles]}, indent=2))
