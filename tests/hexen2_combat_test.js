// G1 combat on the shared host: the native Paladin on demo1 with Installed gamecode. A live level monster is held in
// front of the player, the first weapon is selected with the native number-key impulse, attack is held for twenty
// frames, and the monster must take damage while the player stays unhurt.
import { SV_LinkEdict } from '../src/engine/server/world.js';
import { SV_SetFrametime, SV_Physics } from '../src/engine/server/sv_phys.js';
import { PR_GetString, pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { findEntity, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

Deno.test( 'a Paladin attack damages a level monster on demo1', () => {

	if ( ! loadHexen2Data() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv, player } = spawnHexen2Map( 'demo1', 1 );

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

	// select the first weapon (native number-key impulse), settle one frame, then hold attack
	SV_SetFrametime( 0.1 );
	player.v.impulse = 1;
	SV_Physics(); pr_global_struct.time = sv.time;
	player.v.impulse = 0; player.v.button0 = 1;
	let error = null;
	try { for ( let frame = 0; frame < 20; frame ++ ) { SV_Physics(); pr_global_struct.time = sv.time; } } catch ( e ) { error = e; }
	check( error === null, 'the attack frames ran without a script error: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( monster.v.health < healthBefore, `the monster took damage: ${monster.v.health} of ${healthBefore} (weapon ${player.v.current_weapon | 0}, frame ${player.v.weaponframe | 0})` );
	check( monster.v.health >= 0, 'the damage is bounded: ' + monster.v.health );
	check( player.v.health === playerBefore, 'the attacking Paladin is unhurt: ' + player.v.health + ' of ' + playerBefore );

} );
