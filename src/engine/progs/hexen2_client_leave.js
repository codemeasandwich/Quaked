/**
 * @module engine/progs/hexen2_client_leave
 *
 * Leaving and rejoining a private session on the server: the gamecode's `ClientDisconnect` runs for the player, the
 * player edict is freed, the client record is cleared; a rejoin allocates a fresh edict and places the player through
 * the same `ClientConnect`/`PutClientInServer` path. Other clients are untouched. Network disconnect messages and the
 * packaged UI are separate.
 *
 * Types: plain values and functions; no exported classes.
 * State: writes the server/client state it is given.
 * Errors: none raised; invalid input is `{ ok: false, reason }`.
 */

import { ED_Alloc, ED_Free } from './pr_edict.js';
import { pr_global_struct, svs as progsSvs } from './progs.js';
import { PR_ExecuteProgram } from './pr_exec.js';
import { Hexen2_SpawnPlayer } from './hexen2_boot.js';

/**
 * Drops one client's player.
 *
 * @param {object} sv the server state
 * @param {object} client the client record
 * @param {object} player the client's player edict
 * @returns {{ ok: true, freed: number } | { ok: false, reason: string }} the freed edict number
 */
export function Hexen2_DropPlayer( sv, client, player ) {

	if ( !sv?.edicts || !client || !player ) return { ok: false, reason: 'no client/player' };
	if ( player.free ) return { ok: false, reason: 'the player is already free' };
	const index = player.index;
	pr_global_struct.self = index;
	if ( pr_global_struct.ClientDisconnect ) PR_ExecuteProgram( pr_global_struct.ClientDisconnect );
	ED_Free( player );
	client.active = false;
	client.spawned = false;
	client.edict = null;
	return { ok: true, freed: index };

}

/**
 * Rejoins a client with a fresh player edict.
 *
 * @param {object} sv the server state
 * @param {object} client the client record
 * @param {{ classId: string, gameId?: string, origin: ArrayLike<number> }} options the class and spawn origin
 * @returns {{ ok: true, player: object } | { ok: false, reason: string }} the new player
 */
export function Hexen2_RejoinPlayer( sv, client, options ) {

	if ( !sv?.edicts || !client ) return { ok: false, reason: 'no client' };
	const player = ED_Alloc();
	if ( !player ) return { ok: false, reason: 'no free edict' };
	client.edict = player;
	client.active = true;
	client.spawned = true;
	const placed = Hexen2_SpawnPlayer( { sv, client, player, gameId: options.gameId ?? 'hexen2', classId: options.classId,
		origin: options.origin } );
	if ( !placed.ok ) return placed;
	return { ok: true, player };

}

/** The persistent server state the rejoin allocates into (kept for callers that pass their own). */
export function Hexen2_ClientSlots() { return progsSvs?.clients ?? []; }
