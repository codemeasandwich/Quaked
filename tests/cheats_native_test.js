// Options > Cheats power-ups (owner request, 9 Oct 2026): the Ring, the Quad and the Pentagram as switches that stay on until
// switched off, and all weapons, applied at once so the game under the menu shows them. Real QuakeC, real server, the real
// client update path; no physics runs where the test says the game is held by the menu.
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
import { r_hdr } from '../src/gl_post.js';
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
import { Respawn_Sample } from '../src/respawn_motion.js';
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

import * as cheats from '../src/newer/gameplay/sv_cheats.js';
const P=Q;
const time=t=>{sv.time=t;progs.pr_global_struct.time=t;};
// the client's picture of the player, through the real update the server sends every frame (also while a menu holds the game)
function clientItems(p){SV_SetPlayer(p);const packet=new sizebuf_t();SZ_Alloc(packet,4096);SV_WriteClientdataToMessage(p,packet);COM_SetNetMessage(packet);CL_ParseServerMessage();return cl.items;}
// server frames with the game running: physics, then the cheat frame, as the host does
function play(p,seconds){SV_SetPlayer(p);SV_SetFrametime(.1);for(let i=0;i<seconds*10;i++){SV_Physics();cheats.SV_CheatsFrame();}}
function fresh(){respawn.sv_respawnguard.value=0;const p=spawn('e1m2');vars.Cvar_SetValue('skill',1);cl.viewentity=1;cl.maxclients=1;p.v.health=100;return p;}
const cmd=c=>{Cmd_ExecuteString(c,src_command);};
for(const name of['deathmatch','coop'])if(!vars.Cvar_FindVar(name))vars.Cvar_RegisterVariable(new vars.cvar_t(name,'0'));
cheats.SV_CheatsInit();

Deno.test('switching a power on gives the real power-up at once: the item, its timer, its glow, and the client sees it with the game held',()=>{
 const p=fresh();for(const [name,bit,timer] of [['ring',P.IT_INVISIBILITY,'invisible_finished'],['quad',P.IT_QUAD,'super_damage_finished'],['pentagram',P.IT_INVULNERABILITY,'invincible_finished']]){
  same((p.v.items&bit)!==0,false,name+' starts off');cmd('cheat_power '+name);
  check(p.v.items&bit,name+': the item');check(field(p,timer)>sv.time+20,name+': its timer runs well ahead');check(cheats.SV_CheatPowerOn(name,p),name+': the switch is on');
  check(clientItems(p)&bit,name+': the next client update carries it, with no physics run (the menu holds the game)');
 }
 check(p.v.effects&8,'the Quad and the Pentagram glow at once');
});

Deno.test('a switched-on power never runs out or warns, through a minute of real play; switching it off removes it at once',()=>{
 const p=fresh();cmd('cheat_power ring');cmd('cheat_power quad');const start=sv.time;let least=1e9;
 SV_SetPlayer(p);SV_SetFrametime(.1);for(let i=0;i<600;i++){SV_Physics();cheats.SV_CheatsFrame();least=Math.min(least,field(p,'invisible_finished')-sv.time,field(p,'super_damage_finished')-sv.time);}
 check(sv.time-start>59,'a minute of server time ran');check(p.v.items&P.IT_INVISIBILITY&&p.v.items&P.IT_QUAD,'both are still on');check(least>3,'the timers never came within the running-out warning ('+least.toFixed(1)+' s)');
 same(text(sv.model_precache[p.v.modelindex]||'')||sv.model_precache[p.v.modelindex],'progs/eyes.mdl','the game itself shows the Ring (the eyes)');
 cmd('cheat_power ring');same(p.v.items&P.IT_INVISIBILITY,0,'off: the item goes at once');same(field(p,'invisible_finished'),0,'and its timer');same(sv.model_precache[p.v.modelindex],'progs/player.mdl','the player model is back at once');same(clientItems(p)&P.IT_INVISIBILITY,0,'the client sees it gone with the game held');
 play(p,5);same(p.v.items&P.IT_INVISIBILITY,0,'and it stays off');check(p.v.items&P.IT_QUAD,'the Quad is untouched');
 cmd('cheat_power quad');same(p.v.items&P.IT_QUAD,0,'the Quad off');same(p.v.effects&8,0,'its glow off');
});

Deno.test('the Pentagram stops damage while it is on, the game\'s own rule; off, damage lands again',()=>{
 const p=fresh();const world=sv.edicts[0];const hurt=amount=>{progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(world);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(world);progs.pr_globals_float[OFS_PARM0+9]=amount;call(p,'T_Damage');};
 cmd('cheat_power pentagram');hurt(500);same(p.v.health,100,'no damage under the Pentagram');cmd('cheat_power pentagram');hurt(30);check(p.v.health<100,'damage lands once it is off ('+p.v.health+')');
});

Deno.test('the switches are kept in a saved game and survive a death: the powers come back once the respawn finishes',()=>{
 let p=fresh();cmd('cheat_power quad');const lines=[];ED_Write(lines,p);const saved=lines.join('\n');check(saved.includes('"_cheat_powers" "2"'),'saved with the player');
 p._cheatPowers=0;p.v.items&=~P.IT_QUAD;ED_ParseEdict(saved.slice(saved.indexOf('{')+1),p);check(cheats.SV_CheatPowerOn('quad',p),'loaded back');cheats.SV_CheatsFrame();check(p.v.items&P.IT_QUAD,'and applied');
 for(const bad of ['"_cheat_powers" "x"','"_cheat_powers" "99"']){const q=saved.replace('"_cheat_powers" "2"',bad);ED_ParseEdict(q.slice(q.indexOf('{')+1),p);same(p._cheatPowers,0,'a malformed switch value is refused: '+bad);}
 p._cheatPowers=2;inventory(p);kill(p);same(p.v.items&P.IT_QUAD,0,'a death clears the power-ups as usual');cheats.SV_CheatsFrame();same(p.v.items&P.IT_QUAD,0,'not during the death');finish(p);cheats.SV_CheatsFrame();check(p.v.items&P.IT_QUAD,'back once the respawn has finished');
});

Deno.test('all weapons arrive at once; nothing works outside a single-player game',()=>{
 const p=fresh();p.v.items=Q.IT_AXE|Q.IT_SHOTGUN;cmd('cheat_weapons');check((p.v.items&127)===127,'every weapon at once');check(p.v.ammo_rockets>0&&p.v.ammo_cells>0,'and ammunition');check(clientItems(p)&Q.IT_ROCKET_LAUNCHER,'the client sees it with the game held');
 for(const [label,setup,undo] of [['multiplayer',()=>{svs.maxclients=2;},()=>{svs.maxclients=1;}],['deathmatch',()=>vars.Cvar_SetValue('deathmatch',1),()=>vars.Cvar_SetValue('deathmatch',0)]]){
  setup();const before=p.v.items;cmd('cheat_power ring');cmd('cheat_weapons');same(p.v.items,before,label+': nothing changes');same(p._cheatPowers|0,0,label+': no switch set');undo();
 }
});
