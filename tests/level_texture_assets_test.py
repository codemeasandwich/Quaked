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
SOURCE = ROOT / 'tools/texture_sheets/sources/level-2026-10-02'
RECIPE = json.loads((SOURCE / 'manifest.json').read_text())
INDEX = json.loads((ROOT / 'newer/textures/index.json').read_text())
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
                actual = np.array(Image.open(ROOT / 'newer/textures' / INDEX['textures'][name]).convert('RGB'))
                keep = ~seam_mask(name, actual.shape)
                np.testing.assert_array_equal(actual[keep], expected[keep])
        self.assertEqual(RECIPE['tiles']['column1_2']['crop'][3], 620, 'marble separator excluded')
        self.assertEqual(RECIPE['tiles']['city5_1']['crop'][3], 306, 'adjacent pink row excluded')

    def test_registered_height_sizes_and_material_semantics(self):
        for name in NAMES:
            with self.subTest(texture=name):
                normal = INDEX['normals'][name]
                image = Image.open(ROOT / 'newer/textures' / normal['file'])
                self.assertEqual(image.size, (256, 256))
                pixels = np.array(image.convert('RGB'))
                np.testing.assert_array_equal(pixels[:, :, 0], pixels[:, :, 1])
                np.testing.assert_array_equal(pixels[:, :, 0], pixels[:, :, 2])
                self.assertTrue(np.isfinite(normal['strength']) and normal['strength'] >= 0)
                self.assertTrue(np.isfinite(normal['cap']) and normal['cap'] > 0)
                if name != 'column1_2':
                    self.assertGreater(float(pixels[:, :, 0].std()), 2, 'actual relief remains')
        marble = INDEX['normals']['column1_2']
        self.assertEqual(marble['strength'], 0)
        self.assertTrue(np.all(np.array(Image.open(ROOT / 'newer/textures' / marble['file']).convert('L')) == 255), 'no pigment relief or constant POM displacement')
        checker = np.array(Image.open(ROOT / 'newer/textures' / INDEX['normals']['wall9_8']['file']).convert('L'), dtype=float) / 255
        means = [checker[y:y + 80, x:x + 80].mean() for y in (24, 152) for x in (24, 152)]
        self.assertLess(max(means) - min(means), .015, 'different pigments do not become quarter-height steps')
        self.assertEqual(INDEX['normals']['city5_6']['strength'], 2.0)
        self.assertEqual(INDEX['normals']['wizwood1_7']['strength'], 2.6)
        self.assertEqual(INDEX['normals']['wall16_7']['strength'], 1.4)
        veneer = np.array(Image.open(ROOT / 'newer/textures' / INDEX['normals']['city5_1']['file']).convert('L'), dtype=float) / 255
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
        self.assertEqual(INDEX['textures'], baseline['textures'], 'runtime names/files not remapped')
        for name in set(baseline['normals']) - NAMES:
            self.assertEqual(INDEX['normals'][name], baseline['normals'][name], name)
        allowed = {'newer/textures/index.json'} | {'newer/textures/' + INDEX['textures'][name] for name in NAMES} | {'newer/textures/' + INDEX['normals'][name]['file'] for name in NAMES}
        # The boundary of that update itself (9a71a46); later increments, such as the seam
        # repairs, change other textures by design.
        changed = set(subprocess.check_output(['git', 'diff', '--name-only', '8e4fefc', '9a71a46', '--', 'newer/textures'], cwd=ROOT, text=True).splitlines())
        self.assertEqual(changed, allowed, 'only 26 diffuse + 26 heights + catalogue changed')


if __name__ == '__main__':
    unittest.main()
