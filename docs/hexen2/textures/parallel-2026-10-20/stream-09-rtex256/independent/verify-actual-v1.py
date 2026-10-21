"""One actual native/source/master/codec verification; no art/runtime acceptance."""
import datetime,hashlib,io,json,pathlib,runpy,struct,subprocess,sys,tempfile
import numpy as np
import PIL
from PIL import Image,features

DOC=pathlib.Path(__file__).resolve().parent
ROOT=next(p for p in DOC.parents if (p/'tools/texture_sheets/prepare_texture_master.py').is_file())
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-09-rtex256'
OUT=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else DOC/'actual-v1.json'
assert not OUT.exists(),'Preserve previous attempt'
sha=lambda b:hashlib.sha256(b).hexdigest()
watched={}
def resolve(p):
 p=pathlib.Path(p);return p if p.is_absolute() else ROOT/p
def read(p):
 p=resolve(p).resolve();data=p.read_bytes();watched[p]=data;return data
def load(p):return json.loads(read(p))
def witness(p):
 p=resolve(p).resolve();data=read(p)
 return dict(file=str(p.relative_to(ROOT)) if ROOT in p.parents else str(p),sha256=sha(data),bytes=len(data))
def file_sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(512**2),b''):h.update(chunk)
 return h.hexdigest()
def rgb_replay(native,raw):
 # Same qualified .65/.75 unwarped oracle, generalized from B8 64px to64px.
 w,h=native.size;size=(w*8,h*8);cw,ch=w//2,h//2
 donor=np.asarray(raw.resize(size,Image.Resampling.LANCZOS),dtype=float)
 reference=np.asarray(native,dtype=float).reshape(ch,2,cw,2,3).mean((1,3))
 coarse=donor.reshape(ch,16,cw,16,3).mean((1,3));delta=reference-coarse
 freq=np.fft.fftfreq(ch)[:,None]**2+np.fft.fftfreq(cw)[None,:]**2
 field=np.fft.ifft2(np.fft.fft2(delta,axes=(0,1))*np.exp(-2*np.pi**2*.75**2*freq)[:,:,None],axes=(0,1)).real
 enlarged=[]
 for c in range(3):
  im=Image.fromarray(np.tile(field[:,:,c],(3,3)).astype('float32'),'F').resize((size[0]*3,size[1]*3),Image.Resampling.BICUBIC)
  enlarged.append(np.asarray(im)[size[1]:size[1]*2,size[0]:size[0]*2])
 return np.rint(np.clip(donor+np.stack(enlarged,2)*.65,0,255)).astype('uint8')

report=dict(schemaVersion=1,startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
 scope='One rtex256 fresh physical native/all4mips/flags and sole source/master/direct10map replay',
 limits=['Declared retained generator count and byte custody are not a provider-side invocation audit.',
 'Source/codec/math replay does not independently accept art, intended relief, runtime, owner acceptance, registration, Dev/CI/release or full campaign.'])
try:
 freeze=load(DOC.parent/'CANDIDATE_FREEZE.json');assert sha(read(DOC.parent/'CANDIDATE_FREEZE.json'))=='9008ce65ae296bd4b7a804da9773d462d5453414f28b690fc668b28135205bc1'
 assert sha(read(DOC.parent/'FINAL_HANDOFF.md'))=='3a2d7ae29ba25d2ea3cfd6c97db4b26c5552de06b583a16ef91aa7ca6a7ed7e3'
 for row in freeze['files']+list(freeze['mainArtifacts'].values()):assert sha(read(row['file']))==row['sha256']
 assert (PIL.__version__,np.__version__,features.version('webp'))==('10.1.0','1.26.2','1.3.2')
 helpers=DOC/'oracle-helpers.py';read(helpers);independent=runpy.run_path(str(helpers))
 oracle_path=ROOT/'tests/hexen2_texture_tiers_test.py';read(oracle_path);oracle=runpy.run_path(str(oracle_path))
 prior_oracle=ROOT/'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py';read(prior_oracle)
 batch=load(BASE/'batch.json');assert sha(read(BASE/'batch.json'))=='aab99a901753e2918befa088ec820559048cea5a7bc11a92779babbcf0941a2f'
 item,=batch['items'];select,=load(BASE/'selection.json')['items'];native=load(BASE/'native-selection.json');ns,=native['items'];n,=[v for v in load(DOC.parent/'native-audit/inventory.json')['variants'] if v['id']==ns['id']]
 for key in('id','name','paletteSha256','indexedPixelSha256','rgbaSha256'):assert ns[key]==n[key]
 assert ns['nativeDimensions']==[n['width'],n['height']]
 assert batch['pathsBase']=='repository' and batch['tierFactors']=={'Mid':4,'High':8} and batch['defaultTier']=='Mid'
 assert (batch['quality'],batch['method'],batch['lossless'])==(92,6,False)
 identity=item['nativeIdentity']['id'];assert identity==select['id']==n['id']=='73d1bef29871f25e3da731e707d7bd9e9062de9275b5fcbc3f8e38d9a3f41f8b'
 assert item['name']==select['name']==n['name']=='rtex256' and item['edition']==select['edition']=='base'
 assert n['category']=='ordinary' and not n['name'].startswith(('*','!','+','{')) and not n['name'].lower().startswith('sky')
 assert (n['width'],n['height'])==(64,64) and select['nativeDimensions']==[64,64]
 assert item['generationCount']==select['generationCount']==1 and select['generationState']=='generated-retained'
 assert not select.get('contentAliasOf') and not select.get('candidateContentAliasOf')
 for role in ('original','generated','prompt'):assert item[role]==select[role]
 for k in ('paletteSha256','indexedPixelSha256','rgbaSha256'):assert item['nativeIdentity'][k]==n[k]
 inv_path=ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json';inv=load(inv_path)
 variant,=[v for v in inv['variants'] if v['id']==identity]
 assert not [v for v in inv['variants']if v['id']!=identity and v['rgbaSha256']==variant['rgbaSha256']], 'Alias needs full native proof'
 for k in ('name','width','height','category','paletteSha256','indexedPixelSha256','rgbaSha256','provenance','profileFaces'):assert n[k]==variant[k]
 archives={a['path']:a for a in inv['archives']};dirs={};observations=[]
 palette_path='/Users/bri/quaked/Hexen 2/data1/pak0.pak'
 for path in sorted({o['source'] for o in n['provenance']}|{palette_path}):
  p=pathlib.Path(path);a=archives[path];assert p.stat().st_size==a['bytes'] and file_sha(p)==a['sha256']
  with p.open('rb') as f:
   magic,off,length=struct.unpack('<4sII',f.read(12));assert magic==b'PACK' and length%64==0 and off+length<=p.stat().st_size
   f.seek(off);table=f.read(length)
  directory={}
  for j in range(0,length,64):directory.setdefault(table[j:j+56].split(b'\0')[0].decode('ascii').lower(),struct.unpack_from('<II',table,j+56))
  dirs[path]=directory;observations.append(a)
 def member(path,name):
  off,size=dirs[path][name]
  with open(path,'rb') as f:f.seek(off);data=f.read(size)
  assert len(data)==size;return data,off
 palette,_=member(palette_path,'gfx/palette.lmp');assert len(palette)==768 and sha(palette)==n['paletteSha256']
 all_mips=None;native_occurrences=[]
 for o in { (o['source'],o['map'],o['slot']):o for o in reversed(n['provenance']) }.values():
  bsp,off=member(o['source'],o['map']);assert off==o['memberOffset'] and sha(bsp)==o['bspSha256']
  assert struct.unpack_from('<i',bsp)[0]==29
  lumps=[struct.unpack_from('<II',bsp,4+j*8) for j in range(15)];assert all(a+b<=len(bsp) for a,b in lumps)
  tex,length=lumps[2];count=struct.unpack_from('<i',bsp,tex)[0];assert 0<=o['slot']<count
  local=struct.unpack_from('<i',bsp,tex+4+o['slot']*4)[0];assert local>=0;at=tex+local
  assert bsp[at:at+16].split(b'\0')[0].decode('ascii')=='rtex256' and struct.unpack_from('<II',bsp,at+16)==(64,64)
  mips=[]
  for level in range(4):
   start=struct.unpack_from('<I',bsp,at+24+level*4)[0];size=(64>>level)**2
   assert start>=40 and at+start+size<=tex+length;mips.append(bsp[at+start:at+start+size])
  if all_mips is None:all_mips=mips
  assert all_mips==mips
  authorproof=load(DOC.parent/'native-proof.json')
  assert [sha(x) for x in mips]==authorproof['fourMipSHA256']
  ti,tn=lumps[6];face,fn=lumps[7];assert tn%40==0 and fn%20==0
  slots={j:struct.unpack_from('<i',bsp,ti+j*40+36)[0] for j in range(tn//40) if struct.unpack_from('<i',bsp,ti+j*40+32)[0]==o['slot']}
  assert set(slots.values())=={0};faces=sum(struct.unpack_from('<H',bsp,face+j*20+10)[0] in slots for j in range(fn//20))
  assert faces==o['faces']
  native_occurrences.append(dict(**o,ordinaryFlags=[0],fourMipSHA256=[sha(x) for x in mips],facesRecomputed=faces))
 rgba=np.c_[np.frombuffer(palette,'uint8').reshape(256,3)[np.frombuffer(all_mips[0],'uint8')],np.full(64**2,255,'uint8')].reshape(64,64,4)
 op=resolve(item['original']);native_image=Image.open(io.BytesIO(read(op)))
 assert native_image.format=='PNG' and native_image.size==(64,64) and native_image.convert('RGBA').tobytes()==rgba.tobytes()
 assert sha(read(op))==select['originalSha256']==n['selectedOriginal']['sha256'] and resolve(n['selectedOriginal']['path']).resolve()==resolve(item['original']).resolve()
 assert sha(rgba.tobytes())==n['rgbaSha256'] and sha(all_mips[0])==n['indexedPixelSha256']
 original=native_image.convert('RGB');mp=resolve(item['masterPackage']);m=load(mp)
 assert sha(read(mp))==item['masterPackageSha256']=='5aa574d33782aacfffca44122fe9c92f1713c2396e6b9f3558a310d008762aa8'
 assert m['name']=='rtex256' and m['edition']=='base' and m['generationCount']==1 and m['canonicalMasterFactor']==8
 assert m['nativeDimensions']==[64,64] and m['masterDimensions']==[512,512] and 'masterRevision' not in m
 assert set(m['inputs'])=={'original','generated','prompt'}
 for role,row in m['inputs'].items():assert sha(read(row['file']))==row['sha256'] and resolve(row['file']).resolve()==resolve(item[role]).resolve()
 tools=dict(prepare='prepare_texture_master.py',finish='finish_official_texture.py',derive='derive_texture_tiers.py',craft='../../craft_normals.py')
 assert set(m['tools'])==set(tools)
 for role,row in m['tools'].items():
  expected=ROOT/'tools/craft_normals.py' if role=='craft' else ROOT/'tools/texture_sheets'/tools[role]
  assert resolve(row['file']).resolve()==expected.resolve() and sha(read(expected))==row['sha256']
 rawp=resolve(item['generated']);promptp=resolve(item['prompt']);raw=Image.open(io.BytesIO(read(rawp)))
 assert raw.format=='PNG' and raw.mode=='RGB' and raw.size==(1254,1254) and list(raw.size)==select['generatedDimensions']==m['generatedDimensions']
 assert sha(read(rawp))==select['generatedSha256'] and read(rawp)==read(select['builtInOutput'])
 assert sha(read(promptp))==select['promptSha256'] and read(promptp).decode('utf8').strip()
 cp=mp.parent/m['color']['file'];hp=mp.parent/m['height']['file'];canonical=Image.open(io.BytesIO(read(cp)))
 assert canonical.format=='PNG' and canonical.mode=='RGB' and canonical.size==(512,512)
 stream=io.BytesIO(read(hp));height=np.load(stream,allow_pickle=False);assert stream.tell()==len(read(hp))
 assert height.shape==(512,512) and height.dtype==np.dtype('float32') and height.flags.c_contiguous and np.isfinite(height).all() and 0<=height.min()<=height.max()<=1
 assert sha(read(cp))==m['color']['sha256'] and sha(read(hp))==m['height']['sha256']
 assert m['height']['authoredOnce'] is True and m['height']['quantizedTo8Bit'] is False and np.unique(height).size==m['height']['uniqueSamples']
 reg=m['registration'];assert reg['method']=='photographic' and reg['factor']==8 and reg['comparisonDivisor']==2
 assert (reg['colorStrength'],reg['fieldSigma'])==(.65,.75) and not reg['edgeAnchor'] and reg['axis'] is None and reg['verticalLandmarks'] is None
 rebuilt=rgb_replay(original,raw);assert independent['encoded_png'](Image.fromarray(rebuilt,'RGB'))==read(cp),'Independent RGB replay'
 p=m['height']['profile'];assert p==dict(bands=[.35,1,1.4,1],groove=1.4,bump=.7,glow=0,strength=.3,cap=.5)
 floated=independent['craft64'](rebuilt,p).astype('float32');assert independent['encoded_npy'](floated)==read(hp),'Independent float height replay'
 tp=resolve(item['tierReceipt']);receipt=load(tp);assert sha(read(tp))==item['tierReceiptSha256']
 assert receipt['Low']==dict(source='original',unchanged=True,sha256=sha(read(op))) and receipt['defaultTier']=='Mid'
 for role,path in [('original',op),('master',cp),('heightMaster',hp)]:assert resolve(receipt['inputs'][role]['file']).resolve()==path.resolve() and receipt['inputs'][role]['sha256']==sha(read(path))
 assert receipt['tools']['deriverSha256']==sha(read(ROOT/'tools/texture_sheets/derive_texture_tiers.py')) and receipt['tools']['normalMathSha256']==sha(read(ROOT/'tools/craft_normals.py'))
 tiers=[];unique=set()
 for tier,factor in [('Mid',4),('High',8)]:
  row=receipt['tiers'][tier];binding=item['tiers'][tier];size=(64*factor,64*factor)
  assert row['factor']==binding['factor']==factor and row['dimensions']==binding['dimensions']==list(size)
  H=oracle['float_box'](height,size);N=oracle['cyclic_normals'](H,receipt['strength'],receipt['cap'])
  block=512//size[0];exact=height.astype(float).reshape(size[1],block,size[0],block).mean((1,3));assert np.max(np.abs(H-exact))<8e-8
  packed=np.round(np.clip(N*.5+.5,0,1)*255).astype('uint8')
  expected=dict(diffuse=oracle['q92'](oracle['periodic_rgb'](canonical,size)),height=oracle['q92'](Image.fromarray(np.round(H*255).astype('uint8'))))
  expected.update({role:oracle['q92'](Image.fromarray(packed[:,:,c])) for c,role in enumerate(oracle['ROLES'][2:])})
  assert set(expected)==set(row['outputs'])==set(binding['files']);decoded={};maps=[]
  for role,data in expected.items():
   rec=row['outputs'][role];path=tp.parent/rec['file'];assert path.resolve()==resolve(binding['files'][role]).resolve()
   assert data==read(path) and sha(data)==rec['sha256'] and len(data)==rec['bytes'];oracle['vp8_only'](data)
   assert (rec['quality'],rec['method'],rec['lossless'])==(92,6,False) and rec['dimensions']==list(size)
   assert rec['sourceMaster']==('master' if role=='diffuse' else 'heightMaster')
   im=Image.open(io.BytesIO(data)).convert('RGB');assert im.size==size;decoded[role]=im;unique.add(path.resolve())
   a=np.asarray(im,dtype=float);edges=dict(wrapX=float(np.abs(a[:,0]-a[:,-1]).mean()),wrapY=float(np.abs(a[0]-a[-1]).mean()),interiorX=float(np.abs(np.diff(a,axis=1)).mean()),interiorY=float(np.abs(np.diff(a,axis=0)).mean()))
   assert row['edges'][role]==edges;maps.append(dict(role=role,**witness(path)))
  for d in row['distanceChecks']:
   assert d['divisor'] in (2,4);dims=(64//d['divisor'],64//d['divisor'])
   err=np.abs(np.asarray(original.resize(dims,Image.Resampling.BOX),float)-np.asarray(decoded['diffuse'].resize(dims,Image.Resampling.BOX),float))
   assert d==dict(divisor=d['divisor'],dimensions=list(dims),meanAbsoluteError=float(err.mean()),maximum=float(err.max()))
  decoded_h=np.asarray(decoded['height'],float)[:,:,0]/255;assert row['heightQuantizationCompressionMAE']==float(np.abs(decoded_h-H).mean())
  encoded_n=np.stack([np.asarray(decoded[r],float)[:,:,0] for r in oracle['ROLES'][2:]],axis=2)/127.5-1
  encoded_n/=np.maximum(np.linalg.norm(encoded_n,axis=2,keepdims=True),1e-12);from_h=oracle['cyclic_normals'](decoded_h,receipt['strength'],receipt['cap'])
  for key,a,b in [('authoredNormalVsDecodedXYZDegrees',N,encoded_n),('authoredNormalVsDecodedHeightDegrees',N,from_h),('decodedHeightNormalVsDecodedXYZDegrees',from_h,encoded_n)]:
   angle=np.degrees(np.arccos(np.clip((a*b).sum(2),-1,1)));stats=dict(mean=float(angle.mean()),p99=float(np.percentile(angle,99)),maximum=float(angle.max()))
   assert all(abs(stats[k]-row[key][k])<1e-10 for k in stats)
  tiers.append(dict(tier=tier,dimensions=list(size),allFiveQ92Method6DirectMasterBytesExact=True,maps=maps,distanceChecks=row['distanceChecks'],edges=row['edges'],angularDiagnostics={k:row[k] for k in row if k.endswith('Degrees')}))
 assert len(unique)==10
 # Actual public producer CLIs are exercised separately from expected-byte math.
 with tempfile.TemporaryDirectory(prefix='rtex256-independent-public-',dir='/private/tmp') as temporary:
  temp=pathlib.Path(temporary);commands=[]
  prep=[sys.executable,str(ROOT/'tools/texture_sheets/prepare_texture_master.py')]
  for role in ('original','generated','prompt'):prep+=['--'+role,str(resolve(item[role]))]
  prep+=['--name','rtex256','--edition','base','--profile','stone','--output',str(temp/'master')]
  derive=[sys.executable,str(ROOT/'tools/texture_sheets/derive_texture_tiers.py'),'--original',str(op),'--master',str(cp),'--height-master',str(hp),'--output',str(temp/'tiers')]
  for command in (prep,derive):
   run=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=60)
   commands.append(dict(command=command,exitCode=run.returncode,stdout=run.stdout,stderr=run.stderr));assert run.returncode==0,run.stderr
  assert (temp/'master/color.png').read_bytes()==read(cp) and (temp/'master/height.npy').read_bytes()==read(hp)
  assert json.loads((temp/'master/master.json').read_bytes())==m
  assert (temp/'tiers/manifest.json').read_bytes()==read(tp)
  assert all((temp/'tiers'/path.name).read_bytes()==read(path) for path in unique)
 assert not pathlib.Path(temporary).exists()
 assert all(file_sha(pathlib.Path(a['path']))==a['sha256'] for a in observations)
 assert all(p.read_bytes()==data for p,data in list(watched.items()))
 report.update(verdict='PASS actual native/source/master/direct10map math and public CLI replay; ART separate',
   nativeBindings=1,physicalMasterPackages=1,mapCount=10,uniqueReferencedMapFiles=10,declaredRetainedGenerationCount=1,
   nativeOccurrences=native_occurrences,uniqueBSPContentCount=len({o["bspSha256"]for o in native_occurrences}),logicalNativeFaceCount=sum(o["faces"]for o in native_occurrences),inheritedProfileCountsAreNotExtraNativeFaces=True,
   archiveHashesBeforeAndAfter=observations,original=witness(op),descriptor=witness(BASE/'batch.json'),selection=witness(BASE/'selection.json'),nativeSelection=witness(BASE/'native-selection.json'),
   materials=[dict(name='rtex256',edition='base',nativeIdentity=identity,masterPackage=witness(mp),tierReceipt=witness(tp),color=witness(cp),height=witness(hp),retainedRaw=witness(rawp),exactPrompt=witness(promptp),rawBuiltinBytesExact=True,masterRGBIndependentBytesExact=True,floatHeightIndependentBytesExact=True,tiers=tiers)],
   publicCLIReplay=commands,ownedTemporaryReplayRemoved=True,inputsStable=True,inputs=[witness(p) for p in sorted(watched)],verifier=witness(pathlib.Path(__file__)),
   codec=dict(executable=sys.executable,python=sys.version,Pillow=PIL.__version__,NumPy=np.__version__,WebP=features.version('webp')))
except Exception as exc:
 report.update(verdict='HOLD',error=repr(exc));raise
finally:
 report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x') as f:f.write(json.dumps(report,indent=2)+'\n')
 print(json.dumps(dict(receipt=str(OUT),verdict=report['verdict'],sha256=sha(OUT.read_bytes()))))
