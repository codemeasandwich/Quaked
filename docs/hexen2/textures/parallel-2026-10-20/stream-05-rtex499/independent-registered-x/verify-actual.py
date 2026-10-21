"""One actual native/source/master/codec verification; no art/runtime acceptance."""
import ast,datetime,hashlib,io,json,pathlib,runpy,struct,subprocess,sys,tempfile
import numpy as np
import PIL
from PIL import Image,features

DOC=pathlib.Path(__file__).resolve().parent
ROOT=next(p for p in DOC.parents if (p/'tools/texture_sheets/prepare_texture_master.py').is_file())
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-05-rtex499'
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
  for chunk in iter(lambda:f.read(1024**2),b''):h.update(chunk)
 return h.hexdigest()
def rgb_replay(native,raw):
 # Same qualified .65/.75 unwarped oracle, generalized from B8 64px to128px.
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
 scope='One corrected rtex499 actual two-installation/four-slot native/all4mips/flags and sole source/master/direct10map replay',
 limits=['Declared retained generator count and byte custody are not a provider-side invocation audit.',
 'Source/codec/math replay does not independently accept art, intended relief, runtime, owner acceptance, registration, Dev/CI/release or full campaign.'])
try:
 assert (PIL.__version__,np.__version__,features.version('webp'))==('10.1.0','1.26.2','1.3.2')
 helpers=DOC/'oracle-helpers.py';read(helpers);independent=runpy.run_path(str(helpers))
 oracle_path=ROOT/'tests/hexen2_texture_tiers_test.py';read(oracle_path);oracle=runpy.run_path(str(oracle_path))
 prior_oracle=ROOT/'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py';read(prior_oracle)
 batch=load(BASE/'batch-registered-x.json');assert sha(read(BASE/'batch-registered-x.json'))=='a9508c102794ea116df76ad66242000ab3caaa11c27a2e7487df90fcd6524da8'
 item,=batch['items'];select,=load(BASE/'selection.json')['items'];native=load(BASE/'native-selection.json');n,=native['selected']
 sealed,=load(BASE/'selection-generated-sealed.json')['items'];assert select==sealed
 assert batch['pathsBase']=='repository' and batch['tierFactors']=={'Mid':4,'High':8} and batch['defaultTier']=='Mid'
 assert (batch['quality'],batch['method'],batch['lossless'])==(92,6,False)
 identity=item['nativeIdentity']['id'];assert identity==select['id']==n['id']=='4461c8b9623bcc682a41c4358b0e486c00aa3f77cde9b2dfebcb2efceab6dfd5'
 assert item['name']==select['name']==n['name']=='rtex499' and item['edition']==select['edition']=='portals'
 assert n['category']=='ordinary' and not n['name'].startswith(('*','!','+','{')) and not n['name'].lower().startswith('sky')
 assert (n['width'],n['height'])==(128,128) and select['nativeDimensions']==[128,128]
 assert item['generationCount']==select['generationCount']==1 and select['generationState']=='generated-retained'
 assert not select.get('contentAliasOf') and not select.get('candidateContentAliasOf')
 for role in ('original','generated','prompt'):assert item[role]==select[role]
 for k in ('paletteSha256','indexedPixelSha256','rgbaSha256'):assert item['nativeIdentity'][k]==select[k]==n[k]
 inv_path=ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json';inv=load(inv_path)
 variant,=[v for v in inv['variants'] if v['id']==identity]
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
 for o in n['provenance']:
  bsp,off=member(o['source'],o['map']);assert off==o['memberOffset'] and sha(bsp)==o['bspSha256']
  assert struct.unpack_from('<i',bsp)[0]==29
  lumps=[struct.unpack_from('<II',bsp,4+j*8) for j in range(15)];assert all(a+b<=len(bsp) for a,b in lumps)
  tex,length=lumps[2];count=struct.unpack_from('<i',bsp,tex)[0];assert 0<=o['slot']<count
  local=struct.unpack_from('<i',bsp,tex+4+o['slot']*4)[0];assert local>=0;at=tex+local
  assert bsp[at:at+16].split(b'\0')[0].decode('ascii')=='rtex499' and struct.unpack_from('<II',bsp,at+16)==(128,128)
  mips=[]
  for level in range(4):
   start=struct.unpack_from('<I',bsp,at+24+level*4)[0];size=(128>>level)**2
   assert start>=40 and at+start+size<=tex+length;mips.append(bsp[at+start:at+start+size])
  if all_mips is None:all_mips=mips
  assert all_mips==mips
  authored,=[q for q in native['nativeMipAndFlagProof'] if q['source']==o['source'] and q['map']==o['map'] and q['slot']==o['slot']]
  assert [sha(x) for x in mips]==[q['indexedSha256'] for q in authored['mips']]
  ti,tn=lumps[6];face,fn=lumps[7];assert tn%40==0 and fn%20==0
  slots={j:struct.unpack_from('<i',bsp,ti+j*40+36)[0] for j in range(tn//40) if struct.unpack_from('<i',bsp,ti+j*40+32)[0]==o['slot']}
  assert set(slots.values())=={0};faces=sum(struct.unpack_from('<H',bsp,face+j*20+10)[0] in slots for j in range(fn//20))
  assert faces==o['faces']
  native_occurrences.append(dict(**o,ordinaryFlags=[0],fourMipSHA256=[sha(x) for x in mips],facesRecomputed=faces))
 rgba=np.c_[np.frombuffer(palette,'uint8').reshape(256,3)[np.frombuffer(all_mips[0],'uint8')],np.full(128**2,255,'uint8')].reshape(128,128,4)
 op=resolve(item['original']);native_image=Image.open(io.BytesIO(read(op)))
 assert native_image.format=='PNG' and native_image.size==(128,128) and native_image.convert('RGBA').tobytes()==rgba.tobytes()
 assert sha(read(op))==select['originalSha256']==n['selectedOriginal']['sha256'] and n['selectedOriginal']['path']==item['original']
 assert sha(rgba.tobytes())==n['rgbaSha256'] and sha(all_mips[0])==n['indexedPixelSha256']
 original=native_image.convert('RGB');mp=resolve(item['masterPackage']);m=load(mp)
 assert sha(read(mp))==item['masterPackageSha256']=='04fdec43c9dd84b5029632752931a3a0b37aeb1f99d5d4619d13428a848e8101'
 assert m['name']=='rtex499' and m['edition']=='portals' and m['generationCount']==1 and m['canonicalMasterFactor']==8
 assert m['nativeDimensions']==[128,128] and m['masterDimensions']==[1024,1024] and m['masterRevision']['RGBUnchanged'] is False
 assert set(m['inputs'])=={'original','generated','prompt','heightLayering','boundaryParent'}
 for role,row in m['inputs'].items():
  assert sha(read(row['file']))==row['sha256']
  if role not in ('heightLayering','boundaryParent'):assert resolve(row['file']).resolve()==resolve(item[role]).resolve()
 tools=dict(prepare='prepare_texture_master.py',finish='finish_official_texture.py',derive='derive_texture_tiers.py',craft='../../craft_normals.py',layeredAuthoring='prepare_layered_texture_master.py',layeredPolicy='update_level_sheets.py',layeredBoundaryRegistration='register_layered_texture_boundary.py',boundaryPolicy='register_texture_boundary.py')
 assert set(m['tools'])==set(tools)
 for role,row in m['tools'].items():
  expected=ROOT/'tools/craft_normals.py' if role=='craft' else ROOT/'tools/texture_sheets'/tools[role]
  assert resolve(row['file']).resolve()==expected.resolve() and sha(read(expected))==row['sha256']
 rawp=resolve(item['generated']);promptp=resolve(item['prompt']);raw=Image.open(io.BytesIO(read(rawp)))
 assert raw.format=='PNG' and raw.mode=='RGB' and raw.size==(1254,1254) and list(raw.size)==select['generatedDimensions']==m['generatedDimensions']
 assert sha(read(rawp))==select['generatedSha256'] and read(rawp)==read(select['builtInOutput'])
 assert sha(read(promptp))==select['promptSha256'] and read(promptp).decode('utf8').strip()
 cp=mp.parent/m['color']['file'];hp=mp.parent/m['height']['file'];canonical=Image.open(io.BytesIO(read(cp)))
 assert canonical.format=='PNG' and canonical.mode=='RGB' and canonical.size==(1024,1024)
 stream=io.BytesIO(read(hp));height=np.load(stream,allow_pickle=False);assert stream.tell()==len(read(hp))
 assert height.shape==(1024,1024) and height.dtype==np.dtype('float32') and height.flags.c_contiguous and np.isfinite(height).all() and 0<=height.min()<=height.max()<=1
 assert sha(read(cp))==m['color']['sha256'] and sha(read(hp))==m['height']['sha256']
 assert m['height']['authoredOnce'] is True and m['height']['quantizedTo8Bit'] is False and np.unique(height).size==m['height']['uniqueSamples']
 reg=m['registration'];assert reg['method']=='photographic' and reg['factor']==8 and reg['comparisonDivisor']==2
 assert (reg['colorStrength'],reg['fieldSigma'])==(.65,.75) and not reg['edgeAnchor'] and reg['axis'] is None and reg['verticalLandmarks'] is None
 baseline_rgb=rgb_replay(original,raw)
 parentp=resolve(m['inputs']['boundaryParent']['file']);parent=load(parentp)
 assert sha(read(parentp))==m['inputs']['boundaryParent']['sha256']=='f87690b61af0b066dcd804f03f58d4070aa0f81b6b53f810c3619f797c50430f'
 assert m['masterRevision']['replacesUnqualifiedPackageSha256']==sha(read(parentp))
 assert m['masterRevision']['priorRevision']==parent['masterRevision'] and m['masterRevision']['priorRegistration']==parent['registration']
 assert m['masterRevision']['previousColorSha256']==parent['color']['sha256'] and m['masterRevision']['previousHeightSha256']==parent['height']['sha256']
 assert m['masterRevision']['generatorOutputUnchanged'] is True and m['masterRevision']['notAnotherGeneration'] is True
 baseline_png=independent['encoded_png'](Image.fromarray(baseline_rgb,'RGB'))
 assert sha(baseline_png)==parent['color']['sha256'] and baseline_png==read(parentp.parent/'color.png')
 p=m['height']['profile'];assert p==parent['height']['profile']==dict(bands=[.35,1,1.4,1],groove=1.4,bump=.7,glow=0,strength=.3,cap=.5)
 recipe_path=resolve(m['inputs']['heightLayering']['file']);recipe=load(recipe_path);meta=m['layeredRelief']
 assert recipe==meta['baselineRecipe']==parent['layeredRelief']['recipe']
 assert sha(read(recipe_path))==meta['baselineRecipeSha256']==parent['layeredRelief']['recipeSha256']=='77877e63bbb3a161103090a2faf9f67b66a3aee96514c0a37ccd2db71ec0bd20'
 assert recipe['nativeIdentity']==identity and recipe['authoringDiffuseSha256']==sha(baseline_png) and recipe['originalSha256']==sha(read(op))
 initial_mp=resolve(recipe['sourceMasterPackage']);initial=load(initial_mp)
 assert sha(read(initial_mp))==recipe['sourceMasterPackageSha256']==parent['masterRevision']['replacesUnqualifiedPackageSha256']
 baseline_detail=independent['craft64'](baseline_rgb,p)
 assert sha(independent['encoded_npy'](baseline_detail.astype('float32')))==initial['height']['sha256']==parent['masterRevision']['previousHeightSha256']
 assert initial['color']['sha256']==sha(baseline_png) and 'masterRevision' not in initial
 source_proof=resolve(recipe['sourceVerification']['file']);proof=load(source_proof)
 assert sha(read(source_proof))==recipe['sourceVerification']['sha256'] and proof['verdict'].startswith('PASS')
 bound_source,=[q for q in proof['materials'] if q['nativeIdentity']==identity]
 assert bound_source['masterPackage']['sha256']==sha(read(initial_mp)) and resolve(bound_source['masterPackage']['file']).resolve()==initial_mp.resolve()
 from PIL import ImageDraw
 layer=recipe['layering'];assert layer['referenceSize']==[128,128]
 assert {k:layer[k] for k in ('facingHeight','brickHeight','chipFloor','microAmplitude','bevelPixels')}==dict(facingHeight=.66,brickHeight=.29,chipFloor=.54,microAmplitude=.025,bevelPixels=.35)
 mask_image=Image.new('L',(1024,1024));draw=ImageDraw.Draw(mask_image)
 for region in layer['brickRegions']:
  for dy in (-1024,0,1024):
   for dx in (-1024,0,1024):draw.polygon([(x*8+dx,y*8+dy) for x,y in region['polygon']],fill=255)
 mask=np.asarray(mask_image,dtype=float)/255
 sigma=layer['bevelPixels']*4;smoothed=independent['blur'](mask,sigma)
 base=np.where(mask>.5,layer['brickHeight'],layer['facingHeight']-(layer['facingHeight']-layer['chipFloor'])*np.minimum(smoothed*2,1))
 baseline_height=(base+(baseline_detail-.5)*(2*layer['microAmplitude'])).astype('float32')
 assert sha(independent['encoded_npy'](baseline_height))==parent['height']['sha256']
 assert independent['encoded_npy'](baseline_height)==read(parentp.parent/'height.npy')
 # Reuse the previously qualified independent Fourier/Laplacian oracle only.
 y_oracle_path=ROOT/'docs/hexen2/textures/batch-006-public-verify-final.py';nodes=ast.parse(read(y_oracle_path))
 node=next(n for n in nodes.body if isinstance(n,ast.FunctionDef) and n.name=='independent_y')
 context={'np':np,'Image':Image};exec(compile(ast.Module(body=[node],type_ignores=[]),str(y_oracle_path),'exec'),context)
 corrected,stats=context['independent_y'](Image.fromarray(baseline_rgb,'RGB').transpose(Image.Transpose.TRANSPOSE))
 corrected=corrected.transpose(Image.Transpose.TRANSPOSE);rebuilt=np.asarray(corrected)
 assert independent['encoded_png'](corrected)==read(cp),'Independent actual X Poisson PNG replay'
 diagnostic=ROOT/'docs/hexen2/textures/parallel-2026-10-20/stream-05-rtex499/root-x-boundary-diagnostic/x-corrected-RGB-DIAGNOSTIC.png'
 assert read(diagnostic)==read(cp)
 detail=independent['craft64'](rebuilt,p)
 floated=(base+(detail-.5)*(2*layer['microAmplitude'])).astype('float32')
 early=(base+(detail.astype('float32')-.5)*(2*layer['microAmplitude'])).astype('float32')
 precision_differences=int(np.count_nonzero(floated!=early));assert precision_differences>0
 assert independent['encoded_npy'](floated)==read(hp),'Independent corrected fullfloat64-to-one-cast layer replay'
 assert m['height']['authoringPolicy']=='periodic-layered-veneer-v1'
 assert meta['detailRGBSourceSha256']==sha(read(cp)) and meta['baselineRecipeAuthoringDiffuseSha256']==sha(baseline_png)
 assert float(floated[mask>.5].max())<float(floated[mask<=.5].min()) and meta['bevelSigmaMasterPixels']==sigma
 for key,values in [('substrateRange',floated[mask>.5]),('facingRange',floated[mask<=.5])]:assert meta[key]==[float(values.min()),float(values.max())]
 correction=reg['periodicBoundary'];assert correction['axes']==['x'] and correction['computationAxes']==['y'] and correction['transposed'] is True
 assert correction['featureRelocation'] is False and correction['perimeterBand'] is False
 for key in ('meanAbsoluteCorrection','maxAbsoluteCorrection','clippedChannelFraction'):assert abs(correction[key]-stats[key])<1e-12
 def edges(a):return dict(wrap_x_mean=float(np.abs(a[:,0]-a[:,-1]).mean()),wrap_y_mean=float(np.abs(a[0]-a[-1]).mean()),interior_x_mean=float(np.abs(np.diff(a,axis=1)).mean()),interior_y_mean=float(np.abs(np.diff(a,axis=0)).mean()))
 before=edges(baseline_rgb.astype(float));after=edges(rebuilt.astype(float))
 for phase,values in [('before',before),('after',after)]:assert all(abs(correction[phase][k]-v)<1e-12 for k,v in values.items())
 assert all(abs(reg['boundaries'][k]-v)<1e-12 for k,v in after.items())
 assert reg['outputMean']==rebuilt.mean((0,1)).tolist() and reg['sourceMean']==np.asarray(original,float).mean((0,1)).tolist()
 for divisor in (2,4):
  nw=128//divisor;block=8*divisor
  cur=rebuilt.astype(float).reshape(nw,block,nw,block,3).mean((1,3));ref=np.asarray(original,float).reshape(nw,divisor,nw,divisor,3).mean((1,3));err=np.abs(cur-ref)
  assert abs(correction['distanceChecks'][str(divisor)]['RGBMeanAbsoluteError']-float(err.mean()))<1e-12
  if divisor==2:assert abs(reg['distanceMeanMAE']-float(err.mean()))<1e-12 and abs(reg['distanceMeanMaxError']-float(err.max()))<1e-12
 codeproof=ROOT/'docs/hexen2/textures/parallel-2026-10-20/stream-05-rtex499/independent/adapter-code-review-v2.json'
 assert sha(read(codeproof))=='4382fc8086a3eca80acbd03f70668b747cbe593a1d9eb8f2e779d7e104df9608' and load(codeproof)['verdict'].startswith('PASS')
 report['boundaryLayerReplay']=dict(recipe=witness(recipe_path),sourceProof=witness(source_proof),initialPackage=witness(initial_mp),parentLayeredPackage=witness(parentp),codeQualification=witness(codeproof),initialHeldRGBOrNPYUsedAsOracle=False,parentSiblingGuardsRetained=True,precisionDifferencesVersusEarlyFloat32=precision_differences,fullFloat64DetailBeforeSingleCast=True,sigmaMasterPixels=sigma,PoissonPNGBytesExact=True,currentMetricsIndependent=True,descriptiveScalarTolerance=1e-12)
 tp=resolve(item['tierReceipt']);receipt=load(tp);assert sha(read(tp))==item['tierReceiptSha256']
 assert receipt['Low']==dict(source='original',unchanged=True,sha256=sha(read(op))) and receipt['defaultTier']=='Mid'
 for role,path in [('original',op),('master',cp),('heightMaster',hp)]:assert resolve(receipt['inputs'][role]['file']).resolve()==path.resolve() and receipt['inputs'][role]['sha256']==sha(read(path))
 assert receipt['tools']['deriverSha256']==sha(read(ROOT/'tools/texture_sheets/derive_texture_tiers.py')) and receipt['tools']['normalMathSha256']==sha(read(ROOT/'tools/craft_normals.py'))
 tiers=[];unique=set()
 for tier,factor in [('Mid',4),('High',8)]:
  row=receipt['tiers'][tier];binding=item['tiers'][tier];size=(128*factor,128*factor)
  assert row['factor']==binding['factor']==factor and row['dimensions']==binding['dimensions']==list(size)
  H=oracle['float_box'](height,size);N=oracle['cyclic_normals'](H,receipt['strength'],receipt['cap'])
  block=1024//size[0];exact=height.astype(float).reshape(size[1],block,size[0],block).mean((1,3));assert np.max(np.abs(H-exact))<8e-8
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
   assert d['divisor'] in (2,4);dims=(128//d['divisor'],128//d['divisor'])
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
 # The new guarded public CLI internally reproduces the parent via layeredCLI.
 with tempfile.TemporaryDirectory(prefix='rtex499-registered-x-public-',dir='/private/tmp') as temporary:
  temp=pathlib.Path(temporary);commands=[]
  register=[sys.executable,str(ROOT/'tools/texture_sheets/register_layered_texture_boundary.py'),'--package',str(parentp),'--axis','x','--output',str(temp/'registered')]
  derive=[sys.executable,str(ROOT/'tools/texture_sheets/derive_texture_tiers.py'),'--original',str(op),'--master',str(cp),'--height-master',str(hp),'--output',str(temp/'tiers')]
  for command in (register,derive):
   run=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=120)
   commands.append(dict(command=command,exitCode=run.returncode,stdout=run.stdout,stderr=run.stderr));assert run.returncode==0,run.stderr
  assert (temp/'registered/color.png').read_bytes()==read(cp) and (temp/'registered/height.npy').read_bytes()==read(hp)
  assert (temp/'registered/master.json').read_bytes()==read(mp)
  assert (temp/'tiers/manifest.json').read_bytes()==read(tp)
  assert all((temp/'tiers'/path.name).read_bytes()==read(path) for path in unique)
 assert not pathlib.Path(temporary).exists()
 assert all(file_sha(pathlib.Path(a['path']))==a['sha256'] for a in observations)
 assert all(p.read_bytes()==data for p,data in list(watched.items()))
 report.update(verdict='PASS actual native/source/master/direct10map math and public CLI replay; ART separate',
   nativeBindings=1,physicalMasterPackages=1,mapCount=10,uniqueReferencedMapFiles=10,declaredRetainedGenerationCount=1,newGenerations=0,
   nativeOccurrences=native_occurrences,uniqueBSPContentCount=2,logicalNativeFaceCount=612,
   archiveHashesBeforeAndAfter=observations,original=witness(op),descriptor=witness(BASE/'batch-registered-x.json'),selection=witness(BASE/'selection.json'),nativeSelection=witness(BASE/'native-selection.json'),
   materials=[dict(name='rtex499',edition='portals',nativeIdentity=identity,masterPackage=witness(mp),tierReceipt=witness(tp),color=witness(cp),height=witness(hp),retainedRaw=witness(rawp),exactPrompt=witness(promptp),rawBuiltinBytesExact=True,masterRGBIndependentBytesExact=True,floatHeightIndependentBytesExact=True,tiers=tiers)],
   publicCLIReplay=commands,ownedTemporaryReplayRemoved=True,inputsStable=True,inputs=[witness(p) for p in sorted(watched)],verifier=witness(pathlib.Path(__file__)),
   codec=dict(executable=sys.executable,python=sys.version,Pillow=PIL.__version__,NumPy=np.__version__,WebP=features.version('webp')))
except Exception as exc:
 report.update(verdict='HOLD',error=repr(exc));raise
finally:
 report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x') as f:f.write(json.dumps(report,indent=2)+'\n')
 print(json.dumps(dict(receipt=str(OUT),verdict=report['verdict'],sha256=sha(OUT.read_bytes()))))
