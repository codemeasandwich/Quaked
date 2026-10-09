// Browser trial behind docs/animation-audit-2026-10-10.md (card [43]); kept as evidence, not part of the test suite.
// Run from a directory with playwright-core installed, with the game served at http://127.0.0.1:8765 and three.js 0.183.0
// at /private/tmp/quaked-lit-check/: node animation-audit-trial-2026-10-10.mjs e1m1 [monster_class:qc_function,...]
// ('die' as the function runs the class's *_die1). The Bestiary is pre-unlocked: a first-sighting page holds the server.
import { chromium } from 'playwright-core'; import fs from 'node:fs';
const MAP = process.argv[ 2 ] || 'e1m1', CASES = ( process.argv[ 3 ] || 'monster_dog:dog_leap1,monster_dog:die,monster_army:die' ).split( ',' );
const b = await chromium.launch( { executablePath: '/Users/bri/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: true, args: [ '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows' ] } );
const page = await ( await b.newContext( { viewport: { width: 900, height: 560 } } ) ).newPage();
page.on( 'pageerror', e => console.log( '[pageerror]', String( e ).slice( 0, 300 ) ) );
page.on( 'console', m => { if ( /rror|Sys_|PR_|halt|crash/i.test( m.text() ) ) console.log( '[console]', m.text().slice( 0, 400 ) ); } );
await page.route( 'https://cdn.jsdelivr.net/npm/three@0.183.0/**', async r => { const l = '/private/tmp/quaked-lit-check/' + new URL( r.request().url() ).pathname.split( '/' ).pop(); return fs.existsSync( l ) ? r.fulfill( { path: l, contentType: 'text/javascript' } ) : r.continue(); } );
await page.goto( 'http://127.0.0.1:8765/tests/shotgun_trial.html' ); await page.waitForFunction( () => window.shotgunTrial, null, { timeout: 120000 } );
await page.evaluate( async () => { const s = await import( '/src/bestiary_state.js' ); try { localStorage.setItem( 'quaked.bestiary.v1', JSON.stringify( { version: 1, unlocked: [ ...s.BESTIARY_ENTRIES.map( e => e.id ), ...s.BESTIARY_COLLECTION_IDS ] } ) ); } catch ( e ) {} } ); // (no first-sighting page: it holds the game)
await page.evaluate( async m => { await window.shotgunTrial.start( true, m ); }, MAP ); await page.waitForTimeout( 3000 );
const results = {};

for ( const c of CASES ) {
	const [ cls, fn ] = c.split( ':' );
	const r = await page.evaluate( async ( [ cls, fn ] ) => {
		const s = await import( '/src/server.js' ), progs = await import( '/src/progs.js' ), pe = await import( '/src/pr_exec.js' ), ed = await import( '/src/pr_edict.js' ), w = await import( '/src/world.js' ), C = await import( '/src/client.js' );
		const text = progs.PR_GetString;
		for ( const e of s.sv.edicts ) if ( e && ! e.free && ( e.v.flags & 32 ) ) e.v.nextthink = 1e9;
		const used = window._used || ( window._used = new Set() );
		const m = s.sv.edicts.find( e => e && ! e.free && text( e.v.classname ) === cls && e.v.health > 0 && ! used.has( e ) );
		if ( ! m ) return { error: 'no ' + cls };
		used.add( m );
		// bring it 160 units in front of the player (left where the level started), in the most open direction
		const p = s.sv.edicts[ 1 ], P = window._P || ( window._P = Array.from( p.v.origin ) );
		let best = null;
		for ( let yaw = 0; yaw < 360; yaw += 15 ) { const r = yaw * Math.PI / 180, e = [ P[ 0 ] + Math.cos( r ) * 400, P[ 1 ] + Math.sin( r ) * 400, P[ 2 ] ]; const t = w.SV_Move( P, m.v.mins, m.v.maxs, e, 1, p ); if ( ! best || t.fraction > best.f ) best = { yaw, f: t.fraction }; }
		const r = best.yaw * Math.PI / 180, at = [ P[ 0 ] + Math.cos( r ) * 160, P[ 1 ] + Math.sin( r ) * 160, P[ 2 ] ];
		window.shotgunTrial.place( P[ 0 ], P[ 1 ], P[ 2 ], best.yaw, 0 );
		m.v.origin = at; m.v.velocity = [ 0, 0, 0 ]; m.v.flags &= ~ 512; w.SV_LinkEdict( m, false );
		m.v.enemy = progs.EDICT_TO_PROG( p ); m.v.goalentity = m.v.enemy; m.v.ideal_yaw = ( best.yaw + 180 ) % 360; m.v.angles[ 1 ] = m.v.ideal_yaw;
		await new Promise( r => setTimeout( r, 400 ) );
		const call = name => { progs.pr_global_struct.self = progs.EDICT_TO_PROG( m ); progs.pr_global_struct.other = progs.EDICT_TO_PROG( p ); progs.pr_global_struct.time = s.sv.time; pe.PR_ExecuteProgram( progs.pr_functions.indexOf( ed.ED_FindFunction( name ) ) ); };
		if ( fn === 'die' ) { m.v.health = - 5; m.v.takedamage = 0; call( { monster_dog: 'dog_die1', monster_army: 'army_die1', monster_demon1: 'demon1_die1', monster_ogre: 'ogre_die1', monster_knight: 'knight_die1', monster_zombie: 'zombie_die1' }[ cls ] ); }
		else if ( fn !== 'none' ) call( fn );
		window._subject = { index: s.sv.edicts.indexOf( m ), m, last: null };
		return { cls, fn, index: window._subject.index };
	}, [ cls, fn ] );
	if ( r.error ) { console.log( c, r.error ); continue; }
	r.samples = [];
	for ( let i = 0; i < 160; i ++ ) {
		await page.waitForTimeout( 12 );
		r.samples.push( await page.evaluate( async () => { const C = await import( '/src/client.js' ), S = window._subject, ce = C.cl_entities[ S.index ], st = ce._aliasLerp, reset = st !== S.last; S.last = st; const pos = ce._aliasGeo?.attributes?.position?.array; let vx = null; if ( pos ) { vx = [ 0, 0, 0 ]; const n = pos.length / 3; for ( let i = 0; i < n; i ++ ) for ( let k = 0; k < 3; k ++ ) vx[ k ] += Math.abs( pos[ i * 3 + k ] ) / n; }
			return { t: +C.cl.time.toFixed( 4 ), frame: ce.frame, model: ce.model?.name, from: st?.from, to: st?.to, blend: st ? +st.blend.toFixed( 3 ) : null, start: st?.start, interval: st?.interval, lead: st?.lead ? +st.lead.t.toFixed( 3 ) : null, vx, reset, z: +ce.origin[ 2 ].toFixed( 1 ), sv: { frame: S.m.v.frame } }; } ) );
	}
	results[ c ] = r;
	// analysis
	const s = r.samples; let pops = [], resets = [], order = [], prevTo = null, prevBlend = 1, frames = [];
	for ( let i = 0; i < s.length; i ++ ) {
		const q = s[ i ];
		if ( q.reset && i > 0 ) resets.push( [ q.t, q.frame, q.from, q.to ] );
		if ( prevTo !== null && q.to !== prevTo ) { if ( prevBlend < .85 ) pops.push( [ q.t, prevTo, q.to, prevBlend ] ); if ( q.from !== prevTo && ! q.reset ) order.push( [ q.t, prevTo, q.from ] ); frames.push( q.frame ); }
		prevTo = q.to; prevBlend = q.blend;
	}
	// the blend actually reached when each change arrived: ( new start - last start ) / last interval
	const cuts = []; for ( let i = 1; i < s.length; i ++ ) if ( s[ i ].start !== s[ i - 1 ].start && ! s[ i ].reset ) cuts.push( +( ( s[ i ].start - s[ i - 1 ].start ) / ( s[ i - 1 ].interval || .1 ) ).toFixed( 3 ) );
	console.log( c, 'blend reached at each change', JSON.stringify( cuts ), 'cut short (<.99):', cuts.filter( x => x < .99 ).length, 'of', cuts.length );
	const leads = s.filter( ( q, i ) => i > 0 && q.start !== s[ i - 1 ].start && q.lead !== null ).length;
	const steps = s.slice( 1 ).map( ( q, i ) => q.vx && s[ i ].vx && q.model === s[ i ].model ? Math.hypot( q.vx[ 0 ] - s[ i ].vx[ 0 ], q.vx[ 1 ] - s[ i ].vx[ 1 ], q.vx[ 2 ] - s[ i ].vx[ 2 ] ) / Math.max( 1e-3, q.t - s[ i ].t ) : 0 );
	console.log( c, 'changes carrying the pose on screen', leads, 'mesh speed: median', steps.slice().sort( ( a, b ) => a - b )[ steps.length >> 1 ].toFixed( 2 ), 'max', Math.max( ...steps ).toFixed( 2 ) );
	const tail = s.slice( - 20 );
	console.log( c, 'frames', JSON.stringify( frames ), 'resets', JSON.stringify( resets ), 'pops(<.85)', JSON.stringify( pops ), 'order', JSON.stringify( order ), 'end', JSON.stringify( { frame: tail.at( - 1 ).frame, blend: tail.at( - 1 ).blend, steady: tail.every( q => q.frame === tail[ 0 ].frame && q.blend === 1 ) } ) );
}
fs.writeFileSync( 'anim-' + MAP + '.json', JSON.stringify( results ) );
await b.close();
