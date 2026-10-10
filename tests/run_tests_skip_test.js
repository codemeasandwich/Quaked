// The test harness's missing-input skips (tools/run_tests.mjs, baseline debt D8, card [44g]): a test that fails only
// because one of the listed local inputs is absent is reported as skipped with the input named, never as passed; any
// other failure still fails; a suite that cannot load for a missing input is skipped as a whole.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const runner = fileURLToPath( new URL( '../tools/run_tests.mjs', import.meta.url ) );
const dir = mkdtempSync( join( tmpdir(), 'quaked-skip-' ) );
const run = ( name, source ) => {

	const file = join( dir, name );
	writeFileSync( file, source );
	const r = spawnSync( process.execPath, [ runner, file ], { encoding: 'utf8', env: process.env } );
	return { out: r.stdout + r.stderr, status: r.status };

};

Deno.test( 'a test missing a listed local input is skipped and named; an ordinary failure still fails', () => {

	const r = run( 'mixed_test.js', `
		import { readFileSync } from 'node:fs';
		Deno.test( 'passes', () => {} );
		Deno.test( 'needs the donor', () => { readFileSync( '/nowhere/rocketlauncher.zip' ); } );
		Deno.test( 'really fails', () => { throw new Error( 'a real defect' ); } );
	` );
	check( /SKIP needs the donor: missing local input \/nowhere\/rocketlauncher\.zip/.test( r.out ), 'the skip names the input' );
	check( /FAIL really fails/.test( r.out ), 'an ordinary error still fails' );
	check( /RESULT 1\/2 passed, 1 skipped/.test( r.out ) && r.status !== 0, 'the skip is not counted as a pass; the failure fails the run' );

} );

Deno.test( 'a missing file that is not a listed input fails; a suite that cannot load for a listed input is skipped', () => {

	const other = run( 'other_test.js', `
		import { readFileSync } from 'node:fs';
		Deno.test( 'reads a source file', () => { readFileSync( '/nowhere/src/engine/host.js' ); } );
	` );
	check( /FAIL reads a source file/.test( other.out ) && other.status !== 0, 'an unlisted missing file is a failure' );
	const whole = run( 'whole_test.js', `
		import { readFileSync } from 'node:fs';
		readFileSync( '/nowhere/supernailgun2.zip' );
		Deno.test( 'never registered', () => {} );
	` );
	check( /SKIP \(whole suite\) missing local input: \/nowhere\/supernailgun2\.zip/.test( whole.out ) && /RESULT 0\/0 passed, 1 skipped/.test( whole.out ) && whole.status === 0, 'skipped as a whole, input named' );

} );
