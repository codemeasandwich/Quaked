"""Independent bounded native/demo/eligibility and exact sealed plan inputs."""
import datetime
import hashlib
import io
import json
from pathlib import Path
import struct
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[6]
D=Path(__file__).resolve().parent
S=D.parent
LIB=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19'
B=LIB/'parallel-2026-10-20/stream-16-rtex020'
ID='e000f2f3924be87a02be5d0b90eb36fb8e1b1776a284d847eb7d3c360a3b4e4c'
watched={}
sha=lambda data:hashlib.sha256(data).hexdigest()

def read(p):
    p=Path(p);p=p if p.is_absolute() else ROOT/p
    data=p.read_bytes();assert p not in watched or watched[p]==sha(data),'Changed initial witness'
    watched[p]=sha(data);return data

def load(p):return json.loads(read(p))

def digest(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as file:
        for data in iter(lambda:file.read(1024*1024),b''):h.update(data)
    return h.hexdigest()

def witness(p):
    p=Path(p);p=p if p.is_absolute() else ROOT/p
    return {'file':str(p.relative_to(ROOT)) if ROOT in p.parents else str(p),'sha256':sha(read(p))}


def main():
    out=D/'input-proof-v1.json';assert not out.exists()
    plan=load(S/'plan.json');native=load(S/'native-proof.json');variant,=native['variants']
    assert plan['status'].startswith('READY_FOR_ROOT') and plan['target']['id']==native['targetNativeIdentity']==ID
    assert sha(read(S/'native-proof.json'))=='a85583b5db6de7f9a66cf2a343689751de677746d5ba31ca4d731f50d1b66e18'
    for group in ('evidence',):
        for row in plan[group].values():assert sha(read(row['file']))==row['sha256']
    for key in ('prompt','journal'):
        row=plan[key];assert sha(read(row['file']))==row['sha256']
    item,=load(B/'selection.json')['items']
    assert item['generationCount']==0 and item['generationState']=='not-issued'
    assert item['id']==ID and item['promptSha256']==plan['prompt']['sha256']
    assert not (B/'generated').exists() and not (B/'masters').exists() and not (B/'tiers').exists()
    prompt=read(plan['prompt']['file']).decode();assert len(prompt)>100 and 'ONE photographic colour texture' in prompt
    inv=load(S/'native-audit/inventory.json');old=load(ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json')
    selected,=[v for v in inv['variants'] if v['id']==ID]
    assert selected['category']=='ordinary' and (selected['width'],selected['height'])==(64,128)
    assert inv['archives']==old['archives']
    assert len(inv['variants'])==980
    assert not [v for v in inv['variants'] if v['id']!=ID and v['rgbaSha256']==selected['rgbaSha256']]
    archives={r['path']:r for r in inv['archives']};directories={};archive_hashes={}
    paths=sorted({r['source'] for r in variant['provenance']}|{'/Users/bri/quaked/Hexen 2/data1/pak0.pak'})
    for path in paths:
        archive_hashes[path]=digest(path);assert archive_hashes[path]==archives[path]['sha256']
        with open(path,'rb') as file:
            magic,offset,size=struct.unpack('<4sII',file.read(12));assert magic==b'PACK' and size%64==0
            file.seek(offset);table=file.read(size)
        directories[path]={}
        for at in range(0,size,64):
            name=table[at:at+56].split(b'\0')[0].decode('ascii').lower()
            directories[path].setdefault(name,struct.unpack_from('<II',table,at+56))
    def member(path,name):
        offset,size=directories[path][name]
        with open(path,'rb') as file:file.seek(offset);data=file.read(size)
        assert len(data)==size;return data,offset
    palette,_=member('/Users/bri/quaked/Hexen 2/data1/pak0.pak','gfx/palette.lmp')
    assert len(palette)==768 and sha(palette)==variant['paletteSha256']
    records=[];keys=set();contents=set();baseline=None
    for row in variant['provenance']:
        key=(row['source'],row['map'],row['slot']);assert key not in keys;keys.add(key)
        bsp,offset=member(row['source'],row['map']);assert sha(bsp)==row['bspSha256'] and offset==row['memberOffset']
        assert struct.unpack_from('<i',bsp)[0]==29
        lumps=[struct.unpack_from('<II',bsp,4+i*8) for i in range(15)]
        start,size=lumps[2];slot=row['slot'];assert 0<=slot<struct.unpack_from('<i',bsp,start)[0]
        at=start+struct.unpack_from('<i',bsp,start+4+slot*4)[0]
        assert bsp[at:at+16].split(b'\0')[0]==b'rtex020' and struct.unpack_from('<II',bsp,at+16)==(64,128)
        mips=[]
        for level in range(4):
            off=struct.unpack_from('<I',bsp,at+24+4*level)[0];n=(64>>level)*(128>>level)
            assert off>=40 and at+off+n<=start+size;mips.append(bsp[at+off:at+off+n])
        assert [sha(m) for m in mips]==row['fourMipSHA256']==variant['fourMipSHA256']
        if baseline is None:baseline=mips
        assert mips==baseline
        ti,tn=lumps[6];fo,fn=lumps[7];assert tn%40==0 and fn%20==0
        infos={i:struct.unpack_from('<i',bsp,ti+i*40+36)[0] for i in range(tn//40) if struct.unpack_from('<i',bsp,ti+i*40+32)[0]==slot}
        assert set(infos.values())=={0} and sorted(infos.values())==row['ordinaryTexinfoFlags']
        faces=sum(struct.unpack_from('<H',bsp,fo+i*20+10)[0] in infos for i in range(fn//20));assert faces==row['faces']
        contents.add((archive_hashes[row['source']],row['map'],slot))
        records.append({'source':row['source'],'map':row['map'],'slot':slot,'faces':faces,'fourMipSHA256':[sha(m) for m in mips],'ordinaryFlags':[0]})
    assert len(keys)==8 and len(contents)==7
    rgba=np.c_[np.frombuffer(palette,dtype='uint8').reshape(256,3)[np.frombuffer(baseline[0],dtype='uint8')],np.full(8192,255,dtype='uint8')].reshape(128,64,4)
    original=Image.open(io.BytesIO(read(variant['original']['file']))).convert('RGBA')
    assert original.size==(64,128) and original.tobytes()==rgba.tobytes()
    assert sha(rgba.tobytes())==variant['rgbaSha256']==plan['target']['rgbaSha256']
    assert sha(read(variant['original']['file']))==variant['original']['sha256']==plan['target']['originalSha256']
    for name in ('native-nearest.png','native-repeat-nearest.png','native-coordinate-grid.png','native-contact.png'):witness(B/'originals'/name)
    demo=load(S/'demo-priority-proof.json');assert demo['nativeIdentity']==ID
    recording_proofs=[]
    for row in demo['recordings']:
        data=read(row['file']);assert sha(data)==row['sha256'] and len(data)==row['bytes']
        nl=data.index(b'\n');assert nl<64;int(data[:nl])
        n=struct.unpack_from('<i',data,nl+1)[0];assert n==row['initialPacketLength'] and 0<n<=65536
        packet=data[nl+17:nl+17+n];assert len(packet)==n
        literal=row['initialModelMap'].encode()+b'\0';assert packet.count(literal)==1
        recording_proofs.append({**row,'independentFirstPacketLiteralChecked':True})
    compiled={}
    for r in records:
        if r['map'] in {x['initialModelMap'] for x in demo['recordings']}:
            assert r['map'] not in compiled;compiled[r['map']]=r['faces']
    assert compiled=={'maps/cath.bsp':394,'maps/demo1.bsp':209} and sum(compiled.values())==603
    catalog=load(LIB/'catalog.json');assert not [m for m in catalog['materials'] if m['id']==ID]
    # Fresh bounded retained-library check: identities in all JSON and exact RGBA
    # of every currently retained native-dimension image. Large images are not
    # equal-sized native RGBA peers; visual aliases are not classified here.
    json_files=[];identity_hits=[];images=[];decoded=0;matches=[]
    for file in sorted(LIB.rglob('*')):
        if not file.is_file() or file.is_relative_to(B):continue
        if file.suffix.lower()=='.json':
            raw=read(file);json.loads(raw);json_files.append(str(file.relative_to(ROOT)))
            if ID in raw.decode() or variant['rgbaSha256'] in raw.decode():identity_hits.append(str(file.relative_to(ROOT)))
        elif file.suffix.lower() in ('.png','.webp','.jpg','.jpeg'):
            with Image.open(file) as image:
                size=image.size;images.append({'file':str(file.relative_to(ROOT)),'dimensions':list(size)})
                if size==(64,128):
                    raw=read(file);pixel=Image.open(io.BytesIO(raw)).convert('RGBA').tobytes();decoded+=1
                    if pixel==rgba.tobytes():matches.append(str(file.relative_to(ROOT)))
    assert not identity_hits and not matches
    assert all(digest(path)==value for path,value in archive_hashes.items())
    assert all(sha(Path(path).read_bytes())==value for path,value in watched.items())
    report={'schemaVersion':1,'verdict':'PASS fresh native/demo/eligibility and exact sealed plan inputs; material/prompt review separate','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nativeIdentity':ID,'plan':witness(S/'plan.json'),'prompt':witness(plan['prompt']['file']),'journal':witness(B/'selection.json'),'original':witness(variant['original']['file']),'nativeProof':witness(S/'native-proof.json'),'nativePhysicalOccurrences':records,'nativePathSlotCount':len(keys),'nativeContentSlotCount':len(contents),'allFourNativeMipsAndFlagsExact':True,'recordingProofs':recording_proofs,'demoMapCompiledFaces':compiled,'demoCompiledFacesTotal':603,'catalog':witness(LIB/'catalog.json'),'catalogBindingsCurrent':len(catalog['materials']),'nativeVariantsScreened':980,'nativeRgbaPeers':0,'retainedJsonCount':len(json_files),'retainedIdentityHits':identity_hits,'retainedImageMetadataCount':len(images),'retainedNativeDimensionImagesDecoded':decoded,'retainedNativeRgbaMatches':matches,'generationCount':0,'allInputsStable':True,'archivesStable':archive_hashes,'inputs':{str(path.relative_to(ROOT)) if ROOT in path.parents else str(path):value for path,value in watched.items()},'verifier':witness(Path(__file__)),'limits':['Actual recording first-packet null-terminated map literal and compiled incidence only; not playback/camera/PVS visibility.','Native/retained exact ID and equal-dimension RGBA screening is not a perceptual photographic similarity search.','No generation, authoring, provider, release or catalogue mutation; root retains generation decision.']}
    with out.open('x') as file:json.dump(report,file,indent=2);file.write('\n')
    print(json.dumps({'proof':str(out.relative_to(ROOT)),'sha256':sha(out.read_bytes()),'nativeSlots':[len(keys),len(contents)],'compiledDemoFaces':603,'catalogBindings':len(catalog['materials']),'retainedJson':len(json_files),'nativeDimensionImages':decoded}))

if __name__=='__main__':main()
