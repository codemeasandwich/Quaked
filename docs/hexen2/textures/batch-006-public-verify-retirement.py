"""Read-only bounded batch006 retirement scope and retained-custody audit."""
import datetime,hashlib,json,os,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-006'
DOCS=ROOT/'docs/hexen2/textures';OUT=DOCS/'batch-006-public-retirement-audit.json'
assert not OUT.exists(),'Retain prior evidence'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
def witness(p):
 b=p.read_bytes();return {'file':str(p.relative_to(ROOT)),'sha256':sha(b),'bytes':len(b)}
def repo(p):return str(p.relative_to(ROOT))
report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'limits':['Post-deletion path, current retained-hash and prior receipt audit, not a filesystem undelete trace.',
 'Deleted-file hashes are checked against prior independent witnesses where available; otherwise the coordinator pre-deletion receipt is the stated identity basis, never represented as independent observation.',
 'Logical byte totals do not prove physical APFS space recovery. No builds or unaffected public test rerun.']}
try:
 retpath=DOCS/'batch-006-retirement.json';ret=load(retpath)
 assert ret['state']=='complete'and ret['protectedFilesUnchanged']is True
 names=('rtex001','rtex095','rtex439');roles=('diffuse','height','normalX','normalY','normalZ')
 expected=set()
 for name in names:
  expected.update(repo(BASE/'masters'/name/f)for f in('color.png','height.npy'))
  expected.update(repo(BASE/'tiers'/name/(tier+'-'+role+'.webp'))for tier in('mid','high')for role in roles)
 selection=load(BASE/'selection-final.json')
 for directory in ('review','review-registered'):
  expected.add(repo(BASE/directory/'index.html'))
  expected.update(repo(BASE/directory/(i['name']+'-'+tier+'-'+kind+'.jpg'))for i in selection['items']for tier in('mid','high')for kind in('review','relief'))
 expected.update(repo(BASE/'relief'/f)for f in('rtex001-layered-draft-height.npy','rtex001-layered-draft-height.png'))
 deleted={i['file']:i for i in ret['files']}
 assert set(deleted)==expected and len(expected)==len(ret['files'])==104
 assert sum(i['bytes']for i in ret['files'])==ret['retiredBytes']==40_206_805
 assert all(not(ROOT/p).exists()and not(ROOT/p).is_symlink()for p in expected)
 git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT,timeout=30,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'})
 staged=sha(git('diff','--cached','--binary','--no-ext-diff'))
 assert not git('ls-files','--stage','--',*sorted(expected))
 assert not git('ls-tree','-r','--name-only','HEAD','--',*sorted(expected))
 protected=ret['protectedFiles'];assert len(protected)==ret['protectedFileCount']==171
 current={repo(p)for p in BASE.rglob('*')if p.is_file()}
 assert current==set(protected),'Retained batch file set differs from named protected set'
 assert not(expected&set(protected))
 protected_records=[]
 for path,digest in protected.items():
  p=ROOT/path;assert p.is_file()and not p.is_symlink()and p.resolve().is_relative_to(BASE.resolve())
  assert sha(p.read_bytes())==digest;protected_records.append(witness(p))
 prior={}
 for name in ('batch-006-public-actual-v1.json','batch-006-public-preview-v1.json','batch-006-repair-plan-public-math.json'):
  proof=load(DOCS/name)
  for row in proof['inputs']:
   p=pathlib.Path(row['file']);p=p if p.is_absolute()else ROOT/p
   if p.is_relative_to(ROOT):prior[repo(p)]={**row,'basis':name}
 archive_records=[]
 assert len(ret['archivedEvidence'])==14
 expected_archives={repo(BASE/'review'/(name+'-'+tier+'-'+kind+'.jpg'))for name in names for tier in('mid','high')for kind in('review','relief')}
 expected_archives|={repo(BASE/'review/index.html'),repo(BASE/'review-registered/index.html')}
 assert {a['from']for a in ret['archivedEvidence']}==expected_archives
 for a in ret['archivedEvidence']:
  src=a['from'];p=ROOT/a['to'];assert p.is_file()and not p.is_symlink()
  assert p.resolve().is_relative_to((DOCS/'batch-006-repair-diagnostic').resolve())
  assert sha(p.read_bytes())==a['sha256']==deleted[src]['sha256']
  assert p.stat().st_size==a['bytes']==deleted[src]['bytes']
  prior[src]={'sha256':a['sha256'],'bytes':a['bytes'],'basis':a['to']}
  archive_records.append(witness(p))
 independent={};declared={}
 for path,row in deleted.items():
  if path in prior:
   old=prior[path];assert row['sha256']==old['sha256']and row['bytes']==old['bytes']
   independent[path]={'sha256':row['sha256'],'bytes':row['bytes'],'basis':old['basis']}
  else:declared[path]=row
 # Small predecessor recipes remain, including the draft polygons; binary
 # predecessor master/height/tier products are deliberately not required.
 retained_old=[]
 initial=load(DOCS/'batch-006-public-actual-v1.json');byname={m['name']:m for m in initial['materials']}
 for name in names:
  mp=BASE/'masters'/name/'master.json';tp=BASE/'tiers'/name/'manifest.json'
  assert sha(mp.read_bytes())==byname[name]['masterPackage']['sha256']
  old=load(mp);tr=load(tp)
  for tier in tr['tiers'].values():
   for item in tier['outputs'].values():
    assert deleted[repo(tp.parent/item['file'])]['sha256']==item['sha256']
  retained_old.extend([witness(mp),witness(tp)])
 catalog_path=DOCS/'batch-006-public-catalog-post-cleanup.json';catalog=load(catalog_path)
 assert catalog['verdict'].startswith('PASS')and catalog['measuredCounts']['reviewedWorldNativeIdentities']==37
 assert not expected&{r['file']for r in catalog['inputs']}
 assert all(sha((ROOT/r['file']).read_bytes())==r['sha256']for r in catalog['inputs'])
 actual_path=DOCS/'batch-006-public-final-post-cleanup.json';actual=load(actual_path)
 assert actual['verdict'].startswith('PASS')and actual['mapCount']==80
 assert sha(git('diff','--cached','--binary','--no-ext-diff'))==staged
 assert all(sha((ROOT/r['file']).read_bytes())==r['sha256']for r in protected_records)
 report.update({'verdict':'PASS exact104-file retired scope,171named protected files and14archives; catalog37 and final source replay intact',
 'retirement':witness(retpath),'catalogAudit':witness(catalog_path),'postCleanupActual':witness(actual_path),
 'deletedFileCount':104,'deletedLogicalBytes':40_206_805,'allDeletedPathsAbsent':True,'allDeletedPathsUntrackedIndexAndHEAD':True,
 'protectedFileCount':171,'protectedFiles':protected_records,'allRemainingBatchFilesExactlyNamedProtectedSet':True,
 'retainedArchives':archive_records,'retainedArchiveCount':14,'retainedPredecessorRecipes':retained_old,
 'deletedIdentityPriorWitnessCount':len(independent),'deletedIdentityPriorWitnesses':independent,
 'deletedIdentityCoordinatorReceiptOnlyCount':len(declared),'deletedIdentityCoordinatorReceiptOnly':declared,
 'portableTestsRerun':False,'portableTestsReason':'Default synthetic fixtures are created in owned temporary directories; cleanup touched only known batch006 asset paths and unchanged adapter/core hashes. Fresh actual source replay passed.',
 'stagedDiffUnchanged':True,'protectedInputsStable':True})
except Exception as e:
 report['verdict']='HOLD';report['error']=repr(e);raise
finally:
 report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'receipt':str(OUT.relative_to(ROOT)),'sha256':sha(OUT.read_bytes()),'verdict':report['verdict']}))
