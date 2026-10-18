#!/usr/bin/env python3
"""Fit three complete owner-supplied Rogue atlases to their exact native models.

These sheets already use the native atlas proportions. Preserve their complete
atlas transform; extend only supplied edge colour at UV boundaries. Per-island
ownership prevents a neighbouring body part becoming a filtering donor. The
native palette/model is a layout reference, never a source of output colour.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from resource_paths import resource_path
import argparse
import hashlib
import json
import struct
import shutil
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
 'dragon': dict(source='6fxet96fxet96fxe', sourceSha='13bfde08a63b7bc15b5efd071a09c8f434e232cca64274a9d7948430e5803b4e', modelSha='1ba01029d4113cc832aa5ab551c7bf060b5f7a4eb1afde35607564413bfee2ec', layout=[1,308,179,336,608,101], size=[1349,784], factor=4),
 's_wrath': dict(source='ekijfxekijfxekij', sourceSha='4ab505e3289ca7d0d804fc15178825f28cbee7481a26e04a1208082729e67bdc', modelSha='4c0653e3adba99be4d581c92a928fd6e8c27b0a2159a97f7ec5e885478249b8d', layout=[1,308,186,296,564,108], size=[1325,800], factor=4),
 'mummy': dict(source='jc5i6kjc5i6kjc5i', sourceSha='3bc0906638ddc4c6e9d22f894bb74337709fc760ddb2f817d5f6bc64e11cc640', modelSha='3926d2dcf2451deaf32e67877016884cfb91a313968beefe514b9274fc30a1d1', layout=[1,168,194,177,347,192], size=[960,1109], factor=4),
}
def sha(data):
 return hashlib.sha256(data).hexdigest()

def piece_placements(source, foreground, placements, width, height, component_count):
 """Use measured piece registration without sharing donors between source islands.

 This follows the Enforcer importer's connected-piece crop/resize approach.
 Each native component has exactly one owner. Disconnected UV slivers may share
 a source piece through an explicit group; the existing 24-pixel reach below
 still rejects uncovered surfaces. Recipes without placements keep their path.
 """
 if not isinstance(placements,list) or not placements:raise ValueError('Empty piece placements')
 source_labels,_=ndimage.label(foreground);owners={};used_sources=set()
 def box(value,limit=None):
  if not isinstance(value,list) or len(value)!=4 or any(type(v) is not int for v in value):raise ValueError('Invalid piece box')
  l,t,r,b=value
  if r<=l or b<=t or (limit and not (0<=l<r<=limit[0] and 0<=t<b<=limit[1])):raise ValueError('Piece box outside source')
  return l,t,r,b
 for placement in placements:
  sl,st,sr,sb=box(placement['sourceBox'],source.size)
  l,t,r,b=box(placement['atlasBox'])
  if not (-width<=l<r<=2*width and -height<=t<b<=2*height):raise ValueError('Unbounded piece placement')
  seed=placement['sourceSeed'];ids=placement['nativeComponents']
  if not isinstance(seed,list) or len(seed)!=2 or any(type(v) is not int for v in seed) or not (sl<=seed[0]<sr and st<=seed[1]<sb):raise ValueError('Invalid source-piece seed')
  source_id=int(source_labels[seed[1],seed[0]])
  if source_id==0 or source_id in used_sources:raise ValueError('Background or duplicated source-piece owner')
  used_sources.add(source_id)
  if not isinstance(ids,list) or not ids or any(type(i) is not int or not 1<=i<=component_count or i in owners for i in ids) or len(set(ids))!=len(ids):raise ValueError('Duplicate or invalid native-piece owner')
  cl,ct,cr,cb=max(0,l),max(0,t),min(width,r),min(height,b)
  if cr<=cl or cb<=ct:raise ValueError('Piece misses native atlas')
  size=(r-l,b-t)
  isolated=source_labels[st:sb,sl:sr]==source_id
  mask=np.asarray(Image.fromarray((isolated*255).astype(np.uint8)).resize(size,Image.Resampling.NEAREST))>0
  colour=np.asarray(source.crop((sl,st,sr,sb)).resize(size,Image.Resampling.LANCZOS))
  pixels=np.zeros((height,width,3),np.uint8);valid=np.zeros((height,width),bool)
  pixels[ct:cb,cl:cr]=colour[ct-t:cb-t,cl-l:cr-l]
  valid[ct:cb,cl:cr]=mask[ct-t:cb-t,cl-l:cr-l]
  for i in ids:owners[i]=(pixels,valid)
 if set(owners)!=set(range(1,component_count+1)):raise ValueError('Unassigned native UV component')
 return owners

def flatten_height(path, data, factor, vertex_range):
 """Keep non-solid flash surfaces flat and above all virtual height blockers.

 Uses actual native triangles, plus six pixels for the five-texel normal kernel and
 bilinear sampling (seven on enlarged maps, below). Refuse padding that reaches another
 real UV surface.
 """
 surface=uv_footprint(data,factor,vertex_range)
 if not surface.any():raise ValueError('Empty flat-height UV region')
 # At enlarged factors the polygon rasterizer and per-texel-centre sampling can differ by a
 # pixel at triangle edges (seen at the 4x standard), so pad one pixel more there; the
 # native (factor 1) map keeps its six.
 radius=6+(factor>1)
 padded=ndimage.binary_dilation(surface,structure=np.ones((2*radius+1,2*radius+1),bool))
 overlap=padded & uv_footprint(data,factor) & ~surface
 if overlap.any():raise ValueError('Flat-height padding reaches another UV surface')
 height=np.asarray(Image.open(path).convert('L')).copy()
 if height.shape!=surface.shape:raise ValueError('Flat-height dimensions differ')
 height[padded]=255
 Image.fromarray(height).save(path,'WEBP',lossless=True,method=6)
 report=dict(vertexRange=vertex_range,value=255,padding=radius,surfacePixels=int(surface.sum()),paddedPixels=int(padded.sum()))
 # Preserve this exact authored semantic region after lossy runtime encoding.
 # Only the known Armagon flash vertices may opt into the narrow runtime policy.
 if sha(data)=='e827535032c8e83609fedf07c9989c504e7eaa6772ce0d5cf73788e00980f151' and vertex_range==[192,204]:
  spans=[]
  for y,row in enumerate(padded):
   edges=np.flatnonzero(np.diff(np.r_[False,row,False].astype(np.int8)))
   spans.extend([int(y),int(a),int(b)] for a,b in zip(edges[::2],edges[1::2]))
  report['runtime']=dict(policy='armagon-flash-v1',modelSha256=sha(data),width=int(padded.shape[1]),height=int(padded.shape[0]),spans=spans)
 return report

def native_single_skin(data, skin):
 """Read an explicitly selected single skin; never silently use animation frame0."""
 count,w,h=struct.unpack_from('<3i',data,48)
 if not isinstance(skin,int) or not 0<=skin<count:raise ValueError('Invalid native skin index')
 pos=84
 for index in range(count):
  grouped=struct.unpack_from('<i',data,pos)[0];pos+=4
  if grouped:raise ValueError('Charge fitting requires explicit single native skins')
  pixels=np.frombuffer(data[pos:pos+w*h],np.uint8).reshape(h,w);pos+=w*h
  if index==skin:return pixels

def preserve_charge_anatomy(canvas,data,spec,output,key):
 """Use generated charge pigment only inside the original state's local change envelope.

 All unchanged anatomy and detached islands come from the approved generated base.
 Native palette indices define a mask only; none supply runtime pigment.
 """
 overlay=spec['chargeOverlay'];base_name=overlay['base']
 if not base_name.replace('_','').isalnum():raise ValueError('Invalid base variant')
 base=output/key/base_name;report=json.loads((base/'SOURCE.json').read_text())
 if report['nativeModelSha256']!=spec['modelSha'] or report['sourceSha256']!=overlay['baseSourceSha256']:raise ValueError('Charge base identity differs')
 for name in ['diffuse.png','height.webp']:
  if sha((base/name).read_bytes())!=report['files'][name]:raise ValueError('Charge base artifact changed: '+name)
 original=np.asarray(Image.open(base/'diffuse.png').convert('RGB'))
 if original.shape!=canvas.shape:raise ValueError('Charge/base dimensions differ')
 if overlay['nativeMaskDilation']!=1 or overlay['maskShape']!='square' or overlay['featherPixels']!=1:raise ValueError('Unsupported charge mask policy')
 delta=native_single_skin(data,spec['skin'])!=native_single_skin(data,0)
 mask=ndimage.binary_dilation(delta,structure=np.ones((3,3),bool))
 mask=np.repeat(np.repeat(mask,spec['factor'],0),spec['factor'],1)
 # Feather only inward. The outside of the bounded mask remains byte-identical.
 alpha=np.clip(ndimage.distance_transform_edt(mask)/2,0,1)[:,:,None]
 result=np.rint(original*(1-alpha)+canvas*alpha).astype(np.uint8)
 return result,base/'height.webp',dict(base=key+'/'+base_name,nativeChangedPixels=int(delta.sum()),allowedPixels=int(mask.sum()),changedPixels=int(np.any(result!=original,axis=2).sum()),nativeMaskDilation=1,maskShape='square',featherPixels=1,baseDiffuseSha256=sha((base/'diffuse.png').read_bytes()),sharedHeightSha256=sha((base/'height.webp').read_bytes()))

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
 elif spec.get('matte')=='brown': foreground=np.max(np.abs(rgb-np.asarray(spec['background'])),axis=2)>spec.get('matteTolerance',18)
 elif key=='dragon': foreground=(rgb.max(2)-rgb.min(2)>12)&(rgb.max(2)>25)
 elif key=='mummy': foreground=rgb.max(2)>25
 else: foreground=rgb.max(2)>15
 # Close narrow dark channels before filling the silhouette. Otherwise a dark
 # rib seam connected to the backdrop would be misclassified as missing art.
 foreground=ndimage.binary_fill_holes(ndimage.binary_closing(foreground,iterations=8 if key=='mummy' else 4))
 footprint=uv_footprint(data,factor)
 labels,count=ndimage.label(footprint)
 placements=spec.get('piecePlacements')
 if placements and any(spec.get(k) for k in ('atlasBox','strictMatteDonors','nativeBlackRegions')):raise ValueError('Piece placements cannot combine with global registration or matte overrides')
 owners=piece_placements(source,foreground,placements,W,H,count) if placements is not None else None
 # Normally the full atlas maps directly. A measured registration may correct
 # imagegen's content scale/offset without moving the model's original UVs.
 box=spec.get('atlasBox',[0,0,W,H]);left,top,right,bottom=box
 if len(box)!=4 or any(not isinstance(v,int) for v in box) or right<=left or bottom<=top:raise ValueError('Invalid registered atlas box')
 size=(right-left,bottom-top)
 scaled=np.asarray(source.resize(size,Image.Resampling.LANCZOS))
 scaled_mask=np.asarray(Image.fromarray((foreground*255).astype(np.uint8)).resize(size,Image.Resampling.NEAREST))>0
 pixels=np.zeros((H,W,3),np.uint8);valid=np.zeros((H,W),bool)
 cl,ct,cr,cb=max(0,left),max(0,top),min(W,right),min(H,bottom)
 if cr<=cl or cb<=ct:raise ValueError('Registered atlas misses the destination')
 pixels[ct:cb,cl:cr]=scaled[ct-top:cb-top,cl-left:cr-left]
 valid[ct:cb,cl:cr]=scaled_mask[ct-top:cb-top,cl-left:cr-left]
 rejected_matte=0
 if spec.get('strictMatteDonors'):
  if spec.get('matte')!='blue-grey':raise ValueError('Strict donor policy is only defined for neutral stone on blue-grey')
  # Closing/filling determines the silhouette, but must not turn blue backdrop
  # trapped under an arm into source pigment for a neutral stone skin.
  colour=pixels.astype(np.int16)
  donor_colour=((colour[:,:,2]-colour[:,:,0])<6)&((colour[:,:,2]-colour[:,:,1])<8)
  rejected_matte=int((valid & ~donor_colour).sum());valid &= donor_colour
 accepted_black=np.zeros((H,W),bool)
 if spec.get('nativeBlackRegions'):
  # Certain real native surfaces are intentionally black, not absent pigment.
  # Admit generated near-black only in reviewed bounded native-black regions.
  allowed=np.zeros((h,w),bool)
  for region in spec['nativeBlackRegions']:
   if len(region)!=4 or any(not isinstance(v,int) for v in region):raise ValueError('Invalid native-black region')
   l,t,r,b=region
   if not 0<=l<r<=w or not 0<=t<b<=h:raise ValueError('Native-black region outside atlas')
   allowed[t:b,l:r]=True
  allowed &= native_single_skin(data,spec.get('skin',0))==0
  allowed=np.repeat(np.repeat(allowed,factor,0),factor,1)
  accepted_black=allowed & footprint & (pixels.max(2)<=1) & ~valid
  if not accepted_black.any():raise ValueError('Reviewed native-black region has no generated black pixels')
  valid |= accepted_black
 canvas=np.zeros((H,W,3),np.uint8); covered=np.zeros((H,W),bool); islands=[]
 for index,bounds in enumerate(ndimage.find_objects(labels),1):
  donor_pixels,donor_valid=owners[index] if owners is not None else (pixels,valid)
  top=max(0,bounds[0].start-40);bottom=min(H,bounds[0].stop+40)
  left=max(0,bounds[1].start-40);right=min(W,bounds[1].stop+40)
  area=np.s_[top:bottom,left:right];surface=labels[area]==index;local_footprint=footprint[area]
  # A donor must be near this component and may never belong to another UV
  # component. Four-pixel gutters retain proper mip/filtering edge colours.
  neighbourhood=ndimage.binary_dilation(surface,iterations=12)
  seeds=donor_valid[area] & neighbourhood & (~local_footprint|surface)
  if not seeds.any(): raise ValueError('No supplied colour for UV component '+str(index))
  extended,reached=spread(donor_pixels[area],seeds,24)
  if np.any(surface & ~reached): raise ValueError('Uncovered UV component '+str(index))
  region=ndimage.binary_dilation(surface,iterations=4)&reached&(~local_footprint|surface)
  canvas[area][region]=extended[region];covered[area]|=region
  islands.append(dict(id=index,surfacePixels=int(surface.sum()),directPixels=int((surface&seeds).sum()),edgePixels=int((surface&~seeds).sum())))
 if np.any(footprint&~covered): raise ValueError('Uncovered native surface')
 variant=spec.get('outputVariant','custom');skin=spec.get('skin',0)
 if not variant.replace('_','').isalnum() or not isinstance(skin,int) or not 0<=skin<spec['layout'][0]:raise ValueError('Invalid output variant/skin')
 charge=None;shared_height=None
 if spec.get('chargeOverlay'):canvas,shared_height,charge=preserve_charge_anatomy(canvas,data,spec,output,key)
 out=output/key/variant;out.mkdir(parents=True,exist_ok=True)
 result=Image.fromarray(canvas);result.save(out/'diffuse.png')
 if shared_height:shutil.copyfile(shared_height,out/'height.webp')
 else:height_for(result,out/'height.webp',key+'/'+variant)
 flat=flatten_height(out/'height.webp',data,factor,spec['flatHeightVertices']) if spec.get('flatHeightVertices') else None
 report=dict(schema=1,model='progs/'+key+'.mdl',nativeModelSha256=spec['modelSha'],source=name,sourceSha256=spec['sourceSha'],sourceDimensions=spec['size'],
  dimensions=[W,H],factor=factor,skin=skin,poses=spec['layout'][5],vertices=spec['layout'][3],triangles=spec['layout'][4],
  transform='complete atlas, top-row-first, no flip; original UVs preserved',
  atlasBox=box,registration=spec.get('registration'),
  mattePolicy=spec.get('matte') or {'dragon':'neutral grey and black divider','s_wrath':'black','mummy':'dark brown gradient'}[key],
  nativeTexturePixelsUsed=0,islands=islands,surfacePixels=int(footprint.sum()),edgePixels=sum(i['edgePixels'] for i in islands),
  normalProfile=dict(strength=.65,cap=.55),reuse=['fit_vore.member','uv_footprint','fit_skin.spread','height_for'],
  files={f:sha((out/f).read_bytes()) for f in ['diffuse.png','height.webp']})
 if spec.get('generation'):report['generation']=spec['generation']
 if owners is not None:
  report['piecePlacements']=placements
  report['transform']='measured source-component crop/resize per native UV component group; original UVs preserved'
 if spec.get('strictMatteDonors'):report['strictMatteDonors']=dict(policy='neutral stone donor pixels exclude blue-grey after resampling',rejectedPixels=rejected_matte)
 if flat:report['flatHeight']=flat
 if charge:report['chargeOverlay']=charge
 if spec.get('nativeBlackRegions'):report['generatedBlackSurface']=dict(nativeRegions=spec['nativeBlackRegions'],nativePaletteIndex=0,maximumGeneratedChannel=1,acceptedPixels=int(accepted_black.sum()),nativePigmentCopied=False)
 (out/'SOURCE.json').write_text(json.dumps(report,indent=2)+'\n');print(key,json.dumps({k:report[k] for k in ['dimensions','surfacePixels','edgePixels']}))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--model',choices=list(RECIPES),action='append')
 parser.add_argument('--pack',type=Path,default=ROOT/'resources/rogue/pak0.pak')
 parser.add_argument('--source-root',type=Path,default=ROOT)
 parser.add_argument('--output',type=Path,default=resource_path(ROOT, 'newer/enemies'))
 args=parser.parse_args()
 for key in args.model or RECIPES:fit_one(key,args.pack,args.source_root,args.output)
