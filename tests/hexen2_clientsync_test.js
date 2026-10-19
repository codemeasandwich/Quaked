// A joining client builds its world from the private signon: serverinfo, the mounted level's baselines, signonnum,
// setview, then player clientdata/stats and a live entity update applied to the client entity table. This is the
// client-side state foundation for the private session; rendering and prediction are separate.
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
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_BuildServerinfo, Hexen2_BuildBaselines, Hexen2_BuildSetView } from '../src/engine/progs/hexen2_signon_build.js';
import { Hexen2_ClientState, Hexen2_ApplyClientMessage } from '../src/engine/client/hexen2_clientstate.js';
import { Hexen2_WriteSignonNum } from '../src/engine/common/hexen2_signon.js';
import { Hexen2_EncodeClientdata, Hexen2_EncodeUpdateInv } from '../src/engine/common/hexen2_clientdata.js';
import { Hexen2_WriteEntityUpdate } from '../src/engine/common/hexen2_entitywire.js';
import { HEXEN2_SERVER_MESSAGES } from '../src/engine/common/hexen2_protocol.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'a client builds its signon world and applies live state', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const client = { name: 'clientsync', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
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

	// serverinfo from the mounted level
	const info = Hexen2_BuildServerinfo( sv, { maxClients: 1 } );
	check( info.ok, info.reason );
	check( Hexen2_ApplyClientMessage( state, info.bytes ).ok, 'serverinfo applied' );
	same( state.protocol, 1019, 'the private protocol' );
	same( state.levelName, 'demo1', 'the level name' );
	same( state.models[ 0 ], 'maps/demo1.bsp', 'the map is the first model after the native dummy slot' );
	check( state.sounds.length > 0, 'the sound precache list' );

	// baselines for the mounted entities, in entity order
	const baselines = Hexen2_BuildBaselines( sv );
	check( baselines.ok, baselines.reason );
	check( baselines.count > 100, 'the mounted level produced many baselines: ' + baselines.count );
	for ( const message of baselines.messages ) { check( Hexen2_ApplyClientMessage( state, message ).ok, 'baseline applied' ); }
	same( state.baselines.size, baselines.count, 'every baseline is in the client table' );
	// the player model is a client-side model (CL_ParseServerInfo's player_models), so entity 1's baseline is only
	// present if the gamecode precached it; every baseline that is present must reference a valid precache index
	const paladinIndex = state.models.indexOf( 'models/paladin.mdl' ) + 1; // native model index (slot 0 is the dummy)
	if ( paladinIndex > 0 && state.baselines.get( 1 ) !== undefined )
		same( state.baselines.get( 1 ).modelIndex, paladinIndex, 'the player baseline model index' );
	for ( const [ entity, baseline ] of state.baselines ) check( baseline.modelIndex > 0 && baseline.modelIndex <= state.models.length, `baseline ${entity} has a valid model index` );

	// signon stage and view entity
	const signon = Hexen2_WriteSignonNum( 3 );
	check( Hexen2_ApplyClientMessage( state, signon.bytes ).ok, 'signonnum applied' );
	same( state.signonStage, 3, 'the signon stage' );
	const setview = Hexen2_BuildSetView( 1 );
	check( setview.ok, setview.reason );
	check( Hexen2_ApplyClientMessage( state, setview.bytes ).ok, 'setview applied' );
	same( state.viewEntity, 1, 'the view entity' );

	// player clientdata and stats, then a live entity update
	const clientdata = Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.clientdata, ...Hexen2_EncodeClientdata( mounted.player ) ] );
	check( Hexen2_ApplyClientMessage( state, clientdata ).ok, 'clientdata applied' );
	same( state.viewHeight, mounted.player.v.view_ofs[ 2 ], 'the client view height' );
	const statsMask = 0x81n;
	const stats = Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.update_inv, ...Hexen2_EncodeUpdateInv( mounted.player, statsMask ) ] );
	check( Hexen2_ApplyClientMessage( state, stats ).ok, 'update_inv applied' );
	same( state.stats.health, mounted.player.v.health, 'the client health' );
	same( state.stats.bluemana, mounted.player.v.bluemana | 0, 'the client blue mana' );

	const update = Hexen2_WriteEntityUpdate( { entity: 42, modelIndex: 3, origin: [ 100, 200, 300 ], angles: [ 0, 90, 0 ] } );
	check( update.ok, update.reason );
	check( Hexen2_ApplyClientMessage( state, update.bytes ).ok, 'entity update applied' );
	same( state.entities.get( 42 ).modelIndex, 3, 'the live entity model' );
	same( Math.round( state.entities.get( 42 ).origin[ 0 ] ), 100, 'the live entity origin' );

	check( Hexen2_ApplyClientMessage( state, Uint8Array.from( [ 200 ] ) ).ok === false, 'an unknown client message is refused' );
	check( Hexen2_ApplyClientMessage( state, info.bytes.subarray( 0, info.bytes.length - 3 ) ).ok === false, 'a truncated serverinfo is refused' );

} );
