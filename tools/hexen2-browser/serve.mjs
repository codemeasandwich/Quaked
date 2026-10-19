// Static server for the Hexen II browser harness: the h2 worktree, Three.js from the main checkout, and the supplied
// Hexen data plus the shareware WAD the engine charset lives in. Local trial only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const ROOT = resolve( import.meta.dirname, '../..' );
const THREE = '/Users/bri/SOURCE/Quaked/node_modules/three/build';
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
const PORTAL = '/Users/bri/quaked/Hexen 2/portals';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
	'.json': 'application/json', '.lmp': 'application/octet-stream', '.dat': 'application/octet-stream',
	'.bsp': 'application/octet-stream', '.pak': 'application/octet-stream', '.png': 'image/png' };

export function startServer() {

	const server = createServer( async ( request, response ) => {

		try {

			const pathname = decodeURIComponent( new URL( request.url, 'http://x' ).pathname );
			let file = null, type = 'application/octet-stream';
			if ( pathname.startsWith( '/three/' ) ) file = resolve( THREE, pathname.slice( 7 ) );
			else if ( pathname.startsWith( '/hexen/' ) ) file = resolve( HEXEN, pathname.slice( 7 ) );
			else if ( pathname.startsWith( '/portal/' ) ) file = resolve( PORTAL, pathname.slice( 8 ) );
			else if ( pathname === '/shareware.pak' ) { file = resolve( ROOT, 'games/shareware/pak0.pak' ); type = TYPES[ '.pak' ]; }
			else file = resolve( ROOT, '.' + pathname );
			if ( !file.startsWith( '/' ) ) { response.writeHead( 404 ).end(); return; }
			const body = await readFile( file );
			type = TYPES[ extname( file ) ] ?? 'application/octet-stream';
			response.writeHead( 200, { 'content-type': type, 'content-length': body.length,
				'access-control-allow-origin': '*', 'cache-control': 'no-store' } ).end( body );

		} catch { response.writeHead( 404 ).end(); }

	} );
	return server;

}
