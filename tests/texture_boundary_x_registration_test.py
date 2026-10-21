"""Focused public tests for guarded X-only reuse of the pinned Y operator.

Synthetic temporary sources only. The expected X Poisson solution is reconstructed
without importing the new adapter or its operator; scalar replay uses the unchanged
recorded physical-height author. No fixture PASS is material or seam acceptance.
"""
import copy
import hashlib
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
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
TOOLS=ROOT/'tools/texture_sheets'
CLI=TOOLS/'register_texture_boundary_x.py'
sha=lambda b:hashlib.sha256(b).hexdigest()


def x_oracle(image):
    values=np.asarray(image.convert('RGB'),dtype=float)
    h,w,_=values.shape
    forcing=np.zeros_like(values);forcing[:,0]=values[:,-1]-values[:,0];forcing[:,-1]=-forcing[:,0]
    eigen=2*np.cos(2*np.pi*np.fft.fftfreq(h))[:,None]+2*np.cos(2*np.pi*np.fft.fftfreq(w))[None,:]-4
    eigen[0,0]=1
    # Axis permutation keeps the published transform's floating operation order;
    # forcing is independently specified on original X, not an imported helper.
    smooth_t=np.fft.ifft2(np.fft.fft2(forcing.transpose(1,0,2),axes=(0,1))/eigen.T[:,:,None],axes=(0,1)).real
    smooth_t-=smooth_t.mean((0,1));smooth=smooth_t.transpose(1,0,2)
    lap=sum(np.roll(smooth,d,a)for a in(0,1)for d in(-1,1))-4*smooth
    assert np.abs(lap-forcing).max()<1e-10
    assert np.abs(smooth.mean((0,1))).max()<1e-10
    raw=values-smooth
    return Image.fromarray(np.rint(np.clip(raw,0,255)).astype('uint8')),raw,smooth


class BoundaryXCLI(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='texture-boundary-x-public-');self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name).resolve();self.counter=0;self.fixture_counter=0
        self.f=self.fixture();self.baseline={p:p.read_bytes()for p in self.f['dir'].rglob('*')if p.is_file()}

    def fixture(self,style='pattern',tools=TOOLS,native=(16,8)):
        self.fixture_counter+=1;folder=self.root/('fixture-'+str(self.fixture_counter));folder.mkdir()
        h,w=native[1]*8,native[0]*8;y,x=np.mgrid[:h,:w]
        if style=='flat':rgb=np.full((h,w,3),80,dtype='uint8')
        elif style=='y-joint':
            rgb=np.repeat(np.where((y%32)<4,35,110)[:,:,None],3,axis=2).astype('uint8')
        elif style=='saturated':
            v=np.where((x+y)%2,255,0);v[:,0]=0;v[:,-1]=255;rgb=np.stack((v,255-v,v),2).astype('uint8')
        elif style=='geometry':
            v=np.full((h,w),100,dtype='uint8');v[8:20,:w//2]=180;v[35:47,w//2:]=180;rgb=np.stack((v,v//2,v//3),2)
        else:rgb=np.stack((45+(3*x+7*y)%117,35+(5*x+2*y)%99,22+(11*x+3*y)%77),2).astype('uint8')
        Image.fromarray(rgb).save(folder/'raw.png');Image.fromarray(rgb).resize(native,Image.Resampling.BOX).save(folder/'native.png')
        (folder/'prompt.txt').write_text('Synthetic public source/master-only fixture; no artwork acceptance.\n')
        result=subprocess.run([sys.executable,str(tools/'prepare_texture_master.py'),'--original',str(folder/'native.png'),
            '--generated',str(folder/'raw.png'),'--prompt',str(folder/'prompt.txt'),'--name','fixture','--edition','base',
            '--profile','stone','--color-strength','0','--output',str(folder/'master')],capture_output=True,text=True,cwd=ROOT,timeout=30)
        self.assertEqual(result.returncode,0,result.stderr)
        f={'dir':folder,'package':folder/'master/master.json','proof':folder/'proof.json','art':folder/'art.json',
           'recipe':folder/'recipe.json','tools':tools,'cli':tools/'register_texture_boundary_x.py'}
        nativeid=sha((folder/'native.png').read_bytes())
        f['id']=nativeid
        f['art'].write_text(json.dumps({'textures':[{'texture':'fixture','nativeIdentityReportedByCandidate':nativeid,'artVerdict':'HOLD'}]}))
        self.seal(f)
        return f

    def seal(self,f=None,master=None):
        f=f or self.f;m=master or json.loads(f['package'].read_text())
        if master is not None:f['package'].write_text(json.dumps(m,indent=2)+'\n')
        inputs=[{'role':role,**row}for role,row in m['inputs'].items()]
        row={'nativeIdentity':f['id'],'name':m['name'],'edition':m['edition'],'sourceMasterOnly':True,
             'verdict':'PASS synthetic public prepare source/master only','masterPackage':{'file':str(f['package']),'sha256':sha(f['package'].read_bytes())},
             'sourceInputs':inputs,'producerBindings':m['tools'],'replayedProfileExact':m['height']['profile'],
             'storedMasterRGB':{'file':str(f['package'].parent/'color.png'),'sha256':m['color']['sha256']},
             'storedMasterScalar':{'file':str(f['package'].parent/'height.npy'),'sha256':m['height']['sha256']}}
        f['proof'].write_text(json.dumps({'verdict':'PASS source/master only','scope':'Synthetic source/master-only public fixture; ART remains HOLD.','materials':[row]},indent=2)+'\n')
        recipe={'schemaVersion':1,'policy':'periodic-boundary-x','nativeIdentity':f['id'],'name':m['name'],'edition':m['edition'],
            'nativeDimensions':m['nativeDimensions'],'sourceMasterPackage':str(f['package']),'sourceMasterPackageSha256':sha(f['package'].read_bytes()),
            'sourceVerification':{'file':str(f['proof']),'sha256':sha(f['proof'].read_bytes())},
            'artHold':{'file':str(f['art']),'sha256':sha(f['art'].read_bytes())},
            'operator':{'file':str(f['tools']/'register_texture_boundary.py'),'sha256':sha((f['tools']/'register_texture_boundary.py').read_bytes())}}
        f['recipe'].write_text(json.dumps(recipe,indent=2)+'\n')

    def restore(self):
        for p,b in self.baseline.items():p.write_bytes(b)

    def run_cli(self,f=None,output=None):
        f=f or self.f;self.assertTrue(f['cli'].is_file(),'X adapter absent: RED prerequisite')
        self.counter+=1;output=output or self.root/('out-'+str(self.counter))
        before={p:p.read_bytes()for p in f['dir'].rglob('*')if p.is_file()}
        result=subprocess.run([sys.executable,str(f['cli']),'--recipe',str(f['recipe']),'--output',str(output)],
                              cwd=ROOT,capture_output=True,text=True,timeout=40)
        self.assertGreaterEqual(result.returncode,0,'Signal is not expected guard rejection')
        self.assertTrue(all(p.read_bytes()==b for p,b in before.items()),'Input modified')
        return result,output

    def success(self,f=None):
        result,out=self.run_cli(f);self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual({p.name for p in out.iterdir()},{'color.png','height.npy','master.json'})
        return out,json.loads((out/'master.json').read_text())

    def reject(self,f=None):
        result,out=self.run_cli(f);self.assertNotEqual(result.returncode,0,result.stdout);self.assertFalse(out.exists())

    def test_exact_nonsquare_x_poisson_and_final_float_height(self):
        m=json.loads(self.f['package'].read_text());old=Image.open(self.f['package'].parent/'color.png').convert('RGB')
        expected,raw,smooth=x_oracle(old);out,r=self.success()
        self.assertEqual(Image.open(out/'color.png').tobytes(),expected.tobytes())
        sys.path.insert(0,str(ROOT/'tools'));from craft_normals import craft
        h,_=craft(np.asarray(expected,dtype=float)/255,m['height']['profile'],quantize_height=False);b=io.BytesIO();np.save(b,h.astype('float32'),allow_pickle=False)
        self.assertEqual((out/'height.npy').read_bytes(),b.getvalue())
        self.assertEqual(r['registration']['periodicBoundary']['axes'],['x']);self.assertEqual(r['inputs'],m['inputs']);self.assertEqual(r['tools'],m['tools'])
        self.assertEqual(r['generationCount'],1);self.assertIn('Unqualified',r['qualification']);self.assertNotIn('tiers',r)
        self.assertEqual(r['revisionTools']['adapter']['sha256'],sha(CLI.read_bytes()))
        self.assertEqual(r['revisionTools']['periodicY']['sha256'],sha((TOOLS/'register_texture_boundary.py').read_bytes()))
        self.assertEqual(r['registration']['periodicBoundary']['before']['wrap_x_mean'],float(np.abs(np.asarray(old,dtype=float)[:,0]-np.asarray(old,dtype=float)[:,-1]).mean()))

    def test_noop_y_joint_saturation_and_geometry_remain_unqualified(self):
        for style in('flat','y-joint','saturated','geometry'):
            with self.subTest(style=style):
                f=self.fixture(style);old=Image.open(f['package'].parent/'color.png').convert('RGB');expected,raw,smooth=x_oracle(old)
                out,r=self.success(f);self.assertEqual(Image.open(out/'color.png').tobytes(),expected.tobytes())
                if style in('flat','y-joint'):self.assertEqual(expected.tobytes(),old.tobytes())
                if style=='saturated':self.assertGreater(float(np.mean((raw<0)|(raw>255))),0)
                self.assertFalse(r['registration']['periodicBoundary']['featureRelocation']);self.assertIn('Unqualified',r['qualification'])

    def test_recipe_proof_native_and_operator_binding_guards(self):
        baseline=json.loads(self.f['recipe'].read_text())
        changes=[lambda r:r.update(nativeIdentity='0'*64),lambda r:r.update(name='different'),lambda r:r.update(edition='other'),
                 lambda r:r.update(nativeDimensions=[8,16]),lambda r:r.update(sourceMasterPackageSha256='0'*64),
                 lambda r:r['sourceVerification'].update(sha256='0'*64),lambda r:r['artHold'].update(sha256='0'*64),
                 lambda r:r['operator'].update(sha256='0'*64),lambda r:r['operator'].update(file=str(TOOLS/'finish_official_texture.py'))]
        for change in changes:
            r=copy.deepcopy(baseline);change(r);self.f['recipe'].write_text(json.dumps(r));self.reject()
        self.restore()
        proof=json.loads(self.f['proof'].read_text());proof['materials'][0]['sourceMasterOnly']=False
        self.f['proof'].write_text(json.dumps(proof));r=copy.deepcopy(baseline);r['sourceVerification']['sha256']=sha(self.f['proof'].read_bytes());self.f['recipe'].write_text(json.dumps(r));self.reject()

    def test_rehashed_rgb_and_scalar_cannot_bypass_source_replay(self):
        for role in('color','height'):
            self.restore();m=json.loads(self.f['package'].read_text());p=self.f['package'].parent/m[role]['file']
            if role=='color':
                im=Image.open(p).copy();im.putpixel((5,5),(1,2,3));im.save(p)
            else:
                values=np.load(p);values[5,5]=.12345;np.save(p,values)
            m[role]['sha256']=sha(p.read_bytes());self.seal(master=m);self.reject()

    def test_metadata_precision_profile_and_source_tool_guards(self):
        mutations=[lambda m:m.update(generationCount=True),lambda m:m.update(generationCount=1.0),
                   lambda m:m.update(masterRevision={}),lambda m:m['registration'].update(periodicBoundary={}),
                   lambda m:m['height'].update(authoringPolicy={}),lambda m:m['color'].update(file='alias.png'),
                   lambda m:m['registration'].update(verticalLandmarks=[[0,0],[8,8]]),
                   lambda m:m['height']['profile'].update(strength=True),lambda m:m['height']['profile'].update(cap=float('nan')),
                   lambda m:m['tools'].update(finish={'file':str(TOOLS/'derive_texture_tiers.py'),'sha256':sha((TOOLS/'derive_texture_tiers.py').read_bytes())}),
                   lambda m:m['tools']['finish'].update(sha256='0'*64)]
        for change in mutations:
            self.restore();m=json.loads(self.f['package'].read_text());change(m);self.seal(master=m);self.reject()
        for kind in('trailing','nan','fortran','integer'):
            self.restore();m=json.loads(self.f['package'].read_text());p=self.f['package'].parent/'height.npy';a=np.load(p)
            if kind=='trailing':p.write_bytes(p.read_bytes()+b'x')
            elif kind=='nan':a[0,0]=np.nan;np.save(p,a)
            elif kind=='fortran':np.save(p,np.asfortranarray(a))
            else:np.save(p,a.astype('uint8'))
            m['height']['sha256']=sha(p.read_bytes());self.seal(master=m);self.reject()

    def test_existing_and_dangling_destinations_preserved(self):
        out,_=self.success();before={p:p.read_bytes()for p in out.iterdir()}
        result,_=self.run_cli(output=out);self.assertNotEqual(result.returncode,0);self.assertTrue(all(p.read_bytes()==b for p,b in before.items()))
        owner=self.root/'owner';owner.write_bytes(b'keep');result,_=self.run_cli(output=owner);self.assertNotEqual(result.returncode,0);self.assertEqual(owner.read_bytes(),b'keep')
        link=self.root/'dangling';link.symlink_to(self.root/'missing');result,_=self.run_cli(output=link);self.assertNotEqual(result.returncode,0);self.assertTrue(link.is_symlink());self.assertFalse((self.root/'missing').exists())


if __name__=='__main__':unittest.main(verbosity=2)
