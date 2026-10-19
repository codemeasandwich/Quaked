// Hexen II status-bar readiness: every native bar picture loads from the supplied paks through the existing picture
// cache, and the HUD model binds to the bar's values (health, mana, armour, artifact icon bits, weapon frame). The
// pixel layout is not claimed. plan section 7; G1 presentation prerequisite.
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
import { Hexen2_ReadHud } from '../src/engine/client/hexen2_hud.js';
import { Hexen2_StatusBindings, Hexen2_LoadStatusAssets, HEXEN2_STATUS_ASSETS } from '../src/engine/client/hexen2_status.js';

import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
// the selected catalogue game is the session's profile before any progs or map load
GameProfile_Set( 'hexen2' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the native status-bar pictures load and the HUD binds to the bar values', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();

	// every named bar picture is a readable qpic lump in the supplied paks. The port's canvas-backed Draw_CachePic
	// needs a DOM, so this reads the same qpic header the engine does (width/height at the first 8 bytes).
	const loadPic = name => {

		const found = pak.COM_FindFile( name );
		if ( ! found ) return null;
		const view = new DataView( found.data.buffer, found.data.byteOffset, found.size );
		return { width: view.getInt32( 0, true ), height: view.getInt32( 4, true ) };

	};
	const assets = Hexen2_LoadStatusAssets( loadPic );
	same( assets.missing.length, 0, 'all bar pictures load: missing ' + assets.missing.join( ',' ) );
	same( assets.loaded.length, HEXEN2_STATUS_ASSETS.length, 'the whole bar asset list loaded' );
	for ( const pic of assets.loaded ) check( pic.width > 0 && pic.height > 0 && pic.width <= 1024 && pic.height <= 1024, `${pic.name} has dimensions: ${pic.width}x${pic.height}` );

	// the HUD model binds to the bar's values
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
	const client = { name: 'status', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	svs.clients[ 0 ] = client;
	check( Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId: 'paladin', origin: start.v.origin } ).ok, 'the Paladin spawned' );

	player.v.artifacts = 0b101; player.v.weaponframe = 3;
	const bindings = Hexen2_StatusBindings( Hexen2_ReadHud( player ) );
	same( bindings.classNumber, 1, 'class' );
	same( bindings.health, player.v.health, 'the bar shows the native starting health' );
	same( bindings.maxHealth, player.v.max_health, 'the bar shows the native maximum health' );
	same( bindings.weaponFrame, 3, 'weapon frame' );
	same( bindings.artifactIcons.join( ',' ), '0,2', 'the artifact icon bits' );
	same( bindings.armour.armor_amulet, 0, 'an empty armour piece' );
	same( bindings.dead, false, 'alive' );

} );
