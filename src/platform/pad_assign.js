/**
 * @module platform/pad_assign
 *
 * Which controller each player has in local play across windows (card [37c]): a pure rule, decided by player 1's page
 * and shared with the players' windows (pad_share.js). A controller keeps its player while it stays connected; a new
 * one goes to the lowest-numbered player without one, players 2 and up first (player 1 has the keyboard and mouse),
 * then player 1; a controller that comes back goes to the player it had, if that player is still free.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */

/**
 * A controller's identity across frames and windows: its browser index and id (the index alone is reused by the
 * browser, the id alone is shared by two controllers of one model).
 *
 * @param {{ index: number, id: string }} pad a Gamepad or a shared snapshot of one
 * @returns {string} `<index>|<id>`
 */
export function PadAssign_Key( pad ) {

	return pad.index + '|' + pad.id;

}

/**
 * The next assignment of controllers to players.
 *
 * @param {Map<string, number>} table the current one: controller key -> player number (not changed)
 * @param {string[]} pads the connected controllers' keys, in the browser's index order
 * @param {number[]} players the player numbers in the game (1 is player 1's page)
 * @param {Map<string, number>} [last] each controller's last player, kept by the caller across disconnects (updated)
 * @returns {Map<string, number>} the new table: kept owners, then new controllers handed out
 */
export function PadAssign_Next( table, pads, players, last = new Map() ) {

	const present = new Set( players ), next = new Map();
	for ( const key of pads ) {

		const player = table.get( key );
		if ( player !== undefined && present.has( player ) ) next.set( key, player );

	}
	const taken = () => new Set( next.values() );
	const order = [ ...players ].filter( n => n !== 1 ).sort( ( a, b ) => a - b ).concat( present.has( 1 ) ? [ 1 ] : [] );
	for ( const key of pads ) {

		if ( next.has( key ) ) continue;
		const used = taken(), before = last.get( key );
		const player = before !== undefined && present.has( before ) && ! used.has( before ) ? before : order.find( n => ! used.has( n ) );
		if ( player === undefined ) continue; // more controllers than players: the extra ones play nobody
		next.set( key, player );

	}
	for ( const [ key, player ] of next ) last.set( key, player );
	return next;

}
