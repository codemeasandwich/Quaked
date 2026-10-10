// Player/held-weapon surface state is separate from temporary lens droplets.
// No age-based blood loss, texture edits, or shared pickup-material mutation.
import { cl, cls } from './engine/client/client.js';
import * as THREE from 'three';
export const SURFACE_SPLATS = 12, SURFACE_DRY_SECONDS = 4;
export class WeaponSurfaceState {
 constructor(){this.spots=Array.from({length:SURFACE_SPLATS},()=>new THREE.Vector4(0,0,0,0));this.blood=0;this.wet=0;this.inWater=false;this.last=null;this.serial=0;}
 add(amount,uv=null){if(!Number.isFinite(amount)||amount<=0)return false;amount=Math.min(1,amount);this.blood=Math.min(1,this.blood+amount);let seed=++this.serial;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};for(let j=0;j<3;j++){const slot=this.spots.find(s=>s.w===0);if(slot){const x=uv?Math.max(0,Math.min(1,uv[0]+(j?(random()-.5)*.08:0))):.05+.9*random(),y=uv?Math.max(0,Math.min(1,uv[1]+(j?(random()-.5)*.08:0))):.05+.9*random();slot.set(x,y,.055+.095*random(),Math.min(.9,.2+amount));}else for(const s of this.spots){s.w=Math.min(1,s.w+amount/8);s.z=Math.min(.22,s.z+amount*.003);}}return true;}
 frame(time,contents,paused=false){const dt=paused?0:this.last===null||time<this.last?0:Math.max(0,time-this.last);this.last=time;const water=contents===-3;this.wet=Math.max(0,this.wet-dt/SURFACE_DRY_SECONDS);if(water){this.blood=0;this.wet=0;for(const s of this.spots)s.set(0,0,0,0);}else if(this.inWater)this.wet=1;this.inWater=water;return this;}
 // a weapon not in hand: its wet film runs down with time, it is never washed or soaked, and it cannot carry a stale water exit
 dry(time,paused=false){const dt=paused?0:this.last===null||time<this.last?0:Math.max(0,time-this.last);this.last=time;this.wet=Math.max(0,this.wet-dt/SURFACE_DRY_SECONDS);this.inWater=false;return this;}
 snapshot(){return{version:1,blood:this.blood,wet:this.wet,inWater:this.inWater,serial:this.serial,spots:this.spots.map(s=>s.toArray())};}
 restore(data,time){if(data?.version!==1||!Array.isArray(data.spots)||data.spots.length!==SURFACE_SPLATS||!data.spots.every(s=>Array.isArray(s)&&s.length===4&&s.every(Number.isFinite)&&s[0]>=0&&s[0]<=1&&s[1]>=0&&s[1]<=1&&s[2]>=0&&s[2]<=.22&&s[3]>=0&&s[3]<=1)||![data.blood,data.wet].every(v=>Number.isFinite(v)&&v>=0&&v<=1))return false;data.spots.forEach((s,i)=>this.spots[i].fromArray(s));this.blood=data.blood;this.wet=data.wet;this.inWater=data.inWater===true;this.serial=Number.isSafeInteger(data.serial)&&data.serial>=0?data.serial:0;this.last=time;return true;}
}
// Blood and wetness belong to the weapon they landed on (card [16], docs/held-weapon-blood-2026-10-09.md).
// A bank holds one WeaponSurfaceState per weapon, keyed by the name of the weapon model drawn in the most recent
// frame (cl.viewent.model, which V_CalcRefdef sets from STAT_WEAPON every frame and clears at intermission; the
// precache entry is empty when the player is dead or before the first clientdata). So:
//  * a blood event goes to the weapon the player was last shown holding, whose posed mesh also places the spot
//    (the contact callback reads that mesh). Everything parsed between two renders (damage, a new weapon stat,
//    particles, however many messages) therefore goes to the same weapon, the one drawn in the previous render;
//  * with no weapon drawn (dead, intermission, loading) no weapon gets blood, and none is washed or soaked;
//  * the weapon in hand is washed and soaked by water as before; every other weapon only dries (dry()), by the
//    game time that passes, so it is dry when taken up again and is never soaked by an exit it was not there for.
// The player's own body (drawn by the chase camera) keeps one coating of its own, `body`, that receives every
// player blood event and is washed with the player, as the single shared coating did before.
// The bank answers the WeaponSurfaceState API for the weapon drawn (or a blank state when none is), so callers
// that mean "the held weapon's coating" are unchanged; saves carry the body and every weapon (snapshotAll).
export const weaponKey=()=>{const name=cl?.viewent?.model?.name;return typeof name==='string'&&name!==''?name:null;};
const KEY=/^[\w./-]{1,64}$/, MAX_WEAPONS=64;
const clean=s=>s.blood===0&&s.wet===0&&s.spots.every(v=>v.w===0);
export class WeaponSurfaceBank {
 constructor(){this.states=new Map();this.none=new WeaponSurfaceState();this.body=new WeaponSurfaceState();this.legacy=null;}
 // The state of weapon `key` (the drawn weapon by default). A coating from an old one-coating save is adopted by the
 // first weapon a renderer frame or blood event sees after the load (`adopt`), never by a stray read during loading.
 state(key=weaponKey(),adopt=false){if(key===null)return this.none;if(adopt&&this.legacy){this.states.set(key,this.legacy);this.legacy=null;}let s=this.states.get(key);if(!s){s=new WeaponSurfaceState();this.states.set(key,s);}return s;}
 get spots(){return this.state().spots;} get blood(){return this.state().blood;} get wet(){return this.state().wet;} get inWater(){return this.state().inWater;} get serial(){return this.state().serial;}
 get last(){return this.state().last;} set last(time){for(const s of [this.none,this.body,this.legacy,...this.states.values()])if(s)s.last=time;}
 // with no weapon drawn these read the blank `none` state and never write it, so it stays blank for the shader
 add(amount,uv){const s=this.state();return s!==this.none&&s.add(amount,uv);}
 frame(time,contents,paused){const s=this.state();return s===this.none?s:s.frame(time,contents,paused);}
 snapshot(){return this.state().snapshot();}
 restore(data,time){const s=this.state();return s!==this.none&&s.restore(data,time);}
 // one renderer frame: the body and the drawn weapon see the water; every other weapon dries
 frameAll(time,contents,paused=false){const key=weaponKey();this.body.frame(time,contents,paused);if(key!==null)this.state(key,true);for(const [k,s] of this.states)if(k===key)s.frame(time,contents,paused);else s.dry(time,paused);}
 // one blood event: the body always, the drawn weapon when there is one
 bleed(amount,uv){const key=weaponKey(),body=this.body.add(amount,null); // `uv` is on the gun's skin: the body gets deterministic random placement
 return key===null?body:this.state(key,true).add(amount,uv);}
 // The writer keeps only what the reader accepts (KEY, at most MAX_WEAPONS), so the game never writes a save it would reject.
 snapshotAll(){const weapons={};let n=0;const put=(key,s)=>{if(n<MAX_WEAPONS&&!clean(s)){weapons[key]=s.snapshot();n++;}};if(this.legacy)put('(legacy)',this.legacy);for(const [key,s] of this.states)if(KEY.test(key))put(key,s);return{version:2,body:this.body.snapshot(),weapons};}
 // Version 2 replaces the body and every weapon, all or nothing. A version 1 save (from before weapons had their own
 // coatings) becomes the body's coating and the coating of the first weapon drawn after the load; other weapons start clean.
 restoreAll(data,time){
  if(data?.version===1){const s=new WeaponSurfaceState(),b=new WeaponSurfaceState();if(!s.restore(data,time)||!b.restore(data,time))return false;this.states=new Map();this.legacy=s;this.body=b;return true;}
  if(data?.version!==2||data.weapons===null||typeof data.weapons!=='object'||Array.isArray(data.weapons))return false;
  const entries=Object.entries(data.weapons),body=new WeaponSurfaceState(),next=new Map();let legacy=null;
  if(entries.length>MAX_WEAPONS||!body.restore(data.body,time))return false;
  for(const [key,snap] of entries){const s=new WeaponSurfaceState();if(!s.restore(snap,time))return false;if(key==='(legacy)')legacy=s;else if(KEY.test(key))next.set(key,s);else return false;}
  this.states=next;this.legacy=legacy;this.body=body;return true;
 }
}
export const weaponSurface = new WeaponSurfaceBank();
const demoSurface = new WeaponSurfaceBank();
const activeBank=()=>cls.demoplayback?demoSurface:weaponSurface;
export const R_ActiveWeaponSurface=()=>activeBank().state();
export const R_PlayerBodySurface=()=>activeBank().body;
let context={enabled:false,eye:null,visible:null,contact:null};
export function R_WeaponSurfaceContext(enabled,eye,visible,contact=null){context.enabled=enabled===true;context.eye=eye;context.visible=visible;context.contact=contact;}
export function R_WeaponSurfaceFrame(time,contents,paused=false){activeBank().frameAll(time,contents,paused);}
export function R_PlayerSurfaceBlood(amount){return context.enabled&&activeBank().bleed(Math.min(.65,Math.max(0,amount)/55),context.contact?.(context.eye));}
export function R_WeaponSurfaceBloodAt(point,count){if(!context.enabled||!context.eye||!point?.every(Number.isFinite)||!Number.isFinite(count)||count<=0)return false;const distance=Math.hypot(...point.map((p,i)=>p-context.eye[i]));if(distance>72||!context.visible||!context.visible(point,context.eye))return false;return activeBank().bleed((1-distance/72)*Math.min(.6,count/70),context.contact?.(point));}
export const ACTOR_COAT_GLSL=`
uniform float uActorCoatOn;
uniform vec4 uActorBloodSpots[${SURFACE_SPLATS}];
float actorBloodMask(vec2 uv){if(uActorCoatOn<.5)return 0.;float mask=0.;for(int i=0;i<${SURFACE_SPLATS};i++){vec4 s=uActorBloodSpots[i];if(s.w<=0.)continue;vec2 p=(uv-s.xy)/max(s.z,.001);float edge=length(p)*(1.+.13*sin(p.x*17.+p.y*11.)+.08*cos(p.y*23.));mask+=s.w*(1.-smoothstep(.35,1.,edge));}return clamp(mask,0.,.93)*uActorCoatOn;}
`;
export const ACTOR_COAT_MAP_GLSL=`
 float actorBlood=actorBloodMask(vMapUv);
 diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.16,.005,.008),diffuseColor.rgb*vec3(.38,.04,.055),.35),actorBlood);
`;
