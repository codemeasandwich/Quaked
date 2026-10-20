import { hexen2DataPresent } from './helpers/hexen2_live.mjs';
import { measureHub } from './helpers/hexen2_save_measure.mjs';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
Deno.test( 'owned Portal hub save sizes through the public host', async () => {
	if ( ! hexen2DataPresent( 'hexen2-portals' ) ) { console.log( 'SKIP: owned Portal data absent' ); return; }
	for ( const start of [ 'keep1', 'tibet1' ] ) {
		const result = await measureHub( 'hexen2-portals', start, name => name.startsWith( start === 'keep1' ? 'keep' : 'tibet' ) );
		check( Object.keys( result.perLevel ).length >= 5, 'the hub maps captured' );
	}
} );
