"""Read-only accepted catalog checkpoint through005 after retirement.

Count canonical physical paths separately from native bindings and bind every
referenced source/master/height/tier/map/review hash. No encoding or gate rerun.
"""
import datetime, hashlib, json, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19'
OUT = ROOT/'docs/hexen2/textures/batch-005-public-catalog-post-cleanup.json'
assert not OUT.exists(), 'Retain prior evidence'
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text())
def witness(p):
    b=p.read_bytes()
    try:name=str(p.relative_to(ROOT))
    except ValueError:name=str(p)
    return {'file':name,'sha256':sha(b),'bytes':len(b)}
def asset(mp, record):
    value=record['file'];p=pathlib.Path(value)
    return p if p.is_absolute() else ROOT/p if value.startswith('assets/') else mp.parent/p
REPORT={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'limits':['This verifies the catalog offline acceptance checkpoint and referenced immutable bytes, not owner acceptance, runtime integration or the full campaign.',
           'Source/tier/map hashes are rechecked; unchanged qualified codec/math and tests are not rerun.',
           'Physical counts use unique canonical paths; native bindings retain names/ids/context.']}
try:
    catalog_path=BASE/'catalog.json';catalog_digest=sha(catalog_path.read_bytes());catalog=load(catalog_path)
    assert catalog['pathsBase']=='repository'and catalog['family']=='hexen2'and catalog['defaultTier']=='Mid'
    assert catalog['campaignComplete']is False
    inventory_path=ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json';inventory=load(inventory_path)
    native={v['id']:v for v in inventory['variants']}
    items=catalog['materials'];assert len(items)==29 and len({i['id']for i in items})==29
    fixed={catalog_path,inventory_path};masters=set();tiers=set();physical_maps=set();physical_tiers=set();map_bindings=0;tier_bindings=0
    entries=[]
    for item in items:
        variant=native[item['id']];assert item['nativeIdentity']['id']==variant['id']and item['name']==variant['name']
        for key in('width','height','paletteSha256','indexedPixelSha256','rgbaSha256'):assert item['nativeIdentity'][key]==variant[key]
        low=ROOT/item['Low']['original'];assert item['Low']['unchanged']is True and sha(low.read_bytes())==item['Low']['sha256']
        assert sha(Image.open(low).convert('RGBA').tobytes())==variant['rgbaSha256']
        mp,tp=ROOT/item['masterPackage'],ROOT/item['tierReceipt'];assert sha(mp.read_bytes())==item['masterPackageSha256'];assert sha(tp.read_bytes())==item['tierReceiptSha256']
        masters.add(mp.resolve());tiers.add(tp.resolve());m,t=load(mp),load(tp)
        assert t['Low']['unchanged']is True and t['inputs']['original']['sha256']==item['Low']['sha256']
        assert t['defaultTier']=='Mid'and set(t['tiers'])=={'Mid','High'}and set(item['tiers'])=={'Mid','High'}
        assert m['generationCount']==1 and m['height']['authoredOnce']is True and m['height']['quantizedTo8Bit']is False
        source_inputs=[]
        if all(isinstance(v,str)for v in m['inputs'].values()):
            source_inputs=[(ROOT/path,digest)for path,digest in m['inputs'].items()]
        else:
            source_inputs=[(pathlib.Path(row['file'])if pathlib.Path(row['file']).is_absolute()else ROOT/row['file'],row['sha256'])for row in m['inputs'].values()]
        for p,digest in source_inputs:assert sha(p.read_bytes())==digest;fixed.add(p)
        for key,value in m['tools'].items():
            if isinstance(value,str):p,digest=ROOT/key,value
            else:p,digest=pathlib.Path(value['file']),value['sha256']
            assert sha(p.read_bytes())==digest;fixed.add(p)
        for role in('color','height'):
            p=asset(mp,m[role]);assert sha(p.read_bytes())==m[role]['sha256'];fixed.add(p)
        for tier,factor in(('Mid',4),('High',8)):
            row,receipt=item['tiers'][tier],t['tiers'][tier];assert row['factor']==factor and row['dimensions']==receipt['dimensions']==[variant['width']*factor,variant['height']*factor]
            physical_tiers.add((tp.resolve(),tier));tier_bindings+=1
            assert set(row['outputs'])==set(receipt['outputs'])=={'diffuse','height','normalX','normalY','normalZ'}
            for role,record in row['outputs'].items():
                p=ROOT/record['file'];r=receipt['outputs'][role]
                assert p.resolve()==(tp.parent/r['file']).resolve()and sha(p.read_bytes())==record['sha256']==r['sha256']
                assert (r['quality'],r['method'],r['lossless'])==(92,6,False)
                physical_maps.add(p.resolve());fixed.add(p);map_bindings+=1
        review_records=[]
        for path,digest in item['reviews'].items():
            p=ROOT/path;assert sha(p.read_bytes())==digest;fixed.add(p);review_records.append(witness(p))
        fixed.update((low,mp,tp));entries.append({'id':item['id'],'name':item['name'],'Low':witness(low),'masterPackage':witness(mp),'tierReceipt':witness(tp),'reviews':review_records})
    measured={'reviewedWorldNativeIdentities':len(items),'masterPackages':len(masters),'enhancedTiers':len(physical_tiers),
              'enhancedMaps':len(physical_maps),'enhancedTierBindings':tier_bindings,'enhancedMapBindings':map_bindings}
    assert measured==catalog['counts']=={'reviewedWorldNativeIdentities':29,'masterPackages':25,'enhancedTiers':50,'enhancedMaps':250,'enhancedTierBindings':58,'enhancedMapBindings':290}
    four_expected={
     'docs/hexen2/textures/batch-004-art-review.json':'47045c789d89322ce35202c53bb1d2e3bf4d49637bf9445f53cd647fba725fd0',
     'docs/hexen2/textures/batch-004-public-actual-v1.json':'375ee72905b5f996265cb13b7503621a9a77016a3c252608a607683bb64d480b',
     'docs/hexen2/textures/batch-004-public-preview-v1.json':'65dcb81aeb1d7ee53e9b05055376dd8ad1cdfa22cb916e491a23b057e6e8571d',
     'docs/hexen2/textures/batch-004-public-alias.json':'3b1c1c569cd9486e65f49247fce2e57d959bc1103c91345321892fb1b34c4076'}
    for path,digest in four_expected.items():assert sha((ROOT/path).read_bytes())==digest;fixed.add(ROOT/path)
    immutable_batch=BASE/'batch-004/batch.json';assert sha(immutable_batch.read_bytes())=='dbc055e09e62ea57ae4db52ee3f445c21c1a06a829a2c8762b5fdff4b148fac9';fixed.add(immutable_batch)
    preview_proof=load(ROOT/'docs/hexen2/textures/batch-004-public-preview-v1.json')
    # Target004 inputs include its unchanged batch/selection/raw/provider files,
    # aliases and all map refs. Check that exact retained custody snapshot.
    for row in preview_proof['inputs']:
        p=pathlib.Path(row['file'])if pathlib.Path(row['file']).is_absolute()else ROOT/row['file']
        assert sha(p.read_bytes())==row['sha256'],row['file'];fixed.add(p)
    final005={
      'docs/hexen2/textures/batch-005-art-review-v2.json':'ea384953629e5c3760b085009cbacf5e8da2e7a1c831d19ff362ae54d0d12dd7',
      'docs/hexen2/textures/batch-005-public-registered-actual-v1.json':'4158d659d423cb9405a525e63bdf91658f9af8ee375ceae4b8df5f56a692c236',
      'docs/hexen2/textures/batch-005-public-registered-preview-v1.json':'091449acd217d53341dca2ce83bcec583c0915d9955ec5d4978dec68a28d26de'}
    for path,digest in final005.items():assert sha((ROOT/path).read_bytes())==digest;fixed.add(ROOT/path)
    for proof_name in('batch-005-public-registered-actual-v1.json','batch-005-public-registered-preview-v1.json'):
        proof=load(ROOT/'docs/hexen2/textures'/proof_name)
        for row in proof['inputs']:
            p=pathlib.Path(row['file'])if pathlib.Path(row['file']).is_absolute()else ROOT/row['file']
            assert sha(p.read_bytes())==row['sha256'],row['file'];fixed.add(p)
    REPORT['final005Proofs']=final005
    REPORT['005FinalInputCustodyMatches']=True
    snapshots=[witness(p)for p in sorted(fixed)]
    assert all(sha((ROOT/r['file']).read_bytes())==r['sha256']for r in snapshots)
    assert sha(catalog_path.read_bytes())==catalog_digest
    REPORT.update({'verdict':'PASS accepted005catalog29nativebindings/25physicalmasters/250physicalmaps/290mapbindings; all referenced hashes stable',
      'catalog':witness(catalog_path),'measuredCounts':measured,'entries':entries,'four004Proofs':four_expected,
      'immutable004Batch':witness(immutable_batch),'004PreviewInputCustodyMatches':True,'inputs':snapshots,'inputsStable':True})
except Exception as exc:
    REPORT['verdict']='HOLD';REPORT['error']=repr(exc);raise
finally:
    REPORT['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();OUT.write_text(json.dumps(REPORT,indent=2)+'\n')
    print(json.dumps({'proof':str(OUT),'verdict':REPORT['verdict'],'sha256':sha(OUT.read_bytes())}))
