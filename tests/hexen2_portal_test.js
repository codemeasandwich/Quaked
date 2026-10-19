// Portal of Praevus selection and mount: the Succubus is Portal-only (native class 5); the Portal program, its RAPO
// models, loose files, pak3 and the base installation's packs mount through the same Hexen path, and Keep spawns its
// entities. The RAPO alias loader is the shared alias loader with Raven's version-50 header/triangle layout.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_SelectClass, Hexen2_ClassesFor } from '../src/engine/common/hexen2_profile.js';
import { PR_SetTempString, G_INT_SET, PR_GetString } from '../src/engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1 } from '../src/engine/progs/pr_comp.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import { GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2/data1', PORTAL = '/Users/bri/quaked/Hexen 2/portals';

Deno.test( 'Portal offers the Succubus and mounts Keep with RAPO models', () => {

	same( Hexen2_ClassesFor( 'hexen2' ).length, 4, 'base classes' );
	same( Hexen2_ClassesFor( 'hexen2-demo' ).length, 4, 'demo classes' );
	check( Hexen2_ClassesFor( 'hexen2-portals' ).some( entry => entry.id === 'succubus' ), 'Portal offers the Succubus' );
	same( Hexen2_SelectClass( 'hexen2-portals', 'succubus' ).number, 5, 'the native Succubus number' );
	same( Hexen2_SelectClass( 'hexen2', 'succubus' ).ok, false, 'the base game refuses the Succubus' );
	same( Hexen2_SelectClass( 'hexen2-demo', 'succubus' ).ok, false, 'the demo refuses the Succubus' );

	if ( ! existsSync( PORTAL + '/pak3.pak' ) || ! existsSync( PORTAL + '/progs.dat' ) || ! existsSync( BASE + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Portal/base installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( BASE + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'base-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const loose = [ 'progs.dat', 'strings.txt', 'hexen.rc' ].map( name => ( { name, data: new Uint8Array( readFileSync( PORTAL + '/' + name ) ) } ) );
	const loosePack = pak.COM_LoadPackFile( 'portal-loose', pak.COM_BuildPack( loose ) );
	check( loosePack, 'the Portal loose files build a pack' );
	pak.COM_AddPack( loosePack );
	const rawPortal = readFileSync( PORTAL + '/pak3.pak' );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'portal-pak3', rawPortal.buffer.slice( rawPortal.byteOffset, rawPortal.byteOffset + rawPortal.length ) ) );
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const client = { name: 'portal', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	const state = { maxclients: 1, clients: [ client ], active: true, changelevel_issued: false };
	const mount = level => Hexen2_MountLevel( {
		entry: { id: 'hexen2-portals', kind: 'hexen2-portals', folder: 'games/Hexen 2/portals', playable: true },
		classId: 'succubus', skill: 1, level, client, sv, svs: state,
		readFile: name => name === 'progs.dat' ? new Uint8Array( readFileSync( PORTAL + '/progs.dat' ) ) : existsSync( BASE + '/' + name ) ? new Uint8Array( readFileSync( BASE + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	const mounted = mount( 'maps/keep1.bsp' );
	check( mounted.ok, mounted.reason );
	same( mounted.plan.classId, 'succubus', 'the plan keeps the Succubus' );
	same( mounted.player.v.playerclass, 5, 'the native playerclass is the Succubus' );
	check( sv.num_edicts > 200, 'Keep spawned its entities: ' + sv.num_edicts );
	same( sv.name, 'maps/keep1.bsp', 'the mounted map is Keep' );

	const raw = ( ent, name ) => { const field = GetEdictFieldValue( ent, name ); return field ? Number( field.accessor.getInt32( field.ofs ) ) : 0; };
	for ( const target of [ 'keep2', 'keep3', 'keep4', 'keep5' ] ) {

		const trigger = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'trigger_changelevel' && PR_GetString( raw( ent, 'map' ) ) === target );
		check( trigger, 'the current Portal map has a trigger to ' + target );
		state.changelevel_issued = false;
		G_INT_SET( OFS_PARM0, PR_SetTempString( target ) );
		G_INT_SET( OFS_PARM1, PR_SetTempString( PR_GetString( raw( trigger, 'target' ) ) ) );
		check( Hexen2_CallBuiltin( 70, {} ), 'changelevel is implemented' );
		const next = mount( 'maps/' + target + '.bsp' );
		check( next.ok, next.reason );
		same( sv.name, 'maps/' + target + '.bsp', target + ' mounted' );
		same( next.player.v.playerclass, 5, 'the Succubus survives into ' + target );
		check( sv.num_edicts > 10, target + ' spawned entities' );

	}

} );
