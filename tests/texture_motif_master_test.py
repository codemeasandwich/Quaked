"""Independent portable public CLI checks for local pigment motif authoring.

Default fixtures require no game assets. The Gaussian oracle uses direct
circular convolution and the resize oracle uses an analytical cubic kernel;
no producer helper implements the expected values. Actual game integration is
separate and explicitly requested after its source recipe is sealed.
"""
import copy
import hashlib
import importlib.util
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
from PIL import Image,features

ROOT=Path(__file__).resolve().parents[1];TOOLS=ROOT/'tools/texture_sheets'
CLI=Path(os.environ.get('QUAKED_MOTIF_CLI',TOOLS/'prepare_motif_texture_master.py'))
sha=lambda b:hashlib.sha256(b).hexdigest()


def independent_alpha(shape,reference,policy):
    h,w=shape;rw,rh=reference
    yy,xx=np.mgrid[:h,:w];xx=(xx+.5)*rw/w;yy=(yy+.5)*rh/h
    result=np.zeros((h,w),dtype=float)
    def ramp(distance):
        t=np.clip(distance/policy['featherNativePixels'],0,1)
        return 3*t*t-2*t*t*t
    for l,t,r,b in policy['regions']:
        result += ramp(xx-l)*ramp(r-xx)*ramp(yy-t)*ramp(b-yy)
    return result


def direct_periodic_gaussian(values,sigma):
    # Analytic frequency response transformed explicitly into each spatial
    # kernel, then direct circular convolution; not the producer's 2D FFT.
    result=np.asarray(values,dtype=float)
    for axis in (0,1):
        n=result.shape[axis];f=np.fft.fftfreq(n)
        response=np.exp(-2*np.pi**2*sigma**2*f*f)
        weights=np.cos(2*np.pi*np.arange(n)[:,None]*f[None,:])@response/n
        result=sum(float(weight)*np.roll(result,lag,axis=axis)for lag,weight in enumerate(weights))
    return result


def periodic_cubic(values,width,height):
    # Same documented bicubic reconstruction, independently using four
    # periodic neighbours and a=-.5 kernel. Pillow F rounds after each pass.
    def kernel(x):
        t=np.abs(x);return np.where(t<1,1-2.5*t*t+1.5*t*t*t,
          np.where(t<2,2-4*t+2.5*t*t-.5*t*t*t,0))
    a=np.asarray(values,dtype='float32')
    for axis,target in ((1,width),(0,height)):
        n=a.shape[axis];positions=(np.arange(target)+.5)*n/target-.5
        lo=np.floor(positions).astype(int)
        output=np.zeros((target,*np.moveaxis(a,axis,0).shape[1:]),dtype=float)
        weights=np.stack([kernel(positions-(lo+j))for j in(-1,0,1,2)])
        weights/=weights.sum(0)
        moved=np.moveaxis(a,axis,0)
        for index,j in enumerate((-1,0,1,2)):
            shape=(target,)+(1,)*(moved.ndim-1)
            output += moved[(lo+j)%n]*weights[index].reshape(shape)
        a=np.moveaxis(output.astype('float32'),0,axis)
    return a


def independent_restore(native,base,policy):
    native=np.asarray(native,dtype=float);base=np.asarray(base,dtype=float)
    nh,nw=native.shape[:2];h,w=base.shape[:2];factor=w//nw
    # Explicit cell means establish the native-area field independently.
    reduced=np.stack([np.stack([base[y*factor:(y+1)*factor,x*factor:(x+1)*factor].mean((0,1))
        for x in range(nw)])for y in range(nh)])
    field=direct_periodic_gaussian(native-reduced,policy['fieldSigmaNativePixels'])
    field=periodic_cubic(field,w,h)
    alpha=independent_alpha((h,w),(nw,nh),policy)
    raw=base+policy['strength']*alpha[:,:,None]*field
    return np.rint(np.clip(raw,0,255)).astype('uint8'),alpha


def producer():
    sys.path[:0]=[str(TOOLS),str(ROOT/'tools')]
    spec=importlib.util.spec_from_file_location('motif_cli_under_test',CLI)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod


class MotifMasterCLI(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory(prefix='texture-motif-public-');self.addCleanup(tmp.cleanup)
        self.root=Path(tmp.name).resolve();self.counter=0
        self.original=self.root/'native.png';self.generated=self.root/'raw.png';self.prompt=self.root/'prompt.txt'
        y,x=np.mgrid[:128,:128]
        pixels=np.stack((45+(3*x+7*y)%117,35+(5*x+2*y)%99,22+(11*x+3*y)%77),axis=2).astype('uint8')
        Image.fromarray(pixels).save(self.generated)
        native=np.asarray(Image.fromarray(pixels).resize((16,16),Image.Resampling.BOX)).copy()
        native[4:8,3:8]=(30,30,80);native[5:7,4:7]=(50,85,20)
        native[9:13,11:14]=(30,30,80);native[10:12,12:13]=(50,85,20)
        Image.fromarray(native).save(self.original)
        self.prompt.write_text('One source; preserve exact motif intention and photographic material.\n')
        self.package=self.root/'source/master.json';self.make_package()
        self.source=json.loads(self.package.read_text());self.proof=self.root/'proof.json';self.recipe_path=self.root/'motifs.json'
        self.recipe={'schemaVersion':1,'name':'synthetic','edition':'base','nativeIdentity':'b'*64,
          'nativeDimensions':[16,16],'authoredAtMasterDimensions':[128,128],
          'policy':'native-colour-motifs','sourceMasterPackage':str(self.package),
          'originalSha256':sha(self.original.read_bytes()),'authoringDiffuseSha256':self.source['color']['sha256'],
          'motifs':{'referenceSize':[16,16],'regions':[[2.5,3.5,8.5,8.5],[10.5,8.5,14.5,13.5]],
           'featherNativePixels':.5,'fieldSigmaNativePixels':.35,'strength':.95,'heightPolicy':'preserve-initial-float32'}}
        self.refresh_source()

    def make_package(self,extra=()):
        run=subprocess.run([sys.executable,str(TOOLS/'prepare_texture_master.py'),'--original',str(self.original),
          '--generated',str(self.generated),'--prompt',str(self.prompt),'--name','synthetic','--edition','base',
          '--profile','carch','--output',str(self.package.parent),*extra],cwd=ROOT,capture_output=True,text=True,timeout=30)
        self.assertEqual(run.returncode,0,run.stderr)

    def refresh_source(self):
        self.package.write_text(json.dumps(self.source,indent=2)+'\n')
        digest=sha(self.package.read_bytes());self.recipe['sourceMasterPackageSha256']=digest
        self.proof.write_text(json.dumps({'verdict':'PASS synthetic contract fixture','materials':[{
           'nativeIdentity':'b'*64,'name':'synthetic','edition':'base','masterPackage':{'file':str(self.package),'sha256':digest}}]})+'\n')
        self.recipe['sourceVerification']={'file':str(self.proof),'sha256':sha(self.proof.read_bytes())}

    def run_cli(self,output=None):
        self.counter+=1;output=output or self.root/('out-'+str(self.counter))
        self.recipe_path.write_text(json.dumps(self.recipe,indent=2)+'\n')
        before={p:p.read_bytes()for p in self.root.rglob('*')if p.is_file()}
        run=subprocess.run([sys.executable,str(CLI),'--recipe',str(self.recipe_path),'--output',str(output)],
          cwd=ROOT,env={**os.environ,'PYTHONPATH':str(TOOLS)},capture_output=True,text=True,timeout=45)
        self.assertGreaterEqual(run.returncode,0,'Signal is not expected rejection')
        self.assertTrue(all(p.is_file()and p.read_bytes()==b for p,b in before.items()),'Input modified')
        return run,output

    def reject(self):
        run,out=self.run_cli();self.assertNotEqual(run.returncode,0,'Malformed input accepted')
        self.assertFalse(out.exists(),'Invalid input created output')

    def test_full_independent_oracle_height_bytes_and_no_old_binary_dependency(self):
        base=(self.package.parent/'color.png').read_bytes();height=(self.package.parent/'height.npy').read_bytes()
        expected,alpha=independent_restore(Image.open(self.original),Image.open(io.BytesIO(base)),self.recipe['motifs'])
        self.assertTrue(np.any(expected!=np.asarray(Image.open(io.BytesIO(base)))))
        (self.package.parent/'color.png').unlink();(self.package.parent/'height.npy').unlink()
        self.source['environment']={'python':'historical','pillow':'historical'};self.refresh_source()
        run,out=self.run_cli();self.assertEqual(run.returncode,0,run.stderr)
        self.assertEqual({p.name for p in out.iterdir()},{'color.png','height.npy','master.json'})
        actual=np.asarray(Image.open(out/'color.png').convert('RGB'))
        np.testing.assert_array_equal(actual,expected)
        np.testing.assert_array_equal(actual[alpha==0],np.asarray(Image.open(io.BytesIO(base)))[alpha==0])
        self.assertEqual((out/'height.npy').read_bytes(),height)
        meta=json.loads((out/'master.json').read_text())
        self.assertTrue(meta['masterRevision']['heightUnchanged']);self.assertTrue(meta['masterRevision']['notAnotherGeneration'])
        self.assertEqual(meta['height']['sha256'],self.source['height']['sha256']);self.assertEqual(meta['generationCount'],1)
        self.assertTrue(meta['height']['authoredOnce']);self.assertFalse(meta['height']['quantizedTo8Bit'])
        self.assertEqual(meta['motifRestoration']['recipe'],self.recipe)
        self.assertEqual(meta['motifRestoration']['recipeSha256'],sha(self.recipe_path.read_bytes()))
        self.assertEqual(meta['tools']['motifAuthoring']['sha256'],sha(CLI.read_bytes()))
        self.assertEqual((meta['environment']['pillow'],meta['environment']['numpy'],meta['environment']['libwebp']),
          (PIL.__version__,np.__version__,features.version('webp')))
        self.assertEqual(meta['environment']['executable'],sys.executable)
        self.assertNotIn('tiers',meta)

    def test_constant_delta_noop_and_actual_support_corner_product(self):
        mod=producer();policy=copy.deepcopy(self.recipe['motifs'])
        source=np.full((16,16,3),(80,90,100),dtype='uint8');base=np.full((128,128,3),(60,60,60),dtype='uint8')
        result,alpha,stats=mod.restore_motifs(source,base,policy)
        wanted=base.astype(float)+alpha[:,:,None]*.95*np.array([20,30,40])
        np.testing.assert_array_equal(result,np.rint(wanted).astype('uint8'))
        noop,_,_=mod.restore_motifs(np.full((16,16,3),60,dtype='uint8'),base,policy)
        np.testing.assert_array_equal(noop,base)
        policy['referenceSize']=[64,64];policy['regions']=[[5.5,28.5,14.5,34.5],[49.5,28.5,58.5,34.5]]
        _,a,s=mod.restore_motifs(np.full((64,64,3),60,dtype='uint8'),np.full((512,512,3),60,dtype='uint8'),policy)
        self.assertEqual(s['supportPixels'],6912);self.assertEqual(s['fullWeightPixels'],5120)
        np.testing.assert_allclose(a,independent_alpha((512,512),(64,64),policy),rtol=0,atol=2e-16)
        ramp=3*(.125**2)-2*(.125**3)
        self.assertAlmostEqual(a[228,44],ramp*ramp,places=14)
        self.assertAlmostEqual(a[240,44],ramp,places=14)
        self.assertTrue((a[0]==0).all()and(a[-1]==0).all()and(a[:,0]==0).all()and(a[:,-1]==0).all())

    def test_repeated_policy_key_presence_refusals(self):
        baseline=copy.deepcopy(self.source)
        for key in('masterRevision','motifRestoration','layeredRelief'):
            for value in(None,False):
                with self.subTest(key=key,value=value):
                    self.source=copy.deepcopy(baseline);self.source[key]=value;self.refresh_source();self.reject()

    def test_bounded_nonboolean_finite_policy_and_geometry_refusals(self):
        baseline=copy.deepcopy(self.recipe)
        cases=[('strength',True),('strength',float('nan')),('strength',1.1),('fieldSigmaNativePixels',.1),
          ('fieldSigmaNativePixels',float('inf')),('featherNativePixels',0),('featherNativePixels',True),
          ('heightPolicy','recraft-from-pigment'),('referenceSize',[8,16]),('regions',[]),
          ('regions',[[0,3,6,8]]),('regions',[[3,3,3,8]]),('regions',[[3,3,4,4]]),
          ('regions',[[3,3,8,8],[7,7,12,12]]),('regions',[[1,1,14,14]]),
          ('regions',[[3,3,float('nan'),8]]),('regions',[{'polygon':[[3,3],[4,3],[4,4]]}])]
        for key,value in cases:
            with self.subTest(key=key,value=value):
                self.recipe=copy.deepcopy(baseline);self.recipe['motifs'][key]=value;self.reject()
        self.recipe=copy.deepcopy(baseline);self.recipe['motifs']['extra']=1;self.reject()

    def test_identity_proof_and_source_hash_refusals(self):
        baseline=copy.deepcopy(self.recipe)
        for key,value in [('sourceMasterPackageSha256','0'*64),('originalSha256','0'*64),('authoringDiffuseSha256','0'*64),
           ('nativeIdentity','a'*64),('name','other'),('edition','portals'),('nativeDimensions',[8,16]),('authoredAtMasterDimensions',[64,128])]:
            with self.subTest(key=key):self.recipe=copy.deepcopy(baseline);self.recipe[key]=value;self.reject()
        self.recipe=copy.deepcopy(baseline);self.recipe['sourceVerification']['sha256']='0'*64;self.reject()

    def test_canonical_tool_input_replay_and_format_refusals(self):
        baseline=copy.deepcopy(self.source);variants=[]
        for role in('original','generated','prompt'):
            d=copy.deepcopy(baseline);d['inputs'][role]['sha256']='0'*64;variants.append(d)
        d=copy.deepcopy(baseline);d['tools']['craft']['file']=str(self.prompt);variants.append(d)
        d=copy.deepcopy(baseline);d['tools']['craft']['sha256']='0'*64;variants.append(d)
        d=copy.deepcopy(baseline);d['tools']['extra']=d['tools']['craft'];variants.append(d)
        d=copy.deepcopy(baseline);del d['tools']['derive'];variants.append(d)
        d=copy.deepcopy(baseline);d['inputs']['extra']=d['inputs']['prompt'];variants.append(d)
        d=copy.deepcopy(baseline);d['height']['sha256']='0'*64;variants.append(d)
        d=copy.deepcopy(baseline);d['color']['sha256']='0'*64;variants.append(d)
        d=copy.deepcopy(baseline);d['height']['authoringPolicy']=None;variants.append(d)
        d=copy.deepcopy(baseline);d['registration']['periodicBoundary']=None;variants.append(d)
        d=copy.deepcopy(baseline);d['registration']['axis']='x';variants.append(d)
        d=copy.deepcopy(baseline);d['height']['profile']['cap']=float('inf');variants.append(d)
        for i,d in enumerate(variants):
            with self.subTest(case=i):self.source=d;self.refresh_source();self.reject()
        raw=self.generated.read_bytes()
        for mode,size in [('RGB',(64,64)),('RGB',(128,64)),('RGBA',(128,128))]:
            with self.subTest(mode=mode,size=size):
                Image.new(mode,size).save(self.generated);self.source=copy.deepcopy(baseline)
                self.source['inputs']['generated']['sha256']=sha(self.generated.read_bytes());self.source['generatedDimensions']=list(size)
                self.refresh_source();self.reject()
        self.generated.write_bytes(raw)

    def test_measured_x_landmark_source_replay(self):
        # A second independent prepare package exercises the existing axis path.
        self.package=self.root/'measured/master.json';lm=self.root/'landmarks.json'
        lm.write_text(json.dumps({'axis':'x','points':[[0,0],[8,6],[16,16]]}))
        self.make_package(['--landmarks',str(lm)]);self.source=json.loads(self.package.read_text())
        self.recipe['sourceMasterPackage']=str(self.package);self.recipe['authoringDiffuseSha256']=self.source['color']['sha256'];self.refresh_source()
        base=Image.open(self.package.parent/'color.png').convert('RGB');wanted,_=independent_restore(Image.open(self.original),base,self.recipe['motifs'])
        height=(self.package.parent/'height.npy').read_bytes();run,out=self.run_cli();self.assertEqual(run.returncode,0,run.stderr)
        np.testing.assert_array_equal(np.asarray(Image.open(out/'color.png')),wanted)
        self.assertEqual((out/'height.npy').read_bytes(),height)

    def test_existing_output_and_symlink_refusals(self):
        out=self.root/'existing';out.mkdir();sentinel=out/'keep';sentinel.write_text('preserve')
        run,_=self.run_cli(out);self.assertNotEqual(run.returncode,0);self.assertEqual(sentinel.read_text(),'preserve')
        link=self.root/'link';link.symlink_to(self.root/'missing',target_is_directory=True)
        run,_=self.run_cli(link);self.assertNotEqual(run.returncode,0);self.assertTrue(link.is_symlink());self.assertFalse((self.root/'missing').exists())


if __name__=='__main__':unittest.main(verbosity=2)
