"""Independent selected Hipnotic PACK/BSP29/native-byte recheck, no game writes.

This does not import the original proof's parser and does not census aliases,
other maps, materials or sources. Only its own JSON receipt is written.
"""
from pathlib import Path
import datetime
import hashlib
import json
import struct

from PIL import Image

ROOT=Path(__file__).resolve().parents[5]
HERE=Path(__file__).resolve().parent
sha=lambda data:hashlib.sha256(data).hexdigest()
proof_path=ROOT/'docs/quake/textures/batch-002/native-source-proof.json'
proof=json.loads(proof_path.read_text())
row=next(x for x in proof['materials']if x['name']=='woodflr1_6')
assert row['nativeIdentity']=='a47bf72a420b107f8363ff0f73038393ca0c60673b95f98f465d4a1c296f4b46'
assert len(row['uses'])==1
use=row['uses'][0]
assert (use['game'],use['map'],use['slot'])==('hipnotic','maps/hip2m2.bsp',17)
packs=[]
mounted={}
for path in use['mountOrder']:
    p=Path(path);size_on_disk=p.stat().st_size
    digest=hashlib.sha256()
    with p.open('rb')as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
        stream.seek(0);header=stream.read(12)
        assert header[:4]==b'PACK'
        start,length=struct.unpack_from('<II',header,4)
        assert length%64==0 and start>=12 and start+length<=size_on_disk
        stream.seek(start);directory=stream.read(length)
    members={}
    for at in range(0,length,64):
        name=directory[at:at+56].split(b'\0',1)[0].decode('ascii').lower()
        offset,size=struct.unpack_from('<II',directory,at+56)
        assert name not in members and offset+size<=size_on_disk
        members[name]=(offset,size)
        mounted[name]=(p.resolve(),offset,size)
    pack={'file':str(p),'resolved':str(p.resolve()),'bytes':size_on_disk,'sha256':digest.hexdigest(),
          'directorySha256':sha(directory),'memberCount':len(members)}
    old=next(x for x in proof['packs']if x['path']==path)
    assert pack['sha256']==old['sha256'] and pack['directorySha256']==old['directorySha256']
    packs.append(pack)
def read_member(name):
    path,offset,size=mounted[name]
    with path.open('rb')as stream:
        stream.seek(offset);data=stream.read(size)
    assert len(data)==size
    return path,data,offset,size
map_path,bsp,map_offset,map_size=read_member(use['map'])
pal_path,palette,pal_offset,pal_size=read_member('gfx/palette.lmp')
assert str(map_path)==use['mapMember']['resolvedPack'] and sha(bsp)==use['bspSha256']
assert len(palette)==768 and str(pal_path)==use['paletteMember']['resolvedPack']
assert (map_offset,map_size)==(use['mapMember']['offset'],use['mapMember']['bytes'])
assert struct.unpack_from('<i',bsp)[0]==29
def lump(index):
    at,n=struct.unpack_from('<ii',bsp,4+index*8)
    assert at>=0 and n>=0 and at+n<=len(bsp)
    return bsp[at:at+n]
textures=lump(2);count=struct.unpack_from('<i',textures)[0]
assert 0<=17<count and 4+4*count<=len(textures)
base=struct.unpack_from('<i',textures,4+17*4)[0]
assert base>=4+4*count and base+40<=len(textures)
assert textures[base:base+16].split(b'\0',1)[0]==b'woodflr1_6'
w,h,*offsets=struct.unpack_from('<6I',textures,base+16)
assert (w,h)==(64,64)
mips=[]
for level,offset in enumerate(offsets):
    size=(w>>level)*(h>>level)
    assert offset>=40 and base+offset+size<=len(textures)
    mips.append(textures[base+offset:base+offset+size])
assert [sha(x)for x in mips]==row['identity']['mipIndexedSha256']
texinfo=lump(6);faces=lump(7)
assert len(texinfo)%40==0 and len(faces)%20==0
flags=set();infos=[];used=0
for at in range(0,len(texinfo),40):
    slot,flag=struct.unpack_from('<ii',texinfo,at+32)
    if slot==17:
        flags.add(flag);infos.append({'index':at//40,'flags':flag,'vectorsSha256':sha(texinfo[at:at+32])})
for at in range(0,len(faces),20):
    info=struct.unpack_from('<H',faces,at+10)[0]
    assert info<len(texinfo)//40
    slot,flag=struct.unpack_from('<ii',texinfo,info*40+32)
    if slot==17:assert flag==0;used+=1
assert sorted(flags)==[0] and infos==use['texinfo'] and used==use['directFaces']==228
rgba=b''.join(palette[i*3:i*3+3]+b'\xff'for i in mips[0])
identity={'name':'woodflr1_6','dimensions':[64,64],'paletteSha256':sha(palette),
 'indexedSha256':sha(mips[0]),'rgbaSha256':sha(rgba),'mipIndexedSha256':[sha(x)for x in mips],
 'materialFlags':sorted(flags),'nativeSemantics':{'family':'ordinary-world','alphaIndex255':False,
 'fullbrightStart':224,'fullbrightMaskSha256':sha(bytes(255 if x>=224 else 0 for x in mips[0]))}}
assert identity==row['identity']
native_id=sha(json.dumps(identity,sort_keys=True,separators=(',',':')).encode())
assert native_id==row['nativeIdentity']
original=ROOT/row['original']
assert sha(original.read_bytes())==row['originalSha256']
with Image.open(original)as image:
    assert image.format=='PNG' and image.size==(64,64) and image.convert('RGBA').tobytes()==rgba
report={'verdict':'PASS bounded independent selectednativebyte/provenance recheck only',
 'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nativeIdentity':native_id,
 'identity':identity,'original':{'file':row['original'],'sha256':sha(original.read_bytes())},
 'sourceProof':{'file':str(proof_path.relative_to(ROOT)),'sha256':sha(proof_path.read_bytes())},
 'selectedUse':{'game':'hipnotic','map':'maps/hip2m2.bsp','slot':17,'directFaces':used,
 'bspSha256':sha(bsp),'effectiveMap':str(map_path),'effectivePalette':str(pal_path),'texinfo':infos},
 'packs':packs,'verifierSha256':sha(Path(__file__).read_bytes()),
 'limits':['One selected used native identity from one Hipnotic BSP; no all-map/native-family census or alias claim.',
 'Current bytes/provenance only; material interpretation, source generation, master/relief/tier/art/runtime acceptance remain separate.']}
(HERE/'selected-native-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'verdict':report['verdict'],'nativeIdentity':native_id,'directFaces':used}))
