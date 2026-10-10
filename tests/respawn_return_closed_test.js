// The way back to the previous level is shut once a respawn lands (card [3]): the server stops crossing it and warming it, the
// hidden arch surfaces are drawn again, and the renderer drops its window and view; forward exits and pads are untouched.
// Real QuakeC, real server, stock maps (E1M2 -> E1M3), the real level-view and portal modules.
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
import {Respawn_DropAmmo,Respawn_ParsePlayer} from '../src/newer/gameplay/respawn_record.js';
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
import { R_SetupLevelViews, R_LevelViewCount, R_ClearLevelViews, R_SyncLevelViews } from '../src/newer/render/r_levelview.js';
import { R_LevelPortalCount, R_LevelPortalMatrix, R_ClearPortals } from '../src/newer/render/gl_portal.js';
import { SV_TestEntityPosition } from '../src/engine/server/world.js';
import { R_HasArchHidden } from '../src/newer/render/r_archframe.js';
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

Deno.test('before a death the way back is open: it crosses, and its arch is hidden for the window',()=>{
 const {p,back}=arrive();check(back.closed!==true,'not closed');check(back.arch!==null,'the arch was measured');check(R_HasArchHidden(),'its arch surfaces are hidden for the window');
 cross(p,back);same(travel.SV_SeamlessPending()?.map,'e1m2','walking into it crosses back');travel.SV_SeamlessReset();
});

Deno.test('a completed respawn shuts the way back: no crossing, no warming, the arch drawn again, forward exits untouched, indices stable',()=>{
 const {p,back}=arrive();const all=travel.SV_SeamlessCrossings();const count=travel.SV_SeamlessCrossingCount();const forward=all.filter(c=>c.back!==true);check(forward.length>0,'E1M3 has forward exits ('+forward.length+')');
 const hadHidden=R_HasArchHidden();const warmed=[];travel.SV_SetWarmLevel(m=>warmed.push(m));
 inventory(p);kill(p);finish(p);
 same(back.closed,true,'the way back is shut once the respawn lands');same(travel.SV_SeamlessCrossingCount(),count,'the list keeps its length, so the picture\'s numbers hold');
 check(forward.every(c=>c.closed!==true),'no forward exit is shut');check(!R_HasArchHidden(),'the arch surfaces are drawn again'+(hadHidden?'':' (none were hidden)'));
 same(travel.SV_SeamlessCloseReturn(),0,'shutting it again changes nothing');
 // the player respawned at the start of E1M3, where the way back is: walking into it does nothing now
 warmed.length=0;p.v.origin=back.transform.center.map((v,i)=>v-back.transform.through[i]*40);SV_LinkEdict(p,false);travel.SV_SeamlessFrame();check(!warmed.includes('e1m2'),'the shut way back is not warmed');
 walkInto(p,back);same(travel.SV_SeamlessPending(),null,'walking into the shut way back does not cross');
 // a forward exit still crosses
 cross(p,forward.find(c=>c.exit&&c.exit.kind==='plane')||forward[0]);check(travel.SV_SeamlessPending(),'a forward exit still crosses after the respawn');
 travel.SV_SetWarmLevel(undefined);travel.SV_SeamlessReset();
});

Deno.test('a death in a level not entered by a crossing has no way back to shut and changes nothing',()=>{
 respawn.sv_respawnguard.value=0;const p=spawn('e1m3');check(!travel.SV_SeamlessCrossings().some(c=>c.back),'no way back on a fresh level');const count=travel.SV_SeamlessCrossingCount();
 inventory(p);kill(p);finish(p);same(travel.SV_SeamlessCrossingCount(),count,'the exits are as they were');check(travel.SV_SeamlessCrossings().every(c=>c.closed!==true),'nothing is shut');travel.SV_SeamlessReset();
});

Deno.test('the next level own way back is open and shuts at the respawn there; the earlier one stays shut',()=>{
 const {p,back}=arrive();inventory(p);kill(p);finish(p);same(back.closed,true,'shut after the first death');
 // out by a forward exit: that level's own way back is a new crossing
 const forward=travel.SV_SeamlessCrossings().find(c=>c.back!==true&&c.exit&&c.exit.kind==='plane');check(forward,'E1M3 has a forward plane exit');
 cross(p,forward);const next=travel.SV_SeamlessPending()?.map;check(next,'left through a forward exit');
 const q=spawn(next,false);travel.SV_SeamlessPlacePlayer(q);travel.SV_SeamlessHolding(1);sv.time+=5;const fresh=travel.SV_SeamlessCrossings().find(c=>c.back);check(fresh&&fresh.closed!==true,'a new level has its own open way back');
 inventory(q);kill(q);finish(q);same(fresh.closed,true,'which the next respawn shuts');travel.SV_SeamlessReset();
});

Deno.test('the renderer drops the window and the view of the shut way back, keeps the others, and builds nothing for it later',async()=>{
 const {p,back}=arrive();const scene=new THREE.Scene();const crossings=travel.SV_SeamlessCrossings();const index=crossings.indexOf(back);const others=crossings.filter(c=>c!==back&&c.opening).length;
 try{
  R_ClearPortals();R_SetupLevelViews(scene,crossings);const want=crossings.filter(c=>c.opening).length;const deadline=performance.now()+30000;while(R_LevelViewCount()<want&&performance.now()<deadline)await flush(20);
  same(R_LevelViewCount(),want,'every crossing has its view');check(R_LevelPortalMatrix(index),'and the way back has its window');
  R_SyncLevelViews();same(R_LevelViewCount(),want,'an open way back keeps its view');
  inventory(p);kill(p);finish(p);same(back.closed,true,'the server shut it');
  R_SyncLevelViews();same(R_LevelViewCount(),want-1,'its view is gone');same(R_LevelPortalMatrix(index),null,'and its window');same(R_LevelPortalCount(),want-1,'the other windows remain');
  let meshes=0;scene.traverse(o=>{if(o.name==='quake_level_portal')meshes++;});same(meshes,want-1,'and only their meshes are in the scene');
  R_SyncLevelViews();same(R_LevelViewCount(),want-1,'syncing again changes nothing');
  // a view still being built when the way back is shut is never built
  R_ClearLevelViews();R_ClearPortals();R_SetupLevelViews(scene,crossings);
  const wait=performance.now()+30000;while(R_LevelViewCount()<others&&performance.now()<wait)await flush(20);await flush(800); // (no sync: the set-up itself leaves it out)
  same(R_LevelViewCount(),others,'a shut way back gets no view on a later set-up');same(R_LevelPortalMatrix(index),null,'nor a window');
 }finally{R_ClearLevelViews();R_ClearPortals();travel.SV_SeamlessReset();}
});

// a soldier hunting the player when they leave E1M2 follows them into E1M3
function arriveWithFollower(){respawn.sv_respawnguard.value=0;let p=spawn('e1m2');const c=travel.SV_SeamlessCrossings().find(c=>c.map==='e1m3'),t=c.transform;
 p.v.origin=t.center.map((v,i)=>v-t.through[i]*32);SV_LinkEdict(p,false);
 const m=monstersNow().find(e=>(e.v.flags&FL_MONSTER)&&!(e.v.flags&2));check(m,'a monster in E1M2');
 let placed=false;for(const back of[70,90,110,130,150]){m.v.origin=t.center.map((v,i)=>v-t.through[i]*(32+back)+(i===2?4:0));SV_LinkEdict(m,false);if(!stuck(m)){placed=true;break;}}check(placed,'a spot for it behind the player');
 m.v.enemy=progs.EDICT_TO_PROG(p);m.v.health=Math.max(m.v.health,30);const name=text(m.v.classname);
 cross(p,c);same(travel.SV_SeamlessPending()?.map,'e1m3','the player leaves E1M2');
 p=spawn('e1m3',false);travel.SV_SeamlessPlacePlayer(p);return {p,class:name};}
function frames(p,seconds){SV_SetPlayer(p);for(let i=0;i<seconds*10;i++){sv.time+=.1;progs.pr_global_struct.time=sv.time;travel.SV_SeamlessFrame();}}

Deno.test('monsters that followed the player into the level do not step out of the way back once it is shut',()=>{
 // control: left alone, the follower comes through the doorway
 {const {p,class:name}=arriveWithFollower();const before=monstersNow().filter(e=>text(e.v.classname)===name).length;travel.SV_SeamlessHolding(1);sv.time+=5;frames(p,8);
  const after=monstersNow().filter(e=>text(e.v.classname)===name).length;same(after,before+1,'the follower arrives through the way back ('+name+')');travel.SV_SeamlessReset();}
 // the player dies before it has come through: it stays in the level it came from
 {const {p,class:name}=arriveWithFollower();const before=monstersNow().filter(e=>text(e.v.classname)===name).length;
  const back=travel.SV_SeamlessCrossings().find(c=>c.back);check(back,'a way back');inventory(p);kill(p);finish(p);same(back.closed,true,'shut');
  travel.SV_SeamlessHolding(1);sv.time+=5;frames(p,8);same(monstersNow().filter(e=>text(e.v.classname)===name).length,before,'no follower steps out of the shut doorway');
  const snap=travel.SV_LevelSnapshotEntities('e1m2');check(snap&&snap.some(e=>e.classname===name),'it is back in E1M2 as it was left');travel.SV_SeamlessReset();}
});


// Card [35]: the respawn rises facing into the level, its back to the way back (open or shut), or along the level's own start
// orientation where there is no way back. The turn happens during the rise (tests/respawn_native_test.js checks its continuity).
function restore(e,saved){ED_ParseEdict(saved.slice(saved.indexOf('{')+1),e);SV_LinkEdict(e,false);}
const yawDiff=(a,b)=>Math.abs(((a-b)%360+540)%360-180);
Deno.test('a respawn rises facing away from the way back, whatever way the player faced at death, also once the way back is shut',()=>{
 const {p,back}=arrive();const t=back.transform,entry=Math.atan2(-t.through[1],-t.through[0])*180/Math.PI;
 // the level's own start spot is turned a quarter away, so the way back (not the start orientation) must be what decides
 const spot=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='info_player_start');spot.v.angles[1]=entry+90;
 for(const deathYaw of [0,90,200,300]){
  inventory(p);p.v.v_angle=[30,deathYaw,0];p.v.angles=[0,deathYaw,0];kill(p);const s=p._respawn.sequence;check(s.riseAngles,'the sequence records the facing to rise to');
  // half way through the rise the view has turned part of the way, by the shorter way round
  const mid=Respawn_Sample(s,s.at+.22+s.turn*.75),midYaw=mid.angles[1],whole=yawDiff(deathYaw,entry);
  if(whole>20)check(Math.abs(yawDiff(midYaw,deathYaw)+yawDiff(midYaw,entry)-whole)<.5&&yawDiff(midYaw,deathYaw)>1&&yawDiff(midYaw,entry)>1,'mid-rise facing '+midYaw.toFixed(1)+' lies between '+deathYaw+' and '+entry.toFixed(1)+' the short way');
  finish(p);
  check(yawDiff(p.v.angles[1],entry)<.01,'death facing '+deathYaw+': rises facing into the level ('+p.v.angles[1].toFixed(2)+' vs '+entry.toFixed(2)+')');check(yawDiff(p.v.v_angle[1],entry)<.01,'the view angle too');same(p.v.angles[0],0,'level pitch');same(p.v.fixangle,1,'the client is told');
  same(back.closed,true,'(the way back is shut after the first death and still gives the facing)');
 }
 travel.SV_SeamlessReset();
});

Deno.test('with no way back the respawn rises along the level\'s own start orientation; the facing survives a save made mid-death',()=>{
 respawn.sv_respawnguard.value=0;const p=spawn('e1m3');check(!travel.SV_SeamlessCrossings().some(c=>c.back),'no way back');
 const start=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='info_player_start');const yaw=start.v.angles[1];
 inventory(p);p.v.v_angle=[10,yaw+137,0];kill(p);const s=p._respawn.sequence;check(yawDiff(s.riseAngles[1],yaw)<1e-6,'the rise target is the start orientation');
 // a save made during the fall keeps the target
 const lines=[];ED_Write(lines,p);const saved=lines.join('\n');check(saved.includes('riseAngles'),'the target is in the saved game');restore(p,saved);check(yawDiff(p._respawn.sequence.riseAngles[1],yaw)<1e-6,'and back after loading it');
 finish(p);check(yawDiff(p.v.angles[1],yaw)<.01,'rises along the start orientation ('+p.v.angles[1]+' vs '+yaw+')');
 // a malformed target is refused by the save reader
 const record=JSON.parse(JSON.stringify(p._respawn));record.sequence={...s,riseAngles:[0,'x',0]};check(Respawn_ParsePlayer(JSON.stringify(record))===null,'a malformed rise target makes the record invalid');record.sequence={...s};check(Respawn_ParsePlayer(JSON.stringify(record))!==null,'a well-formed one is accepted');delete record.sequence.riseAngles;check(Respawn_ParsePlayer(JSON.stringify(record))!==null,'and an old save without one still loads (it rises as it fell)');
 travel.SV_SeamlessReset();
});

const STEP=360/256;
// The client is told its final view angle in a byte; the rise eases to a yaw the byte can carry exactly, so the view the client
// is left with is the one the rise ended on: no snap at the hand-off, whatever the start spot's yaw.
function clientView(p){SV_SetPlayer(p);const packet=new sizebuf_t();SZ_Alloc(packet,4096);SV_WriteClientdataToMessage(p,packet);COM_SetNetMessage(packet);CL_ParseServerMessage();return Array.from(cl.viewangles);}
Deno.test('the client is left exactly where the rise ended, also for a start spot facing an odd yaw; forward exits never steer the facing',()=>{
 for(const yaw of [270,30,61.7,-133.3,179.99999999999997]){
  respawn.sv_respawnguard.value=0;const p=spawn('e1m3');cl.viewentity=1;cl.maxclients=1;
  const start=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='info_player_start');start.v.angles[1]=yaw;
  inventory(p);p.v.v_angle=[10,yaw+100,0];kill(p);const s=p._respawn.sequence,last=Respawn_Sample(s,s.at+.22+s.turn-1e-4);
  check(yawDiff(s.riseAngles[1],yaw)<STEP/2+1e-9,'spot '+yaw+': the rise ends within half a step of the spot ('+s.riseAngles[1]+')');
  finish(p);const view=clientView(p);
  check(yawDiff(view[1],s.riseAngles[1])<1e-6,'spot '+yaw+': the client decodes the very yaw the rise ended on ('+view[1]+' vs '+s.riseAngles[1]+')');
  check(yawDiff(view[1],last.angles[1])<.05&&Math.abs(view[0]-last.angles[0])<.05,'and it matches the last drawn rise pose ('+last.angles.map(v=>v.toFixed(3))+')');
  travel.SV_SeamlessReset();
 }
 // a fresh E1M2 has a forward exit and no way back: the facing is never taken from the forward exit
 respawn.sv_respawnguard.value=0;spawn('e1m2');const fwd=travel.SV_SeamlessCrossings().find(c=>c.back!==true);check(fwd,'a forward exit');same(travel.SV_SeamlessEntryYaw(fwd.transform.center),null,'standing on a forward exit gives no facing');travel.SV_SeamlessReset();
});
