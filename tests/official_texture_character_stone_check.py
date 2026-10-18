"""Independent character-stone v4 CLI replay and protected-centre check."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / 'tools'))
from resource_paths import resource_path

SOURCE=ROOT/'tools/texture_sheets/sources/official-world-2026-10-12'
CANDIDATES=resource_path(ROOT, 'newer/textures/candidates-2026-10-12')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def rgb(p):return np.asarray(Image.open(p).convert('RGB'))
actual=CANDIDATES/'wstone_03_JM-character-seam-v4-4x.png'
record=json.loads(actual.with_suffix('.json').read_text())
master=resource_path(ROOT, record['source']);repair=resource_path(ROOT, record['generatedRepair'])
assert sha(master)==record['sourceSha256'] and sha(repair)==record['generatedRepairSha256']
wrapper=SOURCE/'finish_character_stone.py'
current_wrapper=wrapper.read_text()
original_docstring='\"\"\"Apply the already reviewed quiet-edge colour correction to photographic limestone.\n\nOnly opposite-edge colour offsets change. The GPT mineral forms and central\nthree quarters remain untouched; no new noise or texture detail is synthesized.\nThis authoring operation is owner-authorized, not automatic visual acceptance.\n\"\"\"'
# Pin the historical generation bytes after restoring ONLY the known old module
# docstring. Any executable change still fails this provenance assertion.
assert current_wrapper.startswith('\"\"\"')
original_wrapper=original_docstring+current_wrapper.split('\"\"\"',2)[2]
assert hashlib.sha256(original_wrapper.encode()).hexdigest()==record['toolSha256']

assert sha(record['implementation'])==record['implementationSha256']
assert record['axes']=='xy' and record['bandFraction']==1/8 and record['method']=='GPT cyclic-offset repair confined to feathered boundary cross'
with tempfile.TemporaryDirectory(prefix='quaked-character-stone-replay-') as temp:
    output=Path(temp)/'replay.png'
    subprocess.run(['/usr/bin/python3',str(SOURCE/'finish_character_stone.py'),'--input',str(master),'--offset-repair',str(repair),'--output',str(output)],check=True,capture_output=True)
    assert sha(output)==sha(actual)==record['outputSha256'],'replayed v4 differs'
    before,after=rgb(master),rgb(output);h,w=before.shape[:2]
    assert before.shape==after.shape==(1024,1024,3)
    y,x=np.mgrid[:h,:w]
    dx=np.minimum(x+.5,w-x-.5);dy=np.minimum(y+.5,h-y-.5)
    allowed=(dx<w/8)|(dy<h/8)
    assert np.array_equal(after[~allowed],before[~allowed]),'protected central mineral forms changed'
    assert np.array_equal(after[128:896,128:896],before[128:896,128:896]),'central768square resampled'
    changed=np.any(after!=before,axis=2)
    assert changed.any() and not np.any(changed&~allowed)
    # Independently confirm full-strength boundary cores select the recorded
    # photographic repair under the stated half-width/half-height cyclic offset.
    donor=np.asarray(Image.open(repair).convert('RGB').resize((w,h),Image.Resampling.LANCZOS))
    unshifted=np.roll(donor,(-h//2,-w//2),axis=(0,1))
    core=(dx<=w*12/512)|(dy<=h*12/512)
    assert np.array_equal(after[core],unshifted[core]),'boundary core donor phase is wrong'
    result=dict(qualification='Independent authoring CLI replay and protected centre proof; visual/native acceptance separate',testSha256=sha(__file__),toolSha256=sha(SOURCE/'finish_character_stone.py'),generationToolSha256=record['toolSha256'],onlyModuleDocstringChanged=True,implementationSha256=sha(record['implementation']),sourceSha256=sha(master),repairSha256=sha(repair),outputSha256=sha(actual),dimensions=[w,h],centralUnchangedDimensions=[768,768],protectedCentrePixels=int((~allowed).sum()),changedPixels=int(changed.sum()),allowedPixels=int(allowed.sum()),photographicCorePixels=int(core.sum()),centerExact=True,outsideBoundaryBandUnchanged=True,corePhotographicDonorMatches=True)
    print(json.dumps(result,indent=2))
