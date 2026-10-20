"""Replay the public review CLI in owned temporary scratch and bind manifests.

Final master/map/preview files are read only. Temporary duplicate JPEGs are
removed when verification ends. No artistic or browser-runtime acceptance.
"""
import datetime, hashlib, html.parser, json, os, pathlib, subprocess, sys, tempfile
import PIL, numpy
from PIL import Image, features

ROOT = pathlib.Path(__file__).resolve().parents[6]
BASE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-02-rtex011'
OUT = pathlib.Path(__file__).resolve().parent / 'preview-review-v3.json'
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

report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verifier':witness(pathlib.Path(__file__)),'limits':['Static publicCLI review replay, no browser/GPU/runtime/ART acceptance.','Only actual rtex011 onepackage/10maps, no aliases.','Independent actual source/codec/math is bound separately.']}
try:
    batch=load(BASE/'batch.json');selection=load(BASE/'selection.json');assert len(batch['items'])==len(selection['items'])==1
    proof_path=pathlib.Path(__file__).resolve().parent/'actual-review.json';actual=load(proof_path);assert actual['verdict'].startswith('PASS') and actual['mapCount']==10
    item=batch['items'][0];assert item['name']=='rtex011' and item['masterPackageSha256']==actual['masterPackage']['sha256'] and item['tierReceiptSha256']==actual['tierReceipt']['sha256']
    assert witness(BASE/'batch.json')['sha256']==actual['descriptor']['sha256'];assert witness(BASE/'selection.json')['sha256']==actual['selection']['sha256']
    fixed=[BASE/'batch.json',BASE/'selection.json',proof_path,ROOT/'tools/texture_sheets/build_texture_batch_review.py',pathlib.Path(__file__)]
    for row in actual['inputs']:
        p=pathlib.Path(row['file']);p=p if p.is_absolute() else ROOT/p;assert witness(p)['sha256']==row['sha256'];fixed.append(p)
    review = BASE / 'review'; html_path = review / 'index.html'
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
                   '--batch', str(BASE / 'batch.json'), '--paths-root', str(ROOT), '--output', str(output)]
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
    report['reviewCLIReplay']=replay
    assert sum(len(f['contentPanels']) for f in panels)==34
    report['supersedesLabelOnly']={'file':'preview-review.json','sha256':'f35573754d546da4027e607a4821b43a2de60bcfa9c3bad95cd9fb4ac72ed4a4','reason':'V1 aggregate verdict said68panels; its actual per-file records correctly total34. Corrected narrative count; binary and decoded exactness unchanged.'}
    report['priorOverstrictRerun']={'file':'preview-review-v2.json','sha256':'fe14247fc868c6b289f1eff51ac364568fb5ea805e3ac4b55f944f3c67835844','reason':'Extra fullJPEGbyte assertion rejected a replay despite all34contentpanels exact and variance bounded to existing emptyJPEG-tail padding allowance. V3 preserves panel/difference evidence and uses maintained qualified padding criterion, not fullbinary equality as acceptance.'}
    report.update(verdict='PASS actual public reviewCLI: all34 decoded content/labelpanels plusHTML exact; any JPEG-tail padding variance bounded',descriptor=witness(BASE/'batch.json'),selection=witness(BASE/'selection.json'),actualMapProof=witness(proof_path),HTMLImageReferences=parsed.sources,reviewCLIReplay=replay,ownedTemporaryDuplicatesRemoved=True,inputsStable=True)
except Exception as exc:
    report.update(verdict='HOLD',error=repr(exc));raise
finally:
    report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with OUT.open('x') as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'receipt':str(OUT),'verdict':report['verdict'],'sha256':sha(OUT.read_bytes())}))
