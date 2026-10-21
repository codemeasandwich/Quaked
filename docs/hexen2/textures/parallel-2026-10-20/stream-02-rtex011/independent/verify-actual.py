"""Independent actual rtex011 native/source/layer/direct-map oracle and CLI replay."""
import ast,datetime,hashlib,io,json,math,pathlib,runpy,struct,subprocess,tempfile
import PIL,numpy as np
from PIL import Image,ImageDraw,features
ROOT=pathlib.Path(__file__).resolve().parents[6];DOC=pathlib.Path(__file__).resolve().parent;PARENT=DOC.parent;BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-02-rtex011';OUT=DOC/'actual-review.json';assert not OUT.exists()
sha=lambda b:hashlib.sha256(b).hexdigest();watched={}
def path(p):return pathlib.Path(p) if pathlib.Path(p).is_absolute() else ROOT/p
def read(p):
 p=path(p).resolve();b=p.read_bytes();watched[p]=b;return b
def load(p):return json.loads(read(p))
def w(p):
 p=path(p).resolve();b=read(p);return {'file':str(p.relative_to(ROOT)) if ROOT in p.parents else str(p),'sha256':sha(b),'bytes':len(b)}
def pic(p):return Image.open(io.BytesIO(read(p))).convert('RGB')
def npy(a):
 f=io.BytesIO();np.save(f,a,allow_pickle=False);return f.getvalue()
def png(a):
 f=io.BytesIO();Image.fromarray(a).save(f,'PNG');return f.getvalue()
REPORT={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'One actual rtex011 single-source registered/layered master, native all-four-mips fresh occurrence, direct4x/8x codec/normal/distance/height; no ART/runtime acceptance','limits':['Retained raw and issuance journal do not independently audit provider-side request counts.','Fresh physical native replay covers one occurrence/all4mips; remaining occurrences inherit bound native-proof.','Relative scalar head/plate height is not calibrated runtime displacement.','No generator, canonical writes, catalog, build, Git or release.']}
try:
 assert(PIL.__version__,np.__version__,features.version('webp'))==('10.1.0','1.26.2','1.3.2')
 batch=load(BASE/'batch.json');item,=batch['items'];select,=load(BASE/'selection.json')['items'];native=load(PARENT/'native-proof.json');assert item['name']==select['name']==native['name']=='rtex011' and item['edition']==select['edition']=='base';identity=native['nativeIdentity'];assert item['nativeIdentity']['id']==select['id']==identity
 assert(batch['quality'],batch['method'],batch['lossless'],batch['defaultTier'],batch['tierFactors'])==(92,6,False,'Mid',{'Mid':4,'High':8})
 assert item['generationCount']==select['generationCount']==1 and select['generationState']=='generated-retained';assert not select.get('contentAliasOf')
 for role in('original','generated','prompt'):assert item[role]==select[role] and sha(read(item[role]))==select[role+'Sha256']
 assert read(item['generated'])==read(select['builtInOutput']);original=pic(item['original']);raw=pic(item['generated']);assert original.size==(64,64) and raw.size==(1254,1254)
 assert sha(original.convert('RGBA').tobytes())==native['rgbaSha256'] and sha(read(item['original']))==native['original']['sha256']
 # Physical PAK/BSP replay independent of producer and cached PNG labels.
 inv=load(ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json');archives={v['path']:v for v in inv['archives']};occ=native['uniquePAKSlotOccurrences'][0];pak=pathlib.Path(occ['source']);palettepak=pathlib.Path('/Users/bri/quaked/Hexen 2/data1/pak0.pak');dirs={};archiveproof=[]
 for p in sorted({pak,palettepak}):
  h=hashlib.sha256()
  with p.open('rb') as f:
   for chunk in iter(lambda:f.read(1024**2),b''):h.update(chunk)
   f.seek(0);magic,off,n=struct.unpack('<4sII',f.read(12));assert magic==b'PACK' and n%64==0;f.seek(off);tab=f.read(n)
  assert h.hexdigest()==archives[str(p)]['sha256'] and p.stat().st_size==archives[str(p)]['bytes'];dirs[p]={tab[k:k+56].split(b'\0')[0].decode('ascii').lower():struct.unpack_from('<II',tab,k+56) for k in range(0,n,64)};archiveproof.append(archives[str(p)])
 def member(p,key):
  off,n=dirs[p][key]
  with p.open('rb') as f:f.seek(off);b=f.read(n)
  return b,off
 palette,_=member(palettepak,'gfx/palette.lmp');assert sha(palette)==native['paletteSha256'];bsp,off=member(pak,occ['map']);assert off==occ['memberOffset'] and sha(bsp)==occ['bspSha256'];version,=struct.unpack_from('<i',bsp);assert version in(29,30)
 texoff,texlen=struct.unpack_from('<II',bsp,4+2*8);lump=bsp[texoff:texoff+texlen];n,=struct.unpack_from('<I',lump);assert occ['slot']<n;toff,=struct.unpack_from('<i',lump,4+occ['slot']*4);head=lump[toff:toff+40];name,width,height,*mips=struct.unpack('<16s6I',head);assert name.split(b'\0')[0]==b'rtex011' and(width,height)==(64,64)
 pixels=[lump[toff+offset:toff+offset+((width>>i)*(height>>i))] for i,offset in enumerate(mips)];assert[sha(x) for x in pixels]==native['fourMipSHA256']==occ['fourMipSHA256'];rgba=np.concatenate([np.asarray(list(palette),np.uint8).reshape(256,3)[np.frombuffer(pixels[0],np.uint8)],np.full((4096,1),255,np.uint8)],1).reshape(64,64,4);assert sha(rgba.tobytes())==native['rgbaSha256']
 tioff,tilen=struct.unpack_from('<II',bsp,4+6*8);infos=bsp[tioff:tioff+tilen];flags=[struct.unpack_from('<ii',infos,k+32)[1] for k in range(0,tilen,40) if struct.unpack_from('<ii',infos,k+32)[0]==occ['slot']];assert set(flags)=={0}
 # Registered RGB: independent transposed X remap + periodic coarse colour field.
 regpath=BASE/'masters-registered/rtex011/master.json';reg=load(regpath);mpath=path(item['masterPackage']);m=load(mpath);assert sha(read(mpath))==item['masterPackageSha256'];assert m['masterRevision']['replacesUnqualifiedPackageSha256']==sha(read(regpath))
 for group in('inputs','tools'):
  for v in m[group].values():assert sha(read(v['file']))==v['sha256']
 land=load(m['inputs']['landmarks']['file']);pairs=np.array(land['points'],float);assert land['axis']=='x' and np.array_equal(pairs[[0,-1]],[[0,0],[64,64]]) and np.all(np.diff(pairs,axis=0)>0)
 assert reg['registration']['verticalLandmarks']==land['points'] and reg['registration']['axis']=='x';src=np.asarray(original.transpose(Image.Transpose.TRANSPOSE),float);donor=np.asarray(raw.transpose(Image.Transpose.TRANSPOSE).resize((512,512),Image.Resampling.LANCZOS),float);pos=np.interp((np.arange(512)+.5)/8,pairs[:,0],pairs[:,1])*8-.5;lo=np.floor(pos).astype(int);f=(pos-lo)[:,None,None];donor=donor[lo%512]*(1-f)+donor[(lo+1)%512]*f;target=src.reshape(32,2,32,2,3).mean((1,3));delta=target-donor.reshape(32,16,32,16,3).mean((1,3));freq=np.fft.fftfreq(32)[:,None]**2+np.fft.fftfreq(32)[None,:]**2;field=np.fft.ifft2(np.fft.fft2(delta,axes=(0,1))*np.exp(-2*np.pi**2*.75**2*freq)[:,:,None],axes=(0,1)).real;channels=[]
 for k in range(3):
  scaled=Image.fromarray(np.tile(field[:,:,k],(3,3)).astype('float32'),'F').resize((1536,1536),Image.Resampling.BICUBIC);channels.append(np.asarray(scaled)[512:1024,512:1024])
 rebuilt=np.rint(np.clip(donor+np.stack(channels,2)*.65,0,255)).astype('uint8').transpose(1,0,2);cp=mpath.parent/m['color']['file'];hp=mpath.parent/m['height']['file'];assert png(rebuilt)==read(cp)==read(regpath.parent/'color.png');assert sha(read(cp))==m['color']['sha256']
 # Prior independent craft oracle only; no production craft/compose imported.
 op=ROOT/'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py';tree=ast.parse(read(op));defs=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in{'blur','unit','extreme','smooth','craft64'}],type_ignores=[]);ctx={'np':np,'math':math};exec(compile(defs,str(op),'exec'),ctx);detail=ctx['craft64'](rebuilt,reg['height']['profile']);assert npy(detail.astype('float32'))==read(regpath.parent/'height.npy')
 recipe=load(BASE/'relief/rivet-plate.json');assert recipe==m['layeredRelief']['recipe'] and sha(read(BASE/'relief/rivet-plate.json'))==m['layeredRelief']['recipeSha256'];assert recipe['sourceMasterPackageSha256']==sha(read(regpath));proof=load(recipe['sourceVerification']['file']);assert proof['verdict'].startswith('PASS') and sha(read(recipe['sourceVerification']['file']))==recipe['sourceVerification']['sha256'];l=recipe['layering'];assert len(l['brickRegions'])==15
 canvas=Image.new('L',(512,512));draw=ImageDraw.Draw(canvas)
 for region in l['brickRegions']:
  for dy in(-512,0,512):
   for dx in(-512,0,512):draw.polygon([(x*8+dx,y*8+dy) for x,y in region['polygon']],fill=255)
 mask=np.asarray(canvas,float)/255;sigma=l['bevelPixels']*2;bl=ctx['blur'](mask,sigma);facing=l['facingHeight']-(l['facingHeight']-l['chipFloor'])*np.minimum(bl*2,1);expected=np.where(mask>.5,l['brickHeight'],facing)+(detail-.5)*(2*l['microAmplitude']);height=np.load(io.BytesIO(read(hp)),allow_pickle=False);assert npy(expected.astype('float32'))==read(hp) and sha(read(hp))==m['height']['sha256'];assert height.dtype==np.float32 and np.isfinite(height).all() and height.shape==(512,512) and 0<=height.min()<=height.max()<=1
 assert np.all(mask[[0,-1],:]==1) and np.all(mask[:,[0,-1]]==1)
 # Rounded head radial measurements, both uncompressed master and actualdecoded tiers.
 proposal=load(PARENT/'rivet-layer-proposal.json');assert len(proposal['heads'])==8;masterprofiles={}
 for head in proposal['heads']:
  x,y=map(int,head['masterCentre']);r=head['masterRadii'][0];values=[float(height[y,round(x+r*t)]) for t in(0,.25,.5,.75,.9,1.1)];assert values[0]>.65 and values[2]>values[3]>.4 and values[4]<.4 and values[5]<.32;masterprofiles[head['name']]=values
 tp=path(item['tierReceipt']);receipt=load(tp);assert sha(read(tp))==item['tierReceiptSha256'];assert receipt['defaultTier']=='Mid' and receipt['Low']=={'source':'original','unchanged':True,'sha256':sha(read(item['original']))}
 oraclepath=ROOT/'tests/hexen2_texture_tiers_test.py';read(oraclepath);oracle=runpy.run_path(str(oraclepath));canonical=Image.fromarray(rebuilt);tiers=[];maps=[]
 for tier,factor in[('Mid',4),('High',8)]:
  row=receipt['tiers'][tier];bound=item['tiers'][tier];size=(64*factor,64*factor);assert row['factor']==bound['factor']==factor and row['dimensions']==bound['dimensions']==list(size);H=oracle['float_box'](height,size);N=oracle['cyclic_normals'](H,receipt['strength'],receipt['cap']);packed=np.round(np.clip(N*.5+.5,0,1)*255).astype('uint8');payloads={'diffuse':oracle['q92'](oracle['periodic_rgb'](canonical,size)),'height':oracle['q92'](Image.fromarray(np.round(H*255).astype('uint8')))};payloads.update({role:oracle['q92'](Image.fromarray(packed[:,:,c])) for c,role in enumerate(oracle['ROLES'][2:])});decoded={}
  for role,payload in payloads.items():
   rec=row['outputs'][role];p=tp.parent/rec['file'];assert p.resolve()==path(bound['files'][role]).resolve();actual=read(p);assert actual==payload and sha(actual)==rec['sha256'] and len(actual)==rec['bytes'];oracle['vp8_only'](actual);assert(rec['quality'],rec['method'],rec['lossless'])==(92,6,False);assert rec['sourceMaster']==('master' if role=='diffuse' else'heightMaster');im=Image.open(io.BytesIO(actual)).convert('RGB');assert im.size==size;decoded[role]=im;maps.append({'tier':tier,'role':role,**w(p)})
  for d in row['distanceChecks']:
   dims=(64//d['divisor'],64//d['divisor']);err=np.abs(np.asarray(original.resize(dims,Image.Resampling.BOX),float)-np.asarray(decoded['diffuse'].resize(dims,Image.Resampling.BOX),float));assert d=={'divisor':d['divisor'],'dimensions':list(dims),'meanAbsoluteError':float(err.mean()),'maximum':float(err.max())}
  dh=np.asarray(decoded['height'],float)[:,:,0]/255;dn=np.stack([np.asarray(decoded[r],float)[:,:,0] for r in oracle['ROLES'][2:]],2)/127.5-1;dn/=np.maximum(np.linalg.norm(dn,axis=2,keepdims=True),1e-12);fromh=oracle['cyclic_normals'](dh,receipt['strength'],receipt['cap']);assert abs(np.abs(dh-H).mean()-row['heightQuantizationCompressionMAE'])<1e-12
  for key,a,b in[('authoredNormalVsDecodedXYZDegrees',N,dn),('authoredNormalVsDecodedHeightDegrees',N,fromh),('decodedHeightNormalVsDecodedXYZDegrees',fromh,dn)]:
   angle=np.degrees(np.arccos(np.clip((a*b).sum(2),-1,1)));stats={'mean':float(angle.mean()),'p99':float(np.percentile(angle,99)),'maximum':float(angle.max())};assert all(abs(stats[k]-row[key][k])<1e-10 for k in stats)
  profiles={}
  for head in proposal['heads']:
   x,y=head['nativeCentre'];r=head['nativeRadii'][0];v=[float(dh[round(y*factor),round((x+r*t)*factor)]) for t in(0,.25,.5,.75,.9,1.1)];assert v[0]>.65 and v[2]>v[3]>.4 and v[4]<.4 and v[5]<.32;profiles[head['name']]=v
  tiers.append({'tier':tier,'dimensions':list(size),'allFiveDirectMasterQ92Method6BytesExact':True,'distanceChecks':row['distanceChecks'],'decodedRightRadialProfiles':profiles,'normalMathAllThreeMetricGroupsExact':True})
 replaydir=pathlib.Path(tempfile.mkdtemp(prefix='rtex011-independent-cli-',dir='/private/tmp'));runs=[]
 for label,args in [('layer',['--recipe',str(BASE/'relief/rivet-plate.json'),'--output',str(replaydir/'layer')]),('derive',['--original',str(path(item['original'])),'--master',str(cp),'--height-master',str(hp),'--output',str(replaydir/'tiers'),'--strength',str(receipt['strength']),'--cap',str(receipt['cap'])])]:
  tool='prepare_layered_texture_master.py' if label=='layer' else'derive_texture_tiers.py';cmd=['/usr/bin/python3',str(ROOT/'tools/texture_sheets'/tool)]+args;r=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=60);runs.append({'command':cmd,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr
 assert(replaydir/'layer/color.png').read_bytes()==read(cp) and(replaydir/'layer/height.npy').read_bytes()==read(hp) and json.loads((replaydir/'layer/master.json').read_bytes())==m
 for entry in maps:assert(replaydir/'tiers'/path(entry['file']).name).read_bytes()==read(entry['file'])
 assert all(p.read_bytes()==data for p,data in watched.items());REPORT.update(verdict='PASS independent actual source, X-registered RGB, float64-layer oracle, directtier codec/UV-normal/distance math and publicCLI replay; ART separate',name='rtex011',nativeIdentity=identity,masterPackage=w(mpath),tierReceipt=w(tp),descriptor=w(BASE/'batch.json'),selection=w(BASE/'selection.json'),actualPAKOccurrence=occ,physicallyRehashedArchives=archiveproof,all4NativeMipsExact=True,rawBuiltinOutputBytesExact=True,registeredRGBIndependentBytesExact=True,float64LayeredNPYIndependentBytesExact=True,masterRightRadialProfiles=masterprofiles,radialFractions=[0,.25,.5,.75,.9,1.1],mapCount=10,maps=maps,tiers=tiers,actualCLIReplay=runs,actualCLIReplayDirectory=str(replaydir),inputsStable=True,inputs=[w(p) for p in sorted(watched)],verifier=w(pathlib.Path(__file__)),environment={'executable':__import__('sys').executable,'Pillow':PIL.__version__,'NumPy':np.__version__,'WebP':features.version('webp')})
except Exception as exc:
 REPORT.update(verdict='HOLD',error=repr(exc));raise
finally:
 REPORT['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x') as f:f.write(json.dumps(REPORT,indent=2)+'\n')
 print(json.dumps({'receipt':str(OUT),'verdict':REPORT['verdict'],'sha256':sha(OUT.read_bytes())}))
