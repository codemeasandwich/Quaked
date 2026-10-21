"""Independent source-free diagnosis of retained388 graph/raster failure.

Only pinned vector arcs and pure frozen graph/raster functions are used. No DP,
source pixels, actual replay entry point, journal update, label change or composite.
"""
from pathlib import Path
from fractions import Fraction as F
import importlib.util
import sys,json,hashlib,math,collections,datetime
import numpy as np
from PIL import Image,ImageDraw
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[8]
DOC=Path(__file__).resolve().parent
PLAN=DOC.parent
IMPL=PLAN/'implementation-v1'
REPLAY=PLAN/'geometry-replay-v1'
SIDE=512
PINS={
 REPLAY/'actual-v1/failure.json':'40383c8b03ebd252e07683332c69529175c61f7a4df9b2fe6f5c05777ded7d77',
 REPLAY/'geometry_replay.py':'c61d1783ee113f407bf7cd556479a884ced69f71ddbeab63b297e9c2d1da7599',
 REPLAY/'discarded_tail.py':'76a5975d46b7b0f12119f989af277f900201fe3e7296193ccbb4eb6bbc097156',
 IMPL/'anchor_bridge.py':'e96b3e14ebb272a5ce09c0f476ec75dbfb8786f089cd8053d1b0443ad15c61eb',
 IMPL/'atlas_geometry.py':'f5ccdc8a13e250e845af1ce7ed23ba8481276b3b27d7f160215b3ad2f5540d55',
 IMPL/'junction_diagnostic.py':'0546f4aed89e9ba2f557956dfd5ab4efb7713b70a51cc7dee470a39918c430b3',
 IMPL/'actual-continuation-journal.json':'e557ecdfbfed70ee0c5dde6260bc2730057df0336a9fd60099e85ef1fb4fc696',
 IMPL/'actual-failure-v1/failure.json':'8ec1a04118a20f02787fbafa8db6546eac8bd150f9a19599b893e1d13622aee9'
}
def sha(data):return hashlib.sha256(data).hexdigest()
def witness(p):return {'file':str(p.relative_to(ROOT)),'sha256':sha(p.read_bytes())}
def serial(v):
 if isinstance(v,F):return int(v)if v.denominator==1 else {'numerator':v.numerator,'denominator':v.denominator}
 if isinstance(v,dict):return {str(k):serial(x)for k,x in v.items()}
 if isinstance(v,(tuple,list)):return [serial(x)for x in v]
 return v
watched={p:p.read_bytes()for p in PINS}
assert all(sha(data)==PINS[p]for p,data in watched.items())
journal_path=REPLAY/'geometry-replay-journal.json'
watched[journal_path]=journal_path.read_bytes()
journal=json.loads(watched[journal_path])
assert journal['state']=='FAILED_GEOMETRY_ONLY_ART_F1_HOLD'and journal['newDPStates']==0 and journal['failureSha256']==PINS[REPLAY/'actual-v1/failure.json']
protected054=ROOT/'docs/hexen2/textures/parallel-2026-10-20/stream-17-rtex054'
hold054=json.loads((protected054/'PHYSICAL_HOLD_FREEZE.json').read_bytes())
plan054=json.loads((protected054/'analytic-cap-plan-v1/plan-handoff.json').read_bytes())
for rel,h in {**hold054['frozenInputs'],**plan054['frozenPlanInputs']}.items():assert sha((ROOT/rel).read_bytes())==h
sys.path.insert(0,str(IMPL))
spec=importlib.util.spec_from_file_location('atlas_geometry',IMPL/'atlas_geometry.py')
geo=importlib.util.module_from_spec(spec);sys.modules[spec.name]=geo;spec.loader.exec_module(geo)
assert Path(sys.modules['anchor_bridge'].__file__).resolve()==IMPL/'anchor_bridge.py'
from anchor_bridge import ordinate
failure=json.loads(watched[REPLAY/'actual-v1/failure.json'])
def rational(v):
 if isinstance(v,dict):assert set(v)=={'numerator','denominator'};return F(v['numerator'],v['denominator'])
 assert type(v)is int;return F(v)
arcs=[{'id':a['id'],'owners':tuple(a['owners']),'points':[tuple(rational(x)for x in p)for p in a['points']]}for a in failure['vectorArcs']]
assert len(arcs)==16
byid={a['id']:a for a in arcs}
low=ordinate(byid['capY-']['points'],F(1,2),0)
high=ordinate(byid['capY+']['points'],F(1,2),0)
assert (low,high)==(F(-41),F(35))
graph,edges=geo.validate_graph(arcs)
def seed(cy):
 signed=cy-512 if cy>=256 else cy
 return 'C'if low<signed<high else'X'
labels=geo.rasterize(edges,seed)
assert labels.shape==(512,512)and labels.dtype==np.uint8
original_label_hash=sha(labels.tobytes())
exception=(24,41)
assert int(labels[41,24])==0
owners=geo.OWNERS
junctions={name:tuple(float(v%512)for v in xy)for name,xy in geo.JUNCTIONS.items()}
def distance(edge,name):
 # Unwrapped unit segment joining the two pixel centres in the enumerated +axis.
 x,y=edge['pixel'];axis=0 if edge['direction']=='E'else 1
 a=np.array([x+.5,y+.5]);b=a.copy();b[axis]+=1
 midpoint=(a+b)/2;j=np.array(junctions[name]);best=float('inf');best_mid=float('inf');best_linf=float('inf')
 for dx in(-512,0,512):
  for dy in(-512,0,512):
   p=j+np.array([dx,dy]);t=np.clip(p[axis]-a[axis],0,1);q=a.copy();q[axis]+=t
   best=min(best,float(np.linalg.norm(p-q)));best_mid=min(best_mid,float(np.linalg.norm(p-midpoint)));best_linf=min(best_linf,float(np.max(np.abs(p-midpoint))))
 return {'torusDistanceToClosedPixelCentreSegment':best,'torusDistanceToEdgeMidpoint':best_mid,'torusLinfDistanceToMidpoint':best_linf}
forbidden=[];declared=[];all_contact_counts=collections.Counter()
for direction,shift,axis in [('E',-1,1),('S',-1,0)]:
 other=np.roll(labels,shift,axis)
 for first,second in[(0,3),(1,2)]:
  bad=((labels==first)&(other==second))|((labels==second)&(other==first))
  for y,x in zip(*np.where(bad)):
   x,y=int(x),int(y);nx,ny=((x+1)%512,y)if direction=='E'else(x,(y+1)%512)
   row={'pixel':[x,y],'neighbour':[nx,ny],'direction':direction,'owners':[owners[int(labels[y,x])],owners[int(labels[ny,nx])]],'pair':'P/C'if first==0 else'X/Y'}
   row['distances']={name:distance(row,name)for name in junctions};row['nearestJunction']=min(junctions,key=lambda name:row['distances'][name]['torusDistanceToClosedPixelCentreSegment']);all_contact_counts[row['pair']]+=1
   (declared if exception in ((x,y),(nx,ny))else forbidden).append(row)
# Independent4-neighbour component census on the unmodified torus labels.
seen=np.zeros_like(labels,dtype=bool);components={name:[]for name in owners}
for y,x in zip(*np.where(~seen)):
 y,x=int(y),int(x)
 if seen[y,x]:continue
 label=int(labels[y,x]);todo=[(y,x)];seen[y,x]=True;count=0
 while todo:
  yy,xx=todo.pop();count+=1
  for ny,nx in[((yy+1)%512,xx),((yy-1)%512,xx),(yy,(xx+1)%512),(yy,(xx-1)%512)]:
   if not seen[ny,nx]and int(labels[ny,nx])==label:seen[ny,nx]=True;todo.append((ny,nx))
 components[owners[label]].append(count)
for name in components:components[name].sort(reverse=True)
# All source charts checked arithmetically without source image/material access.
y,x=np.mgrid[:512,:512];u=np.where(x>=256,x-512,x);v=np.where(y>=256,y-512,y)
sx=x.copy();sy=y.copy()
sx[np.isin(labels,[1,3])]=(384+u)[np.isin(labels,[1,3])]
sy[np.isin(labels,[2,3])]=(128+v)[np.isin(labels,[2,3])]
chart_escape=((labels==1)&((u< -48)|(u>=48)))|((labels==2)&((v< -48)|(v>=48)))|((labels==3)&((u< -48)|(u>=48)|(v< -48)|(v>=48)))
source_bounds=(sx<0)|(sx>=512)|(sy<0)|(sy>=512)
wrap_x_agrees=np.array_equal(labels[:,0],labels[:,-1]);wrap_y_agrees=np.array_equal(labels[0],labels[-1])
wrap_x_delta=np.c_[sx[:,0]-sx[:,-1],sy[:,0]-sy[:,-1]]
wrap_y_delta=np.c_[sx[0]-sx[-1],sy[0]-sy[-1]]
checks={'protectedRectangle':[48,48,464,464],'protectedPixelCount':416*416,'protectedPViolations':int(np.count_nonzero(labels[48:464,48:464]!=0)),
 'strictXAdjacentWrapOwnerFamilyAgreement':bool(wrap_x_agrees),'strictYAdjacentWrapOwnerFamilyAgreement':bool(wrap_y_agrees),
 'exposedXOwnerFamilies':sorted({owners[int(i)]for i in labels[:,0]}),'exposedYOwnerFamilies':sorted({owners[int(i)]for i in labels[0]}),
 'XWrapSourceAdjacentViolations':int(np.count_nonzero(np.any(wrap_x_delta!=np.array([1,0]),axis=1))),
 'YWrapSourceAdjacentViolations':int(np.count_nonzero(np.any(wrap_y_delta!=np.array([0,1]),axis=1))),
 'fixedHalfOpenChartEscapePixels':int(chart_escape.sum()),'sourceBoundsEscapePixels':int(source_bounds.sum()),
 'PSourceIdentityViolations':int(np.count_nonzero((labels==0)&((sx!=x)|(sy!=y)))),
 'declaredExceptionPixel':[24,41],'declaredExceptionOwner':owners[int(labels[41,24])],
 'allFourRegions4ConnectedOnTorus':all(len(c)==1 for c in components.values()),'componentPixelCounts':components}
# Recheck frozen raster guard only to confirm the same failure, without any label edit.
try:geo.validate_raster(labels);guard_result='Unexpected PASS'
except Exception as e:guard_result=repr(e)
assert guard_result=="GuardError('Forbidden opposite-owner raster contact')"
np.save(DOC/'ownership-labels-uint8.npy',labels,allow_pickle=False)
colours=np.array([[82,160,110],[65,120,215],[215,175,65],[154,92,195]],dtype='uint8')
image=Image.fromarray(colours[labels]);image.save(DOC/'ownership-atlas-source-free.png')
# Diagnostic junction crops use label colours/letters only; no source material pixels.
canvas=Image.new('RGB',(1024,560),(24,26,29));draw=ImageDraw.Draw(canvas)
for i,(name,(jx,jy))in enumerate(junctions.items()):
 px=(i%2)*512;py=(i//2)*280;cx,cy=math.floor(jx),math.floor(jy);draw.text((px+4,py+4),name+' junction '+str([jx,jy])+'; unchanged label cells',fill='white')
 for dy in range(-7,8):
  for dx in range(-7,8):
   xx,yy=(cx+dx)%512,(cy+dy)%512;xx0=px+8+(dx+7)*16;yy0=py+30+(dy+7)*16;label=int(labels[yy,xx]);draw.rectangle((xx0,yy0,xx0+15,yy0+15),fill=tuple(colours[label]));draw.text((xx0+3,yy0+2),owners[label],fill='white')
 for edge in forbidden+declared:
  for xx,yy in[edge['pixel'],edge['neighbour']]:
   dx=((xx-cx+256)%512)-256;dy=((yy-cy+256)%512)-256
   if -7<=dx<=7 and -7<=dy<=7:
    xx0=px+8+(dx+7)*16;yy0=py+30+(dy+7)*16;draw.rectangle((xx0,yy0,xx0+15,yy0+15),outline='red'if edge in forbidden else'white',width=2)
canvas.save(DOC/'four-junction-owner-cells.png')
assert sha(labels.tobytes())==original_label_hash
assert all(p.read_bytes()==data for p,data in watched.items())
for rel,h in {**hold054['frozenInputs'],**plan054['frozenPlanInputs']}.items():assert sha((ROOT/rel).read_bytes())==h
summary={'forbiddenEdgesExcludingDeclaredException':len(forbidden),'forbiddenByPair':dict(collections.Counter(e['pair']for e in forbidden)),
 'declaredExceptionIncidentOppositeEdges':len(declared),'allOppositeEdgesIncludingException':dict(all_contact_counts),
 'nearestJunctionCounts':dict(collections.Counter(e['nearestJunction']for e in forbidden)),
 'maximumNearestJunctionSegmentDistance':max((e['distances'][e['nearestJunction']]['torusDistanceToClosedPixelCentreSegment']for e in forbidden),default=0),
 'maximumNearestJunctionMidpointDistance':max((e['distances'][e['nearestJunction']]['torusDistanceToEdgeMidpoint']for e in forbidden),default=0)}
report={'schemaVersion':1,'verdict':'DIAGNOSIS ONLY: unchanged raster guard failure retained, no acceptance or label repair','scope':'Exact retained vector arcs, pinned source-free graph/raster and independent full pixel-neighbour enumeration. No actual replay, material access, source cost/DP/search, composite or height.',
 'failure':witness(REPLAY/'actual-v1/failure.json'),'geometryJournal':witness(journal_path),'recordedClock':journal,
 'inputPins':{str(p.relative_to(ROOT)):sha(data)for p,data in watched.items()},'vectorArcsSHA256':sha(json.dumps(failure['vectorArcs'],sort_keys=True,separators=(',',':')).encode()),
 'arcs':len(arcs),'graphGuards':graph,'scanSeed':{'negativeCapYAnchor':serial(low),'positiveCapYAnchor':serial(high),'rule':'C iff low < signed pixel-centre y < high, else X; exact frozen replay seed.'},
 'junctionsCanonical':junctions,'ownerOrder':list(owners),'ownerPixels':{name:int((labels==i).sum())for i,name in enumerate(owners)},
 'ownershipLabelBytesSHA256':original_label_hash,'rasterGuardObserved':guard_result,'summary':summary,'allForbiddenOppositeEdges':forbidden,
 'declaredExceptionIncidentEdges':declared,'independentRasterChecks':checks,
 'evidence':[witness(DOC/'ownership-labels-uint8.npy'),witness(DOC/'ownership-atlas-source-free.png'),witness(DOC/'four-junction-owner-cells.png')],
 'inputsStable':True,'protected054Hold82AndPlan8Unchanged':True,'newDPStates':0,'labelsChanged':False,
 'limits':['Pixel contact diagnosis is not an allowance for broadening the exception or changing raster labels.','Vector graph PASS does not establish digital4-region admissibility or source material seamlessness.','No388material or054scalar/source/trial was authored by this task.'],
 'verifier':witness(Path(__file__)),'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
with(DOC/'raster-diagnosis.json').open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'report':witness(DOC/'raster-diagnosis.json'),'summary':summary,'checks':checks},indent=2))
