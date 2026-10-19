/**
 * @module engine/common/hexen2_charset
 *
 * How many 8-pixel columns a charset sheet has: Quake's WAD `conchars` and Hexen II's `gfx/menu/conchars.lmp`
 * (256x128, 32 columns) differ, and reading Hexen's as 128x128 scrambled every glyph. Pure so the loader decision can be
 * tested without a canvas.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; too-short data returns 0.
 */

/**
 * The column count for a charset sheet.
 *
 * @param {number} byteLength sheet length in bytes (8-bit pixels)
 * @returns {number} 32 for a 256x128 sheet, 16 for 128x128, 0 when too short
 */
export function Hexen2_CharsetColumns( byteLength ) {

	if ( !Number.isFinite( byteLength ) ) return 0;
	if ( byteLength >= 256 * 128 ) return 32;
	if ( byteLength >= 128 * 128 ) return 16;
	return 0;

}


/**
 * The native `Draw_SmallCharacter` glyph index for a character code.
 *
 * @param {number} num the character code
 * @returns {number} the 0..127 glyph index (0 means blank)
 */
export function Hexen2_SmallFontIndex( num ) {

	if ( num < 32 ) return 0;
	if ( num >= 97 && num <= 122 ) return num - 64;
	if ( num > 95 ) return 0;
	return num - 32;

}
