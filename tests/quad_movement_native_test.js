// Independent Quad gameplay proof through native map/spawn/QC pickup and
// server movement/physics. Headless local loopback only; no browser or render
// loop is launched. The jump apex uses actual collision/gravity integration.
import {readFileSync} from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/vid.js';
import {Mod_Init} from '../src/gl_model.js';
import {PR_InitBuiltins} from '../src/engine/progs/pr_cmds.js';
import {PR_ExecuteProgram} from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import {ED_FindFunction} from '../src/engine/progs/pr_edict.js';
import {sv,svs,client_t,set_host_client,skill} from '../src/engine/server/server.js';
import {SV_CheckForNewClients} from '../src/engine/server/sv_main.js';
import {SV_SetPlayer,SV_SetFrametime,SV_Physics_Client,sv_gravity} from '../src/engine/server/sv_phys.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import {Host_InitCommands} from '../src/engine/server/host_cmd.js';
import {CL_Init,CL_Disconnect_f} from '../src/cl_main.js';
import {cls,cl,ca_disconnected} from '../src/client.js';
import {NET_Init,NET_SendMessage,NET_GetMessage,NET_CanSendMessage} from '../src/net_main.js';
import {SZ_Clear} from '../src/engine/common/common.js';
import {R_Init} from '../src/gl_rmain.js';
import {V_Init} from '../src/view.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import {R_DemoLoadingCancel} from '../src/r_demoloading.js';
const check=(x,m)=>{if(!x)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),text=i=>progs.PR_GetString(i);
const bytes=readFileSync(new URL('../pak0.pak',import.meta.url));
pak.COM_AddPack(pak.COM_LoadPackFile('pak0.pak',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)));
VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);Mod_Init();PR_InitBuiltins();cmd.Cbuf_Init();cmd.Cmd_Init();CL_Init();R_Init();V_Init();Host_InitCommands();
for(const c of[skill,sv_gravity,travel.sv_seamless])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
svs.maxclients=svs.maxclientslimit=1;svs.clients=[new client_t()];NET_Init();cls.state=ca_disconnected;cls.demoplayback=false;
function acknowledge(){const c=svs.clients[0];if(c?.active&&c.netconnection&&cls.netcon&&!cls.netcon.disconnected&&c.message.cursize&&NET_CanSendMessage(c.netconnection)){NET_SendMessage(c.netconnection,c.message);NET_GetMessage(cls.netcon);SZ_Clear(c.message);}}
function finishConnect(){SV_CheckForNewClients();const c=svs.clients[0];check(c.active&&c.netconnection&&cls.netcon?.driverdata===c.netconnection,'actual local loopback is paired');set_host_client(c);SV_SetPlayer(c.edict);cmd.Cmd_ExecuteString('spawn',cmd.src_client);cmd.Cmd_ExecuteString('begin',cmd.src_client);cls.signon=4;cl.intermission=0;acknowledge();R_DemoLoadingCancel();check(c.edict.v.health>0&&text(c.edict.v.classname)==='player','actual native spawn command initializes living player');return c.edict;}
async function command(value){acknowledge();cmd.Cmd_ExecuteString(value,cmd.src_command);await Promise.resolve();return finishConnect();}
async function fresh(map='e1m1'){vars.Cvar_SetValue('r_hdr',1);vars.Cvar_SetValue('skill',1);vars.Cvar_SetValue('sv_seamless',1);return command('map '+map);}
const face=await import('../src/newer/gameplay/sv_faceevents.js');
function native(p,n){progs.pr_global_struct.self=progs.EDICT_TO_PROG(p);progs.pr_global_struct.time=sv.time;const f=ED_FindFunction(n);check(f,'native '+n);PR_ExecuteProgram(progs.pr_functions.indexOf(f));}

const Q=await import('../src/engine/common/quakedef.js');
const {FL_ONGROUND,FL_JUMPRELEASED,MOVETYPE_WALK,MOVETYPE_NOCLIP}=await import('../src/engine/server/server.js');
const {SV_User_SetCallbacks,SV_ClientThink}=await import('../src/engine/server/sv_user.js');
const {V_CalcRoll}=await import('../src/view.js');
const {SV_Move,SV_LinkEdict}=await import('../src/engine/server/world.js');
const {GetEdictFieldValue}=await import('../src/engine/progs/pr_edict.js');
const quad=await import('../src/newer/gameplay/sv_quadmovement.js');
const {sv_maxspeed,sv_friction,sv_accelerate}=await import('../src/engine/server/sv_phys.js');
for(const variable of[sv_maxspeed,sv_friction,sv_accelerate])if(!vars.Cvar_FindVar(variable.name))vars.Cvar_RegisterVariable(variable);
const near=(a,b,m,tolerance=1e-4)=>check(Math.abs(a-b)<=tolerance,`${m}: ${a} != ${b}`);
function timer(p){const field=GetEdictFieldValue(p,'super_damage_finished');check(field,'native Quad expiry field exists');return field.accessor.getFloat(field.ofs);}
function pickupFor(p,renew=false){const pickup=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='item_artifact_super_damage');check(pickup,'actual E1M1 Quad exists');if(renew)native(pickup,'SUB_regen');else if(pickup.v.solid!==1&&pickup.v.think){progs.pr_global_struct.self=progs.EDICT_TO_PROG(pickup);PR_ExecuteProgram(pickup.v.think);}same(pickup.v.solid,1,'actual native trigger ready');progs.pr_global_struct.other=progs.EDICT_TO_PROG(p);native(pickup,'powerup_touch');check(p.v.items&Q.IT_QUAD,'native touch granted Quad');check(timer(p)>sv.time,'native touch starts authoritative timer');return pickup;}
function movement(p,command,{water=0,dt=.01,ticks=1}={}){const c=svs.clients[0];SV_User_SetCallbacks({host_client:c,V_CalcRoll});SV_SetPlayer(p);p.v.movetype=MOVETYPE_WALK;p.v.health=100;p.v.velocity=[0,0,0];p.v.v_angle=[0,0,0];p.v.angles=[0,0,0];p.v.punchangle=[0,0,0];p.v.waterlevel=water;p.v.flags=(p.v.flags|FL_ONGROUND)&~2048;c.cmd={forwardmove:command,sidemove:0,upmove:0};SV_SetFrametime(dt);for(let i=0;i<ticks;i++)SV_ClientThink();return Array.from(p.v.velocity);}
Deno.test('native QC Quad touch scales actual ground and water intent 1.5 including commands below speed cap',async()=>{
 const p=await fresh(),rows=[],cvars=[sv_maxspeed.value,sv_accelerate.value,sv_friction.value];const base=[];for(const water of[0,2])for(const command of[100,200,500])base.push({water,command,first:movement(p,command,{water})[0],steady:movement(p,command,{water,ticks:200})[0]});pickupFor(p);same(quad.SV_QuadMovementScale(p),1.5,'actual native pickup admits movement bonus');
 for(const trial of base){const first=movement(p,trial.command,{water:trial.water})[0],steady=movement(p,trial.command,{water:trial.water,ticks:200})[0];near(first/trial.first,1.5,'first native acceleration scales once');near(steady/trial.steady,1.5,'subcap or capped native speed scales once');rows.push({...trial,quadFirst:first,quadSteady:steady,ratio:steady/trial.steady});}same([sv_maxspeed.value,sv_accelerate.value,sv_friction.value].join(),cvars.join(),'movement never changes global cvars');console.log('QUAD_NATIVE_SPEED '+JSON.stringify(rows));acknowledge();CL_Disconnect_f();
});
Deno.test('native Quad renewal does not stack and QC expiry Classic death and nonwalking modes restore native movement',async()=>{
 const p=await fresh();const baseline=movement(p,100)[0];pickupFor(p);const firstTimer=timer(p);near(movement(p,100)[0]/baseline,1.5,'first pickup');sv.time+=5;pickupFor(p,true);check(timer(p)>firstTimer,'native touch extends expiry');near(movement(p,100)[0]/baseline,1.5,'renewal does not multiply bonus again');
 vars.Cvar_SetValue('r_hdr',0);near(movement(p,100)[0],baseline,'Classic actual movement unchanged');vars.Cvar_SetValue('r_hdr',1);p.v.health=0;same(quad.SV_QuadMovementScale(p),1,'dead player excluded');p.v.health=100;p.v.movetype=MOVETYPE_NOCLIP;same(quad.SV_QuadMovementScale(p),1,'noclip excluded');p.v.movetype=MOVETYPE_WALK;
 const socket=cls.netcon;cls.demoplayback=true;same(quad.SV_QuadMovementScale(p),1,'demo excluded');cls.demoplayback=false;const driver=socket.driver;socket.driver=1;same(quad.SV_QuadMovementScale(p),1,'remote excluded');socket.driver=driver;svs.maxclients=2;same(quad.SV_QuadMovementScale(p),1,'multiplayer excluded');svs.maxclients=1;
 sv.time=timer(p)+.01;same(quad.SV_QuadMovementScale(p),1,'expired timer rejects stale bit before next QC check');native(p,'PlayerPostThink');check(!(p.v.items&Q.IT_QUAD),'actual native QC removes expired bit');near(movement(p,100)[0],baseline,'actual expired movement returns to native');console.log('QUAD_NATIVE_LIFECYCLE '+JSON.stringify({firstTimer,expiredAt:sv.time,items:p.v.items}));acknowledge();CL_Disconnect_f();
});
function groundWithHeadroom(p){
 const centers=[Array.from(p.v.origin),...sv.edicts.filter(e=>e&&!e.free&&text(e.v.classname)==='item_artifact_super_damage').map(e=>Array.from(e.v.origin))];
 for(const center of centers)for(const dx of[0,64,-64,128,-128,256,-256])for(const dy of[0,64,-64,128,-128,256,-256]){
  const start=[center[0]+dx,center[1]+dy,center[2]+32],end=[start[0],start[1],start[2]-256],trace=SV_Move(start,p.v.mins,p.v.maxs,end,1,p);if(trace.startsolid||trace.allsolid||trace.fraction===1||trace.plane.normal[2]<.9)continue;
  const floor=Array.from(trace.endpos),up=SV_Move(floor,p.v.mins,p.v.maxs,[floor[0],floor[1],floor[2]+140],1,p);if(!up.startsolid&&up.fraction===1)return floor;
 }throw Error('No native grounded fixture with 140-unit collision headroom');
}
function jump(p,position,dt){
 p.v.origin=position;p.v.velocity=[0,0,0];p.v.health=100;p.v.movetype=MOVETYPE_WALK;p.v.waterlevel=0;p.v.button0=0;p.v.button2=0;p.v.flags|=FL_ONGROUND;p.v.flags&=~FL_JUMPRELEASED;SV_SetPlayer(p);SV_LinkEdict(p,false);SV_SetFrametime(dt);sv.time+=dt;SV_Physics_Client(p,1);check(p.v.flags&FL_ONGROUND,'actual physics confirms grounded start');check(p.v.flags&FL_JUMPRELEASED,'native released button arms jump');
 const start=p.v.origin[2];p.v.button2=1;sv.time+=dt;SV_Physics_Client(p,1);const first=p.v.velocity[2];check(first>0,'native QC accepted a positive jump impulse');check(!(p.v.flags&FL_ONGROUND)&&!(p.v.flags&FL_JUMPRELEASED),'native QC consumes actual ground/released flags');let apex=p.v.origin[2],steps=1;
 for(;steps<400;steps++){sv.time+=dt;SV_Physics_Client(p,1);apex=Math.max(apex,p.v.origin[2]);if(p.v.flags&FL_ONGROUND)break;}check(steps<400,'native collision returns player to ground');return{height:apex-start,first,steps,dt,start,apex};
}
Deno.test('native QC and collision gravity produce a measured 1.5 Quad jump height without held-button stacking',async()=>{
 const p=await fresh(),position=groundWithHeadroom(p),rows=[];for(const dt of[.01,.02]){
  vars.Cvar_SetValue('r_hdr',0);const classic=jump(p,position,dt);vars.Cvar_SetValue('r_hdr',1);const normal=jump(p,position,dt);near(normal.height,classic.height,'Newer without Quad preserves actual Classic apex');pickupFor(p,Boolean(p.v.items&Q.IT_QUAD));const boosted=jump(p,position,dt),ratio=boosted.height/normal.height;rows.push({position,normal,boosted,ratio});console.log('QUAD_NATIVE_APEX_SAMPLE '+JSON.stringify(rows.at(-1)));near(ratio,1.5,'measured finite-step apex matches 1.5',.00002);
  // Keep the button held after landing: QC must not admit another impulse.
  const grounded=p.v.origin[2];for(let i=0;i<5;i++){sv.time+=dt;SV_Physics_Client(p,1);check(p.v.velocity[2]<=0,'held jump is not boosted again');}near(p.v.origin[2],grounded,'held button does not launch a second jump');sv.time=timer(p)+.01;native(p,'PlayerPostThink');
 }console.log('QUAD_NATIVE_APEX '+JSON.stringify(rows));acknowledge();CL_Disconnect_f();
});

Deno.test('Quad jump guard rejects held airborne swimming and unaccepted native impulses',async()=>{
 const p=await fresh();pickupFor(p);p.v.movetype=MOVETYPE_WALK;p.v.health=100;p.v.waterlevel=0;p.v.button2=1;p.v.flags|=FL_ONGROUND|FL_JUMPRELEASED;p.v.velocity=[0,0,0];
 const acceptedStart=quad.SV_QuadJumpBegin(p);check(acceptedStart,'valid grounded released request observed');quad.SV_QuadJumpEnd(p,acceptedStart);same(p.v.velocity[2],0,'no positive native QC impulse cannot create a jump');
 p.v.velocity=[0,0,270];quad.SV_QuadJumpEnd(p,acceptedStart);same(p.v.velocity[2],270,'positive unrelated velocity with unchanged native flags is not a jump');
 p.v.flags&=~FL_ONGROUND;same(quad.SV_QuadJumpBegin(p),null,'airborne button cannot start bonus');p.v.flags|=FL_ONGROUND;p.v.flags&=~FL_JUMPRELEASED;same(quad.SV_QuadJumpBegin(p),null,'held button cannot start bonus');p.v.flags|=FL_JUMPRELEASED;p.v.waterlevel=2;same(quad.SV_QuadJumpBegin(p),null,'native swimming boost is not amplified as a ground jump');p.v.waterlevel=0;p.v.button2=0;same(quad.SV_QuadJumpBegin(p),null,'released button alone cannot start jump');acknowledge();CL_Disconnect_f();
});

Deno.test('measured Quad apex respects native gravity setting across fixed simulation step sizes',async()=>{
 const p=await fresh(),position=groundWithHeadroom(p),oldGravity=sv_gravity.string,rows=[];
 try{for(const [gravity,dt]of[[400,1/60],[1200,1/72],[800,1/30]]){vars.Cvar_SetValue('sv_gravity',gravity);const normal=jump(p,position,dt);pickupFor(p);const boosted=jump(p,position,dt),ratio=boosted.height/normal.height;rows.push({gravity,dt,normal,boosted,ratio});near(ratio,1.5,'actual native apex under gravity '+gravity,.00002);same(sv_gravity.value,gravity,'bonus does not mutate native gravity');sv.time=timer(p)+.01;native(p,'PlayerPostThink');check(!(p.v.items&Q.IT_QUAD),'native expiration resets each gravity trial');}console.log('QUAD_NATIVE_GRAVITY_APEX '+JSON.stringify(rows));}
 finally{vars.Cvar_Set('sv_gravity',oldGravity);acknowledge();CL_Disconnect_f();}
});
