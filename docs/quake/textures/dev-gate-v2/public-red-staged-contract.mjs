import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat,symlink,readdir,readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {snapshotIndex,withoutGitEnvironment,stagedChanges,qualifyTextureScope,gateCommands,precommit,publishTextureCheckpoint,TEXTURE_TESTS} from '../tools/distribution/precommit.mjs';
import {createHash} from 'node:crypto';
import * as gate from '../tools/distribution/precommit.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const CATALOG='assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json';
const QCAT='assets/authoring/texture_sheets/sources/quake-world-2026-10-20/catalog.json';
async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'quaked-gate-test-')),env=withoutGitEnvironment();
 // Test default scope unless a case opts in; isolate the enclosing gate's mode.
 delete env.QUAKED_CHECKPOINT_MODE;
 const git=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8'}).trimEnd();
 const put=async(path,value)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),value);};
 try{
  git('init','-q','-b','Dev');git('config','user.name','Public fixture');git('config','user.email','fixture@example.invalid');
  await put(CATALOG,JSON.stringify({materials:[]}));await put('docs/hexen2/textures/note.md','base');
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
}),{quakeBaseline:false});
test('first introduction authorization binds actual base, staged addition and catalog SHA; no generic missing fallback',()=>{
 assert.equal(typeof gate.authorizeInitialQuakeCatalog,'function');const base='a'.repeat(40),anchor=gate.QUAKE_CATALOG_ANCHOR,bytes=Buffer.from(JSON.stringify({family:'quake',materials:[]}));
 const observed={base,anchor,catalog:QCAT,baseCatalogAbsent:true,nonShallow:true,completeHistory:true,historyCommits:[],reachableCommitCount:2};const bootstrap={baseCommit:base,reviewedBy:'Independent fixture',initialQuakeCatalog:{path:QCAT,stagedSha256:sha(bytes),anchorCommit:anchor,authority:'First introduction after complete never-present history'}};const changes=[{path:QCAT,status:'A'}];
 assert.equal(gate.authorizeInitialQuakeCatalog(observed,bootstrap,changes,bytes).stagedSha256,sha(bytes));
 for(const delta of [{baseCatalogAbsent:false},{nonShallow:false},{completeHistory:false},{historyCommits:['b'.repeat(40)]}])assert.throws(()=>gate.authorizeInitialQuakeCatalog({...observed,...delta},bootstrap,changes,bytes));
 for(const delta of [{baseCommit:'b'.repeat(40)},{initialQuakeCatalog:undefined},{initialQuakeCatalog:{...bootstrap.initialQuakeCatalog,stagedSha256:'0'.repeat(64)}},{initialQuakeCatalog:{...bootstrap.initialQuakeCatalog,authority:''}}])assert.throws(()=>gate.authorizeInitialQuakeCatalog(observed,{...bootstrap,...delta},changes,bytes));
 assert.throws(()=>gate.authorizeInitialQuakeCatalog(observed,bootstrap,[],bytes));assert.throws(()=>gate.authorizeInitialQuakeCatalog(observed,bootstrap,[{path:QCAT,status:'M'}],bytes));assert.throws(()=>gate.authorizeInitialQuakeCatalog(observed,bootstrap,changes,Buffer.from('{bad')));
});
