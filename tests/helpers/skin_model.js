/**
 * @module tests/helpers/skin_model
 * A minimal valid Quake MDL: three vertices, one triangle, one frame and a 2x2 skin.
 */

/**
 * @param {number} flags native model flags
 * @param {boolean} grouped whether to encode two identical animated skins
 * @returns {ArrayBuffer} independent MDL bytes
 */
export function skinModel( flags = 0, grouped = false ) {

	const buffer = new ArrayBuffer( 84 + ( grouped ? 24 : 8 ) + 36 + 16 + 40 );
	const v = new DataView( buffer );
	const i = ( p, n ) => v.setInt32( p, n, true );
	i( 0, 0x4f504449 ); i( 4, 6 );
	for ( const p of [ 8, 12, 16 ] ) v.setFloat32( p, 1, true );
	i( 48, 1 ); i( 52, 2 ); i( 56, 2 ); i( 60, 3 ); i( 64, 1 ); i( 68, 1 ); i( 76, flags );
	let p = 84; i( p, grouped ? 1 : 0 ); p += 4;
	if ( grouped ) { i( p, 2 ); p += 4; v.setFloat32( p, 0.1, true ); v.setFloat32( p + 4, 0.2, true ); p += 8; }
	for ( let n = 0; n < ( grouped ? 2 : 1 ); n ++ ) { new Uint8Array( buffer, p, 4 ).set( [ 0, 1, 2, 3 ] ); p += 4; }
	// UVs and triangle, then the single frame's bounding box and compressed positions.
	i( p + 16, 1 ); i( p + 32, 1 ); p += 36;
	i( p, 1 ); i( p + 4, 0 ); i( p + 8, 1 ); i( p + 12, 2 ); p += 16;
	i( p, 0 ); p += 4;
	new Uint8Array( buffer, p + 4, 4 ).set( [ 1, 1, 0, 0 ] );
	new Uint8Array( buffer, p + 24, 12 ).set( [ 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0 ] );
	return buffer;

}
