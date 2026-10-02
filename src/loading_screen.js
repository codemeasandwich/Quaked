// The first-load screen in index.html: the Quaked logo (logo.svg, inlined so it
// shows before any script or fetch) sits dim in the centre of a black page and
// fills with white from the bottom up as pak0.pak downloads. The fill is a
// clip rectangle over a second copy of the logo, sized in the logo's own
// viewBox units, so it follows the letter shapes exactly.

// Fraction 0..1 of the logo that is filled. Out-of-range or non-numeric values
// are clamped (a missing content-length never reports, a compressed one can
// overshoot), and pages without the logo (trial pages) are left alone.
export function LoadingScreen_SetProgress( value, doc = globalThis.document ) {

	const logo = doc?.getElementById( 'loading-logo' );
	const fill = doc?.getElementById( 'loading-fill' );
	if ( ! logo || ! fill ) return;
	const v = Number.isFinite( value ) ? Math.min( 1, Math.max( 0, value ) ) : 0;
	const box = logo.viewBox.baseVal;
	fill.setAttribute( 'y', String( box.y + box.height * ( 1 - v ) ) );
	fill.setAttribute( 'height', String( box.height * v ) );
	doc.getElementById( 'loading' )?.setAttribute( 'aria-valuenow', String( Math.round( v * 100 ) ) );

}

export function LoadingScreen_Remove( doc = globalThis.document ) {

	doc?.getElementById( 'loading' )?.remove();

}
