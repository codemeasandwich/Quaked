// Hexen II presentation data: the status-bar model and the first-person view read from the spawned Paladin's native
// fields. No WebGL: this pins the data the renderer/HUD will consume. plan section 7; G1 presentation prerequisite.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetState } from '../src/engine/server/sv_phys.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities, Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { Hexen2_ViewState, Hexen2_ViewAnglesWithPunch } from '../src/engine/client/hexen2_view.js';
import { Hexen2_ReadHud, Hexen2_ArmourTotal } from '../src/engine/client/hexen2_hud.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
// the selected catalogue game is the session's profile before any progs or map load
GameProfile_Set( 'hexen2' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the spawned Paladin yields native HUD data and a first-person view', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const progsBytes = readFileSync( HEXEN + '/progs.dat' );
	PR_LoadProgs( progsBytes.buffer.slice( progsBytes.byteOffset, progsBytes.byteOffset + progsBytes.byteLength ) );
	const map = new model_t(); map.name = 'maps/demo1.bsp'; set_loadmodel( map );
	const bsp = pak.COM_FindFile( 'maps/demo1.bsp' ).data;
	Mod_LoadBrushModel( map, bsp.buffer.slice( bsp.byteOffset, bsp.byteOffset + bsp.byteLength ) );

	const sv = serverSv;
	PR_SetSV( sv ); PR_SetSVS( { maxclients: 1, clients: [], active: true } );
	sv.time = 0.1; sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	sv.worldmodel = map;
	Hexen2_SeedPrecache( sv, map, name => Mod_FindName( name ) );
	sv.state = ss_loading;
	SV_SetState( sv, svs, pr_global_struct );
	SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	Hexen2_SpawnEntities( sv, map, 392, PR_AllocEdicts );
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	const player = sv.edicts[ 1 ];
	const client = { name: 'hud', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	svs.clients[ 0 ] = client;
	check( Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId: 'paladin', origin: start.v.origin } ).ok, 'the Paladin spawned' );

	// HUD: the gamecode's starting state, read through the Hexen field layout
	let hud = Hexen2_ReadHud( player );
	check( hud !== null, 'HUD data exists for a player' );
	same( hud.playerClass, 1, 'Paladin class' );
	same( hud.health, player.v.health, 'the HUD shows the native starting health' );
	same( hud.maxHealth, player.v.max_health, 'the HUD shows the native maximum health' );
	check( hud.health >= 70 && hud.health <= 95, 'native Paladin starting health: ' + hud.health );
	same( hud.dead, false, 'alive' );
	same( Hexen2_ArmourTotal( hud ), 0, 'no armour at spawn' );
	same( hud.manaBlue, 0, 'no mana at spawn' );
	check( hud.onGround, 'the player is grounded after settling' );
	// a changed health, armour and artifact field is reflected
	player.v.health = 73; player.v.armor_amulet = 5; player.v.artifacts = 1;
	hud = Hexen2_ReadHud( player );
	same( hud.health, 73, 'the HUD reads the live health' );
	same( Hexen2_ArmourTotal( hud ), 5, 'the armour total' );
	same( hud.artifactFlags, 1, 'the artifact flags' );
	// puzzle-key slots are string offsets, resolved through the program strings
	const offset = typeof player.v.puzzle_inv1 === 'number' ? player.v.puzzle_inv1 : 0;
	const withKeys = Hexen2_ReadHud( player, ofs => PR_GetString( ofs ) );
	check( Array.isArray( withKeys.puzzle ), 'the puzzle slots are an array' );
	check( withKeys.puzzle.length === 8, 'eight puzzle slots' );

	// view: eye origin = player origin + view_ofs, angles from v_angle, punch normalised
	check( player.v.view_ofs[ 2 ] > 20, 'the gamecode set the player eye height: ' + player.v.view_ofs[ 2 ] );
	player.v.view_ofs = [ 0, 0, 50 ];
	player.v.v_angle = [ 0, 0, 0 ]; player.v.angles = [ 0, 0, 0 ]; player.v.punchangle = [ 0, 0, 0 ];
	player.v.origin = [ 10, 20, 30 ];
	const view = Hexen2_ViewState( player );
	check( view !== null, 'a view exists' );
	same( view.origin.join( ',' ), '10,20,80', 'the eye is 50 units above the feet' );
	same( view.viewHeight, 50, 'the view height' );
	same( Hexen2_ViewAnglesWithPunch( view ).join( ',' ), '0,0,0', 'no recoil' );
	player.v.v_angle = [ 0, 350, 0 ]; player.v.punchangle = [ 0, 20, 0 ];
	const punched = Hexen2_ViewAnglesWithPunch( Hexen2_ViewState( player ) );
	same( punched[ 1 ], 10, 'yaw with punch wraps past 360' );

} );
