"""Independent source-only proof of three explicit native-content candidates.

No candidate assets, generations, bindings or acceptances are created. Existing
qualified files are read and replayed; native mip/flag data is read from PAKs.
"""
import datetime, hashlib, io, json, pathlib, struct, sys
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19'
OUT = ROOT / 'docs/hexen2/textures/batch-005-alias-public-source-proof.json'
assert not OUT.exists(), 'Retain prior evidence'
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text())
def witness(p):
    b = p.read_bytes()
    return {'file': str(p.relative_to(ROOT)), 'sha256': sha(b), 'bytes': len(b)}
def file_sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(1024**2), b''): h.update(b)
    return h.hexdigest()
CONFIG = [
 ('83920895b8153a740008c637dfd9478d63ea2f4e634ffa65e7b755765968bf23', 'rtex030',
  'd410cc7d9f11c8e500a8c4077b8de699db28568b4f3beabc526205d54490ba63', 'ttex019',
  BASE/'batch-004/masters/ttex019/master.json', BASE/'batch-004/tiers/ttex019/manifest.json',
  ROOT/'docs/hexen2/textures/batch-004-public-actual-v1.json', 'Target batch004 art remains pending; technical source proof is not acceptance'),
 ('f69e7d5f3fd39ada7fb79460e097fa6f14886a584b638d0ecb30014547eda19d', 'rtex044',
  '44b57bef065ee453640e8663b89546d781c9f45e4090d468352521cc75c9b832', 'ttex016',
  BASE/'masters/ttex016/master.json', BASE/'tiers/ttex016/manifest.json',
  ROOT/'docs/hexen2/textures/two-tier-actual-public-verification.json', 'Target existed in reviewed catalog; candidate alias art/binding acceptance remains pending'),
 ('a4c38848ae43251e41028ac8df0ce362ff6978e15cec80edc4a868bec1eacf6f', 'ttex022',
  '8defb77be8c0d368d6ae7cb9107d0c9563d46f14923b022157f64b9699992aac', 'rtex041',
  BASE/'masters/rtex041/master.json', BASE/'tiers/rtex041/manifest.json',
  ROOT/'docs/hexen2/textures/two-tier-actual-public-verification.json', 'Target existed in reviewed catalog; candidate alias art/binding acceptance remains pending')]
report = {'schemaVersion': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'candidates': [],
          'limits': ['Source equality only; no alias binding, candidate acceptance, art pass or runtime claim.',
                     'No candidate original PNG extracted: fresh native RGBA is compared directly against existing target Low PNG pixels.',
                     'No new generation, master, map, API action or Git mutation. Existing qualified map hashes are reused, not an extra full codec test campaign.',
                     'Retain native identity/name/profile/map/slot/flags independently even when enhanced physical files may be reused.']}
try:
    inventory_path = ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json'
    inv = load(inventory_path); fixed = [pathlib.Path(__file__), inventory_path]
    for _, _, _, _, mp, tp, pp, _ in CONFIG:
        fixed += [mp, tp, pp]
        m = load(mp)
        if all(isinstance(v, str) for v in m['inputs'].values()):
            fixed += [ROOT/p for p in m['inputs']]
        else:
            fixed += [pathlib.Path(v['file']) if pathlib.Path(v['file']).is_absolute() else ROOT/v['file'] for v in m['inputs'].values()]
        for key in ('color', 'height'):
            value = m[key]['file']; p = pathlib.Path(value)
            fixed.append(p if p.is_absolute() else ROOT/p if value.startswith('assets/') else mp.parent/p)
        t = load(tp); fixed += [tp.parent/o['file'] for tier in t['tiers'].values() for o in tier['outputs'].values()]
    before = {p: sha(p.read_bytes()) for p in set(fixed)}
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
    sys.path[:0] = [str(ROOT/'tools'),str(ROOT/'tools/texture_sheets')]
    from craft_normals import craft
    from finish_official_texture import finish
    for source_id, source_name, target_id, target_name, mp, tp, pp, pending in CONFIG:
        native = next(v for v in inv['variants'] if v['id']==source_id); target = next(v for v in inv['variants'] if v['id']==target_id)
        assert native['name']==source_name and target['name']==target_name
        for key in ('width','height','category','paletteSha256','indexedPixelSha256','rgbaSha256'): assert native[key]==target[key]
        assert native['category']=='ordinary' and sha(palette)==native['paletteSha256']
        assert all(not v['name'].startswith(('*','!','+','{')) and not v['name'].lower().startswith('sky') for v in (native,target))
        a, source_occ = all_occurrences(native); b, target_occ = all_occurrences(target); assert a==b, (source_name,target_name,'Native4mip mismatch')
        w,h=native['width'],native['height']; rgba=np.c_[np.frombuffer(palette,dtype='uint8').reshape(256,3)[np.frombuffer(a[0],dtype='uint8')],np.full(w*h,255,dtype='uint8')].reshape(h,w,4)
        assert sha(rgba.tobytes())==native['rgbaSha256']; original=Image.fromarray(rgba[:,:,:3])
        m,t,previous=load(mp),load(tp),load(pp); assert previous['verdict'].startswith('PASS')
        prior=next(row for row in previous['materials'] if row['name']==target_name)
        master_witness=prior.get('masterPackage',prior.get('singleMaster')); assert sha(mp.read_bytes())==master_witness['sha256']
        tier_witness = prior.get('tierReceipt')
        if tier_witness is None:
            tier_witness = next(row for row in previous['inputs'] if (ROOT/row['file']).resolve()==tp.resolve())
        assert sha(tp.read_bytes())==tier_witness['sha256']
        if all(isinstance(v,str)for v in m['inputs'].values()):
            inputs={path:ROOT/path for path in m['inputs']}
            for path,p in inputs.items(): assert sha(p.read_bytes())==m['inputs'][path]
            original_path=next(p for p in inputs.values()if '/originals/'in str(p));raw_path=next(p for p in inputs.values()if 'generated'in p.name and p.suffix=='.png')
        else:
            inputs={role:pathlib.Path(row['file'])if pathlib.Path(row['file']).is_absolute()else ROOT/row['file']for role,row in m['inputs'].items()}
            for role,p in inputs.items(): assert sha(p.read_bytes())==m['inputs'][role]['sha256']
            original_path,raw_path=inputs['original'],inputs['generated']
        assert Image.open(original_path).convert('RGBA').tobytes()==rgba.tobytes()
        def package_asset(role):
            value=m[role]['file'];p=pathlib.Path(value)
            return p if p.is_absolute()else ROOT/p if value.startswith('assets/')else mp.parent/p
        cp,hp=package_asset('color'),package_asset('height');assert sha(cp.read_bytes())==m['color']['sha256']and sha(hp.read_bytes())==m['height']['sha256']
        color=Image.open(cp).convert('RGB');height=np.load(hp,allow_pickle=False);assert color.size==(w*8,h*8)and height.shape==(h*8,w*8)and height.dtype==np.dtype('float32')
        assert m['generationCount']==1 and m['height']['authoredOnce']is True and m['height']['quantizedTo8Bit']is False
        raw=Image.open(raw_path).convert('RGB');assert raw.width>=w*8 and raw.height>=h*8
        reg=m['registration'];assert reg['verticalLandmarks']is None
        rebuilt,_=finish(original,raw,factor=8,comparison_divisor=2,method='photographic',color_strength=reg['colorStrength'],field_sigma=reg['fieldSigma'])
        assert rebuilt.tobytes()==color.tobytes();rh,_=craft(np.asarray(color,dtype=float)/255,m['height']['profile'],quantize_height=False);assert np.array_equal(rh.astype('float32'),height)
        maps,distances=[],[]
        for tier,row in t['tiers'].items():
            for role,r in row['outputs'].items():
                p=tp.parent/r['file'];assert sha(p.read_bytes())==r['sha256'];maps.append({'tier':tier,'role':role,**witness(p)})
            diffuse=Image.open(tp.parent/row['outputs']['diffuse']['file']).convert('RGB')
            for d in row['distanceChecks']:
                dims=(w//d['divisor'],h//d['divisor']);error=np.abs(np.asarray(original.resize(dims,Image.Resampling.BOX),dtype=float)-np.asarray(diffuse.resize(dims,Image.Resampling.BOX),dtype=float))
                assert d['meanAbsoluteError']==float(error.mean())and d['maximum']==float(error.max());distances.append({'tier':tier,**d})
        assert len(maps)==10
        report['candidates'].append({'nativeId':source_id,'nativeName':source_name,'targetId':target_id,'targetName':target_name,'nativeDimensions':[w,h],
          'verdict':'PASS native-content candidate only; acceptance not granted','acceptanceState':pending,'fourMipSHA256':[sha(x)for x in a],
          'paletteSha256':sha(palette),'indexedPixelSha256':native['indexedPixelSha256'],'rgbaSha256':native['rgbaSha256'],
          'sourceOccurrences':source_occ,'targetOccurrences':target_occ,'occurrencesChecked':len(source_occ)+len(target_occ),
          'candidateNativeRGBAEqualsExistingOpaqueLow':True,'candidateLowPNGExtracted':False,'existingLow':witness(original_path),
          'existingMasterPackage':witness(mp),'existingTierReceipt':witness(tp),'qualifiedTechnicalProof':witness(pp),
          'canonicalRGBReplayedAgainstFreshCandidateLow':True,'singleFloatHeightReplayedExact':True,'rawSourceDimensions':list(raw.size),
          'rawSourceAspectExact':raw.width*h==raw.height*w,'canonicalMasterDimensions':list(color.size),'mapFiles':maps,'ownLowDistanceChecks':distances,
          'newGenerations':0,'newMasterPackages':0,'newMapFiles':0,'bindingCreated':False})
    assert all(sha(p.read_bytes())==digest for p,digest in before.items())
    assert all(file_sha(pathlib.Path(a['path']))==a['sha256']for a in inv['archives'])
    report.update({'verdict':'PASS three explicit native-content alias candidates; source-only, no binding/art acceptance',
      'candidateCount':3,'nativeOccurrencesChecked':sum(c['occurrencesChecked']for c in report['candidates']),
      'newGenerations':0,'newMasterPackages':0,'newMapFiles':0,'inputsStable':True,'inputs':[witness(p)for p in sorted(set(fixed))],'archiveInputsStable':inv['archives']})
except Exception as exc:
    report['verdict']='HOLD';report['error']=repr(exc);raise
finally:
    report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();OUT.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'proof':str(OUT),'verdict':report['verdict'],'sha256':sha(OUT.read_bytes())}))
