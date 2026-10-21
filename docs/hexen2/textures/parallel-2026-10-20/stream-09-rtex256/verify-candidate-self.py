"""Actual source-bound author replay, maintained independent math oracles and public CLIs."""
import hashlib,io,json,sys,subprocess,tempfile,importlib.util,datetime
from pathlib import Path
import numpy as np
from PIL import Image
def verify_preview_content(delivered_path,replayed_path,native):
    delivered=np.asarray(Image.open(delivered_path).convert('RGB'))
    replayed=np.asarray(Image.open(replayed_path).convert('RGB'))
    assert delivered.shape==replayed.shape
    scale=min(512/native.width,512/native.height)
    width=round(native.width*scale);height=round(native.height*scale)
    if delivered_path.name.endswith('-review.jpg'):
        boxes={'title':(0,0,1400,32),'native':(12,32,12+width,32+height),
            'diffuse':(540,32,540+width,32+height),'oneToOneDetail':(1068,32,1324,288),
            'repeatedTiles':(12,570,524,1082)}
        ys=[570,570+max(235,25+(native.height//2)*3+18)]
        for i,divisor in enumerate([2,4]):
            w=native.width//divisor*3;h=native.height//divisor*3;y=ys[i]+25
            boxes[f'distance{divisor}Label']=(540,ys[i],1400,y)
            boxes[f'distance{divisor}Native']=(540,y,540+w,y+h)
            boxes[f'distance{divisor}Enhanced']=(550+w,y,550+2*w,y+h)
    else:
        boxes={'topLabels':(0,0,1200,30),'bottomLabels':(0,550,1200,580)}
        for label,x,y in [('height',10,30),('normals',610,30),('lightA',10,580),('lightB',610,580)]:boxes[label]=(x,y,x+width,y+height)
    occupied=np.zeros(delivered.shape[:2],dtype=bool);records=[]
    for label,(x0,y0,x1,y1) in boxes.items():
        assert not occupied[y0:y1,x0:x1].any(),'Content/label rectangles overlap'
        a=delivered[y0:y1,x0:x1];b=replayed[y0:y1,x0:x1]
        assert np.array_equal(a,b),'Actual preview content/label differs: '+delivered_path.name+' '+label
        occupied[y0:y1,x0:x1]=True
        records.append(dict(panel=label,rectangle=[x0,y0,x1,y1],decodedRGBSha256=hashlib.sha256(a.tobytes()).hexdigest(),exactReplay=True))
    changed=np.any(delivered!=replayed,axis=2);h,w=changed.shape
    allowed=np.zeros_like(changed);allowed[h-16:,w-40:]=True
    assert not (allowed&occupied).any(),'Known JPEG padding intersects content'
    assert not (changed&occupied).any(),'JPEG variance intersects content'
    assert not (changed&~allowed).any(),'JPEG variance outside known40x16 empty tail padding'
    yy,xx=np.where(changed)
    return dict(file=str(delivered_path.relative_to(R)),sha256=hashlib.sha256(delivered_path.read_bytes()).hexdigest(),
        fullJPEGBytesExact=delivered_path.read_bytes()==replayed_path.read_bytes(),contentAndLabelsExact=True,
        contentPanels=records,changedPixels=int(changed.sum()),
        maximumChannelDifference=int(np.abs(delivered.astype('int16')-replayed.astype('int16')).max()),
        changedRectangle=None if not len(xx) else [int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)],
        allowedEmptyPaddingRectangle=[w-40,h-16,w,h],allVarianceOutsideContentAndWithinKnownPadding=True)


R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-09-rtex256';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-09-rtex256';M=B/'masters/rtex256';T=B/'tiers/rtex256';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(R));j=json.loads((B/'selection.json').read_text())['items'][0];t=json.loads((T/'manifest.json').read_text());c=Image.open(M/'color.png').convert('RGB');h=np.load(M/'height.npy',allow_pickle=False);o=Image.open(R/j['original']).convert('RGB');assert j['generationCount']==1 and j['generationState']=='generated-retained';assert sha(R/j['generated'])==j['generatedSha256'];assert sha(R/j['original'])==j['originalSha256'];assert sha(R/j['prompt'])==j['promptSha256'];assert t['Low']=={'source':'original','unchanged':True,'sha256':j['originalSha256']}
spec=importlib.util.spec_from_file_location('tier_oracle',R/'tests/hexen2_texture_tiers_test.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a);checks={};witnesses=json.loads((D/'pre-tier-review/author-material-semantic-review-v2.json').read_text())['witnesses']
for tier,factor in [('Mid',4),('High',8)]:
 q=t['tiers'][tier];size=(64*factor,64*factor);assert q['factor']==factor and q['dimensions']==list(size);hh=a.float_box(h,size);n=a.cyclic_normals(hh);nb=np.round(np.clip(n*.5+.5,0,1)*255).astype('uint8');raws={'diffuse':a.periodic_rgb(c,size),'height':Image.fromarray(np.round(hh*255).astype('uint8'))};raws.update({role:Image.fromarray(nb[:,:,k])for k,role in enumerate(a.ROLES[2:])});rows={};decoded={}
 for role in a.ROLES:
  rec=q['outputs'][role];p=T/rec['file'];payload=p.read_bytes();assert payload==a.q92(raws[role]),tier+'/'+role;assert sha(p)==rec['sha256'];assert(rec['quality'],rec['method'],rec['lossless'])==(92,6,False);a.vp8_only(payload);im=Image.open(io.BytesIO(payload)).convert('RGB');assert im.size==size;decoded[role]=im;rows[role]={'file':rel(p),'sha256':sha(p),'bytes':len(payload),'directOracleAndQ92BytesExact':True}
 ds=[]
 for distance in q['distanceChecks']:
  div=distance['divisor'];dims=(64//div,64//div);diff=np.abs(np.asarray(o.resize(dims,Image.Resampling.BOX),float)-np.asarray(decoded['diffuse'].resize(dims,Image.Resampling.BOX),float));assert distance['meanAbsoluteError']==float(diff.mean())and distance['maximum']==float(diff.max());ds.append(distance)
 dh=np.asarray(decoded['height'],float)[:,:,0]/255;ws=[]
 for p in witnesses:
  x0,y0,x1,y1=[int(v*factor/8)for v in p['boxMasterPixels']];v=dh[y0:y1,x0:x1];ws.append({'label':p['label'],'physicalClass':p['classification'],'tierBox':[x0,y0,x1,y1],'decodedHeightMedian':float(np.median(v)),'decodedHeightMean':float(v.mean()),'decodedHeightRange':[float(v.min()),float(v.max())]})
 faces=[v['decodedHeightMedian']for v in ws if v['physicalClass']=='stoneFace'];joints=[v['decodedHeightMedian']for v in ws if v['physicalClass']=='mortar'];assert min(faces)>max(joints)
 checks[tier]={'dimensions':list(size),'maps':rows,'distance':ds,'decodedPhysicalWitnesses':ws,'faceMeanSpread':max(faces)-min(faces),'selectedMortarCoreMediansBelowEveryFaceMedian':True,'normalQuantizationDiagnostics':{k:v for k,v in q.items()if k.endswith('Degrees')or k=='heightQuantizationCompressionMAE'}}
cli=[]
with tempfile.TemporaryDirectory(prefix='quaked-rtex256-self-')as td:
 temp=Path(td)
 def run(args):
  p=subprocess.run([sys.executable,*map(str,args)],cwd=R,capture_output=True,text=True,timeout=120);assert p.returncode==0,p.stderr;cli.append({'arguments':[str(x)for x in args],'exitCode':p.returncode,'stdout':p.stdout})
 run([R/'tools/texture_sheets/prepare_texture_master.py','--original',R/j['original'],'--generated',R/j['generated'],'--prompt',R/j['prompt'],'--name','rtex256','--edition','base','--profile','stone','--color-strength','.65','--field-sigma','.75','--output',temp/'master'])
 for name in ('color.png','height.npy','master.json'):assert (temp/'master'/name).read_bytes()==(M/name).read_bytes(),name
 run([R/'tools/texture_sheets/derive_texture_tiers.py','--original',R/j['original'],'--master',M/'color.png','--height-master',M/'height.npy','--output',temp/'tiers'])
 for q in t['tiers'].values():
  for rec in q['outputs'].values():assert(temp/'tiers'/rec['file']).read_bytes()==(T/rec['file']).read_bytes()
 assert(temp/'tiers/manifest.json').read_bytes()==(T/'manifest.json').read_bytes()
 run([R/'tools/texture_sheets/build_texture_batch_review.py','--batch',B/'batch.json','--paths-root',R,'--output',temp/'review'])
 previews={}
 assert (temp/'review/index.html').read_bytes()==(B/'review/index.html').read_bytes()
 for p in (B/'review').glob('*.jpg'):
  q=temp/'review'/p.name;previews[rel(p)]=verify_preview_content(p,q,o)
 assert set(previews)=={rel(B/'review'/f'rtex256-{tier}-{kind}.jpg') for tier in ['mid','high'] for kind in ['review','relief']}
r={'completeJPEGBytesExact':all(v['fullJPEGBytesExact'] for v in previews.values()),'previewVarianceLimit':'All content and labels must be pixel-exact. Any variance allowed only in known40x16empty bottom-right tail, proven disjoint from occupied rectangles; fullJPEGexactness recorded, not assumed.','verdict':'PASS author exact source-bound replay, all ten direct-master Q92 maps, distance diagnostics, decoded physical witnesses and four exact content/label previews plus HTML; any unused JPEG tail-padding variance bounded','independenceLimit':'Author self-check only; independent actual ART/math/preview review and root registration remain pending. Fixture oracle functions are maintained independent math, not another authoring pipeline.','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'batch':{'file':rel(B/'batch.json'),'sha256':sha(B/'batch.json')},'canonicalMaster':{'file':rel(M/'master.json'),'sha256':sha(M/'master.json')},'tierReceipt':{'file':rel(T/'manifest.json'),'sha256':sha(T/'manifest.json')},'checks':checks,'previewReplay':previews,'actualCliRuns':cli,'inputs':{rel(p):sha(p)for p in [Path(__file__),R/'tests/hexen2_texture_tiers_test.py',B/'selection.json',B/'native-selection.json',D/'root-plan-review.json']},'temporaryReplayOutputsRemovedByContextManager':True}
(D/'candidate-self-replay.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'verdict':r['verdict'],'proofSha256':sha(D/'candidate-self-replay.json'),'mapCount':10,'previewCount':4,'physical':{k:{'faceSpread':v['faceMeanSpread'],'witnesses':v['decodedPhysicalWitnesses']}for k,v in checks.items()}},indent=2))
