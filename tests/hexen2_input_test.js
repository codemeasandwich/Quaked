// Engine player movement on the shared host: a synthetic usercmd drives the same SV_ClientThink and SV_Physics_Client
// path a real client uses (gamecode PlayerPreThink then the engine's walk move), and the Paladin advances on the floor.
// plan section 5; G1 prerequisite for input/camera.
import { SV_SetPlayer, SV_SetFrametime, SV_Physics_Client, FL_ONGROUND, FL_MONSTER, SOLID_SLIDEBOX, MOVETYPE_NONE, MOVETYPE_WALK } from '../src/engine/server/sv_phys.js';
import { SV_DropToFloor } from '../src/engine/server/world.js';
import { SV_ClientThink, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'a synthetic usercmd moves the Paladin through the engine path on the supplied level', () => {

	if ( ! loadHexen2Data() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv, client, player } = spawnHexen2Map( 'demo1', 1 );
	SV_DropToFloor( player );
	check( Math.abs( player.v.origin[ 2 ] ) < 1, 'feet on the floor before moving: ' + player.v.origin[ 2 ] );

	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	SV_SetPlayer( player );
	SV_SetFrametime( 0.1 );
	player.v.angles = [ 0, 0, 0 ]; player.v.v_angle = [ 0, 0, 0 ]; player.v.velocity = [ 0, 0, 0 ];
	player.v.movetype = MOVETYPE_WALK; player.v.solid = SOLID_SLIDEBOX;
	// hold the level's monsters still and give the player room to walk: this test measures the engine movement path
	for ( const ent of sv.edicts ) if ( ent && ! ent.free && ( ( ent.v.flags | 0 ) & FL_MONSTER ) ) ent.v.movetype = MOVETYPE_NONE;
	player.v.health = player.v.max_health = 1000;

	const before = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];
	let error = null;
	try {

		for ( let frame = 0; frame < 3; frame ++ ) {

			client.cmd.forwardmove = 320; client.cmd.sidemove = 0; client.cmd.upmove = 0;
			client.cmd.viewangles = [ 0, 0, 0 ];
			SV_ClientThink();
			SV_Physics_Client( player, 1 );
			sv.time += 0.1;

		}

	} catch ( e ) { error = e; }
	check( error === null, 'the engine movement path ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( player.v.origin[ 0 ] - before[ 0 ] > 80, 'the Paladin advanced about 96 units in +x: ' + ( player.v.origin[ 0 ] - before[ 0 ] ) );
	same( player.v.origin[ 1 ], before[ 1 ], 'no sideways drift' );
	check( Math.abs( player.v.origin[ 2 ] - before[ 2 ] ) < 2, 'the Paladin stayed on the floor: ' + player.v.origin[ 2 ] );
	check( ( player.v.flags | 0 ) & FL_ONGROUND, 'the player is still grounded' );
	check( player.v.velocity[ 0 ] > 0, 'forward velocity was applied: ' + player.v.velocity[ 0 ] );
	check( player.v.health > 0, 'the player survived the walk: ' + player.v.health );

} );
