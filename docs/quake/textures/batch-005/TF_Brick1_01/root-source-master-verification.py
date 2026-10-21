"""Coordinator's bounded actual CLI replay; never accepts artwork or height semantics."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import tempfile
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[5]
HERE = Path(__file__).parent
PACKAGE = ROOT / 'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-005/TF_Brick1_01/master-draft-v1'
IDENTITY = 'd3ce46e945f9c961bb863204801c0b3e783878b620189ac1cf989ffbc1d534e5'
digest = lambda data: hashlib.sha256(data).hexdigest()
def ref(path):
    return {'file': str(path.relative_to(ROOT)), 'sha256': digest(path.read_bytes())}

package_bytes = (PACKAGE / 'master.json').read_bytes()
master = json.loads(package_bytes)
assert master['name'] == 'TF_Brick1_01' and master['edition'] == 'mg1'
assert master['nativeDimensions'] == [128, 128] and master['masterDimensions'] == [1024, 1024]
watched = {PACKAGE / 'master.json': digest(package_bytes)}
for row in [*master['inputs'].values(), *master['tools'].values()]:
    path = Path(row['file'])
    assert not path.is_symlink() and ROOT in path.parents
    assert digest(path.read_bytes()) == row['sha256']
    watched[path] = row['sha256']
for role in ('color', 'height'):
    path = PACKAGE / master[role]['file']
    assert digest(path.read_bytes()) == master[role]['sha256']
    watched[path] = master[role]['sha256']
native_proof_path = HERE / 'selected-native-verification.json'
native_proof = json.loads(native_proof_path.read_bytes())
assert native_proof['nativeIdentity'] == IDENTITY
assert digest(json.dumps(native_proof['identity'], sort_keys=True, separators=(',', ':')).encode()) == IDENTITY
with Image.open(master['inputs']['original']['file']) as image:
    assert image.size == (128, 128)
    assert digest(image.convert('RGBA').tobytes()) == native_proof['identity']['rgbaSha256']
for path in (native_proof_path, HERE / 'source-custody.json', HERE / 'root-plan-review.json'):
    watched[path] = digest(path.read_bytes())
fixture = json.loads((ROOT / 'tests/fixtures/quake_codec_protected_producers.json').read_bytes())
for row in fixture['protectedSourceBindings']:
    path = ROOT / row['file']
    assert digest(path.read_bytes()) == row['sha256']
    watched[path] = row['sha256']

command = ['/usr/bin/python3', 'tools/texture_sheets/prepare_texture_master.py']
for role in ('original', 'generated', 'prompt'):
    command += ['--' + role, master['inputs'][role]['file']]
command += ['--name', 'TF_Brick1_01', '--edition', 'mg1', '--profile', 'stone',
            '--color-strength', '.65', '--field-sigma', '.75', '--strength', '.3', '--cap', '.5']
with tempfile.TemporaryDirectory(prefix='quaked-root-brick-replay-', dir='/private/tmp') as temporary:
    output = Path(temporary) / 'master'
    actual_command = command + ['--output', str(output)]
    result = subprocess.run(actual_command, cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    for name in ('color.png', 'height.npy', 'master.json'):
        assert (output / name).read_bytes() == (PACKAGE / name).read_bytes(), name
    height = np.load(output / 'height.npy', allow_pickle=False)
    assert height.shape == (1024, 1024) and height.dtype == np.float32 and np.isfinite(height).all()
    assert 0 <= height.min() <= height.max() <= 1
    stdout = result.stdout
for path, expected in watched.items():
    assert digest(path.read_bytes()) == expected, str(path)

report = {
    'schemaVersion': 1, 'observedAt': datetime.now(timezone.utc).isoformat(),
    'verdict': 'PASS bounded actual source/master CLI byte replay ONLY; semantic relief remains HOLD',
    'reviewer': '/root', 'materials': [{
        'name': 'TF_Brick1_01', 'edition': 'mg1', 'nativeIdentity': IDENTITY,
        'masterPackage': ref(PACKAGE / 'master.json'), 'original': ref(Path(master['inputs']['original']['file'])),
        'replay': {'colorPNGExact': True, 'floatNPYExact': True, 'completeReceiptExact': True},
    }], 'command': actual_command, 'returnCode': result.returncode, 'stdout': stdout,
    'protectedInputsBeforeAndAfter': [ref(path) for path in watched], 'verifier': ref(Path(__file__)),
    'historicalLimits': 'Retained raw and prompt-file custody known; actual historical invocation, reference arguments and cumulative generation count remain unproved. No new provider call.',
    'limits': ['Uses the existing public CLI, not an independently implemented finisher or scalar oracle.',
               'Does not accept pigment-derived draft height, mortar masks, seamless ART, tiers, runtime, owner appearance or release.',
               'Only this proof and its own temporary replay output were written; temporary directory retired.'],
}
(HERE / 'root-source-master-proof.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'verdict': report['verdict'], 'watchedFiles': len(watched), 'proof': ref(HERE / 'root-source-master-proof.json')}))
