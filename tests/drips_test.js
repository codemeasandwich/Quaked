// Public drips/mote contracts. Synthetic point hull has ceiling128,floor0 and optional thin liquid3.1..3.5.
import * as THREE from 'three';
import * as motes from '../src/newer/render/r_motes.js';
import * as places from '../src/newer/render/r_ambientplaces.js';
import {r_drips,R_DripsSnapshot} from '../src/newer/render/r_drips.js';
import {FX_LiquidBelow,FX_LiquidAbove,FX_Contents,FX_Stop,FX_Seed} from '../src/newer/render/fx_world.js';
import {R_ImpactRipplesSetup,R_ImpactRippleReset,R_ImpactRippleCount,R_ImpactRippleFrame,R_AddImpactRipple} from '../src/newer/render/r_impactripples.js';
import {r_hdr} from '../src/newer/render/gl_post.js';
import {Cvar_RegisterVariable,Cvar_FindVar,Cvar_Set} from '../src/engine/common/cvar.js';
import {cl} from '../src/engine/client/client.js';
import {R_AnimSetClassicPass} from '../src/newer/mode.js';
import {CL_ParseStaticSound} from '../src/engine/client/cl_parse.js';
import {COM_SetNetMessage,MSG_BeginReading} from '../src/engine/common/common.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,m+': '+a+' != '+b);
for(const v of [r_hdr,r_drips])if(!Cvar_FindVar(v.name))Cvar_RegisterVariable(v);
const scene=new THREE.Scene();
function world(liquid=0){
 const levels=liquid?[128,3.5,3.1,0]:[128,0],planes=levels.map(dist=>({normal:[0,0,1],type:2,dist}));
 const clipnodes=liquid?[{planenum:0,children:[-2,1]},{planenum:1,children:[-1,2]},{planenum:2,children:[liquid,3]},{planenum:3,children:[-1,-2]}]:[{planenum:0,children:[-2,1]},{planenum:1,children:[-1,-2]}];
 return {hulls:[{planes,clipnodes,firstclipnode:0,lastclipnode:clipnodes.length-1}],entities:''};
}
function reset(liquid=0){Cvar_Set('r_hdr','1');Cvar_Set('r_drips','1');R_AnimSetClassicPass(false);cl.worldmodel=world(liquid);motes.R_MotesClear();places.R_AmbientPlacesClear();FX_Seed(17);R_ImpactRippleReset();R_ImpactRipplesSetup({contents:p=>FX_Contents(cl.worldmodel,p),portals:()=>[]});}
function frame(t){cl.time=t;return motes.R_MotesFrame(scene,t,[0,0,60]);}
Deno.test('existing point hull finds exact thin-liquid entry and exit',()=>{reset(-3);same(FX_Contents(cl.worldmodel,[0,0,3.3]),-3,'fixture liquid');const hit=FX_LiquidBelow(cl.worldmodel,[0,0,64],0);check(hit&&Math.abs(hit.z-3.5)<.001,'thin water surface not skipped');check(Math.abs(FX_LiquidAbove(cl.worldmodel,[0,0,3.3])-3.5)<.001,'thin water exit');check(FX_Stop(cl.worldmodel,[0,0,64],-128)>.0,'solid floor uses existing trace');});
Deno.test('public static-sound parser records drips independently of audio playback',()=>{reset();cl.sound_precache[1]={name:'ambience/drip1.wav'};const data=new Uint8Array(9),view=new DataView(data.buffer);view.setInt16(4,64*8,true);data[6]=1;data[7]=255;data[8]=64;COM_SetNetMessage({data,cursize:data.length,maxsize:data.length});MSG_BeginReading();CL_ParseStaticSound();same(places.R_AmbientPlaces('ambience/drip1.wav').length,1,'recorded');same(places.R_AmbientPlaces('ambience/drip1.wav')[0][2],64,'copied position');});
Deno.test('drips fall down the proven column, pause holds, and disabling retires them',()=>{reset();places.R_AmbientPlaced('ambience/drip1.wav',[0,0,64]);let found=false;for(let i=0;i<100;i++){frame(i*.05);const drop=motes.R_MotesSnapshot().motes.find(m=>m.kind==='drip');if(drop){same(drop.pos[0],0,'x stays on traced column');same(drop.pos[1],0,'y stays on traced column');found=true;break;}}check(found,'visible drop produced');const before=JSON.stringify(motes.R_MotesSnapshot().motes);frame(cl.time);same(JSON.stringify(motes.R_MotesSnapshot().motes),before,'pause no motion/birth');Cvar_Set('r_drips','0');frame(cl.time);same(motes.R_MotesSnapshot().count,0,'off retires active drip/splash');});
Deno.test('underwater sources do not invent ceiling drips; rewinds restart schedules',()=>{reset(-3);places.R_AmbientPlaced('ambience/drip1.wav',[0,0,3.3]);let underwaterDrops=0;for(let i=0;i<100;i++){frame(i*.05);underwaterDrops+=motes.R_MotesSnapshot().count;}same(underwaterDrops,0,'underwater source skipped throughout');reset();places.R_AmbientPlaced('ambience/drip1.wav',[0,0,64]);frame(100);frame(103);frame(1);let made=false;for(let i=1;i<100;i++){frame(1+i*.05);made ||= motes.R_MotesSnapshot().count>0;}check(made,'new drops soon after rewind');});
Deno.test('motes never overwrite live effects and new births have no pre-birth movement',()=>{reset();frame(0);for(let i=0;i<512;i++)motes.R_MoteSpawn(motes.MOTE_DRIP,i,0,100,0,0,0,0,{life:8});const extra=motes.R_MoteSpawn(motes.MOTE_SPARK,999,0,100,0,0,0,0,{owner:'drips'});same(extra,-1,'full owner budget rejects new live overwrite');frame(.01);check(!motes.R_MotesSnapshot().motes.some(m=>m.pos[0]===999),'prior live motes intact');motes.R_MotesClear();frame(2);motes.R_MoteSpawn(motes.MOTE_DRIP,0,0,100,0,0,-10,2.1);frame(2.1);same(motes.R_MotesSnapshot().motes[0].pos[2],100,'no movement before birth');});
Deno.test('one switch cannot clear another effect owner and Classic hides all new motes',()=>{reset();frame(0);motes.R_MoteSpawn(motes.MOTE_SPARK,0,0,100,0,0,0,.01,{owner:'sparks'});motes.R_MoteSpawn(motes.MOTE_DRIP,0,0,100,0,0,0,.01,{owner:'drips'});Cvar_Set('r_drips','0');frame(.01);same(motes.R_MotesSnapshot().count,1,'only other owner remains');same(motes.R_MotesSnapshot().motes[0].kind,'spark','spark preserved');Cvar_Set('r_hdr','0');frame(.02);same(motes.R_MotesSnapshot().count,0,'Classic empty');check(!motes.R_MotesSnapshot().visible,'Classic layer hidden');});

Deno.test('thin water landings reuse the ripple detector; existing impact events keep priority',()=>{
 reset(-3);places.R_AmbientPlaced('ambience/drip1.wav',[0,0,64]);let seen=false;
 for(let i=0;i<120;i++){frame(i*.05);seen ||= R_ImpactRippleCount()>0;R_ImpactRippleFrame(i*.05);}
 check(seen,'visible drip makes the existing water ripple even on a thin liquid brush');
 reset(-3);R_AddImpactRipple(0,200,0,3.5,1,0);
 places.R_AmbientPlaced('ambience/drip1.wav',[0,0,64]);for(let i=0;i<120;i++)frame(i*.05);
 same(R_ImpactRippleCount(),1,'even one existing impact prevents drip admission');
});
Deno.test('ambient registry is bounded and rejects nonfinite positions',()=>{
 reset();places.R_AmbientPlaced('ambience/drip1.wav',[NaN,0,0]);same(places.R_AmbientPlaces('ambience/drip1.wav').length,0,'invalid coordinate ignored');
 for(let i=0;i<1200;i++)places.R_AmbientPlaced('sound'+i,[i,0,0]);
 same(places.R_AmbientPlaces('sound1024').length,0,'global source cap');
 places.R_AmbientPlacesClear();same(places.R_AmbientPlaces('sound0').length,0,'new map clears');
});
