// Independent v4.4 native adapter checks. Real bundled QC owns all deadlines;
// tests move the player into real BSP water and advance only the server clock.
// Save/load uses the actual host commands with isolated in-memory storage.
import {readFileSync} from 'node:fs';
import * as pak from '../src/pak.js';
import {VID_SetPalette} from '../src/vid.js';
import {Mod_Init} from '../src/gl_model.js';
import {PR_InitBuiltins} from '../src/pr_cmds.js';
import {PR_ExecuteProgram} from '../src/pr_exec.js';
import * as progs from '../src/progs.js';
import {ED_FindFunction,GetEdictFieldValue} from '../src/pr_edict.js';
import {sv,svs,client_t,set_host_client,skill,MOVETYPE_NOCLIP} from '../src/server.js';
import {SV_CheckForNewClients,SV_WriteClientdataToMessage} from '../src/sv_main.js';
import {SV_SetPlayer,SV_CheckWater,sv_gravity} from '../src/sv_phys.js';
import {SV_User_SetCallbacks} from '../src/sv_user.js';
import {SV_Move,MOVE_NORMAL,SV_LinkEdict} from '../src/world.js';
import * as cmd from '../src/cmd.js';
import * as vars from '../src/cvar.js';
import {Host_InitCommands} from '../src/host_cmd.js';
import {Host_ServerFrame,set_host_frametime} from '../src/host.js';
import {CL_Init,CL_Disconnect_f,CL_ClearState} from '../src/cl_main.js';
import {cls,cl,ca_disconnected} from '../src/client.js';
import {NET_Init,NET_SendMessage,NET_GetMessage,NET_CanSendMessage} from '../src/net_main.js';
import {SZ_Clear,sizebuf_t,SZ_Alloc,COM_SetNetMessage} from '../src/common.js';
import {CL_ParseServerMessage} from '../src/cl_parse.js';
import {R_Init} from '../src/gl_rmain.js';
import {V_Init} from '../src/view.js';
import * as travel from '../src/sv_seamless.js';
import {R_DemoLoadingCancel} from '../src/r_demoloading.js';
import {SV_FaceLocalActive} from '../src/sv_faceevents.js';
import {R_FaceWater,R_PlayerFaceFrame} from '../src/r_facegame.js';
import {IT_SUIT,IT_QUAD,STAT_HEALTH} from '../src/quakedef.js';
import {CONTENTS_WATER} from '../src/bspfile.js';

const check=(value,label)=>{if(!value)throw Error(label);};
const same=(actual,expected,label)=>check(actual===expected,`${label}: ${actual} != ${expected}`);
const near=(actual,expected,label,epsilon=.0001)=>check(Math.abs(actual-expected)<epsilon,`${label}: ${actual} != ${expected}`);
const text=index=>progs.PR_GetString(index);
const bytes=readFileSync(new URL('../pak0.pak',import.meta.url));
pak.COM_AddPack(pak.COM_LoadPackFile('pak0.pak',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)));
VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);Mod_Init();PR_InitBuiltins();
cmd.Cbuf_Init();cmd.Cmd_Init();CL_Init();R_Init();V_Init();Host_InitCommands();
for(const c of[skill,sv_gravity,travel.sv_seamless])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
svs.maxclients=svs.maxclientslimit=1;svs.clients=[new client_t()];NET_Init();cls.state=ca_disconnected;cls.demoplayback=false;
SV_User_SetCallbacks({NET_GetMessage,set_host_client});

function acknowledge(){const c=svs.clients[0];if(c?.active&&c.netconnection&&cls.netcon&&!cls.netcon.disconnected&&c.message.cursize&&NET_CanSendMessage(c.netconnection)){NET_SendMessage(c.netconnection,c.message);NET_GetMessage(cls.netcon);SZ_Clear(c.message);}}
async function command(value){
 acknowledge();cmd.Cmd_ExecuteString(value,cmd.src_command);await Promise.resolve();SV_CheckForNewClients();
 const c=svs.clients[0];check(c.active&&c.netconnection&&cls.netcon?.driverdata===c.netconnection,'actual local paired connection');
 set_host_client(c);SV_SetPlayer(c.edict);cmd.Cmd_ExecuteString('spawn',cmd.src_client);cmd.Cmd_ExecuteString('begin',cmd.src_client);
 cls.signon=4;cl.intermission=0;acknowledge();R_DemoLoadingCancel();cl.worldmodel=sv.worldmodel;
 check(c.edict.v.health>0&&text(c.edict.v.classname)==='player','native player initialized');wire(c.edict);return c.edict;
}
async function fresh(){vars.Cvar_SetValue('r_hdr',1);vars.Cvar_SetValue('skill',1);vars.Cvar_SetValue('sv_seamless',1);return command('map e1m1');}
function native(player,name){
 SZ_Clear(sv.datagram);progs.pr_global_struct.self=progs.EDICT_TO_PROG(player);progs.pr_global_struct.time=sv.time;
 const fn=ED_FindFunction(name);check(fn,'bundled QC function '+name);PR_ExecuteProgram(progs.pr_functions.indexOf(fn));
}
function field(player,name){const f=GetEdictFieldValue(player,name);check(f,'native '+name+' exists');return f.accessor.getFloat(f.ofs);}
function wire(player){const packet=new sizebuf_t();SZ_Alloc(packet,8192);SV_SetPlayer(player);SV_WriteClientdataToMessage(player,packet);COM_SetNetMessage(packet);CL_ParseServerMessage();cl.time=sv.time;}
function snapshot(player){return JSON.stringify({health:player.v.health,items:player.v.items,waterlevel:player.v.waterlevel,watertype:player.v.watertype,air:field(player,'air_finished'),suit:field(player,'radsuit_finished'),origin:Array.from(player.v.origin)});}
function observe(player){wire(player);const before=snapshot(player),result=R_PlayerFaceFrame();same(snapshot(player),before,'HUD observation cannot change native health, timers, items or water');return result;}
function submerged(player){
 for(const leaf of sv.worldmodel.leafs){
  if(leaf.contents!==CONTENTS_WATER)continue;const b=leaf.minmaxs;
  for(const fx of[.5,.25,.75])for(const fy of[.5,.25,.75])for(let z=b[2]+25;z<b[5]-22;z+=8){
   const point=[b[0]+(b[3]-b[0])*fx,b[1]+(b[4]-b[1])*fy,z];
   const trace=SV_Move(point,player.v.mins,player.v.maxs,point,MOVE_NORMAL,player);
   if(trace.startsolid||trace.allsolid)continue;player.v.origin=point;SV_CheckWater(player);
   if(player.v.waterlevel===3){SV_LinkEdict(player,false);return point;}
  }
 }
 throw Error('No collision-free fully submerged E1M1 position found');
}
function collectSuit(player,renew=false){
 const item=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='item_artifact_envirosuit');check(item,'actual E1M1 biosuit exists');
 if(renew)native(item,'SUB_regen');else if(item.v.solid!==1&&item.v.think){progs.pr_global_struct.self=progs.EDICT_TO_PROG(item);PR_ExecuteProgram(item.v.think);}
 same(item.v.solid,1,'native pickup armed');progs.pr_global_struct.other=progs.EDICT_TO_PROG(player);native(item,'powerup_touch');
 check(player.v.items&IT_SUIT,'native touch awards suit');near(field(player,'radsuit_finished')-sv.time,30,'native suit duration remains thirty seconds');
 return item;
}
function advancePowers(player,time){check(time>=sv.time,'bounded clock advances');let ticks=0;while(sv.time<time){sv.time=Math.min(time,sv.time+.1);native(player,'CheckPowerups');check(++ticks<1000,'native power loop bounded');}}

Deno.test('v4.4 actual BSP submersion follows native air deadline and only QC can cause drowning',async()=>{
 const p=await fresh();check(SV_FaceLocalActive(),'native observer authority established');const surface=Array.from(p.v.origin);
 SV_CheckWater(p);check(p.v.waterlevel<3,'spawn has air');native(p,'WaterMove');const deadline=field(p,'air_finished');
 near(deadline-sv.time,12,'native WaterMove supplies twelve seconds');submerged(p);const health=p.v.health;
 for(let stage=0;stage<=9;stage++){
  sv.time=deadline-12+stage*1.2+.00001;native(p,'WaterMove');const value=observe(p);
  same(value.waterKnown,true,'native air is known');same(value.waterStage,stage,'actual native air stage '+stage);
  near(value.waterPercent,stage*10,'percentage follows deadline',.001);same(value.divingSuit,false,'water cannot fabricate equipment');same(p.v.health,health,'air use before threshold causes no damage');
 }
 sv.time=deadline;native(p,'WaterMove');same(observe(p).waterStage,10,'deadline is full-water stage');same(p.v.health,health,'strict native drowning comparison has not fired at equality');
 const before=snapshot(p);for(let i=0;i<20;i++)R_FaceWater();same(snapshot(p),before,'repeated water-only reads never apply drowning');
 sv.time=deadline+.01;native(p,'WaterMove');check(p.v.health<health,'only actual QC past deadline applies drowning');same(observe(p).waterStage,10,'drowning keeps full-water display');
 p.v.origin=surface;SV_CheckWater(p);native(p,'WaterMove');near(field(p,'air_finished')-sv.time,12,'native surfacing replenishes air');same(observe(p).waterStage,0,'surface returns clear face');
 console.log('FACE_V44_NATIVE_AIR '+JSON.stringify({deadline,submergedStages:11,surface:surface,healthAfterNativeDrowning:p.v.health}));
 acknowledge();CL_Disconnect_f();
});

Deno.test('v4.4 actual suit pickup renewal and expiry control equipment and refill native air underwater',async()=>{
 const p=await fresh();SV_CheckWater(p);native(p,'WaterMove');submerged(p);const initialAir=field(p,'air_finished');
 sv.time=initialAir-6;native(p,'WaterMove');same(observe(p).waterStage,5,'unsuited submerged half reserve control');
 collectSuit(p);native(p,'CheckPowerups');let state=observe(p);check(state.divingSuit,'actual clientdata turns equipment on');same(state.waterStage,0,'native suit replenishment keeps water clear');
 const firstExpiry=field(p,'radsuit_finished');advancePowers(p,sv.time+9);collectSuit(p,true);native(p,'CheckPowerups');check(field(p,'radsuit_finished')>firstExpiry,'native renewal extends timer without new ownership bit');
 const expiry=field(p,'radsuit_finished');advancePowers(p,expiry+.01);state=observe(p);same(state.divingSuit,false,'actual expiry clientdata removes equipment');same(state.waterStage,0,'expiry leaves last native refreshed reserve');
 const air=field(p,'air_finished');sv.time=air-6;native(p,'WaterMove');same(observe(p).waterStage,5,'air starts depleting only after suit refill ends');
 const mode=p.v.movetype;p.v.movetype=MOVETYPE_NOCLIP;same(observe(p).waterStage,0,'noclip cannot display inferred drowning');p.v.movetype=mode;
 native(p,'ClientKill');wire(p);state=R_PlayerFaceFrame();same(state.eyeState,'dead','native death closes eyes');same(state.expression,'focused_determined','native death uses requested expression');same(state.waterStage,0,'dead player does not continue water progression');
 console.log('FACE_V44_NATIVE_SUIT '+JSON.stringify({firstExpiry,renewedExpiry:expiry,airAfterExpiry:air}));
 acknowledge();CL_Disconnect_f();
});

Deno.test('v4.4 actual host save/load restores native air and active suit without a HUD timer sidecar',async()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),saved=new Map();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{setItem:(k,v)=>saved.set(k,String(v)),getItem:k=>saved.get(k)??null,removeItem:k=>saved.delete(k)}});
 try{
  for(const suited of[false,true]){
   let p=await fresh();SV_CheckWater(p);native(p,'WaterMove');submerged(p);
   if(suited){collectSuit(p);advancePowers(p,sv.time+6);}else{sv.time=field(p,'air_finished')-6;native(p,'WaterMove');}
   const original=observe(p),savedTime=sv.time,air=field(p,'air_finished'),suit=field(p,'radsuit_finished'),name='face_v44_'+(suited?'suit':'air');
   cmd.Cmd_ExecuteString('save '+name,cmd.src_command);const encoded=saved.get('quake_save_'+name);
   check(encoded?.startsWith('5\n'),'real host command writes version-five save');check(encoded.includes('"air_finished"'),'native air field serialized');if(suited)check(encoded.includes('"radsuit_finished"'),'native suit deadline serialized');
   sv.time+=4;native(p,'CheckPowerups');const oldEdicts=sv.edicts;p=await command('load '+name);check(sv.edicts!==oldEdicts,'actual load gives a fresh native epoch');
   near(sv.time,savedTime,'server clock restored');near(field(p,'air_finished'),air,'exact saved air restored');near(field(p,'radsuit_finished'),suit,'exact saved suit restored');
   const restored=observe(p);near(restored.waterPercent,original.waterPercent,'HUD derives saved air reserve');same(restored.divingSuit,original.divingSuit,'HUD derives saved equipment');same(restored.eyeState,'open','load resets transient eyelids');
   if(suited){advancePowers(p,suit+.01);same(observe(p).divingSuit,false,'loaded suit expires at original native deadline');}
  }
 }finally{acknowledge();CL_Disconnect_f();if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage;}
});

Deno.test('v4.4 paused native host freezes air and unknown demo or remote state never borrows local air',async()=>{
 const p=await fresh();SV_CheckWater(p);native(p,'WaterMove');submerged(p);sv.time=field(p,'air_finished')-6;native(p,'WaterMove');
 const before=observe(p),time=sv.time;sv.paused=true;set_host_frametime(.1);
 try{for(let i=0;i<12;i++){acknowledge();Host_ServerFrame();wire(p);near(sv.time,time,'actual paused host cannot advance native time');near(R_PlayerFaceFrame().waterPercent,before.waterPercent,'paused face retains air');}}finally{sv.paused=false;}
 const socket=cls.netcon,driver=socket.driver;
 try{
  cls.demoplayback=true;cl.items|=IT_SUIT;let state=R_PlayerFaceFrame();same(state.waterKnown,false,'demo air is explicitly unknown');same(state.waterStage,0,'demo cannot borrow live air');check(state.divingSuit,'demo protocol suit bit still supplies equipment');
  cls.demoplayback=false;socket.driver=1;state=R_PlayerFaceFrame();same(state.waterKnown,false,'remote socket cannot read native air');same(state.waterStage,0,'remote uses honest clear fallback');
 }finally{cls.demoplayback=false;socket.driver=driver;wire(p);}
 near(R_PlayerFaceFrame().waterPercent,before.waterPercent,'return to live restores actual native air');
 cl.stats[STAT_HEALTH]=0;cl.items|=IT_QUAD;same(R_PlayerFaceFrame().eyeState,'dead','death beats stale Quad');
 CL_ClearState();const frame=R_PlayerFaceFrame();same(frame.waterKnown,false,'cleared client cannot borrow prior world air');
 acknowledge();CL_Disconnect_f();
});

Deno.test('v4.4 public clear-client and demo-file changes discard an active blink even with a forward clock',async()=>{
 const p=await fresh();observe(p);cl.time+=6;
 same(R_PlayerFaceFrame().eyeState,'blink','six seconds reaches every allowed first-blink schedule');
 const world=cl.worldmodel,time=cl.time;
 // Reinstall the same world and later clock without sampling the intermediate
 // cleared state: this catches reliance only on clock reversal/world changes.
 CL_ClearState();cl.worldmodel=world;cl.time=time+.01;cl.stats[STAT_HEALTH]=p.v.health;cl.items=p.v.items;
 same(R_PlayerFaceFrame().eyeState,'open','public clear-client resets pending blink at the same world and later time');
 const oldFile=cls.demofile;
 try{
  cls.demoplayback=true;cls.demofile={faceV44Fixture:1};cl.time=100;
  same(R_PlayerFaceFrame().eyeState,'open','demo gets independent initial eyelids');
  cl.time=106;same(R_PlayerFaceFrame().eyeState,'blink','demo has its own periodic schedule');
  cls.demofile={faceV44Fixture:2};cl.time=106.01;
  same(R_PlayerFaceFrame().eyeState,'open','different demo resets blink despite same world and forward time');
  same(R_FaceWater().waterKnown,false,'demo lifecycle never opens native server air access');
 }finally{cls.demoplayback=false;cls.demofile=oldFile;}
 acknowledge();CL_Disconnect_f();
});
