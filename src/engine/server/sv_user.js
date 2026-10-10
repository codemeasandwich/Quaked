/**
 * @module engine/server/sv_user
 *
 * Server-side handling of players (WinQuake sv_user.c): reading their moves and commands, view angles, water
 * movement.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `host_client`, `V_CalcRoll`, `SV_DropClient`, `NET_GetMessage`, `Cbuf_InsertText`,
 * `Cmd_ExecuteString`, `src_client`; module-level variables `wishdir`, `wishspeed`, `angles`, `origin`, `velocity`,
 * `onground`, `cmd`, `_get_key_dest`, `_set_host_client`, `_msgLoopCount`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Its mutable exports are dependencies injected by `SV_User_SetCallbacks`; a client message it cannot read drops that
 * client (`SV_DropClient`).
 */
import {R_WelcomeLoadingHolding} from '../common/hooks.js'; // installed by newer/ui/r_demoloading.js
import {SV_QuadMovementScale} from '../common/hooks.js'; // installed by newer/gameplay/sv_quadmovement.js
// Ported from: WinQuake/sv_user.c -- server code for moving users

import { Sys_Printf } from '../common/sys.js';
import { Con_Printf, Con_DPrintf, MSG_ReadFloat, MSG_ReadAngle, MSG_ReadShort,
	MSG_ReadByte, MSG_ReadChar, MSG_ReadString, MSG_BeginReading,
	msg_badread, net_message } from '../common/common.js';
import { vec3_origin, DotProduct, VectorCopy, VectorAdd, VectorSubtract,
	VectorMA, VectorScale, VectorNormalize, Length, AngleVectors, M_PI } from '../common/mathlib.js';
import { ON_EPSILON, PITCH, YAW, ROLL } from '../common/quakedef.js';
import { MOVETYPE_NONE, MOVETYPE_WALK, MOVETYPE_NOCLIP, FL_ONGROUND,
	FL_WATERJUMP, sv, svs, sv_player, pr_global_struct, host_frametime,
	sv_friction, sv_edgefriction, sv_stopspeed, sv_maxspeed, sv_accelerate,
	sv_idealpitchscale, SV_SetPlayer,
	SV_Move, SV_LinkEdict, PR_ExecuteProgram, EDICT_TO_PROG } from './sv_phys.js';

const MAX_FORWARD = 6;
const NUM_PING_TIMES = 16;

// module-level state (matching C static/global variables)
const forward = new Float32Array( 3 );
const right = new Float32Array( 3 );
const up = new Float32Array( 3 );

let wishdir = new Float32Array( 3 );
let wishspeed = 0;

// Cached buffers to avoid per-frame allocations (Golden Rule #4)
const _airaccel_wishvel = new Float32Array( 3 );
const _idealpitch_z = new Float32Array( MAX_FORWARD );
const _idealpitch_top = new Float32Array( 3 );
const _idealpitch_bottom = new Float32Array( 3 );
const _watermove_wishvel = new Float32Array( 3 );
const _airmove_wishvel = new Float32Array( 3 );
const _clientthink_v_angle = new Float32Array( 3 );
const _readclientmove_angle = new Float32Array( 3 );
const _userfriction_start = new Float32Array( 3 );
const _userfriction_stop = new Float32Array( 3 );

// world
let angles = null; // float *
let origin = null; // float *
let velocity = null; // float *

let onground = false;

let cmd = { forwardmove: 0, sidemove: 0, upmove: 0 };

// External references (set by engine)
export let host_client = null;
export const key_game = 0;
let _get_key_dest = null; // getter injected via callbacks to avoid circular deps

// Stubs for external functions
export let V_CalcRoll = null;
export let SV_DropClient = null;
export let NET_GetMessage = null;
export let Cbuf_InsertText = null;
let _set_host_client = null;
export let Cmd_ExecuteString = null;
export let src_client = 0;

// clc_ constants (from protocol.h)
export const clc_bad = 0;
export const clc_nop = 1;
export const clc_disconnect = 2;
export const clc_move = 3;
export const clc_stringcmd = 4;
export const clc_delta = 5; // [byte] sequence number, requests delta compression

/**
 * Injects the engine functions this module needs (callback injection, to avoid circular imports). Called once from
 * sv_main.js at server init; the values are kept for the session in this module's exported stubs. Members that are
 * missing (or, except `host_client`, falsy) leave the current value unchanged.
 *
 * @param {{ V_CalcRoll?: function(ArrayLike<number>, ArrayLike<number>): number, SV_DropClient?: function(boolean): void,
 *   NET_GetMessage?: function(?qsocket_t): number, Cbuf_InsertText?: function(string): void,
 *   Cmd_ExecuteString?: function(string, number): void, host_client?: ?client_t,
 *   set_host_client?: function(client_t): void, get_key_dest?: function(): number }} callbacks `V_CalcRoll` gives
 *   the view roll in degrees for angles and velocity; `SV_DropClient` drops `host_client`; `NET_GetMessage` reads
 *   the next message of a connection into `net_message`; `Cbuf_InsertText` and `Cmd_ExecuteString` run client
 *   commands; `host_client` sets the current client; `set_host_client` publishes the client `SV_RunClients` is
 *   working on to the rest of the server; `get_key_dest` returns the current key destination (for the single-player
 *   pause)
 */
export function SV_User_SetCallbacks( callbacks ) {

	if ( callbacks.V_CalcRoll ) V_CalcRoll = callbacks.V_CalcRoll;
	if ( callbacks.SV_DropClient ) SV_DropClient = callbacks.SV_DropClient;
	if ( callbacks.NET_GetMessage ) NET_GetMessage = callbacks.NET_GetMessage;
	if ( callbacks.Cbuf_InsertText ) Cbuf_InsertText = callbacks.Cbuf_InsertText;
	if ( callbacks.Cmd_ExecuteString ) Cmd_ExecuteString = callbacks.Cmd_ExecuteString;
	if ( callbacks.host_client !== undefined ) host_client = callbacks.host_client;
	if ( callbacks.set_host_client ) _set_host_client = callbacks.set_host_client;
	if ( callbacks.get_key_dest ) _get_key_dest = callbacks.get_key_dest;

}

function SV_EnsureClientCmd( client ) {

	if ( client.cmd == null ) {

		client.cmd = { forwardmove: 0, sidemove: 0, upmove: 0 };

	}

	return client.cmd;

}

function Q_strncasecmp( s1, s2, n ) {

	return s1.substring( 0, n ).toLowerCase() === s2.substring( 0, n ).toLowerCase();

}

/*
===============
SV_SetIdealPitch
===============
*/
/**
 * Sets the player's `idealpitch` from the slope of the ground ahead, so the view tilts up stairs and slopes
 * (lookspring). Called by `SV_WriteClientdataToMessage` (sv_main.js) for `sv_player` each time its client data is
 * sent. Only on the ground: it traces 160 units down at six points 36 to 96 units ahead along the yaw, ignoring
 * monsters, and leaves `idealpitch` unchanged when looking at a wall, near a dropoff, or when the steps are mixed or
 * fewer than two; flat ground sets 0. Otherwise `idealpitch` = -step * `sv_idealpitchscale` (degrees).
 */
export function SV_SetIdealPitch() {

	// Use cached buffers instead of allocating per-call
	const z = _idealpitch_z;
	const top = _idealpitch_top;
	const bottom = _idealpitch_bottom;

	if ( ! ( ( sv_player.v.flags | 0 ) & FL_ONGROUND ) )
		return;

	const angleval = sv_player.v.angles[ YAW ] * M_PI * 2 / 360;
	const sinval = Math.sin( angleval );
	const cosval = Math.cos( angleval );

	for ( let i = 0; i < MAX_FORWARD; i ++ ) {

		top[ 0 ] = sv_player.v.origin[ 0 ] + cosval * ( i + 3 ) * 12;
		top[ 1 ] = sv_player.v.origin[ 1 ] + sinval * ( i + 3 ) * 12;
		top[ 2 ] = sv_player.v.origin[ 2 ] + sv_player.v.view_ofs[ 2 ];

		bottom[ 0 ] = top[ 0 ];
		bottom[ 1 ] = top[ 1 ];
		bottom[ 2 ] = top[ 2 ] - 160;

		const tr = SV_Move( top, vec3_origin, vec3_origin, bottom, 1, sv_player );
		if ( tr.allsolid )
			return; // looking at a wall, leave ideal the way is was

		if ( tr.fraction === 1 )
			return; // near a dropoff

		z[ i ] = top[ 2 ] + tr.fraction * ( bottom[ 2 ] - top[ 2 ] );

	}

	let dir = 0;
	let steps = 0;
	for ( let j = 1; j < MAX_FORWARD; j ++ ) {

		const step = z[ j ] - z[ j - 1 ];
		if ( step > - ON_EPSILON && step < ON_EPSILON )
			continue;

		if ( dir && ( step - dir > ON_EPSILON || step - dir < - ON_EPSILON ) )
			return; // mixed changes

		steps ++;
		dir = step;

	}

	if ( dir === 0 ) {

		sv_player.v.idealpitch = 0;
		return;

	}

	if ( steps < 2 )
		return;
	sv_player.v.idealpitch = - dir * sv_idealpitchscale.value;

}

/*
==================
SV_UserFriction
==================
*/
/**
 * Applies ground friction to the current player's velocity for one frame. Uses the module's `origin`/`velocity`,
 * set by `SV_ClientThink` to `sv_player`'s; called by `SV_AirMove` while the player is on the ground. If the leading
 * edge is over a dropoff (nothing within 34 units below a point 16 units ahead), friction is multiplied by
 * `sv_edgefriction`. Speed drops by `host_frametime * max(speed, sv_stopspeed) * friction`, clamped at 0, and all
 * three velocity components are scaled. Mutates `sv_player.v.velocity`.
 */
export function SV_UserFriction() {

	const vel = velocity;
	const start = _userfriction_start;
	const stop = _userfriction_stop;

	const speed = Math.sqrt( vel[ 0 ] * vel[ 0 ] + vel[ 1 ] * vel[ 1 ] );
	if ( speed === 0 )
		return;

	// if the leading edge is over a dropoff, increase friction
	start[ 0 ] = stop[ 0 ] = origin[ 0 ] + vel[ 0 ] / speed * 16;
	start[ 1 ] = stop[ 1 ] = origin[ 1 ] + vel[ 1 ] / speed * 16;
	start[ 2 ] = origin[ 2 ] + sv_player.v.mins[ 2 ];
	stop[ 2 ] = start[ 2 ] - 34;

	const trace = SV_Move( start, vec3_origin, vec3_origin, stop, true, sv_player );

	let friction;
	if ( trace.fraction === 1.0 )
		friction = sv_friction.value * sv_edgefriction.value;
	else
		friction = sv_friction.value;

	// apply friction
	const control = speed < sv_stopspeed.value ? sv_stopspeed.value : speed;
	let newspeed = speed - host_frametime * control * friction;

	if ( newspeed < 0 )
		newspeed = 0;
	newspeed /= speed;

	vel[ 0 ] = vel[ 0 ] * newspeed;
	vel[ 1 ] = vel[ 1 ] * newspeed;
	vel[ 2 ] = vel[ 2 ] * newspeed;

}

/*
==============
SV_Accelerate
==============
*/
/**
 * Accelerates the current player along the wish direction on the ground for one frame. Uses the module's
 * `wishdir`/`wishspeed` (set by `SV_AirMove`) and `velocity` (set by `SV_ClientThink`); called by `SV_AirMove` after
 * friction. Adds up to `sv_accelerate * host_frametime * wishspeed` units/s, never taking the speed along `wishdir`
 * past `wishspeed`. Mutates `sv_player.v.velocity`.
 */
export function SV_Accelerate() {

	const currentspeed = DotProduct( velocity, wishdir );
	const addspeed = wishspeed - currentspeed;
	if ( addspeed <= 0 )
		return;
	let accelspeed = sv_accelerate.value * host_frametime * wishspeed;
	if ( accelspeed > addspeed )
		accelspeed = addspeed;

	for ( let i = 0; i < 3; i ++ )
		velocity[ i ] += accelspeed * wishdir[ i ];

}

/*
==============
SV_AirAccelerate
==============
*/
/**
 * Accelerates the current player in the air for one frame (not on ground, so little effect on velocity). Called by
 * `SV_AirMove`. The wished speed is capped at 30 units/s along the wished direction, but the acceleration step uses
 * the module-level `wishspeed`, not the capped value (the C code intentionally does this), which is what allows air
 * strafing. Mutates `sv_player.v.velocity` (through the module's `velocity`).
 *
 * @param {ArrayLike<number>} wishveloc wished velocity (units/s, world space); copied, not modified
 */
export function SV_AirAccelerate( wishveloc ) {

	// Use cached buffer instead of allocating per-call
	_airaccel_wishvel[ 0 ] = wishveloc[ 0 ];
	_airaccel_wishvel[ 1 ] = wishveloc[ 1 ];
	_airaccel_wishvel[ 2 ] = wishveloc[ 2 ];

	let wishspd = VectorNormalize( _airaccel_wishvel );
	if ( wishspd > 30 )
		wishspd = 30;
	const currentspeed = DotProduct( velocity, _airaccel_wishvel );
	const addspeed = wishspd - currentspeed;
	if ( addspeed <= 0 )
		return;
	// C code intentionally uses module-level wishspeed (not local wishspd)
	let accelspeed = sv_accelerate.value * wishspeed * host_frametime;
	if ( accelspeed > addspeed )
		accelspeed = addspeed;

	for ( let i = 0; i < 3; i ++ )
		velocity[ i ] += accelspeed * _airaccel_wishvel[ i ];

}

/*
==============
DropPunchAngle
==============
*/
function DropPunchAngle() {

	let len = VectorNormalize( sv_player.v.punchangle );

	len -= 10 * host_frametime;
	if ( len < 0 )
		len = 0;
	VectorScale( sv_player.v.punchangle, len, sv_player.v.punchangle );

}

/*
===================
SV_WaterMove
===================
*/
/**
 * Moves the current player through water for one frame (water level 2 or more, not noclip). Called by
 * `SV_ClientThink`. Builds the wished velocity from the client's move command along the view angles (`v_angle`),
 * drifting down at 60 units/s when there is no input, caps it at `sv_maxspeed` (both scaled by the Newer Game
 * `SV_QuadMovementScale` hook), and moves at 70% of that; then applies water friction (`sv_friction`) and
 * `sv_accelerate`. Mutates `sv_player.v.velocity` (through the module's `velocity`).
 */
export function SV_WaterMove() {
	const quadScale=SV_QuadMovementScale(sv_player), maxspeed=sv_maxspeed.value*quadScale;

	// Use cached buffer instead of allocating per-call
	const wishvel = _watermove_wishvel;

	//
	// user intentions
	//
	AngleVectors( sv_player.v.v_angle, forward, right, up );

	for ( let i = 0; i < 3; i ++ )
		wishvel[ i ] = (forward[ i ] * cmd.forwardmove + right[ i ] * cmd.sidemove)*quadScale;

	if ( cmd.forwardmove === 0 && cmd.sidemove === 0 && cmd.upmove === 0 )
		wishvel[ 2 ] -= 60; // drift towards bottom
	else
		wishvel[ 2 ] += cmd.upmove*quadScale;

	let _wishspeed = Length( wishvel );
	if ( _wishspeed > maxspeed ) {

		VectorScale( wishvel, maxspeed / _wishspeed, wishvel );
		_wishspeed = maxspeed;

	}

	_wishspeed *= 0.7;

	//
	// water friction
	//
	let speed = Length( velocity );
	let newspeed;
	if ( speed ) {

		newspeed = speed - host_frametime * speed * sv_friction.value;
		if ( newspeed < 0 )
			newspeed = 0;
		VectorScale( velocity, newspeed / speed, velocity );

	} else {

		newspeed = 0;

	}

	//
	// water acceleration
	//
	if ( _wishspeed === 0 )
		return;

	const addspeed = _wishspeed - newspeed;
	if ( addspeed <= 0 )
		return;

	VectorNormalize( wishvel );
	let accelspeed = sv_accelerate.value * _wishspeed * host_frametime;
	if ( accelspeed > addspeed )
		accelspeed = addspeed;

	for ( let i = 0; i < 3; i ++ )
		velocity[ i ] += accelspeed * wishvel[ i ];

}

/*
==============
SV_WaterJump
==============
*/
function SV_WaterJump() {

	if ( sv.time > sv_player.v.teleport_time
		|| sv_player.v.waterlevel === 0 ) {

		sv_player.v.flags = ( sv_player.v.flags | 0 ) & ~FL_WATERJUMP;
		sv_player.v.teleport_time = 0;

	}

	sv_player.v.velocity[ 0 ] = sv_player.v.movedir[ 0 ];
	sv_player.v.velocity[ 1 ] = sv_player.v.movedir[ 1 ];

}

/*
===================
SV_AirMove
===================
*/
/**
 * Moves the current player on the ground or in the air for one frame. Called by `SV_ClientThink` when not in water.
 * Builds the wished velocity from the client's move command along the body angles (forward and side scaled by the
 * Newer Game `SV_QuadMovementScale` hook, vertical only when not MOVETYPE_WALK), ignores backward moves just after a
 * teleport (hack to not let you back into teleporter), caps it at `sv_maxspeed` (scaled by the same hook), and sets
 * the module's `wishdir`/`wishspeed`. Noclip takes the wished velocity directly; on the ground it applies
 * `SV_UserFriction` and `SV_Accelerate`; otherwise `SV_AirAccelerate`. Mutates `sv_player.v.velocity`.
 */
export function SV_AirMove() {
	const quadScale=SV_QuadMovementScale(sv_player), maxspeed=sv_maxspeed.value*quadScale;

	// Use cached buffer instead of allocating per-call
	const wishvel = _airmove_wishvel;

	AngleVectors( sv_player.v.angles, forward, right, up );

	let fmove = cmd.forwardmove;
	const smove = cmd.sidemove;

	// hack to not let you back into teleporter
	if ( sv.time < sv_player.v.teleport_time && fmove < 0 )
		fmove = 0;

	for ( let i = 0; i < 3; i ++ )
		wishvel[ i ] = (forward[ i ] * fmove + right[ i ] * smove)*quadScale;

	if ( ( sv_player.v.movetype | 0 ) !== MOVETYPE_WALK )
		wishvel[ 2 ] = cmd.upmove;
	else
		wishvel[ 2 ] = 0;

	VectorCopy( wishvel, wishdir );
	wishspeed = VectorNormalize( wishdir );
	if ( wishspeed > maxspeed ) {

		VectorScale( wishvel, maxspeed / wishspeed, wishvel );
		wishspeed = maxspeed;

	}

	if ( sv_player.v.movetype === MOVETYPE_NOCLIP ) {

		// noclip
		VectorCopy( wishvel, velocity );

	} else if ( onground ) {

		SV_UserFriction();
		SV_Accelerate();

	} else {

		// not on ground, so little effect on velocity
		SV_AirAccelerate( wishvel );

	}

}

/*
===================
SV_ClientThink
===================
*/
/**
 * Applies the current client's last move command to its player entity for this frame: the move fields specify an
 * intended velocity in pix/sec (Quake units per second); the angle fields specify an exact angular motion in
 * degrees. Called by `SV_RunClients` for each spawned client when the game is not paused; `host_client` and
 * `sv_player` must already be set to that client.
 *
 * Does nothing for MOVETYPE_NONE. Decays `punchangle`; a dead player gets nothing more. Otherwise it sets the body
 * angles (shows 1/3 the pitch angle and all the roll angle, from `V_CalcRoll` times 4; pitch and yaw only when
 * `fixangle` is 0), then runs the water jump, `SV_WaterMove` or `SV_AirMove`. Points the module's `origin`,
 * `velocity`, `angles` and `cmd` at this player's data for the helpers it calls.
 */
export function SV_ClientThink() {

	// Use cached buffer instead of allocating per-call
	const v_angle = _clientthink_v_angle;

	if ( sv_player.v.movetype === MOVETYPE_NONE )
		return;

	onground = ( sv_player.v.flags | 0 ) & FL_ONGROUND;

	origin = sv_player.v.origin;
	velocity = sv_player.v.velocity;

	DropPunchAngle();

	//
	// if dead, behave differently
	//
	if ( sv_player.v.health <= 0 )
		return;

	//
	// angles
	// show 1/3 the pitch angle and all the roll angle
	cmd = host_client.cmd;
	angles = sv_player.v.angles;

	VectorAdd( sv_player.v.v_angle, sv_player.v.punchangle, v_angle );
	angles[ ROLL ] = V_CalcRoll( sv_player.v.angles, sv_player.v.velocity ) * 4;
	if ( sv_player.v.fixangle === 0 ) {

		angles[ PITCH ] = - v_angle[ PITCH ] / 3;
		angles[ YAW ] = v_angle[ YAW ];

	}

	if ( ( sv_player.v.flags | 0 ) & FL_WATERJUMP ) {

		SV_WaterJump();
		return;

	}

	//
	// walk
	//
	if ( ( sv_player.v.waterlevel >= 2 )
		&& ( sv_player.v.movetype !== MOVETYPE_NOCLIP ) ) {

		SV_WaterMove();
		return;

	}

	SV_AirMove();

}

/*
===================
SV_ReadClientMove
===================
*/
/**
 * Reads the body of a `clc_move` message from `net_message` for `host_client`: the client's time stamp (stored as a
 * ping time, `sv.time` minus it, in the 16-entry `ping_times` ring), view angles (to the edict's `v_angle`, degrees),
 * forward/side/up moves (units/s), the button bits (`button0` attack, `button2` jump) and the impulse (only a
 * nonzero impulse is stored). Also copies the angles and moves into `host_client.lastcmd` (created on first use) for
 * `SV_WritePlayersToClient`. Called by `SV_ReadClientMessage`.
 *
 * @param {{ forwardmove: number, sidemove: number, upmove: number }} move written: the client's move command
 *   (`host_client.cmd`), kept until the next `clc_move`
 */
export function SV_ReadClientMove( move ) {

	// Use cached buffer instead of allocating per-call
	const angle = _readclientmove_angle;

	// read ping time
	host_client.ping_times[ host_client.num_pings % NUM_PING_TIMES ]
		= sv.time - MSG_ReadFloat();
	host_client.num_pings ++;

	// read current angles
	for ( let i = 0; i < 3; i ++ )
		angle[ i ] = MSG_ReadAngle();

	VectorCopy( angle, host_client.edict.v.v_angle );

	// read movement
	move.forwardmove = MSG_ReadShort();
	move.sidemove = MSG_ReadShort();
	move.upmove = MSG_ReadShort();

	// read buttons
	const bits = MSG_ReadByte();
	host_client.edict.v.button0 = bits & 1;
	host_client.edict.v.button2 = ( bits & 2 ) >> 1;

	const impulse = MSG_ReadByte();
	if ( impulse )
		host_client.edict.v.impulse = impulse;

	// Save the command for SV_WritePlayersToClient (player angle broadcasting)
	if ( host_client.lastcmd == null ) {

		host_client.lastcmd = {
			angles: new Float32Array( 3 ),
			forwardmove: 0,
			sidemove: 0,
			upmove: 0,
			buttons: 0,
			impulse: 0
		};

	}

	VectorCopy( angle, host_client.lastcmd.angles );
	host_client.lastcmd.forwardmove = move.forwardmove;
	host_client.lastcmd.sidemove = move.sidemove;
	host_client.lastcmd.upmove = move.upmove;

}

/*
===================
SV_ReadClientMessage
===================
*/

// Maximum messages to process per client per frame.
// Prevents infinite loops from async message queuing (WebTransport) and
// protects against malicious clients spamming messages to freeze the server.
const MAX_MESSAGES_PER_CLIENT = 10;

let _msgLoopCount = 0;
const MAX_MSG_LOOP_WARN = 100;

/**
 * Reads and acts on the messages `host_client` has sent since the last frame. Called by `SV_RunClients` once per
 * server frame for each active client. Handles `clc_nop`, `clc_delta` (sets `delta_sequence`, otherwise reset to -1
 * for each message), `clc_move` (`SV_ReadClientMove`), `clc_disconnect` and `clc_stringcmd`. A string command is
 * run with `Cmd_ExecuteString` as `src_client` when it starts with one of the commands clients may use (status, god,
 * notarget, fly, name, noclip, say, say_team, tell, color, kill, pause, spawn, begin, prespawn, kick, ping, give,
 * ban); otherwise a privileged client's text is inserted into the command buffer, and anyone else's is only logged
 * as a developer message. Sets `host_client.localtime` to `sv.time` for each message (so PF_MSEC reflects how old the
 * move is).
 *
 * It keeps reading while the last message was reliable (as in WinQuake), but processes at most 10 messages per
 * client per frame, which prevents infinite loops from async message queuing (WebTransport) and protects against
 * malicious clients spamming messages to freeze the server; a runaway guard gives up after 100 loop passes.
 *
 * @returns {boolean} false if the client should be killed (connection failed, bad or unknown message, disconnect,
 *   runaway loop, or a command left the client inactive); true otherwise, including when the 10-message limit is
 *   reached
 */
export function SV_ReadClientMessage() {

	let ret;
	let messagesProcessed = 0;
	_msgLoopCount = 0;

	do {

		_msgLoopCount++;
		if ( _msgLoopCount > MAX_MSG_LOOP_WARN ) {
			Sys_Printf( 'SV_ReadClientMessage: RUNAWAY loop count %d (msgProcessed=%d, ret=%d)\n', _msgLoopCount, messagesProcessed, ret );
			return false; // Force abort
		}

		// Hard limit to prevent infinite loops and spam attacks
		if ( messagesProcessed >= MAX_MESSAGES_PER_CLIENT ) {

			return true;

		}

		ret = NET_GetMessage( host_client.netconnection );

		if ( ret === - 1 ) {

			Sys_Printf( 'SV_ReadClientMessage: NET_GetMessage failed\n' );
			return false;

		}

		if ( ret === 0 )
			return true;

		messagesProcessed++;

		MSG_BeginReading();

		// Mark message time so PF_MSEC reflects how old this client's move is.
		host_client.localtime = sv.time;

		// Reset delta_sequence — no delta unless client requests it
		host_client.delta_sequence = - 1;

		let continueOuter = false;
		while ( true ) {

			if ( ! host_client.active )
				return false; // a command caused an error

			if ( msg_badread ) {

				Sys_Printf( 'SV_ReadClientMessage: badread\n' );
				return false;

			}

			const cmdByte = MSG_ReadChar();

			switch ( cmdByte ) {

				case - 1:
					continueOuter = true;
					break; // end of message (goto nextmsg)

				default:
					Sys_Printf( 'SV_ReadClientMessage: unknown command char %d\n', cmdByte );
					return false;

				case clc_nop:
					break;

				case clc_delta:
					host_client.delta_sequence = MSG_ReadByte();
					break;

				case clc_stringcmd: {

					const s = MSG_ReadString();
					let allowed;
					if ( host_client.privileged )
						allowed = 2;
					else
						allowed = 0;

					if ( Q_strncasecmp( s, 'status', 6 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'god', 3 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'notarget', 8 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'fly', 3 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'name', 4 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'noclip', 6 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'say', 3 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'say_team', 8 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'tell', 4 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'color', 5 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'kill', 4 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'pause', 5 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'spawn', 5 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'begin', 5 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'prespawn', 8 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'kick', 4 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'ping', 4 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'give', 4 ) ) allowed = 1;
					else if ( Q_strncasecmp( s, 'ban', 3 ) ) allowed = 1;

					if ( allowed === 2 )
						Cbuf_InsertText( s );
					else if ( allowed === 1 )
						Cmd_ExecuteString( s, src_client );
					else
						Con_DPrintf( '%s tried to %s\n', host_client.name, s );
					break;

				}

				case clc_disconnect:
					return false;

				case clc_move:
					SV_ReadClientMove( SV_EnsureClientCmd( host_client ) );
					break;

			}

			if ( continueOuter ) break;

		}

	} while ( ret === 1 );

	return true;

}

/*
==================
SV_RunClients
==================
*/
/**
 * Reads every active client's messages and runs their moves, once per server frame (called by `Host_ServerFrame`
 * before physics). For each client it sets `host_client` (here and through `set_host_client`) and `sv_player`,
 * drops the client (`SV_DropClient( false )`) when `SV_ReadClientMessage` returns false, and clears the movement
 * of clients that have not spawned yet until a new packet is received. `SV_ClientThink` runs unless the server is
 * paused or, in single player, the console or a menu has the keys (always pause in single player if in console or
 * menus), or the Newer Game welcome-loading hook is holding player state while level data is prepared. Leaves
 * `host_client` at the last client.
 */
export function SV_RunClients() {

	for ( let i = 0; i < svs.maxclients; i ++ ) {

		host_client = svs.clients[ i ];
		if ( _set_host_client ) _set_host_client( host_client );

		if ( ! host_client.active )
			continue;

		SV_SetPlayer( host_client.edict );

		if ( ! SV_ReadClientMessage() ) {

			SV_DropClient( false ); // client misbehaved...
			continue;

		}

		if ( ! host_client.spawned ) {

			// clear client movement until a new packet is received
			const hostCmd = SV_EnsureClientCmd( host_client );
			hostCmd.forwardmove = 0;
			hostCmd.sidemove = 0;
			hostCmd.upmove = 0;
			continue;

		}

		// Keep reliable signon/messages running, but preserve every player state
		// component while paired local level data is being prepared.
		if(svs.maxclients===1&&R_WelcomeLoadingHolding())continue;
		// always pause in single player if in console or menus
		if ( ! sv.paused && ( svs.maxclients > 1 || ( _get_key_dest ? _get_key_dest() : 0 ) === key_game ) ) {
			SV_ClientThink();
		}

	}

}
