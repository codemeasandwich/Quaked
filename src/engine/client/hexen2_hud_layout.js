/**
 * @module engine/client/hexen2_hud_layout
 *
 * The native status bar's geometry and number layout, as pure functions: a 320x200 bar scaled by screen width and
 * anchored to the bottom, and Sbar_DrawNum's right-aligned field (13 px per `num_*.lmp` picture, shorter numbers
 * shifted right by half the unused field). Extracted so the behaviour the owner compared against native can be tested
 * without a canvas.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; non-finite geometry yields the identity transform.
 */

/**
 * The overlay transform for the native bar.
 *
 * @param {number} width canvas width in pixels
 * @param {number} height canvas height in pixels
 * @returns {{ scale: number, offsetX: number, offsetY: number }} scale and translation to apply to 320x200 coordinates
 */
export function Hexen2_HudTransform( width, height ) {

	if ( !Number.isFinite( width ) || !Number.isFinite( height ) || width <= 0 || height <= 0 )
		return { scale: 1, offsetX: 0, offsetY: 0 };
	const scale = width / 320;
	return { scale, offsetX: 0, offsetY: height - 200 * scale };

}

/** The width in 320x200 units of one native number picture and the gap to the next (Sbar_DrawNum). */
export const HEXEN2_NUM_ADVANCE = 13;

/**
 * Sbar_DrawNum's text and horizontal placement.
 *
 * @param {number} value the number to show
 * @param {number} digits the field width in digits
 * @returns {{ text: string, xOffset: number }} the characters drawn and the x shift (0 when the field is full)
 */
export function Hexen2_NumberLayout( value, digits ) {

	const text = String( value | 0 );
	const count = Math.max( 1, digits | 0 );
	const shown = text.length > count ? text.slice( text.length - count ) : text;
	const xOffset = shown.length < count ? Math.floor( ( count - shown.length ) * HEXEN2_NUM_ADVANCE / 2 ) : 0;
	return { text: shown, xOffset };

}
