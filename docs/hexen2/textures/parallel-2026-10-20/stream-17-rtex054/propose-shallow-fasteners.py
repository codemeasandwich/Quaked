"""Source-specific shallow head/plate recipe proposal; diagnostic masks only."""
from pathlib import Path
import json,hashlib,math
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5];DOC=Path(__file__).resolve().parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-17-rtex054';MP=BASE/'masters/rtex054-initial'
w=lambda p:{'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
# Shared ordinate bands follow the actual aligned head rows. Each x-outline is measured
# separately against this512RGB; coordinates are not native guides or cloned geometry.
groups=[
 {'ys':[18,22,28,37,46,56,65,70,73], 'heads':[
  {'label':'H1','left':[45,33,27,23,23,26,33,41,45],'right':[45,57,64,68,68,64,58,50,45]},
  {'label':'H2','left':[255,243,237,233,233,237,244,251,255],'right':[255,267,275,279,279,275,268,259,255]},
  {'label':'H3','left':[466,454,448,445,445,449,455,462,466],'right':[466,478,485,489,489,485,479,470,466]}]},
 {'ys':[229,233,239,247,256,265,273,279,283], 'heads':[
  {'label':'H4','left':[44,32,25,21,20,23,29,39,44],'right':[44,56,63,67,68,64,58,49,44]},
  {'label':'H5','left':[467,454,448,444,443,446,452,461,467],'right':[467,479,486,490,492,487,481,471,467]}]},
 {'ys':[438,443,449,457,466,475,483,489,493], 'heads':[
  {'label':'H6','left':[46,33,27,23,22,26,32,41,46],'right':[46,59,66,70,71,67,60,51,46]},
  {'label':'H7','left':[255,243,237,234,233,237,243,251,255],'right':[255,268,275,279,280,275,268,260,255]},
  {'label':'H8','left':[467,455,449,446,445,449,455,463,467],'right':[467,479,486,490,490,486,479,471,467]}]}
]
# Existing guarded policy accepts explicit lower-support polygons. Decompose the
# complement of the eight reviewed head silhouettes into bounded trapezoids.
polys=[];heads=[];previous=0
for group in groups:
 ys=group['ys'];start,end=ys[0],ys[-1]
 if previous<start:polys.append([(0,previous),(512,previous),(512,start),(0,start)])
 for head in group['heads']:
  outline=list(zip(head['left'],ys))+list(zip(head['right'][::-1],ys[::-1]));heads.append({'label':head['label'],'outlineMasterPixels':outline})
 for i in range(len(ys)-1):
  y0,y1=ys[i:i+2];left0=left1=0
  for head in group['heads']:
   right0,right1=head['left'][i:i+2]
   if right0>left0 or right1>left1:polys.append([(left0,y0),(right0,y0),(right1,y1),(left1,y1)])
   left0,left1=head['right'][i:i+2]
  polys.append([(left0,y0),(512,y0),(512,y1),(left1,y1)])
 previous=end
if previous<512:polys.append([(0,previous),(512,previous),(512,512),(0,512)])
# Deduplicate collapsed vertices while keeping all nonzero support polygons.
clean=[]
for p in polys:
 p=list(dict.fromkeys(p));area=sum(a[0]*b[1]-b[0]*a[1]for a,b in zip(p,p[1:]+p[:1]))
 if abs(area)>1e-8:clean.append(p)
assert len(clean)<=256
layering={'referenceSize':[64,64],'facingHeight':.61,'brickHeight':.54,'chipFloor':.57,'microAmplitude':.004,'bevelPixels':.6,'brickRegions':[{'polygon':[[x/8,y/8]for x,y in p]}for p in clean]}
im=Image.open(MP/'color.png').convert('RGB');src=np.asarray(im);maskimage=Image.new('L',im.size);dr=ImageDraw.Draw(maskimage)
for p in clean:
 for dy in(-512,0,512):
  for dx in(-512,0,512):dr.polygon([(x+dx,y+dy)for x,y in p],fill=255)
mask=np.asarray(maskimage)>0;overlay=src.copy();overlay[~mask]=np.rint(overlay[~mask]*.55+np.array([50,150,245])*.45).astype('uint8')
panel=Image.new('RGB',(1024,548),(25,27,30));dr=ImageDraw.Draw(panel);dr.text((4,4),'Actual RGB unchanged / proposed upper head support blue (diagnostic only)',fill='white');panel.paste(im,(0,28));panel.paste(Image.fromarray(overlay),(512,28));panel.save(DOC/'proposed-head-plate-overlay-v1.png')
# Every head full-resolution crop plus upper-support overlay and selected body.
panel=Image.new('RGB',(1024,520),(25,27,30));dr=ImageDraw.Draw(panel)
centres=[(45,44),(255,44),(466,44),(44,255),(466,255),(45,466),(255,466),(466,466)]
for i,(x,y)in enumerate(centres):
 px=i%4*256;py=i//4*256;dr.text((px+4,py+4),'H'+str(i+1)+' '+str([x,y])+' actual / upper support',fill='white')
 for k,a in enumerate((src,overlay)):
  crop=np.roll(a,(-y+32,-x+32),(0,1))[:64,:64];panel.paste(Image.fromarray(crop).resize((128,128),Image.Resampling.NEAREST),(px+k*128,py+28))
panel.save(DOC/'proposed-eight-head-details-v1.png')
report={'schemaVersion':1,'state':'PROPOSAL ONLY; genuine source/master proof and root exact physical review required before guarded successor','nativeIdentity':'d007ea021eb38aceb69f2236c61cae889628abe4d1abc49beffd18c529bbee27','name':'rtex054','edition':'base','sourceMasterPackage':w(MP/'master.json'),'raw':w(BASE/'generated/rtex054.png'),'original':w(BASE/'originals/01-rtex054-d007ea021eb3.png'),'prompt':w(BASE/'prompts/rtex054-material-v1.txt'),'initialPhysicalHold':w(DOC/'initial-relief-hold.json'),'proposedLayering':layering,'sourceMeasuredUpperHeadOutlines':heads,'lowerSupportPolygonCount':len(clean),'lowerPlateSupportFraction':float(mask.mean()),'upperHeadSupportFraction':float((~mask).mean()),'bevelSigmaMasterPixels':1.2,'physicalIntent':'Eight subtly raised rounded-outline head caps above a near-flat lower plate. Rust, coating and plate body share the plate plane with restrained local photo detail. The lower support includes visible dark head-contact shadows; they do not become new raised rings. No RGB, head position, palette, source scale, layout or perimeter change.','parameterBasis':{'planes':'.61 head / .54 plate with .57 edge floor gives subtle .07 nominal head lift; relative uncalibrated units, not measured displacement. Every head support sample must remain above plate/pigment samples.','micro':'.004 limits full photo detail span to <=.008; reduces initial0..1 cragging and prevents broad oxide or green patches from becoming architecture.','bevel':'.6 at256reference gives1.2masterpixel sigma at512. Restricted to existing head silhouette interfaces; no new raised perimeter frame.'},'supportedPolicyLimit':'Existing layered wrapper supplies rounded-outline caps with smoothed edges and slight source detail, not calibrated hemispherical dome reconstruction. Actual neutral opposed lights must establish whether this modest physical representation is acceptable; do not call it measured domed-head geometry.','geometryBasis':'Separate actual source silhouettes measured around all eight generated heads. Lower mask is their complement split into explicit trapezoids; it does not create heads from scratch, move them or sample another texture. Polygon raster edges are mixed head/contact/plate pixels and must be reported honestly.','sourceVerification':'Required genuine independent source/master-only proof; no PASS row fabricated.','diagnosticViews':[w(DOC/'proposed-head-plate-overlay-v1.png'),w(DOC/'proposed-eight-head-details-v1.png')],'nextAction':'Root independent exact mask/plane/cap-limit review and genuine source/master proof. No successor or tiers from this proposal.','tool':w(Path(__file__))}
with(DOC/'shallow-fastener-proposal-v1.json').open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'proposal':w(DOC/'shallow-fastener-proposal-v1.json'),'polygons':len(clean),'headSupportFraction':float((~mask).mean())}))
