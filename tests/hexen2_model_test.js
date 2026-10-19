// Hexen II's eight-hull brush levels through the existing loader (src/engine/render/gl_model_bsp.js): the explicit
// Hexen layout reads 80-byte submodel records and builds hulls 1-5 with the pinned sizes, while a Quake level keeps
// its 64-byte four-hull records and WinQuake hulls. The supplied demo1.bsp and the repository shareware map are real
// fixtures; the Hexen layout is selected by the caller (the session), never guessed from the file. plan section 5.
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout, Mod_HexenHullLayout } from '../src/engine/render/gl_model_bsp.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m ) => check( Math.abs( a - b ) < 1e-3, `${m}: ${a} != ${b}` );
const HEXEN_PAK = '/Users/bri/quaked/Hexen 2/data1/pak0.pak';

function mount( path, name ) {

	const raw = readFileSync( path );
	check( raw.length > 0, 'a readable pack: ' + path );
	pak.COM_AddPack( pak.COM_LoadPackFile( name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

}

const file = name => {

	const found = pak.COM_FindFile( name );
	check( found !== null && found !== undefined, 'a file in the mounted packs: ' + name );
	return found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.data.byteLength );

};
const fresh = name => { const m = new model_t(); m.name = name; set_loadmodel( m ); return m; };

Deno.test( 'a Quake level keeps four 64-byte hull records and WinQuake hull sizes', () => {

	mount( new URL( '../games/shareware/pak0.pak', import.meta.url ).pathname, 'pak0.pak' );
	VID_SetPalette( file( 'gfx/palette.lmp' ) ); Mod_Init();
	check( Mod_HexenHullLayout() === false, 'the Hexen layout is off by default' );
	const m = fresh( 'maps/e1m1.bsp' );
	Mod_LoadBrushModel( m, file( 'maps/e1m1.bsp' ) );
	same( m.hullCount, 4, 'a Quake level defines four hulls' );
	same( m.numsubmodels > 1, true, 'inline submodels' );
	same( m.hulls[ 1 ].clip_mins[ 0 ], - 16, 'player hull x' );
	same( m.hulls[ 1 ].clip_mins[ 2 ], - 24, 'player hull z' );
	same( m.hulls[ 2 ].clip_mins[ 0 ], - 32, 'shambler hull x' );
	check( m.hulls[ 1 ].clipnodes === m.clipnodes, 'the player hull uses the level clipnodes' );

} );

Deno.test( 'the supplied Hexen demo1.bsp loads 100 eight-hull submodels with native hull sizes', () => {

	if ( ! existsSync( HEXEN_PAK ) ) { console.log( 'SKIP: the supplied Hexen II pack is not present at ' + HEXEN_PAK ); return; }
	mount( HEXEN_PAK, 'hexen-pak0.pak' );
	VID_SetPalette( file( 'gfx/palette.lmp' ) ); Mod_Init();
	Mod_SetHexenHullLayout( true );
	try {

		const m = fresh( 'maps/demo1.bsp' );
		Mod_LoadBrushModel( m, file( 'maps/demo1.bsp' ) );
		same( m.bspVersion, 29, 'BSP version 29' );
		same( m.hullCount, 8, 'the level defines eight hulls' );
		same( m.numsubmodels, 100, 'the supplied level has 100 submodels' );
		same( m.numtextures >= 90, true, 'its textures (' + m.numtextures + ')' );
		check( m.entities.includes( 'worldspawn' ), 'its entity text' );
		// the pinned Hexen hull sizes (gl_model.c Mod_MakeHulls)
		same( m.hulls[ 1 ].clip_mins.join( ',' ), '-16,-16,-24', 'player hull' );
		same( m.hulls[ 2 ].clip_mins.join( ',' ), '-24,-24,-20', 'scorpion hull' );
		same( m.hulls[ 3 ].clip_mins.join( ',' ), '-16,-16,-12', 'crouch hull' );
		same( m.hulls[ 4 ].clip_mins.join( ',' ), '-8,-8,-8', 'pentacle/small hull' );
		same( m.hulls[ 4 ].clip_maxs.join( ',' ), '8,8,8', 'pentacle/small hull maxs' );
		same( m.hulls[ 5 ].clip_mins.join( ',' ), '-48,-48,-50', 'golem hull' );
		same( m.hulls[ 5 ].clip_maxs.join( ',' ), '48,48,50', 'golem hull maxs' );
		for ( const hull of [ 1, 2, 3, 4, 5 ] ) {

			check( m.hulls[ hull ].clipnodes === m.clipnodes, `hull ${hull} uses the level clipnodes` );
			same( m.hulls[ hull ].lastclipnode, m.numclipnodes - 1, `hull ${hull} last clipnode` );

		}
		// the world model's bounds are the supplied level's (the loader spreads them by one unit)
		near( m.mins[ 0 ], - 3370, 'world mins x' );
		check( m.maxs[ 2 ] > 878 && m.maxs[ 2 ] < 882, 'world maxs z: ' + m.maxs[ 2 ] );

	} finally { Mod_SetHexenHullLayout( false ); }

} );
