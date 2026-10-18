from pathlib import Path
import json,hashlib,subprocess,re,copy,os,sys
root=Path(__file__).resolve().parents[5];os.chdir(root)
base=Path('tools/texture_sheets/sources/official-world-2026-10-17');v=base/'verification'
read=lambda p:Path(p).read_bytes()
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def js(p):return json.loads(read(p))
expected='f8da85a8730aadfc34b2199b1d91fdf21ab54bcf774e1c21b73753871633ad9c';assert sha('newer/textures/index.json')==expected
for stem,count in [('all95-public',7),('owner-public',4),('historical45-public',4)]:
 s=(v/f'crosspack6-{stem}-tests.txt').read_text();assert f'TOTAL {count}/{count} passed' in s and 'FAIL ' not in s and 'SKIP ' not in s
assert 'Ran 3 tests' in (v/'crosspack6-level-assets-tests.txt').read_text() and 'OK' in (v/'crosspack6-level-assets-tests.txt').read_text()
s=(v/'crosspack6-pack-contract-tests.txt').read_text();assert re.search(r'(?:ℹ|#) pass 5\b',s) and re.search(r'(?:ℹ|#) fail 0\b',s) and re.search(r'(?:ℹ|#) skipped 0\b',s)
proofs=[js(v/f'crosspack6-{n}-source-proof.json') for n in ['all95-public','owner-public','historical45']]
assert all(p['indexSha256']==expected for p in proofs);assert proofs[0]['bindings']==98 and proofs[0]['occurrences']==656
closure=js(v/'crosspack6-combined-delivery-closure.json');assert closure['indexSha256']==expected and closure['combinedSelectedQ92Maps']==479
before=json.loads(subprocess.check_output(['git','show','HEAD:newer/textures/index.json']));current=js('newer/textures/index.json');after=copy.deepcopy(before)
for name in ['building-five','crosspack-six']:
 for e in js(base/f'{name}-registration.json')['entries']:
  assert e['key'] not in after.get('ordinaryVariants',{}).get(e['name'],{})
  after.setdefault('ordinaryVariants',{}).setdefault(e['name'],{})[e['key']]=e['binding']
after['version']=2026101808;assert after==current,'Exact eleven-entry delta plus version from HEAD'
gamesBefore=json.loads(subprocess.check_output(['git','show','HEAD:newer/packs/games.json']));games=js('newer/packs/games.json');addNames=set(games['textures'])-set(gamesBefore['textures']);expectedNames={e['name'].lower() for r in ['building-five','crosspack-six'] for e in js(base/f'{r}-registration.json')['entries']}-set(gamesBefore['textures']);assert addNames==expectedNames and len(addNames)==10
for n,t in gamesBefore['textures'].items():assert games['textures'][n]==t
checkGames=copy.deepcopy(games);checkGames['textures']=gamesBefore['textures'];checkGames['sources']['textureNames']=gamesBefore['sources']['textureNames'];assert checkGames==gamesBefore
inputs=set([str(p) for p in v.glob('crosspack6-*') if p.is_file() and p.suffix in ['.json','.js','.txt'] and p.name!='crosspack6-installed-public-input-hashes.json'])
inputs.update(['tests/official_texture_q92_test.js','tests/official_texture_owner_q92_test.js','tests/owner_texture_q92_standard.js','tests/official_texture_standard.js','tests/official_texture_registration_test.js','tests/level_texture_assets_test.py','tests/packs_contract_test.mjs','tools/texture_sheets/encode_official_maps.py','tools/craft_normals.py','tools/texture_sheets/finish_runtime_skin.py','src/newer/render/r_newertextures.js','src/newer/render/gl_normals.js','newer/textures/index.json','newer/packs/games.json','newer/textures/candidates-2026-10-12/trial.json',str(base/'owner-q92-first-tranche-v2.json'),str(base/'crosspack-six-trial-before.json')])
helper=(v/'verify-crosspack-six-pack-closure.mjs').read_text();paths=re.findall(r"'([^']+\.json)'",helper.split('const entries=')[0]);correction='tools/texture_sheets/sources/official-world-2026-10-12/aged-wall-metal-v3-correction.json';inputs.update(paths+[correction]);rows=[e for p in paths for e in js(p)['entries']];cor=js(correction)['entries'];rows=[next((c for c in cor if c['name']==e['name'] and c['key']==e['key']),e) for e in rows];encs={e['encodingReceipt'] for e in rows};assert len(rows)==98 and len(encs)==95
for p in encs:
 inputs.add(p);enc=js(p);inputs.update([enc['original'],enc['authoringDiffuse']]);
 for q in enc['outputs'].values():inputs.add(q['file'])
for e in rows:
 for field,digest in [(e['binding']['file'],e['diffuseSha256']),(e['binding']['normal']['file'],e['heightSha256']),*[(e['binding']['normal']['normalChannels'][a],e['normalChannelSha256'][a]) for a in ['x','y','z']]]:
  p='newer/textures/'+field;assert sha(p)==digest;inputs.add(p)
inputs.update(str(v/n) for n in ['verify-crosspack-six-pack-closure.mjs','verify-crosspack-six-owner-pack-closure.mjs','qualify-crosspack-six-inputs.py','crosspack6-public-verification.md'])
packPaths=set()
for proof in proofs:
 for source in proof['sources']:
  for field in ['actualPack','pack','palettePack']:
   if source.get(field):packPaths.add(source[field])
assert len(packPaths)==6
packs=[{'path':p,'realPath':str(Path(p).resolve(strict=True)),'bytes':Path(p).stat().st_size,'sha256':sha(p)} for p in sorted(packPaths)]
audit=js('/private/tmp/quaked-oct18-all95-audit/inventory.json');assert audit['indexSha256']==expected and not audit['errors'];auditProof={'qualification':'Installed official-game BSP inventory, includes extras/unused miptexes; catalogue presence is not Q92 provenance or visual acceptance. Original scratch inventory is read-only and excluded from runtime assets.','path':'/private/tmp/quaked-oct18-all95-audit/inventory.json','sha256':sha('/private/tmp/quaked-oct18-all95-audit/inventory.json'),'indexSha256':expected,'counts':audit['counts'],'actions':audit['actions'],'errors':audit['errors']};(v/'crosspack6-missing-inventory-summary.json').write_text(json.dumps(auditProof,indent=2)+'\n');inputs.add(str(v/'crosspack6-missing-inventory-summary.json'))
result={'qualification':'Independent installed-public, retained-source, actual encoder replay, directed-normal mathematical and pack/collector verification. No GPU, staging, heavy normal gate, commit, merge or release performed by this helper.','head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'indexSha256':expected,'generatedArtworks':95,'generatedBindings':98,'ownerFormatBindings':4,'tests':{'generated':7,'owner':4,'historical':4,'levelPython':3,'packs':5,'total':23,'failures':0,'skips':0},'sources':{'generatedOccurrences':656,'ownerOccurrences':24,'historicalOccurrences':162,'historicalDonorChecks':43,'qualifiedRockOccurrences':13,'scope':'These sets overlap; counts are not summed as unique originals.'},'closure':{'generatedMaps':475,'ownerMaps':4,'selectedQ92Maps':479,'webAssets':closure['profiles']['web']['assetCount'],'desktopAssets':closure['profiles']['desktop']['assetCount'],'missing':0},'preservation':{'historicalHeldRockBodySha256':'7a0ebf44edce31b44d0c72108451d1cdbf73c106eacc1cd8d323d0fd5f5743fd','rockSuccessor':'Two exact known native keys only; old5b26 binding and complete preview preserved, new5766 own photograph. All13 actual PAK uses, unknown synthetic key, wrong case, Classic and UV controls pass.','indexDelta':'Exact eleven building5+crosspack6 ordinaryVariants entries plus version from current HEAD; all previous entries unchanged.','gameIndexDelta':'Exactly ten new texture-name lists (rock3_8 already indexed) and textureNames source fingerprint; every prior entry, model/BSP/library field unchanged.','ownerArt':'Original masters, all4 owner successors, historical integration glass records retained.'},'producerReplay':'All95 actual artwork encoders reproduce all five selected Q92 outputs byte-exact. Four directed steel normal independent mathematical byte checks pass.','testFixes':[{'issue':'Two native rock identities collided in name-only scratch output stem','fix':'Include exact native key in scratch stem, preserving producer no-overwrite contract.'},{'issue':'Diagnostic candidate path differs from published official runtime-copy path','fix':'Require identical actual five-map byte hashes and native identity, rather than path spelling equality.'},{'issue':'Retained source records used historical paths instead of current existing canonical aliases','fix':'All non-path source/use fields exact; strict realpath equality for each specific existing PAK path. Whole PAK hashes freshly recorded.'}],'retainedInitialFailure':'crosspack6-public-pre-successor-test-fixes.txt','inputs':[{'file':p,'sha256':sha(p)} for p in sorted(inputs)],'actualSourcePaks':packs,'inventory':auditProof}
assert sha('newer/textures/index.json')==expected
(v/'crosspack6-installed-public-input-hashes.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'tests':result['tests'],'generated':95,'bindings':98,'sourceOccurrences':656,'companions':479,'inputs':len(inputs),'sourcePAKs':len(packs),'missingInventory':audit['counts']['missing']}))
