// PF_Find (QuakeC `find`, builtin #18) as WinQuake's C: a QuakeC string is never NULL there, so an empty search string
// is valid and matches the first entity whose field is empty. Quoth's plats.qc searches with one; the port's JS
// truthiness check stopped e1m2quoth with "PF_Find: bad search string" (add-on support, card c5dc18e1).
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_RETURN } from '../src/engine/progs/pr_comp.js';
import { PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import {
	pr_builtins, pr_numbuiltins, pr_global_struct, pr_globals_float, pr_globals_int, pr_strings_data, sv as progs_sv,
	PR_SetBuiltins, PR_SetGlobalStruct, PR_SetGlobalsFloat, PR_SetGlobalsInt, PR_SetSV, PR_SetStringsData, EDICT_TO_PROG,
} from '../src/engine/progs/progs.js';
import { sv } from '../src/engine/server/server.js';
const same = ( a, b, m ) => { if ( a !== b ) throw Error( `${m}: ${a} != ${b}` ); };

Deno.test( 'find with an empty string matches an empty field instead of stopping the program', () => {

	const old = { builtins: pr_builtins, num: pr_numbuiltins, struct: pr_global_struct, float: pr_globals_float, int: pr_globals_int, sv: progs_sv, strings: pr_strings_data, edicts: sv.edicts, numEdicts: sv.num_edicts, maxEdicts: sv.max_edicts };
	const buffer = new ArrayBuffer( 64 * 4 ), floats = new Float32Array( buffer ), ints = new Int32Array( buffer ), FIELD = 30;
	try {

		sv.edicts = PR_AllocEdicts( 4, 105 ); sv.num_edicts = 4; sv.max_edicts = 4; PR_SetSV( sv );
		PR_SetStringsData( new TextEncoder().encode( '\0door\0' ) ); // offset 0 is the empty string, 1 is "door"
		const [ world, door, plain, other ] = sv.edicts;
		door._fieldAccessor.setInt32( FIELD, 1 ); plain._fieldAccessor.setInt32( FIELD, 0 ); other._fieldAccessor.setInt32( FIELD, 1 );
		PR_SetGlobalStruct( {} ); PR_SetGlobalsFloat( floats ); PR_SetGlobalsInt( ints ); PR_InitBuiltins();
		const find = ( start, text ) => { ints[ OFS_PARM0 ] = EDICT_TO_PROG( start ); ints[ OFS_PARM1 ] = FIELD; ints[ OFS_PARM2 ] = text; pr_builtins[ 18 ](); return ints[ OFS_RETURN ]; };
		same( find( world, 0 ), EDICT_TO_PROG( plain ), 'an empty search finds the first empty field' );
		same( find( world, 1 ), EDICT_TO_PROG( door ), 'a named search still finds its match' );
		same( find( door, 1 ), EDICT_TO_PROG( other ), 'searching on from a match finds the next' );
		same( find( other, 1 ), EDICT_TO_PROG( world ), 'no further match returns the world' );

	} finally {

		PR_SetBuiltins( old.builtins, old.num ); PR_SetGlobalStruct( old.struct ); PR_SetGlobalsFloat( old.float ); PR_SetGlobalsInt( old.int );
		PR_SetSV( old.sv ); PR_SetStringsData( old.strings ); sv.edicts = old.edicts; sv.num_edicts = old.numEdicts; sv.max_edicts = old.maxEdicts;

	}

} );
