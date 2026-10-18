// The supplied Hexen II level's entity spawn through the existing server: native precache layout (dummy 0, world 1,
// inline submodels 2..), ED_LoadFromFile parsing the map with the Hexen field definitions, and every spawn function
// running on the implemented builtins. Verifies the real gamecode reaches the end of the level's entity list.
// plan sections 3-5; G1 prerequisite.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { PR_LoadProgs, PR_AllocEdicts, ED_LoadFromFile } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, SOLID_BSP, MOVETYPE_PUSH, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
const SUPPLIED = existsSync( HEXEN + '/pak0.pak' ) && existsSync( HEXEN + '/pak1.pak' ) && existsSync( HEXEN + '/progs.dat' );

function spawnLevel() {

	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) {

		const raw = readFileSync( HEXEN + '/' + name );
		pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

	}
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
	sv.worldmodel = map;
	sv.models = new Array( 512 ).fill( null ); sv.models[ 1 ] = map;
	sv.model_precache = new Array( 512 ).fill( null );
	sv.model_precache[ 0 ] = ''; sv.model_precache[ 1 ] = 'maps/demo1.bsp';
	for ( let i = 1; i < map.numsubmodels; i ++ ) {

		sv.model_precache[ 1 + i ] = '*' + i;
		sv.models[ 1 + i ] = Mod_FindName( '*' + i );

	}
	sv.sound_precache = new Array( 512 ).fill( null );
	sv.state = ss_loading; sv.time = 0.1;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE; sv.signon.cursize = 0;
	const world = sv.edicts[ 0 ];
	world.v.solid = SOLID_BSP; world.v.movetype = MOVETYPE_PUSH; world.v.modelindex = 1;
	SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	pr_global_struct.time = 0.1; pr_global_struct.self = 0;
	ED_LoadFromFile( map.entities );
	return { sv, map };

}

Deno.test( 'the supplied level spawns every entity with the supplied gamecode', () => {

	if ( ! SUPPLIED ) { console.log( 'SKIP: the supplied Hexen II installation is not present at ' + HEXEN ); return; }
	let result = null, error = null;
	try { result = spawnLevel(); } catch ( e ) { error = e; }
	check( error === null, 'the spawn completed without a program error: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	const sv = result.sv;
	// pinned counts for the supplied demo1.bsp; a change means the spawn path or the level data changed
	same( sv.num_edicts, 330, 'the spawned edict count' );
	same( sv.model_precache.filter( entry => entry !== null ).length, 343, 'the model precache count' );
	same( sv.sound_precache.filter( entry => entry !== null ).length, 215, 'the sound precache count' );
	same( sv.model_precache[ 0 ], '', 'slot 0 is the native empty dummy' );
	same( sv.model_precache[ 1 ], 'maps/demo1.bsp', 'slot 1 is the world map' );
	same( sv.model_precache[ 2 ], '*1', 'slot 2 is the first inline submodel' );
	check( sv.signon.cursize > 0, 'the signon stream has content' );

	// the level's real entities are present, parsed with the Hexen field definitions
	const classes = new Set(), lump = sv.edicts[ 0 ];
	same( PR_GetString( lump.v.classname ), 'worldspawn', 'the world entity' );
	for ( let i = 0; i < sv.num_edicts; i ++ ) {

		const ent = sv.edicts[ i ];
		if ( ent && ! ent.free ) classes.add( PR_GetString( ent.v.classname ) );

	}
	for ( const expected of [ 'worldspawn', 'info_player_start', 'breakable_brush', 'barrel', 'monster_archer', 'monster_spider_yellow_small', 'monster_skull_wizard', 'obj_tree2', 'puzzle_piece', 'trigger_changelevel', 'door' ] )
		check( classes.has( expected ), 'the level spawned a ' + expected );
	// a spawned player start keeps the map's origin
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	check( start !== undefined, 'the player start exists' );
	check( Math.abs( start.v.origin[ 0 ] ) > 1 || Math.abs( start.v.origin[ 1 ] ) > 1, 'the player start has its map origin' );

} );
