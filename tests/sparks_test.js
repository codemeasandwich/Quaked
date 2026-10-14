// Fixture sparks use the same public renderer and static-sound registry; other effect owners remain identical.
import * as THREE from 'three';
import * as motes from '../src/newer/render/r_motes.js';
import * as fx from '../src/newer/render/fx_world.js';
import {R_AmbientPlaced,R_AmbientPlacesClear} from '../src/newer/render/r_ambientplaces.js';
import {r_sparks} from '../src/newer/render/r_sparks.js';
import {r_drips} from '../src/newer/render/r_drips.js';
import {r_hdr} from '../src/newer/render/gl_post.js';
import {Cvar_RegisterVariable,Cvar_FindVar,Cvar_Set} from '../src/engine/common/cvar.js';
import {cl} from '../src/engine/client/client.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,m+(typeof a==='string'&&a.length>100?'':': '+a+' != '+b));
for(const v of [r_hdr,r_sparks,r_drips])if(!Cvar_FindVar(v.name))Cvar_RegisterVariable(v);
const scene=new THREE.Scene();
function model(kind='open'){
 const plane=(axis,dist)=>({normal:[+(axis===0),+(axis===1),+(axis===2)],type:axis,dist});
 let planes=[plane(2,128),plane(2,0)],clipnodes=[{planenum:0,children:[-2,1]},{planenum:1,children:[-1,-2]}];
 if(kind==='wall'){planes.push(plane(0,1),plane(0,0));clipnodes[1].children[0]=2;clipnodes.push({planenum:2,children:[-1,3]},{planenum:3,children:[-2,-1]});}
 if(kind==='ledge'){planes=[plane(0,0),plane(2,0),plane(2,-100)];clipnodes=[{planenum:0,children:[2,1]},{planenum:1,children:[-1,-2]},{planenum:2,children:[-1,-2]}];}
 return{hulls:[{planes,clipnodes,firstclipnode:0,lastclipnode:clipnodes.length-1}],entities:''};
}
function reset(kind='open'){Cvar_Set('r_hdr','1');Cvar_Set('r_drips','1');Cvar_Set('r_sparks','1');cl.worldmodel=model(kind);motes.R_MotesClear();R_AmbientPlacesClear();fx.FX_Seed(31);}
const frame=t=>{cl.time=t;return motes.R_MotesFrame(scene,t,[0,0,64],480);};
Deno.test('spark motion traces existing hull solids including a thin wall between empty endpoints',()=>{reset('wall');check(typeof fx.FX_Blocked==='function','bounded existing-hull trace exported');check(fx.FX_Blocked(cl.worldmodel,[-10,0,64],[10,0,64]),'thin wall');check(!fx.FX_Blocked(cl.worldmodel,[-10,0,64],[-5,0,70]),'free segment');check(fx.FX_Blocked(cl.worldmodel,[-10,0,64],[-10,0,-2]),'floor');check(fx.FX_Blocked(cl.worldmodel,[-10,0,64],[-10,0,132]),'ceiling');check(fx.FX_Blocked(cl.worldmodel,[.5,0,64],[10,0,64]),'start solid');check(fx.FX_Blocked(null,[0,0,0],[1,0,0]),'missing world conservative');});
Deno.test('sparks retire at real walls but continue over a ledge without a cached floor plane',()=>{reset('wall');frame(0);motes.R_MoteSpawn(motes.MOTE_SPARK,-10,0,64,400,0,0,0,{owner:'sparks',life:1});frame(.1);same(motes.R_MotesSnapshot().count,0,'wall stops spark');reset('ledge');frame(0);motes.R_MoteSpawn(motes.MOTE_SPARK,-1,0,10,400,0,-240,0,{owner:'sparks',life:1});frame(.05);const live=motes.R_MotesSnapshot().motes;check(live.length===1&&live[0].pos[0]>0&&live[0].pos[2]<0,'crossed ledge and old source floor');});
Deno.test('fixture collision never runs for another owner using the same particle kind',()=>{reset('wall');frame(0);motes.R_MoteSpawn(motes.MOTE_SPARK,-10,0,64,400,0,0,0,{owner:'drips',life:1});frame(.1);same(motes.R_MotesSnapshot().count,1,'other owner not retired by fixture collision');});
Deno.test('buzz sources emit bounded sparks and paused-off immediately removes them',()=>{reset();R_AmbientPlaced('ambience/buzz1.wav',[0,0,64]);let found=false;for(let i=0;i<200;i++){frame(i*.05);if(motes.R_MotesSnapshot().motes.some(m=>m.kind==='spark')){found=true;break;}}check(found,'burst emitted');check(motes.R_MotesSnapshot().count<=128,'bounded reservation');Cvar_Set('r_sparks','0');frame(cl.time);same(motes.R_MotesSnapshot().count,0,'paused off retires sparks');});
Deno.test('enabling sparks leaves the accepted seeded drip trajectory and schedule unchanged',()=>{const run=enabled=>{reset();Cvar_Set('r_sparks',enabled?'1':'0');R_AmbientPlaced('ambience/drip1.wav',[0,0,64]);R_AmbientPlaced('ambience/buzz1.wav',[50,0,64]);const samples=[];for(let i=0;i<150;i++){frame(i*.05);samples.push(motes.R_MotesSnapshot().motes.filter(m=>m.kind==='drip'||m.kind==='splash'));}return JSON.stringify(samples);};same(run(true),run(false),'drip snapshots on/off');});
// (independent review, 14 Oct: the checks below pin the timing, reach, placement and per-frame work, so a version that
// sparked every frame, from anywhere, or inside walls could not pass)
import {R_SparksSnapshot} from '../src/newer/render/r_sparks.js';
const sparks=()=>motes.R_MotesSnapshot().motes.filter(m=>m.kind==='spark').length;
Deno.test('one light bursts every 1.5 to 6 seconds: a handful of bursts in 30 s, each of 4 to 9 sparks',()=>{reset();R_AmbientPlaced('ambience/buzz1.wav',[0,0,64]);let bursts=0,before=0,most=0;for(let i=0;i<30*20;i++){frame(i*.05);const now=sparks();if(now>0&&before===0)bursts++;most=Math.max(most,now);before=now;}check(bursts>=5&&bursts<=20,'bursts in 30 s: '+bursts);check(most>=4&&most<=9,'sparks at once: '+most);});
Deno.test('a light beyond 900 units of the view, or set inside a wall, never sparks',()=>{reset();R_AmbientPlaced('ambience/buzz1.wav',[1000,0,64]);for(let i=0;i<20*20;i++)frame(i*.05);same(sparks(),0,'far light');reset();R_AmbientPlaced('ambience/buzz1.wav',[0,0,200]);let any=0;for(let i=0;i<20*20;i++){frame(i*.05);any+=sparks();}same(any,0,'light in solid');same(R_SparksSnapshot()[0].valid,false,'and it is known to be in a wall');});
Deno.test('at most eight new lights are checked in one frame; the rest wait for the next',()=>{reset();for(let i=0;i<12;i++)R_AmbientPlaced('ambience/buzz1.wav',[i*8-48,0,64]);frame(0);frame(10);same(R_SparksSnapshot().filter(s=>s.valid!==undefined).length,8,'eight checked');frame(10.05);same(R_SparksSnapshot().filter(s=>s.valid!==undefined).length,12,'the other four the next frame');});
Deno.test('switched off and on again, the lights do not all burst in the same frame',()=>{reset();for(let i=0;i<12;i++)R_AmbientPlaced('ambience/buzz1.wav',[i*8-48,0,64]);for(let i=0;i<40;i++)frame(i*.05);Cvar_Set('r_sparks','0');for(let i=40;i<200;i++)frame(i*.05);Cvar_Set('r_sparks','1');frame(10);const now=sparks();check(now<=27,'sparks in the first frame after switching on (12 lights would give 48 or more): '+now);});
