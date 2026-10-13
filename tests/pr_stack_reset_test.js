// A QuakeC error abandons the functions that were running: their call frames and locals must not stay counted. WinQuake
// reset only the call depth, and only on PR_RunError; Malice's prop maps (each stopping with "no info_player_start"
// through QuakeC's `error`) left their locals counted until the next level's QuakeC hit "locals stack overflow"
// (docs/add-ons-2026-10-13.md, card c5dc18e1). Through pr_exec.js's public interface.
import { PR_EnterFunction, PR_HostError, PR_SetHostError, PR_StackUsage, PR_ResetStack } from '../src/engine/progs/pr_exec.js';
import { PR_SetGlobalsInt, pr_globals_int, PR_SetStringsData, pr_strings_data } from '../src/engine/progs/progs.js';
const same = ( a, b, m ) => { if ( a !== b ) throw Error( `${m}: ${a} != ${b}` ); };

Deno.test( 'an error empties the QuakeC stacks, so later calls have their locals again', () => {

	const oldInts = pr_globals_int, ints = new Int32Array( 4096 ), f = { locals: 600, parm_start: 0, first_statement: 1, s_name: 0, s_file: 0, numparms: 0, parm_size: [] };
	let inHandler = null; // what Host_Error's own QuakeC (ClientDisconnect) would start on
	const previous = PR_SetHostError( error => { inHandler = PR_StackUsage(); throw Error( 'Host_Error: ' + error ); } );
	const oldStrings = pr_strings_data;
	PR_SetGlobalsInt( ints ); PR_SetStringsData( new Uint8Array( 1 ) ); // the function's name is the empty string
	try {

		PR_ResetStack();
		for ( let i = 0; i < 3; i ++ ) PR_EnterFunction( f ); // three nested calls: 1800 of the 2048 locals
		same( PR_StackUsage().locals, 1800, 'three calls hold their locals' );
		let thrown = '';
		try { PR_HostError( 'Program error' ); } catch ( error ) { thrown = error.message; } // QuakeC's error() mid-call
		same( thrown, 'Host_Error: Program error', 'the error still ends the game through Host_Error' );
		same( inHandler.locals + '/' + inHandler.depth, '0/0', 'released before Host_Error runs, so its own QuakeC starts clean' );
		same( PR_StackUsage().locals, 0, 'the abandoned calls\' locals are released' );
		same( PR_StackUsage().depth, 0, 'and their frames' );
		for ( let i = 0; i < 3; i ++ ) PR_EnterFunction( f ); // the next level's QuakeC: would pass 2048 if they stayed
		same( PR_StackUsage().locals, 1800, 'the next calls fit' );

	} finally {

		PR_ResetStack(); PR_SetHostError( previous ); PR_SetGlobalsInt( oldInts ); PR_SetStringsData( oldStrings );

	}

} );
