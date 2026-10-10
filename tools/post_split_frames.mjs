// Runs tests/post_split_frames_trial.html (card [44h]) in a headless Chromium and prints its frame digest: the SHA-256 of
// every view's pixels and of every post pass it drew. Run it on the commit before the split of gl_post.js and after each
// step; the digests must be equal.
//
//   python3 tools/serve.py 8000 &
//   PLAYWRIGHT_CORE=<playwright-core's index.mjs> CHROMIUM=<the browser binary> node tools/post_split_frames.mjs 8000 [runs]
//
// It uses the GPU through ANGLE's Metal back end (ANGLE=swiftshader for software); two runs on one machine give the
// same digest, so a different one is a real change. Prints one JSON line a run.
import { pathToFileURL } from 'node:url';

const [ port = '8000', runs = '1' ] = process.argv.slice( 2 );
if ( ! process.env.PLAYWRIGHT_CORE || ! process.env.CHROMIUM ) throw Error( 'Set PLAYWRIGHT_CORE (playwright-core index.mjs) and CHROMIUM (the browser binary)' );
const { chromium } = await import( pathToFileURL( process.env.PLAYWRIGHT_CORE ).href );
const args = process.env.ANGLE === 'swiftshader' ? [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] : [ '--use-gl=angle', '--use-angle=metal' ];
const browser = await chromium.launch( { executablePath: process.env.CHROMIUM, headless: true, args } );
try {
	for ( let r = 0; r < Number( runs ); r ++ ) {
		const page = await ( await browser.newContext( { serviceWorkers: 'block', viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 } ) ).newPage();
		await page.goto( `http://127.0.0.1:${ port }/tests/post_split_frames_trial.html` );
		await page.waitForFunction( () => ( document.querySelector( '#run' ) && ! document.querySelector( '#run' ).disabled ) || window.postSplitResult, null, { timeout: 180000 } );
		await page.evaluate( () => setTimeout( () => document.querySelector( '#run' ).click(), 0 ) ); // the run keeps the page busy
		const result = await page.waitForFunction( () => window.postSplitResult, null, { timeout: 600000 } ).then( h => h.jsonValue() );
		console.log( JSON.stringify( { status: result.status, digest: result.digest, frames: result.frames?.map( f => [ f.label, f.sha256.slice( 0, 12 ), f.passesSha256.slice( 0, 12 ), f.passes ] ), errors: result.errors?.slice( 0, 3 ) } ) );
		await page.close();
	}
} finally { await browser.close(); }
