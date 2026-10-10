import * as normals from '../src/newer/render/gl_normals.js';

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

function height( width, h, fn ) {

	const a = new Float32Array( width * h );
	for ( let y = 0; y < h; y ++ ) for ( let x = 0; x < width; x ++ ) a[ y * width + x ] = fn( x, y );
	return a;

}

Deno.test( 'a flat crafted height gives flat normals and keeps the height in alpha', () => {

	const out = normals.R_NormalsFromCraftedHeight( height( 16, 16, () => 0.5 ), 16, 16, 1.2 );
	assertEqual( out.length, 16 * 16 * 4, 'size' );
	for ( let i = 0; i < 16 * 16; i ++ ) {

		assertEqual( out[ i * 4 ], 128, 'x' );
		assertEqual( out[ i * 4 + 1 ], 128, 'y' );
		assertEqual( out[ i * 4 + 2 ], 255, 'z' );
		assertEqual( out[ i * 4 + 3 ], 128, 'height' );

	}

} );

Deno.test( 'crafted normals lean away from rising height, in texture coordinates', () => {

	// rising to the right (u): the normal leans left (x below the middle), and y stays level
	const ramp = normals.R_NormalsFromCraftedHeight( height( 32, 32, ( x ) => x < 16 ? x / 32 : ( 32 - x ) / 32 ), 32, 32, 1.2 );
	const at = ( x, y ) => ramp.subarray( ( y * 32 + x ) * 4, ( y * 32 + x ) * 4 + 4 );
	assertEqual( at( 6, 10 )[ 0 ] < 128, true, 'leans left on the rising side' );
	assertEqual( at( 24, 10 )[ 0 ] > 128, true, 'leans right on the falling side' );
	assertEqual( at( 6, 10 )[ 1 ], 128, 'level in y' );

	// rising down the rows (v)
	const down = normals.R_NormalsFromCraftedHeight( height( 32, 32, ( x, y ) => y < 16 ? y / 32 : ( 32 - y ) / 32 ), 32, 32, 1.2 );
	assertEqual( down[ ( 6 * 32 + 10 ) * 4 + 1 ] < 128, true, 'leans up on the rising side' );

} );

Deno.test( 'stronger relief leans further, and no facet is steeper than the cap allows', () => {

	const h = height( 32, 32, ( x ) => x < 16 ? x / 16 : ( 32 - x ) / 16 );
	const weak = normals.R_NormalsFromCraftedHeight( h, 32, 32, 0.5 );
	const strong = normals.R_NormalsFromCraftedHeight( h, 32, 32, 4 );
	const i = ( 8 * 32 + 6 ) * 4;
	assertEqual( strong[ i ] < weak[ i ], true, 'steeper with more strength' );

	// unit length, and z never below the cap (about 0.6)
	for ( let p = 0; p < 32 * 32; p ++ ) {

		const nx = strong[ p * 4 ] / 255 * 2 - 1, ny = strong[ p * 4 + 1 ] / 255 * 2 - 1, nz = strong[ p * 4 + 2 ] / 255 * 2 - 1;
		if ( Math.abs( Math.sqrt( nx * nx + ny * ny + nz * nz ) - 1 ) > 0.02 ) throw new Error( 'not unit length' );
		if ( nz < 0.5 ) throw new Error( 'steeper than the cap: ' + nz );

	}

} );

Deno.test( 'the crafted height map wraps, because textures tile', () => {

	const h = height( 16, 16, ( x ) => x === 0 ? 1 : 0 );
	const out = normals.R_NormalsFromCraftedHeight( h, 16, 16, 1.2 );
	// the last column is next to the ridge on the first (height rises towards it): it leans away, to the left, like the columns further in do not
	assertEqual( out[ ( 8 * 16 + 15 ) * 4 ] < 128, true, 'the last column leans left, away from the ridge that wraps round' );
	assertEqual( out[ ( 8 * 16 + 1 ) * 4 ] > 128, true, 'and the second column leans right, away from it' );

} );
