// Browser trial behind docs/gamepad-2026-10-10.md (card [36]); evidence, not part of the suite. A stubbed standard pad drives
// tests/shotgun_trial.html through the real input path. Run with playwright-core, the game served at 127.0.0.1:8765.
import { chromium } from 'playwright-core'; import fs from 'node:fs';
const b = await chromium.launch( { executablePath: '/Users/bri/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: true, args: [ '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist' ] } );
const page = await ( await b.newContext( { viewport: { width: 900, height: 560 } } ) ).newPage();
page.on( 'pageerror', e => console.log( '[pageerror]', String( e ).slice( 0, 300 ) ) );
await page.route( 'https://cdn.jsdelivr.net/npm/three@0.183.0/**', async r => { const l = '/private/tmp/quaked-lit-check/' + new URL( r.request().url() ).pathname.split( '/' ).pop(); return fs.existsSync( l ) ? r.fulfill( { path: l, contentType: 'text/javascript' } ) : r.continue(); } );
await page.addInitScript( () => { const pad = { index: 0, id: 'Trial pad (standard)', mapping: 'standard', connected: true, axes: [ 0, 0, 0, 0 ], buttons: Array.from( { length: 17 }, () => ( { pressed: false, value: 0 } ) ) }; window.__pad = pad; window.__pads = [ pad ]; Object.defineProperty( navigator, 'getGamepads', { value: () => window.__pads, configurable: true } ); } );
await page.goto( 'http://127.0.0.1:8765/tests/shotgun_trial.html' ); await page.waitForFunction( () => window.shotgunTrial, null, { timeout: 120000 } );
await page.evaluate( async () => { await window.shotgunTrial.start( true, 'e1m1' ); } ); await page.waitForTimeout( 2500 );
const state = () => page.evaluate( async () => { const C = await import( '/src/client.js' ), S = await import( '/src/server.js' ); return { shells: C.cl.stats[ 3 ], weapon: S.sv.edicts[ 1 ].v.weapon, origin: Array.from( S.sv.edicts[ 1 ].v.origin ).map( Math.round ) }; } );
const btn = ( i, on ) => page.evaluate( ( [ i, on ] ) => { window.__pad.buttons[ i ] = { pressed: on, value: on ? 1 : 0 }; }, [ i, on ] );
await page.evaluate( async () => { ( await import( '/src/cmd.js' ) ).Cbuf_AddText( 'impulse 9\n' ); } ); await page.waitForTimeout( 1000 );
await page.evaluate( async () => { ( await import( '/src/cmd.js' ) ).Cbuf_AddText( 'impulse 2\n' ); } ); await page.waitForTimeout( 800 );
console.log( 'start', JSON.stringify( await state() ) );
await btn( 2, true ); await page.waitForTimeout( 200 ); await btn( 2, false ); await page.waitForTimeout( 400 );
console.log( 'X (change weapon)', JSON.stringify( await state() ) );
await page.evaluate( async () => { ( await import( '/src/cmd.js' ) ).Cbuf_AddText( 'impulse 2\n' ); } ); await page.waitForTimeout( 800 ); console.log( 'shotgun again', JSON.stringify( await state() ) );
await btn( 7, true ); await page.waitForTimeout( 1200 ); const firing = await state(); console.log( 'RT held 1.2 s', JSON.stringify( firing ) );
await page.evaluate( () => { window.__pads = []; } ); await page.waitForTimeout( 300 ); const a = await state(); await page.waitForTimeout( 1200 ); const bb = await state();
console.log( 'disconnected while firing', JSON.stringify( a ), '->', JSON.stringify( bb ), bb.shells === a.shells ? '(firing stopped)' : '(STILL FIRING)' );
await page.evaluate( () => { window.__pad.buttons[ 7 ] = { pressed: false, value: 0 }; window.__pad.axes = [ 0, - 1, 0, 0 ]; window.__pads = [ window.__pad ]; } );
await page.evaluate( async () => { const S = await import( '/src/server.js' ); const p = S.sv.edicts[ 1 ]; p.v.movetype = 3; } );
const before = await state(); await page.waitForTimeout( 1000 ); const after = await state(); console.log( 'reconnected, left stick forward 1 s', JSON.stringify( before.origin ), '->', JSON.stringify( after.origin ) );
// keyboard and pad on the same key: hold keyboard Ctrl (fire), tap pad RB (also Ctrl): firing must continue
await page.evaluate( () => { window.__pad.axes = [ 0, 0, 0, 0 ]; } ); await page.waitForTimeout( 300 );
await page.keyboard.down( 'Control' ); await page.waitForTimeout( 300 ); await btn( 5, true ); await page.waitForTimeout( 150 ); await btn( 5, false ); await page.waitForTimeout( 150 );
const k1 = await state(); await page.waitForTimeout( 1000 ); const k2 = await state(); await page.keyboard.up( 'Control' );
console.log( 'keyboard Ctrl held, pad RB tapped', k1.shells, '->', k2.shells, k2.shells < k1.shells ? '(still firing)' : '(CUT)' );
// no level: disconnect, then Start opens the menu and B closes it, with the pad alone
await page.evaluate( async () => { ( await import( '/src/cmd.js' ) ).Cbuf_AddText( 'disconnect\n' ); } ); await page.waitForTimeout( 800 );
const dest = () => page.evaluate( async () => { const k = await import( '/src/keys.js' ), C = await import( '/src/client.js' ); return { dest: k.key_dest, menu: k.key_menu, state: C.cls.state }; } );
const before2 = await dest(); await btn( 9, true ); await page.waitForTimeout( 150 ); await btn( 9, false ); await page.waitForTimeout( 300 ); const opened = await dest();
console.log( 'disconnected (state ' + before2.state + '), pad Start: key_dest', before2.dest, '->', opened.dest, opened.dest === opened.menu ? '(menu open)' : '(NOT OPENED)' );
await page.screenshot( { path: 'pad-menu.png' } );
await b.close();
