#!/usr/bin/env python3
"""Bounded actual Quake stone source/master/tier/review public verification.
Public producer CLIs are replayed only into owned temporary directories.
Tier oracle functions are reused from the independent public fixture tests;
no producer reduction/normal/codec helpers are imported as an oracle.
"""
import datetime, hashlib, importlib.util, io, json, struct, subprocess, sys, tempfile
from pathlib import Path
import numpy as np
import PIL
from PIL import Image, features
ROOT=Path(__file__).resolve().parents[3]
BATCH=ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-001'
OUT=ROOT/'docs/quake/textures/batch-001-stones-public-verification.json'
NATIVE=ROOT/'docs/quake/textures/batch-001-native-source-proof.json'
ROLES=('diffuse','height','normalX','normalY','normalZ')
def sha(b):return hashlib.sha256(b).hexdigest()
def fsha(p):return sha(Path(p).read_bytes())
def need(test,msg):
 if not test:raise AssertionError(msg)
def load(p):return json.loads(Path(p).read_text())
def oracle_module():
 path=ROOT/'tests/hexen2_texture_tiers_test.py';spec=importlib.util.spec_from_file_location('independent_tier_oracles',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
O=oracle_module()
def bind(path):return {'file':str(Path(path).relative_to(ROOT)),'sha256':fsha(path)}
def run(args):
 proc=subprocess.run([sys.executable,*map(str,args)],cwd=ROOT,capture_output=True,text=True,timeout=180)
 need(proc.returncode==0,'CLI replay failed '+proc.stderr)
 return {'arguments':[sys.executable,*map(str,args)],'exitCode':proc.returncode,'stdout':proc.stdout.strip(),'stderr':proc.stderr.strip()}
def member(rec):
 p=Path(rec['resolvedPack']);need(p.is_file(),'PAK missing');
 with p.open('rb') as f:
  h=f.read(12);need(h[:4]==b'PACK','PAK signature');off,n=struct.unpack('<II',h[4:]);need(n%64==0,'PAK directory alignment');f.seek(off);directory=f.read(n)
  rows={row[:56].split(b'\0')[0].decode('ascii').lower():struct.unpack('<II',row[56:]) for row in [directory[i:i+64] for i in range(0,n,64)]}
  at,length=rows[rec['name']];need((at,length)==(rec['offset'],rec['bytes']),'Native receipt member offset differs');need(at+length<=p.stat().st_size,'PAK member bounds');f.seek(at);b=f.read(length);need(len(b)==length,'short PAK read');return b

def verify_native(row,item):
 # Re-read actual PAK directories and parse the native mips independently of
 # the earlier source verifier. Scope remains its bounded occurrence list.
 observations=[];original=Image.open(ROOT/item['original']).convert('RGBA')
 for rec in row['occurrences']:
  b=member(rec['mapMember']);pal=member(rec['paletteMember']);need(sha(b)==rec['bspSha256'],'BSP changed');need(len(pal)==768,'palette length')
  version=struct.unpack_from('<i',b)[0];need(version==29,'this bounded verifier expects BSP29')
  def lump(i):
   at,n=struct.unpack_from('<ii',b,4+i*8);need(0<=at<=at+n<=len(b),'lump bounds');return b[at:at+n]
  tex=lump(2);count=struct.unpack_from('<i',tex)[0];need(0<=rec['slot']<count,'slot');at=struct.unpack_from('<i',tex,4+4*rec['slot'])[0]
  name=tex[at:at+16].split(b'\0')[0].decode('ascii');w,h,*offsets=struct.unpack_from('<6I',tex,at+16);mips=[tex[at+pos:at+pos+(w>>i)*(h>>i)] for i,pos in enumerate(offsets)]
  need(all(len(v)==(w>>i)*(h>>i) for i,v in enumerate(mips)),'mip length')
  palette=np.frombuffer(pal,dtype=np.uint8).reshape(256,3);rgb=palette[np.frombuffer(mips[0],dtype=np.uint8)];rgba=np.concatenate([rgb,np.full((len(rgb),1),255,dtype=np.uint8)],axis=1).tobytes()
  info=lump(6);need(len(info)%40==0,'texinfo alignment');flags=sorted({struct.unpack_from('<ii',info,k+32)[1] for k in range(0,len(info),40) if struct.unpack_from('<ii',info,k+32)[0]==rec['slot']})
  identity={'name':name,'dimensions':[w,h],'paletteSha256':sha(pal),'indexedSha256':sha(mips[0]),'rgbaSha256':sha(rgba),'mipIndexedSha256':[sha(x) for x in mips],'materialFlags':flags,'nativeSemantics':{'family':'ordinary-world','alphaIndex255':False,'fullbrightStart':224,'fullbrightMaskSha256':sha(bytes(255 if x>=224 else 0 for x in mips[0]))}}
  fullid=sha(json.dumps(identity,sort_keys=True,separators=(',',':')).encode())
  need(fullid==row['id']==item['nativeIdentity']['id'],'full native identity');need(original.size==(w,h) and original.tobytes()==rgba,'Low/native RGBA changed')
  for k in ('paletteSha256','rgbaSha256','mipIndexedSha256','materialFlags'):need(identity[k]==item['nativeIdentity'][k],'descriptor native '+k)
  need(identity['indexedSha256']==item['nativeIdentity']['indexedPixelSha256'],'indexed identity')
  observations.append({'game':rec['game'],'map':rec['map'],'slot':rec['slot'],'nativeId':fullid,'allFourMipSha256':identity['mipIndexedSha256'],'bspSha256':sha(b),'LowRgbaExact':True})
 return observations

def angles(a,b):
 v=np.degrees(np.arccos(np.clip(np.sum(a*b,axis=2),-1,1)));return {'mean':float(v.mean()),'p99':float(np.percentile(v,99)),'maximum':float(v.max())}
def close_dict(a,b):
 for k in a:need(abs(a[k]-b[k])<1e-9,'metric mismatch '+k)

def verify(item,native,tmp):
 name=item['name'];mp=ROOT/item['masterPackage'];master=load(mp);tp=ROOT/item['tierReceipt'];receipt=load(tp)
 need(fsha(mp)==item['masterPackageSha256'],'master receipt hash');need(fsha(tp)==item['tierReceiptSha256'],'tier receipt hash')
 inputs={r:ROOT/item[k] for r,k in [('original','original'),('generated','generated'),('prompt','prompt')]}
 for role,p in inputs.items():
  need(Path(master['inputs'][role]['file']).resolve()==p.resolve(),'input path');need(fsha(p)==master['inputs'][role]['sha256'],'input hash');need(fsha(p)==native[{'original':'originalSha256','generated':'rawSha256','prompt':'promptSha256'}[role]],'native proof input hash')
 raw=Image.open(inputs['generated']);original=Image.open(inputs['original']).convert('RGB');color=Image.open(mp.parent/master['color']['file']).convert('RGB');height=np.load(mp.parent/master['height']['file'],allow_pickle=False)
 need(raw.mode=='RGB' and raw.width>=original.width*8 and raw.height>=original.height*8 and raw.width*original.height==raw.height*original.width,'raw adequacy')
 need(color.size==(original.width*8,original.height*8)==tuple(master['masterDimensions']),'master dimensions')
 need(height.dtype in (np.float32,np.float64) and height.shape==(color.height,color.width) and np.isfinite(height).all() and 0<=height.min()<=height.max()<=1,'finite float relief')
 for r in ('color','height'):need(fsha(mp.parent/master[r]['file'])==master[r]['sha256'],'master '+r+' hash')
 for tool,rec in master['tools'].items():need(fsha(rec['file'])==rec['sha256'],'prepare tool binding '+tool)
 need(receipt['tools']['deriverSha256']==fsha(ROOT/'tools/texture_sheets/derive_texture_tiers.py'),'deriver identity');need(receipt['tools']['normalMathSha256']==fsha(ROOT/'tools/craft_normals.py'),'normal tool identity')
 for role,p in [('original',inputs['original']),('master',mp.parent/master['color']['file']),('heightMaster',mp.parent/master['height']['file'])]:
  need(Path(receipt['inputs'][role]['file']).resolve()==p.resolve() and receipt['inputs'][role]['sha256']==fsha(p),'tier input binding '+role)
 need(receipt['Low']=={'source':'original','unchanged':True,'sha256':fsha(inputs['original'])},'Low receipt')
 need(not any(p.name.lower().startswith('low') for p in tp.parent.iterdir()),'unexpected authored Low')
 need(item['generationCount']==master['generationCount']==1 and item['sourceReused'] is True,'generation count/reuse metadata')
 before={str(p):fsha(p) for p in inputs.values()}
 prep=run([ROOT/'tools/texture_sheets/prepare_texture_master.py','--original',inputs['original'],'--generated',inputs['generated'],'--prompt',inputs['prompt'],'--name',name,'--edition',item['edition'],'--profile','stone','--color-strength',str(master['registration']['colorStrength']),'--field-sigma',str(master['registration']['fieldSigma']),'--strength',str(receipt['strength']),'--cap',str(receipt['cap']),'--output',tmp/name])
 replay=load(tmp/name/'master.json');need(replay==master,'actual prepare replay receipt differs')
 for f in ('color.png','height.npy'):need((tmp/name/f).read_bytes()==(mp.parent/f).read_bytes(),'actual prepare replay bytes '+f)
 nativeobs=verify_native(native,item)
 tiers=[]
 for tier,factor in [('Mid',4),('High',8)]:
  rec=receipt['tiers'][tier];dims=(original.width*factor,original.height*factor);need(rec['factor']==factor and tuple(rec['dimensions'])==dims,'factor/dimensions');need(item['tiers'][tier]['factor']==factor and tuple(item['tiers'][tier]['dimensions'])==dims,'descriptor tier shape')
  h=O.float_box(height,dims)
  if color.size!=dims:
   by,bx=color.height//dims[1],color.width//dims[0];exact=height.astype('float64').reshape(dims[1],by,dims[0],bx).mean(axis=(1,3));need(float(np.abs(h-exact).max())<8e-8,'BOX differs from independent area mean')
  normals=O.cyclic_normals(h,strength=receipt['strength'],cap=receipt['cap']);normal8=np.round(np.clip(normals*.5+.5,0,1)*255).astype('uint8')
  expected={'diffuse':O.q92(O.periodic_rgb(color,dims)),'height':O.q92(Image.fromarray(np.round(h*255).astype('uint8')))}
  for c,role in enumerate(ROLES[2:]):expected[role]=O.q92(Image.fromarray(normal8[:,:,c]))
  outputs=[];decoded={}
  for role in ROLES:
   path=tp.parent/rec['outputs'][role]['file'];payload=path.read_bytes();meta=rec['outputs'][role];need(path.resolve()==(ROOT/item['tiers'][tier]['files'][role]).resolve(),'descriptor output path');need(payload==expected[role],'independent byte mismatch '+name+'/'+tier+'/'+role);need(meta['sha256']==sha(payload) and meta['bytes']==len(payload),'output receipt hash/bytes');need((meta['quality'],meta['method'],meta['lossless'])==(92,6,False),'codec metadata');need(meta['sourceMaster']==('master' if role=='diffuse' else 'heightMaster'),'authoring source');O.vp8_only(payload);im=Image.open(io.BytesIO(payload)).convert('RGB');need(im.size==dims and meta['dimensions']==list(dims),'decoded dimensions');decoded[role]=np.asarray(im,dtype=float);outputs.append({'role':role,'sha256':sha(payload),'bytes':len(payload),'exactIndependentQ92Method6Bytes':True,'lossyVP8Only':True})
  dn=np.stack([decoded[r][:,:,0] for r in ROLES[2:]],axis=2)/127.5-1;dn/=np.maximum(np.linalg.norm(dn,axis=2,keepdims=True),1e-12);dh=decoded['height'][:,:,0]/255;fromdh=O.cyclic_normals(dh,strength=receipt['strength'],cap=receipt['cap'])
  need(abs(rec['heightQuantizationCompressionMAE']-float(np.abs(dh-h).mean()))<1e-12,'height diagnostic');metrics={'authoredNormalVsDecodedXYZDegrees':angles(normals,dn),'decodedHeightNormalVsDecodedXYZDegrees':angles(fromdh,dn),'authoredNormalVsDecodedHeightDegrees':angles(normals,fromdh)}
  for k,m in metrics.items():close_dict(m,rec[k])
  distance=[];diffuse=Image.fromarray(decoded['diffuse'].astype('uint8'))
  for div in (2,4):
   size=(original.width//div,original.height//div);error=np.abs(np.asarray(original.resize(size,Image.Resampling.BOX),dtype=float)-np.asarray(diffuse.resize(size,Image.Resampling.BOX),dtype=float));r=next(x for x in rec['distanceChecks'] if x['divisor']==div);need(r=={'divisor':div,'dimensions':list(size),'meanAbsoluteError':float(error.mean()),'maximum':float(error.max())},'distance receipt');distance.append(r)
  wrong=O.cyclic_normals(dh,strength=receipt['strength'],cap=receipt['cap']);wrong8=np.round(np.clip(wrong*.5+.5,0,1)*255).astype('uint8');need(any(expected[r]!=O.q92(Image.fromarray(wrong8[:,:,c])) for c,r in enumerate(ROLES[2:])),'compressed height chaining not distinguished')
  tiers.append({'tier':tier,'factor':factor,'dimensions':list(dims),'outputs':outputs,'bothNativeAndReplacementBoxDistances':distance,'compressionDivergence':{'heightMAE':float(np.abs(dh-h).mean()),**metrics},'decodedHeightNormalChainingRejected':True})
 need({str(p):fsha(p) for p in inputs.values()}==before,'source changed during replay')
 return {'name':name,'nativeId':native['id'],'nativeOccurrences':nativeobs,'original':bind(inputs['original']),'raw':{**bind(inputs['generated']),'dimensions':list(raw.size),'adequateFor8x':True},'prompt':bind(inputs['prompt']),'masterReceipt':bind(mp),'tierReceipt':bind(tp),'masterDimensions':list(color.size),'height':{'dtype':str(height.dtype),'minimum':float(height.min()),'maximum':float(height.max()),'uniqueSamples':int(np.unique(height).size),'finite':True},'actualPrepareReplay':prep,'actualPrepareReceiptAndBothMasterBytesExact':True,'LowBytesAndNativeRgbaUnchanged':True,'tiers':tiers}

def main():
 started=datetime.datetime.now(datetime.timezone.utc).isoformat();report={'schemaVersion':1,'startedAt':started,'verdict':'HOLD verification incomplete','workspace':str(ROOT),'scope':'Exactly church1 and maya1_9 current opaque ordinary WORLD source/master/tier/review packages; no Hexen, material-art acceptance, runtime binding, campaign completeness, owner acceptance or release claim.','verifier':bind(__file__),'nativeProof':bind(NATIVE),'batchDescriptor':bind(BATCH/'batch-stones.json'),'independentTierOracle':bind(ROOT/'tests/hexen2_texture_tiers_test.py'),'environment':{'python':sys.version,'executable':sys.executable,'pillow':PIL.__version__,'numpy':np.__version__,'libwebp':features.version('webp')},'items':[],'limits':['Generation count and historical returned-source provenance are retained metadata; this run performs no generation or transcript authentication.','Native proof is a bounded fresh re-read of three retained stone BSP occurrences; it does not enumerate all game data.','Exact byte reproduction qualifies arithmetic/codec/provenance only; recognisable physical material, hierarchy, joins and owner/runtime acceptance are separate gates.']}
 try:
  batch=load(BATCH/'batch-stones.json');need([x['name'] for x in batch['items']]==['church1','maya1_9'],'scope');need((batch['defaultTier'],batch['tierFactors'],batch['quality'],batch['method'],batch['lossless'])==('Mid',{'Mid':4,'High':8},92,6,False),'batch policy');source={x['name']:x for x in load(NATIVE)['items']}
  with tempfile.TemporaryDirectory(prefix='quake-stones-independent-') as td:
   tmp=Path(td)
   for item in batch['items']:report['items'].append(verify(item,source[item['name']],tmp))
   review=run([ROOT/'tools/texture_sheets/build_texture_batch_review.py','--batch',BATCH/'batch-stones.json','--paths-root',ROOT,'--output',tmp/'review'])
   current=BATCH/'review-stones';expected={p.name for p in (tmp/'review').iterdir()};need({p.name for p in current.iterdir()}==expected,'review file set');files=[]
   for name in sorted(expected):
    p=current/name;need(p.read_bytes()==(tmp/'review'/name).read_bytes(),'review replay mismatch '+name);files.append({'file':str(p.relative_to(ROOT)),'sha256':fsha(p),'bytes':p.stat().st_size,'exactActualCliReplay':True})
   report['review']={'tool':bind(ROOT/'tools/texture_sheets/build_texture_batch_review.py'),'publicCliReplay':review,'files':files,'sheets':8,'index':1,'decodedDeliveredMapInputsVerified':True,'panels':'Each tier: unchanged native enlargement, decoded diffuse overview and 1:1 crop, aspect-preserving repeats, BOX reduction of both native/replacement at native/2 and native/4; decoded height, normalized decoded XYZ, two opposed lights. Complete current CLI byte replay matches all eight sheets and HTML.'}
  report['verdict']='PASS bounded actual source/master/tier/review public verification';report['counts']={'materials':2,'nativeOccurrences':3,'physicalTierMaps':20,'reviewSheets':8,'actualPrepareCliReplays':2,'actualReviewCliReplays':1}
 except Exception as e:
  report['verdict']='HOLD verification failure';report['failure']={'type':type(e).__name__,'message':str(e)}
 report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();OUT.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'report':str(OUT),'sha256':fsha(OUT),'verdict':report['verdict'],'failure':report.get('failure'),'counts':report.get('counts')},indent=2));return 0 if report['verdict'].startswith('PASS') else 1
if __name__=='__main__':sys.exit(main())
