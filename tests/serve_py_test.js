// tools/serve.py (card [34b]): the local server that answers byte ranges, so the game catalogue can check a pack you
// own without downloading it. A range gives 206 with exactly those bytes and the archive's size; a whole-file request
// is as Python's own server gives it; a range past the end gives 416.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const root = fileURLToPath( new URL( '..', import.meta.url ) ), python = process.env.QUAKED_PYTHON || 'python3';
const port = 20000 + Math.floor( Math.random() * 20000 ), url = `http://127.0.0.1:${port}/games/shareware/pak0.pak`;

Deno.test( 'ranges are served as 206 with the right bytes; whole files as before; past the end is 416', async () => {

	const server = spawn( python, [ 'tools/serve.py', String( port ) ], { cwd: root, stdio: 'ignore' } );
	try {

		let up = false;
		for ( let i = 0; i < 50 && ! up; i ++ ) { try { await fetch( url, { method: 'HEAD' } ); up = true; } catch { await new Promise( r => setTimeout( r, 100 ) ); } }
		check( up, 'the server started' );
		const pak = readFileSync( root + 'games/shareware/pak0.pak' );
		const r = await fetch( url, { headers: { Range: 'bytes=4-11' } } ), body = Buffer.from( await r.arrayBuffer() );
		check( r.status === 206 && r.headers.get( 'content-range' ) === `bytes 4-11/${pak.length}`, 'a range: 206 with the archive size' );
		check( body.equals( pak.subarray( 4, 12 ) ), 'exactly those bytes' );
		const whole = await fetch( url ); const all = Buffer.from( await whole.arrayBuffer() );
		check( whole.status === 200 && all.equals( pak ), 'no range: the whole file' );
		const past = await fetch( url, { headers: { Range: `bytes=${pak.length + 10}-${pak.length + 20}` } } );
		check( past.status === 416, 'past the end: 416' );

	} finally { server.kill(); }

} );
