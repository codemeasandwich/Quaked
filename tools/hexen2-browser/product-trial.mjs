// Runs the product-host trial page in headless Chrome: keyboard walk and a pointer-lock mouse turn against the real
// src/engine/client/hexen2_page.js host, with a screenshot and a JSON receipt.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire( '/Users/bri/SOURCE/Quaked/package.json' );
const { chromium } = require( 'playwright' );
const server = startServer();
await new Promise( done => server.listen( 0, '127.0.0.1', done ) );
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch( { headless: true, channel: process.env.QUAKED_CHROME_CHANNEL ?? 'chrome',
	args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required' ] } );
const context = await browser.newContext( { viewport: { width: 1280, height: 768 }, deviceScaleFactor: 2 } );
const page = await context.newPage();
const errors = [];
page.on( 'pageerror', error => errors.push( String( error ) ) );
let result = null;
try {

	await page.goto( base + '/tools/hexen2-browser/product.html', { waitUntil: 'load' } );
	await page.waitForFunction( () => ( window.__HEXEN2_PRODUCT__?.frames ?? 0 ) > 10 || window.__HEXEN2_PRODUCT__?.errors.length > 0, null, { timeout: 120000 } );
	const before = await page.evaluate( () => window.__HEXEN2_PRODUCT__.position ?? null );
	await page.keyboard.down( 'ArrowUp' );
	await page.waitForTimeout( 1200 );
	await page.keyboard.up( 'ArrowUp' );
	await page.setViewportSize( { width: 1280, height: 768 } );
	await page.waitForTimeout( 400 );
	const yawBefore = await page.evaluate( () => window.__HEXEN2_PRODUCT__.yaw ?? 0 );
	await page.mouse.click( 480, 300 ); // pointer lock for mouse look
	await page.mouse.move( 520, 300 );
	await page.mouse.move( 700, 300 );
	await page.waitForTimeout( 500 );
	result = await page.evaluate( () => window.__HEXEN2_PRODUCT__ );
	result.moved = before && result.position ? Math.hypot( result.position[ 0 ] - before[ 0 ], result.position[ 1 ] - before[ 1 ] ) : null;
	result.canvas = result.canvas; 
	result.yawBefore = yawBefore;
	result.yawTurn = ( result.yaw ?? 0 ) - yawBefore;
	result.errors.push( ...errors );
	await page.screenshot( { path: resolve( import.meta.dirname, '../../docs/evidence/hexen2-product-host.png' ) } );

} catch ( error ) {

	result = { ok: false, frames: 0, errors: [ ...errors, String( error ) ] };

}
if ( result.ok && ( result.frames < 10 || ( result.moved ?? 0 ) < 5 ) ) result.ok = false;
if ( result.ok && ( Math.abs( ( result.canvas?.[ 0 ] ?? 0 ) - 1280 ) > 2 || Math.abs( ( result.canvas?.[ 1 ] ?? 0 ) - 768 ) > 2 ) ) result.ok = false;
console.log( JSON.stringify( result, null, 2 ) );
await writeFile( resolve( import.meta.dirname, '../../docs/evidence/hexen2-product-host.json' ), JSON.stringify( { at: new Date().toISOString(), base, result }, null, 2 ) + '\n' );
await browser.close();
server.close();
process.exit( result.ok ? 0 : 1 );
