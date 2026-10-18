/**
 * @module engine/progs/hexen2_boot
 *
 * The Hexen II level/player boot sequence as one reusable path: seed the native precache layout around a loaded
 * eight-hull map, spawn the map's entities with the supplied gamecode, then place a client's player through the
 * gamecode's own `ClientConnect` and `PutClientInServer` and settle it on the floor. The host still owns the server
 * callback wiring (`SV_SetCallbacks`, `SV_Move_SetCallbacks`, `SV_User_SetCallbacks`), exactly as at engine start;
 * this module only sequences the Hexen-specific steps so tests and the session entry point share them.
 *
 * Types: plain values and functions; no exported classes.
 * State: writes the server state it is given (`sv`), never module state.
 * Errors: whatever the gamecode raises; a class the edition does not offer is refused before any spawn.
 */

import { ED_LoadFromFile } from './pr_edict.js';
import { sv as progsSv, svs, pr_global_struct } from './progs.js';
import { PR_ExecuteProgram } from './pr_exec.js';
import { SV_DropToFloor } from '../server/world.js';
import { SV_SetState } from '../server/sv_phys.js';
import { ss_loading, ss_active } from '../server/server.js';
import { Hexen2_SelectClass } from '../common/hexen2_profile.js';

/**
 * Seeds the native precache layout for a loaded map: slot 0 is the empty dummy, slot 1 the world, slots 2.. the
 * inline `*n` submodels (as SV_SpawnServer does), and an empty sound list.
 *
 * @param {object} sv the server state
 * @param {object} map the loaded brush model
 * @param {function(string): object} findModel returns the loaded model for a submodel name
 * @param {number} [soundSlots=512] the sound list length
 */
export function Hexen2_SeedPrecache( sv, map, findModel, soundSlots = 512 ) {

	sv.models = new Array( 512 ).fill( null );
	sv.models[ 1 ] = map;
	sv.model_precache = new Array( 512 ).fill( null );
	sv.model_precache[ 0 ] = '';
	sv.model_precache[ 1 ] = map.name;
	for ( let i = 1; i < map.numsubmodels; i ++ ) {

		sv.model_precache[ 1 + i ] = '*' + i;
		sv.models[ 1 + i ] = findModel( '*' + i );

	}
	sv.sound_precache = new Array( soundSlots ).fill( null );

}

/**
 * Binds the physics module to the server state and spawns the loaded map's entities with the supplied gamecode.
 *
 * @param {object} sv the server state
 * @param {object} map the loaded brush model
 * @param {number} entityFields the program's entity field count
 * @param {function(number, number): Array<object>} allocateEdicts PR_AllocEdicts
 * @returns {{ edicts: Array<object> }} the allocated edicts (the server keeps them)
 */
export function Hexen2_SpawnEntities( sv, map, entityFields, allocateEdicts ) {

	sv.max_edicts = 600;
	sv.num_edicts = Math.max( 2, svs.maxclients + 1 );
	sv.edicts = allocateEdicts( sv.num_edicts, entityFields );
	const world = sv.edicts[ 0 ];
	world.v.solid = 4; // SOLID_BSP
	world.v.movetype = 7; // MOVETYPE_PUSH
	world.v.modelindex = 1;
	sv.state = ss_loading;
	SV_SetState( sv, svs, pr_global_struct );
	pr_global_struct.time = sv.time;
	pr_global_struct.self = 0;
	ED_LoadFromFile( map.entities );
	sv.state = ss_active;
	return { edicts: sv.edicts };

}

/**
 * Places a client's player in the world through the supplied gamecode. `self` is the client's edict; the gamecode
 * assigns classname, model, stats and origin, then the player is dropped to the floor.
 *
 * @param {{ sv: object, client: object, player: object, gameId: string, classId: string, origin: ArrayLike<number>,
 *   angles?: ArrayLike<number> }} options the server, the client record (`spawn_parms` and `message` included), the
 *   client's edict, the edition id, the requested class, and a spawn origin/angles
 * @returns {{ ok: true, classNumber: number } | { ok: false, reason: string }} the placed class, or why not
 */
export function Hexen2_SpawnPlayer( options ) {

	const { sv, client, player, gameId, classId, origin, angles = [ 0, 0, 0 ] } = options;
	const selection = Hexen2_SelectClass( gameId, classId );
	if ( ! selection.ok ) return selection;
	player.v.origin = [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ];
	player.v.angles = [ angles[ 0 ], angles[ 1 ], angles[ 2 ] ];
	player.v.health = 100;
	player.v.max_health = 100;
	player.v.playerclass = selection.number;
	player.v.flags = 512 | 8; // FL_CLIENT | FL_ONGROUND
	const index = player.index;
	pr_global_struct.self = index;
	pr_global_struct.time = sv.time;
	if ( pr_global_struct.ClientConnect ) PR_ExecuteProgram( pr_global_struct.ClientConnect );
	PR_ExecuteProgram( pr_global_struct.PutClientInServer );
	pr_global_struct.self = index;
	SV_DropToFloor( player );
	return { ok: true, classNumber: selection.number };

}
