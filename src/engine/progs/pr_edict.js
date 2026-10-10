/**
 * @module engine/progs/pr_edict
 *
 * The entity dictionary (WinQuake pr_edict.c): loading progs.dat, allocating and freeing edicts, parsing entity text
 * from maps and saves, writing saves, and Newer Game's private save keys (respawn, axe halves, rend veil, face
 * seeds).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `pr_extra_strings`, `pr_extra_strings_offset`, `deathmatch`,
 * `current_skill`, `functionIndex`, `functionIndexFor`, `gefvCache_rep`, `growBuf`, `growLen`, `growView`.
 *
 * Errors: calls `Sys_Error` (fatal) at 14 places.
 *
 * Newer Game's private save keys (`_newer_face_seed`, `_newer_axe_corpse`, `_clockwise_*`, the rend veil) are parsed
 * here; a malformed one is ignored and the native fields still load.
 */
import { Face_Seed, Face_ParseSeed, Face_Assign } from '../common/hooks.js'; // installed by newer/render/enemy_face.js
import { Rend_ValidRecord, Rend_ParseRecord } from '../common/hooks.js'; // installed by newer/gameplay/sv_rendveil.js
import { Respawn_ParseDrop, Respawn_ParsePlayer, Respawn_ParseRemains } from '../common/hooks.js'; // installed by newer/gameplay/respawn_record.js
// Ported from: WinQuake/pr_edict.c -- entity dictionary

import { Sys_Error } from '../common/sys.js';
import { Con_Printf, Con_DPrintf, COM_Parse, com_token } from '../common/common.js';
import { Cmd_AddCommand, Cmd_Argv } from '../common/cmd.js';
import { cvar_t, Cvar_RegisterVariable } from '../common/cvar.js';
import { CRC_Init, CRC_ProcessByte, CRC_Value } from '../common/crc.js';
import { MAX_EDICTS } from '../common/quakedef.js';
import {
	dprograms_t, dfunction_t, ddef_t, dstatement_t,
	DEF_SAVEGLOBAL, MAX_PARMS, PROG_VERSION,
	ev_void, ev_string, ev_float, ev_vector, ev_entity,
	ev_field, ev_function, ev_pointer,
	OFS_RETURN, OFS_PARM0,
} from './pr_comp.js';
import { PROGHEADER_CRC } from './progdefs.js';
import { globalvars_t, entvars_t } from './progdefs.js';
import {
	progs, pr_functions, pr_strings, pr_strings_data,
	pr_globaldefs, pr_fielddefs, pr_statements,
	pr_global_struct, pr_globals, pr_globals_float, pr_globals_int,
	pr_edict_size, pr_crc, type_size,
	PR_SetProgs, PR_SetFunctions, PR_SetStrings, PR_SetStringsData,
	PR_SetGlobalDefs, PR_SetFieldDefs, PR_SetStatements,
	PR_SetGlobalStruct, PR_SetGlobals, PR_SetGlobalsFloat, PR_SetGlobalsInt,
	PR_SetEdictSize, PR_SetCRC, PR_SetStringTempOfs,
	EdictFieldAccessor, edict_t,
	PR_GetString, G_FLOAT, G_INT, G_STRING, G_EDICT, G_EDICTNUM,
	EDICT_NUM, NUM_FOR_EDICT, EDICT_TO_PROG, PROG_TO_EDICT,
	E_STRING, E_INT, E_FLOAT,
	sv, svs, PR_SetSV,
	RETURN_EDICT,
} from './progs.js';
import { PR_ExecuteProgram } from './pr_exec.js';
import { SV_PinnedZombieSpawned } from '../common/hooks.js'; // installed by newer/gameplay/sv_pinnedzombies.js
import { Axe_ParseRecord, Axe_ValidOwnerKey } from '../common/hooks.js'; // installed by newer/gameplay/axe_record.js
import { SV_AxeReset } from '../common/hooks.js'; // installed by newer/gameplay/sv_axecut.js

//============================================================================
// Module state
//============================================================================

const MAX_FIELD_LEN = 64;
const GEFV_CACHESIZE = 2;

const gefvCache = [
	{ pcache: null, field: '' },
	{ pcache: null, field: '' },
];

// Extra strings allocated by ED_NewString (stored separately from progs.dat string table)
let pr_extra_strings = [];
let pr_extra_strings_offset = 0; // starting offset (set after progs load)

//============================================================================
// Cvar stubs (will be replaced when cvar system is connected)
//============================================================================

const nomonsters = new cvar_t( 'nomonsters', '0' );
const gamecfg = new cvar_t( 'gamecfg', '0' );
const scratch1 = new cvar_t( 'scratch1', '0' );
const scratch2 = new cvar_t( 'scratch2', '0' );
const scratch3 = new cvar_t( 'scratch3', '0' );
const scratch4 = new cvar_t( 'scratch4', '0' );
const savedgamecfg = new cvar_t( 'savedgamecfg', '0', true );
const saved1 = new cvar_t( 'saved1', '0', true );
const saved2 = new cvar_t( 'saved2', '0', true );
const saved3 = new cvar_t( 'saved3', '0', true );
const saved4 = new cvar_t( 'saved4', '0', true );

// Spawn flag constants
const SPAWNFLAG_NOT_EASY = 256;
const SPAWNFLAG_NOT_MEDIUM = 512;
const SPAWNFLAG_NOT_HARD = 1024;
const SPAWNFLAG_NOT_DEATHMATCH = 2048;

// Movetype constant needed by ED_Count
const MOVETYPE_STEP = 4;

// deathmatch cvar reference (stub)
let deathmatch = { value: 0 };
let current_skill = 0;

/**
 * Gives this module the `deathmatch` cvar, read by `ED_LoadFromFile` to drop "not in deathmatch" entities. Called
 * once by `SV_Init`; until then a stub with value 0 is used.
 *
 * @param {cvar_t} dm the `deathmatch` cvar (only `value` is read)
 */
export function PR_SetDeathmatch( dm ) { deathmatch = dm; }
/**
 * Tells this module the skill of the map being spawned, read by `ED_LoadFromFile` to drop entities flagged not for
 * that skill. Called by `SV_SpawnServer` before the entities load.
 *
 * @param {number} s skill 0..3 (0 easy, 1 normal, 2 hard, 3 nightmare; 2 and above use the hard flag)
 */
export function PR_SetCurrentSkill( s ) { current_skill = s; }

/*
=================
ED_ClearEdict
=================
*/
/**
 * Sets everything to NULL (WinQuake pr_edict.c): zeroes all QuakeC fields and Newer Game's private records through
 * `edict_t.clearFields`, and marks the edict in use. Called by `ED_Alloc` and by `SV_SpawnServer` for the world.
 *
 * @param {edict_t} e edict to clear; mutated
 */
export function ED_ClearEdict( e ) {

	e.clearFields();
	e.free = false;

}

/*
=================
ED_Alloc
=================
*/
/**
 * Either finds a free edict, or allocates a new one (WinQuake pr_edict.c). Used by the QuakeC `spawn` builtin, by
 * `ED_LoadFromFile` for every map entity after the world, and by Newer Game's server modules. Try to avoid reusing an
 * entity that was recently freed, because it can cause the client to think the entity morphed into something else
 * instead of being removed and recreated, which can cause interpolated angles and bad trails: a free edict is reused
 * only if it was freed more than 0.5 seconds ago, or during the first 2 seconds of server time (which can involve a
 * lot of freeing and allocating). Client slots and the world (0..`svs.maxclients`) are never returned.
 *
 * @returns {edict_t} a cleared edict (`ED_ClearEdict`); a new one raises `sv.num_edicts`
 * @throws {Error} via `Sys_Error` when all `MAX_EDICTS` edicts are in use
 */
export function ED_Alloc() {

	let i;
	let e;

	// skip clients + world entity
	for ( i = svs.maxclients + 1; i < sv.num_edicts; i ++ ) {

		e = EDICT_NUM( i );
		// the first couple seconds of server time can involve a lot of
		// freeing and allocating, so relax the replacement policy
		if ( e.free && ( e.freetime < 2 || sv.time - e.freetime > 0.5 ) ) {

			ED_ClearEdict( e );
			return e;

		}

	}

	if ( i === MAX_EDICTS )
		Sys_Error( 'ED_Alloc: no free edicts' );

	sv.num_edicts ++;
	e = EDICT_NUM( i );
	ED_ClearEdict( e );

	return e;

}

/*
=================
ED_Free
=================
*/
/**
 * Marks the edict as free (WinQuake pr_edict.c). Used by the QuakeC `remove` builtin, by `ED_LoadFromFile` for
 * inhibited or spawnless entities, and by Newer Game's server modules.
 *
 * First, if the edict is an axe-cut corpse or owner, any edicts it was hiding are un-hidden (pending, not
 * successfully constructed, cut replacements retain the native death; their links are retired before this cosmetic
 * edict index can be reused). It is unlinked from the world through `sv.SV_UnlinkEdict` only when that hook is set
 * on `sv` (no engine module sets it at present). Then the fields the client sees are reset (model, modelindex, skin,
 * frame, colormap, origin, angles, takedamage, solid; `nextthink` to -1) and `freetime` is set to `sv.time` for the
 * reuse delay in `ED_Alloc`.
 *
 * @param {edict_t} ed edict to free; mutated
 */
export function ED_Free( ed ) {
	// Pending (not successfully constructed) cut replacements retain the native
	// death. Retire their links before this cosmetic edict index can be reused.
	if(ed._axeCorpse||ed._axeOwnerKey)for(const e of sv.edicts||[])if(e&&e._axeSuppressedBy===ed.index){e._axeSuppressed=false;e._axeSuppressedBy=0;e._axeOwnerKey=null;}

	if ( sv.SV_UnlinkEdict ) {

		sv.SV_UnlinkEdict( ed );

	}

	ed.free = true;
	ed.v.model = 0;
	ed.v.takedamage = 0;
	ed.v.modelindex = 0;
	ed.v.colormap = 0;
	ed.v.skin = 0;
	ed.v.frame = 0;
	const origin = ed.v.origin;
	origin[ 0 ] = 0; origin[ 1 ] = 0; origin[ 2 ] = 0;
	const angles = ed.v.angles;
	angles[ 0 ] = 0; angles[ 1 ] = 0; angles[ 2 ] = 0;
	ed.v.nextthink = - 1;
	ed.v.solid = 0;

	ed.freetime = sv.time;

}

//===========================================================================

/*
============
ED_GlobalAtOfs
============
*/
/**
 * Finds the global definition at a globals offset (WinQuake pr_edict.c), by linear search. Used by
 * `PR_GlobalString` and `PR_GlobalStringNoContents` for statement dumps.
 *
 * @param {number} ofs globals slot (32-bit words)
 * @returns {?ddef_t} the first global def at that offset, or null when none
 */
export function ED_GlobalAtOfs( ofs ) {

	for ( let i = 0; i < progs.numglobaldefs; i ++ ) {

		const def = pr_globaldefs[ i ];
		if ( def.ofs === ofs )
			return def;

	}

	return null;

}

/*
============
ED_FieldAtOfs
============
*/
/**
 * Finds the entity field definition at a field offset (WinQuake pr_edict.c), by linear search. Used to print and
 * save `.field` values.
 *
 * @param {number} ofs field slot within an edict (32-bit words)
 * @returns {?ddef_t} the first field def at that offset, or null when none
 */
export function ED_FieldAtOfs( ofs ) {

	for ( let i = 0; i < progs.numfielddefs; i ++ ) {

		const def = pr_fielddefs[ i ];
		if ( def.ofs === ofs )
			return def;

	}

	return null;

}

/*
============
ED_FindField
============
*/
/**
 * Finds an entity field definition by name (WinQuake pr_edict.c), by linear search over the loaded progs. Used when
 * parsing entity text, by `GetEdictFieldValue` and by builtins that take field names.
 *
 * @param {string} name QuakeC field name, e.g. `origin`
 * @returns {?ddef_t} the field def, or null when the progs has no such field
 */
export function ED_FindField( name ) {

	for ( let i = 0; i < progs.numfielddefs; i ++ ) {

		const def = pr_fielddefs[ i ];
		if ( PR_GetString( def.s_name ) === name )
			return def;

	}

	return null;

}

/*
============
ED_FindGlobal
============
*/
/**
 * Finds a global definition by name (WinQuake pr_edict.c), by linear search over the loaded progs. Used by
 * `ED_ParseGlobals` when loading a save.
 *
 * @param {string} name QuakeC global name
 * @returns {?ddef_t} the global def, or null when the progs has no such global
 */
export function ED_FindGlobal( name ) {

	for ( let i = 0; i < progs.numglobaldefs; i ++ ) {

		const def = pr_globaldefs[ i ];
		if ( PR_GetString( def.s_name ) === name )
			return def;

	}

	return null;

}

/*
============
ED_FindFunction
============
*/
let functionIndex = null;
let functionIndexFor = null;

/**
 * Finds a QuakeC function by name (WinQuake pr_edict.c). Looked up by name for every entity of a level (its spawn
 * function), so the functions are indexed in a Map once per progs; the index is rebuilt when `pr_functions` is
 * replaced by a new `PR_LoadProgs`. When two functions share a name, the first one wins.
 *
 * @param {string} name function name, e.g. a classname such as `monster_ogre`
 * @returns {?dfunction_t} the function, or null when there is none
 */
export function ED_FindFunction( name ) {

	// looked up by name for every entity of a level: index them once per progs
	if ( functionIndex === null || functionIndexFor !== pr_functions ) {

		functionIndex = new Map();
		functionIndexFor = pr_functions;

		for ( let i = progs.numfunctions - 1; i >= 0; i -- )
			functionIndex.set( PR_GetString( pr_functions[ i ].s_name ), pr_functions[ i ] ); // the first one wins

	}

	const func = functionIndex.get( name );
	return func === undefined ? null : func;

}

/*
============
GetEdictFieldValue
============
*/
let gefvCache_rep = 0;

/**
 * Finds a QuakeC field of an edict by name, for fields the engine does not know at compile time (WinQuake
 * pr_edict.c), e.g. `items2` for the status bar or `air_finished`. The last two names looked up (found or not, if
 * shorter than 64 characters) are cached; `PR_LoadProgs` flushes the cache.
 *
 * @param {edict_t} ed edict whose field to locate
 * @param {string} field QuakeC field name
 * @returns {?{ accessor: EdictFieldAccessor, ofs: number }} the edict's field accessor and the field's slot (32-bit
 *   words; read with `getFloat`/`getInt32`), or null when the progs has no such field
 */
export function GetEdictFieldValue( ed, field ) {

	let def = null;

	for ( let i = 0; i < GEFV_CACHESIZE; i ++ ) {

		if ( field === gefvCache[ i ].field ) {

			def = gefvCache[ i ].pcache;
			if ( ! def )
				return null;
			return { accessor: ed._fieldAccessor, ofs: def.ofs };

		}

	}

	def = ED_FindField( field );

	if ( field.length < MAX_FIELD_LEN ) {

		gefvCache[ gefvCache_rep ].pcache = def;
		gefvCache[ gefvCache_rep ].field = field;
		gefvCache_rep ^= 1;

	}

	if ( ! def )
		return null;

	return { accessor: ed._fieldAccessor, ofs: def.ofs };

}

/*
============
PR_ValueString
=============
*/
/**
 * Returns a string describing *data in a type specific manner (WinQuake pr_edict.c), for debugging prints
 * (`ED_Print`, `PR_GlobalString`). Floats and vectors are shown with one decimal; entities as `entity N`; functions
 * as `name()`; fields as `.name`.
 *
 * @param {number} type `ev_*` type; the `DEF_SAVEGLOBAL` bit is ignored
 * @param {EdictFieldAccessor} accessor slots to read (an edict's fields or `pr_globals`)
 * @param {number} ofs slot of the value (32-bit words)
 * @returns {string} the description; `bad type N` for an unknown type
 */
export function PR_ValueString( type, accessor, ofs ) {

	type &= ~ DEF_SAVEGLOBAL;

	switch ( type ) {

		case ev_string:
			return PR_GetString( accessor.getInt32( ofs ) );
		case ev_entity:
			return 'entity ' + accessor.getInt32( ofs );
		case ev_function: {

			const f = pr_functions[ accessor.getInt32( ofs ) ];
			return PR_GetString( f.s_name ) + '()';

		}

		case ev_field: {

			const def = ED_FieldAtOfs( accessor.getInt32( ofs ) );
			return '.' + PR_GetString( def.s_name );

		}

		case ev_void:
			return 'void';
		case ev_float:
			return accessor.getFloat( ofs ).toFixed( 1 );
		case ev_vector: {

			const v = accessor.getVector( ofs );
			return '\'' + v[ 0 ].toFixed( 1 ) + ' ' + v[ 1 ].toFixed( 1 ) + ' ' + v[ 2 ].toFixed( 1 ) + '\'';

		}

		case ev_pointer:
			return 'pointer';
		default:
			return 'bad type ' + type;

	}

}

/*
============
PR_UglyValueString
=============
*/
/**
 * Returns a string describing *data in a type specific manner, easier to parse than PR_ValueString (WinQuake
 * pr_edict.c). Used for savegames (`ED_Write`, `ED_WriteGlobals`), so the output reads back through `ED_ParseEpair`:
 * full-precision numbers, entity numbers, bare function and field names.
 *
 * @param {number} type `ev_*` type; the `DEF_SAVEGLOBAL` bit is ignored
 * @param {EdictFieldAccessor} accessor slots to read
 * @param {number} ofs slot of the value (32-bit words)
 * @returns {string} the value text; `bad type N` for pointers and unknown types
 */
export function PR_UglyValueString( type, accessor, ofs ) {

	type &= ~ DEF_SAVEGLOBAL;

	switch ( type ) {

		case ev_string:
			return PR_GetString( accessor.getInt32( ofs ) );
		case ev_entity:
			return '' + accessor.getInt32( ofs );
		case ev_function: {

			const f = pr_functions[ accessor.getInt32( ofs ) ];
			return PR_GetString( f.s_name );

		}

		case ev_field: {

			const def = ED_FieldAtOfs( accessor.getInt32( ofs ) );
			return PR_GetString( def.s_name );

		}

		case ev_void:
			return 'void';
		case ev_float:
			return '' + accessor.getFloat( ofs );
		case ev_vector: {

			const v = accessor.getVector( ofs );
			return v[ 0 ] + ' ' + v[ 1 ] + ' ' + v[ 2 ];

		}

		default:
			return 'bad type ' + type;

	}

}

/*
============
PR_GlobalString
============
*/
/**
 * Returns a string with a description and the contents of a global, padded to 20 field width (WinQuake
 * pr_edict.c), for statement dumps: `ofs(name)value`, or `ofs(???)` when no global is defined there. (pr_exec.js
 * currently uses its own placeholder of the same name rather than this one.)
 *
 * @param {number} ofs globals slot (32-bit words)
 * @returns {string} the description, space-padded to at least 20 characters plus one space
 */
export function PR_GlobalString( ofs ) {

	const def = ED_GlobalAtOfs( ofs );
	let line;

	if ( ! def ) {

		line = ofs + '(???)';

	} else {

		const s = PR_ValueString( def.type, pr_globals, ofs );
		line = ofs + '(' + PR_GetString( def.s_name ) + ')' + s;

	}

	while ( line.length < 20 )
		line += ' ';
	line += ' ';

	return line;

}

/**
 * Like `PR_GlobalString` but without the value (WinQuake pr_edict.c): `ofs(name)` or `ofs(???)`, padded to 20 field
 * width, for statement operands that are written rather than read.
 *
 * @param {number} ofs globals slot (32-bit words)
 * @returns {string} the description, space-padded to at least 20 characters plus one space
 */
export function PR_GlobalStringNoContents( ofs ) {

	const def = ED_GlobalAtOfs( ofs );
	let line;

	if ( ! def ) {

		line = ofs + '(???)';

	} else {

		line = ofs + '(' + PR_GetString( def.s_name ) + ')';

	}

	while ( line.length < 20 )
		line += ' ';
	line += ' ';

	return line;

}

/*
=============
ED_Print
=============
*/
/**
 * For debugging (WinQuake pr_edict.c): prints an edict's number and every non-zero field to the console, skipping
 * the `_x`/`_y`/`_z` vector component names; a free edict prints `FREE`. Used through `ED_PrintNum` (the
 * `edict`/`edicts` commands, the `eprint` builtin), by the `error`/`objerror` builtins, by `PR_ExecuteProgram` for a
 * bad function number, and by `ED_LoadFromFile` for rejected entities.
 *
 * @param {edict_t} ed edict to print
 * @throws {Error} from `NUM_FOR_EDICT` when `ed` is not one of the first `sv.num_edicts` edicts
 */
export function ED_Print( ed ) {

	if ( ed.free ) {

		Con_Printf( 'FREE\n' );
		return;

	}

	Con_Printf( '\nEDICT %i:\n', NUM_FOR_EDICT( ed ) );

	for ( let i = 1; i < progs.numfielddefs; i ++ ) {

		const d = pr_fielddefs[ i ];
		const name = PR_GetString( d.s_name );
		if ( name.length >= 2 && name[ name.length - 2 ] === '_' )
			continue; // skip _x, _y, _z vars

		// if the value is still all 0, skip the field
		const type = d.type & ~ DEF_SAVEGLOBAL;
		let allZero = true;

		for ( let j = 0; j < type_size[ type ]; j ++ ) {

			if ( ed._fieldAccessor.getInt32( d.ofs + j ) !== 0 ) {

				allZero = false;
				break;

			}

		}

		if ( allZero )
			continue;

		let line = name;
		while ( line.length < 15 )
			line += ' ';

		line += PR_ValueString( d.type, ed._fieldAccessor, d.ofs );

		Con_Printf( '%s\n', line );

	}

}

/*
=============
ED_Write
=============
*/
/**
 * For savegames (WinQuake pr_edict.c): appends one edict as `{`, `"key" "value"` lines and `}`. A free edict writes
 * an empty `{ }`. Before the native fields it writes Newer Game's private keys when present: `_newer_rend_veil` (only
 * for a living edict still on the veiled model), `_newer_face_seed`, `_clockwise_player`, `_cheat_powers`,
 * `_clockwise_drop`, `_clockwise_remains`, `_newer_axe_corpse` (or `invalid`, to retain fallback ownership across
 * re-saving), `_newer_axe_hidden` and `_newer_axe_owner`. Native fields are written with `PR_UglyValueString`,
 * skipping all-zero values and `_x`/`_y`/`_z` names. Used by `Host_Savegame_f` and the seamless level transfer.
 *
 * @param {Array<string>} lines output lines; appended to
 * @param {edict_t} ed edict to write
 */
export function ED_Write( lines, ed ) {

	lines.push( '{' );

	if ( ed.free ) {

		lines.push( '}' );
		return;

	}

	if(Rend_ValidRecord(ed._rendVeil)&&ed.v.health>0&&PR_GetString(ed.v.model)===ed._rendVeil.model)lines.push('"_newer_rend_veil" "'+encodeURIComponent(JSON.stringify(ed._rendVeil))+'"');
	if(Face_Seed(ed._faceSeed)!==null)lines.push('"_newer_face_seed" "'+ed._faceSeed+'"');
	if(ed._respawn)lines.push('"_clockwise_player" "'+encodeURIComponent(JSON.stringify(ed._respawn))+'"');
	if(ed._cheatPowers)lines.push('"_cheat_powers" "'+(ed._cheatPowers|0)+'"');
	if(ed._respawnDrop)lines.push('"_clockwise_drop" "'+encodeURIComponent(JSON.stringify(ed._respawnDrop))+'"');
	if(ed._respawnRemains)lines.push('"_clockwise_remains" "'+encodeURIComponent(JSON.stringify(ed._respawnRemains))+'"');
	if(ed._axeCorpse)lines.push('"_newer_axe_corpse" "'+encodeURIComponent(JSON.stringify(ed._axeCorpse))+'"');
	else if(ed._axeInvalidRecord)lines.push('"_newer_axe_corpse" "invalid"'); // retain fallback ownership across re-saving
	if(ed._axeSuppressed)lines.push('"_newer_axe_hidden" "'+(ed._axeSuppressedBy||-1)+'"');
	if(Axe_ValidOwnerKey(ed._axeOwnerKey))lines.push('"_newer_axe_owner" "'+ed._axeOwnerKey+'"');
	for ( let i = 1; i < progs.numfielddefs; i ++ ) {

		const d = pr_fielddefs[ i ];
		const name = PR_GetString( d.s_name );
		if ( name.length >= 2 && name[ name.length - 2 ] === '_' )
			continue; // skip _x, _y, _z vars

		const type = d.type & ~ DEF_SAVEGLOBAL;
		let allZero = true;

		for ( let j = 0; j < type_size[ type ]; j ++ ) {

			if ( ed._fieldAccessor.getInt32( d.ofs + j ) !== 0 ) {

				allZero = false;
				break;

			}

		}

		if ( allZero )
			continue;

		lines.push( '"' + name + '" "' + PR_UglyValueString( d.type, ed._fieldAccessor, d.ofs ) + '"' );

	}

	lines.push( '}' );

}

/**
 * Prints edict number `ent` with `ED_Print` (WinQuake pr_edict.c). Used by the `edict` and `edicts` commands and the
 * `eprint` builtin.
 *
 * @param {number} ent edict number, 0..`sv.max_edicts`-1
 * @throws {Error} from `EDICT_NUM` for a number out of range
 */
export function ED_PrintNum( ent ) {

	ED_Print( EDICT_NUM( ent ) );

}

/*
=============
ED_PrintEdict_f

For debugging, prints a single edict
=============
*/
function ED_PrintEdict_f() {

	const i = parseInt( Cmd_Argv( 1 ) ) || 0;
	if ( i >= sv.num_edicts ) {

		Con_Printf( 'Bad edict number\n' );
		return;

	}

	ED_PrintNum( i );

}

/*
=============
ED_PrintEdicts
=============
*/
/**
 * Console command `edicts`. For debugging, prints all the entities in the current server (WinQuake pr_edict.c).
 */
export function ED_PrintEdicts() {

	Con_Printf( '%i entities\n', sv.num_edicts );
	for ( let i = 0; i < sv.num_edicts; i ++ )
		ED_PrintNum( i );

}

/*
=============
ED_Count
=============
*/
/**
 * Console command `edictcount`. For debugging (WinQuake pr_edict.c): prints `sv.num_edicts` and how many edicts are
 * in use, have a model ("view"), are solid ("touch") and use `MOVETYPE_STEP`.
 */
export function ED_Count() {

	let active = 0, models = 0, solid = 0, step = 0;

	for ( let i = 0; i < sv.num_edicts; i ++ ) {

		const ent = EDICT_NUM( i );
		if ( ent.free )
			continue;
		active ++;
		if ( ent.v.solid )
			solid ++;
		if ( ent.v.model )
			models ++;
		if ( ent.v.movetype === MOVETYPE_STEP )
			step ++;

	}

	Con_Printf( 'num_edicts:%3i\n', sv.num_edicts );
	Con_Printf( 'active    :%3i\n', active );
	Con_Printf( 'view      :%3i\n', models );
	Con_Printf( 'touch     :%3i\n', solid );
	Con_Printf( 'step      :%3i\n', step );

}

/*
==============================================================================

					ARCHIVING GLOBALS

FIXME: need to tag constants, doesn't really work
==============================================================================
*/

/*
=============
ED_WriteGlobals
=============
*/
/**
 * Appends the saved globals to a savegame (WinQuake pr_edict.c) as `{`, `"name" "value"` lines and `}`. Only globals
 * flagged `DEF_SAVEGLOBAL` of type string, float or entity are written (the source notes "need to tag constants,
 * doesn't really work"). Used by `Host_Savegame_f` and the seamless level transfer.
 *
 * @param {Array<string>} lines output lines; appended to
 */
export function ED_WriteGlobals( lines ) {

	lines.push( '{' );

	for ( let i = 0; i < progs.numglobaldefs; i ++ ) {

		const def = pr_globaldefs[ i ];
		let type = def.type;

		if ( ! ( def.type & DEF_SAVEGLOBAL ) )
			continue;
		type &= ~ DEF_SAVEGLOBAL;

		if ( type !== ev_string && type !== ev_float && type !== ev_entity )
			continue;

		const name = PR_GetString( def.s_name );
		lines.push( '"' + name + '" "' + PR_UglyValueString( type, pr_globals, def.ofs ) + '"' );

	}

	lines.push( '}' );

}

/*
=============
ED_ParseGlobals
=============
*/
/**
 * Reads the globals block of a savegame back into `pr_globals` (WinQuake pr_edict.c). Expects the text just after
 * the opening `{` and reads key/value pairs up to the closing `}`; names that are not globals are reported on the
 * console and skipped. Used by `Host_Loadgame_f` and the seamless level transfer.
 *
 * @param {string} data save text positioned after the block's `{`
 * @throws {Error} via `Sys_Error` on end of text without a closing brace, a closing brace without data (both
 *   messages say ED_ParseEntity, as in the source), or a value that does not parse
 */
export function ED_ParseGlobals( data ) {

	while ( true ) {

		// parse key
		data = COM_Parse( data );
		if ( com_token === '}' )
			break;
		if ( data === null )
			Sys_Error( 'ED_ParseEntity: EOF without closing brace' );

		const keyname = com_token;

		// parse value
		data = COM_Parse( data );
		if ( data === null )
			Sys_Error( 'ED_ParseEntity: EOF without closing brace' );

		if ( com_token === '}' )
			Sys_Error( 'ED_ParseEntity: closing brace without data' );

		const key = ED_FindGlobal( keyname );
		if ( ! key ) {

			Con_Printf( '\'%s\' is not a global\n', keyname );
			continue;

		}

		if ( ! ED_ParseEpair( pr_globals, key, com_token ) ) {

			Sys_Error( 'ED_ParseGlobals: parse error' );

		}

	}

}

//============================================================================

/*
=============
ED_NewString
=============
*/
let growBuf = null;
let growLen = 0;
let growView = null;

/**
 * Returns an offset into the string table for a newly allocated string (WinQuake pr_edict.c). Handles backslash-n
 * escape sequences (a backslash then `n` becomes a newline; a backslash then any other character becomes a
 * single backslash, dropping that character). Used for every string value parsed from map or save text, and by Newer
 * Game code that spawns entities.
 *
 * The string is appended NUL-terminated to the progs string data, which grows in place (doubling) rather than being
 * copied for every string, since a level's entities add thousands; `pr_strings_data` is replaced by a longer view
 * each call. Strings are never freed; they last until the next `PR_LoadProgs`.
 *
 * @param {string} string text to store
 * @returns {number} byte offset of the new string in `pr_strings_data`, for `PR_GetString` and string fields
 */
export function ED_NewString( string ) {

	// Use array + join() instead of string concatenation to avoid O(n²) allocations
	const chars = [];

	for ( let i = 0; i < string.length; i ++ ) {

		if ( string[ i ] === '\\' && i < string.length - 1 ) {

			i ++;
			if ( string[ i ] === 'n' )
				chars.push( '\n' );
			else
				chars.push( '\\' );

		} else {

			chars.push( string[ i ] );

		}

	}

	const result = chars.join( '' );

	// Store in extra strings and return an offset
	const ofs = pr_extra_strings_offset + pr_extra_strings.length;
	pr_extra_strings.push( result );

	// Patch into the string data so PR_GetString can find it.  The table grows in
	// place (doubling), not by copying the whole of it for every string: a level's
	// entities add thousands of them.
	const encoded = new TextEncoder().encode( result + '\0' );

	if ( growView === null || pr_strings_data !== growView ) {

		// a new progs (or someone else replaced the table): start from what is there
		growBuf = new Uint8Array( Math.max( pr_strings_data.length * 2, pr_strings_data.length + 65536 ) );
		growBuf.set( pr_strings_data );
		growLen = pr_strings_data.length;

	}

	if ( growLen + encoded.length > growBuf.length ) {

		const bigger = new Uint8Array( ( growLen + encoded.length ) * 2 );
		bigger.set( growBuf.subarray( 0, growLen ) );
		growBuf = bigger;

	}

	growBuf.set( encoded, growLen );
	const newOfs = growLen;
	growLen += encoded.length;

	growView = growBuf.subarray( 0, growLen );
	PR_SetStringsData( growView );

	return newOfs;

}

/*
=============
ED_ParseEpair
=============
*/
/**
 * Stores one key's value text into a field or global (WinQuake pr_edict.c). Can parse either fields or globals.
 * Strings go through `ED_NewString`; vectors are three space-separated numbers (missing parts become 0); entities
 * are edict numbers; fields and functions are looked up by name.
 *
 * @param {EdictFieldAccessor} accessor where to write: an edict's `_fieldAccessor` or `pr_globals`
 * @param {ddef_t} key definition of the field or global (its `type` and `ofs`)
 * @param {string} s value text
 * @returns {boolean} false if error (unknown field or function name, reported on the console), otherwise true
 * @throws {Error} from `EDICT_NUM` when an entity number is out of range
 */
export function ED_ParseEpair( accessor, key, s ) {

	const ofs = key.ofs;

	switch ( key.type & ~ DEF_SAVEGLOBAL ) {

		case ev_string:
			accessor.setInt32( ofs, ED_NewString( s ) );
			break;

		case ev_float:
			accessor.setFloat( ofs, parseFloat( s ) );
			break;

		case ev_vector: {

			const parts = s.split( ' ' );
			accessor.setFloat( ofs, parseFloat( parts[ 0 ] ) || 0 );
			accessor.setFloat( ofs + 1, parseFloat( parts[ 1 ] ) || 0 );
			accessor.setFloat( ofs + 2, parseFloat( parts[ 2 ] ) || 0 );
			break;

		}

		case ev_entity:
			accessor.setInt32( ofs, EDICT_TO_PROG( EDICT_NUM( parseInt( s ) ) ) );
			break;

		case ev_field: {

			const def = ED_FindField( s );
			if ( ! def ) {

				Con_Printf( 'Can\'t find field %s\n', s );
				return false;

			}

			accessor.setInt32( ofs, pr_globals_int[ def.ofs ] );
			break;

		}

		case ev_function: {

			const func = ED_FindFunction( s );
			if ( ! func ) {

				Con_Printf( 'Can\'t find function %s\n', s );
				return false;

			}

			accessor.setInt32( ofs, pr_functions.indexOf( func ) );
			break;

		}

		default:
			break;

	}

	return true;

}

/*
====================
ED_ParseEdict
====================
*/
/**
 * Parses an edict out of the given string, returning the new position (WinQuake pr_edict.c). `ent` should be a
 * properly initialized empty edict; it is cleared first unless it is the world (a hack kept from the source). Used
 * for initial level load (`ED_LoadFromFile`) and for savegames (`Host_Loadgame_f`, the seamless level transfer).
 *
 * Key hacks from the source: `angle` becomes `angles` as `0 <angle> 0` (to allow QuakeEd to write single scalar
 * angles), `light` becomes `light_lev`, and trailing spaces are trimmed from key names. Newer Game's private keys
 * (`_newer_*`, `_clockwise_*`, `_cheat_powers`) are parsed into the edict's private records; a malformed one is
 * ignored. Other keys with a leading underscore are utility comments and are discarded, and unknown fields are
 * reported on the console. An entity with no keys is marked free; otherwise its face seed is assigned (legacy or
 * malformed cosmetic metadata gets one new server identity, since a normal save restore does not execute the QuakeC
 * setmodel spawn hook).
 *
 * @param {string} data entity text positioned after the opening `{`
 * @param {edict_t} ent edict to fill; mutated
 * @returns {?string} the remaining text after the closing `}`
 * @throws {Error} via `Sys_Error` on end of text without a closing brace, a closing brace without data, or a value
 *   that does not parse
 */
export function ED_ParseEdict( data, ent ) {

	let anglehack;
	let init = false;

	// clear it
	if ( ent !== sv.edicts[ 0 ] ) // hack
		ent.clearFields();

	// go through all the dictionary pairs
	while ( true ) {

		// parse key
		data = COM_Parse( data );
		if ( com_token === '}' )
			break;
		if ( data === null )
			Sys_Error( 'ED_ParseEntity: EOF without closing brace' );

		// anglehack is to allow QuakeEd to write single scalar angles
		// and allow them to be turned into vectors. (FIXME...)
		let keyname;
		if ( com_token === 'angle' ) {

			keyname = 'angles';
			anglehack = true;

		} else {

			anglehack = false;
			keyname = com_token;

		}

		// FIXME: change light to _light to get rid of this hack
		if ( keyname === 'light' )
			keyname = 'light_lev'; // hack for single light def

		// another hack to fix keynames with trailing spaces
		keyname = keyname.trimEnd();

		// parse value
		data = COM_Parse( data );
		if ( data === null )
			Sys_Error( 'ED_ParseEntity: EOF without closing brace' );

		if ( com_token === '}' )
			Sys_Error( 'ED_ParseEntity: closing brace without data' );

		init = true;
		if(keyname==='_newer_rend_veil'){ent._rendVeil=Rend_ParseRecord(com_token);continue;}
		if(keyname==='_newer_face_seed'){ent._faceSeed=Face_ParseSeed(com_token);continue;}
		if(keyname==='_clockwise_player'){ent._respawn=Respawn_ParsePlayer(com_token);continue;}
		if(keyname==='_cheat_powers'){const v=Number(com_token);ent._cheatPowers=Number.isInteger(v)&&v>=0&&v<8?v:0;continue;}
		if(keyname==='_clockwise_drop'){ent._respawnDrop=Respawn_ParseDrop(com_token);continue;}
		if(keyname==='_clockwise_remains'){ent._respawnRemains=Respawn_ParseRemains(com_token);continue;}
		if(keyname==='_newer_axe_corpse'){ent._axeCorpse=Axe_ParseRecord(com_token);ent._axeInvalidRecord=ent._axeCorpse===null;continue;}
		if(keyname==='_newer_axe_hidden'){const owner=Number(com_token);ent._axeSuppressed=Number.isInteger(owner)&&owner>=-1&&owner<65536;ent._axeSuppressedBy=owner>0?owner:0;continue;}
		if(keyname==='_newer_axe_owner'){ent._axeOwnerKey=Axe_ValidOwnerKey(com_token)?com_token:null;continue;}

		// keynames with a leading underscore are used for utility comments,
		// and are immediately discarded by quake
		if ( keyname[ 0 ] === '_' )
			continue;

		const key = ED_FindField( keyname );
		if ( ! key ) {

			Con_Printf( '\'%s\' is not a field\n', keyname );
			continue;

		}

		let value = com_token;
		if ( anglehack ) {

			value = '0 ' + com_token + ' 0';

		}

		if ( ! ED_ParseEpair( ent._fieldAccessor, key, value ) ) {

			Sys_Error( 'ED_ParseEdict: parse error' );

		}

	}

	if ( ! init )
		ent.free = true;
	else
		// Legacy or malformed cosmetic metadata gets one new server identity.
		// Normal save restore does not execute the QuakeC setmodel spawn hook.
		Face_Assign( ent, PR_GetString( ent.v.model ) );

	return data;

}

/*
================
ED_LoadFromFile
================
*/
/**
 * Creates a server's entity / program execution context by parsing textual entity definitions out of an ent file
 * (WinQuake pr_edict.c). Called by `SV_SpawnServer` with the map's entity lump. (The source comment says the
 * entities are directly placed in the array rather than allocated with ED_Alloc, so an error loading the map would
 * not leave entity number references out of order, and that it serves both fresh maps and savegame loads; in this
 * port the first entity goes into the world edict and the rest come from `ED_Alloc`, and saves use `ED_ParseEdict`.)
 *
 * Sets `time` in the globals to `sv.time`, then for each entity: frees it if its spawnflags exclude it from
 * deathmatch (when `deathmatch` is non-zero) or from the current skill, frees it with a console dump if it has no
 * classname or no spawn function, and otherwise runs its spawn function (the QuakeC function named by its classname)
 * with `self` set to it. Prints how many entities were inhibited.
 *
 * @param {string} data the entity text
 * @throws {Error} via `Sys_Error` when a token other than `{` starts an entity, or from `ED_ParseEdict`; QuakeC
 *   runtime errors in a spawn function propagate from `PR_ExecuteProgram`
 */
export function ED_LoadFromFile( data ) {

	let ent = null;
	let inhibit = 0;
	pr_global_struct.time = sv.time;

	// parse ents
	while ( true ) {

		// parse the opening brace
		data = COM_Parse( data );
		if ( data === null )
			break;
		if ( com_token !== '{' )
			Sys_Error( 'ED_LoadFromFile: found %s when expecting {', com_token );

		if ( ! ent )
			ent = EDICT_NUM( 0 );
		else
			ent = ED_Alloc();

		data = ED_ParseEdict( data, ent );

		// remove things from different skill levels or deathmatch
		if ( deathmatch.value !== 0 ) {

			if ( ( ( ent.v.spawnflags | 0 ) & SPAWNFLAG_NOT_DEATHMATCH ) ) {

				ED_Free( ent );
				inhibit ++;
				continue;

			}

		} else if ( ( current_skill === 0 && ( ( ent.v.spawnflags | 0 ) & SPAWNFLAG_NOT_EASY ) )
			|| ( current_skill === 1 && ( ( ent.v.spawnflags | 0 ) & SPAWNFLAG_NOT_MEDIUM ) )
			|| ( current_skill >= 2 && ( ( ent.v.spawnflags | 0 ) & SPAWNFLAG_NOT_HARD ) ) ) {

			ED_Free( ent );
			inhibit ++;
			continue;

		}

		//
		// immediately call spawn function
		//
		// Check if classname string is empty (offset 0 points to empty string)
		const classname = PR_GetString( ent.v.classname );
		if ( classname === '' ) {

			Con_Printf( 'No classname for:\n' );
			ED_Print( ent );
			ED_Free( ent );
			continue;

		}

		// look for the spawn function
		const func = ED_FindFunction( classname );

		if ( func == null ) {

			Con_Printf( 'No spawn function for:\n' );
			ED_Print( ent );
			ED_Free( ent );
			continue;

		}

		pr_global_struct.self = EDICT_TO_PROG( ent );
		PR_ExecuteProgram( pr_functions.indexOf( func ) );
		SV_PinnedZombieSpawned( ent );

	}

	Con_DPrintf( '%i entities inhibited\n', inhibit );

}

/*
===============
PR_LoadProgs
===============
*/
/**
 * Loads progs.dat from the provided ArrayBuffer (WinQuake pr_edict.c). Called by `SV_SpawnServer` for every new map,
 * before the edicts are allocated.
 *
 * Resets the axe-cut state and the `GetEdictFieldValue` cache, computes `pr_crc` over the whole file, parses the
 * header, statements, functions, global and field definitions, copies the string table (with 128 extra bytes for
 * `pr_string_temp`) and the globals into fresh buffers, and installs them with the progs.js setters, including
 * `pr_global_struct` as a `globalvars_t` over the globals. Strings added by an earlier `ED_NewString` are dropped.
 * `pr_edict_size` is set to `entityfields` (a slot count, not C's byte size).
 *
 * @param {?ArrayBuffer} fileData the whole progs.dat; read, not kept
 * @throws {Error} via `Sys_Error` when `fileData` is missing, the version is not `PROG_VERSION`, the header CRC is
 *   not `PROGHEADER_CRC` ("progdefs.h is out of date"), or a field def has the `DEF_SAVEGLOBAL` bit
 */
export function PR_LoadProgs( fileData ) {
	SV_AxeReset();

	// flush the non-C variable lookup cache
	for ( let i = 0; i < GEFV_CACHESIZE; i ++ )
		gefvCache[ i ].field = '';

	// fileData is an ArrayBuffer of progs.dat
	if ( ! fileData )
		Sys_Error( 'PR_LoadProgs: couldn\'t load progs.dat' );

	Con_DPrintf( 'Programs occupy %iK.\n', ( fileData.byteLength / 1024 ) | 0 );

	const dataView = new DataView( fileData );
	const byteView = new Uint8Array( fileData );

	// CRC computation - compute CRC over entire progs.dat file
	let crc = CRC_Init();
	for ( let i = 0; i < byteView.length; i ++ ) {

		crc = CRC_ProcessByte( crc, byteView[ i ] );

	}

	PR_SetCRC( CRC_Value( crc ) );

	// Parse header (dprograms_t) - all fields are int32 little-endian
	const header = new dprograms_t();
	let offset = 0;

	header.version = dataView.getInt32( offset, true ); offset += 4;
	header.crc = dataView.getInt32( offset, true ); offset += 4;
	header.ofs_statements = dataView.getInt32( offset, true ); offset += 4;
	header.numstatements = dataView.getInt32( offset, true ); offset += 4;
	header.ofs_globaldefs = dataView.getInt32( offset, true ); offset += 4;
	header.numglobaldefs = dataView.getInt32( offset, true ); offset += 4;
	header.ofs_fielddefs = dataView.getInt32( offset, true ); offset += 4;
	header.numfielddefs = dataView.getInt32( offset, true ); offset += 4;
	header.ofs_functions = dataView.getInt32( offset, true ); offset += 4;
	header.numfunctions = dataView.getInt32( offset, true ); offset += 4;
	header.ofs_strings = dataView.getInt32( offset, true ); offset += 4;
	header.numstrings = dataView.getInt32( offset, true ); offset += 4;
	header.ofs_globals = dataView.getInt32( offset, true ); offset += 4;
	header.numglobals = dataView.getInt32( offset, true ); offset += 4;
	header.entityfields = dataView.getInt32( offset, true ); offset += 4;

	if ( header.version !== PROG_VERSION )
		Sys_Error( 'progs.dat has wrong version number (%i should be %i)', header.version, PROG_VERSION );
	if ( header.crc !== PROGHEADER_CRC )
		Sys_Error( 'progs.dat system vars have been modified, progdefs.h is out of date' );

	PR_SetProgs( header );

	// Parse strings - allocate with extra 128 bytes for pr_string_temp
	const PR_STRING_TEMP_SIZE = 128;
	const stringsDataWithTemp = new Uint8Array( header.numstrings + PR_STRING_TEMP_SIZE );
	stringsDataWithTemp.set( new Uint8Array( fileData, header.ofs_strings, header.numstrings ) );
	// Zero-fill the temp area (already done by Uint8Array constructor)
	PR_SetStringsData( stringsDataWithTemp );
	PR_SetStringTempOfs( header.numstrings );
	pr_extra_strings = [];
	pr_extra_strings_offset = header.numstrings + PR_STRING_TEMP_SIZE;

	// Parse statements
	const statements = [];
	offset = header.ofs_statements;
	for ( let i = 0; i < header.numstatements; i ++ ) {

		const st = new dstatement_t();
		st.op = dataView.getUint16( offset, true ); offset += 2;
		st.a = dataView.getInt16( offset, true ); offset += 2;
		st.b = dataView.getInt16( offset, true ); offset += 2;
		st.c = dataView.getInt16( offset, true ); offset += 2;
		statements.push( st );

	}

	PR_SetStatements( statements );

	// Parse functions
	const functions = [];
	offset = header.ofs_functions;
	for ( let i = 0; i < header.numfunctions; i ++ ) {

		const f = new dfunction_t();
		f.first_statement = dataView.getInt32( offset, true ); offset += 4;
		f.parm_start = dataView.getInt32( offset, true ); offset += 4;
		f.locals = dataView.getInt32( offset, true ); offset += 4;
		f.profile = dataView.getInt32( offset, true ); offset += 4;
		f.s_name = dataView.getInt32( offset, true ); offset += 4;
		f.s_file = dataView.getInt32( offset, true ); offset += 4;
		f.numparms = dataView.getInt32( offset, true ); offset += 4;
		for ( let j = 0; j < MAX_PARMS; j ++ ) {

			f.parm_size[ j ] = byteView[ offset + j ];

		}

		offset += MAX_PARMS;
		functions.push( f );

	}

	PR_SetFunctions( functions );

	// Parse globaldefs
	const globaldefs = [];
	offset = header.ofs_globaldefs;
	for ( let i = 0; i < header.numglobaldefs; i ++ ) {

		const def = new ddef_t();
		def.type = dataView.getUint16( offset, true ); offset += 2;
		def.ofs = dataView.getUint16( offset, true ); offset += 2;
		def.s_name = dataView.getInt32( offset, true ); offset += 4;
		globaldefs.push( def );

	}

	PR_SetGlobalDefs( globaldefs );

	// Parse fielddefs
	const fielddefs = [];
	offset = header.ofs_fielddefs;
	for ( let i = 0; i < header.numfielddefs; i ++ ) {

		const def = new ddef_t();
		def.type = dataView.getUint16( offset, true ); offset += 2;
		if ( def.type & DEF_SAVEGLOBAL )
			Sys_Error( 'PR_LoadProgs: pr_fielddefs[i].type & DEF_SAVEGLOBAL' );
		def.ofs = dataView.getUint16( offset, true ); offset += 2;
		def.s_name = dataView.getInt32( offset, true ); offset += 4;
		fielddefs.push( def );

	}

	PR_SetFieldDefs( fielddefs );

	// Parse globals
	// Globals are stored as raw 32-bit values (can be read as int or float)
	const globalsBuffer = new ArrayBuffer( header.numglobals * 4 );
	const globalsBytes = new Uint8Array( globalsBuffer );
	const srcGlobals = new Uint8Array( fileData, header.ofs_globals, header.numglobals * 4 );
	globalsBytes.set( srcGlobals );

	const globalsFloat = new Float32Array( globalsBuffer );
	const globalsInt = new Int32Array( globalsBuffer );
	const globalsAccessor = new EdictFieldAccessor( globalsBuffer, 0, header.numglobals );

	PR_SetGlobalsFloat( globalsFloat );
	PR_SetGlobalsInt( globalsInt );
	PR_SetGlobals( globalsAccessor );

	// Set up pr_global_struct as a globalvars_t proxy over the globals
	PR_SetGlobalStruct( new globalvars_t( globalsAccessor ) );

	// Calculate edict size
	// In C: pr_edict_size = progs->entityfields * 4 + sizeof(edict_t) - sizeof(entvars_t);
	// In JS we just store entityfields count - the edict_t class handles the rest
	PR_SetEdictSize( header.entityfields );

}

/*
============
PR_Profile_f
============
*/
function PR_Profile_f() {

	let num = 0;

	do {

		let max = 0;
		let best = null;

		for ( let i = 0; i < progs.numfunctions; i ++ ) {

			const f = pr_functions[ i ];
			if ( f.profile > max ) {

				max = f.profile;
				best = f;

			}

		}

		if ( best != null ) {

			if ( num < 10 ) {

				Con_Printf( '%7i %s\n', best.profile, PR_GetString( best.s_name ) );

			}

			num ++;
			best.profile = 0;

		} else {

			break;

		}

	} while ( true );

}

/*
===============
PR_Init
===============
*/
/**
 * Registers the progs console commands (`edict`, `edicts`, `edictcount`, `profile`) and the progs cvars (`nomonsters`,
 * `gamecfg`, `scratch1`..`4`, and the archived `savedgamecfg`, `saved1`..`4`) (WinQuake pr_edict.c). Called once by
 * `Host_Init` and by the room server (server/game_server.js). The built-ins (server/pr_cmds.js) are installed by
 * PR_Init's callers, the host and the room server, so the VM does not import the server (card [44g], D1a).
 */
export function PR_Init() {

	Cmd_AddCommand( 'edict', ED_PrintEdict_f );
	Cmd_AddCommand( 'edicts', ED_PrintEdicts );
	Cmd_AddCommand( 'edictcount', ED_Count );
	Cmd_AddCommand( 'profile', PR_Profile_f );

	Cvar_RegisterVariable( nomonsters );
	Cvar_RegisterVariable( gamecfg );
	Cvar_RegisterVariable( scratch1 );
	Cvar_RegisterVariable( scratch2 );
	Cvar_RegisterVariable( scratch3 );
	Cvar_RegisterVariable( scratch4 );
	Cvar_RegisterVariable( savedgamecfg );
	Cvar_RegisterVariable( saved1 );
	Cvar_RegisterVariable( saved2 );
	Cvar_RegisterVariable( saved3 );
	Cvar_RegisterVariable( saved4 );

	// the built-ins (server/pr_cmds.js) are installed by PR_Init's callers, the host and the room server, so the VM
	// does not import the server (card [44g], D1a)

}

/*
===============
PR_AllocEdicts
===============
*/
/**
 * Allocates the edict array for the server. Called by server init (`SV_SpawnServer`, after `PR_LoadProgs`); not in
 * original C - we need this because JS doesn't have pointer arithmetic over a flat memory block. The array lives as
 * `sv.edicts` until the next map.
 *
 * @param {number} maxEdicts number of edicts (`MAX_EDICTS`)
 * @param {number} entityfields 32-bit field slots per edict (`progs.entityfields`)
 * @returns {Array<edict_t>} new edicts numbered 0..maxEdicts-1, all fields zero
 */
export function PR_AllocEdicts( maxEdicts, entityfields ) {

	const edicts = [];
	for ( let i = 0; i < maxEdicts; i ++ ) {

		edicts.push( new edict_t( i, entityfields ) );

	}

	return edicts;

}
