"""Actual B8 second-pair source/master/map verification with independent scalar/codec math.

Run with /usr/bin/python3. Outputs only a new receipt; source assets are read-only.
Optional first argument selects a NEW output path; never replace a HOLD receipt.
"""
import datetime, hashlib, io, json, math, pathlib, runpy, struct, sys
import PIL, numpy as np
from PIL import Image, features

ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
OUT=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'docs/hexen2/textures/batch-008-second-pair-public-actual.json'
assert not OUT.exists(),'Retain prior receipt'
sha=lambda b:hashlib.sha256(b).hexdigest()
resolve=lambda p:pathlib.Path(p) if pathlib.Path(p).is_absolute() else ROOT/p
watched={}
def read(p):
 p=resolve(p).resolve();b=p.read_bytes();watched[p]=b;return b
def load(p):return json.loads(read(p))
def witness(p):
 p=resolve(p).resolve();b=read(p)
 return dict(file=str(p.relative_to(ROOT)) if ROOT in p.parents else str(p),sha256=sha(b),bytes=len(b))
def image(p):return Image.open(io.BytesIO(read(p))).convert('RGB')
def blur(a,s):
 h,w=a.shape;f=np.fft.rfftfreq(w)[None,:]**2+np.fft.fftfreq(h)[:,None]**2
 return np.fft.irfft2(np.fft.rfft2(a)*np.exp(-2*np.pi**2*s**2*f),s=a.shape)
def unit(a):return a/np.std(a) if np.std(a)>1e-6 else a*0
def extreme(a,r,fn):
 result=a.copy()
 for k in range(1,r+1):
  for axis in (0,1):result=fn(result,fn(np.roll(a,k,axis),np.roll(a,-k,axis)))
 return result
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def craft64(rgb,p):
 rgb=rgb.astype(float)/255;k=math.sqrt(rgb.shape[0]*rgb.shape[1])/256
 L=rgb@np.array([.299,.587,.114]);mx=rgb.max(2);mn=rgb.min(2);sat=(mx-mn)/np.maximum(mx,1e-4)
 assert not p.get('flatprint')
 L=L-blur(L,40*k)*.85;g=[blur(L,s*k) for s in (1.2,3.5,9,22,60)]
 bands=[L-g[0],g[0]-g[1],g[1]-g[2],g[2]-g[3]]
 H=sum(w*unit(a) for w,a in zip(p['bands'],bands));H=H+.25*unit(g[3]-g[4])*p['bands'][3]
 r=max(1,int(round(3*k)));groove=extreme(g[0],r,np.maximum)-g[0];top=g[0]-extreme(g[0],r,np.minimum)
 H=H-p['groove']*1.5*unit(groove)+p['bump']*1.0*unit(top);H=np.tanh(unit(H)*.9)
 if p['glow']>0:
  glowing=smooth(.55,.85,mx)*smooth(.30,.60,sat);white=smooth(.80,.95,mn)
  m=blur(np.maximum(glowing,white),1.4*k)*p['glow'];floor=np.percentile(H,25)-.35
  H=H*(1-m)+floor*m
 return (H-H.min())/(H.max()-H.min()+1e-6)
def encoded_png(im):
 s=io.BytesIO();im.save(s,'PNG');return s.getvalue()
def encoded_npy(a):
 s=io.BytesIO();np.save(s,a,allow_pickle=False);return s.getvalue()

REPORT=dict(schemaVersion=1,startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),materials=[],
 scope='Actual second-pair B8 native/source/master/direct-map replay, no ART/runtime acceptance',
 limits=['Retained single sources and declared counts are not an independent service-side invocation audit.',
 'One fresh physical PAK occurrence/all four mips per native is checked; other native occurrences remain bound to the earlier full public source proof.',
 'Numerical distance/edge/light diagnostics do not accept material art, repeats, intended relief, runtime/owner/landing/release or the full campaign.'])
try:
 assert (PIL.__version__,np.__version__,features.version('webp'))==('10.1.0','1.26.2','1.3.2')
 oracle_path=ROOT/'tests/hexen2_texture_tiers_test.py';read(oracle_path);oracle=runpy.run_path(str(oracle_path))
 rgb_oracle_path=ROOT/'docs/hexen2/textures/batch-008-rtex306-verify-source-master.py';read(rgb_oracle_path)
 rgb_oracle=runpy.run_path(str(rgb_oracle_path))['independent_rgb']
 descriptor_path=BASE/'batch-second-pair.json';descriptor=load(descriptor_path)
 selection_path=BASE/'selection-second-pair.json';selection=load(selection_path)
 native_selection=load(BASE/'native-selection.json')
 source_proof_path=ROOT/'docs/hexen2/textures/batch-008-public-source-proof.json';source_proof=load(source_proof_path)
 inventory_path=ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json';inventory=load(inventory_path)
 assert source_proof['verdict'].startswith('PASS') and source_proof['nativeCount']==8
 assert source_proof['archiveInputsStable']==inventory['archives']
 assert descriptor['pathsBase']=='repository' and descriptor['defaultTier']=='Mid' and descriptor['tierFactors']==dict(Mid=4,High=8)
 assert (descriptor['quality'],descriptor['method'],descriptor['lossless'])==(92,6,False)
 assert len(descriptor['items'])==len(selection['items'])==2
 selected={i['id']:i for i in selection['items']};baselines={i['id']:i for i in native_selection['items']}
 variants={i['id']:i for i in inventory['variants']};proved={i['id']:i for i in source_proof['materials']}
 assert {i['name'] for i in descriptor['items']}=={'ttex012','rpal317'}
 # Read/hash only the actual PAKs used below, then retain one complete occurrence per native.
 occurrences={i['nativeIdentity']['id']:proved[i['nativeIdentity']['id']]['uniquePAKOccurrences'][0] for i in descriptor['items']}
 palette_path='/Users/bri/quaked/Hexen 2/data1/pak0.pak'
 archives={a['path']:a for a in inventory['archives']};directories={};archive_observations=[]
 for p in sorted({o['source'] for o in occurrences.values()}|{palette_path}):
  path=pathlib.Path(p);h=hashlib.sha256()
  with path.open('rb') as f:
   for chunk in iter(lambda:f.read(1024**2),b''):h.update(chunk)
   f.seek(0);magic,off,n=struct.unpack('<4sII',f.read(12));assert magic==b'PACK' and n%64==0
   f.seek(off);table=f.read(n)
  assert h.hexdigest()==archives[p]['sha256'] and path.stat().st_size==archives[p]['bytes']
  directory={}
  for at in range(0,n,64):directory.setdefault(table[at:at+56].split(b'\0')[0].decode('ascii').lower(),struct.unpack_from('<II',table,at+56))
  directories[p]=directory;archive_observations.append(archives[p])
 def member(path,name):
  off,n=directories[path][name]
  with open(path,'rb') as f:f.seek(off);data=f.read(n)
  assert len(data)==n;return data,off
 palette,_=member(palette_path,'gfx/palette.lmp');assert len(palette)==768
 unique_maps=set();unique_masters=set()
 for item in descriptor['items']:
  name=item['name'];identity=item['nativeIdentity']['id'];select=selected[identity];native=baselines[identity];v=variants[identity];proof=proved[identity]
  assert all(select[k]==native[k] for k in ('id','name','edition','nativeDimensions','original','originalSha256','paletteSha256','indexedPixelSha256','rgbaSha256'))
  assert name==select['name']==v['name']==proof['name'] and item['edition']==select['edition']=='portals'
  assert item['generationCount']==select['generationCount']==1 and select['generationState']=='generated-retained'
  assert not select.get('contentAliasOf') and not select.get('candidateContentAliasOf')
  for k in ('original','generated','prompt'):assert item[k]==select[k]
  for k in ('paletteSha256','indexedPixelSha256','rgbaSha256'):assert item['nativeIdentity'][k]==v[k]==proof[k]==select[k]
  op=ROOT/item['original'];original=image(op);assert original.size==(64,64)
  assert sha(read(op))==select['originalSha256']==proof['original']['sha256']
  assert sha(Image.open(io.BytesIO(read(op))).convert('RGBA').tobytes())==v['rgbaSha256']
  occurrence=occurrences[identity];bsp,offset=member(occurrence['source'],occurrence['map'])
  assert offset==occurrence['memberOffset'] and sha(bsp)==occurrence['bspSha256'] and struct.unpack_from('<i',bsp)[0]==29
  lumps=[struct.unpack_from('<II',bsp,4+j*8) for j in range(15)];tex,length=lumps[2]
  at=tex+struct.unpack_from('<i',bsp,tex+4+4*occurrence['slot'])[0]
  assert bsp[at:at+16].split(b'\0')[0].decode('ascii')==name and struct.unpack_from('<II',bsp,at+16)==(64,64)
  mips=[]
  for level in range(4):
   start=struct.unpack_from('<I',bsp,at+24+level*4)[0];count=(64>>level)**2
   assert start>=40 and at+start+count<=tex+length;mips.append(bsp[at+start:at+start+count])
  assert [sha(b) for b in mips]==proof['fourMipSHA256']==occurrence['fourMipSHA256']
  rgba=np.c_[np.frombuffer(palette,dtype='uint8').reshape(256,3)[np.frombuffer(mips[0],dtype='uint8')],np.full(4096,255,dtype='uint8')]
  assert sha(palette)==v['paletteSha256'] and sha(mips[0])==v['indexedPixelSha256'] and sha(rgba.tobytes())==v['rgbaSha256']
  ti,n=lumps[6];flags=[struct.unpack_from('<i',bsp,ti+j*40+36)[0] for j in range(n//40) if struct.unpack_from('<i',bsp,ti+j*40+32)[0]==occurrence['slot']]
  assert set(flags)=={0}
  mp=ROOT/item['masterPackage'];unique_masters.add(mp);m=load(mp);assert sha(read(mp))==item['masterPackageSha256']
  assert m['name']==name and m['edition']=='portals' and m['generationCount']==1 and m['canonicalMasterFactor']==8
  assert m['height']['authoredOnce'] and m['height']['quantizedTo8Bit'] is False
  for role,row in m['inputs'].items():assert sha(read(row['file']))==row['sha256'],(name,role)
  for role,row in m['tools'].items():assert sha(read(row['file']))==row['sha256'],(name,role)
  for k in ('original','generated','prompt'):assert resolve(m['inputs'][k]['file']).resolve()==resolve(item[k]).resolve()
  rawpath=ROOT/item['generated'];promptpath=ROOT/item['prompt'];raw=Image.open(io.BytesIO(read(rawpath)))
  assert raw.format=='PNG' and raw.mode=='RGB' and raw.size==(1254,1254) and list(raw.size)==select['generatedDimensions']==m['generatedDimensions']
  assert sha(read(rawpath))==select['generatedSha256'] and read(rawpath)==read(select['builtInOutput'])
  assert sha(read(promptpath))==select['promptSha256'] and read(promptpath).decode('utf8').strip()
  cp=mp.parent/m['color']['file'];hp=mp.parent/m['height']['file'];canonical=Image.open(io.BytesIO(read(cp)));height=np.load(io.BytesIO(read(hp)),allow_pickle=False)
  assert canonical.format=='PNG' and canonical.mode=='RGB' and canonical.size==(512,512)
  assert height.shape==(512,512) and height.dtype==np.dtype('float32') and np.isfinite(height).all() and 0<=height.min()<=height.max()<=1
  assert sha(read(cp))==m['color']['sha256'] and sha(read(hp))==m['height']['sha256']
  reg=m['registration'];assert reg['colorStrength']==select['colorStrength']==.65 and reg['fieldSigma']==select['fieldSigma']==.75
  assert reg['method']=='photographic' and reg['factor']==8 and reg['comparisonDivisor']==2 and not reg['edgeAnchor'] and reg['axis'] is None and reg['verticalLandmarks'] is None
  rebuilt=rgb_oracle(original,raw);assert encoded_png(Image.fromarray(rebuilt,'RGB'))==read(cp),(name,'independent RGB')
  detail=craft64(rebuilt,m['height']['profile'])
  assert 'masterRevision' not in m and 'authoringPolicy' not in m['height']
  assert encoded_npy(detail.astype('float32'))==read(hp),(name,'independent float craft/layered composition')
  tp=ROOT/item['tierReceipt'];receipt=load(tp);assert sha(read(tp))==item['tierReceiptSha256']
  assert receipt['defaultTier']=='Mid' and receipt['Low']==dict(source='original',unchanged=True,sha256=sha(read(op)))
  for role,path in [('original',op),('master',cp),('heightMaster',hp)]:
   assert resolve(receipt['inputs'][role]['file']).resolve()==path.resolve() and receipt['inputs'][role]['sha256']==sha(read(path))
  assert receipt['tools']['deriverSha256']==sha(read(ROOT/'tools/texture_sheets/derive_texture_tiers.py')) and receipt['tools']['normalMathSha256']==sha(read(ROOT/'tools/craft_normals.py'))
  tiers=[]
  for tier,factor in [('Mid',4),('High',8)]:
   row=receipt['tiers'][tier];bound=item['tiers'][tier];size=(64*factor,64*factor)
   assert row['factor']==bound['factor']==factor and row['dimensions']==bound['dimensions']==list(size)
   H=oracle['float_box'](height,size);N=oracle['cyclic_normals'](H,receipt['strength'],receipt['cap'])
   block=512//size[0];exact=height.astype(float).reshape(size[1],block,size[0],block).mean((1,3));assert np.max(np.abs(H-exact))<8e-8
   packed=np.round(np.clip(N*.5+.5,0,1)*255).astype('uint8')
   expected=dict(diffuse=oracle['q92'](oracle['periodic_rgb'](canonical,size)),height=oracle['q92'](Image.fromarray(np.round(H*255).astype('uint8'))))
   expected.update({role:oracle['q92'](Image.fromarray(packed[:,:,c])) for c,role in enumerate(oracle['ROLES'][2:])})
   decoded={};maps=[]
   assert set(row['outputs'])==set(bound['files'])==set(expected)
   for role,payload in expected.items():
    rec=row['outputs'][role];p=tp.parent/rec['file'];assert p.resolve()==resolve(bound['files'][role]).resolve()
    actual=read(p);assert actual==payload and sha(actual)==rec['sha256'] and len(actual)==rec['bytes'],(name,tier,role)
    assert (rec['quality'],rec['method'],rec['lossless'])==(92,6,False) and rec['dimensions']==list(size)
    assert rec['sourceMaster']==('master' if role=='diffuse' else 'heightMaster');oracle['vp8_only'](actual)
    im=Image.open(io.BytesIO(actual)).convert('RGB');assert im.size==size;decoded[role]=im
    a=np.asarray(im,dtype=float);edges=dict(wrapX=float(np.abs(a[:,0]-a[:,-1]).mean()),wrapY=float(np.abs(a[0]-a[-1]).mean()),interiorX=float(np.abs(np.diff(a,axis=1)).mean()),interiorY=float(np.abs(np.diff(a,axis=0)).mean()))
    assert row['edges'][role]==edges;maps.append(dict(role=role,**witness(p)));unique_maps.add(p.resolve())
   assert {d['divisor'] for d in row['distanceChecks']}=={2,4}
   for d in row['distanceChecks']:
    dims=(64//d['divisor'],64//d['divisor']);error=np.abs(np.asarray(original.resize(dims,Image.Resampling.BOX),dtype=float)-np.asarray(decoded['diffuse'].resize(dims,Image.Resampling.BOX),dtype=float))
    assert d==dict(divisor=d['divisor'],dimensions=list(dims),meanAbsoluteError=float(error.mean()),maximum=float(error.max()))
   decoded_h=np.asarray(decoded['height'],dtype=float)[:,:,0]/255;assert row['heightQuantizationCompressionMAE']==float(np.abs(decoded_h-H).mean())
   encoded_n=np.stack([np.asarray(decoded[r],dtype=float)[:,:,0] for r in oracle['ROLES'][2:]],axis=2)/127.5-1
   encoded_n/=np.maximum(np.linalg.norm(encoded_n,axis=2,keepdims=True),1e-12);from_h=oracle['cyclic_normals'](decoded_h,receipt['strength'],receipt['cap'])
   for k,a,b in [('authoredNormalVsDecodedXYZDegrees',N,encoded_n),('authoredNormalVsDecodedHeightDegrees',N,from_h),('decodedHeightNormalVsDecodedXYZDegrees',from_h,encoded_n)]:
    ang=np.degrees(np.arccos(np.clip((a*b).sum(2),-1,1)));stats=dict(mean=float(ang.mean()),p99=float(np.percentile(ang,99)),maximum=float(ang.max()))
    assert all(abs(stats[key]-row[k][key])<1e-10 for key in stats),(name,tier,k)
   tiers.append(dict(tier=tier,dimensions=list(size),allFiveDirectMasterQ92Method6BytesExact=True,distanceChecks=row['distanceChecks'],maps=maps))
  REPORT['materials'].append(dict(name=name,edition='portals',nativeIdentity=identity,actualPAKOccurrence=occurrence,masterPackage=witness(mp),tierReceipt=witness(tp),retainedRaw=witness(rawpath),exactPrompt=witness(promptpath),rawBuiltinOutputBytesExact=True,masterRGBIndependentBytesExact=True,floatHeightIndependentBytesExact=True,layeredCompositionIndependent=False,tiers=tiers))
 assert len(unique_maps)==20 and len(unique_masters)==2
 assert all(p.read_bytes()==data for p,data in watched.items()),'Input changed'
 REPORT.update(verdict='PASS actual second-pair source/master/codec/math; ART/runtime acceptance separate',nativeBindings=2,declaredRetainedGenerationCount=2,mapCount=20,uniqueReferencedMapFiles=20,uniqueReferencedMasterPackages=2,sourceProof=witness(source_proof_path),currentInventory=witness(inventory_path),descriptor=witness(descriptor_path),immutableSelection=witness(selection_path),physicallyRehashedArchives=archive_observations,inputsStable=True,inputs=[witness(p) for p in sorted(watched)],verifier=witness(pathlib.Path(__file__)),codec=dict(executable=sys.executable,python=sys.version,Pillow=PIL.__version__,NumPy=np.__version__,WebP=features.version('webp')))
except Exception as exc:
 REPORT.update(verdict='HOLD',error=repr(exc));raise
finally:
 REPORT['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x') as f:f.write(json.dumps(REPORT,indent=2)+'\n')
 print(json.dumps(dict(receipt=str(OUT),verdict=REPORT['verdict'],sha256=sha(OUT.read_bytes()))))
