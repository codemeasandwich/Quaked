// RED (retained): the box the gamecode derives for the Paladin from the supplied RAPO model must be the native
// player hull, because setmodel applies the model's bounds and the engine's centre-origin hull offset assumes
// mins == hull.clip_mins (z -24). Today the supplied paladin.mdl yields mins z 0 / maxs z 56, which shifts every
// player trace by 24 units and is why the walking test must set the native box itself. This test is expected to
// fail until the RAPO frame/scale/origin handling is corrected; it must not be weakened or deleted.
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
import { sv as serverSv, ss_loading, ss_active, SOLID_BSP, MOVETYPE_PUSH, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'RED: the Paladin model yields the native player hull box', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
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
	sv.max_edicts = 600; sv.num_edicts = 2; sv.edicts = PR_AllocEdicts( 2, 392 );
	sv.worldmodel = map; sv.models = new Array( 512 ).fill( null ); sv.models[ 1 ] = map;
	sv.model_precache = new Array( 512 ).fill( null ); sv.model_precache[ 0 ] = ''; sv.model_precache[ 1 ] = 'maps/demo1.bsp';
	for ( let i = 1; i < map.numsubmodels; i ++ ) { sv.model_precache[ 1 + i ] = '*' + i; sv.models[ 1 + i ] = Mod_FindName( '*' + i ); }
	sv.sound_precache = new Array( 512 ).fill( null );
	sv.state = ss_loading; sv.time = 0.1;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE; sv.signon.cursize = 0;
	const world = sv.edicts[ 0 ]; world.v.solid = SOLID_BSP; world.v.movetype = MOVETYPE_PUSH; world.v.modelindex = 1;
	SV_ClearWorld(); installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	pr_global_struct.time = 0.1; pr_global_struct.self = 0;
	ED_LoadFromFile( map.entities );
	sv.state = ss_active;

	const player = sv.edicts[ 1 ];
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	player.v.origin = [ start.v.origin[ 0 ], start.v.origin[ 1 ], start.v.origin[ 2 ] ];
	player.v.health = 100; player.v.max_health = 100; player.v.playerclass = 1;
	svs.clients = [ { name: 'red', active: true, spawned: false, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon } ];
	pr_global_struct.self = 1; pr_global_struct.time = sv.time;
	if ( pr_global_struct.ClientConnect ) PR_ExecuteProgram( pr_global_struct.ClientConnect );
	PR_ExecuteProgram( pr_global_struct.PutClientInServer );

	// the native player hull (hull 1): mins -16,-16,-24 and maxs 16,16,32
	same( player.v.mins.join( ',' ), '-16,-16,-24', 'the Paladin mins are the native player hull mins' );
	same( player.v.maxs.join( ',' ), '16,16,32', 'the Paladin maxs are the native player hull maxs' );

} );
