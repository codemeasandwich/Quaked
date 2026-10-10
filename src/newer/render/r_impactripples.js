/**
 * @module newer/render/r_impactripples
 *
 * Impact ripples (card [W1]): where something fast crosses a pool's surface or hits a portal.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `deps`, `listener`; 1 module-level collection (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Impact ripples (card [W1], Newer Game): something fast that crosses the surface of a pool, or hits a standing portal (a
// teleporter's window, a slipgate's window onto the next level), disturbs it. This module decides when and where, keeps a short
// list of the hits, and tells the listener (r_waves.js, set up by gl_rmain.js), which runs the real ripples: wave fields that
// spread, add up and come back off the edges, drawn by gl_post.js (water) and gl_portal.js (portals). (The packed rows below are
// the list as it stands; the shaders no longer draw rings from them.)
//
// Where the events come from, all on the client side of the picture and only for what is drawn:
//  * a missile on its way (a rocket, a grenade, a nail), from CL_LinkPacketEntities (live games) and CL_RelinkEntities (demos): the segment it moved this frame;
//  * a shotgun pellet, from r_shotgun.js: the segment the pellet flew this frame (so the ripple starts when the pellet is
//    there, not when the shot was fired).
// R_ImpactSegment( from, to ) looks at one segment: if its ends are on different sides of a liquid surface the point where it
// crosses is found (bisection on the BSP contents), and if it passes through a portal's opening the point on the portal is.
// Nothing here reaches the game: it is picture only, never saved, and gone with a new level. (Pellet ripples come from the
// shotgun effect's pellets, so `r_shotgunfx 0` also stops those.)
//
// Cost: a list of at most MAX_WATER + MAX_METAL hits (the oldest is dropped), two point-contents lookups per moving missile or
// pellet per frame and one plane test per portal (the ripples' own cost is r_waves.js's); `r_impactripples 0` turns it all off, and Classic Quake has none.

import { cvar_t } from '../../engine/common/cvar.js';
import { R_NewerGame } from '../mode.js';

export const r_impactripples = new cvar_t( 'r_impactripples', '1', true );

export const RIPPLE = Object.freeze( {
	maxWater: 8, maxMetal: 8,
	waterLife: 2.6, metalLife: 1.8, // seconds a hit stays in the list
	waterSpeed: 62, metalSpeed: 150, // (the first version's ring speeds; the ripples' are r_waves.js's WATER and METAL)
	liquidTop: - 3, liquidBottom: - 4, // BSP contents: water and slime (lava has no water optics to draw a ring on)
	portalMargin: 4, // the opening is taken this much larger, so a hit on its frame counts
	bisect: 8
} );

export const STRENGTH = Object.freeze( { pellet: .35, nail: .5, grenade: .8, rocket: 1 } );

let deps = null;
/**
 * Gives the detector its views of the world; called from gl_rmain.js when the renderer sets up a new map, before any
 * segment is looked at (until then `R_ImpactSegment` does nothing).
 *
 * @param {{contents?: function(Array<number>): (number|undefined), portals?: function(): Array<{normal: Array<number>,
 *   center: Array<number>, min: Array<number>, max: Array<number>}>}} externals `contents([x, y, z])` gives the BSP
 *   contents at a world point, or undefined with no world; `portals()` lists the standing portal openings (world
 *   space, Quake units). Kept until the next call.
 */
export function R_ImpactRipplesSetup( externals ) { deps = externals; }

const events = []; // { kind: 0 water | 1 metal, x, y, z, t0, strength }

/**
 * Forgets every hit in the list; called from gl_rmain.js at a new map (with `R_WavesReset`), so nothing outlives its
 * level.
 */
export function R_ImpactRippleReset() { events.length = 0; }
/**
 * @returns {number} how many hits are in the list now (both kinds)
 */
export const R_ImpactRippleCount = () => events.length;

let listener = null;
/**
 * Sets whoever draws the ripples (r_waves.js's `R_WaveImpact`, registered by gl_rmain.js at map setup); it hears of
 * each hit as `R_AddImpactRipple` records it. One listener at a time; a later call replaces it.
 *
 * @param {?function(number, number, number, number, number, number, ?object): void} fn called as
 *   `(kind, x, y, z, strength, time, plane)`; `plane` is the portal's, for a metal one, else null. null stops telling.
 */
export function R_ImpactRippleListen( fn ) { listener = fn; }

/**
 * Records one hit and tells the listener. At most 8 water and 8 metal hits are kept; when a kind is full its oldest is
 * dropped.
 *
 * @param {number} kind 0 water (a pool's surface), 1 metal (a portal)
 * @param {number} x hit point, world space, Quake units
 * @param {number} y hit point, world space, Quake units
 * @param {number} z hit point, world space, Quake units
 * @param {number} strength 0..1 disturbance (`STRENGTH`: pellet .35, nail .5, grenade .8, rocket 1; times .6 leaving water)
 * @param {number} time client time of the hit, seconds (`cl.time`)
 * @param {?object} [plane=null] the portal opening `{normal, center, min, max}` for a metal hit
 */
export function R_AddImpactRipple( kind, x, y, z, strength, time, plane = null ) {

	const max = kind === 0 ? RIPPLE.maxWater : RIPPLE.maxMetal;
	let alive = 0, oldest = - 1;
	for ( let i = 0; i < events.length; i ++ ) {

		if ( events[ i ].kind !== kind ) continue;
		alive ++;
		if ( oldest < 0 || events[ i ].t0 < events[ oldest ].t0 ) oldest = i;

	}
	if ( alive >= max && oldest >= 0 ) events.splice( oldest, 1 );
	events.push( { kind, x, y, z, t0: time, strength } );
	if ( listener !== null ) listener( kind, x, y, z, strength, time, plane );

}

const isLiquid = c => c <= RIPPLE.liquidTop && c >= RIPPLE.liquidBottom;
const _p = [ 0, 0, 0 ], _a = [ 0, 0, 0 ], _b = [ 0, 0, 0 ];

// is the point inside a portal's opening (taken a little larger)? A teleporter's brush counts as water to the BSP, so a crossing
// there is the portal's, not a pool's.
function inPortal( planes, x, y, z ) {

	const m = RIPPLE.portalMargin;
	for ( const p of planes ) if ( x >= p.min[ 0 ] - m && x <= p.max[ 0 ] + m && y >= p.min[ 1 ] - m && y <= p.max[ 1 ] + m && z >= p.min[ 2 ] - m && z <= p.max[ 2 ] + m ) return true;
	return false;

}

/**
 * Looks at one segment of something's path this frame, (ax, ay, az) to (bx, by, bz), at `time`. Called by
 * `R_ImpactMissile` and by r_shotgun.js for each pellet's flight this frame. If the ends are on different sides of a
 * water/slime surface, the crossing is found by 8 bisections on the BSP contents and recorded as a water hit (unless it
 * lies in a portal's opening: a teleporter's brush counts as water to the BSP); if the segment crosses a portal's plane
 * inside its opening (taken 4 units larger), a metal hit is recorded there. Does nothing before
 * `R_ImpactRipplesSetup`, with `r_impactripples 0`, or in Classic.
 *
 * @param {number} ax segment start, world space, Quake units
 * @param {number} ay segment start, world space, Quake units
 * @param {number} az segment start, world space, Quake units
 * @param {number} bx segment end, world space, Quake units
 * @param {number} by segment end, world space, Quake units
 * @param {number} bz segment end, world space, Quake units
 * @param {number} time client time, seconds
 * @param {number} strength 0..1 (see `STRENGTH`); leaving the water records .6 of it, a smaller disturbance than going in
 * @returns {number} how many hits were recorded (0, or 1 water plus one per portal crossed)
 */
export function R_ImpactSegment( ax, ay, az, bx, by, bz, time, strength ) {

	if ( deps === null || r_impactripples.value === 0 || ! R_NewerGame() ) return 0;
	let made = 0;
	const contents = deps.contents, planes = deps.portals ? deps.portals() : null;
	if ( contents ) {

		_a[ 0 ] = ax; _a[ 1 ] = ay; _a[ 2 ] = az; _b[ 0 ] = bx; _b[ 1 ] = by; _b[ 2 ] = bz;
		const ca = contents( _a ), cb = contents( _b );
		if ( ca !== undefined && cb !== undefined && isLiquid( ca ) !== isLiquid( cb ) ) {

			// where it crossed: the last point on the side the segment started on
			let lo = 0, hi = 1;
			const startWet = isLiquid( ca );
			for ( let i = 0; i < RIPPLE.bisect; i ++ ) {

				const mid = ( lo + hi ) / 2;
				_p[ 0 ] = ax + ( bx - ax ) * mid; _p[ 1 ] = ay + ( by - ay ) * mid; _p[ 2 ] = az + ( bz - az ) * mid;
				const c = contents( _p );
				if ( c !== undefined && isLiquid( c ) === startWet ) lo = mid; else hi = mid;

			}
			const t = ( lo + hi ) / 2, x = ax + ( bx - ax ) * t, y = ay + ( by - ay ) * t, z = az + ( bz - az ) * t;
			// leaving the water is a smaller disturbance than going in
			if ( planes === null || ! inPortal( planes, x, y, z ) ) { R_AddImpactRipple( 0, x, y, z, strength * ( startWet ? .6 : 1 ), time ); made ++; }

		}

	}
	if ( planes !== null ) {

		for ( const portal of planes ) {

			const n = portal.normal, c = portal.center;
			const da = ( ax - c[ 0 ] ) * n[ 0 ] + ( ay - c[ 1 ] ) * n[ 1 ] + ( az - c[ 2 ] ) * n[ 2 ];
			const db = ( bx - c[ 0 ] ) * n[ 0 ] + ( by - c[ 1 ] ) * n[ 1 ] + ( bz - c[ 2 ] ) * n[ 2 ];
			if ( ( da > 0 && db > 0 ) || ( da < 0 && db < 0 ) || da === db ) continue;
			const t = da / ( da - db ), x = ax + ( bx - ax ) * t, y = ay + ( by - ay ) * t, z = az + ( bz - az ) * t, m = RIPPLE.portalMargin;
			if ( x < portal.min[ 0 ] - m || x > portal.max[ 0 ] + m || y < portal.min[ 1 ] - m || y > portal.max[ 1 ] + m || z < portal.min[ 2 ] - m || z > portal.max[ 2 ] + m ) continue;
			R_AddImpactRipple( 1, x, y, z, strength, time, portal );
			made ++;

		}

	}
	return made;

}

const NAILS = new Set( [ 'progs/spike.mdl', 'progs/s_spike.mdl', 'progs/laser.mdl' ] );
/**
 * An entity that moved from `from` to `to` this frame: if it is a rocket, a grenade or a nail, its segment is looked
 * at. Called per drawn entity per frame from CL_LinkPacketEntities (live games) and CL_RelinkEntities (demos). A jump
 * of more than 128 units on any axis is a teleport or a new entity, not a flight. The lava fountain's ball carries the
 * rocket's flag and is ignored.
 *
 * @param {?object} model the entity's model_t (rocket = flags & 1, grenade = flags & 2, nail by name)
 * @param {Array<number>} from last frame's origin, world space, Quake units
 * @param {Array<number>} to this frame's origin, world space, Quake units
 * @param {number} time client time, seconds
 * @returns {number} hits recorded, as `R_ImpactSegment`; 0 for anything else
 */
export function R_ImpactMissile( model, from, to, time ) {

	if ( model == null || model.name === 'progs/lavaball.mdl' ) return 0; // (the lava fountain's ball carries the rocket's flag)
	const strength = ( model.flags & 0x01 ) ? STRENGTH.rocket : ( model.flags & 0x02 ) ? STRENGTH.grenade : NAILS.has( model.name ) ? STRENGTH.nail : 0;
	if ( strength === 0 ) return 0;
	if ( Math.abs( to[ 0 ] - from[ 0 ] ) > 128 || Math.abs( to[ 1 ] - from[ 1 ] ) > 128 || Math.abs( to[ 2 ] - from[ 2 ] ) > 128 ) return 0;
	return R_ImpactSegment( from[ 0 ], from[ 1 ], from[ 2 ], to[ 0 ], to[ 1 ], to[ 2 ], time, strength );

}

// The rings alive at `time`, packed for the shaders: rows of ( x, y, z, age ) for water and for metal, with each ring's strength
// in the matching amp array. A row with a negative age is unused.
export const waterRows = new Float32Array( RIPPLE.maxWater * 4 ), metalRows = new Float32Array( RIPPLE.maxMetal * 4 );
export const waterAmp = new Float32Array( RIPPLE.maxWater ), metalAmp = new Float32Array( RIPPLE.maxMetal );
export const state = { nWater: 0, nMetal: 0 };

/**
 * Ages the list once per rendered frame (`R_RenderView`, gl_rmain.js) and packs the rings alive at `time` into the
 * exported `waterRows` / `metalRows` (x, y, z, age per row, unused rows age -1) and `waterAmp` / `metalAmp`. Drops
 * hits older than their life (water 2.6 s, metal 1.8 s), everything when `r_impactripples` is 0, and everything when
 * the clock jumps back more than a second (a demo loop, a new game). Hits with a future time are kept but not packed.
 *
 * @param {number} time client time, seconds (`cl.time`, 0 with no client)
 * @returns {{nWater: number, nMetal: number}} the shared `state` object (reused every frame): rows filled of each kind
 */
export function R_ImpactRippleFrame( time ) {

	let nw = 0, nm = 0;
	if ( r_impactripples.value === 0 ) events.length = 0; // (switched off: what is alive goes now)
	if ( time < ( R_ImpactRippleFrame.last ?? - Infinity ) - 1 ) events.length = 0; // the clock jumped back (a demo loop, a new game)
	R_ImpactRippleFrame.last = time;
	let keep = 0;
	for ( let i = 0; i < events.length; i ++ ) {

		const e = events[ i ], age = time - e.t0;
		if ( age >= ( e.kind === 0 ? RIPPLE.waterLife : RIPPLE.metalLife ) ) continue;
		events[ keep ++ ] = e;
		if ( age < 0 ) continue;
		const rows = e.kind === 0 ? waterRows : metalRows, at = ( e.kind === 0 ? nw : nm ) * 4;
		rows[ at ] = e.x; rows[ at + 1 ] = e.y; rows[ at + 2 ] = e.z; rows[ at + 3 ] = age;
		if ( e.kind === 0 ) waterAmp[ nw ++ ] = e.strength; else metalAmp[ nm ++ ] = e.strength;

	}
	events.length = keep;
	// unused rows are marked: a negative age
	for ( let i = nw; i < RIPPLE.maxWater; i ++ ) waterRows[ i * 4 + 3 ] = - 1;
	for ( let i = nm; i < RIPPLE.maxMetal; i ++ ) metalRows[ i * 4 + 3 ] = - 1;
	state.nWater = nw; state.nMetal = nm;
	return state;

}
