/**
 * @module engine/client/hexen2_pixel_gate
 *
 * The native character/difficulty gate: a 320×200 canvas with a small bitmap font, scaled to the viewport with nearest
 * sampling. It is the start-screen counterpart of the in-game pixel menu, and keeps the same class list the edition
 * profile offers (Portal adds the Succubus). Keyboard and pointer both select; the host removes it on start.
 *
 * Types: plain values and functions; no exported classes.
 * State: the returned gate owns its canvas/event listeners; `destroy` releases them.
 * Errors: no throws; a missing document returns an inert gate.
 */

const GLYPHS = {
	A: [ '01110', '10001', '10001', '11111', '10001', '10001', '10001' ],
	B: [ '11110', '10001', '10001', '11110', '10001', '10001', '11110' ],
	C: [ '01110', '10001', '10000', '10000', '10000', '10001', '01110' ],
	D: [ '11110', '10001', '10001', '10001', '10001', '10001', '11110' ],
	E: [ '11111', '10000', '10000', '11110', '10000', '10000', '11111' ],
	F: [ '11111', '10000', '10000', '11110', '10000', '10000', '10000' ],
	G: [ '01110', '10001', '10000', '10111', '10001', '10001', '01110' ],
	H: [ '10001', '10001', '10001', '11111', '10001', '10001', '10001' ],
	I: [ '11111', '00100', '00100', '00100', '00100', '00100', '11111' ],
	J: [ '00111', '00010', '00010', '00010', '00010', '10010', '01100' ],
	K: [ '10001', '10010', '10100', '11000', '10100', '10010', '10001' ],
	L: [ '10000', '10000', '10000', '10000', '10000', '10000', '11111' ],
	M: [ '10001', '11011', '10101', '10101', '10001', '10001', '10001' ],
	N: [ '10001', '11001', '10101', '10011', '10001', '10001', '10001' ],
	O: [ '01110', '10001', '10001', '10001', '10001', '10001', '01110' ],
	P: [ '11110', '10001', '10001', '11110', '10000', '10000', '10000' ],
	Q: [ '01110', '10001', '10001', '10001', '10101', '10010', '01101' ],
	R: [ '11110', '10001', '10001', '11110', '10100', '10010', '10001' ],
	S: [ '01111', '10000', '10000', '01110', '00001', '00001', '11110' ],
	T: [ '11111', '00100', '00100', '00100', '00100', '00100', '00100' ],
	U: [ '10001', '10001', '10001', '10001', '10001', '10001', '01110' ],
	V: [ '10001', '10001', '10001', '10001', '10001', '01010', '00100' ],
	W: [ '10001', '10001', '10001', '10101', '10101', '11011', '10001' ],
	X: [ '10001', '10001', '01010', '00100', '01010', '10001', '10001' ],
	Y: [ '10001', '10001', '01010', '00100', '00100', '00100', '00100' ],
	Z: [ '11111', '00001', '00010', '00100', '01000', '10000', '11111' ],
	0: [ '01110', '10001', '10011', '10101', '11001', '10001', '01110' ],
	1: [ '00100', '01100', '00100', '00100', '00100', '00100', '01110' ],
	2: [ '01110', '10001', '00001', '00010', '00100', '01000', '11111' ],
	3: [ '11110', '00001', '00001', '01110', '00001', '00001', '11110' ],
	4: [ '00010', '00110', '01010', '10010', '11111', '00010', '00010' ],
	5: [ '11111', '10000', '10000', '11110', '00001', '00001', '11110' ],
	6: [ '01110', '10000', '10000', '11110', '10001', '10001', '01110' ],
	7: [ '11111', '00001', '00010', '00100', '01000', '01000', '01000' ],
	8: [ '01110', '10001', '10001', '01110', '10001', '10001', '01110' ],
	9: [ '01110', '10001', '10001', '01111', '00001', '00001', '01110' ],
	' ': [ '00000', '00000', '00000', '00000', '00000', '00000', '00000' ],
	'-': [ '00000', '00000', '00000', '11111', '00000', '00000', '00000' ],
	'/': [ '00001', '00010', '00010', '00100', '01000', '01000', '10000' ],
	'.': [ '00000', '00000', '00000', '00000', '00000', '01100', '01100' ],
	':': [ '00000', '01100', '01100', '00000', '01100', '01100', '00000' ],
	'!': [ '00100', '00100', '00100', '00100', '00100', '00000', '00100' ]
};

/** The class/skill rows, exposed for the host and tests. */
export const HEXEN2_PIXEL_GATE = Object.freeze( {
	width: 320, height: 200, classTop: 78, classStep: 13, skillTop: 162, skillStep: 34
} );

/**
 * Draws uppercase text with the 5×7 bitmap font.
 *
 * @param {CanvasRenderingContext2D} ctx the 320×200 context
 * @param {number} x left edge
 * @param {number} y top edge
 * @param {string} text the text (upper-cased)
 * @param {string} color fill color
 */
export function Hexen2_PixelGateText( ctx, x, y, text, color = '#d8c69b' ) {

	ctx.fillStyle = color;
	for ( const character of String( text ).toUpperCase() ) {

		const glyph = GLYPHS[ character ] ?? GLYPHS[ ' ' ];
		for ( let row = 0; row < 7; row ++ )
			for ( let col = 0; col < 5; col ++ )
				if ( glyph[ row ][ col ] === '1' ) ctx.fillRect( x + col, y + row, 1, 1 );
		x += 6;

	}

}

/**
 * Creates the gate.
 *
 * @param {{ document?: Document, classes: Array<{ id: string, name: string }>, skills?: Array<[string,string]>,
 *   initialClass?: string, initialSkill?: number, source?: string, onAudioUnlock?: function(): void,
 *   onChoose: function(string, number): void }} options the choices and result callback
 * @returns {{ element: ?HTMLCanvasElement, destroy: function(): void, choose: function(): void,
 *   selectedClass: function(): string, selectedSkill: function(): number }} the gate
 */
export function Hexen2_CreatePixelGate( options ) {

	const doc = options.document ?? ( typeof document !== 'undefined' ? document : null );
	if ( !doc ) return { element: null, destroy: () => {}, choose: () => {}, selectedClass: () => options.initialClass ?? 'paladin', selectedSkill: () => options.initialSkill ?? 1 };
	const skills = options.skills ?? [ [ 'EASY', '0' ], [ 'NORMAL', '1' ], [ 'HARD', '2' ], [ 'NIGHTMARE', '3' ] ];
	const classes = options.classes ?? [];
	let classIndex = Math.max( 0, classes.findIndex( entry => entry.id === options.initialClass ) );
	let skillIndex = Math.max( 0, skills.findIndex( entry => Number( entry[ 1 ] ) === ( options.initialSkill ?? 1 ) ) );
	let destroyed = false;
	const canvas = doc.createElement( 'canvas' );
	canvas.width = HEXEN2_PIXEL_GATE.width; canvas.height = HEXEN2_PIXEL_GATE.height;
	canvas.style = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:400;background:#07070a;image-rendering:pixelated;cursor:pointer;outline:none';
	canvas.tabIndex = 0;
	doc.body.append( canvas );
	const ctx = canvas.getContext( '2d' );
	const draw = () => {

		ctx.fillStyle = '#07070a'; ctx.fillRect( 0, 0, 320, 200 );
		Hexen2_PixelGateText( ctx, 20, 16, 'HEXEN II', '#e7d3a0' );
		Hexen2_PixelGateText( ctx, 20, 30, options.source ? String( options.source ).toUpperCase().slice( 0, 45 ) : 'NATIVE', '#7e7462' );
		Hexen2_PixelGateText( ctx, 20, 60, 'SELECT CLASS', '#b7ab90' );
		classes.forEach( ( entry, i ) => {

			if ( i === classIndex ) { ctx.fillStyle = '#3b3220'; ctx.fillRect( 16, 74 + i * HEXEN2_PIXEL_GATE.classStep - 2, 288, 11 ); }
			Hexen2_PixelGateText( ctx, 22, 74 + i * HEXEN2_PIXEL_GATE.classStep, ( i === classIndex ? '> ' : '  ' ) + entry.name.toUpperCase(), i === classIndex ? '#fff1cf' : '#bfb39b' );

		} );
		Hexen2_PixelGateText( ctx, 20, 146, 'DIFFICULTY', '#b7ab90' );
		skills.forEach( ( entry, i ) => {

			const x = 20 + i * 73;
			if ( i === skillIndex ) { ctx.fillStyle = '#3b3220'; ctx.fillRect( x - 3, 158, 68, 11 ); }
			Hexen2_PixelGateText( ctx, x, 160, entry[ 0 ], i === skillIndex ? '#fff1cf' : '#8f8572' );

		} );
		Hexen2_PixelGateText( ctx, 20, 184, 'ARROWS SELECT   ENTER START   CLICK CLASS', '#6f6758' );

	};
	const choose = () => {

		if ( destroyed || classes.length === 0 ) return;
		options.onAudioUnlock?.();
		options.onChoose?.( classes[ classIndex ].id, Number( skills[ skillIndex ][ 1 ] ) );
		gate.destroy();

	};
	const pointer = event => {

		const rect = canvas.getBoundingClientRect();
		const x = ( event.clientX - rect.left ) * 320 / Math.max( 1, rect.width );
		const y = ( event.clientY - rect.top ) * 200 / Math.max( 1, rect.height );
		const row = Math.floor( ( y - 72 ) / HEXEN2_PIXEL_GATE.classStep );
		if ( y >= 70 && y < 70 + classes.length * HEXEN2_PIXEL_GATE.classStep && row >= 0 && row < classes.length ) {

			classIndex = row; draw(); choose(); return;

		}
		if ( y >= 156 && y < 174 ) {

			const index = Math.floor( ( x - 17 ) / 73 );
			if ( index >= 0 && index < skills.length ) { skillIndex = index; draw(); }

		}

	};
	const key = event => {

		if ( event.code === 'ArrowUp' ) { classIndex = ( classIndex + classes.length - 1 ) % classes.length; draw(); }
		else if ( event.code === 'ArrowDown' ) { classIndex = ( classIndex + 1 ) % classes.length; draw(); }
		else if ( event.code === 'ArrowLeft' ) { skillIndex = ( skillIndex + skills.length - 1 ) % skills.length; draw(); }
		else if ( event.code === 'ArrowRight' ) { skillIndex = ( skillIndex + 1 ) % skills.length; draw(); }
		else if ( event.code === 'Enter' || event.code === 'Space' ) choose();
		else return;
		event.preventDefault(); event.stopPropagation();

	};
	const gate = {
		element: canvas,
		destroy() { if ( destroyed ) return; destroyed = true; canvas.removeEventListener( 'pointerdown', pointer ); doc.removeEventListener( 'keydown', key, true ); canvas.remove(); },
		choose,
		selectedClass: () => classes[ classIndex ]?.id ?? 'paladin',
		selectedSkill: () => Number( skills[ skillIndex ][ 1 ] )
	};
	canvas.addEventListener( 'pointerdown', pointer );
	doc.addEventListener( 'keydown', key, true );
	canvas.focus();
	draw();
	return gate;

}
