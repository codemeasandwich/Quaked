// Run the existing Deno-style tests under Node with real Three.js. Each file
// gets a separate process so top-level fixture setup cannot corrupt defaults
// in another test file. No downloads or dependency installation are performed.
import { register } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

if ( ! process.env.QUAKED_THREE_MODULE ) throw new Error( 'Set QUAKED_THREE_MODULE to the absolute path of Three.js 0.183.0 three.module.js (with its three.core.js sibling).' );
const files = process.argv.slice( 2 );
// The local inputs a clean checkout lacks (baseline debt D8, card [44g]): when a test or a whole suite fails only
// because one of these is absent (or unreadable), it is reported as skipped with the input named, never as passed.
const LOCAL_INPUT = /(?:rocketlauncher|thuderbolt|supershotgun|supernailgun2?)\.zip|fieldlab-fx-3d-updated\.html|arc-weapons-wall-canvas-shotgun\.html|demon-vision\.html|player-face-layers-v4\.4\.0\.html|newer\/hud\/playerface\/blood\.png|\/resources\/|PAK3\.pk3|rockfield-v1\.[06]\.0\.html/i;
function missingInput( error ) {

	const text = String( error?.message ?? error ?? '' );
	const file = /(?:ENOENT|EPERM|EACCES)[^']*'([^']+)'/.exec( text )?.[ 1 ];
	if ( file && LOCAL_INPUT.test( file ) ) return file;
	if ( /Command failed: git /.test( text ) && ! existsSync( resolve( '.git' ) ) ) return 'git history (this tree is not a git checkout)';
	return null;

}
if ( files[ 0 ] !== '--worker' ) {

	let passed = 0, total = 0, skipped = 0, failed = false;
	for ( const file of files.length ? files : [ 'tests/weapons_test.js', 'tests/weapon_review_test.js', 'tests/weapons_refinement_test.js', 'tests/axe_original_test.js', 'tests/weapon_modes_test.js', 'tests/weapon_preload_test.js', 'tests/supernailgun_profile_test.js' ] ) {

		const child = spawnSync( process.execPath, [ fileURLToPath( import.meta.url ), '--worker', file ], { encoding: 'utf8' } );
		process.stdout.write( child.stdout || '' ); process.stderr.write( child.stderr || '' );
		const count = /RESULT (\d+)\/(\d+) passed/.exec( child.stdout || '' );
		if ( count ) { passed += Number( count[ 1 ] ); total += Number( count[ 2 ] ); }
		skipped += Number( /, (\d+) skipped/.exec( child.stdout || '' )?.[ 1 ] ?? 0 );
		if ( child.status !== 0 ) failed = true;

	}
	console.log( `TOTAL ${passed}/${total} passed${skipped ? `, ${skipped} skipped (missing local inputs)` : ''}` ); process.exitCode = failed ? 1 : 0;

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
	await import( '../src/engine/render/gl_rsurf.js' );
	// Newer Game plugs into the engine's hooks, as the page's entry does (src/engine/common/hooks.js, card [44g] D1b).
	await import( '../src/newer/install.js' );
	try { await import( pathToFileURL( resolve( files[ 1 ] ) ).href ); }
	catch ( error ) {

		// a suite that cannot even load because a local input is absent: skipped as a whole, the input named
		const input = missingInput( error );
		if ( input === null ) throw error;
		console.log( `SKIP (whole suite) missing local input: ${input}` );
		console.log( `RESULT 0/0 passed, 1 skipped (${files[ 1 ]})` ); process.exitCode = 0;
		process.exit();

	}
	let passed = 0, skipped = 0;
	for ( const { name, fn } of tests ) {

		try { await fn(); passed ++; console.log( 'PASS ' + name ); }
		catch ( error ) {

			const input = missingInput( error );
			if ( input !== null ) { skipped ++; console.log( `SKIP ${name}: missing local input ${input}` ); }
			else console.error( 'FAIL ' + name, error.stack );

		}

	}
	const run = tests.length - skipped;
	console.log( `RESULT ${passed}/${run} passed${skipped ? `, ${skipped} skipped` : ''} (${files[ 1 ]})` ); process.exitCode = passed === run ? 0 : 1;

}
