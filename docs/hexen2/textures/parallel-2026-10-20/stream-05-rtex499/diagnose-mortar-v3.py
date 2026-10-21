"""Root-authorised alternatives only: existing compose_layered, no canonical package/tiers."""
from pathlib import Path
import json,sys,hashlib
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5];sys.path[:0]=[str(ROOT/'tools/texture_sheets'),str(ROOT/'tools')]
from prepare_layered_texture_master import compose_layered
from craft_normals import normals_from_height
D=Path(__file__).parent;E=ROOT/'docs/evidence/hexen2-textures-2026-10-20/stream-05-rtex499';B=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-05-rtex499'
old=json.loads((D/'mortar-network-proposal-v2.json').read_text());im=Image.open(B/'masters/rtex499/color.png').convert('RGB');rgb=np.asarray(im,float);initial=np.load(B/'masters/rtex499/height.npy',allow_pickle=False).astype(float)
A=[(.6,32.4,.7),(2,32.7,.5),(4,32.6,.5),(6,32.6,.5),(8,32.3,.55),(10,31.6,.6),(12,30.6,.7),(16,29.4,.8),(20,29.2,.9),(24,29.7,1),(28,29.8,.9),(32.5,30.2,1)]
Bline=[(31.5,64.6,.7),(34,65,.5),(38,65,.5),(42,64,.65),(46,63.5,.8),(50,63.8,.8),(54,63.5,.75),(58,63.8,.9),(63.6,63.5,1)]
Cbase=[(78,29.4,.8),(82,29.2,.8),(86,29.3,.9),(90,29.5,.9),(96,29.8,1)]
Cs={'v3a':[(64,30.8,.75),(66,30.8,.5),(70,30.8,.5),(74,30.2,.55)]+Cbase,'v3b':[(64,30.8,.75),(66,31.2,.5),(70,32,.5),(74,31,.55)]+Cbase}
def poly(c):return {'polygon':[[x-w,y] for y,x,w in c]+[[x+w,y] for y,x,w in reversed(c)]}
records=[];witnesses={'pale-face-course2-left':(11,35),'pale-face-course4':(85,101),'pale-face-A-peak':(31,6),'pale-face-B-peak':(63.5,38),'observed-joint-A-below':(29.4,18),'observed-joint-B-below':(63.8,50),'observed-joint-C-below':(29.4,82),'face-course2-left':(32,48),'face-course4-right':(96,112)}
for tag,C in Cs.items():
 layer=json.loads(json.dumps(old['layeringProposal']));layer['brickRegions'][3]=poly(A);layer['brickRegions'][5]=poly(Bline);layer['brickRegions'][6]=poly(C)
 height,mask,sigma=compose_layered(initial,layer);np.save(E/(tag+'-DIAGNOSTIC-height.npy'),height,allow_pickle=False);_,normal=normals_from_height(height,.3,.5);sel=mask>.5;overlay=rgb.copy();overlay[sel]=overlay[sel]*.55+np.array([20,120,245])*.45;border=sel^(np.roll(sel,1,0)&np.roll(sel,-1,0)&np.roll(sel,1,1)&np.roll(sel,-1,1));overlay[border]=[245,65,40];Image.fromarray(np.uint8(overlay)).save(E/(tag+'-overlay.png'))
 canv=Image.new('RGB',(2048,2048),(28,30,33));canv.paste(im,(0,0));canv.paste(Image.fromarray(np.uint8(height*255)).convert('RGB'),(1024,0))
 for j,light in enumerate((np.array([.6,.3,.75]),np.array([-.6,-.3,.75]))):
  light=light/np.linalg.norm(light);amp=.35+.65*np.clip((normal*light).sum(2),0,1);canv.paste(Image.fromarray(np.uint8(np.clip(rgb*amp[:,:,None],0,255))),(j*1024,1024))
 canv.save(E/(tag+'-DIAGNOSTIC-height-opposed.png'))
 vals=[]
 for name,(x,y) in witnesses.items():
  xx=round(x*8);yy=round(y*8);patch=height[np.ix_(np.arange(yy-3,yy+4)%1024,np.arange(xx-3,xx+4)%1024)];vals.append({'name':name,'nativeFrame':[x,y],'maskAtCentre':bool(sel[yy,xx]),'heightAtCentre':float(height[yy,xx]),'mean7x7':float(patch.mean())})
 record={'tag':tag,'scope':'DIAGNOSTIC ONLY; no canonical/ART/tier qualification','layeringProposal':layer,'controls':{'A':A,'B':Bline,'C':C},'anchors':{'A':{'visibleBelow':[29.4,16],'inferredUpperJointJunction':[32.4,.6],'interpretation':'Keep pale left-edge peak at31,6 on face; thin right arris contact near32.6 is inferred through occlusion, visible boundary to its right.'},'B':{'visibleBelow':[63.8,50],'inferredUpperJointJunction':[64.6,31.5],'interpretation':'Keep pale left-face peak63.5,38 upper; follow right arris near65 across marked uppercorner, returning to visible lower gap.'},'C':{'upperBondJunction':[30.8,64],'visibleBelow':[29.4,78],'interpretation':'One quarter-width course3 contact; v3a/v3b differ only by at most1.2nativepixels inside the pale-occluded span. Neither is measured hidden truth.'}},'scalarRanges':{'mortar':[float(height[sel].min()),float(height[sel].max())],'stone':[float(height[~sel].min()),float(height[~sel].max())]},'interfaceSigmaMasterPixels':sigma,'witnesses':vals,'diagnostics':[str((E/f).relative_to(ROOT)) for f in [tag+'-overlay.png',tag+'-DIAGNOSTIC-height-opposed.png',tag+'-DIAGNOSTIC-height.npy']]};(D/(tag+'-diagnostic.json')).write_text(json.dumps(record,indent=2)+'\n');records.append(record)
# Support crops compare actual source / corrected A+B mask / two C alternatives and real diagnostic lighting.
canvas=Image.new('RGB',(1600,1200),(28,30,33));draw=ImageDraw.Draw(canvas)
for j,(label,x,y) in enumerate([('A: left pale face / right arris',32,6),('B: left pale face / right arris',64,38),('C: same above/below anchors, bounded alternatives',31,70)]):
 box=((x-8)*8,(y-8)*8,(x+8)*8,(y+8)*8);top=j*400;draw.text((10,top+4),label+' | actual RGB | v3a geometry | v3b geometry | v3a relief/light detail',fill='white');canvas.paste(im.crop(box).resize((360,360),Image.Resampling.NEAREST),(10,top+30))
 for col,tag in enumerate(['v3a','v3b']):
  over=Image.open(E/(tag+'-overlay.png')).crop(box).resize((360,360),Image.Resampling.NEAREST);canvas.paste(over,(410+col*400,top+30))
 light=Image.open(E/'v3a-DIAGNOSTIC-height-opposed.png');lbox=(box[0],box[1]+1024,box[2],box[3]+1024);canvas.paste(light.crop(lbox).resize((360,360),Image.Resampling.NEAREST),(1210,top+30))
canvas.save(E/'v3-interface-alternatives-support.png');index={'scope':'Root-authorised diagnostic alternatives only; canonical producer and tiers not invoked','sourceMasterPackage':old['sourceMasterPackage'],'sourceMasterPackageSha256':old['sourceMasterPackageSha256'],'sourceProof':old['sourceProof'],'rootGeometryReview':{'file':str((D/'root-mortar-geometry-review.json').relative_to(ROOT)),'sha256':hashlib.sha256((D/'root-mortar-geometry-review.json').read_bytes()).hexdigest()},'code':{'file':str(Path(__file__).relative_to(ROOT)),'sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},'existingComposeFunction':'tools/texture_sheets/prepare_layered_texture_master.py::compose_layered unchanged','alternatives':[{'file':str((D/(q['tag']+'-diagnostic.json')).relative_to(ROOT)),'sha256':hashlib.sha256((D/(q['tag']+'-diagnostic.json')).read_bytes()).hexdigest()} for q in records],'support':str((E/'v3-interface-alternatives-support.png').relative_to(ROOT)),'nextAction':'Root inspects masks, source arrises and diagnostic actual relief. Only a named accepted alternative may become a guarded canonical wrapper recipe.'};(D/'mortar-v3-diagnostic-index.json').write_text(json.dumps(index,indent=2)+'\n');print(json.dumps(index))
