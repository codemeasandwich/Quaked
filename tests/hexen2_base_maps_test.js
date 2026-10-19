// Base-game content coverage: every supplied non-hub map mounts through the same gamecode/map loader with a player and
// level entities. This proves the campaign content is loadable; it does not claim every trigger/finale path.
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

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const BASE = '/Users/bri/quaked/Hexen 2/data1';
const MAPS = [ 'castle4', 'castle5', 'cath', 'egypt1', 'egypt2', 'egypt3', 'egypt4', 'egypt5', 'egypt6', 'egypt7',
	'eidolon', 'meso1', 'meso2', 'meso3', 'meso4', 'meso5', 'meso6', 'meso8', 'meso9', 'ravdm2', 'ravdm3', 'ravdm4',
	'ravdm5', 'rider1a', 'rider2c', 'romeric1', 'romeric2', 'romeric3', 'romeric4', 'romeric5', 'romeric6', 'romeric7',
	'tower', 'village1', 'village2', 'village3', 'village4', 'village5' ];

Deno.test( 'every supplied base map mounts with its player and level entities', () => {

	if ( ! existsSync( BASE + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( BASE + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'base-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const client = { name: 'maps', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	for ( const map of MAPS ) {

		const mounted = Hexen2_MountLevel( {
			entry: { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true },
			classId: 'paladin', skill: 1, level: 'maps/' + map + '.bsp', client, sv, svs: { maxclients: 1, clients: [ client ], active: true },
			readFile: name => existsSync( BASE + '/' + name ) ? new Uint8Array( readFileSync( BASE + '/' + name ) ) : null,
			loadMap: name => { const model = new model_t(); model.name = name; set_loadmodel( model ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( model, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return model; },
			installCallbacks: callbacks => installServerCallbacks( callbacks )
		} );
		check( mounted.ok, map + ': ' + mounted.reason );
		check( mounted.player && mounted.player.v, map + ' has a player' );
		check( sv.num_edicts > 20, map + ' spawned level entities: ' + sv.num_edicts );

	}

} );
