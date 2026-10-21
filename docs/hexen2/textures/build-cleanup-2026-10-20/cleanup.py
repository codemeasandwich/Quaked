"""One-shot retirement of explicitly inventoried inactive texture build payloads.

No generic path argument, cache purge or source deletion. Inspect journal.json
before any interrupted-run recovery; never rerun or remove a quarantine by age.
"""
from pathlib import Path
import datetime, hashlib, importlib.util, json, os, shutil, subprocess, sys, uuid
R = Path(__file__).resolve().parents[4]
D = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
p = D/'plan-v2.json'
assert sha(p) == '61a1dbc294e20ea687234ee3b0d5f0553f879693800ee9fceffb712ddd5f2ac7'
v = json.loads(p.read_text())
journal = D/'journal.json'
assert not journal.exists(), 'One-shot operation: reconcile existing journal first'
protected = {R/f: h for f, h in v['protectedFiles'].items()}
assert all(p.is_file() and sha(p) == h for p, h in protected.items())
helper = R/'tools/texture_sheets/register_layered_texture_boundary.py'
assert sha(helper) == '90f9cb11ff3b6b740e4df56bdbb3746d31fcb2d72ca6b342b102466e01e900c8'
sys.path.insert(0, str(helper.parent))
spec = importlib.util.spec_from_file_location('verified_exclusive_publication', helper)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
quarantine = R/'dist'/('.texture-build-retirement-'+uuid.uuid4().hex)
quarantine.mkdir()
space = os.statvfs(R)
state = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
         'planSha256': sha(p), 'quarantine': str(quarantine), 'state': 'running',
         'freeBytesBefore': space.f_bavail*space.f_frsize, 'entries': []}

def save():
    temp = D/'journal.next'
    with temp.open('w') as f:
        f.write(json.dumps(state, indent=2)+'\n'); f.flush(); os.fsync(f.fileno())
    os.replace(temp, journal)


def scan(path):
    r = subprocess.run(['/usr/sbin/lsof', '-Fpn', '+D', str(path)],
                       capture_output=True, text=True, timeout=40)
    assert r.returncode == 1 and not r.stdout.strip() and not r.stderr.strip(), \
        'Active artifact or incomplete open-file scan: '+str(path)


def check_files(path, target):
    files = {str(p.relative_to(path)): p for p in path.rglob('*') if p.is_file()}
    assert set(files) == {f['relative'] for f in target['files']}, 'Payload names changed'
    assert not any(p.is_symlink() for p in path.rglob('*')), 'Payload has redirected entry'
    for f in target['files']:
        p = files[f['relative']]; s = p.lstat()
        assert (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns) == \
            (f['device'], f['inode'], f['bytes'], f['mtimeNs']), 'Payload identity changed: '+str(p)
        assert sha(p) == f['sha256'], 'Payload bytes changed: '+str(p)


save()
try:
    for n, target in enumerate(v['targets']):
        source = R/target['directory']
        entry = {'directory': target['directory'], 'bytes': target['bytes'],
                 'files': len(target['files']), 'state': 'checking'}
        state['entries'].append(entry); save()
        if not source.exists():
            entry['state'] = 'already absent; not credited to this cleanup'; save(); continue
        assert not source.is_symlink() and source.resolve() == source
        assert source.resolve().is_relative_to(R/'dist') and source != R/'dist/staged/web'
        case, = [r for r in v['sourceReceipts'] if source.parent == R/r['root']]
        receipt = source.parent/'staged-receipt.json'
        assert sha(receipt) == case['receiptSha256'], 'Source build receipt changed'
        s = source.lstat()
        assert (s.st_dev, s.st_ino) == (target['device'], target['inode']), 'Directory replaced'
        scan(source); check_files(source, target)
        destination = quarantine/('%02d-' % n + source.name)
        module.publish_exclusive(source, destination)
        entry.update(state='quarantined', quarantine=str(destination)); save()
        s = destination.lstat()
        assert (s.st_dev, s.st_ino) == (target['device'], target['inode']), 'Unexpected moved directory'
        scan(destination); check_files(destination, target)
        shutil.rmtree(destination)
        assert not destination.exists()
        entry['state'] = 'removed'; save()
    assert all(p.is_file() and sha(p) == h for p, h in protected.items()), 'Protected bytes changed'
    quarantine.rmdir()
    state.update(state='complete', protectedFilesUnchanged=len(protected),
                 currentHTMLPreserved=True, quarantineRemoved=True)
except Exception as exc:
    state.update(state='interrupted; preserve quarantine and inspect journal', error=repr(exc))
    save()
    raise
finally:
    state['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    space = os.statvfs(R); state['freeBytesAfter'] = space.f_bavail*space.f_frsize
    state['removedBytes'] = sum(e['bytes'] for e in state['entries'] if e['state']=='removed')
    state['removedFiles'] = sum(e['files'] for e in state['entries'] if e['state']=='removed')
    save()
    print(json.dumps({k: state[k] for k in ['state','removedBytes','removedFiles','freeBytesBefore','freeBytesAfter']}))
