import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {withoutGitEnvironment} from '../../../../../tools/distribution/precommit.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const QCAT='assets/authoring/texture_sheets/sources/quake-world-2026-10-20/catalog.json';
async function quakeCatalogFixture(fn,{shape='collective',compact=false,nonSquare=false,composed=false}={}){
 const root=await mkdtemp(join(tmpdir(),'quaked-quake-custody-')),env={...withoutGitEnvironment(),PYTHONDONTWRITEBYTECODE:'1'},base='assets/authoring/texture_sheets/sources/quake-world-2026-10-20/fixture',name='fixture',id='c'.repeat(64),origins=[join(root,'live-main'),join(root,'live-fc24')];
 const put=async(p,b)=>{await mkdir(join(root,p,'..'),{recursive:true});await writeFile(join(root,p),b);};
 const policy=role=>role==='diffuse'?{lossless:false,quality:92,method:6}:{lossless:true,compressionEffort:92,method:6};
 const bound=[],jsonFiles=[];
 const reference=(p,origin=null)=>{const value={file:origin?origin+'/'+p:p,sha256:''};bound.push([value,p]);return value;};
 const json=(p,value)=>{jsonFiles.push([p,value]);return reference(p);};
 const refresh=async()=>{for(const [value,p]of bound){const bytes=await readFile(join(root,p)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(bytes)value.sha256=sha(bytes);}};
 try{
  const data=JSON.parse(execFileSync('/usr/bin/python3',['-c',String.raw`
from pathlib import Path
from PIL import Image
import numpy as np,json,hashlib,sys
r=Path(sys.argv[1]);b=sys.argv[2];d=r/b;(d/'master').mkdir(parents=True);(d/'tiers').mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
stretch=2 if sys.argv[3]=='1' else 1
n=Image.new('RGB',(8,8*stretch),(40,28,14));n.save(d/'native.png');Image.new('RGB',(64,64*stretch),(40,28,14)).save(d/'raw.png');Image.new('RGB',(64,64*stretch),(40,28,14)).save(d/'master/color.png');np.save(d/'master/height.npy',np.full((64*stretch,64),64/255,dtype='float32'),allow_pickle=False)
roles=['diffuse','height','normalX','normalY','normalZ'];out={};gpu={}
for tier,size in [('Mid',32),('High',64)]:
 out[tier]={}
 for role,value in zip(roles,[(40,28,14),64,128,128,255]):
  im=Image.new('RGB'if role=='diffuse'else'L',(size,size*stretch),value);p=d/'tiers'/(tier.lower()+'-'+role+'.webp');im.save(p,'WEBP',quality=92,lossless=role!='diffuse',method=6);decoded=Image.open(p).convert(im.mode)
  out[tier][role]={'file':p.name,'sha256':sha(p),'dimensions':[size,size*stretch],'lossless':role!='diffuse','method':6,'bitDepth':8,'pixelLayout':im.mode,'intendedPixelSha256':hashlib.sha256(im.tobytes()).hexdigest(),'decodedPixelSha256':hashlib.sha256(decoded.tobytes()).hexdigest(),'integerCompression':{'mismatchCount':0,'meanAbsoluteError':0,'maximum':0},**({'quality':92}if role=='diffuse'else{'compressionEffort':92})}
 cap=Image.new('RGBA',(size*stretch,size*stretch),(30,20,10,255));p=d/(tier.lower()+'-gpu.png');cap.save(p);packed=bytes([128,128,255,64])*(size*size*stretch);gpu[tier]={'path':str(p.relative_to(r)),'pixelSHA':hashlib.sha256(cap.tobytes()).hexdigest(),'packedSHA':hashlib.sha256(packed).hexdigest(),'dimensions':[size*stretch,size*stretch]}
print(json.dumps({'maps':out,'nativeDimensions':[8,8*stretch],'rgbaSha256':hashlib.sha256(n.convert('RGBA').tobytes()).hexdigest(),'gpu':gpu}))`,root,base,nonSquare?'1':'0'],{env,encoding:'utf8'}));
  await put(base+'/prompt.txt','one retained fixture source');
  const fixturePath='tests/fixtures/quake_codec_protected_producers.json';const pins=JSON.parse(await readFile(resolve(fixturePath),'utf8'));
  for(const v of pins.protectedSourceBindings)await put(v.file,await readFile(resolve(v.file)));await put(fixturePath,JSON.stringify(pins));
  await put('tools/texture_sheets/derive_quake_texture_tiers.py',await readFile(resolve('tools/texture_sheets/derive_quake_texture_tiers.py')));
  const original=reference(base+'/native.png',origins[0]),raw=reference(base+'/raw.png',origins[0]),prompt=reference(base+'/prompt.txt',origins[0]),color=reference(base+'/master/color.png',origins[1]),height=reference(base+'/master/height.npy',origins[1]);
  const tools={prepare:'tools/texture_sheets/prepare_texture_master.py',finish:'tools/texture_sheets/finish_official_texture.py',derive:'tools/texture_sheets/derive_texture_tiers.py',craft:'tools/craft_normals.py'};
  const master={generationCount:1,generatorPolicy:'One retained generator output; this CLI never calls a generator',canonicalMasterFactor:8,nativeDimensions:data.nativeDimensions,masterDimensions:data.nativeDimensions.map(v=>v*8),inputs:{original,generated:raw,prompt},color:{...reference(base+'/master/color.png'),file:'color.png'},height:{...reference(base+'/master/height.npy'),file:'height.npy',dtype:'float32',quantizedTo8Bit:false},tools:Object.fromEntries(Object.entries(tools).map(([k,p])=>[k,reference(p,origins[0])]))};
  bound.push([master.color,base+'/master/color.png'],[master.height,base+'/master/height.npy']);
  let compositionInfo=null;
  if(composed){
   const derived=base+'/registered-source.png',rawPath=base+'/raw.png',cut=48,roll=2,height=nonSquare?128:64;
   execFileSync('/usr/bin/python3',['-c',String.raw`
from PIL import Image
import numpy as np,sys
from pathlib import Path
r=Path(sys.argv[1]);raw=r/sys.argv[2];derived=r/sys.argv[3];h=int(sys.argv[4]);a=np.zeros((h,64,3),dtype='uint8')
for y in range(h):
 for x in range(64):a[y,x]=[40+x%30,28+y%30,14+(x+y)%20]
Image.fromarray(a).save(raw);b=a.copy();b[:,48:]=a[(np.arange(h)+2)%h,48:];Image.fromarray(b).save(derived)
`,root,rawPath,derived,String(height)],{env});
   const points=[[0,0],[8,8]],landmarkRef=json(base+'/landmarks.json',{axis:'x',points});
   master.inputs.generated=reference(derived,origins[1]);master.inputs.landmarks=landmarkRef;master.registration={axis:'x',verticalLandmarks:points};await refresh();
   const journal={items:[{id,name,generationCount:1,generationState:'generated-retained',original:original.file,originalSha256:original.sha256,prompt:prompt.file,promptSha256:prompt.sha256,generated:raw.file,generatedSha256:raw.sha256}]};const journalRef=json(base+'/journal.json',journal);
   const originalPrepare={...master,inputs:{...master.inputs}},originalPath=base+'/master/original-prepare-receipt.json',originalRef=json(originalPath,originalPrepare);
   const plan={schemaVersion:1,name,raw,native:original,proposedSameSourceComposition:{operation:'Exact integer cyclic row permutation ONLY on the reviewed right column support',cutX:cut,rollUpRows:roll,output:derived},existingXRegistration:{points}};const planRef=json('docs/quake/textures/fixture/composition-plan.json',plan);
   const planReviewRef=json('docs/quake/textures/fixture/composition-plan-review.json',{verdict:'PASS bounded same-source composition + existing measured X registration trial fixture',plan:planRef});
   await put('docs/quake/textures/fixture/composer.py','fixture source-specific composer, never executed by custody');await put('docs/quake/textures/fixture/attachment.py','fixture declared receipt attachment, never executed by custody');
   const outputRef=reference(derived),lineage={schemaVersion:1,name,nativeIdentity:id,generatorCalls:0,historicalSourceCalls:1,raw,native:original,prompt,journal:journalRef,plan:planRef,independentPlanReview:planReviewRef,composer:reference('docs/quake/textures/fixture/composer.py'),output:outputRef,landmarks:landmarkRef,dimensions:[64,height],operation:`For x>=${cut}, result[y,x]=raw[(y+${roll})%${height},x]; all x<${cut} unchanged`,sourcePixelsCreatedOrInterpolated:0,outsideSupportExact:true,fullInverseExact:true};const lineageRef=json(base+'/source-lineage.json',lineage);
   const review={verdict:'PASS exact composition and source ART before master; no final master/tier qualification',lineage:lineageRef,raw,output:outputRef,forwardAllPixelsExact:true,fullInverseExact:true,[`outside${cut}ColumnsPixelExact`]:true,noNewOrInterpolatedPixels:true,journalUnchangedRawSourceCount1:true,measuredXLandmarksExact:true};const reviewRef=json('docs/quake/textures/fixture/composition-review.json',review);
   master.generatorPolicy='One retained imagegen raw, followed by independently reviewed reversible same-source phase registration. inputs.generated is the registered derivative, not the returned raw. No additional model call or separate tier authoring.';
   master.sourceComposition=lineageRef;master.sourceCompositionReview=reviewRef;master.originalGeneratorOutput=raw;master.generationJournal=journalRef;master.originalPrepareReceipt=Object.assign(reference(originalPath),{file:'original-prepare-receipt.json'});master.sourceLineageAttachment=reference('docs/quake/textures/fixture/attachment.py');
   compositionInfo={journal,plan,lineage,review,originalPrepare,originalRef,derived,rawPath,critical:[...Object.values(master.inputs),lineageRef,reviewRef,raw,journalRef,originalRef,master.sourceLineageAttachment]};
  }
  const masterRef=json(base+'/master/master.json',master);
  const manifest={schemaVersion:2,family:'quake',defaultTier:'Mid',encodingByRole:Object.fromEntries(Object.keys(data.maps.Mid).map(role=>[role,policy(role)])),inputs:{original,master:color,heightMaster:height},strength:.3,cap:.5,tools:{adapter:reference('tools/texture_sheets/derive_quake_texture_tiers.py',origins[1]),sharedDeriver:reference(tools.derive,origins[1]),normalMath:reference(tools.craft,origins[1])},tiers:{}};
  const row={id,name,nativeIdentity:{id,width:data.nativeDimensions[0],height:data.nativeDimensions[1],rgbaSha256:data.rgbaSha256,materialFlags:[0]},masterPackage:masterRef.file,masterPackageSha256:'',tierReceipt:base+'/tiers/manifest.json',tierReceiptSha256:'',Low:{original:base+'/native.png',sha256:'',unchanged:true},tiers:{},reviews:{}};
  for(const [tier,factor]of[['Mid',4],['High',8]]){
   manifest.tiers[tier]={factor,dimensions:data.nativeDimensions.map(v=>v*factor),outputs:data.maps[tier]};row.tiers[tier]={factor,dimensions:data.nativeDimensions.map(v=>v*factor),outputs:{}};
   for(const[role,spec]of Object.entries(data.maps[tier])){const p=base+'/tiers/'+spec.file;bound.push([spec,p]);const out=compact?{file:p,sha256:'',lossless:spec.lossless,method:6}:{...spec,file:p};bound.push([out,p]);row.tiers[tier].outputs[role]=out;}
  }
  const receiptRef=json(row.tierReceipt,manifest);const nativeRef=json('docs/quake/textures/fixture/native.json',{verdict:'PASS fixture selected native only',externalNativeWitness:{file:'/unavailable/provider/pak0.pak',sha256:'e'.repeat(64)}});
  const refsFor=tier=>Object.fromEntries(Object.keys(data.maps[tier]).map(role=>[role,reference(row.tiers[tier].outputs[role].file)]));
  const proofs={};
  const candidate={schemaVersion:3,family:'quake',items:[{name,nativeIdentity:row.nativeIdentity,masterPackage:row.masterPackage,masterPackageSha256:'',tierReceipt:row.tierReceipt,tierReceiptSha256:'',tiers:Object.fromEntries(['Mid','High'].map(tier=>[tier,{files:Object.fromEntries(Object.entries(row.tiers[tier].outputs).map(([role,v])=>[role,v.file]))}]))}]};
  const candidateRef=json('docs/quake/textures/fixture/candidate.json',candidate);
  if(shape==='collective'){
   proofs.numeric={verdict:'PASS bounded five-package actual codec/source custody fixture',items:[{name,nativeIdentity:id,nativeProofs:[nativeRef],masterPackage:masterRef,original,newManifest:receiptRef,tiers:Object.fromEntries(['Mid','High'].map(tier=>[tier,{outputs:Object.entries(refsFor(tier)).map(([role,v])=>Object.assign(v,{role,exactIndependentEncoderBytes:true}))}]))}]};
   proofs.preview={verdict:'PASS bounded actual schema3 review fixture',items:[{name,nativeIdentity:id,masterPackage:masterRef,tierReceipt:receiptRef,tiers:['Mid','High'].map(tier=>({name:tier,actualMapBindings:Object.entries(refsFor(tier)).map(([role,v])=>Object.assign(v,{role})),sheets:[{...reference(data.gpu[tier].path),independentPanelCanvas:{everyPixelOutsideEmptyTailExact:true}}]}))}]};
   for(const tier of proofs.preview.items[0].tiers)bound.push([tier.sheets[0],data.gpu[tier.name].path]);
   proofs.art={verdict:'PASS_AFFECTED_OFFLINE_ART_TWO_STONES_BOTH_TIERS',items:[{name,nativeId:id,verdict:'PASS_AFFECTED_OFFLINE_ART_BOTH_TIERS',carryForward:{inputs:{masterReceipt:masterRef},newTierReceipt:receiptRef},tiers:['Mid','High'].map(tier=>({tier,verdict:'PASS_AFFECTED_OFFLINE_ART',actualDecodedMapInputs:refsFor(tier)}))}]};
   for(const k of ['numeric','preview','art'])json('docs/quake/textures/fixture/'+k+'.json',proofs[k]);
  }else{
   if(composed)proofs.numeric={schemaVersion:1,verdict:'PASS_BOUNDED_ALIGNED_SOURCE_PREPARE_ATTACHMENT_AND_BOTH_TIERS_MATH',candidateBatch:candidateRef,publicPrepareReplay:{returnCode:0,exactRGBPNG:true,exactFloatNPY:true,exactOriginalPrepareReceipt:true},metadataAttachment:{exactReconstruction:true,originalPrepareReceipt:compositionInfo.originalRef},sourceComposition:{exactPNGBytes:true,allForwardPixelsExact:true,outsideCutExact:true,inverseAllPixelsExact:true,landmarksExact:true,newSourcePixelsOrInterpolation:0,rawCallCount:1},tierProof:{exactRoleByteExports:10,exactLosslessDataMaps:8,Q92Method6Diffuse:2},watchedInputs:[masterRef,receiptRef,...compositionInfo.critical,...['Mid','High'].flatMap(tier=>Object.values(refsFor(tier)))]};
   else{proofs.source={verdict:'PASS source/master only',materials:[{name,nativeIdentity:id,sourceMasterOnly:true,verdict:'PASS exact initial source/master replay fixture',masterPackage:masterRef,sourceInputs:[original,raw,prompt]}]};proofs.numeric={verdict:'PASS independent actual candidate public checks',materials:[{name,nativeIdentity:id,masterPackage:masterRef,tierReceipt:receiptRef,exactDirectMasterRoleExports:10,losslessExactDataMaps:8,colourQ92Method6:2}]};}
   const numericRef=json('docs/quake/textures/fixture/numeric.json',proofs.numeric);
   const browser={shaderErrors:[],checks:[{passed:true}],state:'ready',inputs:{},draws:['Mid','High'].map(tier=>({name,tier,normalPackedSha256:data.gpu[tier].packedSHA,framebuffer:data.gpu[tier].dimensions,framebufferRgbaBottomUpSha256:data.gpu[tier].pixelSHA}))};
   for(const tier of Object.values(row.tiers))for(const v of Object.values(tier.outputs))browser.inputs[v.file]={sha256:'',bytes:(await stat(join(root,v.file))).size};
   const browserRef=json('docs/quake/textures/fixture/browser.json',browser);proofs.browser=browser;
   const captureRefs=[];let capturePublicRef=null;
   if(composed){
    const matrix=[['close',1,0,'-1',true],['close',1,0,'1',true],['half',3,0,'-1',true],['quarter',3,0,'-1',true],['close',1,-55,'-1',true],['close',1,-55,'-1',false],['close',1,55,'1',true],['close',1,55,'1',false]];
    const captures=[],attestations=[],bindings=[];browser.draws=[];
    for(const tier of ['Mid','High'])for(const [i,state]of matrix.entries()){
     const [view,repeat,angleDegrees,light,relief]=state,label=tier.toLowerCase()+'-'+i,p=base+'/'+label+'-gpu.png',dim=data.gpu[tier].dimensions;
     const pixelSHA=execFileSync('/usr/bin/python3',['-c',"from PIL import Image;import hashlib,sys;i=Image.new('RGBA',(int(sys.argv[2]),int(sys.argv[2])),(int(sys.argv[3]),20,10,255));i.save(sys.argv[1]);print(hashlib.sha256(i.tobytes()).hexdigest())",join(root,p),String(dim[0]),String(30+(i===3?2:i))],{env,encoding:'utf8'}).trim();
     const actual={name,tier,view,repeat,angleDegrees,light,relief,normalPackedSha256:data.gpu[tier].packedSHA,framebuffer:dim,framebufferRgbaBottomUpSha256:pixelSHA};browser.draws.push(actual);
     const receipt=json('docs/quake/textures/fixture/'+label+'-receipt.json',{state:'ready',checks:[{passed:true}],shaderErrors:[],inputs:browser.inputs,lastDraw:actual,draws:[actual]});
     const gpu=reference(p),comparison=reference(p),files={receipt,gpu,comparison};captureRefs.push(receipt,gpu,comparison);
     captures.push({label,actual,files});bindings.push(Object.assign(reference(p),{actualBottomUpRGBApixelSha256:pixelSHA,matchingStates:[{tier,view,repeat,angleDegrees,light,relief}],perDraw:receipt}));
     attestations.push({label,actualPose:[tier,...state],receiptSha256:'',framebufferRgbaBottomUpSha256:pixelSHA,GPUDecodeExactFrameSHA:true,comparisonPixelsExact:true,packedAuthoredXYZHeightExact:true});
     // Receipt digest is refreshed by save() after the ordered receipt write.
     attestations.at(-1).receipt=receipt;
    }
    const captureSet={schemaVersion:1,material:name,candidateBatch:candidateRef,counts:{poses:16,Mid:8,High:8,uniqueFramebuffers:14},captures,boundInputs:[candidateRef,receiptRef,original,...['Mid','High'].flatMap(t=>Object.values(refsFor(t)))],codeAtCapture:['tests/quake_texture_tiers_trial.html','tests/quake_texture_tiers_trial.js'].map(p=>reference(p))};
    for(const v of captureSet.codeAtCapture)await put(v.file,await readFile(resolve(v.file)));
    const setRef=json('docs/quake/textures/fixture/capture-set.json',captureSet);await put('docs/quake/textures/fixture/capture-verifier.py','synthetic fixture attestation only');
    const publicProof={schemaVersion:1,verdict:'PASS_INDEPENDENT_ALL16_SAVED_HARDWARE_POSE_STATE_AND_ARTIFACT_BINDINGS',captureSet:setRef,counts:{poses:16,Mid:8,High:8,uniqueFramebuffers:14,sourceInputs:13,GPUComparisonReceiptTriples:16},...Object.fromEntries(['matrixExactAndUnique','M2WebGL2AllReceipts','allReceiptsReadyNoShaderErrors','allInputHashesCurrent','packedXYZHeightBothTiersExact','all16PNGFlipRGBAMatchActualFramebufferSHA','all16ComparisonPNGsPixelExact','reliefFlatFramesDifferAllFourPairs','halfQuarterRepeatedGPUIdentityExplicit'].map(k=>[k,true])),captures:attestations,watchedInputs:[...captureRefs,...captureSet.boundInputs],verifier:reference('docs/quake/textures/fixture/capture-verifier.py')};
    capturePublicRef=json('docs/quake/textures/fixture/capture-public.json',publicProof);proofs.captureSet=captureSet;proofs.capturePublic=publicProof;proofs.composedBindings=bindings;
   }
   proofs.art={schemaVersion:1,verdict:composed?'PASS bounded repaired source, both-tier offline ART and sixteen-pose finite hardware material review':'PASS independent ART within currentMid/High fixture',name,nativeIdentity:id,masterPackage:masterRef,tierReceipt:receiptRef,candidateBatch:candidateRef,publicNumericalProof:numericRef,artFindings:Object.fromEntries(['realMaterial','nativeFormsColourScale','repeatGeometry','physicalDepth','glancingBrowser'].map(k=>[k,'PASS synthetic fixture attestation'])),browserCoverage:{receiptSnapshot:browserRef,actualCapturesAndDraws:['Mid','High'].map(t=>reference(data.gpu[t].path)),rawGPUBindings:['Mid','High'].map(t=>Object.assign(reference(data.gpu[t].path),{actualBottomUpRGBApixelSha256:data.gpu[t].pixelSHA}))}};
   if(composed)Object.assign(proofs.art.browserCoverage,{GPUcomparisonPairs:16,PNGfiles:32,perDrawReceipts:16,capturePublicProof:capturePublicRef,actualCapturesAndDraws:captureRefs,rawGPUBindings:proofs.composedBindings});
   const sourceRef=composed?null:json('docs/quake/textures/fixture/source.json',proofs.source),artRef=json('docs/quake/textures/fixture/art.json',proofs.art);
   proofs.final={verdict:'PASS within authoring and finite hardware web-material scope',name,nativeIdentity:id,evidence:[...(sourceRef?[sourceRef]:[]),numericRef,artRef]};json('docs/quake/textures/fixture/final.json',proofs.final);
  }
  const counts={reviewedNativeIdentities:1,masterPackages:1,enhancedTiers:2,enhancedMaps:10,enhancedTierBindings:2,enhancedMapBindings:10};const catalog={schemaVersion:1,family:'quake',pathsBase:'repository',defaultTier:'Mid',standard:{encodingByRole:manifest.encodingByRole},materials:[row],counts};
  const save=async()=>{
   for(const[p,value]of jsonFiles){await refresh();if(proofs.capturePublic)for(const a of proofs.capturePublic.captures)a.receiptSha256=a.receipt.sha256;row.masterPackageSha256=masterRef.sha256;row.tierReceiptSha256=receiptRef.sha256;row.Low.sha256=original.sha256;candidate.items[0].masterPackageSha256=masterRef.sha256;candidate.items[0].tierReceiptSha256=receiptRef.sha256;if(proofs.browser)for(const tier of Object.values(row.tiers))for(const v of Object.values(tier.outputs))proofs.browser.inputs[v.file].sha256=v.sha256;await put(p,JSON.stringify(value));}
   await refresh();row.masterPackageSha256=masterRef.sha256;row.tierReceiptSha256=receiptRef.sha256;row.Low.sha256=original.sha256;
   row.reviews=Object.fromEntries(jsonFiles.filter(([p])=>/\/(?:numeric|preview|art|source|final)\.json$/.test(p)).map(([p])=>[p,shaBuffer(p)]));
   await put(QCAT,JSON.stringify(catalog));await put('docs/quake/textures/progress.json',JSON.stringify({qualified8xMaterials:1,qualifiedMasterPackages:1,qualifiedPhysicalMaps:10,authoringQualified:{materials:1,enhancedTiers:2,physicalMaps:10}}));
  };
  // Synchronous hash only after the explicitly ordered JSON graph is written.
  const shaBuffer=p=>sha(readFileSync(join(root,p)));
  await put('baseline.json','{"materials":[]}');await save();
  const cli=resolve('tools/texture_sheets/check_texture_catalog_custody.py');
  const run=(extra=[])=>JSON.parse(execFileSync('/usr/bin/python3',[cli,'--family','quake','--baseline','baseline.json','--source-root','/checkpoint/clone',...origins.flatMap(p=>['--reference-root',p]),...extra],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  await fn({root,env,base,row,master,manifest,catalog,proofs,json,reference,origins,compositionInfo,put,save,run});
 }finally{await rm(root,{recursive:true,force:true});}
}

// Refreshed maintained portable fixture; independent mutations call the public CLI.
// Synthetic fixture statements are not actual artwork/hardware acceptance.
test('R1 sixteen-pose ART cannot shrink to two GPU witnesses',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().verdict,'PASS snapshot catalog custody');assert.equal(f.proofs.art.browserCoverage.rawGPUBindings.length,16);
 f.proofs.art.browserCoverage.rawGPUBindings=f.proofs.art.browserCoverage.rawGPUBindings.slice(0,2);await f.save();assert.throws(f.run,/sixteen|Sixteen|pose|capture|triple/);
},{shape:'single',composed:true}));
test('R2 third Ultra tier is rejected despite preserved declared two-tier counts',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().verdict,'PASS snapshot catalog custody');f.row.tiers.Ultra=structuredClone(f.row.tiers.High);f.manifest.tiers.Ultra=structuredClone(f.manifest.tiers.High);await f.save();assert.throws(f.run,/tiers differ/);
}));
test('R3 separate numeric candidate cannot borrow valid ART candidate path closure',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().verdict,'PASS snapshot catalog custody');const p='docs/quake/textures/fixture/numeric-wrong-candidate.json',old=f.proofs.numeric.candidateBatch,candidate=JSON.parse(await readFile(join(f.root,old.file),'utf8'));
 candidate.items[0].masterPackage='assets/wrong-master.json';candidate.items[0].tierReceipt='assets/wrong-receipt.json';candidate.items[0].tiers.High.files.normalZ='assets/wrong-high-normalZ.webp';const bytes=JSON.stringify(candidate);await f.put(p,bytes);f.proofs.numeric.candidateBatch={file:p,sha256:sha(bytes)};await f.save();assert.throws(f.run,/candidate package path\/hash differs|candidate map path differs/);
},{shape:'single',composed:true}));
test('R4 malformed empty current catalog cannot bypass global policy',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().verdict,'PASS snapshot catalog custody');f.catalog.materials=[];Object.assign(f.catalog,{schemaVersion:999,family:'wrong-family',pathsBase:'unknown',defaultTier:'Ultra'});for(const k of Object.keys(f.catalog.counts))f.catalog.counts[k]=0;await f.save();await f.put('docs/quake/textures/progress.json',JSON.stringify({qualified8xMaterials:0,qualifiedMasterPackages:0,qualifiedPhysicalMaps:0,authoringQualified:{materials:0,enhancedTiers:0,physicalMaps:0}}));assert.throws(f.run,/Wrong Quake catalog policy/);
}));
test('R2 uncounted sixth manifest output role is rejected',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().verdict,'PASS snapshot catalog custody');f.manifest.tiers.High.outputs.normalW=structuredClone(f.manifest.tiers.High.outputs.normalZ);await f.save();assert.throws(f.run,/role|tier|dimension|output/i);
}));
test('R1 ART cannot cite another sealed source receipt as current numerical proof',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().verdict,'PASS snapshot catalog custody');f.proofs.art.publicNumericalProof=f.reference('docs/quake/textures/fixture/native.json');await f.save();assert.throws(f.run,/ART public numerical proof differs/);
},{shape:'single',composed:true}));
test('R1 sixteen-pose comparison must appear in independent public watched closure',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().verdict,'PASS snapshot catalog custody');const missing=f.proofs.captureSet.captures[0].files.comparison.file;f.proofs.capturePublic.watchedInputs=f.proofs.capturePublic.watchedInputs.filter(v=>v.file!==missing);await f.save();assert.throws(f.run,/Sixteen-pose artifact binding differs/);
},{shape:'single',composed:true}));
test('composed journal cannot replace retained raw with derived source',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().verdict,'PASS snapshot catalog custody');f.compositionInfo.journal.items[0].generated=f.master.inputs.generated.file;f.compositionInfo.journal.items[0].generatedSha256=f.master.inputs.generated.sha256;await f.save();assert.throws(f.run,/Journal must bind raw/);
},{shape:'single',composed:true}));
