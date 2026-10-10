// Quad vision public contract using actual local QC pickup and native alias
// pose geometry. Renderer calls are recorded; the finite GPU trial separately
// checks mask and post pixels. No browser or gameplay loop is launched.
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


import * as THREE from 'three';
import * as quadVision from '../src/r_quadvision.js';
import {cl_entities} from '../src/client.js';
import {FL_MONSTER} from '../src/engine/server/server.js';
import {IT_QUAD,STAT_HEALTH} from '../src/engine/common/quakedef.js';
function acquire(p){const pickup=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='item_artifact_super_damage');check(pickup,'native Quad pickup');if(pickup.v.solid!==1&&pickup.v.think){progs.pr_global_struct.self=progs.EDICT_TO_PROG(pickup);PR_ExecuteProgram(pickup.v.think);}progs.pr_global_struct.other=progs.EDICT_TO_PROG(p);native(pickup,'powerup_touch');check(p.v.items&IT_QUAD,'native QC granted Quad');cl.items=p.v.items;cl.stats[STAT_HEALTH]=p.v.health;cl.time=sv.time;}
function renderFixture(){
 const source=new THREE.Texture(),hdr={width:160,height:90,depthTexture:new THREE.Texture(),textures:[source,new THREE.Texture()]},camera=new THREE.PerspectiveCamera(75,160/90,4,4096),world=new THREE.Scene(),calls=[],targets=[];camera.updateMatrixWorld();world.rotation.x=.4;world.updateMatrixWorld(true);
 const originalTarget={name:'caller target'},originalClear=new THREE.Color(.1,.2,.3);let target=originalTarget,clear=originalClear.clone(),alpha=.37,fail=false;
 const renderer={getRenderTarget:()=>target,setRenderTarget:value=>{target=value;if(value?.isWebGLRenderTarget&&!targets.includes(value))targets.push(value);},getClearColor:out=>out.copy(clear),getClearAlpha:()=>alpha,setClearColor:(value,a)=>{clear.set(value);alpha=a;},clear(){},render(scene,cam){calls.push({scene,cam,target,children:[...scene.children],geometry:scene.children.map(m=>m.geometry),material:scene.children.map(m=>m.material),matrix:scene.matrix.clone()});if(fail)throw Error('controlled Quad mask failure');}};
 return{source,hdr,camera,world,calls,targets,renderer,originalTarget,originalClear,render:()=>quadVision.R_QuadVisionRender(renderer,source,hdr,camera,world),set fail(value){fail=value;},dispose(){quadVision.R_QuadVisionReset();source.dispose();hdr.depthTexture.dispose();hdr.textures[1].dispose();}};
}
Deno.test('Quad vision public selection includes server-only hidden enemies and excludes dead free nonmonster and missing native poses',()=>{
 const body={cache:{data:{posedata:[[]]}}},server={models:[null,body],edicts:[]};const enemy=(overrides={})=>({free:false,v:{health:100,deadflag:0,flags:FL_MONSTER,modelindex:1,...overrides}});const hidden=enemy();server.edicts=[hidden,enemy({health:0}),enemy({deadflag:1}),enemy({flags:0}),enemy({modelindex:0}),{...enemy(),free:true},null];same(quadVision.QuadVisionEnemies(server).length,1,'only living posed monster selected');same(quadVision.QuadVisionEnemies(server)[0],hidden,'server-only entity selected without client or scene dependency');
});
Deno.test('native Quad public renderer reconstructs PVS-hidden server poses and reuses them without mutating gameplay or client visibility',async()=>{
 const p=await fresh();acquire(p);const f=renderFixture();try{
 check(quadVision.R_QuadVisionActive(),'real local native pickup activates vision');const expected=quadVision.QuadVisionEnemies(sv);check(expected.length>0,'native E1M1 living monsters exist');const hidden=expected[0],slot=sv.edicts.indexOf(hidden);check(!cl_entities[slot].model,'selected native monster is absent from client PVS entity representation');same(f.world.children.length,0,'ordinary visible scene contains no monster');
 const before=expected.map(e=>JSON.stringify({origin:Array.from(e.v.origin),angles:Array.from(e.v.angles),health:e.v.health,items:e.v.items,frame:e.v.frame,flags:e.v.flags}));const output=f.render();same(f.calls.length,2,'one native mask pass and one composite pass');same(f.calls[0].children.length,expected.length,'all native hidden monsters receive proxies');same(f.calls[0].cam,f.camera,'mask uses current scene camera');check(f.calls[0].matrix.equals(f.world.matrixWorld),'mask shares actual world orientation');same(output,f.calls[1].target.texture,'public output belongs to completed post pass');same(f.renderer.getRenderTarget(),f.originalTarget,'caller target restored');same(f.renderer.getClearColor(new THREE.Color()).getHex(),f.originalClear.getHex(),'caller clear color restored');same(f.renderer.getClearAlpha(),.37,'caller clear alpha restored');
 const mesh=f.calls[0].children[0],header=sv.models[hidden.v.modelindex].cache.data,pose=header.frames[hidden.v.frame|0]?.firstpose??header.frames[0].firstpose,template=header._geoCache.get(pose);check(mesh.geometry.getAttribute('position')!==template.posAttr,'proxy owns its position buffer for safe disposal');const nativePositions=Array.from(template.posAttr.array).join();same(Array.from(mesh.geometry.getAttribute('position').array).join(),nativePositions,'owned proxy copies exact native pose coordinates');same(Array.from(mesh.geometry.index.array).join(),Array.from(template.indices).join(),'native triangle indices preserved');same(mesh.position.toArray().join(),Array.from(hidden.v.origin).join(),'proxy retains actual native position');same(f.calls[1].children[0].material.uniforms.tDepth.value,f.hdr.depthTexture,'post receives real scene depth');same(f.calls[1].children[0].material.uniforms.tNormal.value,f.hdr.textures[1],'post receives held-weapon semantic packet');
 const targets=f.targets.slice(),geometry=mesh.geometry;f.calls.length=0;f.render();same(f.calls[0].children[0],mesh,'steady entity reuses proxy');same(mesh.geometry,geometry,'steady pose reuses geometry');same(f.targets.length,targets.length,'steady frames allocate no render targets');same(f.world.children.length,0,'proxies never enter gameplay scene');same(cl_entities[slot].model,null,'hidden proxy never populates client visibility');expected.forEach((e,i)=>same(JSON.stringify({origin:Array.from(e.v.origin),angles:Array.from(e.v.angles),health:e.v.health,items:e.v.items,frame:e.v.frame,flags:e.v.flags}),before[i],'render does not mutate server entity'));
 const oldHealth=hidden.v.health;hidden.v.health=0;f.calls.length=0;f.render();same(f.calls[0].children.length,expected.length-1,'native death promptly removes hidden proxy');hidden.v.health=oldHealth;quadVision.R_QuadVisionReset();same(Array.from(template.posAttr.array).join(),nativePositions,'expiry disposal leaves native pose coordinates intact');same(header._geoCache.get(pose),template,'native geometry template remains available after proxy cleanup');
 }finally{f.dispose();acknowledge();CL_Disconnect_f();}
});
Deno.test('Quad expiry Classic death and resize retire owned render resources and exception paths restore caller render state',async()=>{
 const p=await fresh();acquire(p);const f=renderFixture();try{
 f.render();const owned=new Set([...f.targets,...f.calls.flatMap(c=>c.geometry),...f.calls.flatMap(c=>c.material)]),counts=new Map([...owned].map(resource=>[resource,0]));for(const resource of owned)resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));cl.items&=~IT_QUAD;const count=f.calls.length;same(f.render(),f.source,'authoritative expiry returns original composite');same(f.calls.length,count,'expired vision adds no passes');for(const value of counts.values())same(value,1,'expiry disposes owned resource exactly once');quadVision.R_QuadVisionReset();for(const value of counts.values())same(value,1,'repeated reset is idempotent');
 cl.items|=IT_QUAD;f.calls.length=0;f.render();f.fail=true;let error;try{f.render();}catch(caught){error=caught;}check(String(error).includes('controlled Quad mask failure'),'real mask callback failed');same(f.renderer.getRenderTarget(),f.originalTarget,'failure restores original target');same(f.renderer.getClearColor(new THREE.Color()).getHex(),f.originalClear.getHex(),'failure restores clear color');same(f.renderer.getClearAlpha(),.37,'failure restores clear alpha');f.fail=false;
 const oldTarget=f.calls[0].target;let resized=0;oldTarget.addEventListener('dispose',()=>resized++);f.hdr.width=320;f.hdr.height=180;f.render();same(resized,1,'resize retires old mask');same(f.calls.at(-1).target.width,320,'new output matches framebuffer');vars.Cvar_SetValue('r_hdr',0);same(f.render(),f.source,'Classic hides and clears enhanced silhouettes');vars.Cvar_SetValue('r_hdr',1);cl.stats[STAT_HEALTH]=0;same(f.render(),f.source,'death hides silhouettes');cl.stats[STAT_HEALTH]=100;cl.intermission=1;same(f.render(),f.source,'intermission hides silhouettes');cl.intermission=0;
 }finally{f.dispose();acknowledge();CL_Disconnect_f();}
});
Deno.test('actual post and palette entry points activate Quad alone and restore native blue tint in Classic',async()=>{
 const p=await fresh();acquire(p);const f=renderFixture(),post=await import('../src/gl_post.js'),anim=await import('../src/r_anim.js'),view=await import('../src/view.js'),{CSHIFT_POWERUP}=await import('../src/client.js'),features=[anim.r_newer_lighting,anim.r_newer_normals,anim.r_newer_water],saved=features.map(v=>v.value);
 Object.assign(f.renderer,{capabilities:{isWebGL2:true},extensions:{has:()=>true},setViewport(){},setScissorTest(){}});features.forEach(v=>v.value=0);
 try{check(post.R_PostBegin(f.renderer,true,160,90),'Quad independently starts shared post path with other options off');view.V_UpdatePalette();same(cl.cshifts[CSHIFT_POWERUP].percent,0,'active Quad silhouette replaces obsolete blue wash');post.R_PostBind(f.renderer);post.R_PostFinish(f.renderer,f.world,f.camera,{lx:0,ly:0,lw:160,lh:90},0,[],[],cl.time,1,false);same(f.calls.length,4,'actual post path runs composite mask purple pass and final display');check(f.calls[1].children.length>0,'actual post path includes server-only native monster proxies');same(f.calls[3].target,null,'final picture reaches display');same(f.calls[3].material[0].uniforms.tComposite.value,f.calls[2].target.texture,'final display receives completed Quad picture');
 vars.Cvar_SetValue('r_hdr',0);same(post.R_PostBegin(f.renderer,false,160,90),false,'Classic bypasses enhanced post');view.V_UpdatePalette();same(cl.cshifts[CSHIFT_POWERUP].percent,30,'Classic preserves native Quad blue tint');
 }finally{post.R_PostShutdown();features.forEach((v,i)=>v.value=saved[i]);f.dispose();acknowledge();CL_Disconnect_f();}
});
