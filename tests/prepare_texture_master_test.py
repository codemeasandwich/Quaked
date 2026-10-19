"""Independent public CLI checks for one-master photographic preparation.

Only synthetic temporary fixtures. Tests exercise the CLI, retain producer
dependencies as dependencies, and do not import the new implementation.
Neither native art quality nor service-side generation count is established.
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
CLI = ROOT / 'tools/texture_sheets/prepare_texture_master.py'
sha = lambda b: hashlib.sha256(b).hexdigest()


class PrepareTextureMasterCLI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='prepare-master-public-')
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name).resolve()
        self.original = self.dir / 'native.png'
        self.generated = self.dir / 'retained-generated.png'
        self.prompt = self.dir / 'exact-prompt.txt'
        y, x = np.mgrid[:64, :128]
        rgb = np.stack((45 + (x * 3 + y * 7) % 100,
                        34 + (x * 5 + y * 2) % 91,
                        22 + (x * 11 + y * 3) % 77), axis=2).astype('uint8')
        Image.fromarray(rgb).save(self.generated)
        Image.fromarray(rgb).resize((16, 8), Image.Resampling.BOX).save(self.original)
        self.prompt.write_text('Photographic stone, preserve two courses and native edge cuts.\n', encoding='utf8')
        self.original_sources = {p: p.read_bytes() for p in (self.original, self.generated, self.prompt)}
        self.counter = 0

    def run_cli(self, *, original=None, generated=None, prompt=None, output=None, extra=()):
        self.counter += 1
        output = output or self.dir / ('out-' + str(self.counter))
        result = subprocess.run([sys.executable, str(CLI), '--original', str(original or self.original),
            '--generated', str(generated or self.generated), '--prompt', str(prompt or self.prompt),
            '--name', 'native_fixture', '--edition', 'base', '--profile', 'stone',
            '--output', str(output), *extra], cwd=ROOT, capture_output=True, text=True,
            timeout=30, check=False)
        self.assertIsInstance(result.returncode, int)
        self.assertGreaterEqual(result.returncode, 0, 'Signal termination is not an expected rejection')
        for p, before in self.original_sources.items():
            self.assertEqual(p.read_bytes(), before, 'Input changed: ' + str(p))
        return result, output

    def success(self, **kwargs):
        result, output = self.run_cli(**kwargs)
        self.assertEqual(result.returncode, 0, result.stderr)
        return output, json.loads((output / 'master.json').read_text())

    def reject(self, **kwargs):
        result, output = self.run_cli(**kwargs)
        self.assertGreater(result.returncode, 0, 'Invalid input was accepted')
        self.assertFalse(output.exists(), 'Rejection created a partial output package')

    def fixture(self, name, size=(128, 64), mode='RGB', format='PNG'):
        p = self.dir / name
        Image.new(mode, size, (90, 70, 45, 255) if mode == 'RGBA' else (90, 70, 45)).save(p, format=format)
        return p

    def landmarks(self, name, data):
        p = self.dir / name
        p.write_text(json.dumps(data))
        return p

    def test_canonical_single_lossless_rgb_and_full_precision_height_source_bound(self):
        output, rec = self.success()
        self.assertEqual({p.name for p in output.iterdir()}, {'color.png', 'height.npy', 'master.json'})
        self.assertEqual(rec['schemaVersion'], 1)
        self.assertEqual((rec['name'], rec['edition'], rec['generationCount']), ('native_fixture', 'base', 1))
        self.assertEqual(rec['canonicalMasterFactor'], 8)
        self.assertEqual(rec['nativeDimensions'], [16, 8])
        self.assertEqual(rec['masterDimensions'], [128, 64])
        self.assertEqual(rec['generatedDimensions'], [128, 64])
        self.assertEqual(set(rec['tools']), {'prepare', 'finish', 'derive', 'craft'})
        for key, p in [('prepare', CLI), ('finish', ROOT / 'tools/texture_sheets/finish_official_texture.py'),
                       ('derive', ROOT / 'tools/texture_sheets/derive_texture_tiers.py'),
                       ('craft', ROOT / 'tools/craft_normals.py')]:
            self.assertEqual(Path(rec['tools'][key]['file']).resolve(), p)
            self.assertEqual(rec['tools'][key]['sha256'], sha(p.read_bytes()))
        self.assertEqual(rec['environment']['executable'], sys.executable)
        for role, p in [('original', self.original), ('generated', self.generated), ('prompt', self.prompt)]:
            row = rec['inputs'][role]
            recorded = Path(row['file'])
            self.assertEqual((recorded if recorded.is_absolute() else ROOT / recorded).resolve(), p)
            self.assertEqual(row['sha256'], sha(p.read_bytes()))
        color = Image.open(output / rec['color']['file'])
        self.assertEqual((color.format, color.mode, color.size), ('PNG', 'RGB', (128, 64)))
        height_path = output / rec['height']['file']
        h = np.load(height_path, allow_pickle=False)
        self.assertEqual(h.dtype, np.dtype('float32'))
        self.assertEqual(h.shape, (64, 128))
        self.assertTrue(np.isfinite(h).all())
        self.assertGreaterEqual(h.min(), 0)
        self.assertLessEqual(h.max(), 1)
        self.assertTrue(np.any(np.abs(h * 255 - np.round(h * 255)) > 1e-5), 'Height was prematurely quantized')
        self.assertIs(rec['height']['authoredOnce'], True)
        self.assertIs(rec['height']['quantizedTo8Bit'], False)
        self.assertEqual(rec['height']['uniqueSamples'], np.unique(h).size)
        # Existing craft dependency is the contractual relief authoring path;
        # replaying it checks that CLI did not use an 8-bit or tier source.
        sys.path.insert(0, str(ROOT / 'tools'))
        from craft_normals import craft
        expected, _ = craft(np.asarray(color, dtype=float) / 255,
                            rec['height']['profile'], quantize_height=False)
        np.testing.assert_array_equal(h, expected.astype('float32'))
        for role in ('color', 'height'):
            self.assertEqual(rec[role]['sha256'], sha((output / rec[role]['file']).read_bytes()))
        self.assertNotIn('tiers', rec)
        self.assertFalse(any(output.rglob('*.webp')), 'Preparation must not author a tier')

    def test_larger_retained_source_downsamples_once_to_eight_native(self):
        raw = self.dir / 'large-generated.png'
        Image.open(self.generated).resize((256, 128), Image.Resampling.BICUBIC).save(raw)
        before = raw.read_bytes()
        output, rec = self.success(generated=raw)
        self.assertEqual(rec['generatedDimensions'], [256, 128])
        with Image.open(output / 'color.png') as color:
            self.assertEqual(color.size, (128, 64))
        self.assertEqual(np.load(output / 'height.npy', allow_pickle=False).shape, (64, 128))
        self.assertEqual(raw.read_bytes(), before)

    def test_measured_registration_axes_are_bound_without_separate_tier_authorship(self):
        for axis, end in [('x', 16), ('y', 8)]:
            with self.subTest(axis=axis):
                points = [[0, 0], [end / 2, end * .375], [end, end]]
                lm = self.landmarks(axis + '.json', {'axis': axis, 'points': points})
                before = lm.read_bytes()
                output, rec = self.success(extra=('--landmarks', str(lm)))
                self.assertEqual(rec['inputs']['landmarks']['sha256'], sha(before))
                self.assertEqual(rec['registration']['verticalLandmarks'], points)
                self.assertEqual(rec['registration']['axis'], axis)
                self.assertEqual(rec['registration']['factor'], 8)
                self.assertEqual(lm.read_bytes(), before)
                self.assertEqual({p.name for p in output.iterdir()}, {'color.png', 'height.npy', 'master.json'})
                # Verify actual orientation, rather than trusting a receipt's
                # landmark declaration. The existing finisher is not the CLI
                # implementation under test.
                sys.path.insert(0, str(ROOT / 'tools/texture_sheets'))
                from finish_official_texture import finish
                original, generated = Image.open(self.original), Image.open(self.generated)
                if axis == 'x':
                    original = original.transpose(Image.Transpose.TRANSPOSE)
                    generated = generated.transpose(Image.Transpose.TRANSPOSE)
                expected, _ = finish(original, generated, factor=8, vertical_landmarks=points,
                                     comparison_divisor=2, method='photographic', color_strength=.65,
                                     field_sigma=.75)
                if axis == 'x': expected = expected.transpose(Image.Transpose.TRANSPOSE)
                self.assertEqual(Image.open(output / 'color.png').tobytes(), expected.tobytes())

    def test_existing_package_or_file_never_overwritten(self):
        output, _ = self.success()
        before = {p.relative_to(output): p.read_bytes() for p in output.rglob('*') if p.is_file()}
        result, _ = self.run_cli(output=output)
        self.assertGreater(result.returncode, 0)
        self.assertEqual({p.relative_to(output): p.read_bytes() for p in output.rglob('*') if p.is_file()}, before)
        existing = self.dir / 'existing-file'; existing.write_bytes(b'protected owner evidence')
        result, _ = self.run_cli(output=existing)
        self.assertGreater(result.returncode, 0)
        self.assertEqual(existing.read_bytes(), b'protected owner evidence')
        empty = self.dir / 'existing-empty'; empty.mkdir()
        result, _ = self.run_cli(output=empty)
        self.assertGreater(result.returncode, 0)
        self.assertEqual(list(empty.iterdir()), [])
        target = self.dir / 'absent-symlink-target'
        dangling = self.dir / 'dangling-output'; dangling.symlink_to(target)
        result, _ = self.run_cli(output=dangling)
        self.assertGreater(result.returncode, 0)
        self.assertTrue(dangling.is_symlink())
        self.assertFalse(target.exists())

    def test_source_dimensions_modes_and_formats_rejected_before_output(self):
        cases = [('small.png', (64, 32), 'RGB', 'PNG'),
                 ('wrong-aspect.png', (128, 128), 'RGB', 'PNG'),
                 ('alpha.png', (128, 64), 'RGBA', 'PNG'),
                 ('lossy.jpg', (128, 64), 'RGB', 'JPEG')]
        for name, size, mode, fmt in cases:
            with self.subTest(name=name):
                self.reject(generated=self.fixture(name, size, mode, fmt))
        self.reject(generated=self.dir / 'missing.png')
        self.reject(original=self.fixture('native-nondivisible.png', (18, 8)),
                    generated=self.fixture('raw-nondivisible.png', (144, 64)))
        self.reject(original=self.fixture('native-too-small.png', (4, 8)),
                    generated=self.fixture('raw-small-native.png', (32, 64)))

    def test_bad_prompt_and_nonfinite_parameters_rejected_before_output(self):
        for name, data in [('empty.txt', b''), ('blank.txt', b' \n\t'),
                           ('invalid.txt', b'\xff\xfe'), ('oversized.txt', b'x' * (65536 + 1))]:
            p = self.dir / name; p.write_bytes(data)
            with self.subTest(prompt=name): self.reject(prompt=p)
        self.reject(prompt=self.dir / 'missing-prompt.txt')
        for flag, value in [('--color-strength', 'nan'), ('--color-strength', '1.1'),
                            ('--field-sigma', 'inf'), ('--field-sigma', '.1'),
                            ('--strength', 'nan'), ('--strength', '-1'),
                            ('--cap', 'inf'), ('--cap', '0')]:
            with self.subTest(flag=flag, value=value): self.reject(extra=(flag, value))

    def test_landmark_errors_rejected_before_output(self):
        cases = [{'axis': 'z', 'points': [[0, 0], [16, 16]]},
                 {'axis': 'x', 'points': [[1, 0], [16, 16]]},
                 {'axis': 'x', 'points': [[0, 0], [16, 15]]},
                 {'axis': 'x', 'points': [[0, 0], [10, 8], [8, 12], [16, 16]]},
                 {'axis': 'x', 'points': [[0, 0], [8, 17], [16, 16]]},
                 {'axis': 'x', 'points': [[0, 0], [8, float('nan')], [16, 16]]},
                 {'axis': 'x', 'points': [[0, 0]]}, {'axis': 'x'}, [], None]
        for i, value in enumerate(cases):
            p = self.landmarks('bad-' + str(i) + '.json', value)
            with self.subTest(case=i): self.reject(extra=('--landmarks', str(p)))
        p = self.dir / 'malformed.json'; p.write_text('{')
        self.reject(extra=('--landmarks', str(p)))
        self.reject(extra=('--landmarks', str(self.dir / 'missing-landmarks.json')))

    def test_no_mid_high_or_generation_controls_in_preparation_interface(self):
        for extra in [('--factor', '4'), ('--mid', '4'), ('--high', '8'), ('--generate', 'true')]:
            with self.subTest(extra=extra): self.reject(extra=extra)


if __name__ == '__main__':
    unittest.main(verbosity=2)
