"""Bounded exact-input successor; does not replay unchanged encoders or render."""
from pathlib import Path
import hashlib,json,subprocess,re
R=Path(__file__).resolve().parents[5];B=Path('tools/texture_sheets/sources/official-world-2026-10-17');V=B/'verification';OLD='28765ac38a3da144a7c73986de7d953a76e8d1f1';HEAD='ab554cf61a2650c7ae84ed5dc96dcc45c4cb1010';IDX='4bdc95a3a622fbb0ba71afb6aacde1d0504bfe3c4282b91e8dc2be872eb85faa'
def path(p):return Path(p)if Path(p).is_absolute()else R/p
def read(p):return path(p).read_bytes()
def js(p):return json.loads(read(p))
def sha(b):return hashlib.sha256(b).hexdigest()
def fileSha(p):
 h=hashlib.sha256()
 with path(p).open('rb')as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def pin(p):return {'file':str(p),'sha256':fileSha(p)}
def git(*args):return subprocess.check_output(['git',*args],cwd=R)
assert git('rev-parse','HEAD').decode().strip()==HEAD and sha(read('newer/textures/index.json'))==IDX
priorP=V/'stone-trims-installed-public-input-hashes.json';priorSha='3c463c89e54a1da13dcba267211e298f4e49dee1972e2b49fbe6666894744032';assert sha(read(priorP))==priorSha;prior=js(priorP);assert prior['head']==OLD and len(prior['inputs'])==2173
subprocess.run(['git','merge-base','--is-ancestor',OLD,HEAD],cwd=R,check=True)
incoming=git('diff','--name-only','-z',OLD,HEAD).decode().rstrip('\0').split('\0');assert len(incoming)==91
blobs=[]
for p in incoming:
 before=subprocess.run(['git','show',OLD+':'+p],cwd=R,stdout=subprocess.PIPE,stderr=subprocess.PIPE);after=subprocess.run(['git','show',HEAD+':'+p],cwd=R,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if after.returncode==0:assert read(p)==after.stdout
 else:assert not path(p).exists()
 blobs.append({'file':p,'previousGitSha256':sha(before.stdout)if before.returncode==0 else None,'currentGitSha256':sha(after.stdout)if after.returncode==0 else None,'workingTreeExactlyIncoming':True})
changes=[]
for witness in prior['inputs']:
 now=fileSha(witness['file'])
 if now==witness['sha256']:continue
 row=next(x for x in blobs if x['file']==witness['file']);assert row['previousGitSha256']==witness['sha256'] and row['currentGitSha256']==now
 changes.append({'file':witness['file'],'previousSha256':witness['sha256'],'currentSha256':now,'authority':'Exact incoming Dev Git blobs; no texture-lane exception'})
assert {x['file']for x in changes}=={'docs/full-distribution-2026-10-18.md','tools/distribution/engine-tests.mjs'}
protected=['tools/texture_sheets/encode_official_maps.py','tools/craft_normals.py','tools/texture_sheets/update_level_sheets.py','tools/texture_sheets/finish_official_texture.py','src/newer/render/normal_math.js','src/newer/render/gl_normals.js','src/newer/render/r_newertextures.js','tests/official_texture_q92_test.js','tests/official_texture_owner_q92_test.js','tests/official_texture_registration_test.js','tests/level_texture_assets_test.py','tests/standard_4x_records_contract_test.mjs','tests/official_texture_trial.js','tests/official_texture_trial.html','newer/textures/index.json','newer/packs/games.json','tools/distribution/manifest.mjs','tools/distribution/packs.mjs']
supplementary=[]
for p in protected:
 old=next((x for x in prior['inputs']if x['file']==p),None)
 if old is not None:assert fileSha(p)==old['sha256']
 elif p in ['tests/official_texture_trial.js','tests/official_texture_trial.html']:
  gpuP=V/'stone-trims-gpu-independent-visual-review.json';assert fileSha(gpuP)=='11e4c48715cd5a5a2b7228783d7cfef5395b297595b32553c182930c93cd3b05';gpu=js(gpuP);w=next(x for x in gpu['inputs']if Path(x['file'])==R/p);assert fileSha(p)==w['sha256'];supplementary.append({'file':p,'sha256':w['sha256'],'basis':'Exact historical28765GPU review source witness; absent from original2173 CPU/public input set'})
 else:
  assert p=='tools/texture_sheets/finish_official_texture.py';before=git('show',OLD+':'+p);after=git('show',HEAD+':'+p);assert before==after==read(p);supplementary.append({'file':p,'sha256':sha(before),'basis':'Exact old28765/currentab55/working Git bytes; absent from prior2173 input set'})
assert not git('diff',OLD,HEAD,'--name-only','--','newer/textures','newer/packs','tools/texture_sheets','tools/craft_normals.py','src/newer/render/normal_math.js','src/newer/render/gl_normals.js','src/newer/render/r_newertextures.js','tests/official_texture_q92_test.js','tests/official_texture_owner_q92_test.js','tests/official_texture_registration_test.js','tests/official_texture_trial.js','tests/official_texture_trial.html').strip()
# Whole PAK custody permits reuse of previous actual-source public proofs.
paks=[]
for old in prior['actualSourcePaks']:
 assert path(old['path']).stat().st_size==old['bytes'];h=fileSha(old['path']);assert h==old['sha256'];paks.append({**old,'sha256':h,'exactlyUnchangedFrom28765':True})
assert len(paks)==6
log=read(V/'stone-trims-ab55-pack-contract-tests.txt').decode();assert re.search(r'(?:ℹ|#) pass 5\b',log)and re.search(r'(?:ℹ|#) fail 0\b',log)and re.search(r'(?:ℹ|#) skipped 0\b',log)
generated=js(V/'stone-trims-ab55-all111-delivery-closure.json');combined=js(V/'stone-trims-ab55-combined-delivery-closure.json');assert generated['indexSha256']==combined['indexSha256']==IDX;assert generated['bindings']==114 and generated['uniqueQ92Files']==555 and combined['combinedSelectedQ92Maps']==571
oldG=js(V/'stone-trims-all111-delivery-closure.json');assert oldG['ownership']==generated['ownership'];oldC=js(V/'stone-trims-combined-delivery-closure.json');assert oldC['ownership']==combined['ownership']and oldC['retainedUnboundHistoricalQ95']==combined['retainedUnboundHistoricalQ95']
reviewP=V/'stone-trims-gpu-independent-visual-review.json';mdP=V/'STONE-TRIMS-GPU-VISUAL-REVIEW.md';assert fileSha(reviewP)=='11e4c48715cd5a5a2b7228783d7cfef5395b297595b32553c182930c93cd3b05';assert fileSha(mdP)=='587a7ac620f1a1f86374e2e386c88b8e6d7c27adfa1c25ff29577bacf129d38b';review=js(reviewP);assert review['drawsClaimedHead']==OLD
newEvidence=[str(p.relative_to(R))for p in (R/V).glob('stone-trims-ab55-*')if p.is_file()and p.name!='stone-trims-ab55-dev-successor-qualification.json']
newEvidence +=[str(V/'verify-stone-trims-ab55-generated-pack-closure.mjs'),str(V/'verify-stone-trims-ab55-combined-pack-closure.mjs'),str(V/'qualify-stone-trims-ab55-successor.py'),str(V/'qualify-stone-trims-ab55-successor-initial.py'),str(priorP),str(reviewP),str(mdP),str(V/'stone-trims-ROOT-location-precision-correction.json')]
inputs={x['file']for x in prior['inputs']}|set(incoming)|set(newEvidence)
inputs={p for p in inputs if path(p).is_file()};rows=[pin(p)for p in sorted(inputs)]
result={'qualification':'Bounded exact-input Dev successor qualification only. Previous50 public/source/encoder checks remain historical28765 evidence; unchanged-input reuse is explicit. Fresh currentpack5/collector proof; parent reruns actual8GPU because global render shader/target/liquid code changed. No rerun111encoders, browser, heavy build, source/assets/index/test mutation, staging or publication.','head':HEAD,'previousHead':OLD,'indexSha256':IDX,'predecessorReceipt':pin(priorP),'previousInputsCompared':2173,'exactlyUnchangedInputs':2171,'onlyExactIncomingDevSuccessors':changes,'incomingPaths':91,'exactGitBlobTransitions':blobs,'protectedProducerMaterialTestInputs':{'unchanged':True,'explicitPaths':[pin(p)for p in protected],'supplementaryWitnesses':supplementary,'scope':'All prior2173 compared; selected images/native inputs/recipes/source proofs unchanged, not merely these named paths.'},'wholeSourcePaks':paks,'previousChecksReused':{'head':OLD,'reportedChecks':50,'result':'PASS, zero current test failure/skips after retained named-wrapper correction','basis':'Every relevant CPU/source/producer/public-test input and six whole PAKs byte-exact. No111encoder rerun required.','retainedInitialFailure':'Original6/7 public assertion failure and exact source-wrapper fix remain preserved in predecessor proof.'},'retainedHelperFailure':{'file':str(V/'stone-trims-ab55-qualifier-initial-failure.json'),'scope':'Verifier assumed three explicitly named protected files appeared in prior2173. Added exact historicalGPU or Git witnesses for these paths; no prior-input comparison or acceptance relaxed.'},'currentChecksRun':{'packContracts':5,'pass':5,'fail':0,'skip':0,'collector':'555 generated +16 format =571 selected companion maps; every indexed game can reach its maps.'},'currentCollector':combined['profiles'],'ownershipComparedWith28765':'Generated and format per-game ownership/reachability records exact; current collectors executed again.','retainedUnboundHistoricalQ95':combined['retainedUnboundHistoricalQ95'],'GPUQualification':{'historicalVisualReview':pin(reviewP),'historicalReviewHead':OLD,'scope':'Copied byte-exact as historical evidence only. Incoming r_post_shaders/r_post_targets/r_post_liquids affect GPU; parent currentab55 captures/review remain separate and are not claimed here.'},'preciseROOTLocationCorrection':pin(V/'stone-trims-ROOT-location-precision-correction.json'),'inputs':rows,'currentEvidence':[pin(p)for p in sorted(newEvidence)],'limits':['No all-level gameplay, arbitrary camera/mip or temporal-shimmer qualification','No currentGPU visual acceptance from previous28765 captures','No normal gate, final frozen tree, owner acceptance or Dev publication claim']}
assert git('rev-parse','HEAD').decode().strip()==HEAD and sha(read('newer/textures/index.json'))==IDX and sha(read(priorP))==priorSha
p=R/V/'stone-trims-ab55-dev-successor-qualification.json';assert not p.exists();p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'head':HEAD,'indexSha256':IDX,'oldInputsCompared':2173,'unchanged':2171,'onlyExactDevSuccessors':len(changes),'incomingPaths':91,'wholePaks':6,'freshPackChecks':5,'selectedMaps':571,'profiles':combined['profiles'],'inputs':len(rows),'receiptSha256':sha(p.read_bytes())}))
