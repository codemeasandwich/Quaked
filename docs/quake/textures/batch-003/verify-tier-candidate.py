"""Reuse maintained independent public-test oracles on one actual candidate.
Writes only a fresh report; never imports the tier producer as its own oracle.
"""
from pathlib import Path
import sys,json,hashlib,importlib.util,datetime
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[4]
sha=lambda b:hashlib.sha256(b).hexdigest()
watched={}
def read(path):
 p=Path(path).resolve();p.relative_to(ROOT);b=p.read_bytes();assert p not in watched or watched[p]==sha(b);watched[p]=sha(b);return b
def module(path,name):
 read(path);spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
batch_path=(ROOT/sys.argv[1]).resolve();report_path=(ROOT/sys.argv[2]).resolve();report_path.relative_to(ROOT);assert not report_path.exists()
test=module(ROOT/'tests/quake_texture_tiers_test.py','actual_quake_public_oracle');layered=module(ROOT/'tests/texture_layered_master_test.py','actual_layered_public_oracle')
read(ROOT/'tests/hexen2_texture_tiers_test.py');native_proof=json.loads(read(ROOT/'docs/quake/textures/batch-003/native-source-proof.json'));proof_rows={m['nativeIdentity']:m for m in native_proof['materials']}
batch=json.loads(read(batch_path));rows=[]
for item in batch['items']:
 native=proof_rows[item['nativeIdentity']['id']];mp=(ROOT/item['masterPackage']).resolve();tp=(ROOT/item['tierReceipt']).resolve();mb=read(mp);tb=read(tp)
 assert sha(mb)==item['masterPackageSha256']and sha(tb)==item['tierReceiptSha256'];master=json.loads(mb);receipt=json.loads(tb)
 assert master['name']==item['name']and master['nativeDimensions']==native['nativeDimensions']and master['generationCount']==1
 assert master['inputs']['original']['sha256']==native['originalSha256']
 for row in master['inputs'].values():assert sha(read(row['file']))==row['sha256']
 for row in master['tools'].values():assert sha(read(row['file']))==row['sha256']
 for tier in receipt['tiers'].values():
  for row in tier['outputs'].values():read(tp.parent/row['file'])
 case=test.QuakeTextureTiersCLI();case.original=Path(receipt['inputs']['original']['file']).resolve();case.master=Path(receipt['inputs']['master']['file']).resolve();case.height_file=Path(receipt['inputs']['heightMaster']['file']).resolve()
 assert case.original==(ROOT/item['original']).resolve()
 assert case.master==(mp.parent/master['color']['file']).resolve()and case.height_file==(mp.parent/master['height']['file']).resolve()
 assert sha(read(case.master))==master['color']['sha256']and sha(read(case.height_file))==master['height']['sha256']
 case.native=Image.open(case.original).size;case.rgb=Image.open(case.master).convert('RGB');case.scalar=np.load(case.height_file,allow_pickle=False)
 assert np.isfinite(case.scalar).all()and case.scalar.dtype==np.dtype('float32')
 if 'layeredRelief'in master:
  recipe=master['layeredRelief']['recipe'];expected,_,mask,sigma=layered.independent_composition(case.rgb,master['height']['profile'],recipe['layering']);assert np.array_equal(case.scalar,expected);assert sigma==master['layeredRelief']['bevelSigmaMasterPixels']
 decoded=case.verify_output(tp.parent,receipt)
 rows.append({'name':item['name'],'nativeIdentity':native['nativeIdentity'],'masterPackage':{'file':str(mp.relative_to(ROOT)),'sha256':sha(mb)},'tierReceipt':{'file':str(tp.relative_to(ROOT)),'sha256':sha(tb)},'exactDirectMasterRoleExports':10,'losslessExactDataMaps':8,'colourQ92Method6':2,'independentLayeredFieldReconstruction':'PASS'if'layeredRelief'in master else'Not layered; initialsource/masterproof separatelybindsfield','scope':'Numerical/source/codec PASS only; art/physical semantic and browser/runtime acceptance separate'})
for path,digest in watched.items():assert sha(path.read_bytes())==digest
r={'verdict':'PASS independent actual candidate public checks','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Maintained independent BOX/wrappedRGB/cyclicnormal/Q92/VP8L oracles on actualdecodedoutputs; wholeuncompressedmasterinputbindings andexplicitquantization diagnostics. Nativeidentity rebinds freshselected8occurrence proof. No newPAKaudit, artorallcampaign/runtimeclaim.','verifier':{'file':str(Path(__file__).relative_to(ROOT)),'sha256':sha(read(__file__))},'candidateBatch':{'file':str(batch_path.relative_to(ROOT)),'sha256':sha(read(batch_path))},'materials':rows,'watchedInputs':[{'file':str(p.relative_to(ROOT)),'sha256':h}for p,h in watched.items()]}
report_path.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'verdict':'PASS','materials':len(rows),'exactRoleExports':len(rows)*10,'watchedInputs':len(watched)}))
