/**
 * @module engine/progs/hexen2_world_cmds
 *
 * The Hexen II builtins that need the server world and whose native body differs from Quake's: `traceline` and
 * `tracearea` force hull 0 while tracing, `walkmove`/`movestep` read the native `set_trace` argument, `movetogoal`
 * returns the native 0/1 result, and `traceline`'s hull rule is shared by both trace builtins. `setorigin`, `setsize`,
 * `droptofloor`, `checkbottom` and `pointcontents` are gone: the one profile table uses Quake's `PF_*` for those.
 *
 * Types: plain values and functions; no exported classes.
 * State: none.
 * Errors: none raised here.
 */

import { SV_Move } from '../server/world.js';
import { SV_StepDirection, SV_NewChaseDir, SV_CloseEnough, SV_movestep } from '../server/sv_move.js';
import { EDICT_TO_PROG, G_EDICT, G_FLOAT, G_FLOAT_SET, G_VECTOR, PROG_TO_EDICT, pr_global_struct, sv } from './progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3, OFS_PARM4, OFS_PARM5, OFS_RETURN } from './pr_comp.js';
import { FL_ONGROUND, FL_FLY, FL_SWIM } from '../server/server.js';
import { vec3_origin } from '../common/mathlib.js';

// The trace globals, exactly as the native PR_SetTrace writes them.
function setTrace( trace ) {

	pr_global_struct.trace_allsolid = trace.allsolid ? 1 : 0;
	pr_global_struct.trace_startsolid = trace.startsolid ? 1 : 0;
	pr_global_struct.trace_fraction = trace.fraction;
	pr_global_struct.trace_inwater = trace.inwater ? 1 : 0;
	pr_global_struct.trace_inopen = trace.inopen ? 1 : 0;
	pr_global_struct.trace_endpos = [ trace.endpos[ 0 ], trace.endpos[ 1 ], trace.endpos[ 2 ] ];
	pr_global_struct.trace_plane_normal = [ trace.plane.normal[ 0 ], trace.plane.normal[ 1 ], trace.plane.normal[ 2 ] ];
	pr_global_struct.trace_plane_dist = trace.plane.dist;
	pr_global_struct.trace_ent = EDICT_TO_PROG( trace.ent ?? sv.edicts[ 0 ] );

}

// The native trace builtins always trace with the passed entity's point hull.
function traceForEntity( ent, start, mins, maxs, end, nomonsters ) {

	const savedHull = ent.v.hull;
	ent.v.hull = 0;
	try {

		return SV_Move( start, mins, maxs, end, nomonsters, ent );

	} finally {

		ent.v.hull = savedHull;

	}

}

// #16 traceline(v1, v2, nomonsters, entity): the native point-hull trace (unlike Quake, which keeps the entity's hull)
function traceline() {

	const start = G_VECTOR( OFS_PARM0 ), end = G_VECTOR( OFS_PARM1 );
	const nomonsters = G_FLOAT( OFS_PARM2 ), ent = G_EDICT( OFS_PARM3 );
	const trace = traceForEntity(
		ent,
		[ start[ 0 ], start[ 1 ], start[ 2 ] ], vec3_origin, vec3_origin,
		[ end[ 0 ], end[ 1 ], end[ 2 ] ], nomonsters | 0 );
	setTrace( trace );

}

// #33 tracearea(v1, v2, mins, maxs, nomonsters, entity): traceline with an explicit box
function tracearea() {

	const start = G_VECTOR( OFS_PARM0 ), end = G_VECTOR( OFS_PARM1 );
	const mins = G_VECTOR( OFS_PARM2 ), maxs = G_VECTOR( OFS_PARM3 );
	const nomonsters = G_FLOAT( OFS_PARM4 ), ent = G_EDICT( OFS_PARM5 );
	const trace = traceForEntity(
		ent,
		[ start[ 0 ], start[ 1 ], start[ 2 ] ], [ mins[ 0 ], mins[ 1 ], mins[ 2 ] ], [ maxs[ 0 ], maxs[ 1 ], maxs[ 2 ] ],
		[ end[ 0 ], end[ 1 ], end[ 2 ] ], nomonsters | 0 );
	setTrace( trace );

}

// #32 walkmove(yaw, dist, set_trace): the native walking step, reporting the trace when the third argument asks for it
function walkmove() {

	const ent = PROG_TO_EDICT( pr_global_struct.self );
	const yaw = G_FLOAT( OFS_PARM0 ), dist = G_FLOAT( OFS_PARM1 );
	if ( ! ( ( ent.v.flags | 0 ) & ( FL_ONGROUND | FL_FLY | FL_SWIM ) ) ) { G_FLOAT_SET( OFS_RETURN, 0 ); return; }
	const radians = yaw * Math.PI * 2 / 360;
	const move = [ Math.cos( radians ) * dist, Math.sin( radians ) * dist, 0 ];
	G_FLOAT_SET( OFS_RETURN, SV_movestep( ent, move, true, true, Boolean( G_FLOAT( OFS_PARM2 ) | 0 ) ) ? 1 : 0 );

}

// #82 movestep(x, y, z, set_trace): the native direct step on self
function movestep() {

	const ent = PROG_TO_EDICT( pr_global_struct.self );
	const move = [ G_FLOAT( OFS_PARM0 ), G_FLOAT( OFS_PARM1 ), G_FLOAT( OFS_PARM2 ) ];
	G_FLOAT_SET( OFS_RETURN, SV_movestep( ent, move, false, true, Boolean( G_FLOAT( OFS_PARM3 ) | 0 ) ) ? 1 : 0 );

}

// #67 movetogoal(dist): Hexen II's native 0/1 return (Quake's leaves the previous value on a successful step)
function movetogoal( context ) {

	const ent = PROG_TO_EDICT( pr_global_struct.self );
	const goal = PROG_TO_EDICT( ent.v.goalentity );
	const dist = G_FLOAT( OFS_PARM0 );

	pr_global_struct.trace_plane_normal = [ 0, 0, 0 ];
	if ( ! ( ( ent.v.flags | 0 ) & ( FL_ONGROUND | FL_FLY | FL_SWIM ) ) ) {

		G_FLOAT_SET( OFS_RETURN, 0 );
		return;

	}

	if ( PROG_TO_EDICT( ent.v.enemy ) !== sv.edicts[ 0 ] && SV_CloseEnough( ent, goal, dist ) ) {

		G_FLOAT_SET( OFS_RETURN, 0 );
		return;

	}

	if ( ! SV_StepDirection( ent, ent.v.ideal_yaw, dist ) ) {

		SV_NewChaseDir( ent, goal, dist );
		G_FLOAT_SET( OFS_RETURN, 0 );
		return;

	}

	const source = context?.random ?? Math.random;
	if ( ( Math.trunc( source() * 4 ) & 3 ) === 1 ) SV_NewChaseDir( ent, goal, dist );
	G_FLOAT_SET( OFS_RETURN, 1 );

}

/** The world builtins this module installs into the Hexen II dispatcher. */
export const HEXEN2_WORLD_BUILTINS = Object.freeze( { 16: traceline, 32: walkmove, 33: tracearea, 67: movetogoal, 82: movestep } );
