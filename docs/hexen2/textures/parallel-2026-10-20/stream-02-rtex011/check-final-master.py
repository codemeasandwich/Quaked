"""Author pre-tier custody/semantic check using documented float64 composition order."""
from pathlib import Path
import json,hashlib,sys,io
import numpy as np
from PIL import Image
R=Path.cwd();B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-02-rtex011';D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-02-rtex011';old=B/'masters-registered/rtex011';new=B/'masters-layered/rtex011';p=json.loads((D/'rivet-layer-proposal.json').read_text());mp=json.loads((old/'master.json').read_text());sys.path.insert(0,str(R/'tools/texture_sheets'));from prepare_layered_texture_master import compose_layered,craft
h=np.load(new/'height.npy',allow_pickle=False);color=Image.open(old/'color.png').convert('RGB');detail,_=craft(np.asarray(color,dtype=float)/255,mp['height']['profile'],quantize_height=False)
assert np.array_equal(detail.astype('float32'),np.load(old/'height.npy',allow_pickle=False))
expected,mask,sigma=compose_layered(detail,p['layering']);assert h.dtype==np.float32 and np.isfinite(h).all() and np.array_equal(h,expected)
assert(new/'color.png').read_bytes()==(old/'color.png').read_bytes();assert h[mask>.5].max()<h[mask<=.5].min();assert np.all(mask[[0,-1],:]==1)and np.all(mask[:,[0,-1]]==1)
profiles={}
for row in p['heads']:
 x,y=map(int,row['masterCentre']);r=row['masterRadii'][0];v=[float(h[y,int(round(x+r*t))])for t in(0,.25,.5,.75,.9,1.1)];assert v[0]>.65 and v[2]>v[3]>.4 and v[4]<.4 and v[5]<.32;profiles[row['name']]=v
r={'verdict':'PASS author pre-tier actual successor custody/physical self-check; independent final source/math/codec/ART pending','sourceMasterPackageSha256':hashlib.sha256((old/'master.json').read_bytes()).hexdigest(),'finalMasterPackageSha256':hashlib.sha256((new/'master.json').read_bytes()).hexdigest(),'RGBByteIdentical':True,'floatHeightExactReviewedPolicy':True,'precisionOrder':'craft float64 -> ordered planes and microrelief float64 -> one final float32 cast','finiteFloat32':True,'plateRange':[float(h[mask>.5].min()),float(h[mask>.5].max())],'headRange':[float(h[mask<=.5].min()),float(h[mask<=.5].max())],'allEightRightRadialProfiles':profiles,'radialFractions':[0,.25,.5,.75,.9,1.1],'allPerimeterPixelsClassifiedPlate':True,'noPerimeterBevel':True,'heightSha256':hashlib.sha256((new/'height.npy').read_bytes()).hexdigest(),'initialCheckFailure':'pre-tier-self-check-initial-failure.json retained; oracle used rounded float32 initial, now corrected to actual documented full-precision order. Maximum difference5.960464477539063e-08, no material-policy or visual acceptance changed.'};assert not(D/'pre-tier-final-self-check.json').exists();(D/'pre-tier-final-self-check.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
