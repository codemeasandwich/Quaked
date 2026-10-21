from pathlib import Path
import json, hashlib, datetime
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[6]
OUT=Path(__file__).resolve().parent
A=ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-003/ground1_7'
paths={'native':A/'originals/native-ground1_7.png','r1':A/'revisions/r1/returned-source.png','parent':A/'generated/ground1_7-source-v1.png'}
ims={k:Image.open(p).convert('RGB') for k,p in paths.items()}
records=[]
def save(im,name,op):
 p=OUT/name; im.save(p); records.append({'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'dimensions':list(im.size),'operation':op})
for key,im in ims.items():
 for size in (32,16):
  b=im.resize((size,size),Image.Resampling.BOX)
  save(b,f'{key}-box{size}.png',{'input':key,'method':'Pillow Image.Resampling.BOX','dimensions':[size,size]})
  save(b.resize((512,512),Image.Resampling.NEAREST),f'{key}-box{size}-nearest512.png',{'input':key,'method':f'direct BOX{size}, nearest512 display only'})
save(ims['native'].resize((512,512),Image.Resampling.NEAREST),'native-nearest512.png',{'input':'native','method':'nearest display only'})
for size in (32,16):
 panel=Image.new('RGB',(1024,512))
 for x,key in ((0,'native'),(512,'r1')): panel.paste(ims[key].resize((size,size),Image.Resampling.BOX).resize((512,512),Image.Resampling.NEAREST),(x,0))
 save(panel,f'native-r1-box{size}-comparison.png',{'columns':['native','r1'],'method':f'direct BOX{size} on both, nearest512 display only'})
a=np.array(ims['r1']); h,w=a.shape[:2]
native=np.array(ims['native'])
save(Image.fromarray(np.tile(native,(2,2,1))).resize((1024,1024),Image.Resampling.NEAREST),'native-repeat2-nearest1024.png',{'input':'native','method':'literal 2x2 tile then nearest display only'})
save(Image.fromarray(np.roll(native,(32,32),(0,1))).resize((512,512),Image.Resampling.NEAREST),'native-four-corners-nearest512.png',{'input':'native','method':'literal half-size roll then nearest display only'})
save(Image.fromarray(np.tile(a,(2,2,1))),'r1-repeat2.png',{'input':'r1','method':'literal 2x2 tile, no resampling'})
save(Image.fromarray(np.roll(a,(h//2,w//2),(0,1))),'r1-four-corners.png',{'input':'r1','method':'literal half-size roll on both axes, no resampling'})
save(Image.fromarray(np.concatenate((a[:,-160:,:],a[:,:160,:]),axis=1)),'r1-x-join.png',{'input':'r1','method':'literal last160 columns then first160 columns'})
save(Image.fromarray(np.concatenate((a[-160:,:,:],a[:160,:,:]),axis=0)),'r1-y-join.png',{'input':'r1','method':'literal last160 rows then first160 rows'})
for label,box in {'centre':(350,350,862,862),'lower-diagonal':(0,650,512,1162),'upper-network':(600,0,1112,512)}.items():
 save(ims['r1'].crop(box),f'r1-detail-{label}.png',{'input':'r1','method':'literal crop at 1:1','box':list(box)})
def rec(p):
 row={'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
 try:
  im=Image.open(p);row.update(dimensions=list(im.size),mode=im.mode,format=im.format)
 except Exception: pass
 return row
sourceRecords={k:rec(p) for k,p in paths.items()}
for key,rel in {'issued':'revisions/r1/issued.json','retained':'revisions/r1/retained.json','primaryJournal':'selection.json'}.items(): sourceRecords[key]=rec(A/rel)
for key,rel in {'exactPrompt':'source-edit-r1-plan/prompt-r1.txt','exactPlan':'source-edit-r1-plan/plan.json','independentPlan':'source-edit-r1-independent-plan/review.json'}.items(): sourceRecords[key]=rec(OUT.parent/rel)
report={'schemaVersion':1,'reviewer':'/root/quake_ground_r1_art','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'Actual native/source bytes independently loaded. BOX32 and BOX16 applied identically to native and actual r1. Nearest views are display-only. Repeat/join/corner views are literal pixel concatenations/rolls; no authoring modifications. Parent viewed only for edit-invariant comparison.','inputs':sourceRecords,'diagnostics':records,'checks':{'nativeHashMatchesPlan':sourceRecords['native']['sha256']=='0aa62042b9f5d02db409eecef8315098da85cfc5061ceeb7f49376dfae867d5a','r1HashMatchesDelegation':sourceRecords['r1']['sha256']=='bb9671b182127aed4fb94bfd6aa8df42ebd8c9fee7ea251aed69909ed1e91f0d','parentHashMatchesPlan':sourceRecords['parent']['sha256']=='0ee396b24e4e9afd3fdfa2b5f523e26b098be0cd9805706b03d1fef0c7cb3fa5'}}
(OUT/'inspection-provenance.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'inputs':sourceRecords,'checks':report['checks']},indent=2))
