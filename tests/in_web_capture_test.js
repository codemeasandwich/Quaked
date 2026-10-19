// Independent input proof through registered DOM listeners, public capture APIs,
// real command/buttons and real player angles. The DOM endpoint models async
// pointer-lock delivery; it does not set private platform state or launch a game.
import assert from 'node:assert/strict';
import * as input from '../src/platform/in_web.js';
import * as keys from '../src/engine/client/keys.js';
import * as commands from '../src/engine/common/cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import * as buttons from '../src/engine/client/cl_input.js';
import {cl,cls,ca_connected} from '../src/engine/client/client.js';
import {sensitivity,m_pitch,m_yaw,m_forward,m_side,lookstrafe} from '../src/engine/client/cl_main.js';

class Endpoint {
 constructor(){this.listeners=new Map();}
 addEventListener(type,fn){let list=this.listeners.get(type);if(!list)this.listeners.set(type,list=new Set());list.add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type,event={}){for(const fn of [...(this.listeners.get(type)||[])])fn({preventDefault(){},...event});}
}
async function fixture(run){
 const globals=Object.fromEntries(['document','window','navigator'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const old={angles:Array.from(cl.viewangles),state:cls.state,demo:cls.demoplayback,dest:keys.key_dest,mlook:buttons.in_mlook.state,mlookDown:[...buttons.in_mlook.down],strafe:buttons.in_strafe.state,strafeDown:[...buttons.in_strafe.down]};
 const values=[sensitivity,m_pitch,m_yaw,m_forward,m_side,lookstrafe].map(v=>({v,string:v.string,value:v.value}));
 const doc=new Endpoint(),body=new Endpoint(),win=new Endpoint();doc.body=body;doc.pointerLockElement=null;doc.hidden=false;
 let requests=0,exits=0,refuse=false;
 body.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});
 body.requestPointerLock=()=>{requests++;return refuse?Promise.reject(new Error('controlled capture refusal')):Promise.resolve();};
 doc.exitPointerLock=()=>{exits++;doc.pointerLockElement=null;queueMicrotask(()=>doc.emit('pointerlockchange'));};
 const grant=()=>{doc.pointerLockElement=body;doc.emit('pointerlockchange');};
 const click=()=>body.emit('mousedown',{button:0});
 const move=(x,y)=>body.emit('mousemove',{movementX:x,movementY:y});
 const cmd=()=>({forwardmove:0,sidemove:0,upmove:0});
 try{
  Object.defineProperty(globalThis,'document',{configurable:true,value:doc});Object.defineProperty(globalThis,'window',{configurable:true,value:win});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'desktop-input-public-fixture',maxTouchPoints:0,getGamepads:()=>[]}});
  commands.Cbuf_Init();if(!commands.Cmd_Exists('+mlook'))buttons.CL_InitInput();
  for(const {v}of values)if(!vars.Cvar_FindVar(v.name))vars.Cvar_RegisterVariable(v);
  sensitivity.value=3;m_pitch.value=m_yaw.value=.022;m_forward.value=1;m_side.value=.8;lookstrafe.value=0;
  buttons.in_mlook.state=1;buttons.in_strafe.state=0;buttons.in_strafe.down[0]=buttons.in_strafe.down[1]=0;
  cls.state=ca_connected;cls.demoplayback=false;keys.set_key_dest(keys.key_game);cl.viewangles.fill(0);
  input.IN_Init(body);
  await run({doc,body,grant,click,move,cmd,requests:()=>requests,exits:()=>exits,refuse(value){refuse=value;}});
 }finally{
  // Deliver a real unlock while the live listener still exists; isolate suites
  // without writing private capture flags, including on the expected RED case.
  keys.set_key_dest(keys.key_console);body.emit('mouseup',{button:0});doc.pointerLockElement=null;doc.emit('pointerlockchange');input.IN_Shutdown();await Promise.resolve();
  for(const {v,string,value}of values){v.string=string;v.value=value;}
  cl.viewangles.set(old.angles);cls.state=old.state;cls.demoplayback=old.demo;keys.set_key_dest(old.dest);
  buttons.in_mlook.state=old.mlook;buttons.in_mlook.down.set(old.mlookDown);buttons.in_strafe.state=old.strafe;buttons.in_strafe.down.set(old.strafeDown);
  for(const [key,descriptor]of Object.entries(globals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
}

Deno.test('public body capture admits both mouse axes into real player angles only after a lock grant',async()=>fixture(async f=>{
 f.move(17,-9);input.IN_Move(f.cmd());assert.deepEqual(Array.from(cl.viewangles),[0,0,0],'uncaptured movement cannot turn player');
 f.click();assert.equal(f.requests(),1,'in-game gesture asks platform for capture');f.grant();assert.equal(input.IN_IsPointerLocked(),true);
 f.move(17,-9);const c=f.cmd();input.IN_Move(c);assert.ok(Math.abs(cl.viewangles[1]+17*3*.022)<1e-6,'horizontal event reaches yaw');assert.ok(Math.abs(cl.viewangles[0]-(-9*3*.022))<1e-6,'vertical event reaches pitch');
 assert.equal(c.forwardmove,0);assert.equal(c.sidemove,0);const angles=Array.from(cl.viewangles);input.IN_Move(f.cmd());assert.deepEqual(Array.from(cl.viewangles),angles,'deltas consumed once');
}));

Deno.test('a refused public lock request remains inactive and another real gesture can retry',async()=>fixture(async f=>{
 f.refuse(true);f.click();await Promise.resolve();f.move(8,5);input.IN_Move(f.cmd());assert.deepEqual(Array.from(cl.viewangles),[0,0,0]);assert.equal(input.IN_IsPointerLocked(),false);
 f.refuse(false);f.click();assert.equal(f.requests(),2,'refusal does not suppress next gesture');f.grant();f.move(8,5);input.IN_Move(f.cmd());assert.notEqual(cl.viewangles[1],0);assert.notEqual(cl.viewangles[0],0);
}));

Deno.test('shutdown while captured then async unlock and reinitialization can acquire capture and aim again',async()=>fixture(async f=>{
 f.click();f.grant();f.move(4,3);input.IN_Move(f.cmd());assert.notEqual(cl.viewangles[1],0,'first session actually aims');
 input.IN_Shutdown();await Promise.resolve();assert.equal(f.exits(),1,'shutdown asks browser to release first lock');assert.equal(f.doc.pointerLockElement,null);
 input.IN_Init(f.body);cl.viewangles.fill(0);const before=f.requests();f.click();
 console.log('PUBLIC_MOUSE_RESTART '+JSON.stringify({actualElementLocked:f.doc.pointerLockElement===f.body,reportedLocked:input.IN_IsPointerLocked(),requestsBefore:before,requestsAfter:f.requests()}));
 assert.equal(f.requests(),before+1,'fresh session must not suppress capture with a stale previous lock');f.grant();f.move(13,-7);input.IN_Move(f.cmd());assert.notEqual(cl.viewangles[1],0,'restarted horizontal aim');assert.notEqual(cl.viewangles[0],0,'restarted vertical aim');
}));

Deno.test('default mouse look survives a bound middle-button cycle while explicit -mlook still disables vertical aiming',async()=>fixture(async f=>{
 const binding=keys.keybindings[keys.K_MOUSE3];
 try{
  // Exercise the actual default initializer, not a fabricated hold slot.
  buttons.CL_InitInput();keys.Key_SetBinding(keys.K_MOUSE3,'+mlook');f.click();f.grant();
  keys.Key_Event(keys.K_MOUSE3,true);commands.Cbuf_Execute();keys.Key_Event(keys.K_MOUSE3,false);commands.Cbuf_Execute();
  cl.viewangles.fill(0);f.move(12,-8);const look=f.cmd();input.IN_Move(look);
  assert.notEqual(cl.viewangles[1],0,'middle-button release preserves horizontal look');assert.notEqual(cl.viewangles[0],0,'middle-button release preserves default vertical look');assert.equal(look.forwardmove,0,'vertical input remains aiming');assert.equal(look.sidemove,0);
  commands.Cbuf_AddText('-mlook\n');commands.Cbuf_Execute();cl.viewangles.fill(0);f.move(9,7);const legacy=f.cmd();input.IN_Move(legacy);
  assert.notEqual(cl.viewangles[1],0,'explicit -mlook retains native horizontal turning');assert.equal(cl.viewangles[0],0,'explicit -mlook is respected');assert.notEqual(legacy.forwardmove,0,'explicit legacy mode routes vertical input to movement');
 }finally{keys.Key_SetBinding(keys.K_MOUSE3,binding||'');}
}));
