"""Source RGB ellipse measurements and outline diagnostics only. No scalar authoring."""
from pathlib import Path
import json,hashlib
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[6];DOC=Path(__file__).resolve().parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-17-rtex054'
w=lambda p:{'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
# Pixel-edge coordinates measured on the unchanged registered512RGB. Centres are
# not copied from the failed polygons; each ellipse follows visible metal rather
# than the dark contact/soil fringe. No rotated ellipse is required by this view.
rows=[('H1',[45.5,44.5],[22,23.5]),('H2',[256,43.5],[23,23]),('H3',[467,44],[22.5,23.5]),('H4',[44,255],[23,23.5]),('H5',[467.5,255.5],[23.5,24]),('H6',[46,465.5],[23,23.5]),('H7',[256,465.5],[23,23]),('H8',[467,465],[22,23])]
source=BASE/'masters/rtex054-initial/color.png';im=Image.open(source).convert('RGB');full=Image.new('RGB',(1024,540),(25,27,30));full.paste(im,(0,24));overlay=im.copy();draw=ImageDraw.Draw(overlay);heads=[]
for label,centre,radius in rows:
 cx,cy=centre;rx,ry=radius;box=[cx-rx,cy-ry,cx+rx,cy+ry];draw.ellipse(box,outline=(65,210,245),width=1);draw.line((cx-2,cy,cx+2,cy),fill=(245,245,80));draw.line((cx,cy-2,cx,cy+2),fill=(245,245,80));heads.append({'label':label,'centreMasterPixelEdges':centre,'radiiMasterPixels':radius,'ellipseBoundsMasterPixelEdges':box,'centreNativePixelEdges':[v/8 for v in centre],'radiiNativePixels':[v/8 for v in radius],'measurementBasis':'Visible rounded iron head face in unchanged512RGB. Dark surrounding contact shadow and rough plate coating excluded where distinguishable; boundary uncertainty about1..2masterpixels. Axis aligned ellipse is an interpretation, not segmentation purity or calibrated dome geometry.'})
full.paste(overlay,(512,24));dr=ImageDraw.Draw(full);dr.text((4,4),'Actual same RGB / proposed source-measured metal-head ellipses (no height)',fill='white');full.save(DOC/'ellipse-source-overlay-v1.png')
panel=Image.new('RGB',(1280,544),(25,27,30));dr=ImageDraw.Draw(panel)
for i,(label,centre,radius)in enumerate(rows):
 x,y=centre;px=i%4*320;py=i//4*272;box=(round(x)-38,round(y)-38,round(x)+38,round(y)+38)
 dr.text((px+3,py+4),label+' c'+str(centre)+' r'+str(radius),fill='white');dr.text((px+3,py+20),'Actual RGB / ellipse outline;2xnearest',fill='white');panel.paste(im.crop(box).resize((152,152),Image.Resampling.NEAREST),(px,py+44));panel.paste(overlay.crop(box).resize((152,152),Image.Resampling.NEAREST),(px+160,py+44))
panel.save(DOC/'eight-ellipse-metal-contact-details-v1.png')
j={'schemaVersion':1,'state':'SOURCE-MEASURED ANALYTIC CAP PLAN ONLY; no scalar or master created','nativeIdentity':'d007ea021eb38aceb69f2236c61cae889628abe4d1abc49beffd18c529bbee27','name':'rtex054','edition':'base','referenceSize':[64,64],'measurementRaster':[512,512],'coordinateConvention':'Master pixel edges; pixel(i,j) samples at(i+.5,j+.5). Native coordinates divide all master edges by8.','sourceRGB':w(source),'raw':w(BASE/'generated/rtex054.png'),'initialMasterPackage':w(BASE/'masters/rtex054-initial/master.json'),'sourceProof':w(DOC.parent/'independent-source-master/source-master-proof-v1.json'),'priorPhysicalHold':w(DOC.parent/'rounded-trial-physical-hold-v1.json'),'heads':heads,'diagnosticViews':[w(DOC/'ellipse-source-overlay-v1.png'),w(DOC/'eight-ellipse-metal-contact-details-v1.png')],'limits':['No source/head placement change or pixel resampling. These are geometry proposals, not generated assets.','Head/coating/contact interfaces remain mixed in actual photo. Ellipse support cannot prove material purity.','No analytic scalar trial, production implementation or tier derivation before independent plan review.'],'tool':w(Path(__file__))}
p=DOC/'ellipse-measurements-v1.json'
with p.open('x')as f:f.write(json.dumps(j,indent=2)+'\n')
print(json.dumps({'measurements':w(p),'views':j['diagnosticViews']}))
