/** Build exactly the index in an isolated directory. Never stash, stage, restore,
 * or inspect the user's unstaged asset bytes. Failed snapshots remain for diagnosis.
 */
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm,lstat} from 'node:fs/promises';
import {tmpdir,homedir,platform} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const run=(file,args,cwd,env=process.env)=>execFileSync(file,args,{cwd,env,stdio:'inherit'});
export async function snapshotIndex(root,target){
 const tree=execFileSync('git',['write-tree'],{cwd:root,encoding:'utf8'}).trim();
 await mkdir(target,{recursive:true});
 execFileSync('git',['checkout-index','--all','--prefix='+target+'/'],{cwd:root,stdio:'inherit'});
 return tree;
}
export async function precommit(root=process.cwd()){
 const snapshot=await mkdtemp(join(tmpdir(),'quaked-staged-'));
 const tree=await snapshotIndex(root,snapshot);
 const env={...process.env,QUAKED_SOURCE_TREE:tree};
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
