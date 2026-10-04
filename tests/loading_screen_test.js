// First-load logo screen: index.html's inlined logo stays identical to logo.svg,
// its crop holds all of the artwork, and the public progress/remove calls drive
// the fill rectangle through a minimal DOM double.
import { LoadingScreen_SetProgress, LoadingScreen_Remove } from '../src/loading_screen.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const near = ( a, b, message ) => check( Math.abs( a - b ) < 1e-9, `${message}: ${a} != ${b}` );
const paths = text => [ ...text.matchAll( /<path\b[^>]*?\sd="([^"]+)"/gs ) ].map( m => m[ 1 ] );
const html = await Deno.readTextFile( 'index.html' );
const logo = await Deno.readTextFile( 'logo.svg' );
const viewBox = /id="loading-logo" viewBox="([^"]+)"/.exec( html )[ 1 ].split( ' ' ).map( Number );

function page() {

	const attrs = { fill: {}, loading: {} };
	let removed = false;
	const node = key => ( { setAttribute: ( k, v ) => { attrs[ key ][ k ] = v; }, remove: () => { removed = true; } } );
	const nodes = {
		'loading-logo': { viewBox: { baseVal: { x: viewBox[ 0 ], y: viewBox[ 1 ], width: viewBox[ 2 ], height: viewBox[ 3 ] } } },
		'loading-fill': node( 'fill' ), loading: node( 'loading' ),
	};
	return { attrs, removed: () => removed, doc: { getElementById: id => removed && id === 'loading' ? null : nodes[ id ] || null } };

}

Deno.test( 'index.html carries logo.svg unchanged, cropped to the artwork', () => {

	const embedded = paths( html ), source = paths( logo );
	check( source.length === 6 && embedded.length === source.length, `six logo paths: ${source.length} / ${embedded.length}` );
	check( embedded.every( ( d, i ) => d === source[ i ] ), 'embedded paths match logo.svg exactly, in order' );
	// Artwork bounds measured in Chrome (getBBox): x 13.73–160.43, y 118.06–148.57.
	const [ x, y, w, h ] = viewBox;
	check( x <= 13.73 && y <= 118.06 && x + w >= 160.43 && y + h >= 148.57, 'crop holds the whole logo: ' + viewBox );
	check( w < 160 && h < 40, 'crop is tight, not the 194-unit Inkscape page' );
	check( ! /loading-bar|loading-progress/.test( html ), 'the old bar is gone' );
	check( /<rect id="loading-fill" x="12.73" y="149.57" width="148.7" height="0"/.test( html ), 'the fill starts empty at the bottom' );

} );

Deno.test( 'progress fills the logo from the bottom up and reports it', () => {

	const { attrs, doc } = page(), [ , y, , h ] = viewBox;
	for ( const v of [ 0, 0.25, 0.5, 1 ] ) {

		LoadingScreen_SetProgress( v, doc );
		near( Number( attrs.fill.height ), h * v, 'height at ' + v );
		near( Number( attrs.fill.y ) + Number( attrs.fill.height ), y + h, 'anchored to the bottom at ' + v );
		check( attrs.loading[ 'aria-valuenow' ] === String( Math.round( v * 100 ) ), 'aria-valuenow at ' + v );

	}
	for ( const [ v, expected ] of [ [ - 1, 0 ], [ 1.4, 1 ], [ NaN, 0 ], [ undefined, 0 ] ] ) {

		LoadingScreen_SetProgress( v, doc );
		near( Number( attrs.fill.height ), h * expected, `clamped ${v}` );

	}

} );

Deno.test( 'removing the screen, and pages without the logo, are safe', () => {

	const p = page();
	LoadingScreen_Remove( p.doc );
	check( p.removed(), 'loading overlay removed' );
	LoadingScreen_Remove( p.doc ); // already gone
	LoadingScreen_SetProgress( 0.5, { getElementById: () => null } ); // trial pages keep their own bar
	LoadingScreen_SetProgress( 0.5, undefined );

} );

Deno.test( 'main.js drives pak progress, then reveals a real startup console only after the frame and conback are ready', async () => {

	const main = await Deno.readTextFile( 'main.js' );
	check( /COM_FetchPak\( 'pak0\.pak', 'pak0\.pak', value => LoadingScreen_SetProgress\( value \) \)/.test( main ), 'pak0 progress feeds the logo' );
	check( main.indexOf( 'R_DemoLoadingAppReady()' ) > main.indexOf( "await Draw_LoadConbackImage( 'conback.webp' )" ), 'console wallpaper ready or native fallback before app-ready' );
	check( main.indexOf( 'R_DemoLoadingSplash(()=>LoadingScreen_FadeOut())' ) > main.indexOf( 'else Host_Frame( time )' ), 'fade requested only after actual startup console frame' );
	check( main.indexOf( 'R_DemoLoadingBoot();' ) < main.lastIndexOf( 'main();' ), 'first-entry scope armed before boot' );
	check( main.includes( "startup.phase==='done'&&!startup.fadeStarted" ), 'cancelled manual/network entry removes overlay without borrowing demo loading' );

} );
