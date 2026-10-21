"""Bounded upper-contact correction; unchanged lower guides. No height compose."""
from pathlib import Path
import sys,json
from PIL import Image,ImageDraw
import numpy as np
R=Path('/Users/bri/SOURCE/Quaked');D=Path(__file__).parent;A=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018'
sys.path.insert(0,str(R/'tools'));sys.path.insert(0,str(R/'tools/texture_sheets'))
from update_level_sheets import brick_mask
old=json.loads((D.parent/'baseline-layered-plan-v1/pane-guide.json').read_text());regions=old['regions']
left_upper=[[149,147],[145,153],[139,161],[132,170],[124,179],[115,189],[108,196],[126,198],[140,199],[150,202],[148,190],[147,177],[147,162]]
left_lower=[[102,208],[114,211],[129,213],[141,214],[128,217],[113,220],[100,224],[95,228],[97,218]]
left_lobe=[[149,245],[161,246],[168,250],[172,258],[174,267],[178,276],[182,284],[188,292],[197,300],[205,308],[210,316],[212,323],[208,331],[200,338],[188,346],[172,352],[153,354],[134,350],[116,344],[100,332],[89,316],[84,297],[86,280],[96,264],[113,252],[132,246]]
new={'inner-left-upper-wedge':left_upper,'inner-left-lower-wedge':left_lower,'left-round-lobe':left_lobe}
for left,right in [('inner-left-upper-wedge','inner-right-upper-wedge'),('inner-left-lower-wedge','inner-right-lower-wedge'),('left-round-lobe','right-round-lobe')]:
 new[right]=[[512-x,y]for x,y in reversed(new[left])]
for region in regions:
 if region['id']in new:
  region['sourceMasterPixels']=new[region['id']];region['polygon']=[[x/8,y/8]for x,y in region['sourceMasterPixels']]
guide={**old,'status':'V2_UPPER_CONTACT_CORRECTION_PENDING03ROSETTE_POCKETS_NO_HEIGHT_COMPOSE','regions':regions,'layering':{**old['layering'],'brickRegions':[{'polygon':r['polygon']}for r in regions]},'change':'Six source-traced upperwedge/lobe polygons corrected from actualsameboundsRGB; all otherregions unchanged. Fourrosette-surroundingglass pockets reserved to03, not yet included.'}
mask=brick_mask((2048,512),guide['layering'])>.5
source=np.asarray(Image.open(A/'art-variants/woodland-bridge/masters/initial-v1/color.png').convert('RGB'));out=source.copy();out[mask]=np.rint(.7*source[mask]+.3*np.array([40,160,255])).astype('uint8');im=Image.fromarray(out);draw=ImageDraw.Draw(im)
for r in regions:draw.line([tuple(p)for p in r['sourceMasterPixels']]+[tuple(r['sourceMasterPixels'][0])],fill=(40,210,255),width=1)
im.save(D/'upper-corrected-overlay-pending-pockets.png');im.crop((0,0,512,570)).save(D/'top-corrected-overlay-pending-pockets.png');Image.fromarray(mask.astype('uint8')*255).save(D/'upper-corrected-mask-pending-pockets.png')
checks=[]
for label,x,y,want in [('leftstructuralring1',157,177,False),('leftstructuralring2',161,187,False),('rightstructuralring',355,178,False),('leftlowerstructuralring',170,216,False),('rightlowerstructuralring',345,216,False),('actualleftwedgeglass',135,188,True),('leftlobering',215,290,False),('leftlobering2',222,301,False),('rightlobering',290,298,False)]:
 assert bool(mask[y,x])==want,(label,x,y);checks.append({'role':label,'point':[x,y],'paneMasked':bool(mask[y,x]),'expectedPane':want})
oldmap={r['id']:r for r in json.loads((D.parent/'baseline-layered-plan-v1/pane-guide.json').read_text())['regions']};assert all(r==oldmap[r['id']]for r in regions if r['id']not in new)
guide['correctionChecks']=checks;guide['correctedRegionIDs']=list(new);guide['lowerRegionsUnchanged']=True;guide['statistics']={'regionCount':len(regions),'paneMaskPixels':int(mask.sum()),'paneMaskFraction':float(mask.mean()),'imagePerimeterMasked':bool(mask[0].any()or mask[-1].any()or mask[:,0].any()or mask[:,-1].any()),'bevelSigmaMasterPixels':2.0}
(D/'upper-corrected-guide-pending-pockets.json').write_text(json.dumps(guide,indent=2)+'\n');print('Six upperpolygons corrected;9classifiedchecks pass; allotherregions exact;03pockets pending.')
