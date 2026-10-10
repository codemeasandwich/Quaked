/**
 * @module platform/pad_share
 *
 * Controllers in local play across windows (card [37c]): every window of a session sees the same controllers, or,
 * where the browser shows them only to the focused window, only that one does. So each window that reads any shares a
 * snapshot of them on the session's channel (`quaked-pads-<session>`), player 1's page decides who has which
 * (pad_assign.js) and shares that, and each window plays only the controller given to its player, from its own
 * reading or the freshest shared one.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `channel`, `session`, `me`, `host`, `remote`, `table`, `sentAt`,
 * `postedAt`; 2 module-level collections (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
import { PadAssign_Key, PadAssign_Next } from './pad_assign.js';

/** The channel name prefix; the session id follows. */
export const PADS_CHANNEL_PREFIX = 'quaked-pads-';
const FRESH_MS = 500; // a shared snapshot older than this is no longer the controllers' state
const RESEND_MS = 1000; // player 1's page repeats the assignment this often, for windows that join late
const POST_MS = 8; // a window shares its reading at most this often (the poll runs more than once a frame)

let channel = null, session = null, me = null, host = false;
let remote = { pads: [], at: - Infinity };
let table = new Map(), sentAt = - Infinity, postedAt = - Infinity;
const last = new Map();

/**
 * A controller as plain data: what the gamepad code reads (index, id, mapping, buttons, axes), cloned so it can be
 * posted to another window.
 *
 * @param {Gamepad} pad a connected controller
 * @returns {{ index: number, id: string, mapping: string, connected: true, axes: number[],
 *   buttons: Array<{ pressed: boolean, value: number }> }} its snapshot
 */
export function PadShare_Snapshot( pad ) {

	return { index: pad.index, id: pad.id, mapping: pad.mapping, connected: true, axes: Array.from( pad.axes ?? [] ),
		buttons: Array.from( pad.buttons ?? [], b => ( { pressed: !! b?.pressed, value: Number( b?.value ) || 0 } ) ) };

}

function onMessage( event ) {

	const m = event.data;
	if ( ! m || typeof m !== 'object' ) return;
	if ( m.k === 'pads' && Array.isArray( m.pads ) && m.from !== me ) remote = { pads: m.pads, at: performance.now() };
	else if ( m.k === 'assign' && ! host && Array.isArray( m.table ) ) table = new Map( m.table );

}

/**
 * Joins (or leaves) a session's controller sharing. Called by the gamepad poll each frame with this window's place in
 * local play; changes only when that place changes.
 *
 * @param {?string} id the session id, or null to leave
 * @param {number} [player] this window's player number (1 for player 1's page)
 */
export function PadShare_Join( id, player = 1 ) {

	if ( id === session && player === me ) return;
	if ( channel ) channel.close();
	channel = null; session = id; me = id === null ? null : player; host = player === 1;
	remote = { pads: [], at: - Infinity }; table = new Map(); sentAt = postedAt = - Infinity; last.clear();
	if ( id === null || typeof BroadcastChannel === 'undefined' ) return;
	channel = new BroadcastChannel( PADS_CHANNEL_PREFIX + id );
	channel.onmessage = onMessage;

}

/**
 * This frame's controller for this window's player: shares this window's reading, and on player 1's page decides
 * and shares the assignment.
 *
 * @param {Gamepad[]} own the controllers this window can read (connected ones), possibly none
 * @param {number[]} players the player numbers in the game (used on player 1's page only)
 * @param {number} [now] milliseconds (`performance.now()`)
 * @returns {?object} the controller given to this window's player (a Gamepad, or a snapshot shared by another window),
 *   or null when it has none or no session is joined
 */
export function PadShare_Frame( own, players, now = performance.now() ) {

	if ( session === null ) return null;
	const mine = own.map( PadShare_Snapshot );
	if ( mine.length > 0 && channel && now - postedAt >= POST_MS ) { channel.postMessage( { k: 'pads', from: me, pads: mine } ); postedAt = now; }
	const pads = mine.length > 0 ? mine : now - remote.at < FRESH_MS ? remote.pads : [];
	if ( host ) {

		// a controller's motion sensor or touchpad can be listed as a device of its own: only standard controllers are
		// handed out while there are any
		const usable = pads.some( p => p.mapping === 'standard' ) ? pads.filter( p => p.mapping === 'standard' ) : pads;
		const next = PadAssign_Next( table, usable.map( PadAssign_Key ), players, last );
		const changed = next.size !== table.size || [ ...next ].some( ( [ k, v ] ) => table.get( k ) !== v );
		table = next;
		if ( channel && ( changed || now - sentAt > RESEND_MS ) ) { channel.postMessage( { k: 'assign', table: [ ...table ] } ); sentAt = now; }

	}
	const key = [ ...table ].find( ( [ , player ] ) => player === me )?.[ 0 ];
	if ( key === undefined ) return null;
	const index = mine.length > 0 ? own.findIndex( p => PadAssign_Key( p ) === key ) : - 1;
	return index >= 0 ? own[ index ] : pads.find( p => PadAssign_Key( p ) === key ) ?? null;

}

/**
 * The assignment as this window knows it, for the Local screen and checks.
 *
 * @returns {Array<[string, number]>} controller key -> player number
 */
export function PadShare_Table() {

	return [ ...table ];

}
