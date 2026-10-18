"""Public CLI proof for the two source-bound solid-facing / inset-brick recipes.

Uses retained real native/master/map witnesses, not a substitute image generator.
The material mask is checked with independent integer native-period inequalities.
Visual realism, diffuse edge bleed, POM, cache and actual GPU checks are separate.
"""
from copy import deepcopy
import hashlib
import json
import shutil
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

def physical(path):
    return resource_path(ROOT, Path(path).resolve())
SOURCE = Path('tools/texture_sheets/sources/official-world-2026-10-17')
ENCODER = ROOT / 'tools/texture_sheets/encode_official_maps.py'
WITNESSES = {
    'br_trim1_1': ('128x64:77662dd16046c093', (128, 64),
                   'br_trim1_1-photographic-layered-v13-4x-q92-xyz.json'),
    'br_trim1_2': ('64x64:b40e75921ad5cfe8', (64, 64),
                   'br_trim1_2-photographic-layered-v7-4x-q92-xyz.json'),
}
ROLES = ('diffuse', 'height', 'normalX', 'normalY', 'normalZ')


def digest(path):
    return hashlib.sha256(physical(path).read_bytes()).hexdigest()


def load_json(path):
    return json.loads(physical(path).read_text())


def independent_inset_mask(native_size):
    """Half-open physical intervals, independent of ImageDraw/brick_mask."""
    width, height = native_size
    y, x = np.mgrid[:height * 4, :width * 4]
    side = np.where((y // 32) % 2 == 0, 32, 64)
    return (x >= side) & (x < width * 4 - side)


class LayeredOfficialHeight(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scratch = tempfile.TemporaryDirectory(prefix='quaked-layered-cli-')
        cls.temp = Path(cls.scratch.name)
        cls.fixtures = {}
        cls.custody = {}
        for name, (key, native_size, receipt_name) in WITNESSES.items():
            receipt_path = ROOT / 'newer/textures/candidates-2026-10-17' / receipt_name
            receipt = load_json(receipt_path)  # Missing real witnesses fail; never skip.
            original = ROOT / receipt['original']
            master = ROOT / receipt['authoringDiffuse']
            recipe_path = ROOT / SOURCE / (name + '-layered-height-v1.json')
            recipe = load_json(recipe_path)
            native = load_json(ROOT / SOURCE / ('native-' + name + '.json'))
            assert native['key'] == key
            assert (native['width'], native['height']) == native_size
            assert recipe['name'] == receipt['name'] == name
            assert recipe['originalSha256'] == receipt['originalSha256'] == digest(original)
            assert recipe['authoringDiffuseSha256'] == receipt['authoringDiffuseSha256'] == digest(master)
            assert recipe['layering']['referenceSize'] == list(native_size)
            rgba = Image.open(physical(original)).convert('RGBA')
            assert hashlib.sha256(rgba.tobytes()).hexdigest() == native['pixelSha256']
            assert rgba.size == native_size
            with Image.open(physical(master)) as master_image:
                assert master_image.size == tuple(n * 4 for n in native_size)
            fixture = dict(name=name, native_size=native_size, witness=receipt,
                           original=original, master=master, recipe_path=recipe_path,
                           recipe=recipe)
            paths = [receipt_path, original, master, recipe_path,
                     ROOT / SOURCE / ('native-' + name + '.json')]
            paths.extend(ROOT / record['file'] for record in receipt['outputs'].values())
            for path in paths:
                cls.custody[path] = digest(path)
            cls.fixtures[name] = fixture
            fixture['actual'] = cls.encode(fixture, cls.temp / name / 'normal', strength=.2)
            fixture['quiet'] = cls.encode(fixture, cls.temp / name / 'quiet', strength=.06)

    @classmethod
    def tearDownClass(cls):
        try:
            for path, before in cls.custody.items():
                if digest(path) != before:
                    raise AssertionError('CLI changed retained source/witness: ' + str(path))
        finally:
            cls.scratch.cleanup()

    @classmethod
    def command(cls, fixture, stem, recipe_path=None, strength=.2):
        return ['/usr/bin/python3', str(ENCODER), '--original', str(fixture['original']),
                '--diffuse', str(fixture['master']), '--name', fixture['name'],
                '--output-stem', str(stem), '--strength', str(strength), '--cap', '.5',
                '--normal-layout', 'channels', '--height-layering',
                str(recipe_path or fixture['recipe_path'])]

    @classmethod
    def encode(cls, fixture, stem, strength):
        result = subprocess.run(cls.command(fixture, stem, strength=strength), cwd=ROOT,
                                capture_output=True, text=True)
        if result.returncode:
            raise AssertionError('Real layered CLI failed: ' + result.stderr)
        return load_json(stem.with_suffix('.json'))

    def assert_order_and_layout(self, fixture, receipt):
        image = Image.open(physical(receipt['outputs']['height']['file'])).convert('RGB')
        red = np.asarray(image)[:, :, 0]
        mask = independent_inset_mask(fixture['native_size'])
        self.assertEqual(red.shape, mask.shape)
        facing_min, inset_max = int(red[~mask].min()), int(red[mask].max())
        self.assertGreater(facing_min, inset_max,
                           'every solid-facing texel must remain above every inset texel after Q92')
        # A leaked one-texel right stripe or inclusive row-end error changes this
        # independently derived classification, even if central landmarks pass.
        midpoint = (facing_min + inset_max) / 2
        self.assertTrue(np.array_equal(red < midpoint, mask),
                        'exact eight-course half-open plane geometry, including both edges')
        self.assertEqual(receipt['heightLayering']['decodedPlaneOrdering'], {
            'facingMinimum': facing_min, 'insetMaximum': inset_max,
            'decodedMinimumGap': facing_min - inset_max,
            'units': 'decoded red channel 0..255',
        })
        for row in range(8):
            inset = 32 if row % 2 == 0 else 64
            y = row * 32 + 16
            self.assertFalse(mask[y, inset - 1])
            self.assertTrue(mask[y, inset])
            self.assertTrue(mask[y, mask.shape[1] - inset - 1])
            self.assertFalse(mask[y, mask.shape[1] - inset])
        return red

    def test_actual_source_bound_q92_payloads_and_decoded_material_planes(self):
        for name, fixture in self.fixtures.items():
            with self.subTest(name=name):
                receipt = fixture['actual']
                witness = fixture['witness']
                self.assertEqual(receipt['normalRecipe'], 'layered-veneer')
                self.assertEqual((receipt['factor'], receipt['quality'], receipt['lossless']),
                                 (4, 92, False))
                self.assertEqual(receipt['profile']['strength'], .2)
                self.assertEqual(receipt['profile']['cap'], .5)
                self.assertEqual(receipt['heightLayering']['sha256'], digest(fixture['recipe_path']))
                self.assertEqual(receipt['heightLayering']['authoringToolSha256'],
                                 digest(ROOT / 'tools/texture_sheets/update_level_sheets.py'))
                for role in ROLES:
                    record = receipt['outputs'][role]
                    path = Path(record['file'])
                    data = path.read_bytes()
                    self.assertEqual(digest(path), record['sha256'])
                    self.assertEqual(data, physical(ROOT / witness['outputs'][role]['file']).read_bytes(),
                                     name + '/' + role + ' independently replays exact retained payload')
                    self.assertEqual(record['dimensions'], [n * 4 for n in fixture['native_size']])
                    self.assertEqual((record['quality'], record['lossless']), (92, False))
                    self.assertIn(b'VP8 ', data[:64])
                    self.assertNotIn(b'VP8L', data[:64])
                    with Image.open(path) as image:
                        self.assertEqual(list(image.size), record['dimensions'])
                self.assert_order_and_layout(fixture, receipt)

    def test_changed_normal_strength_preserves_diffuse_height_and_plane_order(self):
        for name, fixture in self.fixtures.items():
            with self.subTest(name=name):
                normal, quiet = fixture['actual'], fixture['quiet']
                self.assertEqual(quiet['profile']['strength'], .06)
                self.assertEqual(quiet['profile']['cap'], normal['profile']['cap'])
                for role in ('diffuse', 'height'):
                    self.assertEqual(Path(normal['outputs'][role]['file']).read_bytes(),
                                     Path(quiet['outputs'][role]['file']).read_bytes(),
                                     role + ' is independent of normal slope strength')
                self.assertTrue(any(Path(normal['outputs'][role]['file']).read_bytes() !=
                                    Path(quiet['outputs'][role]['file']).read_bytes()
                                    for role in ('normalX', 'normalY', 'normalZ')),
                                'normal strength must actually change the produced normals')
                self.assert_order_and_layout(fixture, quiet)

    def test_invalid_or_conflicting_recipes_fail_before_any_output_write(self):
        fixture = self.fixtures['br_trim1_1']
        changes = [
            ('wrong-native', lambda r: r.update(originalSha256='0' * 64), 'Layering native mismatch'),
            ('wrong-name', lambda r: r.update(name='unapproved-other-source'), 'Layering belongs'),
            ('wrong-master', lambda r: r.update(authoringDiffuseSha256='0' * 64), 'Layering diffuse mismatch'),
            ('reversed-floor', lambda r: r['layering'].update(chipFloor=.3), 'AssertionError'),
            ('no-micro-margin', lambda r: r['layering'].update(chipFloor=.4), 'Facing must remain'),
            ('nonfinite-level', lambda r: r['layering'].update(microAmplitude=float('nan')), 'Finite layering'),
            ('outside-region', lambda r: r['layering']['brickRegions'][0]['polygon'][0].__setitem__(0, -.25), 'AssertionError'),
            ('wrong-reference', lambda r: r['layering'].update(referenceSize=[64, 64]), 'native texels'),
            ('empty-regions', lambda r: r['layering'].update(brickRegions=[]), 'AssertionError'),
        ]
        for label, change, error in changes:
            with self.subTest(case=label):
                recipe = deepcopy(fixture['recipe'])
                change(recipe)
                input_dir = self.temp / 'invalid-inputs'
                input_dir.mkdir(exist_ok=True)
                recipe_path = input_dir / (label + '.json')
                recipe_path.write_text(json.dumps(recipe) + '\n')
                stem = self.temp / 'rejected-outputs' / label / 'out'
                result = subprocess.run(self.command(fixture, stem, recipe_path), cwd=ROOT,
                                        capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(error, result.stderr)
                self.assertFalse(stem.parent.exists(), 'preflight must reject before creating output directory')
        for label, flags in [
            ('pair', ['--vertical-neighbour', str(fixture['master']), '--neighbour-name', fixture['name']]),
            ('partner-name', ['--neighbour-name', fixture['name']]),
        ]:
            with self.subTest(case=label):
                stem = self.temp / 'rejected-outputs' / label / 'out'
                result = subprocess.run(self.command(fixture, stem) + flags, cwd=ROOT,
                                        capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('cannot be combined', result.stderr)
                self.assertFalse(stem.parent.exists())


    def test_logical_output_mapping_uses_only_canonical_files_and_preserves_labels(self):
        # A disposable project makes an obsolete-tree write detectable. Copy
        # actual code and source-bound inputs; never provide a legacy fallback.
        fixture = self.fixtures['br_trim1_1']
        project = self.temp / 'mapped-project'
        caller = project / 'caller'
        caller.mkdir(parents=True)
        for relative in ('tools/texture_sheets/encode_official_maps.py',
                         'tools/texture_sheets/update_level_sheets.py',
                         'tools/craft_normals.py', 'tools/resource_paths.py',
                         'assets/layout.json'):
            source, destination = ROOT / relative, project / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            self.custody[source] = digest(source)
        layout = json.loads((project / 'assets/layout.json').read_text())
        self.assertEqual(layout['prefixes']['newer/'], 'assets/game/')
        original_label = fixture['witness']['original']
        master_label = fixture['witness']['authoringDiffuse']
        recipe_label = str(fixture['recipe_path'].relative_to(ROOT))
        self.assertTrue(master_label.startswith('newer/'))
        master_destination = project / 'assets/game' / Path(master_label).relative_to('newer')
        for source, destination in ((physical(fixture['original']), project / original_label),
                                    (physical(fixture['master']), master_destination),
                                    (fixture['recipe_path'], project / recipe_label)):
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
        self.assertFalse((project / 'newer').exists())
        cloned_encoder = project / 'tools/texture_sheets/encode_official_maps.py'

        def invoke(cwd, original, master, recipe, output, expected_stem):
            command = ['/usr/bin/python3', str(cloned_encoder), '--name', fixture['name'],
                       '--original', original, '--diffuse', master, '--height-layering', recipe,
                       '--output-stem', output, '--strength', '.2', '--cap', '.5',
                       '--normal-layout', 'channels']
            result = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            receipt_file = expected_stem.with_suffix('.json')
            receipt = json.loads(receipt_file.read_text())
            self.assertEqual(receipt['original'], original)
            self.assertEqual(receipt['authoringDiffuse'], master)
            self.assertEqual(receipt['heightLayering']['file'], recipe)
            self.assertEqual(receipt['normalRecipe'], 'layered-veneer')
            files = [receipt_file]
            for role in ROLES:
                record = receipt['outputs'][role]
                expected_label = str(Path(output).with_name(Path(output).name + '-' + role + '.webp'))
                self.assertEqual(record['file'], expected_label, 'receipt retains caller label')
                path = expected_stem.with_name(expected_stem.name + '-' + role + '.webp')
                files.append(path)
                payload = path.read_bytes()
                expected = physical(ROOT / fixture['witness']['outputs'][role]['file']).read_bytes()
                self.assertEqual(payload, expected, 'real canonical CLI payload ' + role)
                self.assertEqual(hashlib.sha256(payload).hexdigest(), record['sha256'])
                self.assertEqual((record['quality'], record['lossless']), (92, False))
                self.assertEqual(record['dimensions'], [512, 256])
                self.assertIn(b'VP8 ', payload[:64])
                self.assertNotIn(b'VP8L', payload[:64])
            self.assertFalse((project / 'newer').exists(), 'no obsolete project asset tree')
            self.assertFalse((caller / 'newer').exists(), 'no accidental caller asset tree')
            return command, files

        logical_stem = 'newer/textures/candidates-layered-output-test/logical'
        canonical_directory = project / 'assets/game/textures/candidates-layered-output-test'
        first_command, first_files = invoke(project, original_label, master_label, recipe_label,
                                            logical_stem, canonical_directory / 'logical')
        invoke(caller, '../' + original_label, '../' + master_label, '../' + recipe_label,
               '../newer/textures/candidates-layered-output-test/caller',
               canonical_directory / 'caller')
        canonical_files = sorted(path for path in canonical_directory.iterdir() if path.is_file())
        self.assertEqual(len(canonical_files), 12, 'two canonical five-map sets and two receipts')

        # Absolute external inputs/output must stay outside the disposable
        # project's central namespace, regardless of the caller directory.
        external = self.temp / 'mapped-project-external'
        external.mkdir()
        for source, leaf in ((physical(fixture['original']), 'native.png'),
                             (physical(fixture['master']), 'master.png'),
                             (fixture['recipe_path'], 'recipe.json')):
            shutil.copyfile(source, external / leaf)
        external_stem = external / 'outputs/absolute'
        invoke(caller, str(external / 'native.png'), str(external / 'master.png'),
               str(external / 'recipe.json'), str(external_stem), external_stem)
        self.assertEqual(len(list(external_stem.parent.iterdir())), 6)
        self.assertEqual(sorted(path for path in canonical_directory.iterdir() if path.is_file()),
                         canonical_files, 'external output does not add canonical resources')

        # Existing canonical payloads must be protected even though the logical
        # newer/ path does not physically exist.
        protected = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in first_files}
        refused = subprocess.run(first_command, cwd=project, capture_output=True, text=True)
        self.assertNotEqual(refused.returncode, 0)
        self.assertIn('Never overwrite prior assets', refused.stderr)
        self.assertEqual({path: hashlib.sha256(path.read_bytes()).hexdigest() for path in first_files},
                         protected)
        self.assertFalse((project / 'newer').exists())


if __name__ == '__main__':
    unittest.main()
