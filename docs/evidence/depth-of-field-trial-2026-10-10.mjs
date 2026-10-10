// Browser trial behind docs/depth-of-field-2026-10-10.md (card [38]); evidence, not part of the suite. Run with playwright-core,
// the game served at 127.0.0.1:8765. Prints the focus found and median frame times; writes dof-*.png.
import { chromium } from 'playwright-core'; import fs from 'node:fs';
const b = await chromium.launch( { executablePath: '/Users/bri/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: true, args: [ '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist' ] } );
const page = await ( await b.newContext( { viewport: { width: 1000, height: 650 } } ) ).newPage();
page.on( 'pageerror', e => console.log( '[pageerror]', String( e ).slice( 0, 300 ) ) );
page.on( 'console', m => { if ( /error|ERROR|shader|Shader/.test( m.text() ) && ! /404|Failed to load/.test( m.text() ) ) console.log( '[console]', m.text().slice( 0, 400 ) ); } );
await page.route( 'https://cdn.jsdelivr.net/npm/three@0.183.0/**', async r => { const l = '/private/tmp/quaked-lit-check/' + new URL( r.request().url() ).pathname.split( '/' ).pop(); return fs.existsSync( l ) ? r.fulfill( { path: l, contentType: 'text/javascript' } ) : r.continue(); } );
await page.goto( 'http://127.0.0.1:8765/tests/shotgun_trial.html' ); await page.waitForFunction( () => window.shotgunTrial, null, { timeout: 120000 } );
await page.evaluate( async () => { const s = await import( '/src/bestiary_state.js' ); try { localStorage.setItem( 'quaked.bestiary.v1', JSON.stringify( { version: 1, unlocked: [ ...s.BESTIARY_ENTRIES.map( e => e.id ), ...s.BESTIARY_COLLECTION_IDS ] } ) ); } catch ( e ) {} } );
await page.evaluate( async () => { await window.shotgunTrial.start( true, 'e1m1' ); } ); await page.waitForTimeout( 3000 );
const cmd = t => page.evaluate( async t => { ( await import( '/src/cmd.js' ) ).Cbuf_AddText( t + '\n' ); }, t );
await page.evaluate( async () => { const s = await import( '/src/server.js' ); for ( const e of s.sv.edicts ) if ( e && ! e.free && ( e.v.flags & 32 ) ) e.v.nextthink = 1e9; } );
const views = JSON.parse( process.argv[ 2 ] || '[[445.5,60.125,40,215,5],[480,-352,88,90,0]]' );
for ( const [ vi, v ] of views.entries() ) {
	await page.evaluate( v => window.shotgunTrial.place( ...v ), v ); await page.waitForTimeout( 800 );
	for ( const s of [ 0, 0.3, 1 ] ) {
		await cmd( 'r_dof ' + s ); await page.waitForTimeout( 900 );
		await page.screenshot( { path: `dof-${ vi }-${ s }.png` } );
		console.log( vi, s, JSON.stringify( await page.evaluate( async () => { const d = await import( '/src/r_dof.js' ); return { ...d.dofStats, focusNow: d.R_DofFocus() }; } ) ) );
	}
}
// a Grunt 100 units ahead, the corridor wall far behind: the focus must be on the Grunt
await page.evaluate( v => window.shotgunTrial.place( ...v ), [ 480, -352, 88, 90, 0 ] ); await cmd( 'r_dof 0.3' ); await page.waitForTimeout( 800 );
const farFocus = await page.evaluate( async () => ( await import( '/src/r_dof.js' ) ).R_DofFocus() );
await page.evaluate( async () => { const s = await import( '/src/server.js' ), w = await import( '/src/world.js' ); const g = s.sv.edicts.find( e => e && ! e.free && ( e.v.flags & 32 ) ); g.v.takedamage = 0; g.v.origin = [ 480, -252, 88 ]; w.SV_LinkEdict( g, false ); } );
await page.waitForTimeout( 1500 ); const grunt = await page.evaluate( async () => ( await import( '/src/r_dof.js' ) ).R_DofFocus() );
await page.screenshot( { path: 'dof-grunt.png' } );
console.log( 'focus down the corridor', farFocus.toFixed( 1 ), '-> a Grunt 100 units ahead', grunt.toFixed( 1 ) );
// the cost: frame time with and without, over 3 s each
for ( const s of [ 0, 0.3 ] ) { await cmd( 'r_dof ' + s ); await page.waitForTimeout( 500 );
	const ms = await page.evaluate( () => new Promise( r => { const t = []; let last = performance.now(); const f = now => { t.push( now - last ); last = now; if ( t.length < 120 ) requestAnimationFrame( f ); else r( t.slice( 10 ).sort( ( a, b ) => a - b )[ 55 ] ); }; requestAnimationFrame( f ); } ) );
	console.log( 'r_dof', s, 'median frame ms', ms.toFixed( 2 ) ); }
await b.close();
