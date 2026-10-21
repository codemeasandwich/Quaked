from pathlib import Path
import json,hashlib,datetime
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path('/Users/bri/SOURCE/Quaked');B=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008';O=Path('/private/tmp/h2-batch008-first-four-art');O.mkdir(exist_ok=False)
b=json.loads((B/'batch-first-four.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rows=[]
for item in b['items']:
 n=Image.open(ROOT/item['original']).convert('RGB'); mp=ROOT/item['masterPackage']; m=json.loads(mp.read_text());tr=ROOT/item['tierReceipt'];t=json.loads(tr.read_text());assert sha(mp)==item['masterPackageSha256'];assert sha(tr)==item['tierReceiptSha256'];assert sha(ROOT/item['original'])==m['inputs']['original']['sha256'];assert m['generationCount']==1
 h=np.load(mp.parent/m['height']['file'],allow_pickle=False); assert h.dtype==np.float32 and h.shape==(n.height*8,n.width*8) and np.isfinite(h).all(); assert np.unique(h).size>256
 row={'name':item['name'],'nativeID':item['nativeIdentity']['id'],'nativeSha256':sha(ROOT/item['original']),'masterPackageSha256':sha(mp),'tierReceiptSha256':sha(tr),'uniqueHeightSamples':int(np.unique(h).size),'tiers':{}}
 s=Image.new('RGB',(1600,1250),(28,30,33));d=ImageDraw.Draw(s);d.text((10,5),item['name']+' unchangedLow | decodedMid | decodedHigh; half/quarter comparisons, repeats and cyclicoffset',fill='white')
 disp=(256,512) if n.height!=n.width else (512,512);s.paste(n.resize(disp,Image.Resampling.NEAREST),(8,28));
 rel=Image.new('RGB',(1600,1100),(28,30,33));dr=ImageDraw.Draw(rel)
 for ti,(tier,q) in enumerate(item['tiers'].items()):
  ims={role:Image.open(ROOT/path).convert('RGB') for role,path in q['files'].items()};a=ims['diffuse']; expected=(n.width*q['factor'],n.height*q['factor']);assert a.size==expected
  maps={}
  for role,path in q['files'].items():
   p=ROOT/path;assert sha(p)==t['tiers'][tier]['outputs'][role]['sha256'];assert ims[role].size==expected;maps[role]={'file':path,'sha256':sha(p),'dimensions':list(ims[role].size)}
  x=540+ti*525;s.paste(a.resize(disp,Image.Resampling.LANCZOS),(x,28));
  for i,div in enumerate((2,4)):
   dims=(n.width//div,n.height//div);nn=n.resize(dims,Image.Resampling.BOX).resize((dims[0]*3,dims[1]*3),Image.Resampling.NEAREST);aa=a.resize(dims,Image.Resampling.BOX).resize(nn.size,Image.Resampling.NEAREST);yy=565+i*215;d.text((x,yy-16),tier+' same-size Native/'+str(div)+' vs replacement',fill='white');s.paste(nn,(x,yy));s.paste(aa,(x+nn.width+8,yy))
  cyc=Image.fromarray(np.roll(np.asarray(a),(a.height//2,a.width//2),(0,1))).resize((256,256),Image.Resampling.LANCZOS);s.paste(cyc,(x,990));rep=Image.fromarray(np.tile(np.asarray(a),(2,2,1))).resize((256,256),Image.Resampling.LANCZOS);s.paste(rep,(x+262,990))
  vec=np.stack([np.asarray(ims['normal'+c],float)[:,:,0] for c in 'XYZ'],2)/127.5-1;vec/=np.maximum(np.linalg.norm(vec,axis=2,keepdims=True),1e-12);normal=Image.fromarray(np.uint8(np.clip((vec*.5+.5)*255,0,255)));colors=np.asarray(a,float);entries=[('height',ims['height']),('XYZ',normal)]
  for sign in (-1,1):
   v=np.array([sign*.6,sign*.3,.75]);v/=np.linalg.norm(v);lit=.35+.65*np.clip((vec*v).sum(2),0,1);entries.append(('light '+str(sign),Image.fromarray(np.uint8(np.clip(colors*lit[:,:,None],0,255)))))
  for ei,(label,im) in enumerate(entries):
   xx=ei*400;yy=ti*550;dr.text((xx+5,yy+5),tier+' '+label,fill='white');cx=im.width//2;cy=im.height//2;crop=im.crop((cx-128,cy-128,cx+128,cy+128));rel.paste(crop,(xx+4,yy+28));shift=Image.fromarray(np.roll(np.asarray(im),(im.height//2,im.width//2),(0,1)));shift.thumbnail((384,240));rel.paste(shift,(xx+4,yy+300))
  row['tiers'][tier]={'maps':maps,'distanceChecks':t['tiers'][tier]['distanceChecks'],'edges':t['tiers'][tier]['edges'],'heightCompressionMAE':t['tiers'][tier]['heightQuantizationCompressionMAE'],'normalVsDecodedHeightDegrees':t['tiers'][tier]['authoredNormalVsDecodedHeightDegrees']}
 s.save(O/(item['name']+'-art.png'));rel.save(O/(item['name']+'-relief.png'));row['sheets']={str(p):sha(p) for p in [O/(item['name']+'-art.png'),O/(item['name']+'-relief.png')]};rows.append(row)
(O/'inspection.json').write_text(json.dumps({'batchSha256':sha(B/'batch-first-four.json'),'materials':rows},indent=2)+'\n');print(O)
