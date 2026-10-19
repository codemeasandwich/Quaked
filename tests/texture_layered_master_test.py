"""Public CLI regressions for one-source layered texture master authoring.

Synthetic default fixtures need no game data. QUAKED_LAYERED_ACTUAL=1 adds the
current actual recipe as a read-only integration witness. No helper from the
adapter under test is imported. QUAKED_LAYERED_CLI can select a frozen snapshot.
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
from PIL import Image, ImageDraw, features

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT/'tools/texture_sheets'
CLI = Path(os.environ.get('QUAKED_LAYERED_CLI', TOOLS/'prepare_layered_texture_master.py'))
sha = lambda b: hashlib.sha256(b).hexdigest()


def independent_composition(rgb, profile, layering):
    sys.path.insert(0, str(ROOT/'tools'))
    from craft_normals import craft
    detail,_ = craft(np.asarray(rgb,dtype=float)/255,profile,quantize_height=False)
    h,w = detail.shape
    mask_image = Image.new('L',(w,h)); draw=ImageDraw.Draw(mask_image)
    rw,rh=layering['referenceSize']
    for region in layering['brickRegions']:
        for dy in (-h,0,h):
            for dx in (-w,0,w):
                draw.polygon([(x*w/rw+dx,y*h/rh+dy) for x,y in region['polygon']],fill=255)
    mask=np.asarray(mask_image,dtype=float)/255
    sigma=layering['bevelPixels']*(w*h)**.5/256
    ky=np.fft.fftfreq(h)[:,None]; kx=np.fft.fftfreq(w)[None,:]
    smooth=np.fft.ifft2(np.fft.fft2(mask)*np.exp(-2*np.pi**2*sigma**2*(kx*kx+ky*ky))).real
    base=np.where(mask>.5,layering['brickHeight'],layering['facingHeight']-
       (layering['facingHeight']-layering['chipFloor'])*np.minimum(smooth*2,1))
    final=(base+(detail-.5)*(2*layering['microAmplitude'])).astype('float32')
    early=(base+(detail.astype('float32')-.5)*(2*layering['microAmplitude'])).astype('float32')
    return final,early,mask,sigma


class LayeredMasterCLI(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory(prefix='texture-layered-public-')
        self.addCleanup(tmp.cleanup); self.root=Path(tmp.name).resolve(); self.counter=0
        self.original=self.root/'native.png'; self.generated=self.root/'raw.png'; self.prompt=self.root/'prompt.txt'
        y,x=np.mgrid[:128,:128]
        pixels=np.stack((45+(3*x+7*y)%117,35+(5*x+2*y)%99,22+(11*x+3*y)%77),axis=2).astype('uint8')
        Image.fromarray(pixels).save(self.generated)
        Image.fromarray(pixels).resize((16,16),Image.Resampling.BOX).save(self.original)
        self.prompt.write_text('One material; preserve original forms and edge alignment.\n')
        prepared=subprocess.run([sys.executable,str(TOOLS/'prepare_texture_master.py'),
            '--original',str(self.original),'--generated',str(self.generated),'--prompt',str(self.prompt),
            '--name','synthetic','--edition','base','--profile','stone','--output',str(self.root/'source')],
            cwd=ROOT,capture_output=True,text=True,timeout=30)
        self.assertEqual(prepared.returncode,0,prepared.stderr)
        self.package=self.root/'source/master.json'; self.source=json.loads(self.package.read_text())
        self.proof=self.root/'public-proof.json'; self.recipe_file=self.root/'layering.json'
        self.recipe={'schemaVersion':1,'name':'synthetic','edition':'base','nativeIdentity':'a'*64,
           'nativeDimensions':[16,16],'policy':'layered-veneer','sourceMasterPackage':str(self.package),
           'originalSha256':sha(self.original.read_bytes()),'authoringDiffuseSha256':self.source['color']['sha256'],
           'authoredAtMasterDimensions':[128,128],
           'layering':{'referenceSize':[16,16],'facingHeight':.78,'brickHeight':.38,'chipFloor':.66,
            'microAmplitude':.025,'bevelPixels':1.5,'brickRegions':[{'polygon':[[3,3],[11,3],[11,12],[3,12]]}]}}
        self.refresh_source()

    def refresh_source(self):
        self.package.write_text(json.dumps(self.source,indent=2)+'\n')
        self.recipe['sourceMasterPackageSha256']=sha(self.package.read_bytes())
        self.proof.write_text(json.dumps({'verdict':'PASS synthetic public contract fixture','materials':[
          {'nativeIdentity':'a'*64,'name':'synthetic','edition':'base','masterPackage':{
           'file':str(self.package),'sha256':sha(self.package.read_bytes())}}]})+'\n')
        self.recipe['sourceVerification']={'file':str(self.proof),'sha256':sha(self.proof.read_bytes())}

    def run_cli(self, *, recipe=None, output=None):
        self.counter+=1; output=output or self.root/('out-'+str(self.counter))
        if recipe is None:
            self.recipe_file.write_text(json.dumps(self.recipe,indent=2)+'\n'); recipe=self.recipe_file
        watched={p:p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        result=subprocess.run([sys.executable,str(CLI),'--recipe',str(recipe),'--output',str(output)],
          cwd=ROOT,env={**os.environ,'PYTHONPATH':str(TOOLS)},capture_output=True,text=True,timeout=45)
        self.assertGreaterEqual(result.returncode,0,'Signal is not a valid rejection')
        self.assertTrue(all(p.is_file() and p.read_bytes()==data for p,data in watched.items()),'An input changed')
        return result,output

    def reject(self):
        result,output=self.run_cli()
        self.assertNotEqual(result.returncode,0,'Malformed recipe/source accepted')
        self.assertFalse(output.exists(),'Invalid input created output')

    def test_full_precision_same_rgb_one_height_and_no_obsolete_binary_dependency(self):
        color=(self.package.parent/'color.png').read_bytes()
        expected,early,mask,sigma=independent_composition(Image.open(io.BytesIO(color)),self.source['height']['profile'],self.recipe['layering'])
        self.assertGreater(np.count_nonzero(expected!=early),0,'Fixture must distinguish precision order')
        (self.package.parent/'color.png').unlink(); (self.package.parent/'height.npy').unlink()
        self.source['environment']={'python':'historical','pillow':'historical'}; self.refresh_source()
        result,out=self.run_cli(); self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual({p.name for p in out.iterdir()},{'color.png','height.npy','master.json'})
        self.assertEqual((out/'color.png').read_bytes(),color)
        height=np.load(out/'height.npy',allow_pickle=False)
        np.testing.assert_array_equal(height,expected)
        self.assertEqual(height.dtype,np.dtype('float32'))
        self.assertTrue(height[mask>.5].max()<height[mask<=.5].min())
        meta=json.loads((out/'master.json').read_text())
        self.assertEqual(meta['generationCount'],1); self.assertTrue(meta['height']['authoredOnce'])
        self.assertFalse(meta['height']['quantizedTo8Bit']); self.assertEqual(meta['height']['authoringPolicy'],'layered-veneer')
        self.assertEqual(meta['layeredRelief']['recipe'],self.recipe)
        self.assertEqual(meta['layeredRelief']['recipeSha256'],sha(self.recipe_file.read_bytes()))
        self.assertEqual(meta['layeredRelief']['bevelSigmaMasterPixels'],sigma)
        self.assertTrue(meta['masterRevision']['RGBUnchanged']); self.assertTrue(meta['masterRevision']['notAnotherGeneration'])
        self.assertEqual(meta['tools']['layeredAuthoring']['sha256'],sha(CLI.read_bytes()))
        self.assertEqual(meta['environment']['executable'],sys.executable)
        self.assertEqual((meta['environment']['pillow'],meta['environment']['numpy'],meta['environment']['libwebp']),
          (PIL.__version__,np.__version__,features.version('webp')))
        self.assertNotIn('tiers',meta)

    def test_source_hash_and_public_identity_proof_refusals(self):
        baseline=copy.deepcopy(self.recipe)
        for field,value in [('sourceMasterPackageSha256','0'*64),('originalSha256','0'*64),
            ('authoringDiffuseSha256','0'*64),('nativeIdentity','b'*64),('name','other'),('edition','portals'),
            ('nativeDimensions',[8,16]),('authoredAtMasterDimensions',[64,128])]:
            with self.subTest(field=field):
                self.recipe=copy.deepcopy(baseline); self.recipe[field]=value; self.reject()
        self.recipe=copy.deepcopy(baseline); self.recipe['sourceVerification']['sha256']='0'*64; self.reject()

    def test_source_input_and_tool_hash_path_roles_refusals(self):
        baseline=copy.deepcopy(self.source)
        variants=[]
        for role in ('original','generated','prompt'):
            d=copy.deepcopy(baseline); d['inputs'][role]['sha256']='0'*64; variants.append(d)
        d=copy.deepcopy(baseline);d['tools']['craft']['file']=str(self.prompt);variants.append(d)
        d=copy.deepcopy(baseline);d['tools']['craft']['sha256']='0'*64;variants.append(d)
        d=copy.deepcopy(baseline);d['tools']['extra']=d['tools']['craft'];variants.append(d)
        d=copy.deepcopy(baseline);d['inputs']['extra']=d['inputs']['prompt'];variants.append(d)
        d=copy.deepcopy(baseline);d['color']['sha256']='0'*64;variants.append(d)
        d=copy.deepcopy(baseline);d['height']['sha256']='0'*64;variants.append(d)
        for i,source in enumerate(variants):
            with self.subTest(case=i):self.source=source;self.refresh_source();self.reject()

    def test_repeated_or_noncanonical_authoring_refusals(self):
        baseline=copy.deepcopy(self.source)
        variants=[]
        for field,value in [('masterRevision',{}),('generationCount',2),('canonicalMasterFactor',4)]:
            d=copy.deepcopy(baseline);d[field]=value;variants.append(d)
        for field,value in [('authoringPolicy','layered-veneer'),('quantizedTo8Bit',True),('dtype','float64'),('authoredOnce',False)]:
            d=copy.deepcopy(baseline);d['height'][field]=value;variants.append(d)
        for field,value in [('periodicBoundary',None),('axis','x'),('verticalLandmarks',[[0,0],[16,16]])]:
            d=copy.deepcopy(baseline);d['registration'][field]=value;variants.append(d)
        d=copy.deepcopy(baseline);d['color']['file']='other.png';variants.append(d)
        for i,source in enumerate(variants):
            with self.subTest(case=i):self.source=source;self.refresh_source();self.reject()

    def test_nonboolean_finite_ordered_clipping_safe_layer_parameters(self):
        baseline=copy.deepcopy(self.recipe)
        for field,value in [('facingHeight',True),('brickHeight',float('nan')),('chipFloor',float('inf')),
           ('microAmplitude',-.01),('microAmplitude',.2),('facingHeight',.99),('brickHeight',.01),
           ('chipFloor',.40),('chipFloor',.9),('bevelPixels',0),('bevelPixels',5)]:
            with self.subTest(field=field,value=value):
                self.recipe=copy.deepcopy(baseline);self.recipe['layering'][field]=value;self.reject()

    def test_bounded_finite_nonempty_geometry_and_unknown_shape_refusals(self):
        baseline=copy.deepcopy(self.recipe)
        invalid=[[],[{'ellipse':[1,1,3,3]}],[{'polygon':[[1,1],[2,2]]}],
          [{'polygon':[[1,1],[1,1],[1,1]]}],[{'polygon':[[1,1],[2,2],[3,3]]}],
          [{'polygon':[[1,1],[2,float('nan')],[3,1]]}],
          [{'polygon':[[True,1],[2,3],[3,1]]}],[{'polygon':[[-1,1],[2,3],[3,1]]}],
          [{'polygon':[[0,0],[16,0],[16,16],[0,16]]}]]
        for i,regions in enumerate(invalid):
            with self.subTest(case=i):
                self.recipe=copy.deepcopy(baseline);self.recipe['layering']['brickRegions']=regions;self.reject()
        self.recipe=copy.deepcopy(baseline);self.recipe['layering']['unknown']=1;self.reject()

    def test_native_payload_raw_adequacy_and_profile_refusals(self):
        baseline=copy.deepcopy(self.source); raw=self.generated.read_bytes()
        for mode,size in [('RGB',(64,64)),('RGB',(128,64)),('RGBA',(128,128))]:
            with self.subTest(mode=mode,size=size):
                self.generated.write_bytes(raw);Image.new(mode,size).save(self.generated)
                self.source=copy.deepcopy(baseline);self.source['inputs']['generated']['sha256']=sha(self.generated.read_bytes())
                self.source['generatedDimensions']=list(size);self.refresh_source();self.reject()
        self.generated.write_bytes(raw)
        for key,value in [('strength',True),('cap',float('inf')),('bands',[1,2,3])]:
            self.source=copy.deepcopy(baseline);self.source['height']['profile'][key]=value;self.refresh_source();self.reject()

    def test_existing_output_and_dangling_symlink_refusals(self):
        out=self.root/'existing';out.mkdir();sentinel=out/'keep';sentinel.write_text('preserve')
        result,_=self.run_cli(output=out);self.assertNotEqual(result.returncode,0);self.assertEqual(sentinel.read_text(),'preserve')
        link=self.root/'link';link.symlink_to(self.root/'missing',target_is_directory=True)
        result,_=self.run_cli(output=link);self.assertNotEqual(result.returncode,0);self.assertTrue(link.is_symlink())
        self.assertFalse((self.root/'missing').exists())

    @unittest.skipUnless(os.environ.get('QUAKED_LAYERED_ACTUAL')=='1','Actual asset fixture is explicitly opt-in')
    def test_actual_recipe_replays_unchanged_rgb_and_full_precision_layer(self):
        recipe=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-006/relief/rtex001-layered.json'
        data=json.loads(recipe.read_text());mp=ROOT/data['sourceMasterPackage'];source=json.loads(mp.read_text())
        sys.path.insert(0,str(TOOLS));from finish_official_texture import finish
        original=Image.open(source['inputs']['original']['file']).convert('RGB');raw=Image.open(source['inputs']['generated']['file']).convert('RGB')
        color,_=finish(original,raw,factor=8,comparison_divisor=2,method='photographic',color_strength=source['registration']['colorStrength'],field_sigma=source['registration']['fieldSigma'])
        expected,_,_,sigma=independent_composition(color,source['height']['profile'],data['layering'])
        watched={recipe:recipe.read_bytes(),mp:mp.read_bytes()}
        watched.update({Path(v['file']):Path(v['file']).read_bytes() for v in source['inputs'].values()})
        result,out=self.run_cli(recipe=recipe);self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(sha((out/'color.png').read_bytes()),data['authoringDiffuseSha256'])
        np.testing.assert_array_equal(np.load(out/'height.npy',allow_pickle=False),expected)
        self.assertEqual(sigma,6)
        self.assertTrue(all(p.read_bytes()==b for p,b in watched.items()))


if __name__=='__main__':
    unittest.main(verbosity=2)
