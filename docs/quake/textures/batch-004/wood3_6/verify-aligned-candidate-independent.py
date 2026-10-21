"""Bounded source/attachment/public-interface proof for repaired wood3_6 only.

No asset mutation, new authoring mathematics, rendering or browser action.
Preserves the ordinary prepare receipt separately from its lineage attachment.
"""
from pathlib import Path
import copy
import datetime
import hashlib
import importlib.util
import io
import json
import shutil
import subprocess
import sys
import tempfile
import traceback

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[5]
HERE=Path(__file__).resolve().parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-004/wood3_6'
OUT=HERE/'independent-aligned-source-tier-proof.json'
assert not OUT.exists()
sha=lambda b:hashlib.sha256(b).hexdigest()
watched={}
def read(path):
    p=Path(path).resolve();p.relative_to(ROOT);data=p.read_bytes()
    assert p not in watched or watched[p]==sha(data),'Concurrent input change'
    watched[p]=sha(data);return data
def checked(row,base=ROOT):
    p=(base/row['file']).resolve();data=read(p)
    assert sha(data)==row['sha256'];return p,data
def ref(path):
    p=Path(path).resolve();return {'file':str(p.relative_to(ROOT)),'sha256':sha(read(p))}
report={'schemaVersion':1,'recordType':'Independent repaired wood3_6 source/attachment and both-tier mathematical proof',
 'reviewer':'/root/quake_checkpoint_review independent from root repair/master author',
 'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'HOLD verification not complete'}
scratch=None
try:
    batch_path=HERE/'candidate-aligned-v1-batch.json';batch_bytes=read(batch_path)
    assert sha(batch_bytes)=='9340eb7995fbd1686d4dcf54a31e184c23a91f3ebe056ce68db3e720b03562db'
    batch=json.loads(batch_bytes);assert batch['schemaVersion']==3 and len(batch['items'])==1
    item=batch['items'][0];assert item['name']=='wood3_6' and item['edition']=='rogue'
    native_id='2313e68258ba0197b1b1d1423bc1c2880b4cd5ea2ac4ca8e6d5f2a558f702ed6'
    assert item['nativeIdentity']['id']==native_id
    native_doc=json.loads(read(ROOT/'docs/quake/textures/batch-004/native-source-proof.json'))
    selected=[x for x in native_doc['materials']if x['nativeIdentity']==native_id]
    assert len(selected)==1;native=selected[0]
    assert item['nativeIdentity']=={'id':native_id,'width':64,'height':64,**native['identity']}
    original_path=ROOT/item['original'];original_bytes=read(original_path)
    original=Image.open(io.BytesIO(original_bytes));assert original.size==(64,64) and original.format=='PNG'
    assert sha(original_bytes)==native['originalSha256'] and sha(original.convert('RGBA').tobytes())==native['identity']['rgbaSha256']
    mp=ROOT/item['masterPackage'];master_bytes=read(mp);assert sha(master_bytes)==item['masterPackageSha256']
    master=json.loads(master_bytes);assert master['generationCount']==1
    lineage_path,lineage_bytes=checked(master['sourceComposition']);lineage=json.loads(lineage_bytes)
    review_path,review_bytes=checked(master['sourceCompositionReview']);review=json.loads(review_bytes)
    assert review['verdict'].startswith('PASS exact composition and source ART') and review['lineage']==ref(lineage_path)
    assert lineage['nativeIdentity']==native_id and lineage['generatorCalls']==0 and lineage['historicalSourceCalls']==1
    for row in lineage['watchedInputs']:checked(row)
    plan_path,plan_bytes=checked(lineage['plan']);plan=json.loads(plan_bytes)
    checked(lineage['independentPlanReview']);checked(lineage['composer'])
    raw_path,raw_bytes=checked(lineage['raw']);derivative_path,derivative_bytes=checked(lineage['output'])
    native_path,_=checked(lineage['native']);prompt_path,prompt_bytes=checked(lineage['prompt'])
    journal_path,journal_bytes=checked(lineage['journal']);journal=json.loads(journal_bytes)
    assert native_path==original_path
    entries=[x for x in journal['items']if x['id']==native_id];assert len(entries)==1;entry=entries[0]
    assert entry['generationCount']==1 and entry['generationState']=='generated-retained'
    assert (ROOT/entry['generated']).resolve()==raw_path and entry['generatedSha256']==sha(raw_bytes)
    assert (ROOT/entry['prompt']).resolve()==prompt_path and entry['promptSha256']==sha(prompt_bytes)
    raw=Image.open(io.BytesIO(raw_bytes));derivative=Image.open(io.BytesIO(derivative_bytes))
    assert raw.mode==derivative.mode=='RGB' and raw.size==derivative.size==(1254,1254)
    assert plan['proposedSameSourceComposition']['cutX']==935 and plan['proposedSameSourceComposition']['rollUpRows']==38
    pixels=np.asarray(raw);expected=pixels.copy();expected[:,935:]=np.roll(pixels[:,935:],-38,axis=0)
    assert np.array_equal(np.asarray(derivative),expected)
    assert np.array_equal(np.asarray(derivative)[:,:935],pixels[:,:935])
    inverse=np.asarray(derivative).copy();inverse[:,935:]=np.roll(inverse[:,935:],38,axis=0)
    assert np.array_equal(inverse,pixels)
    serialized=io.BytesIO();Image.fromarray(expected,'RGB').save(serialized,'PNG')
    assert serialized.getvalue()==derivative_bytes
    landmarks_path,landmark_bytes=checked(lineage['landmarks']);landmarks=json.loads(landmark_bytes)
    assert landmarks=={'axis':'x','points':plan['existingXRegistration']['points']}
    assert master['inputs']['generated']['sha256']==sha(derivative_bytes)
    assert Path(master['inputs']['generated']['file']).resolve()==derivative_path!=raw_path
    assert master['inputs']['landmarks']['sha256']==sha(landmark_bytes)
    for row in master['inputs'].values():checked(row)
    for row in master['tools'].values():checked(row)
    original_receipt_path,original_receipt_bytes=checked(master['originalPrepareReceipt'],mp.parent)
    original_receipt=json.loads(original_receipt_bytes)
    attachment_path,_=checked(master['sourceLineageAttachment'])
    assert master['originalGeneratorOutput']==lineage['raw'] and master['generationJournal']==lineage['journal']
    attached=copy.deepcopy(original_receipt)
    attached['generatorPolicy']='One retained imagegen raw, followed by independently reviewed reversible same-source phase registration. inputs.generated is the registered derivative, not the returned raw. No additional model call or separate tier authoring.'
    attached['sourceComposition']=ref(lineage_path);attached['sourceCompositionReview']=ref(review_path)
    attached['originalGeneratorOutput']=lineage['raw'];attached['generationJournal']=lineage['journal']
    attached['originalPrepareReceipt']={'file':'original-prepare-receipt.json','sha256':sha(original_receipt_bytes)}
    attached['sourceLineageAttachment']=ref(attachment_path)
    assert attached==master and (json.dumps(attached,indent=2)+'\n').encode()==master_bytes
    assert original_receipt['registration']['axis']=='x' and original_receipt['registration']['verticalLandmarks']==landmarks['points']
    prepare=ROOT/'tools/texture_sheets/prepare_texture_master.py'
    scratch=Path(tempfile.mkdtemp(prefix='wood36-aligned-prepare-public-')).resolve();output=scratch/'master'
    command=[sys.executable,str(prepare),'--original',str(original_path),'--generated',str(derivative_path),
      '--prompt',str(prompt_path),'--landmarks',str(landmarks_path),'--name','wood3_6','--edition','rogue',
      '--profile','wood','--color-strength','0.65','--field-sigma','0.75','--strength','0.3','--cap','0.5','--output',str(output)]
    proc=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=45)
    report['publicPrepareReplay']={'command':command,'returnCode':proc.returncode,'stdout':proc.stdout,'stderr':proc.stderr}
    assert proc.returncode==0
    actual_rgb=read(mp.parent/'color.png');actual_height=read(mp.parent/'height.npy')
    assert (output/'color.png').read_bytes()==actual_rgb
    assert (output/'height.npy').read_bytes()==actual_height
    assert (output/'master.json').read_bytes()==original_receipt_bytes
    report['publicPrepareReplay'].update(exactRGBPNG=True,exactFloatNPY=True,exactOriginalPrepareReceipt=True)
    test_path=ROOT/'tests/quake_texture_tiers_test.py';read(test_path)
    spec=importlib.util.spec_from_file_location('wood36_maintained_public_oracle',test_path)
    test=importlib.util.module_from_spec(spec);spec.loader.exec_module(test)
    read(ROOT/'tests/hexen2_texture_tiers_test.py');read(ROOT/'tests/fixtures/quake_codec_protected_producers.json')
    for row in test.PROTECTED_FIXTURE['protectedSourceBindings']:read(ROOT/row['file'])
    tp=ROOT/item['tierReceipt'];tier_bytes=read(tp);assert sha(tier_bytes)==item['tierReceiptSha256'];tiers=json.loads(tier_bytes)
    case=test.QuakeTextureTiersCLI();case.original=original_path.resolve();case.master=(mp.parent/'color.png').resolve()
    case.height_file=(mp.parent/'height.npy').resolve();case.native=(64,64)
    case.rgb=Image.open(io.BytesIO(actual_rgb)).convert('RGB');case.scalar=np.load(io.BytesIO(actual_height),allow_pickle=False)
    for tier,row in tiers['tiers'].items():
        for role,data in row['outputs'].items():
            path=(tp.parent/data['file']).resolve();assert path==(ROOT/item['tiers'][tier]['files'][role]).resolve();read(path)
    case.test_unchanged_historical_producer_sources();case.verify_output(tp.parent,tiers)
    for path,digest in watched.items():assert sha(path.read_bytes())==digest
    shutil.rmtree(scratch);scratch=None
    report.update(verdict='PASS_BOUNDED_ALIGNED_SOURCE_PREPARE_ATTACHMENT_AND_BOTH_TIERS_MATH',
      candidateBatch=ref(batch_path),sourceComposition={'exactPNGBytes':True,'allForwardPixelsExact':True,'outsideCutExact':True,
      'inverseAllPixelsExact':True,'newSourcePixelsOrInterpolation':0,'rawCallCount':1,'landmarksExact':True,
      'permutationLimit':'Exact-pixel guarantee applies only before photographic finishing/X resampling.'},
      metadataAttachment={'exactReconstruction':True,'originalPrepareReceipt':ref(original_receipt_path),
      'changedOnly':'Declared generatorPolicy plus sixexplicitlineage fields, allotheroriginalCLI receiptfieldsunchanged.',
      'truthfulDerivativeBinding':'Master generated input is reviewed derivative; journal generated input is original raw, intentionallydistinct and fullybound.',
      'batchBinding':'Schema3batch pins the enrichedmasterPackage hash containing allsixfields; batchitem doesnotduplicate thosefields.'},
      tierProof={'verifier':'MaintainedQuakeTextureTiersCLI.verify_output/raw_maps unchanged','exactRoleByteExports':10,
      'exactLosslessDataMaps':8,'Q92Method6Diffuse':2,'Mid':[256,256],'High':[512,512],
      'includes':'Actualcodecs/intendedpixels/bytehash/dimensions/directmasterRGBandfloatreduction/UVnormals/BOX32/16/quantization andangle diagnostic equality.'},
      temporaryReplayRemovedAfterExactComparison=True)
except Exception as error:
    report.update(verdict='HOLD_ALIGNED_ACTUAL_PROOF_FAILED',failure={'type':type(error).__name__,'message':str(error),'traceback':traceback.format_exc()})
    if scratch is not None:report['retainedFailureScratch']=str(scratch)
finally:
    read(__file__);report['verifier']=ref(__file__)
    report['watchedInputs']=[{'file':str(p.relative_to(ROOT)),'sha256':h}for p,h in watched.items()]
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    report['limits']=['Source/provenance/attachment/numericalproof only; actualmaterial/physical/repeat/ART/GPU/runtime/catalog/owner/CI/releaseacceptance separate.',
      'Nativeidentity rebound to batch004selectedproof and actualPNG; no freshallPAK/allnativefamily audit.',
      'Existingcurrenttools/assets/raw/journal/oldfailedcandidateunchanged. Onlyowneddriver/report andtemporarypublicreplay outputs written.',
      'Historical failedMidwitness remains underoldcandidate scope; newfixed/mappedwitnessandactualdecodedART require separate review.']
    OUT.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'verdict':report['verdict'],'report':str(OUT),'watchedInputs':len(watched)}))
if not report['verdict'].startswith('PASS'):sys.exit(1)
