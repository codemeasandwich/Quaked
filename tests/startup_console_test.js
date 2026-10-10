// Real native console canvas and public SCR_UpdateScreen, with a recording world
// draw endpoint. The coordinator still requires three actual-ready snapshots.
import {readFileSync} from 'node:fs';
import * as boot from '../src/r_demoloading.js';
import * as screen from '../src/engine/render/gl_screen.js';
import * as draw from '../src/engine/render/gl_draw.js';
import * as consoleUI from '../src/engine/common/console.js';
import * as vars from '../src/engine/common/cvar.js';
import * as host from '../src/engine/server/host.js';
import * as state from '../src/engine/client/client.js';
import * as client from '../src/engine/client/cl_main.js';
import * as keys from '../src/engine/client/keys.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as common from '../src/engine/common/common.js';
import * as pak from '../src/engine/common/pak.js';
import * as vid from '../src/engine/render/vid.js';
import * as wad from '../src/engine/common/wad.js';
import {r_hdr} from '../src/gl_post.js';
const check=(v,m)=>{if(!v)throw Error(m);},near=(a,b,m)=>check(Math.abs(a-b)<1e-8,`${m}: ${a} != ${b}`);
Deno.test('automatic startup console holds every pending frame, retracts within200ms only after readiness and preserves ordinary/user console preference',async()=>{
 const canvas=await import(process.env.QUAKED_CANVAS_MODULE||'/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js'),oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');let rendered=0;
 globalThis.window={devicePixelRatio:1,innerWidth:640,innerHeight:400};globalThis.document={createElement:()=>canvas.createCanvas(1,1)};
 try{
  const binary=readFileSync(new URL('../pak0.pak',import.meta.url));pak.COM_AddPack(pak.COM_LoadPackFile('console-speed-native',binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.length)));vid.VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);const w=pak.COM_FindFile('gfx.wad').data;wad.W_LoadWadFile(w.buffer.slice(w.byteOffset,w.byteOffset+w.length));cmd.Cbuf_Init();cmd.Cmd_Init();client.CL_Init();
  const overlay=canvas.createCanvas(640,400);draw.Draw_SetExternals({vid:{width:640,height:400},host_basepal:pak.COM_FindFile('gfx/palette.lmp').data});draw.Draw_Init(overlay);consoleUI.Con_SetExternals({cls:state.cls,getRealtime:()=>100,Draw_Character:draw.Draw_Character,Draw_ConsoleBackground:draw.Draw_ConsoleBackground});consoleUI.Con_Init();common.Con_SetPrintFunctions(consoleUI.Con_Printf,()=>{});screen.SCR_SetExternals({cls:state.cls,cl:state.cl,vid:{width:640,height:400,recalc_refdef:true},V_RenderView:()=>rendered++,V_UpdatePalette:()=>{}});screen.SCR_Init();if(!vars.Cvar_FindVar(r_hdr.name))vars.Cvar_RegisterVariable(r_hdr);vars.Cvar_SetValue('r_hdr',1);vars.Cvar_SetValue('scr_conspeed',120);state.cls.state=state.ca_connected;state.cls.signon=4;state.cl.worldmodel={name:'maps/console-speed-public.bsp'};keys.set_key_dest(keys.key_game);host.set_host_frametime(.02);
  const snapshot={world:state.cl.worldmodel.name,signon:4,rendered:true,pending:[],fallbacks:[]};
  async function arm(){boot.R_DemoLoadingBoot();boot.R_DemoLoadingAttract(true);boot.R_DemoLoadingAppReady();boot.R_DemoLoadingConsoleDrawn();boot.R_DemoLoadingSplash(()=>Promise.resolve());await new Promise(r=>setTimeout(r,0));screen.SCR_UpdateScreen();return screen.scr_con_current;}
  const full=await arm();check(full>0&&rendered>0,'actual native console and hidden world frame drawn');near(full,draw.Draw_GetVirtualHeight(),'full native console height');const pixel=overlay.getContext('2d').getImageData(320,200,1,1).data;check(pixel[3]===255,'actual console remains opaque');
  for(let i=0;i<30;i++){keys.set_key_dest(i%2?keys.key_console:keys.key_game);boot.R_DemoLoadingFrame({...snapshot,pending:['GPU asset upload']});screen.SCR_UpdateScreen();near(screen.scr_con_current,full,'pending work cannot retract even beyond200ms');}
  keys.set_key_dest(keys.key_game);for(let i=0;i<2;i++){boot.R_DemoLoadingFrame(snapshot);screen.SCR_UpdateScreen();near(screen.scr_con_current,full,'fewer than three completed ready frames still hold');}boot.R_DemoLoadingFrame(snapshot);check(boot.R_DemoLoadingStatus().phase==='rolling','real stable-frame gate admits retraction');
  keys.set_key_dest(keys.key_console);screen.SCR_UpdateScreen();near(screen.scr_con_current,full-120*.02,'user-opened console keeps its native preferred speed during startup roll');near(vars.Cvar_VariableValue('scr_conspeed'),120,'startup never rewrites user speed');check(boot.R_DemoLoadingStatus().phase==='done','opening console during roll relinquishes automatic ownership permanently');keys.set_key_dest(keys.key_game);screen.SCR_UpdateScreen();near(screen.scr_con_current,0,'later manual close follows existing Newer console handling without resumed automatic roll');check(boot.R_DemoLoadingStatus().phase==='done','manual close cannot resurrect startup ownership');
  boot.R_DemoLoadingCancel();keys.set_key_dest(keys.key_game);await arm();for(let i=0;i<3;i++)boot.R_DemoLoadingFrame(snapshot);let frames=0;while(boot.R_DemoLoadingStatus().phase==='rolling'&&frames<20){screen.SCR_UpdateScreen();frames++;if(frames===1)check(screen.scr_con_current>0&&screen.scr_con_current<full,'automatic retraction animates, never instant hidden gate');}check(frames<=10&&frames>1,'full automatic console retracts in at most200ms at20ms frame step');near(screen.scr_con_current,0,'automatic console closes completely');check(boot.R_DemoLoadingStatus().phase==='done','only actual console closure ends automatic scope');near(vars.Cvar_VariableValue('scr_conspeed'),120,'automatic speed does not persist to preferences');
  vars.Cvar_SetValue('r_hdr',0);keys.set_key_dest(keys.key_console);screen.SCR_UpdateScreen();near(screen.scr_con_current,120*.02,'ordinary Classic console opens at unchanged user preference');keys.set_key_dest(keys.key_game);screen.SCR_UpdateScreen();near(screen.scr_con_current,0,'ordinary console closes by the same native step');near(boot.R_DemoLoadingConsoleSpeed(10000,full),10000,'faster existing user speed remains faster');console.log('STARTUP_CONSOLE_SPEED '+JSON.stringify({height:full,automaticFrames:frames,frameSeconds:.02,retractionSeconds:frames*.02,userSpeed:vars.Cvar_VariableValue('scr_conspeed'),worldDraws:rendered}));
 }finally{boot.R_DemoLoadingCancel();if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete globalThis.window;if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete globalThis.document;}
});
