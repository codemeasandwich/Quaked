// M1: Hexen II's native menu pages on the shared framework (uhexen2 engine/hexen2/menu.c). Through the public menu
// entry points and draw calls: the bigfont rows and menudot cursor share a row centre, ScrollTitle eases down to the
// native y, every main item opens a Hexen page (not the Quake one), M_Print uses Hexen's +256 highlighted bank while
// Quake keeps +128, and the cursor is gfx/menu/menudot1..8 under Hexen.
import { Cbuf_Init } from '../src/engine/common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, cvar_t } from '../src/engine/common/cvar.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { K_ESCAPE, K_ENTER, K_DOWNARROW, K_RIGHTARROW } from '../src/engine/client/keys.js';
import * as menu from '../src/engine/client/menu.js';
import * as common from '../src/engine/client/menu_common.js';
import { M_Hexen2_Reset, M_Hexen2_State, M_Hexen2_Main_Draw, M_Hexen2_SinglePlayer_Draw } from '../src/engine/client/menu_hexen2.js';
import { M_Hexen2_Multiplayer_Draw } from '../src/engine/client/menu_hexen2_multiplayer.js';
import { M_Hexen2_Options_Draw, M_Hexen2_Keys_Draw } from '../src/engine/client/menu_hexen2_options.js';
import { M_Hexen2_Help_Draw, M_Hexen2_Quit_Draw } from '../src/engine/client/menu_hexen2_help.js';
import { Draw_GetVirtualWidth, Draw_GetVirtualHeight, Draw_HighlightOffset } from '../src/engine/render/gl_draw.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const win = () => {

	const old = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 } } );
	return () => { if ( old ) Object.defineProperty( globalThis, 'window', old ); else delete globalThis.window; };

};

let dest = 4 /* key_game */, time = 0, pictures = [], subs = [], chars = [], regions = [], sounds = [];
const sizes = {
	'gfx/menu/bigfont2.lmp': [ 160, 80 ], 'gfx/menu/bigfont.lmp': [ 160, 80 ], 'gfx/menu/hplaque.lmp': [ 35, 176 ],
	'gfx/menu/title0.lmp': [ 117, 60 ], 'gfx/menu/title1.lmp': [ 117, 60 ], 'gfx/menu/title2.lmp': [ 117, 60 ],
	'gfx/menu/title3.lmp': [ 129, 60 ], 'gfx/menu/title4.lmp': [ 185, 60 ], 'gfx/menu/title5.lmp': [ 185, 60 ],
	'gfx/menu/title6.lmp': [ 173, 60 ], 'gfx/menu/load.lmp': [ 117, 60 ], 'gfx/menu/save.lmp': [ 117, 60 ],
	'gfx/menu/help01.lmp': [ 320, 200 ], 'gfx/menu/help02.lmp': [ 320, 200 ], 'gfx/menu/help03.lmp': [ 320, 200 ],
	'gfx/menu/help04.lmp': [ 320, 200 ], 'gfx/menu/help05.lmp': [ 320, 200 ]
};
function picture( path ) {

	const size = sizes[ path ] ?? ( /menudot/.test( path ) ? [ 40, 31 ] : /cport|frame|netp/.test( path ) ? [ 68, 92 ] : [ 16, 16 ] );
	return { name: path, width: size[ 0 ], height: size[ 1 ] };

}

function resetDraw() { pictures = []; subs = []; chars = []; regions = []; sounds = []; }

function wire() {

	Cbuf_Init();
	GameProfile_Set( 'hexen2' );
	M_Hexen2_Reset();
	dest = 4; time = 0;
	if ( Cvar_FindVar( 'skill' ) === null ) Cvar_RegisterVariable( new cvar_t( 'skill', '1' ) );
	if ( Cvar_FindVar( '_cl_playerclass' ) === null ) Cvar_RegisterVariable( new cvar_t( '_cl_playerclass', '1', true ) );
	common.M_SetExternals( {
		key_dest_set: v => { dest = v; }, key_dest_get: () => dest,
		cls: { state: 0, demonum: - 1, demoplayback: false }, sv: { active: false }, svs: { maxclients: 1 },
		cl: { intermission: 0 },
		Draw_CachePic: path => picture( path ),
		Draw_TransPic: ( x, y, p ) => pictures.push( { x, y, name: p.name } ),
		Draw_Pic: ( x, y, p ) => pictures.push( { x, y, name: p.name } ),
		Draw_SubPic: ( x, y, p, sy, sh ) => subs.push( { x, y, name: p.name, sy, sh } ),
		Draw_TransPicRegion: ( x, y, p, sx, sy, sw, sh ) => regions.push( { x, y, name: p.name, sx, sy, sw, sh } ),
		Draw_Character: ( x, y, code ) => chars.push( { x, y, code } ),
		Draw_FadeScreen: () => {}, S_LocalSound: name => sounds.push( name ),
		host_time_get: () => time, realtime_get: () => time
	} );

}

function textFrom( list ) {

	return list.map( c => String.fromCharCode( c.code >= 256 ? c.code - 256 : c.code & 255 ) ).join( '' );

}

Deno.test( 'the main menu bigfont rows and the menudot cursor share a row centre', () => {

	const restore = win();
	try {

		wire();
		menu.M_Menu_Main_f();
		same( common.m_state, common.m_hexen2_main, 'the native main menu opens' );
		resetDraw();
		time = 1;
		M_Hexen2_Main_Draw();
		const dx = ( Draw_GetVirtualWidth() - 320 ) >> 1, dy = ( Draw_GetVirtualHeight() - 200 ) >> 1;
		const glyphs = regions.filter( r => r.name === 'gfx/menu/bigfont2.lmp' );
		const dots = pictures.filter( p => /gfx\/menu\/menudot[1-8]\.lmp/.test( p.name ) );
		check( glyphs.length > 20, 'the five item rows are drawn in bigfont cells: ' + glyphs.length );
		same( dots.length, 1, 'one animated menudot is drawn' );
		same( dots[ 0 ].x, 43 + dx, 'the cursor keeps the native x' );
		same( dots[ 0 ].y, 54 + dy, 'the cursor keeps the native first-row y' );
		for ( let row = 0; row < 5; row ++ ) {

			const rowGlyphs = glyphs.filter( g => g.y === 60 + row * 20 + dy );
			check( rowGlyphs.length > 0, 'row ' + row + ' has bigfont cells' );
			// the 19-pixel glyph and the 31-pixel menudot are centred on each other natively
			check( rowGlyphs[ 0 ].y + 19 / 2 === dots[ 0 ].y + 31 / 2 + row * 20, 'row ' + row + ' glyph and cursor centres coincide' );

		}

	} finally { restore(); }

} );

Deno.test( 'ScrollTitle eases the title down over time and ends at the native y', () => {

	const restore = win();
	try {

		wire();
		menu.M_Menu_Main_f();
		const dy = ( Draw_GetVirtualHeight() - 200 ) >> 1;
		resetDraw();
		time = 0;
		M_Hexen2_Main_Draw();
		const first = subs.find( s => s.name === 'gfx/menu/title0.lmp' );
		check( first, 'the title is drawn while it slides' );
		const startY = first ? first.y : dy - 60;
		for ( let i = 1; i <= 30; i ++ ) { time = i * 0.1; M_Hexen2_Main_Draw(); }
		const titles = subs.filter( s => s.name === 'gfx/menu/title0.lmp' );
		const end = titles[ titles.length - 1 ];
		check( end, 'the title is still drawn at rest' );
		check( end.y === dy, 'the title ends at its native y (0 in menu space): ' + end.y + ' != ' + dy );
		check( end.sy === 0 && end.sh === 60, 'the whole title is visible at rest' );
		check( startY < end.y, 'the title moved down over time: ' + startY + ' -> ' + end.y );
		const plaque = subs.filter( s => s.name === 'gfx/menu/hplaque.lmp' ).pop();
		check( plaque && plaque.y === dy, 'the plaque also ends at its native y' );

	} finally { restore(); }

} );

Deno.test( 'each main-menu entry opens its Hexen page, never the Quake one', () => {

	const restore = win();
	try {

		wire();
		const expected = [ common.m_hexen2_single, common.m_hexen2_multiplayer, common.m_hexen2_options,
			common.m_hexen2_help, common.m_hexen2_quit ];
		for ( let item = 0; item < expected.length; item ++ ) {

			wire();
			menu.M_Menu_Main_f();
			for ( let n = 0; n < item; n ++ ) menu.M_Keydown( K_DOWNARROW );
			menu.M_Keydown( K_ENTER );
			same( common.m_state, expected[ item ], 'main item ' + item + ' opens its Hexen page' );
			check( common.m_state !== common.m_main && common.m_state !== common.m_options && common.m_state !== common.m_quit
				&& common.m_state !== common.m_credits, 'main item ' + item + ' did not open a Quake page' );
			if ( item === 1 ) {

				resetDraw(); M_Hexen2_Multiplayer_Draw();
				const text = regions.filter( r => r.name === 'gfx/menu/bigfont2.lmp' );
				check( text.length > 0, 'the multiplayer page uses the Hexen bigfont' );
				check( /gfx\/menu\/title4\.lmp/.test( subs.map( s => s.name ).join() ), 'the multiplayer page scrolls its native title' );

			}
			if ( item === 2 ) {

				resetDraw(); M_Hexen2_Options_Draw();
				const printed = chars.filter( c => c.code >= 32 );
				check( printed.length > 0, 'the options page prints its rows' );
				check( printed.every( c => c.code >= 256 ), 'the options page uses the +256 highlighted bank, never +128 accented glyphs' );

			}
			if ( item === 3 ) {

				resetDraw(); M_Hexen2_Help_Draw();
				check( pictures.some( p => p.name === 'gfx/menu/help01.lmp' ), 'Help draws the first native help page' );
				check( ! pictures.some( p => /ttl_main|p_option|qplaque/.test( p.name ) ), 'Help draws no Quake credits art' );
				menu.M_Keydown( K_RIGHTARROW ); resetDraw(); M_Hexen2_Help_Draw();
				check( pictures.some( p => p.name === 'gfx/menu/help02.lmp' ), 'Right advances to the second help page' );

			}
			if ( item === 4 ) {

				resetDraw(); M_Hexen2_Quit_Draw();
				const text = textFrom( chars );
				check( text.includes( 'Hexen II version' ), 'Quit shows the native Hexen heading: ' + text.slice( 0, 80 ) );
				check( text.includes( 'Press y to exit' ), 'Quit shows the native exit line' );
				check( ! text.includes( 'Are you sure' ), 'Quit is not Quake\'s confirmation prompt' );

			}

		}

	} finally { restore(); }

} );

Deno.test( 'the highlighted-text offset is profile-driven: +256 for Hexen, +128 for Quake', () => {

	const restore = win();
	try {

		wire();
		same( Draw_HighlightOffset(), 256, 'Hexen highlights at +256' );
		resetDraw();
		common.M_Print( 0, 0, 'A' );
		same( chars[ 0 ].code, 65 + 256, 'M_Print adds 256 under Hexen' );
		common.M_PrintWhite( 0, 8, 'A' );
		same( chars[ 1 ].code, 65, 'M_PrintWhite keeps the plain glyph' );

		GameProfile_Set( 'quake' );
		same( Draw_HighlightOffset(), 128, 'Quake still highlights at +128' );
		resetDraw();
		common.M_Print( 0, 0, 'A' );
		same( chars[ 0 ].code, 65 + 128, 'M_Print adds 128 under Quake' );
		GameProfile_Set( 'hexen2' );

	} finally { restore(); }

} );

Deno.test( 'the Hexen cursor is the animated gfx/menu/menudot, not the Quake dot', () => {

	const restore = win();
	try {

		wire();
		menu.M_Menu_Main_f();
		resetDraw(); time = 0; M_Hexen2_Main_Draw();
		let dot = pictures.find( p => /menudot/.test( p.name ) );
		same( dot?.name, 'gfx/menu/menudot1.lmp', 'the first menudot frame at time zero' );
		resetDraw(); time = 0.1; M_Hexen2_Main_Draw();
		dot = pictures.find( p => /menudot/.test( p.name ) );
		same( dot?.name, 'gfx/menu/menudot2.lmp', 'the second menudot frame a tenth of a second later' );
		check( ! pictures.some( p => p.name === 'gfx/menudot1.lmp' ), 'the Quake cursor path is never used' );

	} finally { restore(); }

} );

Deno.test( 'Single Player opens the Hexen hub load and save pages', () => {

	const restore = win();
	try {

		wire();
		menu.M_Menu_Main_f();
		menu.M_Keydown( K_ENTER );
		same( common.m_state, common.m_hexen2_single, 'Single Player opens' );
		resetDraw(); M_Hexen2_SinglePlayer_Draw();
		check( regions.some( r => r.name === 'gfx/menu/bigfont2.lmp' ), 'the single-player items use the Hexen bigfont' );
		menu.M_Keydown( K_DOWNARROW );
		menu.M_Keydown( K_ENTER );
		same( common.m_state, common.m_hexen2_load, 'Load opens the Hexen hub load page' );
		menu.M_Keydown( K_ESCAPE );
		same( common.m_state, common.m_hexen2_single, 'ESC returns to the Hexen single-player page' );
		same( common.m_state, M_Hexen2_State().single, 'the state ids are the Hexen ones' );

	} finally { restore(); }

} );

Deno.test( 'menu.M_Draw dispatches to the Hexen pages, never the Quake art', () => {

	const restore = win();
	try {

		wire();
		menu.M_Menu_Main_f();
		resetDraw();
		time = 1;
		menu.M_Draw();
		check( regions.some( r => r.name === 'gfx/menu/bigfont2.lmp' ), 'M_Draw paints the Hexen bigfont rows' );
		check( pictures.some( p => /gfx\/menu\/menudot[1-8]\.lmp/.test( p.name ) ), 'M_Draw paints the Hexen menudot' );
		check( ! pictures.some( p => p.name === 'gfx/qplaque.lmp' || p.name === 'gfx/menudot1.lmp' ), 'M_Draw paints no Quake menu art' );

		wire();
		menu.M_Menu_Main_f();
		for ( let i = 0; i < 3; i ++ ) menu.M_Keydown( K_DOWNARROW );
		menu.M_Keydown( K_ENTER );
		resetDraw();
		menu.M_Draw();
		check( pictures.some( p => p.name === 'gfx/menu/help01.lmp' ), 'M_Draw paints the Hexen help page' );
		check( ! pictures.some( p => /ttl_|p_option|qplaque/.test( p.name ) ), 'M_Draw paints no Quake help/credits art' );

	} finally { restore(); }

} );
