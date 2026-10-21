"""Source-measured pane polygons and diagnostic mask only; no height compose."""
from pathlib import Path
import sys,json,hashlib
from PIL import Image,ImageDraw
import numpy as np
R=Path('/Users/bri/SOURCE/Quaked');D=Path(__file__).parent;A=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018'
sys.path.insert(0,str(R/'tools'));sys.path.insert(0,str(R/'tools/texture_sheets'))
from update_level_sheets import brick_mask
regions=[]
def add(label,pts):regions.append({'id':label,'role':'inset stained-glass pane','sourceMasterPixels':pts,'polygon':[[x/8,y/8]for x,y in pts]})
def mirror(label,pts):add(label,[[512-x,y]for x,y in reversed(pts)])
# Actual exterior spandrels are split at the visible horizontal came.
for label,pts in [
 ('outer-upper-left',[[33,32],[182,32],[130,80],[33,80]]),
 ('outer-middle-left',[[33,96],[119,96],[58,170],[33,170]]),
 ('outer-lower-left',[[34,186],[48,186],[34,234]]),
 ('apex-glass',[[210,81],[255,45],[300,81]]),
 ('inner-left-upper-wedge',[[133,201],[171,149],[171,196]]),
 ('inner-left-lower-wedge',[[119,213],[169,207],[179,225],[112,231]]),
 ('lower-left-small-pocket',[[42,346],[47,336],[56,352],[65,360],[41,360]]),
 ('left-lower-spandrel',[[42,375],[95,375],[42,422]]),
 ('left-inner-triangle',[[172,389],[235,371],[236,455]]),
 ('left-pointed-pane',[[41,492],[136,406],[237,500],[237,521],[40,521]])]:
 add(label,pts)
 if label!='apex-glass':mirror(label.replace('left','right'),pts)
add('top-round-lobe',[[191,179],[191,159],[196,140],[207,127],[225,118],[247,114],[269,115],[290,122],[306,135],[317,152],[320,171],[317,187],[308,199],[290,196],[273,193],[256,195],[236,194],[218,199],[201,198]])
pts=[[153,244],[172,246],[188,252],[200,264],[208,278],[217,285],[226,291],[227,305],[223,320],[213,333],[198,344],[179,351],[158,353],[136,351],[116,344],[99,332],[88,316],[83,297],[86,280],[96,264],[113,252],[132,246]]
add('left-round-lobe',pts);mirror('right-round-lobe',pts)
add('small-central-four-lobed-pane',[[254,226],[265,229],[271,237],[271,247],[282,244],[290,249],[292,259],[286,268],[274,271],[272,283],[263,291],[252,290],[242,284],[239,273],[226,275],[218,266],[216,255],[223,247],[234,246],[236,235],[245,228]])
# Pixel-edge coordinates follow photographed glass/came contacts, not the scene colours.
for i,(y0,y1) in enumerate([(541,691),(711,869),(888,1039),(1057,1114),(1131,1217),(1234,1273),(1296,1451),(1474,1574),(1597,1767),(1783,1881),(1900,1997)]):
 add('lower-left-'+str(i+1),[[41,y0],[237,y0],[237,y1],[41,y1]])
 add('lower-right-'+str(i+1),[[274,y0],[470,y0],[470,y1],[274,y1]])
layering={'referenceSize':[64,256],'facingHeight':.52,'brickHeight':.5,'chipFloor':.505,'microAmplitude':0,'bevelPixels':.5,'brickRegions':[{'polygon':r['polygon']}for r in regions]}
mask=brick_mask((2048,512),layering);inside=mask>.5;assert not inside[0].any()and not inside[-1].any()and not inside[:,0].any()and not inside[:,-1].any()
source=np.array(Image.open(A/'art-variants/woodland-bridge/masters/initial-v1/color.png').convert('RGB'));overlay=source.copy();overlay[inside]=np.rint(.7*source[inside]+.3*np.array([40,160,255])).astype('uint8');im=Image.fromarray(overlay);draw=ImageDraw.Draw(im)
for r in regions:draw.line([tuple(p)for p in r['sourceMasterPixels']]+[tuple(r['sourceMasterPixels'][0])],fill=(40,210,255),width=1)
im.save(D/'pane-guide-overlay.png');Image.fromarray(np.uint8(inside)*255).save(D/'pane-guide-mask.png')
im.crop((0,0,512,570)).save(D/'top-pane-guide-overlay.png');im.crop((0,1200,512,2048)).save(D/'lower-pane-guide-overlay.png')
guide={'status':'SOURCE_GEOMETRY_PROPOSAL_FOR_REVIEW_NO_HEIGHT_COMPOSE','source':str((A/'art-variants/woodland-bridge/masters/initial-v1/color.png').relative_to(R)),'coordinateConvention':'ImageDraw filled polygons atnativecoordinatesx8; listed sourceMasterPixels are literal512x2048pixel-edge guide coordinates.','regions':regions,'layering':layering,'statistics':{'regionCount':len(regions),'paneMaskPixels':int(inside.sum()),'paneMaskFraction':float(inside.mean()),'imagePerimeterMasked':False,'bevelSigmaMasterPixels':2.0},'uncertainties':['Thinspandrels and curves are source-traced finitepolygons, not mathematicallyrecovered original geometry. Actualoverlay review required.','Lowerdarkopticalpaint stays pane regardlessof colour; narrowcame remains upper.','No wholeclass colourthreshold or proceduralheight used.']}
(D/'pane-guide.json').write_text(json.dumps(guide,indent=2)+'\n');print(json.dumps(guide['statistics']))
