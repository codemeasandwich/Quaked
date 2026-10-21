"""Independent inspection diagnostics only; no authoring assets are written."""
from pathlib import Path
import hashlib,json,datetime
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[6];OUT=Path(__file__).resolve().parent;DOC=OUT.parent
ASSET=ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-003/wgrnd1_8'
checks=[]
def load(p,mode='RGB'):return Image.open(p).convert(mode)
def check(label,a,b):
 a=np.asarray(a);b=np.asarray(b);checks.append({'check':label,'exactPixels':bool(a.shape==b.shape and np.array_equal(a,b))})
native=load(ASSET/'originals/native-wgrnd1_8.png')
check('selected used alias native pixels identical',native,load(ASSET.parent/'ground1_8/originals/native-ground1_8.png'))
for n in (32,16):check(f'native BOX{n}',native.resize((n,n),Image.Resampling.BOX),load(DOC/f'decoded-review/native-box-{n}.png'))
witnesses=[]
recorded=json.loads((DOC/'decoded-review/decoded-fixed-physical-witnesses.json').read_text())
for tag in ('mid','high'):
 rgb=load(ASSET/f'tiers/{tag}-diffuse.webp');a=np.asarray(rgb)
 check(f'{tag} decoded RGB',rgb,load(DOC/f'decoded-review/{tag}-diffuse.png'))
 for n in (32,16):check(f'{tag} BOX{n}',rgb.resize((n,n),Image.Resampling.BOX),load(DOC/f'decoded-review/{tag}-box-{n}.png'))
 check(f'{tag} literal repeat',np.tile(a,(2,2,1)),load(DOC/f'decoded-review/{tag}-repeat2x2.png'))
 check(f'{tag} literal corners',np.roll(a,(rgb.height//2,rgb.width//2),(0,1)),load(DOC/f'decoded-review/{tag}-four-corners.png'))
 # Infer strip width only from its saved dimensions, then verify literal endpoint pixels.
 xp=load(DOC/f'decoded-review/{tag}-x-join.png');yp=load(DOC/f'decoded-review/{tag}-y-join.png');w=xp.width//2;h=yp.height//2
 check(f'{tag} literal X strip',np.concatenate([a[:,-w:],a[:,:w]],axis=1),xp)
 check(f'{tag} literal Y strip',np.concatenate([a[-h:],a[:h]],axis=0),yp)
 ht=load(ASSET/f'tiers/{tag}-height.webp','L');check(f'{tag} decoded height',ht,load(DOC/f'decoded-review/{tag}-height.png','L'))
 xyz=np.stack([np.asarray(load(ASSET/f'tiers/{tag}-normal{ax}.webp','L'))for ax in 'XYZ'],axis=2)
 check(f'{tag} direct assembled XYZ',xyz,load(DOC/f'decoded-review/{tag}-xyz.png'))
 vector=xyz.astype(float)/127.5-1;vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-12)
 light=np.array([.6,.4,.7]);light/=np.linalg.norm(light);frames=[]
 for d in [light,light*np.array([-1,-1,1])]:
  lum=np.round(180*(.25+.75*np.maximum(vector@d,0))).astype(np.uint8);frames.append(np.repeat(lum[:,:,None],3,2))
 frames.append(np.full_like(frames[0],round(180*(.25+.75*light[2]))))
 Image.fromarray(np.concatenate(frames,axis=1)).save(OUT/f'{tag}-independent-opposed-flat.png')
 he=np.asarray(ht,dtype=float)/255;rec=next(x for x in recorded if x['tier']==tag)
 current=[]
 for row in rec['witnesses']:
  r=row['sampleRadiusTierPixels'];x,y=row['faceXY'];fx=float(he[y-r:y+r+1,x-r:x+r+1].mean());x,y=row['gapXY'];gx=float(he[y-r:y+r+1,x-r:x+r+1].mean())
  current.append({'witness':row['witness'],'faceXY':row['faceXY'],'gapXY':row['gapXY'],'radius':r,'faceMean':fx,'gapMean':gx,'faceMinusGap':fx-gx,'orderedFaceAboveGap':bool(fx>gx),'exactRecordedValues':bool(fx==row['faceXYNeighborhoodMean'] and gx==row['gapXYNeighborhoodMean'])})
 witnesses.append({'tier':tag,'unchangedWitnesses':current})
 if tag=='high':
  rgb.crop((200,400,300,470)).resize((400,280),Image.Resampling.NEAREST).save(OUT/'high-fixed-third-RGB-context-nearest4.png')
raw=load(ASSET/'generated/wgrnd1_8-shared-source-v1.png');raw.crop((450,250,962,762)).save(OUT/'raw-mineral-moss-detail-1to1.png')
paths=[ASSET/'originals/native-wgrnd1_8.png',ASSET.parent/'ground1_8/originals/native-ground1_8.png',ASSET/'generated/wgrnd1_8-shared-source-v1.png',ASSET/'selection.json',ASSET/'prompts/wgrnd1_8-shared-source-v1.txt',ASSET/'master/color.png',ASSET/'master/height.npy',ASSET/'master/master.json',ASSET/'tiers/manifest.json',*sorted((ASSET/'tiers').glob('*.webp')),DOC/'candidate-batch.json',DOC/'selected-alias-proof.json',DOC/'root-public-tier-proof.json',DOC/'master-review/root-physical-interpretation.json',DOC/'master-review/pre-tier-physical-review.json',DOC/'master-review/physical-witness-samples-initial.json',DOC/'master-review/physical-witness-crops-initial.png',DOC/'master-review/physical-witness3-diagnostic.png',*sorted((DOC/'decoded-review').glob('*.png')),*sorted(OUT.glob('*.png'))]
records=[]
for p in paths:
 row={'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
 if p.suffix in ('.png','.webp'):
  im=Image.open(p);row.update(dimensions=list(im.size),mode=im.mode)
 records.append(row)
report={'recordType':'Independent offline ART inspection provenance only; not all-native/source/math/codec replay','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewer':'/root/quake_ground17_offline_art','allInspectionPixelsExact':all(x['exactPixels'] for x in checks),'checks':checks,'fixedWitnessReplay':witnesses,'allWitnessMeansExactlyReproduced':all(x['exactRecordedValues']for row in witnesses for x in row['unchangedWitnesses']),'inputsAndImages':records,'method':'Actual WebP decoded with Pillow; identical BOX32/16 on original and enhanced; literal repeats/half-roll corner and endpoint strips checked; XYZ assembled from actual Lchannels. Independent neutral lamps normalized(.6,.4,.7) and(-.6,-.4,.7), normalized decodedvectors, round(180*(.25+.75*max(dot,0))), flat normal control. Third fixed HighRGBcontext is exact crop(200,400,300,470) nearest4; no label or scalar-led witness movement.'}
(OUT/'inspection-provenance.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'allInspectionPixelsExact':report['allInspectionPixelsExact'],'passed':sum(x['exactPixels'] for x in checks),'total':len(checks),'allWitnessMeansExactlyReproduced':report['allWitnessMeansExactlyReproduced'],'thirdHigh':witnesses[1]['unchangedWitnesses'][2]},indent=2))
