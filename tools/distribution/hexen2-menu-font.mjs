/** HM read-only font comparison: installed bitmap and traced contours at 1x/8x; no glyph data is shipped. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { BuildHexen2FontAtlas, MENU_BIGFONT_BASE } from '../../src/newer/ui/menu_skins.js';
import { MenuFont_Rasterise } from '../../src/newer/ui/menu_font_trace.js';
const data1 = resolve( process.argv[ 2 ] ?? '/Users/bri/quaked/Hexen 2/data1' );
const out = resolve( process.argv[ 3 ] ?? 'dist/verification/hm' );
const pak = await readFile( resolve( data1, 'pak0.pak' ) ), files = {};
for ( let i = pak.readInt32LE( 4 ), end = i + pak.readInt32LE( 8 ); i < end; i += 64 ) {
	const name = pak.subarray( i, i + 56 ).toString().split( '\0' )[ 0 ];
	files[ name ] = pak.subarray( pak.readInt32LE( i + 56 ), pak.readInt32LE( i + 56 ) + pak.readInt32LE( i + 60 ) );
}
const font = files[ 'gfx/menu/bigfont2.lmp' ] ?? files[ 'gfx/menu/bigfont.lmp' ];
if ( ! font ) throw new Error( 'No installed bigfont' );
const source = { width: font.readInt32LE( 0 ), height: font.readInt32LE( 4 ), data: font.subarray( 8 ) };
const atlas = BuildHexen2FontAtlas( { bigfont: source, widths: files[ 'gfx/menu/fontsize.lmp' ] } );
const native = Buffer.alloc( 160 * 80 * 4 ), vector = Buffer.alloc( 1280 * 640 * 4 );
for ( let i = 0; i < 27; i ++ ) {
	const cellX = i % 8 * 20, cellY = Math.floor( i / 8 ) * 20;
	const glyph = atlas.metrics.glyphs[ String.fromCharCode( MENU_BIGFONT_BASE + i ) ];
	const raster = MenuFont_Rasterise( glyph.outlines, 20, 19, 8, 0 );
	for ( let y = 0; y < 19; y ++ ) for ( let x = 0; x < 20; x ++ ) {
		const index = source.data[ ( cellY + y ) * source.width + cellX + x ];
		if ( index !== 0 && index !== 255 ) native.set( [ 200, 200, 200, 255 ], ( ( cellY + y ) * 160 + cellX + x ) * 4 );
	}
	for ( let y = 0; y < raster.height; y ++ ) for ( let x = 0; x < raster.width; x ++ ) if ( raster.mask[ y * raster.width + x ] )
		vector.set( [ 200, 200, 200, 255 ], ( ( cellY * 8 + y ) * 1280 + cellX * 8 + x ) * 4 );
}
await mkdir( out, { recursive: true } );
const nativeImage = sharp( native, { raw: { width: 160, height: 80, channels: 4 } } );
const vectorImage = sharp( vector, { raw: { width: 1280, height: 640, channels: 4 } } );
const header = Buffer.from( '<svg width="2580" height="120"><style>text{fill:white;font:20px sans-serif}</style><text x="12" y="26">Installed ink mask (left): 1x, then 8x nearest</text><text x="1300" y="26">Traced quadratic outlines (right): 1x, then 8x raster</text></svg>' );
await sharp( { create: { width: 2580, height: 780, channels: 4, background: '#161616' } } ).composite( [
	{ input: header, top: 0, left: 0 },
	{ input: await nativeImage.clone().png().toBuffer(), top: 40, left: 12 },
	{ input: await vectorImage.clone().resize( 160, 80 ).png().toBuffer(), top: 40, left: 1300 },
	{ input: await nativeImage.clone().resize( 1280, 640, { kernel: 'nearest' } ).png().toBuffer(), top: 130, left: 12 },
	{ input: await vectorImage.png().toBuffer(), top: 130, left: 1300 }
] ).png().toFile( resolve( out, 'font-comparison.png' ) );
await writeFile( resolve( out, 'font-report.json' ), JSON.stringify( { atlas: atlas.info, glyphs: [ ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ/' ].map( ( letter, i ) => {
	const glyph = atlas.metrics.glyphs[ String.fromCharCode( MENU_BIGFONT_BASE + i ) ];
	return { letter, outlines: glyph.outlines.length, holes: glyph.outlines.filter( o => o.hole ).length,
		vertices: glyph.outlines.reduce( ( n, o ) => n + o.points.length, 0 ), advance: glyph.advance, range: glyph.range, em: glyph.em };
} ) }, null, 2 ) + '\n' );
console.log( 'Compared all 27 glyphs at 1x and 8x: ' + resolve( out, 'font-comparison.png' ) );
