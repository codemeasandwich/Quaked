"""Author geometry-only verification, separate from mesh construction.

No scalar, normal, RGB finishing or producer implementation. Shared scalar
attributes are inspected as bounded recipe data; no height field is evaluated.
"""
from pathlib import Path
import collections,hashlib,json,math
import numpy as np
from PIL import Image
R=Path.cwd();D=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
ref=lambda p:{'file':str(p.relative_to(R)),'sha256':sha(p)}
m=json.loads((D/'pilot-mesh-v2.json').read_text());old=json.loads((D/'pilot-mesh-v1.json').read_text());v=np.array([x['xyMaster']for x in m['vertices']]);z=np.array([x['relativeRiseProposal']for x in m['vertices']]);tri=np.array([x['vertices']for x in m['triangles']],dtype=int)
assert m['vertices']==old['vertices'] and m['sourceCreaseEdges']==old['sourceCreaseEdges']
assert all(0<=x<=.24 for x in z);assert len({tuple(t)for t in np.sort(tri,axis=1)})==len(tri)
cross=lambda a,b:float(a[0]*b[1]-a[1]*b[0])
area2=lambda a,b,c:cross(b-a,c-a)
areas=np.array([area2(v[a],v[b],v[c])/2 for a,b,c in tri]);assert areas.min()>1e-8
outline=v[m['sourceFootprint']['boundaryVertexIds']]
polyarea=abs(sum(cross(a,b)for a,b in zip(outline,np.roll(outline,-1,axis=0))))/2
edges=collections.defaultdict(list)
for i,t in enumerate(tri):
 for a,b in zip(t,np.roll(t,-1)):edges[tuple(sorted((int(a),int(b))))].append(i)
assert all(1<=len(x)<=2 for x in edges.values())
outer=[e for e,ts in edges.items()if len(ts)==1];degree=collections.Counter(i for e in outer for i in e);assert set(degree.values())=={2}

def on_segment(p,a,b,strict=False):
 ab=b-a;t=float((p-a)@ab/(ab@ab))
 return abs(cross(ab,p-a))<=1e-6 and ((1e-8<t<1-1e-8)if strict else(-1e-8<=t<=1+1e-8))

def boundary_segment(a,b):
 return any(on_segment(a,x,y)and on_segment(b,x,y)for x,y in zip(outline,np.roll(outline,-1,axis=0)))
assert all(boundary_segment(v[a],v[b])for a,b in outer)
perimeter=sum(np.linalg.norm(b-a)for a,b in zip(outline,np.roll(outline,-1,axis=0)))
assert abs(sum(np.linalg.norm(v[a]-v[b])for a,b in outer)-perimeter)<1e-6
assert abs(areas.sum()-polyarea)<1e-6
# All interior mesh edges must be manifold and incident triangles connected.
adj=[set()for _ in tri]
for ts in edges.values():
 if len(ts)==2:adj[ts[0]].add(ts[1]);adj[ts[1]].add(ts[0])
seen={0};todo=[0]
while todo:
 i=todo.pop()
 for j in adj[i]-seen:seen.add(j);todo.append(j)
assert len(seen)==len(tri) and len(v)-len(edges)+len(tri)==1
edge_list=list(edges)
proper_crossings=0
for i,(a,b)in enumerate(edge_list):
 for c,d in edge_list[i+1:]:
  if len({a,b,c,d})<4:continue
  if area2(v[a],v[b],v[c])*area2(v[a],v[b],v[d])<-1e-8 and area2(v[c],v[d],v[a])*area2(v[c],v[d],v[b])<-1e-8:proper_crossings+=1
assert proper_crossings==0
junctions=[]
for a,b in edge_list:
 for j,p in enumerate(v):
  if j not in(a,b)and on_segment(p,v[a],v[b],True):junctions.append([j,a,b])
assert not junctions
# Independent centre-sample occupancy oracle: polygon ray crossings versus
# triangle half-plane tests. Inclusion ties are identified, not mistaken for area overlap.
x0,y0=np.floor(outline.min(0)).astype(int);x1,y1=np.ceil(outline.max(0)).astype(int)
yy,xx=np.mgrid[y0:y1,x0:x1];pts=np.c_[xx.ravel()+.5,yy.ravel()+.5]
inside=np.zeros(len(pts),dtype=bool);boundary=np.zeros(len(pts),dtype=bool)
for a,b in zip(outline,np.roll(outline,-1,axis=0)):
 ab=b-a;q=pts-a;t=q@ab/(ab@ab);boundary|=(np.abs(ab[0]*q[:,1]-ab[1]*q[:,0])<1e-7)&(t>=-1e-8)&(t<=1+1e-8)
 if abs(b[1]-a[1])>1e-12:
  hit=(a[1]>pts[:,1])!=(b[1]>pts[:,1]);at=a[0]+(pts[:,1]-a[1])*(b[0]-a[0])/(b[1]-a[1]);inside^=hit&(pts[:,0]<at)
inside|=boundary;count=np.zeros(len(pts),dtype=int)
for t in tri:
 a,b,c=v[t];q=pts-a;s0=(b[0]-a[0])*q[:,1]-(b[1]-a[1])*q[:,0];q=pts-b;s1=(c[0]-b[0])*q[:,1]-(c[1]-b[1])*q[:,0];q=pts-c;s2=(a[0]-c[0])*q[:,1]-(a[1]-c[1])*q[:,0];count+=(s0>=-1e-7)&(s1>=-1e-7)&(s2>=-1e-7)
assert np.array_equal(count>0,inside)
ties=pts[count>1]
assert all(any(on_segment(p,v[a],v[b])for a,b in edges if len(edges[(a,b)])==2)for p in ties)
# Geometry-only all-contact triangles expose support questions before height work.
zero=np.all(z[tri]==0,axis=1);centroids=v[tri].mean(1)

def contact_distance(p):
 ds=[]
 for a,b in zip(outline,np.roll(outline,-1,axis=0)):
  ab=b-a;t=np.clip(float((p-a)@ab/(ab@ab)),0,1);ds.append(np.linalg.norm(p-(a+t*ab)))
 return float(min(ds))
zero_dist=[contact_distance(p)for p in centroids[zero]]
creases=[]
for c in m['sourceCreaseEdges']:
 e=tuple(sorted(c['vertices']));assert len(edges[e])==2
 wanted={'C12':[1,2],'C23':[2,3],'C34':[3,4]}[c['crease']]
 assert sorted(m['triangles'][j]['sourceZone']for j in edges[e])==wanted
 creases.append(c)
r={'schemaVersion':1,'verdict':'PASS author geometry/topology/source-footprint checks ONLY; independent physical design review remains','mesh':ref(D/'pilot-mesh-v2.json'),'sourceWireframe':ref(D/'source-mesh-wire-overlay-v2-1to1.png'),'vertices':len(v),'triangles':len(tri),'sourceFootprintArea':polyarea,'summedTriangleArea':float(areas.sum()),'areaDifference':float(areas.sum()-polyarea),'positiveAreas':True,'manifoldEdges':True,'oneConnectedDiskNoHoles':True,'exactSourceBoundarySubsegmentsAndPerimeter':True,'properEdgeCrossings':proper_crossings,'unsharedTJunctions':len(junctions),'pixelCentresChecked':len(pts),'pixelFootprintMatchesSourcePolygonExactly':True,'sharedEdgeTieSamples':len(ties),'sharedCreaseSubsegments':creases,'allVerticesAnchorsAndCreasesUnchangedFromV1':True,'maximumProposedRise':float(z.max()),'minimumProposedRise':float(z.min()),'allContactAnchorTriangles':{'count':int(zero.sum()),'area':float(areas[zero].sum()),'areaFraction':float(areas[zero].sum()/areas.sum()),'maximumCentroidDistanceFromContact':max(zero_dist,default=0.),'meaning':'Retained geometry-only support uncertainty, not a physical PASS. Any flat mineral interior or spurious interpolation ridge must fail the later actual pilot.'},'noScalarHeightOrNormalFieldEvaluated':True,'verificationScript':ref(Path(__file__))}
(D/'mesh-geometry-verification-v2.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:r[k]for k in('verdict','vertices','triangles','areaDifference','properEdgeCrossings','unsharedTJunctions','pixelCentresChecked','pixelFootprintMatchesSourcePolygonExactly','sharedEdgeTieSamples','allContactAnchorTriangles')},indent=2))
