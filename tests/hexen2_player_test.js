// Putting a Paladin into the spawned level: the supplied gamecode's ClientConnect and PutClientInServer run to
// completion over the implemented builtins, leaving a native player entity (class, model, spawn origin, health,
// hull size) in the world. plan sections 3-5; G1 prerequisite.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { PR_LoadProgs, PR_AllocEdicts, ED_LoadFromFile } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, ss_active, SOLID_BSP, MOVETYPE_PUSH, SIGNON_SIZE, FL_CLIENT, FL_ONGROUND } from '../src/engine/server/server.js';
import { PR_LastRunError, PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import { pr_globals } from '../src/engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_RETURN } from '../src/engine/progs/pr_comp.js';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
const SUPPLIED = existsSync( HEXEN + '/pak0.pak' ) && existsSync( HEXEN + '/pak1.pak' ) && existsSync( HEXEN + '/progs.dat' );

Deno.test( 'a Paladin is placed in the supplied level by the supplied gamecode', () => {

	if ( ! SUPPLIED ) { console.log( 'SKIP: the supplied Hexen II installation is not present at ' + HEXEN ); return; }
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
	PR_SetSV( sv );
	PR_SetSVS( { maxclients: 1, clients: [], active: true } );
	sv.max_edicts = 600; sv.num_edicts = 2; sv.edicts = PR_AllocEdicts( 2, 392 );
	sv.worldmodel = map; sv.models = new Array( 512 ).fill( null ); sv.models[ 1 ] = map;
	sv.model_precache = new Array( 512 ).fill( null ); sv.model_precache[ 0 ] = ''; sv.model_precache[ 1 ] = 'maps/demo1.bsp';
	for ( let i = 1; i < map.numsubmodels; i ++ ) { sv.model_precache[ 1 + i ] = '*' + i; sv.models[ 1 + i ] = Mod_FindName( '*' + i ); }
	sv.sound_precache = new Array( 512 ).fill( null );
	sv.state = ss_loading; sv.time = 0.1;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE; sv.signon.cursize = 0;
	const world = sv.edicts[ 0 ]; world.v.solid = SOLID_BSP; world.v.movetype = MOVETYPE_PUSH; world.v.modelindex = 1;
	SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	pr_global_struct.time = 0.1; pr_global_struct.self = 0;
	ED_LoadFromFile( map.entities );
	sv.state = ss_active;

	// the client's edict is 1 (the native layout reserves the client slots first); start at the map's player start
	const player = sv.edicts[ 1 ];
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	check( start !== undefined, 'the level has a player start' );
	player.v.origin = [ start.v.origin[ 0 ], start.v.origin[ 1 ], start.v.origin[ 2 ] ];
	player.v.angles = [ 0, start.v.angles[ 1 ], 0 ];
	player.v.health = 100; player.v.max_health = 100;
	player.v.playerclass = 1; // Paladin
	player.v.flags = FL_CLIENT | FL_ONGROUND;
	svs.clients = [ { name: 'trial', active: true, spawned: false, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon } ];
	pr_global_struct.self = 1; pr_global_struct.time = sv.time;

	let error = null;
	try {

		if ( pr_global_struct.ClientConnect ) PR_ExecuteProgram( pr_global_struct.ClientConnect );
		PR_ExecuteProgram( pr_global_struct.PutClientInServer );

	} catch ( e ) { error = e; }
	check( error === null, 'ClientConnect and PutClientInServer complete: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	same( PR_GetString( player.v.classname ), 'player', 'the client became a player entity' );
	same( PR_GetString( player.v.model ), 'models/paladin.mdl', 'the Paladin model' );
	same( player.v.playerclass, 1, 'the native Paladin class number' );
	same( player.v.health, 100, 'the starting health' );
	same( player.v.size.join( ',' ), '32,32,56', 'the player hull size' );
	check( Math.abs( player.v.origin[ 0 ] ) > 1 || Math.abs( player.v.origin[ 1 ] ) > 1, 'the player stands at the map spawn: ' + player.v.origin );

	// Settle the native feet-origin box on the floor with the gamecode's own droptofloor (self-based), then walk:
	// the hull offset converts the feet origin onto hull 1's centre-based tree, one 32-unit step in +x, on the floor.
	pr_global_struct.self = 1;
	check( Hexen2_CallBuiltin( 34, { random: () => 0.5 } ) === true, 'droptofloor is implemented' );
	same( pr_globals.getFloat( OFS_RETURN ), 1, 'the player dropped to the floor' );
	check( Math.abs( player.v.origin[ 2 ] ) < 1, 'the feet are on the floor: ' + player.v.origin[ 2 ] );
	const before = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];
	player.v.flags = ( player.v.flags | 0 ) | FL_ONGROUND;
	pr_global_struct.self = 1;
	pr_global_struct.time = sv.time;
	pr_globals.setFloat( OFS_PARM0, 0 );
	pr_globals.setFloat( OFS_PARM1, 32 );
	check( Hexen2_CallBuiltin( 32, { random: () => 0.5 } ) === true, 'walkmove is implemented' );
	same( pr_globals.getFloat( OFS_RETURN ), 1, 'the step succeeded' );
	check( Math.abs( player.v.origin[ 0 ] - ( before[ 0 ] + 32 ) ) < 0.1, 'the player advanced 32 units in +x: ' + player.v.origin );
	same( player.v.origin[ 1 ], before[ 1 ], 'the player did not slide sideways' );
	check( Math.abs( player.v.origin[ 2 ] - before[ 2 ] ) < 1, 'the player stayed on the floor: ' + player.v.origin[ 2 ] );

} );
