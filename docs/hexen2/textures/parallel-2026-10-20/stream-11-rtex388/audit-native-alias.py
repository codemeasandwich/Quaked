"""Bounded source-only reuse of the established BSP29 all-mip/flag audit.

The selected identity has one level-zero peer. Verify every occurrence and all
four mips/flags before classifying that peer; no alias package or generation is
authorized by this native proof alone.
"""
import collections,datetime,hashlib,json,pathlib,struct
import numpy as np
from PIL import Image

R=pathlib.Path.cwd()
D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-11-rtex388'
B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-11-rtex388'
TARGET='ddf78c81cf519fbda0afc975b11b42f42949e3f9297a2e8f8dc3310c183b8d24'
PEER='baff63cee96df4550312535762851cfb3c4f3e8e3f7cc1e702b7ec52bfaa38d7'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
inv=load(D/'native-audit/inventory.json')
old=load(R/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json')
catp=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json'
catalog_bytes=catp.read_bytes();catalog=json.loads(catalog_bytes)
assert inv['archives']==old['archives']
assert TARGET not in {m['id'] for m in catalog['materials']}
target=next(x for x in inv['variants'] if x['id']==TARGET)
assert {x['id'] for x in inv['variants'] if x['rgbaSha256']==target['rgbaSha256']}=={TARGET,PEER}
directories={};archive_hashes={}
for row in inv['archives']:
    p=pathlib.Path(row['path']);payload=p.read_bytes()
    assert len(payload)==row['bytes'] and sha(payload)==row['sha256']
    magic,off,n=struct.unpack_from('<4sII',payload)
    assert magic==b'PACK' and n%64==0
    table=payload[off:off+n]
    directories[str(p)]={table[i:i+56].split(b'\0')[0].decode('ascii').lower():struct.unpack_from('<II',table,i+56) for i in range(0,n,64)}
    archive_hashes[str(p)]=row['sha256']

def member(path,name):
    off,n=directories[path][name]
    with open(path,'rb') as f:f.seek(off);payload=f.read(n)
    assert len(payload)==n
    return payload,off

palette,_=member('/Users/bri/quaked/Hexen 2/data1/pak0.pak','gfx/palette.lmp')
assert len(palette)==768
pal=np.frombuffer(palette,dtype='uint8').reshape(256,3)
variants=[];baselines={}
for identity in [TARGET,PEER]:
    v=next(x for x in inv['variants'] if x['id']==identity)
    prior=next(x for x in old['variants'] if x['id']==identity)
    assert {k:x for k,x in v.items() if k!='selectedOriginal'}=={k:x for k,x in prior.items() if k!='selectedOriginal'}
    assert v['category']=='ordinary' and (v['width'],v['height'])==(64,64)
    assert sha(palette)==v['paletteSha256']
    baseline=None;flags=set();records=[];seen=set();content_seen=set();counts=collections.Counter()
    for occurrence in v['provenance']:
        bsp,offset=member(occurrence['source'],occurrence['map'])
        assert offset==occurrence['memberOffset'] and sha(bsp)==occurrence['bspSha256']
        assert struct.unpack_from('<i',bsp)[0]==29
        lumps=[struct.unpack_from('<II',bsp,4+i*8) for i in range(15)]
        t,tn=lumps[2];slot=occurrence['slot']
        assert 0<=slot<struct.unpack_from('<i',bsp,t)[0]
        at=t+struct.unpack_from('<i',bsp,t+4+4*slot)[0]
        assert bsp[at:at+16].split(b'\0')[0].decode('ascii')==v['name']
        w,h=struct.unpack_from('<II',bsp,at+16);assert(w,h)==(64,64)
        mips=[]
        for level in range(4):
            start=struct.unpack_from('<I',bsp,at+24+level*4)[0];n=(w>>level)*(h>>level)
            assert start>=40 and at+start+n<=t+tn
            mips.append(bsp[at+start:at+start+n])
        if baseline is None:baseline=mips
        assert mips==baseline and sha(mips[0])==v['indexedPixelSha256']
        ti,n=lumps[6];fo,fn=lumps[7];assert n%40==0 and fn%20==0
        infos={i:struct.unpack_from('<i',bsp,ti+i*40+36)[0] for i in range(n//40) if struct.unpack_from('<i',bsp,ti+i*40+32)[0]==slot}
        flags.update(infos.values());assert set(infos.values())=={0}
        faces=[i for i in range(fn//20) if struct.unpack_from('<H',bsp,fo+i*20+10)[0] in infos]
        assert len(faces)==occurrence['faces'];counts[occurrence['profile']]+=len(faces)
        key=(occurrence['source'],occurrence['map'],slot)
        content_seen.add((archive_hashes[occurrence['source']],occurrence['map'],slot))
        if key not in seen:
            seen.add(key);records.append({**occurrence,'PAKSha256':archive_hashes[occurrence['source']],'fourMipSHA256':[sha(x) for x in mips],'ordinaryTexinfoFlags':sorted(infos.values())})
    rgba=np.c_[pal[np.frombuffer(baseline[0],dtype='uint8')],np.full(4096,255,dtype='uint8')].reshape(64,64,4)
    assert sha(rgba.tobytes())==v['rgbaSha256'] and dict(counts)==v['profileFaces']
    p=pathlib.Path(v['selectedOriginal']['path']);im=Image.open(p)
    assert im.format=='PNG' and im.size==(64,64) and im.convert('RGBA').tobytes()==rgba.tobytes()
    assert sha(p.read_bytes())==v['selectedOriginal']['sha256']
    baselines[identity]=baseline
    variants.append(dict(nativeIdentity=identity,name=v['name'],edition='base',nativeDimensions=[64,64],
        original=dict(file=str(p.relative_to(R)),sha256=sha(p.read_bytes())),paletteSha256=sha(palette),
        indexedPixelSha256=sha(baseline[0]),rgbaSha256=sha(rgba.tobytes()),
        fourMipSHA256=[sha(x) for x in baseline],ordinaryFlags=sorted(flags),profileFaces=dict(counts),
        uniquePathMapSlotCount=len(seen),uniquePAKContentMapSlotCount=len(content_seen),provenance=records,
        registered=any(m['id']==identity for m in catalog['materials'])))
assert baselines[TARGET]==baselines[PEER]
assert catp.read_bytes()==catalog_bytes,'Catalog changed during audit; recheck current eligibility'
report=dict(schemaVersion=1,verdict='PASS source-only: both ordinary native identities are exact-content peers across all four mips and flags',
    targetNativeIdentity=TARGET,peerNativeIdentity=PEER,variants=variants,allFourMipBytesEqual=True,
    paletteIndexRGBAAndDimensionsEqual=True,ordinaryFlagsEqual=True,
    sourceMeaning='rtex080 is an exact native content peer, not an accepted photographic target. Registration/reuse requires an accepted package and root authority; no additional texture assignment or generation.',
    catalogBindingsScreened=len(catalog['materials']),nativeVariantsScreened=len(inv['variants']),
    sameRgbaNativePeerCount=1,aliasesRegisteredByThisProof=0,
    inputs={str(p.relative_to(R)):sha(p.read_bytes()) for p in [pathlib.Path(__file__),D/'native-audit/inventory.json',R/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json',catp]},
    limits=['Native proof only, no photographic source/master/tier/art/runtime acceptance.','Duplicate Portal installations are independent path observations but identical PAK hashes collapse their content count.','The same-name egypt6 variant is not selected and not inferred to be an alias.'],
    completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
out=D/'native-and-peer-proof.json'
with out.open('x') as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(verdict=report['verdict'],sha256=sha(out.read_bytes()),variants=[dict(name=v['name'],pathSlots=v['uniquePathMapSlotCount'],contentSlots=v['uniquePAKContentMapSlotCount'],mips=v['fourMipSHA256']) for v in variants])))
