import pathlib,json,hashlib
import numpy as np
from PIL import Image
R=pathlib.Path('/Users/bri/SOURCE/Quaked');B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008';O=pathlib.Path('/private/tmp/h2-batch008-mortar-art');it=json.loads((B/'batch-mortar-candidate.json').read_text())['items'][0]
p=R/'docs/hexen2/textures/batch-008-ttex153-layered-semantic-public-review.json';semantic=json.loads(p.read_text())['materials'][0];out={'semanticSourceProof':{'file':str(p.relative_to(R)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()},'coordinateConvention':'Native edge coordinates multiplied by factor, floored to tier pixel; radius1 decoded L-height patch, all values divided by255. Independent reviewer visually confirmed J1/2/3 in existing joint network, F neighbors on limestone and drip1/2/3 pale face deposits on upper surface.','tiers':{}}
for tier,q in it['tiers'].items():
 a=np.asarray(Image.open(R/q['files']['height']).convert('L'),float)/255;f=q['factor'];rows={}
 for k,v in semantic['classifiedWitnesses'].items():
  x,y=v['nativeEdgeCoordinates'];xx=int(x*f);yy=int(y*f);v=a[yy-1:yy+2,xx-1:xx+2];rows[k]={'nativeEdgeCoordinates':[x,y],'tierPixel':[xx,yy],'mean':float(v.mean()),'min':float(v.min()),'max':float(v.max())}
 comparisons=[]
 for j in range(1,4):
  joint=rows['J'+str(j)];faces=[rows['F'+str(j)+s] for s in 'AB'];comparisons.append({'joint':'J'+str(j),'jointMean':joint['mean'],'faceMeans':[v['mean'] for v in faces],'fullPatchRangesOrdered':all(joint['max']<v['min'] for v in faces)})
 assert all(v['fullPatchRangesOrdered'] for v in comparisons)
 out['tiers'][tier]={'heightFile':q['files']['height'],'heightSHA256':hashlib.sha256((R/q['files']['height']).read_bytes()).hexdigest(),'samples':rows,'comparisons':comparisons,'allFaceDepositMeansAboveAllMortarMeans':min(rows['drip'+str(j)]['mean'] for j in range(1,4))>max(rows['J'+str(j)]['mean'] for j in range(1,4))}
(O/'decoded-semantic-witnesses.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v['comparisons'] for k,v in out['tiers'].items()},indent=2))
