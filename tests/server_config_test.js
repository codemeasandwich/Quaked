// The dedicated server's Deno configuration (card [44g], debt D4). The room server (server/game_server.js) loads the
// engine and the renderer's modules, so "three" must be the module the browser loads, not a hand-kept stub: a stub that
// lacked Vector4 stopped every room starting (found in [44g]; 54 of the 85 names the server's modules use were missing).
// The root task must run from server/, where game_server.js and its '../pak0.pak' are. The rooms the lobby spawns use the
// root deno.json, so the same check covers them.
import { readFileSync, readdirSync } from 'node:fs';

const read = p => readFileSync( new URL( '../' + p, import.meta.url ), 'utf8' );
const serverFiles = readdirSync( new URL( '../server', import.meta.url ) );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const browserThree = JSON.parse( read( 'index.html' ).match( /<script type="importmap">([\s\S]*?)<\/script>/ )[ 1 ] ).imports.three;

Deno.test( 'both Deno import maps give the room server the browser\'s own three, pinned to its version', () => {

	check( /^https:\/\/cdn\.jsdelivr\.net\/npm\/three@\d+\.\d+\.\d+\/build\/three\.module\.js$/.test( browserThree ), `index.html pins three: ${browserThree}` );
	for ( const p of [ 'deno.json', 'server/deno.json' ] ) check( JSON.parse( read( p ) ).imports.three === browserThree, `${p} imports the browser's three (${browserThree})` );
	// committed: it pins the CDN files, and Deno cannot write it where the install directory is read-only
	const lock = JSON.parse( read( 'deno.lock' ) ).remote ?? {}, base = browserThree.replace( /three\.module\.js$/, '' );
	for ( const f of [ 'three.module.js', 'three.core.js' ] ) check( /^[0-9a-f]{64}$/.test( lock[ base + f ] ?? '' ), `deno.lock pins ${base + f}` );
	check( ! serverFiles.includes( 'browser_shim.js' ), 'the hand-kept three stub is gone' );
	check( ! /browser_shim/.test( read( 'server/test_imports.js' ) + read( 'server/room_process_manager.ts' ) ), 'nothing in server/ loads the stub' );

} );

Deno.test( 'the root task "server" runs game_server.js from server/ with the root import map', () => {

	const task = JSON.parse( read( 'deno.json' ) ).tasks.server;
	check( /^cd server && deno run /.test( task ), `runs from server/: ${task}` );
	check( / --config \.\.\/deno\.json game_server\.js$/.test( task ), `with the root import map: ${task}` );
	check( / --unstable-net /.test( task ), 'with WebTransport' );
	check( serverFiles.includes( 'game_server.js' ), 'the room server is there' );
	check( /pakPath: '\.\.\/games\/shareware\/pak0\.pak'/.test( read( 'server/game_server.js' ) ), 'which reads ../games/shareware/pak0.pak from server/ (card [34a])' );
	// the lobby spawns each room with the root deno.json beside server/
	check( /serverDir\.replace\( \/server\\\/\$\/, 'deno\.json' \)/.test( read( 'server/room_process_manager.ts' ) ), 'rooms spawned by the lobby use the root deno.json' );

} );
