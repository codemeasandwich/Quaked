"""Read-only replay of retained node lookups/costs; focused source-crop evidence.

No DP, offset search, material compositing or new lattice states are executed.
"""
from pathlib import Path
import hashlib,json,io,datetime
import numpy as np
from PIL import Image,ImageDraw

D=Path(__file__).resolve().parent
R=D.parents[6]
RUN=D/'runs/actual-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
relative=lambda p:str(p.relative_to(R))
r=json.loads((RUN/'result.json').read_text())
assert r['latticeStateEvaluations']==844800 and r['stateLimit']==1000000
for p,h in r['firstInputHashes'].items():assert sha(R/p)==h,p
source=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-11-rtex388/masters/rtex388-v1/color.png'
im=Image.open(source).convert('RGB');rgb=np.asarray(im)
# Independent normalized source luminance/central-gradient expression.
red,green,blue=[rgb[:,:,k].astype(np.float64)/255 for k in range(3)]
lum=.2126*red+.7152*green+.0722*blue
errors=[];node_count=0;path_count=0

def signed(v):return v-512 if v>=464 else v

def verify_path(path,name,cx,cy):
 global node_count,path_count
 lookups=path['lookups'];assert len(lookups)==len(path['columns']);costs=[]
 for index,row in enumerate(lookups):
  x,y,ax,ay,bx,by,cost=row
  assert all(type(v)is int for v in row[:6])and all(0<=v<512 for v in row[:6])
  assert all(1<=v<=510 for v in (ax,ay,bx,by))
  if name in ('X+','X-'):
   assert[ax,ay]==[x,y]and[bx,by]==[x+cx-(512 if name=='X-'else 0),y]
  elif name in ('Y+','Y-'):
   assert[ax,ay]==[x,y]and[bx,by]==[x,y+cy-(512 if name=='Y-'else 0)]
  elif name.startswith('capY'):
   assert[ax,ay]==[cx+signed(x),y]and[bx,by]==[cx+signed(x),cy+signed(y)]
  else:
   assert name.startswith('capX');assert[ax,ay]==[x,cy+signed(y)]and[bx,by]==[cx+signed(x),cy+signed(y)]
  def gradient(xx,yy):return min(1.,abs(float(lum[yy,xx+1]-lum[yy,xx-1]))+abs(float(lum[yy+1,xx]-lum[yy-1,xx])))
  actual=float(np.abs(rgb[ay,ax].astype(float)-rgb[by,bx]).mean()/255+.25*max(gradient(ax,ay),gradient(bx,by)))
  errors.append(abs(actual-cost));assert abs(actual-cost)<1e-14
  costs.append(cost);node_count+=1
  if index:
   prev=lookups[index-1];dx=(x-prev[0]+256)%512-256;dy=(y-prev[1]+256)%512-256
   if name.startswith('X')or name.startswith('capX'):assert dy==1 and abs(dx)<=1
   else:assert dx==1 and abs(dy)<=1
 assert abs(sum(costs)-path['totalCost'])<1e-12
 assert abs(sum(costs)/len(costs)-path['meanCost'])<1e-14
 path_count+=1

for c in r['candidates']:
 cx,cy=c['centre']
 for name,path in c['longPaths'].items():verify_path(path,name,cx,cy)
 for name,cap in c['caps'].items():
  assert cap['evaluatedAnchorPositions']==25 and len(cap['suggestions'])==3
  for suggestion in cap['suggestions']:
   left,right=suggestion['negativeHalf'],suggestion['positiveHalf']
   verify_path(left,name,cx,cy);verify_path(right,name,cx,cy)
   assert left['columns'][-1]==right['columns'][0]==suggestion['anchorIndex']
   for offset in (2,4):
    aa=left['lookups'][-1][offset:offset+2];bb=right['lookups'][0][offset:offset+2]
    assert[bb[k]-aa[k]for k in(0,1)]==([1,0]if name.startswith('capY')else[0,1])

unmarked_count=0
for filename,row in r['outputFiles'].items():
 assert sha(RUN/filename)==row['sha256']and(RUN/filename).stat().st_size==row['bytes']
 if filename.endswith('-unmarked.png'):
  meta=r['evidence'][filename];sheet=Image.open(RUN/filename).convert('RGB');assert meta['displayScale']==1
  for box,origin in zip((meta['A_sourceRect'],meta['B_sourceRect']),meta['cropDisplayOrigins']):
   x0,y0,x1,y1=box;ox,oy=origin
   assert np.array_equal(np.asarray(sheet.crop((ox,oy,ox+x1-x0,oy+y1-y0))),rgb[y0:y1,x0:x1])
  unmarked_count+=1
assert node_count==8448 and path_count==84 and unmarked_count==24

# Focus on retained highest-cost C2 side nodes only. This does not seek another path.
focus=[];c2=next(c for c in r['candidates']if c['candidate']=='C2')
for name,path in c2['longPaths'].items():
 rows=path['lookups'];index=max(range(len(rows)),key=lambda k:rows[k][-1]);window=rows[max(0,index-12):min(len(rows),index+13)];boxes=[]
 for off in(2,4):
  xs=[p[off]for p in window];ys=[p[off+1]for p in window];boxes.append([max(0,min(xs)-12),max(0,min(ys)-12),min(512,max(xs)+13),min(512,max(ys)+13)])
 crops=[im.crop(b)for b in boxes];scale=4;width=max(p.width for p in crops)*scale;height=max(p.height for p in crops)*scale;s=Image.new('RGB',(max(900,2*width+36),height+105),(25,27,30));dr=ImageDraw.Draw(s);dr.text((4,4),'C2 '+name+' highest retained node cost; diagnostic review only, NOT a repaired image',fill='white');dr.text((4,23),'Node '+str(rows[index])+'; retained index '+str(index),fill='white');dr.text((4,42),'Separate source A '+str(boxes[0])+' / B '+str(boxes[1])+'; NEAREST 4x',fill='white')
 for owner,(crop,box)in enumerate(zip(crops,boxes)):
  tile=crop.resize((crop.width*scale,crop.height*scale),Image.Resampling.NEAREST);td=ImageDraw.Draw(tile);off=2 if owner==0 else 4;points=[((p[off]-box[0])*scale,(p[off+1]-box[1])*scale)for p in window];td.line(points,fill=(255,70,180),width=2);point=rows[index];px,py=(point[off]-box[0])*scale,(point[off+1]-box[1])*scale;td.ellipse((px-4,py-4,px+4,py+4),outline=(255,230,30),width=2);s.paste(tile,(4+owner*(width+24),78))
 p=D/('focus-C2-'+name.replace('+','plus').replace('-','minus')+'.png');s.save(p);focus.append({'grid':name,'retainedPathNodeIndex':index,'node':rows[index],'sourceBoxes':boxes,'file':relative(p),'sha256':sha(p)})

for p,h in r['firstInputHashes'].items():assert sha(R/p)==h,p
report={'verdict':'PASS actual retained lookup/cost/source-crop audit, NOT ART or ownership-atlas acceptance','retainedPaths':path_count,'retainedNodeLookups':node_count,'costReplayTolerance':1e-14,'maximumIndependentCostDifference':max(errors),'unmarkedSourcePairsPixelExact':unmarked_count,'all48OutputHashesExact':True,'sourceAndAllFirstWatchedInputsUnchanged':True,'newLatticeStateEvaluations':0,'actualRunStatesStill844800':True,'focusWindows':focus,'coordinateBoundaryLimit':'Closed cut-node grids include boundary coordinate48; source probes/neighbourhood/context can extend beyond the half-open future copy rectangle. These are read-only cost samples, never changed-pixel/ownership assertions. Clarify final pixel-edge ownership before any compositor.','remainingRequiredFinding':'F1 and all parent/X/Y/corner junctions remain HOLD. Curved low-error paths can still cross coherent blade bodies. No score or suggestion closes natural-material acceptance.','inputs':{relative(p):sha(p)for p in[Path(__file__),RUN/'result.json',D/'source_path_diagnostic.py',D/'fixture-report-v2.json',source]},'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};(D/'actual-retained-path-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'nodeCount':node_count,'pathCount':path_count,'unmarkedPairsExact':unmarked_count,'maxCostDifference':max(errors),'auditSha256':sha(D/'actual-retained-path-audit.json')}))
