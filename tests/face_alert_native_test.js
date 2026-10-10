// (look names are the artwork's own, from the character's point of view: head_right/eyes_right look toward the screen's left)
// The face glances toward an off-screen enemy that has just noticed the player (card [F1]). Real QuakeC FoundTarget on a real
// connected local game, the real event hooks and the real face state; the sight sound is the game's own (FoundTarget -> SightSound).
// Hidden-HUD lifecycle and stock maps as in face_native_test.js.
import {readFileSync} from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init} from '../src/engine/render/gl_model.js';
import {PR_InitBuiltins} from '../src/engine/server/pr_cmds.js';
import {PR_ExecuteProgram} from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import {ED_FindFunction} from '../src/engine/progs/pr_edict.js';
import {sv,svs,client_t,set_host_client,skill} from '../src/engine/server/server.js';
import {SV_CheckForNewClients} from '../src/engine/server/sv_main.js';
import {SV_SetPlayer,SV_SetFrametime,SV_Physics_Client,sv_gravity} from '../src/engine/server/sv_phys.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import {Host_InitCommands} from '../src/engine/server/host_cmd.js';
import {CL_Init,CL_Disconnect_f} from '../src/engine/client/cl_main.js';
import {cls,cl,ca_disconnected} from '../src/engine/client/client.js';
import {NET_Init,NET_SendMessage,NET_GetMessage,NET_CanSendMessage} from '../src/engine/net/net_main.js';
import {SZ_Clear} from '../src/engine/common/common.js';
import {R_Init} from '../src/engine/render/gl_rmain.js';
import {V_Init} from '../src/engine/client/view.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import {R_DemoLoadingCancel} from '../src/newer/ui/r_demoloading.js';
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
const {OFS_PARM0}=await import('../src/engine/progs/pr_comp.js');
function native(p,n){progs.pr_global_struct.self=progs.EDICT_TO_PROG(p);progs.pr_global_struct.time=sv.time;const f=ED_FindFunction(n);check(f,'native '+n);PR_ExecuteProgram(progs.pr_functions.indexOf(f));}
function hit(p,source,amount){progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(source);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(source);progs.pr_globals_float[OFS_PARM0+9]=amount;native(p,'T_Damage');}
function equip(p,weapon,ammo=50){p.v.items=127|4096;p.v.weapon=weapon;p.v.ammo_shells=ammo;p.v.ammo_nails=ammo;p.v.ammo_rockets=ammo;p.v.ammo_cells=ammo;p.v.button0=1;native(p,'W_SetCurrentAmmo');}
import {FaceState} from '../src/newer/ui/face_state.js';
import {R_FaceAlerts,FACE_ALERT_ONSCREEN,faceAlertOnScreenLimit} from '../src/newer/ui/r_facegame.js';
import {r_refdef} from '../src/engine/render/render.js';
const near=(a,b,e,m)=>check(Math.abs(a-b)<=e,m+': '+a+' != '+b);
import {FL_MONSTER} from '../src/engine/server/server.js';
const monsters=()=>sv.edicts.filter(e=>e&&!e.free&&(e.v.flags&FL_MONSTER)&&text(e.v.classname).startsWith('monster_'));
// the player looks along +x (yaw 0) from a fixed spot; monster m is placed dx,dy away (world axes) and notices the player
function notice(p,m,dx,dy,{enemy=p}={}){p.v.origin=[1000,1000,100];p.v.v_angle=[0,0,0];m.v.origin=[p.v.origin[0]+dx,p.v.origin[1]+dy,p.v.origin[2]];m.v.enemy=progs.EDICT_TO_PROG(enemy);native(m,'FoundTarget');}
async function start(){const p=await fresh('e1m1');face.SV_FaceReset();face.SV_FaceDrain('alert');p.v.health=100;check(face.SV_FaceLocalActive(),'actual local loopback admitted');return p;}

Deno.test('FoundTarget for the player queues one alert event with the monster\'s position and the player\'s view',async()=>{
 const p=await start(),m=monsters()[0];check(m,'a stock monster exists');notice(p,m,0,300);
 const events=face.SV_FaceDrain('alert');same(events.length,1,'one alert event');const e=events[0];
 same(e.kind,'alert','kind');same(e.enemy,m.index,'which monster');check(Math.abs(e.source[1]-1300)<=60,'source is the monster\'s centre ('+e.source+')');
 same(e.origin.join(),'1000,1000,100','player origin');same(e.viewAngles.join(),'0,0,0','player view angles');
 same(face.SV_FaceDrain('alert').length,0,'drained');
});

Deno.test('only a monster that has made the player its enemy counts; not the dead, not another target; every notice is queued (the client chooses)',async()=>{
 const p=await start(),[m,n]=monsters();
 notice(p,m,0,300,{enemy:n});same(face.SV_FaceDrain('alert').length,0,'a monster that noticed another monster');
 p.v.health=0;notice(p,m,0,300);same(face.SV_FaceDrain('alert').length,0,'a dead player has no face reaction');p.v.health=100;
 notice(p,m,0,300);notice(p,n,0,-300);same(face.SV_FaceDrain('alert').length,2,'two monsters noticing in one moment are both queued, so a visible one cannot hide an unseen one');
});

Deno.test('the real respawn sequence wakes every monster through the game\'s own FoundTarget and queues no alert; a notice afterwards does',async()=>{
 const p=await start();p.v.armorvalue=0;
 native(p,'ClientKill');const s=p._respawn?.sequence;check(s,'a real death starts the sequence');face.SV_FaceDrain('alert');
 sv.time=s.at+.22+s.turn/2+.001;SV_SetFrametime(.001);SV_Physics_Client(p,1);
 check(s.respawned&&s.alerted>0,'contact ran the real SV_RespawnAlert over the level ('+s.alerted+' monsters)');
 same(face.SV_FaceDrain('alert').length,0,'none of those alerts reached the face');
 sv.time=s.at+.22+s.turn+.001;SV_Physics_Client(p,1);check(!p._respawn.sequence,'the sequence ended');
 const m=monsters()[0];sv.time+=1;notice(p,m,0,300);same(face.SV_FaceDrain('alert').length,1,'control: a monster noticing the player after the sequence is queued');
});

Deno.test('Classic, demos and other games emit nothing',async()=>{
 const p=await start(),m=monsters()[0];
 vars.Cvar_SetValue('r_hdr',0);notice(p,m,0,300);same(face.SV_FaceDrain('alert').length,0,'Classic: no event');vars.Cvar_SetValue('r_hdr',1);
 cls.demoplayback=true;sv.time+=1;notice(p,m,0,300);same(face.SV_FaceDrain('alert').length,0,'demo: no event');cls.demoplayback=false;
 svs.maxclients=2;sv.time+=1;notice(p,m,0,300);same(face.SV_FaceDrain('alert').length,0,'multiplayer: no event');svs.maxclients=1;
});

Deno.test('the face looks toward an off-screen enemy and ignores one on screen, by the live field of view',async()=>{
 const oldFov=r_refdef.fov_x;
 try{
  const faceAt=async(dx,dy,fov=0,gap=0)=>{r_refdef.fov_x=fov;const p=await start(),m=monsters()[0];sv.time+=1;notice(p,m,dx,dy);const state=new FaceState({random:()=>.99});state.reset(50);R_FaceAlerts(state,{time:50});const f=state.frame({time:50.01+gap,health:100});return {target:f.target,expression:f.expression};};
  const at=angle=>[300,300*Math.tan(angle*Math.PI/180)];
  // no field of view known: the 55 degree fallback
  same(faceAlertOnScreenLimit(),FACE_ALERT_ONSCREEN,'fallback when no field of view is known');
  const ahead=await faceAt(300,0),left=await faceAt(0,300),right=await faceAt(0,-300),behind=await faceAt(-300,0);
  same(ahead.target,'front','an enemy straight ahead is on screen: the face stays at the front');
  same(left.target,'head_right','an enemy to the left turns the head left');same(right.target,'head_left','an enemy to the right turns the head right');
  same(behind.target,'front','directly behind reads as the centred pose, like damage from behind');
  for(const f of [left,right])same(f.expression,'normal','a glance is not pain');
  // the live horizontal field of view: limit = half of it plus the margin
  for(const fov of [90,106,120]){r_refdef.fov_x=fov;const limit=fov/2+5;near(faceAlertOnScreenLimit(),limit,1e-9,'limit for fov '+fov);
   same((await faceAt(...at(limit-3),fov)).target,'front','fov '+fov+': 3 degrees inside the limit is on screen');
   check((await faceAt(...at(limit+3),fov)).target!=='front','fov '+fov+': 3 degrees outside the limit turns the face');}
  // a wide field of view shows more: 60 degrees is on screen at fov 120 and off screen at fov 90
  same((await faceAt(...at(60),120)).target,'front','60 degrees is on screen with a 120 degree field of view');check((await faceAt(...at(60),90)).target!=='front','but off screen with 90');
  for(const junk of [NaN,0,5,400,-30]){r_refdef.fov_x=junk;same(faceAlertOnScreenLimit(),FACE_ALERT_ONSCREEN,'an unusable field of view ('+junk+') falls back');}
 }finally{r_refdef.fov_x=oldFov;}
});

Deno.test('a visible monster waking first does not hide the unseen one that wakes with it',async()=>{
 r_refdef.fov_x=0;const p=await start(),[m,n]=monsters();
 notice(p,m,300,0);sv.time+=.1;notice(p,n,0,300); // one straight ahead, then one to the left a tenth of a second later
 const state=new FaceState({random:()=>.99});state.reset(50);R_FaceAlerts(state,{time:50});
 same(state.frame({time:50.01,health:100}).target,'head_right','the face turns to the monster it cannot see');
});

Deno.test('the client converts the event time to its own clock, and glances once per half second after the filter',async()=>{
 r_refdef.fov_x=0;const p=await start(),m=monsters()[0];
 // an event that happened 1.2 s of game time before it is shown has already run its second: no glance (without the conversion it would start now)
 notice(p,m,0,300);const state=new FaceState({random:()=>.99});state.reset(50);sv.time+=1.2;R_FaceAlerts(state,{time:50});
 same(state.frame({time:50.01,health:100}).target,'front','a notice 1.2 s old is over');
 const half=new FaceState({random:()=>.99});half.reset(50);sv.time+=1;notice(p,m,0,300);sv.time+=.5;R_FaceAlerts(half,{time:50});same(half.frame({time:50.01,health:100}).target,'head_right','a notice 0.5 s old is still being shown');
 const fresh=new FaceState({random:()=>.99});fresh.reset(50);sv.time+=1;notice(p,m,0,300);R_FaceAlerts(fresh,{time:50});same(fresh.frame({time:50.01,health:100}).target,'head_right','a fresh one is shown');
 // one glance per half second at the face
 const g=new FaceState({random:()=>.99});g.reset(60);g.alert({time:60,angle:90});g.alert({time:60.3,angle:-90});same(g.frame({time:60.31,health:100}).target,'head_left','a second alert within half a second is ignored');
 g.alert({time:60.6,angle:-90});same(g.frame({time:60.61,health:100}).target,'head_right','one after half a second counts');
});

Deno.test('FaceState.alert: a one-second directional glance that damage overrides and that never shows pain',()=>{
 const f=new FaceState({random:()=>.99});f.reset(10);
 f.alert({time:10,angle:90});let s=f.frame({time:10.01,health:100});
 same(s.target,'head_left','a sound 90 degrees to the right turns the head right');same(s.expression,'normal','no pain');
 s=f.frame({time:10.9,health:100});same(s.target,'head_left','still looking at 0.9 s');
 s=f.frame({time:11.2,health:100});same(s.target,'front','back to the front after a second');
 const g=new FaceState({random:()=>.99});g.reset(20);g.damage({time:20,healthLoss:10,amount:10,angle:-90});g.alert({time:20.1,angle:90});
 const d=g.frame({time:20.11,health:90});same(d.expression,'pain','the damage reaction is untouched');same(d.target,'head_right','and still looks at the attacker');
 const h=new FaceState({random:()=>.99});h.reset(30);h.alert({time:30,angle:90});h.damage({time:30.2,healthLoss:10,amount:10,angle:-90});
 const after=h.frame({time:30.21,health:90});same(after.expression,'pain','damage after an alert takes over');same(after.target,'head_right','and looks at the attacker');
 const k=new FaceState({random:()=>.99});k.reset(40);k.alert({time:40,angle:NaN});same(k.frame({time:40.01,health:100}).target,'front','a junk angle is ignored');
 k.life(0,41);k.alert({time:41,angle:90});const dead=k.frame({time:41.01,health:0});same(dead.dead,true,'dead');same(dead.target,'front','a dead face does not glance');
});
