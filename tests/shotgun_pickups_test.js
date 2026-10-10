// Shotgun pickups (card [12], owner request): the super shotgun pickup twice as wide across, its length unchanged; the basic
// shotgun's death drop distinct (skin 1 of g_shot.mdl, drawn as its own art, role g_shot1). The baked art, the renderer's role
// choice and real death drops on stock E1M1, saved and restored.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/vid.js';
import { Mod_Init } from '../src/gl_model.js';
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
import { R_AnimSetClassicPass } from '../src/r_anim.js';
import { cls, cl, cl_entities, set_cl_numvisedicts, ca_disconnected, ca_connected, ca_dedicated } from '../src/engine/client/client.js';
import * as Q from '../src/engine/common/quakedef.js';
import { R_LevelEntities } from '../src/r_levelents.js';
import { NET_Init, NET_Close } from '../src/engine/net/net_main.js';
import { Loop_Connect, Loop_CheckNewConnections } from '../src/engine/net/net_loop.js';
import { V_Init, V_CalcRefdef } from '../src/engine/client/view.js';
import * as render from '../src/gl_rmain.js';
import { r_refdef, entity_t } from '../src/render.js';
import { R_DrawAliasModel } from '../src/gl_mesh.js';
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

import { SV_RespawnDropInventory, SV_RespawnRestoreDropModel } from '../src/newer/gameplay/sv_respawn.js';
import { RESPAWN_WEAPONS } from '../src/newer/gameplay/respawn_record.js';
const box=key=>{const p=JSON.parse(readFileSync(new URL('../newer/weapons/'+key+'.json',import.meta.url),'utf8')).poses[0];const lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];for(let i=0;i<p.length;i+=3)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],p[i+a]);hi[a]=Math.max(hi[a],p[i+a]);}return {lo,hi};};
const manifest=JSON.parse(readFileSync(new URL('../newer/weapons/index.json',import.meta.url),'utf8'));

Deno.test('the super shotgun pickup is twice as wide across its barrels and as long as before; the basic shotgun pickup is its own art in the native box',()=>{
 const ssg=box('g_shot'),native=manifest.models.g_shot,shot=box('g_shot1');
 near(ssg.hi[0]-ssg.lo[0],native.nativeMax[0]-native.nativeMin[0],'length unchanged',.01);
 near(ssg.hi[1]-ssg.lo[1],2*(native.nativeMax[1]-native.nativeMin[1]),'twice as wide across (the native Y axis)',.01);
 near(ssg.hi[2]-ssg.lo[2],native.nativeMax[2]-native.nativeMin[2],'height unchanged',.01);
 same(native.transverseScale,2,'recorded in the manifest');
 same(manifest.models.g_shot1.source,'shotgun','the basic shotgun\'s own art');same(manifest.models.g_shot1.nativeModel,'g_shot','fitted to the pickup MDL');
 for(let a=0;a<3;a++){near(shot.lo[a],native.nativeMin[a],'basic pickup fits the native box (min '+a+')',.01);near(shot.hi[a],native.nativeMax[a],'(max '+a+')',.01);}
 const held=JSON.parse(readFileSync(new URL('../newer/weapons/v_shot.json',import.meta.url),'utf8')),pick=JSON.parse(readFileSync(new URL('../newer/weapons/g_shot1.json',import.meta.url),'utf8'));
 same(pick.poses[0].length,held.poses[0].length,'every vertex of the held art');same(pick.uv.length,held.uv.length,'its UVs');same(pick.indices.length,held.indices.length,'its triangles');
});

Deno.test('a death drops the basic shotgun as skin 1 and the super shotgun as skin 0, and a restored save keeps them so',()=>{
 const p=spawn('e1m1');p.v.items=Q.IT_SHOTGUN|Q.IT_SUPER_SHOTGUN|Q.IT_AXE;p.v.ammo_shells=40;
 const drops=SV_RespawnDropInventory(p),byWeapon=w=>drops.find(e=>e._respawnDrop.weapon===w);
 const shot=byWeapon(Q.IT_SHOTGUN),ssg=byWeapon(Q.IT_SUPER_SHOTGUN);check(shot&&ssg,'both weapons dropped');
 same(text(shot.v.model),'progs/g_shot.mdl','the basic shotgun drop is the pickup MDL');same(shot.v.skin,1,'as skin 1');same(ssg.v.skin,0,'the super shotgun as skin 0');
 same(shot._respawnDrop.amount+ssg._respawnDrop.amount,40,'the shells are shared between them, none lost');
 shot.v.skin=0;ssg.v.skin=5;SV_RespawnRestoreDropModel(shot);SV_RespawnRestoreDropModel(ssg);same(shot.v.skin,1,'restored: skin 1');same(ssg.v.skin,0,'restored: skin 0');
 same(RESPAWN_WEAPONS.filter(w=>w.skin).length,1,'only the basic shotgun drop uses another skin');
 travel.SV_SeamlessReset();
});

Deno.test('the renderer draws skin 1 of g_shot.mdl as the basic shotgun role and skin 0 as the super shotgun',async()=>{
 const weapons=await import('../src/r_weapons.js');
 same(weapons.R_WeaponRole('progs/g_shot.mdl',0),'g_shot','skin 0: the super shotgun');
 same(weapons.R_WeaponRole('progs/g_shot.mdl',1),'g_shot1','skin 1: the basic shotgun');
 same(weapons.R_WeaponRole('progs/g_nail.mdl',1),'g_nail','other pickups ignore the skin');
 same(weapons.R_WeaponRole('progs/v_shot.mdl',0),'v_shot','held models as before');
 check(manifest.models[weapons.R_WeaponRole('progs/g_shot.mdl',1)],'the role is in the manifest (so it is preloaded and drawn)');
});
