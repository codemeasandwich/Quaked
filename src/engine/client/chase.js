/**
 * @module engine/client/chase
 *
 * The chase camera (WinQuake chase.c): the third-person view behind the player.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `_R_TracePoint`, `_chase_trace`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/chase.c -- chase camera code

import { PITCH } from '../common/quakedef.js';
import { cvar_t, Cvar_RegisterVariable } from '../common/cvar.js';
import { VectorCopy, VectorSubtract, VectorMA, DotProduct,
	AngleVectors, M_PI } from '../common/mathlib.js';
import { cl } from './client.js';
import { r_refdef } from '../render/render.js';

export const chase_back = new cvar_t( 'chase_back', '100' );
export const chase_up = new cvar_t( 'chase_up', '16' );
export const chase_right = new cvar_t( 'chase_right', '0' );
export const chase_active = new cvar_t( 'chase_active', '0' );

const chase_dest = new Float32Array( 3 );

// Cached vectors for Chase_Update (Golden Rule #4 - no allocations in render loop)
const _chase_forward = new Float32Array( 3 );
const _chase_up = new Float32Array( 3 );
const _chase_right = new Float32Array( 3 );
const _chase_dest = new Float32Array( 3 );
const _chase_stop = new Float32Array( 3 );

// Lazy-loaded collision imports (avoids circular dependency through world.js -> server.js -> menu.js -> keys.js)
let _R_TracePoint = null; // the client's ray cast (render/r_trace.js), loaded lazily
let _chase_trace = null; // reused between frames

/**
 * Registers the chase cvars (`chase_back`, `chase_up`, `chase_right`, `chase_active`) and starts the lazy import of
 * `R_TracePoint` from render/r_trace.js (lazy to avoid the r_trace.js -> world.js circular import). Called once at
 * startup from `Host_Init` (WinQuake chase.c). Until the import resolves, `Chase_Update` falls back to no collision.
 */
export function Chase_Init() {

	Cvar_RegisterVariable( chase_back );
	Cvar_RegisterVariable( chase_up );
	Cvar_RegisterVariable( chase_right );
	Cvar_RegisterVariable( chase_active );

	// Lazy-load collision detection to avoid circular dependency (r_trace.js imports world.js)
	import( '../render/r_trace.js' ).then( ( trace ) => {

		_R_TracePoint = trace.R_TracePoint;

	} );

}

/**
 * For respawning and teleporting: in WinQuake the chase camera would restart 12 units behind the head. Kept as an
 * empty stub, as in WinQuake chase.c; nothing calls it.
 */
export function Chase_Reset() {

	// for respawning and teleporting
	// start position 12 units behind head

}

function TraceLine( start, end, impact ) {

	// Use BSP collision if available (ported from chase.c; its trace starts zeroed, so allsolid false)
	const trace = _R_TracePoint != null && cl.worldmodel != null ? _R_TracePoint( cl.worldmodel, start, end, _chase_trace ?? undefined, false ) : null;
	if ( trace !== null ) {

		_chase_trace = trace;
		VectorCopy( trace.endpos, impact );

	} else {

		// Fallback: just copy end to impact
		VectorCopy( end, impact );

	}

}

/**
 * Moves the view behind the player for the third-person camera. Called each frame from `V_CalcRefdef` (view.js) while
 * the `chase_active` cvar is non-zero, after punch, bob and step smoothing (WinQuake chase.c).
 *
 * Places `r_refdef.vieworg` `chase_back` units behind and `chase_right` units beside the eye, with its z set to the
 * eye height plus `chase_up` (Quake units). It casts a 4096-unit ray along `cl.viewangles` against `cl.worldmodel`
 * (or uses the ray's end when the trace is not loaded yet or there is no world) and sets
 * `r_refdef.viewangles[PITCH]` (degrees) so the camera looks at the same spot. The camera itself is not traced
 * against walls, as in WinQuake. Mutates `r_refdef.vieworg` and `r_refdef.viewangles`; uses module-level scratch
 * vectors and reuses one trace_t between frames.
 */
export function Chase_Update() {

	// Use cached vectors (Golden Rule #4)
	const forward = _chase_forward;
	const up = _chase_up;
	const right = _chase_right;
	const dest = _chase_dest;
	const stop = _chase_stop;

	// if can't see player, reset
	AngleVectors( cl.viewangles, forward, right, up );

	// calc exact destination
	for ( let i = 0; i < 3; i ++ )
		chase_dest[ i ] = r_refdef.vieworg[ i ]
		- forward[ i ] * chase_back.value
		- right[ i ] * chase_right.value;
	chase_dest[ 2 ] = r_refdef.vieworg[ 2 ] + chase_up.value;

	// find the spot the player is looking at
	VectorMA( r_refdef.vieworg, 4096, forward, dest );
	TraceLine( r_refdef.vieworg, dest, stop );

	// calculate pitch to look at the same spot from camera
	VectorSubtract( stop, r_refdef.vieworg, stop );
	let dist = DotProduct( stop, forward );
	if ( dist < 1 )
		dist = 1;
	r_refdef.viewangles[ PITCH ] = - Math.atan( stop[ 2 ] / dist ) / M_PI * 180;

	// move towards destination
	VectorCopy( chase_dest, r_refdef.vieworg );

}
