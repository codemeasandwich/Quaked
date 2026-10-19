// G1 native HUD: the artifact inventory from the pinned Raven sbar.c — the selected artifact and count on the bar, and
// the six-icon inventory row with its highlight. Pure operation lists, executed with recording draw spies.
import { Hexen2_InventoryOps, Hexen2_ArtifactCounts, HEXEN2_ARTIFACT_FIELDS } from '../src/engine/client/hexen2_inventory.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'the native artifact inventory emits the bar icon and the six-icon row', () => {

	// a Paladin carrying 1 tome, 12 glyphs and 3 haste
	const player = { v: { cnt_tome: 1, cnt_glyph: 12, cnt_haste: 3 } };
	const artifacts = Hexen2_ArtifactCounts( player );
	same( artifacts.length, HEXEN2_ARTIFACT_FIELDS.length, 'one count per artifact field' );
	same( artifacts[ 5 ], 1, 'tome count (artifact 5)' );
	same( artifacts[ 8 ], 12, 'glyph count (artifact 8)' );
	same( artifacts[ 9 ], 3, 'haste count (artifact 9)' );

	const inventory = { order: [ 5, 8, 9 ], count: 3, selected: 1, startpos: 0, artifacts };
	// closed: only the selected artifact on the bar, with its count
	const closed = Hexen2_InventoryOps( inventory, { width: 320, height: 200 } );
	same( closed.length, 3, 'bar icon plus a two-digit count' );
	same( closed[ 0 ].name, 'gfx/arti08.lmp', 'the selected artifact is the glyph' );
	same( closed[ 0 ].x, 144, 'the bar icon x' );
	same( closed[ 0 ].y, 154 + 3, 'the bar icon y' );
	same( closed[ 1 ].name, 'gfx/artinum1.lmp', 'the tens digit' );
	same( closed[ 1 ].x, 144 + 20 - 4, 'the tens digit x' );
	same( closed[ 2 ].name, 'gfx/artinum2.lmp', 'the units digit' );
	same( closed[ 2 ].x, 164, 'the units digit x' );

	// open: highlight + six-icon row above the bar (only three icons held)
	const open = Hexen2_InventoryOps( inventory, { width: 320, height: 200, open: true } );
	const names = open.map( op => op.name );
	same( names[ 0 ], 'gfx/arti08.lmp', 'the bar icon first' );
	check( names.includes( 'gfx/artisel.lmp' ), 'the selection highlight' );
	const highlight = open.find( op => op.name === 'gfx/artisel.lmp' );
	same( highlight.x, 64 + 33 + 9, 'the highlight sits on the second icon' );
	same( highlight.y, 200 - 46 - 37 - 12, 'the highlight is above the bar' );
	for ( const [ i, artifact ] of [ 5, 8, 9 ].entries() ) {

		const op = open.find( o => o.name === `gfx/arti${String( artifact ).padStart( 2, '0' )}.lmp` && o.y === 200 - 46 - 37 );
		check( op !== undefined, `artifact ${artifact} icon in the row` );
		same( op.x, 64 + i * 33, `artifact ${artifact} icon x` );

	}

	// six icons fill the row at its native stride
	const full = { order: [ 0, 1, 2, 3, 4, 5 ], count: 6, selected: 0, startpos: 0, artifacts: new Array( 15 ).fill( 1 ) };
	const fullOps = Hexen2_InventoryOps( full, { width: 640, height: 480, open: true, barHeight: 46 } );
	const rowIcons = fullOps.filter( op => /arti\d\d\.lmp/.test( op.name ) && op.name !== 'gfx/artisel.lmp' && op.y === 480 - 46 - 37 );
	same( rowIcons.length, 6, 'six icons in the row' );
	same( rowIcons[ 0 ].x, 160 + 64, 'the row is centred with the 320-wide bar' );
	same( rowIcons[ 5 ].x, 160 + 64 + 5 * 33, 'the sixth icon x' );

} );
