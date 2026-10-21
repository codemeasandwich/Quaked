"""Review-only actual canonical dark volcanic stone master diagnostics; no map authoring."""
from pathlib import Path
import json,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-07-rtex102';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-07-rtex102';M=B/'masters/rtex102';sys.path.insert(0,str(R/'tools'));from craft_normals import normals_from_height
c=Image.open(M/'color.png').convert('RGB');h=np.load(M/'height.npy',allow_pickle=False);assert c.size==(512,512)and h.shape==(512,512)and h.dtype==np.float32 and np.isfinite(h).all();_,n=normals_from_height(h,.3,.5);color=np.asarray(c,float)
parts=[('Actual canonical RGB master',c),('Full precision height (display only)',Image.fromarray(np.uint8(np.clip(h*255,0,255)))),('XYZ normal diagnostic',Image.fromarray(np.uint8(np.clip((n*.5+.5)*255,0,255))))]
for sign in(1,-1):
 l=np.array([sign*.6,sign*.3,.75]);l/=np.linalg.norm(l);a=.35+.65*np.clip((n*l).sum(2),0,1);parts.append(('Opposed light '+str(sign),Image.fromarray(np.uint8(np.clip(color*a[:,:,None],0,255)))))
s=Image.new('RGB',(1560,1100),(25,27,30));dr=ImageDraw.Draw(s)
for i,(label,im)in enumerate(parts):x=(i%3)*520;y=(i//3)*550;dr.text((x+4,y+5),label,fill='white');s.paste(im,(x+4,y+25))
s.save(D/'pre-tier-master.png');r={'scope':'Master pre-tier author diagnostic; no automatic material or relief acceptance','masterPackageSha256':hashlib.sha256((M/'master.json').read_bytes()).hexdigest(),'heightRange':[float(h.min()),float(h.max())],'heightUniqueSamples':int(np.unique(h).size),'actualImage':str((D/'pre-tier-master.png').relative_to(R))};(D/'pre-tier-master-diagnostics.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
