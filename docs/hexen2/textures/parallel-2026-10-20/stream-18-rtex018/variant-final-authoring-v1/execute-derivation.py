"""Execute each approved existing variant direct-tier CLI once; no new producer."""
from pathlib import Path
import json, hashlib, datetime, subprocess
R = Path('/Users/bri/SOURCE/Quaked')
A = R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018'
D = R/'docs/hexen2/textures/parallel-2026-10-20/stream-18-rtex018'
P = Path(__file__).parent
h = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
b = lambda p: {'file': str(p.relative_to(R)), 'sha256': h(p)}
a = D/'root-variant-pre-tier-physical-review.json'
assert h(a) == 'b5a5a48c4c7e989aeb8335bf24c5dd4f28b5d34139028cd224ceceb465478b65'
approval = json.loads(a.read_text())
for row in [approval['actualMathPublicCLIProof'], approval['independentPhysicalPASS']]:
    assert h(R/row['file']) == row['sha256']
results = []
for key, prefix in [('woodland-abbey-ruin', 'd3dea777'), ('forest-stone-shrine', '32f15a79')]:
    V = A/'art-variants'/key
    M, T = V/'masters/layered-v1', V/'tiers/final-v1'
    assert not T.exists()
    assert h(M/'master.json').startswith(prefix)
    assert h(M/'height.npy') == 'e899c58d8faac4c077c0dda9441e3a8e448462ee5a9540f36b5b66b4321ba754'
    s = V/'source-selections/s1.json'
    j = json.loads(s.read_text())
    assert j['artVariantID'] == key and j['modelCalls'] == {'originalGeneration': 1, 'edits': 3, 'total': 4}
    Q = P/key/'derivation'
    Q.mkdir(parents=True, exist_ok=False)
    argv = ['/usr/bin/python3', 'tools/texture_sheets/derive_texture_tiers.py',
            '--original', j['original']['file'], '--master', str((M/'color.png').relative_to(R)),
            '--height-master', str((M/'height.npy').relative_to(R)), '--strength', '.3', '--cap', '.5',
            '--output', str(T.relative_to(R))]
    issued = {'state': 'issued-existing-direct-tier-derive-once',
              'issuedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'artVariantID': key, 'authority': b(a), 'sourceSelection': b(s),
              'master': b(M/'master.json'), 'RGB': b(M/'color.png'), 'floatHeight': b(M/'height.npy'),
              'argv': argv, 'newModelCalls': 0}
    with (Q/'issued.json').open('x') as o:
        json.dump(issued, o, indent=2); o.write('\n')
    p = subprocess.run(argv, cwd=str(R), capture_output=True, text=True)
    (Q/'stdout.txt').write_text(p.stdout)
    (Q/'stderr.txt').write_text(p.stderr)
    receipt = {'state': 'derive-completed' if p.returncode == 0 else 'derive-failed-no-retry',
               'exitCode': p.returncode, 'issued': b(Q/'issued.json'), 'stdout': b(Q/'stdout.txt'),
               'stderr': b(Q/'stderr.txt'),
               'outputs': [b(x) for x in sorted(T.glob('*')) if x.is_file()] if T.exists() else [],
               'qualification': 'Actual decoded/public review and independent final pending; no registration.'}
    with (Q/'receipt.json').open('x') as o:
        json.dump(receipt, o, indent=2); o.write('\n')
    results.append({'key': key, 'exitCode': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr,
                    'master': b(M/'master.json'), 'RGB': b(M/'color.png'), 'height': b(M/'height.npy'),
                    'manifest': b(T/'manifest.json') if (T/'manifest.json').exists() else None,
                    'receipt': b(Q/'receipt.json'), 'mapCount': len(list(T.glob('*.webp')))})
print(json.dumps(results, indent=2))
