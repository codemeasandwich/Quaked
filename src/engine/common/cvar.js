/**
 * @module engine/common/cvar
 *
 * Console variables (WinQuake cvar.c): registration, lookup and setting, archived values in browser storage, and
 * dropping stale defaults from a saved configuration (`Cvar_DropChangedDefaults`).
 *
 * Types: exported classes `cvar_t`.
 *
 * State: no mutable exports; module-level variables `_serverBroadcast`, `_storageWritable`, `cvar_vars`; browser
 * storage.
 *
 * Errors: catches at 3 places.
 *
 * Archived values are kept in localStorage under `quake_cvar_<name>`; storage that is full or unavailable is caught
 * and reported, and the value still applies for the session.
 */
// Ported from: WinQuake/cvar.c -- dynamic variable tracking

/*

cvar_t variables are used to hold scalar or string variables that can be
changed or displayed at the console or prog code as well as accessed directly
in C code.

it is sufficient to initialize a cvar_t with just the first two fields, or
you can add a ,true flag for variables that you want saved to the configuration
file when the game is quit:

Cvars must be registered before use, or they will have a 0 value instead of
the float interpretation of the string. Generally, all cvar_t declarations
should be registered in the appropriate init function before any console
commands are executed:
Cvar_RegisterVariable(host_framerate);

*/

import { Con_Printf, Q_atof } from './common.js';
import { Cmd_Exists, Cmd_Argc, Cmd_Argv } from './cmd.js';

// Callback for broadcasting server cvar changes (injected to avoid circular deps)
let _serverBroadcast = null;

/**
 * Installs the callback that announces changes to `server` cvars (WinQuake calls `SV_BroadcastPrintf` directly; it is
 * injected here to avoid circular deps). Called once by `Host_Init`, whose callback broadcasts only while a server is
 * active. Kept for the rest of the session.
 *
 * @param {?(msg: string) => void} fn receives `"name" changed to "value"\n`; null disables broadcasting
 */
export function Cvar_SetServerBroadcast( fn ) {

	_serverBroadcast = fn;

}

// localStorage key prefix for saved cvars
const CVAR_STORAGE_PREFIX = 'quake_cvar_';
// false in a player's window in local play: it shares the browser's storage with player 1's page (card [37a])
let _storageWritable = true;

/**
 * Whether settings may be saved to the browser's storage: the cvars as they change, and the configuration
 * (`Host_WriteConfiguration`). A player's window in local play turns this off before the engine starts, so its own
 * name, colours and settings never replace player 1's; it still reads them.
 *
 * @param {boolean} writable false to stop saving for the rest of the page's life
 */
export function Cvar_SetStorageWritable( writable ) {

	_storageWritable = !! writable;

}

/**
 * Whether settings are saved to the browser's storage (see `Cvar_SetStorageWritable`).
 *
 * @returns {boolean} false in a player's window in local play
 */
export function Cvar_StorageWritable() {

	return _storageWritable;

}

// Save a cvar to localStorage
function Cvar_SaveToStorage( _var ) {

	if ( typeof localStorage === 'undefined' || ! _storageWritable ) return;

	try {

		localStorage.setItem( CVAR_STORAGE_PREFIX + _var.name, _var.string );

	} catch ( e ) {

		// localStorage might be full or disabled
		Con_Printf( 'Warning: Could not save cvar ' + _var.name + ' to localStorage\n' );

	}

}

/*
============
Cvar_DropChangedDefaults
============
*/
export const CVAR_DEFAULT_CHANGES = [ { name: 'r_dof', marker: 'quaked_default_r_dof_2026-10-10' } ];
/**
 * Filters a saved configuration before `Host_Init` executes it, so a changed cvar default takes effect.
 *
 * A saved configuration lists every archived cvar, so one written before a default changed carries the old default
 * and would override the new one. Drop those lines from it, once per change (its marker), unless the player chose a
 * value themselves: a value set in play is also saved on its own key (`quake_cvar_<name>`), which a configuration's
 * own lines never are when they equal the default. Each change's marker key is set to '1' in `storage` once handled,
 * so the drop happens only on the first load after the change. If storage throws, the configuration is kept as saved.
 *
 * @param {string} config saved configuration text (lines such as `r_dof "1"`)
 * @param {?Storage} [storage=localStorage] where markers and per-cvar values live; null (no localStorage) returns
 *   `config` unchanged
 * @param {Array<{ name: string, marker: string }>} [changes=CVAR_DEFAULT_CHANGES] cvars whose defaults changed, each
 *   with the storage key that records the change was applied
 * @returns {string} the configuration with stale default lines removed
 */
export function Cvar_DropChangedDefaults( config, storage = typeof localStorage === 'undefined' ? null : localStorage, changes = CVAR_DEFAULT_CHANGES ) {

	if ( storage === null ) return config;
	try {

		for ( const change of changes ) {

			if ( storage.getItem( change.marker ) !== null ) continue;
			if ( storage.getItem( CVAR_STORAGE_PREFIX + change.name ) === null )
				config = config.split( '\n' ).filter( line => ! new RegExp( '^\\s*' + change.name + '\\s' ).test( line ) ).join( '\n' );
			if ( _storageWritable ) storage.setItem( change.marker, '1' ); // a player's window reads only

		}

	} catch ( e ) {

		// storage may be unavailable: keep the configuration as saved

	}
	return config;

}

// Load a cvar from localStorage (returns null if not found)
function Cvar_LoadFromStorage( name ) {

	if ( typeof localStorage === 'undefined' ) return null;

	try {

		return localStorage.getItem( CVAR_STORAGE_PREFIX + name );

	} catch ( e ) {

		return null;

	}

}

export class cvar_t {

	/**
	 * Creates a console variable (WinQuake cvar.h `cvar_t`). It is not visible to the console or `Cvar_Set` until
	 * passed to `Cvar_RegisterVariable`, which may replace `string` with the archived value. `value` is always the
	 * `Q_atof` reading of `string`; `next` links the registered list.
	 *
	 * @param {string} name console name, matched case-sensitively
	 * @param {string} [string=''] default value text
	 * @param {boolean} [archive=false] save the value with the configuration and in localStorage
	 *   (`quake_cvar_<name>`)
	 * @param {boolean} [server=false] announce changes to connected players
	 */
	constructor( name, string, archive, server ) {

		this.name = name;
		this.string = string || '';
		this.archive = archive || false; // set to true to cause it to be saved to vars.rc
		this.server = server || false; // notifies players when changed
		this.value = Q_atof( this.string );
		this.next = null;

	}

}

let cvar_vars = null;

/*
============
Cvar_FindVar
============
*/
/**
 * Looks up a registered cvar by exact, case-sensitive name (a linear walk of the registered list).
 *
 * @param {string} var_name cvar name
 * @returns {?cvar_t} the registered cvar, or null when none has that name
 */
export function Cvar_FindVar( var_name ) {

	let _var = cvar_vars;
	while ( _var ) {

		if ( _var.name === var_name )
			return _var;
		_var = _var.next;

	}

	return null;

}

/*
============
Cvar_VariableValue
============
*/
/**
 * Returns a cvar's numeric value by name, for code that has no reference to the `cvar_t`. The string is reparsed
 * with `Q_atof`.
 *
 * @param {string} var_name cvar name
 * @returns {number} the value, or 0 when no cvar has that name
 */
export function Cvar_VariableValue( var_name ) {

	const _var = Cvar_FindVar( var_name );
	if ( ! _var )
		return 0;
	return Q_atof( _var.string );

}

/*
============
Cvar_VariableString
============
*/
/**
 * Returns a cvar's string value by name; `Cmd_AddCommand` uses it to refuse a command that clashes with a cvar, and
 * Newer Game's demo split to save values it borrows.
 *
 * @param {string} var_name cvar name
 * @returns {string} the value text, or '' when no cvar has that name
 */
export function Cvar_VariableString( var_name ) {

	const _var = Cvar_FindVar( var_name );
	if ( ! _var )
		return '';
	return _var.string;

}

/*
============
Cvar_CompleteVariable
============
*/
/**
 * Tab completion for the console (`keys.js`, after command names fail): finds the first registered cvar whose name
 * starts with `partial` (case-sensitive). The list is searched newest-registered first.
 *
 * @param {string} partial typed prefix
 * @returns {?string} the full cvar name, or null when `partial` is empty or matches nothing
 */
export function Cvar_CompleteVariable( partial ) {

	const len = partial.length;

	if ( len === 0 )
		return null;

	// check functions
	let _var = cvar_vars;
	while ( _var ) {

		if ( _var.name.substring( 0, len ) === partial )
			return _var.name;
		_var = _var.next;

	}

	return null;

}

/*
============
Cvar_Set
============
*/
/**
 * Sets a cvar's string and numeric value as the player's or game's real choice. Ends any `Cvar_SetTemporary` borrow.
 * A `server` cvar whose text changed is announced through the `Cvar_SetServerBroadcast` callback. An `archive` cvar
 * is saved to localStorage (`quake_cvar_<name>`) when its text changed or a borrow just ended; a full or unavailable
 * storage prints a warning and the value still applies for the session. An unknown name prints
 * "Cvar_Set: variable ... not found" and changes nothing.
 *
 * @param {string} var_name cvar name
 * @param {string} value new value text (`value` becomes its `Q_atof` reading)
 */
export function Cvar_Set( var_name, value ) {

 Cvar_SetInternal( var_name, value, false );

}

/**
 * A presentation scope can borrow an archived value without saving it as the player's choice. Both immediate storage
 * and config serialization retain the pre-scope value. An ordinary Set (including an unchanged explicit value) ends
 * the borrow and records the user's/new game's actual choice. Repeated temporary sets keep the value from before the
 * first one. Used by Newer Game's demo split (`r_demosplit.js`); `server` cvars are still announced.
 *
 * @param {string} var_name cvar name (an unknown name prints a warning and changes nothing)
 * @param {string} value value text to apply for the scope
 */
export function Cvar_SetTemporary( var_name, value ) {

 Cvar_SetInternal( var_name, value, true );

}

/**
 * Release only a value still owned by the presentation scope. An explicit console/menu change has already cleared
 * the borrow and must not be undone. Restoring goes through `Cvar_Set`, so it also ends the borrow.
 *
 * @param {string} var_name cvar name
 * @returns {boolean} true when a borrowed value was restored; false when the cvar is unknown or not borrowed
 */
export function Cvar_RestoreTemporary( var_name ) {

 const variable = Cvar_FindVar( var_name );
 if ( variable?._temporaryString === undefined ) return false;
 Cvar_Set( var_name, variable._temporaryString );
 return true;

}

function Cvar_SetInternal( var_name, value, temporary ) {

	const _var = Cvar_FindVar( var_name );
	if ( ! _var ) {

		// there is an error in C code if this happens
		Con_Printf( 'Cvar_Set: variable ' + var_name + ' not found\n' );
		return;

	}

	const borrowed = _var._temporaryString !== undefined;
 if ( temporary ) {
  if ( ! borrowed ) _var._temporaryString = _var.string;
 } else delete _var._temporaryString;
 const changed = ( _var.string !== value );

	_var.string = value;
	_var.value = Q_atof( _var.string );

	if ( _var.server && changed ) {

		if ( _serverBroadcast != null ) {

			_serverBroadcast( '"' + _var.name + '" changed to "' + _var.string + '"\n' );

		}

	}

	// Save to localStorage if this cvar should be archived
	if ( _var.archive && ! temporary && ( changed || borrowed ) ) {

		Cvar_SaveToStorage( _var );

	}

}

/*
============
Cvar_SetValue
============
*/
/**
 * Sets a cvar from a number, as `Cvar_Set` (same broadcast, storage and unknown-name behaviour). A finite number is
 * written with six decimals ('1.000000'), as WinQuake's `va("%f", value)` does, which also keeps `Q_atof` able to
 * read it back; NaN and infinities are written with `String()`.
 *
 * @param {string} var_name cvar name
 * @param {number} value new value
 */
export function Cvar_SetValue( var_name, value ) {

	// Match original Quake behavior (va("%f", value)) and avoid scientific
	// notation strings that Q_atof cannot parse correctly.
	if ( Number.isFinite( value ) === true ) {

		Cvar_Set( var_name, value.toFixed( 6 ) );
		return;

	}

	Cvar_Set( var_name, String( value ) );

}

/*
============
Cvar_RegisterVariable
============
*/
/**
 * Adds a freestanding variable to the variable list, normally from a subsystem's init function before any console
 * commands run. For an `archive` cvar a value saved in localStorage (`quake_cvar_<name>`) replaces the default
 * string; `value` is then reparsed. The cvar stays registered for the rest of the session. A name already used by a
 * cvar or a command prints a message and the variable is not registered.
 *
 * @param {cvar_t} variable cvar to register (mutated: `string`, `value`, `next`)
 */
export function Cvar_RegisterVariable( variable ) {

	// first check to see if it has already been defined
	if ( Cvar_FindVar( variable.name ) ) {

		Con_Printf( 'Can\'t register variable ' + variable.name + ', already defined\n' );
		return;

	}

	// check for overlap with a command
	if ( Cmd_Exists( variable.name ) ) {

		Con_Printf( 'Cvar_RegisterVariable: ' + variable.name + ' is a command\n' );
		return;

	}

	// Check for saved value in localStorage (for archived cvars)
	if ( variable.archive ) {

		const savedValue = Cvar_LoadFromStorage( variable.name );
		if ( savedValue !== null ) {

			variable.string = savedValue;

		}

	}

	// parse the value
	variable.value = Q_atof( variable.string );

	// link the variable in
	variable.next = cvar_vars;
	cvar_vars = variable;

}

/*
============
Cvar_Command
============
*/
/**
 * Handles variable inspection and changing from the console. Called by `Cmd_ExecuteString` for a line whose first
 * word is not a command: with no argument it prints `"name" is "value"`, otherwise it sets the cvar to the first
 * argument through `Cvar_Set`.
 *
 * @returns {boolean} true when `Cmd_Argv(0)` named a cvar (the line was handled), false otherwise
 */
export function Cvar_Command() {

	const v = Cvar_FindVar( Cmd_Argv( 0 ) );
	if ( ! v )
		return false;

	// perform a variable print or set
	if ( Cmd_Argc() === 1 ) {

		Con_Printf( '"' + v.name + '" is "' + v.string + '"\n' );
		return true;

	}

	Cvar_Set( v.name, Cmd_Argv( 1 ) );
	return true;

}

/*
============
Cvar_WriteVariables
============
*/
/**
 * Writes lines containing "set variable value" for all variables with the archive flag set to true; in this port
 * each line is `name "value"\n`, and a borrowed (`Cvar_SetTemporary`) cvar writes its pre-borrow value.
 * `Host_WriteConfiguration` appends the result to the key bindings and saves it in localStorage under `quake_config` (a mission pack's own key, `GameSelection_ConfigKey`).
 *
 * @returns {string} configuration text for every archived cvar, newest-registered first
 */
export function Cvar_WriteVariables() {

	const lines = [];
	let _var = cvar_vars;
	while ( _var ) {

		if ( _var.archive )
			lines.push( _var.name + ' "' + ( _var._temporaryString ?? _var.string ) + '"\n' );
		_var = _var.next;

	}

	return lines.join( '' );

}
