/**
 * @module engine/client/menu
 *
 * The native menu (WinQuake menu.c) and the Newer Game options: main, single player, multiplayer rooms, options,
 * features, cheats, saves.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `m_state`, `m_entersound`; module-level variables `m_recursiveDraw`, `m_return_state`,
 * `m_return_onerror`, `m_return_reason`, `m_save_demonum`, `lanConfig_cursor`, `lanConfig_joinname`, `slist_rooms`,
 * `slist_cursor`, `slist_fetching`, `slist_error`, `_WT_QueryRooms` and 54 more; browser storage.
 *
 * Errors: throws at 1 place; catches at 4 places.
 *
 * Engine callbacks are injected with `M_SetExternals`.
 */
// Ported from: WinQuake/menu.c, WinQuake/menu.h -- menu system

import { NEWER_ENABLED_FEATURES } from '../common/hooks.js'; // installed by newer/ui/newer_defaults.js
import { MainMenu_Begin, MainMenu_End, MainMenu_Glyph, MainMenu_Image, MainMenu_Panel, MainMenu_TextBox,
	MainMenu_SetInGame, MainMenu_SetVisible, MainMenu_Skinned, MainMenu_Slider, MainMenu_Text } from '../common/hooks.js'; // installed by newer/ui/menu_webgl.js
import { R_BestiaryBookOpen, R_BestiaryBookDraw, R_BestiaryBookKey, R_BestiaryBookTouch, R_BestiaryBookCorner } from '../common/hooks.js'; // installed by newer/ui/r_bestiary_book.js
import { R_FlashlightToggle } from '../common/hooks.js'; // installed by newer/render/r_flashlight.js
import { R_DemoLoadingConsoleOverride, R_WelcomeLoadingHolding } from '../common/hooks.js'; // installed by newer/ui/r_demoloading.js
import { Draw_StudioLogo } from '../common/hooks.js'; // installed by newer/ui/studio_logo.js
import { R_DemoSplitActive, R_DemoSplitRelease } from '../common/hooks.js'; // installed by newer/render/r_demosplit.js
import { Cbuf_AddText } from '../common/cmd.js';
import { Cmd_AddCommand } from '../common/cmd.js';
import { Con_Printf, Con_ToggleConsole_f } from '../common/console.js';
import {
	K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW,
	K_BACKSPACE, K_DEL,
	key_game, key_console, key_menu, key_dest,
	keybindings, Key_SetBinding, Key_KeynumToString
} from './keys.js';
import { cl_forwardspeed, cl_backspeed } from './cl_input.js';
import { sensitivity, m_pitch, lookspring, lookstrafe, cl_color } from './cl_main.js';
import { volume, bgmvolume } from '../sound/sound.js';
import { Cvar_SetValue, Cvar_VariableValue } from '../common/cvar.js';
import { scr_viewsize, scr_con_current } from '../render/gl_screen.js';
import { v_gamma } from './view.js';
import { gl_texturemode, GL_UpdateTextureFiltering } from '../render/glquake.js';
import { skill, coop, teamplay, deathmatch, svs } from '../server/server.js';
import { Draw_GetVirtualWidth, Draw_GetVirtualHeight, Draw_GetUIScale, Draw_WithVirtualSize } from '../render/gl_draw.js';
import { SAVEGAME_COMMENT_LENGTH } from '../common/quakedef.js';
import { COM_FindFile } from '../common/pak.js';
import { GameSelection_SavePrefix } from '../common/game_selection.js';

/*
==============================================================================

			MENU STATES

==============================================================================
*/

export const m_none = 0;
export const m_main = 1;
export const m_singleplayer = 2;
export const m_load = 3;
export const m_save = 4;
export const m_multiplayer = 5;
export const m_setup = 6;
export const m_net = 7;
export const m_options = 8;
export const m_video = 9;
export const m_keys = 10;
export const m_help = 11;
export const m_quit = 12;
export const m_serialconfig = 13;
export const m_modemconfig = 14;
export const m_lanconfig = 15;
export const m_gameoptions = 16;
export const m_search = 17;
export const m_slist = 18;
export const m_credits = 19;
export const m_newer = 20;
export const m_levelselect = 21;
export const m_bestiary = 22;
export const m_cheats = 23;
export const m_mpchoice = 24; // Multiplayer: local split screen or online (card [MP1])
export const m_splitscreen = 25; // Local split screen: being built (card [37])

export let m_state = m_none;
export let m_entersound = false;
let m_recursiveDraw = false;

let m_return_state = 0;
let m_return_onerror = false;
let m_return_reason = '';

let m_save_demonum = 0;

/*
==============================================================================

			LAN CONFIG MENU (Join Game)

==============================================================================
*/

let lanConfig_cursor = 0;
let lanConfig_joinname = ''; // Room code or full URL (max 64 chars)

// Default WebTransport server (can be overridden by URL param)
const DEFAULT_WT_SERVER = 'https://wts.mrdoob.com:4433';

// Room list state
let slist_rooms = []; // Array of {id, name, map, playerCount, maxPlayers}
let slist_cursor = 0;
let slist_fetching = false;
let slist_error = '';

// WT_QueryRooms and WT_CreateRoom will be injected via M_SetExternals
let _WT_QueryRooms = null;
let _WT_CreateRoom = null;
let _cl_name = null;

/**
 * Fetch room list from server via WebTransport
 */
async function M_FetchRooms() {

	slist_fetching = true;
	slist_error = '';
	slist_rooms = [];

	// Check if WebTransport is available before attempting
	if ( typeof WebTransport === 'undefined' ) {

		alert( 'Multiplayer requires a browser with WebTransport support (Chrome 97+, Edge 97+, Firefox 114+, or Opera 83+).' );
		M_Menu_Main_f();
		return;

	}

	try {

		const params = new URLSearchParams( window.location.search );
		const serverUrl = params.get( 'server' ) || DEFAULT_WT_SERVER;

		if ( ! _WT_QueryRooms ) {

			throw new Error( 'WebTransport not available' );

		}

		slist_rooms = await _WT_QueryRooms( serverUrl );

	} catch ( e ) {

		slist_error = e.message || 'Failed to fetch rooms';
		Con_Printf( 'Room fetch error: %s\n', slist_error );

	}

	slist_fetching = false;

}

/*
==============================================================================

			GAME OPTIONS MENU (New Game)

==============================================================================
*/

let gameoptions_cursor = 0;
const gameoptions_cursor_table = [ 40, 56, 64, 72, 80, 104, 112 ];
const NUM_GAMEOPTIONS = 7;

let maxplayers = 4;
let startepisode = 2; // Default to Deathmatch Arena
let startlevel = 1;   // Default to rapture1

// Level data - shareware Episode 1 + community deathmatch maps
const levels = [
	{ name: 'start', description: 'Entrance' }, // 0

	{ name: 'e1m1', description: 'Slipgate Complex' }, // 1
	{ name: 'e1m2', description: 'Castle of the Damned' },
	{ name: 'e1m3', description: 'The Necropolis' },
	{ name: 'e1m4', description: 'The Grisly Grotto' },
	{ name: 'e1m5', description: 'Gloom Keep' },
	{ name: 'e1m6', description: 'The Door To Chthon' },
	{ name: 'e1m7', description: 'The House of Chthon' },
	{ name: 'e1m8', description: 'Ziggurat Vertigo' },

	// Community deathmatch maps (freely distributable)
	{ name: 'spinev2', description: 'Spine v2 (Headshot)' }, // 9
	{ name: 'rapture1', description: 'Imminent Boom (Danimal)' },
	{ name: 'naked5', description: 'Kinky Afro (Gandhi)' },
	{ name: 'zed', description: 'Zed (Vondur)' },
	{ name: 'efdm9', description: 'Tangerine Dream (Mr Fribbles)' },
	{ name: 'baldm6', description: 'Scrap Metal (Bal)' },
	{ name: 'edc', description: 'Eternal Dismemberment (Tyrann)' },
	{ name: 'ultrav', description: 'UltraViolence (Escher)' },
];

const episodes = [
	{ description: 'Welcome to Quake', firstLevel: 0, levels: 1 },
	{ description: 'Doomed Dimension', firstLevel: 1, levels: 8 },
	{ description: 'Deathmatch Arena', firstLevel: 9, levels: 8 }
];

/*
==============================================================================

			CONNECTION ERROR HANDLING

==============================================================================
*/

/**
 * Called when a connection attempt fails: by `CL_EstablishConnection` (cl_main.js) when `connect` throws and
 * `M_ShouldReturnOnError` is true, and by the WebTransport driver (net_webtransport.js, wired through
 * `WT_SetExternals`) when the lobby times out or refuses the join.
 * If m_return_onerror is set, returns to the saved menu state with error message.
 * Otherwise falls back to the Multiplayer menu (e.g., for URL-based joins).
 * It only chooses the menu screen; the callers set `key_dest` to `key_menu` so it shows. The reason is kept until
 * the Multiplayer or Join Game menu is next opened, and drawn by those screens.
 *
 * @param {string} [reason] message shown under the menu; `'Connection failed'` when empty or missing
 */
export function M_ConnectionError( reason ) {

	m_return_reason = reason || 'Connection failed';

	if ( m_return_onerror ) {

		// Return to the menu we came from
		m_state = m_return_state;
		m_return_onerror = false;

	} else {

		// Fall back to Multiplayer menu (for URL-based joins that bypass menu)
		m_state = m_multiplayer;

	}

}

/**
 * Check if we should return to menu on connection error. The flag is set when a room is picked in the Join Game menu
 * (just before its `connect` command is queued) and cleared when that menu reopens or `M_ConnectionError` uses it.
 *
 * @returns {boolean} true when a menu join is in progress, so a failed `connect` should return to that menu
 */
export function M_ShouldReturnOnError() {

	return m_return_onerror;

}

// leaving fullscreen on a touch device (platform/touch.js), set by the host ([44g] D1a): the client does not import
// the platform
let _Touch_ExitFullscreen = () => {};

/*
==============================================================================

			EXTERNAL REFERENCES

==============================================================================
*/

// Set by external modules to avoid circular dependencies
let _key_dest_set = null; // function to set key_dest
let _key_dest_get = null; // function to get key_dest
let _cls = { state: 0, demonum: - 1, demoplayback: false };
let _sv = { active: false };
let _svs = { maxclients: 1 };
let _cl = { intermission: 0, gametype: 0 };
let _realVid = { width: 640, height: 480 };
const _vid = {
	get width() { return Draw_GetVirtualWidth(); },
	get height() { return Draw_GetVirtualHeight(); }
};
let _host_time_get = () => 0;
let _realtime_get = () => 0;
let _Draw_CachePic = null;
let _Draw_TransPic = null;
let _Draw_Pic = null;
let _Draw_Character = null;
// draws through a lowered opacity (gl_draw.js Draw_WithAlpha, set by the host); unwired, at full opacity
let _Draw_WithAlpha = ( alpha, draw ) => draw();
let _Draw_Fill = null;
let _Draw_FadeScreen = null;
let _Draw_ConsoleBackground = null;
let _Draw_String = null;
let _Draw_TransPicTranslate = null;
let _Draw_SubPic = null;
let _weaponModelsCredit = null;
let _S_LocalSound = null;
let _SCR_BeginLoadingPlaque = null;
let _SCR_EndLoadingPlaque = null;
let _SCR_ModalMessage = null;
let _IN_RequestPointerLock = null;
let _CL_NextDemo = null;

/**
 * Hands the menu the engine services above it (host, client, server, video, drawing, sound, network, platform) that
 * it calls without importing them. host.js calls it twice: as the module loads, with `{ Touch_ExitFullscreen }`
 * (card [44g], D1a), and from `Host_Init` after `Draw_Init`, with the client state and drawing functions. Each key
 * replaces the current value only when present and truthy (`weaponModelsCredit` whenever the key is present, so it
 * can be cleared); omitted keys keep what they had. Objects are kept by reference for the page's lifetime.
 *
 * Keys, and the default used until they are wired:
 * - `key_dest_set(dest)`, `key_dest_get()`: write and read where keys go. Default null: reads fall back to the
 *   imported `key_dest` and writes are dropped.
 * - `cls` (`client_static_t`): `state`, `demonum`, `demoplayback`. Default `{ state: 0, demonum: -1,
 *   demoplayback: false }`.
 * - `sv` (`server_t`): `active`, `edicts` (the Cheats menu). Default `{ active: false }`.
 * - `svs` (`server_static_t`): `maxclients`. Default `{ maxclients: 1 }`.
 * - `cl` (`client_state_t`): `intermission`. Default `{ intermission: 0, gametype: 0 }`.
 * - `vid` (`viddef_t`): the real video size, `width`/`height` in CSS pixels (the window's inner size), used to map
 *   touches on the scaled Credits screen.
 *   Default `{ width: 640, height: 480 }`.
 * - `host_time_get()`, `realtime_get()`: host time and real time in seconds, for the animated cursors and
 *   `MainMenu_End`. Default `() => 0`.
 * - `Draw_CachePic`, `Draw_TransPic`, `Draw_Pic`, `Draw_Character`, `Draw_Fill`, `Draw_FadeScreen`,
 *   `Draw_ConsoleBackground`, `Draw_String`, `Draw_TransPicTranslate`, `Draw_SubPic` (gl_draw.js). Default null:
 *   the menu then draws nothing that needs them (screens that need `Draw_CachePic` return early). `Draw_String` is
 *   stored but not used.
 * - `S_LocalSound(name)`: menu click sounds. Default null (silent).
 * - `SCR_BeginLoadingPlaque()`, `SCR_EndLoadingPlaque()`: the loading plaque around loads and room creation.
 *   Default null. host.js does not wire `SCR_EndLoadingPlaque`.
 * - `IN_RequestPointerLock()`: asked for when a game starts from the menu. Default null.
 * - `CL_NextDemo()`: resumes the demo loop when the main menu closes while not connected. Default null.
 * - `WT_QueryRooms(serverUrl)`, `WT_CreateRoom(serverUrl, options)` (net_webtransport.js): the Join Game room list
 *   and the New Game room. Default null: fetching the list fails with "WebTransport not available".
 * - `cl_name` (`cvar_t`): the player name, for the room host and the Setup menu. Default null (`'Player'` /
 *   `'player'`).
 * - `weaponModelsCredit`: an optional picture drawn on the Credits screen. Default null; host.js does not wire it.
 * - `Touch_ExitFullscreen()` (platform/touch.js): leaves fullscreen when the Quit menu opens. Default a no-op.
 *
 * @param {object} externals any subset of the keys above
 */
export function M_SetExternals( externals ) {
	if ( 'weaponModelsCredit' in externals ) _weaponModelsCredit = externals.weaponModelsCredit;
	if ( externals.Touch_ExitFullscreen ) _Touch_ExitFullscreen = externals.Touch_ExitFullscreen;

	if ( externals.key_dest_set ) _key_dest_set = externals.key_dest_set;
	if ( externals.key_dest_get ) _key_dest_get = externals.key_dest_get;
	if ( externals.cls ) _cls = externals.cls;
	if ( externals.sv ) _sv = externals.sv;
	if ( externals.svs ) _svs = externals.svs;
	if ( externals.cl ) _cl = externals.cl;
	if ( externals.vid ) _realVid = externals.vid;
	if ( externals.Draw_CachePic ) _Draw_CachePic = externals.Draw_CachePic;
	if ( externals.Draw_TransPic ) _Draw_TransPic = externals.Draw_TransPic;
	if ( externals.Draw_Pic ) _Draw_Pic = externals.Draw_Pic;
	if ( externals.Draw_Character ) _Draw_Character = externals.Draw_Character;
	if ( externals.Draw_WithAlpha ) _Draw_WithAlpha = externals.Draw_WithAlpha;
	if ( externals.Draw_Fill ) _Draw_Fill = externals.Draw_Fill;
	if ( externals.Draw_FadeScreen ) _Draw_FadeScreen = externals.Draw_FadeScreen;
	if ( externals.Draw_ConsoleBackground ) _Draw_ConsoleBackground = externals.Draw_ConsoleBackground;
	if ( externals.Draw_String ) _Draw_String = externals.Draw_String;
	if ( externals.S_LocalSound ) _S_LocalSound = externals.S_LocalSound;
	if ( externals.SCR_BeginLoadingPlaque ) _SCR_BeginLoadingPlaque = externals.SCR_BeginLoadingPlaque;
	if ( externals.SCR_EndLoadingPlaque ) _SCR_EndLoadingPlaque = externals.SCR_EndLoadingPlaque;
	if ( externals.IN_RequestPointerLock ) _IN_RequestPointerLock = externals.IN_RequestPointerLock;
	if ( externals.host_time_get ) _host_time_get = externals.host_time_get;
	if ( externals.realtime_get ) _realtime_get = externals.realtime_get;
	if ( externals.CL_NextDemo ) _CL_NextDemo = externals.CL_NextDemo;
	if ( externals.WT_QueryRooms ) _WT_QueryRooms = externals.WT_QueryRooms;
	if ( externals.WT_CreateRoom ) _WT_CreateRoom = externals.WT_CreateRoom;
	if ( externals.cl_name ) _cl_name = externals.cl_name;
	if ( externals.Draw_TransPicTranslate ) _Draw_TransPicTranslate = externals.Draw_TransPicTranslate;
	if ( externals.Draw_SubPic ) _Draw_SubPic = externals.Draw_SubPic;

}

function getKeyDest() {

	return _key_dest_get ? _key_dest_get() : key_dest;

}

function setKeyDest( val ) {

	if ( _key_dest_set ) _key_dest_set( val );

}

/*
==============================================================================

			DRAWING HELPERS

==============================================================================
*/

/*
================
M_DrawCharacter

Draws one solid graphics character
================
*/
function M_DrawCharacter( cx, line, num ) {

	const x = cx + ( ( _vid.width - 320 ) >> 1 ), y = line + ( ( _vid.height - 200 ) >> 1 );
	if ( MainMenu_Glyph( x, y, num ) ) return;
	if ( _Draw_Character )
		_Draw_Character( x, y, num );

}

function M_Print( cx, cy, str ) {

	if ( MainMenu_Text( cx + ( ( _vid.width - 320 ) >> 1 ), cy + ( ( _vid.height - 200 ) >> 1 ), str, 0 ) ) return;

	for ( let i = 0; i < str.length; i ++ ) {

		M_DrawCharacter( cx, cy, str.charCodeAt( i ) + 128 );
		cx += 8;

	}

}

function M_PrintWhite( cx, cy, str ) {

	if ( MainMenu_Text( cx + ( ( _vid.width - 320 ) >> 1 ), cy + ( ( _vid.height - 200 ) >> 1 ), str, 2 ) ) return;

	for ( let i = 0; i < str.length; i ++ ) {

		M_DrawCharacter( cx, cy, str.charCodeAt( i ) );
		cx += 8;

	}

}

// A menu item that cannot be chosen: the menu's own lettering, faded (the WebGL menu's disabled material; natively at
// 40% opacity). Card [MP1].
function M_PrintFaded( cx, cy, str ) {

	if ( MainMenu_Text( cx + ( ( _vid.width - 320 ) >> 1 ), cy + ( ( _vid.height - 200 ) >> 1 ), str, 0, true ) ) return;
	_Draw_WithAlpha( 0.4, () => {

		for ( let i = 0; i < str.length; i ++ ) { M_DrawCharacter( cx, cy, str.charCodeAt( i ) + 128 ); cx += 8; }

	} );

}

function M_DrawTransPic( x, y, pic ) {

	const dx = x + ( ( _vid.width - 320 ) >> 1 ), dy = y + ( ( _vid.height - 200 ) >> 1 );
	if ( MainMenu_Image( dx, dy, pic ) ) return;
	if ( _Draw_TransPic && pic )
		_Draw_TransPic( dx, dy, pic );

}

function M_DrawSubPic( x, y, pic, srcY, srcH ) {

	const dx = x + ( ( _vid.width - 320 ) >> 1 ), dy = y + ( ( _vid.height - 200 ) >> 1 );
	if ( MainMenu_Image( dx, dy, pic, srcY ) ) return;
	if ( _Draw_SubPic && pic )
		_Draw_SubPic( dx, dy, pic, srcY, srcH );

}

function M_DrawPic( x, y, pic ) {

	const dx = x + ( ( _vid.width - 320 ) >> 1 ), dy = y + ( ( _vid.height - 200 ) >> 1 );
	if ( MainMenu_Image( dx, dy, pic ) ) return;
	if ( _Draw_Pic && pic )
		_Draw_Pic( dx, dy, pic );

}

export { M_DrawPic as M_DrawPic_export };

function M_DrawTransPicTranslate( x, y, pic ) {

	if ( _Draw_TransPicTranslate != null && pic != null )
		_Draw_TransPicTranslate( x + ( ( _vid.width - 320 ) >> 1 ), y + ( ( _vid.height - 200 ) >> 1 ), pic, translationTable );

}

function M_DrawTextBox( x, y, width, lines ) {

	if ( MainMenu_TextBox( x + ( ( _vid.width - 320 ) >> 1 ), y + ( ( _vid.height - 200 ) >> 1 ),
		( width + 2 ) * 8, ( lines + 2 ) * 8,
		_Draw_CachePic && _Draw_CachePic( 'gfx/box_tl.lmp' ), _Draw_CachePic && _Draw_CachePic( 'gfx/box_br.lmp' ) ) ) return;

	if ( ! _Draw_CachePic ) return;

	let cx, cy, n;
	let p;

	// draw left side
	cx = x;
	cy = y;
	p = _Draw_CachePic( 'gfx/box_tl.lmp' );
	M_DrawTransPic( cx, cy, p );
	p = _Draw_CachePic( 'gfx/box_ml.lmp' );
	for ( n = 0; n < lines; n ++ ) {

		cy += 8;
		M_DrawTransPic( cx, cy, p );

	}

	p = _Draw_CachePic( 'gfx/box_bl.lmp' );
	M_DrawTransPic( cx, cy + 8, p );

	// draw middle
	cx += 8;
	while ( width > 0 ) {

		cy = y;
		p = _Draw_CachePic( 'gfx/box_tm.lmp' );
		M_DrawTransPic( cx, cy, p );
		p = _Draw_CachePic( 'gfx/box_mm.lmp' );
		for ( n = 0; n < lines; n ++ ) {

			cy += 8;
			if ( n === 1 )
				p = _Draw_CachePic( 'gfx/box_mm2.lmp' );
			M_DrawTransPic( cx, cy, p );

		}

		p = _Draw_CachePic( 'gfx/box_bm.lmp' );
		M_DrawTransPic( cx, cy + 8, p );
		width -= 2;
		cx += 16;

	}

	// draw right side
	cy = y;
	p = _Draw_CachePic( 'gfx/box_tr.lmp' );
	M_DrawTransPic( cx, cy, p );
	p = _Draw_CachePic( 'gfx/box_mr.lmp' );
	for ( n = 0; n < lines; n ++ ) {

		cy += 8;
		M_DrawTransPic( cx, cy, p );

	}

	p = _Draw_CachePic( 'gfx/box_br.lmp' );
	M_DrawTransPic( cx, cy + 8, p );

}

/*
==============================================================================

			TRANSLATION TABLE (for player color)

==============================================================================
*/

const TOP_RANGE = 16;
const BOTTOM_RANGE = 96;

const identityTable = new Uint8Array( 256 );
const translationTable = new Uint8Array( 256 );

function M_BuildTranslationTable( top, bottom ) {

	for ( let j = 0; j < 256; j ++ )
		identityTable[ j ] = j;

	translationTable.set( identityTable );

	if ( top < 128 ) {

		for ( let j = 0; j < 16; j ++ )
			translationTable[ TOP_RANGE + j ] = identityTable[ top + j ];

	} else {

		for ( let j = 0; j < 16; j ++ )
			translationTable[ TOP_RANGE + j ] = identityTable[ top + 15 - j ];

	}

	if ( bottom < 128 ) {

		for ( let j = 0; j < 16; j ++ )
			translationTable[ BOTTOM_RANGE + j ] = identityTable[ bottom + j ];

	} else {

		for ( let j = 0; j < 16; j ++ )
			translationTable[ BOTTOM_RANGE + j ] = identityTable[ bottom + 15 - j ];

	}

}

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

	m_entersound = true;

	if ( getKeyDest() === key_menu ) {

		if ( m_state !== m_main ) {

			M_Menu_Main_f();
			return;

		}

		setKeyDest( key_game );
		m_state = m_none;
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

			MAIN MENU

==============================================================================
*/

let m_main_cursor = 0;
const MAIN_ITEMS = 6; // Single Player, Multiplayer, Bestiarium, Options, Credits, Quit

// Check if we're currently playing (not watching demos)
function M_InGame() {

	// ca_connected = 2 in client.js
	// Don't show Continue during demo playback - only when actually playing
	if ( _cls.demoplayback )
		return false;

	return _sv.active || _cls.state === 2;

}

/**
 * Opens the main menu (the `menu_main` command; also Escape in a submenu, the console closing while not connected,
 * and the WebTransport driver after a failed join). When the menu was not already up it saves `cls.demonum` and sets
 * it to -1, which holds the demo loop until Escape leaves the main menu and restores it.
 */
export function M_Menu_Main_f() {

	if ( getKeyDest() !== key_menu ) {

		m_save_demonum = _cls.demonum;
		_cls.demonum = - 1;

	}

	setKeyDest( key_menu );
	m_state = m_main;
	m_entersound = true;

}

function M_Main_Draw() {

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

function M_Main_Key( key ) {

	const inGame = M_InGame();
	const itemCount = inGame ? MAIN_ITEMS + 1 : MAIN_ITEMS;
	m_main_cursor = Math.min( m_main_cursor, itemCount - 1 );

	switch ( key ) {

		case K_ESCAPE:
			setKeyDest( key_game );
			m_state = m_none;
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
			m_entersound = true;

			// Adjust cursor for menu action - if in-game, cursor 0 is Continue
			const actionCursor = inGame ? m_main_cursor - 1 : m_main_cursor;

			if ( inGame && m_main_cursor === 0 ) {

				// Continue - return to game
				setKeyDest( key_game );
				m_state = m_none;
				break;

			}

			switch ( actionCursor ) {

				case 0:
					M_Menu_SinglePlayer_f();
					break;
				case 1:
					M_Menu_MultiplayerChoice_f(); // local split screen or online (card [MP1])
					break;
				case 2:
					M_Menu_Bestiary_f();
					break;
				case 3:
					M_Menu_Options_f();
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

	if ( getKeyDest() !== key_menu ) { m_save_demonum = _cls.demonum; _cls.demonum = -1; }
	R_BestiaryBookOpen();
	setKeyDest( key_menu );
	m_state = m_bestiary;
	m_entersound = true;

}

function M_Bestiary_Key( key ) {

	if ( key === K_ESCAPE ) { M_Menu_Main_f(); return; }
	if ( R_BestiaryBookKey( key ) && _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );

}

/*
==============================================================================

			SINGLE PLAYER MENU

==============================================================================
*/

let m_singleplayer_cursor = 0;
// Enhanced starts with brightness at the slider midpoint and FPS showing.
// The successful fresh-map hook chooses the flashlight for the hub/difficulty.
const NEWER_DEFAULT_GAMMA = 0.75; // brightness range is gamma1 (dark) to gamma.5 (bright)
// built when used: the feature list is Newer's, installed after this module loads
const newerDefaults = () => NEWER_ENABLED_FEATURES.map( name => name + ' 1\n' ).join( '' ) + `gamma ${NEWER_DEFAULT_GAMMA}\ncl_showfps 1\n`;

const SINGLEPLAYER_ITEMS = 5; // Newer Game, New Game, Load, Save, Level Select

function M_Menu_SinglePlayer_f() {

	setKeyDest( key_menu );
	m_state = m_singleplayer;
	m_entersound = true;

}

function M_SinglePlayer_Draw() {

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

function M_SinglePlayer_Key( key ) {

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
			m_entersound = true;

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
					M_Menu_LevelSelect_f();
					break;

			}

			break;

	}

}

/*
==============================================================================

			LEVEL SELECT

Start any level directly: pick Newer Game or New Game, the skill, and the level.
==============================================================================
*/

// Every stock map by episode (0 is the Introduction hub). Only the maps this copy of the game has are offered, and an
// episode appears only if at least one of its maps does: the shareware pak0.pak has the Introduction and Episode 1; a
// registered copy's maps (the 2021 re-release's pak0.pak at resources/id1/pak0.pak; the original release keeps Episodes 2 to 4 in pak1.pak, which is not read) add Episodes 2 to 4.
export const LEVEL_SELECT_LEVELS = [
	{ episode: 0, map: 'start', name: 'Introduction' },
	{ episode: 1, map: 'e1m1', name: 'The Slipgate Complex' },
	{ episode: 1, map: 'e1m2', name: 'Castle of the Damned' },
	{ episode: 1, map: 'e1m3', name: 'The Necropolis' },
	{ episode: 1, map: 'e1m4', name: 'The Grisly Grotto' },
	{ episode: 1, map: 'e1m5', name: 'Gloom Keep' },
	{ episode: 1, map: 'e1m6', name: 'The Door to Chthon' },
	{ episode: 1, map: 'e1m7', name: 'The House of Chthon' },
	{ episode: 1, map: 'e1m8', name: 'Ziggurat Vertigo' },
	{ episode: 2, map: 'e2m1', name: 'The Installation' },
	{ episode: 2, map: 'e2m2', name: 'The Ogre Citadel' },
	{ episode: 2, map: 'e2m3', name: 'The Crypt of Decay' },
	{ episode: 2, map: 'e2m4', name: 'The Ebon Fortress' },
	{ episode: 2, map: 'e2m5', name: 'The Wizard\'s Manse' },
	{ episode: 2, map: 'e2m6', name: 'The Dismal Oubliette' },
	{ episode: 2, map: 'e2m7', name: 'The Underearth' },
	{ episode: 3, map: 'e3m1', name: 'Termination Central' },
	{ episode: 3, map: 'e3m2', name: 'The Vaults of Zin' },
	{ episode: 3, map: 'e3m3', name: 'The Tomb of Terror' },
	{ episode: 3, map: 'e3m4', name: 'Satan\'s Dark Delight' },
	{ episode: 3, map: 'e3m5', name: 'The Wind Tunnels' },
	{ episode: 3, map: 'e3m6', name: 'Chambers of Torment' },
	{ episode: 3, map: 'e3m7', name: 'The Haunted Halls' },
	{ episode: 4, map: 'e4m1', name: 'The Sewage System' },
	{ episode: 4, map: 'e4m2', name: 'The Tower of Despair' },
	{ episode: 4, map: 'e4m3', name: 'The Elder God Shrine' },
	{ episode: 4, map: 'e4m4', name: 'The Palace of Hate' },
	{ episode: 4, map: 'e4m5', name: 'Hell\'s Atrium' },
	{ episode: 4, map: 'e4m6', name: 'The Pain Maze' },
	{ episode: 4, map: 'e4m7', name: 'Azure Agony' },
	{ episode: 4, map: 'e4m8', name: 'The Nameless City' },
	{ episode: 4, map: 'end', name: 'Shub-Niggurath\'s Pit' }
];
// short enough to sit at the value column (x 184) of the 320-wide menu
export const LEVEL_SELECT_EPISODES = [
	{ episode: 0, name: 'Introduction' },
	{ episode: 1, name: 'E1 Doomed' },
	{ episode: 2, name: 'E2 Black Magic' },
	{ episode: 3, name: 'E3 Netherworld' },
	{ episode: 4, name: 'E4 Elder World' }
];
const SKILL_NAMES = [ 'Easy', 'Normal', 'Hard', 'Nightmare' ];
const LEVELSELECT_ROWS = 3; // mode, skill and episode come before the levels
const LEVELSELECT_LEVEL_Y = 84, LEVELSELECT_ROW_Y = 48;
let m_levelselect_cursor = LEVELSELECT_ROWS;
let m_levelselect_newer = true;
let m_levelselect_episode = 1;

const levelAvailable = ( l ) => COM_FindFile( 'maps/' + l.map + '.bsp' ) !== null;

// the episodes this copy of the game has at least one map of
function levelSelectEpisodes() {

	return LEVEL_SELECT_EPISODES.filter( ( e ) => LEVEL_SELECT_LEVELS.some( ( l ) => l.episode === e.episode && levelAvailable( l ) ) );

}

// the selected episode, or the first one there is if it is not in this copy (Episode 1 is the usual start)
function levelSelectEpisode() {

	const episodes = levelSelectEpisodes();
	if ( episodes.some( ( e ) => e.episode === m_levelselect_episode ) ) return m_levelselect_episode;
	return ( episodes.find( ( e ) => e.episode === 1 ) || episodes[ 0 ] || { episode: m_levelselect_episode } ).episode;

}

// the maps of the selected episode that this copy of the game has
function levelSelectLevels() {

	const episode = levelSelectEpisode();
	return LEVEL_SELECT_LEVELS.filter( ( l ) => l.episode === episode && levelAvailable( l ) );

}

/**
 * What Level Select offers right now: the episodes, the selected one and its levels (the menu's own view, for tests;
 * tests/level_select_test.js). Availability is looked up in the loaded paks (`COM_FindFile`) on every call.
 *
 * @returns {{ episodes: Array<number>, episode: number, levels: Array<string>, cursor: number }} the episode numbers
 *   this copy has (0 is the Introduction), the selected episode, its map names in order (e.g. `'e1m1'`), and the
 *   cursor row (0..2 are mode, skill and episode; levels start at row 3). A new object on every call.
 */
export function M_LevelSelectOffer() {

	return { episodes: levelSelectEpisodes().map( ( e ) => e.episode ), episode: levelSelectEpisode(), levels: levelSelectLevels().map( ( l ) => l.map ), cursor: m_levelselect_cursor };

}

function M_Menu_LevelSelect_f() {

	setKeyDest( key_menu );
	m_state = m_levelselect;
	m_entersound = true;
	m_levelselect_cursor = Math.min( m_levelselect_cursor, LEVELSELECT_ROWS + Math.max( 0, levelSelectLevels().length - 1 ) );

}

function M_LevelSelect_Draw() {

	if ( ! _Draw_CachePic ) return;

	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/ttl_sgl.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );

	const levels = levelSelectLevels();
	M_PrintWhite( 112, 32, 'Level Select' );

	M_Print( 16, 48, '            Game' );
	M_PrintWhite( 184, 48, m_levelselect_newer ? 'Newer Game' : 'New Game' );
	M_Print( 16, 56, '           Skill' );
	const skill = Math.max( 0, Math.min( 3, Math.round( Cvar_VariableValue( 'skill' ) ) ) );
	M_PrintWhite( 184, 56, SKILL_NAMES[ skill ] );
	M_Print( 16, 64, '         Episode' );
	const episode = levelSelectEpisode();
	M_PrintWhite( 184, 64, ( LEVEL_SELECT_EPISODES.find( ( e ) => e.episode === episode ) || { name: '' } ).name );

	for ( let i = 0; i < levels.length; i ++ ) {

		M_Print( 64, LEVELSELECT_LEVEL_Y + i * 8, levels[ i ].map.toUpperCase().padEnd( 6 ) );
		M_PrintWhite( 112, LEVELSELECT_LEVEL_Y + i * 8, levels[ i ].name );

	}

	const y = m_levelselect_cursor < LEVELSELECT_ROWS ? LEVELSELECT_ROW_Y + m_levelselect_cursor * 8 : LEVELSELECT_LEVEL_Y + ( m_levelselect_cursor - LEVELSELECT_ROWS ) * 8;
	M_DrawCharacter( m_levelselect_cursor < LEVELSELECT_ROWS ? 168 : 48, y, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

}

function M_LevelSelect_Change( dir ) {

	if ( m_levelselect_cursor === 0 ) {

		m_levelselect_newer = ! m_levelselect_newer;

	} else if ( m_levelselect_cursor === 1 ) {

		const skill = Math.max( 0, Math.min( 3, Math.round( Cvar_VariableValue( 'skill' ) ) ) );
		Cvar_SetValue( 'skill', ( skill + dir + 4 ) % 4 );

	} else if ( m_levelselect_cursor === 2 ) {

		const episodes = levelSelectEpisodes();
		if ( episodes.length < 2 ) return true; // nothing to choose between
		const at = Math.max( 0, episodes.findIndex( ( e ) => e.episode === levelSelectEpisode() ) );
		m_levelselect_episode = episodes[ ( at + dir + episodes.length ) % episodes.length ].episode;

	} else {

		return false;

	}

	if ( _S_LocalSound ) _S_LocalSound( 'misc/menu3.wav' );
	return true;

}

function M_LevelSelect_Start() {

	const levels = levelSelectLevels();
	const level = levels[ m_levelselect_cursor - LEVELSELECT_ROWS ];
	if ( level === undefined ) return;

	m_entersound = true;
	setKeyDest( key_game );
	if ( _IN_RequestPointerLock ) _IN_RequestPointerLock();
	if ( _sv.active )
		Cbuf_AddText( 'disconnect\n' );
	Cbuf_AddText( 'maxplayers 1\n' );
	// New Game keeps the classic lighting, Newer Game uses the HDR pipeline
	Cbuf_AddText( m_levelselect_newer ? 'r_hdr 1\n' : 'r_hdr 0\n' );
	if ( m_levelselect_newer ) Cbuf_AddText( newerDefaults() );
	R_DemoSplitRelease( m_levelselect_newer );
	Cbuf_AddText( 'map ' + level.map + '\n' );

}

function M_LevelSelect_Key( key ) {

	const count = LEVELSELECT_ROWS + levelSelectLevels().length;

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_SinglePlayer_f();
			break;

		case K_UPARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( -- m_levelselect_cursor < 0 ) m_levelselect_cursor = count - 1;
			break;

		case K_DOWNARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( ++ m_levelselect_cursor >= count ) m_levelselect_cursor = 0;
			break;

		case K_LEFTARROW:
			M_LevelSelect_Change( - 1 );
			break;

		case K_RIGHTARROW:
			M_LevelSelect_Change( 1 );
			break;

		case K_ENTER:
			if ( ! M_LevelSelect_Change( 1 ) ) M_LevelSelect_Start();
			break;

	}

}

function M_LevelSelect_Touch( vx, vy ) {

	if ( vy >= LEVELSELECT_ROW_Y && vy < LEVELSELECT_ROW_Y + LEVELSELECT_ROWS * 8 ) {

		m_levelselect_cursor = Math.floor( ( vy - LEVELSELECT_ROW_Y ) / 8 );
		M_LevelSelect_Change( 1 );

	} else if ( vy >= LEVELSELECT_LEVEL_Y && vy < LEVELSELECT_LEVEL_Y + levelSelectLevels().length * 8 ) {

		m_levelselect_cursor = LEVELSELECT_ROWS + Math.floor( ( vy - LEVELSELECT_LEVEL_Y ) / 8 );
		M_LevelSelect_Start();

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
	m_state = m_cheats;
	m_entersound = true;

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

function M_Menu_Load_f() {

	m_entersound = true;
	m_state = m_load;
	setKeyDest( key_menu );
	M_ScanSaves();

}

function M_Menu_Save_f() {

	if ( ! _sv.active )
		return;
	if ( _cl.intermission )
		return;
	if ( _svs.maxclients !== 1 )
		return;

	m_entersound = true;
	m_state = m_save;
	setKeyDest( key_menu );
	M_ScanSaves();

}

function M_Load_Draw() {

	if ( ! _Draw_CachePic ) return;

	const p = _Draw_CachePic( 'gfx/p_load.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );

	for ( let i = 0; i < MAX_SAVEGAMES; i ++ )
		M_Print( 16, 32 + 8 * i, m_filenames[ i ] );

	// line cursor
	M_DrawCharacter( 8, 32 + load_cursor * 8, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

}

function M_Save_Draw() {

	if ( ! _Draw_CachePic ) return;

	const p = _Draw_CachePic( 'gfx/p_save.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );

	for ( let i = 0; i < MAX_SAVEGAMES; i ++ )
		M_Print( 16, 32 + 8 * i, m_filenames[ i ] );

	M_DrawCharacter( 8, 32 + load_cursor * 8, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

}

function M_Load_Key( k ) {

	switch ( k ) {

		case K_ESCAPE:
			M_Menu_SinglePlayer_f();
			break;
		case K_ENTER:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu2.wav' );
			if ( ! loadable[ load_cursor ] )
				return;
			m_state = m_none;
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

function M_Save_Key( k ) {

	switch ( k ) {

		case K_ESCAPE:
			M_Menu_SinglePlayer_f();
			break;
		case K_ENTER:
			m_state = m_none;
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

			MULTIPLAYER CHOICE (card [MP1]): local split screen, or online

==============================================================================
*/

// Online is shown but cannot be chosen yet; the online screens below stay for joins by link and connection errors.
const MPCHOICE_ITEMS = Object.freeze( [ Object.freeze( { label: 'Local (split screen)', enabled: true } ), Object.freeze( { label: 'Online', enabled: false } ) ] );
let m_mpchoice_cursor = 0;

/**
 * Opens the Multiplayer screen: Local (split screen), and Online faded and disabled. Called by the main menu's
 * Multiplayer item.
 */
export function M_Menu_MultiplayerChoice_f() {

	setKeyDest( key_menu );
	m_state = m_mpchoice;
	m_entersound = true;
	if ( ! MPCHOICE_ITEMS[ m_mpchoice_cursor ]?.enabled ) m_mpchoice_cursor = MPCHOICE_ITEMS.findIndex( item => item.enabled );

}

function M_MultiplayerChoice_Draw() {

	if ( ! _Draw_CachePic ) return;
	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/p_multi.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );
	MPCHOICE_ITEMS.forEach( ( item, i ) => ( item.enabled ? M_Print : M_PrintFaded )( 72 + 8, 32 + i * 20 + 6, item.label ) );
	const f = Math.floor( _host_time_get() * 10 ) % 6;
	M_DrawTransPic( 54, 32 + m_mpchoice_cursor * 20, _Draw_CachePic( 'gfx/menudot' + ( f + 1 ) + '.lmp' ) );

}

// the next item that can be chosen, `step` (+1 or -1) at a time, wrapping
function mpchoiceStep( step ) {

	for ( let n = 1; n <= MPCHOICE_ITEMS.length; n ++ ) {

		const i = ( m_mpchoice_cursor + step * n + MPCHOICE_ITEMS.length * n ) % MPCHOICE_ITEMS.length;
		if ( MPCHOICE_ITEMS[ i ].enabled ) return i;

	}
	return m_mpchoice_cursor;

}

function M_MultiplayerChoice_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_Main_f();
			break;
		case K_DOWNARROW:
		case K_UPARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			m_mpchoice_cursor = mpchoiceStep( key === K_DOWNARROW ? 1 : - 1 );
			break;
		case K_ENTER:
			if ( ! MPCHOICE_ITEMS[ m_mpchoice_cursor ]?.enabled ) break; // Online: not yet
			m_entersound = true;
			if ( m_mpchoice_cursor === 0 ) M_Menu_SplitScreen_f();
			break;

	}

}

function M_MultiplayerChoice_Touch( vx, vy ) {

	const item = Math.floor( ( vy - 32 ) / 20 );
	if ( vy >= 32 && item >= 0 && item < MPCHOICE_ITEMS.length && MPCHOICE_ITEMS[ item ].enabled ) {

		m_mpchoice_cursor = item;
		M_MultiplayerChoice_Key( K_ENTER );

	}

}

/*
==============================================================================

			LOCAL SPLIT SCREEN (card [37]): being built

==============================================================================
*/

function M_Menu_SplitScreen_f() {

	setKeyDest( key_menu );
	m_state = m_splitscreen;
	m_entersound = true;

}

function M_SplitScreen_Draw() {

	if ( ! _Draw_CachePic ) return;
	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/p_multi.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );
	M_DrawTextBox( 56, 60, 24, 4 );
	M_Print( 72, 72, 'Local split screen' );
	M_PrintWhite( 72, 80, 'is being built.' );
	M_PrintWhite( 72, 96, 'Press Esc to go back.' );

}

function M_SplitScreen_Key( key ) {

	if ( key === K_ESCAPE || key === K_ENTER ) M_Menu_MultiplayerChoice_f();

}

/*
==============================================================================

			MULTIPLAYER MENU

==============================================================================
*/

let m_multiplayer_cursor = 0;
const MULTIPLAYER_ITEMS = 3;

function M_Menu_MultiPlayer_f() {

	setKeyDest( key_menu );
	m_state = m_multiplayer;
	m_entersound = true;
	m_return_reason = '';

}

function M_MultiPlayer_Draw() {

	if ( ! _Draw_CachePic ) return;

	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/p_multi.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );
	M_DrawTransPic( 72, 32, _Draw_CachePic( 'gfx/mp_menu.lmp' ) );

	const f = Math.floor( _host_time_get() * 10 ) % 6;
	M_DrawTransPic( 54, 32 + m_multiplayer_cursor * 20, _Draw_CachePic( 'gfx/menudot' + ( f + 1 ) + '.lmp' ) );

	// Error message from connection attempt
	if ( m_return_reason ) {

		M_PrintWhite( 72, 97, m_return_reason );

	}

}

function M_MultiPlayer_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_Main_f();
			break;
		case K_DOWNARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( ++ m_multiplayer_cursor >= MULTIPLAYER_ITEMS )
				m_multiplayer_cursor = 0;
			break;
		case K_UPARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			if ( -- m_multiplayer_cursor < 0 )
				m_multiplayer_cursor = MULTIPLAYER_ITEMS - 1;
			break;
		case K_ENTER:
			m_entersound = true;
			switch ( m_multiplayer_cursor ) {

				case 0:
					// Join Game -> LAN Config (room code entry)
					M_Menu_LanConfig_f();
					break;
				case 1:
					// New Game -> Game Options
					M_Menu_GameOptions_f();
					break;
				case 2:
					M_Menu_Setup_f();
					break;

			}

			break;

	}

}

/*
==============================================================================

			LAN CONFIG MENU (Join Game via WebTransport)

==============================================================================
*/

function M_Menu_LanConfig_f() {

	setKeyDest( key_menu );
	m_state = m_lanconfig;
	m_entersound = true;

	slist_cursor = 0;
	m_return_onerror = false;
	m_return_reason = '';

	// Fetch room list
	M_FetchRooms();

}

function M_LanConfig_Draw() {

	if ( ! _Draw_CachePic ) return;

	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/p_multi.lmp' );
	const basex = ( 320 - ( p ? p.width : 0 ) ) / 2;
	M_DrawPic( basex, 4, p );

	M_Print( basex, 32, 'Join Game' );

	if ( slist_fetching ) {

		M_Print( basex, 52, 'Searching for games...' );

	} else if ( slist_error ) {

		M_Print( basex, 52, 'Error: ' + slist_error.substring( 0, 30 ) );
		M_Print( basex, 68, 'Press SPACE to retry' );

	} else if ( slist_rooms.length === 0 ) {

		M_Print( basex, 52, 'No games found' );
		M_Print( basex, 68, 'Press SPACE to refresh' );

	} else {

		// Draw room list
		const maxVisible = 8;
		const startIdx = Math.max( 0, slist_cursor - maxVisible + 1 );

		for ( let i = 0; i < maxVisible && ( startIdx + i ) < slist_rooms.length; i ++ ) {

			const room = slist_rooms[ startIdx + i ];
			const y = 52 + i * 12;

			// Room name and map
			const info = room.map + ' (' + room.playerCount + '/' + room.maxPlayers + ')';
			M_Print( basex, y, info );

			// Room ID
			M_PrintWhite( basex + 180, y, room.id );

		}

		// Draw cursor
		const cursorY = 52 + ( slist_cursor - startIdx ) * 12;
		M_DrawCharacter( basex - 8, cursorY, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

	}

	// Error message from connection attempt
	if ( m_return_reason ) {

		M_PrintWhite( basex, 170, m_return_reason );

	}

}

function M_LanConfig_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_MultiPlayer_f();
			break;

		case K_UPARROW:
			if ( slist_rooms.length > 0 ) {

				if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
				slist_cursor --;
				if ( slist_cursor < 0 )
					slist_cursor = slist_rooms.length - 1;

			}

			break;

		case K_DOWNARROW:
			if ( slist_rooms.length > 0 ) {

				if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
				slist_cursor ++;
				if ( slist_cursor >= slist_rooms.length )
					slist_cursor = 0;

			}

			break;

		case K_ENTER:
			if ( slist_rooms.length > 0 && slist_cursor < slist_rooms.length ) {

				const room = slist_rooms[ slist_cursor ];

				// Don't allow joining full rooms
				if ( room.playerCount >= room.maxPlayers ) {

					if ( _S_LocalSound ) _S_LocalSound( 'misc/menu2.wav' );
					m_return_reason = 'Room is full (' + room.playerCount + '/' + room.maxPlayers + ' players)';
					break;

				}

				// Join selected room
				m_entersound = true;

				const params = new URLSearchParams( window.location.search );
				const serverUrl = params.get( 'server' ) || DEFAULT_WT_SERVER;

				// Always join through the lobby using room ID.
				// This avoids connecting to stale room-port data from an old room list.
				const urlObj = new URL( serverUrl.replace( /^wt(s)?:\/\//, 'https://' ) );
				urlObj.searchParams.set( 'room', room.id );
				const connectUrl = urlObj.toString().replace( /\/$/, '' ).replace( /^https:\/\//, 'wts://' );

				// Update browser URL so user can share it
				const shareUrl = window.location.origin + window.location.pathname + '?room=' + room.id;
				history.replaceState( null, '', shareUrl );

				// Set up error return
				m_return_state = m_state;
				m_return_onerror = true;

				// Close menu and connect
				setKeyDest( key_game );
				m_state = m_none;
				Cbuf_AddText( 'connect "' + connectUrl + '"\n' );

			}

			break;

		case 32: // SPACE - refresh
			M_FetchRooms();
			break;

	}

}

/*
==============================================================================

			GAME OPTIONS MENU (New Game / Host)

==============================================================================
*/

function M_Menu_GameOptions_f() {

	setKeyDest( key_menu );
	m_state = m_gameoptions;
	m_entersound = true;

	if ( maxplayers === 0 )
		maxplayers = svs.maxclients || 4;
	if ( maxplayers < 2 )
		maxplayers = 4;

}

function M_GameOptions_Draw() {

	if ( ! _Draw_CachePic ) return;

	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/p_multi.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );

	// Begin game button
	M_DrawTextBox( 152, 32, 10, 1 );
	M_Print( 160, 40, 'begin game' );

	// Max players
	M_Print( 0, 56, '      Max players' );
	M_Print( 160, 56, String( maxplayers ) );

	// Game type
	M_Print( 0, 64, '        Game Type' );
	if ( coop.value )
		M_Print( 160, 64, 'Cooperative' );
	else
		M_Print( 160, 64, 'Deathmatch' );

	// Teamplay
	M_Print( 0, 72, '         Teamplay' );
	let teamplayMsg;
	switch ( Math.floor( teamplay.value ) ) {

		case 1: teamplayMsg = 'No Friendly Fire'; break;
		case 2: teamplayMsg = 'Friendly Fire'; break;
		default: teamplayMsg = 'Off'; break;

	}

	M_Print( 160, 72, teamplayMsg );

	// Skill
	M_Print( 0, 80, '            Skill' );
	let skillMsg;
	if ( skill.value === 0 )
		skillMsg = 'Easy difficulty';
	else if ( skill.value === 1 )
		skillMsg = 'Normal difficulty';
	else if ( skill.value === 2 )
		skillMsg = 'Hard difficulty';
	else
		skillMsg = 'Nightmare difficulty';
	M_Print( 160, 80, skillMsg );

	// Episode
	M_Print( 0, 104, '         Episode' );
	M_Print( 160, 104, episodes[ startepisode ].description );

	// Level
	M_Print( 0, 112, '           Level' );
	const levelIdx = episodes[ startepisode ].firstLevel + startlevel;
	M_Print( 160, 112, levels[ levelIdx ].description );
	M_Print( 160, 120, levels[ levelIdx ].name );

	// Cursor
	M_DrawCharacter( 144, gameoptions_cursor_table[ gameoptions_cursor ], 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

}

function M_NetStart_Change( dir ) {

	switch ( gameoptions_cursor ) {

		case 1: // Max players
			maxplayers += dir;
			if ( maxplayers > 4 )
				maxplayers = 4;
			if ( maxplayers < 2 )
				maxplayers = 2;
			break;

		case 2: // Game type (coop/deathmatch)
			Cvar_SetValue( 'coop', coop.value ? 0 : 1 );
			break;

		case 3: // Teamplay
			Cvar_SetValue( 'teamplay', teamplay.value + dir );
			if ( teamplay.value > 2 )
				Cvar_SetValue( 'teamplay', 0 );
			else if ( teamplay.value < 0 )
				Cvar_SetValue( 'teamplay', 2 );
			break;

		case 4: // Skill
			Cvar_SetValue( 'skill', skill.value + dir );
			if ( skill.value > 3 )
				Cvar_SetValue( 'skill', 0 );
			if ( skill.value < 0 )
				Cvar_SetValue( 'skill', 3 );
			break;

		case 5: // Episode
			startepisode += dir;

			// Limit to available episodes (7 for registered, 2 for shareware)
			const numEpisodes = 3; // Welcome, Episode 1, Deathmatch
			if ( startepisode < 0 )
				startepisode = numEpisodes - 1;
			if ( startepisode >= numEpisodes )
				startepisode = 0;

			startlevel = 0;
			break;

		case 6: // Level
			startlevel += dir;
			const count = episodes[ startepisode ].levels;
			if ( startlevel < 0 )
				startlevel = count - 1;
			if ( startlevel >= count )
				startlevel = 0;
			break;

	}

}

function M_GameOptions_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_MultiPlayer_f();
			break;

		case K_UPARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			gameoptions_cursor --;
			if ( gameoptions_cursor < 0 )
				gameoptions_cursor = NUM_GAMEOPTIONS - 1;
			break;

		case K_DOWNARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			gameoptions_cursor ++;
			if ( gameoptions_cursor >= NUM_GAMEOPTIONS )
				gameoptions_cursor = 0;
			break;

		case K_LEFTARROW:
			if ( gameoptions_cursor === 0 )
				break;
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu3.wav' );
			M_NetStart_Change( - 1 );
			break;

		case K_RIGHTARROW:
			if ( gameoptions_cursor === 0 )
				break;
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu3.wav' );
			M_NetStart_Change( 1 );
			break;

		case K_ENTER:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu2.wav' );
			if ( gameoptions_cursor === 0 ) {

				// Begin game - create room on server first
				const levelIdx = episodes[ startepisode ].firstLevel + startlevel;
				const mapName = levels[ levelIdx ].name;

				// Create room on WebTransport server and connect as client
				if ( _WT_CreateRoom ) {

					// Check if WebTransport is available before attempting
					if ( typeof WebTransport === 'undefined' ) {

						alert( 'Multiplayer requires a browser with WebTransport support (Chrome 97+, Edge 97+, Firefox 114+, or Opera 83+).' );
						M_Menu_Main_f();
						return;

					}

					const params = new URLSearchParams( window.location.search );
					const serverUrl = params.get( 'server' ) || DEFAULT_WT_SERVER;

					if ( _SCR_BeginLoadingPlaque ) _SCR_BeginLoadingPlaque();

					_WT_CreateRoom( serverUrl, {
						map: mapName,
						maxPlayers: maxplayers,
						hostName: _cl_name ? _cl_name.string : 'Player'
					} ).then( ( room ) => {

						if ( room != null && typeof room.id === 'string' && room.id.length > 0 ) {

							let roomInfo = room.id;
							if ( room.port != null ) {

								roomInfo += ' on port ' + room.port;

							}

							Con_Printf( 'Room created: ' + roomInfo + '\n' );
							// Update browser URL so user can share it
							const shareUrl = window.location.origin + window.location.pathname + '?room=' + room.id;
							history.replaceState( null, '', shareUrl );

							// Dismiss the menu before connecting (like original Quake)
							setKeyDest( key_game );
							m_state = m_none;

							// Connect to the remote server as a client (not local game)
							// The remote server is the authoritative game server
							let connectUrl;
							if ( room.port != null ) {

								// Connect directly to room server on its port
								const urlObj = new URL( serverUrl.replace( /^wt(s)?:\/\//, 'https://' ) );
								urlObj.port = String( room.port );
								// Remove trailing slash - URL.toString() adds one which breaks wts:// URLs
								connectUrl = urlObj.toString().replace( /\/$/, '' ).replace( /^https:\/\//, 'wts://' );

							} else {

								// Fallback: connect through lobby
								connectUrl = serverUrl + '?room=' + room.id;

							}

							Cbuf_AddText( 'connect "' + connectUrl + '"\n' );
							return;

						}

						Con_Printf( 'Failed to create room: Invalid room response from server\n' );
						if ( _SCR_EndLoadingPlaque ) _SCR_EndLoadingPlaque();

					} ).catch( ( e ) => {

						Con_Printf( 'Failed to create room: ' + e.message + '\n' );
						if ( _SCR_EndLoadingPlaque ) _SCR_EndLoadingPlaque();

					} );

					return;

				}

				// Fallback: no WebTransport - start local game
				if ( _sv.active )
					Cbuf_AddText( 'disconnect\n' );

				Cbuf_AddText( 'listen 0\n' );
				Cbuf_AddText( 'maxplayers ' + maxplayers + '\n' );

				if ( _SCR_BeginLoadingPlaque ) _SCR_BeginLoadingPlaque();

				Cbuf_AddText( 'map ' + mapName + '\n' );
				return;

			}

			M_NetStart_Change( 1 );
			break;

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
	m_state = m_options;
	m_entersound = true;

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
			m_entersound = true;
			switch ( OPTIONS_ORDER[ m_options_cursor ] ) {

				case 0:
					M_Menu_Keys_f();
					break;
				case 1:
					m_state = m_none;
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
					m_state = m_none;
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
	m_state = m_newer;
	m_entersound = true;

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
	m_state = m_keys;
	m_entersound = true;

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

			SETUP MENU

==============================================================================
*/

let setup_cursor = 3;
const setup_cursor_table = [ 40, 64, 88, 124 ];
let setup_myname = 'player';
let setup_oldtop = 0;
let setup_oldbottom = 0;
let setup_top = 0;
let setup_bottom = 0;
const NUM_SETUP_CMDS = 4;

function M_Menu_Setup_f() {

	setKeyDest( key_menu );
	m_state = m_setup;
	m_entersound = true;

	// Initialize from current values
	setup_myname = _cl_name ? _cl_name.string : 'player';
	setup_top = setup_oldtop = ( cl_color.value | 0 ) >> 4;
	setup_bottom = setup_oldbottom = ( cl_color.value | 0 ) & 15;

}

function M_Setup_Draw() {

	if ( ! _Draw_CachePic ) return;

	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/p_multi.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );

	M_Print( 64, 40, 'Your name' );
	M_DrawTextBox( 160, 32, 16, 1 );
	M_Print( 168, 40, setup_myname );

	M_Print( 64, 64, 'Shirt color' );
	M_Print( 64, 88, 'Pants color' );

	M_DrawTextBox( 64, 116, 14, 1 );
	M_Print( 72, 124, 'Accept Changes' );

	// Draw player color preview (bigbox + menuplyr with color translation)
	const bigbox = _Draw_CachePic( 'gfx/bigbox.lmp' );
	M_DrawTransPic( 160, 48, bigbox );
	const menuplyr = _Draw_CachePic( 'gfx/menuplyr.lmp' );
	M_BuildTranslationTable( setup_top * 16, setup_bottom * 16 );
	M_DrawTransPicTranslate( 172, 56, menuplyr );

	M_DrawCharacter( 56, setup_cursor_table[ setup_cursor ], 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

	// Draw blinking cursor on text field
	if ( setup_cursor === 0 )
		M_DrawCharacter( 168 + 8 * setup_myname.length, setup_cursor_table[ setup_cursor ], 10 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

}

function M_Setup_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_MultiPlayer_f();
			break;
		case K_UPARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			setup_cursor --;
			if ( setup_cursor < 0 )
				setup_cursor = NUM_SETUP_CMDS - 1;
			break;
		case K_DOWNARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			setup_cursor ++;
			if ( setup_cursor >= NUM_SETUP_CMDS )
				setup_cursor = 0;
			break;
		case K_LEFTARROW:
			if ( setup_cursor < 1 )
				return;
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu3.wav' );
			if ( setup_cursor === 1 )
				setup_top = setup_top - 1;
			if ( setup_cursor === 2 )
				setup_bottom = setup_bottom - 1;
			break;
		case K_RIGHTARROW:
			if ( setup_cursor < 1 )
				return;
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu3.wav' );
			if ( setup_cursor === 1 )
				setup_top = setup_top + 1;
			if ( setup_cursor === 2 )
				setup_bottom = setup_bottom + 1;
			break;
		case K_ENTER:
			if ( setup_cursor === 0 )
				return;

			if ( setup_cursor === 1 || setup_cursor === 2 ) {

				// ENTER on color items acts as RIGHT arrow (goto forward in C)
				if ( _S_LocalSound ) _S_LocalSound( 'misc/menu3.wav' );
				if ( setup_cursor === 1 )
					setup_top = setup_top + 1;
				if ( setup_cursor === 2 )
					setup_bottom = setup_bottom + 1;
				break;

			}

			// setup_cursor == 3 (Accept)
			Cbuf_AddText( 'name "' + setup_myname + '"\n' );
			if ( setup_top !== setup_oldtop || setup_bottom !== setup_oldbottom )
				Cbuf_AddText( 'color ' + setup_top + ' ' + setup_bottom + '\n' );
			m_entersound = true;
			M_Menu_MultiPlayer_f();

			break;

		case K_BACKSPACE:
			if ( setup_cursor === 0 ) {

				if ( setup_myname.length > 0 )
					setup_myname = setup_myname.substring( 0, setup_myname.length - 1 );

			}

			break;

		default:
			// Character input for text fields
			if ( key < 32 || key > 127 )
				break;

			if ( setup_cursor === 0 ) {

				if ( setup_myname.length < 15 )
					setup_myname = setup_myname + String.fromCharCode( key );

			}

			break;

	}

	if ( setup_top > 13 )
		setup_top = 0;
	if ( setup_top < 0 )
		setup_top = 13;
	if ( setup_bottom > 13 )
		setup_bottom = 0;
	if ( setup_bottom < 0 )
		setup_bottom = 13;

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
const CREDITS_HEIGHT = 272;
const CREDITS_SCALE = .75; // 25% smaller in both dimensions; preserve all native content.
const CREDITS_TOP = ( 200 - CREDITS_HEIGHT ) / 2; // centre the expanded box in the usual menu space

function M_OpenCreditsSource() {

	if ( typeof window !== 'undefined' )
		window.open( CREDITS_SOURCE_URL, '_blank' );

}

function M_Menu_Credits_f() {

	setKeyDest( key_menu );
	m_state = m_credits;
	m_entersound = true;

}

function M_Credits_Draw() {

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

function M_Credits_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Menu_Main_f();
			break;
		case K_ENTER:
			M_OpenCreditsSource();
			break;

	}

}

function M_Credits_Touch( vx, vy ) {

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

function M_Menu_Quit_f() {

	setKeyDest( key_menu );
	m_state = m_quit;
	m_entersound = true;

}

function M_Quit_Draw() {

	M_DrawTextBox( 56, 76, 24, 4 );
	M_Print( 64, 84, '  Are you sure you want' );
	M_Print( 64, 92, '  to quit? (Y/N)' );

}

function M_Quit_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
		case 110: // 'n'
		case 78: // 'N'
			M_Menu_Main_f();
			break;

		case 121: // 'y'
		case 89: // 'Y'
			// Navigate to the project page
			window.open( 'https://github.com/codemeasandwich/Quaked', '_blank' );
			M_Menu_Main_f();
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
	m_state = m_video;
	m_entersound = true;

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

		m_recursiveDraw = false;

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
		m_entersound = false;

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
			M_SplitScreen_Key( K_ESCAPE );
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

// Main menu touch - items at y=32, 20px spacing
function M_Main_Touch( vx, vy ) {

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
function M_SinglePlayer_Touch( vx, vy ) {

	if ( vy >= 32 && vy < 32 + SINGLEPLAYER_ITEMS * 20 ) {

		const item = Math.floor( ( vy - 32 ) / 20 );
		if ( item >= 0 && item < SINGLEPLAYER_ITEMS ) {

			m_singleplayer_cursor = item;
			M_SinglePlayer_Key( K_ENTER );

		}

	}

}

// Load/Save menu touch - items at y=32, 8px spacing
function M_LoadSave_Touch( vx, vy ) {

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

// Multiplayer menu touch
function M_MultiPlayer_Touch( vx, vy ) {

	if ( vy >= 32 && vy < 32 + MULTIPLAYER_ITEMS * 20 ) {

		const item = Math.floor( ( vy - 32 ) / 20 );
		if ( item >= 0 && item < MULTIPLAYER_ITEMS ) {

			m_multiplayer_cursor = item;
			M_MultiPlayer_Key( K_ENTER );

		}

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

// Quit menu touch - tap top half for yes, bottom half for no
function M_Quit_Touch( vx, vy ) {

	if ( vy < 100 ) {

		M_Quit_Key( 121 ); // 'y'

	} else {

		M_Quit_Key( 110 ); // 'n'

	}

}

// LAN Config touch - handle room list selection
function M_LanConfig_Touch( vx, vy ) {

	// Room list starts at y=52 with 12px spacing
	if ( slist_rooms.length > 0 && vy >= 52 && vy < 52 + slist_rooms.length * 12 ) {

		const item = Math.floor( ( vy - 52 ) / 12 );
		if ( item >= 0 && item < slist_rooms.length ) {

			slist_cursor = item;
			M_LanConfig_Key( K_ENTER );

		}

	}

}

// Game Options touch - handle all options
function M_GameOptions_Touch( vx, vy ) {

	// Find which row was touched based on cursor table
	for ( let i = 0; i < NUM_GAMEOPTIONS; i ++ ) {

		if ( vy >= gameoptions_cursor_table[ i ] - 4 && vy < gameoptions_cursor_table[ i ] + 12 ) {

			gameoptions_cursor = i;
			M_GameOptions_Key( K_ENTER );
			return;

		}

	}

}
