"""Read-only three-way file custody inventory; writes only this report directory."""
from pathlib import Path
import subprocess,hashlib,json,os,stat,collections,datetime
ROOT=Path('/Users/bri/.codex/worktrees/fc24/Quaked');CLONE=Path('/private/tmp/quaked-sync-dev-20261021-fc24');OUT=Path(__file__).resolve().parent
OLD='713b47d322f0674f154a70ec4baebd4566905d41';TREE='2efcdb14248ea605ed09d0cbc457cf0ce47fcc47'
SCOPES=['assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19','docs/hexen2','tools/texture_sheets/sources/hexen2-world-2026-10-19']
def git(cwd,*args):return subprocess.check_output(['git',*args],cwd=cwd,stderr=subprocess.PIPE)
def inventory(cwd,rev):
 rows=git(cwd,'ls-tree','-r','-z',rev,'--',*SCOPES).split(b'\0');out={}
 for b in rows:
  if not b:continue
  meta,path=b.split(b'\t',1);mode,kind,oid=meta.decode().split();out[path.decode()]={'mode':mode,'kind':kind,'oid':oid}
 return out
old=inventory(ROOT,OLD);incoming=inventory(CLONE,TREE)
status=git(ROOT,'status','--porcelain=v1','-z','--untracked-files=all','--',*SCOPES).split(b'\0')
rows=[];unstable=[]
for entry in status:
 if not entry:continue
 state=entry[:2].decode();name=entry[3:].decode();p=ROOT/name
 before=p.lstat()
 if stat.S_ISLNK(before.st_mode):data=os.readlink(p).encode();mode='120000'
 elif stat.S_ISREG(before.st_mode):data=p.read_bytes();mode='100755' if before.st_mode&0o111 else '100644'
 else:raise ValueError('Unsupported scope path '+name)
 after=p.lstat();stable=(before.st_ino,before.st_size,before.st_mtime_ns)==(after.st_ino,after.st_size,after.st_mtime_ns)
 oid=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest();o=old.get(name);i=incoming.get(name)
 equal=lambda r:r is not None and r['oid']==oid and r['mode']==mode
 if equal(i):classification='exact_working_bytes_and_mode_in_incoming'
 elif equal(o):classification='working_equals_old_head_incoming_differs'
 elif i is None:classification='working_only_absent_from_incoming'
 elif o is not None and o==i:classification='genuine_local_change_incoming_equals_old'
 else:classification='divergent_working_bytes_require_preservation'
 row={'path':name,'status':state,'classification':classification,'working':{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'gitBlob':oid,'mode':mode,'inode':before.st_ino,'mtimeNs':before.st_mtime_ns,'stableDuringRead':stable},'oldHead':o,'incomingTree':i}
 rows.append(row)
 if not stable:unstable.append(name)
counts=dict(collections.Counter(r['classification']for r in rows));groups={}
for group,prefix in [('asset-batch007',SCOPES[0]+'/batch-007/'),('asset-batch008',SCOPES[0]+'/batch-008/'),('asset-catalog',SCOPES[0]+'/catalog.json'),('docs-batch007','docs/hexen2/textures/batch-007'),('docs-batch008','docs/hexen2/textures/batch-008'),('other-hexen-docs','docs/hexen2/')]:
 selected=[r for r in rows if r['path'].startswith(prefix)];groups[group]={'files':len(selected),'bytes':sum(r['working']['bytes']for r in selected),'classifications':dict(collections.Counter(r['classification']for r in selected))}
report={'schemaVersion':1,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':SCOPES,'root':str(ROOT),'actualRootHead':git(ROOT,'rev-parse','HEAD').decode().strip(),'oldHead':OLD,'incomingClone':str(CLONE),'incomingCloneHead':git(CLONE,'rev-parse','HEAD').decode().strip(),'incomingCloneMergeHead':git(CLONE,'rev-parse','MERGE_HEAD').decode().strip(),'incomingTree':TREE,'classificationRule':'Exact is full Git blob+file mode; SHA256 retained separately. Different does not mean obsolete. No semantic supersession or deletion authority is inferred.','statusRawSha256':hashlib.sha256(b'\0'.join(status)).hexdigest(),'counts':counts,'groupCounts':groups,'unstableFiles':unstable,'totalWorkingBytes':sum(r['working']['bytes']for r in rows),'files':rows}
(OUT/'three-way.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k]for k in ['counts','groupCounts','unstableFiles','totalWorkingBytes']},indent=2))
