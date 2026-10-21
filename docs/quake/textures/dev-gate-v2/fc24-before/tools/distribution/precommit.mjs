/** Build exactly the index in an isolated directory. Never stash, stage, restore,
 * or inspect the user's unstaged asset bytes. Failed snapshots remain for diagnosis.
 */
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm,lstat} from 'node:fs/promises';
import {tmpdir,homedir,platform} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const run=(file,args,cwd,env=process.env)=>execFileSync(file,args,{cwd,env,stdio:'inherit'});
// Git exports GIT_DIR, GIT_INDEX_FILE and others to hooks; from a linked worktree GIT_DIR
// is absolute. Builds and tests in the snapshot must never inherit them: a nested
// `git init` would otherwise re-initialise the real repository (it set core.bare=true
// on 12 October 2026). Only snapshotIndex reads the commit's index through them.
export const withoutGitEnvironment=(env=process.env)=>Object.fromEntries(Object.entries(env).filter(([key])=>!key.startsWith('GIT_')));
export function assertCommitBranch(root,env=process.env){
 const branch=execFileSync('git',['branch','--show-current'],{cwd:root,env,encoding:'utf8'}).trim();
 if(branch==='Prod')throw Error('Direct commits to Prod are forbidden. Select a qualified Dev commit through the release promotion controller.');
}
export async function snapshotIndex(root,target,env=process.env){
 const tree=execFileSync('git',['write-tree'],{cwd:root,env,encoding:'utf8'}).trim();
 await mkdir(target,{recursive:true});
 execFileSync('git',['checkout-index','--all','--prefix='+target+'/'],{cwd:root,env,stdio:'inherit'});
 return tree;
}
export async function precommit(root=process.cwd()){
 assertCommitBranch(root);
 const snapshot=await mkdtemp(join(tmpdir(),'quaked-staged-'));
 const tree=await snapshotIndex(root,snapshot);
 // The snapshot reuses the repository's encoded web images (keyed by source and encoder).
 const env={...withoutGitEnvironment(),QUAKED_SOURCE_TREE:tree,QUAKED_WEB_IMAGE_CACHE:resolve(root,'.distribution-cache/web-images')};
 if(platform()==='darwin')env.CARGO_TARGET_DIR=env.CARGO_TARGET_DIR??join(homedir(),'build','quaked-distribution');
 try {
  run(process.platform==='win32'?'npm.cmd':'npm',['ci','--ignore-scripts'],snapshot,env);
  run(process.platform==='win32'?'npm.cmd':'npm',['run','test:distribution'],snapshot,env);
  run(process.platform==='win32'?'npm.cmd':'npm',['run','build:web'],snapshot,env);
  if(platform()==='darwin'){
   run('npm',['run','build:desktop'],snapshot,env);
   run('cargo',['test','--locked','--manifest-path','src-tauri/Cargo.toml'],snapshot,env);
   run('cargo',['build','--locked','--manifest-path','src-tauri/Cargo.toml','--example','lan_test_bridge'],snapshot,env);
   env.QUAKED_LAN_TEST_BRIDGE=join(env.CARGO_TARGET_DIR,'debug/examples/lan_test_bridge');
   run('node',['tools/distribution/engine-tests.mjs'],snapshot,env);
   run('npm',['run','tauri','--','build','--target','universal-apple-darwin','--','--locked'],snapshot,env);
  }else console.log('HTML verified locally. The required Mac build is verified on the GitHub macOS runner.');
  await writeFile(join(snapshot,'dist','staged-receipt.json'),JSON.stringify({tree,platform:platform(),node:process.version,macBuilt:platform()==='darwin'},null,2));
  const dest=resolve(root,'dist/staged');
  for(const path of [resolve(root,'dist'),dest])if((await lstat(path).catch(()=>null))?.isSymbolicLink())throw Error('Refusing symlink output '+path);
  await mkdir(resolve(root,'dist'),{recursive:true});await rm(dest,{recursive:true,force:true});
  await rename(join(snapshot,'dist'),dest);await rm(snapshot,{recursive:true,force:true});
  console.log('Staged builds passed. Receipt: '+join(dest,'staged-receipt.json'));
 }catch(error){console.error('Commit blocked. Failed staged snapshot retained at '+snapshot);throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await precommit();
