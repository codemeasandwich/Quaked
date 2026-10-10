// Browser check behind docs/folio-replay-2026-10-10.md: the replay plate against the Grunt page image (playwright-core,
// game served at 127.0.0.1:8765). Output: docs/evidence/folio-plate-2026-10-10.txt
import { chromium } from 'playwright-core';
const b = await chromium.launch( { executablePath: '/Users/bri/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: true, args: [ '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist' ] } );
const page = await ( await b.newContext( { serviceWorkers: 'block' } ) ).newPage();
page.on( 'pageerror', e => console.log( '[pageerror]', String( e ).slice( 0, 300 ) ) );
await page.goto( 'http://127.0.0.1:8765/index.html?noautostart' ).catch( () => {} );
const r = await page.evaluate( async () => {
	const F = await import( '/src/r_folio.js' );
	const load = u => new Promise( ( ok, no ) => { const i = new Image(); i.onload = () => ok( i ); i.onerror = no; i.src = u; } );
	for ( let k = 0; k < 100 && F.R_FolioPrepare( 'grunt' ) !== 'ready'; k ++ ) await new Promise( r => setTimeout( r, 50 ) );
	const img = await load( '/newer/bestiary/grunt.png' ), rev = await load( '/newer/bestiary/folio/grunt.reveal.png' );
	const read = src => { const c = document.createElement( 'canvas' ); c.width = 1024; c.height = 1536; const x = c.getContext( '2d', { willReadFrequently: true } ); x.drawImage( src, 0, 0 ); return x.getImageData( 0, 0, 1024, 1536 ).data; };
	const image = read( img ), alpha = read( rev ), out = {};
	for ( const t of [ 0, 1 ] ) {
		const plate = read( F.R_FolioPlate( 'grunt', img, t ) );
		let own = 0, ownDiff = 0, all = 0, maxd = 0;
		for ( let i = 0; i < image.length; i += 4 ) { const d = Math.max( Math.abs( plate[ i ] - image[ i ] ), Math.abs( plate[ i + 1 ] - image[ i + 1 ] ), Math.abs( plate[ i + 2 ] - image[ i + 2 ] ) ); if ( alpha[ i + 3 ] === 0 ) { own ++; if ( d > 0 ) ownDiff ++; } if ( d > 0 ) all ++; maxd = Math.max( maxd, d ); }
		out[ t ] = { pagesOwnPixels: own, differingThere: ownDiff, differingAnywhere: all, maxDifference: maxd };
	}
	return out;
} );
console.log( JSON.stringify( r ) );
await b.close();
