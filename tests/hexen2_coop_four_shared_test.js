// Four clients on one shared server (the trial target's LAN size): the reserved client edicts 1..4 spawn the four base
// classes, the world runs frames with all four connected, and then each client walks in turn through
// SV_ClientThink/SV_Physics_Client without another client's state changing.
import { existsSync } from 'node:fs';
import { MOVETYPE_WALK, SOLID_SLIDEBOX, set_host_client } from '../src/engine/server/server.js';
import { SV_SetFrametime, SV_Physics, SV_Physics_Client, SV_SetPlayer } from '../src/engine/server/sv_phys.js';
import { SV_ClientThink, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { hexen2DataPresent, loadHexen2Data, spawnHexen2Clients } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'four co-op clients spawn, run and move in turn on the shared server', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2' ), 'the base installation mounts' );
	const session = spawnHexen2Clients( 'demo1', [ 1, 2, 3, 4 ], { coop: true } );
	const players = session.players;
	same( players.length, 4, 'four clients' );
	check( players.every( player => player && ! player.free ), 'the four client edicts are live' );
	for ( let i = 0; i < 4; i ++ ) {

		same( players[ i ].index, i + 1, 'client ' + i + ' uses reserved edict ' + ( i + 1 ) );
		same( players[ i ].v.playerclass, i + 1, 'client ' + i + ' class' );
		same( PR_GetString( players[ i ].v.classname ), 'player', 'client ' + i + ' is a player' );

	}
	same( PR_GetString( players[ 0 ].v.model ), 'models/paladin.mdl', 'the first client is the Paladin' );
	same( PR_GetString( players[ 1 ].v.model ), 'models/crusader.mdl', 'the second client is the Crusader' );
	same( PR_GetString( players[ 2 ].v.model ), 'models/necro.mdl', 'the third client is the Necromancer' );
	same( PR_GetString( players[ 3 ].v.model ), 'models/assassin.mdl', 'the fourth client is the Assassin' );

	SV_SetFrametime( 0.1 );
	let error = null;
	try { for ( let frame = 0; frame < 3; frame ++ ) SV_Physics(); } catch ( e ) { error = e; }
	check( error === null, 'three world frames with four clients ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	for ( let i = 0; i < 4; i ++ ) {

		const player = players[ i ];
		check( player.v.health > 0, 'client ' + i + ' is alive: ' + player.v.health );
		check( Number.isFinite( player.v.origin[ 0 ] ) && Number.isFinite( player.v.origin[ 2 ] ), 'client ' + i + ' origin is finite' );

	}

	const before = players.map( player => [ player.v.origin[ 0 ], player.v.origin[ 1 ] ] );
	for ( let i = 0; i < 4; i ++ ) {

		const client = session.svs.clients[ i ], player = players[ i ];
		set_host_client( client );
		SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
		SV_SetPlayer( player );
		player.v.angles = [ 0, 0, 0 ];
		player.v.v_angle = [ 0, 0, 0 ];
		player.v.velocity = [ 0, 0, 0 ];
		player.v.fixangle = 0;
		player.v.movetype = MOVETYPE_WALK;
		player.v.solid = SOLID_SLIDEBOX;
		for ( let frame = 0; frame < 3; frame ++ ) {

			client.cmd.forwardmove = 320;
			client.cmd.sidemove = 0;
			client.cmd.upmove = 0;
			client.cmd.viewangles = [ 0, 0, 0 ];
			SV_ClientThink();
			SV_Physics_Client( player, i + 1 );
			session.sv.time += 0.1;
			pr_global_struct.time = session.sv.time;

		}

	}
	for ( let i = 0; i < 4; i ++ ) {

		const dx = players[ i ].v.origin[ 0 ] - before[ i ][ 0 ], dy = players[ i ].v.origin[ 1 ] - before[ i ][ 1 ];
		check( Math.hypot( dx, dy ) > 5, `client ${i} moved: ${dx}, ${dy}` );
		check( Number.isFinite( players[ i ].v.origin[ 0 ] ), `client ${i} origin stays finite` );
		check( players[ i ].v.health > 0, `client ${i} is alive (${players[ i ].v.health})` );

	}
	check( session.sv.num_edicts <= session.sv.max_edicts, 'the edict table stayed within its ceiling' );

} );
