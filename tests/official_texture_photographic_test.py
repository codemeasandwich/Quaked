"""Public CLI invariants for photographic finishing; no artistic acceptance gate.

Run /usr/bin/python3 tests/official_texture_photographic_test.py. Outputs stay in
TemporaryDirectory. Owner examples calibrate diagnostics; RGB error is never
converted into a new automatic acceptance threshold for photographic artwork.
References are fresh PAK extractions with verified byte equivalence; no missing
historical screenshot or test receipt is claimed recovered.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from resource_paths import resource_path

TOOL = ROOT / 'tools/texture_sheets/finish_official_texture.py'
SOURCES = ROOT / 'tools/texture_sheets/sources/official-world-2026-10-12'


def fresh_reference(name, retained_sha256):
    """Resolve fresh equivalent bytes; never rewrite a retained receipt."""
    mapping = json.loads((SOURCES / 'fresh-reference-resolution.json').read_text())
    matches = [entry for entry in mapping['entries'] if entry['name'] == name]
    if len(matches) != 1:
        raise AssertionError('Exactly one fresh reference required for ' + name)
    entry = matches[0]
    path = resource_path(ROOT, entry['freshReference'])
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != retained_sha256 or actual != entry['sha256'] or retained_sha256 not in entry['retainedOriginalHashes']:
        raise AssertionError('Fresh reference differs from retained original bytes: ' + name)
    metadata = json.loads(resource_path(ROOT, Path(entry['freshReference']).with_suffix('.json')).read_text())
    with Image.open(path) as decoded:
        source = metadata['source']
        if source['name'] != name or decoded.size != (source['width'], source['height']):
            raise AssertionError('Fresh reference source dimensions/name differ: ' + name)
        if hashlib.sha256(decoded.convert('RGBA').tobytes()).hexdigest() != source['pixelSha256']:
            raise AssertionError('Fresh reference decoded RGBA differs: ' + name)
    if metadata['referenceSha256'] != actual:
        raise AssertionError('Fresh reference file receipt differs: ' + name)
    return path


def rgb(path):
    with Image.open(path) as image:
        return np.asarray(image.convert('RGB')).copy()


def blue_aperture(image):
    a = image.astype(float)
    mask = (a[:, :, 2] - a[:, :, 0] > 25) & (a[:, :, 2] > 90)
    y, x = np.where(mask)
    if not len(x):
        return None
    return np.array([x.min()/a.shape[1], (x.max()+1)/a.shape[1], y.min()/a.shape[0], (y.max()+1)/a.shape[0]])


class PhotographicFinishing(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='quaked-photographic-')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.directory = Path(cls.temp.name)
        retained = json.loads((resource_path(ROOT, 'newer/textures/candidates-2026-10-12/ceil1_1-photographic-v2.json')).read_text())
        cls.original = fresh_reference('ceil1_1', retained['originalSha256'])
        cls.donor = resource_path(ROOT, SOURCES / 'ceil1_1-artistic-v2.png')
        cls.finished, cls.receipt = cls.run_cli('lamp', cls.original, cls.donor)
        cls.zero, cls.zero_receipt = cls.run_cli('lamp-zero', cls.original, cls.donor, ['--color-strength', '0'])

    @classmethod
    def run_cli(cls, name, original, donor, options=(), factor=8, comparison_divisor=4, method='photographic'):
        # Existing fixtures explicitly retain 8x/quarter-distance authoring.
        # None omits a setting so the public-default test cannot accidentally
        # pass by supplying the default it is meant to verify.
        output = cls.directory / (name + '.png')
        command = [sys.executable, str(TOOL), '--original', str(original), '--generated', str(donor), '--output', str(output)]
        if method is not None and '--method' not in options:
            command += ['--method', method]
        if factor is not None and '--factor' not in options:
            command += ['--factor', str(factor)]
        if comparison_divisor is not None and '--comparison-divisor' not in options:
            command += ['--comparison-divisor', str(comparison_divisor)]
        command += list(options)
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode:
            raise AssertionError(result.stderr)
        return output, json.loads(output.with_suffix('.json').read_text())

    def test_public_defaults_are_four_times_art_half_native_comparison_and_photographic_diagnostics(self):
        def mean_blocks(pixels, size):
            width, height = size
            h, w, channels = pixels.shape
            return pixels.astype(float).reshape(height, h // height, width, w // width, channels).mean((1, 3))

        for width, height in [(64, 64), (128, 128), (16, 128)]:
            with self.subTest(native=(width, height)):
                original = self.directory / f'default-native-{width}-{height}.png'
                y, x = np.mgrid[:height, :width]
                source = np.stack([(x * 7 + y * 3) % 192 + 32,
                                   (x * 2 + y * 5) % 192 + 32,
                                   (x * 3 + y * 2) % 192 + 32], axis=2).astype('uint8')
                Image.fromarray(source).save(original)
                output, receipt = self.run_cli(f'default-four-{width}-{height}', original, self.donor,
                                               ['--color-strength', '0'], factor=None,
                                               comparison_divisor=None, method=None)
                with Image.open(output) as decoded, Image.open(self.donor) as donor:
                    self.assertEqual(decoded.size, (width * 4, height * 4))
                    expected = donor.convert('RGB').resize(decoded.size, Image.Resampling.LANCZOS)
                    self.assertTrue(np.array_equal(np.asarray(decoded.convert('RGB')), np.asarray(expected)))
                self.assertEqual(receipt['factor'], 4)
                self.assertEqual(receipt['method'], 'photographic')
                self.assertEqual(receipt['comparisonDivisor'], 2)
                self.assertEqual(receipt['comparisonDimensions'], [width // 2, height // 2])
                comparison = (width // 2, height // 2)
                error = np.abs(mean_blocks(rgb(output), comparison) - mean_blocks(source, comparison))
                self.assertAlmostEqual(receipt['distanceMeanMAE'], float(error.mean()), places=10)
                self.assertAlmostEqual(receipt['distanceMeanMaxError'], float(error.max()), places=10)
                self.assertGreater(receipt['distanceMeanMaxError'], 1, 'photographic default must not project this unrelated fixture to equality')
                self.assertIsNone(receipt['passedDistanceCheck'])
                # The secondary quarter view remains explicit and changes the
                # measurement grid, not the zero-correction artwork.
                farther, secondary = self.run_cli(f'secondary-quarter-{width}-{height}', original, self.donor,
                                                  ['--color-strength', '0', '--comparison-divisor', '4'],
                                                  factor=None, comparison_divisor=None, method=None)
                self.assertTrue(np.array_equal(rgb(output), rgb(farther)))
                self.assertEqual(secondary['comparisonDimensions'], [width // 4, height // 4])
                self.assertIsNone(secondary['passedDistanceCheck'])

    def test_zero_correction_preserves_full_photographic_donor(self):
        with Image.open(self.donor) as donor:
            expected = np.asarray(donor.convert('RGB').resize((128, 128), Image.Resampling.LANCZOS))
        self.assertTrue(np.array_equal(rgb(self.zero), expected))
        self.assertIsNone(self.zero_receipt['passedDistanceCheck'])
        self.assertGreater(self.zero_receipt['distanceMeanMaxError'], 1)
        self.assertEqual(self.receipt['method'], 'photographic')
        self.assertIsNone(self.receipt['passedDistanceCheck'])
        print(json.dumps(dict(lampQuarterMAE=self.receipt['distanceMeanMAE'], lampQuarterMax=self.receipt['distanceMeanMaxError'], qualification='Diagnostics only; no automatic appearance acceptance')), flush=True)

    def test_native_pixel_rearrangement_cannot_return_as_a_grid(self):
        original = rgb(self.original)
        rearranged = original.copy()
        for y in range(0, original.shape[0], 4):
            for x in range(0, original.shape[1], 4):
                rearranged[y:y+4, x:x+4] = original[y:y+4, x:x+4][::-1, ::-1]
        self.assertFalse(np.array_equal(original, rearranged), 'control must actually change native pixel boundaries')
        path = self.directory / 'rearranged-original.png'
        Image.fromarray(rearranged).save(path)
        output, receipt = self.run_cli('rearranged-output', path, self.donor)
        self.assertTrue(np.array_equal(rgb(output), rgb(self.finished)))
        self.assertEqual(receipt['distanceMeanMAE'], self.receipt['distanceMeanMAE'])
        # The final photograph is not a reconstituted native image.
        with Image.open(self.original) as image:
            native_enlarged = np.asarray(image.convert('RGB').resize((128, 128), Image.Resampling.BICUBIC))
        self.assertFalse(np.array_equal(rgb(self.finished), native_enlarged))

    def test_colour_correction_is_smooth_and_retains_donor_structure(self):
        original_path, donor_path = self.directory / 'cast-reference.png', self.directory / 'cast-donor.png'
        reference = np.full((16, 16, 3), [80, 95, 110], dtype=np.uint8)
        y, x = np.mgrid[:128, :128]
        # Diagonal curved detail rather than native-cell-aligned blocks; no
        # clipping is needed to correct this deliberately elevated colour cast.
        detail = 12*np.sin(x*.39 + 3*np.sin(y*.045)) + 5*np.cos(y*.63)
        donor = np.rint(np.clip(reference[0, 0] + 35 + detail[:, :, None], 0, 255)).astype(np.uint8)
        Image.fromarray(reference).save(original_path); Image.fromarray(donor).save(donor_path)
        output, receipt = self.run_cli('cast-output', original_path, donor_path)
        finished = rgb(output).astype(float); correction = finished - donor.astype(float)
        before = np.abs(donor.mean((0, 1))-reference[0, 0]).mean()
        after = np.abs(finished.mean((0, 1))-reference[0, 0]).mean()
        self.assertLess(after, before*.6)
        for axis in [0, 1]:
            a, b = np.diff(donor.astype(float), axis=axis), np.diff(finished, axis=axis)
            self.assertGreater(float(np.corrcoef(a.ravel(), b.ravel())[0, 1]), .98)
            # A smooth correction adds no texel grid or new wrap seam. These
            # bounds test this synthetic mechanism, not photographic quality.
            self.assertLessEqual(float(np.abs(np.diff(correction, axis=axis)).max()), 2)
        self.assertLessEqual(float(np.abs(correction[0]-correction[-1]).max()), 2)
        self.assertLessEqual(float(np.abs(correction[:, 0]-correction[:, -1]).max()), 2)
        self.assertEqual(receipt['newClippedChannelFraction'], 0)

    def test_lamp_intent_and_measured_registration_are_separate_from_colour(self):
        original_box, finished_box = blue_aperture(rgb(self.original)), blue_aperture(rgb(self.finished))
        self.assertTrue(np.allclose(original_box, [.25, .75, .25, .75]))
        self.assertIsNotNone(finished_box)
        self.assertLess(float(np.abs(finished_box-original_box).max()), .05, 'central half-sized luminous aperture must not become an oversized panel')
        wrong = np.zeros((128, 128, 3), dtype=np.uint8); wrong[8:120, 8:120] = [100, 180, 250]
        self.assertGreater(float(np.abs(blue_aperture(wrong)-original_box).max()), .1)
        original = self.directory / 'registration-reference.png'; donor = self.directory / 'registration-donor.png'
        Image.fromarray(np.full((16, 16, 3), 80, dtype=np.uint8)).save(original)
        art = np.full((128, 128, 3), 40, dtype=np.uint8); art[46:51] = [30, 230, 40]
        Image.fromarray(art).save(donor)
        landmarks = self.directory / 'registration.json'; landmarks.write_text('[[0,0],[2,4],[8,10],[16,16]]')
        output, receipt = self.run_cli('registered', original, donor, ['--color-strength', '0', '--vertical-landmarks', str(landmarks)])
        rows = rgb(output)[:, :, 1].mean(axis=1); green = np.flatnonzero(rows > 180)
        self.assertLess(abs(float(green.mean())-32), 1.5, 'measured donor band at native y6 must move to native y4')
        self.assertEqual(receipt['landmarkSha256'], hashlib.sha256(landmarks.read_bytes()).hexdigest())
        self.assertEqual(receipt['verticalLandmarks'], json.loads(landmarks.read_text()))

    def test_owner_examples_remain_calibration_positives_with_nonzero_error(self):
        pairs = json.loads((SOURCES / 'owner-style-calibration.json').read_text())['entries']
        for pair in pairs:
            with self.subTest(texture=pair['name']):
                original_path = resource_path(ROOT, pair['sourceReference'])
                self.assertEqual(hashlib.sha256(original_path.read_bytes()).hexdigest(), pair['sourceFileSha256'])
                with Image.open(original_path) as decoded:
                    self.assertEqual(hashlib.sha256(decoded.convert('RGBA').tobytes()).hexdigest(), pair['sourceRGBAsha256'])
                    original = decoded.convert('RGB')
                donor_path = resource_path(ROOT, 'newer/textures') / pair['enhanced']
                self.assertEqual(hashlib.sha256(donor_path.read_bytes()).hexdigest(), pair['enhancedFileSha256'])
                output, receipt = self.run_cli('owner-' + pair['name'], original_path, donor_path, ['--factor', '4', '--color-strength', '0'])
                self.assertTrue(np.array_equal(rgb(output), rgb(donor_path)), 'zero correction must not erase owner-approved detail')
                self.assertIsNone(receipt['passedDistanceCheck'])
                with Image.open(donor_path) as image:
                    enhanced = image.convert('RGB').resize(tuple(pair['comparisonDimensions']), Image.Resampling.BOX)
                difference = np.abs(np.asarray(enhanced, float)-np.asarray(original.resize(tuple(pair['comparisonDimensions']), Image.Resampling.BOX), float))
                self.assertEqual(float(difference.max()), pair['quarterMax'])
                self.assertEqual(float(difference.mean()), pair['quarterMAE'])
                self.assertGreater(pair['quarterMax'], 1, 'positive examples refute the obsolete strict threshold')

    def test_retained_strict_candidate_is_reproducible(self):
        retained = resource_path(ROOT, 'newer/textures/candidates-2026-10-12/tech08_3-quarter.png')
        recipe = json.loads(retained.with_suffix('.json').read_text())
        output, receipt = self.run_cli('strict-replay', fresh_reference('tech08_3', recipe['originalSha256']), resource_path(ROOT, ROOT / recipe['generated']),
                                       ['--method', 'strict', '--factor', str(recipe['factor']),
                                        '--strength', str(recipe['detailStrength']),
                                        '--comparison-divisor', str(recipe['comparisonDivisor'])])
        self.assertTrue(np.array_equal(rgb(output), rgb(retained)))
        self.assertEqual(receipt['method'], 'strict')
        # This is the historical method's reproducibility assertion, not an
        # artistic gate imposed on new photographic candidates.
        self.assertTrue(receipt['passedDistanceCheck'])

    def test_optional_edge_anchor_changes_only_reviewed_band_and_matches_means(self):
        def edges(a):
            return [a[0], a[-1], a[:, 0], a[:, -1]]

        for name in ['tech08_3', 'tech08_4']:
            with self.subTest(texture=name):
                retained = resource_path(ROOT, 'newer/textures/candidates-2026-10-12') / (name + '-photographic.png')
                recipe = json.loads(retained.with_suffix('.json').read_text())
                options = ['--factor', str(recipe['factor']), '--color-strength', str(recipe['colorStrength']), '--field-sigma', str(recipe['fieldSigma'])]
                if recipe.get('landmarkFile'):
                    options += ['--vertical-landmarks', str(ROOT / recipe['landmarkFile'])]
                original, donor = fresh_reference(name, recipe['originalSha256']), resource_path(ROOT, ROOT / recipe['generated'])
                unanchored, plain_receipt = self.run_cli(name+'-unanchored-replay', original, donor, options)
                anchored, receipt = self.run_cli(name+'-edge-review', original, donor, options+['--edge-anchor'])
                before, after, reference = rgb(unanchored), rgb(anchored), rgb(original)
                self.assertTrue(np.array_equal(before, rgb(retained)), 'absent option must preserve prior photographic output exactly')
                self.assertFalse(plain_receipt['edgeAnchor'])
                self.assertTrue(receipt['edgeAnchor'])
                band = recipe['factor']
                self.assertEqual(after.shape, before.shape)
                self.assertTrue(np.array_equal(after[band:-band, band:-band], before[band:-band, band:-band]), 'no interior pixels may move or change')
                changed = np.any(after != before, axis=2)
                self.assertTrue(changed.any(), 'actual bright-edge correction must be exercised')
                errors = []
                for original_edge, old_edge, new_edge in zip(edges(reference), edges(before), edges(after)):
                    error = float(np.abs(new_edge.mean(axis=0)-original_edge.mean(axis=0)).max())
                    errors.append(error)
                    self.assertLess(error, .5, 'reviewed pair must match each native edge mean within encoding precision')
                    # Excluding the crossing corner bands, adjustment is a
                    # constant RGB offset along this edge: donor grain survives.
                    delta = new_edge[band:-band].astype(int)-old_edge[band:-band].astype(int)
                    self.assertLessEqual(int(np.ptp(delta, axis=0).max()), 1)
                for field, path in [('original', original), ('generated', donor), ('output', anchored), ('tool', TOOL)]:
                    self.assertEqual(receipt[field+'Sha256'], hashlib.sha256(path.read_bytes()).hexdigest())
                if recipe.get('landmarkFile'):
                    self.assertEqual(receipt['landmarkSha256'], hashlib.sha256((ROOT / recipe['landmarkFile']).read_bytes()).hexdigest())
                print(json.dumps(dict(texture=name, edgeMeanMaxErrors=errors, unchangedInterior=True, qualification='Specific reviewed edge treatment; not a universal tiling or visual acceptance claim')), flush=True)

    def test_provenance_and_non_destructive_cli_contract(self):
        for field, path in [('original', self.original), ('generated', self.donor), ('output', self.finished), ('tool', TOOL)]:
            self.assertEqual(self.receipt[field+'Sha256'], hashlib.sha256(path.read_bytes()).hexdigest())
        before = self.finished.read_bytes(), self.finished.with_suffix('.json').read_bytes()
        command = [sys.executable, str(TOOL), '--original', str(self.original), '--generated', str(self.donor), '--method', 'photographic']
        result = subprocess.run(command+['--output', str(self.finished)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(before, (self.finished.read_bytes(), self.finished.with_suffix('.json').read_bytes()))
        for suffix, options in [('jpg', []), ('png', ['--color-strength', '1.1']), ('png', ['--field-sigma', '.1']), ('png', ['--comparison-divisor', '1'])]:
            output = self.directory / ('invalid-'+str(len(options))+('-sigma' if '--field-sigma' in options else '')+'.'+suffix)
            result = subprocess.run(command+['--output', str(output)]+options, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())
            self.assertFalse(output.with_suffix('.json').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
