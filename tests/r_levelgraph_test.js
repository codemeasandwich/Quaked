import * as graph from '../src/r_levelgraph.js';

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

function assertNear( actual, expected, epsilon, message ) {

	if ( Number.isFinite( actual ) !== true || Math.abs( actual - expected ) > epsilon )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

function assertVec( actual, expected, message ) {

	for ( let i = 0; i < 3; i ++ ) assertNear( actual[ i ], expected[ i ], 1e-3, `${message}[${i}]` );

}

// read one file out of pak0.pak
async function pakFile( name ) {

	const pak = await Deno.readFile( new URL( '../pak0.pak', import.meta.url ) );
	const view = new DataView( pak.buffer, pak.byteOffset, pak.byteLength );
	const dirofs = view.getInt32( 4, true ), dirlen = view.getInt32( 8, true );

	for ( let i = 0; i < dirlen / 64; i ++ ) {

		const o = dirofs + i * 64;
		let n = '';
		for ( let k = 0; k < 56 && pak[ o + k ] !== 0; k ++ ) n += String.fromCharCode( pak[ o + k ] );
		if ( n === name ) return pak.subarray( view.getInt32( o + 56, true ), view.getInt32( o + 56, true ) + view.getInt32( o + 60, true ) );

	}

	throw new Error( 'not in pak: ' + name );

}

Deno.test( 'exit shapes: thin vertical slab, thin horizontal slab, or a pad', () => {

	assertEqual( graph.R_ClassifyExit( [ 0, 0, 0 ], [ 6, 246, 110 ] ).kind, 'plane', 'thin in x' );
	assertEqual( graph.R_ClassifyExit( [ 0, 0, 0 ], [ 6, 246, 110 ] ).axis, 0, 'axis x' );
	assertEqual( graph.R_ClassifyExit( [ 0, 0, 0 ], [ 246, 14, 62 ] ).axis, 1, 'axis y' );
	assertEqual( graph.R_ClassifyExit( [ 0, 0, 0 ], [ 126, 190, 6 ] ).kind, 'pit', 'thin in z' );
	assertEqual( graph.R_ClassifyExit( [ 0, 0, 0 ], [ 46, 46, 150 ] ).kind, 'pad', 'a fat box' );

} );

Deno.test( 'walking through a doorway carries position, velocity and facing to the start', () => {

	// an exit slab at x = 100 across a passage running along x; you walk in the +x direction
	const exit = { mins: [ 97, - 100, 0 ], maxs: [ 103, 100, 110 ] };
	const start = { origin: [ 5000, 2000, 88 ], yaw: 90 }; // the next level starts facing +y

	const side = - 1; // approached from the -x side
	const t = graph.R_CrossingTransform( exit, side, start, 0 );

	assertEqual( t.kind, 'plane', 'a doorway' );
	assertVec( t.through, [ 1, 0, 0 ], 'you walk through in +x' );

	// crossing the middle of the exit at floor level puts you exactly at the start
	assertVec( t.position( [ 100, 0, 24 ] ), [ 5000, 2000, 88 ], 'centre of the doorway is the start' );

	// walking on: +x becomes the way the start faces (+y); speed is unchanged
	assertVec( t.direction( [ 300, 0, 0 ] ), [ 0, 300, 0 ], 'velocity turns with you' );
	assertNear( t.angle( 0 ), 90, 1e-9, 'you face the way the start faces' );

	// a step to the side and a step on stay a step to the side and a step on
	const after = t.position( [ 110, 20, 24 ] ); // 10 past the doorway, 20 to the +y side
	assertVec( after, [ 5000 - 20, 2000 + 10, 88 ], 'offsets turn with the doorway' );

	// crossing detection
	assertEqual( t.crossed( [ 95, 0, 24 ], [ 105, 0, 24 ] ), true, 'through the opening' );
	assertEqual( t.crossed( [ 105, 0, 24 ], [ 95, 0, 24 ] ), false, 'the wrong way' );
	assertEqual( t.crossed( [ 95, 300, 24 ], [ 105, 300, 24 ] ), false, 'beside the opening' );
	assertEqual( t.crossed( [ 90, 0, 24 ], [ 96, 0, 24 ] ), false, 'not yet' );
	assertEqual( t.crossed( [ 95, 0, 900 ], [ 105, 0, 900 ] ), false, 'far above the opening' );

} );

Deno.test( 'falling through a pit keeps falling and keeps facing', () => {

	const exit = { mins: [ 0, 0, - 31 ], maxs: [ 126, 190, - 25 ] };
	const start = { origin: [ - 448, 64, 56 ], yaw: 0 };
	const t = graph.R_CrossingTransform( exit, 1, start, 0 );

	assertEqual( t.kind, 'pit', 'a pit' );
	assertVec( t.direction( [ 10, 20, - 500 ] ), [ 10, 20, - 500 ], 'velocity is untouched' );
	assertNear( t.angle( 123 ), 123, 1e-9, 'facing is untouched' );

	// it lands you above the start, offset the same way you were offset from the pit's middle
	const arrive = t.position( [ 63 + 5, 95 - 7, - 28 ] );
	assertNear( arrive[ 0 ], - 448 + 5, 1e-6, 'x' );
	assertNear( arrive[ 1 ], 64 - 7, 1e-6, 'y' );
	assertEqual( arrive[ 2 ] > 56, true, 'above the start' );

	assertEqual( t.crossed( [ 63, 95, - 10 ], [ 63, 95, - 40 ] ), true, 'falling in' );
	assertEqual( t.crossed( [ 63, 95, - 40 ], [ 63, 95, - 10 ] ), false, 'not rising out' );
	assertEqual( t.crossed( [ 500, 95, - 10 ], [ 500, 95, - 40 ] ), false, 'beside the pit' );

} );

Deno.test( 'pads are not doorways', () => {

	assertEqual( graph.R_CrossingTransform( { mins: [ 0, 0, 0 ], maxs: [ 46, 46, 150 ] }, 1, { origin: [ 0, 0, 0 ], yaw: 0 }, 0 ), null, 'no transform' );

} );

Deno.test( 'the approach side is the one with more room', () => {

	const exit = { mins: [ 97, - 100, 0 ], maxs: [ 103, 100, 110 ] };
	const open = ( c, d ) => d[ 0 ] > 0 ? 600 : 40; // open towards +x, a dead end towards -x
	assertEqual( graph.R_ChooseApproachSide( exit, open ), 1, 'walk up from +x' );
	assertEqual( graph.R_ChooseApproachSide( exit, ( c, d ) => d[ 0 ] > 0 ? 40 : 600 ), - 1, 'walk up from -x' );

} );

Deno.test( 'the real Episode 1 maps link up in a chain', async () => {

	const link = async ( m ) => graph.R_LevelLinks( graph.R_ParseBsp( await pakFile( `maps/${m}.bsp` ) ) );

	const chain = { e1m1: 'e1m2', e1m2: 'e1m3', e1m3: 'e1m4', e1m5: 'e1m6', e1m6: 'e1m7', e1m7: 'start', e1m8: 'e1m5' };
	for ( const [ from, to ] of Object.entries( chain ) ) {

		const l = await link( from );
		assertEqual( l.exits.some( e => e.map === to ), true, `${from} leads to ${to}` );

	}

	// e1m4 has the normal exit and the secret one
	const e1m4 = await link( 'e1m4' );
	assertEqual( e1m4.exits.map( e => e.map ).sort().join( ',' ), 'e1m5,e1m8', 'e1m4 has two exits' );

	// every level in the chain has a start to arrive at
	for ( const m of [ 'e1m1', 'e1m2', 'e1m3', 'e1m4', 'e1m5', 'e1m6', 'e1m7', 'e1m8', 'start' ] )
		assertEqual( ( await link( m ) ).start !== null, true, `${m} has a start` );

	// how the exits look: archways and passages are planes, e1m6's is a pit
	const shape = async ( m, to ) => ( await link( m ) ).exits.find( e => e.map === to ).kind;
	assertEqual( await shape( 'e1m2', 'e1m3' ), 'plane', 'e1m2 ends in a passage' );
	assertEqual( await shape( 'e1m3', 'e1m4' ), 'plane', 'e1m3 ends in a passage' );
	assertEqual( await shape( 'e1m5', 'e1m6' ), 'plane', 'e1m5 ends in a passage' );
	assertEqual( await shape( 'e1m6', 'e1m7' ), 'pit', 'e1m6 ends in a pit' );

} );
