"""Read-only decoded semantic samples; classifications supplied by art reviewer."""
import hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[3]
DOCS=ROOT/'docs/hexen2/textures'
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-006'
sha=lambda b:hashlib.sha256(b).hexdigest()
def witness(p):
 b=p.read_bytes()
 return {'file':str(p.relative_to(ROOT)),'sha256':sha(b),'bytes':len(b)}
OUT=DOCS/'batch-006-public-final-mortar-v1.json'
assert not OUT.exists(),'Retain prior evidence'
mp=BASE/'masters-layered/rtex001/master.json';tp=BASE/'tiers-layered/rtex001/manifest.json'
ap=DOCS/'batch-006-public-final-actual-v1.json'
assert sha(mp.read_bytes())=='886374224c85a1ef7aea89323777f6801b65965946dfd6f02a6a21503e54975f'
assert sha(tp.read_bytes())=='29564d0ff4b75ff47bce2f69c1007616426a50aaae81a231831405fa8eebbc28'
assert sha(ap.read_bytes())=='2b77f5b27156a81e212fc301282022955c2a12caed2e73c2fb02691347680c12'
m=json.loads(mp.read_text());t=json.loads(tp.read_text());actual=json.loads(ap.read_text())
assert actual['verdict'].startswith('PASS')
row=next(i for i in actual['materials']if i['name']=='rtex001')
assert row['masterPackage']['sha256']==sha(mp.read_bytes())
cp=mp.parent/m['color']['file'];hp=mp.parent/m['height']['file']
assert sha(cp.read_bytes())==m['color']['sha256'];assert sha(hp.read_bytes())==m['height']['sha256']
annotation=DOCS/'batch-006-final-mortar-witnesses.png'
inputs=[Path(__file__),mp,tp,ap,cp,hp,annotation]
inputs += [Path(i['file']) for i in m['inputs'].values()]
inputs += [tp.parent/i['file']for tier in t['tiers'].values()for i in tier['outputs'].values()]
before={p:sha(p.read_bytes())for p in inputs}
# Native128 coordinate classification is explicit external art evidence.
pairs=[('Lupper',(42,51),(42,54)),('Lmid',(42,59),(42,63)),('Llow',(40,68),(40,72)),
       ('Rupper',(85,45),(85,50)),('Rmid',(84,56),(84,63))]
L=m['layeredRelief']['recipe']['layering']; w,h=m['masterDimensions'];rw,rh=L['referenceSize']
mask_image=Image.new('L',(w,h));draw=ImageDraw.Draw(mask_image)
for region in L['brickRegions']:
 for dy in (-h,0,h):
  for dx in (-w,0,w):draw.polygon([(x*w/rw+dx,y*h/rh+dy)for x,y in region['polygon']],fill=255)
mask=np.asarray(mask_image)>127
master_height=np.load(hp,allow_pickle=False)
report={'schemaVersion':1,'scope':'Reviewer-classified five substrate face/joint witnesses and decoded facing/substrate bands for final rtex001 only',
 'classification':{'reviewer':'/root/hexen_campaign_review','source':'Direct team message confirming actual1024 canonical RGB and labelled annotation',
 'statement':'All five proposed face→mortar pairs are exposed substrate brick faces and adjacent dark internal mortar gaps. Native128 coordinates ×8 on sole master. They exclude facing/interface bevel.',
 'annotation':witness(annotation)},
 'nativeIdentity':m['layeredRelief']['nativeIdentity'],'master':witness(mp),'canonicalRGB':witness(cp),
 'floatHeight':witness(hp),'tierReceipt':witness(tp),'actualDerivationProof':witness(ap),
 'coordinateConvention':'Origin upper-left, x right/y down, coordinate units native128. Output sample pixel=(nativeX*factor,nativeY*factor), matching annotation point at master×8. No resampling or extra half-pixel offset.',
 'measurement':'Pillow decode WebP RGB; scalar=red channel/255, same scalar convention as verified tier oracle. Report central pixel and unweighted3x3 mean/min/max at integer sample pixel. Patch radius1 output pixel for both tiers; footprints differ in native units and are recorded. No image resizing/filtering during measurement.',
 'tiers':[], 'limits':[
 'Five explicitly classified pairs support only these local mortar-versus-face witnesses; no all-pixel semantic mortar guarantee.',
 'Full decoded bands are measured against the reviewed recipe mask, whose semantic completeness/alignment remains part of separate final art review.',
 'Both endpoint values/patches remain within substrate; no facing bevel or brighter-pixel heuristic selects these sample classes.',
 'Normals have already passed independent direct-scalar derivation and decoded angular checks in the bound actual proof. Normal vectors alone do not establish mortar height ordering.',
 'No asset edits, encoder changes, runtime/GPU/game, owner or release acceptance.']}
for tier,factor in [('Mid',4),('High',8)]:
 record=t['tiers'][tier]['outputs']['height'];p=tp.parent/record['file'];assert sha(p.read_bytes())==record['sha256']
 H=np.asarray(Image.open(p).convert('RGB'),dtype=float)[:,:,0]/255
 scale=w//H.shape[1];blocks=mask.reshape(H.shape[0],scale,H.shape[1],scale)
 pure_substrate=blocks.all((1,3));pure_facing=~blocks.any((1,3))
 assert pure_substrate.any()and pure_facing.any()
 counts={'substrate':int(pure_substrate.sum()),'facing':int(pure_facing.sum()),'mixed':int(H.size-pure_substrate.sum()-pure_facing.sum())}
 band={'substrate':[float(H[pure_substrate].min()),float(H[pure_substrate].max())],
       'facing':[float(H[pure_facing].min()),float(H[pure_facing].max())]}
 gap=band['facing'][0]-band['substrate'][1]
 assert gap>0,('Decoded facing/substrate hierarchy failed',tier,band)
 samples=[]
 for label,face,joint in pairs:
  endpoints=[]
  for role,(x,y)in [('brickFace',face),('mortarJoint',joint)]:
   ix,iy=x*factor,y*factor;roi=[ix-1,iy-1,ix+2,iy+2];patch=H[iy-1:iy+2,ix-1:ix+2]
   assert patch.shape==(3,3)and pure_substrate[iy-1:iy+2,ix-1:ix+2].all(),(tier,label,'Sample touches interface')
   endpoints.append({'role':role,'nativeXY':[x,y],'outputPixel':[ix,iy],'halfOpenROI':roi,
    'pixelHeight':float(H[iy,ix]),'meanHeight':float(patch.mean()),'minimumHeight':float(patch.min()),'maximumHeight':float(patch.max())})
  delta_pixel=endpoints[0]['pixelHeight']-endpoints[1]['pixelHeight']
  delta_mean=endpoints[0]['meanHeight']-endpoints[1]['meanHeight']
  assert delta_pixel>0 and delta_mean>0,(tier,label,'Classified mortar not below face')
  samples.append({'label':label,'endpoints':endpoints,'faceMinusMortarPixel':delta_pixel,'faceMinusMortarPatchMean':delta_mean,'ordered':True})
 report['tiers'].append({'tier':tier,'factor':factor,'dimensions':list(H.shape[::-1]),'decodedHeightMap':witness(p),
  'allFiveMaps':[witness(tp.parent/i['file'])for i in t['tiers'][tier]['outputs'].values()],
  'patchFootprintNativeWidthAndHeight':3/factor,'samples':samples,
  'maskClassification':'Mid block2x2/master and High block1x1/master. Only blocks entirely substrate or entirely facing counted; mixed transition blocks excluded.',
  'classifiedCounts':counts,'decodedBands':band,'minimumFacingMinusMaximumSubstrate':gap,'facingAboveSubstrate':True})
assert all(sha(p.read_bytes())==v for p,v in before.items()),'Source/map changed during samples'
report['inputsStable']=True;report['inputs']=[witness(p)for p in inputs]
report['verdict']='PASS five reviewer-classified decoded face/mortar pairs and measured facing/substrate hierarchy in both tiers; final art acceptance separate'
with OUT.open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'receipt':str(OUT.relative_to(ROOT)),'sha256':sha(OUT.read_bytes()),'verdict':report['verdict']}))
