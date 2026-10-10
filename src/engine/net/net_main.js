/**
 * @module engine/net/net_main
 *
 * Networking (WinQuake net_main.c): drivers, connections, sending and receiving messages, and the multiplayer room
 * list.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `listening`, `slistStartTime`, `slistLastShown`,
 * `configRestored`, `pollProcedureList`.
 *
 * Errors: calls `Sys_Error` (fatal) at 2 places.
 */
// Ported from: WinQuake/net_main.c -- network main module

import { Sys_Error, Sys_FloatTime } from '../common/sys.js';
import { Con_Printf, Con_DPrintf, SZ_Alloc, COM_CheckParm, com_argc, com_argv, Q_atoi, COM_SetNetMessage } from '../common/common.js';
import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv, Cbuf_AddText } from '../common/cmd.js';
import { cvar_t, Cvar_RegisterVariable, Cvar_Set } from '../common/cvar.js';
import {
	NET_NAMELEN, NET_MAXMESSAGE, NET_LOOP_MAXMESSAGE, MAX_NET_DRIVERS,
	qsocket_t,
	net_activeSockets, net_freeSockets, net_numsockets,
	set_net_activeSockets, set_net_freeSockets, set_net_numsockets,
	net_numdrivers, set_net_numdrivers,
	net_drivers,
	net_numlandrivers, net_landrivers,
	DEFAULTnet_hostport, net_hostport,
	set_DEFAULTnet_hostport, set_net_hostport,
	net_driverlevel, set_net_driverlevel,
	net_time, set_net_time,
	net_message,
	net_activeconnections, set_net_activeconnections,
	hostCacheCount, set_hostCacheCount,
	hostcache, HOSTCACHESIZE,
	slistInProgress, slistSilent, slistLocal,
	set_slistInProgress, set_slistSilent, set_slistLocal,
	PollProcedure
} from './net.js';
import { sv } from '../server/server.js';
import { svs } from '../server/server.js';
import {
	Loop_Init, Loop_Shutdown, Loop_Listen,
	Loop_SearchForHosts, Loop_Connect, Loop_CheckNewConnections,
	Loop_GetMessage, Loop_SendMessage, Loop_SendUnreliableMessage,
	Loop_CanSendMessage, Loop_CanSendUnreliableMessage, Loop_Close
} from './net_loop.js';
import {
	WT_Init, WT_Shutdown, WT_Listen,
	WT_SearchForHosts, WT_Connect, WT_CheckNewConnections,
	WT_QGetMessage, WT_QSendMessage, WT_SendUnreliableMessage,
	WT_CanSendMessage, WT_CanSendUnreliableMessage, WT_Close,
	WT_QueryRooms, WT_CreateRoom
} from './net_webtransport.js';

import {
	Window_Init, Window_Shutdown, Window_Listen,
	Window_SearchForHosts, Window_Connect, Window_CheckNewConnections,
	Window_GetMessage, Window_SendMessage, Window_SendUnreliableMessage,
	Window_CanSendMessage, Window_CanSendUnreliableMessage, Window_Close,
	Window_Host, Window_HostSession, WINDOW_ADDRESS_PREFIX
} from './net_window.js';

// Re-export for menu room list/creation
export { WT_QueryRooms, WT_CreateRoom };
import { MAX_SCOREBOARD } from '../common/quakedef.js';

//============================================================================
// Module-level state
//============================================================================

let listening = false;
/**
 * Setter for the module-level `listening` flag (whether non-loopback drivers accept new connections), for modules that
 * cannot assign an imported binding. Only changes the flag; drivers are told to listen by the `listen` command and
 * `NET_Init`, not by this setter.
 *
 * @param {boolean} state true to accept remote connections in `NET_CheckNewConnections`
 */
export function set_listening( state ) { listening = state; }

let slistStartTime = 0;
let slistLastShown = 0;

const net_messagetimeout = new cvar_t( 'net_messagetimeout', '300' );
export const hostname = new cvar_t( 'hostname', 'UNNAMED' );

let configRestored = false;

let pollProcedureList = null;

// macros from C: sfunc = net_drivers[sock.driver], dfunc = net_drivers[net_driverlevel]

/*
===================
SetNetTime
===================
*/
/**
 * Refreshes `net_time` from `Sys_FloatTime()` (WinQuake net_main.c). Called at the start of every NET_ entry point so
 * timeouts and poll procedures see the current time.
 *
 * @returns {number} the new `net_time`, in seconds
 */
export function SetNetTime() {

	set_net_time( Sys_FloatTime() );
	return net_time;

}

/*
===================
NET_NewQSocket
===================
*/
/**
 * Called by drivers when a new communications endpoint is required (WinQuake net_main.c): the loopback driver on
 * `connect local` and the WebTransport driver on connect. The sequence and buffer fields will be filled in properly.
 *
 * Moves a socket from the free list to the active list, stamps `connecttime` and `lastMessageTime` with `net_time`,
 * records the current `net_driverlevel` as its driver and resets its sequence numbers and lengths. The socket pool is
 * allocated once by `NET_Init`; the socket returns to the free list through `NET_Close`/`NET_FreeQSocket`.
 *
 * @returns {?qsocket_t} the socket, or null when the free list is empty or `svs.maxclients` connections are active
 */
export function NET_NewQSocket() {

	if ( net_freeSockets === null )
		return null;

	if ( net_activeconnections >= svs.maxclients )
		return null;

	// get one from free list
	const sock = net_freeSockets;
	set_net_freeSockets( sock.next );

	// add it to active list
	sock.next = net_activeSockets;
	set_net_activeSockets( sock );

	sock.disconnected = false;
	sock.connecttime = net_time;
	sock.address = 'UNSET ADDRESS';
	sock.driver = net_driverlevel;
	sock.socket = 0;
	sock.driverdata = null;
	sock.canSend = true;
	sock.sendNext = false;
	sock.lastMessageTime = net_time;
	sock.ackSequence = 0;
	sock.sendSequence = 0;
	sock.unreliableSendSequence = 0;
	sock.sendMessageLength = 0;
	sock.receiveSequence = 0;
	sock.unreliableReceiveSequence = 0;
	sock.receiveMessageLength = 0;

	return sock;

}

/*
===================
NET_FreeQSocket
===================
*/
/**
 * Moves a socket from the active list back to the free list and marks it disconnected (WinQuake net_main.c). Called by
 * `NET_Close` after the driver has closed it, and by the WebTransport driver when a connection attempt fails.
 *
 * @param {qsocket_t} sock an active socket; mutated (`next`, `disconnected`)
 * @throws {Error} via `Sys_Error` when `sock` is not on the active list
 */
export function NET_FreeQSocket( sock ) {

	// remove it from active list
	if ( sock === net_activeSockets ) {

		set_net_activeSockets( net_activeSockets.next );

	} else {

		let s = net_activeSockets;
		while ( s ) {

			if ( s.next === sock ) {

				s.next = sock.next;
				break;

			}

			s = s.next;

		}

		if ( ! s )
			Sys_Error( 'NET_FreeQSocket: not active\n' );

	}

	// add it to free list
	sock.next = net_freeSockets;
	set_net_freeSockets( sock );
	sock.disconnected = true;

}

/*
===================
NET_Listen_f
===================
*/
function NET_Listen_f() {

	if ( Cmd_Argc() !== 2 ) {

		Con_Printf( '"listen" is "' + ( listening ? 1 : 0 ) + '"\n' );
		return;

	}

	listening = Q_atoi( Cmd_Argv( 1 ) ) ? true : false;

	for ( let i = 0; i < net_numdrivers; i ++ ) {

		set_net_driverlevel( i );
		if ( net_drivers[ net_driverlevel ].initialized === false )
			continue;
		net_drivers[ net_driverlevel ].Listen( listening );

	}

}

/*
===================
MaxPlayers_f
===================
*/
function MaxPlayers_f() {

	if ( Cmd_Argc() !== 2 ) {

		Con_Printf( '"maxplayers" is "' + svs.maxclients + '"\n' );
		return;

	}

	if ( sv.active ) {

		Con_Printf( 'maxplayers can not be changed while a server is running.\n' );
		return;

	}

	let n = Q_atoi( Cmd_Argv( 1 ) );
	if ( n < 1 )
		n = 1;
	if ( n > svs.maxclientslimit ) {

		n = svs.maxclientslimit;
		Con_Printf( '"maxplayers" set to "' + n + '"\n' );

	}

	if ( ( n === 1 ) && listening )
		Cbuf_AddText( 'listen 0\n' );

	if ( ( n > 1 ) && ( ! listening ) )
		Cbuf_AddText( 'listen 1\n' );

	svs.maxclients = n;
	if ( n === 1 )
		Cvar_Set( 'deathmatch', '0' );
	else
		Cvar_Set( 'deathmatch', '1' );

}

/*
===================
NET_WindowHost_f
===================
*/
// windowhost [session | -]: the session players' windows join this page's server on (card [37a]); "-" stops
function NET_WindowHost_f() {

	if ( Cmd_Argc() !== 2 ) {

		Con_Printf( '"windowhost" is "' + ( Window_HostSession() ?? '' ) + '"\n' );
		return;

	}

	const session = Cmd_Argv( 1 ) === '-' ? null : Cmd_Argv( 1 );
	if ( ! Window_Host( session ) ) Con_Printf( 'windowhost: cannot host "' + Cmd_Argv( 1 ) + '" (an id of letters, digits and dashes; not while players are connected)\n' );

}

/*
===================
NET_Port_f
===================
*/
function NET_Port_f() {

	if ( Cmd_Argc() !== 2 ) {

		Con_Printf( '"port" is "' + net_hostport + '"\n' );
		return;

	}

	const n = Q_atoi( Cmd_Argv( 1 ) );
	if ( n < 1 || n > 65534 ) {

		Con_Printf( 'Bad value, must be between 1 and 65534\n' );
		return;

	}

	set_DEFAULTnet_hostport( n );
	set_net_hostport( n );

	if ( listening ) {

		// force a change to the new port
		Cbuf_AddText( 'listen 0\n' );
		Cbuf_AddText( 'listen 1\n' );

	}

}

/*
===================
PrintSlistHeader
===================
*/
function PrintSlistHeader() {

	Con_Printf( 'Server          Map             Users\n' );
	Con_Printf( '--------------- --------------- -----\n' );
	slistLastShown = 0;

}

/*
===================
PrintSlist
===================
*/
function PrintSlist() {

	for ( let n = slistLastShown; n < hostCacheCount; n ++ ) {

		if ( hostcache[ n ].maxusers )
			Con_Printf( hostcache[ n ].name + ' ' + hostcache[ n ].map + ' ' + hostcache[ n ].users + '/' + hostcache[ n ].maxusers + '\n' );
		else
			Con_Printf( hostcache[ n ].name + ' ' + hostcache[ n ].map + '\n' );

	}

	slistLastShown = hostCacheCount;

}

/*
===================
PrintSlistTrailer
===================
*/
function PrintSlistTrailer() {

	if ( hostCacheCount )
		Con_Printf( '== end list ==\n\n' );
	else
		Con_Printf( 'No Quake servers found.\n\n' );

}

/*
===================
NET_Slist_f
===================
*/
/**
 * Console command `slist` (WinQuake net_main.c): starts a search for servers. Ignored while a search is in progress.
 * Clears the host cache and schedules the send and poll procedures; for the next 1.5 seconds `NET_Poll` asks each
 * driver (skipping loopback unless `slistLocal`) to search, and unless `slistSilent` the results are printed to the
 * console as they arrive. The search clears `slistSilent` and sets `slistLocal` when it ends.
 */
export function NET_Slist_f() {

	if ( slistInProgress )
		return;

	if ( ! slistSilent ) {

		Con_Printf( 'Looking for Quake servers...\n' );
		PrintSlistHeader();

	}

	set_slistInProgress( true );
	slistStartTime = Sys_FloatTime();

	SchedulePollProcedure( slistSendProcedure, 0.0 );
	SchedulePollProcedure( slistPollProcedure, 0.1 );

	set_hostCacheCount( 0 );

}

/*
===================
Slist_Send
===================
*/
function Slist_Send() {

	for ( let i = 0; i < net_numdrivers; i ++ ) {

		set_net_driverlevel( i );
		if ( ! slistLocal && net_driverlevel === 0 )
			continue;
		if ( net_drivers[ net_driverlevel ].initialized === false )
			continue;
		net_drivers[ net_driverlevel ].SearchForHosts( true );

	}

	if ( ( Sys_FloatTime() - slistStartTime ) < 0.5 )
		SchedulePollProcedure( slistSendProcedure, 0.75 );

}

/*
===================
Slist_Poll
===================
*/
function Slist_Poll() {

	for ( let i = 0; i < net_numdrivers; i ++ ) {

		set_net_driverlevel( i );
		if ( ! slistLocal && net_driverlevel === 0 )
			continue;
		if ( net_drivers[ net_driverlevel ].initialized === false )
			continue;
		net_drivers[ net_driverlevel ].SearchForHosts( false );

	}

	if ( ! slistSilent )
		PrintSlist();

	if ( ( Sys_FloatTime() - slistStartTime ) < 1.5 ) {

		SchedulePollProcedure( slistPollProcedure, 0.1 );
		return;

	}

	if ( ! slistSilent )
		PrintSlistTrailer();
	set_slistInProgress( false );
	set_slistSilent( false );
	set_slistLocal( true );

}

const slistSendProcedure = new PollProcedure( null, 0.0, Slist_Send );
const slistPollProcedure = new PollProcedure( null, 0.0, Slist_Poll );

/*
===================
NET_Connect
===================
*/
/**
 * Connects to a host (WinQuake net_main.c). For local connections, this is synchronous. For remote connections
 * (WebTransport), this returns a Promise. Called by `CL_EstablishConnection`, which awaits the Promise with a
 * 30-second timeout.
 *
 * `local` uses only the loopback driver. A name found in the host cache (from `slist`) is replaced by its connect
 * name. Any other non-empty host uses only the WebTransport driver and never falls back to loopback. A null host tries
 * every initialised driver in order.
 *
 * @param {?string} host `local`, a server name from the host cache, a WebTransport address, or null
 * @returns {?qsocket_t|Promise<?qsocket_t>} the loopback socket, a Promise for the remote socket (which may reject;
 *   the error is not caught here), or null when no driver could connect (WebTransport unavailable is reported on the
 *   console)
 */
export function NET_Connect( host ) {

	SetNetTime();

	if ( host && host.length === 0 )
		host = null;

	if ( host ) {

		if ( host.toLowerCase() === 'local' ) {

			// only use loopback driver
			set_net_driverlevel( 0 );
			if ( net_drivers[ 0 ].initialized === false )
				return null;
			const ret = net_drivers[ 0 ].Connect( host );
			return ret;

		}

		if ( hostCacheCount ) {

			for ( let n = 0; n < hostCacheCount; n ++ ) {

				if ( host.toLowerCase() === hostcache[ n ].name.toLowerCase() ) {

					host = hostcache[ n ].cname;
					break;

				}

			}

		}

	}

	// Another window of this page hosting local play (card [37a]): only the window driver
	if ( host && host.startsWith( WINDOW_ADDRESS_PREFIX ) ) {

		for ( let i = 0; i < net_numdrivers; i ++ ) {

			if ( net_drivers[ i ].name !== 'Window' ) continue;
			if ( net_drivers[ i ].initialized === false ) break;
			set_net_driverlevel( i );
			return net_drivers[ i ].Connect( host );

		}
		Con_Printf( 'NET_Connect: local play across windows is not available here\n' );
		return null;

	}

	// Check if this looks like a remote address (not 'local')
	// For remote connections, ONLY use WebTransport - never fallback to loopback
	if ( host && host !== 'local' ) {

		// Remote connection - must use WebTransport
		if ( net_numdrivers <= 1 || net_drivers[ 1 ].name !== 'WebTransport' || ! net_drivers[ 1 ].initialized ) { // slot 1 is the window driver when there is no WebTransport

			Con_Printf( 'NET_Connect: WebTransport not available for remote connection\n' );
			return null;

		}

		set_net_driverlevel( 1 ); // WebTransport driver

		// WebTransport Connect is async, return the promise
		// If it fails, the error will propagate - do NOT fallback to loopback
		const ret = net_drivers[ 1 ].Connect( host );
		if ( ret ) return ret;

		// WebTransport failed to start connection
		Con_Printf( 'NET_Connect: failed to connect to %s\n', host );
		return null;

	}

	// Local connection - use loopback driver
	for ( let i = 0; i < net_numdrivers; i ++ ) {

		set_net_driverlevel( i );
		if ( net_drivers[ net_driverlevel ].initialized === false )
			continue;
		const ret = net_drivers[ net_driverlevel ].Connect( host );
		if ( ret )
			return ret;

	}

	return null;

}

/*
===================
NET_CheckNewConnections
===================
*/
/**
 * Polls the drivers for a new incoming connection (WinQuake net_main.c). Called in a loop by the server each frame
 * (`SV_CheckForNewClients`) until it returns null. Drivers other than loopback are skipped unless listening.
 *
 * @returns {?qsocket_t} the new connection's socket, or null when there is none
 */
export function NET_CheckNewConnections() {

	SetNetTime();

	for ( let i = 0; i < net_numdrivers; i ++ ) {

		set_net_driverlevel( i );
		if ( net_drivers[ net_driverlevel ].initialized === false )
			continue;
		if ( net_driverlevel !== 0 && listening === false )
			continue;
		const ret = net_drivers[ net_driverlevel ].CheckNewConnections();
		if ( ret != null ) {

			return ret;

		}

	}

	return null;

}

/*
===================
NET_Close
===================
*/
/**
 * Closes a connection through its driver and returns the socket to the free list (WinQuake net_main.c). Called on
 * client disconnect, when the server drops a client, at shutdown and when `NET_GetMessage` detects a timeout. Does
 * nothing for null or already disconnected sockets.
 *
 * @param {?qsocket_t} sock socket to close; must not be used afterwards
 */
export function NET_Close( sock ) {

	if ( ! sock )
		return;

	if ( sock.disconnected )
		return;

	SetNetTime();

	// call the driver_Close function
	net_drivers[ sock.driver ].Close( sock );

	NET_FreeQSocket( sock );

}

/*
=================
NET_GetMessage
=================
*/
/**
 * If there is a complete message, return it in net_message (WinQuake net_main.c). Called by `CL_GetMessage` on the
 * client, by the server for each client, and by `NET_SendToAll` while it waits. For non-loopback sockets, a socket
 * with no message for longer than `net_messagetimeout` seconds (default 300) is closed, and any message refreshes
 * `lastMessageTime`.
 *
 * @param {?qsocket_t} sock connection to read
 * @returns {number} 0 if no data is waiting, 1 if a message was received, 2 if an unreliable message was received,
 *   -1 if connection is invalid (null, disconnected, closed by the driver or timed out)
 */
export function NET_GetMessage( sock ) {

	if ( ! sock )
		return - 1;

	if ( sock.disconnected ) {

		Con_Printf( 'NET_GetMessage: disconnected socket\n' );
		return - 1;

	}

	SetNetTime();

	const ret = net_drivers[ sock.driver ].QGetMessage( sock );

	// see if this connection has timed out
	if ( ret === 0 && sock.driver ) {

		if ( net_time - sock.lastMessageTime > net_messagetimeout.value ) {

			NET_Close( sock );
			return - 1;

		}

	}

	if ( ret > 0 ) {

		if ( sock.driver ) {

			sock.lastMessageTime = net_time;
			if ( ret === 1 ) {

				// messagesReceived ++ handled in net.js
				// For now just track locally
			}

		}

	}

	return ret;

}

/*
==================
NET_SendMessage
==================
*/
/**
 * Try to send a complete length+message unit over the reliable stream (WinQuake net_main.c). Callers check
 * `NET_CanSendMessage` first; used for `cls.message` on the client and each client's `message` on the server.
 *
 * @param {?qsocket_t} sock connection to send on
 * @param {sizebuf_t} data message; `cursize` bytes of `data` are sent
 * @returns {number} 0 if the message cannot be delivered reliably, but the connection is still considered valid; 1 if
 *   the message was sent properly; -1 if the connection died (or `sock` is null or disconnected)
 */
export function NET_SendMessage( sock, data ) {

	if ( ! sock )
		return - 1;

	if ( sock.disconnected ) {

		Con_Printf( 'NET_SendMessage: disconnected socket\n' );
		return - 1;

	}

	SetNetTime();
	const r = net_drivers[ sock.driver ].QSendMessage( sock, data );

	return r;

}

/*
==================
NET_SendUnreliableMessage
==================
*/
/**
 * Sends a message that may be lost (WinQuake net_main.c): the client's move each frame (`CL_SendMove`), the
 * disconnect notice, and the server's per-frame entity datagrams.
 *
 * @param {?qsocket_t} sock connection to send on
 * @param {sizebuf_t} data message; `cursize` bytes of `data` are sent
 * @returns {number} the driver's result: 1 when sent (or deliberately dropped), 0 when the loopback buffer is full,
 *   -1 when the connection is dead (or `sock` is null or
 *   disconnected; the console message reads "NET_SendMessage" as in the source)
 */
export function NET_SendUnreliableMessage( sock, data ) {

	if ( ! sock )
		return - 1;

	if ( sock.disconnected ) {

		Con_Printf( 'NET_SendMessage: disconnected socket\n' );
		return - 1;

	}

	SetNetTime();
	const r = net_drivers[ sock.driver ].SendUnreliableMessage( sock, data );

	return r;

}

/*
==================
NET_CanSendMessage
==================
*/
/**
 * Returns true or false if the given qsocket can currently accept a message to be transmitted (WinQuake net_main.c),
 * i.e. the previous reliable message has been acknowledged. Checked before every `NET_SendMessage`.
 *
 * @param {?qsocket_t} sock connection to test
 * @returns {boolean} the driver's answer; false for a null or disconnected socket
 */
export function NET_CanSendMessage( sock ) {

	if ( ! sock )
		return false;

	if ( sock.disconnected )
		return false;

	SetNetTime();

	const r = net_drivers[ sock.driver ].CanSendMessage( sock );

	return r;

}

/*
==================
NET_CanSendUnreliableMessage
==================
*/
/**
 * Returns true or false if the given qsocket can currently accept an unreliable message to be transmitted (WinQuake
 * net_main.c). Checked by the server before each client's datagram.
 *
 * @param {?qsocket_t} sock connection to test
 * @returns {boolean} the driver's answer; false for a null or disconnected socket
 */
export function NET_CanSendUnreliableMessage( sock ) {

	if ( ! sock )
		return false;

	if ( sock.disconnected )
		return false;

	SetNetTime();

	const r = net_drivers[ sock.driver ].CanSendUnreliableMessage( sock );

	return r;

}

/*
==================
NET_SendToAll
==================
*/
/**
 * This is a reliable *blocking* send to all attached clients (WinQuake net_main.c). Used by `Host_ShutdownServer` and
 * `SV_SendReconnect` (both with a 5-second limit). Loopback clients get the message at once; remote ones are sent it
 * when they can accept it, then waited on until it is acknowledged, reading their messages meanwhile. For browser and
 * loopback this loop is essentially instant, but it does busy-wait up to `blocktime` for remote clients.
 *
 * @param {sizebuf_t} data message to send to every active client
 * @param {number} blocktime longest wait, in seconds
 * @returns {number} how many clients were still pending when it gave up (0 when all were served)
 */
export function NET_SendToAll( data, blocktime ) {

	const start = Sys_FloatTime();
	let count = 0;
	const state1 = new Array( MAX_SCOREBOARD ).fill( false );
	const state2 = new Array( MAX_SCOREBOARD ).fill( false );

	for ( let i = 0; i < svs.maxclients; i ++ ) {

		const client = svs.clients[ i ];
		if ( ! client.netconnection )
			continue;
		if ( client.active ) {

			if ( client.netconnection.driver === 0 ) {

				NET_SendMessage( client.netconnection, data );
				state1[ i ] = true;
				state2[ i ] = true;
				continue;

			}

			count ++;
			state1[ i ] = false;
			state2[ i ] = false;

		} else {

			state1[ i ] = true;
			state2[ i ] = true;

		}

	}

	// For browser/loopback, the while loop is essentially instant
	while ( count ) {

		count = 0;
		for ( let i = 0; i < svs.maxclients; i ++ ) {

			const client = svs.clients[ i ];

			if ( ! state1[ i ] ) {

				if ( NET_CanSendMessage( client.netconnection ) ) {

					state1[ i ] = true;
					NET_SendMessage( client.netconnection, data );

				} else {

					NET_GetMessage( client.netconnection );

				}

				count ++;
				continue;

			}

			if ( ! state2[ i ] ) {

				if ( NET_CanSendMessage( client.netconnection ) ) {

					state2[ i ] = true;

				} else {

					NET_GetMessage( client.netconnection );

				}

				count ++;
				continue;

			}

		}

		if ( ( Sys_FloatTime() - start ) > blocktime )
			break;

	}

	return count;

}

/*
====================
NET_Init
====================
*/
/**
 * Starts networking (WinQuake net_main.c). Called once by `Host_Init`.
 *
 * Reads `-port`/`-udpport`/`-ipxport` and `-listen` from the command line, allocates `svs.maxclientslimit + 1`
 * sockets into the free list (one extra for the local client), allocates `net_message` at loopback size and shares it
 * with common.js, registers `net_messagetimeout`, `hostname` and the `slist`, `listen`, `maxplayers` and `port`
 * commands, then installs and initialises the loopback driver (0) and, when the browser has WebTransport, the
 * WebTransport driver (1). A driver whose `Init` returns -1 stays uninitialised.
 *
 * @throws {Error} via `Sys_Error` when `-port` (or its aliases) is the last argument
 */
export function NET_Init() {

	let i = COM_CheckParm( '-port' );
	if ( i === 0 )
		i = COM_CheckParm( '-udpport' );
	if ( i === 0 )
		i = COM_CheckParm( '-ipxport' );

	if ( i !== 0 ) {

		if ( i < com_argc - 1 )
			set_DEFAULTnet_hostport( Q_atoi( com_argv[ i + 1 ] ) );
		else
			Sys_Error( 'NET_Init: you must specify a number after -port' );

	}

	set_net_hostport( DEFAULTnet_hostport );

	if ( COM_CheckParm( '-listen' ) )
		listening = true;

	set_net_numsockets( svs.maxclientslimit );
	// non-dedicated, add one more for client
	set_net_numsockets( net_numsockets + 1 );

	SetNetTime();

	// allocate qsockets into the free list
	for ( let j = 0; j < net_numsockets; j ++ ) {

		const s = new qsocket_t();
		s.next = net_freeSockets;
		set_net_freeSockets( s );
		s.disconnected = true;

	}

	// allocate space for network message buffer
	SZ_Alloc( net_message, NET_LOOP_MAXMESSAGE ); // (a local game's packets can be larger than a network one's)

	// Share the canonical net_message with common.js (MSG_Read* functions)
	COM_SetNetMessage( net_message );

	Cvar_RegisterVariable( net_messagetimeout );
	Cvar_RegisterVariable( hostname );

	Cmd_AddCommand( 'slist', NET_Slist_f );
	Cmd_AddCommand( 'listen', NET_Listen_f );
	Cmd_AddCommand( 'maxplayers', MaxPlayers_f );
	Cmd_AddCommand( 'port', NET_Port_f );
	Cmd_AddCommand( 'windowhost', NET_WindowHost_f );

	// Set up the loopback driver (driver 0) for single-player
	set_net_numdrivers( 1 );
	net_drivers[ 0 ].name = 'Loopback';
	net_drivers[ 0 ].Init = Loop_Init;
	net_drivers[ 0 ].Listen = Loop_Listen;
	net_drivers[ 0 ].SearchForHosts = Loop_SearchForHosts;
	net_drivers[ 0 ].Connect = Loop_Connect;
	net_drivers[ 0 ].CheckNewConnections = Loop_CheckNewConnections;
	net_drivers[ 0 ].QGetMessage = Loop_GetMessage;
	net_drivers[ 0 ].QSendMessage = Loop_SendMessage;
	net_drivers[ 0 ].SendUnreliableMessage = Loop_SendUnreliableMessage;
	net_drivers[ 0 ].CanSendMessage = Loop_CanSendMessage;
	net_drivers[ 0 ].CanSendUnreliableMessage = Loop_CanSendUnreliableMessage;
	net_drivers[ 0 ].Close = Loop_Close;
	net_drivers[ 0 ].Shutdown = Loop_Shutdown;

	// Set up the WebTransport driver (driver 1) for multiplayer
	if ( typeof WebTransport !== 'undefined' ) {

		set_net_numdrivers( 2 );
		net_drivers[ 1 ].name = 'WebTransport';
		net_drivers[ 1 ].Init = WT_Init;
		net_drivers[ 1 ].Listen = WT_Listen;
		net_drivers[ 1 ].SearchForHosts = WT_SearchForHosts;
		net_drivers[ 1 ].Connect = WT_Connect;
		net_drivers[ 1 ].CheckNewConnections = WT_CheckNewConnections;
		net_drivers[ 1 ].QGetMessage = WT_QGetMessage;
		net_drivers[ 1 ].QSendMessage = WT_QSendMessage;
		net_drivers[ 1 ].SendUnreliableMessage = WT_SendUnreliableMessage;
		net_drivers[ 1 ].CanSendMessage = WT_CanSendMessage;
		net_drivers[ 1 ].CanSendUnreliableMessage = WT_CanSendUnreliableMessage;
		net_drivers[ 1 ].Close = WT_Close;
		net_drivers[ 1 ].Shutdown = WT_Shutdown;

	}

	// The window driver (next free slot) for local play across browser windows (card [37a])
	if ( typeof BroadcastChannel !== 'undefined' ) {

		const w = net_numdrivers;
		set_net_numdrivers( w + 1 );
		net_drivers[ w ].name = 'Window';
		net_drivers[ w ].Init = Window_Init;
		net_drivers[ w ].Listen = Window_Listen;
		net_drivers[ w ].SearchForHosts = Window_SearchForHosts;
		net_drivers[ w ].Connect = Window_Connect;
		net_drivers[ w ].CheckNewConnections = Window_CheckNewConnections;
		net_drivers[ w ].QGetMessage = Window_GetMessage;
		net_drivers[ w ].QSendMessage = Window_SendMessage;
		net_drivers[ w ].SendUnreliableMessage = Window_SendUnreliableMessage;
		net_drivers[ w ].CanSendMessage = Window_CanSendMessage;
		net_drivers[ w ].CanSendUnreliableMessage = Window_CanSendUnreliableMessage;
		net_drivers[ w ].Close = Window_Close;
		net_drivers[ w ].Shutdown = Window_Shutdown;

	}

	// initialize all the drivers
	for ( let d = 0; d < net_numdrivers; d ++ ) {

		set_net_driverlevel( d );
		const controlSocket = net_drivers[ net_driverlevel ].Init();
		if ( controlSocket === - 1 )
			continue;
		net_drivers[ net_driverlevel ].initialized = true;
		net_drivers[ net_driverlevel ].controlSock = controlSocket;
		if ( listening )
			net_drivers[ net_driverlevel ].Listen( true );

	}

	Con_Printf( 'NET_Init complete\n' );

}

/*
====================
NET_Shutdown
====================
*/
/**
 * Closes every active socket and shuts down every initialised driver (WinQuake net_main.c). Called once by
 * `Host_Shutdown`.
 */
export function NET_Shutdown() {

	SetNetTime();

	let sock = net_activeSockets;
	while ( sock ) {

		const next = sock.next;
		NET_Close( sock );
		sock = next;

	}

	// shutdown the drivers
	for ( let i = 0; i < net_numdrivers; i ++ ) {

		set_net_driverlevel( i );
		if ( net_drivers[ net_driverlevel ].initialized === true ) {

			net_drivers[ net_driverlevel ].Shutdown();
			net_drivers[ net_driverlevel ].initialized = false;

		}

	}

}

/*
===================
NET_Poll
===================
*/
/**
 * Runs every scheduled poll procedure whose time has come, in time order (WinQuake net_main.c). Called by the host
 * once per frame. Each procedure is removed before it runs and may reschedule itself with `SchedulePollProcedure`.
 * Also sets the module's `configRestored` flag, which nothing else reads.
 */
export function NET_Poll() {

	configRestored = true;

	SetNetTime();

	let pp = pollProcedureList;
	while ( pp ) {

		if ( pp.nextTime > net_time )
			break;
		pollProcedureList = pp.next;
		pp.procedure( pp.arg );
		pp = pollProcedureList;

	}

}

/*
===================
SchedulePollProcedure
===================
*/
/**
 * Inserts a procedure into the time-ordered poll list for `NET_Poll` to run (WinQuake net_main.c). Used by the server
 * search (`NET_Slist_f`). A procedure already in the list must not be scheduled again before it has run, since the
 * list is singly linked through `proc.next`.
 *
 * @param {PollProcedure} proc procedure to run; mutated (`nextTime`, `next`)
 * @param {number} timeOffset delay from now, in seconds
 */
export function SchedulePollProcedure( proc, timeOffset ) {

	proc.nextTime = Sys_FloatTime() + timeOffset;

	let pp = pollProcedureList;
	let prev = null;
	while ( pp ) {

		if ( pp.nextTime >= proc.nextTime )
			break;
		prev = pp;
		pp = pp.next;

	}

	if ( prev === null ) {

		proc.next = pollProcedureList;
		pollProcedureList = proc;
		return;

	}

	proc.next = pp;
	prev.next = proc;

}
