// The test harness's missing-input skips (tools/run_tests.mjs, baseline debt D8, card [44g]): a test that fails only
// because one of the listed local inputs is really absent is reported as skipped with the input named, never as passed;
// any other failure still fails, including a wrong name under an input that is present and a refused write; a suite
// that cannot load for a missing input is skipped as a whole. Each case runs in its own temporary folder as the
// working directory (the harness looks for the inputs there), removed afterwards.
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const runner = fileURLToPath( new URL( '../tools/run_tests.mjs', import.meta.url ) );
function inFolder( body ) {

	const dir = mkdtempSync( join( tmpdir(), 'quaked-skip-' ) );
	const run = ( name, source ) => {

		const file = join( dir, name );
		writeFileSync( file, source );
		const r = spawnSync( process.execPath, [ runner, file ], { encoding: 'utf8', env: process.env, cwd: dir } );
		return { out: r.stdout + r.stderr, status: r.status };

	};
	try { body( dir, run ); } finally { chmodSync( dir, 0o755 ); rmSync( dir, { recursive: true, force: true } ); }

}

Deno.test( 'a test missing a listed local input is skipped and named; an ordinary failure still fails', () => inFolder( ( dir, run ) => {

	const r = run( 'mixed_test.js', `
		import { readFileSync } from 'node:fs';
		Deno.test( 'passes', () => {} );
		Deno.test( 'needs the donor', () => { readFileSync( 'rocketlauncher.zip' ); } );
		Deno.test( 'really fails', () => { throw new Error( 'a real defect' ); } );
	` );
	check( /SKIP needs the donor: missing local input \S*rocketlauncher\.zip/.test( r.out ), 'the skip names the input' );
	check( /FAIL really fails/.test( r.out ), 'an ordinary error still fails' );
	check( /RESULT 1\/2 passed, 1 skipped/.test( r.out ) && r.status !== 0, 'the skip is not counted as a pass; the failure fails the run' );

} ) );

Deno.test( 'unlisted, wrongly named under a present input, or a refused write: each fails', () => inFolder( ( dir, run ) => {

	const other = run( 'other_test.js', `
		import { readFileSync } from 'node:fs';
		Deno.test( 'reads a source file', () => { readFileSync( 'src/engine/host.js' ); } );
	` );
	check( /FAIL reads a source file/.test( other.out ) && other.status !== 0, 'an unlisted missing file is a failure' );
	mkdirSync( join( dir, 'resources/id1' ), { recursive: true } );
	const wrong = run( 'wrong_test.js', `
		import { readFileSync } from 'node:fs';
		Deno.test( 'misnames the owned pak', () => { readFileSync( 'resources/id1/PAK0.PAK.bak' ); } );
	` );
	check( /FAIL misnames the owned pak/.test( wrong.out ) && wrong.status !== 0, 'a wrong name under a present resources/ fails' );
	mkdirSync( join( dir, 'newer/hud/playerface' ), { recursive: true } ); chmodSync( join( dir, 'newer/hud/playerface' ), 0o555 );
	const write = run( 'write_test.js', `
		import { writeFileSync } from 'node:fs';
		Deno.test( 'writes into a listed place', () => { writeFileSync( 'newer/hud/playerface/blood.png', 'x' ); } );
	` );
	chmodSync( join( dir, 'newer/hud/playerface' ), 0o755 );
	check( /FAIL writes into a listed place/.test( write.out ) && write.status !== 0, 'a refused write fails' );

} ) );

Deno.test( 'a suite that cannot load for a listed input is skipped as a whole, the input named', () => inFolder( ( dir, run ) => {

	const whole = run( 'whole_test.js', `
		import { readFileSync } from 'node:fs';
		readFileSync( 'supernailgun2.zip' );
		Deno.test( 'never registered', () => {} );
	` );
	check( /SKIP \(whole suite\) missing local input: \S*supernailgun2\.zip/.test( whole.out ) && /RESULT 0\/0 passed, 1 skipped/.test( whole.out ) && whole.status === 0, 'skipped as a whole, input named' );

} ) );
