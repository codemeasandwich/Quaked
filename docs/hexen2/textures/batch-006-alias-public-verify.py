"""Read-only006peer-content source proof; no master, binding or generation."""
import datetime, hashlib, json, pathlib, struct
import numpy as np
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-006'
OUT=ROOT/'docs/hexen2/textures/batch-006-alias-public-source-proof.json'
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
report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'limits':['Peer source equality only; neither master exists/is qualified by this proof.','No generation, asset/master/map/binding/acceptance orGit mutation.','Preserve both native names/ids/editions/map-slot semantics independently.']}
try:
    inventory_path=ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json'
    native_path=BASE/'native-selection.json';inv=load(inventory_path);native=load(native_path)
    source=next(v for v in inv['variants']if v['id']=='8ae609bd5aefc88b4cbeb0ae79338f31f80745c3f09706429bee9da0be256b58')
    target=next(v for v in inv['variants']if v['id']=='6ba575c49b64eabe1dbba9e563d06631f3d8344d319b7c89a34056a1a56fba98')
    assert source['name']=='rtex029'and target['name']=='ttex021'
    rows={i['id']:i for i in native['items']};paths=[pathlib.Path(__file__),inventory_path,native_path,*[ROOT/rows[v['id']]['original']for v in(source,target)]]
    before={p:sha(p.read_bytes())for p in paths}
    for key in('width','height','category','paletteSha256','indexedPixelSha256','rgbaSha256'):assert source[key]==target[key]
    assert source['category']=='ordinary'and(source['width'],source['height'])==(64,128)
    assert all(not v['name'].startswith(('*','!','+','{'))and not v['name'].lower().startswith('sky')for v in(source,target))
    directories = {}
    for a in inv['archives']:
        p = pathlib.Path(a['path']); assert file_sha(p) == a['sha256']
        with p.open('rb') as f:
            magic, off, n = struct.unpack('<4sII', f.read(12)); assert magic == b'PACK' and n%64 == 0
            f.seek(off); table = f.read(n)
        assert len(table) == n; entries = {}
        for at in range(0, n, 64): entries.setdefault(table[at:at+56].split(b'\0')[0].decode('ascii').lower(), struct.unpack_from('<II', table, at+56))
        directories[str(p)] = entries
    def member(source, name):
        off, n = directories[source][name]
        with open(source, 'rb') as f: f.seek(off); b = f.read(n)
        assert len(b) == n
        return b, off
    palette, _ = member('/Users/bri/quaked/Hexen 2/data1/pak0.pak', 'gfx/palette.lmp')
    assert len(palette) == 768
    def all_occurrences(variant):
        seen, records, baseline = set(), [], None
        for o in variant['provenance']:
            key = (o['source'], o['map'], o['slot'])
            if key in seen: continue
            seen.add(key); bsp, off = member(o['source'], o['map'])
            assert off == o['memberOffset'] and sha(bsp) == o['bspSha256']
            assert struct.unpack_from('<i', bsp)[0] == 29
            texture_off, texture_bytes = struct.unpack_from('<II', bsp, 20)
            at = texture_off+struct.unpack_from('<i', bsp, texture_off+4+4*o['slot'])[0]
            assert bsp[at:at+16].split(b'\0')[0].decode('ascii') == variant['name']
            width, height = struct.unpack_from('<II', bsp, at+16); assert (width,height) == (variant['width'],variant['height'])
            mips = []
            for level in range(4):
                local = struct.unpack_from('<I', bsp, at+24+level*4)[0]; n = (width>>level)*(height>>level)
                assert local >= 40 and at+local+n <= texture_off+texture_bytes
                pixels = bsp[at+local:at+local+n]; assert len(pixels) == n; mips.append(pixels)
            if baseline is None: baseline = mips
            assert mips == baseline, (variant['name'], o, 'Inconsistent native mip levels')
            assert sha(mips[0]) == variant['indexedPixelSha256']
            texinfo_off, texinfo_n = struct.unpack_from('<II', bsp, 4+6*8); assert texinfo_n%40 == 0
            flags = {struct.unpack_from('<i', bsp, t+36)[0] for t in range(texinfo_off,texinfo_off+texinfo_n,40) if struct.unpack_from('<i',bsp,t+32)[0] == o['slot']}
            assert not flags or flags == {0}
            records.append({'nativeId': variant['id'], 'name': variant['name'], 'source': o['source'], 'map': o['map'], 'slot':o['slot'],
                            'bspSha256':o['bspSha256'], 'ordinaryTexinfoFlags':sorted(flags),'fourMipSHA256':[sha(x)for x in mips]})
        assert baseline is not None
        return baseline, records
    a,source_occ=all_occurrences(source);b,target_occ=all_occurrences(target);assert a==b
    assert sha(palette)==source['paletteSha256']
    rgba=np.c_[np.frombuffer(palette,dtype='uint8').reshape(256,3)[np.frombuffer(a[0],dtype='uint8')],np.full(64*128,255,dtype='uint8')].reshape(128,64,4)
    assert sha(rgba.tobytes())==source['rgbaSha256']
    source_png=ROOT/rows[source['id']]['original'];target_png=ROOT/rows[target['id']]['original']
    assert source_png.read_bytes()==target_png.read_bytes()
    for v,p in((source,source_png),(target,target_png)):
        assert sha(p.read_bytes())==rows[v['id']]['originalSha256']
        assert Image.open(p).convert('RGBA').tobytes()==rgba.tobytes()
    assert all(sha(p.read_bytes())==digest for p,digest in before.items())
    assert all(file_sha(pathlib.Path(a['path']))==a['sha256']for a in inv['archives'])
    report.update({'verdict':'PASS explicit006peer sourcecontent equality; master/art/binding qualification pending','nativePair':[{'id':v['id'],'name':v['name']}for v in(source,target)],'nativeDimensions':[64,128],
      'fourMipSHA256':[sha(x)for x in a],'paletteSha256':sha(palette),'indexedPixelSha256':source['indexedPixelSha256'],'rgbaSha256':source['rgbaSha256'],
      'sourceOccurrences':source_occ,'targetOccurrences':target_occ,'occurrencesChecked':len(source_occ)+len(target_occ),'LowPNGBytesIdentical':True,'opaqueOrdinarySourceSemantics':True,
      'plannedOnePhysicalSourceForPair':True,'masterQualification':'Not performed; no generatedmaster available','canonicalGenerationDirection':'Not decided by sourceproof; suppliedselection prompts029 andomits021, consistentwithone029master plus021peerbinding.',
      'newGenerations':0,'newMasterPackages':0,'newMapFiles':0,'bindingCreated':False,'inputsStable':True,'inputs':[witness(p)for p in paths],'archiveInputsStable':inv['archives']})
except Exception as exc:
    report['verdict']='HOLD';report['error']=repr(exc);raise
finally:
    report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();OUT.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'proof':str(OUT),'verdict':report['verdict'],'sha256':sha(OUT.read_bytes())}))
