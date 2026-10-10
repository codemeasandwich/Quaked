/**
 * @module engine/common/cmd
 *
 * Quake's command buffer and command registry (WinQuake cmd.c): Cbuf text, registered commands, aliases and the
 * current command's arguments.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `cmd_source`; module-level variables `cmd_text`, `cmd_alias`, `cmd_wait`, `cmd_argc`,
 * `cmd_args`, `cmd_functions`, `_getClientState`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * An unknown command prints `Unknown command` to the console.
 */
// Ported from: WinQuake/cmd.c -- Quake script command processing module

import { Con_Printf, SZ_Alloc, SZ_Clear, SZ_Write, SZ_Print, com_token, COM_Parse, MSG_WriteByte, com_argc, com_argv } from './common.js';
import { Cvar_Command, Cvar_VariableString } from './cvar.js';
import { COM_LoadFileAsString } from './pak.js';
import { clc_stringcmd } from './protocol.js';

/*
=============================================================================

						COMMAND BUFFER

=============================================================================
*/

const MAX_ALIAS_NAME = 32;
const MAX_ARGS = 80;

// Command source types
export const src_client = 0; // came in over a net connection as a clc_stringcmd
export const src_command = 1; // from the command buffer

let cmd_text = { allowoverflow: false, overflowed: false, data: null, maxsize: 0, cursize: 0 };

let cmd_alias = null;
let cmd_wait = false;

let cmd_argc = 0;
const cmd_argv = new Array( MAX_ARGS ).fill( '' );
let cmd_args = null;

export let cmd_source = src_command;

let cmd_functions = null; // linked list of registered commands

// Callback injection for client state (to avoid circular dependency with client.js)
let _getClientState = null;

/*
============
Cmd_SetClientCallbacks
============
*/
/**
 * Wires up client state access for `Cmd_ForwardToServer` (callback injection, to avoid a circular dependency with
 * client.js). Called once from `Host_Init` in host.js after client.js is loaded; the callback is kept for the rest of
 * the session and replaces any earlier one.
 *
 * @param {{ getClientState: function(): { cls: object, ca_connected: number } }} callbacks `getClientState` returns
 *   the client static state `cls` (read for `state`, `demoplayback` and the outgoing `message` sizebuf_t) and the
 *   `ca_connected` constant to compare `cls.state` against
 */
export function Cmd_SetClientCallbacks( callbacks ) {

	_getClientState = callbacks.getClientState;

}

/*
============
Cbuf_Init
============
*/
/**
 * Allocates the 8192-byte command buffer (space for commands and script files). Called once from `Host_Init`, before
 * `Cmd_Init`; any text already queued is discarded because a new buffer replaces the old one.
 */
export function Cbuf_Init() {

	SZ_Alloc( cmd_text, 8192 ); // space for commands and script files

}

/*
============
Cbuf_AddText
============
*/
/**
 * Adds command text at the end of the buffer, to run on a later `Cbuf_Execute` (once per host frame). Each character
 * is stored as one byte (its char code truncated to 8 bits). No newline is added: callers end each command with
 * `\n` or `;`.
 *
 * Prints `Cbuf_AddText: overflow` and drops the whole text, adding nothing, when it would not fit (the buffer holds
 * at most 8191 bytes of pending text).
 *
 * @param {string} text command text, one or more commands separated by `\n` or `;`
 */
export function Cbuf_AddText( text ) {

	const l = text.length;

	if ( cmd_text.cursize + l >= cmd_text.maxsize ) {

		Con_Printf( 'Cbuf_AddText: overflow\n' );
		return;

	}

	for ( let i = 0; i < l; i ++ )
		cmd_text.data[ cmd_text.cursize + i ] = text.charCodeAt( i );
	cmd_text.cursize += l;

}

/*
============
Cbuf_InsertText
============
*/
/**
 * Adds command text immediately after the current command, ahead of anything still queued, so it runs next. Used by
 * `exec`, `stuffcmds` and alias expansion. FIXME (from the source): actually change the command buffer to do less
 * copying.
 *
 * The WinQuake comment says it adds a `\n` to the text; this port does not, so callers pass text that already ends in
 * a newline (alias values and `stuffcmds` lines do). If the text alone does not fit, `Cbuf_AddText` drops it and the
 * queued commands are put back unchanged.
 *
 * @param {string} text command text to run before the rest of the buffer
 * @throws {Error} via `Sys_Error` (`SZ_GetSpace: overflow without allowoverflow set`) when the inserted text fits but
 *   the queued commands copied back after it no longer do
 */
export function Cbuf_InsertText( text ) {

	// copy off any commands still remaining in the exec buffer
	let temp = null;
	const templen = cmd_text.cursize;
	if ( templen ) {

		temp = new Uint8Array( templen );
		temp.set( cmd_text.data.subarray( 0, templen ) );
		SZ_Clear( cmd_text );

	}

	// add the entire text of the file
	Cbuf_AddText( text );

	// add the copied off data
	if ( templen ) {

		SZ_Write( cmd_text, temp, templen );

	}

}

/*
============
Cbuf_Execute
============
*/
/**
 * Runs queued commands one line at a time. Called once per host frame from `Host_Frame`. A command ends at `\n` or at
 * a `;` outside double quotes; each is removed from the buffer and passed to `Cmd_ExecuteString` with source
 * `src_command`. Commands may queue more text, which runs in the same call. A `wait` command stops the loop, leaving
 * the rest of the text in the buffer for the next frame.
 */
export function Cbuf_Execute() {

	while ( cmd_text.cursize ) {

		// find a \n or ; line break
		let quotes = 0;
		let i;
		for ( i = 0; i < cmd_text.cursize; i ++ ) {

			if ( cmd_text.data[ i ] === 0x22 ) // '"'
				quotes ++;
			if ( ! ( quotes & 1 ) && cmd_text.data[ i ] === 0x3B ) // ';'
				break; // don't break if inside a quoted string
			if ( cmd_text.data[ i ] === 0x0A ) // '\n'
				break;

		}

		// extract the line as a string
		let line = '';
		for ( let j = 0; j < i; j ++ )
			line += String.fromCharCode( cmd_text.data[ j ] );

		// delete the text from the command buffer and move remaining commands down
		if ( i === cmd_text.cursize ) {

			cmd_text.cursize = 0;

		} else {

			i ++;
			cmd_text.cursize -= i;
			cmd_text.data.copyWithin( 0, i, i + cmd_text.cursize );

		}

		// execute the command line
		Cmd_ExecuteString( line, src_command );

		if ( cmd_wait ) {

			// skip out while text still remains in buffer, leaving it
			// for next frame
			cmd_wait = false;
			break;

		}

	}

}

/*
=============================================================================

					COMMAND EXECUTION

=============================================================================
*/

/*
============
Cmd_Init
============
*/
/**
 * Registers the command system's own commands: `stuffcmds`, `exec`, `echo`, `alias`, `cmd` (`Cmd_ForwardToServer`)
 * and `wait`. Called once from `Host_Init`, after `Cbuf_Init`.
 */
export function Cmd_Init() {

	// register our commands
	Cmd_AddCommand( 'stuffcmds', Cmd_StuffCmds_f );
	Cmd_AddCommand( 'exec', Cmd_Exec_f );
	Cmd_AddCommand( 'echo', Cmd_Echo_f );
	Cmd_AddCommand( 'alias', Cmd_Alias_f );
	Cmd_AddCommand( 'cmd', Cmd_ForwardToServer );
	Cmd_AddCommand( 'wait', Cmd_Wait_f );

}

/*
============
Cmd_Argc
============
*/
/**
 * Number of tokens in the command being executed, including the command name. Valid while a command function runs;
 * replaced by the next `Cmd_TokenizeString`.
 *
 * @returns {number} token count, 0 to 80 (MAX_ARGS); 0 for an empty line
 */
export function Cmd_Argc() {

	return cmd_argc;

}

/*
============
Cmd_Argv
============
*/
/**
 * One token of the command being executed. Valid until the next `Cmd_TokenizeString`.
 *
 * @param {number} arg token index; 0 is the command name
 * @returns {string} the token with surrounding quotes removed, or `''` when `arg` is outside 0..`Cmd_Argc()`-1
 */
export function Cmd_Argv( arg ) {

	if ( arg < 0 || arg >= cmd_argc )
		return '';
	return cmd_argv[ arg ];

}

/*
============
Cmd_Args
============
*/
/**
 * Everything after the command name, as one string. Valid until the next `Cmd_TokenizeString`.
 *
 * @returns {?string} the raw rest of the line from the first argument on (quotes and spacing kept, and anything after a
 *   newline in the tokenized text), or null when the command has no arguments
 */
export function Cmd_Args() {

	return cmd_args;

}

/*
============
Cmd_TokenizeString
============
*/
/**
 * Parses the given string into command line tokens, replacing the arguments read by `Cmd_Argc`, `Cmd_Argv` and
 * `Cmd_Args`. Called by `Cmd_ExecuteString`, and directly by callers that only need the arguments. Stops at the first
 * newline (a newline separates commands in the buffer); tokens come from `COM_Parse`, so quoted strings are one token
 * and `//` comments are skipped. Tokens past the 80th (MAX_ARGS) are dropped.
 *
 * @param {string} text one command line
 */
export function Cmd_TokenizeString( text ) {

	// clear the args from the last string
	cmd_argc = 0;
	cmd_args = null;

	let pos = 0;

	while ( true ) {

		// skip whitespace up to a \n
		while ( pos < text.length && text.charCodeAt( pos ) <= 32 && text.charAt( pos ) !== '\n' ) {

			pos ++;

		}

		if ( pos >= text.length || text.charAt( pos ) === '\n' ) {

			// a newline separates commands in the buffer
			break;

		}

		if ( cmd_argc === 1 )
			cmd_args = text.substring( pos );

		const remaining = COM_Parse( text.substring( pos ) );
		if ( remaining === null ) return;

		pos = text.length - ( remaining ? remaining.length : 0 );

		if ( cmd_argc < MAX_ARGS ) {

			cmd_argv[ cmd_argc ] = com_token;
			cmd_argc ++;

		}

	}

}

/*
============
Cmd_AddCommand
============
*/
/**
 * Registers a console command. Usually called at subsystem init; registrations last for the whole session (there is no
 * removal). The newest command is searched first.
 *
 * Prints a message and registers nothing when `cmd_name` is already a command, or is a cvar whose value is a
 * non-empty string.
 *
 * @param {string} cmd_name command name; matched case-insensitively by `Cmd_ExecuteString`
 * @param {function(): void} fn called with no arguments when the command runs; it reads its arguments with
 *   `Cmd_Argc`/`Cmd_Argv`/`Cmd_Args` and `cmd_source`
 */
export function Cmd_AddCommand( cmd_name, fn ) {

	// fail if the command is a variable name
	if ( Cvar_VariableString( cmd_name ) ) {

		// Only warn if the variable string is non-empty
		const varStr = Cvar_VariableString( cmd_name );
		if ( varStr.length > 0 ) {

			Con_Printf( 'Cmd_AddCommand: ' + cmd_name + ' already defined as a var\n' );
			return;

		}

	}

	// fail if the command already exists
	let cmd = cmd_functions;
	while ( cmd ) {

		if ( cmd.name === cmd_name ) {

			Con_Printf( 'Cmd_AddCommand: ' + cmd_name + ' already defined\n' );
			return;

		}

		cmd = cmd.next;

	}

	cmd = {
		name: cmd_name,
		fn: fn,
		next: cmd_functions
	};
	cmd_functions = cmd;

}

/*
============
Cmd_Exists
============
*/
/**
 * Tells whether a command with this name is registered (aliases and cvars are not checked).
 *
 * @param {string} cmd_name command name, compared case-sensitively
 * @returns {boolean} true when the command is registered
 */
export function Cmd_Exists( cmd_name ) {

	let cmd = cmd_functions;
	while ( cmd ) {

		if ( cmd.name === cmd_name )
			return true;
		cmd = cmd.next;

	}

	return false;

}

/*
============
Cmd_CompleteCommand
============
*/
/**
 * Finds a registered command that starts with `partial`, for console Tab completion (keys.js tries this before
 * `Cvar_CompleteVariable`). Aliases are not searched.
 *
 * @param {string} partial typed prefix, compared case-sensitively
 * @returns {?string} the first matching command name (most recently registered first), or null when `partial` is
 *   empty or nothing matches
 */
export function Cmd_CompleteCommand( partial ) {

	const len = partial.length;

	if ( len === 0 )
		return null;

	// check functions
	let cmd = cmd_functions;
	while ( cmd ) {

		if ( cmd.name.substring( 0, len ) === partial )
			return cmd.name;
		cmd = cmd.next;

	}

	return null;

}

/*
============
Cmd_ExecuteString
============
*/
/**
 * A complete command line has been parsed, so try to execute it. FIXME (from the source): lookupnoadd the token to
 * speed search?
 *
 * Sets `cmd_source`, tokenizes `text`, then tries, by case-insensitive name: a registered command (called at once), an
 * alias (its text is inserted at the front of the command buffer and runs on this or a later `Cbuf_Execute`), and
 * finally a cvar (`Cvar_Command` shows or sets it). Otherwise prints `Unknown command "<name>"`. Called by
 * `Cbuf_Execute` for buffered text and directly for `clc_stringcmd` text from clients (sv_user.js) and some built-in
 * commands.
 *
 * @param {string} text one command line
 * @param {number} src `src_command` (from the command buffer) or `src_client` (came in over a net connection as a
 *   clc_stringcmd); left in `cmd_source` until the next call
 * @throws {Error} whatever the command function throws (for example `Host_Error`); this function adds none
 */
export function Cmd_ExecuteString( text, src ) {

	cmd_source = src;
	Cmd_TokenizeString( text );

	// execute the command line
	if ( Cmd_Argc() === 0 )
		return; // no tokens

	// check functions
	let cmd = cmd_functions;
	while ( cmd ) {

		if ( cmd_argv[ 0 ].toLowerCase() === cmd.name.toLowerCase() ) {

			cmd.fn();
			return;

		}

		cmd = cmd.next;

	}

	// check alias
	let a = cmd_alias;
	while ( a ) {

		if ( cmd_argv[ 0 ].toLowerCase() === a.name.toLowerCase() ) {

			Cbuf_InsertText( a.value );
			return;

		}

		a = a.next;

	}

	// check cvars
	if ( ! Cvar_Command() )
		Con_Printf( 'Unknown command "' + Cmd_Argv( 0 ) + '"\n' );

}

/*
============
Cmd_Wait_f

Causes execution of the remainder of the command buffer to be delayed until
next frame.
============
*/
function Cmd_Wait_f() {

	cmd_wait = true;

}

/*
===============
Cmd_Exec_f

Executes a script file from the game data
===============
*/
function Cmd_Exec_f() {

	if ( Cmd_Argc() !== 2 ) {

		Con_Printf( 'exec <filename> : execute a script file\n' );
		return;

	}

	const f = COM_LoadFileAsString( Cmd_Argv( 1 ) );
	if ( f === null ) {

		Con_Printf( 'couldn\'t exec ' + Cmd_Argv( 1 ) + '\n' );
		return;

	}

	Con_Printf( 'execing ' + Cmd_Argv( 1 ) + '\n' );

	Cbuf_InsertText( f );

}

/*
===============
Cmd_Echo_f

Just prints the rest of the line to the console
===============
*/
function Cmd_Echo_f() {

	for ( let i = 1; i < Cmd_Argc(); i ++ )
		Con_Printf( Cmd_Argv( i ) + ' ' );
	Con_Printf( '\n' );

}

/*
===============
Cmd_Alias_f

Creates a new command that executes a command string (possibly ; separated)
===============
*/
function Cmd_Alias_f() {

	if ( Cmd_Argc() === 1 ) {

		Con_Printf( 'Current alias commands:\n' );
		let a = cmd_alias;
		while ( a ) {

			Con_Printf( a.name + ' : ' + a.value + '\n' );
			a = a.next;

		}

		return;

	}

	const s = Cmd_Argv( 1 );
	if ( s.length >= MAX_ALIAS_NAME ) {

		Con_Printf( 'Alias name is too long\n' );
		return;

	}

	// if the alias already exists, reuse it
	let a = cmd_alias;
	while ( a ) {

		if ( s === a.name )
			break;
		a = a.next;

	}

	if ( ! a ) {

		a = { name: '', value: '', next: cmd_alias };
		cmd_alias = a;

	}

	a.name = s;

	// copy the rest of the command line
	let cmd = '';
	const c = Cmd_Argc();
	for ( let i = 2; i < c; i ++ ) {

		cmd += Cmd_Argv( i );
		if ( i !== c )
			cmd += ' ';

	}

	cmd += '\n';

	a.value = cmd;

}

/*
===============
Cmd_StuffCmds_f

Adds command line parameters as script statements
Commands lead with a +, and continue until a - or another +
===============
*/
function Cmd_StuffCmds_f() {

	if ( Cmd_Argc() !== 1 ) {

		Con_Printf( 'stuffcmds : execute command line parameters\n' );
		return;

	}

	// build the combined string to parse from
	let s = 0;
	for ( let i = 1; i < com_argc; i ++ ) {

		if ( com_argv[ i ] == null )
			continue; // NEXTSTEP nulls out -NXHost
		s += com_argv[ i ].length + 1;

	}

	if ( s === 0 )
		return;

	let text = '';
	for ( let i = 1; i < com_argc; i ++ ) {

		if ( com_argv[ i ] == null )
			continue; // NEXTSTEP nulls out -NXHost
		text += com_argv[ i ];
		if ( i !== com_argc - 1 )
			text += ' ';

	}

	// pull out the commands
	let build = '';

	for ( let i = 0; i < text.length - 1; i ++ ) {

		if ( text.charAt( i ) === '+' ) {

			i ++;

			let j = i;
			while ( j < text.length && text.charAt( j ) !== '+' && text.charAt( j ) !== '-' ) {

				j ++;

			}

			build += text.substring( i, j );
			build += '\n';
			i = j - 1;

		}

	}

	if ( build.length > 0 )
		Cbuf_InsertText( build );

}

/*
================
Cmd_CheckParm
================
*/
/**
 * Looks for a parameter in the current command's arguments (not the program command line; that is `COM_CheckParm`).
 *
 * @param {string} parm parameter to find, compared case-insensitively; null or undefined prints
 *   `Cmd_CheckParm: NULL` and returns 0
 * @returns {number} the position (1 to argc-1) in the command's argument list where the given parameter appears, or
 *   0 if not present
 */
export function Cmd_CheckParm( parm ) {

	if ( parm == null ) {

		Con_Printf( 'Cmd_CheckParm: NULL\n' );
		return 0;

	}

	for ( let i = 1; i < Cmd_Argc(); i ++ ) {

		if ( Cmd_Argv( i ).toLowerCase() === parm.toLowerCase() )
			return i;

	}

	return 0;

}

/*
===================
Cmd_ForwardToServer
===================
*/
/**
 * Sends the entire command line over to the server as a `clc_stringcmd`, written to the client's outgoing
 * `cls.message` buffer for the next packet. Runs as the `cmd` command (which sends only its arguments), and is called
 * by host commands in host_cmd.js typed on a client that must run on the server (those send their own name first).
 * Arguments come from the current command (`Cmd_Argv`/`Cmd_Args`).
 *
 * Prints a message and sends nothing when `Cmd_SetClientCallbacks` has not run or the client is not connected; sends
 * nothing during demo playback.
 *
 * @throws {Error} via `Sys_Error` from `SZ_GetSpace` when the text does not fit in `cls.message`
 */
export function Cmd_ForwardToServer() {

	// Get client state through callback (avoids circular dependency)
	if ( _getClientState == null ) {

		Con_Printf( 'Cmd_ForwardToServer: client not initialized\n' );
		return;

	}

	const clientState = _getClientState();
	const cls = clientState.cls;
	const ca_connected = clientState.ca_connected;

	if ( cls.state !== ca_connected ) {

		Con_Printf( 'Can\'t "' + Cmd_Argv( 0 ) + '", not connected\n' );
		return;

	}

	if ( cls.demoplayback )
		return; // not really connected

	MSG_WriteByte( cls.message, clc_stringcmd );

	// If the command isn't "cmd", write the command name
	if ( Cmd_Argv( 0 ).toLowerCase() !== 'cmd' ) {

		SZ_Print( cls.message, Cmd_Argv( 0 ) );
		SZ_Print( cls.message, ' ' );

	}

	// Write the arguments or just a newline
	if ( Cmd_Argc() > 1 ) {

		SZ_Print( cls.message, Cmd_Args() );

	} else {

		SZ_Print( cls.message, '\n' );

	}

}
