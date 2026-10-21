"""Read-only exact native/retained source screen for this bounded intake."""
from pathlib import Path
from PIL import Image
import csv,datetime,hashlib,json
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-16-rtex020';A=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-16-rtex020';L=A.parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(R))
ID='e000f2f3924be87a02be5d0b90eb36fb8e1b1776a284d847eb7d3c360a3b4e4c';I=json.loads((D/'native-audit/inventory.json').read_text());t=next(x for x in I['variants']if x['id']==ID)
cp=L/'catalog.json';cb=cp.read_bytes();c=json.loads(cb);assert ID not in{x['id']for x in c['materials']}
q=next(x for x in csv.DictReader((R/'docs/hexen2/textures/world-queue.csv').open())if x['native_id']==ID);assert(q['category'],q['state'])==('ordinary','pending')
needles=[ID,t['rgbaSha256']];js=[];hits=[];selections=[]
for p in sorted(L.rglob('*.json')):
 if A in p.parents:continue
 b=p.read_bytes();s=b.decode('utf8');js.append({'file':rel(p),'sha256':hashlib.sha256(b).hexdigest()})
 if any(n in s for n in needles):hits.append(rel(p))
 if p.name=='selection.json':
  for item in json.loads(s).get('items',[]):
   if item.get('id')==ID:selections.append({'file':rel(p),'item':item})
images=[];matches=[];decoded=0
for p in sorted(L.rglob('*')):
 if not p.is_file()or A in p.parents or p.suffix.lower()not in('.png','.jpg','.jpeg','.webp'):continue
 with Image.open(p)as im:
  images.append({'file':rel(p),'sha256':sha(p),'dimensions':list(im.size),'mode':im.mode})
  if im.size==(64,128):
   decoded+=1;h=hashlib.sha256(im.convert('RGBA').tobytes()).hexdigest()
   if h==t['rgbaSha256']:matches.append({'file':rel(p),'sha256':sha(p),'rgbaSha256':h})
assert cp.read_bytes()==cb,'Catalog changed during screen: recheck current eligibility'
r={'schemaVersion':1,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'PASS ordinary missing target and retained-source screen; no exact native/retained photographic alias found','target':ID,'queueRow':q,'catalog':{'file':rel(cp),'sha256':hashlib.sha256(cb).hexdigest(),'bindings':len(c['materials'])},'nativeVariants':len(I['variants']),'nativeRgbaPeers':[{'id':v['id'],'name':v['name']}for v in I['variants']if v['rgbaSha256']==t['rgbaSha256']and v['id']!=ID],'retainedJsonFiles':len(js),'retainedIdOrRgbaJsonHits':hits,'priorSelectionItems':selections,'retainedImageMetadataFiles':len(images),'retained64x128ImagesDecoded':decoded,'retainedRgbaImageMatches':matches,'jsonInputs':js,'imageInputs':images,'limits':['Exact content matching only, not a visual similarity classifier. Larger photographic masters cannot be RGBA-identical to native dimensions.','Metadata/identity records screened across retained Hexen source library, excluding only this new intake root. No generation or binding is performed.']}
assert not r['nativeRgbaPeers']and not hits and not selections and not matches
(D/'eligibility-and-retained-source-screen.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:r[k]for k in ('verdict','retainedJsonFiles','retainedImageMetadataFiles','retained64x128ImagesDecoded')},indent=2));print(sha(D/'eligibility-and-retained-source-screen.json'))
