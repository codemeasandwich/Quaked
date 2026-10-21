/**
 * @module engine/client/menu_options
 *
 * The options screens (card [44j], split from menu.js): the options with their sliders and switches, Newer Game's own
 * options, the key bindings, the cheats and the video note.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `m_cheats_cursor`, `cheatsUsedIn`, `m_options_cursor`,
 * `m_newer_cursor`, `m_keys_cursor`, `bind_grab`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * The options are opened from the main menu (through `menuOpeners`); ESC returns there.
 */
import { M_ControllerActions } from './menu_actions.js';
import { M_Menu_Gyro_f } from './menu_gyro.js';
import {Distribution_Profile} from '../../platform/distribution.js';
import { MainMenu_Skinned, MainMenu_Slider } from '../common/hooks.js'; // installed by newer/ui/menu_webgl.js
import { R_FlashlightToggle } from '../common/hooks.js'; // installed by newer/render/r_flashlight.js
import { Newer_ApplyGameDefaults } from '../common/hooks.js'; // installed by newer/ui/newer_defaults.js
import { GameProfile_Get, GameProfile_IsHexen2 } from '../common/game_profile.js';
import { Cbuf_AddText } from '../common/cmd.js';
import { Con_ToggleConsole_f } from '../common/console.js';
import { K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, K_BACKSPACE, K_DEL, key_game, key_menu, keybindings, Key_SetBinding, Key_KeynumToString } from './keys.js';
import { cl_forwardspeed } from './cl_input.js';
import { sensitivity, m_pitch, lookspring, lookstrafe } from './cl_main.js';
import { volume, bgmvolume } from '../sound/sound.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue, Cvar_VariableString, Cvar_VariableValue, cvar_t } from '../common/cvar.js';
import { R_FogSkyShare, R_FogSkySet } from '../render/r_fog.js';
import { scr_viewsize } from '../render/gl_screen.js';
import { v_gamma } from './view.js';
import { gl_texturemode, GL_UpdateTextureFiltering } from '../render/glquake.js';
import { m_none, m_options, m_video, m_keys, m_newer, m_cheats, set_m_state, set_m_entersound, menuOpeners, _sv, _svs, _vid, _realtime_get, _Draw_CachePic, _Draw_Fill, _S_LocalSound, setKeyDest, M_DrawCharacter, M_Print, M_PrintWhite, M_DrawTransPic, M_DrawPic, NEWER_DEFAULT_GAMMA } from './menu_common.js';
import { M_Menu_Main_f } from './menu_main.js';

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

/**
 * `M_Draw` while `m_state` is `m_cheats`: the eight cheats 8 pixels apart from y 48, `on`/`off` for each switch as read
 * from the player entity (`sv.edicts[1]`), the cursor, and below either whether a cheat was used in this game or that
 * cheats need a local single player game. Nothing until `Draw_CachePic` is wired.
 */
export function M_Cheats_Draw() {

	if ( ! _Draw_CachePic ) return;

	const p = _Draw_CachePic( 'gfx/p_option.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );
	M_PrintWhite( 128, 32, 'Cheats' );

	const player = cheatsAvailable() ? _sv.edicts?.[ 1 ] : null;
	for ( let i = 0; i < CHEATS.length; i ++ ) {

		const c = CHEATS[ i ], y = CHEATS_ROW_Y + i * 8;
		M_Print( 56, y, c.label ); // (the longest label and its state fit the 320-pixel menu)
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

/**
 * `M_Keydown` on the cheats. ESC returns to the options; Up and Down move the cursor, wrapping; Left and Right toggle
 * a switch row; Enter applies any row. Applying, only in a local single player game (no `deathmatch` or `coop`),
 * queues the row's command (`noclip`, `notarget`, `fly`, `cheat_power ...`, `cheat_weapons`, `give h 100`) and marks
 * this game as cheated.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Cheats_Key( key ) {

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

/**
 * `M_TouchInput` on the cheats: a touch on a cheat row (8 pixels a row from y 48) moves the cursor there and applies
 * it, as Enter.
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_Cheats_Touch( vx, vy ) {

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

	switch ( optionsOrder()[ m_options_cursor ] ) {

		case HEXEN2_ENHANCED_ROW:
			toggleEnhancedMode();
			break;

		case HEXEN2_TIER_ROW:
			setTextureTier( textureTierIndex() + dir );
			break;

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

		case 19: // sky fog applies to Classic and Newer Game alike
			R_FogSkySet( R_FogSkyShare() + dir * 0.05 );
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
// The classic options, then Hexen II's two profile rows (enhanced mode and texture detail). The rows are added at
// runtime, not at module load, because the game profile is chosen before the host starts but after this module loads.
const BASE_OPTIONS_ORDER = [ 13, 0, 15, 1, 2, 14, 3, 4, 5, 6, 7, 16, 8, 9, 10, 11, 12, 17, 19, 22 ];
const HEXEN2_ENHANCED_ROW = 20, HEXEN2_TIER_ROW = 21;
function optionsOrder() {

	const order = BASE_OPTIONS_ORDER.slice();
	if ( Distribution_Profile() === 'desktop' ) order.unshift( 18 );
	if ( GameProfile_IsHexen2() ) order.push( HEXEN2_ENHANCED_ROW, HEXEN2_TIER_ROW );
	return order;

}
function optionsItems() { return optionsOrder().length; }
function optionsY( action ) { return 32 + optionsOrder().indexOf( action ) * 8; }

const TEXTURE_TIERS = [ 'low', 'mid', 'high' ];
function textureTierIndex() {

	if ( Cvar_FindVar( 'r_texture_tier' ) === null ) return 1;
	const text = Cvar_VariableString( 'r_texture_tier' ).trim().toLowerCase();
	const index = TEXTURE_TIERS.indexOf( text );
	if ( index >= 0 ) return index;
	if ( text === '0' ) return 0;
	if ( text === '2' ) return 2;
	return 1;

}
function setTextureTier( index ) {

	if ( Cvar_FindVar( 'r_texture_tier' ) === null ) Cvar_RegisterVariable( new cvar_t( 'r_texture_tier', '1', true ) );
	Cvar_SetValue( 'r_texture_tier', ( ( index % 3 ) + 3 ) % 3 );

}
function toggleEnhancedMode() {

	if ( Cvar_FindVar( 'r_hdr' ) === null ) Cvar_RegisterVariable( new cvar_t( 'r_hdr', '0' ) );
	const enabled = Cvar_VariableValue( 'r_hdr' ) === 0;
	Cbuf_AddText( Newer_ApplyGameDefaults( GameProfile_Get(), enabled ) );

}
let m_options_cursor = 0;

/**
 * Opens the options (the `menu_options` command, the main menu's Options item, and ESC from the Newer Game, cheats,
 * keys and video screens): key_dest `key_menu`, `m_state` `m_options`, enter sound.
 */
export function M_Menu_Options_f() {

	// Hexen II draws its own native options page (the +256 highlighted bank fixes its legibility).
	if ( GameProfile_IsHexen2() ) { menuOpeners.hexenOptions(); return; }
	setKeyDest( key_menu );
	set_m_state( m_options );
	set_m_entersound( true );

}

/**
 * `M_Draw` while `m_state` is `m_options`: the 19 rows (20 in the app) 8 pixels apart from y 32 in `OPTIONS_ORDER`, with sliders
 * (screen size, brightness, mouse speed, sound and music volume) and on/off values read from their cvars at x 220,
 * and the cursor at x 200. Nothing until `Draw_CachePic` is wired.
 */
export function M_Options_Draw() {

	if ( ! _Draw_CachePic ) return;

	const p = _Draw_CachePic( 'gfx/p_option.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );

	M_Print( 16, optionsY( 22 ), '            Controller' );
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
	M_Print( 16, optionsY( 19 ), '               Sky fog' );
	M_DrawSlider( 220, optionsY( 19 ), R_FogSkyShare() );
	if(Distribution_Profile()==='desktop')M_Print(16,optionsY(18),' Select Game Locations');
	if ( GameProfile_IsHexen2() ) {

		M_Print( 16, optionsY( HEXEN2_ENHANCED_ROW ), '  Enhanced (Newer) mode' );
		M_DrawCheckbox( 220, optionsY( HEXEN2_ENHANCED_ROW ), Cvar_VariableValue( 'r_hdr' ) !== 0 );
		M_Print( 16, optionsY( HEXEN2_TIER_ROW ), '         Texture detail' );
		M_Print( 220, optionsY( HEXEN2_TIER_ROW ), TEXTURE_TIERS[ textureTierIndex() ] );

	}

	// cursor
	M_DrawCharacter( 200, 32 + m_options_cursor * 8, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

}

/**
 * `M_Keydown` on the options. ESC returns to the main menu; Up and Down move the cursor, wrapping; Left and Right
 * step a slider or flip a switch (`M_AdjustSliders`). Enter opens Newer Game features, Customize controls or Cheats;
 * Go to console closes the menu and opens the console; Performance profiler closes the menu and queues `perfprofile`;
 * Reset to defaults queues `exec default.cfg`, the WASD and mouse binds, speeds 400, gamma, `volume 0.4` and
 * `bgmvolume 1`; on any other row Enter acts as Right.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Options_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_Main_f();
			break;
		case K_ENTER:
			set_m_entersound( true );
			switch ( optionsOrder()[ m_options_cursor ] ) {

				case 0:
					M_Menu_Keys_f();
					break;
				case 1:
					set_m_state( m_none );
					Con_ToggleConsole_f();
					break;
				case 2:
					Cbuf_AddText( 'exec default.cfg\n' );
					// Hexen II's own default.cfg owns its keys (crouch on Space, look on a/z); the web port's WASD
					// overrides are for Quake only.
					if ( ! GameProfile_IsHexen2() ) {

						Cbuf_AddText( 'bind w +forward\n' );
						Cbuf_AddText( 'bind s +back\n' );
						Cbuf_AddText( 'bind a +moveleft\n' );
						Cbuf_AddText( 'bind d +moveright\n' );
						Cbuf_AddText( 'bind SPACE +jump\n' );
						Cbuf_AddText( 'bind MOUSE1 +attack\n' );
						Cbuf_AddText( 'bind f flashlight\n' ); // Newer Game's shoulder flashlight, as Host_Init binds it
						Cbuf_AddText( 'cl_forwardspeed 400\n' );
						Cbuf_AddText( 'cl_backspeed 400\n' );

					}
					Cbuf_AddText( `gamma ${Cvar_VariableValue( 'r_hdr' ) !== 0 ? NEWER_DEFAULT_GAMMA : 1}\n` );
					Cbuf_AddText( 'volume 0.4\n' );
					Cbuf_AddText( 'bgmvolume 1\n' );
					break;
				case 22:
					M_Menu_Gyro_f(); break;
				case 18:
					globalThis.__QUAKED_SELECT_LOCATION__?.();break;
				case 13:
					M_Menu_Newer_f();
					break;
				case 17:
					M_Menu_Cheats_f();
					break;
				case HEXEN2_ENHANCED_ROW:
					toggleEnhancedMode();
					break;
				case HEXEN2_TIER_ROW:
					setTextureTier( textureTierIndex() + 1 );
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
				m_options_cursor = optionsItems() - 1;
			break;
		case K_DOWNARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			m_options_cursor ++;
			if ( m_options_cursor >= optionsItems() )
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
	{ cvar: 'r_dof', label: '        Depth of field', slider: true },
	// the add-on effects for every game (card T-3faa98e3, docs/addon-effects-integration-2026-10-13.md): past the
	// first page, which the list scrolls to
	{ cvar: 'v_blastshake', label: '      Explosion shake', slider: true },
	{ cvar: 'r_drips', label: '          Water drips' },
	{ cvar: 'r_sparks', label: '         Light sparks' },
	{ cvar: 'r_nailhits', label: '         Nail impacts' },
	{ cvar: 'r_embers', label: '          Lava embers' },
	{ cvar: 's_gibs', label: '           Gib sounds' },
	{ cvar: 's_lava', label: '           Lava sound' },
	{ cvar: 'r_itemturn', label: '    Turned item boxes' },
	{ cvar: 'r_mapliquids', label: '       Map see-through' },
	{ cvar: 'r_storm', label: '      Storms and gusts' },
	{ cvar: 's_impacts', label: '       Surface sounds' },
	{ cvar: 's_footsteps', label: '            Footsteps' },
	{ cvar: 'joy_wheel', label: '    Pad: weapon wheel' },
	{ cvar: 'joy_prompts', label: '  Pad: button prompts' },
	{ cvar: 'joy_rumble', label: '          Pad: rumble' }
];
// the page shows this many rows; a longer list scrolls with the cursor
const NEWER_VISIBLE = 17;
let m_newer_cursor = 0, m_newer_top = 0;

// keeps the cursor's row on the page
function M_Newer_Scroll() {

	if ( m_newer_cursor < m_newer_top ) m_newer_top = m_newer_cursor;
	if ( m_newer_cursor >= m_newer_top + NEWER_VISIBLE ) m_newer_top = m_newer_cursor - NEWER_VISIBLE + 1;
	m_newer_top = Math.max( 0, Math.min( m_newer_top, NEWER_FEATURES.length - NEWER_VISIBLE ) );

}

function M_Menu_Newer_f() {

	setKeyDest( key_menu );
	set_m_state( m_newer );
	set_m_entersound( true );

}

// the rows start here
const NEWER_ROW0 = 44;

/**
 * `M_Draw` while `m_state` is `m_newer`: a dark panel (unless the WebGL menu is skinned), the banner, a page of 17
 * Newer Game features 8 pixels apart from y 44, each with its on/off, slider or water appearance choice read from its
 * cvar, a note (which says when the list goes on above or below the page), and the cursor. The page follows the
 * cursor. Nothing until `Draw_CachePic` is wired.
 */
export function M_Newer_Draw() {

	if ( ! _Draw_CachePic ) return;

	// a dark panel behind the list: the picture of the game behind the menu made it hard to read
	if ( _Draw_Fill && ! MainMenu_Skinned() ) {

		const ox = ( _vid.width - 320 ) >> 1, oy = ( _vid.height - 200 ) >> 1;
		_Draw_Fill( ox + 8, oy + 2, 304, 192, 0, 0.82 );

	}

	const banner = _Draw_CachePic( 'gfx/p_enhanced.lmp' );
	if ( banner != null ) M_DrawTransPic( ( 320 - banner.width ) / 2, 4, banner );
	else M_DrawPic( ( 320 - 128 ) / 2, 4, _Draw_CachePic( 'gfx/p_option.lmp' ) );

	M_Newer_Scroll();
	const shown = Math.min( NEWER_VISIBLE, NEWER_FEATURES.length );
	for ( let i = m_newer_top; i < m_newer_top + shown; i ++ ) {

		const y = NEWER_ROW0 + ( i - m_newer_top ) * 8;
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

	const notes = NEWER_ROW0 + shown * 8 + 6, below = NEWER_FEATURES.length - m_newer_top - shown;
	// (one line: the panel ends below it)
	if ( below > 0 ) M_Print( 16, notes, ` Newer Game only.   ${below} more below` );
	else if ( m_newer_top > 0 ) M_Print( 16, notes, ` Newer Game only.   ${m_newer_top} more above` );
	else M_Print( 16, notes, ' Newer Game only. Each switches alone.' );

	M_DrawCharacter( 200, NEWER_ROW0 + ( m_newer_cursor - m_newer_top ) * 8, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

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

/**
 * `M_Keydown` on the Newer Game features. ESC returns to the options; Up and Down move the cursor, wrapping (the page
 * follows it when the list is longer than a page). Left and
 * Right step the row: a slider by 0.05 within 0..1, a choice back or forward, a switch flipped. Enter flips a switch,
 * steps a choice forward, or steps a slider up 0.05, round to 0 past the top. The flashlight goes through
 * `R_FlashlightToggle`, the others through `Cvar_SetValue`.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Newer_Key( key ) {

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

/**
 * `M_TouchInput` on the Newer Game features: a touch on a feature row (8 pixels a row from y 44) moves the cursor there
 * and changes it as Enter does; a touch on the note under the rows turns to the rest of the list (and back).
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_Newer_Touch( vx, vy ) {

	const shown = Math.min( NEWER_VISIBLE, NEWER_FEATURES.length );
	if ( vy >= NEWER_ROW0 && vy < NEWER_ROW0 + shown * 8 ) {

		M_Newer_Scroll();
		m_newer_cursor = m_newer_top + Math.floor( ( vy - NEWER_ROW0 ) / 8 );
		M_Newer_Toggle( 0 );

	} else if ( vy >= NEWER_ROW0 + shown * 8 + 4 && vy < NEWER_ROW0 + shown * 8 + 16 && NEWER_FEATURES.length > NEWER_VISIBLE ) {

		// the note: the next page, or back to the top from the last
		M_Newer_Scroll();
		if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
		const last = NEWER_FEATURES.length - NEWER_VISIBLE;
		m_newer_top = m_newer_top < last ? Math.min( last, m_newer_top + NEWER_VISIBLE ) : 0;
		m_newer_cursor = m_newer_top;

	}

}

/*
==============================================================================

			KEYS MENU (key binding)

==============================================================================
*/

let m_keys_cursor = 0;
let bind_grab = false;

// the shared action list (menu_actions.js), also offered for controller inputs
const bindnames = M_ControllerActions( 'quake' );

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

/**
 * Opens Customize controls (the `menu_keys` command and the options' Customize controls item): key_dest `key_menu`,
 * `m_state` `m_keys`, enter sound.
 */
export function M_Menu_Keys_f() {

	if ( GameProfile_IsHexen2() ) { menuOpeners.hexenKeys(); return; }
	setKeyDest( key_menu );
	set_m_state( m_keys );
	set_m_entersound( true );

}

/**
 * `M_Draw` while `m_state` is `m_keys`: the title, a hint line, each action 8 pixels apart from y 48 with up to two
 * keys bound to it (`???` for none), and the cursor (`=` while waiting for a key). Nothing until `Draw_CachePic` is
 * wired.
 */
export function M_Keys_Draw() {

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

/**
 * `M_Keydown` on Customize controls. While waiting for a key, ESC cancels and any other key queues
 * `bind "<key>" "<command>"` for the row. Otherwise ESC returns to the options; Up or Left and Down or Right move the
 * cursor, wrapping; Enter waits for a key, first unbinding the command if it already has two; Backspace or Del unbinds
 * every key for it.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Keys_Key( key ) {

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

/**
 * Opens the video screen (the `menu_video` command): key_dest `key_menu`, `m_state` `m_video`, enter sound.
 */
export function M_Menu_Video_f() {

	setKeyDest( key_menu );
	set_m_state( m_video );
	set_m_entersound( true );

}

/**
 * `M_Draw` while `m_state` is `m_video`: only the line "Video settings not available in browser".
 */
export function M_Video_Draw() {

	M_Print( 16, 32, 'Video settings not available in browser' );

}

/**
 * `M_Keydown` on the video screen: ESC returns to the options; every other key is ignored.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Video_Key( key ) {

	if ( key === K_ESCAPE )
		M_Menu_Options_f();

}

// Options menu touch - items at y=32, 8px spacing
/**
 * `M_TouchInput` on the options: a touch on a row (8 pixels a row from y 32) moves the cursor there and presses Enter
 * on it (`M_Options_Key`).
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_Options_Touch( vx, vy ) {

	if ( vy >= 32 && vy < 32 + optionsItems() * 8 ) {

		const item = Math.floor( ( vy - 32 ) / 8 );
		if ( item >= 0 && item < optionsItems() ) {

			m_options_cursor = item;
			M_Options_Key( K_ENTER );

		}

	}

}

// Keys menu touch - items at y=48, 8px spacing
/**
 * `M_TouchInput` on Customize controls: a touch on an action row (8 pixels a row from y 48) moves the cursor there and
 * presses Enter on it, so it waits for a key; a touch while already waiting binds Enter to that row.
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_Keys_Touch( vx, vy ) {

	if ( vy >= 48 && vy < 48 + NUMCOMMANDS * 8 ) {

		const item = Math.floor( ( vy - 48 ) / 8 );
		if ( item >= 0 && item < NUMCOMMANDS ) {

			m_keys_cursor = item;
			M_Keys_Key( K_ENTER );

		}

	}

}
