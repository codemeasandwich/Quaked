// Quad's through-wall vision reveals the monsters in the level, not those waiting in monster
// closets (owner request, 11 Oct 2026, card [QV1]). The real e1m2 and its own closets, real edicts, the real
// teleport_use that empties a closet.
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
const fresh=(map='e1m2')=>{const p=spawn(map);QuadVisionRegionReset();return p;};
const cls_=e=>text(e.v.classname),monsters=()=>sv.edicts.filter(e=>e&&!e.free&&(e.v.flags&FL_MONSTER)&&e.v.health>0);
// the closets: the volumes of the level's trigger_teleports that have a targetname (QuakeC teleports monsters out of
// them only when the level's trigger uses them)
const closets=()=>sv.edicts.filter(e=>e&&!e.free&&cls_(e)==='trigger_teleport'&&text(e.v.targetname)!=='');
const inside=(m,t)=>[0,1,2].every(i=>m.v.origin[i]>=t.v.absmin[i]-32&&m.v.origin[i]<=t.v.absmax[i]+32);

Deno.test('the monsters waiting in e1m2\'s sealed closets are not revealed; those in the level are',()=>{
 fresh();const inLevel=QuadVisionRegion(sv),all=monsters(),boxes=closets();
 check(boxes.length>=2,'e1m2 has closet teleporters');
 const waiting=all.filter(m=>boxes.some(t=>inside(m,t))),out=all.filter(m=>!waiting.includes(m));
 check(waiting.length>=2,`monsters wait in the closets (${waiting.length})`);
 for(const m of waiting)check(!inLevel(m),`${cls_(m)} at ${Array.from(m.v.origin).map(Math.round)} in a closet: hidden`);
 const shown=out.filter(m=>inLevel(m));
 same(shown.length,out.length,'every monster outside the closets is in the level');
 // the public selection (alias poses are loaded on demand: require only that no closet monster is chosen)
 for(const m of QuadVisionEnemies(sv))check(!waiting.includes(m),'Quad vision never picks a closet monster');
});

Deno.test('a closet emptied by the level\'s own trigger: its monsters are revealed once they are in the level',()=>{
 const p=fresh();const boxes=closets(),all=monsters();
 const t=boxes.find(b=>all.some(m=>inside(m,b)));const m=all.find(x=>inside(x,t));
 check(!QuadVisionRegion(sv)(m),'waiting: hidden');
 // what the level's trigger does: the teleporter's own use (teleport_use), then the monster touches it
 call(t,t.v.use);progs.pr_global_struct.self=progs.EDICT_TO_PROG(t);progs.pr_global_struct.other=progs.EDICT_TO_PROG(m);progs.pr_global_struct.time=sv.time;PR_ExecuteProgram(t.v.touch);
 check(!inside(m,t),'the monster left the closet through the teleporter');
 check(QuadVisionRegion(sv)(m),'now in the level: revealed');
});

// every shareware map: no monster in the level hidden, no monster in a closet shown (a closet monster: one whose box
// overlaps a closet teleporter, or within 32 units of one). A one-off scan of the registered game's 23 maps (1091
// monsters) gave the same: none hidden in the level, none shown from a closet.
Deno.test('on every shareware map no monster in the level is hidden and none waiting in a closet is shown',()=>{
 const near=(m,t)=>[0,1,2].every(i=>m.v.absmax[i]>=t.v.absmin[i]-32&&m.v.absmin[i]<=t.v.absmax[i]+32);
 for(const map of['e1m1','e1m2','e1m3','e1m4','e1m5','e1m6','e1m7','e1m8']){
  fresh(map);const inLevel=QuadVisionRegion(sv),all=monsters(),boxes=closets(),waiting=all.filter(m=>boxes.some(t=>near(m,t)));
  for(const m of all)same(inLevel(m),!waiting.includes(m),`${map}: ${cls_(m)} at ${Array.from(m.v.origin).map(Math.round)}`);
 }
});

Deno.test('with no server or no box to judge by, every monster counts, as before',()=>{
 same(QuadVisionRegion({})({v:{absmin:[0,0,0],absmax:[1,1,1]}}),true,'no edict list');
 fresh();same(QuadVisionRegion(sv)({v:{}}),true,'an edict without a box');
});
