"""Offline inspection only; writes inside the independent review folder."""
from pathlib import Path
import hashlib,json,datetime,math
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[6];OUT=Path(__file__).resolve().parent;DOC=OUT.parent
ASSET=ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-002/woodflr1_6'
checks=[]
def load(p,mode='RGB'):return Image.open(p).convert(mode)
def check(label,a,b):
 a=np.asarray(a);b=np.asarray(b);checks.append({'check':label,'exactPixels':bool(a.shape==b.shape and np.array_equal(a,b))})
original=load(ASSET/'source-v1/native.png');board=load(DOC/'decoded-layered-v1/native-mid-high-box-both.png')
images=[('native',original)]
contacts={}
regions=json.loads((DOC/'master-layered-v1-diagnostics/classification-before-depth.json').read_text())['regions']
for tag in ('mid','high'):
 rgb=load(ASSET/f'tiers-layered-v1/{tag}-diffuse.webp');a=np.asarray(rgb);images.append((tag,rgb))
 check(f'{tag} decoded diffuse',rgb,load(DOC/f'decoded-layered-v1/{tag}-diffuse.png'))
 check(f'{tag} literal repeat',np.tile(a,(2,2,1)),load(DOC/f'decoded-layered-v1/{tag}-repeat2x2.png'))
 check(f'{tag} literal corners',np.roll(a,(rgb.height//2,rgb.width//2),(0,1)),load(DOC/f'decoded-layered-v1/{tag}-rolled-corner.png'))
 width=rgb.width//8
 check(f'{tag} literal X strip',np.concatenate([a[:,-width:],a[:,:width]],axis=1),load(DOC/f'decoded-layered-v1/{tag}-X-join.png'))
 check(f'{tag} literal Y strip',np.concatenate([a[-width:],a[:width]],axis=0),load(DOC/f'decoded-layered-v1/{tag}-Y-join.png'))
 height=load(ASSET/f'tiers-layered-v1/{tag}-height.webp','L')
 check(f'{tag} decoded height',height,load(DOC/f'decoded-layered-v1/{tag}-height.png','L'))
 xyz=np.stack([np.asarray(load(ASSET/f'tiers-layered-v1/{tag}-normal{k}.webp','L')) for k in 'XYZ'],axis=2)
 check(f'{tag} direct XYZ channel display',xyz,load(DOC/f'independent-art-review/actual-{tag}-XYZ-channel-bytes.png'))
 n=xyz.astype(float)/127.5-1;n/=np.maximum(np.linalg.norm(n,axis=2,keepdims=True),1e-12)
 light=np.array([.6,.3,.75]);light/=np.linalg.norm(light)
 frames=[]
 for label,d in [('A',light),('B',light*np.array([-1,-1,1]))]:
  brightness=.35+.65*np.clip((n*d).sum(2),0,1)
  grey=np.uint8(np.clip(brightness*255,0,255));check(f'{tag} neutral opposed {label}',np.repeat(grey[:,:,None],3,axis=2),load(DOC/f'decoded-layered-v1/{tag}-grey-light-{label}.png'))
  frames.append(np.repeat(grey[:,:,None],3,axis=2))
 frames.append(np.full_like(frames[0],np.uint8((.35+.65*light[2])*255)))
 Image.fromarray(np.concatenate(frames,axis=1)).save(OUT/f'{tag}-independent-opposed-flat.png')
 h=np.asarray(height,dtype=float)/255
 contacts[tag]=[]
 for r in regions:
  row={'name':r['name'],'originalMasterRectangles':{k:r[k] for k in ['wood','stone','contact']},'actualTierRectangles':{}}
  for role in ['wood','stone','contact']:
   x0,y0,x1,y1=r[role];rect=[math.floor(x0*rgb.width/512),math.floor(y0*rgb.height/512),math.ceil(x1*rgb.width/512),math.ceil(y1*rgb.height/512)];x0,y0,x1,y1=rect
   row['actualTierRectangles'][role]=rect;row[role+'Mean']=float(h[y0:y1,x0:x1].mean())
  row['woodAboveStone']=row['woodMean']>row['stoneMean'];row['strictContactBelowBoth']=row['contactMean']<min(row['woodMean'],row['stoneMean']);contacts[tag].append(row)
for col,(label,im) in enumerate(images):
 for row,n in enumerate([32,16]):
  want=im.resize((n,n),Image.Resampling.BOX).resize((128,128),Image.Resampling.NEAREST)
  check(f'{label} BOX{n} contact pixels',want,board.crop((col*192,row*160+20,col*192+128,row*160+148)))
check('registered RGB unchanged by layered relief',load(ASSET/'master-v1/color.png'),load(ASSET/'master-layered-v1/color.png'))
paths=[ASSET/'source-v1/native.png',*sorted((ASSET/'source-v1/generated').glob('*.png')),ASSET/'source-v1/selection.json',ASSET/'source-v1/prompt.txt',ASSET/'master-v1/color.png',ASSET/'master-v1/height.npy',ASSET/'master-layered-v1/color.png',ASSET/'master-layered-v1/height.npy',ASSET/'master-layered-v1/master.json',ASSET/'tiers-layered-v1/manifest.json',*sorted((ASSET/'tiers-layered-v1').glob('*.webp')),DOC/'candidate-batch.json',DOC/'root-public-tier-proof.json',DOC/'layered-recipe-root-approved.json',DOC/'master-layered-v1-diagnostics/root-interface-review.json',DOC/'decoded-layered-v1/mid-horizontal-contact-right-decomposition.json',DOC/'independent-art-review/fixed-right-contact-support.json',DOC/'independent-art-review/right-contact-filter-context.png',DOC/'independent-art-review/XYZ-assumption-failure.json',DOC/'decoded-diagnostic-v1-failure.json',DOC/'native-nearest8.png',DOC/'source-v1-diagnostics/raw-x-join-1to1.png',*sorted((DOC/'decoded-layered-v1').glob('*.png')),*sorted((DOC/'independent-art-review').glob('actual-*-XYZ-channel-bytes.png')),*sorted(OUT.glob('*.png'))]
records=[]
for p in paths:
 row={'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
 if p.suffix in ('.png','.webp'):
  im=Image.open(p);row.update(dimensions=list(im.size),mode=im.mode)
 records.append(row)
report={'recordType':'Independent offline ART inspection provenance; does not replace source/math/codec verification','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewer':'/root/quake_ground17_offline_art','allChecksExact':all(r['exactPixels'] for r in checks),'checks':checks,'fixedContactsUnchanged':contacts,'inputsAndImages':records,'method':'Current actual WebP decoded; BOX32/16 for both original and enhanced checked inside existing sheet. Literal repeat/corner/strip verified. XYZ assembled from current L channels; normalized then .35+.65*max(dot,0), opposed normalized(.6,.3,.75), display truncates*255 as saved sheet. Original witnesses retain outward floor/ceil mapping; no scalar-driven reclassification.'}
(OUT/'inspection-provenance.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'allChecksExact':report['allChecksExact'],'passed':sum(x['exactPixels'] for x in checks),'total':len(checks),'fixedMidRightContact':contacts['mid'][3]},indent=2))
