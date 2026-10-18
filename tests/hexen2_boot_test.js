// The Hexen II boot pipeline: an Installed-rules session with a Paladin, the native precache layout, the supplied
// level's entities, and the client's player placed by the supplied gamecode, then one engine input frame. This is the
// reusable path a host entry point will call. plan sections 3-5; G1 prerequisite.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetPlayer, SV_SetFrametime, SV_Physics_Client, SV_SetState } from '../src/engine/server/sv_phys.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, ss_active, SOLID_BSP, MOVETYPE_PUSH, SIGNON_SIZE, MOVETYPE_WALK, SOLID_SLIDEBOX, FL_ONGROUND } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { SV_ClientThink, SV_User_SetCommand, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { Hexen2_CreateSession, Hexen2_SelectClass } from '../src/engine/common/hexen2_profile.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities, Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'an Installed session boots the level and places a Paladin who then walks', () => {

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

	// the session: Installed retail gamecode with its native rules, Paladin
	const created = Hexen2_CreateSession( { gameId: 'hexen2', contentRoot: 'owned-hexen2-base', gamecodeMode: 'installed', rules: 'classic' } );
	check( created.ok, created.reason );
	same( created.session.gamecodeMode, 'installed', 'installed gamecode' );
	same( Hexen2_SelectClass( 'hexen2', 'paladin' ).number, 1, 'the Paladin number' );
	check( Hexen2_SelectClass( 'hexen2', 'succubus' ).ok === false, 'the base edition refuses the Succubus' );

	const sv = serverSv;
	PR_SetSV( sv );
	PR_SetSVS( { maxclients: 1, clients: [], active: true } );
	sv.time = 0.1;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE; sv.signon.cursize = 0;
	sv.worldmodel = map;
	Hexen2_SeedPrecache( sv, map, name => Mod_FindName( name ) );
	sv.state = ss_loading;
	SV_SetState( sv, svs, pr_global_struct );
	SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	Hexen2_SpawnEntities( sv, map, 392, PR_AllocEdicts );

	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	check( start !== undefined, 'the level spawned its player start' );
	const player = sv.edicts[ 1 ];
	const client = { name: 'boot', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ], forwardmove: 0, sidemove: 0, upmove: 0 } };
	svs.clients[ 0 ] = client;
	const placed = Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId: 'paladin', origin: start.v.origin, angles: [ 0, start.v.angles[ 1 ], 0 ] } );
	check( placed.ok, placed.reason );
	same( PR_GetString( player.v.classname ), 'player', 'the client became a player' );
	same( PR_GetString( player.v.model ), 'models/paladin.mdl', 'the Paladin model' );
	same( player.v.playerclass, 1, 'the native class number' );
	same( player.v.health, 100, 'starting health' );
	check( Math.abs( player.v.origin[ 2 ] ) < 1, 'the feet settled on the floor: ' + player.v.origin[ 2 ] );

	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	SV_SetPlayer( player );
	SV_SetFrametime( 0.1 );
	player.v.angles = [ 0, 0, 0 ]; player.v.v_angle = [ 0, 0, 0 ]; player.v.velocity = [ 0, 0, 0 ];
	player.v.movetype = MOVETYPE_WALK; player.v.solid = SOLID_SLIDEBOX;
	const before = player.v.origin[ 0 ];
	SV_User_SetCommand( { forwardmove: 320, sidemove: 0, upmove: 0, viewangles: [ 0, 0, 0 ] } );
	SV_ClientThink();
	SV_Physics_Client( player, 1 );
	check( player.v.origin[ 0 ] - before > 20, 'the booted Paladin walks: ' + ( player.v.origin[ 0 ] - before ) );
	check( ( player.v.flags | 0 ) & FL_ONGROUND, 'the booted Paladin stays grounded' );

} );
