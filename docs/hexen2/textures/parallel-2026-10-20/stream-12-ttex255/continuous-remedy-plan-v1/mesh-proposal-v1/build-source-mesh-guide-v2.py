"""Planning-only2D connectivity guide. Never evaluates a scalar/height field.

Split the already-reviewed interior rock footprint on three explicitly proposed
source crease lines; share every crease vertex across both neighbouring zones;
ear-clip each zone, then insert source-control vertices. Geometry and proposed
anchor attributes are output for independent review, not a producer recipe.
"""
from pathlib import Path
import collections,datetime,hashlib,json,math
import numpy as np
from PIL import Image,ImageDraw

R=Path.cwd();D=Path(__file__).resolve().parent;P=D.parents[1]/'pre-tier-review'
B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-12-ttex255'
A=D.parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
ref=lambda p:{'file':str(p.relative_to(R)),'sha256':sha(p)}
eps=1e-8
source=json.loads((P/'rock-feature-guide-v6.json').read_text())
outline=next(x for x in source['regions']if x['label']=='V6-R13')
controls=json.loads((A/'pilot-source-controls-v2.json').read_text())['controls']
vertices=[];lookup={};merges=[]

def vertex(xy,label,role,rise):
    xy=np.asarray(xy,dtype=float);key=tuple(round(float(x),9)for x in xy)
    if key in lookup:
        i=lookup[key];assert np.linalg.norm(xy-vertices[i]['xy'])<eps
        assert abs(vertices[i]['rise']-rise)<eps
        vertices[i]['labels'].append(label);merges.append(float(np.linalg.norm(xy-vertices[i]['xy'])))
        return i
    i=len(vertices);lookup[key]=i
    vertices.append({'xy':xy,'labels':[label],'role':role,'rise':float(rise)})
    return i

boundary=[vertex(np.array(x)*8,f'contact-{i:02d}','observed interior rock/snow contact; proposed rise0',0.)for i,x in enumerate(outline['polygon'])]
area=lambda ids:.5*sum(float(np.cross(vertices[a]['xy'],vertices[b]['xy']))for a,b in zip(ids,ids[1:]+ids[:1]))
if area(boundary)<0:boundary.reverse()
lines=[{'id':'C12','abc':np.array([1.,-.30,-495.5]),'anchors':[(400.,.18)]},
       {'id':'C23','abc':np.array([1.,-.35,-524.5]),'anchors':[(390.,.22),(430.,.16)]},
       {'id':'C34','abc':np.array([1.,-.10,-743.]),'anchors':[(460.,.20),(480.,.18)]}]

def side(i,line):
    return float(np.r_[vertices[i]['xy'],1.]@line['abc'])

def clip(poly,line,positive):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        sa,sb=side(a,line),side(b,line)
        ina=sa>=-eps if positive else sa<=eps
        inb=sb>=-eps if positive else sb<=eps
        if ina:out.append(a)
        if ina!=inb:
            t=sa/(sa-sb);xy=vertices[a]['xy']+t*(vertices[b]['xy']-vertices[a]['xy'])
            out.append(vertex(xy,line['id']+'-contact-intersection','shared crease endpoint on observed snow contact; proposed rise0',0.))
    clean=[]
    for i in out:
        if not clean or i!=clean[-1]:clean.append(i)
    if len(clean)>1 and clean[0]==clean[-1]:clean.pop()
    assert len(clean)>=3 and area(clean)>0
    return clean

remaining=boundary;zones=[]
for line in lines:
    zones.append(clip(remaining,line,False));remaining=clip(remaining,line,True)
zones.append(remaining)
assert abs(sum(area(z)for z in zones)-area(boundary))<1e-7

# Crease nodes are created once, then inserted into every incident zone edge.
for line in lines:
    line['nodes']=[]
    for k,(y,rise)in enumerate(line['anchors']):
        a,b,c=line['abc'];x=-(b*y+c)/a
        line['nodes'].append(vertex([x,y],f'{line["id"]}-junction-{k+1}','source face-junction hypothesis, not a snow hole or measured height',rise))

def add_crease_nodes(poly):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        out.append(a);pa,pb=vertices[a]['xy'],vertices[b]['xy'];v=pb-pa
        candidates=[]
        for line in lines:
            if abs(side(a,line))<eps and abs(side(b,line))<eps:
                for i in line['nodes']:
                    t=float((vertices[i]['xy']-pa)@v/(v@v))
                    if eps<t<1-eps:candidates.append((t,i))
        out +=[i for t,i in sorted(candidates)]
    return out
zones=[add_crease_nodes(z)for z in zones]

def cross(a,b,c):
    return float(np.cross(vertices[b]['xy']-vertices[a]['xy'],vertices[c]['xy']-vertices[a]['xy']))

def in_triangle(p,tri):
    a,b,c=[vertices[i]['xy']for i in tri]
    den=float(np.cross(b-a,c-a));assert den>eps
    w1=float(np.cross(p-a,c-a))/den
    w2=float(np.cross(b-a,p-a))/den
    return min(1-w1-w2,w1,w2)>=-eps

def earclip(poly):
    work=poly[:];tri=[]
    while len(work)>3:
        ears=[]
        for j,b in enumerate(work):
            a=work[j-1];c=work[(j+1)%len(work)]
            if cross(a,b,c)<=eps:continue
            if any(in_triangle(vertices[p]['xy'],(a,b,c))for p in work if p not in(a,b,c)):continue
            lengths=[np.linalg.norm(vertices[x]['xy']-vertices[y]['xy'])for x,y in((a,b),(b,c),(c,a))]
            quality=cross(a,b,c)/(max(lengths)**2)
            ears.append((quality,j,(a,b,c)))
        assert ears,'No nondegenerate source-constrained ear; do not discard boundary/crease nodes'
        _,j,t=max(ears);tri.append(t);work.pop(j)
    assert cross(*work)>eps
    return tri+[tuple(work)]

triangles=[];zone_triangles=[]
for zone,poly in enumerate(zones):
    ts=earclip(poly);zone_triangles.append(ts)
    assert abs(sum(cross(*t)/2 for t in ts)-area(poly))<1e-7

control_ids=[]
for c in controls:
    xy=np.array(c['xyMaster'],float)
    # Region assignment is source geometry; no RGB or proposed rise is sampled.
    ss=[float(np.r_[xy,1.]@l['abc'])for l in lines]
    zone=0 if ss[0]<0 else 1 if ss[1]<0 else 2 if ss[2]<0 else 3
    ts=zone_triangles[zone];hits=[j for j,t in enumerate(ts)if in_triangle(xy,t)]
    assert hits,f'Source control{c["id"]} outside its reviewed footprint zone'
    ident=vertex(xy,c['id'],c['sourceFeature']+'; proposed artist anchor, not measured3D',c['semanticRiseProposal'])
    control_ids.append(ident)
    replacement=[]
    for j in hits:
        t=ts[j]
        for a,b in zip(t,t[1:]+t[:1]):
            if cross(a,b,ident)>eps:replacement.append((a,b,ident))
    ts[:]=[t for j,t in enumerate(ts)if j not in hits]+replacement

# Geometry-only constrained Delaunay improvement. Source crease/contact edges
# are zone boundaries and never flip. Scalar attributes are not consulted.
flip_counts=[]
for ts in zone_triangles:
    flips=0
    while True:
        adjacency=collections.defaultdict(list)
        for j,t in enumerate(ts):
            for a,b in zip(t,t[1:]+t[:1]):adjacency[tuple(sorted((a,b)))].append(j)
        changed=False
        for edge,incident in sorted(adjacency.items()):
            if len(incident)!=2:continue
            j,k=incident;a,b=edge
            c=next(i for i in ts[j] if i not in edge)
            d=next(i for i in ts[k] if i not in edge)
            if cross(a,b,c)<0:a,b=b,a
            if cross(a,b,d)>=-eps:continue
            if cross(c,d,a)*cross(c,d,b)>=-eps:continue
            if tuple(sorted((c,d))) in adjacency:continue
            dd=vertices[d]['xy']
            points=[vertices[i]['xy']-dd for i in(a,b,c)]
            matrix=np.array([[x,y,x*x+y*y]for x,y in points])
            if np.linalg.det(matrix)<=1e-6:continue
            new=[]
            for candidate in((c,d,a),(d,c,b)):
                if cross(*candidate)<0:candidate=(candidate[1],candidate[0],candidate[2])
                assert cross(*candidate)>eps
                new.append(candidate)
            ts[j],ts[k]=new;flips+=1;changed=True
            assert flips<5000,'Bounded geometry-only flip limit reached'
            break
        if not changed:break
    flip_counts.append(flips)

for zone,ts in enumerate(zone_triangles):
    for t in ts:triangles.append({'vertices':list(t),'sourceZone':zone+1})

# Independent topology/area contracts; scalar interpolation is not performed.
edges=collections.defaultdict(list)
for j,t in enumerate(triangles):
    ids=t['vertices'];assert cross(*ids)>eps
    for a,b in zip(ids,ids[1:]+ids[:1]):edges[tuple(sorted((a,b)))].append(j)
assert max(map(len,edges.values()))==2
outer_edges=[e for e,ts in edges.items()if len(ts)==1]
assert all(abs(vertices[a]['rise'])<eps and abs(vertices[b]['rise'])<eps for a,b in outer_edges)
assert len(vertices)-len(edges)+len(triangles)==1
assert abs(sum(cross(*t['vertices'])/2 for t in triangles)-area(boundary))<1e-7
assert set(range(len(vertices)))=={i for t in triangles for i in t['vertices']}
crease_edges=[]
for line in lines:
    ee=[e for e in edges if abs(side(e[0],line))<eps and abs(side(e[1],line))<eps]
    assert len(ee)==len(line['nodes'])+1
    assert all(len(edges[e])==2 for e in ee)
    crease_edges +=[{'crease':line['id'],'vertices':list(e),'incidentSourceZones':sorted({triangles[t]['sourceZone']for t in edges[e]})}for e in ee]
assert all(0<=v['rise']<=.24 for v in vertices)
verts=[{'id':i,'xyMaster':v['xy'].tolist(),'xyNativeReference':(v['xy']/8).tolist(),'relativeRiseProposal':v['rise'],'sourceLabels':v['labels'],'anchorRole':v['role']}for i,v in enumerate(vertices)]
mesh={'schemaVersion':1,'status':'SOURCE_SPECIFIC_PILOT_MESH_PROPOSAL_ONLY; NO_HEIGHT_FIELD','sourceRGB':ref(B/'masters/ttex255-v1/color.png'),'sourceFootprint':{'guide':ref(P/'rock-feature-guide-v6.json'),'region':'V6-R13','boundaryVertexIds':boundary,'areaMasterPixels':area(boundary)},'sourceControlFile':ref(A/'pilot-source-controls-v2.json'),'referenceSize':[128,128],'masterSize':[1024,1024],'vertices':verts,'triangles':triangles,'sourceZoneBoundaryVertices':zones,'sourceCreaseEdges':crease_edges,'planningValidation':{'vertices':len(vertices),'triangles':len(triangles),'edges':len(edges),'boundaryEdges':len(outer_edges),'eulerDisk':len(vertices)-len(edges)+len(triangles),'positiveTriangleAreas':True,'triangleAreaSumEqualsFootprint':True,'exactSharedVertexIds':True,'sourceCreasesSharedByBothZones':True,'maximumCoincidentVertexMergeError':max(merges,default=0.),'anchorRange':[0,.24],'constrainedInterpolationFlipCounts':flip_counts,'sourceBoundaryCreasesAndAllAnchorAttributesUnchangedFromV1':True},'physicalUncertainty':['All rises are artistic proposals; source coordinates/features are not recovered3D.','Three crease lines approximate visible mineral face-junction directions; source fit needs independent review.','Boundary0means this strictly interior pilot contact meets snow; this is NOT an image-edge rule for full texture.','Interpolation-only mesh edges are not asserted to be physical fracture lines. Any spurious neutral crease must fail later actual pilot.','This is geometric planning only. No scalar, normal, proposed wrapper or tier has been implemented.']}
(D/'pilot-mesh-v2.json').write_text(json.dumps(mesh,indent=2)+'\n')
image=Image.open(B/'masters/ttex255-v1/color.png').convert('RGB');draw=ImageDraw.Draw(image)
creases={tuple(sorted(x['vertices']))for x in crease_edges}
for edge in edges:
    a,b=edge;colour=(255,225,0)if edge in creases else(100,150,170)
    draw.line([tuple(vertices[a]['xy']),tuple(vertices[b]['xy'])],fill=colour,width=2 if edge in creases else 1)
for i in control_ids+sum((l['nodes']for l in lines),[]):
    x,y=vertices[i]['xy'];draw.ellipse((x-2,y-2,x+2,y+2),fill='red');draw.text((x+3,y-3),vertices[i]['labels'][0],fill='white')
image.crop((496,320,912,560)).save(D/'source-mesh-wire-overlay-v2-1to1.png')
print(json.dumps({'mesh':ref(D/'pilot-mesh-v2.json'),'validation':mesh['planningValidation']},indent=2))
