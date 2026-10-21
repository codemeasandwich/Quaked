/** Verify a pinned staged tree, never unstaged assets. Native gates are explicit. */
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm,lstat,cp,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir,homedir,platform} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const git=(root,args,env=process.env)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8'}).trimEnd();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const withoutGitEnvironment=(env=process.env)=>Object.fromEntries(Object.entries(env).filter(([key])=>!key.startsWith('GIT_')));
export function assertCommitBranch(root,env=process.env){
 const branch=git(root,['branch','--show-current'],env);
 if(branch==='Prod')throw Error('Direct commits to Prod are forbidden. Select a qualified Dev commit through the release promotion controller.');
 return branch;
}
export const TEXTURE_TESTS=['prepare_texture_master_test.py','hexen2_texture_tiers_test.py','texture_batch_review_test.py','texture_boundary_registration_test.py','texture_layered_master_test.py','texture_layered_boundary_test.py','texture_motif_master_test.py','texture_rounded_cap_master_test.py'];
const TEXTURE_TOOLS=new Set(['tools/craft_normals.py',...['prepare_texture_master.py','finish_official_texture.py','derive_texture_tiers.py','build_texture_batch_review.py','register_texture_boundary.py','prepare_layered_texture_master.py','update_level_sheets.py','register_layered_texture_boundary.py','prepare_motif_texture_master.py','prepare_rounded_cap_texture_master.py'].map(p=>'tools/texture_sheets/'+p)]);
const CONTROLS=new Set(['tools/distribution/precommit.mjs','tests/staged_contract_test.mjs','tools/texture_sheets/check_texture_catalog_custody.py']);
export function texturePath(path){
 return path.startsWith('assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/')||path.startsWith('docs/hexen2/textures/')||path.startsWith('docs/evidence/hexen2-textures-')||path.startsWith('skills/quaked-texture-authoring/')||path==='docs/texture-tier-standard.md'||TEXTURE_TOOLS.has(path)||TEXTURE_TESTS.some(p=>path==='tests/'+p);
}
export function stagedChanges(root,base,tree,env=process.env){
 // No rename detection: both the removed and added endpoint must be admitted.
 const fields=git(root,['diff','--raw','-z','--no-renames',base,tree,'--'],env).split('\0');
 const changes=[];
 for(let i=0;i<fields.length&&fields[i];i+=2){
  const header=/^:(\d{6}) (\d{6}) [a-f0-9]+ [a-f0-9]+ ([AMD])$/.exec(fields[i]);
  if(!header||!fields[i+1])throw Error('Unsupported staged change');
  const [,oldMode,newMode,status]=header;
  if(![oldMode,newMode].every(mode=>['000000','100644','100755'].includes(mode)))throw Error('Symlink/submodule staged change rejected: '+fields[i+1]);
  changes.push({path:fields[i+1],status});
 }
 return changes;
}
export async function qualifyTextureScope(root,base,tree,changes,bootstrapPath,env=process.env){
 if(!changes.length)throw Error('Empty checkpoint scope');
 const controls=changes.filter(row=>CONTROLS.has(row.path));
 const unknown=changes.filter(row=>!CONTROLS.has(row.path)&&!texturePath(row.path));
 if(unknown.length)throw Error('Not a texture-only Dev checkpoint; isolate or separately authorize verification: '+unknown.map(row=>row.path).join(', '));
 if(!controls.length){if(bootstrapPath)throw Error('Bootstrap receipt supplied without changed controls');return null;}
 if(!bootstrapPath)throw Error('Changed gate controls require an explicit independent reviewed bootstrap receipt');
 const bytes=await readFile(bootstrapPath),receipt=JSON.parse(bytes);
 if(receipt.schemaVersion!==1||receipt.baseCommit!==base||typeof receipt.reviewedBy!=='string'||!receipt.reviewedBy.trim()||typeof receipt.authority!=='string'||!receipt.authority.trim()||!receipt.controls||Array.isArray(receipt.controls)||Object.keys(receipt.controls).sort().join('\0')!==controls.map(row=>row.path).sort().join('\0'))throw Error('Bootstrap receipt does not bind this base and exact changed controls');
 for(const row of controls){
  if(row.status==='D')throw Error('Bootstrap cannot delete gate controls');
  const bytes=execFileSync('git',['show',tree+':'+row.path],{cwd:root,env});
  if(sha(bytes)!==receipt.controls[row.path])throw Error('Bootstrap control bytes differ: '+row.path);
 }
 return {file:resolve(bootstrapPath),sha256:sha(bytes),reviewedBy:receipt.reviewedBy,authority:receipt.authority,controls:receipt.controls};
}
export async function snapshotIndex(root,target,env=process.env,pinnedTree,temporaryRoot=tmpdir()){
 const tree=pinnedTree??git(root,['write-tree'],env);
 const privateIndex=await mkdtemp(join(temporaryRoot,'quaked-export-index-'));
 try{
  const exportEnv={...env,GIT_INDEX_FILE:join(privateIndex,'index')};
  execFileSync('git',['read-tree',tree],{cwd:root,env:exportEnv});
  await mkdir(target,{recursive:true});
  execFileSync('git',['checkout-index','--all','--prefix='+target+'/'],{cwd:root,env:exportEnv,stdio:'inherit'});
 }finally{await rm(privateIndex,{recursive:true,force:true});}
 return tree;
}
export function gateCommands(mode,host=platform(),python='/usr/bin/python3',sourceRoot=process.cwd()){
 const npm=process.platform==='win32'?'npm.cmd':'npm';
 const common=[[npm,['ci','--ignore-scripts']],[npm,['run','test:distribution']],[npm,['run','build:web']]];
 if(mode==='dev-texture')return [...TEXTURE_TESTS.map(p=>[python,['tests/'+p]]),[python,['tools/texture_sheets/check_texture_catalog_custody.py','--baseline','.texture-gate-baseline.json','--source-root',resolve(sourceRoot)]],...common,['node',['tools/distribution/verify-site.mjs','dist/web']]];
 if(mode!=='full')throw Error('Unknown checkpoint mode');
 return [...common,...(host==='darwin'?[[npm,['run','build:desktop']],['cargo',['test','--locked','--manifest-path','src-tauri/Cargo.toml']],['cargo',['build','--locked','--manifest-path','src-tauri/Cargo.toml','--example','lan_test_bridge']],['node',['tools/distribution/engine-tests.mjs']],[npm,['run','tauri','--','build','--target','universal-apple-darwin','--','--locked']]]:[])];
}
async function realOutputDirectory(path){
 try{await mkdir(path);}catch(error){if(error.code!=='EEXIST')throw error;}
 const info=await lstat(path);
 if(info.isSymbolicLink()||!info.isDirectory())throw Error('Refusing redirected output parent '+path);
}
export async function publishTextureCheckpoint(root,snapshot,tree){
 if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(tree))throw Error('Invalid checkpoint tree');
 const dist=resolve(root,'dist'),parent=join(dist,'texture-checkpoints'),dest=join(parent,tree);
 await realOutputDirectory(dist);await realOutputDirectory(parent);
 // Exclusive reservation: existing files, directories and symlinks are never
 // reused. Copy only our web output and publish the receipt last. A failed copy
 // retains a partial owned directory for diagnosis; it is never called PASS.
 await mkdir(dest);
 await cp(join(snapshot,'dist/web'),join(dest,'web'),{recursive:true,force:false,errorOnExist:true,mode:constants.COPYFILE_EXCL});
 await copyFile(join(snapshot,'dist/staged-receipt.json'),join(dest,'staged-receipt.json'),constants.COPYFILE_EXCL);
 return dest;
}
export async function precommit(root=process.cwd(),options={}){
 const hookEnv=options.env??process.env,branch=assertCommitBranch(root,hookEnv);
 const mode=options.mode??hookEnv.QUAKED_CHECKPOINT_MODE??'dev-texture';
 if(mode==='dev-texture'&&branch!=='Dev')throw Error('Texture checkpoint requires Dev; other scopes require an explicitly authorized full mode');
 if(!['dev-texture','full'].includes(mode))throw Error('Unknown checkpoint mode');
 if(git(root,['ls-files','--unmerged'],hookEnv))throw Error('Unmerged index cannot qualify');
 const base=git(root,['rev-parse','HEAD'],hookEnv),tree=git(root,['write-tree'],hookEnv);
 const changes=stagedChanges(root,base,tree,hookEnv);
 const bootstrap=mode==='dev-texture'?await qualifyTextureScope(root,base,tree,changes,options.bootstrapPath??hookEnv.QUAKED_TEXTURE_GATE_BOOTSTRAP,hookEnv):null;
 // The hook starts outside its snapshot. Unstaged controlling code must not
 // choose commands for a different reviewed staged implementation.
 if(!options.run&&sha(await readFile(fileURLToPath(import.meta.url)))!==sha(execFileSync('git',['show',tree+':tools/distribution/precommit.mjs'],{cwd:root,env:hookEnv})))throw Error('Executing checkpoint control differs from staged bytes');
 const env={...withoutGitEnvironment(hookEnv),QUAKED_SOURCE_TREE:tree,PYTHONDONTWRITEBYTECODE:'1'};
 // Gate children must not inherit tool-selecting test overrides from the caller.
 if(mode==='dev-texture')for(const key of Object.keys(env))if(key.startsWith('QUAKED_')&&key!=='QUAKED_SOURCE_TREE')delete env[key];
 env.QUAKED_WEB_IMAGE_CACHE=resolve(root,'.distribution-cache/web-images');
 if(platform()==='darwin'&&mode==='full')env.CARGO_TARGET_DIR=env.CARGO_TARGET_DIR??join(homedir(),'build','quaked-distribution');
 if(mode==='full')env.QUAKED_LAN_TEST_BRIDGE=join(env.CARGO_TARGET_DIR??'', 'debug/examples/lan_test_bridge');
 const outcomes=[];let snapshot,checksStarted=false;
 try{
  snapshot=await mkdtemp(join(options.temporaryRoot??tmpdir(),'quaked-staged-'));
  await snapshotIndex(root,snapshot,hookEnv,tree,options.temporaryRoot??tmpdir());
  if(mode==='dev-texture')await writeFile(join(snapshot,'.texture-gate-baseline.json'),execFileSync('git',['show',base+':assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json'],{cwd:root,env:hookEnv}));
  const run=options.run??((file,args,cwd,env)=>execFileSync(file,args,{cwd,env,stdio:'inherit'}));
  checksStarted=true;
  for(const [file,args] of gateCommands(mode,options.platform??platform(),options.python??'/usr/bin/python3',root)){
   await run(file,args,snapshot,env);outcomes.push({command:[file,...args],exitCode:0});
  }
  if(git(root,['rev-parse','HEAD'],hookEnv)!==base||git(root,['write-tree'],hookEnv)!==tree)throw Error('HEAD or index changed during checkpoint; do not commit this receipt');
  const html=await readFile(join(snapshot,'dist/web/index.html'));
  let dest=mode==='dev-texture'?resolve(root,'dist/texture-checkpoints',tree):resolve(root,'dist/staged');
  await writeFile(join(snapshot,'dist','staged-receipt.json'),JSON.stringify({base,tree,scope:mode,output:dest,platform:options.platform??platform(),node:process.version,commands:outcomes,bootstrap,htmlSha256:sha(html),macBuilt:mode==='full'&&(options.platform??platform())==='darwin',qualification:mode==='dev-texture'?'Texture and HTML only; native/release/remote CI not qualified':'Full local gate; release and remote CI separate'},null,2));
  if(mode==='dev-texture')dest=await publishTextureCheckpoint(root,snapshot,tree);
  else{
   for(const path of [resolve(root,'dist'),dest])if((await lstat(path).catch(()=>null))?.isSymbolicLink())throw Error('Refusing symlink output '+path);
   await mkdir(resolve(root,'dist'),{recursive:true});await rm(dest,{recursive:true,force:true});
   await rename(join(snapshot,'dist'),dest);
  }
  await rm(snapshot,{recursive:true,force:true});
  console.log('Staged '+mode+' checks passed. Receipt: '+join(dest,'staged-receipt.json'));
 }catch(error){
  if(snapshot&&!checksStarted){await rm(snapshot,{recursive:true,force:true});console.error('Commit blocked during setup; owned temporary snapshot removed');}
  else if(snapshot)console.error('Commit blocked. Failed staged snapshot retained at '+snapshot);
  throw error;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await precommit();
