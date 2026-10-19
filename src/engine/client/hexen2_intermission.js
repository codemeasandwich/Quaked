/**
 * @module engine/client/hexen2_intermission
 *
 * Hexen II's intermission and finale screens (uhexen2 engine/hexen2/cl_inlude.c and h2shared gl_screen.c:
 * `CL_SetupIntermission`, `SB_IntermissionOverlay`). The server only sends the native index; the picture, strings.txt
 * line, print flags, duration and next screen are fixed here. Also keeps the gamecode hand-off helper the retired
 * page used, so a caller can still read `intermission_running`/`nextmap` without a second intermission model.
 *
 * Types: plain values and functions; no exported classes.
 * State: none; the client state (`cl` and `cl.h2`) is written by the caller.
 * Errors: an index outside 1..12 throws, as native `Host_Error` does.
 */

import { Draw_Alt_String, Draw_CachePic, Draw_GetVirtualHeight, Draw_GetVirtualWidth, Draw_Pic, Draw_String } from '../render/gl_draw.js';
import { Hexen2_GetHostStringAt } from '../common/hexen2_text_resources.js';

/** Print with a delay of about 2.5 seconds (native INTERMISSION_PRINT_DELAY). */
export const INTERMISSION_PRINT_DELAY = ( 1 << 6 );
/** Print in white instead of the alternate colour (native INTERMISSION_PRINT_WHITE). */
export const INTERMISSION_PRINT_WHITE = ( 1 << 5 );
/** Print at the top-most side of the screen (native INTERMISSION_PRINT_TOPMOST). */
export const INTERMISSION_PRINT_TOPMOST = ( 1 << 4 );
/** Print centered in the top half of the screen (native INTERMISSION_PRINT_TOP). */
export const INTERMISSION_PRINT_TOP = ( 1 << 3 );
/** The screen does not need a valid message index (native INTERMISSION_NO_MESSAGE). */
export const INTERMISSION_NO_MESSAGE = ( 1 << 2 );
/** Do not draw the menus over the screen (native INTERMISSION_NO_MENUS). */
export const INTERMISSION_NO_MENUS = ( 1 << 1 );
/** Use realtime instead of `cl.time` (native INTERMISSION_NOT_CONNECTED). */
export const INTERMISSION_NOT_CONNECTED = ( 1 << 0 );

// cl_inlude.c: the native table. `message` is the 0-based strings.txt index the native code stores in `message_index`.
const SCREENS = Object.freeze( {
	1: { message: 395, picture: 'gfx/meso.lmp', flags: 0, lasting: 0, next: 0 },
	2: { message: 396, picture: 'gfx/egypt.lmp', flags: 0, lasting: 0, next: 0 },
	3: { message: 397, picture: 'gfx/roman.lmp', flags: 0, lasting: 0, next: 0 },
	4: { message: 398, picture: 'gfx/castle.lmp', flags: 0, lasting: 0, next: 0 },
	5: { message: 408, picture: 'gfx/castle.lmp', flags: 0, lasting: 0, next: 0 }, // demo finale
	6: { message: 392, picture: 'gfx/end-1.lmp', flags: INTERMISSION_PRINT_DELAY | INTERMISSION_PRINT_WHITE | INTERMISSION_PRINT_TOP, lasting: 15, next: 7 },
	7: { message: 393, picture: 'gfx/end-2.lmp', flags: INTERMISSION_PRINT_DELAY | INTERMISSION_PRINT_WHITE | INTERMISSION_PRINT_TOP, lasting: 15, next: 8 },
	8: { message: 394, picture: 'gfx/end-3.lmp', flags: INTERMISSION_PRINT_WHITE | INTERMISSION_PRINT_DELAY | INTERMISSION_PRINT_TOPMOST, lasting: 0, next: 0 },
	9: { message: 391, picture: 'gfx/castle.lmp', flags: INTERMISSION_PRINT_WHITE, lasting: 0, next: 0 }, // OEM/bundle finale
	10: { message: 538, picture: 'gfx/mpend.lmp', flags: 0, lasting: 0, next: 0 }, // Portal: Praevus
	11: { message: 545, picture: 'gfx/mpmid.lmp', flags: 0, lasting: 0, next: 0 }, // Portal: Tibet
	12: { message: 561, picture: 'gfx/end-3.lmp', flags: INTERMISSION_NOT_CONNECTED | INTERMISSION_NO_MENUS, lasting: 0, next: 0 } // Portal opening
} );

/**
 * The native screen record for one intermission index.
 *
 * @param {number} index the native 1..12 index
 * @param {{ oem?: boolean }} [options] `oem` maps the first screen to the bundle's finale (cl_inlude.c)
 * @returns {?{ intermission: number, messageIndex: number, picture: string, flags: number, lastingTime: number, next: number }} the record, or null
 */
export function Hexen2_IntermissionInfo( index, options = {} ) {

	let number = Number( index ) | 0;
	if ( options.oem && number === 1 ) number = 9;
	const screen = SCREENS[ number ];
	if ( screen === undefined ) return null;
	return Object.freeze( {
		intermission: number,
		messageIndex: screen.message,
		picture: screen.picture,
		flags: screen.flags,
		lastingTime: screen.lasting,
		next: screen.next
	} );

}

/**
 * The strings.txt line an intermission shows, by the native 0-based index.
 *
 * @param {number} index the native 1..12 index
 * @param {{ oem?: boolean, getString?: function(number): ?string }} [options] string lookup override
 * @returns {?string} the line, or null when the screen has no message or the table has no line
 */
export function Hexen2_IntermissionText( index, options = {} ) {

	const info = Hexen2_IntermissionInfo( index, options );
	if ( info === null ) return null;
	const getString = options.getString ?? Hexen2_GetHostStringAt;
	return getString( info.messageIndex );

}

/**
 * Applies an intermission index to the live client, as `CL_SetupIntermission` does. `cl.intermission` stays the
 * Quake "in an intermission" flag the renderer and view already test; the native index and its print state live in
 * `cl.h2`.
 *
 * @param {object} clState the client state
 * @param {number} index the native 1..12 index
 * @param {number} [now] the time to latch as `completed_time`
 * @param {{ oem?: boolean }} [options] native screen options
 * @returns {object} the screen record
 * @throws {Error} for an index outside the native table
 */
export function Hexen2_ApplyIntermission( clState, index, now = clState?.time ?? 0, options = {} ) {

	const info = Hexen2_IntermissionInfo( index, options );
	if ( info === null ) throw new Error( `Bad intermission number ${String( index )}` );
	if ( clState.h2 === null || typeof clState.h2 !== 'object' ) clState.h2 = {};
	clState.intermission = 1;
	clState.completed_time = Number.isFinite( now ) ? now : 0;
	clState.h2.intermission = info.intermission;
	clState.h2.intermissionFlags = info.flags;
	clState.h2.intermissionPic = info.picture;
	clState.h2.intermissionMessageIndex = info.messageIndex;
	clState.h2.intermissionLastingTime = info.lastingTime;
	clState.h2.intermissionNext = info.next;
	clState.h2.intermissionCompletedTime = clState.completed_time;
	return info;

}

/**
 * Whether the Hexen II intermission overlay owns the screen.
 *
 * @param {object} clState the client state
 * @returns {boolean} true while a native intermission is showing
 */
export function Hexen2_IntermissionActive( clState ) {

	return ( clState?.intermission | 0 ) !== 0 && ( clState?.h2?.intermission | 0 ) > 0;

}

/**
 * Breaks intermission text into native-style centred lines, at most `width` characters each. The source's
 * `FindTextBreaks` wraps at spaces and keeps explicit newlines; a word longer than the width is hard-split.
 *
 * @param {string} text the message
 * @param {number} [width=38] characters per line
 * @returns {Array<string>} the lines
 */
export function Hexen2_IntermissionTextLines( text, width = 38 ) {

	const out = [];
	for ( const paragraph of String( text ?? '' ).replace( /\r\n?/g, '\n' ).split( '\n' ) ) {

		const words = paragraph.trim().split( /\s+/ ).filter( word => word.length > 0 );
		if ( words.length === 0 ) { out.push( '' ); continue; }
		let line = '';
		for ( const word of words ) {

			let rest = word;
			while ( rest.length > width ) {

				if ( line !== '' ) { out.push( line ); line = ''; }
				out.push( rest.slice( 0, width ) );
				rest = rest.slice( width );

			}
			if ( line === '' ) line = rest;
			else if ( line.length + 1 + rest.length <= width ) line += ' ' + rest;
			else { out.push( line ); line = rest; }

		}
		if ( line !== '' ) out.push( line );

	}
	return out;

}

/**
 * Draws the native Hexen II intermission/finale screen: the 320x200 picture centred on the virtual screen, then the
 * strings.txt text revealed at 20 characters a second (after the native 2.5 s delay where the screen asks for it).
 * Advances the finale sequence (6 -> 7 -> 8) once a screen's lasting time has elapsed.
 *
 * @param {object} clState the client state
 * @param {{ now?: number, oem?: boolean }} [options] the clock (cl.time when omitted) and the OEM screen rule
 * @returns {{ drawn: boolean, advanced: number }} what was drawn and the next index when the sequence advanced
 */
export function Hexen2_DrawIntermission( clState, options = {} ) {

	const index = clState?.h2?.intermission | 0;
	const info = Hexen2_IntermissionInfo( index, options );
	if ( info === null ) return { drawn: false, advanced: 0 };
	const now = Number.isFinite( options.now ) ? options.now : ( clState.time ?? 0 );
	const width = Draw_GetVirtualWidth(), height = Draw_GetVirtualHeight();
	const pic = Draw_CachePic( info.picture );
	if ( pic ) Draw_Pic( Math.floor( ( width - pic.width ) / 2 ), Math.floor( ( height - pic.height ) / 2 ), pic );

	const message = Hexen2_GetHostStringAt( info.messageIndex ) ?? '';
	if ( message === '' ) return { drawn: true, advanced: 0 };
	const completed = Number.isFinite( clState.completed_time ) ? clState.completed_time : ( clState.h2?.intermissionCompletedTime ?? now );
	let elapsed = Math.floor( ( now - completed ) * 20 );
	if ( info.flags & INTERMISSION_PRINT_DELAY ) elapsed = Math.max( 0, elapsed - 50 );
	const lines = Hexen2_IntermissionTextLines( message, 38 );
	const top = ( info.flags & ( INTERMISSION_PRINT_TOP | INTERMISSION_PRINT_TOPMOST ) ) !== 0;
	let by = info.flags & INTERMISSION_PRINT_TOPMOST ? 16 : Math.floor( ( 25 - lines.length ) * 8 / 2 );
	if ( !top ) by += Math.floor( ( height - 200 ) / 2 );
	const bx0 = Math.floor( ( width - 320 ) / 2 );
	const white = ( info.flags & INTERMISSION_PRINT_WHITE ) !== 0;
	let remaining = Math.max( 0, elapsed ), printed = 0;
	for ( const line of lines ) {

		const size = Math.min( line.length, Math.max( 0, Math.floor( remaining ) ) );
		const shown = line.substring( 0, size );
		const bx = bx0 + Math.floor( ( 40 - line.length ) * 8 / 2 );
		if ( white ) Draw_String( bx, by, shown );
		else Draw_Alt_String( bx, by, shown );
		remaining -= size;
		printed += size;
		by += 8;
		if ( remaining <= 0 ) break;

	}
	const totalChars = lines.reduce( ( count, line ) => count + line.length, 0 );
	if ( printed >= totalChars && info.lastingTime > 0 && elapsed >= info.lastingTime * 20 && info.next > 0 ) {

		Hexen2_ApplyIntermission( clState, info.next, now, options );
		return { drawn: true, advanced: info.next };

	}
	return { drawn: true, advanced: 0 };

}

/**
 * Reads the gamecode intermission hand-off from the native globals (the retired page's helper, kept for callers that
 * still start a transition from `intermission_running`).
 *
 * @param {{ intermission_running?: number, nextmap?: number, nextstartspot?: number }} globals the progs globals
 * @param {function(number): string} getString resolves a progs string offset
 * @returns {{ active: boolean, nextMap: string, nextSpot: string }} the hand-off state
 */
export function Hexen2_IntermissionStatus( globals, getString ) {

	const read = value => {

		try { return typeof getString === 'function' ? String( getString( value | 0 ) ?? '' ) : ''; } catch { return ''; }

	};
	return {
		active: ( globals?.intermission_running | 0 ) > 0,
		nextMap: read( globals?.nextmap ),
		nextSpot: read( globals?.nextstartspot )
	};

}
