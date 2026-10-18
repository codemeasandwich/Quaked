/**
 * @module engine/progs/hexen2_world_cmds
 *
 * The Hexen II builtins that need the server world: setting an origin or size and relinking, tracing a line through
 * the eight hulls, point contents, bottom checks and dropping to the floor. They reuse the port's existing world
 * functions (`SV_LinkEdict`, `SV_Move`, `SV_PointContents`, `SV_CheckBottom`, `SV_DropToFloor`) exactly as the plan
 * asks, and register themselves into the Hexen builtin dispatcher when this module loads (the server imports it).
 *
 * Types: plain values and functions; no exported classes.
 * State: none here; the dispatcher holds the registered table.
 * Errors: a backwards size raises the native program error through `PR_RunError`.
 */

import { SV_LinkEdict, SV_Move, SV_PointContents, SV_DropToFloor } from '../server/world.js';
import { SV_CheckBottom, SV_movestep } from '../server/sv_move.js';
import { PR_RunError } from './pr_exec.js';
import { EDICT_TO_PROG, G_EDICT, G_FLOAT, G_FLOAT_SET, G_VECTOR, PROG_TO_EDICT, pr_global_struct, sv } from './progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3, OFS_RETURN } from './pr_comp.js';
import { FL_ONGROUND, FL_FLY, FL_SWIM } from '../server/server.js';
import { vec3_origin } from '../common/mathlib.js';
import { Hexen2_RegisterBuiltins } from './hexen2_cmds.js';

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

// #2 setorigin(entity, origin)
function setorigin() {

	const ent = G_EDICT( OFS_PARM0 ), origin = G_VECTOR( OFS_PARM1 );
	ent.v.origin = [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ];
	SV_LinkEdict( ent, false );

}

// #4 setsize(entity, mins, maxs): the native SetMinMaxSize without the disabled rotation path
function setsize() {

	const ent = G_EDICT( OFS_PARM0 ), mins = G_VECTOR( OFS_PARM1 ), maxs = G_VECTOR( OFS_PARM2 );
	for ( let i = 0; i < 3; i ++ )
		if ( mins[ i ] > maxs[ i ] ) PR_RunError( 'backwards mins/maxs' );
	const size = [ maxs[ 0 ] - mins[ 0 ], maxs[ 1 ] - mins[ 1 ], maxs[ 2 ] - mins[ 2 ] ];
	ent.v.mins = [ mins[ 0 ], mins[ 1 ], mins[ 2 ] ];
	ent.v.maxs = [ maxs[ 0 ], maxs[ 1 ], maxs[ 2 ] ];
	ent.v.size = size;
	SV_LinkEdict( ent, false );

}

// #16 traceline(v1, v2, nomonsters, entity): the passed entity traces with its point hull, as the native code does
function traceline() {

	const start = G_VECTOR( OFS_PARM0 ), end = G_VECTOR( OFS_PARM1 );
	const nomonsters = G_FLOAT( OFS_PARM2 ), ent = G_EDICT( OFS_PARM3 );
	const savedHull = ent.v.hull;
	ent.v.hull = 0;
	const trace = SV_Move(
		[ start[ 0 ], start[ 1 ], start[ 2 ] ], vec3_origin, vec3_origin,
		[ end[ 0 ], end[ 1 ], end[ 2 ] ], nomonsters | 0, ent );
	ent.v.hull = savedHull;
	setTrace( trace );

}

// #34 droptofloor(): the native builtin takes no arguments and drops self
function droptofloor() {

	const ent = PROG_TO_EDICT( pr_global_struct.self );
	G_FLOAT_SET( OFS_RETURN, SV_DropToFloor( ent ) ? 1 : 0 );

}

// #32 walkmove(yaw, dist): the native walking step for a grounded/flying/swimming entity
function walkmove() {

	const ent = PROG_TO_EDICT( pr_global_struct.self );
	const yaw = G_FLOAT( OFS_PARM0 ), dist = G_FLOAT( OFS_PARM1 );
	if ( ! ( ( ent.v.flags | 0 ) & ( FL_ONGROUND | FL_FLY | FL_SWIM ) ) ) { G_FLOAT_SET( OFS_RETURN, 0 ); return; }
	const radians = yaw * Math.PI * 2 / 360;
	const move = [ Math.cos( radians ) * dist, Math.sin( radians ) * dist, 0 ];
	G_FLOAT_SET( OFS_RETURN, SV_movestep( ent, move, false ) ? 1 : 0 );

}

// #82 movestep(x, y, z, settrace): the native direct step on self
function movestep() {

	const ent = PROG_TO_EDICT( pr_global_struct.self );
	const move = [ G_FLOAT( OFS_PARM0 ), G_FLOAT( OFS_PARM1 ), G_FLOAT( OFS_PARM2 ) ];
	G_FLOAT_SET( OFS_RETURN, SV_movestep( ent, move, false ) ? 1 : 0 );

}

// #40 checkbottom(entity)
function checkbottom() {

	G_FLOAT_SET( OFS_RETURN, SV_CheckBottom( G_EDICT( OFS_PARM0 ) ) ? 1 : 0 );

}

// #41 pointcontents(point)
function pointcontents() {

	const point = G_VECTOR( OFS_PARM0 );
	G_FLOAT_SET( OFS_RETURN, SV_PointContents( [ point[ 0 ], point[ 1 ], point[ 2 ] ] ) );

}

/** The world builtins this module installs into the Hexen II dispatcher. */
export const HEXEN2_WORLD_BUILTINS = Object.freeze( { 2: setorigin, 4: setsize, 16: traceline, 32: walkmove, 34: droptofloor, 40: checkbottom, 41: pointcontents, 82: movestep } );

Hexen2_RegisterBuiltins( HEXEN2_WORLD_BUILTINS );
