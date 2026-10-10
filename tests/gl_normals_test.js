import * as normals from '../src/newer/render/gl_normals.js';

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

function assertNear( actual, expected, epsilon, message ) {

	if ( Number.isFinite( actual ) !== true || Math.abs( actual - expected ) > epsilon )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

function texels( width, height, fn ) {

	const data = new Uint8Array( width * height * 4 );
	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < width; x ++ ) {

			const v = fn( x, y );
			data.set( [ v, v, v, 255 ], ( y * width + x ) * 4 );

		}

	}

	return data;

}

Deno.test( 'a flat texture gives flat normals', () => {

	const out = normals.R_GenerateNormalData( texels( 32, 32, () => 120 ), 32, 32, null );

	for ( let i = 0; i < 32 * 32; i ++ ) {

		assertNear( out[ i * 4 ], 128, 2, 'x' );
		assertNear( out[ i * 4 + 1 ], 128, 2, 'y' );
		assertEqual( out[ i * 4 + 2 ] >= 250, true, 'z points out of the surface' );

	}

} );

Deno.test( 'normals tilt away from rising height, in texture-coordinate space', () => {

	// brightness rises to the right (+u): the surface slopes up towards +u, so
	// its normal leans towards -u
	const w = 64;
	const ramp = texels( w, w, ( x ) => 40 + ( x < w / 2 ? x : w - x ) * 3 );
	const out = normals.R_GenerateNormalData( ramp, w, w, null );

	const rising = ( 12 * w + 16 ) * 4; // in the rising half
	const falling = ( 12 * w + 48 ) * 4; // in the falling half
	assertEqual( out[ rising ] < 128, true, 'leans towards -u on a rising slope' );
	assertEqual( out[ falling ] > 128, true, 'leans towards +u on a falling slope' );
	assertNear( out[ rising + 1 ], 128, 3, 'no lean in v where nothing changes in v' );

	// and the same idea down the rows (v)
	const rampV = texels( w, w, ( x, y ) => 40 + ( y < w / 2 ? y : w - y ) * 3 );
	const outV = normals.R_GenerateNormalData( rampV, w, w, null );
	assertEqual( outV[ ( 16 * w + 12 ) * 4 + 1 ] < 128, true, 'leans towards -v on a rising slope' );

} );

Deno.test( 'normals are unit length and height fills the alpha range', () => {

	const noisy = texels( 64, 64, ( x, y ) => ( ( x * 37 + y * 91 ) ^ ( x * y ) ) & 255 );
	const out = normals.R_GenerateNormalData( noisy, 64, 64, null );

	let lo = 255, hi = 0;
	for ( let i = 0; i < 64 * 64; i ++ ) {

		const nx = out[ i * 4 ] / 255 * 2 - 1, ny = out[ i * 4 + 1 ] / 255 * 2 - 1, nz = out[ i * 4 + 2 ] / 255 * 2 - 1;
		assertNear( Math.hypot( nx, ny, nz ), 1, 0.03, 'unit length' );
		lo = Math.min( lo, out[ i * 4 + 3 ] );
		hi = Math.max( hi, out[ i * 4 + 3 ] );

	}

	assertEqual( lo, 0, 'lowest height' );
	assertEqual( hi, 255, 'highest height' );

} );

Deno.test( 'the result tiles: a feature on one edge shapes the opposite edge', () => {

	const w = 32;
	// a bright dot at the left edge: its slope must show up on the right edge too
	const dot = texels( w, w, ( x, y ) => ( x === 0 && y === 16 ) ? 255 : 60 );
	const out = normals.R_GenerateNormalData( dot, w, w, null );

	const rightEdge = ( 16 * w + ( w - 1 ) ) * 4;
	assertEqual( out[ rightEdge ] !== out[ ( 16 * w + 12 ) * 4 ], true, 'wraps across the edge' );

} );

Deno.test( 'fullbright texels count towards the height', () => {

	const w = 16;
	const base = texels( w, w, () => 0 ); // the base texture has them blacked out
	const fb = new Uint8Array( w * w * 4 );
	fb.set( [ 255, 255, 255, 255 ], ( 8 * w + 8 ) * 4 );

	const withFb = normals.R_HeightFromRGBA( base, w, w, fb );
	const without = normals.R_HeightFromRGBA( base, w, w, null );

	assertEqual( withFb[ 8 * w + 8 ] > withFb[ 0 ], true, 'glowing texel is high' );
	assertEqual( without[ 8 * w + 8 ], without[ 0 ], 'nothing stands out without it' );

} );
