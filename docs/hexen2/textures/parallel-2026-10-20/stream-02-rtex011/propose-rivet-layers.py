"""Measured mask and existing layered-policy diagnostic only; not a final master."""
from pathlib import Path
import json,hashlib,math,sys
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-02-rtex011';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-02-rtex011';M=B/'masters-registered/rtex011';sys.path.insert(0,str(R/'tools/texture_sheets'));from prepare_layered_texture_master import compose_layered
from craft_normals import normals_from_height
# Measured registered face boundaries; lower plate includes baked contact shadow.
groups=[{'y':52.,'ry':24.,'heads':[('NW',63.,24.),('N',248.,24.),('NE',442.,27.)]}, {'y':258.,'ry':24.,'heads':[('W',63.,24.),('E',443.,27.)]}, {'y':455.,'ry':24.,'heads':[('SW',63.,24.),('S',248.,24.),('SE',442.,27.)]}]
regions=[];bottom=0;headRows=[]
def add(points):regions.append({'polygon':[[round(x/8,7),round(y/8,7)]for x,y in points]})
for g in groups:
 cy,ry=g['y'],g['ry'];y0,y1=cy-ry,cy+ry
 if y0>bottom:add([[0,bottom],[512,bottom],[512,y0],[0,y0]])
 ys=[cy-ry*math.cos(k*math.pi/16)for k in range(17)]
 arcs=[]
 for label,cx,rx in g['heads']:
  a=[(cx-rx*math.sqrt(max(0,1-((y-cy)/ry)**2)),y)for y in ys];z=[(cx+rx*math.sqrt(max(0,1-((y-cy)/ry)**2)),y)for y in ys];arcs.append((a,z));headRows.append({'name':label,'masterCentre':[cx,cy],'masterRadii':[rx,ry],'nativeCentre':[cx/8,cy/8],'nativeRadii':[rx/8,ry/8]})
 for j in range(len(arcs)+1):
  left=[(0,y0),(0,y1)]if j==0 else arcs[j-1][1]
  right=[(512,y0),(512,y1)]if j==len(arcs)else arcs[j][0]
  add(left+right[::-1])
 bottom=y1
if bottom<512:add([[0,bottom],[512,bottom],[512,512],[0,512]])
layer={'referenceSize':[64,64],'facingHeight':.70,'brickHeight':.30,'chipFloor':.34,'microAmplitude':.012,'bevelPixels':4.,'brickRegions':regions}
color=Image.open(M/'color.png').convert('RGB');detail=np.load(M/'height.npy',allow_pickle=False);h,mask,sigma=compose_layered(detail,layer);_,n=normals_from_height(h,.3,.5)
overlay=color.copy();a=np.asarray(overlay).copy();edge=(mask!=np.roll(mask,1,0))|(mask!=np.roll(mask,1,1));a[edge]=[255,235,20];overlay=Image.fromarray(a)
parts=[('Measured eight head boundaries (yellow); plate outside',overlay),('Proposed existing layered policy height',Image.fromarray(np.uint8(h*255))),('Proposed normal diagnostic',Image.fromarray(np.uint8(np.clip((n*.5+.5)*255,0,255))))]
for sign in(1,-1):
 l=np.array([sign*.6,sign*.3,.75]);l/=np.linalg.norm(l);light=.35+.65*np.clip((n*l).sum(2),0,1);parts.append(('Proposed opposed light '+str(sign),Image.fromarray(np.uint8(np.asarray(color)*light[:,:,None]))))
s=Image.new('RGB',(1560,1100),(25,27,30));dr=ImageDraw.Draw(s)
for i,(label,im)in enumerate(parts):x=(i%3)*520;y=(i//3)*550;dr.text((x+4,y+5),label,fill='white');s.paste(im,(x+4,y+25))
s.save(D/'rivet-layer-proposal.png')
samples={}
for row in headRows:
 x,y=map(int,row['masterCentre']);a=h[y-2:y+3,x-2:x+3];radial=[]
 for t in(0,.25,.5,.75,.9,1.,1.1):
  xx=int(round(x+row['masterRadii'][0]*t));radial.append({'radiusFraction':t,'height':float(h[y,xx])})
 samples[row['name']]={'centreMean':float(a.mean()),'radialRight':radial}
proposal={'schemaVersion':1,'scope':'Measured mask and review-only diagnostic using existing compose_layered; no guarded corrected master or tier encoding yet','sourceMasterPackage':str((M/'master.json').relative_to(R)),'sourceMasterPackageSha256':hashlib.sha256((M/'master.json').read_bytes()).hexdigest(),'heads':headRows,'measurement':'Registered actual512RGB manually classified face rim; contact shadows remain lower plate. Bounds accuracy approximately2masterpixels.','layering':layer,'diagnostics':{'sigmaMasterPixels':sigma,'plateRange':[float(h[mask>.5].min()),float(h[mask>.5].max())],'headRange':[float(h[mask<=.5].min()),float(h[mask<=.5].max())],'headSamples':samples,'perimeterAllPlate':bool(np.all(mask[[0,-1],:]==1)and np.all(mask[:,[0,-1]]==1))},'guard':'Independent source/master-only replay proof and root mask/rounded-shoulder review required before final wrapper. No fake verification pointer.'}
(D/'rivet-layer-proposal.json').write_text(json.dumps(proposal,indent=2)+'\n');print(json.dumps({'polygonCount':len(regions),'sigma':sigma,'plateRange':proposal['diagnostics']['plateRange'],'headRange':proposal['diagnostics']['headRange'],'perimeterAllPlate':proposal['diagnostics']['perimeterAllPlate']}))
