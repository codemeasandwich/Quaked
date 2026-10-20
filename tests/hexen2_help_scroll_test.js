// The Hexen II help as one scroll with sticky headings (owner request, 20 October 2026): the five native help
// pictures' text reflowed into help01's panel, the current section's heading pinned to the top row, the next unseen
// heading to the bottom row, the rows next to a pin faded, and only help01's frame drawn. Through the public menu entry
// points (M_Keydown, M_Draw, M_TouchInput's Hexen handler) and the pure layout functions.
import { Cbuf_Init } from '../src/engine/common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, cvar_t } from '../src/engine/common/cvar.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { K_ESCAPE, K_ENTER, K_DOWNARROW, K_RIGHTARROW, K_LEFTARROW, K_END, K_HOME, K_MWHEELDOWN } from '../src/engine/client/keys.js';
import * as menu from '../src/engine/client/menu.js';
import * as common from '../src/engine/client/menu_common.js';
import { M_Hexen2_Reset } from '../src/engine/client/menu_hexen2.js';
import { M_Hexen2_HelpState, M_Hexen2_Help_Touch } from '../src/engine/client/menu_hexen2_help.js';
import { HEXEN2_HELP_SECTIONS, Hexen2_HelpRows, Hexen2_HelpView, Hexen2_HelpWrap } from '../src/engine/client/hexen2_help_scroll.js';
import { Draw_GetVirtualWidth, Draw_GetVirtualHeight } from '../src/engine/render/gl_draw.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const COLUMNS = 24, SLOTS = 18;

let dest = 4, pictures = [], chars = [], fills = [];
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
		Draw_Character: ( x, y, code ) => chars.push( { x, y, code } ),
		Draw_Fill: ( x, y, w, h, c ) => fills.push( { x, y, w, h, c } ),
		Draw_FadeScreen: () => {}, S_LocalSound: () => {},
		host_time_get: () => 1, realtime_get: () => 1
	} );
	return () => { if ( old ) Object.defineProperty( globalThis, 'window', old ); else delete globalThis.window; };

}

function draw() { pictures = []; chars = []; fills = []; common.set_m_state( common.m_hexen2_help ); menu.M_Draw(); }

// The drawn text by row, in menu pixels: [ { y, text, white } ] sorted top to bottom.
function rows() {

	const dx = ( Draw_GetVirtualWidth() - 320 ) >> 1, dy = ( Draw_GetVirtualHeight() - 200 ) >> 1, byY = new Map();
	for ( const c of chars ) {

		const y = c.y - dy;
		if ( ! byY.has( y ) ) byY.set( y, [] );
		byY.get( y ).push( { x: c.x - dx, code: c.code } );

	}
	return [ ...byY.entries() ].sort( ( a, b ) => a[ 0 ] - b[ 0 ] ).map( ( [ y, cs ] ) => {

		cs.sort( ( a, b ) => a.x - b.x );
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

Deno.test( 'the view pins the current heading to the top and the next unseen heading to the bottom', () => {

	const layout = Hexen2_HelpRows( HEXEN2_HELP_SECTIONS, COLUMNS ), { starts, rows } = layout;
	const top = Hexen2_HelpView( layout, 0, SLOTS );
	same( top.pinTop, null, 'nothing is pinned above the first heading' );
	const unseen = starts.findIndex( s => s >= SLOTS - 1 );
	same( top.pinBottom?.section, unseen, 'the first heading below the panel is pinned to the bottom' );
	same( top.pinBottom.text, rows[ starts[ unseen ] ].text, 'the bottom pin is that heading\'s first line' );
	check( ! top.lines.some( l => l.slot === SLOTS - 1 ), 'the bottom pin replaces the last row' );
	check( top.lines.find( l => l.slot === SLOTS - 2 ).faded, 'the row above the bottom pin is faded' );

	const inside = Hexen2_HelpView( layout, starts[ 2 ] + 3, SLOTS );
	same( inside.pinTop?.section, 2, 'scrolled past a heading, its section is pinned to the top' );
	same( inside.pinTop.text, rows[ starts[ 2 ] ].text, 'the top pin is the heading\'s first line' );
	check( ! inside.lines.some( l => l.slot === 0 ), 'the top pin replaces the first row' );
	check( inside.lines.find( l => l.slot === 1 ).faded, 'the row under the top pin is faded' );
	check( inside.lines.filter( l => l.faded ).length <= 2, 'only the rows next to the pins fade' );

	const end = Hexen2_HelpView( layout, 1e9, SLOTS );
	same( end.scroll, rows.length - SLOTS, 'the scroll stops with the last row in the bottom slot' );
	same( end.pinBottom, null, 'nothing is pinned below the last section' );
	same( end.lines.at( - 1 ).row, rows.length - 1, 'the last row is shown' );

} );

Deno.test( 'Help draws one frame and scrolls the text with keys, the wheel and touch', () => {

	const restore = wire();
	try {

		openHelp();
		draw();
		same( pictures.filter( p => /help0/.test( p.name ) ).map( p => p.name ).join(), 'gfx/menu/help01.lmp', 'only help01 is drawn, as the frame' );
		check( fills.some( f => f.w === 200 && f.h === 147 && f.c === 0 ), 'the picture\'s text panel is blacked out' );
		let shown = rows();
		same( shown[ 0 ].text, 'Basic movement:', 'the first row is the first heading' );
		check( shown[ 0 ].white, 'headings use the white (yellow) bank' );
		check( ! shown[ 1 ].white, 'body text uses the +256 (red) bank' );
		same( shown[ 0 ].y, 27, 'the text starts inside the panel' );
		check( shown.at( - 1 ).y <= 27 + 17 * 8, 'the text stays inside the panel' );

		menu.M_Keydown( K_DOWNARROW );
		same( M_Hexen2_HelpState().scroll, 1, 'Down scrolls one row' );
		menu.M_Keydown( K_MWHEELDOWN );
		same( M_Hexen2_HelpState().scroll, 3, 'the wheel scrolls two rows' );
		draw();
		same( rows()[ 0 ].text, 'Basic movement:', 'scrolled inside a section, its heading stays pinned at the top' );

		menu.M_Keydown( K_RIGHTARROW );
		draw();
		same( rows()[ 0 ].text, 'Looking around:', 'Right brings the next heading to the top' );
		menu.M_Keydown( K_LEFTARROW );
		same( M_Hexen2_HelpState().scroll, 0, 'Left goes back to the previous heading' );

		menu.M_Keydown( K_END );
		draw();
		shown = rows();
		check( shown.at( - 1 ).text.endsWith( 'other side.' ), 'End shows the last line: ' + shown.at( - 1 ).text );
		menu.M_Keydown( K_ENTER );
		same( M_Hexen2_HelpState().scroll, 0, 'Enter at the end returns to the top' );

		menu.M_Keydown( K_HOME );
		draw();
		const pinned = rows().at( - 1 );
		check( pinned.white && pinned.y === 27 + 17 * 8, 'a heading is pinned to the bottom row' );
		M_Hexen2_Help_Touch( 160, 27 + 17 * 8 + 2 );
		draw();
		same( rows()[ 0 ].text, pinned.text, 'touching the bottom pin brings its section to the top' );

		menu.M_Keydown( K_ESCAPE );
		same( common.m_state, common.m_hexen2_main, 'Escape returns to the Hexen main menu' );

	} finally { restore(); }

} );
