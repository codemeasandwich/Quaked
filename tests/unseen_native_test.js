// The Ring of Shadows in Newer Game (owner request, 9 Oct 2026): a monster hunting the player loses track the moment the
// player is unseen, and a monster the unseen player hurts hunts the place the player fired from, not the player. Real QuakeC
// monsters, the real T_Damage and W_Attack, real physics frames; Classic keeps Quake's rules.
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
import { R_AnimSetClassicPass } from '../src/newer/render/r_anim.js';
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
let restarts=0;Cmd_AddCommand('restart',()=>restarts++);
function spawn(map='e1m1',reset=true,enhanced=true){if(reset){travel.SV_SeamlessReset();svs.maxclients=1;svs.clients=[new client_t()];SZ_Alloc(svs.clients[0].message,32768);}cls.state=ca_disconnected;cls.demoplayback=false;vars.Cvar_SetValue('r_hdr',enhanced?1:0);vars.Cvar_SetValue('skill',2);/* Hard: full-health respawn (Normal's reduced health is tested in respawn_health_native_test.js); the guard monster is off here (tested in respawn_guard_native_test.js) so nobody stands on the death spot */respawn.sv_respawnguard.value=1;vars.Cvar_SetValue('sv_seamless',1);R_AnimSetClassicPass(false);sv.active=false;SV_SpawnServer(map);const p=svs.clients[0].edict;call(p,progs.pr_global_struct.SetNewParms);call(p,progs.pr_global_struct.ClientConnect);call(p,progs.pr_global_struct.PutClientInServer);svs.clients[0].active=true;svs.clients[0].spawned=true;check(p.v.health===100&&p._respawnStart&&(enhanced?!!p._respawn:!p._respawn),'actual native spawn captures checkpoint and admits coordinator only in Newer');return p;}
const drops=()=>sv.edicts.filter(e=>e&&!e.free&&e._respawnDrop);
const totals=p=>pools.map((a,i)=>p.v[a]+drops().reduce((sum,e)=>sum+Respawn_DropAmmo(e._respawnDrop)[i],0));
function inventory(p,ammo=[19,61,7,13],bits=127|Q.IT_AXE){p.v.items=bits;p.v.weapon=bits&Q.IT_SHOTGUN?Q.IT_SHOTGUN:Q.IT_AXE;pools.forEach((a,i)=>p.v[a]=ammo[i]);call(p,'W_SetCurrentAmmo');}
function kill(p,command=false){if(command)call(p,'ClientKill');else{const world=sv.edicts[0];progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(world);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(world);progs.pr_globals_float[OFS_PARM0+9]=200;call(p,'T_Damage');}check(p._respawn?.sequence,'native lethal outcome starts sequence');return p._respawn.sequence;}
function at(p,time){sv.time=time;progs.pr_global_struct.time=time;SV_SetFrametime(.01);SV_Physics_Client(p,1);}
function finish(p){const s=p._respawn.sequence,cut=s.at+.22+s.turn/2+1e-6,end=s.at+.22+s.turn+.001;if(sv.time<cut)at(p,cut);check(s.respawned,'native physics reaches contact');if(sv.time<end)at(p,end);check(!p._respawn.sequence,'native physics finishes sequence');}

import * as unseen from '../src/newer/gameplay/sv_unseen.js';
const fnum=n=>progs.pr_functions.indexOf(ED_FindFunction(n));
function fresh(map='e1m2'){respawn.sv_respawnguard.value=0;const p=spawn(map);vars.Cvar_SetValue('skill',1);p.v.health=100;unseen.SV_UnseenReset();return p;}
function ring(p,on=true){if(on){p.v.items|=Q.IT_INVISIBILITY;field(p,'invisible_finished',sv.time+60);}else{p.v.items&=~Q.IT_INVISIBILITY;field(p,'invisible_finished',0);}}
const enemyOf=m=>progs.PROG_TO_EDICT(m.v.enemy);
// a monster hunting the player, made so by the game's own FoundTarget
function hunting(p,m){m.v.enemy=progs.EDICT_TO_PROG(p);progs.pr_global_struct.self=progs.EDICT_TO_PROG(m);progs.pr_global_struct.time=sv.time;PR_ExecuteProgram(fnum('FoundTarget'));check(enemyOf(m)===p,'the monster hunts the player');}
function frames(p,seconds){SV_SetPlayer(p);SV_SetFrametime(.1);for(let i=0;i<seconds*10;i++){SV_Physics();unseen.SV_UnseenFrame();}}
function hurt(p,m,amount=1){progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(m);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(p);progs.pr_globals_float[OFS_PARM0+9]=amount;progs.pr_global_struct.self=progs.EDICT_TO_PROG(p);progs.pr_global_struct.time=sv.time;PR_ExecuteProgram(fnum('T_Damage'));}
function fire(p){p.v.items|=Q.IT_SHOTGUN;p.v.weapon=Q.IT_SHOTGUN;p.v.ammo_shells=50;call(p,'W_SetCurrentAmmo');field(p,'attack_finished',0);call(p,'W_Attack');}
const tough=()=>sv.edicts.filter(e=>e&&!e.free&&(e.v.flags&FL_MONSTER)&&e.v.health>=80);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

Deno.test('a monster hunting the player loses track the moment the Ring is on, goes back to its stand or patrol, and does not find the player again while it lasts',()=>{
 const p=fresh();const m=tough()[0];p.v.origin=m.v.origin.map((v,i)=>v+(i===0?96:0));SV_LinkEdict(p,false);
 // control: without the Ring the hunt goes on
 hunting(p,m);frames(p,1);check(enemyOf(m)===p,'without the Ring it keeps hunting');
 ring(p);unseen.SV_UnseenFrame();same(m.v.enemy,0,'with the Ring it loses the player at once');const mt=GetEdictFieldValue(m,'movetarget');same(m.v.goalentity,mt.accessor.getInt32(mt.ofs),'and goes back to its patrol (its movetarget) or stand');check(progs.PROG_TO_EDICT(m.v.goalentity)!==p,'not toward the player');
 frames(p,5);check(enemyOf(m)!==p,'five seconds right beside the player and it has not found them again');
});

Deno.test('a monster the unseen player hurts hunts where the player fired from, not the player, and gives up after a while',()=>{
 const p=fresh();const [m,n]=tough();ring(p);
 const from=Array.from(m.v.origin).map((v,i)=>v+(i===0?200:0));p.v.origin=from;SV_LinkEdict(p,false);fire(p);
 p.v.origin=from.map((v,i)=>v+(i===1?300:0));SV_LinkEdict(p,false); // the player moves away after firing
 hurt(p,m);const spot=enemyOf(m);check(spot&&spot!==p,'the hurt monster does not take the player as its enemy');same(text(spot.v.classname),unseen.MARKER,'it takes the spot');
 check(dist(Array.from(spot.v.origin),from)<1,'the spot is where the player fired from, not where they are now');same(spot.v.takedamage,0,'the spot cannot be damaged');same(spot.v.solid,0,'and is not solid');same(progs.PROG_TO_EDICT(m.v.goalentity),spot,'it heads for the spot');
 hurt(p,n);same(enemyOf(n),spot,'another monster hurt from the same place shares the spot');
 const before=dist(Array.from(m.v.origin),from),yawTo=e=>Math.atan2(from[1]-e.v.origin[1],from[0]-e.v.origin[0])*180/Math.PI;
 frames(p,2);check(enemyOf(m)===spot&&enemyOf(m)!==p,'two seconds on it still hunts the spot, never the player');
 const after=dist(Array.from(m.v.origin),from),facing=Math.abs(((m.v.angles[1]-yawTo(m))%360+540)%360-180);console.log('UNSEEN_HUNT '+JSON.stringify({monster:text(m.v.classname),before:+before.toFixed(1),after:+after.toFixed(1),facing:+facing.toFixed(1)}));
 check(after<before-16||facing<30,'it goes for the spot or turns to attack it ('+before.toFixed(0)+' -> '+after.toFixed(0)+', facing off by '+facing.toFixed(0)+')');
 frames(p,unseen.SPOT_LIFE);check(enemyOf(m)!==spot&&enemyOf(m)!==p,'after the spot\'s life it gives up');check(spot.free,'and the spot is gone');
 // control: seen, a hurt monster hunts the player as in Quake
 ring(p,false);hurt(p,m);check(enemyOf(m)===p,'without the Ring the hurt monster hunts the player');
});

Deno.test('a second shot from somewhere else gives a new spot; the Ring ending clears the spots; a saved spot is picked up again',()=>{
 const p=fresh();const m=tough()[0];ring(p);
 p.v.origin=Array.from(m.v.origin).map((v,i)=>v+(i===0?200:0));SV_LinkEdict(p,false);fire(p);hurt(p,m);const a=enemyOf(m);
 sv.time+=1;p.v.origin=Array.from(m.v.origin).map((v,i)=>v+(i===1?200:0));SV_LinkEdict(p,false);fire(p);hurt(p,m);const b=enemyOf(m);
 check(a!==b&&dist(Array.from(b.v.origin),Array.from(p.v.origin))<1,'the second hit sends it to the second firing position');
 // a loaded game: the module starts with no list; the saved spot is adopted and expires as usual
 unseen.SV_UnseenReset();unseen.SV_UnseenFrame();check(unseen.SV_UnseenMarkers().includes(b),'the spot in the game is picked up again');
 ring(p,false);unseen.SV_UnseenFrame();check(b.free&&a.free,'the Ring ending removes the spots');check(enemyOf(m)!==b,'and the monster gives up on it');
});

Deno.test('Classic keeps Quake\'s rules: the hunt goes on and a hurt monster knows where the player is',()=>{
 const p=fresh();vars.Cvar_SetValue('r_hdr',0);try{
  const m=tough()[0];hunting(p,m);ring(p);unseen.SV_UnseenFrame();check(enemyOf(m)===p,'Classic: still hunting');
  hurt(p,m);check(enemyOf(m)===p,'Classic: the hurt monster hunts the player');same(unseen.SV_UnseenMarkers().length,0,'no spots');
 }finally{vars.Cvar_SetValue('r_hdr',1);}
});
