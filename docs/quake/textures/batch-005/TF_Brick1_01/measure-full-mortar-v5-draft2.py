"""Dataset-specific RGB edge measurements for an UNQUALIFIED V5 footprint plan.
Only docs diagnostics and explicit proposed polygons; no height, assets or CLI.
"""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,hashlib,sys,datetime
R=Path(__file__).resolve().parents[5];H=Path(__file__).parent;O=H/'layer-plan-rgb-v5-draft2';O.mkdir(exist_ok=True)
source=R/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-005/TF_Brick1_01/master-draft-v1/color.png';rgb=Image.open(source).convert('RGB');a=np.asarray(rgb,dtype=float);assert hashlib.sha256(source.read_bytes()).hexdigest()=='c198419c0a1b09fe14dc3f1f05fa01b874e98b5a4932b2f9416ace5169e6fef5'
vpath=H/'mortar-layer-plan-v4.json';assert hashlib.sha256(vpath.read_bytes()).hexdigest()=='6570b757b1522a4455d82347b0d530267a28b2169aa38f46f3ea31d2fe450497';v=json.loads(vpath.read_text());layer={k:z for k,z in v['layeringTrialValues'].items()if k!='brickRegions'}
def bind(p):return {'file':str(p.relative_to(R)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
# A measurement probes the full RGB gradient across the physical contact; known
# V4 contact centre supplies topology only. No colour/luma threshold segments it.
def sample(axis,along,cross):
 x,y=(cross,along)if axis=='vertical'else(along,cross)
 ys=np.arange(round(y)-1,round(y)+2)%1024;xs=np.arange(round(x)-1,round(x)+2)%1024
 return a[np.ix_(ys,xs)].mean((0,1))
def edge(axis,along,centre,side):
 # Pixel measurements search broad enough to include actual outer mortar widths.
 # Every returned point remains provisional and preserves its full RGB profile.
 candidates=range(int(np.floor(centre-20)),int(np.ceil(centre-2))+1)if side<0 else range(int(np.floor(centre+2)),int(np.ceil(centre+20))+1)
 scores=[]
 for q in candidates:
  before=sample(axis,along,q-2);after=sample(axis,along,q+2);score=float(np.linalg.norm(after-before));scores.append((q,score))
 pos,score=max(scores,key=lambda z:z[1]);profile=[{'crossMasterPixel':q,'RGB':list(map(float,sample(axis,along,q))),'edgeRGBDifference':s}for q,s in scores]
 # Ambiguity is observable, not automatically rescued by a fixed-width fallback.
 ranked=sorted(scores,key=lambda z:z[1],reverse=True);competing=[s for q,s in ranked if abs(q-pos)>4];competition=max(competing,default=0);uncertain=score<22 or competition>.9*score
 return pos,{'axis':axis,'alongMasterPixel':float(along),'knownMortarCoreCentre':float(centre),'side':side,'edgeMasterPixel':float(pos),'RGBDifferenceAcross4Pixels':score,'strongCompetingEdgeScore':competition,'ambiguousPhotometricEdge':bool(uncertain),'profile':profile}
# Source-specific manually inspected physical midcourse arris anchors (master
# pixel coordinates), only for contacts obscured by green/dark staining. These
# are measured from the actual RGB pixel-coordinate strips/crops, not heights.
manual={
'vertical-c3-joint4':(400,413),'vertical-c3-joint5':(515,528),
'vertical-c4-joint1':(103,120),'vertical-c5-joint7':(675,685),
'vertical-c6-joint5':(952,966),'vertical-c9-joint2':(136,147),
'vertical-c9-joint3':(224,238),'vertical-c9-joint5':(429,443),
'vertical-c9-joint6':(530,545),'vertical-c10-joint1':(83,95),
'vertical-c10-joint2':(292,303),'vertical-c10-joint5':(907,920),
'vertical-c11-joint7':(737,759),'vertical-c11-joint8':(833,856),
'vertical-c12-joint3':(480,497),'vertical-c12-joint4':(683,694),
'vertical-c13-joint4':(334,351),'vertical-c13-joint5':(437,448),
'vertical-c13-joint6':(541,557),'vertical-c13-joint7':(641,654),
'vertical-c14-joint1':(40,61),'vertical-c14-joint2':(253,271),
'vertical-c14-joint3':(447,461),'vertical-c14-joint4':(649,662),
'vertical-c14-joint5':(847,864)}
def fit(rows,anchor=None):
 # A constrained measurement path discourages isolated pore-edge jumps. It is
 # still a proposal requiring visual source classification, never autoacceptance.
 offsets=[np.asarray([q['crossMasterPixel']-z['knownMortarCoreCentre'] for q in z['profile']],dtype=float) for z in rows]
 target=float(np.median([z['edgeMasterPixel']-z['knownMortarCoreCentre'] for z in rows]))if anchor is None else float(anchor-rows[len(rows)//2]['knownMortarCoreCentre'])
 costs=[];backs=[]
 for i,(z,off) in enumerate(zip(rows,offsets)):
  raw=np.asarray([q['edgeRGBDifference']for q in z['profile']]);scale=max(float(np.percentile(raw,80)),18.);local=-raw/scale+.045*(off-target)**2
  if i==0:costs.append(local);backs.append(None);continue
  dif=off[:,None]-offsets[i-1][None,:];transition=costs[-1][None,:]+.16*dif*dif;transition[np.abs(dif)>5]=1e9;choose=np.argmin(transition,axis=1);costs.append(local+transition[np.arange(len(off)),choose]);backs.append(choose)
 chosen=[int(np.argmin(costs[-1]))]
 for i in range(len(rows)-1,0,-1):chosen.append(int(backs[i][chosen[-1]]))
 chosen=chosen[::-1];result=[]
 for z,off,j in zip(rows,offsets,chosen):
  q=float(z['knownMortarCoreCentre']+off[j]);z['selectedContinuousArrisPixel']=q;z['measurementRegularization']={'targetOffsetFromActualMortarCore':target,'sourceManualAnchorUsed':anchor is not None,'RGBAndContinuityOnly':True,'heightInputUsed':False};result.append(q)
 return result

regions=[];records=[];measurements=[]
def add(label,pts,basis,provenance):
 pts=[[round(float(x/8),4),round(float(y/8),4)]for x,y in pts];assert 3<=len(pts)<=64 and all(0<=x<=128 and 0<=y<=128 for x,y in pts)
 regions.append({'polygon':pts});records.append({'label':label,'regionIndex':len(regions)-1,'basis':basis,'measurementIDs':provenance})
# Horizontal contacts: sample at16master-pixel pitch and split into four source
# segments so each upper/lower arris polyline remains<=64vertices.
for old in [r for r in v['measurementRecords']if r['label'].startswith('horizontal')]:
 poly=np.array(v['layeringTrialValues']['brickRegions'][old['regionIndex']]['polygon'])*8;n=len(poly)//2;xs=poly[:n,0];cy=(poly[:n,1]+poly[n:,1][::-1])/2
 xx=list(range(0,1025,16));up=[];down=[];ids=[]
 for x in xx:
  c=float(np.interp(x,xs,cy));u,ur=edge('horizontal',x,c,-1);d,dr=edge('horizontal',x,c,1);u=max(0,u);d=min(1024,d);up.append(u);down.append(d);ids.append([len(measurements),len(measurements)+1]);measurements.extend([ur,dr])
 up=fit([measurements[z[0]]for z in ids]);down=fit([measurements[z[1]]for z in ids])
 for part in range(4):
  k0=part*16;k1=(part+1)*16;pts=[(x,y)for x,y in zip(xx[k0:k1+1],up[k0:k1+1])]+[(x,y)for x,y in zip(xx[k0:k1+1],down[k0:k1+1])][::-1]
  add(old['label']+'-full-segment'+str(part+1),pts,'RGB-gradient outer contact/arris candidates at actual source coordinates; full contact width, not V4 core dilation; all uncertain edges remain flagged.',[j for z in ids[k0:k1+1]for j in z])
# Ywrap: actual first/last brick arris profiles measured in periodic RGB; split
# into quarters. Top and bottom use the same genuine contact across the wrap.
xx=list(range(0,1025,16));top=[];bottom=[];midids=[]
for x in xx:
 u,ur=edge('horizontal',x,1024,-1);d,dr=edge('horizontal',x,1024,1);bottom.append(min(1024,max(1004,u)));top.append(min(20,max(0,d-1024)));midids.append([len(measurements),len(measurements)+1]);measurements.extend([ur,dr])
bottom=fit([measurements[z[0]]for z in midids]);top=[x-1024 for x in fit([measurements[z[1]]for z in midids])]
for part in range(4):
 k0=part*16;k1=(part+1)*16;xp=xx[k0:k1+1];
 add('Ywrap-full-top-segment'+str(part+1),[(x,0)for x in xp]+list(zip(xp,top[k0:k1+1]))[::-1],'Actual periodic RGB top-side brick arris candidates; source boundary, not a panel rim.',[j for z in midids[k0:k1+1]for j in z])
 add('Ywrap-full-bottom-segment'+str(part+1),list(zip(xp,bottom[k0:k1+1]))+[(x,1024)for x in xp][::-1],'Actual periodic RGB bottom-side brick arris candidates.',[j for z in midids[k0:k1+1]for j in z])
# Vertical actual contact topology from reviewedV4. Source-width and arris
# samples are measured independently at each sourceY, not assigned grid widths.
for old in [r for r in v['measurementRecords']if r['label'].startswith('vertical')and'Xwrap'not in r['label']]:
 poly=np.array(v['layeringTrialValues']['brickRegions'][old['regionIndex']]['polygon'])*8;c=float(poly[:,0].mean());y0=float(poly[:,1].min());y1=float(poly[:,1].max());yy=np.linspace(y0,y1,17);left=[];right=[];ids=[]
 for y in yy:
  l,lr=edge('vertical',y,c,-1);rr,rrr=edge('vertical',y,c,1);left.append(max(0,l));right.append(min(1024,rr));ids.append([len(measurements),len(measurements)+1]);measurements.extend([lr,rrr])
 anchors=manual.get(old['label']);left=[max(0,min(1024,x))for x in fit([measurements[z[0]]for z in ids],anchors[0]if anchors else None)];right=[max(0,min(1024,x))for x in fit([measurements[z[1]]for z in ids],anchors[1]if anchors else None)]
 add(old['label']+'-full',list(zip(left,yy))+list(zip(right,yy))[::-1],'RGB-gradient full mortar footprint candidate between actual source brick arrises; sourceY-dependent boundaries; photometric ambiguity requires physical RGB review.',[j for z in ids for j in z])
# Physical c15Xwrap contact in a periodic unwrapped coordinate system, then split.
yy=np.linspace(958.4,1024,17);left=[];right=[];ids=[]
for y in yy:
 l,lr=edge('vertical',y,1025,-1);rr,rrr=edge('vertical',y,1025,1);left.append(min(1024,max(1004,l)));right.append(max(0,min(20,rr-1024)));ids.append([len(measurements),len(measurements)+1]);measurements.extend([lr,rrr])
left=fit([measurements[z[0]]for z in ids],1016);right=[x-1024 for x in fit([measurements[z[1]]for z in ids],1035)]
add('vertical-c15-Xwrap-full-left',[(0,y)for y in yy]+list(zip(right,yy))[::-1],'Actual c15periodicRGB right arris of Xwrap mortar contact, clipped into native tile.',[j for z in ids for j in z])
add('vertical-c15-Xwrap-full-right',list(zip(left,yy))+[(1024,y)for y in yy][::-1],'Actual c15periodicRGB left arris of Xwrap mortar contact.',[j for z in ids for j in z])
assert len(regions)<=256;layer['brickRegions']=regions
sys.path.insert(0,str(R/'tools/texture_sheets'));from update_level_sheets import brick_mask
mask=brick_mask((1024,1024),layer);m=mask>.5;Image.fromarray(np.uint8(mask*255)).save(O/'proposed-full-mortar-mask.png');ov=a.copy();ov[m]=ov[m]*.58+np.array([255,0,255])*.42;overlay=Image.fromarray(np.uint8(np.round(ov)));overlay.save(O/'proposed-full-mortar-overlay.png')
for course in range(16):
 y0=max(0,course*64-5);y1=min(1024,(course+1)*64+5);ht=y1-y0;s=Image.new('RGB',(1024,ht*2+22),(20,20,20));d=ImageDraw.Draw(s);d.text((2,2),'UNQUALIFIEDV5 RGB-edge draft2 course'+str(course)+' RGB above / full footprint candidate below',fill='white');s.paste(rgb.crop((0,y0,1024,y1)),(0,18));s.paste(overlay.crop((0,y0,1024,y1)),(0,18+ht));s.save(O/('course-'+str(course).zfill(2)+'-RGB-full-overlay.png'))
for k,(x,y)in enumerate([(0,0),(512,0),(0,512),(512,512)],1):overlay.crop((x,y,x+512,y+512)).save(O/('overlay-quadrant-'+str(k)+'.png'))
rep=Image.new('RGB',(2048,2048))
for x in (0,1024):
 for y in (0,1024):rep.paste(overlay,(x,y))
for name,box in [('X',(960,0,1088,1024)),('Y',(0,960,1024,1088)),('corners',(960,960,1088,1088))]:rep.crop(box).save(O/('overlay-literal-'+name+'.png'))
w=json.loads((H/'layered-trial-v1-rgb-witnesses.json').read_text());wc=[]
for row in w['samples']:
 x0,y0,x1,y1=row['rectMasterPixelEdges'];wc.append({**row,'proposedFullMortarMaskFraction':float(m[y0:y1,x0:x1].mean())})
report={'schemaVersion':1,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'EXPLORATORY RGB-only V5draft2 FULL FOOTPRINT edge-measurement candidate; NOT accepted classification or height','registeredRGB':bind(source),'predecessorCorePlan':bind(vpath),'independentTrialHOLD':bind(H/'independent-layered-trial-v1/review.json'),'planesUnchanged':True,'scalarInputLoaded':False,'newHeightProduced':False,'geometry':layer,'records':records,'RGBBoundaryMeasurements':measurements,'manualRGBMidcourseArrisAnchors':manual,'failedUnconstrainedScan':bind(H/'mortar-footprint-plan-v5-draft1.json'),'measurementLimit':'Full RGB edge difference plus source-specific physical arris anchors and continuous-path constraints assist contact widths around reviewed physicaljoint topology; not sole material identity or acceptance. Dark/pale/stained ambiguous edges explicitly flagged. No luma/green threshold or fixed dilation output.','counts':{'regions':len(regions),'maxVertices':max(len(z['polygon'])for z in regions),'ambiguousEdgeProfiles':sum(z['ambiguousPhotometricEdge']for z in measurements),'totalEdgeProfiles':len(measurements)},'witnessCorrespondence':wc,'maskFraction':float(m.mean()),'wrapMembershipDifferences':{'x':int(np.count_nonzero(m[:,0]!=m[:,-1])),'y':int(np.count_nonzero(m[0]!=m[-1]))},'producer':bind(Path(__file__)),'outputs':[bind(q)for q in sorted(O.glob('*.png'))],'next':'Actual RGB-only self-review and source-specific corrections/uncertain contacts must be persisted before finalV5 frozenplan/root+Dreview; no scalar or tiers.'};(H/'mortar-footprint-plan-v5-draft2.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'counts':report['counts'],'maskFraction':report['maskFraction'],'wrap':report['wrapMembershipDifferences'],'witnesses':[{k:x[k]for k in ['label','classification','proposedFullMortarMaskFraction']}for x in wc]}))
