import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {snapshotIndex} from '../tools/distribution/precommit.mjs';
test('staged snapshot includes only index bytes and deletions, preserving working files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'quaked-index-test-'));const snapshot=await mkdtemp(join(tmpdir(),'quaked-index-output-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
 try{
  git('init','-q');await writeFile(join(root,'kept.txt'),'staged');await writeFile(join(root,'deleted.txt'),'old');git('add','.');
  git('rm','--cached','deleted.txt');await writeFile(join(root,'kept.txt'),'unstaged');await writeFile(join(root,'untracked.txt'),'private');
  const before=git('ls-files','--stage');const tree=await snapshotIndex(root,snapshot);
  assert.match(tree,/^[a-f0-9]{40,64}$/);assert.equal(await readFile(join(snapshot,'kept.txt'),'utf8'),'staged');
  await assert.rejects(stat(join(snapshot,'deleted.txt')),{code:'ENOENT'});await assert.rejects(stat(join(snapshot,'untracked.txt')),{code:'ENOENT'});
  assert.equal(await readFile(join(root,'kept.txt'),'utf8'),'unstaged');assert.equal(await readFile(join(root,'deleted.txt'),'utf8'),'old');assert.equal(git('ls-files','--stage'),before);
 }finally{await rm(root,{recursive:true,force:true});await rm(snapshot,{recursive:true,force:true});}
});
