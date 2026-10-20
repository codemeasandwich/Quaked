/**
 * @module engine/client/menu_hexen2_multiplayer
 *
 * Hexen II's native multiplayer menu and its child pages (uhexen2 engine/hexen2/menu.c): M_MultiPlayer (Join a Game,
 * New Game, Setup, Load, Save), M_Setup (host and player name, class, the two colour patches, the class portrait) and
 * the whole-hub load/save screens. Join and New Game continue into the shared network screens, which draw their Hexen
 * branch; every other page here is Hexen's own.
 *
 * Types: plain values and functions; no exported classes.
 * State: the page cursors, the setup fields and the load/save return page; all in this module.
 * Errors: none raised.
 *
 * Native code: menu.c:1000-1678 (M_Load/M_Save/M_MultiPlayer/M_Setup).
 */

import { Cbuf_AddText } from '../common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_Set, Cvar_VariableValue } from '../common/cvar.js';
import { GameSelection_SavePrefix } from '../common/game_selection.js';
import { SAVEGAME_COMMENT_LENGTH } from '../common/quakedef.js';
import { hostname } from '../net/net_main.js';
import { cl_color } from './cl_main.js';
import { K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, K_BACKSPACE, K_DEL, key_game, key_menu } from './keys.js';
import {
	m_none, m_hexen2_multiplayer, m_hexen2_setup, m_hexen2_load, m_hexen2_save, m_hexen2_single, m_state,
	set_m_state, set_m_entersound, setKeyDest, menuOpeners,
	_sv, _cl, _svs, _realtime_get, _Draw_CachePic, _SCR_BeginLoadingPlaque,
	_IN_RequestPointerLock, _cl_name, M_Print, M_DrawCharacter, M_DrawTextBox,
	M_BuildTranslationTable, M_DrawTransPicTranslate
} from './menu_common.js';
import { M_Hexen2_Menu_Main_f, M_Hexen2_Menu_SinglePlayer_f, Hexen2_ScrollTitle, M_Hexen2BigString, Hexen2_MenuDot,
	Hexen2_MenuSound, Hexen2_BlinkCharacter, Hexen2_MenuClasses } from './menu_hexen2.js';

const MP_ITEMS = Object.freeze( [ 'JOIN A GAME', 'NEW GAME', 'SETUP', 'LOAD', 'SAVE' ] );
let mpCursor = 0;

/**
 * Opens the Hexen II multiplayer menu (Join a Game, New Game, Setup, Load, Save).
 */
export function M_Hexen2_Menu_Multiplayer_f() {

	setKeyDest( key_menu );
	set_m_state( m_hexen2_multiplayer );
	set_m_entersound( true );

}

/** `M_Draw` on the multiplayer menu: the scrolling title, the five bigfont items and the menudot. */
export function M_Hexen2_Multiplayer_Draw() {

	Hexen2_ScrollTitle( 'gfx/menu/title4.lmp' );
	for ( let i = 0; i < MP_ITEMS.length; i ++ ) M_Hexen2BigString( 72, 60 + i * 20, MP_ITEMS[ i ] );
	Hexen2_MenuDot( mpCursor );

}

/**
 * `M_Keydown` on the multiplayer menu. ESC returns to the main menu; Join and New Game open the shared join/new-room
 * screens, which draw their Hexen style; Setup, Load and Save are Hexen pages.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_Multiplayer_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Hexen2_Menu_Main_f();
			break;
		case K_DOWNARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( ++ mpCursor >= MP_ITEMS.length ) mpCursor = 0;
			break;
		case K_UPARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( -- mpCursor < 0 ) mpCursor = MP_ITEMS.length - 1;
			break;
		case K_ENTER:
			set_m_entersound( true );
			switch ( mpCursor ) {

				case 0: menuOpeners.hexenLanConfig(); break;
				case 1: menuOpeners.hexenGameOptions(); break;
				case 2: M_Hexen2_Menu_Setup_f(); break;
				case 3: M_Hexen2_Menu_Load_f( m_hexen2_multiplayer ); break;
				case 4: M_Hexen2_Menu_Save_f( m_hexen2_multiplayer ); break;

			}
			break;

	}

}

/**
 * `M_TouchInput` on the multiplayer menu.
 *
 * @param {number} vx x in menu pixels (unused)
 * @param {number} vy y in menu pixels
 */
export function M_Hexen2_Multiplayer_Touch( vx, vy ) {

	if ( vy >= 54 && vy < 54 + MP_ITEMS.length * 20 ) {

		mpCursor = Math.floor( ( vy - 54 ) / 20 );
		M_Hexen2_Multiplayer_Key( K_ENTER );

	}

}

/*
==============================================================================

			SETUP MENU

==============================================================================
*/

const setup_cursor_table = Object.freeze( [ 40, 56, 80, 104, 128, 156 ] );
const NUM_SETUP_CMDS = 6;
let setupCursor = 5;
let setupHostname = '', setupMyname = '';
let setupOldTop = 0, setupOldBottom = 0, setupTop = 0, setupBottom = 0, setupClass = 1;

function Hexen2_SyncCvars() {

	if ( Cvar_FindVar( 'hostname' ) === null ) Cvar_RegisterVariable( hostname );

}

function Hexen2_ClampSetupClass() {

	const classes = Hexen2_MenuClasses();
	if ( setupClass < 1 || setupClass > classes.length ) setupClass = classes.length;

}

/**
 * Opens player Setup, starting from the current name, host name, colours and class (menu.c M_Menu_Setup_f).
 */
export function M_Hexen2_Menu_Setup_f() {

	Hexen2_SyncCvars();
	setKeyDest( key_menu );
	set_m_state( m_hexen2_setup );
	set_m_entersound( true );
	setupCursor = 5;
	setupMyname = String( _cl_name?.string ?? 'player' ).substring( 0, 15 );
	setupHostname = String( Cvar_FindVar( 'hostname' )?.string ?? 'UNNAMED' ).substring( 0, 15 );
	setupTop = setupOldTop = ( cl_color.value | 0 ) >> 4;
	setupBottom = setupOldBottom = ( cl_color.value | 0 ) & 15;
	setupClass = Cvar_VariableValue( '_cl_playerclass' ) | 0;
	Hexen2_ClampSetupClass();
	setupTop = Math.max( 0, Math.min( 10, setupTop ) );
	setupBottom = Math.max( 0, Math.min( 10, setupBottom ) );

}

/** `M_Draw` on Setup: the two name fields, class, colour patches, portrait and Accept Changes. */
export function M_Hexen2_Setup_Draw() {

	Hexen2_ScrollTitle( 'gfx/menu/title4.lmp' );
	M_Print( 64, 40, 'Hostname' );
	M_DrawTextBox( 160, 32, 16, 1 );
	M_Print( 168, 40, setupHostname );

	M_Print( 64, 56, 'Your name' );
	M_DrawTextBox( 160, 48, 16, 1 );
	M_Print( 168, 56, setupMyname );

	M_Print( 64, 80, 'Current Class: ' );
	M_Print( 88, 88, Hexen2_MenuClasses()[ setupClass - 1 ]?.name ?? 'Paladin' );

	M_Print( 64, 104, 'First color patch' );
	M_Print( 64, 128, 'Second color patch' );

	M_DrawTextBox( 64, 156 - 8, 14, 1 );
	M_Print( 72, 156, 'Accept Changes' );

	if ( _Draw_CachePic ) {

		const portrait = _Draw_CachePic( 'gfx/menu/netp' + setupClass + '.lmp' );
		// Native colours are 1..10, and 0 leaves that range untranslated (menu.c M_BuildTranslationTable); passing the
		// identity row (16 for shirt, 96 for pants) keeps the shared table from indexing outside the palette.
		M_BuildTranslationTable( setupTop > 0 ? ( setupTop - 1 ) * 16 : 16, setupBottom > 0 ? ( setupBottom - 1 ) * 16 : 96 );
		M_DrawTransPicTranslate( 220, 72, portrait );

	}

	M_DrawCharacter( 56, setup_cursor_table[ setupCursor ], Hexen2_BlinkCharacter() );
	if ( setupCursor === 0 ) M_DrawCharacter( 168 + 8 * setupHostname.length, setup_cursor_table[ setupCursor ], 10 + ( Math.floor( _realtime_get() * 4 ) & 1 ) );
	if ( setupCursor === 1 ) M_DrawCharacter( 168 + 8 * setupMyname.length, setup_cursor_table[ setupCursor ], 10 + ( Math.floor( _realtime_get() * 4 ) & 1 ) );

}

function Hexen2_SetupForward() {

	Hexen2_MenuSound( 'raven/menu3.wav' );
	const classes = Hexen2_MenuClasses().length;
	if ( setupCursor === 2 ) {

		setupClass ++;
		if ( setupClass > classes ) setupClass = 1;

	} else if ( setupCursor === 3 ) setupTop = setupTop + 1;
	else if ( setupCursor === 4 ) setupBottom = setupBottom + 1;

}

/**
 * `M_Keydown` on Setup. ESC returns to the multiplayer menu, Up/Down move over the six rows, Left/Right change the
 * class and colour patches, Enter accepts (and on class/colour steps forward, as native), Backspace edits the name.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_Setup_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Hexen2_Menu_Multiplayer_f();
			break;
		case K_ENTER:
			if ( setupCursor === 0 || setupCursor === 1 ) return;
			if ( setupCursor === 2 || setupCursor === 3 || setupCursor === 4 ) { Hexen2_SetupForward(); break; }
			if ( setupMyname !== String( _cl_name?.string ?? '' ) ) Cbuf_AddText( 'name "' + setupMyname + '"\n' );
			if ( setupHostname !== String( Cvar_FindVar( 'hostname' )?.string ?? '' ) ) Cvar_Set( 'hostname', setupHostname );
			if ( setupTop !== setupOldTop || setupBottom !== setupOldBottom ) Cbuf_AddText( 'color ' + setupTop + ' ' + setupBottom + '\n' );
			Cbuf_AddText( 'playerclass ' + setupClass + '\n' );
			set_m_entersound( true );
			M_Hexen2_Menu_Multiplayer_f();
			break;
		case K_BACKSPACE:
			if ( setupCursor === 0 && setupHostname.length ) setupHostname = setupHostname.slice( 0, - 1 );
			if ( setupCursor === 1 && setupMyname.length ) setupMyname = setupMyname.slice( 0, - 1 );
			break;
		case K_UPARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( -- setupCursor < 0 ) setupCursor = NUM_SETUP_CMDS - 1;
			break;
		case K_DOWNARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( ++ setupCursor >= NUM_SETUP_CMDS ) setupCursor = 0;
			break;
		case K_LEFTARROW:
			if ( setupCursor < 2 ) break;
			Hexen2_MenuSound( 'raven/menu3.wav' );
			if ( setupCursor === 2 ) { setupClass --; if ( setupClass < 1 ) setupClass = Hexen2_MenuClasses().length; }
			else if ( setupCursor === 3 ) setupTop --;
			else if ( setupCursor === 4 ) setupBottom --;
			break;
		case K_RIGHTARROW:
			if ( setupCursor < 2 ) break;
			Hexen2_SetupForward();
			break;
		default:
			if ( key < 32 || key > 127 ) break;
			if ( setupCursor === 0 && setupHostname.length < 15 ) setupHostname += String.fromCharCode( key );
			if ( setupCursor === 1 && setupMyname.length < 15 ) setupMyname += String.fromCharCode( key );
			break;

	}

	if ( setupTop > 10 ) setupTop = 0; else if ( setupTop < 0 ) setupTop = 10;
	if ( setupBottom > 10 ) setupBottom = 0; else if ( setupBottom < 0 ) setupBottom = 10;

}

/**
 * `M_TouchInput` on Setup: a touch on a field row moves the cursor there; the name fields only take focus.
 *
 * @param {number} vx x in menu pixels (unused)
 * @param {number} vy y in menu pixels
 */
export function M_Hexen2_Setup_Touch( vx, vy ) {

	let row = - 1;
	for ( let i = 0; i < setup_cursor_table.length; i ++ )
		if ( vy >= setup_cursor_table[ i ] - 4 && vy < setup_cursor_table[ i ] + 12 ) row = i;
	if ( row >= 0 ) setupCursor = row;

}

/*
==============================================================================

			LOAD/SAVE MENUS (whole-hub saves)

==============================================================================
*/

const MAX_SAVEGAMES = 12;
const loadFilenames = new Array( MAX_SAVEGAMES ).fill( '--- UNUSED SLOT ---' );
const loadable = new Array( MAX_SAVEGAMES ).fill( false );
let loadCursor = 0;
let loadReturnState = m_hexen2_single;

/**
 * Reads the Hexen II hub save comments from the shared save repository. The record's second line is the same comment a
 * Quake slot carries (Host_Hexen2SaveGame writes the header, the comment and the hub JSON), so the menu lists it
 * without decoding the whole hub. The `save`/`load` commands these pages issue are what run Host_Hexen2SaveGame and
 * Host_Hexen2LoadGame.
 */
function Hexen2_ScanSaves() {

	for ( let i = 0; i < MAX_SAVEGAMES; i ++ ) {

		loadFilenames[ i ] = '--- UNUSED SLOT ---';
		loadable[ i ] = false;

	}
	let storage;
	try { if ( typeof localStorage === 'undefined' ) return; storage = localStorage; } catch { return; }
	for ( let i = 0; i < MAX_SAVEGAMES; i ++ ) {

		let data;
		try { data = storage.getItem( GameSelection_SavePrefix() + 's' + i ); } catch { return; }
		if ( data === null ) continue;
		const lines = data.split( '\n', 3 );
		if ( lines.length < 2 ) continue;
		loadFilenames[ i ] = lines[ 1 ].substring( 0, SAVEGAME_COMMENT_LENGTH ).replace( /_/g, ' ' );
		loadable[ i ] = true;

	}

}

/**
 * Opens the Hexen II whole-hub load page (`menu_load` and Load from Single Player or Multiplayer).
 *
 * @param {number} [returnState=m_hexen2_single] the page ESC returns to
 */
export function M_Hexen2_Menu_Load_f( returnState = m_hexen2_single ) {

	set_m_entersound( true );
	set_m_state( m_hexen2_load );
	setKeyDest( key_menu );
	loadReturnState = returnState;
	Hexen2_ScanSaves();

}

/**
 * Opens the whole-hub save page; as native, does nothing unless a local server runs, the game is not at an
 * intermission and maxclients is 1.
 *
 * @param {number} [returnState=m_hexen2_single] the page ESC returns to
 */
export function M_Hexen2_Menu_Save_f( returnState = m_hexen2_single ) {

	if ( ! _sv.active || _cl.intermission || _svs.maxclients !== 1 ) return;
	set_m_entersound( true );
	set_m_state( m_hexen2_save );
	setKeyDest( key_menu );
	loadReturnState = returnState;
	Hexen2_ScanSaves();

}

/** `M_Draw` on the load page: the scrolling Load title, the 12 hub comments and the blinking row cursor. */
export function M_Hexen2_Load_Draw() {

	Hexen2_ScrollTitle( 'gfx/menu/load.lmp' );
	for ( let i = 0; i < MAX_SAVEGAMES; i ++ ) M_Print( 16, 60 + 8 * i, loadFilenames[ i ] );
	M_DrawCharacter( 8, 60 + loadCursor * 8, Hexen2_BlinkCharacter() );

}

/** `M_Draw` on the save page. */
export function M_Hexen2_Save_Draw() {

	Hexen2_ScrollTitle( 'gfx/menu/save.lmp' );
	for ( let i = 0; i < MAX_SAVEGAMES; i ++ ) M_Print( 16, 60 + 8 * i, loadFilenames[ i ] );
	M_DrawCharacter( 8, 60 + loadCursor * 8, Hexen2_BlinkCharacter() );

}

function Hexen2_LoadSaveMove( step ) {

	Hexen2_MenuSound( 'raven/menu1.wav' );
	loadCursor = ( loadCursor + step + MAX_SAVEGAMES ) % MAX_SAVEGAMES;

}

function Hexen2_DeleteSlot() {

	if ( ! loadable[ loadCursor ] ) return;
	Hexen2_MenuSound( 'raven/menu2.wav' );
	try { localStorage.removeItem( GameSelection_SavePrefix() + 's' + loadCursor ); } catch { /* storage unavailable */ }
	Hexen2_ScanSaves();

}

/**
 * `M_Keydown` on the load page. ESC returns to the page that opened it; Up/Left and Down/Right move the slot cursor;
 * Del deletes a used slot; Enter on a used slot closes the menu and issues `load s<n>` (Host_Hexen2LoadGame).
 *
 * @param {number} k key number (0..255)
 */
export function M_Hexen2_Load_Key( k ) {

	switch ( k ) {

		case K_ESCAPE:
			if ( loadReturnState === m_hexen2_multiplayer ) M_Hexen2_Menu_Multiplayer_f();
			else M_Hexen2_Menu_SinglePlayer_f();
			break;
		case K_DEL:
			Hexen2_DeleteSlot();
			break;
		case K_ENTER:
			Hexen2_MenuSound( 'raven/menu2.wav' );
			if ( ! loadable[ loadCursor ] ) return;
			set_m_state( m_none );
			setKeyDest( key_game );
			if ( _IN_RequestPointerLock ) _IN_RequestPointerLock();
			if ( _SCR_BeginLoadingPlaque ) _SCR_BeginLoadingPlaque();
			Cbuf_AddText( 'load s' + loadCursor + '\n' );
			break;
		case K_UPARROW:
		case K_LEFTARROW:
			Hexen2_LoadSaveMove( - 1 );
			break;
		case K_DOWNARROW:
		case K_RIGHTARROW:
			Hexen2_LoadSaveMove( 1 );
			break;

	}

}

/**
 * `M_Keydown` on the save page. ESC returns; Del deletes; Enter closes the menu and issues `save s<n>`
 * (Host_Hexen2SaveGame).
 *
 * @param {number} k key number (0..255)
 */
export function M_Hexen2_Save_Key( k ) {

	switch ( k ) {

		case K_ESCAPE:
			if ( loadReturnState === m_hexen2_multiplayer ) M_Hexen2_Menu_Multiplayer_f();
			else M_Hexen2_Menu_SinglePlayer_f();
			break;
		case K_DEL:
			Hexen2_DeleteSlot();
			break;
		case K_ENTER:
			set_m_state( m_none );
			setKeyDest( key_game );
			Cbuf_AddText( 'save s' + loadCursor + '\n' );
			break;
		case K_UPARROW:
		case K_LEFTARROW:
			Hexen2_LoadSaveMove( - 1 );
			break;
		case K_DOWNARROW:
		case K_RIGHTARROW:
			Hexen2_LoadSaveMove( 1 );
			break;

	}

}

/**
 * `M_TouchInput` on the load/save page: a touch on a slot row chooses it.
 *
 * @param {number} vx x in menu pixels (unused)
 * @param {number} vy y in menu pixels
 */
export function M_Hexen2_LoadSave_Touch( vx, vy ) {

	if ( vy >= 60 && vy < 60 + MAX_SAVEGAMES * 8 ) {

		loadCursor = Math.floor( ( vy - 60 ) / 8 );
		if ( m_state === m_hexen2_save ) M_Hexen2_Save_Key( K_ENTER );
		else M_Hexen2_Load_Key( K_ENTER );

	}

}

/**
 * The multiplayer pages' cursors, for a test or a tool.
 *
 * @returns {{ mpCursor: number, setupCursor: number, loadCursor: number }} the cursors
 */
export function M_Hexen2_MultiplayerState() { return { mpCursor, setupCursor, loadCursor }; }
