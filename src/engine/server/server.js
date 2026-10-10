/**
 * @module engine/server/server
 *
 * Server structures and constants (WinQuake server.h): `server_t`, `client_t`, the server statics and the move types.
 *
 * Types: exported classes `server_static_t`, `server_t`, `client_frame_t`, `client_t`.
 *
 * State: mutable exports `host_client`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `host_client` is set through `set_host_client`.
 */
// Ported from: WinQuake/server.h -- server structures and constants

import { MAX_MODELS, MAX_SOUNDS, MAX_LIGHTSTYLES, MAX_DATAGRAM, MAX_MSGLEN, entity_state_t } from '../common/quakedef.js';

/** The signon's size: WinQuake's 8192 (some 550 static entities), or for the large-map protocol 48000, sent in one
 * message within MAX_MSGLEN and leaving room beside it in the loopback's 65536-byte buffer (card [34f]). */
export const SIGNON_SIZE_STANDARD = 8192, SIGNON_SIZE = 48000;
import { sizebuf_t } from '../common/common.js';
import { MAX_PACKET_ENTITIES_LOCAL, PE_UPDATE_BACKUP } from '../common/protocol.js';
import { cvar_t } from '../common/cvar.js';

//============================================================================
// Server state enum
//============================================================================

export const ss_loading = 0;
export const ss_active = 1;

//============================================================================
// server_static_t -- persistant server info
//============================================================================

export class server_static_t {

	/**
	 * Creates the persistent server info (WinQuake server.h server_static_t), which survives level changes. Its single
	 * instance is `svs`; Host_FindMaxClients (host.js) sets `maxclients` / `maxclientslimit` and allocates
	 * `svs.clients` (one `client_t` per slot) once at startup. `serverflags` carries episode completion between maps.
	 */
	constructor() {

		this.maxclients = 0;
		this.maxclientslimit = 0;
		this.clients = null; // Array of client_t [maxclients]
		this.serverflags = 0; // episode completion information
		this.changelevel_issued = false; // cleared when at SV_SpawnServer

	}

}

//============================================================================
// server_t -- local server state
//============================================================================

export class server_t {

	/**
	 * Creates an empty local server state (WinQuake server.h server_t): the current map, precache lists, edicts and
	 * the per-frame message buffers. Its single instance is `sv`; SV_SpawnServer (sv_main.js) resets it to a fresh
	 * `server_t` on every map load, so nothing in it outlives the level. `time` is server time in seconds.
	 */
	constructor() {

		this.active = false; // false if only a net client

		this.paused = false;
		this.loadgame = false; // handle connections specially

		this.time = 0;

		this.lastcheck = 0; // used by PF_checkclient
		this.lastchecktime = 0;

		this.name = ''; // map name (max 64)
		this.modelname = ''; // maps/<name>.bsp, for model_precache[0]
		this.worldmodel = null; // struct model_s *
		this.model_precache = new Array( MAX_MODELS ).fill( null ); // NULL terminated
		this.models = new Array( MAX_MODELS ).fill( null );
		this.sound_precache = new Array( MAX_SOUNDS ).fill( null ); // NULL terminated
		this.lightstyles = new Array( MAX_LIGHTSTYLES ).fill( null );
		this.num_edicts = 0;
		this.max_edicts = 0;
		this.edicts = null; // edict_t * -- can NOT be array indexed (variable sized)
		this.state = ss_loading; // some actions are only valid during load

		this.datagram = new sizebuf_t();
		this.datagram_buf = new Uint8Array( MAX_DATAGRAM );

		this.reliable_datagram = new sizebuf_t(); // copied to all clients at end of frame
		this.reliable_datagram_buf = new Uint8Array( MAX_DATAGRAM );

		this.protocol = 15; // PROTOCOL_VERSION, or PROTOCOL_LARGE when sv_protocol asks (card [34f])
		this.signon = new sizebuf_t();
		this.signon_buf = new Uint8Array( SIGNON_SIZE );

	}

}

//============================================================================
// client_frame_t -- per-frame entity snapshot for delta compression
// Ported from: QW/server/server.h
//============================================================================

export class client_frame_t {

	/**
	 * Creates one per-client frame snapshot for QW-style delta compression (ported from QW/server/server.h): the
	 * entities sent to that client in one server frame (`entities.num_entities` of `MAX_PACKET_ENTITIES_LOCAL`
	 * preallocated `entity_state_t`s) and `senttime` (`sv.time` in seconds when sent). Each `client_t` holds
	 * `PE_UPDATE_BACKUP` of them, indexed by its `outgoing_sequence & PE_UPDATE_MASK`; sv_main.js writes the slot
	 * when sending and reads the client's `delta_sequence` slot as the delta base.
	 */
	constructor() {

		this.senttime = 0;
		this.entities = { num_entities: 0, entities: [] };
		for ( let i = 0; i < MAX_PACKET_ENTITIES_LOCAL; i ++ ) {

			this.entities.entities.push( new entity_state_t() );

		}

	}

}

//============================================================================
// client_t -- per-client state on the server
//============================================================================

export const NUM_PING_TIMES = 16;
export const NUM_SPAWN_PARMS = 16;

export class client_t {

	/**
	 * Creates a free client slot (WinQuake server.h client_t), with its own reliable message buffer (`MAX_MSGLEN`
	 * bytes), ping history, spawn parms and `PE_UPDATE_BACKUP` delta frames. Host_FindMaxClients allocates the
	 * `svs.clients` slots once at startup, and SV_ConnectClient resets a slot to a fresh `client_t` (keeping its
	 * connection) when a player connects, which is once per game rather than per level: `spawn_parms` are carried
	 * from level to level.
	 */
	constructor() {

		this.active = false; // false = client is free
		this.spawned = false; // false = don't send datagrams
		this.dropasap = false; // has been told to go to another level
		this.privileged = false; // can execute any host command
		this.sendsignon = false; // only valid before spawned

		this.last_message = 0; // reliable messages must be sent periodically

		this.netconnection = null; // struct qsocket_s * -- communications handle

		this.cmd = null; // usercmd_t -- movement
		this.wishdir = new Float32Array( 3 ); // intended motion calced from cmd

		this.message = new sizebuf_t(); // can be added to at any time, copied and clear once per frame
		this.msgbuf = new Uint8Array( MAX_MSGLEN );
		this.edict = null; // edict_t * -- EDICT_NUM(clientnum+1)
		this.name = ''; // for printing to other people (max 32)
		this.colors = 0;

		this.ping_times = new Float32Array( NUM_PING_TIMES );
		this.num_pings = 0; // ping_times[num_pings%NUM_PING_TIMES]
		this.localtime = 0; // server time of last message (for PF_MSEC)

		// spawn parms are carried from level to level
		this.spawn_parms = new Float32Array( NUM_SPAWN_PARMS );

		// client known data for deltas
		this.old_frags = 0;
		this.old_ping = 0;

		// QW-style delta compression
		this.delta_sequence = - 1; // -1 = no compression
		this.outgoing_sequence = 0; // incremented each frame we send to this client
		this.frames = [];
		for ( let i = 0; i < PE_UPDATE_BACKUP; i ++ ) {

			this.frames.push( new client_frame_t() );

		}

	}

}

//============================================================================
// edict->movetype values
//============================================================================

export const MOVETYPE_NONE = 0; // never moves
export const MOVETYPE_ANGLENOCLIP = 1;
export const MOVETYPE_ANGLECLIP = 2;
export const MOVETYPE_WALK = 3; // gravity
export const MOVETYPE_STEP = 4; // gravity, special edge handling
export const MOVETYPE_FLY = 5;
export const MOVETYPE_TOSS = 6; // gravity
export const MOVETYPE_PUSH = 7; // no clip to world, push and crush
export const MOVETYPE_NOCLIP = 8;
export const MOVETYPE_FLYMISSILE = 9; // extra size to monsters
export const MOVETYPE_BOUNCE = 10;

//============================================================================
// edict->solid values
//============================================================================

export const SOLID_NOT = 0; // no interaction with other objects
export const SOLID_TRIGGER = 1; // touch on edge, but not blocking
export const SOLID_BBOX = 2; // touch on edge, block
export const SOLID_SLIDEBOX = 3; // touch on edge, but not an onground
export const SOLID_BSP = 4; // bsp clip, touch on edge, block

//============================================================================
// edict->deadflag values
//============================================================================

export const DEAD_NO = 0;
export const DEAD_DYING = 1;
export const DEAD_DEAD = 2;

export const DAMAGE_NO = 0;
export const DAMAGE_YES = 1;
export const DAMAGE_AIM = 2;

//============================================================================
// edict->flags
//============================================================================

export const FL_FLY = 1;
export const FL_SWIM = 2;
export const FL_CONVEYOR = 4;
export const FL_CLIENT = 8;
export const FL_INWATER = 16;
export const FL_MONSTER = 32;
export const FL_GODMODE = 64;
export const FL_NOTARGET = 128;
export const FL_ITEM = 256;
export const FL_ONGROUND = 512;
export const FL_PARTIALGROUND = 1024; // not all corners are valid
export const FL_WATERJUMP = 2048; // player jumping out of water
export const FL_JUMPRELEASED = 4096; // for jump debouncing

//============================================================================
// entity effects
//============================================================================

export const EF_BRIGHTFIELD = 1;
export const EF_MUZZLEFLASH = 2;
export const EF_BRIGHTLIGHT = 4;
export const EF_DIMLIGHT = 8;

//============================================================================
// spawn flags
//============================================================================

export const SPAWNFLAG_NOT_EASY = 256;
export const SPAWNFLAG_NOT_MEDIUM = 512;
export const SPAWNFLAG_NOT_HARD = 1024;
export const SPAWNFLAG_NOT_DEATHMATCH = 2048;

//============================================================================
// Extern cvars - defined in host.js, re-exported here for compatibility
//============================================================================

// Note: These are re-exported from host.js where they are defined and registered.
// This matches original Quake where cvars were defined in host.c and extern'd in server.h.
// the rules a game runs under (WinQuake declares them in host.c; registered by Host_InitLocal)
export const fraglimit = new cvar_t( 'fraglimit', '0', false, true );
export const timelimit = new cvar_t( 'timelimit', '0', false, true );
export const teamplay = new cvar_t( 'teamplay', '0', false, true );
export const skill = new cvar_t( 'skill', '1' ); // 0 - 3
export const deathmatch = new cvar_t( 'deathmatch', '0' ); // 0, 1, or 2
export const coop = new cvar_t( 'coop', '0' ); // 0 or 1

//============================================================================
// Global server state
//============================================================================

export const svs = new server_static_t(); // persistant server info
export const sv = new server_t(); // local server

export let host_client = null; // current client being processed
/**
 * Selects the client the server is currently processing (WinQuake's global `host_client`). sv_main.js, host.js and
 * host_cmd.js set it while looping over `svs.clients` (reading messages, sending updates, broadcasting) and while a
 * console command runs on a client's behalf, often saving and restoring the previous value.
 *
 * @param {?client_t} v the client slot, or null
 */
export function set_host_client( v ) { host_client = v; }
