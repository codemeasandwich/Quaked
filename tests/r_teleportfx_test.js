import * as fx from '../src/newer/render/r_teleportfx.js';

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

function assertTrue( value, message ) {

	if ( value !== true ) throw new Error( message );

}

Deno.test( 'the picture stretches while the level changes, then snaps back', () => {

	fx.R_TeleportFxReset();
	assertEqual( fx.R_TeleportFxActive(), false, 'idle at first' );
	assertEqual( fx.R_TeleportFx( 10 ).stretch, 0, 'no stretch when idle' );

	fx.R_TeleportFxBegin( 10 );
	const early = fx.R_TeleportFx( 10.05 );
	const late = fx.R_TeleportFx( 10.3 );
	assertTrue( early.stretch > 0 && early.stretch < late.stretch, 'the stretch grows' );
	assertTrue( late.chroma > early.chroma, 'so does the colour split' );

	// it stays stretched for as long as the level takes to load
	assertEqual( fx.R_TeleportFx( 15 ).stretch, 1, 'held at full stretch while loading' );

	// the new level: back in place at once, the colours die away
	fx.R_TeleportFxSnap();
	const first = fx.R_TeleportFx( 16 );
	assertEqual( first.stretch, 0, 'snapped back' );
	assertTrue( first.chroma > 0.9, 'colours still split on the first picture' );
	assertTrue( fx.R_TeleportFx( 16.1 ).chroma < first.chroma, 'and fading' );
	assertEqual( fx.R_TeleportFx( 17 ).chroma, 0, 'gone' );
	assertEqual( fx.R_TeleportFxActive(), false, 'idle again' );

} );

Deno.test( 'a snap without a teleport does nothing', () => {

	fx.R_TeleportFxReset();
	fx.R_TeleportFxSnap();
	assertEqual( fx.R_TeleportFx( 1 ).chroma, 0, 'nothing' );

} );
