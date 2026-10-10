/**
 * @module newer/render/r_waves
 *
 * Real ripples on pools and portals (card [W1]): a wave simulation that reflects off edges.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `deps`, `texture`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Real ripples (card [W1], owner request 9 Oct 2026: "ripples should interact with each other and surrounding edges, we are looking
// for realism"; on portals "a metallic ripple effect NOT rings"). Newer Game only.
//
// What is hit gets a wave field: a small height field that is stepped with the 2D wave equation every frame, so ripples spread,
// pass through and add to each other, and reflect off whatever bounds them. The shaders read the field's height and slope and bend
// what is seen through and reflected in the surface by it (gl_post.js for water, gl_portal.js for portals).
//
//  * Water: a field of SIZE x SIZE cells, WATER.cell units each, centred where the surface was hit, on the surface's height. Its
//    cells are found from the BSP: water below the surface and no liquid or solid just above it. A cell next to a wall reflects
//    as water does at a wall (the height's slope across it is zero), so the rings come back off the pool's sides and off anything
//    standing in it. Where the field's square ends inside open water a sponge layer soaks the waves up instead (the pool goes on).
//    An impact pushes in a crater with a raised rim and, a moment later, the rebound jet, which makes the train of crests a drop
//    or a shot leaves in real water.
//  * Portals (a teleporter's window, a slipgate onto the next level): a field over the window's plane. The window's own outline
//    (its polygons when it has them, else its box) clamps it like a struck sheet of metal held in a frame: the waves are fast,
//    ring for a while and reflect off the frame with their sign turned over.
//
// Fields are owned here, at most WATER.fields + METAL.fields at once (the quietest goes when another is needed), and dropped when
// their waves have died away or the level changes. They are uploaded to one half-float texture (`R_WaveTexture`), a SIZE x SIZE
// slot per field; `waterWave` and `metalWave` describe the slots to the shaders. Picture only: nothing reaches the game.
//
// Events come from the impact detector (r_impactripples.js) through `R_WaveImpact`; `R_WavesFrame( time )` steps and uploads.

import * as THREE from 'three';
import { r_impactripples } from './r_impactripples.js';
import { R_NewerGame } from '../mode.js';

export const SIZE = 128; // cells a side of a field's slot
export const WATER = Object.freeze( { fields: 4, cell: 3, speed: 66, keep: .85, sponge: 12, radius: 5, depth: 9, jet: { delay: .11, scale: .55, radius: .6 } } );
export const METAL = Object.freeze( { fields: 4, minCell: 1.5, speed: 170, keep: .6, radius: 3.5, depth: 5 } );
const SLOTS = WATER.fields + METAL.fields;
const QUIET = .02; // a field whose highest wave is below this (units, too small to see) for a second is dropped
const MAX_STEPS = 16; // per field per frame (a long frame does not run away)

let deps = null;
// externals: contents( [ x, y, z ] ) -> BSP contents or undefined (water -3, slime -4, solid -2, air -1); waterOn() -> are the water
// optics drawn (r_newer_water: with them off the water is the plain opaque surface, and no ripples are drawn on it)
export function R_WavesSetup( externals ) { deps = externals; }

// the texture the shaders read: SLOTS slots side by side, each SIZE x SIZE cells
const data = new Uint16Array( SIZE * SLOTS * SIZE );
let texture = null;
export function R_WaveTexture() {

	if ( texture === null ) {

		texture = new THREE.DataTexture( data, SIZE * SLOTS, SIZE, THREE.RedFormat, THREE.HalfFloatType );
		texture.minFilter = texture.magFilter = THREE.LinearFilter;
		texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.generateMipmaps = false;
		texture.needsUpdate = true;

	}
	return texture;

}

// the slots, for the shaders. Water: ( x, y ) of the field's corner, its surface height, its cell size (0: unused). Metal: the
// corner ( xyz, cell size ), and the field's two axes in the plane ( xyz, cells along it ).
export const waterWave = new Float32Array( WATER.fields * 4 );
export const metalWave = { origin: new Float32Array( METAL.fields * 4 ), u: new Float32Array( METAL.fields * 4 ), v: new Float32Array( METAL.fields * 4 ) };

const fields = new Array( SLOTS ).fill( null );
export const R_WaveFields = () => fields.filter( f => f !== null );

export function R_WavesReset() {

	fields.fill( null );
	data.fill( 0 );
	waterWave.fill( 0 ); metalWave.origin.fill( 0 ); metalWave.u.fill( 0 ); metalWave.v.fill( 0 );
	if ( texture !== null ) texture.needsUpdate = true;
	R_WavesFrame.last = undefined;

}

const isLiquid = c => c === - 3 || c === - 4;

function newField( kind, slot, origin, U, V, cell, nx, ny, speed, keep ) {

	// steps fine enough to keep the explicit scheme stable (the wave moves under half a cell a step)
	const rate = Math.max( 60, Math.ceil( speed / ( .45 * cell ) ) );
	const C = speed / rate / cell;
	return {
		kind, slot, origin, U, V, N: cross( U, V ), cell, nx, ny, rate, C2: C * C, damp: Math.pow( keep, 2 / rate ), // (of the motion, which halves its effect: the waves keep `keep` of their height a second)
		h: new Float32Array( nx * ny ), p: new Float32Array( nx * ny ), mask: new Uint8Array( nx * ny ), sponge: null,
		clock: null, peak: 0, quietFor: 0, pending: [], key: null, z: origin[ 2 ]
	};

}

function cross( a, b ) { return [ a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ], a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] ]; }

// a slot for a new field of this kind: a free one, else the quietest
function slotFor( kind ) {

	const first = kind === 0 ? 0 : WATER.fields, count = kind === 0 ? WATER.fields : METAL.fields;
	let best = - 1;
	for ( let s = first; s < first + count; s ++ ) {

		if ( fields[ s ] === null ) return s;
		if ( best < 0 || fields[ s ].peak < fields[ best ].peak ) best = s;

	}
	return best;

}

// the sponge (the same for every water field): where the field's square ends, the pool may not
const SPONGE = new Float32Array( SIZE * SIZE );
for ( let j = 0; j < SIZE; j ++ ) for ( let i = 0; i < SIZE; i ++ ) {

	const d = Math.min( i, j, SIZE - 1 - i, SIZE - 1 - j ), s = Math.max( 0, ( WATER.sponge - d ) / WATER.sponge );
	SPONGE[ j * SIZE + i ] = 1 - .12 * s * s;

}

// Water: a field centred on ( x, y ) at the surface height z
function waterField( x, y, z ) {

	const slot = slotFor( 0 ), cell = WATER.cell, half = SIZE * cell / 2;
	const f = newField( 0, slot, [ x - half, y - half, z ], [ 1, 0, 0 ], [ 0, 1, 0 ], cell, SIZE, SIZE, WATER.speed, WATER.keep );
	const p = [ 0, 0, 0 ], contents = deps.contents;
	for ( let j = 1; j < SIZE - 1; j ++ ) for ( let i = 1; i < SIZE - 1; i ++ ) {

		p[ 0 ] = f.origin[ 0 ] + ( i + .5 ) * cell; p[ 1 ] = f.origin[ 1 ] + ( j + .5 ) * cell;
		p[ 2 ] = z - 3; const below = contents( p );
		p[ 2 ] = z + 3; const above = contents( p );
		f.mask[ j * SIZE + i ] = isLiquid( below ) && above !== undefined && ! isLiquid( above ) && above !== - 2 ? 1 : 0;

	}
	f.sponge = SPONGE;
	// the cells beside the water, for the shader's slopes (r_waves keeps a wall level-sloped; the texture must too)
	f.shore = [];
	for ( let j = 1; j < SIZE - 1; j ++ ) for ( let i = 1; i < SIZE - 1; i ++ ) {

		const k = j * SIZE + i;
		if ( f.mask[ k ] ) continue;
		const wet = [ k - 1, k + 1, k - SIZE, k + SIZE ].filter( q => f.mask[ q ] );
		if ( wet.length ) f.shore.push( k, wet );

	}
	return f;

}

// Metal: a field over a portal's plane { normal, center, min, max, polygons? }
function metalField( plane ) {

	const n = plane.normal, slot = slotFor( 1 );
	const seed = Math.abs( n[ 2 ] ) < .9 ? [ - n[ 1 ], n[ 0 ], 0 ] : [ 1, 0, 0 ], along = dot( seed, n );
	const U = normalise( [ 0, 1, 2 ].map( a => seed[ a ] - n[ a ] * along ) ), V = cross( n, U ); // (in the plane, however it leans)
	let u0 = Infinity, u1 = - Infinity, v0 = Infinity, v1 = - Infinity;
	const pts = plane.polygons?.length ? plane.polygons.flat() : [ 0, 1, 2, 3, 4, 5, 6, 7 ].map( b => [ 0, 1, 2 ].map( a => ( b >> a ) & 1 ? plane.max[ a ] : plane.min[ a ] ) );
	for ( const q of pts ) {

		const d = [ q[ 0 ] - plane.center[ 0 ], q[ 1 ] - plane.center[ 1 ], q[ 2 ] - plane.center[ 2 ] ];
		const a = dot( d, U ), b = dot( d, V );
		u0 = Math.min( u0, a ); u1 = Math.max( u1, a ); v0 = Math.min( v0, b ); v1 = Math.max( v1, b );

	}
	const cell = Math.max( METAL.minCell, Math.max( u1 - u0, v1 - v0 ) / ( SIZE - 4 ) );
	const nx = Math.min( SIZE, Math.ceil( ( u1 - u0 ) / cell ) + 2 ), ny = Math.min( SIZE, Math.ceil( ( v1 - v0 ) / cell ) + 2 );
	const origin = [ 0, 1, 2 ].map( a => plane.center[ a ] + U[ a ] * ( u0 - cell ) + V[ a ] * ( v0 - cell ) );
	const f = newField( 1, slot, origin, U, V, cell, nx, ny, METAL.speed, METAL.keep );
	// the frame: the window's own outline (a ring is round), else its box
	const outline = plane.polygons?.length ? plane.polygons.map( poly => poly.map( q => { const d = [ 0, 1, 2 ].map( a => q[ a ] - origin[ a ] ); return [ dot( d, U ) / cell, dot( d, V ) / cell ]; } ) ) : null;
	for ( let j = 1; j < ny - 1; j ++ ) for ( let i = 1; i < nx - 1; i ++ ) f.mask[ j * nx + i ] = outline === null || outline.some( poly => inside( poly, i + .5, j + .5 ) ) ? 1 : 0;
	f.key = plane;
	return f;

}

const dot = ( a, b ) => a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];
function normalise( a ) { const l = Math.hypot( ...a ) || 1; return a.map( x => x / l ); }
function inside( poly, x, y ) {

	let hit = false;
	for ( let i = 0, j = poly.length - 1; i < poly.length; j = i ++ ) {

		const [ xi, yi ] = poly[ i ], [ xj, yj ] = poly[ j ];
		if ( ( yi > y ) !== ( yj > y ) && x < ( xj - xi ) * ( y - yi ) / ( yj - yi ) + xi ) hit = ! hit;

	}
	return hit;

}

// push a dent (amp < 0) or a bump (amp > 0) of the given radius (units) into the field, at rest (the same into both time levels,
// so it starts with no velocity): a crater with its rim, the 2D Laplacian of a Gaussian, whose rim holds the water the crater
// pushed out (it adds none)
function disturb( f, s, t, amp, radius ) {

	const sigma = Math.max( radius / f.cell, .8 ), reach = Math.ceil( sigma * 4 );
	const i0 = Math.max( 1, Math.floor( s - reach ) ), i1 = Math.min( f.nx - 2, Math.ceil( s + reach ) );
	const j0 = Math.max( 1, Math.floor( t - reach ) ), j1 = Math.min( f.ny - 2, Math.ceil( t + reach ) );
	for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

		const k = j * f.nx + i;
		if ( ! f.mask[ k ] ) continue;
		const r2 = ( ( i + .5 - s ) ** 2 + ( j + .5 - t ) ** 2 ) / ( 2 * sigma * sigma ), v = amp * ( 1 - r2 ) * Math.exp( - r2 );
		f.h[ k ] += v; f.p[ k ] += v;

	}
	f.quietFor = 0; f.peak = Math.max( f.peak, Math.abs( amp ) );

}

// An impact: kind 0 water at ( x, y, z ) on the surface, kind 1 a portal's plane hit at ( x, y, z ); strength 0..1.
export function R_WaveImpact( kind, x, y, z, strength, time, plane = null ) {

	if ( deps === null || ! ( strength > 0 ) ) return null;
	let f = null;
	if ( kind === 0 ) {

		const margin = ( WATER.sponge + 4 ) * WATER.cell;
		f = fields.find( g => g !== null && g.kind === 0 && Math.abs( g.z - z ) < 2 && x > g.origin[ 0 ] + margin && x < g.origin[ 0 ] + SIZE * g.cell - margin && y > g.origin[ 1 ] + margin && y < g.origin[ 1 ] + SIZE * g.cell - margin ) ?? null;
		if ( f === null ) { if ( deps.contents == null || deps.waterOn?.() === false ) return null; f = waterField( x, y, z ); fields[ f.slot ] = f; clearSlot( f.slot ); }

	} else {

		if ( plane === null ) return null;
		f = fields.find( g => g !== null && g.kind === 1 && g.key === plane ) ?? null;
		if ( f === null ) { f = metalField( plane ); fields[ f.slot ] = f; clearSlot( f.slot ); }

	}
	const d = [ x - f.origin[ 0 ], y - f.origin[ 1 ], z - f.origin[ 2 ] ], s = dot( d, f.U ) / f.cell, t = dot( d, f.V ) / f.cell;
	if ( kind === 0 ) {

		disturb( f, s, t, - WATER.depth * strength, WATER.radius * ( .7 + .3 * strength ) );
		f.pending.push( { at: time + WATER.jet.delay, s, t, amp: WATER.depth * WATER.jet.scale * strength, radius: WATER.radius * WATER.jet.radius } );

	} else disturb( f, s, t, - METAL.depth * strength, METAL.radius );
	if ( f.clock === null ) f.clock = time;
	return f;

}

function clearSlot( slot ) {

	const row = SIZE * SLOTS;
	for ( let j = 0; j < SIZE; j ++ ) data.fill( 0, j * row + slot * SIZE, j * row + slot * SIZE + SIZE );
	if ( texture !== null ) texture.needsUpdate = true;

}

// one step of the wave equation, the new heights written over the old-old ones
function step( f ) {

	const { nx, ny, mask, sponge, C2, damp } = f, h = f.h, p = f.p, free = f.kind === 0;
	let peak = 0;
	for ( let j = 1; j < ny - 1; j ++ ) for ( let i = 1, k = j * nx + 1; i < nx - 1; i ++, k ++ ) {

		if ( ! mask[ k ] ) { p[ k ] = 0; continue; }
		const c = h[ k ];
		// a neighbour that is not part of the surface: water at a wall keeps a level slope (reflects as it is), a framed sheet is
		// held still (reflects turned over)
		const l = mask[ k - 1 ] ? h[ k - 1 ] : free ? c : 0, r = mask[ k + 1 ] ? h[ k + 1 ] : free ? c : 0;
		const d = mask[ k - nx ] ? h[ k - nx ] : free ? c : 0, u = mask[ k + nx ] ? h[ k + nx ] : free ? c : 0;
		let v = c + ( c - p[ k ] ) * damp + C2 * ( l + r + d + u - 4 * c );
		if ( sponge !== null ) v *= sponge[ k ];
		p[ k ] = v;
		const a = v < 0 ? - v : v; if ( a > peak ) peak = a;

	}
	f.h = p; f.p = h; f.peak = peak;

}

// float to half float (round to nearest; small values flush to zero, which is all a wave's height needs)
const _f = new Float32Array( 1 ), _u = new Uint32Array( _f.buffer );
function half( x ) {

	if ( x !== x ) return 0; // (a NaN shows as still water, not a spike)
	_f[ 0 ] = x; const b = _u[ 0 ], sign = ( b >>> 16 ) & 0x8000, e = ( ( b >>> 23 ) & 0xff ) - 112;
	if ( e <= 0 ) return sign;
	if ( e >= 31 ) return sign | 0x7bff;
	return sign | Math.min( ( e << 10 ) + ( ( ( b & 0x7fffff ) + 0x1000 ) >>> 13 ), 0x7bff ); // (a rounding carry goes into the exponent)

}

function upload( f ) {

	const row = SIZE * SLOTS, base = f.slot * SIZE, h = f.h;
	for ( let j = 0; j < f.ny; j ++ ) for ( let i = 0; i < f.nx; i ++ ) data[ j * row + base + i ] = half( h[ j * f.nx + i ] );
	// a cell beside the water holds its water neighbours' level, so the shader's slope across the shore is the water's own (level
	// at a wall), not a cliff down to zero
	const shore = f.shore;
	if ( shore ) for ( let q = 0; q < shore.length; q += 2 ) {

		const k = shore[ q ], wet = shore[ q + 1 ];
		let sum = 0; for ( const w of wet ) sum += h[ w ];
		data[ Math.floor( k / f.nx ) * row + base + k % f.nx ] = half( sum / wet.length );

	}

}

function describe( f ) {

	if ( f.kind === 0 ) { const o = f.slot * 4; waterWave[ o ] = f.origin[ 0 ]; waterWave[ o + 1 ] = f.origin[ 1 ]; waterWave[ o + 2 ] = f.z; waterWave[ o + 3 ] = f.cell; return; }
	const o = ( f.slot - WATER.fields ) * 4, m = metalWave;
	for ( let a = 0; a < 3; a ++ ) { m.origin[ o + a ] = f.origin[ a ]; m.u[ o + a ] = f.U[ a ]; m.v[ o + a ] = f.V[ a ]; }
	m.origin[ o + 3 ] = f.cell; m.u[ o + 3 ] = f.nx; m.v[ o + 3 ] = f.ny;

}

function forget( f ) {

	fields[ f.slot ] = null; clearSlot( f.slot );
	if ( f.kind === 0 ) waterWave.fill( 0, f.slot * 4, f.slot * 4 + 4 );
	else { const o = ( f.slot - WATER.fields ) * 4; metalWave.origin.fill( 0, o, o + 4 ); metalWave.u.fill( 0, o, o + 4 ); metalWave.v.fill( 0, o, o + 4 ); }

}

// Every frame: step each live field up to `time` and upload it. Returns how many fields are live.
export function R_WavesFrame( time ) {

	if ( time < ( R_WavesFrame.last ?? - Infinity ) - 1 ) R_WavesReset(); // the clock jumped back (a demo loop, a new game)
	R_WavesFrame.last = time;
	if ( r_impactripples.value === 0 || ! R_NewerGame() ) { if ( fields.some( f => f !== null ) ) R_WavesReset(); R_WavesFrame.last = time; return 0; } // (switched off, or Classic: what is alive goes now)
	let live = 0, changed = false;
	for ( const f of fields ) {

		if ( f === null ) continue;
		if ( f.clock === null || time < f.clock ) { f.clock = time; continue; }
		let steps = Math.floor( ( time - f.clock ) * f.rate );
		if ( steps > MAX_STEPS ) { f.clock = time - MAX_STEPS / f.rate; steps = MAX_STEPS; }
		for ( let n = 0; n < steps; n ++ ) {

			const now = f.clock + ( n + 1 ) / f.rate;
			for ( let q = f.pending.length - 1; q >= 0; q -- ) if ( f.pending[ q ].at <= now ) { const e = f.pending[ q ]; f.pending.splice( q, 1 ); disturb( f, e.s, e.t, e.amp, e.radius ); }
			step( f );

		}
		f.clock += steps / f.rate;
		if ( steps > 0 ) changed = true;
		if ( f.peak < QUIET && f.pending.length === 0 ) f.quietFor += steps / f.rate; else f.quietFor = 0;
		if ( f.quietFor > 1 ) { forget( f ); changed = true; continue; }
		if ( steps > 0 || f.fresh !== false ) { upload( f ); f.fresh = false; changed = true; }
		describe( f ); live ++;

	}
	if ( changed && texture !== null ) texture.needsUpdate = true;
	return live;

}

// how many water fields are live (the present pass bends the picture of the water only while one is)
export function R_WaterWavesLive() { let n = 0; for ( let s = 0; s < WATER.fields; s ++ ) if ( fields[ s ] !== null ) n ++; return n; }

// a shader's view of the slots (GLSL), for gl_post.js and gl_portal.js: the wave's height and its slope along the field's axes
export const WAVE_GLSL = `
uniform sampler2D tWaves;
// height, slope along u and along v (units per unit) of the field in slot ( row 0, slot index ), at cell coordinates ( s, t )
vec3 waveSample( float slot, vec2 st, float cell ) {
	vec2 inv = vec2( ${ ( 1 / ( SIZE * SLOTS ) ).toFixed( 10 ) }, ${ ( 1 / SIZE ).toFixed( 10 ) } );
	vec2 base = vec2( slot * ${ SIZE.toFixed( 1 ) }, 0.0 ) + st;
	float h = texture2D( tWaves, base * inv ).r;
	float hl = texture2D( tWaves, ( base - vec2( 1.0, 0.0 ) ) * inv ).r, hr = texture2D( tWaves, ( base + vec2( 1.0, 0.0 ) ) * inv ).r;
	float hd = texture2D( tWaves, ( base - vec2( 0.0, 1.0 ) ) * inv ).r, hu = texture2D( tWaves, ( base + vec2( 0.0, 1.0 ) ) * inv ).r;
	return vec3( h, ( hr - hl ) / ( 2.0 * cell ), ( hu - hd ) / ( 2.0 * cell ) );
}
`;
