"""Independent atlas/output checks; never runs the production authoring script."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import unittest

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / 'tools'))
from resource_paths import resource_path

SOURCE = ROOT / 'tools/texture_sheets/sources/level-2026-10-02'
RECIPE = json.loads((SOURCE / 'manifest.json').read_text())
INDEX = json.loads((resource_path(ROOT, 'newer/textures/index.json')).read_text())
# Later seam repairs (tools/texture_sheets/fix_seams.py) mend recorded edge rows only.
SEAMS = json.loads((ROOT / 'tools/texture_sheets/seam_fixes.json').read_text())['fixed']


def seam_mask(name, shape, key='touched'):
    """True on the edge rows a recorded seam repair touched in this texture."""
    mask = np.zeros(shape[:2], dtype=bool)
    for fix in SEAMS.get(name, []):
        n = fix[key] or 0
        if fix['side'] == 't': mask[:n] = True
        elif fix['side'] == 'b': mask[mask.shape[0] - n:] = True
        elif fix['side'] == 'l': mask[:, :n] = True
        else: mask[:, mask.shape[1] - n:] = True
    return mask
NAMES = set('city5_1 city5_3 city5_4 city5_6 city5_7 city5_8 city6_4 citya1_1 column1_2 column1_5 stone1_3 wall16_7 wall9_8 wbrick1_5 wiz1_1 wiz1_4 wizmet1_1 wizmet1_2 wizmet1_3 wizmet1_7 wizmet1_8 wizwood1_3 wizwood1_4 wizwood1_5 wizwood1_7 wizwood1_8'.split())


# Only these two owner materials have an explicit format successor. Their
# lossless masters still carry the exact atlas/seam history checked below.
_OWNER_BASE = ROOT / 'tools/texture_sheets/sources/official-world-2026-10-17'
_OWNER_BYTES = (_OWNER_BASE / 'owner-q92-first-tranche-v2.json').read_bytes()
_OWNER_Q92 = json.loads(_OWNER_BYTES)
_OWNER_BEFORE_BYTES = (_OWNER_BASE / 'owner-q92-first-tranche-index-before.json').read_bytes()
_OWNER_BEFORE = json.loads(_OWNER_BEFORE_BYTES)
assert hashlib.sha256(_OWNER_BEFORE_BYTES).hexdigest() == _OWNER_Q92['indexBeforeSha256']
assert [_OWNER_Q92[k] for k in ('factor', 'quality', 'lossless', 'method')] == [4, 92, False, 6]
_OWNER_NAMES = {'city5_3', 'wizmet1_3'}

def owner_legacy_file(name, role):
    current = INDEX['textures'][name] if role == 'diffuse' else INDEX['normals'][name]['file']
    if name not in _OWNER_NAMES:
        return current
    entry = next(e for e in _OWNER_Q92['bindings'] if e['name'] == name)
    assert entry['previous'] == {'file': _OWNER_BEFORE['textures'][name], 'normal': _OWNER_BEFORE['normals'][name]}
    assert INDEX['textures'][name] == entry['current']['file']
    assert INDEX['normals'][name] == entry['current']['normal']
    assert INDEX['sources'][name] == entry['sourceAllowlist'] == _OWNER_BEFORE['sources'][name]
    assert {**entry['current']['normal'], 'file': entry['previous']['normal']['file']} == entry['previous']['normal']
    previous = entry['previous']['file'] if role == 'diffuse' else entry['previous']['normal']['file']
    record = next(m for m in _OWNER_Q92['maps'] if m['file'] == 'newer/textures/' + current)
    assert record['role'] == role and record['predecessor'] == 'newer/textures/' + previous
    assert hashlib.sha256((resource_path(ROOT, record['predecessor'])).read_bytes()).hexdigest() == record['masterSha256']
    assert hashlib.sha256((resource_path(ROOT, record['file'])).read_bytes()).hexdigest() == record['sha256']
    return previous

def owner_current_file(name, baseline):
    previous = owner_legacy_file(name, 'diffuse')
    assert previous == baseline, name + ' retained historical filename'
    return INDEX['textures'][name]

# Six separately reviewed direct-source tech successors only affect the old
# nonselected-normal conservation loop. None belongs to the26 atlas materials.
_TECH_BYTES = (_OWNER_BASE / 'legacy-tech-twelve-q92-v1.json').read_bytes()
_TECH_Q92 = json.loads(_TECH_BYTES)
_TECH_PLAN_BYTES = (_OWNER_BASE / 'verification/legacy-tech-twelve-q92-plan.json').read_bytes()
_TECH_PLAN = json.loads(_TECH_PLAN_BYTES)
_TECH_BEFORE_BYTES = (_OWNER_BASE / 'legacy-tech-twelve-index-before.json').read_bytes()
_TECH_BEFORE = json.loads(_TECH_BEFORE_BYTES)
assert hashlib.sha256(_TECH_PLAN_BYTES).hexdigest() == _TECH_Q92['planSha256']
assert hashlib.sha256(_TECH_BEFORE_BYTES).hexdigest() == _TECH_Q92['indexBeforeSha256']
assert [_TECH_Q92[k] for k in ('factor', 'quality', 'lossless', 'method')] == [4, 92, False, 6]
_TECH_KEYS = {'tech04_3': '16x128:a479c5cd7f65b1bf', 'tech07_2': '128x128:5d03decdcf531707', 'tech08_1': '128x128:ba7e0769a9a0ce1b', 'tech09_3': '128x128:8ff008acef40a86e', 'tech10_3': '32x128:31e072256a779b27', 'tech11_2': '128x128:f56a5604372ecc96'}
assert {e['name'] for e in _TECH_Q92['bindings']} == set(_TECH_KEYS) and len(_TECH_Q92['maps']) == 12

def tech_current_normal(name, previous):
    if name not in _TECH_KEYS:
        return previous
    entry = next(e for e in _TECH_Q92['bindings'] if e['name'] == name)
    planned = next(e for e in _TECH_PLAN['bindings'] if e['name'] == name)
    assert entry['nativeKey'] == _TECH_KEYS[name] and entry['previous'] == planned['previous']
    assert entry['previous'] == {'file': _TECH_BEFORE['textures'][name], 'normal': _TECH_BEFORE['normals'][name]}
    assert entry['previous']['normal'] == previous
    assert entry['current'] == planned['proposedCurrent']
    assert {**entry['current']['normal'], 'file': previous['file']} == previous
    assert INDEX['textures'][name] == entry['current']['file']
    assert INDEX['sources'][name] == entry['sourceAllowlist'] == _TECH_BEFORE['sources'][name] == [entry['nativeKey']]
    assert not INDEX.get('ordinaryVariants', {}).get(name) and not INDEX.get('glass', {}).get(name)
    for role, current, predecessor in [('diffuse', entry['current']['file'], entry['previous']['file']), ('height', entry['current']['normal']['file'], previous['file'])]:
        record = next(m for m in _TECH_Q92['maps'] if m['name'] == name and m['role'] == role)
        assert record['file'] == 'newer/textures/' + current and record['predecessor'] == 'newer/textures/' + predecessor
        for field, digest in [('predecessor', 'predecessorSha256'), ('retainedPre4xFile', 'retainedPre4xSha256'), ('master', 'masterSha256'), ('file', 'sha256')]:
            assert hashlib.sha256((ROOT / record[field]).read_bytes()).hexdigest() == record[digest]
    return entry['current']['normal']


class LevelTextureAssets(unittest.TestCase):
    def test_exact_source_crop_phase_and_lossless_diffuse(self):
        self.assertEqual(set(RECIPE['tiles']), NAMES)
        self.assertEqual(RECIPE['outputSize'], [256, 256])
        self.assertEqual(RECIPE['nativeSize'], [64, 64])
        sources = {}
        for name, info in RECIPE['sources'].items():
            data = (SOURCE / name).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), info['sha256'])
            sources[name] = Image.open(SOURCE / name).convert('RGB')
            self.assertEqual(list(sources[name].size), info['size'])
        for name, tile in RECIPE['tiles'].items():
            with self.subTest(texture=name):
                self.assertFalse(tile['rotation'] or tile['flipX'] or tile['flipY'])
                source = sources[tile['source']]
                x0, y0, x1, y1 = tile['crop']
                self.assertTrue(0 <= x0 < x1 <= source.width and 0 <= y0 < y1 <= source.height)
                expected = np.array(source.crop(tile['crop']).resize((256, 256), Image.Resampling.LANCZOS))
                dx, dy = tile.get('phaseNative', [0, 0])
                expected = np.roll(expected, (dy * 4, dx * 4), (0, 1))
                actual = np.array(Image.open(resource_path(ROOT, 'newer/textures') / owner_legacy_file(name, 'diffuse')).convert('RGB'))
                keep = ~seam_mask(name, actual.shape)
                np.testing.assert_array_equal(actual[keep], expected[keep])
        self.assertEqual(RECIPE['tiles']['column1_2']['crop'][3], 620, 'marble separator excluded')
        self.assertEqual(RECIPE['tiles']['city5_1']['crop'][3], 306, 'adjacent pink row excluded')

    def test_registered_height_sizes_and_material_semantics(self):
        for name in NAMES:
            with self.subTest(texture=name):
                normal = INDEX['normals'][name]
                image = Image.open(resource_path(ROOT, 'newer/textures') / normal['file'])
                self.assertEqual(image.size, (256, 256))
                pixels = np.array(image.convert('RGB'))
                gray_authority = pixels
                if name in _OWNER_NAMES:
                    # Only these explicit Q92 successors use decoded R as the
                    # scalar. The retained lossless master must still be exactly
                    # gray; unused G may differ by one after lossy WebP decode.
                    gray_authority = np.array(Image.open(resource_path(ROOT, 'newer/textures') / owner_legacy_file(name, 'height')).convert('RGB'))
                np.testing.assert_array_equal(gray_authority[:, :, 0], gray_authority[:, :, 1])
                np.testing.assert_array_equal(gray_authority[:, :, 0], gray_authority[:, :, 2])
                self.assertTrue(np.isfinite(normal['strength']) and normal['strength'] >= 0)
                self.assertTrue(np.isfinite(normal['cap']) and normal['cap'] > 0)
                if name != 'column1_2':
                    self.assertGreater(float(pixels[:, :, 0].std()), 2, 'actual relief remains')
        marble = INDEX['normals']['column1_2']
        self.assertEqual(marble['strength'], 0)
        self.assertTrue(np.all(np.array(Image.open(resource_path(ROOT, 'newer/textures') / marble['file']).convert('L')) == 255), 'no pigment relief or constant POM displacement')
        checker = np.array(Image.open(resource_path(ROOT, 'newer/textures') / INDEX['normals']['wall9_8']['file']).convert('L'), dtype=float) / 255
        means = [checker[y:y + 80, x:x + 80].mean() for y in (24, 152) for x in (24, 152)]
        self.assertLess(max(means) - min(means), .015, 'different pigments do not become quarter-height steps')
        self.assertEqual(INDEX['normals']['city5_6']['strength'], 2.0)
        self.assertEqual(INDEX['normals']['wizwood1_7']['strength'], 2.6)
        self.assertEqual(INDEX['normals']['wall16_7']['strength'], 1.4)
        veneer = np.array(Image.open(resource_path(ROOT, 'newer/textures') / INDEX['normals']['city5_1']['file']).convert('L'), dtype=float) / 255
        layering = RECIPE['tiles']['city5_1']['layering']
        # Spatial landmarks independently distinguish all four corners, the
        # large oval and three small holes from the upper patterned facing.
        self.assertEqual(len(layering['brickLandmarks']), 8)
        def patch(point):
            x, y = point
            return veneer[np.ix_((np.arange(y - 2, y + 3) % 256), (np.arange(x - 2, x + 3) % 256))]
        upper = np.concatenate([patch(p).ravel() for p in layering['facingLandmarks']])
        lower = np.concatenate([patch(p).ravel() for p in layering['brickLandmarks']])
        self.assertGreater(float(upper.min()), .70, 'patterned facing stays above all revealed brick')
        self.assertLess(float(lower.max()), .45, 'every exposed brick patch stays low, regardless of pigment')
        self.assertGreater(float(upper.min() - lower.max()), .25, 'bounded micro-relief cannot reverse material depth')
        # Audit the entire declared material footprint, including thin chips:
        # a symmetric blur can pass interior checks while making edge brick
        # higher than adjacent facing. Rasterise the manifest independently,
        # without importing the authoring implementation.
        self.assertEqual(layering['referenceSize'], [256, 256])
        mask_image = Image.new('1', (256, 256))
        paint = ImageDraw.Draw(mask_image)
        for region in layering['brickRegions']:
            for dx in (-256, 0, 256):
                for dy in (-256, 0, 256):
                    if 'polygon' in region:
                        paint.polygon([(x + dx, y + dy) for x, y in region['polygon']], fill=1)
                    else:
                        x0, y0, x1, y1 = region['ellipse']
                        paint.ellipse((x0 + dx, y0 + dy, x1 + dx, y1 + dy), fill=1)
        mask = np.asarray(mask_image, dtype=bool)
        self.assertTrue(mask.any() and (~mask).any(), 'both materials have pixels')
        highest_brick, lowest_facing = float(veneer[mask].max()), float(veneer[~mask].min())
        self.assertLessEqual(highest_brick, layering['brickHeight'] + layering['microAmplitude'] + .5 / 255, 'even edge brick stays in its lower material band')
        self.assertGreater(lowest_facing, highest_brick, 'every facing texel, including bevels, is above every brick texel')
        self.assertGreater(layering['chipFloor'], layering['brickHeight'] + 2 * layering['microAmplitude'], 'minimum facing height leaves room for micro-relief on both materials')
        for point in ((0, 25), (255, 25), (0, 245), (255, 245), (30, 0), (30, 255), (245, 0), (245, 255)):
            self.assertLess(float(patch(point).max()), .45, 'exposed brick continues through registered tile seams: ' + str(point))
        self.assertLess(float(np.abs(veneer[20:36, 0] - veneer[20:36, -1]).max()), .09, 'wrapped structural mask has no side height step')
        self.assertLess(float(np.abs(veneer[0, 23:38] - veneer[-1, 23:38]).max()), .09, 'wrapped structural mask has no top height step')

    def test_native_period_registration_and_unchanged_unselected_entries(self):
        pak = (ROOT / 'games/shareware/pak0.pak').read_bytes()
        directory, size = struct.unpack_from('<ii', pak, 4)
        found = {}
        for offset in range(directory, directory + size, 64):
            name, start, length = struct.unpack_from('<56sii', pak, offset)
            name = name.split(b'\0')[0].decode()
            if not (name.startswith('maps/') and name.endswith('.bsp')):
                continue
            bsp = pak[start:start + length]
            texture_offset, texture_length = struct.unpack_from('<ii', bsp, 20)
            lump = bsp[texture_offset:texture_offset + texture_length]
            for i in range(struct.unpack_from('<i', lump, 0)[0]):
                offset, = struct.unpack_from('<i', lump, 4 + i * 4)
                if offset < 0:
                    continue
                name = lump[offset:offset + 16].split(b'\0')[0].decode()
                if name in NAMES:
                    found[name] = struct.unpack_from('<ii', lump, offset + 16)
        self.assertEqual(set(found), NAMES)
        self.assertTrue(all(size == (64, 64) for size in found.values()))
        baseline = json.loads(subprocess.check_output(['git', 'show', '8e4fefc:newer/textures/index.json'], cwd=ROOT))
        # this increment's names keep their files (later increments add their own, such as the hub logo, 2b1593b7)
        self.assertEqual({n: INDEX['textures'][n] for n in NAMES}, {n: owner_current_file(n, baseline['textures'][n]) for n in NAMES}, 'runtime names retain baseline or exact validated Q92 successor')
        # the entries that update did not select are as they were, in the shipped index; by name, the ones a later
        # increment changed by design: the demon plaques' crafted relief (2b1593b7)
        LATER = {'dem4_1': '2b1593b7', 'dem4_4': '2b1593b7', 'dem5_3': '2b1593b7'}
        for name in set(baseline['normals']) - NAMES - set(LATER):
            self.assertEqual(INDEX['normals'][name], tech_current_normal(name, baseline['normals'][name]), name)
        allowed = {'newer/textures/index.json'} | {'newer/textures/' + owner_legacy_file(name, 'diffuse') for name in NAMES} | {'newer/textures/' + owner_legacy_file(name, 'height') for name in NAMES}
        # The boundary of that update itself (9a71a46); later increments, such as the seam
        # repairs, change other textures by design.
        changed = set(subprocess.check_output(['git', 'diff', '--name-only', '8e4fefc', '9a71a46', '--', 'newer/textures'], cwd=ROOT, text=True).splitlines())
        self.assertEqual(changed, allowed, 'only 26 diffuse + 26 heights + catalogue changed')


if __name__ == '__main__':
    unittest.main()
