"""Actual approved layered trial diagnostics only; no tier encoding."""
from pathlib import Path
import json,hashlib,importlib.util
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
R=Path.cwd();D=Path(__file__).resolve().parent/'physical-trial-v1';D.mkdir(exist_ok=False)
B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-12-ttex255';M=B/'masters/ttex255-v2';I=B/'masters/ttex255-v1';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();ref=lambda p:{'file':str(p.relative_to(R)),'sha256':sha(p)}
h=np.load(M/'height.npy',allow_pickle=False);old=np.load(I/'height.npy',allow_pickle=False);c=Image.open(M/'color.png').convert('RGB');assert(M/'color.png').read_bytes()==(I/'color.png').read_bytes()
spec=importlib.util.spec_from_file_location('oracle',R/'tests/hexen2_texture_tiers_test.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle);n=oracle.cyclic_normals(h,strength=.3,cap=.5)
ims={'RGB':c,'scalar':Image.fromarray(np.round(h*255).astype('uint8')).convert('RGB'),'XYZ':Image.fromarray(np.round((n*.5+.5)*255).astype('uint8'))}
for name,vector in [('neutralA',[-.55,-.45,.7]),('neutralB',[.55,.45,.7])]:
 v=np.asarray(vector,dtype=float);v/=np.linalg.norm(v);ims[name]=Image.fromarray(np.round(np.clip(.2+.8*np.maximum(0,(n*v).sum(2)),0,1)*255).astype('uint8')).convert('RGB')
for name,im in ims.items():
 im.save(D/f'{name}.png');repeat=Image.new('RGB',(2048,2048))
 for x in (0,1024):
  for y in (0,1024):repeat.paste(im,(x,y))
 repeat.save(D/f'{name}-repeat-1to1.png');repeat.crop((896,0,1152,2048)).save(D/f'{name}-Xjoin-1to1.png');repeat.crop((0,896,2048,1152)).save(D/f'{name}-Yjoin-1to1.png');repeat.crop((768,768,1280,1280)).save(D/f'{name}-corner-1to1.png')
# Actual source feature crops, without rescaling or adaptive contrast.
contact=Image.new('RGB',(1024,824));draw=ImageDraw.Draw(contact)
boxes=[(0,320,256,512),(512,336,768,528),(704,688,960,880),(128,16,384,208)]
for i,box in enumerate(boxes):
 for k,name in enumerate(('RGB','scalar','neutralA','neutralB')):
  contact.paste(ims[name].crop(box),(i*256,24+k*200));draw.text((i*256,k*200+4),f'{i+1} {name} {box}',fill='white')
contact.save(D/'source-physical-features-1to1.png')
witness=json.loads((D.parent/'initial-source-master-HOLD.json').read_text())['physicalSamples'];rows=[]
for pair in witness:
 row={'label':pair['label']}
 for role in ('exposedRockBody','adjacentSnow'):
  box=pair[role]['boxMasterPixels'];x0,y0,x1,y1=box;v=h[y0:y1,x0:x1];before=old[y0:y1,x0:x1];row[role]={'boxMasterPixels':box,'median':float(np.median(v)),'mean':float(v.mean()),'std':float(v.std()),'range':[float(v.min()),float(v.max())],'initialMedian':float(np.median(before)),'initialStd':float(before.std())}
 row['rockMedianAboveSnow']=row['exposedRockBody']['median']>row['adjacentSnow']['median'];rows.append(row)
pockets=json.loads((D.parent/'physical-pocket-topology-review-v5.json').read_text())['pockets'];pr=[]
for p in pockets:
 x0,y0,x1,y1=p['boxMasterPixels'];v=h[y0:y1,x0:x1];pr.append({'id':p['id'],'classification':p['classification'],'boxMasterPixels':p['boxMasterPixels'],'proposedAction':p['proposedElevationAction'],'heightMedian':float(np.median(v)),'range':[float(v.min()),float(v.max())]})
r={'scope':'Actual layered trial diagnostics, not physical acceptance or tier proof','master':ref(M/'master.json'),'RGBExactToInitial':True,'height':ref(M/'height.npy'),'fixedNormalControls':{'strength':.3,'cap':.5},'fixedLights':{'A':[-.55,-.45,.7],'B':[.55,.45,.7],'ambient':.2,'diffuse':.8},'physicalSamples':rows,'pocketSamples':pr,'outputs':[ref(p)for p in sorted(D.glob('*.png'))],'tiersEncoded':0,'limitations':['Normalized scalar has no calibrated millimetre depth.','Plane bounds/samples do not prove natural faceting or seam quality; actual images must be inspected.','Rock scalar detail is reduced by .1 of initial per approved microAmplitude.05; no amplitude adjustment is made by diagnostics.']}
(D/'diagnostic-provenance.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'master':r['master'],'physicalSamples':rows,'pocketSamples':pr},indent=2))
