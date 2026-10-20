// G1 combat through the shared client-think path: SV_ClientThink, button0 and SV_Physics must still damage a level
// monster. This isolates the engine path from the browser input glue.
import { SV_LinkEdict } from '../src/engine/server/world.js';
import { SV_SetFrametime, SV_Physics, SV_SetPlayer } from '../src/engine/server/sv_phys.js';
import { SV_ClientThink, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { PR_GetString, pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

Deno.test( 'an attack through SV_ClientThink damages a monster', () => {

	if ( ! loadHexen2Data() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv, client, player } = spawnHexen2Map( 'demo1', 1 );

	// a live level monster, held still directly in front of the player, facing it
	const monster = sv.edicts.find( ent => ent && ! ent.free && /^monster_/.test( PR_GetString( ent.v.classname ) ) );
	check( monster !== undefined, 'the level spawned a monster' );
	monster.v.origin = [ player.v.origin[ 0 ] + 64, player.v.origin[ 1 ], player.v.origin[ 2 ] ];
	monster.v.movetype = 0; // none: hold it in place for the measurement
	monster.v.health = 100;
	monster.v.ideal_yaw = 0;
	SV_LinkEdict( monster, true );
	const healthBefore = monster.v.health;
	const playerBefore = player.v.health;

	// select the first weapon (native number-key impulse), settle one frame, then hold attack through the same
	// client-think path a real client uses
	SV_SetFrametime( 0.1 );
	SV_SetPlayer( player );
	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	player.v.impulse = 1;
	SV_Physics(); pr_global_struct.time = sv.time;
	player.v.impulse = 0;
	let error = null;
	try {

		for ( let frame = 0; frame < 20; frame ++ ) {

			client.cmd.forwardmove = 0; client.cmd.sidemove = 0; client.cmd.upmove = 0;
			client.cmd.viewangles = [ 0, 0, 0 ];
			SV_ClientThink();
			player.v.button0 = 1;
			SV_Physics();
			pr_global_struct.time = sv.time;

		}

	} catch ( e ) { error = e; }
	check( error === null, 'the attack frames ran without a script error: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( monster.v.health < healthBefore, `the monster took damage: ${monster.v.health} of ${healthBefore} (weapon ${player.v.current_weapon | 0}, frame ${player.v.weaponframe | 0})` );
	check( monster.v.health >= 0, 'the damage is bounded: ' + monster.v.health );
	check( player.v.health === playerBefore, 'the attacking Paladin is unhurt: ' + player.v.health + ' of ' + playerBefore );

} );
