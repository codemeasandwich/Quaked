// The existing client view path consumes a Hexen II player: the player becomes cl_entities[cl.viewentity], the
// gamecode's eye height becomes cl.viewheight, the look direction becomes cl.viewangles, and V_CalcRefdef builds the
// renderer's refresh view, which then marks the world's leaves and surfaces. plan section 7; G1 presentation
// prerequisite.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetState } from '../src/engine/server/sv_phys.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities, Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { Hexen2_ApplyPlayerView } from '../src/engine/client/hexen2_client.js';
import { V_CalcRefdef } from '../src/engine/client/view.js';
import { cl, cl_entities } from '../src/engine/client/client.js';
import { r_refdef } from '../src/engine/render/render.js';
import { GL_BuildLightmaps, R_DrawWorld } from '../src/engine/render/gl_rsurf.js';
import { R_MarkLeaves } from '../src/engine/render/gl_rsurf_batches.js';
import { r_visframecount, set_r_viewleaf, set_r_oldviewleaf, set_r_worldentity } from '../src/engine/render/gl_rmain.js';
import { Mod_PointInLeaf } from '../src/engine/render/gl_model.js';
import { entity_t } from '../src/engine/render/render.js';
import { Cvar_Set } from '../src/engine/common/cvar.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
// the selected catalogue game is the session's profile before any progs or map load
GameProfile_Set( 'hexen2' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m, tol = 2 ) => check( Math.abs( a - b ) < tol, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the client view path consumes the Hexen player and marks the world', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const progsBytes = readFileSync( HEXEN + '/progs.dat' );
	PR_LoadProgs( progsBytes.buffer.slice( progsBytes.byteOffset, progsBytes.byteOffset + progsBytes.byteLength ) );
	const map = new model_t(); map.name = 'maps/demo1.bsp'; set_loadmodel( map );
	const bsp = pak.COM_FindFile( 'maps/demo1.bsp' ).data;
	Mod_LoadBrushModel( map, bsp.buffer.slice( bsp.byteOffset, bsp.byteOffset + bsp.byteLength ) );

	const sv = serverSv;
	PR_SetSV( sv ); PR_SetSVS( { maxclients: 1, clients: [], active: true } );
	sv.time = 0.1; sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	sv.worldmodel = map;
	Hexen2_SeedPrecache( sv, map, name => Mod_FindName( name ) );
	sv.state = ss_loading;
	SV_SetState( sv, svs, pr_global_struct );
	SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	Hexen2_SpawnEntities( sv, map, 392, PR_AllocEdicts );
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	const player = sv.edicts[ 1 ];
	const client = { name: 'view', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	svs.clients[ 0 ] = client;
	check( Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId: 'paladin', origin: start.v.origin } ).ok, 'the Paladin spawned' );

	// the client world and the player's view entity, then the existing V_CalcRefdef
	cl.worldmodel = map;
	cl.model_precache = [ map, map ];
	cl.state = 2; cl.time = 0; cl.velocity = [ 0, 0, 0 ]; cl.paused = false; cl.intermission = false;
	Cvar_Set( 'cl_bob', '0' ); Cvar_Set( 'cl_bobup', '0' ); // no view bob in this measurement
	const applied = Hexen2_ApplyPlayerView( { cl, clEntities: cl_entities, viewangles: [ 10, 90, 0 ] }, player );
	check( applied.ok, applied.reason );
	same( applied.viewentity, 1, 'the view entity is the player' );
	same( applied.viewheight, player.v.view_ofs[ 2 ], 'the gamecode eye height reached the client' );
	V_CalcRefdef();
	const origin = player.v.origin;
	near( r_refdef.vieworg[ 0 ], origin[ 0 ] + 1 / 32, 'view x', 0.1 );
	near( r_refdef.vieworg[ 1 ], origin[ 1 ] + 1 / 32, 'view y', 0.1 );
	near( r_refdef.vieworg[ 2 ], origin[ 2 ] + player.v.view_ofs[ 2 ] + 1 / 32, 'view z', 2 );
	near( r_refdef.viewangles[ 0 ], 10, 'pitch', 0.01 );
	near( r_refdef.viewangles[ 1 ], 90, 'yaw', 0.01 );

	// the world frame from this client view: leaves marked, BSP walked, visible surfaces marked
	set_r_worldentity( new entity_t() );
	GL_BuildLightmaps();
	const leaf = Mod_PointInLeaf( new Float32Array( r_refdef.vieworg ), map );
	set_r_viewleaf( leaf );
	set_r_oldviewleaf( null );
	R_MarkLeaves();
	let error = null;
	try { R_DrawWorld(); } catch ( e ) { error = e; }
	check( error === null, 'the client-view world frame was prepared: ' + ( error ? error.message : '' ) );
	let marked = 0;
	for ( const surface of map.surfaces ) if ( surface.visframe === r_visframecount ) marked ++;
	check( marked > 0, 'the client view marks visible surfaces: ' + marked );

} );
