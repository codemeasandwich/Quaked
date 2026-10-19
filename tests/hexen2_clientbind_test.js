// The synced client world drives the port's client view and renderer: signon/baseline/entity state is bound to
// cl_entities with the view entity and view height, V_CalcRefdef builds the eye from it, and the renderer prepares a
// frame for that client view. This is the codec → client → renderer wiring (canvas drawing still separate).
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_PointInLeaf, Mod_FindName } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_BuildServerinfo, Hexen2_BuildBaselines, Hexen2_BuildSetView } from '../src/engine/progs/hexen2_signon_build.js';
import { Hexen2_ClientState, Hexen2_ApplyClientMessage } from '../src/engine/client/hexen2_clientstate.js';
import { Hexen2_BindClientState } from '../src/engine/client/hexen2_bind.js';
import { Hexen2_WriteEntityUpdate } from '../src/engine/common/hexen2_entitywire.js';
import { Hexen2_WriteSignonNum } from '../src/engine/common/hexen2_signon.js';
import { Hexen2_EncodeClientdata } from '../src/engine/common/hexen2_clientdata.js';
import { HEXEN2_SERVER_MESSAGES } from '../src/engine/common/hexen2_protocol.js';
import { cl, cl_entities } from '../src/engine/client/client.js';
import { V_CalcRefdef } from '../src/engine/client/view.js';
import { r_refdef, entity_t } from '../src/engine/render/render.js';
import { GL_BuildLightmaps, R_DrawWorld } from '../src/engine/render/gl_rsurf.js';
import { R_MarkLeaves } from '../src/engine/render/gl_rsurf_batches.js';
import { r_visframecount, set_r_viewleaf, set_r_oldviewleaf, set_r_worldentity } from '../src/engine/render/gl_rmain.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m, tol = 2 ) => check( Math.abs( a - b ) < tol, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the synced client state drives the view and renderer', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const client = { name: 'bind', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	client.message = sv.signon;
	const svs = { maxclients: 1, clients: [ client ], active: true };
	const entry = { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true };
	const mounted = Hexen2_MountLevel( {
		entry, classId: 'paladin', client, sv, svs,
		readFile: name => existsSync( HEXEN + '/' + name ) ? new Uint8Array( readFileSync( HEXEN + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );
	const state = Hexen2_ClientState();
	check( Hexen2_ApplyClientMessage( state, Hexen2_BuildServerinfo( sv ).bytes ).ok, 'serverinfo' );
	for ( const message of Hexen2_BuildBaselines( sv ).messages ) Hexen2_ApplyClientMessage( state, message );
	check( Hexen2_ApplyClientMessage( state, Hexen2_WriteSignonNum( 3 ).bytes ).ok, 'signonnum' );
	check( Hexen2_ApplyClientMessage( state, Hexen2_BuildSetView( 1 ).bytes ).ok, 'setview' );
	check( Hexen2_ApplyClientMessage( state, Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.clientdata, ...Hexen2_EncodeClientdata( mounted.player ) ] ) ).ok, 'clientdata' );

	// the player's origin arrives as a live entity update (the signon baseline may have no player model)
	const playerOrigin = mounted.player.v.origin;
	const update = Hexen2_WriteEntityUpdate( { entity: 1, origin: [ playerOrigin[ 0 ], playerOrigin[ 1 ], playerOrigin[ 2 ] ], angles: [ 0, 90, 0 ] } );
	check( update.ok, update.reason );
	check( Hexen2_ApplyClientMessage( state, update.bytes ).ok, 'player entity update' );

	cl.worldmodel = mounted.map; cl.model_precache = []; cl.state = 2; cl.time = 0; cl.velocity = [ 0, 0, 0 ];
	cl.paused = false; cl.intermission = false;
	const bound = Hexen2_BindClientState( state, { cl, clEntities: cl_entities, modelAt: name => Mod_FindName( name ), viewangles: [ 0, 90, 0 ] } );
	check( bound.ok, bound.reason );
	same( bound.viewEntity, 1, 'the bound view entity' );
	check( bound.boundEntities > 100, 'the baselines were bound: ' + bound.boundEntities );
	same( cl.viewheight, mounted.player.v.view_ofs[ 2 ], 'the bound view height' );
	near( cl_entities[ 1 ].origin[ 0 ], playerOrigin[ 0 ], 'the player entity origin', 0.01 );

	V_CalcRefdef();
	near( r_refdef.vieworg[ 0 ], playerOrigin[ 0 ] + 1 / 32, 'the view x', 0.1 );
	near( r_refdef.vieworg[ 2 ], playerOrigin[ 2 ] + mounted.player.v.view_ofs[ 2 ] + 1 / 32, 'the view z', 2 );
	near( r_refdef.viewangles[ 1 ], 90, 'the view yaw', 0.01 );

	set_r_worldentity( new entity_t() );
	GL_BuildLightmaps();
	const leaf = Mod_PointInLeaf( new Float32Array( r_refdef.vieworg ), mounted.map );
	set_r_viewleaf( leaf ); set_r_oldviewleaf( null );
	R_MarkLeaves();
	let error = null;
	try { R_DrawWorld(); } catch ( e ) { error = e; }
	check( error === null, 'the frame prepared: ' + ( error ? error.message : '' ) );
	let marked = 0;
	for ( const surface of mounted.map.surfaces ) if ( surface.visframe === r_visframecount ) marked ++;
	check( marked > 0, 'the synced client view marks visible surfaces: ' + marked );

} );
