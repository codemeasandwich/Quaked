"""Read-only actual batch verification, with independent tier math/codec oracles.

Run with /usr/bin/python3, matching the retained authoring codec. A successful
receipt proves source binding and deterministic map derivation, not art/runtime
acceptance or an independent service-side generation invocation count.
"""
import argparse, datetime, hashlib, importlib.util, io, json, pathlib, struct, subprocess, sys
import PIL, numpy as np
from PIL import Image, features

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
def package_asset(mp, m, role):
    value = m[role]['file']; p = pathlib.Path(value)
    return p if p.is_absolute() else ROOT/p if value.startswith('assets/') else mp.parent/p
def package_inputs(m):
    if all(isinstance(v, str) for v in m['inputs'].values()):
        paths = list(m['inputs'])
        native = [p for p in paths if '/originals/' in p]
        generated = [p for p in paths if 'generated' in pathlib.Path(p).name and p.endswith('.png')]
        prompts = [p for p in paths if 'prompt' in pathlib.Path(p).name]
        assert len(native) == len(generated) == len(prompts) == 1
        return {role: {'file': str(ROOT/p), 'sha256': m['inputs'][p]}
                for role, p in [('original', native[0]), ('generated', generated[0]), ('prompt', prompts[0])]}, True
    return m['inputs'], False
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
spec = importlib.util.spec_from_file_location('independent_tier_oracles', ROOT / 'tests/hexen2_texture_tiers_test.py')
oracle = importlib.util.module_from_spec(spec); spec.loader.exec_module(oracle)
sys.path[:0] = [str(ROOT / 'tools'), str(ROOT / 'tools/texture_sheets')]
from craft_normals import craft
from finish_official_texture import finish

REPORT = {'schemaVersion': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope': 'Batch005 final explicit registered043/051 replacements; five new mastercontents/50active maps plus threealiases/30existing; no extra generations', 'materials': [],
 'limits': ['No artistic pass from numeric diagnostics; repeated-tile, intended relief and owner review remain separate.',
            'One retained generation is package/coordinator-bound; no independent image-service invocation audit.',
            'No runtime resource binding, gameplay, mesh displacement or GPU qualification.']}

def main():
    assert (PIL.__version__, np.__version__, features.version('webp')) == ('10.1.0', '1.26.2', '1.3.2'), 'Codec mismatch; use /usr/bin/python3'
    selection = load(args.selection)
    native_selection_path = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-005/native-selection.json'
    native_selection = load(native_selection_path)
    assert len(selection['items']) == 8 and len({i['id'] for i in selection['items']}) == 8
    assert {i['name'] for i in selection['items']} == {'rtex044', 'rtex030', 'ttex022', 'rtex073', 'ttex048', 'rtex043', 'rtex003', 'ttex051'}
    baseline = {i['id']: i for i in native_selection['items']}
    for selected in selection['items']:
        native = baseline[selected['id']]
        assert all(selected[k] == native[k] for k in ('id', 'name', 'edition', 'nativeDimensions', 'original'))
        assert sha(resolve(selected['original']).read_bytes()) == native['originalSha256']
    inventory_path = ROOT / 'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json'
    inventory = load(inventory_path)
    original_proof_path=ROOT/'docs/hexen2/textures/batch-005-public-actual-v1.json'
    assert sha(original_proof_path.read_bytes())=='dc142c7fbf07fc4da6426d20c2bdb3d171e29f3e6a5f59a70ad7b95be6c5c027'
    original_proof=load(original_proof_path);prior={r['name']:r for r in original_proof['materials']}
    prior_inputs={r['file']:r['sha256']for r in original_proof['inputs']}
    assert {i['name']for i in selection['items']if 'registeredMasterPackage'in i}=={'rtex043','ttex051'}
    fixed = [pathlib.Path(__file__), args.selection, native_selection_path, inventory_path,
             original_proof_path,ROOT/'tools/texture_sheets/register_texture_boundary.py',
             ROOT / 'tests/hexen2_texture_tiers_test.py', ROOT / 'tools/texture_sheets/prepare_texture_master.py',
             ROOT / 'tools/texture_sheets/derive_texture_tiers.py', ROOT / 'tools/texture_sheets/finish_official_texture.py', ROOT / 'tools/craft_normals.py']
    alias_proof_path = ROOT / 'docs/hexen2/textures/batch-005-alias-public-source-proof.json'
    alias_proof = load(alias_proof_path)
    assert sha(alias_proof_path.read_bytes()) == '76fd3643d49da2cc3680919d6686f17a71f5325477dd56f44f5cb36f73e2bc20'
    assert alias_proof['verdict'].startswith('PASS') and alias_proof['newGenerations'] == 0
    alias_candidates = {c['nativeId']: c for c in alias_proof['candidates']}
    assert len(alias_candidates) == 3
    fixed.append(alias_proof_path)
    packages = []
    for item in selection['items']:
        alias = item.get('contentAliasOf')
        registered='registeredMasterPackage'in item
        previous_recipe=None
        if alias:
            alias_candidate = alias_candidates[item['id']]
            assert alias['id'] == alias_candidate['targetId']
            assert item['aliasProofSha256'] == sha(alias_proof_path.read_bytes())
            assert item['generationCount'] == 0
            mp, tp = ROOT / alias['masterPackage'], ROOT / alias['tierReceipt']
            assert sha(mp.read_bytes()) == alias['masterPackageSha256'] == alias_candidate['existingMasterPackage']['sha256']
            assert sha(tp.read_bytes()) == alias['tierReceiptSha256'] == alias_candidate['existingTierReceipt']['sha256']
            assert not (args.master_root / item['name']).exists() and not (args.tier_root / item['name']).exists()
            assert not (args.master_root.parent / 'generated' / (item['name']+'.png')).exists()
        else:
            assert item['generationCount'] == 1
            if registered:
                mp,tp=ROOT/item['registeredMasterPackage'],ROOT/item['registeredTierReceipt']
                assert sha(mp.read_bytes())==item['registeredMasterPackageSha256']
                assert sha(tp.read_bytes())==item['registeredTierReceiptSha256']
                old_path=args.master_root/item['name']/'master.json'
                assert sha(old_path.read_bytes())==prior[item['name']]['masterPackage']['sha256']
                previous_recipe=load(old_path);fixed.append(old_path)
            else:
                mp = args.master_root / item['name'] / 'master.json'
                tp = args.tier_root / item['name'] / 'manifest.json'
        m, t = load(mp), load(tp)
        inputs, legacy = package_inputs(m)
        cp, hp = package_asset(mp,m,'color'), package_asset(mp,m,'height')
        fixed += [mp, tp, cp, hp, resolve(item['original']), *[resolve(row['file']) for row in inputs.values()]]
        fixed += [tp.parent / out['file'] for tier in t['tiers'].values() for out in tier['outputs'].values()]
        if not registered:
            assert sha(mp.read_bytes())==prior[item['name']]['masterPackage']['sha256']
            assert sha(tp.read_bytes())==prior_inputs[str(tp.resolve().relative_to(ROOT))]
        packages.append((item, mp, tp, m, t, cp, hp, inputs, legacy, registered, previous_recipe))
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
    for item, mp, tp, m, receipt, cp, hp, inputs, legacy, registered, previous_recipe in packages:
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
        assert m['generationCount'] == 1 and m['canonicalMasterFactor'] == 8
        if alias:
            target = next(v for v in inventory['variants'] if v['id'] == alias['id'])
            target_edition = 'base' if any(p['profile']=='base' for p in target['provenance']) else 'portals'
            assert item['generationCount'] == 0 and m['name'] == alias['name'] and m['edition'] == target_edition
        else:
            assert item['generationCount'] == 1 and m['name'] == name and m['edition'] == item['edition']
        assert cp.name == 'color.png' and hp.name == 'height.npy' and cp.parent.resolve()==hp.parent.resolve()==mp.parent.resolve()
        if legacy:
            assert alias and m['name'] in ('ttex016','rtex041')
            for path, digest in m['tools'].items(): assert sha(resolve(path).read_bytes()) == digest
            assert 'tools/craft_normals.py' in m['tools'] and 'tools/texture_sheets/finish_official_texture.py' in m['tools']
        else:
            expected={'prepare','finish','derive','craft'}|({'boundaryRegistration'}if registered else set())
            assert set(m['tools']) == expected
            for role, path in [('prepare', ROOT / 'tools/texture_sheets/prepare_texture_master.py'),
                               ('finish', ROOT / 'tools/texture_sheets/finish_official_texture.py'),
                               ('derive', ROOT / 'tools/texture_sheets/derive_texture_tiers.py'),
                               ('craft', ROOT / 'tools/craft_normals.py')]:
                assert resolve(m['tools'][role]['file']).resolve() == path.resolve()
                assert m['tools'][role]['sha256'] == sha(path.read_bytes())
            if registered:
                boundary=ROOT/'tools/texture_sheets/register_texture_boundary.py'
                assert resolve(m['tools']['boundaryRegistration']['file']).resolve()==boundary.resolve()
                assert m['tools']['boundaryRegistration']['sha256']==sha(boundary.read_bytes())=='3a96c0d1588060e0465b40763d4c9d19371e8113c91a0a89058e1dfb4e9658ee'
            assert (m['environment']['pillow'], m['environment']['numpy'], m['environment']['libwebp']) == ('10.1.0', '1.26.2', '1.3.2')
        for role, row in inputs.items(): assert sha(resolve(row['file']).read_bytes()) == row['sha256'], (name, role)
        if alias:
            assert resolve(inputs['original']['file']).resolve() == (ROOT / alias['original']).resolve()
            assert op.read_bytes() == (ROOT / alias['original']).read_bytes()
            prompt_path = resolve(inputs['prompt']['file'])
        else:
            assert resolve(inputs['original']['file']).resolve() == op.resolve()
            assert resolve(inputs['prompt']['file']).resolve() == resolve(item['prompt']).resolve()
            prompt_path = resolve(item['prompt'])
        rawp = resolve(inputs['generated']['file']); raw = image(rawp)
        raw_source = Image.open(rawp)
        assert (raw_source.format, raw_source.mode) == ('PNG', 'RGB')
        if not alias:
            assert rawp.resolve() == (args.master_root.parent / 'generated' / (name + '.png')).resolve()
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
        if 'landmarks' in inputs:
            lm = load(resolve(inputs['landmarks']['file'])); axis, points = lm['axis'], lm['points']
            assert reg['verticalLandmarks'] == points and reg['axis'] == axis
        a, b = original, raw
        if axis == 'x': a, b = a.transpose(Image.Transpose.TRANSPOSE), b.transpose(Image.Transpose.TRANSPOSE)
        rebuilt, _ = finish(a, b, factor=8, vertical_landmarks=points, comparison_divisor=2, method='photographic',
                            color_strength=reg['colorStrength'], field_sigma=reg['fieldSigma'])
        if axis == 'x': rebuilt = rebuilt.transpose(Image.Transpose.TRANSPOSE)
        if registered:
            revision=m['masterRevision'];old=previous_recipe
            assert revision['replacesUnqualifiedPackageSha256']==prior[name]['masterPackage']['sha256']
            assert revision['previousColorSha256']==old['color']['sha256']
            assert revision['previousHeightSha256']==old['height']['sha256']
            assert revision['generatorOutputUnchanged']is True and revision['notAnotherGeneration']is True
            assert m['inputs']==old['inputs']and m['height']['profile']==old['height']['profile']
            assert {k:v for k,v in reg.items()if k!='periodicBoundary'}==old['registration']
            assert {k:v for k,v in m['tools'].items()if k!='boundaryRegistration'}==old['tools']
            old_png=io.BytesIO();rebuilt.save(old_png,'PNG')
            assert sha(old_png.getvalue())==revision['previousColorSha256'],'Precorrection RGB replay/hash differs'
            rebuilt,stats=independent_y(rebuilt);boundary_meta=reg['periodicBoundary']
            assert boundary_meta['axes']==['y']and boundary_meta['featureRelocation']is False and boundary_meta['perimeterBand']is False
            for key in('meanAbsoluteCorrection','maxAbsoluteCorrection','clippedChannelFraction'):
                assert abs(boundary_meta[key]-stats[key])<1e-10,(name,key)
            for phase in('before','after'):
                assert all(abs(boundary_meta[phase][key]-value)<1e-10 for key,value in stats[phase].items())
            assert np.allclose(boundary_meta['meanRGBChange'],stats['meanRGBChange'],rtol=0,atol=1e-10)
            for div in(2,4):
                values=np.asarray(rebuilt,dtype=float);oh,ow=values.shape[:2];d=8*div
                small=values.reshape(oh//d,d,ow//d,d,3).mean((1,3))
                native=np.asarray(original,dtype=float).reshape(nh//div,div,nw//div,div,3).mean((1,3))
                meta=boundary_meta['distanceChecks'][str(div)]
                assert meta['dimensions']==[nw//div,nh//div]and abs(meta['RGBMeanAbsoluteError']-float(np.abs(small-native).mean()))<1e-10
        else:
            assert 'periodicBoundary'not in reg
        assert rebuilt.tobytes() == canonical.tobytes(), 'Master registration replay differs: ' + name
        rawheight, _ = craft(np.asarray(canonical, dtype=float)/255, m['height']['profile'], quantize_height=False)
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
            'retainedLegacyPackageSchema': legacy,
            'sameSourceYRegistered': registered,
            'canonicalColorReplayExact': True, 'singleFloatHeightReplayExact': True, 'tiers': tiers})
    assert all(sha(p.read_bytes()) == digest for p, digest in before.items()), 'Bound source/output changed during verification'
    assert sha(git('diff', '--cached', '--binary', '--no-ext-diff')) == staged, 'Concurrent staged diff changed; reconcile'
    assert all(sha(p.read_bytes()) == digest for p, digest in runtime_before.items()), 'Runtime inputs changed during verification'
    REPORT.update({'inputsStable': True, 'inputs': [witness(p) for p in sorted(set(fixed))], 'runtimeInputs': [witness(p) for p in runtime],
      'foreignStagedDiffSha256': staged, 'foreignStagedDiffUnchanged': True, 'materialCount': len(packages),
      'mapCount': sum(len(t['maps']) for m in REPORT['materials'] for t in m['tiers']),
      'nativeBindings': 8, 'newGenerations': 5, 'newMasterPackages': 5, 'reusedMasterPackages': 3,
      'newMapFiles': 50, 'reusedMapFiles': 30, 'mapReferences': 80, 'aliasProof': witness(alias_proof_path),
      'registeredBindings':2,'replacementMapVersions':20,'unqualifiedRGBHeightTierBinariesNotRead':True,
      'codec': {'executable': sys.executable, 'Python': sys.version, 'Pillow': PIL.__version__, 'NumPy': np.__version__, 'WebP': features.version('webp')},
      'verdict': 'PASS actual batch source/codec/math qualification; art and runtime acceptance separate'})
    assert REPORT['mapCount'] == 80
    assert sum(m['newGenerationCount'] for m in REPORT['materials']) == 5
    assert sum(bool(m['contentAliasOf']) for m in REPORT['materials']) == 3
    assert sum(m['sameSourceYRegistered']for m in REPORT['materials'])==2

try:
    main()
except Exception as exc:
    REPORT['verdict'] = 'HOLD'; REPORT['error'] = repr(exc)
    raise
finally:
    REPORT['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    args.output.write_text(json.dumps(REPORT, indent=2) + '\n')
    print(json.dumps({'receipt': str(args.output), 'verdict': REPORT['verdict'], 'sha256': sha(args.output.read_bytes())}))
