// Hexen II precache and model builtins on the supplied level: precache_model/sound populate the server's existing
// lists and load real models from the pack, the qcc version aliases share them, precache_file is the native no-op, and
// setmodel looks a model up, sets its bounds and relinks the entity. plan sections 4/5; G1 prerequisite.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t, mod_alias } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetCallbacks } from '../src/engine/server/sv_phys.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { pr_globals, PR_SetSV, PR_SetTempString } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, SOLID_BSP, MOVETYPE_PUSH } from '../src/engine/server/server.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import { OFS_PARM0, OFS_PARM1, OFS_RETURN } from '../src/engine/progs/pr_comp.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
const setI = ( o, v ) => pr_globals.setInt32( o, v ), getI = o => pr_globals.getInt32( o );
const call = number => Hexen2_CallBuiltin( number, { random: () => 0.5 } );
const string = text => { const offset = PR_SetTempString( text ); return offset; };

const state = ( () => {

	check( existsSync( HEXEN + '/pak0.pak' ), 'the supplied Hexen II pack' );
	const raw = readFileSync( HEXEN + '/pak0.pak' );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
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
	PR_SetSV( sv );
	sv.edicts = []; sv.max_edicts = 4; sv.num_edicts = 4; sv.worldmodel = map;
	sv.models = new Array( 512 ).fill( null ); sv.models[ 0 ] = map;
	sv.model_precache = new Array( 512 ).fill( null ); sv.model_precache[ 0 ] = 'maps/demo1.bsp';
	sv.sound_precache = new Array( 512 ).fill( null );
	sv.state = ss_loading; sv.time = 1;
	sv.edicts = PR_AllocEdicts( 4, 392 );
	const world = sv.edicts[ 0 ];
	world.v.solid = SOLID_BSP; world.v.movetype = MOVETYPE_PUSH; world.v.modelindex = 0;
	SV_ClearWorld();
	SV_SetCallbacks( { SV_Move, SV_PointContents, SV_LinkEdict, SV_TestEntityPosition } );
	return sv;

} )();

Deno.test( 'precache_model loads a real pack model once and returns its name', () => {

	const name = 'models/ball.mdl', offset = string( name );
	setI( OFS_PARM0, offset );
	check( call( 20 ) === true, 'precache_model is implemented' );
	same( getI( OFS_RETURN ), offset, 'the name offset is returned' );
	const index = state.model_precache.indexOf( name );
	check( index > 0, 'the model is in the precache list' );
	check( state.models[ index ] !== null, 'the model was loaded from the pack' );
	same( state.models[ index ].type, mod_alias, 'an alias model' );
	setI( OFS_PARM0, offset ); call( 20 );
	same( state.model_precache.filter( entry => entry === name ).length, 1, 'a second precache reuses the slot' );

} );

Deno.test( 'precache_sound, the qcc version aliases and precache_file share the existing lists', () => {

	// pr_string_temp is one shared slot, so each name is written immediately before its own call
	setI( OFS_PARM0, string( 'sound/misc/bellring.wav' ) );
	check( call( 19 ) === true, 'precache_sound' );
	same( state.sound_precache[ 0 ], 'sound/misc/bellring.wav', 'the first sound' );
	setI( OFS_PARM0, string( 'sound/misc/tomb.wav' ) );
	check( call( 76 ) === true, 'precache_sound2 (the qcc alias)' );
	same( state.sound_precache[ 1 ], 'sound/misc/tomb.wav', 'the alias added the second sound' );
	const fileOffset = string( 'sound/misc/tomb.wav' );
	setI( OFS_PARM0, fileOffset );
	check( call( 68 ) === true, 'precache_file' );
	same( getI( OFS_RETURN ), fileOffset, 'precache_file is the native no-op that returns its argument' );

} );

Deno.test( 'setmodel finds the precached model, applies its bounds and relinks the entity', () => {

	const name = string( 'models/ball.mdl' );
	const index = state.model_precache.indexOf( 'models/ball.mdl' );
	check( index > 0, 'the model was precached by the first test' );
	setI( OFS_PARM0, 1 ); setI( OFS_PARM1, name );
	check( call( 3 ) === true, 'setmodel' );
	same( state.edicts[ 1 ].v.modelindex, index, 'the model index' );
	same( state.edicts[ 1 ].v.model, name, 'the model string offset' );
	const model = state.models[ index ];
	same( state.edicts[ 1 ].v.mins.join( ',' ), model.mins.join( ',' ), 'the model mins' );
	same( state.edicts[ 1 ].v.size[ 0 ], model.maxs[ 0 ] - model.mins[ 0 ], 'the derived size' );
	const missing = string( 'models/nothere.mdl' );
	setI( OFS_PARM0, 1 ); setI( OFS_PARM1, missing );
	let threw = null;
	try { call( 3 ); } catch ( error ) { threw = error; }
	check( threw !== null, 'an unprecached model is a native program error' );

} );
