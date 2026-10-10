// The Bestiary's pencil replay (card: Folio pencil fast replay): the supplied schedulePaths and replay rule as prepared by
// tools/prepare_folio.mjs, and the prepared pages in newer/bestiary/folio/ matching today's page images.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const { schedule, encodeReveal, FOLIO_SCHEDULE } = await import( '../tools/prepare_folio.mjs' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` ), near = ( a, b, e, m ) => check( Math.abs( a - b ) <= e, `${m}: ${a} != ${b}` );
const path = ( id, group, phase, length, at = 0 ) => ( { id, group, phase, length, points: [ [ at, 0 ], [ at + length, 0 ] ] } );

Deno.test( 'the supplied schedule: hatching and contours together from 0 over 68% of 7 s, the deepening after, the notes over 4 s from 0', () => {
	const paths = [ path( 0, 0, 1, 40 ), path( 1, 0, 1, 60, 50 ), path( 2, 0, 0, 80 ), path( 3, 0, 2, 30 ), path( 4, 0, 2, 30, 40 ), path( 5, 1, 0, 50 ), path( 6, 1, 0, 50, 60 ) ];
	const duration = schedule( paths );
	same( duration, FOLIO_SCHEDULE.artSeconds, 'the replay lasts the art\'s 7 s' );
	same( paths[ 0 ].start, 0, 'hatching starts at once' ); same( paths[ 2 ].start, 0, 'contours start at once too' ); same( paths[ 5 ].start, 0, 'and the notes' );
	near( paths[ 1 ].end, 7 * .68, 1e-9, 'the hatching fills the first 68%' ); near( paths[ 3 ].start, 7 * .68, 1e-9, 'the deepening begins there' ); near( paths[ 4 ].end, 7, 1e-9, 'and ends at 7 s' );
	near( paths[ 6 ].end, 4, 1e-9, 'the notes take 4 s' ); check( paths[ 1 ].start > paths[ 0 ].end, 'strokes in order, one after the other' );
} );

Deno.test( 'the reveal map: each texel when its strokes reach it (later along a stroke, later), the hatching\'s pressure, the page\'s own pixels untouched', () => {
	const paths = [ path( 0, 0, 1, 100 ), path( 1, 0, 2, 100 ) ]; const duration = schedule( paths );
	const own = new Uint32Array( 4 * 4 ); // four texels: unowned; start of hatch; end of hatch + deepening; middle of hatch
	own.set( [ 1, 0, 0, 0 ], 4 ); own.set( [ 1, 65535, 2, 32768 ], 8 ); own.set( [ 1, 32768, 0, 0 ], 12 );
	const img = encodeReveal( paths, own.buffer, 4, 1, duration );
	same( img[ 3 ], 0, 'unowned: the page\'s own pixel (A = 0)' ); same( img[ 7 ], 255, 'owned (A = 255)' );
	check( img[ 4 ] < img[ 12 ] && img[ 12 ] < img[ 8 ], 'along the stroke, later: ' + [ img[ 4 ], img[ 12 ], img[ 8 ] ] );
	same( img[ 5 ], 255, 'no second stroke: 255' ); check( img[ 9 ] > img[ 8 ], 'the deepening reaches it after the hatching' );
	near( img[ 4 ] / 254, paths[ 0 ].start / duration, 1 / 254, 'the head reaches the stroke\'s start at its start' );
	near( img[ 8 ] / 254, paths[ 0 ].end / duration, 1 / 254, 'and its end at its end' );
	near( img[ 14 ] / 255, .48, .01, 'hatching in its middle: the supplied 0.48 pressure' ); check( img[ 6 ] < img[ 14 ], 'lighter at its ends (the pressure envelope)' );
} );

Deno.test( 'the prepared pages: one for every page image, each matching today\'s image and present', async () => {
	const index = JSON.parse( readFileSync( new URL( '../newer/bestiary/folio/index.json', import.meta.url ), 'utf8' ) );
	const { BESTIARY_ENTRIES } = await import( '../src/bestiary_state.js' );
	same( index.source.sha256, 'b864769450933bf95e23af478223bdbca6ed808fef7af14d1b559b7e3f115295', 'the supplied source' );
	const analyzer = createHash( 'sha256' ).update( readFileSync( new URL( '../tools/folio/analysis_worker.js', import.meta.url ) ) ).digest( 'hex' );
	same( index.analyzer.sha256, analyzer, 'made by the vendored analyzer as it is' );
	for ( const e of BESTIARY_ENTRIES.filter( e => e.image ) ) {
		const page = index.pages[ e.id ]; check( page, 'prepared: ' + e.id );
		const image = createHash( 'sha256' ).update( readFileSync( new URL( '../newer/bestiary/' + e.image, import.meta.url ) ) ).digest( 'hex' );
		same( page.image.sha256, image, e.id + ' prepared from today\'s image (re-run tools/prepare_folio.mjs if not)' );
		for ( const f of [ page.reveal, page.paper ] ) check( existsSync( new URL( '../newer/bestiary/folio/' + f, import.meta.url ) ), e.id + ': ' + f );
		same( page.stats.unownedForeground, 0, e.id + ': every drawn pixel belongs to a stroke' );
	}
} );
