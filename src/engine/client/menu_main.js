/**
 * @module engine/client/menu_main
 *
 * The main menu and the screens it opens itself (card [44j], split from menu.js): single player, load and save, the
 * Bestiarium book, the credits and quit, each with its drawing, keys and touch.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `m_main_cursor`, `m_singleplayer_cursor`, `load_cursor`; browser
 * storage.
 *
 * Errors: catches at 2 places.
 *
 * The screens of the later families (level select, multiplayer, options) are opened through `menuOpeners`
 * (menu_common.js), so this module imports none of them; they import it to come back here.
 */
import { MainMenu_SetInGame } from '../common/hooks.js'; // installed by newer/ui/menu_webgl.js
import { R_BestiaryBookOpen, R_BestiaryBookKey } from '../common/hooks.js'; // installed by newer/ui/r_bestiary_book.js
import { R_DemoSplitRelease } from '../common/hooks.js'; // installed by newer/render/r_demosplit.js
import { Cbuf_AddText } from '../common/cmd.js';
import { K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, key_game, key_menu, key_console } from './keys.js';
import { SAVEGAME_COMMENT_LENGTH } from '../common/quakedef.js';
import { GameSelection_SavePrefix } from '../common/game_selection.js';
import { GameProfile_IsHexen2 } from '../common/game_profile.js';
import { m_none, m_main, m_singleplayer, m_load, m_save, m_quit, m_credits, m_bestiary, m_state, m_save_demonum, set_m_state, set_m_entersound, set_m_save_demonum, menuOpeners, _Touch_ExitFullscreen, _cls, _sv, _svs, _cl, _host_time_get, _realtime_get, _Draw_CachePic, _weaponModelsCredit, _S_LocalSound, _SCR_BeginLoadingPlaque, _IN_RequestPointerLock, _CL_NextDemo, getKeyDest, setKeyDest, M_DrawCharacter, M_Print, M_PrintWhite, M_DrawTransPic, M_DrawSubPic, M_DrawPic, M_DrawTextBox, M_InGame, newerDefaults } from './menu_common.js';

/*
==============================================================================

			MAIN MENU

==============================================================================
*/

let m_main_cursor = 0;
const MAIN_ITEMS = 6; // Single Player, Multiplayer, Bestiarium, Options, Credits, Quit

/**
 * Opens the main menu (the `menu_main` command; also Escape in a submenu, the console closing while not connected,
 * and the WebTransport driver after a failed join). When the menu was not already up it saves `cls.demonum` and sets
 * it to -1, which holds the demo loop until Escape leaves the main menu and restores it.
 */
export function M_Menu_Main_f() {

	// Hexen II keeps its own native main and single-player pages; the rest of the stack is shared.
	if ( GameProfile_IsHexen2() ) { menuOpeners.hexenMain(); return; }

	if ( getKeyDest() !== key_menu ) {

		set_m_save_demonum( _cls.demonum );
		_cls.demonum = - 1;

	}

	setKeyDest( key_menu );
	set_m_state( m_main );
	set_m_entersound( true );

}

/**
 * `M_Draw` while `m_state` is `m_main`: the plaque, the title, the items from the `gfx/mainmenu_ext.lmp` sheet (its
 * Continue row only in a game; text labels when the sheet is missing) and the spinning `menudot` cursor, 20 pixels a
 * row from y 32. Tells the WebGL menu whether a game is on and clamps the cursor to the items shown. Draws nothing
 * until `Draw_CachePic` is wired.
 */
export function M_Main_Draw() {

	if ( ! _Draw_CachePic ) return;

	const inGame = M_InGame();
	MainMenu_SetInGame( inGame );
	const itemCount = inGame ? MAIN_ITEMS + 1 : MAIN_ITEMS;
	m_main_cursor = Math.min( m_main_cursor, itemCount - 1 );

	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/ttl_main.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );

	// The supplied seven-row sheet matches the same 20px hit/keyboard rows.
	const extPic = _Draw_CachePic( 'gfx/mainmenu_ext.lmp' );

	if ( extPic != null ) {

		if ( inGame ) {

			// Continue is only shown while playing.
			M_DrawTransPic( 72, 32, extPic );

		} else {

			// Continue's pointed descender reaches row20 in the scaled artwork.
			// Skip that last pixel as well; the remaining action grid stays20px.
			M_DrawSubPic( 72, 32, extPic, 21, 119 );

		}

	} else {

		const labels=['SINGLE PLAYER','MULTIPLAYER','BESTIARIUM','OPTIONS','CREDITS','QUIT'];
		if(inGame)labels.unshift('CONTINUE');
		labels.forEach((label,i)=>M_PrintWhite(80,37+i*20,label));

	}

	const f = Math.floor( _host_time_get() * 10 ) % 6;
	M_DrawTransPic( 54, 32 + m_main_cursor * 20, _Draw_CachePic( 'gfx/menudot' + ( f + 1 ) + '.lmp' ) );

}

/**
 * `M_Keydown` on the main menu. ESC closes the menu (key_dest `key_game`), restores `cls.demonum` and, when not
 * connected or playing a demo, resumes the demo loop (`CL_NextDemo`). Up and Down move the cursor, wrapping. Enter
 * opens the item: Continue (in a game only) closes the menu; then Single Player, Multiplayer (the local or online
 * choice), Bestiarium, Options, Credits, and Quit (leaving fullscreen first).
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Main_Key( key ) {

	const inGame = M_InGame();
	const itemCount = inGame ? MAIN_ITEMS + 1 : MAIN_ITEMS;
	m_main_cursor = Math.min( m_main_cursor, itemCount - 1 );

	switch ( key ) {

		case K_ESCAPE:
			setKeyDest( key_game );
			set_m_state( m_none );
			_cls.demonum = m_save_demonum;
			if ( _cls.demonum !== - 1 && ! _cls.demoplayback && _cls.state !== 2 ) // ca_connected
				if ( _CL_NextDemo ) _CL_NextDemo();
			break;

		case K_DOWNARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( ++ m_main_cursor >= itemCount )
				m_main_cursor = 0;
			break;

		case K_UPARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( -- m_main_cursor < 0 )
				m_main_cursor = itemCount - 1;
			break;

		case K_ENTER:
			set_m_entersound( true );

			// Adjust cursor for menu action - if in-game, cursor 0 is Continue
			const actionCursor = inGame ? m_main_cursor - 1 : m_main_cursor;

			if ( inGame && m_main_cursor === 0 ) {

				// Continue - return to game
				setKeyDest( key_game );
				set_m_state( m_none );
				break;

			}

			switch ( actionCursor ) {

				case 0:
					M_Menu_SinglePlayer_f();
					break;
				case 1:
					menuOpeners.multiplayerChoice(); // local split screen or online (card [MP1])
					break;
				case 2:
					M_Menu_Bestiary_f();
					break;
				case 3:
					menuOpeners.options();
					break;
				case 4:
					M_Menu_Credits_f();
					break;
				case 5:
					// Exit fullscreen when entering quit menu
					_Touch_ExitFullscreen();
					M_Menu_Quit_f();
					break;

			}

			break;

	}

}

/**
 * Opens the Bestiary book (the `menu_bestiary` command and the main menu's Bestiarium item): pauses the demo loop as
 * `M_Menu_Main_f` does, resets the book to its first spread (`R_BestiaryBookOpen`) and shows it as `m_bestiary`.
 */
export function M_Menu_Bestiary_f() {

	if ( getKeyDest() !== key_menu ) { set_m_save_demonum( _cls.demonum ); _cls.demonum = -1; }
	R_BestiaryBookOpen();
	setKeyDest( key_menu );
	set_m_state( m_bestiary );
	set_m_entersound( true );

}

/**
 * `M_Keydown` in the Bestiary book: ESC returns to the main menu; any other key goes to `R_BestiaryBookKey`, with the
 * menu click sound when the book used it.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Bestiary_Key( key ) {

	if ( key === K_ESCAPE ) { M_Menu_Main_f(); return; }
	if ( R_BestiaryBookKey( key ) && _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );

}

/*
==============================================================================

			SINGLE PLAYER MENU

==============================================================================
*/

let m_singleplayer_cursor = 0;

const SINGLEPLAYER_ITEMS = 5; // Newer Game, New Game, Load, Save, Level Select

/**
 * Opens the single player menu (the `menu_singleplayer` command, the main menu's Single Player item, and ESC from
 * Load, Save and Level Select): key_dest `key_menu`, `m_state` `m_singleplayer`, enter sound.
 */
export function M_Menu_SinglePlayer_f() {

	if ( GameProfile_IsHexen2() ) { menuOpeners.hexenSingle(); return; }

	setKeyDest( key_menu );
	set_m_state( m_singleplayer );
	set_m_entersound( true );

}

/**
 * `M_Draw` while `m_state` is `m_singleplayer`: the plaque, the title, the five items from `gfx/sp_menu_ext.lmp`
 * (or the classic `gfx/sp_menu.lmp` with Newer Game and Level Select printed as text; Level Select also printed over
 * an older four-row sheet) and the spinning cursor, 20 pixels a row from y 32. Nothing until `Draw_CachePic` is wired.
 */
export function M_SinglePlayer_Draw() {

	if ( ! _Draw_CachePic ) return;

	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/ttl_sgl.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );
	// Newer Game, New Game, Load, Save.  The sheet is drawn in the game's own menu
	// lettering; without it the original three items are drawn, with Newer Game
	// added as text at the top.
	const extPic = _Draw_CachePic( 'gfx/sp_menu_ext.lmp' );

	if ( extPic != null ) {

		M_DrawTransPic( 72, 32, extPic );
		// an older sheet (a cached copy) has four rows: Level Select is added as text
		if ( extPic.height < 96 ) M_Print( 72 + 8, 32 + 4 * 20 + 6, 'Level Select' );

	} else {

		M_DrawTransPic( 72, 32 + 20, _Draw_CachePic( 'gfx/sp_menu.lmp' ) );
		M_Print( 72 + 8, 32 + 6, 'Newer Game' );
		M_Print( 72 + 8, 32 + 4 * 20 + 6, 'Level Select' );

	}

	const f = Math.floor( _host_time_get() * 10 ) % 6;
	M_DrawTransPic( 54, 32 + m_singleplayer_cursor * 20, _Draw_CachePic( 'gfx/menudot' + ( f + 1 ) + '.lmp' ) );

}

/**
 * `M_Keydown` on the single player menu. ESC returns to the main menu; Up and Down move the cursor, wrapping. Enter on
 * Newer Game or New Game starts `map start` (key_dest `key_game`): `disconnect` if a server runs, `maxplayers 1`, then
 * `r_hdr 1` and the Newer defaults, or `r_hdr 0`. Enter on Load, Save or Level Select opens that screen.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_SinglePlayer_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_Main_f();
			break;

		case K_DOWNARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( ++ m_singleplayer_cursor >= SINGLEPLAYER_ITEMS )
				m_singleplayer_cursor = 0;
			break;

		case K_UPARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( -- m_singleplayer_cursor < 0 )
				m_singleplayer_cursor = SINGLEPLAYER_ITEMS - 1;
			break;

		case K_ENTER:
			set_m_entersound( true );

			switch ( m_singleplayer_cursor ) {

				case 0: // Newer Game
				case 1: // New Game
					setKeyDest( key_game );
					if ( _IN_RequestPointerLock ) _IN_RequestPointerLock();
					if ( _sv.active )
						Cbuf_AddText( 'disconnect\n' );
					Cbuf_AddText( 'maxplayers 1\n' );
					// New Game keeps the classic lighting, Newer Game uses the HDR pipeline
					Cbuf_AddText( ( m_singleplayer_cursor === 0 ? 'r_hdr 1\n' : 'r_hdr 0\n' ) );
					if ( m_singleplayer_cursor === 0 ) Cbuf_AddText( newerDefaults() );
					R_DemoSplitRelease( m_singleplayer_cursor === 0 );
					Cbuf_AddText( 'map start\n' );
					break;
				case 2:
					M_Menu_Load_f();
					break;
				case 3:
					M_Menu_Save_f();
					break;
				case 4:
					menuOpeners.levelSelect();
					break;

			}

			break;

	}

}

/*
==============================================================================

			LOAD/SAVE MENU

==============================================================================
*/

let load_cursor = 0;
const MAX_SAVEGAMES = 12;
// each game keeps its own saves (card [34c]): see GameSelection_SavePrefix

const m_filenames = [];
const loadable = [];
for ( let i = 0; i < MAX_SAVEGAMES; i ++ ) {

	m_filenames[ i ] = '--- UNUSED SLOT ---';
	loadable[ i ] = false;

}

function M_ScanSaves() {

	for ( let i = 0; i < MAX_SAVEGAMES; i ++ ) {

		m_filenames[ i ] = '--- UNUSED SLOT ---';
		loadable[ i ] = false;

	}
	let storage;
	try {

		if ( typeof localStorage === 'undefined' ) return;
		storage = localStorage;

	} catch ( e ) {

		return;

	}

	for ( let i = 0; i < MAX_SAVEGAMES; i ++ ) {

		let saveData;
		try {

			saveData = storage.getItem( GameSelection_SavePrefix() + 's' + i );

		} catch ( e ) {

			return;

		}
		if ( saveData === null ) continue;

		const lines = saveData.split( '\n', 2 );
		if ( lines.length < 2 ) continue;

		m_filenames[ i ] = lines[ 1 ].substring( 0, SAVEGAME_COMMENT_LENGTH ).replace( /_/g, ' ' );
		loadable[ i ] = true;

	}

}

/**
 * Opens the load menu (the `menu_load` command and the single player Load item) and reads the 12 slots' comments from
 * browser storage (`M_ScanSaves`, this game's save prefix).
 */
export function M_Menu_Load_f() {

	if ( GameProfile_IsHexen2() ) { menuOpeners.hexenLoad(); return; }
	set_m_entersound( true );
	set_m_state( m_load );
	setKeyDest( key_menu );
	M_ScanSaves();

}

/**
 * Opens the save menu (the `menu_save` command and the single player Save item) and reads the slots' comments; does
 * nothing unless a local server runs, the game is not at an intermission and `maxclients` is 1.
 */
export function M_Menu_Save_f() {

	if ( GameProfile_IsHexen2() ) { menuOpeners.hexenSave(); return; }
	if ( ! _sv.active )
		return;
	if ( _cl.intermission )
		return;
	if ( _svs.maxclients !== 1 )
		return;

	set_m_entersound( true );
	set_m_state( m_save );
	setKeyDest( key_menu );
	M_ScanSaves();

}

/**
 * `M_Draw` while `m_state` is `m_load`: the Load title, the 12 slot comments 8 pixels apart from y 32 (`--- UNUSED SLOT
 * ---` for empty ones) and the blinking cursor. Nothing until `Draw_CachePic` is wired.
 */
export function M_Load_Draw() {

	if ( ! _Draw_CachePic ) return;

	const p = _Draw_CachePic( 'gfx/p_load.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );

	for ( let i = 0; i < MAX_SAVEGAMES; i ++ )
		M_Print( 16, 32 + 8 * i, m_filenames[ i ] );

	// line cursor
	M_DrawCharacter( 8, 32 + load_cursor * 8, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

}

/**
 * `M_Draw` while `m_state` is `m_save`: as `M_Load_Draw`, under the Save title.
 */
export function M_Save_Draw() {

	if ( ! _Draw_CachePic ) return;

	const p = _Draw_CachePic( 'gfx/p_save.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );

	for ( let i = 0; i < MAX_SAVEGAMES; i ++ )
		M_Print( 16, 32 + 8 * i, m_filenames[ i ] );

	M_DrawCharacter( 8, 32 + load_cursor * 8, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

}

/**
 * `M_Keydown` on the load menu. ESC returns to single player; Up or Left and Down or Right move the slot cursor,
 * wrapping. Enter on a slot with a save closes the menu (key_dest `key_game`), shows the loading plaque and queues
 * `load s<n>`; on an empty slot it only plays the click.
 *
 * @param {number} k key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Load_Key( k ) {

	switch ( k ) {

		case K_ESCAPE:
			M_Menu_SinglePlayer_f();
			break;
		case K_ENTER:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu2.wav' );
			if ( ! loadable[ load_cursor ] )
				return;
			set_m_state( m_none );
			setKeyDest( key_game );
			if ( _IN_RequestPointerLock ) _IN_RequestPointerLock();
			if ( _SCR_BeginLoadingPlaque ) _SCR_BeginLoadingPlaque();
			Cbuf_AddText( 'load s' + load_cursor + '\n' );
			return;
		case K_UPARROW:
		case K_LEFTARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			load_cursor --;
			if ( load_cursor < 0 )
				load_cursor = MAX_SAVEGAMES - 1;
			break;
		case K_DOWNARROW:
		case K_RIGHTARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			load_cursor ++;
			if ( load_cursor >= MAX_SAVEGAMES )
				load_cursor = 0;
			break;

	}

}

/**
 * `M_Keydown` on the save menu. ESC returns to single player; Up or Left and Down or Right move the slot cursor,
 * wrapping. Enter closes the menu (key_dest `key_game`) and queues `save s<n>` for the slot, used or not.
 *
 * @param {number} k key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Save_Key( k ) {

	switch ( k ) {

		case K_ESCAPE:
			M_Menu_SinglePlayer_f();
			break;
		case K_ENTER:
			set_m_state( m_none );
			setKeyDest( key_game );
			Cbuf_AddText( 'save s' + load_cursor + '\n' );
			return;
		case K_UPARROW:
		case K_LEFTARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			load_cursor --;
			if ( load_cursor < 0 )
				load_cursor = MAX_SAVEGAMES - 1;
			break;
		case K_DOWNARROW:
		case K_RIGHTARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			load_cursor ++;
			if ( load_cursor >= MAX_SAVEGAMES )
				load_cursor = 0;
			break;

	}

}

/*
==============================================================================

			CREDITS MENU

==============================================================================
*/

const CREDITS_SOURCE_URL = 'https://github.com/codemeasandwich/Quaked';
const CREDITS_LINK_TEXT = 'github.com/codemeasandwich/Quaked';
const CREDITS_LINK_X = ( 320 - CREDITS_LINK_TEXT.length * 8 ) / 2;
const CREDITS_TITLE = 'Quake by id Software';
export const CREDITS_HEIGHT = 272;
export const CREDITS_SCALE = .75; // 25% smaller in both dimensions; preserve all native content.
export const CREDITS_TOP = ( 200 - CREDITS_HEIGHT ) / 2; // centre the expanded box in the usual menu space

function M_OpenCreditsSource() {

	if ( typeof window !== 'undefined' )
		window.open( CREDITS_SOURCE_URL, '_blank' );

}

/**
 * Opens the credits (the `help` and `menu_credits` commands and the main menu's Credits item): key_dest `key_menu`,
 * `m_state` `m_credits`, enter sound.
 */
export function M_Menu_Credits_f() {

	// Hexen II's Help is its five native help pages, not Quake's credits.
	if ( GameProfile_IsHexen2() ) { menuOpeners.hexenHelp(); return; }
	setKeyDest( key_menu );
	set_m_state( m_credits );
	set_m_entersound( true );

}

/**
 * Draws the credits box: `M_Draw` calls it while `m_state` is `m_credits`, inside `Draw_WithVirtualSize` (320 x
 * `CREDITS_HEIGHT`, scaled by `CREDITS_SCALE`). The id Software, port and Newer credits, the weapon models credit
 * (its picture when the host gave one) and the source link, from y `CREDITS_TOP`.
 */
export function M_Credits_Draw() {

	M_DrawTextBox( 0, CREDITS_TOP, 38, 32 );
	M_PrintWhite( ( 320 - CREDITS_TITLE.length * 8 ) / 2, CREDITS_TOP + 12, CREDITS_TITLE );
	M_PrintWhite( 16, CREDITS_TOP + 24, 'Programming        Art \n' );
	M_Print( 16, CREDITS_TOP + 32, ' John Carmack       Adrian Carmack\n' );
	M_Print( 16, CREDITS_TOP + 40, ' Michael Abrash     Kevin Cloud\n' );
	M_Print( 16, CREDITS_TOP + 48, ' John Cash          Paul Steed\n' );
	M_Print( 16, CREDITS_TOP + 56, ' Dave \'Zoid\' Kirsch\n' );
	M_PrintWhite( 16, CREDITS_TOP + 72, 'Design             Biz\n' );
	M_Print( 16, CREDITS_TOP + 80, ' John Romero        Jay Wilbur\n' );
	M_Print( 16, CREDITS_TOP + 88, ' Sandy Petersen     Mike Wilson\n' );
	M_Print( 16, CREDITS_TOP + 96, ' American McGee     Donna Jackson\n' );
	M_Print( 16, CREDITS_TOP + 104, ' Tim Willits        Todd Hollenshead\n' );
	M_PrintWhite( 16, CREDITS_TOP + 120, 'Support            Id Mom\n' );
	M_Print( 16, CREDITS_TOP + 128, ' Barrett Alexander  Shawn Green\n' );
	M_PrintWhite( 16, CREDITS_TOP + 144, 'JavaScript port\n' );
	M_Print( 16, CREDITS_TOP + 152, ' mrdoob + claude + codex\n' );
	M_PrintWhite( 16, CREDITS_TOP + 168, 'Enhancements\n' );
	M_Print( 16, CREDITS_TOP + 176, ' Brian Shannon + Claude + Codex\n' );
	M_PrintWhite( 16, CREDITS_TOP + 192, 'Ambient music' );
	M_Print( 16, CREDITS_TOP + 200, ' Iron Cthulhu Apocalypse' );
	M_PrintWhite( 16, CREDITS_TOP + 216, 'Weapon Models' );
	if ( _weaponModelsCredit ) {

		M_DrawPic( 24, CREDITS_TOP + 226, _weaponModelsCredit );
		M_Print( 88, CREDITS_TOP + 226, '(dannaki)' );

	} else M_Print( 16, CREDITS_TOP + 226, ' Dannaki (dannaki)' );
	M_PrintWhite( CREDITS_LINK_X, CREDITS_TOP + 248, CREDITS_LINK_TEXT );

}

/**
 * `M_Keydown` on the credits: ESC returns to the main menu; Enter opens the project's source page in a new window.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Credits_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_Main_f();
			break;
		case K_ENTER:
			M_OpenCreditsSource();
			break;

	}

}

/**
 * `M_TouchInput` on the credits: a touch on the source link (8 pixels from `CREDITS_TOP + 248`) opens it in a new
 * window; a touch anywhere else returns to the main menu, as ESC.
 *
 * @param {number} vx x in menu pixels (0..320)
 * @param {number} vy y in menu pixels (`CREDITS_TOP` .. `CREDITS_TOP + CREDITS_HEIGHT`)
 */
export function M_Credits_Touch( vx, vy ) {

	if ( vy >= CREDITS_TOP + 248 && vy < CREDITS_TOP + 256 && vx >= CREDITS_LINK_X && vx < CREDITS_LINK_X + CREDITS_LINK_TEXT.length * 8 ) {

		M_OpenCreditsSource();
		return;

	}

	M_Credits_Key( K_ESCAPE );

}

/*
==============================================================================

			QUIT MENU

==============================================================================
*/

/**
 * Opens the quit prompt (the `menu_quit` command and the main menu's Quit item): key_dest `key_menu`, `m_state`
 * `m_quit`, enter sound.
 */
export function M_Menu_Quit_f() {

	if ( GameProfile_IsHexen2() ) { menuOpeners.hexenQuit(); return; }
	setKeyDest( key_menu );
	set_m_state( m_quit );
	set_m_entersound( true );

}

/**
 * `M_Draw` while `m_state` is `m_quit`: a text box asking "Are you sure you want to quit? (Y/N)".
 */
export function M_Quit_Draw() {

	M_DrawTextBox( 56, 76, 24, 4 );
	M_Print( 64, 84, '  Are you sure you want' );
	M_Print( 64, 92, '  to quit? (Y/N)' );

}

/**
 * `M_Keydown` on the quit prompt. ESC, `n` or `N` return to the main menu. `y` or `Y` run the `quit` command
 * (host_cmd.js `Host_Quit_f`): the settings are saved, then the Mac app returns to the game shelf and the HTML goes
 * to the project's GitHub page (`Sys_Quit`).
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Quit_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
		case 110: // 'n'
		case 78: // 'N'
			M_Menu_Main_f();
			break;

		case 121: // 'y'
		case 89: // 'Y'
			// The quit command, confirmed (from the console key_dest, as WinQuake): settings saved, then the game shelf
			// (the app) or the GitHub page (the HTML)
			setKeyDest( key_console );
			Cbuf_AddText( 'quit\n' );
			break;

	}

}

// Main menu touch - items at y=32, 20px spacing
/**
 * `M_TouchInput` on the main menu: a touch on an item row (20 pixels a row from y 32, Continue first in a game) moves
 * the cursor there and chooses it, as Enter.
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_Main_Touch( vx, vy ) {

	const inGame = M_InGame();
	const itemCount = inGame ? MAIN_ITEMS + 1 : MAIN_ITEMS;

	// Menu items start at y=32, each item is ~20px tall
	if ( vy >= 32 && vy < 32 + itemCount * 20 ) {

		const item = Math.floor( ( vy - 32 ) / 20 );
		if ( item >= 0 && item < itemCount ) {

			m_main_cursor = item;
			M_Main_Key( K_ENTER );

		}

	}

}

// Single player menu touch
/**
 * `M_TouchInput` on the single player menu: a touch on one of the five rows (20 pixels a row from y 32) moves the
 * cursor there and chooses it, as Enter.
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_SinglePlayer_Touch( vx, vy ) {

	if ( vy >= 32 && vy < 32 + SINGLEPLAYER_ITEMS * 20 ) {

		const item = Math.floor( ( vy - 32 ) / 20 );
		if ( item >= 0 && item < SINGLEPLAYER_ITEMS ) {

			m_singleplayer_cursor = item;
			M_SinglePlayer_Key( K_ENTER );

		}

	}

}

// Load/Save menu touch - items at y=32, 8px spacing
/**
 * `M_TouchInput` on the load or save menu: a touch on a slot row (8 pixels a row from y 32) moves the cursor there and
 * loads or saves it, as Enter on `M_Load_Key` or `M_Save_Key` for the screen shown.
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_LoadSave_Touch( vx, vy ) {

	if ( vy >= 32 && vy < 32 + MAX_SAVEGAMES * 8 ) {

		const item = Math.floor( ( vy - 32 ) / 8 );
		if ( item >= 0 && item < MAX_SAVEGAMES ) {

			load_cursor = item;
			if ( m_state === m_load )
				M_Load_Key( K_ENTER );
			else
				M_Save_Key( K_ENTER );

		}

	}

}

// Quit menu touch - tap top half for yes, bottom half for no
/**
 * `M_TouchInput` on the quit prompt: a touch above y 100 answers `y` (`M_Quit_Key`), anywhere lower `n`.
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_Quit_Touch( vx, vy ) {

	if ( vy < 100 ) {

		M_Quit_Key( 121 ); // 'y'

	} else {

		M_Quit_Key( 110 ); // 'n'

	}

}
