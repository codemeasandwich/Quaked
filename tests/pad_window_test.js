// Teleporter-pad exits show the next level (card [B2], owner request 9 Oct 2026): a window in the slipgate, a picture only; the pad
// still teleports as before. Real server, stock E1M8 and E1M4 (E1M8's exit and E1M4's secret exit were among those reported).
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as pak from '../src/pak.js';
import { VID_SetPalette } from '../src/vid.js';
import { Mod_Init } from '../src/gl_model.js';
import { PR_InitBuiltins } from '../src/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/pr_exec.js';
import * as progs from '../src/progs.js';
import { ED_FindFunction, ED_NewString, ED_Write, ED_ParseEdict, ED_Alloc, ED_Free, GetEdictFieldValue } from '../src/pr_edict.js';
import { OFS_PARM0 } from '../src/pr_comp.js';
import { sv, svs, client_t, FL_MONSTER, FL_ONGROUND } from '../src/server.js';
import { SV_SpawnServer, SV_CheckForNewClients, SV_SaveSpawnparms, SV_ClearCarriedPowerups, SV_WriteClientdataToMessage } from '../src/sv_main.js';
import { SV_RunTriggerTouch, SV_LinkEdict, SV_Move, MOVE_NOMONSTERS } from '../src/world.js';
import { SV_Physics, SV_Physics_Client, SV_Physics_Toss, SV_SetPlayer, SV_SetFrametime, SV_PushEntity, sv_gravity } from '../src/sv_phys.js';
import * as travel from '../src/sv_seamless.js';
import * as respawn from '../src/sv_respawn.js';
import {Respawn_DropAmmo,Respawn_ParsePlayer} from '../src/respawn_record.js';
import * as vars from '../src/cvar.js';
import { Cbuf_Init, Cbuf_Execute, Cmd_AddCommand, Cmd_ExecuteString, src_command } from '../src/cmd.js';
import { SZ_Alloc, SZ_Clear, sizebuf_t, COM_SetNetMessage } from '../src/common.js';
import { CL_ParseServerMessage } from '../src/cl_parse.js';
import { r_hdr } from '../src/gl_post.js';
import { skill } from '../src/host.js';
import { R_AnimSetClassicPass } from '../src/r_anim.js';
import { cls, cl, cl_entities, set_cl_numvisedicts, ca_disconnected, ca_connected, ca_dedicated } from '../src/client.js';
import * as Q from '../src/quakedef.js';
import { R_LevelEntities } from '../src/r_levelents.js';
import { R_SetupLevelViews, R_LevelViewCount, R_ClearLevelViews, R_SyncLevelViews } from '../src/r_levelview.js';
import { R_LevelPortalCount, R_LevelPortalMatrix, R_ClearPortals } from '../src/gl_portal.js';
import { SV_TestEntityPosition } from '../src/world.js';
import { R_HasArchHidden } from '../src/r_archframe.js';
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

function cross(p,c){const t=c.transform;p.v.origin=t.center.map((v,i)=>v-t.through[i]*32);p.v.velocity=t.through.map(v=>v*120);SV_LinkEdict(p,false);travel.SV_SeamlessFrame();for(let step=0;step<18&&!travel.SV_SeamlessPending();step++){const tr=SV_PushEntity(p,t.through.map(v=>v*4));check(!tr.startsolid,'the approach stays outside solids');sv.time+=.1;travel.SV_SeamlessFrame();check(tr.fraction===1||travel.SV_SeamlessPending(),'the hull reaches the threshold');}}
// the same approach, expecting nothing to happen
function walkInto(p,c){const t=c.transform;p.v.origin=t.center.map((v,i)=>v-t.through[i]*32);p.v.velocity=t.through.map(v=>v*120);SV_LinkEdict(p,false);travel.SV_SeamlessFrame();for(let step=0;step<18;step++){SV_PushEntity(p,t.through.map(v=>v*4));sv.time+=.1;travel.SV_SeamlessFrame();}}
// E1M2, out through its exit into E1M3: the player stands in E1M3 with the way back to E1M2 offered
function arrive(){respawn.sv_respawnguard.value=0;let p=spawn('e1m2');cross(p,travel.SV_SeamlessCrossings().find(c=>c.map==='e1m3'));same(travel.SV_SeamlessPending()?.map,'e1m3','the player leaves E1M2');
 p=spawn('e1m3',false);travel.SV_SeamlessPlacePlayer(p);travel.SV_SeamlessHolding(1);sv.time+=5;const back=travel.SV_SeamlessCrossings().find(c=>c.back&&c.map==='e1m2');check(back,'the way back to E1M2 is offered');return {p,back};}
const monstersNow=()=>sv.edicts.filter(e=>e&&!e.free&&text(e.v.classname).startsWith('monster_'));
const stuck=e=>!!SV_TestEntityPosition(e);
const flush=ms=>new Promise(r=>setTimeout(r,ms));


Deno.test('a teleporter-pad exit gets a view-only window onto the next level, in its slipgate, on the side the player comes from',()=>{
 for(const [map,next] of [['e1m8','e1m5'],['e1m4','e1m8']]){
  const p=spawn(map);const w=travel.SV_SeamlessCrossings().filter(c=>c.viewOnly);
  same(w.length,1,map+': one window');same(w[0].map,next,map+': onto '+next);check(w[0].opening&&w[0].opening.a1-w[0].opening.a0>32&&w[0].opening.b1-w[0].opening.b0>48,map+': a doorway-sized opening');
  same(w[0].transform.kind,'plane',map+': an upright window');check(Math.abs(w[0].transform.through[2])<1e-9,map+': level');
  travel.SV_SeamlessReset();
 }
 // E1M4's ordinary exit to E1M5 has no slipgate: it stays what it was (a walk-through crossing), and gets no extra window
 const p=spawn('e1m4');const all=travel.SV_SeamlessCrossings();same(all.filter(c=>c.map==='e1m5'&&!c.viewOnly).length,1,'E1M4 to E1M5 unchanged');same(all.filter(c=>c.map==='e1m5'&&c.viewOnly).length,0,'with no window added');travel.SV_SeamlessReset();
});

Deno.test('walking into the window is not a seamless crossing: the pad keeps its own teleport',()=>{
 const p=spawn('e1m8');const w=travel.SV_SeamlessCrossings().find(c=>c.viewOnly),index=travel.SV_SeamlessCrossings().indexOf(w);walkInto(p,w);const pend=travel.SV_SeamlessPending();check(!pend||pend.index!==index,'walking through the window never queues it as a crossing ('+JSON.stringify(pend&&{map:pend.map,index:pend.index})+')');travel.SV_SeamlessReset();
});

Deno.test('the renderer builds a view for the window',async()=>{
 const p=spawn('e1m8');const scene=new THREE.Scene();const crossings=travel.SV_SeamlessCrossings();
 try{R_ClearPortals();R_SetupLevelViews(scene,crossings);const deadline=performance.now()+30000;while(R_LevelViewCount()<1&&performance.now()<deadline)await flush(20);same(R_LevelViewCount(),1,'a view of E1M5 is built');check(R_LevelPortalMatrix(crossings.indexOf(crossings.find(c=>c.viewOnly))),'with its window');}
 finally{R_ClearLevelViews();R_ClearPortals();travel.SV_SeamlessReset();}
});
