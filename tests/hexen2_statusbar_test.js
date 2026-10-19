// G1 drawn HUD: the native status-bar top row is emitted with the pinned Raven sbar.c geometry and values for the
// spawned Paladin: centred 320-wide bar, mana fills, health number, health chain position and armour class. The list
// is executed with recording draw spies here; the port's canvas layer draws the same operations.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetState } from '../src/engine/server/sv_phys.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, PR_SetTempString, pr_global_struct, svs } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities, Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { Hexen2_ReadHud } from '../src/engine/client/hexen2_hud.js';
import { Hexen2_StatusBarOps, Hexen2_CalcAC } from '../src/engine/client/hexen2_statusbar.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the native status-bar top row is emitted for the spawned Paladin', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const progsBytes = readFileSync( HEXEN + '/progs.dat' );
	PR_LoadProgs( progsBytes.buffer.slice( progsBytes.byteOffset, progsBytes.byteOffset + progsBytes.byteLength ) );
	Mod_SetHexenHullLayout( true );
	const map = new model_t(); map.name = 'maps/demo1.bsp'; set_loadmodel( map );
	const bsp = pak.COM_FindFile( 'maps/demo1.bsp' ).data;
	Mod_LoadBrushModel( map, bsp.buffer.slice( bsp.byteOffset, bsp.byteOffset + bsp.byteLength ) );
	Mod_SetHexenHullLayout( false );
	const sv = serverSv;
	PR_SetSV( sv ); PR_SetSVS( { maxclients: 1, clients: [], active: true } );
	sv.time = 0.1; sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE; sv.worldmodel = map;
	Hexen2_SeedPrecache( sv, map, name => Mod_FindName( name ) );
	sv.state = ss_loading;
	SV_SetState( sv, svs, pr_global_struct );
	SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	Hexen2_SpawnEntities( sv, map, 392, PR_AllocEdicts );
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	const player = sv.edicts[ 1 ];
	const client = { name: 'sbar', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	svs.clients[ 0 ] = client;
	check( Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId: 'paladin', origin: start.v.origin } ).ok, 'the Paladin spawned' );

	player.v.bluemana = 42; player.v.greenmana = 7;
	const hud = Hexen2_ReadHud( player );
	const ops = Hexen2_StatusBarOps( hud, { width: 320, height: 200 } );
	const find = ( name ) => ops.find( op => op.name === name );
	same( find( 'gfx/topbar1.lmp' ).x, 0, 'topbar1 x' );
	same( find( 'gfx/topbar1.lmp' ).y, 154, 'topbar1 sits 46 pixels above the bottom' );
	same( find( 'gfx/topbar2.lmp' ).x, 160, 'topbar2 x' );
	// mana fill: native 26 - round(mana*18/max_mana); cover fixed at y 27
	const fillY = 26 - Math.round( 42 * 18 / hud.maxMana );
	same( find( 'gfx/bmana.lmp' ).y, 154 + fillY, 'blue mana fill height' );
	same( find( 'gfx/bmanacov.lmp' ).y, 154 + 27, 'blue mana cover' );
	same( find( 'gfx/gmana.lmp' ).y, 154 + 26 - Math.round( 7 * 18 / hud.maxMana ), 'green mana fill height' );
	const hp = ops.find( op => op.kind === 'num' && op.digits === 3 );
	same( hp.value, hud.health, 'the HP number is the native health' );
	same( hp.x, 58, 'HP number x' );
	same( hp.y, 154 + 14, 'HP number y' );
	const chainX = 45 + Math.floor( Math.min( hud.health, hud.maxHealth ) * 195 / hud.maxHealth );
	same( find( 'gfx/hpgem.lmp' ).x, chainX, 'the health gem follows the chain position' );
	same( find( 'gfx/chnlcov.lmp' ).x, 43, 'left chain cover' );
	same( find( 'gfx/chnrcov.lmp' ).x, 267, 'right chain cover' );
	same( find( 'gfx/chnrcov.lmp' ).y, 154 + 36, 'right chain cover y' );

	// armour class: native per-class tables plus one per 5 points; the bar shows it as a two-digit number
	same( Hexen2_CalcAC( hud ), 0, 'no armour at spawn' );
	player.v.armor_amulet = 5; player.v.armor_helmet = 3;
	const armed = Hexen2_ReadHud( player );
	same( Hexen2_CalcAC( armed ), ( 8 + 1 ) + ( 4 + 0 ), 'Paladin amulet+helmet AC' );
	const armedOps = Hexen2_StatusBarOps( armed, { width: 640, height: 480 } );
	const ac = armedOps.find( op => op.kind === 'num' && op.digits === 2 );
	same( ac.value, 13, 'the AC number' );
	same( armedOps.find( op => op.name === 'gfx/topbar1.lmp' ).x, 160, 'the 320-wide bar is centred' );
	same( armedOps.find( op => op.name === 'gfx/topbar1.lmp' ).y, 480 - 46, 'bottom anchored' );

	// the expanded lower bar (+showinfo): native BarHeight 144, bottom bar art, class stats, portrait, armour, rings,
	// puzzle pieces. Coordinates are relative to the bar top, as sbar.c draws them.
	player.v.armor_breastplate = 12; player.v.ring_flight = 50;
	player.v.puzzle_inv1 = PR_SetTempString( 'key1' );
	const expandedHud = Hexen2_ReadHud( player, ofs => PR_GetString( ofs ) );
	const lowered = Hexen2_StatusBarOps( expandedHud, { width: 320, height: 200, barHeight: 144 } );
	const at = ( name ) => lowered.find( op => op.name === name );
	same( at( 'gfx/btmbar1.lmp' ).y, 56 + 46, 'bottom bar art sits below the top row' );
	same( at( 'gfx/btmbar1.lmp' ).x, 0, 'bottom bar art x' );
	same( at( 'gfx/btmbar2.lmp' ).x, 160, 'bottom bar right half' );
	same( at( 'gfx/cport1.lmp' ).x, 134, 'the Paladin portrait x' );
	same( at( 'gfx/cport1.lmp' ).y, 56 + 50, 'the Paladin portrait y' );
	check( lowered.some( op => op.kind === 'small' && op.text === 'Paladin' ), 'the class name is drawn' );
	check( lowered.some( op => op.kind === 'small' && op.text === 'int' && op.x === 11 && op.y === 56 + 58 ), 'the intelligence label' );
	check( lowered.some( op => op.kind === 'small' && op.text === String( expandedHud.intelligence | 0 ).padStart( 2, '0' ) && op.x === 33 ), 'the intelligence value' );
	same( at( 'gfx/armor3.lmp' ).x, 246, 'breastplate armour icon' );
	same( at( 'gfx/armor3.lmp' ).y, 56 + 115, 'breastplate armour icon y' );
	check( lowered.some( op => op.kind === 'small' && op.text === '+12' && op.x === 250 ), 'the breastplate bonus' );
	same( at( 'gfx/ring_f.lmp' ).x, 6, 'the flight ring icon' );
	same( at( 'gfx/ring_f.lmp' ).y, 56 + 119, 'the flight ring icon y' );
	same( at( 'gfx/ringhlth.lmp' ).x, 6 + 29 - Math.round( 26 * 50 / 100 ), 'the ring health bar' );
	same( at( 'gfx/rhlthcvr.lmp' ).x, 6 + 29, 'the ring health cover' );
	same( at( 'gfx/puzzle/key1.lmp' ).x, 194, 'the first puzzle piece' );
	same( at( 'gfx/puzzle/key1.lmp' ).y, 56 + 51, 'the first puzzle piece y' );

} );
