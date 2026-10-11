// What the model loaders share, on its own (card [44k]): the known-model table hands out one entry a name, the readers
// stop where they should, and a model's radius covers its bounds. Through the public interface of gl_model_common.js.
import * as common from '../src/engine/render/gl_model_common.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

Deno.test( 'Mod_FindName: one entry a name, the same entry when asked again; an empty name is an error', () => {
	const before = common.mod_numknown;
	const a = common.Mod_FindName( 'maps/test_a.bsp' ), b = common.Mod_FindName( 'maps/test_b.bsp' );
	check( a !== b && a.name === 'maps/test_a.bsp' && b.name === 'maps/test_b.bsp', 'two names, two entries' );
	check( common.Mod_FindName( 'maps/test_a.bsp' ) === a && common.mod_numknown === before + 2, 'asked again: the same entry, no new one' );
	let threw = false; try { common.Mod_FindName( '' ); } catch { threw = true; }
	check( threw, 'an empty name is an error' );
} );

Deno.test( 'readString stops at the first NUL or the field\'s end; RadiusFromBounds reaches the farthest corner', () => {
	const bytes = new TextEncoder().encode( 'ab\0cdefgh' );
	check( common.readString( bytes, 0, 9 ) === 'ab', 'to the NUL' );
	check( common.readString( bytes, 3, 4 ) === 'cdef', 'or the field\'s size' );
	const r = common.RadiusFromBounds( [ - 3, - 1, 0 ], [ 1, 4, 12 ] );
	check( Math.abs( r - Math.hypot( 3, 4, 12 ) ) < 1e-6, 'the largest of each axis, as a length (' + r + ')' );
} );
