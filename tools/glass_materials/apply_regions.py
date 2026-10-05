"""Compose only reviewed glass regions; unknown/changed art requires a new review.
Run baseline.mjs on the same staging directory first. Never writes the checkout.
"""
from pathlib import Path
from PIL import Image,ImageDraw
from collections import deque
import numpy as np,json,hashlib,ast,argparse
p=argparse.ArgumentParser();p.add_argument('--stage',type=Path,required=True);args=p.parse_args();stage=args.stage;assets=stage/'assets'
review=json.loads(Path(__file__).with_name('regions.json').read_text());provenance=json.loads((stage/'provenance.json').read_text());catalog=json.loads((stage/'catalog.json').read_text());proof=[]
tree=ast.parse(Path(__file__).with_name('generate.py').read_text());functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['pane_distance','blurred']];exec(compile(ast.Module(body=functions,type_ignores=[]),'pane-helpers','exec'))
unique={v['name']+'|'+v['nativeRGBAKey']:v for v in provenance['variants'] if v['runtime']}
for key,v in unique.items():
 if key not in review:raise ValueError('Unreviewed native material: '+key)
 spec=review[key];f=v['outputs'];source=assets/Path(f['diffuse']['file']).name
 if hashlib.sha256(source.read_bytes()).hexdigest()!=spec['sourceDiffuseSha256']:raise ValueError('Changed diffuse needs ROI review: '+key)
 image=Image.open(source).convert('RGB');w,h=image.size;roi=Image.new('L',(w,h),0);draw=ImageDraw.Draw(roi)
 for shape in spec['shapes']:
  if shape['type']=='rect':a,b,c,d=shape['bounds'];draw.rectangle((a*w,b*h,c*w,d*h),fill=255)
  elif shape['type']=='ellipse':cx,cy=shape['center'];rx,ry=shape['radius'];draw.ellipse(((cx-rx)*w,(cy-ry)*h,(cx+rx)*w,(cy+ry)*h),fill=255)
  elif shape['type']=='polygon':draw.polygon([(x*w,y*h)for x,y in shape['points']],fill=255)
  else:raise ValueError(shape)
 inside=np.array(roi)>0;rgb=np.array(image).astype(float)/255;pane=inside&(rgb.max(axis=2)>.22)
 baseline=stage/'baseline'/Path(f['normal']['file']).name.replace('-normal.png','.bin');base=np.frombuffer(baseline.read_bytes(),dtype=np.uint8).reshape(h,w,4).copy()
 if 'authored donor' in v['method']:
  normal=np.array(Image.open(assets/Path(f['normal']['file']).name).convert('RGB'));height=np.array(Image.open(assets/Path(f['height']['file']).name).convert('L'));glass=np.concatenate([normal,height[:,:,None]],axis=2);gloss=np.array(Image.open(assets/Path(f['gloss']['file']).name).convert('RGB'))[:,:,0];pane &=gloss>20
 else:
  distance=pane_distance(pane);height=blurred(.2+.6*np.sin(np.minimum(distance,1)*np.pi/2));gy,gx=np.gradient(height);strength=np.sqrt(w*h)/8;nx=-gx*strength;ny=-gy*strength;length=np.sqrt(nx*nx+ny*ny+1)
  glass=np.clip(np.round(np.stack([(nx/length*.5+.5)*255,(ny/length*.5+.5)*255,(1/length*.5+.5)*255,height*255],axis=2)),0,255).astype('uint8');gloss=np.full((h,w),127,dtype='uint8')
 combined=base.copy();combined[pane]=glass[pane];mask=np.zeros((h,w,3),dtype='uint8');mask[:,:,0]=np.where(pane,gloss,0);mask[:,:,1]=np.where(inside,255,0)
 for role,out in [('normal',Image.fromarray(combined[:,:,:3])),('height',Image.fromarray(combined[:,:,3])),('gloss',Image.fromarray(mask))]:
  target=assets/Path(f[role]['file']).name;out.save(target);f[role]['sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
 assembled=hashlib.sha256(combined.tobytes()).hexdigest();entry=catalog[v['name']][v['nativeRGBAKey']];entry['assembledNormalSha256']=assembled;entry['regionGlass']=bool(inside.any());v['assembledNormalSha256']=assembled
 assert np.array_equal(combined[~pane],base[~pane]);assert not np.any(mask[:,:,0][~inside]);
 proof.append({'name':v['name'],'key':v['nativeRGBAKey'],'review':spec,'baselineNormalSha256':hashlib.sha256(base.tobytes()).hexdigest(),'assembledNormalSha256':assembled,'ordinaryOutsidePaneExact':True,'noGlassOutsideOpening':True,'darkLeadGlossZero':True})
(stage/'catalog.json').write_text(json.dumps(catalog,indent=2)+'\n');(stage/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n');(stage/'region-proof.json').write_text(json.dumps(proof,indent=2)+'\n');print('Reviewed pane-only composition:',len(proof),'materials')
