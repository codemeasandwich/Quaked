#!/usr/bin/env python3
"""Fit three complete owner-supplied Rogue atlases to their exact native models.

These sheets already use the native atlas proportions. Preserve their complete
atlas transform; extend only supplied edge colour at UV boundaries. Per-island
ownership prevents a neighbouring body part becoming a filtering donor. The
native palette/model is a layout reference, never a source of output colour.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
from scipy import ndimage
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from fit_vore import member
from fit_skin import spread
from update_head_skins import uv_footprint
from update_enemy_heights import height_for

RECIPES = {
 'dragon': dict(source='6fxet96fxet96fxe', sourceSha='13bfde08a63b7bc15b5efd071a09c8f434e232cca64274a9d7948430e5803b4e', modelSha='1ba01029d4113cc832aa5ab551c7bf060b5f7a4eb1afde35607564413bfee2ec', layout=[1,308,179,336,608,101], size=[1349,784], factor=5),
 's_wrath': dict(source='ekijfxekijfxekij', sourceSha='4ab505e3289ca7d0d804fc15178825f28cbee7481a26e04a1208082729e67bdc', modelSha='4c0653e3adba99be4d581c92a928fd6e8c27b0a2159a97f7ec5e885478249b8d', layout=[1,308,186,296,564,108], size=[1325,800], factor=5),
 'mummy': dict(source='jc5i6kjc5i6kjc5i', sourceSha='3bc0906638ddc4c6e9d22f894bb74337709fc760ddb2f817d5f6bc64e11cc640', modelSha='3926d2dcf2451deaf32e67877016884cfb91a313968beefe514b9274fc30a1d1', layout=[1,168,194,177,347,192], size=[960,1109], factor=6),
}
def sha(data):
 return hashlib.sha256(data).hexdigest()

def fit_one(key, pack, source_root, output, recipe=None):
 # Generated, native-layout atlases share this same importer. An explicit recipe
 # supplies their source path and matte policy; the original Rogue recipes stay fixed.
 spec=recipe or RECIPES[key]; name=spec.get('sourceFile','Gemini_Generated_Image_'+spec.get('source','')+'.jpeg')
 source_path=source_root/name; raw=source_path.read_bytes()
 if sha(raw)!=spec['sourceSha']: raise ValueError('Supplied image changed: '+name)
 data=member(pack,'progs/'+key+'.mdl')
 if sha(data)!=spec['modelSha'] or list(struct.unpack_from('<6i',data,48))!=spec['layout'] or struct.unpack_from('<i',data,84)[0]!=0:
  raise ValueError('Native identity/layout differs: '+key)
 source=Image.open(source_path).convert('RGB')
 if list(source.size)!=spec['size']: raise ValueError('Supplied dimensions differ')
 factor=spec['factor']; w,h=spec['layout'][1:3]; W,H=w*factor,h*factor
 rgb=np.asarray(source).astype(np.int16)
 # Explicit sheet-specific matte policies: the dragon has neutral grey plus a
 # black centre divider, the Overlord black, and the Mummy a dark brown gradient.
 # Enclosed dark anatomy remains inside the foreground silhouette.
 if spec.get('matte')=='blue-grey': foreground=((rgb[:,:,2]-rgb[:,:,0])<6)&((rgb[:,:,2]-rgb[:,:,1])<8)
 elif spec.get('matte')=='dark-brown': foreground=rgb.max(2)>25
 elif key=='dragon': foreground=(rgb.max(2)-rgb.min(2)>12)&(rgb.max(2)>25)
 elif key=='mummy': foreground=rgb.max(2)>25
 else: foreground=rgb.max(2)>15
 # Close narrow dark channels before filling the silhouette. Otherwise a dark
 # rib seam connected to the backdrop would be misclassified as missing art.
 foreground=ndimage.binary_fill_holes(ndimage.binary_closing(foreground,iterations=8 if key=='mummy' else 4))
 footprint=uv_footprint(data,factor)
 labels,count=ndimage.label(footprint)
 # Keep authored coordinates exact; the native UVs remain the correspondence.
 pixels=np.asarray(source.resize((W,H),Image.Resampling.LANCZOS))
 valid=np.asarray(Image.fromarray((foreground*255).astype(np.uint8)).resize((W,H),Image.Resampling.NEAREST))>0
 canvas=np.zeros((H,W,3),np.uint8); covered=np.zeros((H,W),bool); islands=[]
 for index,bounds in enumerate(ndimage.find_objects(labels),1):
  top=max(0,bounds[0].start-40);bottom=min(H,bounds[0].stop+40)
  left=max(0,bounds[1].start-40);right=min(W,bounds[1].stop+40)
  area=np.s_[top:bottom,left:right];surface=labels[area]==index;local_footprint=footprint[area]
  # A donor must be near this component and may never belong to another UV
  # component. Four-pixel gutters retain proper mip/filtering edge colours.
  neighbourhood=ndimage.binary_dilation(surface,iterations=12)
  seeds=valid[area] & neighbourhood & (~local_footprint|surface)
  if not seeds.any(): raise ValueError('No supplied colour for UV component '+str(index))
  extended,reached=spread(pixels[area],seeds,24)
  if np.any(surface & ~reached): raise ValueError('Uncovered UV component '+str(index))
  region=ndimage.binary_dilation(surface,iterations=4)&reached&(~local_footprint|surface)
  canvas[area][region]=extended[region];covered[area]|=region
  islands.append(dict(id=index,surfacePixels=int(surface.sum()),directPixels=int((surface&seeds).sum()),edgePixels=int((surface&~seeds).sum())))
 if np.any(footprint&~covered): raise ValueError('Uncovered native surface')
 out=output/key/'custom';out.mkdir(parents=True,exist_ok=True)
 result=Image.fromarray(canvas);result.save(out/'diffuse.png')
 height_for(result,out/'height.webp',key+'/custom')
 report=dict(schema=1,model='progs/'+key+'.mdl',nativeModelSha256=spec['modelSha'],source=name,sourceSha256=spec['sourceSha'],sourceDimensions=spec['size'],
  dimensions=[W,H],factor=factor,skin=0,poses=spec['layout'][5],vertices=spec['layout'][3],triangles=spec['layout'][4],
  transform='complete atlas, top-row-first, no flip; original UVs preserved',
  mattePolicy=spec.get('matte') or {'dragon':'neutral grey and black divider','s_wrath':'black','mummy':'dark brown gradient'}[key],
  nativeTexturePixelsUsed=0,islands=islands,surfacePixels=int(footprint.sum()),edgePixels=sum(i['edgePixels'] for i in islands),
  normalProfile=dict(strength=.65,cap=.55),reuse=['fit_vore.member','uv_footprint','fit_skin.spread','height_for'],
  files={f:sha((out/f).read_bytes()) for f in ['diffuse.png','height.webp']})
 if spec.get('generation'):report['generation']=spec['generation']
 (out/'SOURCE.json').write_text(json.dumps(report,indent=2)+'\n');print(key,json.dumps({k:report[k] for k in ['dimensions','surfacePixels','edgePixels']}))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--model',choices=list(RECIPES),action='append')
 parser.add_argument('--pack',type=Path,default=ROOT/'resources/rogue/pak0.pak')
 parser.add_argument('--source-root',type=Path,default=ROOT)
 parser.add_argument('--output',type=Path,default=ROOT/'newer/enemies')
 args=parser.parse_args()
 for key in args.model or RECIPES:fit_one(key,args.pack,args.source_root,args.output)
