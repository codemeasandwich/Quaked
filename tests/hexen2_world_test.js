// The Hexen II world layer over the loaded level: server world setup on the supplied demo1.bsp, the native hull
// selection (named hull or the size rules among 0/4/3/1/5), and the world builtins (setorigin, setsize, traceline,
// pointcontents, checkbottom, droptofloor) through the registered dispatcher. plan section 5; G1 prerequisite.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_HullForEntity, SV_LinkEdict, SV_PointContents } from '../src/engine/server/world.js';
import { SV_Move, SV_TestEntityPosition } from '../src/engine/server/world.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { pr_global_struct, pr_globals, PR_SetSV } from '../src/engine/progs/progs.js';
import { sv as serverSv } from '../src/engine/server/server.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import '../src/engine/progs/hexen2_world_cmds.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3, OFS_RETURN } from '../src/engine/progs/pr_comp.js';
import { SOLID_BSP, MOVETYPE_PUSH } from '../src/engine/server/server.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
const setF = ( o, v ) => pr_globals.setFloat( o, v ), setI = ( o, v ) => pr_globals.setInt32( o, v ), getF = o => pr_globals.getFloat( o );
const call = ( number ) => Hexen2_CallBuiltin( number, { random: () => 0.5 } );

function setup() {

	check( existsSync( HEXEN + '/pak0.pak' ), 'the supplied Hexen II pack' );
	const raw = readFileSync( HEXEN + '/pak0.pak' );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();

	// the loaded program supplies the Hexen globals the builtins use
	const progsBytes = readFileSync( HEXEN + '/progs.dat' );
	PR_LoadProgs( progsBytes.buffer.slice( progsBytes.byteOffset, progsBytes.byteOffset + progsBytes.byteLength ) );

	Mod_SetHexenHullLayout( true );
	const m = new model_t(); m.name = 'maps/demo1.bsp'; set_loadmodel( m );
	const bsp = pak.COM_FindFile( 'maps/demo1.bsp' ).data;
	Mod_LoadBrushModel( m, bsp.buffer.slice( bsp.byteOffset, bsp.byteOffset + bsp.byteLength ) );
	Mod_SetHexenHullLayout( false );

	// a minimal server world: the loaded map, the world edict and one box entity. The engine shares the single
	// server_t instance between server.js and the program interpreter (SV_SpawnServer calls PR_SetSV(sv)).
	const state = serverSv;
	PR_SetSV( state );
	state.edicts = []; state.max_edicts = 4; state.num_edicts = 4; state.worldmodel = m; state.models = [ m ]; state.time = 1;
	state.edicts = PR_AllocEdicts( 4, m.hullCount === 8 ? 392 : 105 );
	const world = state.edicts[ 0 ];
	world.v.solid = SOLID_BSP; world.v.movetype = MOVETYPE_PUSH; world.v.modelindex = 0;
	SV_ClearWorld();
	// the physics module takes the world functions by injection, as SV_SpawnServer wires them
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	const spawn = ( () => {

		for ( const block of m.entities.split( '}' ) ) {

			if ( ! block.includes( 'info_player_start' ) ) continue;
			const match = /"origin"\s+"([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)"/.exec( block );
			if ( match ) return [ Number( match[ 1 ] ), Number( match[ 2 ] ), Number( match[ 3 ] ) ];

		}
		return null;

	} )();
	check( spawn !== null, 'the supplied level has an info_player_start' );
	return { model: m, spawn, world, player: state.edicts[ 1 ] };

}

const world = setup();

Deno.test( 'Hexen hull selection uses a named hull and the native size rules; Quake keeps its own', () => {

	const offset = new Float32Array( 3 );
	const hullFor = ( size, named = 0 ) => {

		const mins = [ - size[ 0 ] / 2, - size[ 1 ] / 2, 0 ], maxs = [ size[ 0 ] / 2, size[ 1 ] / 2, size[ 2 ] ];
		world.player.v.hull = named;
		return SV_HullForEntity( world.world, mins, maxs, offset, world.player );

	};
	same( hullFor( [ 0, 0, 0 ] ).clip_mins.join( ',' ), '0,0,0', 'a point uses hull 0' );
	same( hullFor( [ 32, 32, 56 ] ).clip_mins.join( ',' ), '-16,-16,-24', 'a full player uses hull 1' );
	same( hullFor( [ 32, 32, 24 ] ).clip_mins.join( ',' ), '-16,-16,-12', 'a half player uses hull 3' );
	same( hullFor( [ 64, 64, 64 ] ).clip_mins.join( ',' ), '-48,-48,-50', 'a golem uses hull 5' );
	same( hullFor( [ 0, 0, 0 ], 5 ).clip_mins.join( ',' ), '-8,-8,-8', 'a named hull 5 (pentacle) is honoured' );
	same( hullFor( [ 0, 0, 0 ], 6 ).clip_mins.join( ',' ), '-48,-48,-50', 'a named hull 6 (golem) is honoured' );
	same( hullFor( [ 0, 0, 0 ], 4 ).clip_mins.join( ',' ), '-16,-16,-12', 'a named hull 4 (crouch) is honoured' );

} );

Deno.test( 'world contents, a traceline and entity sizing work on the supplied level', () => {

	const point = [ world.spawn[ 0 ], world.spawn[ 1 ], world.spawn[ 2 ] + 24 ];
	for ( let i = 0; i < 3; i ++ ) setF( OFS_PARM0 + i, point[ i ] );
	check( call( 41 ) === true, 'pointcontents is implemented' );
	same( getF( OFS_RETURN ), - 1, 'the spawn point is in empty space (CONTENTS_EMPTY)' );

	// a downward traceline from above the spawn reaches the floor (not the whole way to the void)
	[ world.spawn[ 0 ], world.spawn[ 1 ], world.spawn[ 2 ] + 200 ].forEach( ( v, i ) => setF( OFS_PARM0 + i, v ) );
	[ world.spawn[ 0 ], world.spawn[ 1 ], world.spawn[ 2 ] - 200 ].forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	setF( OFS_PARM2, 0 ); setI( OFS_PARM3, 1 );
	check( call( 16 ) === true, 'traceline is implemented' );
	const fraction = pr_global_struct.trace_fraction;
	check( fraction > 0 && fraction < 1, 'the trace hits the level: ' + fraction );
	same( pr_global_struct.trace_ent, 0, 'the world edict is the hit' );
	check( pr_global_struct.trace_endpos[ 2 ] < world.spawn[ 2 ] + 200, 'the trace stopped before its end' );

	// setorigin + setsize relink the entity: absmin is origin + mins - 1 (the non-item expansion)
	setI( OFS_PARM0, 1 );
	world.spawn.forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	check( call( 2 ) === true, 'setorigin is implemented' );
	same( world.player.v.origin.join( ',' ), world.spawn.join( ',' ), 'setorigin moved the entity' );
	setI( OFS_PARM0, 1 );
	[ - 16, - 16, - 24 ].forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	[ 16, 16, 32 ].forEach( ( v, i ) => setF( OFS_PARM2 + i, v ) );
	check( call( 4 ) === true, 'setsize is implemented' );
	same( world.player.v.size.join( ',' ), '32,32,56', 'the size is the maxs - mins' );
	same( world.player.v.absmin.join( ',' ), [ world.spawn[ 0 ] - 17, world.spawn[ 1 ] - 17, world.spawn[ 2 ] - 25 ].join( ',' ), 'absmin after linking' );
	same( world.player.v.absmax.join( ',' ), [ world.spawn[ 0 ] + 17, world.spawn[ 1 ] + 17, world.spawn[ 2 ] + 33 ].join( ',' ), 'absmax after linking' );

	// checkbottom and droptofloor answer with a bounded value on the real level
	setI( OFS_PARM0, 1 );
	check( call( 40 ) === true, 'checkbottom is implemented' );
	check( getF( OFS_RETURN ) === 0 || getF( OFS_RETURN ) === 1, 'checkbottom answers 0 or 1' );
	setI( OFS_PARM0, 1 );
	check( call( 34 ) === true, 'droptofloor is implemented' );
	check( getF( OFS_RETURN ) === 0 || getF( OFS_RETURN ) === 1, 'droptofloor answers 0 or 1' );

} );
