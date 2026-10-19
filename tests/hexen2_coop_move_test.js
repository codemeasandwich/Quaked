// Two players move independently on one server: each client's usercmd goes through the engine's SV_ClientThink and
// SV_Physics_Client (gamecode PlayerPreThink then SV_WalkMove), with distinct directions, and both stay on the floor.
// This is co-op movement at the server; network transport for both players is covered separately.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetPlayer, SV_SetFrametime, SV_Physics_Client, SV_SetState } from '../src/engine/server/sv_phys.js';
import { sv as serverSv, SIGNON_SIZE, MOVETYPE_WALK, SOLID_SLIDEBOX } from '../src/engine/server/server.js';
import { PR_ExecuteProgram, PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { PR_GetString, pr_global_struct } from '../src/engine/progs/progs.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { SV_ClientThink, SV_User_SetCommand, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'two players walk independently through the engine movement path', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const clientA = { name: 'a', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ], forwardmove: 0, sidemove: 0, upmove: 0 } };
	const clientB = { name: 'b', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ], forwardmove: 0, sidemove: 0, upmove: 0 } };
	clientA.message = sv.signon; clientB.message = sv.signon;
	const svs = { maxclients: 2, clients: [ clientA, clientB ], active: true };
	const entry = { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true };
	const mounted = Hexen2_MountLevel( {
		entry, classId: 'paladin', client: clientA, sv, svs,
		readFile: name => existsSync( HEXEN + '/' + name ) ? new Uint8Array( readFileSync( HEXEN + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );
	const playerA = mounted.player, playerB = sv.edicts[ 2 ];
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	const placedB = Hexen2_SpawnPlayer( { sv, client: clientB, player: playerB, gameId: 'hexen2', classId: 'crusader',
		origin: [ start.v.origin[ 0 ] + 32, start.v.origin[ 1 ], start.v.origin[ 2 ] ] } );
	check( placedB.ok, placedB.reason );
	check( Math.abs( playerA.v.origin[ 2 ] ) < 1 && Math.abs( playerB.v.origin[ 2 ] ) < 1, 'both players start on the floor' );

	sv.active = true; SV_SetFrametime( 0.1 );
	const setup = ( player, client ) => {

		SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
		SV_SetPlayer( player );
		player.v.angles = [ 0, 0, 0 ]; player.v.v_angle = [ 0, 0, 0 ]; player.v.velocity = [ 0, 0, 0 ];
		player.v.movetype = MOVETYPE_WALK; player.v.solid = SOLID_SLIDEBOX;
		SV_User_SetCommand( { forwardmove: 0, sidemove: 0, upmove: 0, viewangles: [ 0, 0, 0 ] } );

	};
	setup( playerA, clientA ); setup( playerB, clientB );
	playerB.v.angles = [ 0, 90, 0 ]; playerB.v.v_angle = [ 0, 90, 0 ]; // B walks east, A walks north
	const beforeA = [ playerA.v.origin[ 0 ], playerA.v.origin[ 1 ], playerA.v.origin[ 2 ] ];
	const beforeB = [ playerB.v.origin[ 0 ], playerB.v.origin[ 1 ], playerB.v.origin[ 2 ] ];
	let error = null;
	try {

		for ( let frame = 0; frame < 3; frame ++ ) {

			SV_SetPlayer( playerA );
			SV_User_SetCommand( { forwardmove: 320, viewangles: [ 0, 0, 0 ] } );
			SV_ClientThink();
			SV_Physics_Client( playerA, 1 );
			SV_SetPlayer( playerB );
			SV_User_SetCommand( { forwardmove: 320, viewangles: [ 0, 90, 0 ] } );
			SV_ClientThink();
			SV_Physics_Client( playerB, 2 );

		}

	} catch ( e ) { error = e; }
	check( error === null, 'the two-player movement ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( Math.abs( playerA.v.origin[ 0 ] - beforeA[ 0 ] ) > 20, 'A advanced north: ' + ( playerA.v.origin[ 0 ] - beforeA[ 0 ] ) );
	check( Math.abs( playerA.v.origin[ 1 ] - beforeA[ 1 ] ) < 2, 'A did not drift east' );
	check( Math.abs( playerB.v.origin[ 1 ] - beforeB[ 1 ] ) > 20, 'B advanced east: ' + ( playerB.v.origin[ 1 ] - beforeB[ 1 ] ) );
	check( Math.abs( playerB.v.origin[ 0 ] - beforeB[ 0 ] ) < 2, 'B did not drift north' );
	check( Math.abs( playerA.v.origin[ 2 ] - beforeA[ 2 ] ) < 2 && Math.abs( playerB.v.origin[ 2 ] - beforeB[ 2 ] ) < 2, 'both stayed on the floor' );
	check( playerA.v.health > 0 && playerB.v.health > 0, 'neither player was hurt by walking' );
	check( Math.abs( playerA.v.origin[ 0 ] - playerB.v.origin[ 0 ] ) > 1 || Math.abs( playerA.v.origin[ 1 ] - playerB.v.origin[ 1 ] ) > 1, 'the players remain separate' );

} );
