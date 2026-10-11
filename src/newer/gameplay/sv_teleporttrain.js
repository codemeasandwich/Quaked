/**
 * @module newer/gameplay/sv_teleporttrain
 *
 * The end level's spiked teleport ball flies its lap without stopping at each corner (owner request 11 Oct 2026, card
 * [END1]; Newer Game only).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `program`, `fnNext`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// On the last level (end.bsp) a misc_teleporttrain, the spiked ball, flies a lap of 30 path_corners round the arena and
// passes through Shub-Niggurath; the final teleporter sends the player to the ball, and arriving while it is inside Shub
// telefrags the boss. The owner asked for its flight to be clean and fluid. Stock QuakeC train_wait stops a train for
// 0.1 s at every corner even when the corner has no `wait` (`self.nextthink = self.ltime + 0.1`), so the ball halts 19
// times a lap. In Newer Game a teleport train whose corner has no wait goes straight on to its next leg: when its think
// has just run train_wait and left train_next 0.1 s away, train_next runs at once, in the same frame (QuakeC's own
// function: it reads the next corner and starts SUB_CalcMove). Its path, speed and the corners it passes are the
// level's own; only the pauses go. Other trains (doors, platforms, func_train) and every rule outside Newer Game are
// unchanged.
import { PR_GetString, pr_functions, pr_global_struct, EDICT_TO_PROG } from '../../engine/progs/progs.js';
import { PR_ExecuteProgram } from '../../engine/progs/pr_exec.js';
import { ED_FindFunction } from '../../engine/progs/pr_edict.js';
import { sv } from '../../engine/server/server.js';
import { R_NewerGame } from '../mode.js';

let program = null, fnNext = 0;

/**
 * Called by sv_phys.js SV_Physics_Pusher right after it ran a pusher's think: a misc_teleporttrain in Newer Game that
 * has just been told to wait the stock 0.1 s at a corner without a `wait` goes on at once.
 *
 * @param {Object} ent the pusher whose think just ran
 */
export function SV_TeleportTrainThought( ent ) {

	if ( ent == null || ent.free || ! R_NewerGame() ) return;
	if ( program !== pr_functions ) { program = pr_functions; const f = ED_FindFunction( 'train_next' ); fnNext = f ? pr_functions.indexOf( f ) : 0; }
	if ( fnNext <= 0 || ent.v.think !== fnNext || ent.v.wait ) return;
	if ( PR_GetString( ent.v.classname ) !== 'misc_teleporttrain' ) return;
	if ( Math.abs( ent.v.nextthink - ( ent.v.ltime + .1 ) ) > 1e-3 ) return; // (train_wait's own 0.1 s, nothing else)
	ent.v.nextthink = 0;
	pr_global_struct.time = sv.time;
	pr_global_struct.self = EDICT_TO_PROG( ent );
	pr_global_struct.other = EDICT_TO_PROG( sv.edicts[ 0 ] );
	PR_ExecuteProgram( fnNext );

}
