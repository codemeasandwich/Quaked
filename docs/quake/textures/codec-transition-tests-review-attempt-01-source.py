"""Public mixed-codec batch review tests using temporary source-bound packages.

Actual delivered maps are decoded and compared with each required review panel.
No artwork, native-family, runtime or owner acceptance is implied by these tests.
"""
import copy
import hashlib
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
CLI = ROOT / 'tools/texture_sheets/build_quake_texture_batch_review.py'
DERIVE = ROOT / 'tools/texture_sheets/derive_quake_texture_tiers.py'
PREPARE = ROOT / 'tools/texture_sheets/prepare_texture_master.py'
ROLES = ('diffuse','height','normalX','normalY','normalZ')
sha = lambda data:hashlib.sha256(data).hexdigest()


class QuakeTextureBatchReviewCLI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='quake-role-review-public-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.counter = 0

    def command(self, cli, args, timeout=35):
        self.assertTrue(cli.is_file(), 'Required additive Quake CLI absent; RED implementation prerequisite')
        result = subprocess.run([sys.executable,str(cli),*map(str,args)],cwd=ROOT,
                                capture_output=True,text=True,timeout=timeout,check=False)
        self.assertGreaterEqual(result.returncode,0,'Signal is not an expected validation rejection')
        return result

    def fixture(self):
        original=self.root/'native.png'; generated=self.root/'generated.png'; prompt=self.root/'prompt.txt'
        Image.new('RGB',(16,8),(220,20,20)).save(original)
        Image.new('RGB',(128,64),(20,220,20)).save(generated)
        prompt.write_text('Synthetic offline public CLI fixture; no generated material or art acceptance.\n')
        master=self.root/'master'
        prepared=self.command(PREPARE,['--original',original,'--generated',generated,'--prompt',prompt,
            '--name','fixture','--edition','quake','--profile','stone','--color-strength','0','--output',master])
        self.assertEqual(prepared.returncode,0,prepared.stderr)
        tier=self.root/'tiers'
        derived=self.command(DERIVE,['--original',original,'--master',master/'color.png',
            '--height-master',master/'height.npy','--output',tier])
        self.assertEqual(derived.returncode,0,derived.stderr)
        receipt=json.loads((tier/'manifest.json').read_text())
        item={'name':'fixture','edition':'quake','original':'native.png',
              'nativeIdentity':{'width':16,'height':8},
              'masterPackage':'master/master.json','masterPackageSha256':sha((master/'master.json').read_bytes()),
              'tierReceipt':'tiers/manifest.json','tierReceiptSha256':sha((tier/'manifest.json').read_bytes()),
              'tiers':{name:{'factor':row['factor'],'dimensions':row['dimensions'],
                       'files':{role:'tiers/'+rec['file']for role,rec in row['outputs'].items()}}
                       for name,row in receipt['tiers'].items()}}
        batch={'schemaVersion':3,'pathsBase':'repository','family':'quake','defaultTier':'Mid',
               'tierFactors':{'Mid':4,'High':8},'encodingByRole':receipt['encodingByRole'],'items':[item]}
        self.batch_path=self.root/'batch.json'; self.batch_path.write_text(json.dumps(batch,indent=2)+'\n')
        return batch,receipt

    def run_review(self, batch=None, output=None):
        if batch is not None:self.batch_path.write_text(json.dumps(batch,indent=2)+'\n')
        self.counter+=1;output=output or self.root/('review-'+str(self.counter))
        result=self.command(CLI,['--batch',self.batch_path,'--paths-root',self.root,'--output',output])
        return result,output

    def rejected(self,batch):
        result,output=self.run_review(batch)
        self.assertNotEqual(result.returncode,0,result.stdout)
        self.assertFalse(output.exists(),'Invalid review descriptor published an output directory')

    def test_truthful_mixed_codec_index_and_actual_decoded_review_panels(self):
        batch,receipt=self.fixture()
        watched={p:p.read_bytes()for p in self.root.rglob('*')if p.is_file()}
        result,output=self.run_review()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual({p:p.read_bytes()for p in watched},watched,'Review changed source packages')
        html=(output/'index.html').read_text()
        self.assertIn('lossless',html.lower());self.assertIn('92',html)
        self.assertNotIn('Every enhanced map is lossy',html)
        self.assertIn('Mid',html);self.assertIn('default',html.lower())
        self.assertEqual({p.name for p in output.iterdir()}, {'index.html',
            'fixture-mid-review.jpg','fixture-mid-relief.jpg','fixture-high-review.jpg','fixture-high-relief.jpg'})
        original=Image.open(self.root/'native.png').convert('RGB')
        for tier in ('Mid','High'):
            delivered={role:Image.open(self.root/batch['items'][0]['tiers'][tier]['files'][role]).convert('RGB')
                       for role in ROLES}
            review=Image.open(output/('fixture-'+tier.lower()+'-review.jpg')).convert('RGB')
            relief=Image.open(output/('fixture-'+tier.lower()+'-relief.jpg')).convert('RGB')
            # Compare actual native/decoded replacement reduced with the mandated
            # BOX operation. JPEG is independently reproduced from the panel
            # pixels on the same canvas to account for block quantization.
            for divisor,y in ((2,595),(4,830)):
                dims=(original.width//divisor,original.height//divisor)
                native=original.resize(dims,Image.Resampling.BOX).resize((dims[0]*3,dims[1]*3),Image.Resampling.NEAREST)
                diffuse=delivered['diffuse'].resize(dims,Image.Resampling.BOX).resize(native.size,Image.Resampling.NEAREST)
                for expected,x in ((native,540),(diffuse,550+native.width)):
                    observed=np.asarray(review.crop((x,y,x+expected.width,y+expected.height)),dtype=float)
                    # Green and red are widely separated; allow JPEG edge bleed,
                    # while still proving every crop uses its named source.
                    self.assertLess(np.abs(observed-np.asarray(expected,dtype=float)).mean(),12)
            h=delivered['height']; thumbnail=h.copy();thumbnail.thumbnail((512,512))
            observed=np.asarray(relief.crop((10,30,10+thumbnail.width,30+thumbnail.height)),dtype=float)
            self.assertLess(np.abs(observed-np.asarray(thumbnail,dtype=float)).mean(),5)
            vector=np.stack([np.asarray(delivered['normal'+c],dtype=float)[:,:,0]for c in 'XYZ'],2)/127.5-1
            vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-12)
            for idx,direction in enumerate((np.array([.6,.3,.75]),np.array([-.6,-.3,.75]))):
                direction/=np.linalg.norm(direction)
                light=.35+.65*np.clip((vector*direction).sum(2),0,1)
                image=Image.fromarray(np.uint8(np.clip(np.asarray(delivered['diffuse'],dtype=float)*light[:,:,None],0,255)))
                image.thumbnail((512,512));x=10 if idx==0 else 610
                actual=np.asarray(relief.crop((x,580,x+image.width,580+image.height)),dtype=float)
                self.assertLess(np.abs(actual-np.asarray(image,dtype=float)).mean(),5)

    def test_rejects_policy_missing_role_hash_native_and_receipt_mismatches(self):
        baseline,_=self.fixture()
        edits=[('old-schema',lambda j:j.update(schemaVersion=2)),
               ('default',lambda j:j.update(defaultTier='High')),
               ('factor',lambda j:j['tierFactors'].update(Mid=8)),
               ('blanket',lambda j:j.update(lossless=False)),
               ('height-lossy',lambda j:j['encodingByRole']['height'].update(lossless=False)),
               ('missing-policy',lambda j:j['encodingByRole'].pop('normalZ')),
               ('extra-mask-policy',lambda j:j['encodingByRole'].update(mask={'lossless':True,'method':6})),
               ('missing-map',lambda j:j['items'][0]['tiers']['Mid']['files'].pop('normalZ')),
               ('native-dimensions',lambda j:j['items'][0]['nativeIdentity'].update(width=32)),
               ('receipt-hash',lambda j:j['items'][0].update(tierReceiptSha256='0'*64)),
               ('master-hash',lambda j:j['items'][0].update(masterPackageSha256='0'*64)),
               ('different-native',lambda j:j['items'][0].update(original='generated.png')),
               ('tier-path-escape',lambda j:j['items'][0]['tiers']['Mid']['files'].update(height='../outside.webp'))]
        for label,edit in edits:
            with self.subTest(case=label):
                batch=copy.deepcopy(baseline);edit(batch);self.rejected(batch)

    def test_tampered_map_and_master_are_rejected_before_output(self):
        batch,_=self.fixture()
        for p in [self.root/batch['items'][0]['tiers']['Mid']['files']['height'], self.root/'master/color.png']:
            before=p.read_bytes()
            try:
                p.write_bytes(before+b'x');self.rejected(batch)
            finally:p.write_bytes(before)

    def test_a_lossy_data_map_cannot_pass_by_updating_its_hash_receipts(self):
        batch,receipt=self.fixture()
        rec=receipt['tiers']['Mid']['outputs']['height']
        path=self.root/batch['items'][0]['tiers']['Mid']['files']['height']
        stream=io.BytesIO()
        Image.open(path).convert('L').save(stream,'WEBP',quality=92,lossless=False,method=6)
        payload=stream.getvalue();path.write_bytes(payload)
        # Keep the claimed lossless policy, but make every byte hash truthful.
        # The review must inspect the actual codec rather than trust the labels.
        rec.update(sha256=sha(payload),bytes=len(payload))
        receipt_path=self.root/'tiers/manifest.json'
        receipt_path.write_text(json.dumps(receipt,indent=2)+'\n')
        batch['items'][0]['tierReceiptSha256']=sha(receipt_path.read_bytes())
        self.rejected(batch)

    def test_existing_output_and_symlink_are_preserved(self):
        self.fixture();result,output=self.run_review();self.assertEqual(result.returncode,0,result.stderr)
        before={p.name:p.read_bytes()for p in output.iterdir()}
        for target in (output,self.root/'output-link'):
            if target!=output:target.symlink_to(output,target_is_directory=True)
            result,_=self.run_review(output=target);self.assertNotEqual(result.returncode,0)
            self.assertEqual({p.name:p.read_bytes()for p in output.iterdir()},before)


if __name__ == '__main__':
    unittest.main(verbosity=2)
