"""Independent read-only scope/custody audit of the completed005 retirement."""
import datetime, hashlib, json, os, pathlib, subprocess

ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-005'
OUT=ROOT/'docs/hexen2/textures/batch-005-public-retirement-audit.json'
assert not OUT.exists(),'Retain prior evidence'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
def w(p):
 b=p.read_bytes()
 try:name=str(p.relative_to(ROOT))
 except ValueError:name=str(p)
 return {'file':name,'sha256':sha(b),'bytes':len(b)}
def repo(p):return str(p.relative_to(ROOT))
REPORT={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'limits':['Read-only post-retirement audit. Deletion identity comes from sealed pre-retirement witnesses and retained byte-identical equivalents, not an undelete/filesystem trace.',
           'Logical bytes do not establish physical APFS recovery.','The coordinator receipt stores protectedFileCount391 but not that exact named set; independent retained coverage is enumerated separately.']}
try:
 retirement_path=ROOT/'docs/hexen2/textures/batch-005-retirement.json';ret=load(retirement_path)
 scratch_path=ROOT/'docs/hexen2/textures/batch-005-scratch-retirement.json';scratch=load(scratch_path)
 assert ret['state']==scratch['state']=='complete'
 roles=('diffuse','height','normalX','normalY','normalZ');names=('rtex043','ttex051')
 expected=set()
 for name in names:
  expected.update(repo(BASE/'masters'/name/f)for f in('color.png','height.npy'))
  expected.update(repo(BASE/'tiers'/name/(t+'-'+r+'.webp'))for t in('mid','high')for r in roles)
  expected.update(repo(BASE/'masters-registered'/name/f)for f in('color.png','height.npy','master.json'))
  expected.update(repo(BASE/'tiers-registered'/name/(t+'-'+r+'.webp'))for t in('mid','high')for r in roles)
  expected.add(repo(BASE/'tiers-registered'/name/'manifest.json'))
 selection=load(BASE/'selection-registered.json')
 expected.update(repo(BASE/'review'/(i['name']+'-'+t+'-'+kind+'.jpg'))for i in selection['items']for t in('mid','high')for kind in('review','relief'))
 expected.add(repo(BASE/'review/index.html'))
 removed={r['file']:r for r in ret['files']};assert len(removed)==len(ret['files'])==len(expected)==85 and set(removed)==expected
 assert sum(r['bytes']for r in removed.values())==ret['logicalBytes']==25_178_305
 assert all(not(ROOT/p).exists()and not(ROOT/p).is_symlink()for p in removed)
 git=lambda *a:subprocess.check_output(['git',*a],cwd=ROOT,timeout=20,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'})
 staged=sha(git('diff','--cached','--binary','--no-ext-diff'))
 assert not git('ls-files','--stage','--',*sorted(expected))
 assert not git('ls-tree','-r','--name-only','HEAD','--',*sorted(expected))
 before_evidence={}
 for pp in('batch-005-public-actual-v1.json','batch-005-public-preview-v2.json'):
  proof=load(ROOT/'docs/hexen2/textures'/pp);assert proof['verdict'].startswith('PASS')
  for row in proof['inputs']:
   p=pathlib.Path(row['file']);p=p if p.is_absolute()else ROOT/p
   try:key=repo(p)
   except ValueError:continue
   before_evidence[key]={'sha256':row['sha256'],'bytes':row['bytes'],'basis':pp}
 archive_records=[]
 for row in ret['archivedEvidence']:
  source=row['from'];p=ROOT/row['to'];assert source in removed and p.is_file()and not p.is_symlink()
  assert p.resolve().is_relative_to((ROOT/'docs/hexen2/textures/batch-005-seam-diagnostic').resolve())
  assert sha(p.read_bytes())==row['sha256']==removed[source]['sha256']and p.stat().st_size==row['bytes']==removed[source]['bytes']
  before_evidence[source]={'sha256':row['sha256'],'bytes':row['bytes'],'basis':row['to']};archive_records.append(w(p))
 assert len(archive_records)==13
 for name in names:
  chosen=next(i for i in selection['items']if i['name']==name)
  final_mp=ROOT/chosen['registeredMasterPackage'];final_tp=ROOT/chosen['registeredTierReceipt'];m,t=load(final_mp),load(final_tp)
  old_master_archive=ROOT/f'docs/hexen2/textures/batch-005-seam-diagnostic/first-guard-{name}-master.json'
  old_tier_archive=ROOT/f'docs/hexen2/textures/batch-005-seam-diagnostic/first-guard-{name}-manifest.json'
  oldm,oldt=load(old_master_archive),load(old_tier_archive)
  assert oldm['tools']['boundaryRegistration']['sha256']=='5cfe288f4f35a65118eff832cf19fde8755300c133c4bab8023324eaec80f81b'
  for role,file in(('color','color.png'),('height','height.npy')):
   p=final_mp.parent/file;assert sha(p.read_bytes())==oldm[role]['sha256']==m[role]['sha256']
   key=repo(BASE/'masters-registered'/name/file);before_evidence[key]={'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size,'basis':repo(p)}
  for tier in('Mid','High'):
   for role in roles:
    record=oldt['tiers'][tier]['outputs'][role];final=t['tiers'][tier]['outputs'][role];p=final_tp.parent/final['file']
    assert sha(p.read_bytes())==record['sha256']==final['sha256']
    key=repo(BASE/'tiers-registered'/name/record['file']);before_evidence[key]={'sha256':record['sha256'],'bytes':p.stat().st_size,'basis':repo(p)}
  # Tiny original recipes remain; these are the only prior package files the
  # final source oracle reads. Their RGB/NPY/map binaries are explicitly absent.
  old_recipe=BASE/'masters'/name/'master.json';old_receipt=BASE/'tiers'/name/'manifest.json'
  assert old_recipe.is_file()and old_receipt.is_file()
  assert sha(old_recipe.read_bytes())==m['masterRevision']['replacesUnqualifiedPackageSha256']
 assert all(key in before_evidence and all(row[k]==before_evidence[key][k]for k in('sha256','bytes'))for key,row in removed.items())
 # Unchanged material panels in the discarded duplicate preview are already
 # reproduced by the final preview. Only the failed043/051 artwork needed copies.
 initial=load(ROOT/'docs/hexen2/textures/batch-005-public-preview-v2.json')
 final=load(ROOT/'docs/hexen2/textures/batch-005-public-registered-preview-v1.json')
 before_panels={pathlib.Path(f['file']).name:f['contentPanels']for f in initial['reviewCLIReplay']['files']}
 after_panels={pathlib.Path(f['file']).name:f['contentPanels']for f in final['reviewCLIReplay']['files']}
 unchanged_previews=0
 for key,panels in before_panels.items():
  if key.startswith(('rtex043-','ttex051-')):continue
  assert panels==after_panels[key];unchanged_previews+=1
 assert unchanged_previews==24
 scratch_names={'trial.json','rtex043.png','ttex051.png','rtex043-repeat-trial.jpg','ttex051-repeat-trial.jpg'}
 assert len(scratch['files'])==5 and {pathlib.Path(r['removed']).name for r in scratch['files']}==scratch_names
 assert sum(r['bytes']for r in scratch['files'])==scratch['logicalBytes']==2_550_171
 scratch_records=[]
 for row in scratch['files']:
  p=pathlib.Path(row['removed']);assert p.parent==pathlib.Path('/private/tmp/quaked-batch005-seam-trial')and not p.exists()and not p.is_symlink()
  target=ROOT/row['retainedEquivalent'];assert target.is_file()and sha(target.read_bytes())==row['sha256']and target.stat().st_size==row['bytes']
  scratch_records.append({'removed':str(p),'retained':w(target)})
 checkpoint_path=ROOT/'docs/hexen2/textures/batch-005-public-catalog-post-cleanup.json';checkpoint=load(checkpoint_path)
 assert checkpoint['verdict'].startswith('PASS')and checkpoint['measuredCounts']['reviewedWorldNativeIdentities']==29
 coverage=checkpoint['inputs'];assert all(sha((ROOT/r['file']).read_bytes())==r['sha256']for r in coverage)
 assert sha(git('diff','--cached','--binary','--no-ext-diff'))==staged
 REPORT.update({'verdict':'PASS exact85-file owned/untracked retirement scope and5scratch duplicates; activecatalog/source custody intact',
  'retirementReceipt':w(retirement_path),'scratchReceipt':w(scratch_path),'deletedAssetFiles':85,'deletedAssetLogicalBytes':25_178_305,
  'allDeletedPathsAbsent':True,'allDeletedPathsUntrackedInIndexAndHEAD':True,'all85HashesAndSizesBoundToPriorEvidence':True,
  'priorIdentityEvidence':before_evidence,'retainedArchiveCount':13,'retainedArchives':archive_records,'discardedUnchangedPreviewContentReproduced':unchanged_previews,
  'scratchFiles':scratch_records,'scratchLogicalBytes':2_550_171,'retainedOldRecipeJSONPresent':True,
  'declaredProtectedFileCount':ret['protectedFileCount'],'independentRetainedCoverageCount':len(coverage),'independentRetainedCoverageBasis':w(checkpoint_path),
  'protectedSetIdentityLimit':'Coordinator did not persist exact391-name set. Independent catalog/final-source custody coverage is enumerated and verified instead.',
  'stagedDiffUnchanged':True})
except Exception as exc:
 REPORT['verdict']='HOLD';REPORT['error']=repr(exc);raise
finally:
 REPORT['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();OUT.write_text(json.dumps(REPORT,indent=2)+'\n')
 print(json.dumps({'proof':str(OUT),'verdict':REPORT['verdict'],'sha256':sha(OUT.read_bytes())}))
