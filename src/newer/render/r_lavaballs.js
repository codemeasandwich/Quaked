/**
 * @module newer/render/r_lavaballs
 *
 * The supplied "FIREBALLS — Straight-flight FX Lab" fireball (the owner's "fire fan") drawn on Quake's flying lava balls.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// The owner-supplied page "FIREBALLS — Straight-flight FX Lab" (fireballs.html, SHA-256
// 9913ff9f...25ae, kept local, not distributed), drawn on Quake's own flying fireballs in Newer
// Game. Extraction map and provenance: newer/effects/lavaballs/provenance.json and
// docs/lavaballs-2026-10-11.md.
//
// What it draws on. Every flying fireball in Quake is an entity drawn with progs/lavaball.mdl:
// the lava balls misc_fireball throws out of lava pits (MOVETYPE_TOSS: they arc up and fall back
// under gravity, and are removed when they touch something or after 5 s) and the balls Chthon
// throws (boss.qc boss_missile: MOVETYPE_FLYMISSILE, 300 units/s, straight, exploding on contact).
// One native ball draws one supplied fireball. The source's "fan" is a scripted volley of four
// (fireballsPlan / burstPlan: four lanes, 120 ms apart); Quake decides how many balls there are and
// where they go, so neither the volley nor its straight-line planner is used: each ball's picture
// follows that ball's own interpolated origin, its direction is the ball's own motion this frame,
// and no projectile is added, moved or removed.
//
// Ownership. The server still owns the ball (motion, touch, damage, removal), cl_main.js its
// interpolated origin and its dynamic light (EF_ROCKET, radius 200), cl_tent.js Chthon's explosion
// (which r_fireball.js draws). This module only replaces the *picture*: the lava ball model is not
// drawn and its native trail (EF_ROCKET, which Newer otherwise turns into the r_smoketrails rocket
// smoke) is not spawned; the source's fireball, its flame-and-spark trail and, when the ball goes
// against a wall or floor, the source's small impact are drawn instead. Classic, the classic half of
// the split title demo, r_lavaballs 0, no scene, and more balls than the pool holds keep the native
// model and trail exactly as before. Nothing needs loading: the source's effect is procedural.
//
// How it is built. The fireball is the source's three crossed planes (3.6 x 1.8 source units, the
// head 0.15 ahead of the origin) with the source's FIREBALL_FRAGMENT, one instance per ball, turned
// along the ball's direction of travel; its trail and impact particles are the source's FxParticles
// emission constants, kept in fixed-size pools of typed arrays (the source's own design: oldest
// slot recycled) and drawn as camera-facing quads with the source's PARTICLE_FRAGMENT. Nothing is
// allocated per frame. Quake units per source unit are the explosion port's (FIREBALL.unit, 24),
// which also puts the source's flight speed (about 12.6 source units/s) on Chthon's 300 units/s.
import * as THREE from 'three';
import { cvar_t } from '../../engine/common/cvar.js';
import { hashJS } from './fx_math.js';
import { FIREBALL, MRT_OUT, MRT_ZERO, layer, material } from './r_fireball.js';
import { R_NewerGame } from '../mode.js';

// 0 puts the native lava ball model and its trail back
export const r_lavaballs = new cvar_t( 'r_lavaballs', '1' );

export const LAVABALL = Object.freeze( {
	models: Object.freeze( [ 'progs/lavaball.mdl' ] ),
	// shootFireballs() defaults of the source (size 0.42, power 1) at quality "high" (density 1)
	size: .42, power: 1, density: 1,
	// Quake units per source unit: the explosion port's (r_fireball.js FIREBALL.unit)
	unit: FIREBALL.unit,
	// _spawn: PlaneGeometry( 3.6, 1.8 ) translated -1.65 along the flight axis, three of them turned
	// i * 60 degrees about it, each with its own uPhase i * 5.1
	planeLength: 3.6, planeWidth: 1.8, planeShift: - 1.65, planes: 3, planePhase: 5.1,
	// _updateFireballs: the fireball grows from 0.3 of its size to all of it in (1 - 0.3) / 9 s
	growFrom: .3, growRate: 9,
	// _updateFireballs: trail particles per second per unit of size, and how far behind the ball (in sizes)
	trailRate: 480, trailBehind: 2.6, sparkShare: .23,
	// _impact: sparks per unit of size, smoke puffs per unit of size, the ring's life and size
	impactSparks: 65, impactSmoke: 12, ringLife: .35, ringSize: 1.6, ringCap: 20,
	// FxParticles capacities at quality "high"
	glowCap: 2200, smokeCap: 600,
	max: 64, // balls drawn at once; any more draw as the native model
	// a ball not seen for this long, or one that jumped this far in one frame, is a new ball
	forget: .25, jump: 256,
	dirRate: 25 // per second: how quickly the drawn direction turns onto the ball's motion (interpolation steps)
} );

const CONTENTS_SOLID = - 2;

// ---------------------------------------------------------------------------
// Shaders: the source's NOISE_GLSL, FIREBALL_FRAGMENT and PARTICLE_FRAGMENT, adapted to three's
// instanced ShaderMaterial and to Quaked's multiple-render-target pipeline (extra outputs written as
// zero, as in r_fireball.js). The source blends additively with (SRC_ALPHA, ONE); the shared
// material() blends premultiplied (ONE, ONE), so the light layers write rgb * alpha.
// ---------------------------------------------------------------------------

const NOISE_GLSL = `
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

// The three planes are baked into one geometry in the fireball's own frame (x along the flight, the
// planes turned about it); each instance carries its world position and scale and its direction.
const PLANE_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute float aPlanePhase;
attribute vec4 aPosScale,aDirPhase;
varying vec2 vUv;varying float vPhase;
void main(){
 vec3 d=normalize(aDirPhase.xyz);
 vec3 h=abs(d.z)<.99?vec3(0.,0.,1.):vec3(1.,0.,0.);
 vec3 u=normalize(cross(h,d)),v=cross(d,u);
 vec3 world=aPosScale.xyz+(d*position.x+u*position.y+v*position.z)*aPosScale.w;
 vec4 mvPosition=modelViewMatrix*vec4(world,1.);
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*mvPosition;
 vUv=uv;vPhase=aPlanePhase+aDirPhase.w;
}`;
const PLANE_FRAGMENT = `
#include <clipping_planes_pars_fragment>
uniform float uTime, uPower;
varying vec2 vUv;varying float vPhase;
${MRT_OUT}
${NOISE_GLSL}
void main(){
  #include <clipping_planes_fragment>
  float uPhase=vPhase;
  float x=vUv.x, y=(vUv.y-0.5)*2.0, t=uTime;
  float warp=fbm(vec3(x*6.0-t*6.5,y*3.0,t*1.3+uPhase));
  float cells=fbm(vec3(x*17.0-t*12.0,y*13.0+warp*3.0,t*2.0+uPhase));
  float tongues=sin(x*16.0-t*18.0+uPhase)*0.06+(warp-0.5)*0.26;
  float width=(0.045+0.55*pow(max(0.0,sin(x*3.14159265)),0.8))*(0.7+warp*0.65);
  float d=abs(y+tongues*(1.0-x));
  float radial=max(0.0,1.0-d/max(width,0.01));
  float edge=radial+(cells-0.48)*1.35;
  float axial=smoothstep(0.0,0.12,x)*(1.0-smoothstep(0.9,1.0,x));
  float body=smoothstep(0.08,0.61,edge)*axial;
  float ridges=0.5+0.5*sin(x*49.0-t*22.0+y*15.0+warp*8.0);
  float heat=clamp(radial*0.46+cells*0.6+ridges*0.18-0.19,0.0,1.0);
  vec3 col=mix(vec3(0.9,0.02,0.001),vec3(1.0,0.28,0.008),smoothstep(0.1,0.6,heat));
  col=mix(col,vec3(1.0,0.76,0.17),smoothstep(0.50,0.85,heat));
  float hot=exp(-d*d/max(0.001,width*width*0.022))*(0.45+cells*0.5)*smoothstep(0.32,0.9,x);
  col+=vec3(0.8,0.56,0.3)*hot;
  float glow=exp(-y*y*5.0)*max(0.0,sin(x*3.14159265))*0.05;
  vec4 src=vec4((col*body+vec3(1.0,0.13,0.008)*glow)*uPower,body*0.94+glow);
  gl_FragColor=vec4(src.rgb*clamp(src.a,0.,1.),0.);
  ${MRT_ZERO}
}`;

// The source draws its particles as GL points aSize world units across (PARTICLE_VERTEX: point size
// aSize * uPixelScale / depth, clamped to 1..180 px); here each is a camera-facing quad of the same
// size and the same clamp. vUV runs as gl_PointCoord does (y down).
const PARTICLE_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aPosSize,aInfo,aColor;
uniform float uViewHeight;
varying float vLife, vKind, vSeed;
varying vec3 vColor;varying vec2 vUV;
void main(){
 vLife=aInfo.x;vKind=aInfo.y;vSeed=aInfo.z;vColor=aColor.rgb;
 vec4 mv=modelViewMatrix*vec4(aPosSize.xyz,1.);
 float depth=max(1.,-mv.z),pixelScale=uViewHeight*.5*projectionMatrix[1][1];
 float px=clamp(aPosSize.w*pixelScale/depth,1.,180.);
 mv.xy+=position.xy*.5*px*depth/pixelScale;
 vec4 mvPosition=mv;
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*mv;
 vUV=vec2(position.x*.5+.5,.5-position.y*.5);
}`;
const particleFragment = additive => `
#include <clipping_planes_pars_fragment>
uniform float uTime;
varying float vLife, vKind, vSeed;
varying vec3 vColor;varying vec2 vUV;
${MRT_OUT}
${NOISE_GLSL}
void main(){
  #include <clipping_planes_fragment>
  vec2 p=vUV*2.0-1.0;
  float r=length(p); if(r>1.0||vLife<=0.0) discard;
  float fade=smoothstep(0.0,0.25,vLife);
  vec3 col=vColor; float alpha;
  if(vKind>2.5){
    float n=fbm(vec3(p*2.0,vSeed+uTime*0.4));
    alpha=pow(1.0-r,1.3)*fade*(0.2+n*0.35);
  }else if(vKind>0.5){
    float n=fbm(vec3(p*2.7+vec2(0,uTime*-2.0),vSeed));
    alpha=pow(max(0.0,1.0-r),1.1)*smoothstep(0.15,0.6,n)*fade;
    col=mix(col,vec3(1.0,0.64,0.12),pow(1.0-r,3.0)*vLife);
  }else{
    alpha=exp(-r*r*5.5)*fade;
    col+=vec3(0.3)*exp(-r*r*40.0);
  }
  gl_FragColor=${additive ? 'vec4(col*alpha,0.)' : 'vec4(col*alpha,alpha)'};
  ${MRT_ZERO}
}`;

// _ring of the source: a RingGeometry( 0.94, 1 ) facing the surface normal, MeshBasicMaterial 0xff982d,
// additive, opacity (1 - u) * 0.45, scale 0.1 + u * size.
const RING_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aCenterRadius,aNormalAlpha;
varying vec2 vP;varying float vAlpha;
void main(){
 vec3 n=normalize(aNormalAlpha.xyz);
 vec3 h=abs(n.z)<.99?vec3(0.,0.,1.):vec3(1.,0.,0.);
 vec3 u=normalize(cross(h,n)),v=cross(n,u);
 vec3 world=aCenterRadius.xyz+(u*position.x+v*position.y)*aCenterRadius.w;
 vec4 mvPosition=modelViewMatrix*vec4(world,1.);
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*mvPosition;
 vP=position.xy;vAlpha=aNormalAlpha.w;
}`;
const RING_FRAGMENT = `
#include <clipping_planes_pars_fragment>
varying vec2 vP;varying float vAlpha;
${MRT_OUT}
void main(){
 #include <clipping_planes_fragment>
 float r=length(vP),w=max(fwidth(r),1e-4);
 float band=smoothstep(.94-w,.94+w,r)*(1.-smoothstep(1.-w,1.+w,r));
 if(band<=0.)discard;
 gl_FragColor=vec4(vec3(1.,.596,.176)*band*vAlpha,0.);
 ${MRT_ZERO}
}`;

// (exported for tests: the source's statements are compared against these)
export const LAVABALL_SHADERS = Object.freeze( { plane: PLANE_FRAGMENT, glow: particleFragment( true ), smoke: particleFragment( false ), noise: NOISE_GLSL } );

// ---------------------------------------------------------------------------
// Particle pools: the source's FxParticles, as structure-of-arrays typed arrays (oldest slot recycled)
// ---------------------------------------------------------------------------

function pool( capacity ) {

	const f = () => new Float32Array( capacity );
	return { capacity, cursor: 0, alive: 0,
		x: f(), y: f(), z: f(), vx: f(), vy: f(), vz: f(), age: f(), life: f(), gravity: f(), drag: f(),
		size: f(), grow: f(), kind: f(), seed: f(), r: f(), g: f(), b: f() };

}

// FxParticles.emit, with scalars (world space, Quake units; size and speeds already scaled by the unit)
function emit( P, x, y, z, vx, vy, vz, r, g, b, size, life, gravity, drag, grow, kind ) {

	const i = P.cursor; P.cursor = ( i + 1 ) % P.capacity;
	P.x[ i ] = x; P.y[ i ] = y; P.z[ i ] = z; P.vx[ i ] = vx; P.vy[ i ] = vy; P.vz[ i ] = vz;
	P.r[ i ] = r; P.g[ i ] = g; P.b[ i ] = b; P.size[ i ] = size; P.life[ i ] = life; P.age[ i ] = 0;
	P.gravity[ i ] = gravity; P.drag[ i ] = drag; P.grow[ i ] = grow; P.kind[ i ] = kind; P.seed[ i ] = Math.random() * 30;

}

// FxParticles.update (without the lab's floor bounce: Quake has its own floors), writing the live
// particles into the layer's instance arrays. Returns the number written.
function step( P, dt, L ) {

	const K = LAVABALL.unit, A = L.arrays.aPosSize, I = L.arrays.aInfo, C = L.arrays.aColor;
	let n = 0;
	for ( let i = 0; i < P.capacity; i ++ ) {

		if ( P.life[ i ] === 0 ) continue;
		P.age[ i ] += dt;
		if ( P.age[ i ] >= P.life[ i ] ) { P.life[ i ] = 0; continue; }
		const damp = Math.exp( - P.drag[ i ] * dt );
		P.vx[ i ] *= damp; P.vy[ i ] *= damp; P.vz[ i ] *= damp; P.vz[ i ] -= P.gravity[ i ] * dt;
		P.x[ i ] += P.vx[ i ] * dt; P.y[ i ] += P.vy[ i ] * dt; P.z[ i ] += P.vz[ i ] * dt;
		if ( n >= L.capacity ) continue;
		const o = n * 4;
		A[ o ] = P.x[ i ]; A[ o + 1 ] = P.y[ i ]; A[ o + 2 ] = P.z[ i ];
		A[ o + 3 ] = Math.max( .002 * K, P.size[ i ] + P.grow[ i ] * P.age[ i ] );
		I[ o ] = 1 - P.age[ i ] / P.life[ i ]; I[ o + 1 ] = P.kind[ i ]; I[ o + 2 ] = P.seed[ i ]; I[ o + 3 ] = 0;
		C[ o ] = P.r[ i ]; C[ o + 1 ] = P.g[ i ]; C[ o + 2 ] = P.b[ i ]; C[ o + 3 ] = 1;
		n ++;

	}
	P.alive = n;
	return n;

}

function clearPool( P ) { P.life.fill( 0 ); P.alive = 0; P.cursor = 0; }

const rand = ( a, b ) => a + Math.random() * ( b - a );

// ---------------------------------------------------------------------------
// Ball slots: one per native ball being drawn, found by entity number
// ---------------------------------------------------------------------------

const MAX = LAVABALL.max;
const slotKey = new Int32Array( MAX ).fill( - 1 );
const slotSeen = new Int32Array( MAX );          // the frame (`frame`) that last registered the ball
const slotHasDir = new Uint8Array( MAX );
const slotCur = new Float32Array( MAX * 3 );     // origin registered this frame
const slotLast = new Float32Array( MAX * 3 );    // origin drawn last frame
const slotDir = new Float32Array( MAX * 3 );     // drawn direction of travel (unit)
const slotStep = new Float32Array( MAX * 3 );    // last frame's displacement
const slotBorn = new Float64Array( MAX );        // client time first drawn
const slotLastTime = new Float64Array( MAX );    // client time last drawn
const slotTravel = new Float32Array( MAX );      // source units travelled since first drawn
const slotEmit = new Float32Array( MAX );        // trail emission carry
const slotPhase = new Float32Array( MAX );
let frame = 0, deps = null, lastTime = 0, held = false; // (held: something may be kept that leaving Newer must drop)

const rings = new Float32Array( LAVABALL.ringCap * 8 ); // x, y, z, nx, ny, nz, age, size
let ringCount = 0;
const glowPool = pool( LAVABALL.glowCap ), smokePool = pool( LAVABALL.smokeCap );

/**
 * Hands the module the scene its layers join and a contents probe; R_NewMap (gl_rmain.js) at each map load.
 *
 * @param {{ scene: THREE.Scene, contents?: function(Array<number>): (number|undefined) }} externals the scene; the BSP
 * contents at a point (Mod_PointInLeaf of the world), used to tell a ball that went against a wall or floor from one
 * that left view or expired. Kept until the next call
 */
export function R_LavaBallsSetup( externals ) { deps = externals; }

/**
 * Starts the frame's registry: gl_rmain.js before the entity list is drawn each frame. A ball not registered again by
 * `R_LavaBall` before `R_LavaBallsFlush` has gone.
 */
export function R_LavaBallsBegin() { frame ++; }

/**
 * Does the supplied fireball draw this model (used for its native trail as well as its mesh): Newer Game, outside the
 * classic pass, r_lavaballs on, a scene, and progs/lavaball.mdl. Asked by render.js R_RocketTrail for every EF_ROCKET
 * trail segment and by `R_LavaBall`.
 *
 * @param {?Object} model the entity's model (`name` is read)
 * @returns {boolean} true when the native lava ball picture (model and trail) must not be drawn
 */
export function R_LavaBallTakes( model ) {

	return model != null && deps != null && deps.scene != null && r_lavaballs.value !== 0 && R_NewerGame() && LAVABALL.models.includes( model.name );

}

/**
 * Called while the entity list is drawn (R_DrawAliasModel), once per alias entity: registers a lava ball for this
 * frame's `R_LavaBallsFlush`, at its interpolated origin, under its entity number. Allocates nothing.
 *
 * @param {entity_t} e entity being drawn (`model`, `origin` in Quake units, `_entityIndex` its entity number)
 * @returns {boolean} true when the supplied fireball takes the entity and its native model must not be drawn; false
 * (native model as before) for Classic, the classic pass, r_lavaballs 0, another model, an entity without a number or
 * origin, or a full pool (64 balls)
 */
export function R_LavaBall( e ) {

	if ( e == null || ! R_LavaBallTakes( e.model ) || e.origin == null ) return false;
	const key = e._entityIndex;
	if ( ! Number.isInteger( key ) || key < 0 ) return false;
	let s = - 1, free = - 1;
	for ( let i = 0; i < MAX; i ++ ) {

		if ( slotKey[ i ] === key ) { s = i; break; }
		if ( free < 0 && slotKey[ i ] < 0 ) free = i;

	}
	if ( s < 0 ) {

		if ( free < 0 ) return false;
		s = free; slotKey[ s ] = key; slotHasDir[ s ] = 0; slotBorn[ s ] = - 1;

	}
	slotSeen[ s ] = frame;
	slotCur[ s * 3 ] = e.origin[ 0 ]; slotCur[ s * 3 + 1 ] = e.origin[ 1 ]; slotCur[ s * 3 + 2 ] = e.origin[ 2 ];
	return true;

}

function release( s ) { slotKey[ s ] = - 1; slotHasDir[ s ] = 0; }

// _ring of the source
function ring( x, y, z, nx, ny, nz, size ) {

	if ( ringCount >= LAVABALL.ringCap ) return;
	const o = ringCount ++ * 8;
	rings[ o ] = x; rings[ o + 1 ] = y; rings[ o + 2 ] = z; rings[ o + 3 ] = nx; rings[ o + 4 ] = ny; rings[ o + 5 ] = nz;
	rings[ o + 6 ] = 0; rings[ o + 7 ] = size;

}

// _impact of the source at (x, y, z) with the normal n (the source's fallback, against the direction of travel).
// Source axes (x, y up, z) are Quake's (x, z up, y).
function impact( x, y, z, nx, ny, nz ) {

	const K = LAVABALL.unit, scale = LAVABALL.size, count = Math.max( 3, Math.floor( LAVABALL.impactSparks * LAVABALL.density * scale ) );
	for ( let i = 0; i < count; i ++ ) {

		const s = rand( 1.5, 6 ) * Math.sqrt( scale );
		emit( glowPool, x, y, z, ( nx * s + rand( - 1.5, 1.5 ) ) * K, ( ny * s + rand( - 2, 2 ) ) * K, ( nz * s + rand( 0, 2.5 ) ) * K,
			1, .27, .025, rand( .025, .085 ) * Math.max( .55, scale ) * K, rand( .3, .8 ), 6 * K, 1, 0, 0 );

	}
	ring( x, y, z, nx, ny, nz, LAVABALL.ringSize * scale );
	for ( let i = 0; i < Math.ceil( LAVABALL.impactSmoke * scale ); i ++ ) {

		emit( smokePool, x, y, z, ( nx * .5 + rand( - .2, .2 ) ) * K, ( ny * .5 + rand( - .4, .4 ) ) * K, rand( .7, 1.5 ) * K,
			.14, .12, .105, rand( .3, .6 ) * scale * K, rand( .7, 1.5 ), 0, 0, .6 * scale * K, 3 );

	}

}

// Did the ball go against something solid: the contents just ahead of where it was last drawn
function struck( s ) {

	if ( ! deps?.contents ) return false;
	const o = s * 3;
	for ( const k of _probe ) {

		_point[ 0 ] = slotLast[ o ] + slotStep[ o ] * k + slotDir[ o ] * 8 * ( k > 0 ? 1 : 0 );
		_point[ 1 ] = slotLast[ o + 1 ] + slotStep[ o + 1 ] * k + slotDir[ o + 1 ] * 8 * ( k > 0 ? 1 : 0 );
		_point[ 2 ] = slotLast[ o + 2 ] + slotStep[ o + 2 ] * k + slotDir[ o + 2 ] * 8 * ( k > 0 ? 1 : 0 );
		if ( deps.contents( _point ) === CONTENTS_SOLID ) return true;

	}
	return false;

}
const _probe = Object.freeze( [ 0, .5, 1, 1.5 ] ), _point = [ 0, 0, 0 ];

// _updateFireballs trail emission for one ball over dt. Source axes (x, y up, z) are Quake's (x, z up, y).
function trail( s, dt ) {

	const K = LAVABALL.unit, size = LAVABALL.size, o = s * 3;
	const dx = slotDir[ o ], dy = slotDir[ o + 1 ], dz = slotDir[ o + 2 ];
	slotEmit[ s ] += dt * LAVABALL.trailRate * LAVABALL.density * size;
	while ( slotEmit[ s ] >= 1 ) {

		slotEmit[ s ] --;
		const behind = rand( 0, Math.min( slotTravel[ s ], LAVABALL.trailBehind * size ) ) * K;
		const px = slotLast[ o ] - dx * behind + rand( - .1, .1 ) * size * K;
		const py = slotLast[ o + 1 ] - dy * behind + rand( - .16, .16 ) * size * K;
		const pz = slotLast[ o + 2 ] - dz * behind + rand( - .16, .16 ) * size * K;
		const spark = Math.random() < LAVABALL.sparkShare, ahead = rand( .15, .6 );
		// (the source drifts each particle forward along its flight, up a little, and sideways a little)
		emit( glowPool, px, py, pz, dx * ahead * K, ( dy * ahead + rand( - .18, .18 ) ) * K, ( dz * ahead + rand( .08, .5 ) ) * K,
			1, spark ? .52 : rand( .1, .29 ), spark ? .1 : .01,
			( spark ? rand( .017, .028 ) : rand( .18, .44 ) * size ) * K, spark ? rand( .25, .55 ) : rand( .18, .34 ),
			( spark ? .7 : - .2 ) * K, 0, spark ? 0 : .08 * K, spark ? 0 : 1 );

	}

}

// ---------------------------------------------------------------------------
// Renderer layers
// ---------------------------------------------------------------------------

export const LAVABALL_ORDER = Object.freeze( { smoke: 6, ring: 7, plane: 8, glow: 9 } );
let group = null, planeLayer = null, glowLayer = null, smokeLayer = null, ringLayer = null;
const instanced = [];

function planeGeometry() {

	const L = LAVABALL, pos = [], uv = [], phase = [], index = [];
	for ( let i = 0; i < L.planes; i ++ ) {

		const a = i * Math.PI / 3, c = Math.cos( a ), s = Math.sin( a ), base = i * 4;
		for ( const [ u, v ] of [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ] ) {

			const x = ( u - .5 ) * L.planeLength + L.planeShift, y = ( v - .5 ) * L.planeWidth;
			pos.push( x, y * c, y * s ); uv.push( u, v ); phase.push( i * L.planePhase );

		}
		index.push( base, base + 1, base + 2, base, base + 2, base + 3 );

	}
	const g = new THREE.InstancedBufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	g.setAttribute( 'aPlanePhase', new THREE.Float32BufferAttribute( phase, 1 ) );
	g.setIndex( index );
	g.instanceCount = 0;
	return g;

}

function build() {

	const resolution = { value: 720 };
	glowLayer = layer( 'lavaball_glow', LAVABALL.glowCap, { aPosSize: 4, aInfo: 4, aColor: 4 },
		material( PARTICLE_VERTEX, particleFragment( true ), { uTime: { value: 0 }, uViewHeight: resolution }, THREE.AdditiveBlending ), LAVABALL_ORDER.glow );
	smokeLayer = layer( 'lavaball_smoke', LAVABALL.smokeCap, { aPosSize: 4, aInfo: 4, aColor: 4 },
		material( PARTICLE_VERTEX, particleFragment( false ), { uTime: { value: 0 }, uViewHeight: resolution }, THREE.NormalBlending ), LAVABALL_ORDER.smoke );
	ringLayer = layer( 'lavaball_rings', LAVABALL.ringCap, { aCenterRadius: 4, aNormalAlpha: 4 },
		material( RING_VERTEX, RING_FRAGMENT, {}, THREE.AdditiveBlending ), LAVABALL_ORDER.ring );
	// the fireball planes: the shared layer's arrays and flags over the three-plane geometry
	planeLayer = layer( 'lavaball_fireballs', MAX, { aPosScale: 4, aDirPhase: 4 },
		material( PLANE_VERTEX, PLANE_FRAGMENT, { uTime: { value: 0 }, uPower: { value: LAVABALL.power } }, THREE.AdditiveBlending ), LAVABALL_ORDER.plane );
	const planes = planeGeometry();
	for ( const [ name, attribute ] of Object.entries( planeLayer.geometry.attributes ) ) if ( attribute.isInstancedBufferAttribute ) planes.setAttribute( name, attribute );
	planeLayer.geometry.dispose(); planeLayer.geometry = planes; planeLayer.mesh.geometry = planes;
	instanced.length = 0;
	for ( const l of [ planeLayer, glowLayer, smokeLayer, ringLayer ] ) for ( const a of Object.values( l.geometry.attributes ) ) if ( a.isInstancedBufferAttribute ) instanced.push( a );
	group = new THREE.Group(); group.name = 'quake_lavaballs'; group.userData.newerOnly = true;
	for ( const l of [ smokeLayer, ringLayer, planeLayer, glowLayer ] ) group.add( l.mesh );

}

function hide() {

	if ( group === null ) return;
	group.visible = false;
	for ( const l of [ planeLayer, glowLayer, smokeLayer, ringLayer ] ) l.geometry.instanceCount = 0;

}

/**
 * Forgets every ball, particle and ring and hides the layers: R_NewMap after `R_LavaBallsSetup`, and whenever Newer
 * Game is left or the clock jumps back (a demo loop, a new game).
 */
export function R_LavaBallsClear() {

	slotKey.fill( - 1 ); slotHasDir.fill( 0 );
	clearPool( glowPool ); clearPool( smokePool ); ringCount = 0; lastTime = 0; held = false;
	hide();

}

/**
 * Every frame, after the entity list has been drawn (so the registry is this frame's): moves each registered ball's
 * picture to its origin and turns it along its motion, emits its trail, gives a ball that went against something solid
 * the source's impact and forgets every ball not registered this frame, steps the particles and rings, and writes all
 * of it into the preallocated instance buffers. Builds the layers and adds them to the scene on first use; hides them
 * when there is nothing to draw. Outside Newer Game everything is dropped. Allocates nothing per frame after the build.
 *
 * @param {number} time client time, seconds (`cl.time`)
 * @param {?ArrayLike<number>} viewSize [width, height] of the 3D view in pixels, for the particle size clamp
 */
export function R_LavaBallsFlush( time, viewSize ) {

	const scene = deps?.scene;
	if ( ! scene ) return;
	if ( ! R_NewerGame() || r_lavaballs.value === 0 ) { if ( held ) R_LavaBallsClear(); return; }
	if ( time < lastTime - 1 ) R_LavaBallsClear(); // the clock jumped back
	held = true;
	const dt = lastTime > 0 ? Math.min( .1, Math.max( 0, time - lastTime ) ) : 0;
	lastTime = time;
	const K = LAVABALL.unit, turn = 1 - Math.exp( - dt * LAVABALL.dirRate );
	let balls = 0;
	for ( let s = 0; s < MAX; s ++ ) {

		if ( slotKey[ s ] < 0 ) continue;
		const o = s * 3;
		if ( slotSeen[ s ] !== frame ) {

			// gone this frame: the source's impact when it went against a wall or floor (a ball that left view or
			// expired in the air just goes, as the native one does)
			if ( slotHasDir[ s ] === 1 && struck( s ) ) impact( slotLast[ o ], slotLast[ o + 1 ], slotLast[ o + 2 ], - slotDir[ o ], - slotDir[ o + 1 ], - slotDir[ o + 2 ] );
			release( s );
			continue;

		}
		const mx = slotCur[ o ] - slotLast[ o ], my = slotCur[ o + 1 ] - slotLast[ o + 1 ], mz = slotCur[ o + 2 ] - slotLast[ o + 2 ];
		const moved = Math.hypot( mx, my, mz );
		if ( slotBorn[ s ] < 0 || time - slotLastTime[ s ] > LAVABALL.forget || moved > LAVABALL.jump ) {

			// a new ball (or one back in view after a while): it starts here, its direction not yet known
			slotBorn[ s ] = time; slotTravel[ s ] = 0; slotEmit[ s ] = 0; slotHasDir[ s ] = 0;
			slotPhase[ s ] = hashJS( slotKey[ s ] * .37 + time ) * 97;
			slotStep[ o ] = slotStep[ o + 1 ] = slotStep[ o + 2 ] = 0;

		} else if ( moved > 1e-3 ) {

			const nx = mx / moved, ny = my / moved, nz = mz / moved;
			if ( slotHasDir[ s ] === 0 ) { slotDir[ o ] = nx; slotDir[ o + 1 ] = ny; slotDir[ o + 2 ] = nz; slotHasDir[ s ] = 1; } else {

				let x = slotDir[ o ] + ( nx - slotDir[ o ] ) * turn, y = slotDir[ o + 1 ] + ( ny - slotDir[ o + 1 ] ) * turn, z = slotDir[ o + 2 ] + ( nz - slotDir[ o + 2 ] ) * turn;
				const l = Math.hypot( x, y, z );
				if ( l > 1e-6 ) { x /= l; y /= l; z /= l; } else { x = nx; y = ny; z = nz; }
				slotDir[ o ] = x; slotDir[ o + 1 ] = y; slotDir[ o + 2 ] = z;

			}
			slotTravel[ s ] += moved / K;
			slotStep[ o ] = mx; slotStep[ o + 1 ] = my; slotStep[ o + 2 ] = mz;

		}
		slotLast[ o ] = slotCur[ o ]; slotLast[ o + 1 ] = slotCur[ o + 1 ]; slotLast[ o + 2 ] = slotCur[ o + 2 ];
		slotLastTime[ s ] = time;
		if ( slotHasDir[ s ] === 0 ) continue; // (drawn from the first frame its direction of travel is known)
		trail( s, dt );
		balls ++;

	}
	// step the rings (the source's: scale 0.1 + u * size, opacity (1 - u) * 0.45 over its life)
	let live = 0;
	for ( let r = 0; r < ringCount; r ++ ) {

		const o = r * 8;
		rings[ o + 6 ] += dt;
		if ( rings[ o + 6 ] >= LAVABALL.ringLife ) continue;
		if ( live !== r ) for ( let k = 0; k < 8; k ++ ) rings[ live * 8 + k ] = rings[ o + k ];
		live ++;

	}
	ringCount = live;
	const nothing = balls === 0 && ringCount === 0 && glowPool.alive === 0 && smokePool.alive === 0;
	if ( nothing && group === null ) return;
	if ( group === null ) build();
	if ( group.parent !== scene ) scene.add( group );

	// the fireballs: the source's three planes at the ball, along its motion, grown in over ~78 ms
	const A = planeLayer.arrays.aPosScale, D = planeLayer.arrays.aDirPhase;
	let n = 0;
	for ( let s = 0; s < MAX; s ++ ) {

		if ( slotKey[ s ] < 0 || slotHasDir[ s ] === 0 ) continue;
		const o = s * 3, c = n * 4;
		A[ c ] = slotLast[ o ]; A[ c + 1 ] = slotLast[ o + 1 ]; A[ c + 2 ] = slotLast[ o + 2 ];
		A[ c + 3 ] = LAVABALL.size * Math.min( 1, LAVABALL.growFrom + ( time - slotBorn[ s ] ) * LAVABALL.growRate ) * K;
		D[ c ] = slotDir[ o ]; D[ c + 1 ] = slotDir[ o + 1 ]; D[ c + 2 ] = slotDir[ o + 2 ]; D[ c + 3 ] = slotPhase[ s ];
		n ++;

	}
	planeLayer.geometry.instanceCount = n;
	glowLayer.geometry.instanceCount = step( glowPool, dt, glowLayer );
	smokeLayer.geometry.instanceCount = step( smokePool, dt, smokeLayer );
	const R = ringLayer.arrays;
	for ( let r = 0; r < ringCount; r ++ ) {

		const o = r * 8, c = r * 4, u = Math.min( 1, rings[ o + 6 ] / LAVABALL.ringLife );
		R.aCenterRadius[ c ] = rings[ o ]; R.aCenterRadius[ c + 1 ] = rings[ o + 1 ]; R.aCenterRadius[ c + 2 ] = rings[ o + 2 ];
		R.aCenterRadius[ c + 3 ] = ( .1 + u * rings[ o + 7 ] ) * K;
		R.aNormalAlpha[ c ] = rings[ o + 3 ]; R.aNormalAlpha[ c + 1 ] = rings[ o + 4 ]; R.aNormalAlpha[ c + 2 ] = rings[ o + 5 ]; R.aNormalAlpha[ c + 3 ] = ( 1 - u ) * .45;

	}
	ringLayer.geometry.instanceCount = ringCount;
	for ( const a of instanced ) a.needsUpdate = true;
	planeLayer.mesh.material.uniforms.uTime.value = time;
	glowLayer.mesh.material.uniforms.uTime.value = time; smokeLayer.mesh.material.uniforms.uTime.value = time;
	if ( viewSize ) glowLayer.mesh.material.uniforms.uViewHeight.value = Math.max( 1, viewSize[ 1 ] );
	group.visible = n + glowLayer.geometry.instanceCount + smokeLayer.geometry.instanceCount + ringCount > 0;

}

/**
 * Diagnostic read-only view for tests and the browser trial.
 *
 * @returns {{ balls: number, drawn: number, glow: number, smoke: number, rings: number, group: boolean, visible: boolean,
 * keys: Array<number>, positions: Array<Array<number>>, directions: Array<Array<number>> }} a fresh object: balls held, fireballs, glow and smoke particles and rings
 * written last frame, whether the layers exist and are visible, and each held ball's entity number, drawn origin and
 * direction (Quake units; a direction of null while unknown)
 */
export function R_LavaBallsSnapshot() {

	const keys = [], positions = [], directions = [];
	for ( let s = 0; s < MAX; s ++ ) {

		if ( slotKey[ s ] < 0 ) continue;
		keys.push( slotKey[ s ] ); positions.push( [ slotLast[ s * 3 ], slotLast[ s * 3 + 1 ], slotLast[ s * 3 + 2 ] ] );
		directions.push( slotHasDir[ s ] ? [ slotDir[ s * 3 ], slotDir[ s * 3 + 1 ], slotDir[ s * 3 + 2 ] ] : null );

	}
	return { balls: keys.length, drawn: planeLayer?.geometry.instanceCount ?? 0, glow: glowLayer?.geometry.instanceCount ?? 0,
		smoke: smokeLayer?.geometry.instanceCount ?? 0, rings: ringLayer?.geometry.instanceCount ?? 0,
		group: group !== null, visible: group?.visible ?? false, keys, positions, directions };

}
