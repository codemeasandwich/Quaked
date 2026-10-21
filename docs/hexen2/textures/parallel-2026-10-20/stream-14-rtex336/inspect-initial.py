"""Source-bound rectangular pre-tier diagnostic, no maps or auto ART verdict."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5];DOC=Path(__file__).resolve().parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-14-rtex336'; MP=BASE/'masters/rtex336-initial'
sys.path.insert(0,str(ROOT/'tests'));from hexen2_texture_tiers_test import cyclic_normals
rgb=Image.open(MP/'color.png').convert('RGB');a=np.asarray(rgb);h=np.load(MP/'height.npy',allow_pickle=False);ht,wd=h.shape
w=lambda p:{'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
rgb.save(DOC/'initial-master-RGB.png'); Image.fromarray(np.uint8(h*255)).save(DOC/'initial-master-height.png')
n=cyclic_normals(h.astype(float));Image.fromarray(np.uint8((n*.5+.5)*255)).save(DOC/'initial-master-XYZ.png')
for neutral in (True,False):
 sheet=Image.new('RGB',(wd*2,ht+24),(25,27,30));dr=ImageDraw.Draw(sheet)
 for i,di in enumerate((np.array([.6,.3,.75]),np.array([-.6,-.3,.75]))):
  di=di/np.linalg.norm(di);li=.35+.65*np.clip((n*di).sum(2),0,1);colors=np.full_like(a,160)if neutral else a
  sheet.paste(Image.fromarray(np.uint8(np.clip(colors*li[:,:,None],0,255))),(i*wd,24));dr.text((i*wd+4,4),'Actual initial float '+('neutral'if neutral else'textured')+' opposed '+str(i),fill='white')
 sheet.save(DOC/('initial-master-'+('neutral'if neutral else'textured')+'-opposed.png'))
repeat=Image.fromarray(np.tile(a,(2,2,1)));repeat.save(DOC/'initial-master-repeat.png')
# Full literal joins without strip omission. Individual strips are actual resolution.
Image.fromarray(np.concatenate([a[:,-32:],a[:,:32]],1)).save(DOC/'initial-master-X-full.png')
Image.fromarray(np.concatenate([a[-32:],a[:32]],0)).save(DOC/'initial-master-Y-full.png')
Image.fromarray(np.concatenate([np.concatenate([a[-32:,-32:],a[-32:,:32]],1),np.concatenate([a[:32,-32:],a[:32,:32]],1)],0)).save(DOC/'initial-master-corner.png')
orig=Image.open(BASE/'originals/01-rtex336-6879799910e3.png').convert('RGB');comp=Image.new('RGB',(600,400),(25,27,30));dr=ImageDraw.Draw(comp)
for i,ds in enumerate(((32,64),(16,32))):
 for j,im in enumerate((orig,rgb)):
  tile=im.resize(ds,Image.Resampling.BOX).resize((ds[0]*4,ds[1]*4),Image.Resampling.NEAREST);comp.paste(tile,(10+i*300+j*140,30));dr.text((10+i*300+j*140,4),('Low 'if j==0 else'RGB ')+str(ds),fill='white')
comp.save(DOC/'initial-master-BOX32-16.png')
points=[('A','upper left body',95,105),('B','upper right body',405,120),('C','broad second body',250,400),('D','third left body',105,690),('E','third right body',420,700),('F','lowest body',250,930),('S1','coolgrey upperleft patch',260,220),('S2','dark upperleft face patch',155,120),('S3','coolgrey lower broad patch',175,895),('H1','first horizontal dark contact',200,278),('H2','second horizontal contact',350,548),('H3','third horizontal contact',125,839),('V1','top vertical contact',302,150),('V3','third vertical contact',274,690),('X2','second side wrap contact',0,400),('Y','horizontal wrap contact',350,0)]
samples=[];panel=Image.new('RGB',(1024,920),(25,27,30));dr=ImageDraw.Draw(panel)
for i,(label,kind,x,y)in enumerate(points):
 px=i%8*128;py=i//8*460;patch=np.roll(a,(-y+32,-x+32),(0,1))[:64,:64];panel.paste(Image.fromarray(patch).resize((128,128),Image.Resampling.NEAREST),(px,py+44));dr.text((px+2,py+2),label+' '+str([x,y]),fill='white');dr.text((px+2,py+18),kind[:19],fill='white');dr.rectangle((px+60,py+104,px+68,py+112),outline='red')
 ys=(np.arange(y-3,y+4)%ht)[:,None];xs=(np.arange(x-3,x+4)%wd)[None,:];v=h[ys,xs];samples.append({'label':label,'sourceClassCandidate':kind,'masterPixel':[x,y],'radius':3,'RGBcenter':a[y,x].tolist(),'heightCenter':float(h[y,x]),'heightMean':float(v.mean()),'heightRange':[float(v.min()),float(v.max())]});dr.text((px+2,py+180),str(round(float(v.mean()),4)),fill='white')
panel.save(DOC/'initial-physical-witnesses.png')
report={'schemaVersion':1,'state':'Observed initial pre-tier diagnostics; visual physical gate separate','nativeIdentity':'6879799910e3c79bcc11e600e8975856fff356eedc1d04b5764b451a6653fae8','masterPackage':w(MP/'master.json'),'raw':w(BASE/'generated/rtex336.png'),'prompt':w(BASE/'prompts/rtex336-material-v1.txt'),'journal':w(BASE/'selection.json'),'generationCount':1,'rawDimensions':[887,1774],'canonicalDimensions':[512,1024],'heightRange':[float(h.min()),float(h.max())],'samples':samples,'views':[w(p)for p in sorted(DOC.glob('initial-*.png'))],'limits':['Source point classifications need actual RGB and neutral-light review.','No tiers or source/master/final acceptance inferred from scalar diagnostics.'],'tool':w(Path(__file__))}
with (DOC/'initial-physical-check.json').open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'masterPackage':report['masterPackage'],'heightRange':report['heightRange'],'samples':samples},indent=2))
