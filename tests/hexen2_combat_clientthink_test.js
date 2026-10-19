// G1 combat through the client-think path: the same order the browser loop uses — SV_User_SetCommand, SV_ClientThink,
// button0, SV_Physics — must still damage a level monster. This control isolates the engine path from the browser
// harness's DOM/input glue (where monster damage has not yet been observed).
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetState, SV_SetFrametime, SV_Physics, SV_SetPlayer } from '../src/engine/server/sv_phys.js';
import { SV_ClientThink, SV_User_SetCommand, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, ss_active, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram, PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities, Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
// the selected catalogue game is the session's profile before any progs or map load
GameProfile_Set( 'hexen2' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'an attack through SV_User_SetCommand and SV_ClientThink damages a monster', () => {

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
	const client = { name: 'combat', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	svs.clients[ 0 ] = client;
	check( Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId: 'paladin', origin: start.v.origin } ).ok, 'the Paladin spawned' );

	// a live level monster, held still directly in front of the player, facing it
	const monster = sv.edicts.find( ent => ent && ! ent.free && /^monster_/.test( PR_GetString( ent.v.classname ) ) );
	check( monster !== undefined, 'the level spawned a monster' );
	monster.v.origin = [ player.v.origin[ 0 ] + 64, player.v.origin[ 1 ], player.v.origin[ 2 ] ];
	monster.v.movetype = 0; // none: hold it in place for the measurement
	monster.v.health = 100;
	monster.v.ideal_yaw = 0;
	SV_LinkEdict( monster, true );
	const healthBefore = monster.v.health;
	const playerBefore = player.v.health;

	// select the first weapon (native number-key impulse), settle one frame, then hold attack through the same
	// client-think path the browser loop uses
	sv.active = true; sv.state = ss_active; SV_SetFrametime( 0.1 );
	SV_SetPlayer( player );
	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	player.v.impulse = 1;
	SV_Physics(); pr_global_struct.time = sv.time;
	player.v.impulse = 0;
	let error = null;
	try { for ( let frame = 0; frame < 20; frame ++ ) { SV_User_SetCommand( { forwardmove: 0, viewangles: [ 0, 0, 0 ] } ); SV_ClientThink(); player.v.button0 = 1; SV_Physics(); pr_global_struct.time = sv.time; } } catch ( e ) { error = e; }
	check( error === null, 'the attack frames ran without a script error: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( monster.v.health < healthBefore, `the monster took damage: ${monster.v.health} of ${healthBefore} (weapon ${player.v.current_weapon | 0}, frame ${player.v.weaponframe | 0})` );
	check( monster.v.health >= 0, 'the damage is bounded: ' + monster.v.health );
	check( player.v.health === playerBefore, 'the attacking Paladin is unhurt: ' + player.v.health + ' of ' + playerBefore );

} );
