/**
 * @module engine/client/local_play
 *
 * Local play across browser windows (cards [37a]-[37c]; owner direction, 10 Oct 2026: each further player gets a
 * window of their own, which can be dragged to another screen). Player 1's page hosts: it runs the native listen
 * server (`maxplayers`, co-op or deathmatch) and names a session for the window driver (net_window.js). Each other
 * player is a window of the same page, `index.html?window=<session>&player=<n>`, which joins that session as an
 * ordinary native client. This module holds what the Multiplayer > Local screen and the page's start-up need: the
 * commands that start and end hosting, opening a player's window, and reading a player window's address.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `_open`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
import { Window_NewSession, Window_HostSession, WINDOW_SESSION_PATTERN, WINDOW_ADDRESS_PREFIX } from '../net/net_window.js';
import { sv, svs } from '../server/server.js';

/** The fewest and most players in local play (the server's client slots: Host_FindMaxClients allows four). */
export const LOCAL_PLAYERS_MIN = 2, LOCAL_PLAYERS_MAX = 4;
/** The modes: the native co-op and deathmatch rules, as the `coop` and `deathmatch` cvars set them. */
export const LOCAL_MODES = Object.freeze( [ 'coop', 'deathmatch' ] );
/** The map local play starts on (it has co-op and deathmatch starts in the shareware and the full game). */
export const LOCAL_MAP = 'e1m1';
// shirt and trousers per player number, so each player can be told apart (player 1 keeps their own)
const COLOURS = Object.freeze( { 2: '4 4', 3: '13 13', 4: '3 3' } );

let _open = ( url, target, features ) => ( typeof window !== 'undefined' && typeof window.open === 'function' ? window.open( url, target, features ) : null );

/**
 * Replaces how a player's window is opened (tests record the calls instead).
 *
 * @param {(url: string, target: string, features: string) => unknown} open called as `window.open` would be
 */
export function LocalPlay_SetOpener( open ) {

	_open = open;

}

/**
 * Whether this page is a player's window, from its address.
 *
 * @param {string} search the page's `location.search`
 * @returns {?{ session: string, player: number }} the session it joins and its player number (2-4); null for an
 *   ordinary page, or an address whose session or player number is invalid
 */
export function LocalPlay_PlayerWindow( search ) {

	const params = new URLSearchParams( search || '' );
	const session = params.get( 'window' ), player = Number( params.get( 'player' ) );
	if ( session === null || ! WINDOW_SESSION_PATTERN.test( session ) ) return null;
	if ( ! Number.isInteger( player ) || player < LOCAL_PLAYERS_MIN || player > LOCAL_PLAYERS_MAX ) return null;
	return { session, player };

}

/**
 * The commands a player's window runs once the engine is up: its name and colours, then joining the host.
 *
 * @param {{ session: string, player: number }} role from `LocalPlay_PlayerWindow`
 * @returns {string} console commands, each ending in a newline
 */
export function LocalPlay_PlayerCommands( role ) {

	return `name "Player ${role.player}"\ncolor ${COLOURS[ role.player ]}\nconnect "${WINDOW_ADDRESS_PREFIX}${role.session}"\n`;

}

/**
 * Whether this page is hosting local play now: a server is running with room for more than one player, and the
 * window driver has a session.
 *
 * @returns {boolean} true while hosting
 */
export function LocalPlay_Hosting() {

	return sv.active === true && svs.maxclients > 1 && Window_HostSession() !== null;

}

/**
 * The players in the hosted game other than player 1, as the server sees them.
 *
 * @returns {Array<{ slot: number, name: string }>} each connected client but the host's own (slot 0), in slot order
 */
export function LocalPlay_Players() {

	const list = [];
	if ( ! LocalPlay_Hosting() ) return list;
	for ( let i = 1; i < svs.maxclients; i ++ ) if ( svs.clients[ i ]?.active ) list.push( { slot: i, name: svs.clients[ i ].name } );
	return list;

}

/**
 * The player numbers the hosted game was set up for, 1 to its players (`maxplayers`), whether or not each window has
 * joined yet: a controller can then wait for a player whose window is still opening (pad_assign.js).
 *
 * @returns {number[]} 1 up to the number of players; empty when not hosting
 */
export function LocalPlay_PlayerNumbers() {

	return LocalPlay_Hosting() ? Array.from( { length: svs.maxclients }, ( _, i ) => i + 1 ) : [];

}

/**
 * The lowest player number (2 up to the game's players) with no window in the game, by the names the windows gave
 * themselves ("Player <n>").
 *
 * @returns {?number} that player number, or null when the game is full (or not hosted)
 */
export function LocalPlay_NextPlayer() {

	if ( ! LocalPlay_Hosting() ) return null;
	const players = LocalPlay_Players();
	if ( players.length + 1 >= svs.maxclients ) return null;
	const named = new Set( players.map( p => p.name ) );
	for ( let n = LOCAL_PLAYERS_MIN; n <= svs.maxclients; n ++ ) if ( ! named.has( 'Player ' + n ) ) return n;
	return null;

}

/**
 * The address of player `n`'s window for this page's session.
 *
 * @param {number} n the player number, 2 to 4
 * @param {string} [session] defaults to the hosted session
 * @param {string} [page] the page's own address without its query (defaults to this page's)
 * @returns {string} `<page>?window=<session>&player=<n>`
 */
export function LocalPlay_PlayerUrl( n, session = Window_HostSession(), page = typeof location !== 'undefined' ? location.origin + location.pathname : 'index.html' ) {

	return `${page}?window=${encodeURIComponent( session )}&player=${n}`;

}

/**
 * Opens player `n`'s window. It must be called from a key press, click or tap (browsers open a window only then, and
 * one per gesture). The window has no opener, so the browser may give it a process of its own.
 *
 * @param {number} n the player number, 2 to 4
 * @param {string} [session] defaults to the hosted session
 */
export function LocalPlay_OpenPlayer( n, session = Window_HostSession() ) {

	if ( session === null ) return;
	_open( LocalPlay_PlayerUrl( n, session ), '_blank', 'popup,noopener,width=960,height=600' );

}

/**
 * Starts hosting: the commands that end any game, set the players and the mode, name a new session for players'
 * windows, and load `LOCAL_MAP`; then opens player 2's window. Called from Multiplayer > Local's Start, on the key
 * press (see `LocalPlay_OpenPlayer`).
 *
 * @param {{ players: number, mode: string }} setup 2 to 4 players; 'coop' or 'deathmatch'
 * @param {(text: string) => void} addText where the commands go (`Cbuf_AddText`)
 * @returns {string} the new session id
 */
export function LocalPlay_Start( setup, addText ) {

	const players = Math.min( LOCAL_PLAYERS_MAX, Math.max( LOCAL_PLAYERS_MIN, Math.trunc( setup.players ) || LOCAL_PLAYERS_MIN ) );
	const coop = setup.mode !== 'deathmatch';
	const session = Window_NewSession();
	// maxplayers turns listening on and sets deathmatch 1; the mode is set after it
	addText( `disconnect\nwindowhost -\nmaxplayers ${players}\ncoop ${coop ? 1 : 0}\ndeathmatch ${coop ? 0 : 1}\nwindowhost ${session}\nmap ${LOCAL_MAP}\n` );
	LocalPlay_OpenPlayer( 2, session );
	return session;

}

/**
 * Ends hosting: the server shuts down (the players' windows are told), the session closes, and the game goes back
 * to one player.
 *
 * @param {(text: string) => void} addText where the commands go (`Cbuf_AddText`)
 */
export function LocalPlay_End( addText ) {

	addText( 'disconnect\nwindowhost -\nmaxplayers 1\n' );

}
