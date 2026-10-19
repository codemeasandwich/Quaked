// Portal of Praevus campaign route: Tibet maps through their real trigger maps/start spots with the Succubus. This is the
// campaign-content path beyond Keep, not a claim of the finale/intermission.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_SetTempString, G_INT_SET, PR_GetString } from '../src/engine/progs/progs.js';
import { GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { OFS_PARM0, OFS_PARM1 } from '../src/engine/progs/pr_comp.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2/data1', PORTAL = '/Users/bri/quaked/Hexen 2/portals';

Deno.test( 'Portal Tibet campaign mounts its chain with the Succubus', () => {

	if ( ! existsSync( PORTAL + '/pak3.pak' ) || ! existsSync( PORTAL + '/progs.dat' ) || ! existsSync( BASE + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Portal/base installation is not present' ); return; }
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
	const client = { name: 'tibet', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	const state = { maxclients: 1, clients: [ client ], active: true, changelevel_issued: false };
	const mount = level => Hexen2_MountLevel( {
		entry: { id: 'hexen2-portals', kind: 'hexen2-portals', folder: 'games/Hexen 2/portals', playable: true },
		classId: 'succubus', skill: 1, level, client, sv, svs: state,
		readFile: name => name === 'progs.dat' ? new Uint8Array( readFileSync( PORTAL + '/progs.dat' ) ) : existsSync( BASE + '/' + name ) ? new Uint8Array( readFileSync( BASE + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	const raw = ( ent, name ) => { const field = GetEdictFieldValue( ent, name ); return field ? PR_GetString( field.accessor.getInt32( field.ofs ) ) : ''; };
	const first = mount( 'maps/tibet1.bsp' );
	check( first.ok, first.reason );
	for ( const target of [ 'tibet3', 'tibet4', 'tibet5', 'tibet8', 'tibet9', 'tibet10' ] ) {

		const trigger = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'trigger_changelevel' && raw( ent, 'map' ) === target );
		check( trigger, 'the current Tibet map has a trigger to ' + target );
		state.changelevel_issued = false;
		G_INT_SET( OFS_PARM0, PR_SetTempString( target ) );
		G_INT_SET( OFS_PARM1, PR_SetTempString( raw( trigger, 'target' ) ) );
		check( Hexen2_CallBuiltin( 70, {} ), 'changelevel is implemented' );
		const next = mount( 'maps/' + target + '.bsp' );
		check( next.ok, next.reason );
		same( sv.name, 'maps/' + target + '.bsp', target + ' mounted' );
		same( next.player.v.playerclass, 5, 'the Succubus survives into ' + target );
		check( sv.num_edicts > 10, target + ' spawned entities' );

	}


} );
