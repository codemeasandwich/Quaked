"""One reviewed external-carrier trim/downsample; no image service or tiers."""
from pathlib import Path
import hashlib
import io
import json
import sys
import PIL
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
PLAN = Path(__file__).resolve().parent
digest = lambda data: hashlib.sha256(data).hexdigest()
recipe_bytes = (PLAN/'proposed-recipe.json').read_bytes()
assert digest(recipe_bytes) == '01bc357f7c9a77f1e75b340ca2d249f762bd09c7793aad23ab55d8f1b50dd1fb'
recipe = json.loads(recipe_bytes)
parent = ROOT/recipe['input']['file']
data = parent.read_bytes()
assert digest(data) == recipe['input']['sha256']
assert PIL.__version__ == '10.1.0'
image = Image.open(io.BytesIO(data))
assert image.format == 'PNG' and image.mode == 'RGB' and image.size == (724, 2172)
crop = image.crop(tuple(recipe['cropXYXYHalfOpen']))
assert crop.size == (524, 2172)
assert all(a > b for a, b in zip(crop.size, recipe['outputDimensions']))
result = crop.resize(tuple(recipe['outputDimensions']), Image.Resampling.LANCZOS)
assert result.mode == 'RGB' and result.size == (512, 2048)
buffer = io.BytesIO()
result.save(buffer, 'PNG')
output = ROOT/recipe['proposedOutput']
receipt = ROOT/recipe['proposedReceipt']
assert output.parent == receipt.parent and not output.parent.exists()
assert output.parent.parent.resolve() == output.parent.parent.absolute()
assert parent.read_bytes() == data
output.parent.mkdir(parents=True, exist_ok=False)
with output.open('xb') as file:
    file.write(buffer.getvalue())
record = {'schemaVersion': 1, 'state': 'registered-candidate-awaiting-visual-source-review',
    'recipe': {'file': str((PLAN/'proposed-recipe.json').relative_to(ROOT)), 'sha256': digest(recipe_bytes)},
    'parent': recipe['input'], 'operation': 'one crop then one down-only LANCZOS resize',
    'cropXYXYHalfOpen': recipe['cropXYXYHalfOpen'], 'croppedDimensions': list(crop.size),
    'output': {'file': str(output.relative_to(ROOT)), 'sha256': digest(buffer.getvalue()),
               'dimensions': list(result.size), 'mode': 'RGB', 'format': 'lossless authoring PNG'},
    'tool': {'file': str(Path(__file__).resolve().relative_to(ROOT)),
             'sha256': digest(Path(__file__).read_bytes())},
    'environment': {'python': sys.version, 'pillow': PIL.__version__},
    'originalGenerationCalls': 1, 'editCalls': 1, 'totalModelCalls': 2,
    'sourceARTAccepted': False, 'activeSourceSelected': False, 'masterOrTierCreated': False}
assert parent.read_bytes() == data and output.read_bytes() == buffer.getvalue()
with receipt.open('x') as file:
    json.dump(record, file, indent=2)
    file.write('\n')
print(json.dumps({'output': record['output'], 'receipt': str(receipt.relative_to(ROOT))}))
