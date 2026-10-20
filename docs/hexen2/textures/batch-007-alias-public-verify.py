"""Two explicit007 supplemental native aliases; no generation or binding."""
import datetime,hashlib,json,pathlib,struct
import numpy as np
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[3];DOCS=ROOT/'docs/hexen2/textures'
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-007'
OUT=DOCS/'batch-007-alias-public-source-proof.json';assert not OUT.exists(),'Retain prior evidence'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
def witness(p):
 b=p.read_bytes();return {'file':str(p.relative_to(ROOT)),'sha256':sha(b),'bytes':len(b)}
def file_sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1024**2),b''):h.update(b)
 return h.hexdigest()
report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidates':[],
 'limits':['Supplemental source equality only; no alias binding, new-generation, master, map, art or runtime acceptance.',
 'Target masters/maps remain qualified by the bound final006 actual/art proofs; this is a source/provenance and byte-custody check, not another codec campaign.',
 'Preserve each original native id/name/edition/PAK-slot context even when enhanced physical files may be shared.',
 'Main eight007 source/selection preparation remains separate; this proof neither changes nor expands that generation set.']}
try:
 ip=ROOT/'docs/evidence/hexen2-textures-2026-10-19/batch-007-alias-selection/inventory.json'
 sp=BASE/'alias-selection.json';cp=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json'
 pp=DOCS/'batch-006-public-final-actual-v1.json';ap=DOCS/'batch-006-art-review-v2.json'
 assert sha(pp.read_bytes())=='2b77f5b27156a81e212fc301282022955c2a12caed2e73c2fb02691347680c12'
 assert sha(ap.read_bytes())=='959886c98c2c1acbd07209c0e7895f89d0dd75fa1e1be12b511b5d4863dd09ad'
 inv,selection,catalog,proof=load(ip),load(sp),load(cp),load(pp)
 assert len(selection['items'])==2 and len(catalog['materials'])==37
 expected={'2c1bff60990ab841f2f770dad2326dbbc0acf4e45013b7a69652cb18283e76b6':'2880c270e3b99a91010e650e191d5280fb056cb400ef8f6be9d287ee50d8cef6',
           '42b6bee9ca16e917cfe1d06ea755c0513072d161d0595c0299f010c7fbfb29df':'2db73383343bfc6b212d264e514cc4c8358d1c2fdcd4ff762b40504ed0228f01'}
 assert {i['id']for i in selection['items']}==set(expected)
 native={v['id']:v for v in inv['variants']};accepted={i['id']:i for i in catalog['materials']}
 qualified={m['nativeIdentity']:m for m in proof['materials']}
 fixed=[pathlib.Path(__file__),ip,sp,cp,pp,ap,BASE/'native-selection.json',DOCS/'batch-007-public-source-proof-v2.json']
 packages=[]
 for item in selection['items']:
  alias=item['candidateContentAliasOf'];assert alias['id']==expected[item['id']]
  a,b=native[item['id']],native[alias['id']];target=accepted[b['id']];q=qualified[b['id']]
  assert a['name']==item['name']and b['name']==alias['name']and item['generationCount']==0
  assert all(a[k]==b[k]for k in('width','height','category','paletteSha256','indexedPixelSha256','rgbaSha256'))
  assert [a['width'],a['height']]==item['nativeDimensions']==[64,128]
  assert a['category']==b['category']=='ordinary'
  mp,tp=ROOT/alias['masterPackage'],ROOT/alias['tierReceipt'];m,t=load(mp),load(tp)
  assert alias['masterPackage']==target['masterPackage']and alias['tierReceipt']==target['tierReceipt']
  assert sha(mp.read_bytes())==alias['masterPackageSha256']==target['masterPackageSha256']==q['masterPackage']['sha256']
  assert sha(tp.read_bytes())==alias['tierReceiptSha256']==target['tierReceiptSha256']
  op=ROOT/item['original'];low=ROOT/target['Low']['original']
  assert sha(op.read_bytes())==item['originalSha256']==a['selectedOriginal']['sha256']
  assert op.resolve()==pathlib.Path(a['selectedOriginal']['path']).resolve()
  assert op.parent==BASE/'alias-originals'and sha(low.read_bytes())==target['Low']['sha256']
  files=[mp,tp,op,low,*[mp.parent/m[k]['file']for k in('color','height')]]
  files += [pathlib.Path(v['file'])for v in m['inputs'].values()]
  for tier in('Mid','High'):
   qr={r['role']:r for r in next(x for x in q['tiers']if x['tier']==tier)['maps']}
   for role,r in t['tiers'][tier]['outputs'].items():
    p=tp.parent/r['file'];assert sha(p.read_bytes())==r['sha256']==qr[role]['sha256']
    assert Image.open(p).size==tuple(t['tiers'][tier]['dimensions']);files.append(p)
  for role in('color','height'):assert sha((mp.parent/m[role]['file']).read_bytes())==m[role]['sha256']
  fixed+=files;packages.append((item,a,b,mp,tp,op,low))
 before={p:sha(p.read_bytes())for p in set(fixed)}
 directories={}
 for a in inv['archives']:
  p=pathlib.Path(a['path']);assert file_sha(p)==a['sha256']
  with p.open('rb')as f:
   magic,off,n=struct.unpack('<4sII',f.read(12));assert magic==b'PACK'and n%64==0
   f.seek(off);table=f.read(n)
  entries={}
  for at in range(0,n,64):entries.setdefault(table[at:at+56].split(b'\0')[0].decode('ascii').lower(),struct.unpack_from('<II',table,at+56))
  directories[str(p)]=entries
 def member(source,name):
  off,n=directories[source][name]
  with open(source,'rb')as f:f.seek(off);b=f.read(n)
  assert len(b)==n;return b,off
 palette,_=member('/Users/bri/quaked/Hexen 2/data1/pak0.pak','gfx/palette.lmp');assert len(palette)==768
 palette_rgb=np.frombuffer(palette,dtype='uint8').reshape(256,3)
 def all_occurrences(v):
  seen=set();records=[];baseline=None;consistent=True;ordinary=True
  assert not v['name'].startswith(('*','!','+','{'))and not v['name'].lower().startswith('sky')
  for o in v['provenance']:
   key=(o['source'],o['map'],o['slot'])
   if key in seen:continue
   seen.add(key);bsp,off=member(o['source'],o['map'])
   assert off==o['memberOffset']and sha(bsp)==o['bspSha256']and struct.unpack_from('<i',bsp)[0]==29
   tx,tn=struct.unpack_from('<II',bsp,20);local=struct.unpack_from('<i',bsp,tx+4+4*o['slot'])[0];assert local>=0
   at=tx+local;assert bsp[at:at+16].split(b'\0')[0].decode('ascii')==v['name']
   w,h=struct.unpack_from('<II',bsp,at+16);assert(w,h)==(v['width'],v['height'])
   mips=[]
   for level in range(4):
    offset=struct.unpack_from('<I',bsp,at+24+level*4)[0];count=(w>>level)*(h>>level)
    assert offset>=40 and at+offset+count<=tx+tn;mips.append(bsp[at+offset:at+offset+count])
   if baseline is None:baseline=mips
   consistent=consistent and mips==baseline;assert sha(mips[0])==v['indexedPixelSha256']
   ti,n=struct.unpack_from('<II',bsp,4+6*8);assert n%40==0
   flags={struct.unpack_from('<i',bsp,p+36)[0]for p in range(ti,ti+n,40)if struct.unpack_from('<i',bsp,p+32)[0]==o['slot']}
   ordinary=ordinary and (not flags or flags=={0})
   records.append({'source':o['source'],'map':o['map'],'slot':o['slot'],'memberOffset':off,'bspSha256':sha(bsp),'ordinaryTexinfoFlags':sorted(flags),'fourMipSHA256':[sha(x)for x in mips]})
  assert baseline is not None
  return baseline,records,consistent,ordinary
 for item,a,b,mp,tp,op,low in packages:
  ma,ra,ca,oa=all_occurrences(a);mb,rb,cb,ob=all_occurrences(b)
  equals=ca and cb and oa and ob and ma==mb
  for v,mips,p in((a,ma,op),(b,mb,low)):
   assert sha(palette)==v['paletteSha256'];rgba=np.c_[palette_rgb[np.frombuffer(mips[0],dtype='uint8')],np.full(v['width']*v['height'],255,dtype='uint8')]
   assert sha(rgba.tobytes())==v['rgbaSha256']
   assert Image.open(p).convert('RGBA').tobytes()==rgba.tobytes()
  report['candidates'].append({'nativeId':a['id'],'name':a['name'],'edition':item['edition'],'targetId':b['id'],'targetName':b['name'],
   'verdict':'PASS exact source alias candidate'if equals else 'NO_ALIAS four-mip/source-semantic mismatch',
   'fourMipBytesEqual':ma==mb,'candidateMipsConsistent':ca,'targetMipsConsistent':cb,'ordinaryFlagsBoth':oa and ob,
   'fourMipSHA256':[sha(x)for x in ma],'targetFourMipSHA256':[sha(x)for x in mb],
   'candidateProvenance':ra,'targetProvenance':rb,'original':witness(op),'targetLow':witness(low),
   'LowPNGBytesIdentical':op.read_bytes()==low.read_bytes(),'nativeDimensions':[a['width'],a['height']],
   'existingMasterPackage':witness(mp),'existingTierReceipt':witness(tp),'eligibleForReuseReview':bool(equals and op.read_bytes()==low.read_bytes())})
 assert all(sha(p.read_bytes())==digest for p,digest in before.items())
 assert all(file_sha(pathlib.Path(a['path']))==a['sha256']for a in inv['archives'])
 passed=sum(c['eligibleForReuseReview']for c in report['candidates'])
 report.update({'verdict':'PASS bounded two-candidate source audit; '+str(passed)+'exact native aliases eligible for separate reuse review',
  'provenExactAliases':passed,'candidateCount':2,'occurrencesChecked':sum(len(c['candidateProvenance'])+len(c['targetProvenance'])for c in report['candidates']),
  'inputs':[witness(p)for p in sorted(set(fixed))],'inputsStable':True,'archiveInputsStable':inv['archives'],
  'newGenerations':0,'newMasterPackages':0,'newMapFiles':0,'bindingsCreated':0})
except Exception as exc:
 report['verdict']='HOLD';report['error']=repr(exc);raise
finally:
 report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'receipt':str(OUT.relative_to(ROOT)),'sha256':sha(OUT.read_bytes()),'verdict':report['verdict']}))
