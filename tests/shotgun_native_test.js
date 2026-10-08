// The native rays of the stock shotgun and super shotgun, observed through the actual QuakeC firing
// functions on a real local server (the same harness as face_native_test.js). This tests the read-only
// observer: it must see exactly the rays the game traced and change nothing.
import {readFileSync} from 'node:fs';
import * as pak from '../src/pak.js';
import {VID_SetPalette} from '../src/vid.js';
import {Mod_Init} from '../src/gl_model.js';
import {PR_InitBuiltins} from '../src/pr_cmds.js';
import {PR_ExecuteProgram} from '../src/pr_exec.js';
import * as progs from '../src/progs.js';
import {ED_FindFunction} from '../src/pr_edict.js';
import {sv,svs,client_t,set_host_client,skill} from '../src/server.js';
import {SV_CheckForNewClients} from '../src/sv_main.js';
import {SV_SetPlayer,SV_SetFrametime,SV_Physics_Client,sv_gravity} from '../src/sv_phys.js';
import * as cmd from '../src/cmd.js';
import * as vars from '../src/cvar.js';
import {Host_InitCommands} from '../src/host_cmd.js';
import {CL_Init,CL_Disconnect_f} from '../src/cl_main.js';
import {cls,cl,ca_disconnected} from '../src/client.js';
import {NET_Init,NET_SendMessage,NET_GetMessage,NET_CanSendMessage} from '../src/net_main.js';
import {SZ_Clear} from '../src/common.js';
import {R_Init} from '../src/gl_rmain.js';
import {V_Init} from '../src/view.js';
import * as travel from '../src/sv_seamless.js';
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
const face=await import('../src/sv_faceevents.js');
const {OFS_PARM0}=await import('../src/pr_comp.js');
function native(p,n){progs.pr_global_struct.self=progs.EDICT_TO_PROG(p);progs.pr_global_struct.time=sv.time;const f=ED_FindFunction(n);check(f,'native '+n);PR_ExecuteProgram(progs.pr_functions.indexOf(f));}
function hit(p,source,amount){progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(source);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(source);progs.pr_globals_float[OFS_PARM0+9]=amount;native(p,'T_Damage');}
function equip(p,weapon,ammo=50){p.v.items=127|4096;p.v.weapon=weapon;p.v.ammo_shells=ammo;p.v.ammo_nails=ammo;p.v.ammo_rockets=ammo;p.v.ammo_cells=ammo;p.v.button0=1;native(p,'W_SetCurrentAmmo');}
const {SV_PointContents,SV_Move}=await import('../src/world.js');
const {SV_LinkEdict}=await import('../src/world.js');
const rays=await import('../src/sv_shotrays.js'),delay=await import('../src/sv_shotdelay.js'),flight=await import('../src/shotgun_flight.js');
if(!vars.Cvar_FindVar('sv_shotdelay'))vars.Cvar_RegisterVariable(delay.sv_shotdelay);
const fire=(p,weapon,ammo=50)=>{equip(p,weapon,ammo);face.SV_FaceReset();native(p,'W_Attack');return face.SV_FaceDrain('rays');};
const unit=(a,b)=>{const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],n=Math.hypot(...d);return d.map(x=>x/n);};

Deno.test('a native shotgun blast hands over exactly its six pellet rays',async()=>{
 const p=await fresh('e1m1');p.v.v_angle=[0,90,0];
 const events=fire(p,1);same(events.length,1,'one blast, one rays event');const e=events[0];
 same(e.kind,'rays','kind');same(e.function,'W_FireShotgun','the shotgun');same(e.weapon,1,'weapon id');same(e.rays.length,6,'six pellets');
 for(const ray of e.rays){check(ray.start.length===3&&ray.end.length===3&&[...ray.start,...ray.end].every(Number.isFinite),'finite ray');same(ray.start.join(),e.rays[0].start.join(),'every ray starts at the shooter');check(Math.hypot(ray.end[0]-ray.start[0],ray.end[1]-ray.start[1],ray.end[2]-ray.start[2])>1,'a ray goes somewhere');}
 // the player looks along +Y (yaw 90); each pellet leaves that by the game's own spread (0.04 x 0.04 for the shotgun)
 const aim=[0,1,0];let spread=0;
 for(const ray of e.rays){const d=unit(ray.start,ray.end),dot=aim[0]*d[0]+aim[1]*d[1]+aim[2]*d[2];spread=Math.max(spread,Math.acos(Math.min(1,dot))*180/Math.PI);}
 check(spread>.2&&spread<4,'pellets spread around the line of sight by the native amount, up to '+spread.toFixed(2)+' degrees');
 console.log('SHOT_RAYS_SHOTGUN '+JSON.stringify({rays:e.rays.length,spreadDeg:+spread.toFixed(3),submerged:e.submerged}));
});
Deno.test('the super shotgun gives fourteen pellets, and its one-shell fallback is the single gun\'s blast, once',async()=>{
 const p=await fresh('e1m1');p.v.v_angle=[0,0,0];
 const e=fire(p,2,50);same(e.length,1,'one blast');same(e[0].function,'W_FireSuperShotgun','the super shotgun');same(e[0].rays.length,14,'fourteen pellets');
 const f=fire(p,2,1);same(f.length,1,'the nested fallback is one blast, not two');same(f[0].function,'W_FireShotgun','which is the single gun\'s');same(f[0].rays.length,6,'with six pellets');
});
Deno.test('only confirmed shotgun blasts count: dry fire, other weapons, demos, remote and multiplayer give no rays',async()=>{
 let p=await fresh('e1m1');
 same(fire(p,1,0).length,0,'dry fire');
 for(const w of[4096,4,8,16,32,64])same(fire(p,w).length,0,'weapon '+w+' has no shotgun rays');
 equip(p,1);face.SV_FaceReset();const socket=cls.netcon;
 cls.demoplayback=true;native(p,'W_Attack');same(face.SV_FaceDrain('rays').length,0,'demo');cls.demoplayback=false;
 const driver=socket.driver;socket.driver=1;native(p,'W_Attack');same(face.SV_FaceDrain('rays').length,0,'remote socket');socket.driver=driver;
 svs.maxclients=2;native(p,'W_Attack');same(face.SV_FaceDrain('rays').length,0,'multiplayer');svs.maxclients=1;
 native(p,'W_Attack');p=await fresh('e1m2');same(face.SV_FaceDrain('rays').length,0,'a new world cannot replay old blasts');acknowledge();CL_Disconnect_f();
});
Deno.test('observing the rays changes nothing the game does (with the damage delay off): same random numbers, ammunition and last trace with or without it',async()=>{
 const run=async local=>{
  const p=await fresh('e1m1');p.v.v_angle=[0,45,0];let calls=0,seed=12345;const real=Math.random;
  Math.random=()=>{calls++;seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
  try{equip(p,2,50);face.SV_FaceReset();delay.sv_shotdelay.value=0;if(!local)svs.maxclients=2;native(p,'W_Attack');svs.maxclients=1;}finally{Math.random=real;delay.sv_shotdelay.value=1;}
  return {calls,ammo:p.v.ammo_shells,trace:Array.from(progs.pr_global_struct.trace_endpos).map(x=>+x.toFixed(4)).join(),events:face.SV_FaceDrain('rays')};
 };
 const watched=await run(true),unwatched=await run(false);
 same(watched.events.length,1,'the observer saw the blast');same(unwatched.events.length,0,'and does not when it is off');
 same(watched.calls,unwatched.calls,'the same number of random numbers consumed');check(watched.calls>=28,'(the game drew its spread: '+watched.calls+')');
 same(watched.ammo,unwatched.ammo,'the same ammunition');same(watched.trace,unwatched.trace,'the same last native trace');
 const last=watched.events[0].rays.at(-1).end.map(x=>+x.toFixed(4)).join();same(last,watched.trace,'and the last ray it kept is that trace');
});
Deno.test('water along a ray is found at the real surface, and a blast fired under water says so',async()=>{
 let p=await fresh('e2m1').catch(()=>null);
 // find real water in a stock map: a wet point with dry air above it
 const maps=['e1m3','e1m2','e1m5','e1m4','start'];let found=null;
 for(const m of maps){p=await fresh(m);const w=sv.worldmodel,lo=w.mins,hi=w.maxs;
  for(let x=lo[0];x<hi[0]&&!found;x+=48)for(let y=lo[1];y<hi[1]&&!found;y+=48)for(let z=lo[2];z<hi[2];z+=16){const a=[x,y,z];
   if(SV_PointContents(a)!==-3)continue;let top=null;for(let q=z;q<z+400;q+=2){if(SV_PointContents([x,y,q])===-1){top=q;break;}}
   let deep=true;for(const dz of[0,8,16,24,32,40])if(SV_PointContents([x,y,z-dz+0])!==-3&&dz===0)deep=false;
   if(top!==null&&top-z>=40&&SV_PointContents([x,y,z-40])===-3){found={map:m,x,y,bottom:z-40,top};break;}}
  if(found)break;}
 check(found,'a stock map with real water was found');console.log('WATER_FIXTURE '+JSON.stringify(found));
 p=await fresh(found.map);
 // a ray from the air down into the water: one span from the surface to the end of the sampled reach
 const above=[found.x,found.y,found.top+60],below=[found.x,found.y,found.bottom];
 const down=rays.rayWater(above,below);same(down.length,1,'one wet span going down');
 let surface=found.top;for(let q=found.top+60;q>found.bottom;q-=.25){if(SV_PointContents([found.x,found.y,q])===-3){surface=q;break;}}
 near(down[0][0],found.top+60-surface,1.2,'the span begins at the real surface');near(down[0][1],found.top+60-found.bottom,.01,'and runs to the end');
 const up=rays.rayWater(below,above);same(up.length,1,'one wet span going up');same(up[0][0],0,'it starts at the muzzle');near(up[0][1],surface-found.bottom,1.2,'and ends at the real surface');
 same(rays.rayWater(above,[found.x,found.y,found.top+200]).length,0,'a dry ray has none');
 // a real blast fired from under the surface, straight up
 p.v.origin=[found.x,found.y,found.bottom+24];p.v.velocity=[0,0,0];p.v.v_angle=[-90,0,0];SV_LinkEdict(p,false);
 const e=fire(p,1)[0];check(e,'a blast under water');check(e.submerged,'it is reported as submerged');
 check(e.rays.every(r=>r.water.length===1&&r.water[0][0]===0),'every ray starts wet and leaves the water once');
 console.log('SHOT_RAYS_WATER '+JSON.stringify({submerged:e.submerged,spans:e.rays.map(r=>r.water[0].map(x=>+x.toFixed(1)))}));
});
const near=(a,b,eps,m)=>check(Math.abs(a-b)<=eps,`${m}: ${a} != ${b}`);
Deno.test('a soldier\'s shotgun is observed the same way: his four native pellet rays, from his own trace start',async()=>{
 const p=await fresh('e1m2');face.SV_FaceReset();
 const soldier=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='monster_army');check(soldier,'a real native soldier in e1m2');
 soldier.v.enemy=progs.EDICT_TO_PROG(p);p.v.origin=[soldier.v.origin[0]+160,soldier.v.origin[1],soldier.v.origin[2]];SV_LinkEdict(p,false);
 native(soldier,'army_fire');const events=face.SV_FaceDrain('rays');
 check(!face.SV_FaceShotActive(),'no blast is left "active" after the soldier\'s shot, so later traces are never attributed to it');
 same(events.length,1,'one blast');const e=events[0];same(e.function,'army_fire','the soldier\'s firing function');same(e.enemy,soldier.index,'which soldier');same(e.rays.length,4,'FireBullets( 4 ) is four pellets');
 for(const r of e.rays){check(Math.hypot(r.start[0]-soldier.v.origin[0],r.start[1]-soldier.v.origin[1])<16,'the trace starts at the soldier, not at the player');check(Math.hypot(r.end[0]-r.start[0],r.end[1]-r.start[1])>8,'and goes somewhere');}
 const aimX=Math.sign(p.v.origin[0]-soldier.v.origin[0]);check(e.rays.every(r=>Math.sign(r.end[0]-r.start[0])===aimX),'towards the player');
 // not a soldier: other monsters and the player's own state are not mistaken for one
 const other=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname).startsWith('monster_')&&text(e.v.classname)!=='monster_army');
 if(other){const f=ED_FindFunction('army_fire');progs.pr_global_struct.self=progs.EDICT_TO_PROG(other);progs.pr_global_struct.time=sv.time;other.v.enemy=progs.EDICT_TO_PROG(p);PR_ExecuteProgram(progs.pr_functions.indexOf(f));same(face.SV_FaceDrain('rays').length,0,'only a monster_army counts');}
 // demos, remote and multiplayer exclude it too
 soldier.v.enemy=progs.EDICT_TO_PROG(p);const socket=cls.netcon;cls.demoplayback=true;native(soldier,'army_fire');same(face.SV_FaceDrain('rays').length,0,'demo');cls.demoplayback=false;
 svs.maxclients=2;native(soldier,'army_fire');same(face.SV_FaceDrain('rays').length,0,'multiplayer');svs.maxclients=1;
 console.log('SOLDIER_RAYS '+JSON.stringify({rays:e.rays.length,enemy:e.enemy,submerged:e.submerged}));acknowledge();CL_Disconnect_f();
});
const THREE=await import('three'),sgfx=await import('../src/r_shotgun.js'),physics=await import('../src/sv_phys.js'),edict=await import('../src/pr_edict.js');
Deno.test('end to end: a real blast becomes pellets on the next frame, once, and a soldier\'s shot leaves from the soldier',async()=>{
 let p=await fresh('e1m2');face.SV_FaceReset();const scene=new THREE.Scene(),eye=[0,0,0],fwd=[1,0,0],view=[1280,720];
 sgfx.R_ShotgunSetup({scene,muzzles:n=>Array.from({length:n},(_,i)=>[p.v.origin[0]+20,p.v.origin[1]+i*6,p.v.origin[2]+20])});sgfx.R_ShotgunClear();sgfx.r_shotgunfx.value=1;
 equip(p,2,50);native(p,'W_Attack');
 sgfx.R_ShotgunFrame(1,eye,fwd,view);same(sgfx.R_ShotgunSnapshot().pellets,14,'the real super shotgun blast: fourteen pellets on the next frame');
 sgfx.R_ShotgunFrame(1.01,eye,fwd,view);same(sgfx.R_ShotgunSnapshot().pellets,14,'and not drawn twice');
 sgfx.R_ShotgunClear();
 const soldier=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='monster_army');soldier.v.enemy=progs.EDICT_TO_PROG(p);p.v.origin=[soldier.v.origin[0]+160,soldier.v.origin[1],soldier.v.origin[2]];SV_LinkEdict(p,false);
 face.SV_FaceReset();native(soldier,'army_fire');sgfx.R_ShotgunFrame(2,eye,fwd,view);
 const list=sgfx.R_ShotgunPellets();same(list.length,4,'the soldier\'s four pellets');check(list.every(q=>Math.hypot(q.origin[0]-soldier.v.origin[0],q.origin[1]-soldier.v.origin[1])<16),'they leave the soldier, not the player\'s gun');
 vars.Cvar_SetValue('r_hdr',0);face.SV_FaceReset();native(soldier,'army_fire');sgfx.R_ShotgunFrame(3,eye,fwd,view);same(sgfx.R_ShotgunSnapshot().pellets,0,'Classic Quake: none');vars.Cvar_SetValue('r_hdr',1);
 acknowledge();CL_Disconnect_f();
});

// ---------------------------------------------------------------------------
// Damage arrives with the pellets (sv_shotdelay.js)
// ---------------------------------------------------------------------------
const shotTime=()=>sv.time;
function advance(seconds,step=.0125){const end=sv.time+seconds;while(sv.time<end){sv.time+=step;delay.SV_ShotDelayRun();}}
async function soldierAndPlayer(map='e1m2',distance=80){
 const p=await fresh(map);face.SV_FaceReset();p.v.armorvalue=0;p.v.armortype=0;p.v.health=100;
 const soldier=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='monster_army');
 p.v.origin=[soldier.v.origin[0]+distance,soldier.v.origin[1],soldier.v.origin[2]];p.v.velocity=[0,0,0];SV_LinkEdict(p,false);soldier.v.enemy=progs.EDICT_TO_PROG(p);
 return {p,soldier};
}
Deno.test('a soldier\'s shotgun hurts when its pellets arrive, not when he fires; the same total damage, later',async()=>{
 const {p,soldier}=await soldierAndPlayer();
 native(soldier,'army_fire');const events=face.SV_FaceDrain('rays');same(events.length,1,'one blast');
 same(p.v.health,100,'nothing hurts at the instant of the shot');check(delay.SV_ShotDelayCount()>0,'the pellets that hit are in flight: '+delay.SV_ShotDelayCount());
 const e=events[0],pending=delay.SV_ShotDelayCount();
 // the earliest a pellet can land is its flight time to where its ray stopped
 const times=e.rays.map((r,i)=>flight.flightTime(e.id,i,Math.hypot(r.end[0]-r.start[0],r.end[1]-r.start[1],r.end[2]-r.start[2])/24,r.water.map(([a,b])=>[a/24,b/24])));
 const first=Math.min(...times);advance(first*.5);same(p.v.health,100,'still nothing half way through the first pellet\'s flight');
 advance(3);check(p.v.health<100,'damage lands once they arrive: health '+p.v.health);same(delay.SV_ShotDelayCount(),0,'and nothing is left in flight');
 check((100-p.v.health)%4===0&&100-p.v.health<=16,'whole pellets of 4: lost '+(100-p.v.health)+' of at most 16');
 console.log('SHOT_DELAY_SOLDIER '+JSON.stringify({pending,lost:100-p.v.health,flightMs:times.map(t=>Math.round(t*1000))}));acknowledge();CL_Disconnect_f();
});
Deno.test('the player\'s shotgun hurts a monster when the pellets arrive, in flight time to its distance, and the monster feels it then',async()=>{
 const p=await fresh('e1m2');face.SV_FaceReset();
 const soldier=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='monster_army');soldier.v.health=500;
 const dist=400;p.v.origin=[soldier.v.origin[0]-dist,soldier.v.origin[1],soldier.v.origin[2]-0];p.v.velocity=[0,0,0];p.v.v_angle=[0,0,0];SV_LinkEdict(p,false);
 const aimz=(soldier.v.origin[2]+(soldier.v.mins[2]+soldier.v.maxs[2])/2)-(p.v.origin[2]+22);p.v.v_angle=[-Math.atan2(aimz,dist)*180/Math.PI,0,0];
 equip(p,1,50);face.SV_FaceReset();const t0=sv.time;native(p,'W_Attack');const events=face.SV_FaceDrain('rays');same(events.length,1,'one blast');
 same(soldier.v.health,500,'the monster is not hurt at the instant of the shot');check(delay.SV_ShotDelayCount()>0,'pellets in flight');
 const last=Math.max(...events[0].rays.map((r,i)=>flight.flightTime(events[0].id,i,Math.hypot(r.end[0]-r.start[0],r.end[1]-r.start[1],r.end[2]-r.start[2])/24,[])));
 advance(.02);same(soldier.v.health,500,'not hurt 20 ms later either');
 advance(last+.1);check(soldier.v.health<500,'hurt once the pellets arrive: '+soldier.v.health);same((500-soldier.v.health)%4,0,'in whole pellets of 4');
 check(sv.time-t0>=.02,'after a real delay: the pellets needed up to '+Math.round(last*1000)+' ms for '+dist+' units');
 console.log('SHOT_DELAY_PLAYER '+JSON.stringify({lost:500-soldier.v.health,lastFlightMs:Math.round(last*1000)}));acknowledge();CL_Disconnect_f();
});
Deno.test('the damage is instant, as in stock Quake, with sv_shotdelay 0, r_shotgunfx 0, in Classic, in multiplayer and in demos',async()=>{
 for(const [label,setup,teardown] of [
  ['sv_shotdelay 0',()=>{delay.sv_shotdelay.value=0;},()=>{delay.sv_shotdelay.value=1;}],
  ['r_shotgunfx 0 (no pellets are drawn, so nothing waits for them)',()=>vars.Cvar_SetValue('r_shotgunfx',0),()=>vars.Cvar_SetValue('r_shotgunfx',1)],
  ['Classic Quake',()=>vars.Cvar_SetValue('r_hdr',0),()=>vars.Cvar_SetValue('r_hdr',1)],
  ['multiplayer',()=>{svs.maxclients=2;},()=>{svs.maxclients=1;}],
  ['a demo',()=>{cls.demoplayback=true;},()=>{cls.demoplayback=false;}]]){
  const {p,soldier}=await soldierAndPlayer();setup();
  try{native(soldier,'army_fire');}finally{teardown();}
  check(p.v.health<100,label+': hurt at the instant of the shot: '+p.v.health);same(delay.SV_ShotDelayCount(),0,label+': nothing delayed');acknowledge();CL_Disconnect_f();
 }
 acknowledge();CL_Disconnect_f();
});
Deno.test('pellets of one blast that land together are applied together: armour sees one hit of the total, as one hitscan blast gave',async()=>{
 const {p,soldier}=await soldierAndPlayer('e1m2',80);p.v.armorvalue=100;p.v.armortype=.8;p.v.health=100;
 native(soldier,'army_fire');const e=face.SV_FaceDrain('rays')[0];advance(3,3); // (one long frame: every pellet that lands within a frame is applied together; frame boundaries are the only thing that splits a blast)
 const hits=100-p.v.health,lostArmor=100-p.v.armorvalue;check(hits+lostArmor>0,'the soldier hit: health '+p.v.health+', armour '+p.v.armorvalue);
 check(lostArmor>0,'armour absorbed some of it');
 const n=(hits+lostArmor)/4;check(Number.isInteger(n)&&n>=1,'whole pellets landed: '+n);
 // pellets landing in the same frame are one hit of 4n, as one hitscan blast was: armour takes ceil(0.8 x 4n), not 4 a pellet
 if(delay.SV_ShotDelayCount()===0&&n>=2)same(lostArmor,Math.ceil(.8*4*n),'one application of the total (per pellet the armour would have taken 4 each and the health nothing)');
 acknowledge();CL_Disconnect_f();
});
Deno.test('a barrel the pellets blow up does not add rays: only FireBullets\' own traces are pellets, with the delay off and on',async()=>{
 for(const delayOn of [false,true]){
  const p=await fresh('e1m1');face.SV_FaceReset();delay.sv_shotdelay.value=delayOn?1:0;
  const barrel=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='misc_explobox');check(barrel,'a real explobox in e1m1');
  const dist=90,center=[barrel.v.origin[0]+(barrel.v.mins[0]+barrel.v.maxs[0])/2,barrel.v.origin[1]+(barrel.v.mins[1]+barrel.v.maxs[1])/2,barrel.v.origin[2]+(barrel.v.mins[2]+barrel.v.maxs[2])/2];
  p.v.origin=[center[0]-dist,center[1],center[2]-22];p.v.velocity=[0,0,0];p.v.v_angle=[0,0,0];SV_LinkEdict(p,false);
  equip(p,1,50);face.SV_FaceReset();delay.sv_shotdelay.value=delayOn?1:0;
  try{native(p,'W_Attack');}finally{}
  const e=face.SV_FaceDrain('rays');same(e.length,1,'one blast');same(e[0].rays.length,6,'exactly the six pellets (delay '+(delayOn?'on':'off')+')');
  advance(2);check(barrel.free||barrel.v.health<=0||text(barrel.v.classname)!=='misc_explobox','the barrel was shot (delay '+(delayOn?'on':'off')+')');
  delay.sv_shotdelay.value=1;acknowledge();CL_Disconnect_f();
 }
});

Deno.test('pellets in flight when the world changes never land in the next one (a real map change, the clock ahead of the shot)',async()=>{
 const {p,soldier}=await soldierAndPlayer();native(soldier,'army_fire');check(delay.SV_ShotDelayCount()>0,'in flight');
 const q=await fresh('e1m1');q.v.health=100;q.v.armorvalue=0;
 sv.time=500;physics.SV_Physics(); // a loaded game or a restored level has a clock ahead of the old shot: one real server frame
 same(delay.SV_ShotDelayCount(),0,'the old world\'s pellets were dropped, not landed');same(q.v.health,100,'nothing hurt the new level\'s player');
 acknowledge();CL_Disconnect_f();
});
Deno.test('pellets already paid for still land if Classic is switched to mid-flight',async()=>{
 const {p,soldier}=await soldierAndPlayer();native(soldier,'army_fire');face.SV_FaceDrain('rays');
 vars.Cvar_SetValue('r_hdr',0);face.SV_FaceDrain('rays');// the renderer's drain with the gate closed
 check(delay.SV_ShotDelayCount()>0,'still in flight after the gate closed');advance(3);check(p.v.health<100,'and they land: '+p.v.health);vars.Cvar_SetValue('r_hdr',1);acknowledge();CL_Disconnect_f();
});
Deno.test('a blast lands on a target once, however far it flies and however the frames fall; its pellets that hit the world are puffs of their own',async()=>{
 const p=await fresh('e1m2');face.SV_FaceReset();
 const soldier=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='monster_army');soldier.v.health=5000;
 for(const dist of[200,400,600]){
  p.v.origin=[soldier.v.origin[0]-dist,soldier.v.origin[1],soldier.v.origin[2]];p.v.velocity=[0,0,0];SV_LinkEdict(p,false);
  const aimz=(soldier.v.origin[2]+(soldier.v.mins[2]+soldier.v.maxs[2])/2)-(p.v.origin[2]+22);p.v.v_angle=[-Math.atan2(aimz,dist)*180/Math.PI,0,0];
  let pend=[],hurts=0;
  for(let attempt=0;attempt<12&&hurts<2;attempt++){delay.SV_ShotDelayClear();equip(p,2,50);face.SV_FaceReset();soldier.v.health=5000;native(p,'W_Attack');face.SV_FaceDrain('rays');pend=delay.SV_ShotDelayPending().filter(b=>b.hurts&&b.ent===progs.EDICT_TO_PROG(soldier));hurts=pend.length;}
  const maxDue=Math.max(...pend.map(b=>b.due)),minDue=Math.min(...pend.map(b=>b.due));
  const changes=[];let last=soldier.v.health,when=null;for(let i=0;i<4000&&delay.SV_ShotDelayCount()>0;i++){sv.time+=1/1000;delay.SV_ShotDelayRun();if(soldier.v.health!==last){changes.push(last-soldier.v.health);last=soldier.v.health;when=sv.time;}}
  check(hurts>=2,dist+' units: the blast hit the target ('+hurts+' pellets)');same(changes.length,1,dist+' units: one application on the target, not '+changes.length+' ('+changes.join('+')+')');same(5000-soldier.v.health,changes[0],'the total');
  same((5000-soldier.v.health)%4,0,'whole pellets');check(when>=maxDue-1e-9&&when<=maxDue+.0015,dist+' units: applied when the last pellet landed, in 1 ms steps (the pellets landed over '+Math.round((maxDue-minDue)*1000)+' ms)');
 }
 acknowledge();CL_Disconnect_f();
});
Deno.test('a pellet whose shooter or target was removed in flight does nothing, even if the entity slot was reused',async()=>{
 for(const who of['target','shooter']){
  const p=await fresh('e1m2');face.SV_FaceReset();
  const soldier=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='monster_army');soldier.v.health=500;
  p.v.origin=[soldier.v.origin[0]-100,soldier.v.origin[1],soldier.v.origin[2]];p.v.velocity=[0,0,0];SV_LinkEdict(p,false);
  const aimz=(soldier.v.origin[2]+(soldier.v.mins[2]+soldier.v.maxs[2])/2)-(p.v.origin[2]+22);p.v.v_angle=[-Math.atan2(aimz,100)*180/Math.PI,0,0];
  equip(p,1,50);face.SV_FaceReset();native(p,'W_Attack');face.SV_FaceDrain('rays');check(delay.SV_ShotDelayCount()>0,'in flight');
  if(who==='target'){soldier.freetime=sv.time+1;}else{p.freetime=sv.time+1;} // freed and its slot taken by something else: the identity changed
  advance(3);same(soldier.v.health,500,'a pellet at a '+who+' that is no longer the same entity does nothing');
  acknowledge();CL_Disconnect_f();
 }
});
Deno.test('the server waits for the very time the drawn pellet flies (muzzle at the ray start)',async()=>{
 const {p,soldier}=await soldierAndPlayer('e1m2',200);const t0=sv.time;
 native(soldier,'army_fire');const e=face.SV_FaceDrain('rays')[0];const pend=delay.SV_ShotDelayPending();check(pend.length>0,'pellets in flight');
 sgfx.R_ShotgunClear();sgfx.R_ShotgunSetup({scene:new THREE.Scene(),muzzles:()=>null});sgfx.R_ShotgunFire(e,[e.rays[0].start],0);
 const lives=sgfx.R_ShotgunPellets().map(q=>q.life);
 for(const b of pend)check(lives.some(l=>Math.abs((b.due-t0)-l)<1e-9),'a pending pellet lands exactly when a drawn pellet of the same blast arrives: '+(b.due-t0));
 acknowledge();CL_Disconnect_f();
});
