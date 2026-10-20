// The Hexen II help as one scroll with sticky headings (owner requests, 20 October 2026): the five native help
// pictures' text reflowed into help01's panel in the game's own pixel font (drawn natively, never as distance-field
// lettering), scrolled by the pixel, a held arrow scrolling steadily, the current section's heading pinned to the top
// and pushed out by the next, the next unseen heading pinned to the bottom, the text fading into the darkness beside
// each pin, and only help01's frame drawn. Through the public menu entry points (Key_Event, M_Draw, the Hexen touch
// handler) and the pure layout functions.
import { Cbuf_Init } from '../src/engine/common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, cvar_t } from '../src/engine/common/cvar.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { K_ESCAPE, K_ENTER, K_DOWNARROW, K_RIGHTARROW, K_LEFTARROW, K_END, K_HOME, K_MWHEELDOWN, Key_Event } from '../src/engine/client/keys.js';
import { set_key_dest, key_menu } from '../src/engine/common/key_dest.js';
import * as menu from '../src/engine/client/menu.js';
import * as common from '../src/engine/client/menu_common.js';
import { M_Hexen2_Reset } from '../src/engine/client/menu_hexen2.js';
import { M_Hexen2_HelpState, M_Hexen2_Help_Touch } from '../src/engine/client/menu_hexen2_help.js';
import { HEXEN2_HELP_SECTIONS, HEXEN2_HELP_ROW, Hexen2_HelpRows, Hexen2_HelpView, Hexen2_HelpWrap } from '../src/engine/client/hexen2_help_scroll.js';
import { Draw_GetVirtualWidth, Draw_GetVirtualHeight } from '../src/engine/render/gl_draw.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const COLUMNS = 24, SLOTS = 18;

let dest = 4, pictures = [], chars = [], fills = [], fades = [], clips = [], time = 0, seq = 0;
function wire() {

	const old = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 } } );
	Cbuf_Init();
	GameProfile_Set( 'hexen2' );
	M_Hexen2_Reset();
	dest = 4;
	if ( Cvar_FindVar( 'skill' ) === null ) Cvar_RegisterVariable( new cvar_t( 'skill', '1' ) );
	if ( Cvar_FindVar( '_cl_playerclass' ) === null ) Cvar_RegisterVariable( new cvar_t( '_cl_playerclass', '1', true ) );
	common.M_SetExternals( {
		key_dest_set: v => { dest = v; }, key_dest_get: () => dest,
		cls: { state: 0, demonum: - 1, demoplayback: false }, sv: { active: false }, svs: { maxclients: 1 }, cl: { intermission: 0 },
		Draw_CachePic: path => ( { name: path, width: /help0/.test( path ) ? 320 : 16, height: /help0/.test( path ) ? 200 : 16 } ),
		Draw_TransPic: ( x, y, p ) => pictures.push( { x, y, name: p.name } ),
		Draw_Pic: ( x, y, p ) => pictures.push( { x, y, name: p.name } ),
		Draw_SubPic: () => {}, Draw_TransPicRegion: () => {},
		Draw_Character: ( x, y, code ) => chars.push( { x, y, code, seq: seq ++ } ),
		Draw_Fill: ( x, y, w, h, c ) => fills.push( { x, y, w, h, c, seq: seq ++ } ),
		Draw_FadeBand: ( x, y, w, h, c, top, bottom ) => fades.push( { x, y, w, h, c, top, bottom } ),
		Draw_WithClipRect: ( x, y, w, h, draw ) => { clips.push( { x, y, w, h } ); draw(); },
		Draw_FadeScreen: () => {}, S_LocalSound: () => {},
		host_time_get: () => time, realtime_get: () => time
	} );
	return () => { if ( old ) Object.defineProperty( globalThis, 'window', old ); else delete globalThis.window; };

}

// One frame, the clock advanced by `dt` seconds first (the scroll eases and held keys scroll per frame).
function draw( dt = 1 ) { time += dt; pictures = []; chars = []; fills = []; fades = []; clips = []; common.set_m_state( common.m_hexen2_help ); menu.M_Draw(); }

// The drawn text by row, in menu pixels: [ { y, text, white } ] sorted top to bottom.
function rows() {

	const dx = ( Draw_GetVirtualWidth() - 320 ) >> 1, dy = ( Draw_GetVirtualHeight() - 200 ) >> 1, byY = new Map();
	// what the screen shows: a later fill (a pin's black band) hides the characters under it, and a later row at the
	// same place replaces the earlier one
	for ( const c of chars ) {

		if ( fills.some( f => f.seq > c.seq && c.x >= f.x && c.x < f.x + f.w && c.y >= f.y && c.y < f.y + f.h ) ) continue;
		const y = c.y - dy;
		if ( ! byY.has( y ) ) byY.set( y, new Map() );
		byY.get( y ).set( c.x - dx, { x: c.x - dx, code: c.code } );

	}
	return [ ...byY.entries() ].sort( ( a, b ) => a[ 0 ] - b[ 0 ] ).map( ( [ y, byX ] ) => {

		const cs = [ ...byX.values() ].sort( ( a, b ) => a.x - b.x );
		return { y, text: cs.map( c => String.fromCharCode( c.code & 255 ) ).join( '' ), white: cs.every( c => c.code < 256 ) };

	} );

}

function openHelp() {

	menu.M_Menu_Main_f();
	for ( let i = 0; i < 3; i ++ ) menu.M_Keydown( K_DOWNARROW );
	menu.M_Keydown( K_ENTER );
	same( common.m_state, common.m_hexen2_help, 'the main menu Help item opens the Hexen help' );

}

Deno.test( 'the help text is all six native sections, wrapped to the panel', () => {

	const layout = Hexen2_HelpRows( HEXEN2_HELP_SECTIONS, COLUMNS );
	same( layout.starts.length, 6, 'six sections' );
	check( layout.rows.every( r => r.text.length <= COLUMNS ), 'every row fits 24 columns' );
	const headings = layout.starts.map( s => layout.rows[ s ].text );
	same( headings[ 0 ], 'Basic movement:', 'the first heading' );
	check( headings[ 5 ].startsWith( 'Shooting buttons' ), 'the last heading: ' + headings[ 5 ] );
	HEXEN2_HELP_SECTIONS.forEach( ( { body }, section ) => {

		const words = layout.rows.filter( r => r.section === section && ! r.heading ).map( r => r.text ).join( ' ' );
		same( words, body.split( /\s+/ ).join( ' ' ), 'section ' + section + ' keeps every word in order' );

	} );
	same( Hexen2_HelpWrap( 'abcdefghij', 4 ).join( '|' ), 'abcd|efgh|ij', 'an over-long word is split' );

} );

Deno.test( 'the view scrolls by the pixel, pushes the top pin out and pins the next unseen heading', () => {

	const layout = Hexen2_HelpRows( HEXEN2_HELP_SECTIONS, COLUMNS ), { starts, rows } = layout, R = HEXEN2_HELP_ROW;
	const top = Hexen2_HelpView( layout, 0, SLOTS );
	same( top.pinTop, null, 'nothing is pinned above the first heading' );
	const unseen = starts.findIndex( s => s * R > ( SLOTS - 1 ) * R );
	same( top.pinBottom?.section, unseen, 'the first heading below the panel is pinned to the bottom' );
	same( top.pinBottom.y, ( SLOTS - 1 ) * R, 'in the bottom slot' );
	same( top.pinBottom.text, rows[ starts[ unseen ] ].text, 'the bottom pin is that heading\'s first line' );

	const half = Hexen2_HelpView( layout, 3, SLOTS );
	same( half.rows[ 0 ].y, - 3, 'a pixel scroll moves the rows by pixels (the first is partly above the panel)' );

	const inside = Hexen2_HelpView( layout, ( starts[ 2 ] + 3 ) * R, SLOTS );
	same( inside.pinTop?.section, 2, 'scrolled past a heading, its section is pinned to the top' );
	same( inside.pinTop.y, 0, 'at the top of the panel' );
	same( inside.pinTop.text, rows[ starts[ 2 ] ].text, 'the top pin is the heading\'s first line' );

	const pushed = Hexen2_HelpView( layout, starts[ 3 ] * R - 3, SLOTS );
	same( pushed.pinTop?.section, 2, 'just before the next heading reaches the top, the old pin is still shown' );
	same( pushed.pinTop.y, - 5, 'the arriving heading pushes it up' );

	const end = Hexen2_HelpView( layout, 1e9, SLOTS );
	same( end.scroll, ( rows.length - SLOTS ) * R, 'the scroll stops with the last row in the bottom slot' );
	same( end.pinBottom, null, 'nothing is pinned below the last section' );
	same( end.rows.at( - 1 ).row, rows.length - 1, 'the last row is shown' );

} );

Deno.test( 'Help draws native pixel text that eases, scrolls while held, and fades beside its pins', () => {

	const restore = wire();
	try {

		const R = HEXEN2_HELP_ROW;
		openHelp();
		draw();
		same( pictures.filter( p => /help0/.test( p.name ) ).map( p => p.name ).join(), 'gfx/menu/help01.lmp', 'only help01 is drawn, as the frame' );
		check( fills.some( f => f.w === 200 && f.h === 147 && f.c === 0 ), 'the picture\'s text panel is blacked out' );
		check( clips.some( c => c.w === 200 && c.h === SLOTS * R ), 'the text is clipped to the panel band' );
		let shown = rows();
		same( shown[ 0 ].text, 'Basic movement:', 'the first row is the first heading' );
		check( shown[ 0 ].white, 'headings use the plain (tan) bank' );
		check( ! shown[ 1 ].white, 'body text uses the +256 (red) bank' );
		same( shown[ 0 ].y, 27, 'the text starts inside the panel' );

		// a tap moves one row, eased over frames
		menu.M_Keydown( K_DOWNARROW ); Key_Event( K_DOWNARROW, false );
		same( M_Hexen2_HelpState().target, R, 'Down sets the target one row on' );
		draw( 0.02 );
		const easing = M_Hexen2_HelpState().scroll;
		check( easing > 0 && easing < R, 'the scroll eases towards it: ' + easing );
		draw( 1 );
		same( M_Hexen2_HelpState().scroll, R, 'and arrives' );

		// held, the arrow scrolls steadily after a short pause, by the pixel
		set_key_dest( key_menu );
		Key_Event( K_DOWNARROW, true );
		const before = M_Hexen2_HelpState().target;
		draw( 0.1 ); draw( 0.1 ); draw( 0.1 ); draw( 0.1 );
		const held = M_Hexen2_HelpState().scroll;
		check( held > before + R, 'holding Down keeps scrolling past one row: ' + before + ' -> ' + held );
		check( held % R !== 0 || held - before > 2 * R, 'it moves by pixels, not whole rows' );
		Key_Event( K_DOWNARROW, false );
		draw( 0.1 );
		const stopped = M_Hexen2_HelpState().scroll;
		draw( 0.1 );
		same( M_Hexen2_HelpState().scroll, stopped, 'releasing the key stops the scroll' );

		// scrolled inside a section: its heading is pinned and the text fades beneath it
		draw( 1 );
		shown = rows();
		same( shown.find( r => r.y === 27 && r.white )?.text, 'Basic movement:', 'the section\'s heading stays pinned at the top' );
		const fadeTop = fades.find( f => f.top === 1 && f.bottom === 0 );
		const dy = ( Draw_GetVirtualHeight() - 200 ) >> 1;
		check( fadeTop && fadeTop.y - dy === 27 + R && fadeTop.h > 0, 'a fade band runs from black to clear just under the top pin: ' + JSON.stringify( fadeTop ) );
		check( fades.some( f => f.top === 0 && f.bottom === 1 ), 'and from clear to black above the bottom pin' );

		menu.M_Keydown( K_HOME ); draw( 1 );
		menu.M_Keydown( K_RIGHTARROW ); draw( 1 );
		same( rows()[ 0 ].text, 'Looking around:', 'Right brings the next heading to the top' );
		menu.M_Keydown( K_LEFTARROW ); draw( 1 );
		same( M_Hexen2_HelpState().scroll, 0, 'Left goes back to the previous heading' );
		menu.M_Keydown( K_MWHEELDOWN );
		same( M_Hexen2_HelpState().target, 2 * R, 'the wheel scrolls two rows' );

		menu.M_Keydown( K_END ); draw( 1 );
		shown = rows();
		check( shown.at( - 1 ).text.endsWith( 'other side.' ), 'End shows the last line: ' + shown.at( - 1 ).text );
		menu.M_Keydown( K_ENTER );
		same( M_Hexen2_HelpState().target, 0, 'Enter at the end returns to the top' );

		menu.M_Keydown( K_HOME ); draw( 1 );
		const pinned = rows().filter( r => r.white ).at( - 1 );
		check( pinned.y === 27 + ( SLOTS - 1 ) * R, 'a heading is pinned to the bottom row: ' + JSON.stringify( rows().slice( - 2 ) ) );
		M_Hexen2_Help_Touch( 160, 27 + ( SLOTS - 1 ) * R + 2 );
		draw( 1 );
		same( rows()[ 0 ].text, pinned.text, 'touching the bottom pin brings its section to the top' );

		menu.M_Keydown( K_ESCAPE );
		same( common.m_state, common.m_hexen2_main, 'Escape returns to the Hexen main menu' );

	} finally { restore(); }

} );
