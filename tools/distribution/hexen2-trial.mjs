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
// HM uses the same trial at two sizes, plus optional exhaustive page captures and a Quake comparison.
const [ viewportWidth, viewportHeight ] = ( process.env.HEXEN2_TRIAL_VIEWPORT ?? '1280x800' ).split( 'x' ).map( Number );
if ( ! Number.isInteger( viewportWidth ) || ! Number.isInteger( viewportHeight ) || viewportWidth < 320 || viewportHeight < 200 ) throw new Error( 'Invalid HEXEN2_TRIAL_VIEWPORT (expected WxH)' );
const allMenuPages = process.env.HEXEN2_TRIAL_MENU_ALL === '1';

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
	const context = await browser.newContext( { viewport: { width: viewportWidth, height: viewportHeight }, deviceScaleFactor: 2 } );
	const page = await context.newPage();
	const result = { name, query, checks: [], shots: [], consoleErrors: [], pageErrors: [], failedRequests: [], missingAssets: [], notes: {} };
	page.on( 'response', r => { if ( r.status() >= 400 ) result.failedRequests.push( r.status() + ' ' + decodeURIComponent( new URL( r.url() ).pathname ) ); } );
	page.on( 'console', m => {

		if ( m.type() === 'error' ) result.consoleErrors.push( m.text().slice( 0, 300 ) );
		// a game picture or file the engine asked for and could not find (a Quake path used under Hexen II, say)
		const missing = m.text().match( /(?:Draw_CachePic: failed to load|Couldn't load) (\S+)/ );
		if ( missing && ! result.missingAssets.includes( missing[ 1 ] ) ) result.missingAssets.push( missing[ 1 ] );

	} );
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
	// the engine's own console (Con_Printf never reaches the browser console)
	try {

		const lines = await page.evaluate( async () => ( await import( '/src/engine/common/console.js' ) ).Con_RecentLines( 1000 ) );
		for ( const line of lines ) {

			const missing = line.match( /(?:Draw_CachePic: failed to load|Couldn't load) (\S+)/i );
			if ( missing && ! result.missingAssets.includes( missing[ 1 ] ) ) result.missingAssets.push( missing[ 1 ] );

		}

	} catch ( error ) { check( false, 'the engine console can be read', String( error ) ); }
	check( result.missingAssets.length === 0, 'every game picture and file the engine asked for was found', result.missingAssets );
	report.scenarios.push( result );
	await context.close();

}

const music = async ( page, until = 30000 ) => {

	const end = Date.now() + until;
	let last = null;
	while ( Date.now() < end ) {

		last = await page.evaluate( async () => { const m = ( await import( '/src/engine/client/hexen2_music.js' ) ).Hexen2_LastMusic(); return m && { name: m.name, ok: m.ok, format: m.format ?? null, path: m.path ?? null, reason: m.reason ?? null }; } );
		if ( last && ( last.ok || last.reason ) ) return last;
		await sleep( 500 );

	}
	return last;

};
const key = ( page, name, times = 1 ) => ( async () => { for ( let i = 0; i < times; i ++ ) { await page.keyboard.press( name ); await sleep( 160 ); } } )();
// a live client is ca_connected (2) with every signon received (client.js SIGNONS)
const playing = s => s.svActive && s.clsState === 2 && s.signon === 4;

// Menus: the native pages through the high-resolution skin, and the scrolling help.
await scenario( 'menus', '?game=hexen2', async ( { page, state, until, check, shot, result } ) => {

	// like Quake: the title demos play (Enhanced | Classic halves) and Escape brings the menu up over them
	const attract = await until( s => s.demo && s.world, 90000, 'the title demo plays' );
	check( attract && attract.keyDest !== 3, 'Hexen II starts on its title demo, not the menu', attract );
	await sleep( 3000 ); await shot( 'attract' );
	await key( page, 'Escape' );
	const s = await until( s => s.keyDest === 3 && s.menu > 0, 10000, 'Escape opens the main menu' );
	check( s && s.demo, 'the menu opens over the playing demo', s );
	// no click: a click on a menu row chooses it; the trial's page already has the keyboard focus
	await sleep( 2500 ); // the title slides down
	await shot( 'main' );
	// the page each step reached, by the Hexen page names (a flaky key shows as a named wrong page, not a bad shot)
	const pageName = () => page.evaluate( async () => { const mc = await import( '/src/engine/client/menu_common.js' ); const h = ( await import( '/src/engine/client/menu_hexen2.js' ) ).M_Hexen2_State(); return Object.entries( h ).find( ( [ k, v ] ) => v === mc.m_state && typeof v === 'number' && ! /Cursor|Percent|Target/.test( k ) )?.[ 0 ] ?? String( mc.m_state ); } );
	const helpState = () => page.evaluate( async () => ( await import( '/src/engine/client/menu_hexen2_help.js' ) ).M_Hexen2_HelpState() );
	await key( page, 'ArrowDown', 2 ); await key( page, 'Enter' ); await sleep( 1200 );
	check( ( await pageName() ) === 'options', 'Down, Down, Enter opens Options', await pageName() );
	await shot( 'options' );
	await key( page, 'Escape' ); await key( page, 'ArrowDown' ); await key( page, 'Enter' ); await sleep( 800 );
	check( ( await pageName() ) === 'help', 'Escape, Down, Enter opens Help', await pageName() );
	await shot( 'help-top' );
	await key( page, 'ArrowDown', 6 ); await sleep( 500 );
	await shot( 'help-scrolled' );
	// held, Down scrolls steadily (menus get no key repeat; the page reads the held key)
	const beforeHold = ( await helpState() ).scroll;
	await page.keyboard.down( 'ArrowDown' ); await sleep( 1500 ); await page.keyboard.up( 'ArrowDown' ); await sleep( 300 );
	const afterHold = ( await helpState() ).scroll;
	result.notes.helpHold = { before: beforeHold, after: afterHold };
	check( afterHold - beforeHold > 3 * 8, 'holding Down scrolls the help steadily', { before: beforeHold, after: afterHold } );
	await shot( 'help-held' );
	await key( page, 'End' ); await sleep( 500 );
	await shot( 'help-end' );
	await key( page, 'Escape' ); await key( page, 'ArrowUp', 3 ); await key( page, 'Enter' ); await sleep( 1200 );
	await shot( 'single-player' );
	// the credits (Quit) and Customize Controls pages: small text in the game's own pixel font
	await key( page, 'Escape' ); await key( page, 'ArrowUp' ); await key( page, 'Enter' ); await sleep( 1500 );
	check( ( await pageName() ) === 'quit', 'Up from Single Player, Enter opens the credits (Quit)', await pageName() );
	await shot( 'quit' );
	await key( page, 'n' ); await key( page, 'ArrowUp', 2 ); await key( page, 'Enter' ); await sleep( 800 );
	check( ( await pageName() ) === 'options', 'Up, Up, Enter opens Options again', await pageName() );
	await key( page, 'Enter' ); await sleep( 800 );
	check( ( await pageName() ) === 'keys', 'Enter on Customize Controls opens the keys page', await pageName() );
	await shot( 'keys' );
	check( ( await state() ).menu > 0, 'the menus stay up through the walk' );
	if ( allMenuPages ) {
		// Use native public page entry points, then read the actual state: wrong pages cannot masquerade as captures.
		const pages = [
			[ 'main', 'menu_hexen2', 'M_Hexen2_Menu_Main_f', 'm_hexen2_main' ],
			[ 'single-player', 'menu_hexen2', 'M_Hexen2_Menu_SinglePlayer_f', 'm_hexen2_single' ],
			[ 'class', 'menu_hexen2', 'M_Hexen2_Menu_Class_f', 'm_hexen2_class' ],
			[ 'difficulty', 'menu_hexen2', 'M_Hexen2_Menu_Skill_f', 'm_hexen2_skill' ],
			[ 'multiplayer', 'menu_hexen2_multiplayer', 'M_Hexen2_Menu_Multiplayer_f', 'm_hexen2_multiplayer' ],
			[ 'setup', 'menu_hexen2_multiplayer', 'M_Hexen2_Menu_Setup_f', 'm_hexen2_setup' ],
			[ 'load', 'menu_hexen2_multiplayer', 'M_Hexen2_Menu_Load_f', 'm_hexen2_load' ],
			[ 'options', 'menu_hexen2_options', 'M_Hexen2_Menu_Options_f', 'm_hexen2_options' ],
			[ 'keys', 'menu_hexen2_options', 'M_Hexen2_Menu_Keys_f', 'm_hexen2_keys' ],
			[ 'video', 'menu_options', 'M_Menu_Video_f', 'm_video' ],
			[ 'help', 'menu_hexen2_help', 'M_Hexen2_Menu_Help_f', 'm_hexen2_help' ],
			[ 'quit', 'menu_hexen2_help', 'M_Hexen2_Menu_Quit_f', 'm_hexen2_quit' ]
		];
		const openPage = async ( label, module, open, expected ) => {
			const reached = await page.evaluate( async ( { module, open, expected } ) => {
				( await import( '/src/engine/client/' + module + '.js' ) )[ open ]();
				const common = await import( '/src/engine/client/menu_common.js' );
				return { actual: common.m_state, expected: common[ expected ] };
			}, { module, open, expected } );
			check( Number.isInteger( reached.expected ) && reached.actual === reached.expected, 'HM page: ' + label, reached );
			await sleep( 2200 );
			const skin = await page.evaluate( async () => ( await import( '/src/newer/ui/menu_webgl.js' ) ).MainMenu_Snapshot() );
			check( skin.ready && ! skin.error, 'HM vector renderer ready: ' + label, skin.error );
			await shot( 'all-' + label );
		};
		for ( const args of pages ) await openPage( ...args );
		// Native Save requires a local game; starting one is sufficient, and no save is written by opening the page.
		await page.evaluate( async () => ( await import( '/src/engine/common/cmd.js' ) ).Cbuf_AddText( 'map demo1\n' ) );
		await until( playing, 120000, 'a local game for the Save page' );
		await openPage( 'save', 'menu_hexen2_multiplayer', 'M_Hexen2_Menu_Save_f', 'm_hexen2_save' );
	}

} );

// Optional HM comparison, on Quake's own menu/demo path and the exact same viewport.
if ( allMenuPages ) await scenario( 'quake-menu', '?game=quake', async ( { page, until, shot, check } ) => {
	await until( s => s.world && s.demo, 90000, 'Quake title demo' );
	await key( page, 'Escape' );
	const state = await until( s => s.keyDest === 3 && s.menu > 0, 10000, 'Quake main menu' );
	check( state?.demo, 'Quake menu remains over its title demo', state );
	await sleep( 2200 ); await shot( 'main' );
} );

// The base game: start, move, attack, hub travel and back, save and load, enhanced on and off.
await scenario( 'base', '?game=hexen2&class=paladin&autostart=1', async ( { page, state, command, until, check, shot, result } ) => {

	const start = await until( playing, 120000, 'demo1 starts' );
	check( start?.svName === 'demo1', 'the base game starts on demo1', start?.svName );
	const baseMusic = await music( page );
	result.notes.music = baseMusic;
	check( baseMusic?.ok && baseMusic.format === 'ogg', 'the base game plays its OGG conversion when the install has one', baseMusic );
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
	// load reads the save repository asynchronously: wait for the restored position, not the first playing frame
	await command( 'load trial1' );
	const near = s => s.origin && saved.origin && Math.hypot( s.origin[ 0 ] - saved.origin[ 0 ], s.origin[ 1 ] - saved.origin[ 1 ] ) < 16;
	const loaded = await until( s => playing( s ) && s.svName === 'demo1' && near( s ), 60000, 'load restores the save' );
	check( loaded, 'load puts the player back where the save was made', { saved: saved.origin, loaded: loaded?.origin } );
	await sleep( 1500 ); await shot( 'loaded' );

} );

// Portal of Praevus and the demo start on their own first maps.
await scenario( 'portals', '?game=hexen2-portals&class=demoness&autostart=1', async ( { page, until, check, shot, command } ) => {

	const s = await until( playing, 120000, 'keep1 starts' );
	check( s?.svName === 'keep1', 'Portal of Praevus starts on keep1', s?.svName );
	await command( 'volume 0; bgmvolume 0; r_dof 0' );
	await page.mouse.click( 640, 400 ); await sleep( 3000 ); await shot( 'keep1' );

} );
await scenario( 'demo', '?game=hexen2-demo&class=paladin&autostart=1', async ( { page, until, check, shot, command, result } ) => {

	const s = await until( playing, 120000, 'the demo starts' );
	check( s?.svName === 'demo1', 'the demo edition starts on demo1', s?.svName );
	// the demo ships its music only as MIDI: the FM synthesiser renders it to a WAV the shared music bus plays
	const demoMusic = await music( page, 60000 );
	result.notes.music = demoMusic;
	check( demoMusic?.ok && demoMusic.format === 'wav' && /\.mid$/.test( demoMusic.path ?? '' ), 'the demo plays its MIDI music through the synthesiser', demoMusic );
	await command( 'volume 0; bgmvolume 0; r_dof 0' );
	await page.mouse.click( 640, 400 ); await sleep( 3000 ); await shot( 'demo1' );

} );

// A native protocol-19 demo through the read-only decoder.
await scenario( 'playdemo', '?game=hexen2', async ( { until, check, shot, command } ) => {

	await until( s => s.demo, 90000, 'the title demo starts' );
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
