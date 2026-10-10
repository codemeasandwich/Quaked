// Melee hits on the player bleed but throw nothing of the player (card [K1], owner 9 Oct 2026). Real QuakeC melee attackers on stock
// E1M5: the ogre's chainsaw and the shambler's ShamClaw (which throw a chunk in Quake), the knight's ai_melee (which never did);
// the real T_Damage and SpawnMeatSpray. Classic keeps Quake's.
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

import { SV_TestEntityPosition } from '../src/engine/server/world.js';
import { meleeStats, BLOOD } from '../src/newer/gameplay/sv_meleespray.js';
const gibs=()=>sv.edicts.filter(e=>e&&!e.free&&text(e.v.model)==='progs/zom_gib.mdl').length;
const monster=(cls)=>{const m=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)===cls&&e.v.health>0);check(m,'a '+cls+' in E1M5');return m;};
// the victim is moved beside the attacker (where the level put it), the attacker faces it with the victim as its enemy, and swings once
function swing(m,victim,fname,side){
 let placed=false;for(const a of [0,90,180,270,45,135,225,315]){const r=a*Math.PI/180;for(const d of [48,56,64]){victim.v.origin=[m.v.origin[0]+Math.cos(r)*d,m.v.origin[1]+Math.sin(r)*d,m.v.origin[2]];SV_LinkEdict(victim,false);if(!SV_TestEntityPosition(victim)){m.v.angles=[0,a,0];placed=true;break;}}if(placed)break;}
 check(placed,'room for the victim');m.v.enemy=progs.EDICT_TO_PROG(victim);
 if(side!==undefined)progs.pr_globals_float[OFS_PARM0]=side;
 const before=gibs(),health=victim.v.health,bled=meleeStats.bled;call(m,fname);return {gibs:gibs()-before,hurt:health-victim.v.health,bled:meleeStats.bled-bled};
}
// a datagram watcher: the blood particles the server sends (svc_particle, colour 73)
function particlesSent(fnRun){const d=sv.datagram;const at=d.cursize;fnRun();const bytes=new Uint8Array(d.data.buffer??d.data,0,d.cursize).slice(at);let n=0;for(let i=0;i<bytes.length;i++)if(bytes[i]===18&&bytes[i+11]===BLOOD.color)n++;return n;}

Deno.test('a melee blow on the player bleeds, hurts as before, and throws no chunk of the player',()=>{
 for(const [cls,fname,side] of [['monster_ogre','chainsaw',1],['monster_shambler','ShamClaw',250]]){
  const p=spawn('e1m5');respawn.sv_respawnguard.value=0;p.v.health=100;p.v.takedamage=2;
  const m=monster(cls);let r;const sent=particlesSent(()=>{r=swing(m,p,fname,side);});
  check(r.hurt>0,cls+': the blow lands ('+r.hurt+' damage)');same(r.gibs,0,cls+': no chunk thrown');same(r.bled,1,cls+': it bleeds instead');check(sent>=1,cls+': blood particles sent ('+sent+')');
  travel.SV_SeamlessReset();
 }
 // the knight's sword never threw anything (stock ai_melee): it still hurts, and still throws nothing
 const p=spawn('e1m5');p.v.health=100;p.v.takedamage=2;const k=swing(monster('monster_knight'),p,'ai_melee');check(k.hurt>0,'knight: the blow lands');same(k.gibs+k.bled,0,'knight: as in Quake, nothing thrown');travel.SV_SeamlessReset();
});

Deno.test('a monster hitting a monster still throws its chunk; Classic keeps Quake\'s chunk off the player',()=>{
 let p=spawn('e1m5');const knight=monster('monster_knight'),ogre=monster('monster_ogre');knight.v.takedamage=2;
 const r=swing(ogre,knight,'chainsaw',1);same(r.gibs,1,'ogre on knight: the chunk flies');same(r.bled,0,'not turned to blood');travel.SV_SeamlessReset();
 p=spawn('e1m5',true,false);p.v.health=100;p.v.takedamage=2;const c=swing(monster('monster_ogre'),p,'chainsaw',1);
 same(c.gibs,1,'Classic: the chunk flies off the player as in Quake');same(c.bled,0,'Classic: no change');travel.SV_SeamlessReset();
});

Deno.test('a death that gibs the player still throws the player\'s pieces',()=>{
 const p=spawn('e1m5');p.v.health=100;p.v.takedamage=2;
 const world=sv.edicts[0],ogre=monster('monster_ogre');progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(ogre);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(ogre);progs.pr_globals_float[OFS_PARM0+9]=500;
 const before=sv.edicts.filter(e=>e&&!e.free&&/^progs\/(gib[123]|h_player)\.mdl$/.test(text(e.v.model))).length;
 call(p,'T_Damage');
 const after=sv.edicts.filter(e=>e&&!e.free&&/^progs\/(gib[123]|h_player)\.mdl$/.test(text(e.v.model))).length;
 check(after>before||p._respawn?.sequence,'the gib death throws pieces ('+before+' -> '+after+')');travel.SV_SeamlessReset();
});
