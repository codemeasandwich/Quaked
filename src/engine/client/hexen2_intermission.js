/**
 * @module engine/client/hexen2_intermission
 *
 * Reads the Hexen II gamecode's intermission hand-off from the native globals. The page owns the pixel screen and the
 * reload; this pure helper keeps the `intermission_running`/`nextmap`/`nextstartspot` contract testable without a DOM.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none; missing globals read as inactive/empty.
 */

/**
 * @param {{ intermission_running?: number, nextmap?: number, nextstartspot?: number }} globals the progs globals
 * @param {function(number): string} getString resolves a progs string offset
 * @returns {{ active: boolean, nextMap: string, nextSpot: string }} the hand-off state
 */
export function Hexen2_IntermissionStatus( globals, getString ) {

	const read = value => {

		try { return typeof getString === 'function' ? String( getString( value | 0 ) ?? '' ) : ''; } catch { return ''; }

	};
	return {
		active: ( globals?.intermission_running | 0 ) > 0,
		nextMap: read( globals?.nextmap ),
		nextSpot: read( globals?.nextstartspot )
	};

}
