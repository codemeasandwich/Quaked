// A real Hexen II session for tests that need live gamecode: mount the owned paks through the engine's own loaders and
// start the shared server with SV_SpawnServer, then connect and spawn clients through SV_ConnectClient and the same
// `prespawn`/`spawn`/`begin` commands a native client sends. This replaces the retired parallel host's _boot/_mount
// fixtures; skip cleanly when the owned data is absent.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../../src/engine/common/pak.js';
import { VID_SetPalette } from '../../src/engine/render/vid.js';
import { Mod_Init } from '../../src/engine/render/gl_model.js';
import { Cbuf_Init, Cmd_Init, Cmd_ExecuteString, src_client } from '../../src/engine/common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue } from '../../src/engine/common/cvar.js';
import { GameProfile_Get, GameProfile_IsHexen2, GameProfile_Set } from '../../src/engine/common/game_profile.js';
import { PR_InitBuiltins } from '../../src/engine/server/pr_cmds.js';
import { SV_ConnectClient, SV_SpawnServer } from '../../src/engine/server/sv_main.js';
import { sv, svs, client_t, coop, deathmatch, teamplay, set_host_client } from '../../src/engine/server/server.js';
import { cls, ca_dedicated } from '../../src/engine/client/client.js';
import { Host_InitCommands } from '../../src/engine/server/host_cmd.js';
import { skill } from '../../src/engine/server/host.js';
import { sv_gravity, SV_SetFrametime, SV_SetPlayer } from '../../src/engine/server/sv_phys.js';
import { r_hdr } from '../../src/newer/render/gl_post.js';
import { PR_GetString } from '../../src/engine/progs/progs.js';
import { GetEdictFieldValue } from '../../src/engine/progs/pr_edict.js';

export const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
export const PORTAL = '/Users/bri/quaked/Hexen 2/portals';
export const DEMO = '/Users/bri/quaked/Hexen 2 Shareware/hexen2-demo/data1';

let loadedGame = null;

/** The owned installation for an edition is present and readable enough to run a live level. */
export function hexen2DataPresent( gameId = 'hexen2' ) {

	if ( gameId === 'hexen2-demo' ) return existsSync( DEMO + '/pak0.pak' ) && existsSync( DEMO + '/progs.dat' );
	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! existsSync( HEXEN + '/progs.dat' ) ) return false;
	if ( gameId === 'hexen2-portals' ) return existsSync( PORTAL + '/pak3.pak' ) && existsSync( PORTAL + '/progs.dat' );
	return true;

}

function addPack( name, raw ) {

	pak.COM_AddPack( pak.COM_LoadPackFile( name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

}

/**
 * Mounts one supplied edition and initialises the shared host pieces a map spawn needs. Idempotent for the same game;
 * a process that needs two editions should use separate test files (each runs in its own process).
 *
 * @param {string} [gameId] `hexen2`, `hexen2-portals` or `hexen2-demo`
 * @returns {boolean} false when the owned installation is absent
 */
export function loadHexen2Data( gameId = 'hexen2' ) {

	if ( ! hexen2DataPresent( gameId ) ) return false;
	if ( loadedGame === gameId ) return true;
	if ( loadedGame !== null ) throw new Error( 'loadHexen2Data: ' + loadedGame + ' is already mounted; use a separate test file' );
	loadedGame = gameId;
	GameProfile_Set( gameId );

	if ( gameId === 'hexen2-demo' ) {

		for ( const name of [ 'pak0.pak', 'progs.dat', 'strings.txt', 'hexen.rc' ] ) {

			const path = DEMO + '/' + name;
			if ( ! existsSync( path ) ) continue;
			if ( name.endsWith( '.pak' ) ) addPack( 'live-demo-' + name, readFileSync( path ) );
			else {

				const data = new Uint8Array( readFileSync( path ) );
				pak.COM_AddPack( pak.COM_LoadPackFile( 'live-demo-' + name, pak.COM_BuildPack( [ { name, data } ] ) ) );

			}

		}

	} else {

		// The base game's packs always sit under the expansion, as native data1 does.
		for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) {

			const path = HEXEN + '/' + name;
			if ( existsSync( path ) ) addPack( 'live-' + name, readFileSync( path ) );

		}
		// The base data1 keeps progs.dat, strings.txt and hexen.rc loose beside the paks.
		const loose = [];
		for ( const name of [ 'progs.dat', 'strings.txt', 'hexen.rc' ] )
			if ( existsSync( HEXEN + '/' + name ) ) loose.push( { name, data: new Uint8Array( readFileSync( HEXEN + '/' + name ) ) } );
		if ( loose.length ) pak.COM_AddPack( pak.COM_LoadPackFile( 'live-loose', pak.COM_BuildPack( loose ) ) );

	}

	if ( gameId === 'hexen2-portals' ) {

		// Portal's loose program and strings override the base game's; pak3 carries its maps and art.
		const portalLoose = [];
		for ( const name of [ 'progs.dat', 'strings.txt', 'hexen.rc', 'puzzles.txt', 'infolist.txt', 'maplist.txt' ] )
			if ( existsSync( PORTAL + '/' + name ) ) portalLoose.push( { name, data: new Uint8Array( readFileSync( PORTAL + '/' + name ) ) } );
		pak.COM_AddPack( pak.COM_LoadPackFile( 'live-portal-loose', pak.COM_BuildPack( portalLoose ) ) );
		addPack( 'live-pak3.pak', readFileSync( PORTAL + '/pak3.pak' ) );

	}

	const palette = pak.COM_FindFile( 'gfx/palette.lmp' );
	if ( palette === null ) return false;
	VID_SetPalette( palette.data.buffer.slice( palette.data.byteOffset, palette.data.byteOffset + palette.data.byteLength ) );
	Mod_Init();
	PR_InitBuiltins();
	Cbuf_Init();
	Cmd_Init();
	Host_InitCommands();
	for ( const value of [ r_hdr, skill, sv_gravity, coop, deathmatch, teamplay ] )
		if ( ! Cvar_FindVar( value.name ) ) Cvar_RegisterVariable( value );
	Cvar_SetValue( 'r_hdr', 0 );
	Cvar_SetValue( 'skill', 1 );
	Cvar_SetValue( 'coop', 0 );
	Cvar_SetValue( 'deathmatch', 0 );
	Cvar_SetValue( '_cl_playerclass', gameId === 'hexen2-portals' ? 5 : 1 );
	return true;

}

function allocateClients( count ) {

	svs.maxclients = svs.maxclientslimit = Math.max( 1, count | 0 );
	svs.clients = Array.from( { length: svs.maxclients }, () => new client_t() );

}

/**
 * Resets the server and connects the client slots through SV_ConnectClient, then runs the native client signon commands.
 * The commands are the network path's `prespawn`, `spawn` and `begin`, executed as `src_client`; the player itself is
 * placed by the supplied gamecode's ClientConnect/PutClientInServer inside the shared `spawn` command.
 *
 * @param {object} session a session from `createHexen2Session`
 * @param {number[]} classNumbers one native playerclass per client
 * @returns {object} the same session, with `players` filled
 */
export function connectHexen2Clients( session, classNumbers ) {

	const classes = Array.isArray( classNumbers ) ? classNumbers : [ classNumbers ];
	session.players = [];
	for ( let i = 0; i < svs.maxclients; i ++ ) connectHexen2Client( session, i, classes[ i ] ?? classes[ 0 ] ?? 1 );
	session.classes = classes.slice();
	return session;

}

/**
 * Connects one client slot through SV_ConnectClient and its native signon commands.
 *
 * @param {object} session the live session
 * @param {number} index the client slot
 * @param {number} classNumber the native playerclass
 * @returns {object} the spawned player edict
 */
export function connectHexen2Client( session, index, classNumber = 1 ) {

	const client = svs.clients[ index ];
	// SV_ConnectClient prints the address and Host_Spawn_f reads the connect time; no peer socket exists in the harness.
	client.netconnection = { address: 'test-client-' + index, connecttime: 0, disconnected: false };
	SV_ConnectClient( index );
	client.name = 'client-' + index;
	client.colors = index;
	client.playerclass = classNumber;
	client.cmd = { viewangles: [ 0, 0, 0 ], forwardmove: 0, sidemove: 0, upmove: 0 };
	Cvar_SetValue( '_cl_playerclass', classNumber );
	set_host_client( client );
	SV_SetPlayer( client.edict );
	Cmd_ExecuteString( 'prespawn', src_client );
	Cmd_ExecuteString( 'spawn', src_client );
	Cmd_ExecuteString( 'begin', src_client );
	session.players[ index ] = client.edict;
	// No paired socket exists in the harness: later level changes must not try to send on the fixture connection.
	client.netconnection = null;
	return client.edict;

}

/**
 * Creates a live session: mounts the edition, resets the server and spawns a map, then optionally connects players.
 *
 * @param {string} [map] the map name without `maps/` or `.bsp`
 * @param {number|number[]} [classNumbers] the native playerclass for each client
 * @param {{ gameId?: string, startspot?: string, coop?: boolean, connect?: boolean }} [options]
 * @returns {{ sv: object, svs: object, clients: object[], players: object[], classes: number[] }} the live session
 */
export function createHexen2Session( map = 'demo1', classNumbers = 1, options = {} ) {

	const classes = Array.isArray( classNumbers ) ? classNumbers : [ classNumbers ];
	const gameId = options.gameId ?? ( GameProfile_Get().family === 'hexen2' ? GameProfile_Get().id : 'hexen2' );
	if ( ! loadHexen2Data( gameId ) ) throw new Error( 'the supplied Hexen II installation is not present' );
	allocateClients( classes.length );
	Cvar_SetValue( 'coop', options.coop ? 1 : 0 );
	Cvar_SetValue( 'deathmatch', 0 );
	Cvar_SetValue( '_cl_playerclass', classes[ 0 ] ?? 1 );
	sv.active = false;
	cls.state = ca_dedicated;
	SV_SpawnServer( map, options.startspot ?? '' );
	if ( ! sv.active ) throw new Error( 'the shared server did not start ' + map );
	const session = { sv, svs, clients: svs.clients, players: [], classes: classes.slice(), map };
	if ( options.connect !== false ) connectHexen2Clients( session, classes );
	SV_SetFrametime( 0.1 );
	return session;

}

/**
 * A one-player live session, kept as the helper's long-standing entry point.
 *
 * @param {string} [map] the map name without `maps/` or `.bsp`
 * @param {number} [classNumber] the native playerclass to hand the gamecode
 * @param {string} [startspot] the named `info_player_start` targetname
 * @returns {{ sv: object, svs: object, client: object, player: object, clients: object[], players: object[] }}
 */
export function spawnHexen2Map( map = 'demo1', classNumber = 1, startspot = '' ) {

	const session = createHexen2Session( map, classNumber, { startspot } );
	return { ...session, client: session.clients[ 0 ], player: session.players[ 0 ] };

}

/**
 * Spawns several players on one server, each through its own client slot and native class.
 *
 * @param {string} [map] the map name
 * @param {number[]} [classNumbers] one native playerclass per client
 * @param {{ startspot?: string, coop?: boolean }} [options]
 * @returns {object} the live session
 */
export function spawnHexen2Clients( map = 'demo1', classNumbers = [ 1, 2 ], options = {} ) {

	return createHexen2Session( map, classNumbers, { ...options, coop: options.coop ?? true } );

}

/**
 * Reconnects active client slots after a level change that was not a hub restore (the native reconnect + signon path).
 *
 * @param {object} session the live session
 * @param {number[]} [classNumbers] classes to use; the session's classes by default
 * @returns {object} the session
 */
export function reconnectHexen2Clients( session, classNumbers = session.classes ) {

	return connectHexen2Clients( session, classNumbers );

}

/** The first live entity with a classname, or undefined. */
export function findEntity( server, classname ) {

	for ( let i = 1; i < server.num_edicts; i ++ ) {

		const ent = server.edicts[ i ];
		if ( ent && ! ent.free && PR_GetString( ent.v.classname ) === classname ) return ent;

	}

}

/** A numeric entity field by name (Hexen's layout-specific fields), or 0 when the gamecode has no such field. */
export function edictFieldNumber( ent, name ) {

	const field = GetEdictFieldValue( ent, name );
	return field === null ? 0 : Number( field.accessor.getInt32( field.ofs ) );

}

/** A string entity field by name, or '' when the gamecode has no such field. */
export function edictFieldString( ent, name ) {

	const field = GetEdictFieldValue( ent, name );
	return field === null ? '' : PR_GetString( field.accessor.getInt32( field.ofs ) );

}

/**
 * Starts a named map on an existing session and reconnects its slots. Used for non-hub `changelevel` runs, where the
 * native host asks every client to reconnect; a hub `changelevel2` restores the clients instead and must not use this.
 *
 * @param {object} session the live session
 * @param {string} map the map name
 * @param {string} [startspot] the named start
 * @returns {object} the session
 */
export function changeHexen2Map( session, map, startspot = '' ) {

	SV_SpawnServer( map, startspot );
	if ( ! sv.active ) throw new Error( 'the shared server did not start ' + map );
	session.map = map;
	return reconnectHexen2Clients( session );

}

/** @returns {boolean} true while the active game is any Hexen II edition */
export function hexen2ProfileActive() { return GameProfile_IsHexen2(); }
