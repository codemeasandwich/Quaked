"""Bounded rock3_2 master-trial diagnostics; no authoring, tuning or tier encoding."""
from pathlib import Path
import json,hashlib,sys,io
import numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[6]
sys.path.insert(0,str(root/'tools/texture_sheets'))
from derive_texture_tiers import normals_from_height
out=Path(__file__).resolve().parent
new=root/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/parallel-020/rock3_2/master-x-v1'
old=new.with_name('master');native=root/'assets/authoring/texture_sheets/sources/official-world-2026-10-17/native-rock3_2.png'
def b(f):return {'file':str(f.relative_to(root)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
m=json.loads((new/'master.json').read_text());color=Image.open(new/'color.png').convert('RGB');h=np.load(new/'height.npy',allow_pickle=False);a=np.asarray(color);s=color.width
assert s==512 and h.shape==(512,512) and h.dtype==np.float32 and np.isfinite(h).all()
prev=np.asarray(Image.open(old/'color.png').convert('RGB'),dtype=float)
# Independent X forcing in original orientation, preserving the exact zero-DC operation.
v=np.zeros_like(prev);v[:,0,:]=prev[:,-1,:]-prev[:,0,:];v[:,-1,:]=-v[:,0,:]
y,x=np.indices((s,s));e=2*np.cos(2*np.pi*np.fft.fftfreq(s))[:,None]+2*np.cos(2*np.pi*np.fft.fftfreq(s))[None,:]-4;e[0,0]=1
smooth=np.fft.ifft2(np.fft.fft2(v,axes=(0,1))/e[:,:,None],axes=(0,1)).real;smooth-=smooth.mean((0,1));raw=prev-smooth
assert np.array_equal(np.rint(np.clip(raw,0,255)).astype('uint8'),a)
neg=raw<0;over=raw>255;mask=np.any(neg|over,axis=2);Image.fromarray(np.uint8(mask)*255).save(out/'master-clipped-pixel-mask.png')
Image.fromarray(np.uint8(np.clip(h*255,0,255))).save(out/'trial-master-float-height-display.png')
_,normal=normals_from_height(h,.3,.5);Image.fromarray(np.uint8(np.round(np.clip(normal*.5+.5,0,1)*255))).save(out/'trial-master-normal-display.png')
rep=Image.new('RGB',(s*2,s*2))
for xx in(0,s):
 for yy in(0,s):rep.paste(color,(xx,yy))
rep.save(out/'trial-master-2x2.png');rep.crop((384,0,640,512)).save(out/'trial-master-x-join.png');rep.crop((0,448,512,576)).save(out/'trial-master-y-join.png');rep.crop((384,384,640,640)).save(out/'trial-master-four-corners.png')
marked=color.copy();dr=ImageDraw.Draw(marked);w=json.loads((out/'preparation.json').read_text())['reliefWitnessesMaster512'];samples=[]
for n,row in enumerate(w,1):
 r={'witness':n}
 for key,tint in [('jointXY','red'),('faceXY','cyan')]:
  xx,yy=row[key];dr.ellipse((xx-4,yy-4,xx+4,yy+4),outline=tint);dr.text((xx+5,yy-5),str(n)+key[0],fill=tint);r[key]=[xx,yy];r[key+'Mean5x5']=float(h[yy-2:yy+3,xx-2:xx+3].mean());r[key+'Center']=float(h[yy,xx])
 r['faceMinusJoint5x5']=r['faceXYMean5x5']-r['jointXYMean5x5'];samples.append(r)
marked.save(out/'trial-master-witnesses.png')
for j,l in enumerate((np.array([.65,.35,.68]),np.array([-.65,-.35,.68]))):
 l=l/np.linalg.norm(l);shade=.2+.8*np.maximum(0,np.einsum('ijk,k->ij',normal,l));Image.fromarray(np.uint8(np.clip(shade*255,0,255))).save(out/f'trial-master-grey-light-{j}.png');Image.fromarray(np.uint8(np.clip(a.astype(float)*shade[:,:,None],0,255))).save(out/f'trial-master-color-light-{j}.png')
report={'master':b(new/'master.json'),'rgb':b(new/'color.png'),'floatHeight':b(new/'height.npy'),'independentCorrectedRGBExact':True,'negativeChannelCount':int(neg.sum()),'overflowChannelCount':int(over.sum()),'negativePixelCount':int(np.any(neg,axis=2).sum()),'overflowPixelCount':int(np.any(over,axis=2).sum()),'clippedPixelBoundingBox':None if not mask.any() else [int(np.where(mask)[1].min()),int(np.where(mask)[0].min()),int(np.where(mask)[1].max()+1),int(np.where(mask)[0].max()+1)],'maximumAbsoluteCorrection':float(np.abs(smooth).max()),'meanAbsoluteCorrection':float(np.abs(smooth).mean()),'beforeMeanRGB':prev.mean((0,1)).tolist(),'afterMeanRGB':a.mean((0,1)).tolist(),'scalarRange':[float(h.min()),float(h.max())],'witnesses':samples,'qualification':'Diagnostics only; requires actual visual material/X/Y/corner/relief inspection before any tier encoding.'}
(out/'master-inspection-diagnostics.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
