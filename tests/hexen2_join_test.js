// Late join: a client connecting after the game started receives a snapshot (serverinfo, current baselines, class,
// view, its player's stats) that builds the same client state as an initial signon, including moved players' current
// positions. Network transport of the snapshot is covered by the peer tests.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { Hexen2_BuildJoinSnapshot } from '../src/engine/progs/hexen2_join.js';
import { Hexen2_ClientState, Hexen2_ApplyClientMessage } from '../src/engine/client/hexen2_clientstate.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'a late joiner builds the current world from its snapshot', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const clientA = { name: 'a', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
	const clientB = { name: 'b', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	clientA.message = sv.signon; clientB.message = sv.signon;
	const svs = { maxclients: 2, clients: [ clientA, clientB ], active: true };
	const entry = { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true };
	const mounted = Hexen2_MountLevel( {
		entry, classId: 'paladin', client: clientA, sv, svs,
		readFile: name => existsSync( HEXEN + '/' + name ) ? new Uint8Array( readFileSync( HEXEN + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );
	const playerA = mounted.player, playerB = sv.edicts[ 2 ];
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	clientB.edict = playerB;
	const placedB = Hexen2_SpawnPlayer( { sv, client: clientB, player: playerB, gameId: 'hexen2', classId: 'crusader',
		origin: [ start.v.origin[ 0 ] + 32, start.v.origin[ 1 ], start.v.origin[ 2 ] ] } );
	check( placedB.ok, placedB.reason );
	// A has been playing: move it before B's late join
	playerA.v.origin = [ playerA.v.origin[ 0 ] + 48, playerA.v.origin[ 1 ], playerA.v.origin[ 2 ] ];
	SV_LinkEdict( playerA, true );

	const snapshot = Hexen2_BuildJoinSnapshot( sv, { playerIndex: 2, classNumber: 2, clientSlot: 1, maxClients: 2 } );
	check( snapshot.ok, snapshot.reason );
	const state = Hexen2_ClientState();
	for ( const message of snapshot.messages ) check( Hexen2_ApplyClientMessage( state, message ).ok, 'snapshot message applied' );
	same( state.maxClients, 2, 'the snapshot max clients' );
	same( state.levelName, 'demo1', 'the snapshot level' );
	same( state.viewEntity, 2, 'the joining view entity' );
	same( state.playerClass, 2, 'the joining class' );
	same( state.stats.health, playerB.v.health, 'the joining health' );
	same( state.stats.max_mana, playerB.v.max_mana | 0, 'the joining maximum mana' );
	check( state.baselines.size > 100, 'the snapshot carries the baselines: ' + state.baselines.size );
	const baselineA = state.baselines.get( 1 );
	check( baselineA !== undefined, 'the already-playing player has a baseline' );
	check( Math.abs( baselineA.origin[ 0 ] - playerA.v.origin[ 0 ] ) < 0.2, 'the baseline reflects A moved: ' + baselineA.origin[ 0 ] + ' vs ' + playerA.v.origin[ 0 ] );

	check( Hexen2_BuildJoinSnapshot( sv, { playerIndex: 99, classNumber: 2 } ).ok === false, 'a missing player is refused' );
	check( Hexen2_BuildJoinSnapshot( sv, { playerIndex: 2, classNumber: 0 } ).ok === false, 'an invalid class is refused' );

} );
