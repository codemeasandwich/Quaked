"""Verify retained browser readbacks against visible receipt and actual inputs.
This does not reproduce the GPU shader or grant artistic/all-map acceptance.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
receipt=json.loads((OUT/'browser-receipt.json').read_text())
assert receipt['state']=='ready' and not receipt['shaderErrors']
assert all(row['passed'] for row in receipt['checks'])
inputs=[]
for rel,witness in receipt['inputs'].items():
 p=(ROOT/rel).resolve();assert p.is_relative_to(ROOT)
 assert sha(p.read_bytes())==witness['sha256']
 inputs.append({'file':rel,'sha256':witness['sha256']})
batch=json.loads((ROOT/receipt['batch']).read_text());items={i['name']:i for i in batch['items']}
image=lambda p:np.asarray(Image.open(p).convert('RGBA'))
packed={};arrays={}
for draw in receipt['draws']:
 k=(draw['name'],draw['tier'])
 if k not in packed:
  item=items[k[0]];paths=item['tiers'][k[1]]['files']
  n=np.stack([image(ROOT/paths[r])[:,:,0] for r in ['normalX','normalY','normalZ','height']],axis=2)
  packed[k]=sha(n.tobytes());arrays[k]=(image(ROOT/item['original']),image(ROOT/paths['diffuse']))
 assert draw['normalPackedSha256']==packed[k]

def comparison(draw):
 a,b=arrays[draw['name'],draw['tier']]
 if draw['view']!='close':
  divisor=2 if draw['view']=='half' else 4
  width,height=a.shape[1]//divisor,a.shape[0]//divisor
  def box(source):
   sy,sx=source.shape[0]//height,source.shape[1]//width
   sums=source.astype(np.uint64).reshape(height,sy,width,sx,4).sum(axis=(1,3))
   return ((sums*2+sx*sy)//(sx*sy*2)).astype(np.uint8)
  a,b=box(a),box(b)
 n=draw['repeat'];a=np.tile(a,(n,n,1));b=np.tile(b,(n,n,1))
 result=np.zeros((max(a.shape[0],b.shape[0]),a.shape[1]+b.shape[1],4),dtype=np.uint8)
 result[:a.shape[0],:a.shape[1]]=a;result[:b.shape[0],a.shape[1]:]=b
 return result
artifacts=[]
for p in sorted(OUT.glob('*-gpu.png')):
 a=image(p);digest=sha(a[::-1].tobytes());matches=[d for d in receipt['draws'] if d['framebufferRgbaBottomUpSha256']==digest]
 assert matches,('Unbound framebuffer',p.name)
 c=p.with_name(p.name[:-8]+'-comparison.png');actual=image(c)
 matched=[d for d in matches if np.array_equal(actual,comparison(d))]
 assert matched,('BOX/close comparison differs',c.name)
 for artifact in (p,c):artifacts.append({'file':str(artifact.relative_to(ROOT)),'sha256':sha(artifact.read_bytes())})
report={'verdict':'PASS','scope':'Retained browser GPU image bytes match actual WebGL framebuffer SHA; actual comparison pixels reconstructed with independent equal-area integer BOX; authored XYZ/height payload and all recorded input bytes independently checked. GPU shader reproduction and artistic/all-map/installed-loader acceptance are separate.','browser':receipt['webgl'],'recordedDraws':len(receipt['draws']),'recordedChecks':len(receipt['checks']),'inputs':inputs,'packedAuthoredNormals':[{'name':k[0],'tier':k[1],'sha256':v} for k,v in packed.items()],'artifacts':artifacts,'verifierSha256':sha(Path(__file__).read_bytes())}
(OUT/'public-artifact-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'verdict':report['verdict'],'inputs':len(inputs),'draws':len(receipt['draws']),'capturedPairs':len(artifacts)//2}))
