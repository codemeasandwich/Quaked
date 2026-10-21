"""Summarize already reconstructed immutable ownership labels only."""
from pathlib import Path
import json,hashlib,math,collections
import numpy as np
ROOT=Path(__file__).resolve().parents[8];DOC=Path(__file__).resolve().parent
w=lambda p:{'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
proof=DOC/'raster-diagnosis.json';j=json.loads(proof.read_bytes());path=DOC/'ownership-labels-uint8.npy';a=np.load(path,allow_pickle=False);assert hashlib.sha256(a.tobytes()).hexdigest()==j['ownershipLabelBytesSHA256'];owners=j['ownerOrder'];counts=collections.Counter()
for axis in(0,1):
 b=np.roll(a,-1,axis)
 for first in range(4):
  for second in range(first+1,4):counts[owners[first]+'/'+owners[second]]+=int(np.count_nonzero(((a==first)&(b==second))|((a==second)&(b==first))))
lonely=(a==1)&(np.roll(a,1,0)!=1)&(np.roll(a,-1,0)!=1)&(np.roll(a,1,1)!=1)&(np.roll(a,-1,1)!=1);points=[]
for y,x in zip(*np.where(lonely)):
 x,y=int(x),int(y);neighbours=[]
 for name,nx,ny in[('W',(x-1)%512,y),('E',(x+1)%512,y),('N',x,(y-1)%512),('S',x,(y+1)%512)]:neighbours.append({'direction':name,'pixel':[nx,ny],'owner':owners[int(a[ny,nx])]})
 distances={}
 for name,(jx,jy)in j['junctionsCanonical'].items():
  dx=abs((x+.5-jx+256)%512-256);dy=abs((y+.5-jy+256)%512-256);distances[name]={'torusEuclideanPixelCentre':math.hypot(dx,dy),'torusLinfPixelCentre':max(dx,dy)}
 points.append({'pixel':[x,y],'owner':'X','fourNeighbours':neighbours,'nearestJunction':min(distances,key=lambda k:distances[k]['torusEuclideanPixelCentre']),'junctionDistances':distances})
assert len(points)==1 and points[0]['pixel']==[30,465]
patches={}
for name,(jx,jy)in j['junctionsCanonical'].items():
 x,y=math.floor(jx),math.floor(jy);patches[name]={'junction':[jx,jy],'columnIndices':[(x+dx)%512 for dx in range(-2,3)],'rows':[{'y':(y+dy)%512,'owners':''.join(owners[int(a[(y+dy)%512,(x+dx)%512])]for dx in range(-2,3))}for dy in range(-2,3)]}
report={'schemaVersion':1,'verdict':'DIAGNOSIS: two local opposite-owner alias edges and one actual disconnected X cell; current topology remains HOLD','rasterProof':w(proof),'labels':w(path),'allDifferentOwnerNeighbourEdgeCounts':dict(counts),'isolatedXCells':points,'declaredJunction5x5OwnerCells':patches,'forbiddenEdgeClusters':{'components':2,'edgesPerComponent':[1,1],'maximumNearestJunctionDistance':.5,'distanceMetric':'Euclidean torus distance from the declared junction to closed unit segment joining neighbouring pixel centres; both edge midpoint distances also .5.'},'classification':'Localized pixel-centre/staircase alias within one texel of declared mp/pm four-owner junctions, not a long wrong-owner boundary. It remains a substantive digital topology failure because one X cell is disconnected under the unchanged four-neighbour torus rule.','notAnExceptionGrant':'No labels, priorities, graph arcs, exception cell, support chart, guard or journal was changed. Existing(24,41) P-owned exception remains the only declared exception. This diagnosis is not a proposal to permit isolated cells or waive connectivity.','nextOwner':'Root coordinator and independent digital-junction planner','nextAction':'Decide a separately reviewed exact digital-junction representation policy or retain HOLD. No actual replay/search/composite or label correction is authorized by these metrics.','tool':w(Path(__file__))}
with(DOC/'component-and-contact-details.json').open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'report':w(DOC/'component-and-contact-details.json'),'allBoundaryCounts':dict(counts),'isolatedX':points},indent=2))
