/**
 * @module engine/server/hexen2_hub
 *
 * Hexen II's hub and save state (uhexen2 engine/hexen2/host_cmd.c: SaveGamestate, LoadGamestate, RestoreClients).
 * A level snapshot is the existing Quake save text (`ED_WriteGlobals`/`ED_Write`), captured per visited level; the
 * client record is the native `clients.gip` form (one edict block per active client plus its spawn parms). Nothing
 * here reads or writes storage: `host_cmd.js` keeps the whole hub in one save slot.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports; each hub is a plain object owned by the caller.
 * Errors: validation returns `{ ok: false, reason }`; malformed ED text propagates from the existing parser.
 */

import { MAX_EDICTS, MAX_LIGHTSTYLES } from '../common/quakedef.js';
import {
	ED_Write, ED_WriteGlobals, ED_ParseGlobals, ED_ParseEdict, ED_NewString, GetEdictFieldValue,
} from '../progs/pr_edict.js';
import {
	EDICT_NUM, EDICT_TO_PROG, PR_GetString, pr_global_struct, G_FLOAT_SET,
} from '../progs/progs.js';
import { OFS_PARM0 } from '../progs/pr_comp.js';
import { PR_ExecuteProgram } from '../progs/pr_exec.js';
import { SV_LinkEdict, SV_UnlinkEdict } from './world.js';
import { Hexen2_IsTempEdict } from '../progs/hexen2_temp_edicts.js';

/** The snapshot schema these records use. */
export const HEXEN2_HUB_SCHEMA = 1;

/** Native `FL_ARCHIVE_OVERRIDE`: cross-level triggers are rebuilt from the globals, never copied (uhexen2 server.h). */
export const FL_ARCHIVE_OVERRIDE = 1048576;

const LEVEL_NAME = /^[a-z0-9_+.-]+$/i;

// The last RestoreClients result, for the console/tests ("ClientReEnter ran for N clients").
let lastClientRestore = null;

function levelKey( name ) { return String( name ?? '' ).trim().toLowerCase(); }

/**
 * A fresh, empty hub record for one session.
 *
 * @returns {{ schema: number, kind: string, savedAt: string, currentLevel: string, levels: object,
 *   clients: ?object, session: ?object }} the hub
 */
export function Hexen2Hub_New() {

	return { schema: HEXEN2_HUB_SCHEMA, kind: 'hexen2-hub', savedAt: new Date().toISOString(),
		currentLevel: '', levels: {}, clients: null, session: null };

}

/**
 * Checks that a record really is a hub this build can read.
 *
 * @param {?object} hub the candidate
 * @returns {{ ok: true } | { ok: false, reason: string }} the check
 */
export function Hexen2Hub_Validate( hub ) {

	if ( hub === null || typeof hub !== 'object' ) return { ok: false, reason: 'no hub record' };
	if ( hub.schema !== HEXEN2_HUB_SCHEMA ) return { ok: false, reason: `unsupported hub schema ${String( hub.schema )}` };
	if ( hub.kind !== 'hexen2-hub' ) return { ok: false, reason: 'not a Hexen II hub record' };
	if ( typeof hub.currentLevel !== 'string' || levelKey( hub.currentLevel ) === '' ) return { ok: false, reason: 'the hub has no current level' };
	if ( hub.levels === null || typeof hub.levels !== 'object' || Array.isArray( hub.levels ) ) return { ok: false, reason: 'the hub has no level table' };
	for ( const [ name, level ] of Object.entries( hub.levels ) ) {

		const valid = Hexen2Hub_ValidateLevel( level );
		if ( !valid.ok ) return { ok: false, reason: `level ${name}: ${valid.reason}` };

	}
	if ( !Object.hasOwn( hub.levels, levelKey( hub.currentLevel ) ) ) return { ok: false, reason: 'the hub does not contain its current level' };
	if ( hub.clients !== null && hub.clients !== undefined ) {

		const valid = Hexen2Hub_ValidateClients( hub.clients );
		if ( !valid.ok ) return { ok: false, reason: valid.reason };

	}
	return { ok: true };

}

/**
 * Checks one level snapshot.
 *
 * @param {?object} level the candidate
 * @returns {{ ok: true } | { ok: false, reason: string }} the check
 */
export function Hexen2Hub_ValidateLevel( level ) {

	if ( level === null || typeof level !== 'object' ) return { ok: false, reason: 'no level snapshot' };
	if ( level.schema !== HEXEN2_HUB_SCHEMA ) return { ok: false, reason: `unsupported level schema ${String( level.schema )}` };
	if ( typeof level.level !== 'string' || !LEVEL_NAME.test( level.level ) ) return { ok: false, reason: 'the level has no valid name' };
	if ( typeof level.globals !== 'string' || level.globals.indexOf( '{' ) < 0 ) return { ok: false, reason: 'the level has no globals' };
	if ( !Array.isArray( level.lightstyles ) || level.lightstyles.length !== MAX_LIGHTSTYLES ) return { ok: false, reason: 'the level has no light styles' };
	if ( !Number.isFinite( level.time ) || level.time < 0 ) return { ok: false, reason: 'the level time is invalid' };
	if ( !Array.isArray( level.edicts ) ) return { ok: false, reason: 'the level has no edicts' };
	for ( const entry of level.edicts ) {

		if ( !Number.isInteger( entry?.num ) || entry.num < 1 || entry.num >= MAX_EDICTS ) return { ok: false, reason: 'an edict number is invalid' };
		if ( typeof entry.text !== 'string' || entry.text.indexOf( '{' ) < 0 ) return { ok: false, reason: `edict ${entry.num} has no body` };

	}
	if ( !Number.isInteger( level.num_edicts ) || level.num_edicts < 1 || level.num_edicts > MAX_EDICTS ) return { ok: false, reason: 'the level edict count is invalid' };
	if ( level.effects !== null && level.effects !== undefined
		&& ( typeof level.effects !== 'object' || !Array.isArray( level.effects.effects ) ) )
		return { ok: false, reason: 'the level effects are malformed' };
	return { ok: true };

}

/**
 * Checks one client record (`clients.gip` plus the client slots' carry-over fields).
 *
 * @param {?object} record the candidate
 * @returns {{ ok: true } | { ok: false, reason: string }} the check
 */
export function Hexen2Hub_ValidateClients( record ) {

	if ( record === null || typeof record !== 'object' ) return { ok: false, reason: 'no client record' };
	if ( !Array.isArray( record.edicts ) ) return { ok: false, reason: 'the client record has no edicts' };
	for ( const entry of record.edicts ) {

		if ( !Number.isInteger( entry?.num ) || entry.num < 1 || entry.num > 64 ) return { ok: false, reason: 'a client edict number is invalid' };
		if ( typeof entry.text !== 'string' || entry.text.indexOf( '{' ) < 0 ) return { ok: false, reason: `client edict ${entry.num} has no body` };

	}
	if ( !Array.isArray( record.slots ) || record.slots.length > 64 ) return { ok: false, reason: 'the client slots are malformed' };
	for ( const slot of record.slots ) {

		if ( !Number.isInteger( slot?.slot ) || slot.slot < 0 || slot.slot > 63 ) return { ok: false, reason: 'a client slot number is invalid' };
		if ( !Array.isArray( slot.spawn_parms ) || slot.spawn_parms.length !== 16 || !slot.spawn_parms.every( Number.isFinite ) )
			return { ok: false, reason: `client ${slot.slot} spawn parms are invalid` };

	}
	return { ok: true };

}

/**
 * Captures the live level in the save-text form SaveGamestate uses: globals, light styles, non-temporary edicts with
 * an explicit number, and the persistent non-edict effects. `FL_ARCHIVE_OVERRIDE` entities are omitted, as native
 * does; the reserved temporary-edict range is omitted too, because those slots are recycled and never archived.
 *
 * @param {object} server the live server state (`sv`)
 * @param {object} clients the server's static state (`svs`), for the temporary-slot range
 * @param {?object} [effects] `Hexen2_SaveEffects()`'s snapshot
 * @returns {object} the level snapshot
 */
export function Hexen2Hub_CaptureLevel( server, clients, effects = null ) {

	const globals = [];
	ED_WriteGlobals( globals );
	const edicts = [];
	for ( let num = 1; num < server.num_edicts; num ++ ) {

		if ( Hexen2_IsTempEdict( num, server, clients ) ) continue;
		const ent = EDICT_NUM( num );
		if ( ent === null || ent === undefined ) continue;
		if ( ( ( ent.v?.flags | 0 ) & FL_ARCHIVE_OVERRIDE ) !== 0 ) continue;
		const lines = [];
		ED_Write( lines, ent );
		edicts.push( { num, text: lines.join( '\n' ) } );

	}
	const lightstyles = new Array( MAX_LIGHTSTYLES );
	for ( let i = 0; i < MAX_LIGHTSTYLES; i ++ ) lightstyles[ i ] = server.lightstyles?.[ i ] ?? null;
	return {
		schema: HEXEN2_HUB_SCHEMA,
		level: String( server.name ?? '' ),
		time: Number( server.time ) || 0,
		startspot: String( server.startspot ?? '' ),
		lightstyles,
		globals: globals.join( '\n' ),
		edicts,
		num_edicts: server.num_edicts | 0,
		effects: effects ?? null,
	};

}

/**
 * Captures the active clients' edicts and carry-over fields, the native `clients.gip` plus `client_t` state.
 *
 * @param {object} server the live server state
 * @param {object} clients the live `svs`
 * @returns {object} the client record
 */
export function Hexen2Hub_CaptureClients( server, clients ) {

	const edicts = [], slots = [];
	for ( let i = 0; i < ( clients.maxclients | 0 ); i ++ ) {

		const client = clients.clients?.[ i ];
		if ( !client?.active || !client.edict ) continue;
		const lines = [];
		ED_Write( lines, client.edict );
		edicts.push( { num: i + 1, text: lines.join( '\n' ) } );
		slots.push( {
			slot: i,
			name: String( client.name ?? '' ),
			colors: client.colors | 0,
			playerclass: client.playerclass | 0,
			spawn_parms: Array.from( client.spawn_parms ?? [], value => Number( value ) || 0 ).slice( 0, 16 ),
		} );

	}
	return { schema: HEXEN2_HUB_SCHEMA, time: Number( server.time ) || 0, edicts, slots };

}

function findModelIndex( server, name ) {

	for ( let i = 1; i < server.model_precache.length && server.model_precache[ i ]; i ++ )
		if ( server.model_precache[ i ] === name ) return i;
	return 0;

}

// ED_ParseEdict expects the text after the opening brace, while ED_Write stores the whole `{ ... }` block.
function edictBody( text ) {

	const opening = text.indexOf( '{' );
	return opening < 0 ? text : text.substring( opening + 1 );

}

function setEntityField( ent, name, value ) {

	const field = GetEdictFieldValue( ent, name );
	if ( field !== null ) field.accessor.setFloat( field.ofs, value );
	return field !== null;

}

/**
 * Restores a level snapshot over a freshly spawned level, as `LoadGamestate` does: the saved globals come first, then
 * every non-free edict is parsed by its explicit number, corrected to this map's model index and linked. `serverflags`
 * and `startspot` keep the values of the transition that is being entered, not the old level's.
 *
 * The caller loads the effects snapshot (`Hexen2_LoadEffects`) and sets `sv.time` from the record.
 *
 * @param {object} server the freshly spawned server state
 * @param {object} clients the live `svs`
 * @param {object} record a validated level snapshot
 * @returns {{ ok: true, count: number } | { ok: false, reason: string }} the result
 */
export function Hexen2Hub_RestoreLevel( server, clients, record ) {

	const valid = Hexen2Hub_ValidateLevel( record );
	if ( !valid.ok ) return valid;

	const opening = record.globals.indexOf( '{' );
	if ( opening < 0 ) return { ok: false, reason: 'the level globals have no opening brace' };
	ED_ParseGlobals( record.globals.substring( opening + 1 ) );
	pr_global_struct.serverflags = clients.serverflags | 0;
	if ( 'startspot' in pr_global_struct ) pr_global_struct.startspot = ED_NewString( String( server.startspot ?? '' ) );

	let highest = server.num_edicts;
	for ( const entry of record.edicts ) {

		const num = entry.num | 0;
		if ( num >= highest ) highest = num + 1;
		if ( server.num_edicts < highest ) server.num_edicts = highest;
		const ent = EDICT_NUM( num );
		if ( ent === null || ent === undefined ) return { ok: false, reason: `edict ${num} is outside the allocated table` };
		ent.free = false;
		ED_ParseEdict( edictBody( entry.text ), ent );
		if ( ent.free ) SV_UnlinkEdict( ent );
		if ( !ent.free ) {

			const model = PR_GetString( ent.v.model );
			if ( model && ent.v.modelindex ) {

				const index = findModelIndex( server, model );
				if ( index ) ent.v.modelindex = index;

			}
			SV_LinkEdict( ent, false );

		}

	}
	// Native never shrinks the fresh map's array: generated edicts and reserved temporary slots above the saved ones
	// stay as the new spawn left them.
	server.num_edicts = Math.max( server.num_edicts, record.num_edicts | 0 );
	for ( let i = 0; i < MAX_LIGHTSTYLES; i ++ ) server.lightstyles[ i ] = record.lightstyles[ i ];
	server.time = record.time;
	pr_global_struct.time = record.time;
	return { ok: true, count: record.edicts.length };

}

/**
 * Restores the client edicts and calls the native `ClientReEnter`, as `RestoreClients` does. Every restored client
 * edict is marked `stats_restored`, so the shared `spawn` command does not run `ClientConnect`/`PutClientInServer`
 * over it. `timeDiff` is the shift the gamecode adds to the player's absolute timers (0 for a same-level restart).
 *
 * @param {object} server the live server state
 * @param {object} clients the live `svs`
 * @param {object} record a client record
 * @param {number} timeDiff `sv.time - old_svtime`
 * @returns {{ ok: true, restored: number, timeDiff: number } | { ok: false, reason: string }} the result
 */
export function Hexen2Hub_RestoreClients( server, clients, record, timeDiff = 0 ) {

	const valid = Hexen2Hub_ValidateClients( record );
	if ( !valid.ok ) return valid;
	const slots = new Map( record.slots.map( slot => [ slot.slot, slot ] ) );
	const active = new Map();
	for ( let i = 0; i < ( clients.maxclients | 0 ); i ++ ) {

		const client = clients.clients?.[ i ];
		if ( !client?.active || !client.edict ) continue;
		active.set( i, client );
		if ( slots.has( i ) ) {

			const saved = slots.get( i );
			client.name = saved.name || client.name;
			client.colors = saved.colors | 0;
			client.playerclass = saved.playerclass | 0;
			for ( let j = 0; j < 16; j ++ ) client.spawn_parms[ j ] = saved.spawn_parms[ j ];

		}

	}

	for ( const entry of record.edicts ) {

		const num = entry.num | 0;
		if ( num < 1 || num > ( clients.maxclients | 0 ) ) continue;
		const client = clients.clients?.[ num - 1 ];
		if ( !client?.active ) continue;
		const ent = EDICT_NUM( num );
		if ( ent === null || ent === undefined ) return { ok: false, reason: `client edict ${num} is outside the allocated table` };
		ent.free = false;
		ED_ParseEdict( edictBody( entry.text ), ent );
		setEntityField( ent, 'stats_restored', 1 );
		if ( ent.free ) SV_UnlinkEdict( ent );
		else SV_LinkEdict( ent, false );
		client.edict = ent;

	}

	let restored = 0;
	for ( const [ slot, client ] of active ) {

		const ent = client.edict;
		if ( !ent ) continue;
		ent.v.team = ( ( client.colors | 0 ) & 15 ) + 1;
		ent.v.netname = ED_NewString( String( client.name ?? '' ) );
		setEntityField( ent, 'playerclass', client.playerclass | 0 );
		for ( let j = 0; j < 16; j ++ ) pr_global_struct[ 'parm' + ( j + 1 ) ] = client.spawn_parms[ j ];
		pr_global_struct.time = server.time;
		pr_global_struct.self = EDICT_TO_PROG( ent );
		G_FLOAT_SET( OFS_PARM0, Number.isFinite( timeDiff ) ? timeDiff : 0 );
		if ( ( pr_global_struct.ClientReEnter | 0 ) !== 0 ) PR_ExecuteProgram( pr_global_struct.ClientReEnter );
		restored ++;

	}
	lastClientRestore = { ok: true, restored, timeDiff: Number( timeDiff ) || 0, time: server.time };
	return lastClientRestore;

}

/** The last `Hexen2Hub_RestoreClients` result (the `ClientReEnter` invocation record), or null. */
export function Hexen2Hub_LastClientRestore() { return lastClientRestore; }

/**
 * Stores a level snapshot under its map name, replacing an earlier visit.
 *
 * @param {object} hub a hub record
 * @param {object} level a captured level
 * @returns {object} the same hub
 */
export function Hexen2Hub_PutLevel( hub, level ) {

	hub.levels[ levelKey( level.level ) ] = level;
	return hub;

}

/**
 * Looks one level up by map name.
 *
 * @param {?object} hub a hub record
 * @param {string} name the map name
 * @returns {?object} the snapshot, or null
 */
export function Hexen2Hub_GetLevel( hub, name ) {

	return hub?.levels?.[ levelKey( name ) ] ?? null;

}

/**
 * The number of visited levels in a hub.
 *
 * @param {?object} hub a hub record
 * @returns {number} the count
 */
export function Hexen2Hub_LevelCount( hub ) { return hub && typeof hub.levels === 'object' ? Object.keys( hub.levels ).length : 0; }

