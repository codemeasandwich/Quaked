"""Propose source-measured contact-only planes; diagnostic overlays, no repair."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[5]
DOC=Path(__file__).resolve().parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-13-ttex262'
MASTER=BASE/'masters/ttex262-initial'
sha=lambda data:hashlib.sha256(data).hexdigest()
def w(path):return {'file':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes())}
# Coordinates measured in current registered512RGB, not copied native pixel bands.
top=[(0,244),(64,243),(128,242),(192,243),(224,242),(256,243),(320,244),(384,242),(448,243),(512,244)]
bottom=[(0,255),(64,254),(128,254),(192,254),(224,254),(256,254),(320,255),(384,253),(448,254),(512,255)]
left=[(222,0),(221,32),(223,64),(223,96),(224,128),(225,160),(226,192),(224,224),(224,248)]
right=[(233,0),(235,32),(236,64),(235,96),(236,128),(237,160),(237,192),(235,224),(235,248)]
polygons=[top+bottom[::-1],left+right[::-1],[(0,0),(512,0),(512,2),(0,2)],[(0,509),(512,509),(512,512),(0,512)],[(0,254),(2,254),(2,512),(0,512)],[(510,254),(512,254),(512,512),(510,512)]]
layering={'referenceSize':[64,64],'facingHeight':.64,'brickHeight':.40,'chipFloor':.59,'microAmplitude':.012,'bevelPixels':.35,'brickRegions':[{'polygon':[[x/8,y/8]for x,y in poly]}for poly in polygons]}
rgb=Image.open(MASTER/'color.png').convert('RGB');canvas=Image.new('L',rgb.size);draw=ImageDraw.Draw(canvas)
for poly in polygons:
 for dy in(-512,0,512):
  for dx in(-512,0,512):draw.polygon([(x+dx,y+dy)for x,y in poly],fill=255)
mask=np.asarray(canvas)>0
color=np.asarray(rgb).copy();color[mask]=np.rint(color[mask]*.55+np.array([230,45,45])*.45).astype('uint8')
overlay=Image.new('RGB',(1024,540),(25,27,30));od=ImageDraw.Draw(overlay);od.text((4,4),'Actual RGB unchanged / proposed recessed support (red diagnostic only)',fill='white');overlay.paste(rgb,(0,24));overlay.paste(Image.fromarray(color),(512,24));overlay.save(DOC/'proposed-masonry-contact-overlay-v1.png')
panel=Image.new('RGB',(1024,564),(25,27,30));pd=ImageDraw.Draw(panel)
source=np.asarray(rgb)
for row,(label,values)in enumerate([('Actual X wrap',np.concatenate([source[:,-32:],source[:,:32]],1)),('Actual Y wrap',np.concatenate([source[-32:],source[:32]],0))]):
 if row==0:
  panel.paste(Image.fromarray(values),(4,24));panel.paste(Image.fromarray(np.concatenate([color[:,-32:],color[:,:32]],1)),(76,24));pd.text((4,4),'X full512height, plain / proposed',fill='white')
 else:
  panel.paste(Image.fromarray(values),(160,24));panel.paste(Image.fromarray(np.concatenate([color[-32:],color[:32]],0)),(160,104));pd.text((160,4),'Y full512width, plain / proposed',fill='white')
v=source[:256,208:248];panel.paste(Image.fromarray(v).resize((120,768),Image.Resampling.NEAREST).crop((0,0,120,384)),(700,24));pd.text((700,4),'V upper128 rows,3x',fill='white')
panel.save(DOC/'proposed-masonry-contacts-v1.png')
report={'schemaVersion':1,'state':'PROPOSAL ONLY pending genuine source/master proof and independent exact mask/physical review','nativeIdentity':'48459128c48ad2c273711c7b77e2267f27d1706dba9f84b9eb3a0af4f71f6436','name':'ttex262','edition':'portals','sourceMasterPackage':w(MASTER/'master.json'),'original':w(BASE/'originals/01-ttex262-48459128c48a.png'),'raw':w(BASE/'generated/ttex262.png'),'prompt':w(BASE/'prompts/ttex262-material-v1.txt'),'sourceVerification':'Required independent source/master-only proof before creating guarded recipe; no PASS row fabricated','proposedLayering':layering,'maskFraction':float(mask.mean()),'bevelSigmaMasterPixels':.7,'sourceMeasurements':{'mainHorizontal':'Current512RGB contact dark upper crack and grey mortar between sampled top/bottom paths x0..512. Periodic endpoints agree. Includes mixed stone/mortar interface at edges; source-specific review required.','upperVertical':'Current512RGB joint sampled x221..237, y0..248. This differs from native coarse x31 guide; masks follow actual photo, not arbitrary native bins.','YWrap':'Narrow existing grey contact near tile top/bottom, proposed rows0..2 and509..511. Review all columns/corners under neutral relief.','lowerXWrap':'Only y254..511. The native running bond places a lower-course contact at wrap while upper course crosses it continuously. Photographic lowerX contact is faint/occluded by weathering; exact geometric path is an inferred native-intent continuation, not a measured grey mortar trench. The proposed3+3pixel support is deliberately narrow and leaves upperX untouched; independent review must accept or reject this inference.'},'physicalIntent':'One coherent upper stone plane through plain brown faces and gray/black staining; lower existing mortar, restrained local source detail. Broad staining is not architecture. No RGB change, no added inner joint, no raised rim.','parameterBasis':{'facingAndMortar':'.64/.40 separation expresses ordinary masonry contact hierarchy; scalar units are not measured physical distance. Floor.59 keeps face-side transition above lower mortar.','micro':'.012 allows only.024full source-detail span versus initial0..1; large dark weathering cannot become broad deep basins.','bevel':'.7master-pixel interface confines smoothing to observed edge transitions instead of rounding the whole blocks.'},'prohibited':'No guarded repair or tiers until source proof and exact independent review; no RGB/source/generation changes','diagnosticViews':[w(DOC/'proposed-masonry-contact-overlay-v1.png'),w(DOC/'proposed-masonry-contacts-v1.png')],'tool':w(Path(__file__))}
with (DOC/'flat-masonry-proposal-v1.json').open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'maskFraction':report['maskFraction'],'proposalSHA256':sha((DOC/'flat-masonry-proposal-v1.json').read_bytes())}))
