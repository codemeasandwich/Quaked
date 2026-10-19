"""Public CLI layout regressions using separated synthetic primary colours.

No art scoring: RED is the original, GREEN is the replacement, and BLUE leads
the neutral background. JPEG decoding may change bytes; colour ordering proves
which source actually occupies each required panel without RGB tolerances.
Set QUAKED_REVIEW_BUILDER to an archived producer for a deliberate RED run.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CLI = Path(os.environ.get('QUAKED_REVIEW_BUILDER', ROOT / 'tools/texture_sheets/build_texture_batch_review.py'))


class TextureBatchReviewCLI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='texture-review-layout-public-')
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name).resolve()

    def build(self, width, height):
        original = self.dir / 'native.png'
        Image.new('RGB', (width, height), (220, 20, 20)).save(original)
        roles = {'diffuse': (20, 220, 20), 'height': (128, 128, 128),
                 'normalX': (128, 128, 128), 'normalY': (128, 128, 128), 'normalZ': (255, 255, 255)}
        paths = {}
        for role, color in roles.items():
            p = self.dir / (role + '.png')
            Image.new('RGB', (width * 4, height * 4), color).save(p)
            paths[role] = p.name
        batch = self.dir / 'batch.json'
        batch.write_text(json.dumps({'schemaVersion': 2, 'pathsBase': 'repository', 'defaultTier': 'Mid',
          'items': [{'name': 'fixture', 'edition': 'base', 'original': original.name,
                     'nativeIdentity': {'width': width, 'height': height},
                     'tiers': {'Mid': {'dimensions': [width*4, height*4], 'files': paths}}}]}))
        sources = [original, batch, *[self.dir / p for p in paths.values()]]
        before = {p: p.read_bytes() for p in sources}
        output = self.dir / 'output'
        result = subprocess.run([sys.executable, str(CLI), '--batch', str(batch),
                                 '--paths-root', str(self.dir), '--output', str(output)],
                                cwd=ROOT, capture_output=True, text=True, timeout=30, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(all(p.read_bytes() == b for p, b in before.items()), 'Public producer changed an input')
        with Image.open(output / 'fixture-mid-review.jpg') as image:
            return np.asarray(image.convert('RGB'))

    def source_is(self, pixels, box, channel, label):
        x0, y0, x1, y1 = box
        self.assertLessEqual(y1, pixels.shape[0], label + ' clipped below canvas')
        self.assertLessEqual(x1, pixels.shape[1], label + ' clipped beside canvas')
        data = pixels[y0:y1, x0:x1].astype('int16')
        self.assertEqual(data.shape[:2], (y1-y0, x1-x0))
        self.assertGreater(data.size, 0)
        other = [i for i in range(3) if i != channel]
        matches = (data[:, :, channel] > data[:, :, other[0]]) & (data[:, :, channel] > data[:, :, other[1]])
        self.assertTrue(matches.all(), f'{label}: {int((~matches).sum())} pixels overwritten by another source')

    def test_tall176_half_and_quarter_comparisons_remain_complete_and_separate(self):
        pixels = self.build(64, 176)
        self.source_is(pixels, (540, 595, 636, 859), 0, 'Full half-native original RED')
        self.source_is(pixels, (646, 595, 742, 859), 1, 'Full half-native replacement GREEN')
        self.source_is(pixels, (540, 902, 588, 1034), 0, 'Full quarter-native original RED')
        self.source_is(pixels, (598, 902, 646, 1034), 1, 'Full quarter-native replacement GREEN')

    def test_taller_native_grows_canvas_instead_of_clipping_comparisons(self):
        pixels = self.build(64, 512)
        self.assertGreaterEqual(pixels.shape[0], 1790, 'Tall source comparisons clipped by fixed1100canvas')
        self.source_is(pixels, (540, 595, 636, 1363), 0, 'Large full half-native original RED')
        self.source_is(pixels, (646, 595, 742, 1363), 1, 'Large full half-native replacement GREEN')
        self.source_is(pixels, (540, 1406, 588, 1790), 0, 'Large full quarter-native original RED')
        self.source_is(pixels, (598, 1406, 646, 1790), 1, 'Large full quarter-native replacement GREEN')

    def test_wide_overviews_fit_columns_without_spilling_below_or_between(self):
        pixels = self.build(128, 64)
        self.source_is(pixels, (12, 32, 524, 288), 0, '512x256 original overview RED')
        self.source_is(pixels, (540, 32, 1052, 288), 1, '512x256 replacement overview GREEN')
        # Central gap only: JPEG blocks near its borders can decode neutral
        # grey with equal channels. Old wide-source overflow is RED throughout.
        self.source_is(pixels, (528, 64, 532, 256), 2, 'Neutral central gap between overview columns')
        self.source_is(pixels, (80, 304, 440, 496), 2, 'Neutral canvas below512x256 original')

    def test_existing_portrait128_keeps_original_layout(self):
        pixels = self.build(64, 128)
        self.assertEqual(pixels.shape[:2], (1100, 1400))
        self.source_is(pixels, (540, 595, 636, 787), 0, 'Existing half-native original RED')
        self.source_is(pixels, (646, 595, 742, 787), 1, 'Existing half-native replacement GREEN')
        self.source_is(pixels, (540, 830, 588, 926), 0, 'Existing quarter-native original RED')
        self.source_is(pixels, (598, 830, 646, 926), 1, 'Existing quarter-native replacement GREEN')

    def test_actual_queued512wide_comparison_grows_canvas_without_clipping_right_panel(self):
        pixels = self.build(512, 256)
        self.assertGreaterEqual(pixels.shape[1], 2086, 'Wide half-native replacement clipped beside fixed1400canvas')
        self.source_is(pixels, (540, 595, 1308, 979), 0, 'Full512wide half-native original RED')
        self.source_is(pixels, (1318, 595, 2086, 979), 1, 'Full512wide half-native replacement GREEN')
        self.source_is(pixels, (540, 1022, 924, 1214), 0, 'Full512wide quarter-native original RED')
        self.source_is(pixels, (934, 1022, 1318, 1214), 1, 'Full512wide quarter-native replacement GREEN')


if __name__ == '__main__':
    unittest.main(verbosity=2)
