import {Distribution_Profile} from '../../platform/distribution.js';
/**
 * @module engine/client/menu_multiplayer
 *
 * The multiplayer screens (card [44j], split from menu.js): the choice between local play and online, local play's
 * player windows, online play's rooms (join a room or create one), the game options of a new room, and the player
 * setup (name and colours); a failed connection's return to them.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `lanConfig_cursor`, `lanConfig_joinname`, `slist_rooms`,
 * `slist_cursor`, `slist_fetching`, `slist_error`, `gameoptions_cursor`, `maxplayers`, `startepisode`, `startlevel`,
 * `m_mpchoice_cursor`, `localplay_players` and 9 more.
 *
 * Errors: throws at 1 place; catches at 2 places.
 *
 * The multiplayer choice is opened from the main menu (through `menuOpeners`); ESC returns there.
 */
import { R_DemoSplitRelease } from '../common/hooks.js'; // installed by newer/render/r_demosplit.js
import { Cbuf_AddText } from '../common/cmd.js';
import { Con_Printf } from '../common/console.js';
import { K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, K_BACKSPACE, key_game, key_menu } from './keys.js';
import { cl_color } from './cl_main.js';
import { Cvar_SetValue } from '../common/cvar.js';
import { skill, coop, teamplay, svs } from '../server/server.js';
import { LocalPlay_PlayerWindow, LocalPlay_Hosting, LocalPlay_Players, LocalPlay_NextPlayer, LocalPlay_OpenPlayer, LocalPlay_Start, LocalPlay_End, LocalPlay_PlayerCommands, LOCAL_PLAYERS_MIN, LOCAL_PLAYERS_MAX, LOCAL_MODES } from './local_play.js';
import { m_none, m_multiplayer, m_setup, m_lanconfig, m_gameoptions, m_mpchoice, m_splitscreen, m_state, m_return_state, m_return_onerror, m_return_reason, set_m_state, set_m_entersound, set_m_return_state, set_m_return_onerror, set_m_return_reason, _WT_QueryRooms, _WT_CreateRoom, _cl_name, levels, episodes, _sv, _host_time_get, _realtime_get, _Draw_CachePic, _S_LocalSound, _SCR_BeginLoadingPlaque, _SCR_EndLoadingPlaque, _IN_RequestPointerLock, setKeyDest, M_DrawCharacter, M_Print, M_PrintWhite, M_PrintFaded, M_DrawTransPic, M_DrawPic, M_DrawTransPicTranslate, M_DrawTextBox, M_BuildTranslationTable, newerDefaults } from './menu_common.js';
import { M_Menu_Main_f } from './menu_main.js';

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
==============================================================================

			MULTIPLAYER CHOICE (card [MP1]): local split screen, or online

==============================================================================
*/

// Online is shown but cannot be chosen yet; the online screens below stay for joins by link and connection errors.
const MPCHOICE_ITEMS = Object.freeze( [ Object.freeze( { label: 'Local (split screen)', enabled: true } ), Object.freeze( { label: 'Online', enabled: false } ), ...(Distribution_Profile()==='desktop'?[{label:'LAN Multiplayer',enabled:true}]:[]) ] );
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

/**
 * `M_Draw` while `m_state` is `m_mpchoice`: the plaque, the Multiplayer title, Local (split screen) and the faded
 * Online item 20 pixels apart from y 32, and the spinning cursor. Nothing until `Draw_CachePic` is wired.
 */
export function M_MultiplayerChoice_Draw() {

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

/**
 * `M_Keydown` on the Multiplayer choice. ESC returns to the main menu; Up and Down move to the next item that can be
 * chosen, wrapping (so the cursor stays on Local while Online is disabled). Enter on Local opens the local play screen;
 * on a disabled item it does nothing.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_MultiplayerChoice_Key( key ) {

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
			else if(m_mpchoice_cursor===2)globalThis.__QUAKED_LAN_MENU__?.();
			break;

	}

}

/**
 * `M_TouchInput` on the Multiplayer choice: a touch on an enabled item's row (20 pixels a row from y 32) moves the
 * cursor there and chooses it, as Enter; touches on Online or elsewhere do nothing.
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_MultiplayerChoice_Touch( vx, vy ) {

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

/**
 * `M_Draw` while `m_state` is `m_splitscreen`, for this window's role: in a player's window, which player it is and
 * Leave local play; on the hosting page, the players in and Open player n's window / End local play; otherwise the
 * Start local play button, Players and Game Type, with a note on pop-ups. Clamps and draws the row cursor. Nothing
 * until `Draw_CachePic` is wired.
 */
export function M_SplitScreen_Draw() {

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

/**
 * `M_Keydown` on the local play screen. ESC returns to the Multiplayer choice; Up and Down move over the role's rows,
 * wrapping; Left and Right change Players (`LOCAL_PLAYERS_MIN`..`LOCAL_PLAYERS_MAX`) or Game Type. Enter on an
 * enabled row changes it as Right, or runs it: Start (`r_hdr 1`, the Newer defaults, `LocalPlay_Start`, menu closed),
 * Open player n's window, End local play (back to the main menu), or Leave (`disconnect` and close the window).
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_SplitScreen_Key( key ) {

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
/**
 * `M_TouchInput` on the local play screen: a touch on a row's 8-pixel text line moves the cursor there and presses
 * Enter on it; a touch above y 32 off every row acts as ESC.
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_SplitScreen_Touch( vx, vy ) {

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

/**
 * Opens the online Multiplayer menu (the `menu_multiplayer` command, and ESC from Join Game, New Game and Setup):
 * key_dest `key_menu`, `m_state` `m_multiplayer`, enter sound, and clears the last connection error's reason.
 */
export function M_Menu_MultiPlayer_f() {

	setKeyDest( key_menu );
	set_m_state( m_multiplayer );
	set_m_entersound( true );
	set_m_return_reason( '' );

}

/**
 * `M_Draw` while `m_state` is `m_multiplayer`: the plaque, the title, the `gfx/mp_menu.lmp` items (Join Game, New
 * Game, Setup) with the spinning cursor, and a failed connection's reason at y 97. Nothing until `Draw_CachePic` is
 * wired.
 */
export function M_MultiPlayer_Draw() {

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

/**
 * `M_Keydown` on the online Multiplayer menu. ESC returns to the main menu; Up and Down move the cursor over the three
 * items, wrapping; Enter opens Join Game (`M_Menu_LanConfig_f`), New Game (`M_Menu_GameOptions_f`) or Setup.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_MultiPlayer_Key( key ) {

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

/**
 * Opens Join Game (the `menu_lanconfig` command and the Multiplayer menu's Join Game item): puts the room cursor on
 * the first room, clears the error-return flag and reason, and starts fetching the room list (`M_FetchRooms`, not
 * awaited) from the `?server=` address or the default WebTransport server.
 */
export function M_Menu_LanConfig_f() {

	setKeyDest( key_menu );
	set_m_state( m_lanconfig );
	set_m_entersound( true );

	slist_cursor = 0;
	set_m_return_onerror( false );
	set_m_return_reason( '' );

	// Fetch room list
	M_FetchRooms();

}

/**
 * `M_Draw` while `m_state` is `m_lanconfig`: the Join Game title, then "Searching for games...", the fetch error,
 * "No games found", or up to 8 rooms (map, players / maximum, room id) 12 pixels apart from y 52, scrolled to keep the
 * cursor in view; a failed connection's reason at y 170. Nothing until `Draw_CachePic` is wired.
 */
export function M_LanConfig_Draw() {

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

/**
 * `M_Keydown` on Join Game. ESC returns to the Multiplayer menu; Up and Down move over the rooms, wrapping; Space
 * fetches the list again. Enter on a full room only sets the reason "Room is full"; on another it rewrites the page
 * address to `?room=<id>`, arms the error return to this screen, closes the menu and queues
 * `connect "wts://...?room=<id>"` through the lobby.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_LanConfig_Key( key ) {

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

/**
 * Opens New Game's options (the `menu_gameoptions` command and the Multiplayer menu's New Game item): key_dest
 * `key_menu`, `m_state` `m_gameoptions`, enter sound; a max players below 2 is reset to 4.
 */
export function M_Menu_GameOptions_f() {

	setKeyDest( key_menu );
	set_m_state( m_gameoptions );
	set_m_entersound( true );

	if ( maxplayers === 0 )
		maxplayers = svs.maxclients || 4;
	if ( maxplayers < 2 )
		maxplayers = 4;

}

/**
 * `M_Draw` while `m_state` is `m_gameoptions`: the begin game button, Max players, Game Type (the `coop` cvar),
 * Teamplay, Skill, Episode and Level (from menu_common.js's `episodes` and `levels`, with the map name), and the
 * cursor at the row's y from `gameoptions_cursor_table`. Nothing until `Draw_CachePic` is wired.
 */
export function M_GameOptions_Draw() {

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

/**
 * `M_Keydown` on New Game's options. ESC returns to the Multiplayer menu; Up and Down move over the seven rows,
 * wrapping; Left and Right (and Enter, off the first row) change the row: max players 2..4, `coop` toggled, `teamplay`
 * 0..2 and `skill` 0..3 wrapping, the episode (resetting the level) and the level. Enter on begin game creates a
 * WebTransport room (`WT_CreateRoom`) and on success closes the menu and queues `connect` (a browser without
 * WebTransport gets an alert and the main menu); with no room service wired it queues `disconnect` (if a server
 * runs), `listen 0`, `maxplayers <n>` and `map <name>` instead.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_GameOptions_Key( key ) {

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

/**
 * Opens player Setup (the `menu_setup` command and the Multiplayer menu's Setup item), starting from the current
 * `cl_name` and the shirt and pants colours in `cl_color`.
 */
export function M_Menu_Setup_f() {

	setKeyDest( key_menu );
	set_m_state( m_setup );
	set_m_entersound( true );

	// Initialize from current values
	setup_myname = _cl_name ? _cl_name.string : 'player';
	setup_top = setup_oldtop = ( cl_color.value | 0 ) >> 4;
	setup_bottom = setup_oldbottom = ( cl_color.value | 0 ) & 15;

}

/**
 * `M_Draw` while `m_state` is `m_setup`: the name field, Shirt color and Pants color, the player in the chosen colours
 * (`M_BuildTranslationTable`, `M_DrawTransPicTranslate`), Accept Changes, the row cursor and, on the name, the text
 * cursor. Nothing until `Draw_CachePic` is wired.
 */
export function M_Setup_Draw() {

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

/**
 * `M_Keydown` on Setup. ESC returns to the Multiplayer menu without applying; Up and Down move over the four rows,
 * wrapping. On the name, Backspace deletes and characters 32..126 type, up to 15. Left and Right step the shirt or
 * pants colour (Enter steps it forward), wrapping 0..13. Enter on Accept Changes queues `name "<name>"`, and
 * `color <top> <bottom>` when either changed, then returns to the Multiplayer menu.
 *
 * @param {number} key key number (0..255): ASCII or a keys.js `K_*` constant
 */
export function M_Setup_Key( key ) {

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

// Multiplayer menu touch
/**
 * `M_TouchInput` on the online Multiplayer menu: a touch on one of the three rows (20 pixels a row from y 32) moves
 * the cursor there and chooses it, as Enter.
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_MultiPlayer_Touch( vx, vy ) {

	if ( vy >= 32 && vy < 32 + MULTIPLAYER_ITEMS * 20 ) {

		const item = Math.floor( ( vy - 32 ) / 20 );
		if ( item >= 0 && item < MULTIPLAYER_ITEMS ) {

			m_multiplayer_cursor = item;
			M_MultiPlayer_Key( K_ENTER );

		}

	}

}

// LAN Config touch - handle room list selection
/**
 * `M_TouchInput` on Join Game: a touch on a room row (12 pixels a row from y 52, counted from the first room, not the
 * scrolled view) moves the cursor there and joins it, as Enter.
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_LanConfig_Touch( vx, vy ) {

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
/**
 * `M_TouchInput` on New Game's options: the first row whose band (from 4 pixels above its cursor y to 12 below)
 * holds the touch gets the cursor and Enter (begin game, or change the row as Right).
 *
 * @param {number} vx x in menu pixels (0..320; unused)
 * @param {number} vy y in menu pixels (0..200)
 */
export function M_GameOptions_Touch( vx, vy ) {

	// Find which row was touched based on cursor table
	for ( let i = 0; i < NUM_GAMEOPTIONS; i ++ ) {

		if ( vy >= gameoptions_cursor_table[ i ] - 4 && vy < gameoptions_cursor_table[ i ] + 12 ) {

			gameoptions_cursor = i;
			M_GameOptions_Key( K_ENTER );
			return;

		}

	}

}
