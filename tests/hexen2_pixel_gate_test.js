// The native pixel character/difficulty gate: its bitmap font draws, its class list/selection API works, and choosing
// reports the edition's class id plus the native skill number.
import { Hexen2_CreatePixelGate, Hexen2_PixelGateText, HEXEN2_PIXEL_GATE } from '../src/engine/client/hexen2_pixel_gate.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

function fakeDocument() {

	let rects = 0;
	const ctx = { fillStyle: '', fillRect: () => rects ++ };
	const listeners = {};
	const canvas = {
		width: 0, height: 0, style: '', tabIndex: 0,
		getContext: () => ctx,
		getBoundingClientRect: () => ( { left: 0, top: 0, width: 320, height: 200 } ),
		addEventListener: ( name, fn ) => { listeners[ 'canvas:' + name ] = fn; },
		removeEventListener: ( name, fn ) => { if ( listeners[ 'canvas:' + name ] === fn ) delete listeners[ 'canvas:' + name ]; },
		focus: () => {}, remove: () => { canvas.removed = true; }, removed: false
	};
	const doc = { createElement: () => canvas, body: { append: () => {} },
		addEventListener: ( name, fn ) => { listeners[ 'doc:' + name ] = fn; },
		removeEventListener: ( name, fn ) => { if ( listeners[ 'doc:' + name ] === fn ) delete listeners[ 'doc:' + name ]; } };
	return { doc, canvas, ctx, listeners, get rects() { return rects; } };

}

Deno.test( 'the pixel gate draws its bitmap text and chooses the selected class/skill', () => {

	const fake = fakeDocument();
	Hexen2_PixelGateText( fake.ctx, 0, 0, 'HEXEN II' );
	check( fake.rects > 0, 'the bitmap font draws pixels' );
	same( HEXEN2_PIXEL_GATE.width, 320, 'native width' );
	same( HEXEN2_PIXEL_GATE.height, 200, 'native height' );

	let chosen = null;
	const gate = Hexen2_CreatePixelGate( {
		document: fake.doc,
		classes: [ { id: 'paladin', name: 'Paladin' }, { id: 'succubus', name: 'Succubus' } ],
		initialClass: 'succubus', initialSkill: 2,
		onChoose: ( id, skill ) => { chosen = { id, skill }; }
	} );
	same( gate.selectedClass(), 'succubus', 'the initial Portal class' );
	same( gate.selectedSkill(), 2, 'the initial skill' );
	gate.choose();
	check( chosen !== null, 'choose fires the callback' );
	same( chosen.id, 'succubus', 'the chosen class' );
	same( chosen.skill, 2, 'the chosen skill' );
	check( fake.canvas.removed, 'the gate removes its canvas' );

} );
