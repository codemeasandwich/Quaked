// Calls a builtin through the active profile's one table (src/engine/progs/pr_builtin_table.js), not a separate test
// dispatch. A number the profile leaves unimplemented resolves to its refusing function, so a test exercises the same
// dispatch the interpreter uses.
import { PR_ProfileBuiltins } from '../../src/engine/progs/pr_builtin_table.js';

/**
 * Calls the active profile's builtin at a number with an optional interpreter context.
 *
 * @param {number} number the builtin number from a function's negative `first_statement`
 * @param {{ random?: function(): number }} [context] the random source, as rand()/RAND_MAX
 * @returns {boolean} whether the table holds a callable implementation
 */
export function callProfileBuiltin( number, context = { random: () => 0.5 } ) {

	const implementation = PR_ProfileBuiltins()[ number ];
	if ( typeof implementation !== 'function' ) return false;
	implementation( context );
	return true;

}
