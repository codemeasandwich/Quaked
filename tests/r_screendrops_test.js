import * as drops from '../src/r_screendrops.js';

function withClock( fn ) {

	const real = performance.now;
	let t = 5000;
	performance.now = () => t;
	try {

		fn( ( seconds ) => {

			t += seconds * 1000;

		} );

	} finally {

		performance.now = real;

	}

}

Deno.test( 'coming out of water wets the view, and it dries', () => {

	withClock( ( advance ) => {

		drops.R_ScreenDropsClear();
		drops.R_ScreenDropsUpdate();

		// in the air, then in water: nothing yet
		drops.R_ScreenDropsView( - 1 );
		drops.R_ScreenDropsView( - 3 );
		advance( 0.05 );
		if ( drops.R_ScreenDropsUpdate().density !== 0 ) throw new Error( 'in the water is not wet drops' );

		// out again: soaked
		drops.R_ScreenDropsView( - 1 );
		advance( 0.05 );
		const wet = { ...drops.R_ScreenDropsUpdate() };
		if ( wet.density < 0.9 ) throw new Error( 'soaked on leaving the water: ' + wet.density );
		if ( wet.blood !== 0 ) throw new Error( 'water is not blood' );

		// dries over several seconds, and the drops have been running
		for ( let i = 0; i < 40; i ++ ) {

			advance( 0.1 );
			drops.R_ScreenDropsUpdate();

		}

		advance( 0.1 );
		const later = drops.R_ScreenDropsUpdate();
		if ( later.density >= wet.density || later.density <= 0 ) throw new Error( 'partly dry after four seconds: ' + later.density );
		if ( later.age < 3.9 ) throw new Error( 'the drops have been running for about four seconds: ' + later.age );

		for ( let i = 0; i < 100; i ++ ) {

			advance( 0.1 );
			drops.R_ScreenDropsUpdate();

		}

		if ( drops.R_ScreenDropsUpdate().density !== 0 ) throw new Error( 'dry in the end' );

	} );

} );

Deno.test( 'blood on the lens depends on how near and how big the burst was', () => {

	withClock( ( advance ) => {

		drops.R_ScreenDropsClear();
		drops.R_ScreenDropsSetView( [ 0, 0, 0 ] );
		drops.R_ScreenDropsUpdate();

		drops.R_ScreenDropsBloodAt( [ 400, 0, 0 ], 100 ); // too far
		advance( 0.05 );
		if ( drops.R_ScreenDropsUpdate().density !== 0 ) throw new Error( 'far away: nothing' );

		drops.R_ScreenDropsBloodAt( [ 150, 0, 0 ], 10 );
		advance( 0.05 );
		const small = drops.R_ScreenDropsUpdate().density;

		drops.R_ScreenDropsClear();
		drops.R_ScreenDropsBloodAt( [ 40, 0, 0 ], 100 ); // right beside, a gib
		advance( 0.05 );
		const close = drops.R_ScreenDropsUpdate();

		if ( close.density <= small ) throw new Error( 'closer and bigger is more' );
		if ( close.density < 0.8 ) throw new Error( 'a gib beside you soaks the view: ' + close.density );
		if ( close.blood < 0.99 ) throw new Error( 'and it is blood' );

	} );

} );
