// The games layout (card [34a]): the shareware pak0.pak ships from games/shareware/ byte for byte as before, with no
// copy left at the root; every game and add-on folder has its README; Git tracks only the shareware pak and the
// READMEs, never an owned game put there; the page and the room server load the new path, with the old root path as a
// fallback for older deployments.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath( new URL( '..', import.meta.url ) );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const SHAREWARE = 'games/shareware/pak0.pak', SHAREWARE_SHA256 = '35a9c55e5e5a284a159ad2a62e0e8def23d829561fe2f54eb402dbc0a9a946af';
const FOLDERS = [ 'shareware', 'Quake', 'Scourge of Armagon', 'Dissolution of Eternity', 'Dimension of the Past', 'Dimension of the Machine',
	'Dawn of the Machine', 'Arcane Dimensions', 'Quoth', 'Malice', 'X-Men', 'Abyss of Pandemonium' ];

Deno.test( 'the shareware pak is in games/shareware/, unchanged, and no copy is left at the root', () => {

	const bytes = readFileSync( root + SHAREWARE );
	check( createHash( 'sha256' ).update( bytes ).digest( 'hex' ) === SHAREWARE_SHA256, 'byte parity with the shipped shareware pak' );
	check( bytes.toString( 'latin1', 0, 4 ) === 'PACK', 'a PACK archive' );
	check( ! existsSync( root + 'pak0.pak' ), 'no root pak0.pak duplicate' );
	check( encodeURI( SHAREWARE ) === SHAREWARE, 'its URL needs no encoding (no spaces or capitals to differ on a case-sensitive host)' );

} );

Deno.test( 'every game and add-on folder has a README; Dawn of the Machine is a placeholder', () => {

	const present = new Set( readdirSync( root + 'games', { withFileTypes: true } ).filter( d => d.isDirectory() ).map( d => d.name ) );
	for ( const name of FOLDERS ) check( present.has( name ) && existsSync( `${root}games/${name}/README.md` ), `games/${name}/README.md` );
	check( /placeholder/i.test( readFileSync( `${root}games/Dawn of the Machine/README.md`, 'utf8' ) ), 'Dawn of the Machine says it is a placeholder' );
	check( existsSync( root + 'games/README.md' ), 'the layout is explained' );

} );

Deno.test( 'Git tracks only the shareware pak and the READMEs in games/; owned content is ignored', () => {

	const ignored = path => {

		const r = spawnSync( 'git', [ 'check-ignore', '-q', '--no-index', path ], { cwd: root } );
		if ( r.status !== 0 && r.status !== 1 ) throw new Error( 'Command failed: git check-ignore ' + path + ' ' + r.stderr );
		return r.status === 0;

	};
	for ( const path of [ SHAREWARE, 'games/README.md', 'games/Quake/README.md', 'games/Scourge of Armagon/README.md', 'games/Dawn of the Machine/README.md' ] )
		check( ! ignored( path ), `tracked: ${path}` );
	for ( const path of [ 'games/Quake/pak0.pak', 'games/Quake/id1/pak0.pak', 'games/Scourge of Armagon/pak0.pak', 'games/Dimension of the Machine/pak0.pak',
		'games/shareware/pak1.pak', 'games/shareware/maps/e1m1.bsp', 'games/stray.pak', 'games/X-Men/xmen.pak', 'games/Arcane Dimensions/progs.dat' ] )
		check( ignored( path ), `ignored: ${path}` );

} );

Deno.test( 'no Python tool or test reads the shareware pak at its old root path', () => {

	const offenders = [];
	for ( const dir of [ 'tools', 'tools/texture_sheets', 'tools/glass_materials', 'tests' ] ) for ( const name of readdirSync( root + dir ) ) {

		if ( ! name.endsWith( '.py' ) ) continue;
		const text = readFileSync( `${root}${dir}/${name}`, 'utf8' );
		if ( /ROOT\s*\/\s*['"]pak0\.pak['"]/.test( text ) ) offenders.push( `${dir}/${name}` );

	}
	check( offenders.length === 0, 'reads ROOT/pak0.pak: ' + offenders.join( ', ' ) );

} );

Deno.test( 'the page and the room server load the new path, falling back to the old root path', () => {

	const main = readFileSync( root + 'main.js', 'utf8' ), server = readFileSync( root + 'server/game_server.js', 'utf8' );
	check( /COM_FetchPak\( 'games\/shareware\/pak0\.pak', 'pak0\.pak'/.test( main ), 'the page fetches games/shareware/pak0.pak' );
	check( /sharewarePak \?\? await COM_FetchPak\( 'pak0\.pak', 'pak0\.pak'/.test( main ), 'and then the root path an older deployment serves' );
	check( /pakPath: '\.\.\/games\/shareware\/pak0\.pak'/.test( server ), 'the room server reads ../games/shareware/pak0.pak from server/' );
	check( /replace\(\/games\\\/shareware\\\/pak0\\\.pak\$\/, 'pak0\.pak'\)/.test( server ), 'and then the old root path' );
	for ( const p of [ 'server/lobby_server.js', 'server/room_process_manager.ts' ] )
		check( readFileSync( root + p, 'utf8' ).includes( "'/opt/three-quake/games/shareware/pak0.pak'" ), `${p}: the production default follows the layout` );

} );
