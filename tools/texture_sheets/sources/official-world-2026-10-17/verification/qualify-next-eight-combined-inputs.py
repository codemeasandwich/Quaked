from pathlib import Path
import json,hashlib,subprocess,re,copy
ROOT=Path(__file__).resolve().parents[5] if 'verification' in str(Path(__file__).resolve()) else Path('/Users/bri/.codex/worktrees/official-textures-next/Quaked')
B=Path('tools/texture_sheets/sources/official-world-2026-10-17');V=B/'verification';sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:(ROOT/p).read_bytes();js=lambda p:json.loads(read(p));git=lambda *a:subprocess.check_output(['git',*a],cwd=ROOT)
def fileSha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def actualPath(p):return Path(p)if Path(p).is_absolute()else ROOT/p
HEAD='a8ea38c718991c3f8a551e8b41c79038657d6864';OLD='4bef35dae25f758d0774fe94766117bf43a0b7ad';EXPECTED='0541eece8abaa369339ff2209387025b2c2045e03960294f720859511822268a';assert git('rev-parse','HEAD').decode().strip()==HEAD;assert sha(read('newer/textures/index.json'))==EXPECTED
for stem,n in [('owner5',5),('historical45',4),('all103',7)]:
 s=read(V/f'next8-{stem}-public-tests.txt').decode();assert f'TOTAL {n}/{n} passed'in s and 'FAIL 'not in s and 'SKIP 'not in s
assert 'Ran 3 tests'in read(V/'next8-level-assets-tests.txt').decode()and'OK'in read(V/'next8-level-assets-tests.txt').decode()
for stem,n in [('standard4x',26),('pack',5)]:
 s=read(V/f'next8-{stem}-contract-tests.txt').decode();assert re.search(r'(?:ℹ|#) pass '+str(n)+r'\b',s)and re.search(r'(?:ℹ|#) fail 0\b',s)and re.search(r'(?:ℹ|#) skipped 0\b',s)
oldPath=V/'tech12-installed-public-input-hashes.json';oldBytes=read(oldPath);assert sha(oldBytes)=='5eb92c4135565ecb5f399605b234f3efcdae7b95985aba1c97b49fe58e62db20';old=json.loads(oldBytes);assert old['head']==OLD
registration=js(B/'next-eight-registration.json');beforeBytes=read(B/'next-eight-index-before.json');assert sha(beforeBytes)==registration['beforeIndexSha256']==old['indexSha256'];before=json.loads(beforeBytes);current=js('newer/textures/index.json');expected=copy.deepcopy(before);expected['version']=2026101810
for e in registration['entries']:
 assert e['key']not in expected.get('ordinaryVariants',{}).get(e['name'],{});expected.setdefault('ordinaryVariants',{}).setdefault(e['name'],{})[e['key']]=e['binding']
assert current==expected and registration['afterIndexSha256']==EXPECTED
# The current Dev has no texture catalogue changes; replay the retained tech6
# filename-only overlay to connect exact Dev f8 to saved7ad, without rewriting it.
base=json.loads(git('show','HEAD:newer/textures/index.json'));tech=js(B/'legacy-tech-twelve-q92-v1.json');base['version']=2026101809
for e in tech['bindings']:base['textures'][e['name']]=e['current']['file'];base['normals'][e['name']]=e['current']['normal']
assert base==before
# Exact game-index successor: eight names plus textureNames fingerprint only.
games=js('newer/packs/games.json');gamesBefore=json.loads(git('show','HEAD:newer/packs/games.json'));added=set(games['textures'])-set(gamesBefore['textures']);assert added=={e['name'].lower()for e in registration['entries']}
for n,v in gamesBefore['textures'].items():assert games['textures'][n]==v
check=copy.deepcopy(games);check['textures']=gamesBefore['textures'];check['sources']['textureNames']=gamesBefore['sources']['textureNames'];assert check==gamesBefore and games['library']=='~/quaked'
update=js(V/'next8-maintained-test-update.json');assert sha(read(update['file']))==update['afterSha256'];testBefore=read(update['preservedBeforeFile']);assert sha(testBefore)==update['beforeSha256'];testAfter=read(update['file'])
def cases(raw):
 s=raw.decode();starts=[m.start()for m in re.finditer(r'(?m)^Deno.test\(',s)];assert len(starts)==7;return[s[starts[i]:starts[i+1]if i+1<len(starts)else len(s)]for i in range(len(starts))]
a,b=cases(testBefore),cases(testAfter)
for i in [1,2,3,5,6]:assert a[i]==b[i]
assert a[4].replace('...crosspackSixReceipt.entries])','...crosspackSixReceipt.entries,...nextEightReceipt.entries])',1)==b[4]
priorCore=a[0][a[0].index(' const crosspackKeys='):];newCore=b[0][b[0].index(' const crosspackKeys='):].replace('nextEightRegistrationSha256:sha256(read(nextEightReceiptPath)),','',1);assert priorCore==newCore
# Only exact accepted incoming-Dev bytes may succeed any old input; no path waiver.
subprocess.run(['git','merge-base','--is-ancestor',OLD,HEAD],cwd=ROOT,check=True);incoming=git('diff','--name-only','-z',OLD,HEAD).decode().rstrip('\0').split('\0');assert len(incoming)==57;incomingRows=[]
for p in incoming:
 newBlob=subprocess.run(['git','show',HEAD+':'+p],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE);oldBlob=subprocess.run(['git','show',OLD+':'+p],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if newBlob.returncode==0:assert (ROOT/p).read_bytes()==newBlob.stdout
 else:assert not(ROOT/p).exists()
 incomingRows.append({'file':p,'beforeSha256':sha(oldBlob.stdout)if oldBlob.returncode==0 else None,'currentDevSha256':sha(newBlob.stdout)if newBlob.returncode==0 else None,'workingBytesExactlyCurrentDev':True})
changed=[];inputs={r['file']for r in old['inputs']};explicit={'newer/textures/index.json':'Only exact eight approved ordinaryVariants additions plus version after saved7ad','newer/packs/games.json':'Only exact eight new material-name lists plus textureNames fingerprint','tests/official_texture_q92_test.js':'Only reviewed eight-cohort test extension; five prior test bodies byte-exact, prior case body only gains eight names, prior first-case core exact'}
for witness in old['inputs']:
 p=witness['file'];now=fileSha(actualPath(p))
 if now==witness['sha256']:continue
 if p in explicit:
  reason=explicit[p]
  if p=='newer/textures/index.json':assert witness['sha256']==sha(beforeBytes)
  if p=='tests/official_texture_q92_test.js':assert witness['sha256']==sha(testBefore)
 else:
  assert p in incoming;row=next(x for x in incomingRows if x['file']==p);assert row['beforeSha256']==witness['sha256']and row['currentDevSha256']==now;reason='Exact owner-accepted incomingDev commit bytes, old4bef and currenta8ea Git blobs individually verified'
 changed.append({'file':p,'previousSha256':witness['sha256'],'currentSha256':now,'approvedReason':reason})
assert {x['file']for x in changed}=={'newer/textures/index.json','newer/packs/games.json','tests/official_texture_q92_test.js','tools/distribution/manifest.mjs'}
assert not git('diff','HEAD','--name-only','--','src','tools/distribution','tools/craft_normals.py','tools/texture_sheets/encode_official_maps.py','tools/texture_sheets/finish_official_texture.py').strip(),'No lane production-code changes'
proofs=[js(V/f'next8-{n}-source-proof.json')for n in ['all103-public','owner4-public','tech12-public','historical45']];assert all(p['indexSha256']==EXPECTED for p in proofs);assert [p['occurrences']for p in proofs]==[729,24,61,162];assert proofs[0]['bindings']==106
closure=js(V/'next8-combined-delivery-closure.json');assert closure['indexSha256']==EXPECTED and closure['combinedSelectedQ92Maps']==531
for p in (ROOT/V).glob('next8-*'):
 if p.is_file()and p.name!='next8-installed-combined-public-input-hashes.json':inputs.add(str(p.relative_to(ROOT)))
inputs.update([str(oldPath),str(B/'next-eight-registration.json'),str(B/'next-eight-index-before.json'),str(B/'next-eight-trial-before.json'),str(B/'next-eight-finish-v1.json'),'newer/textures/candidates-2026-10-12/trial.json',str(V/'next-eight-independent-art-review.json'),str(V/'next-eight-independent-render-inputs.json'),str(V/'render_next_eight_independent_review.mjs'),str(V/'verify-next-eight-generated-pack-closure.mjs'),str(V/'verify-next-eight-combined-pack-closure.mjs'),'src/newer/install.js','tools/run_tests.mjs'])
inputs.update(incoming);inputs.update(update['copiedIndependentReviewFiles']);inputs.add(str(V/'qualify-next-eight-combined-inputs.py'))
review=js(V/'next-eight-independent-art-review.json');assert sha(read(V/'next-eight-independent-art-review.json'))=='97b9860a8c1aae3af8cd44fbda73fe827d2788667a600f7848e095f29dc126c2'
for row in review['inputs']:assert sha(read(row['file']))==row['sha256'];inputs.add(row['file'])
for e in registration['entries']:
 enc=js(e['encodingReceipt']);inputs.update([e['encodingReceipt'],enc['original'],enc['authoringDiffuse']]);inputs.update(m['file']for m in enc['outputs'].values())
 for file,digest in [(e['binding']['file'],e['diffuseSha256']),(e['binding']['normal']['file'],e['heightSha256']),*[(e['binding']['normal']['normalChannels'][axis],e['normalChannelSha256'][axis])for axis in ['x','y','z']]]:
  p='newer/textures/'+file;assert sha(read(p))==digest;inputs.add(p)
for n in ['horizontal-trim-reuse-v1.json','prepare_horizontal_trims.py','wmet4_4c-reviewed-photo-base-v1.json','metal5_85_JM-reviewed-photo-base-v1.json']:inputs.add(str(B/n))
packPaths=set()
for proof in proofs:
 for s in proof['sources']:
  for key in ['actualPack','pack','palettePack']:
   if s.get(key):packPaths.add(s[key])
assert len(packPaths)==6;paks=[]
for p in sorted(packPaths):
 h=fileSha(Path(p));prior=next(x for x in old['actualSourcePaks']if x['path']==p);assert h==prior['sha256'];paks.append({'path':p,'realPath':str(Path(p).resolve(strict=True)),'bytes':Path(p).stat().st_size,'sha256':h,'unchangedSinceTech7adQualification':True})
result={'qualification':'Current combined independent public/producer/PAK/normal/collector qualification on exact incoming Dev a8ea plus tech12 and approved8photographic keys. No staging, nativebuild, commit, push or release by helper; actualGPU/art owner acceptance and normalgate/publication separate.','head':HEAD,'historicalTechHead':OLD,'indexSha256':EXPECTED,'version':current['version'],'preservedTechReceipt':{'file':str(oldPath),'sha256':sha(oldBytes),'indexSha256':old['indexSha256'],'unchanged':True},'approvedIndexSuccessor':'Only the eight literal reviewed source-key ordinaryVariants additions plus version after exact saved7ad; full prior catalogue semantics unchanged.','generatedArtworks':103,'generatedNativeBindings':106,'generatedCompanionMaps':515,'formatBindings':10,'formatCompanionMaps':16,'selectedQ92CompanionMaps':531,'tests':{'generatedPublic':7,'ownerAndTechPublic':5,'historicalPublic':4,'pythonLevel':3,'packs':5,'targetedSubtotal':24,'standard4xIncludingNestedNegativeCases':26,'totalReportedChecks':50,'failures':0,'skips':0},'sources':{'generatedOccurrences':729,'ownerFourOccurrences':24,'techSixOccurrences':61,'historical45Occurrences':162,'scope':'Sets overlap; not added as unique native originals.'},'producerProof':'All103actualencoder replays and4directedsteel mathematical byte checks pass; actualhorizontalplain/marked source producer replays bothPNGbytes,8unrotatedhead centers and protectedrailrows. Sourcephoto→fitter→seam→encoder/diagnostic chains are hashbound.','previousInputPreservation':{'previousInputs':len(old['inputs']),'exactlyUnchangedInputs':len(old['inputs'])-len(changed),'onlyExplicitSuccessors':changed,'oldGeneratedControlBodies':'Encoder/install/unknown/steel/bothrock cases byte-exact; prior case body only extends eight names; prior first-case core unchanged.'},'incomingDev':{'oldCommit':OLD,'currentCommit':HEAD,'paths':len(incomingRows),'exactGitBlobTransitions':incomingRows,'laneProductionCodeModified':False,'actualNewBootstrapSha256':sha(read('src/newer/install.js')),'actualNewManifestSha256':sha(read('tools/distribution/manifest.mjs'))},'collector':closure['profiles'],'retainedHistoricalQ95':closure['retainedUnboundHistoricalQ95'],'inputs':[{'file':p,'sha256':fileSha(actualPath(p))}for p in sorted(inputs)],'actualSourcePaks':paks,'actualFailures':'No public/test failures in this cohort. Initial automatic-permission-review timeout prevented first command from starting; unchanged readback/quiescence preceded parentff. It is not a test failure or unsafe-action finding.'}
assert git('rev-parse','HEAD').decode().strip()==HEAD and sha(read('newer/textures/index.json'))==EXPECTED and sha(read(oldPath))=='5eb92c4135565ecb5f399605b234f3efcdae7b95985aba1c97b49fe58e62db20'
(ROOT/V/'next8-installed-combined-public-input-hashes.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'checks':50,'failures':0,'skips':0,'maps':531,'inputs':len(inputs),'oldInputsUnchanged':len(old['inputs'])-len(changed),'explicitOldSuccessors':len(changed),'incomingDevPaths':len(incomingRows),'sourcePAKs':len(paks)}))
