// Normal-difficulty respawn health (card [4]): 100 on a new game, 10 less at each completed respawn down to 60, 10 back (up to 100)
// on the first arrival in a level not seen before in the run; other difficulties untouched. Real QuakeC and real server.
// Level changes use the game's own spawn-parameter path (SV_SaveSpawnparms, SV_SpawnServer, ClientConnect, PutClientInServer).
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/progs/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { ED_FindFunction, ED_NewString, ED_Write, ED_ParseEdict, ED_Alloc, ED_Free, GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { OFS_PARM0 } from '../src/engine/progs/pr_comp.js';
import { sv, svs, client_t, FL_MONSTER, FL_ONGROUND } from '../src/engine/server/server.js';
import { SV_SpawnServer, SV_CheckForNewClients, SV_SaveSpawnparms, SV_ClearCarriedPowerups, SV_WriteClientdataToMessage } from '../src/engine/server/sv_main.js';
import { SV_RunTriggerTouch, SV_LinkEdict, SV_Move, MOVE_NOMONSTERS } from '../src/engine/server/world.js';
import { SV_Physics, SV_Physics_Client, SV_Physics_Toss, SV_SetPlayer, SV_SetFrametime, SV_PushEntity, sv_gravity } from '../src/engine/server/sv_phys.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import * as respawn from '../src/newer/gameplay/sv_respawn.js';
import {Respawn_DropAmmo} from '../src/newer/gameplay/respawn_record.js';
import * as vars from '../src/engine/common/cvar.js';
import { Cbuf_Init, Cbuf_Execute, Cmd_AddCommand, Cmd_ExecuteString, src_command } from '../src/engine/common/cmd.js';
import { SZ_Alloc, SZ_Clear, sizebuf_t, COM_SetNetMessage } from '../src/engine/common/common.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { skill } from '../src/engine/server/host.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { cls, cl, cl_entities, set_cl_numvisedicts, ca_disconnected, ca_connected, ca_dedicated } from '../src/engine/client/client.js';
import * as Q from '../src/engine/common/quakedef.js';
import { R_LevelEntities } from '../src/newer/render/r_levelents.js';
import { NET_Init, NET_Close } from '../src/engine/net/net_main.js';
import { Loop_Connect, Loop_CheckNewConnections } from '../src/engine/net/net_loop.js';
import { V_Init, V_CalcRefdef } from '../src/engine/client/view.js';
import * as render from '../src/engine/render/gl_rmain.js';
import { r_refdef, entity_t } from '../src/engine/render/render.js';
import { R_DrawAliasModel } from '../src/engine/render/gl_mesh.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { Respawn_Sample } from '../src/newer/ui/respawn_motion.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),near=(a,b,m,e=1e-4)=>check(Math.abs(a-b)<e,`${m}: ${a} != ${b}`);
const pools=['ammo_shells','ammo_nails','ammo_rockets','ammo_cells'], weapons=[1,2,4,8,16,32,64],powerFields=['invisible_finished','invincible_finished','super_damage_finished','radsuit_finished','invisible_time','invincible_time','super_time','rad_time'];
const text=i=>progs.PR_GetString(i),fn=n=>{const f=ED_FindFunction(n);check(f,'native function '+n);return progs.pr_functions.indexOf(f);};
function field(e,n,value){const s=GetEdictFieldValue(e,n);check(s,'native field '+n);if(value!==undefined)s.accessor.setFloat(s.ofs,value);return s.accessor.getFloat(s.ofs);}
function call(e,n){progs.pr_global_struct.self=progs.EDICT_TO_PROG(e);progs.pr_global_struct.time=sv.time;PR_ExecuteProgram(typeof n==='string'?fn(n):n);}
const bytes=readFileSync(new URL('../pak0.pak',import.meta.url));pak.COM_AddPack(pak.COM_LoadPackFile('pak0.pak',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)));VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);Mod_Init();PR_InitBuiltins();Cbuf_Init();
for(const c of[r_hdr,skill,sv_gravity,travel.sv_seamless])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
respawn.sv_respawnguard.value=0; // the guard monster (respawn_guard_native_test.js) is not part of this test
let restarts=0;Cmd_AddCommand('restart',()=>restarts++);
function spawn(map='e1m1',reset=true,enhanced=true){if(reset){travel.SV_SeamlessReset();svs.maxclients=1;svs.clients=[new client_t()];SZ_Alloc(svs.clients[0].message,32768);}cls.state=ca_disconnected;cls.demoplayback=false;vars.Cvar_SetValue('r_hdr',enhanced?1:0);vars.Cvar_SetValue('skill',1);vars.Cvar_SetValue('sv_seamless',1);R_AnimSetClassicPass(false);sv.active=false;SV_SpawnServer(map);const p=svs.clients[0].edict;call(p,progs.pr_global_struct.SetNewParms);call(p,progs.pr_global_struct.ClientConnect);call(p,progs.pr_global_struct.PutClientInServer);svs.clients[0].active=true;svs.clients[0].spawned=true;check(p.v.health===100&&p._respawnStart&&(enhanced?!!p._respawn:!p._respawn),'actual native spawn captures checkpoint and admits coordinator only in Newer');return p;}
const drops=()=>sv.edicts.filter(e=>e&&!e.free&&e._respawnDrop);
const totals=p=>pools.map((a,i)=>p.v[a]+drops().reduce((sum,e)=>sum+Respawn_DropAmmo(e._respawnDrop)[i],0));
function inventory(p,ammo=[19,61,7,13],bits=127|Q.IT_AXE){p.v.items=bits;p.v.weapon=bits&Q.IT_SHOTGUN?Q.IT_SHOTGUN:Q.IT_AXE;pools.forEach((a,i)=>p.v[a]=ammo[i]);call(p,'W_SetCurrentAmmo');}
function kill(p,command=false){if(command)call(p,'ClientKill');else{const world=sv.edicts[0];progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(world);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(world);progs.pr_globals_float[OFS_PARM0+9]=200;call(p,'T_Damage');}check(p._respawn?.sequence,'native lethal outcome starts sequence');return p._respawn.sequence;}
function at(p,time){sv.time=time;progs.pr_global_struct.time=time;SV_SetFrametime(.01);SV_Physics_Client(p,1);}
function finish(p){const s=p._respawn.sequence,cut=s.at+.22+s.turn/2+1e-6,end=s.at+.22+s.turn+.001;if(sv.time<cut)at(p,cut);check(s.respawned,'native physics reaches contact');if(sv.time<end)at(p,end);check(!p._respawn.sequence,'native physics finishes sequence');}

import { Respawn_NoticeAt, Respawn_NoticeClear, RESPAWN_MINUS, RESPAWN_PLUS, RESPAWN_NOTICE_SECONDS } from '../src/newer/ui/respawn_notice.js';
import { Respawn_ParsePlayer } from '../src/newer/gameplay/respawn_record.js';
const state=p=>p._respawn;
const setSkill=n=>vars.Cvar_SetValue('skill',n);
const notice=()=>Respawn_NoticeAt(sv.time);
// die and complete the respawn; returns the health it gave and the corner message (if any) shown by it
function die(p){Respawn_NoticeClear();kill(p);finish(p);return {health:p.v.health,message:notice()};}
// the game's changelevel: parms saved, the next level spawned, the parms restored, the client placed
function changelevel(p,map){const client=svs.clients[0];SV_SaveSpawnparms();const parms=Array.from(client.spawn_parms);Cbuf_Init();
 sv.active=false;SV_SpawnServer(map);const arrived=client.edict;for(let i=0;i<16;i++)progs.pr_global_struct['parm'+(i+1)]=parms[i];
 call(arrived,progs.pr_global_struct.ClientConnect);call(arrived,progs.pr_global_struct.PutClientInServer);client.active=true;client.spawned=true;return arrived;}
const encoded=e=>{const lines=[];ED_Write(lines,e);return lines.join('\n');};

Deno.test('Normal: a new game starts at 100; completed deaths respawn at 90, 80, 70, 60, 60, each with the message except the last',()=>{
 const p=spawn('e1m1');same(state(p).respawnHealth,100,'a new game starts at 100');same(p.v.health,100,'and at full health');
 const seen=[];for(let i=0;i<5;i++)seen.push(die(p));
 same(seen.map(s=>s.health).join(),'90,80,70,60,60','respawn health 90, 80, 70, 60, 60');
 same(seen.map(s=>s.message).join('|'),[RESPAWN_MINUS,RESPAWN_MINUS,RESPAWN_MINUS,RESPAWN_MINUS,''].join('|'),'the exact message only when the entitlement decreased');
 same(state(p).respawnHealth,60,'the entitlement is at its floor');for(let i=0;i<3;i++)same(die(p).health,60,'and stays there');
});

Deno.test('the message is stamped when the respawn lands, lasts three seconds, and is exact',()=>{
 const p=spawn('e1m1');Respawn_NoticeClear();kill(p);same(notice(),null,'nothing while the player is still dying');
 const s=p._respawn.sequence;at(p,s.at+.22+s.turn/2+1e-6);check(s.respawned,'contact reached');const landed=sv.time;
 same(Respawn_NoticeAt(landed),'Respawn minus 10 health','the exact corner text at contact');same(RESPAWN_MINUS,'Respawn minus 10 health','constant');
 same(Respawn_NoticeAt(landed+RESPAWN_NOTICE_SECONDS-.01),RESPAWN_MINUS,'still shown just inside three seconds');same(Respawn_NoticeAt(landed+RESPAWN_NOTICE_SECONDS+.01),null,'gone afterwards');
 same(Respawn_NoticeAt(landed-5),null,'not shown if the clock is far behind it');finish(p);
});

Deno.test('the entitlement is its own number: current health and pickups do not change it',()=>{
 const p=spawn('e1m1');same(die(p).health,90,'first respawn 90');p.v.health=100;p.v.armorvalue=200;same(state(p).respawnHealth,90,'a health pickup does not raise the entitlement');
 p.v.health=10;same(state(p).respawnHealth,90,'nor does damage lower it');same(die(p).health,80,'the next respawn is 80 whatever the health was');
});

for(const [skillValue,name] of [[0,'Easy'],[2,'Hard'],[3,'Nightmare']])Deno.test(name+' keeps its health rule: 100 each time, no message, entitlement untouched',()=>{
 const p=spawn('e1m1');setSkill(skillValue);for(let i=0;i<3;i++){const r=die(p);same(r.health,100,name+' respawns at 100');same(r.message,null,'no message');}
 same(state(p).respawnHealth,100,'entitlement untouched');
});

Deno.test('changing difficulty mid-run: deaths only count on Normal',()=>{
 const p=spawn('e1m1');setSkill(2);die(p);setSkill(1);same(die(p).health,90,'the first Normal death is the first reduction');setSkill(2);same(die(p).health,100,'Hard again gives 100');same(state(p).respawnHealth,90,'and leaves the entitlement as it was');
});

Deno.test('first arrival in a new level gives 10 back (never above 100), with its message; return visits, repeats and Level Select give none',()=>{
 let p=spawn('e1m1');die(p);die(p);same(state(p).respawnHealth,80,'two deaths: 80');
 p=changelevel(p,'e1m2');same(state(p).respawnHealth,90,'A to B: 10 recovered');same(notice(),RESPAWN_PLUS,'with the exact message');same(RESPAWN_PLUS,'Next phase plus 10 respawn','constant');
 Respawn_NoticeClear();p=changelevel(p,'e1m1');same(state(p).respawnHealth,90,'B back to A: a return visit gives nothing');same(notice(),null,'and no message');
 p=changelevel(p,'e1m2');same(state(p).respawnHealth,90,'A to B again: no second reward');same(notice(),null,'no message');
 p=changelevel(p,'e1m3');same(state(p).respawnHealth,100,'a third level: another 10');same(notice(),RESPAWN_PLUS,'message');
 Respawn_NoticeClear();p=changelevel(p,'e1m4');same(state(p).respawnHealth,100,'never above 100');same(notice(),null,'and no message when nothing was recovered');
 // deaths and the first respawn after a level change use the carried entitlement
 same(die(p).health,90,'a death after travelling respawns from the carried 100');
});

Deno.test('Easy and Hard neither lose nor recover entitlement by travelling, and Level Select (a fresh map) starts again at 100',()=>{
 let p=spawn('e1m1');die(p);die(p);same(state(p).respawnHealth,80,'80 on Normal');setSkill(2);p=changelevel(p,'e1m2');same(state(p).respawnHealth,80,'Hard: travel changes nothing');same(notice(),null,'no message');
 setSkill(1);SV_ClearCarriedPowerups();p=spawn('e1m3',false);same(state(p).respawnHealth,100,'Level Select / console map is a fresh run');same(notice(),null,'with no message');
 same(die(p).health,90,'and its first death is the first reduction');
});

Deno.test('the level a run starts in counts as seen, even if it is not the first map',()=>{
 let p=spawn('e1m2');die(p);p=changelevel(p,'e1m1');same(state(p).respawnHealth,100,'e1m2 to e1m1 is a first visit, but 90 plus 10 is back to 100');
 p=changelevel(p,'e1m2');same(state(p).respawnHealth,100,'returning to the level the run started in: nothing');
 same(state(p).visited.length,2,'two levels seen, no duplicates');
});

Deno.test('a run restored from a save with no ledger counts the level it is in as seen',()=>{
 let p=spawn('e1m1');die(p);die(p);delete p._respawn.visited;same(state(p).respawnHealth,80,'80 after two deaths');
 p=changelevel(p,'e1m2');same(state(p).respawnHealth,90,'the new level gives 10');p=changelevel(p,'e1m1');same(state(p).respawnHealth,90,'going back to the level the old save was in gives nothing');
});

Deno.test('a level is identified by the progs CRC and the map path of the running server',()=>{
 spawn('e1m1');const here=respawn.levelKey();same(here,progs.pr_crc+':'+sv.modelname,'progs CRC and the server\'s map path');same(sv.modelname,'maps/e1m1.bsp','the engine\'s own path for the map');
 spawn('e1m2');check(respawn.levelKey()!==here,'a different map is a different level');
});

Deno.test('a level change in the middle of a death carries the entitlement unchanged and cannot make a later return visit pay',()=>{
 let p=spawn('e1m1');for(let i=0;i<4;i++)die(p);same(state(p).respawnHealth,60,'four deaths: 60');
 p=changelevel(p,'e1m2');same(state(p).respawnHealth,70,'e1m2 is new: 70');
 kill(p);check(p._respawn.sequence,'the player is mid-death when the exit is taken');
 p=changelevel(p,'e1m3');same(state(p).respawnHealth,80,'an unfinished death takes nothing and e1m3 is new: 80, not a reset to 100');
 same(JSON.stringify(state(p).visited),JSON.stringify([respawn.levelKey().replace('e1m3','e1m1'),respawn.levelKey().replace('e1m3','e1m2'),respawn.levelKey()]),'all three levels are on the list');
 for(let i=0;i<3;i++)die(p);same(state(p).respawnHealth,60,'three more deaths: 60 (80 - 30 = 50 is floored at 60)');
 Respawn_NoticeClear();p=changelevel(p,'e1m2');same(state(p).respawnHealth,60,'returning to e1m2 pays nothing');same(notice(),null,'and shows no message');
});

Deno.test('Classic Quake neither keeps nor rewards the run: no record without a death, no reward or message after one; Newer later resumes it',()=>{
 let p=spawn('e1m1');vars.Cvar_SetValue('r_hdr',0);Respawn_NoticeClear();
 p=changelevel(p,'e1m2');check(!p._respawn,'no death, Classic: no run record at all (as before this change)');same(notice(),null,'and no message');
 vars.Cvar_SetValue('r_hdr',1);p=spawn('e1m1');die(p);same(state(p).respawnHealth,90,'90 after one death');
 vars.Cvar_SetValue('r_hdr',0);Respawn_NoticeClear();p=changelevel(p,'e1m2');
 same(state(p).respawnHealth,90,'Classic arrival in a new level gives nothing (the inventory carry is the old behaviour)');same(notice(),null,'and shows no message');
 vars.Cvar_SetValue('r_hdr',1);p=changelevel(p,'e1m3');same(state(p).respawnHealth,100,'back in Newer the run resumes: the next new level pays');same(notice(),RESPAWN_PLUS,'with its message');
});

Deno.test('the levels-seen list is capped at 512 on the way out so a long run still saves and loads',()=>{
 const p=spawn('e1m1');state(p).visited=Array.from({length:520},(_,i)=>'24778:maps/m'+i+'.bsp');
 const q=changelevel(p,'e1m2');same(state(q).visited.length,512,'newest 512 kept');check(state(q).visited.includes(respawn.levelKey()),'including the level just entered');
 const parsed=Respawn_ParsePlayer(encodeURIComponent(JSON.stringify(state(q))));check(parsed,'the record still loads');
});

Deno.test('save and load: the entitlement and the levels seen survive a save of the player; old saves default sensibly; bad data is refused',()=>{
 let p=spawn('e1m1');die(p);die(p);p=changelevel(p,'e1m2');const before=JSON.stringify([state(p).respawnHealth,state(p).visited]);const text=encoded(p);
 check(text.includes('_clockwise_player'),'the player record is saved');
 const q=spawn('e1m1');ED_ParseEdict(text.slice(text.indexOf('{')+1),q);same(JSON.stringify([q._respawn.respawnHealth,q._respawn.visited]),before,'entitlement and levels seen restored exactly');
 // an older save without the fields: entitlement 100, nothing seen yet
 const legacy=JSON.parse(JSON.stringify(q._respawn));delete legacy.respawnHealth;delete legacy.visited;
 const parsed=Respawn_ParsePlayer(encodeURIComponent(JSON.stringify(legacy)));check(parsed,'a save from before this change is accepted');
 q._respawn=parsed;q.v.health=100;same(die(q).health,90,'an old save starts from 100');
 const bad=v=>Respawn_ParsePlayer(encodeURIComponent(JSON.stringify({...legacy,...v})));
 for(const v of [{respawnHealth:50},{respawnHealth:105},{respawnHealth:75.5},{respawnHealth:'90'},{visited:'e1m1'},{visited:[3]},{visited:['']},{visited:Array(600).fill('x')}])check(bad(v)===null,'refused: '+JSON.stringify(v).slice(0,40));
 for(const v of [60,70,80,90,100])check(bad({respawnHealth:v})!==null,'accepted '+v);
});
