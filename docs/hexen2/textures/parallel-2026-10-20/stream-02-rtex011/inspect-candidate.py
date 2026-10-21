"""Review-only decoded both-tier repeats/corners/physical witnesses; no authoring."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-02-rtex011';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-02-rtex011';it=json.loads((B/'batch.json').read_text())['items'][0];proposal=json.loads((D/'rivet-layer-proposal.json').read_text());out={}
s=Image.new('RGB',(950,1020),(24,26,28));dr=ImageDraw.Draw(s)
for ti,(tier,q)in enumerate(it['tiers'].items()):
 maps={k:np.asarray(Image.open(R/v).convert('RGB'))for k,v in q['files'].items()};v=np.stack([maps['normal'+c][:,:,0]for c in'XYZ'],2)/127.5-1;v/=np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-12);normal=np.uint8(np.clip((v*.5+.5)*255,0,255));parts=[('RGB',maps['diffuse']),('height',maps['height']),('XYZ',normal)]
 for sign in(-1,1):
  light=np.array([sign*.6,sign*.3,.75]);light/=np.linalg.norm(light);a=.35+.65*np.clip((v*light).sum(2),0,1);parts.append(('light'+str(sign),np.uint8(maps['diffuse']*a[:,:,None])))
 for ai,axis in enumerate(('X','Y','XY')):
  y=(ti*3+ai)*170;dr.text((4,y+3),tier+' '+axis+' seam / corners at1:1',fill='white')
  for pi,(label,a)in enumerate(parts):
   h,w=a.shape[:2];a=np.roll(a,(h//2 if'Y'in axis else 0,w//2 if'X'in axis else 0),(0,1));crop=a[h//2-64:h//2+64,w//2-64:w//2+64];x=pi*190;dr.text((x+4,y+20),label,fill='white');s.paste(Image.fromarray(crop),(x+4,y+38))
 h=maps['height'][:,:,0].astype(float)/255;f=q['factor'];samples={}
 for r in proposal['heads']:
  x,y=[int(round(v*f))for v in r['nativeCentre']];a=h[y-1:y+2,x-1:x+2];samples[r['name']]={'nativeCentre':r['nativeCentre'],'tierPixel':[x,y],'mean':float(a.mean()),'range':[float(a.min()),float(a.max())]}
 plate={}
 for name,(x,y)in {'C':(32,32),'N-between':(20,7),'S-between':(43,57),'W-edge':(.5,20),'E-edge':(63,20)}.items():
  xx,yy=int(x*f),int(y*f);a=h[max(0,yy-1):yy+2,max(0,xx-1):xx+2];plate[name]={'nativeCentre':[x,y],'mean':float(a.mean()),'range':[float(a.min()),float(a.max())]}
 out[tier]={'rivetCentreWitnesses':samples,'plateWitnesses':plate,'minimumRivetCentreMinusMaximumPlate':min(a['range'][0]for a in samples.values())-max(a['range'][1]for a in plate.values()),'scope':'Actual decoded witnesses; sample hierarchy alone is not art acceptance.'}
s.save(D/'candidate-seams-corners.png');out['imageSha256']=hashlib.sha256((D/'candidate-seams-corners.png').read_bytes()).hexdigest();(D/'candidate-decoded-witnesses.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
