from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib,numpy as np
root=Path.cwd();bp=Path('assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-001/batch-stones.json');batch=json.load(open(bp));pre=json.load(open('docs/quake/textures/batch-001-pre-tier-art-diagnostics/probe.json'));out=Path('docs/quake/textures/batch-001-stones-final-art-diagnostics');results=[]
for item in batch['items']:
 name=item['name'];native=Image.open(item['original']).convert('RGB')
 compare=Image.new('RGB',(860,660),(32,32,32));dr=ImageDraw.Draw(compare);dr.text((4,3),name+' exact BOX native64/32 and decoded Mid/High64/32, shown4x nearest',fill='white')
 for j,div in enumerate((2,4)):
  size=128//div
  for i,(label,im) in enumerate([('Native',native)]+[(tier,Image.open(row['files']['diffuse']).convert('RGB')) for tier,row in item['tiers'].items()]):
   dim=size*4;im=im.resize((size,size),Image.Resampling.BOX);im.save(out/(name+'-'+label.lower()+'-box-'+str(size)+'.png'));compare.paste(im.resize((dim,dim),Image.Resampling.NEAREST),(i*280,j*310+40));dr.text((i*280+4,j*310+22),label+' '+str(size)+'x'+str(size),fill='white')
 compare.save(out/(name+'-distance.png'))
 for tier,row in item['tiers'].items():
  tag=name+'-'+tier.lower();maps={k:Image.open(p).convert('RGB') for k,p in row['files'].items()};c=maps['diffuse'];s=c.width
  rep=Image.new('RGB',(s*2,s*2))
  for x in (0,s):
   for y in (0,s):rep.paste(c,(x,y))
  r=128;sheet=Image.new('RGB',(s+256,max(s+32,560)),(32,32,32));dr=ImageDraw.Draw(sheet);dr.text((3,3),tag+' decoded exact1:1 X seam | Y seam | corners below',fill='white');sheet.paste(rep.crop((s-r,0,s+r,s)),(0,24));sheet.paste(rep.crop((0,s-r,s,s+r)),(256,24));sheet.paste(rep.crop((s-r,s-r,s+r,s+r)),(256,280));sheet.save(out/(tag+'-boundary.png'))
  h=np.asarray(maps['height'])[:,:,0]/255.;xyz=np.stack([np.asarray(maps['normal'+k])[:,:,0] for k in 'XYZ'],axis=2)/127.5-1;xyz/=np.maximum(np.linalg.norm(xyz,axis=2,keepdims=True),1e-12)
  samples={}
  for key,v in pre[name]['samples'].items():
   rect=[int(round(z*s/1024)) for z in v['rectMasterPixels']];x0,y0,x1,y1=rect;a=h[y0:y1,x0:x1];samples[key]={'decodedRectPixels':rect,'meanHeight':float(a.mean()),'medianHeight':float(np.median(a)),'p10p90':[float(np.percentile(a,p)) for p in (10,90)]}
  grey=[]
  for l in (np.array([.65,.35,.68]),np.array([-.65,-.35,.68])):
   l/=np.linalg.norm(l);shade=.2+.8*np.maximum(0,np.einsum('ijk,k->ij',xyz,l));grey.append(Image.fromarray(np.uint8(np.clip(shade*255,0,255))).convert('RGB'))
  gs=Image.new('RGB',(1024,544),(32,32,32));dr=ImageDraw.Draw(gs)
  for i,g in enumerate(grey):gs.paste(g.resize((512,512),Image.Resampling.LANCZOS),(512*i,24));dr.text((512*i+4,4),tag+' decodedXYZ opposed grey '+str(i+1),fill='white')
  gs.save(out/(tag+'-decoded-grey-lights.png'))
  results.append({'name':name,'tier':tier,'dimensions':list(c.size),'mapFiles':{k:{'file':p,'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest()} for k,p in row['files'].items()},'samples':samples})
(out/'probe.json').write_text(json.dumps(results,indent=2)+'\n');print('rows',len(results))
