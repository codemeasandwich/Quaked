// Two players move independently on one shared Hexen II server: each client's usercmd goes through the engine's
// SV_ClientThink and SV_Physics_Client (gamecode PlayerPreThink then SV_WalkMove) with a distinct direction, and both
// stay on the floor. The network transport for both players is covered elsewhere.
import { existsSync } from 'node:fs';
import { MOVETYPE_WALK, SOLID_SLIDEBOX, set_host_client } from '../src/engine/server/server.js';
import { SV_DropToFloor, SV_LinkEdict } from '../src/engine/server/world.js';
import { SV_SetFrametime, SV_Physics_Client, SV_SetPlayer } from '../src/engine/server/sv_phys.js';
import { SV_ClientThink, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { findEntity, hexen2DataPresent, loadHexen2Data, spawnHexen2Clients } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

function prepare( session, index ) {

	const client = session.svs.clients[ index ], player = client.edict;
	set_host_client( client );
	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	SV_SetPlayer( player );
	player.v.angles = [ 0, 0, 0 ];
	player.v.v_angle = [ 0, 0, 0 ];
	player.v.velocity = [ 0, 0, 0 ];
	player.v.fixangle = 0;
	player.v.movetype = MOVETYPE_WALK;
	player.v.solid = SOLID_SLIDEBOX;
	client.cmd.forwardmove = 0;
	client.cmd.sidemove = 0;
	client.cmd.upmove = 0;
	client.cmd.viewangles = [ 0, 0, 0 ];

}

function step( session, index, forward, yaw ) {

	const client = session.svs.clients[ index ], player = client.edict;
	set_host_client( client );
	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	SV_SetPlayer( player );
	client.cmd.forwardmove = forward;
	client.cmd.sidemove = 0;
	client.cmd.upmove = 0;
	client.cmd.viewangles = [ 0, yaw, 0 ];
	player.v.v_angle = [ 0, yaw, 0 ];
	SV_ClientThink();
	SV_Physics_Client( player, index + 1 );

}

Deno.test( 'two players walk independently through the shared engine movement path', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2' ), 'the base installation mounts' );
	const session = spawnHexen2Clients( 'demo1', [ 1, 2 ], { coop: true } );
	const playerA = session.players[ 0 ], playerB = session.players[ 1 ];
	// Put both players in the open start room: the co-op starts sit against different walls, which would measure the
	// map instead of the independent movement path.
	const start = findEntity( session.sv, 'info_player_start' );
	check( start !== undefined, 'the level has a player start' );
	playerA.v.origin = [ start.v.origin[ 0 ], start.v.origin[ 1 ], start.v.origin[ 2 ] ];
	playerB.v.origin = [ start.v.origin[ 0 ] + 64, start.v.origin[ 1 ], start.v.origin[ 2 ] ];
	SV_LinkEdict( playerA, false );
	SV_LinkEdict( playerB, false );
	SV_DropToFloor( playerA );
	SV_DropToFloor( playerB );
	SV_SetFrametime( 0.1 );
	prepare( session, 0 );
	prepare( session, 1 );
	const beforeA = [ playerA.v.origin[ 0 ], playerA.v.origin[ 1 ], playerA.v.origin[ 2 ] ];
	const beforeB = [ playerB.v.origin[ 0 ], playerB.v.origin[ 1 ], playerB.v.origin[ 2 ] ];
	let error = null;
	try {

		for ( let frame = 0; frame < 3; frame ++ ) {

			step( session, 0, 320, 0 );
			step( session, 1, 160, 0 );
			sv_advance( session );

		}

	} catch ( e ) { error = e; }
	check( error === null, 'the two-player movement ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( Math.abs( playerA.v.origin[ 0 ] - beforeA[ 0 ] ) > 20, 'A advanced north: ' + ( playerA.v.origin[ 0 ] - beforeA[ 0 ] ) );
	check( Math.abs( playerA.v.origin[ 1 ] - beforeA[ 1 ] ) < 2, 'A did not drift east' );
	const bAdvance = playerB.v.origin[ 0 ] - beforeB[ 0 ];
	check( bAdvance > 5, 'B advanced on its own command: ' + bAdvance );
	check( bAdvance < Math.abs( playerA.v.origin[ 0 ] - beforeA[ 0 ] ), 'B used its own slower move command: ' + bAdvance );
	check( Math.abs( playerB.v.origin[ 1 ] - beforeB[ 1 ] ) < 2, 'B did not drift east' );
	check( Math.abs( playerA.v.origin[ 2 ] - beforeA[ 2 ] ) < 2 && Math.abs( playerB.v.origin[ 2 ] - beforeB[ 2 ] ) < 2, 'both stayed on the floor' );
	check( playerA.v.health > 0 && playerB.v.health > 0, 'neither player was hurt by walking' );
	check( Math.abs( playerA.v.origin[ 0 ] - playerB.v.origin[ 0 ] ) > 1 || Math.abs( playerA.v.origin[ 1 ] - playerB.v.origin[ 1 ] ) > 1, 'the players remain separate' );

} );

function sv_advance( session ) {

	session.sv.time += 0.1;
	pr_global_struct.time = session.sv.time;

}
