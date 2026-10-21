"""Public synthetic rounded-cap contracts; no actual game source or artwork.

Expected analytic geometry is independent of the adapter. Existing independent
tier oracles check both direct tiers. Test-only caller injection exercises races
and cleanup; the production command has no executable or environment override.
"""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
from hexen2_texture_tiers_test import q92, periodic_rgb, float_box, cyclic_normals

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT/'tools/texture_sheets'
CLI = TOOLS/'prepare_rounded_cap_texture_master.py'
sha = lambda data: hashlib.sha256(data).hexdigest()


def oracle(rgb, profile, caps):
    # Frozen craft is the verified detail source, not the cap implementation.
    sys.path.insert(0, str(ROOT/'tools'))
    from craft_normals import craft
    detail, _ = craft(np.asarray(rgb, dtype=np.float64)/255, profile, quantize_height=False)
    h, w = detail.shape
    yy, xx = np.mgrid[:h, :w].astype(np.float64)
    xx = (xx+.5)/8
    yy = (yy+.5)/8
    base = np.full((h, w), caps['plateHeight'], dtype=np.float64)
    for head in caps['heads']:
        cx, cy = head['centre']; rx, ry = head['radii']
        square = ((xx-cx)/rx)**2+((yy-cy)/ry)**2
        base += caps['capAmplitude']*np.maximum(0, 1-square)
    expected = (base+(detail-.5)*(2*caps['microAmplitude'])).astype('float32')
    early = (base+(detail.astype('float32')-.5)*(2*caps['microAmplitude'])).astype('float32')
    return expected, early, base, detail


class RoundedCapCLI(unittest.TestCase):
    def setUp(self):
        private = tempfile.TemporaryDirectory(prefix='rounded-cap-public-', dir='/private/tmp')
        self.addCleanup(private.cleanup)
        self.root = Path(private.name).resolve()
        self.count = 0
        y, x = np.mgrid[:64, :128]
        pixels = np.stack((40+(5*x+3*y)%130, 30+(2*x+7*y)%105, 20+(11*x+y)%80), 2).astype('uint8')
        self.raw = self.root/'raw.png'; Image.fromarray(pixels).save(self.raw)
        self.original = self.root/'native.png'
        Image.fromarray(pixels).resize((16, 8), Image.Resampling.BOX).save(self.original)
        self.prompt = self.root/'prompt.txt'; self.prompt.write_text('Synthetic public contract fixture only.\n')
        run = self.command('prepare_texture_master.py', '--original', self.original, '--generated', self.raw,
                           '--prompt', self.prompt, '--name', 'synthetic-caps', '--edition', 'fixture',
                           '--profile', 'metal', '--output', self.root/'initial')
        self.assertEqual(run.returncode, 0, run.stderr)
        self.package = self.root/'initial/master.json'
        self.source = json.loads(self.package.read_bytes())
        self.proof = self.root/'proof.json'
        self.recipe = {
            'schemaVersion': 1, 'policy': 'rounded-caps-v1', 'nativeIdentity': 'a'*64,
            'name': 'synthetic-caps', 'edition': 'fixture', 'nativeDimensions': [16, 8],
            'sourceMasterPackage': str(self.package), 'sourceMasterPackageSha256': sha(self.package.read_bytes()),
            'sourceVerification': {'file': str(self.proof), 'sha256': ''},
            'originalSha256': sha(self.original.read_bytes()), 'authoringDiffuseSha256': self.source['color']['sha256'],
            'authoredAtMasterDimensions': [128, 64], 'baselineProfile': 'metal',
            'caps': {'referenceSize': [16, 8], 'profile': 'paraboloid', 'plateHeight': .54,
                     'capAmplitude': .07, 'microAmplitude': .004, 'heads': [
                         {'label': 'H1', 'centre': [4.0625, 3.5625], 'radii': [1.875, 1.625]},
                         {'label': 'H2', 'centre': [11.5625, 4.0625], 'radii': [1.625, 1.3125]}]}}
        self.reseal()

    def command(self, name, *args):
        result = subprocess.run([sys.executable, str(TOOLS/name), *map(str, args)], cwd=ROOT,
            env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'), capture_output=True, text=True, timeout=45)
        self.assertGreaterEqual(result.returncode, 0, 'Signal is not an expected refusal')
        return result

    def reseal(self, proof=None):
        self.recipe['sourceMasterPackageSha256'] = sha(self.package.read_bytes())
        if proof is None:
            proof = {'verdict': 'PASS isolated synthetic source/master fixture, not historical artwork',
                     'materials': [{'nativeIdentity': 'a'*64, 'name': 'synthetic-caps', 'edition': 'fixture',
                                    'masterPackage': {'file': str(self.package), 'sha256': sha(self.package.read_bytes())}}]}
        self.proof.write_text(json.dumps(proof)+'\n')
        self.recipe['sourceVerification']['sha256'] = sha(self.proof.read_bytes())

    def run_cli(self, recipe=None, output=None, text=None):
        self.count += 1
        path = self.root/('recipe-'+str(self.count)+'.json')
        path.write_text(text if text is not None else json.dumps(recipe or self.recipe, indent=2)+'\n')
        output = output or self.root/('out-'+str(self.count))
        watched = {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file() and not p.is_symlink()}
        result = self.command(CLI.name, '--recipe', path, '--output', output)
        self.assertTrue(all(p.read_bytes() == data for p, data in watched.items()), 'Input changed')
        self.assertFalse(list(self.root.glob('.rounded-cap-*')), 'Owned private work leaked')
        return result, output, path

    def reject(self, recipe):
        run, out, _ = self.run_cli(recipe)
        self.assertNotEqual(run.returncode, 0)
        self.assertFalse(out.exists())

    def module(self):
        sys.path.insert(0, str(TOOLS))
        spec = importlib.util.spec_from_file_location('rounded_cap_injected_fixture', CLI)
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        return module

    def test_nonsquare_exact_float64_single_cast_rgb_and_metadata(self):
        run, out, _ = self.run_cli()
        self.assertEqual(run.returncode, 0, run.stderr)
        rgb = Image.open(self.package.parent/'color.png').convert('RGB')
        expected, early, base, detail = oracle(rgb, self.source['height']['profile'], self.recipe['caps'])
        self.assertTrue(np.any(expected != early), 'Fixture must detect premature float32 detail')
        actual = np.load(out/'height.npy', allow_pickle=False)
        self.assertEqual(actual.dtype, np.float32)
        self.assertEqual(actual.shape, (64, 128))
        np.testing.assert_array_equal(actual, expected)
        self.assertEqual((out/'color.png').read_bytes(), (self.package.parent/'color.png').read_bytes())
        meta = json.loads((out/'master.json').read_bytes())
        self.assertEqual(meta['height']['authoringPolicy'], 'rounded-caps-v1')
        self.assertEqual(meta['generationCount'], 1)
        self.assertEqual(meta['masterRevision']['replacesUnqualifiedPackageSha256'], sha(self.package.read_bytes()))
        self.assertEqual(meta['roundedCaps']['recipe'], self.recipe)
        self.assertIn('one float32 cast', meta['roundedCaps']['precisionOrder'])
        self.assertIn('not C1', meta['roundedCaps']['geometry'])
        self.assertNotIn('layeredRelief', meta)
        outside = base == .54
        np.testing.assert_array_equal(actual[outside], (.54+(detail-.5)*.008).astype('float32')[outside])
        self.assertTrue(np.all(base[[0, -1], :] == .54) and np.all(base[:, [0, -1]] == .54))

    def test_continuous_contact_interior_normal_direction_and_eight_caps(self):
        recipe = copy.deepcopy(self.recipe); recipe['caps']['microAmplitude'] = 0
        run, out, _ = self.run_cli(recipe)
        self.assertEqual(run.returncode, 0, run.stderr)
        height = np.load(out/'height.npy', allow_pickle=False)
        # H1's chosen centre and +X edge are exactly pixel centres in this fixture.
        self.assertAlmostEqual(float(height[28, 32]), .61, delta=3e-8)
        self.assertGreater(height[28, 32], height[28, 44])
        self.assertGreater(height[28, 44], height[28, 47])
        self.assertAlmostEqual(float(height[28, 47]), .54, delta=3e-8)
        self.assertAlmostEqual(float(height[28, 48]), .54, delta=3e-8)
        normal = cyclic_normals(height.astype(float))
        self.assertGreater(normal[28, 40, 0], 0)
        self.assertLess(normal[28, 24, 0], 0)
        self.assertGreater(normal[36, 32, 1], 0)
        self.assertLess(normal[20, 32, 1], 0)
        # A positive paraboloid approaches the plate continuously as r approaches1.
        radii = np.array([.8, .9, .99, .999, 1])
        values = .54+.07*np.maximum(0, 1-radii*radii)
        self.assertTrue(np.all(np.diff(values) < 0))
        self.assertLess(values[-2]-.54, .00015)
        recipe['caps']['heads'] = [{'label':str(i), 'centre':[x, y], 'radii':[.75, .75]}
                                  for i, (x, y) in enumerate(( (x,y) for y in (2,6) for x in (2,6,10,14) ))]
        run, out, _ = self.run_cli(recipe)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(len(json.loads((out/'master.json').read_bytes())['roundedCaps']['headSamples']), 8)

    def test_both_direct_tiers_all_ten_q92_method6_bytes(self):
        run, out, _ = self.run_cli()
        self.assertEqual(run.returncode, 0, run.stderr)
        tiers = self.root/'tiers'
        run = self.command('derive_texture_tiers.py', '--original', self.original, '--master', out/'color.png',
                           '--height-master', out/'height.npy', '--output', tiers)
        self.assertEqual(run.returncode, 0, run.stderr)
        rgb = Image.open(out/'color.png').convert('RGB'); scalar = np.load(out/'height.npy', allow_pickle=False)
        manifest = json.loads((tiers/'manifest.json').read_bytes())
        for name, factor in [('Mid',4), ('High',8)]:
            size = (16*factor, 8*factor); h = float_box(scalar, size)
            packed = np.rint(np.clip(cyclic_normals(h)*.5+.5, 0, 1)*255).astype('uint8')
            expected = {'diffuse':q92(periodic_rgb(rgb, size)), 'height':q92(Image.fromarray(np.rint(h*255).astype('uint8')))}
            expected.update({role:q92(Image.fromarray(packed[:, :, channel]))
                             for channel, role in enumerate(('normalX','normalY','normalZ'))})
            for role, data in expected.items():
                row = manifest['tiers'][name]['outputs'][role]
                self.assertEqual((tiers/row['file']).read_bytes(), data)
                self.assertEqual((row['quality'],row['method'],row['lossless']), (92,6,False))

    def test_closed_finite_geometry_and_byte_budgets_reject(self):
        cases = []
        for value in (float('nan'), float('inf'), True):
            r = copy.deepcopy(self.recipe); r['caps']['plateHeight'] = value; cases.append(r)
        for radii in ([0,1], [-1,1], [.1,1], [True,1], [float('inf'),1]):
            r = copy.deepcopy(self.recipe); r['caps']['heads'][0]['radii'] = radii; cases.append(r)
        for centre in ([0,3], [1.875,3.5625], [15,3], [float('nan'),3]):
            r = copy.deepcopy(self.recipe); r['caps']['heads'][0]['centre'] = centre; cases.append(r)
        for field, value in [('profile','hemisphere'), ('capAmplitude',-.1), ('plateHeight',.99), ('microAmplitude',.2)]:
            r = copy.deepcopy(self.recipe); r['caps'][field] = value; cases.append(r)
        r = copy.deepcopy(self.recipe); r['caps']['extra'] = False; cases.append(r)
        r = copy.deepcopy(self.recipe); r['caps']['heads'][0]['mask'] = []; cases.append(r)
        r = copy.deepcopy(self.recipe); r['caps']['heads'][1]['label'] = 'H1'; cases.append(r)
        r = copy.deepcopy(self.recipe); r['caps']['heads'][1]['centre'] = [4.5,3.5]; cases.append(r)
        r = copy.deepcopy(self.recipe); r['caps']['heads'] = []; cases.append(r)
        r = copy.deepcopy(self.recipe); r['caps']['heads'] *= 65; cases.append(r)
        r = copy.deepcopy(self.recipe); r['nativeDimensions'][0] = True; cases.append(r)
        r = copy.deepcopy(self.recipe); r['sourceMasterPackageSha256'] = None; cases.append(r)
        r = copy.deepcopy(self.recipe); r['sourceVerification']['sha256'] = False; cases.append(r)
        r = copy.deepcopy(self.recipe); r['unknown'] = None; cases.append(r)
        for recipe in cases:
            with self.subTest(recipe=recipe): self.reject(recipe)
        text = json.dumps(self.recipe).replace('"schemaVersion": 1', '"schemaVersion": 1, "schemaVersion": 1')
        run, out, _ = self.run_cli(text=text)
        self.assertNotEqual(run.returncode, 0); self.assertFalse(out.exists())
        run, out, _ = self.run_cli(text=' '*262145)
        self.assertNotEqual(run.returncode, 0); self.assertFalse(out.exists())

    def test_proof_paths_current_input_and_replay_custody_reject(self):
        original_proof = json.loads(self.proof.read_bytes())
        for field, value in [('nativeIdentity','b'*64), ('name','other'), ('edition','other')]:
            proof = copy.deepcopy(original_proof); proof['materials'][0][field] = value
            self.reseal(proof); self.reject(self.recipe)
        proof = copy.deepcopy(original_proof); proof['materials'][0]['masterPackage']['file'] = str(self.root/'other.json')
        self.reseal(proof); self.reject(self.recipe)
        proof = copy.deepcopy(original_proof); proof['materials'] = []
        self.reseal(proof); self.reject(self.recipe)
        self.reseal()
        for path in (self.original, self.raw, self.prompt, self.package.parent/'color.png', self.package.parent/'height.npy'):
            old = path.read_bytes(); path.write_bytes(old+b'changed')
            try:self.reject(self.recipe)
            finally:path.write_bytes(old)
        # A resealed yet noncanonical receipt must fail its actual3-file replay.
        old = self.package.read_bytes(); changed = json.loads(old); changed['qualification'] += ' altered'
        self.package.write_text(json.dumps(changed,indent=2)+'\n'); self.reseal()
        try:self.reject(self.recipe)
        finally:self.package.write_bytes(old); self.reseal()
        alias = self.root/'redirected-package.json'; alias.symlink_to(self.package)
        recipe = copy.deepcopy(self.recipe); recipe['sourceMasterPackage'] = str(alias)
        self.reject(recipe)

    def test_source_marker_presence_and_metadata_executable_never_runs(self):
        old = self.package.read_bytes()
        for place, key in [('root','masterRevision'), ('root','roundedCaps'), ('root','layeredRelief'),
                           ('height','authoringPolicy'), ('registration','periodicBoundary')]:
            for value in (None, False):
                meta = json.loads(old); target = meta if place == 'root' else meta[place]; target[key] = value
                self.package.write_text(json.dumps(meta,indent=2)+'\n'); self.reseal()
                try:self.reject(self.recipe)
                finally:self.package.write_bytes(old); self.reseal()
        sentinel = self.root/'executed'
        evil = self.root/'metadata-producer.py'
        evil.write_text('from pathlib import Path\nPath('+repr(str(sentinel))+').write_text("executed")\n')
        meta = json.loads(old); meta['tools']['prepare'] = {'file':str(evil),'sha256':sha(evil.read_bytes())}
        self.package.write_text(json.dumps(meta,indent=2)+'\n'); self.reseal()
        try:
            self.reject(self.recipe); self.assertFalse(sentinel.exists())
        finally:self.package.write_bytes(old); self.reseal()
        meta = json.loads(old); meta['tools']['craft']['sha256'] = '0'*64
        self.package.write_text(json.dumps(meta,indent=2)+'\n'); self.reseal()
        try:self.reject(self.recipe)
        finally:self.package.write_bytes(old); self.reseal()

    def test_mutation_after_real_prepare_replay_rejects_and_cleans(self):
        module = self.module(); recipe = self.root/'race-recipe.json'
        recipe.write_text(json.dumps(self.recipe)); output = self.root/'race-output'
        old = self.original.read_bytes(); real_run = subprocess.run; completed = []
        def change_after_replay(*args, **kwargs):
            run = real_run(*args, **kwargs)
            self.assertEqual(run.returncode, 0, run.stderr); completed.append(True)
            self.original.write_bytes(old+b'changed after exact replay')
            return run
        try:
            with mock.patch.object(module.subprocess,'run',side_effect=change_after_replay), \
                 mock.patch.object(sys,'argv',[str(CLI),'--recipe',str(recipe),'--output',str(output)]):
                with self.assertRaises(ValueError):module.main()
            self.assertEqual(len(completed), 1); self.assertFalse(output.exists())
            self.assertFalse(list(self.root.glob('.rounded-cap-*')))
        finally:self.original.write_bytes(old)

    def test_foreign_existing_and_late_destinations_preserved(self):
        for kind in ('directory','file','symlink'):
            output = self.root/('foreign-'+kind)
            if kind == 'directory':output.mkdir(); (output/'keep').write_text('foreign evidence')
            elif kind == 'file':output.write_text('foreign evidence')
            else:output.symlink_to(self.root/'absent-foreign-target')
            inode = output.lstat().st_ino; run, _, _ = self.run_cli(output=output)
            self.assertNotEqual(run.returncode, 0); self.assertEqual(output.lstat().st_ino, inode)
        module = self.module(); real_publish = module.publish_exclusive
        for kind in ('directory','symlink'):
            recipe = self.root/('late-recipe-'+kind+'.json'); recipe.write_text(json.dumps(self.recipe))
            output = self.root/('late-'+kind)
            def late(source, destination):
                if kind == 'directory':destination.mkdir(); (destination/'keep').write_text('late foreign evidence')
                else:destination.symlink_to(self.root/'late-foreign-target')
                return real_publish(source,destination)
            with mock.patch.object(module,'publish_exclusive',side_effect=late), \
                 mock.patch.object(sys,'argv',[str(CLI),'--recipe',str(recipe),'--output',str(output)]):
                with self.assertRaises(OSError):module.main()
            self.assertTrue(output.is_dir() if kind == 'directory' else output.is_symlink())
            if kind == 'directory':self.assertEqual((output/'keep').read_text(),'late foreign evidence')
            self.assertFalse(list(self.root.glob('.rounded-cap-*')))

    def test_failed_prepare_composition_and_unsupported_publication_clean_private_work(self):
        module = self.module(); recipe = self.root/'failure-recipe.json'; recipe.write_text(json.dumps(self.recipe))
        for stage in ('prepare','compose','publish'):
            output = self.root/('failed-'+stage)
            if stage == 'prepare':
                injection = mock.patch.object(module.subprocess,'run',return_value=subprocess.CompletedProcess([],1,'','fixture replay failure'))
            elif stage == 'compose':injection = mock.patch.object(module,'compose_caps',side_effect=ValueError('fixture composition failure'))
            else:
                real_publish = module.publish_exclusive
                def unsupported(source,destination):
                    with mock.patch.object(module.sys,'platform','unsupported'):
                        return real_publish(source,destination)
                injection = mock.patch.object(module,'publish_exclusive',side_effect=unsupported)
            with injection, mock.patch.object(sys,'argv',[str(CLI),'--recipe',str(recipe),'--output',str(output)]):
                with self.assertRaises((ValueError,OSError)):module.main()
            self.assertFalse(output.exists()); self.assertFalse(list(self.root.glob('.rounded-cap-*')))


if __name__ == '__main__':
    unittest.main(verbosity=2)
