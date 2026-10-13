"""Independent replay/protected-region check for the Stone3 v3 mortar repair.

Preserves earlier seam-v2 evidence. Replays the authoring CLI into a fresh temp
folder and checks affected rows/columns independently of its mask implementation.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/texture_sheets/sources/official-world-2026-10-12'
CANDIDATES=ROOT/'newer/textures/candidates-2026-10-12'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def pixels(path): return np.asarray(Image.open(path).convert('RGB'))
actual=CANDIDATES/'TF_Stone3-realistic-seam-v3-4x.png'
record=json.loads(actual.with_suffix('.json').read_text())
master=Path(record['master'])
assert sha(master)==record['masterSha256']
assert sha(SOURCE/'restore_stone3_joint.py')==record['toolSha256']
with tempfile.TemporaryDirectory(prefix='quaked-stone3-joint-replay-') as d:
    output=Path(d)/actual.name
    subprocess.run(['/usr/bin/python3',str(SOURCE/'restore_stone3_joint.py'),'--output',str(output)],check=True,capture_output=True)
    assert sha(output)==sha(actual)==record['outputSha256'],'replay bytes differ'
    before,after=pixels(master),pixels(output)
    assert before.shape==after.shape==(512,512,3)
    y,x=np.mgrid[:512,:512]
    restored_rows=((y//64)%2)==1
    narrow_edges=(x<8)|(x>504)
    protected_mortar=(y%64<2)|(y%64>=62)
    allowed=restored_rows & narrow_edges & ~protected_mortar
    changed=np.any(before!=after,axis=2)
    assert changed.any(),'no material correction'
    assert not np.any(changed & ~allowed),'changed outside narrow even-course edge bands'
    assert np.array_equal(after[protected_mortar],before[protected_mortar]),'horizontal mortar not preserved'
    assert np.array_equal(after[~restored_rows],before[~restored_rows]),'odd courses changed'
    assert np.array_equal(after[:,8:505],before[:,8:505]),'interior changed'
    # Within the fully weighted core, every output byte must come from the
    # existing middle joint at x256, with the same within-course Y coordinate.
    core=restored_rows & ((x<=2)|(x>=510)) & (y%64>=4) & (y%64<60)
    donor=before[:,np.r_[256:512,0:256]]
    assert np.array_equal(after[core],donor[core]),'core does not reuse real central joint'
    assert np.any(after[core]!=before[core]),'core reuse is vacuous'
    assert record['restoredCourses']==[2,4,6,8]
    assert record['donorJointX']==256 and record['wrapCorePixels']==2 and record['wrapOuterPixels']==8
    result=dict(qualification='Independent authoring CLI replay and protected-region verification; visual acceptance remains separate',outputSha256=sha(actual),masterSha256=sha(master),toolSha256=sha(SOURCE/'restore_stone3_joint.py'),testSha256=sha(Path(__file__)),changedPixels=int(changed.sum()),allowedPixels=int(allowed.sum()),protectedPixels=int((~allowed).sum()),coreDonorPixels=int(core.sum()),outsideBandUnchanged=True,horizontalMortarPreserved=True,oddCoursesUnchanged=True,interiorUnchanged=True,centralJointReusedExactlyInCore=True)
    print(json.dumps(result,indent=2))
