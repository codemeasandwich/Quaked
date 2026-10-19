// The active game profile (src/engine/common/game_profile.js) is the one choice shared code reads: selection from a
// catalogue id, the Quake default, the progs CRC confirmation, the hull sizes a BSP's record layout selects, and the
// unchanged Quake builtin table a Quake program runs. docs/hexen2/unified-host.md §2-3.
import { readFileSync } from 'node:fs';
import {
	GAME_PROFILES, GameProfile_For, GameProfile_Set, GameProfile_Get, GameProfile_IsHexen2, GameProfile_ConfirmProgs
} from '../src/engine/common/game_profile.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { COM_AddPack, COM_FindFile, COM_LoadPackFile } from '../src/engine/common/pak.js';
import { PR_LoadProgs } from '../src/engine/progs/pr_edict.js';
import { pr_builtins, pr_numbuiltins } from '../src/engine/progs/progs.js';
import { pr_builtin } from '../src/engine/server/pr_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

// A minimal version-29 BSP: one plane, one node whose two children are the empty and solid leafs, and a models lump
// of `records` records of `recordBytes` (64 is Quake's four headnodes, 80 Hexen II's eight). Mod_LoadNodes requires a
// node, so the rest of the map can stay empty.
function bspWithModels( records, recordBytes ) {

	const lumps = Array.from( { length: 15 }, () => new Uint8Array( 0 ) );
	const plane = new Uint8Array( 20 ), planeView = new DataView( plane.buffer );
	planeView.setFloat32( 8, 1, true ); // normal z, dist 0, type 0
	lumps[ 1 ] = plane;
	const node = new Uint8Array( 24 ), nodeView = new DataView( node.buffer );
	nodeView.setInt32( 0, 0, true ); // plane 0
	nodeView.setInt16( 4, - 1, true ); // child 0: leaf 0 (empty)
	nodeView.setInt16( 6, - 2, true ); // child 1: leaf 1 (solid)
	lumps[ 5 ] = node;
	const leafs = new Uint8Array( 56 ), leafView = new DataView( leafs.buffer );
	for ( let i = 0; i < 2; i ++ ) {

		leafView.setInt32( i * 28, - 1 - i, true ); // contents: empty, then solid
		leafView.setInt32( i * 28 + 4, - 1, true ); // visofs

	}
	lumps[ 10 ] = leafs;
	const models = new Uint8Array( records * recordBytes ), modelView = new DataView( models.buffer );
	const headnodes = recordBytes === 80 ? 8 : 4;
	for ( let i = 0; i < records; i ++ ) {

		const at = i * recordBytes;
		for ( let j = 0; j < headnodes; j ++ ) modelView.setInt32( at + 36 + j * 4, - 1, true ); // no clipnodes
		modelView.setInt32( at + 36 + headnodes * 4, 0, true ); // visleafs
		modelView.setInt32( at + 40 + headnodes * 4, 0, true ); // firstface
		modelView.setInt32( at + 44 + headnodes * 4, 0, true ); // numfaces

	}
	lumps[ 14 ] = models;

	let size = 124;
	for ( const lump of lumps ) size += ( lump.length + 3 ) & ~ 3;
	const bytes = new Uint8Array( size ), view = new DataView( bytes.buffer );
	view.setInt32( 0, 29, true );
	let at = 124;
	lumps.forEach( ( lump, i ) => {

		view.setInt32( 4 + i * 8, at, true );
		view.setInt32( 8 + i * 8, lump.length, true );
		bytes.set( lump, at );
		at += ( lump.length + 3 ) & ~ 3;

	} );
	return bytes.buffer;

}

function loadSynthetic( records, recordBytes ) {

	const model = new model_t();
	model.name = `maps/synthetic-${records * recordBytes}.bsp`;
	set_loadmodel( model );
	Mod_LoadBrushModel( model, bspWithModels( records, recordBytes ) );
	return model;

}

Deno.test( 'the catalogue game selects its profile, and every Quake game keeps the Quake profile', () => {

	same( GameProfile_Get(), GAME_PROFILES.quake, 'Quake is the default before any selection' );
	same( GameProfile_IsHexen2(), false, 'the default is not Hexen II' );
	for ( const id of [ 'shareware', 'quake', 'hipnotic', 'rogue', 'dopa', 'mg1', 'mod_something' ] )
		same( GameProfile_For( id ), GAME_PROFILES.quake, `${id} maps to the Quake profile` );

	const base = GameProfile_Set( 'hexen2' );
	same( base, GAME_PROFILES.hexen2, 'the base Hexen II entry' );
	same( GameProfile_IsHexen2(), true, 'Hexen II is active' );
	same( GameProfile_Get().hullCount, 8, 'eight hulls' );
	same( GameProfile_Get().startMap, 'demo1', 'the base campaign starts at demo1' );
	same( GameProfile_Get().startupScript, 'hexen.rc', 'Hexen II opens its own startup script' );
	same( GameProfile_Get().maxPacks, 10, 'packs are probed across pak0..pak9' );
	same( GameProfile_Get().hulls[ 4 ].mins.join( ',' ), '-40,-40,-42', 'the base hydra hull 4' );

	const demo = GameProfile_Set( 'hexen2-demo' );
	same( demo.demo, true, 'the demo edition flag' );
	same( demo.portals, false, 'the demo is not Portal' );
	same( demo.startMap, 'demo1', 'the demo starts at demo1' );

	const portals = GameProfile_Set( 'hexen2-portals' );
	same( portals.portals, true, 'the Portal edition flag' );
	same( portals.startMap, 'keep1', 'Portal starts at keep1' );
	same( portals.hulls[ 4 ].mins.join( ',' ), '-8,-8,-8', 'Portal changes hull 4 to the pentacle' );
	same( portals.hulls[ 4 ].maxs.join( ',' ), '8,8,8', 'Portal hull 4 maxs' );
	same( GameProfile_Set( 'quake' ), GAME_PROFILES.quake, 'a Quake game switches back' );

} );

Deno.test( 'a progs header CRC must belong to the selected game', () => {

	GameProfile_Set( 'quake' );
	same( GameProfile_ConfirmProgs( 5927 ), null, 'Quake gamecode under the Quake profile' );
	check( /Hexen II gamecode/.test( GameProfile_ConfirmProgs( 38488 ) ), 'base Hexen gamecode is named' );
	check( /Hexen II gamecode/.test( GameProfile_ConfirmProgs( 26905 ) ), 'Portal gamecode is named' );

	for ( const [ id, crc ] of [ [ 'hexen2', 38488 ], [ 'hexen2-demo', 38488 ], [ 'hexen2-portals', 26905 ] ] ) {

		GameProfile_Set( id );
		same( GameProfile_ConfirmProgs( crc ), null, `${id} accepts ${crc}` );
		check( GameProfile_ConfirmProgs( 5927 ) !== null, `${id} refuses Quake gamecode` );

	}
	GameProfile_Set( 'hexen2' );
	check( /not hexen2 gamecode/.test( GameProfile_ConfirmProgs( 26905 ) ), 'the base refuses Portal gamecode' );
	GameProfile_Set( 'hexen2-portals' );
	check( /not hexen2-portals gamecode/.test( GameProfile_ConfirmProgs( 38488 ) ), 'Portal refuses base gamecode' );

} );

Deno.test( 'the BSP models lump selects four 64-byte or eight 80-byte hull records', () => {

	GameProfile_Set( 'quake' );
	const quake = loadSynthetic( 2, 64 );
	same( quake.hullCount, 4, '64-byte records are a Quake level' );
	same( quake.hulls[ 2 ].clip_mins.join( ',' ), '-32,-32,-24', 'the Quake shambler hull' );

	GameProfile_Set( 'hexen2' );
	const hexen = loadSynthetic( 2, 80 );
	same( hexen.hullCount, 8, '80-byte records are a Hexen II level' );
	same( hexen.hulls[ 2 ].clip_mins.join( ',' ), '-24,-24,-20', 'the Hexen scorpion hull' );
	same( hexen.hulls[ 4 ].clip_mins.join( ',' ), '-40,-40,-42', 'the base profile supplies hull 4' );

	GameProfile_Set( 'hexen2-portals' );
	const portal = loadSynthetic( 2, 80 );
	same( portal.hulls[ 4 ].clip_mins.join( ',' ), '-8,-8,-8', 'the Portal profile supplies its hull 4' );

	// 320 bytes divide by both record sizes: only the selected profile can say which game the level belongs to
	GameProfile_Set( 'hexen2' );
	same( loadSynthetic( 4, 80 ).hullCount, 8, 'the ambiguous lump under Hexen II is eight-hull' );
	GameProfile_Set( 'quake' );
	same( loadSynthetic( 5, 64 ).hullCount, 4, 'the ambiguous lump under Quake is four-hull' );

} );

Deno.test( 'Quake progs still load and run Quake\'s unchanged builtin table', () => {

	GameProfile_Set( 'quake' );
	const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
	COM_AddPack( COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
	const found = COM_FindFile( 'progs.dat' );
	check( found !== null, 'the shareware pack carries progs.dat' );
	PR_LoadProgs( found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.data.length ) );
	same( pr_builtins, pr_builtin, 'the Quake table is installed unchanged' );
	same( pr_numbuiltins, pr_builtin.length, 'every Quake builtin number is installed' );

} );
