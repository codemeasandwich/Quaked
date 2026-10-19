/**
 * @module engine/progs/pr_builtin_table
 *
 * The one builtin table (docs/hexen2/unified-host.md §3): Quake's `pr_builtin` for a Quake program, or a copy of it
 * with the Hexen II layers applied when the active game profile is Hexen II. The retail gamecode compiles the builtin
 * numbers in, so the shared numbers keep Quake's meaning and only the Hexen layer's numbers change; the two numbers
 * whose meanings truly collide (#79/#80: Quake 2021's finaleFinished/localsound against plaque_draw/rain_go) and any
 * Hexen number no layer implements are refused by name instead of running the other game's function.
 *
 * Types: plain values and functions; no exported classes.
 * State: none; `PR_SetBuiltins` (progs.js) holds the installed table.
 * Errors: `PR_RunError` (a program error, not a silent no-op) for a Hexen builtin with no implementation yet.
 */

import { GameProfile_IsHexen2 } from '../common/game_profile.js';
import { pr_builtin } from '../server/pr_cmds.js';
import { HEXEN2_BUILTIN_COUNT, Hexen2_BuiltinName } from './hexen2_builtins.js';
import { HEXEN2_IMPLEMENTED_BUILTINS } from './hexen2_cmds.js';
import { HEXEN2_WORLD_BUILTINS } from './hexen2_world_cmds.js';
import { HEXEN2_PRECACHE_BUILTINS } from './hexen2_precache_cmds.js';
import { HEXEN2_SERVER_BUILTINS } from './hexen2_server_cmds.js';
import { PR_RunError } from './pr_exec.js';
import { PR_SetBuiltins } from './progs.js';

// The self-contained number/vector layer first, then the layers that need the world and the server; a later layer
// overrides an earlier one, as the server's hand-written behaviour wins for the numbers it shares with the core.
const HEXEN_LAYERS = Object.freeze( [
	HEXEN2_IMPLEMENTED_BUILTINS,
	HEXEN2_WORLD_BUILTINS,
	HEXEN2_PRECACHE_BUILTINS,
	HEXEN2_SERVER_BUILTINS
] );

function unimplemented( number ) {

	return () => PR_RunError( 'Hexen II builtin %i (%s) is not implemented yet', number, Hexen2_BuiltinName( number ) ?? 'unknown' );

}

/**
 * Builds the table for the active profile without installing it, for tests and for callers that want to inspect it.
 *
 * @returns {Array<function(object): void>} Quake's table, or the Hexen II copy
 */
export function PR_ProfileBuiltins() {

	if ( ! GameProfile_IsHexen2() ) return pr_builtin;

	// copy the table Quake installed, so a Hexen layer never mutates pr_builtin for a later Quake program
	const table = pr_builtin.slice();
	const covered = new Set();
	for ( const layer of HEXEN_LAYERS ) for ( const [ key, implementation ] of Object.entries( layer ) ) {

		const number = Number( key );
		table[ number ] = implementation;
		covered.add( number );

	}
	// Quake 2021 defines #79/#80; Hexen's natives are different functions, so never let the Quake ones run when no
	// layer supplies the real ones yet. The same applies to every Hexen number beyond Quake's table.
	for ( const number of [ 79, 80 ] )
		if ( ! covered.has( number ) ) table[ number ] = unimplemented( number );
	for ( let number = 0; number < HEXEN2_BUILTIN_COUNT; number ++ )
		if ( typeof table[ number ] !== 'function' ) table[ number ] = unimplemented( number );
	table.length = HEXEN2_BUILTIN_COUNT;
	return table;

}

/**
 * Installs the active profile's table. Called by `PR_LoadProgs` after the program's CRC has been confirmed, so a Quake
 * program always runs Quake's unchanged table and a Hexen program always runs the shared table with its layers.
 *
 * @returns {Array<function(object): void>} the installed table
 */
export function PR_InstallProfileBuiltins() {

	const table = PR_ProfileBuiltins();
	PR_SetBuiltins( table, table === pr_builtin ? pr_builtin.length : HEXEN2_BUILTIN_COUNT );
	return table;

}
