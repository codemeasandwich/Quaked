import json, pathlib, hashlib
import numpy as np
from PIL import Image,ImageDraw
R=pathlib.Path('/Users/bri/SOURCE/Quaked');B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008';O=pathlib.Path('/private/tmp/h2-batch008-first-four-art');b=json.loads((B/'batch-first-four.json').read_text());out={}
for it in b['items']:
 s=Image.new('RGB',(950,1020),(24,26,28));d=ImageDraw.Draw(s)
 for ti,(tier,q) in enumerate(it['tiers'].items()):
  maps={k:np.asarray(Image.open(R/v).convert('RGB')) for k,v in q['files'].items()};v=np.stack([maps['normal'+c][:,:,0] for c in 'XYZ'],2)/127.5-1;v/=np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-12);normal=np.uint8(np.clip((v*.5+.5)*255,0,255));parts=[('RGB',maps['diffuse']),('height',maps['height']),('XYZ',normal)]
  for sign in (-1,1):
   light=np.array([sign*.6,sign*.3,.75]);light/=np.linalg.norm(light);a=.35+.65*np.clip((v*light).sum(2),0,1);parts.append(('light'+str(sign),np.uint8(maps['diffuse']*a[:,:,None])))
  for ai,axis in enumerate(('X','Y','XY')):
   y=(ti*3+ai)*170;d.text((4,y+3),tier+' '+axis+' seam / corners at 1:1',fill='white')
   for pi,(label,a) in enumerate(parts):
    h,w=a.shape[:2];a=np.roll(a,(h//2 if 'Y' in axis else 0,w//2 if 'X' in axis else 0),(0,1));crop=a[h//2-64:h//2+64,w//2-64:w//2+64];x=pi*190;d.text((x+4,y+20),label,fill='white');s.paste(Image.fromarray(crop),(x+4,y+38))
 p=O/(it['name']+'-seams.png');s.save(p);out[it['name']]={'file':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 if it['name']=='rtex306':
  out['rtex306']['decodedHeightWitnesses']={}
  for tier,q in it['tiers'].items():
   a=np.asarray(Image.open(R/q['files']['height']).convert('L'),float)/255;f=q['factor'];pts={'CNW':(22,22),'CNE':(42,22),'CSW':(22,42),'CSE':(42,42),'FN':(32,13),'FE':(51,32),'FS':(32,51),'FW':(13,32)};witness={}
   for k,(x,y) in pts.items():
    xx=int(x*f);yy=int(y*f);v=a[yy-1:yy+2,xx-1:xx+2];witness[k]={'nativeEdgeCoordinates':[x,y],'tierPixel':[xx,yy],'radiusTierPixels':1,'mean':float(v.mean()),'min':float(v.min()),'max':float(v.max())}
   out['rtex306']['decodedHeightWitnesses'][tier]=witness
(O/'seams-and-decoded-witnesses.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
