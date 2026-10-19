// The gamecode ending hand-off: with the raw nextmap/nextstartspot globals set (the values rider_eol writes), calling
// GotoNextMap records the normal changelevel transition. This is the finale's map hand-off, not the boss death itself.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_SetTempString, PR_GetString, pr_global_struct, pr_globals, pr_functions, EDICT_TO_PROG } from '../src/engine/progs/progs.js';
import { ED_FindFunction, ED_FindGlobal } from '../src/engine/progs/pr_edict.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( !v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2/data1', PORTAL = '/Users/bri/quaked/Hexen 2/portals';

Deno.test( 'GotoNextMap records the ending hand-off', () => {

	if ( !existsSync( PORTAL + '/pak3.pak' ) || !existsSync( PORTAL + '/progs.dat' ) || !existsSync( BASE + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Portal/base installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( BASE + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'base-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const loose = [ 'progs.dat', 'strings.txt', 'hexen.rc' ].map( name => ( { name, data: new Uint8Array( readFileSync( PORTAL + '/' + name ) ) } ) );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'portal-loose', pak.COM_BuildPack( loose ) ) );
	const rawPortal = readFileSync( PORTAL + '/pak3.pak' );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'portal-pak3', rawPortal.buffer.slice( rawPortal.byteOffset, rawPortal.byteOffset + rawPortal.length ) ) );
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const client = { name: 'finale', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	const state = { maxclients: 1, clients: [ client ], active: true, changelevel_issued: false };
	const mounted = Hexen2_MountLevel( {
		entry: { id: 'hexen2-portals', kind: 'hexen2-portals', folder: 'games/Hexen 2/portals', playable: true },
		classId: 'succubus', skill: 1, level: 'maps/keep1.bsp', client, sv, svs: state,
		readFile: name => name === 'progs.dat' ? new Uint8Array( readFileSync( PORTAL + '/progs.dat' ) ) : existsSync( BASE + '/' + name ) ? new Uint8Array( readFileSync( BASE + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );
	const nextMap = ED_FindGlobal( 'nextmap' ), nextSpot = ED_FindGlobal( 'nextstartspot' );
	check( nextMap && nextSpot, 'the ending globals exist' );
	pr_globals.setInt32( nextMap.ofs, PR_SetTempString( 'tibet10' ) );
	pr_globals.setInt32( nextSpot.ofs, PR_SetTempString( 'keep1' ) );
	state.changelevel_issued = false;
	const goto = ED_FindFunction( 'GotoNextMap' ); check( goto, 'GotoNextMap exists' );
	pr_global_struct.self = EDICT_TO_PROG( sv.edicts[ 1 ] );
	PR_ExecuteProgram( pr_functions.indexOf( goto ) );
	same( sv.nextmap?.level, 'maps/tibet10.bsp', 'the hand-off map' );
	same( sv.nextmap?.spot, 'keep1', 'the hand-off start spot' );

} );
