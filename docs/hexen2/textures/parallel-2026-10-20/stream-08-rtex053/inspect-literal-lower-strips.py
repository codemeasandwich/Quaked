"""Bounded review-only literal decoded lower-course X and complete Y strips."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-08-rtex053';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-08-rtex053';batch=json.loads((B/'batch.json').read_text());it=batch['items'][0];o=Image.open(R/it['original']).convert('RGB');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(R));report={'scope':'Actual decoded tier pixels, no reauthoring or automatic ART acceptance','definitions':{'X':'Full width roll by half-tier width; columns are1:1 and central X is the exact tile boundary. Show entire lower-course interior native y34..63.','Y':'Full width native x0..64, cyclic Y roll by half-tier height, with native y-8..8 around exact tile boundary. No resizing of decoded tier pixels.'},'tiers':{}}
for tier,q in it['tiers'].items():
 f=q['factor'];w,h=q['dimensions'];maps={k:np.asarray(Image.open(R/p).convert('RGB'))for k,p in q['files'].items()};normal=np.stack([maps['normal'+a][:,:,0]for a in'XYZ'],2)/127.5-1;normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-12);parts=[('Actual Q92 RGB',maps['diffuse']),('Actual Q92 height',maps['height']),('Actual decoded XYZ',np.uint8(np.clip((normal*.5+.5)*255,0,255)))]
 for sign in(-1,1):
  l=np.array([sign*.6,sign*.3,.75]);l/=np.linalg.norm(l);gain=.35+.65*np.clip((normal*l).sum(2),0,1);parts.append(('Decoded XYZ opposed light '+str(sign),np.uint8(maps['diffuse']*gain[:,:,None])))
 rowh=29*f+28;sheet=Image.new('RGB',(w+8,rowh*len(parts)),(25,27,30));dr=ImageDraw.Draw(sheet)
 for i,(label,a)in enumerate(parts):
  a=np.roll(a,w//2,axis=1);crop=a[34*f:63*f];dr.text((4,i*rowh+4),tier+' X lower-course '+label+' at 1:1',fill='white');sheet.paste(Image.fromarray(crop),(4,i*rowh+24))
 xp=D/f'{tier.lower()}-literal-X-lower-course.png';sheet.save(xp)
 rowh=16*f+28;sheet=Image.new('RGB',(w+8,rowh*len(parts)),(25,27,30));dr=ImageDraw.Draw(sheet)
 for i,(label,a)in enumerate(parts):
  a=np.roll(a,h//2,axis=0);crop=a[h//2-8*f:h//2+8*f];dr.text((4,i*rowh+4),tier+' Y full-width '+label+' at 1:1',fill='white');sheet.paste(Image.fromarray(crop),(4,i*rowh+24))
 yp=D/f'{tier.lower()}-literal-Y-full-width.png';sheet.save(yp)
 # Compare same represented native extent, preserving actual decoded pixels.
 ref=np.roll(np.asarray(o.resize((w,h),Image.Resampling.NEAREST)),w//2,axis=1)[34*f:63*f];actual=np.roll(maps['diffuse'],w//2,axis=1)[34*f:63*f];sheet=Image.new('RGB',(2*w+24,29*f+40),(25,27,30));dr=ImageDraw.Draw(sheet);dr.text((4,4),'Original nearest only, native y34..63',fill='white');dr.text((w+16,4),tier+' actual Q92, same native extent',fill='white');sheet.paste(Image.fromarray(ref),(4,24));sheet.paste(Image.fromarray(actual),(w+16,24));cp=D/f'{tier.lower()}-literal-X-native-comparison.png';sheet.save(cp)
 im=Image.fromarray(maps['diffuse']);rep=Image.new('RGB',(2*w,2*h))
 for yy in(0,h):
  for xx in(0,w):rep.paste(im,(xx,yy))
 rp=D/f'{tier.lower()}-decoded-full-repeat.png';rep.save(rp)
 report['tiers'][tier]={'factor':f,'sourceFiles':{role:{'file':p,'sha256':sha(R/p)}for role,p in q['files'].items()},'views':{rel(p):sha(p)for p in[xp,yp,cp,rp]}}
report['inputs']={rel(p):sha(p)for p in[Path(__file__),B/'batch.json',R/it['original']]};(D/'literal-strip-provenance.json').write_text(json.dumps(report,indent=2)+'\n');print(sha(D/'literal-strip-provenance.json'))
