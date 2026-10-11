/**
 * @module engine/client/menu
 *
 * The native menu (WinQuake menu.c) and the Newer Game options: main, single player, multiplayer rooms, options,
 * features, cheats, saves.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `m_cheats_cursor`, `cheatsUsedIn`, `m_options_cursor`,
 * `m_newer_cursor`, `m_keys_cursor`, `bind_grab`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Engine callbacks are injected with `M_SetExternals`.
 */
// Ported from: WinQuake/menu.c, WinQuake/menu.h -- menu system

import { MainMenu_Begin, MainMenu_End, MainMenu_SetVisible, MainMenu_Skinned, MainMenu_Slider } from '../common/hooks.js'; // installed by newer/ui/menu_webgl.js
import { R_BestiaryBookDraw, R_BestiaryBookTouch, R_BestiaryBookCorner } from '../common/hooks.js'; // installed by newer/ui/r_bestiary_book.js
import { R_FlashlightToggle } from '../common/hooks.js'; // installed by newer/render/r_flashlight.js
import { R_DemoLoadingConsoleOverride, R_WelcomeLoadingHolding } from '../common/hooks.js'; // installed by newer/ui/r_demoloading.js
import { Draw_StudioLogo } from '../common/hooks.js'; // installed by newer/ui/studio_logo.js
import { R_DemoSplitActive } from '../common/hooks.js'; // installed by newer/render/r_demosplit.js
import { Cbuf_AddText } from '../common/cmd.js';
import { Cmd_AddCommand } from '../common/cmd.js';
import { Con_ToggleConsole_f } from '../common/console.js';
import { K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, K_BACKSPACE, K_DEL, key_game, key_console, key_menu, keybindings, Key_SetBinding, Key_KeynumToString } from './keys.js';
import { cl_forwardspeed } from './cl_input.js';
import { sensitivity, m_pitch, lookspring, lookstrafe } from './cl_main.js';
import { volume, bgmvolume } from '../sound/sound.js';
import { Cvar_SetValue, Cvar_VariableValue } from '../common/cvar.js';
import { scr_viewsize, scr_con_current } from '../render/gl_screen.js';
import { v_gamma } from './view.js';
import { gl_texturemode, GL_UpdateTextureFiltering } from '../render/glquake.js';
import { Draw_GetUIScale, Draw_WithVirtualSize } from '../render/gl_draw.js';
import { m_none, m_main, m_singleplayer, m_load, m_save, m_multiplayer, m_setup, m_options, m_video, m_keys, m_quit, m_lanconfig, m_gameoptions, m_credits, m_newer, m_levelselect, m_bestiary, m_cheats, m_mpchoice, m_splitscreen, m_state, m_entersound, m_recursiveDraw, set_m_state, set_m_entersound, set_m_recursiveDraw, menuOpeners, _sv, _svs, _realVid, _vid, _realtime_get, _Draw_CachePic, _Draw_Fill, _Draw_FadeScreen, _Draw_ConsoleBackground, _S_LocalSound, getKeyDest, setKeyDest, M_DrawCharacter, M_Print, M_PrintWhite, M_DrawTransPic, M_DrawPic, NEWER_DEFAULT_GAMMA } from './menu_common.js';
import { M_Menu_Main_f, M_Main_Draw, M_Main_Key, M_Menu_Bestiary_f, M_Bestiary_Key, M_Menu_SinglePlayer_f, M_SinglePlayer_Draw, M_SinglePlayer_Key, M_Menu_Load_f, M_Menu_Save_f, M_Load_Draw, M_Save_Draw, M_Load_Key, M_Save_Key, CREDITS_HEIGHT, CREDITS_SCALE, CREDITS_TOP, M_Menu_Credits_f, M_Credits_Draw, M_Credits_Key, M_Credits_Touch, M_Menu_Quit_f, M_Quit_Draw, M_Quit_Key, M_Main_Touch, M_SinglePlayer_Touch, M_LoadSave_Touch, M_Quit_Touch } from './menu_main.js';
import { M_Menu_LevelSelect_f, M_LevelSelect_Draw, M_LevelSelect_Key, M_LevelSelect_Touch } from './menu_levelselect.js';
import { M_Menu_MultiplayerChoice_f, M_MultiplayerChoice_Draw, M_MultiplayerChoice_Key, M_MultiplayerChoice_Touch, M_SplitScreen_Draw, M_SplitScreen_Key, M_SplitScreen_Touch, M_Menu_MultiPlayer_f, M_MultiPlayer_Draw, M_MultiPlayer_Key, M_Menu_LanConfig_f, M_LanConfig_Draw, M_LanConfig_Key, M_Menu_GameOptions_f, M_GameOptions_Draw, M_GameOptions_Key, M_Menu_Setup_f, M_Setup_Draw, M_Setup_Key, M_MultiPlayer_Touch, M_LanConfig_Touch, M_GameOptions_Touch } from './menu_multiplayer.js';
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

			CHEATS MENU (inside Options)

Cheats as switches and quick gives: the game's own noclip, notarget and fly; the three power-ups (Ring, Quad, Pentagram)
as switches that stay on until switched off (sv_cheats.js); all weapons and full health. Each takes effect at once, so
the game under the menu shows it. Local single-player only; there is nothing to unlock or record, and the menu says
whether any was used in this game.
==============================================================================
*/

// FL_NOTARGET 128, MOVETYPE_FLY 5, MOVETYPE_NOCLIP 8; the power switches are kept on the player (_cheatPowers bits 1, 2, 4)
export const CHEATS = [
	{ label: 'No clip', command: 'noclip', on: ( p ) => p.v.movetype === 8 },
	{ label: 'No target', command: 'notarget', on: ( p ) => ( p.v.flags & 128 ) !== 0 },
	{ label: 'Fly', command: 'fly', on: ( p ) => p.v.movetype === 5 },
	{ label: 'Invisibility (Ring)', command: 'cheat_power ring', on: ( p ) => ( ( p._cheatPowers | 0 ) & 1 ) !== 0 },
	{ label: 'Invincibility (Quad)', command: 'cheat_power quad', on: ( p ) => ( ( p._cheatPowers | 0 ) & 2 ) !== 0 },
	{ label: 'Invulnerability (Pentagram)', command: 'cheat_power pentagram', on: ( p ) => ( ( p._cheatPowers | 0 ) & 4 ) !== 0 },
	{ label: 'All weapons and ammo', command: 'cheat_weapons' },
	{ label: 'Full health', command: 'give h 100' }
];
const CHEATS_ROW_Y = 48;
let m_cheats_cursor = 0;
let cheatsUsedIn = null; // the entity list of the game (one per map or save load) in which a cheat was last used from this menu

function cheatsAvailable() {

	return _sv.active === true && _svs.maxclients === 1 && Cvar_VariableValue( 'deathmatch' ) === 0 && Cvar_VariableValue( 'coop' ) === 0;

}

const cheatsGame = () => _sv.edicts; // a new array for every map load and every loaded game

function M_Menu_Cheats_f() {

	setKeyDest( key_menu );
	set_m_state( m_cheats );
	set_m_entersound( true );

}

function M_Cheats_Draw() {

	if ( ! _Draw_CachePic ) return;

	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/p_option.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );
	M_PrintWhite( 128, 32, 'Cheats' );

	const player = cheatsAvailable() ? _sv.edicts?.[ 1 ] : null;
	for ( let i = 0; i < CHEATS.length; i ++ ) {

		const c = CHEATS[ i ], y = CHEATS_ROW_Y + i * 8;
		M_Print( 56, y, c.label ); // (clear of the plaque on the left; the longest label and its state fit the 320-pixel menu)
		if ( c.on ) M_Print( 280, y, player && c.on( player ) ? 'on' : 'off' );

	}
	M_DrawCharacter( 44, CHEATS_ROW_Y + m_cheats_cursor * 8, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );
	const y = CHEATS_ROW_Y + CHEATS.length * 8 + 16;
	if ( ! cheatsAvailable() ) {

		M_PrintWhite( 56, y, 'Cheats need a single player game.' );
		M_Print( 56, y + 8, 'Start one and come back.' );

	} else {

		M_Print( 56, y, 'Cheats used in this game: ' );
		M_PrintWhite( 56 + 26 * 8, y, cheatsUsedIn === cheatsGame() ? 'yes' : 'no' );

	}

}

function M_Cheats_Apply() {

	if ( ! cheatsAvailable() ) return;
	if ( _S_LocalSound ) _S_LocalSound( 'misc/menu3.wav' );
	Cbuf_AddText( CHEATS[ m_cheats_cursor ].command + '\n' ); // (run this frame: the commands act at once, also while the menu holds the game)
	cheatsUsedIn = cheatsGame();

}

function M_Cheats_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_Options_f();
			break;

		case K_UPARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( -- m_cheats_cursor < 0 ) m_cheats_cursor = CHEATS.length - 1;
			break;

		case K_DOWNARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( ++ m_cheats_cursor >= CHEATS.length ) m_cheats_cursor = 0;
			break;

		case K_LEFTARROW:
		case K_RIGHTARROW:
			if ( CHEATS[ m_cheats_cursor ].on ) M_Cheats_Apply(); // arrows toggle the switches; the gives need Enter or a tap
			break;

		case K_ENTER:
			M_Cheats_Apply();
			break;

	}

}

function M_Cheats_Touch( vx, vy ) {

	if ( vy >= CHEATS_ROW_Y && vy < CHEATS_ROW_Y + CHEATS.length * 8 ) {

		m_cheats_cursor = Math.floor( ( vy - CHEATS_ROW_Y ) / 8 );
		M_Cheats_Apply();

	}

}

/*
==============================================================================

			OPTIONS MENU HELPERS

==============================================================================
*/

const SLIDER_RANGE = 10;

function M_DrawSlider( x, y, range ) {

	if ( MainMenu_Slider( x - 8 + ( ( _vid.width - 320 ) >> 1 ), y + ( ( _vid.height - 200 ) >> 1 ), ( SLIDER_RANGE + 2 ) * 8, range ) ) return;

	if ( range < 0 )
		range = 0;
	if ( range > 1 )
		range = 1;

	M_DrawCharacter( x - 8, y, 128 );
	for ( let i = 0; i < SLIDER_RANGE; i ++ )
		M_DrawCharacter( x + i * 8, y, 129 );
	M_DrawCharacter( x + SLIDER_RANGE * 8, y, 130 );
	M_DrawCharacter( x + Math.floor( ( SLIDER_RANGE - 1 ) * 8 * range ), y, 131 );

}

function M_DrawCheckbox( x, y, on ) {

	if ( on )
		M_Print( x, y, 'on' );
	else
		M_Print( x, y, 'off' );

}

function M_AdjustSliders( dir ) {

	if ( _S_LocalSound ) _S_LocalSound( 'misc/menu3.wav' );

	switch ( OPTIONS_ORDER[ m_options_cursor ] ) {

		case 3: // texture filtering
			Cvar_SetValue( 'gl_texturemode', ! gl_texturemode.value ? 1 : 0 );
			GL_UpdateTextureFiltering();
			break;

		case 4: // screen size
			Cvar_SetValue( 'viewsize', scr_viewsize.value + dir * 10 );
			if ( scr_viewsize.value < 30 )
				Cvar_SetValue( 'viewsize', 30 );
			if ( scr_viewsize.value > 120 )
				Cvar_SetValue( 'viewsize', 120 );
			break;

		case 5: // gamma
			Cvar_SetValue( 'gamma', v_gamma.value - dir * 0.05 );
			if ( v_gamma.value < 0.5 )
				Cvar_SetValue( 'gamma', 0.5 );
			if ( v_gamma.value > 1 )
				Cvar_SetValue( 'gamma', 1 );
			break;

		case 6: // mouse speed
			Cvar_SetValue( 'sensitivity', sensitivity.value + dir * 0.5 );
			if ( sensitivity.value < 1 )
				Cvar_SetValue( 'sensitivity', 1 );
			if ( sensitivity.value > 11 )
				Cvar_SetValue( 'sensitivity', 11 );
			break;

		case 7: // sfx volume
			Cvar_SetValue( 'volume', volume.value + dir * 0.1 );
			if ( volume.value < 0 )
				Cvar_SetValue( 'volume', 0 );
			if ( volume.value > 1 )
				Cvar_SetValue( 'volume', 1 );
			break;
		case 16: // every music track: classic soundtrack and ambient music
			Cvar_SetValue( 'bgmvolume', Math.max( 0, Math.min( 1, bgmvolume.value + dir * 0.1 ) ) );
			break;

		case 8: // always run
			if ( cl_forwardspeed.value > 200 ) {

				Cvar_SetValue( 'cl_forwardspeed', 200 );
				Cvar_SetValue( 'cl_backspeed', 200 );

			} else {

				Cvar_SetValue( 'cl_forwardspeed', 400 );
				Cvar_SetValue( 'cl_backspeed', 400 );

			}

			break;

		case 9: // invert mouse
			Cvar_SetValue( 'm_pitch', - m_pitch.value );
			break;

		case 10: // lookspring
			Cvar_SetValue( 'lookspring', ! lookspring.value ? 1 : 0 );
			break;

		case 11: // lookstrafe
			Cvar_SetValue( 'lookstrafe', ! lookstrafe.value ? 1 : 0 );
			break;

		case 12: // crosshair
			Cvar_SetValue( 'crosshair', Cvar_VariableValue( 'crosshair' ) !== 0 ? 0 : 1 );
			break;

		case 14: // FPS counter
			Cvar_SetValue( 'cl_showfps', Cvar_VariableValue( 'cl_showfps' ) !== 0 ? 0 : 1 );
			break;

	}

}

/*
==============================================================================

			OPTIONS MENU

==============================================================================
*/

// Cursor/touch indices remain visible rows; action IDs retain their established
// meaning across drawing, Enter and slider/toggle dispatch.
const OPTIONS_ORDER = [ 13, 0, 15, 1, 2, 14, 3, 4, 5, 6, 7, 16, 8, 9, 10, 11, 12, 17 ];
const OPTIONS_ITEMS = OPTIONS_ORDER.length;
function optionsY( action ) { return 32 + OPTIONS_ORDER.indexOf( action ) * 8; }
let m_options_cursor = 0;

function M_Menu_Options_f() {

	setKeyDest( key_menu );
	set_m_state( m_options );
	set_m_entersound( true );

}

function M_Options_Draw() {

	if ( ! _Draw_CachePic ) return;

	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/p_option.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );

	M_Print( 16, optionsY( 0 ), '    Customize controls' );
	M_Print( 16, optionsY( 1 ), '         Go to console' );
	M_Print( 16, optionsY( 2 ), '     Reset to defaults' );

	M_Print( 16, optionsY( 3 ), '     Texture Filtering' );
	M_DrawCheckbox( 220, optionsY( 3 ), gl_texturemode.value );

	M_Print( 16, optionsY( 4 ), '           Screen size' );
	let r = ( scr_viewsize.value - 30 ) / ( 120 - 30 );
	M_DrawSlider( 220, optionsY( 4 ), r );

	M_Print( 16, optionsY( 5 ), '            Brightness' );
	r = ( 1.0 - v_gamma.value ) / 0.5;
	M_DrawSlider( 220, optionsY( 5 ), r );

	M_Print( 16, optionsY( 6 ), '           Mouse Speed' );
	r = ( sensitivity.value - 1 ) / 10;
	M_DrawSlider( 220, optionsY( 6 ), r );

	M_Print( 16, optionsY( 7 ), '          Sound Volume' );
	r = volume.value;
	M_DrawSlider( 220, optionsY( 7 ), r );

	M_Print( 16, optionsY( 16 ), '          Music Volume' );
	M_DrawSlider( 220, optionsY( 16 ), bgmvolume.value );

	M_Print( 16, optionsY( 8 ), '            Always Run' );
	M_DrawCheckbox( 220, optionsY( 8 ), cl_forwardspeed.value > 200 );

	M_Print( 16, optionsY( 9 ), '          Invert Mouse' );
	M_DrawCheckbox( 220, optionsY( 9 ), m_pitch.value < 0 );

	M_Print( 16, optionsY( 10 ), '            Lookspring' );
	M_DrawCheckbox( 220, optionsY( 10 ), lookspring.value );

	M_Print( 16, optionsY( 11 ), '            Lookstrafe' );
	M_DrawCheckbox( 220, optionsY( 11 ), lookstrafe.value );

	M_Print( 16, optionsY( 12 ), '             Crosshair' );
	M_DrawCheckbox( 220, optionsY( 12 ), Cvar_VariableValue( 'crosshair' ) );

	M_Print( 16, optionsY( 13 ), '   Newer Game features' );

	M_Print( 16, optionsY( 14 ), '           FPS counter' );
	M_DrawCheckbox( 220, optionsY( 14 ), Cvar_VariableValue( 'cl_showfps' ) );

	M_Print( 16, optionsY( 15 ), '  Performance profiler' );

	M_Print( 16, optionsY( 17 ), '                Cheats' );

	// cursor
	M_DrawCharacter( 200, 32 + m_options_cursor * 8, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

}

function M_Options_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_Main_f();
			break;
		case K_ENTER:
			set_m_entersound( true );
			switch ( OPTIONS_ORDER[ m_options_cursor ] ) {

				case 0:
					M_Menu_Keys_f();
					break;
				case 1:
					set_m_state( m_none );
					Con_ToggleConsole_f();
					break;
				case 2:
					Cbuf_AddText( 'exec default.cfg\n' );
					// Re-apply WASD bindings for the web port
					Cbuf_AddText( 'bind w +forward\n' );
					Cbuf_AddText( 'bind s +back\n' );
					Cbuf_AddText( 'bind a +moveleft\n' );
					Cbuf_AddText( 'bind d +moveright\n' );
					Cbuf_AddText( 'bind SPACE +jump\n' );
					Cbuf_AddText( 'bind MOUSE1 +attack\n' );
					Cbuf_AddText( 'cl_forwardspeed 400\n' );
					Cbuf_AddText( 'cl_backspeed 400\n' );
					Cbuf_AddText( `gamma ${Cvar_VariableValue( 'r_hdr' ) !== 0 ? NEWER_DEFAULT_GAMMA : 1}\n` );
					Cbuf_AddText( 'volume 0.4\n' );
					Cbuf_AddText( 'bgmvolume 1\n' );
					break;
				case 13:
					M_Menu_Newer_f();
					break;
				case 17:
					M_Menu_Cheats_f();
					break;
				case 15:
					// leave the menu and run the demos flat out
					setKeyDest( key_game );
					set_m_state( m_none );
					Cbuf_AddText( 'perfprofile\n' );
					break;
				default:
					M_AdjustSliders( 1 );
					break;

			}

			break;
		case K_UPARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			m_options_cursor --;
			if ( m_options_cursor < 0 )
				m_options_cursor = OPTIONS_ITEMS - 1;
			break;
		case K_DOWNARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			m_options_cursor ++;
			if ( m_options_cursor >= OPTIONS_ITEMS )
				m_options_cursor = 0;
			break;
		case K_LEFTARROW:
			M_AdjustSliders( - 1 );
			break;
		case K_RIGHTARROW:
			M_AdjustSliders( 1 );
			break;

	}

}

/*
==============================================================================

			NEWER GAME FEATURES

The parts of Newer Game that can be switched on and off one at a time.  They
take effect only while playing Newer Game; New Game is always the original.
==============================================================================
*/

const NEWER_FEATURES = [
	{ cvar: 'r_newer_lighting', label: '        Newer lighting' },
	{ cvar: 'r_newer_normals', label: '          Normal maps' },
	{ cvar: 'r_newer_water', label: '        Newer liquids' },
	{ cvar: 'r_newer_enemies', label: '         Newer enemies' },
	{ cvar: 'r_newer_portals', label: '        Camera portals' },
	{ cvar: 'r_newer_textures', label: '        Newer textures' },
	{ cvar: 'r_newer_hud', label: '      Newer status bar' },
	{ cvar: 'r_newer_shadows', label: '   Enemy and item shadows' },
	{ cvar: 'r_flashlight', label: '  Flashlight (key F)' },
	{ cvar: 'r_decals', label: '   Marks and blood' },
	// sliders: all the way to the left is off, and the further right, the stronger or faster
	{ cvar: 'r_pillars', label: '          Light pillars', slider: true },
	{ cvar: 'r_cloudspeed', label: '    Cloud shadow speed', slider: true },
	{ cvar: 'r_heathaze', label: '      Heat haze (lava)', slider: true },
	{ cvar: 'r_mist', label: '          Surface haze', slider: true },
	{ cvar: 'r_reflect', label: '      Water reflections', slider: true },
	{ cvar: 'r_water_look', label: '      Water appearance', choices: [ 'Map', 'Clear', 'Tinted', 'Muddy', 'Toxic' ] },
	// (added last, so the rows above keep their places)
	{ cvar: 'r_dof', label: '        Depth of field', slider: true }
];
let m_newer_cursor = 0;

function M_Menu_Newer_f() {

	setKeyDest( key_menu );
	set_m_state( m_newer );
	set_m_entersound( true );

}

// the rows start here
const NEWER_ROW0 = 44;

function M_Newer_Draw() {

	if ( ! _Draw_CachePic ) return;

	// a dark panel behind the list: the picture of the game behind the menu made it hard to read
	if ( _Draw_Fill && ! MainMenu_Skinned() ) {

		const ox = ( _vid.width - 320 ) >> 1, oy = ( _vid.height - 200 ) >> 1;
		_Draw_Fill( ox + 8, oy + 2, 304, 192, 0, 0.82 );

	}

	const banner = _Draw_CachePic( 'gfx/p_enhanced.lmp' );
	if ( banner != null ) M_DrawTransPic( ( 320 - banner.width ) / 2, 4, banner );
	else M_DrawPic( ( 320 - 128 ) / 2, 4, _Draw_CachePic( 'gfx/p_option.lmp' ) );

	for ( let i = 0; i < NEWER_FEATURES.length; i ++ ) {

		const y = NEWER_ROW0 + i * 8;
		M_Print( 16, y, NEWER_FEATURES[ i ].label );
		if ( NEWER_FEATURES[ i ].choices ) {

			const choices = NEWER_FEATURES[ i ].choices, raw = Cvar_VariableValue( NEWER_FEATURES[ i ].cvar );
			const choice = Number.isFinite( raw ) ? Math.max( 0, Math.min( choices.length - 1, Math.round( raw ) ) ) : 0;
			M_PrintWhite( 220, y, choices[ choice ] );

		} else if ( NEWER_FEATURES[ i ].slider === true )
			M_DrawSlider( 220, y, Math.max( 0, Math.min( 1, Cvar_VariableValue( NEWER_FEATURES[ i ].cvar ) ) ) );
		else
			M_DrawCheckbox( 220, y, Cvar_VariableValue( NEWER_FEATURES[ i ].cvar ) );

	}

	const notes = NEWER_ROW0 + NEWER_FEATURES.length * 8 + 6;
	M_Print( 16, notes, ' Newer Game only. Each switches alone.' ); // (one line: the panel ends below it)

	M_DrawCharacter( 200, NEWER_ROW0 + m_newer_cursor * 8, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

}

// switch one on or off; a slider is moved a step (dir -1 or 1) instead, and Enter on one steps it up and round to off
function M_Newer_Toggle( dir ) {

	if ( _S_LocalSound ) _S_LocalSound( 'misc/menu3.wav' );
	const f = NEWER_FEATURES[ m_newer_cursor ];

	if ( f.choices ) {

		const raw = Cvar_VariableValue( f.cvar ), count = f.choices.length;
		const value = Number.isFinite( raw ) ? Math.max( 0, Math.min( count - 1, Math.round( raw ) ) ) : 0;
		Cvar_SetValue( f.cvar, ( value + ( dir < 0 ? - 1 : 1 ) + count ) % count );
		return;

	}

	if ( f.slider === true ) {

		let v = Cvar_VariableValue( f.cvar ) + ( dir === 0 ? 0.05 : dir * 0.05 );
		if ( dir === 0 && v > 1.001 ) v = 0;
		Cvar_SetValue( f.cvar, Math.max( 0, Math.min( 1, Math.round( v * 100 ) / 100 ) ) );
		return;

	}

	if ( f.cvar === 'r_flashlight' ) R_FlashlightToggle();
	else Cvar_SetValue( f.cvar, Cvar_VariableValue( f.cvar ) !== 0 ? 0 : 1 );

}

function M_Newer_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_Options_f();
			break;
		case K_ENTER:
			M_Newer_Toggle( 0 );
			break;
		case K_LEFTARROW:
			M_Newer_Toggle( - 1 );
			break;
		case K_RIGHTARROW:
			M_Newer_Toggle( 1 );
			break;
		case K_UPARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( -- m_newer_cursor < 0 ) m_newer_cursor = NEWER_FEATURES.length - 1;
			break;
		case K_DOWNARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( ++ m_newer_cursor >= NEWER_FEATURES.length ) m_newer_cursor = 0;
			break;

	}

}

function M_Newer_Touch( vx, vy ) {

	if ( vy >= NEWER_ROW0 && vy < NEWER_ROW0 + NEWER_FEATURES.length * 8 ) {

		m_newer_cursor = Math.floor( ( vy - NEWER_ROW0 ) / 8 );
		M_Newer_Toggle( 0 );

	}

}

/*
==============================================================================

			KEYS MENU (key binding)

==============================================================================
*/

let m_keys_cursor = 0;
let bind_grab = false;

const bindnames = [
	[ '+attack', 'attack' ],
	[ 'impulse 10', 'change weapon' ],
	[ '+jump', 'jump / swim up' ],
	[ '+forward', 'walk forward' ],
	[ '+back', 'backpedal' ],
	[ '+left', 'turn left' ],
	[ '+right', 'turn right' ],
	[ '+speed', 'run' ],
	[ '+moveleft', 'step left' ],
	[ '+moveright', 'step right' ],
	[ '+strafe', 'sidestep' ],
	[ '+lookup', 'look up' ],
	[ '+lookdown', 'look down' ],
	[ 'centerview', 'center view' ],
	[ '+mlook', 'mouse look' ],
	[ '+klook', 'keyboard look' ],
	[ '+moveup', 'swim up' ],
	[ '+movedown', 'swim down' ],
];

const NUMCOMMANDS = bindnames.length;

/*
===============
M_FindKeysForCommand

Finds up to two keys bound to a command
===============
*/
function M_FindKeysForCommand( command ) {

	const twokeys = [ - 1, - 1 ];
	const l = command.length;
	let count = 0;

	for ( let j = 0; j < 256; j ++ ) {

		const b = keybindings[ j ];
		if ( b == null )
			continue;
		if ( b.substring( 0, l ) === command ) {

			twokeys[ count ] = j;
			count ++;
			if ( count === 2 )
				break;

		}

	}

	return twokeys;

}

/*
===============
M_UnbindCommand

Unbinds all keys for a command
===============
*/
function M_UnbindCommand( command ) {

	const l = command.length;

	for ( let j = 0; j < 256; j ++ ) {

		const b = keybindings[ j ];
		if ( b == null )
			continue;
		if ( b.substring( 0, l ) === command )
			Key_SetBinding( j, '' );

	}

}

function M_Menu_Keys_f() {

	setKeyDest( key_menu );
	set_m_state( m_keys );
	set_m_entersound( true );

}

function M_Keys_Draw() {

	if ( ! _Draw_CachePic ) return;

	const p = _Draw_CachePic( 'gfx/ttl_cstm.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );

	if ( bind_grab )
		M_Print( 12, 32, 'Press a key or button for this action' );
	else
		M_Print( 18, 32, 'Enter to change, backspace to clear' );

	for ( let i = 0; i < NUMCOMMANDS; i ++ ) {

		const y = 48 + 8 * i;
		M_Print( 16, y, bindnames[ i ][ 1 ] );

		// Find keys bound to this command
		const keys = M_FindKeysForCommand( bindnames[ i ][ 0 ] );

		if ( keys[ 0 ] === - 1 ) {

			M_Print( 140, y, '???' );

		} else {

			const name = Key_KeynumToString( keys[ 0 ] );
			M_Print( 140, y, name );
			const x = name.length * 8;
			if ( keys[ 1 ] !== - 1 ) {

				M_Print( 140 + x + 8, y, 'or' );
				M_Print( 140 + x + 32, y, Key_KeynumToString( keys[ 1 ] ) );

			}

		}

	}

	// cursor
	if ( bind_grab ) {

		M_DrawCharacter( 130, 48 + m_keys_cursor * 8, 61 ); // '='

	} else {

		M_DrawCharacter( 130, 48 + m_keys_cursor * 8, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

	}

}

function M_Keys_Key( key ) {

	if ( bind_grab ) {

		// Grabbed a key
		if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
		if ( key === K_ESCAPE ) {

			bind_grab = false;

		} else {

			// Set the binding via Cbuf
			Cbuf_AddText( 'bind "' + Key_KeynumToString( key ) + '" "' + bindnames[ m_keys_cursor ][ 0 ] + '"\n' );

		}

		bind_grab = false;
		return;

	}

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_Options_f();
			break;
		case K_LEFTARROW:
		case K_UPARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			m_keys_cursor --;
			if ( m_keys_cursor < 0 )
				m_keys_cursor = NUMCOMMANDS - 1;
			break;
		case K_DOWNARROW:
		case K_RIGHTARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			m_keys_cursor ++;
			if ( m_keys_cursor >= NUMCOMMANDS )
				m_keys_cursor = 0;
			break;
		case K_ENTER: {

			const keys = M_FindKeysForCommand( bindnames[ m_keys_cursor ][ 0 ] );
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu2.wav' );
			if ( keys[ 1 ] !== - 1 )
				M_UnbindCommand( bindnames[ m_keys_cursor ][ 0 ] );
			bind_grab = true;
			break;

		}
		case K_BACKSPACE:
		case K_DEL:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu2.wav' );
			M_UnbindCommand( bindnames[ m_keys_cursor ][ 0 ] );
			break;

	}

}

/*
==============================================================================

			VIDEO MENU (stub)

==============================================================================
*/

function M_Menu_Video_f() {

	setKeyDest( key_menu );
	set_m_state( m_video );
	set_m_entersound( true );

}

function M_Video_Draw() {

	M_Print( 16, 32, 'Video settings not available in browser' );

}

function M_Video_Key( key ) {

	if ( key === K_ESCAPE )
		M_Menu_Options_f();

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

// Options menu touch - items at y=32, 8px spacing
function M_Options_Touch( vx, vy ) {

	if ( vy >= 32 && vy < 32 + OPTIONS_ITEMS * 8 ) {

		const item = Math.floor( ( vy - 32 ) / 8 );
		if ( item >= 0 && item < OPTIONS_ITEMS ) {

			m_options_cursor = item;
			M_Options_Key( K_ENTER );

		}

	}

}

// Keys menu touch - items at y=48, 8px spacing
function M_Keys_Touch( vx, vy ) {

	if ( vy >= 48 && vy < 48 + NUMCOMMANDS * 8 ) {

		const item = Math.floor( ( vy - 48 ) / 8 );
		if ( item >= 0 && item < NUMCOMMANDS ) {

			m_keys_cursor = item;
			M_Keys_Key( K_ENTER );

		}

	}

}
