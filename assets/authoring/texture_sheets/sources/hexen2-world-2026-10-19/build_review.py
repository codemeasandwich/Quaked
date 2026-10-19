"""Build diagnostic sheets from actual decoded Q92 files; no map edits."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json
R=Path(__file__).resolve().parent
for name,orig,edition in [('rtex337','01-rtex337-3bbe64a968db.png','base'),('rtex450','13-rtex450-4f3556a977d8.png','portals')]:
 version='v2' if name=='rtex337' else 'v1'
 o=Image.open(R/'originals'/orig).convert('RGB'); d=Image.open(R/edition/(name+'-'+version+'-diffuse.webp')).convert('RGB')
 sh=Image.new('RGB',(1400,1100),(30,31,32)); draw=ImageDraw.Draw(sh)
 draw.text((12,8),f'{name} ORIGINAL | Q92 4x | repeated Q92',fill='white')
 oshow=o.resize((256,512) if o.width!=o.height else (512,512),Image.Resampling.NEAREST); sh.paste(oshow,(12,32)); sh.paste(d,(540,32))
 repeat=Image.fromarray(np.tile(np.asarray(d),(2,2,1))).resize((512,512),Image.Resampling.LANCZOS); sh.paste(repeat,(12,570))
 for i,div in enumerate((2,4)):
  size=(o.width//div,o.height//div); a=o.resize(size,Image.Resampling.BOX); b=d.resize(size,Image.Resampling.BOX)
  draw.text((540,570+i*235),f'Native/{div} {size}: original left, Q92 right',fill='white')
  a=a.resize((size[0]*3,size[1]*3),Image.Resampling.NEAREST); b=b.resize(a.size,Image.Resampling.NEAREST)
  sh.paste(a,(540,595+i*235)); sh.paste(b,(550+a.width,595+i*235))
 sh.save(R/(name+'-review-'+version+'.jpg'),quality=92)

R=Path(__file__).resolve().parent
for name,edition in [('rtex337','base'),('rtex450','portals')]:
 version='v2' if name=='rtex337' else 'v1'
 stem=R/edition/(name+'-'+version); a=np.asarray(Image.open(str(stem)+'-diffuse.webp').convert('RGB'),float)
 n=np.stack([np.asarray(Image.open(str(stem)+'-normal'+c+'.webp').convert('RGB'),float)[:,:,0] for c in 'XYZ'],2)/127.5-1; n/=np.maximum(np.linalg.norm(n,axis=2,keepdims=True),1e-8)
 h=Image.open(str(stem)+'-height.webp').convert('RGB'); sheet=Image.new('RGB',(1200,1100),(30,31,32)); draw=ImageDraw.Draw(sheet)
 entries=[('Q92 height (derived, not measured)',h),('Q92 XYZ reconstructed normal',Image.fromarray(np.uint8(np.clip((n*.5+.5)*255,0,255))))]
 for v in (np.array([.6,.3,.75]),np.array([-.6,-.3,.75])):
  v=v/np.linalg.norm(v); li=.35+.65*np.clip((n*v).sum(2),0,1); entries.append(('Static relief light '+('A' if v[0]>0 else 'B'),Image.fromarray(np.uint8(np.clip(a*li[:,:,None],0,255)))))
 for i,(title,im) in enumerate(entries):
  x=(i%2)*600; y=(i//2)*550; draw.text((x+10,y+8),title,fill='white'); im.thumbnail((512,512)); sheet.paste(im,(x+10,y+30))
 sheet.save(R/(name+'-relief-'+version+'.jpg'),quality=92)
