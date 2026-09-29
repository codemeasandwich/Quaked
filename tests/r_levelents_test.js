import { R_LevelEntities, R_FramePrefix } from '../src/r_levelents.js';

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

const LUMP = `
{ "classname" "worldspawn" "worldtype" "1" }
{ "classname" "monster_army" "origin" "10 20 30" "angle" "90" }
{ "classname" "monster_ogre" "origin" "0 0 0" "spawnflags" "256" }
{ "classname" "monster_dog" "origin" "0 0 0" "spawnflags" "1024" }
{ "classname" "item_key1" "origin" "1 2 3" }
{ "classname" "item_health" "origin" "0 0 0" "spawnflags" "2" }
{ "classname" "func_illusionary" "model" "*1" }
{ "classname" "func_door_secret" "model" "*2" "origin" "5 0 0" }
{ "classname" "func_plat" "model" "*3" "origin" "0 0 100" }
{ "classname" "trigger_once" "model" "*4" }
{ "classname" "info_player_start" "origin" "0 0 0" }
{ "classname" "light" "origin" "0 0 0" }
`;

const sub = ( h ) => ( { mins: [ 0, 0, 0 ], maxs: [ 10, 10, h ], firstface: 0, numfaces: 1 } );
const submodels = [ sub( 0 ), sub( 10 ), sub( 20 ), sub( 108 ), sub( 5 ) ];

Deno.test( 'R_LevelEntities: models, skill, secret doors and plats', () => {

	const list = R_LevelEntities( LUMP, null, submodels, 0 );
	const by = ( c ) => list.filter( ( e ) => e.classname === c );

	assertEqual( by( 'monster_army' )[ 0 ].model, 'progs/soldier.mdl', 'soldier' );
	assertEqual( by( 'monster_army' )[ 0 ].angles[ 1 ], 90, 'facing' );
	assertEqual( by( 'monster_ogre' ).length, 0, 'not on easy' );
	assertEqual( by( 'monster_dog' ).length, 1, 'on easy' );
	assertEqual( R_LevelEntities( LUMP, null, submodels, 2 ).filter( ( e ) => e.classname === 'monster_dog' ).length, 0, 'not on hard' );
	assertEqual( by( 'item_key1' )[ 0 ].model, 'progs/m_s_key.mdl', 'key of a metal world' );
	assertEqual( by( 'item_health' )[ 0 ].model, 'maps/b_bh100.bsp', 'megahealth' );
	assertEqual( by( 'func_illusionary' )[ 0 ].kind, 'brush', 'false wall' );
	assertEqual( by( 'func_door_secret' )[ 0 ].origin[ 0 ], 5, 'secret door' );
	assertEqual( by( 'func_plat' )[ 0 ].origin[ 2 ], 100 - 100, 'a platform starts lowered' );
	assertEqual( by( 'trigger_once' ).length, 0, 'triggers are not seen' );
	assertEqual( by( 'light' ).length, 0, 'lights are not seen' );

} );

Deno.test( 'R_LevelEntities: a level you left shows how you left it', () => {

	const snap = [
		{ classname: 'monster_army', model: 'progs/soldier.mdl', origin: '1 2 3', frame: '40' },
		{ classname: 'item_health', origin: '0 0 0' }, // picked up: no model
		{ classname: 'func_door_secret', model: '*2', origin: '50 0 0' }
	];
	const list = R_LevelEntities( LUMP, snap, submodels, 1 );
	assertEqual( list.length, 2, 'what is left' );
	assertEqual( list[ 0 ].frame, 40, 'a dead soldier' );
	assertEqual( list[ 1 ].origin[ 0 ], 50, 'an open door' );

} );

Deno.test( 'R_FramePrefix', () => {

	assertEqual( R_FramePrefix( 'stand12' ), 'stand', 'stand' );
	assertEqual( R_FramePrefix( 'death5' ), 'death', 'death' );

} );
