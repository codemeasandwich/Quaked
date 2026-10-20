"""Actual canonical pre-tier diagnostic only; no height authoring or tier encoding."""
from pathlib import Path
import json,hashlib,sys,datetime
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[5];sys.path[:0]=[str(R/'tools'),str(R/'tools/texture_sheets')]
from craft_normals import normals_from_height
from update_level_sheets import brick_mask
B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-05-rtex499';D=Path(__file__).parent;E=R/'docs/evidence/hexen2-textures-2026-10-20/stream-05-rtex499/canonical-pre-tier';E.mkdir(exist_ok=False)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();ref=lambda p:{'file':str(p.relative_to(R)),'sha256':sha(p)}
P=B/'masters/rtex499-layered';im=Image.open(P/'color.png').convert('RGB');rgb=np.asarray(im,float);h=np.load(P/'height.npy',allow_pickle=False);recipe=json.loads((B/'relief/rtex499-mortar-v3a.json').read_text());mask=brick_mask(h.shape,recipe['layering'])>.5;_,n=normals_from_height(h,.3,.5)
assert sha(P/'color.png')==sha(B/'masters/rtex499/color.png');assert h.dtype==np.float32 and h.shape==(1024,1024) and np.isfinite(h).all();assert h[mask].max()<h[~mask].min()
Image.fromarray(np.uint8(np.clip(h*255,0,255))).save(E/'actual-height-1to1.png')
for tag,L in [('A',np.array([.6,.3,.75])),('B',np.array([-.6,-.3,.75]))]:
 L=L/np.linalg.norm(L);amp=.35+.65*np.clip((n*L).sum(2),0,1);Image.fromarray(np.uint8(np.clip(rgb*amp[:,:,None],0,255))).save(E/('actual-opposed-'+tag+'-1to1.png'))
rep=Image.fromarray(np.tile(np.asarray(im),(2,2,1)));rep.save(E/'actual-color-repeat2x2.png');rep.crop((768,768,1280,1280)).save(E/'actual-fourway-corner-1to1.png');reph=Image.fromarray(np.tile(np.uint8(h*255),(2,2)));reph.crop((768,768,1280,1280)).save(E/'actual-height-fourway-corner-1to1.png')
pts={'pale-face-A':(31,6),'pale-face-B':(63.5,38),'pale-face-C-left':(28.5,70),'pale-face-course2-left':(11,35),'pale-face-course4':(85,101),'latent-joint-A':(32.6,6),'latent-joint-B':(65,38),'latent-joint-C':(30.8,70),'visible-joint-A':(29.4,18),'visible-joint-B':(63.8,50),'visible-joint-C':(29.4,82),'stone-face-course1':(64,16),'stone-face-course2':(32,48),'stone-face-course3':(64,80),'stone-face-course4':(96,112)};w=[]
for name,(x,y) in pts.items():
 xx=round(x*8);yy=round(y*8);xs=np.arange(xx-3,xx+4)%1024;ys=np.arange(yy-3,yy+4)%1024;patch=h[np.ix_(ys,xs)];w.append({'label':name,'nativeFrame':[x,y],'masterPixel':[xx,yy],'proposedClass':'mortar' if mask[yy,xx] else 'stone','height':float(h[yy,xx]),'mean7x7':float(patch.mean()),'min7x7':float(patch.min()),'max7x7':float(patch.max()),'rgb':list(map(int,im.getpixel((xx,yy))))})
report={'scope':'Fresh actual canonical pre-tier self-check; independent root physical acceptance required before encoding','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'masterPackage':ref(P/'master.json'),'rgb':ref(P/'color.png'),'floatHeight':ref(P/'height.npy'),'recipe':ref(B/'relief/rtex499-mortar-v3a.json'),'RGBByteIdenticalToInitial':True,'fullPrecisionHeight':'float32 authored from source float64 detail then one final cast by guarded existing wrapper; diagnostic NPY never consumed','actualRanges':{'mortar':[float(h[mask].min()),float(h[mask].max())],'stoneIncludingInterfaces':[float(h[~mask].min()),float(h[~mask].max())]},'witnesses':w,'diagnostics':[ref(p) for p in sorted(E.iterdir())],'diagnosticCode':ref(Path(__file__)),'uncertainty':'Latent C path remains a bounded source-supported authoring interpretation, not measured hidden geometry; alternatives and rejected proposals retained.'};(D/'canonical-pre-tier-self-check.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'masterPackage':report['masterPackage'],'RGBByteIdentical':True,'ranges':report['actualRanges'],'witnesses':w},indent=2))
