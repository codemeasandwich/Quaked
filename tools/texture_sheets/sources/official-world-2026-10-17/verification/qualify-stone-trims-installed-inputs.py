"""Seal only the installed stone/brick increment and exact input successors."""
from pathlib import Path
import json,hashlib,subprocess,re,copy
ROOT=Path(__file__).resolve().parents[5];B=Path('tools/texture_sheets/sources/official-world-2026-10-17');V=B/'verification'
HEAD='28765ac38a3da144a7c73986de7d953a76e8d1f1';OLD='a8ea38c718991c3f8a551e8b41c79038657d6864';IDX='4bdc95a3a622fbb0ba71afb6aacde1d0504bfe3c4282b91e8dc2be872eb85faa'
read=lambda p:(Path(p)if Path(p).is_absolute()else ROOT/p).read_bytes();js=lambda p:json.loads(read(p));sha=lambda b:hashlib.sha256(b).hexdigest();git=lambda *a:subprocess.check_output(['git',*a],cwd=ROOT)
def path(p):return Path(p)if Path(p).is_absolute()else ROOT/p
def fileSha(p):
 h=hashlib.sha256()
 with path(p).open('rb')as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def witness(p):return {'file':str(p),'sha256':fileSha(p)}
def cases(raw):
 s=raw.decode();starts=[m.start()for m in re.finditer(r'(?m)^Deno.test\(',s)];assert len(starts)==7;return[s[starts[i]:starts[i+1]if i+1<len(starts)else len(s)]for i in range(len(starts))]
assert git('rev-parse','HEAD').decode().strip()==HEAD and sha(read('newer/textures/index.json'))==IDX
log=read(V/'stone-trims-all111-public-tests-v2.txt').decode();assert 'RESULT 7/7 passed'in log and 'FAIL 'not in log and 'SKIP 'not in log
assert 'TOTAL 9/9 passed'in read(V/'stone-trims-owner5-historical4-public-tests.txt').decode()
for stem,n in [('pack',5),('standard4x',26)]:
 s=read(V/f'stone-trims-{stem}-contract-tests.txt').decode();assert re.search(r'(?:ℹ|#) pass '+str(n)+r'\b',s)and re.search(r'(?:ℹ|#) fail 0\b',s)and re.search(r'(?:ℹ|#) skipped 0\b',s)
s=read(V/'stone-trims-level-assets-tests.txt').decode();assert 'Ran 3 tests'in s and 'OK'in s
oldP=V/'next8-installed-combined-public-input-hashes.json';assert sha(read(oldP))=='d6a9a9a04a9fd4581e675e8bf134162103f9a20cbaafea05e43c0dc78f5a5bcb';old=js(oldP);assert old['head']==OLD and len(old['inputs'])==1648
fiveP=V/'next8-5c-dev-successor-qualification.json';assert sha(read(fiveP))=='2320ae9d70421ee00a9d3748580d79924dea40edc57372a34c89cbc271e5514d'
reg=js(B/'stone-trims-eight-registration.json');beforeB=read(B/'stone-trims-index-before.json');assert sha(beforeB)==reg['beforeIndexSha256']==old['indexSha256'];before=json.loads(beforeB);index=js('newer/textures/index.json');expected=copy.deepcopy(before);expected['version']=2026101811
for e in reg['entries']:
 assert e['key']not in expected.get('ordinaryVariants',{}).get(e['name'],{});expected.setdefault('ordinaryVariants',{}).setdefault(e['name'],{})[e['key']]=e['binding']
assert expected==index and reg['afterIndexSha256']==IDX and json.loads(git('show','HEAD:newer/textures/index.json'))==before
trialBefore=read(B/'stone-trims-trial-before.json');assert sha(trialBefore)==reg['beforeTrialSha256'];trialOld=json.loads(trialBefore);trial=js('newer/textures/candidates-2026-10-12/trial.json');assert sha(read('newer/textures/candidates-2026-10-12/trial.json'))==reg['afterTrialSha256'];assert all(trial[k]==v for k,v in trialOld.items());assert set(trial)-set(trialOld)=={e['name']for e in reg['entries']}
games=js('newer/packs/games.json');gamesBefore=js(B/'stone-trims-games-before.json');assert sha(read(B/'stone-trims-games-before.json'))==next(x['sha256']for x in old['inputs']if x['file']=='newer/packs/games.json');assert json.loads(git('show','HEAD:newer/packs/games.json'))==gamesBefore
assert set(games['textures'])-set(gamesBefore['textures'])=={e['name'].lower()for e in reg['entries']}
for n,v in gamesBefore['textures'].items():assert games['textures'][n]==v
check=copy.deepcopy(games);check['textures']=gamesBefore['textures'];check['sources']['textureNames']=gamesBefore['sources']['textureNames'];assert check==gamesBefore and games['library']=='~/quaked'
update=js(V/'stone-trims-maintained-test-update.json');fix=js(V/'stone-trims-maintained-test-source-wrapper-fix.json');oldTest=read(update['preservedBeforeFile']);currentTest=read(update['file']);assert sha(oldTest)==update['beforeSha256']==next(x['sha256']for x in old['inputs']if x['file']==update['file']);assert sha(read(fix['preservedBeforeFile']))==update['afterSha256']==fix['beforeSha256'];assert sha(currentTest)==fix['afterSha256']
a,b=cases(oldTest),cases(currentTest)
for i in [3,5,6]:assert a[i]==b[i],'unchanged unknown, steel and both-rock cases'
assert a[4].replace('...nextEightReceipt.entries])','...nextEightReceipt.entries,...stoneTrimsReceipt.entries])',1)==b[4]
assert a[1].replace("  execFileSync('/usr/bin/python3'", "  const layerArgs=enc.normalRecipe==='layered-veneer'?['--height-layering',enc.heightLayering.file]:[];\n  execFileSync('/usr/bin/python3'",1).replace("'channels',...pairArgs],","'channels',...pairArgs,...layerArgs],",1)==b[1]
newInstall=b[2];start=newInstall.index('  if(stoneTrimsReceipt.entries.some(');end=newInstall.index('  for(const [,file] of mapBindings(e)) check(f.requests.includes(',start);assert newInstall[:start]+newInstall[end:]==a[2]
start=b[0].index(' const eightKeys=');core=b[0][start:].replace('stoneTrimsRegistrationSha256:sha256(read(stoneTrimsReceiptPath)),','',1);assert core==a[0][a[0].index(' const eightKeys='):]
# Nine exact incoming Dev successors; five explicit owned texture-lane successors.
explicit={'newer/textures/index.json':'Only exact eight reviewed native-key additions plus version, full predecessor semantics exact','newer/packs/games.json':'Only eight new name-to-user lists and textureNames fingerprint, logical library exact','newer/textures/candidates-2026-10-12/trial.json':'Only eight approved diagnostic entries; every complete prior preview unchanged','tests/official_texture_q92_test.js':'Exact8 registration/art/source checks, optional layered CLI args, decoded plane/cached upgrade checks; old unknown/steel/both-rock bodies exact','tools/texture_sheets/encode_official_maps.py':'Parent-reviewed optional layered-veneer branch; default old103 outputs replayed exact, predecessor encoder retained'}
assert sha(read(V/'encoder-before-layered-bricks.py'))==next(x['sha256']for x in old['inputs']if x['file']=='tools/texture_sheets/encode_official_maps.py');assert sha(read('tools/texture_sheets/encode_official_maps.py'))=='6e8a6306bb935a84a93477ee2091065763f7a6d4a8428e5e33a2da6eb148c520'
subprocess.run(['git','merge-base','--is-ancestor',OLD,HEAD],cwd=ROOT,check=True);changes=[];incomingOld=[];inputs={r['file']for r in old['inputs']}
for r in old['inputs']:
 now=fileSha(r['file'])
 if now==r['sha256']:continue
 if r['file']in explicit:reason=explicit[r['file']]
 else:
  oldBlob=git('show',OLD+':'+r['file']);currentBlob=git('show',HEAD+':'+r['file']);assert sha(oldBlob)==r['sha256'] and sha(currentBlob)==now;reason='Exact accepted incoming Dev old/current Git blob transition';incomingOld.append(r['file'])
 changes.append({'file':r['file'],'previousSha256':r['sha256'],'currentSha256':now,'reason':reason})
assert len(changes)==14 and len(incomingOld)==9
assert not git('diff','HEAD','--name-only','--','src','tools/distribution','tools/craft_normals.py','tools/texture_sheets/finish_official_texture.py').strip()
# Exact incoming Dev tree identities are retained independently of dirty candidate files.
priorDev='1ee2fb767638955614b391f5296d578be3563584';incoming=git('diff','--name-only','-z',priorDev,HEAD).decode().rstrip('\0').split('\0');incomingRows=[]
for p in incoming:
 oldBlob=subprocess.run(['git','show',priorDev+':'+p],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE);newBlob=subprocess.run(['git','show',HEAD+':'+p],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 incomingRows.append({'file':p,'beforeGitSha256':sha(oldBlob.stdout)if oldBlob.returncode==0 else None,'currentGitSha256':sha(newBlob.stdout)if newBlob.returncode==0 else None,'workingSha256':fileSha(p)if path(p).is_file()else None})
 if newBlob.returncode==0 and path(p).is_file():
  # Parent retains its three explicitly recorded owner receipts and ledger append.
  if read(p)!=newBlob.stdout:
   assert p==str(B/'CAMPAIGN.md'),'Only parent retained campaign append may differ from incoming Dev'
proofNames=['all111-public-source-proof-v2','owner4-public-source-proof','tech12-public-source-proof','historical45-public-source-proof'];proofs=[js(V/('stone-trims-'+n+'.json'))for n in proofNames];assert all(p['indexSha256']==IDX for p in proofs);assert [p['occurrences']for p in proofs]==[768,24,61,162];assert proofs[0]['bindings']==114
closure=js(V/'stone-trims-combined-delivery-closure.json');assert closure['indexSha256']==IDX and closure['combinedSelectedQ92Maps']==571;generated=js(V/'stone-trims-all111-delivery-closure.json');assert generated['bindings']==114 and generated['uniqueQ92Files']==555
paks=[];packPaths=set()
for proof in proofs:
 for s in proof['sources']:
  for k in ['actualPack','pack','palettePack']:
   if s.get(k):packPaths.add(s[k])
assert len(packPaths)==6
for p in sorted(packPaths):
 h=fileSha(p);prior=next(x for x in old['actualSourcePaks']if x['path']==p);assert prior['sha256']==h;paks.append({'path':p,'realPath':str(path(p).resolve(strict=True)),'bytes':path(p).stat().st_size,'sha256':h,'unchangedFromPrior1648Proof':True})
inputs.update(incoming);inputs.discard(str(B/'CAMPAIGN.md'))
for p in (ROOT/V).glob('stone-trims-*'):
 if p.is_file()and p.name!='stone-trims-installed-public-input-hashes.json':inputs.add(str(p.relative_to(ROOT)))
inputs.update([str(oldP),str(fiveP),str(B/'stone-trims-eight-registration.json'),str(B/'stone-trims-index-before.json'),str(B/'stone-trims-trial-before.json'),str(B/'stone-trims-games-before.json'),str(B/'stone-trims-eight-finish-v3.json'),str(B/'install_stone_trims_eight.py'),str(V/'qualify-stone-trims-installed-inputs.py')])
# The exact new authoring/reference corpus is custody, not art approval of held predecessors.
for p in git('ls-files','--others','--exclude-standard','-z','--',str(B),'newer/textures/candidates-2026-10-17').decode().rstrip('\0').split('\0'):
 if p and path(p).is_file()and not p.endswith('stone-trims-installed-public-input-hashes.json'):inputs.add(p)
for e in reg['entries']:
 enc=js(e['encodingReceipt']);inputs.update([e['encodingReceipt'],e['sourceFile'],enc['authoringDiffuse']]);inputs.update(v['file']for v in enc['outputs'].values())
for p in ['tools/texture_sheets/update_level_sheets.py',str(B/'compose_solid_brick_modules.py'),str(B/'finish_registered_columns.py')]:inputs.add(p)
inputs={p for p in inputs if path(p).is_file()}
rows=[witness(p)for p in sorted(inputs)]
assert git('rev-parse','HEAD').decode().strip()==HEAD and sha(read('newer/textures/index.json'))==IDX
result={'qualification':'Independent installed eight-material public/encoder/source/pack qualification on exact incoming Dev28765; art/GPU/owner acceptance, normal gate and publication remain separate. No staging, commit, source changes or build by this helper.','head':HEAD,'indexSha256':IDX,'version':index['version'],'generatedArtworks':111,'generatedNativeBindings':114,'generatedCompanionMaps':555,'formatBindings':10,'formatCompanionMaps':16,'selectedQ92CompanionMaps':571,'prior1648Receipt':witness(oldP),'prior5cReceipt':witness(fiveP),'previousInputPreservation':{'previousInputs':1648,'unchanged':1634,'onlyExplicitSuccessors':changes,'scope':'All old material maps, native inputs, source records and old normal/craft math unchanged. Optional encoder successor preserves all103default outputs byte-for-byte. Nine incoming Dev sources exact old/current Git blobs, five texture-lane successors explicitly validated.'},'incomingDev':{'previousPublishedHead':priorDev,'currentHead':HEAD,'paths':len(incomingRows),'exactGitBlobs':incomingRows,'note':'Parent campaign ledger append is retained separately; it is not a public material input.'},'testPreservation':{'unknownSteelBothRockBodies':'byte-exact','caseBody':'only eight names appended','encoderBody':'only conditional layered arguments added','installBody':'only two decoded-plane/cache checks added','priorFirstCaseCore':'byte-exact apart from new registration SHA field'},'checks':{'generatedPublic':7,'ownerAndTechPublic':5,'historicalPublic':4,'pythonLevel':3,'pack':5,'standard4xIncludingNestedNegativeCases':26,'totalReportedChecks':50,'currentFailures':0,'skips':0},'actualRetainedFailure':{'log':str(V/'stone-trims-all111-public-tests.txt'),'result':'6/7 passed; newly added plain-fit assertion failed for approved X-landmark wstone17 wrapper. All111 actual encoders passed already.','fix':witness(V/'stone-trims-maintained-test-source-wrapper-fix.json'),'currentLog':str(V/'stone-trims-all111-public-tests-v2.txt'),'currentResult':'7/7 passed; all111encoders replayed again'},'sources':{'generatedOccurrences':768,'newCohortOccurrences':39,'ownerOccurrences':24,'techOccurrences':61,'historical45Occurrences':162,'note':'Overlapping verification scopes, not summed unique originals'},'producerProof':'Current encoder replays all111artworks exactly, including old103unchanged/default, new2layered and current4steelpartner recipes; independent steel coordinate maths reproduces XYZ bytes. Source-proven brick module producer reproduces both PNG bases. Public decodedR/XYZ/heightalpha/UV/Classic/cache/unknown/case controls pass.','collector':closure['profiles'],'retainedUnboundHistoricalQ95':closure['retainedUnboundHistoricalQ95'],'actualSourcePaks':paks,'inputs':rows,'inputScope':'Selected assets, maintained/public/tool code, exact Dev input successors and retained authoring/review evidence. Custody of old held drafts is not acceptance. Parent current GPU/ledger work is qualified separately.'}
out=ROOT/V/'stone-trims-installed-public-input-hashes.json';assert not out.exists();out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'head':HEAD,'index':IDX,'checks':50,'inputs':len(rows),'unchangedOldInputs':1634,'explicitSuccessors':14,'incomingPaths':len(incomingRows),'sourcePAKs':len(paks),'maps':571,'receiptSha256':sha(out.read_bytes())}))
