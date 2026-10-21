"""Source-only diagnostics. No RGB authoring, master, height or tier outputs."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,hashlib,runpy
R=Path('/Users/bri/SOURCE/Quaked');D=Path(__file__).parent;A=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-16-rtex020'
files=[A/'originals/01-rtex020-e000f2f3924b.png',A/'generated/rtex020.png',A/'revisions/r1/rtex020-edit-r1.png']
ims=[Image.open(p).convert('RGB') for p in files]; names=['native','original raw','edit r1']
measure=runpy.run_path(str(D.parent/'independent-source-layout/measure-layout.py'))['measure']
rows=[]
for name,xs,ys in [('leftTop',(4,30),(20,27)),('rightTop',(40,61),(42,49)),('leftBottom',(4,30),(70,79)),('rightBottom',(40,61),(78,86))]:
 rows.append({'landmark':name,'native':measure(np.array(ims[0]),xs,ys),'edited':measure(np.array(ims[2]),xs,ys)})
# Literal 256x256 source-pixel crops at the same original-photo footprint.
locations=[('left large centre',(140,570,396,826)),('right large centre',(580,720,836,976)),('unchanged lower stone',(170,1340,426,1596))]
canvas=Image.new('RGB',(512,3*280),(35,35,35));draw=ImageDraw.Draw(canvas)
for n,(label,box) in enumerate(locations):
 for k,im in enumerate(ims[1:]):
  draw.text((k*256,n*280+2),label+' / '+names[k+1],fill='white');canvas.paste(im.crop(box),(k*256,n*280+24))
canvas.save(D/'original-edit-material-crops-1to1.png')
for div in [2,4]:
 size=(64//div,128//div);panel=Image.new('RGB',(size[0]*3,size[1]))
 for k,im in enumerate(ims):panel.paste(im.resize(size,Image.Resampling.BOX),(k*size[0],0))
 panel.save(D/('native-original-edit-BOX'+str(size[0])+'.png'))
im=ims[2];w,h=im.size
repeat=Image.new('RGB',(2*w,2*h))
for y in (0,h):
 for x in (0,w):repeat.paste(im,(x,y))
repeat.save(D/'edited-repeat-1to1.png')
repeat.crop((w-128,0,w+128,2*h)).save(D/'edited-Xjoin-1to1.png')
repeat.crop((0,h-128,2*w,h+128)).save(D/'edited-Yjoin-1to1.png')
repeat.crop((w-160,h-160,w+160,h+160)).save(D/'edited-corner-1to1.png')
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
report={'inputs':[{'file':str(p.relative_to(R)),'sha256':hashfile(p)} for p in files],'jointMeasurements':rows,'method':'Reuse independent source-layout measure function unchanged. Same-footprint source-pixel material crops without resampling; BOX32x64 and16x32 native/original/edit columns; literal source repeat/corner views. Diagnostics only.','callCounts':{'originalGeneration':1,'edit':1,'total':2},'createdMasterOrTiers':False,'images':[{ 'file':str(p.relative_to(R)),'sha256':hashfile(p)} for p in sorted(D.glob('*.png'))]}
(D/'source-diagnostic.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(rows,indent=2))
