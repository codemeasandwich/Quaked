/**
 * @module engine/client/menu_hexen2_help
 *
 * Hexen II's Help and Quit screens (uhexen2 engine/hexen2/menu.c M_Help, M_Quit). Native Help pages through the five
 * full-screen gfx/menu/help01..05.lmp pictures; Quaked keeps help01's stone frame and scrolls the same text in its
 * panel with sticky section headings (hexen2_help_scroll.js; owner request, 20 October 2026). Quit is the native
 * scrolling credits box with "Press y to exit", not Quake's "Are you sure you want to quit?" prompt.
 *
 * Types: plain values and functions; no exported classes.
 * State: the help scroll position, the cut-out help frame and the quit scroll position; all in this module.
 * Errors: none raised.
 *
 * Native code: menu.c:2703-2765 (M_Help), 3449-3575 (M_Quit).
 */

import { Cbuf_AddText } from '../common/cmd.js';
import {
	K_ESCAPE, K_ENTER, K_SPACE, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, K_PGUP, K_PGDN, K_HOME, K_END,
	K_MWHEELUP, K_MWHEELDOWN, Key_IsDown, key_console, key_menu
} from './keys.js';
import {
	m_hexen2_help, m_hexen2_quit, set_m_state, set_m_entersound, setKeyDest, _vid, _Draw_Fill, _realtime_get,
	_host_time_get, _Draw_CachePic, M_DrawTransPic, M_DrawTextBox, M_Print, M_PrintWhite, M_PrintPixels, M_WithClip,
	M_FadeBand
} from './menu_common.js';
import { M_Hexen2_Menu_Main_f } from './menu_hexen2.js';
import {
	HEXEN2_HELP_SECTIONS, HEXEN2_HELP_ROW, Hexen2_HelpRows, Hexen2_HelpView, Hexen2_HelpJump, Hexen2_HelpClamp
} from './hexen2_help_scroll.js';

// The black text panel inside gfx/menu/help01.lmp's stone frame (menu pixels), and the 24 x 18 character grid the
// help text is reflowed into: 8-pixel cells of the game's own pixel font, drawn natively (M_PrintPixels) so the
// letters stay legible at any scale and the text can be clipped and faded.
const PANEL = Object.freeze( { x: 86, y: 25, w: 200, h: 147 } );
const TEXT_X = 90, TEXT_Y = 27, COLUMNS = 24, SLOTS = 18, PAGE = SLOTS - 2;
const BAND = Object.freeze( { x: PANEL.x, w: PANEL.w } ), TEXT_H = SLOTS * HEXEN2_HELP_ROW;
const HELP_LAYOUT = Hexen2_HelpRows( HEXEN2_HELP_SECTIONS, COLUMNS );
// Held arrows scroll after a short pause, as a key repeat would; a tap moves one row, eased.
const HOLD_DELAY = 0.25, HOLD_SPEED = 96, EASE = 14, FADE = 14;

let helpScroll = 0, helpTarget = 0, holdKey = 0, holdStart = 0, lastTime = null;
let frameSource = null, framePic = null;

/**
 * Opens the Hexen II help at the top of the text (the main menu's Help item and the `help` command).
 */
export function M_Hexen2_Menu_Help_f() {

	setKeyDest( key_menu );
	set_m_state( m_hexen2_help );
	set_m_entersound( true );
	helpScroll = helpTarget = 0;
	holdKey = 0;
	lastTime = null;

}

/**
 * The first help picture with its text panel cut out (transparent), made once per picture. The WebGL menu draws
 * pictures above its text, so the frame must not cover the panel; natively the panel is filled black after it. Without
 * a canvas to draw on (a test host) the picture itself is returned and the black fill covers its text.
 *
 * @param {?qpic_t} pic gfx/menu/help01.lmp
 * @returns {?qpic_t} the frame picture
 */
function helpFrame( pic ) {

	if ( ! pic?.canvas ) return pic;
	if ( frameSource === pic ) return framePic;
	frameSource = pic; framePic = pic;
	const canvas = globalThis.document?.createElement?.( 'canvas' ), ctx = canvas?.getContext?.( '2d' );
	if ( ! ctx ) return framePic;
	canvas.width = pic.canvas.width; canvas.height = pic.canvas.height;
	const sx = canvas.width / pic.width, sy = canvas.height / pic.height;
	ctx.drawImage( pic.canvas, 0, 0 );
	ctx.clearRect( PANEL.x * sx, PANEL.y * sy, PANEL.w * sx, PANEL.h * sy );
	framePic = { width: pic.width, height: pic.height, canvas, path: 'gfx/menu/help01.lmp#frame' };
	return framePic;

}

// Moves the scroll one frame: a held Up/Down scrolls steadily after HOLD_DELAY (menus receive no autorepeat), any
// other change eases towards its target.
function helpAdvance() {

	const now = _realtime_get();
	const dt = lastTime === null || ! Number.isFinite( now - lastTime ) ? 0 : Math.min( 0.1, Math.max( 0, now - lastTime ) );
	lastTime = now;
	if ( holdKey !== 0 && ! Key_IsDown( holdKey ) ) holdKey = 0;
	if ( holdKey !== 0 && now - holdStart >= HOLD_DELAY ) {

		helpTarget = Hexen2_HelpClamp( HELP_LAYOUT, helpTarget + ( holdKey === K_UPARROW ? - 1 : 1 ) * HOLD_SPEED * dt, SLOTS );
		helpScroll = helpTarget;

	} else helpScroll += ( helpTarget - helpScroll ) * Math.min( 1, dt * EASE );
	if ( Math.abs( helpTarget - helpScroll ) < 0.05 ) helpScroll = helpTarget;

}

/**
 * `M_Draw` on Help: the stone frame of gfx/menu/help01.lmp, its panel blacked out, and the help text scrolled into it
 * by the pixel in the game's own font: the headings in the plain (tan) bank, the body in the highlighted (red) bank.
 * The section being read keeps its heading pinned to the top (pushed out by the next heading), the next unseen heading
 * is pinned to the bottom, and the text fades into the darkness beside each pin (`Hexen2_HelpView`).
 */
export function M_Hexen2_Help_Draw() {

	helpAdvance();
	const pic = _Draw_CachePic ? _Draw_CachePic( 'gfx/menu/help01.lmp' ) : null;
	if ( pic ) M_DrawTransPic( 0, 0, helpFrame( pic ) );
	if ( _Draw_Fill ) _Draw_Fill( PANEL.x + ( ( _vid.width - 320 ) >> 1 ), PANEL.y + ( ( _vid.height - 200 ) >> 1 ), PANEL.w, PANEL.h, 0 );

	const view = Hexen2_HelpView( HELP_LAYOUT, Math.round( helpScroll ), SLOTS );
	M_WithClip( BAND.x, TEXT_Y, BAND.w, TEXT_H, () => {

		for ( const { row, y } of view.rows ) {

			const { text, heading } = HELP_LAYOUT.rows[ row ];
			M_PrintPixels( TEXT_X, TEXT_Y + y, text, ! heading );

		}
		if ( view.pinTop ) {

			const y = TEXT_Y + view.pinTop.y;
			if ( _Draw_Fill ) _Draw_Fill( BAND.x + ( ( _vid.width - 320 ) >> 1 ), y + ( ( _vid.height - 200 ) >> 1 ), BAND.w, HEXEN2_HELP_ROW, 0 );
			M_PrintPixels( TEXT_X, y, view.pinTop.text );
			M_FadeBand( BAND.x, y + HEXEN2_HELP_ROW, BAND.w, FADE, 0, 1, 0 );

		}
		if ( view.pinBottom ) {

			const y = TEXT_Y + view.pinBottom.y;
			M_FadeBand( BAND.x, y - FADE, BAND.w, FADE, 0, 0, 1 );
			if ( _Draw_Fill ) _Draw_Fill( BAND.x + ( ( _vid.width - 320 ) >> 1 ), y + ( ( _vid.height - 200 ) >> 1 ), BAND.w, HEXEN2_HELP_ROW, 0 );
			M_PrintPixels( TEXT_X, y, view.pinBottom.text );

		}

	} );

}

/**
 * Sets the scroll target, playing the menu sound when `sound` is set and the target changed.
 *
 * @param {number} target the new scroll in menu pixels (clamped)
 * @param {boolean} [sound=false] whether a change plays the menu sound (section jumps and pages do; rows not)
 */
function helpScrollTo( target, sound = false ) {

	const next = Hexen2_HelpClamp( HELP_LAYOUT, target, SLOTS );
	if ( sound && next !== helpTarget ) set_m_entersound( true );
	helpTarget = next;

}

/**
 * `M_Keydown` on Help. ESC returns to the main menu; Up/Down move a row and, held, scroll steadily; the wheel moves two
 * rows; Page Up, Page Down and Space a panel; Left and Right go to the previous and next section heading; Enter goes to
 * the next section and from the last back to the top; Home and End go to the ends.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_Help_Key( key ) {

	const R = HEXEN2_HELP_ROW;
	switch ( key ) {

		case K_ESCAPE:
			M_Hexen2_Menu_Main_f();
			break;
		case K_UPARROW:
		case K_DOWNARROW:
			holdKey = key; holdStart = _realtime_get();
			helpScrollTo( helpTarget + ( key === K_UPARROW ? - R : R ) );
			break;
		case K_MWHEELUP: helpScrollTo( helpTarget - 2 * R ); break;
		case K_MWHEELDOWN: helpScrollTo( helpTarget + 2 * R ); break;
		case K_PGUP: helpScrollTo( helpTarget - PAGE * R, true ); break;
		case K_PGDN:
		case K_SPACE: helpScrollTo( helpTarget + PAGE * R, true ); break;
		case K_HOME: helpScrollTo( 0, true ); break;
		case K_END: helpScrollTo( Infinity, true ); break;
		case K_LEFTARROW: helpScrollTo( Hexen2_HelpJump( HELP_LAYOUT, helpTarget, SLOTS, - 1 ), true ); break;
		case K_RIGHTARROW: helpScrollTo( Hexen2_HelpJump( HELP_LAYOUT, helpTarget, SLOTS, 1 ), true ); break;
		case K_ENTER: {

			const next = Hexen2_HelpJump( HELP_LAYOUT, helpTarget, SLOTS, 1 );
			helpScrollTo( next === helpTarget ? 0 : next, true );
			break;

		}

	}

}

/**
 * `M_TouchInput` on Help: a touch on a pinned heading goes to that section; elsewhere the upper half scrolls a panel
 * up and the lower half a panel down.
 *
 * @param {number} vx x in menu pixels (unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_Hexen2_Help_Touch( vx, vy ) {

	const R = HEXEN2_HELP_ROW, view = Hexen2_HelpView( HELP_LAYOUT, Math.round( helpScroll ), SLOTS );
	const on = pin => pin && vy >= TEXT_Y + pin.y && vy < TEXT_Y + pin.y + R;
	if ( on( view.pinTop ) ) helpScrollTo( HELP_LAYOUT.starts[ view.pinTop.section ] * R, true );
	else if ( on( view.pinBottom ) ) helpScrollTo( HELP_LAYOUT.starts[ view.pinBottom.section ] * R, true );
	else helpScrollTo( helpTarget + ( vy < 100 ? - PAGE : PAGE ) * R, true );

}

/**
 * The help scroll, for a test or a tool.
 *
 * @returns {{ scroll: number, target: number, rows: number, slots: number, max: number }} the drawn and target
 *   scroll in menu pixels, the rows in the scroll, the visible rows and the furthest scroll
 */
export function M_Hexen2_HelpState() {

	return { scroll: helpScroll, target: helpTarget, rows: HELP_LAYOUT.rows.length, slots: SLOTS, max: Hexen2_HelpView( HELP_LAYOUT, 0, SLOTS ).max };

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
