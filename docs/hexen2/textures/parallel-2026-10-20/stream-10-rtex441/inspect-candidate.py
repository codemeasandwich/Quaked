"""Review-only actual decoded X/Y/corners with height/XYZ/opposed lights."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-10-rtex441';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-10-rtex441';it=json.loads((B/'batch.json').read_text())['items'][0]
s=Image.new('RGB',(950,1020),(24,26,28));dr=ImageDraw.Draw(s);out={}
for ti,(tier,q)in enumerate(it['tiers'].items()):
 maps={k:np.asarray(Image.open(R/v).convert('RGB'))for k,v in q['files'].items()};v=np.stack([maps['normal'+c][:,:,0]for c in'XYZ'],2)/127.5-1;v/=np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-12);normal=np.uint8(np.clip((v*.5+.5)*255,0,255));parts=[('RGB',maps['diffuse']),('height',maps['height']),('XYZ',normal)]
 for sign in(-1,1):
  l=np.array([sign*.6,sign*.3,.75]);l/=np.linalg.norm(l);a=.35+.65*np.clip((v*l).sum(2),0,1);parts.append(('light'+str(sign),np.uint8(maps['diffuse']*a[:,:,None])))
 for ai,axis in enumerate(('X','Y','XY')):
  y=(ti*3+ai)*170;dr.text((4,y+3),tier+' '+axis+' seam / corners at1:1',fill='white')
  for pi,(label,a)in enumerate(parts):
   h,w=a.shape[:2];a=np.roll(a,(h//2 if'Y'in axis else 0,w//2 if'X'in axis else 0),(0,1));crop=a[h//2-64:h//2+64,w//2-64:w//2+64];x=pi*190;dr.text((x+4,y+20),label,fill='white');s.paste(Image.fromarray(crop),(x+4,y+38))
 out[tier]={'sourceFiles':{k:{'file':p,'sha256':hashlib.sha256((R/p).read_bytes()).hexdigest()}for k,p in q['files'].items()},'dimensions':q['dimensions'],'scope':'Actual decoded material/relief corners, no automatic art acceptance.'}
s.save(D/'candidate-seams-corners.png');out['imageSha256']=hashlib.sha256((D/'candidate-seams-corners.png').read_bytes()).hexdigest();(D/'candidate-corner-provenance.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'image':str((D/'candidate-seams-corners.png').relative_to(R)),'sha256':out['imageSha256']}))
