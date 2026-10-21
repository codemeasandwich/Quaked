"""Apply the two reviewed external-carrier trims; no generator or tier encoder."""
from pathlib import Path
import hashlib
import io
import json
import sys

import PIL
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
PLAN = Path(__file__).resolve().parent
sha = lambda data: hashlib.sha256(data).hexdigest()
recipe_bytes = (PLAN / 'recipe.json').read_bytes()
assert sha(recipe_bytes) == '9456556ab00a041a8d95f5510d41c7bab14cf521816b47f5b083807199b69387'
recipe = json.loads(recipe_bytes)
assert recipe['policy'] == 'reviewed-external-carrier-downsample-v1'
assert PIL.__version__ == '10.1.0'
assert [item['artVariantID'] for item in recipe['items']] == [
    'woodland-abbey-ruin', 'forest-stone-shrine']
prepared = []
for item in recipe['items']:
    parent = ROOT / item['input']['file']
    raw = parent.read_bytes()
    assert sha(raw) == item['input']['sha256']
    source = Image.open(io.BytesIO(raw))
    assert source.format == 'PNG' and source.mode == 'RGB'
    assert source.size == tuple(item['inputDimensions']) == (724, 2171)
    assert item['cropXYXYHalfOpen'] == [100, 0, 624, 2171]
    core = source.crop(tuple(item['cropXYXYHalfOpen']))
    assert core.size == (524, 2171)
    assert item['outputDimensions'] == [512, 2048]
    assert all(a > b for a, b in zip(core.size, item['outputDimensions']))
    result = core.resize(tuple(item['outputDimensions']), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    result.save(buffer, 'PNG')
    output, receipt = ROOT / item['output'], ROOT / item['receipt']
    assert output.parent == receipt.parent and not output.parent.exists()
    assert output.parent.parent.resolve() == output.parent.parent.absolute()
    prepared.append((item, parent, raw, output, receipt, buffer.getvalue()))
assert all(parent.read_bytes() == raw for _, parent, raw, *_ in prepared)
for item, parent, raw, output, receipt, image_bytes in prepared:
    output.parent.mkdir(parents=True, exist_ok=False)
    with output.open('xb') as file:
        file.write(image_bytes)
    record = {
        'schemaVersion': 1, 'state': 'REGISTERED_SOURCE_AWAITING_INDEPENDENT_REVIEW',
        'artVariantID': item['artVariantID'], 'nativeIdentity': recipe['nativeIdentity'],
        'recipe': {'file': str((PLAN / 'recipe.json').relative_to(ROOT)), 'sha256': sha(recipe_bytes)},
        'input': item['input'], 'inputDimensions': item['inputDimensions'],
        'cropXYXYHalfOpen': item['cropXYXYHalfOpen'], 'coreDimensions': [524, 2171],
        'operation': 'One external-carrier crop and one down-only LANCZOS resize',
        'output': {'file': str(output.relative_to(ROOT)), 'sha256': sha(image_bytes),
                   'dimensions': [512, 2048], 'mode': 'RGB', 'format': 'lossless authoring PNG'},
        'tool': {'file': str(Path(__file__).resolve().relative_to(ROOT)),
                 'sha256': sha(Path(__file__).read_bytes())},
        'environment': {'python': sys.version, 'pillow': PIL.__version__},
        'familyModelCallsAtProcessing': {'originalGeneration': 1, 'edits': 3, 'total': 4},
        'noNewModelCall': True, 'masterOrTierProduced': False,
        'limits': 'Not lossless extraction; unequal minification disclosed in recipe. Actual source, palette, repeats and physical tiers remain separate gates.'}
    assert parent.read_bytes() == raw and output.read_bytes() == image_bytes
    receipt_bytes = (json.dumps(record, indent=2) + '\n').encode('utf8')
    with receipt.open('xb') as file:
        file.write(receipt_bytes)
    assert receipt.read_bytes() == receipt_bytes
    print(json.dumps(record['output']))
