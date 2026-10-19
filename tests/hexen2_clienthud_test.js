// The native HUD from synced client state: class via svc_updateclass, weapon/view fields via svc_clientdata, and the
// SC1/SC2 stats/armour/rings/puzzle strings via svc_update_inv must produce the same HUD model — and status-bar layout —
// as reading the server edict directly.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { PR_GetString, PR_SetTempString } from '../src/engine/progs/progs.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_ClientState, Hexen2_ApplyClientMessage } from '../src/engine/client/hexen2_clientstate.js';
import { Hexen2_HudFromClientState } from '../src/engine/client/hexen2_clienthud.js';
import { Hexen2_ReadHud } from '../src/engine/client/hexen2_hud.js';
import { Hexen2_StatusBarOps } from '../src/engine/client/hexen2_statusbar.js';
import { Hexen2_WriteUpdateClass } from '../src/engine/common/hexen2_signon.js';
import { Hexen2_EncodeClientdata, Hexen2_EncodeUpdateInv, Hexen2_SC2 } from '../src/engine/common/hexen2_clientdata.js';
import { HEXEN2_SERVER_MESSAGES } from '../src/engine/common/hexen2_protocol.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the HUD built from synced client state matches the server HUD', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const client = { name: 'clienthud', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
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
	player.v.health = 73; player.v.bluemana = 42; player.v.greenmana = 7; player.v.armor_amulet = 5; player.v.armor_helmet = 3;
	player.v.level = 2; player.v.experience = 1234; player.v.ring_flight = 50; player.v.weaponframe = 4;
	player.v.puzzle_inv1 = PR_SetTempString( 'key1' );

	const state = Hexen2_ClientState();
	const klass = Hexen2_WriteUpdateClass( { client: 0, playerClass: 1 } );
	check( klass.ok, klass.reason );
	check( Hexen2_ApplyClientMessage( state, klass.bytes ).ok, 'updateclass' );
	check( Hexen2_ApplyClientMessage( state, Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.clientdata, ...Hexen2_EncodeClientdata( player ) ] ) ).ok, 'clientdata' );
	const mask = ( 1n << 0n ) | ( 1n << 1n ) | ( 1n << 2n ) | ( 1n << 3n ) | ( 1n << 4n ) | ( 1n << 5n ) |
		( 1n << 7n ) | ( 1n << 8n ) | ( 1n << 9n ) | ( 1n << 31n ) |
		Hexen2_SC2( 1 ) | Hexen2_SC2( 4 ) | Hexen2_SC2( 5 ) | Hexen2_SC2( 11 ) | Hexen2_SC2( 19 ) | Hexen2_SC2( 20 ) | Hexen2_SC2( 21 );
	const stats = Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.update_inv, ...Hexen2_EncodeUpdateInv( player, mask, PR_GetString ) ] );
	check( Hexen2_ApplyClientMessage( state, stats ).ok, 'update_inv' );

	const serverHud = Hexen2_ReadHud( player, ofs => PR_GetString( ofs ) );
	const clientHud = Hexen2_HudFromClientState( state );
	for ( const field of [ 'playerClass', 'health', 'maxHealth', 'manaBlue', 'manaGreen', 'maxMana', 'level', 'experience',
		'intelligence', 'wisdom', 'dexterity', 'strength', 'dead', 'onGround', 'weaponFrame' ] )
		same( clientHud[ field ], serverHud[ field ], 'HUD field ' + field );
	for ( const field of [ 'armor_amulet', 'armor_bracer', 'armor_breastplate', 'armor_helmet' ] )
		same( clientHud.armour[ field ], serverHud.armour[ field ], 'armour ' + field );
	same( clientHud.rings.ring_flight, serverHud.rings.ring_flight, 'the flight ring timer' );
	same( clientHud.puzzle[ 0 ], 'key1', 'the puzzle key from the stat string' );
	same( clientHud.puzzle[ 0 ], serverHud.puzzle[ 0 ], 'the puzzle key matches the server HUD' );
	same( clientHud.viewHeight, player.v.view_ofs[ 2 ], 'the synced view height' );

	// the same native layout works from the client HUD
	const clientOps = Hexen2_StatusBarOps( clientHud );
	const serverOps = Hexen2_StatusBarOps( serverHud );
	same( clientOps.length, serverOps.length, 'the status bar has the same operation count' );
	same( clientOps[ 0 ].name, 'gfx/topbumpl.lmp', 'the native upper-left bump leads' );
	check( clientOps.some( op => op.name === 'gfx/topbar1.lmp' ), 'the top bar follows the bumps' );
	const clientHp = clientOps.find( op => op.kind === 'num' && op.digits === 3 );
	const serverHp = serverOps.find( op => op.kind === 'num' && op.digits === 3 );
	same( clientHp.value, serverHp.value, 'the HP number' );
	same( Hexen2_StatusBarOps( clientHud, { width: 640, height: 480 } ).find( op => op.name === 'gfx/topbar1.lmp' ).x, 160, 'the layout stays centred' );

	check( Hexen2_WriteUpdateClass( { client: 0, playerClass: 0 } ).ok === false, 'class 0 refused' );
	check( Hexen2_WriteUpdateClass( { client: 0, playerClass: 6 } ).ok === false, 'class 6 refused' );

} );
