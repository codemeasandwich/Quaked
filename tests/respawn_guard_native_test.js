// A guard monster is left where the player fell (card [2]): a native Fiend on Normal, a Shambler on Hard and Nightmare, none on Easy.
// The game's own spawn function makes it after the respawn lands. Real QuakeC, real server, stock maps.
// (the drop and health tests turn the guard off with sv_respawnguard 0; here it is on)
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
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
const bytes=readFileSync(new URL('../games/shareware/pak0.pak',import.meta.url));pak.COM_AddPack(pak.COM_LoadPackFile('pak0.pak',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)));VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);Mod_Init();PR_InitBuiltins();Cbuf_Init();
for(const c of[r_hdr,skill,sv_gravity,travel.sv_seamless])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
let restarts=0;Cmd_AddCommand('restart',()=>restarts++);
function spawn(map='e1m1',reset=true,enhanced=true){if(reset){travel.SV_SeamlessReset();svs.maxclients=1;svs.clients=[new client_t()];SZ_Alloc(svs.clients[0].message,32768);}cls.state=ca_disconnected;cls.demoplayback=false;vars.Cvar_SetValue('r_hdr',enhanced?1:0);vars.Cvar_SetValue('skill',2);/* Hard: full-health respawn (Normal's reduced health is tested in respawn_health_native_test.js); the guard monster is off here (tested in respawn_guard_native_test.js) so nobody stands on the death spot */respawn.sv_respawnguard.value=1;vars.Cvar_SetValue('sv_seamless',1);R_AnimSetClassicPass(false);sv.active=false;SV_SpawnServer(map);const p=svs.clients[0].edict;call(p,progs.pr_global_struct.SetNewParms);call(p,progs.pr_global_struct.ClientConnect);call(p,progs.pr_global_struct.PutClientInServer);svs.clients[0].active=true;svs.clients[0].spawned=true;check(p.v.health===100&&p._respawnStart&&(enhanced?!!p._respawn:!p._respawn),'actual native spawn captures checkpoint and admits coordinator only in Newer');return p;}
const drops=()=>sv.edicts.filter(e=>e&&!e.free&&e._respawnDrop);
const totals=p=>pools.map((a,i)=>p.v[a]+drops().reduce((sum,e)=>sum+Respawn_DropAmmo(e._respawnDrop)[i],0));
function inventory(p,ammo=[19,61,7,13],bits=127|Q.IT_AXE){p.v.items=bits;p.v.weapon=bits&Q.IT_SHOTGUN?Q.IT_SHOTGUN:Q.IT_AXE;pools.forEach((a,i)=>p.v[a]=ammo[i]);call(p,'W_SetCurrentAmmo');}
function kill(p,command=false){if(command)call(p,'ClientKill');else{const world=sv.edicts[0];progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(world);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(world);progs.pr_globals_float[OFS_PARM0+9]=200;call(p,'T_Damage');}check(p._respawn?.sequence,'native lethal outcome starts sequence');return p._respawn.sequence;}
function at(p,time){sv.time=time;progs.pr_global_struct.time=time;SV_SetFrametime(.01);SV_Physics_Client(p,1);}
function finish(p){const s=p._respawn.sequence,cut=s.at+.22+s.turn/2+1e-6,end=s.at+.22+s.turn+.001;if(sv.time<cut)at(p,cut);check(s.respawned,'native physics reaches contact');if(sv.time<end)at(p,end);check(!p._respawn.sequence,'native physics finishes sequence');}
const {SV_PointContents}=await import('../src/engine/server/world.js'),{MOVETYPE_WALK}=await import('../src/engine/server/server.js');
// real slime/lava with room: a point with at least 40 units of that liquid above a solid floor, in a stock map
function findLiquid(type,maps=['e1m2','e1m3','e1m4','e1m5','e1m6','e1m7','start']){for(const map of maps){spawn(map);const w=sv.worldmodel,lo=w.mins,hi=w.maxs;
 for(let x=lo[0];x<hi[0];x+=32)for(let y=lo[1];y<hi[1];y+=32)for(let z=lo[2];z<hi[2];z+=8){if(SV_PointContents([x,y,z+4])!==type)continue;let ok=true;for(let d=4;d<=44;d+=8)if(SV_PointContents([x,y,z+d])!==type){ok=false;break;}if(!ok)continue;if(SV_PointContents([x,y,z-4])===-2)return {map,x,y,z};}}return null;}
const wet=type=>({slime:-4,lava:-5})[type];
import { SV_TestEntityPosition } from '../src/engine/server/world.js';
import { SV_Move as Move, MOVE_NOMONSTERS as NOMONSTERS } from '../src/engine/server/world.js';
const GUARDS=['monster_demon1','monster_shambler'];
const guards=()=>sv.edicts.filter(e=>e&&!e.free&&GUARDS.includes(text(e.v.classname)));
// the game at a given difficulty, with the player standing on a real floor spot far from the start (a monster's own spot is one)
function go(map,skillValue){const p=spawn(map);vars.Cvar_SetValue('skill',skillValue);respawn.SV_RespawnReserveGuards();// (the difficulty is the one the level loaded with: read it again as a load would)
 const m=sv.edicts.find(e=>e&&!e.free&&(e.v.flags&FL_MONSTER)&&text(e.v.classname).startsWith('monster_')&&Math.hypot(e.v.origin[0]-p.v.origin[0],e.v.origin[1]-p.v.origin[1])>600);check(m,'a monster far from the start gives a floor spot');
 const spot=Array.from(m.v.origin);spot[2]+=2;p.v.origin=spot;p.v.velocity=[0,0,0];SV_LinkEdict(p,false);return {p,spot};}
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const encoded=e=>{const lines=[];ED_Write(lines,e);return lines.join('\n');};
function restore(e,saved){ED_ParseEdict(saved.slice(saved.indexOf('{')+1),e);SV_LinkEdict(e,false);}
const monstersNow=()=>sv.edicts.filter(e=>e&&!e.free&&text(e.v.classname).startsWith('monster_'));
function die(p){const before=new Set(monstersNow().map(e=>e.index));kill(p);const s=p._respawn.sequence;finish(p);return {s,fresh:guards().filter(e=>!before.has(e.index)),before};}
const baseline=()=>guards().length; // the level's own Fiends and Shamblers
const stuck=e=>!!SV_TestEntityPosition(e); // inside the world or another solid entity

Deno.test('the game reserves the Fiend and the Shambler at load, and the reservation leaves no trace: no monster counted, no slot left behind',()=>{
 const p=spawn('e1m2');const ready=respawn.SV_RespawnGuardsReady();check(ready.includes('monster_demon1')&&ready.includes('monster_shambler'),'both are reserved on a stock map: '+ready);
 const total=progs.pr_global_struct.total_monsters,edicts=sv.num_edicts,alive=monstersNow().length;
 respawn.SV_RespawnReserveGuards();respawn.SV_RespawnReserveGuards();
 same(progs.pr_global_struct.total_monsters,total,'total_monsters is unchanged by the reservation');same(sv.num_edicts,edicts,'so is the entity count');same(monstersNow().length,alive,'and no monster was left behind');
 check(sv.model_precache.includes('progs/demon.mdl')&&sv.model_precache.includes('progs/shambler.mdl'),'the models are in the precache table');
 check(sv.sound_precache.includes('demon/idle1.wav')&&sv.sound_precache.includes('shambler/sidle.wav'),'and their sounds');
});

Deno.test('Normal: one Fiend is left at the death spot once the respawn lands, idle; the rest of the level is alerted as before',()=>{
 const {p,spot}=go('e1m2',1);const base=baseline();const {s,fresh,before}=die(p);
 same(fresh.length,1,'exactly one guard');const g=fresh[0];same(text(g.v.classname),'monster_demon1','a Fiend on Normal');
 check(dist(Array.from(g.v.origin),spot)<110,'at the death spot ('+dist(Array.from(g.v.origin),spot).toFixed(0)+' units away)');
 same(text(g.v.model),'progs/demon.mdl','the stock Fiend model');check(g.v.health>=300,'the stock Fiend health ('+g.v.health+')');check(text(g.v.classname).startsWith('monster_'),'a native monster, made by the game\'s own spawn function');
 same(g.v.enemy,0,'idle: it has no enemy');check(g._respawnAlert===null||g._respawnAlert===undefined,'not part of the alert pass');
 const alerted=[...before].map(i=>sv.edicts[i]).filter(e=>e&&!e.free&&e._respawnAlert!==null&&e._respawnAlert!==undefined);check(alerted.length>0&&alerted.length===s.alerted,'every earlier monster was still alerted ('+alerted.length+' of '+s.alerted+')');
 // late frames and repeated sequence frames make no more
 let t=sv.time;for(let i=0;i<60;i++){t+=.05;at(p,t);}same(guards().length,base+1,'late frames add none');respawn.SV_RespawnFrame(p);respawn.SV_RespawnFrame(p);same(guards().length,base+1,'nor do repeated sequence frames');
});

Deno.test('the guard is never put inside a monster, the player or a wall: a death beside a monster, a death at the respawn point, repeated deaths on one spot',()=>{
 // beside (at the origin of) a living monster: the guard goes round it and nobody is stuck
 {const {p}=go('e1m2',1);const {fresh}=die(p);same(fresh.length,1,'a guard');check(!stuck(fresh[0]),'the guard is not stuck in the monster whose spot the player died on');check(!stuck(p),'nor is the player');
  for(const m of monstersNow())if(m!==fresh[0])check(dist(Array.from(m.v.origin),Array.from(fresh[0].v.origin))>60,'clear of '+text(m.v.classname)+' '+m.index);}
 // a death at the point the player respawns: no guard (nobody is put beside a fresh respawn), and the player is not stuck
 {const p=spawn('e1m2');vars.Cvar_SetValue('skill',1);respawn.SV_RespawnReserveGuards();const before=baseline();const {fresh}=die(p);same(fresh.length,0,'a death at the start leaves no guard');same(guards().length,before,'none at all');check(!stuck(p),'the respawned player is not stuck');
  const near=new Set(monstersNow().filter(e=>dist(Array.from(e.v.origin),Array.from(p.v.origin))<128));void near;}
 // repeated deaths on one spot: each guard goes to a spot of its own
 {const {p,spot}=go('e1m2',1);const first=die(p).fresh[0];inventory(p);p.v.origin=spot;SV_LinkEdict(p,false);const second=die(p).fresh[0];
  check(first&&second,'two guards');check(!stuck(first)&&!stuck(second),'neither is stuck in the other');check(dist(Array.from(first.v.origin),Array.from(second.v.origin))>60,'and they are apart ('+dist(Array.from(first.v.origin),Array.from(second.v.origin)).toFixed(0)+' units)');}
});

Deno.test('the guard counts in the level total and the kills, and the client is told the new total; it stays idle under real AI frames',()=>{
 const {p}=go('e1m2',1);const total=progs.pr_global_struct.total_monsters;SZ_Clear(sv.reliable_datagram);const {fresh}=die(p);const g=fresh[0];check(g,'a guard');
 same(progs.pr_global_struct.total_monsters,total+1,'total_monsters grew by the guard');
 const bytes=Array.from(sv.reliable_datagram.data.subarray(0,sv.reliable_datagram.cursize));let found=false;for(let i=0;i+5<bytes.length;i++)if(bytes[i]===3&&bytes[i+1]===12&&(bytes[i+2]|bytes[i+3]<<8|bytes[i+4]<<16|bytes[i+5]<<24)===total+1)found=true;check(found,'an svc_updatestat for STAT_TOTALMONSTERS (12) carrying '+(total+1)+' was sent');
 // real AI frames: the guard thinks and stays idle (the player is far away)
 SV_SetPlayer(p);let t=sv.time;SV_SetFrametime(.05);for(let i=0;i<80;i++){t+=.05;sv.time=t;progs.pr_global_struct.time=t;SV_Physics();}
 same(g.v.enemy,0,'after 80 real server frames the guard has no enemy');check(!g.free&&g.v.health>0,'and is alive');check((g.v.flags&FL_MONSTER)!==0,'it has become a live monster (the spawn function\'s own delayed start ran)');
 // killing it counts a kill within the total
 const killed=progs.pr_global_struct.killed_monsters;progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(g);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(p);progs.pr_globals_float[OFS_PARM0+9]=5000;call(p,'T_Damage');
 same(progs.pr_global_struct.killed_monsters,killed+1,'killing it is one kill');check(progs.pr_global_struct.killed_monsters<=progs.pr_global_struct.total_monsters,'never more kills than the total');
});

Deno.test('Hard and Nightmare leave a Shambler, Easy none',()=>{
 for(const [skillValue,want] of [[2,'monster_shambler'],[3,'monster_shambler'],[0,null]]){
  const {p,spot}=go('e1m2',skillValue);const {fresh}=die(p);
  if(want===null){same(fresh.length,0,'Easy: no guard');continue;}
  same(fresh.length,1,'skill '+skillValue+': one guard');same(text(fresh[0].v.classname),want,'a Shambler');same(text(fresh[0].v.model),'progs/shambler.mdl','the stock Shambler model');check(fresh[0].v.health>=600,'the stock Shambler health');check(dist(Array.from(fresh[0].v.origin),spot)<110,'at the death spot');
 }
});

Deno.test('one guard per completed death; none with sv_respawnguard 0',()=>{
 const {p,spot}=go('e1m2',1);const base=baseline();die(p);same(guards().length,base+1,'the first death');
 inventory(p);p.v.origin=spot;SV_LinkEdict(p,false);const second=die(p); // (the player dies on the same spot again)
 same(guards().length,base+2,'a second death leaves a second guard');same(second.fresh.length,1,'one new');
 respawn.sv_respawnguard.value=0;inventory(p);p.v.origin=spot;SV_LinkEdict(p,false);try{const third=die(p);same(third.fresh.length,0,'sv_respawnguard 0: none');same(guards().length,base+2,'the earlier ones stay');}finally{respawn.sv_respawnguard.value=1;}
});

Deno.test('a game saved during the respawn creates no second guard, before or after the contact',()=>{
 const {p}=go('e1m2',1);const base=baseline();kill(p);const s=p._respawn.sequence;const before=encoded(p); // saved while still dying: the guard comes at contact
 finish(p);same(guards().length,base+1,'one guard after the respawn');
 const after=encoded(p);restore(p,after);respawn.SV_RespawnFrame(p);respawn.SV_RespawnFrame(p);same(guards().length,base+1,'a save made after the contact does not repeat it');
 restore(p,before);check(p._respawn.sequence&&!p._respawn.sequence.respawned,'the earlier save is mid-death again');const now=sv.time;at(p,now+.01);at(p,now+.02);check(p._respawn.sequence?.respawned||!p._respawn.sequence,'the loaded game reached its contact');same(guards().length,base+2,'loading that earlier save and respawning leaves its own guard, once');at(p,now+.03);at(p,now+.04);same(guards().length,base+2,'and no more on later frames');
});

Deno.test('the death spot is checked: lava and solid rock leave no guard on bad ground, and nothing throws',()=>{
 const spot=findLiquid(-5);check(spot,'a real lava pool exists');
 {const p=spawn(spot.map);vars.Cvar_SetValue('skill',1);respawn.SV_RespawnReserveGuards();p.v.origin=[spot.x,spot.y,spot.z+28];p.v.velocity=[0,0,0];SV_LinkEdict(p,false);p.v.health=60;
  let t=sv.time;for(let i=0;i<4000&&!p._respawn?.sequence;i++){t+=.01;at(p,t);}check(p._respawn?.sequence,'the lava killed the player');const before=new Set(monstersNow().map(e=>e.index));finish(p);
  for(const g of guards().filter(e=>!before.has(e.index))){same(SV_PointContents(Array.from(g.v.origin)),-1,'a guard is never placed in the lava');}}
 {const p=spawn('e1m2');vars.Cvar_SetValue('skill',1);respawn.SV_RespawnReserveGuards();const w=sv.worldmodel;let rock=null;
  for(let x=w.mins[0]+64;x<w.maxs[0]&&!rock;x+=64)for(let y=w.mins[1]+64;y<w.maxs[1]&&!rock;y+=64)for(let z=w.mins[2]+64;z<w.maxs[2];z+=64){let ok=true;for(const [dx,dy,dz] of [[0,0,0],[48,0,0],[-48,0,0],[0,48,0],[0,-48,0],[0,0,48],[0,0,-48],[96,0,0],[-96,0,0],[0,96,0],[0,-96,0]])if(SV_PointContents([x+dx,y+dy,z+dz])!==-2){ok=false;break;}if(ok){rock=[x,y,z];break;}}
  check(rock,'solid rock exists in the level');p.v.origin=rock;p.v.velocity=[0,0,0];SV_LinkEdict(p,false);const before=new Set(monstersNow().map(e=>e.index));kill(p);finish(p);
  same(guards().filter(e=>!before.has(e.index)).length,0,'a death inside rock leaves no guard');check(p.v.health>0,'and the respawn itself completed');}
});

Deno.test('no room in the tables: no guard, no error, and the stock respawn works; a monster the level already has needs no room',()=>{
 const p=spawn('e1m2');vars.Cvar_SetValue('skill',1);const sounds=sv.sound_precache.slice(),models=sv.model_precache.slice();
 try{
  // the level does not have these monsters' models, and the sound table is full
  for(let i=0;i<sv.model_precache.length;i++)if(['progs/demon.mdl','progs/shambler.mdl'].includes(sv.model_precache[i]))sv.model_precache[i]=null;
  for(let i=0;i<sv.sound_precache.length;i++)if(!sv.sound_precache[i])sv.sound_precache[i]='fill/'+i+'.wav';
  respawn.SV_RespawnReserveGuards();same(respawn.SV_RespawnGuardsReady().length,0,'nothing reserved without room');
  const m=monstersNow().find(e=>Math.hypot(e.v.origin[0]-p.v.origin[0],e.v.origin[1]-p.v.origin[1])>600);const spot=Array.from(m.v.origin);spot[2]+=2;p.v.origin=spot;SV_LinkEdict(p,false);
  const {fresh}=die(p);same(fresh.length,0,'no guard');same(p.v.health>0,true,'the respawn completed');
  // a monster the level already has (its model is in the table) needs no room: it is reserved even with the sound table full
  for(let i=0;i<models.length;i++)sv.model_precache[i]=models[i];respawn.SV_RespawnReserveGuards();check(respawn.SV_RespawnGuardsReady().length===2,'monsters already in the tables are reserved with no room');
 }finally{for(let i=0;i<sounds.length;i++)sv.sound_precache[i]=sounds[i];for(let i=0;i<models.length;i++)sv.model_precache[i]=models[i];}
 respawn.SV_RespawnReserveGuards();check(respawn.SV_RespawnGuardsReady().length===2,'with room again both are reserved');
});

// The placement rules on a grid of real death points (empty air, water, lava and slime alike): wherever a spot comes back it obeys every
// rule, wherever one is refused nothing is made. Each rule is also seen to be needed: the grid contains points that only that rule rejects.
Deno.test('the placement rules hold at every sampled death point of real maps',()=>{
 const seen={found:0,none:0};const [mins,maxs]=[[-32,-32,-24],[32,32,64]];
 for(const map of['e1m2','e1m3','e1m5']){
  const p=spawn(map);const w=sv.worldmodel;let n=0;
  for(let x=w.mins[0]+16;x<w.maxs[0];x+=80)for(let y=w.mins[1]+16;y<w.maxs[1];y+=80)for(let z=w.mins[2]+16;z<w.maxs[2];z+=56){
   const d=[x,y,z];if(SV_PointContents(d)===-2)continue;n++;
   const at=respawn.SV_RespawnGuardSpot(p,d);if(!at){seen.none++;continue;}seen.found++;
   same(SV_PointContents(at),-1,'the spot is in empty air');
   check(Move(d,[-1,-1,-1],[1,1,1],at,NOMONSTERS,sv.edicts[0]).fraction===1,'a clear path from the death point to the spot');
   const down=Move(at,mins,maxs,[at[0],at[1],at[2]-256],NOMONSTERS,sv.edicts[0]);check(!down.startsolid&&down.fraction<1&&SV_PointContents(down.endpos)===-1,'ground within 256 below the spot, not liquid');
   const here=Move(at,mins,maxs,at,0,sv.edicts[0]);check(!here.startsolid&&!here.allsolid,'the hull fits there with everything else');
   check(Math.hypot(at[0]-p.v.origin[0],at[1]-p.v.origin[1],at[2]-p.v.origin[2])>=128,'not beside where the player respawns');
  }
  check(n>200,map+': a real sample ('+n+' points)');
 }
 check(seen.found>200&&seen.none>50,'both outcomes occurred: '+JSON.stringify(seen));
});

Deno.test('the reservation takes a fresh slot back out and leaves it blank',()=>{
 const p=spawn('e1m2');sv.time=10;const count=sv.num_edicts;
 // every free slot was freed just now, so the spawn function must go past the end of the list
 for(let i=svs.maxclients+1;i<sv.num_edicts;i++){const e=sv.edicts[i];if(e.free)e.freetime=sv.time;}
 respawn.SV_RespawnReserveGuards();same(sv.num_edicts,count,'the entity count is what it was');
 const slot=sv.edicts[count];check(slot&&slot.free,'the slot past the end is free');check(new Uint8Array(slot._fieldBuffer).every(b=>b===0),'and blank: nothing of the throwaway\'s think, class or fields is left');
 void p;
});
