// Run the existing Deno-style tests under Node with real Three.js. Each file
// gets a separate process so top-level fixture setup cannot corrupt defaults
// in another test file. No downloads or dependency installation are performed.
import { register } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { existsSync, accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

if ( ! process.env.QUAKED_THREE_MODULE ) throw new Error( 'Set QUAKED_THREE_MODULE to the absolute path of Three.js 0.183.0 three.module.js (with its three.core.js sibling).' );
const files = process.argv.slice( 2 );
// The local inputs a clean checkout lacks (baseline debt D8, card [44g]): when a test or a whole suite fails only
// because one of these is really absent (or, for the PAK3 outside the repository, unreadable here), it is reported
// as skipped with the input named, never as passed. Each input is matched at its own location, and only when it is
// in fact missing, so a wrong name under an input that is present, or a refused write, still fails.
const ROOT = process.cwd();
const LISTED = new Set( [ 'rocketlauncher.zip', 'thuderbolt.zip', 'supershotgun.zip', 'supernailgun.zip', 'supernailgun2.zip',
	'fieldlab-fx-3d-updated.html', 'arc-weapons-wall-canvas-shotgun.html', 'demon-vision.html', 'player-face-layers-v4.4.0.html',
	'newer/hud/playerface/blood.png', 'rockfield-v1.0.0.html', 'rockfield-v1.6.0.html' ].map( f => resolve( ROOT, f ) ) );
const RESOURCES = resolve( ROOT, 'resources' ), PAK3 = resolve( homedir(), 'Downloads/Quake/Id1/PAK3.pk3' );
const unreadable = path => { try { accessSync( path, constants.R_OK ); return false; } catch { return true; } };
function missingInput( error ) {

	const text = String( error?.message ?? error ?? '' );
	const code = error?.code ?? /\b(ENOENT|EPERM|EACCES)\b/.exec( text )?.[ 1 ];
	const quoted = error?.path ?? /(?:ENOENT|EPERM|EACCES)[^']*'([^']+)'/.exec( text )?.[ 1 ];
	if ( quoted ) {

		const path = resolve( quoted );
		if ( code === 'ENOENT' ) {

			if ( LISTED.has( path ) && ! existsSync( path ) ) return path;
			if ( path.startsWith( RESOURCES + sep ) && ! existsSync( RESOURCES ) ) return RESOURCES;
			if ( process.env.QUAKED_OWNED_PAK && path === resolve( process.env.QUAKED_OWNED_PAK ) && ! existsSync( path ) ) return path;
			if ( path === PAK3 && ! existsSync( PAK3 ) ) return PAK3;

		}
		// the owner's PAK3 lives outside the repository, where this process may not be allowed to read
		if ( ( code === 'EPERM' || code === 'EACCES' ) && path === PAK3 && unreadable( PAK3 ) ) return PAK3 + ' (not readable here)';

	}
	if ( /Command failed: git /.test( text ) && ! existsSync( resolve( ROOT, '.git' ) ) ) return 'git history (this tree is not a git checkout)';
	return null;

}
if ( files[ 0 ] !== '--worker' ) {

	let passed = 0, total = 0, skipped = 0, failed = false;
	for ( const file of files.length ? files : [ 'tests/weapons_test.js', 'tests/weapon_review_test.js', 'tests/weapons_refinement_test.js', 'tests/axe_original_test.js', 'tests/weapon_modes_test.js', 'tests/weapon_preload_test.js', 'tests/supernailgun_profile_test.js' ] ) {

		const child = spawnSync( process.execPath, [ fileURLToPath( import.meta.url ), '--worker', file ], { encoding: 'utf8' } );
		process.stdout.write( child.stdout || '' ); process.stderr.write( child.stderr || '' );
		const count = /RESULT (\d+)\/(\d+) passed/.exec( child.stdout || '' );
		if ( count ) { passed += Number( count[ 1 ] ); total += Number( count[ 2 ] ); }
		skipped += Number( /^RESULT \d+\/\d+ passed, (\d+) skipped/m.exec( child.stdout || '' )?.[ 1 ] ?? 0 );
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
	let suiteSkipped = null;
	try { await import( pathToFileURL( resolve( files[ 1 ] ) ).href ); }
	catch ( error ) {

		// a suite that cannot even load because a local input is absent: skipped as a whole, the input named
		suiteSkipped = missingInput( error );
		if ( suiteSkipped === null ) throw error;
		console.log( `SKIP (whole suite) missing local input: ${suiteSkipped}` );
		tests.length = 0;

	}
	let passed = 0, skipped = suiteSkipped === null ? 0 : 1;
	for ( const { name, fn } of tests ) {

		try { await fn(); passed ++; console.log( 'PASS ' + name ); }
		catch ( error ) {

			const input = missingInput( error );
			if ( input !== null ) { skipped ++; console.log( `SKIP ${name}: missing local input ${input}` ); }
			else console.error( 'FAIL ' + name, error.stack );

		}

	}
	const run = tests.length - ( suiteSkipped === null ? skipped : 0 );
	console.log( `RESULT ${passed}/${run} passed${skipped ? `, ${skipped} skipped` : ''} (${files[ 1 ]})` ); process.exitCode = passed === run ? 0 : 1;

}
