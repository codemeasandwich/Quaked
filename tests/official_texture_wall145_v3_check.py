"""Independent wall14_5 mortar-v3 replay and running-bond phase check."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/texture_sheets/sources/official-world-2026-10-12'
CANDIDATES=ROOT/'newer/textures/candidates-2026-10-12'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def rgb(p):return np.asarray(Image.open(p).convert('RGB'))
actual=CANDIDATES/'wall14_5-photographic-seam-v3-4x.png';record=json.loads(actual.with_suffix('.json').read_text());master=ROOT/record['source']
assert sha(master)==record['sourceSha256'];assert sha(SOURCE/'restore_wall145_joint.py')==record['toolSha256']
assert record['donorJointY']==128 and record['donorHorizontalPhase']==128
assert record['wrapCorePixels']==4 and record['wrapOuterPixels']==16 and record['protectedRows']==[16,240]
with tempfile.TemporaryDirectory(prefix='quaked-wall145-v3-') as temp:
    output=Path(temp)/actual.name
    subprocess.run(['/usr/bin/python3',str(SOURCE/'restore_wall145_joint.py'),'--input',str(master),'--output',str(output)],check=True,capture_output=True)
    assert sha(output)==sha(actual)==record['outputSha256'],'CLI replay differs'
    before,after=rgb(master),rgb(actual);assert before.shape==after.shape==(256,256,3)
    assert np.array_equal(before[16:241],after[16:241]),'protected rows16..240 changed'
    donor=before[np.r_[128:256,0:128]][:,np.r_[128:256,0:128]]
    core_rows=np.r_[0:5,252:256]
    assert np.array_equal(after[core_rows],donor[core_rows]),'core lacks correct XY running-bond phase'
    wrong_phase=before[np.r_[128:256,0:128]]
    assert np.any(donor[core_rows]!=wrong_phase[core_rows]),'horizontal phase check would be vacuous'
    expected=before.astype(float)
    # Construct the two finite edge bands explicitly, without importing the
    # implementation's smooth() helper or its periodic distance expression.
    weights=np.zeros(256)
    for row in list(range(16))+list(range(241,256)):
        distance=row if row<16 else 256-row
        u=max(0,min(1,(distance-4)/12));weights[row]=1-(3*u*u-2*u*u*u)
    expected=np.rint(before*(1-weights[:,None,None])+donor*weights[:,None,None]).astype('uint8')
    assert np.array_equal(after,expected),'independent phased feather composition differs'
    changed=np.any(after!=before,axis=2);allowed=np.broadcast_to(weights[:,None]>0,(256,256));assert not np.any(changed&~allowed)
    result=dict(qualification='Independent candidate mortar repair replay; visual acceptance separate',testSha256=sha(__file__),toolSha256=sha(SOURCE/'restore_wall145_joint.py'),sourceSha256=sha(master),outputSha256=sha(actual),changedPixels=int(changed.sum()),protectedPixels=int((~allowed).sum()),protectedRows=[16,240],corePixels=int(len(core_rows)*256),halfWidthAndHeightDonorPhaseVerified=True,protectedRowsExact=True,independentFeatherCompositionExact=True)
    print(json.dumps(result,indent=2))
