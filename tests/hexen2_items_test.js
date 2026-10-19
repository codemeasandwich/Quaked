// G1 items: a Paladin on demo1 picks up the level's own health and mana items through the supplied gamecode's touch
// handling; the amounts are native and the HUD follows. The class maximum mana that the mana pickup needs is applied
// at spawn (tests/hexen2_class_stats_test.js). Other G1 gaps (drawn HUD, audible
// playback, public smoke) are recorded in docs/hexen2/g1-acceptance-2026-10-19.md.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetState, SV_SetFrametime, SV_Physics } from '../src/engine/server/sv_phys.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, ss_active, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram, PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities, Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { Hexen2_ReadHud } from '../src/engine/client/hexen2_hud.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
// the selected catalogue game is the session's profile before any progs or map load
GameProfile_Set( 'hexen2' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the Paladin picks up native health and mana items on demo1', () => {

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
	sv.time = 0.1; sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE; sv.worldmodel = map;
	Hexen2_SeedPrecache( sv, map, name => Mod_FindName( name ) );
	sv.state = ss_loading;
	SV_SetState( sv, svs, pr_global_struct );
	SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	Hexen2_SpawnEntities( sv, map, 392, PR_AllocEdicts );
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	const player = sv.edicts[ 1 ];
	const client = { name: 'items', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	svs.clients[ 0 ] = client;
	check( Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId: 'paladin', origin: start.v.origin } ).ok, 'the Paladin spawned' );
	sv.active = true; sv.state = ss_active; SV_SetFrametime( 0.1 );

	const frames = ( count = 3 ) => { for ( let i = 0; i < count; i ++ ) { SV_Physics(); pr_global_struct.time = sv.time; } };
	const pickup = classname => {

		const item = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === classname );
		check( item !== undefined, `demo1 spawned a ${classname}` );
		item.v.origin = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];
		SV_LinkEdict( item, true );
		return item;

	};

	// native health pickup: the level's item_health gives its native amount and the HUD follows
	player.v.health = 50;
	pickup( 'item_health' );
	let error = null;
	try { frames( 5 ); } catch ( e ) { error = e; }
	check( error === null, 'the health pickup ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	same( player.v.health, 60, 'the native health amount (50 -> 60)' );
	same( Hexen2_ReadHud( player ).health, 60, 'the HUD shows the picked-up health' );

	// native mana pickup: the class maximum mana is now applied at spawn, so the blue potion is accepted
	const blueBefore = player.v.bluemana | 0;
	pickup( 'item_mana_blue' );
	error = null;
	try { frames( 5 ); } catch ( e ) { error = e; }
	check( error === null, 'the mana pickup ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( ( player.v.bluemana | 0 ) > blueBefore, `blue mana rose: ${blueBefore} -> ${player.v.bluemana | 0}` );
	same( Hexen2_ReadHud( player ).manaBlue, player.v.bluemana | 0, 'the HUD shows the picked-up mana' );

} );