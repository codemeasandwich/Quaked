"""Diagnostic geometry proposal only. Never writes height/master/tier assets."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5]
sys.path[:0]=[str(ROOT/'tools/texture_sheets'),str(ROOT/'tools')]
from update_level_sheets import brick_mask
B=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-05-rtex499'
D=Path(__file__).parent;E=ROOT/'docs/evidence/hexen2-textures-2026-10-20/stream-05-rtex499'
# Manual native-frame centre/halfwidth observations of continuous registered stone arrises.
# No darkest-pixel, whiteness threshold or height is used to choose these controls.
H=[
[(0,33.5,.9),(8,31.3,.6),(16,31,.7),(24,30.5,.9),(32,32.5,.8),(40,33.5,.7),(48,31.5,.6),(56,31,.8),(64,31.25,.9),(72,31.5,.7),(80,31,.7),(88,31,.8),(96,30.5,.9),(104,30,.8),(112,30.5,.7),(120,31.5,.7),(128,33.5,.9)],
[(0,63.6,1),(8,63.9,.8),(16,64.6,.9),(24,64.5,.9),(32,63.75,1),(40,62.4,.9),(48,62.5,.9),(56,62.6,.7),(64,62.75,1),(72,63.6,.8),(80,64,.8),(88,64.25,.9),(96,64.4,1),(104,64.75,1),(112,65.1,1),(120,64.75,.9),(128,63.6,1)],
[(0,96.9,.9),(8,96.4,.8),(16,96.1,.8),(24,95.4,.9),(32,95.25,.9),(40,96.5,.8),(48,96.6,.8),(56,96.1,.9),(64,97.6,1),(72,97,.9),(80,97.4,.9),(88,96.25,.9),(96,95.4,1),(104,95.6,.9),(112,96.4,.8),(120,96.6,.9),(128,96.9,.9)]]
V=[
('course1-left',[(.6,31,.6),(4,31,.5),(8,30.9,.5),(12,30,.7),(16,29.4,.8),(20,29.2,.9),(24,29.7,1),(28,29.8,.9),(32.5,30.2,1)]),
('course1-right',[(.6,94,.8),(6,93.8,.7),(12,94,.6),(18,94,.8),(24,94.4,.8),(30.5,94.5,1)]),
('course2-centre',[(31.5,63.4,.8),(34,63.4,.55),(38,63.3,.55),(42,63,.7),(46,63.5,.8),(50,63.8,.8),(54,63.5,.75),(58,63.8,.9),(63.6,63.5,1)]),
('course3-left',[(64,31,.75),(66,31.2,.55),(70,31.8,.55),(74,31,.6),(78,29.4,.8),(82,29.2,.8),(86,29.3,.9),(90,29.5,.9),(96,29.8,1)]),
('course3-right',[(64,94,.9),(70,94.3,.8),(76,94,.7),(82,94.5,.8),(88,93.5,.8),(94,94,.9),(96.5,94.1,1)]),
('course4-centre',[(96.5,64.3,.9),(102,64,.7),(108,63.7,.7),(114,64.3,.8),(120,64.5,.8),(127.4,64.5,1)])]
def polygon(axis,control):
 lo=[];hi=[]
 for v,c,w in control:
  if axis=='y':lo.append([v,max(0,c-w)]);hi.append([v,min(128,c+w)])
  else:lo.append([max(0,c-w),v]);hi.append([min(128,c+w),v])
 return {'polygon':lo+list(reversed(hi))}
regions=[polygon('y',x) for x in H]+[polygon('x',x) for _,x in V]
regions.extend([{'polygon':[[0,0],[128,0],[128,.65],[0,.65]]},{'polygon':[[0,127.35],[128,127.35],[128,128],[0,128]]}])
for y0,y1 in [(32,64),(96,128)]:regions.extend([{'polygon':[[0,y0],[.65,y0],[.65,y1],[0,y1]]},{'polygon':[[127.35,y0],[128,y0],[128,y1],[127.35,y1]]}])
layer={'referenceSize':[128,128],'facingHeight':.66,'brickHeight':.29,'chipFloor':.54,'microAmplitude':.025,'bevelPixels':.35,'brickRegions':regions}
im=Image.open(B/'masters/rtex499/color.png').convert('RGB');a=np.asarray(im,float);mask=brick_mask((1024,1024),layer);sel=mask>.5;overlay=a.copy();overlay[sel]=overlay[sel]*.55+np.array([20,120,245])*.45;border=sel^(np.roll(sel,1,0)&np.roll(sel,-1,0)&np.roll(sel,1,1)&np.roll(sel,-1,1));overlay[border]=[245,65,40];out=Image.fromarray(np.uint8(overlay));draw=ImageDraw.Draw(out)
latent=[{'label':'A: latent under pale mark','nativeBounds':[29.6,.6,32.0,11],'support':'Native quarter-width bond, top horizontal-joint junction, visible same stone arrises below y12; narrow continuation is a hypothesis, not measured void.'}, {'label':'B: latent under pale mark','nativeBounds':[62.1,31.5,64.6,42],'support':'Native half-width course2 bond and continuous left/right stone arrises into visible joint below y42; no added block.'}, {'label':'C: latent under pale mark','nativeBounds':[29.8,64,33.0,75.5],'support':'Native quarter-width course3 bond and visible continuous arrises/gap below y76, intersecting known horizontal joint above. Hypothesised contact occlusion only.'}]
for q in latent:
 box=tuple(round(v*8) for v in q['nativeBounds']);draw.rectangle(box,outline=(255,220,0),width=2);draw.text((box[0]+4,box[1]+2),q['label'][0],fill=(255,220,0))
out.save(E/'proposed-mortar-network-v2-overlay.png');Image.fromarray(np.uint8(mask*255)).save(E/'proposed-mortar-network-v2-mask.png')
# Actual-source support crops and scalar cross-sections; these do not author relief.
native=Image.open(B/'originals/01-rtex499-4461c8b9623b.png').convert('RGB');height=np.load(B/'masters/rtex499/height.npy',allow_pickle=False);L=a@np.array([.299,.587,.114]);canvas=Image.new('RGB',(1440,1080),(28,30,33));dr=ImageDraw.Draw(canvas);sections=[]
for row,(q,y,centre) in enumerate(zip(latent,[6,38,70],[31,63.3,31.8])):
 x0=int(centre)-8;y0=int(y)-8;box=(x0,y0,x0+16,y0+16);top=row*360;dr.text((10,top+4),q['label']+' / original native (nearest) / actual registered RGB / proposed latent topology / row cross-section',fill='white')
 canvas.paste(native.crop(box).resize((320,320),Image.Resampling.NEAREST),(10,top+28));pbox=tuple(v*8 for v in box);canvas.paste(im.crop(pbox).resize((320,320),Image.Resampling.NEAREST),(350,top+28));canvas.paste(out.crop(pbox).resize((320,320),Image.Resampling.NEAREST),(690,top+28))
 yy=round(y*8);xs=np.arange(max(0,round((centre-6)*8)),min(1024,round((centre+6)*8))+1);left=1050;right=1410;base=top+325;high=top+65;dr.rectangle((left,high,right,base),outline='white');values=[]
 for x in xs:values.append({'nativeX':float(x/8),'RGBLuminance':float(L[yy,x]),'initialTonalHeight':float(height[yy,x]),'proposedMortarMask':bool(sel[yy,x])})
 for role,col,scale in [('RGBLuminance',(200,200,200),255),('initialTonalHeight',(245,90,170),1)]:
  pts=[(left+(i/(len(values)-1))*(right-left),base-v[role]/scale*(base-high)) for i,v in enumerate(values)];dr.line(pts,fill=col,width=2)
 for i,v in enumerate(values):
  if v['proposedMortarMask']:dr.line((left+i/(len(values)-1)*(right-left),base,left+i/(len(values)-1)*(right-left),base-8),fill=(30,140,250),width=2)
 dr.text((1040,top+28),f'y={y}native; grey=L, pink=initialH, blue=proposedgap',fill='white');sections.append({'label':q['label'],'nativeY':y,'samples':values})
canvas.save(E/'occluded-interface-support-v2.png')
proof=D/'root-source-master-proof-v2.json';proposal={'schemaVersion':1,'scope':'DIAGNOSTIC GEOMETRY PROPOSAL ONLY; no height recipe/output or accepted classification','sourceMasterPackage':str((B/'masters/rtex499/master.json').relative_to(ROOT)),'sourceMasterPackageSha256':hashlib.sha256((B/'masters/rtex499/master.json').read_bytes()).hexdigest(),'sourceProof':{'file':str(proof.relative_to(ROOT)),'sha256':hashlib.sha256(proof.read_bytes()).hexdigest()},'method':'Manual continuous registered stone-arrises interpretation and native four-course bond; v1 darkest-pixel network rejected. Yellow bounds are explicit latent hypotheses across pale-occluded endpoints, not measured truth. Blue lower-mortar regions elsewhere follow visible continuous interfaces, red is proposed interface boundary.','layeringProposal':layer,'horizontalManualControls':H,'verticalManualControls':dict(V),'latentInterfaces':latent,'crossSections':sections,'diagnostics':[str((E/f).relative_to(ROOT)) for f in ['proposed-mortar-network-v2-overlay.png','proposed-mortar-network-v2-mask.png','occluded-interface-support-v2.png']],'parametersIntent':'One coherent stone upper plane including pale stains; only physically classified mortar is lower. Existing full-precision detail bounded to +/-0.025, rather than saturating pale marks into a coating. Interface sigma1.4masterpixels; intended joints only, no added perimeterbevel.','requires':'Root actual geometry review of visible/latent classes and all intersections/wrap before a guarded existing layered wrapper may be invoked.'};(D/'mortar-network-proposal-v2.json').write_text(json.dumps(proposal,indent=2)+'\n');print(json.dumps({'proposal':str((D/'mortar-network-proposal-v2.json').relative_to(ROOT)),'sha256':hashlib.sha256((D/'mortar-network-proposal-v2.json').read_bytes()).hexdigest(),'mortarFraction':float(sel.mean())}))
