"""Reuse native wall-plane diagnostic with installed/trial source substitution only.
No GPU/runtime proof, artwork fitting, lighting or publication.
"""
from pathlib import Path
import json,hashlib,datetime,platform
import numpy as np
from PIL import Image,ImageDraw,__version__ as PIL_VERSION
P=Path(__file__).resolve().parent;ROOT=P.parents[4];INTAKE=P.parent/'screenshot-scene-intake';TRIAL=P.parent/'tech-family-colour-trial-v1';REPORT=INTAKE/'scene-proof.json';JOINS=INTAKE/'wall-joins.json';INDEX=ROOT/'assets/game/textures/index.json'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def rel(p):return str(Path(p).relative_to(ROOT))
inputs={}
def bind(p):
 p=Path(p);inputs[rel(p)]={'file':rel(p),'sha256':sha(p),'bytes':p.stat().st_size};return p
base=next(m for m in json.loads(bind(REPORT).read_text())['maps']if m['source']=='base');joins=json.loads(bind(JOINS).read_text());catalog=json.loads(bind(INDEX).read_text());bind(INTAKE/'render-native-walls.py');bind(TRIAL/'execution-reconciliation.json');bind(TRIAL/'tech10_1-pretrial-approval.json')
candidate={n:bind(TRIAL/(n+'-colour.png'))for n in ['tech08_1','tech09_3','tech10_1']}
for n in candidate:
 receipt=json.loads(bind(TRIAL/(n+'-colour.json')).read_text());assert sha(candidate[n])==receipt['outputSha256'];assert sha(ROOT/receipt['original'])==receipt['originalSha256'];bind(ROOT/receipt['original']);assert sha(ROOT/receipt['generated'])==receipt['generatedSha256'];bind(ROOT/receipt['generated'])
textureproof={};outputs=[];faceproof=[];images={};factor=4
for wall,box in [(2112,(-128,-208,288,0)),(2816,(-608,-160,-304,176))]:
 x0,z0,x1,z1=box;w=(x1-x0)*factor;h=(z1-z0)*factor;xs,zs=np.meshgrid(x0+(np.arange(w)+.5)/factor,z1-(np.arange(h)+.5)/factor)
 selected=[f for f in base['nearbyFaces']if f['bbox'][0][1]==wall and f['bbox'][1][1]==wall and f['bbox'][0][0]<x1 and f['bbox'][1][0]>x0 and f['bbox'][0][2]<z1 and f['bbox'][1][2]>z0]
 faceproof.append({'wallY':wall,'worldXZBounds':box,'faces':selected})
 def render(variant):
  canvas=np.full((h,w,3),35,dtype=np.uint8);coverage=np.zeros((h,w),dtype=bool)
  for f in selected:
   name=f['texture'];native=bind(INTAKE/('base-native-'+name+'.png'))
   if variant=='native':source=native;reason='unchanged native'
   elif variant=='trial'and name in candidate:source=candidate[name];reason='three authorized colour-only trials'
   elif name in catalog['textures']and (ROOT/'assets/game/textures'/catalog['textures'][name]).exists():source=bind(ROOT/'assets/game/textures'/catalog['textures'][name]);reason='current catalog default diffuse'
   else:source=native;reason='native fallback: no available catalog diffuse'
   textureproof[(variant,name)]={'variant':variant,'name':name,'source':rel(source),'sourceSha256':sha(source),'reason':reason};tile=np.asarray(Image.open(source).convert('RGB'));native_size=Image.open(native).size;textureproof[(variant,name)].update(dimensions=[tile.shape[1],tile.shape[0]],nativeDimensions=list(native_size))
   # Convex BSP face coverage at exact world-space pixel centres, robust to collinear T-junction vertices.
   vs=np.array(f['vertices']);normal=sum((np.cross(vs[j]-vs[0],vs[(j+1)%len(vs)]-vs[0])for j in range(len(vs))),np.zeros(3));assert abs(normal[1])>0;mask=np.ones((h,w),dtype=bool)
   for j in range(len(vs)):
    a=vs[j];b=vs[(j+1)%len(vs)];cross_y=(b[2]-a[2])*(xs-a[0])-(b[0]-a[0])*(zs-a[2]);mask&=cross_y*normal[1]>=-1e-6
   s,t=f['vectors'];us=np.floor((s[0]*xs+s[1]*wall+s[2]*zs+s[3])*tile.shape[1]/native_size[0]).astype(int)%tile.shape[1];vt=np.floor((t[0]*xs+t[1]*wall+t[2]*zs+t[3])*tile.shape[0]/native_size[1]).astype(int)%tile.shape[0];canvas[mask]=tile[vt[mask],us[mask]];coverage|=mask
  return Image.fromarray(canvas),int(coverage.sum())
 for variant in ['native','installed','trial']:
  im,pixels=render(variant);images[(wall,variant)]=im;name=f'wall-y{wall}-{variant}-4x.png';im.save(P/name);outputs.append({'file':name,'sha256':sha(P/name),'dimensions':list(im.size),'wallY':wall,'variant':variant,'coveredPixels':pixels})
  for d in [2,4]:
   small=im.resize(((x1-x0)//d,(z1-z0)//d),Image.Resampling.BOX);name=f'wall-y{wall}-{variant}-world-div{d}.png';small.save(P/name);outputs.append({'file':name,'sha256':sha(P/name),'dimensions':list(small.size),'wallY':wall,'variant':variant,'BOXReductionFrom4x':factor*d})
 for d in [2,4]:
  thumbs=[Image.open(P/f'wall-y{wall}-{v}-world-div{d}.png')for v in ['native','installed','trial']];scale=3 if d==2 else 6;tw,th=[v*scale for v in thumbs[0].size];sheet=Image.new('RGB',(3*(tw+12)+12,th+56),(25,25,25));draw=ImageDraw.Draw(sheet)
  for k,(v,im)in enumerate(zip(['native','installed','trial08+09+10'],thumbs)):
   x=12+k*(tw+12);sheet.paste(im.resize((tw,th),Image.Resampling.NEAREST),(x,42));draw.text((x,8),f'{v} world/{d} BOX',fill='white')
  name=f'wall-y{wall}-threeway-world-div{d}.png';sheet.save(P/name);outputs.append({'file':name,'sha256':sha(P/name),'dimensions':list(sheet.size),'displayNearestScale':scale})
# Crop actual shared-edge strips out of same plane images. No invented edge-equality assumption.
chosen=[(2112,3256,3257,'first-08-internal-cut-to11'),(2816,2818,2830,'second-door-bottom-to08'),(2816,2818,2823,'second-door-left-to10')];edgeproof=[]
for wall,a,b,label in chosen:
 edge=next(j for j in joins['exactSharedEdgeJoins']if j['source']=='base'and j['wallY']==wall and j['aFace']==a and j['bFace']==b);end=np.array(edge['worldEndpoints']);xmin,xmax=end[:,0].min()-12,end[:,0].max()+12;zmin,zmax=end[:,2].min()-12,end[:,2].max()+12
 box=next(x['worldXZBounds']for x in faceproof if x['wallY']==wall);x0,z0,x1,z1=box;crop=[int(max(xmin,x0)-x0)*4,int(z1-min(zmax,z1))*4,int(min(xmax,x1)-x0)*4,int(z1-max(zmin,z0))*4];thumbs=[images[(wall,v)].crop(crop)for v in ['native','installed','trial']];tw,th=thumbs[0].size;sheet=Image.new('RGB',(3*(tw+12)+12,th+48),(25,25,25));draw=ImageDraw.Draw(sheet)
 for k,(v,im)in enumerate(zip(['native','installed','trial08+09+10'],thumbs)):
  x=12+k*(tw+12);sheet.paste(im,(x,36));draw.text((x,8),v,fill='white')
 name=label+'-strip-4x.png';sheet.save(P/name);edgeproof.append({'edge':edge,'compositionCropPixels':crop,'worldMargin':12,'file':name,'sha256':sha(P/name)})
# Input stability includes catalog, actual sources, native UV/face receipt and candidate bytes.
assert all(sha(ROOT/p)==r['sha256']for p,r in inputs.items()),'Input changed during comparison'
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Unlit CPU orthographic comparison on exact actual remastered base e1m1 face UVs. Three colour trial PNG substitutions only; all other available textures use unchanged current catalog diffuse, else unchanged native fallback. No light/height/GPU/runtime/publication/8x/owner acceptance.','basePack':base['pack'],'baseBspSha256':base['bspSha256'],'mapMember':base['member'],'environment':{'python':platform.python_version(),'Pillow':PIL_VERSION,'numpy':np.__version__},'reuse':rel(INTAKE/'render-native-walls.py'),'driver':{'file':rel(Path(__file__)),'sha256':sha(__file__)},'sampling':'Each 4x output pixel samples its world-space centre. Actual per-face UV maps native texels to decoded source dimensions with periodic nearest sampling. Convex coverage uses every polygon edge and summed polygon normal, retaining collinear T-junctions. For each variant BOTH world/2 and world/4 are BOX reductions of its own4x composition; display sheets then use labelled nearest enlargement. Native4x sampling replicates unchanged native pixels.','inputFiles':list(inputs.values()),'inputsStableAfter':True,'textures':list(textureproof.values()),'faceInputs':faceproof,'outputs':outputs,'sharedEdgeStrips':edgeproof,'reproduce':'/usr/bin/python3 '+rel(Path(__file__))}
(P/'comparison-proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'inputs':len(inputs),'outputs':len(outputs),'edges':len(edgeproof),'textures':len(textureproof),'inputsStableAfter':True}))
