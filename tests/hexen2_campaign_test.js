// A two-map demo route through the save/transition/hub path: demo1's trigger names demo2/demo1, the gamecode changelevel
// builtin records it, the next map mounts at that start spot, and returning to demo1 restores its saved world/player.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_SetTempString, G_INT_SET, PR_GetString } from '../src/engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1 } from '../src/engine/progs/pr_comp.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import { Hexen2_BuildSaveBundle, Hexen2_ApplySaveBundle } from '../src/engine/common/hexen2_save.js';
import { GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { Hexen2_CaptureWorld, Hexen2_RestoreWorld } from '../src/engine/common/hexen2_hub.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'demo1 -> demo2 -> village1 -> village2 -> demo1 works through changelevel, start spot and hub restore', () => {

	if ( ! existsSync( BASE + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( BASE + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'base-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const client = { name: 'route', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	const mount = ( level, spot, state ) => Hexen2_MountLevel( {
		entry: { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true },
		classId: 'paladin', skill: 1, level, spot, client, sv, svs: state,
		readFile: name => existsSync( BASE + '/' + name ) ? new Uint8Array( readFileSync( BASE + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	const firstState = { maxclients: 1, clients: [ client ], active: true, changelevel_issued: false };
	const first = mount( 'maps/demo1.bsp', undefined, firstState );
	check( first.ok, first.reason );
	first.player.v.health = 77;
	const trigger = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'trigger_changelevel' );
	check( trigger, 'demo1 has a changelevel trigger' );
	const raw = ( ent, name ) => { const field = GetEdictFieldValue( ent, name ); return field ? PR_GetString( field.accessor.getInt32( field.ofs ) ) : ''; };
	const map = raw( trigger, 'map' ), spot = raw( trigger, 'target' );
	same( map, 'demo2', 'the demo1 trigger names demo2' );
	same( spot, 'demo1', 'the demo2 start spot is demo1' );
	const snapshot = Hexen2_CaptureWorld( sv ), saved = Hexen2_BuildSaveBundle( { gameId: 'hexen2', classId: 'paladin', skill: 1, level: 'maps/demo1.bsp', player: first.player, time: sv.time } );
	firstState.changelevel_issued = false;
	G_INT_SET( OFS_PARM0, PR_SetTempString( map ) );
	G_INT_SET( OFS_PARM1, PR_SetTempString( spot ) );
	check( Hexen2_CallBuiltin( 70, {} ), 'changelevel is implemented' );
	same( firstState.changelevel_issued, true, 'the native one-shot transition is issued' );

	const secondState = { maxclients: 1, clients: [ client ], active: true, changelevel_issued: false };
	const second = mount( 'maps/demo2.bsp', spot, secondState );
	check( second.ok, second.reason );
	same( sv.name, 'maps/demo2.bsp', 'demo2 mounted' );
	check( Math.abs( second.player.v.origin[ 0 ] - 3672 ) < 2 && Math.abs( second.player.v.origin[ 1 ] + 2176 ) < 2, 'the demo1 start spot placed the player' );
	const carried = Hexen2_ApplySaveBundle( saved, second.player, { vectors: false } );
	check( carried.ok, carried.reason );
	same( second.player.v.health, 77, 'player fields carried into demo2' );

	// demo2 -> village1 -> village2: a second and third hop through the same trigger/changelevel/start-spot path.
	const nextTrigger = to => {
		const found = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'trigger_changelevel' && raw( ent, 'map' ) === to );
		return found ? { map: raw( found, 'map' ), spot: raw( found, 'target' ) } : null;
	};
	const hop = ( from, to, state, expected ) => {
		const target = nextTrigger( to );
		check( target && target.map === to, from + ' has a trigger to ' + to + ': ' + JSON.stringify( target ) );
		state.changelevel_issued = false;
		G_INT_SET( OFS_PARM0, PR_SetTempString( target.map ) );
		G_INT_SET( OFS_PARM1, PR_SetTempString( target.spot ) );
		check( Hexen2_CallBuiltin( 70, {} ), 'changelevel is implemented' );
		const mounted = mount( 'maps/' + to + '.bsp', target.spot, state );
		check( mounted.ok, mounted.reason );
		same( sv.name, 'maps/' + to + '.bsp', to + ' mounted' );
		check( Hexen2_ApplySaveBundle( saved, mounted.player, { vectors: false } ).ok, 'player fields carry to ' + to );
		same( mounted.player.v.health, 77, 'health carries to ' + to );
		check( mounted.player.v.origin[ 0 ] !== 0 || mounted.player.v.origin[ 1 ] !== 0, 'start spot placed the player in ' + to );
	};
	const villageState = { maxclients: 1, clients: [ client ], active: true, changelevel_issued: false };
	hop( 'demo2', 'village1', villageState, [ 0, 0, 0 ] );
	const village2State = { maxclients: 1, clients: [ client ], active: true, changelevel_issued: false };
	hop( 'village1', 'village2', village2State, [ 0, 0, 0 ] );

	const thirdState = { maxclients: 1, clients: [ client ], active: true, changelevel_issued: false };
	const back = mount( 'maps/demo1.bsp', undefined, thirdState );
	check( back.ok, back.reason );
	const restored = Hexen2_RestoreWorld( sv, snapshot );
	check( restored.ok, restored.reason );
	check( Hexen2_ApplySaveBundle( saved, back.player ).ok, 'the hub player reapplies' );
	same( back.player.v.health, 77, 'the demo1 player state was restored' );
	same( sv.name, 'maps/demo1.bsp', 'returned to demo1' );

} );
