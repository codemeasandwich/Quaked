// Runs tests/world_split_frames_trial.html (card [44i]) in a headless Chromium and prints its frame digest: the SHA-256
// of every view's pixels, lightmap atlas bytes, scene graph, visible geometry and brush polygon count. Run it on the
// commit before the split of gl_rsurf.js and after each step; each run prints "baseline": "same" when its world digest
// is the unchanged renderer's and its full digest one of that renderer's two.
//
//   python3 tools/serve.py 8000 &
//   PLAYWRIGHT_CORE=<playwright-core's index.mjs> CHROMIUM=<the browser binary> node tools/world_split_frames.mjs 8000 [runs]
//
// It uses the GPU through ANGLE's Metal back end (ANGLE=swiftshader for software). The page is 640x400 at device scale
// 1, the size the trial draws at. Prints one JSON line a run; SHOTS=<dir> also saves the measured views as PNGs.
import { pathToFileURL } from 'node:url';

// the digests on the unchanged renderer (Dev 897e3ba6): one world digest; the full digest takes one of two values
const BASE_WORLD = 'e5de88910db2536ba12c22d30a578f17d61f7e10c651c297e49578e002e08409';
const BASE_FULL = [ '1b245eb2224a92bc39eabfcfd57e16d2dc3a677a9bf874a0328fff4e5e106e8b', '6bcfc8b1d300053ae6b64c85b9db5bd8738de88084df37f7059e7a02a62defcf' ];

const [ port = '8000', runs = '1' ] = process.argv.slice( 2 );
if ( ! process.env.PLAYWRIGHT_CORE || ! process.env.CHROMIUM ) throw Error( 'Set PLAYWRIGHT_CORE (playwright-core index.mjs) and CHROMIUM (the browser binary)' );
const { chromium } = await import( pathToFileURL( process.env.PLAYWRIGHT_CORE ).href );
const args = process.env.ANGLE === 'swiftshader' ? [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] : [ '--use-gl=angle', '--use-angle=metal' ];
const browser = await chromium.launch( { executablePath: process.env.CHROMIUM, headless: true, args } );
try {
	for ( let r = 0; r < Number( runs ); r ++ ) {
		const page = await ( await browser.newContext( { serviceWorkers: 'block', viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 } ) ).newPage();
		await page.goto( `http://127.0.0.1:${ port }/tests/world_split_frames_trial.html${ process.env.PACKETS ? '?packets=' + process.env.PACKETS : '' }` );
		const result = await page.waitForFunction( () => window.worldSplitResult, null, { timeout: 900000 } ).then( h => h.jsonValue() );
		if ( process.env.SHOTS ) { const { writeFileSync } = await import( 'node:fs' ); const shots = await page.$$eval( '#views img', imgs => imgs.map( i => [ i.nextSibling?.textContent, i.src ] ) ); shots.forEach( ( [ label, src ], i ) => writeFileSync( `${ process.env.SHOTS }/${ String( i ).padStart( 2, '0' ) }.png`, Buffer.from( src.split( ',' )[ 1 ], 'base64' ) ) ); }
		console.log( JSON.stringify( { status: result.status, baseline: result.worldDigest === BASE_WORLD && BASE_FULL.includes( result.digest ) ? 'same' : 'DIFFERENT', digest: result.digest, worldDigest: result.worldDigest, frames: result.frames?.map( f => [ f.label, f.sha256.slice( 0, 12 ), f.atlas.slice( 0, 8 ), f.graph.slice( 0, 8 ), f.geometry.slice( 0, 8 ), f.brushPolys, f.litPixels ] ), errors: result.errors?.slice( 0, 3 ), error: result.error } ) );
		await page.close();
	}
} finally { await browser.close(); }
