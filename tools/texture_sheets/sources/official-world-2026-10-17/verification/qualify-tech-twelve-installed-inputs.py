from pathlib import Path
import json,hashlib,subprocess,re,copy,sys
ROOT=Path(__file__).resolve().parents[5] if 'verification' in str(Path(__file__).resolve()) else Path('/Users/bri/.codex/worktrees/official-textures-next/Quaked')
B=Path('tools/texture_sheets/sources/official-world-2026-10-17');V=B/'verification';sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:(ROOT/p).read_bytes();js=lambda p:json.loads(read(p))
def fileSha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
 return h.hexdigest()
expected='7ad27d2e6ba3fc58be9ca32ab2b279f641ad6b767eb7085540d1371e162c3ce4';assert sha(read('newer/textures/index.json'))==expected
for stem,n in [('owner5',5),('historical45',4),('all95',7)]:
 text=read(V/f'tech12-{stem}-public-tests.txt').decode();assert f'TOTAL {n}/{n} passed' in text and 'FAIL ' not in text and 'SKIP ' not in text
text=read(V/'tech12-level-assets-tests.txt').decode();assert 'Ran 3 tests' in text and 'OK' in text
for stem,n in [('standard4x',26),('pack',5)]:
 text=read(V/f'tech12-{stem}-contract-tests.txt').decode();assert re.search(r'(?:ℹ|#) pass '+str(n)+r'\b',text) and re.search(r'(?:ℹ|#) fail 0\b',text) and re.search(r'(?:ℹ|#) skipped 0\b',text)
tech=js(B/'legacy-tech-twelve-q92-v1.json');beforeBytes=read(B/'legacy-tech-twelve-index-before.json');before=json.loads(beforeBytes);current=js('newer/textures/index.json');planned=copy.deepcopy(before);planned['version']=2026101809
assert sha(beforeBytes)==tech['indexBeforeSha256']=='f8da85a8730aadfc34b2199b1d91fdf21ab54bcf774e1c21b73753871633ad9c'
for e in tech['bindings']:planned['textures'][e['name']]=e['current']['file'];planned['normals'][e['name']]=e['current']['normal'];assert e['current']['normal'].get('cap',1.1)==1.1
assert sum('cap' not in e['current']['normal'] for e in tech['bindings'])==5;assert current==planned
assert subprocess.check_output(['git','show','HEAD:newer/textures/index.json'],cwd=ROOT)==beforeBytes
assert subprocess.check_output(['git','show','HEAD:newer/packs/games.json'],cwd=ROOT)==read('newer/packs/games.json')
proofs=[js(V/f'tech12-{n}-source-proof.json') for n in ['public','owner4-public','historical45','all95-public']];assert all(p['indexSha256']==expected for p in proofs);assert [p['occurrences']for p in proofs]==[61,24,162,656]
closure=js(V/'tech12-combined-delivery-closure.json');assert closure['indexSha256']==expected and closure['combinedSelectedQ92Maps']==491
inputs=set(['newer/textures/index.json','newer/packs/games.json','tests/official_texture_q92_test.js','tests/official_texture_registration_test.js','tests/official_texture_standard.js','tests/official_texture_owner_q92_test.js','tests/owner_texture_q92_standard.js','tests/level_texture_assets_test.py','tests/standard_4x_records_contract_test.mjs','tests/packs_contract_test.mjs','tools/texture_sheets/encode_official_maps.py','tools/texture_sheets/finish_runtime_skin.py','tools/craft_normals.py','tools/texture_sheets/standardise_4x.py','tools/distribution/build_game_index.mjs','tools/distribution/manifest.mjs','tools/distribution/packs.mjs','src/newer/render/r_newertextures.js','src/newer/render/gl_normals.js','src/newer/render/normal_math.js','src/newer/assets/normal_prepare.js',str(B/'prepare_legacy_tech_q92.py'),str(B/'legacy-tech-twelve-q92-v1.json'),str(B/'legacy-tech-twelve-index-before.json'),str(V/'legacy-tech-twelve-q92-plan.json'),str(V/'legacy-tech-twelve-independent-replay.json'),str(V/'legacy-tech-twelve-test-successors.patch'),str(V/'legacy-tech-twelve-test-successors-inputs.json'),str(V/'legacy-tech-twelve-installation.json'),str(V/'legacy-twelve-tech-q95-replay.json')])
for p in (ROOT/V).glob('tech12-*'):
 if p.is_file() and p.name!='tech12-installed-public-input-hashes.json' and p.suffix in ['.json','.mjs','.txt','.md','.py']:inputs.add(str(p.relative_to(ROOT)))
for n in ['verify-tech-twelve-generated-pack-closure.mjs','verify-tech-twelve-combined-pack-closure.mjs','qualify-tech-twelve-installed-inputs.py','tech12-public-verification.md']:
 if (ROOT/V/n).exists():inputs.add(str(V/n))
helper=read(V/'verify-tech-twelve-generated-pack-closure.mjs').decode();paths=re.findall(r"'([^']+\.json)'",helper.split('const entries=')[0]);correction='tools/texture_sheets/sources/official-world-2026-10-12/aged-wall-metal-v3-correction.json';inputs.update(paths+[correction]);rows=[e for p in paths for e in js(p)['entries']];cor=js(correction)['entries'];rows=[next((c for c in cor if c['name']==e['name']and c['key']==e['key']),e)for e in rows];encs={e['encodingReceipt']for e in rows};assert len(rows)==98 and len(encs)==95
for p in encs:
 inputs.add(p);enc=js(p);inputs.update([enc['original'],enc['authoringDiffuse']]);inputs.update(m['file']for m in enc['outputs'].values())
for e in rows:
 for file,digest in [(e['binding']['file'],e['diffuseSha256']),(e['binding']['normal']['file'],e['heightSha256']),*[(e['binding']['normal']['normalChannels'][a],e['normalChannelSha256'][a])for a in ['x','y','z']]]:
  p='newer/textures/'+file;assert sha(read(p))==digest;inputs.add(p)
for m in tech['maps']:
 for field,digest in [('retainedPre4xFile','retainedPre4xSha256'),('predecessor','predecessorSha256'),('master','masterSha256'),('file','sha256')]:assert sha(read(m[field]))==m[digest];inputs.add(m[field])
ownerPath=B/'owner-q92-first-tranche-v2.json';inputs.add(str(ownerPath))
for m in js(ownerPath)['maps']:
 for field,digest in [('predecessor','masterSha256'),('file','sha256')]:assert sha(read(m[field]))==m[digest];inputs.add(m[field])
plan=js(V/'legacy-tech-twelve-q92-plan.json');patch=js(V/'legacy-tech-twelve-test-successors-inputs.json');transitions=[];patches={e['file']:e for e in patch['files']}
for witness in plan['inputs']:
 p=Path(witness['file']);actualPath=p if p.is_absolute()else ROOT/p;digest=fileSha(actualPath)
 if digest!=witness['sha256']:
  if str(p)=='newer/textures/index.json':assert witness['sha256']==sha(beforeBytes);kind='exact6filename-pair successor plus version'
  else:
   transition=patches[str(p)];assert witness['sha256']==transition['beforeSha256']and digest==transition['proposedSha256'];assert sha(subprocess.check_output(['git','show','HEAD:'+str(p)],cwd=ROOT))==witness['sha256'];kind='exact reviewed test patch with priorbytes retained in HEAD'
  transitions.append({'file':str(p),'plannedBeforeSha256':witness['sha256'],'currentSha256':digest,'reason':kind})
 inputs.add(str(p))
assert len(transitions)==4
packPaths=set()
for p in proofs:
 for s in p['sources']:
  for key in ['actualPack','pack','palettePack']:
   if s.get(key):packPaths.add(s[key])
assert len(packPaths)==6
paks=[{'path':p,'realPath':str(Path(p).resolve(strict=True)),'bytes':Path(p).stat().st_size,'sha256':fileSha(Path(p))}for p in sorted(packPaths)]
result={'qualification':'Installed public/producer/PAK/normal/pack qualification only. No GPU/art acceptance, staging, normal build gate, commit, Dev publication or release performed by this helper.','head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'indexSha256':expected,'version':current['version'],'indexBeforeSha256':sha(beforeBytes),'newFormatBindings':6,'newFormatQ92Maps':12,'generatedArtworks':95,'generatedNativeBindings':98,'selectedQ92CompanionMaps':491,'tests':{'ownerAndTechPublic':5,'historicalPublic':4,'pythonLevelAssets':3,'generatedPublic':7,'packs':5,'targetedChecksSubtotal':24,'standard4xContractIncludingNestedNegativeCases':26,'totalReportedChecks':50,'failures':0,'skips':0},'sourceOccurrences':{'techSix':61,'retainedOwnerFour':24,'historical45':162,'generated98':656,'scope':'Sets overlap; never add as unique native originals.'},'producer':'Independent installed public case replays all12 directsourceLanczosPNGpixels and RGB92bytes exactly. Existing95art encoders and4directedsteel mathematical checks pass unchanged.','preservation':{'indexDelta':'Exact6textures and6normal.file changes plus version from beforef8/currentHEAD; allcap presence/absence and othermetadata/sourceguards preserved.','gameIndex':'Rebuilt via canonicalread-onlylibrary; after logical~/quaked and1space serialization byte-equals HEAD.','old95Files':'All12 retained exactly,697324bytes; zeroactiveindexrefs yet collected ascore in bothprofiles. All-shipped-payloads92 obligation remains separate.','ownerFour':'Existingfourpubliccases,exports,losslessgraywitnesses and historicalRegistration unchanged; only exactsixbaseline expectations composed.','threeTestFiles':'Actual bytes equal the pre-reviewed patch outputs, with no extra fixes.','priorPlanInputs':'48of52exactunchanged;4explicit authorized transitions(index+3tests) linked to exactbefore snapshot/HEAD and patchhashes.'},'planWitnessTransitions':transitions,'collector':closure['profiles'],'retainedHistoricalQ95':closure['retainedUnboundHistoricalQ95'],'inputs':[{'file':p,'sha256':fileSha(Path(p)if Path(p).is_absolute()else ROOT/p)}for p in sorted(inputs)],'actualSourcePaks':paks}
assert sha(read('newer/textures/index.json'))==expected
(ROOT/V/'tech12-installed-public-input-hashes.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'reportedChecks':50,'failures':0,'skips':0,'selectedMaps':491,'inputs':len(inputs),'actualSourcePaks':len(paks),'planTransitions':len(transitions)}))
