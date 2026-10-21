"""Independent read-only exact wood3_6 composition check; no composer import."""
from pathlib import Path
import hashlib, json, datetime
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[6]
HERE = Path(__file__).resolve().parent
A = ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-004/wood3_6'
def rec(p):
    return {'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
lineage_path=A/'source-aligned-v1/source-lineage.json'
lineage=json.loads(lineage_path.read_text())
old=json.loads((HERE.parent/'result.json').read_text())
oldrefs=[old['master'],old['masterRGB'],old['masterFloat'],old['tiers'],old['candidateBatch'],old['generation']['retainedRaw'],old['generation']['journal'],old['generation']['exactPrompt']]+[v for t in old['actualMaps'].values() for v in t.values()]
watched=lineage['watchedInputs']+oldrefs+[rec(lineage_path),rec(Path(__file__))]
for v in watched:
    assert rec(ROOT/v['file'])['sha256']==v['sha256'],v['file']
rawim=Image.open(ROOT/lineage['raw']['file']);madeim=Image.open(ROOT/lineage['output']['file'])
assert rawim.mode==madeim.mode=='RGB' and rawim.size==madeim.size==(1254,1254)
raw=np.asarray(rawim);made=np.asarray(madeim)
expected=raw.copy();expected[:,935:]=raw[(np.arange(1254)+38)%1254,935:]
assert np.array_equal(expected,made)
inverse=made.copy();inverse[:,935:]=made[(np.arange(1254)-38)%1254,935:]
assert np.array_equal(inverse,raw) and np.array_equal(made[:,:935],raw[:,:935])
journal=json.loads((ROOT/lineage['journal']['file']).read_text())['items'][0]
assert journal['generationCount']==1 and journal['generated']==lineage['raw']['file'] and journal['generatedSha256']==lineage['raw']['sha256']
assert json.loads((A/'source-aligned-v1/x-landmarks.json').read_text())=={'axis':'x','points':[[0,0],[16,276*64/1254],[32,620*64/1254],[48,935*64/1254],[64,64]]}
for v in watched:
    assert rec(ROOT/v['file'])['sha256']==v['sha256'],v['file']
report={'schemaVersion':1,'verdict':'PASS exact composition and source ART before master; no final master/tier qualification','reviewer':'/root/quake_codec_plan, independent from root composer/repair author','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'lineage':rec(lineage_path),'verifier':rec(Path(__file__)),'composer':lineage['composer'],'raw':lineage['raw'],'output':lineage['output'],'forwardAllPixelsExact':True,'fullInverseExact':True,'outside935ColumnsPixelExact':True,'noNewOrInterpolatedPixels':True,'journalUnchangedRawSourceCount1':True,'measuredXLandmarksExact':True,'originalHOLDWitnessesStable':len(oldrefs),'composerWatchedInputsStable':len(lineage['watchedInputs']),'artReview':'Actual full1254 RGB, BOX5122x2repeat and unresampled corner cross inspected independently. Fourthboard butt now meets Ywrap; no extra small endstrip remains. Wood fibres/material remain coherent; darkcut inside existing verticalgap does not introduce visible face splice/light band. Firstboard width still awaits approved existingXregistration, not declared fixed by this permutation.','reviewedViews':[rec(HERE/'source-diagnostics'/p) for p in ['source-box512-repeat2.png','source-corners-1to1.png','views.json']],'lineageLimit':'This is a reviewed derivative of one retained raw, not imagegen output. Existing prepare may consume it only with explicit upstream sourceComposition and originalPrepareReceipt custody; standard directraw/journal check cannot be falsely claimed. Exact-pixel permutation claims end before existing finishing/resampling.','remainingGates':['One replacement512RGB/fullfloat master via reviewedXlandmarks, preserving originalCLI receipt and truthful derivative policy.','New actualRGB physical/joint review including mapped historical failed observations; no point movement to manufacture pass.','Independent master/tier replay, decoded both tiers/repeats/BOX and final ART/browser before catalog.'],'mutations':'Only this owned verifier/report; no assets, raw/journal, prior master/maps, Git/catalog/Hexen/Desktop/browser changes.'}
(HERE/'independent-composition-review.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(rec(HERE/'independent-composition-review.json')))
