import { R_DecalSurface } from '../src/r_decals.js';

function assertNear( actual, expected, epsilon, message ) {

	if ( Number.isFinite( actual ) !== true || Math.abs( actual - expected ) > epsilon )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

// a floor (z = 0, normal up) 128 units square, and a wall (x = 64, normal -x, a back face)
function level() {

	const floor = {
		flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 },
		texinfo: { vecs: [ [ 1, 0, 0, 0 ], [ 0, 1, 0, 0 ] ] },
		texturemins: [ - 64, - 64 ], extents: [ 128, 128 ]
	};
	const wall = {
		flags: 2, // the plane's back is the visible side
		plane: { normal: [ 1, 0, 0 ], dist: 64 },
		texinfo: { vecs: [ [ 0, 1, 0, 0 ], [ 0, 0, 1, 0 ] ] },
		texturemins: [ - 64, 0 ], extents: [ 128, 128 ]
	};
	const sky = { ...floor, flags: 4, plane: { normal: [ 0, 0, - 1 ], dist: 100 } };
	const leaf = { contents: - 1, firstmarksurface: [ floor, wall, sky ], nummarksurfaces: 3 };
	return { model: { leafs: [ leaf ] }, leaf, floor, wall, sky };

}

const inLeaf = ( l ) => () => l;

Deno.test( 'a point just above a floor finds the floor', () => {

	const { model, leaf, floor } = level();
	const hit = R_DecalSurface( model, [ 10, 20, 3 ], 12, inLeaf( leaf ) );
	if ( hit === null || hit.surf !== floor ) throw new Error( 'expected the floor' );
	assertNear( hit.dist, 3, 1e-6, 'distance' );
	assertNear( hit.nz, 1, 1e-6, 'normal up' );
	assertNear( hit.pz, 0, 1e-6, 'on the surface' );
	assertNear( hit.px, 10, 1e-6, 'straight down' );
	assertNear( hit.room, 44, 1e-6, 'room to the nearest edge (64 - 20)' );

} );

Deno.test( 'a wall seen from its back face points into the room', () => {

	const { model, leaf, wall } = level();
	const hit = R_DecalSurface( model, [ 60, 0, 40 ], 12, inLeaf( leaf ) );
	if ( hit === null || hit.surf !== wall ) throw new Error( 'expected the wall' );
	assertNear( hit.nx, - 1, 1e-6, 'normal faces -x, into the room' );
	assertNear( hit.dist, 4, 1e-6, 'four units off the wall' );
	assertNear( hit.px, 64, 1e-6, 'on the wall' );

} );

Deno.test( 'nothing is found too far away, off the surface, behind it, on sky or in solid', () => {

	const { model, leaf } = level();
	if ( R_DecalSurface( model, [ 0, 0, 30 ], 12, inLeaf( leaf ) ) !== null ) throw new Error( 'too far' );
	if ( R_DecalSurface( model, [ 200, 0, 3 ], 12, inLeaf( leaf ) ) !== null ) throw new Error( 'off the floor' );
	if ( R_DecalSurface( model, [ 0, 0, - 3 ], 12, inLeaf( leaf ) ) !== null ) throw new Error( 'behind the floor' );
	if ( R_DecalSurface( model, [ 0, 0, 99 ], 12, inLeaf( leaf ) ) !== null ) throw new Error( 'sky takes no marks' );
	if ( R_DecalSurface( model, [ 0, 0, 3 ], 12, inLeaf( { ...leaf, contents: - 2 } ) ) !== null ) throw new Error( 'in solid' );

} );

Deno.test( 'the nearer of two surfaces wins in a corner', () => {

	const { model, leaf, wall } = level();
	const hit = R_DecalSurface( model, [ 62, 0, 4 ], 12, inLeaf( leaf ) );
	// 2 from the wall, 4 from the floor
	if ( hit === null || hit.surf !== wall ) throw new Error( 'expected the wall' );

} );
