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
	args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required' ] } );
const page = await browser.newPage( { viewport: { width: 960, height: 720 } } );
const errors = [];
page.on( 'pageerror', error => errors.push( String( error ) ) );
page.on( 'console', message => { if ( message.type() === 'error' ) errors.push( 'console: ' + message.text() ); } );
let result = null;
try {

	await page.goto( base + '/tools/hexen2-browser/harness.html', { waitUntil: 'load' } );
	await page.waitForTimeout( 300 );
	await page.screenshot( { path: resolve( import.meta.dirname, '../../docs/evidence/hexen2-browser-shelf.png' ) } ).catch( () => {} );
	await page.click( '#play' ); // the trial shelf's start
	await page.waitForFunction( () => window.__HEXEN2_TRIAL__ !== undefined && ( window.__HEXEN2_TRIAL__.ok || window.__HEXEN2_TRIAL__.errors.length > 0 ), null, { timeout: 120000 } );
	// the receipt image is the clean first frame; movement is measured after it
	await mkdir( resolve( import.meta.dirname, '../../docs/evidence' ), { recursive: true } );
	await page.screenshot( { path: resolve( import.meta.dirname, '../../docs/evidence/hexen2-browser-trial.png' ) } );
	const before = await page.evaluate( () => window.__HEXEN2_TRIAL__.position ?? null );
	// mouse look: real pointer moves turn the view; the left button holds +attack for a moment
	await page.mouse.move( 480, 360 );
	await page.mouse.move( 580, 360 );
	await page.mouse.move( 680, 360 );
	await page.waitForTimeout( 150 );
	await page.mouse.down();
	await page.waitForTimeout( 300 );
	await page.mouse.up();
	await page.waitForTimeout( 300 );
	await page.keyboard.down( 'ArrowUp' );
	await page.waitForTimeout( 1600 );
	await page.keyboard.up( 'ArrowUp' );
	await page.waitForTimeout( 200 );
	const afterWalk = await page.evaluate( () => window.__HEXEN2_TRIAL__.position ?? null );
	const combatSetup = await page.evaluate( () => window.__HEXEN2_SETUP_COMBAT__ ? window.__HEXEN2_SETUP_COMBAT__() : null );
	if ( combatSetup ) {
		await page.waitForTimeout( 300 );
		await page.mouse.down();
		await page.waitForTimeout( 1600 );
		await page.mouse.up();
		await page.waitForTimeout( 300 );
		await page.screenshot( { path: resolve( import.meta.dirname, '../../docs/evidence/hexen2-browser-trial-combat.png' ) } ).catch( () => {} );
	}
	result = await page.evaluate( () => window.__HEXEN2_TRIAL__ );
	result.combat = combatSetup ? { before: result.combatBefore, after: result.combatAfter, playerHealth: result.combatPlayerHealth, setup: combatSetup } : null;
	result.moved = before && afterWalk ? Math.hypot( afterWalk[ 0 ] - before[ 0 ], afterWalk[ 1 ] - before[ 1 ] ) : null;
	result.movedFrom = before;
	if ( result.ok && ( result.moved === null || result.moved < 5 || result.frames < 20 ) ) result.ok = false;
	if ( result.ok && ( ( result.keyEvents ?? 0 ) < 1 || ( result.forwardMax ?? 0 ) <= 0 ) ) result.ok = false;
	if ( result.ok && ( Math.abs( result.mouseYaw ?? 0 ) < 1 || ( result.attackFrames ?? 0 ) < 1 ) ) result.ok = false;
	if ( result.ok && ( !result.combat || typeof result.combat.after !== 'number' || result.combat.after >= result.combat.before ) ) result.ok = false;
	await page.screenshot( { path: resolve( import.meta.dirname, '../../docs/evidence/hexen2-browser-trial-turn.png' ) } ).catch( () => {} );
	if ( result.ok && ( !result.audioDeferredResult || result.audioDeferredResult.sources < 1 || result.audioDeferredResult.state !== 'running' ) ) result.ok = false;

} catch ( error ) {

	result = { ok: false, errors: [ ...errors, String( error ) ] };

}
const receipt = { trial: 'hexen2-browser', at: new Date().toISOString(), base, result };
await writeFile( resolve( import.meta.dirname, '../../docs/evidence/hexen2-browser-trial.json' ), JSON.stringify( receipt, null, 2 ) + '\n' );
console.log( JSON.stringify( result, null, 2 ) );
await browser.close();
server.close();
process.exit( result.ok ? 0 : 1 );
