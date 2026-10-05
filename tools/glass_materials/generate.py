from pathlib import Path
from PIL import Image,ImageFilter
import numpy as np, zipfile,io,json,hashlib

from collections import deque
def blurred(a,r=1):
 for _ in range(2):a=(a*4+np.roll(a,1,0)+np.roll(a,-1,0)+np.roll(a,1,1)+np.roll(a,-1,1))/8
 return a
def pane_distance(mask):
 rows,cols=mask.shape;dist=np.where(mask,rows+cols,0).astype(float)
 for y in range(rows):
  for x in range(cols):
   if mask[y,x]:dist[y,x]=min(dist[y,x],(dist[y-1,x]+1 if y else 1),(dist[y,x-1]+1 if x else 1))
 for y in range(rows-1,-1,-1):
  for x in range(cols-1,-1,-1):
   if mask[y,x]:dist[y,x]=min(dist[y,x],(dist[y+1,x]+1 if y+1<rows else 1),(dist[y,x+1]+1 if x+1<cols else 1))
 labels=np.zeros(mask.shape,dtype=int);maxima=[1.];count=0
 for y,x in zip(*np.nonzero(mask)):
  if labels[y,x]:continue
  count+=1;labels[y,x]=count;q=deque([(y,x)]);largest=1.
  while q:
   cy,cx=q.popleft();largest=max(largest,dist[cy,cx])
   for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
    yy,xx=cy+dy,cx+dx
    if 0<=yy<rows and 0<=xx<cols and mask[yy,xx] and not labels[yy,xx]:labels[yy,xx]=count;q.append((yy,xx))
  maxima.append(largest)
 return dist/np.array(maxima)[labels]

import argparse
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--archive',type=Path,required=True);cfg=p.parse_args();out=cfg.out/'assets';out.mkdir(parents=True,exist_ok=True);inventory=json.load(open(cfg.out/'inventory.json'));z=zipfile.ZipFile(cfg.archive);members={n.lower():n for n in z.namelist()};catalog={};receipt=[]
def key(im):
 a=np.array(im.convert('RGBA')).ravel();h1=2166136261;h2=3339675911
 for b in a:h1=((h1^int(b))*16777619)&0xffffffff;h2=((h2^int(b))*2246822519)&0xffffffff
 return f'{im.width}x{im.height}:{h1:08x}{h2:08x}'
def fromzip(n):return Image.open(io.BytesIO(z.read(members[n.lower()]))).convert('RGBA')
for v in inventory['variants']:
 native=Image.open(v['image']).convert('RGBA');k=key(native);n=v['name'];stem=hashlib.sha256((n+':'+k).encode()).hexdigest()[:16];cls=v['visualClass'];donor=None;score=None
 names=[f'textures/{n}.tga',f'textures/{n}_norm.tga',f'textures/{n}_gloss.tga']
 if cls in ['stained_mosaic','leaded_glass'] and all(x.lower() in members for x in names):
  color=fromzip(names[0]);a=np.array(color.resize(native.size,Image.Resampling.LANCZOS).convert('L')).ravel();b=np.array(native.convert('L')).ravel();score=float(np.corrcoef(a,b)[0,1]);
  if score>.55:donor=names
 if donor:
  diffuse=fromzip(donor[0]);normal=fromzip(donor[1]);gloss=fromzip(donor[2]).resize(diffuse.size,Image.Resampling.LANCZOS).convert('L');a=np.array(normal);a[:,:,1]=255-a[:,:,1];normal=Image.fromarray(a)
  method='authored donor; green inverted to Quaked tangent convention; alpha unchanged';source=[{'path':x,'sha256':hashlib.sha256(z.read(members[x.lower()])).hexdigest()} for x in donor]
 else:
  factor=min(4, max(1,512//max(native.size)));diffuse=native.resize((native.width*factor,native.height*factor),Image.Resampling.LANCZOS);rgb=np.array(diffuse)[:,:,:3].astype(float)/255;gray=np.mean(rgb,axis=2);mx=rgb.max(axis=2);mn=rgb.min(axis=2)
  if cls in ['stained_mosaic','leaded_glass']:
   # Exclude dark lead and neutral frame; each connected bright pane gets a rounded cap.
   sat=(mx-mn)/np.maximum(mx,.001);mask=(mx>.22)&(sat>.24 if cls=='stained_mosaic' else mx>.35)
   d=pane_distance(mask);shape=np.sin(np.minimum(d,1)*np.pi/2);h=.2+.6*shape;g=mask.astype(float)*.5
  else:
   h=.35+blurred(gray)*.25;g=np.zeros_like(h) # control/uncertain/plain windows keep matte native material
  h=blurred(h);gy,gx=np.gradient(h);strength=np.sqrt(h.size)/8;nx=-gx*strength;ny=-gy*strength;length=np.sqrt(nx*nx+ny*ny+1)
  rgba=np.stack([(nx/length*.5+.5)*255,(ny/length*.5+.5)*255,(1/length*.5+.5)*255,h*255],axis=2);normal=Image.fromarray(np.clip(np.round(rgba),0,255).astype('uint8'));gloss=Image.fromarray(np.round(g*255).astype('uint8'))
  method='native-palette generated pane caps' if cls in ['stained_mosaic','leaded_glass'] else 'native-palette generated matte relief';source=[{'path':v['image'].split('/')[-1],'sha256':hashlib.sha256(Path(v['image']).read_bytes()).hexdigest()}]
 paths={role:f'glass/{stem}-{role}.png' for role in ['diffuse','normal','gloss','height']}
 height=normal.getchannel('A');normal=normal.convert('RGB')
 for role,image in [('diffuse',diffuse),('normal',normal),('gloss',gloss),('height',height)]:image.save(out/Path(paths[role]).name)
 nativeFile='glass/'+stem+'-native.png';native.convert('RGB').save(out/Path(nativeFile).name)
 rgb=np.array(normal.convert('RGB'));alpha=np.array(height);assembled=hashlib.sha256(np.concatenate([rgb,alpha[:,:,None]],axis=2).astype('uint8').tobytes()).hexdigest()
 entry={'file':paths['diffuse'],'normalFile':paths['normal'],'glossFile':paths['gloss'],'heightFile':paths['height'],'nativeFile':nativeFile,'assembledNormalSha256':assembled}
 if not n.startswith('*'):catalog.setdefault(n,{})[k]=entry
 receipt.append({**v,'nativeRGBAKey':k,'nativeFile':nativeFile,'assembledNormalSha256':assembled,'method':method,'donorMatchCorrelation':score,'sources':source,'outputs':{role:{'file':p,'sha256':hashlib.sha256((out/Path(p).name).read_bytes()).hexdigest()} for role,p in paths.items()},'runtime':not n.startswith('*')})
json.dump(catalog,open(cfg.out/'catalog.json','w'),indent=2);json.dump({'campaigns':inventory['campaigns'],'variants':receipt,'errors':inventory['errors'],'alphaPolicy':'Authored alpha range unchanged. Generated pane caps .2-.8; matte relief .35-.6.','mattePolicy':'Plain/control/uncertain candidates receive generated normals and zero gloss; turbulent *glass remains on the existing liquid path.'},open(cfg.out/'provenance.json','w'),indent=2)
print('Raw maps only: run baseline.mjs then apply_regions.py; do not install unmasked maps.')
print('variants',len(receipt),'runtime',sum(x['runtime'] for x in receipt),'donor',sum('authored' in x['method'] for x in receipt))
