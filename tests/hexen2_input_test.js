// Engine player movement on the spawned Hexen level: a synthetic usercmd drives the same SV_ClientThink and
// SV_Physics_Client path a real client uses (gamecode PlayerPreThink then the engine's walk move), and the Paladin
// advances on the floor. plan section 5; G1 prerequisite for input/camera.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetPlayer, SV_SetFrametime, SV_Physics_Client, SV_SetState, FL_ONGROUND, SOLID_SLIDEBOX, MOVETYPE_WALK } from '../src/engine/server/sv_phys.js';
import { PR_LoadProgs, PR_AllocEdicts, ED_LoadFromFile } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, ss_active, SOLID_BSP, MOVETYPE_PUSH, SIGNON_SIZE, FL_CLIENT } from '../src/engine/server/server.js';
import { PR_ExecuteProgram, PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { SV_ClientThink, SV_User_SetCommand, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'a synthetic usercmd moves the Paladin through the engine path on the supplied level', () => {

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
	PR_SetSV( sv );
	const state = { maxclients: 1, clients: [], active: true };
	PR_SetSVS( state );
	sv.max_edicts = 600; sv.num_edicts = 2; sv.edicts = PR_AllocEdicts( 2, 392 );
	sv.worldmodel = map; sv.models = new Array( 512 ).fill( null ); sv.models[ 1 ] = map;
	sv.model_precache = new Array( 512 ).fill( null ); sv.model_precache[ 0 ] = ''; sv.model_precache[ 1 ] = 'maps/demo1.bsp';
	for ( let i = 1; i < map.numsubmodels; i ++ ) { sv.model_precache[ 1 + i ] = '*' + i; sv.models[ 1 + i ] = Mod_FindName( '*' + i ); }
	sv.sound_precache = new Array( 512 ).fill( null );
	sv.state = ss_loading; sv.time = 0.1;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const world = sv.edicts[ 0 ]; world.v.solid = SOLID_BSP; world.v.movetype = MOVETYPE_PUSH; world.v.modelindex = 1;
	SV_SetState( sv, svs, pr_global_struct );
	SV_ClearWorld(); installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	pr_global_struct.time = 0.1; pr_global_struct.self = 0;
	ED_LoadFromFile( map.entities );
	sv.state = ss_active;

	const player = sv.edicts[ 1 ];
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	player.v.origin = [ start.v.origin[ 0 ], start.v.origin[ 1 ], start.v.origin[ 2 ] ];
	player.v.health = 100; player.v.max_health = 100; player.v.playerclass = 1;
	player.v.flags = FL_CLIENT | FL_ONGROUND;
	const client = { name: 'trial', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ], forwardmove: 0, sidemove: 0, upmove: 0 } };
	state.clients = [ client ];
	pr_global_struct.self = 1; pr_global_struct.time = sv.time;
	if ( pr_global_struct.ClientConnect ) PR_ExecuteProgram( pr_global_struct.ClientConnect );
	PR_ExecuteProgram( pr_global_struct.PutClientInServer );
	pr_global_struct.self = 1;
	check( Hexen2_CallBuiltin( 34, { random: () => 0.5 } ) === true, 'the player drops to the floor' );
	check( Math.abs( player.v.origin[ 2 ] ) < 1, 'feet on the floor before moving: ' + player.v.origin[ 2 ] );

	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	SV_SetPlayer( player );
	SV_SetFrametime( 0.1 );
	player.v.angles = [ 0, 0, 0 ]; player.v.v_angle = [ 0, 0, 0 ]; player.v.velocity = [ 0, 0, 0 ];
	player.v.movetype = MOVETYPE_WALK; player.v.solid = SOLID_SLIDEBOX;

	const before = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];
	let error = null;
	try {

		for ( let frame = 0; frame < 3; frame ++ ) {

			SV_User_SetCommand( { forwardmove: 320, sidemove: 0, upmove: 0, viewangles: [ 0, 0, 0 ] } );
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
	same( player.v.health, 100, 'the player is unhurt by walking' );

} );
