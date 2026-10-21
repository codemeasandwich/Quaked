"""Fresh bounded rtex018 native-byte proof; no source/master ART verdict."""
from pathlib import Path
import datetime,hashlib,io,json,struct
from PIL import Image
import numpy as np
R=Path(__file__).resolve().parents[6];D=Path(__file__).resolve().parent;S=D.parent
ID='7e009202100d48cda293f836a437e30d54c8d5a28ab7d190892a9c3683e397b6'
sha=lambda b:hashlib.sha256(b).hexdigest()
watched={}
def read(p):
 p=Path(p);p=p if p.is_absolute() else R/p;b=p.read_bytes();assert p not in watched or watched[p]==b;watched[p]=b;return b
def load(p):return json.loads(read(p))
def witness(p):
 p=Path(p);p=p if p.is_absolute() else R/p;return {'file':str(p.relative_to(R)) if R in p.parents else str(p),'sha256':sha(read(p))}
def ah(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def main():
 out=D/'native-current-v1.json';assert not out.exists()
 report={'schemaVersion':1,'reviewer':'/root/texture_06_mtex470','scope':'Fresh actual PAK/BSP/native all-four-mip/flags/paletteRGBA only; no source/master/ART/tier acceptance','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'HOLD'}
 try:
  old=load(S/'native-proof.json');v,=old['variants'];assert v['nativeIdentity']==ID
  inv=load(S/'native-audit/inventory.json');full=load(R/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json');native,=[x for x in full['variants'] if x['id']==ID]
  assert not [x for x in full['variants'] if x['id']!=ID and x['rgbaSha256']==native['rgbaSha256']]
  archives={x['path']:x for x in inv['archives']};dirs={};before={}
  for path,a in archives.items():
   assert Path(path).stat().st_size==a['bytes'];before[path]=ah(path);assert before[path]==a['sha256']
   with open(path,'rb') as f:
    magic,start,size=struct.unpack('<4sII',f.read(12));assert magic==b'PACK' and size%64==0;f.seek(start);table=f.read(size)
   assert len(table)==size;directory={};duplicates=[]
   for i in range(0,size,64):
    name=table[i:i+56].split(b'\0')[0].decode('ascii').lower();entry=struct.unpack_from('<II',table,i+56)
    if name in directory:
     with open(path,'rb') as f:
      f.seek(directory[name][0]);first=f.read(directory[name][1]);f.seek(entry[0]);other=f.read(entry[1])
     assert len(first)==len(other)==entry[1] and first==other
     duplicates.append({'name':name,'firstOffset':directory[name][0],'duplicateOffset':entry[0],'bytes':entry[1],'sha256':sha(other),'resolution':'identical bytes; first native directory entry retained'})
    else:directory[name]=entry
   assert duplicates==a['duplicates'];dirs[path]=directory
  def member(path,name):
   at,n=dirs[path][name]
   with open(path,'rb') as f:f.seek(at);b=f.read(n)
   assert len(b)==n;return b,at
  palette,_=member('/Users/bri/quaked/Hexen 2/data1/pak0.pak','gfx/palette.lmp');assert len(palette)==768 and sha(palette)==v['paletteSha256']==native['paletteSha256']
  physical=[];contents={};seen=set();basepixels=None
  for p in v['provenance']:
   key=(p['source'],p['map'],p['slot']);assert key not in seen;seen.add(key)
   bsp,at=member(p['source'],p['map']);assert at==p['memberOffset'] and sha(bsp)==p['bspSha256'] and before[p['source']]==p['PAKSha256']
   assert struct.unpack_from('<i',bsp)[0]==29;lumps=[struct.unpack_from('<II',bsp,4+i*8) for i in range(15)];start,size=lumps[2]
   assert 0<=p['slot']<struct.unpack_from('<i',bsp,start)[0];pos=start+struct.unpack_from('<i',bsp,start+4+p['slot']*4)[0]
   assert bsp[pos:pos+16].split(b'\0')[0]==b'rtex018' and struct.unpack_from('<II',bsp,pos+16)==(64,256)
   mips=[]
   for level in range(4):
    off=struct.unpack_from('<I',bsp,pos+24+level*4)[0];n=(64>>level)*(256>>level);assert off>=40 and pos+off+n<=start+size;mips.append(bsp[pos+off:pos+off+n])
   assert [sha(b) for b in mips]==p['fourMipSHA256']==v['fourMipSHA256'];assert sha(mips[0])==v['indexedPixelSha256']==native['indexedPixelSha256']
   assert basepixels is None or basepixels==mips[0];basepixels=mips[0]
   ts,tn=lumps[6];fs,fn=lumps[7];assert tn%40==0 and fn%20==0
   ti={i:struct.unpack_from('<i',bsp,ts+i*40+36)[0] for i in range(tn//40) if struct.unpack_from('<i',bsp,ts+i*40+32)[0]==p['slot']}
   assert list(ti.values())==p['ordinaryTexinfoFlags'] and set(ti.values())=={0}
   faces=sum(struct.unpack_from('<H',bsp,fs+i*20+10)[0] in ti for i in range(fn//20));assert faces==p['faces']
   ck=(before[p['source']],p['map'],p['slot']);assert ck not in contents or contents[ck]==faces;contents[ck]=faces
   physical.append({'source':p['source'],'map':p['map'],'slot':p['slot'],'faces':faces,'bspSha256':sha(bsp),'fourMipSHA256':[sha(b) for b in mips],'ordinaryFlags':sorted(set(ti.values()))})
  image=Image.open(io.BytesIO(read(v['original']['file'])));assert image.mode=='RGB' and image.size==(64,256)
  rgba=np.c_[np.frombuffer(palette,dtype='uint8').reshape(256,3)[np.frombuffer(basepixels,dtype='uint8')],np.full(64*256,255,dtype='uint8')].reshape(256,64,4)
  assert rgba.tobytes()==image.convert('RGBA').tobytes() and sha(rgba.tobytes())==v['rgbaSha256']==native['rgbaSha256']
  assert len(physical)==v['uniquePathMapSlotCount']==13 and len(contents)==v['uniquePAKContentMapSlotCount']==10
  assert all(ah(p)==h for p,h in before.items()) and all(p.read_bytes()==b for p,b in watched.items())
  report.update(verdict='PASS fresh native-only actual PAK/BSP all-four-mip/flags/paletteRGBA',nativeIdentity=ID,name='rtex018',edition='base',nativeDimensions=[64,256],physicalOccurrences=physical,physicalPathCount=len(physical),uniqueContentSlotCount=len(contents),physicalFaces=sum(p['faces'] for p in physical),uniqueContentFaces=sum(contents.values()),nativeRgbaAliases=0,archivesStable=before,original=witness(v['original']['file']),inputsStable=True,limits=['Compiled faces do not prove camera visibility.','Current source/master/physical/tier acceptance is separate.','Historical catalog67 screen is not a current coverage claim.'])
 except Exception as e:report['error']=repr(e);raise
 finally:
  report['inputs']=[witness(p) for p in sorted(watched)];report['verifier']=witness(__file__);report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
  with out.open('x') as f:json.dump(report,f,indent=2);f.write('\n')
  print(json.dumps({'file':str(out.relative_to(R)),'sha256':sha(out.read_bytes()),'verdict':report['verdict']}))
if __name__=='__main__':main()
