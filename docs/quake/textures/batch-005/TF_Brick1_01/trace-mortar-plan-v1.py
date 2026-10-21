"""RGB-only proposed mortar geometry. No scalar input or layered CLI invocation."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,hashlib,datetime,sys
R=Path(__file__).resolve().parents[5];H=Path(__file__).parent;O=H/'layer-plan-rgb';O.mkdir(exist_ok=True)
p=R/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-005/TF_Brick1_01/master-draft-v1/color.png';im=Image.open(p).convert('RGB');assert im.size==(1024,1024)
def bind(p):return {'file':str(p.relative_to(R)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
# Hand-measured contact centre ordinates in native128 coordinates, at x0,8,...128.
# These are conservative physical mortar-core traces from the actual RGB, not
# segmentation by colour or a synthesized16-course regular grid.
paths=[
[8.2,8.3,8.4,8.6,8.5,8.4,8.4,8.2,8.1,7.8,7.9,8.0,8.1,8.1,8.0,8.0,8.2],
[15.7,15.8,16.0,15.9,15.8,15.7,15.9,15.9,15.8,15.7,15.7,15.8,15.7,15.7,15.8,15.8,15.7],
[23.7,23.6,23.8,23.8,23.6,23.8,23.7,23.6,23.7,23.6,23.5,23.7,23.7,23.5,23.6,23.7,23.7],
[31.5,31.4,31.4,31.2,31.1,31.1,31.1,31.5,31.5,31.6,31.5,31.5,31.5,31.5,31.6,31.5,31.5],
[39.2,39.4,39.4,39.3,39.2,39.4,39.4,39.3,39.3,39.3,39.3,39.4,39.4,39.4,39.3,39.2,39.2],
[47.7,47.8,47.6,47.5,47.6,47.7,47.7,47.6,47.7,47.7,47.8,47.7,47.6,47.6,47.7,47.8,47.7],
[56.2,56.1,56.2,56.3,56.4,56.3,56.3,56.4,56.3,56.1,56.1,56.2,56.3,56.4,56.3,56.3,56.2],
[64.0,64.1,64.0,63.8,63.9,64.0,63.9,63.9,64.0,64.0,63.9,64.0,64.1,64.1,64.0,64.0,64.0],
[71.5,71.4,71.5,71.7,71.7,71.6,71.7,71.8,71.7,71.7,71.8,71.7,71.5,71.7,71.7,71.6,71.5],
[79.6,79.5,79.7,79.7,79.7,79.7,79.8,79.6,79.6,79.7,79.7,79.7,79.6,79.6,79.7,79.7,79.6],
[88.0,88.0,88.1,88.2,88.0,88.2,88.0,88.1,88.1,88.2,88.2,88.3,88.2,88.2,88.0,88.0,88.0],
[96.1,96.2,96.2,96.2,96.1,96.1,96.1,96.1,96.1,96.2,96.2,96.1,96.2,96.3,96.1,96.0,96.1],
[104.0,103.9,103.8,103.8,103.9,104.0,103.9,104.0,104.0,104.1,104.1,104.1,104.2,104.1,104.1,104.0,104.0],
[112.0,112.1,112.0,112.0,112.1,112.1,112.1,112.2,112.1,112.2,112.1,112.0,112.1,112.1,112.2,112.1,112.0],
[119.9,120.0,119.9,119.8,119.8,119.9,119.9,119.9,119.8,119.9,119.8,119.9,120.0,120.0,119.9,119.9,119.9],
]
# Actual joint-centre abscissae measured row by row from the RGB; variable unit
# counts/lengths and dark staining are retained. No random offsets or luma mask.
verticals=[
[2.0,27.0,54.5,81.3,108.0],
[8.4,19.8,32.4,45.0,57.2,70.7,83.0,95.3,108.5,121.5],
[12.4,37.1,61.3,86.5,113.1],
[8.0,21.8,35.7,49.5,64.7,79.2,94.3,107.9,121.5],
[13.6,40.4,67.5,88.6,115.8],
[8.4,21.9,36.2,48.0,62.6,72.2,84.7,97.7,109.4,123.1],
[14.9,43.2,66.6,94.1,116.8],
[7.1,19.8,32.3,45.3,58.2,71.6,84.7,96.8,110.1,122.7],
[12.7,38.6,61.8,87.9,114.8],
[4.1,17.6,28.6,41.5,54.9,68.0,81.3,94.6,107.8,121.8],
[37.5,62.8,88.6,114.0],
[14.3,28.1,41.5,54.3,68.4,81.8,95.0,108.2,121.5],
[8.4,35.4,61.3,87.3,112.5],
[5.6,19.3,31.6,44.9,58.3,71.2,84.7,97.7,110.7,124.2],
[5.3,32.2,59.8,86.9,113.4],
[1.9,15.3,28.5,41.6,54.9,68.0,81.2,94.5,107.7,121.9],
]
regions=[];measurements=[]
def add(label,poly,basis):
 assert len(poly)<=64 and len(poly)>=3 and all(0<=x<=128 and 0<=y<=128 for x,y in poly)
 regions.append({'polygon':[[round(float(x),4),round(float(y),4)]for x,y in poly]});measurements.append({'label':label,'regionIndex':len(regions)-1,'measurementBasis':basis})
for i,ys in enumerate(paths):
 assert ys[0]==ys[-1];xs=list(range(0,129,8));half=.4 if i!=3 else .55
 upper=[(x,y-half)for x,y in zip(xs,ys)];lower=[(x,y+half)for x,y in zip(xs,ys)][::-1]
 add('horizontal-contact-'+str(i+1),upper+lower,'Hand-measured contact centre polyline at x0,8,...128, conservative mortar core; preserves course-specific ordinate changes and same endpoint support at X wrap.')
# The actual Y join is in mortar: retain a thin split support around that exact
# boundary, rather than adding a new image frame or dropping the final course.
add('Y-wrap-mortar-top',[(0,0),(128,0),(128,.30),(0,.30)],'Actual literal YjoinRGB dark mortar support, top half. Must be independently reviewed, not an image perimeter bevel.')
add('Y-wrap-mortar-bottom',[(0,127.70),(128,127.70),(128,128),(0,128)],'Actual literal YjoinRGB dark mortar support, bottom half. Exact matching wrapped halfsupport.')
for course,centres in enumerate(verticals):
 for k,x in enumerate(centres):
  top=.0 if course==0 else float(np.interp(x,list(range(0,129,8)),paths[course-1]))-.1
  bottom=128. if course==15 else float(np.interp(x,list(range(0,129,8)),paths[course]))+.1
  half=.32
  add('vertical-c'+str(course)+'-joint'+str(k+1),[(x-half,top),(x+half,top),(x+half,bottom),(x-half,bottom)],'Manually measured source RGB joint centre; conservative straight mortar-core polygon, not a complete outer arris trace; endpoints join measured course contact supports.')
assert len(regions)<=256
layering={'referenceSize':[128,128],'facingHeight':.985,'brickHeight':.935,'chipFloor':.962,'microAmplitude':.004,'bevelPixels':.35,'brickRegions':regions}
sys.path.insert(0,str(R/'tools/texture_sheets'));from update_level_sheets import brick_mask
mask=brick_mask((1024,1024),layering);assert np.any(mask) and np.any(mask==0);mp=O/'proposed-mortar-mask.png';Image.fromarray(np.uint8(mask*255)).save(mp)
a=np.asarray(im,dtype=float);m=mask>.5;overlay=a.copy();overlay[m]=overlay[m]*.55+np.array([255,0,255])*.45;ov=Image.fromarray(np.uint8(np.round(overlay)));ov.save(O/'proposed-mortar-overlay.png')
rep=Image.new('RGB',(2048,2048))
for x in (0,1024):
 for y in (0,1024):rep.paste(ov,(x,y))
rep.crop((960,0,1088,1024)).save(O/'overlay-literal-x-join.png');rep.crop((0,960,1024,1088)).save(O/'overlay-literal-y-join.png');rep.crop((960,960,1088,1088)).save(O/'overlay-literal-four-corners.png')
for i,(x,y)in enumerate([(0,0),(512,0),(0,512),(512,512)],1):ov.crop((x,y,x+512,y+512)).save(O/('overlay-quadrant-'+str(i)+'.png'))
w=json.loads((H/'draft-rgb-witnesses.json').read_text());correspondence=[]
for row in w['samples']:
 x0,y0,x1,y1=row['rectMasterPixelEdges'];z=mask[y0:y1,x0:x1];correspondence.append({**row,'proposedLowerMortarMaskFraction':float((z>.5).mean()),'expectedMaskMembership':'outside lower mortar mask' if row['classification']=='face' else 'inside lower mortar mask'})
plan={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'UNQUALIFIED RGB-only conservative mortar-core plan; requires independent mask/semantic review before layered CLI','nativeIdentity':'d3ce46e945f9c961bb863204801c0b3e783878b620189ac1cf989ffbc1d534e5','registeredRGB':bind(p),'sourceMasterReceipt':bind(p.with_name('master.json')),'producer':bind(Path(__file__)),'scalarHeightInputRead':False,'actualFieldPolarity':{'brickRegions':'mask>0.5 = LOWER mortar substrate (brickHeight .935), despite historical field name','outsideMask':'UPPER solid clay face (facingHeight .985)','chipFloor':'.962 is outside-mask contact floor; not lower mortar plane','microDetail':'proposed±.004 maximum detail around physical base; chromatic stain no longer sets large depth','bevel':'Existing wrapped Gaussian interface, .35 at256 reference =1.4px at1024; no independent perimeter bevel'},'layeringTrialValues':layering,'measurementRecords':measurements,'counts':{'regions':len(regions),'horizontalContacts':15,'YWrapHalfSupports':2,'verticalJointCores':sum(map(len,verticals)),'maxVerticesPerRegion':max(len(x['polygon'])for x in regions)},'witnessCorrespondence':correspondence,'maskFraction':float(m.mean()),'wrapSupport':{'leftRightBinaryMaskDifferences':int(np.count_nonzero(mask[:,0]!=mask[:,-1])),'topBottomBinaryMaskDifferences':int(np.count_nonzero(mask[0]!=mask[-1])),'xPolicy':'Only real horizontal mortar contacts cross X tile edge; no full-height Xborder strip. Edge-cut brick faces remain outside mask.','yPolicy':'Thin split mortar support at actual existing Ycontact; final short course and first long course preserved.'},'limits':['Conservative hand-measured contact cores, not a claim of complete outer mortar/arris segmentation. Straight vertical cores must be reviewed against every actual local arris before approval.','RGB-only mask plan; no source assets modified, height field produced, layered CLI or tiers run.','Unknown historical generation invocation/calltotal retained; no provider or journal action.'],'outputs':[bind(q)for q in sorted(O.glob('*.png'))]}
(H/'mortar-layer-plan-v1.json').write_text(json.dumps(plan,indent=2)+'\n');print(json.dumps({'plan':str((H/'mortar-layer-plan-v1.json').relative_to(R)),'counts':plan['counts'],'maskFraction':plan['maskFraction'],'wrap':plan['wrapSupport'],'witnesses':[{k:r[k]for k in ('label','classification','proposedLowerMortarMaskFraction')}for r in correspondence]}))
