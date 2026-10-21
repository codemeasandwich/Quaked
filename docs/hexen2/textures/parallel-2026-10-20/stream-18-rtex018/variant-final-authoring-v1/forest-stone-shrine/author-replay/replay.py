"""Author self replay of unchanged direct-tier and public-review CLIs, not independent review."""
from pathlib import Path
import hashlib,json,subprocess,tempfile,shutil,datetime
R=Path('/Users/bri/SOURCE/Quaked');D=Path(__file__).parent;S=D.parent;A=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018/art-variants/forest-stone-shrine';h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();b=lambda p:{'file':str(p.relative_to(R)),'sha256':h(p)}
inputs=[A/'source-selections/s1.json',A/'masters/layered-v1/master.json',A/'masters/layered-v1/color.png',A/'masters/layered-v1/height.npy',A/'tiers/final-v1/manifest.json',A/'batch-final-v1.json']+list((A/'tiers/final-v1').glob('*.webp'))+list((A/'review/final-v1').glob('*'));before={str(p):h(p)for p in inputs};temp=Path(tempfile.mkdtemp(prefix='rtex018-forest-stone-shrine-author-replay-'));runs=[]
for label,issued,actual in [('tiers',S/'derivation/issued.json',A/'tiers/final-v1'),('review',S/'public-review/issued.json',A/'review/final-v1')]:
 argv=json.loads(issued.read_text())['argv'];out=temp/label;argv[argv.index('--output')+1]=str(out);p=subprocess.run(argv,cwd=str(R),capture_output=True,text=True);(D/(label+'-stdout.txt')).write_text(p.stdout);(D/(label+'-stderr.txt')).write_text(p.stderr)
 matches=[]
 if p.returncode==0:
  for q in sorted(actual.glob('*')):
   if q.is_file():matches.append({'file':str(q.relative_to(R)),'actualSha256':h(q),'replaySha256':h(out/q.name),'exactBytes':q.read_bytes()==(out/q.name).read_bytes()})
 runs.append({'CLI':label,'argv':argv,'exitCode':p.returncode,'stdout':b(D/(label+'-stdout.txt')),'stderr':b(D/(label+'-stderr.txt')),'files':matches})
assert all(h(Path(p))==digest for p,digest in before.items());passed=all(x['exitCode']==0 and all(y['exactBytes']for y in x['files'])for x in runs)
report={'schemaVersion':1,'verdict':'PASS author fullbyte direct-tier/publicreview replay'if passed else'HOLD fullbyte replay difference retained for bounded assessment','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSelection':b(A/'source-selections/s1.json'),'master':b(A/'masters/layered-v1/master.json'),'tierManifest':b(A/'tiers/final-v1/manifest.json'),'descriptor':b(A/'batch-final-v1.json'),'runs':runs,'allInputHashesStable':True,'sourceHistory':'Immutable selectionbindsfamily4calls andselectedancestry3; no primaryraw-equality assumption. No newmodelcalls.','independence':'Author self replay only;06owns independent math/codec/physical/publicfinalreview.','scratchRemoved':passed,'retainedScratchOnFailure':None if passed else str(temp)}
if passed:shutil.rmtree(temp)
with(D/'author-replay.json').open('x')as o:json.dump(report,o,indent=2);o.write('\n')
print(json.dumps({'verdict':report['verdict'],'receipt':h(D/'author-replay.json'),'filesExact':{x['CLI']:sum(y['exactBytes']for y in x['files'])for x in runs},'scratchRemoved':passed}))
