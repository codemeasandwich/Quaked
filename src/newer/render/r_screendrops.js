/**
 * @module newer/render/r_screendrops
 *
 * Drops on the lens: water after surfacing, blood when hurt close by.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `wet`, `blood`, `age`, `inLiquid`, `viewOrigin`, `last`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Drops on the "lens" in Newer Game: coming out of water leaves the view beaded
// with water, some of it running down and the rest slowly gone; being close to
// a body bursting (a gib) does the same with blood.  The drops themselves are
// drawn by the composite pass (gl_post.js), which bends the picture through
// each one; this module keeps track of how wet the view is.

// how long it takes to dry, in seconds
const WATER_DRY = 3.2;
const BLOOD_DRY = 6;

let wet = 0;
let blood = 0;
let age = 0; // seconds since the last soaking: how far the drops have run
let inLiquid = false;
let viewOrigin = null;
let last = 0;

const now = () => ( typeof performance !== 'undefined' ? performance.now() : Date.now() ) / 1000;

/**
 * Where the view is (an array that follows it), for the nearness of a burst. Called by R_SetupFrame each frame with
 * the renderer's `r_origin`; the array is kept by reference, not copied.
 *
 * @param {Array<number>} origin the view origin, world space, Quake units
 */
export function R_ScreenDropsSetView( origin ) {

	viewOrigin = origin;

}

/*
================
R_ScreenDropsView
================
*/
/**
 * Called every frame (R_SetupFrame) with the contents of the leaf the eye is in: -3 water and -4 slime are liquid
 * (the code also counts -5, lava). The moment the eye comes out of it, the view is wet; under the surface the drops
 * are washed off.
 *
 * @param {number} contents the view leaf's CONTENTS_ value
 */
export function R_ScreenDropsView( contents ) {

	const liquid = contents === - 3 || contents === - 4 || contents === - 5;

	// under the surface the drops are washed off, and there are none to see
	if ( liquid ) R_ScreenDropsClear();
	else if ( inLiquid ) R_ScreenDropsWet( 1 );

	inLiquid = liquid;

}

/**
 * Wets the lens with water, keeping whichever is wetter; a soaking more than half the current one restarts the
 * drops' run. Called by `R_ScreenDropsView` on surfacing.
 *
 * @param {number} amount wetness 0..1 (clamped to 1)
 */
export function R_ScreenDropsWet( amount ) {

	if ( amount > wet * 0.5 ) age = 0;
	wet = Math.max( wet, Math.min( 1, amount ) );

}

/**
 * Puts blood on the lens, keeping whichever is more; an amount more than half the current blood restarts the drops'
 * run. Called by `R_ScreenDropsBloodAt`.
 *
 * @param {number} amount blood 0..1 (clamped to 1)
 */
export function R_ScreenDropsBlood( amount ) {

	if ( amount > blood * 0.5 ) age = 0;
	blood = Math.min( 1, Math.max( blood, amount ) );

}

/**
 * Blood sprayed at p (count particles' worth): the nearer and the bigger, the more on the lens. Called by the
 * particle code (r_part.js) for a blood spray (colour 73) in Newer Game. Nothing within the lens beyond 220 Quake
 * units, or before the first `R_ScreenDropsSetView`.
 *
 * @param {Array<number>} p where the blood was sprayed, world space, Quake units
 * @param {number} count the spray's particle count (40 or more counts as the biggest)
 */
export function R_ScreenDropsBloodAt( p, count ) {

	if ( viewOrigin === null ) return;

	const dist = Math.hypot( p[ 0 ] - viewOrigin[ 0 ], p[ 1 ] - viewOrigin[ 1 ], p[ 2 ] - viewOrigin[ 2 ] );
	if ( dist > 220 ) return;

	const near = 1 - dist / 220;
	const size = Math.min( 1, count / 40 );
	R_ScreenDropsBlood( Math.max( blood, near * ( 0.35 + 0.65 * size ) ) );

}

/*
================
R_ScreenDropsUpdate
================
*/
const state = { density: 0, blood: 0, age: 0 };

/**
 * Once per frame, from the composite pass (R_PostFinish in gl_post.js). Dries the lens by the wall-clock time since
 * the last call (capped at 0.1 s): water over 3.2 s, blood over 6 s.
 *
 * @returns {{ density: number, blood: number, age: number }} for the composite pass: how many drops there are (0..1),
 * how much of it is blood (0..1) and how long they have been running (seconds). One module object reused every call
 * (do not keep it).
 */
export function R_ScreenDropsUpdate() {

	const t = now();
	const dt = Math.min( 0.1, Math.max( 0, t - last ) );
	last = t;

	wet = Math.max( 0, wet - dt / WATER_DRY );
	blood = Math.max( 0, blood - dt / BLOOD_DRY );
	if ( wet > 0 || blood > 0 ) age += dt;

	state.density = Math.max( wet, blood );
	state.blood = state.density > 0 ? blood / ( wet + blood ) : 0;
	state.age = age;
	return state;

}

/**
 * Dries the lens at once (water, blood and the run age): when the eye is under a liquid, and from
 * `R_ScreenDropsReset`.
 */
export function R_ScreenDropsClear() {

	wet = 0;
	blood = 0;
	age = 0;

}

/**
 * A new level (R_NewMap): dry, and not in the water.
 */
export function R_ScreenDropsReset() {

	R_ScreenDropsClear();
	inLiquid = false;

}
