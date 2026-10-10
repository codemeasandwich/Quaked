import * as flashlight from '../src/newer/render/r_flashlight.js';
import { R_AnimSetLighting } from '../src/newer/mode.js';

function assertNear( actual, expected, epsilon, message ) {

	if ( Number.isFinite( actual ) !== true || Math.abs( actual - expected ) > epsilon )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

// the clock the flashlight reads
function withClock( fn ) {

	const real = performance.now;
	let t = 1000;
	performance.now = () => t;
	try {

		fn( ( seconds ) => {

			t += seconds * 1000;

		} );

	} finally {

		performance.now = real;

	}

}

Deno.test( 'the flashlight beam trails the view and settles', () => {

	R_AnimSetLighting( true );
	flashlight.r_flashlight.value = 1;

	withClock( ( advance ) => {

		const origin = [ 0, 0, 0 ], right = [ 0, - 1, 0 ], up = [ 0, 0, 1 ];

		// looking along +x: the beam starts there
		advance( 0.016 );
		flashlight.R_FlashlightUpdate( origin, [ 1, 0, 0 ], right, up );
		advance( 0.016 );
		flashlight.R_FlashlightUpdate( origin, [ 1, 0, 0 ], right, up );
		const beam = flashlight.R_FlashlightBeam();
		if ( beam.on !== true ) throw new Error( 'on' );
		assertNear( beam.dir[ 0 ], 1, 1e-6, 'starts along the view' );

		// the view snaps a quarter turn to +y: one frame later the beam has barely moved
		advance( 0.016 );
		flashlight.R_FlashlightUpdate( origin, [ 0, 1, 0 ], right, up );
		if ( beam.dir[ 0 ] < 0.8 ) throw new Error( 'the beam should trail, not snap: ' + beam.dir );

		// it catches up over about a tenth of a second and then sits on the view
		for ( let i = 0; i < 12; i ++ ) {

			advance( 0.016 );
			flashlight.R_FlashlightUpdate( origin, [ 0, 1, 0 ], right, up );

		}

		if ( beam.dir[ 1 ] < 0.85 ) throw new Error( 'the beam should have mostly caught up: ' + beam.dir );

		for ( let i = 0; i < 80; i ++ ) {

			advance( 0.016 );
			flashlight.R_FlashlightUpdate( origin, [ 0, 1, 0 ], right, up );

		}

		assertNear( beam.dir[ 1 ], 1, 1e-3, 'settled on the view' );
		assertNear( Math.hypot( beam.dir[ 0 ], beam.dir[ 1 ], beam.dir[ 2 ] ), 1, 1e-6, 'unit length' );

		// it sits on the right shoulder, behind and below the eye
		assertNear( beam.pos[ 1 ], - 15 + 4, 1e-6, 'shoulder (right of the view, a little forward)' );
		assertNear( beam.pos[ 2 ], - 9, 1e-6, 'below the eye' );

	} );

	flashlight.r_flashlight.value = 0;

} );

Deno.test( 'the flashlight is off without the Newer lighting', () => {

	flashlight.r_flashlight.value = 1;
	R_AnimSetLighting( false );
	flashlight.R_FlashlightUpdate( [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, - 1, 0 ], [ 0, 0, 1 ] );
	if ( flashlight.R_FlashlightBeam().on !== false ) throw new Error( 'off' );
	flashlight.r_flashlight.value = 0;

} );

Deno.test( 'the muzzle flash is dimmed in a lit room and full in the dark', async () => {

	const m = await import( '../src/newer/render/r_muzzle.js' );
	m.R_MuzzleSetView( [ 0, 0, 0 ] );

	m.R_MuzzleSetProbe( () => 10 ); // dark
	if ( m.R_MuzzleFlashScale() !== 1 ) throw new Error( 'full in the dark' );

	m.R_MuzzleSetProbe( () => 80 ); // medium
	const medium = m.R_MuzzleFlashScale();
	m.R_MuzzleSetProbe( () => 200 ); // bright
	const bright = m.R_MuzzleFlashScale();

	if ( ! ( medium < 1 && medium > bright ) ) throw new Error( 'dimmer as it gets brighter: ' + medium + ' ' + bright );
	if ( bright > 0.3 || bright < 0.2 ) throw new Error( 'a fraction in a bright room: ' + bright );

} );
