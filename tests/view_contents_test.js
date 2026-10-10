// Before a map is loaded there is no view leaf, and the view takes no contents tint (card [44m], item 16): R_SetupFrame
// passes CONTENTS_EMPTY (-1). It passed 0, which V_SetContentsColor's default case tints as water. Through the public
// R_SetupFrame and the real V_SetContentsColor (view.js), with no world model.
import * as rmain from '../src/engine/render/gl_rmain.js';
import { V_SetContentsColor } from '../src/engine/client/view.js';
import { cl, CSHIFT_CONTENTS } from '../src/engine/client/client.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'with no world loaded, the view gets the empty contents shift, not water\'s', () => {
	const passed = [];
	rmain.R_SetExternals( { V_SetContentsColor: c => { passed.push( c ); V_SetContentsColor( c ); }, V_CalcBlend: () => {} } );
	cl.worldmodel = null;
	rmain.R_SetupFrame();
	same( passed[ 0 ], - 1, 'CONTENTS_EMPTY' );
	same( cl.cshifts[ CSHIFT_CONTENTS ].percent, 0, 'no contents tint' );
} );
