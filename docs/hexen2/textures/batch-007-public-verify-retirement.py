"""Bounded read-only79-path retirement and accepted47-source custody audit."""
import datetime,hashlib,json,os,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[3];DOCS=ROOT/'docs/hexen2/textures'
LIB=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19';BASE=LIB/'batch-007';ACTIVE=LIB/'batch-008'
OUT=DOCS/'batch-007-public-retirement-audit.json';assert not OUT.exists(),'Retain prior evidence'
sha=lambda b:hashlib.sha256(b).hexdigest();load=lambda p:json.loads(p.read_text())
def witness(p):
 b=p.read_bytes();return {'file':str(p.relative_to(ROOT)),'sha256':sha(b),'bytes':len(b)}
def repo(p):return str(p.relative_to(ROOT))
report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'limits':['Read-only post-retirement absence/custody/receipt audit; not a filesystem undelete or deletion-attribution trace.',
 'Prior independent byte witnesses, retained equivalent bytes/producer metadata and coordinator-only historical identities are distinguished below.',
 'Protected activebatch008 is excluded from immutableprestate comparison because its generation journal legitimately advances after this planning approval.',
 'Logical retired bytes do not prove physical APFS recovery. No art/runtime/owner/release/fullcampaign acceptance.']}
try:
 retpath=DOCS/'batch-007-retirement.json';ret=load(retpath)
 roles=('diffuse','height','normalX','normalY','normalZ');expected=set()
 for master,tier in [('masters','tiers'),('masters-pattern','tiers-pattern'),('masters-motif','tiers-motif')]:
  expected.update(repo(BASE/master/'rtex322'/name)for name in('color.png','height.npy'))
  expected.update(repo(BASE/tier/'rtex322'/(kind+'-'+role+'.webp'))for kind in('mid','high')for role in roles)
 selected=load(BASE/'selection-final.json')
 for folder,names in [('review',[i['name']for i in selected['items']]),('review-pattern',['rtex322']),('review-motif-trial',['rtex322'])]:
  expected.add(repo(BASE/folder/'index.html'))
  expected.update(repo(BASE/folder/(name+'-'+tier+'-'+kind+'.jpg'))for name in names for tier in('mid','high')for kind in('review','relief'))
 removed={r['file']:r for r in ret['files']};assert len(removed)==len(ret['files'])==len(expected)==79 and set(removed)==expected
 assert sum(r['size']for r in ret['files'])==ret['bytes']==18_143_091
 assert all(not(ROOT/p).exists()and not(ROOT/p).is_symlink()for p in removed)
 git=lambda *a:subprocess.check_output(['git',*a],cwd=ROOT,timeout=25,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'})
 staged=sha(git('diff','--cached','--binary','--no-ext-diff'))
 assert not git('ls-files','--stage','--',*sorted(expected))
 assert not git('ls-tree','-r','--name-only','HEAD','--',*sorted(expected))
 protected={r['file']:r['sha256']for r in ret['protected']}
 assert len(protected)==len(ret['protected'])==ret['protectedCount']==1018
 assert not expected&set(protected)
 verified=[];excluded=[]
 for path,digest in protected.items():
  p=ROOT/path;assert p.resolve().is_relative_to(LIB.resolve())
  if p.is_relative_to(ACTIVE):excluded.append({'file':path,'prestateSha256':digest,'reason':'Activebatch008 explicitly outside accepted007/canonical47 audit scope'});continue
  assert p.is_file()and not p.is_symlink()and sha(p.read_bytes())==digest,path
  verified.append(witness(p))
 b7_protected={p for p in protected if (ROOT/p).is_relative_to(BASE)}
 assert {repo(p)for p in BASE.rglob('*')if p.is_file()}==b7_protected
 evidence={}
 for name in ('batch-007-public-actual-v2.json','batch-007-public-preview-v1.json','batch-007-rtex322-motif-reuse-research.json'):
  proof=load(DOCS/name)
  for row in proof['inputs']:
   p=pathlib.Path(row['file']);p=p if p.is_absolute()else ROOT/p
   if p.is_relative_to(ROOT):evidence[repo(p)]={'sha256':row['sha256'],'bytes':row['bytes'],'basis':name,'kind':'prior independent byte witness'}
 archive_records=[];archives=ret['decisiveFailuresPreserved'];assert len(archives)==10
 archive_sources={repo(BASE/folder/(('rtex322-'+tier+'-'+kind+'.jpg')))for folder in('review','review-pattern')for tier in('mid','high')for kind in('review','relief')}
 archive_sources|={repo(BASE/'review/index.html'),repo(BASE/'review-pattern/index.html')}
 assert {r['source']for r in archives}==archive_sources
 for row in archives:
  source=row['source'];p=ROOT/row['retained'];assert p.is_file()and not p.is_symlink()
  assert p.resolve().is_relative_to((DOCS/'batch-007-repair-diagnostic').resolve())
  assert sha(p.read_bytes())==row['sha256']==removed[source]['sha256']
  assert p.stat().st_size==removed[source]['size']
  evidence[source]={'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size,'basis':row['retained'],'kind':'retained exact diagnostic copy'}
  archive_records.append(witness(p))
 # First13a motif output was valid image data but unqualified producerguards.
 # Its small recipes remain and bind final byte-identical equivalents.
 final_mp=BASE/'masters-motif-v2/rtex322/master.json';final_tp=BASE/'tiers-motif-v2/rtex322/manifest.json'
 m,t=load(final_mp),load(final_tp);old_mp=BASE/'masters-motif/rtex322/master.json';old_tp=BASE/'tiers-motif/rtex322/manifest.json';oldm,oldt=load(old_mp),load(old_tp)
 assert oldm['tools']['motifAuthoring']['sha256']=='13a531fd67efe6db08aba57f660dddb1d466312e80a8819d9a18de4233519c60'
 assert m['tools']['motifAuthoring']['sha256']=='233bd52f30abbc276ba1e5895b44d2a81c3425531f82b10d5d999a48d080b430'
 for role,file in [('color','color.png'),('height','height.npy')]:
  p=final_mp.parent/file;assert sha(p.read_bytes())==m[role]['sha256']==oldm[role]['sha256']
  evidence[repo(old_mp.parent/file)]={'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size,'basis':repo(p),'kind':'retained equivalent and old producer metadata'}
 for tier in('Mid','High'):
  for role in roles:
   old=oldt['tiers'][tier]['outputs'][role];new=t['tiers'][tier]['outputs'][role];p=final_tp.parent/new['file']
   assert sha(p.read_bytes())==old['sha256']==new['sha256']
   evidence[repo(old_tp.parent/old['file'])]={'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size,'basis':repo(p),'kind':'retained equivalent and old producer metadata'}
 recorded=[];coordinator_only=[]
 for path,r in removed.items():
  if path in evidence:
   e=evidence[path];assert r['sha256']==e['sha256']and r['size']==e['bytes'],path;recorded.append({'file':path,**e})
  else:coordinator_only.append(r)
 # Verify discarded unchanged initialreview content remains represented by the
 # final accepted panels; do not demand historical JPEG binary determinism.
 initial=load(DOCS/'batch-007-public-preview-v1.json');final=load(DOCS/'batch-007-public-final-preview-v1.json')
 before_panels={pathlib.Path(i['file']).name:i['contentPanels']for i in initial['reviewCLIReplay']['files']}
 after_panels={pathlib.Path(i['file']).name:i['contentPanels']for i in final['reviewCLIReplay']['files']}
 for name,panels in before_panels.items():
  if not name.startswith('rtex322-'):assert panels==after_panels[name],name
 retained_recipes=[]
 for folder in('masters','masters-pattern','masters-motif'):
  p=BASE/folder/'rtex322/master.json';assert p.is_file();retained_recipes.append(witness(p))
 for folder in('tiers','tiers-pattern','tiers-motif'):
  p=BASE/folder/'rtex322/manifest.json';assert p.is_file();retained_recipes.append(witness(p))
 catpath=DOCS/'batch-007-public-catalog-post-cleanup.json';cat=load(catpath)
 assert cat['verdict'].startswith('PASS')and cat['measuredCounts']['reviewedWorldNativeIdentities']==47
 assert not expected&{r['file']for r in cat['inputs']}
 assert all(sha((ROOT/r['file']).read_bytes())==r['sha256']for r in cat['inputs'])
 assert sha((LIB/'catalog.json').read_bytes())==ret['activeCatalogSha256']
 assert sha(git('diff','--cached','--binary','--no-ext-diff'))==staged
 assert all(sha((ROOT/r['file']).read_bytes())==r['sha256']for r in verified)
 report.update({'verdict':'PASS exact79retired paths,protected accepted47/B7inputs and10decisive archives; source replay/catalog integrity intact',
  'retirementReceipt':witness(retpath),'catalogAudit':witness(catpath),'retiredFileCount':79,'retiredLogicalBytes':18_143_091,
  'allRetiredPathsAbsentAndUntrackedInIndexHEAD':True,'declaredProtectedLibraryCount':1018,
  'protectedAcceptedAndNonB8VerifiedCount':len(verified),'protectedAcceptedAndNonB8Verified':verified,
  'activeB8ExcludedPrestateCount':len(excluded),'activeB8ExcludedPrestate':excluded,'exactB7RemainingFileSetMatchesProtected':True,
  'retainedArchiveCount':10,'retainedArchives':archive_records,'identityWitnessedOrRetainedEquivalentCount':len(recorded),
  'identityWitnessesAndEquivalents':recorded,'historicalIdentityCoordinatorReceiptOnlyCount':len(coordinator_only),'historicalIdentityCoordinatorReceiptOnly':coordinator_only,
  'retainedPredecessorMetadata':retained_recipes,'unchangedInitialPreviewSheetsReproducedByFinalContent':28,
  'unchangedInitialPreviewContentPanelCount':sum(len(v)for k,v in before_panels.items()if not k.startswith('rtex322-')),
  'rootPostCleanupActualAndPreview':'Catalog audit verifies dc89c73…actual80 and e0f0f93…preview32/272 receipts against all retained current input hashes; not rerun again here.',
  'stagedDiffUnchanged':True,'verifiedProtectedInputsStable':True})
except Exception as exc:
 report['verdict']='HOLD';report['error']=repr(exc);raise
finally:
 report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'receipt':str(OUT.relative_to(ROOT)),'sha256':sha(OUT.read_bytes()),'verdict':report['verdict']}))
