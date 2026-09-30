import { R_CrateSetSeed, R_CratePlan, R_IsCrateSide, CRATE_BOXES, CRATE_ODDS, CRATE_COMMON } from '../src/r_cratevariants.js';

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

// the four sides of a crate standing at (x, y): 64 wide
function crate( x, y ) {

	const z0 = 0, z1 = 64;
	return [
		{ mins: [ x, y, z0 ], maxs: [ x, y + 64, z1 ], normal: [ - 1, 0, 0 ] },
		{ mins: [ x + 64, y, z0 ], maxs: [ x + 64, y + 64, z1 ], normal: [ 1, 0, 0 ] },
		{ mins: [ x, y, z0 ], maxs: [ x + 64, y, z1 ], normal: [ 0, - 1, 0 ] },
		{ mins: [ x, y + 64, z0 ], maxs: [ x + 64, y + 64, z1 ], normal: [ 0, 1, 0 ] }
	];

}

R_CrateSetSeed( 12345 );

Deno.test( 'a different seed makes different crates change', () => {

	const faces = crate( 0, 0 );
	let differs = 0;
	for ( let i = 0; i < 400; i ++ ) {

		R_CrateSetSeed( i );
		const a = JSON.stringify( R_CratePlan( 'e1m1', faces, 2, [] ) );
		R_CrateSetSeed( i + 1000 );
		if ( a !== JSON.stringify( R_CratePlan( 'e1m1', faces, 2, [] ) ) ) differs ++;

	}

	R_CrateSetSeed( 12345 );
	assertEqual( differs > 50, true, 'seeds differ: ' + differs );

} );

Deno.test( 'crate sides are told by name', () => {

	assertEqual( R_IsCrateSide( 'crate0_side' ), true, 'side 0' );
	assertEqual( R_IsCrateSide( 'crate1_side' ), true, 'side 1' );
	assertEqual( R_IsCrateSide( 'crate0_top' ), false, 'top' );
	assertEqual( R_IsCrateSide( 'city1_4' ), false, 'other' );

} );

Deno.test( 'about one crate in 40 changes, all its faces use the same box, opposite faces differ', () => {

	let changed = 0;
	const total = 4000;

	for ( let i = 0; i < total; i ++ ) {

		const faces = crate( i * 200, ( i % 7 ) * 300 );
		const plan = R_CratePlan( 'e1m1', faces, CRATE_ODDS, [] );

		const names = plan.filter( ( p ) => p !== null );
		if ( names.length === 0 ) continue;

		changed ++;
		assertEqual( names.length, 4, 'all four faces of a changed crate change' );
		const box = CRATE_BOXES.find( ( b ) => b.includes( names[ 0 ] ) );
		for ( const n of names ) assertEqual( box.includes( n ), true, 'one box per crate' );
		assertEqual( plan[ 0 ] !== plan[ 1 ], true, 'the two ends differ' );
		assertEqual( plan[ 2 ] !== plan[ 3 ], true, 'the two sides differ' );

	}

	// 1 in 40 of 4000 is 100: well inside a sane range
	assertEqual( changed > 60 && changed < 150, true, 'about 1 in ' + CRATE_ODDS + ': ' + changed + ' of ' + total );

} );

Deno.test( 'both boxes turn up, and the choice is the same every time', () => {

	const seen = new Set();
	for ( let i = 0; i < 3000; i ++ ) {

		const plan = R_CratePlan( 'e1m2', crate( i * 130, 0 ), CRATE_ODDS, [] );
		for ( const p of plan ) if ( p !== null ) seen.add( p );
		assertEqual( JSON.stringify( plan ), JSON.stringify( R_CratePlan( 'e1m2', crate( i * 130, 0 ), CRATE_ODDS, [] ) ), 'stable' );

	}

	assertEqual( seen.size, 4, 'all four pictures are used' );

} );

Deno.test( 'crates that touch are one crate; a level name changes the roll', () => {

	// two faces that touch share the outcome, however they are listed
	const a = { mins: [ 0, 0, 0 ], maxs: [ 0, 64, 64 ], normal: [ - 1, 0, 0 ] };
	const b = { mins: [ 0, 64, 0 ], maxs: [ 64, 64, 64 ], normal: [ 0, 1, 0 ] };
	for ( let i = 0; i < 400; i ++ ) {

		const shift = ( f ) => ( { mins: f.mins.map( ( v ) => v + i * 97 ), maxs: f.maxs.map( ( v ) => v + i * 97 ), normal: f.normal } );
		const plan = R_CratePlan( 'start', [ shift( a ), shift( b ) ], CRATE_ODDS, [] );
		assertEqual( ( plan[ 0 ] === null ) === ( plan[ 1 ] === null ), true, 'touching faces change together' );

	}

	let differs = 0;
	for ( let i = 0; i < 2000; i ++ ) {

		const f = crate( i * 150, 0 );
		if ( JSON.stringify( R_CratePlan( 'e1m1', f, CRATE_ODDS, [] ) ) !== JSON.stringify( R_CratePlan( 'e1m3', f, CRATE_ODDS, [] ) ) ) differs ++;

	}

	assertEqual( differs > 50, true, 'another level rolls differently' );

} );

Deno.test( 'a crate with a face that is not one whole picture keeps its ordinary picture', () => {

	const faces = crate( 0, 0 );
	faces[ 2 ].whole = false;
	assertEqual( R_CratePlan( 'e1m1', faces, 1, [] ).every( ( p ) => p === null ), true, 'nothing changes' );

	const good = crate( 0, 0 ).map( ( f ) => ( { ...f, whole: true } ) );
	assertEqual( R_CratePlan( 'e1m1', good, 1, [] ).every( ( p ) => p !== null ), true, 'whole pictures change' );

	// a broken crate does not hold back one that is apart from it
	const two = [ ...crate( 0, 0 ).map( ( f ) => ( { ...f, whole: false } ) ), ...crate( 500, 0 ).map( ( f ) => ( { ...f, whole: true } ) ) ];
	const plan = R_CratePlan( 'e1m1', two, 1, [] );
	assertEqual( plan.slice( 0, 4 ).every( ( p ) => p === null ), true, 'first crate unchanged' );
	assertEqual( plan.slice( 4 ).every( ( p ) => p !== null ), true, 'second crate changes' );

} );

Deno.test( 'ordinary crates take the common pictures, all four sides alike, in about the share expected', () => {

	const count = { none: 0 };
	for ( const c of CRATE_COMMON ) count[ c ] = 0;
	const total = 4000;

	for ( let i = 0; i < total; i ++ ) {

		const plan = R_CratePlan( 'e1m1', crate( i * 170, ( i % 5 ) * 200 ) );
		const names = plan.filter( ( p ) => p !== null );
		if ( names.length === 0 ) { count.none ++; continue; }
		if ( CRATE_COMMON.includes( names[ 0 ] ) ) {

			assertEqual( names.length, 4, 'all four sides' );
			assertEqual( names.every( ( n ) => n === names[ 0 ] ), true, 'all alike' );
			count[ names[ 0 ] ] ++;

		}

	}

	// one in four keeps its own, a quarter for each of the three others (less the rare ones)
	assertEqual( count.none > total * 0.2 && count.none < total * 0.3, true, 'own picture: ' + count.none );
	for ( const c of CRATE_COMMON ) assertEqual( count[ c ] > total * 0.2 && count[ c ] < total * 0.3, true, c + ': ' + count[ c ] );

} );

Deno.test( 'stacked and neighbouring crates are chosen one by one', () => {

	// three crates touching (two side by side, one on top): not all alike, over many levels
	let notAlike = 0;
	for ( let i = 0; i < 300; i ++ ) {

		const up = ( f ) => ( { ...f, mins: [ f.mins[ 0 ], f.mins[ 1 ], f.mins[ 2 ] + 64 ], maxs: [ f.maxs[ 0 ], f.maxs[ 1 ], f.maxs[ 2 ] + 64 ] } );
		const base = crate( i * 400, 0 );
		const faces = [ ...base, ...crate( i * 400 + 64, 0 ), ...base.map( up ) ];
		const plan = R_CratePlan( 'e1m1', faces );
		const names = [ plan[ 0 ], plan[ 4 ], plan[ 8 ] ];
		if ( new Set( names ).size > 1 ) notAlike ++;
		// each crate's own four faces are still alike
		for ( const g of [ 0, 4, 8 ] ) {

			const own = plan.slice( g, g + 4 ).filter( ( p ) => p !== null );
			if ( own.length > 0 ) assertEqual( own.length, 4, 'a crate changes on all four sides' );

		}

	}

	assertEqual( notAlike > 100, true, 'crates differ: ' + notAlike );

} );

Deno.test( 'with odds of 1 every crate changes', () => {

	const plan = R_CratePlan( 'e1m1', crate( 0, 0 ), 1, [] );
	assertEqual( plan.every( ( p ) => p !== null ), true, 'all changed' );

} );
