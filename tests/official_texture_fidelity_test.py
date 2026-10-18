"""Historical strict-mode public-CLI regression for the first wall candidates.

These bounds reproduce the earlier algorithm; they are not artistic acceptance
requirements for the current photographic mode or owner-defined error limits.

Run with /usr/bin/python3 tests/official_texture_fidelity_test.py. Candidates and
receipts are produced only in a temporary directory. Numeric fidelity/detail
checks do not establish photorealism, gameplay acceptance or owner approval.
Fresh equivalent PAK references are checked against retained original hashes;
this does not recover missing historical screenshots or verification receipts.
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
GENERATED = ROOT / 'tools/texture_sheets/sources/official-world-2026-10-12'
LUMA = np.array([.299, .587, .114])
RAILS = np.array([22, 35, 48, 61, 74, 87, 100, 113])


def fresh_reference(name, retained_sha256):
    """Resolve fresh equivalent bytes; never rewrite a retained receipt."""
    mapping = json.loads((GENERATED / 'fresh-reference-resolution.json').read_text())
    matches = [entry for entry in mapping['entries'] if entry['name'] == name]
    if len(matches) != 1:
        raise AssertionError('Exactly one fresh reference required for ' + name)
    entry = matches[0]
    path = resource_path(ROOT, entry['freshReference'])
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != retained_sha256 or actual != entry['sha256'] or retained_sha256 not in entry['retainedOriginalHashes']:
        raise AssertionError('Fresh reference differs from retained original bytes: ' + name)
    metadata = json.loads(path.with_suffix('.json').read_text())
    with Image.open(path) as decoded:
        source = metadata['source']
        if source['name'] != name or decoded.size != (source['width'], source['height']):
            raise AssertionError('Fresh reference source dimensions/name differ: ' + name)
        if hashlib.sha256(decoded.convert('RGBA').tobytes()).hexdigest() != source['pixelSha256']:
            raise AssertionError('Fresh reference decoded RGBA differs: ' + name)
    if metadata['referenceSha256'] != actual:
        raise AssertionError('Fresh reference file receipt differs: ' + name)
    return path


def pixels(image):
    return np.asarray(image.convert('RGB'), dtype=float)


def box_error(candidate, original, divisor=1):
    size = (original.width // divisor, original.height // divisor)
    a = pixels(candidate.resize(size, Image.Resampling.BOX))
    b = pixels(original.resize(size, Image.Resampling.BOX))
    return np.abs(a - b).max()


def rail_locations(image):
    a = pixels(image.resize((128, 128), Image.Resampling.BOX))
    gradient = np.diff((a @ LUMA).mean(axis=1))
    return np.array([int(np.argmax(gradient[y-2:y+3])) + y - 2 for y in RAILS])


def laplace(a):
    return 4*a - np.roll(a, 1, axis=0) - np.roll(a, -1, axis=0) - np.roll(a, 1, axis=1) - np.roll(a, -1, axis=1)


class OfficialTextureFidelity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix='quaked-wall-fidelity-')
        cls.addClassCleanup(cls.directory.cleanup)
        cls.samples = {}
        for name, version in [('tech08_3', 'v2'), ('tech08_4', 'v1')]:
            retained = json.loads((resource_path(ROOT, 'newer/textures/candidates-2026-10-12') / (name + '-quarter.json')).read_text())
            original = fresh_reference(name, retained['originalSha256'])
            donor = GENERATED / (name + '-generated-' + version + '.png')
            candidate = Path(cls.directory.name) / (name + '.png')
            baseline = Path(cls.directory.name) / (name + '-no-detail.png')
            registration = GENERATED / (name + '-row-registration.json')
            options = ['--vertical-landmarks', str(registration)] if registration.exists() else []
            for destination, strength in [(candidate, '.7'), (baseline, '0')]:
                result = subprocess.run([sys.executable, str(TOOL), '--original', str(original), '--generated', str(donor), '--output', str(destination), '--factor', '8', '--method', 'strict', '--comparison-divisor', str(retained['comparisonDivisor']), '--strength', strength] + options, capture_output=True, text=True)
                if result.returncode:
                    raise AssertionError(result.stderr)
            cls.samples[name] = dict(original=original, donor=donor, candidate=candidate, baseline=baseline, registration=registration if registration.exists() else None)

    def test_reference_identity_and_retained_provenance(self):
        for name, files in self.samples.items():
            with self.subTest(name=name):
                original = Image.open(files['original']).convert('RGBA')
                digest = hashlib.sha256(original.tobytes()).hexdigest()
                source = json.loads(files['original'].with_suffix('.json').read_text())['source']
                self.assertEqual(source['name'], name)
                self.assertEqual(digest, source['pixelSha256'])
                self.assertEqual(original.size, (source['width'], source['height']))
                receipt = json.loads(files['candidate'].with_suffix('.json').read_text())
                self.assertEqual(receipt['comparisonDivisor'], 4)
                self.assertEqual(receipt['comparisonDimensions'], [32, 32])
                for field, path in [('original', files['original']), ('generated', files['donor']), ('output', files['candidate']), ('tool', TOOL)]:
                    self.assertEqual(receipt[field + 'Sha256'], hashlib.sha256(path.read_bytes()).hexdigest())
                with Image.open(files['candidate']) as encoded:
                    self.assertEqual(encoded.size, (1024, 1024))
                if files['registration']:
                    self.assertEqual(receipt['landmarkSha256'], hashlib.sha256(files['registration'].read_bytes()).hexdigest())
                    self.assertEqual(receipt['verticalLandmarks'], json.loads(files['registration'].read_text()))

    def test_historical_strict_quarter_projection_and_farther_mips(self):
        for name, files in self.samples.items():
            # Historical strict algorithm: compare 128->32 against 1024->32.
            # Preserve its numerical regression bounds without imposing them
            # on current photographic artwork. Native error stays diagnostic.
            original = Image.open(files['original']).convert('RGB')
            candidate = Image.open(files['candidate']).convert('RGB')
            print(json.dumps(dict(texture=name,
                                  nativeDiagnosticMaxError=float(box_error(candidate, original)),
                                  distanceOracleDivisor=4,
                                  quarterMaxError=float(box_error(candidate, original, 4)))), flush=True)
            for divisor in [4, 8, 16]:
                with self.subTest(name=name, mip_divisor=divisor):
                    self.assertLessEqual(box_error(candidate, original, divisor), 1)

    def test_grille_has_all_eight_original_rail_positions(self):
        files = self.samples['tech08_4']
        self.assertTrue(np.array_equal(rail_locations(Image.open(files['original'])), RAILS))
        self.assertTrue(np.array_equal(rail_locations(Image.open(files['candidate'])), RAILS))
        # Sensitivity checks: a one-native-pixel slip and the raw rejected donor
        # must not pass a gate claimed to preserve the source rail registration.
        shifted = Image.fromarray(np.roll(np.asarray(Image.open(files['original']).convert('RGB')), 1, axis=0))
        self.assertFalse(np.array_equal(rail_locations(shifted), RAILS))
        self.assertFalse(np.array_equal(rail_locations(Image.open(files['donor'])), RAILS))
        self.assertGreater(box_error(shifted, Image.open(files['original']), 4), 1)
        self.assertGreater(box_error(Image.open(files['donor']), Image.open(files['original']), 4), 1)

    def test_generated_detail_is_retained_without_new_boundary_band(self):
        for name, files in self.samples.items():
            with self.subTest(name=name):
                result = pixels(Image.open(files['candidate']))
                baseline = pixels(Image.open(files['baseline']))
                donor = pixels(Image.open(files['donor']).resize((1024, 1024), Image.Resampling.LANCZOS))
                detail = result - baseline
                interior = detail[32:-32, 32:-32]
                self.assertGreater(float(np.sqrt(np.mean(interior**2))), 1, 'plain source enlargement is not GPT detail')
                if files['registration']:
                    # Check donor identity at measured physical landmarks, not
                    # by reproducing the finisher's interpolation algorithm.
                    anchors = json.loads(files['registration'].read_text())[2:-2]
                    a = np.concatenate([laplace(detail)[round(y*8), 32:-32].ravel() for y, _ in anchors])
                    b = np.concatenate([laplace(donor)[round(y*8), 32:-32].ravel() for _, y in anchors])
                else:
                    a = laplace(detail)[32:-32, 32:-32].ravel()
                    b = laplace(donor)[32:-32, 32:-32].ravel()
                self.assertGreater(float(np.corrcoef(a, b)[0, 1]), .2, 'detail must relate to actual GPT donor')
                # Compare to the same original reconstruction: its intentional
                # edge groove need not be continuous or artificially erased.
                for border in [detail[0], detail[-1], detail[:, 0], detail[:, -1]]:
                    self.assertLess(float(np.abs(border).mean()), 2, 'GPT detail introduced an outer band')
                for seam in [detail[0]-detail[-1], detail[:, 0]-detail[:, -1]]:
                    self.assertLess(float(np.abs(seam).mean()), 2, 'GPT detail introduced an extra wrap discontinuity')
                wrong_colour = Image.fromarray(np.clip(pixels(Image.open(files['original'])) + 12, 0, 255).astype('uint8'))
                self.assertGreater(box_error(wrong_colour, Image.open(files['original']), 4), 1)

    def test_cli_refuses_overwrite_and_unsupported_enlargement(self):
        files = self.samples['tech08_3']
        candidate = files['candidate']
        before = candidate.read_bytes(), candidate.with_suffix('.json').read_bytes()
        base = [sys.executable, str(TOOL), '--original', str(files['original']), '--generated', str(files['donor']), '--factor', '8', '--method', 'strict', '--comparison-divisor', '4']
        result = subprocess.run(base + ['--output', str(candidate)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(before, (candidate.read_bytes(), candidate.with_suffix('.json').read_bytes()))
        invalid = Path(self.directory.name) / 'invalid.png'
        result = subprocess.run(base + ['--output', str(invalid), '--factor', '3'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(invalid.exists())
        self.assertFalse(invalid.with_suffix('.json').exists())
        lossy = Path(self.directory.name) / 'lossy.jpg'
        result = subprocess.run(base + ['--output', str(lossy)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0, 'pre-encoding receipt must not qualify a lossy output')
        self.assertFalse(lossy.exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
