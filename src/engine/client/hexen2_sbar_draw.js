/**
 * @module engine/client/hexen2_sbar_draw
 *
 * Executes a status-bar operation list through a drawing layer: pictures by their supplied names (the host maps them
 * through `Draw_CachePic`/`Draw_Pic`), numbers through the native digit pictures and small text through the small
 * font. Kept separate from the layout so the same operations run under the browser canvas or a test double.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; an operation the layer cannot draw is counted as skipped.
 */

/**
 * @param {ReadonlyArray<object>} ops operations from `Hexen2_StatusBarOps` or `Hexen2_InventoryOps`
 * @param {{ pic: function(string, number, number, string): boolean, num?: function(number, number, number, number): void,
 *   small?: function(string, number, number): void, white?: function(string, number, number): void }} draw the drawing
 *   layer; `pic` returns false for a missing picture
 * @returns {{ drawn: number, skipped: number }} what was drawn and what the layer skipped
 */
export function Hexen2_DrawStatusBar( ops, draw ) {

	let drawn = 0, skipped = 0;
	for ( const op of ops ) {

		if ( op.kind === 'pic' || op.kind === 'transpic' ) {

			if ( draw.pic( op.name, op.x, op.y, op.kind ) ) drawn ++;
			else skipped ++;

		} else if ( op.kind === 'num' ) {

			if ( typeof draw.num === 'function' ) { draw.num( op.value, op.digits, op.x, op.y ); drawn ++; }
			else skipped ++;

		} else if ( op.kind === 'small' ) {

			if ( typeof draw.small === 'function' ) { draw.small( op.text, op.x, op.y ); drawn ++; }
			else skipped ++;

		} else if ( op.kind === 'white' ) {

			if ( typeof draw.white === 'function' ) { draw.white( op.text, op.x, op.y ); drawn ++; }
			else skipped ++;

		} else skipped ++;

	}
	return { drawn, skipped };

}
