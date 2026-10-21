from pathlib import Path
import hashlib,json,struct,datetime
from PIL import Image
O=Path(__file__).resolve().parent; d=json.loads((O/'native-intake.json').read_text());checks=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
def check(v,name):checks.append({'pass':bool(v),'name':name})
def member(r):
 p=Path(r['pack']);b=p.read_bytes();off,l=struct.unpack_from('<II',b,4);rows=[b[i:i+64] for i in range(off,off+l,64)];row=rows[r['directoryIndex']];at,n=struct.unpack_from('<II',row,56);check((at,n)==(r['offset'],r['bytes']),'retained offset/length is actual PAK directory entry');out=b[at:at+n];check(sha(out)==r['sha256'],'actual member SHA256');return out
for name,rows in d['occurrences'].items():
 for row in rows:member(row)
model=member(d['effectiveModel']);palette=member(d['effectivePalette']);s=d['skinGroups'][0]['images'][0];indices=model[s['offset']:s['offset']+s['indexedBytes']]
idx=Image.open(s['indexedPNG']['file']);rgba=Image.open(s['rgbaPNG']['file']);check(idx.mode=='P' and idx.tobytes()==indices,'unchanged native index PNG exact bytes');check(bytes(idx.getpalette()[:768])==palette,'unchanged native PNG palette exact bytes');check(sha(indices)==s['indexedSha256'],'indexed sample SHA256');expected=bytes(v for i in indices for v in (*palette[i*3:i*3+3],255));check(rgba.tobytes()==expected,'opaque raw RGBA exact native palette expansion');check(sha(expected)==s['rgbaSha256'],'raw RGBA SHA256');check(idx.size==(264,194),'native dimensions264x194');check(model[:4]==b'IDPO' and struct.unpack_from('<i',model,4)[0]==6,'native MDL6 header');check(d['parse']['endOffset']==len(model),'all skin/geometry/147 frame payloads end exactly at member EOF')
for category in ('mounts','existingAssets','sourceBindings','diagnosticFiles'):
 for r in d[category]:check(sha(Path(r['file']).read_bytes())==r['sha256'],'current unchanged '+r['file'])
pub=json.loads((O/'public-loader-verification.json').read_text());check(pub['pass'] and pub['sourceModelSHA256']==d['effectiveModel']['sha256'],'actual public loader binds same native identity');check(pub['nativeRawRGBA_SHA256']==s['rgbaSha256'],'public-loader raw native palette expansion matches independent extraction')
report={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pass':all(c['pass'] for c in checks),'checkCount':len(checks),'checks':checks,'scope':'Native source/extraction/hash/current dependency evidence only, not art/8x/model-render/runtime/owner qualification'}
(O/'native-proof-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'pass':report['pass'],'checks':len(checks)}));assert report['pass']
