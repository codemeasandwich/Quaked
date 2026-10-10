// Independent facing/eligibility proof at actual native QC and observation
// boundaries. Owned Rogue data is read in bounded members; no owned bytes are
// written, and no browser or background gameplay is launched.
import {readFileSync} from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init} from '../src/engine/render/gl_model.js';
import {PR_InitBuiltins} from '../src/engine/progs/pr_cmds.js';
import {PR_ExecuteProgram} from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import {ED_FindFunction,ED_FindField,ED_NewString,GetEdictFieldValue} from '../src/engine/progs/pr_edict.js';
import {sv,svs,client_t,set_host_client,skill} from '../src/engine/server/server.js';
import {SV_CheckForNewClients,SV_Init} from '../src/engine/server/sv_main.js';
import {SV_SetPlayer,SV_SetFrametime,SV_Physics_Client,sv_gravity} from '../src/engine/server/sv_phys.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import {Host_InitCommands} from '../src/engine/server/host_cmd.js';
import {CL_Init,CL_Disconnect_f} from '../src/engine/client/cl_main.js';
import {cls,cl,cl_entities,cl_visedicts,cl_dlights,set_cl_numvisedicts,ca_disconnected} from '../src/engine/client/client.js';
import {NET_Init,NET_SendMessage,NET_GetMessage,NET_CanSendMessage} from '../src/engine/net/net_main.js';
import {SZ_Clear} from '../src/engine/common/common.js';
import {R_Init} from '../src/engine/render/gl_rmain.js';
import {V_Init} from '../src/engine/client/view.js';
import {SV_RunClients} from '../src/engine/server/sv_user.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import {R_DemoLoadingCancel} from '../src/r_demoloading.js';
const check=(x,m)=>{if(!x)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),text=i=>progs.PR_GetString(i);
const bytes=readFileSync(new URL('../pak0.pak',import.meta.url));
pak.COM_AddPack(pak.COM_LoadPackFile('pak0.pak',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)));
VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);Mod_Init();PR_InitBuiltins();SV_Init();cmd.Cbuf_Init();cmd.Cmd_Init();CL_Init();R_Init();V_Init();Host_InitCommands();
for(const c of[skill,sv_gravity,travel.sv_seamless])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
svs.maxclients=svs.maxclientslimit=1;svs.clients=[new client_t()];NET_Init();cls.state=ca_disconnected;cls.demoplayback=false;
function acknowledge(){const c=svs.clients[0];if(c?.active&&c.netconnection&&cls.netcon&&!cls.netcon.disconnected&&c.message.cursize&&NET_CanSendMessage(c.netconnection)){NET_SendMessage(c.netconnection,c.message);NET_GetMessage(cls.netcon);SZ_Clear(c.message);}}
function finishConnect(){SV_CheckForNewClients();const c=svs.clients[0];check(c.active&&c.netconnection&&cls.netcon?.driverdata===c.netconnection,'actual local loopback is paired');set_host_client(c);SV_SetPlayer(c.edict);cmd.Cmd_ExecuteString('spawn',cmd.src_client);SV_RunClients();cmd.Cmd_ExecuteString('begin',cmd.src_client);cls.signon=4;cl.intermission=0;acknowledge();R_DemoLoadingCancel();check(c.edict.v.health>0&&text(c.edict.v.classname)==='player','actual native spawn command initializes living player');return c.edict;}
async function command(value){acknowledge();cmd.Cmd_ExecuteString(value,cmd.src_command);await Promise.resolve();return finishConnect();}
async function fresh(map='e1m1'){vars.Cvar_SetValue('r_hdr',1);vars.Cvar_SetValue('skill',1);vars.Cvar_SetValue('sv_seamless',1);return command('map '+map);}

import * as THREE from 'three';
import * as bestiary from '../src/r_bestiary.js';
import {Bestiary_FacesPlayer} from '../src/bestiary_state.js';
import * as main from '../src/engine/render/gl_rmain.js';
import * as post from '../src/newer/render/gl_post.js';
import * as host from '../src/engine/server/host.js';
import * as keys from '../src/engine/client/keys.js';
import * as input from '../src/engine/client/cl_input.js';
import {IN_Move} from '../src/platform/in_web.js';
import * as loading from '../src/r_demoloading.js';
import * as parts from '../src/engine/render/r_part.js';
import {R_ShellTrace} from '../src/newer/render/r_shelltrace.js';
import {SV_Move,SV_LinkEdict,MOVE_NOMONSTERS,MOVE_NORMAL} from '../src/engine/server/world.js';
import {R_DrawAliasModel} from '../src/engine/render/gl_mesh.js';
import {r_refdef,entity_t} from '../src/engine/render/render.js';
const near=(a,b,m,e=1e-6)=>check(Math.abs(a-b)<=e,`${m}: ${a} != ${b}`);
const store=new Map(),storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))}});
keys.Key_Init();
const catalog=bestiary.R_BestiaryEntries(),living=()=>sv.edicts.slice(0,sv.num_edicts).filter(e=>e&&!e.free&&e.v.health>0&&e.v.deadflag===0&&catalog.some(c=>c.classes.includes(text(e.v.classname))));
const identify=e=>catalog.find(c=>c.classes.includes(text(e.v.classname)));
async function game(map){const prior=bestiary.R_BestiarySnapshot().unlocked;const p=await fresh(map);cl.worldmodel=sv.worldmodel;cl.model_precache=sv.models.slice();cl.maxclients=1;cl.viewentity=1;cl.stats[0]=p.v.health;cl.time=cl.oldtime=sv.time;cl.mtime[0]=cl.mtime[1]=sv.time;cl.paused=false;sv.paused=false;keys.set_key_dest(keys.key_game);input.CL_SuspendGameButtons();p.v.flags|=64;p.v.velocity=[0,0,0];cl.viewangles.set(p.v.v_angle);bestiary.R_BestiaryCancel();bestiary.R_BestiaryFrame(host.realtime);for(let i=0;i<12;i++)host.Host_Frame(.05);check(prior.every(id=>bestiary.R_BestiarySnapshot().unlocked.includes(id)),'actual new map retains all prior journal discoveries');return p;}
function poseCamera(p,goal){const eye=Array.from(p.v.origin,(v,i)=>v+(i===2?22:0)+1/32),delta=goal.map((v,i)=>v-eye[i]),angles=[-Math.atan2(delta[2],Math.hypot(delta[0],delta[1]))*180/Math.PI,Math.atan2(delta[1],delta[0])*180/Math.PI,0];r_refdef.vrect.width=640;r_refdef.vrect.height=400;r_refdef.fov_x=90;r_refdef.fov_y=2*Math.atan(1/1.6)*180/Math.PI;r_refdef.vieworg.set(eye);r_refdef.viewangles.set(angles);main.R_SetupFrame();main.R_SetFrustum();main.R_SetupGL();return{eye,angles};}
function centreOf(e){return Array.from(e.v.origin,(v,i)=>v+(e.v.mins[i]+e.v.maxs[i])/2);}
function drawEnemy(e){const ent=new entity_t();ent.model=sv.models[e.v.modelindex];check(ent.model?.cache?.data,'native alias data loaded');ent.origin.set(e.v.origin);ent.angles.set(e.v.angles);ent.frame=e.v.frame;ent._entityIndex=e.index;cl_entities[e.index]=ent;const mesh=R_DrawAliasModel(ent,ent.model.cache.data,new Float32Array(256).fill(1),1);main.scene.add(mesh);mesh.visible=true;mesh.updateMatrixWorld(true);cl_visedicts[0]=ent;set_cl_numvisedicts(1);return ent;}
function clearPair(p,prefer=null,allowKnown=false){for(const e of living().sort((a,b)=>Math.hypot(...Array.from(a.v.origin,(v,i)=>v-p.v.origin[i]))-Math.hypot(...Array.from(b.v.origin,(v,i)=>v-p.v.origin[i])))){if(prefer&&identify(e).id!==prefer||!allowKnown&&bestiary.R_BestiarySnapshot().unlocked.includes(identify(e).id))continue;const think=text(progs.pr_functions[e.v.think]?.s_name||0);if(text(e.v.classname)==='monster_zombie'&&(e.v.spawnflags&1)&&e.v.movetype===0&&/^zombie_cruc[1-6]$/.test(think))continue;const candidate=drawEnemy(e),visualCentre=new THREE.Box3().setFromBufferAttribute(candidate._aliasMesh.geometry.attributes.position).applyMatrix4(candidate._aliasMesh.matrixWorld).getCenter(new THREE.Vector3()).toArray();for(const distance of[256,192,128,96,64])for(const d of[[1,0],[-1,0],[0,1],[0,-1],[Math.SQRT1_2,Math.SQRT1_2],[-Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2],[-Math.SQRT1_2,-Math.SQRT1_2]]){const origin=[e.v.origin[0]+d[0]*distance,e.v.origin[1]+d[1]*distance,e.v.origin[2]];if(!Bestiary_FacesPlayer(e.v.angles,e.v.origin,origin))continue;const fit=SV_Move(origin,p.v.mins,p.v.maxs,origin,MOVE_NORMAL,p),eye=[origin[0],origin[1],origin[2]+22];if(fit.startsolid||fit.allsolid)continue;const tr=R_ShellTrace(cl.worldmodel,eye,visualCentre,0,cl_entities);if(!tr.startsolid&&!tr.allsolid&&tr.fraction>=.999){p.v.origin=origin;p.v.velocity=[0,0,0];SV_LinkEdict(p,false);console.log('BESTIARY_NATIVE_VIEW '+JSON.stringify({map:sv.name,id:identify(e).id,classname:text(e.v.classname),player:origin,enemy:Array.from(e.v.origin),target:visualCentre}));return e;}}}throw Error('No hull-safe native unseen enemy sightline');}
const observe=e=>bestiary.R_BestiaryObserve(main.scene,main.camera,[e]);

import {pakDirectory,readMember,isolatedPack} from '../tools/pak_members.mjs';
import {MOVETYPE_NONE,DAMAGE_AIM} from '../src/engine/server/server.js';
function qcName(e,field){const f=GetEdictFieldValue(e,field);return f?text(progs.pr_functions[f.accessor.getInt32(f.ofs)]?.s_name||0):'';}
function nativeCall(e,name){const f=ED_FindFunction(name);check(f,'real native function '+name);progs.pr_global_struct.self=progs.EDICT_TO_PROG(e);progs.pr_global_struct.other=progs.EDICT_TO_PROG(sv.edicts[1]);progs.pr_global_struct.activator=progs.EDICT_TO_PROG(sv.edicts[1]);progs.pr_global_struct.time=sv.time;PR_ExecuteProgram(progs.pr_functions.indexOf(f));}
let eligibilityClock=100;
function readyObservation(){bestiary.R_BestiaryCancel();bestiary.R_BestiaryFrame(eligibilityClock+=2);}
function invariantSnapshot(p){return JSON.stringify({journal:[...store],unlocked:bestiary.R_BestiarySnapshot().unlocked,phase:bestiary.R_BestiarySnapshot().phase,scale:bestiary.R_BestiaryTimeScale(),serverPaused:sv.paused,clientPaused:cl.paused,serverTime:sv.time,clientTime:cl.time,qcTime:progs.pr_global_struct.time,origin:Array.from(p.v.origin),serverAngles:Array.from(p.v.v_angle),clientAngles:Array.from(cl.viewangles),cameraPosition:main.camera.position.toArray(),cameraQuaternion:main.camera.quaternion.toArray(),fov:main.camera.fov});}
function rejected(p,ent,label){const before=invariantSnapshot(p);same(observe(ent),false,label+' observation rejected');same(bestiary.R_BestiaryApplyCamera(main.camera),false,label+' no borrowed camera');same(invariantSnapshot(p),before,label+' leaves journal clocks pause and camera untouched');}
function placeFor(p,e){const ent=drawEnemy(e),visualCentre=new THREE.Box3().setFromBufferAttribute(ent._aliasMesh.geometry.attributes.position).applyMatrix4(ent._aliasMesh.matrixWorld).getCenter(new THREE.Vector3()).toArray();for(const distance of[256,192,128,96,64,48])for(let i=0;i<16;i++){const a=i*Math.PI/8,origin=[e.v.origin[0]+Math.cos(a)*distance,e.v.origin[1]+Math.sin(a)*distance,e.v.origin[2]];if(!Bestiary_FacesPlayer(e.v.angles,e.v.origin,origin))continue;const fit=SV_Move(origin,p.v.mins,p.v.maxs,origin,MOVE_NORMAL,p);if(fit.startsolid||fit.allsolid)continue;const eye=[...origin];eye[2]+=22;const trace=R_ShellTrace(cl.worldmodel,eye,visualCentre,0,cl_entities);if(!trace.startsolid&&!trace.allsolid&&trace.fraction>=.999){p.v.origin=origin;p.v.velocity=[0,0,0];SV_LinkEdict(p,false);poseCamera(p,visualCentre);return ent;}}return null;}
Deno.test('facing threshold follows actual native alias +X matrix for pitched rolled and yawed models',async()=>{
 const p=await game('e1m1'),e=living().find(e=>text(e.v.classname)==='monster_army');check(e,'actual native grunt');const angles=Array.from(e.v.angles),origin=Array.from(e.v.origin);let cases=0;
 try{for(const rotation of[[0,0,0],[0,90,0],[30,45,0],[-40,210,23],[75,330,-50]]){e.v.angles=rotation;const ent=drawEnemy(e),mesh=ent._aliasMesh;mesh.updateMatrixWorld(true);const center=new THREE.Vector3(...origin),forward=new THREE.Vector3(1,0,0).transformDirection(mesh.matrixWorld),side=new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld);for(const [angle,expected]of[[0,true],[88.9,true],[-88.9,true],[89,true],[-89,true],[89.001,false],[-89.001,false],[90,false],[-90,false],[180,false],[-180,false]]){const direction=forward.clone().multiplyScalar(Math.cos(angle*Math.PI/180)).addScaledVector(side,Math.sin(angle*Math.PI/180)),target=center.clone().addScaledVector(direction,128).toArray();same(Bestiary_FacesPlayer(rotation,origin,target),expected,'actual rendered facing boundary '+rotation+' separation '+angle);cases++;}}
 for(const[angle,originValue,player]of[[[NaN,0,0],origin,origin],[[],origin,origin],[[0,0,0],[Infinity,0,0],origin],[[0,0,0],origin,origin],[[0,0,0],origin,[0,0,Infinity]]])same(Bestiary_FacesPlayer(angle,originValue,player),false,'invalid/coincident origins cannot admit encounter');console.log('BESTIARY_FACING_MATRIX '+cases+'/55');
 }finally{e.v.angles=angles;}
});
Deno.test('public native observation rejects back-facing living idle enemies without side effects then accepts ordinary idle when facing',async()=>{
 const p=await game('e1m1');readyObservation();let e,ent;for(const candidate of living().filter(e=>text(e.v.classname)==='monster_army'&&/^army_stand/.test(qcName(e,'think')))){ent=placeFor(p,candidate);if(ent){e=candidate;break;}}check(e,'clear hull-safe actual native idle candidate');check(/^army_stand/.test(qcName(e,'think')),'ordinary native standing idle is the positive control');const rotation=Array.from(e.v.angles);const facing=Array.from(e.v.origin,(v,i)=>p.v.origin[i]-v),yaw=Math.atan2(facing[1],facing[0])*180/Math.PI;e.v.angles=[0,yaw+180,0];drawEnemy(e);rejected(p,ent,'native monster turned away');e.v.angles=[0,yaw,0];ent=drawEnemy(e);check(observe(ent),'ordinary living idle native monster is eligible');same(bestiary.R_BestiarySnapshot().entry.id,'grunt','ordinary actor identity preserved');e.v.angles=rotation;readyObservation();
});
Deno.test('actual pinned zombie remains excluded after native damage fix while alive and still crucified',async()=>{
 const p=await game('start');readyObservation();const pinned=sv.edicts.filter(e=>e&&!e.free&&text(e.v.classname)==='monster_zombie'&&(e.v.spawnflags&1)&&e.v.movetype===MOVETYPE_NONE&&/^zombie_cruc[1-6]$/.test(qcName(e,'think')));check(pinned.length>=2,'actual START pinned zombies present');
 const {OFS_PARM0}=await import('../src/engine/progs/pr_comp.js');for(const e of pinned){same(e.v.takedamage,DAMAGE_AIM,'real spawn applied pinned-zombie damage fix');same(qcName(e,'th_pain'),'','fixed pinned zombie no longer has misleading native pain callback');let ent=placeFor(p,e);check(ent,'actual pinned body has clear facing sightline');rejected(p,ent,'fixed but still crucified zombie');const before=e.v.health;progs.pr_globals_int[OFS_PARM0]=progs.EDICT_TO_PROG(e);progs.pr_globals_int[OFS_PARM0+3]=progs.EDICT_TO_PROG(p);progs.pr_globals_int[OFS_PARM0+6]=progs.EDICT_TO_PROG(p);progs.pr_globals_float[OFS_PARM0+9]=5;nativeCall(e,'T_Damage');check(e.v.health>0&&e.v.health<before,'real native nonlethal damage reached pinned body');same(e.v.movetype,MOVETYPE_NONE,'damage did not unpin native movement');check(/^zombie_cruc[1-6]$/.test(qcName(e,'think')),'native crucifixion thinker retained');ent=drawEnemy(e);rejected(p,ent,'damaged but still crucified zombie');}
});
Deno.test('real Rogue statues reject dormancy and admit only after their actual activation callbacks execute',async()=>{
 acknowledge();CL_Disconnect_f();const owned=await pakDirectory('resources/id1/pak0.pak'),rogue=await pakDirectory('resources/rogue/pak0.pak');
 for(const[name,entry]of owned)if(/^progs\//.test(name)||/^maps\/b_/.test(name))pak.COM_AddPack(isolatedPack(name,await readMember(entry)));
 for(const[name,entry]of rogue)if(name==='progs.dat'||/^progs\//.test(name)||/^maps\/b_/.test(name)||name==='maps/r2m1.bsp')pak.COM_AddPack(isolatedPack(name,await readMember(entry)));
 const p=await game('r2m1');readyObservation();same(progs.pr_crc,48868,'actual installed Rogue program identity');check(ED_FindFunction('knight_pause')&&ED_FindFunction('hknight_pause'),'real Rogue program contains both activation functions');const rows=[];
 for(const[classname,prefix,id]of[['monster_knight','knight','statue_knight'],['monster_hell_knight','hknight','statue_death_knight']]){let enemy,ent;for(const e of sv.edicts.filter(e=>e&&!e.free&&text(e.v.classname)===classname&&(e.v.spawnflags&2)&&e.v.skin===1&&[qcName(e,'think'),qcName(e,'th_stand'),qcName(e,'th_walk'),qcName(e,'th_run')].includes(prefix+'_pause1'))){ent=placeFor(p,e);if(ent){enemy=e;break;}}check(enemy,'actual clear-facing dormant Rogue '+id);const before={think:qcName(enemy,'think'),stand:qcName(enemy,'th_stand'),walk:qcName(enemy,'th_walk'),run:qcName(enemy,'th_run')};rejected(p,ent,'native dormant '+id);nativeCall(enemy,prefix+'_pause');const after={think:qcName(enemy,'think'),stand:qcName(enemy,'th_stand'),walk:qcName(enemy,'th_walk'),run:qcName(enemy,'th_run')};check(!Object.values(after).includes(prefix+'_pause1'),'actual activation replaced dormant callbacks');ent=placeFor(p,enemy);check(ent,'activated statue still has a clear facing sightline');const waitIndex=progs.pr_functions.indexOf(ED_FindFunction(prefix+'_pause1'));for(const fieldName of['think','th_stand','th_walk','th_run']){const field=GetEdictFieldValue(enemy,fieldName),activeValue=field.accessor.getInt32(field.ofs);try{field.accessor.setInt32(field.ofs,waitIndex);rejected(p,ent,'single remaining dormant '+fieldName+' on '+id);}finally{field.accessor.setInt32(field.ofs,activeValue);}}check(observe(ent),'actual activated Rogue '+id+' is discoverable');same(bestiary.R_BestiarySnapshot().entry.id,id,'activated statue retains its distinct folio');rows.push({id,before,after});readyObservation();}
 console.log('BESTIARY_REAL_ROGUE_STATUES '+JSON.stringify({crc:progs.pr_crc,rows}));
});
Deno.test('restore independent eligibility fixture',()=>{readyObservation();acknowledge();CL_Disconnect_f();if(storageDescriptor)Object.defineProperty(globalThis,'localStorage',storageDescriptor);else delete globalThis.localStorage;});
