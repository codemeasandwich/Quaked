"""Read-only actual batch verification, with independent tier math/codec oracles.

Run with /usr/bin/python3, matching the retained authoring codec. A successful
receipt proves source binding and deterministic map derivation, not art/runtime
acceptance or an independent service-side generation invocation count.
"""
import argparse, datetime, hashlib, importlib.util, io, json, pathlib, struct, subprocess, sys
import PIL, numpy as np
from PIL import Image, ImageDraw, features

ROOT = pathlib.Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--selection', type=pathlib.Path, required=True)
parser.add_argument('--master-root', type=pathlib.Path, required=True)
parser.add_argument('--tier-root', type=pathlib.Path, required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
assert not args.output.exists(), 'Retain prior evidence'
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text())
resolve = lambda p: pathlib.Path(p) if pathlib.Path(p).is_absolute() else ROOT / p
image = lambda p: Image.open(p).convert('RGB')
def witness(p):
    b = p.read_bytes()
    try: name = str(p.resolve().relative_to(ROOT))
    except ValueError: name = str(p.resolve())
    return {'file': name, 'sha256': sha(b), 'bytes': len(b)}
def independent_y(image):
    value=np.asarray(image,dtype=float);h,w,_=value.shape
    forcing=np.zeros_like(value);forcing[0]=value[-1]-value[0];forcing[-1]=-forcing[0]
    eigen=2*np.cos(2*np.pi*np.arange(h)[:,None]/h)+2*np.cos(2*np.pi*np.arange(w)[None,:]/w)-4
    eigen[0,0]=1
    spectrum=np.fft.fft2(forcing,axes=(0,1))/eigen[:,:,None];spectrum[0,0]=0
    smooth=np.fft.ifft2(spectrum,axes=(0,1)).real
    lap=np.roll(smooth,1,0)+np.roll(smooth,-1,0)+np.roll(smooth,1,1)+np.roll(smooth,-1,1)-4*smooth
    assert np.abs(lap-forcing).max()<1e-10
    raw=value-smooth;pixels=np.rint(np.clip(raw,0,255)).astype('uint8')
    def edges(a):
        return {'wrap_x_mean':float(np.abs(a[:,0]-a[:,-1]).mean()),'wrap_y_mean':float(np.abs(a[0]-a[-1]).mean()),
                'interior_x_mean':float(np.abs(np.diff(a,axis=1)).mean()),'interior_y_mean':float(np.abs(np.diff(a,axis=0)).mean())}
    stats={'meanAbsoluteCorrection':float(np.abs(smooth).mean()),'maxAbsoluteCorrection':float(np.abs(smooth).max()),
           'clippedChannelFraction':float(((raw<0)|(raw>255)).mean()),'before':edges(value),'after':edges(pixels.astype(float)),
           'meanRGBChange':(pixels.mean((0,1))-value.mean((0,1))).tolist()}
    return Image.fromarray(pixels),stats

def independent_composition(rgb, profile, layering):
    sys.path.insert(0, str(ROOT/'tools'))
    from craft_normals import craft
    detail,_ = craft(np.asarray(rgb,dtype=float)/255,profile,quantize_height=False)
    h,w = detail.shape
    mask_image = Image.new('L',(w,h)); draw=ImageDraw.Draw(mask_image)
    rw,rh=layering['referenceSize']
    for region in layering['brickRegions']:
        for dy in (-h,0,h):
            for dx in (-w,0,w):
                draw.polygon([(x*w/rw+dx,y*h/rh+dy) for x,y in region['polygon']],fill=255)
    mask=np.asarray(mask_image,dtype=float)/255
    sigma=layering['bevelPixels']*(w*h)**.5/256
    ky=np.fft.fftfreq(h)[:,None]; kx=np.fft.fftfreq(w)[None,:]
    smooth=np.fft.ifft2(np.fft.fft2(mask)*np.exp(-2*np.pi**2*sigma**2*(kx*kx+ky*ky))).real
    base=np.where(mask>.5,layering['brickHeight'],layering['facingHeight']-
       (layering['facingHeight']-layering['chipFloor'])*np.minimum(smooth*2,1))
    final=(base+(detail-.5)*(2*layering['microAmplitude'])).astype('float32')
    early=(base+(detail.astype('float32')-.5)*(2*layering['microAmplitude'])).astype('float32')
    return final,early,mask,sigma

spec = importlib.util.spec_from_file_location('independent_tier_oracles', ROOT / 'tests/hexen2_texture_tiers_test.py')
oracle = importlib.util.module_from_spec(spec); spec.loader.exec_module(oracle)
sys.path[:0] = [str(ROOT / 'tools'), str(ROOT / 'tools/texture_sheets')]
from craft_normals import craft
from finish_official_texture import finish

REPORT = {'schemaVersion': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope': 'Batch006 final three repairs; eight native bindings: seven new physical masters/70newmaps with one same-batch peer alias sharing10references; source/codec/math only', 'materials': [],
 'limits': ['No artistic pass from numeric diagnostics; repeated-tile, intended relief and owner review remain separate.',
            'One retained generation is package/coordinator-bound; no independent image-service invocation audit.',
            'No runtime resource binding, gameplay, mesh displacement or GPU qualification.']}

def main():
    assert (PIL.__version__, np.__version__, features.version('webp')) == ('10.1.0', '1.26.2', '1.3.2'), 'Codec mismatch; use /usr/bin/python3'
    selection = load(args.selection)
    native_selection_path = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-006/native-selection.json'
    native_selection = load(native_selection_path)
    assert len(selection['items']) == 8 and len({i['id'] for i in selection['items']}) == 8
    assert {i['name'] for i in selection['items']} == {'rtex439', 'ttex021', 'rtex488', 'rtex001', 'ttex018', 'rtex040', 'rtex029', 'rtex095'}
    baseline = {i['id']: i for i in native_selection['items']}
    for selected in selection['items']:
        native = baseline[selected['id']]
        assert all(selected[k] == native[k] for k in ('id', 'name', 'edition', 'nativeDimensions', 'original'))
        assert sha(resolve(selected['original']).read_bytes()) == native['originalSha256']
    inventory_path = ROOT / 'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json'
    inventory = load(inventory_path)
    original_proof_path=ROOT/'docs/hexen2/textures/batch-006-public-actual-v1.json'
    assert sha(original_proof_path.read_bytes())=='667442880df61601061d78818bc2b49bec10882a565076303c6532797c8e07bd'
    original_proof=load(original_proof_path);prior={m['name']:m for m in original_proof['materials']}
    prior_inputs={r['file']:r['sha256']for r in original_proof['inputs']}
    assert {i['name']for i in selection['items']if 'registeredMasterPackage'in i}=={'rtex001','rtex095','rtex439'}
    fixed = [original_proof_path,ROOT/'tools/texture_sheets/register_texture_boundary.py',
             ROOT/'tools/texture_sheets/prepare_layered_texture_master.py',ROOT/'tools/texture_sheets/update_level_sheets.py',pathlib.Path(__file__), args.selection, native_selection_path, inventory_path,
             ROOT / 'tests/hexen2_texture_tiers_test.py', ROOT / 'tools/texture_sheets/prepare_texture_master.py',
             ROOT / 'tools/texture_sheets/derive_texture_tiers.py', ROOT / 'tools/texture_sheets/finish_official_texture.py', ROOT / 'tools/craft_normals.py']
    alias_proof_path = ROOT / 'docs/hexen2/textures/batch-006-alias-public-source-proof.json'
    alias_proof = load(alias_proof_path)
    assert alias_proof['archiveInputsStable']==inventory['archives']
    assert sha(alias_proof_path.read_bytes())=='61406896f47d5a067cf93a1b4739853b07b0d551d69acb286cf962c6d8bbf6ab'
    assert alias_proof['verdict'].startswith('PASS') and alias_proof['newGenerations']==0
    alias_id='6ba575c49b64eabe1dbba9e563d06631f3d8344d319b7c89a34056a1a56fba98'
    target_id='8ae609bd5aefc88b4cbeb0ae79338f31f80745c3f09706429bee9da0be256b58'
    selected_by_id={i['id']:i for i in selection['items']}
    target_item=selected_by_id[target_id]
    assert target_item['name']=='rtex029'and target_item['generationCount']==1
    fixed.append(alias_proof_path)
    packages = []
    for item in selection['items']:
        alias = item.get('contentAliasOf')
        revised='registeredMasterPackage'in item
        old=None
        if alias:
            assert item['id']==alias_id and item['name']=='ttex021'and alias['id']==target_id and alias['name']=='rtex029'
            assert alias['original']==target_item['original']
            assert item['generationCount'] == 0
            mp, tp = ROOT / alias['masterPackage'], ROOT / alias['tierReceipt']
            assert mp.resolve()==(args.master_root/'rtex029/master.json').resolve()
            assert tp.resolve()==(args.tier_root/'rtex029/manifest.json').resolve()
            assert sha(mp.read_bytes())==alias['masterPackageSha256']
            assert sha(tp.read_bytes())==alias['tierReceiptSha256']
            assert not (args.master_root / item['name']).exists() and not (args.tier_root / item['name']).exists()
            assert not (args.master_root.parent / 'generated' / (item['name']+'.png')).exists()
        else:
            assert item['generationCount'] == 1
            if revised:
                mp,tp=resolve(item['registeredMasterPackage']),resolve(item['registeredTierReceipt'])
                assert sha(mp.read_bytes())==item['registeredMasterPackageSha256']
                assert sha(tp.read_bytes())==item['registeredTierReceiptSha256']
                old_path=args.master_root/item['name']/'master.json'
                assert sha(old_path.read_bytes())==prior[item['name']]['masterPackage']['sha256']
                old=load(old_path);fixed.append(old_path)
            else:
                mp = args.master_root / item['name'] / 'master.json'
                tp = args.tier_root / item['name'] / 'manifest.json'
        m, t = load(mp), load(tp)
        cp, hp = mp.parent / m['color']['file'], mp.parent / m['height']['file']
        fixed += [mp, tp, cp, hp, resolve(item['original']), *[resolve(row['file']) for row in m['inputs'].values()]]
        fixed += [tp.parent / out['file'] for tier in t['tiers'].values() for out in tier['outputs'].values()]
        if not revised:
            assert sha(mp.read_bytes())==prior[item['name']]['masterPackage']['sha256']
            assert sha(tp.read_bytes())==prior_inputs[str(tp.resolve().relative_to(ROOT))]
        packages.append((item, mp, tp, m, t, cp, hp, revised, old))
    before = {p: sha(p.read_bytes()) for p in set(fixed)}
    git = lambda *a: subprocess.check_output(['git', *a], cwd=ROOT, timeout=15,
        env={**__import__('os').environ, 'GIT_OPTIONAL_LOCKS': '0'})
    staged = sha(git('diff', '--cached', '--binary', '--no-ext-diff'))
    runtime = [ROOT / p for p in ('assets/game/textures/index.json', 'assets/layout.json', 'tools/distribution/manifest.mjs')]
    runtime_before = {p: sha(p.read_bytes()) for p in runtime}

    dirs = {}
    for archive in inventory['archives']:
        p = pathlib.Path(archive['path']); h = hashlib.sha256()
        with p.open('rb') as f:
            for b in iter(lambda: f.read(1024**2), b''): h.update(b)
            f.seek(0); magic, off, n = struct.unpack('<4sII', f.read(12)); assert magic == b'PACK' and n % 64 == 0
            f.seek(off); table = f.read(n)
        assert h.hexdigest() == archive['sha256']; directory = {}
        for at in range(0, n, 64):
            name = table[at:at+56].split(b'\0')[0].decode('ascii').lower()
            directory.setdefault(name, struct.unpack_from('<II', table, at+56))
        dirs[str(p)] = directory
    def member(path, name):
        off, n = dirs[path][name]
        with open(path, 'rb') as f: f.seek(off); b = f.read(n)
        assert len(b) == n
        return b, off
    palette, _ = member('/Users/bri/quaked/Hexen 2/data1/pak0.pak', 'gfx/palette.lmp')
    assert len(palette) == 768
    for item, mp, tp, m, receipt, cp, hp, revised, old in packages:
        name = item['name']; v = next(v for v in inventory['variants'] if v['id'] == item['id'])
        alias = item.get('contentAliasOf')
        assert v['name'] == name and [v['width'], v['height']] == item['nativeDimensions']
        op = resolve(item['original']); original = image(op); nw, nh = original.size
        assert [nw, nh] == item['nativeDimensions'] == m['nativeDimensions']
        assert sha(Image.open(op).convert('RGBA').tobytes()) == v['rgbaSha256']
        profile = 'base' if item['edition'] == 'base' else 'portals-1'
        occurrence = next(p for p in v['provenance'] if p['faces'] > 0 and p['profile'] == profile)
        bsp, off = member(occurrence['source'], occurrence['map'])
        assert off == occurrence['memberOffset'] and sha(bsp) == occurrence['bspSha256']
        tex = struct.unpack_from('<I', bsp, 20)[0]
        at = tex + struct.unpack_from('<i', bsp, tex+4+4*occurrence['slot'])[0]
        assert bsp[at:at+16].split(b'\0')[0].decode('ascii') == name
        assert struct.unpack_from('<II', bsp, at+16) == (nw, nh)
        pos = at + struct.unpack_from('<I', bsp, at+24)[0]; indices = bsp[pos:pos+nw*nh]
        rgba = np.c_[np.frombuffer(palette, dtype='uint8').reshape(256, 3)[np.frombuffer(indices, dtype='uint8')], np.full(nw*nh, 255, dtype='uint8')]
        assert sha(indices) == v['indexedPixelSha256'] and sha(rgba.tobytes()) == v['rgbaSha256'] and sha(palette) == v['paletteSha256']
        if item['id']in(alias_id,target_id):
            four=[]
            texture_bytes=struct.unpack_from('<I',bsp,24)[0]
            for level in range(4):
                local=struct.unpack_from('<I',bsp,at+24+level*4)[0];count=(nw>>level)*(nh>>level)
                assert local>=40 and at+local+count<=tex+texture_bytes
                four.append(sha(bsp[at+local:at+local+count]))
            assert four==alias_proof['fourMipSHA256']
        assert m['generationCount'] == 1 and m['canonicalMasterFactor'] == 8
        if alias:
            assert item['generationCount']==0 and m['name']==alias['name']=='rtex029'and m['edition']==target_item['edition']=='base'
        else:
            assert item['generationCount'] == 1 and m['name'] == name and m['edition'] == item['edition']
        assert m['color']['file'] == 'color.png' and m['height']['file'] == 'height.npy'
        extras={'rtex001':{'layeredAuthoring','layeredPolicy'},'rtex439':{'boundaryRegistration'}}.get(name,set())
        assert set(m['tools']) == {'prepare', 'finish', 'derive', 'craft'}|extras
        for role,path,expected_sha in [('layeredAuthoring',ROOT/'tools/texture_sheets/prepare_layered_texture_master.py','7e39bce85514c3fba95b4f1e05fef7f592ce63d395e247c55dc0e1d5a4d68c4d'),
             ('layeredPolicy',ROOT/'tools/texture_sheets/update_level_sheets.py',None),
             ('boundaryRegistration',ROOT/'tools/texture_sheets/register_texture_boundary.py','3a96c0d1588060e0465b40763d4c9d19371e8113c91a0a89058e1dfb4e9658ee')]:
            if role in extras:
                assert resolve(m['tools'][role]['file']).resolve()==path.resolve()
                assert m['tools'][role]['sha256']==sha(path.read_bytes())
                if expected_sha:assert sha(path.read_bytes())==expected_sha
        for role, path in [('prepare', ROOT / 'tools/texture_sheets/prepare_texture_master.py'),
                           ('finish', ROOT / 'tools/texture_sheets/finish_official_texture.py'),
                           ('derive', ROOT / 'tools/texture_sheets/derive_texture_tiers.py'),
                           ('craft', ROOT / 'tools/craft_normals.py')]:
            assert resolve(m['tools'][role]['file']).resolve() == path.resolve()
            assert m['tools'][role]['sha256'] == sha(path.read_bytes())
        assert (m['environment']['pillow'], m['environment']['numpy'], m['environment']['libwebp']) == ('10.1.0', '1.26.2', '1.3.2')
        for role, row in m['inputs'].items(): assert sha(resolve(row['file']).read_bytes()) == row['sha256'], (name, role)
        if alias:
            assert resolve(m['inputs']['original']['file']).resolve() == (ROOT / alias['original']).resolve()
            assert op.read_bytes() == (ROOT / alias['original']).read_bytes()
            prompt_path = resolve(m['inputs']['prompt']['file'])
            assert prompt_path.resolve()==resolve(target_item['prompt']).resolve()
        else:
            assert resolve(m['inputs']['original']['file']).resolve() == op.resolve()
            assert resolve(m['inputs']['prompt']['file']).resolve() == resolve(item['prompt']).resolve()
            prompt_path = resolve(item['prompt'])
        rawp = resolve(m['inputs']['generated']['file']); raw = image(rawp)
        raw_source = Image.open(rawp)
        assert (raw_source.format, raw_source.mode) == ('PNG', 'RGB')
        expected_raw_name='rtex029'if alias else name
        assert rawp.resolve()==(args.master_root.parent/'generated'/(expected_raw_name+'.png')).resolve()
        assert [raw.width, raw.height] == m['generatedDimensions'] and raw.width >= nw*8 and raw.height >= nh*8
        assert raw.width*nh == raw.height*nw
        canonical = Image.open(cp); height = np.load(hp, allow_pickle=False)
        assert (canonical.format, canonical.mode, canonical.size) == ('PNG', 'RGB', (nw*8, nh*8))
        assert list(canonical.size) == m['masterDimensions'] and height.shape == (nh*8, nw*8) and height.dtype == np.dtype('float32')
        assert np.isfinite(height).all() and height.min() >= 0 and height.max() <= 1 and np.any(height*255 != np.round(height*255))
        assert sha(cp.read_bytes()) == m['color']['sha256'] and sha(hp.read_bytes()) == m['height']['sha256']
        assert m['height']['authoredOnce'] is True and m['height']['quantizedTo8Bit'] is False
        reg = m['registration']; assert reg['factor'] == 8 and reg['method'] == 'photographic'
        axis, points = None, None
        if 'landmarks' in m['inputs']:
            lm = load(resolve(m['inputs']['landmarks']['file'])); axis, points = lm['axis'], lm['points']
            assert reg['verticalLandmarks'] == points and reg['axis'] == axis
        a, b = original, raw
        if axis == 'x': a, b = a.transpose(Image.Transpose.TRANSPOSE), b.transpose(Image.Transpose.TRANSPOSE)
        rebuilt, _ = finish(a, b, factor=8, vertical_landmarks=points, comparison_divisor=2, method='photographic',
                            color_strength=reg['colorStrength'], field_sigma=reg['fieldSigma'])
        if axis == 'x': rebuilt = rebuilt.transpose(Image.Transpose.TRANSPOSE)
        repair=None
        if revised:
            assert {k:v for k,v in m['inputs'].items()if k!='heightLayering'}==old['inputs']
            assert m['height']['profile']==old['height']['profile']
            for role in ('original','generated','prompt'):
                p=resolve(m['inputs'][role]['file'])
                assert sha(p.read_bytes())==prior_inputs[str(p.resolve().relative_to(ROOT))]
        if name=='rtex439':
            revision=m['masterRevision'];assert revision['replacesUnqualifiedPackageSha256']==prior[name]['masterPackage']['sha256']
            assert revision['previousColorSha256']==old['color']['sha256'] and revision['previousHeightSha256']==old['height']['sha256']
            assert revision['generatorOutputUnchanged']is True and revision['notAnotherGeneration']is True
            assert {k:v for k,v in reg.items()if k!='periodicBoundary'}==old['registration']
            old_png=io.BytesIO();rebuilt.save(old_png,'PNG');assert sha(old_png.getvalue())==old['color']['sha256']
            rebuilt,stats=independent_y(rebuilt);meta=reg['periodicBoundary']
            assert meta['axes']==['y']and meta['featureRelocation']is False and meta['perimeterBand']is False
            for key in ('meanAbsoluteCorrection','maxAbsoluteCorrection','clippedChannelFraction'):
                assert abs(meta[key]-stats[key])<1e-10
            for phase in ('before','after'):
                assert all(abs(meta[phase][k]-v)<1e-10 for k,v in stats[phase].items())
            assert np.allclose(meta['meanRGBChange'],stats['meanRGBChange'],atol=1e-10,rtol=0)
            for div in (2,4):
                values=np.asarray(rebuilt,dtype=float);oh,ow=values.shape[:2];d=8*div
                small=values.reshape(oh//d,d,ow//d,d,3).mean((1,3))
                native=np.asarray(original,dtype=float).reshape(nh//div,div,nw//div,div,3).mean((1,3))
                row=meta['distanceChecks'][str(div)]
                assert row['dimensions']==[nw//div,nh//div]and abs(row['RGBMeanAbsoluteError']-float(abs(small-native).mean()))<1e-10
            repair={'policy':'independent same-source Y Poisson replay','metadataExact':True}
        elif name=='rtex095':
            assert 'periodicBoundary'not in reg and 'masterRevision'not in m
            assert reg['colorStrength']==.9 and reg['fieldSigma']==.35
            assert m['tools']==old['tools']
            repair={'policy':'same-source photographic finisher .90/.35','extraGeneration':False}
        elif name=='rtex001':
            assert 'periodicBoundary'not in reg and reg==old['registration']
            assert sha(cp.read_bytes())==old['color']['sha256']
        else:
            assert not revised and 'periodicBoundary'not in reg
        assert rebuilt.tobytes() == canonical.tobytes(), 'Master registration replay differs: ' + name
        rawheight, _ = craft(np.asarray(canonical, dtype=float)/255, m['height']['profile'], quantize_height=False)
        if name=='rtex001':
            meta=m['layeredRelief'];layering_recipe=meta['recipe']
            assert meta['nativeIdentity']==item['id']and layering_recipe['nativeIdentity']==item['id']
            lp=resolve(m['inputs']['heightLayering']['file'])
            assert load(lp)==layering_recipe and sha(lp.read_bytes())==meta['recipeSha256']==m['inputs']['heightLayering']['sha256']
            assert layering_recipe['sourceMasterPackageSha256']==prior[name]['masterPackage']['sha256']
            assert layering_recipe['sourceVerification']['sha256']==sha(original_proof_path.read_bytes())
            assert resolve(layering_recipe['sourceVerification']['file']).resolve()==original_proof_path.resolve()
            assert layering_recipe['originalSha256']==sha(op.read_bytes())
            assert layering_recipe['authoringDiffuseSha256']==sha(cp.read_bytes())
            assert m['masterRevision']['replacesUnqualifiedPackageSha256']==prior[name]['masterPackage']['sha256']
            assert m['masterRevision']['RGBUnchanged']is True and m['masterRevision']['notAnotherGeneration']is True
            baseline=io.BytesIO();np.save(baseline,rawheight.astype('float32'),allow_pickle=False)
            assert sha(baseline.getvalue())==old['height']['sha256']==m['masterRevision']['previousHeightSha256']
            # Independent full-complex Gaussian and explicit polygon raster, no adapter helper.
            rawheight,early,mask,sigma=independent_composition(canonical,m['height']['profile'],layering_recipe['layering'])
            assert meta['bevelSigmaMasterPixels']==sigma==6
            assert np.count_nonzero(rawheight!=early)>0
            assert rawheight[mask>.5].max()<rawheight[mask<=.5].min()
            assert meta['substrateRange']==[float(rawheight[mask>.5].min()),float(rawheight[mask>.5].max())]
            assert meta['facingRange']==[float(rawheight[mask<=.5].min()),float(rawheight[mask<=.5].max())]
            repair={'policy':'independent fullprecision explicit layered planes','fullRecipe':layering_recipe,'sigma':sigma,
                    'draftPrecisionNotUsed':True,'semanticMortarNotImplied':True}
        rawheight = rawheight.astype('float32'); assert np.array_equal(rawheight, height)
        stream = io.BytesIO(); np.save(stream, rawheight, allow_pickle=False); assert stream.getvalue() == hp.read_bytes()
        assert receipt['inputs']['master']['sha256'] == sha(cp.read_bytes()) and receipt['inputs']['heightMaster']['sha256'] == sha(hp.read_bytes())
        assert receipt['inputs']['original']['sha256'] == sha(op.read_bytes()) and receipt['Low']['unchanged'] is True and receipt['defaultTier'] == 'Mid'
        assert receipt['tools']['deriverSha256'] == sha((ROOT / 'tools/texture_sheets/derive_texture_tiers.py').read_bytes())
        assert receipt['tools']['normalMathSha256'] == sha((ROOT / 'tools/craft_normals.py').read_bytes())
        tiers = []
        for tier, factor in [('Mid', 4), ('High', 8)]:
            row = receipt['tiers'][tier]; size = (nw*factor, nh*factor)
            assert row['factor'] == factor and row['dimensions'] == list(size)
            H = oracle.float_box(height, size); N = oracle.cyclic_normals(H, receipt['strength'], receipt['cap'])
            packed = np.round(np.clip(N*.5+.5, 0, 1)*255).astype('uint8')
            payloads = {'diffuse': oracle.q92(oracle.periodic_rgb(canonical, size)), 'height': oracle.q92(Image.fromarray(np.round(H*255).astype('uint8')))}
            payloads.update({role: oracle.q92(Image.fromarray(packed[:, :, c])) for c, role in enumerate(oracle.ROLES[2:])})
            decoded, maps = {}, []
            assert set(row['outputs']) == set(oracle.ROLES)
            for role, expected in payloads.items():
                record = row['outputs'][role]; p = tp.parent / record['file']; actual = p.read_bytes()
                assert actual == expected and record['sha256'] == sha(actual) and record['bytes'] == len(actual)
                oracle.vp8_only(actual)
                assert (record['quality'], record['method'], record['lossless']) == (92, 6, False)
                assert record['sourceMaster'] == ('master' if role == 'diffuse' else 'heightMaster')
                decoded[role] = Image.open(io.BytesIO(actual)).convert('RGB'); assert decoded[role].size == size
                values = np.asarray(decoded[role], dtype=float)
                seams = {'wrapX': float(np.abs(values[:, 0]-values[:, -1]).mean()), 'wrapY': float(np.abs(values[0]-values[-1]).mean()),
                         'interiorX': float(np.abs(np.diff(values, axis=1)).mean()), 'interiorY': float(np.abs(np.diff(values, axis=0)).mean())}
                assert row['edges'][role] == seams
                maps.append({'role': role, **witness(p), 'decodedEdges': seams})
            assert {d['divisor'] for d in row['distanceChecks']} == {2, 4}
            for d in row['distanceChecks']:
                dims = (nw//d['divisor'], nh//d['divisor'])
                error = np.abs(np.asarray(original.resize(dims, Image.Resampling.BOX), dtype=float)-np.asarray(decoded['diffuse'].resize(dims, Image.Resampling.BOX), dtype=float))
                assert d['dimensions'] == list(dims) and d['meanAbsoluteError'] == float(error.mean()) and d['maximum'] == float(error.max())
            compressed_h = np.asarray(decoded['height'], dtype=float)[:, :, 0]/255
            assert row['heightQuantizationCompressionMAE'] == float(np.abs(compressed_h-H).mean())
            encoded_n = np.stack([np.asarray(decoded[r], dtype=float)[:, :, 0] for r in oracle.ROLES[2:]], axis=2)/127.5-1
            encoded_n /= np.maximum(np.linalg.norm(encoded_n, axis=2, keepdims=True), 1e-12)
            from_h = oracle.cyclic_normals(compressed_h, receipt['strength'], receipt['cap'])
            for key, first, second in [('authoredNormalVsDecodedXYZDegrees', N, encoded_n), ('authoredNormalVsDecodedHeightDegrees', N, from_h), ('decodedHeightNormalVsDecodedXYZDegrees', from_h, encoded_n)]:
                angles = np.degrees(np.arccos(np.clip((first*second).sum(axis=2), -1, 1)))
                stats = {'mean': float(angles.mean()), 'p99': float(np.percentile(angles, 99)), 'maximum': float(angles.max())}
                assert all(abs(stats[k]-row[key][k]) < 1e-10 for k in stats), (name, tier, key)
            tiers.append({'tier': tier, 'dimensions': list(size), 'allFiveDirectMasterCodecBytesExact': True, 'distanceChecks': row['distanceChecks'], 'maps': maps})
        REPORT['materials'].append({'name': name, 'edition': item['edition'], 'nativeIdentity': v['id'], 'actualPAKOccurrence': occurrence,
            'masterPackage': witness(mp), 'retainedGeneratedSource': witness(rawp), 'prompt': witness(prompt_path),
            'newGenerationCount': 0 if alias else 1, 'contentAliasOf': alias,
            'canonicalColorReplayExact': True, 'singleFloatHeightReplayExact': True, 'repair': repair, 'tiers': tiers})
    assert all(sha(p.read_bytes()) == digest for p, digest in before.items()), 'Bound source/output changed during verification'
    assert sha(git('diff', '--cached', '--binary', '--no-ext-diff')) == staged, 'Concurrent staged diff changed; reconcile'
    assert all(sha(p.read_bytes()) == digest for p, digest in runtime_before.items()), 'Runtime inputs changed during verification'
    REPORT.update({'inputsStable': True, 'inputs': [witness(p) for p in sorted(set(fixed))], 'runtimeInputs': [witness(p) for p in runtime],
      'foreignStagedDiffSha256': staged, 'foreignStagedDiffUnchanged': True, 'materialCount': len(packages),
      'mapCount': sum(len(t['maps']) for m in REPORT['materials'] for t in m['tiers']),
      'nativeBindings': 8, 'newGenerations': 7, 'newMasterPackages': 7, 'peerSharedMasterBindings': 1, 'previousCatalogMasterReuse': 0,
      'replacementMasterVersions':3,'replacementMapVersions':30,'notExtraActiveAssets':True, 'newMapFiles': 70, 'peerSharedMapReferences': 10, 'previousCatalogMapReuse': 0, 'mapReferences': 80, 'aliasProof': witness(alias_proof_path),
      'codec': {'executable': sys.executable, 'Python': sys.version, 'Pillow': PIL.__version__, 'NumPy': np.__version__, 'WebP': features.version('webp')},
      'verdict': 'PASS actual batch source/codec/math qualification; art and runtime acceptance separate'})
    assert REPORT['mapCount'] == 80
    master_paths={p[1].resolve()for p in packages}
    tier_paths={p[2].resolve()for p in packages}
    map_paths={str(resolve(row['file']).resolve())for m in REPORT['materials']for t in m['tiers']for row in t['maps']}
    assert len(master_paths)==len(tier_paths)==7 and len(map_paths)==70
    REPORT['uniqueReferencedMasterPackages']=7
    REPORT['uniqueReferencedMapFiles']=70
    assert sum(m['newGenerationCount'] for m in REPORT['materials']) == 7
    assert sum(bool(m['contentAliasOf']) for m in REPORT['materials']) == 1

try:
    main()
except Exception as exc:
    REPORT['verdict'] = 'HOLD'; REPORT['error'] = repr(exc)
    raise
finally:
    REPORT['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    args.output.write_text(json.dumps(REPORT, indent=2) + '\n')
    print(json.dumps({'receipt': str(args.output), 'verdict': REPORT['verdict'], 'sha256': sha(args.output.read_bytes())}))
