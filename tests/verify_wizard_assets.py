#!/usr/bin/env python3
"""Verify the exact supplied artwork, recipe, stored heights and BSP name bindings.
Run: python3 tests/verify_wizard_assets.py (Pillow and NumPy required); --write-evidence rewrites the dated JSON record.
Checks the increment as it was made, at its own commit (AT): the level sheet of 2 October (9a71a465, verified by
tests/level_texture_assets_test.py) has since replaced these textures (card [44m]). Never modifies textures or the manifest.
"""
import hashlib
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
sys.dont_write_bytecode = True

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / 'tools'), str(ROOT / 'tools/texture_sheets')]
from align_frames import shifted
import craft_normals
from texture_sheets.make_sheets import read_pak

recipe = json.loads((ROOT / 'tools/texture_sheets/sources/wizard-2026-10-01.json').read_text())
AT = '67a49812'  # the commit that made this increment
at = lambda path: subprocess.check_output(['git', 'show', AT + ':' + str(path.relative_to(ROOT))], cwd=ROOT)
index = json.loads(at(ROOT / 'newer/textures/index.json'))
source_path = ROOT / 'tools/texture_sheets/sources' / recipe['source']
assert hashlib.sha256(source_path.read_bytes()).hexdigest() == recipe['source_sha256']
assert index['version'] > recipe['base_version']
source = Image.open(source_path).convert('RGB')
usage = {t['name']: [] for t in recipe['textures']}
for filename, bsp in read_pak(ROOT / 'games/shareware/pak0.pak').items():
    if not filename.startswith('maps/') or not filename.endswith('.bsp'):
        continue
    start, length = struct.unpack('<ii', bsp[20:28])
    lump = bsp[start:start + length]
    for i in range(struct.unpack('<i', lump[:4])[0]):
        offset = struct.unpack('<i', lump[4 + i * 4:8 + i * 4])[0]
        if offset < 0:
            continue
        name = lump[offset:offset + 16].split(b'\0')[0].decode()
        if name in usage:
            assert struct.unpack('<ii', lump[offset + 16:offset + 24]) == (64, 64)
            usage[name].append(filename)

checks, details = 3, []
for tile in recipe['textures']:
    name = tile['name']
    expected = source.crop(tile['box']).resize((256, 256), Image.Resampling.LANCZOS)
    if 'uv_shift_texels' in tile:
        dx, dy = (v * 4 for v in tile['uv_shift_texels'])
        pad = int(max(abs(dx), abs(dy))) + 8
        pixels = np.pad(np.asarray(expected, dtype=np.float32), ((pad, pad), (pad, pad), (0, 0)), 'wrap')
        expected = Image.fromarray(shifted(pixels, dx, dy)[pad:-pad, pad:-pad].astype(np.uint8))
    diffuse_path = ROOT / 'newer/textures' / index['textures'][name]
    height_path = ROOT / 'newer/textures' / index['normals'][name]['file']
    diffuse_bytes, height_bytes = at(diffuse_path), at(height_path)
    diffuse = Image.open(io.BytesIO(diffuse_bytes)).convert('RGB')
    assert diffuse.size == Image.open(io.BytesIO(height_bytes)).size == (256, 256)
    assert expected.tobytes() == diffuse.tobytes()
    height, _ = craft_normals.craft(np.asarray(diffuse, dtype=np.float32) / 255, craft_normals.profile_for(name))
    encoded = io.BytesIO()
    Image.fromarray(np.round(height * 255).astype(np.uint8)).save(encoded, 'WEBP', quality=92, method=6)
    assert encoded.getvalue() == height_bytes
    assert usage[name]
    checks += 4
    details.append(dict(name=name, box=tile['box'], uv_shift_texels=tile.get('uv_shift_texels', [0, 0]),
                        maps=usage[name], diffuse_sha256=hashlib.sha256(diffuse_bytes).hexdigest(),
                        height_sha256=hashlib.sha256(height_bytes).hexdigest()))
report = dict(checks_passed=checks, source_size=source.size, source_sha256=recipe['source_sha256'],
              version=index['version'], textures=details)
if '--write-evidence' in sys.argv:
    (ROOT / 'docs/evidence/wizard-textures-2026-10-01.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'PASS: {checks} source, recipe, dimensions, height, manifest and map checks')
print('Map usage:', ', '.join(sorted(set(m for d in details for m in d['maps']))))
