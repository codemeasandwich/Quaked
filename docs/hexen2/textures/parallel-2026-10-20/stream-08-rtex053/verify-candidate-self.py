"""Actual source-bound author replay, maintained independent math oracles and public CLIs."""
import hashlib,io,json,sys,subprocess,tempfile,importlib.util,datetime
from pathlib import Path
import numpy as np
from PIL import Image
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-08-rtex053';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-08-rtex053';M=B/'masters/rtex053';T=B/'tiers/rtex053';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(R));j=json.loads((B/'selection.json').read_text())['items'][0];t=json.loads((T/'manifest.json').read_text());c=Image.open(M/'color.png').convert('RGB');h=np.load(M/'height.npy',allow_pickle=False);o=Image.open(R/j['original']).convert('RGB');assert j['generationCount']==1 and j['generationState']=='generated-retained';assert sha(R/j['generated'])==j['generatedSha256'];assert sha(R/j['original'])==j['originalSha256'];assert sha(R/j['prompt'])==j['promptSha256'];assert t['Low']=={'source':'original','unchanged':True,'sha256':j['originalSha256']}
spec=importlib.util.spec_from_file_location('tier_oracle',R/'tests/hexen2_texture_tiers_test.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a);checks={};witnesses=json.loads((D/'pre-tier-self-check.json').read_text())['samples']
for tier,factor in [('Mid',4),('High',8)]:
 q=t['tiers'][tier];size=(64*factor,64*factor);assert q['factor']==factor and q['dimensions']==list(size);hh=a.float_box(h,size);n=a.cyclic_normals(hh);nb=np.round(np.clip(n*.5+.5,0,1)*255).astype('uint8');raws={'diffuse':a.periodic_rgb(c,size),'height':Image.fromarray(np.round(hh*255).astype('uint8'))};raws.update({role:Image.fromarray(nb[:,:,k])for k,role in enumerate(a.ROLES[2:])});rows={};decoded={}
 for role in a.ROLES:
  rec=q['outputs'][role];p=T/rec['file'];payload=p.read_bytes();assert payload==a.q92(raws[role]),tier+'/'+role;assert sha(p)==rec['sha256'];assert(rec['quality'],rec['method'],rec['lossless'])==(92,6,False);a.vp8_only(payload);im=Image.open(io.BytesIO(payload)).convert('RGB');assert im.size==size;decoded[role]=im;rows[role]={'file':rel(p),'sha256':sha(p),'bytes':len(payload),'directOracleAndQ92BytesExact':True}
 ds=[]
 for distance in q['distanceChecks']:
  div=distance['divisor'];dims=(64//div,64//div);diff=np.abs(np.asarray(o.resize(dims,Image.Resampling.BOX),float)-np.asarray(decoded['diffuse'].resize(dims,Image.Resampling.BOX),float));assert distance['meanAbsoluteError']==float(diff.mean())and distance['maximum']==float(diff.max());ds.append(distance)
 dh=np.asarray(decoded['height'],float)[:,:,0]/255;ws=[]
 for p in witnesses:
  x,y=[int(v*factor/8)for v in p['masterPixel']];rad=1 if factor==4 else 3;v=dh[y-rad:y+rad+1,x-rad:x+rad+1];ws.append({'label':p['label'],'physicalClass':p['physicalClass'],'tierPixel':[x,y],'radiusPixels':rad,'decodedHeightMean':float(v.mean()),'decodedHeightRange':[float(v.min()),float(v.max())]})
 faces=[v['decodedHeightMean']for v in ws if v['label']in ('A','B','C')];joints=[v['decodedHeightMean']for v in ws if v['label']in ('D','E','F','G','H')];assert min(faces)>max(joints)
 checks[tier]={'dimensions':list(size),'maps':rows,'distance':ds,'decodedPhysicalWitnesses':ws,'faceMeanSpread':max(faces)-min(faces),'physicalPitsBelowEveryFaceWitness':True,'normalQuantizationDiagnostics':{k:v for k,v in q.items()if k.endswith('Degrees')or k=='heightQuantizationCompressionMAE'}}
cli=[]
with tempfile.TemporaryDirectory(prefix='quaked-rtex053-self-')as td:
 temp=Path(td)
 def run(args):
  p=subprocess.run([sys.executable,*map(str,args)],cwd=R,capture_output=True,text=True,timeout=120);assert p.returncode==0,p.stderr;cli.append({'arguments':[str(x)for x in args],'exitCode':p.returncode,'stdout':p.stdout})
 run([R/'tools/texture_sheets/prepare_texture_master.py','--original',R/j['original'],'--generated',R/j['generated'],'--prompt',R/j['prompt'],'--name','rtex053','--edition','base','--profile','stone','--color-strength','.65','--field-sigma','.75','--output',temp/'master'])
 for name in ('color.png','height.npy','master.json'):assert (temp/'master'/name).read_bytes()==(M/name).read_bytes(),name
 run([R/'tools/texture_sheets/derive_texture_tiers.py','--original',R/j['original'],'--master',M/'color.png','--height-master',M/'height.npy','--output',temp/'tiers'])
 for q in t['tiers'].values():
  for rec in q['outputs'].values():assert(temp/'tiers'/rec['file']).read_bytes()==(T/rec['file']).read_bytes()
 assert(temp/'tiers/manifest.json').read_bytes()==(T/'manifest.json').read_bytes()
 run([R/'tools/texture_sheets/build_texture_batch_review.py','--batch',B/'batch.json','--paths-root',R,'--output',temp/'review'])
 previews={}
 for p in (B/'review').iterdir():
  q=temp/'review'/p.name;assert q.read_bytes()==p.read_bytes(),p.name;previews[rel(p)]={'sha256':sha(p),'actualCliByteExact':True}
r={'verdict':'PASS author exact source-bound replay, all ten direct-master Q92 maps, distance diagnostics, decoded physical witnesses and four preview JPEGs + HTML','independenceLimit':'Author self-check only; independent actual ART/math/preview review and root registration remain pending. Fixture oracle functions are maintained independent math, not another authoring pipeline.','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'batch':{'file':rel(B/'batch.json'),'sha256':sha(B/'batch.json')},'canonicalMaster':{'file':rel(M/'master.json'),'sha256':sha(M/'master.json')},'tierReceipt':{'file':rel(T/'manifest.json'),'sha256':sha(T/'manifest.json')},'checks':checks,'previewReplay':previews,'actualCliRuns':cli,'inputs':{rel(p):sha(p)for p in [Path(__file__),R/'tests/hexen2_texture_tiers_test.py',B/'selection.json',B/'native-selection.json',D/'root-plan-review.json']},'temporaryReplayOutputsRemovedByContextManager':True}
(D/'candidate-self-replay.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'verdict':r['verdict'],'proofSha256':sha(D/'candidate-self-replay.json'),'mapCount':10,'previewCount':4,'physical':{k:{'faceSpread':v['faceMeanSpread'],'witnesses':v['decodedPhysicalWitnesses']}for k,v in checks.items()}},indent=2))
