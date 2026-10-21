import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {precommit,withoutGitEnvironment} from '../../../../../tools/distribution/precommit.mjs';
const HCAT='assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json';
const QCAT='assets/authoring/texture_sheets/sources/quake-world-2026-10-20/catalog.json';
// All Git objects, refs, index entries and files below belong to this isolated
// disposable fixture. An injected runner throws before any child command runs.
test('replacement catalog cannot bypass real base absence/history/initial-authority guards',async t=>{
 let failedSnapshot;
 const root=await mkdtemp(join(tmpdir(),'quaked-independent-replace-')),env=withoutGitEnvironment();
 delete env.QUAKED_CHECKPOINT_MODE;delete env.QUAKED_TEXTURE_GATE_BOOTSTRAP;
 const git=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trimEnd();
 const put=async(p,b)=>{await mkdir(join(root,p,'..'),{recursive:true});await writeFile(join(root,p),b);};
 try{
  git('init','-q','-b','Dev');git('config','user.name','Independent fixture');git('config','user.email','fixture@example.invalid');git('config','commit.gpgsign','false');
  await put(HCAT,JSON.stringify({materials:[]}));await put('docs/quake/textures/note.json','base');git('add','.');
  git('-c','core.hooksPath=/dev/null','commit','-qm','fixture real base absent Quake');const base=git('rev-parse','HEAD');
  await put(QCAT,JSON.stringify({schemaVersion:1,family:'quake',materials:[]}));git('add',QCAT);
  const replacementTree=git('write-tree');const replacement=execFileSync('git',['commit-tree',replacementTree],{cwd:root,env,encoding:'utf8',input:'fixture replacement tree has catalog\n'}).trim();
  await put('docs/quake/textures/note.json','next');git('add','docs/quake/textures/note.json');
  let calls=0,unreplacedError,replacedError;
  const run=(file,args,cwd)=>{failedSnapshot=cwd;calls++;throw Error('fixture stops first child; no real check or build executed');};
  try{await precommit(root,{env,run});}catch(error){unreplacedError=error.message;}
  assert.equal(calls,0);assert.ok(unreplacedError); // fixed real anchor does not exist in this synthetic history
  git('replace',base,replacement);
  try{await precommit(root,{env,run});}catch(error){replacedError=error.message;}
  t.diagnostic(JSON.stringify({realBase:base,replacement,unreplacedError,replacedError,childRunnerCalls:calls,scope:'fixture only; no real child command executed'}));
  assert.equal(calls,0,'A replacement tree must not turn absent real catalog into inherited baseline or start children');
 }finally{if(failedSnapshot)await rm(failedSnapshot,{recursive:true,force:true});await rm(root,{recursive:true,force:true});}
});
