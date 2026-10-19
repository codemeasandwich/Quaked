// The native bar geometry and Sbar_DrawNum layout extracted from the host (the owner compared these against native):
// width scaling with bottom anchoring, and right-aligned number fields at 13 px per picture. Code-first module, so this
// is a retroactive control recorded as such in the ledger.
import { Hexen2_HudTransform, Hexen2_NumberLayout, HEXEN2_NUM_ADVANCE } from '../src/engine/client/hexen2_hud_layout.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'the native bar scales by width, anchors at the bottom and lays numbers out like Sbar_DrawNum', () => {

	same( HEXEN2_NUM_ADVANCE, 13, 'the native advance' );
	same( JSON.stringify( Hexen2_HudTransform( 2560, 1536 ) ), JSON.stringify( { scale: 8, offsetX: 0, offsetY: - 64 } ), 'retina 1280x768' );
	same( JSON.stringify( Hexen2_HudTransform( 1280, 768 ) ), JSON.stringify( { scale: 4, offsetX: 0, offsetY: - 32 } ), '1280x768' );
	same( JSON.stringify( Hexen2_HudTransform( 0, 0 ) ), JSON.stringify( { scale: 1, offsetX: 0, offsetY: 0 } ), 'invalid geometry is identity' );

	same( JSON.stringify( Hexen2_NumberLayout( 85, 3 ) ), JSON.stringify( { text: '85', xOffset: 6 } ), 'two digits in a three field' );
	same( JSON.stringify( Hexen2_NumberLayout( 0, 2 ) ), JSON.stringify( { text: '0', xOffset: 6 } ), 'one digit in a two field' );
	same( JSON.stringify( Hexen2_NumberLayout( 121, 3 ) ), JSON.stringify( { text: '121', xOffset: 0 } ), 'a full mana field' );
	same( JSON.stringify( Hexen2_NumberLayout( 1234, 3 ) ), JSON.stringify( { text: '234', xOffset: 0 } ), 'overflow keeps the last digits' );

} );
