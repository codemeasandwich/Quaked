/**
 * @module engine/client/menu
 *
 * The native menu (WinQuake menu.c) and the Newer Game options: main, single player, multiplayer rooms, options,
 * features, cheats, saves. Since card [44j] this module keeps the menu's entry points (`M_Init` and its commands,
 * `M_Draw`, `M_Keydown`, `M_ToggleMenu_f`, the touch input) and the public names, re-exported from the screen
 * families it was split into: menu_common.js (the state, the host's externals, the drawing helpers), menu_main.js
 * (main, single player, load and save, the Bestiarium, credits, quit), menu_levelselect.js, menu_multiplayer.js
 * (local play, online rooms, game options, setup) and menu_options.js (options, Newer's options, keys, cheats,
 * video). The families import only menu_common.js and menu_main.js; the main menu reaches the others through
 * `menuOpeners`, which this module fills as it loads.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Engine callbacks are injected with `M_SetExternals`.
 */
// Ported from: WinQuake/menu.c, WinQuake/menu.h -- menu system

import { MainMenu_Begin, MainMenu_End, MainMenu_SetVisible } from '../common/hooks.js'; // installed by newer/ui/menu_webgl.js
import { R_BestiaryBookDraw, R_BestiaryBookTouch, R_BestiaryBookCorner } from '../common/hooks.js'; // installed by newer/ui/r_bestiary_book.js
import { R_DemoLoadingConsoleOverride, R_WelcomeLoadingHolding } from '../common/hooks.js'; // installed by newer/ui/r_demoloading.js
import { Draw_StudioLogo } from '../common/hooks.js'; // installed by newer/ui/studio_logo.js
import { R_DemoSplitActive } from '../common/hooks.js'; // installed by newer/render/r_demosplit.js
import { Cmd_AddCommand } from '../common/cmd.js';
import { Con_ToggleConsole_f } from '../common/console.js';
import { K_ESCAPE, key_game, key_console, key_menu } from './keys.js';
import { scr_con_current } from '../render/gl_screen.js';
import { Draw_GetUIScale, Draw_WithVirtualSize } from '../render/gl_draw.js';
import { m_none, m_main, m_singleplayer, m_load, m_save, m_multiplayer, m_setup, m_options, m_video, m_keys, m_quit, m_lanconfig, m_gameoptions, m_credits, m_newer, m_levelselect, m_bestiary, m_cheats, m_mpchoice, m_splitscreen, m_state, m_entersound, m_recursiveDraw, set_m_state, set_m_entersound, set_m_recursiveDraw, menuOpeners, _realVid, _vid, _realtime_get, _Draw_Fill, _Draw_FadeScreen, _Draw_ConsoleBackground, _S_LocalSound, getKeyDest, setKeyDest, M_PrintWhite } from './menu_common.js';
import { M_Menu_Main_f, M_Main_Draw, M_Main_Key, M_Menu_Bestiary_f, M_Bestiary_Key, M_Menu_SinglePlayer_f, M_SinglePlayer_Draw, M_SinglePlayer_Key, M_Menu_Load_f, M_Menu_Save_f, M_Load_Draw, M_Save_Draw, M_Load_Key, M_Save_Key, CREDITS_HEIGHT, CREDITS_SCALE, CREDITS_TOP, M_Menu_Credits_f, M_Credits_Draw, M_Credits_Key, M_Credits_Touch, M_Menu_Quit_f, M_Quit_Draw, M_Quit_Key, M_Main_Touch, M_SinglePlayer_Touch, M_LoadSave_Touch, M_Quit_Touch } from './menu_main.js';
import { M_Menu_LevelSelect_f, M_LevelSelect_Draw, M_LevelSelect_Key, M_LevelSelect_Touch } from './menu_levelselect.js';
import { M_Menu_MultiplayerChoice_f, M_MultiplayerChoice_Draw, M_MultiplayerChoice_Key, M_MultiplayerChoice_Touch, M_SplitScreen_Draw, M_SplitScreen_Key, M_SplitScreen_Touch, M_Menu_MultiPlayer_f, M_MultiPlayer_Draw, M_MultiPlayer_Key, M_Menu_LanConfig_f, M_LanConfig_Draw, M_LanConfig_Key, M_Menu_GameOptions_f, M_GameOptions_Draw, M_GameOptions_Key, M_Menu_Setup_f, M_Setup_Draw, M_Setup_Key, M_MultiPlayer_Touch, M_LanConfig_Touch, M_GameOptions_Touch } from './menu_multiplayer.js';
import { M_Cheats_Draw, M_Cheats_Key, M_Cheats_Touch, M_Menu_Options_f, M_Options_Draw, M_Options_Key, M_Newer_Draw, M_Newer_Key, M_Newer_Touch, M_Menu_Keys_f, M_Keys_Draw, M_Keys_Key, M_Menu_Video_f, M_Video_Draw, M_Video_Key, M_Options_Touch, M_Keys_Touch } from './menu_options.js';
export { CHEATS } from './menu_options.js';
export { M_ConnectionError, M_ShouldReturnOnError, M_Menu_MultiplayerChoice_f, M_LocalPlayerJoin } from './menu_multiplayer.js';
export { LEVEL_SELECT_LEVELS, LEVEL_SELECT_EPISODES, M_LevelSelectOffer } from './menu_levelselect.js';
export { M_Menu_Main_f, M_Menu_Bestiary_f } from './menu_main.js';
export { m_none, m_main, m_singleplayer, m_load, m_save, m_multiplayer, m_setup, m_net, m_options, m_video, m_keys, m_help, m_quit, m_serialconfig, m_modemconfig, m_lanconfig, m_gameoptions, m_search, m_slist, m_credits, m_newer, m_levelselect, m_bestiary, m_cheats, m_mpchoice, m_splitscreen, m_state, m_entersound, set_m_state, set_m_entersound, set_m_recursiveDraw, set_m_return_state, set_m_return_onerror, set_m_return_reason, set_m_save_demonum, menuOpeners, M_SetExternals, M_DrawPic_export } from './menu_common.js';

/*
================
M_ToggleMenu_f
================
*/
/**
 * The `togglemenu` command, also called by `Key_Event` for Escape outside the menu and for a console key during demo
 * playback, and by a tap or click when no menu is up. In the menu: from a submenu goes back to the main menu; from
 * the main menu closes it (key_dest `key_game`, `m_state` `m_none`). In the console it closes the console
 * (`Con_ToggleConsole_f`); otherwise opens the main menu. Always sets `m_entersound`.
 */
export function M_ToggleMenu_f() {

	set_m_entersound( true );

	if ( getKeyDest() === key_menu ) {

		if ( m_state !== m_main ) {

			M_Menu_Main_f();
			return;

		}

		setKeyDest( key_game );
		set_m_state( m_none );
		return;

	}

	if ( getKeyDest() === key_console ) {

		Con_ToggleConsole_f();

	} else {

		M_Menu_Main_f();

	}

}

/*
==============================================================================

			PUBLIC API

==============================================================================
*/

/*
================
M_Init
================
*/

// the main family's way to the screens of the families after it (see menuOpeners)
menuOpeners.levelSelect = M_Menu_LevelSelect_f;
menuOpeners.multiplayerChoice = M_Menu_MultiplayerChoice_f;
menuOpeners.options = M_Menu_Options_f;

/**
 * Registers the menu console commands once at startup, from `Host_Init` after `Key_Init`: `togglemenu`, `menu_main`,
 * `menu_singleplayer`, `menu_load`, `menu_save`, `menu_multiplayer`, `menu_setup`, `menu_options`, `menu_keys`,
 * `menu_video`, `help` and `menu_credits`, `menu_bestiary`, `menu_quit`, `menu_lanconfig` and `menu_gameoptions`.
 */
export function M_Init() {

	Cmd_AddCommand( 'togglemenu', M_ToggleMenu_f );
	Cmd_AddCommand( 'menu_main', M_Menu_Main_f );
	Cmd_AddCommand( 'menu_singleplayer', M_Menu_SinglePlayer_f );
	Cmd_AddCommand( 'menu_load', M_Menu_Load_f );
	Cmd_AddCommand( 'menu_save', M_Menu_Save_f );
	Cmd_AddCommand( 'menu_multiplayer', M_Menu_MultiPlayer_f );
	Cmd_AddCommand( 'menu_setup', M_Menu_Setup_f );
	Cmd_AddCommand( 'menu_options', M_Menu_Options_f );
	Cmd_AddCommand( 'menu_keys', M_Menu_Keys_f );
	Cmd_AddCommand( 'menu_video', M_Menu_Video_f );
	Cmd_AddCommand( 'help', M_Menu_Credits_f );
	Cmd_AddCommand( 'menu_credits', M_Menu_Credits_f );
	Cmd_AddCommand( 'menu_bestiary', M_Menu_Bestiary_f );
	Cmd_AddCommand( 'menu_quit', M_Menu_Quit_f );
	Cmd_AddCommand( 'menu_lanconfig', M_Menu_LanConfig_f );
	Cmd_AddCommand( 'menu_gameoptions', M_Menu_GameOptions_f );

}

/*
================
M_Keydown
================
*/
/**
 * Hands a key press to the current menu screen's key handler. Called by `Key_Event` (presses only, Shift already
 * applied) while key_dest is `key_menu`, and by the touch handling for a tap outside the menu (as Escape).
 *
 * @param {number} key key number (0..255): ASCII or a `K_*` constant
 */
export function M_Keydown( key ) {

	switch ( m_state ) {

		case m_none: return;
		case m_main: M_Main_Key( key ); return;
		case m_singleplayer: M_SinglePlayer_Key( key ); return;
		case m_load: M_Load_Key( key ); return;
		case m_save: M_Save_Key( key ); return;
		case m_multiplayer: M_MultiPlayer_Key( key ); return;
		case m_mpchoice: M_MultiplayerChoice_Key( key ); return;
		case m_splitscreen: M_SplitScreen_Key( key ); return;
		case m_setup: M_Setup_Key( key ); return;
		case m_options: M_Options_Key( key ); return;
		case m_newer: M_Newer_Key( key ); return;
		case m_levelselect: M_LevelSelect_Key( key ); return;
		case m_cheats: M_Cheats_Key( key ); return;
		case m_keys: M_Keys_Key( key ); return;
		case m_video: M_Video_Key( key ); return;
		case m_credits: M_Credits_Key( key ); return;
		case m_bestiary: M_Bestiary_Key( key ); return;
		case m_quit: M_Quit_Key( key ); return;
		case m_lanconfig: M_LanConfig_Key( key ); return;
		case m_gameoptions: M_GameOptions_Key( key ); return;
		default: return;

	}

}

/*
================
M_Draw
================
*/
// the thin line down the middle and the ENHANCED / CLASSIC labels over the title demo
function M_DrawSplitMarks() {

	if(R_DemoLoadingConsoleOverride()||R_WelcomeLoadingHolding())return;
	if ( ! _Draw_Fill ) return;
	_Draw_Fill( ( _vid.width >> 1 ) - 1, 0, 2, _vid.height, 0, 0.9 );
	const off = ( _vid.width - 320 ) >> 1;
	M_PrintWhite( 8 - off, 4, 'ENHANCED' );
	M_PrintWhite( _vid.width - 8 - 7 * 8 - off, 4, 'CLASSIC' );

}

/**
 * Draws the menu each screen update, from `SCR_UpdateScreen` (gl_screen.js, wired through `SCR_SetExternals`).
 * While the half-Newer, half-classic title demo runs it draws the split line and labels even with no menu up. With
 * the menu up it dims what is behind (the console background, a light fill over the split demo, or the fade), draws
 * the current screen between `MainMenu_Begin` and `MainMenu_End`, plays the enter sound once if `m_entersound` is set,
 * and draws the studio logo.
 */
export function M_Draw() {

	MainMenu_SetVisible( m_state !== m_none && m_state !== m_bestiary && getKeyDest() === key_menu );

	// (also while the menu is not up)
	if ( ( m_state === m_none || getKeyDest() !== key_menu ) && R_DemoSplitActive() ) M_DrawSplitMarks();

	if ( m_state === m_none || getKeyDest() !== key_menu )
		return;

	MainMenu_Begin();

	if ( ! m_recursiveDraw ) {

		if ( scr_con_current ) {

			if ( _Draw_ConsoleBackground ) _Draw_ConsoleBackground( _vid.height );

		} else if ( R_DemoSplitActive() && _Draw_Fill ) {

			// the title demo is half Newer and half classic: dim it only a little, so the two can be compared
			_Draw_Fill( 0, 0, _vid.width, _vid.height, 0, 0.32 );
			M_DrawSplitMarks();

		} else {

			if ( _Draw_FadeScreen ) _Draw_FadeScreen();

		}

	} else {

		set_m_recursiveDraw( false );

	}

	switch ( m_state ) {

		case m_main: M_Main_Draw(); break;
		case m_singleplayer: M_SinglePlayer_Draw(); break;
		case m_load: M_Load_Draw(); break;
		case m_save: M_Save_Draw(); break;
		case m_multiplayer: M_MultiPlayer_Draw(); break;
		case m_mpchoice: M_MultiplayerChoice_Draw(); break;
		case m_splitscreen: M_SplitScreen_Draw(); break;
		case m_setup: M_Setup_Draw(); break;
		case m_options: M_Options_Draw(); break;
		case m_newer: M_Newer_Draw(); break;
		case m_levelselect: M_LevelSelect_Draw(); break;
		case m_cheats: M_Cheats_Draw(); break;
		case m_keys: M_Keys_Draw(); break;
		case m_video: M_Video_Draw(); break;
		case m_credits: Draw_WithVirtualSize( 320, CREDITS_HEIGHT, M_Credits_Draw, CREDITS_SCALE ); break;
		case m_bestiary: R_BestiaryBookDraw(); break;
		case m_quit: M_Quit_Draw(); break;
		case m_lanconfig: M_LanConfig_Draw(); break;
		case m_gameoptions: M_GameOptions_Draw(); break;

	}

	MainMenu_End( _realtime_get() );

	if ( m_entersound ) {

		if ( _S_LocalSound ) _S_LocalSound( 'misc/menu2.wav' );
		set_m_entersound( false );

	}

	Draw_StudioLogo( m_state === m_bestiary ? R_BestiaryBookCorner() : null );

}

/*
================
M_TouchInput
================
*/
/**
 * Handle touch input for menu selection.
 * Converts screen coordinates to virtual 320x200 space and selects menu items. Called by in_web.js for a mouse click
 * while the menu is up and for a click or tap during demo playback (as `(0, 0, 1, 1)`, which only opens the menu),
 * and by touch.js through `Touch_SetMenuCallback`. With no menu up it opens one; a touch outside the 320x200 sheet
 * acts as Escape; the Bestiary book takes the whole screen.
 *
 * @param {number} touchX x from the left edge of the clicked element (in_web.js) or the window (touch.js), CSS pixels
 *   (0..screenWidth)
 * @param {number} touchY y from the top edge of that element or window, CSS pixels (0..screenHeight)
 * @param {number} screenWidth that element's or window's width, CSS pixels (> 0)
 * @param {number} screenHeight that element's or window's height, CSS pixels (> 0)
 * @returns {boolean|undefined} in the Bestiary, true when the touch was inside the screen (`R_BestiaryBookTouch`);
 *   otherwise undefined
 */
export function M_TouchInput( touchX, touchY, screenWidth, screenHeight ) {

	// The book uses the full overlay, not the centered 320x200 menu sheet.
	if ( m_state === m_bestiary ) return R_BestiaryBookTouch( touchX, touchY, screenWidth, screenHeight );
	if ( m_state === m_credits ) return Draw_WithVirtualSize( 320, CREDITS_HEIGHT, () => M_TouchInViewport( touchX, touchY, screenWidth, screenHeight ), CREDITS_SCALE );
	return M_TouchInViewport( touchX, touchY, screenWidth, screenHeight );

}

function M_TouchInViewport( touchX, touchY, screenWidth, screenHeight ) {

	// If no menu is shown (e.g. during demo playback), show the menu
	if ( m_state === m_none ) {

		M_ToggleMenu_f();
		return;

	}

	// Convert screen/element coordinates to _vid space (menu drawing coordinates)
	// screenWidth/Height are the CSS dimensions of the element clicked on
	// _vid is the logical rendering size the menu uses

	// Map click position proportionally from element space to _vid space
	// Fractionally scaled credits can have ceil-rounded virtual dimensions.
	// Invert the actual framebuffer transform, not that rounded extent.
	const credits = m_state === m_credits, dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
	const vidX = ( touchX / screenWidth ) * ( credits ? Math.floor( _realVid.width * dpr ) / Draw_GetUIScale() : _vid.width );
	const vidY = ( touchY / screenHeight ) * ( credits ? Math.floor( _realVid.height * dpr ) / Draw_GetUIScale() : _vid.height );

	// Menu is drawn centered: drawing X = menuX + (_vid.width - 320) / 2
	//                         drawing Y = menuY + (_vid.height - 200) / 2
	// So to convert click to menu space: menuX = vidX - offsetX, menuY = vidY - offsetY
	const offsetX = m_state === m_credits ? ( _vid.width - 320 ) >> 1 : ( _vid.width - 320 ) / 2;
	const offsetY = m_state === m_credits ? ( _vid.height - 200 ) >> 1 : ( _vid.height - 200 ) / 2;
	const vx = vidX - offsetX;
	const vy = vidY - offsetY;

	// Click outside menu area acts like pressing escape (go back)
	const menuTop = m_state === m_credits ? CREDITS_TOP : 0, menuBottom = m_state === m_credits ? CREDITS_TOP + CREDITS_HEIGHT : 200;
	if ( vx < 0 || vx > 320 || vy < menuTop || vy > menuBottom ) {

		M_Keydown( K_ESCAPE );
		return;

	}

	// Handle based on current menu state
	switch ( m_state ) {

		case m_main:
			M_Main_Touch( vx, vy );
			break;

		case m_singleplayer:
			M_SinglePlayer_Touch( vx, vy );
			break;

		case m_load:
		case m_save:
			M_LoadSave_Touch( vx, vy );
			break;

		case m_mpchoice:
			M_MultiplayerChoice_Touch( vx, vy );
			break;
		case m_splitscreen:
			M_SplitScreen_Touch( vx, vy );
			break;
		case m_multiplayer:
			M_MultiPlayer_Touch( vx, vy );
			break;

		case m_options:
			M_Options_Touch( vx, vy );
			break;

		case m_newer:
			M_Newer_Touch( vx, vy );
			break;

		case m_levelselect:
			M_LevelSelect_Touch( vx, vy );
			break;

		case m_cheats:
			M_Cheats_Touch( vx, vy );
			break;

		case m_keys:
			M_Keys_Touch( vx, vy );
			break;

		case m_credits:
			M_Credits_Touch( vx, vy );
			break;

		case m_quit:
			M_Quit_Touch( vx, vy );
			break;

		case m_lanconfig:
			M_LanConfig_Touch( vx, vy );
			break;

		case m_gameoptions:
			M_GameOptions_Touch( vx, vy );
			break;

	}

}
