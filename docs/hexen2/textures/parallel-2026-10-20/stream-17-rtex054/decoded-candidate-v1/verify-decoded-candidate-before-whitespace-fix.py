"""Author direct-map/decoded ART evidence and actual review CLI provenance.

No master or production tier command is rerun. The actual authorized production
receipts are bound; all10maps are independently reconstructed in memory. Only the
review-only CLI replays in a cleaned owned temporary directory.
"""
from pathlib import Path
from html.parser import HTMLParser
import datetime,hashlib,io,json,subprocess,sys,tempfile
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[6];DOC=Path(__file__).resolve().parent;STREAM=DOC.parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-17-rtex054';MP=BASE/'masters/rtex054-rounded-v1';TIER=BASE/'tiers/rtex054'
sys.path.insert(0,str(ROOT/'tests'))
from hexen2_texture_tiers_test import q92,periodic_rgb,float_box,cyclic_normals,vp8_only
sha=lambda b:hashlib.sha256(b).hexdigest()
def w(p):return {'file':str(p.relative_to(ROOT)),'sha256':sha(p.read_bytes())}
def save(p,image):
 assert not p.exists();image.save(p,'PNG');return w(p)
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.images=[];self.scripts=[]
 def handle_starttag(self,tag,attrs):
  if tag=='img':self.images.append(dict(attrs))
  if tag=='script':self.scripts.append(dict(attrs))
assert not(DOC/'author-source-map-preview-proof.json').exists()
trial=STREAM/'analytic-cap-actual-trial-v1';freeze=json.loads((trial/'TRIAL_FREEZE.json').read_bytes());watched={ROOT/p:(ROOT/p).read_bytes()for p in freeze['frozenInputs']};assert all(sha(data)==freeze['frozenInputs'][str(p.relative_to(ROOT))]for p,data in watched.items())
for p in BASE.rglob('*'):
 if p.is_file():watched[p]=p.read_bytes()
for p in[trial/'root-pre-tier-physical-review-v1.json',trial/'root-scalar-proof-v1.json',DOC/'tier-issuance.json',DOC/'tier-execution-receipt.json',ROOT/'tools/texture_sheets/build_texture_batch_review.py',ROOT/'tests/hexen2_texture_tiers_test.py',Path(__file__)]:watched[p]=p.read_bytes()
manifest=json.loads((TIER/'manifest.json').read_bytes());batch=json.loads((BASE/'batch.json').read_bytes());item,=batch['items'];journal,=json.loads((BASE/'selection.json').read_bytes())['items'];meta=json.loads((MP/'master.json').read_bytes());recipe=meta['roundedCaps']['recipe'];assert journal['generationCount']==1 and journal['generationState']=='generated-retained';assert(ROOT/journal['generated']).read_bytes()==Path(journal['builtInOutput']).read_bytes();assert sha((MP/'master.json').read_bytes())==item['masterPackageSha256'];rgb=Image.open(MP/'color.png').convert('RGB');original=Image.open(ROOT/item['original']).convert('RGB');h=np.load(MP/'height.npy',allow_pickle=False);assert h.dtype==np.float32 and h.shape==(512,512);views=DOC/'decoded-art';views.mkdir(exist_ok=False);roles=('diffuse','height','normalX','normalY','normalZ');reports={};evidence=[]
for name,factor in[('Mid',4),('High',8)]:
 n=64*factor;row=manifest['tiers'][name];scalar=float_box(h,(n,n));norm=cyclic_normals(scalar,manifest['strength'],manifest['cap']);packed=np.rint(np.clip(norm*.5+.5,0,1)*255).astype('uint8');expected={'diffuse':periodic_rgb(rgb,(n,n)),'height':Image.fromarray(np.rint(scalar*255).astype('uint8'))};expected.update({role:Image.fromarray(packed[:,:,i])for i,role in enumerate(roles[2:])});decoded={};maps=[]
 for role,image in expected.items():
  out=row['outputs'][role];path=TIER/out['file'];data=path.read_bytes();assert data==q92(image)and sha(data)==out['sha256'];assert(out['quality'],out['method'],out['lossless'])==(92,6,False);vp8_only(data);decoded[role]=Image.open(io.BytesIO(data)).convert('RGB');assert decoded[role].size==(n,n);maps.append({'role':role,**w(path)})
 colors=np.asarray(decoded['diffuse']);dh=np.asarray(decoded['height'],float)[:,:,0]/255;vector=np.stack([np.asarray(decoded[role],float)[:,:,0]for role in roles[2:]],2)/127.5-1;vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-12);xyz=np.rint(np.clip((vector*.5+.5)*255,0,255)).astype('uint8');neutral=Image.new('RGB',(2*n,n));textured=Image.new('RGB',(2*n,n));lights=[]
 for i,sign in enumerate((1,-1)):
  light=np.array([sign*.6,sign*.3,.75]);light/=np.linalg.norm(light);gain=.35+.65*np.maximum(0,np.einsum('ijk,k->ij',vector,light));pix=np.repeat(np.rint(180*gain).astype('uint8')[:,:,None],3,2);lights.append(pix);neutral.paste(Image.fromarray(pix),(i*n,0));textured.paste(Image.fromarray(np.rint(np.clip(colors*gain[:,:,None],0,255)).astype('uint8')),(i*n,0))
 prefix=name.lower();span=n//8
 evidence.extend([save(views/(prefix+'-diffuse.png'),decoded['diffuse']),save(views/(prefix+'-height.png'),decoded['height']),save(views/(prefix+'-XYZ.png'),Image.fromarray(xyz)),save(views/(prefix+'-neutral-opposed.png'),neutral),save(views/(prefix+'-textured-opposed.png'),textured),save(views/(prefix+'-repeat.png'),Image.fromarray(np.tile(colors,(2,2,1)))),save(views/(prefix+'-X-full.png'),Image.fromarray(np.concatenate([colors[:,-span:],colors[:,:span]],1))),save(views/(prefix+'-Y-full.png'),Image.fromarray(np.concatenate([colors[-span:],colors[:span]],0))),save(views/(prefix+'-corner.png'),Image.fromarray(np.roll(np.roll(colors,span,0),span,1)[:span*2,:span*2]))])
 distances=[]
 for divisor in(2,4):
  size=64//divisor;a,b=original.resize((size,size),Image.Resampling.BOX),decoded['diffuse'].resize((size,size),Image.Resampling.BOX);diff=np.abs(np.asarray(a,float)-np.asarray(b,float));entry={'divisor':divisor,'dimensions':[size,size],'meanAbsoluteError':float(diff.mean()),'maximum':float(diff.max())};assert entry in row['distanceChecks'];distances.append(entry);panel=Image.new('RGB',(size*2,size));panel.paste(a,(0,0));panel.paste(b,(size,0));evidence.append(save(views/(prefix+'-BOX'+str(size)+'.png'),panel))
 y,x=np.mgrid[:n,:n].astype(float);x=(x+.5)/factor;y=(y+.5)/factor;heads=[];contact=Image.new('RGB',(1280,1096),(25,27,30));cd=ImageDraw.Draw(contact)
 for i,head in enumerate(recipe['caps']['heads']):
  cx,cy=head['centre'];rx,ry=head['radii'];rho=np.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2);samples=[]
  for lo,hi in[(0,.15),(.25,.4),(.55,.7),(.8,.95),(1.1,1.35)]:
   mask=(rho>=lo)&(rho<hi);assert mask.any();v=dh[mask];samples.append({'normalizedRadius':[lo,hi],'pixels':int(mask.sum()),'mean':float(v.mean()),'median':float(np.median(v)),'range':[float(v.min()),float(v.max())]})
  hierarchy=samples[0]['mean']>samples[2]['mean']>samples[-1]['mean'];heads.append({'label':head['label'],'decodedHeightBroadProfiles':samples,'centreShoulderPlateHierarchy':hierarchy,'limits':'Decoded neighborhood profile, not pure physical material or every-point monotonicity. C0 contact and source microdetail remain explicit.'})
  px=i%4*320;py=i//4*548;cd.text((px+3,py+3),name+' '+head['label']+' decoded RGB / XYZ',fill='white');cd.text((px+3,py+281),'Actual decoded neutral A / B; nearest display',fill='white');ix,iy=round(cx*factor-.5),round(cy*factor-.5);radius=max(18,round(38*factor/8));box=(max(0,ix-radius),max(0,iy-radius),min(n,ix+radius),min(n,iy+radius))
  for k,array in enumerate((colors,xyz,lights[0],lights[1])):contact.paste(Image.fromarray(array).crop(box).resize((152,152),Image.Resampling.NEAREST),(px+k%2*160,py+28+k//2*280))
 evidence.append(save(views/(prefix+'-all-eight-heads.png'),contact));assert all(q['centreShoulderPlateHierarchy']for q in heads)
 reports[name]={'dimensions':[n,n],'maps':maps,'allFiveDirectMasterFloatAndNormalQ92Method6BytesExact':True,'distanceChecks':distances,'heads':heads,'allEightDecodedCentreShoulderPlateHierarchy':True,'normalDiagnostics':{k:v for k,v in row.items()if k.endswith('Degrees')or k=='heightQuantizationCompressionMAE'}}
html=BASE/'review/index.html';htmlbytes=html.read_bytes();parser=Parser();parser.feed(htmlbytes.decode());assert not parser.scripts and len(parser.images)==4 and {q['src']for q in parser.images}=={f'rtex054-{tier}-{role}.jpg'for tier in('mid','high')for role in('review','relief')};assert b'Mid (default) [256, 256]'in htmlbytes and b'High [512, 512]'in htmlbytes;preview=[];commands=[]
with tempfile.TemporaryDirectory(prefix='quaked-rtex054-review-replay-',dir='/private/tmp')as td:
 temp=Path(td);argv=['/usr/bin/python3',str(ROOT/'tools/texture_sheets/build_texture_batch_review.py'),'--batch',str(BASE/'batch.json'),'--paths-root',str(ROOT),'--output',str(temp/'review')];run=subprocess.run(argv,cwd=ROOT,capture_output=True,text=True,timeout=120);commands.append({'argv':argv,'exitCode':run.returncode,'stdout':run.stdout,'stderr':run.stderr});assert run.returncode==0,run.stderr;assert(temp/'review/index.html').read_bytes()==htmlbytes
 for name in('mid-review','mid-relief','high-review','high-relief'):
  path=BASE/'review'/('rtex054-'+name+'.jpg');replay=temp/'review'/path.name;a=np.asarray(Image.open(path).convert('RGB'));b=np.asarray(Image.open(replay).convert('RGB'));assert a.shape==b.shape
  if name.endswith('review'):boxes={'title':(0,0,1400,32),'native':(12,32,524,544),'diffuse':(540,32,1052,544),'detail':(1068,32,1324,288),'repeat':(12,570,524,1082),'half-label':(540,570,1400,595),'half-native':(540,595,636,691),'half-enhanced':(646,595,742,691),'quarter-label':(540,805,1400,830),'quarter-native':(540,830,588,878),'quarter-enhanced':(598,830,646,878)}
  else:
   size=256 if name.startswith('mid')else512;boxes={'top-labels':(0,0,1200,30),'bottom-labels':(0,550,1200,580),'height':(10,30,10+size,30+size),'XYZ':(610,30,610+size,30+size),'light-A':(10,580,10+size,580+size),'light-B':(610,580,610+size,580+size)}
  occupied=np.zeros(a.shape[:2],bool);panels=[]
  for label,(x0,y0,x1,y1)in boxes.items():
   assert not occupied[y0:y1,x0:x1].any();assert np.array_equal(a[y0:y1,x0:x1],b[y0:y1,x0:x1]),name+' '+label;occupied[y0:y1,x0:x1]=True;panels.append({'label':label,'box':[x0,y0,x1,y1],'decodedRGBSHA256':sha(a[y0:y1,x0:x1].tobytes()),'exactReplay':True})
  changed=np.any(a!=b,2);allowed=np.zeros_like(changed);allowed[-16:,-40:]=True;assert not np.any(allowed&occupied)and not np.any(changed&~allowed);preview.append({**w(path),'fullJPEGBytesExact':path.read_bytes()==replay.read_bytes(),'materialAndLabelsExact':True,'panels':panels,'changedPixels':int(changed.sum()),'allVarianceOnlyProvenUnused40x16Tail':True})
assert not temp.exists();assert all(p.read_bytes()==data for p,data in watched.items())
report={'schemaVersion':1,'verdict':'PASS author direct10map/float-normal/Q92method6/staticHTML/content replay and decoded profile checks; actual author ART and independent final qualification separate','scope':'No wrapper/master or production tier command rerun. Actual authorized production receipts bound; only review-only CLI replay used cleaned private output.','batch':w(BASE/'batch.json'),'masterPackage':w(MP/'master.json'),'tierReceipt':w(TIER/'manifest.json'),'rootPhysicalReview':w(trial/'root-pre-tier-physical-review-v1.json'),'rootScalarProof':w(trial/'root-scalar-proof-v1.json'),'actualMasterExecution':w(trial/'execution-receipt.json'),'actualProductionTierExecution':w(DOC/'tier-execution-receipt.json'),'generationCount':1,'rawBuiltinBytesExact':True,'tierChecks':reports,'HTML':w(html),'staticHTML4ImageBindingsExact':True,'reviewOnlyCLIReplay':commands,'HTMLBytesExact':True,'all4JPEGBytesExact':all(q['fullJPEGBytesExact']for q in preview),'previewChecks':preview,'diagnosticEvidence':evidence,'inputsStable':True,'inputs':{str(p.relative_to(ROOT)):sha(data)for p,data in watched.items()},'ownedTemporaryReviewReplayRemoved':True,'temporaryReviewReplay':str(temp),'browserBoundary':'Static local HTML and direct JPEG/PNG inspection only. No browser attempt/render/interaction, native runtime, owner or release acceptance.','limits':['Baked source RGB shading retained. Relative C0 paraboloid, not calibrated hemisphere or measured depth.','Broad decoded profiles do not imply pure interface material, pointwise radial monotonicity or amplitude as a slope bound.','Old source/layered HOLDs and133frozen pre-tier inputs remain unchanged.'],'verifier':w(Path(__file__)),'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
with(DOC/'author-source-map-preview-proof.json').open('x')as file:file.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'proof':w(DOC/'author-source-map-preview-proof.json'),'maps':10,'decodedViews':len(evidence),'previewPanels':sum(len(q['panels'])for q in preview),'all4JPEGBytesExact':report['all4JPEGBytesExact'],'allEightBothTierHierarchy':True}))
