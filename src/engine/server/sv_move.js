/**
 * @module engine/server/sv_move
 *
 * Monster movement (WinQuake sv_move.c): walking, stepping and chasing a goal.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `PF_changeyaw`, `G_FLOAT`, `G_FLOAT_SET`; module-level variables `c_yes`, `c_no`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Its mutable exports are dependencies injected by `SV_Move_SetCallbacks`.
 */
// Ported from: WinQuake/sv_move.c -- monster movement

import { vec3_origin, DotProduct, VectorCopy, VectorAdd, VectorSubtract,
	VectorNormalize, M_PI, anglemod } from '../common/mathlib.js';
import { YAW } from '../common/quakedef.js';
import { MOVETYPE_FLY, MOVETYPE_WALK, FL_FLY, FL_SWIM, FL_ONGROUND,
	FL_PARTIALGROUND, CONTENTS_EMPTY, CONTENTS_SOLID,
	sv, svs, pr_global_struct, sv_player,
	SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents,
	PR_ExecuteProgram, EDICT_TO_PROG, PROG_TO_EDICT } from './sv_phys.js';

const STEPSIZE = 18;

const DI_NODIR = - 1;

// Cached buffers for SV_CheckBottom (Golden Rule #4)
const _checkbottom_mins = new Float32Array( 3 );
const _checkbottom_maxs = new Float32Array( 3 );
const _checkbottom_start = new Float32Array( 3 );
const _checkbottom_stop = new Float32Array( 3 );

// Cached buffers for SV_movestep (Golden Rule #4)
const _movestep_oldorg = new Float32Array( 3 );
const _movestep_neworg = new Float32Array( 3 );
const _movestep_end = new Float32Array( 3 );

// Cached buffers for SV_StepDirection (Golden Rule #4)
const _stepdir_move = new Float32Array( 3 );
const _stepdir_oldorigin = new Float32Array( 3 );

// Cached buffer for SV_NewChaseDir (Golden Rule #4)
const _chasedir_d = new Float32Array( 3 );

// Debug counters
let c_yes = 0;
let c_no = 0;

// External callback stubs (set by engine)
export let PF_changeyaw = null;
export let G_FLOAT = null;
export let G_FLOAT_SET = null;

/**
 * Injects the progs helpers this module needs (callback injection, to avoid importing pr_cmds.js). Called once from
 * `PR_InitBuiltins` (pr_cmds.js); the functions are kept in the exported `PF_changeyaw`, `G_FLOAT` and `G_FLOAT_SET`
 * for the session. Members that are missing or falsy leave the current value unchanged.
 *
 * @param {{ PF_changeyaw?: function(): void, G_FLOAT?: function(number): number,
 *   G_FLOAT_SET?: function(number, number): void }} callbacks `PF_changeyaw` turns `self` toward its `ideal_yaw`;
 *   `G_FLOAT`/`G_FLOAT_SET` read and write a progs global slot as a float
 */
export function SV_Move_SetCallbacks( callbacks ) {

	if ( callbacks.PF_changeyaw ) PF_changeyaw = callbacks.PF_changeyaw;
	if ( callbacks.G_FLOAT ) G_FLOAT = callbacks.G_FLOAT;
	if ( callbacks.G_FLOAT_SET ) G_FLOAT_SET = callbacks.G_FLOAT_SET;

}

/*
=============
SV_CheckBottom
=============
*/
/**
 * Tests whether a walking entity stands on ground under its whole bounding box. Called by `SV_movestep` after each
 * step, by `SV_NewChaseDir` when a monster cannot move, and by the `checkbottom` builtin. Quick case: if the points
 * just under all four bottom corners are solid world, it passes. Otherwise it traces down (up to 2 * STEPSIZE = 36
 * units) from the middle and the corners, ignoring monsters, and fails when a trace finds nothing or a corner's
 * ground is more than STEPSIZE (18 units) below the middle's. Counts results in the debug counters `c_yes`/`c_no`.
 *
 * @param {edict_t} ent entity to test; reads `v.origin`, `v.mins` and `v.maxs` (Quake units)
 * @returns {boolean} false if any part of the bottom of the entity is off an edge that is not a staircase
 */
export function SV_CheckBottom( ent ) {

	const mins = _checkbottom_mins;
	const maxs = _checkbottom_maxs;
	const start = _checkbottom_start;
	const stop = _checkbottom_stop;

	VectorAdd( ent.v.origin, ent.v.mins, mins );
	VectorAdd( ent.v.origin, ent.v.maxs, maxs );

	// if all of the points under the corners are solid world, don't bother
	// with the tougher checks
	// the corners must be within 16 of the midpoint
	start[ 2 ] = mins[ 2 ] - 1;
	let doRealCheck = false;
	for ( let x = 0; x <= 1; x ++ ) {

		for ( let y = 0; y <= 1; y ++ ) {

			start[ 0 ] = x ? maxs[ 0 ] : mins[ 0 ];
			start[ 1 ] = y ? maxs[ 1 ] : mins[ 1 ];
			if ( SV_PointContents( start ) !== CONTENTS_SOLID ) {

				doRealCheck = true;
				break;

			}

		}

		if ( doRealCheck ) break;

	}

	if ( ! doRealCheck ) {

		c_yes ++;
		return true; // we got out easy

	}

	c_no ++;
	//
	// check it for real...
	//
	start[ 2 ] = mins[ 2 ];

	// the midpoint must be within 16 of the bottom
	start[ 0 ] = stop[ 0 ] = ( mins[ 0 ] + maxs[ 0 ] ) * 0.5;
	start[ 1 ] = stop[ 1 ] = ( mins[ 1 ] + maxs[ 1 ] ) * 0.5;
	stop[ 2 ] = start[ 2 ] - 2 * STEPSIZE;
	let trace = SV_Move( start, vec3_origin, vec3_origin, stop, true, ent );

	if ( trace.fraction === 1.0 )
		return false;
	const mid = trace.endpos[ 2 ];
	let bottom = mid;

	// the corners must be within 16 of the midpoint
	for ( let x = 0; x <= 1; x ++ ) {

		for ( let y = 0; y <= 1; y ++ ) {

			start[ 0 ] = stop[ 0 ] = x ? maxs[ 0 ] : mins[ 0 ];
			start[ 1 ] = stop[ 1 ] = y ? maxs[ 1 ] : mins[ 1 ];

			trace = SV_Move( start, vec3_origin, vec3_origin, stop, true, ent );

			if ( trace.fraction !== 1.0 && trace.endpos[ 2 ] > bottom )
				bottom = trace.endpos[ 2 ];
			if ( trace.fraction === 1.0 || mid - trace.endpos[ 2 ] > STEPSIZE )
				return false;

		}

	}

	c_yes ++;
	return true;

}

/*
=============
SV_movestep
=============
*/
/**
 * Called by monster program code (the `walkmove` builtin, and `SV_StepDirection` for `movetogoal`). The move will be
 * adjusted for slopes and stairs, but if the move isn't possible, no move is done and false is returned. The source
 * comment says pr_global_struct.trace_normal is set to the normal of the blocking wall; neither WinQuake nor this
 * port does that here.
 *
 * Swimming and flying monsters (FL_SWIM/FL_FLY) do not step: they first try the move with 8 units of vertical
 * correction toward their enemy's height, then without it (when they have an enemy), and a swimmer may not leave
 * the water. Walkers are moved from a step (18 units) above the target down to a step below it, must keep ground
 * under them (`SV_CheckBottom`), may fall when FL_PARTIALGROUND is set, and get `groundentity` updated. May run
 * touch functions of triggers (via `SV_LinkEdict`) when `relink` is true.
 *
 * @param {edict_t} ent the moving entity; mutates `v.origin`, `v.flags` and `v.groundentity`
 * @param {ArrayLike<number>} move wished displacement (Quake units, world space)
 * @param {boolean} relink true to relink the entity into the world (and fire triggers) after a successful move
 * @returns {boolean} true when the entity moved (or, with FL_PARTIALGROUND, is allowed to stay where the step left
 *   it); false when blocked, when it would walk off an edge, or when a swimmer would leave the water
 */
export function SV_movestep( ent, move, relink ) {

	const oldorg = _movestep_oldorg;
	const neworg = _movestep_neworg;
	const end = _movestep_end;

	// try the move
	VectorCopy( ent.v.origin, oldorg );
	VectorAdd( ent.v.origin, move, neworg );

	// flying monsters don't step up
	if ( ( ent.v.flags | 0 ) & ( FL_SWIM | FL_FLY ) ) {

		// try one move with vertical motion, then one without
		for ( let i = 0; i < 2; i ++ ) {

			VectorAdd( ent.v.origin, move, neworg );
			const enemy = PROG_TO_EDICT( ent.v.enemy );
			if ( i === 0 && enemy !== sv.edicts[ 0 ] ) {

				const dz = ent.v.origin[ 2 ] - PROG_TO_EDICT( ent.v.enemy ).v.origin[ 2 ];
				if ( dz > 40 )
					neworg[ 2 ] -= 8;
				if ( dz < 30 )
					neworg[ 2 ] += 8;

			}

			const trace = SV_Move( ent.v.origin, ent.v.mins, ent.v.maxs, neworg, false, ent );

			if ( trace.fraction === 1 ) {

				if ( ( ( ent.v.flags | 0 ) & FL_SWIM ) && SV_PointContents( trace.endpos ) === CONTENTS_EMPTY )
					return false; // swim monster left water

				VectorCopy( trace.endpos, ent.v.origin );
				if ( relink )
					SV_LinkEdict( ent, true );
				return true;

			}

			if ( enemy === sv.edicts[ 0 ] )
				break;

		}

		return false;

	}

	// push down from a step height above the wished position
	neworg[ 2 ] += STEPSIZE;
	VectorCopy( neworg, end );
	end[ 2 ] -= STEPSIZE * 2;

	let trace = SV_Move( neworg, ent.v.mins, ent.v.maxs, end, false, ent );

	if ( trace.allsolid )
		return false;

	if ( trace.startsolid ) {

		neworg[ 2 ] -= STEPSIZE;
		trace = SV_Move( neworg, ent.v.mins, ent.v.maxs, end, false, ent );
		if ( trace.allsolid || trace.startsolid )
			return false;

	}

	if ( trace.fraction === 1 ) {

		// if monster had the ground pulled out, go ahead and fall
		if ( ( ent.v.flags | 0 ) & FL_PARTIALGROUND ) {

			VectorAdd( ent.v.origin, move, ent.v.origin );
			if ( relink )
				SV_LinkEdict( ent, true );
			ent.v.flags = ( ent.v.flags | 0 ) & ~FL_ONGROUND;
			return true;

		}

		return false; // walked off an edge

	}

	// check point traces down for dangling corners
	VectorCopy( trace.endpos, ent.v.origin );

	if ( ! SV_CheckBottom( ent ) ) {

		if ( ( ent.v.flags | 0 ) & FL_PARTIALGROUND ) {

			// entity had floor mostly pulled out from underneath it
			// and is trying to correct
			if ( relink )
				SV_LinkEdict( ent, true );
			return true;

		}

		VectorCopy( oldorg, ent.v.origin );
		return false;

	}

	if ( ( ent.v.flags | 0 ) & FL_PARTIALGROUND ) {

		ent.v.flags = ( ent.v.flags | 0 ) & ~FL_PARTIALGROUND;

	}

	ent.v.groundentity = EDICT_TO_PROG( trace.ent );

	// the move is ok
	if ( relink )
		SV_LinkEdict( ent, true );
	return true;

}

//============================================================================

/*
======================
SV_StepDirection
======================
*/
/**
 * Turns to the movement direction, and walks the current distance if facing it. Sets `ideal_yaw` and turns through
 * `PF_changeyaw` (which turns the progs `self`, so `ent` must be `self`, as it is from `SV_MoveToGoal`), then tries
 * `SV_movestep`; a successful step is undone if the entity is still more than 45 degrees from the new direction.
 * Always relinks the entity.
 *
 * @param {edict_t} ent the moving entity, which must be the current progs `self`; mutates its yaw, origin and links
 * @param {number} yaw direction in degrees, 0..360 (multiples of 45 from the chase code)
 * @param {number} dist distance to walk (Quake units)
 * @returns {boolean} true when the step was possible (even if it was then undone because the turn was not finished);
 *   false when blocked
 */
export function SV_StepDirection( ent, yaw, dist ) {

	const move = _stepdir_move;
	const oldorigin = _stepdir_oldorigin;

	ent.v.ideal_yaw = yaw;
	PF_changeyaw();

	const yawRad = yaw * M_PI * 2 / 360;
	move[ 0 ] = Math.cos( yawRad ) * dist;
	move[ 1 ] = Math.sin( yawRad ) * dist;
	move[ 2 ] = 0;

	VectorCopy( ent.v.origin, oldorigin );
	if ( SV_movestep( ent, move, false ) ) {

		const delta = ent.v.angles[ YAW ] - ent.v.ideal_yaw;
		if ( delta > 45 && delta < 315 ) {

			// not turned far enough, so don't take the step
			VectorCopy( oldorigin, ent.v.origin );

		}

		SV_LinkEdict( ent, true );
		return true;

	}

	SV_LinkEdict( ent, true );

	return false;

}

/*
======================
SV_FixCheckBottom
======================
*/
/**
 * Marks an entity as having had its floor pulled out (sets FL_PARTIALGROUND), so `SV_movestep` lets it fall or move
 * off the edge until it stands on ground again. Called by `SV_NewChaseDir` when a stuck monster fails
 * `SV_CheckBottom`.
 *
 * @param {edict_t} ent entity; mutates `v.flags`
 */
export function SV_FixCheckBottom( ent ) {

	ent.v.flags = ( ent.v.flags | 0 ) | FL_PARTIALGROUND;

}

/*
================
SV_NewChaseDir
================
*/
/**
 * Picks a new direction toward `enemy` for a monster that could not keep walking, and steps that way. Tries the
 * diagonal straight at the goal, then the two axis directions (in random order, or the larger difference first),
 * then the old direction, then all eight directions in a random sweep, and only then turning around. If nothing
 * works the monster keeps its old direction, and if it has no floor it is marked FL_PARTIALGROUND
 * (`SV_FixCheckBottom`). Called by `SV_MoveToGoal`. Uses `Math.random`.
 *
 * @param {edict_t} actor the moving monster, which must be the current progs `self` (see `SV_StepDirection`)
 * @param {edict_t} enemy the entity to head for (the monster's `goalentity`); only `v.origin` is read
 * @param {number} dist distance to walk this step (Quake units)
 */
export function SV_NewChaseDir( actor, enemy, dist ) {

	const d = _chasedir_d;

	const olddir = anglemod( ( ( actor.v.ideal_yaw / 45 ) | 0 ) * 45 );
	const turnaround = anglemod( olddir - 180 );

	const deltax = enemy.v.origin[ 0 ] - actor.v.origin[ 0 ];
	const deltay = enemy.v.origin[ 1 ] - actor.v.origin[ 1 ];
	if ( deltax > 10 )
		d[ 1 ] = 0;
	else if ( deltax < - 10 )
		d[ 1 ] = 180;
	else
		d[ 1 ] = DI_NODIR;
	if ( deltay < - 10 )
		d[ 2 ] = 270;
	else if ( deltay > 10 )
		d[ 2 ] = 90;
	else
		d[ 2 ] = DI_NODIR;

	// try direct route
	let tdir;
	if ( d[ 1 ] !== DI_NODIR && d[ 2 ] !== DI_NODIR ) {

		if ( d[ 1 ] === 0 )
			tdir = d[ 2 ] === 90 ? 45 : 315;
		else
			tdir = d[ 2 ] === 90 ? 135 : 215;

		if ( tdir !== turnaround && SV_StepDirection( actor, tdir, dist ) )
			return;

	}

	// try other directions
	if ( ( ( Math.random() * 4 | 0 ) & 1 ) || Math.abs( deltay ) > Math.abs( deltax ) ) {

		tdir = d[ 1 ];
		d[ 1 ] = d[ 2 ];
		d[ 2 ] = tdir;

	}

	if ( d[ 1 ] !== DI_NODIR && d[ 1 ] !== turnaround
		&& SV_StepDirection( actor, d[ 1 ], dist ) )
		return;

	if ( d[ 2 ] !== DI_NODIR && d[ 2 ] !== turnaround
		&& SV_StepDirection( actor, d[ 2 ], dist ) )
		return;

	/* there is no direct path to the player, so pick another direction */

	if ( olddir !== DI_NODIR && SV_StepDirection( actor, olddir, dist ) )
		return;

	if ( Math.random() > 0.5 ) {

		/* randomly determine direction of search */
		for ( tdir = 0; tdir <= 315; tdir += 45 )
			if ( tdir !== turnaround && SV_StepDirection( actor, tdir, dist ) )
				return;

	} else {

		for ( tdir = 315; tdir >= 0; tdir -= 45 )
			if ( tdir !== turnaround && SV_StepDirection( actor, tdir, dist ) )
				return;

	}

	if ( turnaround !== DI_NODIR && SV_StepDirection( actor, turnaround, dist ) )
		return;

	actor.v.ideal_yaw = olddir; // can't move

	// if a bridge was pulled out from underneath a monster, it may not have
	// a valid standing position at all

	if ( ! SV_CheckBottom( actor ) )
		SV_FixCheckBottom( actor );

}

/*
======================
SV_CloseEnough
======================
*/
/**
 * Tests whether two entities' absolute bounding boxes come within `dist` of each other on every axis, so the next
 * step would reach the goal. Called by `SV_MoveToGoal`.
 *
 * @param {edict_t} ent the moving entity; reads `v.absmin`/`v.absmax`
 * @param {edict_t} goal the goal entity; reads `v.absmin`/`v.absmax`
 * @param {number} dist step distance (Quake units)
 * @returns {boolean} true when the boxes, grown by `dist`, overlap
 */
export function SV_CloseEnough( ent, goal, dist ) {

	for ( let i = 0; i < 3; i ++ ) {

		if ( goal.v.absmin[ i ] > ent.v.absmax[ i ] + dist )
			return false;
		if ( goal.v.absmax[ i ] < ent.v.absmin[ i ] - dist )
			return false;

	}

	return true;

}

/*
======================
SV_MoveToGoal
======================
*/
/**
 * The `movetogoal` builtin (#67, through pr_cmds.js), called by monster AI code while it runs or walks: moves
 * `self` one step of the distance in parm 0 toward its `goalentity`. Does nothing for an entity that is not on the
 * ground, flying or swimming, and stops when it has an enemy and the step would reach the goal. Otherwise it
 * steps along `ideal_yaw`, choosing a new chase direction (`SV_NewChaseDir`) when blocked or, at random, one time in
 * four. Reads its argument and `self` from the progs globals; only the not-on-ground case writes a return value (0);
 * QuakeC declares the builtin as void.
 */
export function SV_MoveToGoal() {

	const ent = PROG_TO_EDICT( pr_global_struct.self );
	const goal = PROG_TO_EDICT( ent.v.goalentity );
	const dist = G_FLOAT( 4 ); // OFS_PARM0

	if ( ! ( ( ent.v.flags | 0 ) & ( FL_ONGROUND | FL_FLY | FL_SWIM ) ) ) {

		G_FLOAT_SET( 1, 0 ); // OFS_RETURN = 0
		return;

	}

	// if the next step hits the enemy, return immediately
	if ( PROG_TO_EDICT( ent.v.enemy ) !== sv.edicts[ 0 ] && SV_CloseEnough( ent, goal, dist ) )
		return;

	// bump around...
	if ( ( ( Math.random() * 4 | 0 ) & 3 ) === 1
		|| ! SV_StepDirection( ent, ent.v.ideal_yaw, dist ) ) {

		SV_NewChaseDir( ent, goal, dist );

	}

}
