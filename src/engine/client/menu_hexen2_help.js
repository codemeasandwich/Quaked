/**
 * @module engine/client/menu_hexen2_help
 *
 * Hexen II's native Help pages and Quit screen (uhexen2 engine/hexen2/menu.c M_Help, M_Quit). Help is the five
 * full-screen gfx/menu/help01..05.lmp pages; Quit is the native scrolling credits box with "Press y to exit", not
 * Quake's "Are you sure you want to quit?" prompt.
 *
 * Types: plain values and functions; no exported classes.
 * State: the help page and the quit scroll position; all in this module.
 * Errors: none raised.
 *
 * Native code: menu.c:2703-2765 (M_Help), 3449-3575 (M_Quit).
 */

import { Cbuf_AddText } from '../common/cmd.js';
import { K_ESCAPE, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, key_console, key_menu } from './keys.js';
import {
	m_hexen2_help, m_hexen2_quit, set_m_state, set_m_entersound, setKeyDest,
	_host_time_get, _Draw_CachePic, M_DrawPic, M_DrawTextBox, M_Print, M_PrintWhite
} from './menu_common.js';
import { M_Hexen2_Menu_Main_f } from './menu_hexen2.js';

const NUM_HELP_PAGES = 5;
let helpPage = 0;

/**
 * Opens the Hexen II help pages at the first page (the main menu's Help item and the `help` command).
 */
export function M_Hexen2_Menu_Help_f() {

	setKeyDest( key_menu );
	set_m_state( m_hexen2_help );
	set_m_entersound( true );
	helpPage = 0;

}

/**
 * `M_Draw` on Help: the full 320 x 200 gfx/menu/helpNN.lmp page, centred on the screen.
 */
export function M_Hexen2_Help_Draw() {

	if ( ! _Draw_CachePic ) return;
	M_DrawPic( 0, 0, _Draw_CachePic( 'gfx/menu/help0' + ( helpPage + 1 ) + '.lmp' ) );

}

/**
 * `M_Keydown` on Help. ESC returns to the main menu; Up/Right advance a page (wrapping) and Down/Left go back, as
 * native.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_Help_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Hexen2_Menu_Main_f();
			break;
		case K_UPARROW:
		case K_RIGHTARROW:
			set_m_entersound( true );
			if ( ++ helpPage >= NUM_HELP_PAGES ) helpPage = 0;
			break;
		case K_DOWNARROW:
		case K_LEFTARROW:
			set_m_entersound( true );
			if ( -- helpPage < 0 ) helpPage = NUM_HELP_PAGES - 1;
			break;

	}

}

/**
 * `M_TouchInput` on Help: a touch on the right half advances, the left half goes back, as the native arrow keys.
 *
 * @param {number} vx x in menu pixels (0..320)
 * @param {number} vy y in menu pixels (unused)
 */
export function M_Hexen2_Help_Touch( vx, vy ) {

	M_Hexen2_Help_Key( vx >= 160 ? K_RIGHTARROW : K_LEFTARROW );

}

/*
==============================================================================

			QUIT SCREEN

==============================================================================
*/

// A selection of the native CreditText lines (menu.c:2870-2980); the full list is engine data, and the scrolling box
// and header are what the player sees. The first character decides white (space) or highlighted text, as native.
const QUIT_LINES = Object.freeze( [
	'Project Director: Brian Raffel', '',
	'Lead Programmer: Rick Johnson', '',
	'Programming:', '   Ben Gokey', '   Bob Love', '   Mike Gummelt', '',
	'Lead Design: Eric Biessman', '',
	'Design:', '   Brian Raffel', '   Brian Frank', '   Tom Odell', '',
	'Art Director: Brian Pelletier', '',
	'Art:', '   Shane Gurno', '   Jim Sumwalt', '   Mark Morgan', '   Kim Lathrop', '',
	'Music:', '   Kevin Schilder', '',
	'Published by Id Software, Inc.', 'Distributed by Activision, Inc.', '',
	'Hexen(r) is a registered trademark', 'of Raven Software Corp.', '',
	'Send bug descriptions to:', '   h2bugs@mail.ravensoft.com', ''
] );

const QUIT_SIZE = 16;
let quitLinePos = 0, quitLastTime = null;

/**
 * Opens the native Hexen II quit screen, its credits scrolling from the top.
 */
export function M_Hexen2_Menu_Quit_f() {

	setKeyDest( key_menu );
	set_m_state( m_hexen2_quit );
	set_m_entersound( true );
	quitLinePos = 0;
	quitLastTime = null;

}

/**
 * `M_Draw` on Quit: the native box, "Hexen II version", "by Raven Software", the scrolling credit lines and
 * "Press y to exit".
 */
export function M_Hexen2_Quit_Draw() {

	const now = _host_time_get();
	let delta = quitLastTime === null ? 1 / 60 : now - quitLastTime;
	quitLastTime = now;
	if ( ! Number.isFinite( delta ) || delta <= 0 ) delta = 1 / 60;
	quitLinePos += Math.min( delta, 0.25 ) * 1.75;
	if ( quitLinePos > QUIT_LINES.length + QUIT_SIZE + 2 ) quitLinePos = 0;

	M_DrawTextBox( 0, 0, 38, 23 );
	M_Print( 16 + ( 8 * 8 ), 12, 'Hexen II version' );
	M_Print( 16 + ( 9 * 8 ), 20, 'by Raven Software' );
	M_PrintWhite( 16 + ( 10 * 8 ), 28, 'Source Port' );

	const place = Math.floor( quitLinePos );
	let y = 52 - Math.floor( ( quitLinePos - place ) * 8 );
	for ( let i = 0; i < QUIT_SIZE; i ++, y += 8 ) {

		const index = i + place - QUIT_SIZE;
		if ( index >= 0 && index < QUIT_LINES.length ) {

			const line = QUIT_LINES[ index ];
			if ( line[ 0 ] === ' ' ) M_PrintWhite( 24, y, line );
			else M_Print( 24, y, line );

		}

	}

	M_PrintWhite( 16 + ( 10 * 8 ), 180, 'Press y to exit' );

}

/**
 * `M_Keydown` on Quit. ESC, n or N return to the main menu; y or Y leave the menu and run the `quit` command (the
 * settings save, then the app shelf or the project page), as native M_Quit_Key.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_Quit_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
		case 110: // 'n'
		case 78: // 'N'
			M_Hexen2_Menu_Main_f();
			break;
		case 121: // 'y'
		case 89: // 'Y'
			setKeyDest( key_console );
			Cbuf_AddText( 'quit\n' );
			break;

	}

}

/**
 * `M_TouchInput` on Quit: a touch above y 100 answers yes, anywhere lower no.
 *
 * @param {number} vx x in menu pixels (unused)
 * @param {number} vy y in menu pixels
 */
export function M_Hexen2_Quit_Touch( vx, vy ) { M_Hexen2_Quit_Key( vy < 100 ? 121 : 110 ); }
