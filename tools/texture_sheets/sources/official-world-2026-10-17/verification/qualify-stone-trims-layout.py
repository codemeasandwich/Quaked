"""Independent canonical-resource boundary and installed public proof."""
from pathlib import Path
import hashlib,json,subprocess,re,sys,ast
R=Path(__file__).resolve().parents[5];sys.path.insert(0,str(R/'tools'));from resource_paths import resource_path
B=Path('tools/texture_sheets/sources/official-world-2026-10-17');V=B/'verification';HEAD='738f92d96e56517eed3fcc255a885b4fc9528b9a';OLD='ab554cf61a2650c7ae84ed5dc96dcc45c4cb1010';TREE='0809db6970bb0f830b0d3251595c42ff4bd08a4a';IDX='4bdc95a3a622fbb0ba71afb6aacde1d0504bfe3c4282b91e8dc2be872eb85faa'
def physical(p):return resource_path(R,p)
def read(p):return physical(p).read_bytes()
def js(p):return json.loads(read(p))
def sha(b):return hashlib.sha256(b).hexdigest()
def fileSha(p):
 h=hashlib.sha256()
 with physical(p).open('rb')as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def pin(p):
 q=physical(p);return {'file':str(p),'physicalFile':str(q.relative_to(R))if q.is_relative_to(R)else str(q),'sha256':fileSha(p)}
def git(*args):return subprocess.check_output(['git',*args],cwd=R)
assert git('rev-parse','HEAD').decode().strip()==HEAD and sha(read('newer/textures/index.json'))==IDX
priorP=V/'stone-trims-ab55-dev-successor-qualification.json';assert sha(read(priorP))=='97313485061fc75329e6a04e8db2590a2cbbe5c2ddfff604d4af4a1e49fc73bb';prior=js(priorP);assert len(prior['inputs'])==2276 and prior['head']==OLD
for stem,n in [('all111-public',7),('owner-historical',9)]:
 name='stone-trims-layout-'+stem+'-tests'+('-v2'if stem=='owner-historical'else'')+'.txt';s=read(V/name).decode();assert ('RESULT 7/7 passed'in s if n==7 else'TOTAL 9/9 passed'in s)and'FAIL 'not in s and'SKIP 'not in s
s=read(V/'stone-trims-layout-level-assets-tests-v2.txt').decode();assert 'Ran 3 tests'in s and'OK'in s
for stem,n in [('pack',5),('standard4x',26)]:
 s=read(V/f'stone-trims-layout-{stem}-tests.txt').decode();assert re.search(r'(?:ℹ|#) pass '+str(n)+r'\b',s)and re.search(r'(?:ℹ|#) fail 0\b',s)and re.search(r'(?:ℹ|#) skipped 0\b',s)
# All metadata identities and selected pixels survive the move. Only reviewed
# current I/O sources differ, each tied to its retained old blob and actual code.
explicit={
 'tests/official_texture_owner_q92_test.js':'5a2fa87bcdc13dc92c7ea55b22b28ca9ea8b66ee0677f092adbc87ff8cf74caf',
 'tests/official_texture_registration_test.js':'296b95702b652ab1791837bda907f6370e6c3cfa8f4d2e4320388d44c02375ce',
 'tests/level_texture_assets_test.py':'5242fc8d96fed6e978700eaa19a3bb2bf71117f2890f00fbe50f287058b64913',
 'tests/official_texture_q92_test.js':'d73dd269178c251ab2a6b398e09e1830d7ad84bc70b12bfa68adf9afbd1c4b4d',
 'tools/texture_sheets/encode_official_maps.py':'14f23a560c17afb72aa8a9aa9d1fda2dbed94bf1230048f3c3b9e814664f0287',
 str(B/'prepare_horizontal_trims.py'):'c8d185417a9a4bc80d3b202efdb37065c1aa700c2ad348a1237327b199f99ab2',
 str(B/'prepare_stone_trim_bases.py'):'d935f27479576e1a65c7423e460acad8cb48634034d6c2ed9bde0a04fcb0d377'}
changes=[];relocations=[];inputs={x['file']for x in prior['inputs']}
for x in prior['inputs']:
 p=x['file'];q=physical(p);h=fileSha(p);plain=Path(p)if Path(p).is_absolute()else R/p
 if q!=plain:relocations.append({'logicalFile':p,'physicalFile':str(q.relative_to(R))if q.is_relative_to(R)else str(q),'sha256':h,'priorSha256':x['sha256'],'byteExact':h==x['sha256']});assert h==x['sha256'],'Moved payload cannot change'
 if h==x['sha256']:continue
 old=git('show',TREE+':'+p);assert sha(old)==x['sha256'],'Exact retained prelayout source'
 if p in explicit:assert h==explicit[p];basis='Explicit owned narrow resource-boundary/source-witness successor, exact current hash'
 else:assert read(p)==git('show',HEAD+':'+p);basis='Exact qualified migration commit bytes'
 changes.append({'file':p,'beforeSha256':x['sha256'],'currentSha256':h,'retainedTree':TREE,'basis':basis})
assert len(relocations)==1504 and len(changes)==36 and set(explicit)<={x['file']for x in changes}
# Verify pure numerical functions, not an invented source-hash waiver.
producer=js(V/'stone-trims-layout-producer-replay.json');math=[]
for key,expected in producer['unchangedNumericalFunctions'].items():
 p,name=key.split('::');old=git('show',TREE+':'+p).decode();current=read(p).decode()
 def segment(s):return next(ast.get_source_segment(s,n)for n in ast.parse(s).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))and n.name==name)
 a,b=segment(old),segment(current);assert a==b;math.append({'file':p,'function':name,'sha256':sha(a.encode()),'byteExactSource':True})
# Explicit source records remain original; full replays establish output identity.
for row in js(V/'stone-trims-resource-producer-successors.json')['changes']:
 assert sha(read(row['historicalWitness']))==row['beforeSha256']and sha(read(row['file']))==row['afterSha256']
for x in producer['producerResults']:
 assert x['byteExact']
 for out in x['outputs']:assert sha(read(out['file']))==out['sha256']
proofs=[js(V/name)for name in ['stone-trims-layout-all111-source-proof.json','stone-trims-layout-owner4-source-proof-v2.json','stone-trims-layout-tech12-source-proof-v2.json','stone-trims-layout-historical45-source-proof-v2.json']];assert [p['occurrences']for p in proofs]==[768,24,61,162]and all(p['indexSha256']==IDX for p in proofs)
combined=js(V/'stone-trims-layout-combined-delivery-closure.json');generated=js(V/'stone-trims-layout-all111-delivery-closure.json');assert generated['bindings']==114 and generated['uniqueQ92Files']==555 and combined['combinedSelectedQ92Maps']==571;assert generated['ownership']==js(V/'stone-trims-ab55-all111-delivery-closure.json')['ownership'];assert combined['ownership']==js(V/'stone-trims-ab55-combined-delivery-closure.json')['ownership']
# Logical collector identities are stable; physical reads have no legacy-file fallback.
for row in generated['ownership']:
 for m in row['maps']:
  q=physical(m['file']);assert q.is_file()and q.is_relative_to(R/'assets/game/textures');assert not(R/m['file']).exists()
for old in prior['wholeSourcePaks']:assert fileSha(old['path'])==old['sha256']
# Input sealing covers old logical identities, central resolver, exact new
# public evidence and bounded parent producer evidence. No old receipt rewritten.
for p in (R/V).glob('stone-trims-layout-*'):
 if p.is_file()and p.name!='stone-trims-layout-public-qualification.json':inputs.add(str(p.relative_to(R)))
inputs.update([str(V/'stone-trims-resource-producer-successors.json'),str(V/'update_level_sheets-before-resource-layout.py'),str(V/'prepare_horizontal_trims-before-resource-layout.py'),str(V/'prepare_stone_trim_bases-before-resource-layout.py'),str(V/'encode_official_maps-before-resource-layout.py'),str(V/'qualify-stone-trims-layout.py'),str(V/'verify-stone-trims-layout-generated-pack-closure.mjs'),str(V/'verify-stone-trims-layout-combined-pack-closure.mjs'),'assets/layout.json','src/platform/resource_paths.js','tools/resource_paths.py','tests/helpers/resource_fs.mjs','tests/helpers/resource_fs_promises.mjs','tests/helpers/resource_path.mjs',str(priorP)])
result={'qualification':'Independent migrated canonical-resource public/source/encoder/pack qualification. No old recipe, prompt, logical source identity or pixel payload rewritten. Parent owns currentGPU/finalstage/build/publication; remote cleanup acceptance and publication remain distinct.','head':HEAD,'prelayoutBase':OLD,'retainedPrelayoutTree':TREE,'indexSha256':IDX,'version':2026101811,'predecessorReceipt':pin(priorP),'previousInputsCompared':2276,'byteExactAfterCanonicalResolution':2276-len(changes),'logicalInputsPhysicallyRelocated':len(relocations),'byteExactRelocations':relocations,'onlySourceBoundarySuccessors':changes,'numericalSourceFunctions':math,'generatedArtworks':111,'nativeBindings':114,'selectedCompanionMaps':571,'checks':{'generatedPublic':7,'ownerAndTechPublic':5,'historicalPublic':4,'pythonLevel':3,'pack':5,'standard4xIncludingNestedNegativeCases':26,'totalReportedChecks':50,'currentFailures':0,'skips':0},'sourceOccurrences':{'generated':768,'owner':24,'tech':61,'historical45':162,'scope':'Overlapping proof scopes; not summed as unique originals.'},'actualEncoderProof':'All111diffuse/height/XYZ five-map outputs byte-exact through current14f central-I/O encoder; old6e exactsource retained. Steel4 coordinate-math channel reproduction, decoder/publicheightR/XYZ/heightalpha/UV/Classic/cache/unknown/case controls pass. New physical index/image requests are positively asserted canonical, not just accepted through normalization.','sourceHashGuards':'Historical739authoring and3b64trim producer hashes remain exact in their original recipes and retained source copies; currentea36/c8d1 hashes separately pinned. No unconditional source-hash waiver. Numerical functions and actual producer PNG replays verify separately.','retainedInitialFailures':{'ownerAndHistorical':'Initial7/9:PythonImage.open argv andgit hash-object stdin paths bypassed JSresolver; narrow resourcePath repairs preserve every hash/order/provenance assertion.','pythonLevel':'Initial2/3:tech overlay directPath.read_bytes bypassed canonical resolver; one resource_path read repair, all digests/normal overlays retained.','logs':[pin(V/'stone-trims-layout-owner-historical-tests.txt'),pin(V/'stone-trims-layout-level-assets-tests.txt')]},'collector':combined['profiles'],'retainedUnboundHistoricalQ95':combined['retainedUnboundHistoricalQ95'],'parentProducerReplay':pin(V/'stone-trims-layout-producer-replay.json'),'wholeSourcePaks':prior['wholeSourcePaks'],'inputs':[pin(p)for p in sorted(inputs)],'limits':['No new browser/server/GPU/binary build, staging or commit by this tester','No alllevelgameplay, owner approval or release claim','Selected571Q92 qualification does not mean all retained shipped files are92; historical12Q95 remain separately recorded']}
assert git('rev-parse','HEAD').decode().strip()==HEAD and sha(read('newer/textures/index.json'))==IDX
p=R/V/'stone-trims-layout-public-qualification.json';assert not p.exists();p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'checks':50,'oldInputs':2276,'relocatedByteExact':len(relocations),'sourceSuccessors':len(changes),'inputs':len(inputs),'maps':571,'receiptSha256':sha(p.read_bytes())}))
