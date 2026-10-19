"""Replay the public review CLI in owned temporary scratch and bind manifests.

Final master/map/preview files are read only. Temporary duplicate JPEGs are
removed when verification ends. No artistic or browser-runtime acceptance.
"""
import datetime, hashlib, html.parser, json, os, pathlib, subprocess, sys, tempfile
import PIL, numpy
from PIL import features

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-002'
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs/hexen2/textures/batch-002-public-preview-v1.json'
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
          'limits': ['Public review CLI replay is deterministic preview-source binding, not independent artistic acceptance.',
                     'Static HTML/image files checked; no browser layout, GPU, engine or gameplay qualification.',
                     'Retained single generator source/declared count is not an independent provider-side invocation audit.']}
try:
    batch, selection = load(BASE / 'batch.json'), load(BASE / 'selection.json')
    assert batch['pathsBase'] == 'repository' and batch['defaultTier'] == 'Mid'
    assert batch['tierFactors'] == {'Mid': 4, 'High': 8}
    assert (batch['quality'], batch['method'], batch['lossless']) == (92, 6, False)
    assert len(batch['items']) == 8 and {i['name'] for i in batch['items']} == {i['name'] for i in selection['items']}
    proof_path = ROOT / 'docs/hexen2/textures/batch-002-public-actual-v1.json'
    actual = load(proof_path); assert actual['verdict'].startswith('PASS') and actual['mapCount'] == 80
    bound_actual = {m['name']: m for m in actual['materials']}
    selected = {i['name']: i for i in selection['items']}
    fixed = [BASE / 'batch.json', BASE / 'selection.json', proof_path,
             ROOT / 'tools/texture_sheets/build_texture_batch_review.py', pathlib.Path(__file__)]
    models = []
    for item in batch['items']:
        name = item['name']; select = selected[name]; proof = bound_actual[name]
        assert item['edition'] == select['edition'] == proof['edition']
        assert item['nativeIdentity']['id'] == select['id'] == proof['nativeIdentity']
        for key in ('original', 'generated', 'prompt'): assert item[key] == select[key]
        assert item['generationCount'] == select['generationCount'] == 1
        raw = ROOT / item['generated']; provider_output = pathlib.Path(select['generatorOutput'])
        assert sha(raw.read_bytes()) == select['generatedSha256'] == sha(provider_output.read_bytes())
        fixed += [raw, provider_output, ROOT / item['prompt'], ROOT / item['original']]
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
        models.append({'name': name, 'retainedGeneratorOutputMatches': witness(provider_output), 'masterPackage': witness(ROOT / item['masterPackage']),
                       'tierReceipt': witness(ROOT / item['tierReceipt'])})
    review = BASE / 'review'; html_path = review / 'index.html'
    parsed = Images(); parsed.feed(html_path.read_text()); assert len(parsed.sources) == 32 and len(set(parsed.sources)) == 32
    expected_names = {f"{i['name']}-{tier}-{kind}.jpg" for i in batch['items'] for tier in ('mid', 'high') for kind in ('review', 'relief')}
    assert set(parsed.sources) == expected_names
    previews = [review / source for source in parsed.sources]
    assert all(p.is_file() and p.resolve().parent == review.resolve() for p in previews)
    fixed += [html_path, *previews]
    before = {p: sha(p.read_bytes()) for p in set(fixed)}
    report['inputsBefore'] = [witness(p) for p in sorted(set(fixed))]
    git = lambda *a: subprocess.check_output(['git', *a], cwd=ROOT, timeout=15,
        env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'})
    staged = sha(git('diff', '--cached', '--binary', '--no-ext-diff'))
    bindings = [ROOT / p for p in ('assets/game/textures/index.json', 'assets/layout.json', 'tools/distribution/manifest.mjs')]
    for p in bindings: assert p.read_bytes() == git('show', 'HEAD:' + str(p.relative_to(ROOT)))
    with tempfile.TemporaryDirectory(prefix='hexen-public-preview-replay-') as temporary:
        output = pathlib.Path(temporary) / 'review'
        command = [sys.executable, str(ROOT / 'tools/texture_sheets/build_texture_batch_review.py'),
                   '--batch', str(BASE / 'batch.json'), '--paths-root', str(ROOT), '--output', str(output)]
        run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=60, check=False)
        report['reviewCLIProcess'] = {'command': command, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr}
        assert run.returncode == 0, run.stderr
        assert {p.name for p in output.iterdir()} == expected_names | {'index.html'}
        for p in [html_path, *previews]: assert p.read_bytes() == (output / p.name).read_bytes(), p.name
        replay = {'command': command, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr,
                  'all32JPEGBytesExact': True, 'indexHTMLBytesExact': True}
        temporary_path = str(output.parent)
    assert not pathlib.Path(temporary_path).exists()
    assert all(sha(p.read_bytes()) == digest for p, digest in before.items()), 'Bound inputs changed'
    assert sha(git('diff', '--cached', '--binary', '--no-ext-diff')) == staged, 'Staged diff changed'
    report.update({'verdict': 'PASS manifest/source bindings and all32 decoded-map preview JPEGs reproduced through public CLI',
                   'sourceBindings': models, 'actualMapProof': witness(proof_path), 'HTMLImageReferences': parsed.sources,
                   'reviewCLIReplay': replay, 'ownedTemporaryDuplicatesRemoved': True,
                   'runtimeBindingFilesEqualHEAD': [witness(p) for p in bindings],
                   'foreignStagedDiffUnchanged': True, 'inputsStable': True, 'inputs': [witness(p) for p in sorted(set(fixed))]})
except Exception as exc:
    report['verdict'] = 'HOLD'; report['error'] = repr(exc); raise
finally:
    report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    OUT.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'receipt': str(OUT), 'verdict': report['verdict'], 'sha256': sha(OUT.read_bytes())}))
