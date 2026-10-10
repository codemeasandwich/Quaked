// Native power-up save/load and overlap checks using actual host commands,
// QuakeC touches, ED serialization and clientdata packets. Time advancement is
// simulated server time; no timer field is shortened and no gameplay loop runs.
import {readFileSync} from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init} from '../src/engine/render/gl_model.js';
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
function ringSounds(stage){for(const name of['items/inv2.wav','items/inv3.wav']){check(sv.sound_precache.indexOf(name)>0,stage+' has native '+name+' before clientdata');same(sv.sound_precache.filter(value=>value===name).length,1,stage+' has one native sound slot for '+name);}}
function finishConnect(){SV_CheckForNewClients();const c=svs.clients[0];ringSounds('connected serverinfo');const info=Buffer.from(c.message.data instanceof ArrayBuffer?new Uint8Array(c.message.data,0,c.message.cursize):c.message.data.subarray(0,c.message.cursize));for(const name of['items/inv2.wav','items/inv3.wav'])check(info.includes(Buffer.from(name+'\0')),'queued actual serverinfo includes '+name+' before spawn/clientdata');check(c.active&&c.netconnection&&cls.netcon?.driverdata===c.netconnection,'actual local loopback is paired');set_host_client(c);SV_SetPlayer(c.edict);cmd.Cmd_ExecuteString('spawn',cmd.src_client);cmd.Cmd_ExecuteString('begin',cmd.src_client);cls.signon=4;cl.intermission=0;acknowledge();R_DemoLoadingCancel();check(c.edict.v.health>0&&text(c.edict.v.classname)==='player','actual native spawn command initializes living player');return c.edict;}
async function command(value){acknowledge();cmd.Cmd_ExecuteString(value,cmd.src_command);ringSounds(value+' completed spawn');await Promise.resolve();return finishConnect();}
async function fresh(map='e1m1'){vars.Cvar_SetValue('r_hdr',1);vars.Cvar_SetValue('skill',1);vars.Cvar_SetValue('sv_seamless',1);return command('map '+map);}
const face=await import('../src/newer/gameplay/sv_faceevents.js');
function native(p,n){progs.pr_global_struct.self=progs.EDICT_TO_PROG(p);progs.pr_global_struct.time=sv.time;const f=ED_FindFunction(n);check(f,'native '+n);PR_ExecuteProgram(progs.pr_functions.indexOf(f));}


const Q=await import('../src/engine/common/quakedef.js');
const {GetEdictFieldValue}=await import('../src/engine/progs/pr_edict.js');
const {SV_WriteClientdataToMessage}=await import('../src/engine/server/sv_main.js');
const {sizebuf_t,SZ_Alloc,COM_SetNetMessage}=await import('../src/engine/common/common.js');
const {CL_ParseServerMessage}=await import('../src/engine/client/cl_parse.js');
const {PowerVisionMode}=await import('../src/newer/gameplay/powervision_state.js');
const {SV_QuadMovementScale}=await import('../src/newer/gameplay/sv_quadmovement.js');
const {R_QuadVisionActive}=await import('../src/newer/render/r_quadvision.js');
const powers={quad:{map:'e1m1',class:'item_artifact_super_damage',field:'super_damage_finished',bit:Q.IT_QUAD},ring:{map:'e1m3',class:'item_artifact_invisibility',field:'invisible_finished',bit:Q.IT_INVISIBILITY},pentagram:{map:'e1m8',class:'item_artifact_invulnerability',field:'invincible_finished',bit:Q.IT_INVULNERABILITY}};
const near=(a,b,label)=>check(Math.abs(a-b)<.00001,`${label}: ${a} != ${b}`);
function expiry(player,power){const field=GetEdictFieldValue(player,power.field);check(field,'actual native field '+power.field);return field.accessor.getFloat(field.ofs);}
function collect(player,power,renew=false){const item=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)===power.class);check(item,'actual map has '+power.class);if(renew)native(item,'SUB_regen');else if(item.v.solid!==1&&item.v.think){progs.pr_global_struct.self=progs.EDICT_TO_PROG(item);PR_ExecuteProgram(item.v.think);}same(item.v.solid,1,'actual native pickup armed');progs.pr_global_struct.other=progs.EDICT_TO_PROG(player);native(item,'powerup_touch');check(player.v.items&power.bit,'QC touch owns '+power.class);near(expiry(player,power)-sv.time,30,'QC supplies full original duration');return item;}
function advance(player,until){check(until>=sv.time,'test clock only advances');let ticks=0;while(sv.time<until){sv.time=Math.min(until,sv.time+.1);SZ_Clear(sv.datagram);native(player,'PlayerPostThink');check(++ticks<1000,'bounded native expiry checks');}return ticks;}
function wire(player){const packet=new sizebuf_t();SZ_Alloc(packet,8192);SV_SetPlayer(player);SV_WriteClientdataToMessage(player,packet);COM_SetNetMessage(packet);CL_ParseServerMessage();cl.time=sv.time;}
async function memorySave(run){const output=console.log,warnings=[];console.log=(...args)=>{const line=args.join(' ');if(/SV_StartSound:.*items\/inv[23]\.wav.*not precache/.test(line))warnings.push(line);output(...args);};const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),saved=new Map();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{setItem:(key,value)=>saved.set(key,String(value)),getItem:key=>saved.get(key)??null,removeItem:key=>saved.delete(key)}});try{await run(saved);same(warnings.length,0,'native Ring warning/expiry emits no missing-precache diagnostic');}finally{console.log=output;acknowledge();CL_Disconnect_f();if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}}
for(const[name,power]of Object.entries(powers))Deno.test('actual native '+name+' save/load retains remaining power duration and original QC expiry',()=>memorySave(async saved=>{
 let player=await fresh(power.map);collect(player,power);const originalExpiry=expiry(player,power);advance(player,sv.time+9.25);const savedTime=sv.time,remaining=originalExpiry-savedTime,items=player.v.items;check(remaining>20&&remaining<21,'save made during active original timer');cmd.Cmd_ExecuteString('save power_timer_'+name,cmd.src_command);const save=saved.get('quake_save_power_timer_'+name);check(save&&save.startsWith('5\n'),'actual host command wrote native version5 save');check(save.includes('"'+power.field+'"'),'native timer serialized');
 advance(player,originalExpiry+.1);check(!(player.v.items&power.bit),'native QC expires original session without changing timer field');player=await command('load power_timer_'+name);near(sv.time,savedTime,'load restores saved native server time');near(expiry(player,power),originalExpiry,'load preserves absolute native deadline');near(expiry(player,power)-sv.time,remaining,'remaining duration survives without a fresh30second timer');same(player.v.items,items,'load preserves original item bits');wire(player);check(cl.items&power.bit,'actual restored clientdata carries active power');
 advance(player,originalExpiry-.05);wire(player);check(player.v.items&power.bit&&cl.items&power.bit,'restored native power remains active immediately before deadline');advance(player,originalExpiry+.05);wire(player);check(!(player.v.items&power.bit)&&!(cl.items&power.bit),'native QC and clientdata expire restored power at original deadline');near(expiry(player,power),0,'native QC clears expired timer');console.log('POWER_NATIVE_SAVE '+JSON.stringify({power:name,savedTime,originalExpiry,remaining,expiredAt:sv.time,saveBytes:save.length}));
}));
async function combinedPickups(){let player=await fresh('e1m1');collect(player,powers.quad);advance(player,sv.time+2);player=await command('changelevel e1m3');check(player.v.items&Q.IT_QUAD,'native Newer transition carries acquired Quad');collect(player,powers.ring);advance(player,sv.time+2);player=await command('changelevel e1m8');check((player.v.items&(Q.IT_QUAD|Q.IT_INVISIBILITY))===(Q.IT_QUAD|Q.IT_INVISIBILITY),'native transition retains previously acquired powers');collect(player,powers.pentagram);return player;}
Deno.test('real combined Quad Ring and Pentagram QC timers retain independent bits and restore Demon after Ring expiry',()=>memorySave(async saved=>{
 let player=await combinedPickups();const deadlines=Object.fromEntries(Object.entries(powers).map(([name,power])=>[name,expiry(player,power)])),mask=Q.IT_QUAD|Q.IT_INVISIBILITY|Q.IT_INVULNERABILITY;wire(player);same(cl.items&mask,mask,'real server packet carries all three native bits');same(PowerVisionMode(cl,true),1,'Ring takes priority over Pentagram while both native bits remain');check(R_QuadVisionActive(),'independent Quad silhouette stays active with Ring/Pentagram');same(SV_QuadMovementScale(player),1.5,'Quad movement bonus remains single1.5 with other powers');
 advance(player,sv.time+4);const savedTime=sv.time;cmd.Cmd_ExecuteString('save power_combined',cmd.src_command);check(saved.has('quake_save_power_combined'),'combined save written through actual host');advance(player,deadlines.pentagram+.1);player=await command('load power_combined');near(sv.time,savedTime,'combined save time restored');for(const[name,power]of Object.entries(powers))near(expiry(player,power),deadlines[name],'independent '+name+' deadline survives');wire(player);same(cl.items&mask,mask,'combined save restores all original bits');
 advance(player,deadlines.quad+.05);wire(player);same(cl.items&mask,Q.IT_INVISIBILITY|Q.IT_INVULNERABILITY,'only Quad expires first');same(SV_QuadMovementScale(player),1,'native Quad movement bonus clears independently');check(!R_QuadVisionActive(),'Quad silhouette clears independently');same(PowerVisionMode(cl,true),1,'Ring mode still active');advance(player,deadlines.ring+.05);wire(player);same(cl.items&mask,Q.IT_INVULNERABILITY,'only Pentagram remains after Ring expiry');same(PowerVisionMode(cl,true),2,'Demon resumes from remaining native Pentagram bit');advance(player,deadlines.pentagram+.05);wire(player);same(cl.items&mask,0,'all native deadlines eventually expire');same(PowerVisionMode(cl,true),0,'no vision remains');console.log('POWER_NATIVE_COMBINED '+JSON.stringify({deadlines,savedTime,expiredAt:sv.time}));
}));
Deno.test('native Ring and Pentagram renewal extend only their own deadline while other powers keep their native timers',()=>memorySave(async()=>{
 let player=await fresh('e1m1');collect(player,powers.quad);advance(player,sv.time+2);player=await command('changelevel e1m3');collect(player,powers.ring);const beforeRing=expiry(player,powers.ring),beforeQuad=expiry(player,powers.quad);advance(player,sv.time+5);collect(player,powers.ring,true);near(expiry(player,powers.ring),beforeRing+5,'native Ring renewal extends own deadline');near(expiry(player,powers.quad),beforeQuad,'Ring renewal cannot extend Quad');const ringRemaining=expiry(player,powers.ring)-sv.time;player=await command('changelevel e1m8');near(expiry(player,powers.ring)-sv.time,ringRemaining,'renewed Ring retains exact remaining duration across native transition');collect(player,powers.pentagram);const before=Object.fromEntries(Object.entries(powers).map(([name,power])=>[name,expiry(player,power)]));advance(player,sv.time+3);collect(player,powers.pentagram,true);near(expiry(player,powers.pentagram),before.pentagram+3,'native Pentagram renewal extends only own timer');near(expiry(player,powers.ring),before.ring,'Pentagram renewal does not restack Ring');near(expiry(player,powers.quad),before.quad,'Pentagram renewal cannot extend Quad');wire(player);same(SV_QuadMovementScale(player),1.5,'renewing other powers does not stack Quad movement');same(PowerVisionMode(cl,true),1,'Ring priority remains authoritative');
}));
