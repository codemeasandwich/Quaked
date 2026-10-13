// The post pipeline's liquids stage on its own (card [44h]): which textures are water and slime, the pools a level's
// faces merge into, the links through them, and the probe status when the Newer water is off. Through the public
// interface of src/newer/render/r_post_liquids.js, split from gl_post.js.
import * as liquids from '../src/newer/render/r_post_liquids.js';
import * as post from '../src/newer/render/gl_post.js';
import * as THREE from 'three';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( "water and slime by name; lava and teleporters are not see-through; no water defaults to Muddy, so every map's pools show caustics", () => {
	for ( const n of [ '*water0', '*04water1', '*04awater1', '*04mwat1' ] ) same( liquids.liquidKind( n ), 0, n + ' is water' );
	same( liquids.liquidKind( '*slime0' ), 1, 'slime' );
	for ( const n of [ '*lava1', '*teleport', 'water_not_a_liquid' ] ) same( liquids.liquidKind( n ), - 1, n + ' is not' );
	// caustics on all maps (owner, 13 October 2026): no map's water defaults to Muddy, whose pools dim them
	same( liquids.liquidMapLook( '*04water1' ), 0, 'E1M3 and the other *04water1 maps: clear' ); same( liquids.liquidMapLook( '*04mwat2' ), 0, 'murky water: clear' ); same( liquids.liquidMapLook( '*water0' ), 0, 'clear' );
	liquids.R_PostLiquidsReset( 'maps/e1m2.bsp' ); same( liquids.liquidMapLook( '*04water1' ), 1, 'E1M2 keeps the owner\'s tinted look' ); liquids.R_PostLiquidsReset();
	same( liquids.R_LiquidOpacity( '*04water1', .5 ) === liquids.LIQUID_LOOKS[ 0 ].opacity || post.r_newer_water?.value === 0, true, '*04water1 has Clear coverage' );
	post.r_water_look.value = 3; same( liquids.R_LiquidLookIndex( 0, liquids.liquidMapLook( '*04water1' ) ), 2, 'Muddy is still a choice (r_water_look 3)' ); post.r_water_look.value = 0;
	check( liquids.liquidLookGLSL.includes( 'vec3 liquidAbsorption( float look )' ), 'the looks as GLSL' );
	same( post.R_IsWaterTextureName, liquids.R_IsWaterTextureName, 'gl_post.js re-exports the same function' );
} );

Deno.test( 'a level\'s faces merge into pools by kind, look and height; links are kept; a reset forgets them', () => {
	const face = ( kind, x, z = 0, size = 96 ) => ( { kind, mapLook: 0, min: [ x, 0 ], max: [ x + size, size ], z, probePoint: [ x, 32, z + 8 ] } );
	liquids.R_PostLiquidsReset();
	liquids.R_PostSetLiquidRegions( [ face( 0, 0 ), face( 0, 80 ), face( 0, 400 ), face( 1, 64 ), face( 0, 160, 20 ), face( 0, 900, 0, 32 ) ], [ face( 0, 0 ) ] );
	const pools = liquids.R_GetLiquidRegions();
	same( pools.length, 4, 'two touching water faces merge; a far one, a slime one and a higher one stay apart; a puddle under 64x64 is dropped' );
	const merged = pools.find( r => r.kind === 0 && r.max[ 0 ] === 176 );
	check( merged && merged.min[ 0 ] === 0 && merged.probePoints.length === 2, 'the merged pool spans both faces and keeps both probe points' );
	same( liquids.R_GetLavaRegions().length, 1, 'lava pools apart' );
	const link = { above: {}, below: {}, aboveVis: new Uint8Array( 1 ), belowVis: new Uint8Array( 1 ) };
	liquids.R_PostAddLiquidLink( link ); same( liquids.R_GetLiquidLinks()[ 0 ], link, 'the link is kept' );
	same( post.R_GetLiquidRegions(), pools, 'gl_post.js reads the same pools' );
	liquids.R_PostLiquidsReset();
	same( liquids.R_GetLiquidRegions().length + liquids.R_GetLavaRegions().length + liquids.R_GetLiquidLinks().length, 0, 'reset' );
} );

Deno.test( 'with the Newer water off, no probes are waited for and none are captured', () => {
	const camera = new THREE.PerspectiveCamera(); camera.updateMatrixWorld();
	const status = liquids.R_WaterStartupStatus( camera );
	same( status.pending, 0, 'nothing pending' ); same( status.ready, 0, 'nothing ready' );
	liquids.R_WaterProbesFrame( null, null, camera, () => {} ); // returns before touching the renderer
} );
