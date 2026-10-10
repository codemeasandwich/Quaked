/**
 * @module engine/render/r_trace
 *
 * Client-side ray casts through a model's BSP: the one helper the renderer and the client use for the lines they need
 * (the chase camera, depth of field's focus, the wall burns' contact, spent shells' collision). It reuses the
 * server's hull walk (`SV_RecursiveHullCheck`) on hull 0, the point hull, and never takes part in the game's own
 * collision (`SV_Move`). Made in card [44g] (baseline debt D6) from four copies of the same few lines.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */

import { trace_t, SV_RecursiveHullCheck } from '../server/world.js';

/**
 * A line from `start` to `end` through hull 0 of `model` (a world or a brush model's own coordinates).
 *
 * @param {{ hulls?: Array<{ firstclipnode: number }> }} model the model whose BSP is crossed
 * @param {ArrayLike<number>} start the line's start, three numbers
 * @param {ArrayLike<number>} end the line's end, three numbers
 * @param {trace_t} [trace] a trace to fill and return (reused to avoid allocating every frame); a new one if left out
 * @param {boolean} [allsolid] the trace's starting `allsolid`. True (the server's `SV_Move`) means a line that never
 *   reaches an open leaf strikes nothing; false (WinQuake's chase.c, which zeroes its trace) means it strikes the first
 *   solid-to-solid plane
 * @returns {trace_t|null} the trace: `fraction` along the line (1 when nothing is struck), `endpos`, the struck `plane`,
 *   `startsolid`/`allsolid` when the start is inside a wall; null when the model has no hull 0
 */
export function R_TracePoint( model, start, end, trace = new trace_t(), allsolid = true ) {

	const hull = model?.hulls?.[ 0 ];
	if ( ! hull ) return null;
	trace.allsolid = allsolid; trace.startsolid = false; trace.inopen = false; trace.inwater = false;
	trace.fraction = 1; trace.endpos[ 0 ] = end[ 0 ]; trace.endpos[ 1 ] = end[ 1 ]; trace.endpos[ 2 ] = end[ 2 ]; trace.ent = null;
	SV_RecursiveHullCheck( hull, hull.firstclipnode, 0, 1, start, end, trace );
	return trace;

}

/**
 * A small sphere swept from `start` to `end`: the centre's line and six lines offset by `radius` along each axis, the
 * nearest hit kept (with its point brought back to the centre). Enough for small things (a shell) on the point hull,
 * which has no hull of their size.
 *
 * @param {{ hulls?: Array<{ firstclipnode: number }> }} model the model whose BSP is crossed
 * @param {ArrayLike<number>} start the centre's start
 * @param {ArrayLike<number>} end the centre's end
 * @param {number} radius the probe offset, in Quake units
 * @returns {trace_t} the nearest hit (`fraction` 1, `allsolid` false when nothing is struck or the model has no hull 0);
 *   `startsolid`/`allsolid` when any probe starts inside a wall
 */
export function R_TraceSwept( model, start, end, radius ) {

	const best = new trace_t(); best.endpos.set( end ); best.allsolid = false;
	if ( ! model?.hulls?.[ 0 ] ) return best;
	const offsets = [ [ 0, 0, 0 ], [ radius, 0, 0 ], [ - radius, 0, 0 ], [ 0, radius, 0 ], [ 0, - radius, 0 ], [ 0, 0, radius ], [ 0, 0, - radius ] ];
	for ( const offset of offsets ) {

		const hit = R_TracePoint( model, start.map( ( v, i ) => v + offset[ i ] ), end.map( ( v, i ) => v + offset[ i ] ) );
		best.startsolid ||= hit.startsolid; best.allsolid ||= hit.allsolid;
		if ( hit.fraction < best.fraction ) {

			best.fraction = hit.fraction; best.plane = hit.plane;
			for ( let i = 0; i < 3; i ++ ) best.endpos[ i ] = hit.endpos[ i ] - offset[ i ];

		}

	}
	return best;

}
