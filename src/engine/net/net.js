/**
 * @module engine/net/net
 *
 * The networking interface (WinQuake net.h): constants and the socket structure shared by the drivers.
 *
 * Types: exported classes `qsocket_t`, `net_landriver_t`, `net_driver_t`, `hostcache_t`, `PollProcedure`.
 *
 * State: mutable exports `net_activeSockets`, `net_freeSockets`, `net_numsockets`, `net_numdrivers`,
 * `net_numlandrivers`, `DEFAULTnet_hostport`, `net_hostport`, `net_driverlevel`, `serialAvailable`, `ipxAvailable`,
 * `tcpipAvailable`, `my_ipx_address` and 11 more.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/net.h -- quake's interface to the networking layer

import { MAX_DATAGRAM } from '../common/quakedef.js';
import { sizebuf_t } from '../common/common.js';

//============================================================================
// Network constants
//============================================================================

export const NET_NAMELEN = 64;

export const NET_MAXMESSAGE = 8192;
// the in-memory loopback link of a local game carries larger packets (MAX_DATAGRAM_LOCAL); its buffers are this size
export const NET_LOOP_MAXMESSAGE = 65536;
export const NET_HEADERSIZE = ( 2 * 4 ); // 2 * sizeof(unsigned int)
export const NET_DATAGRAMSIZE = ( MAX_DATAGRAM + NET_HEADERSIZE );

// NetHeader flags
export const NETFLAG_LENGTH_MASK = 0x0000ffff;
export const NETFLAG_DATA = 0x00010000;
export const NETFLAG_ACK = 0x00020000;
export const NETFLAG_NAK = 0x00040000;
export const NETFLAG_EOM = 0x00080000;
export const NETFLAG_UNRELIABLE = 0x00100000;
export const NETFLAG_CTL = 0x80000000;

export const NET_PROTOCOL_VERSION = 3;

// Connection request types
export const CCREQ_CONNECT = 0x01;
export const CCREQ_SERVER_INFO = 0x02;
export const CCREQ_PLAYER_INFO = 0x03;
export const CCREQ_RULE_INFO = 0x04;

// Connection reply types
export const CCREP_ACCEPT = 0x81;
export const CCREP_REJECT = 0x82;
export const CCREP_SERVER_INFO = 0x83;
export const CCREP_PLAYER_INFO = 0x84;
export const CCREP_RULE_INFO = 0x85;

export const HOSTCACHESIZE = 8;

export const MAX_NET_DRIVERS = 8;

//============================================================================
// qsocket_t - network socket structure
//============================================================================

export class qsocket_t {

	/**
	 * Creates one connection endpoint (WinQuake net.h qsocket_t). NET_Init allocates the whole pool once at startup
	 * (`svs.maxclientslimit` + 1 for the local client) onto the `net_freeSockets` list; NET_NewQSocket moves one to
	 * `net_activeSockets` and resets its fields, and NET_FreeQSocket returns it, so a socket object is reused across
	 * connections.
	 *
	 * Fields: `next` (list link), `connecttime` / `lastMessageTime` / `lastSendTime` (`net_time` seconds), `disconnected`,
	 * `canSend`, `sendNext`, `driver` (index into `net_drivers`: 0 loopback, 1 WebTransport, then the window driver),
	 * `landriver`, `socket`, `driverdata` (driver-owned object, for example the WebTransport connection), sequence
	 * counters (`ackSequence` is the newest packet the peer acknowledged; the WebTransport driver sets it to -1 until the
	 * first ack), `sendMessage` / `receiveMessage` (byte buffers of `NET_LOOP_MAXMESSAGE` bytes each) with their lengths,
	 * `addr` and `address` (printable peer address).
	 */
	constructor() {

		this.next = null;
		this.connecttime = 0;
		this.lastMessageTime = 0;
		this.lastSendTime = 0;

		this.disconnected = false;
		this.canSend = false;
		this.sendNext = false;

		this.driver = 0;
		this.landriver = 0;
		this.socket = 0;
		this.driverdata = null;

		this.ackSequence = 0;
		this.sendSequence = 0;
		this.unreliableSendSequence = 0;
		this.sendMessageLength = 0;
		this.sendMessage = new Uint8Array( NET_LOOP_MAXMESSAGE );

		this.receiveSequence = 0;
		this.unreliableReceiveSequence = 0;
		this.receiveMessageLength = 0;
		this.receiveMessage = new Uint8Array( NET_LOOP_MAXMESSAGE );

		this.addr = null;
		this.address = '';

	}

}

//============================================================================
// net_landriver_t - low-level network driver interface
//============================================================================

export class net_landriver_t {

	/**
	 * Creates an empty low-level (LAN) driver table, WinQuake net.h net_landriver_t: a name, an `initialized` flag, a
	 * control socket and null function slots (`Init`, `Read`, `Write`, `Broadcast`, address helpers...). The
	 * `MAX_NET_DRIVERS` entries of `net_landrivers` are allocated once at module load; no driver in this port fills
	 * them, since the browser drivers are high-level `net_driver_t`s.
	 */
	constructor() {

		this.name = '';
		this.initialized = false;
		this.controlSock = 0;
		this.Init = null;
		this.Shutdown = null;
		this.Listen = null;
		this.OpenSocket = null;
		this.CloseSocket = null;
		this.Connect = null;
		this.CheckNewConnections = null;
		this.Read = null;
		this.Write = null;
		this.Broadcast = null;
		this.AddrToString = null;
		this.StringToAddr = null;
		this.GetSocketAddr = null;
		this.GetNameFromAddr = null;
		this.GetAddrFromName = null;
		this.AddrCompare = null;
		this.GetSocketPort = null;
		this.SetSocketPort = null;

	}

}

//============================================================================
// net_driver_t - high-level network driver interface
//============================================================================

export class net_driver_t {

	/**
	 * Creates an empty high-level driver table, WinQuake net.h net_driver_t. The `MAX_NET_DRIVERS` entries of
	 * `net_drivers` are allocated once at module load and NET_Init fills slot 0 with the loopback functions (`Loop_*`)
	 * and, when the browser has WebTransport, slot 1 with the `WT_*` functions. `initialized` is set by the
	 * driver's `Init`; NET_* calls dispatch through `net_drivers[sock.driver]` or `net_drivers[net_driverlevel]`.
	 */
	constructor() {

		this.name = '';
		this.initialized = false;
		this.Init = null;
		this.Listen = null;
		this.SearchForHosts = null;
		this.Connect = null;
		this.CheckNewConnections = null;
		this.QGetMessage = null;
		this.QSendMessage = null;
		this.SendUnreliableMessage = null;
		this.CanSendMessage = null;
		this.CanSendUnreliableMessage = null;
		this.Close = null;
		this.Shutdown = null;
		this.controlSock = 0;

	}

}

//============================================================================
// hostcache_t - server browser cache entry
//============================================================================

export class hostcache_t {

	/**
	 * Creates an empty server browser cache entry (WinQuake net.h hostcache_t). The `HOSTCACHESIZE` (8) entries of
	 * `hostcache` are allocated once at module load and rewritten by each `slist` search (`hostCacheCount` says how
	 * many are valid). Fields: `name` (display name), `map`, `cname` (connect name NET_Connect substitutes when the
	 * user types `name`), `users` / `maxusers`, `driver` (index into `net_drivers`), `ldriver`, `addr`.
	 */
	constructor() {

		this.name = '';
		this.map = '';
		this.cname = '';
		this.users = 0;
		this.maxusers = 0;
		this.driver = 0;
		this.ldriver = 0;
		this.addr = null;

	}

}

//============================================================================
// PollProcedure - for scheduled network polling
//============================================================================

export class PollProcedure {

	/**
	 * Creates a scheduled poll callback (WinQuake net.h PollProcedure). SchedulePollProcedure sets `nextTime` and links
	 * it into the time-ordered poll list; NET_Poll unlinks it and calls `procedure( arg )` once that time has passed.
	 * net_main.js keeps two module-lifetime instances for the server list search (Slist_Send, Slist_Poll).
	 *
	 * @param {?PollProcedure} [next] next entry in the poll list (falsy becomes null)
	 * @param {number} [nextTime] when to run, `Sys_FloatTime` seconds (falsy becomes 0); overwritten when scheduled
	 * @param {?function(*): void} [procedure] callback to run (falsy becomes null)
	 * @param {*} [arg] value passed to `procedure` (falsy becomes null)
	 */
	constructor( next, nextTime, procedure, arg ) {

		this.next = next || null;
		this.nextTime = nextTime || 0;
		this.procedure = procedure || null;
		this.arg = arg || null;

	}

}

//============================================================================
// Network globals
//============================================================================

export let net_activeSockets = null;
export let net_freeSockets = null;
export let net_numsockets = 0;

/**
 * Replaces the head of the active socket list; used by NET_NewQSocket and NET_FreeQSocket in net_main.js.
 *
 * @param {?qsocket_t} v new head (sockets are linked through `next`), or null when none are active
 */
export function set_net_activeSockets( v ) { net_activeSockets = v; }
/**
 * Replaces the head of the free socket list; used by NET_Init (building the pool), NET_NewQSocket and NET_FreeQSocket.
 *
 * @param {?qsocket_t} v new head (linked through `next`), or null when the pool is exhausted
 */
export function set_net_freeSockets( v ) { net_freeSockets = v; }
/**
 * Sets the size of the socket pool; NET_Init sets it once at startup to `svs.maxclientslimit` plus one for the local
 * client.
 *
 * @param {number} v number of qsockets allocated
 */
export function set_net_numsockets( v ) { net_numsockets = v; }

export let net_numdrivers = 0;
export const net_drivers = new Array( MAX_NET_DRIVERS );
for ( let i = 0; i < MAX_NET_DRIVERS; i ++ )
	net_drivers[ i ] = new net_driver_t();

export let net_numlandrivers = 0;
export const net_landrivers = new Array( MAX_NET_DRIVERS );
for ( let i = 0; i < MAX_NET_DRIVERS; i ++ )
	net_landrivers[ i ] = new net_landriver_t();

export let DEFAULTnet_hostport = 26000;
export let net_hostport = 26000;

/**
 * Sets the default host port; NET_Init uses it for `-port` / `-udpport` / `-ipxport`, and the `port` console command
 * for its argument.
 *
 * @param {number} v port number (the `port` command accepts 1..65534; the initial value is 26000)
 */
export function set_DEFAULTnet_hostport( v ) { DEFAULTnet_hostport = v; }
/**
 * Sets the port currently used for listening; NET_Init copies the default into it and the `port` command sets both.
 *
 * @param {number} v port number (1..65534 from the `port` command)
 */
export function set_net_hostport( v ) { net_hostport = v; }

export let net_driverlevel = 0;
/**
 * Selects the driver that the next driver-level call is made for (WinQuake's `net_driverlevel`, the `dfunc` macro).
 * NET_Listen_f, NET_Connect and the server-list search (Slist_Send, Slist_Poll) set it before calling into
 * `net_drivers`, and
 * NET_NewQSocket records it as the new socket's `driver`.
 *
 * @param {number} v index into `net_drivers`: 0 loopback, 1 WebTransport
 */
export function set_net_driverlevel( v ) { net_driverlevel = v; }

/**
 * Sets how many entries of `net_drivers` are in use; NET_Init sets 1 (loopback) and then 2 when the browser provides
 * WebTransport.
 *
 * @param {number} v driver count, 1..`MAX_NET_DRIVERS`
 */
export function set_net_numdrivers( v ) { net_numdrivers = v; }

export let serialAvailable = false;
export let ipxAvailable = false;
export let tcpipAvailable = false;

export let my_ipx_address = '';
export let my_tcpip_address = '';

export let net_time = 0;
/**
 * Stores the network clock; SetNetTime in net_main.js calls it with `Sys_FloatTime()` before connection and poll work.
 *
 * @param {number} v time in seconds (`Sys_FloatTime`)
 */
export function set_net_time( v ) { net_time = v; }

export const net_message = new sizebuf_t();
export let net_activeconnections = 0;
/**
 * Sets the number of connected clients; sv_main.js increments it when a client connects and decrements it on drop.
 * NET_NewQSocket refuses new sockets while it is at `svs.maxclients`, and the loopback server-list entry reports it.
 *
 * @param {number} v connected client count (0..`svs.maxclients`)
 */
export function set_net_activeconnections( v ) { net_activeconnections = v; }

export let messagesSent = 0;
export let messagesReceived = 0;
export let unreliableMessagesSent = 0;
export let unreliableMessagesReceived = 0;

export let hostCacheCount = 0;
/**
 * Sets how many `hostcache` entries are valid: NET_Slist_f clears it to 0 when a search starts, and
 * `Loop_SearchForHosts` sets 1 when a local server answers.
 *
 * @param {number} v valid entry count, 0..`HOSTCACHESIZE`
 */
export function set_hostCacheCount( v ) { hostCacheCount = v; }

export const hostcache = new Array( HOSTCACHESIZE );
for ( let i = 0; i < HOSTCACHESIZE; i ++ )
	hostcache[ i ] = new hostcache_t();

export let slistInProgress = false;
export let slistSilent = false;
export let slistLocal = true;

/**
 * Marks whether a server-list search is running: set true by NET_Slist_f, false by Slist_Poll when the 1.5 s
 * search ends.
 *
 * @param {boolean} v true while searching
 */
export function set_slistInProgress( v ) { slistInProgress = v; }
/**
 * Sets whether the running server-list search prints to the console; Slist_Poll resets it to false when a search
 * ends.
 *
 * @param {boolean} v true to search without printing the list
 */
export function set_slistSilent( v ) { slistSilent = v; }
/**
 * Sets whether the server-list search includes the loopback driver (driver 0); Slist_Poll resets it to true when a
 * search ends.
 *
 * @param {boolean} v false to skip the local server
 */
export function set_slistLocal( v ) { slistLocal = v; }
