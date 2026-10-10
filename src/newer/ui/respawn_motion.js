/**
 * @module newer/ui/respawn_motion
 *
 * The respawn's motion law, ported from the owner's clockwise-respawn demo.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Faithful motion-law port from the owner's clockwise-respawn-v1.1.0/app.js.
// Native Quake coordinates remain Z-up. The proper presentation frame is a
// coordinate gauge: (P*world,P*camera) renders exactly as (world,camera).
// At contact P advances by a half-turn, while transported camera orientation
// and angular/head velocity stay continuous. No reflection or gravity change.
import * as THREE from 'three';
export const RESPAWN_DELAY=.22,RESPAWN_TURN=2.6;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
const basis=angles=>{const yaw=angles[1]*Math.PI/180;return {f:new THREE.Vector3(Math.cos(yaw),Math.sin(yaw),0),r:new THREE.Vector3(Math.sin(yaw),-Math.cos(yaw),0),u:new THREE.Vector3(0,0,1)};};
export function Respawn_NextFrame(frame,angles){const q=new THREE.Quaternion().fromArray(frame);return q.multiply(new THREE.Quaternion().setFromAxisAngle(basis(angles).f,-Math.PI)).normalize().toArray();}
// the facing `progress` (0..1) of the way through the rise: yaw by the shorter way round, pitch straight
export function facingAt(sequence,progress){
 const from=sequence.angles,to=sequence.riseAngles;if(!to||progress<=0)return from;
 const s=smooth(progress),dyaw=((to[1]-from[1])%360+540)%360-180;
 return [from[0]+(to[0]-from[0])*s,from[1]+dyaw*s,0];
}
export function Respawn_Sample(sequence,time){
 const duration=sequence.turn||RESPAWN_TURN,t=Math.max(0,time-sequence.at),u=clamp((t-RESPAWN_DELAY)/duration);
 // The supplied integral of a raised cosine: zero velocity at both upright
 // endpoints, maximum continuous clockwise velocity at the contact midpoint.
 const theta=Math.PI*(u-Math.sin(2*Math.PI*u)/(2*Math.PI));
 const omega=u>0&&u<1?Math.PI*(1-Math.cos(2*Math.PI*u))/duration:0;
 const after=t>=RESPAWN_DELAY+duration/2,localRoll=theta-(after?Math.PI:0);
 // Card [35]: during the rise the facing turns from the facing at death to the facing into the level, smoothly from zero at the
 // contact (so the transported camera stays continuous across the cut) to the full turn when upright. The fall is unchanged.
 const facing=facingAt(sequence,after?clamp(2*u-1):0),b=basis(facing);
 // (velocity below is the roll's and the drift's; it leaves out the yaw rate of this turn. Nothing reads it but tests of the fall.)
 const upBody=b.u.clone().multiplyScalar(Math.cos(localRoll)).addScaledVector(b.r,Math.sin(localRoll));
 const right=b.r.clone().multiplyScalar(Math.cos(localRoll)).addScaledVector(b.u,-Math.sin(localRoll));
 const pitch=facing[0]*Math.PI/180;
 const forward=b.f.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(upBody,-Math.sin(pitch));
 const up=upBody.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(b.f,Math.sin(pitch));
 const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward.clone().negate()));
 const pivot=new THREE.Vector3().fromArray(after?sequence.destinationPivot:sequence.sourcePivot);
 const fall=clamp(2*u),descent=sequence.descent||0;
 if(!after)pivot.z-=descent*smooth(fall);
 else pivot.z-=(sequence.destinationDrop||0)*(1-smooth(clamp(2*u-1)));
 const drift=new THREE.Vector3().fromArray(after?(sequence.destinationDrift||[0,0,0]):(sequence.sourceDrift||[0,0,0]));
 pivot.addScaledVector(drift,after?1-smooth(clamp(2*u-1)):smooth(fall));
 const eye=pivot.clone().addScaledVector(upBody,sequence.radius);
 const velocity=right.clone().multiplyScalar(sequence.radius*omega);
 const progress=after?clamp(2*u-1):fall,du=u>0&&u<1?2/duration:0;
 const ds=30*progress*progress*(progress-1)*(progress-1)*du;
 velocity.addScaledVector(drift,after?-ds:ds);if(!after)velocity.z-=descent*ds;else velocity.z+=(sequence.destinationDrop||0)*ds;
 const frame=after?Respawn_NextFrame(sequence.frame,sequence.angles):sequence.frame;
 const absoluteQ=new THREE.Quaternion().fromArray(frame).multiply(q);
 // Euler values reproduce the actual basis through Quake's AngleVectors.
 const angles=[-Math.asin(clamp(forward.z,-1,1))*180/Math.PI,Math.atan2(forward.y,forward.x)*180/Math.PI,Math.atan2(-right.z,up.z)*180/Math.PI];
 return {theta,omega,after,complete:u===1,eye:eye.toArray(),velocity:velocity.toArray(),angles,quaternion:q.toArray(),frame,absoluteQuaternion:absoluteQ.toArray(),bodyUp:upBody.toArray(),right:right.toArray(),forward:forward.toArray(),up:up.toArray()};
}
