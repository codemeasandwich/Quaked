// (look names are the artwork's own, from the character's point of view: head_right/eyes_right look toward the screen's left)
// Stock QuakeC events through actual local host/loopback commands. This tests
// the gameplay observer and public HUD adapter, not an alternate combat path.
// Native damage packets and server spawn/begin exercise hidden-HUD lifecycle.
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
import {CL_Init,CL_Disconnect_f} from '../src/engine/client/cl_main.js';
import {cls,cl,ca_disconnected} from '../src/engine/client/client.js';
import {NET_Init,NET_SendMessage,NET_GetMessage,NET_CanSendMessage} from '../src/engine/net/net_main.js';
import {SZ_Clear} from '../src/engine/common/common.js';
import {R_Init} from '../src/gl_rmain.js';
import {V_Init} from '../src/engine/client/view.js';
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
const {OFS_PARM0}=await import('../src/engine/progs/pr_comp.js');
function native(p,n){progs.pr_global_struct.self=progs.EDICT_TO_PROG(p);progs.pr_global_struct.time=sv.time;const f=ED_FindFunction(n);check(f,'native '+n);PR_ExecuteProgram(progs.pr_functions.indexOf(f));}
function hit(p,source,amount){progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(source);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(source);progs.pr_globals_float[OFS_PARM0+9]=amount;native(p,'T_Damage');}
function equip(p,weapon,ammo=50){p.v.items=127|4096;p.v.weapon=weapon;p.v.ammo_shells=ammo;p.v.ammo_nails=ammo;p.v.ammo_rockets=ammo;p.v.ammo_cells=ammo;p.v.button0=1;native(p,'W_SetCurrentAmmo');}
Deno.test('native paired damage events preserve individual loss through same-frame healing and capture impact context',async()=>{
 const p=await fresh('e1m1');face.SV_FaceReset();check(face.SV_FaceLocalActive(),'actual local loopback admitted');p.v.armorvalue=0;p.v.armortype=0;p.v.health=100;p.v.v_angle=[3,91,0];
 const enemy=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname).startsWith('monster_'));check(enemy,'actual native enemy source');
 hit(p,enemy,10);p.v.health+=30;hit(p,enemy,25);const a=face.SV_FaceDrain('damage');same(a.length,2,'two actual damage callbacks, not net snapshot');same(a.map(e=>e.loss).join(),'10,25','healing cannot mask either hit');same(a.map(e=>e.amount).join(),'10,25','unarmored loss exact');same(a[0].viewAngles.join(),'3,91,0','impact angles copied');same(a[0].source.join(),Array.from(enemy.v.origin,(v,i)=>v+.5*(enemy.v.mins[i]+enemy.v.maxs[i])).join(),'inflictor center agrees with native source');same(face.SV_FaceDrain('damage').length,0,'drain consumes exactly once');
 p.v.armorvalue=50;p.v.armortype=.3;hit(p,enemy,20);const armor=face.SV_FaceDrain('damage')[0];same(armor.amount,20,'armor plus health totals actual native damage');check(armor.armorLoss>0&&armor.loss<20,'armor and actual health separated');
 p.v.armorvalue=0;p.v.armortype=0;hit(p,sv.edicts[0],2);same(face.SV_FaceDrain('damage')[0].angle,null,'world/floor damage has no directional fiction');console.log('FACE_NATIVE_DAMAGE '+JSON.stringify({a,armor}));
});
Deno.test('actual native weapon discharge and axe swing events exclude dry and released fire and deduplicate fallback calls',async()=>{
 const p=await fresh('e1m1'),rows=[];
 for(const [weapon,cadence]of[[4096,.5],[1,.5],[2,.7],[4,.2],[8,.2],[16,.6],[32,.8],[64,.1]]){equip(p,weapon);face.SV_FaceReset();native(p,'W_Attack');const events=face.SV_FaceDrain('shot');same(events.length,1,'one actual discharge/swing weapon '+weapon);same(events[0].weapon,weapon,'actual weapon identity');same(events[0].cadence,cadence,'native cadence');rows.push(events[0]);sv.time+=1;}
 equip(p,2,1);face.SV_FaceReset();native(p,'W_Attack');const fallback=face.SV_FaceDrain('shot');same(fallback.length,1,'super shotgun one-shell nested fallback not duplicated');same(fallback[0].function,'W_FireShotgun','inner confirmed discharge owns event');
 equip(p,1,0);face.SV_FaceReset();native(p,'W_Attack');same(face.SV_FaceDrain('shot').length,0,'dry auto-switch is not firing');
 equip(p,4);p.v.button0=0;face.SV_FaceReset();native(p,'W_Attack');same(face.SV_FaceDrain('shot').length,0,'released nail trigger cannot fake a shot');
 equip(p,4096);face.SV_FaceReset();native(p,'W_FireAxe');same(face.SV_FaceDrain('shot').length,0,'later axe impact cannot double-count initial swing');console.log('FACE_NATIVE_SHOTS '+JSON.stringify(rows));
});
Deno.test('native event bridge excludes demo, remote and multiplayer and clears queued events on actual world reload',async()=>{
 let p=await fresh('e1m1');equip(p,1);face.SV_FaceReset();const socket=cls.netcon;
 cls.demoplayback=true;native(p,'W_Attack');same(face.SV_FaceDrain('shot').length,0,'demo events excluded');cls.demoplayback=false;
 const driver=socket.driver;socket.driver=1;native(p,'W_Attack');same(face.SV_FaceDrain('shot').length,0,'remote socket excluded');socket.driver=driver;
 svs.maxclients=2;native(p,'W_Attack');same(face.SV_FaceDrain('shot').length,0,'multiplayer excluded');svs.maxclients=1;
 native(p,'W_Attack');p=await fresh('e1m2');same(face.SV_FaceDrain('shot').length,0,'world/progs transition cannot replay old shots');acknowledge();CL_Disconnect_f();
});
const gameface=await import('../src/r_facegame.js');
const {in_attack}=await import('../src/engine/client/cl_input.js');
const Q=await import('../src/engine/common/quakedef.js');
function portrait(p,t){cl.worldmodel=sv.worldmodel;cl.time=t;cl.stats[Q.STAT_HEALTH]=p.v.health;cl.stats[Q.STAT_AMMO]=p.v.currentammo;cl.stats[Q.STAT_ACTIVEWEAPON]=p.v.weapon;cl.stats[Q.STAT_WEAPONFRAME]=p.v.weaponframe;cl.items=p.v.items;return gameface.R_PlayerFaceFrame();}
Deno.test('public face adapter keeps native impact intervals and releases focused attack tail despite a nonzero weapon frame',async()=>{
 let p=await fresh('e1m1');face.SV_FaceReset();p.v.armorvalue=0;p.v.armortype=0;p.v.v_angle=[0,0,0];portrait(p,1);
 const enemy=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname).startsWith('monster_'));enemy.v.origin=[p.v.origin[0],p.v.origin[1]+80,p.v.origin[2]];sv.time=1;hit(p,enemy,15);enemy.v.origin=[p.v.origin[0],p.v.origin[1]-80,p.v.origin[2]];sv.time=1.4;hit(p,enemy,5);cl.time=1.5;gameface.R_FaceDamage(0,20,enemy.v.origin,p.v.origin,p.v.v_angle);same(portrait(p,1.5).target,'head_left','older >200ms hit cannot dominate delayed native batch');
 p=await fresh('e1m1');face.SV_FaceReset();equip(p,1);in_attack.state=1;
 for(const time of[1,1.5,2,2.5,3]){sv.time=time;native(p,'W_Attack');portrait(p,time);}
 same(portrait(p,3).expression,'focused_determined','two seconds of confirmed usable native shots focus');in_attack.state=0;p.v.weaponframe=1;portrait(p,3.01);same(portrait(p,3.32).expression,'normal','released input finishes .3s focus tail despite residual animation');
 console.log('FACE_PUBLIC_ADAPTER_TIMING PASS');
});
Deno.test('actual native powerup touch reports first pickup and active-power refresh exactly once without inventing dry repeated touches',async()=>{
 const p=await fresh('e1m1');face.SV_FaceReset();const pickup=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='item_artifact_super_damage');check(pickup,'native E1M1 quad exists');
 // Native items initialize their physical bounds on their first scheduled think.
 if(pickup.v.solid!==1&&pickup.v.think){progs.pr_global_struct.self=progs.EDICT_TO_PROG(pickup);PR_ExecuteProgram(pickup.v.think);}
 same(pickup.v.solid,1,'native quad is an armed trigger');progs.pr_global_struct.other=progs.EDICT_TO_PROG(p);native(pickup,'powerup_touch');let events=face.SV_FaceDrain('reward');same(events.length,1,'first native power acquisition recorded');same(events[0].power,'quad','quad kind');const items=p.v.items;
 sv.time+=1;native(pickup,'SUB_regen');same(pickup.v.solid,1,'actual native item regeneration restores trigger');progs.pr_global_struct.other=progs.EDICT_TO_PROG(p);native(pickup,'powerup_touch');events=face.SV_FaceDrain('reward');same(events.length,1,'active-power timer refresh produces independent reward');same(p.v.items,items,'repeat reward not dependent on new ownership bit');
 progs.pr_global_struct.other=progs.EDICT_TO_PROG(p);native(pickup,'powerup_touch');same(face.SV_FaceDrain('reward').length,0,'already consumed nontrigger does not invent a second contact');console.log('FACE_NATIVE_REWARD '+JSON.stringify(events));acknowledge();CL_Disconnect_f();
});
Deno.test('public face adapter uses actual impact separation across separate native receipt batches',async()=>{
 const p=await fresh('e1m1');face.SV_FaceReset();p.v.armorvalue=0;p.v.armortype=0;p.v.v_angle=[0,0,0];portrait(p,1);
 const enemy=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname).startsWith('monster_'));
 enemy.v.origin=[p.v.origin[0],p.v.origin[1]+80,p.v.origin[2]];sv.time=1;hit(p,enemy,15);cl.time=1.10;gameface.R_FaceDamage(0,15,enemy.v.origin,p.v.origin,p.v.v_angle);same(portrait(p,1.10).target,'head_right','first impact turns left');
 enemy.v.origin=[p.v.origin[0],p.v.origin[1]-80,p.v.origin[2]];sv.time=1.24;hit(p,enemy,5);cl.time=1.26;gameface.R_FaceDamage(0,5,enemy.v.origin,p.v.origin,p.v.v_angle);same(portrait(p,1.26).target,'head_left','240ms actual impact gap is outside200ms despite160ms receipt gap');acknowledge();CL_Disconnect_f();
});
const {SV_WriteClientdataToMessage}=await import('../src/engine/server/sv_main.js');
const {sizebuf_t,SZ_Alloc,COM_SetNetMessage}=await import('../src/engine/common/common.js');
const {CL_ParseServerMessage}=await import('../src/engine/client/cl_parse.js');
function wire(p){const packet=new sizebuf_t();SZ_Alloc(packet,8192);SV_SetPlayer(p);SV_WriteClientdataToMessage(p,packet);COM_SetNetMessage(packet);CL_ParseServerMessage();}
Deno.test('actual native reward expires while HUD is not sampled and cannot be restarted by deferred drain',async()=>{
 const p=await fresh('e1m1');face.SV_FaceReset();portrait(p,sv.time);const pickup=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='item_artifact_super_damage');if(pickup.v.solid!==1&&pickup.v.think){progs.pr_global_struct.self=progs.EDICT_TO_PROG(pickup);PR_ExecuteProgram(pickup.v.think);}
 progs.pr_global_struct.other=progs.EDICT_TO_PROG(p);native(pickup,'powerup_touch');sv.time+=4;const state=portrait(p,sv.time);same(state.expression,'normal','old native celebration expires behind hidden HUD');same(state.strength,true,'actual quad remains independently active');acknowledge();CL_Disconnect_f();
});
Deno.test('actual native damage/clientdata death and respawn packets reset face and clear stale events without HUD draws',async()=>{
 const p=await fresh('e1m1');face.SV_FaceReset();equip(p,1);in_attack.state=1;portrait(p,sv.time);native(p,'W_Attack');const enemy=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname).startsWith('monster_'));p.v.armorvalue=0;p.v.armortype=0;hit(p,enemy,300);check(p._respawn?.sequence,'actual lethal damage begins owned native death');cl.time=sv.time;wire(p);check(cl.stats[Q.STAT_HEALTH]<=0,'actual clientdata carries native death');
 const s=p._respawn.sequence;for(const time of[s.at+.22+s.turn/2+.001,s.at+.22+s.turn+.001]){sv.time=time;SV_SetFrametime(.001);SV_Physics_Client(p,1);cl.time=sv.time;wire(p);}
 same(p.v.health,90,'native respawn actually completed (Normal: the first death respawns at 90)');same(cl.stats[Q.STAT_HEALTH],90,'actual protocol carries respawn health');for(const kind of['damage','shot','reward'])same(face.SV_FaceDrain(kind).length,0,'respawn cleared pending UI '+kind);const state=portrait(p,sv.time);same(state.look,'front','respawn resets front even without intervening HUD draws');same(state.expression,'normal','no old lethal shock or firing grin reappears');acknowledge();CL_Disconnect_f();
});
