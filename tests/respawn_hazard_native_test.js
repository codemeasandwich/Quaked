// Respawn after dying in slime or lava (card [41]): the respawned player must not inherit the old liquid's waterlevel,
// watertype or damage timer, so no stale hazard damage lands on the first tick, while a spawn that really is wet and a
// later walk into a hazard still obey the native rules. Real QuakeC, real server physics, real stock levels.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as pak from '../src/pak.js';
import { VID_SetPalette } from '../src/vid.js';
import { Mod_Init } from '../src/gl_model.js';
import { PR_InitBuiltins } from '../src/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/pr_exec.js';
import * as progs from '../src/progs.js';
import { ED_FindFunction, ED_NewString, ED_Write, ED_ParseEdict, ED_Alloc, ED_Free, GetEdictFieldValue } from '../src/pr_edict.js';
import { OFS_PARM0 } from '../src/pr_comp.js';
import { sv, svs, client_t, FL_MONSTER, FL_ONGROUND } from '../src/server.js';
import { SV_SpawnServer, SV_CheckForNewClients, SV_SaveSpawnparms, SV_ClearCarriedPowerups, SV_WriteClientdataToMessage } from '../src/sv_main.js';
import { SV_RunTriggerTouch, SV_LinkEdict, SV_Move, MOVE_NOMONSTERS } from '../src/world.js';
import { SV_Physics, SV_Physics_Client, SV_Physics_Toss, SV_SetPlayer, SV_SetFrametime, SV_PushEntity, sv_gravity } from '../src/sv_phys.js';
import * as travel from '../src/sv_seamless.js';
import * as respawn from '../src/sv_respawn.js';
import {Respawn_DropAmmo} from '../src/respawn_record.js';
import * as vars from '../src/cvar.js';
import { Cbuf_Init, Cbuf_Execute, Cmd_AddCommand, Cmd_ExecuteString, src_command } from '../src/cmd.js';
import { SZ_Alloc, SZ_Clear, sizebuf_t, COM_SetNetMessage } from '../src/common.js';
import { CL_ParseServerMessage } from '../src/cl_parse.js';
import { r_hdr } from '../src/gl_post.js';
import { skill } from '../src/host.js';
import { R_AnimSetClassicPass } from '../src/r_anim.js';
import { cls, cl, cl_entities, set_cl_numvisedicts, ca_disconnected, ca_connected, ca_dedicated } from '../src/client.js';
import * as Q from '../src/quakedef.js';
import { R_LevelEntities } from '../src/r_levelents.js';
import { NET_Init, NET_Close } from '../src/net_main.js';
import { Loop_Connect, Loop_CheckNewConnections } from '../src/net_loop.js';
import { V_Init, V_CalcRefdef } from '../src/view.js';
import * as render from '../src/gl_rmain.js';
import { r_refdef, entity_t } from '../src/render.js';
import { R_DrawAliasModel } from '../src/gl_mesh.js';
import { Host_InitCommands } from '../src/host_cmd.js';
import { Respawn_Sample } from '../src/respawn_motion.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),near=(a,b,m,e=1e-4)=>check(Math.abs(a-b)<e,`${m}: ${a} != ${b}`);
const pools=['ammo_shells','ammo_nails','ammo_rockets','ammo_cells'], weapons=[1,2,4,8,16,32,64],powerFields=['invisible_finished','invincible_finished','super_damage_finished','radsuit_finished','invisible_time','invincible_time','super_time','rad_time'];
const text=i=>progs.PR_GetString(i),fn=n=>{const f=ED_FindFunction(n);check(f,'native function '+n);return progs.pr_functions.indexOf(f);};
function field(e,n,value){const s=GetEdictFieldValue(e,n);check(s,'native field '+n);if(value!==undefined)s.accessor.setFloat(s.ofs,value);return s.accessor.getFloat(s.ofs);}
function call(e,n){progs.pr_global_struct.self=progs.EDICT_TO_PROG(e);progs.pr_global_struct.time=sv.time;PR_ExecuteProgram(typeof n==='string'?fn(n):n);}
const bytes=readFileSync(new URL('../pak0.pak',import.meta.url));pak.COM_AddPack(pak.COM_LoadPackFile('pak0.pak',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)));VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);Mod_Init();PR_InitBuiltins();Cbuf_Init();
for(const c of[r_hdr,skill,sv_gravity,travel.sv_seamless])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
let restarts=0;Cmd_AddCommand('restart',()=>restarts++);
function spawn(map='e1m1',reset=true,enhanced=true){if(reset){travel.SV_SeamlessReset();svs.maxclients=1;svs.clients=[new client_t()];SZ_Alloc(svs.clients[0].message,32768);}cls.state=ca_disconnected;cls.demoplayback=false;vars.Cvar_SetValue('r_hdr',enhanced?1:0);vars.Cvar_SetValue('skill',2);/* Hard: full-health respawn (Normal's reduced health is tested in respawn_health_native_test.js); the guard monster is off here (tested in respawn_guard_native_test.js) so nobody stands on the death spot */respawn.sv_respawnguard.value=0;vars.Cvar_SetValue('sv_seamless',1);R_AnimSetClassicPass(false);sv.active=false;SV_SpawnServer(map);const p=svs.clients[0].edict;call(p,progs.pr_global_struct.SetNewParms);call(p,progs.pr_global_struct.ClientConnect);call(p,progs.pr_global_struct.PutClientInServer);svs.clients[0].active=true;svs.clients[0].spawned=true;check(p.v.health===100&&p._respawnStart&&(enhanced?!!p._respawn:!p._respawn),'actual native spawn captures checkpoint and admits coordinator only in Newer');return p;}
const drops=()=>sv.edicts.filter(e=>e&&!e.free&&e._respawnDrop);
const totals=p=>pools.map((a,i)=>p.v[a]+drops().reduce((sum,e)=>sum+Respawn_DropAmmo(e._respawnDrop)[i],0));
function inventory(p,ammo=[19,61,7,13],bits=127|Q.IT_AXE){p.v.items=bits;p.v.weapon=bits&Q.IT_SHOTGUN?Q.IT_SHOTGUN:Q.IT_AXE;pools.forEach((a,i)=>p.v[a]=ammo[i]);call(p,'W_SetCurrentAmmo');}
function kill(p,command=false){if(command)call(p,'ClientKill');else{const world=sv.edicts[0];progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(world);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(world);progs.pr_globals_float[OFS_PARM0+9]=200;call(p,'T_Damage');}check(p._respawn?.sequence,'native lethal outcome starts sequence');return p._respawn.sequence;}
function at(p,time){sv.time=time;progs.pr_global_struct.time=time;SV_SetFrametime(.01);SV_Physics_Client(p,1);}
function finish(p){const s=p._respawn.sequence,cut=s.at+.22+s.turn/2+1e-6,end=s.at+.22+s.turn+.001;if(sv.time<cut)at(p,cut);check(s.respawned,'native physics reaches contact');if(sv.time<end)at(p,end);check(!p._respawn.sequence,'native physics finishes sequence');}
const {SV_PointContents}=await import('../src/world.js'),{MOVETYPE_WALK}=await import('../src/server.js');
// real slime/lava with room: a point with at least 40 units of that liquid above a solid floor, in a stock map
function findLiquid(type,maps=['e1m2','e1m3','e1m4','e1m5','e1m6','e1m7','start']){for(const map of maps){spawn(map);const w=sv.worldmodel,lo=w.mins,hi=w.maxs;
 for(let x=lo[0];x<hi[0];x+=32)for(let y=lo[1];y<hi[1];y+=32)for(let z=lo[2];z<hi[2];z+=8){if(SV_PointContents([x,y,z+4])!==type)continue;let ok=true;for(let d=4;d<=44;d+=8)if(SV_PointContents([x,y,z+d])!==type){ok=false;break;}if(!ok)continue;if(SV_PointContents([x,y,z-4])===-2)return {map,x,y,z};}}return null;}
const wet=type=>({slime:-4,lava:-5})[type];
const state=p=>({health:p.v.health,waterlevel:p.v.waterlevel,watertype:p.v.watertype,dmgtime:field(p,'dmgtime')});
// die in the liquid by the game's own hazard, return the player and the clock
function dieIn(type){const spot=findLiquid(wet(type));check(spot,'a real '+type+' pool exists in a stock map');const p=spawn(spot.map);inventory(p);p.v.origin=[spot.x,spot.y,spot.z+28];p.v.velocity=[0,0,0];SV_LinkEdict(p,false);p.v.health=60;
 let t=sv.time;for(let i=0;i<4000&&!p._respawn?.sequence;i++){t+=.01;at(p,t);}check(p._respawn?.sequence,'the game\'s own '+type+' damage killed the player');check(p.v.waterlevel>0&&p.v.watertype===wet(type),'the player died in the liquid (waterlevel '+p.v.waterlevel+')');return {p,spot};}

// step to just past contact: the player is at the destination, the sequence (the rise) is still running
function toContact(p){const s=p._respawn.sequence;at(p,s.at+.22+s.turn/2+1e-6);check(s.respawned&&p._respawn.sequence,'contact reached with the rise still running');}
for(const type of['slime','lava'])Deno.test('a dry respawn after dying in '+type+' carries no hazard over: refreshed water state at contact, no damage on the first or later ticks',()=>{
 const {p}=dieIn(type);toContact(p);
 same(p.v.waterlevel,0,'at contact (during the rise) the water state is the destination\'s, so the face and the client data do not show a submerged player');same(p.v.watertype,-1,'watertype empty at contact');
 finish(p);
 const start=Array.from(p.v.origin);check(SV_PointContents(start)===-1,'the respawn point is dry air');
 same(p.v.waterlevel,0,'still refreshed when the sequence completes');same(p.v.watertype,-1,'watertype empty');same(field(p,'dmgtime'),0,'the old hazard\'s damage timer is cleared (hygiene: it has always expired by then)');
 let t=sv.time;for(let i=0;i<400;i++){t+=.01;at(p,t);same(p.v.health,100,'tick '+i+': no carried-over environmental damage');}
 same(p.v.waterlevel,0,'still dry');check(field(p,'air_finished')>sv.time,'air supply fresh, no drowning countdown');
});

for(const type of['slime','lava'])Deno.test('a respawn that really lands in '+type+' obeys the native hazard rules, and walking into a hazard later is still hurt',()=>{
 const {p,spot}=dieIn(type);const s=p._respawn;
 // the player's start is genuinely wet this time
 s.start=[spot.x,spot.y,spot.z+28];toContact(p);
 check(p.v.waterlevel>0&&p.v.watertype===wet(type),'a wet destination is seen as wet at contact, during the rise (waterlevel '+p.v.waterlevel+')');finish(p);
 let t=sv.time,hurt=false;for(let i=0;i<300&&!hurt;i++){t+=.01;at(p,t);hurt=p.v.health<100;}check(hurt,'native hazard damage applies in a spawn that is wet');
 // and a dry respawn, then a walk into the liquid
 const {p:q,spot:w}=dieIn(type);finish(q);let u=sv.time;for(let i=0;i<50;i++){u+=.01;at(q,u);}same(q.v.health,100,'dry after respawn');
 q.v.origin=[w.x,w.y,w.z+28];q.v.velocity=[0,0,0];SV_LinkEdict(q,false);let hit=false;for(let i=0;i<300&&!hit;i++){u+=.01;at(q,u);hit=q.v.health<100;}check(hit,'re-entering the hazard hurts as natively');
});

Deno.test('health, inventory, timing and ordinary damage are as before at a dry respawn',()=>{
 const {p}=dieIn('slime');const s=p._respawn.sequence,expectedEnd=s.at+.22+s.turn;finish(p);
 same(p.v.health,100,'full health at contact');same(p.v.items&~Q.IT_KEY1&~Q.IT_KEY2,Q.IT_AXE,'axe only');same(pools.map(a=>p.v[a]).join(),'0,0,0,0','no ammunition');
 check(Math.abs(sv.time-expectedEnd)<.002,'the sequence ends when it always did (at '+expectedEnd.toFixed(3)+', now '+sv.time.toFixed(3)+')');
 same(p.v.takedamage,2,'the player can be damaged again once it ends');same(p.v.movetype,MOVETYPE_WALK,'and walks');
 // ordinary damage lands (takedamage is NOT forced here)
 const world=sv.edicts[0];progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(world);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(world);progs.pr_globals_float[OFS_PARM0+9]=15;call(p,'T_Damage');
 same(p.v.health,85,'a real 15-point hit after respawn lands');
});

Deno.test('a game saved during the rise by a build without the refresh is corrected when the sequence completes',()=>{
 const {p}=dieIn('slime');toContact(p);p.v.waterlevel=3;p.v.watertype=-4; // the stale state such a save would carry
 finish(p);same(p.v.waterlevel,0,'refreshed at completion');same(p.v.watertype,-1,'refreshed at completion');
 let t=sv.time;for(let i=0;i<100;i++){t+=.01;at(p,t);}same(p.v.health,100,'and no first-tick damage');
});
