// Launch headless Chrome, load the real game page, sample the loading screen
// every 50 ms until it is removed, and save screenshots along the way.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const out = process.argv[ 2 ];
const chrome = spawn( '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [ '--headless=new', '--enable-unsafe-swiftshader', '--remote-debugging-port=9333', '--window-size=1280,720', '--user-data-dir=' + out + '/profile', 'about:blank' ], { stdio: 'ignore' } );
await new Promise( r => setTimeout( r, 1500 ) );
const targets = await ( await fetch( 'http://127.0.0.1:9333/json' ) ).json();
const ws = new WebSocket( targets.find( t => t.type === 'page' ).webSocketDebuggerUrl );
await new Promise( r => ws.onopen = r );
let id = 0; const waiting = new Map(); const errors = [];
ws.onmessage = e => { const m = JSON.parse( e.data ); if ( m.id && waiting.has( m.id ) ) { waiting.get( m.id )( m ); waiting.delete( m.id ); } if ( m.method === 'Runtime.exceptionThrown' ) errors.push( m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text ); if ( m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error' ) errors.push( m.params.args.map( a => a.value ?? a.description ).join( ' ' ) ); };
const send = ( method, params = {} ) => new Promise( r => { const i = ++ id; waiting.set( i, r ); ws.send( JSON.stringify( { id: i, method, params } ) ); } );
await send( 'Runtime.enable' ); await send( 'Page.enable' );
// Slow the download so intermediate states are observable (≈ 4 MB/s).
await send( 'Network.enable' ); await send( 'Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: 4e6, uploadThroughput: 1e6 } );
await send( 'Page.navigate', { url: 'http://localhost:8766/index.html' } );
const seen = []; const shots = new Set(); const t0 = Date.now();
while ( Date.now() - t0 < 60000 ) {

	const r = await send( 'Runtime.evaluate', { expression: `(() => { const l = document.getElementById('loading'); const f = document.getElementById('loading-fill'); return JSON.stringify( l ? { now: l.getAttribute('aria-valuenow'), y: f && f.getAttribute('y'), h: f && f.getAttribute('height') } : { removed: true, canvas: !! document.querySelector('canvas') } ); })()`, returnByValue: true } );
	const v = JSON.parse( r.result?.result?.value || '{}' );
	if ( ! seen.length || JSON.stringify( seen[ seen.length - 1 ].v ) !== JSON.stringify( v ) ) seen.push( { t: Date.now() - t0, v } );
	for ( const mark of [ 30, 60 ] ) if ( ! shots.has( mark ) && Number( v.now ) >= mark ) { shots.add( mark ); const s = await send( 'Page.captureScreenshot' ); writeFileSync( `${out}/real-${mark}.png`, Buffer.from( s.result.data, 'base64' ) ); }
	if ( v.removed ) { await new Promise( r => setTimeout( r, 1500 ) ); const s = await send( 'Page.captureScreenshot' ); writeFileSync( `${out}/real-after.png`, Buffer.from( s.result.data, 'base64' ) ); break; }
	await new Promise( r => setTimeout( r, 50 ) );

}
const nows = seen.filter( s => s.v.now !== undefined ).map( s => Number( s.v.now ) );
console.log( 'samples', seen.length, 'first', JSON.stringify( seen[ 0 ] ), 'last', JSON.stringify( seen[ seen.length - 1 ] ) );
console.log( 'progress values', nows.length, 'monotonic', nows.every( ( v, i ) => i === 0 || v >= nows[ i - 1 ] ), 'min', Math.min( ...nows ), 'max', Math.max( ...nows ) );
console.log( 'errors', JSON.stringify( errors.slice( 0, 10 ) ) );
ws.close(); chrome.kill();
