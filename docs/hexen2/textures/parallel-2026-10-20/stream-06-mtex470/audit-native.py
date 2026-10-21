"""Bounded source audit reusing established BSP29/miptex proof contract; no authoring."""
import collections,datetime,hashlib,json,pathlib,struct
import numpy as np
from PIL import Image
R=pathlib.Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-06-mtex470';E=D/'native-audit';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-06-mtex470'
sha=lambda b:hashlib.sha256(b).hexdigest();load=lambda p:json.loads(p.read_text());inv=load(E/'inventory.json');v=next(v for v in inv['variants']if v['id']=='e068750f3f11baad13dc050abc9fc5a3e860fbe9a450a653364315dccfb4209f');old=load(R/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json');ov=next(a for a in old['variants']if a['id']==v['id']);assert {k:x for k,x in v.items()if k!='selectedOriginal'}=={k:x for k,x in ov.items()if k!='selectedOriginal'}
assert inv['archives']==old['archives'];assert v['category']=='ordinary'
catp=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json';cat=load(catp);assert v['id']not in {a['id']for a in cat['materials']}
key=lambda x:tuple(x[k]for k in('width','height','paletteSha256','indexedPixelSha256','rgbaSha256'))
peers=[a for a in inv['variants']if a['id']!=v['id']and key(a)==key(v)];assert not peers,'Possible native alias requires full proof before generation'
rgbaPeers=[a for a in inv['variants']if a['id']!=v['id']and a['rgbaSha256']==v['rgbaSha256']];assert not rgbaPeers
# Full inventory has no level-zero content peer, hence no accepted/pending alias candidate.
directories={}
for a in inv['archives']:
 p=pathlib.Path(a['path']);assert sha(p.read_bytes())==a['sha256']and p.stat().st_size==a['bytes']
 with p.open('rb')as f:
  magic,off,n=struct.unpack('<4sII',f.read(12));assert magic==b'PACK'and n%64==0;f.seek(off);table=f.read(n)
 directories[str(p)]={table[at:at+56].split(b'\0')[0].decode('ascii').lower():struct.unpack_from('<II',table,at+56)for at in range(0,n,64)}
def member(path,name):
 off,n=directories[path][name]
 with open(path,'rb')as f:f.seek(off);b=f.read(n)
 assert len(b)==n;return b,off
palette,_=member('/Users/bri/quaked/Hexen 2/data1/pak0.pak','gfx/palette.lmp');assert len(palette)==768 and sha(palette)==v['paletteSha256'];pal=np.frombuffer(palette,dtype='uint8').reshape(256,3)
baseline=None;seen=set();records=[];counts=collections.Counter()
for o in v['provenance']:
 bsp,offset=member(o['source'],o['map']);assert offset==o['memberOffset']and sha(bsp)==o['bspSha256'];assert struct.unpack_from('<i',bsp)[0]==29
 lumps=[struct.unpack_from('<II',bsp,4+i*8)for i in range(15)];t,tn=lumps[2];assert 0<=o['slot']<struct.unpack_from('<i',bsp,t)[0];at=t+struct.unpack_from('<i',bsp,t+4+4*o['slot'])[0]
 assert bsp[at:at+16].split(b'\0')[0].decode('ascii')==v['name'];w,h=struct.unpack_from('<II',bsp,at+16);assert(w,h)==(64,64)
 mips=[]
 for level in range(4):
  start=struct.unpack_from('<I',bsp,at+24+level*4)[0];n=(w>>level)*(h>>level);assert start>=40 and at+start+n<=t+tn;mips.append(bsp[at+start:at+start+n])
 if baseline is None:baseline=mips
 assert mips==baseline and sha(mips[0])==v['indexedPixelSha256']
 ti,n=lumps[6];fo,fn=lumps[7];assert n%40==0 and fn%20==0
 texinfos={j:struct.unpack_from('<i',bsp,ti+j*40+36)[0]for j in range(n//40)if struct.unpack_from('<i',bsp,ti+j*40+32)[0]==o['slot']};assert set(texinfos.values())=={0}
 faces=[j for j in range(fn//20)if struct.unpack_from('<H',bsp,fo+j*20+10)[0]in texinfos];assert len(faces)==o['faces'];counts[o['profile']]+=len(faces)
 k=(o['source'],o['map'],o['slot'])
 if k not in seen:
  seen.add(k);records.append({**o,'fourMipSHA256':[sha(x)for x in mips],'ordinaryTexinfoFlags':[0]})
rgba=np.c_[pal[np.frombuffer(baseline[0],dtype='uint8')],np.full(4096,255,dtype='uint8')].reshape(64,64,4);assert sha(rgba.tobytes())==v['rgbaSha256'];o=pathlib.Path(v['selectedOriginal']['path']);im=Image.open(o);assert im.format=='PNG'and im.size==(64,64)and im.convert('RGBA').tobytes()==rgba.tobytes()and sha(o.read_bytes())==v['selectedOriginal']['sha256'];assert dict(counts)==v['profileFaces']
r={'verdict':'PASS source-only: retained Low, all four mips, ordinary flags, no alias candidate','nativeIdentity':v['id'],'name':v['name'],'edition':'base','nativeDimensions':[64,64],'original':{'file':str(o.relative_to(R)),'sha256':sha(o.read_bytes())},'paletteSha256':sha(palette),'indexedPixelSha256':sha(baseline[0]),'rgbaSha256':sha(rgba.tobytes()),'fourMipSHA256':[sha(x)for x in baseline],'profileFaces':dict(counts),'uniquePAKSlotOccurrences':records,'inventoryVariantCount':len(inv['variants']),'catalogBindingsScreened':len(cat['materials']),'sameRgbaNativeCandidates':0,'sameFullTupleNativeCandidates':0,'aliasScope':'All980 native inventory variants, including every accepted and pending native identity. Zero colour peer means no all-mip alias admissible.','inputs':{str(p.relative_to(R)):sha(p.read_bytes())for p in [pathlib.Path(__file__),E/'inventory.json',R/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json',catp]},'limits':['No master/source generation or artwork/relief/tier acceptance. Native ID groups equal level0 by name; every selected occurrence explicitly checked all four mips here.'],'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(D/'native-proof.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'verdict':r['verdict'],'occurrences':len(records),'mips':r['fourMipSHA256'],'proofSha256':sha((D/'native-proof.json').read_bytes())}))
