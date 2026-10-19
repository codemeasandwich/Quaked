"""Preview actual decoded Mid/High maps and untouched native Low; no authoring."""
from pathlib import Path
import json,html
import numpy as np
from PIL import Image,ImageDraw
HERE=Path(__file__).resolve().parent
OUT=HERE/'tiers'
batch=json.loads((OUT/'batch.json').read_text())
review=OUT/'review'; review.mkdir(exist_ok=False)
for item in batch['items']:
 original=Image.open(HERE/item['original']).convert('RGB')
 for tier,row in item['tiers'].items():
  name=item['name']; tag=name+'-'+tier.lower()
  maps={role:Image.open(HERE/path).convert('RGB') for role,path in row['files'].items()}
  diffuse=maps['diffuse']
  sheet=Image.new('RGB',(1400,1100),(28,30,33)); draw=ImageDraw.Draw(sheet)
  draw.text((12,8),f'{name} {tier}: native (left), decoded Q92 (right); lower left: repeated Q92',fill='white')
  size=(256,512) if original.width!=original.height else (512,512)
  sheet.paste(original.resize(size,Image.Resampling.NEAREST),(12,32))
  sheet.paste(diffuse.resize(size,Image.Resampling.LANCZOS),(540,32))
  repeated=Image.fromarray(np.tile(np.asarray(diffuse),(2,2,1))).resize((512,512),Image.Resampling.LANCZOS)
  sheet.paste(repeated,(12,570))
  for i,div in enumerate((2,4)):
   dims=(original.width//div,original.height//div)
   a=original.resize(dims,Image.Resampling.BOX); b=diffuse.resize(dims,Image.Resampling.BOX)
   draw.text((540,570+i*235),f'Native/{div} {dims}: same-size original left / {tier} right',fill='white')
   a=a.resize((dims[0]*3,dims[1]*3),Image.Resampling.NEAREST); b=b.resize(a.size,Image.Resampling.NEAREST)
   sheet.paste(a,(540,595+i*235)); sheet.paste(b,(550+a.width,595+i*235))
  sheet.save(review/(tag+'-review.jpg'),quality=92)
  vector=np.stack([np.asarray(maps['normal'+c],dtype=float)[:,:,0] for c in 'XYZ'],2)/127.5-1
  vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-12)
  normal=Image.fromarray(np.uint8(np.clip((vector*.5+.5)*255,0,255)))
  entries=[('Decoded Q92 height',maps['height']),('Decoded Q92 XYZ reconstructed normal',normal)]
  colors=np.asarray(diffuse,dtype=float)
  for v in (np.array([.6,.3,.75]),np.array([-.6,-.3,.75])):
   v/=np.linalg.norm(v); light=.35+.65*np.clip((vector*v).sum(2),0,1)
   entries.append(('Opposed static relief light '+('A' if v[0]>0 else 'B'),Image.fromarray(np.uint8(np.clip(colors*light[:,:,None],0,255)))))
  sheet=Image.new('RGB',(1200,1100),(28,30,33)); draw=ImageDraw.Draw(sheet)
  for i,(label,im) in enumerate(entries):
   x=(i%2)*600; y=(i//2)*550; draw.text((x+10,y+8),name+' '+tier+' '+label,fill='white'); im=im.copy(); im.thumbnail((512,512)); sheet.paste(im,(x+10,y+30))
  sheet.save(review/(tag+'-relief.jpg'),quality=92)
materials=[]
for item in batch['items']:
 materials.append({'name':item['name'],'edition':item['edition'],'native':[item['nativeIdentity']['width'],item['nativeIdentity']['height']],
  'Low':'../'+item['original'],'Mid':str(Path(item['tiers']['Mid']['files']['diffuse']).relative_to('tiers')),'High':str(Path(item['tiers']['High']['files']['diffuse']).relative_to('tiers'))})
parts=['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Quake / Hexen shared texture tiers</title><style>body{background:#17191c;color:#eee;font:16px system-ui;max-width:1550px;margin:28px auto;padding:0 20px}a{color:#a4d7ff}header{position:sticky;top:0;background:#17191cf2;padding:12px 0;z-index:1}select{font:inherit;padding:8px;background:#32363c;color:white}section{border-top:1px solid #45484d;margin:28px 0;padding-top:12px}.pair{display:flex;gap:24px;flex-wrap:wrap}.pair img{height:512px;width:auto;max-width:100%;object-fit:contain}figure{margin:0}figcaption{margin:10px 0;color:#ccc}.repeat{height:512px;width:640px;max-width:100%;background-repeat:repeat}.proof{max-width:100%;height:auto}p{max-width:90ch}details{margin:20px 0}</style><header><h1>One master, two enhanced tiers</h1><label>Texture quality <select id="quality"><option value="Low">Low — unchanged original</option><option value="Mid" selected>Mid — 4× (default)</option><option value="High">High — 8×</option></select></label></header><p>The shared Quake and Hexen authoring standard. This first set contains four Hexen II / Portal materials. Each colour and relief pair comes from one retained full-resolution master package. All enhanced maps are lossy WebP quality92, method6. These are offline art previews; game and pack integration are separate.</p><p><a href="batch.json">Batch/source manifest</a> · <a href="codec-environment.json">Encoding environment</a></p>''']
for m in materials:
 n=html.escape(m['name']); parts.append(f'<section data-material="{n}"><h2>{n} · {m["edition"]}</h2><p class="dimensions"></p><div class="pair"><figure><img class="native" src="{m["Low"]}" alt="Unchanged original" style="image-rendering:pixelated"><figcaption>Native source enlarged for layout</figcaption></figure><figure><img class="selected" alt="Selected real texture file"><figcaption class="tier-caption"></figcaption></figure></div><h3>Repeated material</h3><div class="repeat"></div><details open><summary>Half / quarter comparisons and tile joins</summary><p class="low-note">Low is the unchanged source. Enhanced diagnostics appear when Mid or High is selected.</p><img class="proof distance" alt="Original and selected tier at same distance dimensions"></details><details><summary>Decoded relief and opposed lighting</summary><img class="proof relief" alt="Selected height normals and opposite lights"></details><p><a href="../masters/{n}/master.json">Single retained master package</a> · <a href="{n}/manifest.json">Both tiers and measurements</a></p></section>')
parts.append('<script>const materials='+json.dumps(materials)+';\n'+'''function selectTier(){const tier=document.querySelector('#quality').value;for(const m of materials){const node=document.querySelector('[data-material="'+m.name+'"]');const factor={Low:1,Mid:4,High:8}[tier];node.querySelector('.dimensions').textContent=tier+' · '+m.native[0]*factor+' × '+m.native[1]*factor;const image=node.querySelector('.selected');image.src=m[tier];image.style.imageRendering=tier==='Low'?'pixelated':'auto';node.querySelector('.tier-caption').textContent=tier==='Low'?'Unchanged native pixels':tier+' — actual decoded Q92 map';const repeat=node.querySelector('.repeat');repeat.style.backgroundImage='url("'+m[tier]+'")';repeat.style.backgroundSize=(256*m.native[0]/m.native[1])+'px 256px';const hidden=tier==='Low';node.querySelector('.low-note').hidden=!hidden;for(const kind of ['distance','relief']){const im=node.querySelector('.'+kind);im.hidden=hidden;if(!hidden)im.src='review/'+m.name+'-'+tier.toLowerCase()+'-'+(kind==='distance'?'review':'relief')+'.jpg';}}}document.querySelector('#quality').addEventListener('change',selectTier);selectTier();</script><p>Height is interpreted material relief, not measured displaced geometry. Original edge joints are intentional masonry/wood structure; no image-perimeter frame is added.</p></html>''')
(OUT/'index.html').write_text('\n'.join(parts))
print('Eight distance/repeat and eight opposed-relief sheets; Low/Mid(default)/High preview created')
