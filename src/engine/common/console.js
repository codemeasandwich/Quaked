/**
 * @module engine/common/console
 *
 * The developer console (WinQuake console.c): its text buffer, notify lines, scrollback and drawing hooks.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `con_linewidth`, `con_forcedup`, `con_totallines`, `con_backscroll`, `con_vislines`,
 * `con_initialized`, `con_notifylines`; module-level variables `con_current`, `con_x`, `con_text`, `con_debuglog`,
 * `_cls`, `_realVid`, `_getVirtualWidth`, `_getVirtualHeight`, `_key_lines`, `_getEditLine`, `_getKeyLinepos`,
 * `_getChatBuffer` and 12 more.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `Con_Printf` before `Con_Init` drops the message (it is not buffered). Drawing callbacks are injected with
 * `Con_SetExternals`.
 */
// Ported from: WinQuake/console.c, WinQuake/console.h -- developer console

import { Cmd_AddCommand } from './cmd.js';
import { Cvar_RegisterVariable } from './cvar.js';
import { key_dest, set_key_dest, key_game, key_console, key_message } from './key_dest.js';

/*
==============================================================================

			CONSOLE CONSTANTS

==============================================================================
*/

const CON_TEXTSIZE = 16384;
const NUM_CON_TIMES = 4;
const MAXPRINTMSG = 4096;
const MAXCMDLINE = 256;

/*
==============================================================================

			CONSOLE STATE

==============================================================================
*/

export let con_linewidth = 0;

const con_cursorspeed = 4;

export let con_forcedup = false; // because no entities to refresh

export let con_totallines = 0; // total lines in console scrollback
export let con_backscroll = 0; // lines up from bottom to display
let con_current = 0; // where next message will be printed
let con_x = 0; // offset in current line for next print
let con_text = null;

const con_notifytime = { name: 'con_notifytime', string: '3', value: 3 }; // seconds

const con_times = new Float32Array( NUM_CON_TIMES ); // realtime time the line was generated

export let con_vislines = 0;

let con_debuglog = false;

export let con_initialized = false;

export let con_notifylines = 0; // scan lines to clear for notify lines

// Cross-reference to other systems (set via Con_SetExternals to avoid circular imports)
let _cls = { state: 0, signon: 0 };
let _realVid = { width: 640, height: 480 };
// the console's own drawing size (gl_draw's virtual width and height, set by the host; the real video size until then)
let _getVirtualWidth = () => _realVid.width;
let _getVirtualHeight = () => _realVid.height;
const _vid = {
	get width() { return _getVirtualWidth(); },
	get height() { return _getVirtualHeight(); }
};
// the typed line and the chat message (keys.js, set by the host): the 32 edit lines, the current one, the cursor
let _key_lines = [ [ 0, 0 ] ];
let _getEditLine = () => 0;
let _getKeyLinepos = () => 1;
let _getChatBuffer = () => '';
let _getRealtime = () => 0;
let _scr_disabled_for_loading = false;
let _developer = { value: 0 };
let _Draw_Character = null;
let _Draw_String = null;
let _Draw_ConsoleBackground = null;
let _SCR_UpdateScreen = null;
let _SCR_EndLoadingPlaque = null;
let _M_Menu_Main_f = null;
let _S_LocalSound = null;

// Static variable for Con_Print
let cr = false;

/**
 * Wires the console to the systems it cannot import without a cycle (client state, video size, drawing, the screen,
 * menu, sound, the developer cvar and the key-input line). Called once from host.js during `Host_Init`; each field that
 * is present replaces the stored hook, absent fields keep their previous value (the defaults draw nothing and report a
 * 640x480 screen). The references are kept for the life of the page.
 *
 * @param {{ cls?: { state: number, signon: number }, vid?: { width: number, height: number }, getRealtime?: () => number,
 *   developer?: cvar_t, Draw_Character?: (x: number, y: number, num: number) => void,
 *   Draw_String?: (x: number, y: number, str: string) => void, Draw_ConsoleBackground?: (lines: number) => void,
 *   SCR_UpdateScreen?: () => void, SCR_EndLoadingPlaque?: () => void, M_Menu_Main_f?: () => void,
 *   S_LocalSound?: (name: string) => void, scr_disabled_for_loading?: boolean, Draw_GetVirtualWidth?: () => number,
 *   Draw_GetVirtualHeight?: () => number, key_lines?: Array<Array<number>>, getEditLine?: () => number,
 *   getKeyLinepos?: () => number, getChatBuffer?: () => string }} externals the hooks; `vid` is the real video size and
 *   `Draw_GetVirtualWidth`/`Height` give the console's drawing size in virtual pixels; `getRealtime` returns host
 *   realtime in seconds; `key_lines` are keys.js's edit lines as character-code arrays
 */
export function Con_SetExternals( externals ) {

	if ( externals.cls ) _cls = externals.cls;
	if ( externals.vid ) _realVid = externals.vid;
	if ( externals.getRealtime ) _getRealtime = externals.getRealtime;
	if ( externals.developer ) _developer = externals.developer;
	if ( externals.Draw_Character ) _Draw_Character = externals.Draw_Character;
	if ( externals.Draw_String ) _Draw_String = externals.Draw_String;
	if ( externals.Draw_ConsoleBackground ) _Draw_ConsoleBackground = externals.Draw_ConsoleBackground;
	if ( externals.SCR_UpdateScreen ) _SCR_UpdateScreen = externals.SCR_UpdateScreen;
	if ( externals.SCR_EndLoadingPlaque ) _SCR_EndLoadingPlaque = externals.SCR_EndLoadingPlaque;
	if ( externals.M_Menu_Main_f ) _M_Menu_Main_f = externals.M_Menu_Main_f;
	if ( externals.S_LocalSound ) _S_LocalSound = externals.S_LocalSound;
	if ( externals.scr_disabled_for_loading !== undefined ) _scr_disabled_for_loading = externals.scr_disabled_for_loading;
	if ( externals.Draw_GetVirtualWidth ) _getVirtualWidth = externals.Draw_GetVirtualWidth;
	if ( externals.Draw_GetVirtualHeight ) _getVirtualHeight = externals.Draw_GetVirtualHeight;
	if ( externals.key_lines ) _key_lines = externals.key_lines;
	if ( externals.getEditLine ) _getEditLine = externals.getEditLine;
	if ( externals.getKeyLinepos ) _getKeyLinepos = externals.getKeyLinepos;
	if ( externals.getChatBuffer ) _getChatBuffer = externals.getChatBuffer;

}

// Accessor functions for mutable exports
/**
 * Sets how far the console view is scrolled back. Called by keys.js on PgUp/PgDn/mouse wheel/Home/End; the caller
 * clamps the value. `Con_Print` and `Con_CheckResize` reset it to 0.
 *
 * @param {number} val lines up from the bottom of the scrollback to display (0 = newest output)
 */
export function Con_SetBackscroll( val ) { con_backscroll = val; }
/**
 * Reads the current scrollback offset (the live binding `con_backscroll` can also be imported directly).
 *
 * @returns {number} lines up from the bottom of the scrollback being displayed (0 = newest output)
 */
export function Con_GetBackscroll() { return con_backscroll; }
/**
 * Sets whether the console is forced down because there are no entities to refresh (no world loaded or signon not
 * complete). Called every frame by gl_screen.js's `SCR_SetUpToDrawConsole`; while true the input line is drawn even
 * when the console does not have key focus.
 *
 * @param {boolean} val true to force the console up full screen
 */
export function Con_SetForcedup( val ) { con_forcedup = val; }

/*
================
Con_ToggleConsole_f
================
*/
/**
 * The `toggleconsole` command (WinQuake console.c), bound to the ~ key. Closing the console returns key input to the
 * game and clears the typed line when connected (`cls.state` 2, ca_connected); otherwise it opens the main menu.
 * Opening it moves key input to the console. Either way it ends the loading plaque and clears the notify-line times.
 */
export function Con_ToggleConsole_f() {

	if ( key_dest === key_console ) {

		if ( _cls.state === 2 ) { // ca_connected

			set_key_dest( key_game );

			_key_lines[ _getEditLine() ][ 1 ] = 0; // clear any typing

		} else {

			if ( _M_Menu_Main_f ) _M_Menu_Main_f();

		}

	} else {

		set_key_dest( key_console );

	}

	if ( _SCR_EndLoadingPlaque ) _SCR_EndLoadingPlaque();
	con_times.fill( 0 );

}

/*
================
Con_Clear_f
================
*/
/**
 * The `clear` command (WinQuake console.c): blanks the whole scrollback buffer to spaces. Does nothing before
 * `Con_Init` has allocated the buffer. The line position and scroll offset are left unchanged.
 */
export function Con_Clear_f() {

	if ( con_text ) {

		for ( let i = 0; i < CON_TEXTSIZE; i ++ )
			con_text[ i ] = 32; // ' '

	}

}

/*
================
Con_ClearNotify
================
*/
/**
 * Forgets the print times of the last 4 lines so no notify lines are drawn over the game until new text is printed
 * (WinQuake console.c). Called by `Con_CheckResize` and by gl_screen.js when a loading plaque begins and ends.
 */
export function Con_ClearNotify() {

	for ( let i = 0; i < NUM_CON_TIMES; i ++ )
		con_times[ i ] = 0;

}

/*
================
Con_MessageMode_f
================
*/
function Con_MessageMode_f() {

	set_key_dest( key_message );

}

/*
================
Con_MessageMode2_f
================
*/
function Con_MessageMode2_f() {

	set_key_dest( key_message );

}

/*
================
Con_CheckResize
================
*/
/**
 * If the line width has changed, reformat the buffer (WinQuake console.c). The width in characters is the console's
 * virtual width / 8 - 2; when that is below 1 (video not initialised yet) it falls back to 38 and blanks the buffer,
 * otherwise it rewraps the newest lines into the new width (truncating long lines) and clears the notify times. Called
 * by `Con_Init` and every frame by gl_screen.js's `SCR_SetUpToDrawConsole`; returns at once when the width is unchanged.
 * After a resize the scroll offset is reset to 0 and printing continues on the last line.
 */
export function Con_CheckResize() {

	let width = ( _vid.width >> 3 ) - 2;

	if ( width === con_linewidth )
		return;

	if ( width < 1 ) {

		// video hasn't been initialized yet
		width = 38;
		con_linewidth = width;
		con_totallines = Math.floor( CON_TEXTSIZE / con_linewidth );

		if ( con_text ) {

			for ( let i = 0; i < CON_TEXTSIZE; i ++ )
				con_text[ i ] = 32; // ' '

		}

	} else {

		const oldwidth = con_linewidth;
		con_linewidth = width;
		const oldtotallines = con_totallines;
		con_totallines = Math.floor( CON_TEXTSIZE / con_linewidth );
		let numlines = oldtotallines;

		if ( con_totallines < numlines )
			numlines = con_totallines;

		let numchars = oldwidth;

		if ( con_linewidth < numchars )
			numchars = con_linewidth;

		const tbuf = new Array( CON_TEXTSIZE );
		for ( let i = 0; i < CON_TEXTSIZE; i ++ )
			tbuf[ i ] = con_text[ i ];

		for ( let i = 0; i < CON_TEXTSIZE; i ++ )
			con_text[ i ] = 32; // ' '

		for ( let i = 0; i < numlines; i ++ ) {

			for ( let j = 0; j < numchars; j ++ ) {

				con_text[ ( con_totallines - 1 - i ) * con_linewidth + j ] =
						tbuf[ ( ( con_current - i + oldtotallines ) %
							  oldtotallines ) * oldwidth + j ];

			}

		}

		Con_ClearNotify();

	}

	con_backscroll = 0;
	con_current = con_totallines - 1;

}

/*
================
Con_Init
================
*/
/**
 * Allocates the 16384-character scrollback buffer, sizes it with `Con_CheckResize`, prints "Console initialized.",
 * registers the `con_notifytime` cvar (seconds a notify line stays, default 3) and the `toggleconsole`, `messagemode`,
 * `messagemode2` and `clear` commands, then marks the console initialised (WinQuake console.c). Called once during
 * host start-up; anything printed before this is dropped.
 */
export function Con_Init() {

	con_text = new Array( CON_TEXTSIZE );
	for ( let i = 0; i < CON_TEXTSIZE; i ++ )
		con_text[ i ] = 32; // ' '

	con_linewidth = - 1;
	Con_CheckResize();

	Con_Printf( 'Console initialized.\n' );

	//
	// register our commands
	//
	Cvar_RegisterVariable( con_notifytime );

	Cmd_AddCommand( 'toggleconsole', Con_ToggleConsole_f );
	Cmd_AddCommand( 'messagemode', Con_MessageMode_f );
	Cmd_AddCommand( 'messagemode2', Con_MessageMode2_f );
	Cmd_AddCommand( 'clear', Con_Clear_f );
	con_initialized = true;

}

/*
===============
Con_Linefeed
===============
*/
function Con_Linefeed() {

	con_x = 0;
	con_current ++;

	const start = ( con_current % con_totallines ) * con_linewidth;
	for ( let i = 0; i < con_linewidth; i ++ )
		con_text[ start + i ] = 32; // ' '

}

/*
================
Con_Print
================
*/
/**
 * Writes text into the scrollback ring buffer (WinQuake console.c). Handles cursor positioning, line wrapping, etc:
 * words that would cross the right edge wrap to a new line, `\n` ends a line and `\r` returns to its start so the next
 * text overwrites it. In WinQuake all console printing must go through this in order to be logged to disk; this port
 * has no disk log. If no console is visible, the notify window will pop up: each new line records `realtime` for
 * `Con_DrawNotify`. Printing snaps the view back to the newest line. Assumes `Con_Init` has run (the buffer exists).
 *
 * @param {string} txt the text; a leading character code 1 prints it in the coloured (high-bit, +128) characters and
 *   plays misc/talk.wav (chat), a leading 2 prints it coloured without the sound
 */
export function Con_Print( txt ) {

	con_backscroll = 0;

	let pos = 0;
	let mask = 0;

	if ( txt.charCodeAt( 0 ) === 1 ) {

		mask = 128; // go to colored text
		// play talk wav
		if ( _S_LocalSound ) _S_LocalSound( 'misc/talk.wav' );
		pos ++;

	} else if ( txt.charCodeAt( 0 ) === 2 ) {

		mask = 128; // go to colored text
		pos ++;

	}

	while ( pos < txt.length ) {

		const c = txt.charCodeAt( pos );

		// count word length
		let l;
		for ( l = 0; l < con_linewidth; l ++ ) {

			if ( pos + l >= txt.length || txt.charCodeAt( pos + l ) <= 32 )
				break;

		}

		// word wrap
		if ( l !== con_linewidth && ( con_x + l > con_linewidth ) )
			con_x = 0;

		pos ++;

		if ( cr ) {

			con_current --;
			cr = false;

		}

		if ( con_x === 0 ) {

			Con_Linefeed();
			// mark time for transparent overlay
			if ( con_current >= 0 ) {
				const rt = _getRealtime();
				con_times[ con_current % NUM_CON_TIMES ] = rt;
			}

		}

		if ( c === 10 ) { // '\n'

			// Also set timestamp when newline is processed (ensures notify works even with unusual message flow)
			if ( con_current >= 0 ) {
				const rt = _getRealtime();
				if ( rt > 0 ) {
					con_times[ con_current % NUM_CON_TIMES ] = rt;
				}
			}
			con_x = 0;

		} else if ( c === 13 ) { // '\r'

			con_x = 0;
			cr = true;

		} else {

			// display character and advance
			const y = con_current % con_totallines;
			con_text[ y * con_linewidth + con_x ] = c | mask;
			con_x ++;
			if ( con_x >= con_linewidth )
				con_x = 0;

		}

	}

}

/*
================
Con_Printf

Handles cursor positioning, line wrapping, etc
================
*/
let inupdate = false;

/**
 * Formats and prints a message to the console (WinQuake console.c). Handles cursor positioning, line wrapping, etc via
 * `Con_Print`. With one argument it is printed as `String(arg)`; with more, the first is a printf-style format
 * supporting `%s %d %i %f %c %%` with the `- 0 + space` flags, width and precision. The message is dropped (not
 * buffered) before `Con_Init`. While signon is incomplete (`cls.signon` !== 4) and loading has not disabled the screen,
 * it redraws the screen with `SCR_UpdateScreen` so start-up output is visible; a re-entrant call from that redraw only
 * prints.
 *
 * @param {...*} args a single value to print, or a format string followed by its arguments
 */
export function Con_Printf( ...args ) {

	// Format the message - simple concatenation since JS doesn't have vsprintf
	let msg = '';
	if ( args.length === 1 ) {

		msg = String( args[ 0 ] );

	} else {

		// Simple printf-style formatting
		msg = _sprintf( args[ 0 ], ...args.slice( 1 ) );

	}

	if ( ! con_initialized )
		return;

	// write it to the scrollable buffer
	Con_Print( msg );

	// update the screen if the console is displayed
	if ( _cls.signon !== 4 && ! _scr_disabled_for_loading ) { // SIGNONS = 4

		// protect against infinite loop if something in SCR_UpdateScreen calls Con_Printf
		if ( ! inupdate ) {

			inupdate = true;
			if ( _SCR_UpdateScreen ) _SCR_UpdateScreen();
			inupdate = false;

		}

	}

}

/*
================
Con_DPrintf
================
*/
/**
 * A Con_Printf that only shows up if the "developer" cvar is set (non-zero); otherwise it does nothing (WinQuake
 * console.c).
 *
 * @param {...*} args as for `Con_Printf`: a single value, or a format string followed by its arguments
 */
export function Con_DPrintf( ...args ) {

	if ( ! _developer.value )
		return; // don't confuse non-developers with techie stuff...

	Con_Printf( ...args );

}

/*
==================
Con_SafePrintf
==================
*/
/**
 * A `Con_Printf` that is okay to call even when the screen can't be updated: it sets `scr_disabled_for_loading` for
 * the duration of the print so no `SCR_UpdateScreen` redraw happens, then restores it (WinQuake console.c).
 *
 * @param {...*} args as for `Con_Printf`: a single value, or a format string followed by its arguments
 */
export function Con_SafePrintf( ...args ) {

	const temp = _scr_disabled_for_loading;
	_scr_disabled_for_loading = true;
	Con_Printf( ...args );
	_scr_disabled_for_loading = temp;

}

/*
==============================================================================

DRAWING

==============================================================================
*/

/*
================
Con_DrawInput

The input line scrolls horizontally if typing goes beyond the right edge
================
*/
function Con_DrawInput() {

	if ( key_dest !== key_console && ! con_forcedup )
		return; // don't draw anything

	if ( ! _Draw_Character ) return;

	const text = _key_lines[ _getEditLine() ], key_linepos = _getKeyLinepos();

	// add the cursor frame
	text[ key_linepos ] = 10 + ( ( Math.floor( _getRealtime() * con_cursorspeed ) ) & 1 );

	// fill out remainder with spaces
	for ( let i = key_linepos + 1; i < con_linewidth; i ++ )
		text[ i ] = 32; // ' '

	// prestep if horizontally scrolling
	let start = 0;
	if ( key_linepos >= con_linewidth )
		start = 1 + key_linepos - con_linewidth;

	// draw it
	for ( let i = 0; i < con_linewidth; i ++ )
		_Draw_Character( ( i + 1 ) << 3, con_vislines - 16, text[ start + i ] );

	// remove cursor
	_key_lines[ _getEditLine() ][ key_linepos ] = 0;

}

/*
================
Con_DrawNotify
================
*/
/**
 * Draws the last few lines of output transparently over the game top (WinQuake console.c): up to the 4 newest lines
 * printed less than `con_notifytime` seconds ago, 8 virtual pixels apart from y = 0, then the `say:` chat line when
 * key input is in message mode. Called each frame by gl_screen.js's `SCR_DrawConsole` while the console is closed and
 * keys go to the game or chat. Raises `con_notifylines` (scan lines to clear) to the height drawn. Does nothing until
 * `Draw_Character` has been wired with `Con_SetExternals`.
 */
export function Con_DrawNotify() {

	if ( ! _Draw_Character ) return;

	let v = 0;
	const realtime = _getRealtime();

	for ( let i = con_current - NUM_CON_TIMES + 1; i <= con_current; i ++ ) {

		if ( i < 0 )
			continue;

		const time = con_times[ i % NUM_CON_TIMES ];
		if ( time === 0 )
			continue;

		const age = realtime - time;
		if ( age > con_notifytime.value )
			continue;

		const textStart = ( i % con_totallines ) * con_linewidth;

		for ( let x = 0; x < con_linewidth; x ++ )
			_Draw_Character( ( x + 1 ) << 3, v, con_text[ textStart + x ] );

		v += 8;

	}

	if ( key_dest === key_message ) {

		if ( _Draw_String ) _Draw_String( 8, v, 'say:' );

		if ( _Draw_Character ) {

			const chat_buffer = _getChatBuffer();
			for ( let x = 0; x < chat_buffer.length; x ++ ) {

				_Draw_Character( ( x + 5 ) << 3, v, chat_buffer.charCodeAt( x ) );

			}

		}

		v += 8;

	}

	if ( v > con_notifylines )
		con_notifylines = v;

}

/*
================
Con_DrawConsole
================
*/
/**
 * Draws the console with the solid background (WinQuake console.c): the background, then as many 8-pixel text rows as
 * fit above the bottom 16 pixels, offset by `con_backscroll`. The typing input line at the bottom should only be
 * drawn if typing is allowed. Called each frame by gl_screen.js's `SCR_DrawConsole` while the console is down; stores
 * `lines` in `con_vislines`.
 *
 * @param {number} lines console height in virtual pixels from the top of the screen; 0 or less draws nothing
 * @param {boolean} drawinput true to draw the input prompt, typed text and blinking cursor
 */
export function Con_DrawConsole( lines, drawinput ) {

	if ( lines <= 0 )
		return;

	// draw the background
	if ( _Draw_ConsoleBackground ) _Draw_ConsoleBackground( lines );

	// draw the text
	con_vislines = lines;

	const rows = ( lines - 16 ) >> 3; // rows of text to draw
	let y = lines - 16 - ( rows << 3 ); // may start slightly negative

	for ( let i = con_current - rows + 1; i <= con_current; i ++, y += 8 ) {

		let j = i - con_backscroll;
		if ( j < 0 )
			j = 0;

		const textStart = ( j % con_totallines ) * con_linewidth;

		if ( _Draw_Character ) {

			for ( let x = 0; x < con_linewidth; x ++ )
				_Draw_Character( ( x + 1 ) << 3, y, con_text[ textStart + x ] );

		}

	}

	// draw the input prompt, user text, and cursor if desired
	if ( drawinput )
		Con_DrawInput();

}

/*
==================
Con_NotifyBox
==================
*/
/**
 * Prints `text` framed by a box line and "Press a key." (WinQuake console.c, used during startup for sound / cd
 * warnings). WinQuake then blocks until a key is pressed; the browser cannot block, so this port only prints.
 *
 * @param {string} text the message, printed with `Con_Printf` (include its own newline)
 */
export function Con_NotifyBox( text ) {

	// during startup for sound / cd warnings
	Con_Printf( '\n\n\x1d\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1f\n' );
	Con_Printf( text );
	Con_Printf( 'Press a key.\n' );
	Con_Printf( '\x1d\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1e\x1f\n' );

	// In browser, we can't block. This would need to be async.
	// For now, just print the notification.

}

/*
==============================================================================

			INTERNAL HELPERS

==============================================================================
*/

// sprintf implementation supporting width, precision, and flags for Quake format strings
function _sprintf( fmt, ...args ) {

	if ( typeof fmt !== 'string' ) return String( fmt );

	let result = '';
	let argIdx = 0;
	let i = 0;

	while ( i < fmt.length ) {

		if ( fmt[ i ] === '%' && i + 1 < fmt.length ) {

			i ++;

			// Parse flags: -, +, 0, space, #
			let leftAlign = false;
			let zeroPad = false;
			let plusSign = false;
			let spaceSign = false;

			let parsing = true;
			while ( i < fmt.length && parsing ) {

				switch ( fmt[ i ] ) {

					case '-': leftAlign = true; i ++; break;
					case '0': zeroPad = true; i ++; break;
					case '+': plusSign = true; i ++; break;
					case ' ': spaceSign = true; i ++; break;
					case '#': i ++; break; // ignore # flag
					default: parsing = false; break;

				}

			}

			// Parse width
			let width = 0;
			while ( i < fmt.length && fmt[ i ] >= '0' && fmt[ i ] <= '9' ) {

				width = width * 10 + ( fmt.charCodeAt( i ) - 48 );
				i ++;

			}

			// Parse precision
			let precision = - 1;
			if ( i < fmt.length && fmt[ i ] === '.' ) {

				i ++;
				precision = 0;
				while ( i < fmt.length && fmt[ i ] >= '0' && fmt[ i ] <= '9' ) {

					precision = precision * 10 + ( fmt.charCodeAt( i ) - 48 );
					i ++;

				}

			}

			// Parse conversion specifier
			let str = '';
			if ( i < fmt.length ) {

				switch ( fmt[ i ] ) {

					case 's': {

						const val = args[ argIdx ++ ];
						str = val != null ? String( val ) : '';
						if ( precision >= 0 && str.length > precision )
							str = str.substring( 0, precision );
						break;

					}
					case 'd':
					case 'i': {

						const val = args[ argIdx ++ ];
						const num = Math.floor( Number( val ) );
						const n = isNaN( num ) ? 0 : num;
						str = String( Math.abs( n ) );
						if ( n < 0 ) str = '-' + str;
						else if ( plusSign ) str = '+' + str;
						else if ( spaceSign ) str = ' ' + str;
						break;

					}
					case 'f': {

						const val = args[ argIdx ++ ];
						const num = Number( val );
						const n = isNaN( num ) ? 0.0 : num;
						const prec = precision >= 0 ? precision : 6;
						str = n.toFixed( prec );
						if ( plusSign && n >= 0 ) str = '+' + str;
						else if ( spaceSign && n >= 0 ) str = ' ' + str;
						break;

					}
					case 'c': {

						const val = args[ argIdx ++ ];
						str = String.fromCharCode( val != null ? val : 0 );
						break;

					}
					case '%':
						str = '%';
						break;
					default:
						str = fmt[ i ];
						break;

				}

			}

			// Apply width padding
			if ( width > 0 && str.length < width ) {

				const padChar = ( zeroPad && ! leftAlign ) ? '0' : ' ';
				const padLen = width - str.length;
				const padding = padChar.repeat( padLen );
				if ( leftAlign ) {

					str = str + padding;

				} else {

					// For zero-padded negative numbers, put '-' before zeros
					if ( zeroPad && str.length > 0 && str[ 0 ] === '-' ) {

						str = '-' + padding + str.substring( 1 );

					} else {

						str = padding + str;

					}

				}

			}

			result += str;
			i ++;

		} else {

			result += fmt[ i ];
			i ++;

		}

	}

	return result;

}
