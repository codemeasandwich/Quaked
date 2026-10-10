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

// where the view is (an array that follows it), for the nearness of a burst
export function R_ScreenDropsSetView( origin ) {

	viewOrigin = origin;

}

/*
================
R_ScreenDropsView

Called every frame with the contents of the leaf the eye is in: -3 water and -4
slime are liquid.  The moment the eye comes out of it, the view is wet.
================
*/
export function R_ScreenDropsView( contents ) {

	const liquid = contents === - 3 || contents === - 4 || contents === - 5;

	// under the surface the drops are washed off, and there are none to see
	if ( liquid ) R_ScreenDropsClear();
	else if ( inLiquid ) R_ScreenDropsWet( 1 );

	inLiquid = liquid;

}

export function R_ScreenDropsWet( amount ) {

	if ( amount > wet * 0.5 ) age = 0;
	wet = Math.max( wet, Math.min( 1, amount ) );

}

export function R_ScreenDropsBlood( amount ) {

	if ( amount > blood * 0.5 ) age = 0;
	blood = Math.min( 1, Math.max( blood, amount ) );

}

// blood sprayed at p (count particles' worth): the nearer and the bigger, the more on the lens
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

Once per frame.  Returns { density, blood, age } for the composite pass: how many
drops there are, how much of it is blood (0..1) and how long they have been running.
================
*/
const state = { density: 0, blood: 0, age: 0 };

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

export function R_ScreenDropsClear() {

	wet = 0;
	blood = 0;
	age = 0;

}

// a new level: dry, and not in the water
export function R_ScreenDropsReset() {

	R_ScreenDropsClear();
	inLiquid = false;

}
