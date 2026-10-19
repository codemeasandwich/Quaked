// Four clients on one server (the trial target's LAN size): the client edicts are the reserved slots 1..4, the four base
// classes spawn, the world runs frames (this path exposed the MSG_ONE edict-number bug), and then each client walks in
// turn through SV_ClientThink/SV_Physics_Client without changing another client's state.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetPlayer, SV_SetFrametime, SV_Physics_Client, SV_Physics } from '../src/engine/server/sv_phys.js';
import { sv as serverSv, SIGNON_SIZE, MOVETYPE_WALK, SOLID_SLIDEBOX } from '../src/engine/server/server.js';
import { PR_ExecuteProgram, PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { SV_ClientThink, SV_User_SetCommand, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'four co-op clients spawn, run and move in turn', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const makeClient = name => ( { name, active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ], forwardmove: 0, sidemove: 0, upmove: 0 } } );
	const clients = [ makeClient( 'a' ), makeClient( 'b' ), makeClient( 'c' ), makeClient( 'd' ) ];
	for ( const client of clients ) client.message = sv.signon;
	const svs = { maxclients: 4, clients, active: true };
	const entry = { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true };
	const mounted = Hexen2_MountLevel( {
		entry, classId: 'paladin', client: clients[ 0 ], sv, svs,
		readFile: name => existsSync( HEXEN + '/' + name ) ? new Uint8Array( readFileSync( HEXEN + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );
	const players = sv.edicts.slice( 1, 5 ); // the reserved client slots
	check( players.length === 4 && players.every( player => player ), 'the four client edicts are reserved' );
	const classes = [ 'crusader', 'necromancer', 'assassin' ];
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	for ( let i = 1; i < 4; i ++ ) {

		clients[ i ].edict = players[ i ];
		const placed = Hexen2_SpawnPlayer( { sv, client: clients[ i ], player: players[ i ], gameId: 'hexen2', classId: classes[ i - 1 ],
			origin: [ start.v.origin[ 0 ], start.v.origin[ 1 ] + 24 * i, start.v.origin[ 2 ] ] } );
		check( placed.ok, placed.reason );

	}
	check( players[ 0 ].v.playerclass === 1, 'the first client is the Paladin' );
	for ( let i = 1; i < 4; i ++ ) same( players[ i ].v.playerclass, i + 1, `client ${i} class` );

	sv.active = true; SV_SetFrametime( 0.1 );
	let error = null;
	try { for ( let frame = 0; frame < 3; frame ++ ) SV_Physics(); } catch ( e ) { error = e; }
	check( error === null, 'three world frames with four clients ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	for ( const player of players ) {

		check( player.v.health > 0, 'every client is alive: ' + player.v.health );
		check( Number.isFinite( player.v.origin[ 0 ] ) && Number.isFinite( player.v.origin[ 2 ] ), 'every client origin is finite' );

	}

	// each client walks in turn: the others are not stepped during its frames
	const before = players.map( player => [ player.v.origin[ 0 ], player.v.origin[ 1 ] ] );
	for ( let i = 0; i < 4; i ++ ) {

		SV_User_SetCallbacks( { host_client: clients[ i ], get_key_dest: () => 0, V_CalcRoll: () => 0 } );
		SV_SetPlayer( players[ i ] );
		players[ i ].v.angles = [ 0, 0, 0 ]; players[ i ].v.v_angle = [ 0, 0, 0 ]; players[ i ].v.velocity = [ 0, 0, 0 ];
		players[ i ].v.movetype = MOVETYPE_WALK; players[ i ].v.solid = SOLID_SLIDEBOX;
		for ( let frame = 0; frame < 3; frame ++ ) {

			SV_User_SetCommand( { forwardmove: 320, viewangles: [ 0, 0, 0 ] } );
			SV_ClientThink();
			SV_Physics_Client( players[ i ], i + 1 );

		}

	}
	for ( let i = 0; i < 4; i ++ ) {

		const dx = players[ i ].v.origin[ 0 ] - before[ i ][ 0 ], dy = players[ i ].v.origin[ 1 ] - before[ i ][ 1 ];
		check( Math.hypot( dx, dy ) > 5, `client ${i} moved: ${dx}, ${dy}` );
		check( Number.isFinite( players[ i ].v.origin[ 0 ] ), `client ${i} origin stays finite` );
		check( players[ i ].v.health > 0, `client ${i} is alive (${players[ i ].v.health})` );

	}

} );
