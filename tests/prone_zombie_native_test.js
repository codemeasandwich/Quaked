// A knocked-down zombie can be finished off (card [40]). Real QuakeC zombies on stock E1M3: knocked down by the game's own
// zombie_pain, its own paine frames run, real traces, T_Damage, T_RadiusDamage and zombie_die. Classic keeps Quake's.
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

import * as prone from '../src/newer/gameplay/sv_pronezombie.js';
import { SV_TestEntityPosition } from '../src/engine/server/world.js';
const zombies=()=>sv.edicts.filter(e=>e&&!e.free&&text(e.v.classname)==='monster_zombie'&&e.v.health>0&&!(e.v.spawnflags&1));
const heads=()=>sv.edicts.filter(e=>e&&!e.free&&text(e.v.model)==='progs/h_zombie.mdl').length;
function damage(target,attacker,amount){progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(target);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(attacker);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(attacker);progs.pr_globals_float[OFS_PARM0+9]=amount;call(target,'T_Damage');}
// run a monster's own thinks up to `time`, as SV_RunThink does
function think(e,time){for(let n=0;n<200&&!e.free&&e.v.nextthink>0&&e.v.nextthink<=time;n++){sv.time=Math.max(sv.time,e.v.nextthink);const t=e.v.think;e.v.nextthink=0;call(e,t);}sv.time=time;}
// knock it down with a 30-point hit and run its fall to the ground (paine1..10 is ten frames at 0.1 s)
function knockDown(p,z){damage(z,p,30);think(z,sv.time+1.05);}
function trace(from,to,ignore){return SV_Move(from,[0,0,0],[0,0,0],to,0,ignore);}

Deno.test('a knocked-down zombie lies there hittable (a low box a player steps over), and a big enough blow gibs it, once',()=>{
 const p=spawn('e1m3');respawn.sv_respawnguard.value=0;const z=zombies()[0];sv.time=10;
 knockDown(p,z);same(z.v.solid,prone.SOLID_BBOX,'lying hittable');same(z.v.maxs[2],prone.PRONE.maxs[2],'low');check(z.v.maxs[2]-z.v.mins[2]<18,'low enough to step over');same(z.v.health,60,'its health is the game\'s 60');
 // a shot from above it hits it
 const tr=trace([z.v.origin[0],z.v.origin[1],z.v.origin[2]+80],[z.v.origin[0],z.v.origin[1],z.v.origin[2]-40],p);same(tr.ent,z,'a shot down at it hits it');
 // a small hit: the game's own rule, health back to 60, still down
 damage(z,p,20);same(z.v.health,60,'a small hit does nothing');same(z.v.solid,prone.SOLID_BBOX,'still down');
 // a rocket's worth: the game's own death, head and gibs, one kill
 const kills=progs.pr_global_struct.killed_monsters,h=heads();damage(z,p,110);
 same(heads()-h,1,'its head flies');same(progs.pr_global_struct.killed_monsters-kills,1,'one kill counted');same(text(z.v.model),'progs/h_zombie.mdl','it is the head now');
 think(z,sv.time+10);same(text(z.v.model),'progs/h_zombie.mdl','nothing gets up');same(progs.pr_global_struct.killed_monsters-kills,1,'still one kill');
 travel.SV_SeamlessReset();
});

Deno.test('a blast reaches a lying zombie (T_RadiusDamage), which it never did',()=>{
 const p=spawn('e1m3');const z=zombies()[1];sv.time=10;knockDown(p,z);
 const h=heads(),bomb=ED_Alloc();bomb.v.origin=[z.v.origin[0]+20,z.v.origin[1],z.v.origin[2]];progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(bomb);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(p);progs.pr_globals_float[OFS_PARM0+6]=120;progs.pr_globals_int[OFS_PARM0+9]=0;call(bomb,'T_RadiusDamage');
 check(heads()-h>=1&&text(z.v.model)==='progs/h_zombie.mdl','the blast gibs it (and any zombie standing near enough, as always)');ED_Free(bomb);travel.SV_SeamlessReset();
});

Deno.test('left alone it gets up on time, standing as the game made it; if something is on it, it stays down and hittable',()=>{
 const p=spawn('e1m3');const z=zombies()[2];sv.time=10;knockDown(p,z);
 think(z,sv.time+5.4);check(z.v.solid!==prone.SOLID_BBOX&&z.v.maxs[2]===prone.STAND.maxs[2],'it stood up with its own box (solid '+z.v.solid+', maxs '+z.v.maxs[2]+')');
 // the player standing on top of it (not in it), on a zombie with room above it: the game's own stand-up test fails, it lies down
 // again, still hittable
 const top=e=>[e.v.origin[0],e.v.origin[1],e.v.origin[2]+prone.PRONE.maxs[2]-p.v.mins[2]+.1];p.v.solid=3;
 let q=null;for(const e of zombies().slice(3,12)){p.v.origin=[0,0,-4096];SV_LinkEdict(p,false);knockDown(p,e);p.v.origin=top(e);SV_LinkEdict(p,false);if(!SV_TestEntityPosition(p)){q=e;break;}}check(q,'a zombie with room above it');
 p.v.origin=top(q);SV_LinkEdict(p,false);check(!SV_TestEntityPosition(p),'the player stands on it, not in it');
 think(q,sv.time+5.4);same(q.v.solid,prone.SOLID_BBOX,'blocked: down again and hittable');same(q.v.maxs[2],prone.PRONE.maxs[2],'low again');check(!SV_TestEntityPosition(p),'and the player is still free');
 travel.SV_SeamlessReset();
});

Deno.test('saved while down: the save holds the lying box (solid and size are the game\'s own fields); Classic keeps Quake\'s untouchable zombie',()=>{
 const p=spawn('e1m3');const z=zombies()[4];sv.time=10;knockDown(p,z);
 const lines=[];ED_Write(lines,z);const text0=lines.join('\n');check(/"solid" "2"/.test(text0)&&/"maxs" "16 16 -12"/.test(text0),'the save has the lying box');
 const c=spawn('e1m3',true,false);const y=zombies()[0];sv.time=10;knockDown(c,y);same(y.v.solid,prone.SOLID_NOT,'Classic: SOLID_NOT as in Quake');
 travel.SV_SeamlessReset();
});

Deno.test('a rocket aimed near a lying zombie is aimed at what lies there, not over it at its standing height',()=>{
 const p=spawn('e1m3');const z=zombies()[5];sv.time=10;knockDown(p,z);
 // the player 140 units off, looking at the zombie's standing origin (the autoaim cone takes it from there)
 let placed=false;for(const a of [0,90,180,270]){const r=a*Math.PI/180,o=z.v.origin;p.v.origin=[o[0]+Math.cos(r)*140,o[1]+Math.sin(r)*140,o[2]+24];p.v.solid=3;SV_LinkEdict(p,false);if(SV_TestEntityPosition(p))continue;
  const sight=SV_Move([p.v.origin[0],p.v.origin[1],p.v.origin[2]+16],[0,0,0],[0,0,0],[o[0],o[1],o[2]-18],0,p);if(sight.fraction<.97&&sight.ent!==z)continue;placed=true;break;}
 check(placed,'room to shoot from');
 const d=[0,1,2].map(a=>z.v.origin[a]-p.v.origin[a]),yaw=Math.atan2(d[1],d[0])*180/Math.PI,pitch=-Math.atan2(d[2]-16,Math.hypot(d[0],d[1]))*180/Math.PI;
 p.v.v_angle=[pitch,yaw,0];p.v.ammo_rockets=10;
 const before=sv.edicts.filter(e=>e&&!e.free&&text(e.v.classname)==='missile');call(p,'W_FireRocket');
 const m=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='missile'&&!before.includes(e));check(m,'a rocket');
 // where its line passes the zombie: within the lying box's height
 const v=m.v.velocity,s=m.v.origin,t=((z.v.origin[0]-s[0])*v[0]+(z.v.origin[1]-s[1])*v[1])/(v[0]*v[0]+v[1]*v[1]),zAt=s[2]+v[2]*t;
 check(zAt>z.v.absmin[2]-1&&zAt<z.v.absmax[2]+1,'the rocket passes through the lying zombie ('+zAt.toFixed(1)+' in '+z.v.absmin[2]+'..'+z.v.absmax[2]+')');
 travel.SV_SeamlessReset();
});

// (review cases)
Deno.test('hit while down by someone not its enemy, it turns on them but stays down and stands on its own time, with its standing box',()=>{
 const p=spawn('e1m3');const z=zombies()[6],ogre=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='monster_ogre'&&e.v.health>0);sv.time=10;
 damage(z,ogre,30);think(z,sv.time+1.05);same(z.v.solid,prone.SOLID_BBOX,'down');same(progs.PROG_TO_EDICT(z.v.enemy),ogre,'its enemy is the ogre');
 damage(z,p,10);same(progs.PROG_TO_EDICT(z.v.enemy),p,'it turns on the player');same(z.v.solid,prone.SOLID_BBOX,'but stays down');check(text(progs.pr_functions[z.v.think]?.s_name??0)!=='zombie_run1','and does not start running');
 think(z,sv.time+5.4);same(z.v.maxs[2],prone.STAND.maxs[2],'it stood up with its standing box');same(z.v.solid,prone.SOLID_SLIDEBOX,'solid as a standing monster');
 travel.SV_SeamlessReset();
});
Deno.test('a zombie lying in a Newer save stands up whole in Classic; a lying box is never made around a player',()=>{
 let p=spawn('e1m3');let z=zombies()[7];sv.time=10;knockDown(p,z);same(z.v.solid,prone.SOLID_BBOX,'down (Newer)');
 vars.Cvar_SetValue('r_hdr',0);think(z,sv.time+5.4);same(z.v.maxs[2],prone.STAND.maxs[2],'Classic: it stood with its standing box');vars.Cvar_SetValue('r_hdr',1);
 travel.SV_SeamlessReset();
 // a zombie down in Quake's own way (Classic), the player standing in it; the Newer stand-up attempt fails because of the player
 p=spawn('e1m3',true,false);z=zombies()[8];sv.time=10;knockDown(p,z);same(z.v.solid,prone.SOLID_NOT,'down as in Quake');
 p.v.origin=Array.from(z.v.origin);p.v.solid=3;SV_LinkEdict(p,false);vars.Cvar_SetValue('r_hdr',1);
 think(z,sv.time+5.4);check(!SV_TestEntityPosition(p),'the player is not shut inside it');same(z.v.solid,prone.SOLID_NOT,'it stays as Quake has it');
 travel.SV_SeamlessReset();
});
