"""Independent public tests for the additive Quake mixed-codec entry point.

No artwork acceptance, asset writes, network or runtime binding. Expected scalar,
normal and wrapped colour samples use the existing independent public-test oracle,
never production numerical helpers. All authored fixtures and outputs are temporary.
The portable preservation gate pins seven committed shared producers. Broader
campaign custody, including inherited untracked tools, is separate evidence.
"""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

import numpy as np
import PIL
from PIL import Image, features

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / 'tools/texture_sheets/derive_quake_texture_tiers.py'
ROLES = ('diffuse', 'height', 'normalX', 'normalY', 'normalZ')
SPEC = importlib.util.spec_from_file_location('quake_independent_oracle', ROOT / 'tests/hexen2_texture_tiers_test.py')
ORACLE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ORACLE)
sha = lambda data: hashlib.sha256(data).hexdigest()
PROTECTED_FIXTURE = json.loads(
    (ROOT / 'tests/fixtures/quake_codec_protected_producers.json').read_text())
PROTECTED = {row['file']: row['sha256'] for row in PROTECTED_FIXTURE['protectedSourceBindings']}
REQUIRED_PROTECTED = {
    'tools/texture_sheets/derive_texture_tiers.py', 'tools/craft_normals.py',
    'tools/texture_sheets/prepare_texture_master.py',
    'tools/texture_sheets/finish_official_texture.py',
    'tools/texture_sheets/register_texture_boundary.py',
    'tools/texture_sheets/prepare_layered_texture_master.py',
    'tools/texture_sheets/build_texture_batch_review.py'}


def chunks(data):
    assert data[:4] == b'RIFF' and data[8:12] == b'WEBP'
    assert int.from_bytes(data[4:8], 'little') + 8 == len(data)
    kinds, at = [], 12
    while at < len(data):
        assert at + 8 <= len(data)
        kind, n = data[at:at+4], int.from_bytes(data[at+4:at+8], 'little')
        assert at + 8 + n <= len(data)
        kinds.append(kind)
        at += 8 + n + n % 2
    assert at == len(data)
    return kinds


def independent_encode(image, lossless):
    stream = io.BytesIO()
    image.save(stream, 'WEBP', quality=92, lossless=lossless, method=6)
    return stream.getvalue()


def raw_maps(rgb, height, size, strength=.3, cap=.5):
    reduced = ORACLE.float_box(height, size)
    normal = ORACLE.cyclic_normals(reduced, strength, cap)
    packed = np.round(np.clip(normal * .5 + .5, 0, 1) * 255).astype('uint8')
    images = {'diffuse': ORACLE.periodic_rgb(rgb, size),
              'height': Image.fromarray(np.round(reduced * 255).astype('uint8'))}
    images.update({role: Image.fromarray(packed[:, :, c]) for c, role in enumerate(ROLES[2:])})
    return images, reduced, normal


class QuakeTextureTiersCLI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='quake-role-public-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.original, self.master, self.height_file = [self.root / n for n in ('native.png', 'color.png', 'height.npy')]
        self.counter = 0
        self.fixture()

    def fixture(self, native=(16, 8), factor=16, dtype='float32'):
        self.native = native
        width, height = native[0] * factor, native[1] * factor
        y, x = np.mgrid[:height, :width]
        self.rgb = Image.fromarray(np.stack(((17*x+37*y) % 256,
            (11*x+3*y+47*(x%3)) % 256, (5*x+23*y+29*(y%5)) % 256), 2).astype('uint8'))
        self.rgb.save(self.master)
        self.rgb.resize(native, Image.Resampling.BOX).save(self.original)
        self.scalar = (.5 + .2*np.sin(2*np.pi*(x+.5)/width)
            + .13*np.cos(2*np.pi*(y+.5)/height)
            + .018*np.sin(2*np.pi*x/5)*np.cos(2*np.pi*y/7)).astype(dtype)
        np.save(self.height_file, self.scalar)

    def command(self, *, original=None, master=None, height=None, output=None, extra=(), cli=CLI):
        self.assertTrue(cli.is_file(), 'Quake role-aware CLI is absent; RED implementation prerequisite')
        self.counter += 1
        output = output or self.root / ('out-' + str(self.counter))
        return [sys.executable, str(cli), '--original', str(original or self.original),
                '--master', str(master or self.master), '--height-master', str(height or self.height_file),
                '--output', str(output), *extra], output

    def run_cli(self, **kw):
        command, output = self.command(**kw)
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=40, check=False)
        self.assertGreaterEqual(result.returncode, 0, 'Signal termination is not an expected rejection')
        return result, output

    def success(self, **kw):
        result, output = self.run_cli(**kw)
        self.assertEqual(result.returncode, 0, result.stderr)
        return output, json.loads((output / 'manifest.json').read_text())

    def reject(self, **kw):
        result, output = self.run_cli(**kw)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertFalse(output.exists(), 'Invalid input created an output directory')

    def test_unchanged_historical_producer_sources(self):
        self.assertEqual(PROTECTED_FIXTURE['schemaVersion'], 1)
        self.assertEqual(len(PROTECTED_FIXTURE['protectedSourceBindings']), 7)
        self.assertEqual(set(PROTECTED), REQUIRED_PROTECTED)
        for path, expected in PROTECTED.items():
            self.assertEqual(sha((ROOT / path).read_bytes()), expected, path)

    def verify_output(self, output, receipt):
        self.assertEqual(receipt['schemaVersion'], 2)
        self.assertEqual(receipt['defaultTier'], 'Mid')
        self.assertEqual(set(receipt['tiers']), {'Mid', 'High'})
        self.assertEqual(set(receipt['encodingByRole']), set(ROLES))
        tool_paths={'adapter':CLI,'sharedDeriver':CLI.with_name('derive_texture_tiers.py'),
                    'normalMath':ROOT/'tools/craft_normals.py'}
        self.assertEqual(set(receipt['tools']),set(tool_paths))
        for role,path in tool_paths.items():
            self.assertEqual(Path(receipt['tools'][role]['file']).resolve(),path)
            self.assertEqual(receipt['tools'][role]['sha256'],sha(path.read_bytes()))
        for key,value in [('Pillow',PIL.__version__),('NumPy',np.__version__),('WebP',features.version('webp'))]:
            self.assertEqual(receipt['environment'][key],value)
        self.assertIn('Not supported',receipt['maskAuthoring'])
        self.assertEqual(receipt['Low'], {'source': 'original', 'unchanged': True,
                                        'sha256': sha(self.original.read_bytes())})
        for role, path in [('original', self.original), ('master', self.master), ('heightMaster', self.height_file)]:
            self.assertEqual(Path(receipt['inputs'][role]['file']).resolve(), path)
            self.assertEqual(receipt['inputs'][role]['sha256'], sha(path.read_bytes()))
        decoded = {}
        for tier, factor in [('Mid', 4), ('High', 8)]:
            size = (self.native[0]*factor, self.native[1]*factor)
            row = receipt['tiers'][tier]
            self.assertEqual((row['factor'], row['dimensions']), (factor, list(size)))
            self.assertEqual(set(row['outputs']), set(ROLES))
            self.assertEqual(row['quantization']['bitDepth'],8)
            self.assertEqual(row['quantization']['rounding'],'NumPy ties-to-even')
            self.assertIn('full-precision',row['quantization']['height'])
            self.assertIn('clip',row['quantization']['normalXYZ'])
            self.assertIn('float32 BOX',row['quantization']['heightReduction'])
            raw, height, normal = raw_maps(self.rgb, self.scalar, size,
                                           receipt['strength'], receipt['cap'])
            decoded[tier] = {}
            for role in ROLES:
                rec = row['outputs'][role]
                rel = Path(rec['file'])
                self.assertFalse(rel.is_absolute())
                self.assertNotIn('..', rel.parts)
                payload = (output / rel).read_bytes()
                expected = independent_encode(raw[role], role != 'diffuse')
                self.assertEqual(payload, expected, tier + '/' + role + ' independent encoder replay')
                self.assertEqual((rec['sha256'], rec['bytes'], rec['dimensions']),
                                 (sha(payload), len(payload), list(size)))
                self.assertEqual(rec['sourceMaster'], 'master' if role == 'diffuse' else 'heightMaster')
                for metadata in (rec, receipt['encodingByRole'][role]):
                    self.assertEqual(metadata['lossless'], role != 'diffuse')
                    self.assertEqual(metadata['method'], 6)
                    self.assertEqual(metadata['quality'] if role == 'diffuse' else metadata['compressionEffort'], 92)
                kinds = chunks(payload)
                self.assertIn(b'VP8 ' if role == 'diffuse' else b'VP8L', kinds)
                self.assertNotIn(b'VP8L' if role == 'diffuse' else b'VP8 ', kinds)
                image = Image.open(io.BytesIO(payload)).convert('RGB')
                self.assertEqual(image.size, size)
                decoded[tier][role] = image
                layout='RGB' if role=='diffuse' else 'L'
                self.assertEqual((rec['bitDepth'],rec['pixelLayout']),(8,layout))
                self.assertEqual(rec['intendedPixelSha256'],sha(raw[role].tobytes()))
                self.assertEqual(rec['decodedPixelSha256'],sha(image.convert(layout).tobytes()))
                compression_error=np.abs(np.asarray(image,dtype=int)-np.asarray(raw[role].convert('RGB'),dtype=int))
                self.assertEqual(rec['integerCompression'],{
                    'mismatchCount':int(np.count_nonzero(compression_error)),
                    'meanAbsoluteError':float(compression_error.mean()),'maximum':int(compression_error.max())})
                if role != 'diffuse':
                    self.assertEqual(rec['intendedPixelSha256'],rec['decodedPixelSha256'])
                    self.assertEqual(rec['integerCompression'],
                                     {'mismatchCount':0,'meanAbsoluteError':0.0,'maximum':0})
                    np.testing.assert_array_equal(np.asarray(image), np.asarray(raw[role].convert('RGB')),
                                                  err_msg=tier + '/' + role + ' exact intended channels')
            # Native/2 and native/4 use BOX on both actual original and actual decoded diffuse.
            self.assertEqual({r['divisor'] for r in row['distanceChecks']}, {2, 4})
            for check in row['distanceChecks']:
                dims = (self.native[0]//check['divisor'], self.native[1]//check['divisor'])
                error = np.abs(np.asarray(Image.open(self.original).convert('RGB').resize(dims, Image.Resampling.BOX), dtype=float)
                               - np.asarray(decoded[tier]['diffuse'].resize(dims, Image.Resampling.BOX), dtype=float))
                self.assertEqual(check['dimensions'], list(dims))
                self.assertEqual(check['meanAbsoluteError'], float(error.mean()))
                self.assertEqual(check['maximum'], float(error.max()))
            # Aggregate height diagnostic must retain actual quantization error, not claim float identity.
            observed_height = np.asarray(decoded[tier]['height'], dtype=float)[:, :, 0] / 255
            self.assertEqual(row['heightQuantizationCompressionMAE'], float(np.abs(observed_height-height).mean()))
            self.assertGreater(row['heightQuantizationCompressionMAE'], 0)
            observed_normal=np.stack([np.asarray(decoded[tier][role],dtype=float)[:,:,0]
                                      for role in ROLES[2:]],2)/127.5-1
            observed_normal/=np.maximum(np.linalg.norm(observed_normal,axis=2,keepdims=True),1e-12)
            height_normal=ORACLE.cyclic_normals(observed_height,receipt['strength'],receipt['cap'])
            for key,first,second in [
                    ('authoredNormalVsDecodedXYZDegrees',normal,observed_normal),
                    ('authoredNormalVsDecodedHeightDegrees',normal,height_normal),
                    ('decodedHeightNormalVsDecodedXYZDegrees',height_normal,observed_normal)]:
                error=np.degrees(np.arccos(np.clip(np.sum(first*second,axis=2),-1,1)))
                for metric,value in [('mean',float(error.mean())),('p99',float(np.percentile(error,99))),
                                     ('maximum',float(error.max()))]:
                    self.assertAlmostEqual(row[key][metric],value,places=10)
        self.assertFalse(any(p.name.lower().startswith('low') for p in output.iterdir()))
        return decoded

    def test_both_tiers_exact_role_codecs_non_square_direct_master(self):
        paths = (self.original, self.master, self.height_file)
        before = {p: p.read_bytes() for p in paths}
        output, receipt = self.success()
        self.verify_output(output, receipt)
        self.assertEqual({p: p.read_bytes() for p in paths}, before)

    def test_float64_exact8x_and_opaque_rgba_native(self):
        self.fixture(factor=8, dtype='float64')
        original = Image.open(self.original).convert('RGBA')
        original.save(self.original)
        output, receipt = self.success()
        self.verify_output(output, receipt)
        self.assertEqual((output / receipt['tiers']['High']['outputs']['diffuse']['file']).read_bytes(),
                         ORACLE.q92(self.rgb))

    def test_quantization_ties_endpoints_and_actual_lossless_channel_hashes(self):
        self.fixture(factor=8, dtype='float64')
        values = np.array([0, .5/255, 1.5/255, 127.5/255, 128.5/255, 254.5/255, 1], dtype='float64')
        self.scalar = np.resize(values, self.scalar.shape)
        np.save(self.height_file, self.scalar)
        output, receipt = self.success()
        self.verify_output(output, receipt)
        high = receipt['tiers']['High']['outputs']['height']
        actual = np.asarray(Image.open(output / high['file']).convert('RGB'))
        expected = np.repeat(np.round(self.scalar*255).astype('uint8')[:, :, None], 3, axis=2)
        np.testing.assert_array_equal(actual, expected)

    def test_normals_do_not_use_quantized_height_and_neither_tier_chains(self):
        output, receipt = self.success()
        decoded = self.verify_output(output, receipt)
        mid, high = decoded['Mid']['diffuse'], decoded['High']['diffuse']
        self.assertNotEqual((output / receipt['tiers']['Mid']['outputs']['diffuse']['file']).read_bytes(),
                            ORACLE.q92(ORACLE.periodic_rgb(high, mid.size)))
        self.assertNotEqual((output / receipt['tiers']['High']['outputs']['diffuse']['file']).read_bytes(),
                            ORACLE.q92(mid.resize(high.size, Image.Resampling.LANCZOS)))
        for tier in ('Mid', 'High'):
            quantized = np.asarray(decoded[tier]['height'], dtype=float)[:, :, 0] / 255
            wrong = np.round(np.clip(ORACLE.cyclic_normals(quantized)*.5+.5, 0, 1)*255).astype('uint8')
            self.assertTrue(any(not np.array_equal(np.asarray(decoded[tier][role])[:, :, 0], wrong[:, :, c])
                                for c, role in enumerate(ROLES[2:])),
                            tier + ' normals must originate before height8 quantization')

    def test_rejects_transparency_bad_master_scalar_and_parameters_before_writes(self):
        cases = []
        transparent = self.root/'transparent.png'
        Image.open(self.original).convert('RGBA').save(transparent)
        im = Image.open(transparent); im.putpixel((0, 0), (0, 0, 0, 254)); im.save(transparent)
        cases.append(('transparent', {'original': transparent}))
        for label, image in [('small', self.rgb.resize((64, 32))),
                             ('aspect', self.rgb.resize((256, 127))),
                             ('RGBA-master', self.rgb.convert('RGBA'))]:
            p = self.root/(label+'.png'); image.save(p); cases.append((label, {'master':p}))
        cases.append(('missing', {'master': self.root/'absent.png'}))
        for label, array in [('nan', np.full(self.scalar.shape, np.nan, 'float32')),
                ('inf', np.full(self.scalar.shape, np.inf, 'float32')),
                ('negative', np.full(self.scalar.shape, -.1, 'float32')),
                ('large', np.full(self.scalar.shape, 1.1, 'float32')),
                ('shape', np.full((127, 256), .5, 'float32')),
                ('integer', np.full(self.scalar.shape, 1, 'uint8')),
                ('fortran', np.asfortranarray(self.scalar)),
                ('channels', self.scalar[:, :, None])]:
            p = self.root/(label+'.npy'); np.save(p, array); cases.append((label, {'height':p}))
        trailing=self.root/'trailing.npy'; trailing.write_bytes(self.height_file.read_bytes()+b'x')
        cases.append(('trailing', {'height':trailing}))
        cases.append(('same-path', {'original':self.master}))
        for label, kw in cases:
            with self.subTest(case=label): self.reject(**kw)
        for extra in [('--strength','nan'),('--strength','0'),('--cap','inf'),('--cap','0')]:
            with self.subTest(parameters=extra): self.reject(extra=extra)

    def test_existing_directory_and_symlink_outputs_are_preserved(self):
        output, _ = self.success()
        before = {p.relative_to(output): p.read_bytes() for p in output.rglob('*') if p.is_file()}
        result, _ = self.run_cli(output=output)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(before, {p.relative_to(output):p.read_bytes() for p in output.rglob('*') if p.is_file()})
        existing=self.root/'occupied'; existing.mkdir(); (existing/'keep').write_bytes(b'preserve')
        link=self.root/'link'; link.symlink_to(existing, target_is_directory=True)
        for target in (existing, link):
            result, _ = self.run_cli(output=target); self.assertNotEqual(result.returncode, 0)
            self.assertEqual((existing/'keep').read_bytes(), b'preserve')
            self.assertEqual([p.name for p in existing.iterdir()], ['keep'])
        dangling=self.root/'dangling'; dangling.symlink_to(self.root/'nonexistent')
        result, _ = self.run_cli(output=dangling); self.assertNotEqual(result.returncode, 0)
        self.assertTrue(dangling.is_symlink()); self.assertFalse((self.root/'nonexistent').exists())

    def test_explicit_encoder_roles_preserve_scalar_bytes_and_reject_modes(self):
        self.assertTrue(CLI.is_file(), 'Quake role-aware CLI absent')
        spec=importlib.util.spec_from_file_location('quake_public_encoder',CLI)
        module=importlib.util.module_from_spec(spec)
        sys.path.insert(0,str(CLI.parent))
        try: spec.loader.exec_module(module)
        finally: sys.path.pop(0)
        scalar=Image.fromarray(np.array([[0,1,2,127,128,129,254,255]],dtype='uint8'))
        for role in (*ROLES[1:], 'mask'):
            data=module.encode_role(scalar,role)
            self.assertEqual(data,independent_encode(scalar,True))
            self.assertIn(b'VP8L',chunks(data))
            np.testing.assert_array_equal(np.asarray(Image.open(io.BytesIO(data)).convert('RGB')),
                                          np.asarray(scalar.convert('RGB')))
            for invalid in (scalar.convert('RGB'),scalar.convert('RGBA')):
                with self.subTest(role=role,mode=invalid.mode):
                    with self.assertRaises(ValueError): module.encode_role(invalid,role)
        self.assertEqual(module.encode_role(self.rgb,'diffuse'),ORACLE.q92(self.rgb))
        for role, image in [('unknown',scalar),('Height',scalar),('normalXYZ',scalar),
                            ('diffuse',scalar),('diffuse',self.rgb.convert('RGBA'))]:
            with self.subTest(role=role,mode=image.mode):
                with self.assertRaises(ValueError): module.encode_role(image,role)

    def test_input_and_imported_producer_changes_are_detected_before_manifest(self):
        # Mutate only temporary fixtures/copies after public output creation proves
        # input validation has completed. Large colour encoding keeps this phase
        # observable; no production source is edited or monkeypatched.
        self.fixture(native=(64,32),factor=16)
        for target_role in ('original','master','height','producer'):
            with self.subTest(changed=target_role):
                target={'original':self.original,'master':self.master,'height':self.height_file}.get(target_role)
                cli=CLI
                if target_role=='producer':
                    copied=self.root/'copy'/'tools'/'texture_sheets'; copied.mkdir(parents=True)
                    for source in (CLI,CLI.with_name('derive_texture_tiers.py')):
                        self.assertTrue(source.is_file(),'Quake CLI absent'); shutil.copy2(source,copied/source.name)
                    shutil.copy2(ROOT/'tools/craft_normals.py',copied.parent/'craft_normals.py')
                    shutil.copy2(ROOT/'tools/resource_paths.py',copied.parent/'resource_paths.py')
                    copied_assets=copied.parent.parent/'assets';copied_assets.mkdir()
                    shutil.copy2(ROOT/'assets/layout.json',copied_assets/'layout.json')
                    cli=copied/CLI.name; target=copied/'derive_texture_tiers.py'
                original_bytes=target.read_bytes()
                command,output=self.command(cli=cli)
                process=subprocess.Popen(command,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                try:
                    deadline=time.monotonic()+15
                    while not output.exists() and process.poll() is None and time.monotonic()<deadline:
                        time.sleep(.001)
                    self.assertTrue(output.is_dir(),'Did not observe public output validation boundary')
                    self.assertIsNone(process.poll(),'Fixture finished before source-watch test could execute')
                    target.write_bytes(original_bytes+b'\n')
                    stdout,stderr=process.communicate(timeout=40)
                    self.assertGreaterEqual(process.returncode,0)
                    self.assertNotEqual(process.returncode,0,stdout+stderr)
                    self.assertFalse((output/'manifest.json').exists(),'Changed input/tool published a success manifest')
                finally:
                    if process.poll() is None: process.kill();process.communicate()
                    target.write_bytes(original_bytes)


if __name__ == '__main__':
    unittest.main(verbosity=2)
