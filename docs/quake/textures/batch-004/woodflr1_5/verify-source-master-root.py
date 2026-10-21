"""Bounded independent actual source/master replay; no art or tier acceptance."""
from pathlib import Path
import json,hashlib,sys,io,datetime
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[5]
sys.path.insert(0,str(ROOT/'tools/texture_sheets'))
from prepare_texture_master import finish,craft,landmarks_from
sha=lambda b:hashlib.sha256(b).hexdigest()
watched={}
def read(p):
 p=Path(p).resolve();p.relative_to(ROOT);b=p.read_bytes()
 assert p not in watched or watched[p]==sha(b)
 watched[p]=sha(b);return b
def bound(p):p=Path(p).resolve();return {'file':str(p),'sha256':sha(read(p))}
proof_path=ROOT/'docs/quake/textures/batch-004/native-source-proof.json';native_proof=json.loads(read(proof_path));rows=[]
for native in [x for x in native_proof['materials'] if x['name']=='woodflr1_5']:
 name=native['name'];base=ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-004'/name
 package=base/'master/master.json';m=json.loads(read(package))
 assert m['generationCount']==1 and m['canonicalMasterFactor']==8 and m['nativeDimensions']==[64,64]
 sources={}
 for role,b in m['inputs'].items():
  data=read(b['file']);assert sha(data)==b['sha256'];sources[role]=data
 assert sha(sources['original'])==native['originalSha256']
 original=Image.open(io.BytesIO(sources['original'])).convert('RGB');photo=Image.open(io.BytesIO(sources['generated'])).convert('RGB')
 assert photo.width>=512 and photo.height>=512 and photo.width==photo.height
 reg=m['registration'];assert reg['method']=='photographic'and not reg['edgeAnchor']
 measured=landmarks_from(sources['landmarks'],original)if'landmarks'in sources else None;axis=measured['axis']if measured else None
 assert axis==reg['axis']
 a,b=original,photo
 if axis=='x':a=a.transpose(Image.Transpose.TRANSPOSE);b=b.transpose(Image.Transpose.TRANSPOSE)
 rgb,_=finish(a,b,factor=8,vertical_landmarks=measured['points']if measured else None,comparison_divisor=2,method='photographic',color_strength=reg['colorStrength'],field_sigma=reg['fieldSigma'])
 if axis=='x':rgb=rgb.transpose(Image.Transpose.TRANSPOSE)
 color_path=package.parent/m['color']['file'];actual_rgb=read(color_path);stream=io.BytesIO();rgb.save(stream,'PNG');assert stream.getvalue()==actual_rgb and sha(actual_rgb)==m['color']['sha256']
 scalar,_=craft(np.asarray(rgb,dtype=float)/255,m['height']['profile'],quantize_height=False);stream=io.BytesIO();np.save(stream,scalar.astype('float32'),allow_pickle=False)
 scalar_path=package.parent/m['height']['file'];actual_scalar=read(scalar_path);assert stream.getvalue()==actual_scalar and sha(actual_scalar)==m['height']['sha256']
 assert np.isfinite(scalar).all()and scalar.min()>=0 and scalar.max()<=1
 for b in m['tools'].values():assert sha(read(b['file']))==b['sha256']
 journal=base/'selection.json';j=json.loads(read(journal));entry=next(i for i in j['items']if i['id']==native['nativeIdentity'])
 assert entry['generationCount']==1 and entry['generationState']=='generated-retained'
 assert entry['generatedSha256']==sha(sources['generated'])and entry['promptSha256']==sha(sources['prompt'])
 rows.append({'nativeIdentity':native['nativeIdentity'],'name':name,'edition':m['edition'],'sourceMasterOnly':True,'verdict':'PASS exact initial source/master replay; physical relief/art/tier acceptance separate','masterPackage':bound(package),'sourceInputs':[{'role':role,**b}for role,b in m['inputs'].items()],'producerBindings':m['tools'],'replayedProfileExact':m['height']['profile'],'storedMasterRGB':bound(color_path),'storedMasterScalar':bound(scalar_path),'original':native['original'],'originalSha256':native['originalSha256'],'dimensions':[512,512],'journal':bound(journal)})
assert all(sha(p.read_bytes())==h for p,h in watched.items())
report={'verdict':'PASS source/master only','scope':'One selected actual batch004 woodflr1_5 initial opaque source/master package; exact native/RGB/float scalar/producer/journal bindings, source replay. SourceMasterOnly; no material/physical plane/tier or runtime acceptance.','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verifier':bound(__file__),'nativeProof':bound(proof_path),'materials':rows,'watchedInputs':[{'file':str(p),'sha256':h}for p,h in watched.items()]}
(ROOT/'docs/quake/textures/batch-004/woodflr1_5/root-source-master-public.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'verdict':'PASS source/master only','materials':len(rows),'watchedInputs':len(watched)}))
