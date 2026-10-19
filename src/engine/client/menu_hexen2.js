/**
 * @module engine/client/menu_hexen2
 *
 * Hexen II's native menu pages on the shared menu framework (uhexen2 engine/hexen2/menu.c): the main menu, the single
 * player menu, the class choice (four classes, Demoness in Portal of Praevus) and the per-class difficulty page. The
 * pages reuse Quake's load/save, options, keys, video and quit screens through the same `m_*` states, so the menu
 * stack, sounds and drawing helpers stay one implementation.
 *
 * Types: plain values and functions; no exported classes.
 * State: the cursor of each page and the class chosen for the difficulty page; all in this module.
 * Errors: none raised; an unknown class index falls back to the Paladin.
 *
 * Native code: /tmp/h2-refs/uhexen2/engine/hexen2/menu.c:580-1030 (M_Main, M_SinglePlayer, M_Class, M_Difficulty).
 */

import { GameProfile_Get } from '../common/game_profile.js';
import { Cbuf_AddText } from '../common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue, Cvar_VariableValue, cvar_t } from '../common/cvar.js';
import { Draw_CachePic, Draw_TransPicRegion } from '../render/gl_draw.js';
import { K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, key_game, key_menu } from './keys.js';
import {
	m_none, m_hexen2_main, m_hexen2_single, m_hexen2_class, m_hexen2_skill,
	set_m_state, set_m_entersound, setKeyDest, getKeyDest, menuOpeners,
	_sv, _cls, _realtime_get, _vid, _S_LocalSound, _IN_RequestPointerLock, set_m_save_demonum, m_save_demonum,
	M_DrawTransPic, M_DrawPic, M_PrintWhite
} from './menu_common.js';
import { M_Menu_Load_f, M_Menu_Save_f } from './menu_main.js';
import { M_Menu_Keys_f, M_Menu_Video_f } from './menu_options.js';

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

const pad = ( value, digits ) => String( Math.max( 0, value | 0 ) ).padStart( digits, '0' );
const screenX = () => ( _vid.width - 320 ) >> 1;

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
 * @returns {ReadonlyArray<string>} the four names, Paladin's for an unknown class
 */
export function Hexen2_DifficultyNames( playerClass ) {

	const index = ( playerClass | 0 ) - 1;
	return HEXEN2_DIFFICULTY_NAMES[ index >= 0 && index < HEXEN2_DIFFICULTY_NAMES.length ? index : 0 ];

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
===============
M_Hexen2BigString

The native bigfont lettering (gfx/menu/bigfont2.lmp, 20x19 glyph cells, A-Z and '/'): each menu title and item row.
A missing sheet falls back to the menu's normal white font.
===============
*/
function M_Hexen2BigString( x, y, text ) {

	const pic = Draw_CachePic( 'gfx/menu/bigfont2.lmp' ) ?? Draw_CachePic( 'gfx/menu/bigfont.lmp' );
	if ( ! pic ) { M_PrintWhite( x, y, text ); return; }
	const columns = Math.max( 1, Math.floor( pic.width / 20 ) );
	let px = x + screenX();
	for ( const character of String( text ) ) {

		const code = character === '/' ? 26 : character.toUpperCase().charCodeAt( 0 ) - 65;
		if ( code >= 0 && code < 27 ) Draw_TransPicRegion( px, y, pic, ( code % columns ) * 20, Math.floor( code / columns ) * 20, 20, 19 );
		px += character === ' ' ? 10 : 16;

	}

}

function M_Hexen2Title( name ) {

	if ( ! name ) return;
	M_DrawTransPic( 10, 4, Draw_CachePic ? Draw_CachePic( 'gfx/menu/hplaque.lmp' ) : null );
	const pic = Draw_CachePic ? Draw_CachePic( name ) : null;
	if ( pic ) M_DrawPic( ( 320 - ( pic.width ?? 0 ) ) >> 1, 0, pic );

}

function M_Hexen2MenuDot( row ) {

	const f = Math.floor( _realtime_get() * 10 ) % 8;
	M_DrawTransPic( 43, 54 + row * 20, Draw_CachePic( 'gfx/menu/menudot' + ( f + 1 ) + '.lmp' ) );

}

function Hexen2_MenuSound( name ) { if ( _S_LocalSound ) _S_LocalSound( name ); }

/*
==============================================================================
			MAIN MENU
==============================================================================
*/

/**
 * Opens the Hexen II main menu (`menu_main` and Escape while playing). Pauses the attract demo as Quake's does.
 */
export function M_Hexen2_Menu_Main_f() {

	Hexen2_EnsureGameCvars();
	if ( getKeyDest() !== key_menu ) { set_m_save_demonum( _cls.demonum ); _cls.demonum = - 1; }
	setKeyDest( key_menu );
	set_m_state( m_hexen2_main );
	set_m_entersound( true );

}

/** `M_Draw` on the Hexen II main menu: plaque, title0 and the five native items. */
export function M_Hexen2_Main_Draw() {

	M_Hexen2Title( 'gfx/menu/title0.lmp' );
	for ( let i = 0; i < MAIN_ITEMS; i ++ )
		M_Hexen2BigString( 72, 60 + i * 20, [ 'SINGLE PLAYER', 'MULTIPLAYER', 'OPTIONS', 'HELP', 'QUIT' ][ i ] );
	M_Hexen2MenuDot( mainCursor );

}

/**
 * `M_Keydown` on the Hexen II main menu.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_Main_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			setKeyDest( key_game );
			set_m_state( m_none );
			_cls.demonum = m_save_demonum;
			break;
		case K_DOWNARROW:
			Hexen2_MenuSound( 'misc/menu1.wav' );
			if ( ++ mainCursor >= MAIN_ITEMS ) mainCursor = 0;
			break;
		case K_UPARROW:
			Hexen2_MenuSound( 'misc/menu1.wav' );
			if ( -- mainCursor < 0 ) mainCursor = MAIN_ITEMS - 1;
			break;
		case K_ENTER:
			set_m_entersound( true );
			switch ( mainCursor ) {

				case 0: M_Hexen2_Menu_SinglePlayer_f(); break;
				case 1: menuOpeners.multiplayerChoice(); break;
				case 2: menuOpeners.options(); break;
				case 3: menuOpeners.credits(); break;
				case 4: menuOpeners.quit(); break;

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

const SINGLE_ITEMS = 3;

/**
 * Opens the Hexen II single player menu (New Game, Load, Save).
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

	M_Hexen2Title( 'gfx/menu/title1.lmp' );
	[ 'NEW GAME', 'LOAD', 'SAVE' ].forEach( ( label, i ) => M_Hexen2BigString( 72, 60 + i * 20, label ) );
	M_Hexen2MenuDot( singleCursor );

}

/**
 * `M_Keydown` on the single player menu: New Game disconnects and asks for a class, Load and Save open the shared
 * pages.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_SinglePlayer_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Hexen2_Menu_Main_f();
			break;
		case K_DOWNARROW:
			Hexen2_MenuSound( 'misc/menu1.wav' );
			if ( ++ singleCursor >= SINGLE_ITEMS ) singleCursor = 0;
			break;
		case K_UPARROW:
			Hexen2_MenuSound( 'misc/menu1.wav' );
			if ( -- singleCursor < 0 ) singleCursor = SINGLE_ITEMS - 1;
			break;
		case K_ENTER:
			set_m_entersound( true );
			if ( singleCursor === 0 ) {

				if ( _sv.active ) Cbuf_AddText( 'disconnect\n' );
				Cbuf_AddText( 'maxplayers 1\ncoop 0\ndeathmatch 0\n' );
				M_Hexen2_Menu_Class_f();

			} else if ( singleCursor === 1 ) M_Menu_Load_f();
			else M_Menu_Save_f();
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

	if ( vy >= 54 && vy < 54 + SINGLE_ITEMS * 20 ) {

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

	M_Hexen2Title( 'gfx/menu/title2.lmp' );
	const classes = Hexen2_MenuClasses();
	for ( let i = 0; i < classes.length; i ++ ) M_Hexen2BigString( 72, 60 + i * 20, classes[ i ].upper );
	M_Hexen2MenuDot( Hexen2_ClassCursor() );
	const selected = Hexen2_SelectedClass();
	M_DrawPic( 251, 75, Draw_CachePic( selected.portrait ) );
	M_DrawTransPic( 242, 54, Draw_CachePic( 'gfx/menu/frame.lmp' ) );

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
			Hexen2_MenuSound( 'misc/menu1.wav' );
			classCursor = ( classCursor + 1 ) % classes.length;
			break;
		case K_UPARROW:
			Hexen2_MenuSound( 'misc/menu1.wav' );
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

	M_Hexen2Title( 'gfx/menu/title5.lmp' );
	const names = Hexen2_DifficultyNames( Hexen2_SelectedClass().number );
	for ( let i = 0; i < names.length; i ++ ) M_Hexen2BigString( 72, 60 + i * 20, names[ i ] );
	M_Hexen2MenuDot( skillCursor );

}

function M_Hexen2_StartGame() {

	const profile = GameProfile_Get();
	const map = profile?.startMap ?? 'demo1';
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
			Hexen2_MenuSound( 'misc/menu1.wav' );
			skillCursor = ( skillCursor + 1 ) % HEXEN2_DIFFICULTY_NAMES[ 0 ].length;
			break;
		case K_UPARROW:
			Hexen2_MenuSound( 'misc/menu1.wav' );
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
 * @returns {{ main: number, single: number, class: number, skill: number, classCursor: number, skillCursor: number }}
 *   the cursors and the state ids
 */
export function M_Hexen2_State() {

	return { main: m_hexen2_main, single: m_hexen2_single, class: m_hexen2_class, skill: m_hexen2_skill,
		classCursor, skillCursor };

}

/**
 * Resets the page cursors (a new game or a test).
 */
export function M_Hexen2_Reset() { mainCursor = singleCursor = classCursor = skillCursor = 0; }

export { M_Menu_Keys_f, M_Menu_Video_f };
