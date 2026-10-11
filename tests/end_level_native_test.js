// The last level (end.bsp, the registered game) can be finished again, and its spiked ball flies a clean lap (owner
// report, 11 Oct 2026, card [END1]). The real map, progs and edicts from the owner's local registered pak (a named skip
// without it): the train started by the level's own trigger, moved by the real SV_Physics_Pusher, and the final
// teleporter's own teleport_touch telefragging Shub-Niggurath.
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


import { SV_Physics_Pusher } from '../src/engine/server/sv_phys.js';
let registered=false;
function endLevel(enhanced){
 if(!registered){const big=readFileSync(new URL('../resources/id1/pak0.pak',import.meta.url));pak.COM_AddPack(pak.COM_LoadPackFile('pak0r.pak',big.buffer.slice(big.byteOffset,big.byteOffset+big.length)));
  // the stock progs over the registered maps, as the browser runs the full game (game_selection.js)
  pak.COM_AddPack(pak.COM_LoadPackFile('pak0.pak',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)));registered=true;}
 svs.maxclients=1;svs.clients=[new client_t()];SZ_Alloc(svs.clients[0].message,32768);cls.state=ca_disconnected;cls.demoplayback=false;
 vars.Cvar_SetValue('r_hdr',enhanced?1:0);vars.Cvar_SetValue('skill',1);vars.Cvar_SetValue('sv_seamless',1);R_AnimSetClassicPass(false);sv.active=false;SV_SpawnServer('end');
 const p=svs.clients[0].edict;call(p,progs.pr_global_struct.SetNewParms);call(p,progs.pr_global_struct.ClientConnect);call(p,progs.pr_global_struct.PutClientInServer);
 svs.clients[0].active=true;svs.clients[0].spawned=true;return p;
}
const find=(c,key='classname')=>sv.edicts.filter(e=>e&&!e.free&&text(e.v[key])===c);
const inside=(o,e)=>[0,1,2].every(i=>o[i]>=e.v.absmin[i]&&o[i]<=e.v.absmax[i]);
// what trigger_once *4 does when the player walks through it: the train's own use, the player as activator
function start(p){const ball=find('misc_teleporttrain')[0]||find('func_train').find(t=>text(t.v.targetname)==='t33');check(ball,'the teleport ball');const act=progs.pr_globaldefs.find(d=>text(d.s_name)==='activator');if(act)progs.pr_globals_int[act.ofs]=progs.EDICT_TO_PROG(p);call(ball,ball.v.use);return ball;}
function step(ball,dt){sv.time+=dt;progs.pr_global_struct.time=sv.time;SV_SetFrametime(dt);SV_Physics_Pusher(ball);}

for(const enhanced of[false,true])Deno.test(`${enhanced?'Newer Game':'Classic'}: the ball flies its lap through Shub, smoothly, ${enhanced?'without stopping at its corners':'with stock Quake\'s 0.1 s at each corner'}`,()=>{
 const p=endLevel(enhanced),ball=start(p),shub=find('monster_oldone')[0];check(shub,'Shub-Niggurath');
 const dt=1/72,speed=ball.v.speed||100;let last=Array.from(ball.v.origin),worst=0,still=0,through=false,moved=0;const turn0=Array.from(ball.v.angles);
 let fastest=0,turnedFlying=0,turnedStill=0;for(let k=0;k<72*24;k++){const a0=Array.from(ball.v.angles),o0=Array.from(ball.v.origin);step(ball,dt);const turned=Math.hypot(...[0,1,2].map(i=>ball.v.angles[i]-a0[i]))>1e-6;if(Math.hypot(...[0,1,2].map(i=>ball.v.origin[i]-o0[i]))>.5){if(turned)turnedFlying++;}else if(turned)turnedStill++;fastest=Math.max(fastest,Math.hypot(...ball.v.velocity));const o=Array.from(ball.v.origin),d=Math.hypot(o[0]-last[0],o[1]-last[1],o[2]-last[2]);worst=Math.max(worst,d);if(d<1e-6&&k>2)still++;moved+=d;if(inside(o,shub))through=true;last=o;}
 check(moved>3000,`it flew its lap (${moved.toFixed(0)} units)`);
 check(fastest>=speed*.99&&fastest<=210,`it flies at its own speed (${fastest.toFixed(0)} units/s)`);
 check(worst<=fastest*dt*1.05+.01,`no jumps: at most its speed's ${(fastest*dt).toFixed(2)} units a frame (${worst.toFixed(2)})`);
 check(through,'it passed through Shub');
 if(enhanced)check(turnedFlying>72*20,`Newer Game: it spins as it flies (${turnedFlying} frames)`);else{same(turnedFlying,0,'Classic: as WinQuake, the ball is not turned as it flies');same(turnedStill,0,'nor at its corner stops');}
 if(enhanced)same(still,0,'Newer Game: never still');else check(still>=6*19*.8,`Classic: stock pauses at the corners (${still} still frames)`);
});

for(const enhanced of[false,true])Deno.test(`${enhanced?'Newer Game':'Classic'}: stepping into the final teleporter while the ball is inside Shub telefrags him`,()=>{
 const p=endLevel(enhanced),ball=start(p),shub=find('monster_oldone')[0];
 const tele=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='trigger_teleport'&&text(e.v.target)===text(ball.v.targetname));check(tele,'the final teleporter targets the ball');
 const dt=1/72;let k=0;for(;k<72*30&&!inside(Array.from(ball.v.origin),shub);k++)step(ball,dt);
 check(inside(Array.from(ball.v.origin),shub),'the ball reached Shub');
 const before=shub.v.health;p.v.health=100;p.v.takedamage=2;
 progs.pr_global_struct.self=progs.EDICT_TO_PROG(tele);progs.pr_global_struct.other=progs.EDICT_TO_PROG(p);progs.pr_global_struct.time=sv.time;PR_ExecuteProgram(tele.v.touch);
 SV_SetPlayer(p);SV_SetFrametime(.05);for(let f=0;f<6;f++){sv.time+=.05;progs.pr_global_struct.time=sv.time;SV_Physics();}
 check(before>1000&&(shub.free||shub.v.health<=0||shub.v.deadflag),`Shub-Niggurath is telefragged (health ${before} -> ${shub.free?'gone':shub.v.health})`);
});

Deno.test('Newer Game: the deathmatch exit floating over Shub\'s arena is not made a walk-through doorway (it showed the start level on the wall)',()=>{
 endLevel(true);
 const crossings=travel.SV_SeamlessCrossings();
 const floating=crossings.filter(c=>c.exit.mins[2]>600);
 same(floating.length,0,'no crossing for the exit 447 units above the floor');
 check(crossings.some(c=>c.map==='start'),'the real exit to the start level (the slipgate window) is still a crossing');
});

Deno.test('Newer Game: only the teleport ball loses its corner stops; an ordinary train keeps them',()=>{
 const p=endLevel(true),ball=find('misc_teleporttrain')[0];ball.v.classname=ED_NewString('func_train');start(p);
 let last=Array.from(ball.v.origin),still=0;for(let k=0;k<72*12;k++){step(ball,1/72);const o=Array.from(ball.v.origin);if(k>2&&Math.hypot(o[0]-last[0],o[1]-last[1],o[2]-last[2])<1e-6)still++;last=o;}
 check(still>=6*5,`a func_train with the same path still stops at its corners (${still} still frames)`);
});

Deno.test('Newer Game, but a multiplayer host: the ball keeps its corner stops (the gameplay rule is local single player only)',()=>{
 const p=endLevel(true),ball=start(p);svs.maxclients=2;
 try{let last=Array.from(ball.v.origin),still=0;for(let k=0;k<72*12;k++){step(ball,1/72);const o=Array.from(ball.v.origin);if(k>2&&Math.hypot(o[0]-last[0],o[1]-last[1],o[2]-last[2])<1e-6)still++;last=o;}
  check(still>=6*5,`stock corner stops (${still} still frames)`);}finally{svs.maxclients=1;}
});
