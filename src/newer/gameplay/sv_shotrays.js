/**
 * @module newer/gameplay/sv_shotrays
 *
 * The native rays of a shotgun blast, recorded for the pellet picture and the damage schedule.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `serial`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// The native rays of a shotgun blast, observed for the pellet picture (r_shotgun.js) and the damage schedule
// (sv_shotdelay.js).
//
// QuakeC's FireBullets does the shooting: one traceline per pellet with the game's own random spread, and
// damage from each. (FireBullets traces nothing but its pellets; the explosion of a barrel they kill traces
// more, inside the same weapon function, which is why only FireBullets' own traces are kept.) PF_traceline reports those
// calls to sv_faceevents.js while a local player's W_FireShotgun / W_FireSuperShotgun, or a soldier's army_fire,
// is running, and this module keeps them. Keeping them changes nothing: no trace, entity, QC global or random
// number is touched here. (The one thing that does change the game, when a pellet's damage lands, is
// sv_shotdelay.js, and it is documented there.)
//
// A native blast is 6 pellets (shotgun) or 14 (super shotgun), each a ray from the shooter's origin to
// where it stopped (the hit, or 2048 units out). Water along each ray is found by sampling the world's
// contents, because the supplied effect has a single "underwater" switch and a pellet can cross a surface.
import { SV_PointContents } from '../../engine/server/world.js';
import { CONTENTS_WATER, CONTENTS_SLIME } from '../../engine/common/bspfile.js';

export const SHOT_RAYS_MAX = 24;      // tracelines kept per blast (14 pellets are the most a stock gun makes)
const STEP = 8, REFINE = 4;           // sampling step in units, and bisection rounds for each surface found

const wet = p => { const c = SV_PointContents( p ); return c === CONTENTS_WATER || c === CONTENTS_SLIME; };

/**
 * Makes the empty list that collects one blast's tracelines while its weapon function runs (sv_faceevents.js keeps it
 * on the shot token).
 *
 * @returns {Array<{start: Array<number>, end: Array<number>, target: Array<number>}>} a new empty array
 */
export const shotRaysNew = () => [];

/**
 * Records one FireBullets traceline of the blast being observed. Called from sv_faceevents.js when PF_traceline runs
 * inside FireBullets during a shotgun blast or a soldier's army_fire. Copies the vectors; touches no game state. Rays
 * past `SHOT_RAYS_MAX` (24) are dropped.
 *
 * @param {Array<object>} rays the blast's list from `shotRaysNew`; mutated (one ray pushed)
 * @param {Array<number>} v1 the trace start, the shooter's origin (world space, Quake units)
 * @param {Array<number>} v2 the trace target, up to 2048 units out (world space, Quake units)
 * @param {{endpos: Array<number>}} trace the traceline result; `endpos` is where the pellet stopped
 */
export function shotRayRecord( rays, v1, v2, trace ) {

	if ( rays.length >= SHOT_RAYS_MAX ) return;
	rays.push( { start: [ v1[ 0 ], v1[ 1 ], v1[ 2 ] ], end: [ trace.endpos[ 0 ], trace.endpos[ 1 ], trace.endpos[ 2 ] ], target: [ v2[ 0 ], v2[ 1 ], v2[ 2 ] ] } );

}

const lerp3 = ( a, b, f, out ) => { out[ 0 ] = a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * f; out[ 1 ] = a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * f; out[ 2 ] = a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * f; return out; };

/**
 * Returns the ray's water/slime spans, computing them with `rayWater` on first use and caching them on the ray (the
 * damage schedule in sv_shotdelay.js and the client event both need them).
 *
 * @param {{start: Array<number>, end: Array<number>, water?: Array<Array<number>>}} ray a recorded ray; `water` is
 *   set on it
 * @returns {Array<Array<number>>} `[[from, to], ...]` distances in Quake units from `start`
 */
export function rayWaterOf( ray ) { return ray.water ?? ( ray.water = rayWater( ray.start, ray.end ) ); }

/**
 * Finds the distances along start -> end (units) at which the ray is in water or slime, by sampling
 * `SV_PointContents` every 8 units and bisecting each change 4 times (surface found to about 0.5 unit). Needed because
 * the supplied effect has a single "underwater" switch and a pellet can cross a surface.
 *
 * @param {Array<number>} start ray start (world space, Quake units)
 * @param {Array<number>} end ray end (world space, Quake units)
 * @returns {Array<Array<number>>} `[[from, to], ...]` in Quake units from `start`, in order; empty for a dry or
 *   zero-length ray. A span still wet at `end` closes at the ray's length.
 */
export function rayWater( start, end ) {

	const length = Math.hypot( end[ 0 ] - start[ 0 ], end[ 1 ] - start[ 1 ], end[ 2 ] - start[ 2 ] ), reach = length; // (the whole ray: a pellet flies all the way to where it stopped)
	const point = [ 0, 0, 0 ], spans = [];
	if ( ! ( length > 0 ) ) return spans;
	const at = d => wet( lerp3( start, end, d / length, point ) );
	let previous = at( 0 ), from = previous ? 0 : - 1;
	for ( let d = STEP; d < reach + STEP; d += STEP ) {

		const here = Math.min( d, reach ), now = at( here );
		if ( now !== previous ) {

			// the surface is between here - STEP and here: find it
			let lo = d - STEP, hi = here;
			for ( let i = 0; i < REFINE; i ++ ) { const mid = ( lo + hi ) / 2; if ( at( mid ) === previous ) lo = mid; else hi = mid; }
			const surface = ( lo + hi ) / 2;
			if ( now ) from = surface; else { spans.push( [ from, surface ] ); from = - 1; }
			previous = now;

		}
		if ( here >= reach ) break;

	}
	if ( previous && from >= 0 ) spans.push( [ from, reach ] );
	return spans;

}

// The event handed to the client: the muzzle-side facts of one confirmed blast. Every ray is a pellet
// (FireBullets of the stock progs.dat traces nothing but its pellets; tests/shotgun_native_test.js pins 6 and 14).
let serial = 0;
/**
 * Takes a number for a blast when its observation starts; the picture's pellets and the server's damage schedule
 * both derive each pellet's flight from it. Increments for the lifetime of the page (not reset per map).
 *
 * @returns {number} the next blast id, from 1
 */
export const shotBlastId = () => ++ serial;
/**
 * Builds the event handed to the client for one confirmed blast, when its weapon function leaves (sv_faceevents.js).
 * Every ray is a pellet.
 *
 * @param {{id: number, time: number, map: string, weapon: number, function: string}} token the shot token from
 *   sv_faceevents.js (`time` is `sv.time` in seconds)
 * @param {Array<object>} rays the blast's recorded rays; each gains a cached `water`
 * @returns {?{kind: 'rays', id: number, time: number, map: string, weapon: number, function: string,
 *   submerged: boolean, rays: Array<{start: Array<number>, end: Array<number>, water: Array<Array<number>>}>}} null
 *   for a blast with no traces (should not happen; it draws nothing). `submerged` is true when the first ray starts
 *   in water or slime.
 */
export function shotRayEvent( token, rays ) {

	if ( rays.length < 1 ) return null; // a blast with no traces (should not happen) draws nothing
	const out = rays.map( ray => ( { start: ray.start, end: ray.end, water: rayWaterOf( ray ) } ) );
	return { kind: 'rays', id: token.id, time: token.time, map: token.map, weapon: token.weapon, function: token.function,
		submerged: out[ 0 ].water.length > 0 && out[ 0 ].water[ 0 ][ 0 ] === 0, rays: out };

}
