"""Source-measured physical proposal, diagnostic overlays only, no repair or maps."""
from pathlib import Path
import json,hashlib,math
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5];DOC=Path(__file__).resolve().parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-14-rtex336';MP=BASE/'masters/rtex336-initial'
w=lambda p:{'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
# Each list is measured from this actual512x1024 RGB. Native8x is only coordinate conversion.
h1top=[(0,268),(64,269),(128,269),(192,270),(256,267),(296,260),(320,265),(384,267),(448,265),(512,268)]
h1bottom=[(0,285),(64,286),(128,284),(192,285),(256,284),(296,286),(320,286),(384,284),(448,283),(512,285)]
h2top=[(0,538),(64,538),(128,536),(192,538),(256,540),(280,538),(320,539),(384,540),(448,536),(512,538)]
h2bottom=[(0,556),(64,553),(128,555),(192,553),(256,562),(280,562),(320,555),(384,557),(448,554),(512,556)]
h3top=[(0,830),(64,830),(128,831),(192,831),(240,832),(272,825),(304,831),(384,829),(448,831),(512,830)]
h3bottom=[(0,844),(64,843),(128,843),(192,845),(240,847),(272,848),(304,844),(384,844),(448,842),(512,844)]
v1left=[(294,0),(295,32),(296,64),(297,96),(298,128),(298,160),(299,192),(297,224),(295,250),(292,278)]
v1right=[(316,0),(315,32),(315,64),(315,96),(315,128),(315,160),(314,192),(313,224),(312,250),(314,278)]
v3left=[(260,548),(263,580),(265,612),(267,644),(268,676),(268,708),(266,740),(266,772),(264,804),(258,840)]
v3right=[(285,548),(282,580),(283,612),(282,644),(283,676),(282,708),(280,740),(280,772),(280,804),(282,840)]
# Side contacts are source-visible only in broad second/fourth course. Upper/third X faces untouched.
x2left=[(0,280),(14,288),(13,320),(12,352),(12,384),(10,416),(12,448),(12,480),(13,512),(17,548),(0,548)]
x2right=[(512,280),(500,288),(502,320),(503,352),(503,384),(503,416),(504,448),(504,480),(502,512),(499,548),(512,548)]
x4left=[(0,838),(8,850),(7,880),(7,912),(6,944),(6,976),(7,1008),(8,1024),(0,1024)]
x4right=[(512,838),(503,850),(504,880),(505,912),(505,944),(505,976),(505,1008),(504,1024),(512,1024)]
polys=[h1top+h1bottom[::-1],h2top+h2bottom[::-1],h3top+h3bottom[::-1],v1left+v1right[::-1],v3left+v3right[::-1],x2left,x2right,x4left,x4right,[(0,0),(512,0),(512,5),(448,6),(384,5),(320,7),(256,6),(192,7),(128,6),(64,5),(0,5)],[(0,1017),(64,1018),(128,1018),(192,1019),(256,1018),(320,1017),(384,1018),(448,1019),(512,1017),(512,1024),(0,1024)]]
layering={'referenceSize':[64,128],'facingHeight':.64,'brickHeight':.46,'chipFloor':.61,'microAmplitude':.006,'bevelPixels':.28,'brickRegions':[{'polygon':[[x/8,y/8]for x,y in poly]}for poly in polys]}
rgb=Image.open(MP/'color.png').convert('RGB');src=np.asarray(rgb);can=Image.new('L',rgb.size);dr=ImageDraw.Draw(can)
for poly in polys:
 for dy in(-1024,0,1024):
  for dx in(-512,0,512):dr.polygon([(x+dx,y+dy)for x,y in poly],fill=255)
mask=np.asarray(can)>0;overlay=src.copy();overlay[mask]=np.rint(overlay[mask]*.6+np.array([230,45,45])*.4).astype('uint8')
panel=Image.new('RGB',(1024,1052),(25,27,30));dr=ImageDraw.Draw(panel);dr.text((4,4),'Actual RGB unchanged / proposed lower contact support red diagnostic only',fill='white');panel.paste(rgb,(0,24));panel.paste(Image.fromarray(overlay),(512,24));panel.save(DOC/'proposed-shallow-contact-overlay-v1.png')
# Actual full strips plus identical diagnostic geometry, no reduced section omitted.
xplain=np.concatenate([src[:,-32:],src[:,:32]],1);xmask=np.concatenate([overlay[:,-32:],overlay[:,:32]],1);yplain=np.concatenate([src[-32:],src[:32]],0);ymask=np.concatenate([overlay[-32:],overlay[:32]],0)
panel=Image.new('RGB',(720,1052),(25,27,30));dr=ImageDraw.Draw(panel);dr.text((4,4),'X literal full / proposed; Y literal full / proposed',fill='white');panel.paste(Image.fromarray(xplain),(0,24));panel.paste(Image.fromarray(xmask),(72,24));panel.paste(Image.fromarray(yplain),(168,24));panel.paste(Image.fromarray(ymask),(168,100));panel.save(DOC/'proposed-shallow-literal-contacts-v1.png')
report={'schemaVersion':1,'state':'PROPOSAL ONLY awaiting genuine source/master proof and root exact physical review','nativeIdentity':'6879799910e3c79bcc11e600e8975856fff356eedc1d04b5764b451a6653fae8','name':'rtex336','edition':'base','sourceMasterPackage':w(MP/'master.json'),'raw':w(BASE/'generated/rtex336.png'),'original':w(BASE/'originals/01-rtex336-6879799910e3.png'),'prompt':w(BASE/'prompts/rtex336-material-v1.txt'),'initialPhysicalHold':w(DOC/'initial-relief-hold.json'),'proposedLayering':layering,'maskFraction':float(mask.mean()),'bevelSigmaMasterPixels':.28*math.sqrt(512*1024)/256,'geometryBasis':{'horizontal':'Current registeredRGB dark contact/soil lanes measured as three polylines, variable widths and visible branch intersections. They are not equal native row bins. Periodic X endpoints agree. Pebbles inside contact remain contact substrate with shallow source modulation.','vertical':'First-course actual jointx292..316 y0..278; thirdx258..285 y548..840. Source-measured varying paths, not copied from previous materials.','Xwrap':'Only broad second/fourth course source-visible side-contact lanes mask both sides. No added upper/third X joint or perimeter frame. Existing left/right photo lane widths differ and are disclosed; judge actual literal contacts, not forced uniform borders.','Ywrap':'Existing soil/contact lane spans bottom/top. Proposed narrow support covers actual rows1017..1023 and0..5/7. No imposed mortar along unobserved coursefaces.','mixed':'Every contact support boundary contains mixed soil/pebble/stone-edge pixels. Selected radius3windows near H/V/T/X/Y interfaces must retain their exact actual maskfractions, not be relabelled pure classes.'},'physicalIntent':'Near-flat coherent stone bodies and cool/dark colour patches above narrow recessed existing contacts; restrained photo pores/wear only. RGB/source/nativepalette/scale/layout unchanged.','parameterBasis':{'planes':'.64 facing/.46 lower contact/.61 transition floor are chosen relative geometry, not measured physical units. The .18 body/contact separation confines architecture to observed contacts.','micro':'.006 amplitude keeps total photo-detail span <=.012 rather than the initial~1fullspan. Within faces large dark/cool stain values can change height only subtly; no embossed mineral patches or broad basins.','bevel':'.28 at256reference gives~.792masterpixel sigma for this512x1024 aspect; confined source-edge transition, not enlarged block rounding.'},'diagnosticViews':[w(DOC/'initial-master-coordinate-grid.png'),w(DOC/'initial-contacts-measurement.png'),w(DOC/'proposed-shallow-contact-overlay-v1.png'),w(DOC/'proposed-shallow-literal-contacts-v1.png')],'sourceVerification':'Independent actual source/master-only proof still required; no future PASS row invented.','nextAction':'Root exact source-specific geometry/planes review; finalize guarded recipe binding genuineproof only after both requirements. No successor or tiers from this proposal.','tool':w(Path(__file__))}
with(DOC/'shallow-masonry-proposal-v1.json').open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'proposal':w(DOC/'shallow-masonry-proposal-v1.json'),'maskFraction':report['maskFraction'],'sigma':report['bevelSigmaMasterPixels']}))
