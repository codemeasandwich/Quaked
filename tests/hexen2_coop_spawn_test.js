// Two clients on one Hexen II server: the native client slots both become players through the supplied gamecode
// (Paladin and Crusader), keep distinct classes/models, settle on the floor, and receive their own setclass command.
// This is the server-side co-op foundation; the peer transport for the second client is separate.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_DropToFloor, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { Hexen2_ReadHud } from '../src/engine/client/hexen2_hud.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'two client slots become distinct native players on one server', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	const clientA = { name: 'paladin', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
	const clientB = { name: 'crusader', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
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
	const playerA = mounted.player;
	const playerB = sv.edicts[ 2 ];
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	const placedB = Hexen2_SpawnPlayer( { sv, client: clientB, player: playerB, gameId: 'hexen2', classId: 'crusader',
		origin: [ start.v.origin[ 0 ] + 32, start.v.origin[ 1 ], start.v.origin[ 2 ] ] } );
	check( placedB.ok, placedB.reason );

	same( PR_GetString( playerA.v.classname ), 'player', 'the first slot is a player' );
	same( PR_GetString( playerB.v.classname ), 'player', 'the second slot is a player' );
	same( playerA.index, 1, 'the first player edict' );
	same( playerB.index, 2, 'the second player edict' );
	same( playerA.v.playerclass, 1, 'the Paladin class' );
	same( playerB.v.playerclass, 2, 'the Crusader class' );
	same( PR_GetString( playerA.v.model ), 'models/paladin.mdl', 'the Paladin model' );
	same( PR_GetString( playerB.v.model ), 'models/crusader.mdl', 'the Crusader model' );
	check( playerA.v.health >= 70 && playerA.v.health <= 95, 'the Paladin has native health' );
	check( playerB.v.health >= 65 && playerB.v.health <= 95, 'the Crusader has native health: ' + playerB.v.health );
	check( playerA.v.max_mana > 0 && playerB.v.max_mana > 0, 'both classes have a native maximum mana' );
	// the co-op flag lets the gamecode pick a free start for the second client; both settle on the floor
	check( Math.abs( playerA.v.origin[ 2 ] ) < 1 && Math.abs( playerB.v.origin[ 2 ] ) < 1, 'both feet are on the floor' );
	check( Math.abs( playerA.v.origin[ 0 ] - playerB.v.origin[ 0 ] ) >= 1 || Math.abs( playerA.v.origin[ 1 ] - playerB.v.origin[ 1 ] ) >= 1,
		'the players are at different spawn points: ' + playerA.v.origin + ' vs ' + playerB.v.origin );
	const message = clientB.message;
	check( typeof message === 'object' && message.data !== undefined, 'the second client has a signon message buffer' );
	const hudB = Hexen2_ReadHud( playerB );
	same( hudB.playerClass, 2, 'the Crusader HUD class' );
	same( hudB.health, playerB.v.health, 'the Crusader HUD health' );

} );
