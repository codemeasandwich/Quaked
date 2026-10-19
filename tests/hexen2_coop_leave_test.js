// Leaving and rejoining one co-op client: the gamecode ClientDisconnect runs, the player edict is freed, the other
// player keeps playing, and a rejoin allocates a fresh edict and places the same class again. Network signalling and
// the packaged UI are separate.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetPlayer, SV_SetFrametime, SV_Physics_Client } from '../src/engine/server/sv_phys.js';
import { sv as serverSv, SIGNON_SIZE, MOVETYPE_WALK, SOLID_SLIDEBOX } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { Hexen2_DropPlayer, Hexen2_RejoinPlayer } from '../src/engine/progs/hexen2_client_leave.js';
import { SV_ClientThink, SV_User_SetCommand, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'a co-op client leaves and rejoins without disturbing the other', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const clientA = { name: 'a', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ], forwardmove: 0, sidemove: 0, upmove: 0 } };
	const clientB = { name: 'b', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ], forwardmove: 0, sidemove: 0, upmove: 0 } };
	clientA.message = sv.signon; clientB.message = sv.signon;
	const svs = { maxclients: 2, clients: [ clientA, clientB ], active: true };
	const entry = { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true };
	const mounted = Hexen2_MountLevel( {
		entry, classId: 'paladin', client: clientA, sv, svs,
		readFile: name => existsSync( HEXEN + '/' + name ) ? new Uint8Array( readFileSync( HEXEN + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );
	const playerA = mounted.player, playerB = sv.edicts[ 2 ];
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	clientB.edict = playerB;
	const placedB = Hexen2_SpawnPlayer( { sv, client: clientB, player: playerB, gameId: 'hexen2', classId: 'crusader',
		origin: [ start.v.origin[ 0 ] + 32, start.v.origin[ 1 ], start.v.origin[ 2 ] ] } );
	check( placedB.ok, placedB.reason );
	const bIndex = playerB.index;
	const aHealth = playerA.v.health;

	// B leaves
	const left = Hexen2_DropPlayer( sv, clientB, playerB );
	check( left.ok, left.reason );
	same( left.freed, bIndex, 'the dropped player edict' );
	check( sv.edicts[ bIndex ].free, 'the dropped edict is free' );
	same( clientB.active, false, 'the client is inactive' );
	same( clientB.spawned, false, 'the client is not spawned' );

	// A still walks while B is gone
	sv.active = true; SV_SetFrametime( 0.1 );
	SV_User_SetCallbacks( { host_client: clientA, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	SV_SetPlayer( playerA );
	playerA.v.angles = [ 0, 0, 0 ]; playerA.v.v_angle = [ 0, 0, 0 ]; playerA.v.velocity = [ 0, 0, 0 ];
	playerA.v.movetype = MOVETYPE_WALK; playerA.v.solid = SOLID_SLIDEBOX;
	SV_User_SetCommand( { forwardmove: 320, viewangles: [ 0, 0, 0 ] } );
	const beforeA = playerA.v.origin[ 0 ];
	let error = null;
	try { SV_ClientThink(); SV_Physics_Client( playerA, 1 ); } catch ( e ) { error = e; }
	check( error === null, 'A moved after B left: ' + ( error ? error.message : '' ) );
	check( playerA.v.origin[ 0 ] - beforeA > 20, 'A kept its movement: ' + ( playerA.v.origin[ 0 ] - beforeA ) );
	same( playerA.v.health, aHealth, 'A was not hurt by B leaving' );

	// B rejoins with a fresh edict and the same class
	const rejoined = Hexen2_RejoinPlayer( sv, clientB, { classId: 'crusader', origin: start.v.origin } );
	check( rejoined.ok, rejoined.reason );
	const newB = rejoined.player;
	check( ! newB.free, 'the rejoined player is live' );
	same( PR_GetString( newB.v.classname ), 'player', 'the rejoined player entity' );
	same( newB.v.playerclass, 2, 'the rejoined class' );
	same( PR_GetString( newB.v.model ), 'models/crusader.mdl', 'the rejoined model' );
	check( newB.v.health >= 65 && newB.v.health <= 95, 'the rejoined native health: ' + newB.v.health );
	check( Math.abs( newB.v.origin[ 2 ] ) < 1, 'the rejoined feet are on the floor' );
	check( newB.index !== playerA.index, 'rejoin uses a different player edict from A' );

} );
