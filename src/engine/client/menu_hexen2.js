/**
 * @module engine/client/menu_hexen2
 *
 * Hexen II's native menu pages on the shared menu framework (uhexen2 engine/hexen2/menu.c): the main menu, the single
 * player menu, the class choice (four classes, Demoness in Portal of Praevus), the per-class difficulty page and the
 * drawing helpers every Hexen page shares (ScrollTitle and its timing, the 512-glyph highlighted font, the bigfont
 * lettering and the animated menudot cursor). The later pages live in menu_hexen2_multiplayer.js,
 * menu_hexen2_options.js and menu_hexen2_help.js; they reuse these helpers, so the native positions, fonts and sounds
 * have one implementation.
 *
 * Types: plain values and functions; no exported classes.
 * State: the cursor of each page, the class chosen for the difficulty page and the ScrollTitle percentages; all in this
 * module.
 * Errors: none raised; an unknown class index falls back to the last class the edition offers.
 *
 * Native code: /tmp/h2-refs/uhexen2/engine/hexen2/menu.c:208-1030 (M_Print, M_DrawBigString, ScrollTitle, M_Main,
 * M_SinglePlayer, M_Class, M_Difficulty).
 */

import { GameProfile_Get, GameProfile_IsHexen2 } from '../common/game_profile.js';
import { Cbuf_AddText } from '../common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue, Cvar_VariableValue, cvar_t } from '../common/cvar.js';
import { COM_LoadFile } from '../common/pak.js';
import { K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, key_game, key_menu } from './keys.js';
import {
	m_none, m_hexen2_main, m_hexen2_single, m_hexen2_class, m_hexen2_skill, m_hexen2_keys,
	m_hexen2_multiplayer, m_hexen2_setup, m_hexen2_options, m_hexen2_help, m_hexen2_quit, m_hexen2_load, m_hexen2_save, m_state,
	set_m_state, set_m_entersound, setKeyDest, getKeyDest, menuOpeners,
	_sv, _cls, _realtime_get, _host_time_get, _S_LocalSound, _IN_RequestPointerLock, _Draw_CachePic,
	set_m_save_demonum, m_save_demonum, _CL_NextDemo,
	M_DrawTransPic, M_DrawPic, M_DrawTransPicRegion, M_DrawTransPicCropped, M_Print
} from './menu_common.js';

/** The native class names, in `playerclass` order (menu.c ClassNames). */
export const HEXEN2_CLASS_NAMES = Object.freeze( [ 'Paladin', 'Crusader', 'Necromancer', 'Assassin', 'Demoness' ] );
const CLASS_NAMES_UPPER = Object.freeze( [ 'PALADIN', 'CRUSADER', 'NECROMANCER', 'ASSASSIN', 'DEMONESS' ] );

/** The per-class skill names (menu.c DiffNames). */
export const HEXEN2_DIFFICULTY_NAMES = Object.freeze( [
	Object.freeze( [ 'APPRENTICE', 'SQUIRE', 'ADEPT', 'LORD' ] ), // Paladin
	Object.freeze( [ 'GALLANT', 'HOLY AVENGER', 'DIVINE HERO', 'LEGEND' ] ), // Crusader
	Object.freeze( [ 'SORCERER', 'DARK SERVANT', 'WARLOCK', 'LICH KING' ] ), // Necromancer
	Object.freeze( [ 'ROGUE', 'CUTTHROAT', 'EXECUTIONER', 'WIDOW MAKER' ] ), // Assassin
	Object.freeze( [ 'LARVA', 'SPAWN', 'FIEND', 'SHE BITCH' ] ) // Demoness
] );

const MAIN_ITEMS = 5;
let mainCursor = 0;
let singleCursor = 0;
let classCursor = 0;
let skillCursor = 0;
let enterPortals = false;

// ScrollTitle (menu.c:507-575): a percentage of the picture's height, eased toward a target. The title and the plaque
// start above the screen, slide down; a page change retracts the old title before sliding the new one in.
const TITLE_RISE = 0.5, TITLE_FALL = 0.15, LOGO_RISE = 0.15;
let titlePercent = 0, titleTarget = 1, logoPercent = 0, logoTarget = 1;
let titleLastName = '', titleCanSwitch = true, titleLastTime = null;

/**
 * The classes this edition offers: the four base classes, plus the Demoness in Portal of Praevus.
 *
 * @param {?object} [profile=GameProfile_Get()] the active profile
 * @returns {ReadonlyArray<{ number: number, name: string, upper: string, portrait: string }>} the classes
 */
export function Hexen2_MenuClasses( profile = GameProfile_Get() ) {

	const count = profile?.portals ? 5 : 4;
	return Object.freeze( HEXEN2_CLASS_NAMES.slice( 0, count ).map( ( name, index ) => Object.freeze( {
		number: index + 1, name, upper: CLASS_NAMES_UPPER[ index ], portrait: 'gfx/cport' + ( index + 1 ) + '.lmp'
	} ) ) );

}

/**
 * The skill names for one native class number.
 *
 * @param {number} playerClass 1..5
 * @returns {ReadonlyArray<string>} the four names, the last class's for an unknown number
 */
export function Hexen2_DifficultyNames( playerClass ) {

	const index = ( playerClass | 0 ) - 1;
	return HEXEN2_DIFFICULTY_NAMES[ index >= 0 && index < HEXEN2_DIFFICULTY_NAMES.length ? index : HEXEN2_DIFFICULTY_NAMES.length - 1 ];

}

// The class menu registers the native cvars when the host has not (a bare test or a tool that loads the menu alone).
function Hexen2_EnsureGameCvars() {

	if ( Cvar_FindVar( '_cl_playerclass' ) === null ) Cvar_RegisterVariable( new cvar_t( '_cl_playerclass', '1', true ) );
	if ( Cvar_FindVar( 'skill' ) === null ) Cvar_RegisterVariable( new cvar_t( 'skill', '1' ) );

}

function Hexen2_ClassCursor() {

	const classes = Hexen2_MenuClasses();
	if ( classCursor < 0 || classCursor >= classes.length ) classCursor = 0;
	return classCursor;

}

function Hexen2_SelectedClass() {

	const classes = Hexen2_MenuClasses();
	return classes[ Math.max( 0, Math.min( classes.length - 1, Hexen2_ClassCursor() ) ) ];

}

/*
==============================================================================

			NATIVE DRAWING HELPERS

==============================================================================
*/

/**
 * The native menu click (uhexen2 S_LocalSound("raven/menu1.wav")); the Hexen page files call this rather than each
 * spelling the sound name.
 *
 * @param {string} name a path under sound/, such as `raven/menu1.wav`
 */
export function Hexen2_MenuSound( name ) { if ( _S_LocalSound ) _S_LocalSound( name ); }

// The bigfont's glyph cell: 20x19 within a 160x80 sheet of 8 columns and 4 rows; the row pitch is 20, not 19
// (menu.c:387-463).
const BIGFONT_COLUMNS = 8, BIGFONT_CELL_W = 20, BIGFONT_CELL_H = 19, BIGFONT_PITCH = 20;

const BIGFONT_FALLBACK_WIDTH = ( () => {

	// Widths for a fontsheet whose pixels cannot be read (a headless test): the native table's average. The real app
	// reads gfx/menu/fontsize.lmp or measures the sheet, so this is only a last resort.
	const table = new Uint8Array( 27 * 27 );
	for ( let a = 0; a < 27; a ++ ) for ( let b = 0; b < 27; b ++ ) table[ a * 27 + b ] = 14;
	return table;

} )();

let bigfontWidths = null;

function Hexen2_BigfontNumber( character ) {

	if ( character === ' ' ) return 32;
	if ( character === '/' ) return 26;
	const code = String( character ).toUpperCase().charCodeAt( 0 ) - 65;
	return code >= 0 && code < 26 ? code : - 1;

}

// Native M_BuildBigCharWidth (menu.c:387-463): the right edge of a glyph plus the space the next glyph's ink leaves at
// its left, so adjacent letters keep the native kerning. fontsize.lmp is the cached 27x27 byte table; without it the
// table is measured from the bigfont sheet's pixels, exactly as the native code does on its first run.
function Hexen2_MeasureBigfont( pic ) {

	let pixels = null;
	if ( pic?.imageData?.data ) {

		pixels = pic.imageData.data;

	} else if ( pic?.canvas?.getContext ) {

		try { pixels = pic.canvas.getContext( '2d' ).getImageData( 0, 0, pic.width, pic.height ).data; } catch { return null; }

	}
	if ( pixels === null ) return null;

	const width = pic.width | 0, height = pic.height | 0;
	const opaque = ( x, y ) => {

		if ( x < 0 || y < 0 || x >= width || y >= height ) return false;
		return pixels[ ( y * width + x ) * 4 + 3 ] !== 0;

	};
	const table = new Uint8Array( 27 * 27 );

	for ( let a = 0; a < 27; a ++ ) {

		const ax = ( a % BIGFONT_COLUMNS ) * BIGFONT_CELL_W, ay = Math.floor( a / BIGFONT_COLUMNS ) * BIGFONT_PITCH;
		const after = new Int8Array( BIGFONT_CELL_H ).fill( BIGFONT_CELL_W );
		let biggestX = 0;
		for ( let y = 0; y < BIGFONT_CELL_H; y ++ ) for ( let x = 0; x < BIGFONT_CELL_H; x ++ ) {

			if ( opaque( ax + x, ay + y ) ) { after[ y ] = x; if ( x > biggestX ) biggestX = x; }

		}
		biggestX ++;

		for ( let b = 0; b < 27; b ++ ) {

			const bx = ( b % BIGFONT_COLUMNS ) * BIGFONT_CELL_W, by = Math.floor( b / BIGFONT_COLUMNS ) * BIGFONT_PITCH;
			const before = new Int8Array( BIGFONT_CELL_H );
			for ( let y = 0; y < BIGFONT_CELL_H; y ++ ) {

				let x = 0;
				while ( x < BIGFONT_CELL_H && ! opaque( bx + x, by + y ) ) x ++;
				before[ y ] = x;

			}
			let adjustment = 0;
			for ( ;; ) {

				let fits = false;
				for ( let y = 0; y < BIGFONT_CELL_H; y ++ ) if ( after[ y ] - before[ y ] >= 15 ) { fits = true; break; }
				if ( fits ) break;
				for ( let y = 0; y < BIGFONT_CELL_H; y ++ ) before[ y ] --;
				adjustment --;
				if ( adjustment < - BIGFONT_CELL_W * 2 ) return null; // malformed sheet

			}
			table[ a * 27 + b ] = Math.max( 0, Math.min( 255, adjustment + biggestX ) );

		}

	}
	return table;

}

function Hexen2_LoadBigfontWidths( pic ) {

	if ( bigfontWidths !== null ) return bigfontWidths;
	const file = COM_LoadFile( 'gfx/menu/fontsize.lmp' );
	if ( file && file.byteLength === 27 * 27 ) {

		bigfontWidths = new Uint8Array( file );
		return bigfontWidths;

	}
	const measured = Hexen2_MeasureBigfont( pic );
	if ( measured !== null ) {

		bigfontWidths = measured;
		return bigfontWidths;

	}
	// Do not cache the last resort: a later draw with the real packs can still read fontsize.lmp or measure the sheet.
	return BIGFONT_FALLBACK_WIDTH;

}

function Hexen2_BigfontPic() {

	if ( ! _Draw_CachePic ) return null;
	return _Draw_CachePic( 'gfx/menu/bigfont2.lmp' ) ?? _Draw_CachePic( 'gfx/menu/bigfont.lmp' );

}

/**
 * The native bigfont lettering (M_DrawBigString, menu.c:495-505): `gfx/menu/bigfont2.lmp` (falling back to
 * `bigfont.lmp`), 20x19 glyph cells, with the native per-pair advances. A missing sheet falls back to the menu's
 * small highlighted font so an item is never invisible.
 *
 * @param {number} x x in 320 x 200 menu pixels
 * @param {number} y y in 320 x 200 menu pixels
 * @param {string} text the text (A-Z, space and '/')
 */
export function M_Hexen2BigString( x, y, text ) {

	const pic = Hexen2_BigfontPic();
	if ( ! pic ) { M_Print( x, y, String( text ) ); return; }
	const widths = Hexen2_LoadBigfontWidths( pic );
	const string = String( text );
	let px = x;

	for ( let i = 0; i < string.length; i ++ ) {

		const num = Hexen2_BigfontNumber( string[ i ] );
		if ( num === 32 ) { px += 32; continue; }
		if ( num < 0 || num >= 27 ) continue;

		const next = Hexen2_BigfontNumber( string[ i + 1 ] );
		M_DrawTransPicRegion( px, y, pic, ( num % BIGFONT_COLUMNS ) * BIGFONT_CELL_W,
			Math.floor( num / BIGFONT_COLUMNS ) * BIGFONT_PITCH, BIGFONT_CELL_W, BIGFONT_CELL_H );
		if ( next < 0 || next >= 27 ) continue;

		// menu.c M_DrawBigCharacter's one-off kern for C followed by P
		const add = num === 2 && next === 15 ? 3 : 0;
		px += widths[ num * 27 + next ] + add;

	}

}

/**
 * The animated selection cursor: `gfx/menu/menudot1..8.lmp`, one frame every tenth of a second, at the native
 * 43, 54 + row * 20 (menu.c M_Main_Draw).
 *
 * @param {number} row the selected row (0-based)
 */
export function Hexen2_MenuDot( row ) {

	if ( ! _Draw_CachePic ) return;
	const frame = Math.floor( _realtime_get() * 10 ) % 8;
	M_DrawTransPic( 43, 54 + row * 20, _Draw_CachePic( 'gfx/menu/menudot' + ( frame + 1 ) + '.lmp' ) );

}

/**
 * The blinking menu text cursor character (native `12 + ((int)(realtime*4)&1)`).
 *
 * @returns {number} 12 or 13
 */
export function Hexen2_BlinkCharacter() { return 12 + ( Math.floor( _realtime_get() * 4 ) & 1 ); }

/**
 * The native ScrollTitle: eases the title and the left plaque down from above the screen, retracting the old title when
 * the page's picture changes (menu.c:507-575). `host_time_get` supplies the frame delta; a test or a tool that has not
 * wired it advances by a 60 Hz frame.
 *
 * @param {string} name the title picture, e.g. `gfx/menu/title0.lmp`
 */
export function Hexen2_ScrollTitle( name ) {

	const now = _host_time_get();
	let delta = titleLastTime === null ? 1 / 60 : now - titleLastTime;
	titleLastTime = now;
	if ( ! Number.isFinite( delta ) || delta <= 0 ) delta = 1 / 60; // a frame when the clock has not advanced
	delta = Math.min( delta, 0.25 );

	if ( titlePercent < titleTarget ) {

		const step = Math.max( ( ( titleTarget - titlePercent ) / TITLE_RISE ) * delta, 0.004 );
		titlePercent = Math.min( titleTarget, titlePercent + step );

	} else if ( titlePercent > titleTarget ) {

		const step = Math.max( ( ( titlePercent - titleTarget ) / TITLE_FALL ) * delta, 0.02 );
		titlePercent = Math.max( titleTarget, titlePercent - step );
		if ( titlePercent <= titleTarget ) titleCanSwitch = true;

	}

	if ( logoPercent < logoTarget ) {

		const step = Math.max( ( ( logoTarget - logoPercent ) / LOGO_RISE ) * delta, 0.02 );
		logoPercent = Math.min( logoTarget, logoPercent + step );

	} else if ( logoPercent > logoTarget ) {

		const step = Math.max( ( ( logoPercent - logoTarget ) / LOGO_RISE ) * delta, 0.02 );
		logoPercent = Math.max( logoTarget, logoPercent - step );

	}

	if ( titleLastName !== name && titleTarget !== 0 ) titleTarget = 0;
	if ( titleCanSwitch ) {

		titleLastName = name;
		titleCanSwitch = false;
		titleTarget = 1;

	}

	if ( ! _Draw_CachePic || ! titleLastName ) return;
	const title = _Draw_CachePic( titleLastName );
	if ( title ) {

		const finalY = ( title.height ?? 0 ) * titlePercent - ( title.height ?? 0 );
		M_DrawTransPicCropped( Math.floor( ( 320 - ( title.width ?? 0 ) ) / 2 ), finalY, title );

	}

	// Native draws the plaque on every page but Customize controls.
	if ( m_state !== m_hexen2_keys ) {

		const plaque = _Draw_CachePic( 'gfx/menu/hplaque.lmp' );
		if ( plaque ) {

			const finalY = ( plaque.height ?? 0 ) * logoPercent - ( plaque.height ?? 0 );
			M_DrawTransPicCropped( 10, finalY, plaque );

		}

	}

}

// The native M_ToggleMenu_f resets the scroll when the menu opens from the game.
function Hexen2_ResetTitle() {

	titlePercent = 0; titleTarget = 1; logoPercent = 0; logoTarget = 1;
	titleLastName = ''; titleCanSwitch = true; titleLastTime = null;

}

/*
==============================================================================

			PAGE OPENERS

==============================================================================
*/

/**
 * Opens the Hexen II main menu (`menu_main` and Escape while playing). Pauses the attract demo as Quake's does; from
 * the game it also starts the title scroll from above (native M_ToggleMenu_f).
 */
export function M_Hexen2_Menu_Main_f() {

	Hexen2_EnsureGameCvars();
	if ( getKeyDest() !== key_menu ) {

		if ( _cls.demonum !== undefined ) {

			set_m_save_demonum( _cls.demonum );
			_cls.demonum = - 1;

		}
		Hexen2_ResetTitle();

	}
	setKeyDest( key_menu );
	set_m_state( m_hexen2_main );
	set_m_entersound( true );

}

/** `M_Draw` on the Hexen II main menu: the scrolling plaque and title, the five native bigfont items, the menudot. */
export function M_Hexen2_Main_Draw() {

	Hexen2_ScrollTitle( 'gfx/menu/title0.lmp' );
	for ( let i = 0; i < MAIN_ITEMS; i ++ )
		M_Hexen2BigString( 72, 60 + i * 20, [ 'SINGLE PLAYER', 'MULTIPLAYER', 'OPTIONS', 'HELP', 'QUIT' ][ i ] );
	Hexen2_MenuDot( mainCursor );

}

function Hexen2_CloseMain() {

	setKeyDest( key_game );
	set_m_state( m_none );
	_cls.demonum = m_save_demonum;
	if ( _cls.demonum !== - 1 && ! _cls.demoplayback && _cls.state !== 2 && _CL_NextDemo ) _CL_NextDemo();

}

/**
 * `M_Keydown` on the Hexen II main menu.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_Main_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			Hexen2_CloseMain();
			break;
		case K_DOWNARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( ++ mainCursor >= MAIN_ITEMS ) mainCursor = 0;
			break;
		case K_UPARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( -- mainCursor < 0 ) mainCursor = MAIN_ITEMS - 1;
			break;
		case K_ENTER:
			set_m_entersound( true );
			switch ( mainCursor ) {

				case 0: M_Hexen2_Menu_SinglePlayer_f(); break;
				case 1: menuOpeners.hexenMultiplayer(); break;
				case 2: menuOpeners.hexenOptions(); break;
				case 3: menuOpeners.hexenHelp(); break;
				case 4: menuOpeners.hexenQuit(); break;

			}
			break;

	}

}

/**
 * `M_TouchInput` on the Hexen II main menu: a touch on a 20-pixel row from y 54 chooses it.
 *
 * @param {number} vx x in menu pixels (unused)
 * @param {number} vy y in menu pixels
 */
export function M_Hexen2_Main_Touch( vx, vy ) {

	if ( vy >= 54 && vy < 54 + MAIN_ITEMS * 20 ) {

		mainCursor = Math.floor( ( vy - 54 ) / 20 );
		M_Hexen2_Main_Key( K_ENTER );

	}

}

/*
==============================================================================

			SINGLE PLAYER MENU

==============================================================================
*/

// Portal of Praevus adds OLD MISSION and VIEW INTRO (menu.c SP_PORTALS_ITEMS).
export function Hexen2_SinglePlayerItems( profile = GameProfile_Get() ) {

	return profile?.portals ? [ 'NEW MISSION', 'LOAD', 'SAVE', 'OLD MISSION', 'VIEW INTRO' ] : [ 'NEW GAME', 'LOAD', 'SAVE' ];

}

/**
 * Opens the Hexen II single player menu (New Game, Load, Save; Portal adds Old Mission and View Intro).
 */
export function M_Hexen2_Menu_SinglePlayer_f() {

	// natively the single-player page clears a deathmatch time limit left over from a previous game
	if ( Cvar_FindVar( 'timelimit' ) !== null ) Cvar_SetValue( 'timelimit', 0 );
	setKeyDest( key_menu );
	set_m_state( m_hexen2_single );
	set_m_entersound( true );

}

/** `M_Draw` on the single player menu. */
export function M_Hexen2_SinglePlayer_Draw() {

	Hexen2_ScrollTitle( 'gfx/menu/title1.lmp' );
	const items = Hexen2_SinglePlayerItems();
	for ( let i = 0; i < items.length; i ++ ) M_Hexen2BigString( 72, 60 + i * 20, items[ i ] );
	Hexen2_MenuDot( singleCursor );

}

function Hexen2_BeginNewGame( portalsMission ) {

	enterPortals = !! portalsMission;
	if ( _sv.active ) Cbuf_AddText( 'disconnect\n' );
	Cbuf_AddText( 'maxplayers 1\ncoop 0\ndeathmatch 0\n' );
	M_Hexen2_Menu_Class_f();

}

/**
 * `M_Keydown` on the single player menu: New Game disconnects and asks for a class, Load and Save open the Hexen hub
 * pages, Portal's Old Mission starts the base campaign and View Intro plays the intro demo.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_SinglePlayer_Key( key ) {

	const items = Hexen2_SinglePlayerItems();
	switch ( key ) {

		case K_ESCAPE:
			M_Hexen2_Menu_Main_f();
			break;
		case K_DOWNARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( ++ singleCursor >= items.length ) singleCursor = 0;
			break;
		case K_UPARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( -- singleCursor < 0 ) singleCursor = items.length - 1;
			break;
		case K_ENTER:
			set_m_entersound( true );
			if ( GameProfile_IsHexen2() && GameProfile_Get()?.portals ) {

				if ( singleCursor === 0 ) Hexen2_BeginNewGame( true );
				else if ( singleCursor === 1 ) menuOpeners.hexenLoad();
				else if ( singleCursor === 2 ) menuOpeners.hexenSave();
				else if ( singleCursor === 3 ) Hexen2_BeginNewGame( false );
				else if ( singleCursor === 4 ) {

					setKeyDest( key_game );
					set_m_state( m_none );
					Cbuf_AddText( 'playdemo t9\n' );

				}
				break;

			}
			if ( singleCursor === 0 ) Hexen2_BeginNewGame( false );
			else if ( singleCursor === 1 ) menuOpeners.hexenLoad();
			else menuOpeners.hexenSave();
			break;

	}

}

/**
 * `M_TouchInput` on the single player menu.
 *
 * @param {number} vx x in menu pixels (unused)
 * @param {number} vy y in menu pixels
 */
export function M_Hexen2_SinglePlayer_Touch( vx, vy ) {

	const count = Hexen2_SinglePlayerItems().length;
	if ( vy >= 54 && vy < 54 + count * 20 ) {

		singleCursor = Math.floor( ( vy - 54 ) / 20 );
		M_Hexen2_SinglePlayer_Key( K_ENTER );

	}

}

/*
==============================================================================

			CLASS MENU

==============================================================================
*/

/**
 * Opens the class menu, with the cursor on the class already chosen.
 */
export function M_Hexen2_Menu_Class_f() {

	Hexen2_EnsureGameCvars();
	const current = ( Cvar_VariableValue( '_cl_playerclass' ) | 0 ) - 1;
	const classes = Hexen2_MenuClasses();
	classCursor = current >= 0 && current < classes.length ? current : 0;
	setKeyDest( key_menu );
	set_m_state( m_hexen2_class );
	set_m_entersound( true );

}

/** `M_Draw` on the class menu: the class list, the selected class's portrait and the native frame. */
export function M_Hexen2_Class_Draw() {

	Hexen2_ScrollTitle( 'gfx/menu/title2.lmp' );
	const classes = Hexen2_MenuClasses();
	for ( let i = 0; i < classes.length; i ++ ) M_Hexen2BigString( 72, 60 + i * 20, classes[ i ].upper );
	Hexen2_MenuDot( Hexen2_ClassCursor() );
	if ( ! _Draw_CachePic ) return;
	const selected = Hexen2_SelectedClass();
	M_DrawPic( 251, 54 + 21, _Draw_CachePic( selected.portrait ) );
	M_DrawTransPic( 242, 54, _Draw_CachePic( 'gfx/menu/frame.lmp' ) );

}

/**
 * `M_Keydown` on the class menu: Enter records the class in `_cl_playerclass` and opens the difficulty page.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_Class_Key( key ) {

	const classes = Hexen2_MenuClasses();
	switch ( key ) {

		case K_ESCAPE:
			M_Hexen2_Menu_SinglePlayer_f();
			break;
		case K_DOWNARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			classCursor = ( classCursor + 1 ) % classes.length;
			break;
		case K_UPARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			classCursor = ( classCursor - 1 + classes.length ) % classes.length;
			break;
		case K_ENTER:
			Cvar_SetValue( '_cl_playerclass', Hexen2_SelectedClass().number );
			set_m_entersound( true );
			M_Hexen2_Menu_Skill_f();
			break;

	}

}

/**
 * `M_TouchInput` on the class menu.
 *
 * @param {number} vx x in menu pixels (unused)
 * @param {number} vy y in menu pixels
 */
export function M_Hexen2_Class_Touch( vx, vy ) {

	const classes = Hexen2_MenuClasses();
	if ( vy >= 54 && vy < 54 + classes.length * 20 ) {

		classCursor = Math.floor( ( vy - 54 ) / 20 );
		M_Hexen2_Class_Key( K_ENTER );

	}

}

/*
==============================================================================

			DIFFICULTY MENU

==============================================================================
*/

/**
 * Opens the difficulty page with the four skill names of the chosen class.
 */
export function M_Hexen2_Menu_Skill_f() {

	setKeyDest( key_menu );
	set_m_state( m_hexen2_skill );
	set_m_entersound( true );

}

/** `M_Draw` on the difficulty page. */
export function M_Hexen2_Skill_Draw() {

	Hexen2_ScrollTitle( 'gfx/menu/title5.lmp' );
	const names = Hexen2_DifficultyNames( Hexen2_SelectedClass().number );
	for ( let i = 0; i < names.length; i ++ ) M_Hexen2BigString( 72, 60 + i * 20, names[ i ] );
	Hexen2_MenuDot( skillCursor );

}

function M_Hexen2_StartGame() {

	const profile = GameProfile_Get();
	// Portal's New Mission starts keep1; Old Mission runs the base campaign's demo1, as native M_Difficulty_Key.
	const map = profile?.portals ? ( enterPortals ? ( profile.startMap ?? 'keep1' ) : 'demo1' ) : ( profile?.startMap ?? 'demo1' );
	Cvar_SetValue( 'skill', skillCursor );
	Cvar_SetValue( '_cl_playerclass', Hexen2_SelectedClass().number );
	set_m_state( m_none );
	setKeyDest( key_game );
	if ( _IN_RequestPointerLock ) _IN_RequestPointerLock();
	Cbuf_AddText( 'map ' + map + '\n' );

}

/**
 * `M_Keydown` on the difficulty page: Enter sets `skill` and `_cl_playerclass` and starts the edition's first map
 * (`map demo1`, or Portal's `keep1`).
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_Skill_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Hexen2_Menu_Class_f();
			break;
		case K_DOWNARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			skillCursor = ( skillCursor + 1 ) % HEXEN2_DIFFICULTY_NAMES[ 0 ].length;
			break;
		case K_UPARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			skillCursor = ( skillCursor - 1 + HEXEN2_DIFFICULTY_NAMES[ 0 ].length ) % HEXEN2_DIFFICULTY_NAMES[ 0 ].length;
			break;
		case K_ENTER:
			set_m_entersound( true );
			M_Hexen2_StartGame();
			break;

	}

}

/**
 * `M_TouchInput` on the difficulty page.
 *
 * @param {number} vx x in menu pixels (unused)
 * @param {number} vy y in menu pixels
 */
export function M_Hexen2_Skill_Touch( vx, vy ) {

	if ( vy >= 54 && vy < 54 + 4 * 20 ) {

		skillCursor = Math.floor( ( vy - 54 ) / 20 );
		M_Hexen2_Skill_Key( K_ENTER );

	}

}

/**
 * The state of the Hexen menus, for a test or a tool that loads the pages without a host.
 *
 * @returns {{ main: number, single: number, class: number, skill: number, multiplayer: number, setup: number,
 *   options: number, keys: number, help: number, quit: number, load: number, save: number, classCursor: number,
 *   skillCursor: number, titlePercent: number, titleTarget: number, logoPercent: number, logoTarget: number }}
 *   the cursors, the title animation and the state ids
 */
export function M_Hexen2_State() {

	return { main: m_hexen2_main, single: m_hexen2_single, class: m_hexen2_class, skill: m_hexen2_skill,
		multiplayer: m_hexen2_multiplayer, setup: m_hexen2_setup, options: m_hexen2_options, keys: m_hexen2_keys,
		help: m_hexen2_help, quit: m_hexen2_quit, load: m_hexen2_load, save: m_hexen2_save,
		classCursor, skillCursor, titlePercent, titleTarget, logoPercent, logoTarget };

}

/**
 * Resets the page cursors and the title scroll (a new game or a test).
 */
export function M_Hexen2_Reset() {

	mainCursor = singleCursor = classCursor = skillCursor = 0;
	enterPortals = false;
	Hexen2_ResetTitle();

}
