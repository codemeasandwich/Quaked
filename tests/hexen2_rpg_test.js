// G1 RPG mechanics on demo1 with the supplied gamecode: armour pieces, an artifact and a weapon pick up through the
// gamecode's touch handling, and a kill awards experience and advances the class level with the native health/mana
// growth. Plan sections 5 and 7 (E16-E22 prerequisites).
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
import { Hexen2_ReadHud, Hexen2_ArmourTotal } from '../src/engine/client/hexen2_hud.js';
import { Hexen2_ArtifactCounts } from '../src/engine/client/hexen2_inventory.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
// the selected catalogue game is the session's profile before any progs or map load
GameProfile_Set( 'hexen2' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

function boot( classId = 'paladin' ) {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) return null;
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
	const client = { name: 'rpg', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	svs.clients[ 0 ] = client;
	check( Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId, origin: start.v.origin } ).ok, 'the ' + classId + ' spawned' );
	sv.active = true; sv.state = ss_active; SV_SetFrametime( 0.1 );
	const frames = ( count = 1 ) => { for ( let i = 0; i < count; i ++ ) { SV_Physics(); pr_global_struct.time = sv.time; } };
	return { sv, player, client, frames };

}

Deno.test( 'armour, an artifact and a weapon pick up on demo1', () => {

	const game = boot();
	if ( game === null ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv, player, frames } = game;
	// let the level's items run PlaceItem (solid trigger) before moving them onto the player
	frames( 5 );
	const pickup = classname => {

		const item = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === classname );
		check( item !== undefined, `demo1 spawned a ${classname}` );
		item.v.origin = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];
		SV_LinkEdict( item, true );
		frames( 3 );
		return item;

	};

	for ( const [ classname, field ] of [ [ 'item_armor_amulet', 'armor_amulet' ], [ 'item_armor_bracer', 'armor_bracer' ],
		[ 'item_armor_breastplate', 'armor_breastplate' ], [ 'item_armor_helmet', 'armor_helmet' ] ] ) {

		pickup( classname );
		check( ( player.v[ field ] | 0 ) > 0, `${field} was picked up: ${player.v[ field ] | 0}` );

	}
	const hud = Hexen2_ReadHud( player );
	check( Hexen2_ArmourTotal( hud ) > 0, 'the HUD armour total follows the pickups: ' + Hexen2_ArmourTotal( hud ) );

	pickup( 'art_torch' );
	check( ( player.v.cnt_torch | 0 ) > 0, 'the torch count follows the pickup: ' + ( player.v.cnt_torch | 0 ) );
	check( Hexen2_ArtifactCounts( player )[ 0 ] > 0, 'the inventory reads the torch count' );

	const itemsBefore = player.v.items | 0;
	pickup( 'wp_weapon2' );
	check( ( player.v.items | 0 ) !== itemsBefore, `the weapon pickup changed items: ${itemsBefore} -> ${player.v.items | 0}` );

} );

Deno.test( 'a kill awards experience and advances the class level', () => {

	const game = boot();
	if ( game === null ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv, player, frames } = game;
	player.v.experience = 944; // just below the Paladin level-2 threshold (945)
	const levelBefore = player.v.level | 0, maxHealthBefore = player.v.max_health, maxManaBefore = player.v.max_mana;
	const monster = sv.edicts.find( ent => ent && ! ent.free && /^monster_/.test( PR_GetString( ent.v.classname ) ) );
	check( monster !== undefined, 'the level spawned a monster' );
	monster.v.origin = [ player.v.origin[ 0 ] + 64, player.v.origin[ 1 ], player.v.origin[ 2 ] ];
	monster.v.movetype = 0; monster.v.health = 1;
	SV_LinkEdict( monster, true );
	player.v.angles = [ 0, 0, 0 ]; player.v.v_angle = [ 0, 0, 0 ];
	player.v.impulse = 1; frames( 1 ); player.v.impulse = 0; player.v.button0 = 1;
	let error = null;
	try { frames( 30 ); } catch ( e ) { error = e; }
	player.v.button0 = 0;
	check( error === null, 'the kill frames ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( ( player.v.experience | 0 ) > 944, 'experience rose on the kill: ' + ( player.v.experience | 0 ) );
	check( ( player.v.level | 0 ) > levelBefore, `the kill advanced the level: ${levelBefore} -> ${player.v.level | 0}` );
	check( player.v.max_health > maxHealthBefore, `max health grew with the level: ${maxHealthBefore} -> ${player.v.max_health}` );
	check( player.v.max_mana > maxManaBefore, `max mana grew with the level: ${maxManaBefore} -> ${player.v.max_mana}` );

} );
