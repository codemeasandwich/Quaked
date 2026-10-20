"""Read-only actual decoded slab neutral light and full-contact provenance."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-10-rtex441';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-10-rtex441';it=json.loads((B/'batch.json').read_text())['items'][0];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(R));report={'scope':'Actual decoded pixels/XYZ lighting only; no authoring or automatic artistic acceptance','definitions':{'X':'Full-height vertical strip around exact X wrap, native x-8..8 at1:1; cyclic roll by width/2','Y':'Full-width horizontal strip around exact Y wrap, native y-8..8 at1:1; cyclic roll by height/2','neutral':'Uniform grey180 multiplied by .35+.65*max(0,dot(actual decoded renormalized XYZ, normalized opposed light)); no albedo/baked shade in these geometry views'},'tiers':{}}
for tier,q in it['tiers'].items():
 w,h=q['dimensions'];f=q['factor'];maps={k:np.asarray(Image.open(R/p).convert('RGB')) for k,p in q['files'].items()};n=np.stack([maps['normal'+v][:,:,0]for v in 'XYZ'],2)/127.5-1;n/=np.maximum(np.linalg.norm(n,axis=2,keepdims=True),1e-12);parts=[('actual RGB',maps['diffuse']),('actual height',maps['height']),('actual XYZ',np.uint8(np.clip((n*.5+.5)*255,0,255)))];clays=[]
 for sign in (-1,1):
  l=np.array([sign*.6,sign*.3,.75]);l/=np.linalg.norm(l);gain=.35+.65*np.clip((n*l).sum(2),0,1);clay=np.uint8(np.repeat((180*gain)[:,:,None],3,2));parts.append(('neutral '+str(sign),clay));clays.append(clay)
 panel=Image.new('RGB',(2*w+24,h+38),(25,27,30));dr=ImageDraw.Draw(panel)
 for i,im in enumerate(clays):dr.text((i*(w+12)+4,4),tier+' decoded neutral '+str((-1,1)[i]),fill='white');panel.paste(Image.fromarray(im),(i*(w+12)+4,26))
 npth=D/f'{tier.lower()}-decoded-neutral-opposed.png';panel.save(npth)
 stride=16*f+30;s=Image.new('RGB',(stride*5,h+38),(25,27,30));dr=ImageDraw.Draw(s)
 for i,(label,a)in enumerate(parts):
  aa=np.roll(a,w//2,axis=1);dr.text((i*stride+4,4),label,fill='white');s.paste(Image.fromarray(aa[:,w//2-8*f:w//2+8*f]),(i*stride+4,26))
 xp=D/f'{tier.lower()}-decoded-literal-X-full-height.png';s.save(xp)
 stride=16*f+30;s=Image.new('RGB',(w+8,stride*5),(25,27,30));dr=ImageDraw.Draw(s)
 for i,(label,a)in enumerate(parts):
  aa=np.roll(a,h//2,axis=0);dr.text((4,i*stride+4),tier+' '+label+' Y contact at1:1',fill='white');s.paste(Image.fromarray(aa[h//2-8*f:h//2+8*f]),(4,i*stride+26))
 yp=D/f'{tier.lower()}-decoded-literal-Y-full-width.png';s.save(yp)
 rep=Image.new('RGB',(2*w,2*h))
 for yy in (0,h):
  for xx in (0,w):rep.paste(Image.fromarray(maps['diffuse']),(xx,yy))
 rp=D/f'{tier.lower()}-decoded-full-repeat.png';rep.save(rp)
 report['tiers'][tier]={'factor':f,'dimensions':[w,h],'files':{k:{'file':p,'sha256':sha(R/p)}for k,p in q['files'].items()},'views':{rel(p):sha(p)for p in [npth,xp,yp,rp]}}
report['inputs']={rel(p):sha(p)for p in [Path(__file__),B/'batch.json']};(D/'decoded-neutral-contact-provenance.json').write_text(json.dumps(report,indent=2)+'\n');print(sha(D/'decoded-neutral-contact-provenance.json'))
