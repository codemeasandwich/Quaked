"""Read-only source diagnostics. Resampled/cropped views are never authoring inputs."""
from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib
R=Path('/Users/bri/SOURCE/Quaked');A=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018';D=Path(__file__).parent
native=Image.open(A/'originals/01-rtex018-7e009202100d.png').convert('RGB');raw=Image.open(A/'generated/rtex018.png').convert('RGB');w,h=raw.size
witnesses=[('upper glazing',(120,580,376,836)),('lower glazing',(365,1540,621,1796)),('tracery and glass',(245,125,501,381)),('left jamb',(0,760,256,1016))]
panel=Image.new('RGB',(512,2*280),(35,35,35));draw=ImageDraw.Draw(panel)
for i,(name,box) in enumerate(witnesses):
 x=(i%2)*256;y=(i//2)*280;draw.text((x,y+3),name+' literal256px',fill='white');panel.paste(raw.crop(box),(x,y+24))
panel.save(D/'raw-material-witnesses-1to1.png')
for div in (2,4):
 size=(64//div,256//div);p=Image.new('RGB',(size[0]*2,size[1]));p.paste(native.resize(size,Image.Resampling.BOX),(0,0));p.paste(raw.resize(size,Image.Resampling.BOX),(size[0],0));p.save(D/('native-raw-BOX'+str(size[0])+'.png'))
repeat=Image.new('RGB',(2*w,2*h))
for y in (0,h):
 for x in (0,w):repeat.paste(raw,(x,y))
repeat.save(D/'raw-repeat-1to1.png')
repeat.crop((w-80,0,w+80,h//2)).save(D/'raw-Xjoin-top-1to1.png');repeat.crop((w-80,h//2,w+80,h)).save(D/'raw-Xjoin-bottom-1to1.png')
repeat.crop((0,h-96,w,h+96)).save(D/'raw-Yjoin-1to1.png');repeat.crop((w-128,h-128,w+128,h+128)).save(D/'raw-corner-1to1.png')
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
j={'status':'SOURCE_DIAGNOSTIC_ONLY_WRONG_ASPECT_HOLD','raw':{'file':str((A/'generated/rtex018.png').relative_to(R)),'sha256':hashfile(A/'generated/rtex018.png'),'dimensions':[w,h]},'nativeDimensions':[64,256],'BOXViews':'Native left / raw right, identicalBOXfilter to32x128/16x64. Raw wrong aspect is normalized ONLY in diagnostic distance panels; no authoring source correction, crop, upscale or active input made. Panel does not qualify aspect or feature shape.','literalCropWitnesses':[{'material':label,'rawXYXY':list(box)} for label,box in witnesses],'images':[{'file':str(p.relative_to(R)),'sha256':hashfile(p)} for p in sorted(D.glob('*.png'))],'noMasterHeightTiers':True}
(D/'diagnostic.json').write_text(json.dumps(j,indent=2)+'\n');print(json.dumps({'rawSize':[w,h],'diagnostic':hashfile(D/'diagnostic.json')}))
