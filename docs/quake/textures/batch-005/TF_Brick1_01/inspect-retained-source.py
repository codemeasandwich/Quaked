"""Bounded image diagnostics; only source analysis, no authoring/master/tier outputs."""
from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib,numpy as np,datetime
ROOT=Path(__file__).resolve().parents[5];HERE=Path(__file__).parent;OUT=HERE/'source-review';OUT.mkdir(exist_ok=True)
intake=ROOT/'docs/quake/textures/batch-005/retained-source-intake.json';row=next(x for x in json.loads(intake.read_text())['items'] if x['name']=='TF_Brick1_01')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bind(p):return {'file':str(p.relative_to(ROOT)),'sha256':sha(p)}
paths={k:ROOT/row[k]['file'] for k in ['freshNative','retainedNamedNative','retainedRaw','retainedPromptLocator']}
for k,p in paths.items():assert sha(p)==row[k]['sha256'],k
ims={k:Image.open(p) for k,p in paths.items() if k!='retainedPromptLocator'};native=ims['freshNative'].convert('RGB');raw=ims['retainedRaw'].convert('RGB');assert native.size==(128,128) and raw.size==(1254,1254)
assert ims['freshNative'].convert('RGBA').tobytes()==ims['retainedNamedNative'].convert('RGBA').tobytes()
native.resize((512,512),Image.Resampling.NEAREST).save(OUT/'native-nearest4.png')
compare=Image.new('RGB',(1030,720),(32,32,32));draw=ImageDraw.Draw(compare)
draw.text((5,5),'Retained source analysis only: BOTH inputs BOX64/32, enlarged NEAREST; no master/tier',fill='white')
metrics=[]
for j,s in enumerate((64,32)):
 for i,(label,im) in enumerate([('native',native),('raw',raw)]):
  small=im.resize((s,s),Image.Resampling.BOX);small.save(OUT/(label+'-box-'+str(s)+'.png'));compare.paste(small.resize((s*6,s*6),Image.Resampling.NEAREST),(i*512,35+j*420));draw.text((i*512+4,20+j*420),label+' BOX'+str(s),fill='white')
 a=np.asarray(native.resize((s,s),Image.Resampling.BOX),dtype=float);b=np.asarray(raw.resize((s,s),Image.Resampling.BOX),dtype=float);metrics.append({'dimensions':[s,s],'bothInputsFilter':'Pillow BOX','meanAbsoluteRGBError':float(abs(a-b).mean()),'maximumAbsoluteRGBError':float(abs(a-b).max())})
compare.save(OUT/'raw-native-box-both.png')
for label,im in [('native',native),('raw',raw)]:
 w,h=im.size;repeat=Image.new('RGB',(w*2,h*2))
 for x in (0,w):
  for y in (0,h):repeat.paste(im,(x,y))
 repeat.save(OUT/(label+'-repeat2x2.png'))
 # Literal pixels, not scaled/offset previews. X vertical strip includes every course.
 r=64 if label=='raw' else 8
 repeat.crop((w-r,0,w+r,h)).save(OUT/(label+'-x-join.png'))
 repeat.crop((0,h-r,w,h+r)).save(OUT/(label+'-y-join.png'))
 repeat.crop((w-r,h-r,w+r,h+r)).save(OUT/(label+'-four-corners.png'))
 a=np.asarray(im,dtype=float);metrics.append({'input':label,'wrapMeanAbsRGB':{'x':float(abs(a[:,0]-a[:,-1]).mean()),'y':float(abs(a[0]-a[-1]).mean())},'internalNeighborMeanAbsRGB':{'x':float(abs(a[:,1:]-a[:,:-1]).mean()),'y':float(abs(a[1:]-a[:-1]).mean())},'limit':'Statistics locate discontinuity only; no seam/material acceptance.'})
# Overlay only for measurement, never an authoring input.
grid=raw.copy();dr=ImageDraw.Draw(grid)
for p in range(0,129,8):
 q=min(1253,round(p*1254/128));dr.line((0,q,1253,q),fill=(255,0,255),width=1);dr.text((3,min(q+1,1239)),str(p),fill=(255,255,0))
grid.save(OUT/'raw-native-coordinate-grid.png')
files=[bind(p) for p in sorted(OUT.glob('*.png'))]
report={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'PASS exact retained inputs and analysis artifact custody only','nativeIdentity':row['nativeIdentity'],'inputs':{k:bind(p) for k,p in paths.items()},'rawDimensions':list(raw.size),'rawMode':ims['retainedRaw'].mode,'nativeDecodedRGBAEqualHistorical':True,'sourceAdequate1024WithoutUpscaling':True,'generationThisLane':0,'generationInvocationProvenance':'Retained prompt locator is not proof of exact historical invocation. No actual invocation/return handle established by this diagnostic.','metrics':metrics,'outputs':files,'producer':bind(Path(__file__)),'limits':['No master/float relief/tiers authored.','No decoded tier, codec, material/seam acceptance, registration, runtime, owner, landing or release claim.']}
# Retained provenance is byte custody, never a reconstructed generator invocation.
rpath=ROOT/'docs/evidence/authoring-images-assets-2026-10-18/relocation.json';relocation=json.loads(rpath.read_text())
def find_raw(x):
 if isinstance(x,dict):
  if x.get('path')==report['inputs']['retainedRaw']['file']:return x
  for v in x.values():
   found=find_raw(v)
   if found:return found
 elif isinstance(x,list):
  for v in x:
   found=find_raw(v)
   if found:return found
witness=find_raw(relocation);assert witness['sha256']==sha(paths['retainedRaw'])
report['historicalRelocationWitness']={'receipt':bind(rpath),'row':witness,'currentRawBytesEqualHistoricalReceipt':True}
report['selectedNativeProof']=bind(HERE/'selected-native-verification.json')
report['retainedOldRegistration']=bind(ROOT/'tools/texture_sheets/sources/official-world-2026-10-17/base-masonry-trims-registration.json')
report['retainedOldAllLossyEncodingReceipt']=bind(ROOT/'assets/authoring/texture_sheets/official-encodings/2026-10-17/TF_Brick1_01-photographic-seam-v2-4x-q92-xyz.json')
report['historicalLimits']=['Retained October18 relocation receipt pins the exact3496050byte raw used for this intake; it does not preserve the original built-in invocation arguments/return handle.','Retained exact promptfile describes16courses, but it is a locator and not proof that these exact bytes were issued to the generator.','Old4x all-lossy registration and encoding receipts describe historical outputs, not this proposed1024RGB/fullfloat and512/1024mixedcodec package.']
(HERE/'source-custody.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'receipt':str((HERE/'source-custody.json').relative_to(ROOT)),'outputs':len(files),'metrics':metrics}))
