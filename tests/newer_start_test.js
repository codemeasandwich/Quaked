// Public menu/touch/key -> real command buffer -> actual cvar state. The map
// command is the only gameplay endpoint replaced: its capture proves options
// are applied BEFORE dispatch, without starting an extra server/browser loop.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as cmd from '../src/engine/common/cmd.js';
import * as menu from '../src/engine/client/menu.js';
import * as keys from '../src/engine/client/keys.js';
import * as draw from '../src/engine/render/gl_draw.js';
import * as vars from '../src/engine/common/cvar.js';
import * as anim from '../src/newer/render/r_anim.js';
import * as post from '../src/newer/render/gl_post.js';
import * as rock from '../src/newer/render/r_rockfield.js';
import { r_heightshadows } from '../src/newer/render/r_heightshadows.js';
import { r_powerups } from '../src/newer/render/r_powerups.js';
import { r_newer_weapons } from '../src/newer/render/r_weapons.js';
import { r_newer_variety } from '../src/newer/render/r_newerskins.js';
import { r_decals } from '../src/newer/render/r_decals.js';
import { r_flashlight } from '../src/newer/render/r_flashlight.js';
import { cl_showfps } from '../src/newer/render/r_perf.js';
import { v_gamma } from '../src/engine/client/view.js';
import { skill } from '../src/engine/server/server.js';
import { cls, ca_disconnected } from '../src/engine/client/client.js';
import * as split from '../src/newer/render/r_demosplit.js';
import { COM_AddPack, COM_LoadPackFile } from '../src/engine/common/pak.js';
import { R_NewerTexturesStatus } from '../src/newer/render/r_newertextures.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
// Literal owner-contract oracle, deliberately not imported from newer_defaults.
const expected=['r_newer_lighting','r_newer_normals','r_newer_shadows','r_pointshadows','r_heightshadows','r_rockfield','r_powerups','r_newer_weapons','r_newer_textures','r_newer_water','r_newer_enemies','r_newer_portals','r_newer_hud','r_decals','r_lerpmodels','r_newer_variety'];
const binary=[anim.r_newer_lighting,anim.r_newer_normals,anim.r_newer_shadows,post.r_pointshadows,r_heightshadows,rock.r_rockfield,r_powerups,r_newer_weapons,anim.r_newer_textures,anim.r_newer_water,anim.r_newer_enemies,anim.r_newer_portals,anim.r_newer_hud,r_decals,anim.r_lerpmodels,r_newer_variety];
const preserved={r_water_look:'3',r_pillars:'0.23',r_cloudspeed:'0.37',r_heathaze:'0.42',r_mist:'0.31',r_reflect:'0.28',r_flashlight:'0'};
const controls=[post.r_hdr,...binary,post.r_water_look,post.r_pillars,post.r_cloudspeed,post.r_heathaze,post.r_mist,post.r_reflect,r_flashlight,v_gamma,cl_showfps,skill,split.r_demosplit];
const memory=new Map([['quake_cvar_r_rockfield','0'],['quake_cvar_r_powerups','0']]);
const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
const priorStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
const initiallyRegistered={rock:!!vars.Cvar_FindVar('r_rockfield'),powerups:!!vars.Cvar_FindVar('r_powerups')};
for(const c of controls)if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
const archivedRegistration={rock:rock.r_rockfield.value,powerups:r_powerups.value};
if(priorStorage)Object.defineProperty(globalThis,'localStorage',priorStorage);else delete globalThis.localStorage;
const bytes=readFileSync(new URL('../pak0.pak',import.meta.url));COM_AddPack(COM_LoadPackFile('pak0.pak',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)));
cmd.Cbuf_Init();cmd.Cmd_Init();menu.M_Init();
const values=names=>Object.fromEntries(names.map(name=>[name,vars.Cvar_VariableString(name)]));let context=null;
cmd.Cmd_AddCommand('disconnect',()=>{context.events.push({action:'disconnect'});context.server.active=false;split.R_DemoSplitEnd();cls.demoplayback=false;});
cmd.Cmd_AddCommand('maxplayers',()=>{context.events.push({action:'maxplayers',value:cmd.Cmd_Argv(1)});context.serverInfo.maxclients=Number(cmd.Cmd_Argv(1));});
cmd.Cmd_AddCommand('map',()=>{
 // A later native disconnect may end attract playback; its stale snapshot
 // must not undo the options already selected by an explicit new game.
 split.R_DemoSplitEnd();rock.R_RockfieldUpdate([0,0,0],1,0);
 const t=new THREE.DataTexture(new Uint8Array([120,80,40,255]),1,1);t.userData.newerPicture=true;
 const textures=R_NewerTexturesStatus({textures:[{name:'bricka2_2',gl_texture:t}]});t.dispose();
 context.events.push({action:'map',map:cmd.Cmd_Argv(1),hdr:vars.Cvar_VariableString('r_hdr'),features:values(expected),preserved:values(Object.keys(preserved)),skill:vars.Cvar_VariableString('skill'),fieldOn:rock.rockUniforms.qrRockOn.value,textureReady:textures.ready,textureFallback:textures.fallback,archivedRock:memory.get('quake_cvar_r_rockfield'),archivedPowerups:memory.get('quake_cvar_r_powerups')});
});
function fixture(fn){const saved=controls.map(c=>c.string),oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),state={state:cls.state,demoplayback:cls.demoplayback,timedemo:cls.timedemo,signon:cls.signon};
 try{Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1,innerWidth:640,innerHeight:400}});Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});split.R_DemoSplitEnd();cmd.Cbuf_Init();cls.state=ca_disconnected;cls.demoplayback=cls.timedemo=false;cls.signon=0;anim.R_AnimSetClassicPass(false);vars.Cvar_Set('r_hdr','0');vars.Cvar_Set('r_demosplit','1');for(const name of expected)vars.Cvar_Set(name,'0');for(const[n,v]of Object.entries(preserved))vars.Cvar_Set(n,v);vars.Cvar_Set('skill','2');context={events:[],characters:[],dest:keys.key_game,server:{active:false},serverInfo:{maxclients:1}};
 menu.M_SetExternals({key_dest_set:v=>context.dest=v,key_dest_get:()=>context.dest,cls,sv:context.server,svs:context.serverInfo,cl:{intermission:0,gametype:0},Draw_CachePic:()=>({width:32,height:32}),Draw_TransPic(){},Draw_Pic(){},Draw_Character:(x,y,c)=>context.characters.push({x,y,c}),Draw_FadeScreen(){},Draw_Fill(){},Draw_ConsoleBackground(){},S_LocalSound(){},host_time_get:()=>0,realtime_get:()=>0,IN_RequestPointerLock(){}});
 fn(context);
 }finally{split.R_DemoSplitEnd();cmd.Cbuf_Init();controls.forEach((c,i)=>vars.Cvar_Set(c.name,saved[i]));Object.assign(cls,state);for(const[n,d]of[['window',oldWindow],['localStorage',oldStorage]]){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];}anim.R_AnimSetClassicPass(false);context=null;}
}
function touch(x,y){const w=draw.Draw_GetVirtualWidth(),h=draw.Draw_GetVirtualHeight();menu.M_TouchInput(x+(w-320)/2,y+(h-200)/2,w,h);}
function single(row){cmd.Cmd_ExecuteString('menu_singleplayer',cmd.src_command);same(menu.m_state,menu.m_singleplayer,'actual single-player menu opens');touch(160,42+row*20);}
function modeText(){context.characters.length=0;menu.M_Draw();const ox=(draw.Draw_GetVirtualWidth()-320)/2,oy=(draw.Draw_GetVirtualHeight()-200)/2;return context.characters.filter(c=>c.y===48+oy&&c.x>=184+ox).sort((a,b)=>a.x-b.x).map(c=>String.fromCharCode(c.c&127)).join('').trim();}
function level(newer,index=1){single(4);same(menu.m_state,menu.m_levelselect,'actual Level Select opens');let text=modeText();check(text==='Newer Game'||text==='New Game','actual rendered mode label is observable: '+text);if((text==='Newer Game')!==newer)touch(220,52);same(modeText(),newer?'Newer Game':'New Game','requested launch mode selected through public touch');touch(160,80+index*8);}
const lastMap=()=>context.events.filter(e=>e.action==='map').at(-1);
function enabled(m,label){check(m,label+' reaches map dispatcher');same(m.hdr,'1',label+' HDR before map');for(const name of expected)same(m.features[name],'1',label+' enables '+name+' before map');same(m.fieldOn,1,label+' public rock runtime gate active');same(m.textureReady,1,label+' real texture status gate enabled');same(m.archivedRock,'1',label+' archived rock default repaired');same(m.archivedPowerups,'1',label+' archived power-up default repaired');same(JSON.stringify(m.preserved),JSON.stringify(preserved),label+' leaves appearance sliders and flashlight policy unchanged');}

Deno.test('archived disabled rock and power-ups plus other disabled enhancements are restored by public Newer Game before actual map command dispatch',()=>fixture(()=>{
 same(initiallyRegistered.rock,false,'test exercises actual archived rock registration');same(initiallyRegistered.powerups,false,'test exercises actual archived power-up registration');same(archivedRegistration.rock,0,'stored rock-off was loaded through public registration');same(archivedRegistration.powerups,0,'stored power-up-off was loaded through public registration');context.server.active=true;single(0);check(!lastMap(),'menu queues launch without dispatching map early');cmd.Cbuf_Execute();const m=lastMap();enabled(m,'Newer Game');same(m.map,'start','normal fresh Newer game selects native hub');same(context.events[0].action,'disconnect','existing game disconnect precedes launch');same(context.events[1].action,'maxplayers','native single-player command retained');same(vars.Cvar_VariableString('gamma'),'0.75','existing Newer gamma default retained');same(vars.Cvar_VariableString('cl_showfps'),'1','existing FPS default retained');console.log('NEWER_MENU_START_BASELINE '+JSON.stringify(m));
}));
Deno.test('public Newer Level Select restores the same literal sixteen-feature baseline while both Classic entry paths preserve choices',()=>fixture(()=>{
 level(true,2);cmd.Cbuf_Execute();const m=lastMap();enabled(m,'Newer Level Select');same(m.map,'e1m2','actual available selected map preserved');same(m.skill,'2','selected skill preserved');
 const preferences=Object.fromEntries(expected.map((n,i)=>[n,i===5?'0.4':i===14?'2':'0']));for(const[n,v]of Object.entries(preferences))vars.Cvar_Set(n,v);context.events.length=0;single(1);cmd.Cbuf_Execute();const classic=lastMap();same(classic.hdr,'0','New Game stays Classic');same(JSON.stringify(classic.features),JSON.stringify(preferences),'Classic New Game never installs Newer defaults');same(classic.fieldOn,0,'Classic runtime keeps relief inactive');same(classic.textureReady,0,'Classic runtime uses native texture policy');same(classic.textureFallback,1,'Classic does not falsely claim replacement readiness');
 context.events.length=0;level(false,1);cmd.Cbuf_Execute();const selected=lastMap();same(selected.hdr,'0','Classic Level Select stays Classic');same(JSON.stringify(selected.features),JSON.stringify(preferences),'Classic level selection retains exact feature preferences');same(selected.map,'e1m1','Classic chosen level retained');console.log('NEWER_LEVEL_SELECT_BASELINE '+JSON.stringify({newer:m,classic:selected}));
}));
Deno.test('opening or canceling menus does not reset settings and real in-session feature toggles remain effective until an explicit new launch',()=>fixture(()=>{
 const before=JSON.stringify(values(expected));cmd.Cmd_ExecuteString('menu_singleplayer');menu.M_Keydown(keys.K_ESCAPE);cmd.Cbuf_Execute();same(JSON.stringify(values(expected)),before,'single-player open/cancel retains disabled preferences');single(4);menu.M_Keydown(keys.K_ESCAPE);cmd.Cbuf_Execute();same(JSON.stringify(values(expected)),before,'Level Select open/cancel retains preferences');same(context.events.length,0,'cancel never dispatches a map');
 single(0);cmd.Cbuf_Execute();enabled(lastMap(),'initial explicit launch');cmd.Cmd_ExecuteString('menu_options');touch(220,36);same(menu.m_state,menu.m_newer,'actual feature menu opens');touch(220,44+5*8+4);same(vars.Cvar_VariableValue('r_newer_textures'),0,'actual in-session texture toggle works');vars.Cvar_Set('r_rockfield','0');vars.Cvar_Set('r_powerups','0');menu.M_Draw();menu.M_Keydown(keys.K_ESCAPE);cmd.Cbuf_Execute();rock.R_RockfieldUpdate([0,0,0],2,200);same(rock.rockUniforms.qrRockOn.value,0,'ongoing explicit relief-off remains effective');same(vars.Cvar_VariableString('r_powerups'),'0','ongoing power-up-off remains selected');
 const changed=JSON.stringify(values(expected));cmd.Cmd_ExecuteString('map e1m1');same(JSON.stringify(lastMap().features),changed,'plain map dispatch does not receive a menu baseline batch');same(vars.Cvar_VariableValue('r_newer_textures'),0,'render/menu activity does not force textures back on');single(0);cmd.Cbuf_Execute();enabled(lastMap(),'next explicit Newer launch');
}));
Deno.test('attract comparison temporarily enables the full baseline and restores exact preferences, while explicit Newer launch survives later demo cleanup',()=>fixture(()=>{
 const preferences=Object.fromEntries(expected.map((n,i)=>[n,i===5?'0.45':i===14?'2':i%3===0?'1':'0']));for(const[n,v]of Object.entries(preferences))vars.Cvar_Set(n,v);const before=JSON.stringify(values(expected));cls.demoplayback=true;split.R_DemoSplitStart();for(const name of expected)same(vars.Cvar_VariableString(name),'1','attract demonstrates '+name);same(r_flashlight.value,1,'existing attract flashlight behavior retained');same(JSON.stringify(values(Object.keys(preserved).filter(n=>n!=='r_flashlight'))),JSON.stringify(Object.fromEntries(Object.entries(preserved).filter(([n])=>n!=='r_flashlight'))),'attract preserves nonbinary appearance settings');split.R_DemoSplitStart();split.R_DemoSplitEnd();same(JSON.stringify(values(expected)),before,'repeated attract start preserves exact original preferences');same(r_flashlight.value,0,'attract stop restores previous flashlight preference');same(vars.Cvar_VariableString('r_hdr'),'0','attract stop restores original mode');
 for(const name of expected)vars.Cvar_Set(name,'0');split.R_DemoSplitStart();single(0);cmd.Cbuf_Execute();enabled(lastMap(),'Newer launch from attract');split.R_DemoSplitEnd();for(const name of expected)same(vars.Cvar_VariableString(name),'1','late demo cleanup cannot undo explicit launch '+name);same(r_flashlight.value,0,'fresh-game flashlight remains under automatic corridor/run policy');
}));

const archived=['r_rockfield','r_powerups','r_heightshadows'];
function serialized(name){const line=vars.Cvar_WriteVariables().split('\n').find(line=>line.startsWith(name+' '));check(line,'actual archived serializer contains '+name);return line.slice(name.length+2,-1);}
Deno.test('temporary attract defaults preserve actual archived storage and serialized configuration while normal configuration save/load still roundtrips',()=>fixture(()=>{
 for(const name of archived){vars.Cvar_Set(name,'0');memory.set('quake_cvar_'+name,'0');same(serialized(name),'0','initial archived preference serialized');}
 cls.demoplayback=true;split.R_DemoSplitStart();split.R_DemoSplitStart();
 for(const name of archived){same(vars.Cvar_VariableString(name),'1','attract actually enables '+name);same(memory.get('quake_cvar_'+name),'0','temporary feature never overwrites immediate persisted value '+name);same(serialized(name),'0','before-unload/config serialization retains original disabled value '+name);}
 // Repeated temporary values retain the original base, never the previous
 // temporary effective value, even when a diagnostic changes its strength.
 vars.Cvar_SetTemporary('r_rockfield','0.5');same(serialized('r_rockfield'),'0','nested temporary change retains original base');same(memory.get('quake_cvar_r_rockfield'),'0','nested temporary change does not persist');vars.Cvar_SetTemporary('r_rockfield','1');split.R_DemoSplitEnd();
 for(const name of archived){same(vars.Cvar_VariableString(name),'0','normal stop restores disabled choice '+name);same(memory.get('quake_cvar_'+name),'0','normal stop retains persisted choice '+name);}
 const choices={r_rockfield:'0.375',r_powerups:'1',r_heightshadows:'0'};for(const[n,v]of Object.entries(choices))cmd.Cmd_ExecuteString(n+' '+v);const config=vars.Cvar_WriteVariables();for(const[n,v]of Object.entries(choices)){same(serialized(n),v,'ordinary explicit configuration value serializes '+n);same(memory.get('quake_cvar_'+n),v,'ordinary explicit configuration value persists '+n);vars.Cvar_Set(n,'0.9');}
 cmd.Cbuf_AddText(config);cmd.Cbuf_Execute();for(const[n,v]of Object.entries(choices)){same(vars.Cvar_VariableString(n),v,'real config command replay restores '+n);same(memory.get('quake_cvar_'+n),v,'replayed normal configuration persists '+n);}
 console.log('NEWER_DEMO_ARCHIVE_CUSTODY '+JSON.stringify({archived,persisted:Object.fromEntries(archived.map(n=>[n,memory.get('quake_cvar_'+n)]))}));
}));
Deno.test('explicit same-value enable and explicit disable during a demo outlast scope restoration for archived and nonarchived features',()=>fixture(()=>{
 cls.demoplayback=true;split.R_DemoSplitStart();same(vars.Cvar_VariableString('r_rockfield'),'1','rock temporarily enabled before explicit choice');
 for(const[n,v]of Object.entries({r_rockfield:'1',r_powerups:'0',r_newer_weapons:'1',r_newer_textures:'0',r_flashlight:'0'}))cmd.Cmd_ExecuteString(n+' '+v);
 same(memory.get('quake_cvar_r_rockfield'),'1','explicit same effective value commits archived choice');same(serialized('r_rockfield'),'1','explicit same-value choice replaces borrowed serialized base');same(memory.get('quake_cvar_r_powerups'),'0','explicit disabled choice persists immediately');same(serialized('r_heightshadows'),'0','untouched borrowed setting still serializes prior off');split.R_DemoSplitEnd();
 for(const[n,v]of Object.entries({r_rockfield:'1',r_powerups:'0',r_newer_weapons:'1',r_newer_textures:'0',r_flashlight:'0',r_heightshadows:'0'}))same(vars.Cvar_VariableString(n),v,'demo stop respects latest owner choice or untouched original '+n);
 same(memory.get('quake_cvar_r_rockfield'),'1','demo stop cannot overwrite explicit archived enable');same(serialized('r_rockfield'),'1','post-demo save retains explicit archived enable');
 // A subsequent demonstration borrows the newly committed base and restores it.
 split.R_DemoSplitStart();same(serialized('r_rockfield'),'1','next attract borrows latest committed value');split.R_DemoSplitEnd();same(vars.Cvar_VariableString('r_rockfield'),'1','next attract restores latest committed enable');
 cmd.Cmd_ExecuteString('r_rockfield 0');same(memory.get('quake_cvar_r_rockfield'),'0','ordinary non-demo disable still persists');same(serialized('r_rockfield'),'0','ordinary non-demo serializer is unchanged');
}));
