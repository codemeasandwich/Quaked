/**
 * @module engine/net/net_loop
 *
 * The loopback driver (WinQuake net_loop.c): a single-player game's client and server talking inside the page.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `localconnectpending`, `loop_client`, `loop_server`.
 *
 * Errors: calls `Sys_Error` (fatal) at 1 place.
 */
// Ported from: WinQuake/net_loop.c + net_loop.h -- loopback network driver

import { Con_Printf, SZ_Clear, SZ_Write } from '../common/common.js';
import { Sys_Error } from '../common/sys.js';
import {
	NET_MAXMESSAGE, NET_LOOP_MAXMESSAGE,
	net_message,
	qsocket_t,
	net_activeconnections,
	net_driverlevel,
	hostCacheCount, set_hostCacheCount,
	hostcache
} from './net.js';
import { NET_NewQSocket, hostname } from './net_main.js';
import { sv } from '../server/server.js';
import { svs } from '../server/server.js';

let localconnectpending = false;
let loop_client = null;
let loop_server = null;

/*
=============
Loop_Init
=============
*/
/**
 * Initialises the loopback driver (WinQuake net_loop.c). NET_Init calls it once at startup through `net_drivers[0]`;
 * a result other than -1 marks the driver initialized. In the browser loopback is always supported (never a dedicated
 * server), so there is nothing to set up.
 *
 * @returns {number} always 0 (the "control socket" NET_Init stores; -1 would mean unavailable)
 */
export function Loop_Init() {

	// In browser, we always support loopback (not dedicated)
	return 0;

}

/*
=============
Loop_Shutdown
=============
*/
/**
 * Shuts the loopback driver down (WinQuake net_loop.c); called from NET_Shutdown. It has nothing to release: the two
 * loopback sockets are freed by NET_Close.
 */
export function Loop_Shutdown() {

}

/*
=============
Loop_Listen
=============
*/
/**
 * Turns listening on or off for the loopback driver (WinQuake net_loop.c); called by NET_Init and the `listen`
 * command. Loopback needs no listening socket, so it does nothing.
 *
 * @param {boolean} state requested listening state (ignored)
 */
export function Loop_Listen( state ) {

}

/*
=============
Loop_SearchForHosts
=============
*/
/**
 * Adds the local server to the server browser cache (WinQuake net_loop.c). Called by the `slist` search (Slist_Send
 * and Slist_Poll) when local hosts are included. When a server is running it overwrites `hostcache[0]` with its name
 * (`hostname`, or "local" while it is "UNNAMED"), map, player counts and connect name "local", and sets
 * `hostCacheCount` to 1; otherwise it changes nothing.
 *
 * @param {boolean} xmit true on the send pass, false on the poll pass (ignored: the answer is immediate)
 */
export function Loop_SearchForHosts( xmit ) {

	if ( ! sv.active )
		return;

	set_hostCacheCount( 1 );
	if ( hostname.string === 'UNNAMED' )
		hostcache[ 0 ].name = 'local';
	else
		hostcache[ 0 ].name = hostname.string;
	hostcache[ 0 ].map = sv.name;
	hostcache[ 0 ].users = net_activeconnections;
	hostcache[ 0 ].maxusers = svs.maxclients;
	hostcache[ 0 ].driver = net_driverlevel;
	hostcache[ 0 ].cname = 'local';

}

/*
=============
Loop_Connect
=============
*/
/**
 * Opens the loopback link for a single-player or listen-server game (WinQuake net_loop.c); NET_Connect calls it for
 * the host "local". It takes a client socket and a server socket from the qsocket pool the first time (they are kept
 * until `Loop_Close`), empties their buffers, points each one's `driverdata` at the other, and flags a pending
 * connection for `Loop_CheckNewConnections` to hand to the server.
 *
 * @param {string} host host name; anything other than "local" is refused
 * @returns {?qsocket_t} the client end, or null for another host or when no qsocket is free (a message is printed)
 */
export function Loop_Connect( host ) {

	if ( host !== 'local' )
		return null;

	localconnectpending = true;

	if ( ! loop_client ) {

		loop_client = NET_NewQSocket();
		if ( loop_client === null ) {

			Con_Printf( 'Loop_Connect: no qsocket available\n' );
			return null;

		}

		loop_client.address = 'localhost';

	}

	loop_client.receiveMessageLength = 0;
	loop_client.sendMessageLength = 0;
	loop_client.canSend = true;

	if ( ! loop_server ) {

		loop_server = NET_NewQSocket();
		if ( loop_server === null ) {

			Con_Printf( 'Loop_Connect: no qsocket available\n' );
			return null;

		}

		loop_server.address = 'LOCAL';

	}

	loop_server.receiveMessageLength = 0;
	loop_server.sendMessageLength = 0;
	loop_server.canSend = true;

	loop_client.driverdata = loop_server;
	loop_server.driverdata = loop_client;

	return loop_client;

}

/*
=============
Loop_CheckNewConnections
=============
*/
/**
 * Hands the server the pending loopback connection (WinQuake net_loop.c). NET_CheckNewConnections polls it each server
 * frame; after a `Loop_Connect` it returns the server end once, with both ends' buffers emptied and able to send.
 *
 * @returns {?qsocket_t} the server end of a new local connection, or null when none is pending
 */
export function Loop_CheckNewConnections() {

	if ( ! localconnectpending )
		return null;

	localconnectpending = false;
	loop_server.sendMessageLength = 0;
	loop_server.receiveMessageLength = 0;
	loop_server.canSend = true;
	loop_client.sendMessageLength = 0;
	loop_client.receiveMessageLength = 0;
	loop_client.canSend = true;
	return loop_server;

}

/*
=============
IntAlign
=============
*/
function IntAlign( value ) {

	return ( value + ( 4 - 1 ) ) & ( ~ ( 4 - 1 ) ); // sizeof(int) = 4

}

/*
=============
Loop_GetMessage
=============
*/
/**
 * Takes the oldest queued message from a loopback socket's receive buffer and copies its payload into `net_message`
 * (WinQuake net_loop.c); called by NET_GetMessage. Queued messages have a 4-byte header (type, 16-bit little-endian
 * length, one alignment byte) and are padded to 4 bytes; the rest of the buffer is shifted down. Reading a reliable
 * message lets the peer send its next one.
 *
 * @param {qsocket_t} sock socket to read from; its `receiveMessage` and `receiveMessageLength` are consumed
 * @returns {number} 0 when nothing is queued, 1 for a reliable message, 2 for an unreliable one (payload in
 *     `net_message`)
 */
export function Loop_GetMessage( sock ) {

	if ( sock.receiveMessageLength === 0 )
		return 0;

	const ret = sock.receiveMessage[ 0 ];
	const length = sock.receiveMessage[ 1 ] + ( sock.receiveMessage[ 2 ] << 8 );
	// alignment byte skipped here
	SZ_Clear( net_message );
	SZ_Write( net_message, sock.receiveMessage.subarray( 4, 4 + length ), length );

	const alignedLength = IntAlign( length + 4 );
	sock.receiveMessageLength -= alignedLength;

	if ( sock.receiveMessageLength > 0 ) {

		// shift remaining data down
		sock.receiveMessage.copyWithin( 0, alignedLength, alignedLength + sock.receiveMessageLength );

	}

	if ( sock.driverdata != null && ret === 1 )
		sock.driverdata.canSend = true;

	return ret;

}

/*
=============
Loop_SendMessage
=============
*/
/**
 * Queues a reliable message in the peer's receive buffer (WinQuake net_loop.c); called by NET_SendMessage. The sender
 * may not send another reliable message (`canSend` false) until the peer has read this one.
 *
 * @param {qsocket_t} sock sending socket
 * @param {sizebuf_t} data message; `data.cursize` bytes of `data.data` are copied
 * @returns {number} 1 when queued, -1 when the peer is gone (`driverdata` null)
 * @throws {Error} via `Sys_Error` when the message would overflow the peer's `NET_LOOP_MAXMESSAGE`-byte buffer
 */
export function Loop_SendMessage( sock, data ) {

	if ( ! sock.driverdata )
		return - 1;

	const peer = sock.driverdata;
	const bufferLength = peer.receiveMessageLength;

	if ( ( bufferLength + data.cursize + 4 ) > NET_LOOP_MAXMESSAGE )
		Sys_Error( 'Loop_SendMessage: overflow\n' );

	const offset = bufferLength;

	// message type
	peer.receiveMessage[ offset ] = 1;

	// length
	peer.receiveMessage[ offset + 1 ] = data.cursize & 0xff;
	peer.receiveMessage[ offset + 2 ] = data.cursize >> 8;

	// align
	// peer.receiveMessage[ offset + 3 ] is alignment padding

	// message
	for ( let i = 0; i < data.cursize; i ++ )
		peer.receiveMessage[ offset + 4 + i ] = data.data[ i ];

	peer.receiveMessageLength = IntAlign( bufferLength + data.cursize + 4 );

	sock.canSend = false;
	return 1;

}

/*
=============
Loop_SendUnreliableMessage
=============
*/
/**
 * Queues an unreliable message (type 2) in the peer's receive buffer (WinQuake net_loop.c); called by
 * NET_SendUnreliableMessage. Unlike the reliable path it drops the message when there is no room.
 *
 * @param {qsocket_t} sock sending socket
 * @param {sizebuf_t} data message; `data.cursize` bytes of `data.data` are copied
 * @returns {number} 1 when queued, 0 when it was dropped for lack of buffer space, -1 when the peer is gone
 */
export function Loop_SendUnreliableMessage( sock, data ) {

	if ( ! sock.driverdata )
		return - 1;

	const peer = sock.driverdata;
	const bufferLength = peer.receiveMessageLength;

	if ( ( bufferLength + data.cursize + 4 ) > NET_LOOP_MAXMESSAGE )
		return 0;

	const offset = bufferLength;

	// message type
	peer.receiveMessage[ offset ] = 2;

	// length
	peer.receiveMessage[ offset + 1 ] = data.cursize & 0xff;
	peer.receiveMessage[ offset + 2 ] = data.cursize >> 8;

	// align
	// peer.receiveMessage[ offset + 3 ] is alignment padding

	// message
	for ( let i = 0; i < data.cursize; i ++ )
		peer.receiveMessage[ offset + 4 + i ] = data.data[ i ];

	peer.receiveMessageLength = IntAlign( bufferLength + data.cursize + 4 );
	return 1;

}

/*
=============
Loop_CanSendMessage
=============
*/
/**
 * Says whether a reliable message can be sent now (WinQuake net_loop.c); called by NET_CanSendMessage.
 *
 * @param {qsocket_t} sock socket to check
 * @returns {boolean} false when the peer is gone or the last reliable message has not been read yet
 */
export function Loop_CanSendMessage( sock ) {

	if ( ! sock.driverdata )
		return false;
	return sock.canSend;

}

/*
=============
Loop_CanSendUnreliableMessage
=============
*/
/**
 * Says whether an unreliable message can be sent now (WinQuake net_loop.c); called by NET_CanSendUnreliableMessage.
 *
 * @param {qsocket_t} sock socket to check (ignored)
 * @returns {boolean} always true
 */
export function Loop_CanSendUnreliableMessage( sock ) {

	return true;

}

/*
=============
Loop_Close
=============
*/
/**
 * Closes one end of the loopback link (WinQuake net_loop.c); NET_Close calls it before returning the socket to the
 * free list. It detaches the peer (so the peer's sends return -1), empties this socket's buffers, and forgets it so
 * the next `Loop_Connect` allocates a fresh one.
 *
 * @param {qsocket_t} sock the client or server end being closed
 */
export function Loop_Close( sock ) {

	if ( sock.driverdata != null )
		sock.driverdata.driverdata = null;

	sock.receiveMessageLength = 0;
	sock.sendMessageLength = 0;
	sock.canSend = true;
	if ( sock === loop_client )
		loop_client = null;
	else
		loop_server = null;

}
