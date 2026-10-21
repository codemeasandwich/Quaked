"""Source-classified physical witnesses and actual pre-tier samples; not automatic art acceptance."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-04-rtex100';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-04-rtex100';M=B/'masters/rtex100';c=Image.open(M/'color.png').convert('RGB');h=np.load(M/'height.npy',allow_pickle=False)
pts=[('face-A','green stone face',70,235),('face-B','green stone face',155,170),('face-C','green stone face',370,335),('face-D','green stone face',475,470),('recess-A','dark weathered pit',300,60),('recess-B','dark weathered pit',225,260),('recess-C','dark weathered pit',75,465),('recess-D','dark weathered pit',337,370)]
s=Image.new('RGB',(800,420),(25,27,30));dr=ImageDraw.Draw(s);samples={}
for i,(label,kind,x,y)in enumerate(pts):
 xx=(i%4)*200;yy=(i//4)*210;crop=c.crop((x-40,y-40,x+40,y+40)).resize((160,160),Image.Resampling.NEAREST);s.paste(crop,(xx+10,yy+35));dr.text((xx+3,yy+2),label+' '+str([x/8,y/8]),fill='white');dr.text((xx+3,yy+17),kind,fill='white');dr.rectangle((xx+84,yy+109,xx+96,yy+121),outline=(255,40,40),width=1);a=h[y-3:y+4,x-3:x+4];samples[label]={'physicalClass':kind,'masterPixel':[x,y],'nativeEquivalent':[x/8,y/8],'radiusMasterPixels':3,'heightMean':float(a.mean()),'heightRange':[float(a.min()),float(a.max())]}
s.save(D/'pre-tier-physical-witnesses.png');report={'scope':'Author physical witness classification/self-check; root independent final art pending','masterPackageSha256':hashlib.sha256((M/'master.json').read_bytes()).hexdigest(),'samples':samples,'interpretation':'Greenstone faces vs dark weathered pits selected from visible mineral/crack geometry; color alone is not semantic proof. Oxide staining is observed in mixed crevice transitions and has no separately authored height mask.','actualImage':'pre-tier-physical-witnesses.png'};(D/'pre-tier-physical-witnesses.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
