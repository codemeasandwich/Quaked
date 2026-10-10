// Independent native QC -> server physics -> actual trigger-dispatch tests.
// Owner override: the axe is NOT dropped, despite the supplied demo's README.
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
function spawn(map='e1m1',reset=true,enhanced=true){if(reset){travel.SV_SeamlessReset();svs.maxclients=1;svs.clients=[new client_t()];SZ_Alloc(svs.clients[0].message,32768);}cls.state=ca_disconnected;cls.demoplayback=false;vars.Cvar_SetValue('r_hdr',enhanced?1:0);vars.Cvar_SetValue('skill',2);/* Hard: full-health respawn (Normal's reduced health is tested in respawn_health_native_test.js); the guard monster is off here (tested in respawn_guard_native_test.js) so nobody stands on the death spot */respawn.sv_respawnguard.value=0;vars.Cvar_SetValue('sv_seamless',1);R_AnimSetClassicPass(false);sv.active=false;SV_SpawnServer(map);const p=svs.clients[0].edict;call(p,progs.pr_global_struct.SetNewParms);call(p,progs.pr_global_struct.ClientConnect);call(p,progs.pr_global_struct.PutClientInServer);svs.clients[0].active=true;svs.clients[0].spawned=true;check(p.v.health===100&&p._respawnStart&&(enhanced?!!p._respawn:!p._respawn),'actual native spawn captures checkpoint and admits coordinator only in Newer');return p;}
const drops=()=>sv.edicts.filter(e=>e&&!e.free&&e._respawnDrop);
const totals=p=>pools.map((a,i)=>p.v[a]+drops().reduce((sum,e)=>sum+Respawn_DropAmmo(e._respawnDrop)[i],0));
function inventory(p,ammo=[19,61,7,13],bits=127|Q.IT_AXE){p.v.items=bits;p.v.weapon=bits&Q.IT_SHOTGUN?Q.IT_SHOTGUN:Q.IT_AXE;pools.forEach((a,i)=>p.v[a]=ammo[i]);call(p,'W_SetCurrentAmmo');}
function kill(p,command=false){if(command)call(p,'ClientKill');else{const world=sv.edicts[0];progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(world);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(world);progs.pr_globals_float[OFS_PARM0+9]=200;call(p,'T_Damage');}check(p._respawn?.sequence,'native lethal outcome starts sequence');return p._respawn.sequence;}
function at(p,time){sv.time=time;progs.pr_global_struct.time=time;SV_SetFrametime(.01);SV_Physics_Client(p,1);}
function finish(p){const s=p._respawn.sequence,cut=s.at+.22+s.turn/2+1e-6,end=s.at+.22+s.turn+.001;if(sv.time<cut)at(p,cut);check(s.respawned,'native physics reaches contact');if(sv.time<end)at(p,end);check(!p._respawn.sequence,'native physics finishes sequence');}

Deno.test('native lethal damage drops seven ranged weapons with exact shared pools and no axe, then physics respawns with100health and axe only',()=>{
 const p=spawn();inventory(p);const before=totals(p),sequence=kill(p),deathDrops=drops();same(deathDrops.length,7,'one drop per carried ranged weapon, owner excludes axe');same(deathDrops.map(e=>e._respawnDrop.weapon).sort((a,b)=>a-b).join(),weapons.join(),'all seven native weapons captured');same(totals(p).join(),before.join(),'four shared pools conserved exactly at native death');same(deathDrops.map(e=>e._respawnDrop.amount).join(),'10,9,31,30,4,3,13','deterministic quotient/remainder never duplicates shared pools');same(p.v.weapon,0,'held weapon removed immediately');same(p.v.currentammo,0,'held-ammo display removed immediately');same(text(p.v.weaponmodel),'','native held weapon model disappears immediately');check(!sv.edicts.some(e=>e&&!e.free&&!e._respawnDrop&&text(e.v.model)==='progs/backpack.mdl'),'native selected-weapon backpack is suppressed');
 const world=sv.worldmodel,restartBefore=restarts;at(p,sequence.at+.22+sequence.turn/2-.001);check(p.v.health<=0&&!sequence.respawned,'no health reset before actual contact');finish(p);same(p.v.health,100,'exact post-contact health');same(p.v.items,Q.IT_AXE,'no default shotgun or bonus ammo on native respawn');same(p.v.weapon,Q.IT_AXE,'axe actually equipped');same(pools.map(a=>p.v[a]).join(),'0,0,0,0','all player ammo starts empty');same(text(p.v.weaponmodel),'progs/v_axe.mdl','native W_SetCurrentAmmo equips actual axe viewmodel');same(totals(p).join(),before.join(),'contact conserves world payload totals');Cbuf_Execute();same(restarts,restartBefore,'singleplayer native restart is suppressed');same(sv.worldmodel,world,'current native level is retained');console.log('RESPAWN_NATIVE_SMOKE '+JSON.stringify({drops:deathDrops.map(e=>e._respawnDrop),ammo:totals(p),health:p.v.health,items:p.v.items,alerted:sequence.alerted}));
});

Deno.test('native kill command removes all active power timers immediately and contact alerts every living native monster but not dead ones',()=>{
 const p=spawn();inventory(p);p.v.items|=Q.IT_QUAD|Q.IT_INVULNERABILITY|Q.IT_INVISIBILITY|Q.IT_SUIT|Q.IT_KEY1;for(const n of powerFields)field(p,n,sv.time+100);const enemies=sv.edicts.filter(e=>e&&!e.free&&(e.v.flags&FL_MONSTER)&&e.v.health>0&&e.v.deadflag===0);check(enemies.length>10,'real native map supplies distant living monsters');const dead=enemies.pop();dead.v.health=0;dead.v.deadflag=2;const deadBefore=dead._fieldBuffer.slice(0),s=kill(p,true);for(const n of powerFields)same(field(p,n),0,'native power field removed at death '+n);finish(p);same(p.v.items,Q.IT_AXE|Q.IT_KEY1,'only axe and existing progression key survive');same(s.alerted,enemies.length,'all living enemies included regardless of visibility');for(const e of enemies){same(e.v.enemy,progs.EDICT_TO_PROG(p),'native enemy target receives player '+e.index);const goal=GetEdictFieldValue(e,'goalentity');same(goal.accessor.getInt32(goal.ofs),progs.EDICT_TO_PROG(p),'native goalentity reaches player '+e.index);check(e.v.nextthink>0&&e.v.think>0,'actual native actor has scheduled pursuit '+e.index);}check(new Uint8Array(dead._fieldBuffer).every((v,i)=>v===new Uint8Array(deadBefore)[i]),'dead native monster remains unchanged');for(const n of powerFields)same(field(p,n),0,'native power field stays cleared at contact '+n);console.log('RESPAWN_NATIVE_ALERTS '+JSON.stringify({living:enemies.length,alerted:s.alerted,dead:dead.index}));
});

function settle(list){SV_SetFrametime(.02);for(let frame=0;frame<250&&list.some(e=>!e.free&&!(e.v.flags&FL_ONGROUND));frame++){sv.time+=.02;progs.pr_global_struct.time=sv.time;for(const e of list)if(!e.free)SV_Physics_Toss(e);}check(list.every(e=>!e.free&&(e.v.flags&FL_ONGROUND)),'actual native toss collision settles every drop');for(const e of list){const fit=SV_Move(e.v.origin,e.v.mins,e.v.maxs,e.v.origin,MOVE_NOMONSTERS,e);check(!fit.startsolid&&!fit.allsolid,'settled native drop remains outside BSP solids');}}
function recover(p,e){const was=e._respawnDrop;check(was,'live payload before recovery');const prior=totals(p).join();p.v.origin=[e.v.origin[0]+512,e.v.origin[1],e.v.origin[2]+20];SV_LinkEdict(p,false);SV_RunTriggerTouch(p,e);check(!e.free&&e._respawnDrop===was,'public touch rejects remote pickup without spatial overlap');same(totals(p).join(),prior,'rejected distant touch conserves all ammo');p.v.origin=[e.v.origin[0],e.v.origin[1],e.v.origin[2]+20];SV_LinkEdict(p,false);SV_RunTriggerTouch(p,e);check(e.free&&!e._respawnDrop,'actual public trigger atomically consumes contacted payload');return was;}
function recoverByMovement(p,e){
 let direction=null;for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const start=[e.v.origin[0]+d[0]*32,e.v.origin[1]+d[1]*32,e.v.origin[2]+20],end=[e.v.origin[0]+d[0]*16,e.v.origin[1]+d[1]*16,e.v.origin[2]+20];const a=SV_Move(start,p.v.mins,p.v.maxs,start,MOVE_NOMONSTERS,p),b=SV_Move(end,p.v.mins,p.v.maxs,end,MOVE_NOMONSTERS,p);if(!a.startsolid&&!b.startsolid){direction=d;p.v.origin=start;break;}}
 check(direction,'native pickup has a reachable player-hull approach');SV_LinkEdict(p,false);const tr=SV_PushEntity(p,[-direction[0]*16,-direction[1]*16,0]);check(!tr.startsolid&&e.free&&!e._respawnDrop,'real native movement and area-link touching recover the pickup');
}
function encoded(e){const lines=[];ED_Write(lines,e);return lines.join('\n');}
function restore(e,text){ED_ParseEdict(text.slice(text.indexOf('{')+1),e);SV_LinkEdict(e,false);}

Deno.test('real toss and trigger recovery conserves shared ammo across twelve deaths and native shots without dropping fresh axes',()=>{
 const p=spawn(),initial=[29,61,7,13];inventory(p,initial);let spent=0;const allIds=new Set();
 for(let cycle=0;cycle<12;cycle++){
  const s=kill(p),list=drops();check(list.every(e=>e._respawnDrop.weapon!==Q.IT_AXE),'fresh axe never becomes a pickup');same(list.length,7,'current seven ranged weapons drop exactly once');for(const e of list){check(!allIds.has(e._respawnDrop.id),'new death uses unique persistent pickup identity');allIds.add(e._respawnDrop.id);SV_RunTriggerTouch(p,e);check(!e.free,'dead player cannot recover drops');}
  finish(p);for(const e of list){SV_RunTriggerTouch(p,e);check(!e.free,'unsettled airborne payload cannot be recovered');}settle(list);
  const order=cycle%2?list.slice().reverse():list.slice(3).concat(list.slice(0,3));for(const e of order){const snapshot=totals(p).join();recover(p,e);same(totals(p).join(),snapshot,'every atomic shared-pool transfer conserves inventory+world');const after=pools.map(a=>p.v[a]).join();SV_RunTriggerTouch(p,e);same(pools.map(a=>p.v[a]).join(),after,'consumed payload cannot transfer twice');}
  same(p.v.items&(127|Q.IT_AXE),127|Q.IT_AXE,'all ranged ownership bits recover without duplicate slots');p.v.weapon=Q.IT_SHOTGUN;call(p,'W_SetCurrentAmmo');const prior=p.v.ammo_shells;call(p,'W_FireShotgun');same(p.v.ammo_shells,prior-1,'actual native shotgun consumes one shell');spent++;
  same(totals(p).join(),[initial[0]-spent,...initial.slice(1)].join(),'exact family totals after cycle '+cycle);same(p._respawn.deaths,cycle+1,'one death transaction per native lethal callback');check(!s.respawned||p.v.health===100,'completed contact has full health');
 }
 const before=totals(p).join();inventory(p,[0,0,0,0],Q.IT_AXE);kill(p);finish(p);same(drops().length,0,'owner-requested axe-only death emits no weapon pickup');console.log('RESPAWN_TWELVE_NATIVE_CYCLES '+JSON.stringify({deaths:12,uniqueDrops:allIds.size,conservedBeforeAxeControl:before,shellsSpent:spent}));
});

Deno.test('zero-ammo weapons and orphan ammo remain recoverable, older drops have no native expiry and overflow recovery never clamps stored pools',()=>{
 const p=spawn();inventory(p,[0,0,0,0]);kill(p);finish(p);const zeros=drops().slice();same(zeros.length,7,'empty carried ranged weapons still drop');check(zeros.every(e=>e._respawnDrop.amount===0),'zero ammo is not refilled');settle(zeros);for(const e of zeros)recover(p,e);same(pools.map(a=>p.v[a]).join(),'0,0,0,0','recovering zero-ammo weapons grants no default stock');
 inventory(p,[301,407,211,509],Q.IT_AXE);kill(p);finish(p);const orphan=drops().slice();same(orphan.length,1,'ammo without owned families produces one conserving four-pool backpack');same(Respawn_DropAmmo(orphan[0]._respawnDrop).join(),'301,407,211,509','single backpack retains every exact orphan pool');check(orphan.every(e=>e._respawnDrop.weapon===0),'orphan ammo never grants an unowned ranged weapon');settle(orphan);const saved=orphan.map(encoded);sv.time+=100000;SV_SetFrametime(.02);for(const e of orphan)SV_Physics_Toss(e);same(orphan.map(encoded).join(),saved.join(),'settled drops retain exact payload and state beyond native120-second lifetime');
 for(const e of orphan)recover(p,e);same(pools.map(a=>p.v[a]).join(),'301,407,211,509','literal full stored ammo transfers above native caps');same(p.v.items,Q.IT_AXE,'orphan recovery leaves axe-only ownership');
 progs.pr_global_struct.other=progs.EDICT_TO_PROG(p);call(sv.edicts[0],'bound_other_ammo');same(pools.map(a=>p.v[a]).join(),'301,407,211,509','native ammo-bound helper preserves already-recovered overflow');
 inventory(p,[1,0,0,0],Q.IT_SHOTGUN|Q.IT_AXE);kill(p);finish(p);const e=drops()[0];settle([e]);p.v.ammo_shells=16777216;p.v.origin=[e.v.origin[0],e.v.origin[1],e.v.origin[2]+20];SV_LinkEdict(p,false);const old=encoded(e);SV_RunTriggerTouch(p,e);same(encoded(e),old,'unrepresentable transfer keeps its exact drop instead of losing or duplicating ammo');same(p.v.ammo_shells,16777216,'Float32 exact integer boundary never wraps');p.v.ammo_shells=0;recoverByMovement(p,e);same(p.v.ammo_shells,1,'rejected transfer remains recoverable later');
});

Deno.test('native save serialization roundtrips airborne drops and active death phases without duplicating contact or inventory',()=>{
 const p=spawn();inventory(p);const s=kill(p),list=drops(),savedPlayer=encoded(p),savedDrops=list.map(encoded),total=totals(p).join();
 for(let i=0;i<list.length;i++){const before=JSON.stringify(list[i]._respawnDrop);restore(list[i],savedDrops[i]);same(JSON.stringify(list[i]._respawnDrop),before,'airborne payload metadata exactly survives ED_Write/Parse');check(list[i].v.movetype===6&&list[i].v.solid===1,'native toss/touch fields survive');}
 restore(p,savedPlayer);same(totals(p).join(),total,'precontact reload conserves exact shared totals');same(p._respawn.deaths,1,'precontact reload cannot repeat drop transaction');finish(p);same(drops().length,7,'restored precontact sequence adds no duplicate drops');
 const after=encoded(p);restore(p,after);same(p.v.health,100,'complete player reload keeps100health');same(p._respawn.sequence,null,'complete player reload does not restart animation');same(p._respawn.deaths,1,'death serial survives save');
 inventory(p,[0,0,0,0],Q.IT_AXE);const second=kill(p);at(p,second.at+.22+second.turn/2+1e-6);const atContact=encoded(p),alerted=sv.edicts.filter(e=>e?._respawnAlert===sv.time).length;restore(p,atContact);at(p,sv.time+.01);same(drops().length,7,'contact reload cannot redrop or erase older unclaimed pickups');same(p._respawn.sequence.respawned,true,'contact idempotency survives serialization');check(alerted>0,'native alert population observed before reload');finish(p);same(p._respawn.deaths,2,'second death survives both save phases');
 const invalid=ED_Alloc();restore(invalid,'{\n"classname" "dropped_weapon"\n"_clockwise_drop" "'+encodeURIComponent(JSON.stringify({version:1,id:'bad',weapon:1,ammo:'ammo_shells',amount:-1,born:1}))+'"\n}');same(invalid._respawnDrop,null,'invalid negative ammo metadata cannot become collectible');ED_Free(invalid);console.log('RESPAWN_SAVE_PHASES '+JSON.stringify({airborneDrops:list.length,conserved:total,deaths:p._respawn.deaths,alerted}));
});

function cross(p,c){const t=c.transform;p.v.origin=t.center.map((v,i)=>v-t.through[i]*32);p.v.velocity=t.through.map(v=>v*120);SV_LinkEdict(p,false);travel.SV_SeamlessFrame();for(let step=0;step<18&&!travel.SV_SeamlessPending();step++){const tr=SV_PushEntity(p,t.through.map(v=>v*4));check(!tr.startsolid,'native player approach stays outside solids');sv.time+=.1;travel.SV_SeamlessFrame();check(tr.fraction===1||travel.SV_SeamlessPending(),'native hull reaches actual passage threshold');}same(travel.SV_SeamlessPending()?.map,c.map,'native movement queues requested map');}
Deno.test('actual seamless departure, portal snapshot and return preserve unclaimed drops and consumed absence with native model remapping',()=>{
 let p=spawn('e1m2');inventory(p);kill(p);finish(p);settle(drops());const consumed=drops()[0]._respawnDrop.id;recover(p,drops()[0]);const records=drops().map(e=>({record:JSON.stringify(e._respawnDrop),origin:Array.from(e.v.origin).join(),model:text(e.v.model)}));
 cross(p,travel.SV_SeamlessCrossings().find(c=>c.map==='e1m3'));const snapshot=travel.SV_LevelSnapshotEntities('e1m2');check(snapshot,'real movement captures native previous-level snapshot');const payloads=snapshot.filter(e=>e._clockwise_drop);same(payloads.length,records.length,'snapshot keeps every unclaimed payload');check(!payloads.some(e=>decodeURIComponent(e._clockwise_drop).includes(consumed)),'consumed pickup cannot reappear in portal snapshot');
 const drawn=R_LevelEntities(sv.worldmodel.entities,snapshot,sv.worldmodel.submodels,1).filter(e=>e.classname==='dropped_weapon');same(drawn.length,records.length,'actual portal entity parser retains native dropped weapon models');
 p=spawn('e1m3',false);travel.SV_SeamlessPlacePlayer(p);travel.SV_SeamlessHolding(1);sv.time+=5;const back=travel.SV_SeamlessCrossings().find(c=>c.back&&c.map==='e1m2');check(back,'native return passage is offered');cross(p,back);
 p=spawn('e1m2',false);travel.SV_SeamlessPlacePlayer(p);travel.SV_SeamlessHolding(1);same(drops().length,records.length,'return restores only unclaimed pickups');
 for(const expected of records){const e=drops().find(e=>JSON.stringify(e._respawnDrop)===expected.record);check(e,'exact drop identity/ammo metadata restored');same(Array.from(e.v.origin).join(),expected.origin,'settled native world location retained');same(text(e.v.model),expected.model,'native model name retained');same(sv.model_precache[e.v.modelindex],expected.model,'saved index remaps through current native resource precache');}
 console.log('RESPAWN_NATIVE_SEAMLESS_DROPS '+JSON.stringify({remaining:records.length,consumed,previewModels:drawn.map(e=>e.model)}));travel.SV_SeamlessReset();
});

Deno.test('exact over-byte ammo statistics reach only the authenticated local loopback player and unsupported contexts keep native behavior',()=>{
 const p=spawn();inventory(p,[301,407,211,509]);p.v.weapon=Q.IT_SHOTGUN;call(p,'W_SetCurrentAmmo');svs.maxclientslimit=1;NET_Init();const client=Loop_Connect('local'),server=Loop_CheckNewConnections();check(client&&server,'actual paired local sockets created');const originalSocket=cls.netcon;cls.netcon=client;svs.clients[0].netconnection=server;const target={stats:new Int32Array(32)};
 try{respawn.SV_RespawnInventoryStats(target);same([Q.STAT_SHELLS,Q.STAT_NAILS,Q.STAT_ROCKETS,Q.STAT_CELLS].map(i=>target.stats[i]).join(),'301,407,211,509','real local client statistics do not wrap to eight bits');same(target.stats[Q.STAT_AMMO],301,'equipped native ammo remains exact');client.driver=1;target.stats.fill(-7);respawn.SV_RespawnInventoryStats(target);check(target.stats.every(x=>x===-7),'remote socket cannot override packet statistics');client.driver=0;
  for(const mode of ['classic','demo','dedicated','multiplayer','modifiedQC']){const crc=progs.pr_crc,state=cls.state;try{if(mode==='classic')vars.Cvar_SetValue('r_hdr',0);if(mode==='demo')cls.demoplayback=true;if(mode==='dedicated')cls.state=ca_dedicated;if(mode==='multiplayer')svs.maxclients=2;if(mode==='modifiedQC')progs.PR_SetCRC(crc^1);same(respawn.SV_RespawnAllowed(),false,'unsupported context rejects coordinator '+mode);target.stats.fill(-8);respawn.SV_RespawnInventoryStats(target);check(target.stats.every(x=>x===-8),'unsupported context keeps native client stats '+mode);}finally{vars.Cvar_SetValue('r_hdr',1);cls.demoplayback=false;cls.state=state;svs.maxclients=1;progs.PR_SetCRC(crc);}}
  // Existing custody survives the option switch: the native byte packet is
  // insufficient for overflow that was already admitted and recovered.
  kill(p);finish(p);settle(drops());for(const e of drops().slice())recover(p,e);p.v.weapon=Q.IT_SHOTGUN;call(p,'W_SetCurrentAmmo');vars.Cvar_SetValue('r_hdr',0);target.stats.fill(-9);respawn.SV_RespawnInventoryStats(target);
  same([Q.STAT_SHELLS,Q.STAT_NAILS,Q.STAT_ROCKETS,Q.STAT_CELLS].map(i=>target.stats[i]).join(),'301,407,211,509','paired local UI preserves already-admitted overflow after Classic option change');
 }finally{vars.Cvar_SetValue('r_hdr',1);NET_Close(client);NET_Close(server);cls.netcon=originalSocket;svs.clients[0].netconnection=null;}
});

// Card [35]: the facing `progress` of the way through the rise (independent restatement of the law: from the facing at death to the
// facing into the level, quintic ease, yaw the shorter way round)
const riseFacing=(s,progress)=>{const to=s.riseAngles;if(!to||progress<=0)return s.angles;const k=progress*progress*progress*(progress*(progress*6-15)+10),d=((to[1]-s.angles[1])%360+540)%360-180;return [s.angles[0]+(to[0]-s.angles[0])*k,s.angles[1]+d*k,0];};
const axis=(v,a)=>new THREE.Quaternion().setFromAxisAngle(v,a);
Deno.test('actual native view and renderer camera follow the rigid clockwise arc with proper transported bases and continuous head velocity through repeated contacts',()=>{
 V_Init();render.R_Init();r_refdef.vrect.width=640;r_refdef.vrect.height=400;r_refdef.fov_y=75;r_refdef.fov_x=100;const receipts=[];
 const v=a=>new THREE.Vector3(...a),q=a=>new THREE.Quaternion().fromArray(a),smooth=t=>t*t*t*(t*(t*6-15)+10);
 function observed(p,s,t){
  at(p,t);cl.viewentity=1;const ent=cl_entities[1]||=(new entity_t());ent.origin.set(p.v.origin);ent.angles.set(p.v.angles);cl.time=sv.time;cl.oldtime=cl.time;cl.viewheight=p.v.view_ofs[2];cl.viewangles.set(p.v.v_angle);cl.velocity.fill(0);cl.punchangle.fill(0);cl.onground=false;cl.stats[Q.STAT_HEALTH]=p.v.health;cl.stats[Q.STAT_WEAPON]=p.v.weaponmodel?sv.model_precache.indexOf(text(p.v.weaponmodel)):0;cl.model_precache=sv.models.slice();
  V_CalcRefdef();check(s.respawned?cl.viewent.model===sv.models[sv.model_precache.indexOf('progs/v_axe.mdl')]:!cl.viewent.model,'actual first-person view hides dropped weapon and equips native axe at contact');render.R_SetupGL();const camera=render.camera,presentation=camera.userData.clockwisePresentation;if(s.respawned){const mesh=R_DrawAliasModel(cl.viewent,cl.viewent.model.cache.data);check(mesh,'native held axe creates its actual alias mesh');mesh.updateMatrixWorld(true);const axeForward=new THREE.Vector3(1,0,0).transformDirection(mesh.matrixWorld),axeUp=new THREE.Vector3(0,0,1).transformDirection(mesh.matrixWorld),cameraForward=new THREE.Vector3(0,0,-1).transformDirection(camera.matrixWorld),cameraUp=new THREE.Vector3(0,1,0).transformDirection(camera.matrixWorld);check(axeForward.dot(cameraForward)>.999999&&axeUp.dot(cameraUp)>.999999,'actual held AXE mesh follows pitched/rising camera forward and up');}check(presentation,'actual R_SetupGL invokes camera-frame transport');
  const elapsed=t-s.at,u=Math.max(0,Math.min(1,(elapsed-.22)/s.turn)),theta=Math.PI*(u-Math.sin(2*Math.PI*u)/(2*Math.PI)),after=elapsed>=.22+s.turn/2,roll=theta-(after?Math.PI:0),facing=riseFacing(s,after?Math.max(0,Math.min(1,2*u-1)):0),yaw=facing[1]*Math.PI/180,pitch=facing[0]*Math.PI/180,deathForward=new THREE.Vector3(Math.cos(s.angles[1]*Math.PI/180),Math.sin(s.angles[1]*Math.PI/180),0);
  const forward=new THREE.Vector3(Math.cos(yaw),Math.sin(yaw),0),right=new THREE.Vector3(Math.sin(yaw),-Math.cos(yaw),0),up=new THREE.Vector3(0,0,1),baseUp=up.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(forward,Math.sin(pitch)),baseForward=forward.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(up,-Math.sin(pitch));
  const baseQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,baseUp,baseForward.negate())),absolute=q(s.frame).multiply(after?axis(deathForward,-Math.PI).multiply(axis(forward,theta-Math.PI)):axis(forward,theta)).multiply(baseQ);
  check(1-Math.abs(absolute.dot(presentation.quaternion))<2e-7,'actual renderer basis matches independent axis-angle clockwise rotation');near(camera.matrixWorld.determinant(),1,'native camera basis remains proper',1e-6);near(presentation.matrixWorld.determinant(),1,'transported camera never mirrors geometry',1e-6);
  const bodyUp=up.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(forward,roll)),eye=v(after?s.destinationPivot:s.sourcePivot).addScaledVector(bodyUp,s.radius),progress=after?Math.max(0,Math.min(1,2*u-1)):Math.max(0,Math.min(1,2*u));
  if(!after)eye.z-=s.descent*smooth(progress);else eye.z-=(s.destinationDrop||0)*(1-smooth(progress));eye.addScaledVector(v(after?s.destinationDrift:s.sourceDrift),after?1-smooth(progress):smooth(progress));
  check(camera.position.distanceTo(eye)<2e-4,'actual first-person camera uses rigid head-radius arc rather than corpse translation');
  const point=new THREE.Vector3(70,90,25),nativePoint=point.clone().applyMatrix4(camera.matrixWorldInverse),transportedPoint=point.clone().applyMatrix4(presentation.frame).applyMatrix4(presentation.matrixWorld.clone().invert());check(nativePoint.distanceTo(transportedPoint)<1e-8,'proper presentation gauge preserves actual world-to-camera geometry');
  return{position:new THREE.Vector3().setFromMatrixPosition(presentation.matrixWorld),quaternion:presentation.quaternion.clone(),theta,eye:camera.position.clone()};
 }
 for(const angles of [[0,0,0],[25,123,0]]){
  const p=spawn();inventory(p,[0,0,0,0],Q.IT_AXE);
  for(let death=0;death<3;death++){
   p.v.origin=[128,1008,-199.95];p.v.v_angle=angles;p.v.angles=angles;SV_LinkEdict(p,false);const s=kill(p),cut=s.at+.22+s.turn/2,e=.001;
   const turn=Math.abs(((s.riseAngles[1]-s.angles[1])%360+540)%360-180);if(angles[1]===123)check(turn>30&&Math.abs(s.riseAngles[0]-s.angles[0])>20,'this case turns during the rise (card [35]): '+turn.toFixed(1)+' degrees of yaw, and the pitch levels');
   const start=observed(p,s,s.at+.22+.001),a=observed(p,s,cut-2*e),b=observed(p,s,cut-e),c=observed(p,s,cut+e),d=observed(p,s,cut+2*e),end=observed(p,s,s.at+.22+s.turn-.001);
   const leftVelocity=b.position.clone().sub(a.position).divideScalar(e),rightVelocity=d.position.clone().sub(c.position).divideScalar(e),velocityError=leftVelocity.distanceTo(rightVelocity);
   const velocityBound=3*e*s.radius*(2*Math.PI/s.turn)**2+.08;check(velocityError<velocityBound,'actual head velocity agrees within the1ms finite-difference acceleration/Float32 bound: '+velocityError+' / '+velocityBound);check(1-Math.abs(b.quaternion.dot(c.quaternion))<.00001,'actual transported camera orientation has no hidden180-degree snap');check(c.position.distanceTo(b.position)>64,'contact is a real location jump');check(start.theta<a.theta&&a.theta<b.theta&&b.theta<c.theta&&c.theta<d.theta&&d.theta<end.theta,'clockwise world angle never reverses');
   finish(p);same(drops().length,0,'repeated axe-only motion produces no pickups');
   // Once ownership ends, use the unchanged ordinary view path. This checks
   // the rendered endpoint, including Quake's native 1/32 node-line bias.
   cl_entities[1].origin.set(p.v.origin);cl_entities[1].angles.set(p.v.angles);cl.viewangles.set(p.v.v_angle);cl.viewheight=p.v.view_ofs[2];cl.time=sv.time;cl.oldtime=cl.time;cl.velocity.fill(0);cl.punchangle.fill(0);cl.onground=false;V_CalcRefdef();render.R_SetupGL();
   const releaseJump=render.camera.position.distanceTo(end.eye),standing=p._respawn.start.map((v,i)=>v+(i===2?22:0)+1/32);
   check(releaseJump<.0002,'actual standing-release camera has no positional jump: '+releaseJump);standing.forEach((v,i)=>near(render.camera.position.getComponent(i),v,'released renderer uses exact native standing eye',.0002));
   receipts.push({angles,death:death+1,velocityError,velocityBound,locationJump:c.position.distanceTo(b.position),orientationDot:Math.abs(b.quaternion.dot(c.quaternion)),releaseJump});
  }
 }
 console.log('RESPAWN_ACTUAL_VIEW_CONTINUITY '+JSON.stringify(receipts));
});

Deno.test('partial recovery redrops only current ranged ownership while original native weapon pickup preserves recovered over-cap ammunition',()=>{
 const p=spawn();inventory(p);kill(p);finish(p);settle(drops());const selected=drops().find(e=>e._respawnDrop.weapon===Q.IT_SUPER_SHOTGUN),oldIds=drops().filter(e=>e!==selected).map(e=>e._respawnDrop.id),expected=totals(p).join();const recovered=recover(p,selected);same(p.v.items&(127|Q.IT_AXE),Q.IT_AXE|Q.IT_SUPER_SHOTGUN,'partial recovery owns exactly one ranged weapon');same(p.v.weapon,Q.IT_SUPER_SHOTGUN,'recovered ranged weapon is selected through native pickup behavior');same(p.v.currentammo,recovered.amount,'native active ammo displays exact recovered shells');same(text(p.v.weaponmodel),'progs/v_shot2.mdl','native selected super-shotgun model');check(p.v.items&Q.IT_SHELLS,'native active-ammo HUD flag coexists with weapon ownership');kill(p);finish(p);same(drops().length,7,'second death adds only recovered ranged weapon beside six old drops');check(oldIds.every(id=>drops().some(e=>e._respawnDrop.id===id)),'all older unclaimed identities remain');same(totals(p).join(),expected,'partial recovery and redeath conserve each shared pool');
 p.v.ammo_nails=407;const native=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='weapon_nailgun');check(native,'real native map provides a weapon pickup');p.v.origin=Array.from(native.v.origin);SV_LinkEdict(p,false);SV_RunTriggerTouch(p,native);same(p.v.ammo_nails,437,'actual native weapon_touch adds its30nails without clamping recovered overflow');check(p.v.items&Q.IT_NAILGUN,'actual native weapon pickup still grants its own weapon bit');same(drops().length,7,'original map weapon pickup does not consume persistent death drops');
});

Deno.test('turning Newer off before or after contact finishes owned cleanup and existing drop custody while later Classic deaths remain native',()=>{
 // Observe stock single-player death first: backpack admission belongs to QC's
 // own game-mode policy, not to a test assumption that every death drops one.
 const baseline=spawn();inventory(baseline,[301,407,211,509]);vars.Cvar_SetValue('r_hdr',0);progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(baseline);progs.pr_globals_int[OFS_PARM0+3]=0;progs.pr_globals_int[OFS_PARM0+6]=0;progs.pr_globals_float[OFS_PARM0+9]=200;call(baseline,'T_Damage');const nativeBackpacks=sv.edicts.filter(e=>e&&!e.free&&text(e.v.model)==='progs/backpack.mdl').length;
 for(const phase of ['fall','rise']){
  const p=spawn();inventory(p,[301,407,211,509]);const s=kill(p),saved=totals(p).join();at(p,phase==='fall'?s.at+.5:s.at+.22+s.turn/2+.1);vars.Cvar_SetValue('r_hdr',0);check(respawn.SV_RespawnView(),'owned first-person animation survives rendering option change');finish(p);
  same(p.v.movetype,3,'owned '+phase+' cleanup restores native walk');same(p.v.takedamage,2,'owned '+phase+' cleanup restores native damage');same(Array.from(p.v.view_ofs).join(),'0,0,22','owned cleanup restores eye offset');same(p.v.health,100,'contact completes after mode change');same(totals(p).join(),saved,'mode change cannot erase dropped custody');settle(drops());for(const e of drops().slice())recover(p,e);same(pools.map(a=>p.v[a]).join(),'301,407,211,509','existing exact payloads remain recoverable under Classic');
  progs.pr_global_struct.other=progs.EDICT_TO_PROG(p);call(sv.edicts[0],'bound_other_ammo');same(pools.map(a=>p.v[a]).join(),'301,407,211,509','admitted overflow custody is not lost to a later native ammo helper in Classic');
  const world=sv.edicts[0];progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(world);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(world);progs.pr_globals_float[OFS_PARM0+9]=200;call(p,'T_Damage');same(p._respawn.sequence,null,'new Classic death does not admit another owned sequence');same(drops().length,0,'new Classic death does not create enhanced ranged drops');same(sv.edicts.filter(e=>e&&!e.free&&text(e.v.model)==='progs/backpack.mdl').length,nativeBackpacks,'new Classic death retains actual native single-player backpack policy');vars.Cvar_SetValue('r_hdr',1);
 }
 for(const mode of ['demo','dedicated','modifiedQC']){const p=spawn();inventory(p);const s=kill(p);at(p,s.at+.5);const crc=progs.pr_crc,state=cls.state;try{if(mode==='demo')cls.demoplayback=true;if(mode==='dedicated')cls.state=ca_dedicated;if(mode==='modifiedQC')progs.PR_SetCRC(crc^1);respawn.SV_RespawnFrame(p);same(p._respawn.sequence,null,'leaving local native context releases sequence '+mode);same(p.v.movetype,3,'context cleanup cannot leave frozen player '+mode);same(p.v.takedamage,2,'context cleanup cannot leave invulnerability '+mode);}finally{cls.demoplayback=false;cls.state=state;progs.PR_SetCRC(crc);}}
});

Deno.test('actual START pinned zombies without monster flags receive the native respawn target while retaining their authored pinned state',()=>{
 const p=spawn('start');inventory(p,[0,0,0,0],Q.IT_AXE);const pinned=sv.edicts.filter(e=>e&&!e.free&&text(e.v.classname)==='monster_zombie'&&!(e.v.flags&FL_MONSTER));check(pinned.length>=2,'shipped START supplies actual unflagged pinned zombies');const before=pinned.map(e=>({index:e.index,origin:Array.from(e.v.origin).join(),movetype:e.v.movetype,solid:e.v.solid,think:e.v.think,frame:e.v.frame}));kill(p);finish(p);
 for(let i=0;i<pinned.length;i++){const e=pinned[i],b=before[i];same(e.v.enemy,progs.EDICT_TO_PROG(p),'pinned zombie learns actual player target');same(e.v.movetype,b.movetype,'alert cannot unpin native monster');same(e.v.solid,b.solid,'alert retains native pinned collision');same(Array.from(e.v.origin).join(),b.origin,'alert leaves pinned location unchanged');same(e.v.think,b.think,'alert does not replace native pinned thinker');same(e.v.frame,b.frame,'alert does not force an unrelated running animation');}
 console.log('RESPAWN_START_PINNED_ALERT '+JSON.stringify(before));
});

Deno.test('public save/load after contact retains exact persistent payloads and precaches their real models before Newer and Classic connection headers',async()=>{
 // Only the storage endpoint is isolated in memory; real user saves are untouched.
 const storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),storage=new Map();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{setItem:(key,value)=>storage.set(key,String(value)),getItem:key=>storage.get(key)??null,removeItem:key=>storage.delete(key)}});const savedSocket=cls.netcon;let owned=[];
 try{
  Host_InitCommands();const p=spawn();inventory(p);const sequence=kill(p);cl.intermission=0;cl.levelname='independent respawn save';Cmd_ExecuteString('save independent_respawn_dead',src_command);same(storage.size,0,'actual save command keeps native prohibition against precontact dead-player saves');finish(p);settle(drops());recover(p,drops()[0]);const expected=drops().map(e=>({record:JSON.stringify(e._respawnDrop),model:text(e.v.model),origin:Array.from(e.v.origin)})),savedState=JSON.stringify(p._respawn);
  Cmd_ExecuteString('save independent_respawn_owned',src_command);same(storage.size,1,'actual host save writes one atomic native save');check([...storage.values()][0].includes('_clockwise_drop')&&[...storage.values()][0].includes('_clockwise_player'),'actual save payload contains drop and player metadata');
  svs.maxclientslimit=1;NET_Init();SZ_Alloc(cls.message,8192);const client=Loop_Connect('local'),server=Loop_CheckNewConnections();owned.push(client,server);cls.netcon=client;cls.state=ca_connected;svs.clients[0].netconnection=server;
  for(const enhanced of [true,false]){
   vars.Cvar_SetValue('r_hdr',enhanced?1:0);Cmd_ExecuteString('load independent_respawn_owned',src_command);await Promise.resolve();check(sv.active&&sv.loadgame,'actual host load reconstructed native local world');same(sv.name,'e1m1','actual host load restores saved map');same(drops().length,expected.length,'actual host load restores only unclaimed persistent pickups');same(JSON.stringify(sv.edicts[1]._respawn),savedState,'actual host load preserves completed death metadata');
   for(const prior of expected){const e=drops().find(e=>JSON.stringify(e._respawnDrop)===prior.record);check(e,'exact payload survived full host reload');same(text(e.v.model),prior.model,'recorded native drop model retained');same(sv.model_precache[e.v.modelindex],prior.model,'owned model index exists in destination precache');check(sv.models[e.v.modelindex]?.cache?.data,'actual native alias model is loaded, not a phantom name');prior.origin.forEach((v,i)=>near(e.v.origin[i],v,'saved settled position survives native text float precision',.001));}
   SV_CheckForNewClients();const active=svs.clients[0];check(active.active&&active.netconnection,'real loopback endpoint accepted after load');owned.push(cls.netcon,active.netconnection);const header=new TextDecoder('latin1').decode(active.message.data.subarray(0,active.message.cursize));for(const model of new Set(expected.map(e=>e.model)))check(header.includes(model),'actual generated connection header announces owned model '+model+' under '+(enhanced?'Newer':'Classic'));
   console.log('RESPAWN_PUBLIC_HOST_LOAD '+JSON.stringify({enhanced,drops:drops().length,models:expected.map(e=>({name:e.model,index:sv.model_precache.indexOf(e.model)})),headerBytes:active.message.cursize}));
  }
 }finally{
  for(const socket of new Set(owned))if(socket&&!socket.disconnected)NET_Close(socket);cls.netcon=savedSocket;cls.state=ca_disconnected;sv.active=false;for(const c of svs.clients)c.active=false;vars.Cvar_SetValue('r_hdr',1);if(storageDescriptor)Object.defineProperty(globalThis,'localStorage',storageDescriptor);else delete globalThis.localStorage;Cbuf_Init();
 }
});

Deno.test('enabling Newer after a real Classic spawn uses the original checkpoint rather than the later death location',()=>{
 const p=spawn('start',true,false),start=Array.from(p.v.origin),angles=Array.from(p.v.angles); // (the spawn spot's facing, as PutClientInServer set it)check(p._respawn==null,'Classic spawn has no admitted enhanced state');check(p._respawnStart,'native spawn records transient checkpoint');p.v.origin=[232,816,8];p.v.v_angle=[15,123,0];SV_LinkEdict(p,false);vars.Cvar_SetValue('r_hdr',1);const before=p.v.ammo_shells,s=kill(p);near(s.sourcePivot[0],232+1/32,'death captures relocated eye with native node-line bias');same(p._respawn.start.join(),start.join(),'late admission uses actual original spawn origin');same(p._respawn.startAngles.join(),angles.join(),'late admission retains original checkpoint orientation metadata');finish(p);same(Array.from(p.v.origin).join(),start.join(),'actual physics respawns at original checkpoint');same(drops().filter(e=>e._respawnDrop.ammo==='ammo_shells').reduce((sum,e)=>sum+e._respawnDrop.amount,0),before,'late admission also preserves actual default native ammo');
});

Deno.test('actual crossing and native spawn-parameter travel preserve admitted axe-only zero ammo, recovered overflow and presentation frame without hidden refills',()=>{
 const receipts=[];
 for(const recoverAll of [false,true]){
  const p=spawn('e1m2');inventory(p,[301,407,211,509]);kill(p);finish(p);if(recoverAll){settle(drops());for(const e of drops().slice())recover(p,e);p.v.weapon=Q.IT_ROCKET_LAUNCHER;call(p,'W_SetCurrentAmmo');}
  const expected={items:p.v.items,weapon:p.v.weapon,ammo:pools.map(a=>p.v[a]),current:p.v.currentammo,frame:p._respawn.frame.slice(),deaths:p._respawn.deaths};
  cross(p,travel.SV_SeamlessCrossings().find(c=>c.map==='e1m3'));SV_SaveSpawnparms();const client=svs.clients[0],nativeParms=Array.from(client.spawn_parms);Cbuf_Init();
  // The same saved native parms used by Host_Spawn are restored before its
  // real QC callback; the coordinator must repair that callback's minimum ammo.
  sv.active=false;SV_SpawnServer('e1m3');const arrived=client.edict;for(let i=0;i<16;i++)progs.pr_global_struct['parm'+(i+1)]=nativeParms[i];call(arrived,progs.pr_global_struct.ClientConnect);call(arrived,progs.pr_global_struct.PutClientInServer);travel.SV_SeamlessPlacePlayer(arrived);client.spawned=true;travel.SV_SeamlessHolding(1);sv.time+=5;SV_SetFrametime(.001);SV_Physics_Client(arrived,1);
  same(arrived.v.items&(127|Q.IT_AXE),expected.items&(127|Q.IT_AXE),'native transition preserves exact weapon ownership');same(arrived.v.weapon,expected.weapon,'native equipped weapon survives admission carry');same(pools.map(a=>arrived.v[a]).join(),expected.ammo.join(),'all four actual QC ammo pools retain exact carried amounts');same(arrived.v.currentammo,expected.current,'outside-interpreter finish refreshes the native equipped ammo');same(arrived._respawn.frame.join(),expected.frame.join(),'proper presentation frame survives map transition');same(arrived._respawn.deaths,expected.deaths,'death serial survives transition');check(!arrived._respawnAmmoPending,'deferred native ammo callback completes exactly once');
  const ammoBefore=pools.map(a=>arrived.v[a]).join();respawn.SV_RespawnFrame(arrived);same(pools.map(a=>arrived.v[a]).join(),ammoBefore,'repeat frame cannot apply carried inventory twice');
  if(!recoverAll){same(arrived.v.items&(127|Q.IT_AXE),Q.IT_AXE,'seamless exit never manufactures a shotgun');same(arrived.v.ammo_shells,0,'native minimum25shells cannot refill axe-only respawn');same(text(arrived.v.weaponmodel),'progs/v_axe.mdl','actual axe viewmodel survives zero-ammo travel');}
  receipts.push({recoverAll,ammo:expected.ammo,weapon:expected.weapon,frame:expected.frame,nativeParms});
  SV_SaveSpawnparms();SV_ClearCarriedPowerups();const fresh=spawn('e1m1');same(fresh._respawn.deaths,0,'fresh-map clearing discards old death serial');same(fresh._respawn.frame.join(),'0,0,0,1','fresh map does not inherit prior presentation frame');check(pools.map(a=>fresh.v[a]).join()!==expected.ammo.join(),'fresh map uses native initial loadout instead of queued custody');
 }
 console.log('RESPAWN_NATIVE_INVENTORY_TRAVEL '+JSON.stringify(receipts));
});

Deno.test('actual native low brush and uneven floor reject the old clear-height-ray arc while complete planned head sweeps stay outside BSP solids',()=>{
 const receipts=[];
 for(const kind of ['low-native-brush','uneven-native-floor']){
  const p=spawn();inventory(p,[0,0,0,0],Q.IT_AXE);p.v.origin=[128,1008,-199.95];p.v.v_angle=[0,kind==='low-native-brush'?0:180,0];SV_LinkEdict(p,false);const world=sv.worldmodel,vertices=world.vertexes.map(v=>Array.from(v.position));let obstacle=null;
  try{
   if(kind==='low-native-brush'){
    const index=sv.model_precache.indexOf('maps/b_shell0.bsp'),model=sv.models[index];check(index>0&&model?.hulls,'actual shipped ammunition BSP hull is available');const floor=SV_Move([128,1008,-199.95],[0,0,0],[0,0,0],[128,1008,-4096],MOVE_NOMONSTERS,p);check(!floor.startsolid&&floor.fraction<1,'native floor beneath source is known');
    obstacle=ED_Alloc();obstacle.v.classname=ED_NewString('independent_low_bsp_obstacle');obstacle.v.model=ED_NewString(model.name);obstacle.v.modelindex=index;obstacle.v.origin=[112,956,floor.endpos[2]];obstacle.v.mins=model.mins;obstacle.v.maxs=model.maxs;obstacle.v.size=Array.from(model.maxs,(v,i)=>v-model.mins[i]);obstacle.v.solid=4;obstacle.v.movetype=7;SV_LinkEdict(obstacle,false);
    const eye=[128,1008,-177.95],horizontal=SV_Move(eye,[-1,-1,-1],[1,1,1],[128,964,-177.95],MOVE_NOMONSTERS,p);same(horizontal.fraction,1,'old single-height lateral ray genuinely misses the real low brush');check(!horizontal.startsolid,'old ray begins in air');
   }
   const s=kill(p);check(!s.clearanceFallback,'bounded native witness has a complete planned rigid path');if(kind==='uneven-native-floor')check(s.descent<0,'actual raised contact floor exercises signed upward pivot adjustment');
   const baseline={...s,sourceDrift:[0,0,0],destinationDrift:[0,0,0],descent:0,destinationDrop:0};let oldFailures=0,plannedFailures=0,samples=0;
   for(const after of [false,true]){let previousOld=null,previousNew=null;for(let i=0;i<129;i++){
    const u=(after?.5:0)+.5*(i+.25)/129,time=s.at+.22+s.turn*u,old=Respawn_Sample(baseline,time).eye;const ot=SV_Move(previousOld||old,[-1,-1,-1],[1,1,1],old,MOVE_NOMONSTERS,p);if(ot.startsolid||ot.allsolid||ot.fraction<1)oldFailures++;previousOld=old;
    at(p,time);const actual=respawn.SV_RespawnView();check(actual,'actual owned view available throughout planned phase');const hit=SV_Move(previousNew||actual.eye,[-1,-1,-1],[1,1,1],actual.eye,MOVE_NOMONSTERS,p);if(hit.startsolid||hit.allsolid||hit.fraction<1)plannedFailures++;previousNew=actual.eye;samples++;
   }}
   check(oldFailures>0,'old uncorrected rigid arc intersects actual native obstacle/floor');same(plannedFailures,0,'dense offset-grid swept head path clears real BSP collision');finish(p);check(vertices.every((v,i)=>v.every((x,j)=>x===world.vertexes[i].position[j])),'planning preserves original map geometry');
   receipts.push({kind,samples,oldFailures,plannedFailures,descent:s.descent,destinationDrop:s.destinationDrop,sourceDrift:s.sourceDrift,destinationDrift:s.destinationDrift});
  }finally{if(obstacle&&!obstacle.free)ED_Free(obstacle);}
 }
 console.log('RESPAWN_NATIVE_CLEARANCE_REGRESSION '+JSON.stringify(receipts));
});

Deno.test('actual native ClientKill keeps server and wire health dead until contact and removes the real held alias mesh with or without inspection godmode',()=>{
 V_Init();render.R_Init();r_refdef.vrect.width=640;r_refdef.vrect.height=400;r_refdef.fov_y=75;r_refdef.fov_x=100;const receipts=[];
 function clientFrame(p){
  // Use the real server packet and client decoder: manually forcing HUD health
  // could hide a live server whose native ClientKill only set deadflag.
  SV_SetPlayer(p);const message=new sizebuf_t();SZ_Alloc(message,4096);SV_WriteClientdataToMessage(p,message);COM_SetNetMessage(message);CL_ParseServerMessage();
  cl.viewentity=1;cl.maxclients=1;cl.worldmodel=sv.worldmodel;cl.model_precache=sv.models.slice();cl.time=sv.time;cl.oldtime=cl.time;cl.intermission=0;cl.onground=false;cl.velocity.fill(0);cl.punchangle.fill(0);const e=cl_entities[1]||=(new entity_t());e.model=sv.models[p.v.modelindex];e.origin.set(p.v.origin);e.angles.set(p.v.angles);set_cl_numvisedicts(0);V_CalcRefdef();render.R_RenderScene();render.R_DrawViewModel();
  return{serverHealth:p.v.health,clientHealth:cl.stats[Q.STAT_HEALTH],model:text(p.v.weaponmodel),heldVisible:!!cl.viewent._aliasMesh?.parent&&cl.viewent._aliasMesh.visible,heldInScene:!!cl.viewent._aliasMesh&&render.scene.getObjectById(cl.viewent._aliasMesh.id)===cl.viewent._aliasMesh};
 }
 for(const god of [false,true]){
  const p=spawn();inventory(p);if(god)p.v.flags|=64;cl.worldmodel=sv.worldmodel;cl.model_precache=sv.models.slice();render.R_NewMap();const alive=clientFrame(p);check(alive.heldVisible&&alive.heldInScene,'actual native equipped weapon mesh is visible in positive control');const previousMesh=cl.viewent._aliasMesh;
  const s=kill(p,true);check(p.v.health<=0,'ClientKill callback returns an actually dead server player');same(text(p.v.weaponmodel),'','owned ClientKill removes native held model immediately');same(p.v.weaponframe,0,'owned ClientKill clears stale native held animation');same(p.v.takedamage,0,'dead owned body cannot regain gameplay interaction');
  const immediate=clientFrame(p);check(immediate.clientHealth<=0,'real protocol transmits dead health immediately');check(!immediate.heldVisible&&!immediate.heldInScene&&!previousMesh.parent,'actual next renderer scene removes prior held mesh instead of retaining a foreground gun');
  const phases=[];for(const age of [.1,.75,.22+s.turn/2-.001]){at(p,s.at+age);const frame=clientFrame(p);check(frame.serverHealth<=0&&frame.clientHealth<=0&&!s.respawned,'health stays dead on server and real wire before contact');check(!frame.heldVisible&&!frame.heldInScene&&!cl.viewent.model,'real held viewmodel remains absent throughout fall');phases.push({age,...frame});}
  at(p,s.at+.22+s.turn/2+1e-6);const contact=clientFrame(p);same(contact.serverHealth,100,'confirmed contact restores server100health');same(contact.clientHealth,100,'real client packet receives100onlyatcontact');same(contact.model,'progs/v_axe.mdl','confirmed contact actually equips native axe');check(contact.heldVisible&&contact.heldInScene,'new axe alias mesh is drawn only after contact');finish(p);receipts.push({god,alive,immediate,phases,contact});
 }
 console.log('RESPAWN_CLIENTKILL_REAL_HELD_MESH '+JSON.stringify(receipts));
});

Deno.test('full native physics clock advancement cannot move the camera into the next death phase before body health teleport and presentation frame',()=>{
 V_Init();render.R_Init();r_refdef.vrect.width=640;r_refdef.vrect.height=400;r_refdef.fov_y=75;r_refdef.fov_x=100;const receipts=[];
 for(const profile of [[.1],[.06,.11,.08]]){
  const p=spawn();inventory(p);p.v.origin=[128,1008,-199.95];p.v.v_angle=[15,123,0];SV_LinkEdict(p,false);cl.worldmodel=sv.worldmodel;cl.model_precache=sv.models.slice();render.R_NewMap();const s=kill(p,true),cut=s.at+.22+s.turn/2,originalFrame=s.frame.slice();let oldClockLeadFrames=0,seenContact=false,finished=false,steps=0;const transitions=[];
  for(;steps<100;steps++){
   const dt=profile[steps%profile.length],processedTime=sv.time;SZ_Clear(sv.datagram);SZ_Clear(svs.clients[0].message);SV_SetFrametime(dt);SV_Physics();near(sv.time,processedTime+dt,'actual SV_Physics advances its clock after processing all entities',1e-9);
   // The real view is requested AFTER the server clock has advanced, as in
   // the live engine. The former timestamp choice must cross this boundary.
   const active=p._respawn.sequence,pose=respawn.SV_RespawnView();
   SV_SetPlayer(p);const packet=new sizebuf_t();SZ_Alloc(packet,4096);SV_WriteClientdataToMessage(p,packet);COM_SetNetMessage(packet);CL_ParseServerMessage();cl.viewentity=1;cl.maxclients=1;cl.worldmodel=sv.worldmodel;cl.model_precache=sv.models.slice();cl.time=sv.time;cl.oldtime=cl.time;cl.onground=false;cl.velocity.fill(0);cl.punchangle.fill(0);const ent=cl_entities[1]||=(new entity_t());ent.model=sv.models[p.v.modelindex];ent.origin.set(p.v.origin);ent.angles.set(p.v.angles);set_cl_numvisedicts(0);V_CalcRefdef();render.R_RenderScene();render.R_DrawViewModel();
   if(!active){check(seenContact,'full loop reached actual contact before cleanup');same(p.v.health,100,'full-loop completion remains alive');same(p.v.movetype,3,'full-loop completion restores walk');same(p.v.takedamage,2,'full-loop completion restores damage');finished=true;break;}
   same(s.motionTime,processedTime,'owned sequence records exactly the processed physics time');const expectedAfter=processedTime>=cut;same(s.respawned,expectedAfter,'physical contact follows the processed phase');same(pose.after,expectedAfter,'view follows processed phase rather than incremented clock');same(p.v.health,expectedAfter?100:0,'authoritative health and visual phase agree');same(cl.stats[Q.STAT_HEALTH],p.v.health,'actual wire health agrees with full-loop phase');check(render.camera.position.distanceTo(new THREE.Vector3(...pose.eye))<.0002,'actual renderer camera uses the held authoritative eye phase');
   const rp=Math.max(0,Math.min(1,(processedTime-s.at-.22)/s.turn)),facing=riseFacing(s,expectedAfter?Math.max(0,Math.min(1,2*rp-1)):0),yaw=facing[1]*Math.PI/180,pitch=facing[0]*Math.PI/180,fd=new THREE.Vector3(Math.cos(s.angles[1]*Math.PI/180),Math.sin(s.angles[1]*Math.PI/180),0),f=new THREE.Vector3(Math.cos(yaw),Math.sin(yaw),0),r=new THREE.Vector3(Math.sin(yaw),-Math.cos(yaw),0),u=new THREE.Vector3(0,0,1),baseUp=u.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(f,Math.sin(pitch)),baseForward=f.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(u,-Math.sin(pitch));
   const progress=Math.max(0,Math.min(1,(processedTime-s.at-.22)/s.turn)),theta=Math.PI*(progress-Math.sin(2*Math.PI*progress)/(2*Math.PI)),base=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r,baseUp,baseForward.negate())),absolute=new THREE.Quaternion().fromArray(originalFrame).multiply(expectedAfter?axis(fd,-Math.PI).multiply(axis(f,theta-Math.PI)):axis(f,theta)).multiply(base);
   check(1-Math.abs(absolute.dot(render.camera.userData.clockwisePresentation.quaternion))<2e-7,'actual camera and transported P frame use the same processed phase without a hidden half-turn');
   const held=cl.viewent._aliasMesh;same(!!held?.parent&&held.visible,expectedAfter,'actual held mesh is absent before physical contact and axe appears afterward');
   if(Respawn_Sample(s,sv.time).after!==expectedAfter){oldClockLeadFrames++;transitions.push({processedAge:processedTime-s.at,clockAge:sv.time-s.at,viewAfter:pose.after,physicalAfter:s.respawned,health:p.v.health,oldCameraWouldBeAfter:Respawn_Sample(s,sv.time).after});}
   if(expectedAfter&&!seenContact){same(Array.from(p.v.origin).join(),p._respawn.start.join(),'physical position teleports in the same frame as the camera');transitions.push({processedAge:processedTime-s.at,clockAge:sv.time-s.at,contact:true,health:p.v.health});seenContact=true;}
  }
  check(finished&&steps<100,'bounded real physics loop completes sequence');check(oldClockLeadFrames>0,'test genuinely straddles the former post-increment camera timing gap');receipts.push({profile,steps:steps+1,oldClockLeadFrames,transitions});
 }
 console.log('RESPAWN_FULL_PHYSICS_PHASE_COHERENCE '+JSON.stringify(receipts));
});
