"""Explicit actual recipe integration using independent colour-field oracles.

Only an owned temporary successor package is produced and then removed. Initial
RGB/NPY binaries are never read: baseline is replayed from retained sources.
"""
import datetime,hashlib,importlib.util,io,json,os,pathlib,subprocess,sys,tempfile
import numpy as np
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[3];DOCS=ROOT/'docs/hexen2/textures'
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-007'
OUT=DOCS/'batch-007-motif-public-actual-cli-v1.json';assert not OUT.exists(),'Retain prior evidence'
sha=lambda b:hashlib.sha256(b).hexdigest();load=lambda p:json.loads(p.read_text())
def witness(p):
 b=p.read_bytes();return {'file':str(p.relative_to(ROOT)),'sha256':sha(b),'bytes':len(b)}
report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'limits':['Actual authoring CLI replay only; no finalasset/tier/ART/runtime acceptance.',
 'No predecessor RGB/NPY binary read; baseline rebuilt from Low/raw and recipe.',
 'Only owned temporary output written and cleaned; no core/assets/Git mutation.']}
try:
 cli=ROOT/'tools/texture_sheets/prepare_motif_texture_master.py'
 assert sha(cli.read_bytes())=='233bd52f30abbc276ba1e5895b44d2a81c3425531f82b10d5d999a48d080b430'
 recipe_path=BASE/'relief/rtex322-inlays.json';recipe=load(recipe_path)
 assert recipe['motifs']=={'referenceSize':[64,64],'regions':[[5.5,28.5,14.5,34.5],[49.5,28.5,58.5,34.5]],'featherNativePixels':.5,'fieldSigmaNativePixels':.35,'strength':.95,'heightPolicy':'preserve-initial-float32'}
 mp=ROOT/recipe['sourceMasterPackage'];m=load(mp)
 assert sha(mp.read_bytes())==recipe['sourceMasterPackageSha256']=='ff0b870814feb29f85e87a97ce149d642e1790dba5d12ee73abead0adb6c67b2'
 proof_path=ROOT/recipe['sourceVerification']['file'];assert sha(proof_path.read_bytes())==recipe['sourceVerification']['sha256']=='f3721db7aaf26e69aa8a9aa82a7df5578fccf6b7db50d3b65c283fc7dd5e57d9'
 test_path=ROOT/'tests/texture_motif_master_test.py'
 fixed=[pathlib.Path(__file__),cli,recipe_path,mp,proof_path,test_path]
 fixed += [pathlib.Path(row['file'])for row in m['inputs'].values()]
 fixed += [pathlib.Path(row['file'])for row in m['tools'].values()]
 before={p:sha(p.read_bytes())for p in fixed}
 sys.path[:0]=[str(ROOT/'tools'),str(ROOT/'tools/texture_sheets')]
 from finish_official_texture import finish
 from craft_normals import craft
 spec=importlib.util.spec_from_file_location('independent_motif_oracles',test_path)
 oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
 original=Image.open(m['inputs']['original']['file']).convert('RGB');raw=Image.open(m['inputs']['generated']['file']).convert('RGB')
 baseline,_=finish(original,raw,factor=8,comparison_divisor=2,method='photographic',color_strength=.65,field_sigma=.75)
 baseline_png=io.BytesIO();baseline.save(baseline_png,'PNG')
 assert sha(baseline_png.getvalue())==m['color']['sha256']==recipe['authoringDiffuseSha256']
 h,_=craft(np.asarray(baseline,dtype=float)/255,m['height']['profile'],quantize_height=False)
 hbytes=io.BytesIO();np.save(hbytes,h.astype('float32'),allow_pickle=False)
 assert sha(hbytes.getvalue())==m['height']['sha256']
 expected,alpha=oracle.independent_restore(original,baseline,recipe['motifs'])
 with tempfile.TemporaryDirectory(prefix='texture-motif-actual-public-')as temporary:
  out=pathlib.Path(temporary)/'master';cmd=[sys.executable,str(cli),'--recipe',str(recipe_path),'--output',str(out)]
  run=subprocess.run(cmd,cwd=ROOT,env={**os.environ,'PYTHONPATH':str(ROOT/'tools/texture_sheets')},capture_output=True,text=True,timeout=45)
  report['process']={'command':cmd,'exitCode':run.returncode,'stdout':run.stdout,'stderr':run.stderr}
  assert run.returncode==0,run.stderr
  result=np.asarray(Image.open(out/'color.png').convert('RGB'));np.testing.assert_array_equal(result,expected)
  assert (out/'height.npy').read_bytes()==hbytes.getvalue()
  np.testing.assert_array_equal(result[alpha==0],np.asarray(baseline)[alpha==0])
  meta=load(out/'master.json');s=meta['motifRestoration']['statistics']
  assert s['supportPixels']==6912 and s['fullWeightPixels']==5120 and s['outsideRGBUnchanged']and s['edgeRGBUnchanged']
  assert meta['masterRevision']['heightUnchanged']and meta['masterRevision']['notAnotherGeneration']
  assert meta['motifRestoration']['recipe']==recipe and meta['height']['sha256']==m['height']['sha256']
  result_hashes={name:sha((out/name).read_bytes())for name in ('color.png','height.npy','master.json')}
  report.update({'tempResultSHA256':result_hashes,'statistics':s,'independentRGBOracleExact':True,
   'independentOracle':'Direct circular spatial Gaussian convolution + analytic periodic cubic reconstruction; producer restore helper not imported.',
   'initialHeightBytesPreserved':True,'canonicalOutsideRGBExact':True,'noPredecessorBinaryRead':True})
 assert not pathlib.Path(temporary).exists()
 assert all(sha(p.read_bytes())==digest for p,digest in before.items())
 report.update({'verdict':'PASS explicit actual motif CLI RGB oracle/outside support/unchangedheight; ART and encodedtier qualification separate',
  'inputs':[witness(p)for p in fixed],'inputsStable':True,'ownedTemporaryOutputRemoved':True})
except Exception as e:
 report['verdict']='HOLD';report['error']=repr(e);raise
finally:
 report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'receipt':str(OUT.relative_to(ROOT)),'sha256':sha(OUT.read_bytes()),'verdict':report['verdict']}))
