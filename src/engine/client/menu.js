/**
 * @module engine/client/menu
 *
 * The native menu (WinQuake menu.c) and the Newer Game options: main, single player, multiplayer rooms, options,
 * features, cheats, saves.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `lanConfig_cursor`, `lanConfig_joinname`, `slist_rooms`,
 * `slist_cursor`, `slist_fetching`, `slist_error`, `gameoptions_cursor`, `maxplayers`, `startepisode`, `startlevel`,
 * `m_levelselect_cursor`, `m_levelselect_newer` and 18 more.
 *
 * Errors: throws at 1 place; catches at 2 places.
 *
 * Engine callbacks are injected with `M_SetExternals`.
 */
// Ported from: WinQuake/menu.c, WinQuake/menu.h -- menu system

import { MainMenu_Begin, MainMenu_End, MainMenu_SetVisible, MainMenu_Skinned, MainMenu_Slider } from '../common/hooks.js'; // installed by newer/ui/menu_webgl.js
import { R_BestiaryBookDraw, R_BestiaryBookTouch, R_BestiaryBookCorner } from '../common/hooks.js'; // installed by newer/ui/r_bestiary_book.js
import { R_FlashlightToggle } from '../common/hooks.js'; // installed by newer/render/r_flashlight.js
import { R_DemoLoadingConsoleOverride, R_WelcomeLoadingHolding } from '../common/hooks.js'; // installed by newer/ui/r_demoloading.js
import { Draw_StudioLogo } from '../common/hooks.js'; // installed by newer/ui/studio_logo.js
import { R_DemoSplitActive, R_DemoSplitRelease } from '../common/hooks.js'; // installed by newer/render/r_demosplit.js
import { Cbuf_AddText } from '../common/cmd.js';
import { Cmd_AddCommand } from '../common/cmd.js';
import { Con_Printf, Con_ToggleConsole_f } from '../common/console.js';
import { K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, K_BACKSPACE, K_DEL, key_game, key_console, key_menu, keybindings, Key_SetBinding, Key_KeynumToString } from './keys.js';
import { cl_forwardspeed } from './cl_input.js';
import { sensitivity, m_pitch, lookspring, lookstrafe, cl_color } from './cl_main.js';
import { volume, bgmvolume } from '../sound/sound.js';
import { Cvar_SetValue, Cvar_VariableValue } from '../common/cvar.js';
import { scr_viewsize, scr_con_current } from '../render/gl_screen.js';
import { v_gamma } from './view.js';
import { gl_texturemode, GL_UpdateTextureFiltering } from '../render/glquake.js';
import { skill, coop, teamplay, svs } from '../server/server.js';
import { Draw_GetUIScale, Draw_WithVirtualSize } from '../render/gl_draw.js';
import { COM_FindFile } from '../common/pak.js';
import { hipnotic, rogue } from '../common/common.js'; // the mission pack running (COM_InitArgv), for Level Select
import { GameSelection_Running } from '../common/game_selection.js';
import { LocalPlay_PlayerWindow, LocalPlay_Hosting, LocalPlay_Players, LocalPlay_NextPlayer, LocalPlay_OpenPlayer, LocalPlay_Start, LocalPlay_End,
	LocalPlay_PlayerCommands, LOCAL_PLAYERS_MIN, LOCAL_PLAYERS_MAX, LOCAL_MODES } from './local_play.js';
import { m_none, m_main, m_singleplayer, m_load, m_save, m_multiplayer, m_setup, m_options, m_video, m_keys, m_quit, m_lanconfig, m_gameoptions, m_credits, m_newer, m_levelselect, m_bestiary, m_cheats, m_mpchoice, m_splitscreen, m_state, m_entersound, m_recursiveDraw, m_return_state, m_return_onerror, m_return_reason, set_m_state, set_m_entersound, set_m_recursiveDraw, set_m_return_state, set_m_return_onerror, set_m_return_reason, menuOpeners, _WT_QueryRooms, _WT_CreateRoom, _cl_name, levels, episodes, _sv, _svs, _realVid, _vid, _host_time_get, _realtime_get, _Draw_CachePic, _Draw_Fill, _Draw_FadeScreen, _Draw_ConsoleBackground, _S_LocalSound, _SCR_BeginLoadingPlaque, _SCR_EndLoadingPlaque, _IN_RequestPointerLock, getKeyDest, setKeyDest, M_DrawCharacter, M_Print, M_PrintWhite, M_PrintFaded, M_DrawTransPic, M_DrawPic, M_DrawTransPicTranslate, M_DrawTextBox, M_BuildTranslationTable, NEWER_DEFAULT_GAMMA, newerDefaults } from './menu_common.js';
import { M_Menu_Main_f, M_Main_Draw, M_Main_Key, M_Menu_Bestiary_f, M_Bestiary_Key, M_Menu_SinglePlayer_f, M_SinglePlayer_Draw, M_SinglePlayer_Key, M_Menu_Load_f, M_Menu_Save_f, M_Load_Draw, M_Save_Draw, M_Load_Key, M_Save_Key, CREDITS_HEIGHT, CREDITS_SCALE, CREDITS_TOP, M_Menu_Credits_f, M_Credits_Draw, M_Credits_Key, M_Credits_Touch, M_Menu_Quit_f, M_Quit_Draw, M_Quit_Key, M_Main_Touch, M_SinglePlayer_Touch, M_LoadSave_Touch, M_Quit_Touch } from './menu_main.js';
export { M_Menu_Main_f, M_Menu_Bestiary_f } from './menu_main.js';
export { m_none, m_main, m_singleplayer, m_load, m_save, m_multiplayer, m_setup, m_net, m_options, m_video, m_keys, m_help, m_quit, m_serialconfig, m_modemconfig, m_lanconfig, m_gameoptions, m_search, m_slist, m_credits, m_newer, m_levelselect, m_bestiary, m_cheats, m_mpchoice, m_splitscreen, m_state, m_entersound, set_m_state, set_m_entersound, set_m_recursiveDraw, set_m_return_state, set_m_return_onerror, set_m_return_reason, set_m_save_demonum, menuOpeners, M_SetExternals, M_DrawPic_export } from './menu_common.js';

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

	set_m_return_reason( reason || 'Connection failed' );

	if ( m_return_onerror ) {

		// Return to the menu we came from
		set_m_state( m_return_state );
		set_m_return_onerror( false );

	} else {

		// Fall back to Multiplayer menu (for URL-based joins that bypass menu)
		set_m_state( m_multiplayer );

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
// The mission packs' own maps (WinQuake menu.c's hipnoticlevels/hipnoticepisodes and roguelevels/rogueepisodes; card
// [34c]): a mission pack offers these instead of Quake's, though Quake's pack is mounted under it
const MISSION_LEVEL_SELECT = Object.freeze( {
	hipnotic: {
		episodes: [ { episode: 0, name: 'Command HQ' }, { episode: 1, name: 'H1 Fortress' }, { episode: 2, name: 'H2 Dominion' },
			{ episode: 3, name: 'H3 The Rift' }, { episode: 4, name: 'Final Level' }, { episode: 5, name: 'Deathmatch Arena' } ],
		levels: [ [ 0, 'start', 'Command HQ' ],
			[ 1, 'hip1m1', 'The Pumping Station' ], [ 1, 'hip1m2', 'Storage Facility' ], [ 1, 'hip1m3', 'The Lost Mine' ], [ 1, 'hip1m4', 'Research Facility' ], [ 1, 'hip1m5', 'Military Complex' ],
			[ 2, 'hip2m1', 'Ancient Realms' ], [ 2, 'hip2m2', 'The Black Cathedral' ], [ 2, 'hip2m3', 'The Catacombs' ], [ 2, 'hip2m4', 'The Crypt' ], [ 2, 'hip2m5', 'Mortum\'s Keep' ], [ 2, 'hip2m6', 'The Gremlin\'s Domain' ],
			[ 3, 'hip3m1', 'Tur Torment' ], [ 3, 'hip3m2', 'Pandemonium' ], [ 3, 'hip3m3', 'Limbo' ], [ 3, 'hip3m4', 'The Gauntlet' ],
			[ 4, 'hipend', 'Armagon\'s Lair' ], [ 5, 'hipdm1', 'The Edge of Oblivion' ] ]
	},
	// Dimension of the Past (card [34c]): the names are each map's own (its worldspawn message)
	dopa: {
		episodes: [ { episode: 0, name: 'Introduction' }, { episode: 1, name: 'E5 Past' }, { episode: 2, name: 'Secret Levels' }, { episode: 3, name: 'Final Level' }, { episode: 4, name: 'Deathmatch Arena' } ],
		levels: [ [ 0, 'start', 'Dimension of the Past' ],
			[ 1, 'e5m1', 'The Military Base' ], [ 1, 'e5m2', 'The Power Supply' ], [ 1, 'e5m3', 'The Dark Days' ], [ 1, 'e5m4', 'The Catacombs' ], [ 1, 'e5m5', 'The Stronghold' ], [ 1, 'e5m6', 'The Underworld' ], [ 1, 'e5m7', 'The Otherworld' ],
			[ 2, 'e5sm1', 'The Forgotten Castle' ], [ 2, 'e5sm2', 'The House of Doom' ],
			[ 3, 'e5end', 'The Year Zero' ], [ 4, 'e5dm', 'The Theater of Doom' ] ]
	},
	// Dimension of the Machine (card [34f]): the names are each map's own (its worldspawn message)
	mg1: {
		episodes: [ { episode: 0, name: 'The Gateway' }, { episode: 1, name: 'The Hub' }, { episode: 2, name: 'Dimensions' }, { episode: 3, name: 'Final Level' }, { episode: 4, name: 'Deathmatch Arena' } ],
		levels: [ [ 0, 'start', 'The Gateway' ], [ 1, 'hub', 'The Machine' ],
			[ 2, 'mge1m1', 'The Pain Drain' ], [ 2, 'mge1m2', 'The Wishing Well' ], [ 2, 'mge1m3', 'Sandy\'s Room' ],
			[ 2, 'mge2m1', 'Acid Sanctuary' ], [ 2, 'mge2m2', 'Fading Embers' ], [ 2, 'mge3m1', 'Down the Waste' ], [ 2, 'mge3m2', 'Hell or Dark Water' ],
			[ 2, 'mge4m1', 'Grave Machine' ], [ 2, 'mge4m2', 'A Grave Mistake' ], [ 2, 'mge5m1', 'Nazard Terminal' ], [ 2, 'mge5m2', 'Too Deep, Too Greedy' ],
			[ 3, 'mgend', 'Chthon\'s Vengeance' ],
			[ 4, 'mgdm1', 'Art of the Condemned' ], [ 4, 'mgdm2', 'The Bad Space' ], [ 4, 'mgdm3', 'The Mustard Factory' ], [ 4, 'mgdm4', 'The Boiler' ] ]
	},
	rogue: {
		episodes: [ { episode: 0, name: 'Introduction' }, { episode: 1, name: 'R1 Fortress' }, { episode: 2, name: 'R2 Corridors' }, { episode: 3, name: 'Deathmatch Arena' } ],
		levels: [ [ 0, 'start', 'Split Decision' ],
			[ 1, 'r1m1', 'Deviant\'s Domain' ], [ 1, 'r1m2', 'Dread Portal' ], [ 1, 'r1m3', 'Judgement Call' ], [ 1, 'r1m4', 'Cave of Death' ], [ 1, 'r1m5', 'Towers of Wrath' ], [ 1, 'r1m6', 'Temple of Pain' ], [ 1, 'r1m7', 'Tomb of the Overlord' ],
			[ 2, 'r2m1', 'Tempus Fugit' ], [ 2, 'r2m2', 'Elemental Fury I' ], [ 2, 'r2m3', 'Elemental Fury II' ], [ 2, 'r2m4', 'Curse of Osiris' ], [ 2, 'r2m5', 'Wizard\'s Keep' ], [ 2, 'r2m6', 'Blood Sacrifice' ], [ 2, 'r2m7', 'Last Bastion' ], [ 2, 'r2m8', 'Source of Evil' ],
			[ 3, 'ctf1', 'Division of Change' ] ]
	}
} );

// the tables for the game running: a mission pack's, else Quake's
function levelSelectTable() {

	const mission = hipnotic ? MISSION_LEVEL_SELECT.hipnotic : rogue ? MISSION_LEVEL_SELECT.rogue : MISSION_LEVEL_SELECT[ GameSelection_Running() ] ?? null;
	if ( mission === null ) return { levels: LEVEL_SELECT_LEVELS, episodes: LEVEL_SELECT_EPISODES };
	return { levels: mission.levels.map( ( [ episode, map, name ] ) => ( { episode, map, name } ) ), episodes: mission.episodes };

}

const SKILL_NAMES = [ 'Easy', 'Normal', 'Hard', 'Nightmare' ];
const LEVELSELECT_ROWS = 3; // mode, skill and episode come before the levels
const LEVELSELECT_LEVEL_Y = 84, LEVELSELECT_ROW_Y = 48;
let m_levelselect_cursor = LEVELSELECT_ROWS;
let m_levelselect_newer = true;
let m_levelselect_episode = 1;

const levelAvailable = ( l ) => COM_FindFile( 'maps/' + l.map + '.bsp' ) !== null;

// the episodes this copy of the game has at least one map of
function levelSelectEpisodes() {

	const { levels, episodes } = levelSelectTable();
	return episodes.filter( ( e ) => levels.some( ( l ) => l.episode === e.episode && levelAvailable( l ) ) );

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
	return levelSelectTable().levels.filter( ( l ) => l.episode === episode && levelAvailable( l ) );

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
	set_m_state( m_levelselect );
	set_m_entersound( true );
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
	M_PrintWhite( 184, 64, ( levelSelectTable().episodes.find( ( e ) => e.episode === episode ) || { name: '' } ).name );

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

	set_m_entersound( true );
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
	set_m_state( m_mpchoice );
	set_m_entersound( true );
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
			set_m_entersound( true );
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

			LOCAL PLAY (cards [37a]-[37c]): each other player in a window of their own

==============================================================================
*/

// Owner direction (10 Oct 2026): starting local play opens another browser window per player, which can be dragged
// to another screen. Player 1's page hosts (local_play.js); this screen sets it up, adds players' windows while it
// runs, and ends it. In a player's own window it says which player that window is, and leaves.
let localplay_players = LOCAL_PLAYERS_MIN, localplay_mode = 0, localplay_cursor = 0;

function M_Menu_SplitScreen_f() {

	setKeyDest( key_menu );
	set_m_state( m_splitscreen );
	set_m_entersound( true );
	localplay_cursor = 0;

}

// this window's role: a player's window (from its address), the host, or neither yet
function localPlayRole() {

	const role = typeof window !== 'undefined' ? LocalPlay_PlayerWindow( window.location?.search ) : null;
	if ( role ) return { kind: 'player', player: role.player };
	return { kind: LocalPlay_Hosting() ? 'host' : 'setup' };

}

// the rows the cursor can be on: { y, label, value?, enabled, enter?, change? }
function localPlayRows( role ) {

	if ( role.kind === 'player' ) return [ { y: 104, label: 'Leave local play', enabled: true, enter: () => { Cbuf_AddText( 'disconnect\n' ); if ( typeof window !== 'undefined' ) window.close(); } } ];
	if ( role.kind === 'host' ) {

		const next = LocalPlay_NextPlayer();
		return [
			{ y: 40, label: next === null ? 'Every player is in' : 'Open player ' + next + '\'s window', enabled: next !== null, enter: () => { LocalPlay_OpenPlayer( next ); M_Menu_SplitScreen_f(); } },
			{ y: 56, label: 'End local play', enabled: true, enter: () => { LocalPlay_End( Cbuf_AddText ); M_Menu_Main_f(); } }
		];

	}
	return [
		{ y: 40, label: 'Start local play', enabled: true, enter: () => {

			setKeyDest( key_game );
			if ( _IN_RequestPointerLock ) _IN_RequestPointerLock();
			Cbuf_AddText( 'r_hdr 1\n' + newerDefaults() ); // local play is Newer Game
			R_DemoSplitRelease( true );
			LocalPlay_Start( { players: localplay_players, mode: LOCAL_MODES[ localplay_mode ] }, Cbuf_AddText );
			set_m_state( m_none );

		} },
		{ y: 56, label: '          Players', value: String( localplay_players ), enabled: true, change: d => { localplay_players = Math.min( LOCAL_PLAYERS_MAX, Math.max( LOCAL_PLAYERS_MIN, localplay_players + d ) ); } },
		{ y: 64, label: '        Game Type', value: localplay_mode === 0 ? 'Cooperative' : 'Deathmatch', enabled: true, change: d => { localplay_mode = ( localplay_mode + LOCAL_MODES.length + d ) % LOCAL_MODES.length; } }
	];

}

function M_SplitScreen_Draw() {

	if ( ! _Draw_CachePic ) return;
	M_DrawTransPic( 16, 4, _Draw_CachePic( 'gfx/qplaque.lmp' ) );
	const p = _Draw_CachePic( 'gfx/p_multi.lmp' );
	M_DrawPic( ( 320 - ( p ? p.width : 0 ) ) / 2, 4, p );
	const role = localPlayRole(), rows = localPlayRows( role );
	if ( role.kind === 'player' ) {

		M_DrawTextBox( 48, 52, 25, 3 );
		M_Print( 64, 60, 'This window is Player ' + role.player );
		M_PrintWhite( 64, 68, 'in local play. Player 1' );
		M_PrintWhite( 64, 76, 'hosts the game.' );

	} else if ( role.kind === 'host' ) {

		M_PrintWhite( 72, 80, 'Playing: Player 1 (you)' );
		LocalPlay_Players().forEach( ( player, i ) => M_PrintWhite( 72 + 9 * 8, 88 + i * 8, player.name ) );

	} else {

		M_PrintWhite( 72, 88, 'Each other player gets a' );
		M_PrintWhite( 72, 96, 'window of their own: drag' );
		M_PrintWhite( 72, 104, 'it to another screen.' );
		M_PrintWhite( 72, 120, 'Allow pop-ups if asked.' );

	}
	for ( const row of rows ) {

		if ( row.value === undefined && role.kind === 'setup' ) { M_DrawTextBox( 152, row.y - 8, 16, 1 ); M_Print( 160, row.y, row.label ); continue; }
		if ( row.value !== undefined ) { M_Print( 0, row.y, row.label ); M_Print( 160, row.y, row.value ); continue; }
		( row.enabled ? M_Print : M_PrintFaded )( 160, row.y, row.label );

	}
	if ( rows.length > 0 ) {

		localplay_cursor = Math.min( localplay_cursor, rows.length - 1 );
		M_DrawCharacter( 144, rows[ localplay_cursor ].y, 12 + ( ( Math.floor( _realtime_get() * 4 ) ) & 1 ) );

	}

}

function M_SplitScreen_Key( key ) {

	const rows = localPlayRows( localPlayRole() );
	localplay_cursor = Math.min( localplay_cursor, rows.length - 1 );
	const row = rows[ localplay_cursor ];
	switch ( key ) {

		case K_ESCAPE:
			M_Menu_MultiplayerChoice_f();
			break;
		case K_UPARROW:
		case K_DOWNARROW:
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu1.wav' );
			localplay_cursor = ( localplay_cursor + ( key === K_DOWNARROW ? 1 : rows.length - 1 ) ) % rows.length;
			break;
		case K_LEFTARROW:
		case K_RIGHTARROW:
			if ( ! row?.change ) break;
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu3.wav' );
			row.change( key === K_RIGHTARROW ? 1 : - 1 );
			break;
		case K_ENTER:
			if ( ! row?.enabled ) break;
			if ( _S_LocalSound ) _S_LocalSound( 'misc/menu2.wav' );
			if ( row.change ) row.change( 1 ); else row.enter();
			break;

	}

}

// a tap or click on a row moves the cursor there and presses Enter on it
function M_SplitScreen_Touch( vx, vy ) {

	const rows = localPlayRows( localPlayRole() );
	const i = rows.findIndex( row => vy >= row.y && vy < row.y + 8 ); // the row's own text cell: rows can be 8 apart
	if ( i < 0 ) { if ( vy < 32 ) M_SplitScreen_Key( K_ESCAPE ); return; }
	localplay_cursor = i;
	M_SplitScreen_Key( K_ENTER );

}

/**
 * Starts this page as a player's window in local play (card [37a]): Newer Game, the player's name and colours, then
 * the join. Called once by the page's start-up (main.js) for an address `?window=<session>&player=<n>`.
 *
 * @param {{ session: string, player: number }} role from `LocalPlay_PlayerWindow`
 */
export function M_LocalPlayerJoin( role ) {

	R_DemoSplitRelease( true );
	Cbuf_AddText( 'r_hdr 1\n' + newerDefaults() + LocalPlay_PlayerCommands( role ) );

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
	set_m_state( m_multiplayer );
	set_m_entersound( true );
	set_m_return_reason( '' );

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
			set_m_entersound( true );
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
	set_m_state( m_lanconfig );
	set_m_entersound( true );

	slist_cursor = 0;
	set_m_return_onerror( false );
	set_m_return_reason( '' );

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
					set_m_return_reason( 'Room is full (' + room.playerCount + '/' + room.maxPlayers + ' players)' );
					break;

				}

				// Join selected room
				set_m_entersound( true );

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
				set_m_return_state( m_state );
				set_m_return_onerror( true );

				// Close menu and connect
				setKeyDest( key_game );
				set_m_state( m_none );
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
	set_m_state( m_gameoptions );
	set_m_entersound( true );

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
							set_m_state( m_none );

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
	set_m_state( m_setup );
	set_m_entersound( true );

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
			set_m_entersound( true );
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
