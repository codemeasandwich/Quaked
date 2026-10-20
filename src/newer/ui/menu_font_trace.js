/**
 * @module newer/ui/menu_font_trace
 * Runtime outline tracing of installed menu ink. Pixel edges are joined into closed contours, simplified within three quarters of
 * a source pixel and rounded with quadratic corners. Rasterisation uses those curves, never an enlarged bitmap.
 * Even-odd fill retains counters; right turns at diagonal contacts keep thin foreground strokes connected.
 */

const area = points => points.reduce( ( sum, p, i ) => { const q = points[ ( i + 1 ) % points.length ]; return sum + p[ 0 ] * q[ 1 ] - q[ 0 ] * p[ 1 ]; }, 0 ) / 2;
function distance( p, a, b ) {
	const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ];
	const t = Math.max( 0, Math.min( 1, ( ( p[ 0 ] - a[ 0 ] ) * dx + ( p[ 1 ] - a[ 1 ] ) * dy ) / ( dx * dx + dy * dy || 1 ) ) );
	return Math.hypot( p[ 0 ] - a[ 0 ] - t * dx, p[ 1 ] - a[ 1 ] - t * dy );
}
function simplify( points, tolerance ) {
	let furthest = 0, index = 0;
	for ( let i = 1; i < points.length - 1; i ++ ) {
		const d = distance( points[ i ], points[ 0 ], points.at( - 1 ) );
		if ( d > furthest ) { furthest = d; index = i; }
	}
	if ( furthest <= tolerance ) return [ points[ 0 ], points.at( - 1 ) ];
	return [ ...simplify( points.slice( 0, index + 1 ), tolerance ).slice( 0, - 1 ), ...simplify( points.slice( index ), tolerance ) ];
}

/** Fits closed quadratic contours to a binary ink mask; coordinates remain in source pixels. */
export function MenuFont_Trace( mask, width, height ) {
	const edges = new Map(), ink = ( x, y ) => x >= 0 && y >= 0 && x < width && y < height && mask[ y * width + x ];
	const key = p => p.join( ',' );
	const edge = ( a, b, direction ) => { const k = key( a ); if ( ! edges.has( k ) ) edges.set( k, [] ); edges.get( k ).push( { a, b, direction } ); };
	for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) if ( ink( x, y ) ) {
		if ( ! ink( x, y - 1 ) ) edge( [ x, y ], [ x + 1, y ], 0 );
		if ( ! ink( x + 1, y ) ) edge( [ x + 1, y ], [ x + 1, y + 1 ], 1 );
		if ( ! ink( x, y + 1 ) ) edge( [ x + 1, y + 1 ], [ x, y + 1 ], 2 );
		if ( ! ink( x - 1, y ) ) edge( [ x, y + 1 ], [ x, y ], 3 );
	}
	const contours = [];
	while ( edges.size ) {
		let current = edges.values().next().value[ 0 ];
		const first = key( current.a ), points = [];
		do {
			points.push( current.a );
			const k = key( current.a ), list = edges.get( k ); list.splice( list.indexOf( current ), 1 ); if ( ! list.length ) edges.delete( k );
			const next = edges.get( key( current.b ) );
			if ( key( current.b ) === first ) break;
			if ( ! next ) throw new Error( 'Open menu font contour' );
			// Clockwise boundary with foreground on the right; prefer a right turn at a saddle.
			const priority = d => [ 1, 0, 3, 2 ].indexOf( ( d - current.direction + 4 ) % 4 );
			current = next.slice().sort( ( a, b ) => priority( a.direction ) - priority( b.direction ) )[ 0 ];
		} while ( points.length <= width * height * 4 );
		// Split the ring at its furthest vertex so RDP never treats a closed contour as a zero-length line.
		let opposite = 1;
		for ( let i = 2; i < points.length; i ++ ) if ( Math.hypot( ...points[ i ].map( ( v, j ) => v - points[ 0 ][ j ] ) ) > Math.hypot( ...points[ opposite ].map( ( v, j ) => v - points[ 0 ][ j ] ) ) ) opposite = i;
		let fitted = [ ...simplify( points.slice( 0, opposite + 1 ), .75 ).slice( 0, - 1 ),
			...simplify( [ ...points.slice( opposite ), points[ 0 ] ], .75 ).slice( 0, - 1 ) ];
		// Subpixel counters (notably A) can simplify to a line. Retain their original closed polygon instead.
		if ( fitted.length < 3 || Math.abs( area( fitted ) ) < Math.abs( area( points ) ) * .5 ) fitted = points;

		const curves = fitted.map( ( p, i ) => {
			const before = fitted[ ( i + fitted.length - 1 ) % fitted.length ], after = fitted[ ( i + 1 ) % fitted.length ];
			const trim = q => { const length = Math.hypot( q[ 0 ] - p[ 0 ], q[ 1 ] - p[ 1 ] ); const t = Math.min( .24, .3 / length ); return p.map( ( v, j ) => v + ( q[ j ] - v ) * t ); };
			return { from: trim( before ), control: p, to: trim( after ) };
		} );
		contours.push( { closed: true, hole: area( points ) < 0, points: fitted, curves } );
	}
	return contours;
}

/** Flattens quadratic outlines for high-resolution scan conversion (six samples per fitted corner). */
export function MenuFont_Flatten( outlines ) {
	return outlines.map( contour => contour.curves.flatMap( c => {
		const points = [ c.from ];
		for ( let step = 1; step <= 6; step ++ ) { const t = step / 6, s = 1 - t; points.push( c.from.map( ( v, i ) => s * s * v + 2 * s * t * c.control[ i ] + t * t * c.to[ i ] ) ); }
		return points;
	} ) );
}

/** Rasterises even-odd vector outlines into an atlas tile, with empty padding and no DOM/canvas dependency. */
export function MenuFont_Rasterise( outlines, cellWidth, cellHeight, upscale, pad ) {
	const width = ( cellWidth + 2 * pad ) * upscale, height = ( cellHeight + 2 * pad ) * upscale;
	const mask = new Uint8Array( width * height ), loops = MenuFont_Flatten( outlines );
	for ( let y = 0; y < height; y ++ ) {
		const py = ( y + .5 ) / upscale - pad, intersections = [];
		for ( const points of loops ) for ( let i = 0; i < points.length; i ++ ) {
			const a = points[ i ], b = points[ ( i + 1 ) % points.length ];
			if ( ( a[ 1 ] > py ) !== ( b[ 1 ] > py ) ) intersections.push( a[ 0 ] + ( py - a[ 1 ] ) * ( b[ 0 ] - a[ 0 ] ) / ( b[ 1 ] - a[ 1 ] ) );
		}
		intersections.sort( ( a, b ) => a - b );
		for ( let i = 0; i + 1 < intersections.length; i += 2 ) {
			const start = Math.max( 0, Math.ceil( ( intersections[ i ] + pad ) * upscale - .5 ) ), end = Math.min( width, Math.ceil( ( intersections[ i + 1 ] + pad ) * upscale - .5 ) );
			mask.fill( 1, y * width + start, y * width + end );
		}
	}
	return { mask, width, height };
}

/** Framework ornaments authored as vector contours in a 20-unit em; holes use the same even-odd fill as letters. */
export const MENU_ORNAMENTS = Object.freeze( { skull: '\uE100', chain: '\uE101', menudot: '\uE102' } );

/** Returns independent vector paths for the stone sign ornaments and the horned menudot selector. */
export function MenuFont_Ornaments() {
	const path = ( points, hole = false ) => ( { closed: true, hole, points,
		curves: points.map( ( p, i ) => ( { from: p, control: p, to: points[ ( i + 1 ) % points.length ] } ) ) } );
	return {
		[ MENU_ORNAMENTS.skull ]: [
			path( [ [ 1, 4 ], [ 5, 6 ], [ 6, 4 ], [ 9, 3 ], [ 12, 4 ], [ 14, 6 ], [ 18, 4 ], [ 16, 2 ], [ 19, 3 ], [ 20, 5 ], [ 15, 9 ], [ 14, 12 ], [ 12, 14 ], [ 12, 18 ], [ 10, 17 ], [ 9, 19 ], [ 7, 17 ], [ 7, 14 ], [ 5, 12 ], [ 4, 9 ], [ 0, 5 ], [ 0, 3 ], [ 3, 2 ] ] ),
			path( [ [ 5.5, 9 ], [ 8.5, 9.7 ], [ 8, 12 ], [ 6, 11 ] ], true ),
			path( [ [ 10, 9.7 ], [ 13, 9 ], [ 12.5, 11 ], [ 10.5, 12 ] ], true ),
			path( [ [ 9.5, 12 ], [ 8.5, 14 ], [ 10.5, 14 ] ], true )
		],
		[ MENU_ORNAMENTS.chain ]: [
			path( [ [ 6, 0 ], [ 12, 0 ], [ 15, 3 ], [ 15, 16 ], [ 12, 19 ], [ 6, 19 ], [ 3, 16 ], [ 3, 3 ] ] ),
			path( [ [ 7, 3 ], [ 11, 3 ], [ 12, 5 ], [ 12, 14 ], [ 10, 16 ], [ 7, 16 ], [ 6, 14 ], [ 6, 5 ] ], true )
		],
		[ MENU_ORNAMENTS.menudot ]: [ path( [ [ 0, 2 ], [ 4, 2 ], [ 7, 5 ], [ 13, 5 ], [ 16, 2 ], [ 20, 2 ], [ 15, 8 ], [ 12, 8 ], [ 12, 10 ], [ 15, 10 ], [ 15, 12 ], [ 12, 12 ], [ 12, 14 ], [ 15, 14 ], [ 10, 20 ], [ 5, 14 ], [ 8, 14 ], [ 8, 12 ], [ 5, 12 ], [ 5, 10 ], [ 8, 10 ], [ 8, 8 ], [ 5, 8 ] ] ) ]
	};
}
