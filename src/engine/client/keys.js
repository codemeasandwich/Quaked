/**
 * @module engine/client/keys
 *
 * Keys (WinQuake keys.c): key numbers, bindings, the console's line editing, and which device holds a key down.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `key_linepos`, `shift_down`, `key_lastpress`, `edit_line`, `history_line`, `key_count`,
 * `chat_buffer`, `team_message`; module-level variables `_cls`, `_realVid`; 1 module-level collection (Map/Set).
 *
 * Errors: calls `Sys_Error` (fatal) at 2 places.
 *
 * Drawing and command callbacks are injected with `Key_SetExternals`.
 */
// Ported from: WinQuake/keys.c, WinQuake/keys.h -- keyboard input handling

import { Cbuf_AddText } from '../common/cmd.js';
import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv, Cmd_CompleteCommand } from '../common/cmd.js';
import { Cvar_CompleteVariable } from '../common/cvar.js';
import { Con_Printf, con_forcedup, con_backscroll, Con_SetBackscroll, con_totallines } from '../common/console.js';
import { M_Keydown, M_ToggleMenu_f } from './menu.js';
import { SCR_UpdateScreen } from '../render/gl_screen.js';
import { Sys_Error } from '../common/sys.js';
import { Draw_GetVirtualWidth, Draw_GetVirtualHeight } from '../render/gl_draw.js';
import { R_BestiaryKey } from '../common/hooks.js'; // installed by newer/ui/r_bestiary.js

/*
==============================================================================

			KEY CONSTANTS

==============================================================================
*/

// these are the key numbers that should be passed to Key_Event
export const K_TAB = 9;
import { key_dest, set_key_dest, key_game, key_console, key_message, key_menu } from '../common/key_dest.js';
// where keys go lives in a leaf (card [44g], D1a), so modules below the client read it without importing this one
export { key_dest, set_key_dest, key_game, key_console, key_message, key_menu } from '../common/key_dest.js';
export const K_ENTER = 13;
export const K_ESCAPE = 27;
export const K_SPACE = 32;

// normal keys should be passed as lowercased ascii

export const K_BACKSPACE = 127;
export const K_UPARROW = 128;
export const K_DOWNARROW = 129;
export const K_LEFTARROW = 130;
export const K_RIGHTARROW = 131;

export const K_ALT = 132;
export const K_CTRL = 133;
export const K_SHIFT = 134;
export const K_F1 = 135;
export const K_F2 = 136;
export const K_F3 = 137;
export const K_F4 = 138;
export const K_F5 = 139;
export const K_F6 = 140;
export const K_F7 = 141;
export const K_F8 = 142;
export const K_F9 = 143;
export const K_F10 = 144;
export const K_F11 = 145;
export const K_F12 = 146;
export const K_INS = 147;
export const K_DEL = 148;
export const K_PGDN = 149;
export const K_PGUP = 150;
export const K_HOME = 151;
export const K_END = 152;

export const K_PAUSE = 255;

// mouse buttons generate virtual keys
export const K_MOUSE1 = 200;
export const K_MOUSE2 = 201;
export const K_MOUSE3 = 202;

// joystick buttons
export const K_JOY1 = 203;
export const K_JOY2 = 204;
export const K_JOY3 = 205;
export const K_JOY4 = 206;

// aux keys are for multi-buttoned joysticks
export const K_AUX1 = 207;
export const K_AUX2 = 208;
export const K_AUX3 = 209;
export const K_AUX4 = 210;
export const K_AUX5 = 211;
export const K_AUX6 = 212;
export const K_AUX7 = 213;
export const K_AUX8 = 214;
export const K_AUX9 = 215;
export const K_AUX10 = 216;
export const K_AUX11 = 217;
export const K_AUX12 = 218;
export const K_AUX13 = 219;
export const K_AUX14 = 220;
export const K_AUX15 = 221;
export const K_AUX16 = 222;
export const K_AUX17 = 223;
export const K_AUX18 = 224;
export const K_AUX19 = 225;
export const K_AUX20 = 226;
export const K_AUX21 = 227;
export const K_AUX22 = 228;
export const K_AUX23 = 229;
export const K_AUX24 = 230;
export const K_AUX25 = 231;
export const K_AUX26 = 232;
export const K_AUX27 = 233;
export const K_AUX28 = 234;
export const K_AUX29 = 235;
export const K_AUX30 = 236;
export const K_AUX31 = 237;
export const K_AUX32 = 238;

// JACK: Intellimouse(c) Mouse Wheel Support
export const K_MWHEELUP = 239;
export const K_MWHEELDOWN = 240;

/*
==============================================================================

			KEY DESTINATION MODES

==============================================================================
*/


/*
==============================================================================

			KEY STATE

==============================================================================
*/

const MAXCMDLINE = 256;

// key_lines[32][MAXCMDLINE]
export const key_lines = [];
for ( let i = 0; i < 32; i ++ ) {

	key_lines[ i ] = new Array( MAXCMDLINE ).fill( 0 );

}

export let key_linepos = 1;
export let shift_down = false;
export let key_lastpress = 0;

export let edit_line = 0;
export let history_line = 0;


export let key_count = 0; // incremented every key event

export const keybindings = new Array( 256 ).fill( null );
const consolekeys = new Array( 256 ).fill( false );
const menubound = new Array( 256 ).fill( false );
const keyshift = new Array( 256 ).fill( 0 );
export const key_repeats = new Array( 256 ).fill( 0 );
const keydown = new Array( 256 ).fill( false );

/*
==============================================================================

			KEYNAME TABLE

==============================================================================
*/

const keynames = [
	{ name: 'TAB', keynum: K_TAB },
	{ name: 'ENTER', keynum: K_ENTER },
	{ name: 'ESCAPE', keynum: K_ESCAPE },
	{ name: 'SPACE', keynum: K_SPACE },
	{ name: 'BACKSPACE', keynum: K_BACKSPACE },
	{ name: 'UPARROW', keynum: K_UPARROW },
	{ name: 'DOWNARROW', keynum: K_DOWNARROW },
	{ name: 'LEFTARROW', keynum: K_LEFTARROW },
	{ name: 'RIGHTARROW', keynum: K_RIGHTARROW },

	{ name: 'ALT', keynum: K_ALT },
	{ name: 'CTRL', keynum: K_CTRL },
	{ name: 'SHIFT', keynum: K_SHIFT },

	{ name: 'F1', keynum: K_F1 },
	{ name: 'F2', keynum: K_F2 },
	{ name: 'F3', keynum: K_F3 },
	{ name: 'F4', keynum: K_F4 },
	{ name: 'F5', keynum: K_F5 },
	{ name: 'F6', keynum: K_F6 },
	{ name: 'F7', keynum: K_F7 },
	{ name: 'F8', keynum: K_F8 },
	{ name: 'F9', keynum: K_F9 },
	{ name: 'F10', keynum: K_F10 },
	{ name: 'F11', keynum: K_F11 },
	{ name: 'F12', keynum: K_F12 },

	{ name: 'INS', keynum: K_INS },
	{ name: 'DEL', keynum: K_DEL },
	{ name: 'PGDN', keynum: K_PGDN },
	{ name: 'PGUP', keynum: K_PGUP },
	{ name: 'HOME', keynum: K_HOME },
	{ name: 'END', keynum: K_END },

	{ name: 'MOUSE1', keynum: K_MOUSE1 },
	{ name: 'MOUSE2', keynum: K_MOUSE2 },
	{ name: 'MOUSE3', keynum: K_MOUSE3 },

	{ name: 'JOY1', keynum: K_JOY1 },
	{ name: 'JOY2', keynum: K_JOY2 },
	{ name: 'JOY3', keynum: K_JOY3 },
	{ name: 'JOY4', keynum: K_JOY4 },

	{ name: 'AUX1', keynum: K_AUX1 },
	{ name: 'AUX2', keynum: K_AUX2 },
	{ name: 'AUX3', keynum: K_AUX3 },
	{ name: 'AUX4', keynum: K_AUX4 },
	{ name: 'AUX5', keynum: K_AUX5 },
	{ name: 'AUX6', keynum: K_AUX6 },
	{ name: 'AUX7', keynum: K_AUX7 },
	{ name: 'AUX8', keynum: K_AUX8 },
	{ name: 'AUX9', keynum: K_AUX9 },
	{ name: 'AUX10', keynum: K_AUX10 },
	{ name: 'AUX11', keynum: K_AUX11 },
	{ name: 'AUX12', keynum: K_AUX12 },
	{ name: 'AUX13', keynum: K_AUX13 },
	{ name: 'AUX14', keynum: K_AUX14 },
	{ name: 'AUX15', keynum: K_AUX15 },
	{ name: 'AUX16', keynum: K_AUX16 },
	{ name: 'AUX17', keynum: K_AUX17 },
	{ name: 'AUX18', keynum: K_AUX18 },
	{ name: 'AUX19', keynum: K_AUX19 },
	{ name: 'AUX20', keynum: K_AUX20 },
	{ name: 'AUX21', keynum: K_AUX21 },
	{ name: 'AUX22', keynum: K_AUX22 },
	{ name: 'AUX23', keynum: K_AUX23 },
	{ name: 'AUX24', keynum: K_AUX24 },
	{ name: 'AUX25', keynum: K_AUX25 },
	{ name: 'AUX26', keynum: K_AUX26 },
	{ name: 'AUX27', keynum: K_AUX27 },
	{ name: 'AUX28', keynum: K_AUX28 },
	{ name: 'AUX29', keynum: K_AUX29 },
	{ name: 'AUX30', keynum: K_AUX30 },
	{ name: 'AUX31', keynum: K_AUX31 },
	{ name: 'AUX32', keynum: K_AUX32 },

	{ name: 'PAUSE', keynum: K_PAUSE },

	{ name: 'MWHEELUP', keynum: K_MWHEELUP },
	{ name: 'MWHEELDOWN', keynum: K_MWHEELDOWN },

	{ name: 'SEMICOLON', keynum: 59 }, // ';' - because a raw semicolon separates commands
];

/*
==============================================================================

			LINE TYPING INTO THE CONSOLE

==============================================================================
*/

// External references we need
// These are set by other modules to avoid circular imports
let _cls = { state: 0, demoplayback: false, signon: 0 };
let _realVid = { height: 480, width: 640 };
const _vid = {
	get width() { return Draw_GetVirtualWidth(); },
	get height() { return Draw_GetVirtualHeight(); }
};

/**
 * Hands keys.js the client state it reads without importing the client (WinQuake reads the `cls` and `vid` globals).
 * Called once from `Host_Init` (host.js) after the console and screen are wired, with `{ cls, vid }`; a key that is
 * missing or falsy leaves the current value in place.
 *
 * Keys and the defaults used until it is wired:
 * - `cls` (`client_static_t`): `state` is read after Enter in the console (0, ca_disconnected, forces
 *   `SCR_UpdateScreen`) and `demoplayback` by `Key_Event` (most keys then bring up the menu). Default
 *   `{ state: 0, demoplayback: false, signon: 0 }`.
 * - `vid` (`viddef_t`, `width`/`height` in CSS pixels): stored as the real video size. Default
 *   `{ height: 480, width: 640 }`. Nothing in this module reads it at present; line layout uses the virtual size from
 *   `Draw_GetVirtualWidth`/`Draw_GetVirtualHeight` instead.
 *
 * The objects are kept by reference for the page's lifetime, so later changes to them are seen here.
 *
 * @param {{ cls?: client_static_t, vid?: viddef_t }} externals the references to keep
 */
export function Key_SetExternals( externals ) {

	if ( externals.cls ) _cls = externals.cls;
	if ( externals.vid ) _realVid = externals.vid;

}

// Chat buffer
export let chat_buffer = '';
export let team_message = false;

/*
====================
Key_Console

Interactive line editing and console scrollback
====================
*/
function Key_Console( key ) {

	if ( key === K_ENTER ) {

		// skip the > prompt character
		let line = '';
		for ( let i = 1; i < MAXCMDLINE; i ++ ) {

			if ( key_lines[ edit_line ][ i ] === 0 ) break;
			line += String.fromCharCode( key_lines[ edit_line ][ i ] );

		}

		Cbuf_AddText( line );
		Cbuf_AddText( '\n' );

		let displayLine = '';
		for ( let i = 0; i < MAXCMDLINE; i ++ ) {

			if ( key_lines[ edit_line ][ i ] === 0 ) break;
			displayLine += String.fromCharCode( key_lines[ edit_line ][ i ] );

		}

		Con_Printf( displayLine + '\n' );
		edit_line = ( edit_line + 1 ) & 31;
		history_line = edit_line;
		key_lines[ edit_line ][ 0 ] = 93; // ']'
		key_lines[ edit_line ][ 1 ] = 0;
		key_linepos = 1;

		// force an update if disconnected
		if ( _cls.state === 0 ) // ca_disconnected
			SCR_UpdateScreen();

		return;

	}

	if ( key === K_TAB ) {

		// command completion
		let partial = '';
		for ( let i = 1; i < MAXCMDLINE; i ++ ) {

			if ( key_lines[ edit_line ][ i ] === 0 ) break;
			partial += String.fromCharCode( key_lines[ edit_line ][ i ] );

		}

		let cmd = Cmd_CompleteCommand( partial );
		if ( ! cmd )
			cmd = Cvar_CompleteVariable( partial );

		if ( cmd ) {

			for ( let i = 0; i < cmd.length; i ++ )
				key_lines[ edit_line ][ i + 1 ] = cmd.charCodeAt( i );

			key_linepos = cmd.length + 1;
			key_lines[ edit_line ][ key_linepos ] = 32; // ' '
			key_linepos ++;
			key_lines[ edit_line ][ key_linepos ] = 0;
			return;

		}

	}

	if ( key === K_BACKSPACE || key === K_LEFTARROW ) {

		if ( key_linepos > 1 )
			key_linepos --;
		return;

	}

	if ( key === K_UPARROW ) {

		do {

			history_line = ( history_line - 1 ) & 31;

		} while ( history_line !== edit_line
				&& ! key_lines[ history_line ][ 1 ] );

		if ( history_line === edit_line )
			history_line = ( edit_line + 1 ) & 31;

		for ( let i = 0; i < MAXCMDLINE; i ++ )
			key_lines[ edit_line ][ i ] = key_lines[ history_line ][ i ];

		// calculate length
		key_linepos = 0;
		while ( key_lines[ edit_line ][ key_linepos ] !== 0 && key_linepos < MAXCMDLINE )
			key_linepos ++;

		return;

	}

	if ( key === K_DOWNARROW ) {

		if ( history_line === edit_line ) return;

		do {

			history_line = ( history_line + 1 ) & 31;

		} while ( history_line !== edit_line
			&& ! key_lines[ history_line ][ 1 ] );

		if ( history_line === edit_line ) {

			key_lines[ edit_line ][ 0 ] = 93; // ']'
			key_linepos = 1;

		} else {

			for ( let i = 0; i < MAXCMDLINE; i ++ )
				key_lines[ edit_line ][ i ] = key_lines[ history_line ][ i ];

			key_linepos = 0;
			while ( key_lines[ edit_line ][ key_linepos ] !== 0 && key_linepos < MAXCMDLINE )
				key_linepos ++;

		}

		return;

	}

	if ( key === K_PGUP || key === K_MWHEELUP ) {

		let bs = con_backscroll + 2;
		if ( bs > con_totallines - ( _vid.height >> 3 ) - 1 )
			bs = con_totallines - ( _vid.height >> 3 ) - 1;
		Con_SetBackscroll( bs );
		return;

	}

	if ( key === K_PGDN || key === K_MWHEELDOWN ) {

		let bs = con_backscroll - 2;
		if ( bs < 0 )
			bs = 0;
		Con_SetBackscroll( bs );
		return;

	}

	if ( key === K_HOME ) {

		Con_SetBackscroll( con_totallines - ( _vid.height >> 3 ) - 1 );
		return;

	}

	if ( key === K_END ) {

		Con_SetBackscroll( 0 );
		return;

	}

	if ( key < 32 || key > 127 )
		return; // non printable

	if ( key_linepos < MAXCMDLINE - 1 ) {

		key_lines[ edit_line ][ key_linepos ] = key;
		key_linepos ++;
		key_lines[ edit_line ][ key_linepos ] = 0;

	}

}

/*
====================
Key_Message
====================
*/
function Key_Message( key ) {

	if ( key === K_ENTER ) {

		if ( team_message )
			Cbuf_AddText( 'say_team "' );
		else
			Cbuf_AddText( 'say "' );

		Cbuf_AddText( chat_buffer );
		Cbuf_AddText( '"\n' );

		set_key_dest( key_game );
		chat_buffer = '';
		return;

	}

	if ( key === K_ESCAPE ) {

		set_key_dest( key_game );
		chat_buffer = '';
		return;

	}

	if ( key < 32 || key > 127 )
		return; // non printable

	if ( key === K_BACKSPACE ) {

		if ( chat_buffer.length ) {

			chat_buffer = chat_buffer.substring( 0, chat_buffer.length - 1 );

		}

		return;

	}

	if ( chat_buffer.length === 31 )
		return; // all full

	chat_buffer += String.fromCharCode( key );

}

/*
===================
Key_StringToKeynum
===================
*/
/**
 * Returns a key number to be used to index keybindings[] by looking at the given string. Single ascii characters
 * return themselves, while the K_* names are matched up (case-insensitively, against the `keynames` table: `ENTER`,
 * `MOUSE1`, `SEMICOLON`...). Used by the `bind` and `unbind` console commands.
 *
 * @param {string} str a single character, or a key name without the `K_` prefix
 * @returns {number} the key number (0..255; a single character returns its UTF-16 code unit as is, so it is not
 *   lowercased), or -1 when `str` is empty or not a known name
 */
export function Key_StringToKeynum( str ) {

	if ( ! str || str.length === 0 )
		return - 1;

	if ( str.length === 1 )
		return str.charCodeAt( 0 );

	for ( let i = 0; i < keynames.length; i ++ ) {

		if ( str.toLowerCase() === keynames[ i ].name.toLowerCase() )
			return keynames[ i ].keynum;

	}

	return - 1;

}

/*
===================
Key_KeynumToString
===================
*/
/**
 * Returns a string (either a single ascii char, or a K_* name) for the given keynum. Used when writing bindings
 * (`Key_WriteBindings`), by the menu's key-binding screen, and in `Key_Event`'s "is unbound" notice.
 *
 * @param {number} keynum key number (0..255), or -1
 * @returns {string} the character for printable ASCII 33..126; otherwise the name from the `keynames` table (e.g.
 *   `SPACE`, `F4`); `'<KEY NOT FOUND>'` for -1 and `'<UNKNOWN KEYNUM>'` for a number with no name
 */
export function Key_KeynumToString( keynum ) {

	if ( keynum === - 1 )
		return '<KEY NOT FOUND>';

	if ( keynum > 32 && keynum < 127 )
		return String.fromCharCode( keynum );

	for ( let i = 0; i < keynames.length; i ++ ) {

		if ( keynum === keynames[ i ].keynum )
			return keynames[ i ].name;

	}

	return '<UNKNOWN KEYNUM>';

}

/*
===================
Key_SetBinding
===================
*/
/**
 * Binds a command string to a key, replacing any earlier binding; `''` clears it. Called by the `bind`, `unbind` and
 * `unbindall` commands and by the menu's key-binding screen. The binding lives in `keybindings` for the session and
 * is saved only when `Host_WriteConfiguration` writes `Key_WriteBindings` to localStorage (`quake_config`).
 *
 * @param {number} keynum key number (0..255); -1 (an unknown key name) does nothing
 * @param {string} binding console text run on a press (a leading `+` makes it a button command that also runs its
 *   `-` form on release)
 */
export function Key_SetBinding( keynum, binding ) {

	if ( keynum === - 1 )
		return;

	keybindings[ keynum ] = binding;

}

/*
===================
Key_Unbind_f
===================
*/
function Key_Unbind_f() {

	if ( Cmd_Argc() !== 2 ) {

		Con_Printf( 'unbind <key> : remove commands from a key\n' );
		return;

	}

	const b = Key_StringToKeynum( Cmd_Argv( 1 ) );
	if ( b === - 1 ) {

		Con_Printf( '"' + Cmd_Argv( 1 ) + '" isn\'t a valid key\n' );
		return;

	}

	Key_SetBinding( b, '' );

}

function Key_Unbindall_f() {

	for ( let i = 0; i < 256; i ++ )
		if ( keybindings[ i ] )
			Key_SetBinding( i, '' );

}

/*
===================
Key_Bind_f
===================
*/
function Key_Bind_f() {

	const c = Cmd_Argc();

	if ( c !== 2 && c !== 3 ) {

		Con_Printf( 'bind <key> [command] : attach a command to a key\n' );
		return;

	}

	const b = Key_StringToKeynum( Cmd_Argv( 1 ) );
	if ( b === - 1 ) {

		Con_Printf( '"' + Cmd_Argv( 1 ) + '" isn\'t a valid key\n' );
		return;

	}

	if ( c === 2 ) {

		if ( keybindings[ b ] )
			Con_Printf( '"' + Cmd_Argv( 1 ) + '" = "' + keybindings[ b ] + '"\n' );
		else
			Con_Printf( '"' + Cmd_Argv( 1 ) + '" is not bound\n' );
		return;

	}

	// copy the rest of the command line
	let cmd = '';
	for ( let i = 2; i < c; i ++ ) {

		if ( i > 2 )
			cmd += ' ';
		cmd += Cmd_Argv( i );

	}

	Key_SetBinding( b, cmd );

}

/*
============
Key_WriteBindings
============
*/
/**
 * Writes lines containing "bind key value", one per bound key in key-number order. Called by
 * `Host_WriteConfiguration` (host.js), which saves the text with the cvars to localStorage under `quake_config`
 * (WinQuake writes it to config.cfg).
 *
 * @returns {string} lines of the form `bind "KEY" "command"\n`; empty when nothing is bound
 */
export function Key_WriteBindings() {

	let result = '';
	for ( let i = 0; i < 256; i ++ ) {

		if ( keybindings[ i ] && keybindings[ i ].length > 0 ) {

			result += 'bind "' + Key_KeynumToString( i ) + '" "' + keybindings[ i ] + '"\n';

		}

	}

	return result;

}

/*
===================
Key_Init
===================
*/
/**
 * Sets up key handling once at startup, from `Host_Init` before the menu and `quake.rc`: resets the 32 console edit
 * lines to the `]` prompt, marks which keys the console takes (printable ASCII except `` ` `` and `~`, plus the
 * editing, arrow, page, shift and wheel keys), builds the US-keyboard shift table, marks Escape and F1..F12 as keys the
 * menu leaves to their bindings, and registers the `bind`, `unbind` and `unbindall` commands.
 */
export function Key_Init() {

	for ( let i = 0; i < 32; i ++ ) {

		key_lines[ i ][ 0 ] = 93; // ']'
		key_lines[ i ][ 1 ] = 0;

	}

	key_linepos = 1;

	//
	// init ascii characters in console mode
	//
	for ( let i = 32; i < 128; i ++ )
		consolekeys[ i ] = true;

	consolekeys[ K_ENTER ] = true;
	consolekeys[ K_TAB ] = true;
	consolekeys[ K_LEFTARROW ] = true;
	consolekeys[ K_RIGHTARROW ] = true;
	consolekeys[ K_UPARROW ] = true;
	consolekeys[ K_DOWNARROW ] = true;
	consolekeys[ K_BACKSPACE ] = true;
	consolekeys[ K_PGUP ] = true;
	consolekeys[ K_PGDN ] = true;
	consolekeys[ K_SHIFT ] = true;
	consolekeys[ K_MWHEELUP ] = true;
	consolekeys[ K_MWHEELDOWN ] = true;
	consolekeys[ 96 ] = false; // '`'
	consolekeys[ 126 ] = false; // '~'

	for ( let i = 0; i < 256; i ++ )
		keyshift[ i ] = i;

	for ( let i = 97; i <= 122; i ++ ) // 'a' to 'z'
		keyshift[ i ] = i - 32; // to uppercase

	keyshift[ 49 ] = 33; // '1' -> '!'
	keyshift[ 50 ] = 64; // '2' -> '@'
	keyshift[ 51 ] = 35; // '3' -> '#'
	keyshift[ 52 ] = 36; // '4' -> '$'
	keyshift[ 53 ] = 37; // '5' -> '%'
	keyshift[ 54 ] = 94; // '6' -> '^'
	keyshift[ 55 ] = 38; // '7' -> '&'
	keyshift[ 56 ] = 42; // '8' -> '*'
	keyshift[ 57 ] = 40; // '9' -> '('
	keyshift[ 48 ] = 41; // '0' -> ')'
	keyshift[ 45 ] = 95; // '-' -> '_'
	keyshift[ 61 ] = 43; // '=' -> '+'
	keyshift[ 44 ] = 60; // ',' -> '<'
	keyshift[ 46 ] = 62; // '.' -> '>'
	keyshift[ 47 ] = 63; // '/' -> '?'
	keyshift[ 59 ] = 58; // ';' -> ':'
	keyshift[ 39 ] = 34; // '\'' -> '"'
	keyshift[ 91 ] = 123; // '[' -> '{'
	keyshift[ 93 ] = 125; // ']' -> '}'
	keyshift[ 96 ] = 126; // '`' -> '~'
	keyshift[ 92 ] = 124; // '\\' -> '|'

	menubound[ K_ESCAPE ] = true;
	for ( let i = 0; i < 12; i ++ )
		menubound[ K_F1 + i ] = true;

	//
	// register our functions
	//
	Cmd_AddCommand( 'bind', Key_Bind_f );
	Cmd_AddCommand( 'unbind', Key_Unbind_f );
	Cmd_AddCommand( 'unbindall', Key_Unbindall_f );

}

/*
===================
Key_Event
===================
*/
// Which devices hold each key down (card [36]): the keyboard and mouse ('kbd', the default), the touch screen, a game
// controller ('pad') and WebXR controllers press the same keys. A key goes down with its first holder and up with its last,
// so one device letting go never cuts an action another still holds; a holder's own repeats pass as before.
const keyHolders = new Map();

/**
 * Called by the system between frames for both key up and key down events. Should NOT be called during an interrupt!
 * Here the callers are the platform's event handlers: keyboard, mouse buttons and wheel, and gamepad polling
 * (in_web.js), the touch screen (touch.js) and WebXR controllers.
 *
 * A press from a second device while another holds the key is only recorded; a release reaches the game only when
 * the last holder lets go. The Bestiary (`R_BestiaryKey`) sees every event first and may consume it. Autorepeats
 * are dropped except for Backspace and Pause. Escape always goes to the menu, the chat line or the menu toggle and can
 * never be unbound. A release runs the `-` form of a `+` button binding (with the key number appended, so several
 * downs can be matched with ups), even in the console. During demo playback a console key brings up the menu. Other
 * presses run the key's binding, or go to the chat line, the menu (`M_Keydown`) or the console line editor, with
 * Shift applied through the shift table. Commands are queued with `Cbuf_AddText`, not run here. Updates
 * `key_lastpress`, `key_count`, `shift_down` and `key_repeats`.
 *
 * @param {number} key key number (0..255): lowercase ASCII, or a `K_*` constant
 * @param {boolean} down true for a press (or autorepeat), false for a release
 * @param {string} [source='kbd'] which device holds the key: `'kbd'` (keyboard and mouse), `'touch'`, `'pad'` or
 *   `'xr'`
 * @throws {Error} through `Sys_Error` ('Bad key_dest') when `key_dest` is not one of the four destinations
 */
export function Key_Event( key, down, source = 'kbd' ) {

	let holders = keyHolders.get( key );
	if ( down ) {

		if ( holders === undefined ) keyHolders.set( key, holders = new Set() );
		if ( holders.size > 0 && ! holders.has( source ) ) { holders.add( source ); return; } // (already down: another device holds it)
		holders.add( source );

	} else if ( holders !== undefined && holders.size > 0 ) {

		holders.delete( source );
		if ( holders.size > 0 ) return; // (still held by another device)

	}

	const wasDown = keydown[ key ];

	keydown[ key ] = down;
	if ( R_BestiaryKey( key, down, wasDown ) ) { if ( ! down ) key_repeats[ key ] = 0; return; }

	if ( ! down )
		key_repeats[ key ] = 0;

	key_lastpress = key;
	key_count ++;

	if ( key_count <= 0 ) {

		return; // just catching keys for Con_NotifyBox

	}

	// update auto-repeat status
	if ( down ) {

		key_repeats[ key ] ++;
		if ( key !== K_BACKSPACE && key !== K_PAUSE && key_repeats[ key ] > 1 ) {

			return; // ignore most autorepeats

		}

		if ( key >= 200 && ! keybindings[ key ] )
			Con_Printf( Key_KeynumToString( key ) + ' is unbound, hit F4 to set.\n' );

	}

	if ( key === K_SHIFT )
		shift_down = down;

	//
	// handle escape specially, so the user can never unbind it
	//
	if ( key === K_ESCAPE ) {

		if ( ! down )
			return;

		switch ( key_dest ) {

			case key_message:
				Key_Message( key );
				break;
			case key_menu:
				M_Keydown( key );
				break;
			case key_game:
			case key_console:
				M_ToggleMenu_f();
				break;
			default:
				Sys_Error( 'Bad key_dest' );

		}

		return;

	}

	//
	// key up events only generate commands if the game key binding is
	// a button command (leading + sign). These will occur even in console mode,
	// to keep the character from continuing an action started before a console
	// switch. Button commands include the keynum as a parameter, so multiple
	// downs can be matched with ups
	//
	if ( ! down ) {

		const kb = keybindings[ key ];
		if ( kb && kb.charAt( 0 ) === '+' ) {

			Cbuf_AddText( '-' + kb.substring( 1 ) + ' ' + key + '\n' );

		}

		if ( keyshift[ key ] !== key ) {

			const kb2 = keybindings[ keyshift[ key ] ];
			if ( kb2 && kb2.charAt( 0 ) === '+' ) {

				Cbuf_AddText( '-' + kb2.substring( 1 ) + ' ' + key + '\n' );

			}

		}

		return;

	}

	//
	// during demo playback, most keys bring up the main menu
	//
	if ( _cls.demoplayback && down && consolekeys[ key ] && key_dest === key_game ) {

		M_ToggleMenu_f();
		return;

	}

	//
	// if not a consolekey, send to the interpreter no matter what mode is
	//
	if ( ( key_dest === key_menu && menubound[ key ] )
	|| ( key_dest === key_console && ! consolekeys[ key ] )
	|| ( key_dest === key_game && ( ! con_forcedup || ! consolekeys[ key ] ) ) ) {

		const kb = keybindings[ key ];
		if ( kb ) {

			if ( kb.charAt( 0 ) === '+' ) {

				// button commands add keynum as a parm
				Cbuf_AddText( kb + ' ' + key + '\n' );

			} else {

				Cbuf_AddText( kb );
				Cbuf_AddText( '\n' );

			}

		}

		return;

	}

	if ( ! down )
		return; // other systems only care about key down events

	if ( shift_down ) {

		key = keyshift[ key ];

	}

	switch ( key_dest ) {

		case key_message:
			Key_Message( key );
			break;
		case key_menu:
			M_Keydown( key );
			break;
		case key_game:
		case key_console:
			Key_Console( key );
			break;
		default:
			Sys_Error( 'Bad key_dest' );

	}

}

/*
===================
Key_ClearStates
===================
*/
/**
 * Forgets every held key: clears the device holders, `keydown` and `key_repeats` for all 256 keys. No release events
 * are sent, so `+` button commands already running are not stopped by this. Nothing in src calls it at present; the
 * tests use it to start from a clean key state (WinQuake calls it when the window loses focus).
 */
export function Key_ClearStates() {

	keyHolders.clear();
	for ( let i = 0; i < 256; i ++ ) {

		keydown[ i ] = false;
		key_repeats[ i ] = 0;

	}

}
