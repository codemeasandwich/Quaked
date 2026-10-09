"""Read-only public Git policy check; optionally verify preserved donor bytes."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preservation-root', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
policy = json.loads((root / 'docs/distribution-local-only.json').read_text())
rows = policy['paths']
paths = {row['path'] for row in rows}
assert len(paths) == len(rows), 'duplicate classification paths'
assert all(not p.startswith('/') and '..' not in Path(p).parts for p in paths)

def git(*argv, input=None):
    return subprocess.run(['git', '-C', str(root), *argv], input=input,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)

def ignored(items, no_index=True):
    data = ('\0'.join(sorted(items)) + '\0').encode()
    result = git('check-ignore', *(['--no-index'] if no_index else []), '-z', '--stdin', input=data)
    assert result.returncode in (0, 1), result.stderr.decode()
    return set(result.stdout.decode().rstrip('\0').split('\0')) if result.stdout else set()

assert ignored(paths) == paths, 'classified path missing an effective exact ignore rule'
tracked = set(git('ls-files', '-z').stdout.decode().rstrip('\0').split('\0'))
assert not ignored(tracked - paths), 'required tracked source matched local-only policy'
assert not ignored(paths, no_index=False) & tracked, 'Git must retain already tracked developer files'
controls = {'assets/docs/procedural-surface-enhancement.png', 'newer/ui/studio-logo.png',
            'logo.svg', 'shotgun.zip', 'dem4_4_maps.zip', 'LICENSE', 'README.md',
            'docs/future-public-guide.md', 'src/future-engine.js', 'newer/future-runtime.png',
            'newer/enemies/ogre/custom/diffuse.webp', 'server/README.md', 'music/CREDITS.txt'}
assert not ignored(controls), 'runtime, public docs, build or legal control excluded'
closure = set()
def payloads(data, kind):
    rows = list(data.values()) if kind == 'normals' else [row for value in data.values() for row in (value if isinstance(value, list) else [value])]
    return {path for row in rows for path in ([part['file'] for part in row['parts']] if row.get('parts') else [row['file']])}

for group in policy['runtimeClosure']:
    manifest = json.loads((root / group['manifest']).read_text())
    text = (root / group['registry']).read_text()
    registry = json.loads(text[text.index('{'):].strip().removesuffix(';'))
    actual = payloads(manifest['samples' if group['kind'] == 'normals' else 'levels'], group['kind'])
    assert actual == payloads(registry, group['kind']), 'current registry/manifest disagreement'
    assert actual == set(group['referencedFiles']), 'classification runtime snapshot changed; review new dependencies'
    for path in actual:
        assert (root / path).is_file(), 'missing runtime dependency: ' + path
    closure.update(actual)
    closure.update([group['manifest'], group['registry']])
assert not ignored(closure), 'runtime manifest dependency excluded'
# Check actual relative production imports without requiring unrelated deleted
# development prototypes to reappear. A classified path cannot be an import.
for source in [root / 'main.js', *(root / 'src').glob('*.js')]:
    for target in re.findall(r"(?:from\s*|import\s*\()\s*['\"]([^'\"]+)", source.read_text()):
        if not target.startswith('.'):
            continue
        resolved = (source.parent / target).resolve().relative_to(root).as_posix()
        assert resolved not in paths, 'production import excluded: ' + resolved
preserved = 0
if args.preservation_root:
    local = args.preservation_root.resolve()
    for row in rows:
        path = local / row['path']
        assert path.is_file() == row['presentAtAudit'], 'donor presence changed: ' + row['path']
        if row['presentAtAudit']:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            assert digest == row['sha256'], 'donor bytes changed: ' + row['path']
            preserved += 1
print(json.dumps({'result': 'PASS', 'classified': len(paths), 'retainedTracked': len(tracked - paths),
                  'alreadyTracked': len(paths & tracked), 'runtimeDependencies': len(closure),
                  'preservationHashesChecked': preserved, 'effect': 'future ignore only; no index/history mutation'}))
