// Runs tests/menu_split_trial.html (card [44j]) in a headless Chromium and prints its digest: for every step of every
// menu script, Classic and Newer, the screen's pixels, the menu state, the archived cvars and the key bindings. Run it
// on the commit before the split of menu.js and after each step; each run prints "baseline": "same" when its digest
// is the unchanged menus'.
//
//   python3 tools/serve.py 8000 &
//   PLAYWRIGHT_CORE=<playwright-core's index.mjs> CHROMIUM=<the browser binary> node tools/menu_split_frames.mjs 8000 [runs]
//
// It uses the GPU through ANGLE's Metal back end (ANGLE=swiftshader for software). The page is 640x400 at device scale
// 1, the size the trial draws at. Prints one JSON line a run: the digest and, per step, its label and short hashes.
import { pathToFileURL } from 'node:url';

// the digest on the unchanged menus (Dev fa1ef637, three runs of three; the same at [44j] step 1, five of five)
const BASE = 'e38d89beca6467c6249755c355530057e748ee2ae460bc21e2cb7e1a6a20e3c2';

const [ port = '8000', runs = '1' ] = process.argv.slice( 2 );
if ( ! process.env.PLAYWRIGHT_CORE || ! process.env.CHROMIUM ) throw Error( 'Set PLAYWRIGHT_CORE (playwright-core index.mjs) and CHROMIUM (the browser binary)' );
const { chromium } = await import( pathToFileURL( process.env.PLAYWRIGHT_CORE ).href );
const args = process.env.ANGLE === 'swiftshader' ? [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] : [ '--use-gl=angle', '--use-angle=metal' ];
const browser = await chromium.launch( { executablePath: process.env.CHROMIUM, headless: true, args } );
try {
	for ( let r = 0; r < Number( runs ); r ++ ) {
		const page = await ( await browser.newContext( { serviceWorkers: 'block', viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 } ) ).newPage();
		await page.goto( `http://127.0.0.1:${ port }/tests/menu_split_trial.html` );
		const result = await page.waitForFunction( () => window.menuSplitResult, null, { timeout: 900000 } ).then( h => h.jsonValue() );
		console.log( JSON.stringify( { status: result.status, baseline: result.digest === BASE ? 'same' : 'DIFFERENT', digest: result.digest, steps: result.steps, frames: result.frames?.map( f => [ f.label, f.sha256.slice( 0, 12 ), f.draws.slice( 0, 8 ), f.drawCount, f.skinned.slice( 0, 8 ), f.skinnedCount, f.state, f.keyDest, f.cvars.slice( 0, 8 ), f.bindings.slice( 0, 8 ) ] ), errors: result.errors?.slice( 0, 3 ), error: result.error } ) );
		await page.close();
	}
} finally { await browser.close(); }
