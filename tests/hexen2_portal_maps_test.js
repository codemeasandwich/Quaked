// Portal content coverage: every supplied Portal map mounts with the Succubus and level entities. This complements the
// Keep/Tibet route tests; it does not claim the finale/credits sequence.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( !v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2/data1', PORTAL = '/Users/bri/quaked/Hexen 2/portals';
const MAPS = [ 'keep1', 'keep2', 'keep3', 'keep4', 'keep5', 'tibet1', 'tibet2', 'tibet3', 'tibet4', 'tibet5',
	'tibet6', 'tibet7', 'tibet8', 'tibet9', 'tibet10', 'thomas', 'monsters' ];

Deno.test( 'every supplied Portal map mounts with the Succubus', () => {

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
	const client = { name: 'maps', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	for ( const map of MAPS ) {

		const mounted = Hexen2_MountLevel( {
			entry: { id: 'hexen2-portals', kind: 'hexen2-portals', folder: 'games/Hexen 2/portals', playable: true },
			classId: 'succubus', skill: 1, level: 'maps/' + map + '.bsp', client, sv, svs: { maxclients: 1, clients: [ client ], active: true },
			readFile: name => name === 'progs.dat' ? new Uint8Array( readFileSync( PORTAL + '/progs.dat' ) ) : existsSync( BASE + '/' + name ) ? new Uint8Array( readFileSync( BASE + '/' + name ) ) : null,
			loadMap: name => { const model = new model_t(); model.name = name; set_loadmodel( model ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( model, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return model; },
			installCallbacks: callbacks => installServerCallbacks( callbacks )
		} );
		check( mounted.ok, map + ': ' + mounted.reason );
		same( mounted.player.v.playerclass, 5, map + ' keeps the Succubus' );
		check( sv.num_edicts > 10, map + ' spawned entities: ' + sv.num_edicts );

	}

} );
