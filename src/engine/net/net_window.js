/**
 * @module engine/net/net_window
 *
 * The window driver (card [37a]): local play across browser windows. Player 1's page runs the native listen server;
 * each other player is a separate window of the same page (`index.html?window=<session>&player=<n>`), and they talk
 * over a same-origin `BroadcastChannel` named `quaked-window-<session>`. It is a driver like loopback (net_loop.js)
 * and WebTransport (net_webtransport.js): the native client, server and protocol run unchanged on each end.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `hostSession`, `hostChannel`, `hostListening`,
 * `pageHideInstalled`; 2 module-level collections (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Messages on the channel are plain objects: { k: kind, to, from, ... }. The host's endpoint is 'host'; each client
// window names itself with a random id. Kinds:
//   join   client -> host, resent every JOIN_RETRY_MS until answered (the host's page may still be loading)
//   accept host -> client: the client's socket is open
//   refuse host -> client, with `reason`: the server is full or not running
//   msg    either way, `r` 1 for a reliable message, 0 for an unreliable one, `b` the bytes
//   close  either way: that end has gone (its page closed, or it dropped the connection)
// A BroadcastChannel delivers in order and never drops, so reliable messages need no sequencing; unreliable ones
// queued behind a newer unreliable one are dropped (as WebTransport's reader does), which bounds the queue of a
// window that is not reading (hidden, or minimised).

import { Con_Printf, SZ_Clear, SZ_Write } from '../common/common.js';
import { net_message } from './net.js';
import { NET_NewQSocket, NET_FreeQSocket } from './net_main.js';

/** The channel name prefix; the session id follows. */
export const WINDOW_CHANNEL_PREFIX = 'quaked-window-';
/** A session id: letters, digits and dashes, 1 to 64 of them. */
export const WINDOW_SESSION_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
/** The connect address prefix: `connect window:<session>`. */
export const WINDOW_ADDRESS_PREFIX = 'window:';
const JOIN_RETRY_MS = 250;
const JOIN_TIMEOUT_MS = 25000; // under CL_EstablishConnection's 30 s race, so the socket is freed here

let hostSession = null, hostChannel = null, hostListening = false;
const pendingJoins = []; // client ids waiting for the server to take them
const hostPeers = new Map(); // client id -> server-side socket
const clientSockets = new Set(); // this page's client-side sockets
let pageHideInstalled = false;

function channelAvailable() {

	return typeof BroadcastChannel !== 'undefined';

}

function newId() {

	const bytes = new Uint8Array( 8 );
	globalThis.crypto.getRandomValues( bytes );
	return Array.from( bytes, b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );

}

/**
 * A new session id for `Window_Host` and the players' windows: 16 hex digits from `crypto.getRandomValues`.
 *
 * @returns {string} an id matching `WINDOW_SESSION_PATTERN`
 */
export function Window_NewSession() {

	return newId();

}

// a closing page tells its peers, so their ends close at once rather than after net_messagetimeout
function installPageHide() {

	if ( pageHideInstalled || typeof window === 'undefined' || typeof window.addEventListener !== 'function' ) return;
	pageHideInstalled = true;
	window.addEventListener( 'pagehide', () => {

		for ( const [ id, sock ] of hostPeers ) { hostChannel?.postMessage( { k: 'close', to: id, from: 'host' } ); sock.driverdata.open = false; }
		for ( const sock of clientSockets ) { const d = sock.driverdata; d.channel.postMessage( { k: 'close', to: 'host', from: d.id } ); d.open = false; }

	} );

}

function enqueue( d, message ) {

	const last = d.queue[ d.queue.length - 1 ];
	if ( message.r === 0 && last !== undefined && last.r === 0 ) d.queue[ d.queue.length - 1 ] = message;
	else d.queue.push( message );

}

function onHostMessage( event ) {

	const m = event.data;
	if ( ! m || typeof m !== 'object' || typeof m.from !== 'string' ) return;
	if ( m.k === 'join' ) {

		const sock = hostPeers.get( m.from );
		if ( sock ) { hostChannel.postMessage( { k: 'accept', to: m.from, from: 'host' } ); return; } // a resent join
		if ( ! hostListening ) return; // not yet: the client keeps asking until it times out
		if ( ! pendingJoins.includes( m.from ) ) pendingJoins.push( m.from );
		return;

	}
	if ( m.to !== 'host' ) return;
	const sock = hostPeers.get( m.from );
	if ( ! sock ) return;
	if ( m.k === 'msg' && m.b instanceof Uint8Array ) enqueue( sock.driverdata, m );
	else if ( m.k === 'close' ) sock.driverdata.open = false;

}

/*
=============
Window_Init
=============
*/
/**
 * Initialises the window driver; NET_Init calls it through the driver table. Available wherever `BroadcastChannel`
 * is (every current browser, Node and Deno).
 *
 * @returns {number} 0, or -1 when there is no `BroadcastChannel`
 */
export function Window_Init() {

	return channelAvailable() ? 0 : - 1;

}

/**
 * Names the session this page's server accepts players' windows on (the `windowhost <session>` command). Opens the
 * session's channel; joins are taken while the driver is listening (`listen 1`, which `maxplayers` above 1 turns on).
 * The session can change only while no player's window is connected.
 *
 * @param {?string} session an id matching `WINDOW_SESSION_PATTERN`, or null to stop hosting
 * @returns {boolean} true when hosting `session` (or stopped, for null); false for an invalid id, no channel, or a
 *   different session while players' windows are still connected
 */
export function Window_Host( session ) {

	if ( session !== null && ( ! WINDOW_SESSION_PATTERN.test( String( session ) ) || ! channelAvailable() ) ) return false;
	if ( session === hostSession ) return true;
	if ( hostPeers.size > 0 ) return false; // players are still connected on the current session
	if ( hostChannel ) hostChannel.close();
	hostChannel = null; hostSession = session; pendingJoins.length = 0;
	if ( session === null ) return true;
	hostChannel = new BroadcastChannel( WINDOW_CHANNEL_PREFIX + session );
	hostChannel.onmessage = onHostMessage;
	installPageHide();
	return true;

}

/**
 * The session this page hosts.
 *
 * @returns {?string} its id, or null when not hosting
 */
export function Window_HostSession() {

	return hostSession;

}

/*
=============
Window_Listen
=============
*/
/**
 * Turns accepting players' windows on or off; called by NET_Init and the `listen` command. Turning it off forgets
 * joins not yet taken (their windows keep asking until they time out).
 *
 * @param {boolean} state true to accept new players' windows
 */
export function Window_Listen( state ) {

	hostListening = !! state;
	if ( ! hostListening ) pendingJoins.length = 0;

}

/**
 * The window driver has no server browser: players' windows are given their address. Does nothing.
 *
 * @param {boolean} xmit ignored
 */
export function Window_SearchForHosts( xmit ) {

}

/*
=============
Window_Connect
=============
*/
/**
 * Joins a server hosted in another window of this page, for the address `window:<session>`; NET_Connect calls it
 * for such an address. Takes a client socket, then asks the host to join every 250 ms (its page may still be
 * loading) until it is accepted, refused, or 25 s pass.
 *
 * @param {string} host `window:<session>`
 * @returns {?Promise<import('./net.js').qsocket_t>} resolves with the open socket; rejects with the reason (server
 *   full, timed out); null for another kind of address, an invalid session, no channel, or no free socket
 */
export function Window_Connect( host ) {

	if ( typeof host !== 'string' || ! host.startsWith( WINDOW_ADDRESS_PREFIX ) ) return null;
	const session = host.slice( WINDOW_ADDRESS_PREFIX.length );
	if ( ! WINDOW_SESSION_PATTERN.test( session ) || ! channelAvailable() ) return null;
	const sock = NET_NewQSocket();
	if ( sock === null ) { Con_Printf( 'Window_Connect: no qsocket available\n' ); return null; }
	const id = newId(), channel = new BroadcastChannel( WINDOW_CHANNEL_PREFIX + session );
	const d = { id, peer: 'host', channel, queue: [], open: false, session };
	sock.driverdata = d; sock.address = host;
	installPageHide();
	return new Promise( ( resolve, reject ) => {

		let settled = false;
		const finish = ( error ) => {

			if ( settled ) return;
			settled = true; clearInterval( retry ); clearTimeout( timeout );
			if ( error === null ) { d.open = true; clientSockets.add( sock ); resolve( sock ); return; }
			channel.close(); sock.driverdata = null; NET_FreeQSocket( sock ); reject( error );

		};
		channel.onmessage = event => {

			const m = event.data;
			if ( ! m || typeof m !== 'object' || m.to !== id || m.from !== 'host' ) return;
			if ( m.k === 'accept' ) finish( null );
			else if ( m.k === 'refuse' ) finish( new Error( 'Server refused: ' + ( m.reason || 'no reason given' ) ) );
			else if ( m.k === 'msg' && m.b instanceof Uint8Array && d.open ) enqueue( d, m );
			else if ( m.k === 'close' ) d.open = false;

		};
		const ask = () => channel.postMessage( { k: 'join', to: 'host', from: id } );
		const retry = setInterval( ask, JOIN_RETRY_MS );
		const timeout = setTimeout( () => finish( new Error( 'No server answered in session ' + session ) ), JOIN_TIMEOUT_MS );
		ask();

	} );

}

/*
=============
Window_CheckNewConnections
=============
*/
/**
 * Hands the server the next player's window waiting to join; NET_CheckNewConnections polls it each server frame
 * while listening. A window the server has no room for is refused ("server is full") and told so.
 *
 * @returns {?import('./net.js').qsocket_t} the server end of the new connection, or null when none is waiting
 */
export function Window_CheckNewConnections() {

	while ( pendingJoins.length > 0 ) {

		const id = pendingJoins.shift();
		if ( hostPeers.has( id ) ) continue;
		const sock = NET_NewQSocket();
		if ( sock === null ) { hostChannel.postMessage( { k: 'refuse', to: id, from: 'host', reason: 'server is full' } ); continue; }
		sock.driverdata = { id: 'host', peer: id, channel: hostChannel, queue: [], open: true, session: hostSession };
		sock.address = WINDOW_ADDRESS_PREFIX + id;
		hostPeers.set( id, sock );
		hostChannel.postMessage( { k: 'accept', to: id, from: 'host' } );
		return sock;

	}
	return null;

}

/*
=============
Window_GetMessage
=============
*/
/**
 * Takes the oldest message that arrived on a socket and copies it into `net_message`; called by NET_GetMessage.
 *
 * @param {import('./net.js').qsocket_t} sock a socket from `Window_Connect` or `Window_CheckNewConnections`
 * @returns {number} 0 when nothing is waiting, 1 for a reliable message, 2 for an unreliable one, -1 once the other end
 *   has closed and everything it sent has been read
 */
export function Window_GetMessage( sock ) {

	const d = sock.driverdata;
	if ( ! d ) return - 1;
	const m = d.queue.shift();
	if ( m === undefined ) return d.open ? 0 : - 1;
	SZ_Clear( net_message );
	SZ_Write( net_message, m.b, m.b.length );
	return m.r ? 1 : 2;

}

function send( sock, data, reliable ) {

	const d = sock.driverdata;
	if ( ! d || ! d.open ) return - 1;
	d.channel.postMessage( { k: 'msg', to: d.peer, from: d.id, r: reliable ? 1 : 0, b: data.data.slice( 0, data.cursize ) } );
	return 1;

}

/**
 * Sends a reliable message to the other window; called by NET_SendMessage. The channel neither drops nor reorders.
 *
 * @param {import('./net.js').qsocket_t} sock the sending socket
 * @param {import('../common/common.js').sizebuf_t} data its first `cursize` bytes are sent (copied)
 * @returns {number} 1 when sent, -1 when the connection has closed
 */
export function Window_SendMessage( sock, data ) {

	return send( sock, data, true );

}

/**
 * Sends an unreliable message to the other window; called by NET_SendUnreliableMessage. The receiver keeps only the
 * newest of a run of unreliable messages it has not read.
 *
 * @param {import('./net.js').qsocket_t} sock the sending socket
 * @param {import('../common/common.js').sizebuf_t} data its first `cursize` bytes are sent (copied)
 * @returns {number} 1 when sent, -1 when the connection has closed
 */
export function Window_SendUnreliableMessage( sock, data ) {

	return send( sock, data, false );

}

/**
 * Whether a reliable message can be sent now; called by NET_CanSendMessage.
 *
 * @param {import('./net.js').qsocket_t} sock the socket
 * @returns {boolean} true while the connection is open
 */
export function Window_CanSendMessage( sock ) {

	return !! sock.driverdata?.open;

}

/**
 * Whether an unreliable message can be sent now; called by NET_CanSendUnreliableMessage.
 *
 * @param {import('./net.js').qsocket_t} sock the socket
 * @returns {boolean} true while the connection is open
 */
export function Window_CanSendUnreliableMessage( sock ) {

	return !! sock.driverdata?.open;

}

/*
=============
Window_Close
=============
*/
/**
 * Closes one end; NET_Close calls it before freeing the socket. Tells the other window, so its end closes too.
 *
 * @param {import('./net.js').qsocket_t} sock the socket being closed
 */
export function Window_Close( sock ) {

	const d = sock.driverdata;
	if ( ! d ) return;
	if ( d.open ) d.channel.postMessage( { k: 'close', to: d.peer, from: d.id } );
	d.open = false; d.queue.length = 0;
	if ( d.id === 'host' ) {

		hostPeers.delete( d.peer );

	} else {

		clientSockets.delete( sock );
		d.channel.close();

	}
	sock.driverdata = null;

}

/*
=============
Window_Shutdown
=============
*/
/**
 * Shuts the driver down; called from NET_Shutdown after every socket has been closed. Stops hosting.
 */
export function Window_Shutdown() {

	Window_Listen( false );
	if ( hostChannel ) hostChannel.close();
	hostChannel = null; hostSession = null;

}
