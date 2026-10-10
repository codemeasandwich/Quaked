// mathlib.js's error path (card [44m], items 3 and 9): BoxOnPlaneSide with a plane whose signbits are outside 0..7 is
// the Sys_Error WinQuake raises, "BoxOnPlaneSide: Bad signbits". Before, mathlib.js called Sys_Error without
// importing it, so the error was a ReferenceError naming Sys_Error instead. Q_log2, which no code called and which
// never returned for a negative value, is gone.
import * as mathlib from '../src/engine/common/mathlib.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const plane = signbits => ( { normal: [ .6, .8, 0 ], dist: 0, type: 3, signbits } );

Deno.test( 'BoxOnPlaneSide: a bad signbits is the WinQuake Sys_Error; good ones answer as before', () => {
	let error = null;
	try { mathlib.BoxOnPlaneSide( [ - 1, - 1, - 1 ], [ 1, 1, 1 ], plane( 8 ) ); } catch ( e ) { error = e; }
	check( error && ! ( error instanceof ReferenceError ), 'not a ReferenceError: ' + error );
	check( /BoxOnPlaneSide: Bad signbits/.test( error.message ), 'the Sys_Error\'s own message: ' + error.message );
	check( mathlib.BoxOnPlaneSide( [ 1, 1, - 1 ], [ 2, 2, 1 ], plane( 0 ) ) === 1, 'a box in front' );
	check( mathlib.BoxOnPlaneSide( [ - 2, - 2, - 1 ], [ - 1, - 1, 1 ], plane( 3 ) ) === 2, 'a box behind' );
	check( mathlib.BoxOnPlaneSide( [ - 1, - 1, - 1 ], [ 1, 1, 1 ], plane( 0 ) ) === 3, 'a box across' );
	check( mathlib.Q_log2 === undefined, 'Q_log2 is no longer exported' );
} );
