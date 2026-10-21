from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
R=Path('/Users/bri/SOURCE/Quaked');D=Path(__file__).resolve().parent;B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-02-rtex011';O=Path('/private/tmp/h2-rtex011-independent-art');it=json.loads((B/'batch.json').read_text())['items'][0];heads=json.loads((D.parent/'rivet-layer-proposal.json').read_text())['heads'];s=Image.new('RGB',(900,840),(24,26,28));draw=ImageDraw.Draw(s);data={}
for ti,(tier,q) in enumerate(it['tiers'].items()):
 ims={k:np.asarray(Image.open(R/v).convert('RGB')) for k,v in q['files'].items()};dh=ims['height'][:,:,0]/255.;v=np.stack([ims['normal'+c][:,:,0] for c in 'XYZ'],2)/127.5-1;v/=np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-12);entries=[('RGB',ims['diffuse']),('H',ims['height']),('XYZ',np.uint8(np.clip((v*.5+.5)*255,0,255)))]
 for sign in(-1,1):
  light=np.array([sign*.6,sign*.3,.75]);light/=np.linalg.norm(light);lit=.35+.65*np.clip((v*light).sum(2),0,1);grey=np.uint8(np.clip(lit*220,0,255));entries.append(('neutral'+str(sign),np.repeat(grey[:,:,None],3,axis=2)))
 mask=dh>.45;seen=np.zeros_like(mask,bool);components=[]
 for y,x in np.argwhere(mask):
  if seen[y,x]:continue
  stack=[(y,x)];seen[y,x]=True;pts=[]
  while stack:
   yy,xx=stack.pop();pts.append((yy,xx))
   for ny,nx in((yy-1,xx),(yy+1,xx),(yy,xx-1),(yy,xx+1)):
    if 0<=ny<mask.shape[0] and 0<=nx<mask.shape[1] and mask[ny,nx] and not seen[ny,nx]:seen[ny,nx]=True;stack.append((ny,nx))
  a=np.array(pts);components.append({'pixels':len(pts),'bbox':[int(a[:,1].min()),int(a[:,0].min()),int(a[:,1].max()+1),int(a[:,0].max()+1)]})
 assert len(components)==8;data[tier]={'decodedHeightThreshold':.45,'fourConnectedComponents':components,'heightSHA256':hashlib.sha256((R/q['files']['height']).read_bytes()).hexdigest()}
 for hi,h in enumerate(heads):
  x,y=[round(c*q['factor']) for c in h['nativeCentre']];xx=ti*450;yy=hi*105;draw.text((xx+4,yy+2),tier+' '+h['name']+' actual72x72 crops, no resize',fill='white')
  for ei,(label,a) in enumerate(entries):
   crop=Image.fromarray(a).crop((x-36,y-36,x+36,y+36));draw.text((xx+ei*86+4,yy+17),label,fill='white');s.paste(crop,(xx+ei*86+4,yy+30))
p=O/'rounded-heads.png';s.save(p);data['figure']={'file':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()};(O/'rounded-heads.json').write_text(json.dumps(data,indent=2)+'\n');print(json.dumps(data,indent=2))
