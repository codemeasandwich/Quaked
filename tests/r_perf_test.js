import * as perf from '../src/newer/render/r_perf.js';

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

Deno.test( 'the frame counter averages half a second of frames', () => {

	// 60 frames a second for a second
	for ( let i = 0; i <= 60; i ++ ) perf.R_PerfFrameBegin( 100 + i / 60 );
	const text = perf.R_PerfFpsText();
	assertEqual( /^60 fps  16\.[67] ms/.test( text ), true, 'about 60 fps at about 16.7 ms: ' + text );

	perf.R_PerfSetScale( 0.72 );
	assertEqual( perf.R_PerfFpsText().slice( - 3 ), '72%', 'the resolution scale is shown when below full' );

	perf.R_PerfSetScale( 1 );
	assertEqual( perf.R_PerfFpsText().indexOf( '%' ), - 1, 'and not at full resolution' );

} );

Deno.test( 'stage marks and the profiler do nothing while not profiling', () => {

	perf.R_PerfStage( 'anything' );
	perf.R_PerfFrameEnd();
	assertEqual( perf.R_PerfProfiling(), false, 'not profiling' );
	assertEqual( perf.R_PerfStatus(), null, 'no status' );

} );
