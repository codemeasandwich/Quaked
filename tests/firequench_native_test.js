// Fire goes out in water (owner request, 11 Oct 2026, card [FB3]): in Newer Game a flying fireball (progs/k_spike.mdl,
// the Death Knight's shot; progs/lavaball.mdl) that enters water or slime is removed at the surface with a small burst
// (TE_KNIGHTSPIKE at the surface point) and the splash sound; Classic, other missiles and lava keep Quake's rules.
// The real server: a shareware map's own water and lava, real edicts moved by the real SV_Physics_Toss.
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


import { SV_PointContents } from '../src/engine/server/world.js';
import { FIRE_QUENCH, SV_FireQuench } from '../src/newer/gameplay/sv_firequench.js';
const WATER=-3,SLIME=-4,LAVA=-5,EMPTY=-1;
// a point of the map's own liquid `kind` with open air straight above it: [ inside, surface z, a point 64 units above ]
function pool(kind){for(const leaf of sv.worldmodel.leafs){if(leaf.contents!==kind)continue;const c=[0,1,2].map(i=>(leaf.minmaxs[i]+leaf.minmaxs[i+3])/2);
 if(SV_PointContents(c)!==kind)continue;let z=c[2];while(SV_PointContents([c[0],c[1],z+1])===kind&&z<c[2]+512)z++;const above=[c[0],c[1],z+64];
 let open=true;for(let k=z+1;k<=above[2];k+=4)if(SV_PointContents([c[0],c[1],k])!==EMPTY)open=false;if(open)return{inside:c,surface:z,above};}return null;}
// a missile edict of `model`, flying at `velocity` from `origin` (what QuakeC launch_spike makes: FLYMISSILE, a point box)
function missile(model,origin,velocity){const e=ED_Alloc();e.v.model=ED_NewString(model);e.v.classname=ED_NewString('test_missile');e.v.movetype=Q.MOVETYPE_FLYMISSILE??9;e.v.solid=2;
 e.v.origin=[...origin];e.v.velocity=[...velocity];e.v.mins=[0,0,0];e.v.maxs=[0,0,0];e.v.nextthink=sv.time+10;SV_LinkEdict(e,false);return e;}
function fly(e,seconds){SV_SetFrametime(.02);for(let t=0;t<seconds&&!e.free;t+=.02){sv.time+=.02;progs.pr_global_struct.time=sv.time;SV_Physics_Toss(e);}}
// the temp entities and sounds the server broadcast since the datagram was cleared
function broadcast(){const out=[],d=sv.datagram;const b=new Uint8Array(d.data.buffer??d.data,0,d.cursize);
 for(let i=0;i<b.length;){const cmd=b[i];if(cmd===23){const type=b[i+1];const v=new DataView(b.buffer,b.byteOffset+i+2,6);out.push({te:type,at:[0,1,2].map(k=>v.getInt16(k*2,true)/8)});i+=8;}else break;}return out;}
const fresh=(enhanced=true,map='e1m1')=>{const p=spawn(map,true,enhanced);SZ_Clear(sv.datagram);return p;};

Deno.test('Newer Game: a Death Knight shot or a lava ball flying into water goes out at the surface with a small burst; it flies no further',()=>{
 fresh();const w=pool(WATER);check(w,'e1m1 has open water');
 for(const model of FIRE_QUENCH.models){
  SZ_Clear(sv.datagram);
  const e=missile(model,w.above,[40,0,-300]);fly(e,1);
  check(e.free,`${model}: removed once it entered the water`);
  const te=broadcast().filter(m=>m.te===8);same(te.length,1,`${model}: one burst`);
  near(te[0].at[2],w.surface+1,`${model}: at the surface (the last dry point of its path)`,1.01);
  check(SV_PointContents(te[0].at)===EMPTY||Math.abs(te[0].at[2]-w.surface-1)<1,'not under the water');
 }
});

Deno.test('a fireball already underwater goes out at once; lava does not put it out',()=>{
 fresh();const w=pool(WATER);
 const e=missile('progs/k_spike.mdl',w.inside,[300,0,0]);fly(e,.02);check(e.free,'born in water: out on its first move');
 const te=broadcast().filter(m=>m.te===8);same(te.length,1,'one burst');
 // lava: misc_fireball's balls rise out of it and fall back; they are the game's own there
 fresh(true,'e1m7');const l=pool(LAVA);check(l,'e1m7 has open lava');SZ_Clear(sv.datagram);
 const b=missile('progs/lavaball.mdl',l.inside,[0,0,10]);SV_SetFrametime(.02);sv.time+=.02;SV_Physics_Toss(b);
 check(!b.free,'a lava ball in lava flies on');same(broadcast().length,0,'no burst');
});

Deno.test('Classic keeps Quake\'s rules, and other missiles fly into water as before',()=>{
 fresh(false);const w=pool(WATER);
 const e=missile('progs/k_spike.mdl',w.above,[0,0,-300]);fly(e,.5);
 check(!e.free&&SV_PointContents(e.v.origin)===WATER,'Classic: the shot flies on underwater');same(broadcast().length,0,'no burst');
 fresh();const n=missile('progs/spike.mdl',w.above,[0,0,-300]);fly(n,.5);
 check(!n.free&&SV_PointContents(n.v.origin)===WATER,'Newer Game: a nail flies on underwater');
 const r=missile('progs/missile.mdl',w.above,[0,0,-300]);fly(r,.5);check(!r.free,'and so does a rocket');
 same(SV_FireQuench(null,[0,0,0]),false,'nothing to quench');
});

Deno.test('the engine asks after each missile move, and stops when the fireball went out',()=>{
 const src=readFileSync(new URL('../src/engine/server/sv_phys.js',import.meta.url),'utf8');
 const fn=src.slice(src.indexOf('export function SV_Physics_Toss'));
 const push=fn.indexOf('SV_PushEntity( ent, move )'),ask=fn.indexOf('if ( SV_FireQuench( ent, _toss_from ) )'),from=fn.indexOf('VectorCopy( ent.v.origin, _toss_from )');
 check(from>0&&from<push&&push<ask&&ask<fn.indexOf('trace.fraction === 1'),'origin kept before the move, quench asked right after it');
});
