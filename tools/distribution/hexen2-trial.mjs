/**
 * Hexen II acceptance trial on the unified host (docs/hexen2/unified-host.md §5), in a headed, muted Chrome with a
 * fresh profile (never the owner's session). It serves this checkout with `tools/serve.py --game-root <library>`, so
 * the source build mounts the owner's installed games read-only from /games/, and drives each edition through its
 * public start URL (?game=…&class=…&autostart=1), the keyboard and console commands. State is read by importing the
 * same engine modules the page loaded (same URLs, so the same instances); nothing in the engine is trial-only.
 *
 *   node tools/distribution/hexen2-trial.mjs [library] [outDir]
 *
 * library defaults to ~/quaked (folders "Hexen 2", "Hexen 2 Shareware"); outDir to dist/hexen2-trial. Writes
 * trial.json (every scenario's checks, console errors and page errors) and one PNG per screenshot. Exit 1 when any
 * check fails. Keys go to the trial's own page, never to the system keyboard.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:net';

const library = resolve( process.argv[ 2 ] ?? resolve( homedir(), 'quaked' ) );
const out = resolve( process.argv[ 3 ] ?? 'dist/hexen2-trial' );
const only = process.env.HEXEN2_TRIAL_ONLY?.split( ',' ) ?? null;
await mkdir( out, { recursive: true } );

const port = await new Promise( done => { const s = createServer(); s.listen( 0, '127.0.0.1', () => { const p = s.address().port; s.close( () => done( p ) ); } ); } );
const server = spawn( 'python3', [ 'tools/serve.py', String( port ), '--game-root', library ], { stdio: [ 'ignore', 'ignore', 'pipe' ] } );
let serverLog = '';
server.stderr.on( 'data', chunk => { serverLog = ( serverLog + chunk ).slice( - 4000 ); } );
const base = `http://127.0.0.1:${port}/index.html`;
for ( let i = 0; i < 50; i ++ ) { try { if ( ( await fetch( base ) ).ok ) break; } catch {} await new Promise( r => setTimeout( r, 200 ) ); }

const browser = await chromium.launch( { channel: process.env.QUAKED_CHROME_CHANNEL ?? 'chrome', headless: false, args: [ '--mute-audio', '--autoplay-policy=no-user-gesture-required' ] } );
const report = { at: new Date().toISOString(), library, scenarios: [] };
const sleep = ms => new Promise( r => setTimeout( r, ms ) );

// One page per scenario: console errors, page errors and checks are collected per scenario.
async function scenario( name, query, body ) {

	if ( only && ! only.includes( name ) ) return;
	const context = await browser.newContext( { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 } );
	const page = await context.newPage();
	const result = { name, query, checks: [], shots: [], consoleErrors: [], pageErrors: [], failedRequests: [], notes: {} };
	page.on( 'response', r => { if ( r.status() >= 400 ) result.failedRequests.push( r.status() + ' ' + decodeURIComponent( new URL( r.url() ).pathname ) ); } );
	page.on( 'console', m => { if ( m.type() === 'error' ) result.consoleErrors.push( m.text().slice( 0, 300 ) ); } );
	page.on( 'pageerror', e => result.pageErrors.push( String( e?.stack ?? e ).slice( 0, 600 ) ) );
	const check = ( ok, what, detail ) => result.checks.push( { ok: !! ok, what, ...( detail === undefined ? {} : { detail } ) } );
	const shot = async label => { const file = `${name}-${label}.png`; await page.screenshot( { path: resolve( out, file ) } ); result.shots.push( file ); };
	// engine state through the page's own module instances
	const state = () => page.evaluate( async () => {

		const [ { sv }, { cls, cl }, mc, keys ] = await Promise.all( [ import( '/src/engine/server/server.js' ), import( '/src/engine/client/client.js' ), import( '/src/engine/client/menu_common.js' ), import( '/src/engine/client/keys.js' ) ] );
		const player = sv.active && sv.edicts?.[ 1 ] ? sv.edicts[ 1 ].v : null;
		return { svActive: !! sv.active, svName: sv.name ?? null, clsState: cls.state, signon: cls.signon, demo: !! cls.demoplayback,
			world: cl.worldmodel?.name ?? null, menu: mc.m_state, keyDest: keys.key_dest, numEdicts: sv.num_edicts ?? null,
			origin: player ? Array.from( player.origin ).map( v => Math.round( v ) ) : null, health: player ? player.health : null };

	} );
	const command = text => page.evaluate( async t => { ( await import( '/src/engine/common/cmd.js' ) ).Cbuf_AddText( t + '\n' ); }, text );
	const until = async ( test, ms, what ) => { const end = Date.now() + ms; let s; while ( Date.now() < end ) { try { s = await state(); if ( test( s ) ) return s; } catch {} await sleep( 250 ); } check( false, 'timed out: ' + what, s ); return null; };
	try {

		await page.goto( base + query );
		await page.locator( 'canvas' ).first().waitFor( { timeout: 60000 } );
		await body( { page, state, command, until, check, shot, result } );

	} catch ( error ) { check( false, 'scenario threw', String( error?.stack ?? error ).slice( 0, 600 ) ); }
	check( result.pageErrors.length === 0, 'no uncaught page errors', result.pageErrors.slice( 0, 3 ) );
	report.scenarios.push( result );
	await context.close();

}

const key = ( page, name, times = 1 ) => ( async () => { for ( let i = 0; i < times; i ++ ) { await page.keyboard.press( name ); await sleep( 160 ); } } )();
// a live client is ca_connected (2) with every signon received (client.js SIGNONS)
const playing = s => s.svActive && s.clsState === 2 && s.signon === 4;

// Menus: the native pages through the high-resolution skin, and the scrolling help.
await scenario( 'menus', '?game=hexen2', async ( { page, state, until, check, shot } ) => {

	const s = await until( s => s.keyDest === 3 && s.menu > 0, 60000, 'the main menu opens' );
	check( s, 'hexen.rc opens the main menu', s );
	// no click: a click on a menu row chooses it; the trial's page already has the keyboard focus
	await sleep( 2500 ); // the title slides down
	await shot( 'main' );
	await key( page, 'ArrowDown', 2 ); await key( page, 'Enter' ); await sleep( 1200 );
	await shot( 'options' );
	await key( page, 'Escape' ); await key( page, 'ArrowDown' ); await key( page, 'Enter' ); await sleep( 800 );
	await shot( 'help-top' );
	await key( page, 'ArrowDown', 6 ); await sleep( 300 );
	await shot( 'help-scrolled' );
	await key( page, 'End' ); await sleep( 300 );
	await shot( 'help-end' );
	await key( page, 'Escape' ); await key( page, 'ArrowUp', 3 ); await key( page, 'Enter' ); await sleep( 1200 );
	await shot( 'single-player' );
	check( ( await state() ).menu > 0, 'the menus stay up through the walk' );

} );

// The base game: start, move, attack, hub travel and back, save and load, enhanced on and off.
await scenario( 'base', '?game=hexen2&class=paladin&autostart=1', async ( { page, state, command, until, check, shot, result } ) => {

	const start = await until( playing, 120000, 'demo1 starts' );
	check( start?.svName === 'demo1', 'the base game starts on demo1', start?.svName );
	await page.mouse.click( 640, 400 );
	await command( 'volume 0; bgmvolume 0; r_dof 0' );
	await sleep( 3000 ); await shot( 'demo1' );
	const before = await state();
	await page.keyboard.down( 'ArrowUp' ); await sleep( 1500 ); await page.keyboard.up( 'ArrowUp' );
	const moved = await state();
	check( moved.origin && before.origin && Math.hypot( moved.origin[ 0 ] - before.origin[ 0 ], moved.origin[ 1 ] - before.origin[ 1 ] ) > 32, 'Up walks the player forward', { before: before.origin, after: moved.origin } );
	await page.keyboard.down( 'Control' ); await sleep( 800 ); await page.keyboard.up( 'Control' );
	await sleep( 500 ); await shot( 'attack' );
	await command( 'r_hdr 0' ); await sleep( 1500 ); await shot( 'classic' );
	await command( 'r_hdr 1' ); await sleep( 1500 ); await shot( 'enhanced' );

	await command( 'save trial1' ); await sleep( 1000 );
	const saved = await state();
	await command( 'changelevel2 demo2 demo1' );
	const away = await until( s => playing( s ) && s.svName === 'demo2', 60000, 'changelevel2 reaches demo2' );
	check( away, 'hub travel reaches demo2', away?.svName );
	await sleep( 2000 ); await shot( 'demo2' );
	await command( 'changelevel2 demo1 demo2' );
	const back = await until( s => playing( s ) && s.svName === 'demo1', 60000, 'changelevel2 returns to demo1' );
	check( back, 'hub travel returns to demo1', back?.svName );
	result.notes.edicts = { left: saved.numEdicts, returned: back?.numEdicts };
	await sleep( 1500 ); await shot( 'demo1-return' );
	await command( 'load trial1' );
	const loaded = await until( s => playing( s ) && s.svName === 'demo1', 60000, 'load restores the save' );
	check( loaded && saved.origin && loaded.origin && Math.hypot( loaded.origin[ 0 ] - saved.origin[ 0 ], loaded.origin[ 1 ] - saved.origin[ 1 ] ) < 16, 'load puts the player back where the save was made', { saved: saved.origin, loaded: loaded?.origin } );
	await sleep( 1500 ); await shot( 'loaded' );

} );

// Portal of Praevus and the demo start on their own first maps.
await scenario( 'portals', '?game=hexen2-portals&class=demoness&autostart=1', async ( { page, until, check, shot, command } ) => {

	const s = await until( playing, 120000, 'keep1 starts' );
	check( s?.svName === 'keep1', 'Portal of Praevus starts on keep1', s?.svName );
	await command( 'volume 0; bgmvolume 0; r_dof 0' );
	await page.mouse.click( 640, 400 ); await sleep( 3000 ); await shot( 'keep1' );

} );
await scenario( 'demo', '?game=hexen2-demo&class=paladin&autostart=1', async ( { page, until, check, shot, command } ) => {

	const s = await until( playing, 120000, 'the demo starts' );
	check( s?.svName === 'demo1', 'the demo edition starts on demo1', s?.svName );
	await command( 'volume 0; bgmvolume 0; r_dof 0' );
	await page.mouse.click( 640, 400 ); await sleep( 3000 ); await shot( 'demo1' );

} );

// A native protocol-19 demo through the read-only decoder.
await scenario( 'playdemo', '?game=hexen2', async ( { until, check, shot, command } ) => {

	await until( s => s.keyDest === 3, 60000, 'the menu opens' );
	await command( 'volume 0; bgmvolume 0; r_dof 0; playdemo demo1' );
	const s = await until( s => s.demo && s.clsState === 2 && s.world, 60000, 'demo1.dem plays' );
	check( s, 'demo1.dem plays back', s?.world );
	await sleep( 5000 ); await shot( 'demo1-dem' );
	const later = await until( s => s.demo, 2000, 'the demo keeps playing' );
	check( later, 'the demo is still playing after five seconds' );

} );

await browser.close();
server.kill();
report.ok = report.scenarios.every( s => s.checks.every( c => c.ok ) );
if ( ! report.ok && serverLog ) report.serverLog = serverLog;
await writeFile( resolve( out, 'trial.json' ), JSON.stringify( report, null, 2 ) + '\n' );
for ( const s of report.scenarios ) {

	const failed = s.checks.filter( c => ! c.ok );
	console.log( `${failed.length ? 'FAIL' : 'PASS'} ${s.name}: ${s.checks.length - failed.length}/${s.checks.length}` + ( failed.length ? ' — ' + failed.map( c => c.what ).join( '; ' ) : '' ) + ( s.consoleErrors.length ? ` (${s.consoleErrors.length} console errors)` : '' ) );

}
process.exit( report.ok ? 0 : 1 );
