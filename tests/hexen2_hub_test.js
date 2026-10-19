// Whole-hub world snapshots: the existing Quake save text (globals + every edict) captures a live Hexen level and
// restores player/world state into a freshly mounted server. This is the shared ED serialization, not a second world
// format.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { SV_SetFrametime, SV_Physics } from '../src/engine/server/sv_phys.js';
import { PR_GetString, pr_global_struct } from '../src/engine/progs/progs.js';
import { GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_CaptureWorld, Hexen2_RestoreWorld, Hexen2_ValidateWorld } from '../src/engine/common/hexen2_hub.js';
import { Hexen2_SoundOrigin } from '../src/engine/client/hexen2_native_ui.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'a captured world restores its entities and player state', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const client = { name: 'hub', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	const mounted = Hexen2_MountLevel( {
		entry: { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true },
		classId: 'necromancer', skill: 2, client, sv, svs: { maxclients: 1, clients: [ client ], active: true },
		readFile: name => existsSync( HEXEN + '/' + name ) ? new Uint8Array( readFileSync( HEXEN + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );
	sv.active = true; SV_SetFrametime( 0.1 ); for ( let i = 0; i < 3; i ++ ) { SV_Physics(); pr_global_struct.time = sv.time; }
	mounted.player.v.health = 42;
	const door = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'door' );
	check( door !== undefined, 'the level has a door' );
	const doorModel = sv.models?.[ Number( PR_GetString( door.v.model ).replace( '*', '' ) ) ];
	if ( doorModel ) { const origin = Hexen2_SoundOrigin( [ 0, 0, 0 ], { mins: doorModel.mins, maxs: doorModel.maxs } ); check( origin[ 0 ] !== 0 || origin[ 1 ] !== 0 || origin[ 2 ] !== 0, 'the door sound uses the model bounds centre' ); }
	const stateField = GetEdictFieldValue( door, 'state' );
	check( stateField !== null, 'the door state field exists' );
	stateField.accessor.setFloat( stateField.ofs, 7 );
	door.v.health = 333;
	const snapshot = Hexen2_CaptureWorld( sv ), count = sv.num_edicts, playerHealth = mounted.player.v.health;
	const validation = Hexen2_ValidateWorld( snapshot ); check( validation.ok, 'the snapshot validates: ' + validation.reason );
	check( snapshot.lines.length > 2 && snapshot.lightstyles.length > 0, 'globals and light styles were captured' );

	mounted.player.v.health = 1; stateField.accessor.setFloat( stateField.ofs, 0 );
	const restored = Hexen2_RestoreWorld( sv, snapshot );
	check( restored.ok, restored.reason );
	same( sv.num_edicts, count, 'the edict count is restored' );
	same( mounted.player.v.health, playerHealth, 'the player health is restored' );
	same( stateField.accessor.getFloat( stateField.ofs ), 7, 'the door state is restored' );
	same( PR_GetString( mounted.player.v.classname ), 'player', 'the player edict stays the player' );

} );
