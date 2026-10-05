// Player/held-weapon surface state is separate from temporary lens droplets.
// No age-based blood loss, texture edits, or shared pickup-material mutation.
import { cls } from './client.js';
import * as THREE from 'three';
export const SURFACE_SPLATS = 12, SURFACE_DRY_SECONDS = 4;
export class WeaponSurfaceState {
 constructor(){this.spots=Array.from({length:SURFACE_SPLATS},()=>new THREE.Vector4(0,0,0,0));this.blood=0;this.wet=0;this.inWater=false;this.last=null;this.serial=0;}
 add(amount,uv=null){if(!Number.isFinite(amount)||amount<=0)return false;amount=Math.min(1,amount);this.blood=Math.min(1,this.blood+amount);let seed=++this.serial;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};for(let j=0;j<3;j++){const slot=this.spots.find(s=>s.w===0);if(slot){const x=uv?Math.max(0,Math.min(1,uv[0]+(j?(random()-.5)*.08:0))):.05+.9*random(),y=uv?Math.max(0,Math.min(1,uv[1]+(j?(random()-.5)*.08:0))):.05+.9*random();slot.set(x,y,.055+.095*random(),Math.min(.9,.2+amount));}else for(const s of this.spots){s.w=Math.min(1,s.w+amount/8);s.z=Math.min(.22,s.z+amount*.003);}}return true;}
 frame(time,contents,paused=false){const dt=paused?0:this.last===null||time<this.last?0:Math.max(0,time-this.last);this.last=time;const water=contents===-3;this.wet=Math.max(0,this.wet-dt/SURFACE_DRY_SECONDS);if(water){this.blood=0;this.wet=0;for(const s of this.spots)s.set(0,0,0,0);}else if(this.inWater)this.wet=1;this.inWater=water;return this;}
 snapshot(){return{version:1,blood:this.blood,wet:this.wet,inWater:this.inWater,serial:this.serial,spots:this.spots.map(s=>s.toArray())};}
 restore(data,time){if(data?.version!==1||!Array.isArray(data.spots)||data.spots.length!==SURFACE_SPLATS||!data.spots.every(s=>Array.isArray(s)&&s.length===4&&s.every(Number.isFinite)&&s[0]>=0&&s[0]<=1&&s[1]>=0&&s[1]<=1&&s[2]>=0&&s[2]<=.22&&s[3]>=0&&s[3]<=1)||![data.blood,data.wet].every(v=>Number.isFinite(v)&&v>=0&&v<=1))return false;data.spots.forEach((s,i)=>this.spots[i].fromArray(s));this.blood=data.blood;this.wet=data.wet;this.inWater=data.inWater===true;this.serial=Number.isSafeInteger(data.serial)&&data.serial>=0?data.serial:0;this.last=time;return true;}
}
export const weaponSurface = new WeaponSurfaceState();
const demoSurface = new WeaponSurfaceState();
export const R_ActiveWeaponSurface=()=>cls.demoplayback?demoSurface:weaponSurface;
let context={enabled:false,eye:null,visible:null,contact:null};
export function R_WeaponSurfaceContext(enabled,eye,visible,contact=null){context.enabled=enabled===true;context.eye=eye;context.visible=visible;context.contact=contact;}
export function R_WeaponSurfaceFrame(time,contents,paused=false){R_ActiveWeaponSurface().frame(time,contents,paused);}
export function R_PlayerSurfaceBlood(amount){return context.enabled&&R_ActiveWeaponSurface().add(Math.min(.65,Math.max(0,amount)/55),context.contact?.(context.eye));}
export function R_WeaponSurfaceBloodAt(point,count){if(!context.enabled||!context.eye||!point?.every(Number.isFinite)||!Number.isFinite(count)||count<=0)return false;const distance=Math.hypot(...point.map((p,i)=>p-context.eye[i]));if(distance>72||!context.visible||!context.visible(point,context.eye))return false;return R_ActiveWeaponSurface().add((1-distance/72)*Math.min(.6,count/70),context.contact?.(point));}
export const ACTOR_COAT_GLSL=`
uniform float uActorCoatOn;
uniform vec4 uActorBloodSpots[${SURFACE_SPLATS}];
float actorBloodMask(vec2 uv){if(uActorCoatOn<.5)return 0.;float mask=0.;for(int i=0;i<${SURFACE_SPLATS};i++){vec4 s=uActorBloodSpots[i];if(s.w<=0.)continue;vec2 p=(uv-s.xy)/max(s.z,.001);float edge=length(p)*(1.+.13*sin(p.x*17.+p.y*11.)+.08*cos(p.y*23.));mask+=s.w*(1.-smoothstep(.35,1.,edge));}return clamp(mask,0.,.93)*uActorCoatOn;}
`;
export const ACTOR_COAT_MAP_GLSL=`
 float actorBlood=actorBloodMask(vMapUv);
 diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.16,.005,.008),diffuseColor.rgb*vec3(.38,.04,.055),.35),actorBlood);
`;
