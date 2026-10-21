import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {precommit,withoutGitEnvironment,gateCommands,texturePath} from '../../../../../tools/distribution/precommit.mjs';
const HCAT='assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json';
const QCAT='assets/authoring/texture_sheets/sources/quake-world-2026-10-20/catalog.json';
async function fixture(fn){
 let failedSnapshot;const root=await mkdtemp(join(tmpdir(),'quaked-independent-graft-')),env=withoutGitEnvironment();delete env.QUAKED_CHECKPOINT_MODE;delete env.QUAKED_TEXTURE_GATE_BOOTSTRAP;
 const git=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trimEnd();
 const put=async(p,b)=>{await mkdir(join(root,p,'..'),{recursive:true});await writeFile(join(root,p),b);};
 try{
 git('init','-q','-b','Dev');git('config','user.name','Independent fixture');git('config','user.email','fixture@example.invalid');git('config','commit.gpgsign','false');
 await put(HCAT,'{"materials":[]}');await put(QCAT,'{"materials":[]}');await put('docs/quake/textures/note.json','base');git('add','.');git('-c','core.hooksPath=/dev/null','commit','-qm','isolated existing baseline');
 await put('docs/quake/textures/note.json','next');git('add','docs/quake/textures/note.json');let calls=0;
 const run=(file,args,cwd)=>{failedSnapshot=cwd;calls++;throw Error('fixture stops first child');};
 await fn({root,env,git,put,run,calls:()=>calls});
 }finally{if(failedSnapshot)await rm(failedSnapshot,{recursive:true,force:true});await rm(root,{recursive:true,force:true});}
}
test('existing baseline cannot bypass empty shortened-history environment overrides',()=>fixture(async f=>{
 for(const key of ['GIT_SHALLOW_FILE','GIT_GRAFT_FILE']){await assert.rejects(precommit(f.root,{env:{...f.env,[key]:''},run:f.run}),/override/);assert.equal(f.calls(),0);}
}));
test('existing baseline cannot bypass nonempty graft or redirected empty graft file',()=>fixture(async f=>{
 const path=join(f.root,'.git/info/grafts');await writeFile(path,f.git('rev-parse','HEAD')+'\n');await assert.rejects(precommit(f.root,{env:f.env,run:f.run}),/Grafted/);assert.equal(f.calls(),0);
 await rm(path);await f.put('empty-graft','');await symlink(join(f.root,'empty-graft'),path);await assert.rejects(precommit(f.root,{env:f.env,run:f.run}),/Grafted/);assert.equal(f.calls(),0);
}));
test('combined Dev command list preserves literal eight inherited plus three Quake suites and exact rounded-cap scope',()=>{
 const commands=gateCommands('dev-texture','darwin');assert.deepEqual(commands.filter(([,a])=>a[0]?.startsWith('tests/')&&a[0].endsWith('.py')).map(([,a])=>a[0]),['prepare_texture_master_test.py','hexen2_texture_tiers_test.py','texture_batch_review_test.py','texture_boundary_registration_test.py','texture_layered_master_test.py','texture_layered_boundary_test.py','texture_motif_master_test.py','texture_rounded_cap_master_test.py','quake_texture_tiers_test.py','quake_texture_batch_review_test.py','texture_boundary_x_registration_test.py'].map(v=>'tests/'+v));
 for(const p of ['tools/texture_sheets/prepare_rounded_cap_texture_master.py','tests/texture_rounded_cap_master_test.py'])assert.equal(texturePath(p),true);
 for(const p of ['tools/texture_sheets/other_rounded_cap.py','tests/texture_rounded_cap_extra_test.py','docs/texture-tier-standard-extra.md','src/native.js'])assert.equal(texturePath(p),false);
 assert.equal(commands.filter(([,a])=>a[0]==='tools/texture_sheets/check_texture_catalog_custody.py').length,2);assert.ok(!commands.some(([p,a])=>p==='cargo'||a.some(v=>/build:desktop|tauri|review_set|engine-tests/.test(v))));
});
