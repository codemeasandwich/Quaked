// Base-game endgame content: the final Eidolon map mounts with its boss and player start through the same mount path,
// so the campaign has a loadable finale target. This is content coverage, not a finished credits/intermission run.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the base endgame Eidolon map mounts with its player and level entities', () => {

	if ( ! existsSync( BASE + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( BASE + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'base-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const client = { name: 'eidolon', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	const mounted = Hexen2_MountLevel( {
		entry: { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true },
		classId: 'paladin', skill: 1, level: 'maps/eidolon.bsp', client, sv, svs: { maxclients: 1, clients: [ client ], active: true },
		readFile: name => existsSync( BASE + '/' + name ) ? new Uint8Array( readFileSync( BASE + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );
	same( sv.name, 'maps/eidolon.bsp', 'the endgame map is Eidolon' );
	check( sv.num_edicts > 200, 'Eidolon spawned its entities: ' + sv.num_edicts );
	const classOf = ent => { const field = GetEdictFieldValue( ent, 'classname' ); return field ? PR_GetString( field.accessor.getInt32( field.ofs ) ) : ''; };
	const classes = sv.edicts.filter( ent => ent && ! ent.free ).map( classOf );
	check( classes.includes( 'worldspawn' ) && classes.includes( 'player' ), 'the endgame player and world spawned' );
	check( classes.length > 150, 'the endgame level entities spawned: ' + classes.length );


} );
