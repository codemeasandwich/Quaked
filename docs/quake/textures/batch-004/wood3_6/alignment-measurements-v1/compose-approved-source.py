"""One reviewed, reversible wood3_6 source phase correction; no generator.

The ordinary master producer remains untouched. This derivative keeps explicit
raw/journal custody rather than pretending to be a returned generator image.
"""
from pathlib import Path
import datetime
import hashlib
import io
import json

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
HERE = Path(__file__).resolve().parent
sha = lambda data: hashlib.sha256(data).hexdigest()
watched = {}


def read(path, expected=None):
    path = Path(path).resolve()
    path.relative_to(ROOT)
    data = path.read_bytes()
    digest = sha(data)
    assert path not in watched or watched[path] == digest, 'Concurrent input change'
    assert expected is None or digest == expected, 'Input differs from approval'
    watched[path] = digest
    return data


def reference(path):
    path = Path(path).resolve()
    return {'file': str(path.relative_to(ROOT)), 'sha256': sha(read(path))}


plan_path = HERE / 'same-source-alignment-plan-v1.json'
review_path = HERE / 'independent-plan-review.json'
review = json.loads(read(review_path))
assert review['verdict'].startswith('PASS bounded same-source')
plan = json.loads(read(plan_path, review['plan']['sha256']))
assert plan['proposedSameSourceComposition']['cutX'] == 935
assert plan['proposedSameSourceComposition']['rollUpRows'] == 38
raw_path = ROOT / plan['raw']['file']
raw_bytes = read(raw_path, plan['raw']['sha256'])
native_path = ROOT / plan['native']['file']
read(native_path, plan['native']['sha256'])
source_root = raw_path.parent.parent
journal_path = source_root / 'selection.json'
journal = json.loads(read(journal_path))
entry = next(x for x in journal['items'] if x['name'] == 'wood3_6')
assert entry['generationCount'] == 1
assert entry['generationState'] == 'generated-retained'
assert (ROOT / entry['generated']).resolve() == raw_path
assert entry['generatedSha256'] == sha(raw_bytes)
prompt_path = ROOT / entry['prompt']
read(prompt_path, entry['promptSha256'])
initial = json.loads(read(HERE.parent / 'candidate-batch.json'))['items'][0]
for key in ('masterPackage', 'tierReceipt'):
    read(ROOT / initial[key], initial[key + 'Sha256'])
for tier in initial['tiers'].values():
    for file in tier['files'].values():
        read(ROOT / file)
read(__file__)

image = Image.open(io.BytesIO(raw_bytes))
assert image.mode == 'RGB' and image.size == (1254, 1254)
raw = np.asarray(image)
result = raw.copy()
# Explicit source-specific bijection, independently reviewed before execution.
result[:, 935:] = raw[(np.arange(1254) + 38) % 1254, 935:]
assert np.array_equal(result[:, :935], raw[:, :935])
inverse = result.copy()
inverse[:, 935:] = result[(np.arange(1254) - 38) % 1254, 935:]
assert np.array_equal(inverse, raw)
assert all(sha(p.read_bytes()) == digest for p, digest in watched.items())

output = ROOT / plan['proposedSameSourceComposition']['output']
output.parent.mkdir(exist_ok=False)
with output.open('xb') as file:
    Image.fromarray(result, 'RGB').save(file, 'PNG')
assert np.array_equal(np.asarray(Image.open(output)), result)
landmarks = output.parent / 'x-landmarks.json'
with landmarks.open('x') as file:
    json.dump({'axis': 'x', 'points': plan['existingXRegistration']['points']}, file, indent=2)
    file.write('\n')
assert all(sha(p.read_bytes()) == digest for p, digest in watched.items())
receipt = {
    'schemaVersion': 1,
    'verdict': 'PASS exact reversible source composition; ART/master/tier acceptance separate',
    'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'name': 'wood3_6', 'nativeIdentity': entry['id'],
    'generatorCalls': 0, 'historicalSourceCalls': 1,
    'raw': reference(raw_path), 'native': reference(native_path),
    'prompt': reference(prompt_path), 'journal': reference(journal_path),
    'plan': reference(plan_path), 'independentPlanReview': reference(review_path),
    'composer': reference(__file__), 'output': reference(output),
    'landmarks': reference(landmarks), 'dimensions': [1254, 1254],
    'operation': 'For x>=935, result[y,x]=raw[(y+38)%1254,x]; all x<935 unchanged',
    'outsideSupportExact': True, 'fullInverseExact': True,
    'sourcePixelsCreatedOrInterpolated': 0,
    'nextGate': 'Independent source/composition replay and actual material/repeat/corner ART before master. Existing X finishing later resamples; its pixels are not covered by permutation-exact claims.',
    'watchedInputs': [{'file': str(p.relative_to(ROOT)), 'sha256': h} for p, h in watched.items()],
}
with (output.parent / 'source-lineage.json').open('x') as file:
    json.dump(receipt, file, indent=2)
    file.write('\n')
print(json.dumps({'output': str(output.relative_to(ROOT)), 'sha256': receipt['output']['sha256'],
                  'inverseExact': True, 'outsideExact': True, 'watchedInputs': len(watched)}))
