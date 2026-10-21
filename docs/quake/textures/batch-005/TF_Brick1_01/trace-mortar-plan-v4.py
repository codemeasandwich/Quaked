"""RGB-only proposed mortar geometry. No scalar input or layered CLI invocation."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,hashlib,datetime,sys
R=Path(__file__).resolve().parents[5];H=Path(__file__).parent;O=H/'layer-plan-rgb-v4';O.mkdir(exist_ok=True)
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
 [
  2.0,
  27.0,
  54.5,
  80.875,
  108.0
 ],
 [
  9.25,
  19.8,
  32.4,
  45.375,
  58.25,
  71.875,
  84.125,
  98.125,
  110.75,
  124.5
 ],
 [
  12.4,
  37.1,
  62.625,
  88.0,
  113.1
 ],
 [
  8.0,
  21.8,
  35.7,
  50.75,
  64.69999999999999,
  79.19999999999999,
  94.30000000000001,
  107.89999999999999,
  121.5
 ],
 [
  13.6,
  40.4,
  67.5,
  88.6,
  115.80000000000001
 ],
 [
  8.4,
  21.9,
  36.2,
  48.0,
  62.6,
  71.625,
  84.69999999999999,
  97.69999999999999,
  110.25,
  123.1
 ],
 [
  14.9,
  40.875,
  66.6,
  93.25,
  119.875
 ],
 [
  7.1,
  19.8,
  33.0,
  45.3,
  58.2,
  71.6,
  84.69999999999999,
  97.5,
  110.1,
  122.0
 ],
 [
  13.625,
  38.6,
  61.8,
  90.5,
  114.80000000000001
 ],
 [
  4.1,
  17.6,
  28.6,
  41.5,
  54.89999999999999,
  67.125,
  80.125,
  93.875,
  106.0,
  119.75
 ],
 [
  11.1,
  37.125,
  62.8,
  88.6,
  114.0
 ],
 [
  2.25,
  15.375,
  28.1,
  41.5,
  54.3,
  67.0,
  80.875,
  93.375,
  105.375,
  120.0
 ],
 [
  8.4,
  34.5,
  61.3,
  86.0,
  108.75
 ],
 [
  5.6,
  19.3,
  31.6,
  42.875,
  55.375,
  68.5,
  80.875,
  94.0,
  107.75,
  121.125
 ],
 [
  5.300000000000001,
  32.2,
  56.75,
  81.875,
  106.875
 ],
 [
  13.875,
  26.75,
  38.75,
  50.625,
  63.75,
  76.25,
  88.75,
  102.375,
  114.625
 ]
]
regions=[];measurements=[]
def add(label,poly,basis):
 assert len(poly)<=64 and len(poly)>=3 and all(0<=x<=128 and 0<=y<=128 for x,y in poly)
 regions.append({'polygon':[[round(float(x),4),round(float(y),4)]for x,y in poly]});measurements.append({'label':label,'regionIndex':len(regions)-1,'measurementBasis':basis})
for i,ys in enumerate(paths):
 assert ys[0]==ys[-1];xs=[0,1]+list(range(8,128,8))+[127,128];ys=[ys[0],ys[0]]+ys[1:-1]+[ys[-1],ys[-1]];half=.4 if i!=3 else .55
 upper=[(x,y-half)for x,y in zip(xs,ys)];lower=[(x,y+half)for x,y in zip(xs,ys)][::-1]
 add('horizontal-contact-'+str(i+1),upper+lower,'Hand-measured contact centre polyline at x0,8,...128 with same physical mortar-core endpoint held across first/last1native texel to prevent raster-only wrap difference; preserves course-specific ordinate changes.')
# The actual Y join is in mortar: retain a thin split support around that exact
# boundary, rather than adding a new image frame or dropping the final course.
add('Y-wrap-mortar-top',[(0,0),(128,0),(128,.30),(0,.30)],'Actual literal YjoinRGB dark mortar support, top half. Must be independently reviewed, not an image perimeter bevel.')
add('Y-wrap-mortar-bottom',[(0,127.70),(128,127.70),(128,128),(0,128)],'Actual literal YjoinRGB dark mortar support, bottom half. Exact matching wrapped halfsupport.')
for course,centres in enumerate(verticals):
 for k,x in enumerate(centres):
  top=.0 if course==0 else float(np.interp(x,list(range(0,129,8)),paths[course-1]))-.1
  bottom=128. if course==15 else float(np.interp(x,list(range(0,129,8)),paths[course]))+.1
  half=.32
  label=('vertical-c11-joint0-new-left-partial' if course==11 and k==0 else 'vertical-c11-joint'+str(k) if course==11 else 'vertical-c15-measured-joint'+str(k+1) if course==15 else 'vertical-c'+str(course)+'-joint'+str(k+1))
  add(label,[(x-half,top),(x+half,top),(x+half,bottom),(x-half,bottom)],'Actual source RGB1:1 per-course pixel-coordinate contact measurement and self-review crop; conservative straight mortar-core polygon, not full outer arris contour; endpoints join measured horizontal contacts.')
# Actual course15 has a physical vertical mortar joint across Xwrap, independently
# visible in its literal RGB row; split this bounded contact rather than inventing
# an extra partial brick at either edge.
add('vertical-c15-measured-Xwrap-left',[(0,119.8),(.525,119.8),(.525,128),(0,128)],'Actual course15 Xwrap mortar contact, first4.2master pixels; no full-height border strip.')
add('vertical-c15-measured-Xwrap-right',[(127.725,119.8),(128,119.8),(128,128),(127.725,128)],'Actual course15 Xwrap mortar contact, last2.2master pixels, continuing same physical joint.')
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
for tag,rect in [('dark-c10-left',(0,632,304,714)),('dark-c3-middle',(250,182,528,256)),('dark-c12-middle',(390,770,704,842))]:
 im.crop(rect).save(O/(tag+'-native-rgb-crop.png'))
 if tag=='dark-c10-left':ov.crop(rect).save(O/'dark-c10-left-overlay-crop.png')
w=json.loads((H/'draft-rgb-witnesses.json').read_text());correspondence=[]
for row in w['samples']:
 x0,y0,x1,y1=row['rectMasterPixelEdges'];z=mask[y0:y1,x0:x1];correspondence.append({**row,'proposedLowerMortarMaskFraction':float((z>.5).mean()),'expectedMaskMembership':'outside lower mortar mask' if row['classification']=='face' else 'inside lower mortar mask'})
prior=json.loads((H/'mortar-layer-plan-v3.json').read_text());prior_labels={r['label']:r for r in prior['measurementRecords']}
contact_crops=O/'contact-crops';contact_crops.mkdir(exist_ok=True);justifications=[]
for row,region in zip(measurements,regions):
 label=row['label'];pts=np.asarray(region['polygon'])*8
 if label.startswith('horizontal'):
  y0=max(0,int(np.floor(pts[:,1].min()))-12);y1=min(1024,int(np.ceil(pts[:,1].max()))+12);rect=(0,y0,1024,y1)
 elif label.startswith('Y-wrap'):
  rect=(0,0,1024,18) if label.endswith('top') else (0,1006,1024,1024)
 else:
  x0=max(0,int(np.floor(pts[:,0].min()))-14);x1=min(1024,int(np.ceil(pts[:,0].max()))+14);y0=max(0,int(np.floor(pts[:,1].min()))-3);y1=min(1024,int(np.ceil(pts[:,1].max()))+3);rect=(x0,y0,x1,y1)
 x0,y0,x1,y1=rect;cw=x1-x0;ch=y1-y0;sheet=Image.new('RGB',(cw*2,ch+32),(20,20,20));dr=ImageDraw.Draw(sheet);dr.text((1,1),label+' RGB|V4',fill='white');dr.text((1,14),str(rect),fill='yellow');sheet.paste(im.crop(rect),(0,32));sheet.paste(ov.crop(rect),(cw,32));cp=contact_crops/(label+'.png');sheet.save(cp)
 old=prior_labels.get(label);oldpoly=prior['layeringTrialValues']['brickRegions'][old['regionIndex']]['polygon'] if old else None
 status='retained same polygon' if oldpoly==region['polygon'] else 'new source-measured contact' if old is None else 'moved false/edge-cut V3 core onto actual RGB mortar contact'
 justifications.append({'label':label,'regionIndex':row['regionIndex'],'sourceCropMasterPixelEdges':list(rect),'sourceAndOverlayExactCrop':bind(cp),'selfReviewBasis':row['measurementBasis'],'successorChange':status,'priorV3RegionIndex':old['regionIndex'] if old else None,'priorV3Polygon':oldpoly,'literalContactAcceptance':'Pending independent root review; self-review source geometry only.'})
new_rect=[128,660,160,680];x0,y0,x1,y1=new_rect;im.crop(tuple(new_rect)).save(O/'proposed-green-face-interior-witness.png')
new_witness={'label':'green-stained-solid-face-interior-proposed-v2','classification':'face','rectMasterPixelEdges':new_rect,'basis':'Actual RGB crop dark-c10-left reveals real mortar near masterx88.8. New interior lies safely inside the following solid green-stained brick; no scalar read used.','proposedLowerMortarMaskFraction':float((mask[y0:y1,x0:x1]>.5).mean()),'heightInspected':False}
plan={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'UNQUALIFIED RGB-only corrected mortar-core successor from adversarial SELF-review; requires independent mask/semantic review before layered CLI','nativeIdentity':'d3ce46e945f9c961bb863204801c0b3e783878b620189ac1cf989ffbc1d534e5','registeredRGB':bind(p),'sourceMasterReceipt':bind(p.with_name('master.json')),'producer':bind(Path(__file__)),'scalarHeightInputRead':False,'actualFieldPolarity':{'brickRegions':'mask>0.5 = LOWER mortar substrate (brickHeight .935), despite historical field name','outsideMask':'UPPER solid clay face (facingHeight .985)','chipFloor':'.962 is outside-mask contact floor; not lower mortar plane','microDetail':'proposed±.004 maximum detail around physical base; chromatic stain no longer sets large depth','bevel':'Existing wrapped Gaussian interface, .35 at256 reference =1.4px at1024; no independent perimeter bevel'},'layeringTrialValues':layering,'measurementRecords':measurements,'allRegionLiteralRGBJustifications':justifications,'counts':{'regions':len(regions),'horizontalContacts':15,'YWrapHalfSupports':2,'verticalJointCores':sum(map(len,verticals))+2,'maxVerticesPerRegion':max(len(x['polygon'])for x in regions)},'witnessCorrespondence':correspondence,'priorWitnessFinding':{'label':'green-stained-solid-brick-face','retainedFixedRect':[80,660,105,680],'finding':'RGB-only darkcourse crop confirms this prior face-labelled witness straddles an actual mortar contact; v3 mask exposes24percent lowerjoint membership. Treat its prior scalar mean as a mixed sample, not proof of a pure face. Do not silently change the fixed original witness.','sourceEvidence':bind(O/'dark-c10-left-native-rgb-crop.png')},'proposedNewRGBOnlyWitness':new_witness,'fieldPolicySource':{'layeredWrapper':bind(R/'tools/texture_sheets/prepare_layered_texture_master.py'),'polygonMask':bind(R/'tools/texture_sheets/update_level_sheets.py')},'maskFraction':float(m.mean()),'wrapSupport':{'leftRightBinaryMaskDifferences':int(np.count_nonzero(mask[:,0]!=mask[:,-1])),'topBottomBinaryMaskDifferences':int(np.count_nonzero(mask[0]!=mask[-1])),'xPolicy':'Real horizontal mortar contacts cross X; the actual bounded course15 vertical mortar contact crosses X as split left/rightsupports. No full-height Xborder strip.','yPolicy':'Thin split mortar support at actual existing Ycontact; final short course and first long course preserved.'},'priorPlan':bind(H/'mortar-layer-plan-v3.json'),'priorProducerRetainedCopy':bind(H/'trace-mortar-plan.py'),'revisionReason':'Adversarial RGB-only self-review exposed multiple V3 contact cores crossing solid brick faces. Correct those by actual per-course master pixel contact coordinates, add omitted course11 leftpartial contact and replace failed course15 positions with its actual nineinterior plus split Xwrap mortar contact. V1-V3 and all failures remain retained; no scalar data or assets modified.','limits':['Conservative hand-measured contact cores, not a claim of complete outer mortar/arris segmentation. Straight vertical cores must be reviewed against every actual local arris before approval.','RGB-only mask plan; no source assets modified, height field produced, layered CLI or tiers run.','Unknown historical generation invocation/calltotal retained; no provider or journal action.'],'outputs':[bind(q)for q in sorted(O.glob('*.png'))]+[bind(q)for q in sorted(contact_crops.glob('*.png'))]}
(H/'mortar-layer-plan-v4.json').write_text(json.dumps(plan,indent=2)+'\n');print(json.dumps({'plan':str((H/'mortar-layer-plan-v4.json').relative_to(R)),'counts':plan['counts'],'maskFraction':plan['maskFraction'],'wrap':plan['wrapSupport'],'witnesses':[{k:r[k]for k in ('label','classification','proposedLowerMortarMaskFraction')}for r in correspondence]}))
