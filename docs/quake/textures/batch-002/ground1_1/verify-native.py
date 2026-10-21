"""Bounded independent reread of ground1_1's four selected native occurrences.
No root native-reader import, writes to originals/PAKs, generation or runtime gate.
"""
from pathlib import Path
import datetime,hashlib,json,struct
from PIL import Image
ROOT=Path(__file__).resolve().parents[5]
EXPECTED='b61bef02086b618f68cdd120b24e270033ea94c8307f18c599a482c8c099845e'
proofp=ROOT/'docs/quake/textures/batch-002/native-source-proof.json';proof=json.loads(proofp.read_text());row=next(x for x in proof['materials']if x['name']=='ground1_1');original=ROOT/row['original'];sha=lambda b:hashlib.sha256(b).hexdigest();out=Path(__file__).parent/'native-independent-proof.json';assert not out.exists()
png=original.read_bytes();im=Image.open(original);assert im.format=='PNG'and im.size==(64,64);rgba=im.convert('RGBA').tobytes();assert sha(png)==row['originalSha256']and sha(rgba)==row['identity']['rgbaSha256'];packs={};receipts=[]
def readpack(name):
 if name in packs:return packs[name]
 p=Path(name);real=p.resolve(strict=True);st=p.stat()
 with p.open('rb')as f:
  header=f.read(12);assert header[:4]==b'PACK';offset,length=struct.unpack_from('<II',header,4);assert length%64==0 and offset+length<=st.st_size;f.seek(offset);directory=f.read(length)
 members={}
 for start in range(0,length,64):
  rec=directory[start:start+64];n=rec[:56].split(b'\0',1)[0].decode('ascii').lower();at,size=struct.unpack_from('<II',rec,56);assert n not in members and at+size<=st.st_size;members[n]=(at,size)
 h=hashlib.sha256()
 with p.open('rb')as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 actual={'path':name,'resolvedPath':str(real),'bytes':st.st_size,'sha256':h.hexdigest(),'directoryOffset':offset,'directoryBytes':length,'directorySha256':sha(directory),'memberCount':len(members)}
 expected=next(x for x in proof['packs']if x['path']==name);assert actual==expected
 packs[name]=(p,members,st,actual);return packs[name]
def member(pack,name,receipt):
 p,members,_,_=readpack(pack);at,n=members[name];assert(at,n)==(receipt['offset'],receipt['bytes'])and str(p.resolve())==receipt['resolvedPack']
 with p.open('rb')as f:f.seek(at);b=f.read(n)
 assert len(b)==n;return b
for use in row['uses']:
 effective={}
 for pack in use['mountOrder']:
  for name in readpack(pack)[1]:effective[name]=pack
 assert effective[use['map']]==use['mapMember']['pack']and effective['gfx/palette.lmp']==use['paletteMember']['pack']
 b=member(effective[use['map']],use['map'],use['mapMember']);palette=member(effective['gfx/palette.lmp'],'gfx/palette.lmp',use['paletteMember']);assert sha(b)==use['bspSha256']and len(palette)==768
 assert struct.unpack_from('<I',b)[0]==29
 def lump(index):
  at,n=struct.unpack_from('<ii',b,4+index*8);assert at>=0 and n>=0 and at+n<=len(b);return b[at:at+n]
 tex=lump(2);count=struct.unpack_from('<i',tex)[0];slot=use['slot'];assert 0<=slot<count;start=struct.unpack_from('<i',tex,4+slot*4)[0];assert start>=4+count*4
 name=tex[start:start+16].split(b'\0',1)[0].decode('ascii');w,h,*offsets=struct.unpack_from('<6I',tex,start+16);assert name=='ground1_1'and(w,h)==(64,64);mips=[]
 for level,at in enumerate(offsets):
  n=(w>>level)*(h>>level);assert at>=40 and start+at+n<=len(tex);pixels=tex[start+at:start+at+n];assert sha(pixels)==use['mips'][level]['indexedSha256'];mips.append(pixels)
 decoded=b''.join(palette[idx*3:idx*3+3]+b'\xff'for idx in mips[0]);assert decoded==rgba
 ti,faces=lump(6),lump(7);assert len(ti)%40==0 and len(faces)%20==0;infos=[];flags=[]
 for i in range(len(ti)//40):
  target,flag=struct.unpack_from('<ii',ti,i*40+32)
  if target==slot:infos.append({'index':i,'flags':flag,'vectorsSha256':sha(ti[i*40:i*40+32])});flags.append(flag)
 used={}
 for i in range(len(faces)//20):
  info=struct.unpack_from('<H',faces,i*20+10)[0];target,flag=struct.unpack_from('<ii',ti,info*40+32)
  if target==slot:used[flag]=used.get(flag,0)+1
 assert infos==use['texinfo']and sum(used.values())==use['directFaces']and sorted(set(flags))==[0]
 identity={'name':name,'dimensions':[w,h],'paletteSha256':sha(palette),'indexedSha256':sha(mips[0]),'rgbaSha256':sha(decoded),'mipIndexedSha256':[sha(x)for x in mips],'materialFlags':sorted(set(flags)),'nativeSemantics':{'family':'ordinary-world','alphaIndex255':False,'fullbrightStart':224,'fullbrightMaskSha256':sha(bytes(255 if x>=224 else 0 for x in mips[0]))}}
 nativeid=sha(json.dumps(identity,sort_keys=True,separators=(',',':')).encode());assert identity==row['identity']and nativeid==row['nativeIdentity']==EXPECTED
 receipts.append({'game':use['game'],'scope':use['scope'],'map':use['map'],'slot':slot,'nativeIdentity':nativeid,'exactIndexedPaletteRGBAAll4MipsAndFlags':True,'texinfoVectorsExact':True,'directFaces':sum(used.values()),'mapMember':use['mapMember'],'paletteMember':use['paletteMember'],'bspSha256':sha(b)})
for p,_,st,_ in packs.values():assert p.stat().st_size==st.st_size and p.stat().st_mtime_ns==st.st_mtime_ns
assert original.read_bytes()==png
report={'verdict':'PASS bounded independent ground1_1 native byte/provenance rebind only','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nativeIdentity':EXPECTED,'name':'ground1_1','nativeDimensions':[64,64],'original':{'file':str(original.relative_to(ROOT)),'sha256':sha(png),'rgbaSha256':sha(rgba)},'rootProof':{'file':str(proofp.relative_to(ROOT)),'sha256':sha(proofp.read_bytes())},'verifier':{'file':str(Path(__file__).relative_to(ROOT)),'sha256':sha(Path(__file__).read_bytes())},'identity':identity,'occurrences':receipts,'packs':[x[3]for x in packs.values()],'counts':{'selectedTextures':1,'occurrences':4,'campaignOccurrences':3,'installedExtraOccurrences':1,'nativeMipObservations':16},'limits':['Selected BSP29 texture only; not full native-family/game inventory, new source/master/ART/runtime acceptance.','Installedextra base32b remains separately scoped and is not relabelled stock campaign.','Full archive/directory hashes match root proof; only these selected map/palette members were parsed.','No source/master/gen/catalog/Git/Hexen writes.']};out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'verdict':report['verdict'],'nativeIdentity':EXPECTED,'counts':report['counts'],'report':str(out),'sha256':sha(out.read_bytes())}))
