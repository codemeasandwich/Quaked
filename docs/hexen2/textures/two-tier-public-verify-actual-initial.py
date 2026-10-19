"""Read-only actual common-master Hexen tier source/codec/math verification.
Use /usr/bin/python3 to match the recorded Pillow10.1/WebP1.3.2 authoring codec.
No tool or image is imported as an executable producer; independent CLI-test
oracles replay map bytes. Existing finisher/craft functions replay masters only.
"""
import datetime, hashlib, importlib.util, io, json, math, pathlib, struct, subprocess, sys
import PIL, numpy as np
from PIL import Image, features
ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19'
OUT=ROOT/'docs/hexen2/textures/two-tier-public-actual-artifacts.json'
assert not OUT.exists(), 'Retain prior verification, never overwrite it'
sha=lambda b:hashlib.sha256(b).hexdigest()
def witness(p):
 b=p.read_bytes();return {'file':str(p.relative_to(ROOT)),'sha256':sha(b),'bytes':len(b)}
def load(p):return json.loads(p.read_text())
def image(p):return Image.open(p).convert('RGB')
def exact(p,digest):assert sha(p.read_bytes())==digest,str(p)
spec=importlib.util.spec_from_file_location('independent_tier_oracles',ROOT/'tests/hexen2_texture_tiers_test.py')
oracles=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracles)
sys.path[:0]=[str(ROOT/'tools'),str(ROOT/'tools/texture_sheets')]
from craft_normals import craft,profile_for
from finish_official_texture import finish
REPORT={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Actual four canonical Hexen master packages and40map public files; source/codec/math only','materials':[],'limits':['Generation count is the retained single-output package and coordinator record, not an independent service-side image-generation invocation audit.','Art/repeats/relief review and owner acceptance are separate; diagnostics are not automatic aesthetic thresholds.','No Hexen/Quake runtime binding, gameplay, app launch, GPU or mesh-displacement qualification.']}
def main():
 codec=load(BASE/'tiers/codec-environment.json');assert (PIL.__version__,np.__version__,features.version('webp'))==(codec['pillow'],codec['numpy'],codec['libwebp'])
 batch=load(BASE/'tiers/batch.json');assert batch['defaultTier']=='Mid'and batch['tierFactors']=={'Mid':4,'High':8}and batch['quality']==92 and batch['method']==6 and batch['lossless']is False
 assert {i['name']for i in batch['items']}=={'rtex337','rtex450','rtex041','ttex016'}
 exact(ROOT/batch['nativeInventory'],batch['nativeInventorySha256']);inventory=load(ROOT/batch['nativeInventory'])
 tool=ROOT/'tools/texture_sheets/derive_texture_tiers.py';exact(tool,batch['toolSha256'])
 fixed=[pathlib.Path(__file__),ROOT/'tests/hexen2_texture_tiers_test.py',tool,ROOT/'tools/craft_normals.py',ROOT/'tools/texture_sheets/finish_official_texture.py',BASE/'prepare_single_masters.py',BASE/'tiers/batch.json',BASE/'tiers/codec-environment.json',ROOT/batch['nativeInventory']]
 packages=[]
 for item in batch['items']:
  p=BASE/item['masterPackage'];t=BASE/item['tierReceipt'];exact(p,item['masterPackageSha256']);exact(t,item['tierReceiptSha256']);m=load(p);receipt=load(t);packages.append((item,m,receipt))
  fixed += [p,t,*[ROOT/x for x in m['inputs']],ROOT/m['color']['file'],ROOT/m['height']['file']]
 before={str(p):sha(p.read_bytes())for p in fixed}
 git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT,timeout=15,env={**__import__('os').environ,'GIT_OPTIONAL_LOCKS':'0'})
 staged_before=sha(git('diff','--cached','--binary','--no-ext-diff'))
 runtime=['assets/game/textures/index.json','assets/layout.json','tools/distribution/manifest.mjs'];REPORT['runtimeIsolation']=[]
 for rel in runtime:
  p=ROOT/rel;assert p.read_bytes()==git('show','HEAD:'+rel);REPORT['runtimeIsolation'].append(witness(p))
 # Read original PAKs independently. Full archive identities bound before selected-slot reads.
 dirs={}
 for row in inventory['archives']:
  p=pathlib.Path(row['path']);digest=hashlib.sha256()
  with p.open('rb')as f:
   while True:
    b=f.read(1024*1024)
    if not b:break
    digest.update(b)
   f.seek(0);magic,off,n=struct.unpack('<4sII',f.read(12));assert magic==b'PACK';f.seek(off);raw=f.read(n)
  assert digest.hexdigest()==row['sha256'];entries={}
  for at in range(0,n,64):entries.setdefault(raw[at:at+56].split(b'\0')[0].decode('ascii').lower(),struct.unpack_from('<II',raw,at+56))
  dirs[str(p)]=entries
 def member(path,name):
  off,n=dirs[path][name]
  with open(path,'rb')as f:f.seek(off);b=f.read(n)
  assert len(b)==n;return b,off
 palette,_=member('/Users/bri/quaked/Hexen 2/data1/pak0.pak','gfx/palette.lmp')
 old=load(ROOT/'docs/hexen2/textures/first-batch-public-verification.json');oldinputs={x['path']:x['sha256']for x in old['inputs']}
 for item,m,receipt in packages:
  name=item['name'];v=next(v for v in inventory['variants']if v['id']==item['nativeIdentity']['id'])
  assert all(v[k]==value for k,value in item['nativeIdentity'].items())
  original=image(BASE/item['original']);assert sha(Image.open(BASE/item['original']).convert('RGBA').tobytes())==v['rgbaSha256']
  occurrence=next(p for p in v['provenance']if p['faces']>0 and p['profile']==('base'if item['edition']=='base'else'portals-1'))
  bsp,off=member(occurrence['source'],occurrence['map']);assert off==occurrence['memberOffset']and sha(bsp)==occurrence['bspSha256']
  tex=struct.unpack_from('<I',bsp,20)[0];slot=occurrence['slot'];at=tex+struct.unpack_from('<i',bsp,tex+4+4*slot)[0];nw,nh=struct.unpack_from('<II',bsp,at+16);pixelstart=at+struct.unpack_from('<I',bsp,at+24)[0]
  indices=bsp[pixelstart:pixelstart+nw*nh];rgba=np.c_[np.frombuffer(palette,dtype='uint8').reshape(256,3)[np.frombuffer(indices,dtype='uint8')],np.full(nw*nh,255,dtype='uint8')]
  assert bsp[at:at+16].split(b'\0')[0].decode('ascii')==name and [nw,nh]==m['nativeDimensions']
  assert sha(indices)==v['indexedPixelSha256']and sha(rgba.tobytes())==v['rgbaSha256']and sha(palette)==v['paletteSha256']
  assert item['generationCount']==m['generationCount']==1 and m['height']['authoredOnce']is True and m['height']['quantizedTo8Bit']is False
  for p,h in m['inputs'].items():exact(ROOT/p,h)
  for p,h in m['tools'].items():exact(ROOT/p,h)
  rawpaths=[ROOT/p for p in m['inputs']if 'generated' in pathlib.Path(p).name and p.endswith('.png')];assert len(rawpaths)==1
  promptpaths=[ROOT/p for p in m['inputs']if 'prompt' in pathlib.Path(p).name];assert len(promptpaths)==1
  if name in ('rtex337','rtex450'):
   assert str(rawpaths[0].relative_to(ROOT))in oldinputs;exact(rawpaths[0],oldinputs[str(rawpaths[0].relative_to(ROOT))])
  raw=image(rawpaths[0]);assert list(raw.size)==m['generatedDimensions']and raw.width>=nw*8 and raw.height>=nh*8
  canonical=image(ROOT/m['color']['file']);height=np.load(ROOT/m['height']['file'],allow_pickle=False)
  assert canonical.size==(nw*8,nh*8)and list(canonical.size)==m['masterDimensions']and height.shape==(nh*8,nw*8)and height.dtype==np.dtype('float32')
  assert np.isfinite(height).all()and height.min()>=0 and height.max()<=1 and not np.all(height*255==np.round(height*255))
  exact(ROOT/m['color']['file'],m['color']['sha256']);exact(ROOT/m['height']['file'],m['height']['sha256'])
  reg=m['registration'];assert reg['factor']==8 and reg['method']=='photographic'and reg['colorStrength']==.65
  if name=='rtex337':
   def joint(im):
    a=np.asarray(im,dtype=float);h,w=a.shape[:2];line=a[round(h*8/128):round(h*54/128)].mean((0,2));lo,hi=round(w*20/64),round(w*36/64);return (lo+int(np.argmin(line[lo:hi]))+.5)/w*64
   pairs=[[0,0],[joint(original),joint(raw)],[64,64]];assert pairs==reg['verticalLandmarks']
   reconstructed,_=finish(original.transpose(Image.Transpose.TRANSPOSE),raw.transpose(Image.Transpose.TRANSPOSE),factor=8,vertical_landmarks=pairs,comparison_divisor=2,method='photographic',color_strength=.65);reconstructed=reconstructed.transpose(Image.Transpose.TRANSPOSE)
  else:
   assert reg['verticalLandmarks']is None
   reconstructed,_=finish(original,raw,factor=8,comparison_divisor=2,method='photographic',color_strength=.65)
  assert reconstructed.tobytes()==canonical.tobytes(),'Single master finishing replay differs '+name
  profile=m['height']['profile'];profile_name={'rtex337':'stone','rtex450':'stone','rtex041':'wood','ttex016':'ground'}[name]
  assert profile==json.loads(json.dumps({**profile_for(profile_name),'strength':.3,'cap':.5}))
  rawheight,_=craft(np.asarray(canonical,dtype=float)/255,profile,quantize_height=False);rawheight=rawheight.astype('float32');assert np.array_equal(rawheight,height)
  npy=io.BytesIO();np.save(npy,rawheight,allow_pickle=False);assert npy.getvalue()==(ROOT/m['height']['file']).read_bytes()
  assert receipt['inputs']['master']['sha256']==m['color']['sha256']and receipt['inputs']['heightMaster']['sha256']==m['height']['sha256']
  assert receipt['inputs']['original']['sha256']==sha((BASE/item['original']).read_bytes())and receipt['Low']['unchanged']is True and receipt['defaultTier']=='Mid'
  assert receipt['tools']['deriverSha256']==batch['toolSha256']and receipt['tools']['normalMathSha256']==m['tools']['tools/craft_normals.py']
  tiers=[]
  for tier,factor in [('Mid',4),('High',8)]:
   row=receipt['tiers'][tier];size=(nw*factor,nh*factor);assert row['dimensions']==list(size)==item['tiers'][tier]['dimensions']
   rgb=oracles.periodic_rgb(canonical,size);H=oracles.float_box(height,size);N=oracles.cyclic_normals(H,receipt['strength'],receipt['cap']);packed=np.round(np.clip(N*.5+.5,0,1)*255).astype('uint8')
   payloads={'diffuse':oracles.q92(rgb),'height':oracles.q92(Image.fromarray(np.round(H*255).astype('uint8')))}
   payloads.update({role:oracles.q92(Image.fromarray(packed[:,:,channel]))for channel,role in enumerate(oracles.ROLES[2:])})
   decoded={};maps=[]
   for role,b in payloads.items():
    record=row['outputs'][role];p=(BASE/item['tierReceipt']).parent/record['file'];assert p==BASE/item['tiers'][tier]['files'][role]
    assert p.read_bytes()==b and sha(b)==record['sha256']and len(b)==record['bytes'];oracles.vp8_only(b)
    decoded[role]=Image.open(io.BytesIO(b)).convert('RGB');assert decoded[role].size==size and record['quality']==92 and record['method']==6 and record['lossless']is False
    assert record['sourceMaster']==('master'if role=='diffuse'else'heightMaster');maps.append({'role':role,**witness(p)})
   encodedN=np.stack([np.asarray(decoded[r],dtype=float)[:,:,0]for r in oracles.ROLES[2:]],axis=2)/127.5-1;encodedN/=np.maximum(np.linalg.norm(encodedN,axis=2,keepdims=True),1e-12)
   compressedH=np.asarray(decoded['height'],dtype=float)[:,:,0]/255;fromH=oracles.cyclic_normals(compressedH,receipt['strength'],receipt['cap'])
   assert row['heightQuantizationCompressionMAE']==float(np.abs(compressedH-H).mean())
   angular={}
   for key,first,second in [('authoredNormalVsDecodedXYZDegrees',N,encodedN),('decodedHeightNormalVsDecodedXYZDegrees',fromH,encodedN),('authoredNormalVsDecodedHeightDegrees',N,fromH)]:
    a=np.degrees(np.arccos(np.clip((first*second).sum(axis=2),-1,1)));stats={'mean':float(a.mean()),'p99':float(np.percentile(a,99)),'maximum':float(a.max())}
    assert all(abs(stats[k]-row[key][k])<1e-10 for k in stats),(name,tier,key);angular[key]=stats
   for distance in row['distanceChecks']:
    div=distance['divisor'];assert div in (2,4);dims=(nw//div,nh//div);error=np.abs(np.asarray(original.resize(dims,Image.Resampling.BOX),dtype=float)-np.asarray(decoded['diffuse'].resize(dims,Image.Resampling.BOX),dtype=float));assert distance['dimensions']==list(dims)and distance['meanAbsoluteError']==float(error.mean())and distance['maximum']==float(error.max())
   tiers.append({'name':tier,'dimensions':list(size),'allFiveQ92BytesExact':True,'maps':maps,'distanceChecks':row['distanceChecks'],'normalDiagnostics':angular,'heightCompressionMAE':row['heightQuantizationCompressionMAE']})
  REPORT['materials'].append({'name':name,'edition':item['edition'],'nativeIdentity':item['nativeIdentity'],'actualPAKOccurrenceVerified':occurrence,'singleMaster':witness(BASE/item['masterPackage']),'retainedGPTSource':witness(rawpaths[0]),'prompt':witness(promptpaths[0]),'generationCountDeclaredAndPackageBound':1,'rawSourceAtLeast8x':True,'oldTwoRawSourcesUnchanged':name in ('rtex337','rtex450'),'canonicalRGBMasterReplayedFromOriginalAndRawSource':True,'unquantizedHeightMasterReplayedOnceByteExact':True,'tierReceipt':witness(BASE/item['tierReceipt']),'tiers':tiers})
 preservation=load(ROOT/'docs/hexen2/textures/craft-default-preservation.json');assert preservation['verdict'].startswith('PASS')and preservation['currentSourceSHA256']==sha((ROOT/'tools/craft_normals.py').read_bytes())
 prior=load(ROOT/preservation['prechangeReceipt']);exact(ROOT/preservation['prechangeReceipt'],preservation['prechangeReceiptSHA256']);assert all(preservation[k]==prior[k]for k in ('heightSHA256','normalSHA256'))
 y,x=np.mgrid[:64,:128];rgb=np.stack(((x*7+y*11)%251/255,(x*3+y*2)%233/255,(x*13+y*5)%199/255),axis=2);H,N=craft(rgb,profile_for('stone'))
 assert sha(H.tobytes())==prior['heightSHA256']and sha(N.tobytes())==prior['normalSHA256']
 REPORT['defaultCraftHistoricalGolden']=witness(ROOT/'docs/hexen2/textures/craft-default-preservation.json')
 assert all(sha(pathlib.Path(p).read_bytes())==digest for p,digest in before.items()),'Bound artifact input changed during checks'
 REPORT['inputsStable']=True;REPORT['inputs']=[witness(p)for p in dict.fromkeys(fixed)];REPORT['foreignStagedDiffBeforeSha256']=staged_before;REPORT['foreignStagedDiffAfterSha256']=sha(git('diff','--cached','--binary','--no-ext-diff'));REPORT['foreignStagedDiffUnchanged']=REPORT['foreignStagedDiffBeforeSha256']==REPORT['foreignStagedDiffAfterSha256']
 assert REPORT['foreignStagedDiffUnchanged'],'Concurrent staged input changed; reconcile before qualification'
 REPORT['codec']={'executable':sys.executable,'Python':sys.version,'Pillow':PIL.__version__,'NumPy':np.__version__,'WebP':features.version('webp'),'recorded':witness(BASE/'tiers/codec-environment.json')}
 REPORT['mapCount']=sum(len(t['maps'])for m in REPORT['materials']for t in m['tiers']);assert REPORT['mapCount']==40
 REPORT['verdict']='PASS actual40-map source/codec/math qualification; preview and art acceptance separate'
try:main()
except Exception as e:REPORT['verdict']='HOLD';REPORT['error']=repr(e);raise
finally:
 REPORT['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();OUT.write_text(json.dumps(REPORT,indent=2)+'\n');print(json.dumps({'receipt':str(OUT),'verdict':REPORT['verdict'],'sha256':sha(OUT.read_bytes())}))
