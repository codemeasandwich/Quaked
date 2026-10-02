// Run the existing Deno-style tests under Node with real Three.js. Each file
// gets a separate process so top-level fixture setup cannot corrupt defaults
// in another test file. No downloads or dependency installation are performed.
import { register } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if ( ! process.env.QUAKED_THREE_MODULE ) throw new Error( 'Set QUAKED_THREE_MODULE to the absolute path of Three.js 0.183.0 three.module.js (with its three.core.js sibling).' );
const files = process.argv.slice( 2 );
if ( files[ 0 ] !== '--worker' ) {

	let passed = 0, total = 0, failed = false;
	for ( const file of files.length ? files : [ 'tests/weapons_test.js', 'tests/weapon_review_test.js', 'tests/weapons_refinement_test.js', 'tests/axe_original_test.js', 'tests/weapon_modes_test.js', 'tests/weapon_preload_test.js', 'tests/supernailgun_profile_test.js' ] ) {

		const child = spawnSync( process.execPath, [ fileURLToPath( import.meta.url ), '--worker', file ], { encoding: 'utf8' } );
		process.stdout.write( child.stdout || '' ); process.stderr.write( child.stderr || '' );
		const count = /RESULT (\d+)\/(\d+) passed/.exec( child.stdout || '' );
		if ( count ) { passed += Number( count[ 1 ] ); total += Number( count[ 2 ] ); }
		if ( child.status !== 0 ) failed = true;

	}
	console.log( `TOTAL ${passed}/${total} passed` ); process.exitCode = failed ? 1 : 0;

} else {

	const loader = `let three; export function initialize(data) { three = data.three; }
export async function resolve(specifier, context, next) {
 if (specifier === 'three') return {url: three, shortCircuit: true};
 return next(specifier, context);
}`;
	register( 'data:text/javascript,' + encodeURIComponent( loader ), { data: { three: pathToFileURL( resolve( process.env.QUAKED_THREE_MODULE ) ).href } } );
	const tests = [];
	globalThis.Deno = { readFile, readTextFile: path => readFile( path, 'utf8' ), stat, test: ( name, fn ) => tests.push( { name, fn } ) };
	// Bootstrap the renderer graph before individual test fixtures, as the
	// browser entry does. Direct leaf imports otherwise reach cyclic render
	// definitions before vrect_t is initialized under the real Three runtime.
	await import( '../src/gl_rsurf.js' );
	await import( pathToFileURL( resolve( files[ 1 ] ) ).href );
	let passed = 0;
	for ( const { name, fn } of tests ) {

		try { await fn(); passed ++; console.log( 'PASS ' + name ); }
		catch ( error ) { console.error( 'FAIL ' + name, error.stack ); }

	}
	console.log( `RESULT ${passed}/${tests.length} passed (${files[ 1 ]})` ); process.exitCode = passed === tests.length ? 0 : 1;

}
