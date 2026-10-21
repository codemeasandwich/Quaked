"""Replay the public review CLI in owned temporary scratch and bind manifests.

Final master/map/preview files are read only. Temporary duplicate JPEGs are
removed when verification ends. No artistic or browser-runtime acceptance.
"""
import datetime, hashlib, html.parser, json, os, pathlib, subprocess, sys, tempfile
import PIL, numpy
from PIL import Image, features

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs/hexen2/textures/batch-008-mortar-public-preview.json'
assert not OUT.exists(), 'Retain prior evidence'
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text())
def witness(p):
    b = p.read_bytes()
    try: name = str(p.resolve().relative_to(ROOT))
    except ValueError: name = str(p.resolve())
    return {'file': name, 'sha256': sha(b), 'bytes': len(b)}
class Images(html.parser.HTMLParser):
    def __init__(self): super().__init__(); self.sources = []
    def handle_starttag(self, tag, attributes):
        if tag == 'img': self.sources.append(dict(attributes)['src'])

report = {'schemaVersion': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'verifier': witness(pathlib.Path(__file__)),
          'replayEnvironment': {'executable': sys.executable, 'Python': sys.version, 'Pillow': PIL.__version__,
                                'NumPy': numpy.__version__, 'JPEG': features.version('jpg'), 'WebP': features.version('webp')},
          'limits': ['Public review CLI replay binds decoded content panels, not independent artistic acceptance.',
                     'Scope is one batch008 native binding: one current layered physical master/10maps; no aliases; fullcampaign remains incomplete.',
                     'Static HTML/image files checked; no browser layout, GPU, engine or gameplay qualification.',
                     'Retained single generator source/declared count is not an independent provider-side invocation audit.',
                     'JPEG full bytes are compared and exactness is recorded per file. Any decoded variance must be confined to the documented empty bottom-right padding, outside every content/label panel; full difference bounds are recorded.']}
try:
    batch, selection = load(BASE / 'batch-mortar-candidate.json'), load(BASE / 'selection-mortar-candidate.json')
    assert batch['pathsBase'] == 'repository' and batch['defaultTier'] == 'Mid'
    assert batch['tierFactors'] == {'Mid': 4, 'High': 8}
    assert (batch['quality'], batch['method']) == (92, 6)
    assert len(batch['items']) == 1 and {i['name'] for i in batch['items']} == {i['name'] for i in selection['items']}
    proof_path = ROOT / 'docs/hexen2/textures/batch-008-mortar-public-actual.json'
    actual = load(proof_path); assert actual['verdict'].startswith('PASS') and actual['mapCount'] == 10
    bound_actual = {m['name']: m for m in actual['materials']}
    selected = {i['name']: i for i in selection['items']}
    source_proof_path=ROOT/'docs/hexen2/textures/batch-008-public-source-proof.json'
    source_proof=load(source_proof_path)
    assert sha(source_proof_path.read_bytes())=='eac871ece0eb18fa0472fc7e72604fc154e5b810593fcb4b123c3781ff68f27f'
    assert source_proof['verdict'].startswith('PASS')and source_proof['nativeCount']==8
    assert actual['uniqueReferencedMapFiles']==10 and actual['uniqueReferencedMasterPackages']==1
    assert all(not i.get('contentAliasOf')for i in selection['items'])
    fixed=[BASE/'batch-mortar-candidate.json',BASE/'selection-mortar-candidate.json',proof_path,source_proof_path,
           ROOT/'tools/texture_sheets/build_texture_batch_review.py',pathlib.Path(__file__)]
    models = []
    for item in batch['items']:
        name = item['name']; select = selected[name]; proof = bound_actual[name]
        alias=None
        assert item['edition'] == select['edition'] == proof['edition']
        assert item['nativeIdentity']['id'] == select['id'] == proof['nativeIdentity']
        assert item['original'] == select['original']
        for key in ('generated','prompt'):assert item[key]==select[key]
        assert item['generationCount']==select['generationCount']==1
        raw=ROOT/item['generated'];provider_output=pathlib.Path(select['builtInOutput'])
        assert sha(raw.read_bytes())==select['generatedSha256']==sha(provider_output.read_bytes())
        assert sha((ROOT/item['prompt']).read_bytes())==select['promptSha256']
        fixed += [raw,provider_output,ROOT/item['prompt'],ROOT/item['original']]
        for role, sha_key in [('masterPackage', 'masterPackageSha256'), ('tierReceipt', 'tierReceiptSha256')]:
            p = ROOT / item[role]; assert sha(p.read_bytes()) == item[sha_key]; fixed.append(p)
        assert item['masterPackageSha256'] == proof['masterPackage']['sha256']
        receipt = load(ROOT / item['tierReceipt'])
        for tier, factor in [('Mid', 4), ('High', 8)]:
            row, source = item['tiers'][tier], receipt['tiers'][tier]
            assert row['factor'] == factor and row['dimensions'] == source['dimensions']
            assert set(row['files']) == set(source['outputs'])
            for role, path in row['files'].items():
                p = ROOT / path
                assert p.resolve() == ((ROOT / item['tierReceipt']).parent / source['outputs'][role]['file']).resolve()
                assert sha(p.read_bytes()) == source['outputs'][role]['sha256']; fixed.append(p)
        models.append({'name': name, 'retainedGeneratorOutputMatches': witness(provider_output) if provider_output else None,
                       'retainedMasterRawSource': witness(raw), 'contentAliasOf': alias, 'newGenerationCount': 0 if alias else 1,
                       'masterPackage': witness(ROOT / item['masterPackage']),
                       'tierReceipt': witness(ROOT / item['tierReceipt'])})
    assert sum(m['newGenerationCount'] for m in models) == 1
    assert sum(bool(m['contentAliasOf']) for m in models) == 0
    review = BASE / 'review-mortar-candidate'; html_path = review / 'index.html'
    parsed = Images(); parsed.feed(html_path.read_text()); assert len(parsed.sources) == 4 and len(set(parsed.sources)) == 4
    expected_names = {f"{i['name']}-{tier}-{kind}.jpg" for i in batch['items'] for tier in ('mid', 'high') for kind in ('review', 'relief')}
    assert set(parsed.sources) == expected_names
    previews = [review / source for source in parsed.sources]
    assert all(p.is_file() and p.resolve().parent == review.resolve() for p in previews)
    fixed += [html_path, *previews]
    before = {p: sha(p.read_bytes()) for p in set(fixed)}
    report['inputsBefore'] = [witness(p) for p in sorted(set(fixed))]
    with tempfile.TemporaryDirectory(prefix='hexen-public-preview-replay-') as temporary:
        output = pathlib.Path(temporary) / 'review'
        command = [sys.executable, str(ROOT / 'tools/texture_sheets/build_texture_batch_review.py'),
                   '--batch', str(BASE / 'batch-mortar-candidate.json'), '--paths-root', str(ROOT), '--output', str(output)]
        run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=60, check=False)
        report['reviewCLIProcess'] = {'command': command, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr}
        assert run.returncode == 0, run.stderr
        assert {p.name for p in output.iterdir()} == expected_names | {'index.html'}
        assert html_path.read_bytes() == (output / 'index.html').read_bytes()
        panels = []
        for item in batch['items']:
            aspect = item['nativeIdentity']['width'] / item['nativeIdentity']['height']
            scale = min(512/item['nativeIdentity']['width'], 512/item['nativeIdentity']['height'])
            width = round(item['nativeIdentity']['width']*scale)
            overview_height = round(item['nativeIdentity']['height']*scale)
            for tier in ('mid', 'high'):
                for kind in ('review', 'relief'):
                    name = f"{item['name']}-{tier}-{kind}.jpg"
                    with Image.open(review / name) as im: delivered = numpy.asarray(im.convert('RGB'))
                    with Image.open(output / name) as im: replayed = numpy.asarray(im.convert('RGB'))
                    assert delivered.shape == replayed.shape
                    if kind == 'review':
                        boxes = {'title': (0, 0, 1400, 32), 'native': (12, 32, 12+width, 32+overview_height),
                                 'diffuse': (540, 32, 540+width, 32+overview_height), 'oneToOneDetail': (1068, 32, 1324, 288),
                                 'repeatedTiles': (12, 570, 524, 1082)}
                        comparison_y = [570, 570 + max(235, 25 + (item['nativeIdentity']['height']//2)*3 + 18)]
                        for i, divisor in enumerate((2, 4)):
                            w = item['nativeIdentity']['width']//divisor*3
                            h = item['nativeIdentity']['height']//divisor*3
                            y = comparison_y[i]+25
                            boxes[f'distance{divisor}Label'] = (540, comparison_y[i], 1400, y)
                            boxes[f'distance{divisor}Native'] = (540, y, 540+w, y+h)
                            boxes[f'distance{divisor}Enhanced'] = (550+w, y, 550+2*w, y+h)
                    else:
                        boxes = {'topLabels': (0, 0, 1200, 30), 'bottomLabels': (0, 550, 1200, 580)}
                        for label, x, y in [('height', 10, 30), ('normals', 610, 30), ('lightA', 10, 580), ('lightB', 610, 580)]:
                            boxes[label] = (x, y, x+width, y+overview_height)
                    for first, a in boxes.items():
                        for second, b in boxes.items():
                            if first >= second: continue
                            overlap = max(a[0], b[0]) < min(a[2], b[2]) and max(a[1], b[1]) < min(a[3], b[3])
                            assert not overlap, (name, first, second, 'Content/label panels overlap')
                    occupied = numpy.zeros(delivered.shape[:2], dtype=bool)
                    records = []
                    for label, (x0, y0, x1, y1) in boxes.items():
                        a, b = delivered[y0:y1, x0:x1], replayed[y0:y1, x0:x1]
                        assert numpy.array_equal(a, b), (name, label, 'Actual content/label differs')
                        occupied[y0:y1, x0:x1] = True
                        records.append({'panel': label, 'rectangle': [x0, y0, x1, y1], 'decodedRGBSHA256': sha(a.tobytes()), 'exactReplay': True})
                    diff = delivered.astype('int16') - replayed.astype('int16')
                    changed = numpy.any(diff != 0, axis=2)
                    assert not numpy.any(changed & occupied), name
                    # Prior32-file diagnostic observed at most33 columns and13
                    # rows in the empty final JPEG scan padding. Bound to whole
                    # 8x8 blocks40x16, and never exclude content/label pixels.
                    height, canvas_width = changed.shape
                    allowed = numpy.zeros_like(changed)
                    allowed[height-16:, canvas_width-40:] = True
                    assert not numpy.any(allowed & occupied), (name, 'Padding rectangle overlaps content')
                    assert not numpy.any(changed & ~allowed), (name, 'Variance outside known padding')
                    ys, xs = numpy.where(changed)
                    panels.append({'file': str((review / name).relative_to(ROOT)), 'binaryEqual': (review / name).read_bytes() == (output / name).read_bytes(),
                        'contentPanels': records, 'allPanelRectanglesDisjoint': True,
                        'changedPixels': int(changed.sum()), 'maximumChannelDifference': int(numpy.abs(diff).max()),
                        'changedRectangle': None if not changed.any() else [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)],
                        'allowedEmptyPaddingRectangle': [canvas_width-40, height-16, canvas_width, height],
                        'allVarianceOutsideContentAndWithinKnownPadding': True})
        replay = {'command': command, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr,
                  'all4DecodedContentAndLabelPanelsExact': True, 'indexHTMLBytesExact': True, 'files': panels}
        temporary_path = str(output.parent)
    assert not pathlib.Path(temporary_path).exists()
    assert all(sha(p.read_bytes()) == digest for p, digest in before.items()), 'Bound inputs changed'
    report['all4JPEGBytesExact']=all(p['binaryEqual'] for p in panels)
    report.update({'verdict': 'PASS source bindings and all4 decoded preview content/label panels; any empty JPEG-tail padding variance bounded',
                   'nativeBindings': 1, 'declaredRetainedGenerations': 1, 'newMasterPackages': 1, 'newMapFiles': 10,
                   'peerSharedMasterBindings': 0, 'peerSharedMapReferences': 0, 'previousCatalogMasterReuse':0, 'previousCatalogMapReuse':0, 'mapReferences': 10, 'uniqueReferencedMapFiles':10, 'uniqueReferencedMasterPackages':1, 'sourceProof': witness(source_proof_path),
                   'sourceBindings': models, 'actualMapProof': witness(proof_path), 'HTMLImageReferences': parsed.sources,
                   'reviewCLIReplay': replay, 'ownedTemporaryDuplicatesRemoved': True,
 'inputsStable': True, 'inputs': [witness(p) for p in sorted(set(fixed))]})
    if report['all4JPEGBytesExact']: report['verdict']='PASS source bindings and all4 full JPEG bytes/content/labels plus HTML exact replay'
except Exception as exc:
    report['verdict'] = 'HOLD'; report['error'] = repr(exc); raise
finally:
    report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    OUT.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'receipt': str(OUT), 'verdict': report['verdict'], 'sha256': sha(OUT.read_bytes())}))
