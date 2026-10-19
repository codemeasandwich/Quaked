// The booted Hexen level runs world physics frames without a gamecode error: StartFrame, LinkDoors' native forward
// scan, monster thinks and the message buffers all work through the supplied gamecode. The test also checks that the
// monsters actually think and move. plan section 5; live-world prerequisite for G1.
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
import { PR_SetSV, PR_SetSVS, pr_global_struct, svs } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, ss_active, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram, PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities } from '../src/engine/progs/hexen2_boot.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
// the selected catalogue game is the session's profile before any progs or map load
GameProfile_Set( 'hexen2' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the booted level runs world physics frames and its monsters move', () => {

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
	PR_SetSV( sv );
	PR_SetSVS( { maxclients: 1, clients: [ { active: false } ], active: true } );
	sv.time = 0.1; sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	sv.worldmodel = map;
	Hexen2_SeedPrecache( sv, map, name => Mod_FindName( name ) );
	sv.state = ss_loading;
	SV_SetState( sv, svs, pr_global_struct );
	SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	Hexen2_SpawnEntities( sv, map, 392, PR_AllocEdicts );
	sv.active = true; sv.state = ss_active;
	SV_SetFrametime( 0.1 );

	const before = sv.edicts.map( ent => ent && ! ent.free ? [ ent.v.origin?.[ 0 ] ?? 0, ent.v.origin?.[ 1 ] ?? 0, ent.v.origin?.[ 2 ] ?? 0 ] : null );
	let error = null, frames = 0;
	try {

		for ( ; frames < 10; frames ++ ) { SV_Physics(); pr_global_struct.time = sv.time; }

	} catch ( e ) { error = e; }
	check( error === null, `physics stopped in frame ${frames}: ` + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( frames === 10, 'ten frames ran: ' + frames );
	let moved = 0;
	for ( let i = 1; i < sv.num_edicts; i ++ ) {

		const ent = sv.edicts[ i ];
		if ( ! ent || ent.free || ! before[ i ] ) continue;
		const delta = Math.abs( ( ent.v.origin?.[ 0 ] ?? 0 ) - before[ i ][ 0 ] )
			+ Math.abs( ( ent.v.origin?.[ 1 ] ?? 0 ) - before[ i ][ 1 ] )
			+ Math.abs( ( ent.v.origin?.[ 2 ] ?? 0 ) - before[ i ][ 2 ] );
		if ( delta > 0.1 ) moved ++;

	}
	check( moved > 0, 'at least one world entity moved during the ten frames: ' + moved );

} );
