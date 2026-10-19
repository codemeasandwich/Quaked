// The single local-session entry point: a playable entry and class mount the level, the local client receives the
// same signon/stat messages, and the caller gets a client state, HUD and native status-bar operations that match the
// server. This is the host-facing start path; drawing/audio and the packaged UI remain separate.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_FindName } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { Hexen2_OpenLocalSession } from '../src/engine/progs/hexen2_session.js';
import { Hexen2_ReadHud } from '../src/engine/client/hexen2_hud.js';
import { Hexen2_BindClientState } from '../src/engine/client/hexen2_bind.js';
import { cl, cl_entities } from '../src/engine/client/client.js';
import { V_CalcRefdef } from '../src/engine/client/view.js';
import { r_refdef } from '../src/engine/render/render.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m, tol = 2 ) => check( Math.abs( a - b ) < tol, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'one call starts a local Paladin session with a matching client state', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const client = { name: 'local', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	client.message = sv.signon;
	const svs = { maxclients: 1, clients: [ client ], active: true };
	const entry = { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true };
	const session = Hexen2_OpenLocalSession( {
		entry, classId: 'paladin', client, sv, svs,
		readFile: name => existsSync( HEXEN + '/' + name ) ? new Uint8Array( readFileSync( HEXEN + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( session.ok, session.reason );
	same( session.plan.session.gameId, 'hexen2', 'the session game' );
	same( session.plan.classNumber, 1, 'the Paladin class' );
	same( session.state.viewEntity, 1, 'the local client view entity' );
	same( session.state.playerClass, 1, 'the local client class from updateclass' );
	check( session.state.models.length > 100, 'the local client has the model precache list: ' + session.state.models.length );
	check( session.state.baselines.size > 100, 'the local client has baselines: ' + session.state.baselines.size );
	const serverHud = Hexen2_ReadHud( session.player );
	same( session.hud.health, serverHud.health, 'the HUD health matches the server' );
	same( session.hud.maxMana, serverHud.maxMana, 'the HUD maximum mana matches' );
	same( session.hud.playerClass, serverHud.playerClass, 'the HUD class matches' );
	same( session.hud.armour.armor_amulet, serverHud.armour.armor_amulet, 'the armour matches' );
	check( session.statusBarOps.length > 5, 'the native status bar is emitted' );
	same( session.statusBarOps[ 0 ].name, 'gfx/topbumpl.lmp', 'the status bar leads with the native upper-left bump' );
	check( session.statusBarOps.some( op => op.name === 'gfx/topbar1.lmp' ), 'the status bar includes the top bar' );

	// the returned state binds to the client view without another conversion
	cl.worldmodel = session.map; cl.model_precache = []; cl.time = 0; cl.velocity = [ 0, 0, 0 ];
	cl.paused = false; cl.intermission = false;
	const bound = Hexen2_BindClientState( session.state, { cl, clEntities: cl_entities, modelAt: name => Mod_FindName( name ), viewangles: [ 0, 90, 0 ] } );
	check( bound.ok, bound.reason );
	same( bound.viewEntity, 1, 'the bound view entity' );
	V_CalcRefdef();
	near( r_refdef.vieworg[ 0 ], session.player.v.origin[ 0 ] + 1 / 32, 'the local view x', 0.1 );
	near( r_refdef.viewangles[ 1 ], 90, 'the local view yaw', 0.01 );

} );
