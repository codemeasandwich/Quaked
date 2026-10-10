// Actual public menu/map/load commands, loopback connection, native START
// trigger geometry and QC. No helper directly applies welcome policy.
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
import {SV_PushEntity,SV_SetPlayer,SV_SetFrametime,SV_Physics_Client,sv_gravity} from '../src/engine/server/sv_phys.js';
import {SV_Move,SV_LinkEdict,MOVE_NOMONSTERS} from '../src/engine/server/world.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import {Host_InitCommands} from '../src/engine/server/host_cmd.js';
import {CL_Init,CL_Disconnect_f} from '../src/engine/client/cl_main.js';
import {cls,cl,ca_connected,ca_disconnected} from '../src/engine/client/client.js';
import {NET_Init,NET_SendMessage,NET_GetMessage,NET_CanSendMessage} from '../src/engine/net/net_main.js';
import {SZ_Clear} from '../src/engine/common/common.js';
import {R_Init} from '../src/gl_rmain.js';
import {V_Init,crosshair} from '../src/engine/client/view.js';
import {r_hdr} from '../src/gl_post.js';
import {r_flashlight} from '../src/r_flashlight.js';
import * as run from '../src/r_flashlightrun.js';
import * as menu from '../src/engine/client/menu.js';
import * as draw from '../src/gl_draw.js';
import * as keys from '../src/engine/client/keys.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import {R_DemoLoadingCancel} from '../src/r_demoloading.js';
const check=(x,m)=>{if(!x)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),text=i=>progs.PR_GetString(i);
const aids=()=>[r_flashlight.value,crosshair.value],expect=(a,m)=>same(aids().join(),a.join(),m),setAids=(f,c)=>{vars.Cvar_SetValue('r_flashlight',f);vars.Cvar_SetValue('crosshair',c);};
for(const path of ['pak0.pak','newer/maps.pak']){const b=readFileSync(new URL('../'+path,import.meta.url)),p=pak.COM_LoadPackFile(path,b.buffer.slice(b.byteOffset,b.byteOffset+b.length));if(path==='pak0.pak')pak.COM_AddPack(p);else pak.COM_SetNewerMapsPack(p);}
VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);Mod_Init();PR_InitBuiltins();cmd.Cbuf_Init();cmd.Cmd_Init();CL_Init();R_Init();V_Init();Host_InitCommands();menu.M_Init();
for(const c of[skill,sv_gravity,travel.sv_seamless])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
svs.maxclients=svs.maxclientslimit=1;svs.clients=[new client_t()];NET_Init();cls.state=ca_disconnected;cls.demoplayback=false;
let destination=keys.key_game;menu.M_SetExternals({key_dest_get:()=>destination,key_dest_set:v=>destination=v,cls,sv,svs,cl,Draw_CachePic:()=>({width:16,height:16}),Draw_Pic(){},Draw_TransPic(){},Draw_Character(){},Draw_FadeScreen(){},S_LocalSound(){},IN_RequestPointerLock(){}});
function acknowledge(){const c=svs.clients[0];if(c?.active&&c.netconnection&&cls.netcon&&!cls.netcon.disconnected&&c.message.cursize&&NET_CanSendMessage(c.netconnection)){NET_SendMessage(c.netconnection,c.message);NET_GetMessage(cls.netcon);SZ_Clear(c.message);}}
function finishConnect(){SV_CheckForNewClients();const c=svs.clients[0];check(c.active&&c.netconnection&&cls.netcon?.driverdata===c.netconnection,'actual local loopback is paired');set_host_client(c);SV_SetPlayer(c.edict);cmd.Cmd_ExecuteString('spawn',cmd.src_client);cmd.Cmd_ExecuteString('begin',cmd.src_client);cls.signon=4;cl.intermission=0;acknowledge();R_DemoLoadingCancel();check(c.edict.v.health>0&&text(c.edict.v.classname)==='player','actual native spawn command initializes living player');return c.edict;}
async function command(value){acknowledge();cmd.Cmd_ExecuteString(value,cmd.src_command);await Promise.resolve();return finishConnect();}
async function fresh(map='start',newer=true,difficulty=1){vars.Cvar_SetValue('r_hdr',newer?1:0);vars.Cvar_SetValue('skill',difficulty);vars.Cvar_SetValue('sv_seamless',1);const p=await command('map '+map);if(map==='start')same(sv.worldmodel.entities.includes('_newer_start_corridor'),newer,'actual selected START variant follows native/Newer mode');return p;}
const hall=label=>sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='trigger_multiple'&&text(e.v.message)===`This hall selects ${label} skill`);
const late=value=>sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='trigger_setskill'&&text(e.v.message)===String(value));
const overlaps=(p,e)=>[0,1,2].every(i=>p.v.absmax[i]>=e.v.absmin[i]&&p.v.absmin[i]<=e.v.absmax[i]);
function place(p,position){const fit=SV_Move(position,p.v.mins,p.v.maxs,position,MOVE_NOMONSTERS,p);check(!fit.startsolid&&!fit.allsolid,'native player hull fits test position '+position);p.v.origin=position;p.v.velocity=[0,0,0];p.v.angles=[0,90,0];p.v.v_angle=[0,90,0];SV_LinkEdict(p,false);}
function enter(p,label,value,x){const entry=hall(label),end=late(value);check(entry?.v.touch&&end?.v.touch,'real native entrance and late brushes exist '+label);place(p,[x,entry.v.absmin[1]-p.v.maxs[1]-24,8]);check(!overlaps(p,entry),'approach starts outside actual entrance');let steps=0;
 for(;steps<12;steps++){const before=Array.from(p.v.origin);sv.time+=.1;const tr=SV_PushEntity(p,[0,4,0]);check(!tr.startsolid&&tr.fraction===1,'native entrance movement is collision-free');same(p.v.origin[1],before[1]+4,'no teleport during corridor approach');check(!overlaps(p,end),'entry occurs before the late skill brush');for(const t of sv.edicts.filter(e=>e&&!e.free&&text(e.v.classname)==='trigger_teleport'))check(!overlaps(p,t),'entry occurs before every teleporter');if(run.R_FlashlightRunStatus().selectedSkill===value)break;}
 check(steps<12&&overlaps(p,entry),'policy fires at real floor-message contact');return{entry,end,position:Array.from(p.v.origin),steps:steps+1};}
function touchMenu(x,y){const w=draw.Draw_GetVirtualWidth(),h=draw.Draw_GetVirtualHeight();menu.M_TouchInput(x+(w-320)/2,y+(h-200)/2,w,h);}

Deno.test('actual Newer menu and fresh Host map START reset both aids, and native Easy Normal Hard entrances apply their exact matrix before skill or teleport',async()=>{
 const windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1,innerWidth:640,innerHeight:400,location:{search:'',pathname:'/'}}});
 try{setAids(1,1);acknowledge();cmd.Cmd_ExecuteString('menu_singleplayer',cmd.src_command);touchMenu(160,42);cmd.Cbuf_Execute();await Promise.resolve();finishConnect();expect([0,0],'actual Newer Game menu -> Host map begins both aids off');same(cls.state,ca_connected,'actual menu connects a local game');
 const rows=[];for(const[label,value,x,wanted,probe]of[['EASY',0,232,[1,1],[0,0]],['NORMAL',1,544,[1,0],[0,1]],['HARD',2,864,[0,0],[1,1]]]){setAids(1,1);const p=await fresh();expect([0,0],'every fresh Newer START resets existing aid choices');setAids(...probe);const beforeSkill=skill.value,w=enter(p,label,value,x);expect(wanted,label+' actual entrance defaults');same(skill.value,beforeSkill,'visual entrance does not change native difficulty early');rows.push({label,position:w.position,steps:w.steps,aids:aids(),entranceBounds:[Array.from(w.entry.v.absmin),Array.from(w.entry.v.absmax)],lateY:w.end.v.absmin[1]});}console.log('WELCOME_NATIVE_AID_MATRIX '+JSON.stringify(rows));
 }finally{if(windowDescriptor)Object.defineProperty(globalThis,'window',windowDescriptor);else delete globalThis.window;}
});
Deno.test('manual flashlight and crosshair choices survive repeated actual corridor contact and the later native skill trigger',async()=>{
 for(const[label,value,x,manual]of[['EASY',0,232,[0,0]],['NORMAL',1,544,[0,1]],['HARD',2,864,[1,1]]]){const p=await fresh();const w=enter(p,label,value,x);cmd.Cmd_ExecuteString('flashlight',cmd.src_command);cmd.Cmd_ExecuteString('crosshair '+manual[1],cmd.src_command);expect(manual,'actual manual input changes aids after '+label);for(let i=0;i<5;i++){sv.time+=.3;SV_PushEntity(p,[0,4,0]);expect(manual,'repeated floor contact preserves manual choices');}
 place(p,[x,w.end.v.absmin[1]-p.v.maxs[1]-4,48]);sv.time+=.3;SV_PushEntity(p,[0,6,0]);check(overlaps(p,w.end),'native movement touches late skill brush');same(skill.value,value,'native late skill selection still executes');expect(manual,'same late choice cannot repeat visual defaults');}
});
Deno.test('Classic START and direct non-START map commands preserve both aids at every difficulty instead of installing welcome defaults',async()=>{
 for(const setting of[[0,1],[1,0]]){setAids(...setting);await fresh('start',false);expect(setting,'Classic START preserves manual aids');}
 const rows=[];for(let n=1;n<=8;n++){const setting=n%2?[0,1]:[1,0],difficulty=(n-1)%4;setAids(...setting);await fresh('e1m'+n,true,difficulty);expect(setting,'direct Newer level keeps aids irrespective of skill');rows.push({map:sv.name,skill:skill.value,aids:aids()});}console.log('WELCOME_DIRECT_LEVEL_PRESERVATION '+JSON.stringify(rows));
});
Deno.test('real save/load inside Easy floor or late skill contact preserves manual-off aids and seeds only contact deduplication even after cold run reset',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}});
 try{for(const location of['floor','late']){let p=await fresh();enter(p,'EASY',0,232);if(location==='late'){const t=late(0);place(p,[232,t.v.absmin[1]-p.v.maxs[1]-4,48]);SV_PushEntity(p,[0,6,0]);check(overlaps(p,t),'save occupies late skill brush');}cmd.Cmd_ExecuteString('flashlight',cmd.src_command);cmd.Cmd_ExecuteString('crosshair 0',cmd.src_command);expect([0,0],'manual off before saving inside Easy');acknowledge();cmd.Cmd_ExecuteString('save welcome_'+location,cmd.src_command);check([...data.values()].some(x=>x.includes('This hall selects EASY skill')),'actual host command saved native world');const savedOrigin=Array.from(p.v.origin);run.R_FlashlightRunEnd();same(run.R_FlashlightRunStatus().active,false,'simulate cold run coordinator before loading');p=await command('load welcome_'+location);expect([0,0],'actual load changes neither aid');same(run.R_FlashlightRunStatus().selectedSkill,0,'load only remembers already occupied Easy choice');savedOrigin.forEach((v,i)=>check(Math.abs(v-p.v.origin[i])<.001,'saved native player position restored'));sv.time+=.4;SV_PushEntity(p,[0,1,0]);expect([0,0],'first repeated native contact after load cannot reapply Easy defaults');}}
 finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
Deno.test('native respawn and an actual seamless round trip preserve both aids without treating arrival as fresh START',async()=>{
 let p=await fresh();enter(p,'NORMAL',1,544);setAids(0,1);progs.pr_global_struct.self=progs.EDICT_TO_PROG(p);progs.pr_global_struct.time=sv.time;PR_ExecuteProgram(progs.pr_functions.indexOf(ED_FindFunction('ClientKill')));const s=p._respawn?.sequence;check(s,'real native death admitted');for(const t of[s.at+.22+s.turn/2+.001,s.at+.22+s.turn+.001]){sv.time=t;SV_SetFrametime(.001);SV_Physics_Client(p,1);expect([0,1],'owned native respawn does not reset aids');}same(p.v.health,90,'respawn really completed (Normal: the first death respawns at 90)');
 p=await fresh('e1m2');expect([0,1],'direct level before travel preserves choices');const before=run.R_FlashlightRunStatus();
 for(const destination of['e1m3','e1m2']){const c=travel.SV_SeamlessCrossings().find(c=>c.map===destination);check(c,'actual native passage exists '+destination);p.v.origin=c.transform.center.map((v,i)=>v-c.transform.through[i]*32);p.v.velocity=c.transform.through.map(v=>v*120);SV_LinkEdict(p,false);travel.SV_SeamlessFrame();for(let step=0;step<18&&!travel.SV_SeamlessPending();step++){sv.time+=.1;const tr=SV_PushEntity(p,c.transform.through.map(v=>v*4));check(!tr.startsolid,'native passage movement fits');travel.SV_SeamlessFrame();}same(travel.SV_SeamlessPending()?.map,destination,'movement queues real transition');acknowledge();cmd.Cbuf_Execute();await Promise.resolve();p=finishConnect();travel.SV_SeamlessHolding(1);sv.time+=5;expect([0,1],'native seamless command/arrival preserves both aids');}
 same(run.R_FlashlightRunStatus().noticeShown,before.noticeShown,'travel does not reset run notice state');console.log('WELCOME_TRAVEL_RESPAWN_PRESERVATION '+JSON.stringify({map:sv.name,aids:aids(),health:p.v.health}));acknowledge();CL_Disconnect_f();pak.COM_SetNewerMapsEnabled(false);
});
