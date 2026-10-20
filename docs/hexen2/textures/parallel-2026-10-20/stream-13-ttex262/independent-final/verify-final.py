"""Fresh ttex262 same-RGB layered scalar, direct tier and public preview proof."""
import ast
import datetime
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[6]
SCRIPT_DIR = Path(__file__).resolve().parent
# Exact frozen author handoff bindings are filled only after author freeze.
EXPECTED_HANDOFF_SHA = 'be6a94653716eb5bf820235ad67c9f55a2ebc0cfeda27f967893dfc66645f9af'
EXPECTED_BATCH_SHA = 'f72119ae26fc9bc0830df7884261d9b261a220b0fa55e8aaabacd5935bc55a34'
EXPECTED_FROZEN_COUNT = 99
DOC = SCRIPT_DIR/'verified-v1'
S = SCRIPT_DIR.parent
B = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-13-ttex262'
watched = {}
sha = lambda value: hashlib.sha256(value).hexdigest()


def read(value):
    value = Path(value)
    value = (value if value.is_absolute() else ROOT/value).resolve()
    data = value.read_bytes()
    assert value not in watched or watched[value] == data, 'Changed input '+str(value)
    watched[value] = data
    return data


def load(value):
    return json.loads(read(value))


def w(value):
    value = Path(value)
    value = (value if value.is_absolute() else ROOT/value).resolve()
    data = read(value)
    return dict(file=str(value.relative_to(ROOT)) if ROOT in value.parents else str(value), sha256=sha(data), bytes=len(data))


def image(value):
    return Image.open(io.BytesIO(read(value))).convert('RGB')


def save(name, value):
    out = DOC/name
    assert not out.exists()
    value.save(out, 'PNG')
    return w(out)


def write(name, value):
    with (DOC/name).open('x') as file:
        file.write(json.dumps(value, indent=2)+'\n')
    return w(DOC/name)


def functions(file, names, context):
    module = ast.parse(read(file))
    nodes = [node for node in module.body if isinstance(node, ast.FunctionDef) and node.name in names]
    assert {node.name for node in nodes} == set(names)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(file), 'exec'), context)


def archive_sha(file):
    digest = hashlib.sha256()
    with open(file, 'rb') as source:
        for chunk in iter(lambda: source.read(1024*1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    DOC.mkdir(exist_ok=False)
    report = dict(schemaVersion=1, startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), scope='Fresh independent ttex262 frozen source/semantic scalar/direct10map/publicCLI proof; final ART separate', verdict='HOLD')
    temp = None
    try:
        handoff = load(S/'handoff.json')
        assert sha(read(S/'handoff.json')) == EXPECTED_HANDOFF_SHA
        assert len(handoff['frozenCandidateInputs']) == EXPECTED_FROZEN_COUNT
        for file, digest in handoff['frozenCandidateInputs'].items():
            assert sha(read(file)) == digest
        batch = load(B/'batch.json');item, = batch['items'];journal, = load(B/'selection.json')['items']
        mp, tp = ROOT/item['masterPackage'], ROOT/item['tierReceipt']
        m, tiers = load(mp), load(tp)
        assert sha(read(B/'batch.json')) == EXPECTED_BATCH_SHA
        assert sha(read(mp)) == item['masterPackageSha256'] == '7922b881e43844d27453869b2afb3203ac3b60ebaec08135ca19a949251baca7'
        assert sha(read(tp)) == item['tierReceiptSha256'] == '3b4f58bb788f960dd427931f9ef29551ab62c2aa9550d84133a77b227fba9047'
        identity = item['nativeIdentity']['id']
        assert identity == journal['id'] == handoff['nativeID'] == '48459128c48ad2c273711c7b77e2267f27d1706dba9f84b9eb3a0af4f71f6436'
        assert m['generationCount'] == item['generationCount'] == journal['generationCount'] == 1 and journal['generationState'] == 'generated-retained'
        assert set(m['inputs']) == {'original', 'generated', 'prompt', 'heightLayering'}
        for group in ('inputs', 'tools'):
            for row in m[group].values():
                assert sha(read(row['file'])) == row['sha256']
        for role in ('original', 'generated', 'prompt'):
            assert m['inputs'][role]['sha256'] == item[role+'Sha256'] == journal[role+'Sha256']
        assert read(item['generated']) == read(journal['builtInOutput'])
        recipe_file = m['inputs']['heightLayering']['file'];recipe = load(recipe_file)
        baseline = load(recipe['sourceMasterPackage'])
        assert sha(read(recipe_file)) == m['layeredRelief']['recipeSha256'] and recipe == m['layeredRelief']['recipe']
        assert sha(read(recipe['sourceMasterPackage'])) == recipe['sourceMasterPackageSha256'] == '24f93599262df5f711f046ab9690e958ca5959d7eb3a5ab3785e499e966f999a'
        source_proof = load(recipe['sourceVerification']['file'])
        assert sha(read(recipe['sourceVerification']['file'])) == recipe['sourceVerification']['sha256']
        row, = [row for row in source_proof['materials'] if row['nativeIdentity'] == identity]
        assert source_proof['verdict'].startswith('PASS') and row['masterPackage']['sha256'] == recipe['sourceMasterPackageSha256']
        assert row['masterPackage']['file'] == recipe['sourceMasterPackage'] and row['name'] == 'ttex262' and row['edition'] == 'portals'
        assert load(S/'initial-relief-hold.json')['verdict'].startswith('HOLD')
        original, raw = image(item['original']), image(item['generated'])
        assert original.size == (64, 64) and raw.size == (1254, 1254)
        # Freshly executed independent native/source verifier, separate from author.
        fresh_path = S/'independent-source-master/source-master-proof-final-v1.json'
        fresh = load(fresh_path)
        assert sha(read(fresh_path)) == 'e383b84d098ea039e1d29e2492660c093506825b39c7706eef918aa087a438a9'
        assert fresh['verdict'].startswith('PASS') and fresh['inputsStable']
        assert fresh['materials'][0]['masterPackage']['sha256'] == recipe['sourceMasterPackageSha256']
        for row in fresh['inputs']:
            assert sha(read(row['file'])) == row['sha256']
        archive_before = fresh['archiveInputsStable']
        assert all(archive_sha(file) == digest for file,digest in archive_before.items())
        occurrences = fresh['nativePhysicalOccurrences']
        assert len(occurrences) == 8 and fresh['nativeUniqueContentSlotCount'] == 4

        # Independent photographic source registration, no producer import.
        donor = np.asarray(raw.resize((512, 512), Image.Resampling.LANCZOS), float)
        delta = np.asarray(original, float).reshape(32, 2, 32, 2, 3).mean((1, 3))-donor.reshape(32, 16, 32, 16, 3).mean((1, 3))
        freq = np.fft.fftfreq(32)[:, None]**2+np.fft.fftfreq(32)[None, :]**2
        field = np.fft.ifft2(np.fft.fft2(delta, axes=(0, 1))*np.exp(-2*np.pi**2*.75**2*freq)[:, :, None], axes=(0, 1)).real
        channels = [np.asarray(Image.fromarray(np.tile(field[:, :, c], (3, 3)).astype('float32'), 'F').resize((1536, 1536), Image.Resampling.BICUBIC))[512:1024, 512:1024] for c in range(3)]
        rgb = np.rint(np.clip(donor+np.stack(channels, axis=2)*.65, 0, 255)).astype('uint8')
        out = io.BytesIO();Image.fromarray(rgb).save(out, 'PNG')
        assert out.getvalue() == read(mp.parent/'color.png') == read(ROOT/recipe['sourceMasterPackage'].rsplit('/', 1)[0]/'color.png')
        oracle = {'np': np, 'math': math}
        functions(ROOT/'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py', {'blur', 'unit', 'extreme', 'smooth', 'craft64'}, oracle)
        detail = oracle['craft64'](rgb, baseline['height']['profile'])
        out = io.BytesIO();np.save(out, detail.astype('float32'), allow_pickle=False)
        assert sha(out.getvalue()) == baseline['height']['sha256']
        # Independent recipe composition using Pillow's documented inclusive
        # polygon raster primitive, then separate full-precision FFT/base math.
        # Raster primitive is shared; no author/producer composition imported.
        layer = recipe['layering'];mask_image = Image.new('L',(512,512));draw = ImageDraw.Draw(mask_image)
        assert layer['referenceSize'] == [64,64] and len(layer['brickRegions']) == 6
        for region in layer['brickRegions']:
            points = np.asarray(region['polygon'],dtype=float)*8
            assert np.array_equal(points,np.rint(points))
            for dy in (-512,0,512):
                for dx in (-512,0,512):
                    draw.polygon([(float(x+dx),float(y+dy)) for x,y in points],fill=255)
        mask = np.asarray(mask_image,dtype=float)/255
        sigma = layer['bevelPixels']*2
        bevel = oracle['blur'](mask, sigma)
        facing = layer['facingHeight']-(layer['facingHeight']-layer['chipFloor'])*np.minimum(bevel*2, 1)
        scalar = (np.where(mask > .5, layer['brickHeight'], facing)+(detail-.5)*(2*layer['microAmplitude'])).astype('float32')
        out = io.BytesIO();np.save(out, scalar, allow_pickle=False)
        assert out.getvalue() == read(mp.parent/'height.npy') and sha(out.getvalue()) == m['height']['sha256']
        assert np.isfinite(scalar).all() and scalar[mask > .5].max() < scalar[mask <= .5].min()
        assert np.unique(scalar).size == m['height']['uniqueSamples']
        y, x = np.mgrid[:512, :512]/512
        domain = np.s_[32:480, 32:480];design = np.stack([x[domain].ravel(), y[domain].ravel(), np.ones(x[domain].size)], axis=1)
        slope = np.linalg.lstsq(design, scalar[domain].ravel(), rcond=None)[0]
        old_slope = np.linalg.lstsq(design, detail[domain].ravel(), rcond=None)[0]
        tier_oracle = {'np': np, 'Image': Image, 'io': io}
        functions(ROOT/'tests/hexen2_texture_tiers_test.py', {'q92', 'periodic_rgb', 'float_box', 'cyclic_normals', 'vp8_only'}, tier_oracle)
        mat = {'name': 'ttex262', 'edition': 'portals', 'nativeIdentity': identity, 'masterPackage': w(mp), 'tierReceipt': w(tp), 'color': w(mp.parent/'color.png'), 'height': w(mp.parent/'height.npy'), 'retainedRaw': w(item['generated']), 'exactPrompt': w(item['prompt']), 'RGBUnchanged': True, 'fullFloatLayeredNPYExact': True, 'tiers': []}
        points = [('A',100,90,'upper left stone'),('B',355,90,'upper right stone'),('C',190,380,'lower stone'),('S1',365,370,'black surface stain'),('S2',205,210,'black surface stain'),('H',130,248,'horizontal contact neighborhood'),('V',229,110,'upper vertical contact neighborhood'),('L',0,380,'inferred lower X contact neighborhood'),('T',350,0,'Y contact neighborhood')]
        evidence, semantic = [], {}
        for name, factor in [('Mid', 4), ('High', 8)]:
            size = (64*factor, 64*factor);recorded = tiers['tiers'][name]
            h = tier_oracle['float_box'](scalar, size);normal = tier_oracle['cyclic_normals'](h, tiers['strength'], tiers['cap'])
            packed = np.rint(np.clip(normal*.5+.5, 0, 1)*255).astype('uint8')
            raw_maps = {'diffuse': tier_oracle['periodic_rgb'](Image.fromarray(rgb), size), 'height': Image.fromarray(np.rint(h*255).astype('uint8'))}
            raw_maps.update({role: Image.fromarray(packed[:, :, c]) for c, role in enumerate(('normalX', 'normalY', 'normalZ'))})
            decoded, maps = {}, []
            for role, im in raw_maps.items():
                row = recorded['outputs'][role];file = tp.parent/row['file'];data = read(file)
                assert data == tier_oracle['q92'](im) and sha(data) == row['sha256']
                assert (row['quality'], row['method'], row['lossless']) == (92, 6, False)
                tier_oracle['vp8_only'](data);decoded[role] = image(file);assert decoded[role].size == size
                assert str(file.relative_to(ROOT)) == item['tiers'][name]['files'][role]
                maps.append({'role': role, **w(file)})
            rgb_t = np.asarray(decoded['diffuse']);height_t = np.asarray(decoded['height'], float)[:, :, 0]/255
            mask_t = tier_oracle['float_box'](mask, size);samples = []
            for label, px, py, cls in points:
                cx, cy = int(px*factor/8), int(py*factor/8);radius = 2 if label in ('L', 'T') else max(1, round(3*factor/8))
                yy = (np.arange(cy-radius, cy+radius+1) % size[1])[:, None];xx = (np.arange(cx-radius, cx+radius+1) % size[0])[None, :]
                values = height_t[yy, xx];expected = h[yy, xx];mv = mask_t[yy, xx]
                samples.append({'label': label, 'sourceClass': cls, 'tierPixel': [cx, cy], 'radius': radius, 'decodedCenter': float(height_t[cy, cx]), 'decodedMean': float(values.mean()), 'decodedMedian': float(np.median(values)), 'decodedRange': [float(values.min()), float(values.max())], 'uncompressedMean': float(expected.mean()), 'uncompressedMaskFraction': float(mv.mean()), 'notPureSample': bool(label in ('H','V','L','T') and np.any(mv < 1))})
            semantic[name] = samples
            vec = np.stack([np.asarray(decoded[role], float)[:, :, 0] for role in ('normalX', 'normalY', 'normalZ')], axis=2)/127.5-1;vec /= np.maximum(np.linalg.norm(vec, axis=2, keepdims=True), 1e-12)
            n = size[0];panel = Image.new('RGB', (n*2, n*2));panel.paste(decoded['height'], (0, 0));panel.paste(Image.fromarray(np.rint(np.clip((vec*.5+.5)*255, 0, 255)).astype('uint8')), (n, 0))
            textured = Image.new('RGB', (n*2, n))
            for i, direction in enumerate(((.6, .3, .75), (-.6, -.3, .75))):
                light = np.asarray(direction);light /= np.linalg.norm(light);gain = .35+.65*np.maximum(0, np.einsum('ijk,k->ij', vec, light))
                panel.paste(Image.fromarray(np.rint(gain*180).astype('uint8')).convert('RGB'), (i*n, n));textured.paste(Image.fromarray(np.rint(np.clip(rgb_t*gain[:, :, None], 0, 255)).astype('uint8')), (i*n, 0))
            prefix = name.lower();span = n//4
            evidence += [save(prefix+'-height-XYZ-neutral.png', panel), save(prefix+'-textured-opposed.png', textured), save(prefix+'-repeat.png', Image.fromarray(np.tile(rgb_t, (2, 2, 1)))), save(prefix+'-X-full.png', Image.fromarray(np.concatenate([rgb_t[:, -span:], rgb_t[:, :span]], axis=1))), save(prefix+'-Y-full.png', Image.fromarray(np.concatenate([rgb_t[-span:], rgb_t[:span]], axis=0))), save(prefix+'-corner.png', Image.fromarray(np.roll(np.roll(rgb_t, span, axis=0), span, axis=1)[:span*2, :span*2]))]
            distances = []
            for divisor in (2, 4):
                dims = (64//divisor, 64//divisor);a = original.resize(dims, Image.Resampling.BOX);b = decoded['diffuse'].resize(dims, Image.Resampling.BOX)
                error = np.abs(np.asarray(a, float)-np.asarray(b, float));row = dict(divisor=divisor, dimensions=list(dims), meanAbsoluteError=float(error.mean()), maximum=float(error.max()));assert row in recorded['distanceChecks'];distances.append(row)
                contact = Image.new('RGB', (dims[0]*2, dims[1]));contact.paste(a, (0, 0));contact.paste(b, (dims[0], 0));evidence.append(save(prefix+'-BOX'+str(dims[0])+'.png', contact))
            mat['tiers'].append(dict(tier=name, dimensions=list(size), maps=maps, allFiveQ92Method6DirectBytesExact=True, distanceChecks=distances))
        commands, preview_rows = [], []
        with tempfile.TemporaryDirectory(prefix='quaked-ttex262-final-', dir='/private/tmp') as temporary:
            temp = Path(temporary)
            def run(args):
                argv = ['/usr/bin/python3', *map(str, args)];r = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, timeout=120);commands.append(dict(command=argv, exitCode=r.returncode, stdout=r.stdout, stderr=r.stderr));assert r.returncode == 0, r.stderr
            run([ROOT/'tools/texture_sheets/prepare_texture_master.py', '--original', ROOT/item['original'], '--generated', ROOT/item['generated'], '--prompt', ROOT/item['prompt'], '--name', 'ttex262', '--edition', 'portals', '--profile', 'stone', '--color-strength', '.65', '--field-sigma', '.75', '--output', temp/'initial'])
            for file in ('color.png', 'height.npy', 'master.json'):assert (temp/'initial'/file).read_bytes() == read((ROOT/recipe['sourceMasterPackage']).parent/file)
            run([ROOT/'tools/texture_sheets/prepare_layered_texture_master.py', '--recipe', recipe_file, '--output', temp/'layered'])
            for file in ('color.png', 'height.npy', 'master.json'):assert (temp/'layered'/file).read_bytes() == read(mp.parent/file)
            run([ROOT/'tools/texture_sheets/derive_texture_tiers.py', '--original', ROOT/item['original'], '--master', mp.parent/'color.png', '--height-master', mp.parent/'height.npy', '--output', temp/'tiers'])
            for row in tiers['tiers'].values():
                for output in row['outputs'].values():assert (temp/'tiers'/output['file']).read_bytes() == read(tp.parent/output['file'])
            assert (temp/'tiers/manifest.json').read_bytes() == read(tp)
            run([ROOT/'tools/texture_sheets/build_texture_batch_review.py', '--batch', B/'batch.json', '--paths-root', ROOT, '--output', temp/'review'])
            assert (temp/'review/index.html').read_bytes() == read(B/'review/index.html')
            for name in ('mid-review', 'mid-relief', 'high-review', 'high-relief'):
                file = B/'review'/('ttex262-'+name+'.jpg');replayed = temp/'review'/file.name;a = np.asarray(image(file));b = np.asarray(Image.open(replayed).convert('RGB'));assert a.shape == b.shape
                if name.endswith('review'):
                    boxes = {'title': [0,0,1400,32], 'native': [12,32,524,544], 'diffuse': [540,32,1052,544], 'detail': [1068,32,1324,288], 'repeat': [12,570,524,1082], 'half-label': [540,570,1400,595], 'half-native': [540,595,636,691], 'half-enhanced': [646,595,742,691], 'quarter-label': [540,805,1400,830], 'quarter-native': [540,830,588,878], 'quarter-enhanced': [598,830,646,878]}
                else:
                    n = 256 if name.startswith('mid') else 512;boxes = {'top-labels':[0,0,1200,30], 'bottom-labels':[0,550,1200,580], 'height':[10,30,10+n,30+n], 'XYZ':[610,30,610+n,30+n], 'light-A':[10,580,10+n,580+n], 'light-B':[610,580,610+n,580+n]}
                occupied = np.zeros(a.shape[:2], dtype=bool);panels = []
                for label, box in boxes.items():
                    x0,y0,x1,y1 = box;assert not occupied[y0:y1,x0:x1].any();assert np.array_equal(a[y0:y1,x0:x1], b[y0:y1,x0:x1]);occupied[y0:y1,x0:x1] = True;panels.append(dict(panel=label, rectangle=box, decodedRGBSHA256=sha(a[y0:y1,x0:x1].tobytes()), exactReplay=True))
                changed = np.any(a != b, axis=2);padding = np.zeros_like(changed);padding[-16:,-40:] = True;assert not np.any(padding & occupied) and not np.any(changed & ~padding)
                preview_rows.append({**w(file), 'fullJPEGBytesExact': read(file) == replayed.read_bytes(), 'changedPixels': int(changed.sum()), 'panels': panels, 'allChangesOnlyProvenUnusedTail': True})
        assert not temp.exists()
        assert all(file.read_bytes() == data for file, data in watched.items()) and all(archive_sha(file) == digest for file, digest in archive_before.items())
        preview = write('preview-v1.json', dict(schemaVersion=1, verdict='PASS actual review CLI HTML and decoded content/label provenance; full JPEG equality recorded per file', descriptor=w(B/'batch.json'), masterPackage=w(mp), tierReceipt=w(tp), producer=w(ROOT/'tools/texture_sheets/build_texture_batch_review.py'), HTML=w(B/'review/index.html'), HTMLBytesExact=True, all4JPEGBytesExact=all(row['fullJPEGBytesExact'] for row in preview_rows), files=preview_rows, publicCLI=commands[-1], ownedReplayRemoved=True, browserClaim='No live browser rendering/interaction observed or claimed'))
        report.update(verdict='PASS independent fresh native/source/guarded-layered full-float/direct10map and actual CLI proof; final decoded ART separate', materials=[mat], handoff=w(S/'handoff.json'), frozenInputCount=EXPECTED_FROZEN_COUNT, frozenInputsStable=True, nativeOccurrences=occurrences, nativePhysicalFaces=sum(row['faces'] for row in occurrences), recipe=w(recipe_file), sourceVerification=w(recipe['sourceVerification']['file']), independentLayering={'maskSHA256':sha(mask.tobytes()), 'maskFraction':float(mask.mean()), 'sigmaMasterPixels':sigma, 'fullFloatBeforeOneCast':True, 'heightBytesExact':True, 'initialScalarSlope':old_slope.tolist(), 'currentScalarSlope':slope.tolist(), 'contactPurityDisclosed':True, 'decodedPhysicalSamples':semantic}, publicCLIReplay=commands, allPublicMasterMapManifestBytesExact=True, preview=preview, diagnosticEvidence=evidence, inputsStable=True, archiveInputsStable=archive_before, cleanup=dict(ownedReplay=str(temp), removed=True), verifier=w(__file__), newGenerations=0, nativeBindings=1, candidateMasters=1, candidateMaps=10, limits='Independent qualification of this frozen offline candidate only; browser/runtime/GPU/owner/Git/CI/release acceptance separate. Historical scalar HOLD retained. LowerX contact inference and mixed contact neighborhoods are disclosed; shared Pillow raster primitive is not an independent scan conversion proof.')
        report['inputs'] = [w(file) for file in sorted(watched)]
    except Exception as error:
        report.update(verdict='HOLD technical verification failure', error=repr(error), cleanup=dict(ownedReplay=str(temp) if temp else None, removed=temp is None or not temp.exists()))
        raise
    finally:
        report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat();write('actual-v1.json', report);print(json.dumps(dict(file=str((DOC/'actual-v1.json').relative_to(ROOT)),sha256=sha((DOC/'actual-v1.json').read_bytes()),verdict=report['verdict'])))


if __name__ == '__main__':
    main()
