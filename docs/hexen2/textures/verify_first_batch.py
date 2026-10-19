"""Independent first-two Hexen art public-file checks; never edits maps or runtime.
Run with the bundled Python/Pillow/Numpy runtime. Numeric metrics are diagnostics,
not visual acceptance. Original source PAK pixels and all Q92 bytes are checked.
"""
import hashlib, io, json, math, re, struct, sys, datetime, subprocess, threading, socketserver, http.server, urllib.request, functools
from pathlib import Path
from html.parser import HTMLParser
import numpy as np
from PIL import Image, features
import PIL
ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19'
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'docs/hexen2/textures/first-batch-public-verification.json'
assert not OUT.exists(), 'Never overwrite earlier verification evidence'
sha=lambda b:hashlib.sha256(b).hexdigest()
def witness(p):
 p=Path(p);b=p.read_bytes();return {'path':str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p),'sha256':sha(b),'bytes':len(b)}
def jsonread(p):return json.loads(Path(p).read_text())
def image(p):return Image.open(p).convert('RGB')
def encoded(im):
 b=io.BytesIO();im.save(b,'WEBP',quality=92,lossless=False,method=6);return b.getvalue()
def physical(s):return ROOT/s
sys.path.insert(0,str(ROOT/'tools'))
from craft_normals import craft,profile_for,normals_from_height
REPORT={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'First-two offline Hexen photographic map source/codec/math/public-preview verification','checks':[],'materials':[],'limits':['No visual-art acceptance from MAE or seam metrics; independent visual review remains required.','No Hexen runtime binding, gameplay, GPU lighting, app launch, or mesh-displacement acceptance.','XYZ recipe uses unsmoothed decoded height; current engine crafted-height helper additionally smooths. No false mathematical equality between those separate paths is asserted.','Generator provenance is retained raw image/prompt plus finishing hashes, not independent proof of the image-generation service invocation.']}
def check(name,fn):
 result=fn();REPORT['checks'].append({'name':name,'status':'PASS'});return result
class Refs(HTMLParser):
 def __init__(self):super().__init__();self.urls=[]
 def handle_starttag(self,tag,attrs):
  for k,v in attrs:
   if k in ['href','src']:self.urls.append(v)
def seam(a):
 a=np.asarray(a,dtype=float)
 if a.ndim==2:a=a[:,:,None]
 x=float(np.abs(a[:,-1]-a[:,0]).mean());y=float(np.abs(a[-1]-a[0]).mean());ix=float(np.abs(np.diff(a,axis=1)).mean());iy=float(np.abs(np.diff(a,axis=0)).mean())
 return {'wrapXMean':x,'wrapYMean':y,'interiorXMean':ix,'interiorYMean':iy,'wrapToInteriorX':x/max(ix,1e-12),'wrapToInteriorY':y/max(iy,1e-12)}
def normal_math(height,strength,cap):
 # Independent explicit weighted cyclic Scharr derivative, not craft's normal helper.
 h,w=height.shape;pad=np.pad(height,((1,1),(1,1)),mode='wrap')
 gx=(3*(pad[1:-1,2:]-pad[1:-1,:-2])+(pad[:-2,2:]-pad[:-2,:-2])+(pad[2:,2:]-pad[2:,:-2]))/20
 gy=(3*(pad[2:,1:-1]-pad[:-2,1:-1])+(pad[2:,:-2]-pad[:-2,:-2])+(pad[2:,2:]-pad[:-2,2:]))/20
 sx,sy=-gx*strength*math.sqrt(h*w)/8,-gy*strength*math.sqrt(h*w)/8
 soft=1/np.sqrt(1+(np.sqrt(sx*sx+sy*sy)/cap)**2);sx*=soft;sy*=soft
 n=np.stack([sx,sy,np.ones_like(sx)],axis=2);return n/np.linalg.norm(n,axis=2,keepdims=True)
def verify():
 manifest=jsonread(BASE/'manifest.json');inv=jsonread(ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json')
 assert manifest['family']=='hexen2' and manifest['dimensionFactor']==4 and manifest['quality']==92 and manifest['lossless'] is False
 assert {i['name'] for i in manifest['items']}=={'rtex337','rtex450'}
 tracked=[BASE/'manifest.json',BASE/'index.html',Path(__file__),ROOT/'tools/craft_normals.py',ROOT/'tools/texture_sheets/encode_official_maps.py',ROOT/'tools/texture_sheets/finish_official_texture.py',ROOT/'src/newer/render/normal_math.js',ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json']
 for i in manifest['items']:
  for k in ['original','prompt','generated','finishingReceipt','encodingReceipt','preview','reliefPreview']:tracked.append(BASE/i[k])
  tracked += [BASE/m['file']for m in i['outputMaps'].values()]
 receipts=[jsonread(BASE/i['encodingReceipt']) for i in manifest['items']]
 tracked += [physical(e['authoringDiffuse'])for e in receipts]
 if (BASE/'register_rtex337.py').exists():tracked.append(BASE/'register_rtex337.py')
 before={str(p):sha(p.read_bytes())for p in tracked}
 # Pin whole archives afresh, then independently read selected exact native slots.
 directories={}
 for archive in inv['archives']:
  p=Path(archive['path']);h=hashlib.sha256()
  with p.open('rb')as f:
   while b:=f.read(1024*1024):h.update(b)
   f.seek(0);magic,off,size=struct.unpack('<4sII',f.read(12));assert magic==b'PACK';f.seek(off);raw=f.read(size)
  assert h.hexdigest()==archive['sha256'];entries={}
  for at in range(0,len(raw),64):
   name=raw[at:at+56].split(b'\0')[0].decode('ascii').lower();pos,n=struct.unpack_from('<II',raw,at+56);entries.setdefault(name,(pos,n))
  directories[str(p)]=entries
 REPORT['actualPAKs']=inv['archives']
 def member(p,name):
  off,n=directories[p][name]
  with open(p,'rb')as f:f.seek(off);b=f.read(n)
  assert len(b)==n;return b,off
 pal,paloff=member('/Users/bri/quaked/Hexen 2/data1/pak0.pak','gfx/palette.lmp');assert len(pal)==768
 for item,e in zip(manifest['items'],receipts):
  v=next(v for v in inv['variants']if v['id']==item['nativeIdentity']['id'])
  for k,val in item['nativeIdentity'].items():assert val==v[k],(item['name'],k)
  assert item['sourceOccurrences']==v['provenance']
  native=image(BASE/item['original']);assert list(native.size)==[v['width'],v['height']]
  assert sha(Image.open(BASE/item['original']).convert('RGBA').tobytes())==v['rgbaSha256']
  cache={}
  for occurrence in v['provenance']:
   key=(occurrence['source'],occurrence['map'])
   if key not in cache:cache[key]=member(*key)
   b,off=cache[key];assert off==occurrence['memberOffset'] and sha(b)==occurrence['bspSha256'] and struct.unpack_from('<i',b)[0]==29
   texoff,texsize=struct.unpack_from('<II',b,4+2*8);count=struct.unpack_from('<i',b,texoff)[0];slot=occurrence['slot'];assert 0<=slot<count
   m=texoff+struct.unpack_from('<i',b,texoff+4+4*slot)[0];name=b[m:m+16].split(b'\0')[0].decode('ascii');w,h=struct.unpack_from('<II',b,m+16);first=struct.unpack_from('<I',b,m+24)[0]
   ix=b[m+first:m+first+w*h];rgb=np.frombuffer(pal,dtype=np.uint8).reshape(256,3)[np.frombuffer(ix,dtype=np.uint8)]
   rgba=np.concatenate([rgb,np.full((len(rgb),1),255,dtype=np.uint8)],axis=1)
   assert (name,w,h)==(v['name'],v['width'],v['height']);assert sha(ix)==v['indexedPixelSha256'] and sha(rgba.tobytes())==v['rgbaSha256'] and sha(pal)==v['paletteSha256']
  assert e['factor']==4 and e['quality']==92 and e['lossless']is False and e['normalLayout']=='channels'
  assert sha(physical(e['original']).read_bytes())==e['originalSha256'] and sha(physical(e['authoringDiffuse']).read_bytes())==e['authoringDiffuseSha256']
  assert e['toolSha256']==sha((ROOT/'tools/texture_sheets/encode_official_maps.py').read_bytes()) and e['heightToolSha256']==sha((ROOT/'tools/craft_normals.py').read_bytes())
  finishing=jsonread(BASE/item['finishingReceipt'])
  if item['name']=='rtex337':
   assert item['finishingReceipt']=='rtex337-photographic-v2.json' and item['encodingReceipt']=='base/rtex337-v2.json','Require reviewed source-registered v2 successor'
   assert finishing['recipe']=='measured horizontal registration through existing transposed vertical-landmark route' and finishing['landmarkAxis']=='x'
   for p,hsh in finishing['inputs'].items():assert sha(physical(p).read_bytes())==hsh
   assert finishing['outputSha256']==sha((BASE/finishing['output']).read_bytes())==e['authoringDiffuseSha256']
   assert finishing['registrationScriptSha256']==sha((BASE/'register_rtex337.py').read_bytes())
   assert finishing['finisherSha256']==sha((ROOT/'tools/texture_sheets/finish_official_texture.py').read_bytes())
   tracked.append(BASE/'register_rtex337.py')
  else:
   for pathkey,hashkey in [('original','originalSha256'),('generated','generatedSha256'),('output','outputSha256')]:assert sha(physical(finishing[pathkey]).read_bytes())==finishing[hashkey]
   assert finishing['toolSha256']==sha((ROOT/'tools/texture_sheets/finish_official_texture.py').read_bytes())
  profile={**profile_for(e['name']),'strength':e['profile']['strength'],'cap':e['profile']['cap']};assert json.loads(json.dumps(profile))==e['profile']
  maps={};maprecords=[]
  for role,record in item['outputMaps'].items():
   p=BASE/record['file'];b=p.read_bytes();assert len(b)==record['bytes']==e['outputs'][role]['bytes'] and sha(b)==record['sha256']==e['outputs'][role]['sha256']
   assert str(p.relative_to(ROOT))==e['outputs'][role]['file'];assert b[:4]==b'RIFF'and b[8:12]==b'WEBP'and struct.unpack_from('<I',b,4)[0]+8==len(b)
   chunks=[];at=12
   while at<len(b):
    kind=b[at:at+4];n=struct.unpack_from('<I',b,at+4)[0];assert at+8+n<=len(b);chunks.append(kind.decode('ascii'));at+=8+n+(n%2)
   assert at==len(b) and 'VP8 'in chunks and 'VP8L'not in chunks
   im=image(p);assert im.size==(v['width']*4,v['height']*4) and list(im.size)==record['dimensions'];maps[role]=im
   maprecords.append({**witness(p),'role':role,'codecChunks':chunks,'dimensions':list(im.size),'quality92Proof':'exact encoded byte replay with quality92, losslessFalse, method6'})
  diffuse=maps['diffuse'];assert encoded(image(physical(e['authoringDiffuse'])))==(BASE/item['outputMaps']['diffuse']['file']).read_bytes()
  height,_=craft(np.asarray(diffuse,dtype=float)/255,profile)
  assert encoded(Image.fromarray(np.round(height*255).astype('uint8')))==(BASE/item['outputMaps']['height']['file']).read_bytes()
  H=np.asarray(maps['height'])[:,:,0].astype(float)/255;n=normal_math(H,profile['strength'],profile['cap'])
  _,producerNormal=normals_from_height(H,profile['strength'],profile['cap'])
  floatDifference=float(np.abs(n-producerNormal).max());assert floatDifference<=4*np.finfo(float).eps,'Independent normal equation differs beyond floating operation order'
  independentPixels=np.round(np.clip(n*.5+.5,0,1)*255).astype('uint8')
  expected=np.round(np.clip(producerNormal*.5+.5,0,1)*255).astype('uint8')
  normalEquation={'maximumFloatDelta':floatDifference,'machinePrecisionBound':float(4*np.finfo(float).eps),'independentQuantizationTieDifferences':int(np.count_nonzero(independentPixels!=expected)),'exactByteReplay':'unchanged source-hash-pinned production helper; alternate independent derivative equation verified separately'}
  for ch,role in enumerate(['normalX','normalY','normalZ']):assert encoded(Image.fromarray(expected[:,:,ch]))==(BASE/item['outputMaps'][role]['file']).read_bytes()
  actual=np.stack([np.asarray(maps[r],dtype=float)[:,:,0]for r in ['normalX','normalY','normalZ']],axis=2)/127.5-1;actual/=np.maximum(np.linalg.norm(actual,axis=2,keepdims=True),1e-8)
  angular=np.degrees(np.arccos(np.clip((actual*n).sum(axis=2),-1,1)));angles={'normalAngularMean':float(angular.mean()),'normalAngularP99':float(np.percentile(angular,99)),'normalAngularMaximum':float(angular.max())}
  for k,val in angles.items():assert abs(val-e[k])<1e-10,(k,val,e[k])
  distance=[]
  for div,key,maxkey,dimkey in [(2,'distanceMAE','distanceMaximum','comparisonDimensions'),(4,'secondaryDistanceMAE','secondaryDistanceMaximum','secondaryComparisonDimensions')]:
   size=(max(1,v['width']//div),max(1,v['height']//div));error=np.abs(np.asarray(native.resize(size,Image.Resampling.BOX),dtype=float)-np.asarray(diffuse.resize(size,Image.Resampling.BOX),dtype=float));mae=float(error.mean());maximum=float(error.max())
   assert list(size)==e[dimkey]==item['distanceDiagnostics'][dimkey]and mae==e[key]==item['distanceDiagnostics'][key] and maximum==e[maxkey]
   distance.append({'divisor':div,'dimensions':list(size),'MAE':mae,'maximum':maximum,'nativeSeam':seam(native.resize(size,Image.Resampling.BOX)),'replacementSeam':seam(diffuse.resize(size,Image.Resampling.BOX))})
  REPORT['materials'].append({'name':item['name'],'nativeIdentity':item['nativeIdentity'],'sourceOccurrencesVerified':len(v['provenance']),'scope':item['edition'],'maps':maprecords,'Q92ReplayAllFiveByteExact':True,'distance':distance,'angularDegrees':angles,'independentNormalEquation':normalEquation,'decodedDiffuseSeamDiagnostics':seam(diffuse),'decodedHeightSeamDiagnostics':seam(maps['height']),'artVerdict':'not assigned by numerical verification'})
 check('Actual PAK/native palette/slot identities and all10 4xQ92 maps; five byte replays each and independent distance/normal equations',lambda:True)
 html=(BASE/'index.html').read_text();parser=Refs();parser.feed(html);assert '<script'not in html.lower();refs=set(parser.urls+re.findall(r'url\(([^)]+)\)',html));REPORT['previewReferences']=[]
 for ref in sorted(refs):
  assert not re.match(r'^[a-z]+:',ref,re.I)and not ref.startswith('/')and '..'not in Path(ref).parts
  p=(BASE/ref).resolve();assert p.is_relative_to(BASE.resolve())and p.is_file();REPORT['previewReferences'].append(witness(p))
 assert {i['original']for i in manifest['items']}<=refs and {i['outputMaps']['diffuse']['file']for i in manifest['items']}<=refs
 check('Static public preview href/src/CSS references resolve to exact authoring files; no runtime scripts',lambda:True)
 class QuietHandler(http.server.SimpleHTTPRequestHandler):
  def log_message(self,*args):pass
 class NumericLoopback(http.server.ThreadingHTTPServer):
  def server_bind(self):
   socketserver.TCPServer.server_bind(self);self.server_name,self.server_port=self.server_address[:2]
 server=NumericLoopback(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(BASE)));thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();REPORT['httpPreview']={'bind':'127.0.0.1','port':server.server_port,'requests':[]}
 try:
  opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
  for ref in ['index.html',*sorted(refs)]:
   with opener.open('http://127.0.0.1:'+str(server.server_port)+'/'+ref,timeout=5)as response:
    b=response.read(8*1024*1024);assert response.status==200 and b==(BASE/ref).read_bytes()
   REPORT['httpPreview']['requests'].append({'path':ref,'status':200,'bytes':len(b),'sha256':sha(b)})
 finally:server.shutdown();server.server_close();thread.join(5);assert not thread.is_alive();REPORT['httpPreview']['cleanup']='owned thread joined and socket closed; no process cancellation'
 check('Actual loopback HTTP preview and every referenced local image/receipt return exact bytes',lambda:True)
 # HEAD comparisons are scoped: concurrent renderer edits belong to another lane.
 runtimePaths=['assets/game/textures/index.json','assets/layout.json','tools/distribution/manifest.mjs']
 REPORT['runtimeIsolation']=[]
 for rel in runtimePaths:
  p=ROOT/rel;old=subprocess.check_output(['git','show','HEAD:'+rel],cwd=ROOT,timeout=15);assert old==p.read_bytes(),rel+'changed'
  assert b'hexen2-world-2026-10-19'not in p.read_bytes();REPORT['runtimeIsolation'].append(witness(p))
 check('Quake texture index, resource layout and distribution catalogue exactly HEAD with no Hexen trial binding',lambda:True)
 assert all(sha(Path(p).read_bytes())==h for p,h in before.items()),'Inputs changed during verification'
 REPORT['inputs']=[witness(p)for p in tracked];REPORT['inputsStable']=True;REPORT['versions']={'Python':sys.version,'Pillow':PIL.__version__,'Numpy':np.__version__,'WebP':features.version('webp')}
 REPORT['verdict']='PASS public-file source/codec/math checks; visual and runtime acceptance separate'
try:verify()
except Exception as e:
 REPORT['verdict']='HOLD';REPORT['error']=repr(e);raise
finally:
 REPORT['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();OUT.write_text(json.dumps(REPORT,indent=2)+'\n');print(json.dumps({'verdict':REPORT['verdict'],'receipt':str(OUT),'sha256':sha(OUT.read_bytes())}))
