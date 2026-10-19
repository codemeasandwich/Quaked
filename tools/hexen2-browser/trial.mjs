// Runs the Hexen II browser harness in headless Chrome, saves a screenshot and prints a JSON receipt.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire( '/Users/bri/SOURCE/Quaked/package.json' );
const { chromium } = require( 'playwright' );
const server = startServer();
await new Promise( resolve => server.listen( 0, '127.0.0.1', resolve ) );
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch( { headless: true, channel: process.env.QUAKED_CHROME_CHANNEL ?? 'chrome',
	args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 960, height: 720 } } );
const errors = [];
page.on( 'pageerror', error => errors.push( String( error ) ) );
page.on( 'console', message => { if ( message.type() === 'error' ) errors.push( 'console: ' + message.text() ); } );
let result = null;
try {

	await page.goto( base + '/tools/hexen2-browser/harness.html', { waitUntil: 'load' } );
	await page.waitForFunction( () => window.__HEXEN2_TRIAL__ !== undefined && ( window.__HEXEN2_TRIAL__.ok || window.__HEXEN2_TRIAL__.errors.length > 0 ), null, { timeout: 120000 } );
	const before = await page.evaluate( () => window.__HEXEN2_TRIAL__.position ?? null );
	await page.evaluate( () => { window.__HEXEN2_INPUT__ = { forwardmove: 320, sidemove: 0, yaw: 0 }; } );
	await page.waitForTimeout( 1200 );
	await page.evaluate( () => { window.__HEXEN2_INPUT__ = { forwardmove: 320, sidemove: 0, yaw: 90 }; } );
	await page.waitForTimeout( 1200 );
	result = await page.evaluate( () => window.__HEXEN2_TRIAL__ );
	result.moved = before && result.position
		? Math.hypot( result.position[ 0 ] - before[ 0 ], result.position[ 1 ] - before[ 1 ] ) : null;
	result.movedFrom = before;
	await mkdir( resolve( import.meta.dirname, '../../docs/evidence' ), { recursive: true } );
	await page.screenshot( { path: resolve( import.meta.dirname, '../../docs/evidence/hexen2-browser-trial.png' ) } );
	if ( result.ok && ( result.moved === null || result.moved < 5 || result.frames < 20 ) ) result.ok = false;

} catch ( error ) {

	result = { ok: false, errors: [ ...errors, String( error ) ] };

}
const receipt = { trial: 'hexen2-browser', at: new Date().toISOString(), base, result };
await writeFile( resolve( import.meta.dirname, '../../docs/evidence/hexen2-browser-trial.json' ), JSON.stringify( receipt, null, 2 ) + '\n' );
console.log( JSON.stringify( result, null, 2 ) );
await browser.close();
server.close();
process.exit( result.ok ? 0 : 1 );
