"""Bounded registered-catalog custody check; not new artistic qualification."""
from pathlib import Path
from PIL import Image
import json,hashlib,datetime
R=Path(__file__).resolve().parents[4];D=Path(__file__).resolve().parent
p=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json'
before=p.read_bytes();c=json.loads(before);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
maps={};masters={};ids=set();reviews={}
for a in c['materials']:
    assert a['id'] not in ids;ids.add(a['id'])
    low=R/a['Low']['original'];assert sha(low)==a['Low']['sha256']
    n=a['nativeIdentity'];im=Image.open(low)
    assert im.size==(n['width'],n['height']) and hashlib.sha256(im.convert('RGBA').tobytes()).hexdigest()==n['rgbaSha256']
    mp=R/a['masterPackage'];assert sha(mp)==a['masterPackageSha256'];m=json.loads(mp.read_text())
    assert m['masterDimensions']==[n['width']*8,n['height']*8];masters[str(mp.relative_to(R))]=sha(mp)
    for role in ('color','height'):
        q=Path(m[role]['file'])
        q=q if q.is_absolute() else (R/q if q.parts[0]=='assets' else mp.parent/q)
        assert q.resolve().is_relative_to(R) and sha(q)==m[role]['sha256']
    assert sha(R/a['tierReceipt'])==a['tierReceiptSha256']
    for tier,factor in [('Mid',4),('High',8)]:
        t=a['tiers'][tier];assert t['factor']==factor and t['dimensions']==[n['width']*factor,n['height']*factor]
        for o in t['outputs'].values():
            q=R/o['file'];assert sha(q)==o['sha256'];b=q.read_bytes()
            assert b[:4]==b'RIFF' and b[8:12]==b'WEBP' and b[12:16]==b'VP8 '
            assert Image.open(q).size==tuple(t['dimensions']);maps[o['file']]=o['sha256']
    for q,h in a['reviews'].items():assert sha(R/q)==h;reviews[q]=h
assert len(ids)==57 and len(masters)==50 and len(maps)==500 and p.read_bytes()==before
out=D/'root-catalog-57-custody-v2.json';assert not out.exists()
out.write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'PASS current registered catalog custody','scope':'Current native Low identity, all registered master/tier/review hash custody and decoded map dimensions/lossy VP8 container. Not new source/codec math, runtime or whole campaign acceptance.','initialAttempt':'Inline checker assumed all master output paths were package-relative; oldest packages store repository-relative paths. FileNotFoundError was verifier path-resolution failure, not a missing asset. Corrected checker supports only existing absolute/repository/package path conventions.','verifier':{'file':str(Path(__file__).relative_to(R)),'sha256':sha(Path(__file__))},'catalogSha256':hashlib.sha256(before).hexdigest(),'nativeIdentities':57,'physicalMasters':50,'physicalMaps':500,'nativeMapBindings':570,'masterPackages':masters,'physicalMapHashes':maps,'reviewHashes':reviews,'workingTreeAfter':'8f0e96bc checkpoint; later qualification remains uncommitted.'},indent=2)+'\n')
print(out.relative_to(R),sha(out))
