/**
 * @module newer/render/r_muzzle
 *
 * Muzzle flashes.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `firedAt`, `fired`, `haveView`, `probe`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Muzzle flash for Newer Game.  A shot is a brief flash of light around the
// gun: the game spawns a short dynamic light at the muzzle (cl_main.js), and the
// lighting pipeline (gl_post.js) makes it much stronger and warmer than an
// ordinary light, so the area around the player lights up for a moment.  There
// is nothing drawn at the barrel: the light is the flash.
//
// This module only notes when the player's own weapon fired.

let firedAt = - 1;
let fired = 0;

const DURATION = 0.13; // seconds

const now = () => ( typeof performance !== 'undefined' ? performance.now() : Date.now() ) / 1000;

// where the camera is (set every frame by the renderer): the muzzle is just in front of it
const viewOrigin = [ 0, 0, 0 ];
let haveView = false;

export function R_MuzzleSetView( origin ) {

	viewOrigin[ 0 ] = origin[ 0 ]; viewOrigin[ 1 ] = origin[ 1 ]; viewOrigin[ 2 ] = origin[ 2 ];
	haveView = true;

}

export function R_MuzzleView() {

	return haveView ? viewOrigin : null;

}

// How much of the flash to show given how bright the surroundings already are: all
// of it in the dark, where the flash lights the room, and a fraction in a lit room,
// where it would only be a distracting pulse.  The renderer supplies the probe
// (the baked light at a point, 0 dark .. 255 bright).
let probe = null;

export function R_MuzzleSetProbe( fn ) {

	probe = fn;

}

export function R_MuzzleFlashScale() {

	if ( probe === null || haveView === false ) return 1;

	const light = probe( viewOrigin );
	const t = Math.min( 1, Math.max( 0, ( light - 30 ) / 110 ) );
	return 1 - 0.75 * t * t * ( 3 - 2 * t );

}

// the player's weapon fired (called as the game flags the muzzle flash)
export function R_MuzzleFlashFired() {

	firedAt = now();
	fired ++;

}

// 1 as it fires, falling to 0
export function R_MuzzleFlashLevel() {

	if ( firedAt < 0 ) return 0;
	const t = ( now() - firedAt ) / DURATION;
	return t >= 1 ? 0 : ( 1 - t ) * ( 1 - t );

}

// how many flashes there have been (for tests)
export function R_MuzzleFlashCount() {

	return fired;

}
