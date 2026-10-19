"""Independent public CLI tests for opt-in same-source Y boundary repair.

Only synthetic owned fixtures and temporary actual-copy outputs are written.
QUAKED_BOUNDARY_CLI may point at a retained source snapshot for RED evidence.
QUAKED_BOUNDARY_ACTUAL_TRIALS=1 enables temporary actual-copy review fixtures;
the default nine regression groups need no game assets or /private/tmp trials.
No implementation helper from the boundary CLI is imported as an oracle.
"""
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
import PIL
from PIL import Image, features

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT/'tools/texture_sheets'
CLI = Path(os.environ.get('QUAKED_BOUNDARY_CLI', TOOLS/'register_texture_boundary.py'))
sha = lambda b: hashlib.sha256(b).hexdigest()


def periodic_y_oracle(image):
    values = np.asarray(image.convert('RGB'), dtype=float)
    h, w, _ = values.shape
    rhs = np.zeros_like(values)
    rhs[0] = values[-1]-values[0]
    rhs[-1] = -rhs[0]
    eigen = 2*np.cos(2*np.pi*np.arange(h)[:, None]/h)+2*np.cos(2*np.pi*np.arange(w)[None, :]/w)-4
    eigen[0, 0] = 1
    spectrum = np.fft.fft2(rhs, axes=(0, 1))/eigen[:, :, None]
    spectrum[0, 0] = 0
    smooth = np.fft.ifft2(spectrum, axes=(0, 1)).real
    lap = np.roll(smooth, 1, 0)+np.roll(smooth, -1, 0)+np.roll(smooth, 1, 1)+np.roll(smooth, -1, 1)-4*smooth
    assert np.abs(lap-rhs).max() < 1e-10
    return Image.fromarray(np.rint(np.clip(values-smooth, 0, 255)).astype('uint8'))


class RegisterBoundaryCLI(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='texture-boundary-public-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.counter = 0
        self.package = self.fixture('pattern')
        self.baseline = json.loads(self.package.read_text())

    def fixture(self, name, *, flat=False, landmarks=False):
        folder = self.root/name; folder.mkdir()
        original, generated, prompt = (folder/p for p in ('native.png', 'raw.png', 'prompt.txt'))
        if flat:
            raw = Image.new('RGB', (128, 64), (80, 65, 47))
        else:
            y, x = np.mgrid[:64, :128]
            rgb = np.stack((45+(3*x+7*y)%117, 35+(5*x+2*y)%99, 22+(11*x+3*y)%77), axis=2).astype('uint8')
            raw = Image.fromarray(rgb)
        raw.save(generated)
        raw.resize((16, 8), Image.Resampling.BOX).save(original)
        prompt.write_text('One photographic material; preserve colour, features and edges.\n')
        extra = []
        if landmarks:
            lm = folder/'landmarks.json'; lm.write_text(json.dumps({'axis':'x','points':[[0,0],[8,6],[16,16]]}))
            extra = ['--landmarks', str(lm)]
        run = subprocess.run([sys.executable, str(TOOLS/'prepare_texture_master.py'), '--original', str(original),
             '--generated', str(generated), '--prompt', str(prompt), '--name', name, '--edition', 'base',
             '--profile', 'wood', '--output', str(folder/'master'), *extra], cwd=ROOT,
             capture_output=True, text=True, timeout=30, check=False)
        self.assertEqual(run.returncode, 0, run.stderr)
        return folder/'master/master.json'

    def write_recipe(self, recipe):
        self.package.write_text(json.dumps(recipe, indent=2)+'\n')

    def run_cli(self, package=None, output=None):
        self.counter += 1
        package = package or self.package
        output = output or self.root/('registered-'+str(self.counter))
        before = {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        run = subprocess.run([sys.executable, str(CLI), '--package', str(package), '--output', str(output)],
            cwd=ROOT, env={**os.environ, 'PYTHONPATH': str(TOOLS)}, capture_output=True, text=True, timeout=30, check=False)
        self.assertIsInstance(run.returncode, int)
        self.assertGreaterEqual(run.returncode, 0, 'Signal/timeout is not an expected rejection')
        self.assertTrue(all(p.exists() and p.read_bytes()==b for p,b in before.items()), 'Source input modified')
        return run, output

    def success(self, **kwargs):
        run, out = self.run_cli(**kwargs)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual({p.name for p in out.iterdir()}, {'color.png','height.npy','master.json'})
        return out, json.loads((out/'master.json').read_text())

    def reject(self):
        run, out = self.run_cli()
        self.assertGreater(run.returncode, 0, 'Invalid package accepted')
        self.assertFalse(out.exists(), 'Invalid package created partial output')

    def test_exact_independent_y_solution_final_height_and_environment(self):
        # Deliberately stale environment is historical input, not new provenance.
        recipe = copy.deepcopy(self.baseline); recipe['environment']={'python':'old','executable':'old','pillow':'old'}
        self.write_recipe(recipe)
        source_bytes = self.package.read_bytes()
        expected = periodic_y_oracle(Image.open(self.package.parent/'color.png'))
        out, result = self.success()
        self.assertEqual(Image.open(out/'color.png').tobytes(), expected.tobytes())
        sys.path.insert(0, str(ROOT/'tools'))
        from craft_normals import craft
        height, _ = craft(np.asarray(expected,dtype=float)/255, recipe['height']['profile'], quantize_height=False)
        height = height.astype('float32'); stream=io.BytesIO(); np.save(stream,height,allow_pickle=False)
        self.assertEqual((out/'height.npy').read_bytes(),stream.getvalue())
        self.assertEqual(result['generationCount'],1)
        self.assertTrue(result['height']['authoredOnce']); self.assertFalse(result['height']['quantizedTo8Bit'])
        self.assertEqual(result['masterRevision']['replacesUnqualifiedPackageSha256'],sha(source_bytes))
        self.assertTrue(result['masterRevision']['generatorOutputUnchanged'])
        self.assertTrue(result['masterRevision']['notAnotherGeneration'])
        self.assertEqual(result['inputs'],recipe['inputs'])
        self.assertEqual(result['registration']['periodicBoundary']['axes'],['y'])
        self.assertFalse(result['registration']['periodicBoundary']['featureRelocation'])
        self.assertEqual(result['environment']['executable'],sys.executable)
        self.assertEqual((result['environment']['pillow'],result['environment']['numpy'],result['environment']['libwebp']),
                         (PIL.__version__,np.__version__,features.version('webp')))
        self.assertEqual(result['tools']['boundaryRegistration']['sha256'],sha(CLI.read_bytes()))
        self.assertNotIn('tiers',result)

    def test_flat_y_noop_and_real_measured_registration_input(self):
        flat = self.fixture('flat',flat=True)
        out,_ = self.success(package=flat)
        self.assertEqual(Image.open(out/'color.png').tobytes(),Image.open(flat.parent/'color.png').tobytes())
        measured = self.fixture('measured',landmarks=True)
        out,result = self.success(package=measured)
        self.assertEqual(result['registration']['axis'],'x')
        self.assertEqual(Image.open(out/'color.png').tobytes(),periodic_y_oracle(Image.open(measured.parent/'color.png')).tobytes())

    @unittest.skipUnless(os.environ.get('QUAKED_BOUNDARY_ACTUAL_TRIALS')=='1',
                         'Explicit actual-art review fixture; ordinary regressions are self-contained')
    def test_actual_two_source_copies_match_reviewed_trials_and_float_height(self):
        for name in ('rtex043','ttex051'):
            package=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-005/masters'/name/'master.json'
            trial=Path('/private/tmp/quaked-batch005-seam-trial')/(name+'.png')
            self.assertTrue(package.is_file() and trial.is_file(), 'Actual-source review fixture is missing')
            recipe=json.loads(package.read_text()); watch=[package,package.parent/'color.png',package.parent/'height.npy',trial]
            watch += [Path(row['file']) for row in recipe['inputs'].values()]
            before={p:p.read_bytes()for p in watch}
            with self.subTest(name=name):
                out,result=self.success(package=package)
                corrected=Image.open(out/'color.png').convert('RGB')
                self.assertEqual(corrected.tobytes(),Image.open(trial).convert('RGB').tobytes())
                sys.path.insert(0,str(ROOT/'tools'));from craft_normals import craft
                height,_=craft(np.asarray(corrected,dtype=float)/255,recipe['height']['profile'],quantize_height=False)
                np.testing.assert_array_equal(np.load(out/'height.npy',allow_pickle=False),height.astype('float32'))
                self.assertEqual(result['generationCount'],1)
            self.assertTrue(all(p.read_bytes()==b for p,b in before.items()))

    def test_source_master_and_finish_mismatches_reject_before_write(self):
        for role in ('original','generated','prompt'):
            p=Path(self.baseline['inputs'][role]['file']);old=p.read_bytes();p.write_bytes(old+b'x')
            with self.subTest(role=role):self.reject()
            p.write_bytes(old)
        p=self.package.parent/'color.png';old=p.read_bytes();im=Image.open(p).copy();im.putpixel((5,5),(1,2,3));im.save(p)
        self.reject()
        recipe=copy.deepcopy(self.baseline);recipe['color']['sha256']=sha(p.read_bytes());self.write_recipe(recipe);self.reject()
        p.write_bytes(old);self.write_recipe(self.baseline)

    def test_missing_redirected_or_changed_core_tool_witness_rejects(self):
        fake=self.root/'unrelated.py';fake.write_text('# not the imported producer\n')
        for case in ('missing','redirected','digest'):
            recipe=copy.deepcopy(self.baseline)
            if case=='missing':recipe['tools']={}
            elif case=='redirected':recipe['tools']['finish']={'file':str(fake),'sha256':sha(fake.read_bytes())}
            else:recipe['tools']['finish']['sha256']='0'*64
            self.write_recipe(recipe)
            with self.subTest(case=case):self.reject()
        self.write_recipe(self.baseline)

    def test_noncanonical_filenames_and_inconsistent_landmark_metadata_reject(self):
        alias=self.package.parent/'alternate.png';alias.write_bytes((self.package.parent/'color.png').read_bytes())
        recipe=copy.deepcopy(self.baseline);recipe['color']['file']=alias.name;self.write_recipe(recipe);self.reject()
        recipe=copy.deepcopy(self.baseline);recipe['registration']['verticalLandmarks']=[[0,0],[8,8]]
        self.write_recipe(recipe);self.reject()
        self.write_recipe(self.baseline)

    def test_trailing_or_wrong_dtype_height_rejects_before_write(self):
        p=self.package.parent/'height.npy';old=p.read_bytes()
        for case in ('trailing','integer','nan'):
            if case=='trailing':p.write_bytes(old+b'unexpected trailer')
            elif case=='integer':np.save(p,np.zeros((64,128),dtype='int16'))
            else:np.save(p,np.full((64,128),np.nan,dtype='float32'))
            recipe=copy.deepcopy(self.baseline);recipe['height']['sha256']=sha(p.read_bytes());self.write_recipe(recipe)
            with self.subTest(case=case):self.reject()
        p.write_bytes(old);self.write_recipe(self.baseline)

    def test_undersized_wrong_format_and_legacy_sources_reject(self):
        raw=Path(self.baseline['inputs']['generated']['file']);old=raw.read_bytes()
        for case in ('small','jpeg'):
            Image.new('RGB',(64,32)if case=='small'else(128,64),(80,60,40)).save(raw,'PNG'if case=='small'else'JPEG')
            recipe=copy.deepcopy(self.baseline);recipe['inputs']['generated']['sha256']=sha(raw.read_bytes())
            recipe['generatedDimensions']=[64,32]if case=='small'else[128,64]
            self.write_recipe(recipe)
            with self.subTest(case=case):self.reject()
        raw.write_bytes(old)
        recipe=copy.deepcopy(self.baseline);recipe['inputs']={r['file']:r['sha256']for r in recipe['inputs'].values()}
        self.write_recipe(recipe);self.reject();self.write_recipe(self.baseline)

    def test_repeat_correction_presence_even_empty_is_rejected(self):
        recipe=copy.deepcopy(self.baseline);recipe['registration']['periodicBoundary']={};self.write_recipe(recipe);self.reject()
        self.write_recipe(self.baseline)
        flat=self.fixture('repeat-flat',flat=True);out,_=self.success(package=flat)
        repeat=json.loads((out/'master.json').read_text());repeat['registration']['periodicBoundary']={}
        (out/'master.json').write_text(json.dumps(repeat))
        run,new=self.run_cli(package=out/'master.json');self.assertGreater(run.returncode,0);self.assertFalse(new.exists())

    def test_existing_destinations_and_bad_prompt_profile_preserved(self):
        out,_=self.success();before={p:p.read_bytes()for p in out.iterdir()}
        run,_=self.run_cli(output=out);self.assertGreater(run.returncode,0);self.assertTrue(all(p.read_bytes()==b for p,b in before.items()))
        existing=self.root/'owner-file';existing.write_bytes(b'owner evidence')
        run,_=self.run_cli(output=existing);self.assertGreater(run.returncode,0);self.assertEqual(existing.read_bytes(),b'owner evidence')
        dangling=self.root/'dangling';target=self.root/'absent';dangling.symlink_to(target)
        run,_=self.run_cli(output=dangling);self.assertGreater(run.returncode,0);self.assertTrue(dangling.is_symlink());self.assertFalse(target.exists())
        recipe=copy.deepcopy(self.baseline);recipe['height']['profile']['strength']=float('nan');self.write_recipe(recipe);self.reject()
        prompt=Path(self.baseline['inputs']['prompt']['file']);old=prompt.read_bytes();prompt.write_bytes(b'\xff')
        recipe=copy.deepcopy(self.baseline);recipe['inputs']['prompt']['sha256']=sha(prompt.read_bytes());self.write_recipe(recipe);self.reject()
        prompt.write_bytes(old);self.write_recipe(self.baseline)


if __name__=='__main__':
    unittest.main(verbosity=2)
