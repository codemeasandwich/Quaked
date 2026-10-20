// HM public font/animation contracts: no installed art is retained in the checkout.
import { readFileSync, existsSync } from 'node:fs';
import * as skins from '../src/newer/ui/menu_skins.js';
import * as animation from '../src/engine/client/menu_animation.js';
import { MenuFont_Rasterise } from '../src/newer/ui/menu_font_trace.js';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const path = '/Users/bri/quaked/Hexen 2/data1/pak0.pak';
function installed() {
	if ( ! existsSync( path ) ) { console.log( 'SKIP owned Hexen font absent' ); return null; }
	const pak = readFileSync( path ), files = {};
	for ( let i = pak.readInt32LE( 4 ), end = i + pak.readInt32LE( 8 ); i < end; i += 64 ) {
		const name = pak.subarray( i, i + 56 ).toString().split( '\0' )[ 0 ];
		files[ name ] = pak.subarray( pak.readInt32LE( i + 56 ), pak.readInt32LE( i + 56 ) + pak.readInt32LE( i + 60 ) );
	}
	const pic = files[ 'gfx/menu/bigfont2.lmp' ] ?? files[ 'gfx/menu/bigfont.lmp' ];
	return { bigfont: { width: pic.readInt32LE( 0 ), height: pic.readInt32LE( 4 ), data: pic.subarray( 8 ) }, widths: files[ 'gfx/menu/fontsize.lmp' ] };
}
// Count visible topology through 4-connected ink and 8-connected background, independently of contour winding.
function regions( mask, width, height, ink ) {
	const seen = new Uint8Array( mask.length );
	let count = 0;
	for ( let start = 0; start < mask.length; start ++ ) {
		if ( seen[ start ] || Boolean( mask[ start ] ) !== ink ) continue;
		count ++;
		const queue = [ start ]; seen[ start ] = 1;
		for ( let j = 0; j < queue.length; j ++ ) {
			const at = queue[ j ], x = at % width, y = Math.floor( at / width );
			for ( let dy = - 1; dy <= 1; dy ++ ) for ( let dx = - 1; dx <= 1; dx ++ ) {
				if ( ( dx === 0 && dy === 0 ) || ( ink && dx !== 0 && dy !== 0 ) ) continue;
				const nx = x + dx, ny = y + dy, next = ny * width + nx;
				if ( nx < 0 || ny < 0 || nx >= width || ny >= height || seen[ next ] || Boolean( mask[ next ] ) !== ink ) continue;
				seen[ next ] = 1; queue.push( next );
			}
		}
	}
	return count;
}

Deno.test( 'HM traces closed smooth contours with the installed glyph counters and exact SDF metrics', () => {
	const source = installed(); if ( ! source ) return;
	const atlas = skins.BuildHexen2FontAtlas( source );
	check( atlas.metrics.glyphs[ ' ' ] && ! atlas.metrics.glyphs[ ' ' ].atlas, 'title word spaces must advance without falling back to A' );
	check( atlas.info.vector === true, 'atlas must be rasterised from retained vector outlines' );
	const holes = { A: 1, B: 2, D: 1, O: 1, P: 1, Q: 1, R: 1 };
	for ( let i = 0; i < 27; i ++ ) {
		const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ/'[ i ], glyph = atlas.metrics.glyphs[ String.fromCharCode( skins.MENU_BIGFONT_BASE + i ) ];
		check( glyph.outlines.length > 0 && glyph.outlines.every( c => c.closed && c.points.length >= 3 ), letter + ' closed outlines' );
		check( glyph.outlines.some( c => c.curves.length > 0 ), letter + ' fitted curves' );
		check( glyph.outlines.filter( c => c.hole ).length === ( holes[ letter ] ?? 0 ), letter + ' preserves counters' );
		check( glyph.outlines.length === 1 + ( holes[ letter ] ?? 0 ), letter + ' has exactly one outer contour and its counters' );
		const raster = MenuFont_Rasterise( glyph.outlines, 20, 19, 8, 3 );
		check( regions( raster.mask, raster.width, raster.height, true ) === 1, letter + ' fitted strokes remain joined' );
		check( regions( raster.mask, raster.width, raster.height, false ) === 1 + ( holes[ letter ] ?? 0 ), letter + ' fitted counters remain open' );

		check( glyph.range / glyph.em === 16 / 256, letter + ' shader range equals encoded Quake range per em' );
		check( [ 'plane', 'ink', 'atlas' ].every( k => glyph[ k ].length === 4 && glyph[ k ].every( Number.isFinite ) ), letter + ' metrics' );
		const pairs = Array.from( { length: 27 }, ( _, next ) => source.widths[ i * 27 + next ] ).sort( ( a, b ) => a - b );
		check( Math.round( glyph.advance * glyph.em ) === pairs[ 13 ], letter + ' advance is the median of its native pairs' );
		// the pair table's diagonal is the letter followed by itself: I's is 3 pixels, which hid it in MAIN (owner trial)
		if ( letter === 'I' ) check( glyph.advance * glyph.em >= 6, 'I keeps room before the next letter: ' + glyph.advance * glyph.em );
	}
	check( skins.MenuSkin_BigfontAdvance( 'C', 'P', source.widths ) === source.widths[ 2 * 27 + 15 ] + 3, 'native C/P kern' );
	check( skins.MenuSkin_BigfontAdvance( ' ', 'A', source.widths ) === 32, 'native space' );
	check( skins.MenuSkin_BigfontAdvance( 'A', ' ', source.widths ) === 0, 'native invalid next character' );
} );
Deno.test( 'HM shared title animation supports static Quake and native Hexen retract/switch/slide', () => {
	const still = animation.MenuTitle_Create( animation.MENU_TITLE_CONFIG.quake );
	check( animation.MenuTitle_Advance( still, 'main', 0 ).titlePercent === 1, 'Quake static title' );
	check( animation.MenuTitle_Advance( still, 'options', 1 ).name === 'options', 'Quake immediate switch' );
	const slide = animation.MenuTitle_Create( animation.MENU_TITLE_CONFIG.hexen2 );
	let frame = animation.MenuTitle_Advance( slide, 'main', 0 );
	check( frame.titlePercent > 0 && frame.titlePercent < 1, 'Hexen slides from above' );
	for ( let i = 1; i <= 240; i ++ ) frame = animation.MenuTitle_Advance( slide, 'main', i / 60 );
	check( frame.titlePercent === 1 && frame.logoPercent === 1, 'native final position' );
	frame = animation.MenuTitle_Advance( slide, 'options', 4.1 );
	check( frame.name === 'main' && frame.titleTarget === 0, 'old title retracts first' );
	for ( let i = 247; i <= 540; i ++ ) frame = animation.MenuTitle_Advance( slide, 'options', i / 60 );
	check( frame.name === 'options' && frame.titlePercent === 1, 'new title slides down' );
} );

Deno.test( 'HM fitted outlines retain a hole and detached ink while smoothing a diagonal staircase', async () => {
	const { MenuFont_Trace, MenuFont_Rasterise } = await import( '../src/newer/ui/menu_font_trace.js' );
	const width = 24, height = 14, mask = new Uint8Array( width * height );
	for ( let y = 1; y < 11; y ++ ) for ( let x = 1; x < 11; x ++ ) if ( x < 3 || x > 8 || y < 3 || y > 8 ) mask[ y * width + x ] = 1;
	for ( let y = 2; y < 12; y ++ ) for ( let x = 13; x < 23; x ++ ) if ( Math.abs( x - y - 11 ) < 2 ) mask[ y * width + x ] = 1;
	const contours = MenuFont_Trace( mask, width, height );
	check( contours.length === 3 && contours.filter( c => c.hole ).length === 1, 'two detached ink regions and one hole' );
	check( contours.every( c => c.points.length < 16 ), 'native staircase reduced to fitted stroke boundaries' );
	const raster = MenuFont_Rasterise( contours, width, height, 8, 3 );
	const pixel = ( x, y ) => raster.mask[ Math.floor( ( y + 3 ) * 8 ) * raster.width + Math.floor( ( x + 3 ) * 8 ) ];
	check( pixel( 1.5, 5 ) === 1 && pixel( 5, 5 ) === 0 && pixel( 17, 6 ) === 1, 'raster retains stem, counter and diagonal' );
	check( raster.mask[ 0 ] === 0, 'padding remains empty' );
} );
