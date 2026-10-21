import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat,symlink,readdir,readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {snapshotIndex,withoutGitEnvironment,stagedChanges,qualifyTextureScope,gateCommands,precommit,publishTextureCheckpoint,TEXTURE_TESTS} from '../tools/distribution/precommit.mjs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as gate from '../tools/distribution/precommit.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const CATALOG='assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json';
const QCAT='assets/authoring/texture_sheets/sources/quake-world-2026-10-20/catalog.json';
async function fixture(fn,{quakeBaseline=true}={}){
 const root=await mkdtemp(join(tmpdir(),'quaked-gate-test-')),env=withoutGitEnvironment();
 // Test default scope unless a case opts in; isolate the enclosing gate's mode.
 delete env.QUAKED_CHECKPOINT_MODE;
 const git=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8'}).trimEnd();
 const put=async(path,value)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),value);};
 try{
  git('init','-q','-b','Dev');git('config','user.name','Public fixture');git('config','user.email','fixture@example.invalid');
  await put(CATALOG,JSON.stringify({materials:[]}));if(quakeBaseline)await put(QCAT,JSON.stringify({materials:[]}));await put('docs/hexen2/textures/note.md','base');
  git('add','.');git('-c','core.hooksPath=/dev/null','commit','-qm','fixture');
  await fn({root,env,git,put,base:git('rev-parse','HEAD')});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('staged snapshot includes only index bytes and deletions, preserving working files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'quaked-index-test-'));const snapshot=await mkdtemp(join(tmpdir(),'quaked-index-output-'));
 // The fixture repository is isolated even when run from a hook that exports GIT_DIR.
 const env=withoutGitEnvironment();const git=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8'});
 try{
  git('init','-q');await writeFile(join(root,'kept.txt'),'staged');await writeFile(join(root,'deleted.txt'),'old');git('add','.');
  git('rm','--cached','deleted.txt');await writeFile(join(root,'kept.txt'),'unstaged');await writeFile(join(root,'untracked.txt'),'private');
  const before=git('ls-files','--stage');const tree=await snapshotIndex(root,snapshot,env);
  assert.match(tree,/^[a-f0-9]{40,64}$/);assert.equal(await readFile(join(snapshot,'kept.txt'),'utf8'),'staged');
  await assert.rejects(stat(join(snapshot,'deleted.txt')),{code:'ENOENT'});await assert.rejects(stat(join(snapshot,'untracked.txt')),{code:'ENOENT'});
  assert.equal(await readFile(join(root,'kept.txt'),'utf8'),'unstaged');assert.equal(await readFile(join(root,'deleted.txt'),'utf8'),'old');assert.equal(git('ls-files','--stage'),before);
 }finally{await rm(root,{recursive:true,force:true});await rm(snapshot,{recursive:true,force:true});}
});
test('staged builds and tests never inherit the hook\'s Git environment',()=>{
 const env=withoutGitEnvironment({GIT_DIR:'/repo/.git/worktrees/w',GIT_INDEX_FILE:'/repo/.git/worktrees/w/index',GIT_PREFIX:'',PATH:'/bin',QUAKED_X:'1'});
 assert.deepEqual(env,{PATH:'/bin',QUAKED_X:'1'});
});
test('pinned export survives concurrent index changes without reading private work',()=>fixture(async({root,git,put,env})=>{
 await put('docs/hexen2/textures/note.md','frozen');git('add','.');const tree=git('write-tree');
 await put('docs/hexen2/textures/note.md','later');git('add','.');
 const target=await mkdtemp(join(tmpdir(),'quaked-pinned-output-'));
 try{await snapshotIndex(root,target,env,tree);assert.equal(await readFile(join(target,'docs/hexen2/textures/note.md'),'utf8'),'frozen');assert.equal(await readFile(join(root,'docs/hexen2/textures/note.md'),'utf8'),'later');}
 finally{await rm(target,{recursive:true,force:true});}
}));
test('texture scope rejects foreign endpoints, deletions, symlinks and submodules',()=>fixture(async({root,git,put,env,base})=>{
 for(const path of ['src/native.js','src-tauri/src/main.rs','assets/boxes/foreign.webp','src/newer/ui.js','package.json','.github/workflows/distribution.yml']){
  await put(path,'foreign');git('add',path);const tree=git('write-tree');
  await assert.rejects(qualifyTextureScope(root,base,tree,stagedChanges(root,base,tree,env),null,env),/Not a texture-only/);git('reset','-q','HEAD','--',path);
 }
 await put('foreign.txt','foreign');git('add','foreign.txt');git('-c','core.hooksPath=/dev/null','commit','-qm','foreign base');const foreignBase=git('rev-parse','HEAD');
 git('mv','foreign.txt','docs/hexen2/textures/moved.txt');let tree=git('write-tree');
 await assert.rejects(qualifyTextureScope(root,foreignBase,tree,stagedChanges(root,foreignBase,tree,env),null,env),/foreign.txt/);
 git('reset','-q','HEAD');await symlink('/private/tmp/outside',join(root,'docs/hexen2/textures/link'));git('add','docs/hexen2/textures/link');tree=git('write-tree');
 assert.throws(()=>stagedChanges(root,foreignBase,tree,env),/Symlink\/submodule/);git('reset','-q','HEAD');
 git('update-index','--add','--cacheinfo','160000,'+foreignBase+',docs/hexen2/textures/module');
 assert.throws(()=>stagedChanges(root,foreignBase,git('write-tree'),env),/Symlink\/submodule/);
}));
test('bootstrap admits only exact reviewed changed controls at the exact base',()=>fixture(async({root,git,put,env,base})=>{
 const control='tools/distribution/precommit.mjs';await put(control,'reviewed');await put('docs/hexen2/textures/note.md','staged');git('add','.');
 const tree=git('write-tree'),changes=stagedChanges(root,base,tree,env),receipt=join(root,'review.json');
 await assert.rejects(qualifyTextureScope(root,base,tree,changes,null,env),/bootstrap receipt/);
 const data={schemaVersion:1,baseCommit:base,reviewedBy:'Independent fixture',authority:'Owner authorized texture and HTML gate',controls:{[control]:sha('reviewed')}};
 await writeFile(receipt,JSON.stringify(data));assert.equal((await qualifyTextureScope(root,base,tree,changes,receipt,env)).reviewedBy,data.reviewedBy);
 for(const delta of [{baseCommit:'0'.repeat(40)},{controls:{[control]:sha('other')}},{controls:{[control]:sha('reviewed'),'unexpected':sha('x')}}]){
  await writeFile(receipt,JSON.stringify({...data,...delta}));await assert.rejects(qualifyTextureScope(root,base,tree,changes,receipt,env),/Bootstrap/);
 }
}));
test('Dev commands include real texture interfaces and HTML, with native commands retained only in full mode',()=>{
 const dev=gateCommands('dev-texture','darwin');assert.equal(dev.filter(([,args])=>args[0]?.startsWith('tests/')&&args[0].endsWith('.py')).length,TEXTURE_TESTS.length);
 assert.ok(dev.some(([,args])=>args.includes('build:web')));assert.ok(dev.some(([,args])=>args[0]==='tools/distribution/verify-site.mjs'));
 assert.ok(!dev.some(([file,args])=>file==='cargo'||args.includes('build:desktop')||args.includes('tauri')||args.includes('tools/distribution/engine-tests.mjs')));
 const full=gateCommands('full','darwin');assert.equal(full.filter(([file])=>file==='cargo').length,2);assert.ok(full.some(([,args])=>args.includes('universal-apple-darwin')));
});
test('public Dev orchestration publishes truthful receipt and rejects moved index or failed checks',()=>fixture(async({root,git,put,env})=>{
 await put('docs/hexen2/textures/note.md','staged');git('add','.');const index=git('ls-files','--stage'),tree=git('write-tree'),dest=join(root,'dist/texture-checkpoints',tree);
 await put('dist/staged/desktop/foreign.txt','foreign desktop');await put('dist/staged/packs/foreign.bin','foreign packs');
 const calls=[];const run=async(file,args,cwd,childEnv)=>{calls.push([file,...args]);assert.equal(childEnv.GIT_DIR,undefined);assert.equal(childEnv.PYTHONDONTWRITEBYTECODE,'1');assert.equal(childEnv.QUAKED_MOTIF_CLI,undefined);if(args.includes('build:web')){await mkdir(join(cwd,'dist/web'),{recursive:true});await writeFile(join(cwd,'dist/web/index.html'),'fixture HTML');}};
 await precommit(root,{env:{...env,QUAKED_MOTIF_CLI:'/unreviewed'},run,platform:'darwin'});
 let receipt=JSON.parse(await readFile(join(dest,'staged-receipt.json')));assert.equal(receipt.scope,'dev-texture');assert.equal(receipt.output,dest);assert.equal(receipt.macBuilt,false);assert.equal(receipt.htmlSha256,sha('fixture HTML'));assert.deepEqual(receipt.commands.map(row=>row.command),calls);assert.equal(git('ls-files','--stage'),index);
 assert.equal(await readFile(join(root,'dist/staged/desktop/foreign.txt'),'utf8'),'foreign desktop');assert.equal(await readFile(join(root,'dist/staged/packs/foreign.bin'),'utf8'),'foreign packs');
 let failedSnapshot;await assert.rejects(precommit(root,{env,run:async(file,args,cwd)=>{failedSnapshot=cwd;throw Error('fixture failure');}}),/fixture failure/);await rm(failedSnapshot,{recursive:true,force:true});
 assert.equal(await readFile(join(dest,'web/index.html'),'utf8'),'fixture HTML');
 let movedSnapshot;await assert.rejects(precommit(root,{env,run:async(file,args,cwd,childEnv)=>{movedSnapshot=cwd;await run(file,args,cwd,childEnv);if(args.includes('build:web')){await put('docs/hexen2/textures/note.md','concurrent');git('add','docs/hexen2/textures/note.md');}}}),/index changed/);await rm(movedSnapshot,{recursive:true,force:true});
}));
test('exclusive texture publication preserves existing directories and symlinks and copies only owned HTML',()=>fixture(async({root,put})=>{
 const snapshot=join(root,'snapshot'),tree='a'.repeat(40),dest=join(root,'dist/texture-checkpoints',tree);
 await put('snapshot/dist/web/index.html','HTML');await put('snapshot/dist/web/data/part.bin','HTML data');await put('snapshot/dist/staged-receipt.json','receipt');await put('snapshot/dist/desktop/foreign.txt','not our output');
 await put('dist/staged/desktop/foreign.txt','protected');await put('dist/texture-checkpoints/'+tree+'/sentinel','existing');
 await assert.rejects(publishTextureCheckpoint(root,snapshot,tree),{code:'EEXIST'});assert.equal(await readFile(join(dest,'sentinel'),'utf8'),'existing');
 await rm(dest,{recursive:true});await symlink(join(root,'foreign-destination'),dest);
 await assert.rejects(publishTextureCheckpoint(root,snapshot,tree),{code:'EEXIST'});assert.equal(await readlink(dest),join(root,'foreign-destination'));await rm(dest);
 assert.equal(await publishTextureCheckpoint(root,snapshot,tree),dest);assert.equal(await readFile(join(dest,'web/data/part.bin'),'utf8'),'HTML data');await assert.rejects(stat(join(dest,'desktop')),{code:'ENOENT'});assert.equal(await readFile(join(root,'dist/staged/desktop/foreign.txt'),'utf8'),'protected');
 await assert.rejects(publishTextureCheckpoint(root,snapshot,tree),{code:'EEXIST'});assert.equal(await readFile(join(dest,'staged-receipt.json'),'utf8'),'receipt');
}));
test('failed export and pre-command setup remove only their private temporary directories',()=>fixture(async({root,git,put,env})=>{
 const temporary=join(root,'private-temporary');await mkdir(temporary);
 await put('blocked','file');await assert.rejects(snapshotIndex(root,join(root,'blocked/child'),env,git('write-tree'),temporary));assert.deepEqual(await readdir(temporary),[]);assert.equal(await readFile(join(root,'blocked'),'utf8'),'file');
 git('rm','-q',CATALOG);git('-c','core.hooksPath=/dev/null','commit','-qm','fixture without baseline');await put('docs/hexen2/textures/note.md','staged');git('add','docs/hexen2/textures/note.md');
 let calls=0;await assert.rejects(precommit(root,{env,temporaryRoot:temporary,run:()=>{calls++;}}),/does not exist|not exist/);assert.equal(calls,0);assert.deepEqual(await readdir(temporary),[]);
 await put('package.json','foreign');git('add','package.json');await assert.rejects(precommit(root,{env,temporaryRoot:temporary,run:()=>{calls++;}}),/Not a texture-only/);assert.equal(calls,0);assert.deepEqual(await readdir(temporary),[]);
}));
test('default scope fails closed while explicitly authorized full Dev mode reaches only an injected runner',()=>fixture(async({root,git,put,env,base})=>{
 let calls=0;const run=()=>{calls++;};await put('package.json','foreign');git('add','package.json');await assert.rejects(precommit(root,{env,run}),/Not a texture-only/);assert.equal(calls,0);
 let fullSnapshot;const commands=[];
 try{
  await assert.rejects(precommit(root,{env:{...env,QUAKED_CHECKPOINT_MODE:'full'},run:(file,args,cwd)=>{fullSnapshot=cwd;commands.push([file,args]);throw Error('fixture stops explicit full before executing commands');}}),/fixture stops explicit full/);
  assert.deepEqual(commands,[gateCommands('full')[0]]);assert.equal(calls,0);
 }finally{if(fullSnapshot)await rm(fullSnapshot,{recursive:true,force:true});}
 git('reset','-q','HEAD');
 git('switch','-qc','feature');await assert.rejects(precommit(root,{env,run}),/requires Dev/);assert.equal(calls,0);git('switch','-q','Dev');
 const blob=git('rev-parse','HEAD:docs/hexen2/textures/note.md');execFileSync('git',['update-index','--index-info'],{cwd:root,env,input:`0 ${'0'.repeat(40)}\tdocs/hexen2/textures/note.md\n100644 ${blob} 1\tdocs/hexen2/textures/note.md\n100644 ${blob} 2\tdocs/hexen2/textures/note.md\n`});
 await assert.rejects(precommit(root,{env,run}),/Unmerged/);assert.equal(calls,0);
}));
test('an unstaged executing gate cannot qualify a different staged control implementation',()=>fixture(async({root,git,put,env})=>{
 await put('tools/distribution/precommit.mjs','different staged control');git('add','tools/distribution/precommit.mjs');git('-c','core.hooksPath=/dev/null','commit','-qm','fixture gate');
 await put('docs/hexen2/textures/note.md','staged');git('add','docs/hexen2/textures/note.md');
 await assert.rejects(precommit(root,{env}),/Executing checkpoint control differs from staged bytes/);
}));
test('public custody CLI remaps canonical paths into snapshot and rejects changed or missing bytes',()=>fixture(async({root,put,env})=>{
 const base='assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/fixture',canonical='/canonical/quaked';
 const refs=[];
 const source=async(path,bytes)=>{await put(path,bytes);const row={file:canonical+'/'+path,sha256:sha(bytes)};refs.push(row);return row;};
 const json=async(path,data)=>source(path,JSON.stringify(data));
 const original=await source(base+'/original.png','fixture native'),color=await source(base+'/master/color.png','fixture RGB'),height=await source(base+'/master/height.npy','fixture float');
 const master=await json(base+'/master/master.json',{generationCount:1,canonicalMasterFactor:8,nativeDimensions:[1,1],masterDimensions:[8,8],inputs:{original},color:{file:'color.png',sha256:color.sha256},height:{file:'height.npy',sha256:height.sha256}});
 const tiers={},recorded={};
 for(const [name,factor] of [['Mid',4],['High',8]]){
  tiers[name]={factor,dimensions:[factor,factor],outputs:{}};recorded[name]={factor,dimensions:[factor,factor],outputs:{}};
  for(const role of ['diffuse','height','normalX','normalY','normalZ']){
   const path=base+'/tiers/'+name.toLowerCase()+'-'+role+'.webp',row=await source(path,name+role);
   tiers[name].outputs[role]={file:path,sha256:row.sha256};recorded[name].outputs[role]={file:path.split('/').at(-1),sha256:row.sha256,quality:92,method:6,lossless:false};
  }
 }
 const receipt=await json(base+'/tiers/manifest.json',{inputs:{master:color,heightMaster:height,original},tiers:recorded});
 const reviews={};const bound=[...refs];
 for(const name of ['actual-v1','preview-v1','art-review-v1','final-custody-v1']){
  const path='docs/hexen2/textures/fixture/'+name+'.json';const row=await json(path,{verdict:'PASS fixture custody',inputs:bound});reviews[path]=row.sha256;
 }
 const counts={reviewedWorldNativeIdentities:1,masterPackages:1,enhancedTiers:2,enhancedMaps:10,enhancedTierBindings:2,enhancedMapBindings:10};
 const row={id:'a'.repeat(64),name:'fixture',masterPackage:base+'/master/master.json',masterPackageSha256:master.sha256,tierReceipt:base+'/tiers/manifest.json',tierReceiptSha256:receipt.sha256,Low:{original:base+'/original.png',sha256:original.sha256,unchanged:true},tiers,reviews};
 await put(CATALOG,JSON.stringify({materials:[row],counts}));await put('docs/hexen2/textures/campaign-status.json',JSON.stringify({reviewed:counts}));await put('docs/hexen2/textures/progress.json',JSON.stringify({reviewedWorldNativeIdentities:1,sourceMasterPackages:1,maps:10,enhancedMapBindings:10}));await put('docs/hexen2/textures/world-queue.csv','native_id,state\n'+row.id+',reviewed\n');await put('baseline.json',JSON.stringify({materials:[]}));
 const cli=resolve('tools/texture_sheets/check_texture_catalog_custody.py');
 const run=()=>JSON.parse(execFileSync('python3',[cli,'--baseline','baseline.json','--source-root',canonical],{cwd:root,env:{...env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 assert.equal(run().verdict,'PASS snapshot catalog custody');
 await put(base+'/tiers/mid-diffuse.webp','changed');assert.throws(run,/hash mismatch/);
 await put(base+'/tiers/mid-diffuse.webp','Middiffuse');await rm(join(root,base+'/master/color.png'));assert.throws(run,/No such file/);
}));

test('Quake scope is precise, including only actual trial interfaces and three additive CLIs',()=>{
 for(const path of [QCAT,'docs/quake/textures/current.json','docs/evidence/quake-textures-2026-10-20/proof.json','tools/texture_sheets/derive_quake_texture_tiers.py','tools/texture_sheets/build_quake_texture_batch_review.py','tools/texture_sheets/register_texture_boundary_x.py','tests/quake_texture_tiers_test.py','tests/quake_texture_batch_review_test.py','tests/texture_boundary_x_registration_test.py','tests/fixtures/quake_codec_protected_producers.json','tests/quake_texture_tiers_trial.html','tests/quake_texture_tiers_trial.js','AGENTS.md','docs/texture-tier-standard.md'])assert.equal(gate.texturePath(path),true,path);
 for(const path of ['tests/quake_texture_review_set.js','tests/quake_texture_review_set_test.mjs','tests/foreign_test.py','tools/texture_sheets/foreign.py','assets/authoring/texture_sheets/sources/official-world-2026-10-17/new.png','docs/quake/engine.md','src/engine/new.js'])assert.equal(gate.texturePath(path),false,path);
});
test('Dev gate runs literal seven inherited and three Quake suites, both custody families, no collector or desktop',()=>{
 const commands=gateCommands('dev-texture','darwin','python','/checkpoint',['/canonical/main','/canonical/fc24']);
 assert.deepEqual(commands.filter(([,a])=>a[0]?.startsWith('tests/')&&a[0].endsWith('.py')).map(([,a])=>a[0]),['prepare_texture_master_test.py','hexen2_texture_tiers_test.py','texture_batch_review_test.py','texture_boundary_registration_test.py','texture_layered_master_test.py','texture_layered_boundary_test.py','texture_motif_master_test.py','quake_texture_tiers_test.py','quake_texture_batch_review_test.py','texture_boundary_x_registration_test.py'].map(p=>'tests/'+p));
 const checks=commands.filter(([,a])=>a[0]==='tools/texture_sheets/check_texture_catalog_custody.py');assert.equal(checks.length,2);assert.ok(checks.some(([,a])=>a.includes('quake')));for(const[,a]of checks){assert.deepEqual(a.slice(-4),['--reference-root','/canonical/main','--reference-root','/canonical/fc24']);}
 assert.ok(!commands.some(([p,a])=>p==='cargo'||a.some(v=>/review_set|build:desktop|tauri/.test(v))));
});
test('reviewed relocation-only bootstrap is explicit and rejects overlapping roots',()=>fixture(async({root,git,put,env,base})=>{
 await put('docs/hexen2/textures/note.md','next');git('add','.');const tree=git('write-tree'),changes=stagedChanges(root,base,tree,env),file=join(root,'relocation.json');
 const receipt={schemaVersion:1,purpose:'reference-relocation',baseCommit:base,reviewedBy:'Independent fixture',authority:'Relocate sealed source references into snapshot only',controls:{},referenceRoots:['/canonical/main','/canonical/fc24']};await writeFile(file,JSON.stringify(receipt));
 assert.deepEqual((await qualifyTextureScope(root,base,tree,changes,file,env)).referenceRoots,receipt.referenceRoots);
 for(const delta of [{purpose:undefined},{baseCommit:'0'.repeat(40)},{referenceRoots:['/canonical','/canonical/main']},{referenceRoots:['/canonical/main','/canonical/main']},{referenceRoots:['relative']}]){await writeFile(file,JSON.stringify({...receipt,...delta}));await assert.rejects(qualifyTextureScope(root,base,tree,changes,file,env));}
}));
test('complete catalog history observes merged create/remove, rather than only the final absent tree',()=>fixture(async({root,git,put,env,base})=>{
 assert.equal(typeof gate.observeCatalogHistory,'function');assert.equal(gate.QUAKE_CATALOG_ANCHOR,'260a3cc5551ed8a8d5b76b03d64a3253813fe420');
 const initial=await gate.observeCatalogHistory(root,base,QCAT,base,env);assert.equal(initial.baseCatalogAbsent,true);assert.deepEqual(initial.historyCommits,[]);assert.equal(initial.nonShallow,true);assert.equal(initial.completeHistory,true);
 git('switch','-qc','catalog-side');await put(QCAT,JSON.stringify({family:'quake',materials:[]}));git('add',QCAT);git('-c','core.hooksPath=/dev/null','commit','-qm','catalog existed');git('rm',QCAT);git('-c','core.hooksPath=/dev/null','commit','-qm','catalog removed');git('switch','-q','Dev');git('merge','--no-ff','-qm','retain side ancestry','catalog-side');
 const after=await gate.observeCatalogHistory(root,git('rev-parse','HEAD'),QCAT,base,env);assert.equal(after.baseCatalogAbsent,true);assert.ok(after.historyCommits.length>=2);
 await assert.rejects(gate.observeCatalogHistory(root,after.base,QCAT,'0'.repeat(40),env));
},{quakeBaseline:false}));
test('first introduction authorization binds actual base, staged addition and catalog SHA; no generic missing fallback',()=>{
 assert.equal(typeof gate.authorizeInitialQuakeCatalog,'function');const base='a'.repeat(40),anchor=gate.QUAKE_CATALOG_ANCHOR,bytes=Buffer.from(JSON.stringify({family:'quake',materials:[]}));
 const observed={base,anchor,catalog:QCAT,baseCatalogAbsent:true,nonShallow:true,completeHistory:true,historyCommits:[],reachableCommitCount:2};const bootstrap={baseCommit:base,reviewedBy:'Independent fixture',initialQuakeCatalog:{path:QCAT,stagedSha256:sha(bytes),anchorCommit:anchor,authority:'First introduction after complete never-present history'}};const changes=[{path:QCAT,status:'A'}];
 assert.equal(gate.authorizeInitialQuakeCatalog(observed,bootstrap,changes,bytes).stagedSha256,sha(bytes));
 for(const delta of [{baseCatalogAbsent:false},{nonShallow:false},{completeHistory:false},{historyCommits:['b'.repeat(40)]}])assert.throws(()=>gate.authorizeInitialQuakeCatalog({...observed,...delta},bootstrap,changes,bytes));
 for(const delta of [{baseCommit:'b'.repeat(40)},{initialQuakeCatalog:undefined},{initialQuakeCatalog:{...bootstrap.initialQuakeCatalog,stagedSha256:'0'.repeat(64)}},{initialQuakeCatalog:{...bootstrap.initialQuakeCatalog,authority:''}}])assert.throws(()=>gate.authorizeInitialQuakeCatalog(observed,{...bootstrap,...delta},changes,bytes));
 assert.throws(()=>gate.authorizeInitialQuakeCatalog(observed,bootstrap,[],bytes));assert.throws(()=>gate.authorizeInitialQuakeCatalog(observed,bootstrap,[{path:QCAT,status:'M'}],bytes));assert.throws(()=>gate.authorizeInitialQuakeCatalog(observed,bootstrap,changes,Buffer.from('{bad')));
});

// Real small PNG/float/WebP files exercise custody without borrowing production
// assets or using a producer as the custody oracle. Synthetic attestations are
// fixture records, never a claim of actual artwork or hardware qualification.
async function quakeCatalogFixture(fn,{shape='collective',compact=false}={}){
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
n=Image.new('RGB',(8,8),(40,28,14));n.save(d/'native.png');Image.new('RGB',(64,64),(40,28,14)).save(d/'raw.png');Image.new('RGB',(64,64),(40,28,14)).save(d/'master/color.png');np.save(d/'master/height.npy',np.full((64,64),64/255,dtype='float32'),allow_pickle=False)
roles=['diffuse','height','normalX','normalY','normalZ'];out={};gpu={}
for tier,size in [('Mid',32),('High',64)]:
 out[tier]={}
 for role,value in zip(roles,[(40,28,14),64,128,128,255]):
  im=Image.new('RGB'if role=='diffuse'else'L',(size,size),value);p=d/'tiers'/(tier.lower()+'-'+role+'.webp');im.save(p,'WEBP',quality=92,lossless=role!='diffuse',method=6);decoded=Image.open(p).convert(im.mode)
  out[tier][role]={'file':p.name,'sha256':sha(p),'dimensions':[size,size],'lossless':role!='diffuse','method':6,'bitDepth':8,'pixelLayout':im.mode,'intendedPixelSha256':hashlib.sha256(im.tobytes()).hexdigest(),'decodedPixelSha256':hashlib.sha256(decoded.tobytes()).hexdigest(),'integerCompression':{'mismatchCount':0,'meanAbsoluteError':0,'maximum':0},**({'quality':92}if role=='diffuse'else{'compressionEffort':92})}
 cap=Image.new('RGBA',(size,size),(30,20,10,255));p=d/(tier.lower()+'-gpu.png');cap.save(p);packed=bytes([128,128,255,64])*(size*size);gpu[tier]={'path':str(p.relative_to(r)),'pixelSHA':hashlib.sha256(cap.tobytes()).hexdigest(),'packedSHA':hashlib.sha256(packed).hexdigest(),'dimensions':[size,size]}
print(json.dumps({'maps':out,'rgbaSha256':hashlib.sha256(n.convert('RGBA').tobytes()).hexdigest(),'gpu':gpu}))`,root,base],{env,encoding:'utf8'}));
  await put(base+'/prompt.txt','one retained fixture source');
  const fixturePath='tests/fixtures/quake_codec_protected_producers.json';const pins=JSON.parse(await readFile(resolve(fixturePath),'utf8'));
  for(const v of pins.protectedSourceBindings)await put(v.file,await readFile(resolve(v.file)));await put(fixturePath,JSON.stringify(pins));
  await put('tools/texture_sheets/derive_quake_texture_tiers.py',await readFile(resolve('tools/texture_sheets/derive_quake_texture_tiers.py')));
  const original=reference(base+'/native.png',origins[0]),raw=reference(base+'/raw.png',origins[0]),prompt=reference(base+'/prompt.txt',origins[0]),color=reference(base+'/master/color.png',origins[1]),height=reference(base+'/master/height.npy',origins[1]);
  const tools={prepare:'tools/texture_sheets/prepare_texture_master.py',finish:'tools/texture_sheets/finish_official_texture.py',derive:'tools/texture_sheets/derive_texture_tiers.py',craft:'tools/craft_normals.py'};
  const master={generationCount:1,generatorPolicy:'One retained generator output; this CLI never calls a generator',canonicalMasterFactor:8,nativeDimensions:[8,8],masterDimensions:[64,64],inputs:{original,generated:raw,prompt},color:{...reference(base+'/master/color.png'),file:'color.png'},height:{...reference(base+'/master/height.npy'),file:'height.npy',dtype:'float32',quantizedTo8Bit:false},tools:Object.fromEntries(Object.entries(tools).map(([k,p])=>[k,reference(p,origins[0])]))};
  bound.push([master.color,base+'/master/color.png'],[master.height,base+'/master/height.npy']);
  const masterRef=json(base+'/master/master.json',master);
  const manifest={schemaVersion:2,family:'quake',defaultTier:'Mid',encodingByRole:Object.fromEntries(Object.keys(data.maps.Mid).map(role=>[role,policy(role)])),inputs:{original,master:color,heightMaster:height},strength:.3,cap:.5,tools:{adapter:reference('tools/texture_sheets/derive_quake_texture_tiers.py',origins[1]),sharedDeriver:reference(tools.derive,origins[1]),normalMath:reference(tools.craft,origins[1])},tiers:{}};
  const row={id,name,nativeIdentity:{id,width:8,height:8,rgbaSha256:data.rgbaSha256,materialFlags:[0]},masterPackage:masterRef.file,masterPackageSha256:'',tierReceipt:base+'/tiers/manifest.json',tierReceiptSha256:'',Low:{original:base+'/native.png',sha256:'',unchanged:true},tiers:{},reviews:{}};
  for(const [tier,factor]of[['Mid',4],['High',8]]){
   manifest.tiers[tier]={factor,dimensions:[8*factor,8*factor],outputs:data.maps[tier]};row.tiers[tier]={factor,dimensions:[8*factor,8*factor],outputs:{}};
   for(const[role,spec]of Object.entries(data.maps[tier])){const p=base+'/tiers/'+spec.file;bound.push([spec,p]);const out=compact?{file:p,sha256:'',lossless:spec.lossless,method:6}:{...spec,file:p};bound.push([out,p]);row.tiers[tier].outputs[role]=out;}
  }
  const receiptRef=json(row.tierReceipt,manifest);const nativeRef=json('docs/quake/textures/fixture/native.json',{verdict:'PASS fixture selected native only'});
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
   proofs.source={verdict:'PASS source/master only',materials:[{name,nativeIdentity:id,sourceMasterOnly:true,verdict:'PASS exact initial source/master replay fixture',masterPackage:masterRef,sourceInputs:[original,raw,prompt]}]};
   proofs.numeric={verdict:'PASS independent actual candidate public checks',materials:[{name,nativeIdentity:id,masterPackage:masterRef,tierReceipt:receiptRef,exactDirectMasterRoleExports:10,losslessExactDataMaps:8,colourQ92Method6:2}]};
   const browser={shaderErrors:[],checks:[{passed:true}],state:'ready',inputs:{},draws:['Mid','High'].map(tier=>({name,tier,normalPackedSha256:data.gpu[tier].packedSHA,framebuffer:data.gpu[tier].dimensions,framebufferRgbaBottomUpSha256:data.gpu[tier].pixelSHA}))};
   for(const tier of Object.values(row.tiers))for(const v of Object.values(tier.outputs))browser.inputs[v.file]={sha256:'',bytes:(await stat(join(root,v.file))).size};
   const browserRef=json('docs/quake/textures/fixture/browser.json',browser);proofs.browser=browser;
   proofs.art={schemaVersion:1,verdict:'PASS independent ART within currentMid/High fixture',name,nativeIdentity:id,masterPackage:masterRef,tierReceipt:receiptRef,candidateBatch:candidateRef,artFindings:Object.fromEntries(['realMaterial','nativeFormsColourScale','repeatGeometry','physicalDepth','glancingBrowser'].map(k=>[k,'PASS synthetic fixture attestation'])),browserCoverage:{receiptSnapshot:browserRef,actualCapturesAndDraws:['Mid','High'].map(t=>reference(data.gpu[t].path)),rawGPUBindings:['Mid','High'].map(t=>Object.assign(reference(data.gpu[t].path),{actualBottomUpRGBApixelSha256:data.gpu[t].pixelSHA}))}};
   const sourceRef=json('docs/quake/textures/fixture/source.json',proofs.source),numericRef=json('docs/quake/textures/fixture/numeric.json',proofs.numeric),artRef=json('docs/quake/textures/fixture/art.json',proofs.art);
   proofs.final={verdict:'PASS within authoring and finite hardware web-material scope',name,nativeIdentity:id,evidence:[sourceRef,numericRef,artRef]};json('docs/quake/textures/fixture/final.json',proofs.final);
  }
  const counts={reviewedNativeIdentities:1,masterPackages:1,enhancedTiers:2,enhancedMaps:10,enhancedTierBindings:2,enhancedMapBindings:10};const catalog={schemaVersion:1,family:'quake',pathsBase:'repository',defaultTier:'Mid',standard:{encodingByRole:manifest.encodingByRole},materials:[row],counts};
  const save=async()=>{
   for(const[p,value]of jsonFiles){await refresh();row.masterPackageSha256=masterRef.sha256;row.tierReceiptSha256=receiptRef.sha256;row.Low.sha256=original.sha256;candidate.items[0].masterPackageSha256=masterRef.sha256;candidate.items[0].tierReceiptSha256=receiptRef.sha256;if(proofs.browser)for(const tier of Object.values(row.tiers))for(const v of Object.values(tier.outputs))proofs.browser.inputs[v.file].sha256=v.sha256;await put(p,JSON.stringify(value));}
   await refresh();row.masterPackageSha256=masterRef.sha256;row.tierReceiptSha256=receiptRef.sha256;row.Low.sha256=original.sha256;
   row.reviews=Object.fromEntries(jsonFiles.filter(([p])=>/\/(?:numeric|preview|art|source|final)\.json$/.test(p)).map(([p])=>[p,shaBuffer(p)]));
   await put(QCAT,JSON.stringify(catalog));await put('docs/quake/textures/progress.json',JSON.stringify({qualified8xMaterials:1,qualifiedMasterPackages:1,qualifiedPhysicalMaps:10,authoringQualified:{materials:1,enhancedTiers:2,physicalMaps:10}}));
  };
  // Synchronous hash only after the explicitly ordered JSON graph is written.
  const shaBuffer=p=>sha(readFileSync(join(root,p)));
  await put('baseline.json','{"materials":[]}');await save();
  const cli=resolve('tools/texture_sheets/check_texture_catalog_custody.py');
  const run=(extra=[])=>JSON.parse(execFileSync('/usr/bin/python3',[cli,'--family','quake','--baseline','baseline.json','--source-root','/checkpoint/clone',...origins.flatMap(p=>['--reference-root',p]),...extra],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  await fn({root,env,base,row,master,manifest,catalog,proofs,origins,put,save,run});
 }finally{await rm(root,{recursive:true,force:true});}
}

test('real compact Quake collective custody relocates both origins and never substitutes live bytes',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().counts.enhancedMaps,10);
 // Correct snapshot, wrong live originals: no required byte may come from these.
 await f.put('live-main/'+f.base+'/native.png','wrong live native');await f.put('live-fc24/'+f.base+'/master/color.png','wrong live RGB');assert.equal(f.run().verdict,'PASS snapshot catalog custody');
 // Correct live original cannot rescue a changed staged/snapshot asset.
 const original=await readFile(join(f.root,f.base,'native.png'));await f.put('live-main/'+f.base+'/native.png',original);await f.put(f.base+'/native.png','wrong snapshot');assert.throws(f.run,/hash mismatch/);
}),{compact:true});
test('current single-material ART/both-tier framebuffer proof is accepted, generic PASS or held member is not',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().changedRegistrations.length,1);
 f.proofs.art.artFindings.repeatGeometry='HOLD actual seam';await f.save();assert.throws(f.run,/ART is not accepted/);
 f.proofs.art.artFindings.repeatGeometry='PASS fixture';f.proofs.browser.checks[0].passed=false;await f.save();assert.throws(f.run,/Browser proof not ready/);
 f.proofs.browser.checks[0].passed=true;f.proofs.art.verdict='PASS generic filename art-review';await f.save();assert.throws(f.run,/ART is not accepted/);
}),{shape:'single'});
test('collective top-level PASS cannot accept the held or wrong native member',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().verdict,'PASS snapshot catalog custody');f.proofs.art.items[0].verdict='HOLD';await f.save();assert.throws(f.run,/ART is not accepted/);
 f.proofs.art.items[0].verdict='PASS_AFFECTED_OFFLINE_ART_BOTH_TIERS';f.proofs.art.items[0].nativeId='d'.repeat(64);await f.save();assert.throws(f.run,/lacks typed/);
}));
test('actual RIFF catches lossy data disguised as lossless even with new seals and exact flat pixels',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().counts.enhancedMaps,10);const p=join(f.root,f.base,'tiers/mid-height.webp');
 execFileSync('/usr/bin/python3',['-c',"from PIL import Image;import sys;p=sys.argv[1];i=Image.open(p).convert('L');i.save(p,'WEBP',quality=92,lossless=False,method=6)",p],{env:f.env});await f.save();assert.throws(f.run,/Actual WebP codec differs/);
}));
test('Quake rejects altered policy, source-composed schema, wrong role paths, counts and removed IDs',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().verdict,'PASS snapshot catalog custody');f.manifest.encodingByRole.height.lossless=false;await f.save();assert.throws(f.run,/Wrong Quake/);
 f.manifest.encodingByRole.height.lossless=true;f.master.inputs.sourceComposition={file:'docs/quake/textures/fixture/art.json',sha256:'0'.repeat(64)};await f.save();assert.throws(f.run,/hash mismatch|composed-source/);
 delete f.master.inputs.sourceComposition;f.catalog.counts.enhancedMaps=9;await f.save();assert.throws(f.run,/counts differ/);
 f.catalog.counts.enhancedMaps=10;await f.save();await f.put('baseline.json',JSON.stringify({materials:[{id:'d'.repeat(64)}]}));assert.throws(f.run,/identities removed/);
}));
test('required external input and reference-root overlap fail; historical external witness is not read',()=>quakeCatalogFixture(async f=>{
 assert.equal(f.run().verdict,'PASS snapshot catalog custody');assert.throws(()=>f.run(['--reference-root',f.origins[0]]),/Overlapping/);
 f.master.inputs.original.file='/unavailable/provider/native.png';await f.save();assert.throws(f.run,/Required input is external/);
}));
