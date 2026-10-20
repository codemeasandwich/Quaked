"""Read-only two-descriptor/20-map custody check; no alias acceptance."""
import datetime,hashlib,json,pathlib
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[3];DOCS=ROOT/'docs/hexen2/textures'
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-007'
OUT=DOCS/'batch-007-alias-public-bindings-v1.json';assert not OUT.exists(),'Retain evidence'
sha=lambda b:hashlib.sha256(b).hexdigest();load=lambda p:json.loads(p.read_text())
def resolve(v):return pathlib.Path(v)if pathlib.Path(v).is_absolute()else ROOT/v
def witness(p):
 b=p.read_bytes();return {'file':str(p.relative_to(ROOT)),'sha256':sha(b),'bytes':len(b)}
report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'limits':['Descriptor/source/map integrity only; no new catalog binding, artistic acceptance, runtime or owner acceptance.',
 'No new model call, authored package, codec derivation or extra physical map. Target same-source repairs remain exactly as qualified in final006.',
 'All20 map references reuse existing files; they must not be counted as new generated assets.']}
try:
 batch_path=BASE/'alias-batch.json';selection_path=BASE/'alias-selection.json';sp=DOCS/'batch-007-alias-public-source-proof.json'
 ap=DOCS/'batch-006-public-final-actual-v1.json';art_path=DOCS/'batch-006-art-review-v2.json'
 assert sha(sp.read_bytes())=='40df0252adf2c6c5d2a12074c42e3a2f7fa1dbd19800591d5ab4b7b6b64a71a7'
 assert sha(ap.read_bytes())=='2b77f5b27156a81e212fc301282022955c2a12caed2e73c2fb02691347680c12'
 assert sha(art_path.read_bytes())=='959886c98c2c1acbd07209c0e7895f89d0dd75fa1e1be12b511b5d4863dd09ad'
 batch,selection,source,actual,art=map(load,[batch_path,selection_path,sp,ap,art_path])
 assert source['provenExactAliases']==2 and len(source['candidates'])==2
 assert batch['family']=='hexen2'and batch['pathsBase']=='repository'and batch['defaultTier']=='Mid'
 assert batch['tierFactors']=={'Mid':4,'High':8}and(batch['quality'],batch['method'],batch['lossless'])==(92,6,False)
 assert batch['counts']=={'nativeBindings':2,'newGenerations':0,'newMasterPackages':0,'newMapFiles':0,'mapReferences':20}
 assert len(batch['items'])==len(selection['items'])==2
 assert {i['id']for i in selection['items']}=={i['nativeIdentity']['id']for i in batch['items']}
 selected={i['id']:i for i in selection['items']};sources={i['nativeId']:i for i in source['candidates']}
 actuals={i['nativeIdentity']:i for i in actual['materials']};arts={i['nativeID']:i for i in art['materials']}
 fixed={pathlib.Path(__file__),batch_path,selection_path,sp,ap,art_path}
 # Verify original final006 source custody exactly without reencoding maps or
 # depending on removed initial package binaries.
 for row in actual['inputs']:
  p=resolve(row['file']);assert sha(p.read_bytes())==row['sha256'],row['file'];fixed.add(p)
 entries=[];maps=set();masters=set();tierpaths=set()
 for item in batch['items']:
  identity=item['nativeIdentity']['id'];sel=selected[identity];proof=sources[identity];alias=item['contentAliasOf']
  assert item['name']==sel['name']==proof['name']and item['edition']==sel['edition']==proof['edition']
  assert item['generationCount']==item['newMasters']==item['newMapFiles']==sel['generationCount']==0
  assert proof['eligibleForReuseReview']is True and proof['fourMipBytesEqual']is True
  assert proof['ordinaryFlagsBoth']is True and proof['LowPNGBytesIdentical']is True
  assert alias['id']==sel['candidateContentAliasOf']['id']==proof['targetId']
  assert alias['name']==sel['candidateContentAliasOf']['name']==proof['targetName']
  assert item['aliasProof']==str(sp.relative_to(ROOT))and item['aliasProofSha256']==sha(sp.read_bytes())
  assert item['original']==sel['original']==proof['original']['file']
  own=ROOT/item['original'];target=ROOT/alias['original'];assert own.read_bytes()==target.read_bytes()
  assert sha(own.read_bytes())==sel['originalSha256']==proof['original']['sha256']==proof['targetLow']['sha256']
  assert Image.open(own).size==tuple(sel['nativeDimensions'])==(64,128)
  assert sha(Image.open(own).convert('RGBA').tobytes())==item['nativeIdentity']['rgbaSha256']
  q=actuals[alias['id']];a=arts[alias['id']]
  assert q['name']==a['name']==alias['name']
  for key,sha_key in [('masterPackage','masterPackageSha256'),('tierReceipt','tierReceiptSha256')]:
   p=ROOT/item[key];assert item[key]==alias[key]==sel['candidateContentAliasOf'][key]==proof['existing'+key[0].upper()+key[1:]]['file']
   assert sha(p.read_bytes())==item[sha_key]==alias[sha_key]==sel['candidateContentAliasOf'][sha_key]==proof['existing'+key[0].upper()+key[1:]]['sha256'];fixed.add(p)
  mp,tp=ROOT/item['masterPackage'],ROOT/item['tierReceipt'];m,t=load(mp),load(tp)
  assert sha(mp.read_bytes())==q['masterPackage']['sha256']==a['masterPackageSha256']
  assert sha(tp.read_bytes())==a['tierReceiptSha256']
  assert t['inputs']['original']['sha256']==sha(own.read_bytes())and t['Low']['unchanged']is True
  masters.add(mp.resolve());tierpaths.add(tp.resolve());fixed.update((own,target))
  for tier,factor in [('Mid',4),('High',8)]:
   descriptor=item['tiers'][tier];r=t['tiers'][tier]
   assert descriptor['factor']==r['factor']==factor
   assert descriptor['dimensions']==r['dimensions']==[64*factor,128*factor]
   assert set(descriptor['files'])==set(r['outputs'])=={'diffuse','height','normalX','normalY','normalZ'}
   qm={x['role']:x for x in next(t for t in q['tiers']if t['tier']==tier)['maps']}
   for role,path in descriptor['files'].items():
    p=ROOT/path;record=r['outputs'][role]
    assert p.resolve()==(tp.parent/record['file']).resolve()
    assert sha(p.read_bytes())==record['sha256']==qm[role]['sha256']==a['tiers'][tier]['maps'][role]['sha256']
    assert Image.open(p).size==tuple(r['dimensions'])
    assert(record['quality'],record['method'],record['lossless'])==(92,6,False)
    fixed.add(p);maps.add(p.resolve())
  assert not(BASE/'masters'/item['name']).exists()and not(BASE/'tiers'/item['name']).exists()and not(BASE/'generated'/(item['name']+'.png')).exists()
  entries.append({'name':item['name'],'nativeIdentity':identity,'target':alias,'ownLow':witness(own),
     'masterPackage':witness(mp),'tierReceipt':witness(tp),'mapReferences':10,'newPhysicalMaps':0,'newGenerations':0})
 snapshots=[witness(p)for p in sorted(fixed)]
 assert all(sha((ROOT/r['file']).read_bytes())==r['sha256']for r in snapshots)
 assert len(maps)==20 and len(masters)==len(tierpaths)==2
 report.update({'verdict':'PASS supplemental2descriptors/20existingmapreferences and final006qualified source/art custody; reuse acceptance separate',
  'entries':entries,'nativeBindingsDescribed':2,'newGenerations':0,'newMasterPackages':0,'newMapFiles':0,'mapReferences':20,
  'uniqueReferencedExistingMasters':2,'uniqueReferencedExistingMapFiles':20,'catalogBindingsCreated':0,
  'sourceProof':witness(sp),'targetActualProof':witness(ap),'targetArtProof':witness(art_path),
  'allFinal006ActualInputsStable':True,'inputs':snapshots,'inputsStable':True})
except Exception as e:
 report['verdict']='HOLD';report['error']=repr(e);raise
finally:
 report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'receipt':str(OUT.relative_to(ROOT)),'sha256':sha(OUT.read_bytes()),'verdict':report['verdict']}))
