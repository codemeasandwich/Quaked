/**
 * @module engine/progs/progs
 *
 * Program execution definitions (WinQuake progs.h): the `edict_t` class and its field accessor, and the loaded
 * program (functions, strings, globals, statements).
 *
 * Types: exported classes `EdictFieldAccessor`, `edict_t`.
 *
 * State: mutable exports `progs`, `pr_functions`, `pr_strings`, `pr_strings_data`, `pr_globaldefs`, `pr_fielddefs`,
 * `pr_statements`, `pr_global_struct`, `pr_globals`, `pr_globals_float`, `pr_globals_int`, `pr_edict_size` and 10
 * more.
 *
 * Errors: throws at 2 places.
 *
 * The loaded program's tables are set through the `PR_Set*` functions when progs.dat loads.
 */
// Ported from: WinQuake/progs.h -- program execution definitions

import { link_t } from '../common/common.js';
import { entity_state_t } from '../common/quakedef.js';
import {
	dprograms_t, dfunction_t, ddef_t, dstatement_t,
	DEF_SAVEGLOBAL,
	ev_void, ev_string, ev_float, ev_vector, ev_entity,
	ev_field, ev_function, ev_pointer,
	OFS_RETURN, OFS_PARM0,
} from './pr_comp.js';
import { entvars_t } from './progdefs.js';

export const MAX_ENT_LEAFS = 16;

//
// eval_t - union type for accessing progs data as different types
// In C this is a union of string, float, vector[3], function, int, edict.
// In JS we provide accessor helpers on the backing ArrayBuffer.
//

//
// EdictFieldAccessor - provides typed access to an ArrayBuffer region
// Used for both pr_globals and per-edict field data.
//
export class EdictFieldAccessor {

	/**
	 * Wraps a region of 32-bit slots, each readable as a float or an int (the C `eval_t` union). `PR_LoadProgs` makes one
	 * over the progs globals (`pr_globals`); each `edict_t` makes one over its own field data. The views share the
	 * buffer, so writes are seen by every view and by `entvars_t`/`globalvars_t` proxies over it; the accessor lives as
	 * long as its owner (the loaded progs, or the edict array of the current server).
	 *
	 * @param {ArrayBuffer} buffer backing memory, shared (not copied)
	 * @param {number} byteOffset starting byte offset of slot 0 in `buffer`; a multiple of 4
	 * @param {number} length number of 32-bit slots
	 */
	constructor( buffer, byteOffset, length ) {

		this._buffer = buffer;
		this._byteOffset = byteOffset;
		this._length = length;
		this._floatView = new Float32Array( buffer, byteOffset, length );
		this._intView = new Int32Array( buffer, byteOffset, length );

	}

	/**
	 * Reads a slot as a float (a QuakeC `float`, or one component of a `vector`).
	 *
	 * @param {number} ofs slot index (32-bit words, as in `ddef_t.ofs` and the `OFS_*` constants)
	 * @returns {number} the value as a 32-bit float; undefined when `ofs` is out of range
	 */
	getFloat( ofs ) {

		return this._floatView[ ofs ];

	}

	/**
	 * Writes a slot as a float (rounded to 32-bit precision). Out-of-range writes are ignored.
	 *
	 * @param {number} ofs slot index (32-bit words)
	 * @param {number} v value to store
	 */
	setFloat( ofs, v ) {

		this._floatView[ ofs ] = v;

	}

	/**
	 * Reads a slot as a signed 32-bit int: how strings (offsets into `pr_strings_data`), entities (edict numbers here),
	 * fields (slot offsets) and functions (indexes into `pr_functions`) are stored.
	 *
	 * @param {number} ofs slot index (32-bit words)
	 * @returns {number} the slot's bits as an int; undefined when `ofs` is out of range
	 */
	getInt32( ofs ) {

		return this._intView[ ofs ];

	}

	/**
	 * Writes a slot as a signed 32-bit int (string offset, edict number, field offset or function index). Out-of-range
	 * writes are ignored.
	 *
	 * @param {number} ofs slot index (32-bit words)
	 * @param {number} v value to store, truncated to int32
	 */
	setInt32( ofs, v ) {

		this._intView[ ofs ] = v;

	}

	/**
	 * Gives a three-float view of slots `ofs`..`ofs`+2 (a QuakeC `vector`, such as an origin in Quake units or angles in
	 * degrees). A new view is made on each call, but it aliases the backing memory: writing to it changes the
	 * fields, and it shows later changes.
	 *
	 * @param {number} ofs slot index of the x component (32-bit words)
	 * @returns {Float32Array} live length-3 view over the backing buffer
	 * @throws {RangeError} when the three slots run past the end of the buffer
	 */
	getVector( ofs ) {

		return new Float32Array( this._buffer, this._byteOffset + ofs * 4, 3 );

	}

	/**
	 * Copies three components into slots `ofs`..`ofs`+2.
	 *
	 * @param {number} ofs slot index of the x component (32-bit words)
	 * @param {ArrayLike<number>} v source vector; elements 0..2 are read
	 */
	setVector( ofs, v ) {

		this._floatView[ ofs ] = v[ 0 ];
		this._floatView[ ofs + 1 ] = v[ 1 ];
		this._floatView[ ofs + 2 ] = v[ 2 ];

	}

	/**
	 * Clears a range of slots to zero (all bits zero, which reads as 0 float, 0 int, the empty string and world).
	 *
	 * @param {number} startOfs first slot index (32-bit words)
	 * @param {number} count number of slots to clear
	 */
	clear( startOfs, count ) {

		for ( let i = 0; i < count; i ++ ) {

			this._intView[ startOfs + i ] = 0;

		}

	}

	/**
	 * Clears all slots to zero (the C `memset` of an edict's `v`). Used by `edict_t.clearFields`.
	 */
	clearAll() {

		this._intView.fill( 0 );

	}

}

//
// edict_t - entity dictionary entry
//
export class edict_t {

	/**
	 * Creates one entity dictionary entry with zeroed field data. `PR_AllocEdicts` makes all of them (`sv.max_edicts`)
	 * when a server is spawned; they are reused by `ED_Alloc`/`ED_Free` and live until the next server spawn.
	 *
	 * @param {number} index entity number, 0 for the world; replaces C pointer arithmetic over `sv.edicts`
	 * @param {number} entityfields number of 32-bit field slots (`progs.entityfields`: the `entvars_t` fields followed
	 *   by any extra fields the progs define)
	 */
	constructor( index, entityfields ) {

		this.index = index; // entity number (replaces pointer arithmetic)
		this.free = false;

		this.area = new link_t(); // linked to a division node or leaf

		this.num_leafs = 0;
		this.leafnums = new Int32Array( MAX_ENT_LEAFS );

		this.baseline = new entity_state_t();

		this.freetime = 0.0; // sv.time when the object was freed

		// Allocate field data backing buffer
		// entityfields is the number of int/float slots for the v (entvars) fields
		// Additional fields from progs come immediately after
		this._fieldBuffer = new ArrayBuffer( entityfields * 4 );
		this._fieldAccessor = new EdictFieldAccessor( this._fieldBuffer, 0, entityfields );

		// C exported fields from progs (entvars_t)
		this.v = new entvars_t( this._fieldAccessor );

		// Store entityfields count for clearing
		this._entityfields = entityfields;

	}

	/**
	 * Clears entity variable fields (memset &e->v to 0), and resets the port's own per-edict JS state (`_faceSeed`, the
	 * respawn and `_cheatPowers` state, `_rendVeil`, and the axe bookkeeping). Called by `ED_ClearEdict` when an edict is
	 * allocated, by `ED_ParseEdict`, and when a client's edict is set up on spawn. Does not change `free`, links or
	 * `baseline`.
	 */
	clearFields() {

		this._fieldAccessor.clearAll();
		this._faceSeed = null;
		this._respawnAmmoPending = false; this._respawnStart = null; this._respawn = null; this._respawnDrop = null; this._respawnAlert = null; this._respawnRemains = null; this._cheatPowers = 0;
		this._rendVeil = null;
		this._axeCorpse = null; this._axeSuppressed = false; this._axeSuppressedBy = 0; this._axeReady = false; this._axeOwnerKey = null; this._axeInvalidHandled = false; this._axeInvalidRecord = false;

	}

}

//============================================================================
// Progs module state
//============================================================================

export let progs = null; // dprograms_t
export let pr_functions = null; // dfunction_t[]
export let pr_strings = ''; // string table (raw string data)
export let pr_strings_data = null; // Uint8Array of raw string bytes
export let pr_globaldefs = null; // ddef_t[]
export let pr_fielddefs = null; // ddef_t[]
export let pr_statements = null; // dstatement_t[]
export let pr_global_struct = null; // globalvars_t
export let pr_globals = null; // EdictFieldAccessor (same memory as pr_global_struct)
export let pr_globals_float = null; // Float32Array view on globals
export let pr_globals_int = null; // Int32Array view on globals

export let pr_edict_size = 0; // in bytes (C: sizeof edict_t fields portion)

export let pr_crc = 0;

// Temp string buffer for PF_ftos/PF_vtos (mirrors C's pr_string_temp[128])
// This is a fixed 128-byte region at the end of pr_strings_data that gets reused.
export let pr_string_temp_ofs = - 1;

// type_size[etype] - number of int/float slots per type
export const type_size = [ 1, 1, 1, 3, 1, 1, 1, 1 ];

//============================================================================
// Setter functions for module state (since we use export let)
//============================================================================

/**
 * Stores the parsed progs.dat header. Called by `PR_LoadProgs`; kept until the next progs load.
 *
 * @param {dprograms_t} p header (counts, offsets, `entityfields`, `crc`)
 */
export function PR_SetProgs( p ) { progs = p; }
/**
 * Stores the function table. Called by `PR_LoadProgs`; kept until the next progs load.
 *
 * @param {Array<dfunction_t>} f functions in progs order; QuakeC function values index this array
 */
export function PR_SetFunctions( f ) { pr_functions = f; }
/**
 * Replaces `pr_strings` (the module's string-table placeholder, `''` by default). Strings are read from
 * `pr_strings_data` by `PR_GetString`.
 *
 * @param {string} s new value for `pr_strings`
 */
export function PR_SetStrings( s ) { pr_strings = s; }
/**
 * Replaces the string table bytes read by `PR_GetString`. Called by `PR_LoadProgs` (the progs strings plus a
 * 128-byte temp area) and by `ED_NewString` when it grows the table for new strings.
 *
 * @param {Uint8Array} d NUL-terminated strings; QuakeC string values are byte offsets into it
 */
export function PR_SetStringsData( d ) { pr_strings_data = d; }
/**
 * Stores the global definitions (names, types and slots of progs globals). Called by `PR_LoadProgs`; kept until the
 * next progs load.
 *
 * @param {Array<ddef_t>} g global definitions
 */
export function PR_SetGlobalDefs( g ) { pr_globaldefs = g; }
/**
 * Stores the entity field definitions. Called by `PR_LoadProgs`; kept until the next progs load.
 *
 * @param {Array<ddef_t>} f field definitions; `ofs` is the slot in each edict's field data
 */
export function PR_SetFieldDefs( f ) { pr_fielddefs = f; }
/**
 * Stores the bytecode statements. Called by `PR_LoadProgs`; kept until the next progs load.
 *
 * @param {Array<dstatement_t>} s statements; `dfunction_t.first_statement` indexes this array
 */
export function PR_SetStatements( s ) { pr_statements = s; }
/**
 * Stores the named-globals proxy (`self`, `time`, `other`...). Called by `PR_LoadProgs`; it shares memory with
 * `pr_globals`.
 *
 * @param {globalvars_t} g proxy over the globals accessor
 */
export function PR_SetGlobalStruct( g ) { pr_global_struct = g; }
/**
 * Stores the globals accessor. Called by `PR_LoadProgs`; kept until the next progs load.
 *
 * @param {EdictFieldAccessor} g accessor over the progs globals (same memory as `pr_global_struct`)
 */
export function PR_SetGlobals( g ) { pr_globals = g; }
/**
 * Stores the float view of the globals used by `G_FLOAT`/`G_VECTOR`. Called by `PR_LoadProgs`.
 *
 * @param {Float32Array} f view over the globals buffer
 */
export function PR_SetGlobalsFloat( f ) { pr_globals_float = f; }
/**
 * Stores the int view of the globals used by `G_INT`, `G_STRING`, `G_EDICT` and `RETURN_EDICT`. Called by
 * `PR_LoadProgs`.
 *
 * @param {Int32Array} i view over the globals buffer
 */
export function PR_SetGlobalsInt( i ) { pr_globals_int = i; }
/**
 * Stores `pr_edict_size`. Called by `PR_LoadProgs` with `progs.entityfields`: in this port it holds the field slot
 * count (32-bit words), not the C byte size the variable's comment describes.
 *
 * @param {number} s number of field slots per edict
 */
export function PR_SetEdictSize( s ) { pr_edict_size = s; }
/**
 * Stores the CRC of the whole progs.dat file. Called by `PR_LoadProgs`; kept until the next progs load.
 *
 * @param {number} c CRC value (16-bit, from `CRC_Value`)
 */
export function PR_SetCRC( c ) { pr_crc = c; }
/**
 * Stores where the 128-byte temp string area (C `pr_string_temp`) starts in `pr_strings_data`. Called by
 * `PR_LoadProgs` with the end of the progs strings.
 *
 * @param {number} o byte offset into `pr_strings_data`; -1 until progs load
 */
export function PR_SetStringTempOfs( o ) { pr_string_temp_ofs = o; }

/**
 * Writes a string into the fixed pr_string_temp area (128 bytes max) at the end of `pr_strings_data`, for
 * `PF_ftos`/`PF_vtos`. Mirrors C's pr_string_temp usage: the area is shared and reused, so the string stays valid
 * only until the next call. Only the first 127 characters are kept (room for the NUL); each is stored as one byte.
 *
 * @param {string} str text to store
 * @returns {number} the offset into pr_strings_data (`pr_string_temp_ofs`), usable as a QuakeC string value
 */
export function PR_SetTempString( str ) {

	const maxLen = 127; // leave room for null terminator
	const len = Math.min( str.length, maxLen );
	for ( let i = 0; i < len; i ++ ) {

		pr_strings_data[ pr_string_temp_ofs + i ] = str.charCodeAt( i );

	}

	pr_strings_data[ pr_string_temp_ofs + len ] = 0; // null terminator
	return pr_string_temp_ofs;

}

//============================================================================
// Global access helper macros (ported as functions)
// These match the C macros: G_FLOAT, G_INT, G_VECTOR, G_STRING, etc.
//============================================================================

/**
 * Reads a global as a float (C macro `G_FLOAT`); builtins use it to read float parameters.
 *
 * @param {number} o slot index into the progs globals (32-bit words, e.g. `OFS_PARM0` or `OFS_RETURN`)
 * @returns {number} the float value
 */
export function G_FLOAT( o ) {

	return pr_globals_float[ o ];

}

/**
 * Writes a global as a float (assignment form of the C macro `G_FLOAT`); builtins use it to return floats in
 * `OFS_RETURN`.
 *
 * @param {number} o slot index into the progs globals (32-bit words, e.g. `OFS_PARM0` or `OFS_RETURN`)
 * @param {number} v value, stored as a 32-bit float
 */
export function G_FLOAT_SET( o, v ) {

	pr_globals_float[ o ] = v;

}

/**
 * Reads a global as an int (C macro `G_INT`): a string offset, edict number, field offset or function index.
 *
 * @param {number} o slot index into the progs globals (32-bit words, e.g. `OFS_PARM0` or `OFS_RETURN`)
 * @returns {number} the slot's bits as an int32
 */
export function G_INT( o ) {

	return pr_globals_int[ o ];

}

/**
 * Writes a global as an int (assignment form of the C macro `G_INT`).
 *
 * @param {number} o slot index into the progs globals (32-bit words, e.g. `OFS_PARM0` or `OFS_RETURN`)
 * @param {number} v value, truncated to int32
 */
export function G_INT_SET( o, v ) {

	pr_globals_int[ o ] = v;

}

/**
 * Gives a vector global (C macro `G_VECTOR`). A new view is made on each call, but it aliases the globals: writes
 * through it change the global, so callers copy it if they need the value after more progs code runs.
 *
 * @param {number} o slot index into the progs globals (32-bit words, e.g. `OFS_PARM0` or `OFS_RETURN`), of the x component
 * @returns {Float32Array} live length-3 view of slots `o`..`o`+2
 */
export function G_VECTOR( o ) {

	return new Float32Array( pr_globals_float.buffer, pr_globals_float.byteOffset + o * 4, 3 );

}

/**
 * Reads a string global (C macro `G_STRING`): the global holds an offset into the string table.
 *
 * @param {number} o slot index into the progs globals (32-bit words, e.g. `OFS_PARM0` or `OFS_RETURN`)
 * @returns {string} the string (a copy), or `''` when the offset is outside `pr_strings_data`
 */
export function G_STRING( o ) {

	return PR_GetString( pr_globals_int[ o ] );

}

/**
 * Reads a function global (C macro `G_FUNCTION`).
 *
 * @param {number} o slot index into the progs globals (32-bit words, e.g. `OFS_PARM0` or `OFS_RETURN`)
 * @returns {number} index into `pr_functions`; 0 means no function
 */
export function G_FUNCTION( o ) {

	return pr_globals_int[ o ];

}

//============================================================================
// String table helpers
//============================================================================

/**
 * Reads a NUL-terminated string from the progs string table, one byte per character.
 *
 * @param {number} ofs byte offset into `pr_strings_data` (a QuakeC string value)
 * @returns {string} the string up to the NUL or the end of the table; `''` when `ofs` is outside the table
 */
export function PR_GetString( ofs ) {

	if ( ofs < 0 || ofs >= pr_strings_data.length ) return '';

	let s = '';
	for ( let i = ofs; i < pr_strings_data.length; i ++ ) {

		if ( pr_strings_data[ i ] === 0 ) break;
		s += String.fromCharCode( pr_strings_data[ i ] );

	}

	return s;

}

//============================================================================
// Edict number <-> pointer helpers
// In C these use byte pointer arithmetic on sv.edicts.
// In JS we use an array of edict_t objects.
//============================================================================

// These are set by the server module
export let sv = null; // will reference the server state
export let svs = null; // will reference the persistent server state

/**
 * Points this module at the server state used by the edict helpers. Called by `SV_SpawnServer` (sv_main.js) on each
 * server spawn, after `sv` is cleared.
 *
 * @param {object} s server state `sv` (read: `edicts`, `num_edicts`, `max_edicts`)
 */
export function PR_SetSV( s ) { sv = s; }
/**
 * Points this module at the persistent server state `svs` (exported here as `svs`). Called by `SV_SpawnServer` with
 * `PR_SetSV`.
 *
 * @param {object} s persistent server state `svs`
 */
export function PR_SetSVS( s ) { svs = s; }

/**
 * Gives the edict with this number (C macro `EDICT_NUM`).
 *
 * @param {number} n entity number, 0..`sv.max_edicts`-1 (0 is the world)
 * @returns {edict_t} the edict; it may be free
 * @throws {Error} `EDICT_NUM: bad number <n>` when `n` is outside 0..`sv.max_edicts`-1
 */
export function EDICT_NUM( n ) {

	if ( n < 0 || n >= sv.max_edicts ) {

		throw new Error( 'EDICT_NUM: bad number ' + n );

	}

	return sv.edicts[ n ];

}

/**
 * Gives an edict's number (C macro `NUM_FOR_EDICT`, there done by pointer arithmetic).
 *
 * @param {edict_t} e an edict of the current server
 * @returns {number} its entity number, 0..`sv.num_edicts`-1
 * @throws {Error} `NUM_FOR_EDICT: bad pointer` when the number is not below `sv.num_edicts` (an edict not yet in use)
 */
export function NUM_FOR_EDICT( e ) {

	const n = e.index;

	if ( n < 0 || n >= sv.num_edicts ) {

		throw new Error( 'NUM_FOR_EDICT: bad pointer' );

	}

	return n;

}

/**
 * Gives the next edict in the array (C macro `NEXT_EDICT`), for loops over all edicts.
 *
 * @param {edict_t} e an edict of the current server
 * @returns {edict_t|undefined} the edict numbered one higher; undefined past the end of `sv.edicts`
 */
export function NEXT_EDICT( e ) {

	return sv.edicts[ e.index + 1 ];

}

/**
 * Converts an edict to its QuakeC entity value (C macro `EDICT_TO_PROG`). In C this is a byte offset; here it is the
 * entity number.
 *
 * @param {edict_t} e edict
 * @returns {number} the value to store in an entity global or field
 */
export function EDICT_TO_PROG( e ) {

	return e.index;

}

/**
 * Converts a QuakeC entity value back to its edict (C macro `PROG_TO_EDICT`). No range check.
 *
 * @param {number} e entity value (an entity number in this port)
 * @returns {edict_t|undefined} the edict; undefined when the value is outside `sv.edicts`
 */
export function PROG_TO_EDICT( e ) {

	return sv.edicts[ e ];

}

//============================================================================
// Edict field access helpers (match C macros)
// E_FLOAT, E_INT, E_VECTOR, E_STRING
//============================================================================

/**
 * Reads an edict field as a float (C macro `E_FLOAT`), for fields without a named `entvars_t` property.
 *
 * @param {edict_t} e edict
 * @param {number} o slot index into the edict's field data (32-bit words, a `ddef_t.ofs`)
 * @returns {number} the float value
 */
export function E_FLOAT( e, o ) {

	return e._fieldAccessor.getFloat( o );

}

/**
 * Writes an edict field as a float (assignment form of the C macro `E_FLOAT`). Mutates `e`.
 *
 * @param {edict_t} e edict
 * @param {number} o slot index into the edict's field data (32-bit words, a `ddef_t.ofs`)
 * @param {number} v value, stored as a 32-bit float
 */
export function E_FLOAT_SET( e, o, v ) {

	e._fieldAccessor.setFloat( o, v );

}

/**
 * Reads an edict field as an int (C macro `E_INT`): a string offset, entity number, field offset or function index.
 *
 * @param {edict_t} e edict
 * @param {number} o slot index into the edict's field data (32-bit words, a `ddef_t.ofs`)
 * @returns {number} the slot's bits as an int32
 */
export function E_INT( e, o ) {

	return e._fieldAccessor.getInt32( o );

}

/**
 * Writes an edict field as an int (assignment form of the C macro `E_INT`). Mutates `e`.
 *
 * @param {edict_t} e edict
 * @param {number} o slot index into the edict's field data (32-bit words, a `ddef_t.ofs`)
 * @param {number} v value, truncated to int32
 */
export function E_INT_SET( e, o, v ) {

	e._fieldAccessor.setInt32( o, v );

}

/**
 * Gives a vector field of an edict (C macro `E_VECTOR`).
 *
 * @param {edict_t} e edict
 * @param {number} o slot index into the edict's field data (32-bit words, a `ddef_t.ofs`), of the x component
 * @returns {Float32Array} live length-3 view; writes through it change the edict
 */
export function E_VECTOR( e, o ) {

	return e._fieldAccessor.getVector( o );

}

/**
 * Reads a string field of an edict (C macro `E_STRING`).
 *
 * @param {edict_t} e edict
 * @param {number} o slot index into the edict's field data (32-bit words, a `ddef_t.ofs`)
 * @returns {string} the string, or `''` when the stored offset is outside `pr_strings_data`
 */
export function E_STRING( e, o ) {

	return PR_GetString( e._fieldAccessor.getInt32( o ) );

}

//============================================================================
// G_EDICT, G_EDICTNUM - read edict from globals
//============================================================================

/**
 * Reads an entity global as an edict (C macro `G_EDICT`); builtins use it for entity parameters.
 *
 * @param {number} o slot index into the progs globals (32-bit words, e.g. `OFS_PARM0` or `OFS_RETURN`)
 * @returns {edict_t|undefined} the edict; undefined when the stored value is outside `sv.edicts`
 */
export function G_EDICT( o ) {

	return PROG_TO_EDICT( pr_globals_int[ o ] );

}

/**
 * Reads an entity global as an entity number (C macro `G_EDICTNUM`).
 *
 * @param {number} o slot index into the progs globals (32-bit words, e.g. `OFS_PARM0` or `OFS_RETURN`)
 * @returns {number} entity number, 0..`sv.num_edicts`-1
 * @throws {Error} from `NUM_FOR_EDICT` when the edict is not in use (number not below `sv.num_edicts`)
 */
export function G_EDICTNUM( o ) {

	return NUM_FOR_EDICT( G_EDICT( o ) );

}

/**
 * Returns an edict from a builtin (C macro `RETURN_EDICT`) by storing its entity value in `OFS_RETURN`.
 *
 * @param {edict_t} e edict to return to QuakeC
 */
export function RETURN_EDICT( e ) {

	pr_globals_int[ OFS_RETURN ] = EDICT_TO_PROG( e );

}

//============================================================================
// Builtin function types
//============================================================================

export let pr_builtins = null; // Function[]
export let pr_numbuiltins = 0;

/**
 * Installs the builtin function table that QuakeC calls through negative function `first_statement` values. Called by
 * pr_cmds.js with its `pr_builtin` table; kept for the session.
 *
 * @param {Array<function(): void>} b builtins, indexed by builtin number
 * @param {number} n number of builtins; a call to a higher number is a run-time error in `PR_ExecuteProgram`
 */
export function PR_SetBuiltins( b, n ) {

	pr_builtins = b;
	pr_numbuiltins = n;

}

export let pr_argc = 0;

/**
 * Records how many arguments the current builtin call passed (the `OP_CALL0`..`OP_CALL8` opcode). Set by
 * `PR_ExecuteProgram` before each call; builtins with variable arguments read `pr_argc`.
 *
 * @param {number} n argument count, 0..8
 */
export function PR_SetArgc( n ) { pr_argc = n; }

export let pr_trace = false;
export let pr_xfunction = null; // dfunction_t
export let pr_xstatement = 0;

/**
 * Turns statement tracing on or off (`PF_traceon`/`PF_traceoff`); `PR_ExecuteProgram` prints each statement while it
 * is on, and clears it when it starts.
 *
 * @param {boolean} t true to trace
 */
export function PR_SetTrace( t ) { pr_trace = t; }
/**
 * Records the function being executed, used for error reports and profiling. Set by `PR_ExecuteProgram` on
 * function entry and exit, and restored by builtins that call back into progs.
 *
 * @param {?dfunction_t} f current function
 */
export function PR_SetXFunction( f ) { pr_xfunction = f; }
/**
 * Records the statement being executed, used for error reports. Set by `PR_ExecuteProgram` for each statement.
 *
 * @param {number} s index into `pr_statements`
 */
export function PR_SetXStatement( s ) { pr_xstatement = s; }
