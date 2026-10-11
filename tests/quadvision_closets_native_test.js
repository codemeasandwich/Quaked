// Quad's through-wall vision reveals the monsters in the level, not those waiting in monster closets (owner request,
// 11 Oct 2026, card [QV1]). Real maps and progs, real edicts moved by the real SV_Physics; the expectations are fixtures
// checked by hand against each map's geometry and entities (and, for the registered maps, a reviewer's independent
// flood), not the rule's own idea of a closet.
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


import { QuadVisionEnemies } from '../src/newer/render/r_quadvision.js';
import { QuadVisionRegion, QuadVisionRegionReset } from '../src/newer/render/quadvision_region.js';
const monsters=()=>sv.edicts.filter(e=>e&&!e.free&&(e.v.flags&FL_MONSTER)&&e.v.health>0);
const by=(m,o,r=48)=>Math.hypot(m.v.origin[0]-o[0],m.v.origin[1]-o[1],m.v.origin[2]-o[2])<=r;
const around=(o,r)=>monsters().filter(m=>by(m,o,r));
function level(map,sk=2){const p=spawn(map);vars.Cvar_SetValue('skill',sk);if(sk!==2){sv.active=false;SV_SpawnServer(map);const q=svs.clients[0].edict;call(q,progs.pr_global_struct.SetNewParms);call(q,progs.pr_global_struct.ClientConnect);call(q,progs.pr_global_struct.PutClientInServer);}
 const pl=svs.clients[0].edict;pl.v.flags|=128;/* notarget: the monsters stay where the level put them */QuadVisionRegionReset();return pl;}
function frames(pl,seconds,dt=.1){SV_SetPlayer(pl);SV_SetFrametime(dt);for(let i=0;i<seconds/dt;i++){SZ_Clear(sv.datagram);SZ_Clear(svs.clients[0].message);sv.time+=0;SV_Physics();}}
const ask=()=>QuadVisionRegion(sv,Infinity);

Deno.test('e1m2 at Hard: exactly the four monsters waiting in its two teleport closets are hidden; all 38 in the level are revealed',async()=>{
 level('e1m2');const inLevel=ask(),all=monsters();
 const closet=[...around([1912,-856,217],8),...around([1912,-936,217],8),...around([32,840,359],8),...around([-192,840,359],8)];
 same(closet.length,4,'the closet monsters (two scrags, two fiends)');
 for(const m of all)same(inLevel(m),!closet.includes(m),`${text(m.v.classname)} at ${Array.from(m.v.origin).map(Math.round)}`);
 same(QuadVisionEnemies(sv).filter(m=>closet.includes(m)).length,0,'the public selection picks none of them');
});

// e1m3 at Hard: its sewers' narrow passages and the grid's own alignment once hid most of the level (the zombies at
// -848,-928 among them). Hidden are exactly its four teleport-closet monsters and a scrag (t148) waiting in a space no
// player-sized body can enter, which an 8-unit flood confirms
Deno.test('e1m3 at Hard: only the five closet monsters are hidden; the zombies down its narrow passages are revealed',()=>{
 level('e1m3');const inLevel=ask(),hidden=monsters().filter(m=>!inLevel(m));
 const expected=[[-528,-304,-64],[-1224,272,-64],[1496,1272,560],[1392,1272,560],[1288,1288,560]];
 same(hidden.length,5,`hidden: ${hidden.map(m=>text(m.v.classname)+'@'+Array.from(m.v.origin).map(Math.round)).join(' ')}`);
 for(const o of expected)check(hidden.some(m=>by(m,o,24)),`${o} is hidden`);
 for(const m of around([-848,-928,-8],80))check(inLevel(m),'a zombie down the narrow passage is revealed');
});

Deno.test('e1m4 at Hard: a walk-in closet (an ogre whose only way out is an always-on teleporter) and scrags pacing in their closets stay hidden for 30 s of play',()=>{
 const pl=level('e1m4');const ogre=around([1794,224,912],24)[0],scrags=[...around([1632,1496,960],40),...around([96,864,968],40)];
 check(ogre&&scrags.length===2,'the walk-in ogre and the two pacing scrags');
 const start=scrags.map(s=>Array.from(s.v.origin));let moved=0;
 for(let t=0;t<30;t+=.5){frames(pl,.5);const inLevel=ask();
  for(const m of[ogre,...scrags])check(!inLevel(m),`${text(m.v.classname)} at ${Array.from(m.v.origin).map(Math.round)} after ${t+.5} s: hidden`);}
 scrags.forEach((s,i)=>{moved=Math.max(moved,Math.hypot(...[0,1,2].map(k=>s.v.origin[k]-start[i][k])));});
 check(moved>16,`(a scrag did pace about its closet: ${moved.toFixed(0)} units)`);
 check(monsters().filter(m=>ask()(m)).length>=40,'most of e1m4 is revealed');
});

Deno.test('e1m2: a closet emptied by the level\'s own button reveals its monsters once they are in the level',()=>{
 const pl=level('e1m2');const scrag=around([1912,-856,217],8)[0];check(scrag&&!ask()(scrag),'waiting: hidden');
 // the button that sends them (its target is the closet teleporter's name), pressed by the player's touch
 const tele=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='trigger_teleport'&&[0,1,2].every(k=>scrag.v.origin[k]>=e.v.absmin[k]-16&&scrag.v.origin[k]<=e.v.absmax[k]+16));
 const button=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='func_button'&&text(e.v.target)===text(tele.v.targetname));check(button,'the level\'s button for that closet');
 pl.v.flags&=~128;const act=progs.pr_globaldefs.find(d=>text(d.s_name)==='activator');if(act)progs.pr_globals_int[act.ofs]=progs.EDICT_TO_PROG(pl);progs.pr_global_struct.self=progs.EDICT_TO_PROG(button);progs.pr_global_struct.other=progs.EDICT_TO_PROG(pl);progs.pr_global_struct.time=sv.time;PR_ExecuteProgram(button.v.touch||button.v.use);
 const before=Array.from(scrag.v.origin);for(let k=0;k<20&&by(scrag,before,8);k++)frames(pl,.1);
 check(!by(scrag,before,64),`the scrag was sent into the level (${Array.from(scrag.v.origin).map(Math.round)})`);
 check(ask()(scrag),'now in the level: revealed');
});

Deno.test('while the flood is under way nothing in a closet is ever revealed, and the level fills in',()=>{
 level('e1m2');const closet=[...around([1912,-856,217],8),...around([32,840,359],8)];let steps=0,shown=0;
 for(;steps<500;steps++){const inLevel=QuadVisionRegion(sv,.2);for(const m of closet)check(!inLevel(m),'a closet monster mid-flood');shown=monsters().filter(m=>inLevel(m)).length;if(shown===38)break;}
 same(shown,38,'the level filled in');check(steps>2,`(it took ${steps} small steps)`);
});

let registered=false;
function regLevel(map){if(!registered){const big=readFileSync(new URL('../resources/id1/pak0.pak',import.meta.url));pak.COM_AddPack(pak.COM_LoadPackFile('pak0r.pak',big.buffer.slice(big.byteOffset,big.byteOffset+big.length)));pak.COM_AddPack(pak.COM_LoadPackFile('pak0.pak',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)));registered=true;}
 svs.maxclients=1;svs.clients=[new client_t()];SZ_Alloc(svs.clients[0].message,32768);cls.state=ca_disconnected;cls.demoplayback=false;vars.Cvar_SetValue('r_hdr',1);vars.Cvar_SetValue('skill',2);sv.active=false;SV_SpawnServer(map);
 const p=svs.clients[0].edict;call(p,progs.pr_global_struct.SetNewParms);call(p,progs.pr_global_struct.ClientConnect);call(p,progs.pr_global_struct.PutClientInServer);QuadVisionRegionReset();return p;}

Deno.test('registered game (local pak, stock progs as the browser runs it): end.bsp\'s teleport-closet row hidden, the shambler guarding Shub revealed',()=>{
 regLevel('end');let inLevel=ask();
 const guard=around([-688,1808,72],24)[0];check(guard,'the arena shambler');check(inLevel(guard),'the shambler in Shub\'s arena is revealed (a large teleporter that only works after Shub dies covers it)');
 const closet=monsters().filter(m=>m.v.origin[1]>=800&&m.v.origin[1]<=1050&&m.v.origin[0]<=-900&&m.v.origin[2]<100);
 // (with the stock progs the browser runs over the registered maps, the row holds its six shamblers; the vores spawn
 // only with the registered progs, which a one-off check also found hidden)
 check(closet.length>=6,`the closet row (${closet.length})`);for(const m of closet)check(!inLevel(m),'a closet monster');

});
