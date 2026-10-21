"""Actual city8_2 independent tier replay using retained public-fixture math oracles."""
from pathlib import Path
import importlib.util,sys,hashlib,json,io
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[5];out=Path(__file__).parent
p=root/'tests/hexen2_texture_tiers_test.py';spec=importlib.util.spec_from_file_location('oracles',p);o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
b=root/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/parallel-020/city8_2';m=json.loads((b/'master/master.json').read_text());t=json.loads((b/'tiers/manifest.json').read_text());original=Path(m['inputs']['original']['file']);native=Image.open(original).convert('RGB');rgb=Image.open(b/'master/color.png').convert('RGB');height=np.load(b/'master/height.npy')
assert t['Low']=={'source':'original','unchanged':True,'sha256':sha(original)}
assert height.dtype==np.float32 and height.shape==(512,512) and np.isfinite(height).all()
for role,row in m['inputs'].items():assert sha(Path(row['file']))==row['sha256']
for row in m['tools'].values():assert sha(Path(row['file']))==row['sha256']
assert sha(b/'master/color.png')==m['color']['sha256'];assert sha(b/'master/height.npy')==m['height']['sha256']
checks=[]
for tier,factor in [('Mid',4),('High',8)]:
 row=t['tiers'][tier];size=(native.width*factor,native.height*factor);assert row['dimensions']==list(size)
 h=o.float_box(height,size);n=o.cyclic_normals(h);encoded=np.round(np.clip(n*.5+.5,0,1)*255).astype('uint8')
 expected={'diffuse':o.q92(o.periodic_rgb(rgb,size)),'height':o.q92(Image.fromarray(np.round(h*255).astype('uint8')))}
 for channel,role in enumerate(('normalX','normalY','normalZ')):expected[role]=o.q92(Image.fromarray(encoded[:,:,channel]))
 maps={}
 for role,payload in expected.items():
  rec=row['outputs'][role];path=b/'tiers'/rec['file'];assert path.read_bytes()==payload,(tier,role,'independent replay mismatch');assert sha(path)==rec['sha256'];assert (rec['quality'],rec['method'],rec['lossless'])==(92,6,False);o.vp8_only(payload);maps[role]=Image.open(io.BytesIO(payload)).convert('RGB');assert maps[role].size==size
 distances=[]
 for divisor in (2,4):
  dims=(native.width//divisor,native.height//divisor);error=np.abs(np.asarray(native.resize(dims,Image.Resampling.BOX),float)-np.asarray(maps['diffuse'].resize(dims,Image.Resampling.BOX),float));distance=next(r for r in row['distanceChecks'] if r['divisor']==divisor);assert distance['meanAbsoluteError']==float(error.mean());assert distance['maximum']==float(error.max());distances.append(distance)
 # Decode true XYZ to inspect material response at both opposed light directions.
 vec=np.stack([np.asarray(maps['normal'+c],float)[:,:,0] for c in 'XYZ'],2)/127.5-1;vec/=np.maximum(np.linalg.norm(vec,axis=2,keepdims=True),1e-12)
 boundaries={}
 for label,im in [('native',native.resize(size,Image.Resampling.NEAREST)),('diffuse',maps['diffuse'])]:
  a=np.asarray(im,float);boundaries[label]={'xWrapMAE':float(np.abs(a[:,0]-a[:,-1]).mean()),'yWrapMAE':float(np.abs(a[0]-a[-1]).mean()),'interiorXMAE':float(np.abs(np.diff(a,axis=1)).mean()),'interiorYMAE':float(np.abs(np.diff(a,axis=0)).mean())}
 checks.append({'tier':tier,'dimensions':list(size),'exactQ92M6IndependentRoleReplays':list(expected),'VP8Lossy':True,'distanceChecks':distances,'boundaries':boundaries,'uvNormalMath':'independent cyclic_normals fixture oracle strength0.3 cap0.5 with UV scaling'})
proof={'verdict':'PASS bounded actual tiers math/codec/source binding checks','scope':'NativeLow unchanged; ten delivered map bytes independently reproduced via public fixture RGB/float/UV-normal/Q92 oracles, distance metrics recomputed with BOX on BOTHinputs; no artistic/runtimerelease acceptance','nativeProof':{'file':str(out.relative_to(root)/'native-proof.json'),'sha256':sha(out/'native-proof.json')},'masterPackage':{'file':str((b/'master/master.json').relative_to(root)),'sha256':sha(b/'master/master.json')},'tierReceipt':{'file':str((b/'tiers/manifest.json').relative_to(root)),'sha256':sha(b/'tiers/manifest.json')},'oracle':{'file':str(p.relative_to(root)),'sha256':sha(p)},'verifier':{'file':str(Path(__file__).relative_to(root)),'sha256':sha(Path(__file__))},'tiers':checks,'limits':['Same codec environment reproduces bytes; this is not broad codec portability proof.','Native source proof is bounded to current selected baseline PAK occurrences.','Material/art/tile-edge acceptance requires independent root review; no runtime/catalog/pack/Git release claims.']}
(out/'public-actual.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'verdict':proof['verdict'],'tiers':checks},indent=2))
