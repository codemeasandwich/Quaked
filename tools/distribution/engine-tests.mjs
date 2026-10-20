/** Run the maintained engine checks with a disposable external game root. */
import {mkdtemp,mkdir,copyFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {assetPath} from './manifest.mjs';
const root=process.cwd(),fixture=await mkdtemp(join(tmpdir(),'quaked-engine-contract-'));
try{
 await mkdir(join(fixture,'shareware'));await copyFile(assetPath(root,'games/shareware/pak0.pak'),join(fixture,'shareware/pak0.pak'));
 const env={...process.env,QUAKED_THREE_MODULE:resolve('node_modules/three/build/three.module.js'),QUAKED_GAME_ROOT:fixture,QUAKED_SHAREWARE_PAK:join(fixture,'shareware/pak0.pak')};
 const suites=['game_catalogue','game_selection','desktop_prepare','game_shelf','local_play','net_window','window_play_native','serve_py','fog','skybox','options_order','blast_shake','newer_menu_scroll','addon_effects_guard','shambler_steps','hooks','drips','electric_native','electric_spatial','milkyway_sky','texture_q92_channels','in_web','in_web_capture','in_web_lifecycle','dof','footsteps','material_impacts','water_audio','native_sound_replacement','environment_sounds','player_events_audio','face_demo_water','face_water_entry','ambient_sounds','sound_channel_steal'];
 // Owned mission-pack proof is opt-in: CI cannot redistribute those originals.
 // When supplied, run the actual native Lava Man skin/heat contracts in this exact snapshot.
 if(env.QUAKED_OWNED_PAK&&env.QUAKED_ID1_PAK)suites.push('lavaman_effects','lavaman_effects_audit','lavaman_heat');
 if(env.QUAKED_LAN_TEST_BRIDGE)suites.push('lan_gameplay');
 const result=spawnSync(process.execPath,['tools/run_tests.mjs',...suites.map(s=>'tests/'+s+'_test.js')],{env,encoding:'utf8',maxBuffer:16*1024*1024});
 await mkdir('dist/verification',{recursive:true});
 const log='engine-tests-'+Date.now()+'-'+process.pid+'.txt';
 await writeFile('dist/verification/'+log,(result.stdout??'')+(result.stderr??''),{flag:'wx'});
 await writeFile('dist/verification/engine-tests-latest.json',JSON.stringify({log,status:result.status,suites},null,2)+'\n');
 console.log((result.stdout??'').split('\n').filter(line=>/^(PASS|FAIL|SKIP|RESULT|TOTAL)/.test(line)).join('\n'));
 if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{await rm(fixture,{recursive:true,force:true});}
