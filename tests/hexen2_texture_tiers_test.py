"""Public CLI tests for shared one-master Quake/Hexen Mid/High derivation.
No runtime binding, network, gameplay or artistic acceptance. Use the bundled
Python runtime (Pillow/Numpy); all fixture and output files are temporary.
"""
import hashlib
import inspect
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / 'tools/texture_sheets/derive_texture_tiers.py'
ROLES = ('diffuse', 'height', 'normalX', 'normalY', 'normalZ')
sha = lambda b: hashlib.sha256(b).hexdigest()


def q92(im):
    stream = io.BytesIO()
    im.save(stream, 'WEBP', quality=92, lossless=False, method=6)
    return stream.getvalue()


def periodic_rgb(im, size):
    if im.size == size:
        return im.copy()
    # Independent fixture oracle: actual periodic source cells, shared phase.
    big = Image.new('RGB', (im.width * 3, im.height * 3))
    for y in range(3):
        for x in range(3):
            big.paste(im, (x * im.width, y * im.height))
    big = big.resize((size[0] * 3, size[1] * 3), Image.Resampling.LANCZOS)
    return big.crop((size[0], size[1], size[0] * 2, size[1] * 2))


def float_box(height, size):
    h, w = height.shape
    if (w, h) == size:
        return height.astype(np.float64)
    return np.asarray(Image.fromarray(height.astype('float32')).resize(
        size, Image.Resampling.BOX), dtype=np.float64)


def cyclic_normals(height, strength=.3, cap=.5):
    """Independent weighted cyclic derivative, preserving producer op ordering.

    Keeping the documented summation order avoids an IEEE754 127.5 encoding
    tie becoming a false byte-replay failure. No production helper is called.
    """
    h, w = height.shape
    p = np.pad(height, ((1, 1), (1, 1)), mode='wrap')
    east, west = p[1:-1, 2:], p[1:-1, :-2]
    south, north = p[2:, 1:-1], p[:-2, 1:-1]
    gx = (3 * (east - west) + (p[:-2, 2:] + p[2:, 2:]
          - p[:-2, :-2] - p[2:, :-2])) / 10 * .5
    gy = (3 * (south - north) + (p[2:, :-2] + p[2:, 2:]
          - p[:-2, :-2] - p[:-2, 2:])) / 10 * .5
    scale = strength * np.sqrt(h * w) / 8
    sx, sy = -gx * scale, -gy * scale
    magnitude = np.sqrt(sx * sx + sy * sy)
    soft = 1 / np.sqrt(1 + (magnitude / cap) ** 2)
    sx *= soft
    sy *= soft
    length = np.sqrt(sx * sx + sy * sy + 1)
    return np.stack((sx / length, sy / length, 1 / length), axis=2)


def vp8_only(data):
    assert data[:4] == b'RIFF' and data[8:12] == b'WEBP'
    assert int.from_bytes(data[4:8], 'little') + 8 == len(data)
    kinds = []
    at = 12
    while at < len(data):
        kind, n = data[at:at + 4], int.from_bytes(data[at + 4:at + 8], 'little')
        assert at + 8 + n <= len(data)
        kinds.append(kind)
        at += 8 + n + n % 2
    assert at == len(data) and b'VP8 ' in kinds and b'VP8L' not in kinds


class HexenTextureTiersCLI(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='hexen-two-tier-public-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.original, self.master = self.root / 'native.png', self.root / 'master.png'
        self.height_file = self.root / 'height.npy'
        self.width, self.height = 16, 8
        y, x = np.mgrid[:128, :256]
        # Non-square master16x with both retained coarse form and fine signal.
        rgb = np.stack(((17*x+37*y) % 256, (11*x+3*y+47*(x%3)) % 256,
                        (5*x+23*y+29*(y%5)) % 256), axis=2).astype('uint8')
        self.rgb = Image.fromarray(rgb)
        self.rgb.save(self.master)
        self.rgb.resize((16, 8), Image.Resampling.BOX).save(self.original)
        self.raw_height = (.5 + .2*np.sin(2*np.pi*(x+.5)/256)
                           + .13*np.cos(2*np.pi*(y+.5)/128)
                           + .018*np.sin(2*np.pi*x/5)*np.cos(2*np.pi*y/7)).astype('float32')
        np.save(self.height_file, self.raw_height)
        self.source_paths = (self.original, self.master, self.height_file)
        self.counter = 0

    def run_cli(self, *, original=None, master=None, height=None, output=None, extra=()):
        self.counter += 1
        output = output or self.root / ('output-' + str(self.counter))
        args = [sys.executable, str(CLI), '--original', str(original or self.original),
                '--master', str(master or self.master), '--height-master', str(height or self.height_file),
                '--output', str(output), *extra]
        result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                                timeout=25, check=False)
        self.assertIsInstance(result.returncode, int)
        self.assertGreaterEqual(result.returncode, 0, 'A signal cannot count as expected rejection')
        return result, output

    def success(self, **kw):
        result, output = self.run_cli(**kw)
        self.assertEqual(result.returncode, 0, result.stderr)
        return output, json.loads((output / 'manifest.json').read_text())

    def test_all_ten_outputs_direct_master_exact_q92_and_distance(self):
        before = {p: p.read_bytes() for p in self.source_paths}
        output, receipt = self.success()
        self.assertEqual(receipt['schemaVersion'], 1)
        self.assertEqual(receipt['defaultTier'], 'Mid')
        self.assertEqual(set(receipt['tiers']), {'Mid', 'High'})
        self.assertEqual((receipt['strength'], receipt['cap']), (.3, .5))
        self.assertEqual(receipt['Low'], {'source': 'original', 'unchanged': True, 'sha256': sha(before[self.original])})
        self.assertEqual(receipt['tools']['deriverSha256'], sha(CLI.read_bytes()))
        self.assertEqual(receipt['tools']['normalMathSha256'], sha((ROOT / 'tools/craft_normals.py').read_bytes()))
        for key, path, dims in [('original', self.original, [16, 8]),
                                ('master', self.master, [256, 128]),
                                ('heightMaster', self.height_file, [256, 128])]:
            record = receipt['inputs'][key]
            self.assertEqual(Path(record['file']).resolve(), path)
            self.assertEqual(record['sha256'], sha(before[path]))
            self.assertEqual(record['dimensions'], dims)
        for tier, factor in [('Mid', 4), ('High', 8)]:
            row = receipt['tiers'][tier]
            size = (16 * factor, 8 * factor)
            self.assertEqual(row['factor'], factor)
            self.assertEqual(row['dimensions'], list(size))
            self.assertEqual(set(row['outputs']), set(ROLES))
            h = float_box(self.raw_height, size)
            # An independent integer-footprint mean catches pre-BOX quantization.
            bh, bw = 128 // size[1], 256 // size[0]
            exact_average = self.raw_height.astype('float64').reshape(size[1], bh, size[0], bw).mean(axis=(1, 3))
            np.testing.assert_allclose(h, exact_average, rtol=0, atol=8e-8)
            normal = cyclic_normals(h)
            normal_bytes = np.round(np.clip(normal * .5 + .5, 0, 1) * 255).astype('uint8')
            expected = {'diffuse': q92(periodic_rgb(self.rgb, size)),
                        'height': q92(Image.fromarray(np.round(h * 255).astype('uint8')))}
            for channel, role in enumerate(ROLES[2:]):
                expected[role] = q92(Image.fromarray(normal_bytes[:, :, channel]))
            for role in ROLES:
                rec = row['outputs'][role]
                rel = Path(rec['file'])
                self.assertFalse(rel.is_absolute())
                self.assertNotIn('..', rel.parts)
                payload = (output / rel).read_bytes()
                self.assertEqual(payload, expected[role], tier + '/' + role)
                self.assertEqual(rec['sha256'], sha(payload))
                self.assertEqual(rec['bytes'], len(payload))
                self.assertEqual(rec['dimensions'], list(size))
                self.assertEqual(rec['sourceMaster'], 'master' if role == 'diffuse' else 'heightMaster')
                self.assertEqual((rec['quality'], rec['method'], rec['lossless']), (92, 6, False))
                vp8_only(payload)
                self.assertEqual(Image.open(io.BytesIO(payload)).size, size)
            self.assertEqual(row['normalSource'], 'Uncompressed height master reduced directly to tier')
            decoded_normal = np.stack([np.asarray(Image.open(io.BytesIO(expected[role])).convert('RGB'), dtype=float)[:, :, 0]
                                       for role in ROLES[2:]], axis=2) / 127.5 - 1
            decoded_normal /= np.maximum(np.linalg.norm(decoded_normal, axis=2, keepdims=True), 1e-12)
            decoded_height = np.asarray(Image.open(io.BytesIO(expected['height'])).convert('RGB'), dtype=float)[:, :, 0] / 255
            self.assertEqual(row['heightQuantizationCompressionMAE'], float(np.abs(decoded_height - h).mean()))
            height_normal = cyclic_normals(decoded_height)
            for key, first, second in [('authoredNormalVsDecodedXYZDegrees', normal, decoded_normal),
                                       ('decodedHeightNormalVsDecodedXYZDegrees', height_normal, decoded_normal),
                                       ('authoredNormalVsDecodedHeightDegrees', normal, height_normal)]:
                angles = np.degrees(np.arccos(np.clip(np.sum(first * second, axis=2), -1, 1)))
                for metric, value in [('mean', float(angles.mean())), ('p99', float(np.percentile(angles, 99))), ('maximum', float(angles.max()))]:
                    self.assertAlmostEqual(row[key][metric], value, places=10)
            diffuse = Image.open(io.BytesIO(expected['diffuse'])).convert('RGB')
            source = Image.open(self.original).convert('RGB')
            self.assertEqual(len(row['distanceChecks']), 2)
            for distance in row['distanceChecks']:
                divisor = distance['divisor']
                self.assertIn(divisor, (2, 4))
                dims = (16 // divisor, 8 // divisor)
                error = np.abs(np.asarray(source.resize(dims, Image.Resampling.BOX), dtype=float)
                               - np.asarray(diffuse.resize(dims, Image.Resampling.BOX), dtype=float))
                self.assertEqual(distance['dimensions'], list(dims))
                self.assertEqual(distance['meanAbsoluteError'], float(error.mean()))
                self.assertEqual(distance['maximum'], float(error.max()))
        self.assertEqual({p: p.read_bytes() for p in self.source_paths}, before)
        self.assertFalse(any(p.name.lower().startswith('low') for p in output.rglob('*')))

    def test_real_outputs_reject_compressed_chaining_and_height_transcode(self):
        output, receipt = self.success()
        def im(tier, role):
            return Image.open(output / receipt['tiers'][tier]['outputs'][role]['file']).convert('RGB')
        mid, high = im('Mid', 'diffuse'), im('High', 'diffuse')
        midbytes = (output / receipt['tiers']['Mid']['outputs']['diffuse']['file']).read_bytes()
        highbytes = (output / receipt['tiers']['High']['outputs']['diffuse']['file']).read_bytes()
        self.assertNotEqual(midbytes, q92(periodic_rgb(high, mid.size)), 'Mid must not transcode High')
        self.assertNotEqual(highbytes, q92(mid.resize(high.size, Image.Resampling.LANCZOS)), 'High must not upscale Mid')
        for tier in ('Mid', 'High'):
            compressed_h = np.asarray(im(tier, 'height'), dtype=float)[:, :, 0] / 255
            wrong = cyclic_normals(compressed_h)
            wrong = np.round(np.clip(wrong * .5 + .5, 0, 1) * 255).astype('uint8')
            self.assertTrue(any((output / receipt['tiers'][tier]['outputs'][role]['file']).read_bytes()
                                != q92(Image.fromarray(wrong[:, :, c]))
                                for c, role in enumerate(ROLES[2:])),
                            'Normals must not use decoded compressed height at ' + tier)

    def test_scale_invariant_interior_gradient(self):
        y, x = np.mgrid[:128, :256]
        ramp = (.05 + .45*(x+.5)/256 + .45*(y+.5)/128).astype('float32')
        np.save(self.height_file, ramp)
        output, receipt = self.success()
        centers = []
        for tier, size in [('Mid', (64, 32)), ('High', (128, 64))]:
            raw_normal = cyclic_normals(float_box(ramp, size))
            center = raw_normal[size[1]//4:3*size[1]//4, size[0]//4:3*size[0]//4]
            centers.append(center.mean(axis=(0, 1)))
            arrays = [np.asarray(Image.open(output / receipt['tiers'][tier]['outputs'][role]['file']).convert('RGB'), dtype=float)[:, :, 0]
                      for role in ROLES[2:]]
            n = np.stack(arrays, axis=2) / 127.5 - 1
            n /= np.linalg.norm(n, axis=2, keepdims=True)
            observed = n[size[1]//4:3*size[1]//4, size[0]//4:3*size[0]//4].mean(axis=(0, 1))
            np.testing.assert_allclose(observed, centers[-1], rtol=0, atol=.012)
        np.testing.assert_allclose(centers[0], centers[1], rtol=0, atol=3e-8)

    def test_rejects_invalid_inputs_before_any_output(self):
        cases = []
        small = self.root / 'small.png'; self.rgb.resize((64, 32)).save(small)
        aspect = self.root / 'aspect.png'; self.rgb.resize((256, 127)).save(aspect)
        cases += [('small', {'master': small}), ('aspect', {'master': aspect}),
                  ('missing', {'master': self.root / 'absent.png'})]
        for name, values in [('nan', np.full((128, 256), np.nan, 'float32')),
                             ('inf', np.full((128, 256), np.inf, 'float32')),
                             ('negative', np.full((128, 256), -.01, 'float32')),
                             ('large', np.full((128, 256), 1.01, 'float32')),
                             ('shape', np.full((127, 256), .5, 'float32')),
                             ('integer', np.full((128, 256), 1, 'uint8')),
                             ('channels', np.full((128, 256, 1), .5, 'float32'))]:
            path = self.root / (name + '.npy'); np.save(path, values); cases.append((name, {'height': path}))
        for name, kw in cases:
            with self.subTest(name=name):
                result, output = self.run_cli(**kw)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(output.exists(), 'Invalid input must not partially publish ' + name)
        for args in [('--strength', 'nan'), ('--strength', '-1'), ('--cap', 'inf'), ('--cap', '0')]:
            result, output = self.run_cli(extra=args)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())

    def test_exact_eight_x_and_float64_height_supported_existing_output_preserved(self):
        self.rgb.resize((128, 64)).save(self.master)
        np.save(self.height_file, float_box(self.raw_height, (128, 64)).astype('float64'))
        source = Image.open(self.master).convert('RGB')
        output, receipt = self.success()
        self.assertEqual((output / receipt['tiers']['High']['outputs']['diffuse']['file']).read_bytes(), q92(source))
        before = {p.relative_to(output): p.read_bytes() for p in output.rglob('*') if p.is_file()}
        result, _ = self.run_cli(output=output)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(before, {p.relative_to(output): p.read_bytes() for p in output.rglob('*') if p.is_file()})
        sentinel = self.root / 'occupied'; sentinel.mkdir(); (sentinel / 'keep').write_bytes(b'preserve')
        result, _ = self.run_cli(output=sentinel)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list(sentinel.iterdir()), [sentinel / 'keep'])
        self.assertEqual((sentinel / 'keep').read_bytes(), b'preserve')

    def test_craft_opt_in_full_precision_preserves_old_default(self):
        sys.path.insert(0, str(ROOT / 'tools'))
        from craft_normals import craft, profile_for
        self.assertIn('quantize_height', inspect.signature(craft).parameters)
        rgb = np.asarray(self.rgb, dtype=float) / 255
        profile = profile_for('stone-test')
        old, _ = craft(rgb, profile)
        explicit, _ = craft(rgb, profile, quantize_height=True)
        raw, _ = craft(rgb, profile, quantize_height=False)
        np.testing.assert_array_equal(old, explicit)
        self.assertTrue(np.allclose(old * 255, np.round(old * 255), atol=1e-12, rtol=0))
        self.assertGreater(float(np.max(np.abs(raw * 255 - np.round(raw * 255)))), .01)
        self.assertEqual(raw.shape, self.raw_height.shape)
        self.assertTrue(np.isfinite(raw).all())
        self.assertGreaterEqual(float(raw.min()), 0)
        self.assertLessEqual(float(raw.max()), 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
