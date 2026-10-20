"""Independent synthetic public-interface review; never touches game assets."""
from pathlib import Path
import ast,hashlib,io,json,math,runpy,subprocess,sys,tempfile,shutil
from datetime import datetime,timezone
import numpy as np
from PIL import Image,ImageDraw

DOC=Path(__file__).resolve().parent
ROOT=next(p for p in DOC.parents if (p/'tools/texture_sheets/prepare_texture_master.py').is_file())
TOOLS=ROOT/'tools/texture_sheets';CLI=TOOLS/'register_layered_texture_boundary.py'
OUT=DOC/'adapter-public-review-v2.json';EVIDENCE=DOC/'adapter-public-evidence-v2'
assert not OUT.exists() and not EVIDENCE.exists()
sha=lambda b:hashlib.sha256(b).hexdigest()
def bound(p):
 try:name=str(p.relative_to(ROOT))
 except ValueError:name=str(p)
 b=p.read_bytes();return dict(file=name,sha256=sha(b),bytes=len(b))
def npy(a):
 s=io.BytesIO();np.save(s,a,allow_pickle=False);return s.getvalue()
def png(a):
 s=io.BytesIO();Image.fromarray(a,'RGB').save(s,'PNG');return s.getvalue()
def layered(detail,layer):
 h,w=detail.shape;rw,rh=layer['referenceSize'];mask_im=Image.new('L',(w,h));draw=ImageDraw.Draw(mask_im)
 for region in layer['brickRegions']:
  for dy in (-h,0,h):
   for dx in (-w,0,w):draw.polygon([(x*w/rw+dx,y*h/rh+dy) for x,y in region['polygon']],fill=255)
 mask=np.asarray(mask_im,float)/255;sigma=layer['bevelPixels']*math.sqrt(detail.size)/256
 smoothed=helper['blur'](mask,sigma)
 planes=np.where(mask>.5,layer['brickHeight'],layer['facingHeight']-(layer['facingHeight']-layer['chipFloor'])*np.minimum(smoothed*2,1))
 return (planes+(detail-.5)*(2*layer['microAmplitude'])).astype('float32')

report=dict(schemaVersion=1,startedAt=datetime.now(timezone.utc).isoformat(),checks=[],requiredFindings=[],
 limits=['Synthetic source/public interface only, not actual rtex499 or ART acceptance.','Linux native publication is not executed on this macOS host.'])
code=CLI.read_bytes();EVIDENCE.mkdir();(EVIDENCE/'adapter-source-v2.py').write_bytes(code)
sys.path.insert(0,str(ROOT/'tests'))
from texture_layered_boundary_test import LayeredBoundaryCLI
from texture_boundary_registration_test import periodic_y_oracle
helper=runpy.run_path(str(DOC/'oracle-helpers.py'))
rgb_source=DOC/'verify-actual.py';tree=ast.parse(rgb_source.read_text())
defs=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='rgb_replay'],type_ignores=[])
context={'np':np,'Image':Image};exec(compile(defs,str(rgb_source),'exec'),context);rgb_replay=context['rgb_replay']
fixture=LayeredBoundaryCLI();fixture.setUp()
try:
 root=fixture.root;package=fixture.package;parent=json.loads(package.read_text());recipe=fixture.recipe
 meta_source=Path(recipe['sourceMasterPackage']);source=json.loads(meta_source.read_text())
 original=Image.open(source['inputs']['original']['file']).convert('RGB');raw=Image.open(source['inputs']['generated']['file']).convert('RGB')
 expected_rgb=rgb_replay(original,raw)
 assert png(expected_rgb)==(meta_source.parent/'color.png').read_bytes()
 detail=helper['craft64'](expected_rgb,source['height']['profile'])
 assert npy(detail.astype('float32'))==(meta_source.parent/'height.npy').read_bytes()
 assert npy(layered(detail,recipe['layering']))==(package.parent/'height.npy').read_bytes()
 report['fixtureIndependentSourceMasterBytesExact']=True
 outputs=[]
 for axis in ('x','y'):
  output=root/('independent-'+axis)
  cmd=[sys.executable,str(CLI),'--package',str(package),'--axis',axis,'--output',str(output)]
  run=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=45)
  assert run.returncode==0,run.stderr
  image=Image.open(package.parent/'color.png').convert('RGB')
  expected=periodic_y_oracle(image.transpose(Image.Transpose.TRANSPOSE)) if axis=='x' else periodic_y_oracle(image)
  if axis=='x':expected=expected.transpose(Image.Transpose.TRANSPOSE)
  assert png(np.asarray(expected))==(output/'color.png').read_bytes()
  H=layered(helper['craft64'](np.asarray(expected),parent['height']['profile']),recipe['layering'])
  assert npy(H)==(output/'height.npy').read_bytes()
  result=json.loads((output/'master.json').read_text());a=np.asarray(expected,float)
  actual_mean=a.mean((0,1)).tolist();claimed=result['registration'].get('outputMean')
  actual_edges=dict(wrap_x_mean=float(np.abs(a[:,0]-a[:,-1]).mean()),wrap_y_mean=float(np.abs(a[0]-a[-1]).mean()),interior_x_mean=float(np.abs(np.diff(a,axis=1)).mean()),interior_y_mean=float(np.abs(np.diff(a,axis=0)).mean()))
  claimed_edges=result['registration'].get('boundaries')
  scalar_delta=max(abs(claimed_edges[k]-v) for k,v in actual_edges.items())
  stale=claimed!=actual_mean or set(claimed_edges)!=set(actual_edges) or scalar_delta>1e-12
  assert result['masterRevision']['priorRegistration']==parent['registration']
  reg=result['registration'];assert reg['comparisonDimensions']==[original.width//2,original.height//2]
  ref=np.asarray(original,float).reshape(original.height//2,2,original.width//2,2,3).mean((1,3))
  current=a.reshape(original.height//2,16,original.width//2,16,3).mean((1,3));err=np.abs(current-ref)
  assert abs(reg['distanceMeanMAE']-float(err.mean()))<=1e-12 and abs(reg['distanceMeanMaxError']-float(err.max()))<=1e-12
  check=dict(kind='independent anisotropic public CLI/replay',axis=axis,exitCode=run.returncode,
       RGBPNGExact=True,fullFloat64LayerNPYExact=True,claimedRegistrationOutputMean=claimed,
       actualOutputMean=actual_mean,claimedRegistrationBoundaries=claimed_edges,actualBoundaries=actual_edges,
       edgeScalarMaximumAbsDifference=scalar_delta,descriptiveScalarTolerance=1e-12,RGBAndNPYComparisonTolerance=0,priorRegistrationExactlyPreserved=True,currentHalfNativeStatsIndependent=True,
       correctionSubrecordAfterCorrect=all(abs(result['registration']['periodicBoundary']['after'][k]-v)<=1e-12 for k,v in actual_edges.items()),
       staleTopLevelRegistrationStatistics=stale)
  report['checks'].append(check)
  if stale and not any(x['id']=='M1' for x in report['requiredFindings']):
   report['requiredFindings'].append(dict(id='M1',finding='Successor retains old registration.outputMean/boundaries as current-looking statistics.',lines=[163,173],requiredFix='Move baseline finish diagnostics into an explicit historical namespace or recompute the current fields. New periodicBoundary.after alone does not remove conflicting old current-looking facts.'))
  (EVIDENCE/('successor-'+axis+'-master.json')).write_bytes((output/'master.json').read_bytes());outputs.append(output)

 runner=EVIDENCE/'hostile-public-runner.py'
 runner.write_text('''import importlib.util,sys,json,subprocess
from pathlib import Path
from PIL import Image
import numpy as np
tool,package,output,mode=sys.argv[1:]
sys.path.insert(0,str(Path(tool).parent))
spec=importlib.util.spec_from_file_location('subject_adapter',tool);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
if mode=='original-after-replay':
 real=m.subprocess.run
 def wrapped(*args,**kw):
  result=real(*args,**kw)
  if result.returncode==0:
   parent=json.loads(Path(package).read_text());p=Path(parent['inputs']['original']['file'])
   a=np.asarray(Image.open(p).convert('RGB')).copy();a[:,:,0]=((a[:,:,0].astype('uint16')+37)%256).astype('uint8');Image.fromarray(a).save(p)
  return result
 m.subprocess.run=wrapped
elif mode in ('late-empty','late-symlink'):
 real=m.publish_exclusive
 def wrapped(source,destination):
  if mode=='late-empty':destination.mkdir()
  else:destination.symlink_to(destination.parent/'foreign-missing-target')
  return real(source,destination)
 m.publish_exclusive=wrapped
elif mode=='stage-write-failure':
 real=Path.write_bytes
 def wrapped(self,data):
  if self.parent.name=='successor' and self.name=='height.npy':raise OSError('injected owned staging failure')
  return real(self,data)
 Path.write_bytes=wrapped
elif mode=='unsupported':m.sys.platform='independent-unsupported'
sys.argv=[tool,'--package',package,'--axis','x','--output',output];m.main()
''')
 original_path=Path(parent['inputs']['original']['file']);original_bytes=original_path.read_bytes()
 for mode in ('original-after-replay','late-empty','late-symlink','stage-write-failure','unsupported'):
  output=root/('hostile-'+mode)
  cmd=[sys.executable,str(runner),str(CLI),str(package),str(output),mode]
  run=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=45)
  (EVIDENCE/(mode+'-process.json')).write_text(json.dumps(dict(command=cmd,exitCode=run.returncode,stdout=run.stdout,stderr=run.stderr),indent=2)+'\n')
  canonical=output.is_dir() and (output/'master.json').is_file()
  case=dict(kind='hostile full public main invocation',mode=mode,exitCode=run.returncode,canonicalPublished=canonical,
            privateStagingRemoved=not list(root.glob('.layered-boundary-*')))
  if mode=='original-after-replay':
   changed=original_path.read_bytes();assert changed!=original_bytes
   case['originalChangedAfterSuccessfulGuardedBaseline']=True
   case['expectedRejected']=run.returncode!=0 and not output.exists()
   if canonical:
    meta=json.loads((output/'master.json').read_text())
    case['resultOriginalHash']=meta['inputs']['original']['sha256'];case['actualOriginalHashAfterChange']=sha(changed)
    (EVIDENCE/'original-before.png').write_bytes(original_bytes);(EVIDENCE/'original-after.png').write_bytes(changed)
    shutil.copytree(output,EVIDENCE/'incorrectly-published-fixture')
   original_path.write_bytes(original_bytes)
   if case['expectedRejected']:assert case['privateStagingRemoved']
   if not case['expectedRejected']:
    report['requiredFindings'].append(dict(id='G1',finding='Original source changed after guarded baseline replay, but adapter publishes and retains the old original hash.',lines=[74,79,148,195],requiredFix='Pin first-read bytes immutably; repeated reads must compare against that snapshot and/or expected input digest. Do not overwrite watched[path] with a newly read unvalidated source. Add this temporal negative test.'))
  else:
   assert run.returncode>0,run.stdout
   assert not canonical
   if mode=='late-empty':assert output.is_dir() and list(output.iterdir())==[]
   elif mode=='late-symlink':assert output.is_symlink() and not output.exists()
   else:assert not output.exists() and not output.is_symlink()
   assert case['privateStagingRemoved']
   case['expectedFailureSafelyPreserved']=True
  report['checks'].append(case)
 # Additional malformed/repeated sources reject through the same actualCLI.
 parent_bytes=package.read_bytes()
 malformed=[]
 for value in (None,False,{}):
  m=json.loads(parent_bytes);m['registration']['periodicBoundary']=value;malformed.append(('periodic-key-'+repr(value),m))
 for name,key,value in [('factor-float','canonicalMasterFactor',8.0),('schema-boolean','schemaVersion',True)]:
  m=json.loads(parent_bytes);m[key]=value;malformed.append((name,m))
 m=json.loads(parent_bytes);m['tools']['unknownTool']=m['tools']['prepare'];malformed.append(('extra-tool-role',m))
 m=json.loads(parent_bytes);m['inputs']['unknownInput']=m['inputs']['original'];malformed.append(('extra-input-role',m))
 for i,(name,m) in enumerate(malformed):
  package.write_text(json.dumps(m,indent=2)+'\n');out=root/('malformed-'+str(i))
  run=subprocess.run([sys.executable,str(CLI),'--package',str(package),'--axis','x','--output',str(out)],cwd=ROOT,text=True,capture_output=True,timeout=45)
  assert run.returncode>0 and not out.exists()
  report['checks'].append(dict(kind='malformed actual publicCLI rejection',case=name,exitCode=run.returncode,noCanonicalOutput=True))
 package.write_bytes(parent_bytes)
 repeat_out=root/'repeat-successor'
 run=subprocess.run([sys.executable,str(CLI),'--package',str(outputs[0]/'master.json'),'--axis','x','--output',str(repeat_out)],cwd=ROOT,text=True,capture_output=True,timeout=45)
 assert run.returncode>0 and not repeat_out.exists()
 report['checks'].append(dict(kind='actual successor repeat-registration rejection',exitCode=run.returncode,noCanonicalOutput=True))
 report['scalarOraclePolicy']={'absoluteTolerance':1e-12,'appliesOnlyTo':'descriptive scalar diagnostics whose mean summation ordering differs','sourceEvidence':'code-evidence/metric-oracle-roundoff.json','RGBPNGFloatNPYAndDistributedMapBytesTolerance':0}
 assert original_path.read_bytes()==original_bytes
 assert CLI.read_bytes()==code,'Subject changed during review'
 report['subject']=bound(CLI);report['maintainedTest']=bound(ROOT/'tests/texture_layered_boundary_test.py')
 report['oldProducersUntouched']=[bound(TOOLS/n) for n in ['prepare_texture_master.py','prepare_layered_texture_master.py','register_texture_boundary.py','derive_texture_tiers.py','update_level_sheets.py']]+[bound(ROOT/'tools/craft_normals.py')]
 report['verdict']='HOLD required source-stability/metadata findings' if report['requiredFindings'] else 'PASS independent synthetic public checks'
finally:
 fixture.doCleanups()
 report['ownedFixtureTemporaryRemoved']=not fixture.root.exists()
 report['completedAt']=datetime.now(timezone.utc).isoformat()
 report['evidence']=[bound(p) for p in EVIDENCE.rglob('*') if p.is_file()]
 report['verifier']=bound(Path(__file__))
 OUT.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(dict(receipt=str(OUT),sha256=sha(OUT.read_bytes()),verdict=report.get('verdict'),requiredFindings=report['requiredFindings'])))
sys.exit(1 if report['requiredFindings'] else 0)
