"""Source-measured mortar-mask proposal; no master/tier output or producer changes."""
import sys,json,hashlib,datetime
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-06-mtex470';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-06-mtex470';M=B/'masters/mtex470';sys.path.insert(0,str(R/'tools/texture_sheets'));from update_level_sheets import brick_mask
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(R));c=Image.open(M/'color.png').convert('RGB')
# Actual master-pixel edge contours, manually measured on this registered source.
regions=[
 ('left internal vertical joint',[[131,0],[141,0],[141,80],[140,140],[142,200],[141,285],[143,351],[133,359],[130,310],[131,230],[130,150],[130,80]]),
 ('upper internal horizontal joint',[[141,142],[220,143],[300,142],[357,142],[400,143],[512,142],[512,152],[400,153],[357,152],[300,151],[220,152],[141,153]]),
 ('right internal vertical joint',[[357,152],[368,152],[369,220],[368,300],[368,360],[369,420],[368,512],[357,512],[357,420],[356,360],[357,300],[356,220]]),
 ('lower internal horizontal joint',[[0,357],[70,357],[132,355],[200,356],[280,356],[357,355],[358,367],[280,367],[200,367],[132,368],[70,367],[0,368]]),
 ('existing top perimeter joint',[[0,0],[512,0],[512,3],[450,3],[350,3],[250,3],[145,4],[132,4],[80,3],[10,4],[0,6]]),
 ('existing bottom perimeter joint',[[0,509],[100,509],[200,508],[300,509],[357,508],[450,508],[512,509],[512,512],[0,512]]),
 ('existing left perimeter joint',[[0,0],[3,0],[3,100],[2,200],[3,300],[3,357],[3,450],[3,512],[0,512]]),
 ('existing right perimeter joint',[[509,0],[512,0],[512,512],[509,512],[509,400],[509,300],[509,200],[509,100]])]
layer={'referenceSize':[64,64],'facingHeight':.68,'brickHeight':.29,'chipFloor':.56,'microAmplitude':.035,'bevelPixels':.5,'brickRegions':[{'polygon':[[x/8,y/8]for x,y in poly]}for label,poly in regions]}
mask=brick_mask((512,512),layer);ma=mask>.5;arr=np.asarray(c).copy();out=arr.copy();out[ma]=np.round(arr[ma]*.35+np.array([40,180,255])*.65).astype('uint8');overlay=Image.fromarray(out);dr=ImageDraw.Draw(overlay)
for label,poly in regions:dr.line([tuple(p)for p in poly+[poly[0]]],fill=(0,255,255),width=1)
overlay.save(D/'proposed-mortar-overlay.png');Image.fromarray(np.uint8(ma)*255).save(D/'proposed-mortar-mask.png')
# Exact 1:1 original/overlay region pairs, with readable labels outside image content.
crops=[('Left joint',(112,180,159,300)),('Top joint',(180,128,300,165)),('Right joint',(340,190,389,310)),('Bottom joint',(180,340,300,385)),('Tile boundary',(0,0,160,25))]
s=Image.new('RGB',(512,680),(25,27,30));sd=ImageDraw.Draw(s)
for i,(label,box)in enumerate(crops):
 y=i*135;sd.text((4,y+4),label+' actual RGB | proposed mask',fill='white');s.paste(c.crop(box),(4,y+24));s.paste(overlay.crop(box),(260,y+24))
s.save(D/'proposed-mortar-crops-1to1.png')
proof=D/'root-source-master-proof-v2.json';assert sha(proof)=='8cf7a2fec0b3a2ba668fad55fe381561f5b291c2e767be93b053a29bd053c266'
recipe={'schemaVersion':1,'policy':'layered-veneer','nativeIdentity':'e068750f3f11baad13dc050abc9fc5a3e860fbe9a450a653364315dccfb4209f','name':'mtex470','edition':'base','nativeDimensions':[64,64],'sourceMasterPackage':rel(M/'master.json'),'sourceMasterPackageSha256':sha(M/'master.json'),'sourceVerification':{'file':rel(proof),'sha256':sha(proof)},'originalSha256':'1492faf7b58e1861012a4eb39f0ebf2f17ea0fbb5ea301c53e6108bc32dcbfdf','authoringDiffuseSha256':sha(M/'color.png'),'authoredAtMasterDimensions':[512,512],'layering':layer}
(B/'relief').mkdir(exist_ok=True);recipepath=B/'relief/mtex470-mortar-proposal-v1.json';recipepath.write_text(json.dumps(recipe,indent=2)+'\n')
witnesses=json.loads((D/'pre-tier-self-check.json').read_text())['samples'];classcheck=[]
for p in witnesses:
 x,y=p['masterPixel'];region=ma[y-3:y+4,x-3:x+4];classcheck.append({'label':p['label'],'physicalClass':p['physicalClass'],'masterPixel':[x,y],'maskAtCenter':bool(ma[y,x]),'maskedFractionRadius3':float(region.mean())})
report={'state':'PROPOSAL ONLY: awaiting independent root mask/physical-plan review before canonical wrapper','recipe':{'file':rel(recipepath),'sha256':sha(recipepath)},'maskMeaning':'True is visibly existing recessed mortar; all five stone interiors remain on one facing plane. This is source-specific manual geometry, not brightness thresholding.','coordinateMeaning':'Recipe polygons use native pixel-edge coordinates obtained by dividing manually measured 512-master positions by 8.','regions':[{'label':label,'masterPixelEdgePolygon':poly}for label,poly in regions],'physicalPlanes':{'stoneFace':.68,'mortar':.29,'interfaceFacingFloor':.56,'boundedDetailAmplitude':.035,'maximumDetailPeakToPeak':.07,'interfaceSigmaMasterPixels':1.0,'interfaceExplanation':'bevelPixels .5 uses maintained 256-reference convention: .5 * 512/256 = 1 master pixel. Only actual stone/mortar interfaces; no added RGB shading or image border.'},'appearanceIntent':'Suppress pigment-induced stone offsets while retaining bounded source stone wear. Existing craft detail contributes at most plus/minus .035; no generated or procedural noise. Exact RGB remains byte-identical.','maskFraction':float(ma.mean()),'witnessClassification':classcheck,'observations':'Four internal joints and existing narrow tile-perimeter mortar. Slab edge chips and rounded arrises stay on the facing side and use the narrow existing interface floor. No new block is introduced.','reviewLimits':'The full scalar height and lights have not yet been authored under the canonical wrapper. Root must check actual overlay/crops before approving this recipe.','inputs':{rel(p):sha(p) for p in [Path(__file__),M/'master.json',M/'color.png',M/'height.npy',proof,D/'pre-tier-self-check.json']},'views':{rel(p):sha(p) for p in [D/'proposed-mortar-overlay.png',D/'proposed-mortar-mask.png',D/'proposed-mortar-crops-1to1.png']},'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(D/'mortar-plan-proposal-v1.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'recipeSha256':sha(recipepath),'proposalSha256':sha(D/'mortar-plan-proposal-v1.json'),'maskFraction':report['maskFraction'],'witnessClassification':classcheck},indent=2))
