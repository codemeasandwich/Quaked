/**
 * @module newer/render/r_smoketrail
 *
 * Rocket and grenade smoke ("01 RPG smoke"), from the supplied FieldLab FX3D effects.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `head`, `count`, `counter`; 1 module-level collection (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// "01 RPG smoke" from the owner-supplied FieldLab FX3D source (SHA-256 7e35fc80...c7d6,
// kept local): the supplied smoke for rocket and grenade trails. Source lines: emitSmoke
// 191, updateSmoke 192, smokeList 193, render 212, configs.smoke 228. The puff shader and
// textures are shared with the 04 Fireball: r_fireball.js owns the puff layer and draws these.
//
// This file is the pure part: the pool of live puffs, distance-based emission and the
// source's per-puff motion. It never touches the renderer.
//
// What the source does, and what changes for Quake:
//  * The source emits by TIME (48 puffs/s) behind a slow demo rocket. A Quake rocket is ~30x
//    faster, so that would leave beads ~20 units apart. Puffs are emitted by DISTANCE along
//    each frame's travelled segment instead, at a fixed spacing, with a carry per trail so
//    the same flight gives the same puffs at any frame rate.
//  * The source's smoke lives 4.4-5.6 s. Its whole evolution (growth, drift, fade) is played
//    `timeScale` times faster, so a Quake-length flight shows the full look.
//  * Per-puff alpha is raised for the wider spacing and lowered for the larger puffs (see
//    `alphaBoost`), so overlap x alpha, and so the look of the trail, matches the source's.
//
// Coordinates: puffs are stored in the source's space (y up, source units) because the
// source's drift terms assume it; (x, y, z) Quake = (x, z, y) source, in units of `unit`.
import { smooth, hashJS } from './fx_math.js';

export const SMOKE = Object.freeze( {
	// configs.smoke defaults
	density: .25, spread: .5, wind: 0,
	unit: 24,          // Quake units per source unit (as r_fireball.js)
	spacing: 3,        // Quake units between puffs along the path (the native trail's own)
	sizeScale: 1.6,    // puffs are drawn this much larger, so neighbours overlap into a wisp, not beads
	nearFade: [ 24, 110 ], // Quake units: puffs closer than this to the eye fade out (a missile leaves the
	                   // player's own muzzle; end-on, an undimmed trail would be a wall of white)
	timeScale: 2.2,    // source seconds per real second
	cap: 1024,         // live puffs, all trails together (the oldest yields)
	jump: 256,         // a segment longer than this is a teleport and is never bridged
	noseRocket: .45,   // source units behind the rocket's centre where its smoke starts
	noseGrenade: 0,
	staleAfter: .5,    // a trail not extended for this long starts afresh (a new missile)
	maxTrails: 64
} );

// the source's own spacing: its rocket flies one flight() cycle (a 6.1205 su path, measured numerically)
// every 7 / 1.8 s and emits 48 puffs/s
const SOURCE_SPACING = 6.1205 / ( 7 / 1.8 ) / 48;
// overlap of neighbours ~ (size / spacing); keep (overlap x alpha) equal to the source's
export const alphaBoost = ( SMOKE.spacing / SMOKE.unit ) / SOURCE_SPACING / SMOKE.sizeScale;

// --- the pool: a ring ordered by birth, so dead puffs are always found at the tail ------
const N = SMOKE.cap;
const px = new Float64Array( N ), py = new Float64Array( N ), pz = new Float64Array( N );
const dx = new Float64Array( N ), dy = new Float64Array( N ), dz = new Float64Array( N );
const born = new Float64Array( N ), life = new Float64Array( N ), seeds = new Float64Array( N ), tiles = new Uint8Array( N );
let head = 0, count = 0, counter = 0;

// per-trail carry: the distance travelled since that trail's last puff
const trails = new Map();

/**
 * Empties the puff pool and forgets every trail's carry. Called by r_fireball.js on a new level, outside Newer
 * Game, and when the client clock jumps back (a demo loop, a new game).
 */
export function R_SmokeTrailClear() { head = 0; count = 0; counter = 0; trails.clear(); }
/**
 * Size of the puff pool, for tests and diagnostics.
 *
 * @returns {number} live puffs in the pool, 0..`SMOKE.cap` (1024); includes puffs not yet culled by
 *   `forEachSmoke`
 */
export function R_SmokeTrailCount() { return count; }

function push( sx, sy, sz, ux, uy, uz, t, seed ) {

	let slot;
	if ( count === N ) { slot = head; head = ( head + 1 ) % N; } // full: the oldest yields
	else { slot = ( head + count ) % N; count ++; }
	px[ slot ] = sx; py[ slot ] = sy; pz[ slot ] = sz; dx[ slot ] = ux; dy[ slot ] = uy; dz[ slot ] = uz;
	born[ slot ] = t; seeds[ slot ] = seed; life[ slot ] = 4.4 + seed * 1.2; tiles[ slot ] = Math.floor( hashJS( seed * 120 ) * 16 );

}

/**
 * Emit puffs along start->end (Quake units) for the trail `key`, every `SMOKE.spacing` (3) units, carrying the
 * remainder to the next segment so the same flight gives the same puffs at any frame rate. Called by
 * r_fireball.js `R_SmokeTrail` once per rocket/grenade per frame. A trail unseen for `SMOKE.staleAfter`
 * seconds (or stamped more than 1 s in the future) starts afresh; a segment longer than `SMOKE.jump` (256) is a
 * teleport and is never bridged. When the pool is full the oldest puff yields.
 *
 * @param {ArrayLike<number>} start segment start, Quake units, world space
 * @param {ArrayLike<number>} end segment end, Quake units, world space
 * @param {boolean} rocket true for a rocket (smoke starts `noseRocket` source units behind it), false for a grenade
 * @param {*} key trail identity, the entity number (at most `SMOKE.maxTrails` are remembered)
 * @param {number} time client time now, seconds
 * @param {number} dt how long the segment took, seconds (puffs are born at their own point in it)
 * @returns {number} the number of puffs emitted
 */
export function R_SmokeTrailEmit( start, end, rocket, key, time, dt ) {

	const vx = end[ 0 ] - start[ 0 ], vy = end[ 1 ] - start[ 1 ], vz = end[ 2 ] - start[ 2 ];
	const length = Math.hypot( vx, vy, vz );
	let trail = trails.get( key );
	if ( trail === undefined || time - trail.stamp > SMOKE.staleAfter || trail.stamp - time > 1 ) {

		if ( trails.size >= SMOKE.maxTrails ) for ( const [ k, v ] of trails ) if ( time - v.stamp > SMOKE.staleAfter || v.stamp > time ) trails.delete( k );
		trail = { carry: SMOKE.spacing, stamp: time }; // a new trail's first puff is at its start
		trails.set( key, trail );

	}
	trail.stamp = time;
	if ( length > SMOKE.jump ) { trail.carry = SMOKE.spacing; return 0; } // a teleport: never bridged
	if ( length < 1e-6 ) return 0;

	const K = SMOKE.unit, back = rocket ? SMOKE.noseRocket : SMOKE.noseGrenade;
	// unit direction in source axes (x, z, y)
	const ux = vx / length, uy = vz / length, uz = vy / length;
	let made = 0, d = Math.max( 0, SMOKE.spacing - trail.carry ), last = - 1;
	for ( ; d <= length + 1e-9; d += SMOKE.spacing ) {

		const f = d / length, tb = time - dt * ( 1 - f ), seed = hashJS( ( counter ++ ) * 11.7 + tb * 37 );
		push( ( start[ 0 ] + vx * f ) / K - ux * back, ( start[ 2 ] + vz * f ) / K - uy * back, ( start[ 1 ] + vy * f ) / K - uz * back, ux, uy, uz, tb, seed );
		last = d; made ++;

	}
	trail.carry = last < 0 ? trail.carry + length : length - last;
	return made;

}

/**
 * smokeList() of the source: every live puff at `time`, in the source's space and units, with the source's
 * per-puff drift, growth, spin and fade. Called by r_fireball.js each frame to fill the puff layer. Drops expired
 * puffs from the tail of the pool first.
 *
 * @param {number} time client time, seconds
 * @param {{ wind: number, spread: number, density: number }} p look settings (normally `SMOKE`)
 * @param {number} scale plays the source's clock faster (1 = the source exactly; `SMOKE.timeScale` in game)
 * @param {function(number, number, number, number, number, number, number, number, number, number, number,
 *   number): void} emit called as emit( x, y, z, size, angle, alpha, heat, tile, tintR, tintG, tintB, seed ) per
 *   puff: position and size in source units (y up), angle in radians, alpha 0..1, heat always -1, tile 0..15
 */
export function forEachSmoke( time, p, scale, emit ) {

	// the tail holds the oldest puffs: drop the ones that are over
	while ( count > 0 && ( time - born[ head ] ) * scale >= life[ head ] ) { head = ( head + 1 ) % N; count --; }
	for ( let n = 0; n < count; n ++ ) {

		const i = ( head + n ) % N, age = Math.max( 0, ( time - born[ i ] ) * scale ), f = age / life[ i ];
		if ( f >= 1 ) continue; // an older puff outlived a younger one: this one is over
		const seed = seeds[ i ], spin = seed * 6.28 + age * .9, back = - .26 * ( 1 - Math.exp( - age * 1.2 ) );
		emit( px[ i ] + dx[ i ] * back + p.wind * age * 5 + Math.sin( spin ) * .05 * age * p.spread,
			py[ i ] + dy[ i ] * back + .057 * Math.pow( age, 1.5 ) * p.spread,
			pz[ i ] + dz[ i ] * back + Math.cos( spin * 1.35 ) * .08 * age * p.spread,
			( .11 + .18 * age + .01 * age * age ) * ( .8 + seed * .4 ) * p.spread,
			seed * 6.28 + age * ( seed - .5 ) * .4,
			smooth( 0, .08, age ) * Math.pow( 1 - f, .8 ) * .34 * p.density,
			- 1, tiles[ i ], .88, .92, .92, seed * 13 );

	}

}

/**
 * Read-only view of the pool in the source's own record shape, for tests.
 *
 * @returns {Array<{ pos: Array<number>, dir: Array<number>, t: number, life: number, seed: number, tile: number }>}
 *   fresh copies, oldest first: position (source units, y up), unit direction, birth time (s), life (source
 *   seconds, 4.4..5.6), seed 0..1 and texture tile 0..15
 */
export function smokeRecords() {

	const list = [];
	for ( let n = 0; n < count; n ++ ) {

		const i = ( head + n ) % N;
		list.push( { pos: [ px[ i ], py[ i ], pz[ i ] ], dir: [ dx[ i ], dy[ i ], dz[ i ] ], t: born[ i ], life: life[ i ], seed: seeds[ i ], tile: tiles[ i ] } );

	}
	return list;

}
