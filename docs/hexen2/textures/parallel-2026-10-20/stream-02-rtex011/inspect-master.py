"""Review-only actual master diagnostics; no material authoring or map encoding."""
from pathlib import Path
import json,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-02-rtex011';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-02-rtex011';M=B/'masters/rtex011'
sys.path.insert(0,str(R/'tools'));from craft_normals import normals_from_height
c=Image.open(M/'color.png').convert('RGB');h=np.load(M/'height.npy',allow_pickle=False);assert c.size==(512,512)and h.shape==(512,512)and h.dtype==np.float32 and np.isfinite(h).all()
_,n=normals_from_height(h,.3,.5);color=np.asarray(c,float);parts=[('canonical RGB master',c),('full precision scalar height (display only)',Image.fromarray(np.uint8(np.clip(h*255,0,255)))),('XYZ normal diagnostic',Image.fromarray(np.uint8(np.clip((n*.5+.5)*255,0,255))))]
for sign in(1,-1):
 l=np.array([sign*.6,sign*.3,.75]);l/=np.linalg.norm(l);light=.35+.65*np.clip((n*l).sum(2),0,1);parts.append(('Opposed light '+str(sign),Image.fromarray(np.uint8(np.clip(color*light[:,:,None],0,255)))))
s=Image.new('RGB',(1560,1100),(25,27,30));dr=ImageDraw.Draw(s)
for i,(label,im)in enumerate(parts):x=(i%3)*520;y=(i//3)*550;dr.text((x+4,y+5),label,fill='white');s.paste(im,(x+4,y+25))
s.save(D/'pre-tier-master.png')
# Independently selected native head interiors and nearby plate samples.
centres={'NW':(7.5,7.5),'N':(30,7.5),'NE':(54.5,8),'W':(7.5,32.5),'E':(55.5,33),'SW':(7.5,56),'S':(31.5,56.5),'SE':(54.5,56.5)}
samples={}
for label,(x,y)in centres.items():
 xx=int(x*8);yy=int(y*8);a=h[yy-4:yy+4,xx-4:xx+4];samples[label]={'nativeEdgeCoordinates':[x,y],'heightMean':float(a.mean()),'range':[float(a.min()),float(a.max())]}
r={'scope':'Master pre-tier diagnostic only; author self-check, independent review pending','masterPackageSha256':hashlib.sha256((M/'master.json').read_bytes()).hexdigest(),'heightRange':[float(h.min()),float(h.max())],'heightUniqueSamples':int(np.unique(h).size),'rivetInteriorSamples':samples,'plateCentreMean':float(h[244:268,244:268].mean()),'materialDecision':'PENDING actual image inspection; no automatic acceptance from samples.'}
(D/'pre-tier-master-samples.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
