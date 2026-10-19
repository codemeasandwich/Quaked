// Hexen II's builtin contract (src/engine/progs/hexen2_builtins.js): the pinned uhexen2 pr_builtin[] order, its count,
// the names the interpreter reports, and the slots the native table itself leaves unimplemented. plan section 4.
import { HEXEN2_BUILTINS, HEXEN2_BUILTIN_COUNT, Hexen2_BuiltinName } from '../src/engine/progs/hexen2_builtins.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'the native builtin table has its pinned count, order and names', () => {

	same( HEXEN2_BUILTIN_COUNT, 114, 'pr_numbuiltins' );
	same( HEXEN2_BUILTINS.length, 114, 'the table length' );
	same( Hexen2_BuiltinName( 0 ), 'fixme', 'entry 0' );
	same( Hexen2_BuiltinName( 1 ), 'makevectors', '#1' );
	same( Hexen2_BuiltinName( 2 ), 'setorigin', '#2' );
	same( Hexen2_BuiltinName( 3 ), 'setmodel', '#3' );
	same( Hexen2_BuiltinName( 7 ), 'random', 'random' );
	same( Hexen2_BuiltinName( 14 ), 'spawn', 'spawn' );
	same( Hexen2_BuiltinName( 32 ), 'walkmove', 'walkmove' );
	same( Hexen2_BuiltinName( 51 ), 'vectoangles', 'vectoangles' );
	same( Hexen2_BuiltinName( 66 ), 'setclass', 'setclass' );
	same( Hexen2_BuiltinName( 92 ), 'getstring', 'getstring' );
	same( Hexen2_BuiltinName( 106 ), 'stopsound', 'stopsound' );
	same( Hexen2_BuiltinName( 113 ), 'fixme', 'the last slot is reserved in the native table' );
	same( Hexen2_BuiltinName( 114 ), null, 'past the table' );
	same( Hexen2_BuiltinName( - 1 ), null, 'negative' );
	check( Object.isFrozen( HEXEN2_BUILTINS ), 'the table is frozen' );

} );

Deno.test( 'the native unimplemented slots are exactly entry 0, 39 and the QUAKE2 tail', () => {

	const fixmes = HEXEN2_BUILTINS.map( ( name, index ) => name === 'fixme' ? index : - 1 ).filter( index => index >= 0 );
	same( fixmes.join( ',' ), '0,39,107,108,109,110,111,112,113', 'the native Fixme slots' );

} );
