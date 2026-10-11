/**
 * @module newer/render/r_stasisbolt
 *
 * The supplied "STASIS 02 — Miniature Plasma Lab" bolt, drawn in place of every laser shot (progs/laser.mdl).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `deps`, `group`, `plasma`, `sparks`, `rings`, `plasmaGeometry`,
 * `nextId`, `stamp`, `lastTime`, `impactCursor`, `_acceptX`, `_acceptY` and 1 more.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// The owner-supplied "STASIS 02 — Miniature Plasma Lab" page (stasis-combat-fx-v2.html, SHA-256
// 8ae01c6d...52a8, kept local), its "Stasis bolt" ability, card [LZ1]. Source lines (of the hashed file):
// NOISE_GLSL 219-236, PLASMA_VERTEX 240-246, PLASMA_FRAGMENT 247-300, PARTICLE_VERTEX 302-314,
// PARTICLE_FRAGMENT 315-343, FxParticles 388-462, FxPlasmaVolume 465-500, shootBolt 537-553, fireBurst /
// _emitBurst 558-613, _ring 652-657, _impact 666-682, _updateBolts 683-704, update (rings) 762-781. Extraction
// map and provenance: newer/effects/stasisbolt/provenance.json and docs/laser-stasis-bolt-2026-10-11.md.
//
// What it draws. In Newer Game every laser projectile the game has (the Enforcer's laser and the laser traps,
// trap_spikeshooter / trap_shooter with the laser spawnflag: both are progs/laser.mdl) is drawn as ONE supplied bolt,
// at the owner's miniature scale 0.24, centred on the native projectile's interpolated origin and pointing along its
// flight. Its native mesh is not drawn. The bolt is the source's ray-marched plasma volume (one proxy box, the
// source's fragment shader) with the source's glow sparks shed behind it, and when a laser strikes a wall the
// source's bolt impact (a spray of red sparks under gravity and drag, and an expanding ring on the surface) replaces
// the native gunshot puff.
//
// What is the game's and what is the picture's. The projectile's motion, speed (600 units/s), damage, collision,
// sounds, dynamic light (EF_DIMLIGHT) and timing are the game's and are not touched: this file reads where the client
// already put the entity and draws there. Only the picture changes. Classic Quake, the classic half of the title
// demo's split view, `r_stasisbolt 0`, no scene, and a full pool all keep the native laser model and gunshot.
//
// What is the source's and what is adapted.
//  * The shader, the bolt's dimensions (length 3.15 x scale, radius max(0.014, 0.115 x scale), proxy box 3.5 radii
//    across), its colours, roughness, step count, the glow spark rate, life, size and colour, and the impact's
//    count, speeds, sizes, lives, gravity, drag, ring colour, life and growth are the source's, in source units
//    (metres); one source unit is 24 Quake units, as the Fireball, smoke trails and shotgun pellets use. That makes
//    the bolt 18 units long against the native model's 19.
//  * One for one (owner's clarification): fireBurst's count 4 and frequency 8 are not used. Each native projectile
//    is one bolt; there is nothing to schedule because the game fires the projectiles.
//  * freezeAt 7.5 is not used. In the source it is the travel distance in metres at which a bolt stops translating
//    and hangs in the air ("stasis") while its plasma keeps flowing; fireBurst staggers each pulse's stop point back
//    by 1.32 bolt lengths so the four hang in a row. A laser here flies where the game moves it, so a stop point
//    would separate the picture from the projectile. The shader's own flow time is never frozen in the source either.
//  * The source integrates its particles step by step with Math.random; here every spark and impact particle is a
//    closed-form function of its age with hashed draws (the same distributions), so the per-frame path writes
//    scalars into preallocated buffers and allocates nothing, and a frame rate change does not change the picture.
//  * The source's page displays its effect shaders' values as screen (sRGB) values, clipped at 1; Quaked's composite
//    treats an effect's output as linear light, applies its exposure and grade and rolls highlights toward white. Each
//    output here is clipped, converted to linear and scaled to sit under that roll-off (`shown`, TO_LINEAR below),
//    which shows the source's saturated red with a white core instead of a pink bolt.
//  * The source's point light per bolt is not added: the laser keeps its native dim light.
//  * The source's stage floor bounce of particles is not reproduced (the level has no such plane).
import * as THREE from 'three';
import { cvar_t } from '../../engine/common/cvar.js';
import { R_NewerGame } from '../mode.js';
import { hashJS, mix } from './fx_math.js';
import { MRT_OUT, MRT_ZERO, layer, material } from './r_fireball.js';
import { R_DecalSurface } from './r_decals.js';

// 0 puts the native laser model and gunshot back
export const r_stasisbolt = new cvar_t( 'r_stasisbolt', '1' );

const STASIS_DISPLAY = .6; // see TO_LINEAR
const SCALE = .24; // the owner's call: fireBurst('bolt', { ..., scale: 0.24 })

// Source defaults for the "Stasis bolt" at the owner's scale; source units are metres.
export const STASIS = Object.freeze( {
	model: 'progs/laser.mdl',
	scale: SCALE,
	// Quake units per source unit (the Fireball's, the smoke trails' and the shotgun pellets')
	unit: 24,
	// _emitBurst (bolt): length = 3.15 * scale, radius = max(0.014, 0.115 * scale)
	length: 3.15 * SCALE,
	radius: Math.max( .014, .115 * SCALE ),
	// FxPlasmaVolume: the proxy box is (length, 3.5 radius, 3.5 radius) across
	sheath: 3.5,
	// FxPlasmaVolume defaults (shootBolt passes power 1 and quality 'high')
	color: 0xff202d, hot: 0xffe3d0, power: 1, roughness: .4, steps: 28,
	// _updateBolts: 45 sparks a second while flying, each at a random point of the bolt
	glow: { rate: 45, life: [ .04, .13 ], size: [ .007, .019 ], color: [ 1, .055, .08 ], drift: [ .4, .35, .35 ] },
	// _impact('bolt', ..., visualScale = length / 3.15 = scale) and _ring
	impact: {
		count: Math.floor( 30 * Math.sqrt( SCALE ) ), speed: [ 1.5 * Math.sqrt( SCALE ), 6 * Math.sqrt( SCALE ) ],
		size: [ .025 * SCALE, .085 * SCALE ], life: [ .3, .8 ], gravity: 6, drag: 1, color: [ 1, .08, .075 ],
		ringColor: 0xff4158, ringLife: .45, ringSize: 1.1 * SCALE, ringStart: .1, ringInner: .94, ringOpacity: .45
	},
	// the native projectile's speed (LaunchLaser: velocity = dir * 600), used until a bolt's own is measured
	speed: 600,
	maxBolts: 32, maxImpacts: 16, sparksPerBolt: 8,
	// a TE_GUNSHOT is a laser's impact when it lies on the path of a bolt last drawn at most `window` seconds ago:
	// within `reach` units of its line (its measured flight; Laser_Touch sends the event exactly on it), from `behind`
	// units behind the bolt to `ahead` units past where it could be `lead` seconds (one server tick) after now. A shot
	// marked struck that is still listed `recover` seconds later was not the one that struck, and is drawn again.
	match: { reach: 4, behind: 24, ahead: 16, lead: .1, window: .25, recover: .1 }
} );

// ---------------------------------------------------------------------------
// Shaders: the source's GLSL, adapted to instancing and Quaked's MRT pipeline
// ---------------------------------------------------------------------------

// NOISE_GLSL of the source, verbatim
export const NOISE_GLSL = `
float hash31(vec3 p) {
  p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),
                 mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),
                 mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
  float n=0.0, a=0.5;
  for(int i=0;i<4;i++){n+=noise3(p)*a;p=p*2.03+vec3(7.1,3.5,9.2);a*=0.5;}
  return n;
}
`;

// The source's screen values, as linear light for Quaked's composite. The source's page shows a value as written,
// clipped at 1. Quaked's composite multiplies the scene by its exposure (1.3) and grade and then rolls anything over
// its knee toward white, so a full red written as 1 shows pink. `shown` therefore clips as the source's screen does,
// converts with the exact sRGB curve, and scales by DISPLAY so the source's full scale lands just under the knee: the
// mantle stays the source's saturated red and only the core reads white. DISPLAY was set in the browser trial against
// the source's own bolt seen from the same distance (0.4 left the core red, 1 turned the whole bolt pink).
const TO_LINEAR = `
const float DISPLAY=${STASIS_DISPLAY.toFixed( 2 )};
vec3 shown(vec3 c){vec3 k=clamp(c,0.,1.);vec3 lo=k/12.92,hi=pow((k+.055)/1.055,vec3(2.4));return mix(hi,lo,vec3(lessThanEqual(k,vec3(.04045))))*DISPLAY;}
`;

// One unit box per bolt, placed by its instance: the centre and the phase, the axis and the half length (Quake
// units); the half width is shared. The camera is carried into the box's own -1..1 space, as the source's
// uCameraLocal (FxPlasmaVolume.onBeforeRender).
const PLASMA_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aCenter,aAxis;
uniform float uHalfWidth;
varying vec3 vLocal,vCam;varying float vPhase;
void main(){
 vec3 ax=aAxis.xyz,up=abs(ax.z)<.99?vec3(0.,0.,1.):vec3(1.,0.,0.);
 vec3 ay=normalize(cross(up,ax)),az=cross(ax,ay);
 vec3 world=aCenter.xyz+ax*position.x*aAxis.w+ay*position.y*uHalfWidth+az*position.z*uHalfWidth;
 vec3 cam=(inverse(modelMatrix)*vec4(cameraPosition,1.)).xyz-aCenter.xyz; // (the group is identity unless a scene scale is applied, as in XR)
 vCam=vec3(dot(cam,ax)/aAxis.w,dot(cam,ay)/uHalfWidth,dot(cam,az)/uHalfWidth);
 vLocal=position;vPhase=aCenter.w;
 vec4 mvPosition=modelViewMatrix*vec4(world,1.);
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*mvPosition;
}`;

// PLASMA_FRAGMENT of the source: the ray march is the source's, statement for statement; uCameraLocal and uPhase are
// per instance (vCam, vPhase), and the output goes through `shown` with alpha 0 (additive light, as the
// Fireball's light layers write it).
export const PLASMA_FRAGMENT = `
#include <clipping_planes_pars_fragment>
uniform vec3 uColor, uHot;
uniform float uTime, uPower, uSteps, uRoughness;
varying vec3 vLocal,vCam;varying float vPhase;
${MRT_OUT}
${NOISE_GLSL}
${TO_LINEAR}
vec2 rayBox(vec3 ro, vec3 rd) {
  vec3 inv = 1.0 / (sign(rd + vec3(1.e-8)) * max(abs(rd), vec3(1.e-6)));
  vec3 a = (-vec3(1.0) - ro) * inv, b = (vec3(1.0) - ro) * inv;
  vec3 lo = min(a,b), hi = max(a,b);
  return vec2(max(max(lo.x,lo.y),lo.z), min(min(hi.x,hi.y),hi.z));
}
void main() {
  #include <clipping_planes_fragment>
  float uPhase = vPhase;
  vec3 ro = vCam;
  vec3 rd = normalize(vLocal - ro);
  vec2 bounds = rayBox(ro, rd);
  float start = max(bounds.x, 0.0), finish = bounds.y;
  if (finish <= start) discard;
  float stepSize = (finish-start) / uSteps;
  float t = uTime * 1.5 + uPhase;
  vec3 radiance = vec3(0.0);
  float opacity = 0.0;
  for (int i=0; i<28; i++) {
    if (float(i) >= uSteps) break;
    vec3 p = ro + rd * (start + (float(i)+0.5)*stepSize);
    float x = p.x*0.5+0.5;
    float ends = smoothstep(0.0,0.16,x)*(1.0-smoothstep(0.83,1.0,x));
    float radius = length(p.yz);
    float flow = noise3(vec3(p.x*4.8-t*6.5,p.y*3.2+uPhase,p.z*3.2));
    float detail = noise3(vec3(p.x*12.0-t*17.0,p.y*13.0,p.z*13.0+uPhase));
    float streaks = noise3(vec3(p.x*2.0-t*5.0,p.y*32.0,p.z*32.0));
    float neck = 0.65+0.35*sin(x*3.14159265);
    float width = (0.23+0.10*flow)*neck;
    float core = exp(-radius*radius*240.0)*(0.72+0.28*detail);
    float mantle = exp(-radius*radius/(width*width)) *
       smoothstep(0.19,0.76,flow*0.54+detail*0.30+streaks*0.24);
    float strands = pow(streaks,4.0)*exp(-radius*radius*11.0)*1.1;
    float compression = pow(0.5+0.5*cos(p.x*24.0-t*18.0+flow*2.8),9.0);
    float density = (core*2.4+mantle*(2.6+uRoughness)+strands)*ends;
    density *= 0.90 + 0.12*compression;
    float heat = clamp(core*1.2+mantle*0.28+compression*0.12,0.0,1.0);
    vec3 color = mix(uColor,uHot,pow(heat,1.4));
    float a = 1.0-exp(-density*stepSize*3.0);
    radiance += (1.0-opacity)*a*color*(1.2+heat*0.7);
    opacity += (1.0-opacity)*a;
    radiance += uColor*exp(-radius*radius*5.0)*ends*stepSize*0.09;
  }
  if (opacity < 0.003) discard;
  gl_FragColor=vec4(shown(radiance*uPower),0.);
  ${MRT_ZERO}
}`;

// PARTICLE_VERTEX / PARTICLE_FRAGMENT (kind 0, the glow) of the source as camera-facing quads: aPosSize is the centre
// and the world diameter (gl_PointSize = size * pixelScale / depth), never under one pixel (the source clamps its
// point size to 1..180 px); aColor is the colour and the remaining life fraction (the source's aLife).
const SPARK_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aPosSize,aColor;
uniform vec2 uResolution;
varying vec2 vUV;varying vec3 vColor;varying float vLife;
void main(){
 vec2 p=position.xy;
 float scale=length(modelMatrix[0].xyz);
 vec4 mv=modelViewMatrix*vec4(aPosSize.xyz,1.);
 float pixel=max(.1,-mv.z)*2./max(1.,uResolution.y*projectionMatrix[1][1]);
 mv.xy+=p*max(aPosSize.w*scale,pixel)*.5;
 vec4 mvPosition=mv;
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*mv;
 vUV=p*.5+.5;vColor=aColor.rgb;vLife=aColor.a;
}`;
export const SPARK_FRAGMENT = `
#include <clipping_planes_pars_fragment>
varying vec2 vUV;varying vec3 vColor;varying float vLife;
${MRT_OUT}
${TO_LINEAR}
void main(){
 #include <clipping_planes_fragment>
 vec2 p=vUV*2.0-1.0;
 float r=length(p); if(r>1.0||vLife<=0.0) discard;
 float fade=smoothstep(0.0,0.25,vLife);
 vec3 col=vColor; float alpha;
 alpha=exp(-r*r*5.5)*fade;
 col+=vec3(0.3)*exp(-r*r*40.0);
 gl_FragColor=vec4(shown(col*alpha),0.);
 ${MRT_ZERO}
}`;

// _ring of the source: RingGeometry(0.94, 1) in the surface's plane, MeshBasicMaterial additive at `opacity`. The quad
// reaches 1.05 radii so the outer edge can be smoothed.
const RING_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aCenterRadius,aAxisU,aAxisV;
varying vec2 vP;varying float vOpacity;
void main(){
 vec2 p=position.xy*1.05;
 vec3 world=aCenterRadius.xyz+(aAxisU.xyz*p.x+aAxisV.xyz*p.y)*aCenterRadius.w;
 vec4 mvPosition=modelViewMatrix*vec4(world,1.);
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*mvPosition;
 vP=p;vOpacity=aAxisU.w;
}`;
const RING_FRAGMENT = `
#include <clipping_planes_pars_fragment>
uniform vec3 uRingColor;uniform float uInner;
varying vec2 vP;varying float vOpacity;
${MRT_OUT}
${TO_LINEAR}
void main(){
 #include <clipping_planes_fragment>
 float r=length(vP),w=max(fwidth(r),1e-4);
 float band=smoothstep(uInner-w,uInner,r)*(1.-smoothstep(1.,1.+w,r));
 if(band<=0.)discard;
 gl_FragColor=vec4(shown(uRingColor*vOpacity)*band,0.);
 ${MRT_ZERO}
}`;

// ---------------------------------------------------------------------------
// Closed-form motion of the source's particles
// ---------------------------------------------------------------------------

const STEP = 1 / 60; // CombatFX.update: every step is at most 1/60 s, whatever the frame rate

/**
 * Where a particle of the source's FxParticles is after `age` seconds, in closed form. The source advances its
 * particles in steps of 1/60 s (CombatFX.update splits every frame so): v *= exp(-drag h); v.up -= gravity h;
 * p += v h. Summed, after n = age / h steps: p = h (v0 S - gravity h (n - S) / (1 - a) up) with a = exp(-drag h)
 * and S = a (1 - a^n) / (1 - a), which is the source's own path at every step (and a smooth curve between steps).
 * Called per impact particle per frame by `R_StasisBoltFrame` (and by the tests). Writes into `out`; allocates nothing.
 *
 * @param {number} age seconds since the particle was emitted (0 or more)
 * @param {number} vx initial velocity, x (any length unit per second)
 * @param {number} vy initial velocity, y
 * @param {number} vz initial velocity, z (the "up" axis gravity pulls against)
 * @param {number} gravity downward acceleration along z, same units per second squared (0 for none)
 * @param {number} drag the source's drag rate, per second (0 for none)
 * @param {Float64Array|Array<number>} out receives the displacement from the emission point at out[0..2]
 * @returns {Float64Array|Array<number>} `out`
 */
export function particleOffset( age, vx, vy, vz, gravity, drag, out ) {

	const h = STEP, n = Math.max( 0, age ) / h;
	let S, fall;
	if ( drag > 1e-9 ) {

		const a = Math.exp( - drag * h );
		S = a * ( 1 - Math.pow( a, n ) ) / ( 1 - a );
		fall = gravity * h * ( n - S ) / ( 1 - a );

	} else {

		S = n; fall = gravity * h * n * ( n + 1 ) / 2;

	}
	out[ 0 ] = h * vx * S; out[ 1 ] = h * vy * S; out[ 2 ] = h * ( vz * S - fall );
	return out;

}

/**
 * One glow spark of a bolt (_updateBolts of the source), as the source draws it: emitted at the bolt's position at
 * its emission time, offset by up to half the bolt's length along it and up to one radius across, drifting slowly,
 * with a hashed life, size and drift. Used by `R_StasisBoltFrame` and the tests; allocates nothing.
 *
 * @param {number} id the bolt's id (seeds its sparks)
 * @param {number} m the spark's index along the bolt's flight (0, 1, 2 ... one every 1/45 s)
 * @param {Float64Array|Array<number>} out receives [ along, across1, across2, driftAlong, driftAcross1, driftAcross2,
 *   life, size ]: offsets in source units of the bolt's length and radius frame (along -L/2..L/2, across -r..r),
 *   drift in source units per second (the source's velocity: x = direction.x * u, then y and z), life in seconds and
 *   world diameter in source units
 * @returns {Float64Array|Array<number>} `out`
 */
export function glowSpark( id, m, out ) {

	const g = STASIS.glow, seed = id * 7.13 + m * 1.618;
	out[ 0 ] = mix( - .5, .5, hashJS( seed + .11 ) ) * STASIS.length;
	out[ 1 ] = mix( - 1, 1, hashJS( seed + .23 ) ) * STASIS.radius;
	out[ 2 ] = mix( - 1, 1, hashJS( seed + .37 ) ) * STASIS.radius;
	out[ 3 ] = mix( - g.drift[ 0 ], g.drift[ 0 ], hashJS( seed + .41 ) );
	out[ 4 ] = mix( - g.drift[ 1 ], g.drift[ 1 ], hashJS( seed + .53 ) );
	out[ 5 ] = mix( - g.drift[ 2 ], g.drift[ 2 ], hashJS( seed + .67 ) );
	out[ 6 ] = mix( g.life[ 0 ], g.life[ 1 ], hashJS( seed + .79 ) );
	out[ 7 ] = mix( g.size[ 0 ], g.size[ 1 ], hashJS( seed + .83 ) );
	return out;

}

/**
 * One particle of a bolt's impact (_impact('bolt') of the source): thrown off the surface along its normal at a hashed
 * speed plus the source's random spread (sideways +-1.5 and +-2, upward 0..2.5 m/s), with a hashed size and life.
 * Used by `R_StasisBoltFrame` and the tests; allocates nothing.
 *
 * @param {number} id the impact's id (seeds its particles)
 * @param {number} j the particle's index, 0 .. STASIS.impact.count - 1
 * @param {number} nx the surface's outward unit normal, Quake axes (z up)
 * @param {number} ny normal, y
 * @param {number} nz normal, z
 * @param {Float64Array|Array<number>} out receives [ vx, vy, vz, size, life ]: velocity in source units per second on
 *   Quake axes (z up), world diameter in source units, life in seconds
 * @returns {Float64Array|Array<number>} `out`
 */
export function impactParticle( id, j, nx, ny, nz, out ) {

	const k = STASIS.impact, seed = id * 3.71 + j * 2.399;
	const s = mix( k.speed[ 0 ], k.speed[ 1 ], hashJS( seed + .13 ) );
	// source axes (x, y up, z) are Quake's (x, z, y): its x spread +-1.5 is Quake x, its z spread +-2 Quake y, its
	// upward 0..2.5 Quake z
	out[ 0 ] = nx * s + mix( - 1.5, 1.5, hashJS( seed + .29 ) );
	out[ 1 ] = ny * s + mix( - 2, 2, hashJS( seed + .47 ) );
	out[ 2 ] = nz * s + mix( 0, 2.5, hashJS( seed + .61 ) );
	out[ 3 ] = mix( k.size[ 0 ], k.size[ 1 ], hashJS( seed + .73 ) );
	out[ 4 ] = mix( k.life[ 0 ], k.life[ 1 ], hashJS( seed + .89 ) );
	return out;

}

/**
 * The impact ring's radius and opacity at `age` (update() of the source: scale 0.1 + u * size, opacity (1 - u) * 0.45,
 * u = age / life). Writes into `out`; allocates nothing.
 *
 * @param {number} age seconds since the impact
 * @param {Float64Array|Array<number>} out receives [ radius in source units, opacity 0..0.45 ] (0 opacity once the
 *   ring's 0.45 s are over)
 * @returns {Float64Array|Array<number>} `out`
 */
export function impactRing( age, out ) {

	const k = STASIS.impact, u = Math.min( 1, Math.max( 0, age / k.ringLife ) );
	out[ 0 ] = k.ringStart + u * k.ringSize; out[ 1 ] = ( 1 - u ) * k.ringOpacity;
	return out;

}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

const ORDER_RING = 7, ORDER_PLASMA = 8, ORDER_SPARK = 9; // (after the scorch decals at 5, as the Fireball's layers)
const FREE = 0, FLYING = 1, GONE = 2;
const STALE = .3, JUMP = 64, REWIND_DROP = 1; // seconds unseen / units off its line before a slot is a new bolt; clock rewind
const SPARK_CAP = STASIS.maxBolts * STASIS.sparksPerBolt + STASIS.maxImpacts * STASIS.impact.count;

let deps = null, group = null, plasma = null, sparks = null, rings = null, plasmaGeometry = null;
let nextId = 1, stamp = 1, lastTime = 0;

// one record per tracked projectile, allocated once
const slots = Array.from( { length: STASIS.maxBolts }, () => ( {
	state: FREE, ent: null, id: 0, hit: false, hitTime: 0, stamp: 0, born: 0, phase: 0,
	first: new Float64Array( 3 ), firstTime: 0, origin: new Float64Array( 3 ), seen: 0,
	dir: new Float64Array( 3 ), vel: new Float64Array( 3 )
} ) );
// one record per impact, allocated once; reused oldest first
const impacts = Array.from( { length: STASIS.maxImpacts }, () => ( {
	live: false, id: 0, start: null, spawned: 0, p: new Float64Array( 3 ), n: new Float64Array( 3 ), u: new Float64Array( 3 ), v: new Float64Array( 3 )
} ) );
let impactCursor = 0;
const _spark = new Float64Array( 8 ), _particle = new Float64Array( 5 ), _offset = new Float64Array( 3 ), _ring = new Float64Array( 2 );
const _instanced = [];

function build() {

	const box = new THREE.BoxGeometry( 2, 2, 2 );
	plasmaGeometry = new THREE.InstancedBufferGeometry();
	plasmaGeometry.setIndex( box.getIndex() );
	plasmaGeometry.setAttribute( 'position', box.getAttribute( 'position' ) );
	plasmaGeometry.instanceCount = 0;
	const arrays = { aCenter: new Float32Array( STASIS.maxBolts * 4 ), aAxis: new Float32Array( STASIS.maxBolts * 4 ) };
	for ( const [ name, array ] of Object.entries( arrays ) ) plasmaGeometry.setAttribute( name, new THREE.InstancedBufferAttribute( array, 4 ).setUsage( THREE.DynamicDrawUsage ) );
	const K = STASIS.unit;
	const plasmaMaterial = material( PLASMA_VERTEX, PLASMA_FRAGMENT, {
		uColor: { value: new THREE.Color( STASIS.color ) }, uHot: { value: new THREE.Color( STASIS.hot ) }, uTime: { value: 0 },
		uPower: { value: STASIS.power }, uSteps: { value: STASIS.steps }, uRoughness: { value: STASIS.roughness },
		uHalfWidth: { value: STASIS.radius * STASIS.sheath * K }
	}, THREE.AdditiveBlending );
	plasmaMaterial.side = THREE.BackSide; // (the source's: the march starts at the camera when it is inside the box)
	const mesh = new THREE.Mesh( plasmaGeometry, plasmaMaterial );
	mesh.name = 'stasis_bolts'; mesh.frustumCulled = false; mesh.renderOrder = ORDER_PLASMA; mesh.userData.newerOnly = true;
	plasma = { mesh, geometry: plasmaGeometry, arrays, capacity: STASIS.maxBolts };
	sparks = layer( 'stasis_sparks', SPARK_CAP, { aPosSize: 4, aColor: 4 },
		material( SPARK_VERTEX, SPARK_FRAGMENT, { uResolution: { value: new THREE.Vector2( 1280, 720 ) } }, THREE.AdditiveBlending ), ORDER_SPARK );
	// the ring is a MeshBasicMaterial in the source: its colour is shown as written (sRGB)
	const ringHex = STASIS.impact.ringColor;
	rings = layer( 'stasis_rings', STASIS.maxImpacts, { aCenterRadius: 4, aAxisU: 4, aAxisV: 4 },
		material( RING_VERTEX, RING_FRAGMENT, { uRingColor: { value: new THREE.Vector3( ( ringHex >> 16 & 255 ) / 255, ( ringHex >> 8 & 255 ) / 255, ( ringHex & 255 ) / 255 ) },
			uInner: { value: STASIS.impact.ringInner } }, THREE.AdditiveBlending ), ORDER_RING );
	_instanced.length = 0;
	for ( const l of [ plasma, sparks, rings ] ) for ( const attribute of Object.values( l.geometry.attributes ) ) if ( attribute.isInstancedBufferAttribute ) _instanced.push( attribute );
	group = new THREE.Group(); group.name = 'quake_stasis_bolts'; group.userData.newerOnly = true;
	group.add( rings.mesh, plasma.mesh, sparks.mesh );

}

/**
 * Called by R_NewMap for every new map, as R_FireballSetup is: the caller supplies the scene, the client and the leaf
 * lookup. Kept until the next call.
 *
 * @param {{ scene: ?THREE.Scene, cl: function(): ?Object, pointInLeaf: ?function(Array<number>, Object): ?Object }} externals
 * the scene the layers join; a getter for the client state (`time`, `worldmodel`); Mod_PointInLeaf, for finding the
 * surface a laser struck
 */
export function R_StasisBoltSetup( externals ) {

	deps = externals;

}

/**
 * Forgets every tracked bolt and impact and hides the layers: called by R_NewMap after `R_StasisBoltSetup` (a new
 * level's clock starts over), and by `R_StasisBoltFrame` outside Newer Game or with `r_stasisbolt` 0.
 */
export function R_StasisBoltClear() {

	for ( const s of slots ) { s.state = FREE; s.ent = null; }
	for ( const i of impacts ) i.live = false;
	lastTime = 0;
	if ( group ) { group.visible = false; plasma.geometry.instanceCount = 0; sparks.geometry.instanceCount = 0; rings.geometry.instanceCount = 0; }

}

// whether the bolt replaces native pictures at all right now
const active = () => deps != null && !! deps.scene && r_stasisbolt.value !== 0 && R_NewerGame();

function aim( ent, out ) {

	const a = ent.angles;
	if ( a == null ) { out[ 0 ] = 1; out[ 1 ] = 0; out[ 2 ] = 0; return; }
	// vectoangles of the velocity: pitch up positive (R_RotateForEntity turns the model by -pitch about y)
	const p = a[ 0 ] * Math.PI / 180, y = a[ 1 ] * Math.PI / 180;
	out[ 0 ] = Math.cos( p ) * Math.cos( y ); out[ 1 ] = Math.cos( p ) * Math.sin( y ); out[ 2 ] = Math.sin( p );

}

/**
 * Asked by the entity draw loop (R_DrawEntitiesOnList in gl_rmain.js) for every alias entity, every frame: is this a
 * laser shot that the supplied bolt draws instead? If so its position and heading are recorded for this frame's bolt
 * and the caller must not draw the native mesh. A slot stays with one entity while it keeps moving along its line;
 * an entity number reused by a new shot (a jump of more than 64 units off the line, or 0.3 s unseen) starts a new
 * bolt. Allocates nothing.
 *
 * @param {?entity_t} ent the entity about to be drawn; only `progs/laser.mdl` is taken
 * @returns {boolean} true when the bolt draws it (Newer Game, `r_stasisbolt` not 0, set up with a scene, a client, and
 *   a free slot of 32); false when the native model must be drawn
 */
export function R_StasisBoltTakes( ent ) {

	if ( ent == null || ent.model == null || ent.model.name !== STASIS.model || ent.origin == null || ! active() ) return false;
	const cl = deps.cl?.();
	if ( cl == null ) return false;
	const time = cl.time, o = ent.origin;
	let s = null, free = null;
	for ( const c of slots ) {

		if ( c.state !== FREE && c.ent === ent ) { s = c; break; }
		if ( free === null && c.state === FREE ) free = c;

	}
	if ( s !== null && s.stamp === stamp ) { s.origin[ 0 ] = o[ 0 ]; s.origin[ 1 ] = o[ 1 ]; s.origin[ 2 ] = o[ 2 ]; return true; } // (listed twice in one frame: the client's list can hold an entity twice)
	if ( s !== null ) {

		// still the same shot: close to where its line puts it now, and seen lately
		const dt = time - s.seen, ex = s.origin[ 0 ] + s.vel[ 0 ] * dt, ey = s.origin[ 1 ] + s.vel[ 1 ] * dt, ez = s.origin[ 2 ] + s.vel[ 2 ] * dt;
		if ( dt < - .05 || dt > STALE || Math.hypot( o[ 0 ] - ex, o[ 1 ] - ey, o[ 2 ] - ez ) > JUMP ) { s.state = FREE; s.ent = null; free = s; s = null; }
		else if ( s.hit && time - s.hitTime <= STASIS.match.recover ) return true; // (the shot already struck: listed once more before its removal arrives, it is not drawn)
		else if ( s.hit ) s.hit = false; // (still flying well after: the event was not this shot's; draw it again)

	}
	if ( s === null ) {

		if ( free === null ) return false; // (a full pool: this one stays native)
		s = free;
		s.ent = ent; s.id = nextId ++; s.hit = false; s.born = time; s.phase = hashJS( s.id * 1.37 ) * 40; // (the source's uPhase: random * 40)
		s.first[ 0 ] = o[ 0 ]; s.first[ 1 ] = o[ 1 ]; s.first[ 2 ] = o[ 2 ]; s.firstTime = time;
		aim( ent, s.dir );
		s.vel[ 0 ] = s.dir[ 0 ] * STASIS.speed; s.vel[ 1 ] = s.dir[ 1 ] * STASIS.speed; s.vel[ 2 ] = s.dir[ 2 ] * STASIS.speed;

	} else {

		aim( ent, s.dir );
		// its own speed, once it has flown a little (the native one is constant)
		const span = time - s.firstTime;
		if ( span > .05 ) for ( let k = 0; k < 3; k ++ ) s.vel[ k ] = ( o[ k ] - s.first[ k ] ) / span;

	}
	s.state = FLYING; s.stamp = stamp; s.seen = time;
	s.origin[ 0 ] = o[ 0 ]; s.origin[ 1 ] = o[ 1 ]; s.origin[ 2 ] = o[ 2 ];
	return true;

}

let _acceptX = 0, _acceptY = 0, _acceptZ = 0;
// a struck surface faces the shot
const facesShot = ( surf, side ) => ( surf.plane.normal[ 0 ] * _acceptX + surf.plane.normal[ 1 ] * _acceptY + surf.plane.normal[ 2 ] * _acceptZ ) * side < - .2;

/**
 * A bullet-hole event (TE_GUNSHOT, cl_tent.js) that is in fact a laser striking a wall (Laser_Touch sends TE_GUNSHOT 8
 * units back along the shot): when the point lies on the path of a bolt drawn in the last 0.25 s (STASIS.match: within
 * 4 units of its measured line, no further ahead than a server tick's flight), the source's bolt impact is spawned there
 * (on the struck surface when one is found within 48 units, facing the shot) and that bolt ends. Called by cl_tent.js
 * for every TE_GUNSHOT while the message is parsed. The caller keeps the event's sound and marks (decal or wall burn);
 * only its particles are replaced (and, in the title demo's split view, spawns them for the Classic half alone).
 *
 * @param {Array<number>} pos the event's point, world space, Quake units
 * @returns {boolean} true when it was a laser's impact and the bolt drew it (the native particles must not be spawned);
 *   false otherwise (Classic, `r_stasisbolt` 0, no scene or client, or no bolt on that path: a real bullet)
 */
export function R_StasisBoltImpact( pos ) {

	if ( pos == null || ! active() ) return false;
	const cl = deps.cl?.();
	if ( cl == null ) return false;
	const time = cl.time, M = STASIS.match;
	let best = null, bestDistance = M.reach;
	for ( const s of slots ) {

		if ( s.state === FREE || s.hit || time - s.seen > M.window || time < s.seen - M.window ) continue;
		// the line it flies along: its measured velocity (the angles reach the client rounded to 1.4 degrees)
		const speed = Math.hypot( s.vel[ 0 ], s.vel[ 1 ], s.vel[ 2 ] );
		if ( speed < 1 ) continue;
		const dx = s.vel[ 0 ] / speed, dy = s.vel[ 1 ] / speed, dz = s.vel[ 2 ] / speed;
		const rx = pos[ 0 ] - s.origin[ 0 ], ry = pos[ 1 ] - s.origin[ 1 ], rz = pos[ 2 ] - s.origin[ 2 ];
		const along = rx * dx + ry * dy + rz * dz;
		if ( along < - M.behind || along > speed * ( Math.max( 0, time - s.seen ) + M.lead ) + M.ahead ) continue;
		const off = Math.hypot( rx - dx * along, ry - dy * along, rz - dz * along );
		if ( off < bestDistance ) { bestDistance = off; best = s; }

	}
	if ( best === null ) return false;
	best.hit = true; best.hitTime = time; best.state = GONE; // (the shot is over: its sparks finish, its plasma is not drawn again)
	const d = best.dir, i = impacts[ impactCursor ];
	impactCursor = ( impactCursor + 1 ) % impacts.length;
	i.live = true; i.id = nextId ++; i.start = null; i.spawned = time;
	// where it struck: the surface ahead of the event point, else the touch point (8 units on) facing back at the shot
	let hit = null;
	if ( deps.pointInLeaf && cl.worldmodel != null ) {

		_acceptX = d[ 0 ]; _acceptY = d[ 1 ]; _acceptZ = d[ 2 ];
		hit = R_DecalSurface( cl.worldmodel, pos, 48, deps.pointInLeaf, facesShot );

	}
	if ( hit !== null ) {

		const toward = - ( d[ 0 ] * hit.nx + d[ 1 ] * hit.ny + d[ 2 ] * hit.nz ), t = Math.min( 48, hit.dist / Math.max( .2, toward ) );
		i.p[ 0 ] = pos[ 0 ] + d[ 0 ] * t; i.p[ 1 ] = pos[ 1 ] + d[ 1 ] * t; i.p[ 2 ] = pos[ 2 ] + d[ 2 ] * t;
		i.n[ 0 ] = hit.nx; i.n[ 1 ] = hit.ny; i.n[ 2 ] = hit.nz;

	} else {

		i.p[ 0 ] = pos[ 0 ] + d[ 0 ] * 8; i.p[ 1 ] = pos[ 1 ] + d[ 1 ] * 8; i.p[ 2 ] = pos[ 2 ] + d[ 2 ] * 8;
		i.n[ 0 ] = - d[ 0 ]; i.n[ 1 ] = - d[ 1 ]; i.n[ 2 ] = - d[ 2 ];

	}
	// the ring's plane: two unit axes across the normal
	const n = i.n;
	let ax = 0, ay = 0, az = 1;
	if ( Math.abs( n[ 2 ] ) > .9 ) { ax = 1; az = 0; }
	let ux = ay * n[ 2 ] - az * n[ 1 ], uy = az * n[ 0 ] - ax * n[ 2 ], uz = ax * n[ 1 ] - ay * n[ 0 ];
	const l = Math.hypot( ux, uy, uz ) || 1;
	ux /= l; uy /= l; uz /= l;
	i.u[ 0 ] = ux; i.u[ 1 ] = uy; i.u[ 2 ] = uz;
	i.v[ 0 ] = n[ 1 ] * uz - n[ 2 ] * uy; i.v[ 1 ] = n[ 2 ] * ux - n[ 0 ] * uz; i.v[ 2 ] = n[ 0 ] * uy - n[ 1 ] * ux;
	return true;

}

// writes one spark quad; false when the layer is full
function putSpark( x, y, z, size, r, g, b, life ) {

	if ( sparks.count >= sparks.capacity ) return false;
	const o = sparks.count * 4, A = sparks.arrays.aPosSize, C = sparks.arrays.aColor;
	A[ o ] = x; A[ o + 1 ] = y; A[ o + 2 ] = z; A[ o + 3 ] = size;
	C[ o ] = r; C[ o + 1 ] = g; C[ o + 2 ] = b; C[ o + 3 ] = life;
	sparks.count ++;
	return true;

}

// a bolt's glow sparks alive at `time`: one emitted every 1/45 s of its flight (the first after 1/45 s, as the
// source's accumulator), from where the bolt was then, never after it was last seen
function boltSparks( s, time ) {

	const g = STASIS.glow, K = STASIS.unit, last = Math.min( time, s.seen );
	const newest = Math.floor( ( last - s.born ) * g.rate ) - 1, oldest = Math.max( 0, Math.floor( ( time - s.born - g.life[ 1 ] ) * g.rate ) - 1 );
	const d = s.dir;
	// the bolt's own frame for the sideways offsets
	let ux = - d[ 1 ], uy = d[ 0 ], uz = 0;
	const ul = Math.hypot( ux, uy );
	if ( ul < 1e-4 ) { ux = 1; uy = 0; } else { ux /= ul; uy /= ul; }
	const wx = d[ 1 ] * uz - d[ 2 ] * uy, wy = d[ 2 ] * ux - d[ 0 ] * uz, wz = d[ 0 ] * uy - d[ 1 ] * ux;
	for ( let m = Math.max( 0, newest - STASIS.sparksPerBolt + 1, oldest ); m <= newest; m ++ ) {

		const emitted = s.born + ( m + 1 ) / g.rate, age = time - emitted;
		glowSpark( s.id, m, _spark );
		if ( age < 0 || age >= _spark[ 6 ] ) continue;
		const back = s.seen - emitted; // (the bolt was this long before its last sighting when it shed the spark)
		const cx = s.origin[ 0 ] - s.vel[ 0 ] * back, cy = s.origin[ 1 ] - s.vel[ 1 ] * back, cz = s.origin[ 2 ] - s.vel[ 2 ] * back;
		// source velocity (direction.x * u, v, w), source axes (x, y up, z) on Quake's (x, z, y)
		const vx = d[ 0 ] * _spark[ 3 ], vz = _spark[ 4 ], vy = _spark[ 5 ];
		const x = cx + ( d[ 0 ] * _spark[ 0 ] + ux * _spark[ 1 ] + wx * _spark[ 2 ] + vx * age ) * K;
		const y = cy + ( d[ 1 ] * _spark[ 0 ] + uy * _spark[ 1 ] + wy * _spark[ 2 ] + vy * age ) * K;
		const z = cz + ( d[ 2 ] * _spark[ 0 ] + uz * _spark[ 1 ] + wz * _spark[ 2 ] + vz * age ) * K;
		if ( ! putSpark( x, y, z, _spark[ 7 ] * K, g.color[ 0 ], g.color[ 1 ], g.color[ 2 ], 1 - age / _spark[ 6 ] ) ) return;

	}

}

/**
 * Every frame, after the scene's entities are listed (R_RenderView, beside the shotgun's frame): writes this frame's
 * bolts (every laser `R_StasisBoltTakes` took this frame), their glow sparks, and the live impacts' particles and
 * rings into the preallocated instance buffers. Builds the layers on first use and adds them to the scene. Shots not
 * drawn this frame end (their sparks finish their short lives); impacts end after 0.8 s; everything is dropped when
 * the clock jumps back more than 1 s, and outside Newer Game or with `r_stasisbolt` 0. Allocates nothing per frame
 * after the first build.
 *
 * @param {number} time client time, seconds (`cl.time`)
 * @param {?Array<number>} viewSize [width, height] of the render target in pixels (the sparks' one-pixel minimum)
 */
export function R_StasisBoltFrame( time, viewSize ) {

	const scene = deps?.scene;
	if ( ! scene ) return;
	if ( ! active() ) { R_StasisBoltClear(); stamp ++; return; }
	if ( time < lastTime - REWIND_DROP ) R_StasisBoltClear(); // (a demo loop, a new game)
	lastTime = time;
	let any = false;
	for ( const s of slots ) {

		if ( s.state === FLYING && s.stamp !== stamp ) s.state = GONE; // (not listed this frame: removed, or out of sight)
		if ( s.state === GONE && time - s.seen > Math.max( STASIS.glow.life[ 1 ], STASIS.match.window ) ) { s.state = FREE; s.ent = null; }
		if ( s.state !== FREE ) any = true;

	}
	for ( const i of impacts ) {

		if ( ! i.live ) continue;
		if ( i.start === null ) i.start = time; // (its clock starts on the first frame that draws it, as the Fireball's)
		if ( time - i.start > STASIS.impact.life[ 1 ] || i.start - time > REWIND_DROP ) i.live = false; else any = true;

	}
	if ( ! any ) { if ( group ) group.visible = false; stamp ++; return; }
	if ( group === null ) build();
	if ( group.parent !== scene ) scene.add( group );
	group.visible = true;

	const K = STASIS.unit, halfLength = STASIS.length * .5 * K;
	let bolts = 0;
	sparks.count = 0; rings.count = 0;
	for ( const s of slots ) {

		if ( s.state === FREE ) continue;
		if ( s.state === FLYING && bolts < plasma.capacity ) {

			const o = bolts * 4, C = plasma.arrays.aCenter, A = plasma.arrays.aAxis;
			C[ o ] = s.origin[ 0 ]; C[ o + 1 ] = s.origin[ 1 ]; C[ o + 2 ] = s.origin[ 2 ]; C[ o + 3 ] = s.phase;
			A[ o ] = s.dir[ 0 ]; A[ o + 1 ] = s.dir[ 1 ]; A[ o + 2 ] = s.dir[ 2 ]; A[ o + 3 ] = halfLength;
			bolts ++;

		}
		boltSparks( s, time );

	}
	const k = STASIS.impact;
	for ( const i of impacts ) {

		if ( ! i.live ) continue;
		const age = Math.max( 0, time - i.start );
		for ( let j = 0; j < k.count; j ++ ) {

			impactParticle( i.id, j, i.n[ 0 ], i.n[ 1 ], i.n[ 2 ], _particle );
			if ( age >= _particle[ 4 ] ) continue;
			particleOffset( age, _particle[ 0 ], _particle[ 1 ], _particle[ 2 ], k.gravity, k.drag, _offset );
			putSpark( i.p[ 0 ] + _offset[ 0 ] * K, i.p[ 1 ] + _offset[ 1 ] * K, i.p[ 2 ] + _offset[ 2 ] * K, _particle[ 3 ] * K,
				k.color[ 0 ], k.color[ 1 ], k.color[ 2 ], 1 - age / _particle[ 4 ] );

		}
		if ( age < k.ringLife && rings.count < rings.capacity ) {

			const ring = impactRing( age, _ring ), o = rings.count * 4, R = rings.arrays;
			// (half a unit off the surface, so the wall does not cut it)
			R.aCenterRadius[ o ] = i.p[ 0 ] + i.n[ 0 ] * .5; R.aCenterRadius[ o + 1 ] = i.p[ 1 ] + i.n[ 1 ] * .5; R.aCenterRadius[ o + 2 ] = i.p[ 2 ] + i.n[ 2 ] * .5;
			R.aCenterRadius[ o + 3 ] = ring[ 0 ] * K;
			R.aAxisU[ o ] = i.u[ 0 ]; R.aAxisU[ o + 1 ] = i.u[ 1 ]; R.aAxisU[ o + 2 ] = i.u[ 2 ]; R.aAxisU[ o + 3 ] = ring[ 1 ];
			R.aAxisV[ o ] = i.v[ 0 ]; R.aAxisV[ o + 1 ] = i.v[ 1 ]; R.aAxisV[ o + 2 ] = i.v[ 2 ]; R.aAxisV[ o + 3 ] = 0;
			rings.count ++;

		}

	}
	plasma.geometry.instanceCount = bolts; sparks.geometry.instanceCount = sparks.count; rings.geometry.instanceCount = rings.count;
	for ( const attribute of _instanced ) attribute.needsUpdate = true;
	plasma.mesh.material.uniforms.uTime.value = time;
	if ( viewSize ) sparks.mesh.material.uniforms.uResolution.value.set( viewSize[ 0 ], viewSize[ 1 ] );
	stamp ++;

}

/**
 * Diagnostic read-only view for tests and the browser trial.
 *
 * @returns {{ group: boolean, visible: boolean, tracked: number, flying: number, impacts: number, bolts: number, sparks: number, rings: number, centers: Array<Array<number>> }}
 * a fresh object: whether the layers are built and shown, the slots in use and flying, the live impacts, the instance
 * counts written last frame, and each drawn bolt's centre (Quake units)
 */
export function R_StasisBoltSnapshot() {

	const n = plasma?.geometry.instanceCount ?? 0, centers = [];
	for ( let b = 0; b < n; b ++ ) centers.push( Array.from( plasma.arrays.aCenter.subarray( b * 4, b * 4 + 3 ) ) );
	return { group: group !== null, visible: !! group?.visible, tracked: slots.filter( s => s.state !== FREE ).length,
		flying: slots.filter( s => s.state === FLYING ).length, impacts: impacts.filter( i => i.live ).length,
		bolts: n, sparks: sparks?.geometry.instanceCount ?? 0, rings: rings?.geometry.instanceCount ?? 0, centers };

}
