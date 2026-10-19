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
from craft_normals import craft
from finish_official_texture import finish

REPORT = {'schemaVersion': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope': 'Actual batch public source/master/tier files; offline source/codec/math verification', 'materials': [],
 'limits': ['No artistic pass from numeric diagnostics; repeated-tile, intended relief and owner review remain separate.',
            'One retained generation is package/coordinator-bound; no independent image-service invocation audit.',
            'No runtime resource binding, gameplay, mesh displacement or GPU qualification.']}

def main():
    assert (PIL.__version__, np.__version__, features.version('webp')) == ('10.1.0', '1.26.2', '1.3.2'), 'Codec mismatch; use /usr/bin/python3'
    selection = load(args.selection)
    assert len(selection['items']) == 8 and len({i['id'] for i in selection['items']}) == 8
    inventory_path = ROOT / 'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json'
    inventory = load(inventory_path)
    fixed = [pathlib.Path(__file__), args.selection, inventory_path,
             ROOT / 'tests/hexen2_texture_tiers_test.py', ROOT / 'tools/texture_sheets/prepare_texture_master.py',
             ROOT / 'tools/texture_sheets/derive_texture_tiers.py', ROOT / 'tools/texture_sheets/finish_official_texture.py', ROOT / 'tools/craft_normals.py']
    packages = []
    for item in selection['items']:
        mp = args.master_root / item['name'] / 'master.json'
        tp = args.tier_root / item['name'] / 'manifest.json'
        m, t = load(mp), load(tp)
        cp, hp = mp.parent / m['color']['file'], mp.parent / m['height']['file']
        fixed += [mp, tp, cp, hp, *[resolve(row['file']) for row in m['inputs'].values()]]
        fixed += [tp.parent / out['file'] for tier in t['tiers'].values() for out in tier['outputs'].values()]
        packages.append((item, mp, tp, m, t, cp, hp))
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
    for item, mp, tp, m, receipt, cp, hp in packages:
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
        assert m['generationCount'] == item['generationCount'] == 1 and m['canonicalMasterFactor'] == 8
        assert m['name'] == name and m['edition'] == item['edition']
        assert m['color']['file'] == 'color.png' and m['height']['file'] == 'height.npy'
        assert set(m['tools']) == {'prepare', 'finish', 'derive', 'craft'}
        for role, path in [('prepare', ROOT / 'tools/texture_sheets/prepare_texture_master.py'),
                           ('finish', ROOT / 'tools/texture_sheets/finish_official_texture.py'),
                           ('derive', ROOT / 'tools/texture_sheets/derive_texture_tiers.py'),
                           ('craft', ROOT / 'tools/craft_normals.py')]:
            assert resolve(m['tools'][role]['file']).resolve() == path.resolve()
            assert m['tools'][role]['sha256'] == sha(path.read_bytes())
        assert (m['environment']['pillow'], m['environment']['numpy'], m['environment']['libwebp']) == ('10.1.0', '1.26.2', '1.3.2')
        for role, row in m['inputs'].items(): assert sha(resolve(row['file']).read_bytes()) == row['sha256'], (name, role)
        assert resolve(m['inputs']['original']['file']).resolve() == op.resolve()
        assert resolve(m['inputs']['prompt']['file']).resolve() == resolve(item['prompt']).resolve()
        rawp = resolve(m['inputs']['generated']['file']); raw = image(rawp)
        raw_source = Image.open(rawp)
        assert (raw_source.format, raw_source.mode) == ('PNG', 'RGB')
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
        if 'landmarks' in m['inputs']:
            lm = load(resolve(m['inputs']['landmarks']['file'])); axis, points = lm['axis'], lm['points']
            assert reg['verticalLandmarks'] == points and reg['axis'] == axis
        a, b = original, raw
        if axis == 'x': a, b = a.transpose(Image.Transpose.TRANSPOSE), b.transpose(Image.Transpose.TRANSPOSE)
        rebuilt, _ = finish(a, b, factor=8, vertical_landmarks=points, comparison_divisor=2, method='photographic',
                            color_strength=reg['colorStrength'], field_sigma=reg['fieldSigma'])
        if axis == 'x': rebuilt = rebuilt.transpose(Image.Transpose.TRANSPOSE)
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
            'masterPackage': witness(mp), 'retainedGeneratedSource': witness(rawp), 'prompt': witness(resolve(item['prompt'])),
            'canonicalColorReplayExact': True, 'singleFloatHeightReplayExact': True, 'tiers': tiers})
    assert all(sha(p.read_bytes()) == digest for p, digest in before.items()), 'Bound source/output changed during verification'
    assert sha(git('diff', '--cached', '--binary', '--no-ext-diff')) == staged, 'Concurrent staged diff changed; reconcile'
    assert all(sha(p.read_bytes()) == digest for p, digest in runtime_before.items()), 'Runtime inputs changed during verification'
    REPORT.update({'inputsStable': True, 'inputs': [witness(p) for p in sorted(set(fixed))], 'runtimeInputs': [witness(p) for p in runtime],
      'foreignStagedDiffSha256': staged, 'foreignStagedDiffUnchanged': True, 'materialCount': len(packages),
      'mapCount': sum(len(t['maps']) for m in REPORT['materials'] for t in m['tiers']),
      'codec': {'executable': sys.executable, 'Python': sys.version, 'Pillow': PIL.__version__, 'NumPy': np.__version__, 'WebP': features.version('webp')},
      'verdict': 'PASS actual batch source/codec/math qualification; art and runtime acceptance separate'})
    assert REPORT['mapCount'] == 80

try:
    main()
except Exception as exc:
    REPORT['verdict'] = 'HOLD'; REPORT['error'] = repr(exc)
    raise
finally:
    REPORT['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    args.output.write_text(json.dumps(REPORT, indent=2) + '\n')
    print(json.dumps({'receipt': str(args.output), 'verdict': REPORT['verdict'], 'sha256': sha(args.output.read_bytes())}))
