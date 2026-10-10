/**
 * @module engine/server/sv_phys
 *
 * Server physics (WinQuake sv_phys.c): every move type, pushers, gravity, water and touch, run once per server frame.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `sv`, `svs`, `sv_player`, `pr_global_struct`, `host_frametime`, `pr_strings`, `SV_Move`,
 * `SV_TestEntityPosition`, `SV_LinkEdict`, `SV_PointContents`, `SV_StartSound`, `PR_ExecuteProgram` and 4 more.
 *
 * Errors: calls `Sys_Error` (fatal) at 3 places.
 *
 * Its mutable exports are dependencies injected by `SV_SetState`, `SV_SetCallbacks`, `SV_SetFrametime` and
 * `SV_SetPlayer` (the server, its globals, tracing and QuakeC entry points), not physics settings.
 */
import { SV_RespawnFrame } from '../common/hooks.js'; // installed by newer/gameplay/sv_respawn.js
import { SV_QuadJumpBegin, SV_QuadJumpEnd } from '../common/hooks.js'; // installed by newer/gameplay/sv_quadmovement.js
import { SV_RendVeilHolding } from '../common/hooks.js'; // installed by newer/gameplay/sv_rendveil.js
// Ported from: WinQuake/sv_phys.c -- server physics

import { SV_SeamlessHolding } from '../common/hooks.js'; // installed by newer/gameplay/sv_seamless.js
import { SV_PortalMoveStart, SV_PortalMoveEnd, SV_PortalMoveStepping } from '../common/hooks.js'; // installed by newer/gameplay/sv_portalmotion.js
import { Sys_Error } from '../common/sys.js';
import { Con_Printf, Con_DPrintf } from '../common/common.js';
import { cvar_t } from '../common/cvar.js';
import { vec3_origin, DotProduct, VectorCopy, VectorAdd, VectorSubtract, VectorMA,
	VectorScale, VectorCompare, VectorNormalize, CrossProduct, Length, AngleVectors,
	M_PI, anglemod } from '../common/mathlib.js';
import { MAX_EDICTS, YAW } from '../common/quakedef.js';
import { PR_GetString } from '../progs/progs.js';
import { trace_t } from './world.js';
import { SV_ShotDelayRun } from '../common/hooks.js'; // installed by newer/gameplay/sv_shotdelay.js

/*

pushmove objects do not obey gravity, and do not interact with each other or
trigger fields, but block normal movement and push normal objects when they move.

onground is set for toss objects when they come to a complete rest. it is set
for steping or walking objects

doors, plats, etc are SOLID_BSP, and MOVETYPE_PUSH
bonus items are SOLID_TRIGGER touch, and MOVETYPE_TOSS
corpses are SOLID_NOT and MOVETYPE_TOSS
crates are SOLID_BBOX and MOVETYPE_TOSS
walking monsters are SOLID_SLIDEBOX and MOVETYPE_STEP
flying/floating monsters are SOLID_SLIDEBOX and MOVETYPE_FLY

solid_edge items only clip against bsp models.

*/

//
// Movetype constants (from progs.h / server.h)
//
export const MOVETYPE_NONE = 0;
export const MOVETYPE_ANGLENOCLIP = 1;
export const MOVETYPE_ANGLECLIP = 2;
export const MOVETYPE_WALK = 3;
export const MOVETYPE_STEP = 4;
export const MOVETYPE_FLY = 5;
export const MOVETYPE_TOSS = 6;
export const MOVETYPE_PUSH = 7;
export const MOVETYPE_NOCLIP = 8;
export const MOVETYPE_FLYMISSILE = 9;
export const MOVETYPE_BOUNCE = 10;
export const MOVETYPE_BOUNCEMISSILE = 11; // QUAKE2
export const MOVETYPE_FOLLOW = 12; // QUAKE2 - stuck to aiment entity

//
// Solid type constants
//
export const SOLID_NOT = 0;
export const SOLID_TRIGGER = 1;
export const SOLID_BBOX = 2;
export const SOLID_SLIDEBOX = 3;
export const SOLID_BSP = 4;

//
// Entity flags
//
export const FL_FLY = 1;
export const FL_SWIM = 2;
export const FL_CONVEYOR = 4;
export const FL_CLIENT = 8;
export const FL_INWATER = 16;
export const FL_MONSTER = 32;
export const FL_GODMODE = 64;
export const FL_NOTARGET = 128;
export const FL_ITEM = 256;
export const FL_ONGROUND = 512;
export const FL_PARTIALGROUND = 1024;
export const FL_WATERJUMP = 2048;
export const FL_JUMPRELEASED = 4096;

//
// Move type for SV_Move
//
export const MOVE_NORMAL = 0;
export const MOVE_NOMONSTERS = 1;
export const MOVE_MISSILE = 2;

//
// Contents
//
export const CONTENTS_EMPTY = - 1;
export const CONTENTS_SOLID = - 2;
export const CONTENTS_WATER = - 3;
export const CONTENTS_SLIME = - 4;
export const CONTENTS_LAVA = - 5;
export const CONTENTS_SKY = - 6;

const MOVE_EPSILON = 0.01;
const STOP_EPSILON = 0.1;
const MAX_CLIP_PLANES = 5;
const STEPSIZE = 18;

// Cached buffers for SV_FlyMove to avoid per-call allocations (Golden Rule #4)
const _flymove_original_velocity = new Float32Array( 3 );
const _flymove_primal_velocity = new Float32Array( 3 );
const _flymove_new_velocity = new Float32Array( 3 );
const _flymove_dir = new Float32Array( 3 );
const _flymove_end = new Float32Array( 3 );
const _flymove_planes = [];
for ( let i = 0; i < MAX_CLIP_PLANES; i ++ )
	_flymove_planes[ i ] = new Float32Array( 3 );

// Cached buffer for SV_PushEntity (Golden Rule #4)
const _pushentity_end = new Float32Array( 3 );

// Cached buffers for SV_PushMove (Golden Rule #4)
const _pushmove_mins = new Float32Array( 3 );
const _pushmove_maxs = new Float32Array( 3 );
const _pushmove_move = new Float32Array( 3 );
const _pushmove_entorig = new Float32Array( 3 );
const _pushmove_pushorig = new Float32Array( 3 );
const _pushmove_moved_edict = new Array( MAX_EDICTS );
const _pushmove_moved_from = [];
for ( let i = 0; i < MAX_EDICTS; i ++ )
	_pushmove_moved_from[ i ] = new Float32Array( 3 );

// Cached buffers for SV_CheckStuck (Golden Rule #4)
const _checkstuck_org = new Float32Array( 3 );

// Cached buffers for SV_CheckWater (Golden Rule #4)
const _checkwater_point = new Float32Array( 3 );

// Cached buffers for SV_WallFriction (Golden Rule #4)
const _wallfriction_forward = new Float32Array( 3 );
const _wallfriction_right = new Float32Array( 3 );
const _wallfriction_up = new Float32Array( 3 );
const _wallfriction_into = new Float32Array( 3 );
const _wallfriction_side = new Float32Array( 3 );

// Cached buffers for SV_TryUnstick (Golden Rule #4)
const _tryunstick_oldorg = new Float32Array( 3 );
const _tryunstick_dir = new Float32Array( 3 );
const _tryunstick_steptrace = {};

// Cached buffers for SV_WalkMove (Golden Rule #4)
const _walkmove_upmove = new Float32Array( 3 );
const _walkmove_downmove = new Float32Array( 3 );
const _walkmove_oldorg = new Float32Array( 3 );
const _walkmove_oldvel = new Float32Array( 3 );
const _walkmove_nosteporg = new Float32Array( 3 );
const _walkmove_nostepvel = new Float32Array( 3 );

// Cached buffer for SV_Physics_Toss (Golden Rule #4)
const _toss_move = new Float32Array( 3 );

// Cached buffers for SV_PushRotate (Golden Rule #4)
const _pushrotate_amove = new Float32Array( 3 );
const _pushrotate_a = new Float32Array( 3 );
const _pushrotate_pushorig = new Float32Array( 3 );
const _pushrotate_entorig = new Float32Array( 3 );
const _pushrotate_move = new Float32Array( 3 );
const _pushrotate_org = new Float32Array( 3 );
const _pushrotate_org2 = new Float32Array( 3 );
const _pushrotate_forward = new Float32Array( 3 );
const _pushrotate_right = new Float32Array( 3 );
const _pushrotate_up = new Float32Array( 3 );
const _pushrotate_moved_edict = new Array( MAX_EDICTS );
const _pushrotate_moved_from = [];
for ( let i = 0; i < MAX_EDICTS; i ++ )
	_pushrotate_moved_from[ i ] = new Float32Array( 3 );

//
// cvars (proper cvar_t instances, registered in sv_main.js SV_Init)
//
export const sv_maxvelocity = new cvar_t( 'sv_maxvelocity', '2000' );
export const sv_gravity = new cvar_t( 'sv_gravity', '800' );
export const sv_nostep = new cvar_t( 'sv_nostep', '0' );
export const sv_friction = new cvar_t( 'sv_friction', '4' );
export const sv_edgefriction = new cvar_t( 'edgefriction', '2' );
export const sv_stopspeed = new cvar_t( 'sv_stopspeed', '100' );
export const sv_maxspeed = new cvar_t( 'sv_maxspeed', '320' );
export const sv_accelerate = new cvar_t( 'sv_accelerate', '10' );
export const sv_idealpitchscale = new cvar_t( 'sv_idealpitchscale', '0.8' );

//
// External references (set by the engine during initialization)
//
export let sv = null; // server_t
export let svs = null; // server_static_t
export let sv_player = null; // edict_t *
export let pr_global_struct = null;
export let host_frametime = 0;
export let pr_strings = '';

/**
 * Points the physics module at the current server state and QuakeC globals. Called by sv_main.js's `SV_SpawnServer`
 * at each map load, after `PR_LoadProgs` so `pr_global_struct` is valid; the references are kept until the next call.
 *
 * @param {server_t} _sv the server (`sv`): edicts, `num_edicts` and `time` (seconds) are used
 * @param {server_static_t} _svs the persistent server state (`svs`): `clients` and `maxclients` are used
 * @param {globalvars_t} _pr_global_struct the QuakeC globals (`self`, `other`, `time`, `force_retouch` and the
 *   `StartFrame`/`PlayerPreThink`/`PlayerPostThink` function numbers)
 */
export function SV_SetState( _sv, _svs, _pr_global_struct ) {

	sv = _sv;
	svs = _svs;
	pr_global_struct = _pr_global_struct;

}

/**
 * Sets the length of the physics frame (`host_frametime` here). Called by host.js's `Host_ServerFrame` before each
 * `SV_Physics`; the value stays until the next call.
 *
 * @param {number} dt the host frame time in seconds
 */
export function SV_SetFrametime( dt ) {

	host_frametime = dt;

}

/**
 * Sets `sv_player`, the edict of the client whose messages are being processed. Called by sv_user.js's
 * `SV_RunClients` for each active client; `SV_WalkMove` reads its water-jump flag. Stays set until the next call.
 *
 * @param {edict_t} ent the client's player edict
 */
export function SV_SetPlayer( ent ) {

	sv_player = ent;

}

// Stub references to functions from other modules
// These should be overridden by the engine
export let SV_Move = null;
export let SV_TestEntityPosition = null;
export let SV_LinkEdict = null;
export let SV_PointContents = null;
export let SV_StartSound = null;
export let PR_ExecuteProgram = null;
export let EDICT_TO_PROG = null;
export let PROG_TO_EDICT = null;
export let NEXT_EDICT = null;
export let GetEdictFieldValue = null;

/**
 * Installs the world, sound and QuakeC entry points this module calls (they live in modules that import this one).
 * Called by sv_main.js's `SV_SpawnServer` at each map load. Explicit null restores an uninitialized hook after
 * isolated physics trials; omitted/undefined hooks retain the normal host wiring. `SV_StartSound`, `PROG_TO_EDICT`,
 * `NEXT_EDICT` and `GetEdictFieldValue` are only replaced by a truthy value, so null leaves them as they were.
 *
 * @param {{ SV_Move?: ?function(Float32Array, Float32Array, Float32Array, Float32Array, number, edict_t): trace_t,
 *   SV_TestEntityPosition?: ?function(edict_t): ?edict_t, SV_LinkEdict?: ?function(edict_t, boolean): void,
 *   SV_PointContents?: ?function(Float32Array): number,
 *   SV_StartSound?: function(edict_t, number, string, number, number): void,
 *   PR_ExecuteProgram?: ?function(number): void, EDICT_TO_PROG?: ?function(edict_t): number,
 *   PROG_TO_EDICT?: function(number): edict_t, NEXT_EDICT?: function(edict_t): edict_t,
 *   GetEdictFieldValue?: function(edict_t, string): ?{ accessor: DataView, ofs: number } }} callbacks the hooks, named
 *   as the exported bindings they replace
 */
export function SV_SetCallbacks( callbacks ) {

	// Explicit null restores an uninitialized hook after isolated physics
	// trials; omitted/undefined hooks retain the normal host wiring.
	if ( callbacks.SV_Move !== undefined ) SV_Move = callbacks.SV_Move;
	if ( callbacks.SV_TestEntityPosition !== undefined ) SV_TestEntityPosition = callbacks.SV_TestEntityPosition;
	if ( callbacks.SV_LinkEdict !== undefined ) SV_LinkEdict = callbacks.SV_LinkEdict;
	if ( callbacks.SV_PointContents !== undefined ) SV_PointContents = callbacks.SV_PointContents;
	if ( callbacks.SV_StartSound ) SV_StartSound = callbacks.SV_StartSound;
	if ( callbacks.PR_ExecuteProgram !== undefined ) PR_ExecuteProgram = callbacks.PR_ExecuteProgram;
	if ( callbacks.EDICT_TO_PROG !== undefined ) EDICT_TO_PROG = callbacks.EDICT_TO_PROG;
	if ( callbacks.PROG_TO_EDICT ) PROG_TO_EDICT = callbacks.PROG_TO_EDICT;
	if ( callbacks.NEXT_EDICT ) NEXT_EDICT = callbacks.NEXT_EDICT;
	if ( callbacks.GetEdictFieldValue ) GetEdictFieldValue = callbacks.GetEdictFieldValue;

}

function IS_NAN( x ) {

	return isNaN( x );

}

/*
================
SV_CheckAllEnts
================
*/
/**
 * Debug check (WinQuake sv_phys.c): prints "entity in invalid position" for every in-use entity, other than
 * pushers and MOVETYPE_NONE/FOLLOW/NOCLIP entities, that `SV_TestEntityPosition` finds in solid. Nothing in the engine
 * calls it.
 */
export function SV_CheckAllEnts() {

	let check;

	// see if any solid entities are inside the final position
	check = NEXT_EDICT( sv.edicts[ 0 ] );
	for ( let e = 1; e < sv.num_edicts; e ++, check = NEXT_EDICT( check ) ) {

		if ( check.free )
			continue;
		if ( check.v.movetype === MOVETYPE_PUSH
			|| check.v.movetype === MOVETYPE_NONE
			|| check.v.movetype === MOVETYPE_FOLLOW
			|| check.v.movetype === MOVETYPE_NOCLIP )
			continue;

		if ( SV_TestEntityPosition( check ) )
			Con_Printf( 'entity in invalid position\n' );

	}

}

/*
================
SV_CheckVelocity
================
*/
/**
 * Bounds an entity's velocity (WinQuake sv_phys.c): a NaN velocity or origin component is reported ("Got a NaN
 * velocity/origin on <classname>") and zeroed, and each velocity component is clamped to +/- `sv_maxvelocity`
 * (default 2000 Quake units per second). Called before client, toss and freefall moves.
 *
 * @param {edict_t} ent the entity; mutates `ent.v.velocity` and `ent.v.origin`
 */
export function SV_CheckVelocity( ent ) {

	//
	// bound velocity
	//
	for ( let i = 0; i < 3; i ++ ) {

		if ( IS_NAN( ent.v.velocity[ i ] ) ) {

			Con_Printf( 'Got a NaN velocity on %s\n', PR_GetString( ent.v.classname ) );
			ent.v.velocity[ i ] = 0;

		}

		if ( IS_NAN( ent.v.origin[ i ] ) ) {

			Con_Printf( 'Got a NaN origin on %s\n', PR_GetString( ent.v.classname ) );
			ent.v.origin[ i ] = 0;

		}

		if ( ent.v.velocity[ i ] > sv_maxvelocity.value )
			ent.v.velocity[ i ] = sv_maxvelocity.value;
		else if ( ent.v.velocity[ i ] < - sv_maxvelocity.value )
			ent.v.velocity[ i ] = - sv_maxvelocity.value;

	}

}

/*
=============
SV_RunThink
=============
*/
/**
 * Runs thinking code if time (WinQuake sv_phys.c): when `nextthink` is positive and falls before the end of this frame
 * (`sv.time + host_frametime`) it clears `nextthink`, sets QuakeC `time` (to `nextthink`, but never in the past),
 * `self` = the entity and `other` = world, and runs `ent.v.think`. There is some play in the exact time the think
 * function will be called, because it is called before any movement is done in a frame. Not used for pushmove
 * objects, because they must be exact. While the rend-veil hook holds the entity, nothing runs.
 *
 * @param {edict_t} ent the entity
 * @returns {boolean} false if the entity removed itself (it is free after its think), true otherwise
 */
export function SV_RunThink( ent ) {
	// Preserve the pending native thinker for the first Focus tick, including
	// callers that use this public think entry point outside SV_Physics.
	if ( SV_RendVeilHolding( ent ) ) return true;

	let thinktime;

	thinktime = ent.v.nextthink;
	if ( thinktime <= 0 || thinktime > sv.time + host_frametime )
		return true;

	if ( thinktime < sv.time )
		thinktime = sv.time; // don't let things stay in the past.
	// it is possible to start that way
	// by a trigger with a local time.
	ent.v.nextthink = 0;
	pr_global_struct.time = thinktime;
	pr_global_struct.self = EDICT_TO_PROG( ent );
	pr_global_struct.other = EDICT_TO_PROG( sv.edicts[ 0 ] );
	PR_ExecuteProgram( ent.v.think );
	return ! ent.free;

}

/*
==================
SV_Impact
==================
*/
/**
 * Two entities have touched, so run their touch functions (WinQuake sv_phys.c): each entity's QuakeC `touch` runs,
 * if it has one and is not SOLID_NOT, with `self` = that entity and `other` = the other one and `time` = `sv.time`.
 * QuakeC `self` and `other` are restored afterwards. Called after a move clips against something.
 *
 * @param {edict_t} e1 the entity that moved
 * @param {edict_t} e2 the entity it hit
 */
export function SV_Impact( e1, e2 ) {

	const old_self = pr_global_struct.self;
	const old_other = pr_global_struct.other;

	pr_global_struct.time = sv.time;
	if ( e1.v.touch && e1.v.solid !== SOLID_NOT ) {

		pr_global_struct.self = EDICT_TO_PROG( e1 );
		pr_global_struct.other = EDICT_TO_PROG( e2 );
		PR_ExecuteProgram( e1.v.touch );

	}

	if ( e2.v.touch && e2.v.solid !== SOLID_NOT ) {

		pr_global_struct.self = EDICT_TO_PROG( e2 );
		pr_global_struct.other = EDICT_TO_PROG( e1 );
		PR_ExecuteProgram( e2.v.touch );

	}

	pr_global_struct.self = old_self;
	pr_global_struct.other = old_other;

}

/*
==================
ClipVelocity
==================
*/
/**
 * Slide off of the impacting object (WinQuake sv_phys.c): removes the part of the velocity going into the plane,
 * scaled by `overbounce`, and snaps components within 0.1 of zero to 0.
 *
 * @param {Float32Array|Array<number>} _in velocity to clip (Quake units per second)
 * @param {Float32Array} normal unit normal of the surface hit
 * @param {Float32Array|Array<number>} out written: the clipped velocity; may be the same array as `_in`
 * @param {number} overbounce 1 to slide along the plane, more to bounce off it (1.5 for MOVETYPE_BOUNCE)
 * @returns {number} the blocked flags (1 = floor, a normal pointing up; 2 = step / wall, a vertical plane)
 */
export function ClipVelocity( _in, normal, out, overbounce ) {

	let blocked = 0;

	if ( normal[ 2 ] > 0 )
		blocked |= 1; // floor
	if ( normal[ 2 ] === 0 )
		blocked |= 2; // step

	const backoff = DotProduct( _in, normal ) * overbounce;

	for ( let i = 0; i < 3; i ++ ) {

		const change = normal[ i ] * backoff;
		out[ i ] = _in[ i ] - change;
		if ( out[ i ] > - STOP_EPSILON && out[ i ] < STOP_EPSILON )
			out[ i ] = 0;

	}

	return blocked;

}

/*
============
SV_FlyMove
============
*/
/**
 * The basic solid body movement clip that slides along multiple planes (WinQuake sv_phys.c): up to 4 traces with
 * `SV_Move`, clipping the velocity against up to 5 planes and running `SV_Impact` on each hit. Landing on a floor
 * (normal z > 0.7) of a SOLID_BSP entity sets FL_ONGROUND and `groundentity`. Used for walking, flying and freefall.
 * Moves `ent.v.origin` and changes `ent.v.velocity` in place; stops early if an impact frees the entity.
 *
 * @param {edict_t} ent the moving entity
 * @param {number} time seconds of movement to cover at the entity's velocity
 * @param {?Object} steptrace if steptrace is not null, the trace of any vertical wall hit will be stored (copied into
 *   it with `Object.assign`)
 * @returns {number} the clipflags if the velocity was modified (hit something solid): 1 = floor, 2 = wall / step,
 *   4 = dead stop; trapped in solid or out of clip planes returns 3 and a corner of more than two planes returns 7,
 *   both with the velocity zeroed; 0 when nothing was hit
 * @throws {Error} via `Sys_Error` when a partial move reports no entity hit ("SV_FlyMove: !trace.ent")
 */
export function SV_FlyMove( ent, time, steptrace ) {

	const numbumps = 4;

	let blocked = 0;
	// Use cached buffers instead of allocating per-call
	const original_velocity = _flymove_original_velocity;
	const primal_velocity = _flymove_primal_velocity;
	const new_velocity = _flymove_new_velocity;
	const dir = _flymove_dir;
	const end = _flymove_end;
	const planes = _flymove_planes;

	VectorCopy( ent.v.velocity, original_velocity );
	VectorCopy( ent.v.velocity, primal_velocity );
	let numplanes = 0;

	let time_left = time;

	for ( let bumpcount = 0; bumpcount < numbumps; bumpcount ++ ) {

		if ( ent.v.velocity[ 0 ] === 0 && ent.v.velocity[ 1 ] === 0 && ent.v.velocity[ 2 ] === 0 )
			break;

		for ( let i = 0; i < 3; i ++ )
			end[ i ] = ent.v.origin[ i ] + time_left * ent.v.velocity[ i ];

		const trace = SV_Move( ent.v.origin, ent.v.mins, ent.v.maxs, end, false, ent );

		if ( trace.allsolid ) {

			// entity is trapped in another solid
			VectorCopy( vec3_origin, ent.v.velocity );
			return 3;

		}

		if ( trace.fraction > 0 ) {

			// actually covered some distance
			VectorCopy( trace.endpos, ent.v.origin );
			VectorCopy( ent.v.velocity, original_velocity );
			numplanes = 0;

		}

		if ( trace.fraction === 1 )
			break; // moved the entire distance

		if ( trace.ent == null )
			Sys_Error( 'SV_FlyMove: !trace.ent' );

		if ( trace.plane.normal[ 2 ] > 0.7 ) {

			blocked |= 1; // floor
			if ( trace.ent.v.solid === SOLID_BSP ) {

				ent.v.flags = ( ent.v.flags | 0 ) | FL_ONGROUND;
				ent.v.groundentity = EDICT_TO_PROG( trace.ent );

			}

		}

		if ( trace.plane.normal[ 2 ] === 0 ) {

			blocked |= 2; // step
			if ( steptrace )
				Object.assign( steptrace, trace ); // save for player extrafriction

		}

		//
		// run the impact function
		//
		SV_Impact( ent, trace.ent );
		if ( ent.free )
			break; // removed by the impact function

		time_left -= time_left * trace.fraction;

		// cliped to another plane
		if ( numplanes >= MAX_CLIP_PLANES ) {

			// this shouldn't really happen
			VectorCopy( vec3_origin, ent.v.velocity );
			return 3;

		}

		VectorCopy( trace.plane.normal, planes[ numplanes ] );
		numplanes ++;

		//
		// modify original_velocity so it parallels all of the clip planes
		//
		let i, j;
		for ( i = 0; i < numplanes; i ++ ) {

			ClipVelocity( original_velocity, planes[ i ], new_velocity, 1 );
			for ( j = 0; j < numplanes; j ++ )
				if ( j !== i ) {

					if ( DotProduct( new_velocity, planes[ j ] ) < 0 )
						break; // not ok

				}

			if ( j === numplanes )
				break;

		}

		if ( i !== numplanes ) {

			// go along this plane
			VectorCopy( new_velocity, ent.v.velocity );

		} else {

			// go along the crease
			if ( numplanes !== 2 ) {

				VectorCopy( vec3_origin, ent.v.velocity );
				return 7;

			}

			CrossProduct( planes[ 0 ], planes[ 1 ], dir );
			const d = DotProduct( dir, ent.v.velocity );
			VectorScale( dir, d, ent.v.velocity );

		}

		//
		// if original velocity is against the original velocity, stop dead
		// to avoid tiny occilations in sloping corners
		//
		if ( DotProduct( ent.v.velocity, primal_velocity ) <= 0 ) {

			VectorCopy( vec3_origin, ent.v.velocity );
			return blocked;

		}

	}

	return blocked;

}

/*
============
SV_AddGravity
============
*/
/**
 * Applies one frame of gravity (WinQuake sv_phys.c): lowers `ent.v.velocity[2]` by the entity's QuakeC `gravity`
 * field (0 or missing means 1) times `sv_gravity` (default 800 Quake units per second squared) times `host_frametime`.
 *
 * @param {edict_t} ent the entity; mutates its velocity
 */
export function SV_AddGravity( ent ) {

	let ent_gravity;

	const val = GetEdictFieldValue != null ? GetEdictFieldValue( ent, 'gravity' ) : null;
	if ( val != null ) {

		const gravity = val.accessor.getFloat( val.ofs );
		ent_gravity = gravity !== 0 ? gravity : 1.0;

	} else {

		ent_gravity = 1.0;

	}

	ent.v.velocity[ 2 ] -= ent_gravity * sv_gravity.value * host_frametime;

}

/*
===============================================================================

PUSHMOVE

===============================================================================
*/

/*
============
SV_PushEntity
============
*/
/**
 * Moves an entity by a fixed offset, clipping with `SV_Move` (missiles use MOVE_MISSILE; triggers and non-solids only
 * clip against bmodels), relinks it touching triggers, and runs `SV_Impact` with whatever it hit (WinQuake
 * sv_phys.c). Does not change the entities velocity at all.
 *
 * @param {edict_t} ent the entity; `ent.v.origin` is set to the trace end
 * @param {Float32Array} push the offset (Quake units, world space)
 * @returns {trace_t} the trace of the move
 */
export function SV_PushEntity( ent, push ) {

	// Use cached buffer instead of allocating per-call
	const end = _pushentity_end;

	VectorAdd( ent.v.origin, push, end );

	let trace;
	if ( ent.v.movetype === MOVETYPE_FLYMISSILE )
		trace = SV_Move( ent.v.origin, ent.v.mins, ent.v.maxs, end, MOVE_MISSILE, ent );
	else if ( ent.v.solid === SOLID_TRIGGER || ent.v.solid === SOLID_NOT )
		// only clip against bmodels
		trace = SV_Move( ent.v.origin, ent.v.mins, ent.v.maxs, end, MOVE_NOMONSTERS, ent );
	else
		trace = SV_Move( ent.v.origin, ent.v.mins, ent.v.maxs, end, MOVE_NORMAL, ent );

	VectorCopy( trace.endpos, ent.v.origin );
	SV_LinkEdict( ent, true );

	if ( trace.ent )
		SV_Impact( ent, trace.ent );

	return trace;

}

/*
============
SV_PushRotate
============
*/
/**
 * Handles rotating brush entities (doors, platforms with avelocity); QUAKE2 feature of WinQuake sv_phys.c. Turns the
 * pusher by `avelocity * movetime` and advances its `ltime`, then carries every entity standing on it or now inside
 * it around the pusher's origin, turning it too. If one cannot be moved it is put back (corpses and triggers are
 * instead squashed to a zero-size box), the pusher and all entities moved so far are put back, `ltime` is restored,
 * and the pusher's QuakeC `blocked` function runs with `other` = the blocker. With no angular velocity it only
 * advances `ltime`.
 *
 * @param {edict_t} pusher the MOVETYPE_PUSH entity
 * @param {number} movetime seconds of rotation to apply
 */
export function SV_PushRotate( pusher, movetime ) {

	// Use cached buffers instead of allocating per-call
	const amove = _pushrotate_amove;
	const a = _pushrotate_a;
	const pushorig = _pushrotate_pushorig;
	const entorig = _pushrotate_entorig;
	const move = _pushrotate_move;
	const org = _pushrotate_org;
	const org2 = _pushrotate_org2;
	const forward = _pushrotate_forward;
	const right = _pushrotate_right;
	const up = _pushrotate_up;
	const moved_edict = _pushrotate_moved_edict;
	const moved_from = _pushrotate_moved_from;
	// Clear moved_edict array for reuse
	for ( let i = 0; i < MAX_EDICTS; i ++ )
		moved_edict[ i ] = null;

	// If no angular velocity, just advance time
	if ( pusher.v.avelocity[ 0 ] === 0 && pusher.v.avelocity[ 1 ] === 0 && pusher.v.avelocity[ 2 ] === 0 ) {

		pusher.v.ltime += movetime;
		return;

	}

	// Calculate angular movement
	for ( let i = 0; i < 3; i ++ )
		amove[ i ] = pusher.v.avelocity[ i ] * movetime;

	// Build rotation matrix (negate for proper coordinate transform)
	VectorSubtract( vec3_origin, amove, a );
	AngleVectors( a, forward, right, up );

	VectorCopy( pusher.v.angles, pushorig );

	// Move the pusher to its final position
	VectorAdd( pusher.v.angles, amove, pusher.v.angles );
	pusher.v.ltime += movetime;
	SV_LinkEdict( pusher, false );

	// See if any solid entities are inside the final position
	let num_moved = 0;
	let check = NEXT_EDICT( sv.edicts[ 0 ] );
	for ( let e = 1; e < sv.num_edicts; e ++, check = NEXT_EDICT( check ) ) {

		if ( check.free )
			continue;
		if ( check.v.movetype === MOVETYPE_PUSH
			|| check.v.movetype === MOVETYPE_NONE
			|| check.v.movetype === MOVETYPE_FOLLOW
			|| check.v.movetype === MOVETYPE_NOCLIP )
			continue;

		// If the entity is standing on the pusher, it will definitely be moved
		if ( ! ( ( ( check.v.flags | 0 ) & FL_ONGROUND )
			&& PROG_TO_EDICT( check.v.groundentity ) === pusher ) ) {

			if ( check.v.absmin[ 0 ] >= pusher.v.absmax[ 0 ]
				|| check.v.absmin[ 1 ] >= pusher.v.absmax[ 1 ]
				|| check.v.absmin[ 2 ] >= pusher.v.absmax[ 2 ]
				|| check.v.absmax[ 0 ] <= pusher.v.absmin[ 0 ]
				|| check.v.absmax[ 1 ] <= pusher.v.absmin[ 1 ]
				|| check.v.absmax[ 2 ] <= pusher.v.absmin[ 2 ] )
				continue;

			// See if the ent's bbox is inside the pusher's final position
			if ( ! SV_TestEntityPosition( check ) )
				continue;

		}

		// Remove the onground flag for non-players
		if ( check.v.movetype !== MOVETYPE_WALK )
			check.v.flags = ( check.v.flags | 0 ) & ~FL_ONGROUND;

		VectorCopy( check.v.origin, entorig );
		VectorCopy( check.v.origin, moved_from[ num_moved ] );
		moved_edict[ num_moved ] = check;
		num_moved ++;

		// Calculate destination position by rotating around pusher origin
		VectorSubtract( check.v.origin, pusher.v.origin, org );
		org2[ 0 ] = DotProduct( org, forward );
		org2[ 1 ] = - DotProduct( org, right );
		org2[ 2 ] = DotProduct( org, up );
		VectorSubtract( org2, org, move );

		// Try moving the contacted entity
		pusher.v.solid = SOLID_NOT;
		SV_PushEntity( check, move );
		pusher.v.solid = SOLID_BSP;

		// If it is still inside the pusher, block
		const block = SV_TestEntityPosition( check );
		if ( block ) {

			// Fail the move
			if ( check.v.mins[ 0 ] === check.v.maxs[ 0 ] )
				continue;
			if ( check.v.solid === SOLID_NOT || check.v.solid === SOLID_TRIGGER ) {

				// Corpse
				check.v.mins[ 0 ] = check.v.mins[ 1 ] = 0;
				VectorCopy( check.v.mins, check.v.maxs );
				continue;

			}

			VectorCopy( entorig, check.v.origin );
			SV_LinkEdict( check, true );

			VectorCopy( pushorig, pusher.v.angles );
			SV_LinkEdict( pusher, false );
			pusher.v.ltime -= movetime;

			// If the pusher has a "blocked" function, call it
			if ( pusher.v.blocked ) {

				pr_global_struct.self = EDICT_TO_PROG( pusher );
				pr_global_struct.other = EDICT_TO_PROG( check );
				PR_ExecuteProgram( pusher.v.blocked );

			}

			// Move back any entities we already moved
			for ( let i = 0; i < num_moved; i ++ ) {

				VectorCopy( moved_from[ i ], moved_edict[ i ].v.origin );
				VectorSubtract( moved_edict[ i ].v.angles, amove, moved_edict[ i ].v.angles );
				SV_LinkEdict( moved_edict[ i ], false );

			}
			return;

		} else {

			// Entity was successfully moved, add angular movement
			VectorAdd( check.v.angles, amove, check.v.angles );

		}

	}

}

/*
============
SV_PushMove
============
*/
/**
 * Moves a pusher (door, plat, train) by `velocity * movetime` and advances its `ltime`, carrying every entity standing
 * on it or now inside its swept box (WinQuake sv_phys.c). If one cannot be moved it is put back (corpses and triggers
 * are instead squashed to a zero-size box), the pusher and all entities moved so far are put back, `ltime` is restored,
 * and the pusher's QuakeC `blocked` function runs with `other` = the blocker; otherwise, just stay in place until the
 * obstacle is gone. With zero velocity it only advances `ltime`.
 *
 * @param {edict_t} pusher the MOVETYPE_PUSH entity
 * @param {number} movetime seconds of movement to apply
 */
export function SV_PushMove( pusher, movetime ) {

	// Use cached buffers to avoid per-call allocations (Golden Rule #4)
	const mins = _pushmove_mins;
	const maxs = _pushmove_maxs;
	const move = _pushmove_move;
	const entorig = _pushmove_entorig;
	const pushorig = _pushmove_pushorig;
	const moved_edict = _pushmove_moved_edict;
	const moved_from = _pushmove_moved_from;

	if ( pusher.v.velocity[ 0 ] === 0 && pusher.v.velocity[ 1 ] === 0 && pusher.v.velocity[ 2 ] === 0 ) {

		pusher.v.ltime += movetime;
		return;

	}

	for ( let i = 0; i < 3; i ++ ) {

		move[ i ] = pusher.v.velocity[ i ] * movetime;
		mins[ i ] = pusher.v.absmin[ i ] + move[ i ];
		maxs[ i ] = pusher.v.absmax[ i ] + move[ i ];

	}

	VectorCopy( pusher.v.origin, pushorig );

	// move the pusher to it's final position
	VectorAdd( pusher.v.origin, move, pusher.v.origin );
	pusher.v.ltime += movetime;
	SV_LinkEdict( pusher, false );

	// see if any solid entities are inside the final position
	let num_moved = 0;
	let check = NEXT_EDICT( sv.edicts[ 0 ] );
	for ( let e = 1; e < sv.num_edicts; e ++, check = NEXT_EDICT( check ) ) {

		if ( check.free )
			continue;
		if ( check.v.movetype === MOVETYPE_PUSH
			|| check.v.movetype === MOVETYPE_NONE
			|| check.v.movetype === MOVETYPE_FOLLOW
			|| check.v.movetype === MOVETYPE_NOCLIP )
			continue;

		// if the entity is standing on the pusher, it will definately be moved
		if ( ! ( ( ( check.v.flags | 0 ) & FL_ONGROUND )
			&& PROG_TO_EDICT( check.v.groundentity ) === pusher ) ) {

			if ( check.v.absmin[ 0 ] >= maxs[ 0 ]
				|| check.v.absmin[ 1 ] >= maxs[ 1 ]
				|| check.v.absmin[ 2 ] >= maxs[ 2 ]
				|| check.v.absmax[ 0 ] <= mins[ 0 ]
				|| check.v.absmax[ 1 ] <= mins[ 1 ]
				|| check.v.absmax[ 2 ] <= mins[ 2 ] )
				continue;

			// see if the ent's bbox is inside the pusher's final position
			if ( ! SV_TestEntityPosition( check ) )
				continue;

		}

		// remove the onground flag for non-players
		if ( check.v.movetype !== MOVETYPE_WALK )
			check.v.flags = ( check.v.flags | 0 ) & ~FL_ONGROUND;

		VectorCopy( check.v.origin, entorig );
		VectorCopy( check.v.origin, moved_from[ num_moved ] );
		moved_edict[ num_moved ] = check;
		num_moved ++;

		// try moving the contacted entity
		pusher.v.solid = SOLID_NOT;
		SV_PushEntity( check, move );
		pusher.v.solid = SOLID_BSP;

		// if it is still inside the pusher, block
		const block = SV_TestEntityPosition( check );
		if ( block ) {

			// fail the move
			if ( check.v.mins[ 0 ] === check.v.maxs[ 0 ] )
				continue;
			if ( check.v.solid === SOLID_NOT || check.v.solid === SOLID_TRIGGER ) {

				// corpse
				check.v.mins[ 0 ] = check.v.mins[ 1 ] = 0;
				VectorCopy( check.v.mins, check.v.maxs );
				continue;

			}

			VectorCopy( entorig, check.v.origin );
			SV_LinkEdict( check, true );

			VectorCopy( pushorig, pusher.v.origin );
			SV_LinkEdict( pusher, false );
			pusher.v.ltime -= movetime;

			// if the pusher has a "blocked" function, call it
			// otherwise, just stay in place until the obstacle is gone
			if ( pusher.v.blocked ) {

				pr_global_struct.self = EDICT_TO_PROG( pusher );
				pr_global_struct.other = EDICT_TO_PROG( check );
				PR_ExecuteProgram( pusher.v.blocked );

			}

			// move back any entities we already moved
			for ( let i = 0; i < num_moved; i ++ ) {

				VectorCopy( moved_from[ i ], moved_edict[ i ].v.origin );
				SV_LinkEdict( moved_edict[ i ], false );

			}

			return;

		}

	}

}

/*
================
SV_Physics_Pusher
================
*/
/**
 * Runs one frame for a MOVETYPE_PUSH entity (WinQuake sv_phys.c): moves it on its own clock `ltime`, stopping at
 * `nextthink` if that comes first this frame, by `SV_PushRotate` when it has angular velocity and `SV_PushMove`
 * otherwise, then runs its QuakeC `think` when `ltime` reached `nextthink`. Called by `SV_Physics`.
 *
 * @param {edict_t} ent the pusher
 */
export function SV_Physics_Pusher( ent ) {

	const oldltime = ent.v.ltime;

	const thinktime = ent.v.nextthink;
	let movetime;
	if ( thinktime < ent.v.ltime + host_frametime ) {

		movetime = thinktime - ent.v.ltime;
		if ( movetime < 0 )
			movetime = 0;

	} else {

		movetime = host_frametime;

	}

	if ( movetime ) {

		// Check for angular velocity (rotating doors/platforms)
		if ( ent.v.avelocity[ 0 ] !== 0 || ent.v.avelocity[ 1 ] !== 0 || ent.v.avelocity[ 2 ] !== 0 )
			SV_PushRotate( ent, movetime );
		else
			SV_PushMove( ent, movetime ); // advances ent.v.ltime if not blocked

	}

	if ( thinktime > oldltime && thinktime <= ent.v.ltime ) {

		ent.v.nextthink = 0;
		pr_global_struct.time = sv.time;
		pr_global_struct.self = EDICT_TO_PROG( ent );
		pr_global_struct.other = EDICT_TO_PROG( sv.edicts[ 0 ] );
		PR_ExecuteProgram( ent.v.think );
		if ( ent.free )
			return;

	}

}

/*
===============================================================================

CLIENT MOVEMENT

===============================================================================
*/

/*
=============
SV_CheckStuck
=============
*/
/**
 * This is a big hack to try and fix the rare case of getting stuck in the world clipping hull (WinQuake sv_phys.c).
 * When the player is not in solid it records the origin in `ent.v.oldorigin`; otherwise it tries `oldorigin`, then
 * every offset of -1..1 units on x and y and 0..17 units up, keeping the first free spot ("Unstuck." with developer
 * on) or leaving the origin unchanged ("player is stuck."). Called each frame for walking players.
 *
 * @param {edict_t} ent the player edict; mutates `origin`/`oldorigin` and relinks it when moved
 */
export function SV_CheckStuck( ent ) {

	const org = _checkstuck_org;

	if ( ! SV_TestEntityPosition( ent ) ) {

		VectorCopy( ent.v.origin, ent.v.oldorigin );
		return;

	}

	VectorCopy( ent.v.origin, org );
	VectorCopy( ent.v.oldorigin, ent.v.origin );
	if ( ! SV_TestEntityPosition( ent ) ) {

		Con_DPrintf( 'Unstuck.\n' );
		SV_LinkEdict( ent, true );
		return;

	}

	for ( let z = 0; z < 18; z ++ )
		for ( let i = - 1; i <= 1; i ++ )
			for ( let j = - 1; j <= 1; j ++ ) {

				ent.v.origin[ 0 ] = org[ 0 ] + i;
				ent.v.origin[ 1 ] = org[ 1 ] + j;
				ent.v.origin[ 2 ] = org[ 2 ] + z;
				if ( ! SV_TestEntityPosition( ent ) ) {

					Con_DPrintf( 'Unstuck.\n' );
					SV_LinkEdict( ent, true );
					return;

				}

			}

	VectorCopy( org, ent.v.origin );
	Con_DPrintf( 'player is stuck.\n' );

}

/*
=============
SV_CheckWater
=============
*/
/**
 * Sets an entity's `waterlevel` (0 none, 1 feet, 2 waist, 3 eyes) and `watertype` (a `CONTENTS_*` value, empty when
 * dry) by testing the contents one unit above its feet, at the middle of its box and at its view offset (WinQuake
 * sv_phys.c). Called each frame for walking players, and by newer/gameplay/sv_respawn.js when a player rises.
 *
 * @param {edict_t} ent the entity; mutates `ent.v.waterlevel` and `ent.v.watertype`
 * @returns {boolean} true when the water is above the waist (level 2 or 3), which disables gravity for the frame
 */
export function SV_CheckWater( ent ) {

	const point = _checkwater_point;

	point[ 0 ] = ent.v.origin[ 0 ];
	point[ 1 ] = ent.v.origin[ 1 ];
	point[ 2 ] = ent.v.origin[ 2 ] + ent.v.mins[ 2 ] + 1;

	ent.v.waterlevel = 0;
	ent.v.watertype = CONTENTS_EMPTY;
	let cont = SV_PointContents( point );
	if ( cont <= CONTENTS_WATER ) {

		ent.v.watertype = cont;
		ent.v.waterlevel = 1;
		point[ 2 ] = ent.v.origin[ 2 ] + ( ent.v.mins[ 2 ] + ent.v.maxs[ 2 ] ) * 0.5;
		cont = SV_PointContents( point );
		if ( cont <= CONTENTS_WATER ) {

			ent.v.waterlevel = 2;
			point[ 2 ] = ent.v.origin[ 2 ] + ent.v.view_ofs[ 2 ];
			cont = SV_PointContents( point );
			if ( cont <= CONTENTS_WATER )
				ent.v.waterlevel = 3;

		}

	}

	return ent.v.waterlevel > 1;

}

/*
============
SV_WallFriction
============
*/
/**
 * Extra friction based on view angle when walking into a wall (WinQuake sv_phys.c): the more directly the player faces
 * the wall, the more the horizontal velocity along it is cut. Called by `SV_WalkMove` after a step move hit a wall.
 * No wall was recorded (SV_TryUnstick can report a wall hit without filling in the trace): nothing to take friction
 * from. C gets away with an unfilled trace_t; here it would be a missing plane, so a null trace or plane does nothing.
 *
 * @param {edict_t} ent the player; mutates `ent.v.velocity[0..1]`
 * @param {?{ plane?: { normal: Float32Array } }} trace the trace of the wall hit (filled by `SV_FlyMove`'s steptrace)
 */
export function SV_WallFriction( ent, trace ) {

	// No wall was recorded (SV_TryUnstick can report a wall hit without filling
	// in the trace): nothing to take friction from.  C gets away with an
	// unfilled trace_t; here it would be a missing plane.
	if ( trace == null || trace.plane == null )
		return;

	const forward = _wallfriction_forward;
	const right = _wallfriction_right;
	const up = _wallfriction_up;
	const into = _wallfriction_into;
	const side = _wallfriction_side;

	AngleVectors( ent.v.v_angle, forward, right, up );
	let d = DotProduct( trace.plane.normal, forward );

	d += 0.5;
	if ( d >= 0 )
		return;

	// cut the tangential velocity
	const i = DotProduct( trace.plane.normal, ent.v.velocity );
	VectorScale( trace.plane.normal, i, into );
	VectorSubtract( ent.v.velocity, into, side );

	ent.v.velocity[ 0 ] = side[ 0 ] * ( 1 + d );
	ent.v.velocity[ 1 ] = side[ 1 ] * ( 1 + d );

}

/*
=====================
SV_TryUnstick
======================
*/
/**
 * Player has come to a dead stop, possibly due to the problem with limited float precision at some angle joins in the
 * BSP hull (WinQuake sv_phys.c). Try fixing by pushing one pixel in each direction: it pushes 2 units along each of 8
 * axial and diagonal directions and retries the original horizontal move for 0.1 s, keeping the first that moves the
 * player more than 4 units. This is a hack, but in the interest of good gameplay... Called by `SV_WalkMove`.
 *
 * @param {edict_t} ent the player; its origin and velocity are changed
 * @param {Float32Array} oldvel the velocity before the blocked move (Quake units per second); its z is not used
 * @returns {number} the `SV_FlyMove` clip flags of the move that worked, or 7 (still not moving, velocity zeroed)
 */
export function SV_TryUnstick( ent, oldvel ) {

	const oldorg = _tryunstick_oldorg;
	const dir = _tryunstick_dir;
	const steptrace = _tryunstick_steptrace;

	VectorCopy( ent.v.origin, oldorg );
	VectorCopy( vec3_origin, dir );

	for ( let i = 0; i < 8; i ++ ) {

		// try pushing a little in an axial direction
		switch ( i ) {

			case 0: dir[ 0 ] = 2; dir[ 1 ] = 0; break;
			case 1: dir[ 0 ] = 0; dir[ 1 ] = 2; break;
			case 2: dir[ 0 ] = - 2; dir[ 1 ] = 0; break;
			case 3: dir[ 0 ] = 0; dir[ 1 ] = - 2; break;
			case 4: dir[ 0 ] = 2; dir[ 1 ] = 2; break;
			case 5: dir[ 0 ] = - 2; dir[ 1 ] = 2; break;
			case 6: dir[ 0 ] = 2; dir[ 1 ] = - 2; break;
			case 7: dir[ 0 ] = - 2; dir[ 1 ] = - 2; break;

		}

		SV_PushEntity( ent, dir );

		// retry the original move
		ent.v.velocity[ 0 ] = oldvel[ 0 ];
		ent.v.velocity[ 1 ] = oldvel[ 1 ];
		ent.v.velocity[ 2 ] = 0;
		const clip = SV_FlyMove( ent, 0.1, steptrace );

		if ( Math.abs( oldorg[ 1 ] - ent.v.origin[ 1 ] ) > 4
			|| Math.abs( oldorg[ 0 ] - ent.v.origin[ 0 ] ) > 4 ) {

			return clip;

		}

		// go back to the original pos and try again
		VectorCopy( oldorg, ent.v.origin );

	}

	VectorCopy( vec3_origin, ent.v.velocity );
	return 7; // still not moving

}

/*
=====================
SV_WalkMove
======================
*/
/**
 * Moves a walking player for one frame (WinQuake sv_phys.c). Only used by players. It does a regular slide move with
 * `SV_FlyMove` unless it looks like you ran into a step; then (when on ground or in water, still MOVETYPE_WALK,
 * `sv_nostep` off and `sv_player` not water jumping) it retries the move 18 units up, applies `SV_TryUnstick` and
 * `SV_WallFriction` as needed, and pushes back down. If the push down didn't end up on good ground (normal z <= 0.7),
 * the move without the step up is used. The portal-motion stepping hook is active around the step attempt.
 *
 * @param {edict_t} ent the player edict; mutates origin, velocity, flags and `groundentity`
 */
export function SV_WalkMove( ent ) {

	const upmove = _walkmove_upmove;
	const downmove = _walkmove_downmove;
	const oldorg = _walkmove_oldorg;
	const oldvel = _walkmove_oldvel;
	const nosteporg = _walkmove_nosteporg;
	const nostepvel = _walkmove_nostepvel;
	let steptrace = { plane: { normal: new Float32Array( 3 ) } };

	//
	// do a regular slide move unless it looks like you ran into a step
	//
	const oldonground = ( ent.v.flags | 0 ) & FL_ONGROUND;
	ent.v.flags = ( ent.v.flags | 0 ) & ~FL_ONGROUND;

	VectorCopy( ent.v.origin, oldorg );
	VectorCopy( ent.v.velocity, oldvel );

	let clip = SV_FlyMove( ent, host_frametime, steptrace );

	if ( ! ( clip & 2 ) )
		return; // move didn't block on a step

	if ( ! oldonground && ent.v.waterlevel === 0 )
		return; // don't stair up while jumping

	if ( ent.v.movetype !== MOVETYPE_WALK )
		return; // gibbed by a trigger

	if ( sv_nostep.value )
		return;

	if ( ( sv_player.v.flags | 0 ) & FL_WATERJUMP )
		return;

	VectorCopy( ent.v.origin, nosteporg );
	VectorCopy( ent.v.velocity, nostepvel );

	SV_PortalMoveStepping( ent, sv.time, true );
	try {

	//
	// try moving up and forward to go up a step
	//
	VectorCopy( oldorg, ent.v.origin ); // back to start pos

	VectorCopy( vec3_origin, upmove );
	VectorCopy( vec3_origin, downmove );
	upmove[ 2 ] = STEPSIZE;
	downmove[ 2 ] = - STEPSIZE + oldvel[ 2 ] * host_frametime;

	// move up
	SV_PushEntity( ent, upmove ); // FIXME: don't link?

	// move forward
	ent.v.velocity[ 0 ] = oldvel[ 0 ];
	ent.v.velocity[ 1 ] = oldvel[ 1 ];
	ent.v.velocity[ 2 ] = 0;
	steptrace = { plane: { normal: new Float32Array( 3 ) } };
	clip = SV_FlyMove( ent, host_frametime, steptrace );

	// check for stuckness, possibly due to the limited precision of floats
	// in the clipping hulls
	if ( clip ) {

		if ( Math.abs( oldorg[ 1 ] - ent.v.origin[ 1 ] ) < 0.03125
			&& Math.abs( oldorg[ 0 ] - ent.v.origin[ 0 ] ) < 0.03125 ) {

			// stepping up didn't make any progress
			clip = SV_TryUnstick( ent, oldvel );

		}

	}

	// extra friction based on view angle
	if ( clip & 2 )
		SV_WallFriction( ent, steptrace );

	// move down
	const downtrace = SV_PushEntity( ent, downmove ); // FIXME: don't link?

	if ( downtrace.plane.normal[ 2 ] > 0.7 ) {

		if ( ent.v.solid === SOLID_BSP ) {

			ent.v.flags = ( ent.v.flags | 0 ) | FL_ONGROUND;
			ent.v.groundentity = EDICT_TO_PROG( downtrace.ent );

		}

	} else {

		// if the push down didn't end up on good ground, use the move without
		// the step up. This happens near wall / slope combinations, and can
		// cause the player to hop up higher on a slope too steep to climb
		VectorCopy( nosteporg, ent.v.origin );
		VectorCopy( nostepvel, ent.v.velocity );

	}

	} finally {

		SV_PortalMoveStepping( ent, sv.time, false );

	}

}

// progs' teleport_touch sets velocity = v_forward * 300 and teleport_time = time + 0.7
// (water jumping also uses teleport_time, but for 2 seconds)
const TELEPORT_LAUNCH_SCALE = 0.5;
const TELEPORT_HOLD_MAX = 0.75;

/*
================
SV_SoftenTeleportLaunch
================
*/
/**
 * Halve the push the player gets when coming out of a teleporter (this port's change, not WinQuake). progs'
 * teleport_touch sets velocity = v_forward * 300 and teleport_time = time + 0.7; once per new `teleport_time` that is
 * at most 0.75 s ahead of `sv.time` (so the 2 s water jump hold is left alone), the velocity is scaled by 0.5. Called
 * by `SV_Physics_Client` after PlayerPreThink.
 *
 * @param {edict_t} ent the player edict; `ent.v.velocity` is replaced with a new plain array and the handled time is
 *   remembered on the edict as `ent._lastTeleportTime`
 */
export function SV_SoftenTeleportLaunch( ent ) {

	const teleportTime = ent.v.teleport_time;
	if ( teleportTime === ent._lastTeleportTime ) return;
	ent._lastTeleportTime = teleportTime;

	const remaining = teleportTime - sv.time;
	if ( remaining <= 0 || remaining > TELEPORT_HOLD_MAX ) return;

	const velocity = ent.v.velocity;
	ent.v.velocity = [
		velocity[ 0 ] * TELEPORT_LAUNCH_SCALE,
		velocity[ 1 ] * TELEPORT_LAUNCH_SCALE,
		velocity[ 2 ] * TELEPORT_LAUNCH_SCALE
	];

}

/*
================
SV_Physics_Client
================
*/
/**
 * Player character actions (WinQuake sv_phys.c), once per server frame for each client slot: skips unconnected slots
 * and players held by the seamless-exit or respawn hooks, runs QuakeC PlayerPreThink (inside the quad-jump hooks),
 * softens teleport launches, bounds velocity, then moves by movetype (NONE thinks; WALK thinks, applies water and
 * gravity, unsticks and `SV_WalkMove`s inside the portal-motion hooks; TOSS/BOUNCE use `SV_Physics_Toss`; FLY flies;
 * NOCLIP moves freely), relinks the player touching triggers, and runs PlayerPostThink. Returns early if the think
 * removed the entity.
 *
 * @param {edict_t} ent the player edict
 * @param {number} num the edict number, 1..svs.maxclients (client slot `num - 1`)
 * @throws {Error} via `Sys_Error` when the movetype is none of those ("SV_Physics_client: bad movetype")
 */
export function SV_Physics_Client( ent, num ) {

	if ( ! svs.clients[ num - 1 ].active )
		return; // unconnected slot

	// arrived through a seamless exit and the client is still loading
	if ( SV_SeamlessHolding( num ) )
		return;

	if ( SV_RespawnFrame( ent ) ) return;

	//
	// call standard client pre-think
	//
	pr_global_struct.time = sv.time;
	pr_global_struct.self = EDICT_TO_PROG( ent );
	const quadJump=SV_QuadJumpBegin(ent);
	PR_ExecuteProgram( pr_global_struct.PlayerPreThink );
	SV_QuadJumpEnd(ent,quadJump);

	SV_SoftenTeleportLaunch( ent );

	//
	// do a move
	//
	SV_CheckVelocity( ent );

	//
	// decide which move function to call
	//
	let portalMotion = null;
	try {
		switch ( ent.v.movetype | 0 ) {

			case MOVETYPE_NONE:
				if ( ! SV_RunThink( ent ) )
					return;
				break;

			case MOVETYPE_WALK:
				if ( ! SV_RunThink( ent ) )
					return;
				if ( ! SV_CheckWater( ent ) && ! ( ( ent.v.flags | 0 ) & FL_WATERJUMP ) )
					SV_AddGravity( ent );
				SV_CheckStuck( ent );
				portalMotion = SV_PortalMoveStart( ent, sv.time );
				SV_WalkMove( ent );
				break;

			case MOVETYPE_TOSS:
			case MOVETYPE_BOUNCE:
				SV_Physics_Toss( ent );
				break;

			case MOVETYPE_FLY:
				if ( ! SV_RunThink( ent ) )
					return;
				SV_FlyMove( ent, host_frametime, null );
				break;

			case MOVETYPE_NOCLIP:
				if ( ! SV_RunThink( ent ) )
					return;
				VectorMA( ent.v.origin, host_frametime, ent.v.velocity, ent.v.origin );
				break;

			default:
				Sys_Error( 'SV_Physics_client: bad movetype ' + ( ent.v.movetype | 0 ) );

		}

		//
		// call standard player post-think
		//
		SV_LinkEdict( ent, true );

		pr_global_struct.time = sv.time;
		pr_global_struct.self = EDICT_TO_PROG( ent );
		PR_ExecuteProgram( pr_global_struct.PlayerPostThink );
	} finally {

		if ( portalMotion ) SV_PortalMoveEnd( ent, portalMotion );

	}

}

//============================================================================

/*
=============
SV_Physics_None
=============
*/
/**
 * Non moving objects can only think (WinQuake sv_phys.c): runs `SV_RunThink` for a MOVETYPE_NONE entity.
 *
 * @param {edict_t} ent the entity
 */
export function SV_Physics_None( ent ) {

	// regular thinking
	SV_RunThink( ent );

}

/*
=============
SV_Physics_Follow
=============
*/
/**
 * Entities that are "stuck" to another entity (QUAKE2 feature of WinQuake sv_phys.c): after thinking, a
 * MOVETYPE_FOLLOW entity is placed at its `aiment`'s origin plus its own `v_angle` (used as an offset, Quake units) and
 * relinked touching triggers.
 *
 * @param {edict_t} ent the following entity
 */
export function SV_Physics_Follow( ent ) {

	// regular thinking
	SV_RunThink( ent );

	// Follow the aiment: origin = aiment.origin + v_angle (v_angle used as offset)
	const aiment = PROG_TO_EDICT( ent.v.aiment );
	if ( aiment != null ) {

		VectorAdd( aiment.v.origin, ent.v.v_angle, ent.v.origin );

	}

	SV_LinkEdict( ent, true );

}

/*
=============
SV_Physics_Noclip
=============
*/
/**
 * A moving object that doesn't obey physics (WinQuake sv_phys.c): after thinking, a MOVETYPE_NOCLIP entity's angles
 * and origin advance by `avelocity` and `velocity` times `host_frametime` with no clipping, and it is relinked without
 * touching triggers.
 *
 * @param {edict_t} ent the entity
 */
export function SV_Physics_Noclip( ent ) {

	// regular thinking
	if ( ! SV_RunThink( ent ) )
		return;

	VectorMA( ent.v.angles, host_frametime, ent.v.avelocity, ent.v.angles );
	VectorMA( ent.v.origin, host_frametime, ent.v.velocity, ent.v.origin );

	SV_LinkEdict( ent, false );

}

/*
==============================================================================

TOSS / BOUNCE

==============================================================================
*/

/*
=============
SV_CheckWaterTransition
=============
*/
/**
 * Updates a tossed or stepping entity's water state from the contents at its origin and plays misc/h2ohit1.wav
 * (channel 0, full volume, attenuation 1) when it crosses into or out of liquid (WinQuake sv_phys.c). A `watertype`
 * of 0 means just spawned here (not yet initialized): it is set without a sound. When out of liquid the WinQuake
 * code's assignment `waterlevel = cont` is kept, so `waterlevel` then holds the (negative) contents value.
 *
 * @param {edict_t} ent the entity; mutates `ent.v.watertype` and `ent.v.waterlevel`
 */
export function SV_CheckWaterTransition( ent ) {

	const cont = SV_PointContents( ent.v.origin );

	if ( ent.v.watertype === 0 ) {

		// just spawned here (watertype not yet initialized)
		ent.v.watertype = cont;
		ent.v.waterlevel = 1;
		return;

	}

	if ( cont <= CONTENTS_WATER ) {

		if ( ent.v.watertype === CONTENTS_EMPTY ) {

			// just crossed into water
			SV_StartSound( ent, 0, 'misc/h2ohit1.wav', 255, 1 );

		}

		ent.v.watertype = cont;
		ent.v.waterlevel = 1;

	} else {

		if ( ent.v.watertype !== CONTENTS_EMPTY ) {

			// just crossed into water
			SV_StartSound( ent, 0, 'misc/h2ohit1.wav', 255, 1 );

		}

		ent.v.watertype = CONTENTS_EMPTY;
		ent.v.waterlevel = cont;

	}

}

/*
=============
SV_Physics_Toss
=============
*/
/**
 * Toss, bounce, and fly movement (WinQuake sv_phys.c). When onground, do nothing. Otherwise, after thinking, it bounds
 * velocity, adds gravity (not for FLY or FLYMISSILE), turns by `avelocity`, moves with `SV_PushEntity`, clips the
 * velocity off what it hit (bouncing with 1.5 for MOVETYPE_BOUNCE), and comes to rest with FL_ONGROUND on a floor
 * (normal z > 0.7) unless it is a bounce still rising at 60 units per second or more. Ends with
 * `SV_CheckWaterTransition`. Used for TOSS, BOUNCE, BOUNCEMISSILE, FLY and FLYMISSILE entities and for players with
 * TOSS or BOUNCE.
 *
 * @param {edict_t} ent the entity
 */
export function SV_Physics_Toss( ent ) {

	const move = _toss_move;

	// regular thinking
	if ( ! SV_RunThink( ent ) )
		return;

	// if onground, return without moving
	if ( ( ( ent.v.flags | 0 ) & FL_ONGROUND ) )
		return;

	SV_CheckVelocity( ent );

	// add gravity
	if ( ent.v.movetype !== MOVETYPE_FLY
		&& ent.v.movetype !== MOVETYPE_FLYMISSILE )
		SV_AddGravity( ent );

	// move angles
	VectorMA( ent.v.angles, host_frametime, ent.v.avelocity, ent.v.angles );

	// move origin
	VectorScale( ent.v.velocity, host_frametime, move );
	const trace = SV_PushEntity( ent, move );
	if ( trace.fraction === 1 )
		return;
	if ( ent.free )
		return;

	let backoff;
	if ( ent.v.movetype === MOVETYPE_BOUNCE )
		backoff = 1.5;
	else
		backoff = 1;

	ClipVelocity( ent.v.velocity, trace.plane.normal, ent.v.velocity, backoff );

	// stop if on ground
	if ( trace.plane.normal[ 2 ] > 0.7 ) {

		if ( ent.v.velocity[ 2 ] < 60 || ent.v.movetype !== MOVETYPE_BOUNCE ) {

			ent.v.flags = ( ent.v.flags | 0 ) | FL_ONGROUND;
			ent.v.groundentity = EDICT_TO_PROG( trace.ent );
			VectorCopy( vec3_origin, ent.v.velocity );
			VectorCopy( vec3_origin, ent.v.avelocity );

		}

	}

	// check for in water
	SV_CheckWaterTransition( ent );

}

/*
===============================================================================

STEPPING MOVEMENT

===============================================================================
*/

/*
=============
SV_Physics_Step
=============
*/
/**
 * Monsters freefall when they don't have a ground entity, otherwise all movement is done with discrete steps (by
 * QuakeC walkmove/movetogoal, not here) (WinQuake sv_phys.c). This is also used for objects that have become still on
 * the ground, but will fall if the floor is pulled out from under them. Without FL_ONGROUND, FL_FLY or FL_SWIM it
 * applies gravity and a `SV_FlyMove`, playing demon/dland2.wav on landing if it was falling faster than a tenth of
 * `sv_gravity`; then it thinks and checks water.
 *
 * @param {edict_t} ent a MOVETYPE_STEP entity
 */
export function SV_Physics_Step( ent ) {

	let hitsound;

	// freefall if not onground
	if ( ! ( ( ent.v.flags | 0 ) & ( FL_ONGROUND | FL_FLY | FL_SWIM ) ) ) {

		if ( ent.v.velocity[ 2 ] < sv_gravity.value * - 0.1 )
			hitsound = true;
		else
			hitsound = false;

		SV_AddGravity( ent );
		SV_CheckVelocity( ent );
		SV_FlyMove( ent, host_frametime, null );
		SV_LinkEdict( ent, true );

		if ( ( ent.v.flags | 0 ) & FL_ONGROUND ) {

			// just hit ground
			if ( hitsound )
				SV_StartSound( ent, 0, 'demon/dland2.wav', 255, 1 );

		}

	}

	// regular thinking
	SV_RunThink( ent );

	SV_CheckWaterTransition( ent );

}

//============================================================================

/*
================
SV_Physics
================
*/
/**
 * Runs one server frame of physics (WinQuake sv_phys.c): runs QuakeC StartFrame and the delayed shotgun pellets, then
 * for every in-use edict relinks it while `force_retouch` is set, skips it while the rend-veil hook holds it, and runs
 * the physics for its slot or movetype (clients, push, none, follow, noclip, step, toss/bounce/fly/missile). It then
 * counts down `force_retouch` and advances `sv.time` by `host_frametime`. Called by host.js's `Host_ServerFrame` each
 * server frame and twice by sv_main.js's `SV_SpawnServer` to let a new map settle. Needs `SV_SetState`,
 * `SV_SetCallbacks` and `SV_SetFrametime` first.
 *
 * @throws {Error} via `Sys_Error` for an entity with an unknown movetype ("SV_Physics: bad movetype"), or from
 *   `SV_Physics_Client`/`SV_FlyMove`
 */
export function SV_Physics() {

	// let the progs know that a new frame has started
	pr_global_struct.self = EDICT_TO_PROG( sv.edicts[ 0 ] );
	pr_global_struct.other = EDICT_TO_PROG( sv.edicts[ 0 ] );
	pr_global_struct.time = sv.time;
	PR_ExecuteProgram( pr_global_struct.StartFrame );
	SV_ShotDelayRun(); // shotgun pellets whose flight is over deal their damage now (sv_shotdelay.js)

	//
	// treat each object in turn
	//
	let ent = sv.edicts[ 0 ];
	for ( let i = 0; i < sv.num_edicts; i ++, ent = NEXT_EDICT( ent ) ) {

		if ( ent.free )
			continue;

		if ( pr_global_struct.force_retouch ) {

			SV_LinkEdict( ent, true ); // force retouch even for stationary

		}

		// Native retouch/telefrags above remain active. Only this monster's
		// thinker and movement wait; overdue nextthink runs normally at Focus.
		if ( SV_RendVeilHolding( ent ) ) continue;

		if ( i > 0 && i <= svs.maxclients )
			SV_Physics_Client( ent, i );
		else if ( ent.v.movetype === MOVETYPE_PUSH )
			SV_Physics_Pusher( ent );
		else if ( ent.v.movetype === MOVETYPE_NONE )
			SV_Physics_None( ent );
		else if ( ent.v.movetype === MOVETYPE_FOLLOW )
			SV_Physics_Follow( ent );
		else if ( ent.v.movetype === MOVETYPE_NOCLIP )
			SV_Physics_Noclip( ent );
		else if ( ent.v.movetype === MOVETYPE_STEP )
			SV_Physics_Step( ent );
		else if ( ent.v.movetype === MOVETYPE_TOSS
			|| ent.v.movetype === MOVETYPE_BOUNCE
			|| ent.v.movetype === MOVETYPE_BOUNCEMISSILE
			|| ent.v.movetype === MOVETYPE_FLY
			|| ent.v.movetype === MOVETYPE_FLYMISSILE )
			SV_Physics_Toss( ent );
		else
			Sys_Error( 'SV_Physics: bad movetype ' + ( ent.v.movetype | 0 ) );

	}

	if ( pr_global_struct.force_retouch )
		pr_global_struct.force_retouch --;

	sv.time += host_frametime;

}
