/**
 * @module newer/render/r_lightning
 *
 * The lightning gun's beam (card [30a]).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `deps`, `mesh`, `geometry`, `data`, `cursor`, `power`, `last`,
 * `noise`, `gunHeld`.
 *
 * Errors: throws at 1 place.
 */
// The lightning gun's beam (card [30a], owner request 30). Newer Game only; Classic keeps the native bolt models.
//
// Supplied source: arc-weapons-wall-canvas-shotgun.html (sha256 8b1569225ae5...; kept intact, not copied): ribbonProgram
// (lines 1112-1151), ribbon (1157), boltPath (1169), PLASMA_HOOD_OFFSET (1195) and buildElectricity (1197-1248), its noise
// texture (rng 897234, 256 x 256) and its reference settings (energy, chaos, branches 1). Ported here as written, with these
// adaptations to the game:
//  * the source builds in view space (the eye at the origin, looking down -z); here the same constructions are made in the
//    world with the real camera: "towards the eye" is ( eye - p ), a point's depth is along the camera's forward axis, and the
//    source's view-space offsets use the camera's right, up and forward;
//  * its units: the supplied lightning gun is about 2 units long, Quake's v_light about 25: one source unit is K Quake units;
//  * its gun matrix is the real held gun's (the posed v_light mesh): the plasma hood's recessed root follows the gun, so the
//    gun's own depth hides it; the beam, the electrode arcs and the light stay at the true muzzle (the front of the gun's own
//    geometry, viewModelMuzzles); the electrodes sit either side of the muzzle, as wide as lightningTune sets (the source's gunShape
//    belongs to its own model, not copied);
//  * the end is the server's: the beam's endpoint from TE_LIGHTNING2 (cl_tent.js), which already stops at an enemy or a wall;
//    the beam lives while the game's beam does (its 0.2 s server-time life), with the source's power ramp (up 34/s, down 18/s);
//  * drawn in the game's scene as an additive emissive layer (the r_fireball.js material: depth tested, no depth written,
//    zero into the other G-buffer targets), so walls and the gun hide it; a white light follows the hit point.
// Only the player's own lightning gun (TE_LIGHTNING2 from the view entity) is replaced. The Shambler's and Chthon's lightning,
// the grapple's beam and anything in Classic stay the native bolt models.

import * as THREE from 'three';
import { cvar_t } from '../../engine/common/cvar.js';
import { R_NewerGame } from '../mode.js';
import { MRT_OUT, MRT_ZERO, material } from './r_fireball.js';

export const r_newer_lightning = new cvar_t( 'r_newer_lightning', '1', true );
export const LIGHTNING = Object.freeze( { K: 12, energy: 1, chaos: 1, branches: 1, maxFloats: 64000, light: { key: 0x4c47, radius: 260 } } );
// Fitted to the game against a capture of the supplied page (docs/lightning-2026-10-09.md): in Quake the beam runs almost
// straight into the screen from a muzzle near its middle, so the channel, the hood and the arcs overlap far more than in the
// supplied scene (a gun low on the screen firing up at a wall). The hood is dimmed (its supplied brightness covered the
// channel), the channel twice as wide (Quake's beam reaches hundreds of units, where the supplied width is under a pixel), and
// the electrodes set wider, as in the supplied view. Exported for tests and tuning.
export const lightningTune = { hood: .4, width: 2, spread: .9 };
const PLASMA_HOOD_OFFSET = [ 0, - 0.08, 0.24 ]; // source gun-local (x right, y up, z back), recessed into the receiver
const ELECTRODE = [ .705, - .063, .058 ]; // source: gunShape([±.784,-.237,-2.065]) less the muzzle root [0,-.197,-2.048]

const PI = Math.PI, clamp = ( x, a, b ) => Math.max( a, Math.min( b, x ) ), mix = ( a, b, t ) => a + ( b - a ) * t;
const add = ( a, b ) => [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ], a[ 2 ] + b[ 2 ] ], sub = ( a, b ) => [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];
const mul = ( a, s ) => [ a[ 0 ] * s, a[ 1 ] * s, a[ 2 ] * s ], dot = ( a, b ) => a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];
const cross = ( a, b ) => [ a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ], a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] ];
const norm = a => { const l = Math.hypot( a[ 0 ], a[ 1 ], a[ 2 ] ) || 1; return [ a[ 0 ] / l, a[ 1 ] / l, a[ 2 ] / l ]; };
const lerp3 = ( a, b, t ) => [ mix( a[ 0 ], b[ 0 ], t ), mix( a[ 1 ], b[ 1 ], t ), mix( a[ 2 ], b[ 2 ], t ) ];
// the source's JS noise (hash, noise1, rng), unchanged
function hash( n ) { const x = Math.sin( n * 127.1 + 311.7 ) * 43758.5453123; return x - Math.floor( x ); }
function noise1( x, seed = 0 ) { const i = Math.floor( x ); let f = x - i; f = f * f * ( 3 - 2 * f ); return mix( hash( i + seed * 173.31 ), hash( i + 1 + seed * 173.31 ), f ) * 2 - 1; }
/**
 * The source's seeded random generator (a mulberry32 step), unchanged; used for the noise texture (seed 897234) and
 * for the per-epoch choices of leaders and branches, so the same time gives the same bolt.
 *
 * @param {number} seed any number, taken as an unsigned 32-bit integer
 * @returns {function(): number} a generator of floats in 0..1 (1 excluded); each call advances it
 */
export function rng( seed ) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = Math.imul( s ^ s >>> 15, 1 | s ); t ^= t + Math.imul( t ^ t >>> 7, 61 | t ); return ( ( t ^ t >>> 14 ) >>> 0 ) / 4294967296; }; }

// the source's ribbon shader (ribbonProgram), in the game's material; uEncode is 1 (the game's colour is HDR)
const VERTEX = `
attribute vec4 aData;
attribute vec2 aExtra;
varying float vSide, vAlong, vPower, vKind, vSeed, vLocal;
void main() { vSide = aData.x; vAlong = aData.y; vPower = aData.z; vKind = aData.w; vSeed = aExtra.x; vLocal = aExtra.y; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const FRAGMENT = `${ MRT_OUT }
varying float vSide, vAlong, vPower, vKind, vSeed, vLocal;
uniform float uTime;
uniform sampler2D uNoise;
float n2( vec2 p ) { return texture2D( uNoise, ( p + 0.5 ) / 256.0 ).r; }
float fbm( vec2 p ) { return n2( p ) * .54 + n2( p * 2.07 + 17.2 ) * .27 + n2( p * 4.19 - 8.3 ) * .13 + n2( p * 8.31 + 1.9 ) * .06; }
void main() {
 float x = abs( vSide ); vec3 color;
 if ( vKind < .5 || vKind > 1.5 ) {
  float leader = step( 1.5, vKind );
  float filament = exp( - x * x * mix( 5.55, 9.82, leader ) );
  float inner = exp( - x * x * 2.77 );
  float corona = exp( - x * x * .636 ) * pow( max( 0., 1. - x ), .55 );
  float flow = .88 + .12 * n2( vec2( vAlong * 71. - uTime * 24., vSeed * 9. ) );
  color = ( mix( vec3( 3.1, 7.5, 10. ), vec3( .16, 1.9, 6.1 ), leader ) * filament + vec3( .018, .70, 3.0 ) * inner + vec3( .001, .065, .61 ) * corona ) * vPower * flow * ( 1. - smoothstep( .72, 1., x ) );
 } else {
  float h = vLocal;
  vec2 q = vec2( vSide * 3.4 + vSeed * 21., h * 8. - uTime * 9. );
  float warp = fbm( q * .65 + vec2( 0., - uTime * 1.3 ) );
  float n = fbm( q + vec2( warp * 2.5, 0. ) );
  float edge = 1. - x;
  float density = smoothstep( .42, .78, n + edge * .45 );
  float holes = smoothstep( .22, .57, fbm( q * 1.35 + 17. ) );
  float body = pow( max( edge, 0. ), .80 ) * density;
  float core = exp( - x * x * 13. ) * ( .45 + holes * .55 );
  float fade = pow( max( 0., 1. - h ), 1.32 ) * smoothstep( 0., .055, h );
  color = ( vec3( .015, 1.8, 5.4 ) * body + vec3( 2.7, 5.7, 7.0 ) * core * density ) * fade * vPower;
 }
 gl_FragColor = vec4( color, 0. );
 ${ MRT_ZERO }
}`;

let deps = null, mesh = null, geometry = null, data = null, cursor = 0, power = 0, last = null, noise = null, gunHeld = false;
const view = { eye: [ 0, 0, 0 ], right: [ 1, 0, 0 ], up: [ 0, 0, 1 ], forward: [ 0, 1, 0 ] };
export const lightningStats = { floats: 0, drawn: 0 };
/**
 * Gives the beam its views of the game; called from gl_rmain.js when the renderer sets up a new map. Until then
 * `R_LightningFrame` draws nothing.
 *
 * @param {{scene: THREE.Scene, camera: function(): THREE.Camera,
 *   muzzle: function(): ?{point: Array<number>, matrix: THREE.Matrix4},
 *   beam: function(): ?{end: Array<number>}, allocDlight?: function(number): dlight_t}} externals `scene` the beam is
 *   added to; `camera()` the real camera; `muzzle()` the held v_light's true muzzle (world space) and posed gun matrix,
 *   or null; `beam()` the player's own active TE_LIGHTNING2 endpoint (world space), or null; `allocDlight(key)` for the
 *   light at the hit (CL_AllocDlight). Kept until the next call.
 */
export function R_LightningSetup( externals ) { deps = externals; }
/**
 * @returns {boolean} true in the Newer Game with `r_newer_lightning` on (the player's beam is then drawn here)
 */
export const R_LightningEnabled = () => R_NewerGame() && r_newer_lightning.value !== 0;

/**
 * The ribbon shader's noise texture: the source's 256 x 256 RGBA bytes from `rng(897234)`, repeat-wrapped, linear.
 * Made on first use (when the beam mesh is first built) and kept for the page's lifetime.
 *
 * @returns {THREE.DataTexture} the shared noise texture (do not dispose)
 */
export function R_LightningNoise() {
	if ( noise === null ) {
		const bytes = new Uint8Array( 256 * 256 * 4 ), random = rng( 897234 );
		for ( let i = 0; i < bytes.length; i ++ ) bytes[ i ] = Math.floor( random() * 256 );
		noise = new THREE.DataTexture( bytes, 256, 256, THREE.RGBAFormat );
		noise.wrapS = noise.wrapT = THREE.RepeatWrapping; noise.minFilter = noise.magFilter = THREE.LinearFilter; noise.needsUpdate = true;
	}
	return noise;
}

function build() {
	data = new Float32Array( LIGHTNING.maxFloats );
	geometry = new THREE.BufferGeometry();
	const buffer = new THREE.InterleavedBuffer( data, 9 ); buffer.setUsage( THREE.DynamicDrawUsage );
	geometry.setAttribute( 'position', new THREE.InterleavedBufferAttribute( buffer, 3, 0 ) );
	geometry.setAttribute( 'aData', new THREE.InterleavedBufferAttribute( buffer, 4, 3 ) );
	geometry.setAttribute( 'aExtra', new THREE.InterleavedBufferAttribute( buffer, 2, 7 ) );
	mesh = new THREE.Mesh( geometry, material( VERTEX, FRAGMENT, { uTime: { value: 0 }, uNoise: { value: R_LightningNoise() } }, THREE.AdditiveBlending ) );
	mesh.name = 'quake_lightning'; mesh.frustumCulled = false; mesh.renderOrder = 11; mesh.userData.newerOnly = true; mesh.visible = false;
}

function vertex( p, side, along, a, kind, seed, local ) {
	if ( cursor + 9 > data.length ) throw new Error( 'Lightning vertex budget exceeded.' );
	data[ cursor ++ ] = p[ 0 ]; data[ cursor ++ ] = p[ 1 ]; data[ cursor ++ ] = p[ 2 ];
	data[ cursor ++ ] = side; data[ cursor ++ ] = along; data[ cursor ++ ] = a; data[ cursor ++ ] = kind; data[ cursor ++ ] = seed; data[ cursor ++ ] = local;
}
// source ribbon(): a camera-facing strip, radius in world units (K Quake units each)
function ribbon( points, radius, pow = 1, kind = 0, seed = 0, alongStart = 0, alongEnd = 1, taper = true ) {
	const edge = []; let prior = [ 1, 0, 0 ];
	for ( let i = 0; i < points.length; i ++ ) {
		const t = i / ( points.length - 1 ), p = points[ i ], tangent = norm( sub( points[ Math.min( i + 1, points.length - 1 ) ], points[ Math.max( 0, i - 1 ) ] ) );
		let side = norm( cross( tangent, norm( sub( view.eye, p ) ) ) ); if ( dot( side, prior ) < 0 ) side = mul( side, - 1 ); prior = side;
		const w = ( typeof radius === 'function' ? radius( t ) : radius ) * ( kind === 1 ? 1 : .34 ) * LIGHTNING.K;
		let a = typeof pow === 'function' ? pow( t ) : pow;
		if ( taper ) a *= Math.pow( Math.max( 0, Math.sin( PI * clamp( t, .002, .998 ) ) ), .08 );
		edge.push( { l: add( p, mul( side, - w ) ), r: add( p, mul( side, w ) ), t, a } );
	}
	for ( let i = 0; i < edge.length - 1; i ++ ) {
		const a = edge[ i ], b = edge[ i + 1 ];
		for ( const [ e, s ] of [ [ a, - 1 ], [ a, 1 ], [ b, 1 ], [ a, - 1 ], [ b, 1 ], [ b, - 1 ] ] ) vertex( s < 0 ? e.l : e.r, s, mix( alongStart, alongEnd, e.t ), e.a, kind, seed, e.t );
	}
}
const depthOf = p => dot( sub( p, view.eye ), view.forward );
// source boltPath(): deterministic multi-rate displacement, spaced evenly on the screen (by depth)
function boltPath( start, end, time, seed, amplitude, segments = 68, bow = [ 0, 0, 0 ] ) {
	amplitude *= LIGHTNING.K;
	const delta = sub( end, start ), dir = norm( delta ), U = norm( cross( dir, Math.abs( dot( dir, view.up ) ) > .96 ? view.right : view.up ) ), V = norm( cross( U, dir ) );
	const tick = Math.floor( time * 28 ), blend = clamp( ( time * 28 - tick ) / .18, 0, 1 ), out = []; out.fractions = [];
	const d0 = Math.max( .08 * LIGHTNING.K, depthOf( start ) ), d1 = Math.max( .08 * LIGHTNING.K, depthOf( end ) );
	for ( let i = 0; i <= segments; i ++ ) {
		const screenT = i / segments, s = screenT * d0 / ( d1 * ( 1 - screenT ) + d0 * screenT ); out.fractions.push( s );
		const envelope = Math.pow( Math.sin( PI * s ), .58 );
		const coarse = noise1( s * 8.7 - time * 2.6, seed ), coarse2 = noise1( s * 10.7 - time * 2.1, seed + 37 );
		const a = mix( noise1( s * 47 + tick * .71, seed + 11 ), noise1( s * 47 + ( tick + 1 ) * .71, seed + 11 ), blend );
		const b = mix( noise1( s * 51 + tick * .63, seed + 29 ), noise1( s * 51 + ( tick + 1 ) * .63, seed + 29 ), blend );
		const fine = noise1( s * 115 + tick * 3.72, seed + 101 );
		const amp = amplitude * envelope;
		let p = add( lerp3( start, end, s ), add( mul( U, ( coarse * .64 + a * .27 + fine * .09 ) * amp ), mul( V, ( coarse2 * .65 + b * .35 ) * amp * .75 ) ) );
		p = add( p, mul( bow, Math.sin( s * PI ) ) ); out.push( p );
	}
	return out;
}
function samplePath( path, s ) {
	s = clamp( s, 0, 1 );
	const u = path.fractions; let i = 0; while ( i < u.length - 2 && u[ i + 1 ] < s ) i ++;
	return lerp3( path[ i ], path[ i + 1 ], ( s - u[ i ] ) / Math.max( 1e-6, u[ i + 1 ] - u[ i ] ) );
}
// a source view-space offset ( x right, y up, z back ) in the game's world, K units each
const viewOffset = o => add( add( mul( view.right, o[ 0 ] * LIGHTNING.K ), mul( view.up, o[ 1 ] * LIGHTNING.K ) ), mul( view.forward, - o[ 2 ] * LIGHTNING.K ) );
// the same in the gun's own frame (Quake's gun: +x forward, +y left, +z up)
function gunOffset( matrix, o ) {
	const e = matrix.elements, fwd = norm( [ e[ 0 ], e[ 1 ], e[ 2 ] ] ), left = norm( [ e[ 4 ], e[ 5 ], e[ 6 ] ] ), up = norm( [ e[ 8 ], e[ 9 ], e[ 10 ] ] );
	return add( add( mul( left, - o[ 0 ] * LIGHTNING.K ), mul( up, o[ 1 ] * LIGHTNING.K ) ), mul( fwd, - o[ 2 ] * LIGHTNING.K ) );
}

// source buildElectricity()
function buildElectricity( t, muzzle, target, gunMatrix, energyIn ) {
	cursor = 0; if ( energyIn < .003 ) return;
	const chaos = LIGHTNING.chaos, energy = LIGHTNING.energy * energyIn, branches = LIGHTNING.branches;
	const mainPath = boltPath( muzzle, target, t, 11, .45 * chaos, 74 );
	ribbon( mainPath, s => .175 * lightningTune.width * ( 1 + .32 * Math.exp( - s * 19 ) ), energy * .90, 0, 12, 0, 1, false );
	for ( let j = 0; j < 2; j ++ ) {
		const path = boltPath( muzzle, target, t + .08 * j, 56 + j * 37, ( .55 + j * .10 ) * chaos, 60 );
		ribbon( path, s => ( .055 + j * .012 ) * ( 1 + .25 * Math.exp( - s * 13 ) ), energy * ( j === 0 ? .16 : .065 ), 2, 43 + j, 0, 1, false );
	}
	const hoodOrigin = add( muzzle, gunOffset( gunMatrix, PLASMA_HOOD_OFFSET ) );
	for ( let j = 0; j < 2; j ++ ) {
		const path = [], endS = .105 + j * .020;
		for ( let i = 0; i <= 30; i ++ ) path.push( lerp3( hoodOrigin, samplePath( mainPath, endS ), i / 30 ) );
		if ( lightningTune.hood > 0 ) ribbon( path, s => ( .39 - j * .039 ) * ( 1 - s * .87 ) * ( 1 + .18 * Math.sin( s * 19 - t * 11 + j ) ), energy * ( .73 - j * .18 ) * lightningTune.hood, 1, 3 + j, 0, endS, false );
	}
	for ( const side of [ - 1, 1 ] ) {
		const start = add( muzzle, gunOffset( gunMatrix, [ side * ELECTRODE[ 0 ] * lightningTune.spread, ELECTRODE[ 1 ], ELECTRODE[ 2 ] ] ) );
		const end = add( muzzle, viewOffset( [ side * .006, .038, - .03 ] ) );
		const path = boltPath( start, end, t, side > 0 ? 91 : 138, .115 * chaos, 32, viewOffset( [ 0, .047, 0 ] ) );
		ribbon( path, s => .042 * ( .72 + .28 * Math.sin( s * PI ) ), energy * .73, 2, side + 88, 0, .08, false );
		for ( let k = 0; k < 2; k ++ ) {
			const epoch = Math.floor( t * 12 + k * .47 + side * 2.7 ), r = rng( epoch * 1739 + k * 251 + ( side + 2 ) * 4901 );
			const leaderEnd = add( muzzle, viewOffset( [ side * ( .13 + r() * .19 ), .23 + r() * .38, - .20 - r() * .56 ] ) );
			const leader = boltPath( lerp3( start, muzzle, .40 + k * .21 ), leaderEnd, t, 300 + k + side * 8, .11 * chaos, 17, viewOffset( [ side * .04, .015, 0 ] ) );
			ribbon( leader, s => .047 * Math.pow( 1 - s, .8 ) + .003, energy * ( .23 + r() * .20 ) * branches, 2, epoch, 0, .09, true );
		}
	}
	const branchCount = Math.round( 8 * branches );
	for ( let j = 0; j < branchCount; j ++ ) {
		const phase = t * ( 8 + ( j % 4 ) * 1.7 ) + j * .731, epoch = Math.floor( phase ), age = phase - epoch;
		const r = rng( epoch * 15271 + j * 1777 + 2971 ); if ( r() > .84 ) continue;
		const s = .015 + Math.pow( r(), 2.2 ) * .38, start = samplePath( mainPath, s );
		const side = r() > .5 ? 1 : - 1, len = .15 + r() * .70 + ( s > .13 ? .30 : 0 );
		const end = add( start, viewOffset( [ side * len, ( r() - .24 ) * len * 1.3, - len * ( .6 + r() * 2.6 ) ] ) );
		const path = boltPath( start, end, t, 1000 + j * 31, .18 * chaos * ( .7 + len ), 15 + j % 8, viewOffset( [ side * len * .1, len * .05, 0 ] ) );
		const envelope = Math.pow( Math.sin( PI * age ), .4 );
		ribbon( path, x => ( .034 + ( 1 - s ) * .026 ) * Math.pow( 1 - x, 1.05 ) + .0015, energy * ( .14 + r() * .22 ) * envelope, 2, j + 7, s, s + .12, true );
		if ( j % 3 === 0 ) { const at = samplePath( path, .48 ), to = add( at, viewOffset( [ side * len * .48, len * .27, - len * .44 ] ) ); ribbon( boltPath( at, to, t, j + 601, .10 * chaos, 9 ), x => .022 * ( 1 - x ) + .001, energy * .12 * envelope, 2, j + 33, s, s + .08, true ); }
	}
}

/**
 * Builds and shows the beam every frame, after the held gun is placed (`R_RenderView`, gl_rmain.js), when the
 * player's own TE_LIGHTNING2 is active and the v_light is held. Rebuilds the source's electricity (channel, leaders,
 * plasma hood, electrode arcs, branches) in world space from the real camera, writes only the built range of the
 * interleaved buffer, and puts a white light (radius 260, lives 0.1 s) at the hit. Power rises at the source's 34 a
 * second; its fall (18) is not used: when the server's beam is over there is nothing to draw it to, so it goes at
 * once. The mesh is created on the first wanted frame and re-added to `deps.scene` if it was removed.
 *
 * @param {number} time client time, seconds (`cl.time`); the step since the last call is clamped to 0..0.15 s
 * @returns {number} the number of floats drawn (9 per vertex); 0 when nothing is drawn. Also updates `lightningStats`.
 * @throws {Error} 'Lightning vertex budget exceeded.' when the bolt would need more than `LIGHTNING.maxFloats`
 *   (64000) floats (a guard: the current segment counts use about half)
 */
export function R_LightningFrame( time ) {
	if ( deps === null ) return 0;
	const dt = last === null ? 0 : clamp( time - last, 0, .15 ); last = time;
	const beam = R_LightningEnabled() ? deps.beam?.() : null, gun = beam ? deps.muzzle?.() : null;
	const wanted = beam && gun ? 1 : 0;
	gunHeld = gun != null;
	// the source's rise (34 a second); its fall (18) is not used: when the server's beam is over there is nothing to
	// draw it to, so it goes at once
	power = wanted ? mix( power, 1, 1 - Math.exp( - dt * 34 ) ) : 0;
	if ( mesh === null ) { if ( ! wanted ) return 0; build(); }
	if ( mesh.parent !== deps.scene ) deps.scene?.add( mesh );
	if ( ! wanted ) { mesh.visible = false; lightningStats.floats = 0; return 0; }
	const camera = deps.camera(); camera.updateMatrixWorld();
	const e = camera.matrixWorld.elements;
	view.eye = [ e[ 12 ], e[ 13 ], e[ 14 ] ]; view.right = norm( [ e[ 0 ], e[ 1 ], e[ 2 ] ] ); view.up = norm( [ e[ 4 ], e[ 5 ], e[ 6 ] ] ); view.forward = norm( [ - e[ 8 ], - e[ 9 ], - e[ 10 ] ] );
	buildElectricity( time, gun.point, beam.end, gun.matrix, Math.max( power, .05 ) );
	const buffer = geometry.attributes.position.data; buffer.clearUpdateRanges(); buffer.addUpdateRange( 0, cursor ); buffer.needsUpdate = true; // (only what was built)
	geometry.setDrawRange( 0, cursor / 9 );
	mesh.material.uniforms.uTime.value = time; mesh.visible = cursor > 0;
	lightningStats.floats = cursor; lightningStats.drawn ++;
	// the light it throws, at the hit
	if ( deps.allocDlight ) { const dl = deps.allocDlight( LIGHTNING.light.key ); dl.origin[ 0 ] = beam.end[ 0 ]; dl.origin[ 1 ] = beam.end[ 1 ]; dl.origin[ 2 ] = beam.end[ 2 ]; dl.radius = LIGHTNING.light.radius; dl.die = time + .1; dl.decay = 0; }
	return cursor;
}

/**
 * Is the player's beam drawn here this frame? Then its native bolt models are left out (R_DrawEntitiesOnList, which
 * runs before the gun is placed: whether the gun was held is the last frame's, the beam and the pass are this frame's).
 *
 * @returns {boolean} true when the native bolt models of the player's lightning should be skipped
 */
export const R_LightningTakesBeam = () => R_LightningEnabled() && gunHeld && deps?.beam?.() != null;

/**
 * Stops the beam at a new map (gl_rmain.js, with the other effect resets): zero power and clock, hides the mesh and
 * takes it out of its scene (it is kept for reuse), and zeroes `lightningStats.floats`.
 */
export function R_LightningClear() { power = 0; last = null; cursor = 0; gunHeld = false; if ( mesh ) { mesh.visible = false; mesh.parent?.remove( mesh ); } lightningStats.floats = 0; }
