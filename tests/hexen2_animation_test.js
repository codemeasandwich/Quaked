// First-person weapon and enemy animation on demo1 with the supplied gamecode: holding attack advances the native
// weaponframe (the page renders it on the viewmodel), and a live monster enters an attack state and advances its model
// frame. Plan sections 5, E05 and E13 prerequisites.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetState, SV_SetFrametime, SV_Physics } from '../src/engine/server/sv_phys.js';
import { PR_LoadProgs, PR_AllocEdicts, ED_FindFunction } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs, EDICT_TO_PROG, pr_functions } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, ss_active, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram, PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities, Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

function boot() {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) return null;
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const progsBytes = readFileSync( HEXEN + '/progs.dat' );
	PR_LoadProgs( progsBytes.buffer.slice( progsBytes.byteOffset, progsBytes.byteOffset + progsBytes.byteLength ) );
	Mod_SetHexenHullLayout( true );
	const map = new model_t(); map.name = 'maps/demo1.bsp'; set_loadmodel( map );
	const bsp = pak.COM_FindFile( 'maps/demo1.bsp' ).data;
	Mod_LoadBrushModel( map, bsp.buffer.slice( bsp.byteOffset, bsp.byteOffset + bsp.byteLength ) );
	Mod_SetHexenHullLayout( false );
	const sv = serverSv;
	PR_SetSV( sv ); PR_SetSVS( { maxclients: 1, clients: [], active: true } );
	sv.time = 0.1; sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE; sv.worldmodel = map;
	Hexen2_SeedPrecache( sv, map, name => Mod_FindName( name ) );
	sv.state = ss_loading; SV_SetState( sv, svs, pr_global_struct ); SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	Hexen2_SpawnEntities( sv, map, 392, PR_AllocEdicts );
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	const player = sv.edicts[ 1 ];
	const client = { name: 'anim', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	svs.clients[ 0 ] = client;
	check( Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId: 'paladin', origin: start.v.origin } ).ok, 'the Paladin spawned' );
	sv.active = true; sv.state = ss_active; SV_SetFrametime( 0.1 );
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
