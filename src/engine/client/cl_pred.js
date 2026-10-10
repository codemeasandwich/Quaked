/**
 * @module engine/client/cl_pred
 *
 * Client-side prediction (QuakeWorld cl_pred.c): the player's movement replayed locally between server updates.
 *
 * Types: exported classes `player_state_t`, `frame_t`.
 *
 * State: mutable exports `cl_simonground`, `cl_prediction_active`; module-level variables `outgoing_sequence`,
 * `incoming_sequence`, `validsequence`, `server_sequence`, `has_server_state`, `cls_latency`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Its sequence and latency are set through `CL_SetLatency`, `CL_SetValidSequence` and `CL_SetServerSequence`.
 */
// Ported from: QuakeWorld/client/cl_pred.c
// Client-side prediction for smooth movement with low server tick rates

import { VectorCopy } from '../common/mathlib.js';
import { Q_atof } from '../common/common.js';
import { cvar_t, Cvar_RegisterVariable } from '../common/cvar.js';
import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from '../common/cmd.js';
import { pmove, movevars, PlayerMove, PM_HullPointContents, PM_GetOnGround, Pmove_Init,
	player_mins, player_maxs } from '../server/pmove.js';
import { CONTENTS_EMPTY } from '../common/bspfile.js';
import { cl, cl_entities, packet_entities_t } from './client.js';
import { STAT_HEALTH } from '../common/quakedef.js';
import { realtime } from '../common/host_state.js';
import { sv } from '../server/server.js';

// CVars
export const cl_nopred = new cvar_t( 'cl_nopred', '0' );
export const cl_pushlatency = new cvar_t( 'pushlatency', '-999' );
export const cl_solid_players = new cvar_t( 'cl_solid_players', '1' );
export const cl_predict_players = new cvar_t( 'cl_predict_players', '1' );

// Player flags from QuakeWorld protocol
export const PF_DEAD = ( 1 << 9 ); // Don't block movement any more
export const PF_GIB = ( 1 << 10 ); // Offset the view height differently

// Predicted player structure (for other players)
class predicted_player_t {
	constructor() {
		this.active = false;
		this.origin = new Float32Array( 3 ); // Predicted origin
		this.velocity = new Float32Array( 3 ); // Last known velocity
		this.angles = new Float32Array( 3 );
		this.modelindex = 0;
		this.msgtime = 0; // Last update time
		this.frame = 0;
		this.flags = 0; // PF_DEAD, PF_GIB, etc.
		this.skin = 0;
		this.effects = 0;
		this.weaponframe = 0;
		this.msec = 0; // Time since last server frame
		this.serverSequence = 0; // Last svc_serversequence this player was updated in
		// Movement command for physics prediction
		this.cmd = {
			msec: 0,
			angles: new Float32Array( 3 ),
			forwardmove: 0,
			sidemove: 0,
			upmove: 0,
			buttons: 0,
			impulse: 0
		};
	}
}

// Array of predicted players (indices 1-maxclients are players)
const MAX_CLIENTS = 16;
const predicted_players = [];
for ( let i = 0; i < MAX_CLIENTS; i++ ) {
	predicted_players.push( new predicted_player_t() );
}

// Command buffer for prediction
const UPDATE_BACKUP = 64; // Must be power of 2
const UPDATE_MASK = UPDATE_BACKUP - 1;

// Player state for prediction
export class player_state_t {
	/**
	 * Creates a zeroed player movement state: the input and output of one `CL_PredictUsercmd` step. One is kept
	 * per prediction frame (`frame_t.playerstate`) and reused for the life of the module; the scratch instances
	 * `_predFrom`, `_predTo` and `_splitTemp` are also of this type.
	 *
	 * Fields: `origin` (Quake units, world space), `velocity` (Quake units per second), `viewangles` (degrees),
	 * `onground` (true when standing on something), `oldbuttons` (button bits of the previous command, for
	 * jump edge detection), `waterjumptime` (seconds left of a water jump), `weaponframe`.
	 */
	constructor() {
		this.origin = new Float32Array( 3 );
		this.velocity = new Float32Array( 3 );
		this.viewangles = new Float32Array( 3 );
		this.onground = false;
		this.oldbuttons = 0;
		this.waterjumptime = 0;
		this.weaponframe = 0;
	}

	/**
	 * Copies every field of another state into this one (vectors element by element, so this object keeps its own
	 * arrays). Nothing in the engine calls it at present.
	 *
	 * @param {player_state_t} other state to copy from; not modified
	 */
	copyFrom( other ) {
		VectorCopy( other.origin, this.origin );
		VectorCopy( other.velocity, this.velocity );
		VectorCopy( other.viewangles, this.viewangles );
		this.onground = other.onground;
		this.oldbuttons = other.oldbuttons;
		this.waterjumptime = other.waterjumptime;
		this.weaponframe = other.weaponframe;
	}
}

// Frame structure - stores command and resulting state for prediction
export class frame_t {
	/**
	 * Creates one slot of the 64-entry prediction ring (`UPDATE_BACKUP`), indexed by the client's outgoing command
	 * sequence. `CL_StoreCommand` fills `cmd`, `sequence`, `netsequence` and `senttime` when a move is sent;
	 * `CL_SetServerState` writes the server's authoritative result into the acknowledged slot's `playerstate`, and
	 * `CL_PredictMove` writes predicted results into the later slots. All slots are allocated once and reused;
	 * `CL_ResetPrediction` clears them.
	 *
	 * Fields: `cmd` (`msec` 0..255 milliseconds, `angles` in degrees, `forwardmove`/`sidemove`/`upmove` in Quake
	 * units per second, `buttons` bits: 1 attack, 2 jump), `sequence` (absolute command sequence in this slot, -1 when
	 * empty), `netsequence` (transport packet sequence the command went out in, -1 when unknown), `senttime` (`realtime`
	 * in seconds when sent, 0 when empty), `playerstate` (`player_state_t`).
	 */
	constructor() {
		this.cmd = {
			msec: 0,
			angles: new Float32Array( 3 ),
			forwardmove: 0,
			sidemove: 0,
			upmove: 0,
			buttons: 0
		};
		this.sequence = - 1; // Absolute client command sequence stored in this slot
		this.netsequence = - 1; // Transport-level packet sequence used to send this command
		this.senttime = 0; // Time command was sent
		this.playerstate = new player_state_t();
	}
}

// Entity frame structure - stores packet entity snapshots from server
// Separate from prediction frames because they use different sequence namespaces
class entity_frame_t {
	constructor() {
		this.packet_entities = new packet_entities_t();
		this.invalid = false; // set if parse error
		this.server_sequence = 0; // server's outgoing sequence for this frame
	}
}

// Prediction frame buffer (indexed by client outgoing_sequence)
const frames = [];
for ( let i = 0; i < UPDATE_BACKUP; i++ ) {
	frames.push( new frame_t() );
}

// Entity frame buffer (indexed by server_sequence)
const entity_frames = [];
for ( let i = 0; i < UPDATE_BACKUP; i++ ) {
	entity_frames.push( new entity_frame_t() );
}

// Sequence tracking
let outgoing_sequence = 0; // Next command to send
let incoming_sequence = 0; // Last acknowledged command from server
let validsequence = 0; // Last valid packet-entity server sequence (0 = no valid data yet)
let server_sequence = 0; // Latest server frame sequence received (from svc_serversequence)
let has_server_state = false; // Have authoritative local player state for prediction baseline

// Predicted position (used for rendering)
export const cl_simorg = new Float32Array( 3 ); // Simulated/predicted origin
export const cl_simvel = new Float32Array( 3 ); // Simulated/predicted velocity
export const cl_simangles = new Float32Array( 3 ); // Simulated angles
export let cl_simonground = -1; // Predicted onground state: -1 = in air, >= 0 = on ground
/**
 * Sets the exported `cl_simonground` binding from outside this module. CL_ReadFromServer (cl_main.js)
 * calls it each frame when prediction is not running (local server or demo playback) so view bobbing still sees the
 * NQ onground state.
 *
 * @param {number} v -1 when in the air, 0 (or any value >= 0) when on the ground
 */
export function set_cl_simonground( v ) { cl_simonground = v; }
export let cl_prediction_active = false; // true once CL_PredictMove has produced valid output

// Estimated latency for timing
let cls_latency = 0;

/*
=================
CL_SetLatency
=================
*/
/**
 * Overrides the estimated round-trip latency. Its original comment says it is called when server updates arrive to
 * estimate latency; nothing in the engine calls it now, because `CL_AcknowledgeCommand` and
 * `CL_FindAcknowledgedSequence` keep the estimate up to date themselves. Cleared to 0 by `CL_ResetPrediction`.
 *
 * @param {number} latency round-trip time in seconds (0 means "no estimate yet")
 */
export function CL_SetLatency( latency ) {
	cls_latency = latency;
}

/*
=================
CL_GetLatency
=================
*/
/**
 * Reads the current round-trip latency estimate (an exponential moving average updated as commands are
 * acknowledged). No engine code calls it at present.
 *
 * @returns {number} estimated latency in seconds; 0 until the first acknowledged command after a reset
 */
export function CL_GetLatency() {
	return cls_latency;
}

/*
=================
CL_GetOutgoingSequence / CL_GetIncomingSequence
=================
*/
/**
 * Reads the sequence number the next stored command will get (`CL_StoreCommand` increments it). Reset to 0 by
 * `CL_ResetPrediction`. No engine code calls it at present.
 *
 * @returns {number} next outgoing command sequence (0 or more)
 */
export function CL_GetOutgoingSequence() { return outgoing_sequence; }
/**
 * Reads the newest command sequence the server is known to have processed: the prediction baseline that
 * `CL_PredictMove` replays from. Reset to 0 by `CL_ResetPrediction`. No engine code calls it at present.
 *
 * @returns {number} last acknowledged command sequence (0 or more)
 */
export function CL_GetIncomingSequence() { return incoming_sequence; }

/*
=================
CL_SetValidSequence
=================
*/
/**
 * Records the server frame sequence of the newest valid packet-entity snapshot. cl_parse.js calls it after parsing
 * svc_packetentities / svc_deltapacketentities, and with 0 when a delta cannot be applied. While it is 0 the client
 * neither requests deltas nor builds brush-entity collision for prediction, and relinks entities the NQ way. Reset
 * to 0 by `CL_ResetPrediction`.
 *
 * @param {number} seq server sequence (from svc_serversequence) of the valid snapshot; 0 to invalidate (for example
 *     on a parse error or disconnect)
 */
export function CL_SetValidSequence( seq ) {
	validsequence = seq;
}

/*
=================
CL_GetValidSequence
=================
*/
/**
 * Reads the server sequence of the newest valid packet-entity snapshot. cl_input.js uses it to choose the delta
 * base it asks for (clc_delta) and cl_main.js to decide between QW-style packet-entity linking and NQ relinking.
 *
 * @returns {number} the server sequence, or 0 when there is no valid snapshot
 */
export function CL_GetValidSequence() { return validsequence; }

/*
=================
CL_GetFrame
=================
*/
/**
 * Looks up a slot of the prediction frame buffer (indexed by client outgoing_sequence). The ring holds 64 slots, so
 * a sequence 64 or more older than the newest refers to a reused slot; check `frame.sequence` against `seq`.
 *
 * @param {number} seq client command sequence; only the low 6 bits select the slot
 * @returns {frame_t} the live slot (shared, mutable; not a copy)
 */
export function CL_GetFrame( seq ) { return frames[ seq & UPDATE_MASK ]; }

/*
=================
CL_GetEntityFrame
=================
*/
/**
 * Looks up a slot of the 64-entry packet-entity snapshot ring (indexed by server_sequence). It is kept separate from
 * the prediction frames because the two use different sequence namespaces. cl_parse.js fills or invalidates the slot
 * for the current server sequence and reads older slots as delta bases; cl_main.js reads it to link entities.
 *
 * @param {number} seq server frame sequence; only the low 6 bits select the slot
 * @returns {{ packet_entities: packet_entities_t, invalid: boolean, server_sequence: number }} the live slot
 *     (shared, mutable, reused 64 sequences later); `invalid` is set when parsing that frame failed
 */
export function CL_GetEntityFrame( seq ) { return entity_frames[ seq & UPDATE_MASK ]; }

/*
=================
CL_GetServerSequence / CL_SetServerSequence
=================
*/
/**
 * Reads the latest server frame sequence received, used for delta compression and to index the entity frame ring.
 *
 * @returns {number} sequence from the last svc_serversequence; 0 after `CL_ResetPrediction`
 */
export function CL_GetServerSequence() { return server_sequence; }
/**
 * Stores the server frame sequence when cl_parse.js reads svc_serversequence (once per server frame, before that
 * frame's player info and packet entities). Players updated by `CL_SetPlayerInfo` are stamped with it, and
 * `CL_SetUpPlayerPrediction` treats players without the current stamp as gone.
 *
 * @param {number} seq the server's outgoing frame sequence (32-bit value read with MSG_ReadLong)
 */
export function CL_SetServerSequence( seq ) { server_sequence = seq; }

/*
=================
CL_AcknowledgeCommand
=================
*/
/**
 * Marks a command as processed by the server, moving the prediction baseline (`incoming_sequence`) forward, and
 * folds the command's round-trip time into the latency estimate (first sample taken as-is, then 75% old / 25% new;
 * samples of 2 seconds or more are ignored). Called from svc_clientdata parsing via
 * `CL_AcknowledgeTransportSequence`, or directly with the result of `CL_FindAcknowledgedSequence` when the
 * connection has no transport ack. It does nothing when no command has been sent, when `sequence` is not newer than
 * the current baseline, or when its ring slot has been reused.
 *
 * @param {number} sequence client command sequence the server has processed; clamped to the newest sent command
 */
export function CL_AcknowledgeCommand( sequence ) {
	const newestSent = outgoing_sequence - 1;
	if ( newestSent < 0 )
		return;

	if ( sequence > newestSent )
		sequence = newestSent;

	if ( sequence <= incoming_sequence )
		return;

	const frame = frames[ sequence & UPDATE_MASK ];
	if ( frame.sequence !== sequence )
		return;

	incoming_sequence = sequence;

	if ( frame.senttime > 0 ) {

		const observedRTT = realtime - frame.senttime;
		if ( observedRTT >= 0 && observedRTT < 2.0 ) {

			if ( cls_latency <= 0 ) {

				cls_latency = observedRTT;

			} else {

				cls_latency = cls_latency * 0.75 + observedRTT * 0.25;

			}

		}

	}
}

function _CL_SequenceGTE( sequence, baseline ) {

	return ( ( sequence - baseline ) | 0 ) >= 0;

}

/*
=================
CL_AcknowledgeTransportSequence
=================
*/
/**
 * Maps a transport-level packet ack to the newest predicted command sent in a packet with sequence <= transport ack,
 * and acknowledges that command with `CL_AcknowledgeCommand`. Called by cl_parse.js on each svc_clientdata when the
 * connection reports an `ackSequence`. Only commands newer than the current baseline and still in the 64-slot ring
 * are searched; the comparison is wrap-safe on 32-bit sequence numbers. Does nothing if no command qualifies.
 *
 * @param {number} transportAckSequence newest packet sequence the server acknowledged (`qsocket.ackSequence`)
 */
export function CL_AcknowledgeTransportSequence( transportAckSequence ) {

	const newestSent = outgoing_sequence - 1;
	if ( newestSent < 0 )
		return;

	const searchEnd = Math.max( incoming_sequence + 1, outgoing_sequence - UPDATE_BACKUP + 1 );
	for ( let seq = newestSent; seq >= searchEnd; seq -- ) {

		const frame = frames[ seq & UPDATE_MASK ];
		if ( frame.sequence !== seq || frame.netsequence < 0 )
			continue;

		if ( _CL_SequenceGTE( transportAckSequence, frame.netsequence ) ) {

			CL_AcknowledgeCommand( seq );
			return;

		}

	}

}

/*
=================
CL_FindAcknowledgedSequence
=================
*/
/**
 * Finds which command sequence corresponds to the server update when the transport gives no ack: when we receive a
 * server update at `currentTime`, we acknowledge commands that were sent more than RTT ago. The estimate never
 * regresses and never passes the newest command sent; the minimum age is the latency estimate (0.1 s before there is
 * one) clamped to 0.02..1.0 s. While no command is that old it advances by at most one command already sent. It also
 * updates the latency moving average from the chosen command, but does not move the baseline itself: the caller
 * (cl_parse.js svc_clientdata) passes the result to `CL_AcknowledgeCommand`.
 *
 * @param {number} currentTime time of the server update, `realtime` in seconds
 * @returns {number} the command sequence to acknowledge, or -1 if not found (nothing newer than the baseline qualifies)
 */
export function CL_FindAcknowledgedSequence( currentTime ) {
	// Conservative ack estimate:
	// 1) only consider commands old enough to have likely completed a round trip
	// 2) never regress
	// 3) never jump past the newest command we have sent
	const newestSent = outgoing_sequence - 1;
	if ( newestSent <= incoming_sequence )
		return - 1;

	// Require a minimum age before assuming the server has processed a command.
	// Without this guard, high send rates can incorrectly "ack" the newest command
	// every frame, collapsing prediction.
	let minAckAge = cls_latency > 0 ? cls_latency : 0.1;
	if ( minAckAge < 0.02 ) minAckAge = 0.02;
	if ( minAckAge > 1.0 ) minAckAge = 1.0;
	const ackCutoffTime = currentTime - minAckAge;

	let bestSeq = - 1;
	const searchStart = newestSent;
	const searchEnd = Math.max( incoming_sequence + 1, outgoing_sequence - UPDATE_BACKUP + 1 );
	for ( let seq = searchStart; seq >= searchEnd; seq -- ) {

		const frame = frames[ seq & UPDATE_MASK ];
		if ( frame.sequence === seq && frame.senttime > 0 && frame.senttime <= ackCutoffTime ) {

			bestSeq = seq;
			break;

		}

	}

	// Startup fallback: if latency estimate is still settling, advance by at most one
	// command that has at least been sent before now.
	if ( bestSeq < 0 ) {

		const nextSeq = incoming_sequence + 1;
		if ( nextSeq <= newestSent ) {

			const nextFrame = frames[ nextSeq & UPDATE_MASK ];
			if ( nextFrame.sequence === nextSeq && nextFrame.senttime > 0 && nextFrame.senttime <= currentTime )
				bestSeq = nextSeq;

		}

	}

	if ( bestSeq <= incoming_sequence )
		return - 1;

	const ackFrame = frames[ bestSeq & UPDATE_MASK ];
	if ( ackFrame.sequence === bestSeq && ackFrame.senttime > 0 ) {

		const observedRTT = currentTime - ackFrame.senttime;
		if ( observedRTT >= 0 && observedRTT < 2.0 ) {

			// Exponential moving average
			if ( cls_latency <= 0 ) {

				cls_latency = observedRTT;

			} else {

				cls_latency = cls_latency * 0.75 + observedRTT * 0.25;

			}

		}

	}

	return bestSeq;

}

/*
=================
CL_StoreCommand
=================
*/
/**
 * Stores a command for prediction replay in the next ring slot and advances the outgoing sequence. cl_input.js calls
 * it from CL_SendMove each time a move is sent. The fields are copied, so the caller may reuse `cmd`; the slot is
 * overwritten 64 commands later.
 *
 * @param {{ msec: number, angles: Float32Array, forwardmove: number, sidemove: number, upmove: number,
 *     buttons: number }} cmd the move: `msec` 0..255 milliseconds, `angles` in degrees, moves in Quake units per
 *     second, `buttons` bits (1 attack, 2 jump)
 * @param {number} senttime `realtime` in seconds when the command was sent
 * @param {number} [netsequence=-1] transport packet sequence it went out in (`qsocket.sendSequence`), -1 when unknown
 * @returns {number} the command sequence assigned to this command
 */
export function CL_StoreCommand( cmd, senttime, netsequence = - 1 ) {
	const sequence = outgoing_sequence;
	const framenum = outgoing_sequence & UPDATE_MASK;
	const frame = frames[ framenum ];

	// Copy command
	frame.cmd.msec = cmd.msec;
	VectorCopy( cmd.angles, frame.cmd.angles );
	frame.cmd.forwardmove = cmd.forwardmove;
	frame.cmd.sidemove = cmd.sidemove;
	frame.cmd.upmove = cmd.upmove;
	frame.cmd.buttons = cmd.buttons;
	frame.sequence = sequence;
	frame.netsequence = netsequence;
	frame.senttime = senttime;

	outgoing_sequence++;

	return sequence;
}

// Temporary player state for other-player prediction
const _predFrom = new player_state_t();
const _predTo = new player_state_t();

// Cached buffers for CL_PredictUsercmd split-command path (Golden Rule #4)
const _splitTemp = new player_state_t();
const _splitCmd = {
	msec: 0,
	angles: null, // shared with original cmd.angles (no copy needed)
	forwardmove: 0,
	sidemove: 0,
	upmove: 0,
	buttons: 0
};

// Cached buffer for CL_NudgePosition (Golden Rule #4)
const _nudge_base = new Float32Array( 3 );

/*
=================
CL_SetUpPlayerPrediction
=================
*/
/**
 * Calculates predicted positions for all other players (ported from QuakeWorld cl_ents.c). Runs each frame from
 * `CL_PredictMove` (via CL_SetupPMove, before other players are added as collision boxes) and from cl_main.js before
 * CL_LinkPlayers when packet entities are in use. Only players updated in the current server frame and with a model
 * are marked active; the rest are deactivated. The local player takes the predicted `cl_simorg`/`cl_simvel`. Others
 * are moved forward with full physics prediction (`CL_PredictUsercmd`, using the movement command from
 * svc_playerinfo) by half the time since their update (QW: msec = 500 * dt, capped at 255 ms) toward a target of
 * `realtime - latency + 0.02` s; when that time is not positive, prediction is turned off, or `dopred` is false,
 * the svc_playerinfo origin is kept as-is. The original comment's velocity-extrapolation fallback is not
 * implemented. Mutates the module's predicted-player records that `CL_GetPredictedPlayer` returns.
 *
 * @param {boolean} dopred false to skip physics prediction of other players and keep their received origins
 */
export function CL_SetUpPlayerPrediction( dopred ) {
	// Calculate player time - slightly ahead to compensate for latency
	let playertime = realtime - cls_latency + 0.02;
	if ( playertime > realtime )
		playertime = realtime;

	// Process all potential player slots
	// Ported from QW cl_ents.c - reads from predicted_players[] data
	// (populated by CL_SetPlayerInfo from svc_playerinfo messages)
	for ( let j = 0; j < MAX_CLIENTS; j++ ) {
		const pplayer = predicted_players[ j ];

		// QuakeWorld behavior: only consider players updated in the current
		// server frame. This avoids stale players lingering as active.
		if ( pplayer.serverSequence !== server_sequence ) {

			pplayer.active = false;
			continue;

		}

		// Skip if no model
		if ( pplayer.modelindex <= 0 ) {

			pplayer.active = false;
			continue;

		}

		pplayer.active = true;

		// For the local player, use our predicted position
		if ( j + 1 === cl.viewentity ) {
			VectorCopy( cl_simorg, pplayer.origin );
			VectorCopy( cl_simvel, pplayer.velocity );
		} else {
			// Only predict half the move to minimize overruns (QW: msec = 500 * dt)
			let msec = ( 500 * ( playertime - pplayer.msgtime ) ) | 0;

			if ( msec <= 0 || cl_predict_players.value === 0 || dopred === false ) {
				// No prediction - keep svc_playerinfo origin as-is
			} else {
				// Full physics prediction using movement commands from svc_playerinfo
				if ( msec > 255 )
					msec = 255;

				// Build player state from svc_playerinfo data
				VectorCopy( pplayer.origin, _predFrom.origin );
				VectorCopy( pplayer.velocity, _predFrom.velocity );
				VectorCopy( pplayer.cmd.angles, _predFrom.viewangles );
				_predFrom.onground = ( pplayer.flags & PF_DEAD ) === 0;
				_predFrom.oldbuttons = 0;
				_predFrom.waterjumptime = 0;
				_predFrom.weaponframe = pplayer.weaponframe;

				// Set the prediction time on the command
				pplayer.cmd.msec = msec;

				// Run full physics prediction
				CL_PredictUsercmd( _predFrom, _predTo, pplayer.cmd, false );

				// Use the predicted result
				VectorCopy( _predTo.origin, pplayer.origin );
			}
		}
	}
}

/*
=================
CL_SetSolidEntities

Add brush entities (doors, platforms, lifts) as collision objects for prediction.
Ported from QuakeWorld cl_ents.c
=================
*/
function CL_SetSolidEntities() {
	if ( validsequence === 0 )
		return;

	const eframe = entity_frames[ validsequence & UPDATE_MASK ];
	if ( eframe.invalid )
		return;

	const pak = eframe.packet_entities;

	// Build solid physents from the current packet-entity snapshot.
	// This mirrors QuakeWorld's CL_SetSolidEntities, which uses the
	// authoritative frame data rather than potentially stale cl_entities.
	for ( let i = 0; i < pak.num_entities; i++ ) {
		const state = pak.entities[ i ];
		if ( state.modelindex === 0 )
			continue;

		const model = cl.model_precache[ state.modelindex ];
		if ( model == null )
			continue;

		const hull = model.hulls[ 1 ];
		if ( hull == null )
			continue;

		if ( ! hull.firstclipnode && ! model.clipbox )
			continue;

		if ( pmove.numphysent >= pmove.physents.length )
			break;

		const pent = pmove.physents[ pmove.numphysent ];
		pent.model = model;
		VectorCopy( state.origin, pent.origin );
		pent.info = state.number;
		pmove.numphysent++;
	}
}

/*
=================
CL_SetupPMove

Set up pmove state for prediction
=================
*/
function CL_SetupPMove() {
	// Set up physics entities (world model for collision)
	pmove.numphysent = 0;

	if ( cl.worldmodel != null ) {
		pmove.physents[ 0 ].model = cl.worldmodel;
		pmove.physents[ 0 ].origin.fill( 0 );
		pmove.numphysent = 1;
	}

	// Add brush entities (doors, platforms) as collision objects
	CL_SetSolidEntities();

	// Calculate predicted positions for other players first
	CL_SetUpPlayerPrediction( true );

	// Add other players as physics entities for collision
	CL_SetSolidPlayers( cl.viewentity - 1 );
}

/*
=================
CL_SetSolidPlayers

Add other players as collision entities for prediction.
Uses predicted positions from CL_SetUpPlayerPrediction().
Ported from QuakeWorld cl_ents.c
=================
*/
function CL_SetSolidPlayers( playernum ) {
	if ( cl_solid_players.value === 0 )
		return;

	// Use predicted player positions
	for ( let j = 0; j < MAX_CLIENTS; j++ ) {
		const pplayer = predicted_players[ j ];

		// Skip inactive players
		if ( ! pplayer.active )
			continue;

		// Don't add ourselves
		if ( j === playernum )
			continue;

		// Skip dead players - they don't block movement (PF_DEAD flag)
		if ( ( pplayer.flags & PF_DEAD ) !== 0 )
			continue;

		// Add as a solid physics entity using predicted position
		const pent = pmove.physents[ pmove.numphysent ];
		pent.model = null; // Use box collision, not BSP
		VectorCopy( pplayer.origin, pent.origin );
		VectorCopy( player_mins, pent.mins );
		VectorCopy( player_maxs, pent.maxs );
		pent.info = j; // Store player number

		pmove.numphysent++;

		// Don't overflow the physents array
		if ( pmove.numphysent >= pmove.physents.length )
			break;
	}
}

/*
=================
CL_GetPredictedPlayer
=================
*/
/**
 * Gets the predicted state of a player for rendering; cl_main.js CL_LinkPlayers calls it for each client slot after
 * `CL_SetUpPlayerPrediction` has run that frame.
 *
 * @param {number} playernum player slot, 0-based (entity number - 1), valid 0..15
 * @returns {?object} the live predicted-player record (`origin`, `velocity`, `angles`, `modelindex`, `frame`,
 *     `flags` PF_* bits, `skin`, `effects`, `weaponframe`, `cmd`, ...; shared and overwritten every frame), or null if
 *     the slot is out of range or the player is not active
 */
export function CL_GetPredictedPlayer( playernum ) {
	if ( playernum < 0 || playernum >= MAX_CLIENTS )
		return null;

	const pplayer = predicted_players[ playernum ];
	if ( ! pplayer.active )
		return null;

	return pplayer;
}

/*
=================
CL_SetPlayerInfo
=================
*/
/**
 * Called from CL_ParsePlayerInfo (cl_parse.js, one svc_playerinfo message) to set a player's state from the server.
 * This stores the QuakeWorld-style player info for prediction and stamps it with the current server sequence. Vectors
 * and the command are copied, so the caller may reuse its buffers. For the local player (`playernum + 1 ===
 * cl.viewentity`) it also bridges the data into the NQ entity system, because players are excluded from
 * svc_packetentities: it writes `cl_entities[cl.viewentity].origin`, shifts `msg_origins`, sets `msgtime` to
 * `cl.mtime[0]`, and calls `CL_SetServerState` with `cl.onground`. Out-of-range slots are ignored.
 *
 * @param {number} playernum player slot, 0-based (entity number - 1), valid 0..15
 * @param {Float32Array} origin position in Quake units, world space
 * @param {Float32Array} velocity Quake units per second (zero when the message carried none)
 * @param {number} frame model animation frame
 * @param {number} flags PF_* bits from the message (for example `PF_DEAD`, `PF_GIB`)
 * @param {number} skin skin number
 * @param {number} effects EF_* effect bits
 * @param {number} weaponframe view-weapon frame
 * @param {number} msec milliseconds between the player's last move and the server frame (0..255); the update time is
 *     taken as `realtime - msec / 1000`
 * @param {?{ msec: number, angles: Float32Array, forwardmove: number, sidemove: number, upmove: number,
 *     buttons: number, impulse: number }} cmd the player's last movement command, or null to keep the previous one
 * @param {?number} [modelindex] model precache index; null or omitted keeps the previous value
 */
export function CL_SetPlayerInfo( playernum, origin, velocity, frame, flags, skin, effects, weaponframe, msec, cmd, modelindex ) {
	if ( playernum < 0 || playernum >= MAX_CLIENTS )
		return;

	const pplayer = predicted_players[ playernum ];
	pplayer.active = true;
	pplayer.msgtime = realtime - msec * 0.001;
	pplayer.serverSequence = server_sequence;

	VectorCopy( origin, pplayer.origin );
	VectorCopy( velocity, pplayer.velocity );
	pplayer.frame = frame;
	pplayer.flags = flags;
	pplayer.skin = skin;
	pplayer.effects = effects;
	pplayer.weaponframe = weaponframe;
	pplayer.msec = msec;
	if ( modelindex != null )
		pplayer.modelindex = modelindex;

	// Copy movement command if provided
	if ( cmd != null ) {
		pplayer.cmd.msec = cmd.msec;
		VectorCopy( cmd.angles, pplayer.cmd.angles );
		pplayer.cmd.forwardmove = cmd.forwardmove;
		pplayer.cmd.sidemove = cmd.sidemove;
		pplayer.cmd.upmove = cmd.upmove;
		pplayer.cmd.buttons = cmd.buttons;
		pplayer.cmd.impulse = cmd.impulse;
	}

	// If this is the local player, bridge QW-style svc_playerinfo data
	// into the NQ-style entity system. Players are excluded from
	// svc_packetentities, so cl_entities[viewentity] is never updated
	// by entity updates. Without this, the NQ camera (V_CalcRefdef)
	// reads stale [0,0,0] from the entity.
	if ( playernum + 1 === cl.viewentity ) {

		const ent = cl_entities[ cl.viewentity ];

		// Update entity origin directly — V_CalcRefdef reads ent.origin
		// for the camera position in single player (sv.active).
		// CL_RelinkEntities may skip this entity (null model), so we
		// can't rely on it to interpolate msg_origins into ent.origin.
		VectorCopy( origin, ent.origin );

		// Also update msg_origins for interpolation if CL_RelinkEntities
		// does process the entity (e.g., after model is set)
		VectorCopy( ent.msg_origins[ 0 ], ent.msg_origins[ 1 ] );
		VectorCopy( origin, ent.msg_origins[ 0 ] );

		// Update msgtime so CL_RelinkEntities doesn't cull the entity
		ent.msgtime = cl.mtime[ 0 ];

		// Update prediction frame for CL_PredictMove (multiplayer path)
		CL_SetServerState( origin, velocity, cl.onground );

	}
}

/*
=================
CL_NudgePosition

If pmove.origin is in a solid position,
try nudging slightly on all axis to
allow for the cut precision of the net coordinates
=================
*/
function CL_NudgePosition() {
	if ( cl.worldmodel == null )
		return;

	const hull = cl.worldmodel.hulls[ 1 ];
	if ( PM_HullPointContents( hull, 0, pmove.origin ) === CONTENTS_EMPTY )
		return;

	const base = _nudge_base;
	VectorCopy( pmove.origin, base );

	for ( let x = -1; x <= 1; x++ ) {
		for ( let y = -1; y <= 1; y++ ) {
			pmove.origin[ 0 ] = base[ 0 ] + x * 1.0 / 8;
			pmove.origin[ 1 ] = base[ 1 ] + y * 1.0 / 8;
			if ( PM_HullPointContents( hull, 0, pmove.origin ) === CONTENTS_EMPTY )
				return;
		}
	}
}

/*
==============
CL_PredictUsercmd
==============
*/
/**
 * Predicts the result of a single user command (QuakeWorld cl_pred.c) by loading `from` and `cmd` into the shared
 * `pmove` state and running PlayerMove against the physents already set up for this frame. Commands longer than 50 ms
 * are split into two halves, recursively. Called by `CL_PredictMove` for the local player and by
 * `CL_SetUpPlayerPrediction` for other players. Overwrites the global `pmove` state; `pmove.dead` comes from the local
 * player's `STAT_HEALTH`.
 *
 * @param {player_state_t} from starting state; not modified
 * @param {player_state_t} to written: resulting origin, velocity, viewangles, onground, oldbuttons, waterjumptime; it
 *     may be the same object as `from`
 * @param {{ msec: number, angles: Float32Array, forwardmove: number, sidemove: number, upmove: number,
 *     buttons: number }} cmd the move: `msec` in milliseconds, `angles` in degrees, moves in Quake units per second
 * @param {boolean} spectator true to move with spectator physics
 */
export function CL_PredictUsercmd( from, to, cmd, spectator ) {
	// Split up very long moves
	if ( cmd.msec > 50 ) {
		_splitCmd.msec = Math.floor( cmd.msec / 2 );
		_splitCmd.angles = cmd.angles;
		_splitCmd.forwardmove = cmd.forwardmove;
		_splitCmd.sidemove = cmd.sidemove;
		_splitCmd.upmove = cmd.upmove;
		_splitCmd.buttons = cmd.buttons;

		CL_PredictUsercmd( from, _splitTemp, _splitCmd, spectator );
		CL_PredictUsercmd( _splitTemp, to, _splitCmd, spectator );
		return;
	}

	VectorCopy( from.origin, pmove.origin );
	VectorCopy( cmd.angles, pmove.angles );
	VectorCopy( from.velocity, pmove.velocity );

	pmove.oldbuttons = from.oldbuttons;
	pmove.waterjumptime = from.waterjumptime;
	pmove.dead = cl.stats[ STAT_HEALTH ] <= 0;
	pmove.spectator = spectator;

	pmove.cmd.msec = cmd.msec;
	VectorCopy( cmd.angles, pmove.cmd.angles );
	pmove.cmd.forwardmove = cmd.forwardmove;
	pmove.cmd.sidemove = cmd.sidemove;
	pmove.cmd.upmove = cmd.upmove;
	pmove.cmd.buttons = cmd.buttons;

	PlayerMove();

	to.waterjumptime = pmove.waterjumptime;
	to.oldbuttons = pmove.cmd.buttons;
	VectorCopy( pmove.origin, to.origin );
	VectorCopy( pmove.angles, to.viewangles );
	VectorCopy( pmove.velocity, to.velocity );
	to.onground = PM_GetOnGround() !== -1; // Use proper onground from pmove

	to.weaponframe = from.weaponframe;
}

/*
==============
CL_Movevars_f

Console command handler for _movevars. The server sends this via svc_stufftext
during signon to sync physics parameters for client-side prediction.
Matches original QuakeWorld's movevars protocol (QW/server/sv_user.c:98-108).
==============
*/
function CL_Movevars_f() {
	if ( Cmd_Argc() < 11 )
		return;

	movevars.gravity = Q_atof( Cmd_Argv( 1 ) );
	movevars.stopspeed = Q_atof( Cmd_Argv( 2 ) );
	movevars.maxspeed = Q_atof( Cmd_Argv( 3 ) );
	movevars.spectatormaxspeed = Q_atof( Cmd_Argv( 4 ) );
	movevars.accelerate = Q_atof( Cmd_Argv( 5 ) );
	movevars.airaccelerate = Q_atof( Cmd_Argv( 6 ) );
	movevars.wateraccelerate = Q_atof( Cmd_Argv( 7 ) );
	movevars.friction = Q_atof( Cmd_Argv( 8 ) );
	movevars.waterfriction = Q_atof( Cmd_Argv( 9 ) );
	movevars.entgravity = Q_atof( Cmd_Argv( 10 ) );
}

/*
==============
CL_PredictMove
==============
*/
/**
 * Main prediction function (QuakeWorld cl_pred.c), called each frame from CL_ReadFromServer (cl_main.js) to predict the
 * local player's position, but only when there is no local server and no demo is playing. Unless paused, it sets
 * `cl.time` to `realtime - latency - pushlatency / 1000` (never ahead of `realtime`; a positive `pushlatency` is forced
 * to 0), then replays every unacknowledged command from the server's acknowledged state and interpolates the last step
 * to `cl.time`. A move of more than 128 units on any axis is treated as a teleport and not interpolated. Results go to
 * `cl_simorg`, `cl_simvel`, `cl_simangles` and `cl_simonground`, and `cl_prediction_active` becomes true. It returns
 * early, leaving those unchanged, while paused, during intermission, before `CL_SetServerState` has run, when 63 or
 * more commands are unacknowledged, or when replay finds no frame. With `cl_nopred` set (or a local server) it copies
 * the acknowledged server state instead of predicting. Rebuilds `pmove.physents` (world, brush entities, other
 * players).
 */
export function CL_PredictMove() {
	if ( cl_pushlatency.value > 0 )
		cl_pushlatency.value = 0;

	if ( cl.paused )
		return;

	// Calculate the time we want to be at
	cl.time = realtime - cls_latency - cl_pushlatency.value * 0.001;
	if ( cl.time > realtime )
		cl.time = realtime;

	if ( cl.intermission !== 0 )
		return;

	// Check if we have authoritative local-player state to predict from
	if ( has_server_state === false )
		return;

	// Check if we have valid frames to predict from
	if ( outgoing_sequence - incoming_sequence >= UPDATE_BACKUP - 1 )
		return;

	VectorCopy( cl.viewangles, cl_simangles );

	// Get the last acknowledged frame from server
	const from = frames[ incoming_sequence & UPDATE_MASK ];

	// If prediction is disabled, just use server position
	if ( cl_nopred.value !== 0 || sv.active ) {
		VectorCopy( from.playerstate.velocity, cl_simvel );
		VectorCopy( from.playerstate.origin, cl_simorg );
		cl_simonground = from.playerstate.onground ? 0 : -1;
		cl_prediction_active = true;
		return;
	}

	// Set up pmove for collision
	CL_SetupPMove();

	// Predict forward from acknowledged state
	let to = null;
	let lastFrom = from;
	let i;

	for ( i = 1; i < UPDATE_BACKUP - 1 && incoming_sequence + i < outgoing_sequence; i++ ) {
		to = frames[ ( incoming_sequence + i ) & UPDATE_MASK ];
		CL_PredictUsercmd( lastFrom.playerstate, to.playerstate, to.cmd, false );

		if ( to.senttime >= cl.time )
			break;

		lastFrom = to;
	}

	// net hasn't delivered packets in a long time...
	if ( i === UPDATE_BACKUP - 1 || to == null )
		return;

	// Interpolate some fraction of the final frame
	let f;
	if ( to.senttime === lastFrom.senttime ) {
		f = 0;
	} else {
		f = ( cl.time - lastFrom.senttime ) / ( to.senttime - lastFrom.senttime );
		if ( f < 0 ) f = 0;
		if ( f > 1 ) f = 1;
	}

	// Check for teleport (large position change)
	for ( let i = 0; i < 3; i++ ) {
		if ( Math.abs( lastFrom.playerstate.origin[ i ] - to.playerstate.origin[ i ] ) > 128 ) {
			// Teleported, so don't lerp
			VectorCopy( to.playerstate.velocity, cl_simvel );
			VectorCopy( to.playerstate.origin, cl_simorg );
			cl_simonground = to.playerstate.onground ? 0 : -1;
			cl_prediction_active = true;
			return;
		}
	}

	// Interpolate position and velocity
	for ( let i = 0; i < 3; i++ ) {
		cl_simorg[ i ] = lastFrom.playerstate.origin[ i ]
			+ f * ( to.playerstate.origin[ i ] - lastFrom.playerstate.origin[ i ] );
		cl_simvel[ i ] = lastFrom.playerstate.velocity[ i ]
			+ f * ( to.playerstate.velocity[ i ] - lastFrom.playerstate.velocity[ i ] );
	}

	// Set predicted onground state (use the latest predicted frame)
	cl_simonground = to.playerstate.onground ? 0 : -1;
	cl_prediction_active = true;
}

/*
==============
CL_SetServerState
==============
*/
/**
 * Called when we receive authoritative state from the server: updates the acknowledged frame's player state (the
 * slot of `incoming_sequence`), which `CL_PredictMove` replays from, and enables prediction. Called by cl_parse.js
 * after each svc_clientdata (after the acknowledgement has moved the baseline) and by `CL_SetPlayerInfo` for the
 * local player. Vectors are copied.
 *
 * @param {Float32Array} origin player position in Quake units, world space
 * @param {Float32Array} velocity Quake units per second
 * @param {boolean} onground true when the server says the player is standing on something
 */
export function CL_SetServerState( origin, velocity, onground ) {
	const frame = frames[ incoming_sequence & UPDATE_MASK ];
	VectorCopy( origin, frame.playerstate.origin );
	VectorCopy( velocity, frame.playerstate.velocity );
	frame.playerstate.onground = onground;
	has_server_state = true;
}

/*
==============
CL_InitPrediction
==============
*/
/**
 * Registers the prediction cvars (`pushlatency`, `cl_nopred`, `cl_solid_players`, `cl_predict_players`), adds the
 * `_movevars` console command the server stuffs during signon to sync movement physics, and initialises pmove
 * (QuakeWorld cl_pred.c). Called once from CL_Init at startup.
 */
export function CL_InitPrediction() {
	Cvar_RegisterVariable( cl_pushlatency );
	Cvar_RegisterVariable( cl_nopred );
	Cvar_RegisterVariable( cl_solid_players );
	Cvar_RegisterVariable( cl_predict_players );
	Cmd_AddCommand( '_movevars', CL_Movevars_f );
	Pmove_Init();
}

/*
==============
CL_ResetPrediction
==============
*/
/**
 * Clears all prediction state: sequence counters, latency, the predicted outputs (`cl_simorg`, `cl_simvel`,
 * `cl_simangles`, `cl_simonground = -1`, `cl_prediction_active = false`) and both 64-slot rings. Called on level
 * change or disconnect, from CL_ClearState.
 */
export function CL_ResetPrediction() {
	outgoing_sequence = 0;
	incoming_sequence = 0;
	validsequence = 0;
	server_sequence = 0;
	has_server_state = false;
	cls_latency = 0;

	cl_simorg.fill( 0 );
	cl_simvel.fill( 0 );
	cl_simangles.fill( 0 );
	cl_simonground = -1;
	cl_prediction_active = false;

	for ( let i = 0; i < UPDATE_BACKUP; i++ ) {
		frames[ i ].sequence = - 1;
		frames[ i ].netsequence = - 1;
		frames[ i ].senttime = 0;
		frames[ i ].playerstate.origin.fill( 0 );
		frames[ i ].playerstate.velocity.fill( 0 );
		entity_frames[ i ].packet_entities.num_entities = 0;
		entity_frames[ i ].invalid = false;
		entity_frames[ i ].server_sequence = 0;
	}
}
