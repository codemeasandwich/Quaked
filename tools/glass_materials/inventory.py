import pathlib,struct,re,json,hashlib,math
from PIL import Image,ImageDraw
import numpy as np
import argparse
args=argparse.ArgumentParser();args.add_argument('--out',type=pathlib.Path,required=True);cfg=args.parse_args();root=pathlib.Path(__file__).resolve().parents[2]/'resources';out=cfg.out;out.mkdir(parents=True,exist_ok=True);variants={};campaigns={};errors=[]
classes=json.loads(pathlib.Path(__file__).with_name('classification.json').read_text())
def pack(path):
 b=path.read_bytes(); magic,start,size=struct.unpack_from('<4sii',b);assert magic==b'PACK'
 return {b[q:q+56].split(b'\0')[0].decode('latin1'):b[struct.unpack_from('<i',b,q+56)[0]:sum(struct.unpack_from('<ii',b,q+56))] for q in range(start,start+size,64)}
palette=pack(root/'id1/pak0.pak')['gfx/palette.lmp']
for game in ['id1','hipnotic','rogue','dopa','mg1','ad','quoth','malice','aopfm_v2','xmen']:
 entries={};packs=[]
 for p in sorted((root/game).glob('*.pak')):
  packs.append(str(p));entries.update({n:(str(p),b) for n,b in pack(p).items()})
 pal=entries.get('gfx/palette.lmp',('',palette))[1]; maps=[];names=set(); hits=0
 for n,(p,b) in entries.items():
  if not n.lower().endswith('.bsp'):continue
  maps.append(n)
  try:
   off,size=struct.unpack_from('<ii',b,20);count=struct.unpack_from('<i',b,off)[0]
   for i in range(count):
    t=struct.unpack_from('<i',b,off+4+i*4)[0]
    if t<0:continue
    at=off+t;name=b[at:at+16].split(b'\0')[0].decode('latin1');
    if not re.search(r'window|glass|stain|(?:^|[_+0-9])win',name,re.I):continue
    w,h,m=struct.unpack_from('<iii',b,at+16)
    if not 0<w*h<10000000:raise ValueError('bad texture size')
    pixels=b[at+m:at+m+w*h]; sha=hashlib.sha256(pixels).hexdigest(); palsha=hashlib.sha256(pal).hexdigest(); key=f'{name}:{w}x{h}:{sha}:{palsha}'
    if key not in variants:
     im=Image.frombytes('P',(w,h),pixels);im.putpalette(pal);rgb=np.array(im.convert('RGB'));rgb[np.frombuffer(pixels,dtype=np.uint8).reshape(h,w)==255]=0;Image.fromarray(rgb).save(out/(sha+'-'+palsha[:12]+'.png'))
     variants[key]={'name':name,'width':w,'height':h,'sha256_pixels':sha,'sha256_palette':palsha,'image':str(out/(sha+'-'+palsha[:12]+'.png')),'uses':[]}
    variants[key]['uses'].append({'game':game,'pack':p,'map':n});names.add(name);hits+=1
  except Exception as e:errors.append({'game':game,'map':n,'error':str(e)})
 campaigns[game]={'packs':packs,'mapCount':len(maps),'maps':maps,'candidateNames':sorted(names),'textureOccurrences':hits}
ordered=sorted(variants.values(),key=lambda v:(v['name'],v['sha256_pixels']))
for i,v in enumerate(ordered):
 v['candidateId']=i;v['visualClass']=classes.get(v['name']+'|'+v['sha256_pixels']+'|'+v['sha256_palette'],'decorative_uncertain');v['classificationEvidence']='candidate-sheet-'+str(i//40)+'.png, tile '+str(i%40)
payload={'campaigns':campaigns,'variants':ordered,'errors':errors};(out/'inventory.json').write_text(json.dumps(payload,indent=2))
# page sheets keep all candidates readable
for page in range(math.ceil(len(ordered)/40)):
 selected=ordered[page*40:(page+1)*40]; sheet=Image.new('RGB',(1200,math.ceil(len(selected)/8)*160),(35,35,35));d=ImageDraw.Draw(sheet)
 for j,v in enumerate(selected):
  x=j%8*150;y=j//8*160;im=Image.open(v['image']);im.thumbnail((144,113));sheet.paste(im,(x,y+36));d.text((x+2,y+2),f"{v['candidateId']} {v['name']}",fill='white');d.text((x+2,y+17),','.join(sorted(set(u['game'] for u in v['uses'])))[:25],fill='white')
 sheet.save(out/f'candidate-sheet-{page}.png')
print(json.dumps({'campaigns':{k:{x:v[x] for x in ['mapCount','candidateNames','textureOccurrences']} for k,v in campaigns.items()},'variants':len(ordered),'errors':errors},indent=2))
