// First-person weapon and enemy animation on demo1 with the supplied gamecode on the shared host: holding attack
// advances the native weaponframe, a live monster enters an attack state and advances its model frame, and player and
// enemy projectiles spawn with their model and move. Plan sections 5, E05 and E13 prerequisites.
import { SV_LinkEdict } from '../src/engine/server/world.js';
import { SV_SetFrametime, SV_Physics } from '../src/engine/server/sv_phys.js';
import { ED_FindFunction } from '../src/engine/progs/pr_edict.js';
import { EDICT_TO_PROG, PR_GetString, pr_global_struct, pr_functions } from '../src/engine/progs/progs.js';
import { PR_ExecuteProgram, PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

function boot() {

	if ( ! loadHexen2Data() ) return null;
	const { sv, player } = spawnHexen2Map( 'demo1', 1 );
	return { sv, player, frames: count => { for ( let i = 0; i < count; i ++ ) { SV_Physics(); pr_global_struct.time = sv.time; } } };

}

Deno.test( 'holding attack advances the first-person weapon frames', () => {

	const game = boot();
	if ( game === null ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { player, frames } = game;
	player.v.impulse = 1; frames( 1 ); player.v.impulse = 0; player.v.button0 = 1;
	const seen = new Set();
	let error = null;
	try { for ( let i = 0; i < 30; i ++ ) { frames( 1 ); seen.add( player.v.weaponframe | 0 ); } } catch ( e ) { error = e; }
	player.v.button0 = 0;
	check( error === null, 'the attack frames ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( seen.size > 1, 'the weapon frame advanced through an attack animation: ' + [ ...seen ].join( ',' ) );
	check( [ ...seen ].some( frame => frame > 0 ), 'the attack uses non-idle frames: ' + [ ...seen ].join( ',' ) );

} );

Deno.test( 'a live monster enters an attack state and advances its model frame', () => {

	const game = boot();
	if ( game === null ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv, player, frames } = game;
	const monster = sv.edicts.find( ent => ent && ! ent.free && /^monster_/.test( PR_GetString( ent.v.classname ) ) );
	check( monster !== undefined, 'the level spawned a monster' );
	monster.v.origin = [ player.v.origin[ 0 ] + 48, player.v.origin[ 1 ], player.v.origin[ 2 ] ];
	monster.v.health = 1000; player.v.health = 1000;
	monster.v.enemy = EDICT_TO_PROG( player );
	pr_global_struct.self = EDICT_TO_PROG( monster );
	PR_ExecuteProgram( pr_functions.indexOf( ED_FindFunction( 'FoundTarget' ) ) );
	SV_LinkEdict( monster, true );
	const framesSeen = new Set();
	let error = null;
	try { for ( let i = 0; i < 60; i ++ ) { frames( 1 ); framesSeen.add( monster.v.frame | 0 ); } } catch ( e ) { error = e; }
	check( error === null, 'the monster frames ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( framesSeen.size > 1, 'the monster model frame advanced: ' + [ ...framesSeen ].slice( 0, 20 ).join( ',' ) );
	check( player.v.health < 1000, 'the monster attack reached the player: ' + player.v.health );

} );

Deno.test( 'player and enemy projectile entities spawn with their model and move', () => {

	const game = boot();
	if ( game === null ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv, player, frames } = game;
	const fire = () => {

		const before = new Set( sv.edicts.filter( ent => ent && !ent.free && PR_GetString( ent.v.classname ) === 'magic missile' ).map( ent => ent.index ) );
		PR_ExecuteProgram( pr_functions.indexOf( ED_FindFunction( 'FireMagicMissile' ) ) );
		return sv.edicts.find( ent => ent && !ent.free && !before.has( ent.index ) && PR_GetString( ent.v.classname ) === 'magic missile' );

	};
	pr_global_struct.self = EDICT_TO_PROG( player );
	const playerMissile = fire();
	check( playerMissile !== undefined, 'the player projectile spawned' );
	check( PR_GetString( playerMissile.v.model ) === 'models/ball.mdl', 'the player projectile model' );
	const start = [ playerMissile.v.origin[ 0 ], playerMissile.v.origin[ 1 ], playerMissile.v.origin[ 2 ] ];
	frames( 5 );
	check( Math.hypot( playerMissile.v.origin[ 0 ] - start[ 0 ], playerMissile.v.origin[ 1 ] - start[ 1 ], playerMissile.v.origin[ 2 ] - start[ 2 ] ) > 0, 'the player projectile moved' );

	const monster = sv.edicts.find( ent => ent && !ent.free && PR_GetString( ent.v.classname ) === 'monster_skull_wizard' );
	check( monster !== undefined, 'the level has a skull wizard' );
	monster.v.enemy = EDICT_TO_PROG( player );
	monster.v.origin = [ player.v.origin[ 0 ] + 48, player.v.origin[ 1 ], player.v.origin[ 2 ] ];
	pr_global_struct.self = EDICT_TO_PROG( monster );
	const enemyMissile = fire();
	check( enemyMissile !== undefined, 'the enemy projectile spawned' );
	check( PR_GetString( enemyMissile.v.model ) === 'models/ball.mdl', 'the enemy projectile model' );
	const enemyStart = [ enemyMissile.v.origin[ 0 ], enemyMissile.v.origin[ 1 ], enemyMissile.v.origin[ 2 ] ];
	frames( 5 );
	check( Math.hypot( enemyMissile.v.origin[ 0 ] - enemyStart[ 0 ], enemyMissile.v.origin[ 1 ] - enemyStart[ 1 ], enemyMissile.v.origin[ 2 ] - enemyStart[ 2 ] ) > 0, 'the enemy projectile moved' );

} );
