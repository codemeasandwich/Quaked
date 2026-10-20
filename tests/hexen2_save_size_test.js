import { hexen2DataPresent } from './helpers/hexen2_live.mjs';
import { measureHub } from './helpers/hexen2_save_measure.mjs';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
Deno.test( 'owned first hub save size through the public host', async () => {
	if ( ! hexen2DataPresent() ) { console.log( 'SKIP: owned Hexen II data absent' ); return; }
	const result = await measureHub( 'hexen2', 'demo1', name => /^(demo|village|rider1)/.test( name ) );
	check( Object.keys( result.perLevel ).length === 9, 'every first-hub map captured' );
} );
