"""Public regressions for same-source layered boundary registration.

Only isolated synthetic fixtures are authored. Existing independently defined
Poisson/layer oracles check orientation and precision, not the new adapter's
implementation helpers. Native no-clobber publication is also exercised directly
against destinations that appear after initial validation.
"""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np
from PIL import Image

from texture_boundary_registration_test import periodic_y_oracle
from texture_layered_master_test import independent_composition
from hexen2_texture_tiers_test import q92, periodic_rgb, float_box, cyclic_normals

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT/'tools/texture_sheets'
CLI = TOOLS/'register_layered_texture_boundary.py'
sha = lambda b: hashlib.sha256(b).hexdigest()


class LayeredBoundaryCLI(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='layered-boundary-public-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.count = 0
        self.package, self.recipe = self.fixture('anisotropic')

    def command(self, script, *args):
        result = subprocess.run([sys.executable, str(TOOLS/script), *map(str, args)],
            cwd=ROOT, capture_output=True, text=True, timeout=45)
        self.assertGreaterEqual(result.returncode, 0, 'Signal is not an expected guard failure')
        return result

    def fixture(self, name, *, flat=False, clipping=False):
        folder = self.root/name
        folder.mkdir()
        y, x = np.mgrid[:64, :128]
        pixels = np.stack((40+(5*x+3*y)%130, 30+(2*x+7*y)%105,
                           20+(11*x+y)%80), axis=2).astype('uint8')
        if flat:
            pixels[:] = (80, 65, 47)
        if clipping:
            pixels[..., 0] = np.where(x < 64, 0, 255)
        Image.fromarray(pixels).save(folder/'raw.png')
        Image.fromarray(pixels).resize((16, 8), Image.Resampling.BOX).save(folder/'native.png')
        (folder/'prompt.txt').write_text('Synthetic boundary contract fixture; no game material claim.\n')
        run = self.command('prepare_texture_master.py', '--original', folder/'native.png',
            '--generated', folder/'raw.png', '--prompt', folder/'prompt.txt', '--name', name,
            '--edition', 'fixture', '--profile', 'stone', '--output', folder/'source')
        self.assertEqual(run.returncode, 0, run.stderr)
        source = folder/'source/master.json'
        meta = json.loads(source.read_text())
        proof = folder/'fixture-proof.json'
        proof.write_text(json.dumps({'verdict': 'PASS isolated synthetic public contract fixture',
            'materials': [{'nativeIdentity': 'a'*64, 'name': name, 'edition': 'fixture',
                'masterPackage': {'file': str(source), 'sha256': sha(source.read_bytes())}}]})+'\n')
        recipe = {'schemaVersion': 1, 'policy': 'layered-veneer', 'nativeIdentity': 'a'*64,
            'name': name, 'edition': 'fixture', 'nativeDimensions': [16, 8],
            'sourceMasterPackage': str(source), 'sourceMasterPackageSha256': sha(source.read_bytes()),
            'sourceVerification': {'file': str(proof), 'sha256': sha(proof.read_bytes())},
            'originalSha256': sha((folder/'native.png').read_bytes()),
            'authoringDiffuseSha256': meta['color']['sha256'], 'authoredAtMasterDimensions': [128, 64],
            'layering': {'referenceSize': [16, 8], 'facingHeight': .78, 'brickHeight': .38,
                'chipFloor': .66, 'microAmplitude': .025, 'bevelPixels': .5,
                'brickRegions': [{'polygon': [[2, 1], [9, 1], [9, 5], [4, 6], [2, 4]]}]}}
        recipe_file = folder/'recipe.json'
        recipe_file.write_text(json.dumps(recipe, indent=2)+'\n')
        run = self.command('prepare_layered_texture_master.py', '--recipe', recipe_file,
                           '--output', folder/'layered')
        self.assertEqual(run.returncode, 0, run.stderr)
        return folder/'layered/master.json', recipe

    def run_cli(self, *, package=None, axis='x', output=None):
        self.count += 1
        output = output or self.root/('out-'+str(self.count))
        before = {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        result = self.command(CLI.name, '--package', package or self.package,
                              '--axis', axis, '--output', output)
        self.assertTrue(all(p.read_bytes() == b for p, b in before.items()), 'Input was modified')
        return result, output

    def test_nonsquare_x_and_y_exact_geometry_precision_metadata_and_direct_tiers(self):
        parent = json.loads(self.package.read_text())
        old_color = Image.open(self.package.parent/'color.png').convert('RGB')
        tool_hashes = {p: sha(p.read_bytes()) for p in (
            TOOLS/'prepare_layered_texture_master.py', TOOLS/'register_texture_boundary.py',
            ROOT/'tools/craft_normals.py')}
        for axis in ('x', 'y'):
            with self.subTest(axis=axis):
                expected = periodic_y_oracle(old_color.transpose(Image.Transpose.TRANSPOSE)) if axis == 'x' else periodic_y_oracle(old_color)
                if axis == 'x':
                    expected = expected.transpose(Image.Transpose.TRANSPOSE)
                run, out = self.run_cli(axis=axis)
                self.assertEqual(run.returncode, 0, run.stderr)
                self.assertEqual(Image.open(out/'color.png').tobytes(), expected.tobytes())
                height, early, mask, sigma = independent_composition(
                    expected, parent['height']['profile'], self.recipe['layering'])
                np.testing.assert_array_equal(np.load(out/'height.npy', allow_pickle=False), height)
                self.assertGreater(np.count_nonzero(height != early), 0)
                self.assertLess(height[mask > .5].max(), height[mask <= .5].min())
                meta = json.loads((out/'master.json').read_text())
                self.assertEqual(meta['generationCount'], 1)
                self.assertEqual(meta['height']['authoringPolicy'], 'periodic-layered-veneer-v1')
                self.assertEqual(meta['registration']['periodicBoundary']['axes'], [axis])
                self.assertEqual(meta['registration']['periodicBoundary']['transposed'], axis == 'x')
                self.assertEqual(meta['masterRevision']['priorRevision'], parent['masterRevision'])
                self.assertFalse(meta['masterRevision']['RGBUnchanged'])
                self.assertEqual(meta['layeredRelief']['baselineRecipe'], self.recipe)
                self.assertEqual(meta['layeredRelief']['detailRGBSourceSha256'], sha((out/'color.png').read_bytes()))
                self.assertEqual(meta['layeredRelief']['bevelSigmaMasterPixels'], sigma)
                tiers = self.root/('tiers-'+axis)
                run = self.command('derive_texture_tiers.py', '--original', self.package.parent.parent/'native.png',
                    '--master', out/'color.png', '--height-master', out/'height.npy', '--output', tiers)
                self.assertEqual(run.returncode, 0, run.stderr)
                for label, factor in [('mid', 4), ('high', 8)]:
                    size = (16*factor, 8*factor)
                    h = float_box(height, size)
                    normal = cyclic_normals(h)
                    channels = np.round(np.clip(normal*.5+.5, 0, 1)*255).astype('uint8')
                    payloads = {'diffuse': q92(periodic_rgb(expected, size)),
                                'height': q92(Image.fromarray(np.round(h*255).astype('uint8')))}
                    for channel, role in enumerate(('normalX', 'normalY', 'normalZ')):
                        payloads[role] = q92(Image.fromarray(channels[:, :, channel]))
                    for role, payload in payloads.items():
                        self.assertEqual((tiers/(label+'-'+role+'.webp')).read_bytes(), payload)
        self.assertTrue(all(sha(p.read_bytes()) == h for p, h in tool_hashes.items()))

    def test_noop_and_clipping_are_truthfully_recorded(self):
        for name, flat, clipping in [('flat', True, False), ('clipping', False, True)]:
            package, _ = self.fixture(name, flat=flat, clipping=clipping)
            run, out = self.run_cli(package=package)
            self.assertEqual(run.returncode, 0, run.stderr)
            meta = json.loads((out/'master.json').read_text())
            self.assertEqual(meta['masterRevision']['RGBUnchanged'], flat)
            if flat:
                self.assertEqual((out/'color.png').read_bytes(), (package.parent/'color.png').read_bytes())
            else:
                self.assertGreater(meta['registration']['periodicBoundary']['clippedChannelFraction'], 0)
            height = np.load(out/'height.npy', allow_pickle=False)
            self.assertTrue(np.isfinite(height).all() and 0 <= height.min() <= height.max() <= 1)

    def test_source_proof_current_data_and_metadata_tampering_reject_without_output(self):
        original_meta = self.package.read_bytes()
        meta = json.loads(original_meta)
        proof = Path(self.recipe['sourceVerification']['file'])
        for p in [Path(meta['inputs']['original']['file']), proof, self.package.parent/'color.png',
                  self.package.parent/'height.npy']:
            old = p.read_bytes()
            p.write_bytes(old+b'tamper')
            run, out = self.run_cli()
            self.assertNotEqual(run.returncode, 0)
            self.assertFalse(out.exists())
            p.write_bytes(old)
        variants = []
        for v in (None, {}):
            m = copy.deepcopy(meta); m['registration']['periodicBoundary'] = v; variants.append(m)
        m = copy.deepcopy(meta); m['height']['authoringPolicy'] = 'periodic-layered-veneer-v1'; variants.append(m)
        m = copy.deepcopy(meta); m['layeredRelief']['recipe']['authoringDiffuseSha256'] = '0'*64; variants.append(m)
        m = copy.deepcopy(meta); m['qualification'] += ' changed'; variants.append(m)
        for changed in variants:
            self.package.write_text(json.dumps(changed, indent=2)+'\n')
            run, out = self.run_cli()
            self.assertNotEqual(run.returncode, 0)
            self.assertFalse(out.exists())
        self.package.write_bytes(original_meta)

    def test_existing_and_late_destinations_are_never_clobbered(self):
        for kind in ('empty', 'file', 'symlink'):
            destination = self.root/('owned-'+kind)
            if kind == 'empty':
                destination.mkdir()
            elif kind == 'file':
                destination.write_text('owner evidence')
            else:
                destination.symlink_to(self.root/'missing')
            inode = destination.lstat().st_ino
            run, _ = self.run_cli(output=destination)
            self.assertNotEqual(run.returncode, 0)
            self.assertEqual(destination.lstat().st_ino, inode)
        sys.path.insert(0, str(TOOLS))
        spec = importlib.util.spec_from_file_location('layered_boundary_publication', CLI)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for kind in ('empty', 'file', 'symlink'):
            source = self.root/('ready-'+kind); source.mkdir(); (source/'keep').write_text('complete')
            target = self.root/('late-'+kind)
            if kind == 'empty': target.mkdir()
            elif kind == 'file': target.write_text('owner evidence')
            else: target.symlink_to(self.root/'missing-target')
            inode = target.lstat().st_ino
            with self.assertRaises(OSError): module.publish_exclusive(source, target)
            self.assertEqual(target.lstat().st_ino, inode)
            self.assertEqual((source/'keep').read_text(), 'complete')
        source = self.root/'unsupported-ready'; source.mkdir()
        with mock.patch.object(module.sys, 'platform', 'unsupported'):
            with self.assertRaises(OSError): module.publish_exclusive(source, self.root/'not-created')
        self.assertFalse((self.root/'not-created').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
