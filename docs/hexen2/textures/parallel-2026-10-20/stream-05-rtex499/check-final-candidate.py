"""Author self-check and decoded review diagnostics; never authors distributed maps."""
from pathlib import Path
import json,hashlib,datetime,struct
import numpy as np
from PIL import Image,features
import PIL
R=Path(__file__).resolve().parents[5];D=Path(__file__).parent;B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-05-rtex499';E=R/'docs/evidence/hexen2-textures-2026-10-20/stream-05-rtex499/actual-final-tier-views';E.mkdir(exist_ok=False)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();ref=lambda p:{'file':str(p.relative_to(R)),'sha256':sha(p)}
s=json.loads((B/'selection.json').read_text())['items'][0];manifest=json.loads((B/'tiers/rtex499/manifest.json').read_text());orig=Image.open(R/s['original']).convert('RGB');canon=json.loads((D/'canonical-pre-tier-self-check.json').read_text());results={}
for name,f in [('Mid',4),('High',8)]:
 row=manifest['tiers'][name];maps={};records=[]
 for role,o in row['outputs'].items():
  p=B/'tiers/rtex499'/o['file'];im=Image.open(p).convert('RGB');data=p.read_bytes();chunks=[];pos=12
  while pos+8<=len(data):
   typ=data[pos:pos+4].decode('ascii');n=struct.unpack_from('<I',data,pos+4)[0];chunks.append(typ);pos+=8+n+(n%2)
  assert sha(p)==o['sha256'] and list(im.size)==[128*f,128*f] and 'VP8 ' in chunks and 'VP8L' not in chunks
  assert o['quality']==92 and o['method']==6 and o['lossless'] is False
  maps[role]=im;records.append({**ref(p),'role':role,'dimensions':list(im.size),'codecChunks':chunks})
 color=np.asarray(maps['diffuse'],float);h=np.asarray(maps['height'],float)[:,:,0]/255;n=np.stack([np.asarray(maps['normal'+c],float)[:,:,0] for c in 'XYZ'],2)/127.5-1;n/=np.maximum(np.linalg.norm(n,axis=2,keepdims=True),1e-12)
 for tag,L in [('A',np.array([.6,.3,.75])),('B',np.array([-.6,-.3,.75]))]:
  L=L/np.linalg.norm(L);amp=.35+.65*np.clip((n*L).sum(2),0,1);Image.fromarray(np.uint8(np.clip(color*amp[:,:,None],0,255))).save(E/(name.lower()+'-actual-opposed-'+tag+'-1to1.png'))
 tiled=Image.fromarray(np.tile(np.asarray(maps['diffuse']),(2,2,1)));tiled.save(E/(name.lower()+'-actual-repeat2x2.png'));edge=128*f;half=128;tiled.crop((edge-half,edge-half,edge+half,edge+half)).save(E/(name.lower()+'-actual-fourway-corner-1to1.png'))
 distance=[]
 for div in (2,4):
  size=(128//div,128//div);a=np.asarray(orig.resize(size,Image.Resampling.BOX),float);b=np.asarray(maps['diffuse'].resize(size,Image.Resampling.BOX),float);distance.append({'divisor':div,'dimensions':list(size),'filterBoth':'BOX','meanAbsoluteError':float(np.abs(a-b).mean()),'maximum':float(np.abs(a-b).max())})
 witnesses=[]
 for q in canon['witnesses']:
  x,y=q['nativeFrame'];xx=round(x*f);yy=round(y*f);rad=1 if f==4 else 3;patch=h[np.ix_(np.arange(yy-rad,yy+rad+1)%(128*f),np.arange(xx-rad,xx+rad+1)%(128*f))];witnesses.append({'label':q['label'],'nativeFrame':[x,y],'decodedTierPixel':[xx,yy],'physicalClass':q['proposedClass'],'radius':rad,'centralHeight':float(h[yy,xx]),'patchMean':float(patch.mean())})
 mortar=[q['patchMean'] for q in witnesses if q['physicalClass']=='mortar'];stone=[q['patchMean'] for q in witnesses if q['physicalClass']=='stone'];assert max(mortar)<min(stone)
 results[name]={'maps':records,'distanceChecks':distance,'physicalWitnesses':witnesses,'allReviewedMortarMeansBelowAllReviewedStoneMeans':True}
assert s['generationCount']==1
for k in ('original','prompt','generated'):assert sha(R/s[k])==s[k+'Sha256']
report={'schemaVersion':1,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Author self-check only; independent source/math/preview/art qualification and root registration pending','verdict':'Candidate mechanical self-check PASS; actual visual self-review recorded separately','nativeID':s['id'],'source':{k:s[k] for k in ('original','originalSha256','prompt','promptSha256','generated','generatedSha256','generationCount','generatedDimensions')},'descriptor':ref(B/'batch.json'),'canonicalMaster':ref(B/'masters/rtex499-layered/master.json'),'tierReceipt':ref(B/'tiers/rtex499/manifest.json'),'canonicalPreTierRootReview':ref(D/'root-canonical-pre-tier-review.json'),'reviewArtifacts':[ref(p) for p in sorted((B/'review').iterdir())],'actualTierDiagnostics':[ref(p) for p in sorted(E.iterdir())],'tiers':results,'code':ref(Path(__file__)),'environment':{'pillow':PIL.__version__,'numpy':np.__version__,'libwebp':features.version('webp')},'honestLimits':['Restrained fine relief; tiny pits mainly visible in RGB.','Latent C contact is a bounded reviewed authoring hypothesis, not measured hidden geometry.','No runtime/owner acceptance, shared catalog mutation, Git/build/landing/push/release performed by this stream.']};(D/'candidate-self-check.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'descriptor':report['descriptor'],'canonicalMaster':report['canonicalMaster'],'tierReceipt':report['tierReceipt'],'distance':{k:v['distanceChecks'] for k,v in results.items()},'allReviewedWitnessHierarchy':True},indent=2))
