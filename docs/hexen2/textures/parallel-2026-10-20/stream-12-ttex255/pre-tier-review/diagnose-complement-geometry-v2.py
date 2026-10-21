"""Diagnostic vector-complement proposal, not a height producer or final recipe.

Convert hand-authored upper-rock polygons to lower-snow polygons accepted by
unchanged brick_mask. Sweep vertex-x slabs, union vertical rock intervals,
then merge adjacent snow trapezoids only across unique matching boundaries.
No image colour classifier, relief computation or canonical output.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
import sys
R=Path.cwd();D=Path(__file__).resolve().parent
sys.path.insert(0,str(R/'tools/texture_sheets'))
from update_level_sheets import brick_mask
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
g=json.loads((D/'rock-feature-guide-v1.json').read_text());ps=[v['polygon']for v in g['regions']];W,H=g['referenceSize'];eps=1e-8
xs={0.,float(W),*(float(p[0])for poly in ps for p in poly)}
edges=[(np.array(a,dtype=float),np.array(b,dtype=float))for poly in ps for a,b in zip(poly,poly[1:]+poly[:1])]
for i,(a,b)in enumerate(edges):
 for c,d in edges[i+1:]:
  u=b-a;v=d-c;den=float(np.cross(u,v))
  if abs(den)<eps:continue
  t=float(np.cross(c-a,v))/den;s=float(np.cross(c-a,u))/den
  if eps<t<1-eps and eps<s<1-eps:xs.add(float((a+t*u)[0]))
xs=sorted(xs)
active=[];finished=[];slabs=0
for x0,x1 in zip(xs,xs[1:]):
 if x1-x0<eps:continue
 xm=(x0+x1)/2;intervals=[]
 for poly in ps:
  crossings=[]
  for (ax,ay),(bx,by)in zip(poly,poly[1:]+poly[:1]):
   if min(ax,bx)<xm<max(ax,bx):
    f=lambda x:ay+(x-ax)*(by-ay)/(bx-ax)
    crossings.append((f(xm),f(x0),f(x1)))
  crossings.sort();assert len(crossings)%2==0
  intervals +=[(crossings[i],crossings[i+1])for i in range(0,len(crossings),2)]
 intervals.sort(key=lambda z:z[0][0]);merged=[]
 for lo,hi in intervals:
  if merged and lo[0]<=merged[-1][1][0]+eps:
   if hi[0]>merged[-1][1][0]:merged[-1]=(merged[-1][0],hi)
  else:merged.append((lo,hi))
 gaps=[];previous=(0.,0.,0.)
 for lo,hi in merged+[((float(H),)*3,(float(H),)*3)]:
  if lo[0]>previous[0]+eps:gaps.append({'top':[(x0,previous[1]),(x1,previous[2])],'bottom':[(x0,lo[1]),(x1,lo[2])]})
  previous=hi
 nextactive=[];used=set()
 for gap in gaps:
  candidates=[i for i,a in enumerate(active)if abs(a['top'][-1][1]-gap['top'][0][1])<eps and abs(a['bottom'][-1][1]-gap['bottom'][0][1])<eps]
  if len(candidates)==1 and candidates[0]not in used and len(active[candidates[0]]['top'])+len(active[candidates[0]]['bottom'])<58:
   i=candidates[0];used.add(i);a=active[i];a['top']+=gap['top'][1:];a['bottom']+=gap['bottom'][1:];nextactive.append(a)
  else:nextactive.append(gap)
 finished +=[a for i,a in enumerate(active)if i not in used];active=nextactive;slabs+=1
finished+=active

def simplify(p):
 out=[]
 for q in p:
  if not out or np.linalg.norm(np.array(q)-out[-1])>eps:out.append(q)
 changed=True
 while changed and len(out)>3:
  changed=False
  for i in range(len(out)):
   a,b,c=np.array(out[i-1]),np.array(out[i]),np.array(out[(i+1)%len(out)])
   if abs(np.cross(b-a,c-b))<eps:out.pop(i);changed=True;break
 return [[float(x),float(y)]for x,y in out]
regions=[{'polygon':simplify(a['top']+list(reversed(a['bottom'])))}for a in finished]
assert len(regions)<=256 and all(3<=len(r['polygon'])<=64 for r in regions)
mask=brick_mask((1024,1024),{'referenceSize':[W,H],'brickRegions':regions})
rock=Image.new('L',(1024,1024));dr=ImageDraw.Draw(rock)
for p in ps:dr.polygon([(x*8,y*8)for x,y in p],fill=255)
ideal=1-np.asarray(rock)/255;changed=mask!=ideal
Image.fromarray(np.round(mask*255).astype('uint8')).save(D/'snow-complement-draft-v2.png')
Image.fromarray(np.where(changed,255,0).astype('uint8')).save(D/'snow-complement-raster-difference-v2.png')
report={'schemaVersion':1,'status':'DRAFT geometric representability only; no corrected height authored','sourceGuide':{'file':str((D/'rock-feature-guide-v1.json').relative_to(R)),'sha256':sha(D/'rock-feature-guide-v1.json')},'referenceSize':[W,H],'brickRegions':regions,'regionCount':len(regions),'maximumPolygonVertices':max(len(r['polygon'])for r in regions),'vertexXSlabs':slabs,'lowerSnowCoverage':float(mask.mean()),'rasterDifferenceFromComplementOfUpperPolygonFill':int(changed.sum()),'rasterDifferenceFraction':float(changed.mean()),'limits':['This proves bounded polygon representability, not material mask accuracy. Original source draft remains unqualified.','Shared polygon boundary fill/rasterization can differ from logical inverse because PIL includes polygon edges. Actual overlay and bounded interface review required before final recipe.','No threshold colour classification, procedural detail or height producer; existing brick_mask is used unchanged.']}
(D/'snow-complement-geometry-draft-v2.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in ('status','regionCount','maximumPolygonVertices','lowerSnowCoverage','rasterDifferenceFromComplementOfUpperPolygonFill','rasterDifferenceFraction')},indent=2))
