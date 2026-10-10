/**
 * @module newer/ui/menu_art
 *
 * The single-player menu lettering, assembled from Quake's own menu sprites.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: throws at 1 place.
 */
// Single-player lettering assembled once from Quake's own menu sprites.
// Keep native pixels and baselines: centring each letter's ink box clips
// descenders and shifts small capitals relative to their neighbours.
/**
 * Short labels use the complete native menu/console bitmap alphabet. Copy authored cells verbatim into transparent
 * pictures; never rasterize a web font. gl_draw.js builds the bestiary book's navigation labels with it once per
 * charset.
 *
 * @param {?HTMLCanvasElement} charset the decoded 128x128 conchars sheet (16x16 cells of 8x8 pixels)
 * @param {string} text 1-64 printable ASCII characters (0x20-0x7e)
 * @param {function(): HTMLCanvasElement} makeCanvas makes the output canvas
 * @returns {?{width: number, height: number, canvas: HTMLCanvasElement}} a picture 8 pixels per character wide and 8
 *  tall; null when the charset is missing or not 128x128
 * @throws {RangeError} when `text` is not 1-64 printable native glyphs
 */
export function BuildMenuTextArt( charset, text, makeCanvas ) {

	if ( ! charset || charset.width !== 128 || charset.height !== 128 ) return null;
	if ( typeof text !== 'string' || ! /^[\x20-\x7e]{1,64}$/.test( text ) ) throw new RangeError( 'Menu image text must be 1–64 printable native glyphs' );
	const canvas = makeCanvas();
	canvas.width = text.length * 8; canvas.height = 8;
	const ctx = canvas.getContext( '2d' );
	ctx.imageSmoothingEnabled = false;
	for ( let i = 0; i < text.length; i ++ ) {

		const code = text.charCodeAt( i );
		ctx.drawImage( charset, ( code & 15 ) * 8, ( code >> 4 ) * 8, 8, 8, i * 8, 0, 8, 8 );

	}
	return { width: canvas.width, height: canvas.height, canvas };

}

/**
 * Builds the extended single-player menu picture ("Newer Game" above the native New Game / Load / Save rows and
 * "Level Select" below) by copying letters out of Quake's own menu pictures at their native pixels and baselines.
 * Called once by `Draw_CacheSinglePlayerMenu` (gl_draw.js), which caches it as gfx/sp_menu_ext.lmp. Source
 * canvases are never changed.
 *
 * @param {?{width: number, height: number, canvas: HTMLCanvasElement}} single gfx/sp_menu.lmp
 * @param {?{canvas: HTMLCanvasElement}} main gfx/mainmenu.lmp (source of the "r" and of "l" from Help)
 * @param {?{canvas: HTMLCanvasElement}} multi gfx/mp_menu.lmp (source of "c" from TCP/IP)
 * @param {?{canvas: HTMLCanvasElement}} network gfx/netmen4.lmp (source of "t")
 * @param {function(): HTMLCanvasElement} makeCanvas makes the output canvas
 * @returns {?{width: number, height: number, canvas: HTMLCanvasElement}} a picture as wide as sp_menu and 100 pixels
 *  tall (five 20-pixel menu cells); null when any source picture is missing
 */
export function BuildSinglePlayerMenuArt( single, main, multi, network, makeCanvas ) {

	if ( ! single?.canvas || ! main?.canvas || ! multi?.canvas || ! network?.canvas ) return null;
	const canvas = makeCanvas();
	canvas.width = single.width;
	canvas.height = 100; // five existing 20-pixel menu cells
	const ctx = canvas.getContext( '2d' );
	ctx.imageSmoothingEnabled = false;
	const glyph = ( pic, sx, sy, w, h, x, y ) => ctx.drawImage( pic.canvas, sx, sy, w, h, x, y, w, h );

	// Original New Game / Load / Save, including their authored spacing. The
	// native rows are drawn unchanged at y20; the last four are blank padding.
	// Newer's G descends into empty space above the following word's small caps.
	glyph( single, 0, 0, single.width, single.height, 0, 20 );

	// New + e + r, then the intact Game word. The final E in Game and R in
	// Player have clean source bounds, unlike letters kerned into neighbours.
	glyph( single, 0, 0, 66, 16, 0, 0 );
	glyph( single, 129, 2, 16, 13, 68, 3 );
	glyph( main, 200, 2, 20, 13, 86, 3 );
	glyph( single, 71, 0, 74, 22, 112, 0 );

	// Level Select: capital L/S from Load/Save, small L from Help, C from
	// TCP/IP and T from Setup. Small capitals share y95; V/T retain their tips.
	glyph( single, 2, 21, 19, 16, 2, 81 );
	glyph( single, 129, 2, 16, 13, 22, 83 );
	// Save's V overlaps A's right flank. Copy only the V's authored silhouette,
	// rather than carrying that A fragment into the middle of "Level".
	const vLeft = [ 32, 32, 33, 34, 35, 35, 36, 37, 37, 38, 39, 39, 40, 41 ];
	for ( let row = 0; row < vLeft.length; row ++ ) {

		const sx = vLeft[ row ];
		glyph( single, sx, 43 + row, 51 - sx, 1, 40 + sx - 32, 83 + row );

	}
	glyph( single, 129, 2, 16, 13, 61, 83 );
	glyph( main, 40, 63, 17, 13, 79, 83 );
	glyph( single, 2, 41, 18, 16, 106, 81 );
	glyph( single, 129, 2, 16, 13, 126, 83 );
	glyph( main, 40, 63, 17, 13, 144, 83 );
	glyph( single, 129, 2, 16, 13, 163, 83 );
	glyph( network, 16, 6, 14, 12, 181, 84 );
	glyph( multi, 40, 43, 18, 16, 197, 83 );

	return { width: canvas.width, height: canvas.height, canvas };

}
