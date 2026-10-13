/**
 * @module engine/client/menu_levelselect
 *
 * Level select (card [44j], split from menu.js): the stock maps and each mission pack's by episode, only those this
 * copy of the game has; a skill and Classic or Newer; starting the chosen map.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `m_levelselect_cursor`, `m_levelselect_newer`,
 * `m_levelselect_episode`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Opened from single player (through `menuOpeners`); ESC returns there.
 */
import { R_DemoSplitRelease } from '../common/hooks.js'; // installed by newer/render/r_demosplit.js
import { Cbuf_AddText } from '../common/cmd.js';
import { K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, key_game, key_menu } from './keys.js';
import { Cvar_SetValue, Cvar_VariableValue } from '../common/cvar.js';
import { skill } from '../server/server.js';
import { COM_FindFile } from '../common/pak.js';
import { hipnotic, rogue } from '../common/common.js'; // the mission pack running (COM_InitArgv), for Level Select
import { GameSelection_Running } from '../common/game_selection.js';
import { m_levelselect, set_m_state, set_m_entersound, levels, episodes, _sv, _realtime_get, _Draw_CachePic, _S_LocalSound, _IN_RequestPointerLock, setKeyDest, M_DrawCharacter, M_Print, M_PrintWhite, M_DrawTransPic, M_DrawPic, newerDefaults } from './menu_common.js';
import { M_Menu_SinglePlayer_f } from './menu_main.js';

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
	// Quoth (an add-on, docs/add-ons-2026-10-13.md): runs with -hipnotic, so it is looked up by the running game first;
	// the names are each map's own (its worldspawn message); kellbase1_fan is a prop with no player start
	quoth: {
		episodes: [ { episode: 0, name: 'Introduction' }, { episode: 1, name: 'Levels' }, { episode: 2, name: 'Test Maps' } ],
		levels: [ [ 0, 'start', 'A Stranger Place Than This' ],
			[ 1, 'e1m1quoth', 'The Slipgate Triplex' ], [ 1, 'e1m2quoth', 'Remix Of The Damned' ], [ 1, 'kellbase1', 'Base Matter' ],
			[ 2, 'kelltest1', 'Slime Machine' ], [ 2, 'kelltest2', 'Birth Machine' ], [ 2, 'kelltest3', 'All The Men Of The Earth Shall Quake' ], [ 2, 'kelltest4', 'Diary of a Gug Fiend' ],
			[ 2, 'kelltest5', 'Edie And The Sentinels' ], [ 2, 'breakable', 'Break Stuff' ], [ 2, 'ne_basetest', 'Base Test' ] ]
	},
	rogue: {
		episodes: [ { episode: 0, name: 'Introduction' }, { episode: 1, name: 'R1 Fortress' }, { episode: 2, name: 'R2 Corridors' }, { episode: 3, name: 'Deathmatch Arena' } ],
		levels: [ [ 0, 'start', 'Split Decision' ],
			[ 1, 'r1m1', 'Deviant\'s Domain' ], [ 1, 'r1m2', 'Dread Portal' ], [ 1, 'r1m3', 'Judgement Call' ], [ 1, 'r1m4', 'Cave of Death' ], [ 1, 'r1m5', 'Towers of Wrath' ], [ 1, 'r1m6', 'Temple of Pain' ], [ 1, 'r1m7', 'Tomb of the Overlord' ],
			[ 2, 'r2m1', 'Tempus Fugit' ], [ 2, 'r2m2', 'Elemental Fury I' ], [ 2, 'r2m3', 'Elemental Fury II' ], [ 2, 'r2m4', 'Curse of Osiris' ], [ 2, 'r2m5', 'Wizard\'s Keep' ], [ 2, 'r2m6', 'Blood Sacrifice' ], [ 2, 'r2m7', 'Last Bastion' ], [ 2, 'r2m8', 'Source of Evil' ],
			[ 3, 'ctf1', 'Division of Change' ] ]
	}
} );

// the tables for the game running: its own (an add-on that runs with a mission pack's switch has one), else the
// mission pack's its switch names, else Quake's
function levelSelectTable() {

	const mission = MISSION_LEVEL_SELECT[ GameSelection_Running() ] ?? ( hipnotic ? MISSION_LEVEL_SELECT.hipnotic : rogue ? MISSION_LEVEL_SELECT.rogue : null );
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

/**
 * Opens Level Select (key_dest `key_menu`, `m_state` `m_levelselect`, enter sound). The single player menu opens it
 * through `menuOpeners.levelSelect`. Keeps the last cursor row, pulled back to the last level when the selected
 * episode now has fewer.
 */
export function M_Menu_LevelSelect_f() {

	setKeyDest( key_menu );
	set_m_state( m_levelselect );
	set_m_entersound( true );
	m_levelselect_cursor = Math.min( m_levelselect_cursor, LEVELSELECT_ROWS + Math.max( 0, levelSelectLevels().length - 1 ) );

}

/**
 * `M_Draw` while `m_state` is `m_levelselect`: the plaque and single player title, the Game (Newer Game / New Game),
 * Skill (the `skill` cvar, clamped to 0..3) and Episode rows, the selected episode's available maps from y 84, and
 * the blinking cursor. Draws nothing until `Draw_CachePic` is wired.
 */
export function M_LevelSelect_Draw() {

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

/**
 * `M_Keydown` on Level Select. ESC returns to single player; Up and Down move the cursor over the three option rows
 * and the levels, wrapping; Left and Right change the row under the cursor (toggle Newer / New Game, step `skill`
 * 0..3 with `Cvar_SetValue`, step the episode). Enter does the same as Right on an option row and starts the level on
 * a level row (`M_LevelSelect_Start`): the enter sound, key_dest `key_game`, a pointer-lock request, `disconnect` if a
 * server runs, `maxplayers 1`, `r_hdr 1` and the Newer defaults or `r_hdr 0`, the title demo's split released
 * (`R_DemoSplitRelease`), then `map <name>`.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_LevelSelect_Key( key ) {

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

/**
 * `M_TouchInput` on Level Select: a touch on an option row (y 48..71) moves the cursor there and changes it as Right
 * would; a touch on a level row (from y 84) moves the cursor there and starts that level as Enter does.
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_LevelSelect_Touch( vx, vy ) {

	if ( vy >= LEVELSELECT_ROW_Y && vy < LEVELSELECT_ROW_Y + LEVELSELECT_ROWS * 8 ) {

		m_levelselect_cursor = Math.floor( ( vy - LEVELSELECT_ROW_Y ) / 8 );
		M_LevelSelect_Change( 1 );

	} else if ( vy >= LEVELSELECT_LEVEL_Y && vy < LEVELSELECT_LEVEL_Y + levelSelectLevels().length * 8 ) {

		m_levelselect_cursor = LEVELSELECT_ROWS + Math.floor( ( vy - LEVELSELECT_LEVEL_Y ) / 8 );
		M_LevelSelect_Start();

	}

}
