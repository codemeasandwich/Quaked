// Hexen II start spots: a triggered changelevel passes a targetname (demo1's starts are `demo2`/`demo3`); the mounted
// session must set the native `startspot` and place the player at that start, not the first info_player_start.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, near = ( a, b, m ) => check( Math.abs( a - b ) <= 1, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'a changelevel start spot places the player at its targetname', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const client = { name: 'spot', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	const svs = { maxclients: 1, clients: [ client ], active: true };
	const mounted = Hexen2_MountLevel( {
		entry: { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true },
		classId: 'paladin', skill: 1, spot: 'demo2', client, sv, svs,
		readFile: name => existsSync( HEXEN + '/' + name ) ? new Uint8Array( readFileSync( HEXEN + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );
	near( mounted.player.v.origin[ 0 ], -1944, 'the demo2 start x' );
	near( mounted.player.v.origin[ 1 ], 2448, 'the demo2 start y' );
	check( mounted.player.v.origin[ 2 ] > -560 && mounted.player.v.origin[ 2 ] <= -512, 'the player dropped onto the demo2 floor: ' + mounted.player.v.origin[ 2 ] );

} );
