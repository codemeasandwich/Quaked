"""Independent actual Portal ttex054 native/source/layer/scalar/codec qualification.
Reuse maintained oracle math, never production math helpers. Candidate read only.
"""
import datetime,hashlib,io,json,math,pathlib,runpy,struct,subprocess,sys,tempfile
import numpy as np
import PIL
from PIL import Image,ImageDraw,features
D=pathlib.Path(__file__).resolve().parent
R=next(p for p in D.parents if(p/'tools/texture_sheets/derive_texture_tiers.py').is_file())
B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
OUT=D/'actual-v1.json';assert not OUT.exists();watched={}
sha=lambda b:hashlib.sha256(b).hexdigest()
def path(p):
 p=pathlib.Path(p);return p if p.is_absolute()else R/p
def read(p):
 p=path(p).resolve();b=p.read_bytes();watched[p]=b;return b
def load(p):return json.loads(read(p))
def rec(p):
 p=path(p).resolve();b=read(p);return {'file':str(p.relative_to(R))if R in p.parents else str(p),'sha256':sha(b),'bytes':len(b)}
def filehash(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(512**2),b''):h.update(b)
 return h.hexdigest()
def png(a):
 s=io.BytesIO();Image.fromarray(a,'RGB').save(s,'PNG');return s.getvalue()
def npy(a):
 s=io.BytesIO();np.save(s,a,allow_pickle=False);return s.getvalue()
def rgb_replay(native,raw):
 w,h=native.size;cw,ch=w//2,h//2;size=(w*8,h*8)
 donor=np.asarray(raw.resize(size,Image.Resampling.LANCZOS),float)
 target=np.asarray(native,float).reshape(ch,2,cw,2,3).mean((1,3));coarse=donor.reshape(ch,16,cw,16,3).mean((1,3))
 freq=np.fft.fftfreq(ch)[:,None]**2+np.fft.fftfreq(cw)[None,:]**2
 field=np.fft.ifft2(np.fft.fft2(target-coarse,axes=(0,1))*np.exp(-2*np.pi**2*.75**2*freq)[:,:,None],axes=(0,1)).real
 channels=[]
 for k in range(3):
  f=Image.fromarray(np.tile(field[:,:,k],(3,3)).astype('float32'),'F').resize((size[0]*3,size[1]*3),Image.Resampling.BICUBIC)
  channels.append(np.asarray(f)[size[1]:size[1]*2,size[0]:size[0]*2])
 return np.rint(np.clip(donor+np.stack(channels,2)*.65,0,255)).astype('uint8')
r={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'One ttex054 owner-directed shallow raised plaster ornament; fresh native/sole raw/shared canonical scalar/direct10 map byte replay','limits':['Retained generation count and exact built-in output custody are not an independent provider-side invocation audit.','Math/source/codec PASS does not establish artistic, runtime, owner-final, registration, landing, CI or release acceptance.']}
try:
 assert(PIL.__version__,np.__version__,features.version('webp'))==('10.1.0','1.26.2','1.3.2')
 freeze_path=D.parent/'CANDIDATE_FREEZE.json';assert sha(read(freeze_path))=='dd6e1c74657152a49dec6fcc30b0f243dc5ae70c62c0c9437609914e580b1a35'
 assert sha(read(D.parent/'FINAL_HANDOFF.md'))=='9c1576e6455dd5fd5a5263a750179eef80af6f8c1ddd70013188c159c09c0fc6'
 freeze=load(freeze_path)
 for row in list(freeze['mainArtifacts'].values())+freeze['files']:assert sha(read(row['file']))==row['sha256']
 descriptor=path(freeze['mainArtifacts']['descriptor']['file']);batch=load(descriptor);item,=batch['items']
 identity=item['id'];assert identity==item['nativeIdentity']==freeze['nativeIdentity']=='cddf441f348f0a3182edadeeeb9028ece70c2eadbef541955e7197f8213c9752'
 assert batch['pathsBase']=='repository'and batch['defaultTier']=='Mid'and batch['factors']==[4,8]and(batch['quality'],batch['method'],batch['lossless'])==(92,6,False)
 selection,=[x for x in load(B/'selection.json')['items']if x['id']==identity]
 selected,=[x for x in load(B/'native-selection.json')['items']if x['id']==identity]
 inv=load(R/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json');native,=[v for v in inv['variants']if v['id']==identity]
 assert item['name']==selection['name']==native['name']=='ttex054'and item['edition']==selection['edition']=='portals'
 assert item['nativeDimensions']==selection['nativeDimensions']==[native['width'],native['height']]==[64,128]
 for key in('paletteSha256','indexedPixelSha256','rgbaSha256'):assert item[key]==selection[key]==selected[key]==native[key]
 assert native['category']=='ordinary'and not native['name'].startswith(('*','!','+','{'))and not native['name'].lower().startswith('sky')
 assert not[v for v in inv['variants']if v['id']!=identity and v['rgbaSha256']==native['rgbaSha256']],'Alias needs full proof'
 assert item['generationCount']==selection['generationCount']==1 and selection['generationState']=='generated-retained'
 W,H=native['width'],native['height'];MW,MH=W*8,H*8
 archives={a['path']:a for a in inv['archives']};dirs={};archive_records=[]
 palette_path='/Users/bri/quaked/Hexen 2/data1/pak0.pak'
 for filename in sorted({o['source']for o in native['provenance']}|{palette_path}):
  p=pathlib.Path(filename);a=archives[filename];assert p.stat().st_size==a['bytes']and filehash(p)==a['sha256']
  with p.open('rb')as f:
   magic,off,length=struct.unpack('<4sII',f.read(12));assert magic==b'PACK'and length%64==0 and off+length<=p.stat().st_size;f.seek(off);table=f.read(length)
  directory={}
  for j in range(0,length,64):directory.setdefault(table[j:j+56].split(b'\0')[0].decode('ascii').lower(),struct.unpack_from('<II',table,j+56))
  dirs[filename]=directory;archive_records.append(a)
 def member(filename,name):
  off,size=dirs[filename][name]
  with open(filename,'rb')as f:f.seek(off);data=f.read(size)
  assert len(data)==size;return data,off
 palette,_=member(palette_path,'gfx/palette.lmp');assert len(palette)==768 and sha(palette)==native['paletteSha256']
 mips0=None;occurrences=[]
 for o in{(o['source'],o['map'],o['slot']):o for o in reversed(native['provenance'])}.values():
  bsp,off=member(o['source'],o['map']);assert off==o['memberOffset']and sha(bsp)==o['bspSha256'];assert struct.unpack_from('<i',bsp)[0]==29
  lumps=[struct.unpack_from('<II',bsp,4+j*8)for j in range(15)];assert all(a+b<=len(bsp)for a,b in lumps)
  tex,length=lumps[2];count=struct.unpack_from('<i',bsp,tex)[0];assert 0<=o['slot']<count;local=struct.unpack_from('<i',bsp,tex+4+4*o['slot'])[0];assert local>=0;at=tex+local
  assert bsp[at:at+16].split(b'\0')[0].decode('ascii')=='ttex054'and struct.unpack_from('<II',bsp,at+16)==(W,H)
  mips=[]
  for level in range(4):
   start=struct.unpack_from('<I',bsp,at+24+4*level)[0];size=(W>>level)*(H>>level);assert start>=40 and at+start+size<=tex+length;mips.append(bsp[at+start:at+start+size])
  if mips0 is None:mips0=mips
  assert mips0==mips and sha(mips[0])==native['indexedPixelSha256']
  ti,tn=lumps[6];face,fn=lumps[7];assert tn%40==0 and fn%20==0
  slots={j:struct.unpack_from('<i',bsp,ti+j*40+36)[0]for j in range(tn//40)if struct.unpack_from('<i',bsp,ti+j*40+32)[0]==o['slot']};assert set(slots.values())=={0}
  faces=sum(struct.unpack_from('<H',bsp,face+j*20+10)[0]in slots for j in range(fn//20));assert faces==o['faces']
  occurrences.append(dict(**o,ordinaryTexinfoFlags=[0],fourMipSHA256=[sha(x)for x in mips],facesRecomputed=faces))
 rgba=np.c_[np.frombuffer(palette,'uint8').reshape(256,3)[np.frombuffer(mips0[0],'uint8')],np.full(W*H,255,'uint8')].reshape(H,W,4)
 op=path(item['original']);original_image=Image.open(io.BytesIO(read(op)));assert original_image.size==(W,H)and original_image.format=='PNG'and original_image.convert('RGBA').tobytes()==rgba.tobytes()
 assert sha(rgba.tobytes())==native['rgbaSha256'];assert sha(read(op))==item['originalSha256']==selection['originalSha256']==selected['originalSha256'];original=original_image.convert('RGB')
 mp=path(item['masterPackage']['file']);m=load(mp);assert sha(read(mp))==item['masterPackage']['sha256'];assert(m['name'],m['edition'],m['generationCount'],m['canonicalMasterFactor'])==('ttex054','portals',1,8)
 assert m['nativeDimensions']==[W,H]and m['masterDimensions']==[MW,MH]and m['generatedDimensions']==[887,1774]
 assert m['masterRevision']['RGBUnchanged']and m['masterRevision']['generatorOutputUnchanged']and m['masterRevision']['notAnotherGeneration']
 for role,row in m['inputs'].items():assert sha(read(row['file']))==row['sha256']
 for role in('original','generated','prompt'):assert sha(read(selection[role]))==selection[role+'Sha256']==m['inputs'][role]['sha256']
 rawp=path(selection['generated']);promptp=path(selection['prompt']);raw=Image.open(io.BytesIO(read(rawp)));assert raw.mode=='RGB'and raw.format=='PNG'and raw.size==(887,1774)and raw.width>=MW and raw.height>=MH and raw.width*H==raw.height*W
 assert read(rawp)==read(selection['builtInOutput'])and read(promptp).decode('utf8').strip()
 expected_tools={'prepare':'tools/texture_sheets/prepare_texture_master.py','finish':'tools/texture_sheets/finish_official_texture.py','derive':'tools/texture_sheets/derive_texture_tiers.py','craft':'tools/craft_normals.py','layeredAuthoring':'tools/texture_sheets/prepare_layered_texture_master.py','layeredPolicy':'tools/texture_sheets/update_level_sheets.py'}
 assert set(m['tools'])==set(expected_tools)
 for role,row in m['tools'].items():assert path(row['file']).resolve()==path(expected_tools[role]).resolve()and sha(read(row['file']))==row['sha256']
 cp=mp.parent/'color.png';hp=mp.parent/'height.npy';canonical=Image.open(io.BytesIO(read(cp)));assert canonical.mode=='RGB'and canonical.size==(MW,MH)
 stream=io.BytesIO(read(hp));height=np.load(stream,allow_pickle=False);assert stream.tell()==len(read(hp));assert height.shape==(MH,MW)and height.dtype==np.dtype('float32')and np.isfinite(height).all()and 0<=height.min()<=height.max()<=1
 assert sha(read(cp))==m['color']['sha256']and sha(read(hp))==m['height']['sha256'];assert m['height']['authoredOnce']and not m['height']['quantizedTo8Bit'];assert np.unique(height).size==m['height']['uniqueSamples']
 source_mp=B/'masters/ttex054/master.json';source=load(source_mp);assert sha(read(source_mp))==m['masterRevision']['replacesUnqualifiedPackageSha256'];assert 'masterRevision'not in source and 'authoringPolicy'not in source['height']
 assert read(source_mp.parent/'color.png')==read(cp)and source['height']['sha256']==m['masterRevision']['previousHeightSha256']
 reg=m['registration'];assert(reg['method'],reg['factor'],reg['comparisonDivisor'],reg['colorStrength'],reg['fieldSigma'])==('photographic',8,2,.65,.75);assert reg['axis']is None and reg['verticalLandmarks']is None and not reg['edgeAnchor']
 rebuilt=rgb_replay(original,raw);assert png(rebuilt)==read(cp),'Independent RGB replay'
 helpers=runpy.run_path(str(D/'oracle-helpers.py'));read(D/'oracle-helpers.py');p=m['height']['profile'];assert p==dict(bands=[.6,1,.8,.5],groove=.5,bump=.5,glow=.2,strength=.3,cap=.5)
 detail=helpers['craft64'](rebuilt,p);assert detail.dtype==np.dtype('float64')and npy(detail.astype('float32'))==read(source_mp.parent/'height.npy')
 recipe=load(m['inputs']['heightLayering']['file']);assert recipe==m['layeredRelief']['recipe']and recipe['nativeIdentity']==identity and recipe['sourceMasterPackageSha256']==sha(read(source_mp))
 proof=load(recipe['sourceVerification']['file']);assert proof['verdict'].startswith('PASS')and sha(read(recipe['sourceVerification']['file']))==recipe['sourceVerification']['sha256'];row,=[x for x in proof['materials']if x['nativeIdentity']==identity];assert row['masterPackage']['sha256']==sha(read(source_mp))and path(row['masterPackage']['file']).resolve()==source_mp.resolve()
 layer=recipe['layering'];assert len(layer['brickRegions'])==73 and(layer['facingHeight'],layer['brickHeight'],layer['microAmplitude'])==(.995,.975,.001)
 canvas=Image.new('L',(MW,MH));draw=ImageDraw.Draw(canvas)
 for region in layer['brickRegions']:
  assert set(region)=={'polygon'}
  for dy in(-MH,0,MH):
   for dx in(-MW,0,MW):draw.polygon([(x*8+dx,y*8+dy)for x,y in region['polygon']],fill=255)
 mask=np.asarray(canvas,float)/255;sigma=layer['bevelPixels']*np.sqrt(detail.size)/256;edge=helpers['blur'](mask,sigma)
 facing=layer['facingHeight']-(layer['facingHeight']-layer['chipFloor'])*np.minimum(edge*2,1)
 full=np.where(mask>.5,layer['brickHeight'],facing)+(detail-.5)*(2*layer['microAmplitude'])
 assert npy(full.astype('float32'))==read(hp),'Independent float64 layers with one final float32 cast'
 assert height[mask>.5].max()<height[mask<=.5].min()and sigma==m['layeredRelief']['bevelSigmaMasterPixels']
 tp=path(item['tierManifest']['file']);receipt=load(tp);assert sha(read(tp))==item['tierManifest']['sha256'];assert receipt['Low']==dict(source='original',unchanged=True,sha256=sha(read(op)))and receipt['defaultTier']=='Mid'
 for role,file in[('original',op),('master',cp),('heightMaster',hp)]:assert path(receipt['inputs'][role]['file']).resolve()==file.resolve()and receipt['inputs'][role]['sha256']==sha(read(file))
 assert receipt['tools']['deriverSha256']==sha(read(R/'tools/texture_sheets/derive_texture_tiers.py'))and receipt['tools']['normalMathSha256']==sha(read(R/'tools/craft_normals.py'))
 oracle_path=R/'tests/hexen2_texture_tiers_test.py';read(oracle_path);o=runpy.run_path(str(oracle_path));tiers=[];unique=set()
 for tier,factor in[('Mid',4),('High',8)]:
  row=receipt['tiers'][tier];binding=item['tiers'][tier];size=(W*factor,H*factor);assert row['factor']==binding['factor']==factor and row['dimensions']==binding['dimensions']==list(size)
  hh=o['float_box'](height,size);nn=o['cyclic_normals'](hh,.3,.5);nb=np.round(np.clip(nn*.5+.5,0,1)*255).astype('uint8')
  block=8//factor;exact=height.astype(float).reshape(size[1],block,size[0],block).mean((1,3));assert np.max(np.abs(hh-exact))<8e-8
  expected={'diffuse':o['q92'](o['periodic_rgb'](canonical,size)),'height':o['q92'](Image.fromarray(np.round(hh*255).astype('uint8')))}
  expected.update({role:o['q92'](Image.fromarray(nb[:,:,k]))for k,role in enumerate(o['ROLES'][2:])});decoded={};maps=[]
  assert set(expected)==set(row['outputs'])==set(binding['files'])
  for role,payload in expected.items():
   meta=row['outputs'][role];file=tp.parent/meta['file'];assert file.resolve()==path(binding['files'][role]).resolve();assert read(file)==payload and sha(payload)==meta['sha256']and len(payload)==meta['bytes'];o['vp8_only'](payload)
   assert(meta['quality'],meta['method'],meta['lossless'])==(92,6,False)and meta['sourceMaster']==('master'if role=='diffuse'else'heightMaster')and meta['dimensions']==list(size)
   im=Image.open(io.BytesIO(payload)).convert('RGB');assert im.size==size;decoded[role]=im;unique.add(file.resolve());a=np.asarray(im,float)
   edges=dict(wrapX=float(np.abs(a[:,0]-a[:,-1]).mean()),wrapY=float(np.abs(a[0]-a[-1]).mean()),interiorX=float(np.abs(np.diff(a,axis=1)).mean()),interiorY=float(np.abs(np.diff(a,axis=0)).mean()));assert edges==row['edges'][role];maps.append(dict(role=role,**rec(file)))
  for d in row['distanceChecks']:
   assert d['divisor']in(2,4);dims=(W//d['divisor'],H//d['divisor']);err=np.abs(np.asarray(original.resize(dims,Image.Resampling.BOX),float)-np.asarray(decoded['diffuse'].resize(dims,Image.Resampling.BOX),float));assert d==dict(divisor=d['divisor'],dimensions=list(dims),meanAbsoluteError=float(err.mean()),maximum=float(err.max()))
  dh=np.asarray(decoded['height'],float)[:,:,0]/255;dn=np.stack([np.asarray(decoded[r],float)[:,:,0]for r in o['ROLES'][2:]],2)/127.5-1;dn/=np.maximum(np.linalg.norm(dn,axis=2,keepdims=True),1e-12);nh=o['cyclic_normals'](dh,.3,.5)
  assert row['heightQuantizationCompressionMAE']==float(np.abs(dh-hh).mean())
  for key,a,b in[('authoredNormalVsDecodedXYZDegrees',nn,dn),('authoredNormalVsDecodedHeightDegrees',nn,nh),('decodedHeightNormalVsDecodedXYZDegrees',nh,dn)]:
   angles=np.degrees(np.arccos(np.clip((a*b).sum(2),-1,1)));stats=dict(mean=float(angles.mean()),p99=float(np.percentile(angles,99)),maximum=float(angles.max()));assert all(abs(stats[k]-row[key][k])<1e-10 for k in stats)
  gold=np.asarray(Image.fromarray((1-mask).astype('float32')).resize(size,Image.Resampling.BOX))>.99;base=np.asarray(Image.fromarray(mask.astype('float32')).resize(size,Image.Resampling.BOX))>.99
  tiers.append(dict(tier=tier,dimensions=list(size),maps=maps,distanceChecks=row['distanceChecks'],edges=row['edges'],allFiveQ92Method6DirectMasterBytesExact=True,decodedHeightUniqueValues=int(np.unique(dh).size),decodedGoldMedian=float(np.median(dh[gold])),decodedBaseMedian=float(np.median(dh[base])),decodedGoldAboveBase=float(np.median(dh[gold])-np.median(dh[base])),angularDiagnostics={k:row[k]for k in row if k.endswith('Degrees')}))
 assert len(unique)==10
 # Actual maintained CLI replay, separate from independent expected-byte math.
 with tempfile.TemporaryDirectory(prefix='ttex054-independent-public-',dir='/private/tmp')as temporary:
  temp=pathlib.Path(temporary);commands=[]
  prep=[sys.executable,str(R/'tools/texture_sheets/prepare_texture_master.py')]
  for role in('original','generated','prompt'):prep+=['--'+role,str(path(selection[role]))]
  prep+=['--name','ttex054','--edition','portals','--profile','painted','--output',str(temp/'initial')]
  layered=[sys.executable,str(R/'tools/texture_sheets/prepare_layered_texture_master.py'),'--recipe',str(path(m['inputs']['heightLayering']['file'])),'--output',str(temp/'layered')]
  derive=[sys.executable,str(R/'tools/texture_sheets/derive_texture_tiers.py'),'--original',str(op),'--master',str(cp),'--height-master',str(hp),'--output',str(temp/'tiers')]
  for command in(prep,layered,derive):
   done=subprocess.run(command,cwd=R,capture_output=True,text=True,timeout=120);commands.append(dict(command=command,exitCode=done.returncode,stdout=done.stdout,stderr=done.stderr));assert done.returncode==0,done.stderr
  assert all((temp/'initial'/name).read_bytes()==read(source_mp.parent/name)for name in('master.json','color.png','height.npy'))
  assert all((temp/'layered'/name).read_bytes()==read(mp.parent/name)for name in('master.json','color.png','height.npy'))
  assert(temp/'tiers/manifest.json').read_bytes()==read(tp);assert all((temp/'tiers'/p.name).read_bytes()==read(p)for p in unique)
 assert not pathlib.Path(temporary).exists();assert all(filehash(pathlib.Path(a['path']))==a['sha256']for a in archive_records);assert all(p.read_bytes()==data for p,data in list(watched.items()))
 r.update(verdict='PASS independent fresh native/source/RGB/float64 layered master/direct10maps and maintained public CLI replay; ART separate',materials=[dict(name='ttex054',edition='portals',nativeIdentity=identity,masterPackage=rec(mp),tierReceipt=rec(tp),sourcePackage=rec(source_mp),color=rec(cp),height=rec(hp),retainedRaw=rec(rawp),exactPrompt=rec(promptp),layerRecipe=rec(path(m['inputs']['heightLayering']['file'])),masterRGBIndependentBytesExact=True,floatHeightIndependentBytesExact=True,layerFloat64OneCastExact=True,rawBuiltinBytesExact=True,tiers=tiers)],nativeOccurrences=occurrences,archiveHashesBeforeAndAfter=archive_records,nativeBindings=1,physicalMasterPackages=1,uniqueReferencedMapFiles=10,mapCount=10,declaredRetainedGenerationCount=1,descriptor=rec(descriptor),selection=rec(B/'selection.json'),publicCLIReplay=commands,ownedTemporaryReplayRemoved=True,inputsStable=True,inputs=[rec(p)for p in sorted(watched)],verifier=rec(pathlib.Path(__file__)),codec=dict(executable=sys.executable,Python=sys.version,Pillow=PIL.__version__,NumPy=np.__version__,WebP=features.version('webp')))
except Exception as exc:r.update(verdict='HOLD',error=repr(exc));raise
finally:
 r['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();OUT.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'verdict':r['verdict'],'receipt':str(OUT),'sha256':sha(OUT.read_bytes())}))
