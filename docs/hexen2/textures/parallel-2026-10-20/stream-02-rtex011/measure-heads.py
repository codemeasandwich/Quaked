"""Review-only source feature measurement/BOX witnesses. No asset authoring."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-02-rtex011';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-02-rtex011'
o=Image.open(next((B/'originals').glob('01-*.png'))).convert('RGB');m=Image.open(B/'masters/rtex011/color.png').convert('RGB')
s=Image.new('RGB',(1520,840),(26,28,30));d=ImageDraw.Draw(s)
for i,(label,im)in enumerate([('Native 64: boundaries labelled in native coordinates',o),('Initial master512: boundaries in native-equivalent coordinates',m)]):
 x=20+i*760;y=50;d.text((x,10),label,fill='white');a=im.resize((704,704),Image.Resampling.NEAREST);s.paste(a,(x,y))
 for n in range(0,65,4):
  z=n*11;d.line((x+z,y,x+z,y+704),fill=(100,120,110));d.line((x,y+z,x+704,y+z),fill=(100,120,110));d.text((x+z,y-18),str(n),fill='white');d.text((x+706,y+z),str(n),fill='white')
s.save(D/'native-master-coordinate-grid.png')
# Both BOX comparisons, enlarged only after downsample with NEAREST.
s=Image.new('RGB',(900,680),(26,28,30));d=ImageDraw.Draw(s)
for i,div in enumerate((2,4)):
 y=20+i*330;dims=(64//div,64//div);d.text((10,y),'Native/'+str(div)+' both BOX '+str(dims)+' : original / initial master',fill='white')
 for j,im in enumerate((o,m)):s.paste(im.resize(dims,Image.Resampling.BOX).resize((288,288),Image.Resampling.NEAREST),(10+j*320,y+25))
s.save(D/'initial-master-box32-box16.png')
