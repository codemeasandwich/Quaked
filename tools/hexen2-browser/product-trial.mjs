// Runs the product-host trial page in headless Chrome for each base class: load, real keyboard walk, pointer-lock mouse
// turn, attack, native HUD, and Web Audio activation. Writes one screenshot per class and a JSON receipt. This is the
// product page host (src/engine/client/hexen2_page.js), not the packaged app's shelf.
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
	args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const context = await browser.newContext( { viewport: { width: 1280, height: 768 }, deviceScaleFactor: 2 } );
const classes = [ [ 'paladin', 1 ], [ 'crusader', 2 ], [ 'necromancer', 3 ], [ 'assassin', 4 ], [ 'succubus', 5 ] ];
const results = [];

for ( const [ classId, expectedClass ] of classes ) {

	const page = await context.newPage(), errors = [];
	page.on( 'pageerror', error => errors.push( String( error ) ) );
	let result = null;
	try {

		await page.goto( base + '/tools/hexen2-browser/product.html?class=' + classId + ( classId === 'succubus' ? '&game=portals' : '' ), { waitUntil: 'load' } );
		await page.waitForFunction( () => ( window.__HEXEN2_PRODUCT__?.frames ?? 0 ) > 10 || window.__HEXEN2_PRODUCT__?.errors.length > 0, null, { timeout: 120000 } );
		await page.waitForTimeout( 500 ); // the first class pays the shader compilation
		// a real user gesture: resume the AudioContext and let the page request pointer lock
		await page.mouse.click( 640, 400 );
		await page.waitForTimeout( 300 );
		const before = await page.evaluate( () => window.__HEXEN2_PRODUCT__.position ?? null );
		await page.keyboard.down( 'ArrowUp' );
		await page.waitForTimeout( 1200 );
		await page.keyboard.up( 'ArrowUp' );
		const yawBefore = await page.evaluate( () => window.__HEXEN2_PRODUCT__.yaw ?? 0 );
		await page.mouse.move( 520, 300 );
		await page.mouse.move( 700, 300 );
		await page.waitForTimeout( 200 );
		await page.mouse.down();
		await page.waitForTimeout( 700 );
		await page.mouse.up();
		await page.waitForTimeout( 1200 );
		await page.waitForFunction( () => ( window.__HEXEN2_PRODUCT__?.frames ?? 0 ) >= 25 || window.__HEXEN2_PRODUCT__?.errors.length > 0, null, { timeout: 15000 } ).catch( () => {} );
		result = await page.evaluate( () => window.__HEXEN2_PRODUCT__ );
		result.moved = before && result.position ? Math.hypot( result.position[ 0 ] - before[ 0 ], result.position[ 1 ] - before[ 1 ] ) : null;
		result.yawBefore = yawBefore;
		result.yawTurn = ( result.yaw ?? 0 ) - yawBefore;
		result.expectedClass = expectedClass;
		result.errors.push( ...errors );
		// the native bar is drawn on the 2D overlay; count non-black pixels in its bottom strip
		result.hudPixels = await page.evaluate( () => {

			for ( const canvas of document.querySelectorAll( 'canvas' ) ) {

				const ctx = canvas.getContext( '2d' );
				if ( ! ctx ) continue;
				try {

					const data = ctx.getImageData( 0, Math.max( 0, canvas.height - 40 ), canvas.width, 1 ).data;
					let lit = 0;
					for ( let i = 0; i < data.length; i += 4 ) if ( data[ i ] + data[ i + 1 ] + data[ i + 2 ] > 24 ) lit ++;
					return { width: canvas.width, height: canvas.height, lit };

				} catch { return { width: canvas.width, height: canvas.height, lit: - 1 }; }

			}
			return null;

		} );
		await page.screenshot( { path: resolve( import.meta.dirname, `../../docs/evidence/hexen2-product-${classId === 'succubus' ? 'portal' : classId}.png` ) } );
		// the native +showinfo lower bar slides up under the main HUD; show the level-6 ability lines too
		await page.evaluate( () => { const session = window.__HEXEN2_SESSION__; if ( !session ) return; session.player.v.level = 6; session.player.v.flags = ( session.player.v.flags | 0 ) | 4194304 | 8388608; session.state.stats.level = 6; session.state.stats.flags = session.player.v.flags; session.state.clientdata.flags = session.player.v.flags; } );
		await page.keyboard.down( 'Tab' );
		await page.waitForTimeout( 350 );
		await page.screenshot( { path: resolve( import.meta.dirname, `../../docs/evidence/hexen2-product-${classId === 'succubus' ? 'portal' : classId}-stats.png` ) } );
		await page.keyboard.up( 'Tab' );
		await page.waitForTimeout( 250 );
		// the in-game pause menu: Escape opens it and freezes the simulation; ArrowDown+Enter reaches Inventory
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 250 );
		const opened = await page.evaluate( () => ( { open: window.__HEXEN2_MENU__?.isOpen() === true,
			text: document.getElementById( 'hexen2-menu' )?.innerText ?? '' } ) );
		await page.keyboard.press( 'ArrowDown' );
		await page.keyboard.press( 'Enter' );
		await page.waitForTimeout( 250 );
		const inventory = await page.evaluate( () => document.getElementById( 'hexen2-menu' )?.innerText ?? '' );
		await page.screenshot( { path: resolve( import.meta.dirname, `../../docs/evidence/hexen2-product-${classId === 'succubus' ? 'portal' : classId}-menu.png` ) } );
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 100 );
		// Save then Load (the quicksave record is the current-level single-session format)
		for ( let i = 0; i < 4; i ++ ) await page.keyboard.press( 'ArrowDown' );
		await page.keyboard.press( 'Enter' );
		await page.waitForTimeout( 250 );
		await page.keyboard.press( 'ArrowDown' );
		await page.keyboard.press( 'Enter' );
		await page.waitForTimeout( 350 );
		const saves = await page.evaluate( () => ( window.__HEXEN2_PRODUCT__?.logs ?? [] ).filter( text => /^(save|load) /.test( text ) ) );
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 150 );
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 100 );
		await page.keyboard.press( 'ArrowDown' );
		await page.keyboard.press( 'ArrowDown' );
		await page.keyboard.press( 'Enter' );
		await page.waitForTimeout( 150 );
		const character = await page.evaluate( () => document.getElementById( 'hexen2-menu' )?.innerText ?? '' );
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 100 );
		await page.keyboard.press( 'ArrowDown' );
		await page.keyboard.press( 'ArrowDown' );
		await page.keyboard.press( 'ArrowDown' );
		await page.keyboard.press( 'Enter' );
		await page.waitForTimeout( 150 );
		await page.keyboard.press( 'ArrowLeft' );
		await page.waitForTimeout( 100 );
		const options = await page.evaluate( () => document.getElementById( 'hexen2-menu' )?.innerText ?? '' );
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 100 );
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 250 );
		result.menu = { open: opened.open, text: opened.text, inventory, character, options, saves, closed: await page.evaluate( () => window.__HEXEN2_MENU__?.isOpen() === false ) };

	} catch ( error ) {

		result = { ok: false, frames: 0, errors: [ ...errors, String( error ) ], requestedClass: classId };

	}
	result.requestedClass = classId;
	result.ok = result.ok === true && result.started === true;
	if ( !result.ok ) results.push( result );
	else {

		const checks = {
			frames: result.frames >= 25,
			moved: ( result.moved ?? 0 ) >= 5,
			classNumber: result.classNumber === expectedClass,
			canvas: Math.abs( ( result.canvas?.[ 0 ] ?? 0 ) - 1280 ) <= 2 && Math.abs( ( result.canvas?.[ 1 ] ?? 0 ) - 768 ) <= 2,
			hudOps: ( result.hud?.ops ?? 0 ) > 0 && ( result.hud?.nums ?? 0 ) > 0,
			hudPixels: ( result.hudPixels?.lit ?? 0 ) > 0,
			weaponAnimation: ( result.weaponFrames?.length ?? 0 ) > 1,
			entityAnimation: ( result.entityFrames?.length ?? 0 ) > 1,
			menu: result.menu?.open === true && /PAUSED/.test( result.menu.text ) && /Health:/.test( result.menu.inventory ) && /Class:/.test( result.menu.character ) && /Sound volume:/.test( result.menu.options ) && /Save game/.test( result.menu.text ) && /Load game/.test( result.menu.text ) && ( result.menu.saves ?? [] ).some( text => /^save quicksave \(indexeddb, \d+ levels\)/.test( text ) ) && ( result.menu.saves ?? [] ).some( text => /^load quicksave \(indexeddb, \d+ levels\)/.test( text ) ) && result.menu.closed === true,
			audio: result.audio?.state === 'running'
		};
		result.checks = checks;
		result.ok = checks.frames && checks.moved && checks.classNumber && checks.canvas && checks.hudOps && checks.hudPixels && checks.weaponAnimation && checks.entityAnimation && checks.menu && checks.audio;
		results.push( result );

	}
	await page.close();

}

const audioSources = results.reduce( ( sum, result ) => sum + ( result.audio?.sources ?? 0 ), 0 );
const receipt = { trial: 'hexen2-product-host', at: new Date().toISOString(), base, classes: results, audioSources,
	ok: results.length === classes.length && results.every( result => result.ok === true ) && audioSources >= 1 };
console.log( JSON.stringify( receipt, null, 2 ) );
await writeFile( resolve( import.meta.dirname, '../../docs/evidence/hexen2-product-host.json' ), JSON.stringify( receipt, null, 2 ) + '\n' );
await browser.close();
server.close();
process.exit( receipt.ok ? 0 : 1 );
