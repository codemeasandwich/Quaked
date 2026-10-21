from pathlib import Path
import json,hashlib,datetime
from PIL import Image
import numpy as np
O=Path(__file__).resolve().parent; R=O.parents[5]
p=json.loads((O/'inspection-provenance.json').read_text()); checks=[]
def check(label,a,b): checks.append({'check':label,'pass':bool(np.array_equal(np.asarray(a),np.asarray(b)))})
ims={k:Image.open(R/p['inputs'][k]['file']).convert('RGB') for k in ('native','r2','parent','materialReference')}
for k,im in ims.items():
 for n in (32,16):
  b=im.resize((n,n),Image.Resampling.BOX)
  check(f'{k} direct BOX{n}',b,Image.open(O/f'{k}-box{n}.png'))
  check(f'{k} BOX{n} nearest display',b.resize((512,512),Image.Resampling.NEAREST),Image.open(O/f'{k}-box{n}-nearest512.png'))
for n in (32,16):
 expected=np.concatenate([np.asarray(ims[k].resize((n,n),Image.Resampling.BOX).resize((512,512),Image.Resampling.NEAREST)) for k in ('native','r2')],axis=1)
 check(f'BOX{n} native/r2 panel',expected,Image.open(O/f'native-r2-box{n}-comparison.png'))
a=np.asarray(ims['r2'])
native=np.asarray(ims['native'])
check('native nearest display',ims['native'].resize((512,512),Image.Resampling.NEAREST),Image.open(O/'native-nearest512.png'))
check('native literal repeat nearest display',Image.fromarray(np.tile(native,(2,2,1))).resize((1024,1024),Image.Resampling.NEAREST),Image.open(O/'native-repeat2-nearest1024.png'))
check('native literal corners nearest display',Image.fromarray(np.roll(native,(32,32),(0,1))).resize((512,512),Image.Resampling.NEAREST),Image.open(O/'native-four-corners-nearest512.png'))
check('literal r2 repeat2',np.tile(a,(2,2,1)),Image.open(O/'r2-repeat2.png'))
check('literal r2 four corners',np.roll(a,(627,627),(0,1)),Image.open(O/'r2-four-corners.png'))
check('literal r2 X join',np.concatenate((a[:,-160:],a[:,:160]),1),Image.open(O/'r2-x-join.png'))
check('literal r2 Y join',np.concatenate((a[-160:],a[:160]),0),Image.open(O/'r2-y-join.png'))
for name,box in {'centre':(350,350,862,862),'lower-diagonal':(0,650,512,1162),'upper-network':(600,0,1112,512),'bottom-right':(742,742,1254,1254)}.items(): check(f'literal detail {name}',ims['r2'].crop(box),Image.open(O/f'r2-detail-{name}.png'))
for key,row in p['inputs'].items(): checks.append({'check':f'{key} current hash unchanged','pass':hashlib.sha256((R/row['file']).read_bytes()).hexdigest()==row['sha256']})
for row in p['diagnostics']: checks.append({'check':f"diagnostic hash {row['file']}",'pass':hashlib.sha256((R/row['file']).read_bytes()).hexdigest()==row['sha256']})
report={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pass':all(x['pass'] for x in checks),'checkCount':len(checks),'checks':checks,'scope':'Inspection pixel/hash provenance only; not artwork acceptance or master/tier/source custody proof.'}
(O/'inspection-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'pass':report['pass'],'checkCount':len(checks)}))
assert report['pass']
