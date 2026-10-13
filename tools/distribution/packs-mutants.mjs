// Mutation check for tests/packs_contract_test.mjs (docs/per-game-packs-design-2026-10-13.md):
// each mutant misfiles assets a game requests at run time; the contract test must fail on every
// one. Mutants run on a copy of the classifier in a temporary tree (the repository is untouched).
//
//   node tools/distribution/packs-mutants.mjs
import {mkdtemp,mkdir,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const repo=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const misfile=(test,pack)=>[/return path=>\{/,`return path=>{if(${test})return '${pack}';`];
const MUTANTS={
 'prepared rows ignore BSP identity':[/const byBsp=sha=>\[[^;]*\];/,'const byBsp=sha=>[];'],
 'shareware textures go to quake':[/flatMap\(name=>games\.textures\[name\]\?\?\[\]\)/,"flatMap(name=>(games.textures[name]??[]).map(g=>g==='shareware'?'quake':g))"],
 'skins never bind to the shareware':[/Object\.keys\(owners\)\.filter/,"Object.keys(owners).filter(g=>g!=='shareware').filter"],
 'the shareware namespace is the full game':[/shareware:'shareware',newer:'shareware'/,"shareware:'quake',newer:'quake'"],
 'glass goes to a sibling':misfile("path.startsWith('newer/textures/glass/')",'rogue'),
 'native heights go to a sibling':misfile("path.startsWith('newer/enemies/heights/')",'rogue'),
 'hub rock relief goes to the full game':misfile("path.startsWith('newer/rockfield/newer/')",'quake'),
 'skin normals go to the full game':misfile("/^newer\\/normals\\//.test(path)&&owner.has(path)&&[...owner.get(path)].every(g=>g==='shareware'||g==='quake')",'quake'),
};
const source=await readFile(join(repo,'tools/distribution/packs.mjs'),'utf8');
const dir=await mkdtemp(join(tmpdir(),'quaked-packs-mutants-'));let survived=0;
try{
 await mkdir(join(dir,'tools/distribution'),{recursive:true});await mkdir(join(dir,'tests'));
 for(const name of ['src','newer','node_modules'])await symlink(join(repo,name),join(dir,name));
 await symlink(join(repo,'tools/distribution/build_game_index.mjs'),join(dir,'tools/distribution/build_game_index.mjs'));
 await symlink(join(repo,'tools/pak_members.mjs'),join(dir,'tools/pak_members.mjs'));
 await writeFile(join(dir,'tests/packs_contract_test.mjs'),await readFile(join(repo,'tests/packs_contract_test.mjs')));
 const run=()=>spawnSync(process.execPath,['--test','tests/packs_contract_test.mjs'],{cwd:dir,encoding:'utf8'}).status;
 await writeFile(join(dir,'tools/distribution/packs.mjs'),source);
 if(run()!==0)throw Error('The contract test fails on the unmutated classifier');
 for(const [name,[pattern,replacement]] of Object.entries(MUTANTS)){
  const mutated=source.replace(pattern,replacement);
  if(mutated===source)throw Error('Mutant no longer applies: '+name);
  await writeFile(join(dir,'tools/distribution/packs.mjs'),mutated);
  const killed=run()!==0;if(!killed)survived++;
  console.log(`${killed?'killed  ':'SURVIVED'} ${name}`);
 }
}finally{await rm(dir,{recursive:true,force:true});}
if(survived)process.exitCode=1;
