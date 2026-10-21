"""Bounded read-only comparison of retained actual review CLI runs.
No image asset, shared tool, map or old receipt is changed. Tail allowance follows
skills/quaked-texture-authoring/references/repairs-and-verification.md.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[5]; E=Path(__file__).parent
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
bind=lambda p:{'file':str(Path(p).relative_to(ROOT)),'sha256':sha(p)}
prior=json.loads((E/'public-verification-v2.json').read_text())
assert len(prior['items'])==1 and prior['failure']['message'].startswith('review replay mismatch')
actual=prior['items'][0]
# Carry the already completed independent arithmetic through exact input/output custody.
for key in ('original','raw','prompt','masterReceipt','tierReceipt'):
 rec=actual[key];assert sha(ROOT/rec['file'])==rec['sha256']
batch=json.loads((E/'batch.json').read_text());item=batch['items'][0]
assert sha(E/'batch.json')==prior['batchDescriptor']['sha256']
for tier in actual['tiers']:
 for m in tier['outputs']:assert sha(ROOT/item['tiers'][tier['tier']]['files'][m['role']])==m['sha256'] and m['exactIndependentQ92Method6Bytes']
records=[]
for path in sorted((E/'review').iterdir()):
 other=E/'review-v2'/path.name
 if path.suffix=='.html':
  assert path.read_bytes()==other.read_bytes();records.append({'delivered':bind(path),'replay':bind(other),'HTMLBytesExact':True});continue
 a=np.asarray(Image.open(path).convert('RGB'));b=np.asarray(Image.open(other).convert('RGB'));assert a.shape==b.shape
 h,w=a.shape[:2];mask=np.zeros((h,w),dtype=bool);mask[h-16:,w-40:]=True
 # Explicit occupied bounds reflect current CLI layout and actual64native,
 #256/512maps; broader label rectangles deliberately protect surrounding text.
 if '-review' in path.name:
  boxes={'labelsAndOverviews':[0,0,w,552],'repeatedMaterialAndCorners':[8,566,528,1084],'halfAndQuarterComparisonsAndLabels':[536,566,1024,884]}
 else:
  side=512 if '-high-' in path.name else 256
  boxes={'topLabels':[0,0,w,26],'lowerLabels':[0,548,w,576],'height':[10,30,10+side,30+side],'XYZ':[610,30,610+side,30+side],'lightA':[10,580,10+side,580+side],'lightB':[610,580,610+side,580+side]}
 panels=[]
 for name,(x0,y0,x1,y1) in boxes.items():
  assert not mask[y0:y1,x0:x1].any(),name
  assert np.array_equal(a[y0:y1,x0:x1],b[y0:y1,x0:x1]),name
  panels.append({'panel':name,'rectangle':[x0,y0,x1,y1],'decodedRGBSha256':hashlib.sha256(a[y0:y1,x0:x1].tobytes()).hexdigest(),'exact':True})
 changed=(a!=b).any(2);assert not (changed&~mask).any()
 ys,xs=np.where(changed)
 records.append({'delivered':bind(path),'replay':bind(other),'binaryEqual':path.read_bytes()==other.read_bytes(),'panels':panels,'everyPixelOutsideEmptyTailExact':True,'changedPixels':int(changed.sum()),'changedRectangle':None if not changed.any() else [int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],'allowedEmptyTailRectangle':[w-40,h-16,w,h],'maximumChannelDifference':int(np.abs(a.astype('int16')-b).max())})
r={'verdict':'PASS bounded source/master/tier math custody and exact decoded review content; empty JPEG-tail differences retained','scope':'Exactly wwall1_1; math was completed before prior preview-only failure. No material-art/root/owner/runtime/release acceptance.','verifier':bind(__file__),'earlierActualMathChecks':bind(E/'public-verification-v2.json'),'earlierFailureRetained':prior['failure'],'actualMathRow':actual,'mathCarryForward':'Exact original/raw/prompt/master receipt/tier receipt and ten map bytes rechecked; no unchanged passing math rerun.','previewTool':bind(ROOT/'tools/texture_sheets/build_texture_batch_review.py'),'batch':bind(E/'batch.json'),'previewRuns':records,'limitation':'No whole-JPEG binary identity claim. Every decoded pixel outside a40x16 known empty bottom-right tail, including every material and label rectangle, is exact; all observed variance is outside panels. Both original JPEG sets and the stricter failed receipts remain.','policy':bind(ROOT/'skills/quaked-texture-authoring/references/repairs-and-verification.md')}
(E/'public-final-verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'verdict':r['verdict'],'report':str(E/'public-final-verification.json'),'sha256':sha(E/'public-final-verification.json'),'previewFiles':len(records)},indent=2))
