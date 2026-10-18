"""Independent replay and protected-region check for unregistered realism seams.

Runs production authoring CLI into a temporary directory; independently defines
protected regions geometrically instead of importing its composition/mask code.
No installed assets or candidate masters are changed.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / 'tools'))
from resource_paths import resource_path
from helpers.authoring_replay import stage_authoring_inputs

SOURCE = ROOT / 'tools/texture_sheets/sources/official-world-2026-10-12'
CANDIDATES = resource_path(ROOT, 'newer/textures/candidates-2026-10-12')
NAMES = ['TF_Wood01', 'TF_Wood01c', 'TF_Stone_01', 'TF_Stone3', 'TF_Cliff2', 'TF_Cliff2b']
def sha(path):
    return hashlib.sha256(resource_path(ROOT, path).read_bytes()).hexdigest()
def pixels(path):
    return np.asarray(Image.open(resource_path(ROOT, path)).convert('RGB'))

with tempfile.TemporaryDirectory(prefix='quaked-realism-edge-replay-') as directory:
    producer='tools/texture_sheets/sources/official-world-2026-10-12/finish_realistic_edges.py'
    replay=stage_authoring_inputs(ROOT,directory,[producer,*[
        f'newer/textures/candidates-2026-10-12/{name}-realistic-4x.png' for name in NAMES],*[
        f'tools/texture_sheets/sources/official-world-2026-10-12/{name}-offset-repair-v1.png' for name in NAMES]])
    subprocess.run(['/usr/bin/python3', str(replay/producer), '--output-dir', directory], check=True, capture_output=True)
    rows = []
    replay = {}
    for name in NAMES:
        output = Path(directory) / f'{name}-realistic-seam-v2-4x.png'
        actual = CANDIDATES / output.name
        record = json.loads(actual.with_suffix('.json').read_text())
        master_id=f'newer/textures/candidates-2026-10-12/{name}-realistic-4x.png'
        repair_id=f'tools/texture_sheets/sources/official-world-2026-10-12/{name}-offset-repair-v1.png'
        for field,identity in [('master',master_id),('generatedRepair',repair_id)]:
            assert record[field]==identity or record[field].endswith('/'+identity), 'retained input identity differs'
        master=resource_path(ROOT,master_id);repair=resource_path(ROOT,repair_id)
        assert sha(output) == sha(actual) == record['outputSha256'], name + ': replay differs'
        assert sha(SOURCE / 'finish_realistic_edges.py') == record['toolSha256']
        assert sha(master) == record['masterSha256']
        assert sha(repair) == record['generatedRepairSha256']
        before, after = pixels(master), pixels(output)
        h, w = before.shape[:2]
        assert after.shape == before.shape
        y, x = np.mgrid[:h, :w]
        side = np.minimum(x + .5, w - x - .5) < w / 8
        top_bottom = np.minimum(y + .5, h - y - .5) < h / 8
        if name.startswith('TF_Wood'):
            allowed = top_bottom
        elif name.startswith('TF_Stone'):
            courses = 4 if name == 'TF_Stone_01' else 8
            course_h = h // courses
            within = (y + .5) % course_h
            mortar_guard = np.minimum(within, course_h - within) <= 3
            # Alternating original courses have a real joint at the side cut.
            # The half-height cyclic shift is an even number of courses here.
            real_joint_course = (y // course_h) % 2 == 1
            assert np.array_equal(after[real_joint_course], before[real_joint_course]), name + ': real joint course changed'
            assert np.array_equal(after[mortar_guard], before[mortar_guard]), name + ': horizontal mortar changed'
            allowed = side & ~real_joint_course & ~mortar_guard
        elif name == 'TF_Cliff2':
            allowed = side | top_bottom
        else:
            allowed = side | (y + .5 < h / 8)
            top = y + .5 <= h / 16
            assert record['topSource'] == 'TF_Cliff2-realistic-seam-v2-4x.png'
            assert np.array_equal(after[top], replay['TF_Cliff2'][top]), 'Cliff2b top is not exact repaired bare cliff'
            bottom_interior = (y >= 7*h//8) & ~side
            assert np.array_equal(after[bottom_interior], before[bottom_interior]), 'Cliff2b lower transition changed or wrapped'
            assert not np.array_equal(after[0], after[-1]), 'Cliff2b vertical transition incorrectly made periodic'
        assert np.array_equal(after[~allowed], before[~allowed]), name + ': outside approved band changed'
        changed = np.any(before != after, axis=2)
        assert changed.any(), name + ': vacuous no-op'
        assert not np.any(changed & ~allowed)
        replay[name] = after
        rows.append(dict(name=name, outputSha256=sha(actual), dimensions=[w,h], independentlyProtectedPixels=int((~allowed).sum()), changedPixels=int(changed.sum()), outsideBandUnchanged=True, realMortarPreserved=name.startswith('TF_Stone'), verticalTransitionPreserved=name=='TF_Cliff2b'))
    print(json.dumps(dict(qualification='Independent CLI replay and geometric protected-region verification; no visual acceptance', count=len(rows), testSha256=sha(Path(__file__)), finisherSha256=sha(SOURCE/'finish_realistic_edges.py'), rows=rows), indent=2))
