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
spec = importlib.util.spec_from_file_location('independent_tier_oracles', ROOT / 'tests/hexen2_texture_tiers_test.py')
oracle = importlib.util.module_from_spec(spec); spec.loader.exec_module(oracle)
sys.path[:0] = [str(ROOT / 'tools'), str(ROOT / 'tools/texture_sheets')]
from craft_normals import craft, profile_for
from finish_official_texture import finish

REPORT = {'schemaVersion': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope': 'Batch007 final motif successor:8native/8active masters/80physicalmaps; separate2aliases20existingrefs' , 'materials': [],
 'limits': ['No artistic pass from numeric diagnostics; repeated-tile, intended relief and owner review remain separate.',
            'One retained generation is package/coordinator-bound; no independent image-service invocation audit.',
            'No runtime resource binding, gameplay, mesh displacement or GPU qualification.']}

def main():
    assert (PIL.__version__, np.__version__, features.version('webp')) == ('10.1.0', '1.26.2', '1.3.2'), 'Codec mismatch; use /usr/bin/python3'
    selection = load(args.selection)
    native_selection_path = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-007/native-selection.json'
    native_selection = load(native_selection_path)
    assert len(selection['items']) == 8 and len({i['id'] for i in selection['items']}) == 8
    assert {i['name'] for i in selection['items']} == {'rtex322','rtex121','rtex413','rtex274','ttex005','ttex032','ttex068','ttex079'}
    baseline = {i['id']: i for i in native_selection['items']}
    for selected in selection['items']:
        native = baseline[selected['id']]
        assert all(selected[k] == native[k] for k in ('id', 'name', 'edition', 'nativeDimensions', 'original'))
        assert sha(resolve(selected['original']).read_bytes()) == native['originalSha256']
    inventory_path = ROOT / 'docs/evidence/hexen2-textures-2026-10-19/batch-007-selection/inventory.json'
    inventory = load(inventory_path)
    fixed = [pathlib.Path(__file__), args.selection, native_selection_path, inventory_path,
             ROOT / 'tests/hexen2_texture_tiers_test.py', ROOT / 'tools/texture_sheets/prepare_texture_master.py',
             ROOT / 'tools/texture_sheets/derive_texture_tiers.py', ROOT / 'tools/texture_sheets/finish_official_texture.py', ROOT / 'tools/craft_normals.py']
    source_proof_path=ROOT/'docs/hexen2/textures/batch-007-public-source-proof-v2.json'
    source_proof=load(source_proof_path)
    assert sha(source_proof_path.read_bytes())=='fe7d9ffd177c424d0b834b4e867b7e0d17bfabdc27d5733640ce85e2ac3ff8aa'
    assert source_proof['verdict'].startswith('PASS')and source_proof['nativeCount']==8
    assert source_proof['archiveInputsStable']==inventory['archives']
    assert source_proof['exactPeerCandidates']==source_proof['exactCatalogCandidates']==0
    source_materials={m['id']:m for m in source_proof['materials']}
    assert set(source_materials)==set(baseline)
    assert all(not i.get('contentAliasOf')for i in selection['items'])
    assert {i['name']for i in selection['items']if 'registeredMasterPackage'in i}=={'rtex322'}
    prior_path=ROOT/'docs/hexen2/textures/batch-007-public-actual-v2.json'
    assert sha(prior_path.read_bytes())=='f3721db7aaf26e69aa8a9aa82a7df5578fccf6b7db50d3b65c283fc7dd5e57d9'
    prior_proof=load(prior_path);prior={m['name']:m for m in prior_proof['materials']}
    prior_inputs={r['file']:r['sha256']for r in prior_proof['inputs']}
    prereq={
     'batch-007-motif-public-tests-green-v1.json':'1f723c187ed4013583ce5d9f857aa4045d5941d69895cb4a5e44a0db93b66d46',
     'batch-007-motif-public-code-review-v1.json':'5620b503e65e302f31b0a18b979beb3b75b0ac5d7deea50ebca43212b1fd1d71',
     'batch-007-motif-public-actual-cli-v1.json':'eef1ac8cd6b32c53762637199b061ad6bc138744e2de125de27166dca7471d06'}
    fixed.append(prior_path)
    for name,digest in prereq.items():
        p=ROOT/'docs/hexen2/textures'/name;assert sha(p.read_bytes())==digest and load(p)['verdict'].startswith('PASS');fixed.append(p)
    actual_cli=load(ROOT/'docs/hexen2/textures/batch-007-motif-public-actual-cli-v1.json')
    motif_oracle_path=ROOT/'tests/texture_motif_master_test.py'
    spec=importlib.util.spec_from_file_location('independent_motif_oracle',motif_oracle_path)
    motif_oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(motif_oracle)
    fixed += [motif_oracle_path,ROOT/'tools/texture_sheets/prepare_motif_texture_master.py']
    fixed.append(source_proof_path)
    packages = []
    for item in selection['items']:
        assert item['generationCount']==1
        revised=item['name']=='rtex322';old=None
        if revised:
            mp,tp=resolve(item['registeredMasterPackage']),resolve(item['registeredTierReceipt'])
            assert sha(mp.read_bytes())==item['registeredMasterPackageSha256']
            assert sha(tp.read_bytes())==item['registeredTierReceiptSha256']
            old_path=args.master_root/item['name']/'master.json'
            assert sha(old_path.read_bytes())==prior[item['name']]['masterPackage']['sha256']
            old=load(old_path);fixed.append(old_path)
        else:
            mp=args.master_root/item['name']/'master.json'
            tp=args.tier_root/item['name']/'manifest.json'
            assert sha(mp.read_bytes())==prior[item['name']]['masterPackage']['sha256']
            assert sha(tp.read_bytes())==prior_inputs[str(tp.resolve().relative_to(ROOT))]
        m, t = load(mp), load(tp)
        cp, hp = mp.parent / m['color']['file'], mp.parent / m['height']['file']
        fixed += [mp, tp, cp, hp, resolve(item['original']), *[resolve(row['file']) for row in m['inputs'].values()]]
        fixed += [tp.parent / out['file'] for tier in t['tiers'].values() for out in tier['outputs'].values()]
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
        four=[]
        texture_bytes=struct.unpack_from('<I',bsp,24)[0]
        for level in range(4):
            local=struct.unpack_from('<I',bsp,at+24+level*4)[0];count=(nw>>level)*(nh>>level)
            assert local>=40 and at+local+count<=tex+texture_bytes
            four.append(sha(bsp[at+local:at+local+count]))
        assert four==source_materials[item['id']]['fourMipSHA256']
        assert sha(op.read_bytes())==source_materials[item['id']]['original']['sha256']
        assert 'authoringPolicy'not in m['height']
        expected_inputs={'original','generated','prompt'}|({'nativeMotifs'}if revised else set())
        if 'landmarks'in m['inputs']:expected_inputs.add('landmarks')
        assert set(m['inputs'])==expected_inputs
        assert ('masterRevision'in m)==revised and ('motifRestoration'in m)==revised
        assert m['height']['profile']==json.loads(json.dumps({**profile_for(item['profile']),'strength':item.get('strength',.3),'cap':item.get('cap',.5)}))
        assert m['generationCount']==1 and m['canonicalMasterFactor']==8
        assert item['generationCount']==1 and m['name']==name and m['edition']==item['edition']
        assert m['color']['file'] == 'color.png' and m['height']['file'] == 'height.npy'
        assert set(m['tools']) == {'prepare', 'finish', 'derive', 'craft'}|({'motifAuthoring'}if revised else set())
        if revised:
            tool=ROOT/'tools/texture_sheets/prepare_motif_texture_master.py'
            assert resolve(m['tools']['motifAuthoring']['file']).resolve()==tool.resolve()
            assert m['tools']['motifAuthoring']['sha256']==sha(tool.read_bytes())=='233bd52f30abbc276ba1e5895b44d2a81c3425531f82b10d5d999a48d080b430'
        for role, path in [('prepare', ROOT / 'tools/texture_sheets/prepare_texture_master.py'),
                           ('finish', ROOT / 'tools/texture_sheets/finish_official_texture.py'),
                           ('derive', ROOT / 'tools/texture_sheets/derive_texture_tiers.py'),
                           ('craft', ROOT / 'tools/craft_normals.py')]:
            assert resolve(m['tools'][role]['file']).resolve() == path.resolve()
            assert m['tools'][role]['sha256'] == sha(path.read_bytes())
        assert (m['environment']['pillow'], m['environment']['numpy'], m['environment']['libwebp']) == ('10.1.0', '1.26.2', '1.3.2')
        for role, row in m['inputs'].items(): assert sha(resolve(row['file']).read_bytes()) == row['sha256'], (name, role)
        assert resolve(m['inputs']['original']['file']).resolve()==op.resolve()
        assert resolve(m['inputs']['prompt']['file']).resolve()==resolve(item['prompt']).resolve()
        prompt_path=resolve(item['prompt'])
        assert sha(prompt_path.read_bytes())==item['promptSha256']==m['inputs']['prompt']['sha256']
        rawp = resolve(m['inputs']['generated']['file']); raw = image(rawp)
        raw_source = Image.open(rawp)
        assert (raw_source.format, raw_source.mode) == ('PNG', 'RGB')
        expected_raw_name=name
        assert rawp.resolve()==(args.master_root.parent/'generated'/(expected_raw_name+'.png')).resolve()
        assert sha(rawp.read_bytes())==item['generatedSha256']==m['inputs']['generated']['sha256']
        assert [raw.width, raw.height]==item['generatedDimensions']
        assert [raw.width, raw.height] == m['generatedDimensions'] and raw.width >= nw*8 and raw.height >= nh*8
        assert raw.width*nh == raw.height*nw
        canonical = Image.open(cp); height = np.load(hp, allow_pickle=False)
        assert (canonical.format, canonical.mode, canonical.size) == ('PNG', 'RGB', (nw*8, nh*8))
        assert list(canonical.size) == m['masterDimensions'] and height.shape == (nh*8, nw*8) and height.dtype == np.dtype('float32')
        assert np.isfinite(height).all() and height.min() >= 0 and height.max() <= 1 and np.any(height*255 != np.round(height*255))
        assert sha(cp.read_bytes()) == m['color']['sha256'] and sha(hp.read_bytes()) == m['height']['sha256']
        assert m['height']['authoredOnce'] is True and m['height']['quantizedTo8Bit'] is False
        reg = m['registration']; assert reg['factor'] == 8 and reg['method'] == 'photographic'
        assert 'periodicBoundary'not in reg and reg['edgeAnchor']is False
        assert reg['colorStrength']==item['colorStrength']and reg['fieldSigma']==item['fieldSigma']
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
            assert {k:v for k,v in m['inputs'].items()if k!='nativeMotifs'}==old['inputs']
            assert m['registration']==old['registration']and m['height']['profile']==old['height']['profile']
            baseline=io.BytesIO();rebuilt.save(baseline,'PNG')
            assert sha(baseline.getvalue())==old['color']['sha256']==m['masterRevision']['previousColorSha256']
            revision=m['masterRevision']
            assert revision['replacesUnqualifiedPackageSha256']==prior[name]['masterPackage']['sha256']
            assert revision['heightUnchanged']is True and revision['generatorOutputUnchanged']is True and revision['notAnotherGeneration']is True
            recipe_path=resolve(m['inputs']['nativeMotifs']['file']);meta=m['motifRestoration'];recipe=load(recipe_path)
            assert recipe==meta['recipe']and sha(recipe_path.read_bytes())==meta['recipeSha256']==m['inputs']['nativeMotifs']['sha256']
            assert recipe['sourceMasterPackageSha256']==prior[name]['masterPackage']['sha256']
            assert recipe['sourceVerification']['sha256']==sha(prior_path.read_bytes())
            assert resolve(recipe['sourceVerification']['file']).resolve()==prior_path.resolve()
            assert recipe['nativeIdentity']==item['id']==meta['nativeIdentity']
            assert recipe['authoringDiffuseSha256']==sha(baseline.getvalue())
            assert recipe['motifs']=={'referenceSize':[64,64],'regions':[[5.5,28.5,14.5,34.5],[49.5,28.5,58.5,34.5]],'featherNativePixels':.5,'fieldSigmaNativePixels':.35,'strength':.95,'heightPolicy':'preserve-initial-float32'}
            # Height comes from baseline physical geometry, never restored pigment.
            rawheight,_=craft(np.asarray(rebuilt,dtype=float)/255,m['height']['profile'],quantize_height=False)
            expected,alpha=motif_oracle.independent_restore(original,rebuilt,recipe['motifs'])
            np.testing.assert_array_equal(np.asarray(canonical),expected)
            np.testing.assert_array_equal(expected[alpha==0],np.asarray(rebuilt)[alpha==0])
            assert (alpha>0).sum()==6912 and (alpha==1).sum()==5120
            assert m['height']['sha256']==old['height']['sha256']==revision['previousHeightSha256']
            assert sha(cp.read_bytes())==actual_cli['tempResultSHA256']['color.png']
            assert sha(hp.read_bytes())==actual_cli['tempResultSHA256']['height.npy']
            for ref in meta['policyReferences']:
                p=resolve(ref['file']);assert sha(p.read_bytes())==ref['sha256'];fixed.append(p)
            repair={'policy':'independent direct circular Gaussian/analytic cubic local motif correction',
              'outsideAuthoringRGBExact':True,'heightNPYBytesUnchanged':True,'supportPixels':6912,'fullWeightPixels':5120,
              'fullRecipe':recipe,'notAnotherGeneration':True}
        else:
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
                old_map=next(r for r in next(t for t in prior[name]['tiers']if t['tier']==tier)['maps']if r['role']==role)
                if not revised or role!='diffuse':assert sha(actual)==old_map['sha256'],'Unexpected changed prior map'
                else:assert sha(actual)!=old_map['sha256'],'Motif diffuse unchanged'
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
            'newGenerationCount': 1, 'contentAliasOf': None,
            'canonicalColorReplayExact': True, 'singleFloatHeightReplayExact': True, 'repair':repair, 'tiers': tiers})
    assert all(sha(p.read_bytes()) == digest for p, digest in before.items()), 'Bound source/output changed during verification'
    assert sha(git('diff', '--cached', '--binary', '--no-ext-diff')) == staged, 'Concurrent staged diff changed; reconcile'
    assert all(sha(p.read_bytes()) == digest for p, digest in runtime_before.items()), 'Runtime inputs changed during verification'
    REPORT.update({'inputsStable': True, 'inputs': [witness(p) for p in sorted(set(fixed))], 'runtimeInputs': [witness(p) for p in runtime],
      'foreignStagedDiffSha256': staged, 'foreignStagedDiffUnchanged': True, 'materialCount': len(packages),
      'mapCount': sum(len(t['maps']) for m in REPORT['materials'] for t in m['tiers']),
      'nativeBindings': 8, 'newGenerations': 8, 'newMasterPackages': 8, 'peerSharedMasterBindings': 0, 'previousCatalogMasterReuse': 0,
      'replacementMasterVersions':1,'replacementMapVersions':10,'changedMapContents':2,'preserved322HeightXYZMapFiles':8,'unchangedOtherMaterialMapFiles':70, 'newMapFiles': 80, 'peerSharedMapReferences': 0, 'previousCatalogMapReuse': 0, 'mapReferences': 80, 'sourceProof': witness(source_proof_path),
      'codec': {'executable': sys.executable, 'Python': sys.version, 'Pillow': PIL.__version__, 'NumPy': np.__version__, 'WebP': features.version('webp')},
      'verdict': 'PASS actual batch source/codec/math qualification; art and runtime acceptance separate'})
    assert REPORT['mapCount'] == 80
    master_paths={p[1].resolve()for p in packages}
    tier_paths={p[2].resolve()for p in packages}
    map_paths={str(resolve(row['file']).resolve())for m in REPORT['materials']for t in m['tiers']for row in t['maps']}
    assert len(master_paths)==len(tier_paths)==8 and len(map_paths)==80
    REPORT['uniqueReferencedMasterPackages']=8
    REPORT['uniqueReferencedMapFiles']=80
    assert sum(m['newGenerationCount'] for m in REPORT['materials']) == 8
    assert sum(bool(m['contentAliasOf']) for m in REPORT['materials']) == 0
    alias_path=ROOT/'docs/hexen2/textures/batch-007-alias-public-bindings-v1.json'
    assert sha(alias_path.read_bytes())=='79e96bf7b53bee440e6c31ab04f8ee434c8617112c4e798ba011cfe36a437fd5'
    alias_proof=load(alias_path);assert alias_proof['verdict'].startswith('PASS')
    # Direct custody rows intentionally do not recurse into the historical
    # catalog37 snapshot inside the native source proof.
    for row in alias_proof['inputs']:
        p=resolve(row['file']);assert sha(p.read_bytes())==row['sha256'],row['file']
    REPORT['supplementalAliasProof']=witness(alias_path)
    REPORT['supplementalAliasNativeDescriptors']=2;REPORT['supplementalExistingMapReferences']=20
    REPORT['supplementalNewGenerations']=REPORT['supplementalNewMapFiles']=0


try:
    main()
except Exception as exc:
    REPORT['verdict'] = 'HOLD'; REPORT['error'] = repr(exc)
    raise
finally:
    REPORT['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    args.output.write_text(json.dumps(REPORT, indent=2) + '\n')
    print(json.dumps({'receipt': str(args.output), 'verdict': REPORT['verdict'], 'sha256': sha(args.output.read_bytes())}))
