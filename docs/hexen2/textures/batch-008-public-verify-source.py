"""Bounded native008 source/alias screen against catalog and pending007 sources."""
import collections,datetime,hashlib,json,pathlib,struct
import numpy as np
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[3]
DOCS=ROOT/'docs/hexen2/textures';BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
IP=ROOT/'docs/evidence/hexen2-textures-2026-10-19/batch-008-selection/inventory.json'
CP=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json'
OP=ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json'
OUT=DOCS/'batch-008-public-source-proof.json'
assert not OUT.exists(),'Retain prior evidence'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
def witness(p):
 b=p.read_bytes();return {'file':str(p.relative_to(ROOT)),'sha256':sha(b),'bytes':len(b)}
def file_sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1024**2),b''):h.update(b)
 return h.hexdigest()
report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'limits':['Native source integrity and exact alias screening only; no generated master, enhanced tier, binding or texture acceptance.',
 'Alias screen covers these eight peers, current37-entry catalog and pending007eight native sources only, not all unenhanced world content.',
 'All native names/ids/edition context retained. Equal colour hashes would be only a shortlist; all four mip bytes and ordinary source semantics would be required before reuse.']}
try:
 inv,old,cat=load(IP),load(OP),load(CP)
 assert inv['archives']==old['archives']and len(inv['variants'])==len(old['variants'])==980
 byid={v['id']:v for v in inv['variants']};oldid={v['id']:v for v in old['variants']};assert set(byid)==set(oldid)
 for ident,v in byid.items():
  assert {k:x for k,x in v.items()if k!='selectedOriginal'}=={k:x for k,x in oldid[ident].items()if k!='selectedOriginal'},ident
 prefixes=('ed0ea21baafa','9751c9aa3732','7d397606c172','c690e6f19072','cddf441f348f','84bb278bdd94','4bf05bb0cae8','b0d888d2faae')
 variants=[next(v for v in inv['variants']if v['id'].startswith(p))for p in prefixes]
 assert len({v['id']for v in variants})==8
 assert {v['id']for v in variants}=={v['id']for v in inv['variants']if 'selectedOriginal'in v}
 pending_path=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-007/native-selection.json'
 pending=load(pending_path);assert len(pending['items'])==8
 inputs=[pathlib.Path(__file__),IP,OP,CP,pending_path,*[pathlib.Path(v['selectedOriginal']['path'])for v in variants]]
 before={p:sha(p.read_bytes())for p in inputs}
 assert len(cat['materials'])==37
 key=lambda v:tuple(v[k]for k in('width','height','category','paletteSha256','indexedPixelSha256','rgbaSha256'))
 alias_candidates=[]
 for a in variants:
  peers=[b for b in variants if b['id']!=a['id']and key(a)==key(b)]
  accepted=[byid[i['id']]for i in cat['materials']if key(a)==key(byid[i['id']])]
  alias_candidates.extend((a,b,'peer')for b in peers)
  alias_candidates.extend((a,b,'catalog')for b in accepted)
  alias_candidates.extend((a,byid[i['id']],'pending007')for i in pending['items']if key(a)==key(byid[i['id']]))
 # No candidate passes the necessary level0 source tuple in this batch. If a
 # future batch gains candidates, refuse to silently infer all-mip equivalence.
 assert not alias_candidates,'Exact alias candidate requires four-mip comparison branch'
 directories={}
 for a in inv['archives']:
  p=pathlib.Path(a['path']);assert file_sha(p)==a['sha256']and p.stat().st_size==a['bytes']
  with p.open('rb')as f:
   magic,off,n=struct.unpack('<4sII',f.read(12));assert magic==b'PACK'and n%64==0
   assert off+n<=p.stat().st_size;f.seek(off);table=f.read(n)
  entries={}
  for at in range(0,n,64):entries.setdefault(table[at:at+56].split(b'\0')[0].decode('ascii').lower(),struct.unpack_from('<II',table,at+56))
  directories[str(p)]=entries
 def member(path,name):
  off,n=directories[path][name]
  with open(path,'rb')as f:f.seek(off);b=f.read(n)
  assert len(b)==n;return b,off
 palette,_=member('/Users/bri/quaked/Hexen 2/data1/pak0.pak','gfx/palette.lmp');assert len(palette)==768
 palette_rgb=np.frombuffer(palette,dtype='uint8').reshape(256,3)
 native_records=[]
 for variant in variants:
  assert variant['category']=='ordinary'and not variant['name'].startswith(('*','!','+','{'))and not variant['name'].lower().startswith('sky')
  assert variant['paletteSha256']==sha(palette)
  baseline=None;seen=set();records=[];perprofile=collections.Counter()
  for o in variant['provenance']:
   bsp,offset=member(o['source'],o['map']);assert offset==o['memberOffset']and sha(bsp)==o['bspSha256']
   assert struct.unpack_from('<i',bsp)[0]==29
   lumps=[struct.unpack_from('<II',bsp,4+i*8)for i in range(15)]
   assert all(off+n<=len(bsp)for off,n in lumps)
   texture_off,texture_bytes=lumps[2];assert 0<=o['slot']<struct.unpack_from('<i',bsp,texture_off)[0]
   local=struct.unpack_from('<i',bsp,texture_off+4+4*o['slot'])[0];assert local>=0
   at=texture_off+local;assert bsp[at:at+16].split(b'\0')[0].decode('ascii')==variant['name']
   width,height=struct.unpack_from('<II',bsp,at+16);assert (width,height)==(variant['width'],variant['height'])
   mips=[]
   for level in range(4):
    start=struct.unpack_from('<I',bsp,at+24+level*4)[0];n=(width>>level)*(height>>level)
    assert start>=40 and at+start+n<=texture_off+texture_bytes;mips.append(bsp[at+start:at+start+n])
   if baseline is None:baseline=mips
   assert mips==baseline,'Inconsistent native mip bytes'
   assert sha(mips[0])==variant['indexedPixelSha256']
   ti_off,ti_n=lumps[6];face_off,face_n=lumps[7];assert ti_n%40==0 and face_n%20==0
   texinfos={j:struct.unpack_from('<i',bsp,ti_off+j*40+36)[0]for j in range(ti_n//40)if struct.unpack_from('<i',bsp,ti_off+j*40+32)[0]==o['slot']}
   assert not texinfos or set(texinfos.values())=={0}
   faces=[]
   for j in range(face_n//20):
    face_at=face_off+j*20;texinfo=struct.unpack_from('<H',bsp,face_at+10)[0];assert texinfo<ti_n//40
    if texinfo in texinfos:faces.append((j,face_at,texinfo))
   assert len(faces)==o['faces'];perprofile[o['profile']]+=len(faces)
   native_key=(o['source'],o['map'],o['slot'])
   if native_key not in seen:
    seen.add(native_key);records.append({'source':o['source'],'map':o['map'],'slot':o['slot'],'bspSha256':sha(bsp),'memberOffset':offset,'faces':len(faces),
      'ordinaryTexinfoFlags':sorted(set(texinfos.values())),'fourMipSHA256':[sha(x)for x in mips]})
  assert perprofile==variant['profileFaces']or dict(perprofile)=={k:v for k,v in variant['profileFaces'].items()if v!=0}
  rgba=np.c_[palette_rgb[np.frombuffer(baseline[0],dtype='uint8')],np.full(width*height,255,dtype='uint8')].reshape(height,width,4)
  assert sha(rgba.tobytes())==variant['rgbaSha256']
  png=pathlib.Path(variant['selectedOriginal']['path'])
  assert png.parent==BASE/'originals'and sha(png.read_bytes())==variant['selectedOriginal']['sha256']
  im=Image.open(png);assert im.format=='PNG'and im.size==(width,height)and im.convert('RGBA').tobytes()==rgba.tobytes()
  native_records.append({'id':variant['id'],'name':variant['name'],'nativeDimensions':[width,height],'original':witness(png),
    'paletteSha256':sha(palette),'indexedPixelSha256':sha(baseline[0]),'rgbaSha256':sha(rgba.tobytes()),'fourMipSHA256':[sha(x)for x in baseline],
    'profileFaceCounts':dict(perprofile),'uniquePAKOccurrences':records,'ordinaryFlagsOnly':True,'exactPeerCandidates':0,'exactCatalogCandidates':0,'exactPending007Candidates':0})
 assert all(p.read_bytes()and sha(p.read_bytes())==digest for p,digest in before.items())
 assert all(file_sha(pathlib.Path(a['path']))==a['sha256']for a in inv['archives'])
 report.update({'verdict':'PASS eight native sources/all four mips/ordinary provenance; no exact peer/catalog37/pending0078 alias candidates',
  'materials':native_records,'nativeCount':8,'existingCatalogBindings':37,'pending007Sources':8,'exactPeerCandidates':0,'exactCatalogCandidates':0,'exactPending007Candidates':0,
  'uniquePAKSlotOccurrencesChecked':sum(len(r['uniquePAKOccurrences'])for r in native_records),
  'full980NativeInventoryMetadataUnchanged':True,'archiveInputsStable':inv['archives'],'inputsStable':True,'inputs':[witness(p)for p in inputs],
  'newGenerations':0,'newMasterPackages':0,'bindingCreated':False})
except Exception as e:
 report['verdict']='HOLD';report['error']=repr(e);raise
finally:
 report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'source':str(OUT.relative_to(ROOT)),'sha256':sha(OUT.read_bytes()),'verdict':report['verdict']}))
