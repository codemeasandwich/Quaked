/**
 * @module newer/render/r_flashlight
 *
 * The shoulder-mounted flashlight.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `seeded`, `lastTime`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// A shoulder-mounted flashlight for Newer Game.  It sits on the right shoulder,
// a little behind and below the eye, and its beam follows where you are looking
// with a slight delay, as if the light were mounted on a body that turns after
// the head: flick the view across the room and the beam trails behind, then
// settles.  The lighting pipeline (gl_post.js) draws the beam and what it hits.

import { cvar_t, Cvar_SetValue, Cvar_VariableValue } from '../../engine/common/cvar.js';
import { Cmd_AddCommand } from '../../engine/common/cmd.js';
import { R_NewerLightingActive, R_NewerGame } from './r_anim.js';
import { cls, ca_connected } from '../../engine/client/client.js';
import { R_FlashlightRunManualChange, R_FlashlightRunObserve } from './r_flashlightrun.js';

export const r_flashlight = new cvar_t( 'r_flashlight', '0' );

const LAG = 0.1; // seconds: how long the beam takes to catch up with the view (its time constant)
const SHOULDER_RIGHT = 15;
const SHOULDER_UP = - 9;
const SHOULDER_FORWARD = 4;

export const FLASHLIGHT_OUTER = 0.92; // cosine of the beam's outer edge (about 23 degrees)
export const FLASHLIGHT_INNER = 0.955; // where the edge ends: a soft rim (about 17 degrees)

const beam = { on: false, pos: [ 0, 0, 0 ], dir: [ 1, 0, 0 ] };
let seeded = false;
let lastTime = 0;

const now = () => ( typeof performance !== 'undefined' ? performance.now() : Date.now() ) / 1000;

export function R_FlashlightToggle() {

	const before = Cvar_VariableValue( 'r_flashlight' ) !== 0, after = ! before;
	Cvar_SetValue( 'r_flashlight', after ? 1 : 0 );
	R_FlashlightRunManualChange( before, after, cls.state === ca_connected && ! cls.demoplayback && R_NewerGame() );

}

export function R_FlashlightInit() {

	Cmd_AddCommand( 'flashlight', R_FlashlightToggle );

}

/*
================
R_FlashlightUpdate

Once per frame with the view: origin, forward, right, up.  Moves the beam
towards where the view points.
================
*/
export function R_FlashlightUpdate( origin, forward, right, up ) {

	R_FlashlightRunObserve( r_flashlight.value !== 0, cls.state === ca_connected && ! cls.demoplayback && R_NewerGame() );
	const t = now();
	const dt = Math.min( 0.1, Math.max( 0, t - lastTime ) );
	lastTime = t;

	beam.on = r_flashlight.value !== 0 && R_NewerLightingActive();
	if ( beam.on === false ) {

		seeded = false; // it comes on pointing where you look
		return;

	}

	if ( seeded === false || dt === 0 ) {

		beam.dir[ 0 ] = forward[ 0 ]; beam.dir[ 1 ] = forward[ 1 ]; beam.dir[ 2 ] = forward[ 2 ];
		seeded = true;

	} else {

		// exponential approach: the same lag at any frame rate
		const k = 1 - Math.exp( - dt / LAG );
		for ( let i = 0; i < 3; i ++ ) beam.dir[ i ] += ( forward[ i ] - beam.dir[ i ] ) * k;

		const len = Math.hypot( beam.dir[ 0 ], beam.dir[ 1 ], beam.dir[ 2 ] ) || 1;
		for ( let i = 0; i < 3; i ++ ) beam.dir[ i ] /= len;

	}

	for ( let i = 0; i < 3; i ++ )
		beam.pos[ i ] = origin[ i ] + right[ i ] * SHOULDER_RIGHT + up[ i ] * SHOULDER_UP + forward[ i ] * SHOULDER_FORWARD;

}

export function R_FlashlightBeam() {

	return beam;

}
