/**
 * @module newer/render/r_venom
 *
 * The supplied "TWINSHOT — Venom FX Lab" liquid spit, ported onto the Scrag's (the Wizard's) projectile.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `deps`, `group`, `streams`, `drops`, `stains`, `_instanced`,
 * `_lastTime`, `_frame`, `_dropCursor`, `_stainCursor`, `_generation`, `_empty`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// The supplied twin-shot venom (twin-shot-venom.html, SHA-256 7cf9a25d...e934, kept local, never committed),
// ported onto the Scrag's spit in Newer Game. Extraction map and provenance: newer/effects/venom/provenance.json and
// docs/scrag-venom-2026-10-11.md.
//
// Ownership: the server still owns every projectile (QuakeC WizardSpit / Wiz_FastFire launch two progs/w_spike.mdl
// missiles, 0.5 s apart, at 600 units/s; spike_touch does the damage and sends TE_WIZSPIKE), cl_main.js moves and
// interpolates the entity, cl_tent.js plays the hit sound. This module only replaces the *picture*: in Newer Game,
// with r_venom 1, each w_spike entity the client draws is shown as one of the source's liquid jets (its native mesh
// and green tracer particles are not drawn), and each TE_WIZSPIKE is shown as the source's impact (splash droplets
// and a stain with runnels) instead of the native particle spray. Classic, r_venom 0 and the Classic half of the title
// demo's split keep the native picture.
//
// One jet per native projectile: the source's "twin" is two lanes fired together from two fangs at two points either
// side of the target; QuakeC's Wizard already fires two spikes from either side of its mouth (+-14 units) at two points
// either side of the player (+-13 units), so each native spike is one lane. The native pair stays 0.5 s apart (that is
// gameplay timing, not picture).
//
// Motion: the source's stream is a finite packet on a straight ray: its leading edge travels at the jet speed, its
// trailing edge leaves the mouth `duration` later, and once the leading edge reaches the target the packet drains into
// it. Here the leading edge IS the native entity's interpolated origin; the ray starts where the client first saw the
// entity; when the entity goes away the leading edge carries on to the TE_WIZSPIKE point (if one came) and the trailing
// edge drains into it (at most `duration`, 0.28 s, later).
//
// Units: the source works in metres with a 22 m/s jet; the native spike flies at 600 units/s, so one source metre is
// 600 / 22 = 27.27 Quake units here, which keeps the source's timing exactly (packet 0.28 s, droplet lives, gravity).
// Positions and velocities are kept in Quake units; the stream shader works in source metres and scales by `unit`.
//
// Per-frame work writes scalars into preallocated typed arrays (instanced attributes and the droplet / stain pools,
// which are the source's own fixed-capacity ring pools); nothing is allocated per frame after the first build.
import * as THREE from 'three';
import { cvar_t } from '../../engine/common/cvar.js';
import { R_NewerGame, R_ClassicPassActive } from '../mode.js';
import { MRT_OUT, MRT_ZERO, material } from './r_fireball.js';
import { R_DecalSurface } from './r_decals.js';

// 0 puts the native Scrag spit back (its mesh, green tracer and impact particles)
export const r_venom = new cvar_t( 'r_venom', '1' );

// Source defaults (TwinVenomFX.spit / twinPlan / DropletPool, quality "high", tint "toxic"), plus the port's scale.
export const VENOM = Object.freeze( {
	speed: 22,          // m/s, the source's jet speed
	duration: .28,      // s, the spit packet (trailing edge leaves the mouth this long after the leading edge)
	radius: .015,       // m, stream radius
	tint: 0xb9d675,     // PALETTES.toxic
	streamOpacity: .74, // liquidMaterial(STREAM_VERTEX, tint, .74)
	dropOpacity: .86,   // DropletPool: liquidMaterial(DROP_VERTEX, tint, .86)
	dropRate: 125,      // jet droplets per second per stream (density 1)
	splashBurst: 30,    // droplets thrown at the impact
	splashRate: 85,     // droplets per second while the stream drains into the impact
	gravity: 5.3,       // m/s^2 for splash droplets
	stainLife: 4.4,     // s
	stainCap: 24,
	dropCap: 900,       // DropletPool capacity at quality high
	segments: 144, sides: 8, // streamGeometry at quality high
	unit: 600 / 22,     // Quake units per source metre: native wizspike speed / source jet speed
	jets: 32,           // streams drawn at once (16 Scrags each with a pair in the air)
	minPixels: 2.5      // (port) the narrowest a stream is drawn on screen, pixels across: the source's strand at its stage's view
} );

const SPIKE_MODEL = 'progs/w_spike.mdl';
const CONTENTS_SOLID = - 2;
const SUBSTEP = 1 / 90;  // the source's update() substep
const MAX_STEP = .1;     // a longer gap (a hitch, a level load) is advanced by this much only
const REWIND_DROP = 1;   // the clock jumped back more than this: a demo loop or a new game
// Matching a TE_WIZSPIKE to a stream: the point must lie within this distance of the stream's ray (Quake units), no
// more than BEHIND behind its leading edge and no more than AHEAD beyond it (the drawn entity is interpolated, a frame
// behind the server's).
const MATCH_OFF_RAY = 16, MATCH_BEHIND = 32, MATCH_AHEAD = 160;
const OFF_RAY_NEW = 24;  // a tracked entity this far off its stream's ray is a new projectile in a reused slot
const LIMIT_PROBE_STEP = 8, LIMIT_PROBE_MAX = 4096; // the launch-time estimate of where the stream ends
const PLAYER_REACH = 40; // the stream aimed past the player within this distance ends at the player

// renderOrder: after the scorch decals (r_decals, 5) and before the Fireball's layers (6..9), in the source's order
// (stains 3, streams 4, droplets 5 there).
const ORDER_STAIN = 5.1, ORDER_STREAM = 5.2, ORDER_DROPS = 5.3;

// ---------------------------------------------------------------------------
// The source's pure math (source lines 79: streamWindow), and its shaders.
// ---------------------------------------------------------------------------

/**
 * streamWindow() of the source: the finite spit packet at an age. The leading edge has travelled `age * speed`, the
 * trailing edge left the mouth `duration` later; both stop at `limit`. Used by tests to check the port's motion.
 *
 * @param {number} age seconds since launch (may be negative: not launched yet)
 * @param {number} speed jet speed (any unit per second)
 * @param {number} duration seconds between the leading and the trailing edge
 * @param {number} limit where the stream ends (same unit as speed times seconds)
 * @returns {{ head: number, tail: number, length: number, active: boolean }} distances along the ray of the leading
 * and trailing edges, the packet's length, and whether any of it is still to be drawn
 */
export function streamWindow( age, speed, duration, limit ) {

	const head = Math.min( limit, Math.max( 0, age ) * speed );
	const tail = Math.min( limit, Math.max( 0, age - duration ) * speed );
	return { head, tail, length: Math.max( 0, head - tail ), active: age >= 0 && age < duration + limit / speed };

}

// The source's NOISE helpers, verbatim.
const NOISE = `
float hash1(float x){return fract(sin(x*127.1+311.7)*43758.5453);}
float noise1(float x){float i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(hash1(i),hash1(i+1.0),f);}
`;

// STREAM_VERTEX of the source, instanced: the per-stream uniforms (uHead, uTail, uRadius, uAge, uSeed, uLimit) are
// instance attributes; its local frame (x along the ray) is built from the stream's direction; positions are in source
// metres until they are placed in the world, scaled by uUnit. thickness() and the edge taper are the source's own.
export const STREAM_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aOrigin,aDir,aWin;
uniform float uSpeed,uUnit,uMinPixels,uViewHeight;
varying vec3 vWorld,vNormal;
varying float vFlow,vAlong;
${NOISE}
float uHead,uTail,uRadius,uAge,uSeed,uLimit;
float thickness(float d){
  float flow=(d-uAge*uSpeed)*8.5+uSeed;
  float ripple=.64+.30*noise1(flow)+.14*noise1(flow*3.71+17.0);
  float narrowing=1.0-.29*clamp(d/uLimit,0.0,1.0);
  float pinch=mix(.28,1.0,smoothstep(.22,.53,noise1(flow*.67+6.0)));
  return uRadius*ripple*narrowing*mix(1.0,pinch,smoothstep(.15,.82,d/uLimit));
}
void main(){
  uHead=aWin.x;uTail=aWin.y;uAge=aWin.z;uLimit=max(aWin.w,.001);uSeed=aOrigin.w;uRadius=aDir.w;
  vec3 X=normalize(aDir.xyz);
  vec3 Y=normalize(cross(abs(X.z)>.98?vec3(1.,0.,0.):vec3(0.,0.,1.),X));
  vec3 Z=cross(X,Y);
  float d=mix(uTail,uHead,position.x);
  float r=thickness(d);
  float edge=smoothstep(0.0,.055,d-uTail)*smoothstep(0.0,.085,uHead-d);
  r*=mix(.08,1.0,edge);
  // (port) a strand never thinner than uMinPixels across on screen: the source's 3 cm strand is ~3 px wide at its
  // stage's viewing distance, but a Quake view sees it far smaller; its ripples and pinches are kept in proportion
  vec3 centre=aOrigin.xyz+X*d*uUnit;
  float depth=max(1.0,-(viewMatrix*vec4(centre,1.0)).z);
  float pixel=2.0*depth/(projectionMatrix[1][1]*uViewHeight)/uUnit;
  r*=max(1.0,.5*uMinPixels*pixel/max(uRadius*.64,1e-6));
  // The centre is exactly (d, 0, 0). Only the liquid surface changes thickness.
  vec3 p=vec3(d,position.y*r,position.z*r);
  float slope=(thickness(d+.008)-thickness(d-.008))/.016;
  vec3 n=normalize(vec3(-slope,position.y,position.z));
  vec3 world=aOrigin.xyz+(X*p.x+Y*p.y+Z*p.z)*uUnit;
  vWorld=world;vNormal=normalize(X*n.x+Y*n.y+Z*n.z);
  vFlow=(d-uAge*uSpeed)*8.5+uSeed;vAlong=d/uLimit;
  vec4 mvPosition=viewMatrix*vec4(world,1.0);
  #include <clipping_planes_vertex>
  gl_Position=projectionMatrix*mvPosition;
}`;

// DROP_VERTEX of the source, instanced by attributes: aPos (centre, Quake units; w the radius, Quake units), aDir
// (direction of travel; w the stretch along it). The source's instance matrix is (direction-aligned rotation) x
// scale(r, r*stretch, r); its normal is divided by the squared scale and rotated, as here. vFlow uses metres.
export const DROP_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aPos,aDir;
uniform float uUnit;
varying vec3 vWorld,vNormal;
varying float vFlow,vAlong;
void main(){
  vec3 Yd=normalize(aDir.xyz);
  vec3 Xd=normalize(cross(Yd,abs(Yd.z)>.98?vec3(1.,0.,0.):vec3(0.,0.,1.)));
  vec3 Zd=cross(Xd,Yd);
  vec3 s=vec3(aPos.w,aPos.w*aDir.w,aPos.w);
  vec3 world=aPos.xyz+Xd*position.x*s.x+Yd*position.y*s.y+Zd*position.z*s.z;
  vec3 n=normal/s;
  vWorld=world;vNormal=normalize(Xd*n.x+Yd*n.y+Zd*n.z);
  vFlow=world.x/uUnit*13.0+world.z/uUnit*7.0;vAlong=0.0;
  vec4 mvPosition=viewMatrix*vec4(world,1.0);
  #include <clipping_planes_vertex>
  gl_Position=projectionMatrix*mvPosition;
}`;

// LIQUID_FRAGMENT of the source. Its two fixed light directions are the source's, turned from its y-up axes to
// Quake's z-up ((x, y, z) -> (x, -z, y)). Premultiplied output (the shared effect material blends ONE,
// ONE_MINUS_SRC_ALPHA), and the G-buffer outputs zeroed, as every transparent effect here. The source's renderer applies
// ACES filmic tone mapping (exposure 1.12) to this colour; Quaked's own composite grades the frame instead.
export const LIQUID_FRAGMENT = `
#include <clipping_planes_pars_fragment>
uniform vec3 uTint;
uniform float uOpacity;
varying vec3 vWorld,vNormal;
varying float vFlow,vAlong;
${MRT_OUT}
${NOISE}
void main(){
  #include <clipping_planes_fragment>
  vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorld);
  if(!gl_FrontFacing)N=-N;
  vec3 L=normalize(vec3(-.25,-.8,1.0));
  vec3 L2=normalize(vec3(.2,1.0,.45));
  float fres=pow(1.0-abs(dot(N,V)),3.5);
  float spec=pow(max(dot(N,normalize(V+L)),0.0),95.0);
  float rim=pow(max(dot(N,normalize(V+L2)),0.0),48.0);
  float glint=.65+.35*noise1(vFlow*3.0);
  vec3 body=uTint*(.48+.42*max(0.0,dot(N,L)));
  vec3 reflected=vec3(.73,.89,1.0)*(.10+fres*.55);
  vec3 color=body+reflected+vec3(1.0,.99,.9)*spec*2.7*glint+vec3(.7,.85,1.0)*rim*.85;
  float broken=mix(1.0,smoothstep(.16,.30,noise1(vFlow*.67+6.0)),smoothstep(.25,.86,vAlong));
  float alpha=clamp(uOpacity+fres*.21+spec*.15,0.0,.97)*broken;
  if(alpha<.018)discard;
  gl_FragColor=vec4(color*alpha,alpha);
  ${MRT_ZERO}
}`;

// SPLAT_VERTEX of the source, instanced: aCenter (centre, Quake units; w the half-width, Quake units), aAxisU / aAxisV
// (the stain's in-plane axes; w the age and the seed). V points down the surface, so the runnels run downhill.
export const SPLAT_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aCenter,aAxisU,aAxisV;
varying vec2 vUv;
varying float vAge,vSeed;
void main(){
  vec3 world=aCenter.xyz+(aAxisU.xyz*position.x+aAxisV.xyz*position.y)*aCenter.w;
  vUv=position.xy*.5+.5;vAge=aAxisU.w;vSeed=aAxisV.w;
  vec4 mvPosition=viewMatrix*vec4(world,1.0);
  #include <clipping_planes_vertex>
  gl_Position=projectionMatrix*mvPosition;
}`;

// SPLAT_FRAGMENT of the source, verbatim apart from the instanced age and seed and the premultiplied output.
export const SPLAT_FRAGMENT = `
#include <clipping_planes_pars_fragment>
varying vec2 vUv;
varying float vAge,vSeed;
uniform float uLife;
uniform vec3 uTint;
${MRT_OUT}
${NOISE}
void main(){
  #include <clipping_planes_fragment>
  float uAge=vAge,uSeed=vSeed;
  vec2 p=(vUv-.5)*2.0;
  float a=atan(p.y,p.x),r=length(p);
  float edge=.37+.055*sin(a*5.0+uSeed)+.04*sin(a*11.0-uSeed);
  float mask=1.0-smoothstep(edge-.018,edge+.018,r);
  for(int i=0;i<14;i++){
    float fi=float(i),h=hash1(fi*12.17+uSeed);
    float ang=fi*2.39996+uSeed,dist=.38+hash1(fi+uSeed+3.1)*.48;
    vec2 c=vec2(cos(ang),sin(ang))*dist;
    float rr=.023+.045*h;
    mask=max(mask,1.0-smoothstep(rr*.65,rr,length(p-c)));
  }
  // A few viscous runnels, not smoke or flames.
  for(int i=0;i<3;i++){
    float fi=float(i),x=(fi-1.0)*.15+.035*sin(uSeed+fi*3.1);
    float end=-.32-min(.56,max(0.0,uAge-.14)*(.18+.06*fi));
    float line=(1.0-smoothstep(.010,.025,abs(p.x-x)))*smoothstep(end-.022,end+.018,p.y)*(1.0-smoothstep(-.18,-.14,p.y));
    mask=max(mask,line*.85);
  }
  float fade=1.0-smoothstep(uLife*.65,uLife,uAge);
  float shine=pow(max(0.0,1.0-length((p-vec2(-.13,.15))*vec2(5.0,14.0))),3.0);
  vec3 color=uTint*(.47+.19*noise1(p.x*24.0+p.y*18.0+uSeed))+vec3(.76,.87,.69)*shine*.8;
  float alpha=mask*.85*fade;
  if(alpha<.01)discard;
  gl_FragColor=vec4(color*alpha,alpha);
  ${MRT_ZERO}
}`;

// ---------------------------------------------------------------------------
// State: fixed pools, allocated once.
// ---------------------------------------------------------------------------

let deps = null, group = null;
let streams = null, drops = null, stains = null; // the three meshes' { mesh, geometry, arrays }
let _instanced = [];
let _lastTime = - Infinity, _frame = 0;
let _dropCursor = 0, _stainCursor = 0, _generation = 0;
let _empty = true; // nothing launched, emitted or stained since the last R_VenomClear

// Streams, one slot per native projectile. Quake units for positions; metres for head / tail / limit (the source's).
const J = VENOM.jets;
const jetEnt = new Array( J ).fill( null ); // the entity_t drawn as this stream (null when the slot is free or released)
const jetUsed = new Uint8Array( J );        // 1 while the slot draws a stream
const jetSeen = new Int32Array( J );        // _frame the entity was last seen
const jetGen = new Int32Array( J );         // a new stream in this slot changes it (droplets keep their stream's)
const jetOrigin = new Float64Array( J * 3 );
const jetDir = new Float64Array( J * 3 );
const jetRight = new Float64Array( J * 3 );
const jetUp = new Float64Array( J * 3 );
const jetHead = new Float64Array( J );      // m along the ray: the leading edge
const jetTail = new Float64Array( J );      // m: the trailing edge
const jetLimit = new Float64Array( J );     // m: where the stream ends (estimated at launch, exact once the hit is known)
const jetBirth = new Float64Array( J );     // s: client time the entity was first seen
const jetSeed = new Float64Array( J );
const jetHitKnown = new Uint8Array( J );    // 1 once a TE_WIZSPIKE was matched to it (jetLimit is then exact)
const jetHit = new Uint8Array( J );         // 1 once the leading edge reached the limit with a known hit (splashed)
const jetNormal = new Float64Array( J * 3 ); // the impact surface's normal
const jetDropCarry = new Float64Array( J ), jetSplashCarry = new Float64Array( J );

// Droplets: the source's DropletPool, in typed arrays (Quake units and seconds).
const D = VENOM.dropCap;
const dLife = new Float32Array( D ), dAge = new Float32Array( D );
const dPos = new Float64Array( D * 3 ), dVel = new Float64Array( D * 3 );
const dRadius = new Float32Array( D ), dStretch = new Float32Array( D ), dGravity = new Float32Array( D );
const dShot = new Int32Array( D ), dShotGen = new Int32Array( D ); // the stream it rides (-1 none) and its generation
const dPlane = new Float64Array( D * 4 ); // splash droplets: the impact plane (normal, distance); 0-normal for none

// Stains: the source's stains (at most stainCap; the oldest goes first).
const S = VENOM.stainCap;
const sBirth = new Float64Array( S ).fill( - Infinity ), sSize = new Float32Array( S ), sSeed = new Float32Array( S );
const sCenter = new Float64Array( S * 3 ), sU = new Float64Array( S * 3 ), sV = new Float64Array( S * 3 );

const _p = new Float64Array( 3 ); // scratch point for the leaf probe (pointInLeaf takes an array)
const _pa = [ 0, 0, 0 ];

function streamGeometry( segments, sides ) {

	// streamGeometry() of the source: a unit tube, x along the stream 0..1, (y, z) the unit circle
	const positions = [], normals = [], indices = [];
	for ( let i = 0; i <= segments; i ++ ) for ( let j = 0; j <= sides; j ++ ) {

		const a = j / sides * Math.PI * 2, c = Math.cos( a ), s = Math.sin( a );
		positions.push( i / segments, c, s ); normals.push( 0, c, s );
		if ( i < segments && j < sides ) { const k = i * ( sides + 1 ) + j; indices.push( k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1 ); }

	}
	const g = new THREE.InstancedBufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
	g.setIndex( indices );
	return g;

}

function instanced( name, geometry, capacity, attributes, mat, order ) {

	const arrays = {};
	for ( const [ attribute, size ] of Object.entries( attributes ) ) {

		arrays[ attribute ] = new Float32Array( capacity * size );
		const buffer = new THREE.InstancedBufferAttribute( arrays[ attribute ], size );
		buffer.setUsage( THREE.DynamicDrawUsage );
		geometry.setAttribute( attribute, buffer );
		_instanced.push( buffer );

	}
	geometry.instanceCount = 0;
	const mesh = new THREE.Mesh( geometry, mat );
	mesh.name = name; mesh.frustumCulled = false; mesh.renderOrder = order; mesh.userData.newerOnly = true;
	return { mesh, geometry, arrays, capacity };

}

function build() {

	_instanced = [];
	const tint = new THREE.Color( VENOM.tint ); // linear, as the source's THREE.Color under colour management
	const liquid = ( vertex, opacity ) => material( vertex, LIQUID_FRAGMENT,
		{ uTint: { value: tint }, uOpacity: { value: opacity }, uSpeed: { value: VENOM.speed }, uUnit: { value: VENOM.unit },
			uMinPixels: { value: VENOM.minPixels }, uViewHeight: { value: 720 } }, THREE.NormalBlending );
	streams = instanced( 'venom_streams', streamGeometry( VENOM.segments, VENOM.sides ), VENOM.jets,
		{ aOrigin: 4, aDir: 4, aWin: 4 }, liquid( STREAM_VERTEX, VENOM.streamOpacity ), ORDER_STREAM );
	const sphere = new THREE.SphereGeometry( 1, 7, 5 ), dropGeometry = new THREE.InstancedBufferGeometry();
	dropGeometry.setIndex( sphere.getIndex() );
	dropGeometry.setAttribute( 'position', sphere.getAttribute( 'position' ) );
	dropGeometry.setAttribute( 'normal', sphere.getAttribute( 'normal' ) );
	drops = instanced( 'venom_droplets', dropGeometry, VENOM.dropCap, { aPos: 4, aDir: 4 }, liquid( DROP_VERTEX, VENOM.dropOpacity ), ORDER_DROPS );
	const quad = new THREE.InstancedBufferGeometry();
	quad.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 1, - 1, 0, 1, 1, 0, - 1, 1, 0 ], 3 ) );
	quad.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
	const splat = material( SPLAT_VERTEX, SPLAT_FRAGMENT, { uTint: { value: tint }, uLife: { value: VENOM.stainLife } }, THREE.NormalBlending );
	splat.polygonOffset = true; splat.polygonOffsetFactor = - 1; // as the source's stain material
	stains = instanced( 'venom_stains', quad, VENOM.stainCap, { aCenter: 4, aAxisU: 4, aAxisV: 4 }, splat, ORDER_STAIN );
	group = new THREE.Group(); group.name = 'quake_venom'; group.userData.newerOnly = true;
	group.add( stains.mesh, streams.mesh, drops.mesh );

}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

const active = () => deps != null && deps.scene != null && r_venom.value !== 0 && R_NewerGame();
const isSpike = ent => ent != null && typeof ent.model?.name === 'string' && ent.model.name.endsWith( SPIKE_MODEL );
const rand = ( a, b ) => a + ( b - a ) * Math.random();

function jetOf( ent ) {

	for ( let j = 0; j < J; j ++ ) if ( jetUsed[ j ] && jetEnt[ j ] === ent ) return j;
	return - 1;

}

function freeSlot() {

	for ( let j = 0; j < J; j ++ ) if ( ! jetUsed[ j ] ) return j;
	return - 1;

}

/**
 * Called by R_NewMap for every new map, as R_FireballSetup: the caller supplies the scene, the client, the entity
 * table and the leaf lookup. Kept until the next call.
 *
 * @param {{ scene: THREE.Scene, cl: function(): ?Object, entity: function(number): ?Object, pointInLeaf: function(Array<number>, Object): ?Object }} externals
 * the scene the meshes join; a getter for the client state (`time`, `worldmodel`); the entity for an entity number
 * (`cl_entities[ n ]`), to tell the Scrag's spike from other EF_TRACER models; Mod_PointInLeaf for the stream's end
 * estimate, the droplets' floor and the stain's surface
 */
export function R_VenomSetup( externals ) {

	deps = externals;

}

/**
 * Forgets every stream, droplet and stain and hides the meshes: called by R_NewMap after `R_VenomSetup` (a new
 * level's clock starts over), and by `R_VenomFrame` outside Newer Game or with r_venom 0.
 */
export function R_VenomClear() {

	jetUsed.fill( 0 ); jetEnt.fill( null ); dLife.fill( 0 ); sBirth.fill( - Infinity );
	_lastTime = - Infinity; _dropCursor = 0; _stainCursor = 0; _empty = true;
	if ( group ) { group.visible = false; streams.geometry.instanceCount = 0; drops.geometry.instanceCount = 0; stains.geometry.instanceCount = 0; }

}

/**
 * Whether the draw loop must leave out this entity's native mesh: a progs/w_spike.mdl entity drawn as a venom stream
 * (Newer Game, r_venom not 0, not the Classic pass of the title demo's split, and the stream pool had room for it).
 * Asked by gl_rmain.js R_DrawEntitiesOnList for every alias entity, every frame, after `R_VenomFrame` placed the
 * streams.
 *
 * @param {?entity_t} ent the entity about to be drawn
 * @returns {boolean} true when the native mesh must not be drawn (the stream is its picture)
 */
export function R_VenomTakesEntity( ent ) {

	if ( ! isSpike( ent ) || ! active() || R_ClassicPassActive() ) return false;
	return jetOf( ent ) >= 0;

}

/**
 * Whether the native green tracer trail (EF_TRACER, R_RocketTrail type 3) of entity `key` must be left out because its
 * venom stream replaces it. Called by render.js R_RocketTrail for every type 3 trail segment that carries its entity
 * number (cl_main.js passes it); records nothing.
 *
 * @param {number} key the entity number (`cl_entities` index)
 * @returns {boolean} true when the entity is a progs/w_spike.mdl drawn (or about to be drawn) as a stream: Newer Game,
 * r_venom not 0, and a stream slot is its or free
 */
export function R_VenomTrail( key ) {

	if ( ! active() || deps.entity == null ) return false;
	const ent = deps.entity( key );
	if ( ! isSpike( ent ) ) return false;
	return jetOf( ent ) >= 0 || freeSlot() >= 0;

}

// Where a stream launched along `dir` from `o` (Quake units) will end, sampled once at launch as the source samples
// its target: the player when the ray passes within PLAYER_REACH of the view origin (the Scrag aims at the player),
// otherwise the first solid leaf along the ray. Only the stream's narrowing and break-up depend on it; the impact
// itself waits for the server's TE_WIZSPIKE.
function launchLimit( o, d, eye, model ) {

	let limit = LIMIT_PROBE_MAX;
	if ( deps.pointInLeaf && model != null ) {

		for ( let s = LIMIT_PROBE_STEP; s <= LIMIT_PROBE_MAX; s += LIMIT_PROBE_STEP ) {

			_pa[ 0 ] = o[ 0 ] + d[ 0 ] * s; _pa[ 1 ] = o[ 1 ] + d[ 1 ] * s; _pa[ 2 ] = o[ 2 ] + d[ 2 ] * s;
			const leaf = deps.pointInLeaf( _pa, model );
			if ( leaf != null && leaf.contents === CONTENTS_SOLID ) { limit = s; break; }

		}

	}
	if ( eye != null ) {

		const vx = eye[ 0 ] - o[ 0 ], vy = eye[ 1 ] - o[ 1 ], vz = eye[ 2 ] - 16 - o[ 2 ];
		const t = vx * d[ 0 ] + vy * d[ 1 ] + vz * d[ 2 ];
		if ( t > 0 && t < limit && Math.hypot( vx - d[ 0 ] * t, vy - d[ 1 ] * t, vz - d[ 2 ] * t ) < PLAYER_REACH ) limit = t;

	}
	return limit / VENOM.unit;

}

function setBasis( j ) {

	// frame( direction, right ) of the source with a horizontal right (Quake z up)
	const o = j * 3, dx = jetDir[ o ], dy = jetDir[ o + 1 ], dz = jetDir[ o + 2 ];
	let rx = dy, ry = - dx, rz = 0; // d x up
	let l = Math.hypot( rx, ry );
	if ( l < 1e-6 ) { rx = 1; ry = 0; l = 1; }
	rx /= l; ry /= l;
	jetRight[ o ] = rx; jetRight[ o + 1 ] = ry; jetRight[ o + 2 ] = rz;
	jetUp[ o ] = ry * dz - rz * dy; jetUp[ o + 1 ] = rz * dx - rx * dz; jetUp[ o + 2 ] = rx * dy - ry * dx; // right x d

}

// The client first sees a missile a server frame or two after QuakeC launched it (60 units or so at 600 units/s), and
// QuakeC launches it beside the Scrag's head (Wiz_StartFast: origin + '0 0 30' + v_forward * 14 +- v_right * 14), not
// from its mouth. The source's jets leave the creature's fangs (its demo's fang sockets, 0.13 m either side of the
// mouth: twinPlan `origins`), and the owner asked for the spit to come from the Scrag's face (card [SP2]). So the
// stream starts at one of two fangs on the Scrag's mouth: the jaw corner of its model (VENOM_MOUTH: id1 wizard.mdl
// vertex 52, on the centre line, in the frame being drawn), turned with the Scrag, and VENOM_MOUTH.fang either side of
// it, on the side the spike was launched from. The Scrag is the nearest progs/wizard.mdl behind the spike within
// SCRAG_REACH of its ray. Writes the fang point into `out` and returns true, or false with no Scrag found.
export const VENOM_MOUTH = Object.freeze( {
	vertex: 52, verts: 80,      // the jaw corner of id1's progs/wizard.mdl (80 vertices); another mesh uses `fallback`
	fallback: Object.freeze( [ 14, 0, 30 ] ), // model space (forward, left, up): QuakeC's launch point, on the centre line
	fang: .13 * VENOM.unit      // Quake units: the source's fang sockets, 0.13 m either side of the mouth
} );
function mouthPoint( e, side, out ) {

	// model space: the mouth vertex of the drawn frame (Quake's alias trivertx: v * scale + scale_origin)
	const h = e.model.cache?.data, f = h?.frames?.[ e.frame | 0 ], pose = f && h.poseverts?.[ f.firstpose ];
	let mx, my, mz;
	if ( h?.numverts === VENOM_MOUTH.verts && pose?.[ VENOM_MOUTH.vertex ]?.v && h.scale && h.scale_origin ) {

		const v = pose[ VENOM_MOUTH.vertex ].v;
		mx = v[ 0 ] * h.scale[ 0 ] + h.scale_origin[ 0 ]; my = v[ 1 ] * h.scale[ 1 ] + h.scale_origin[ 1 ]; mz = v[ 2 ] * h.scale[ 2 ] + h.scale_origin[ 2 ];

	} else { mx = VENOM_MOUTH.fallback[ 0 ]; my = VENOM_MOUTH.fallback[ 1 ]; mz = VENOM_MOUTH.fallback[ 2 ]; }
	my -= side * VENOM_MOUTH.fang; // (model y is left; `side` +1 is the Scrag's right)
	// to the world as the renderer turns an alias model: roll about x, then -pitch about y, then yaw about z
	const a = e.angles, roll = ( a?.[ 2 ] ?? 0 ) * Math.PI / 180, pitch = - ( a?.[ 0 ] ?? 0 ) * Math.PI / 180, yaw = ( a?.[ 1 ] ?? 0 ) * Math.PI / 180;
	let y1 = my * Math.cos( roll ) - mz * Math.sin( roll ), z1 = my * Math.sin( roll ) + mz * Math.cos( roll );
	const x2 = mx * Math.cos( pitch ) + z1 * Math.sin( pitch ), z2 = - mx * Math.sin( pitch ) + z1 * Math.cos( pitch );
	out[ 0 ] = e.origin[ 0 ] + x2 * Math.cos( yaw ) - y1 * Math.sin( yaw );
	out[ 1 ] = e.origin[ 1 ] + x2 * Math.sin( yaw ) + y1 * Math.cos( yaw );
	out[ 2 ] = e.origin[ 2 ] + z2;

}
function scragMouth( ox, oy, oz, dx, dy, dz, entities, count, out ) {

	let best = null, bestOff = SCRAG_REACH, bestSide = 1;
	for ( let i = 0; i < count; i ++ ) {

		const e = entities[ i ];
		if ( e == null || e.origin == null || typeof e.model?.name !== 'string' || ! e.model.name.endsWith( SCRAG_MODEL ) ) continue;
		const vx = e.origin[ 0 ] - ox, vy = e.origin[ 1 ] - oy, vz = e.origin[ 2 ] + SCRAG_MOUTH - oz;
		const along = vx * dx + vy * dy + vz * dz;
		if ( along > 0 || along < - SCRAG_BACK ) continue;
		const off = Math.hypot( vx - dx * along, vy - dy * along, vz - dz * along );
		if ( off < bestOff ) {

			bestOff = off; best = e;
			// the side the spike left from: where its ray passes the Scrag, against the Scrag's right
			const yaw = ( e.angles?.[ 1 ] ?? 0 ) * Math.PI / 180, rx = Math.sin( yaw ), ry = - Math.cos( yaw );
			bestSide = ( dx * along - vx ) * rx + ( dy * along - vy ) * ry >= 0 ? 1 : - 1;

		}

	}
	if ( best === null ) return false;
	mouthPoint( best, bestSide, out );
	return true;

}
const SCRAG_MODEL = 'progs/wizard.mdl', SCRAG_MOUTH = 30, SCRAG_REACH = 48, SCRAG_BACK = 200; // Quake units
const _mouth = [ 0, 0, 0 ];

function launch( j, ent, time, eye, model, entities, count ) {

	const o = j * 3, a = ent.angles;
	jetUsed[ j ] = 1; jetEnt[ j ] = ent; jetGen[ j ] = ++ _generation; _empty = false;
	jetOrigin[ o ] = ent.origin[ 0 ]; jetOrigin[ o + 1 ] = ent.origin[ 1 ]; jetOrigin[ o + 2 ] = ent.origin[ 2 ];
	// until it has moved, the direction is the entity's angles (QuakeC vectoangles of its velocity: pitch up)
	const pitch = ( a?.[ 0 ] ?? 0 ) * Math.PI / 180, yaw = ( a?.[ 1 ] ?? 0 ) * Math.PI / 180;
	jetDir[ o ] = Math.cos( pitch ) * Math.cos( yaw ); jetDir[ o + 1 ] = Math.cos( pitch ) * Math.sin( yaw ); jetDir[ o + 2 ] = Math.sin( pitch );
	let back = 0;
	if ( scragMouth( jetOrigin[ o ], jetOrigin[ o + 1 ], jetOrigin[ o + 2 ], jetDir[ o ], jetDir[ o + 1 ], jetDir[ o + 2 ], entities, count, _mouth ) ) {

		// the ray runs from the fang to where the spike is drawn
		const vx = ent.origin[ 0 ] - _mouth[ 0 ], vy = ent.origin[ 1 ] - _mouth[ 1 ], vz = ent.origin[ 2 ] - _mouth[ 2 ], l = Math.hypot( vx, vy, vz );
		jetOrigin[ o ] = _mouth[ 0 ]; jetOrigin[ o + 1 ] = _mouth[ 1 ]; jetOrigin[ o + 2 ] = _mouth[ 2 ];
		if ( l > 1e-3 ) { back = l; jetDir[ o ] = vx / l; jetDir[ o + 1 ] = vy / l; jetDir[ o + 2 ] = vz / l; }

	}
	setBasis( j );
	// (the leading edge is where the entity is; the stream has been flying since it left the mouth)
	jetHead[ j ] = back / VENOM.unit; jetTail[ j ] = 0; jetBirth[ j ] = time - back / ( VENOM.speed * VENOM.unit ); jetSeed[ j ] = rand( 0, 100 );
	jetHitKnown[ j ] = 0; jetHit[ j ] = 0; jetDropCarry[ j ] = 0; jetSplashCarry[ j ] = 0;
	jetNormal[ o ] = - jetDir[ o ]; jetNormal[ o + 1 ] = - jetDir[ o + 1 ]; jetNormal[ o + 2 ] = - jetDir[ o + 2 ];
	_p[ 0 ] = jetDir[ o ]; _p[ 1 ] = jetDir[ o + 1 ]; _p[ 2 ] = jetDir[ o + 2 ];
	jetLimit[ j ] = back / VENOM.unit + launchLimit( ent.origin, _p, eye, model );

}

// The leading edge follows the drawn entity along the ray (never backwards); the ray's direction is the entity's actual
// motion once it has moved. False when the entity has left the ray: a new projectile in a reused entity slot.
function follow( j, ent ) {

	const o = j * 3, K = VENOM.unit;
	const vx = ent.origin[ 0 ] - jetOrigin[ o ], vy = ent.origin[ 1 ] - jetOrigin[ o + 1 ], vz = ent.origin[ 2 ] - jetOrigin[ o + 2 ];
	const along = vx * jetDir[ o ] + vy * jetDir[ o + 1 ] + vz * jetDir[ o + 2 ];
	const off = Math.hypot( vx - jetDir[ o ] * along, vy - jetDir[ o + 1 ] * along, vz - jetDir[ o + 2 ] * along );
	if ( along < jetHead[ j ] * K - OFF_RAY_NEW || off > OFF_RAY_NEW ) return false;
	const l = Math.hypot( vx, vy, vz );
	if ( l > 8 ) { jetDir[ o ] = vx / l; jetDir[ o + 1 ] = vy / l; jetDir[ o + 2 ] = vz / l; setBasis( j ); }
	jetHead[ j ] = Math.max( jetHead[ j ], ( l > 8 ? l : along ) / K );
	if ( ! jetHitKnown[ j ] && jetHead[ j ] > jetLimit[ j ] ) jetLimit[ j ] = jetHead[ j ]; // flew past the estimate
	return true;

}

/**
 * The picture of one TE_WIZSPIKE (a Scrag spike hitting a wall): matched to the stream whose ray passes through the
 * point, which then runs on to it, splashes and drains into it as the source's stream does at its target; with no
 * such stream (it was never seen), the splash and stain alone. Called by render.js R_WizardSpikeImpact when cl_tent.js
 * parses the event (the caller keeps the hit sound). The surface is the nearest world surface at the point
 * (R_DecalSurface), else one facing back along the stream, else the floor.
 *
 * @param {Float32Array|Array<number>} pos the impact point, world space, Quake units (copied)
 * @returns {boolean} false when the native particles must be used: Classic, r_venom 0, no scene; true when the venom
 * took the event
 */
export function R_VenomImpact( pos ) {

	if ( ! active() ) return false;
	const K = VENOM.unit;
	let best = - 1, bestOff = MATCH_OFF_RAY;
	for ( let j = 0; j < J; j ++ ) {

		if ( ! jetUsed[ j ] || jetHitKnown[ j ] ) continue;
		const o = j * 3, vx = pos[ 0 ] - jetOrigin[ o ], vy = pos[ 1 ] - jetOrigin[ o + 1 ], vz = pos[ 2 ] - jetOrigin[ o + 2 ];
		const along = vx * jetDir[ o ] + vy * jetDir[ o + 1 ] + vz * jetDir[ o + 2 ], head = jetHead[ j ] * K;
		if ( along < head - MATCH_BEHIND || along > head + MATCH_AHEAD ) continue;
		const off = Math.hypot( vx - jetDir[ o ] * along, vy - jetDir[ o + 1 ] * along, vz - jetDir[ o + 2 ] * along );
		if ( off < bestOff ) { bestOff = off; best = j; }

	}
	if ( best >= 0 ) {

		const o = best * 3;
		const along = ( pos[ 0 ] - jetOrigin[ o ] ) * jetDir[ o ] + ( pos[ 1 ] - jetOrigin[ o + 1 ] ) * jetDir[ o + 1 ] + ( pos[ 2 ] - jetOrigin[ o + 2 ] ) * jetDir[ o + 2 ];
		jetLimit[ best ] = Math.max( jetHead[ best ], Math.max( 0, along ) / K ); jetHitKnown[ best ] = 1;
		surfaceNormal( pos, jetDir, o, jetNormal, o );
		return true;

	}
	// no stream to finish: the impact alone (the source's stain and splash at a hit point)
	_n[ 0 ] = 0; _n[ 1 ] = 0; _n[ 2 ] = 1;
	surfaceNormal( pos, null, 0, _n, 0 );
	stain( pos[ 0 ], pos[ 1 ], pos[ 2 ], _n[ 0 ], _n[ 1 ], _n[ 2 ], deps.cl?.()?.time ?? 0 );
	splash( pos[ 0 ], pos[ 1 ], pos[ 2 ], _n[ 0 ], _n[ 1 ], _n[ 2 ], Math.round( VENOM.splashBurst ) );
	return true;

}
const _n = new Float64Array( 3 );

// The impact surface's outward normal into out[ oo.. ]: the world surface at the point if there is one; otherwise the
// stream's reverse direction (the source's default normal), or what out already holds.
function surfaceNormal( pos, dir, od, out, oo ) {

	const model = deps.cl?.()?.worldmodel;
	if ( deps.pointInLeaf && model != null ) {

		// (a spike stops a little in front of the wall: look from a point stepped back along the stream)
		if ( dir != null ) { _pa[ 0 ] = pos[ 0 ] - dir[ od ] * 2; _pa[ 1 ] = pos[ 1 ] - dir[ od + 1 ] * 2; _pa[ 2 ] = pos[ 2 ] - dir[ od + 2 ] * 2; } else { _pa[ 0 ] = pos[ 0 ]; _pa[ 1 ] = pos[ 1 ]; _pa[ 2 ] = pos[ 2 ]; }
		const hit = R_DecalSurface( model, _pa, 12, deps.pointInLeaf );
		if ( hit !== null ) { out[ oo ] = hit.nx; out[ oo + 1 ] = hit.ny; out[ oo + 2 ] = hit.nz; return; }

	}
	if ( dir != null ) { out[ oo ] = - dir[ od ]; out[ oo + 1 ] = - dir[ od + 1 ]; out[ oo + 2 ] = - dir[ od + 2 ]; }

}

// DropletPool.emit of the source (ring buffer, the oldest slot is reused).
function emit( px, py, pz, vx, vy, vz, radius, stretch, life, gravity, shot, nx, ny, nz, pd ) {

	const i = _dropCursor; _dropCursor = ( _dropCursor + 1 ) % D; _empty = false;
	dLife[ i ] = life; dAge[ i ] = 0; dRadius[ i ] = radius; dStretch[ i ] = stretch; dGravity[ i ] = gravity;
	dPos[ i * 3 ] = px; dPos[ i * 3 + 1 ] = py; dPos[ i * 3 + 2 ] = pz;
	dVel[ i * 3 ] = vx; dVel[ i * 3 + 1 ] = vy; dVel[ i * 3 + 2 ] = vz;
	dShot[ i ] = shot; dShotGen[ i ] = shot >= 0 ? jetGen[ shot ] : 0;
	dPlane[ i * 4 ] = nx; dPlane[ i * 4 + 1 ] = ny; dPlane[ i * 4 + 2 ] = nz; dPlane[ i * 4 + 3 ] = pd;

}

// _splash() of the source: droplets thrown off the surface (normal n) at p, falling under gravity. Quake units.
function splash( px, py, pz, nx, ny, nz, count ) {

	const K = VENOM.unit;
	// frame( n ): a side and an up across the surface
	let sx = ny, sy = - nx, sz = 0; // n x z
	if ( Math.abs( nz ) > .98 ) { sx = 0; sy = - nz; sz = ny; } // n x y
	const sl = Math.hypot( sx, sy, sz ) || 1; sx /= sl; sy /= sl; sz /= sl;
	const ux = sy * nz - sz * ny, uy = sz * nx - sx * nz, uz = sx * ny - sy * nx;
	const pd = nx * px + ny * py + nz * pz;
	for ( let k = 0; k < count; k ++ ) {

		const a = rand( 0, Math.PI * 2 ), r = rand( .3, 2.1 ), out = rand( .35, 1.5 );
		const c = Math.cos( a ) * r, s = Math.sin( a ) * r;
		emit( px + nx * .018 * K, py + ny * .018 * K, pz + nz * .018 * K,
			( nx * out + sx * c + ux * s ) * K, ( ny * out + sy * c + uy * s ) * K, ( nz * out + sz * c + uz * s ) * K,
			rand( .009, .025 ) * K, rand( 1.1, 2.9 ), rand( .28, .8 ), VENOM.gravity * K, - 1, nx, ny, nz, pd );

	}

}

// _jetDroplets() of the source: fine fragments riding the stream between its trailing and leading edges.
function jetDroplets( j, count ) {

	const o = j * 3, K = VENOM.unit, speed = VENOM.speed * K;
	for ( let k = 0; k < count; k ++ ) {

		const d = rand( jetTail[ j ], Math.max( jetTail[ j ], jetHead[ j ] - .025 ) ) * K;
		const r = rand( - .038, .038 ) * K, u = rand( - .024, .024 ) * K;
		emit( jetOrigin[ o ] + jetDir[ o ] * d + jetRight[ o ] * r + jetUp[ o ] * u,
			jetOrigin[ o + 1 ] + jetDir[ o + 1 ] * d + jetRight[ o + 1 ] * r + jetUp[ o + 1 ] * u,
			jetOrigin[ o + 2 ] + jetDir[ o + 2 ] * d + jetRight[ o + 2 ] * r + jetUp[ o + 2 ] * u,
			jetDir[ o ] * speed, jetDir[ o + 1 ] * speed, jetDir[ o + 2 ] * speed,
			rand( .004, .010 ) * K, rand( 1.7, 5.5 ), ( jetLimit[ j ] - d / K ) / VENOM.speed + .04, 0, j, 0, 0, 0, 0 );

	}

}

// _stain() of the source: a stain on the surface at p, the oldest replaced when there are stainCap.
function stain( px, py, pz, nx, ny, nz, time ) {

	const i = _stainCursor; _stainCursor = ( _stainCursor + 1 ) % S; _empty = false;
	const K = VENOM.unit, o = i * 3;
	// V runs down the surface (the source's target board is vertical with its y up: the runnels run down it)
	let vx = - nx * nz, vy = - ny * nz, vz = 1 - nz * nz; // up minus its normal part
	let vl = Math.hypot( vx, vy, vz );
	if ( vl < .05 ) { vx = 1 - nx * nx; vy = - nx * ny; vz = - nx * nz; vl = Math.hypot( vx, vy, vz ) || 1; } // a floor or ceiling
	vx /= vl; vy /= vl; vz /= vl;
	sU[ o ] = vy * nz - vz * ny; sU[ o + 1 ] = vz * nx - vx * nz; sU[ o + 2 ] = vx * ny - vy * nx; // V x N, so U x V = N
	sV[ o ] = vx; sV[ o + 1 ] = vy; sV[ o + 2 ] = vz;
	sCenter[ o ] = px + nx * .012 * K; sCenter[ o + 1 ] = py + ny * .012 * K; sCenter[ o + 2 ] = pz + nz * .012 * K;
	sBirth[ i ] = time; sSize[ i ] = .58 + rand( 0, .16 ); sSeed[ i ] = rand( 0, 50 );

}

// DropletPool.update of the source, one substep: integrate, then kill droplets past their stream's end, through the
// floor (in solid: the source's floor plane) or behind their impact surface.
function stepDrops( dt, model ) {

	const K = VENOM.unit;
	for ( let i = 0; i < D; i ++ ) {

		if ( dLife[ i ] <= 0 ) continue;
		dAge[ i ] += dt;
		if ( dAge[ i ] >= dLife[ i ] ) { dLife[ i ] = 0; continue; }
		const o = i * 3, g = dGravity[ i ];
		dPos[ o ] += dVel[ o ] * dt; dPos[ o + 1 ] += dVel[ o + 1 ] * dt; dPos[ o + 2 ] += dVel[ o + 2 ] * dt - .5 * g * dt * dt;
		dVel[ o + 2 ] -= g * dt;
		const shot = dShot[ i ];
		if ( shot >= 0 ) {

			// Primary jet fragments stop at the same plane as their parent stream (and with it, if it is gone).
			if ( ! jetUsed[ shot ] || jetGen[ shot ] !== dShotGen[ i ] ) { dLife[ i ] = 0; continue; }
			const so = shot * 3;
			const along = ( dPos[ o ] - jetOrigin[ so ] ) * jetDir[ so ] + ( dPos[ o + 1 ] - jetOrigin[ so + 1 ] ) * jetDir[ so + 1 ] + ( dPos[ o + 2 ] - jetOrigin[ so + 2 ] ) * jetDir[ so + 2 ];
			if ( along >= Math.min( jetLimit[ shot ], jetHead[ shot ] + .05 ) * K ) { dLife[ i ] = 0; continue; }

		}
		if ( g > 0 ) {

			const p = i * 4;
			if ( dPlane[ p ] * dPos[ o ] + dPlane[ p + 1 ] * dPos[ o + 1 ] + dPlane[ p + 2 ] * dPos[ o + 2 ] < dPlane[ p + 3 ] ) { dLife[ i ] = 0; continue; }
			if ( deps.pointInLeaf && model != null ) {

				_pa[ 0 ] = dPos[ o ]; _pa[ 1 ] = dPos[ o + 1 ]; _pa[ 2 ] = dPos[ o + 2 ];
				const leaf = deps.pointInLeaf( _pa, model );
				if ( leaf != null && leaf.contents === CONTENTS_SOLID ) { dLife[ i ] = 0; continue; }

			}

		}

	}

}

// The stream's entity went away. With a TE_WIZSPIKE matched the leading edge runs on to it; without one (the spike hit
// a monster or the player, which bleed instead, or left the view) it runs on to the launch estimate only when that is
// within about a frame's flight (RELEASE_REACH), else it stops where the entity was last drawn.
function release( j ) {

	jetEnt[ j ] = null;
	if ( ! jetHitKnown[ j ] && ( jetLimit[ j ] - jetHead[ j ] ) * VENOM.unit > RELEASE_REACH ) jetLimit[ j ] = jetHead[ j ];

}
const RELEASE_REACH = 64;

// One stream for the step dt: the leading edge (followed from the entity while it is drawn, else carried on to the
// stream's end), the trailing edge, the impact, and the droplets it throws. False when it has drained away.
function stepJet( j, time, dt, released ) {

	const speed = VENOM.speed;
	if ( released ) jetHead[ j ] = Math.min( jetLimit[ j ], jetHead[ j ] + speed * dt );
	// The trailing edge leaves the mouth `duration` after the leading one, at the same speed: `duration * speed` behind
	// the entity while it flies, then on at the jet speed (the source's (age - duration) * speed) until it reaches the end.
	const lag = released ? ( time - jetBirth[ j ] - VENOM.duration ) * speed : jetHead[ j ] - speed * VENOM.duration;
	jetTail[ j ] = Math.min( jetHead[ j ], Math.max( jetTail[ j ], lag, 0 ) );
	if ( released && jetHead[ j ] >= jetLimit[ j ] && ! jetHit[ j ] ) {

		jetHit[ j ] = 1;
		if ( jetHitKnown[ j ] ) {

			const o = j * 3, K = VENOM.unit, d = jetLimit[ j ] * K;
			const px = jetOrigin[ o ] + jetDir[ o ] * d, py = jetOrigin[ o + 1 ] + jetDir[ o + 1 ] * d, pz = jetOrigin[ o + 2 ] + jetDir[ o + 2 ] * d;
			stain( px, py, pz, jetNormal[ o ], jetNormal[ o + 1 ], jetNormal[ o + 2 ], time );
			splash( px, py, pz, jetNormal[ o ], jetNormal[ o + 1 ], jetNormal[ o + 2 ], VENOM.splashBurst );

		}

	}
	if ( released && jetTail[ j ] >= jetHead[ j ] - 1e-6 ) return false;
	jetDropCarry[ j ] += dt * VENOM.dropRate;
	const n = Math.floor( jetDropCarry[ j ] ); jetDropCarry[ j ] -= n;
	if ( n && jetHead[ j ] - jetTail[ j ] > .03 ) jetDroplets( j, n );
	if ( jetHit[ j ] && jetHitKnown[ j ] ) {

		jetSplashCarry[ j ] += dt * VENOM.splashRate;
		const s = Math.floor( jetSplashCarry[ j ] ); jetSplashCarry[ j ] -= s;
		if ( s ) {

			const o = j * 3, d = jetLimit[ j ] * VENOM.unit;
			splash( jetOrigin[ o ] + jetDir[ o ] * d, jetOrigin[ o + 1 ] + jetDir[ o + 1 ] * d, jetOrigin[ o + 2 ] + jetDir[ o + 2 ] * d,
				jetNormal[ o ], jetNormal[ o + 1 ], jetNormal[ o + 2 ], s );

		}

	}
	return true;

}

/**
 * Every frame, before the scene renders (R_RenderView, after R_FireballFrame): finds this frame's progs/w_spike.mdl
 * entities among the visible entities, gives each new one a stream, moves each stream's leading edge to its entity's
 * interpolated origin, lets the streams whose entity went away run on to their impact and drain, steps the droplets
 * (in the source's 1/90 s substeps) and ages the stains, then writes all of it into the preallocated instance buffers.
 * Outside Newer Game or with r_venom 0 everything is dropped and hidden. Allocates nothing per frame after the first
 * build.
 *
 * @param {number} time client time, seconds (`cl.time`)
 * @param {?Array<number>} eye the view origin, world space, Quake units (the player the Scrag aims at)
 * @param {Array<?entity_t>} entities this frame's visible entities (`cl_visedicts`)
 * @param {number} count how many of them there are (`cl_numvisedicts`)
 * @param {?Array<number>} [viewSize] [width, height] of the render target in pixels, for the stream's minimum width
 */
export function R_VenomFrame( time, eye, entities, count, viewSize = null ) {

	if ( deps == null || ! deps.scene ) return;
	if ( ! active() ) { if ( ! _empty ) R_VenomClear(); return; }
	if ( time < _lastTime - REWIND_DROP ) R_VenomClear(); // the clock jumped back (a demo loop, a new game)
	const dt = _lastTime === - Infinity ? 0 : Math.min( MAX_STEP, Math.max( 0, time - _lastTime ) );
	_lastTime = time;
	_frame ++;
	const model = deps.cl?.()?.worldmodel ?? null;

	// the projectiles drawn this frame
	for ( let i = 0; i < count; i ++ ) {

		const ent = entities[ i ];
		if ( ! isSpike( ent ) || ent.origin == null ) continue;
		let j = jetOf( ent );
		if ( j >= 0 && ! follow( j, ent ) ) { release( j ); j = - 1; } // a new projectile: the old stream drains
		if ( j < 0 ) { j = freeSlot(); if ( j < 0 ) continue; launch( j, ent, time, eye, model, entities, count ); }
		jetSeen[ j ] = _frame;

	}
	// streams: the leading edge, the trailing edge, the impact, the droplets
	for ( let j = 0; j < J; j ++ ) {

		if ( ! jetUsed[ j ] ) continue;
		if ( jetEnt[ j ] !== null && jetSeen[ j ] !== _frame ) release( j ); // its entity went away
		if ( ! stepJet( j, time, dt, jetEnt[ j ] === null ) ) jetUsed[ j ] = 0;

	}
	for ( let left = dt; left > 1e-10; left -= SUBSTEP ) stepDrops( Math.min( left, SUBSTEP ), model );

	write( time );
	if ( viewSize && streams ) streams.mesh.material.uniforms.uViewHeight.value = viewSize[ 1 ];

}

function write( time ) {

	let jets = 0, nd = 0, ns = 0;
	for ( let j = 0; j < J; j ++ ) if ( jetUsed[ j ] && jetHead[ j ] - jetTail[ j ] > .0001 ) jets ++;
	for ( let i = 0; i < D; i ++ ) if ( dLife[ i ] > 0 ) nd ++;
	for ( let i = 0; i < S; i ++ ) if ( time - sBirth[ i ] < VENOM.stainLife && time >= sBirth[ i ] ) ns ++;
	if ( jets === 0 && nd === 0 && ns === 0 ) { if ( group ) { group.visible = false; streams.geometry.instanceCount = 0; drops.geometry.instanceCount = 0; stains.geometry.instanceCount = 0; } return; }
	if ( group === null ) build();
	if ( group.parent !== deps.scene ) deps.scene.add( group );
	group.visible = true;

	let n = 0;
	const A = streams.arrays;
	for ( let j = 0; j < J; j ++ ) {

		if ( ! jetUsed[ j ] || jetHead[ j ] - jetTail[ j ] <= .0001 ) continue;
		const o = j * 3, q = n * 4;
		A.aOrigin[ q ] = jetOrigin[ o ]; A.aOrigin[ q + 1 ] = jetOrigin[ o + 1 ]; A.aOrigin[ q + 2 ] = jetOrigin[ o + 2 ]; A.aOrigin[ q + 3 ] = jetSeed[ j ];
		A.aDir[ q ] = jetDir[ o ]; A.aDir[ q + 1 ] = jetDir[ o + 1 ]; A.aDir[ q + 2 ] = jetDir[ o + 2 ]; A.aDir[ q + 3 ] = VENOM.radius;
		A.aWin[ q ] = jetHead[ j ]; A.aWin[ q + 1 ] = jetTail[ j ]; A.aWin[ q + 2 ] = time - jetBirth[ j ]; A.aWin[ q + 3 ] = Math.max( jetLimit[ j ], .001 );
		n ++;

	}
	streams.geometry.instanceCount = n;

	n = 0;
	const P = drops.arrays;
	for ( let i = 0; i < D; i ++ ) {

		if ( dLife[ i ] <= 0 ) continue;
		const o = i * 3, q = n * 4;
		const fade = Math.min( 1, ( dLife[ i ] - dAge[ i ] ) / .15 ), r = Math.max( .00001, dRadius[ i ] * fade );
		P.aPos[ q ] = dPos[ o ]; P.aPos[ q + 1 ] = dPos[ o + 1 ]; P.aPos[ q + 2 ] = dPos[ o + 2 ]; P.aPos[ q + 3 ] = r;
		const vx = dVel[ o ], vy = dVel[ o + 1 ], vz = dVel[ o + 2 ];
		if ( vx * vx + vy * vy + vz * vz < 1e-8 ) { P.aDir[ q ] = 0; P.aDir[ q + 1 ] = 0; P.aDir[ q + 2 ] = 1; } else { P.aDir[ q ] = vx; P.aDir[ q + 1 ] = vy; P.aDir[ q + 2 ] = vz; }
		P.aDir[ q + 3 ] = dStretch[ i ];
		n ++;

	}
	drops.geometry.instanceCount = n;

	n = 0;
	const T = stains.arrays, K = VENOM.unit;
	for ( let i = 0; i < S; i ++ ) {

		const a = time - sBirth[ i ];
		if ( ! ( a >= 0 && a < VENOM.stainLife ) ) continue;
		const o = i * 3, q = n * 4;
		// the source's PlaneGeometry(1, 1) scaled by size * (.28 + .72 * min(1, age / .065)): half of that each way
		const half = sSize[ i ] * ( .28 + .72 * Math.min( 1, a / .065 ) ) * .5 * K;
		T.aCenter[ q ] = sCenter[ o ]; T.aCenter[ q + 1 ] = sCenter[ o + 1 ]; T.aCenter[ q + 2 ] = sCenter[ o + 2 ]; T.aCenter[ q + 3 ] = half;
		T.aAxisU[ q ] = sU[ o ]; T.aAxisU[ q + 1 ] = sU[ o + 1 ]; T.aAxisU[ q + 2 ] = sU[ o + 2 ]; T.aAxisU[ q + 3 ] = a;
		T.aAxisV[ q ] = sV[ o ]; T.aAxisV[ q + 1 ] = sV[ o + 1 ]; T.aAxisV[ q + 2 ] = sV[ o + 2 ]; T.aAxisV[ q + 3 ] = sSeed[ i ];
		n ++;

	}
	stains.geometry.instanceCount = n;
	for ( const attribute of _instanced ) attribute.needsUpdate = true;

}

/**
 * Diagnostic read-only view for tests and the browser trial.
 *
 * @returns {{ group: boolean, visible: boolean, streams: number, droplets: number, stains: number, jets: Array<{ entity: ?number, origin: Array<number>, dir: Array<number>, head: number, tail: number, limit: number, hitKnown: boolean, hit: boolean, released: boolean }> }}
 * a fresh object: whether the meshes are built and shown, the instance counts written last frame, and every live
 * stream (entity number or null once released; origin and direction in Quake units; head, tail and limit in Quake
 * units along the ray)
 */
export function R_VenomSnapshot() {

	const K = VENOM.unit, jets = [];
	for ( let j = 0; j < J; j ++ ) {

		if ( ! jetUsed[ j ] ) continue;
		const o = j * 3;
		jets.push( { entity: jetEnt[ j ]?._entityIndex ?? ( jetEnt[ j ] ? - 1 : null ), origin: [ jetOrigin[ o ], jetOrigin[ o + 1 ], jetOrigin[ o + 2 ] ],
			dir: [ jetDir[ o ], jetDir[ o + 1 ], jetDir[ o + 2 ] ], head: jetHead[ j ] * K, tail: jetTail[ j ] * K, limit: jetLimit[ j ] * K,
			hitKnown: jetHitKnown[ j ] === 1, hit: jetHit[ j ] === 1, released: jetEnt[ j ] === null } );

	}
	return { group: group !== null, visible: group?.visible === true, streams: streams?.geometry.instanceCount ?? 0,
		droplets: drops?.geometry.instanceCount ?? 0, stains: stains?.geometry.instanceCount ?? 0, jets };

}
