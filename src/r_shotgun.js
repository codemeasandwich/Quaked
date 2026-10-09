// Shotgun pellets and underwater bubbles: the owner-supplied ARC weapon-effects example
// (arc-weapons-wall-canvas-shotgun.html, SHA-256 8b156922...adf, kept local), class ShotgunEffect.
// Source lines (of the hashed file): SHOTGUN_PRESETS 332, SHOTGUN_PELLET_MOTION 340, vertex shader 348,
// fragment shader 402, sgRandom 461, sgDistance / sgTimeAt 463-464, fire 499-541, _addBubble 542, update
// 553-581, _pelletTrailLength 590, render 599-629. Extraction map and provenance:
// newer/effects/shotgun/provenance.json and docs/shotgun-pellets-2026-10-08.md.
//
// What it draws. For every blast of the stock shotgun or super shotgun fired by the local player in Newer
// Game, and of the soldiers' shotguns (4 pellets) in the same single-player game, each native pellet ray
// (sv_shotrays.js: where the game's own trace started and stopped) gets the supplied pellet: a short,
// tapered, softly glowing streak that travels from the gun's muzzle along the ray to where the ray stopped,
// at twice the supplied speed (shotgun_flight.js). In water the pellet slows and leaves the supplied wake of
// small bubbles, and a few bubbles escape the muzzle; the bubbles detach, lose their forward drift and rise.
//
// What is the game's and what is the picture's. The rays, their count and spread, the random numbers, the
// ammunition and the cadence are the game's and are not touched. Since 8 Oct 2026 the damage of a pellet is
// dealt when its pellet arrives (sv_shotdelay.js), so what is seen and what hurts agree; this file only
// draws, using the same flight function the server waits on, and nothing here feeds back.
//
// What is the source's and what is adapted.
//  * Kinematics (analytic in time, so the same at any frame rate and frozen by pause), streak and bubble
//    shapes and shaders, the 16 ms shutter slice, speed variation and bubble spacing: the source's, in
//    source units; one source unit is 24 Quake units (as the Fireball and the smoke trails use). Speed is
//    doubled and there is no range cap (see shotgun_flight.js).
//  * Direction, count and where a pellet ends come from the native rays, not from the source's own spread
//    (the demo's 9 pellets a barrel, 1.15 s cadence and RNG are not used). A blast has the native 6
//    (shotgun) or 14 (super shotgun); the super shotgun's alternate between its two barrels.
//  * Water. The source has one underwater switch per shot; a real ray can cross a surface, so each pellet
//    flies at air speed through the air and at water speed with drag through the water, and leaves bubbles
//    only while it is in water.
//  * The muzzle is the front of the viewmodel's own geometry (viewModelMuzzles), not the player's origin.
// The source's muzzle flash and impact kinds are not drawn here. In air each barrel also leaves the source's three tiny
// delayed smoke wisps in the world at the muzzle where the shot was fired (card [30b]); under water there is none.
import * as THREE from 'three';
import { cvar_t } from './cvar.js';
import { R_NewerGame } from './r_anim.js';
import { SV_FaceDrain } from './sv_faceevents.js';
import { MRT_OUT, MRT_ZERO, layer, material } from './r_fireball.js';
const CONTENTS_WATER = - 3, CONTENTS_SLIME = - 4; // (bspfile.js; lava is not water)
import { R_ImpactSegment, STRENGTH } from './r_impactripples.js';
import { SHOTGUN, sgRandom, clamp, pelletDistance, pelletTimeAt, pelletInWater, pelletTrailLength, makePellet, pelletDraws, pelletStream } from './shotgun_flight.js';

// (the flight maths is shotgun_flight.js, shared with the server's damage schedule; re-exported for the tests)
export { SHOTGUN, sgRandom, pelletDistance, pelletTimeAt, pelletInWater, pelletTrailLength, makePellet, pelletDraws, pelletStream };

// 0 draws no pellets, bubbles or smoke
export const r_shotgunfx = new cvar_t( 'r_shotgunfx', '1' );
const K = SHOTGUN.unit;

// _addBubble, line 545: a detached bubble. `dir` is the Quake direction (only its horizontal part is used);
// positions are Quake units, motion in source units as the source has it.
export function makeBubble( position, dir, born, seed, scale = 1 ) {

	const random = sgRandom( Math.floor( seed * 1e8 ) );
	const life = 1.35 + random() * .95, radius = ( .010 + random() * .010 ) * scale, rise = .25 + random() * .22, s = random() * Math.PI * 2, drift = .06 + random() * .07;
	return { ox: position[ 0 ], oy: position[ 1 ], oz: position[ 2 ], dx: dir[ 0 ], dy: dir[ 1 ], born, life, radius, rise, seed: s, drift, x: position[ 0 ], y: position[ 1 ], z: position[ 2 ] };

}
// update() of the source for a bubble: where it is `a` seconds after birth, in Quake units (source +Y is Quake +Z)
export function bubbleAt( b, a, out ) {

	const settle = ( 1 - Math.exp( - a * 5 ) ) * b.drift, wobble = .018 * Math.sin( a * 4.2 + b.seed ) - .018 * Math.sin( b.seed );
	out[ 0 ] = b.ox + K * ( b.dx * settle + wobble );
	out[ 1 ] = b.oy + K * ( b.dy * settle + Math.sin( a * 2.7 ) * .009 );
	out[ 2 ] = b.oz + K * ( b.rise * a + .06 * a * a );
	return out;

}

// fire() of the source, line 532: the tiny delayed wisps of a shot in air, three for each barrel, anchored in the
// world at the muzzle where the shot was fired (not to the recoiling gun or its later aim). `axis` is the barrel's
// shot direction (Quake unit vector), `cosmetic` the barrel's stream of cosmetic draws (four per wisp, in the
// source's order: life, radius, seed, drift). Positions in Quake units; the rest in the source's units.
export function makeSmoke( origin, axis, born, cosmetic ) {

	const list = [];
	for ( let i = 0; i < SHOTGUN.smokePerBarrel; i ++ ) {

		const ahead = ( .025 + i * .017 ) * K, life = .55 + cosmetic() * .24, radius = .036 + cosmetic() * .014, seed = cosmetic() * 30, drift = ( cosmetic() - .5 ) * .035;
		list.push( { ox: origin[ 0 ] + axis[ 0 ] * ahead, oy: origin[ 1 ] + axis[ 1 ] * ahead, oz: origin[ 2 ] + axis[ 2 ] * ahead, born: born + .026 + i * .047, life, radius, seed, drift } );

	}
	return list;

}
// render() of the source, line 608: where a wisp is `a` seconds after birth (source +Y is Quake +Z, source +Z is Quake +Y),
// its radius, its upward motion (all in Quake units) and its opacity. The climb (the .18 a second and the stretch of
// the quad along it) is multiplied by SHOTGUN.smokeRise = .5: the owner asked for half the height.
export function smokeAt( s, a, out ) {

	out.x = s.ox + K * ( s.drift * a + Math.sin( a * 6 + s.seed ) * .012 * a );
	out.y = s.oy + K * ( a * .05 );
	out.z = s.oz + K * ( a * .18 * SHOTGUN.smokeRise );
	out.radius = ( s.radius + a * .045 ) * K;
	out.rise = ( .035 + a * .05 ) * SHOTGUN.smokeRise * K;
	out.alpha = .19 * Math.sin( clamp( a / s.life, 0, 1 ) * Math.PI );
	return out;

}

// ---------------------------------------------------------------------------
// Muzzle: the front of the viewmodel
// ---------------------------------------------------------------------------

const muzzleCache = new WeakMap();
const _v = new THREE.Vector3();

// The muzzle point(s) of a viewmodel in world space: `count` 1 gives the centre of the model's forward-most
// vertices, 2 gives the left and right barrels (the front vertices split by side). Quake models face +X.
// `template` is the alias template (posAttr in the model's own coordinates); the mesh is a child of the scene.
export function viewModelMuzzles( mesh, template, count ) {

	if ( ! mesh || ! template?.posAttr ) return null;
	let local = muzzleCache.get( template );
	if ( local === undefined ) {

		const P = template.posAttr.array;
		let lo = Infinity, hi = - Infinity;
		for ( let i = 0; i < P.length; i += 3 ) { if ( P[ i ] < lo ) lo = P[ i ]; if ( P[ i ] > hi ) hi = P[ i ]; }
		const cut = hi - Math.max( .04 * ( hi - lo ), 1e-6 );
		let n = 0, cx = 0, cy = 0, cz = 0;
		for ( let i = 0; i < P.length; i += 3 ) if ( P[ i ] >= cut ) { n ++; cx += P[ i ]; cy += P[ i + 1 ]; cz += P[ i + 2 ]; }
		if ( n === 0 ) return null;
		cx /= n; cy /= n; cz /= n;
		const side = [ [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ] ];
		for ( let i = 0; i < P.length; i += 3 ) if ( P[ i ] >= cut ) { const s = side[ P[ i + 1 ] >= cy ? 1 : 0 ]; s[ 0 ] ++; s[ 1 ] += P[ i ]; s[ 2 ] += P[ i + 1 ]; s[ 3 ] += P[ i + 2 ]; }
		const pair = side.map( s => s[ 0 ] > 0 ? [ s[ 1 ] / s[ 0 ], s[ 2 ] / s[ 0 ], s[ 3 ] / s[ 0 ] ] : [ cx, cy, cz ] );
		local = { single: [ cx, cy, cz ], pair };
		muzzleCache.set( template, local );

	}
	const points = count === 2 ? local.pair : [ local.single ];
	// (the mesh's own matrix, in the scene's coordinates: matrixWorld would carry the XR scene scale and give metres)
	if ( mesh.matrixAutoUpdate ) mesh.updateMatrix();
	return points.map( q => { _v.set( q[ 0 ], q[ 1 ], q[ 2 ] ).applyMatrix4( mesh.matrix ); return [ _v.x, _v.y, _v.z ]; } );

}

// ---------------------------------------------------------------------------
// Shaders: the source's, for the three kinds drawn here (0 pellet streak, 1 bubble, 2 smoke wisp)
// ---------------------------------------------------------------------------

const VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aPositionRadius,aMotionKind,aProperties;
uniform vec2 uViewport;
varying vec2 vUV;varying vec4 vData;
void main(){
 float S=length(modelMatrix[0].xyz);
 vec4 clip=projectionMatrix*modelViewMatrix*vec4(aPositionRadius.xyz,1.);
 vec4 tail=projectionMatrix*modelViewMatrix*vec4(aPositionRadius.xyz-aMotionKind.xyz,1.);
 vec4 mvPosition=modelViewMatrix*vec4(aPositionRadius.xyz,1.);
 float uProjectionScale=projectionMatrix[1][1]*uViewport.y*.5;
 float nearW=.055*${K.toFixed( 1 )}*S;
 float kind=aMotionKind.w;
 vec2 q=position.xy;
 vData=vec4(kind,aProperties.xyz);
 if(kind<.5){
  float nearHead=clip.z+clip.w,nearTail=tail.z+tail.w;
  if(clip.w<=.001||nearHead<=.00001){gl_Position=vec4(2.,2.,2.,1.);vUV=vec2(0.);return;}
  if(nearTail<.00001)tail=mix(tail,clip,clamp((.00001-nearTail)/(nearHead-nearTail),0.,1.));
  vec2 motion=(clip.xy/clip.w-tail.xy/max(tail.w,.001))*uViewport*.5;
  float lengthPx=length(motion);
  vec2 direction=lengthPx>.001?motion/lengthPx:vec2(0.,1.);
  vec2 across=vec2(direction.y,-direction.x);
  float limitPx=max(12.,uViewport.y*(24./1080.));
  float fraction=min(1.,limitPx/max(lengthPx,.001));
  float weight=fraction*clip.w/(tail.w*(1.-fraction)+fraction*clip.w);
  tail=mix(clip,tail,weight);
  float along=q.y*.5+.5;
  vec4 edge=mix(tail,clip,along);
  float radiusPx=max(aPositionRadius.w*S*uProjectionScale/max(edge.w,nearW),1.45);
  edge.xy+=across*q.x*radiusPx*2./uViewport*edge.w;
  #include <clipping_planes_vertex>
  gl_Position=edge;vUV=vec2(q.x,along);
 }else{
  vec2 motion=(clip.xy/max(clip.w,.001)-tail.xy/max(tail.w,.001))*uViewport*.5;
  float lengthPx=min(length(motion),4.);
  vec2 direction=length(motion)>.001?normalize(motion):vec2(0.,1.);
  vec2 across=vec2(direction.y,-direction.x);
  float radiusPx=aPositionRadius.w*S*uProjectionScale/max(clip.w,nearW);
  radiusPx=max(radiusPx,kind<1.5?.65:.25);
  vec2 pixelOffset=across*q.x*radiusPx+direction*(q.y*(radiusPx+lengthPx*.35)-lengthPx*.12);
  clip.xy+=pixelOffset*2./uViewport*clip.w;
  if(clip.w<nearW)clip=vec4(2.,2.,2.,1.);
  #include <clipping_planes_vertex>
  gl_Position=clip;vUV=q;
 }
}`;
const FRAGMENT = `
#include <clipping_planes_pars_fragment>
varying vec2 vUV;varying vec4 vData;
uniform float uGlow,uTime;
${MRT_OUT}
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
void main(){
 #include <clipping_planes_fragment>
 vec2 p=vUV;float kind=vData.x,opacity=vData.y,seed=vData.z;
 float r=length(p),alpha=0.;vec3 radiance=vec3(0.);
 if(kind<.5){
  float along=clamp(p.y,0.,1.);
  float width=mix(.18,.57,smoothstep(0.,.85,along));
  float endFade=smoothstep(0.,.18,along)*(1.-smoothstep(.86,1.,along));
  float fade=pow(along,.72)*endFade;
  float core=exp(-pow(p.x/width,2.)*3.8)*fade;
  float halo=exp(-p.x*p.x*5.5)*fade*(1.-smoothstep(.65,1.,abs(p.x)));
  alpha=core*.30*opacity;
  radiance=(vec3(1.70,1.43,1.02)*core+vec3(.14,.083,.033)*halo*uGlow)*opacity;
 }else if(kind>1.5){
  // Delayed, light wisps, rather than an opaque muzzle explosion.
  p.x+=sin(p.y*5.+seed*9.+uTime*1.8)*.13;
  float n=noise(p*3.7+vec2(seed*17.,-uTime*.4));
  float body=exp(-dot(p*vec2(1.25,.87),p*vec2(1.25,.87))*3.7);
  alpha=body*smoothstep(.12,.72,n)*opacity*(1.-smoothstep(.6,1.,r));
  radiance=mix(vec3(.30,.34,.36),vec3(.61,.65,.66),n)*alpha;
 }else{
  float ring=exp(-pow((r-.77)/.085,2.));
  float inside=1.-smoothstep(.70,.88,r);
  float cap=exp(-dot(p-vec2(-.28,.45),p-vec2(-.28,.45))*95.);
  float crescent=ring*pow(clamp(dot(normalize(p+vec2(.0001)),normalize(vec2(-.5,.8))),0.,1.),8.);
  alpha=(ring*.30+inside*.022+cap*.35)*opacity;
  radiance=(vec3(.16,.34,.41)*alpha+vec3(.20,.36,.40)*ring*opacity*.35+
            vec3(.75,.94,1.0)*(cap*.75+crescent*.43)*opacity);
 }
 if(max(max(radiance.r,radiance.g),max(radiance.b,alpha))<.0005)discard;
 gl_FragColor=vec4(radiance,alpha);
 ${MRT_ZERO}
}`;
export const SHOTGUN_SHADERS = Object.freeze( { vertex: VERTEX, fragment: FRAGMENT } );

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

const ORDER = 10; // after the scorch decals (5) and the Fireball layers (6-9)
const pellets = [], bubbles = [], smoke = [];
let deps = null, group = null, fx = null, lastTime = 0, serial = 0, drawn = { pellets: 0, bubbles: 0, smoke: 0 };
const CAPACITY = SHOTGUN.maxPellets + SHOTGUN.maxBubbles + SHOTGUN.maxSmoke;
const rows = new Float32Array( CAPACITY * 12 ), depths = new Float32Array( CAPACITY ), order = new Uint16Array( CAPACITY );
const byDepth = ( a, b ) => depths[ b ] - depths[ a ];
const instanced = [];

// The caller supplies the scene, a function giving the viewmodel's muzzle points (muzzles( count ) -> [ [ x, y, z ], ... ] |
// null) and a function giving the contents of a point (contents( [ x, y, z ] ) -> the BSP contents number).
export function R_ShotgunSetup( externals ) { deps = externals; }

function build() {

	fx = layer( 'shotgun_fx', CAPACITY, { aPositionRadius: 4, aMotionKind: 4, aProperties: 4 },
		material( VERTEX, FRAGMENT, { uViewport: { value: new THREE.Vector2( 1280, 720 ) }, uGlow: { value: 1 }, uTime: { value: 0 } }, THREE.NormalBlending ), ORDER );
	for ( const a of Object.values( fx.geometry.attributes ) ) if ( a.isInstancedBufferAttribute ) instanced.push( a );
	group = new THREE.Group(); group.name = 'quake_shotgun'; group.userData.newerOnly = true;
	group.add( fx.mesh );

}

export function R_ShotgunClear() {

	pellets.length = 0; bubbles.length = 0; smoke.length = 0; lastTime = 0; drawn = { pellets: 0, bubbles: 0, smoke: 0 };
	if ( group ) { group.visible = false; fx.geometry.instanceCount = 0; }

}

const unitOf = ( a, b, out ) => { const x = b[ 0 ] - a[ 0 ], y = b[ 1 ] - a[ 1 ], z = b[ 2 ] - a[ 2 ], n = Math.hypot( x, y, z ); if ( n < 1e-6 ) return null; out[ 0 ] = x / n; out[ 1 ] = y / n; out[ 2 ] = z / n; return n; };

// The point a pellet or wisp leaves from: the barrel's muzzle, or, for a target closer than the muzzle's reach (the
// pellet would fly backwards from inside it), the game's own ray start.
function launchPoint( muzzle, ray ) {

	const ex = ray.end[ 0 ] - muzzle[ 0 ], ey = ray.end[ 1 ] - muzzle[ 1 ], ez = ray.end[ 2 ] - muzzle[ 2 ];
	return ex * ( ray.end[ 0 ] - ray.start[ 0 ] ) + ey * ( ray.end[ 1 ] - ray.start[ 1 ] ) + ez * ( ray.end[ 2 ] - ray.start[ 2 ] ) <= 0 ? ray.start : muzzle;

}

// Is this barrel under water? Decided at the barrel itself (the game's ray starts at chest height, which can be
// on the other side of the surface from the gun); without a way to look, the event's own answer.
function barrelWet( point, event ) {

	const c = deps?.contents?.( point );
	return c === undefined || c === null ? event.submerged === true : c === CONTENTS_WATER || c === CONTENTS_SLIME;

}

// One native blast (an event of sv_shotrays.js) becomes pellets, and at each barrel muzzle bubbles (under water) or
// smoke (in air), at `time`. `muzzles` are the barrel points (one, or two for the super shotgun's two-barrel blast).
export function R_ShotgunFire( event, muzzles, time ) {

	const double = event.function === 'W_FireSuperShotgun', barrels = double ? 2 : 1; // (the one-shell fallback is the single gun's blast)
	if ( ! muzzles || muzzles.length < barrels ) return 0;
	const id = event.id, dir = [ 0, 0, 0 ], wet = [];
	for ( let b = 0; b < barrels; b ++ ) wet.push( barrelWet( muzzles[ b ], event ) );
	let made = 0;
	event.rays.forEach( ( ray, i ) => {

		const barrel = double ? i % 2 : 0, from = launchPoint( muzzles[ barrel ], ray );
		const length = unitOf( from, ray.end, dir );
		if ( length === null ) return;
		const native = Math.hypot( ray.end[ 0 ] - ray.start[ 0 ], ray.end[ 1 ] - ray.start[ 1 ], ray.end[ 2 ] - ray.start[ 2 ] ) || 1;
		const su = length / K;
		// water spans, native-ray distances in Quake units -> distances along this pellet's path in source units
		const spans = ray.water.map( ( [ a, b ] ) => [ a / native * su, b / native * su ] );
		pellets.push( makePellet( { id, barrel, origin: from, dir, distance: su, waterSpans: spans, underwater: wet[ barrel ], born: time, c: pelletDraws( pelletStream( id, i ) ) } ) );
		made ++;

	} );
	if ( pellets.length > SHOTGUN.maxPellets ) pellets.splice( 0, pellets.length - SHOTGUN.maxPellets );
	const base = ( SHOTGUN.seed + id * 7919 ) >>> 0;
	for ( let b = 0; b < barrels; b ++ ) {

		// (the source's per-barrel stream of cosmetic draws; the two branches never both run for one barrel)
		const cosmetic = sgRandom( base + b * 7121 + 99 ), ray = event.rays[ Math.min( b, event.rays.length - 1 ) ], axis = [ 0, 0, 0 ], from = launchPoint( muzzles[ b ], ray );
		if ( unitOf( from, ray.end, axis ) === null ) continue;
		if ( wet[ b ] ) for ( let i = 0; i < SHOTGUN.muzzleBubbles; i ++ ) bubbles.push( makeBubble( from, axis, time + i * .018, cosmetic(), .6 ) );
		else smoke.push( ...makeSmoke( from, axis, time, cosmetic ) ); // in air: three tiny delayed wisps (never under water)

	}
	if ( smoke.length > SHOTGUN.maxSmoke ) smoke.splice( 0, smoke.length - SHOTGUN.maxSmoke );
	return made;

}

// The wake of a pellet up to `time`: a bubble every `spacing` source units of flight (the source's update(),
// line 566), born at the moment the pellet passed, whatever the frame length; only where the pellet is in
// water. Calls birth( bubble ) for each.
export function emitWake( p, time, birth ) {

	const s = Math.min( p.distance, pelletDistance( p, Math.max( 0, time - p.born ) ) );
	while ( p.nextBubble <= s ) {

		const born = p.born + pelletTimeAt( p, p.nextBubble ), seed = ( p.seed * .61803398875 + p.bubbleIndex * .754877666 ) % 1;
		if ( time - born < SHOTGUN.wakeLimit && pelletInWater( p, p.nextBubble ) ) {

			const d = p.nextBubble * K;
			birth( makeBubble( [ p.origin[ 0 ] + p.direction[ 0 ] * d, p.origin[ 1 ] + p.direction[ 1 ] * d, p.origin[ 2 ] + p.direction[ 2 ] * d ], p.direction, born, seed, 1 ) );

		}
		p.bubbleIndex ++; p.nextBubble += p.spacing * ( .86 + .28 * ( ( p.seed + p.bubbleIndex * .61803398875 ) % 1 ) );

	}

}
const birthBubble = b => { bubbles.push( b ); };

// Advance to `time`: wakes are emitted, finished pellets, bubbles and smoke wisps are dropped. In place, no allocation
// in the steady state (a shot allocates its pellets once).
function update( time ) {

	let keep = 0;
	for ( let i = 0; i < pellets.length; i ++ ) {

		const p = pellets[ i ], age = Math.max( 0, time - p.born );
		if ( p.wet ) emitWake( p, time, birthBubble );
		// the stretch it flew this frame: crossing a pool or a portal leaves a ring where it did (card [W1])
		const head = Math.min( p.distance, pelletDistance( p, age ) ) * K, tail = p.ripple ?? 0;
		if ( head > tail ) {

			R_ImpactSegment( p.origin[ 0 ] + p.direction[ 0 ] * tail, p.origin[ 1 ] + p.direction[ 1 ] * tail, p.origin[ 2 ] + p.direction[ 2 ] * tail,
				p.origin[ 0 ] + p.direction[ 0 ] * head, p.origin[ 1 ] + p.direction[ 1 ] * head, p.origin[ 2 ] + p.direction[ 2 ] * head, time, STRENGTH.pellet );
			p.ripple = head;

		}
		if ( age < p.life ) pellets[ keep ++ ] = p;

	}
	pellets.length = keep;
	keep = 0;
	for ( let i = 0; i < bubbles.length; i ++ ) { const b = bubbles[ i ]; if ( time - b.born < b.life ) bubbles[ keep ++ ] = b; }
	bubbles.length = keep;
	keep = 0;
	for ( let i = 0; i < smoke.length; i ++ ) { const s = smoke[ i ]; if ( time - s.born < s.life ) smoke[ keep ++ ] = s; }
	smoke.length = keep;
	if ( bubbles.length > SHOTGUN.maxBubbles ) { bubbles.sort( ( a, b ) => a.born - b.born ); bubbles.splice( 0, bubbles.length - SHOTGUN.maxBubbles ); }

}

const _pos = [ 0, 0, 0 ], _smoke = { x: 0, y: 0, z: 0, radius: 0, rise: 0, alpha: 0 };

// Every frame, after the viewmodel has been placed (its muzzle is wanted) and before the scene renders.
// `forward` is the view's forward vector, `viewSize` the target being rendered.
export function R_ShotgunFrame( time, eye, forward, viewSize ) {

	const scene = deps?.scene;
	if ( ! scene ) return;
	const enabled = r_shotgunfx.value !== 0 && R_NewerGame();
	// (the queue is always emptied: events must not pile up while the effect is off)
	const events = SV_FaceDrain( 'rays' );
	if ( ! enabled ) { if ( pellets.length || bubbles.length || smoke.length ) R_ShotgunClear(); else if ( group ) group.visible = false; return; }
	if ( time < lastTime - 1 ) { pellets.length = 0; bubbles.length = 0; smoke.length = 0; } // the clock jumped back (a demo loop, a new game)
	lastTime = time;
	for ( const event of events ) {

		// a soldier's shotgun (event.enemy) leaves the point his own trace started from; the player's leaves the viewmodel
		const muzzles = event.enemy !== undefined ? [ event.rays[ 0 ].start ] : deps.muzzles?.( event.function === 'W_FireSuperShotgun' ? 2 : 1 ) ?? null;
		R_ShotgunFire( event, muzzles, time );

	}
	update( time );
	if ( pellets.length === 0 && bubbles.length === 0 && smoke.length === 0 ) { if ( group ) { group.visible = false; fx.geometry.instanceCount = 0; } return; }
	if ( group === null ) build();
	if ( group.parent !== scene ) scene.add( group );
	group.visible = true;

	// gather back to front, as the source sorts
	let n = 0;
	const put = ( x, y, z, radius, mx, my, mz, kind, alpha, seed, age ) => {

		const o = n * 12;
		rows[ o ] = x; rows[ o + 1 ] = y; rows[ o + 2 ] = z; rows[ o + 3 ] = radius; rows[ o + 4 ] = mx; rows[ o + 5 ] = my; rows[ o + 6 ] = mz; rows[ o + 7 ] = kind;
		rows[ o + 8 ] = alpha; rows[ o + 9 ] = seed; rows[ o + 10 ] = age; rows[ o + 11 ] = 0;
		depths[ n ] = ( x - eye[ 0 ] ) * forward[ 0 ] + ( y - eye[ 1 ] ) * forward[ 1 ] + ( z - eye[ 2 ] ) * forward[ 2 ];
		n ++;

	};
	let pelletCount = 0;
	for ( const p of pellets ) {

		const a = time - p.born, fade = Math.min( 1, ( p.life - a ) / .028 ), alpha = .90 * fade;
		if ( ! ( alpha > .0005 ) || n >= CAPACITY ) continue;
		const d = Math.min( p.distance, pelletDistance( p, a ) ) * K, trail = pelletTrailLength( p, a ) * K;
		put( p.origin[ 0 ] + p.direction[ 0 ] * d, p.origin[ 1 ] + p.direction[ 1 ] * d, p.origin[ 2 ] + p.direction[ 2 ] * d, p.radius * K,
			p.direction[ 0 ] * trail, p.direction[ 1 ] * trail, p.direction[ 2 ] * trail, 0, alpha, p.seed, a );
		pelletCount ++;

	}
	let bubbleCount = 0;
	for ( const b of bubbles ) {

		const a = time - b.born;
		if ( a < 0 || n >= CAPACITY ) continue;
		const f = clamp( a / .035, 0, 1 ) * Math.pow( clamp( ( b.life - a ) / .5, 0, 1 ), .8 );
		if ( ! ( f > .0005 ) ) continue;
		bubbleAt( b, a, _pos );
		put( _pos[ 0 ], _pos[ 1 ], _pos[ 2 ], b.radius * ( 1 + a * .09 ) * K, 0, 0, 0, 1, f, b.seed, a / b.life );
		bubbleCount ++;

	}
	let smokeCount = 0;
	for ( const s of smoke ) {

		const a = time - s.born;
		if ( a < 0 || n >= CAPACITY ) continue;
		smokeAt( s, a, _smoke );
		if ( ! ( _smoke.alpha > .0005 ) ) continue;
		put( _smoke.x, _smoke.y, _smoke.z, _smoke.radius, 0, 0, _smoke.rise, 2, _smoke.alpha, s.seed, a / s.life );
		smokeCount ++;

	}
	drawn = { pellets: pelletCount, bubbles: bubbleCount, smoke: smokeCount };
	for ( let i = 0; i < n; i ++ ) order[ i ] = i;
	order.subarray( 0, n ).sort( byDepth );
	const A = fx.arrays;
	for ( let i = 0; i < n; i ++ ) {

		const r = order[ i ] * 12, o = i * 4;
		A.aPositionRadius[ o ] = rows[ r ]; A.aPositionRadius[ o + 1 ] = rows[ r + 1 ]; A.aPositionRadius[ o + 2 ] = rows[ r + 2 ]; A.aPositionRadius[ o + 3 ] = rows[ r + 3 ];
		A.aMotionKind[ o ] = rows[ r + 4 ]; A.aMotionKind[ o + 1 ] = rows[ r + 5 ]; A.aMotionKind[ o + 2 ] = rows[ r + 6 ]; A.aMotionKind[ o + 3 ] = rows[ r + 7 ];
		A.aProperties[ o ] = rows[ r + 8 ]; A.aProperties[ o + 1 ] = rows[ r + 9 ]; A.aProperties[ o + 2 ] = rows[ r + 10 ]; A.aProperties[ o + 3 ] = 0;

	}
	fx.geometry.instanceCount = n;
	for ( const a of instanced ) a.needsUpdate = true;
	fx.mesh.material.uniforms.uTime.value = time;
	if ( viewSize ) fx.mesh.material.uniforms.uViewport.value.set( viewSize[ 0 ], viewSize[ 1 ] );
	if ( n === 0 ) group.visible = false;

}

// Diagnostic read-only views for tests and the browser trial.
export function R_ShotgunSnapshot() {

	return { pellets: pellets.length, bubbles: bubbles.length, smoke: smoke.length, drawn: { ...drawn }, instances: fx?.geometry.instanceCount ?? 0, visible: group?.visible ?? false, group: group !== null };

}
export const R_ShotgunPellets = () => pellets;
export const R_ShotgunBubbles = () => bubbles;
export const R_ShotgunSmoke = () => smoke;
