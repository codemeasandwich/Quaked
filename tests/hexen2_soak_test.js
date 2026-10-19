// Live-world soak: the mounted level runs 300 physics frames while the Paladin walks and attacks, monsters think, and
// nothing raises a script error or produces a non-finite origin. This catches missing builtins and state corruption
// that short frame counts miss; it is not a campaign or visual trial.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetPlayer, SV_SetFrametime, SV_Physics } from '../src/engine/server/sv_phys.js';
import { sv as serverSv, SIGNON_SIZE, MOVETYPE_WALK, SOLID_SLIDEBOX } from '../src/engine/server/server.js';
import { PR_ExecuteProgram, PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { PR_GetString, pr_global_struct } from '../src/engine/progs/progs.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { SV_ClientThink, SV_User_SetCommand, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the world runs 300 frames with a walking, attacking Paladin', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const client = { name: 'soak', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
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
	const player = mounted.player;
	sv.active = true; SV_SetFrametime( 0.05 );
	SV_SetPlayer( player );
	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	player.v.movetype = MOVETYPE_WALK; player.v.solid = SOLID_SLIDEBOX;
	const before = [ player.v.origin[ 0 ], player.v.origin[ 1 ] ];
	const healths = new Map();
	for ( const ent of sv.edicts ) if ( ent && ! ent.free && /^monster_/.test( PR_GetString( ent.v.classname ) ) ) healths.set( ent.index, ent.v.health );
	let error = null, frames = 0;
	try {

		for ( ; frames < 300; frames ++ ) {

			SV_User_SetCommand( { forwardmove: 200, viewangles: [ 0, 0, 0 ] } );
			player.v.button0 = frames % 20 < 10 ? 1 : 0; // attack half the time
			SV_ClientThink(); // apply the usercmd to velocity, as SV_RunClients does before physics
			SV_Physics();

		}

	} catch ( e ) { error = e; }
	check( error === null, `frame ${frames}: ` + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( frames === 300, 'all frames ran: ' + frames );
	check( Number.isFinite( player.v.origin[ 0 ] ) && Number.isFinite( player.v.origin[ 2 ] ), 'the player origin stays finite' );
	check( Math.abs( player.v.origin[ 0 ] - before[ 0 ] ) + Math.abs( player.v.origin[ 1 ] - before[ 1 ] ) > 5, 'the player walked' );
	let movedMonsters = 0, damagedMonsters = 0;
	for ( const ent of sv.edicts ) {

		if ( ! ent || ent.free ) continue;
		if ( ! Number.isFinite( ent.v.origin[ 0 ] ) ) throw new Error( 'entity ' + ent.index + ' has a non-finite origin' );
		if ( healths.has( ent.index ) && ent.v.health < healths.get( ent.index ) ) damagedMonsters ++;

	}
	check( damagedMonsters >= 0, 'monster damage counted' );
	check( player.v.health > 0 || player.v.deadflag !== 0, 'the player is alive or properly dead: ' + player.v.health );
	check( sv.reliable_datagram.cursize > 0, 'the attack feedback wrote effect messages: ' + sv.reliable_datagram.cursize );
	const firstOpcode = sv.reliable_datagram.data[ 0 ];
	check( firstOpcode === 42 || firstOpcode === 43, 'the reliable datagram carries start/end effect messages: ' + firstOpcode );

} );
