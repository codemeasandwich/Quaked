"""Read-only source-specific diagnostics; no master or tier alteration."""
from pathlib import Path
import json,hashlib,datetime
from PIL import Image,ImageDraw
import numpy as np
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-06-mtex470';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-06-mtex470';M=B/'masters/mtex470'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
c=Image.open(M/'color.png').convert('RGB');o=Image.open(next((B/'originals').glob('01-*.png'))).convert('RGB');h=np.load(M/'height.npy',allow_pickle=False)
pts=[('F1','left ochre stone face',60,200),('F2','upper grey stone face',250,70),('F3','right ochre stone face',425,250),('F4','lower ochre stone face',200,425),('F5','central red stone face',250,250),('J1','upper central mortar joint',250,146),('J2','left central mortar joint',137,250),('J3','right central mortar joint',359,250),('J4','lower central mortar joint',250,361)]
a=Image.new('RGB',(1000,520),(25,27,30));dr=ImageDraw.Draw(a);samples=[]
for i,(label,kind,x,y) in enumerate(pts):
 xx=i%5*200;yy=i//5*260;crop=c.crop((x-40,y-40,x+40,y+40)).resize((160,160),Image.Resampling.NEAREST);a.paste(crop,(xx+10,yy+60));dr.text((xx+4,yy+5),label+' '+str([x,y]),fill='white');dr.text((xx+4,yy+20),kind,fill='white');dr.rectangle((xx+84,yy+134,xx+96,yy+146),outline=(255,40,40));v=h[y-3:y+4,x-3:x+4];samples.append({'label':label,'physicalClass':kind,'masterPixel':[x,y],'nativeEquivalent':[x/8,y/8],'radiusMasterPixels':3,'heightMean':float(v.mean()),'heightRange':[float(v.min()),float(v.max())]})
a.save(D/'pre-tier-physical-witnesses.png')
distance={};s=Image.new('RGB',(600,330),(25,27,30));dr=ImageDraw.Draw(s)
for i,div in enumerate((2,4)):
 size=(64//div,64//div);n=o.resize(size,Image.Resampling.BOX);z=c.resize(size,Image.Resampling.BOX);diff=np.abs(np.asarray(n,float)-np.asarray(z,float));distance[str(div)]={'dimensions':list(size),'filter':'BOX on both original and master','rgbMae':float(diff.mean())}
 dr.text((i*300+4,4),f'Both inputs at native/{div}: {size}',fill='white');s.paste(n.resize((256,256),Image.Resampling.NEAREST),(i*300+4,30));s.paste(z.resize((256,256),Image.Resampling.NEAREST),(i*300+4,30)) if False else None
 # Separate reference/master columns in each comparison row.
 if i==0: pass
s=Image.new('RGB',(560,600),(25,27,30));dr=ImageDraw.Draw(s)
for i,div in enumerate((2,4)):
 size=(64//div,64//div);y=i*300;dr.text((4,y+4),f'Original and master, both BOX to {size}',fill='white');s.paste(o.resize(size,Image.Resampling.BOX).resize((256,256),Image.Resampling.NEAREST),(4,y+28));s.paste(c.resize(size,Image.Resampling.BOX).resize((256,256),Image.Resampling.NEAREST),(280,y+28))
s.save(D/'pre-tier-distance.png')
for label,im in [('master',c),('native',o.resize((512,512),Image.Resampling.NEAREST))]:
 tiles=Image.new('RGB',(1024,1024))
 for y in (0,512):
  for x in (0,512):tiles.paste(im,(x,y))
 tiles.save(D/f'pre-tier-{label}-repeat.png')
# Face medians are descriptive; individual colour groups are not accepted depth classes automatically.
regions={'left':[20,40,115,330],'upper':[175,25,470,115],'right':[390,185,485,475],'lower':[30,395,320,485],'center':[175,185,330,325]};stats={}
for k,(x1,y1,x2,y2) in regions.items():
 v=h[y1:y2,x1:x2];stats[k]={'bounds':[x1,y1,x2,y2],'mean':float(v.mean()),'median':float(np.median(v)),'p10':float(np.quantile(v,.1)),'p90':float(np.quantile(v,.9))}
r={'scope':'Author actual source/master pre-tier diagnostic only; independent material/relief/tier acceptance remains pending','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'masterPackageSha256':sha(M/'master.json'),'canonicalRgbSha256':sha(M/'color.png'),'floatHeightSha256':sha(M/'height.npy'),'samples':samples,'coarseFaceStatistics':stats,'distance':distance,'diagnostics':{str(p.relative_to(R)):sha(p) for p in [D/'pre-tier-master.png',D/'pre-tier-physical-witnesses.png',D/'pre-tier-distance.png',D/'pre-tier-master-repeat.png',D/'pre-tier-native-repeat.png']}}
(D/'pre-tier-self-check.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'samples':samples,'coarseFaceStatistics':stats,'distance':distance},indent=2))
